// move-links.mjs 的測試（D-208 第二步 §A6）：node --test experiments/tools/move-links.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
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
  '[舊名網址](https://github.com/kuohappiness/Essence-Cards/blob/main/src/a.ts#L1)、[新名網址](https://github.com/kuohappiness/Essence/blob/main/tools/build.mjs)、[沒搬的網址](https://github.com/kuohappiness/Essence/blob/main/docs/x.md)、[別的 repo](https://github.com/o/Other/blob/main/src/a.ts)',
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
  '[舊名網址](https://github.com/kuohappiness/Essence-Cards/blob/main/plugins/cards/src/a.ts#L1)、[新名網址](https://github.com/kuohappiness/Essence/blob/main/plugins/cards/tools/build.mjs)、[沒搬的網址](https://github.com/kuohappiness/Essence/blob/main/docs/x.md)、[別的 repo](https://github.com/o/Other/blob/main/src/a.ts)',
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
  assert.deepEqual(rewrite('docs/x.md', once, map, exists), { text: once, edits: [], conflicts: [] });
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

// 解析器眼中這份 Markdown 的連結目的地（含引用式），驗收改完之後還解析得到新位置。
const require = createRequire(new URL('../../tools/package.json', import.meta.url));
const { default: MarkdownIt } = await import(pathToFileURL(require.resolve('markdown-it')).href);
const parser = new MarkdownIt({ html: true });
function hrefsOf(text) {
  const out = [];
  for (const token of parser.parse(text, {})) {
    for (const child of token.children ?? []) if (child.type === 'link_open') out.push(decodeURI(child.attrGet('href')));
  }
  return out;
}

// Codex 在 A 的 L2 第一輪 R4 的樣本（Claude Codex Discussion/2026-11-20-one-repo-step-2-review.md）加上同類寫法。
const R4 = [
  '[Code](<https://github.com/kuohappiness/Essence/blob/main/src/a.ts#L11>)',
  '',
  '[引用][c]',
  '',
  '[c]: <https://github.com/kuohappiness/Essence/blob/main/src/a.ts#L11>',
  '',
  '[別人的同名 repo](https://github.com/someone-else/Essence/blob/main/src/a.ts) 與 <https://github.com/someone-else/Essence/blob/main/src/a.ts>',
  '',
  '[下一行的目的地](',
  '  ../src/a.ts) 與 <https://github.com/kuohappiness/Essence/blob/main/src/a.ts>',
  '',
  '[跨行引用][d] 與 [資料夾網址](https://github.com/kuohappiness/Essence/tree/main/src)',
  '',
  '[d]:',
  '  ../src/a.ts',
  '',
  '\\[不是連結](../src/a.ts) 與 [重複定義][c]',
  '',
  '[c]: ../src/a.ts',
  '',
].join('\n');

void test('R4：角括號網址與引用式定義只改一次；別人的 repo 不動；目的地在下一行照改；解析器不認的不動', () => {
  const result = rewrite('docs/x.md', R4, map, exists);
  const lines = result.text.split('\n');
  assert.equal(lines[0], '[Code](<https://github.com/kuohappiness/Essence/blob/main/plugins/cards/src/a.ts#L11>)');
  assert.equal(lines[4], '[c]: <https://github.com/kuohappiness/Essence/blob/main/plugins/cards/src/a.ts#L11>');
  assert.equal(lines[6], R4.split('\n')[6]);
  assert.equal(lines[9], '  ../plugins/cards/src/a.ts) 與 <https://github.com/kuohappiness/Essence/blob/main/plugins/cards/src/a.ts>');
  assert.equal(lines[11], '[跨行引用][d] 與 [資料夾網址](https://github.com/kuohappiness/Essence/tree/main/plugins/cards/src)');
  assert.equal(lines[14], '  ../plugins/cards/src/a.ts');
  assert.equal(lines.slice(16).join('\n'), R4.split('\n').slice(16).join('\n'));
  assert.equal(result.edits.length, 6);
  assert.deepEqual(hrefsOf(result.text), [
    'https://github.com/kuohappiness/Essence/blob/main/plugins/cards/src/a.ts#L11',
    'https://github.com/kuohappiness/Essence/blob/main/plugins/cards/src/a.ts#L11',
    'https://github.com/someone-else/Essence/blob/main/src/a.ts',
    'https://github.com/someone-else/Essence/blob/main/src/a.ts',
    '../plugins/cards/src/a.ts',
    'https://github.com/kuohappiness/Essence/blob/main/plugins/cards/src/a.ts',
    '../plugins/cards/src/a.ts',
    'https://github.com/kuohappiness/Essence/tree/main/plugins/cards/src',
    'https://github.com/kuohappiness/Essence/blob/main/plugins/cards/src/a.ts#L11',
  ]);
  assert.deepEqual(rewrite('docs/x.md', result.text, map, exists), { text: result.text, edits: [], conflicts: [] });
});

// B：syntax.md 拆成 Cards 的一份與最上層的轉錄稿，原檔留每個標題與一行轉往新頁；任務從 tasks/ 搬進 docs/tasks/ 與 Cards。
const B_MOVES = [['tasks/a.md', 'docs/tasks/a.md'], ['tasks/w3.md', 'plugins/cards/docs/tasks/w3.md'], ['docs/card-rules', 'plugins/cards/docs/card-rules']];
const B_FILES = ['docs/syntax.md', 'docs/transcript.md', 'docs/decisions.md', 'docs/roadmap.md', 'docs/tasks/a.md', 'docs/tasks/b.md', 'plugins/cards/docs/syntax.md',
  'plugins/cards/docs/card-rules/x.md', 'plugins/cards/docs/tasks/w3.md', 'plugins/cards/docs/tasks/b.md'];
const B_PLAN = {
  ...mapper(B_MOVES),
  pieces: { 'plugins/cards/docs/syntax.md': 'docs/syntax.md', 'docs/transcript.md': 'docs/syntax.md' },
  split: { 'docs/syntax.md': { default: 'plugins/cards/docs/syntax.md', anchors: { '0-總覽': 'plugins/cards/docs/syntax.md', '1-轉錄稿': 'docs/transcript.md', '2-卡組筆記': 'plugins/cards/docs/syntax.md' } } },
};
const bExists = existing(B_FILES);

void test('B：連到拆開的原檔照錨點去新檔，沒有錨點去 default；拆出的新檔裡連到本頁、已搬走的錨點連到另一份', () => {
  const roadmap = '[卡組](syntax.md#2-卡組筆記)、[轉錄稿](syntax.md#1-轉錄稿)、[整份](syntax.md)、[決定](decisions.md#d-1)\n';
  const once = rewrite('docs/roadmap.md', roadmap, B_PLAN, bExists);
  assert.equal(once.text, '[卡組](../plugins/cards/docs/syntax.md#2-卡組筆記)、[轉錄稿](transcript.md#1-轉錄稿)、[整份](../plugins/cards/docs/syntax.md)、[決定](decisions.md#d-1)\n');
  assert.deepEqual(rewrite('docs/roadmap.md', once.text, B_PLAN, bExists).edits, []);

  const cards = '## 0. 總覽\n\n[§1](#1-轉錄稿)、[§2](#2-卡組筆記)、[規則](card-rules/x.md)、[決定](decisions.md#d-1)\n\n## 2. 卡組筆記\n';
  const piece = rewrite('plugins/cards/docs/syntax.md', cards, B_PLAN, bExists);
  assert.equal(piece.text, '## 0. 總覽\n\n[§1](../../../docs/transcript.md#1-轉錄稿)、[§2](#2-卡組筆記)、[規則](card-rules/x.md)、[決定](../../../docs/decisions.md#d-1)\n\n## 2. 卡組筆記\n');
  assert.deepEqual(rewrite('plugins/cards/docs/syntax.md', piece.text, B_PLAN, bExists).edits, []);

  const transcript = '## 1. 轉錄稿\n\n[總覽](#0-總覽)、[本頁](#1-轉錄稿)\n';
  assert.equal(rewrite('docs/transcript.md', transcript, B_PLAN, bExists).text, '## 1. 轉錄稿\n\n[總覽](../plugins/cards/docs/syntax.md#0-總覽)、[本頁](#1-轉錄稿)\n');

  const stub = '## 0. 總覽\n\n搬到 [Cards](#0-總覽)。\n\n## 1. 轉錄稿\n\n搬到 [轉錄稿](#1-轉錄稿)。\n';
  assert.equal(rewrite('docs/syntax.md', stub, B_PLAN, bExists).text, '## 0. 總覽\n\n搬到 [Cards](../plugins/cards/docs/syntax.md#0-總覽)。\n\n## 1. 轉錄稿\n\n搬到 [轉錄稿](transcript.md#1-轉錄稿)。\n');
});

void test('B：搬走的文件以搬家前的位置解；兩種解法是不同的檔就列成要人看、不改', () => {
  const text = '[決定](../docs/decisions.md#d-1)、[w3](w3.md)、[規格](../docs/syntax.md#1-轉錄稿)、[b](b.md)\n';
  const result = rewrite('docs/tasks/a.md', text, B_PLAN, bExists);
  assert.equal(result.text, '[決定](../decisions.md#d-1)、[w3](../../plugins/cards/docs/tasks/w3.md)、[規格](../transcript.md#1-轉錄稿)、[b](b.md)\n');
  assert.deepEqual(result.conflicts, []);
  assert.deepEqual(rewrite('docs/tasks/a.md', result.text, B_PLAN, bExists), { text: result.text, edits: [], conflicts: [] });
  // plugins/cards/docs/tasks/w3.md 搬家前在 tasks/：b.md 以前指 tasks/b.md（不存在），現在指 Cards 的 b.md；docs/tasks/b.md 也存在但不是它以前的意思。
  const w3 = '[a](a.md) 與 [舊的 b](../tasks/b.md)\n';
  const moved = rewrite('plugins/cards/docs/tasks/w3.md', w3, B_PLAN, bExists);
  assert.equal(moved.text, '[a](../../../../docs/tasks/a.md) 與 [舊的 b](../tasks/b.md)\n');
  assert.deepEqual(moved.conflicts, []);
  const both = existing([...B_FILES, 'docs/x.md', 'plugins/cards/docs/x.md']);
  const conflict = rewrite('docs/tasks/a.md', '[x](../x.md)\n', { ...mapper([['tasks/a.md', 'docs/tasks/a.md'], ['x.md', 'plugins/cards/docs/x.md']]) }, both);
  assert.deepEqual(conflict.edits, []);
  assert.deepEqual(conflict.conflicts, [{ line: 1, link: '../x.md', here: 'docs/x.md', before: 'plugins/cards/docs/x.md' }]);
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
