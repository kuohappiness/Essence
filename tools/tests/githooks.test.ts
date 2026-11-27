// .githooks/ 的每一支在 git 裡都要是可執行檔（100755）：Linux 與 macOS 的 git 遇到不可執行的 hook 只印一行提示就略過，
// 等於沒有這道檢查。pre-merge-commit 2026-11-21 建檔時是 100644，雲端從那時起合併都沒跑它（優化 Essence 開發流程第 1 步）。
// Windows 不看這個權限，在那邊新增的 hook 預設就是 100644，所以由測試擋。改 .githooks/ 的 commit 照分派表會跑完整檢查。
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));

void test('第 1 步：.githooks/ 每一支都是可執行檔，git 才不會略過', () => {
  const out = execFileSync('git', ['ls-files', '--stage', '--', '.githooks'], { cwd: ROOT, encoding: 'utf8' });
  const entries = out.split('\n').filter(Boolean).map(line => {
    const match = /^(\d{6}) [0-9a-f]+ \d\t(.+)$/.exec(line);
    assert.ok(match, `讀不懂 git ls-files 的這一行：${line}`);
    return { mode: match[1], path: match[2] };
  });
  assert.ok(entries.some(({ path }) => path === '.githooks/pre-commit'), '找不到 .githooks/pre-commit');
  const wrong = entries.filter(({ mode }) => mode !== '100755').map(({ mode, path }) => `${path}（${mode}）`);
  assert.deepEqual(wrong, [], '不是可執行檔，git 會略過：執行 git update-index --chmod=+x <路徑> 再 commit');
});
