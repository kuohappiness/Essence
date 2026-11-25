// OpenAI 相容的 Chat Completions：OpenRouter、DeepSeek、Groq、Mistral、xAI、Ollama、LM Studio 等。
// 依據（2026-11-25 查）：OpenRouter 的 PDF 是 file 部分 {type:'file', file:{filename, file_data:'data:application/pdf;base64,…'}}，
// 用量在最後一段（stream_options.include_usage），OpenRouter 另外回報 usage.cost（美元）。各家的差異放在目錄的 options
// （maxTokensField、streamUsage、systemRole，見 types.ts 的 ProviderOptions）。
import type { ContentPart, StopReason } from '../types.ts';
import { dataUrl } from '../body.ts';
import { arr, emptyUsage, httpError, num, obj, parseJson, str, type Json } from './shared.ts';
import type { BuildContext, Dialect, HttpCall, Output, ParsedError, StreamParser } from './types.ts';

function part(p: ContentPart): Json {
  if (p.type === 'text') return { type: 'text', text: p.text };
  if (p.type === 'image') return { type: 'image_url', image_url: { url: dataUrl(p.mediaType, p.data) } };
  return { type: 'file', file: { filename: p.name ?? 'file.pdf', file_data: dataUrl(p.mediaType, p.data) } };
}

function stopOf(reason: string | null): StopReason {
  if (reason === 'stop') return 'end';
  if (reason === 'length') return 'length';
  if (reason === 'content_filter') return 'content_filter';
  return 'other';
}

function usageOf(u: Json) {
  const usage = emptyUsage();
  usage.inputTokens = num(u.prompt_tokens);
  usage.outputTokens = num(u.completion_tokens);
  usage.cachedInputTokens = num(obj(u.prompt_tokens_details).cached_tokens);
  usage.reasoningTokens = num(obj(u.completion_tokens_details).reasoning_tokens);
  return usage;
}

function errorOf(e: Json, status: number | null): ParsedError {
  const message = str(e.message) ?? 'error';
  const rawCode = e.code ?? e.type;
  const code = typeof rawCode === 'number' ? String(rawCode) : str(rawCode);
  if (code === 'insufficient_quota') return { kind: 'quota', message, providerCode: code };
  if (code === 'context_length_exceeded') return { kind: 'input_too_large', message, providerCode: code };
  if (code === 'model_not_found') return { kind: 'model_not_found', message, providerCode: code };
  // OpenRouter 在串流裡的錯誤把狀態碼放在 code。
  const numeric = status ?? (typeof e.code === 'number' ? e.code : null);
  return numeric ? httpError(numeric, message, code) : { kind: 'server', message, providerCode: code };
}

export const openaiChat: Dialect = {
  id: 'openai-chat',
  defaultAuth: { header: 'Authorization', scheme: 'Bearer' },
  requestIdHeader: 'x-request-id',

  buildGenerate(ctx: BuildContext): HttpCall {
    const messages: Json[] = [];
    if (ctx.instructions) messages.push({ role: ctx.options.systemRole ?? 'system', content: ctx.instructions });
    for (const m of ctx.input) {
      const onlyText = m.content.every(p => p.type === 'text');
      messages.push({
        role: m.role,
        // 只有文字時送字串：有些相容服務（較舊的本機伺服器）不收陣列。
        content: onlyText ? m.content.map(p => (p.type === 'text' ? p.text : '')).join('') : m.content.map(part),
      });
    }
    const body: Json = { model: ctx.model, messages, stream: true };
    if (ctx.options.streamUsage !== false) body.stream_options = { include_usage: true };
    if (ctx.maxOutputTokens !== undefined) body[ctx.options.maxTokensField ?? 'max_tokens'] = ctx.maxOutputTokens;
    return { url: `${ctx.baseUrl}/chat/completions`, body };
  },

  parseResponse(json: unknown) {
    const r = obj(json);
    if (r.error) return { error: errorOf(obj(r.error), null) };
    const choice = obj(arr(r.choices)[0]);
    const message = obj(choice.message);
    const raw = str(choice.finish_reason);
    const u = obj(r.usage);
    const output: Output = {
      text: str(message.content) ?? '',
      stopReason: stopOf(raw), rawStopReason: raw,
      usage: usageOf(u),
      resolvedModel: str(r.model), responseId: str(r.id),
      reportedCost: num(u.cost),
      warnings: [],
    };
    const refusal = str(message.refusal);
    if (refusal) {
      output.warnings.push(`refusal: ${refusal.slice(0, 200)}`);
      output.stopReason = 'refusal';
    }
    return output;
  },

  createStreamParser(): StreamParser {
    let text = '';
    let raw: string | null = null;
    let done = false;
    let usage = emptyUsage();
    let cost: number | null = null;
    let model: string | null = null;
    let id: string | null = null;
    return {
      get complete() {
        return done || raw !== null;
      },
      push(event) {
        if (event.data === '[DONE]') {
          done = true;
          return {};
        }
        const data = obj(JSON.parse(event.data));
        if (data.error) return { error: errorOf(obj(data.error), null) };
        model = str(data.model) ?? model;
        id = str(data.id) ?? id;
        if (data.usage) {
          usage = usageOf(obj(data.usage));
          cost = num(obj(data.usage).cost) ?? cost;
        }
        const choice = obj(arr(data.choices)[0]);
        const reason = str(choice.finish_reason);
        if (reason === 'error') return { error: { kind: 'server', message: 'stream ended with finish_reason error', providerCode: reason } };
        if (reason) raw = reason;
        const delta = str(obj(choice.delta).content);
        if (delta) {
          text += delta;
          return { delta };
        }
        return {};
      },
      result() {
        return { text, stopReason: stopOf(raw), rawStopReason: raw, usage, resolvedModel: model, responseId: id, reportedCost: cost, warnings: [] };
      },
    };
  },

  classifyError(status, body) {
    const parsed = parseJson(body);
    const e = obj(obj(parsed).error);
    if (!str(e.message)) return httpError(status, body, null);
    return errorOf(e, status);
  },

  buildListModels(baseUrl) {
    return { url: `${baseUrl}/models` };
  },

  parseModels(json) {
    return arr(obj(json).data)
      .map(m => ({ id: str(obj(m).id) ?? '', label: str(obj(m).name) }))
      .filter(m => m.id);
  },
};
