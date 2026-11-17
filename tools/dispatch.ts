// 分派表（D-208 第 5 點，tasks/one-repo-step-1.md §2）：照這次改到的路徑決定 commit 與 CI 檢查哪些外掛。hook 與 CI 只讀這一份。
// 用法：
//   node tools/dispatch.ts --staged [--ci] [--explain]               暫存區（pre-commit）
//   node tools/dispatch.ts --range <base> <head> [--ci] [--explain]  比兩棵樹（CI、pre-merge-commit、〈第一批的紀錄〉）
//   --ci：CI 的跑法，Cards 的「相關測試」升成「完整」。--explain：逐個路徑印出命中哪一條（給人看），不印 JSON。
// 輸出 JSON。不用 npm 套件：CI 的分派 job 與 hook 不必先安裝就能跑。
// 結束碼：0 正常；1 有擋下的路徑（子模組）；2 Git 讀取失敗或參數錯（不能當成「沒有改動」）。
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const PLUGINS = ['cards', 'capture', 'mindboard'] as const;
export type Plugin = (typeof PLUGINS)[number];
/** 完整：在外掛的資料夾跑 npm run check；相關測試（只有 Cards）：只跑寫到這些路徑的測試檔；跳過。 */
export type Run = 'full' | 'related' | 'skip';
export const NAMES: Record<Plugin, string> = { cards: 'Cards', capture: 'Capture', mindboard: 'Mindboard' };

/** 一個改動：Git 的 raw diff 一行（--no-renames，改名是刪舊加新兩筆）。 */
export interface Change { status: string; path: string; oldMode: string; newMode: string }

type Effect = 'blocked' | 'all' | Partial<Record<Plugin, Run>>;
interface Rule { id: number; name: string; matches: (path: string, change: Change) => boolean; effect: (path: string) => Effect }

const lower = (path: string) => path.toLowerCase();
const under = (...dirs: string[]) => (path: string) => dirs.some(dir => path.startsWith(dir));

/** §1 列的共用工具（第 4 條）。tools/ 裡兩邊都沒列的新檔落到第 8 條，三個外掛都檢查。 */
const SHARED_TOOL = /^tools\/(check-docs\.ts|secretlint\.mjs|check-local-paths\.ts|check-skill-mirror\.ts|progress-board[^/]*\.ts|roadmap-board\.ts|dispatch\.ts|hooks\.ts|ci-gate\.ts|check-plugin-imports\.ts)$/;
const SHARED_INPUT = new Set(['experiments/tools/decisions-index.mjs', 'tools/package.json', 'tools/package-lock.json', '.secretlintrc.json', '.gitattributes', '.gitignore']);
/** §1 列的 Cards 工具（第 6 條）。 */
const CARDS_TOOL = /^tools\/(build\.mjs|build\.d\.mts|install[^/]*|backup\.ts|restore\.ts|compare[^/]*|update-vault\.ts|locate\.ts|vault-io\.ts|node-files\.ts|git\.ts|exam-reminder\.ts|bench-study\.ts|export-compare\.ts|knip\.mjs)$|^tools\/compare\//;
const CARDS_CONFIG = new Set(['manifest.json', 'package.json', 'package-lock.json', 'tsconfig.json', 'eslint.config.js', 'knip.jsonc']);
/**
 * 共用規格的登錄表（第 5 條）：兩個以上外掛都讀的最上層檔案。第二步前新增的這類規格在這裡加一列；
 * 外掛的測試要讀最上層的檔，也登錄在這裡，不靠搜尋字串。
 */
export const SHARED_SPECS: Record<string, Partial<Record<Plugin, Run>>> = {
  // 過渡期轉錄稿格式在 §1：Capture 寫、Cards 讀（D-208 第 6 點）。
  'docs/syntax.md': { cards: 'related', capture: 'full' },
};

export const RULES: Rule[] = [
  { id: 1, name: '子模組（gitlink）', matches: (_, c) => c.oldMode === '160000' || c.newMode === '160000', effect: () => 'blocked' },
  {
    id: 2, name: '外掛的資料夾', matches: under('plugins/capture/', 'plugins/mindboard/'),
    effect: path => ({ [path.startsWith('plugins/capture/') ? 'capture' : 'mindboard']: 'full' }),
  },
  { id: 3, name: 'plugins/ 底下不認得的路徑', matches: under('plugins/'), effect: () => 'all' },
  {
    id: 4, name: '共用的輸入', effect: () => 'all',
    matches: path => SHARED_TOOL.test(path) || SHARED_INPUT.has(path) || path.startsWith('.githooks/') || path.startsWith('.github/workflows/'),
  },
  { id: 5, name: '共用規格（登錄表）', matches: path => Object.hasOwn(SHARED_SPECS, path), effect: path => SHARED_SPECS[path] },
  {
    id: 6, name: 'Cards 的程式與設定', effect: () => ({ cards: 'full' }),
    matches: path => under('src/', 'tests/')(path) || CARDS_TOOL.test(path) || CARDS_CONFIG.has(path),
  },
  {
    // tasks/、Claude Codex Discussion/ 是最上層（過渡期 Cards 與跨外掛）的任務說明與討論稿；任務說明 §2 的表漏列，
    // 不列會落到第 8 條，每次規劃文件的 commit 都跑三個外掛的完整檢查（〈結果〉）。
    id: 7, name: '文件、任務、討論稿、試作場與 skill', effect: () => ({ cards: 'related' }),
    matches: path => under('docs/', 'tasks/', 'Claude Codex Discussion/', 'experiments/', '.claude/', '.agents/')(path)
      || (!path.includes('/') && lower(path).endsWith('.md')),
  },
  { id: 8, name: '以上都不是', matches: () => true, effect: () => 'all' },
];

export interface PathResult { status: string; path: string; rule: number; ruleName: string }
export interface PluginResult { run: Run; tests: string[]; why: string }
export interface Dispatch {
  compare: { kind: 'staged' } | { kind: 'range'; base: string; head: string };
  ci: boolean;
  shared: true;
  blocked: string[];
  plugins: Record<Plugin, PluginResult>;
  paths: PathResult[];
}

const RANK: Record<Run, number> = { skip: 0, related: 1, full: 2 };

/** 寫到這些路徑的測試檔：照原本 pre-commit 的 grep -rlF --include='*.test.ts'，加上嵌進 main.js 的規則檔（rules.ts 的特例）。 */
export function relatedTests(root: string, paths: string[]): string[] {
  if (!paths.length) return [];
  const found = new Set<string>();
  const testsDir = join(root, 'tests');
  if (existsSync(testsDir)) {
    for (const name of readdirSync(testsDir, { recursive: true, encoding: 'utf8' })) {
      if (!name.endsWith('.test.ts')) continue;
      const file = 'tests/' + name.replaceAll('\\', '/');
      const text = readFileSync(join(root, file), 'utf8');
      if (paths.some(path => text.includes(path))) found.add(file);
    }
  }
  const rules = join(root, 'src/core/ai/rules.ts');
  // 嵌進 main.js 的規則檔路徑寫在 rules.ts，測試只寫到其中一份；改哪一份都跑規則的測試（第二次里程碑檢查 R8）。
  if (existsSync(rules)) {
    const text = readFileSync(rules, 'utf8');
    if (paths.some(path => text.includes(`'${path}'`))) found.add('tests/ai-rules.test.ts');
  }
  return [...found].sort();
}

/** 顯示用：控制字元與換行跳脫，其餘照原樣。 */
export const shown = (path: string) => path.replace(/[\u0000-\u001f\u007f\\]/g, ch => JSON.stringify(ch).slice(1, -1));

function list(paths: string[], max = 3): string {
  const head = paths.slice(0, max).map(shown).join('、');
  return paths.length > max ? `${head} 等 ${paths.length} 個` : head;
}

export function dispatch(changes: Change[], { root, ci, compare }: { root: string; ci: boolean; compare: Dispatch['compare'] }): Dispatch {
  const runs: Record<Plugin, Run> = { cards: 'skip', capture: 'skip', mindboard: 'skip' };
  const touched: Record<Plugin, string[]> = { cards: [], capture: [], mindboard: [] };
  const related: string[] = [];
  const blocked: string[] = [];
  const paths: PathResult[] = [];
  for (const change of changes) {
    const rule = RULES.find(r => r.matches(change.path, change))!;
    paths.push({ status: change.status, path: change.path, rule: rule.id, ruleName: rule.name });
    const effect = rule.effect(change.path);
    if (effect === 'blocked') { blocked.push(change.path); continue; }
    const wanted: Partial<Record<Plugin, Run>> = effect === 'all' ? { cards: 'full', capture: 'full', mindboard: 'full' } : effect;
    for (const plugin of PLUGINS) {
      let run = wanted[plugin];
      if (!run) continue;
      // CI 不花 token：根目錄（過渡期都是 Cards 的）有任何改動，Cards 跑完整檢查（保留 b63c1bb 只改文件也紅燈的後盾）。
      if (ci && run === 'related') run = 'full';
      touched[plugin].push(change.path);
      if (run === 'related') related.push(change.path);
      if (RANK[run] > RANK[runs[plugin]]) runs[plugin] = run;
    }
  }
  const plugins = {} as Record<Plugin, PluginResult>;
  for (const plugin of PLUGINS) {
    let run = runs[plugin];
    let tests: string[] = [];
    let why: string;
    if (run === 'full') why = `完整檢查（改到 ${list(touched[plugin])}）`;
    else if (run === 'related') {
      tests = relatedTests(root, related);
      if (tests.length) why = `相關測試（寫到 ${list(related)} 的 ${tests.length} 個測試檔）`;
      else {
        run = 'skip';
        why = `照分派表跳過（沒有測試寫到 ${list(related)}）`;
      }
    } else why = changes.length ? `照分派表跳過（這次改的路徑都不是它的：${list(changes.map(c => c.path))}）` : '照分派表跳過（沒有改動）';
    plugins[plugin] = { run, tests, why };
  }
  return { compare, ci, shared: true, blocked, plugins, paths };
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
  for (const plugin of PLUGINS) lines.push(`${NAMES[plugin]}：${result.plugins[plugin].why}`);
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
  let root: string;
  let changes: Change[];
  try {
    root = execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
    changes = readChanges(root, compare);
  } catch (error) {
    const stderr = (error as { stderr?: Buffer | string }).stderr?.toString().trim();
    console.error(`分派表讀不到 Git 的改動，不能當成沒有改動：${stderr || (error as Error).message}`);
    return 2;
  }
  const result = dispatch(changes, { root, ci, compare });
  console.log(args.includes('--explain') ? explain(result) : JSON.stringify(result, null, 2));
  if (result.blocked.length) {
    console.error(`擋下：${list(result.blocked)} 是子模組（gitlink），這個 repo 不支援子模組。`);
    return 1;
  }
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) process.exitCode = main(process.argv.slice(2));
