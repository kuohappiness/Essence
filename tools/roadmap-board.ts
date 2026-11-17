// 開發進度白板：把 docs/roadmap.md 的「現在在哪裡」與「已完成」換成手機好讀的一頁（D-141：roadmap 是唯一來源，這頁只換樣子顯示）。
// main 上的 roadmap 一改，GitHub Actions（.github/workflows/progress-board.yml）就產生並發布到 GitHub Pages：https://kuohappiness.github.io/Essence-Cards/roadmap.html
// 本機預覽：node tools/roadmap-board.ts（要先在 tools/ 裝過相依），輸出 _site/roadmap.html（_site/ 在 .gitignore）；--out <檔案> 改輸出位置。
// 找不到需要的節或欄時印出「行號  原因」並以 exit code 1 結束；表格內容怎麼改都照樣產生。
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import MarkdownIt, { type Token } from 'markdown-it';
import { LIST_PAGE as PROGRESS_MAP, TOKENS, escape } from './progress-board-data.ts';

export const ROADMAP = 'docs/roadmap.md';
const REPO = 'https://github.com/kuohappiness/Essence-Cards';
const DOCS_URL = `${REPO}/blob/main/docs/`;
/** 發布在 GitHub Pages 同一站（https://kuohappiness.github.io/Essence-Cards/）的檔名。 */
export const BOARD_FILE = 'roadmap.html';
const ROADMAP_URL = `${DOCS_URL}roadmap.md`;

/** html 是轉好的行內 HTML（連結改成 GitHub 網址）；text 是純文字，分組與摘要用。 */
export interface Cell { html: string; text: string }
export interface Work { name: Cell; status: Cell; next: Cell; waiting: Cell; entry: Cell }
export interface Done { date: string; work: Cell }
export interface Vault { version: string; date: string }
export interface Roadmap { works: Work[]; done: Done[]; vault: Vault | null; unreleased: Done[] }

export class RoadmapError extends Error {
  readonly line: number;
  constructor(line: number, reason: string) { super(reason); this.line = line; }
}

const markdown = new MarkdownIt({ html: false, linkify: false });

/** 相對連結以 docs/ 為基準改成 GitHub 上 main 的網址；roadmap 內的錨點接到 roadmap 的網址；http(s) 不動；其他（file:、本機路徑）拿掉連結只留文字。 */
function fixLinks(tokens: Token[]): Token[] {
  const kept: Token[] = [];
  let dropped = 0;
  for (const token of tokens) {
    if (token.type === 'link_close' && dropped) { dropped--; continue; }
    if (token.type !== 'link_open') { kept.push(token); continue; }
    const href = token.attrGet('href') ?? '';
    let url: string | null = null;
    if (/^https?:\/\//i.test(href)) url = href;
    else if (href.startsWith('#')) url = ROADMAP_URL + href;
    else if (!/^[a-z][a-z0-9+.-]*:|^[/\\]/i.test(href)) url = new URL(href, DOCS_URL).href;
    if (!url) { dropped++; continue; }
    token.attrSet('href', url);
    token.attrSet('target', '_blank');
    token.attrSet('rel', 'noopener');
    kept.push(token);
  }
  return kept;
}

function cell(token: Token | undefined): Cell {
  const children = token?.children ?? [];
  const text = children.map(child => child.content).join('').trim();
  const html = markdown.renderer.renderInline(fixLinks(children), markdown.options, {}).trim();
  return { html, text };
}

interface Table { line: number; header: string[]; rows: Cell[][] }

/** 原始那一行有幾格：GFM 只認 `\|` 是格子裡的字，反引號裡的 | 也會切格，多出來的格會被默默丟掉，所以照原文數。 */
function cellsInLine(line: string): number {
  return line.trim().replace(/^\|/, '').replace(/(?<!\\)\|$/, '').split(/(?<!\\)\|/).length;
}

/** 每個 `##` 底下的第一張表；同名的節只取第一個。 */
function tablesByHeading(tokens: Token[], lines: readonly string[]): Map<string, Table> {
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
        else row.push(cell(t));
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
const RELEASE = /升正式版\s*`?v?(\d+\.\d+\.\d+)`?/;

/** 讀 roadmap：欄位照表頭的名稱找，欄的順序與列數怎麼變都可以。 */
export function parseRoadmap(source: string): Roadmap {
  const tables = tablesByHeading(markdown.parse(source, {}), source.split(/\r?\n/));
  const now = need(tables, '現在在哪裡');
  const [name, status, next, waiting] = ['工作', '狀態', '下一步', '等誰'].map(n => column(now, '現在在哪裡', n));
  const entry = now.header.indexOf('入口');
  const works = now.rows.map(row => ({
    name: row[name] ?? EMPTY, status: row[status] ?? EMPTY, next: row[next] ?? EMPTY, waiting: row[waiting] ?? EMPTY,
    entry: entry >= 0 ? row[entry] ?? EMPTY : EMPTY,
  })).filter(work => work.name.text);

  const finished = need(tables, '已完成');
  const [date, work] = ['日期', '工作'].map(n => column(finished, '已完成', n));
  const done = finished.rows.map(row => ({ date: row[date]?.text ?? '', work: row[work] ?? EMPTY })).filter(d => d.work.text);

  // 正式 vault 的版本：先找「正式使用的 vault 現在是 `x`（日期」，沒有就用已完成裡最新一列「升正式版 `x`」。
  const stated = /正式使用的 vault 現在是\s*`?v?(\d+\.\d+\.\d+)`?\s*[（(](\d{4}-\d{2}-\d{2})/.exec(source);
  const releaseAt = done.findIndex(d => RELEASE.test(d.work.text));
  const fromDone = releaseAt >= 0 ? { version: RELEASE.exec(done[releaseAt].work.text)![1], date: done[releaseAt].date } : null;
  const vault = stated ? { version: stated[1], date: stated[2] } : fromDone;

  // 已合併、還沒發布：已完成裡比最新一次升版新、而且寫到合併進 main 的列。找不到升版的列時，用版本的日期切。
  const newer = releaseAt >= 0 ? done.slice(0, releaseAt) : done.filter(d => vault && d.date > vault.date);
  const unreleased = newer.filter(d => /\bmain\b/.test(d.work.text));

  return { works, done, vault, unreleased };
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

const RECENT = 5;

/** generated：產生的時間；commit：GitHub Actions 的 GITHUB_SHA，本機預覽沒有。 */
export function renderBoard(roadmap: Roadmap, generated: string, commit?: string): string {
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
  const source = commit ? ` · <a href="${REPO}/commit/${escape(commit)}" target="_blank" rel="noopener">${escape(commit.slice(0, 7))}</a>` : '';
  return `<!doctype html>
<html lang="zh-Hant">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="robots" content="noindex">
<title>Essence Cards 進度白板</title>
<style>${CSS}</style>
</head>
<body>
<header class="top">
<h1>Essence Cards 進度</h1>
<p class="sub">${escape(generated)} 從 roadmap 產生</p>
<div class="facts">${vault}${pending}</div>
<nav class="chips" aria-label="卡在誰">${chips}</nav>
</header>
<main>
${sections}
${unreleased}
<section class="list" id="done"><h2>最近完成</h2>${recent}${more}</section>
</main>
<footer>來源：<a href="${ROADMAP_URL}" target="_blank" rel="noopener">docs/roadmap.md</a>${source} · <a href="${PROGRESS_MAP}">功能地圖</a></footer>
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

function main(): void {
  const args = process.argv.slice(2);
  const at = args.indexOf('--out');
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const out = resolve(root, at >= 0 ? args[at + 1] : `_site/${BOARD_FILE}`);
  let roadmap: Roadmap;
  try {
    roadmap = parseRoadmap(readFileSync(resolve(root, ROADMAP), 'utf8'));
  } catch (error) {
    if (!(error instanceof RoadmapError)) throw error;
    console.error(`${ROADMAP}${error.line ? `:${error.line}` : ''}  ${error.message}`);
    process.exit(1);
  }
  const generated = new Intl.DateTimeFormat('zh-TW', { timeZone: 'Asia/Taipei', dateStyle: 'medium', timeStyle: 'short', hourCycle: 'h23' }).format(new Date());
  const html = renderBoard(roadmap, generated, process.env.GITHUB_SHA);
  const leak = findPrivate(html);
  if (leak) {
    console.error(`${ROADMAP}  白板會帶出${leak}，先從 roadmap 拿掉再產生`);
    process.exit(1);
  }
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, html);
  console.log(`進度白板：${out}（進行中 ${roadmap.works.length} 件、已合併還沒發布 ${roadmap.unreleased.length} 列、正式 vault ${roadmap.vault?.version ?? '沒寫'}）`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main();
