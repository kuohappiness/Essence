// 開發進度白板：把 roadmap 的「現在在哪裡」與「已完成」換成手機好讀的一頁（D-141：roadmap 是唯一來源，這頁只換樣子顯示）。
// 最上層的 docs/roadmap.md 是入口，只讀它的「現在在哪裡」；外掛有自己的 roadmap（plugins/<外掛>/docs/roadmap.md，D-208 第 4 點）時，
// 也讀它的「現在在哪裡」，名稱前加外掛名。正式 vault 的版本與「已完成」只從 Cards 的 roadmap 讀（D-208 第二步 §B3）。
// main 上的 roadmap 一改，GitHub Actions（.github/workflows/progress-board.yml）就產生並發布到 GitHub Pages：https://kuohappiness.github.io/Essence/roadmap.html
// 本機預覽：node tools/roadmap-board.ts（要先在 tools/ 裝過相依），輸出 _site/roadmap.html（_site/ 在 .gitignore）；--out <檔案> 改輸出位置。
// --check：只讀、只解析每一份 roadmap 並查會不會帶出私人資訊，不寫網頁（tools 的 npm run check 與 pre-commit 用；--staged 讀暫存區）。--root <資料夾> 給測試用。
// 找不到需要的節或欄時印出「檔案:行號  原因」並以 exit code 1 結束；表格內容怎麼改都照樣產生。
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, posix, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import MarkdownIt, { type Token } from 'markdown-it';
import { LIST_PAGE as PROGRESS_MAP, TOKENS, escape } from './progress-board-data.ts';
import { downstreamOf, markdownTexts } from './check-docs.ts';
import { DecisionsError, linksOf, parseDecisions, summariesOf } from './decisions.ts';
import { parseStatus } from './status-line.ts';

export const ROADMAP = 'docs/roadmap.md';
/** 外掛的 roadmap：存在的才讀（由外掛的第一個任務建，建了就自動出現在白板上）。 */
export const PLUGIN_ROADMAP = /^plugins\/([^/]+)\/docs\/roadmap\.md$/;
/** 正式 vault 的版本與「已完成」從這份讀（現在只有 Cards 發布）。 */
export const RELEASE_ROADMAP = 'plugins/cards/docs/roadmap.md';
const REPO = 'https://github.com/kuohappiness/Essence';
const BLOB = `${REPO}/blob/main/`;
/** 發布在 GitHub Pages 同一站（https://kuohappiness.github.io/Essence/）的檔名。 */
export const BOARD_FILE = 'roadmap.html';

/** 連結的基準：相對連結以那份 roadmap 所在的資料夾為準，#錨點接到那份 roadmap 本身。 */
interface Base { dir: string; page: string }
const baseOf = (file: string): Base => ({ dir: `${BLOB}${posix.dirname(file)}/`, page: `${BLOB}${file}` });

/** html 是轉好的行內 HTML（連結改成 GitHub 網址）；text 是純文字，分組與摘要用。 */
export interface Cell { html: string; text: string }
export interface Work { name: Cell; status: Cell; next: Cell; waiting: Cell; entry: Cell }
export interface Done { date: string; work: Cell }
export interface Vault { version: string; date: string }
/** 最近定案的一條（D-214 第 6 點）：now 是新寫法的決定沿著「→」與「來自」走到的最下游與它的狀態。 */
export interface Decided { date: string; id: string; name: string; url: string; summary: Cell; now: { label: string; url: string; status: string }[] }
export interface Roadmap { works: Work[]; done: Done[]; vault: Vault | null; unreleased: Done[]; decided: Decided[] }

export class RoadmapError extends Error {
  readonly line: number;
  constructor(line: number, reason: string) { super(reason); this.line = line; }
}

const markdown = new MarkdownIt({ html: false, linkify: false });

/** 相對連結以 roadmap 所在的資料夾為基準改成 GitHub 上 main 的網址；roadmap 內的錨點接到那份 roadmap 的網址；http(s) 不動；其他（file:、本機路徑）拿掉連結只留文字。 */
function fixLinks(tokens: Token[], base: Base): Token[] {
  const kept: Token[] = [];
  let dropped = 0;
  for (const token of tokens) {
    if (token.type === 'link_close' && dropped) { dropped--; continue; }
    if (token.type !== 'link_open') { kept.push(token); continue; }
    const href = token.attrGet('href') ?? '';
    let url: string | null = null;
    if (/^https?:\/\//i.test(href)) url = href;
    else if (href.startsWith('#')) url = base.page + href;
    else if (!/^[a-z][a-z0-9+.-]*:|^[/\\]/i.test(href)) url = new URL(href, base.dir).href;
    if (!url) { dropped++; continue; }
    token.attrSet('href', url);
    token.attrSet('target', '_blank');
    token.attrSet('rel', 'noopener');
    kept.push(token);
  }
  return kept;
}

/** 決策索引的一句話：表格儲存格的原文（`\|` 是字），連結以決策紀錄的位置為準。 */
function inlineCell(source: string, file: string): Cell {
  return cell(markdown.parseInline(source.replace(/\\\|/g, '|'), {})[0], baseOf(file));
}

function cell(token: Token | undefined, base: Base): Cell {
  const children = token?.children ?? [];
  const text = children.map(child => child.content).join('').trim();
  const html = markdown.renderer.renderInline(fixLinks(children, base), markdown.options, {}).trim();
  return { html, text };
}

interface Table { line: number; header: string[]; rows: Cell[][] }

/** 原始那一行有幾格：GFM 只認 `\|` 是格子裡的字，反引號裡的 | 也會切格，多出來的格會被默默丟掉，所以照原文數。 */
function cellsInLine(line: string): number {
  return line.trim().replace(/^\|/, '').replace(/(?<!\\)\|$/, '').split(/(?<!\\)\|/).length;
}

/** 每個 `##` 底下的第一張表；同名的節只取第一個。 */
function tablesByHeading(tokens: Token[], lines: readonly string[], base: Base): Map<string, Table> {
  const tables = new Map<string, Table>();
  let heading = '';
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token.type === 'heading_open' && token.tag === 'h2') heading = tokens[i + 1].content.trim();
    if (token.type !== 'table_open' || tables.has(heading)) continue;
    const table: Table = { line: (token.map?.[0] ?? 0) + 1, header: [], rows: [] };
    let row: Cell[] | null = null;
    let inHead = false;
    for (i++; tokens[i].type !== 'table_close'; i++) {
      const t = tokens[i];
      if (t.type === 'thead_open') inHead = true;
      else if (t.type === 'thead_close') inHead = false;
      else if (t.type === 'tr_open') {
        row = [];
        const at = t.map?.[0];
        if (!inHead && at !== undefined && cellsInLine(lines[at]) > table.header.length) {
          throw new RoadmapError(at + 1, `「${heading}」這一列比表頭多格：格子裡的 | 要寫成 \\|（反引號裡也是）`);
        }
      }
      else if (t.type === 'tr_close' && row) { if (!inHead) table.rows.push(row); row = null; }
      else if (t.type === 'inline' && row) {
        if (inHead) table.header.push(t.content.trim());
        else row.push(cell(t, base));
      }
    }
    tables.set(heading, table);
  }
  return tables;
}

function column(table: Table, section: string, name: string): number {
  const index = table.header.indexOf(name);
  if (index < 0) throw new RoadmapError(table.line, `「${section}」的表格少了「${name}」這一欄（現在的欄：${table.header.join('、')}）`);
  return index;
}

function need(tables: Map<string, Table>, section: string): Table {
  const table = tables.get(section);
  if (!table) throw new RoadmapError(0, `找不到「## ${section}」底下的表格`);
  return table;
}

const EMPTY: Cell = { html: '', text: '' };
/**
 * 升版的那一列：舊的手寫列寫「升正式版 `x`」；發版任務收尾的「完成」以「正式 vault 升到 `x`」開頭（docs/agents/workflow.md〈任務說明〉），
 * 只在那一格開頭或工具寫的「工作：」後面才算，句中提到計畫中的版本不算（L2 R8）。
 */
const RELEASE = /升正式版\s*`?v?(\d+\.\d+\.\d+)`?|^(?:[^：]*：)?正式 vault 升到\s*`?v?(\d+\.\d+\.\d+)`?/;
const releaseOf = (text: string) => {
  const match = RELEASE.exec(text);
  return match ? match[1] ?? match[2] : undefined;
};
/** roadmap-sync 寫的已合併列（純文字）：「工作：完成（已合併，入口）」。 */
const GENERATED_MERGED = /（已合併，入口）$/;
/** 「最近完成」「最近定案」先列幾條。 */
const RECENT = 5;

const tablesOf = (source: string, file: string) => tablesByHeading(markdown.parse(source, {}), source.split(/\r?\n/), baseOf(file));

function worksOf(tables: Map<string, Table>): Work[] {
  const now = need(tables, '現在在哪裡');
  const [name, status, next, waiting] = ['工作', '狀態', '下一步', '等誰'].map(n => column(now, '現在在哪裡', n));
  const entry = now.header.indexOf('入口');
  return now.rows.map(row => ({
    name: row[name] ?? EMPTY, status: row[status] ?? EMPTY, next: row[next] ?? EMPTY, waiting: row[waiting] ?? EMPTY,
    entry: entry >= 0 ? row[entry] ?? EMPTY : EMPTY,
  })).filter(work => work.name.text);
}

/** 最上層的入口只讀「現在在哪裡」：欄位照表頭的名稱找，欄的順序與列數怎麼變都可以。 */
export function parseTopWorks(source: string, file = ROADMAP): Work[] {
  return worksOf(tablesOf(source, file));
}

/** 讀一份完整的 roadmap（「現在在哪裡」與「已完成」）。file 是它在 repo 裡的路徑（相對連結的基準）。 */
export function parseRoadmap(source: string, file = ROADMAP): Roadmap {
  return { works: worksOf(tablesOf(source, file)), ...parseRelease(source, file), decided: [] };
}

function doneOf(table: Table): Done[] {
  const [date, work] = ['日期', '工作'].map(n => column(table, '已完成', n));
  return table.rows.map(row => ({ date: row[date]?.text ?? '', work: row[work] ?? EMPTY })).filter(d => d.work.text);
}

/** 一份 roadmap 的「已完成」；沒有這一節或底下還沒有表時是空的（最上層一開始沒有列）。 */
export function parseDone(source: string, file: string): Done[] {
  const table = tablesOf(source, file).get('已完成');
  return table ? doneOf(table) : [];
}

/** 每份 roadmap 的「已完成」合在一起：照日期新到舊，同一天照 roadmap 的順序（最上層先）與原本的順序。 */
export function mergeDone(lists: readonly Done[][]): Done[] {
  return lists.flatMap((done, file) => done.map((d, row) => ({ d, file, row })))
    .sort((a, b) => (a.d.date < b.d.date ? 1 : a.d.date > b.d.date ? -1 : a.file - b.file || a.row - b.row))
    .map(({ d }) => d);
}

/** 發布那份 roadmap 的「已完成」、正式 vault 的版本與已合併還沒發布的列。 */
export function parseRelease(source: string, file = RELEASE_ROADMAP): Omit<Roadmap, 'works' | 'decided'> {
  const done = doneOf(need(tablesOf(source, file), '已完成'));

  // 正式 vault 的版本：「正式使用的 vault 現在是 `x`（日期」與已完成裡最新一列升版，取日期較新的（同一天以那句為準）。
  const stated = /正式使用的 vault 現在是\s*`?v?(\d+\.\d+\.\d+)`?\s*[（(](\d{4}-\d{2}-\d{2})/.exec(source);
  const releaseAt = done.findIndex(d => releaseOf(d.work.text) !== undefined);
  const fromDone = releaseAt >= 0 ? { version: releaseOf(done[releaseAt].work.text)!, date: done[releaseAt].date } : null;
  const fromStated = stated ? { version: stated[1], date: stated[2] } : null;
  const vault = fromStated && fromDone ? (fromDone.date > fromStated.date ? fromDone : fromStated) : fromStated ?? fromDone;

  // 已合併、還沒發布：已完成裡比選中的那一次升版新、而且寫到合併進 main（舊的手寫列）或是工具寫的已合併列（L2 R8）。
  // 選中的是升版的列（或同一天、同一版的那句）：照列的位置切（同一天也分得出先後）；選中的是那句：用那句的日期切。
  const byRow = fromDone !== null && (vault === fromDone || (fromStated?.date === fromDone.date && fromStated.version === fromDone.version));
  const newer = byRow ? done.slice(0, releaseAt) : done.filter(d => vault && d.date > vault.date);
  const unreleased = newer.filter(d => /\bmain\b/.test(d.work.text) || GENERATED_MERGED.test(d.work.text));

  return { done, vault, unreleased };
}

/** 一份文件的狀態值（標題下第一行照新格式解析得出來時）；讀不出來是「—」。 */
function statusLabel(text: string | undefined): string {
  const lines = (text ?? '').replace(/\r\n?/g, '\n').split('\n');
  const h1 = lines.findIndex(line => /^# /.test(line));
  const line = h1 < 0 ? undefined : lines.slice(h1 + 1).find(l => l.trim());
  const parsed = line ? parseStatus(line) : undefined;
  return parsed && 'status' in parsed ? parsed.status.state : '—';
}

/**
 * 最近定案（D-214 第 6 點）：決策紀錄裡狀態是 ✅、沒被取代的最新 n 條，照日期再照編號新到舊。
 * 新寫法的決定加「現在在哪」：沿著「→」與「來自」走到的最下游（texts 是 repo 裡的 Markdown，沒給就不算）。
 */
export function recentDecisions(decisions: string, texts: ReadonlyMap<string, string> = new Map(), n = RECENT): Decided[] {
  const parsed = parseDecisions(decisions);
  const links = linksOf(parsed);
  const summaries = summariesOf(parsed);
  const day = (d: { date?: string }) => (d.date ?? '').slice(0, 10);
  return parsed.decisions
    .filter(d => d.symbol === '✅' && !links.get(d.id)!.supersededBy)
    .sort((a, b) => (day(a) < day(b) ? 1 : day(a) > day(b) ? -1 : b.num - a.num))
    .slice(0, n)
    .map(d => ({
      date: day(d), id: d.id, name: d.name, url: `${BLOB}docs/decisions.md#${encodeURIComponent(d.anchor)}`, summary: inlineCell(summaries.get(d.id) ?? '', 'docs/decisions.md'),
      now: d.legacy ? [] : downstreamOf(texts, `docs/decisions.md#${d.anchor}`).map(node => {
        const [file, anchor] = node.split('#');
        const decision = file === 'docs/decisions.md' ? parsed.decisions.find(x => x.anchor === anchor) : undefined;
        return decision
          ? { label: decision.id, url: `${BLOB}docs/decisions.md#${encodeURIComponent(anchor)}`, status: '決定' }
          : { label: file, url: `${BLOB}${file.split('/').map(encodeURIComponent).join('/')}`, status: statusLabel(texts.get(file)) };
      }),
    }));
}

/** 外掛的 roadmap 只讀「現在在哪裡」，名稱前加外掛名（「Mindboard｜」）；連結以它自己所在的資料夾為準。 */
export function parsePluginWorks(source: string, file: string): Work[] {
  const folder = PLUGIN_ROADMAP.exec(file)?.[1] ?? '';
  const prefix = folder.charAt(0).toUpperCase() + folder.slice(1) + '｜';
  return worksOf(tablesOf(source, file)).map(work => ({
    ...work, name: { html: escape(prefix) + work.name.html, text: prefix + work.name.text },
  }));
}

/** 等誰的分組：去掉開頭的「等」，空的歸「沒寫」；使用者排第一，其餘照 roadmap 出現的順序。 */
export function groupByWaiting(works: readonly Work[]): [string, Work[]][] {
  const groups = new Map<string, Work[]>();
  for (const work of works) {
    const key = work.waiting.text.replace(/^等\s*/, '').trim() || '沒寫';
    groups.set(key, [...groups.get(key) ?? [], work]);
  }
  return [...groups].sort(([a], [b]) => Number(b === '使用者') - Number(a === '使用者'));
}

/** 已完成那一句的開頭：到第一個「：」或「，」為止，最多 36 字。 */
export function headline(text: string): string {
  const cut = text.split(/[：，]/)[0];
  const chars = [...cut];
  return chars.length > 36 ? `${chars.slice(0, 35).join('')}…` : cut;
}

const label = (key: string) => key === '使用者' ? '等你' : `等${key}`;

function renderWork(work: Work): string {
  const entry = work.entry.html ? `<dt>入口</dt><dd>${work.entry.html}</dd>` : '';
  return `<details class="work"><summary><span class="wname">${escape(work.name.text)}</span></summary>
<dl><dt>下一步</dt><dd>${work.next.html || '—'}</dd><dt>狀態</dt><dd>${work.status.html || '—'}</dd>${entry}</dl></details>`;
}

function renderDone(done: Done): string {
  return `<details class="done"><summary><time>${escape(done.date.slice(5))}</time><span>${escape(headline(done.work.text))}</span></summary><p>${done.work.html}</p></details>`;
}

function renderDecided(d: Decided): string {
  const now = d.now.length ? `<br>現在在：${d.now.map(x => `<a href="${escape(x.url)}" target="_blank" rel="noopener">${escape(x.label)}</a>（${escape(x.status)}）`).join('、')}` : '';
  return `<details class="done"><summary><time>${escape(d.date.slice(5))}</time><span>${escape(`${d.id} ${d.name}`)}</span></summary><p>${d.summary.html}（<a href="${escape(d.url)}" target="_blank" rel="noopener">全文</a>）${now}</p></details>`;
}

/** generated：產生的時間；commit：GitHub Actions 的 GITHUB_SHA，本機預覽沒有；sources：讀了哪幾份 roadmap（頁尾的來源）。 */
export function renderBoard(roadmap: Roadmap, generated: string, commit?: string, sources: readonly string[] = [ROADMAP]): string {
  const groups = groupByWaiting(roadmap.works);
  const chips = groups.map(([key, works], i) => `<a class="chip${key === '使用者' ? ' you' : ''}" href="#g${i}">${escape(label(key))}<b>${works.length}</b></a>`).join('');
  const sections = groups.map(([key, works], i) => `<section class="group${key === '使用者' ? ' you' : ''}" id="g${i}"><h2>${escape(label(key))}<span class="n">${works.length}</span></h2>${works.map(renderWork).join('')}</section>`).join('\n');
  const vault = roadmap.vault
    ? `<div class="fact"><span class="k">正式 vault</span><span class="v"><code>${escape(roadmap.vault.version)}</code></span><span class="d">${escape(roadmap.vault.date)} 裝好</span></div>`
    : `<div class="fact"><span class="k">正式 vault</span><span class="v">—</span><span class="d">roadmap 沒寫版本</span></div>`;
  const pending = `<div class="fact"><span class="k">已合併、還沒發布</span><span class="v">${roadmap.unreleased.length}</span><span class="d">下一版會帶上</span></div>`;
  const unreleased = roadmap.unreleased.length
    ? `<section class="list" id="unreleased"><h2>已合併、還沒發布<span class="n">${roadmap.unreleased.length}</span></h2>${roadmap.unreleased.map(renderDone).join('')}</section>`
    : '';
  const recent = roadmap.done.slice(0, RECENT).map(renderDone).join('');
  const older = roadmap.done.slice(RECENT);
  const more = older.length ? `<details class="more"><summary>再早的 ${older.length} 列</summary>${older.map(renderDone).join('')}</details>` : '';
  // 最近定案和最近完成分兩塊（D-214 第 6 點）：決定不列進〈已完成〉。
  const decided = roadmap.decided.length ? `<section class="list" id="decided"><h2>最近定案</h2>${roadmap.decided.map(renderDecided).join('')}</section>` : '';
  const source = commit ? ` · <a href="${REPO}/commit/${escape(commit)}" target="_blank" rel="noopener">${escape(commit.slice(0, 7))}</a>` : '';
  const from = sources.map(file => `<a href="${baseOf(file).page}" target="_blank" rel="noopener">${escape(file)}</a>`).join('、');
  return `<!doctype html>
<html lang="zh-Hant">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="robots" content="noindex">
<title>Essence 進度白板</title>
<style>${CSS}</style>
</head>
<body>
<header class="top">
<h1>Essence 進度</h1>
<p class="sub">${escape(generated)} 從 roadmap 產生</p>
<div class="facts">${vault}${pending}</div>
<nav class="chips" aria-label="卡在誰">${chips}</nav>
</header>
<main>
${sections}
${unreleased}
<section class="list" id="done"><h2>最近完成</h2>${recent}${more}</section>
${decided}
</main>
<footer>來源：${from}${source} · <a href="${PROGRESS_MAP}">功能地圖</a></footer>
</body>
</html>
`;
}

// 白板不能帶出本機路徑與個人信箱：roadmap 寫進來了就停下，不產生。
const PRIVATE: [RegExp, string][] = [
  [/[A-Za-z]:[\\/](?:Users|程式開發)/, '本機路徑'],
  [/\/(?:Users|home)\/[^/\s"<]+/, '本機路徑'],
  [/[\w.+-]+@(?!users\.noreply\.github\.com)[\w-]+\.[\w.-]+/, '電子郵件'],
];

export function findPrivate(html: string): string | null {
  for (const [pattern, kind] of PRIVATE) {
    const hit = pattern.exec(html);
    if (hit) return `${kind}「${hit[0]}」`;
  }
  return null;
}

const CSS = `${TOKENS}
:root{--you:#c2603a;--you-bg:#fbe9e1;--accent:#3d7a5a}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--you:#e8916c;--you-bg:#3b2620;--accent:#7cbf8e;color-scheme:dark}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.65 -apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans TC","PingFang TC",sans-serif;-webkit-text-size-adjust:100%}
.top,main,footer{max-width:720px;margin:0 auto;padding-left:max(16px,env(safe-area-inset-left,0px));padding-right:max(16px,env(safe-area-inset-right,0px))}
.top{padding-block:24px 8px}
h1{margin:0;font-size:22px;letter-spacing:.02em;text-wrap:balance}
.sub{margin:2px 0 14px;color:var(--muted);font-size:13px}
a{color:var(--accent)}
code{font:13px/1 ui-monospace,SFMono-Regular,Consolas,monospace;background:var(--done-bg);padding:1px 5px;border-radius:4px}
.facts{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.fact{background:var(--card);border-radius:12px;padding:10px 12px;box-shadow:var(--shadow);display:grid;min-width:0}
.fact .k{font-size:12px;color:var(--muted)}
.fact .v{font-size:22px;font-weight:700;font-variant-numeric:tabular-nums;line-height:1.3}
.fact .v code{font-size:20px;background:none;padding:0}
.fact .d{font-size:12px;color:var(--muted)}
.chips{display:flex;flex-wrap:wrap;gap:6px;margin-top:14px}
.chip{display:inline-flex;align-items:center;gap:6px;font-size:13px;text-decoration:none;color:var(--ink);background:var(--card);border:1px solid var(--line);border-radius:999px;padding:3px 10px}
.chip b{font-weight:600;color:var(--muted);font-variant-numeric:tabular-nums}
.chip.you{background:var(--you-bg);border-color:var(--you);color:var(--you);font-weight:600}.chip.you b{color:var(--you)}
main{display:grid;gap:22px;padding-block:14px 28px}
section{display:grid;gap:8px;min-width:0;scroll-margin-top:12px}
h2{margin:0;font-size:15px;display:flex;align-items:center;gap:8px;color:var(--muted);font-weight:600;letter-spacing:.04em}
.group.you h2{color:var(--you)}
.n{font-size:12px;font-weight:600;background:var(--line);color:var(--ink);border-radius:999px;padding:0 8px;font-variant-numeric:tabular-nums}
.group.you .n{background:var(--you);color:var(--card)}
details.work{background:var(--card);border-radius:12px;box-shadow:var(--shadow);min-width:0}
.group.you details.work{box-shadow:inset 3px 0 0 var(--you),var(--shadow)}
summary{list-style:none;cursor:pointer;display:flex;align-items:baseline;gap:10px;padding:11px 14px;border-radius:12px}
summary::-webkit-details-marker{display:none}
summary::after{content:"";margin-left:auto;flex:none;width:7px;height:7px;border-right:1.6px solid var(--muted);border-bottom:1.6px solid var(--muted);transform:translateY(-2px) rotate(45deg);transition:transform .15s}
details[open]>summary::after{transform:translateY(2px) rotate(-135deg)}
summary:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.wname{font-weight:600;min-width:0}
dl{margin:0;padding:0 14px 12px;display:grid;grid-template-columns:auto 1fr;gap:6px 12px;font-size:14px}
dt{color:var(--muted);font-size:12px;padding-top:3px;white-space:nowrap}
dd{margin:0;min-width:0;overflow-wrap:anywhere}
.list{background:var(--card);border-radius:12px;box-shadow:var(--shadow);padding:12px 4px 6px;gap:0}
.list h2{padding:0 10px 6px}
details.done{border-top:1px solid var(--line)}
details.done summary{padding:8px 10px;font-size:14px}
details.done time{color:var(--muted);font-size:12px;font-variant-numeric:tabular-nums;flex:none}
details.done summary span{min-width:0}
details.done p{margin:0;padding:0 10px 10px 50px;font-size:13.5px;overflow-wrap:anywhere}
details.more>summary{font-size:13px;color:var(--muted);padding:8px 10px;border-top:1px solid var(--line)}
footer{padding-block:0 32px;font-size:12px;color:var(--muted)}
@media (prefers-reduced-motion:reduce){summary::after{transition:none}}
@media (max-width:330px){.facts{grid-template-columns:1fr}}
`;

/** 最上層與存在的外掛 roadmap，最上層排第一；staged 時清單與內容都讀暫存區。 */
function readRoadmaps(root: string, staged: boolean): { file: string; text: string }[] {
  const wanted = (file: string) => file === ROADMAP || PLUGIN_ROADMAP.test(file);
  let files: string[];
  let read: (file: string) => string;
  if (staged) {
    files = execFileSync('git', ['-c', 'core.quotepath=false', 'ls-files', '-z'], { cwd: root, encoding: 'utf8', maxBuffer: 1 << 28 }).split('\0').filter(wanted);
    read = file => execFileSync('git', ['show', `:${file}`], { cwd: root, encoding: 'utf8', maxBuffer: 1 << 28 });
  } else {
    const plugins = existsSync(join(root, 'plugins')) ? readdirSync(join(root, 'plugins')).map(name => `plugins/${name}/docs/roadmap.md`) : [];
    files = [ROADMAP, ...plugins].filter(file => wanted(file) && existsSync(join(root, file)));
    read = file => readFileSync(join(root, file), 'utf8');
  }
  return [...new Set(files)].sort((a, b) => Number(b === ROADMAP) - Number(a === ROADMAP) || (a < b ? -1 : a > b ? 1 : 0))
    .map(file => ({ file, text: read(file) }));
}

function main(): void {
  const args = process.argv.slice(2);
  const at = args.indexOf('--out');
  const rootAt = args.indexOf('--root');
  const root = rootAt >= 0 ? resolve(args[rootAt + 1]) : resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const check = args.includes('--check');
  const staged = args.includes('--staged');
  const roadmaps = readRoadmaps(root, staged);
  if (roadmaps[0]?.file !== ROADMAP) {
    console.error(`${ROADMAP}  找不到這份檔`);
    process.exit(1);
  }
  if (!roadmaps.some(r => r.file === RELEASE_ROADMAP)) {
    console.error(`${RELEASE_ROADMAP}  找不到這份檔（正式 vault 的版本與「已完成」從這裡讀）`);
    process.exit(1);
  }
  let release: Omit<Roadmap, 'works' | 'decided'> | undefined;
  const works: Work[] = [];
  const doneLists: Done[][] = [];
  let failed = false;
  for (const { file, text } of roadmaps) {
    try {
      if (file === ROADMAP) works.push(...parseTopWorks(text, file));
      else works.push(...parsePluginWorks(text, file));
      doneLists.push(parseDone(text, file));
      if (file === RELEASE_ROADMAP) release = parseRelease(text, file);
    } catch (error) {
      if (!(error instanceof RoadmapError)) throw error;
      console.error(`${file}${error.line ? `:${error.line}` : ''}  ${error.message}`);
      failed = true;
    }
  }
  // 最近定案：決策紀錄與 repo 裡的 Markdown（現在在哪）；不是 Git repo 或沒有決策紀錄時沒有這一塊。
  let decided: Decided[] = [];
  const texts = markdownTexts(root, staged);
  const decisions = texts.get('docs/decisions.md');
  if (decisions) {
    try {
      decided = recentDecisions(decisions, texts);
    } catch (error) {
      if (!(error instanceof DecisionsError)) throw error;
      console.error(`docs/decisions.md  ${error.message}`);
      failed = true;
    }
  }
  if (failed || !release) process.exit(1);
  const files = roadmaps.map(r => r.file);
  const roadmap: Roadmap = { ...release, done: mergeDone(doneLists), works, decided };
  const generated = new Intl.DateTimeFormat('zh-TW', { timeZone: 'Asia/Taipei', dateStyle: 'medium', timeStyle: 'short', hourCycle: 'h23' }).format(new Date());
  const html = renderBoard(roadmap, generated, process.env.GITHUB_SHA, files);
  // --check 也查：會帶出私人資訊時 Pages 一樣產生不了，commit 就擋。
  const leak = findPrivate(html);
  if (leak) {
    console.error(`${files.join('、')}  白板會帶出${leak}，先從 roadmap 拿掉再產生`);
    process.exit(1);
  }
  if (check) {
    console.log(`進度白板讀得出來：${files.join('、')}`);
    return;
  }
  const out = resolve(root, at >= 0 ? args[at + 1] : `_site/${BOARD_FILE}`);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, html);
  console.log(`進度白板：${out}（進行中 ${roadmap.works.length} 件、已合併還沒發布 ${roadmap.unreleased.length} 列、正式 vault ${roadmap.vault?.version ?? '沒寫'}）`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main();
