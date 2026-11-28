import { frontmatterLines, linesOf, listTree, parseDeck, TRAILING_ID } from '../deck/index.ts';
import { blocksOf, calloutHead, fenceCloses } from './check.ts';
import { linked } from './draft.ts';
import { titlePrefix } from './prompt.ts';
import type { CardForm } from './prompt.ts';
import { introBoxes } from './intro.ts';
import { checkPiece, nameLineIds, normalizeReply, quoteLine, segmentReply } from './reply.ts';
import type { Normalized, ReplyIssue } from './reply.ts';
import type { RuleSubject } from './rules.ts';

// 加深交回的內容寫進那一篇（tasks/ai-cards-deepen.md §3-1、syntax §2-9〈加深的草稿〉）：檢查、組成一批框、接在檔尾、寫入前後驗。只算文字，不碰 vault。

/** 加深那一批的三種框名（只有加深會寫）與備註框名。 */
const DEEPEN_BOXES = { deepen: '加深的學習目標', existing: '加進已有的學習目標（加深）', candidate: '候選卡片（加深）' } as const;
const NOTE_TITLE = '給家長的備註';
const NOTE = /^給(家長|學習者)的備註$/;
/** 回覆裡沒有新內容時 AI 寫的那一句（§2-2 加深的規則）。 */
const NOTHING = '這一節目前沒有更深的內容';
const BOX_PREFIX = /^\s{0,3}> ?/;
/** 框的位置與摺疊由程式排（§3-1），回覆裡怎麼排都不提示。 */
const PLACED = new Set(['candidate-folded', 'note-position', 'candidate-position', 'existing-position']);

/** 這一篇現在的學習目標：補題只轉成這些目標的連結（D-190 第 4 點）。 */
export interface DeepenDeck { path: string; targets: ReadonlyMap<string, string> }

export interface DeepenInspection {
  normalized: Normalized;
  ended: boolean;
  errors: ReplyIssue[];
  hints: ReplyIssue[];
  /** 卡組段裡框以外的行（新的學習目標與小標題，整理後的行號）。 */
  body: number[];
  /** AI 的「加進已有的學習目標」「候選卡片」框裡的行（去掉標題行，整理後的行號，前綴照原文）。 */
  existing: number[];
  candidates: number[];
  /** 給家長的備註：每一項的行（去掉框前綴）。 */
  notes: string[][];
  /** 新目標與候選的名稱行（整理後的行號）：寫入前在行尾配 ID。 */
  names: number[];
  /** 補題：整理後的行號、ID、能不能轉成這一篇的連結。 */
  adds: { line: number; id: string; name: string | null }[];
  /** AI 自己寫的 ID：拿掉、記進快照的 `程式改動`。 */
  removed: { line: number; text: string }[];
  counts: { targets: number; prompts: number; adds: number; candidates: number; notes: number };
  /** 只寫了「這一節目前沒有更深的內容」（本文或唯一的備註）：不寫卡組，只寫快照（§3-2）。 */
  nothing: boolean;
}

const byLine = (a: ReplyIssue, b: ReplyIssue): number => a.line - b.line;
/** 一個框的內文（去掉前綴）切成最上層的項目；不是清單的非空行各自算一項（照原文加 `- `）。 */
function itemsOf(inner: readonly string[]): string[][] {
  const roots = listTree(inner.map(raw => ({ raw, eol: '\n' })), 0);
  const covered = new Set(roots.flatMap(root => Array.from({ length: root.end - root.line }, (_, i) => root.line + i)));
  const items: { at: number; lines: string[] }[] = roots.map(root => ({ at: root.line, lines: inner.slice(root.line, root.end) }));
  inner.forEach((line, i) => { if (!covered.has(i) && line.trim()) items.push({ at: i, lines: [`- ${line.trim()}`] }); });
  return items.sort((a, b) => a.at - b.at).map(each => {
    const lines = [...each.lines];
    while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
    return lines;
  });
}
/** 只寫了「這一節目前沒有更深的內容」（可能加了清單符號、句號）。 */
const onlyNothing = (lines: readonly string[]): boolean => {
  const words = lines.map(line => line.replace(BOX_PREFIX, '').replace(/^\s*(?:[-*+]|\d+[.)])\s+/, '').replace(/[。.！!]\s*$/, '').trim()).filter(Boolean);
  return words.length === 1 && words[0] === NOTHING;
};

/**
 * 卡組段的第一個非空行是這一篇的篇名時拿掉（U3 比較測試 2026-11-28：製卡規則〈分篇與檔名〉要寫篇名，AI 加深時照寫，
 * 8 篇英文加深都被當成清單跑掉擋下）。加深一次只有一篇，不拆篇：只認第一個非空行整行、和這次的單元相同
 * （照拆篇的認法：等於篇名開頭或它加一個空白再加篇名，或等於這一篇的檔名；可以寫成標題），別的單元照樣檢查。
 */
function withoutTitle(range: number[], lines: readonly string[], form: CardForm, subject: Pick<RuleSubject, 'subject'>, path: string): number[] {
  const at = range.findIndex(no => lines[no].trim() !== '');
  if (at < 0) return range;
  const text = lines[range[at]].replace(/^ {0,3}#{1,6}\s+/, '').replace(/[ \t　]+/g, ' ').trim();
  const prefix = titlePrefix(form, subject);
  const file = path.replace(/^.*\//, '').replace(/\.md$/i, '');
  const same = text === file || (prefix !== null && (text === prefix || text.startsWith(prefix + ' ')));
  return same ? [...range.slice(0, at), ...range.slice(at + 1)] : range;
}

/**
 * 檢查加深的回覆（§3-1）：整理與分段沿用製卡；卡組段不拆篇，框以外的是新的學習目標，AI 的三種框分開收。
 * 卡組段沒有任何目標也可以，只要有備註、或寫了「這一節目前沒有更深的內容」。
 */
export function inspectDeepen(reply: string, form: CardForm, subject: Pick<RuleSubject, 'subject' | 'r3'>, deck: DeepenDeck): DeepenInspection {
  const normalized = normalizeReply(reply);
  const { lines, raw } = normalized;
  const segments = segmentReply(normalized, subject.r3);
  const range = withoutTitle(Array.from({ length: Math.max(0, segments.end - segments.start) }, (_, i) => segments.start + i), lines, form, subject, deck.path);
  const nothing = onlyNothing(range.map(no => lines[no]));
  // 只寫了那一句時，不算「不是卡組的內容」（非 R3 的科目第一行就是它）。
  const errors = segments.errors.filter(each => !(nothing && each.message.startsWith('第一行')));
  const hints: ReplyIssue[] = [];
  const empty = (): DeepenInspection => ({ normalized, ended: segments.ended, errors, hints, body: [], existing: [], candidates: [], notes: [], names: [], adds: [], removed: [], counts: { targets: 0, prompts: 0, adds: 0, candidates: 0, notes: 0 }, nothing: false });
  if (errors.length) return finish(reply, empty());
  if (nothing) return finish(reply, { ...empty(), nothing: true });

  const body: number[] = [], existing: number[] = [], candidates: number[] = [], notes: string[][] = [];
  for (const block of blocksOf(range.map(no => ({ no, raw: lines[no] })))) {
    if (block.kind !== 'callout') {
      // 區塊只給開頭一行：到下一個區塊之前都屬於它。
      continue;
    }
    // 同一塊裡可能接了好幾個框（中間沒有外部空行）：照標題行切開。
    let title: string | null = null;
    let inner: number[] = [];
    const flush = (): void => {
      if (title === null) return;
      if (title === '加進已有的學習目標') existing.push(...inner);
      else if (title === '候選卡片') candidates.push(...inner);
      else if (NOTE.test(title)) notes.push(...itemsOf(inner.map(no => lines[no].replace(BOX_PREFIX, ''))));
      else errors.push({ line: raw[block.line], message: `認不得的引言框「${title}」：加深只收新的學習目標、加進已有的學習目標、候選卡片與給家長的備註` });
    };
    for (const line of block.body) {
      const head = calloutHead(line.raw);
      if (head) { flush(); title = head.title; inner = []; continue; }
      if (title === null) { errors.push({ line: raw[line.no], message: '引言框沒有標題行（例如 `> [!note] 候選卡片`）' }); title = ''; continue; }
      inner.push(line.no);
    }
    flush();
  }
  const inBox = new Set(blocksOf(range.map(no => ({ no, raw: lines[no] }))).filter(block => block.kind === 'callout').flatMap(block => block.body.map(line => line.no)));
  for (const no of range) if (!inBox.has(no)) body.push(no);
  while (body.length && !lines[body[0]].trim()) body.shift();
  while (body.length && !lines[body[body.length - 1]].trim()) body.pop();

  // 整段卡組段照製卡的檢查跑一次（框與本文的寫法都在裡面）。
  const text = range.map(no => lines[no]).join('\n');
  const rawLine = (line: number): number => raw[range[line]] ?? 0;
  const checked = checkPiece(text, rawLine, subject, form, PLACED);
  errors.push(...checked.errors.filter(each => !each.message.startsWith('這一篇')));
  hints.push(...checked.hints);
  const parsed = parseDeck(text);
  const result = checked.result;
  const names: number[] = [], removed: DeepenInspection['removed'] = [];
  const own = [...parsed.targets.filter(t => !t.implicit).map(t => t.line), ...result.candidates.map(t => t.line - 1)];
  const textLines = text.split('\n');
  for (const line of own) {
    const ids = nameLineIds(textLines[line]);
    if (ids.error) { errors.push({ line: rawLine(line), message: ids.error }); continue; }
    if (ids.trailing !== null) {
      const match = TRAILING_ID.exec(textLines[line]);
      removed.push({ line: range[line], text: match ? match[0].trim() : '^' + ids.trailing });
      hints.push({ line: rawLine(line), message: `AI 自己寫了 ID「^${ids.trailing}」：拿掉，寫入時重配` });
    }
    names.push(range[line]);
  }
  // 最上層直接寫題目的目標沒有名稱行，放進框裡之後讀不出名稱：請 AI 補名稱（製卡會自動補，加深是放進框裡等家長加入）。
  for (const t of parsed.targets.filter(t => t.implicit)) errors.push({ line: rawLine(t.line), message: '這一題沒有學習目標的名稱：加深的新目標要寫名稱（`- 能……`），題目放在底下' });
  const adds = result.existing.map(each => {
    const id = each.id ?? /^(\S+)/.exec(each.name)?.[1] ?? '';
    const name = deck.targets.get(id) ?? null;
    if (name === null) hints.push({ line: rawLine(each.line - 1), message: `「${id}」不是這一篇現在的學習目標：照原文留在框裡，加入時不會寫到別篇` });
    return { line: range[each.line - 1], id, name };
  });
  const prompts = parsed.targets.reduce((sum, t) => sum + t.prompts.length, 0);
  const only = !parsed.targets.length && !adds.length && !result.candidates.length && !body.some(no => lines[no].trim());
  const nothingNote = only && notes.length === 1 && onlyNothing(notes[0]);
  if (nothingNote) notes.length = 0;
  const counts = { targets: parsed.targets.length, prompts, adds: adds.length, candidates: result.candidates.length, notes: notes.length };
  if (!nothingNote && !counts.targets && !counts.adds && !counts.candidates && !counts.notes) {
    errors.push({ line: 0, message: `回覆裡沒有新的內容：沒有新的學習目標、補題、候選卡片，也沒有給家長的備註。沒有更深的內容時，請 AI 寫一句「${NOTHING}」` });
  }
  return finish(reply, { normalized, ended: segments.ended, errors, hints, body, existing, candidates, notes, names, adds, removed, counts, nothing: nothingNote });
}

function finish(reply: string, found: DeepenInspection): DeepenInspection {
  const quoted = (issue: ReplyIssue): ReplyIssue => {
    const quote = issue.line ? quoteLine(reply, issue.line) : undefined;
    return quote === undefined ? issue : { ...issue, quote };
  };
  if (!found.ended) {
    const last = found.normalized.lines.findLastIndex(line => line.trim() !== '');
    found.hints.push({ line: last < 0 ? 0 : found.normalized.raw[last], message: '最後一行不是 <<<完>>>：AI 可能還沒寫完，或沒有整段複製。回 AI 那邊看它寫完了沒，寫完再按程式碼區塊的「複製」重貼一次' });
  }
  return { ...found, errors: found.errors.sort(byLine).map(quoted), hints: found.hints.sort(byLine).map(quoted) };
}

/** 組好的一批：寫進卡組的框、快照本文、配出的 ID、程式改動。 */
export interface DeepenBatch {
  /** 每個框一個陣列（含標題行）；備註要另起一個框時在最前面。 */
  boxes: string[][];
  /** 要接在原有備註框最後的項目（已經加上 `加深 <日期>：`）。 */
  notes: string[][];
  ids: string[];
  snapshotBody: string;
  edits: string[];
}

const boxed = (title: string, folded: boolean, inner: readonly string[]): string[] => [`> [!note]${folded ? '-' : ''} ${title}`, ...inner.map(line => line.trim() ? `> ${line}` : '>')];
/** 備註項目前面加 `加深 <日期>：`：第一行清單符號後面。 */
const dated = (item: readonly string[], date: string): string[] => item.map((line, i) => i === 0 ? line.replace(/^(\s*(?:[-*+]|\d+[.)])\s+)/, `$1加深 ${date}：`) : line);

/** 組這一批（§3-1）：名稱行配 ID、補題轉成這一篇的連結、框照順序排。deckFile 是這一篇的檔名（不含 .md），連結用。 */
export function composeBatch(inspection: DeepenInspection, deckFile: string, next: () => string, date: string): Omit<DeepenBatch, 'notes'> & { noteItems: string[][] } {
  if (inspection.errors.length) throw Error('還有擋住的錯誤，不能寫入');
  const { lines, raw } = inspection.normalized;
  const edited = [...lines];
  const removedAt = new Set(inspection.removed.map(each => each.line));
  const edits = inspection.removed.map(each => `第 ${String(raw[each.line])} 行 拿掉 ${each.text}`);
  const ids: string[] = [];
  for (const line of inspection.names) {
    const base = removedAt.has(line) ? edited[line].replace(TRAILING_ID, '') : edited[line].replace(/[ \t]+$/, '');
    const id = next();
    ids.push(id);
    edited[line] = `${base} ^${id}`;
  }
  for (const add of inspection.adds) if (add.name !== null) edited[add.line] = linked(edited[add.line], add.id, { path: deckFile, name: add.name });
  const strip = (no: number): string => edited[no].replace(BOX_PREFIX, '');
  const boxes: string[][] = [];
  if (inspection.body.length) boxes.push(boxed(DEEPEN_BOXES.deepen, false, inspection.body.map(no => edited[no])));
  if (inspection.existing.some(no => lines[no].replace(BOX_PREFIX, '').trim())) boxes.push(boxed(DEEPEN_BOXES.existing, false, trimBlank(inspection.existing.map(strip))));
  if (inspection.candidates.some(no => lines[no].replace(BOX_PREFIX, '').trim())) boxes.push(boxed(DEEPEN_BOXES.candidate, true, trimBlank(inspection.candidates.map(strip))));
  return { boxes, noteItems: inspection.notes.map(item => dated(item, date)), ids, snapshotBody: edited.join('\n'), edits };
}
const trimBlank = (list: string[]): string[] => {
  const out = [...list];
  while (out.length && !out[0].trim()) out.shift();
  while (out.length && !out[out.length - 1].trim()) out.pop();
  return out;
};

/** 檔裡最外層有沒關的程式碼圍欄（§3-1〈擋下不寫〉）：接在後面的東西會被當成程式碼。 */
export function unclosedFence(text: string): boolean {
  let open: string | null = null;
  for (const line of text.split(/\r?\n/)) {
    if (open !== null) { if (fenceCloses(line, open)) open = null; continue; }
    const match = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
    if (match && !(match[1][0] === '`' && match[2].includes('`'))) open = match[1];
  }
  return open !== null;
}

/** 屬性區後面剛好一個頂層的備註框、讀得懂（每個非空行都在最上層的清單項目裡）：它的最後一行（從 0 算）；沒有是 null（R7）。 */
function noteBoxEnd(text: string): number | null {
  const lines = linesOf(text);
  const bounds = frontmatterLines(lines);
  if (bounds === 'unclosed') return null;
  const start = bounds ? bounds.close + 1 : 0;
  const blocks = blocksOf(lines.slice(start).map((line, i) => ({ no: start + i, raw: line.raw })));
  const notes = blocks.filter(block => block.kind === 'callout' && NOTE.test(calloutHead(block.body[0].raw)?.title ?? ''));
  const first = blocks.find(block => block.kind !== 'blank');
  if (notes.length !== 1 || first !== notes[0] || first.kind !== 'callout') return null;
  // 同一塊裡又接了別的框：分不出框的結尾。
  if (first.body.slice(1).some(line => calloutHead(line.raw) !== null)) return null;
  const inner = first.body.slice(1).map(line => line.raw.replace(BOX_PREFIX, ''));
  const roots = listTree(inner.map(raw => ({ raw, eol: '\n' })), 0);
  const covered = new Set(roots.flatMap(root => Array.from({ length: root.end - root.line }, (_, i) => root.line + i)));
  if (!roots.length || inner.some((line, i) => line.trim() && !covered.has(i))) return null;
  // 框尾的空 `>` 行不算：接在最後一項後面。
  let end = first.body.length - 1;
  while (end > 0 && !inner[end - 1].trim()) end--;
  return first.line + end;
}

export type AppendResult = { text: string; merged: boolean } | { why: 'fence' };

/**
 * 接在檔尾（§3-1〈怎麼接〉）：換行符照原檔；結尾的空白行全部去掉，接一行沒有 `>` 的空行，再接這一批（框之間也是）；以一個換行結尾。
 * 備註：剛好一個頂層備註框時接在它最後，否則在這一批的最前面另起一個。
 */
export function appendBatch(original: string, batch: { boxes: readonly string[][]; noteItems: readonly string[][] }): AppendResult {
  if (unclosedFence(original)) return { why: 'fence' };
  const eol = original.includes('\r\n') ? '\r\n' : '\n';
  const lines = original.split(/\r?\n/);
  const at = batch.noteItems.length ? noteBoxEnd(original) : null;
  const boxes = [...batch.boxes];
  if (batch.noteItems.length && at === null) boxes.unshift(boxed(NOTE_TITLE, false, batch.noteItems.flat()));
  if (at !== null) lines.splice(at + 1, 0, ...batch.noteItems.flat().map(line => line.trim() ? `> ${line}` : '>'));
  while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
  if (!boxes.length) return { text: lines.join(eol) + eol, merged: at !== null };
  const tail = boxes.flatMap(box => ['', ...box]);
  return { text: [...lines, ...tail].join(eol) + eol, merged: at !== null };
}

const content = (value: unknown): string => JSON.stringify(value, (key, each: unknown) => key === 'line' || key === 'targetLine' ? undefined : each);
/** 框與項目的樣子：標題與每一項的原文。 */
const shape = (text: string): { title: string; items: string[] }[] => introBoxes(text).map(box => ({ title: box.title, items: box.items.map(item => item.original) }));

/**
 * 驗（§3-1〈驗兩次〉）：原本的正式目標（ID、題目、組別、資料欄位）都不變；這一批的框都讀得出來、項目照原文；備註併進原有的框時，
 * 那個框的最後幾項就是這次的備註。before 是接之前的全文，after 是接好的（或寫入後重讀的）全文。
 */
export function verifyAppend(before: string, after: string, batch: { boxes: readonly string[][]; noteItems: readonly string[][] }, merged: boolean): boolean {
  if (content(parseDeck(after).targets) !== content(parseDeck(before).targets)) return false;
  const expected = shape(batch.boxes.map(box => box.join('\n')).join('\n\n') + '\n');
  if (expected.length !== batch.boxes.length) return false;
  const found = shape(after);
  const tail = found.slice(found.length - expected.length);
  if (tail.length !== expected.length || JSON.stringify(tail) !== JSON.stringify(expected)) return false;
  if (merged) {
    const end = noteBoxEnd(after);
    if (end === null) return false;
    const lines = linesOf(after).map(line => line.raw);
    const want = batch.noteItems.flat().map(line => line.trim() ? `> ${line}` : '>');
    if (lines.slice(end + 1 - want.length, end + 1).join('\n') !== want.join('\n')) return false;
  } else if (batch.noteItems.length) {
    // 另起的備註框是這一批的第一個框（introBoxes 不收備註框）：找最後一個備註標題。
    const lines = linesOf(after).map(line => line.raw);
    const head = lines.findLastIndex(line => calloutHead(line)?.title === NOTE_TITLE);
    const want = boxed(NOTE_TITLE, false, batch.noteItems.flat());
    if (head < 0 || lines.slice(head, head + want.length).join('\n') !== want.join('\n')) return false;
  }
  return true;
}

/** 這一批的新 ID 都在這一篇的加深框裡（§3-2 重開時的判斷）。 */
export function idsInDeepenBoxes(text: string, ids: readonly string[]): boolean {
  if (!ids.length) return false;
  const found = new Set(introBoxes(text).filter(box => box.deepen && box.kind !== 'existing').flatMap(box => box.items.flatMap(item => item.id ?? [])));
  return ids.every(id => found.has(id));
}
