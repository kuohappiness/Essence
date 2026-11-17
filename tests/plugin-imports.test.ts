// 外掛之間不 import（tasks/one-repo-step-1.md §6）：擋的與放行的寫法，工作樹與暫存區兩種讀法。
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile, execFileSync } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkPackage, checkSource } from '../tools/check-plugin-imports.ts';

const run = promisify(execFile);
const CHECK = fileURLToPath(new URL('../tools/check-plugin-imports.ts', import.meta.url));

const blocked = (path: string, code: string) => assert.equal(checkSource(path, code).length, 1, `${path}: ${code}`);
const allowed = (path: string, code: string) => assert.deepEqual(checkSource(path, code), [], `${path}: ${code}`);

void test('§6 外掛的程式跑出自己的資料夾就擋：相對路徑、多行 export、import = require、require、import()、模板字面值', () => {
  const from = 'plugins/mindboard/src/a.ts';
  for (const code of [
    "import { x } from '../../../src/core/files.ts';",
    "import '../../capture/src/x.ts';",
    "import { checkDocs } from '../../../tools/check-docs.ts';",
    "export { a,\n  b } from '../../capture/b.ts';",
    "import x = require('../../../src/x');",
    "const x = require('../../capture/a.ts');",
    'void import(`../../capture/a.ts`);',
    // 執行時才組的路徑：取字面的前段，照前段判斷（偏嚴）。
    "void import('../../../src/' + name);",
  ]) blocked(from, code);
});

void test('§6 根目錄 src/、tests/、tools/ 的程式進到 plugins/ 就擋', () => {
  blocked('src/main.ts', "import { x } from '../plugins/mindboard/a.ts';");
  blocked('tests/x.test.ts', "void import('../plugins/capture/a.ts');");
  blocked('tools/x.ts', "export * from '../plugins/mindboard/src/index.ts';");
});

void test('§6 放行：註解與字串裡的、外掛裡互相引用、套件名稱、node:、共用工具的測試', () => {
  const from = 'plugins/mindboard/src/a.ts';
  allowed(from, "// import '../../../src/a.ts';\n/* require('../../capture/x') */\nconst s = \"import '../../../src/a.ts'\";");
  allowed(from, "import { b } from './b.ts';\nimport { c } from '../lib/c.ts';\nimport '..';");
  allowed(from, "import React from 'react';\nimport { readFile } from 'node:fs/promises';\nimport x from 'https://example.invalid/x.js';");
  allowed('tests/check-docs.test.ts', "import { checkDocs } from '../tools/check-docs.ts';");
  allowed('src/main.ts', "import { x } from './core/files.ts';");
  // 不在範圍的資料夾（試作場）不查。
  allowed('experiments/t4/a.ts', "import '../../plugins/mindboard/a.ts';");
});

async function repo(t: test.TestContext, files: Record<string, string>) {
  const root = await mkdtemp(join(tmpdir(), 'essence-plugin-imports-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const env = { ...process.env };
  for (const key of Object.keys(env)) if (key.toUpperCase().startsWith('GIT_')) delete env[key];
  const git = async (...args: string[]) => (await run('git', args, { cwd: root, env, encoding: 'utf8' })).stdout;
  await git('init', '-q');
  for (const [path, text] of Object.entries(files)) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), text);
  }
  if (Object.keys(files).length) await git('add', '--', ...Object.keys(files));
  const check = (...args: string[]) => run(process.execPath, [CHECK, ...args], { cwd: root, env, encoding: 'utf8' });
  return { root, env, git, check };
}

void test('§6 symlink 指到外掛外、package.json 的 file: 相依指到外掛外都擋；回報「檔案:行  目標  原因」', async t => {
  const r = await repo(t, {
    'plugins/mindboard/package.json': '{\n  "name": "essence-mindboard",\n  "dependencies": {\n    "x": "file:../capture",\n    "y": "file:./vendor/y",\n    "react": "^19.0.0"\n  }\n}\n',
    'plugins/mindboard/src/a.ts': "import { b } from './b.ts';\n",
    'plugins/mindboard/src/b.ts': 'export const b = 1;\n',
  });
  // symlink 直接寫進索引：Windows 沒開 symlink 也能測。
  for (const [path, target] of [['plugins/mindboard/out', '../../src'], ['plugins/mindboard/in', 'src/a.ts']]) {
    const object = execFileSync('git', ['hash-object', '-w', '--stdin'], { cwd: r.root, env: r.env, input: target, encoding: 'utf8' }).trim();
    await r.git('update-index', '--add', '--cacheinfo', `120000,${object},${path}`);
  }
  await assert.rejects(r.check('--staged'), (error: { code?: number; stderr?: string }) => {
    assert.equal(error.code, 1);
    const lines = (error.stderr ?? '').split('\n').filter(line => line.startsWith('plugins/'));
    assert.deepEqual(lines.map(line => line.split('  ').slice(0, 2).join('  ')), [
      'plugins/mindboard/out:1  ../../src',
      'plugins/mindboard/package.json:4  file:../capture',
    ]);
    return true;
  });
});

// npm（npm-package-arg）把 ~/ 展開成家目錄；file: 不分大小寫，沒有協定而以 . ~/ / \ 或磁碟代號開頭、或有兩個以上 / 的也當成
// 本機路徑；百分比編碼怎麼解隨版本不同。本機相依只接受外掛裡、只用英數與 . _ - / 的相對路徑。放行的寫法都和 npm 11.6.2 的解析對過
// （在外掛裡，或不是本機路徑）。
void test('§6 外掛 package.json 的本機相依只接受外掛裡的相對路徑（L2 R6）：npm 會解到外掛外的寫法都擋', () => {
  const check = (spec: string) => checkPackage('plugins/mindboard/package.json', JSON.stringify({ name: 'essence-mindboard', dependencies: { x: spec } }, null, 2));
  for (const spec of [
    'file:~/x', 'file:~', 'file:%2e%2e/%2e%2e/src', 'file:a%2F..%2F..%2F..', 'file:..\\..\\src', 'file:../capture', 'file:/abs', 'file:///abs', 'file:',
    'file:./a#b', 'FILE:../capture', 'File:~/x', 'link:../capture', 'LINK:~/x', 'git+file:///repo', 'GIT+FILE:../r',
    '../capture', '~/x', '~\\x', '/abs', '\\abs', 'C:/x', '..\\capture', './a/../../capture', 'lib/../../../src',
  ]) assert.equal(check(spec).length, 1, spec);
  for (const spec of [
    'file:./lib', 'file:lib/sub', 'link:./x', 'file:.', 'file:./a/../b', './lib', 'lib/sub/x',
    '^19.0.0', '~1.2.3', '>=1 <2', 'latest', 'npm:react@19', 'github:a/b', 'a/b', 'a/b#feature/x', 'https://example.invalid/x.tgz', 'git+https://example.invalid/r.git',
  ]) assert.deepEqual(check(spec), [], spec);
});

void test('§6 --staged 讀暫存區：工作樹修好了、暫存區還壞著照樣擋；預設讀工作樹', async t => {
  const r = await repo(t, { 'plugins/capture/src/a.ts': "import '../../mindboard/a.ts';\n" });
  await writeFile(join(r.root, 'plugins/capture/src/a.ts'), "import './b.ts';\n");
  await assert.rejects(r.check('--staged'), { code: 1 });
  const { stdout } = await r.check();
  assert.match(stdout, /沒有互相 import（工作樹）/);
});
