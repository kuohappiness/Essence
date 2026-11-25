// 分派表（D-208 第 5 點，docs/tasks/one-repo-step-1.md §2；第二步 §A3 加共用工具、§B3 改登錄表與第 9 條）：照這次改到的路徑決定 commit 與 CI 檢查哪些對象。
// hook 與 CI 只讀這一份。
// 用法：
//   node tools/dispatch.ts --staged [--ci] [--explain]               暫存區（pre-commit）
//   node tools/dispatch.ts --range <base> <head> [--ci] [--explain]  比兩棵樹（CI、pre-merge-commit、〈第一批的紀錄〉）
//   --ci：CI 的跑法，「相關測試」升成「完整」。--explain：逐個路徑印出命中哪一條（給人看），不印 JSON。
// 輸出 JSON。不用 npm 套件：CI 的分派 job 與 hook 不必先安裝就能跑。
// 結束碼：0 正常；1 有擋下的路徑（子模組）；2 Git 讀取失敗或參數錯（不能當成「沒有改動」）。
import { execFileSync } from 'node:child_process';
import { posix, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { APPS_ROOT, DOCS_ONLY, FOLDERS, PACKAGES, PACKAGES_ROOT } from './apps.ts';

export const APPS = ['cards', 'capture', 'mindboard'] as const;
export type App = (typeof APPS)[number];
/** 套件（tools/apps.ts 的 PACKAGES，docs/tasks/ai-client.md〈8〉）。 */
export type Package = keyof typeof PACKAGES;
const PACKAGE_IDS = Object.keys(PACKAGES) as Package[];
/** 分派的對象：共用工具（tools/ 自己的完整檢查，§A2）、三個外掛與套件。 */
export const TARGETS = ['tools', ...APPS, ...PACKAGE_IDS] as const;
export type Target = 'tools' | App | Package;
/** 完整：在對象的資料夾跑完整檢查；相關測試（Cards 與共用工具）：只跑寫到這些路徑的測試檔；跳過。 */
export type Run = 'full' | 'related' | 'skip';
export const NAMES: Record<Target, string> = { tools: '共用工具', cards: 'Cards', capture: 'Capture', mindboard: 'Mindboard', 'ai-client': 'AI 連線套件' };
const isPackage = (target: Target): target is Package => Object.hasOwn(PACKAGES, target);

/** Cards 的資料夾（D-208 第二步 §A6 搬進來）。 */
export const CARDS: string = FOLDERS.cards;
/** 對象的資料夾（相對 repo 的根）：外掛與套件查 tools/apps.ts 的表，不用代號組字串（D-218 第 4 點）。 */
export const folder = (target: Target): string => (target === 'tools' ? 'tools' : isPackage(target) ? PACKAGES[target] : FOLDERS[target]);
/** 對象資料夾底下的路徑前綴；根目錄是空字串。 */
const prefix = (target: Target) => (folder(target) === '.' ? '' : folder(target) + '/');

/** 一個改動：Git 的 raw diff 一行（--no-renames，改名是刪舊加新兩筆）。 */
export interface Change { status: string; path: string; oldMode: string; newMode: string }

type Effect = 'blocked' | 'all' | Partial<Record<Target, Run>>;
/** 比對時用的背景：檢查的入口（第 6 條），用到時才算。 */
interface Context { entries: () => Set<string> }
interface Rule { id: number; name: string; matches: (path: string, change: Change, ctx: Context) => boolean; effect: (path: string) => Effect }

const lower = (path: string) => path.toLowerCase();
const under = (...dirs: string[]) => (path: string) => dirs.some(dir => path.startsWith(dir));

/**
 * 決定別的檢查怎麼啟動、怎麼跑的檔（第 6 條的固定部分）。檢查的入口（hook、check.yml、外掛 scripts 寫到的 tools/ 檔與它們
 * import 到的檔）由 entryTools 從這次比較的內容算，不手寫清單。
 */
const LAUNCH = new Set(['tools/package.json', '.gitattributes', '.gitignore']);
const LAUNCH_DIRS = ['.githooks/', '.github/workflows/'];
/** 一定算入口的三支：分派表本身、hook 與 CI 呼叫的程式。 */
const CORE_ENTRIES = ['tools/dispatch.ts', 'tools/hooks.ts', 'tools/ci-gate.ts'];
/** 其他共用工具（第 7 條）：tools/ 底下其他的檔，加上下面這些。 */
const SHARED_TOOL_FILES = new Set(['.claude/settings.json', 'experiments/tools/decisions-index.mjs', '.secretlintrc.json']);

/**
 * 共用規格的登錄表（第 8 條）：兩個以上外掛都讀的最上層檔案；外掛的測試要讀最上層的檔，也登錄在這裡，不靠搜尋字串。
 * 共用工具另外加相關測試（例如 tools/tests/ 讀真的 docs/transcript.md 時）。
 */
export const SHARED_SPECS: Record<string, Partial<Record<App, Run>>> = {
  // 轉錄稿格式：Capture 寫、Cards 讀（D-208 第 6 點；第二步 B 從 syntax.md §1 搬出來）。
  'docs/transcript.md': { cards: 'related', capture: 'full' },
};

export const RULES: Rule[] = [
  { id: 1, name: '子模組（gitlink）', matches: (_, c) => c.oldMode === '160000' || c.newMode === '160000', effect: () => 'blocked' },
  {
    // Cards 只改文件時照舊只跑相關測試（技術債「外掛只改文件也跑完整檢查」對 Cards 的完成條件，§A3）。
    id: 2, name: 'Cards 資料夾裡的文件',
    matches: path => path.startsWith(prefix('cards')) && (lower(path).endsWith('.md') || path.startsWith(prefix('cards') + 'docs/')),
    effect: () => ({ cards: 'related' }),
  },
  { id: 3, name: 'Cards 資料夾裡其他的檔', matches: path => path.startsWith(prefix('cards')), effect: () => ({ cards: 'full' }) },
  {
    // 只有文件的軟體（現在是 Portal，D-218）只跑共用檢查；寫第一行程式時移進 FOLDERS、加自己的檢查。
    // 套件（docs/tasks/ai-client.md〈8〉）和 Capture 一樣，改到什麼都跑它自己的完整檢查。
    id: 4, name: 'Capture、Mindboard、套件與只有文件的軟體的資料夾',
    matches: under(prefix('capture'), prefix('mindboard'), ...PACKAGE_IDS.map(prefix), ...Object.values(DOCS_ONLY).map(dir => dir + '/')),
    effect: path => {
      if (path.startsWith(prefix('capture'))) return { capture: 'full' };
      if (path.startsWith(prefix('mindboard'))) return { mindboard: 'full' };
      const owner = PACKAGE_IDS.find(id => path.startsWith(prefix(id)));
      return owner ? { [owner]: 'full' } : {};
    },
  },
  { id: 5, name: 'apps/、packages/ 底下不認得的路徑', matches: under(APPS_ROOT, PACKAGES_ROOT), effect: () => 'all' },
  {
    id: 6, name: '檢查怎麼啟動、怎麼跑（入口）', effect: () => 'all',
    matches: (path, _, ctx) => LAUNCH.has(path) || under(...LAUNCH_DIRS)(path) || (path.startsWith('tools/') && ctx.entries().has(path)),
  },
  {
    id: 7, name: '其他共用工具', effect: () => ({ tools: 'full' }),
    matches: path => under('tools/', '.claude/hooks/')(path) || SHARED_TOOL_FILES.has(path),
  },
  {
    id: 8, name: '共用規格（登錄表）', matches: path => Object.hasOwn(SHARED_SPECS, path),
    effect: path => ({ ...SHARED_SPECS[path], tools: 'related' }),
  },
  {
    // 任務與討論稿在 docs/ 底下（D-213）：規劃文件的 commit 不跑完整檢查。舊位置的 tasks/、Claude Codex Discussion/ 落第 10 條，文件檢查也擋。
    id: 9, name: '最上層的文件、任務、討論稿、試作場與 skill', effect: () => ({ cards: 'related', tools: 'related' }),
    matches: path => under('docs/', 'experiments/', '.claude/', '.agents/')(path)
      || (!path.includes('/') && lower(path).endsWith('.md')),
  },
  { id: 10, name: '以上都不是', matches: () => true, effect: () => 'all' },
];

export interface PathResult { status: string; path: string; rule: number; ruleName: string }
export interface TargetResult { run: Run; tests: string[]; why: string }
export interface Dispatch {
  compare: { kind: 'staged' } | { kind: 'range'; base: string; head: string };
  ci: boolean;
  shared: true;
  blocked: string[];
  targets: Record<Target, TargetResult>;
  paths: PathResult[];
}

const RANK: Record<Run, number> = { skip: 0, related: 1, full: 2 };

const git = (root: string, args: string[], input?: string) =>
  execFileSync('git', args, { cwd: root, input, maxBuffer: 1 << 28, stdio: ['pipe', 'pipe', 'pipe'] });

/**
 * 這次比較的內容裡，路徑合 wanted 的一般檔與內容（L2 R2）：staged 讀索引（hook 的環境裡就是這次 commit 用的索引，
 * git commit <路徑>、-a 的暫時索引也是），range 讀 head 的樹。不讀工作樹：沒 stage 的修改與新檔不影響分派。
 */
function comparedTexts(root: string, compare: Dispatch['compare'], wanted: (path: string) => boolean): Map<string, string> {
  // ls-files -s：「<mode> <物件> <stage>\t<路徑>」；ls-tree：「<mode> <型別> <物件>\t<路徑>」。
  const [args, column] = compare.kind === 'staged' ? [['ls-files', '-s', '-z'], 1] : [['ls-tree', '-r', '-z', '--full-tree', compare.head], 2];
  const objects = new Map<string, string>();
  for (const entry of git(root, args).toString('utf8').split('\0').filter(Boolean)) {
    const tab = entry.indexOf('\t');
    const meta = entry.slice(0, tab).split(' ');
    const path = entry.slice(tab + 1);
    if ((meta[0] === '100644' || meta[0] === '100755') && wanted(path) && !objects.has(path)) objects.set(path, meta[column]);
  }
  const texts = new Map<string, string>();
  if (!objects.size) return texts;
  const out = git(root, ['cat-file', '--batch'], [...objects.values()].join('\n') + '\n');
  let at = 0;
  for (const path of objects.keys()) {
    const end = out.indexOf(0x0a, at);
    const size = Number(out.subarray(at, end).toString('latin1').split(' ')[2]);
    texts.set(path, out.subarray(end + 1, end + 1 + size).toString('utf8'));
    at = end + 1 + size + 1;
  }
  return texts;
}

/**
 * 一個檔的相對相依（import、export … from、import '…'、動態 import、require(…)），寧可多算（第二步 L2 第三輪 R9，D-200 第 2 點換前提）：
 * 不判斷是不是在字串、註解或正規表示式裡，關鍵字後面接相對路徑的字面值就算。多算的路徑不存在就不會出現在改動裡，存在就多跑檢查；
 * 少算才會漏跑（R3、第二輪、第三輪都是判斷字串時漏的）。dispatch 不用 npm 套件，所以用正規式；
 * tools/tests/dispatch.test.ts 用 TypeScript 的語法樹另外算，斷言這裡涵蓋它找到的每一個。
 */
export function relativeImports(text: string): string[] {
  const found = new Set<string>();
  const pattern = /(?<![\w$.])(?:(?:import|require)\s*\(\s*(['"`])(\.{1,2}\/[^'"`\n]+?)\1|import\s*(['"])(\.{1,2}\/[^'"\n]+?)\3|from\s*(['"])(\.{1,2}\/[^'"\n]+?)\5)/g;
  for (const match of text.matchAll(pattern)) found.add(match[2] ?? match[4] ?? match[6]);
  return [...found];
}

/**
 * 文字裡寫到的 tools/… 程式檔（前面可以有 ../），照 base 資料夾解開成 repo 相對的路徑；解開後不在最上層 tools/ 的不算。
 * 只認程式（.ts、.mts、.cts、.mjs、.cjs、.js）：check.yml 的快取寫到 tools/package-lock.json，鎖檔是第 7 條。
 *
 * 兩種一起算，寧可多算（L2 ai-client 第二輪 延續 R3，比照 relativeImports 換前提）：
 * 1. known（repo 裡現有的 tools/ 程式檔，加上這次改動的路徑：刪掉、改名的檔不在比較的樹裡，L2 ai-client 第三輪 延續 R3）：
 *    文字裡出現那個路徑就算，不管怎麼加引號或跳脫（先拿掉反斜線再找一次）。
 *    不解析 shell 的引號：第一輪、第二輪都是正規式在引號裡的特殊字元停下來漏算的。多算只會多跑檢查。
 * 2. 正規式：給 known 裡沒有的（這次刪掉或還沒加的檔）。引號括住的整段算檔名，沒有引號的到空白或 shell 的符號為止。
 */
const QUOTED_TOOL = /(["'])((?:\.\.\/)*tools\/[^\n"']*?\.(?:ts|mts|cts|mjs|cjs|js))\1/gu;
const BARE_TOOL = /(?<![\p{L}\p{N}_.\/-])((?:\.\.\/)*tools\/[^\s"'`;&|<>()]*?\.(?:ts|mts|cts|mjs|cjs|js))(?![\p{L}\p{N}_.\/-])/gu;

export function toolPaths(text: string, base: string | undefined, known: Iterable<string> = []): string[] {
  const found = new Set<string>();
  const unescaped = text.replace(/\\(.)/gsu, '$1');
  for (const path of known) if (path.startsWith('tools/') && (text.includes(path) || unescaped.includes(path))) found.add(path);
  const names = [...[...text.matchAll(QUOTED_TOOL)].map(m => m[2]), ...[...text.matchAll(BARE_TOOL)].map(m => m[1])];
  for (const name of names) {
    // base 是 undefined：執行的資料夾不固定但都在 repo 裡（check.yml 的 job 可以設 working-directory），開頭的 ../ 一律回到 repo 的根。
    const path = base === undefined ? posix.normalize(name.replace(/^(\.\.\/)+/, '')) : posix.normalize(posix.join(base, name));
    if (path.startsWith('tools/') && !path.startsWith('tools/node_modules/')) found.add(path);
  }
  return [...found];
}

/**
 * 檢查的入口（第 6 條，§A3）：.githooks/ 的 hook（從 repo 的根執行）、.github/workflows/check.yml（外掛 job 的資料夾在
 * repo 底下，寫成 ../../tools/… 也解得開）與 apps/*\/package.json、packages/*\/package.json 的 scripts（從外掛或套件的資料夾執行）字面寫到的 tools/ 檔，
 * 加上 CORE_ENTRIES，再加上這些檔 import 到的 tools/ 檔（一路往下）。只被 Pages 或共用檢查本身用到的工具不算入口。
 */
export function entryTools(root: string, compare: Dispatch['compare'], changed: readonly string[] = []): Set<string> {
  const isSource = (path: string) => /^tools\/[^]*\.(ts|mts|cts|mjs|cjs|js)$/.test(path) && !path.startsWith('tools/node_modules/');
  const texts = comparedTexts(root, compare, path =>
    path.startsWith('.githooks/') || path === '.github/workflows/check.yml' || /^(?:apps|packages)\/[^/]+\/package\.json$/.test(path) || isSource(path));
  const entries = new Set<string>(CORE_ENTRIES);
  const known = [...new Set([...texts.keys(), ...changed])].filter(isSource);
  for (const [path, text] of texts) {
    if (path.startsWith('.githooks/')) for (const tool of toolPaths(text, '.', known)) entries.add(tool);
    else if (path === '.github/workflows/check.yml') for (const tool of toolPaths(text, undefined, known)) entries.add(tool);
    else if (path.endsWith('package.json')) {
      let scripts: Record<string, unknown> = {};
      try { scripts = (JSON.parse(text) as { scripts?: Record<string, unknown> }).scripts ?? {}; } catch { /* 壞掉的 package.json 由外掛的檢查擋 */ }
      for (const script of Object.values(scripts)) if (typeof script === 'string') for (const tool of toolPaths(script, posix.dirname(path), known)) entries.add(tool);
    }
  }
  const queue = [...entries];
  while (queue.length) {
    const file = queue.pop()!;
    const text = texts.get(file);
    if (text === undefined) continue;
    for (const name of relativeImports(text)) {
      for (const target of nodeCandidates(posix.normalize(posix.join(posix.dirname(file), name)))) {
        if (target.startsWith('tools/') && !entries.has(target)) {
          entries.add(target);
          queue.push(target);
        }
      }
    }
  }
  return entries;
}

/**
 * require 的路徑 Node 可能載入的檔（L2 第二輪）：寫的路徑本身，加上 CommonJS 依序補的副檔名與資料夾的 index。
 * 不知道 Node 會停在哪一個，全部算入口：不存在的路徑不會出現在改動裡，多算只會多跑檢查。資料夾 package.json 的 main 不算。
 * 先去掉結尾的斜線再組合（L2 第三輪 R10：posix.normalize 留著 './worker/' 的斜線，原本拼成 tools/worker//index.js，和 Git 的路徑對不上）。
 */
function nodeCandidates(target: string): string[] {
  const path = target.replace(/\/+$/, '');
  return [path, ...['.js', '.json', '.node'].map(extension => path + extension), ...['index.js', 'index.json', 'index.node'].map(name => posix.join(path, name))];
}

/** 嵌進 main.js 的規則檔表（ai-rules 的特例）。 */
const rulesFile = () => prefix('cards') + 'src/core/ai/rules.ts';

/**
 * 寫到這些路徑的測試檔（target 是 Cards 或共用工具）：照原本 pre-commit 的 grep -rlF --include='*.test.ts'。
 * - 每個改到的路徑比兩種寫法：原路徑，與去掉 Cards 資料夾前綴的路徑（Cards 的測試從自己的資料夾寫路徑）；
 * - 對象 tests/helpers/ 底下的檔寫到時，import 那個 helper 的測試也選（一層）；
 * - Cards 另有規則檔表的特例：rules.ts 寫到的規則檔，改哪一份都跑 ai-rules 的測試（第二次里程碑檢查 R8）。
 * 讀這次比較的內容（comparedTexts），和 hook 在副本裡跑的是同一份。回傳相對對象資料夾的路徑（交給 node --test）。
 */
export function relatedTests(root: string, compare: Dispatch['compare'], target: 'cards' | 'tools', paths: string[]): string[] {
  if (!paths.length) return [];
  const base = prefix(target);
  const tests = base + 'tests/';
  const helpers = tests + 'helpers/';
  const cards = prefix('cards');
  const variants = [...new Set(paths.flatMap(path => (cards && path.startsWith(cards) ? [path, path.slice(cards.length)] : [path])))];
  const mentions = (text: string) => variants.some(path => text.includes(path));
  const texts = comparedTexts(root, compare, path => (path.startsWith(tests) && path.endsWith('.ts')) || (target === 'cards' && path === rulesFile()));
  const found = new Set<string>();
  const usedHelpers = new Set<string>();
  for (const [file, text] of texts) if (file.startsWith(helpers) && !file.endsWith('.test.ts') && mentions(text)) usedHelpers.add(file);
  for (const [file, text] of texts) {
    if (file === rulesFile()) {
      if (variants.some(path => text.includes(`'${path}'`))) found.add(tests + 'ai-rules.test.ts');
      continue;
    }
    if (!file.endsWith('.test.ts')) continue;
    if (mentions(text)) found.add(file);
    else if (usedHelpers.size && relativeImports(text).some(name => usedHelpers.has(posix.normalize(posix.join(posix.dirname(file), name))))) found.add(file);
  }
  return [...found].map(file => file.slice(base.length)).sort();
}

/** 顯示用：控制字元與換行跳脫，其餘照原樣。 */
export const shown = (path: string) => path.replace(/[\u0000-\u001f\u007f\\]/g, ch => JSON.stringify(ch).slice(1, -1));

function list(paths: string[], max = 3): string {
  const head = paths.slice(0, max).map(shown).join('、');
  return paths.length > max ? `${head} 等 ${paths.length} 個` : head;
}

export function dispatch(changes: Change[], { root, ci, compare }: { root: string; ci: boolean; compare: Dispatch['compare'] }): Dispatch {
  const runs = Object.fromEntries(TARGETS.map(target => [target, 'skip'])) as Record<Target, Run>;
  const touched = Object.fromEntries(TARGETS.map(target => [target, []])) as unknown as Record<Target, string[]>;
  const related: Record<'cards' | 'tools', string[]> = { cards: [], tools: [] };
  const blocked: string[] = [];
  const paths: PathResult[] = [];
  let entries: Set<string> | undefined;
  const ctx: Context = { entries: () => (entries ??= entryTools(root, compare, changes.map(change => change.path))) };
  for (const change of changes) {
    const rule = RULES.find(r => r.matches(change.path, change, ctx))!;
    paths.push({ status: change.status, path: change.path, rule: rule.id, ruleName: rule.name });
    const effect = rule.effect(change.path);
    if (effect === 'blocked') { blocked.push(change.path); continue; }
    const wanted: Partial<Record<Target, Run>> = effect === 'all' ? Object.fromEntries(TARGETS.map(target => [target, 'full'])) : effect;
    for (const target of TARGETS) {
      let run = wanted[target];
      if (!run) continue;
      // CI 不花 token：相關測試一律升成完整（保留 b63c1bb 只改文件也紅燈的後盾）。
      if (ci && run === 'related') run = 'full';
      touched[target].push(change.path);
      if (run === 'related' && (target === 'cards' || target === 'tools')) related[target].push(change.path);
      if (RANK[run] > RANK[runs[target]]) runs[target] = run;
    }
  }
  const targets = {} as Record<Target, TargetResult>;
  for (const target of TARGETS) {
    let run = runs[target];
    let tests: string[] = [];
    let why: string;
    if (run === 'full') why = `完整檢查（改到 ${list(touched[target])}）`;
    else if (run === 'related' && (target === 'cards' || target === 'tools')) {
      tests = relatedTests(root, compare, target, related[target]);
      if (tests.length) why = `相關測試（寫到 ${list(related[target])} 的 ${tests.length} 個測試檔）`;
      else {
        run = 'skip';
        why = `照分派表跳過（沒有測試寫到 ${list(related[target])}）`;
      }
    } else why = changes.length ? `照分派表跳過（這次改的路徑都不是它的：${list(changes.map(c => c.path))}）` : '照分派表跳過（沒有改動）';
    targets[target] = { run, tests, why };
  }
  return { compare, ci, shared: true, blocked, targets, paths };
}

/** 解析 git diff --raw -z --no-renames：每筆是「:舊mode 新mode 舊物件 新物件 狀態」，接著一個 NUL 與路徑。 */
export function parseRaw(output: string): Change[] {
  const parts = output.split('\0');
  const changes: Change[] = [];
  for (let i = 0; i + 1 < parts.length; i += 2) {
    const meta = parts[i];
    if (!meta.startsWith(':')) throw new Error(`看不懂 git diff 的輸出：${shown(meta)}`);
    const [oldMode, newMode, , , status] = meta.slice(1).split(' ');
    changes.push({ status, path: parts[i + 1], oldMode, newMode });
  }
  return changes;
}

/** 讀改動。不加 --diff-filter（刪檔、改名的舊路徑、型別變更都要算）；-z 拿原本的路徑，不受 core.quotepath 影響；子模組一律顯示。 */
export function readChanges(root: string, compare: Dispatch['compare']): Change[] {
  const base = ['-c', 'core.quotepath=false', 'diff', '--raw', '-z', '--no-renames', '--no-ext-diff', '--ignore-submodules=none'];
  let args: string[];
  if (compare.kind === 'range') args = [...base, compare.base, compare.head, '--'];
  else {
    // 第一個 commit 還沒有 HEAD：和空的樹比。
    let hasHead = true;
    try { execFileSync('git', ['rev-parse', '--verify', '--quiet', 'HEAD'], { cwd: root, stdio: 'ignore' }); } catch { hasHead = false; }
    const empty = hasHead ? [] : [execFileSync('git', ['hash-object', '-t', 'tree', '--stdin'], { cwd: root, input: '', encoding: 'utf8' }).trim()];
    args = [...base, '--cached', ...empty, '--'];
  }
  return parseRaw(execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 1 << 28, stdio: ['ignore', 'pipe', 'pipe'] }));
}

export function explain(result: Dispatch): string {
  const lines = result.paths.map(p => `${p.status}  ${shown(p.path)}  → 第 ${p.rule} 條（${p.ruleName}）`);
  const compare = result.compare.kind === 'range' ? `${result.compare.base}..${result.compare.head}` : '暫存區';
  lines.push(`比較：${compare}${result.ci ? '（CI 的跑法）' : ''}`);
  if (result.blocked.length) lines.push(`擋下：${list(result.blocked)}（這個 repo 不支援子模組）`);
  lines.push('共用檢查：每次都跑');
  for (const target of TARGETS) lines.push(`${NAMES[target]}：${result.targets[target].why}`);
  return lines.join('\n');
}

export function main(args: string[], cwd = process.cwd()): number {
  const ci = args.includes('--ci');
  const at = args.indexOf('--range');
  let compare: Dispatch['compare'];
  if (at >= 0) {
    const [base, head] = [args[at + 1], args[at + 2]];
    if (!base || !head || base.startsWith('--') || head.startsWith('--')) {
      console.error('用法：node tools/dispatch.ts --range <base> <head> [--ci] [--explain]');
      return 2;
    }
    compare = { kind: 'range', base, head };
  } else if (args.includes('--staged')) compare = { kind: 'staged' };
  else {
    console.error('用法：node tools/dispatch.ts --staged | --range <base> <head> [--ci] [--explain]');
    return 2;
  }
  let result: Dispatch;
  try {
    const root = execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
    // 相關測試與入口也讀 Git（這次比較的內容），讀不到一樣不能當成沒有改動。
    result = dispatch(readChanges(root, compare), { root, ci, compare });
  } catch (error) {
    const stderr = (error as { stderr?: Buffer | string }).stderr?.toString().trim();
    console.error(`分派表讀不到 Git 的改動，不能當成沒有改動：${stderr || (error as Error).message}`);
    return 2;
  }
  console.log(args.includes('--explain') ? explain(result) : JSON.stringify(result, null, 2));
  if (result.blocked.length) {
    console.error(`擋下：${list(result.blocked)} 是子模組（gitlink），這個 repo 不支援子模組。`);
    return 1;
  }
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) process.exitCode = main(process.argv.slice(2));
