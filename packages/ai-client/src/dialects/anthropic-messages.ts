// Anthropic Messages API。
// 依據（2026-11-25 查）：https://platform.claude.com/docs/en/build-with-claude/pdf-support.md（document 區塊的 base64）、
// 官方 API 參考的串流事件與錯誤種類（message_start／content_block_delta／message_delta／message_stop／error；
// 錯誤 type：authentication_error、permission_error、not_found_error、request_too_large、rate_limit_error、
// billing_error、api_error、overloaded_error、invalid_request_error）。版號 anthropic-version 綁在方言：換版號會改請求的寫法
// （2026-10-21 起送 temperature 會 400），所以不放在目錄讓人蓋掉。
// 推理用 output_config.effort（目錄寫）；新模型不送 thinking 就是自動思考，不能關。max_tokens 必填。
// 拒答是 HTTP 200 加 stop_reason: refusal。
import type { ContentPart, StopReason } from '../types.ts';
import { Binary } from '../body.ts';
import { arr, badShape, emptyUsage, httpError, modelList, num, obj, parseJson, str, type Json } from './shared.ts';
import type { BuildContext, Dialect, HttpCall, Output, ParsedError, StreamParser } from './types.ts';

const ANTHROPIC_VERSION = '2026-10-21';
/** 沒有給輸出上限、目錄也沒寫時用的值（max_tokens 必填）。 */
const DEFAULT_MAX_TOKENS = 32_000;

function part(p: ContentPart): Json {
  if (p.type === 'text') return { type: 'text', text: p.text };
  if (p.type === 'image') return { type: 'image', source: { type: 'base64', media_type: p.mediaType, data: new Binary(p.data) } };
  return { type: 'document', source: { type: 'base64', media_type: p.mediaType, data: new Binary(p.data) } };
}

function stopOf(reason: string | null): StopReason {
  if (reason === 'end_turn' || reason === 'stop_sequence') return 'end';
  if (reason === 'max_tokens' || reason === 'model_context_window_exceeded') return 'length';
  if (reason === 'refusal') return 'refusal';
  return 'other';
}

/** input_tokens 不含快取讀寫，合起來才是全部的輸入。 */
function applyUsage(usage: ReturnType<typeof emptyUsage>, u: Json): void {
  const input = num(u.input_tokens);
  const read = num(u.cache_read_input_tokens);
  const write = num(u.cache_creation_input_tokens);
  if (input !== null) usage.inputTokens = input + (read ?? 0) + (write ?? 0);
  if (read !== null) usage.cachedInputTokens = read;
  if (write !== null) usage.cacheWriteInputTokens = write;
  const output = num(u.output_tokens);
  if (output !== null) usage.outputTokens = output;
}

function errorOf(e: Json, status: number | null): ParsedError {
  const type = str(e.type);
  const message = str(e.message) ?? 'error';
  const code = str(obj(e.details).error_code) ?? type;
  switch (type) {
    case 'authentication_error': return { kind: 'auth', message, providerCode: code };
    case 'permission_error': return { kind: 'permission', message, providerCode: code };
    case 'not_found_error': return { kind: 'model_not_found', message, providerCode: code };
    case 'request_too_large': return { kind: 'input_too_large', message, providerCode: code };
    case 'billing_error': return { kind: 'quota', message, providerCode: code };
    case 'rate_limit_error':
      // 每月花費上限到了：沒有 retry-after，重試沒有用。
      return { kind: code === 'enforced_spend_limit_reached' ? 'quota' : 'rate_limit', message, providerCode: code };
    case 'overloaded_error': return { kind: 'overloaded', message, providerCode: code };
    case 'api_error': return { kind: 'server', message, providerCode: code };
    default:
      return status ? httpError(status, message, code) : { kind: 'server', message, providerCode: code };
  }
}

export const anthropicMessages: Dialect = {
  id: 'anthropic-messages',
  defaultAuth: { header: 'x-api-key' },
  requestIdHeader: 'request-id',

  buildGenerate(ctx: BuildContext): HttpCall {
    const body: Json = {
      model: ctx.model,
      max_tokens: ctx.maxOutputTokens ?? DEFAULT_MAX_TOKENS,
      messages: ctx.input.map(m => ({ role: m.role, content: m.content.map(part) })),
      stream: true,
    };
    if (ctx.instructions) body.system = ctx.instructions;
    return { url: `${ctx.baseUrl}/messages`, headers: { 'anthropic-version': ANTHROPIC_VERSION }, body };
  },

  parseResponse(json: unknown) {
    const r = obj(json);
    if (r.type === 'error') return { error: errorOf(obj(r.error), null) };
    if (!Array.isArray(r.content)) return badShape('message');
    let text = '';
    for (const block of arr(r.content)) {
      const b = obj(block);
      if (b.type === 'text') text += str(b.text) ?? '';
    }
    const usage = emptyUsage();
    applyUsage(usage, obj(r.usage));
    const raw = str(r.stop_reason);
    const output: Output = {
      text, stopReason: stopOf(raw), rawStopReason: raw, usage,
      resolvedModel: str(r.model), responseId: str(r.id), reportedCost: null, warnings: [],
    };
    return output;
  },

  createStreamParser(): StreamParser {
    let text = '';
    let raw: string | null = null;
    let stopped = false;
    const usage = emptyUsage();
    let model: string | null = null;
    let id: string | null = null;
    return {
      get complete() {
        return stopped;
      },
      // message_stop 是最後一個事件。
      get ended() {
        return stopped;
      },
      push(event) {
        const data = obj(JSON.parse(event.data));
        const type = str(data.type) ?? event.event;
        if (type === 'content_block_delta') {
          const delta = obj(data.delta);
          if (delta.type !== 'text_delta') return {};
          const piece = str(delta.text) ?? '';
          text += piece;
          return { delta: piece };
        }
        if (type === 'message_start') {
          const message = obj(data.message);
          model = str(message.model);
          id = str(message.id);
          applyUsage(usage, obj(message.usage));
          return {};
        }
        if (type === 'message_delta') {
          raw = str(obj(data.delta).stop_reason) ?? raw;
          applyUsage(usage, obj(data.usage));
          return {};
        }
        if (type === 'message_stop') {
          stopped = true;
          return {};
        }
        if (type === 'error') return { error: errorOf(obj(data.error), null) };
        return {};
      },
      result() {
        return { text, stopReason: stopOf(raw), rawStopReason: raw, usage, resolvedModel: model, responseId: id, reportedCost: null, warnings: [] };
      },
    };
  },

  classifyError(status, body) {
    const e = obj(obj(parseJson(body)).error);
    if (!str(e.type) && !str(e.message)) return httpError(status, body, null);
    return errorOf(e, status);
  },

  buildListModels(baseUrl) {
    return { url: `${baseUrl}/models?limit=1000`, headers: { 'anthropic-version': ANTHROPIC_VERSION } };
  },

  parseModels: json => modelList(obj(json).data, m => ({ id: str(m.id) ?? '', label: str(m.display_name) })),
};
