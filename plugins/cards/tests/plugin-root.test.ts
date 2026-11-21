// D-208 第二步 §A5：跨版本的工具認得外掛根（搬家前在根目錄，第二步搬家後在 plugins/cards/）；D-218 改名後多 apps/Cards/。
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { pathToFileURL } from 'node:url';
import { git, gitEnv, pluginRoot } from '../tools/git.ts';
import { CARDS_ROOT } from './helpers/layout.ts';

const CARDS = JSON.stringify({ id: 'essence-cards', version: '0.6.0' });
const OTHER = JSON.stringify({ id: 'essence-capture', version: '0.1.0' });

/** 暫存 repo：每個案例一個 commit，tag 是案例名；另外放兩個子資料夾，從那裡呼叫要得到同樣的結果。 */
async function repo(t: test.TestContext, cases: Record<string, Record<string, string>>): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'essence-plugin-root-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const run = (args: string[]): string => execFileSync('git', args, { cwd: dir, env: gitEnv(), encoding: 'utf8' });
  run(['init', '-q']);
  run(['config', 'user.email', 'test@example.com']);
  run(['config', 'user.name', 'test']);
  for (const [name, files] of Object.entries(cases)) {
    run(['rm', '-rq', '--ignore-unmatch', '.']);
    for (const [path, text] of Object.entries({ ...files, 'tools/keep.txt': 'x', 'plugins/cards/keep.txt': 'x' })) {
      await mkdir(dirname(join(dir, path)), { recursive: true });
      await writeFile(join(dir, path), text);
      run(['add', '--', path]);
    }
    run(['commit', '-qm', name, '--allow-empty']);
    run(['tag', name]);
  }
  return dir;
}

void test('§A5 外掛根：只有一個位置有 id 對的 manifest 才算，其他一律丟錯；從 repo 根與子資料夾呼叫結果相同', async t => {
  const dir = await repo(t, {
    // 大小寫不對的放第一個：Windows 上 git add 會把新檔對齊索引裡已有的資料夾大小寫，先建過 apps/Cards/ 的話，
    // apps/cards/manifest.json 會被記成 apps/Cards/manifest.json，這一例就測不到（開工前查核 R13）。
    appsLower: { 'apps/cards/manifest.json': CARDS },
    old: { 'manifest.json': CARDS },
    moved: { 'plugins/cards/manifest.json': CARDS },
    both: { 'manifest.json': CARDS, 'plugins/cards/manifest.json': OTHER },
    none: { 'README.md': '#' },
    wrongId: { 'manifest.json': OTHER },
    notJson: { 'plugins/cards/manifest.json': '{ id: essence-cards' },
    folder: { 'manifest.json/x.json': CARDS },
    apps: { 'apps/Cards/manifest.json': CARDS },
    pluginsAndApps: { 'plugins/cards/manifest.json': CARDS, 'apps/Cards/manifest.json': CARDS },
  });
  const expected: Record<string, string | RegExp> = {
    appsLower: /判不出 appsLower 的外掛根：根目錄、plugins\/cards\/、apps\/Cards\/ 都沒有 manifest\.json/,
    old: '.',
    moved: 'plugins/cards',
    apps: 'apps/Cards',
    both: /判不出 both 的外掛根：manifest\.json、plugins\/cards\/manifest\.json 都有/,
    pluginsAndApps: /判不出 pluginsAndApps 的外掛根：apps\/Cards\/manifest\.json、plugins\/cards\/manifest\.json 都有/,
    none: /判不出 none 的外掛根：根目錄、plugins\/cards\/、apps\/Cards\/ 都沒有 manifest\.json/,
    wrongId: /判不出 wrongId 的外掛根：manifest\.json 的 id 是 "essence-capture"，不是 essence-cards/,
    notJson: /判不出 notJson 的外掛根：plugins\/cards\/manifest\.json 不是 JSON/,
    folder: /判不出 folder 的外掛根：manifest\.json 不是檔案/,
    missing: /判不出 missing 的外掛根：找不到這個 commit/,
  };
  // 子資料夾：Codex 第三輪實測，ls-tree 不加 --full-tree 時從這兩處會回 0 筆。
  for (const at of [dir, join(dir, 'plugins/cards'), join(dir, 'tools')]) {
    for (const [ref, want] of Object.entries(expected)) {
      const where = `${ref}（從 ${relative(dir, at) || '.'} 呼叫）`;
      if (typeof want === 'string') assert.equal(pluginRoot(at, ref), want, where);
      else assert.throws(() => pluginRoot(at, ref), want, where);
    }
  }
});

void test('§A5 外掛根：這個 repo 的 HEAD 是 Cards 現在所在的資料夾，v0.6.0 在根目錄', t => {
  const cards = CARDS_ROOT;
  const top = git(cards, ['rev-parse', '--show-toplevel']);
  let same = true;
  try { git(cards, ['diff', '--cached', '--quiet', 'HEAD', '--', ':/manifest.json', ':/plugins/cards/manifest.json', ':/apps/Cards/manifest.json']); } catch { same = false; }
  if (same) assert.equal(pluginRoot(cards, 'HEAD'), relative(top, cards).replaceAll('\\', '/') || '.');
  else t.diagnostic('HEAD 的 manifest 和暫存區不同（搬家的 commit 本身）：HEAD 那一項由下一個 commit 驗');
  let tagged = true;
  try { git(cards, ['rev-parse', '--verify', '--quiet', 'refs/tags/v0.6.0']); } catch { tagged = false; }
  if (!tagged) { t.skip('沒有 v0.6.0 的 tag（淺層 clone）'); return; }
  assert.equal(pluginRoot(cards, 'v0.6.0'), '.');
});

// D-218 §3 第 6 點：Windows 上從打錯大小寫的資料夾載入（npm --prefix apps/cards），import.meta.url 照打的字；
// layout.ts 匯出的 Cards 根要回磁碟上的真實大小寫，上一個測試拿它和 git 回的路徑比才不會假失敗。
void test('D-218 Cards 根的大小寫打錯（只在 Windows）：layout.ts 的 CARDS_ROOT 照磁碟上的真實大小寫', { skip: process.platform !== 'win32' && '只有 Windows 的檔案系統不分大小寫' }, () => {
  const wrong = CARDS_ROOT.toUpperCase();
  assert.notEqual(wrong, CARDS_ROOT);
  const url = pathToFileURL(join(wrong, 'tests/helpers/layout.ts')).href;
  const printed = execFileSync(process.execPath, ['--input-type=module', '-e', `const m = await import(${JSON.stringify(url)}); console.log(m.CARDS_ROOT);`],
    { cwd: wrong, env: gitEnv(), encoding: 'utf8' }).trim();
  assert.equal(printed, CARDS_ROOT);
});
