import { execFileSync } from 'node:child_process';

/**
 * 繼承來的環境變數拿掉 git 的：在 git hook 裡跑時 GIT_DIR 等指著呼叫的那個 repo，不拿掉就會讀寫到別的 repo
 * （2026-10-29：測試的 git init 因此把共用 .git/config 的 core.bare 改成 true）。名稱不分大小寫：Windows 的環境變數
 * 不分大小寫，小寫的 git_dir 照樣生效（Codex 第二輪 L3）。
 */
export function gitEnv(env: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  return Object.fromEntries(Object.entries(env).filter(([key]) => !key.toUpperCase().startsWith('GIT_')));
}

/** 在 root 跑 git，只看 root 自己的 repo。 */
export function git(root: string, args: string[]): string {
  return execFileSync('git', args, { cwd: root, env: gitEnv(), encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

/**
 * 一個版本的 Cards 在 repo 裡的位置：第二步搬家前在根目錄，之後在 plugins/cards/（D-208 第 8 點），改名後在
 * apps/Cards/（D-218）。舊的兩個是歷史路徑，跨版本的工具要認得（D-218〈代價〉）。
 */
export type PluginRoot = '.' | 'plugins/cards' | 'apps/Cards';
const MANIFESTS: Record<string, PluginRoot> = {
  'manifest.json': '.', 'plugins/cards/manifest.json': 'plugins/cards', 'apps/Cards/manifest.json': 'apps/Cards',
};
const PLACES = Object.values(MANIFESTS).map(at => at === '.' ? '根目錄' : at + '/').join('、');

/**
 * ref 那個 commit 的 Cards 根（repo 相對）。只有一個位置有 manifest.json、而且 id 是 essence-cards 才算；兩個以上都有、
 * 都沒有、id 不對、不是 JSON 一律丟錯，不猜（D-208 第二步 §A5）。
 * ls-tree 要加 --full-tree：不加時路徑照執行的資料夾算，從 tools/ 或 plugins/cards/ 跑會回 0 筆。
 * 不用 cat-file -e 判斷：路徑不在與 commit 不在都回 128，分不出來。
 * 路徑分大小寫（ls-tree 在 Windows 也是）：大小寫打錯的 manifest.json 不算 apps/Cards/ 的。
 */
export function pluginRoot(root: string, ref: string): PluginRoot {
  const fail = (why: string): Error => Error(`判不出 ${ref} 的外掛根：${why}`);
  let commit: string;
  try { commit = git(root, ['rev-parse', '--verify', '--quiet', ref + '^{commit}']); } catch { throw fail('找不到這個 commit'); }
  const listed = git(root, ['ls-tree', '--full-tree', commit, '--', ...Object.keys(MANIFESTS)]).split('\n').filter(Boolean)
    .map(line => { const [meta, path] = line.split('\t'); return { type: meta.split(' ')[1], path }; });
  if (listed.length === 0) throw fail(`${PLACES} 都沒有 manifest.json`);
  if (listed.length > 1) throw fail(`${listed.map(each => each.path).join('、')} 都有`);
  const [{ type, path }] = listed;
  if (type !== 'blob') throw fail(`${path} 不是檔案`);
  let id: unknown;
  try { id = (JSON.parse(git(root, ['show', `${commit}:${path}`])) as { id?: unknown }).id; } catch { throw fail(`${path} 不是 JSON`); }
  if (id !== 'essence-cards') throw fail(`${path} 的 id 是 ${JSON.stringify(id)}，不是 essence-cards`);
  return MANIFESTS[path];
}
