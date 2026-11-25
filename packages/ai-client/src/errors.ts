// 中立的錯誤：每種錯誤有固定的種類、能不能重試、給使用者看的預設說明（docs/tasks/ai-client.md〈7〉第 7 點）。
// 金鑰不進錯誤：訊息與細節在建立時就遮掉（〈3〉第 4 點）。
import { redactText as redact } from './redact.ts';

export type AiErrorKind =
  | 'auth'
  | 'permission'
  | 'quota'
  | 'rate_limit'
  | 'overloaded'
  | 'server'
  | 'network'
  | 'timeout'
  | 'cancelled'
  | 'invalid_request'
  | 'input_too_large'
  | 'unsupported_input'
  | 'model_not_found'
  | 'content_blocked'
  | 'unknown';

/** 可以重試的種類。client 只在還沒拿到成功的回應時自動重送（見 afterResponse）；408 歸 server（服務說請求沒收完，還沒開始做）。 */
const RETRYABLE: ReadonlySet<AiErrorKind> = new Set(['rate_limit', 'overloaded', 'server', 'network']);
const isRetryableKind = (kind: AiErrorKind): boolean => RETRYABLE.has(kind);

export interface AiErrorInit {
  kind: AiErrorKind;
  message: string;
  status?: number | null;
  providerCode?: string | null;
  requestId?: string | null;
  retryAfterMs?: number | null;
  partialText?: string | null;
  provider?: string | null;
  afterResponse?: boolean;
  /** 遮蔽用：出現在訊息裡的這些字串換成 ***。 */
  secrets?: readonly string[];
  cause?: unknown;
}

export class AiError extends Error {
  readonly kind: AiErrorKind;
  /** 自動重送是安全的：種類可以重試，而且還沒拿到成功的回應。 */
  readonly retryable: boolean;
  readonly status: number | null;
  /** 服務自己的錯誤代碼，例如 insufficient_quota、overloaded_error、RESOURCE_EXHAUSTED。 */
  readonly providerCode: string | null;
  readonly requestId: string | null;
  readonly retryAfterMs: number | null;
  /** 串流中途失敗時已經收到的文字，由呼叫端決定要不要用。 */
  readonly partialText: string | null;
  readonly provider: string | null;
  /**
   * true：服務已經回了成功的狀態碼才出錯（串流中途斷線、串流裡的錯誤、內容被擋）。推理可能已經計費，套件不自動重送，
   * retryable 也是 false（〈7〉第 7 點的表）；要不要再試一次由呼叫端問使用者。
   */
  readonly afterResponse: boolean;
  /** 送了幾次（client 填）。 */
  attempts = 1;

  constructor(init: AiErrorInit) {
    const secrets = init.secrets ?? [];
    const cause = sanitizeCause(init.cause, secrets);
    super(redact(init.message, secrets), cause === undefined ? undefined : { cause });
    this.name = 'AiError';
    this.kind = init.kind;
    this.retryable = isRetryableKind(init.kind) && !(init.afterResponse ?? false);
    this.status = init.status ?? null;
    this.providerCode = init.providerCode ? redact(init.providerCode, secrets) : null;
    this.requestId = init.requestId ? redact(init.requestId, secrets) : null;
    this.retryAfterMs = init.retryAfterMs ?? null;
    this.partialText = init.partialText ? redact(init.partialText, secrets) : null;
    this.provider = init.provider ?? null;
    this.afterResponse = init.afterResponse ?? false;
  }

  /** JSON.stringify 用：不含 cause（cause 可能是傳輸層的物件）。 */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name, kind: this.kind, message: this.message, retryable: this.retryable, status: this.status,
      providerCode: this.providerCode, requestId: this.requestId, retryAfterMs: this.retryAfterMs,
      partialText: this.partialText, provider: this.provider, afterResponse: this.afterResponse, attempts: this.attempts,
    };
  }
}

export const isAiError = (value: unknown): value is AiError => value instanceof AiError;

/**
 * 傳輸層的例外可能帶著請求的細節：有金鑰要遮時，換成只留名稱與遮過的訊息的 Error（L2 R1）。
 * 沒有要遮的就原樣保留，方便除錯。
 */
function sanitizeCause(cause: unknown, secrets: readonly string[]): unknown {
  if (cause === undefined || secrets.length === 0) return cause;
  const text = cause instanceof Error ? cause.message : typeof cause === 'string' ? cause : JSON.stringify(cause) ?? '';
  const copy = new Error(redact(text, secrets));
  if (cause instanceof Error) copy.name = cause.name;
  return copy;
}

type Locale = 'zh-TW' | 'en';

const MESSAGES: Record<Locale, Record<AiErrorKind, string>> = {
  'zh-TW': {
    auth: '金鑰不對或已失效，請到設定頁重新貼上。',
    permission: '這把金鑰不能用這個模型或功能。',
    quota: '額度用完了，等額度恢復或到服務的網站加值。',
    rate_limit: '送得太快，稍等一下再試。',
    overloaded: '服務忙線中，稍後再試。',
    server: '服務暫時出錯，稍後再試。',
    network: '網路連不上。',
    timeout: '等太久了，已停止。',
    cancelled: '已取消。',
    invalid_request: '請求格式不對。',
    input_too_large: '教材或內容太大，超過服務的上限。',
    unsupported_input: '這個模型不能讀這種檔案。',
    model_not_found: '找不到這個模型，可能名稱打錯或已下架。',
    content_blocked: '內容被服務擋下。',
    unknown: '未知的錯誤。',
  },
  en: {
    auth: 'The API key is wrong or expired.',
    permission: 'This key cannot use this model or feature.',
    quota: 'The quota or credit is used up.',
    rate_limit: 'Too many requests; wait a moment and retry.',
    overloaded: 'The service is overloaded; retry later.',
    server: 'The service had an error; retry later.',
    network: 'Network error.',
    timeout: 'Timed out.',
    cancelled: 'Cancelled.',
    invalid_request: 'The request was invalid.',
    input_too_large: 'The input is larger than the service allows.',
    unsupported_input: 'This model cannot read this kind of file.',
    model_not_found: 'Model not found.',
    content_blocked: 'The content was blocked by the service.',
    unknown: 'Unknown error.',
  },
};

const RATE_LIMIT_HINT: Record<Locale, string> = {
  'zh-TW': '如果一直這樣，可能是額度用完了。',
  en: 'If this keeps happening, the quota may be used up.',
};

/** 給使用者看的一句話。呼叫端可以用自己的文字取代。 */
export function describeAiError(error: AiError, locale: Locale = 'zh-TW'): string {
  const base = MESSAGES[locale][error.kind];
  if (error.kind === 'rate_limit' && error.attempts > 1) return `${base}${locale === 'en' ? ' ' : ''}${RATE_LIMIT_HINT[locale]}`;
  return base;
}
