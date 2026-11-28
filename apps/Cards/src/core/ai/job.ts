import { PURPOSES, sha256Hex } from './prompt.ts';
import type { CardForm, ExistingTarget, SentPart } from './prompt.ts';
import type { RuleSubject } from './rules.ts';

// 待貼回的工作（tasks/ai-cards-mvp.md §3）與存草稿的恢復資料（§5）：存在這台電腦，不寫進 vault。
// 按「複製提示」的當下就存每一部分的全文；之後外掛更新、規則或模板改了，這一份照舊是當時送出的文字。

/** 一篇卡組在恢復資料裡的樣子。base：還沒加後綴的檔名，再撞名照它遞增（R4-4）。stage：pending 還沒碰 vault；started 記成開始建了（可能已經建了）；written 建好、讀回核對過（R3-1、R4-1）；rebuild 曾經開始建過、家長選了重建（L2-4：允許重建和曾經建過是兩件事，ID 照樣不再配出）。 */
export interface SavedDeck { path: string; base: string; text: string; sha256: string; ids: string[]; stage: 'pending' | 'started' | 'written' | 'rebuild'; skipped: boolean }

/** 存草稿的恢復資料（§5 第 2 步）：之後每一步都照這份寫，不重新整理、不重新查已有目標、不重新配號。 */
export interface SaveState {
  /** 家長貼上的整段（照輸入框交出的文字）與它的 SHA-256。 */
  reply: string;
  replySha: string;
  /** 貼回時選的服務；沒選是 null。 */
  service: string | null;
  /** 第 1 步的時間（快照檔名的日期）。 */
  startedAt: string;
  decks: SavedDeck[];
  snapshotPath: string;
  /** 快照還沒加後綴的檔名（SavedDeck.base 的快照版）。 */
  snapshotBase: string;
  snapshotBody: string;
  edits: string[];
  /**
   * 第 5 步（準備發布）取的 `時間`、做出的快照全文與 SHA-256、當時的 `對象`（路徑）：之後重試照存下的全文寫，對象變了才重做（L2-8）。
   * attempted：snapshotPath 這個位置開始寫過、可能已經寫成（同卡組的 started）；寫入前就擋下、確定沒寫過是 false（R5-2）。
   */
  published: { time: string; text: string; sha256: string; targets: string[]; attempted: boolean } | null;
  /**
   * 直接製作收到的那一次的證據（tasks/ai-direct.md §7，格式查核 F1）：存草稿的當下凍結，快照只看這一份；有就是 `接法: API`。
   * 改用複製貼上貼回的沒有這一欄。讀的時候照 directEvidence 判斷，讀不懂（較新的版本存的）不寫快照（F12）。
   */
  api?: DirectEvidence;
}

/** 直接製作送出的一個教材檔（§7 `教材檔`）：送出那一份的位元組的 SHA-256、PDF 的頁數（照片是 null）、檔名（只寫進 vault 的快照）。 */
export interface SentFile { sha256: string; pages: number | null; name: string }

/** 服務回報的 token 數（套件的 Usage）：拿不到的是 null，快照不寫（F6、F17）。輸入含快取讀取與寫入，輸出含推理。 */
interface DirectUsage { input: number | null; cacheRead: number | null; cacheWrite: number | null; output: number | null; reasoning: number | null }

/** 成功那一次的證據（§7）：服務名稱、要求與回報的模型、推理等級與實際送出的參數、收到的時刻、用量、費用、編號、送出的教材檔、收到的整段。 */
export interface DirectEvidence {
  /** 服務名稱（ChatGPT、Claude、Gemini、OpenRouter）：名稱只有一套，快照的 `服務` 照寫（D-244）。 */
  service: string;
  requestedModel: string;
  /** 服務回報的模型原樣；沒回報是 null（快照寫「未回報」）。 */
  model: string | null;
  /** 套件的推理等級；沒指定是 null（快照寫「未指定」）。 */
  reasoning: string | null;
  /** 套件實際送出的推理參數原值（D-232 第 3 點）；沒送是 null。 */
  reasoningSent: string | number | null;
  /** 收完的時刻（套件的 trace.finishedAt，換成帶時區的寫法）。 */
  receivedAt: string;
  usage: DirectUsage;
  /** 美元；estimated 是照牌價估計（asOf 是牌價日期），否則是服務回報。算不出來是 null。 */
  cost: { amount: number; estimated: boolean; asOf: string | null } | null;
  requestId: string | null;
  responseId: string | null;
  files: SentFile[];
  /** 收到的整段（套件的 result.text）與它的 SHA-256；和輸入框交出的不同時快照多寫 `收到的回覆`（F3）。 */
  text: string;
  sha256: string;
}

/**
 * 直接製作的工作（§7 `api`，這台電腦的資料）：最後一次送出的狀態（sending 送出中、received 收到、failed 失敗，kind 是失敗的種類）、
 * 送出的教材檔；收到時另存那一次的證據與整段（F2：收到後、存草稿前被關掉，重開不用再付一次錢）。
 * 狀態與種類照字串收（F12：之後的版本可能加新的值）。charged：拿到回應之後才失敗，可能已經計費，重開後的「重送」照樣寫會再計費；沒有這一欄是 false。
 */
export interface DirectJob { state: string; kind: string | null; at: string; files: SentFile[]; received: DirectEvidence | null; charged?: boolean }

export interface CardJob {
  /** 6 碼，和考試範圍同一套產生法。 */
  id: string;
  /** 按「複製提示」的時間（帶時區）與毫秒（過期用）。 */
  copiedAt: string;
  copiedMs: number;
  form: CardForm;
  /** 複製時的科目（規則表之後可能改）。 */
  subject: Pick<RuleSubject, 'key' | 'label' | 'subject' | 'r3'>;
  parts: SentPart[];
  promptSha: string;
  existing: ExistingTarget[];
  save: SaveState | null;
  /** 直接製作的工作才有（§7）；舊的工作與複製貼上的沒有。讀的時候照 directJob 判斷，讀不懂就當成複製貼上的工作（F12）。 */
  api?: DirectJob;
}

/** 最多留 5 個、14 天；過期的只丟還沒開始存草稿的（§3）。直接製作收到回覆、還沒存的不算進 5 個（tasks/ai-direct.md §7，F2）。 */
const JOB_LIMIT = 5;
const JOB_DAYS = 14;

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const isString = (value: unknown): value is string => typeof value === 'string';
const strings = (value: unknown): value is string[] => Array.isArray(value) && value.every(isString);
const optString = (value: unknown): value is string | null => value === null || isString(value);
const count = (value: unknown): value is number | null => value === null || (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0);
/** 選填的物件欄：沒有，或是物件（裡面不看，F12：壞的 `api` 不讓整份工作失效）。 */
const optObject = (value: unknown): boolean => value === undefined || isObject(value);

function isFile(value: unknown): value is SentFile {
  return isObject(value) && isString(value.sha256) && /^[0-9a-f]{64}$/.test(value.sha256) && (value.pages === null || (typeof value.pages === 'number' && Number.isSafeInteger(value.pages) && value.pages > 0)) && isString(value.name);
}
/** 讀得懂的證據才回傳；讀不懂（缺欄、型別不對）是 null。多的欄不管（之後的版本只加不改）。 */
export function directEvidence(value: unknown): DirectEvidence | null {
  if (!isObject(value)) return null;
  const usage = value.usage, cost = value.cost;
  const ok = isString(value.service) && isString(value.requestedModel) && optString(value.model) && optString(value.reasoning)
    && (value.reasoningSent === null || isString(value.reasoningSent) || (typeof value.reasoningSent === 'number' && Number.isFinite(value.reasoningSent)))
    && isString(value.receivedAt) && isObject(usage) && count(usage.input) && count(usage.cacheRead) && count(usage.cacheWrite) && count(usage.output) && count(usage.reasoning)
    && (cost === null || (isObject(cost) && typeof cost.amount === 'number' && Number.isFinite(cost.amount) && cost.amount >= 0 && typeof cost.estimated === 'boolean' && optString(cost.asOf)))
    && optString(value.requestId) && optString(value.responseId) && Array.isArray(value.files) && value.files.every(isFile) && isString(value.text) && isString(value.sha256) && sha256Hex(value.text) === value.sha256;
  return ok ? value as unknown as DirectEvidence : null;
}
/** 這份工作（製卡或加深，§9）的直接製作資料；沒有或讀不懂是 null（讀不懂的當成複製貼上的工作，F12）。 */
export function directJob(job: { api?: unknown }): DirectJob | null {
  const api: unknown = job.api;
  if (!isObject(api) || !isString(api.state) || !optString(api.kind) || !isString(api.at) || !Array.isArray(api.files) || !api.files.every(isFile)) return null;
  if (api.charged !== undefined && typeof api.charged !== 'boolean') return null;
  if (api.received !== null && directEvidence(api.received) === null) return null;
  return api as unknown as DirectJob;
}
/** 收到回覆、還沒開始存草稿的直接製作（F2）：不算進「沒開始存草稿的最多 5 個」，仍照 14 天過期。 */
const holdsReply = (job: CardJob): boolean => job.save === null && directJob(job)?.received != null;

function isPart(value: unknown): value is SentPart {
  return isObject(value) && isString(value.name) && isString(value.version) && isString(value.text) && isString(value.sha256);
}
function isForm(value: unknown): value is CardForm {
  return isObject(value) && isString(value.subject) && isString(value.term) && isString(value.unit) && PURPOSES.includes(value.purpose as CardForm['purpose'])
    && typeof value.supplement === 'boolean' && (value.pick === undefined || typeof value.pick === 'boolean') && isString(value.adjust) && isString(value.material);
}
function isExisting(value: unknown): value is ExistingTarget {
  return isObject(value) && isString(value.id) && isString(value.name) && isString(value.source) && isString(value.path) && (value.first === undefined || isString(value.first));
}
function isDeck(value: unknown): value is SavedDeck {
  return isObject(value) && isString(value.path) && isString(value.base) && isString(value.text) && isString(value.sha256) && strings(value.ids)
    && (value.stage === 'pending' || value.stage === 'started' || value.stage === 'written' || value.stage === 'rebuild') && typeof value.skipped === 'boolean';
}
function isSave(value: unknown): value is SaveState {
  if (!isObject(value)) return false;
  const published = value.published;
  return isString(value.reply) && isString(value.replySha) && (value.service === null || isString(value.service)) && isString(value.startedAt)
    && Array.isArray(value.decks) && value.decks.every(isDeck) && isString(value.snapshotPath) && isString(value.snapshotBase) && isString(value.snapshotBody) && strings(value.edits)
    && (published === null || (isObject(published) && isString(published.time) && isString(published.text) && isString(published.sha256) && strings(published.targets) && typeof published.attempted === 'boolean'))
    && optObject(value.api);
}
/** 這份是不是完整的工作；缺欄位的不能貼回（§3：沒有送出的證據就不建快照）。 */
export function isJob(value: unknown): value is CardJob {
  if (!isObject(value)) return false;
  const subject = value.subject;
  return isString(value.id) && isString(value.copiedAt) && typeof value.copiedMs === 'number' && Number.isFinite(value.copiedMs) && isForm(value.form)
    && isObject(subject) && isString(subject.key) && isString(subject.label) && (subject.subject === null || isString(subject.subject)) && typeof subject.r3 === 'boolean'
    && Array.isArray(value.parts) && value.parts.length > 0 && value.parts.every(isPart) && isString(value.promptSha)
    && Array.isArray(value.existing) && value.existing.every(isExisting) && (value.save === null || isSave(value.save)) && optObject(value.api);
}

/**
 * 讀這台電腦存的工作：讀不懂的那一份記成 broken（沒開始存草稿的才可能，畫面請家長重新複製）；沒開始存草稿的過了 14 天、或超過 5 個（舊的先丟）就拿掉。
 * 開始存草稿的不過期，直到發布、清理或放棄（§5）。
 */
export function readJobs(value: unknown, nowMs: number): { jobs: CardJob[]; broken: number; expired: number } {
  const list = Array.isArray(value) ? value : [];
  const jobs = list.filter(isJob);
  const fresh = jobs.filter(job => job.save !== null || nowMs - job.copiedMs <= JOB_DAYS * 86_400_000);
  const unsaved = fresh.filter(job => job.save === null && !holdsReply(job)).sort((a, b) => b.copiedMs - a.copiedMs);
  const keep = new Set([...fresh.filter(job => job.save !== null || holdsReply(job)), ...unsaved.slice(0, JOB_LIMIT)]);
  return { jobs: jobs.filter(job => keep.has(job)), broken: list.length - jobs.length, expired: jobs.length - keep.size };
}

/** 沒完成的工作配好的 ID（§5〈ID 的預留〉）：跳過的篇不算（它們的 ID 已經照規則拿掉或記進不再配出的清單）。 */
export function reservedIds(jobs: readonly CardJob[]): string[] {
  return jobs.flatMap(job => job.save?.decks.filter(deck => !deck.skipped).flatMap(deck => deck.ids) ?? []);
}
