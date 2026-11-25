// Google Gemini 的 generateContent（AI Studio 的金鑰）。
// 依據（2026-11-25 查）：https://ai.google.dev/gemini-api/docs/generate-content/thinking.md.txt
// （thinkingConfig 在 generationConfig 底下：Gemini 3 用 thinkingLevel，2.5 用 thinkingBudget；思考的 token 在
// usageMetadata.thoughtsTokenCount，和 candidatesTokenCount 一起計費）。串流是 :streamGenerateContent?alt=sse。
// Google 另有較新的 Interactions API（2026-11 仍是 Beta、預設會存對話）；generateContent 標成 Legacy 但寫明繼續完整支援，
// 先用它，之後另加 gemini-interactions 方言（docs/tasks/ai-client.md〈6〉）。
import type { ContentPart, StopReason } from '../types.ts';
import { Binary } from '../body.ts';
import { arr, emptyUsage, httpError, num, obj, parseJson, str, type Json } from './shared.ts';
import type { BuildContext, Dialect, HttpCall, Output, ParsedError, StreamParser } from './types.ts';

function part(p: ContentPart): Json {
  if (p.type === 'text') return { text: p.text };
  return { inlineData: { mimeType: p.mediaType, data: new Binary(p.data) } };
}

const BLOCKED = new Set(['SAFETY', 'RECITATION', 'BLOCKLIST', 'PROHIBITED_CONTENT', 'SPII', 'IMAGE_SAFETY']);

function stopOf(reason: string | null): StopReason {
  if (reason === 'STOP') return 'end';
  if (reason === 'MAX_TOKENS') return 'length';
  if (reason && BLOCKED.has(reason)) return 'content_filter';
  return 'other';
}

function usageOf(u: Json) {
  const usage = emptyUsage();
  usage.inputTokens = num(u.promptTokenCount);
  usage.cachedInputTokens = num(u.cachedContentTokenCount);
  const candidates = num(u.candidatesTokenCount);
  const thoughts = num(u.thoughtsTokenCount);
  usage.reasoningTokens = thoughts;
  usage.outputTokens = candidates === null && thoughts === null ? null : (candidates ?? 0) + (thoughts ?? 0);
  return usage;
}

/** 一段回應裡的文字（不含思考摘要）。 */
function textOf(chunk: Json): string {
  const candidate = obj(arr(chunk.candidates)[0]);
  let text = '';
  for (const p of arr(obj(candidate.content).parts)) {
    const pp = obj(p);
    if (pp.thought === true) continue;
    text += str(pp.text) ?? '';
  }
  return text;
}

/** google.rpc.RetryInfo 的 retryDelay（例如 "37s"）。 */
function retryDelayOf(details: unknown[]): number | null {
  for (const d of details) {
    const delay = str(obj(d).retryDelay);
    const m = delay ? /^(\d+(?:\.\d+)?)s$/.exec(delay) : null;
    if (m) return Math.round(Number(m[1]) * 1000);
  }
  return null;
}

function errorOf(e: Json, httpStatus: number | null): ParsedError {
  const message = str(e.message) ?? 'error';
  const status = str(e.status);
  const details = arr(e.details);
  const reasons = details.map(d => str(obj(d).reason)).filter((r): r is string => r !== null);
  const code = reasons[0] ?? status;
  if (reasons.includes('API_KEY_INVALID') || reasons.includes('API_KEY_EXPIRED')) return { kind: 'auth', message, providerCode: code };
  if (status === 'RESOURCE_EXHAUSTED') {
    // 每天的免費額度用完時 QuotaFailure 的 quotaId 帶 PerDay；重試沒有用。
    const daily = details.some(d => arr(obj(d).violations).some(v => /PerDay/i.test(str(obj(v).quotaId) ?? '')));
    return { kind: daily ? 'quota' : 'rate_limit', message, providerCode: code, retryAfterMs: retryDelayOf(details) };
  }
  if (status === 'PERMISSION_DENIED' || status === 'FAILED_PRECONDITION') return { kind: 'permission', message, providerCode: code };
  if (status === 'NOT_FOUND') return { kind: 'model_not_found', message, providerCode: code };
  if (status === 'UNAVAILABLE') return { kind: 'overloaded', message, providerCode: code };
  if (status === 'INTERNAL' || status === 'DEADLINE_EXCEEDED') return { kind: 'server', message, providerCode: code };
  const numeric = httpStatus ?? num(e.code);
  return numeric ? httpError(numeric, message, code) : { kind: 'server', message, providerCode: code };
}

function outputOf(chunk: Json, text: string): Output {
  const candidate = obj(arr(chunk.candidates)[0]);
  const raw = str(candidate.finishReason);
  const blockReason = str(obj(chunk.promptFeedback).blockReason);
  return {
    text,
    stopReason: blockReason ? 'content_filter' : stopOf(raw),
    rawStopReason: blockReason ?? raw,
    usage: usageOf(obj(chunk.usageMetadata)),
    resolvedModel: str(chunk.modelVersion),
    responseId: str(chunk.responseId),
    reportedCost: null,
    warnings: [],
  };
}

const modelPath = (model: string): string => encodeURIComponent(model.replace(/^models\//, ''));

export const geminiGenerateContent: Dialect = {
  id: 'gemini-generate-content',
  defaultAuth: { header: 'x-goog-api-key' },
  requestIdHeader: null,

  buildGenerate(ctx: BuildContext): HttpCall {
    const body: Json = {
      contents: ctx.input.map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: m.content.map(part) })),
    };
    if (ctx.instructions) body.systemInstruction = { parts: [{ text: ctx.instructions }] };
    if (ctx.maxOutputTokens !== undefined) body.generationConfig = { maxOutputTokens: ctx.maxOutputTokens };
    return { url: `${ctx.baseUrl}/models/${modelPath(ctx.model)}:streamGenerateContent?alt=sse`, body };
  },

  parseResponse(json: unknown) {
    const r = obj(json);
    if (r.error) return { error: errorOf(obj(r.error), null) };
    return outputOf(r, textOf(r));
  },

  createStreamParser(): StreamParser {
    let text = '';
    // 每一欄留最後一個有值的：轉接服務可能把用量另外放在最後一塊，不能只看最後一塊（L2 R11）。
    let finishReason: string | null = null;
    let blockReason: string | null = null;
    let modelVersion: string | null = null;
    let responseId: string | null = null;
    let usage: Json | null = null;
    let finished = false;
    return {
      get complete() {
        return finished;
      },
      // 沒有結束事件：用量可能在 finishReason 之後的另一塊，讀到服務關掉串流為止。
      ended: false,
      push(event) {
        const data = obj(JSON.parse(event.data));
        if (data.error) return { error: errorOf(obj(data.error), null) };
        finishReason = str(obj(arr(data.candidates)[0]).finishReason) ?? finishReason;
        blockReason = str(obj(data.promptFeedback).blockReason) ?? blockReason;
        modelVersion = str(data.modelVersion) ?? modelVersion;
        responseId = str(data.responseId) ?? responseId;
        if (data.usageMetadata) usage = obj(data.usageMetadata);
        if (finishReason || blockReason) finished = true;
        const delta = textOf(data);
        if (delta) {
          text += delta;
          return { delta };
        }
        return {};
      },
      result() {
        return outputOf({
          candidates: [{ finishReason }], promptFeedback: { blockReason }, usageMetadata: usage ?? {}, modelVersion, responseId,
        }, text);
      },
    };
  },

  classifyError(status, body) {
    const e = obj(obj(parseJson(body)).error);
    if (!str(e.message)) return httpError(status, body, null);
    return errorOf(e, status);
  },

  buildListModels(baseUrl) {
    return { url: `${baseUrl}/models?pageSize=1000` };
  },

  parseModels(json) {
    return arr(obj(json).models)
      .map(m => ({ id: (str(obj(m).name) ?? '').replace(/^models\//, ''), label: str(obj(m).displayName) }))
      .filter(m => m.id);
  },
};
