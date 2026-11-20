// 文件檢查（D-141、D-143、D-195）：Git 追蹤的 Markdown 裡本機可判定的連結與錨點、任務、討論稿與 plans 的檔頭狀態行、結束的任務有「延後的測試：」一行。
// 外掛的資料夾（D-208 第 4 點）：plugins/<外掛>/docs/ 底下的 tasks、討論稿、plans 與 roadmap.md 照同樣的規則查；外掛的任務對外掛自己的 backlog；
// 外掛有 roadmap 時，最上層 roadmap 的〈現在在哪裡〉要連到它的〈現在在哪裡〉。
// 任務與討論稿在 docs/ 底下（D-213）：最上層或 plugins/<外掛>/ 根目錄的 tasks/、Claude Codex Discussion/ 有追蹤的檔就報錯。
// 工作流程（D-214、D-217，寫法見 docs/agents/workflow.md）：凍結清單外的狀態檔、與看起來是新格式的狀態行照新格式查；「來自」與「→ 下一站」要互相連回；
// backlog 只有〈待處理〉〈已轉出〉兩節；roadmap 依序有〈現在在哪裡〉〈等觸發點〉〈已完成〉（〈已完成〉不設列數上限）。
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
import { BOUNDARY, DecisionsError, parseDecisions } from './decisions.ts';
import { looksNew, parseStatus } from './status-line.ts';

export const ROADMAP = 'docs/roadmap.md';
const STATUS_DIRS = ['docs/tasks', 'docs/Claude Codex Discussion', 'docs/plans'];
/** 2026-11-21 以前就有的狀態檔（D-217 第 6 點：舊的不改）。清單外的照新格式查；這份由 git ls-files 產生一次，之後只刪不加。 */
export const LEGACY_STATUS = 'tools/legacy-status-docs.json';
const DECISIONS = 'docs/decisions.md';

export const BACKLOG = 'docs/backlog.md';
/** 「待補測與補做」算哪幾份 backlog 的技術債表（進度畫板也用）：最上層與 Cards（D-208 第二步 §B3）。 */
export const DEFERRED_BACKLOGS = [BACKLOG, 'plugins/cards/docs/backlog.md'];

const PLUGIN_ROADMAP = /^plugins\/([^/]+)\/docs\/roadmap\.md$/;
const ANY_BACKLOG = /^(?:plugins\/[^/]+\/)?docs\/backlog\.md$/;
/** roadmap 的三節，依這個順序（D-214 第 4 點）。 */
export const ROADMAP_SECTIONS = ['現在在哪裡', '等觸發點', '已完成'];
const BACKLOG_SECTIONS = ['待處理', '已轉出'];

/** docs/ 底下的 tasks、討論稿與 plans 第一層的檔（最上層與 plugins/<外掛>/ 底下都算），README 除外。 */
export function isStatusDoc(file: string): boolean {
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

interface Heading { line: number; level: number; slug: string }
interface Doc { file: string; lines: string[]; tokens: Token[]; anchors: Set<string>; headings: Heading[] }

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
  const headings: Heading[] = [];
  const slugger = new GithubSlugger();
  tokens.forEach((token, i) => {
    if (token.type === 'heading_open') {
      const slug = slugger.slug(plainText(tokens[i + 1].children ?? []));
      anchors.add(slug);
      headings.push({ line: token.map![0] + 1, level: Number(token.tag.slice(1)), slug });
    } else if (token.type === 'html_block') htmlIds(token.content, anchors);
    else if (token.type === 'inline') for (const child of token.children ?? []) if (child.type === 'html_inline') htmlIds(child.content, anchors);
  });
  return { file, lines: source.split('\n'), tokens, anchors, headings };
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

// 二級標題的純文字與行號，照出現的順序。
const h2Titles = (doc: Doc) => doc.tokens.flatMap((token, i) => token.type === 'heading_open' && token.tag === 'h2'
  ? [{ title: plainText(doc.tokens[i + 1].children ?? []).trim(), line: token.map![0] + 1 }] : []);

/** roadmap 依序有〈現在在哪裡〉〈等觸發點〉〈已完成〉，中間可以有別的節（D-214 第 4 點）；〈已完成〉不設列數上限、不搬去封存（第 5 點）。 */
function checkRoadmap(doc: Doc): Problem[] {
  const titles = h2Titles(doc);
  const at = ROADMAP_SECTIONS.map(title => titles.findIndex(h => h.title === title));
  const missing = ROADMAP_SECTIONS.filter((_, i) => at[i] < 0);
  if (missing.length) return missing.map(title => ({ file: doc.file, line: 1, target: `## ${title}`, reason: '找不到這一節' }));
  if (at.some((index, i) => i > 0 && index < at[i - 1])) {
    return [{ file: doc.file, line: titles[at[0]].line, target: '## 現在在哪裡', reason: `三節要依序是${ROADMAP_SECTIONS.map(t => `〈${t}〉`).join('、')}` }];
  }
  return [];
}

/** backlog 的二級標題只有〈待處理〉〈已轉出〉，依這個順序；其他分類放在這兩節底下（D-214 第 4 點）。 */
function checkBacklogSections(doc: Doc): Problem[] {
  const titles = h2Titles(doc);
  if (titles.length === BACKLOG_SECTIONS.length && titles.every((h, i) => h.title === BACKLOG_SECTIONS[i])) return [];
  const extra = titles.find(h => !BACKLOG_SECTIONS.includes(h.title));
  return [{
    file: doc.file, line: extra?.line ?? 1, target: extra ? `## ${extra.title}` : '## 待處理',
    reason: `backlog 的二級標題只有${BACKLOG_SECTIONS.map(t => `〈${t}〉`).join('、')}，依這個順序；其他分類降成三級放進這兩節`,
  }];
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

/**
 * 任務、討論稿與 plans 的狀態行。strict（凍結清單外的檔）照新格式（D-217 第 2 點）；清單裡的照舊只看有沒有「狀態：」。
 * 任何檔的狀態行看起來是新格式（looksNew），都照新格式查：清單裡的舊檔改成新格式時就會被查。
 */
function checkStatus(doc: Doc, strict: boolean): Problem[] {
  const { heading, index } = statusLine(doc);
  if (!heading) return [{ file: doc.file, line: 1, target: '# 標題', reason: '沒有一級標題' }];
  const line = index === undefined ? undefined : doc.lines[index];
  if (line !== undefined && (strict || looksNew(line))) return checkNewStatus(doc, index!);
  if (line?.includes('狀態：')) return [];
  return [{ file: doc.file, line: index !== undefined ? index + 1 : heading.map![0] + 1, target: '狀態：', reason: '標題下第一個非空行沒有狀態' }];
}

function checkNewStatus(doc: Doc, index: number): Problem[] {
  const problem = (reason: string): Problem[] => [{ file: doc.file, line: index + 1, target: '狀態：', reason }];
  const plain = doc.tokens.some(token => token.type === 'paragraph_open' && token.level === 0 && token.map?.[0] === index);
  if (!plain) return problem('狀態行要是標題下的一般段落（不在引用框、清單或程式碼區塊裡）');
  const result = parseStatus(doc.lines[index]);
  return 'error' in result ? problem(result.error) : [];
}

/** 不是狀態檔的 Markdown（roadmap、card-rules……）：狀態行看起來是新格式才查。 */
function checkLooksNew(doc: Doc): Problem[] {
  const { index } = statusLine(doc);
  return index !== undefined && looksNew(doc.lines[index]) ? checkNewStatus(doc, index) : [];
}

// ── 「來自」與「→ 下一站」（D-214 第 3 點；站的定義見 docs/agents/workflow.md〈連結〉） ──

interface Target { file: string; anchor: string }
interface Arrow { file: string; line: number; station?: string; to?: Target }

const ARROW_START = /^→\s*\[/;
const ARROW = /^→\s*\[[^\]]*\]\((<[^>]*>|[^)\s]+)\)（(\d{4})-(\d{2})-(\d{2})）$/;

const realDate = (y: string, m: string, d: string) => {
  const date = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
  return date.getUTCFullYear() === Number(y) && date.getUTCMonth() === Number(m) - 1 && date.getUTCDate() === Number(d);
};

/** 連結解析成 repo 裡的檔與錨點（相對 from）；外部連結、解碼不了、指到 repo 外時是 undefined。 */
function resolveHref(from: string, raw: string): Target | undefined {
  const href = raw.replace(/^<|>$/g, '');
  if (isExternal(href)) return undefined;
  const hash = href.indexOf('#');
  const path = decode((hash < 0 ? href : href.slice(0, hash)).split('?')[0]);
  const anchor = hash < 0 ? '' : decode(href.slice(hash + 1));
  if (path === undefined || anchor === undefined) return undefined;
  const file = path ? posix.normalize(path.startsWith('/') ? path.slice(1) : posix.join(posix.dirname(from), path)) : from;
  return file.startsWith('../') ? undefined : { file, anchor };
}

/** 一般段落（不在引用框、表格、標題裡）的每一行與它的行號；清單項目裡的段落也算。 */
function paragraphLines(doc: Doc, [from, to]: [number, number] = [0, doc.tokens.length]): { line: number; text: string }[] {
  const out: { line: number; text: string }[] = [];
  let quote = 0;
  for (let i = from; i < to; i++) {
    const token = doc.tokens[i];
    if (token.type === 'blockquote_open') quote++;
    else if (token.type === 'blockquote_close') quote--;
    else if (token.type === 'inline' && quote === 0 && doc.tokens[i - 1]?.type === 'paragraph_open' && token.map) {
      token.content.split('\n').forEach((text, offset) => out.push({ line: token.map![0] + 1 + offset, text: text.trim() }));
    }
  }
  return out;
}

/** backlog 的一站是「檔＋最近的標題」：那一行之前最近的標題的錨點。 */
const stationAnchor = (doc: Doc, line: number) => doc.headings.filter(h => h.line <= line).at(-1)?.slug ?? '';

/** 二級標題 title 那一節的 token 範圍。 */
function h2Range(doc: Doc, title: string): [number, number] | undefined {
  const found = section(doc, title);
  return found ? [found.open, found.close] : undefined;
}

/** 錨點那個標題底下（到下一個同級或更高的標題）的 token 範圍；找不到時是整份。 */
function anchorRange(doc: Doc, anchor: string): [number, number] {
  const at = doc.headings.findIndex(h => h.slug === anchor);
  if (at < 0) return [0, doc.tokens.length];
  const start = doc.tokens.findIndex(token => token.type === 'heading_open' && token.map![0] + 1 === doc.headings[at].line);
  return under(doc, start);
}

/** 一份檔的「→」行：格式、日期、backlog〈待處理〉裡不能有。決策紀錄不看（決定的上游寫在狀態行）。 */
function arrowsOf(doc: Doc, problems: Problem[]): Arrow[] {
  if (doc.file === DECISIONS) return [];
  const backlog = ANY_BACKLOG.test(doc.file);
  const pending = backlog ? h2Range(doc, '待處理') : undefined;
  const pendingLines = pending ? [doc.tokens[pending[0]].map![0] + 1, pending[1] < doc.tokens.length ? doc.tokens[pending[1]].map![0] + 1 : Infinity] : undefined;
  const arrows: Arrow[] = [];
  for (const { line, text } of paragraphLines(doc)) {
    if (!ARROW_START.test(text)) continue;
    const add = (reason: string) => problems.push({ file: doc.file, line, target: '→', reason });
    const match = ARROW.exec(text);
    if (!match) {
      add('「→」那一行寫成「→ [文字](連結)（YYYY-MM-DD）」，一行一個連結');
      continue;
    }
    const [, href, y, m, d] = match;
    if (isExternal(href.replace(/^<|>$/g, ''))) add('「→」要連到 repo 裡的一站（任務、討論稿、plans、backlog 的項目或決定），不連外部網址');
    if (!realDate(y, m, d)) add(`${y}-${m}-${d} 不是真的日期`);
    if (pendingLines && line > pendingLines[0] && line < pendingLines[1]) add('轉出的項目搬到〈已轉出〉：〈待處理〉裡不能有「→」（D-214 第 4 點）');
    arrows.push({ file: doc.file, line, station: backlog ? stationAnchor(doc, line) : undefined, to: resolveHref(doc.file, href) });
  }
  return arrows;
}

/** 一站的「來自」連結：一般檔是第一個二級標題之前、以「來自：」開頭的段落；backlog 是錨點那一節裡的。 */
function fromLinks(doc: Doc, range: [number, number]): { line: number; to: Target }[] {
  const out: { line: number; to: Target }[] = [];
  for (const { line, text } of paragraphLines(doc, range)) {
    if (!text.startsWith('來自：')) continue;
    // 只取這一行的行內連結（狀態行和「來自」沒空行時是同一段，不能把狀態行的連結算進來）。
    for (const [, href] of text.matchAll(INLINE_LINK)) {
      const to = resolveHref(doc.file, href);
      if (to) out.push({ line, to });
    }
  }
  return out;
}

const INLINE_LINK = /\[[^\]]*\]\((<[^>]*>|[^)\s]+)(?:\s+"[^"]*")?\)/g;

const firstH2 = (doc: Doc): [number, number] => {
  const at = doc.tokens.findIndex(token => token.type === 'heading_open' && token.tag === 'h2');
  return [0, at < 0 ? doc.tokens.length : at];
};

/** 「來自」與「→」互相連回；「→」指到 D-218 以前的決定報錯（舊決定沒有「來自」）。 */
function checkStations(docs: Map<string, Doc>): Problem[] {
  const problems: Problem[] = [];
  const arrows = [...docs.values()].flatMap(doc => arrowsOf(doc, problems));
  let decisions: ReturnType<typeof parseDecisions> | undefined;
  const decisionsDoc = docs.get(DECISIONS);
  // 沒有任何決定（測試的暫存 repo）就不看。
  if (decisionsDoc?.lines.some(line => /^## D-\d+ /.test(line))) {
    try {
      decisions = parseDecisions(decisionsDoc.lines.join('\n'));
    } catch (error) {
      if (!(error instanceof DecisionsError)) throw error;
      problems.push({ file: DECISIONS, line: 0, target: DECISIONS, reason: error.message });
    }
  }
  const byAnchor = new Map(decisions?.decisions.map(d => [d.anchor, d]));
  const sameStation = (to: Target, file: string, station: string | undefined) => to.file === file && (station === undefined || to.anchor === station);

  // 「→」指到的站要有「來自」連回。
  for (const arrow of arrows) {
    const { to } = arrow;
    if (!to) continue;
    const problem = (reason: string) => problems.push({ file: arrow.file, line: arrow.line, target: '→', reason });
    if (to.file === DECISIONS) {
      const decision = byAnchor.get(to.anchor);
      if (!decision) continue; // 錨點找不到由連結檢查報。
      if (decision.legacy) {
        problem(`${decision.id} 是 D-${BOUNDARY} 以前的決定，沒有「來自」：不寫「→」，在內文提到就好`);
        continue;
      }
      const back = decision.sources.map(href => resolveHref(DECISIONS, href)).filter(t => t !== undefined);
      if (!back.some(t => sameStation(t, arrow.file, arrow.station))) problem(`${decision.id} 的狀態行「來自」沒有連回這裡${arrow.station ? `（#${arrow.station}）` : ''}`);
      continue;
    }
    const target = docs.get(to.file);
    if (!target) {
      if (!to.file.toLowerCase().endsWith('.md')) problem('「→」要指到一站（任務、討論稿、plans 或決定）');
      continue;
    }
    const range = ANY_BACKLOG.test(to.file) ? anchorRange(target, to.anchor) : firstH2(target);
    if (!fromLinks(target, range).some(({ to: back }) => sameStation(back, arrow.file, arrow.station))) {
      problem(`${to.file} 沒有「來自」連回這裡${arrow.station ? `（#${arrow.station}）` : ''}：在它第一個二級標題之前寫「來自：[…](…)」`);
    }
  }

  // 「來自」連到的站要有「→」連過來；連到決定的不用（決定的「現在在哪」由工具算）。
  const needArrow = (file: string, line: number, from: Target, here: Target) => {
    if (from.file === DECISIONS || !docs.has(from.file)) return;
    const station = ANY_BACKLOG.test(from.file) && from.anchor ? from.anchor : undefined;
    const found = arrows.some(a => a.file === from.file && (station === undefined || a.station === station)
      && a.to?.file === here.file && (!here.anchor || a.to.anchor === here.anchor));
    if (!found) problems.push({ file, line, target: '來自', reason: `${from.file}${station ? `#${station}` : ''} 沒有「→」連到這裡：在那一站加一行「→ [文字](連結)（YYYY-MM-DD）」` });
  };
  for (const doc of docs.values()) {
    if (doc.file === DECISIONS || ANY_BACKLOG.test(doc.file)) continue;
    const links = fromLinks(doc, firstH2(doc));
    const paragraphs = new Set(links.map(l => l.line));
    if (paragraphs.size > 1) problems.push({ file: doc.file, line: [...paragraphs][1], target: '來自', reason: '「來自」只寫一段；好幾處用「、」接' });
    for (const { line, to } of links) needArrow(doc.file, line, to, { file: doc.file, anchor: '' });
  }
  for (const decision of decisions?.decisions ?? []) {
    if (decision.legacy) continue;
    const line = decisionsDoc!.lines.findIndex(l => l.startsWith(`## ${decision.id} `)) + 1;
    for (const href of decision.sources) {
      const from = resolveHref(DECISIONS, href);
      if (from) needArrow(DECISIONS, line, from, { file: DECISIONS, anchor: decision.anchor });
    }
  }
  return problems;
}

/** 一站的鍵：決定與 backlog 是「檔#錨點」，其他檔是檔本身（連結裡的錨點不算）。 */
const stationKey = (to: Target) => to.file === DECISIONS || ANY_BACKLOG.test(to.file) ? `${to.file}#${to.anchor}` : to.file;

/**
 * 從 start（站的鍵）往下游走到的最下游，照走到的順序（D-214 第 2、3 點；docs/agents/workflow.md〈連結〉）。
 * 每一條「→」、反過來的每一條「來自」、新寫法的決定狀態行裡的「來自」都是一條往下游的邊。
 * 最下游是走不出去的那一站；退回造成循環時，整個循環走不出去，最下游是循環裡從外面走進來的那一站（退回到的那一站）。
 * 循環包含 start 的不算。決定與 backlog 的鍵是「檔#錨點」，其他是檔。
 */
export function downstreamOf(texts: ReadonlyMap<string, string>, start: string): string[] {
  const edges = new Map<string, Set<string>>();
  const add = (from: string, to: string) => {
    if (from !== to) edges.set(from, (edges.get(from) ?? new Set()).add(to));
  };
  const ignored: Problem[] = [];
  for (const [file, text] of texts) {
    if (!isMarkdown(file)) continue;
    const doc = parse(file, text);
    for (const arrow of arrowsOf(doc, ignored)) {
      if (arrow.to) add(arrow.station === undefined ? file : `${file}#${arrow.station}`, stationKey(arrow.to));
    }
    if (file === DECISIONS) continue;
    // backlog 的「來自」寫在各個項目底下，站是它最近的標題；其他檔寫在第一個二級標題之前。
    const backlog = ANY_BACKLOG.test(file);
    for (const { line, to } of fromLinks(doc, backlog ? [0, doc.tokens.length] : firstH2(doc))) {
      add(stationKey(to), backlog ? `${file}#${stationAnchor(doc, line)}` : file);
    }
  }
  const decisions = texts.get(DECISIONS);
  if (decisions && /^## D-\d+ /m.test(decisions)) {
    const parsed = parseDecisions(decisions);
    for (const decision of parsed.decisions) {
      if (decision.legacy) continue;
      const here = `${DECISIONS}#${decision.anchor}`;
      for (const href of decision.sources) {
        const from = resolveHref(DECISIONS, href);
        if (from) add(stationKey(from), here);
      }
      // 「來自」另一條決定（「修改」「補充」不算：那是後續見，由決策查詢工具列）。
      const segment = decision.metadata.split('｜').map(s => s.trim()).find(s => s.startsWith('來自'));
      for (const [id] of segment?.matchAll(/D-\d+/g) ?? []) {
        const from = parsed.byId.get(id);
        if (from) add(`${DECISIONS}#${from.anchor}`, here);
      }
    }
  }

  const reach = (from: string) => {
    const seen = new Set([from]);
    for (const node of seen) for (const next of edges.get(node) ?? []) seen.add(next);
    return seen;
  };
  const all = reach(start);
  const reachOf = new Map([...all].map(node => [node, reach(node)]));
  return [...all].filter(node => {
    if (node === start) return false;
    // 和 node 在同一個循環的站（互相走得到）；走不出這個循環才是最下游。
    const group = [...reachOf.get(node)!].filter(other => reachOf.get(other)!.has(node));
    if (group.includes(start) || group.length !== reachOf.get(node)!.size) return false;
    return group.length === 1 || [...all].some(other => !group.includes(other) && edges.get(other)?.has(node));
  });
}

/** repo 追蹤的 Markdown 內容（staged 時讀暫存區），給要沿著連結走的工具用；不是 Git repo 時是空的。 */
export function markdownTexts(root: string, staged = false): Map<string, string> {
  return existsSync(join(root, '.git')) ? loadTree(root, staged).texts : new Map<string, string>();
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

/** 凍結清單（LEGACY_STATUS）：和 Markdown 讀同一處（工作樹或暫存區）。沒有這份檔是空清單（每份狀態檔都照新格式查）。 */
function readLegacy(root: string, staged: boolean, files: string[], problems: Problem[]): Set<string> {
  if (!files.includes(LEGACY_STATUS)) return new Set();
  try {
    const text = staged ? git(root, ['show', `:${LEGACY_STATUS}`]).toString('utf8') : readFileSync(join(root, LEGACY_STATUS), 'utf8');
    const list: unknown = JSON.parse(text);
    if (Array.isArray(list) && list.every(item => typeof item === 'string')) return new Set(list);
  } catch {
    // 讀不到或不是 JSON：和格式不對一樣報。
  }
  problems.push({ file: LEGACY_STATUS, line: 0, target: LEGACY_STATUS, reason: '要是路徑字串的 JSON 陣列' });
  return new Set();
}

/**
 * legacy：凍結清單（測試用）；'all' 是每份狀態檔都當舊的（只查看起來是新格式的狀態行）。沒給時讀 repo 裡的 LEGACY_STATUS。
 */
export function checkDocs(root: string, { staged = false, exceptions = EXCEPTIONS, legacy }: { staged?: boolean; exceptions?: Exception[]; legacy?: ReadonlySet<string> | 'all' } = {}) {
  const { files, texts } = loadTree(root, staged);
  const tree = new Tree(files);
  const docs = new Map([...texts].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([file, text]) => [file, parse(file, text)]));
  const problems: Problem[] = [];
  const frozenStatus = legacy ?? readLegacy(root, staged, files, problems);
  const isLegacy = (file: string) => frozenStatus === 'all' || frozenStatus.has(file);
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
    if (ANY_BACKLOG.test(doc.file)) problems.push(...checkBacklogSections(doc));
    if (isStatusDoc(doc.file)) problems.push(...checkStatus(doc, !isLegacy(doc.file)));
    else problems.push(...checkLooksNew(doc));
    problems.push(...checkDeferred(doc, changed.has(doc.file) ? debtFor(doc.file) : undefined));
  }
  if (frozenStatus !== 'all') {
    for (const file of [...frozenStatus].filter(file => !docs.has(file) || !isStatusDoc(file))) {
      problems.push({ file: LEGACY_STATUS, line: 0, target: file, reason: '凍結清單的這一項不在了（或不是任務、討論稿、plans 第一層的檔），請刪掉這一列' });
    }
  }
  problems.push(...checkStations(docs));
  for (const e of exceptions.filter(e => !used.has(e))) problems.push({ file: e.file, line: 0, target: e.target, reason: '例外表的這一項沒有用到，請刪掉' });
  // 規則檔整份拿掉或改名（連整個資料夾一起搬也算）也要刪那一列，不然之後同名的新檔會被放過（第二、三輪）。
  // 只看 Cards 外掛在的 repo（有 manifest）：測試的暫存 repo 沒有，不看。
  const rulesHere = tree.paths.has('plugins/cards/manifest.json');
  for (const [file, paths] of Object.entries(FROZEN_RULES.links)) {
    if (!docs.has(file)) {
      if (rulesHere) problems.push({ file, line: 0, target: file, reason: 'FROZEN_RULES 的這一列的檔不在了（拿掉或改名），請刪掉這一列' });
      continue;
    }
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
