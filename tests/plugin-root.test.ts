// D-208 第二步 §A5：跨版本的工具認得兩種外掛根（搬家前在根目錄，搬家後在 plugins/cards/）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { git, gitEnv, pluginRoot } from '../tools/git.ts';

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
    old: { 'manifest.json': CARDS },
    moved: { 'plugins/cards/manifest.json': CARDS },
    both: { 'manifest.json': CARDS, 'plugins/cards/manifest.json': OTHER },
    none: { 'README.md': '#' },
    wrongId: { 'manifest.json': OTHER },
    notJson: { 'plugins/cards/manifest.json': '{ id: essence-cards' },
    folder: { 'manifest.json/x.json': CARDS },
  });
  const expected: Record<string, string | RegExp> = {
    old: '.',
    moved: 'plugins/cards',
    both: /判不出 both 的外掛根：根目錄與 plugins\/cards\/ 都有 manifest\.json/,
    none: /判不出 none 的外掛根：根目錄與 plugins\/cards\/ 都沒有 manifest\.json/,
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
  const cards = fileURLToPath(new URL('..', import.meta.url));
  const top = git(cards, ['rev-parse', '--show-toplevel']);
  assert.equal(pluginRoot(cards, 'HEAD'), relative(top, cards).replaceAll('\\', '/') || '.');
  let tagged = true;
  try { git(cards, ['rev-parse', '--verify', '--quiet', 'refs/tags/v0.6.0']); } catch { tagged = false; }
  if (!tagged) { t.skip('沒有 v0.6.0 的 tag（淺層 clone）'); return; }
  assert.equal(pluginRoot(cards, 'v0.6.0'), '.');
});
