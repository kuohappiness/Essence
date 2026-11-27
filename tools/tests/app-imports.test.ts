// 外掛之間不 import（tasks/one-repo-step-1.md §6）：擋的與放行的寫法，工作樹與暫存區兩種讀法。
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile, execFileSync } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EXCEPTIONS, checkLayout, checkLink, checkPackage, checkPaths, checkSource, checkText, checkUsers } from '../check-app-imports.ts';
import { FOLDERS, PACKAGES } from '../apps.ts';
import { PACKAGE_USERS } from '../dispatch.ts';

const run = promisify(execFile);
const CHECK = fileURLToPath(new URL('../check-app-imports.ts', import.meta.url));

const blocked = (path: string, code: string) => assert.equal(checkSource(path, code).length, 1, `${path}: ${code}`);
const allowed = (path: string, code: string) => assert.deepEqual(checkSource(path, code), [], `${path}: ${code}`);

void test('§6 外掛的程式跑出自己的資料夾就擋：相對路徑、多行 export、import = require、require、import()、模板字面值', () => {
  const from = 'apps/Mindboard/src/a.ts';
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

void test('§6 根目錄 src/、tests/、tools/ 的程式進到 apps/ 就擋', () => {
  blocked('src/main.ts', "import { x } from '../apps/Mindboard/a.ts';");
  blocked('tests/x.test.ts', "void import('../apps/Capture/a.ts');");
  blocked('tools/x.ts', "export * from '../apps/Mindboard/src/index.ts';");
  // D-218 驗收第 9 項：軟體之間也擋。
  blocked('apps/Capture/src/a.ts', "import { x } from '../../Cards/src/core/files.ts';");
});

void test('§6 放行：註解與字串裡的、外掛裡互相引用、套件名稱、node:、共用工具的測試', () => {
  const from = 'apps/Mindboard/src/a.ts';
  allowed(from, "// import '../../../src/a.ts';\n/* require('../../capture/x') */\nconst s = \"import '../../../src/a.ts'\";");
  allowed(from, "import { b } from './b.ts';\nimport { c } from '../lib/c.ts';\nimport '..';");
  allowed(from, "import React from 'react';\nimport { readFile } from 'node:fs/promises';\nimport x from 'https://example.invalid/x.js';");
  allowed('tests/check-docs.test.ts', "import { checkDocs } from '../tools/check-docs.ts';");
  allowed('src/main.ts', "import { x } from './core/files.ts';");
  // 不在範圍的資料夾（試作場）不查。
  allowed('experiments/t4/a.ts', "import '../../apps/Mindboard/a.ts';");
});

async function repo(t: test.TestContext, files: Record<string, string>) {
  const root = await mkdtemp(join(tmpdir(), 'essence-app-imports-'));
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
    'apps/Mindboard/package.json': '{\n  "name": "essence-mindboard",\n  "dependencies": {\n    "x": "file:../capture",\n    "y": "file:./vendor/y",\n    "react": "^19.0.0"\n  }\n}\n',
    'apps/Mindboard/src/a.ts': "import { b } from './b.ts';\n",
    'apps/Mindboard/src/b.ts': 'export const b = 1;\n',
  });
  // symlink 直接寫進索引：Windows 沒開 symlink 也能測。
  for (const [path, target] of [['apps/Mindboard/out', '../../src'], ['apps/Mindboard/in', 'src/a.ts']]) {
    const object = execFileSync('git', ['hash-object', '-w', '--stdin'], { cwd: r.root, env: r.env, input: target, encoding: 'utf8' }).trim();
    await r.git('update-index', '--add', '--cacheinfo', `120000,${object},${path}`);
  }
  await assert.rejects(r.check('--staged'), (error: { code?: number; stderr?: string }) => {
    assert.equal(error.code, 1);
    const lines = (error.stderr ?? '').split('\n').filter(line => line.startsWith('apps/'));
    assert.deepEqual(lines.map(line => line.split('  ').slice(0, 2).join('  ')), [
      'apps/Mindboard/out:1  ../../src',
      'apps/Mindboard/package.json:4  file:../capture',
    ]);
    return true;
  });
});

// npm（npm-package-arg）把 ~/ 展開成家目錄；file: 不分大小寫，沒有協定而以 . ~/ / \ 或磁碟代號開頭、或有兩個以上 / 的也當成
// 本機路徑；百分比編碼怎麼解隨版本不同。本機相依只接受外掛裡、只用英數與 . _ - / 的相對路徑。放行的寫法都和 npm 11.6.2 的解析對過
// （在外掛裡，或不是本機路徑）。
void test('§6 外掛 package.json 的本機相依只接受外掛裡的相對路徑（L2 R6）：npm 會解到外掛外的寫法都擋', () => {
  const check = (spec: string) => checkPackage('apps/Mindboard/package.json', JSON.stringify({ name: 'essence-mindboard', dependencies: { x: spec } }, null, 2));
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

void test('套件（docs/tasks/ai-client.md〈8〉）：程式、symlink、本機相依跑出自己的資料夾就擋，套件裡互相引用放行', () => {
  const from = 'packages/ai-client/src/a.ts';
  for (const code of [
    "import '../../../apps/Cards/src/a.ts';",
    "import { x } from '../../other/src/x.ts';",
    "import { checkDocs } from '../../../tools/check-docs.ts';",
    "void import('../../../src/' + name);",
  ]) blocked(from, code);
  allowed(from, "import { b } from './b.ts';\nimport { d } from './dialects/index.ts';\nimport { readFile } from 'node:fs/promises';");
  allowed('packages/ai-client/tools/smoke.ts', "import { createAiClient } from '../src/index.ts';");
  allowed('packages/ai-client/tests/a.test.ts', "import { mockFetch } from '../src/testing.ts';");
  assert.match(checkSource(from, "import '../../other/a.ts';")[0].reason, /跑出 packages\/ai-client\//);
  assert.equal(checkLink('packages/ai-client/out', '../../apps/Cards').length, 1);
  assert.deepEqual(checkLink('packages/ai-client/in', 'src/index.ts'), []);
  const pkg = (spec: string) => checkPackage('packages/ai-client/package.json', JSON.stringify({ name: 'essence-ai-client', devDependencies: { x: spec } }, null, 2));
  assert.equal(pkg('file:../other').length, 1);
  assert.equal(pkg('file:../../apps/Cards').length, 1);
  assert.deepEqual(pkg('^5.9.3'), []);
});

void test('套件的入口（docs/tasks/ai-client.md〈8〉第三步）：只有 PACKAGE_USERS 上的轉接檔能 import 主入口，軟體的測試另准 testing 入口', () => {
  assert.deepEqual(PACKAGE_USERS, { 'ai-client': { cards: 'src/core/connect/client.ts' } });
  const adapter = 'apps/Cards/src/core/connect/client.ts';
  allowed(adapter, "export { createAiClient } from '../../../../../packages/ai-client/src/index.ts';");
  allowed(adapter, "import type { AiClient } from '../../../../../packages/ai-client/src/index.ts';");
  allowed('apps/Cards/tests/a.test.ts', "import { mockFetch } from '../../../packages/ai-client/src/testing.ts';");
  allowed('apps/Cards/tests/helpers/ai.ts', "import { sse } from '../../../../packages/ai-client/src/testing.ts';");
  const reason = (path: string, code: string) => {
    const problems = checkSource(path, code);
    assert.equal(problems.length, 1, `${path}: ${code}`);
    return problems[0].reason;
  };
  const onlyAdapter = /只有轉接檔 apps\/Cards\/src\/core\/connect\/client\.ts 能 import packages\/ai-client\/src\/index\.ts；軟體的測試另准 import packages\/ai-client\/src\/testing\.ts/;
  // 轉接檔以外的檔、轉接檔指到入口以外的檔、測試指到主入口、軟體的工具指到 testing 入口。
  assert.match(reason('apps/Cards/src/core/ai/prompt.ts', "import { createAiClient } from '../../../../../packages/ai-client/src/index.ts';"), onlyAdapter);
  assert.match(reason('apps/Cards/src/obsidian/settings.ts', "import type { AiClient } from '../../../../packages/ai-client/src/index.ts';"), onlyAdapter);
  assert.match(reason(adapter, "import '../../../../../packages/ai-client/src/client.ts';"), onlyAdapter);
  assert.match(reason(adapter, "import '../../../../../packages/ai-client/catalog.json';"), onlyAdapter);
  assert.match(reason(adapter, "import { mockFetch } from '../../../../../packages/ai-client/src/testing.ts';"), onlyAdapter);
  assert.match(reason('apps/Cards/tests/a.test.ts', "import { createAiClient } from '../../../packages/ai-client/src/index.ts';"), onlyAdapter);
  assert.match(reason('apps/Cards/tools/x.ts', "import { mockFetch } from '../../../packages/ai-client/src/testing.ts';"), onlyAdapter);
  // 不在表上的軟體：主入口、testing 入口都擋，說要先登記。
  const notListed = /apps\/Mindboard 不在 tools\/dispatch\.ts 的 PACKAGE_USERS：要用 packages\/ai-client 先登記轉接檔/;
  assert.match(reason('apps/Mindboard/src/a.ts', "import { createAiClient } from '../../../packages/ai-client/src/index.ts';"), notListed);
  assert.match(reason('apps/Mindboard/tests/a.test.ts', "import { mockFetch } from '../../../packages/ai-client/src/testing.ts';"), notListed);
  // 套件以外跑出去的照舊。
  assert.match(reason(adapter, "import '../../../../Capture/src/a.ts';"), /跑出 apps\/Cards\//);
});

void test('套件的轉接檔和表一致（docs/tasks/ai-client.md〈8〉第三步）：表上的轉接檔不在、沒有 import 主入口都擋', () => {
  const entry = 'packages/ai-client/src/index.ts';
  const adapter = 'apps/Cards/src/core/connect/client.ts';
  assert.deepEqual(checkUsers(new Map([[adapter, [entry, 'apps/Cards/src/core/connect/index.ts']]])), []);
  const missing = checkUsers(new Map([['apps/Cards/src/core/ai/index.ts', ['apps/Cards/src/core/ai/prompt.ts']]]));
  assert.equal(missing.length, 1);
  assert.equal(missing[0].file, adapter);
  assert.match(missing[0].reason, /tools\/dispatch\.ts 的 PACKAGE_USERS 寫 cards 用 ai-client、轉接檔是這個檔，但這個檔不在/);
  const unused = checkUsers(new Map([[adapter, ['apps/Cards/src/core/ai/prompt.ts']]]));
  assert.equal(unused.length, 1);
  assert.match(unused[0].reason, /但這個檔沒有 import packages\/ai-client\/src\/index\.ts/);
});

void test('套件的轉接檔和表一致：有表的 repo 才查，轉接檔不在就擋、在而且 import 了主入口就過（工作樹與暫存區）', async t => {
  const adapter = 'apps/Cards/src/core/connect/client.ts';
  const r = await repo(t, { 'tools/dispatch.ts': 'export {};\n', 'apps/Cards/src/a.ts': 'export const a = 1;\n' });
  for (const args of [[], ['--staged']]) {
    await assert.rejects(r.check(...args), (error: { stderr?: string }) => {
      assert.match(error.stderr ?? '', new RegExp(`${adapter.replaceAll('/', '\\/').replaceAll('.', '\\.')}:1  PACKAGE_USERS  .*這個檔不在`));
      return true;
    }, args.join(' '));
  }
  await mkdir(join(r.root, dirname(adapter)), { recursive: true });
  await writeFile(join(r.root, adapter), "export { createAiClient } from '../../../../../packages/ai-client/src/index.ts';\n");
  await r.git('add', '--', adapter);
  for (const args of [[], ['--staged']]) await r.check(...args);
  // 沒有表的 repo（其他測試的暫存 repo）不查。
  const bare = await repo(t, { 'apps/Cards/src/a.ts': 'export const a = 1;\n' });
  await bare.check();
});

void test('套件的資料夾：表外的、packages/ 底下直接放檔、Packages/、大小寫不符都擋；表上的放行', () => {
  const one = (path: string, pattern: RegExp) => {
    const found = checkLayout([path]).map(p => p.reason);
    assert.equal(found.length, 1, `${path}: ${found.join(' / ')}`);
    assert.match(found[0], pattern, path);
  };
  one('packages/other/a.ts', /不在表上：packages\/ 底下的套件要先登記在 tools\/apps\.ts 的 PACKAGES/);
  one('packages/a.md', /不在表上/);
  one('Packages/ai-client/a.ts', /資料夾要恰好是 packages\/.*git mv Packages packages\.tmp，再 git mv packages\.tmp packages/);
  one('packages/AI-Client/src/a.ts', /大小寫和表上的 packages\/ai-client 不同/);
  assert.deepEqual(checkLayout(['packages/ai-client/src/a.ts', 'packages/ai-client/README.md', 'packages/ai-client/fixtures/x/case.json']), []);
});

void test('§6 --staged 讀暫存區：工作樹修好了、暫存區還壞著照樣擋；預設讀工作樹', async t => {
  const r = await repo(t, { 'apps/Capture/src/a.ts': "import '../../mindboard/a.ts';\n" });
  await writeFile(join(r.root, 'apps/Capture/src/a.ts'), "import './b.ts';\n");
  await assert.rejects(r.check('--staged'), { code: 1 });
  const { stdout } = await r.check();
  assert.match(stdout, /沒有互相 import，.*（工作樹）/);
});

// ---- D-218 §3：資料夾的表與大小寫 ----
// 寫錯的樣本（plugins/cards/a.ts、Apps/Cards/x.md、apps/portal/…）在 Windows 用 git add 做不出來（索引裡已有的資料夾會被對齊
// 大小寫），這裡直接把路徑清單餵給 checkLayout，或用 git update-index --cacheinfo 放進暫存 repo 的索引。這份測試因此在例外表上。
const REPO = fileURLToPath(new URL('../..', import.meta.url));
const reasons = (problems: { file: string; reason: string }[]) => problems.map(p => `${p.file}  ${p.reason}`);

void test('D-218 §3 第 1、2 點：表外的資料夾、plugins/、Apps/、大小寫不符、只有文件的軟體有程式都擋', () => {
  const one = (path: string, pattern: RegExp) => {
    const found = reasons(checkLayout([path]));
    assert.equal(found.length, 1, `${path}: ${found.join(' / ')}`);
    assert.match(found[0], pattern, path);
  };
  one('plugins/cards/a.ts', /改名後放 apps\/<軟體>\/（D-218）/);
  one('Plugins/x.md', /改名後放/);
  one('Apps/Cards/x.md', /資料夾要恰好是 apps\/.*git mv Apps apps\.tmp，再 git mv apps\.tmp apps/);
  one('APPS/Cards/x.md', /資料夾要恰好是 apps\//);
  one('apps/Other/a.ts', /不在表上/);
  one('apps/a.ts', /不在表上/);
  one('apps/portal/docs/a.md', /大小寫和表上的 apps\/Portal 不同.*git mv apps\/portal apps\/Portal\.tmp，再 git mv apps\/Portal\.tmp apps\/Portal/);
  one('apps/cards/src/a.ts', /大小寫和表上的 apps\/Cards 不同/);
  for (const path of ['apps/Portal/package.json', 'apps/Portal/src/a.ts', 'apps/Portal/index.html']) one(path, /標「只有文件」/);
  assert.deepEqual(checkLayout(['apps/Portal/docs/backlog.md', 'apps/Portal/docs/a.png', 'apps/Portal/README.md', 'apps/Cards/src/a.ts', 'apps/Capture/a.ts', 'docs/x.md', 'tools/x.ts']), []);
  // 同一個資料夾只報第一個檔。
  assert.equal(checkLayout(['plugins/cards/a.ts', 'plugins/cards/b.ts', 'apps/Other/a.ts', 'apps/Other/b.ts']).length, 2);
});

void test('D-218 §3 第 1 點：本 repo 追蹤的資料夾都在表上、大小寫和 git ls-files 相同；有程式的每一列都有追蹤的檔', () => {
  const tracked = execFileSync('git', ['-c', 'core.quotepath=false', 'ls-files', '-z'], { cwd: REPO, encoding: 'utf8', maxBuffer: 1 << 28 }).split('\0').filter(Boolean);
  assert.deepEqual(checkLayout(tracked), []);
  for (const dir of [...Object.values(FOLDERS), ...Object.values(PACKAGES)]) assert.ok(tracked.some(path => path.startsWith(dir + '/')), dir);
});

void test('D-218 §3 第 3 點：寫死的路徑大小寫不符、Markdown 以外的 plugins/<軟體>、組字串都擋；正規化後跳脫與反斜線也找得到', () => {
  const count = (path: string, text: string) => checkText(path, text).length;
  for (const text of [
    "const m = 'apps/cards/manifest.json';", 'const r = /^apps\\/cards\\//;', "join(root, 'apps\\\\cards')", 'Apps/Cards/x',
    'https://github.com/o/r/blob/main/apps/cards/a.md', 'apps/CAPTURE/x', 'apps/mindboard',
  ]) assert.equal(count('tools/x.ts', text), 1, text);
  assert.equal(count('.github/workflows/check.yml', '        working-directory: apps/cards\n'), 1);
  assert.equal(count('docs/x.md', '在 `apps/Cards/` 執行 `npm --prefix apps/cards run check`'), 1);
  assert.equal(count('.gitignore', '/apps/cards/main.js\n'), 1);
  for (const text of [
    'apps/Cards/src', 'const r = /^apps\\/Cards\\//;', 'apps/<軟體>/', 'apps/*/docs/', 'apps\\/([^/]+)', 'apps/Other/a.ts', 'myapps/cards', 'apps/cardsx',
  ]) assert.equal(count('tools/x.ts', text), 0, text);
  // plugins：Markdown 以外才查；vault 與 Obsidian 的寫法不算。
  for (const text of ["'plugins/cards/a.ts'", 'const r = /^plugins\\/x/;', "join(top, 'plugins/capture')", 'PLUGINS/MINDBOARD']) assert.equal(count('tools/x.ts', text), 1, text);
  for (const text of [
    "'.obsidian/plugins/essence-cards/data.json'", '/\\.obsidian\\/plugins\\/essence-cards\\/data\\.json/', "config + '/plugins/essence-cards'",
    "'.obsidian/community-plugins.json'", 'plugins: [desktopOnly(root)]', 'app.plugins.enablePlugin(id)',
  ]) assert.equal(count('tools/x.ts', text), 0, text);
  assert.equal(count('docs/backlog.md', '舊的 `plugins/cards/` 是紀錄'), 0);
  // 組字串：程式與 workflow 裡、表所在的檔以外都擋（L2 第一輪 R4、R5）。
  for (const text of [
    '`apps/${code}`', '`${root}/apps/${code}`', "join(root, 'apps')", 'join(root, "apps")', "const p = 'apps/';", "const p = './apps/';", "join(root, 'Apps')",
    "'../apps/' + code", "'../../apps/' + code", '`Apps/${code}`',
  ]) assert.equal(count('tools/x.ts', text), 1, text);
  assert.equal(count('.github/workflows/x.yml', "dir: 'apps/'"), 1);
  assert.equal(count('.githooks/pre-commit', 'cd "apps/${APP}"'), 1);
  // apps/${ 前面要是界線（第二輪 S1）。
  for (const text of ['`myapps/${x}`', '`webapps/${x}`', '`${base}/installed-apps/${id}`', '`x_apps/${a}`']) assert.equal(count('tools/x.ts', text), 0, text);
  assert.equal(count('tools/apps.ts', "export const APPS_ROOT = 'apps/';"), 0);
  for (const [path, text] of [['docs/x.md', '資料夾叫 "apps"'], ['tools/x.json', '{ "files": ["apps"] }'], ['docs/x.md', "'apps/'"]]) {
    assert.equal(count(path, text), 0, `${path} ${text}`);
  }
  // 行號照原文，前面有跳脫也一樣（L2 第一輪 R1）。
  assert.deepEqual(checkText('tools/x.ts', 'a\nb\n  apps/cards').map(p => p.line), [3]);
  assert.deepEqual(checkText('tools/x.ts', 'const r = /a\\.b\\\\c/;\nx\napps/cards').map(p => p.line), [3]);
  assert.deepEqual(checkText('tools/x.ts', "'a\\\\\\n'\napps/cards\n").map(p => p.line), [2]);
});

void test('D-218 §3 第 3 點：紀錄不查；例外表上的檔沒放行的寫法照擋，放行的用不到或檔不在了就報', () => {
  const SAMPLE: Record<string, string> = { plugins: "'plugins/cards/a.ts'", 大小寫: 'apps/cards', 組字串: "'apps/'" };
  const all = new Map([['tools/apps.ts', ''], ...EXCEPTIONS.map(e => [e.file, e.allow.map(rule => SAMPLE[rule]).join('\n')] as [string, string])]);
  assert.deepEqual(checkPaths(all), []);
  for (const path of ['docs/decisions.md', 'docs/tasks/x.md', 'docs/Claude Codex Discussion/x.md', 'docs/archive/x.md', 'apps/Cards/docs/tasks/x.md', 'apps/Cards/docs/archive/x.md']) {
    assert.deepEqual(checkPaths(new Map([...all, [path, 'apps/cards']])), [], path);
  }
  assert.equal(checkPaths(new Map([...all, ['docs/roadmap.md', 'apps/cards']])).length, 1);
  const [first] = EXCEPTIONS;
  assert.match(reasons(checkPaths(new Map([...all, [first.file, 'apps/Cards']]))).join('\n'), /放行的「plugins」這個檔已經用不到/);
  // 例外檔只放行列上的那幾種，其他寫法照擋（L2 第一輪 R3）。
  assert.ok(!first.allow.includes('大小寫'));
  const extra = reasons(checkPaths(new Map([...all, [first.file, `${SAMPLE.plugins}\napps/cards`]])));
  assert.equal(extra.length, 1);
  assert.match(extra[0], new RegExp(`^${first.file}  `));
  // 放行好幾條的列，只剩其中一條有命中時，其餘每一條都報用不到（第二輪 S3）。
  const multi = EXCEPTIONS.find(e => e.allow.length > 1);
  assert.ok(multi);
  const [kept, ...unused] = multi.allow;
  const stale = reasons(checkPaths(new Map([...all, [multi.file, SAMPLE[kept]]])));
  assert.deepEqual(stale.map(r => /放行的「(.+?)」/.exec(r)?.[1]).sort(), [...unused].sort());
  const gone = new Map(all);
  gone.delete(first.file);
  assert.match(reasons(checkPaths(gone)).join('\n'), new RegExp(`^${first.file}  例外表（.+）上的檔不在了`));
});

void test('D-218 驗收第 7、17 項：暫存 repo 的索引裡有 apps/portal/…、Apps/Cards/、plugins/cards/、只有文件的軟體有程式、組字串，各自報出來', async t => {
  const r = await repo(t, {
    'apps/Cards/src/a.ts': 'export const a = 1;\n',
    'apps/Portal/src/a.ts': 'export const p = 1;\n',
    'tools/x.ts': 'export const dir = (code: string) => `apps/${code}`;\n',
    'docs/x.md': '`npm --prefix apps/cards run check`\n',
  });
  for (const path of ['apps/portal/docs/a.md', 'Apps/Cards/x.md', 'plugins/cards/a.ts']) {
    const object = execFileSync('git', ['hash-object', '-w', '--stdin'], { cwd: r.root, env: r.env, input: 'x\n', encoding: 'utf8' }).trim();
    await r.git('update-index', '--add', '--cacheinfo', `100644,${object},${path}`);
  }
  await assert.rejects(r.check('--staged'), (error: { code?: number; stderr?: string }) => {
    assert.equal(error.code, 1);
    const files = (error.stderr ?? '').split('\n').filter(line => line.includes('  ')).map(line => line.split('  ')[0]);
    for (const file of ['Apps/Cards/x.md:1', 'apps/Portal/src/a.ts:1', 'apps/portal/docs/a.md:1', 'docs/x.md:1', 'plugins/cards/a.ts:1', 'tools/x.ts:1']) assert.ok(files.includes(file), `${file}：${files.join(' ')}`);
    assert.match(error.stderr ?? '', /git mv apps\/portal apps\/Portal\.tmp，再 git mv apps\/Portal\.tmp apps\/Portal/);
    return true;
  });
});

void test('D-218 驗收第 16 項：建置產物照 Linux 的規則（分大小寫）被 .gitignore 忽略', () => {
  for (const path of ['apps/Cards/main.js', 'apps/Cards/styles.css']) {
    execFileSync('git', ['-c', 'core.ignorecase=false', 'check-ignore', '-q', path], { cwd: REPO });
  }
});
