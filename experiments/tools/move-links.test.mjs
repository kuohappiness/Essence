// move-links.mjs 的測試（D-208 第二步 §A6）：node --test experiments/tools/move-links.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { mapper, main, rewrite } from './move-links.mjs';

const MOVES = [['src', 'plugins/cards/src'], ['tools/build.mjs', 'plugins/cards/tools/build.mjs'], ['tests', 'plugins/cards/tests']];
const AFTER = ['plugins/cards/src/a.ts', 'plugins/cards/src/中文 檔.ts', 'plugins/cards/tools/build.mjs', 'plugins/cards/tests/README.md', 'tools/check-docs.ts', 'docs/x.md', 'docs/sub/y.md'];
function existing(files) {
  const paths = new Set();
  for (const file of files) {
    const parts = file.split('/');
    for (let i = 1; i <= parts.length; i++) paths.add(parts.slice(0, i).join('/'));
  }
  return path => paths.has(path);
}
const exists = existing(AFTER);
const map = mapper(MOVES);

const DOC = [
  '---',
  'link: "[f](../src/a.ts)"',
  '---',
  '# 標題',
  '',
  '[a](../src/a.ts) 與 [錨點](../src/a.ts#L3)、[資料夾](../src/)、![圖](../src/a.ts)',
  '',
  '[引用式][r] 和 [角括號](<../src/中文 檔.ts>) 和 [編碼](../src/%E4%B8%AD%E6%96%87%20%E6%AA%94.ts)',
  '',
  '[根目錄算的](/src/a.ts)、[沒搬的](../tools/check-docs.ts)、[本來就壞的](../nope.md)、[本頁](#標題)',
  '',
  '[舊名網址](https://github.com/o/Essence-Cards/blob/main/src/a.ts#L1)、[新名網址](https://github.com/o/Essence/blob/main/tools/build.mjs)、[沒搬的網址](https://github.com/o/Essence/blob/main/docs/x.md)、[別的 repo](https://github.com/o/Other/blob/main/src/a.ts)',
  '',
  '行內程式碼 `[a](../src/a.ts)` 不改；表格裡的要改：',
  '',
  '| 檔 | 說明 |',
  '|---|---|',
  '| [b](../tools/build.mjs) | 建置 |',
  '',
  '```md',
  '[a](../src/a.ts)',
  '```',
  '',
  '[r]: ../tools/build.mjs "建置"',
  '',
].join('\n');

const EXPECTED = [
  '---',
  'link: "[f](../src/a.ts)"',
  '---',
  '# 標題',
  '',
  '[a](../plugins/cards/src/a.ts) 與 [錨點](../plugins/cards/src/a.ts#L3)、[資料夾](../plugins/cards/src/)、![圖](../plugins/cards/src/a.ts)',
  '',
  '[引用式][r] 和 [角括號](<../plugins/cards/src/中文 檔.ts>) 和 [編碼](../plugins/cards/src/%E4%B8%AD%E6%96%87%20%E6%AA%94.ts)',
  '',
  '[根目錄算的](/plugins/cards/src/a.ts)、[沒搬的](../tools/check-docs.ts)、[本來就壞的](../nope.md)、[本頁](#標題)',
  '',
  '[舊名網址](https://github.com/o/Essence-Cards/blob/main/plugins/cards/src/a.ts#L1)、[新名網址](https://github.com/o/Essence/blob/main/plugins/cards/tools/build.mjs)、[沒搬的網址](https://github.com/o/Essence/blob/main/docs/x.md)、[別的 repo](https://github.com/o/Other/blob/main/src/a.ts)',
  '',
  '行內程式碼 `[a](../src/a.ts)` 不改；表格裡的要改：',
  '',
  '| 檔 | 說明 |',
  '|---|---|',
  '| [b](../plugins/cards/tools/build.mjs) | 建置 |',
  '',
  '```md',
  '[a](../src/a.ts)',
  '```',
  '',
  '[r]: ../plugins/cards/tools/build.mjs "建置"',
  '',
].join('\n');

void test('沒搬的文件：搬走的目標換成新的相對寫法；錨點、斜線、角括號、百分比編碼照原本的寫法；程式碼與 front matter 不動', () => {
  const result = rewrite('docs/x.md', DOC, map, exists);
  assert.equal(result.text, EXPECTED);
  assert.equal(result.edits.length, 11);
  assert.deepEqual(result.edits[0], { line: 6, from: '../src/a.ts', to: '../plugins/cards/src/a.ts' });
});

void test('第二次執行不改任何字；CRLF 與 BOM 照留', () => {
  const once = rewrite('docs/x.md', DOC, map, exists).text;
  assert.deepEqual(rewrite('docs/x.md', once, map, exists), { text: once, edits: [] });
  const bom = String.fromCharCode(0xfeff);
  const windows = rewrite('docs/x.md', bom + DOC.replace(/\n/g, '\r\n'), map, exists);
  assert.equal(windows.text, bom + EXPECTED.replace(/\n/g, '\r\n'));
});

void test('跟著搬的文件：從新位置解得開的不動，解不開的從搬家前的位置解', () => {
  const text = '[文件](../docs/x.md#標題) 與 [程式](../src/a.ts) 與 [深一層](../docs/sub/y.md)\n';
  const result = rewrite('plugins/cards/tests/README.md', text, map, exists);
  assert.equal(result.text, '[文件](../../../docs/x.md#標題) 與 [程式](../src/a.ts) 與 [深一層](../../../docs/sub/y.md)\n');
  assert.deepEqual(rewrite('plugins/cards/tests/README.md', result.text, map, exists).edits, []);
});

void test('main：在 repo 根目錄跑；--check 只列出、結束碼 1，寫完再 --check 是 0', t => {
  const root = mkdtempSync(join(tmpdir(), 'essence-move-links-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const git = args => execFileSync('git', args, { cwd: root, encoding: 'utf8' });
  git(['init', '-q']);
  const write = (path, text) => { mkdirSync(dirname(join(root, path)), { recursive: true }); writeFileSync(join(root, path), text); };
  write('src/a.ts', 'x');
  write('docs/x.md', '[a](../src/a.ts)\n');
  git(['add', '-A']);
  mkdirSync(join(root, 'plugins/cards'), { recursive: true });
  git(['mv', 'src', 'plugins/cards/src']);
  const log = t.mock.method(console, 'log', () => {});
  assert.equal(main(['--check', 'src=plugins/cards/src'], root), 1);
  assert.equal(readFileSync(join(root, 'docs/x.md'), 'utf8'), '[a](../src/a.ts)\n');
  assert.equal(main(['src=plugins/cards/src'], root), 0);
  assert.equal(readFileSync(join(root, 'docs/x.md'), 'utf8'), '[a](../plugins/cards/src/a.ts)\n');
  assert.equal(main(['--check', 'src=plugins/cards/src'], root), 0);
  assert.ok(log.mock.calls.some(call => call.arguments[0] === 'docs/x.md:1  ../src/a.ts → ../plugins/cards/src/a.ts'));
  assert.throws(() => main(['src'], root), /用法/);
});
