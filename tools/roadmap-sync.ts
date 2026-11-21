// 狀態板、〈等觸發點〉與〈已完成〉由入口的狀態行產生（D-217；寫法見 docs/agents/workflow.md〈roadmap〉）。
// 每份 roadmap（最上層與 plugins/<外掛>/docs/roadmap.md）各自一套，列從哪一份來就留在那一份（使用者 2026-11-21 選 A）。
// 用法：
//   node tools/roadmap-sync.ts                改寫工作樹的 roadmap
//   node tools/roadmap-sync.ts --check        只比對、不寫；對不上就印「檔案:行號  原因」與修法，exit 1（npm run check、CI）
//   node tools/roadmap-sync.ts --check --staged   roadmap、入口與 HEAD 的比較都讀暫存區（pre-commit）
//   --root <repo> 與 --today <YYYY-MM-DD> 給測試用。
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, posix, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import MarkdownIt from 'markdown-it';
import { replaySides, replaying } from './git-state.ts';
import { parseStatus, type Status } from './status-line.ts';

const ROADMAP = /^(?:plugins\/[^/]+\/)?docs\/roadmap\.md$/;
const DECISIONS = 'docs/decisions.md';
const BOARD = { section: '現在在哪裡', columns: ['工作', '狀態', '下一步', '等誰', '入口'] };
const WAITING = { section: '等觸發點', columns: ['工作', '觸發點', '入口'] };
const DONE = { section: '已完成', columns: ['日期', '工作'] };

export interface Problem { file: string; line: number; reason: string }
export const formatProblem = (p: Problem) => `${p.file}${p.line ? `:${p.line}` : ''}  ${p.reason}`;

/** 讀檔與 Git 歷史：工作樹或暫存區。 */
export interface Source {
  /** 檔案內容；不存在或沒追蹤是 undefined。 */
  read(path: string): string | undefined;
  /** 和 HEAD 比有沒 commit 的修改（工作樹或暫存區）。 */
  changed(path: string): boolean;
  /** HEAD 的內容；沒有 HEAD 或那時沒有這份檔是 undefined。 */
  head(path: string): string | undefined;
  /** 由新到舊的 commit：台北時間的日期與那時的內容。 */
  history(path: string): { date: string; text: string }[];
  /** 追蹤的檔案清單。 */
  files(): string[];
  /** 正在重播別處已經 commit 的內容（合併、squash、cherry-pick、rebase）：另一邊帶來的完成列，日期是它那邊收尾的那天。 */
  replaying(): boolean;
  /** 重播時另一邊的 commit 和那時這份檔的內容；whole 是真的合併（另一邊的內容整個併進來）。 */
  sides(path: string): { rev: string; whole: boolean; text: string | undefined }[];
}

const markdown = new MarkdownIt();
const lf = (text: string) => text.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
const isExternal = (href: string) => /^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith('//');
const INLINE_LINK = /\[([^\]]*)\]\((<[^>]*>|[^)\s]+)\)/g;
const REFERENCE_LINK = /\[[^\]]*\]\[[^\]]*\]/;

/** 台北時間的日期 YYYY-MM-DD。 */
export const taipeiDate = (date: Date) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Taipei' }).format(date);

/** 表格一列的格子（原文）：只用沒跳脫的 | 切，和 GFM 一樣。 */
const cellsOf = (line: string) => line.trim().replace(/^\|/, '').replace(/(?<!\\)\|$/, '').split(/(?<!\\)\|/).map(cell => cell.trim());
const rowOf = (cells: readonly string[]) => `| ${cells.join(' | ')} |`;

interface Table { start: number; end: number; header: string[]; rows: string[][]; rowLines: number[] }
interface Section { title: string; start: number; end: number; table?: Table }

/** 每個二級標題的範圍（行號 0 起算、end 不含）與底下的第一張表。 */
function sectionsOf(text: string): Section[] {
  const lines = text.split('\n');
  const tokens = markdown.parse(text, {});
  const sections: Section[] = [];
  tokens.forEach((token, i) => {
    if (token.type === 'heading_open' && token.tag === 'h2') {
      const last = sections.at(-1);
      if (last) last.end = token.map![0];
      sections.push({ title: tokens[i + 1].content.trim(), start: token.map![0], end: lines.length });
    } else if (token.type === 'table_open' && token.map && sections.length && !sections.at(-1)!.table) {
      const [start, end] = token.map;
      const rowLines = Array.from({ length: end - start - 2 }, (_, k) => start + 2 + k);
      sections.at(-1)!.table = { start, end, header: cellsOf(lines[start]), rows: rowLines.map(at => cellsOf(lines[at])), rowLines };
    }
  });
  return sections;
}

/** 行內程式碼的範圍 [起, 迄)：照 CommonMark，n 個反引號開頭、下一串剛好 n 個反引號收尾；沒收尾的反引號是字（L2 R4）。 */
function codeSpans(text: string): [number, number][] {
  const spans: [number, number][] = [];
  const opener = /(?<!\\)`+/g;
  for (let open = opener.exec(text); open; open = opener.exec(text)) {
    const closer = new RegExp(`(?<!\`)\`{${open[0].length}}(?!\`)`, 'g');
    closer.lastIndex = open.index + open[0].length;
    const close = closer.exec(text);
    if (!close) continue;
    spans.push([open.index, close.index + close[0].length]);
    opener.lastIndex = close.index + close[0].length;
  }
  return spans;
}

/** 不在行內程式碼裡的行內連結（程式碼裡的是範例：不改寫，也不算入口）。 */
function inlineLinks(text: string): RegExpExecArray[] {
  const spans = codeSpans(text);
  return [...text.matchAll(INLINE_LINK)].filter(m => !spans.some(([start, end]) => m.index >= start && m.index < end));
}

/** 檔名裡會被當成連結語法的字，照百分比編碼寫（路徑其他部分照原樣）。 */
const encodePath = (path: string) => path.replace(/%/g, '%25').replace(/#/g, '%23').replace(/\?/g, '%3F');

/** 入口一格的連結：剛好一個連到 Markdown 檔的連結，回傳 repo 裡的路徑（解開編碼）；其他回傳原因。 */
function entryOf(cell: string, roadmap: string): { path: string } | { error: string } {
  const links = inlineLinks(cell).map(m => m[2].replace(/^<|>$/g, '')).filter(href => !isExternal(href));
  if (links.length !== 1) return { error: `入口一格要剛好一個連到 Markdown 檔的連結，現在有 ${links.length} 個` };
  let path: string;
  try {
    path = decodeURIComponent(links[0].replace(/[?#].*$/, ''));
  } catch {
    return { error: `入口的連結 ${links[0]} 的百分比編碼不對` };
  }
  if (!path.toLowerCase().endsWith('.md')) return { error: '入口要連到 Markdown 檔' };
  return { path: posix.normalize(posix.join(posix.dirname(roadmap), path)) };
}

/** 入口的狀態行：標題下第一個非空行。不是「狀態：」開頭時 line 是 undefined。 */
function statusLineOf(text: string): string | undefined {
  const lines = lf(text).split('\n');
  const tokens = markdown.parse(lines.join('\n'), {});
  const heading = tokens.find(token => token.type === 'heading_open' && token.tag === 'h1');
  if (!heading) return undefined;
  const line = lines.slice(heading.map![1]).find(l => l.trim());
  return line?.startsWith('狀態：') ? line.trim() : undefined;
}

/**
 * 入口裡的文字搬進 roadmap：連結改成以 roadmap 為基準、只有錨點的接到入口檔、有空白的路徑用 <> 包；參照式連結報錯；| 跳脫。
 * 路徑照原本的編碼改基準，不解開（%23 解開會變成錨點，L2 R4）；行內程式碼裡的連結照原樣。
 */
export function moveText(text: string, entry: string, roadmap: string): { text: string } | { error: string } {
  if (REFERENCE_LINK.test(text)) return { error: '參照式連結（[文字][名稱]）搬不進 roadmap：入口的狀態行改用 [文字](路徑)' };
  const base = posix.dirname(roadmap);
  const here = encodePath(entry);
  let moved = '';
  let last = 0;
  for (const link of inlineLinks(text)) {
    const [whole, label, raw] = link;
    const href = raw.replace(/^<|>$/g, '');
    if (isExternal(href)) continue;
    const hash = href.indexOf('#');
    const path = hash < 0 ? href : href.slice(0, hash);
    const anchor = hash < 0 ? '' : href.slice(hash);
    const target = path ? posix.normalize(posix.join(posix.dirname(here), path)) : here;
    const relative = posix.relative(base, target) + anchor;
    moved += text.slice(last, link.index) + `[${label}](${/\s/.test(relative) ? `<${relative}>` : relative})`;
    last = link.index + whole.length;
  }
  moved += text.slice(last);
  return { text: moved.replace(/(?<!\\)\|/g, '\\|') };
}

interface Entry { path: string; status: Status }

/** 讀入口的狀態行；required 時沒有「狀態：」開頭的行也是錯。工具不認的（手寫的〈等觸發點〉列）回傳 undefined。 */
function readEntry(cell: string, roadmap: string, source: Source, required: boolean): { entry?: Entry; error?: string } {
  const found = entryOf(cell, roadmap);
  if ('error' in found) return required ? { error: found.error } : {};
  if (found.path === DECISIONS) return required ? { error: '狀態板的入口要是有狀態行的文件，決定放〈等觸發點〉' } : {};
  const text = source.read(found.path);
  if (text === undefined) return { error: `入口 ${found.path} 不存在或沒有追蹤` };
  const line = statusLineOf(text);
  if (!line) return required ? { error: `入口 ${found.path} 的標題下第一行沒有「狀態：…」` } : {};
  const parsed = parseStatus(line);
  if ('error' in parsed) return { error: `入口 ${found.path} 的狀態行：${parsed.error}` };
  return { entry: { path: found.path, status: parsed.status } };
}

/** 收尾的日期：入口有沒 commit 的修改是今天；否則往回找，狀態第一次變成結束（連續結束的最早一個）的那個 commit。 */
function doneDate(path: string, source: Source, today: string): string {
  if (source.changed(path)) return today;
  let date = today;
  for (const commit of source.history(path)) {
    const line = statusLineOf(commit.text);
    const parsed = line ? parseStatus(line) : undefined;
    if (!parsed || 'error' in parsed || !parsed.status.done) break;
    date = commit.date;
  }
  return date;
}

/** 工具寫的〈已完成〉一列的「工作」格。 */
const doneCell = (work: string, status: Status, text: string, entryCell: string) => {
  const link = inlineLinks(entryCell).find(m => !isExternal(m[2].replace(/^<|>$/g, '')))!;
  return `**${work.replace(/^\*\*(.*)\*\*$/, '$1')}**：${text}（${status.state}，[入口](${link[2]})）`;
};
const DONE_CELL = /^\*\*(.+?)\*\*：(.+)（(已合併|已結案)，\[入口\]\((<[^>]+>|[^)\s]+)\)）$/;

const column = (table: Table, name: string) => table.header.indexOf(name);

/** 已經有列的入口：在哪份 roadmap 的第幾行（1 起算）。各份 roadmap 共用一個，同一份入口只能在一份有列（L2 R5）。 */
type Claimed = Map<string, { file: string; line: number }>;

/** 一份 roadmap 照入口同步後的全文與問題。有問題時 text 是原文（不寫半套）。 */
export function syncRoadmap(file: string, original: string, source: Source, today: string, claimed: Claimed = new Map()): { text: string; problems: Problem[] } {
  const text = lf(original);
  const lines = text.split('\n');
  const problems: Problem[] = [];
  const problem = (line: number, reason: string) => problems.push({ file, line, reason });
  const sections = sectionsOf(text);
  const find = (title: string) => sections.find(s => s.title === title);
  const board = find(BOARD.section);
  const waiting = find(WAITING.section);
  const done = find(DONE.section);
  for (const [section, spec] of [[board, BOARD], [waiting, WAITING], [done, DONE]] as const) {
    if (!section) problem(1, `找不到「## ${spec.section}」`);
    else if (section.table && spec.columns.some(name => column(section.table!, name) < 0)) {
      problem(section.table.start + 1, `「${spec.section}」的表頭要有：${spec.columns.join('、')}（現在：${section.table.header.join('、')}）`);
    }
  }
  if (problems.length || !board?.table) {
    if (board && !board.table) problem(board.start + 1, '〈現在在哪裡〉底下要有狀態板的表（工作｜狀態｜下一步｜等誰｜入口）');
    return { text: original, problems };
  }

  // 每一列是表格的一行原文：工具寫的照表頭的欄序產生，手寫的〈等觸發點〉列與既有的〈已完成〉列照原文留著。
  const boardRows: string[] = [];
  const waitingRows: string[] = [];
  // 從狀態板搬過來的排在〈等觸發點〉既有的列後面；從〈等觸發點〉搬回的排在狀態板最後面。
  const toWaitingLater: string[] = [];
  const backToBoard: string[] = [];
  const doneRows: string[] = [];
  const at = (table: Table) => Object.fromEntries(table.header.map((name, i) => [name, i])) as Record<string, number>;
  const b = at(board.table);
  const render = (header: readonly string[]) => (cells: Record<string, string>) => rowOf(header.map(name => cells[name] ?? ''));
  const toBoard = render(board.table.header);
  const w = waiting!.table ? at(waiting!.table) : undefined;
  const toWaiting = render(waiting!.table?.header ?? WAITING.columns);
  const toDone = render(done!.table?.header ?? DONE.columns);

  const place = (line: number, work: string, entryCell: string, entry: Entry, from: 'board' | 'waiting') => {
    const previous = claimed.get(entry.path);
    if (previous) {
      problem(line + 1, previous.file === file
        ? `入口 ${entry.path} 在第 ${previous.line} 行也有一列：同一份入口只能有一列`
        : `入口 ${entry.path} 在 ${previous.file}:${previous.line} 也有一列：同一份入口只能在一份 roadmap 有一列`);
      return;
    }
    claimed.set(entry.path, { file, line: line + 1 });
    const { status } = entry;
    const moved = (value: string) => {
      const result = moveText(value, entry.path, file);
      if ('error' in result) problem(line + 1, result.error);
      return 'text' in result ? result.text : value;
    };
    if (status.done) {
      doneRows.push(toDone({ 日期: doneDate(entry.path, source, today), 工作: doneCell(work, status, moved(status.text), entryCell) }));
    } else if (status.state === '等觸發點') {
      (from === 'board' ? toWaitingLater : waitingRows).push(toWaiting({ 工作: work, 觸發點: moved(status.text), 入口: entryCell }));
    } else {
      const row = toBoard({ 工作: work, 狀態: moved(status.label), 下一步: moved(status.text), 等誰: status.who.length ? status.who.join('、') : '—', 入口: entryCell });
      (from === 'board' ? boardRows : backToBoard).push(row);
    }
  };

  board.table.rows.forEach((cells, k) => {
    const line = board.table!.rowLines[k];
    const work = cells[b['工作']] ?? '';
    const entryCell = cells[b['入口']] ?? '';
    const { entry, error } = readEntry(entryCell, file, source, true);
    if (error || !entry) problem(line + 1, error ?? '入口讀不到');
    else place(line, work, entryCell, entry, 'board');
  });
  waiting!.table?.rows.forEach((cells, k) => {
    const line = waiting!.table!.rowLines[k];
    const { entry, error } = readEntry(cells[w!['入口']] ?? '', file, source, false);
    if (error) problem(line + 1, error);
    else if (!entry) waitingRows.push(lines[line]); // 手寫的列：入口只有 D-ID、沒有狀態行的紀錄或沒有連結，工具不動。
    else place(line, cells[w!['工作']] ?? '', cells[w!['入口']] ?? '', entry, 'waiting');
  });
  if (problems.length) return { text: original, problems };

  // 由下往上改，前面的行號不變。
  const edits: { start: number; end: number; lines: string[] }[] = [];
  // 已有的表留著表頭與分隔線，換掉底下的列；這一節還沒有表時加在節的最後（後面的空行之前）。
  const replaceRows = (section: Section, columns: readonly string[], rows: string[], keep = false) => {
    const { table } = section;
    if (table) {
      edits.push({ start: table.start + 2, end: keep ? table.start + 2 : table.end, lines: rows });
      return;
    }
    if (!rows.length) return;
    let end = section.end;
    while (end > section.start + 1 && !lines[end - 1].trim()) end--;
    edits.push({ start: end, end, lines: ['', rowOf(columns), `|${columns.map(() => '---').join('|')}|`, ...rows] });
  };
  replaceRows(board, BOARD.columns, [...boardRows, ...backToBoard]);
  replaceRows(waiting!, WAITING.columns, [...waitingRows, ...toWaitingLater]);
  // 〈已完成〉只在最上面插入新的列，既有的列不動。
  replaceRows(done!, DONE.columns, doneRows, true);
  edits.sort((x, y) => y.start - x.start);
  const out = [...lines];
  for (const edit of edits) out.splice(edit.start, edit.end - edit.start, ...edit.lines);
  const updated = out.join('\n');
  // 原檔是 CRLF 時照樣寫回 CRLF（工作樹取出的檔是 CRLF）；內容不變時回傳原文。
  const result = original.includes('\r\n') ? updated.replace(/\n/g, '\r\n') : updated;
  return { text: lf(result) === text ? original : result, problems };
}

/** 狀態板與〈等觸發點〉裡連到 Markdown 檔的列：入口路徑與工作名稱（不看入口的狀態行）。 */
function placedRows(file: string, text: string): { path: string; work: string }[] {
  const sections = sectionsOf(text);
  return [BOARD.section, WAITING.section].flatMap(title => {
    const table = sections.find(s => s.title === title)?.table;
    if (!table) return [];
    const [work, entry] = ['工作', '入口'].map(name => column(table, name));
    return table.rows.flatMap(cells => {
      const found = entryOf(cells[entry] ?? '', file);
      return 'path' in found && found.path !== DECISIONS ? [{ path: found.path, work: cells[work] ?? '' }] : [];
    });
  });
}

/** 〈已完成〉的列：日期、工作格與行號（1 起算）。 */
function doneRowsOf(text: string): { date: string; work: string; line: number }[] {
  const table = sectionsOf(text).find(s => s.title === DONE.section)?.table;
  if (!table) return [];
  const [date, work] = DONE.columns.map(name => column(table, name));
  return table.rows.map((cells, k) => ({ date: cells[date] ?? '', work: cells[work] ?? '', line: table.rowLines[k] + 1 }));
}

/** 比對 HEAD 用的鍵：日期＋拿掉連結目標的文字（只改連結目標的舊列還是舊列，L2 R2）。 */
const doneKey = (row: { date: string; work: string }) => `${row.date}|${row.work.replace(INLINE_LINK, '[$1]')}`;

/** 〈已完成〉的列照 doneKey 數：同一個鍵有幾列，列的原文給「不見了」的訊息用，tool 是工具的格式。 */
type Tally = Map<string, { row: string; tool: boolean; count: number }>;
const tally = (rows: readonly { date: string; work: string }[]): Tally => {
  const counts: Tally = new Map();
  for (const row of rows) {
    counts.set(doneKey(row), { row: rowOf([row.date, row.work]), tool: DONE_CELL.test(row.work), count: (counts.get(doneKey(row))?.count ?? 0) + 1 });
  }
  return counts;
};
/** 對到一列就扣一次；沒有剩的回傳 false。 */
const take = (counts: Tally, key: string) => {
  const kept = counts.get(key);
  if (!kept?.count) return false;
  kept.count--;
  return true;
};

const stripBold = (work: string) => work.replace(/^\*\*(.*)\*\*$/, '$1');

/** 「已結案 → <下一站>」連到的 Markdown 檔（從入口所在的資料夾算的 repo 路徑）；D-ID 與其他狀態是空的。 */
const nextStations = (status: Status, entry: string) => status.label.includes('→')
  ? inlineLinks(status.label).flatMap(link => {
    const found = entryOf(`[下一站](${link[2]})`, entry);
    return 'path' in found ? [found.path] : [];
  })
  : [];

/** YYYY-MM-DD 而且是真的日期（重播時只比「不晚於今天」，字串比較擋不住 2026-1-5，L2 第二輪 N6）。 */
const isDate = (text: string) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!match) return false;
  const [year, month, day] = match.slice(1).map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
};

/**
 * 〈已完成〉新加的列（照 doneKey 比，HEAD 和重播時另一邊都沒有的）要是工具寫的，各份 roadmap 一起看（D-217 第 4 點；L2 R2、R3、R5）：
 * - 格式、入口已結束、「完成」那一句和入口一致；
 * - 日期是入口收尾那天（合併、squash、cherry-pick、rebase 時只要不晚於今天）；
 * - HEAD 的狀態板或〈等觸發點〉有這份入口時，工作名稱相同；
 * - 一份入口只有一筆新的列，也不和舊的列同一天（重新開工又結束的除外），不和另一邊帶進來的列重複；
 * - HEAD 有列的入口結束了、列不見了，就要有它的新列或另一邊帶進來的列（手動刪掉的列會漏記）；沒結束的列也不能刪；
 *   換入口（舊入口寫「已結案 → <新入口>」，新入口在板上或有完成列；可以接好幾站，K2）、HEAD 是上線前的 roadmap（沒有〈等觸發點〉）時不看。
 * - HEAD 的〈已完成〉每一列都還在；真的合併時另一邊的也是（這邊是新格式時只要工具格式的列，K1）。
 * 另一邊已經 commit 的列只查格式與日期，不照這邊的入口重驗（L2 第三輪 M1）；這邊是上線前的格式時照收不查（K0）。
 * HEAD 沒有的 roadmap 不看。
 */
export function checkDone(roadmaps: readonly { file: string; text: string }[], source: Source, today: string): Problem[] {
  const problems: Problem[] = [];
  const replay = source.replaying();
  const headOf = new Map(roadmaps.map(({ file }) => [file, source.head(file)]));
  const before = new Map<string, { work: string; file: string }>();
  for (const [file, head] of headOf) for (const row of head === undefined ? [] : placedRows(file, lf(head))) if (!before.has(row.path)) before.set(row.path, { work: row.work, file });
  const placed = new Set(roadmaps.flatMap(({ file, text }) => placedRows(file, lf(text)).map(row => row.path)));

  // 每一列的入口；新的列另外記下第一筆在哪，另一邊帶進來的列也是。
  const fresh = new Map<string, string>();
  const carried = new Map<string, string>();
  const old: { path: string; date: string; at: string }[] = [];
  const checks: (() => void)[] = [];
  // 上線前的 roadmap（沒有〈等觸發點〉）：上線那次改了格式、換了入口、舊列搬去封存，那時的列不能照新規則比（L2 第二輪 N2、N3）。
  const isLegacy = (text: string) => !sectionsOf(lf(text)).some(s => s.title === WAITING.section);
  const legacy = new Set([...headOf].filter(([, head]) => head !== undefined && isLegacy(head)).map(([file]) => file));
  for (const { file, text } of roadmaps) {
    const head = headOf.get(file);
    if (head === undefined) continue;
    // 要留著的列：HEAD 的，和重播時另一邊的（上線前格式的另一邊不算）；同一列兩邊都有，對到一次就兩邊各扣一次（L2 第三輪 M1）。
    const left = tally(doneRowsOf(lf(head)));
    const sides = source.sides(file).flatMap(side => side.text === undefined || isLegacy(side.text) ? [] : [{ ...side, left: tally(doneRowsOf(lf(side.text))) }]);
    for (const row of doneRowsOf(lf(text))) {
      const match = DONE_CELL.exec(row.work);
      const found = match ? entryOf(`[入口](${match[4]})`, file) : undefined;
      const path = found && 'path' in found ? found.path : undefined;
      const key = doneKey(row);
      const inHead = take(left, key);
      const inSide = sides.map(side => take(side.left, key)).includes(true);
      if (inHead) {
        if (path) old.push({ path, date: row.date, at: `${file}:${row.line}` });
        continue;
      }
      // 這邊是上線前的格式（上線前開的分支把新的 main 併進來）：另一邊帶進來的列來自 main 的歷史，
      // 上線前的列本來就是手寫的，照收不查（L2 第四輪後 K0）。
      if (inSide && legacy.has(file)) {
        if (path && !carried.has(path)) carried.set(path, `${file}:${row.line}`);
        continue;
      }
      const add = (reason: string) => problems.push({ file, line: row.line, reason: `〈已完成〉新加的列要由工具產生（入口的狀態改成已合併或已結案，再跑 node tools/roadmap-sync.ts）：${reason}` });
      if (!match) {
        // 另一邊帶進來的也查：上線前開的分支手寫的列，先併進新的 main 再併回來時照樣擋（規範〈roadmap〉的遷移步驟）。
        add('格式不是「**工作**：完成（已合併，[入口](…)）」');
        continue;
      }
      // 另一邊已經 commit 的列：入口之後可能又改了（補一句、重新開工、換名字），不照這邊的入口重驗，只查日期（L2 第三輪 M1）。
      if (inSide) {
        if (!isDate(row.date)) add(`日期要寫成 YYYY-MM-DD 的真實日期（現在是「${row.date}」）`);
        else if (row.date > today) add(`日期不能晚於今天（${today}）`);
        if (path && !carried.has(path)) carried.set(path, `${file}:${row.line}`);
        continue;
      }
      const first = path ? fresh.get(path) : undefined;
      if (path && !first) fresh.set(path, `${file}:${row.line}`);
      // 同一天的舊列要等所有 roadmap 的舊列都記下才比得出來。
      checks.push(() => {
        const read = readEntry(`[入口](${match[4]})`, file, source, true);
        if (read.error || !read.entry) return add(read.error ?? '入口讀不到');
        const { status, path: entry } = read.entry;
        if (!status.done || status.state !== match[3]) return add(`入口 ${entry} 的狀態是「${status.label}」`);
        const moved = moveText(status.text, entry, file);
        if ('error' in moved || moved.text !== match[2]) add(`和入口 ${entry} 的「完成」那一句不一樣`);
        const expected = doneDate(entry, source, today);
        if (!isDate(row.date)) add(`日期要寫成 YYYY-MM-DD 的真實日期（現在是「${row.date}」）`);
        else if (replay ? row.date > today : row.date !== expected) add(replay ? `日期不能晚於今天（${today}）` : `日期要是 ${expected}（入口收尾的那天）`);
        const name = before.get(entry);
        if (name && stripBold(name.work) !== match[1]) add(`工作名稱要和 HEAD 狀態板的「${stripBold(name.work)}」一樣`);
        if (first) add(`入口 ${entry} 在 ${first} 已經有一筆新的完成列`);
        const elsewhere = carried.get(entry);
        if (elsewhere) add(`入口 ${entry} 在 ${elsewhere} 已經有合併帶進來的完成列`);
        // 重新開工（HEAD 的狀態板或〈等觸發點〉有它）又在同一天結束的第二筆放行（L2 第二輪 N5）。
        const same = old.find(o => o.path === entry && o.date === row.date);
        if (same && !before.has(entry)) add(`入口 ${entry} 在 ${same.at} 已經有同一天的完成列`);
      });
    }
    const at = sectionsOf(lf(text)).find(s => s.title === DONE.section);
    const missing = (counts: Tally, owner: string, hint: string, toolOnly = false) => {
      for (const { row, tool, count } of counts.values()) {
        if (toolOnly && !tool) continue;
        for (let k = 0; k < count; k++) problems.push({ file, line: at ? at.start + 1 : 0, reason: `${owner}的〈已完成〉有「${row}」這一列，現在不見了：${hint}` });
      }
    };
    // HEAD 的列沒有對到的：被刪掉或搬走了（解衝突時丟掉自己那一列也是），L2 第二輪 N3。
    if (!legacy.has(file)) missing(left, 'HEAD ', '舊的列不刪也不搬（只能改連結的目標），把它加回來');
    // 真的合併：另一邊的列也要都在（解衝突時丟掉另一邊那一列），L2 第三輪 M1。這邊是新格式時，另一邊手寫的列
    // 留著一定擋在格式、要照規範的遷移步驟刪掉，不要求留著（K1）。
    for (const side of sides) if (side.whole) missing(side.left, `合併進來的 ${side.rev.slice(0, 7)} `, '解衝突時兩邊的完成列都留著，把它加回來', !legacy.has(file));
  }
  for (const check of checks) check();

  const closed = (path: string) => fresh.has(path) || carried.has(path);
  const statusOf = (path: string) => {
    const text = source.read(path);
    const line = text === undefined ? undefined : statusLineOf(text);
    const parsed = line ? parseStatus(line) : undefined;
    return !parsed || 'error' in parsed ? undefined : parsed.status;
  };
  // 換入口（例如討論稿結案、交給任務）：舊入口寫「已結案 → <新入口>」，新入口在狀態板或〈等觸發點〉、或有新的完成列，
  // 工作沒有結束。只看舊入口自己寫的下一站，不看別處有沒有同名的列（L2 第二輪 N2、第三輪 M2）；
  // 合併時另一邊可能連換好幾次（p → t1 → t2），沿著已結束的下一站一路走（第四輪 K2）。
  const handedOn = (status: Status, path: string) => {
    const seen = new Set([path]);
    const queue = nextStations(status, path);
    for (let next = queue.shift(); next !== undefined; next = queue.shift()) {
      if (seen.has(next)) continue;
      seen.add(next);
      if (placed.has(next) || closed(next)) return true;
      const later = statusOf(next);
      if (later?.done) queue.push(...nextStations(later, next));
    }
    return false;
  };
  for (const [path, { file }] of before) {
    if (placed.has(path) || closed(path) || legacy.has(file)) continue;
    const status = statusOf(path);
    if (!status) continue;
    if (status.done && handedOn(status, path)) continue;
    const sections = sectionsOf(lf(roadmaps.find(r => r.file === file)!.text));
    const at = sections.find(s => s.title === (status.done ? DONE.section : BOARD.section));
    problems.push({ file, line: at ? at.start + 1 : 0, reason: status.done
      ? `入口 ${path} 已結束、HEAD 的狀態板或〈等觸發點〉有它，〈已完成〉卻沒有新的一列：把那一列加回來，再執行 node tools/roadmap-sync.ts（只是換了入口就在舊入口寫「已結案 → <新入口>」）`
      // 還沒結束的列被刪掉：下一個 commit 再結束就沒有完成列（L2 第二輪 N12）。
      : `入口 ${path} 還沒結束（${status.label}），HEAD 的狀態板或〈等觸發點〉有它，現在卻沒有：狀態板的列不手動刪（不做了就把入口改成已結案，再執行 node tools/roadmap-sync.ts）` });
  }
  return problems;
}

function git(root: string, args: string[]): string {
  return execFileSync('git', ['-c', 'core.quotepath=false', ...args], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 1 << 28 });
}
const tryGit = (root: string, args: string[]) => {
  try {
    return git(root, args);
  } catch {
    return undefined;
  }
};

/** staged：內容、清單與「有沒有改」都看暫存區；否則看工作樹。 */
export function gitSource(root: string, staged: boolean): Source {
  const hasHead = tryGit(root, ['rev-parse', '--verify', '-q', 'HEAD']) !== undefined;
  const tracked = git(root, ['ls-files', '-z']).split('\0').filter(Boolean);
  const trackedSet = new Set(tracked);
  let sides: ReturnType<typeof replaySides> | undefined;
  return {
    files: () => tracked,
    read: path => {
      if (!trackedSet.has(path)) return undefined;
      if (staged) return tryGit(root, ['show', `:${path}`]);
      return existsSync(join(root, path)) ? readFileSync(join(root, path), 'utf8') : undefined;
    },
    changed: path => {
      if (!hasHead) return true;
      const args = staged ? ['diff', '--cached', '--quiet', 'HEAD', '--', path] : ['diff', '--quiet', 'HEAD', '--', path];
      return tryGit(root, args) === undefined;
    },
    head: path => (hasHead ? tryGit(root, ['show', `HEAD:${path}`]) : undefined),
    replaying: () => replaying(root),
    sides: path => (sides ??= replaySides(root)).map(side => ({ ...side, text: tryGit(root, ['show', `${side.rev}:${path}`]) })),
    history: path => {
      if (!hasHead) return [];
      const log = tryGit(root, ['log', '--format=%H %cI', 'HEAD', '--', path]) ?? '';
      return log.split('\n').filter(Boolean).map(line => {
        const [sha, iso] = line.split(' ');
        return { date: taipeiDate(new Date(iso)), text: tryGit(root, ['show', `${sha}:${path}`]) ?? '' };
      });
    },
  };
}

/** 每份 roadmap 同步的結果（同一份入口跨 roadmap 也只能有一列）；check 時加上〈已完成〉新列的檢查。 */
export function syncAll(root: string, { staged = false, check = false, today = taipeiDate(new Date()) } = {}) {
  const source = gitSource(root, staged);
  const roadmaps = source.files().filter(file => ROADMAP.test(file)).sort((a, b) => Number(b === 'docs/roadmap.md') - Number(a === 'docs/roadmap.md') || (a < b ? -1 : 1));
  const claimed: Claimed = new Map();
  const results = roadmaps.map(file => {
    const text = source.read(file) ?? '';
    const result = syncRoadmap(file, text, source, today, claimed);
    return { file, before: text, after: result.text, problems: result.problems };
  });
  if (check) for (const problem of checkDone(results.map(r => ({ file: r.file, text: r.before })), source, today)) results.find(r => r.file === problem.file)!.problems.push(problem);
  return results;
}

/** 第一個不同的行（1 起算）。 */
const firstDiff = (a: string, b: string) => {
  const x = lf(a).split('\n');
  const y = lf(b).split('\n');
  const at = x.findIndex((line, i) => line !== y[i]);
  return (at < 0 ? Math.min(x.length, y.length) : at) + 1;
};

function main(): void {
  const args = process.argv.slice(2);
  const value = (flag: string) => {
    const at = args.indexOf(flag);
    return at >= 0 ? args[at + 1] : undefined;
  };
  const root = resolve(value('--root') ?? join(dirname(fileURLToPath(import.meta.url)), '..'));
  const check = args.includes('--check');
  const staged = args.includes('--staged');
  if (staged && !check) {
    console.error('--staged 只能和 --check 一起用（同步改的是工作樹）');
    process.exit(1);
  }
  const results = syncAll(root, { staged, check, today: value('--today') });
  const problems = results.flatMap(r => r.problems);
  const stale = results.filter(r => !r.problems.length && r.after !== r.before);
  if (check) {
    for (const r of stale) problems.push({ file: r.file, line: firstDiff(r.before, r.after), reason: '狀態板、〈等觸發點〉或〈已完成〉和入口的狀態行對不上' });
    if (problems.length) {
      console.error(`roadmap 和入口對不上（${staged ? '暫存區' : '工作樹'}）：`);
      for (const p of problems) console.error(formatProblem(p));
      if (stale.length) console.error(`執行 node tools/roadmap-sync.ts，再 git add ${stale.map(r => r.file).join(' ')}`);
      process.exit(1);
    }
    console.log(`狀態板和入口一致：${results.map(r => r.file).join('、')}`);
    return;
  }
  if (problems.length) {
    console.error('沒有改任何檔：');
    for (const p of problems) console.error(formatProblem(p));
    process.exit(1);
  }
  for (const r of stale) writeFileSync(join(root, r.file), r.after, 'utf8');
  console.log(stale.length ? `已同步：${stale.map(r => r.file).join('、')}（記得 git add）` : `roadmap 已是最新：${results.map(r => r.file).join('、')}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main();
