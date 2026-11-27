// 直接製作（apps/Cards/docs/tasks/ai-direct.md §4～§6）：教材的檢查、組請求、送出前寫給家長看的那一行、這一家的上限、送出，
// 與每一種結果給家長看的一句話和下一步。不碰 Obsidian：選檔、讀 PDF 頁數、拿金鑰由呼叫端做好交進來。
import { sha256Hex, stamp } from '../ai/index.ts';
import type { DirectEvidence, SentFile } from '../ai/index.ts';
import { describeAiError, isAiError } from './client.ts';
import type { AiClient, AiErrorKind, GenerateRequest, GenerateResult, InputKind, ProgressEvent, ProviderSpec } from './client.ts';
import { modelOf } from './connection.ts';
import type { Connection } from './connection.ts';

/** 家長選的一個教材檔（§5）：照原樣送出，不切頁、不轉檔，內容不存。 */
export interface Material {
  name: string;
  mediaType: MaterialType;
  data: Uint8Array;
  /** PDF 的總頁數；讀不出來（加密、壞檔）是 null。照片不用。 */
  pages: number | null;
  /** 這一份位元組的 SHA-256（快照的 `教材檔`，§7）：選檔時算一次。 */
  sha256: string;
}
export type MaterialType = 'application/pdf' | 'image/jpeg' | 'image/png';

/** 快照與工作記的教材檔（§7 `教材檔`）：照送出的順序，PDF 記頁數、照片記 null；檔名只寫進 vault，不送給服務（F16）。 */
export function sentFiles(materials: readonly Material[]): SentFile[] {
  return materials.map(material => ({ sha256: material.sha256, pages: material.mediaType === 'application/pdf' ? material.pages : null, name: material.name }));
}

/** 一次最多（§5）：一課通常 10～20 頁；也擋住整本送出。 */
const MAX_PDF_PAGES = 30;
const MAX_IMAGES = 10;
/** 含推理的輸出上限（§4 第 3 步）：超過就是截斷。 */
const MAX_OUTPUT_TOKENS = 32_000;
/** 一課的輸出量（§3，architecture §6 的用量估計，含推理）：之後照快照裡實際的用量調。 */
const EXPECTED_OUTPUT = { low: 3_000, high: 10_000 };

const TYPES: Record<string, MaterialType> = { pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png' };
/** 檔名的副檔名對到的種類；不收的是 null（§5：PDF、JPG、PNG）。 */
export function materialType(name: string): MaterialType | null {
  const dot = name.lastIndexOf('.');
  return dot < 0 ? null : TYPES[name.slice(dot + 1).toLowerCase()] ?? null;
}
const isPdf = (material: Material): boolean => material.mediaType === 'application/pdf';

/** 選好的教材能不能送（§5）：不能送時是給家長看的一句話。 */
export function materialProblem(materials: readonly Material[]): string | null {
  if (!materials.length) return '先選這一課的教材檔（PDF 或照片）。';
  const empty = materials.find(material => material.data.length === 0);
  if (empty) return `「${empty.name}」是空的檔，請重新選。`;
  const unread = materials.find(material => isPdf(material) && material.pages === null);
  if (unread) return `「${unread.name}」讀不出頁數（可能加密或壞掉），請改用照片，或改用複製提示。`;
  const pages = materials.reduce((sum, material) => sum + (isPdf(material) ? material.pages ?? 0 : 0), 0);
  if (pages > MAX_PDF_PAGES) return `PDF 一共 ${String(pages)} 頁，一次最多 ${String(MAX_PDF_PAGES)} 頁；請先切出這一課的頁面，或分兩次做。`;
  const images = materials.filter(material => !isPdf(material)).length;
  if (images > MAX_IMAGES) return `照片一次最多 ${String(MAX_IMAGES)} 張，這次選了 ${String(images)} 張；請分兩次做。`;
  return null;
}

/** 這一家、這個模型收不收得下（§4〈送出前〉）：照目錄寫的上限與模型收的輸入，收不下時是給家長看的一句話。目錄沒寫的不擋（送出時套件再查一次）。 */
export function providerProblem(provider: ProviderSpec, model: string, materials: readonly Material[], promptChars: number): string | null {
  const inputs: readonly InputKind[] | undefined = provider.models.find(each => each.id === model)?.inputs ?? provider.defaults?.inputs;
  if (inputs && materials.some(isPdf) && !inputs.includes('pdf')) return '這個模型不收 PDF；請到設定頁換一個模型，或改用照片。';
  if (inputs && materials.some(material => !isPdf(material)) && !inputs.includes('image')) return '這個模型不收照片；請到設定頁換一個模型，或改用 PDF。';
  const limits = provider.limits ?? {};
  const pages = materials.reduce((sum, material) => sum + (isPdf(material) ? material.pages ?? 0 : 0), 0);
  if (limits.maxPdfPages !== undefined && pages > limits.maxPdfPages) return `這一家一次最多 ${String(limits.maxPdfPages)} 頁，請切成小一點的檔。`;
  const bytes = materials.reduce((sum, material) => sum + material.data.length, 0);
  const tooBig = `這一家一次收不下這麼大的檔（最多約 ${megabytes(limits.maxFileBytes ?? limits.maxRequestBytes ?? 0)}），請切成小一點的檔，或把照片拍小一點。`;
  if (limits.maxFileBytes !== undefined && bytes > limits.maxFileBytes) return tooBig;
  // 整個請求本文：檔案轉成 base64 約多三分之一，提示的字最多 3 個位元組（UTF-8）。
  if (limits.maxRequestBytes !== undefined && Math.ceil(bytes / 3) * 4 + promptChars * 3 > limits.maxRequestBytes) return tooBig;
  return null;
}
const megabytes = (bytes: number): string => `${String(Math.floor(bytes / 1_000_000))} MB`;

/** 送出的請求（§4 第 2、3 步）：提示和「複製提示」的完全一樣，教材檔當附件放在提示前面；推理等級照設定，「照服務的預設」不送。 */
export function directRequest(input: {
  connection: Connection; provider: ProviderSpec; apiKey: string; prompt: string; materials: readonly Material[];
  signal?: AbortSignal; onProgress?: (event: ProgressEvent) => void;
}): GenerateRequest {
  // 檔名可能帶孩子的名字，送給服務的一律換成代稱（格式查核 F16）；真正的檔名只寫進 vault 的快照。照片本來就不帶檔名。
  let pdfs = 0;
  const files = input.materials.map(material => isPdf(material)
    ? { type: 'file' as const, mediaType: material.mediaType, data: material.data, name: `material-${++pdfs}.pdf`, ...material.pages === null ? {} : { pages: material.pages } }
    : { type: 'image' as const, mediaType: material.mediaType, data: material.data });
  const { reasoning } = input.connection;
  return {
    endpoint: { provider: input.provider.id },
    apiKey: input.apiKey,
    model: modelOf(input.connection, input.provider),
    input: [{ role: 'user', content: [...files, { type: 'text', text: input.prompt }] }],
    ...reasoning === 'default' ? {} : { reasoning },
    maxOutputTokens: MAX_OUTPUT_TOKENS,
    ...input.signal ? { signal: input.signal } : {},
    ...input.onProgress ? { onProgress: input.onProgress } : {},
  };
}

/** 送出前寫在按鈕旁邊的一行（§4〈送出前〉）：會送出什麼、哪個模型、約多少錢。 */
export function sendingLine(client: AiClient, provider: ProviderSpec, request: GenerateRequest, materials: readonly Material[], promptChars: number): string {
  const model = provider.models.find(each => each.id === request.model);
  const what = [...materials.filter(isPdf).map(material => `${material.name}（${String(material.pages ?? 0)} 頁）`), ...photos(materials), `規則與任務段${characters(promptChars)}`];
  let cost: string;
  try {
    const estimate = client.estimate(request, { expectedOutputTokens: EXPECTED_OUTPUT });
    cost = estimate ? `約 US$${dollars(estimate.low)}～${dollars(estimate.high)}（照牌價估計，不含免費額度）` : '不知道這個模型的價格';
  } catch {
    cost = '估不出費用';
  }
  return `會送出：${what.join('、')}；${model?.label ?? request.model}，${cost}`;
}
function photos(materials: readonly Material[]): string[] {
  const images = materials.filter(material => !isPdf(material));
  if (images.length === 1) return [images[0].name];
  return images.length ? [`照片 ${String(images.length)} 張`] : [];
}
/** 「約 2 萬字」「1,240 字」。 */
function characters(chars: number): string {
  return chars >= 10_000 ? `約 ${trim((chars / 10_000).toFixed(1))} 萬字` : `約 ${grouped(chars)} 字`;
}
const trim = (text: string): string => text.replace(/\.0$/, '');
/** 「1,240」：核心不用 toLocaleString（照執行環境的語系，ESLint 擋）。 */
const grouped = (n: number): string => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
/** 美元：一分以上寫到分，不到一分寫一位有效數字（不寫成 0.00）。 */
function dollars(amount: number): string {
  if (amount <= 0) return '0';
  return amount >= 0.01 ? amount.toFixed(2) : amount.toPrecision(1);
}

/** 收完之後畫面最後一行（§4 第 6 步）：實際的用量與費用；服務回報的費用照它寫、不寫「估計」。照存下的證據寫，重開 Obsidian 之後也一樣。 */
export function usageLine(result: Pick<DirectEvidence, 'usage' | 'cost'>): string {
  const { input, output } = result.usage;
  const used = [input === null ? null : `輸入 ${tokens(input)}`, output === null ? null : `輸出 ${tokens(output)}`].filter(each => each !== null);
  const head = used.length ? `這次用了${used.join('、')} token` : '服務沒有回報用量';
  const cost = result.cost ? `，約 US$${result.cost.amount > 0 ? result.cost.amount.toPrecision(2) : '0'}（${result.cost.estimated ? '照牌價估計' : '服務回報'}）` : '';
  return `${head}${cost}`;
}
/** 「1.8 萬」「4 千」「850」。 */
function tokens(n: number): string {
  if (n >= 10_000) return `${trim((n / 10_000).toFixed(1))} 萬`;
  if (n >= 1_000) return `${trim((n / 1_000).toFixed(1))} 千`;
  return String(n);
}

/** 套件回報的 token 數：不是非負整數的當成沒回報（存進工作之後要讀得回來，F12）。 */
const tokenCount = (value: number | null): number | null => value !== null && Number.isSafeInteger(value) && value >= 0 ? value : null;

/**
 * 成功那一次的證據（§7）：files 是這一次送出的教材檔，reasoning 是設定頁的推理等級（照服務的預設是 null），now 是收到的當下（取時區）。
 * 收到的時刻用套件的 trace.finishedAt；讀不出來才用 now。收到的整段用 result.text（套件遮過金鑰的整段，不自己累加串流的片段）。
 */
export function evidenceOf(result: GenerateResult, files: readonly SentFile[], reasoning: string | null, now: { ms: number; offset: number }): DirectEvidence {
  const { trace, usage, cost } = result;
  const finished = Date.parse(trace.finishedAt);
  return {
    provider: trace.provider, requestedModel: trace.requestedModel, model: trace.resolvedModel, reasoning, reasoningSent: trace.reasoningSent,
    receivedAt: stamp(Number.isFinite(finished) ? finished : now.ms, now.offset),
    usage: { input: tokenCount(usage.inputTokens), cacheRead: tokenCount(usage.cachedInputTokens), cacheWrite: tokenCount(usage.cacheWriteInputTokens), output: tokenCount(usage.outputTokens), reasoning: tokenCount(usage.reasoningTokens) },
    cost: cost && Number.isFinite(cost.amount) && cost.amount >= 0 ? { amount: cost.amount, estimated: cost.estimated, asOf: cost.estimated ? cost.pricesAsOf : null } : null,
    requestId: trace.requestId, responseId: trace.responseId,
    files: files.map(file => ({ ...file })), text: result.text, sha256: sha256Hex(result.text),
  };
}

/**
 * 送不成的一種情況（§6 的表）：kind 是套件的錯誤種類或停止原因；afterResponse 是服務已經回了成功的狀態碼才斷（可能已經計費），重送要先問。
 * settings：下一步要到設定頁。
 */
export interface DirectFailure {
  kind: AiErrorKind | 'length' | 'content_filter' | 'refusal' | 'other' | 'empty';
  text: string;
  next: string;
  afterResponse: boolean;
  settings: boolean;
}

const SETTINGS_NEXT = '到設定頁的「AI 連線」重貼金鑰，按「測試連線」';
/** §6 的表：每一種一句話與下一步。沒列到的種類照「其他」。 */
const FAILURES: Partial<Record<DirectFailure['kind'], { text: string; next: string; settings?: boolean }>> = {
  auth: { text: '金鑰不對，或這把金鑰不能用這個模型。', next: SETTINGS_NEXT, settings: true },
  permission: { text: '金鑰不對，或這把金鑰不能用這個模型。', next: SETTINGS_NEXT, settings: true },
  quota: { text: '這一家的額度或餘額用完了。', next: '明天再送、到那一家儲值，或改用複製貼上。' },
  rate_limit: { text: '一下子送太多次，AI 那邊請你等一下。', next: '等幾分鐘再送。' },
  network: { text: '連不上，請確認網路。', next: '確認網路之後重送。' },
  timeout: { text: '等了 30 分鐘還沒收完。', next: '重送，或到設定頁換一個模型。' },
  input_too_large: { text: '這份教材太大，這一家一次收不下。', next: '切成小一點的檔再送。' },
  unsupported_input: { text: '這個模型不收這種教材。', next: '到設定頁換一個模型，或改用另一種檔（PDF 或照片）。', settings: true },
  model_not_found: { text: '找不到設定的模型。', next: '到設定頁換模型，按「測試連線」。', settings: true },
  content_blocked: { text: 'AI 拒絕回答這份教材。', next: '到設定頁換一個模型，或改用複製貼上。' },
  length: { text: '回答太長被截斷了。', next: '切成小一點的檔再送。' },
  content_filter: { text: 'AI 拒絕回答這份教材。', next: '到設定頁換一個模型，或改用複製貼上。' },
  refusal: { text: 'AI 拒絕回答這份教材。', next: '到設定頁換一個模型，或改用複製貼上。' },
  other: { text: 'AI 沒有正常回完。', next: '重送，或改用複製貼上。' },
  empty: { text: 'AI 回了空的內容。', next: '重送，或到設定頁換一個模型。' },
  cancelled: { text: '已取消；如果 AI 已經開始做，這一次可能仍會計費。', next: '' },
};
const AFTER_RESPONSE = { text: '收到一部分就斷了；這一次可能已經計費。', next: '要重送嗎？重送會再計費一次。' };

/** 套件丟的錯換成 §6 的一句話。 */
function failureOf(error: unknown): DirectFailure {
  if (!isAiError(error)) return { kind: 'unknown', text: '出了沒預料到的錯。', next: '重送；一直這樣，請改用複製貼上，並回報給開發者。', afterResponse: false, settings: false };
  if (error.afterResponse && error.kind !== 'cancelled' && error.kind !== 'content_blocked') return { kind: error.kind, ...AFTER_RESPONSE, afterResponse: true, settings: false };
  if (error.kind === 'overloaded' || error.kind === 'server') {
    return { kind: error.kind, text: `AI 那邊太忙或出錯，送了 ${String(error.attempts)} 次都沒成功。`, next: '等幾分鐘再送，或到設定頁換一個模型。', afterResponse: false, settings: false };
  }
  if (error.kind === 'invalid_request') return { kind: error.kind, text: `設定有問題：${describeAiError(error)}`, next: '到設定頁換模型，按「測試連線」。', afterResponse: false, settings: true };
  const known = FAILURES[error.kind];
  if (known) return { kind: error.kind, text: known.text, next: known.next, afterResponse: false, settings: known.settings ?? false };
  return { kind: error.kind, text: `出了沒預料到的錯：${describeAiError(error)}`, next: '重送；一直這樣，請改用複製貼上，並回報給開發者。', afterResponse: false, settings: false };
}

/** 收到了，但沒有正常結束（§6 的表：截斷、被擋、拒答）；正常結束是 null。服務已經回了，所以都可能已經計費。 */
function stopFailure(result: Pick<GenerateResult, 'stopReason' | 'text'>): DirectFailure | null {
  const kind = result.stopReason === 'end' ? (result.text.trim() ? null : 'empty') : result.stopReason;
  if (kind === null) return null;
  const known = FAILURES[kind] ?? FAILURES.other!;
  return { kind, text: known.text, next: known.next, afterResponse: false, settings: false };
}

/**
 * 送一次：成功是收到的整段；不成功是 §6 的一句話，error 是套件丟的錯（給錯誤紀錄，§8），result 是收到了但沒有正常結束的那一份，
 * partial 是已經收到的文字（沒有是 null）。
 */
export async function sendDirect(client: AiClient, request: GenerateRequest): Promise<
  | { ok: true; result: GenerateResult }
  | { ok: false; failure: DirectFailure; error: unknown; result: GenerateResult | null; partial: string | null }
> {
  let result: GenerateResult;
  try {
    result = await client.generate(request);
  } catch (error) {
    return { ok: false, failure: failureOf(error), error, result: null, partial: isAiError(error) ? error.partialText : null };
  }
  const failure = stopFailure(result);
  return failure ? { ok: false, failure, error: null, result, partial: result.text || null } : { ok: true, result };
}
