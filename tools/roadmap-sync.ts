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
import { parseStatus, type Status } from './status-line.ts';

const ROADMAP = /^(?:plugins\/[^/]+\/)?docs\/roadmap\.md$/;
const DECISIONS = 'docs/decisions.md';
/** 這天起〈已完成〉新加的列要是工具的格式（工作流程上線那天；更早的列手改不擋）。 */
export const ROLLOUT = '2026-11-22';
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

/** 入口一格的連結：剛好一個連到 Markdown 檔的連結，回傳 repo 裡的路徑；其他回傳原因。 */
function entryOf(cell: string, roadmap: string): { path: string } | { error: string } {
  const links = [...cell.matchAll(INLINE_LINK)].map(m => m[2].replace(/^<|>$/g, '')).filter(href => !isExternal(href));
  if (links.length !== 1) return { error: `入口一格要剛好一個連到 Markdown 檔的連結，現在有 ${links.length} 個` };
  const path = decodeURIComponent(links[0].replace(/[?#].*$/, ''));
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

/** 入口裡的文字搬進 roadmap：連結改成以 roadmap 為基準、只有錨點的接到入口檔、有空白的路徑用 <> 包；參照式連結報錯；| 跳脫。 */
export function moveText(text: string, entry: string, roadmap: string): { text: string } | { error: string } {
  if (REFERENCE_LINK.test(text)) return { error: '參照式連結（[文字][名稱]）搬不進 roadmap：入口的狀態行改用 [文字](路徑)' };
  const base = posix.dirname(roadmap);
  const moved = text.replace(INLINE_LINK, (whole, label: string, raw: string) => {
    const href = raw.replace(/^<|>$/g, '');
    if (isExternal(href)) return whole;
    const hash = href.indexOf('#');
    const path = hash < 0 ? href : href.slice(0, hash);
    const anchor = hash < 0 ? '' : href.slice(hash);
    const target = path ? posix.normalize(posix.join(posix.dirname(entry), decodeURIComponent(path))) : entry;
    const relative = posix.relative(base, target) + anchor;
    return `[${label}](${/\s/.test(relative) ? `<${relative}>` : relative})`;
  });
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
  const link = [...entryCell.matchAll(INLINE_LINK)].find(m => !isExternal(m[2].replace(/^<|>$/g, '')))!;
  return `**${work.replace(/^\*\*(.*)\*\*$/, '$1')}**：${text}（${status.state}，[入口](${link[2]})）`;
};
const DONE_CELL = /^\*\*(.+?)\*\*：(.+)（(已合併|已結案)，\[入口\]\((<[^>]+>|[^)\s]+)\)）$/;

const column = (table: Table, name: string) => table.header.indexOf(name);

/** 一份 roadmap 照入口同步後的全文與問題。有問題時 text 是原文（不寫半套）。 */
export function syncRoadmap(file: string, original: string, source: Source, today: string): { text: string; problems: Problem[] } {
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
  const seen = new Map<string, number>();
  const at = (table: Table) => Object.fromEntries(table.header.map((name, i) => [name, i])) as Record<string, number>;
  const b = at(board.table);
  const render = (header: readonly string[]) => (cells: Record<string, string>) => rowOf(header.map(name => cells[name] ?? ''));
  const toBoard = render(board.table.header);
  const w = waiting!.table ? at(waiting!.table) : undefined;
  const toWaiting = render(waiting!.table?.header ?? WAITING.columns);
  const toDone = render(done!.table?.header ?? DONE.columns);

  const place = (line: number, work: string, entryCell: string, entry: Entry, from: 'board' | 'waiting') => {
    const previous = seen.get(entry.path);
    if (previous !== undefined) {
      problem(line + 1, `入口 ${entry.path} 在第 ${previous} 行也有一列：同一份入口只能有一列`);
      return;
    }
    seen.set(entry.path, line + 1);
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

/**
 * 〈已完成〉新加的列（HEAD 沒有、日期在上線那天以後）要是工具寫的：格式、入口已結束、「完成」那一句一致（D-217 第 4 點）。
 * 手寫的完成列擋下。HEAD 沒有這份 roadmap 時不看。
 */
export function checkNewDone(file: string, text: string, source: Source): Problem[] {
  const before = source.head(file);
  if (before === undefined) return [];
  const old = new Set(sectionsOf(lf(before)).find(s => s.title === DONE.section)?.table?.rows.map(rowOf) ?? []);
  const done = sectionsOf(lf(text)).find(s => s.title === DONE.section)?.table;
  if (!done) return [];
  const [date, work] = DONE.columns.map(name => column(done, name));
  const problems: Problem[] = [];
  done.rows.forEach((cells, k) => {
    if (old.has(rowOf(cells)) || (cells[date] ?? '') < ROLLOUT) return;
    const line = done.rowLines[k] + 1;
    const add = (reason: string) => problems.push({ file, line, reason: `〈已完成〉新加的列要由工具產生（入口的狀態改成已合併或已結案，再跑 node tools/roadmap-sync.ts）：${reason}` });
    const match = DONE_CELL.exec(cells[work] ?? '');
    if (!match) return add('格式不是「**工作**：完成（已合併，[入口](…)）」');
    const found = readEntry(`[入口](${match[4]})`, file, source, true);
    if (found.error || !found.entry) return add(found.error ?? '入口讀不到');
    const { status, path } = found.entry;
    if (!status.done || status.state !== match[3]) return add(`入口 ${path} 的狀態是「${status.label}」`);
    const moved = moveText(status.text, path, file);
    if ('error' in moved || moved.text !== match[2]) add(`和入口 ${path} 的「完成」那一句不一樣`);
  });
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

/** 每份 roadmap 同步的結果；check 時加上〈已完成〉新列的檢查。 */
export function syncAll(root: string, { staged = false, check = false, today = taipeiDate(new Date()) } = {}) {
  const source = gitSource(root, staged);
  const roadmaps = source.files().filter(file => ROADMAP.test(file)).sort((a, b) => Number(b === 'docs/roadmap.md') - Number(a === 'docs/roadmap.md') || (a < b ? -1 : 1));
  return roadmaps.map(file => {
    const text = source.read(file) ?? '';
    const result = syncRoadmap(file, text, source, today);
    const problems = [...result.problems, ...(check ? checkNewDone(file, text, source) : [])];
    return { file, before: text, after: result.text, problems };
  });
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
