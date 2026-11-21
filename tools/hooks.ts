// commit 與合併前的檢查（D-208 第 5 點，tasks/one-repo-step-1.md §3）。.githooks/pre-commit、pre-merge-commit 只確認 tools/ 裝過，再呼叫這裡。
// 用法：node tools/hooks.ts pre-commit | pre-merge-commit
// 不用 npm 套件。子程序的參數全程用陣列傳，不經過 sh 拆字。
import { execFileSync, spawnSync, type SpawnSyncOptions } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { NAMES, TARGETS, dispatch, folder, readChanges, shown, type Dispatch, type Target } from './dispatch.ts';

/** 共用檢查：每次都跑，在 hook 原本的環境讀暫存區（git commit <路徑>、-a 用的是暫時的索引）。 */
export const SHARED_CHECKS: [string, ...string[]][] = [
  ['check-docs.ts', '--staged'],
  ['secretlint.mjs', '--staged'],
  ['check-local-paths.ts', '--staged'],
  ['check-skill-mirror.ts', '--staged'],
  ['check-app-imports.ts', '--staged'],
  // 每一份 roadmap 讀得出來（§8）：外掛的 roadmap 寫壞時 commit 就擋，不會等到 Pages 才失敗。
  ['roadmap-board.ts', '--check', '--staged'],
];

const git = (root: string, args: string[]) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

function runShared(root: string): boolean {
  for (const [script, ...args] of SHARED_CHECKS) {
    const { status } = spawnSync(process.execPath, [join(root, 'tools', script), ...args], { cwd: root, stdio: 'inherit' });
    if (status !== 0) return false;
  }
  return true;
}

/** 清掉 Git 給 hook 的環境（GIT_DIR、GIT_INDEX_FILE 等）：測試與工具會在暫存資料夾跑 git，繼承了會改到這個 repo（2026-10-29 測試的 git init 把共用 .git/config 的 core.bare 改成 true）。 */
function cleanEnv(root: string): NodeJS.ProcessEnv {
  const names = new Set(git(root, ['rev-parse', '--local-env-vars']).split('\n').filter(Boolean).map(name => name.toUpperCase()));
  const env = { ...process.env };
  for (const key of Object.keys(env)) if (names.has(key.toUpperCase())) delete env[key];
  return env;
}

/** 外掛的 package.json 有沒有相依：有的話要先 npm ci。 */
function needsInstall(dir: string): boolean {
  const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as Record<string, Record<string, string> | undefined>;
  return ['dependencies', 'devDependencies', 'optionalDependencies'].some(field => Object.keys(pkg[field] ?? {}).length > 0);
}

/**
 * 只有暫存內容的副本（tasks/one-repo-step-1.md §10）：外掛的檢查在這裡跑，讀到的就是這次要 commit 的內容；
 * 工作樹裡還沒 stage 的修改（自己的或別的 session 的）不會讓檢查通過或擋下，檢查跑的時候也可以繼續改檔。
 * - 在 hook 原本的環境取出（git commit <路徑>、-a 用的是暫時的索引）；core.autocrlf 關掉，和 CI 一樣是 LF。
 * - .git 檔指向這個工作樹的 git 資料夾：要讀 tag 或歷史的測試照常跑。子程序的 git 讀的是預設的索引，git commit <路徑>、
 *   -a 時和副本的內容可能不同（原本讀工作樹時也一樣）。
 * - node_modules 用連結借工作樹的（Windows 用 junction）；清理時先拆連結再刪，不會刪到工作樹的相依。
 */
function stagedCopy(root: string): { dir: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), 'essence-staged-'));
  const links: string[] = [];
  const cleanup = () => {
    for (const link of links) {
      try {
        unlinkSync(link);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue;
        console.error(`警告：拆不掉連結 ${link}，副本 ${dir} 沒有刪；先拆掉連結再刪。`);
        return;
      }
    }
    // 防毒軟體短暫鎖住檔案時重試；還是刪不掉只警告，不讓已經通過的檢查變成失敗。
    try {
      rmSync(dir, { recursive: true, force: true, maxRetries: 5 });
    } catch (error) {
      console.error(`警告：副本 ${dir} 沒刪乾淨（${(error as Error).message}），可以手動刪。`);
    }
  };
  try {
    git(root, ['-c', 'core.autocrlf=false', 'checkout-index', '--all', `--prefix=${dir.replaceAll('\\', '/')}/`]);
    writeFileSync(join(dir, '.git'), `gitdir: ${git(root, ['rev-parse', '--absolute-git-dir'])}\n`);
    for (const sub of new Set(TARGETS.map(folder))) {
      const from = join(root, sub, 'node_modules');
      if (!existsSync(from) || !existsSync(join(dir, sub))) continue;
      const to = join(dir, sub, 'node_modules');
      symlinkSync(from, to, 'junction');
      links.push(to);
    }
  } catch (error) {
    cleanup();
    throw error;
  }
  return { dir, cleanup };
}

/** npm 在 Windows 是 npm.cmd，要經過 shell 才找得到；參數都是固定的字，沒有使用者輸入。 */
const npm = (args: string[], options: SpawnSyncOptions) => spawnSync(['npm', ...args].join(' '), { ...options, shell: true });

/**
 * 照分派表跑一個對象（在暫存內容的副本 copy 裡跑）；回傳這個對象在最後那行的寫法，失敗時回傳 undefined（已經印出原因）。
 * 完整：外掛跑 npm run check，共用工具跑 npm run self-check（§A2；check 是每次 commit 的共用檢查，前面已經跑過）。
 */
function runTarget(root: string, copy: string, target: Target, result: Dispatch, env: NodeJS.ProcessEnv): string | undefined {
  const { run, tests, why } = result.targets[target];
  const name = NAMES[target];
  if (run === 'skip') return `${name}：${why}`;
  const dir = join(copy, folder(target));
  const where = folder(target) === '.' ? '根目錄' : `${folder(target)}/`;
  if (!existsSync(join(dir, 'package.json'))) {
    console.error(`${name}：${where}沒有 package.json，跑不了檢查。`);
    return undefined;
  }
  if (needsInstall(dir) && !existsSync(join(root, folder(target), 'node_modules'))) {
    console.error(`${name} 要檢查，先在${where}執行 npm ci。`);
    return undefined;
  }
  // 測試改用 dot reporter：通過的只印一個點，失敗的照常印出，exit code 照常傳回。AI 讀 commit 的輸出要花 token，
  // 原本約 4.2 萬字（外掛架構檢查環節 9 的 Q2）。手動跑與 CI 不變。
  const dotEnv = { ...env, NODE_OPTIONS: `${env.NODE_OPTIONS ? env.NODE_OPTIONS + ' ' : ''}--test-reporter=dot` };
  if (run === 'full') {
    const { status } = npm(['run', target === 'tools' ? 'self-check' : 'check'], { cwd: dir, env: dotEnv, stdio: 'inherit' });
    if (status !== 0) return undefined;
    return `${name}：${why}通過`;
  }
  // 相關測試（Cards 與共用工具）：通過時只印一行。
  const out = spawnSync(process.execPath, ['--test', '--test-concurrency=1', '--test-reporter=dot', ...tests], { cwd: dir, env, encoding: 'utf8' });
  if (out.status !== 0) {
    process.stderr.write(out.stdout + out.stderr);
    return undefined;
  }
  return `${name}：${why}通過`;
}

export function preCommit(root: string): number {
  let result: Dispatch;
  try {
    result = dispatch(readChanges(root, { kind: 'staged' }), { root, ci: false, compare: { kind: 'staged' } });
  } catch (error) {
    console.error(`分派表讀不到暫存區，不能當成沒有改動：${(error as Error).message}`);
    return 1;
  }
  if (result.blocked.length) {
    console.error(`擋下：${result.blocked.map(shown).join('、')} 是子模組（gitlink），這個 repo 不支援子模組。`);
    return 1;
  }
  if (!runShared(root)) return 1;
  const env = cleanEnv(root);
  const parts = ['共用檢查通過'];
  // 有對象要跑才取出副本（照表全部跳過的 commit 不多花時間）。
  let copy: ReturnType<typeof stagedCopy> | undefined;
  if (TARGETS.some(target => result.targets[target].run !== 'skip')) {
    try {
      copy = stagedCopy(root);
    } catch (error) {
      console.error(`取不出暫存區的副本，跑不了外掛的檢查：${(error as Error).message}`);
      return 1;
    }
  }
  // Ctrl+C 會連子程序一起停；這裡不跟著直接結束，等子程序停下、走到 finally 拆掉副本的連結。
  const ignore = () => undefined;
  process.on('SIGINT', ignore);
  try {
    for (const target of TARGETS) {
      const part = runTarget(root, copy?.dir ?? root, target, result, env);
      if (part === undefined) return 1;
      parts.push(part);
    }
  } finally {
    copy?.cleanup();
    process.off('SIGINT', ignore);
  }
  console.log(`分派表：${parts.join('；')}`);
  return 0;
}

/** 合併的 commit：Git 把要合併的放在 GITHEAD_<sha> 環境變數（這個 hook 執行時還沒有 MERGE_HEAD；2026-11-12 在 Git for Windows 實測）。 */
function mergeHeads(root: string): string[] {
  const heads = Object.keys(process.env).flatMap(key => /^GITHEAD_([0-9a-f]{40,64})$/i.exec(key)?.[1].toLowerCase() ?? []);
  if (heads.length) return heads;
  try { return [git(root, ['rev-parse', '--quiet', '--verify', 'MERGE_HEAD'])]; } catch { return []; }
}

/** gh 在 Windows 也可能是 .cmd，經過 shell 找；參數是固定的字與 SHA。 */
const gh = (args: string[], env: NodeJS.ProcessEnv) =>
  spawnSync(process.platform === 'win32' ? ['gh', ...args].join(' ') : 'gh', process.platform === 'win32' ? [] : args, { env, encoding: 'utf8', shell: process.platform === 'win32' });

/**
 * 合併進 main 之前，要合併的 commit 在 GitHub Actions 的 Check 要是綠燈（第二次里程碑檢查 R2）。用分派表的 CI 跑法比
 * <合併基點>..<head>，有對象要跑就要 CI 綠燈；只查同一個 head 的 push run：分支 push 的比較範圍才是整個分支對 main。
 * 快轉與有衝突的合併不經過這個 hook（docs/agents/quality.md 的合併步驟也寫了）；gh 不能用或沒登入時警告放行。
 */
export function preMergeCommit(root: string): number {
  // 合併不經過 pre-commit：在原本的環境跑一次共用檢查，讀合併的索引。
  if (!runShared(root)) return 1;
  let branch = '';
  try { branch = git(root, ['symbolic-ref', '--quiet', '--short', 'HEAD']); } catch { /* 分離的 HEAD：不是 main */ }
  if (branch !== 'main') return 0;
  const heads = mergeHeads(root);
  if (!heads.length) {
    console.error('警告：找不到要合併的 commit，沒有確認 CI，照樣合併。');
    return 0;
  }
  const env = cleanEnv(root);
  for (const head of heads) {
    const short = head.slice(0, 7);
    let base: string | undefined;
    try { base = git(root, ['merge-base', 'HEAD', head]); } catch { base = undefined; }
    if (base) {
      try {
        const result = dispatch(readChanges(root, { kind: 'range', base, head }), { root, ci: true, compare: { kind: 'range', base, head } });
        if (TARGETS.every(target => result.targets[target].run === 'skip')) continue;
      } catch { /* 讀不到改動：照要 CI 處理 */ }
    }
    const out = gh(['run', 'list', '--commit', head, '--workflow', 'check.yml', '--event', 'push', '--limit', '1', '--json', 'status,conclusion'], env);
    let runs: { status?: string; conclusion?: string }[] | undefined;
    try { runs = out.status === 0 ? (JSON.parse(out.stdout) as typeof runs) : undefined; } catch { runs = undefined; }
    if (!runs) {
      console.error(`警告：查不到 GitHub Actions（gh 不能用或沒登入），沒有確認 ${short} 的 CI，照樣合併。`);
      continue;
    }
    const [latest] = runs;
    const state = latest ? `${latest.status ?? ''} ${latest.conclusion ?? ''}`.trim() : '';
    if (state === 'completed success') continue;
    const reason = !latest ? '沒有 push 的 CI 紀錄：先 push 這個分支，等 Check 跑完是綠燈再合併'
      : latest.status === 'completed' ? `CI 沒通過（${state}）：先修好再合併`
      : `CI 還沒跑完（${state}）：等它跑完是綠燈再合併`;
    console.error(`已擋下合併進 main：${short} 的 ${reason}（gh run list --commit ${head} --workflow check.yml --event push）。`);
    return 1;
  }
  return 0;
}

export function main(args: string[]): number {
  const root = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
  if (args[0] === 'pre-commit') return preCommit(root);
  if (args[0] === 'pre-merge-commit') return preMergeCommit(root);
  console.error('用法：node tools/hooks.ts pre-commit | pre-merge-commit');
  return 2;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) process.exitCode = main(process.argv.slice(2));
