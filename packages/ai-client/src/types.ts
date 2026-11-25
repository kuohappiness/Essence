// 中立的請求、結果、進度事件與目錄的型別。呼叫端只看這裡的型別，不必知道是哪一家（docs/tasks/ai-client.md〈5〉）。
// 版號規則（README〈版號〉）：改已 export 的型別或欄位的意思要升大版號。下面這些集合之後會加成員，算小版號，
// 呼叫端的 switch 一定要有 default：ReasoningLevel 以外的字串聯集（StopReason、ProgressEvent 的 type、AiErrorKind）、
// ContentPart 的種類、方言 id。

/** 推理等級，由低到高。各家的寫法由目錄的 `reasoning` 對應；那一家沒有的等級用最接近的（一樣近取高的），trace.warnings 記一則。 */
export type ReasoningLevel = 'off' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'max';
export const REASONING_LEVELS: readonly ReasoningLevel[] = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'];

/** 模型能收的輸入種類（目錄用）。 */
export type InputKind = 'text' | 'image' | 'pdf';

export type ContentPart =
  | { type: 'text'; text: string }
  | { type: 'image'; mediaType: string; data: Uint8Array }
  /** 現在只收 PDF（mediaType 'application/pdf'）。pages 是選填的頁數，只用來檢查頁數上限。 */
  | { type: 'file'; mediaType: string; data: Uint8Array; name?: string; pages?: number };

export interface Message {
  role: 'user' | 'assistant';
  content: string | ContentPart[];
}

export interface AuthSpec {
  /** 帶金鑰的標頭，例如 Authorization、x-api-key、x-goog-api-key。金鑰一律放標頭，不放網址。 */
  header: string;
  /** 金鑰前面加的字，例如 Bearer。 */
  scheme?: string;
}

/** 推理等級怎麼寫進請求：path 是請求本文裡用點分隔的位置，values 是每個等級要填的值（null 表示不送這個欄位）。 */
export interface ReasoningSpec {
  path: string;
  values: Partial<Record<ReasoningLevel, string | number | null>>;
}

/** 每百萬 token 的美元牌價（不含免費額度）。 */
export interface PriceSpec {
  /** 從這天起適用（YYYY-MM-DD）；沒寫的是最早的一筆。 */
  effectiveFrom?: string;
  input: number;
  output: number;
  /** 從快取讀的輸入；沒寫時照 input 算（估計偏高）。 */
  cachedInput?: number;
  /** 寫進快取的輸入（Anthropic、GPT-5.6 起的 OpenAI）；沒寫時照 input 算。 */
  cacheWrite?: number;
  /** 一次請求的輸入超過門檻時，整個請求改用這組價格。 */
  longContext?: { aboveInputTokens: number; input: number; output: number; cachedInput?: number };
}

export interface ModelSpec {
  id: string;
  label?: string;
  /** 沒寫表示不知道，送出前不擋。 */
  inputs?: InputKind[];
  reasoning?: ReasoningSpec;
  maxOutputTokens?: number;
  contextTokens?: number;
  prices?: PriceSpec[];
  /** 查價的日期（YYYY-MM-DD）。 */
  pricesAsOf?: string;
  /** 依據的官方網址。 */
  source?: string;
}

/**
 * 方言自己的選項。openai-chat 用來寫各家相容服務的差異：
 *   maxTokensField：輸出上限的欄位，預設 max_tokens（OpenAI 自己的是 max_completion_tokens）。
 *   streamUsage：要不要送 stream_options.include_usage，預設 true。
 *   systemRole：instructions 用的角色，預設 system（OpenAI 新模型可用 developer）。
 * 每一種方言都認得：
 *   checkPath：「測試連線」改打這個路徑（接在 baseUrl 後，GET）。列模型不用金鑰的服務（OpenRouter）要設。
 */
export interface ProviderOptions {
  maxTokensField?: string;
  streamUsage?: boolean;
  systemRole?: 'system' | 'developer';
  checkPath?: string;
}

export interface ProviderSpec {
  id: string;
  label: string;
  dialect: string;
  /** 含版本的根網址，例如 https://api.openai.com/v1。只能是 https，或本機的 http。 */
  baseUrl: string;
  /** null 表示不用金鑰（本機模型）。 */
  auth: AuthSpec | null;
  headers?: Record<string, string>;
  keyUrl?: string;
  docsUrl?: string;
  /** 已知的上限：寫偏高無妨（超過時服務自己會擋），寫偏低會擋掉其實能送的請求，所以兩份資料不一致時取高的。
   *  maxRequestBytes 是整個請求本文（base64 後）；maxFileBytes 是所有檔案原始大小的合計；maxPdfPages 只在呼叫端給了頁數時檢查。 */
  limits?: { maxRequestBytes?: number; maxFileBytes?: number; maxPdfPages?: number };
  /** 目錄沒列的模型用這些。 */
  defaults?: { inputs?: InputKind[]; reasoning?: ReasoningSpec; maxOutputTokens?: number };
  options?: ProviderOptions;
  models: ModelSpec[];
}

export interface Catalog {
  schemaVersion: 1;
  /** 整份資料最後核對的日期。模型與價格幾個月就會變，呼叫端可以用 AiClientOptions.catalog 蓋掉。 */
  asOf: string;
  providers: ProviderSpec[];
}

/** 不在目錄裡的服務：選一種方言、填網址。會存在使用者的設定裡，欄位只加不改。 */
export interface CustomEndpoint {
  dialect: string;
  baseUrl: string;
  /** 沒寫時用那種方言的預設（openai 系列是 Authorization: Bearer）。null 表示不用金鑰。 */
  auth?: AuthSpec | null;
  headers?: Record<string, string>;
  label?: string;
  options?: ProviderOptions;
}

export type EndpointRef = { provider: string } | { custom: CustomEndpoint };

export type ProgressEvent =
  /** 第 attempt 次送出（從 1 算）。 */
  | { type: 'sent'; attempt: number }
  /** 服務收下了，正在產生（推理模型可能好幾分鐘沒有文字）。 */
  | { type: 'waiting'; attempt: number }
  /** 收到一段文字；totalChars 是到目前為止的字數（UTF-16 單位）。傳輸層不串流時，所有文字在最後一次到。 */
  | { type: 'text'; delta: string; totalChars: number }
  /** 等 delayMs 後送第 attempt 次。 */
  | { type: 'retrying'; attempt: number; delayMs: number; reason: string }
  | { type: 'done' };

export interface GenerateRequest {
  endpoint: EndpointRef;
  /** 每次交進來，套件不存。不用金鑰的服務可以不給。 */
  apiKey?: string;
  model: string;
  /** 每次都一樣的長規則放這裡；各家都把它放在最前面。 */
  instructions?: string;
  input: Message[];
  reasoning?: ReasoningLevel;
  /** 含推理的輸出上限。Anthropic 必填，沒給時用目錄的值或 32,000。 */
  maxOutputTokens?: number;
  signal?: AbortSignal;
  /** 整體逾時（含重試與等待），預設 30 分鐘。 */
  timeoutMs?: number;
  /** 多久沒收到任何資料就算逾時；預設不設（推理模型思考時可能很久沒有資料）。 */
  idleTimeoutMs?: number;
  /** 最多送幾次（含第一次），1～3，預設 3；超過 3 照 3。只有還沒拿到成功的回應時才會自動重送。 */
  maxAttempts?: number;
  /** false：不照目錄擋模型不收的輸入（目錄過期時用）。預設 true。 */
  checkInputs?: boolean;
  onProgress?: (event: ProgressEvent) => void;
  /** 直接加進請求本文的欄位（例如測試中的新功能），照路徑深層合併，蓋過套件組的值。 */
  extraBody?: Record<string, unknown>;
  /** 直接加的標頭。蓋不掉認證標頭。 */
  extraHeaders?: Record<string, string>;
}

/** refusal：模型自己拒答；content_filter：服務的安全過濾擋下。完全沒有輸出時改丟 content_blocked。 */
export type StopReason = 'end' | 'length' | 'content_filter' | 'refusal' | 'other';

/** 各家的欄位對成同一組定義；拿不到的是 null，不寫 0。 */
export interface Usage {
  /** 全部的輸入，含從快取讀的與寫進快取的（Anthropic 的 input_tokens 不含，這裡加總）。 */
  inputTokens: number | null;
  /** inputTokens 裡從快取讀的。 */
  cachedInputTokens: number | null;
  /** inputTokens 裡寫進快取的（Anthropic、OpenAI Responses 與 OpenRouter 有回報）。 */
  cacheWriteInputTokens: number | null;
  /** 全部計費的輸出，含推理（Gemini 的 candidatesTokenCount 不含思考，這裡加總）。 */
  outputTokens: number | null;
  /** outputTokens 裡推理的部分（有回報的才有）。 */
  reasoningTokens: number | null;
}

export interface Cost {
  amount: number;
  currency: 'USD';
  /** true：照目錄的牌價算的估計（不含免費額度）；false：服務在回應裡回報的金額。 */
  estimated: boolean;
  pricesAsOf: string | null;
}

export interface AttemptTrace {
  startedAt: string;
  /** HTTP 狀態碼；沒拿到回應的是 null。 */
  status: number | null;
  requestId: string | null;
  /** 這一次失敗的種類；成功的是 null。 */
  error: string | null;
}

export interface Trace {
  provider: string;
  dialect: string;
  host: string;
  requestedModel: string;
  /** 服務回報實際用的模型；沒回報的是 null。 */
  resolvedModel: string | null;
  /** 最後一次的請求編號（回應標頭）。 */
  requestId: string | null;
  /** 服務給這次回應的編號（回應本文）。 */
  responseId: string | null;
  /** 實際送出的推理設定的原值；沒送的是 null。 */
  reasoningSent: string | number | null;
  rawStopReason: string | null;
  startedAt: string;
  finishedAt: string;
  attempts: AttemptTrace[];
  warnings: string[];
}

export interface GenerateResult {
  text: string;
  stopReason: StopReason;
  usage: Usage;
  cost: Cost | null;
  /** 可以原樣接在下一輪的 input 後面。 */
  message: Message;
  trace: Trace;
}

export interface ModelInfo {
  id: string;
  label: string | null;
}
