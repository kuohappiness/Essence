// 文件檢查（D-141、D-143、D-195）：Git 追蹤的 Markdown 裡本機可判定的連結與錨點、roadmap 有「現在在哪裡」一節、「已完成」的列數、任務、討論稿與 plans 的檔頭狀態行、結束的任務有「延後的測試：」一行。
// 外掛的資料夾（D-208 第 4 點）：plugins/<外掛>/docs/ 底下的 tasks、討論稿、plans 與 roadmap.md 照同樣的規則查；外掛的任務對外掛自己的 backlog；
// 外掛有 roadmap 時，最上層 roadmap 的〈現在在哪裡〉要連到它的〈現在在哪裡〉。
// 任務與討論稿在 docs/ 底下（D-213）：最上層或 plugins/<外掛>/ 根目錄的 tasks/、Claude Codex Discussion/ 有追蹤的檔就報錯。
// 用法：node tools/check-docs.ts [--staged] [--root <repo>]（--root 給測試用）
//   預設：檔案清單取 Git 追蹤的檔案，內容讀工作樹（npm run check 與 CI 用）。
//   --staged：清單與內容都讀暫存區（pre-commit 用）。
// 有問題時每個一行「檔案:行號  目標  原因」並以 exit code 1 結束。不發網路請求，不修改、不 stage 任何檔案。
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, posix, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import MarkdownIt, { type Token } from 'markdown-it';
import GithubSlugger from 'github-slugger';

export const ROADMAP = 'docs/roadmap.md';
export const DONE_ROWS = 10;
export const STATUS_DIRS = ['docs/tasks', 'docs/Claude Codex Discussion', 'docs/plans'];

export const BACKLOG = 'docs/backlog.md';
/** 「待補測與補做」算哪幾份 backlog 的技術債表（進度畫板也用）：最上層與 Cards（D-208 第二步 §B3）。 */
export const DEFERRED_BACKLOGS = [BACKLOG, 'plugins/cards/docs/backlog.md'];

const PLUGIN_ROADMAP = /^plugins\/([^/]+)\/docs\/roadmap\.md$/;

/** docs/ 底下的 tasks、討論稿與 plans 第一層的檔（最上層與 plugins/<外掛>/ 底下都算），README 除外。 */
function isStatusDoc(file: string): boolean {
  if (posix.basename(file) === 'README.md') return false;
  const dir = posix.dirname(file);
  return STATUS_DIRS.includes(dir) || STATUS_DIRS.includes(/^plugins\/[^/]+\/(.+)$/.exec(dir)?.[1] ?? '');
}

/** 任務對到的 backlog：最上層的 docs/tasks/ 對最上層的 backlog，plugins/<外掛>/docs/tasks/ 對那個外掛的 backlog。不是任務時是 undefined。 */
function taskBacklog(file: string): string | undefined {
  const dir = posix.dirname(file);
  if (dir === 'docs/tasks') return BACKLOG;
  const plugin = /^plugins\/([^/]+)\/docs\/tasks$/.exec(dir)?.[1];
  return plugin === undefined ? undefined : `plugins/${plugin}/docs/backlog.md`;
}

// D-195 之前就結束的任務，〈結果〉沒有「延後的測試：」，不回頭補。只放過這兩個資料夾裡的（那時的任務都在這裡），其他外掛的同名檔照查。
const BEFORE_D195_DIRS = new Set(['docs/tasks', 'plugins/cards/docs/tasks']);
export const BEFORE_D195 = new Set([
  'agents-md-rewrite.md', 'ai-quality-screen.md', 'archive-principles.md', 'docs-architecture.md', 'duplicate-ids.md',
  'elementary-social-sol-trial-2.md', 'elementary-social-sol-trial-3.md', 'elementary-social-sol-trial.md', 'error-log.md',
  'icloud-placeholders.md', 'objective-architecture-r2-annotation.md', 'objective-architecture-r2-connection.md',
  'objective-architecture-r2-transcription.md', 'objective-architecture.md', 'quiz-mark.md', 'quiz-practice.md', 'review-icons.md',
  'state-load.md', 'state-split.md', 'state-writes.md', 'update-safeguards.md', 'w1-w2-fixes.md', 'w1-w2.md', 'w3.md', 'w4.md',
  'w5.md', 'w6-format-review-fixes.md', 'w6-handoff.md', 'w6-l2-questions.md', 'w6-polish.md', 'w6.md',
  // 狀態用了別的詞、當時沒命中的已結束任務（Codex 查核 D-195 第 4 節）。
  'entry-and-catalog.md', 'exam-scope.md', 'question-type-seam.md', 'w6-iphone.md', 'iphone-test-2026-11.md',
]);

export interface Exception { file: string; target: string; reason: string }

// 確實改不了的連結，逐項寫原因。target 是解碼後的連結目標，和輸出的「目標」一欄相同。
export const EXCEPTIONS: Exception[] = [
  ...['decisions.md#d-066-作答方式', '#2-3-學習目標', 'decisions.md#d-116-打字卡的沒印象與自動朗讀', 'decisions.md#d-120-今天的佇列的細節', 'decisions.md#d-121-打字卡答錯時的三步流程']
    .map(target => ({ file: 'plugins/cards/docs/tasks/w6-format-review-fixes.md', target, reason: '引用框與表格是貼進 syntax.md 的原文，以 docs/ 為基準' })),
  { file: 'docs/tasks/docs-architecture.md', target: 'docs/decisions.md#d-141-文件架構入口只放狀態同一類資訊只維護一份', reason: '要貼進 AGENTS.md 的原文，以根目錄為基準' },
  { file: 'docs/tasks/docs-architecture.md', target: '../../tasks/objective-architecture-r2-connection.md', reason: '要貼進 experiments/t4/README.md 的原文' },
  { file: 'docs/tasks/docs-architecture.md', target: 'decisions.md#d-141-文件架構入口只放狀態同一類資訊只維護一份', reason: 'roadmap 已完成那一列的範例，以 docs/ 為基準' },
  {
    file: 'plugins/cards/docs/card-rules/elementary-social.md', target: '../../Claude Codex Discussion/2026-11-02-elementary-social-trial-fixes.md',
    reason: '送給 AI 的部分不改（FROZEN_RULES），這份討論稿第二步 B 搬到 plugins/cards/docs/，搬家前的位置也找不到；下次改版時改連結',
  },
];

/**
 * 製卡規則送給 AI 的部分（標記以下）嵌進外掛、算雜湊，改一個字就是新版本（D-151）：第二步 B 搬家時不改這一段，
 * 裡面的連結照搬家前的位置（docs/card-rules/）解得到也算數；下次改那份規則的版本時再改成新位置（Cards 的技術債）。
 * 只放過搬家時就在的檔與連結路徑（B 的 L2 R3）：新的規則檔、表上沒有的路徑照常查；改好了沒用到的要從表上刪掉。
 */
export const FROZEN_RULES = {
  before: 'docs/card-rules/',
  marker: '<!-- 以下送給 AI -->',
  links: {
    'plugins/cards/docs/card-rules/elementary-chinese.md': ['../../experiments/t4/arch/短規則.md', '../../experiments/t4/arch/第二輪/判斷邊界.md', '../../experiments/t4/arch/第二輪/五步.md', '../../experiments/t4/arch/第二輪/格式.md', '../decisions.md'],
    'plugins/cards/docs/card-rules/elementary-social.md': ['../../experiments/t4/arch/短規則.md', '../../experiments/t4/arch/第二輪/判斷邊界.md', '../../experiments/t4/arch/第二輪/五步.md', '../../experiments/t4/arch/第二輪/格式.md', '../decisions.md'],
    'plugins/cards/docs/card-rules/english.md': ['../decisions.md'],
  } as Record<string, string[]>,
};

/** 標記那一行的行號（1 起算）；不是表上的規則檔或沒有標記時是 undefined。 */
function frozenFrom(doc: Doc): number | undefined {
  if (!Object.hasOwn(FROZEN_RULES.links, doc.file)) return undefined;
  const at = doc.lines.findIndex(line => line.includes(FROZEN_RULES.marker));
  return at < 0 ? undefined : at + 1;
}

/** 連結的路徑部分（去掉錨點與查詢字串），和 FROZEN_RULES.links 比。 */
const linkPath = (href: string) => {
  const path = href.replace(/[?#].*$/, '');
  try {
    return decodeURIComponent(path);
  } catch {
    return path;
  }
};

export interface Problem { file: string; line: number; target: string; reason: string }

interface Doc { file: string; lines: string[]; tokens: Token[]; anchors: Set<string> }

const markdown = new MarkdownIt({ html: true });

function git(root: string, args: string[], input?: string): Buffer {
  return execFileSync('git', ['-c', 'core.quotepath=false', ...args], { cwd: root, input, stdio: 'pipe', maxBuffer: 1 << 28 });
}

const isMarkdown = (path: string) => path.toLowerCase().endsWith('.md');

// 回傳追蹤的檔案清單與其中 Markdown 的內容。
function loadTree(root: string, staged: boolean): { files: string[]; texts: Map<string, string> } {
  const texts = new Map<string, string>();
  if (!staged) {
    const files = [...new Set(git(root, ['ls-files', '-z']).toString('utf8').split('\0').filter(Boolean))]
      .filter(path => existsSync(join(root, path)));
    for (const path of files.filter(isMarkdown)) texts.set(path, readFileSync(join(root, path), 'utf8'));
    return { files, texts };
  }
  // 每一筆是「<mode> <object> <stage>\t<path>」；內容等同 git show :<path>，一次用 cat-file 讀完。
  const objects = new Map<string, string>();
  for (const entry of git(root, ['ls-files', '-s', '-z']).toString('utf8').split('\0').filter(Boolean)) {
    const tab = entry.indexOf('\t');
    const path = entry.slice(tab + 1);
    if (!objects.has(path)) objects.set(path, entry.slice(0, tab).split(' ')[1]);
  }
  const files = [...objects.keys()];
  const wanted = files.filter(isMarkdown);
  if (wanted.length) {
    const out = git(root, ['cat-file', '--batch'], wanted.map(path => objects.get(path)).join('\n') + '\n');
    let at = 0;
    for (const path of wanted) {
      const end = out.indexOf(0x0a, at);
      const size = Number(out.subarray(at, end).toString('latin1').split(' ')[2]);
      texts.set(path, out.subarray(end + 1, end + 1 + size).toString('utf8'));
      at = end + 1 + size + 1;
    }
  }
  return { files, texts };
}

// 換行統一成 LF；開頭的 YAML front matter 換成同樣行數的空行，行號不變。
function normalize(text: string): string {
  const lf = text.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  const front = /^---\n[\s\S]*?\n---(?:\n|$)/.exec(lf);
  return front ? front[0].replace(/[^\n]/g, '') + lf.slice(front[0].length) : lf;
}

// 標題與表格儲存格的純文字：行內程式碼取內容、連結取連結文字、HTML 不算。
function plainText(children: Token[]): string {
  return children.map(child => {
    if (child.type === 'text' || child.type === 'code_inline') return child.content;
    if (child.type === 'softbreak' || child.type === 'hardbreak') return ' ';
    if (child.type === 'image') return plainText(child.children ?? []);
    return '';
  }).join('');
}

function htmlIds(html: string, anchors: Set<string>) {
  for (const [, id] of html.matchAll(/\b(?:id|name)\s*=\s*["']([^"']+)["']/g)) anchors.add(id);
}

function parse(file: string, text: string): Doc {
  const source = normalize(text);
  const tokens = markdown.parse(source, {});
  const anchors = new Set<string>();
  const slugger = new GithubSlugger();
  tokens.forEach((token, i) => {
    if (token.type === 'heading_open') anchors.add(slugger.slug(plainText(tokens[i + 1].children ?? [])));
    else if (token.type === 'html_block') htmlIds(token.content, anchors);
    else if (token.type === 'inline') for (const child of token.children ?? []) if (child.type === 'html_inline') htmlIds(child.content, anchors);
  });
  return { file, lines: source.split('\n'), tokens, anchors };
}

// 連結與圖片的目的地，行號取所在區塊的第一行。
function linksOf(doc: Doc): { line: number; href: string }[] {
  const links: { line: number; href: string }[] = [];
  let line = 1;
  for (const token of doc.tokens) {
    if (token.map) line = token.map[0] + 1;
    if (token.type !== 'inline') continue;
    for (const child of token.children ?? []) {
      const href = child.type === 'link_open' ? child.attrGet('href') : child.type === 'image' ? child.attrGet('src') : null;
      if (href !== null) links.push({ line, href });
    }
  }
  return links;
}

const isExternal = (href: string) => href === '' || /^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith('//');

function decode(part: string): string | undefined {
  try {
    return decodeURIComponent(part);
  } catch {
    return undefined;
  }
}

class Tree {
  readonly paths = new Set<string>();
  readonly folded = new Map<string, string>();

  constructor(files: string[]) {
    for (const file of files) {
      const parts = file.split('/');
      for (let i = 1; i <= parts.length; i++) this.paths.add(parts.slice(0, i).join('/'));
    }
    for (const path of this.paths) this.folded.set(path.toLowerCase(), path);
  }
}

// target 是解碼後的目標；有問題時 reason 寫原因。
function checkLink(from: string, href: string, tree: Tree, docs: Map<string, Doc>): { target: string; reason?: string } {
  const hash = href.indexOf('#');
  const path = decode((hash < 0 ? href : href.slice(0, hash)).split('?')[0]);
  const fragment = hash < 0 ? '' : decode(href.slice(hash + 1));
  if (path === undefined || fragment === undefined) return { target: href, reason: '無法解碼' };
  const target = hash < 0 ? path : `${path}#${fragment}`;
  let file = from;
  if (path) {
    file = posix.normalize(path.startsWith('/') ? path.slice(1) : posix.join(posix.dirname(from), path)).replace(/\/+$/, '');
    if (file === '..' || file.startsWith('../')) return { target, reason: '指到 repo 外' };
    if (file !== '.' && !tree.paths.has(file)) {
      const actual = tree.folded.get(file.toLowerCase());
      return { target, reason: actual ? `大小寫不符（實際是 ${actual}）` : '找不到檔案' };
    }
  }
  const doc = docs.get(file);
  if (fragment && doc && !doc.anchors.has(fragment) && !doc.anchors.has(fragment.toLowerCase())) return { target, reason: '找不到錨點' };
  return { target };
}

interface Section { open: number; close: number }

// 二級標題的範圍：open 是標題、close 是下一個二級標題（或檔尾）在 tokens 的索引。
function section(doc: Doc, title: string): Section | undefined {
  const headings = doc.tokens.flatMap((token, i) => token.type === 'heading_open' && token.tag === 'h2' ? [i] : []);
  const at = headings.findIndex(i => plainText(doc.tokens[i + 1].children ?? []).trim() === title);
  if (at < 0) return undefined;
  return { open: headings[at], close: headings[at + 1] ?? doc.tokens.length };
}

function checkRoadmap(doc: Doc): Problem[] {
  const problems: Problem[] = [];
  const add = (line: number, target: string, reason: string) => problems.push({ file: doc.file, line, target, reason });
  if (!section(doc, '現在在哪裡')) add(1, '## 現在在哪裡', '找不到這一節');
  const done = section(doc, '已完成');
  if (!done) return problems;
  const tokens = doc.tokens.slice(done.open, done.close);
  const table = tokens.findIndex(token => token.type === 'table_open');
  if (table < 0) return problems;
  const tableEnd = tokens.findIndex((token, i) => i > table && token.type === 'table_close');
  const head = tokens.findIndex((token, i) => i > table && token.type === 'thead_close');
  const rows = tokens.slice(head, tableEnd).filter(token => token.type === 'tr_open');
  if (rows.length > DONE_ROWS) add(rows[DONE_ROWS].map![0] + 1, '## 已完成', `${rows.length} 列，上限 ${DONE_ROWS}`);
  return problems;
}

/** 外掛有自己的 roadmap 時，最上層 roadmap 的〈現在在哪裡〉一節裡要有連到它〈現在在哪裡〉的連結（D-208 第 4 點：最上層是入口）。 */
function checkPluginRoadmapLink(top: Doc | undefined, plugin: string): Problem[] {
  const target = `${posix.relative(posix.dirname(ROADMAP), plugin)}#現在在哪裡`;
  const reason = '外掛有自己的 roadmap，最上層的〈現在在哪裡〉要連到它的〈現在在哪裡〉（D-208 第 4 點）';
  if (!top) return [{ file: ROADMAP, line: 0, target, reason }];
  const now = section(top, '現在在哪裡');
  // 沒有這一節的由 checkRoadmap 報。
  if (!now) return [];
  const links = linksOf({ ...top, tokens: top.tokens.slice(now.open, now.close) });
  const found = links.some(({ href }) => {
    const hash = href.indexOf('#');
    if (hash < 0) return false;
    const path = decode(href.slice(0, hash).split('?')[0]);
    const fragment = decode(href.slice(hash + 1));
    return path !== undefined && posix.normalize(posix.join(posix.dirname(ROADMAP), path)) === plugin && fragment === '現在在哪裡';
  });
  return found ? [] : [{ file: ROADMAP, line: top.tokens[now.open].map![0] + 1, target, reason }];
}

// 標題下第一個非空行；沒有一級標題時是 undefined。
function statusLine(doc: Doc): { heading?: Token; index?: number } {
  const heading = doc.tokens.find(token => token.type === 'heading_open' && token.tag === 'h1');
  if (!heading) return {};
  const after = heading.map![1];
  const offset = doc.lines.slice(after).findIndex(line => line.trim() !== '');
  return { heading, index: offset >= 0 ? after + offset : undefined };
}

function checkStatus(doc: Doc): Problem[] {
  const { heading, index } = statusLine(doc);
  if (!heading) return [{ file: doc.file, line: 1, target: '# 標題', reason: '沒有一級標題' }];
  if (index !== undefined && doc.lines[index].includes('狀態：')) return [];
  return [{ file: doc.file, line: index !== undefined ? index + 1 : heading.map![0] + 1, target: '狀態：', reason: '標題下第一個非空行沒有狀態' }];
}

// 狀態值後面要是分隔符號：「已完成第一部分」不算結束（Codex 查核 D-195 第 4 節）。「已合併進 `main`」是結束
// （第二次里程碑檢查 R1：這樣寫的 5 份任務原本都沒被查）。
const FINISHED = /狀態：\s*(?:已完成|已合併進?|已結案|完成)(?=$|[\s（(：:，,、；;｜|→—])/;
// 「無」後面只能接說明的分隔符號：「無法測」不算無。
const NONE = /^無(?=$|[\s（(：:，,、；;。.｜|—])/;
const FIELD = /^延後的測試：(.*)$/;
const ROW_REF = /「((?:補測|補做)：[^」]+)」/g;

// 標題的層級與純文字。
const headingAt = (doc: Doc, i: number) => ({ level: Number(doc.tokens[i].tag.slice(1)), title: plainText(doc.tokens[i + 1].children ?? []).trim() });

// 從標題 i 到下一個同層或更高層標題之間的 token 索引。
function under(doc: Doc, i: number): [number, number] {
  const { level } = headingAt(doc, i);
  const end = doc.tokens.findIndex((token, j) => j > i && token.type === 'heading_open' && Number(token.tag.slice(1)) <= level);
  return [i, end < 0 ? doc.tokens.length : end];
}

// 段落或清單項目開頭的「延後的測試：」；引用框、表格、程式碼與 HTML 裡的不算。
function fields(doc: Doc, [from, to]: [number, number]): { line: number; value: string }[] {
  const found: { line: number; value: string }[] = [];
  let quote = 0;
  for (let i = from; i < to; i++) {
    const token = doc.tokens[i];
    if (token.type === 'blockquote_open') quote++;
    else if (token.type === 'blockquote_close') quote--;
    else if (token.type === 'inline' && quote === 0 && doc.tokens[i - 1]?.type === 'paragraph_open') {
      const match = FIELD.exec(plainText(token.children ?? []).trim());
      if (match) found.push({ line: token.map![0] + 1, value: match[1].trim() });
    }
  }
  return found;
}

// 技術債表每一列第一格的純文字（D-195 的計數與對照共用）。
export const debtRows = (doc: Doc | undefined): string[] => debtTable(doc) ?? [];

// 同上；沒有這份檔或沒有〈技術債〉一節時是 undefined（外掛的 backlog 可能還沒有技術債表）。
function debtTable(doc: Doc | undefined): string[] | undefined {
  if (!doc) return undefined;
  const at = doc.tokens.findIndex((token, i) => token.type === 'heading_open' && headingAt(doc, i).title === '技術債');
  if (at < 0) return undefined;
  const [from, to] = under(doc, at);
  const rows: string[] = [];
  for (let i = from; i < to; i++) {
    if (doc.tokens[i].type !== 'tr_open' || doc.tokens[i + 1]?.type !== 'td_open') continue;
    rows.push(plainText(doc.tokens[i + 2].children ?? []).trim());
  }
  return rows;
}

const isDeferredRow = (row: string) => /^(?:補測|補做)：/.test(row);

/** 一份 backlog 的技術債表還有幾列「補測：」「補做：」（進度畫板也用）。 */
export const countDeferred = (backlog: string) => debtRows(parse(BACKLOG, backlog)).filter(isDeferredRow).length;

// D-195：任務的狀態改成已完成、已合併、已結案時，以「結果」開頭的二級標題底下（含三級小節）要有恰好一行「延後的測試：」，
// 寫「無」或技術債表的列名（「補測：…」「補做：…」）。debt 有給時（只對這次改到的檔）列名要對得到那個任務的 backlog
// （最上層的任務對最上層的 backlog，外掛的任務對外掛的；rows 是 undefined 表示那份沒有技術債表）。
/** 舊位置（D-213 第 4 點）：任務與討論稿搬進 docs/ 之後，最上層或外掛根目錄的 tasks/、Claude Codex Discussion/ 不再放檔。 */
const OLD_PLACE = /^((?:plugins\/[^/]+\/)?)(tasks|Claude Codex Discussion)\//;
function checkOldPlace(file: string): Problem[] {
  const match = OLD_PLACE.exec(file);
  if (!match) return [];
  const [, plugin, dir] = match;
  return [{ file, line: 0, target: `${plugin}docs/${dir}/`, reason: '任務與討論稿放 docs/ 底下（D-213）：搬到這個位置' }];
}

function checkDeferred(doc: Doc, debt?: { file: string; rows: string[] | undefined }): Problem[] {
  const name = posix.basename(doc.file);
  const backlog = taskBacklog(doc.file);
  // BEFORE_D195 只放過那時的資料夾裡的舊任務：其他外掛的同名檔（例如 plugins/mindboard/docs/tasks/w3.md）照查。
  if (!backlog || name === 'README.md' || name.endsWith('review.md') || (BEFORE_D195_DIRS.has(posix.dirname(doc.file)) && BEFORE_D195.has(name))) return [];
  const { index } = statusLine(doc);
  if (index === undefined || !FINISHED.test(doc.lines[index])) return [];
  const problem = (line: number, reason: string): Problem[] => [{ file: doc.file, line, target: '延後的測試：', reason: `${reason}（D-195）` }];
  const result = doc.tokens.findIndex((token, i) => token.type === 'heading_open' && token.tag === 'h2' && headingAt(doc, i).title.startsWith('結果'));
  const found = result < 0 ? [] : fields(doc, under(doc, result));
  if (!found.length) return problem(index + 1, '任務已結束，〈結果〉沒有「延後的測試：」一行');
  if (found.length > 1) return problem(found[1].line, `「延後的測試：」有 ${found.length} 行，只能有一行`);
  const { line, value } = found[0];
  if (!value || value.includes('實作後填')) return problem(line, '還沒填：寫「無」或技術債表的列名');
  if (NONE.test(value)) return [];
  const refs = [...value.matchAll(ROW_REF)].map(m => m[1].trim());
  if (!refs.length) return problem(line, '寫「無」，或用「」括住技術債表的列名，例如「補測：……」');
  if (!debt) return [];
  const { file, rows } = debt;
  if (!rows) return problem(line, `${file} 沒有技術債表（或沒有這份檔），對不到列名`);
  const where = file === BACKLOG ? '' : `${file} 的`;
  return refs.filter(ref => !rows.some(row => row.startsWith(ref))).flatMap(ref => problem(line, `${where}技術債表找不到「${ref}」開頭的列`));
}

export function checkDocs(root: string, { staged = false, exceptions = EXCEPTIONS }: { staged?: boolean; exceptions?: Exception[] } = {}) {
  const { files, texts } = loadTree(root, staged);
  const tree = new Tree(files);
  const docs = new Map([...texts].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([file, text]) => [file, parse(file, text)]));
  const problems: Problem[] = [];
  const used = new Set<Exception>();
  const usedFrozen = new Set<string>();
  // 列名只對照這次 commit 改到的任務：補完刪掉的列，不會讓以前結束的任務壞掉。-z 拿原本的路徑（檔名有空白、中文或引號都一樣）。
  const changed = staged ? new Set(git(root, ['diff', '--cached', '--name-only', '-z', '--no-renames', '--diff-filter=ACMR']).toString('utf8').split('\0').filter(Boolean)) : new Set<string>();
  const tables = new Map<string, string[] | undefined>();
  const debtFor = (file: string) => {
    const backlog = taskBacklog(file);
    if (!backlog) return undefined;
    if (!tables.has(backlog)) tables.set(backlog, debtTable(docs.get(backlog)));
    return { file: backlog, rows: tables.get(backlog) };
  };
  let links = 0;
  for (const file of files) problems.push(...checkOldPlace(file));
  for (const doc of docs.values()) {
    const frozen = frozenFrom(doc);
    for (const { line, href } of linksOf(doc)) {
      if (isExternal(href)) continue;
      links++;
      const { target, reason } = checkLink(doc.file, href, tree, docs);
      if (!reason) continue;
      if (frozen !== undefined && line > frozen && FROZEN_RULES.links[doc.file]?.includes(linkPath(href))
        && !checkLink(FROZEN_RULES.before + posix.basename(doc.file), href, tree, docs).reason) {
        usedFrozen.add(doc.file + '\0' + linkPath(href));
        continue;
      }
      const exception = exceptions.find(e => e.file === doc.file && e.target === target);
      if (exception) used.add(exception);
      else problems.push({ file: doc.file, line, target, reason });
    }
    if (doc.file === ROADMAP || PLUGIN_ROADMAP.test(doc.file)) problems.push(...checkRoadmap(doc));
    if (PLUGIN_ROADMAP.test(doc.file)) problems.push(...checkPluginRoadmapLink(docs.get(ROADMAP), doc.file));
    if (isStatusDoc(doc.file)) problems.push(...checkStatus(doc));
    problems.push(...checkDeferred(doc, changed.has(doc.file) ? debtFor(doc.file) : undefined));
  }
  for (const e of exceptions.filter(e => !used.has(e))) problems.push({ file: e.file, line: 0, target: e.target, reason: '例外表的這一項沒有用到，請刪掉' });
  // 規則檔整份拿掉或改名時不報（表上那一列跟著刪）。
  for (const [file, paths] of Object.entries(FROZEN_RULES.links)) {
    if (!docs.has(file)) continue;
    for (const path of paths.filter(path => !usedFrozen.has(file + '\0' + path))) {
      problems.push({ file, line: 0, target: path, reason: 'FROZEN_RULES 的這一項沒有用到（連結改好了或拿掉了），請刪掉' });
    }
  }
  const deferred = DEFERRED_BACKLOGS.reduce((sum, file) => sum + debtRows(docs.get(file)).filter(isDeferredRow).length, 0);
  return { problems, files: docs.size, links, deferred };
}

export const formatProblem = (p: Problem) => `${p.file}${p.line ? `:${p.line}` : ''}  ${p.target}  ${p.reason}`;

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  const at = args.indexOf('--root');
  const root = at >= 0 ? resolve(args[at + 1]) : resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const staged = args.includes('--staged');
  // --root 給測試用，別的 repo 不套用這裡的例外表。
  const { problems, files, links, deferred } = checkDocs(root, { staged, exceptions: at >= 0 ? [] : EXCEPTIONS });
  if (problems.length) {
    console.error(`文件檢查有 ${problems.length} 個問題（${staged ? '暫存區' : '工作樹'}）：`);
    for (const problem of problems) console.error(formatProblem(problem));
    process.exit(1);
  }
  console.log(`文件檢查通過（${staged ? '暫存區' : '工作樹'}）：${files} 個 Markdown 檔、${links} 個連結；待補測與補做 ${deferred} 列（最上層與 Cards 的 backlog 技術債，D-195）`);
}
