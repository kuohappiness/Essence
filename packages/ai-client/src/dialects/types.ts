// 方言的介面（內部）：只做「組請求」「讀回應」「分類錯誤」的純函式，不碰網路（docs/tasks/ai-client.md〈3〉第 5 點）。
// 請求一律要求串流：傳輸層不串流時（例如 Obsidian 的 requestUrl）一樣在最後一次解出全部事件，服務那端持續送資料，連線不會因為久沒資料被中間設備切斷。
// 新增一種方言：在這個資料夾加一個實作 Dialect 的檔、登記到 index.ts，合格測試（tests/conformance.test.ts）自動套上。
import type { AiErrorKind } from '../errors.ts';
import type { SseEvent } from '../sse.ts';
import type { AuthSpec, ContentPart, ModelInfo, ProviderOptions, StopReason, Usage } from '../types.ts';

export interface NormalizedMessage {
  role: 'user' | 'assistant';
  content: ContentPart[];
}

export interface BuildContext {
  baseUrl: string;
  model: string;
  instructions: string | undefined;
  input: NormalizedMessage[];
  maxOutputTokens: number | undefined;
  options: ProviderOptions;
}

export interface HttpCall {
  url: string;
  /** 方言自己要的標頭（例如 Anthropic 的版號）；認證與目錄的標頭由 client 加。 */
  headers?: Record<string, string>;
  /** 請求本文；檔案內容用 body.ts 的 Binary，由 client 編成位元組。 */
  body?: Record<string, unknown>;
}

export interface ParsedError {
  kind: AiErrorKind;
  message: string;
  providerCode?: string | null;
  retryAfterMs?: number | null;
}

export interface Output {
  text: string;
  stopReason: StopReason;
  rawStopReason: string | null;
  usage: Usage;
  resolvedModel: string | null;
  responseId: string | null;
  /** 服務自己回報的費用（美元），例如 OpenRouter 的 usage.cost。 */
  reportedCost: number | null;
  warnings: string[];
}

export interface StreamParser {
  /** 一個事件：回傳新的文字片段，或服務在串流裡送來的錯誤。 */
  push(event: SseEvent): { delta?: string; error?: ParsedError };
  /** 收到結束的事件了沒（沒收到就斷線算 network）。 */
  readonly complete: boolean;
  result(): Output;
}

export interface Dialect {
  readonly id: string;
  /** 自訂服務沒寫 auth 時用的預設。 */
  readonly defaultAuth: AuthSpec | null;
  /** 請求編號在哪個回應標頭。 */
  readonly requestIdHeader: string | null;
  buildGenerate(ctx: BuildContext): HttpCall;
  /** 服務沒照要求串流、直接回 JSON 時的回應本文（已 JSON.parse）。 */
  parseResponse(json: unknown): Output | { error: ParsedError };
  createStreamParser(): StreamParser;
  classifyError(status: number, body: string): ParsedError;
  /** 列模型（GET）。也是「測試連線」的預設：要金鑰才列得出來的服務，列得出來就表示金鑰對。 */
  buildListModels(baseUrl: string): HttpCall;
  parseModels(json: unknown): ModelInfo[];
}
