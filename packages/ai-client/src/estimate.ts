// 送出前估費用（Cards 任務說明 apps/Cards/docs/tasks/ai-direct.md §3）：照目錄的牌價，用字數與附件數估輸入的 token，
// 加上呼叫端預期的輸出，算出最少與最多。不呼叫服務、不送出任何東西。只算牌價，不含免費額度與快取折扣。
import { costOf } from './pricing.ts';
import type { ContentPart, Estimate, EstimateOptions, GenerateRequest, MediaTokens, ModelSpec, TokenRange } from './types.ts';

/**
 * 每個字元約幾個 token。各家的分詞不同：中日韓的字大多 1 字 1 token 上下，英文大約 3～5 個字元 1 token。
 * 取寬一點的範圍，寧可估得寬也不要估得太少。
 */
const CJK_PER_CHAR: TokenRange = { low: 0.6, high: 1.5 };
const OTHER_PER_CHAR: TokenRange = { low: 0.2, high: 0.35 };
/** 中日韓的字、注音、全形標點。 */
const CJK = /[　-〿぀-ヿ㄀-ㄯ㐀-䶿一-鿿가-힯豈-﫿＀-￯]/gu;

/** 目錄沒寫時的寬範圍：涵蓋各家文件寫的最少（Gemini 每頁 258）到最多（Claude 高解析度的圖 4,784）。 */
const FALLBACK: Required<Pick<MediaTokens, 'pdfPage' | 'image'>> = { pdfPage: { low: 258, high: 4600 }, image: { low: 258, high: 4800 } };

/** 估費用時讀到的錯（呼叫端的 client 轉成 invalid_request）。 */
export class EstimateInputError extends Error {}

const isCount = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value) && value >= 0;

function partsOf(request: GenerateRequest): { chars: string[]; parts: ContentPart[] } {
  if (!Array.isArray(request.input)) throw new EstimateInputError('input must be an array of messages');
  const chars: string[] = [];
  const parts: ContentPart[] = [];
  if (typeof request.instructions === 'string') chars.push(request.instructions);
  for (const message of request.input as unknown[]) {
    const content = typeof message === 'object' && message !== null ? (message as { content?: unknown }).content : undefined;
    if (typeof content === 'string') chars.push(content);
    else if (Array.isArray(content)) {
      for (const part of content as unknown[]) {
        if (typeof part !== 'object' || part === null) throw new EstimateInputError('each content part must be an object');
        const p = part as ContentPart;
        if (p.type === 'text') chars.push(typeof p.text === 'string' ? p.text : '');
        else parts.push(p);
      }
    } else throw new EstimateInputError('message content must be a string or an array of parts');
  }
  return { chars, parts };
}

function countFrom(parts: ContentPart[], given: number | undefined, field: string, count: (parts: ContentPart[]) => number): number {
  if (given !== undefined && given !== null) {
    if (!isCount(given)) throw new EstimateInputError(`${field} must be a non-negative integer`);
    return given;
  }
  return count(parts);
}

/** request 已經 resolve 過：model 是目錄裡的模型（沒有的是 undefined），providerMedia 是那一家的 mediaTokens。 */
export function estimateCost(request: GenerateRequest, options: EstimateOptions, model: ModelSpec | undefined, providerMedia: MediaTokens | undefined, day: string): Estimate | null {
  const output = (options as Partial<EstimateOptions> | undefined)?.expectedOutputTokens;
  if (!output || !isCount(output.low) || !isCount(output.high) || output.low > output.high) {
    throw new EstimateInputError('expectedOutputTokens must be { low, high } with non-negative integers and low <= high');
  }
  const { chars, parts } = partsOf(request);
  const pdfPages = countFrom(parts, options.pdfPages, 'pdfPages', list => list.reduce((sum, p) => {
    if (p.type !== 'file') return sum;
    if (!isCount(p.pages)) throw new EstimateInputError('a PDF part has no page count: give pages on the part or pdfPages in the options');
    return sum + p.pages;
  }, 0));
  const images = countFrom(parts, options.images, 'images', list => list.filter(p => p.type === 'image').length);
  if (!model?.prices) return null;

  const text = chars.join('');
  const cjk = text.match(CJK)?.length ?? 0;
  const other = text.length - cjk;
  const media: MediaTokens = { ...providerMedia, ...model.mediaTokens };
  const pdfPageTokens = pdfPages > 0 ? (media.pdfPage ?? FALLBACK.pdfPage) : null;
  const imageTokens = images > 0 ? (media.image ?? FALLBACK.image) : null;
  const usedFallback = (pdfPageTokens !== null && !media.pdfPage) || (imageTokens !== null && !media.image);
  const hasMedia = pdfPageTokens !== null || imageTokens !== null;

  const end = (key: keyof TokenRange): number => Math.round(cjk * CJK_PER_CHAR[key] + other * OTHER_PER_CHAR[key])
    + pdfPages * (pdfPageTokens?.[key] ?? 0) + images * (imageTokens?.[key] ?? 0);
  const inputTokens = { low: end('low'), high: end('high') };
  const costFor = (key: keyof TokenRange) => costOf({
    inputTokens: inputTokens[key], outputTokens: output[key], cachedInputTokens: null, cacheWriteInputTokens: null, reasoningTokens: null,
  }, model, day);
  const low = costFor('low');
  const high = costFor('high');
  if (!low || !high) return null;
  return {
    low: low.amount, high: high.amount, currency: 'USD', pricesAsOf: low.pricesAsOf,
    assumptions: {
      textChars: text.length, pdfPages, images, inputTokens, outputTokens: { low: output.low, high: output.high },
      pdfPageTokens: pdfPageTokens && { ...pdfPageTokens }, imageTokens: imageTokens && { ...imageTokens },
      media: !hasMedia ? null : usedFallback ? 'fallback' : media.guessed ? 'guessed' : 'catalog',
      mediaSource: hasMedia && !usedFallback ? media.source ?? null : null,
      mediaAsOf: hasMedia && !usedFallback ? media.asOf ?? null : null,
    },
  };
}
