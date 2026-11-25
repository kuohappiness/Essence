// OpenAI Responses API。
// 依據（2026-11-25 查）：https://developers.openai.com/api/docs/guides/streaming-responses、
// https://developers.openai.com/api/docs/guides/pdf-files（input_file 的 base64 data URL＋filename，一次請求的檔案合計 50 MB）。
// 不用背景模式（2026-07 有過背景模式加檔案一直不結束的回報）；長時間的生成用串流撐。送 store: false。
import type { ContentPart, StopReason } from '../types.ts';
import { dataUrl } from '../body.ts';
import { arr, emptyUsage, httpError, num, obj, parseJson, str, type Json } from './shared.ts';
import type { BuildContext, Dialect, HttpCall, Output, ParsedError, StreamParser } from './types.ts';

function part(p: ContentPart, role: 'user' | 'assistant'): Json {
  if (p.type === 'text') return { type: role === 'assistant' ? 'output_text' : 'input_text', text: p.text };
  if (p.type === 'image') return { type: 'input_image', image_url: dataUrl(p.mediaType, p.data) };
  return { type: 'input_file', filename: p.name ?? 'file.pdf', file_data: dataUrl(p.mediaType, p.data) };
}

function stopOf(status: string | null, reason: string | null): { stopReason: StopReason; raw: string | null } {
  if (status === 'completed') return { stopReason: 'end', raw: status };
  if (status === 'incomplete') {
    if (reason === 'max_output_tokens') return { stopReason: 'length', raw: reason };
    if (reason === 'content_filter') return { stopReason: 'content_filter', raw: reason };
    return { stopReason: 'other', raw: reason ?? status };
  }
  return { stopReason: 'other', raw: status };
}

function usageOf(u: Json) {
  const usage = emptyUsage();
  usage.inputTokens = num(u.input_tokens);
  usage.outputTokens = num(u.output_tokens);
  usage.cachedInputTokens = num(obj(u.input_tokens_details).cached_tokens);
  // GPT-5.6 起寫進快取另外計價（L2 R5；https://developers.openai.com/api/docs/guides/prompt-caching，2026-11-25 查）。
  usage.cacheWriteInputTokens = num(obj(u.input_tokens_details).cache_write_tokens);
  usage.reasoningTokens = num(obj(u.output_tokens_details).reasoning_tokens);
  return usage;
}

function errorOf(e: Json, fallbackKind: ParsedError['kind'] = 'server'): ParsedError {
  const code = str(e.code) ?? str(e.type);
  const message = str(e.message) ?? 'response failed';
  if (code === 'insufficient_quota') return { kind: 'quota', message, providerCode: code };
  if (code === 'rate_limit_exceeded') return { kind: 'rate_limit', message, providerCode: code };
  if (code === 'context_length_exceeded') return { kind: 'input_too_large', message, providerCode: code };
  if (code === 'server_error') return { kind: 'server', message, providerCode: code };
  if (code === 'invalid_prompt') return { kind: 'content_blocked', message, providerCode: code };
  return { kind: fallbackKind, message, providerCode: code };
}

/** 從完整的 response 物件讀出結果（非串流與 response.completed／incomplete 共用）。 */
function outputOf(response: Json, streamedText?: string): Output {
  let text = '';
  let refusal = '';
  for (const item of arr(response.output)) {
    const it = obj(item);
    if (it.type !== 'message') continue;
    for (const c of arr(it.content)) {
      const cc = obj(c);
      if (cc.type === 'output_text') text += str(cc.text) ?? '';
      else if (cc.type === 'refusal') refusal += str(cc.refusal) ?? '';
    }
  }
  const { stopReason, raw } = stopOf(str(response.status), str(obj(response.incomplete_details).reason));
  const warnings: string[] = [];
  const out: Output = {
    text: streamedText ?? text,
    stopReason, rawStopReason: raw,
    usage: usageOf(obj(response.usage)),
    resolvedModel: str(response.model),
    responseId: str(response.id),
    reportedCost: null,
    warnings,
  };
  if (refusal) {
    warnings.push(`refusal: ${refusal.slice(0, 200)}`);
    out.stopReason = 'refusal';
  }
  return out;
}

export const openaiResponses: Dialect = {
  id: 'openai-responses',
  defaultAuth: { header: 'Authorization', scheme: 'Bearer' },
  requestIdHeader: 'x-request-id',

  buildGenerate(ctx: BuildContext): HttpCall {
    const body: Json = {
      model: ctx.model,
      input: ctx.input.map(m => ({ role: m.role, content: m.content.map(p => part(p, m.role)) })),
      stream: true,
      store: false,
    };
    if (ctx.instructions) body.instructions = ctx.instructions;
    if (ctx.maxOutputTokens !== undefined) body.max_output_tokens = ctx.maxOutputTokens;
    return { url: `${ctx.baseUrl}/responses`, body };
  },

  parseResponse(json: unknown) {
    const r = obj(json);
    if (r.status === 'failed') return { error: errorOf(obj(r.error)) };
    return outputOf(r);
  },

  createStreamParser(): StreamParser {
    let text = '';
    let final: Output | null = null;
    let id: string | null = null;
    let model: string | null = null;
    return {
      get complete() {
        return final !== null;
      },
      // response.completed／incomplete 帶著完整的 response，之後沒有要讀的。
      get ended() {
        return final !== null;
      },
      push(event) {
        if (event.data === '[DONE]') return {};
        const data = obj(JSON.parse(event.data));
        const type = str(data.type) ?? event.event;
        if (type === 'response.output_text.delta') {
          const delta = str(data.delta) ?? '';
          text += delta;
          return { delta };
        }
        if (type === 'response.refusal.delta') return {};
        if (type === 'response.created' || type === 'response.in_progress') {
          const r = obj(data.response);
          id = str(r.id) ?? id;
          model = str(r.model) ?? model;
          return {};
        }
        if (type === 'response.completed' || type === 'response.incomplete') {
          final = outputOf(obj(data.response), text);
          return {};
        }
        if (type === 'response.failed') return { error: errorOf(obj(obj(data.response).error)) };
        if (type === 'error') return { error: errorOf(isNested(data) ? obj(data.error) : data) };
        return {};
      },
      result() {
        return final ?? { text, stopReason: 'other', rawStopReason: null, usage: emptyUsage(), resolvedModel: model, responseId: id, reportedCost: null, warnings: [] };
      },
    };
  },

  classifyError(status, body) {
    const e = obj(obj(parseJson(body)).error);
    const message = str(e.message) ?? body;
    const code = str(e.code) ?? str(e.type);
    if (status === 429 && code === 'insufficient_quota') return { kind: 'quota', message, providerCode: code };
    if (code === 'context_length_exceeded') return { kind: 'input_too_large', message, providerCode: code };
    if (code === 'model_not_found') return { kind: 'model_not_found', message, providerCode: code };
    if (code === 'unsupported_country_region_territory') return { kind: 'permission', message, providerCode: code };
    if (code === 'content_policy_violation' || code === 'invalid_prompt') return { kind: 'content_blocked', message, providerCode: code };
    return httpError(status, message, code);
  },

  buildListModels(baseUrl) {
    return { url: `${baseUrl}/models` };
  },

  parseModels(json) {
    return arr(obj(json).data).map(m => ({ id: str(obj(m).id) ?? '', label: null })).filter(m => m.id);
  },
};

const isNested = (data: Json): boolean => typeof data.error === 'object' && data.error !== null;
