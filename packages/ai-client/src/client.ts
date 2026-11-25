// createAiClient：找端點 → 檢查輸入與大小 → 組請求 → 送出 → 串流與逾時 → 重試 → 結果（docs/tasks/ai-client.md〈5〉〈7〉）。
import { encodeBody } from './body.ts';
import { BUILTIN_CATALOG, isAllowedUrl, isLocalUrl, mergeCatalog, validateCatalog, type CatalogOverrides, type CatalogProblem } from './catalog.ts';
import { DIALECTS } from './dialects/index.ts';
import type { Dialect, NormalizedMessage, Output, ParsedError } from './dialects/types.ts';
import { AiError, asError, describeThrown, isAiError, withSecrets, type AiErrorKind } from './errors.ts';
import { costOf } from './pricing.ts';
import { MIN_SECRET_LENGTH, redactDeep, redactText, StreamRedactor } from './redact.ts';
import { SseDecoder, type SseEvent } from './sse.ts';
import { bodyChunks, defaultFetch, readText, type FetchLike } from './transport.ts';
import {
  REASONING_LEVELS,
  type AttemptTrace, type AuthSpec, type ContentPart, type EndpointRef, type GenerateRequest, type GenerateResult, type InputKind,
  type ModelInfo, type ModelSpec, type ProgressEvent, type ProviderOptions, type ProviderSpec, type ReasoningLevel, type ReasoningSpec,
} from './types.ts';

const DEFAULT_TIMEOUT_MS = 30 * 60_000;
const CHECK_TIMEOUT_MS = 30_000;
/** 最多送幾次（含第一次），也是上限。 */
const DEFAULT_MAX_ATTEMPTS = 3;
/** 第 n 次失敗後等多久（再加減 20%）。 */
const BACKOFF_MS = [2_000, 8_000];
/** 服務要求等超過這個時間就不重試，把等待時間交給呼叫端（錯誤的 retryAfterMs）。 */
const MAX_RETRY_AFTER_MS = 60_000;
const ERROR_BODY_MAX_BYTES = 64 * 1024;
/** 錯誤本文多久沒資料就不等了（呼叫端設了閒置逾時就用它）：照狀態碼分類，不等到整體逾時（L2 R9）。 */
const ERROR_BODY_IDLE_MS = 30_000;
/** 預設的回應標頭逾時：120 秒，加上每 100 KB 本文 1 秒的上傳時間。 */
const RESPONSE_TIMEOUT_BASE_MS = 120_000;
const UPLOAD_BYTES_PER_SECOND = 100_000;

export interface Clock {
  now(): number;
  /** 等 ms 毫秒；signal 中止時立刻結束（丟例外）。 */
  sleep(ms: number, signal: AbortSignal): Promise<void>;
  random(): number;
}

export interface AiClientOptions {
  /** 和標準 fetch 同形狀的函式；不給就用執行環境的 fetch。 */
  fetch?: FetchLike;
  /**
   * 送出後多久沒拿到回應標頭就停下，丟 timeout、不自動重送（服務可能已經在做，L2 R7）。預設 120 秒加每 100 KB 本文 1 秒。
   * 傳輸層要等整段本文收完才交出 Response 的（例如 Obsidian 的 requestUrl）要設 null。
   */
  responseTimeoutMs?: number | null;
  /** 加廠商或蓋掉目錄的欄位（例如更新價格），格式同 catalog.json；每筆只寫要改的欄位。 */
  catalog?: CatalogOverrides;
  /** 測試用：時間、等待與隨機。 */
  clock?: Partial<Clock>;
}

export interface CheckRequest {
  endpoint: EndpointRef;
  apiKey?: string;
  signal?: AbortSignal;
  timeoutMs?: number;
}

/** models：服務列得出來的模型；用 checkPath 測的服務是 null。 */
export type CheckResult = { ok: true; models: ModelInfo[] | null } | { ok: false; error: AiError };

export interface AiClient {
  generate(request: GenerateRequest): Promise<GenerateResult>;
  /** 測試連線：讀模型清單（或目錄的 checkPath）確認金鑰，不產生內容、不花錢。 */
  check(request: CheckRequest): Promise<CheckResult>;
  /** 目錄裡的廠商與模型（設定頁的選單用）。整份是凍結的，改了會丟例外；要加或改廠商用 createAiClient 的 catalog。 */
  providers(): readonly ProviderSpec[];
  /** 目錄裡被跳過的資料。 */
  readonly catalogProblems: readonly CatalogProblem[];
}

interface Resolved {
  providerId: string;
  dialect: Dialect;
  baseUrl: string;
  auth: AuthSpec | null;
  headers: Record<string, string>;
  options: ProviderOptions;
  limits: NonNullable<ProviderSpec['limits']>;
  model: ModelSpec | undefined;
  /** 這一家目錄裡的模型：服務回報別的模型時拿來估價（L2 第二輪 R13）。 */
  models: readonly ModelSpec[];
  inputs: InputKind[] | undefined;
  reasoning: ReasoningSpec | undefined;
  maxOutputTokens: number | undefined;
}

const defaultClock: Clock = {
  now: () => Date.now(),
  sleep: (ms, signal) => new Promise((resolve, reject) => {
    if (signal.aborted) { reject(new Error('aborted')); return; }
    const onAbort = () => { clearTimeout(timer); reject(new Error('aborted')); };
    const timer = later(() => { signal.removeEventListener('abort', onAbort); resolve(); }, ms);
    signal.addEventListener('abort', onAbort, { once: true });
  }),
  random: () => Math.random(),
};

type Init = ConstructorParameters<typeof AiError>[0];
const fail = (kind: AiErrorKind, message: string, extra: Partial<Init> = {}) => new AiError({ kind, message, ...extra });

export function createAiClient(options: AiClientOptions = {}): AiClient {
  const doFetch = options.fetch ?? defaultFetch;
  const clock: Clock = { ...defaultClock, ...options.clock };
  const dialectIds = new Set(DIALECTS.keys());
  const base = validateCatalog(BUILTIN_CATALOG, dialectIds);
  const overrides = mergeCatalog(base.catalog, options.catalog);
  const merged = validateCatalog(overrides.catalog, dialectIds);
  merged.problems.unshift(...overrides.problems);
  // 送出端用的目錄是自己的一份、凍結的：providers() 交出去的改不動，呼叫端事後改自己傳的 catalog 也影響不到（L2 R2）。
  const catalog = deepFreeze(structuredClone(merged.catalog));
  const problems = deepFreeze(structuredClone([...base.problems, ...merged.problems.filter(p => !base.problems.some(b => b.provider === p.provider && b.model === p.model))]));

  function resolve(endpoint: EndpointRef, modelId: string | null): Resolved {
    if ('custom' in endpoint) {
      const custom = endpoint.custom;
      const dialect = DIALECTS.get(custom.dialect);
      if (!dialect) throw fail('invalid_request', `unknown dialect: ${custom.dialect}`);
      if (!isAllowedUrl(custom.baseUrl)) throw fail('invalid_request', 'baseUrl must be https, or http on localhost');
      return {
        providerId: 'custom', dialect, baseUrl: custom.baseUrl.replace(/\/+$/, ''),
        auth: custom.auth === undefined ? dialect.defaultAuth : custom.auth,
        headers: custom.headers ?? {}, options: custom.options ?? {}, limits: {},
        model: undefined, models: [], inputs: undefined, reasoning: undefined, maxOutputTokens: undefined,
      };
    }
    const provider = catalog.providers.find(p => p.id === endpoint.provider);
    if (!provider) throw fail('invalid_request', `unknown provider: ${endpoint.provider}`);
    const dialect = DIALECTS.get(provider.dialect) as Dialect;
    const model = modelId === null ? undefined : provider.models.find(m => m.id === modelId);
    return {
      providerId: provider.id, dialect, baseUrl: provider.baseUrl.replace(/\/+$/, ''), auth: provider.auth,
      headers: provider.headers ?? {}, options: provider.options ?? {}, limits: provider.limits ?? {}, model, models: provider.models,
      inputs: model?.inputs ?? provider.defaults?.inputs,
      reasoning: model?.reasoning ?? provider.defaults?.reasoning,
      maxOutputTokens: model?.maxOutputTokens ?? provider.defaults?.maxOutputTokens,
    };
  }

  /** 標頭：方言的、目錄的、呼叫端加的，最後是認證（蓋不掉）。 */
  function headersFor(r: Resolved, apiKey: string | undefined, dialectHeaders: Record<string, string> | undefined, extra: Record<string, string> | undefined): Record<string, string> {
    const headers: Record<string, string> = { ...lower(r.headers), ...lower(extra), ...lower(dialectHeaders) };
    if (r.auth) {
      if (!apiKey) throw fail('auth', 'no API key given', { provider: r.providerId });
      headers[r.auth.header.toLowerCase()] = r.auth.scheme ? `${r.auth.scheme} ${apiKey}` : apiKey;
    }
    return headers;
  }

  /** 唯一的錯誤出口：每個丟給呼叫端的錯誤都再遮一次金鑰（L2 第二輪 延續 R1）。 */
  async function generate(request: GenerateRequest): Promise<GenerateResult> {
    try {
      return await generateOnce(request);
    } catch (caught) {
      const secrets = request.apiKey ? [request.apiKey] : [];
      throw isAiError(caught) ? withSecrets(caught, secrets) : fail('unknown', describeThrown(caught), { secrets, cause: caught });
    }
  }

  async function generateOnce(request: GenerateRequest): Promise<GenerateResult> {
    const secrets = request.apiKey ? [request.apiKey] : [];
    checkNumbers({
      maxAttempts: request.maxAttempts, timeoutMs: request.timeoutMs, idleTimeoutMs: request.idleTimeoutMs,
      maxOutputTokens: request.maxOutputTokens, responseTimeoutMs: options.responseTimeoutMs,
    });
    if (request.maxOutputTokens != null && !(Number.isInteger(request.maxOutputTokens) && request.maxOutputTokens > 0)) {
      throw fail('invalid_request', 'maxOutputTokens must be a positive integer');
    }
    const startedAt = clock.now();
    const r = resolve(request.endpoint, request.model);
    checkKey(r, request.apiKey);
    const input = normalize(request.input);
    checkInputs(r, input, request.checkInputs !== false);
    const warnings: string[] = [];
    const call = r.dialect.buildGenerate({
      baseUrl: r.baseUrl, model: request.model, instructions: request.instructions, input,
      maxOutputTokens: request.maxOutputTokens ?? r.maxOutputTokens, options: r.options,
    });
    const body = call.body ?? {};
    let reasoningSent = applyReasoning(body, r.reasoning, request.reasoning, warnings);
    if (request.extraBody) {
      // 模型用 request.model（目錄、費用、證據都照它）；套件一律要求串流（L2 R13）。
      for (const key of ['model', 'stream']) {
        if (Object.hasOwn(request.extraBody, key)) throw fail('invalid_request', `extraBody cannot set ${key}`, { provider: r.providerId });
      }
      deepMerge(body, request.extraBody);
      // 逃生口改了哪些欄位一律記下：目錄沒登錄的推理寫法也查得到（L2 R13）。只記路徑，不記值。
      const paths = leafPaths(request.extraBody);
      if (paths.length > 0) warnings.push(`extraBody set: ${paths.join(', ')}`);
      // trace 記實際送出的推理參數：extraBody 蓋掉或自己送了，就照合併後的本文（GitHub 審查 P2）。
      if (r.reasoning) {
        const actual = sentValue(getPath(body, r.reasoning.path));
        if (actual !== reasoningSent) {
          warnings.push(`reasoning set by extraBody: ${String(actual)}`);
          reasoningSent = actual;
        }
      }
    }
    const bytes = encodeBody(body);
    checkSize(r, input, bytes.length);
    const headers = headersFor(r, request.apiKey, call.headers, request.extraHeaders);
    headers['content-type'] = 'application/json';
    headers.accept = 'text/event-stream';

    const timeoutMs = request.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const deadline = startedAt + timeoutMs;
    const responseTimeoutMs = options.responseTimeoutMs === undefined
      ? RESPONSE_TIMEOUT_BASE_MS + Math.ceil(bytes.length / UPLOAD_BYTES_PER_SECOND) * 1000
      : options.responseTimeoutMs;
    // 共最多 3 次（〈7〉第 5 點，L2 R6）：呼叫端只能調少，不能調多。
    const maxAttempts = Math.min(DEFAULT_MAX_ATTEMPTS, Math.max(1, Math.floor(request.maxAttempts ?? DEFAULT_MAX_ATTEMPTS)));
    const attempts: AttemptTrace[] = [];
    const progress = (event: ProgressEvent) => {
      try {
        request.onProgress?.(event);
      } catch {
        if (!warnings.includes('onProgress threw; ignored')) warnings.push('onProgress threw; ignored');
      }
    };
    if (request.signal?.aborted) throw fail('cancelled', 'cancelled before sending', { provider: r.providerId });

    for (let attempt = 1; ; attempt++) {
      try {
        const { output, requestId } = await runAttempt(attempt);
        if (!output.text && (output.stopReason === 'content_filter' || output.stopReason === 'refusal')) {
          // 已經拿到 2xx，服務可能已經計費：afterResponse，不自動重送（L2 R12）。
          throw fail('content_blocked', `no output: ${output.rawStopReason ?? output.stopReason}`, { provider: r.providerId, requestId, providerCode: output.rawStopReason, secrets, afterResponse: true });
        }
        progress({ type: 'done' });
        // 服務說回答的是目錄裡另一個模型（相容服務、代理、路由換了模型）：照回答的那一個估價；不認得的（快照名稱）照請求的（L2 第二輪 R13）。
        const answered = output.resolvedModel === null ? undefined : r.models.find(m => m.id === output.resolvedModel);
        const pricedBy = answered ?? r.model;
        if (answered && answered !== r.model) warnings.push(`cost priced as ${answered.id}: the service reported a different model than requested`);
        // 服務回送的字串裡有金鑰就遮掉（L2 R1）：文字、編號、模型名稱、warnings 都在這一處。
        return redactResult({
          text: output.text,
          stopReason: output.stopReason,
          usage: output.usage,
          cost: output.reportedCost !== null
            ? { amount: output.reportedCost, currency: 'USD', estimated: false, pricesAsOf: null }
            : costOf(output.usage, pricedBy, dayOf(startedAt)),
          message: { role: 'assistant', content: [{ type: 'text', text: output.text }] },
          trace: {
            provider: r.providerId, dialect: r.dialect.id, host: new URL(call.url).host, requestedModel: request.model,
            resolvedModel: output.resolvedModel, requestId, responseId: output.responseId,
            reasoningSent, rawStopReason: output.rawStopReason,
            startedAt: new Date(startedAt).toISOString(), finishedAt: new Date(clock.now()).toISOString(),
            attempts, warnings: [...warnings, ...output.warnings],
          },
        }, secrets);
      } catch (caught) {
        const error = isAiError(caught) ? caught : fail('unknown', describeThrown(caught), { secrets, cause: caught, provider: r.providerId });
        error.attempts = attempt;
        // 只在還沒拿到成功的回應時自動重送：拿到 200 之後才斷，推理可能已經算錢了，交給呼叫端問使用者。
        if (!error.retryable || error.afterResponse || attempt >= maxAttempts) throw error;
        if (error.retryAfterMs !== null && error.retryAfterMs > MAX_RETRY_AFTER_MS) throw error;
        const backoff = BACKOFF_MS[Math.min(attempt - 1, BACKOFF_MS.length - 1)];
        const delayMs = error.retryAfterMs ?? Math.round(backoff * (0.8 + 0.4 * clock.random()));
        if (clock.now() + delayMs >= deadline) throw error;
        const waitAbort = new AbortController();
        const onCancel = () => waitAbort.abort();
        request.signal?.addEventListener('abort', onCancel, { once: true });
        progress({ type: 'retrying', attempt: attempt + 1, delayMs, reason: error.kind });
        try {
          // 回呼裡取消的，不等、不再送（L2 R8）。
          if (request.signal?.aborted) throw new Error('cancelled');
          await clock.sleep(delayMs, waitAbort.signal);
          if (request.signal?.aborted) throw new Error('cancelled');
        } catch {
          const cancelled = fail('cancelled', 'cancelled while waiting to retry', { provider: r.providerId });
          cancelled.attempts = attempt;
          throw cancelled;
        } finally {
          request.signal?.removeEventListener('abort', onCancel);
        }
      }
    }

    async function runAttempt(attempt: number): Promise<{ output: Output; requestId: string | null }> {
      const log: AttemptTrace = { startedAt: new Date(clock.now()).toISOString(), status: null, requestId: null, error: null };
      attempts.push(log);
      const controller = new AbortController();
      let reason: 'timeout' | 'idle' | 'response' | 'cancelled' | null = null;
      const abort = (why: NonNullable<typeof reason>) => {
        if (reason) return;
        reason = why;
        controller.abort();
      };
      const onCancel = () => abort('cancelled');
      request.signal?.addEventListener('abort', onCancel, { once: true });
      if (request.signal?.aborted) abort('cancelled');
      const remaining = deadline - clock.now();
      const overall = later(() => abort('timeout'), remaining);
      const waitHeaders = responseTimeoutMs === null ? undefined : later(() => abort('response'), responseTimeoutMs);
      let idle: ReturnType<typeof setTimeout> | undefined;
      const touch = () => {
        if (request.idleTimeoutMs === undefined) return;
        clearTimeout(idle);
        idle = later(() => abort('idle'), request.idleTimeoutMs);
      };
      let text = '';
      let gotResponse = false;
      let response: Response | undefined;
      const meta = () => ({ provider: r.providerId, requestId: log.requestId, secrets, partialText: text || null, afterResponse: gotResponse });
      /**
       * 每個進度回呼之後：呼叫端取消了就停，取消優先於其他原因；已經逾時也停（L2 R8、第二輪）。
       * 丟的例外由 catch 換成 cancelled 或 timeout。
       */
      const stopIfAborted = () => {
        if (request.signal?.aborted) abort('cancelled');
        if (reason) throw new Error(`stopped: ${reason}`);
      };
      try {
        if (remaining <= 0) abort('timeout');
        stopIfAborted();
        progress({ type: 'sent', attempt });
        // 同步的回呼可能拖過整體期限，計時器在送出前沒機會跑：送出前再看一次時間（L2 第二輪 R8）。
        if (clock.now() >= deadline) abort('timeout');
        stopIfAborted();
        response = await untilAbort(
          doFetch(call.url, { method: 'POST', headers, body: bytes, signal: controller.signal, redirect: 'error' }), controller.signal, cancelBody);
        clearTimeout(waitHeaders);
        log.status = response.status;
        log.requestId = r.dialect.requestIdHeader ? response.headers.get(r.dialect.requestIdHeader) : null;
        if (response.status < 200 || response.status >= 300) {
          const errorBody = await readErrorBody(response, controller.signal, request.idleTimeoutMs ?? ERROR_BODY_IDLE_MS);
          throw toError(r.dialect.classifyError(response.status, errorBody), response.status, retryAfterOf(response.headers), meta());
        }
        gotResponse = true;
        touch();
        progress({ type: 'waiting', attempt });
        stopIfAborted();
        // 每收到一段本文就重設閒置計時：串流與服務改回 JSON 時都一樣（GitHub 審查 P2）。
        const chunks = touching(abortable(bodyChunks(response, controller.signal), controller.signal), touch);
        // 媒體類型不分大小寫（L2 R12）。
        if ((response.headers.get('content-type') ?? '').toLowerCase().includes('application/json')) {
          // 服務沒照要求串流。
          const raw = await readText(chunks);
          let json: unknown;
          try {
            json = JSON.parse(raw) as unknown;
          } catch {
            throw fail('server', 'response is not JSON', meta());
          }
          const parsed = r.dialect.parseResponse(json);
          if ('error' in parsed) throw toError(parsed.error, response.status, null, meta());
          // 交出去的文字也算收到了：之後取消，partialText 帶著它（L2 第二輪 R8）。
          text = parsed.text;
          const shown = redactText(parsed.text, secrets);
          if (shown) progress({ type: 'text', delta: shown, totalChars: shown.length });
          stopIfAborted();
          return { output: parsed, requestId: log.requestId };
        }
        const decoder = new SseDecoder();
        const parser = r.dialect.createStreamParser();
        const visible = new StreamRedactor(secrets);
        let events = 0;
        const handle = (event: SseEvent) => {
          events++;
          let step: ReturnType<typeof parser.push>;
          try {
            step = parser.push(event);
          } catch {
            throw fail('server', `malformed stream event: ${event.data.slice(0, 100)}`, meta());
          }
          if (step.error) throw toError(step.error, null, null, meta());
          if (step.delta && !reason) {
            text += step.delta;
            const shown = visible.push(step.delta);
            if (shown) progress({ type: 'text', delta: shown, totalChars: visible.length });
          }
        };
        let lingered = false;
        try {
          read: for await (const chunk of chunks) {
            for (const event of decoder.push(chunk)) {
              handle(event);
              // 服務說傳完了：不等它關串流（L2 R10）。
              if (parser.ended) break read;
            }
          }
          if (!parser.ended) for (const event of decoder.end()) handle(event);
        } catch (caught) {
          // 已經看到做完的訊號、只是串流一直沒關（沒有結束事件的格式、代理沒關）：逾時時照已收到的交回，不讓已經付過錢的結果作廢（L2 R10）。
          if (!(parser.complete && (reason === 'idle' || reason === 'timeout'))) throw caught;
          lingered = true;
          warnings.push(`stream stayed open after the response was complete; stopped by the ${reason === 'idle' ? 'idle' : 'overall'} timeout`);
        }
        // 本文好好結束卻一個事件都沒有：不是串流斷了，是收到別的東西（代理的登入頁、純文字），算 server（L2 第二輪 R12）。
        if (!parser.complete && events === 0) throw fail('server', 'response is not an event stream', meta());
        if (!parser.complete) throw fail('network', 'stream ended before the response was complete', meta());
        const tail = visible.end();
        if (tail) progress({ type: 'text', delta: tail, totalChars: visible.length });
        // 已經逾時（做完沒關）的照已收到的交回；但補交最後一段時呼叫端取消了，仍是取消（L2 第二輪 R8、R10）。
        if (!lingered || request.signal?.aborted) stopIfAborted();
        return { output: parser.result(), requestId: log.requestId };
      } catch (caught) {
        const error = reason === 'cancelled' || request.signal?.aborted ? fail('cancelled', 'cancelled', meta())
          : reason === 'timeout' ? fail('timeout', `timed out after ${timeoutMs} ms`, meta())
          : reason === 'idle' ? fail('timeout', `no data for ${request.idleTimeoutMs} ms`, meta())
          // 請求已經送出、服務可能已經在做（或中間的代理把串流整段收完才交），重送可能讓同一件事做兩次、付兩次錢（L2 R7）。
          : reason === 'response' ? fail('timeout', `no response headers within ${responseTimeoutMs} ms`, meta())
          : isAiError(caught) ? caught
          : fail('network', describeThrown(caught), { ...meta(), cause: caught });
        log.error = error.kind;
        throw error;
      } finally {
        clearTimeout(overall);
        clearTimeout(waitHeaders);
        clearTimeout(idle);
        request.signal?.removeEventListener('abort', onCancel);
        // 不論成功或失敗都放掉連線；之後才到的資料不會交給呼叫端。還沒開始讀的本文也取消（L2 R9）。
        controller.abort();
        if (response) cancelBody(response);
      }
    }
  }

  async function check(request: CheckRequest): Promise<CheckResult> {
    const secrets = request.apiKey ? [request.apiKey] : [];
    let r: Resolved;
    try {
      checkNumbers({ timeoutMs: request.timeoutMs });
      r = resolve(request.endpoint, null);
      checkKey(r, request.apiKey);
    } catch (caught) {
      if (isAiError(caught)) return { ok: false, error: caught };
      throw caught;
    }
    const usePath = r.options.checkPath;
    const call = usePath ? { url: `${r.baseUrl}/${usePath.replace(/^\/+/, '')}`, headers: r.dialect.buildListModels(r.baseUrl).headers } : r.dialect.buildListModels(r.baseUrl);
    const controller = new AbortController();
    let reason: 'timeout' | 'cancelled' | null = null;
    const onCancel = () => { reason = 'cancelled'; controller.abort(); };
    request.signal?.addEventListener('abort', onCancel, { once: true });
    const limit = request.timeoutMs ?? CHECK_TIMEOUT_MS;
    const timer = later(() => { reason = 'timeout'; controller.abort(); }, limit);
    let requestId: string | null = null;
    try {
      if (request.signal?.aborted) throw fail('cancelled', 'cancelled before sending');
      if (limit <= 0) throw fail('timeout', 'timed out before sending', { provider: r.providerId, secrets });
      const headers = headersFor(r, request.apiKey, call.headers, undefined);
      headers.accept = 'application/json';
      const response = await untilAbort(doFetch(call.url, { method: 'GET', headers, signal: controller.signal, redirect: 'error' }), controller.signal, cancelBody);
      requestId = r.dialect.requestIdHeader ? response.headers.get(r.dialect.requestIdHeader) : null;
      const meta = { provider: r.providerId, requestId, secrets };
      if (response.status < 200 || response.status >= 300) {
        // 和生成共用讀錯誤本文的方式：一樣的上限，一樣照狀態碼分類（L2 第二輪 R9）。
        const errorBody = await readErrorBody(response, controller.signal, ERROR_BODY_IDLE_MS);
        throw toError(r.dialect.classifyError(response.status, errorBody), response.status, retryAfterOf(response.headers), meta);
      }
      const raw = await untilAbort(readText(abortable(bodyChunks(response, controller.signal), controller.signal), ERROR_BODY_MAX_BYTES * 64), controller.signal);
      // 已經拿到 2xx：形狀不對時不是「可以安全重送」（L2 第二輪 R12）。
      const after = { ...meta, afterResponse: true };
      let json: unknown;
      try {
        json = JSON.parse(raw) as unknown;
      } catch {
        // 代理的登入頁這類 200 HTML 不算連上了（L2 R12）。
        throw fail('server', 'response is not JSON', after);
      }
      if (typeof json !== 'object' || json === null || Array.isArray(json) || 'error' in json) throw fail('server', 'unexpected check response shape', after);
      if (usePath) return { ok: true, models: null };
      const models = r.dialect.parseModels(json);
      if (!models) throw fail('server', 'unexpected model list shape', after);
      return { ok: true, models: redactDeep(models, secrets) };
    } catch (caught) {
      const meta = { provider: r.providerId, requestId, secrets };
      const error = reason === 'cancelled' ? fail('cancelled', 'cancelled', meta)
        : reason === 'timeout' ? fail('timeout', 'timed out', meta)
        : isAiError(caught) ? caught
        : fail('network', describeThrown(caught), { ...meta, cause: caught });
      return { ok: false, error: withSecrets(error, secrets) };
    } finally {
      clearTimeout(timer);
      request.signal?.removeEventListener('abort', onCancel);
      controller.abort();
    }
  }

  return { generate, check, providers: () => catalog.providers, catalogProblems: problems };
}

/**
 * 結果裡服務回的字串才遮：文字、模型名稱、編號、停止原因、warnings。結構與固定的值（role、type、方言、主機）不動，
 * 金鑰剛好等於那些字時，message 仍能原樣放回下一輪（L2 第二輪 R1 修正引入）。
 */
function redactResult(result: GenerateResult, secrets: readonly string[]): GenerateResult {
  const r = (s: string) => redactText(s, secrets);
  const maybe = (s: string | null) => (s === null ? null : r(s));
  const text = r(result.text);
  return {
    ...result,
    text,
    message: { role: 'assistant', content: [{ type: 'text', text }] },
    trace: {
      ...result.trace,
      resolvedModel: maybe(result.trace.resolvedModel), requestId: maybe(result.trace.requestId), responseId: maybe(result.trace.responseId),
      rawStopReason: maybe(result.trace.rawStopReason), warnings: result.trace.warnings.map(r),
      attempts: result.trace.attempts.map(a => ({ ...a, requestId: maybe(a.requestId) })),
    },
  };
}

/** setTimeout 的上限（約 24.8 天）：超過的會被當成 1 ms 立刻到，所以很長的期限照上限算（L2 第二輪 R6）。 */
const MAX_TIMER_MS = 2_147_483_647;
const later = (fn: () => void, ms: number): ReturnType<typeof setTimeout> => setTimeout(fn, Math.min(MAX_TIMER_MS, Math.max(0, ms)));

// ── 送出前 ──

/**
 * 短於 8 個字的金鑰只准送到本機（L2 第三輪 延續 R1）：這麼短的不會是真的金鑰，遮了又會改掉正常的字，
 * 所以不遮；改成不讓它離開這台電腦。各家真的金鑰都是幾十個字，送到遠端的一律遮得到。
 */
function checkKey(r: Resolved, apiKey: string | undefined): void {
  if (!r.auth || !apiKey || apiKey.length >= MIN_SECRET_LENGTH || isLocalUrl(r.baseUrl)) return;
  throw fail('invalid_request', `API key is shorter than ${String(MIN_SECRET_LENGTH)} characters; keys that short are only sent to localhost`, { provider: r.providerId });
}

/** 數字欄位：給了就要是有限的數字。NaN 讓次數上限失效、Infinity 與字串讓計時器立刻到（L2 第二輪 R6）。沒給或 null 照預設。 */
function checkNumbers(fields: Record<string, unknown>): void {
  for (const [name, value] of Object.entries(fields)) {
    if (value != null && !(typeof value === 'number' && Number.isFinite(value))) throw fail('invalid_request', `${name} must be a finite number`);
  }
}

function normalize(input: GenerateRequest['input']): NormalizedMessage[] {
  if (!Array.isArray(input) || input.length === 0) throw fail('invalid_request', 'input must have at least one message');
  return input.map(m => ({ role: m.role, content: typeof m.content === 'string' ? [{ type: 'text', text: m.content }] : m.content }));
}

const kindOf = (part: ContentPart): InputKind => (part.type === 'file' ? 'pdf' : part.type);

function checkInputs(r: Resolved, input: NormalizedMessage[], useCatalog: boolean): void {
  for (const message of input) {
    for (const part of message.content) {
      if (part.type === 'file' && part.mediaType !== 'application/pdf') throw fail('unsupported_input', `only PDF files are supported, got ${part.mediaType}`, { provider: r.providerId });
      if (part.type === 'image' && !part.mediaType.startsWith('image/')) throw fail('unsupported_input', `not an image type: ${part.mediaType}`, { provider: r.providerId });
      if (useCatalog && r.inputs && !r.inputs.includes(kindOf(part))) throw fail('unsupported_input', `this model does not accept ${kindOf(part)}`, { provider: r.providerId });
    }
  }
}

function checkSize(r: Resolved, input: NormalizedMessage[], bodyBytes: number): void {
  const files = input.flatMap(m => m.content).filter(p => p.type === 'file');
  const fileBytes = files.reduce((sum, p) => sum + p.data.byteLength, 0);
  if (r.limits.maxFileBytes !== undefined && fileBytes > r.limits.maxFileBytes) {
    throw fail('input_too_large', `files are ${fileBytes} bytes; the limit is ${r.limits.maxFileBytes}`, { provider: r.providerId });
  }
  const pages = files.reduce((sum, p) => sum + (p.pages ?? 0), 0);
  if (r.limits.maxPdfPages !== undefined && pages > r.limits.maxPdfPages) {
    throw fail('input_too_large', `PDF has ${pages} pages; the limit is ${r.limits.maxPdfPages}`, { provider: r.providerId });
  }
  if (r.limits.maxRequestBytes !== undefined && bodyBytes > r.limits.maxRequestBytes) {
    throw fail('input_too_large', `request is ${bodyBytes} bytes; the limit is ${r.limits.maxRequestBytes}`, { provider: r.providerId });
  }
}

/** 推理等級寫進請求；那一家沒有這個等級時用最接近的（一樣近取高的），記一則 warning。回傳送出的原值。 */
function applyReasoning(body: Record<string, unknown>, spec: ReasoningSpec | undefined, level: ReasoningLevel | undefined, warnings: string[]): string | number | null {
  if (level === undefined) return null;
  if (!spec) {
    warnings.push(`reasoning '${level}' not sent: no mapping for this model`);
    return null;
  }
  let chosen: ReasoningLevel | undefined = level in spec.values ? level : undefined;
  if (!chosen) {
    const target = REASONING_LEVELS.indexOf(level);
    let best = Number.POSITIVE_INFINITY;
    for (const candidate of REASONING_LEVELS) {
      if (!(candidate in spec.values)) continue;
      const index = REASONING_LEVELS.indexOf(candidate);
      const distance = Math.abs(index - target);
      if (distance < best || (distance === best && index > target)) {
        best = distance;
        chosen = candidate;
      }
    }
    if (!chosen) {
      warnings.push(`reasoning '${level}' not sent: no levels mapped`);
      return null;
    }
    warnings.push(`reasoning '${level}' not available; used '${chosen}'`);
  }
  const value = spec.values[chosen];
  if (value === null || value === undefined) return null;
  setPath(body, spec.path, value);
  return value;
}

// ── 小工具 ──

function lower(headers: Record<string, string> | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers ?? {})) out[k.toLowerCase()] = v;
  return out;
}

function getPath(target: Record<string, unknown>, path: string): unknown {
  let node: unknown = target;
  for (const key of path.split('.')) {
    if (!isPlain(node)) return undefined;
    node = node[key];
  }
  return node;
}

/** trace 能記的值：字串與數字照原樣，沒有是 null，其他型別寫成 JSON。 */
function sentValue(value: unknown): string | number | null {
  if (value === undefined || value === null) return null;
  return typeof value === 'string' || typeof value === 'number' ? value : JSON.stringify(value);
}

function setPath(target: Record<string, unknown>, path: string, value: unknown): void {
  const keys = path.split('.');
  let node = target;
  for (const key of keys.slice(0, -1)) {
    const next = node[key];
    if (!isPlain(next)) node[key] = {};
    node = node[key] as Record<string, unknown>;
  }
  node[keys[keys.length - 1]] = value;
}

/** 物件裡每個葉子的路徑（a.b.c）；陣列與其他值都算葉子。 */
function leafPaths(source: Record<string, unknown>, prefix = ''): string[] {
  return Object.entries(source).flatMap(([key, value]) => (
    isPlain(value) && Object.keys(value).length > 0 ? leafPaths(value, `${prefix}${key}.`) : [`${prefix}${key}`]
  ));
}

function deepMerge(target: Record<string, unknown>, source: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(source)) {
    const current = target[key];
    if (isPlain(value) && isPlain(current)) deepMerge(current, value);
    else target[key] = value;
  }
}

/** 連同裡面的物件與陣列一起凍結。 */
function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

const isPlain = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && Object.getPrototypeOf(value) === Object.prototype;

const dayOf = (ms: number): string => new Date(ms).toISOString().slice(0, 10);

function retryAfterOf(headers: Headers): number | null {
  const msHeader = headers.get('retry-after-ms');
  if (msHeader !== null && Number.isFinite(Number(msHeader)) && Number(msHeader) >= 0) return Math.round(Number(msHeader));
  const value = headers.get('retry-after');
  if (value === null) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.round(seconds * 1000);
  const date = Date.parse(value);
  return Number.isNaN(date) ? null : Math.max(0, date - Date.now());
}

function toError(parsed: ParsedError, status: number | null, retryAfterMs: number | null, meta: Partial<Init>): AiError {
  return new AiError({
    kind: parsed.kind, message: parsed.message, status, providerCode: parsed.providerCode ?? null,
    retryAfterMs: retryAfterMs ?? parsed.retryAfterMs ?? null, ...meta,
  });
}

/** 傳輸層不能中止時（例如 requestUrl），至少讓這邊在中止時立刻停下。 */
/** 等到 promise 或 signal 先到。signal 先到之後才交回的值交給 onLate（例如晚到的 Response 要取消本文，L2 R9）。 */
function untilAbort<T>(promise: Promise<T>, signal: AbortSignal, onLate?: (value: T) => void): Promise<T> {
  if (signal.aborted) {
    promise.then(value => onLate?.(value), () => undefined);
    return Promise.reject(new Error('aborted'));
  }
  return new Promise<T>((resolve, reject) => {
    let stopped = false;
    const onAbort = () => { stopped = true; reject(new Error('aborted')); };
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(
      value => {
        signal.removeEventListener('abort', onAbort);
        if (stopped) onLate?.(value);
        else resolve(value);
      },
      (error: unknown) => { signal.removeEventListener('abort', onAbort); reject(asError(error)); },
    );
  });
}

/** 放掉沒有人讀的本文；已經有人在讀的（被鎖住），由讀的那一邊取消。 */
function cancelBody(response: Response): void {
  if (response.body && !response.body.locked) response.body.cancel().catch(() => undefined);
}

/** 讀錯誤本文：收滿 ERROR_BODY_MAX_BYTES 就不再讀，idleMs 沒有新資料就用已經收到的（之後照狀態碼分類）；整體逾時與取消照樣丟出。 */
async function readErrorBody(response: Response, signal: AbortSignal, idleMs: number): Promise<string> {
  // 標頭交回之後、開始讀之前就停了：之後不會再有 abort 事件，要先看一次（L2 第二輪 R9）。
  if (signal.aborted) {
    cancelBody(response);
    throw new Error('aborted');
  }
  const stop = new AbortController();
  const onAbort = () => stop.abort();
  signal.addEventListener('abort', onAbort, { once: true });
  let timer = later(() => stop.abort(), idleMs);
  const decoder = new TextDecoder('utf-8');
  let out = '';
  let size = 0;
  try {
    for await (const chunk of abortable(bodyChunks(response, stop.signal), stop.signal)) {
      clearTimeout(timer);
      timer = later(() => stop.abort(), idleMs);
      const take = chunk.subarray(0, ERROR_BODY_MAX_BYTES - size);
      size += take.byteLength;
      out += decoder.decode(take, { stream: true });
      // 收滿就停：代理一直送資料也不會讀到整體逾時，失去狀態碼的分類（L2 第二輪 R9）。
      if (size >= ERROR_BODY_MAX_BYTES) break;
    }
  } catch (caught) {
    if (signal.aborted) throw caught;
  } finally {
    clearTimeout(timer);
    signal.removeEventListener('abort', onAbort);
  }
  return out + decoder.decode();
}

async function* touching(chunks: AsyncGenerator<Uint8Array>, touch: () => void): AsyncGenerator<Uint8Array> {
  for await (const chunk of chunks) {
    touch();
    yield chunk;
  }
}

async function* abortable(chunks: AsyncGenerator<Uint8Array>, signal: AbortSignal): AsyncGenerator<Uint8Array> {
  try {
    for (;;) {
      const step = await untilAbort(chunks.next(), signal);
      if (step.done) return;
      yield step.value;
    }
  } finally {
    chunks.return(undefined).catch(() => undefined);
  }
}
