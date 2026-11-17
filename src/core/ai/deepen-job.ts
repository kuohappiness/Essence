import { stringify } from 'yaml';
import { parseDeck } from '../deck/index.ts';
import { freeName, rawPath, SNAPSHOT_FOLDER } from './draft.ts';
import { appendBatch, idsInDeepenBoxes, unclosedFence, verifyAppend } from './deepen-write.ts';
import type { CardForm, SentPart } from './prompt.ts';
import { PURPOSES, sha256Hex } from './prompt.ts';
import { safeFileName } from './reply.ts';
import type { RuleSubject } from './rules.ts';

// 加深的工作（tasks/ai-cards-deepen.md §3-2）：恢復資料存在這台電腦（和製卡的工作分開存，製卡的讀法會把它當成壞的）。
// 原則：同一次工作最多寫進卡組一次；一旦開始寫過，程式就不再自己重寫，認不出來的交給家長選。

interface DeepenSave {
  reply: string;
  replySha: string;
  service: string | null;
  /** 這一批（composeBatch 的結果）：框、要併進原有備註框的項目、配出的 ID。 */
  boxes: string[][];
  noteItems: string[][];
  ids: string[];
  /** 快照：位置、還沒加後綴的檔名、全文與雜湊（第 2 步就定好，重試照這份寫）。 */
  snapshotPath: string;
  snapshotBase: string;
  snapshot: string;
  snapshotSha: string;
  /** 開始寫卡組了（第 4 步）：之後不再自己重寫。 */
  writing: boolean;
  /** 寫過、但認不出寫成沒有（寫到一半中斷、或第 ② 次驗沒過）：等家長選「當作完成」或「放棄」。 */
  unclear: boolean;
  /** 卡組寫好、驗過（或家長選了當作完成、或沒有要寫的）：只剩原文與快照。 */
  written: boolean;
}

export interface DeepenJob {
  kind: 'deepen';
  id: string;
  copiedAt: string;
  copiedMs: number;
  /** 卡組路徑、複製時這一篇所有目標的 ID、複製時的全文 SHA-256（第 1 步）。 */
  deck: string;
  ids: string[];
  baseSha: string;
  form: CardForm;
  subject: Pick<RuleSubject, 'key' | 'label' | 'subject' | 'r3'>;
  parts: SentPart[];
  promptSha: string;
  /** 送出時記穩了的 ID（快照的 `記穩目標`，照 ID 排序、去重）與送出的目標數（`已有目標`）。 */
  stable: string[];
  sent: number;
  save: DeepenSave | null;
}

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const isString = (value: unknown): value is string => typeof value === 'string';
const strings = (value: unknown): value is string[] => Array.isArray(value) && value.every(isString);
const lists = (value: unknown): value is string[][] => Array.isArray(value) && value.every(strings);
const isBool = (value: unknown): value is boolean => typeof value === 'boolean';

function isSave(value: unknown): value is DeepenSave {
  return isObject(value) && isString(value.reply) && isString(value.replySha) && (value.service === null || isString(value.service)) && lists(value.boxes) && lists(value.noteItems)
    && strings(value.ids) && isString(value.snapshotPath) && isString(value.snapshotBase) && isString(value.snapshot) && isString(value.snapshotSha)
    && isBool(value.writing) && isBool(value.unclear) && isBool(value.written);
}
export function isDeepenJob(value: unknown): value is DeepenJob {
  if (!isObject(value) || value.kind !== 'deepen') return false;
  const form = value.form, subject = value.subject;
  return isString(value.id) && isString(value.copiedAt) && typeof value.copiedMs === 'number' && Number.isFinite(value.copiedMs) && isString(value.deck) && strings(value.ids) && isString(value.baseSha)
    && isObject(form) && isString(form.subject) && isString(form.term) && isString(form.unit) && PURPOSES.includes(form.purpose as CardForm['purpose']) && typeof form.supplement === 'boolean' && isString(form.adjust) && isString(form.material)
    && isObject(subject) && isString(subject.key) && isString(subject.label) && (subject.subject === null || isString(subject.subject)) && isBool(subject.r3)
    && Array.isArray(value.parts) && value.parts.length > 0 && value.parts.every(part => isObject(part) && isString(part.name) && isString(part.version) && isString(part.text) && isString(part.sha256))
    && isString(value.promptSha) && strings(value.stable) && typeof value.sent === 'number' && (value.save === null || isSave(value.save));
}

/** 還沒貼回的留 14 天；開始寫的不過期，直到完成或放棄。同一篇只留最新的一份（防重，§1 第 3 點）。 */
const JOB_DAYS = 14;
export function readDeepenJobs(value: unknown, nowMs: number): { jobs: DeepenJob[]; broken: number } {
  const list = Array.isArray(value) ? value : [];
  const jobs = list.filter(isDeepenJob).filter(job => job.save !== null || nowMs - job.copiedMs <= JOB_DAYS * 86_400_000);
  const seen = new Set<string>();
  const kept = [...jobs].sort((a, b) => Number(b.save !== null) - Number(a.save !== null) || b.copiedMs - a.copiedMs).filter(job => { if (seen.has(job.deck)) return false; seen.add(job.deck); return true; });
  return { jobs: kept, broken: list.length - list.filter(isDeepenJob).length };
}

const fileName = (path: string): string => path.slice(path.lastIndexOf('/') + 1).replace(/\.md$/, '');
const folderOf = (path: string): string => path.slice(0, path.lastIndexOf('/'));

/** 加深的快照（syntax §6）：`工作` 加深、`對象` 一項寫完整路徑、`記穩目標` 寫送出時的集合（空的寫「無」）。time 是準備寫入那一刻，之後重試沿用。 */
function deepenSnapshot(job: DeepenJob, save: Pick<DeepenSave, 'replySha' | 'service'>, edits: readonly string[], body: string, time: string): string {
  const rules = job.parts.slice(0, -1);
  const fields: Record<string, unknown> = {
    日期: time.slice(0, 10),
    時間: time,
    識別碼: job.id,
    工作: '加深',
    對象: [`[[${job.deck}|${fileName(job.deck)}]]`],
    規則版本: rules.map(part => `${part.name} ${part.version}`).join('、'),
    送出: job.parts.map(part => `${part.name} ${part.version} ${part.sha256}`),
    提示雜湊: job.promptSha,
    回覆原文: save.replySha,
    複製時間: job.copiedAt,
    已有目標: job.sent,
    記穩目標: job.stable.length ? [...new Set(job.stable)].sort() : '無',
  };
  if (job.form.material.trim()) fields['教材說明'] = job.form.material.trim();
  fields['接法'] = '複製貼上';
  if (save.service) fields['服務'] = save.service;
  fields['模型'] = '未記錄';
  if (edits.length) fields['程式改動'] = [...edits];
  return '---\n' + stringify(fields, { lineWidth: 0 }) + '---\n\n' + (body.endsWith('\n') ? body : body + '\n');
}

/** 第 2 步：組好這一批與快照，存進恢復資料。taken 是整個 vault 現在的檔名（小寫），快照檔名用掉的會加進去。 */
export function beginDeepen(job: DeepenJob, reply: string, service: string | null, batch: { boxes: string[][]; noteItems: string[][]; ids: string[]; edits: string[]; snapshotBody: string }, time: string, taken: Set<string>): DeepenJob {
  const replySha = sha256Hex(reply);
  const snapshot = deepenSnapshot(job, { replySha, service }, batch.edits, batch.snapshotBody, time);
  const snapshotBase = safeFileName(`${time.slice(0, 10)} ${fileName(job.deck)} 加深`.replace(/[ \t　]+/g, ' '));
  const empty = !batch.boxes.length && !batch.noteItems.length;
  return {
    ...job,
    save: {
      reply, replySha, service, boxes: batch.boxes, noteItems: batch.noteItems, ids: batch.ids,
      snapshotPath: `${SNAPSHOT_FOLDER}/${freeName(snapshotBase, taken)}.md`, snapshotBase, snapshot, snapshotSha: sha256Hex(snapshot),
      writing: false, unclear: false, written: empty,
    },
  };
}

/** 寫卡組的結果（state 的寫入佇列）：written 是寫進去了（confirmed：讀回核對過）；not 是寫入前就擋下、確定沒寫；timeout 是寫入逾時、不知道寫成沒有。 */
export type AppendWrite =
  | { kind: 'written'; confirmed: boolean }
  | { kind: 'not'; why: DeepenStop['why']; detail?: string }
  | { kind: 'timeout' }
  | { kind: 'failed'; error: unknown };

/** 只建立的寫入（同製卡的 CreateResult）。 */
type Create = { kind: 'done' } | { kind: 'exists' } | { kind: 'blocked'; reason: string } | { kind: 'failed'; error: unknown } | { kind: 'unreadable'; path: string; error: unknown };

export interface DeepenIo {
  store(job: DeepenJob): void;
  remove(job: DeepenJob): void;
  /** 讀檔；不存在是 null，讀不到丟錯。 */
  read(path: string): Promise<string | null>;
  displaced(path: string): boolean;
  /** 寫卡組：plan 拿到最新的全文，回傳要寫的全文或不寫的原因；會在寫入佇列裡跑（可能跑好幾次，照最後一次）。 */
  append(path: string, plan: (text: string) => { text: string } | { why: DeepenStop['why'] }): Promise<AppendWrite>;
  create(path: string, text: string): Promise<Create>;
  names(): Set<string>;
}

/** 停下來的原因（畫面換成給家長看的字）。 */
export interface DeepenStop {
  kind: 'stop';
  why: 'changed' | 'fence' | 'verify' | 'unsaved' | 'unclear' | 'blocked' | 'failed' | 'unreadable' | 'conflict' | 'name' | 'timeout' | 'phone' | 'loading' | 'needs-update' | 'displaced';
  detail?: string;
}
export type DeepenResult = { kind: 'done'; wrote: boolean } | DeepenStop;

/**
 * 第 4 步寫入回呼裡的重驗（§3-2）：還是這一篇（屬性讀得懂由 state 擋）、複製時的 ID 都還在（沒有 ID 的時候全文要和複製時相同）、
 * 沒有沒關的頂層圍欄，接好之後驗第 ① 次。回傳要寫的全文（並記下接之前的全文，第 ② 次驗用）。
 */
export function planAppend(job: DeepenJob, text: string): { text: string; before: string; merged: boolean } | { why: 'changed' | 'fence' | 'verify' } {
  const save = job.save!;
  const deck = parseDeck(text);
  // 還是一篇啟用或暫停的卡組（草稿、轉錄稿、屬性讀不懂都不寫；需要新版由寫入的門檻擋）。
  if (deck.props.isTranscript || (deck.props.status !== 'active' && deck.props.status !== 'paused') || deck.props.statusRead === 'invalid') return { why: 'changed' };
  const now = new Set(deck.targets.flatMap(t => t.id ?? []));
  if (job.ids.length ? !job.ids.every(id => now.has(id)) : sha256Hex(text) !== job.baseSha) return { why: 'changed' };
  if (unclosedFence(text)) return { why: 'fence' };
  const appended = appendBatch(text, save);
  if ('why' in appended) return { why: appended.why };
  if (!verifyAppend(text, appended.text, save, appended.merged)) return { why: 'verify' };
  return { text: appended.text, before: text, merged: appended.merged };
}

/** 照恢復資料做第 3～6 步（§3-2）。每一步改了恢復資料都先存。 */
export async function runDeepen(start: DeepenJob, io: DeepenIo): Promise<DeepenResult> {
  let job = start;
  if (!job.save) throw Error('這個加深工作還沒貼回');
  const save = (): DeepenSave => job.save!;
  const keep = (change: Partial<DeepenSave>): void => { job = { ...job, save: { ...save(), ...change } }; io.store(job); };
  const read = async (path: string): Promise<{ text: string | null } | DeepenStop> => {
    let text: string | null;
    try { text = await io.read(path); } catch { return { kind: 'stop', why: 'unreadable', detail: path }; }
    return text === null && io.displaced(path) ? { kind: 'stop', why: 'displaced' } : { text };
  };
  const finish = (): DeepenResult => { io.remove(job); return { kind: 'done', wrote: save().boxes.length > 0 || save().noteItems.length > 0 }; };

  // 第 3 步：先認快照。同一個位置、內容相同就是做完了，不動卡組。
  const snap = await read(save().snapshotPath);
  if ('kind' in snap) return snap;
  if (snap.text !== null && sha256Hex(snap.text) === save().snapshotSha) return finish();

  if (!save().written) {
    if (save().unclear) return { kind: 'stop', why: 'unclear' };
    if (save().writing) {
      // 重開時恢復資料還在、寫到一半：不再寫卡組。新 ID 全部都在這一篇的加深框裡才當作寫好了，否則交給家長。
      const found = await read(job.deck);
      if ('kind' in found) return found;
      if (found.text !== null && idsInDeepenBoxes(found.text, save().ids)) keep({ written: true });
      else { keep({ unclear: true }); return { kind: 'stop', why: 'unclear' }; }
    } else {
      // 第 4 步：先記成開始寫了，再進寫入佇列。
      keep({ writing: true });
      let planned: { before: string; merged: boolean } | null = null;
      const result = await io.append(job.deck, text => {
        const plan = planAppend(job, text);
        if ('why' in plan) { planned = null; return plan; }
        planned = plan;
        return { text: plan.text };
      });
      if (result.kind === 'not') { keep({ writing: false }); return { kind: 'stop', why: result.why, ...result.detail === undefined ? {} : { detail: result.detail } }; }
      if (result.kind === 'timeout') { keep({ unclear: true }); return { kind: 'stop', why: 'timeout' }; }
      if (result.kind === 'failed') {
        // 寫入時出錯，不知道寫進去沒有：交給家長。
        keep({ unclear: true });
        return { kind: 'stop', why: 'unclear' };
      }
      // 第 5 步：寫入後重讀，驗第 ② 次。
      const again = await read(job.deck);
      const before = planned as { before: string; merged: boolean } | null;
      if ('kind' in again || again.text === null || before === null || !verifyAppend(before.before, again.text, save(), before.merged)) { keep({ unclear: true }); return { kind: 'stop', why: 'unclear' }; }
      keep({ written: true });
    }
  }

  // 原文（送出的每一部分與回覆）：只建立；已存在而且內容相同就跳過。
  for (const text of [...job.parts.map(part => part.text), save().reply]) {
    const path = rawPath(sha256Hex(text));
    const found = await read(path);
    if ('kind' in found) return found;
    if (found.text === text) continue;
    if (found.text !== null) return { kind: 'stop', why: 'conflict', detail: path };
    const created = await io.create(path, text);
    if (created.kind === 'exists') {
      const again = await read(path);
      if ('kind' in again) return again;
      if (again.text !== text) return { kind: 'stop', why: 'conflict', detail: path };
    } else if (created.kind !== 'done') return createStop(created, path);
  }
  // 快照：位置被別人用了往後加（內容不含路徑，不用重做）。
  for (let attempt = 0; attempt < 3; attempt++) {
    const created = await io.create(save().snapshotPath, save().snapshot);
    if (created.kind === 'done') return finish();
    if (created.kind !== 'exists') return createStop(created, save().snapshotPath);
    const found = await read(save().snapshotPath);
    if ('kind' in found) return found;
    if (found.text !== null && sha256Hex(found.text) === save().snapshotSha) return finish();
    const names = io.names();
    names.add(fileName(save().snapshotPath).toLowerCase());
    keep({ snapshotPath: `${folderOf(save().snapshotPath)}/${freeName(save().snapshotBase, names)}.md` });
  }
  return { kind: 'stop', why: 'name', detail: save().snapshotPath };
}

function createStop(created: Exclude<Create, { kind: 'done' } | { kind: 'exists' }>, path: string): DeepenStop {
  if (created.kind === 'blocked') return { kind: 'stop', why: 'blocked', detail: created.reason };
  if (created.kind === 'unreadable') return { kind: 'stop', why: 'unreadable', detail: created.path };
  return { kind: 'stop', why: 'failed', detail: path };
}

/** 「結果不明」家長選了「當作完成」：不再碰卡組，接著寫原文與快照。 */
export function settleUnclear(job: DeepenJob): DeepenJob {
  return { ...job, save: { ...job.save!, unclear: false, written: true } };
}
