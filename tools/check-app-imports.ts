// 軟體之間不 import（D-208 第 10 點，tasks/one-repo-step-1.md §6；D-218 起資料夾是 apps/<軟體>/）：各自安裝、各自可用（D-006），
// 程式不跨出自己的資料夾。
// 用法：node tools/check-app-imports.ts [--staged]
//   預設：Git 追蹤的檔，內容讀工作樹（npm run check 與 CI 用）。--staged：清單與內容都讀暫存區（pre-commit 用）。
// 擋：apps/<軟體>/ 的程式用相對路徑跑出自己的資料夾；根目錄 src/、tests/、tools/ 的程式用相對路徑進到 apps/；
//     apps/<軟體>/ 追蹤的 symlink 指到軟體外；apps/<軟體>/package.json 的本機相依（file:、link:、沒有協定的路徑等）
//     不是軟體裡只用英數與 . _ - / 的相對路徑。資料夾名從追蹤的路徑整段抓（D-218 §3 第 3 點），不用代號重組。
// 路徑用 TypeScript 的 preProcessFile 取字面值：註解與字串裡的不算，import、export … from、require、import()、
// import x = require() 與沒有代換的模板字面值都取得到；import('../../src/' + name) 取到字面的前段，照前段判斷（偏嚴）。
// 套件名稱、node:、網址照常。執行時才組出來的路徑、tsconfig 的 paths、打包工具的 alias 這裡看不到（backlog〈已知的限制〉）。
// 也擋（D-218 §3 第 1～3 點）：apps/ 底下不在 tools/apps.ts 表上或大小寫不符的資料夾、plugins/ 與 Apps/ 這類第一段、表上只有文件的軟體
//     出現程式；追蹤的文字檔裡大小寫不符的 apps/<軟體>、Markdown 以外寫死的 plugins/<軟體>、程式與 workflow 裡
//     （表所在的檔除外）用字串組資料夾（紀錄除外；例外表上的檔只放行列上的規則）。
// 有問題時每個一行「檔案:行  目標  原因」，結束碼 1。
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join, posix, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
import { APPS_ROOT, DOCS_ONLY, FOLDERS } from './apps.ts';

export interface Problem { file: string; line: number; target: string; reason: string }
interface Entry { path: string; mode: string; object: string }

const SOURCE = /\.(?:ts|tsx|mts|cts|js|jsx|mjs|cjs)$/i;
/** 軟體的資料夾（第 1 組是整段，例如 apps/Cards）。 */
const PLUGIN = /^(apps\/[^/]+)\//;
const PACKAGE = /^(apps\/[^/]+)\/package\.json$/;
const ROOT_CODE = /^(?:src|tests|tools)\//;
const DEPENDENCY_FIELDS = ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies'];

const isRelative = (spec: string) => spec === '.' || spec === '..' || spec.startsWith('./') || spec.startsWith('../');
const inside = (path: string, dir: string) => path === dir || path.startsWith(dir + '/');
/** 從 from 那個檔所在的資料夾解開相對路徑；跑出 repo 的回傳以 ../ 開頭的路徑。 */
const resolveFrom = (from: string, spec: string) => posix.normalize(posix.join(posix.dirname(from), spec.replaceAll('\\', '/'))).replace(/\/+$/, '');

function lineOf(text: string, pos: number): number {
  let line = 1;
  for (let i = 0; i < pos && i < text.length; i++) if (text.charCodeAt(i) === 10) line++;
  return line;
}

/** 一個程式檔的問題。path 是 repo 裡的路徑（/ 分隔）。 */
export function checkSource(path: string, text: string): Problem[] {
  const plugin = PLUGIN.exec(path)?.[1];
  const rootCode = !plugin && ROOT_CODE.test(path);
  if (!plugin && !rootCode) return [];
  const problems: Problem[] = [];
  const { importedFiles } = ts.preProcessFile(text, true, true);
  for (const { fileName, pos } of importedFiles) {
    if (!isRelative(fileName)) continue;
    const target = resolveFrom(path, fileName);
    if (plugin && !inside(target, plugin)) {
      problems.push({ file: path, line: lineOf(text, pos), target: fileName, reason: `跑出 ${plugin}/：軟體不 import 其他軟體與最上層的程式（D-208 第 10 點）` });
    } else if (rootCode && target.startsWith(APPS_ROOT)) {
      problems.push({ file: path, line: lineOf(text, pos), target: fileName, reason: `根目錄的程式不 import ${APPS_ROOT} 裡的軟體（D-208 第 10 點）` });
    }
  }
  return problems;
}

/** 外掛裡的 symlink 指到外掛外（target 是連結的內容）。 */
export function checkLink(path: string, target: string): Problem[] {
  const plugin = PLUGIN.exec(path)?.[1];
  if (!plugin) return [];
  const absolute = /^(?:[a-z]:)?[\\/]/i.test(target);
  if (!absolute && inside(resolveFrom(path, target), plugin)) return [];
  return [{ file: path, line: 1, target, reason: `symlink 指到 ${plugin}/ 外（D-208 第 10 點）` }];
}

/**
 * npm 當成本機路徑的相依寫法（npm-package-arg 的 isFileSpec 與 fromFile）：file:、link:、git+file:（大小寫不分），或沒有協定、
 * 以 . ~/ / \ 或磁碟代號開頭、含反斜線、# 前有兩個以上 / 的（只有一個 / 是 GitHub 的簡寫）。回傳路徑的部分，不是本機路徑回傳 undefined。
 */
function localPath(spec: string): string | undefined {
  const prefixed = /^(?:file|link|git\+file):(.*)$/is.exec(spec);
  if (prefixed) return prefixed[1];
  if (/^[a-z][a-z0-9+.-]+:/i.test(spec)) return undefined; // 其他協定：npm:、github:、https: 等
  const slashes = spec.split('#')[0].split('/').length - 1;
  return /^(?:\.|~[/\\]|[/\\]|[a-z]:)/i.test(spec) || spec.includes('\\') || slashes >= 2 ? spec : undefined;
}

/**
 * 本機路徑只接受白名單（L2 R6）：只用英數與 . _ - /、不以 / 開頭、正規化後在外掛裡。npm 會把 ~/ 展開成家目錄、Windows 上
 * 反斜線也是分隔；百分比編碼與 FILE: 這類寫法怎麼解，隨 npm 的版本與平台不同（npm 11.6.2 在 Windows 當成字面的資料夾名）。
 * 這裡不跟著 npm 的解析走，白名單以外的一律不收。
 */
const LOCAL_PATH = /^[A-Za-z0-9._/-]+$/;

/** 外掛 package.json 的本機相依（file:、link: 等）不是外掛裡的相對路徑。 */
export function checkPackage(path: string, text: string): Problem[] {
  const plugin = PACKAGE.exec(path)?.[1];
  if (!plugin) return [];
  let pkg: Record<string, unknown>;
  try {
    pkg = JSON.parse(text) as Record<string, unknown>;
  } catch {
    return [{ file: path, line: 1, target: 'package.json', reason: '不是合法的 JSON，看不出相依指到哪裡' }];
  }
  const problems: Problem[] = [];
  const lines = text.split('\n');
  for (const field of DEPENDENCY_FIELDS) {
    const deps = pkg[field];
    if (!deps || typeof deps !== 'object') continue;
    for (const [name, value] of Object.entries(deps as Record<string, unknown>)) {
      if (typeof value !== 'string') continue;
      const local = localPath(value);
      if (local === undefined) continue;
      const allowed = LOCAL_PATH.test(local) && !local.startsWith('/');
      if (allowed && inside(posix.normalize(posix.join(plugin, local)).replace(/\/+$/, ''), plugin)) continue;
      const line = lines.findIndex(l => l.includes(JSON.stringify(name))) + 1 || 1;
      const reason = allowed ? `${field} 的 ${name} 指到 ${plugin}/ 外（D-208 第 10 點）`
        : `${field} 的 ${name} 是本機路徑，只接受軟體裡只用英數與 . _ - / 的相對路徑（npm 會把 ~/ 展開成家目錄、反斜線當成分隔，D-208 第 10 點）`;
      problems.push({ file: path, line, target: value, reason });
    }
  }
  return problems;
}

// ---- 資料夾的表與大小寫（D-218 §3 第 1～3 點） ----

/** 表上每個軟體的資料夾名（apps/ 後面那一段）：有程式的與只有文件的。 */
const NAMES = new Map<string, { name: string; docsOnly: boolean }>([
  ...Object.values(FOLDERS).map(dir => [dir.slice(APPS_ROOT.length).toLowerCase(), { name: dir.slice(APPS_ROOT.length), docsOnly: false }] as const),
  ...Object.values(DOCS_ONLY).map(dir => [dir.slice(APPS_ROOT.length).toLowerCase(), { name: dir.slice(APPS_ROOT.length), docsOnly: true }] as const),
]);
/** 只有文件的軟體可以有的檔。 */
const DOC_FILE = /\.(?:md|png|jpe?g|gif|svg|webp)$/i;
const TWO_STEP = (from: string, to: string) => `Windows 上分兩步改：git mv ${from} ${to}.tmp，再 git mv ${to}.tmp ${to}；Linux 上正確的資料夾已經存在時，逐檔 git mv 到正確的路徑（目的資料夾不存在就先建）`;

/**
 * 追蹤的路徑（§3 第 1、2 點）：第一段不分大小寫是 plugins 或 apps、卻不是恰好 apps 的擋；apps/ 底下的資料夾要在表上、大小寫相同；
 * 表上只有文件的軟體只能有 Markdown 與圖檔。同一個資料夾的問題只報第一個檔。
 */
export function checkLayout(paths: Iterable<string>): Problem[] {
  const problems: Problem[] = [];
  const seen = new Set<string>();
  const once = (key: string, problem: Problem) => { if (!seen.has(key)) { seen.add(key); problems.push(problem); } };
  const root = APPS_ROOT.slice(0, -1);
  for (const path of paths) {
    const [first, second, ...rest] = path.split('/');
    const lower = first.toLowerCase();
    if (lower === 'plugins') once(first, { file: path, line: 1, target: first + '/', reason: `改名後放 ${APPS_ROOT}<軟體>/（D-218）` });
    else if (lower === root && first !== root) once(first, { file: path, line: 1, target: first + '/', reason: `資料夾要恰好是 ${APPS_ROOT}（D-218 §3 第 2 點）；${TWO_STEP(first, root)}` });
    if (lower !== root || first !== root) continue;
    const entry = rest.length ? NAMES.get(second.toLowerCase()) : undefined;
    const dir = `${root}/${second}`;
    if (!entry) once(dir, { file: path, line: 1, target: rest.length ? dir + '/' : path, reason: `不在表上：${APPS_ROOT} 底下的軟體要先登記在 tools/apps.ts（D-218 §3 第 1 點）` });
    else if (entry.name !== second) once(dir, { file: path, line: 1, target: dir + '/', reason: `大小寫和表上的 ${root}/${entry.name} 不同（D-218 §3 第 1 點）；${TWO_STEP(dir, `${root}/${entry.name}`)}` });
    else if (entry.docsOnly && !DOC_FILE.test(path)) {
      once(dir + ':code', { file: path, line: 1, target: path, reason: `${dir} 在 tools/apps.ts 標「只有文件」，只能有 Markdown 與圖檔；寫第一行程式的任務把它移進 FOLDERS、加自己的檢查與 CI job（D-218 §3 第 1 點、D-208 第 5 點）` });
    }
  }
  return problems;
}

/** 紀錄（§3 第 3 點）：決定、任務、討論稿、archive 的寫法是當時的事實，不查。 */
const RECORD = /^(?:apps\/[^/]+\/)?docs\/(?:tasks|Claude Codex Discussion|archive)\//;
export const isRecord = (path: string) => path === 'docs/decisions.md' || RECORD.test(path);

/** 比對前的正規化：正規式的跳脫 \. 當成 .，\/、\\、\ 都當成 /。換行不動：在正規化後的文字上數行號，和原文相同。 */
export const normalize = (text: string) => text.replace(/\\\./g, '.').replace(/\\\\|\\\//g, '/').replace(/\\/g, '/');

function lineAt(text: string, index: number): number {
  let line = 1;
  for (let i = text.indexOf('\n'); i !== -1 && i < index; i = text.indexOf('\n', i + 1)) line++;
  return line;
}

/** 表所在的檔：只有它可以用字串組資料夾。 */
const TABLE_FILE = 'tools/apps.ts';
/** 組字串那條只查程式與設定（L2 R4）：文件與資料檔裡加引號的 "apps" 是敘述或鍵名，不是在組路徑。 */
const CODE_FILE = /\.(?:[cm]?[jt]sx?|ya?ml)$|^\.githooks\//i;

/** 三條規則（例外表逐列寫放行哪幾條，L2 R3）。 */
export type TextRule = '大小寫' | 'plugins' | '組字串';
export interface TextProblem extends Problem { rule: TextRule }

/**
 * 一個追蹤的文字檔裡寫死的路徑（§3 第 3 點）：apps/<表上的名稱> 大小寫不符、Markdown 以外寫死 plugins/<軟體> 或 plugins\/、
 * 表所在的檔以外的程式與設定用字串組資料夾。
 */
export function checkText(path: string, text: string): TextProblem[] {
  const problems: TextProblem[] = [];
  const flat = normalize(text);
  // 行號：正規化後的比對在 flat 上數，原文的比對在原文上數（L2 R1）。
  const add = (rule: TextRule, on: string, index: number, target: string, reason: string) => problems.push({ file: path, line: lineAt(on, index), target, reason, rule });
  const names = [...NAMES.keys()].join('|');
  for (const m of flat.matchAll(new RegExp(`(?<![\\w-])(apps)/(${names})(?![\\w-])`, 'gi'))) {
    const entry = NAMES.get(m[2].toLowerCase())!;
    if (m[1] !== 'apps' || m[2] !== entry.name) add('大小寫', flat, m.index, m[0], `大小寫要和表上的 apps/${entry.name} 相同（Linux 分大小寫，D-218 §3 第 3 點）`);
  }
  if (!path.toLowerCase().endsWith('.md')) {
    for (const m of flat.matchAll(/(?<![\w-])plugins\/(?:cards|capture|mindboard)(?![\w-])/gi)) add('plugins', flat, m.index, m[0], `改名後是 ${APPS_ROOT}<軟體>（D-218）`);
    for (const m of text.matchAll(/(?<!obsidian\\\/)(?<![\w-])plugins\\\/(?!essence-)/gi)) {
      add('plugins', text, m.index, m[0], `改名後是 ${APPS_ROOT}（D-218）；vault 裡的外掛資料夾從 .obsidian\\/plugins\\/ 寫起或接外掛 ID（essence-…）才放行`);
    }
  }
  if (path !== TABLE_FILE && CODE_FILE.test(path)) {
    // 引號後可以先有任意個 ./、../、/；apps/${ 不必緊貼反引號，但前面要是界線；不分大小寫（L2 R5、第二輪 S1、S4）。
    for (const m of flat.matchAll(/[`'"](?:\.{0,2}\/)*apps\/?[`'"]|(?<![\w-])apps\/\$\{/gi)) add('組字串', flat, m.index, m[0], `用字串組資料夾：從代號找資料夾改成查 ${TABLE_FILE}，從路徑抓的整段抓前綴（D-218 §3 第 3 點）`);
  }
  return problems;
}

/**
 * 例外表（§3 第 3 點）：逐檔列出，每列寫放行哪幾條規則與理由。表上的檔照樣跑 checkText，只放行列出的規則；
 * 檔不在了、或列出的規則已經沒有命中就報錯。
 */
export const EXCEPTIONS: { file: string; kind: '歷史路徑' | '故意寫錯的樣本' | '檢查本身'; allow: TextRule[]; reason: string }[] = [
  { file: 'apps/Cards/tools/git.ts', kind: '歷史路徑', allow: ['plugins'], reason: 'MANIFESTS 要認得改名前的外掛根（plugins/cards），跨版本的工具讀舊版用（D-218〈代價〉）' },
  { file: 'apps/Cards/tests/plugin-root.test.ts', kind: '歷史路徑', allow: ['plugins', '大小寫'], reason: '跨版本找外掛根的測試：舊版在 plugins/cards，另有大小寫打錯的樣本' },
  { file: 'apps/Cards/tests/compare-versions.test.ts', kind: '歷史路徑', allow: ['plugins'], reason: '發布前比較跨過第二步的搬家：新版在 plugins/cards 的情境' },
  { file: 'apps/Cards/tests/ai-add-old-version.test.ts', kind: '歷史路徑', allow: ['plugins'], reason: '註解寫第二步搬進 plugins/cards 之後為什麼從 repo 的根 clone' },
  { file: 'apps/Cards/tests/pick-old-version.test.ts', kind: '歷史路徑', allow: ['plugins'], reason: '註解寫第二步搬進 plugins/cards 之後為什麼從 repo 的根 clone' },
  { file: 'apps/Cards/tests/build.test.ts', kind: '歷史路徑', allow: ['plugins'], reason: '註解寫第二步 L2 R5（搬家後 Cards 在 plugins/cards）' },
  { file: 'apps/Cards/tests/helpers/layout.ts', kind: '歷史路徑', allow: ['plugins'], reason: '註解寫搬家前後 Cards 的位置' },
  { file: 'experiments/tools/move-links.mjs', kind: '歷史路徑', allow: ['plugins'], reason: '第二步搬家用的改連結腳本，範例是 plugins/cards' },
  { file: 'experiments/tools/move-links.test.mjs', kind: '歷史路徑', allow: ['plugins'], reason: '改連結腳本的測試，樣本是第二步的 plugins/cards' },
  { file: 'tools/tests/app-imports.test.ts', kind: '故意寫錯的樣本', allow: ['大小寫', 'plugins', '組字串'], reason: '這條防線自己的測試（驗收第 7、17 項的 plugins/cards/a.ts 與大小寫打錯的樣本）' },
  { file: 'tools/tests/check-docs.test.ts', kind: '故意寫錯的樣本', allow: ['大小寫'], reason: 'check-docs 的測試，Markdown 樣本連到打錯大小寫的軟體資料夾（驗收第 8 項）' },
  { file: 'tools/check-app-imports.ts', kind: '檢查本身', allow: ['plugins', '組字串'], reason: '要寫出 plugins\\/、plugins/(cards|capture|mindboard) 與組字串的 pattern' },
];

/** 追蹤的文字檔全部掃一次，套用紀錄與例外表。texts 是 path → 內容（讀不到或二進位的不在裡面）。 */
export function checkPaths(texts: Map<string, string>): Problem[] {
  const problems: Problem[] = [];
  const excepted = new Map(EXCEPTIONS.map(e => [e.file, e]));
  for (const [path, text] of texts) {
    if (isRecord(path)) continue;
    const found = checkText(path, text);
    const e = excepted.get(path);
    if (!e) { problems.push(...found); continue; }
    // 只放行這一列寫的規則，其他規則照擋；放行的規則一條都沒命中，例外就過期了（L2 R3）。
    problems.push(...found.filter(p => !e.allow.includes(p.rule)));
    for (const rule of e.allow) {
      if (!found.some(p => p.rule === rule)) problems.push({ file: path, line: 1, target: 'EXCEPTIONS', reason: `例外表（${e.kind}）放行的「${rule}」這個檔已經用不到，請從 tools/check-app-imports.ts 的例外表拿掉（整列都用不到就刪掉這一列）` });
    }
  }
  // 檔不在了只在有表的 repo 查（測試的暫存 repo 沒有這些檔）。
  if (texts.has(TABLE_FILE)) for (const e of EXCEPTIONS) {
    if (!texts.has(e.file)) problems.push({ file: e.file, line: 1, target: 'EXCEPTIONS', reason: `例外表（${e.kind}）上的檔不在了，請從 tools/check-app-imports.ts 的例外表刪掉這一列` });
  }
  return problems;
}

function git(root: string, args: string[], input?: string): Buffer {
  return execFileSync('git', ['-c', 'core.quotepath=false', ...args], { cwd: root, input, maxBuffer: 1 << 30, stdio: ['pipe', 'pipe', 'pipe'] });
}

/** 追蹤的檔：mode、物件與路徑（git ls-files -s；--staged 時就是暫存區）。 */
function entries(root: string): Entry[] {
  const seen = new Map<string, Entry>();
  for (const line of git(root, ['ls-files', '-s', '-z']).toString('utf8').split('\0').filter(Boolean)) {
    const tab = line.indexOf('\t');
    const [mode, object] = line.slice(0, tab).split(' ');
    const path = line.slice(tab + 1);
    if (!seen.has(path)) seen.set(path, { path, mode, object });
  }
  return [...seen.values()];
}

/** 一次讀好幾個物件的內容（git cat-file --batch）。 */
function blobs(root: string, objects: string[]): Buffer[] {
  if (!objects.length) return [];
  const out = git(root, ['cat-file', '--batch'], objects.join('\n') + '\n');
  const result: Buffer[] = [];
  let at = 0;
  for (let i = 0; i < objects.length; i++) {
    const end = out.indexOf(10, at);
    const size = Number(out.subarray(at, end).toString('latin1').split(' ')[2]);
    result.push(out.subarray(end + 1, end + 1 + size));
    at = end + 1 + size + 1;
  }
  return result;
}

export function checkPluginImports(root: string, { staged = false }: { staged?: boolean } = {}): Problem[] {
  const all = entries(root).filter(e => !e.path.split('/').includes('node_modules'));
  const links = all.filter(e => e.mode === '120000');
  const files = all.filter(e => e.mode !== '120000' && e.mode !== '160000' && (SOURCE.test(e.path) || PACKAGE.test(e.path)))
    .filter(e => PLUGIN.test(e.path) || ROOT_CODE.test(e.path));
  const problems: Problem[] = [];
  // symlink 的內容一律讀索引裡的物件：Windows 沒開 symlink 時工作樹是一般檔。
  const linkTargets = blobs(root, links.filter(e => PLUGIN.test(e.path)).map(e => e.object));
  links.filter(e => PLUGIN.test(e.path)).forEach((e, i) => problems.push(...checkLink(e.path, linkTargets[i].toString('utf8'))));
  const texts = staged ? blobs(root, files.map(e => e.object)).map(b => b.toString('utf8'))
    : files.map(e => (existsSync(join(root, e.path)) ? readFileSync(join(root, e.path), 'utf8') : ''));
  files.forEach((e, i) => problems.push(...(e.path.endsWith('package.json') ? checkPackage(e.path, texts[i]) : checkSource(e.path, texts[i]))));
  // 資料夾的表與大小寫（D-218 §3 第 1～3 點）：路徑看全部追蹤的（含 symlink），內容看一般檔，含 NUL 的當二進位不看。
  problems.push(...checkLayout(all.map(e => e.path)));
  const regular = all.filter(e => e.mode !== '120000' && e.mode !== '160000');
  const raw = staged ? blobs(root, regular.map(e => e.object))
    : regular.map(e => (existsSync(join(root, e.path)) ? readFileSync(join(root, e.path)) : undefined));
  const contents = new Map<string, string>();
  regular.forEach((e, i) => { const b = raw[i]; if (b && !b.includes(0)) contents.set(e.path, b.toString('utf8')); });
  problems.push(...checkPaths(contents));
  return problems.sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : a.line - b.line));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const root = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
  const staged = process.argv.includes('--staged');
  const problems = checkPluginImports(root, { staged });
  if (problems.length) {
    console.error(`軟體之間的 import 與 apps/ 的資料夾有 ${problems.length} 個問題（${staged ? '暫存區' : '工作樹'}，D-208 第 10 點、D-218）：`);
    for (const p of problems) console.error(`${p.file}:${p.line}  ${p.target}  ${p.reason}`);
    process.exitCode = 1;
  } else console.log(`軟體之間沒有互相 import，apps/ 的資料夾與寫死的路徑都對得上表（${staged ? '暫存區' : '工作樹'}）`);
}
