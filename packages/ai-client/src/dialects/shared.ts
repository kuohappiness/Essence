// 方言共用的小工具：base64、讀 JSON 欄位、依狀態碼的預設分類。
import type { AiErrorKind } from '../errors.ts';
import type { Usage } from '../types.ts';
import type { ParsedError } from './types.ts';

export type Json = Record<string, unknown>;

const isObject = (value: unknown): value is Json => typeof value === 'object' && value !== null && !Array.isArray(value);
export const obj = (value: unknown): Json => (isObject(value) ? value : {});
export const arr = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
export const str = (value: unknown): string | null => (typeof value === 'string' ? value : null);
export const num = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) ? value : null);

export function parseJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

export const emptyUsage = (): Usage => ({
  inputTokens: null, cachedInputTokens: null, cacheWriteInputTokens: null, outputTokens: null, reasoningTokens: null,
});

/** 只看狀態碼的分類，各方言先看自己的錯誤代碼，分不出來再用這個。 */
function kindFromStatus(status: number): AiErrorKind {
  if (status === 401) return 'auth';
  if (status === 402) return 'quota';
  if (status === 403) return 'permission';
  if (status === 404) return 'model_not_found';
  if (status === 408) return 'server';
  if (status === 413) return 'input_too_large';
  if (status === 429) return 'rate_limit';
  if (status === 503 || status === 529) return 'overloaded';
  if (status >= 500) return 'server';
  if (status >= 400) return 'invalid_request';
  return 'unknown';
}

/** 照錯誤訊息的字樣補判斷：上下文太長、額度不足。 */
function refineByMessage(kind: AiErrorKind, message: string): AiErrorKind {
  const m = message.toLowerCase();
  if (kind === 'invalid_request' || kind === 'unknown') {
    if (/context length|context window|prompt is too long|too many tokens|maximum context|token count.*exceeds|exceeds the maximum number of tokens|request too large|payload size exceeds|request payload/.test(m)) return 'input_too_large';
    if (/credit balance|insufficient (credits|funds|balance|quota)|billing/.test(m)) return 'quota';
  }
  return kind;
}

export function httpError(status: number, message: string, providerCode: string | null): ParsedError {
  return { kind: refineByMessage(kindFromStatus(status), message), message, providerCode };
}
