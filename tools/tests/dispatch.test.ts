// 分派表（tasks/one-repo-step-1.md §2 與驗收第 1 項；第二步 §A3 的例子）：每個例子一個案例，--staged 與 --range 都測，
// 每一案斷言所有對象的跑法（含該跳過的）與相關測試選到的檔。Cards 的路徑照 CARDS 組，搬家前後是同一份案例。
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile, execFileSync } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, posix } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { CARDS, RULES, entryTools, relatedTests, relativeImports } from '../dispatch.ts';

const run = promisify(execFile);
const DISPATCH = fileURLToPath(new URL('../dispatch.ts', import.meta.url));
const ROOT = fileURLToPath(new URL('../..', import.meta.url));
/** Cards 資料夾的前綴：搬家前是空字串，搬家後是 plugins/cards/。 */
const C = CARDS === '.' ? '' : CARDS + '/';
const moved = C !== '';

type Run = 'full' | 'related';
type Runs = { tools?: Run; cards?: Run; capture?: 'full'; mindboard?: 'full'; tests?: string[]; toolsTests?: string[] };
interface Result { blocked: string[]; targets: Record<'tools' | 'cards' | 'capture' | 'mindboard', { run: string; tests: string[] }> }

// 本 repo 的文件路徑用拼接寫：這份測試不讀那些文件，字面寫出來會被分派表當成它們的「相關測試」，改文件時白跑這份。
const SYNTAX = 'docs/' + 'syntax.md';
const DECISIONS = 'docs/' + 'decisions.md';
const ENGLISH = 'docs/card-rules/' + 'english.md';
const PRODUCT = 'docs/' + 'product.md';
const SKILL = '.claude/skills/code-quality/' + 'SKILL.md';

/** 基準 repo 的檔案：每一類路徑都有；測試檔寫到幾個文件的路徑（模擬 Cards 與共用工具讀文件的測試）。 */
const BASE: Record<string, string> = {
  [`${C}src/core/files.ts`]: 'export {};\n',
  [`${C}src/a.ts`]: 'export {};\n',
  // 嵌進 main.js 的規則檔路徑寫在 rules.ts（ai-rules 的特例），寫的是 repo 根算的路徑。
  [`${C}src/core/ai/rules.ts`]: `export const files = ['${ENGLISH}'];\n`,
  [`${C}tests/syntax-a.test.ts`]: `new URL('../${SYNTAX}', import.meta.url);\n`,
  [`${C}tests/nested/syntax-b.test.ts`]: `readFile('${SYNTAX}');\n`,
  [`${C}tests/deck.test.ts`]: `'../${ENGLISH}';\n`,
  // 經過 helper 讀規格（§A3：ai-add-move、ai-add-old-version 經 tests/helpers/add-cases.ts 讀轉錄稿格式）。
  [`${C}tests/helpers/cases.ts`]: `export const spec = '${SYNTAX}';\n`,
  [`${C}tests/via-helper.test.ts`]: "import { spec } from './helpers/cases.ts';\nvoid spec;\n",
  // helper 寫到的路徑，不是測試檔本身（照原本 pre-commit 的 --include='*.test.ts'）。
  [`${C}tests/helper.ts`]: `'${PRODUCT}';\n`,
  [`${C}tools/build.mjs`]: '\n', [`${C}package-lock.json`]: '{}\n',
  'tools/check-docs.ts': '\n', 'tools/codex.ts': '\n', 'tools/package.json': '{}\n', 'tools/package-lock.json': '{}\n',
  'tools/check-local-paths.ts': '\n', 'tools/a.ts': 'export {};\n', 'tools/y.ts': '\n', 'tools/x.mjs': '\n',
  // 入口：hook 呼叫的程式與它 import 到的檔。
  'tools/hooks.ts': "import { dispatch } from './dispatch.ts';\n",
  'tools/dispatch.ts': "import { helper } from './a.ts';\n",
  'tools/ci-gate.ts': "import { dispatch } from './dispatch.ts';\n",
  'tools/tests/check-docs.test.ts': '\n',
  'tools/tests/decisions-index.test.ts': `new URL('../../${DECISIONS}', import.meta.url);\n`,
  '.githooks/pre-commit': 'exec node tools/hooks.ts pre-commit\n',
  '.githooks/commit-msg': 'node tools/check-local-paths.ts --message "$1"\n',
  '.github/workflows/check.yml': 'jobs:\n  plan:\n    steps:\n      - run: node tools/ci-gate.ts plan\n      - with:\n          cache-dependency-path: tools/package-lock.json\n',
  '.claude/hooks/cloud-setup.mjs': '\n', '.claude/settings.json': '{}\n',
  'experiments/tools/decisions-index.mjs': '\n',
  [SYNTAX]: '# S\n', [DECISIONS]: '# D\n', [ENGLISH]: '# E\n', [PRODUCT]: '# P\n',
  'NOTES.MD': '# N\n', [SKILL]: '# Q\n', '.gitignore': 'node_modules/\n',
  'plugins/capture/README.md': '# C\n', 'plugins/capture/package.json': '{ "scripts": { "check": "node -e 1" } }\n',
  // git mv 不建目的資料夾：搬到 plugins/capture/docs/ 的例子要它已經在。
  'plugins/capture/docs/backlog.md': '# B\n',
  'plugins/mindboard/docs/backlog.md': '# B\n',
  'plugins/mindboard/a.ts': 'export {};\n', 'plugins/mindboard/b.ts': 'export {};\n', 'plugins/mindboard/Case.ts': 'export {};\n',
  'plugins/mindboard/src/old.ts': 'export {};\n',
  ...(moved ? { [`${C}README.md`]: '# R\n', [`${C}NOTES.MD`]: '# N\n', [`${C}docs/x.md`]: '# X\n', [`${C}docs/${'syntax.md'}`]: '# S\n' } : {}),
};

async function setup(t: test.TestContext) {
  const root = await mkdtemp(join(tmpdir(), 'essence-dispatch-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const env = { ...process.env };
  for (const key of Object.keys(env)) if (key.toUpperCase().startsWith('GIT_')) delete env[key];
  const git = async (...args: string[]) => (await run('git', ['-c', 'user.name=DispatchTest', '-c', 'user.email=test@example.invalid', ...args], { cwd: root, env, encoding: 'utf8' })).stdout;
  /** 寫一個物件進 repo。內容從 stdin 給（input 會關上 stdin，git 才不會一直等輸入）。 */
  const hash = (text: string) => execFileSync('git', ['hash-object', '-w', '--stdin'], { cwd: root, env, input: text, encoding: 'utf8' }).trim();
  const put = async (path: string, text: string) => {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), text);
  };
  await git('init', '-q', '-b', 'main');
  await git('config', 'core.quotepath', 'true');
  for (const [path, text] of Object.entries(BASE)) await put(path, text);
  await git('add', '-A');
  await git('commit', '-q', '-m', 'base');
  const base = (await git('rev-parse', 'HEAD')).trim();
  const dispatch = async (...args: string[]) => {
    const { stdout } = await run(process.execPath, [DISPATCH, ...args], { cwd: root, env, encoding: 'utf8' });
    return JSON.parse(stdout) as Result;
  };
  return { root, git, put, hash, base, env, dispatch };
}

const expected = (runs: Runs) => ({
  tools: runs.tools ?? 'skip', cards: runs.cards ?? 'skip', capture: runs.capture ?? 'skip', mindboard: runs.mindboard ?? 'skip',
  tests: runs.tests ?? [], toolsTests: runs.toolsTests ?? [],
});
const actual = (result: Result) => ({
  tools: result.targets.tools.run, cards: result.targets.cards.run, capture: result.targets.capture.run, mindboard: result.targets.mindboard.run,
  tests: result.targets.cards.tests, toolsTests: result.targets.tools.tests,
});
const ALL: Runs = { tools: 'full', cards: 'full', capture: 'full', mindboard: 'full' };

type Env = Awaited<ReturnType<typeof setup>>;
interface Case {
  name: string;
  /** 先 commit 進基準的接線（例如 check.yml 已經直接跑某支工具），之後的改動才是這一案。 */
  prepare?: (e: Env) => Promise<void>;
  change: (e: Env) => Promise<void>;
  preCommit: Runs; ci: Runs; linuxOnly?: boolean;
}

const edit = (path: string) => async (e: Env) => {
  await e.put(path, `改了 ${path}\n`);
  await e.git('add', '--', path);
};
const wire = (path: string, text: string) => async (e: Env) => {
  await e.put(path, text);
  await e.git('add', '--', path);
  await e.git('commit', '-q', '-m', 'wire');
};

/** 文件類（第 9 條）：pre-commit 只跑寫到它的測試，CI 升成 Cards 與共用工具完整。 */
const DOC_CI: Runs = { cards: 'full', tools: 'full' };

const CASES: Case[] = [
  { name: '新增 plugins/mindboard/src/a.ts', change: edit('plugins/mindboard/src/a.ts'), preCommit: { mindboard: 'full' }, ci: { mindboard: 'full' } },
  { name: '改 plugins/mindboard/docs/backlog.md', change: edit('plugins/mindboard/docs/backlog.md'), preCommit: { mindboard: 'full' }, ci: { mindboard: 'full' } },
  {
    name: '改 plugins/capture/README.md，加新增 plugins/mindboard/src/a.ts',
    change: async e => { await edit('plugins/capture/README.md')(e); await edit('plugins/mindboard/src/a.ts')(e); },
    preCommit: { capture: 'full', mindboard: 'full' }, ci: { capture: 'full', mindboard: 'full' },
  },
  { name: `改 ${C}src/core/files.ts`, change: edit(`${C}src/core/files.ts`), preCommit: { cards: 'full' }, ci: { cards: 'full' } },
  { name: `改 ${C}tools/build.mjs`, change: edit(`${C}tools/build.mjs`), preCommit: { cards: 'full' }, ci: { cards: 'full' } },
  { name: `改 ${C}package-lock.json`, change: edit(`${C}package-lock.json`), preCommit: { cards: 'full' }, ci: { cards: 'full' } },
  // 第 7 條：其他共用工具只跑共用工具的完整檢查。
  ...['tools/check-docs.ts', 'tools/tests/check-docs.test.ts', 'tools/codex.ts', 'tools/package-lock.json', '.claude/hooks/cloud-setup.mjs', 'experiments/tools/decisions-index.mjs', '.claude/settings.json']
    .map((path): Case => ({ name: `改 ${path}`, change: edit(path), preCommit: { tools: 'full' }, ci: { tools: 'full' } })),
  // 第 6 條：決定檢查怎麼啟動、怎麼跑的，全部跑。
  ...['tools/dispatch.ts', 'tools/hooks.ts', 'tools/ci-gate.ts', '.githooks/pre-commit', '.github/workflows/check.yml', '.gitignore', 'tools/package.json']
    .map((path): Case => ({ name: `改 ${path}`, change: edit(path), preCommit: ALL, ci: ALL })),
  { name: '改 tools/check-local-paths.ts（commit-msg 直接呼叫）', change: edit('tools/check-local-paths.ts'), preCommit: ALL, ci: ALL },
  { name: '改 tools/a.ts（dispatch.ts import 到）', change: edit('tools/a.ts'), preCommit: ALL, ci: ALL },
  {
    name: 'check.yml 的 cards job 已經直接跑 node tools/x.mjs，這次只改 tools/x.mjs',
    prepare: wire('.github/workflows/check.yml', 'jobs:\n  cards:\n    steps:\n      - run: node tools/x.mjs\n'),
    change: edit('tools/x.mjs'), preCommit: ALL, ci: ALL,
  },
  {
    name: '兩用：check.yml 的 cards job 也直接跑共用檢查 tools/check-docs.ts，這次只改它',
    prepare: wire('.github/workflows/check.yml', 'jobs:\n  cards:\n    defaults:\n      run:\n        working-directory: plugins/cards\n    steps:\n      - run: node ../../tools/check-docs.ts\n'),
    change: edit('tools/check-docs.ts'), preCommit: ALL, ci: ALL,
  },
  {
    name: '外掛的 scripts 直接跑 ../../tools/y.ts，這次只改 tools/y.ts',
    prepare: wire('plugins/capture/package.json', '{ "scripts": { "check": "node ../../tools/y.ts" } }\n'),
    change: edit('tools/y.ts'), preCommit: ALL, ci: ALL,
  },
  {
    name: `改 ${SYNTAX}（登錄表；經 helper 的測試也選）`, change: edit(SYNTAX),
    preCommit: { cards: 'related', capture: 'full', tests: ['tests/nested/syntax-b.test.ts', 'tests/syntax-a.test.ts', 'tests/via-helper.test.ts'] },
    ci: { cards: 'full', capture: 'full', tools: 'full' },
  },
  { name: `改 ${DECISIONS}`, change: edit(DECISIONS), preCommit: { tools: 'related', toolsTests: ['tests/decisions-index.test.ts'] }, ci: DOC_CI },
  {
    name: `改 ${ENGLISH}（rules.ts 表上的規則檔）`, change: edit(ENGLISH),
    preCommit: { cards: 'related', tests: ['tests/ai-rules.test.ts', 'tests/deck.test.ts'] }, ci: DOC_CI,
  },
  { name: `改 ${PRODUCT}（沒有測試寫到它）`, change: edit(PRODUCT), preCommit: {}, ci: DOC_CI },
  { name: '改根目錄的 NOTES.MD（大寫副檔名）', change: edit('NOTES.MD'), preCommit: {}, ci: DOC_CI },
  // 最上層的任務說明與討論稿：規劃文件的 commit 不跑完整檢查。
  { name: '改 tasks/x.md', change: edit('tasks/x.md'), preCommit: {}, ci: DOC_CI },
  { name: '改 Claude Codex Discussion/x.md（路徑有空白）', change: edit('Claude Codex Discussion/x.md'), preCommit: {}, ci: DOC_CI },
  { name: `改 ${SKILL}`, change: edit(SKILL), preCommit: {}, ci: DOC_CI },
  {
    name: `同一次改 ${C}src/core/files.ts、tools/check-docs.ts 與 ${SYNTAX}`,
    change: async e => { for (const path of [`${C}src/core/files.ts`, 'tools/check-docs.ts', SYNTAX]) await edit(path)(e); },
    preCommit: { tools: 'full', cards: 'full', capture: 'full' }, ci: { tools: 'full', cards: 'full', capture: 'full' },
  },
  // 搬家前根目錄的 package.json 是 Cards 的；搬家後根目錄新出現的設定是「以上都不是」。
  { name: '改根目錄的 package.json', change: edit('package.json'), preCommit: moved ? ALL : { cards: 'full' }, ci: moved ? ALL : { cards: 'full' } },
  { name: '改根目錄的 tsconfig.json', change: edit('tsconfig.json'), preCommit: moved ? ALL : { cards: 'full' }, ci: moved ? ALL : { cards: 'full' } },
  { name: '刪 plugins/mindboard/src/old.ts', change: async e => { await e.git('rm', '-q', '--', 'plugins/mindboard/src/old.ts'); }, preCommit: { mindboard: 'full' }, ci: { mindboard: 'full' } },
  {
    name: 'git mv plugins/mindboard/a.ts plugins/capture/a.ts', change: async e => { await e.git('mv', 'plugins/mindboard/a.ts', 'plugins/capture/a.ts'); },
    preCommit: { capture: 'full', mindboard: 'full' }, ci: { capture: 'full', mindboard: 'full' },
  },
  {
    name: `git mv ${C}src/a.ts plugins/mindboard/moved.ts`, change: async e => { await e.git('mv', `${C}src/a.ts`, 'plugins/mindboard/moved.ts'); },
    preCommit: { cards: 'full', mindboard: 'full' }, ci: { cards: 'full', mindboard: 'full' },
  },
  {
    name: '只差大小寫的改名 plugins/mindboard/Case.ts → case.ts', change: async e => { await e.git('mv', 'plugins/mindboard/Case.ts', 'plugins/mindboard/case.ts'); },
    preCommit: { mindboard: 'full' }, ci: { mindboard: 'full' },
  },
  {
    name: `${C}src/a.ts 從一般檔換成 symlink（型別變更）`,
    change: async e => { await e.git('update-index', '--cacheinfo', `120000,${e.hash('target.ts')},${C}src/a.ts`); },
    preCommit: { cards: 'full' }, ci: { cards: 'full' },
  },
  {
    name: 'git rm --cached plugins/mindboard/b.ts 並改 .gitignore',
    change: async e => { await e.git('rm', '-q', '--cached', '--', 'plugins/mindboard/b.ts'); await e.put('.gitignore', 'node_modules/\nplugins/mindboard/b.ts\n'); await e.git('add', '--', '.gitignore'); },
    preCommit: ALL, ci: ALL,
  },
  { name: '新增 plugins/whiteboard/a.ts', change: edit('plugins/whiteboard/a.ts'), preCommit: ALL, ci: ALL },
  { name: '新增 plugins/a.ts', change: edit('plugins/a.ts'), preCommit: ALL, ci: ALL },
  { name: '新增根目錄的 foo.config.js', change: edit('foo.config.js'), preCommit: ALL, ci: ALL },
  { name: '空 commit', change: async () => {}, preCommit: {}, ci: {} },
  { name: '檔名有中文與空白（core.quotepath=true）', change: edit('plugins/mindboard/docs/規畫 草稿.md'), preCommit: { mindboard: 'full' }, ci: { mindboard: 'full' } },
  { name: '檔名有換行', change: edit('plugins/mindboard/a\nb.ts'), preCommit: { mindboard: 'full' }, ci: { mindboard: 'full' }, linuxOnly: true },
  // 搬家後才有的路徑（§A3 的例子表；Cards 在 plugins/cards/ 才有意義）。
  ...(moved ? [
    {
      name: `改 ${C}docs/${'syntax.md'}（Cards 資料夾的文件，原路徑與去掉前綴的都比）`, change: edit(`${C}docs/${'syntax.md'}`),
      preCommit: { cards: 'related', tests: ['tests/nested/syntax-b.test.ts', 'tests/syntax-a.test.ts', 'tests/via-helper.test.ts'] }, ci: { cards: 'full' },
    },
    { name: `改 ${C}README.md（沒有測試寫到它）`, change: edit(`${C}README.md`), preCommit: {}, ci: { cards: 'full' } },
    { name: `改 ${C}NOTES.MD（大寫副檔名）`, change: edit(`${C}NOTES.MD`), preCommit: {}, ci: { cards: 'full' } },
    {
      name: `git mv tools/a.ts ${C}tools/a.ts`, change: async (e: Env) => { await e.git('mv', 'tools/a.ts', `${C}tools/a.ts`); },
      // tools/a.ts 是 dispatch.ts import 到的入口：舊路徑算第 6 條。
      preCommit: ALL, ci: ALL,
    },
    {
      name: `git mv tools/codex.ts ${C}tools/codex.ts`, change: async (e: Env) => { await e.git('mv', 'tools/codex.ts', `${C}tools/codex.ts`); },
      preCommit: { tools: 'full', cards: 'full' }, ci: { tools: 'full', cards: 'full' },
    },
    {
      name: `git mv ${C}docs/x.md plugins/capture/docs/x.md`, change: async (e: Env) => { await e.git('mv', `${C}docs/x.md`, 'plugins/capture/docs/x.md'); },
      preCommit: { capture: 'full' }, ci: { cards: 'full', capture: 'full' },
    },
  ] satisfies Case[] : []),
];

for (const c of CASES) {
  void test(`§A3 分派表：${c.name}`, { skip: c.linuxOnly && process.platform === 'win32' ? 'Windows 的檔名不能有換行' : false }, async t => {
    const e = await setup(t);
    await c.prepare?.(e);
    const base = (await e.git('rev-parse', 'HEAD')).trim();
    await c.change(e);
    // pre-commit：暫存區；分派表的結果加起來，完整蓋過相關測試。
    assert.deepEqual(actual(await e.dispatch('--staged')), expected(c.preCommit), 'pre-commit（--staged）');
    await e.git('commit', '-q', '--allow-empty', '-m', 'case');
    // 同一個改動用兩棵樹比：不加 --ci 和暫存區一樣，加 --ci 是 CI 的跑法。
    assert.deepEqual(actual(await e.dispatch('--range', base, 'HEAD')), expected(c.preCommit), '--range');
    assert.deepEqual(actual(await e.dispatch('--range', base, 'HEAD', '--ci')), expected(c.ci), 'CI（--range --ci）');
  });
}

void test('§2 分派表：新增子模組擋下，--staged 與 --range 都非零結束', async t => {
  const e = await setup(t);
  await e.git('update-index', '--add', '--cacheinfo', `160000,${e.base},vendor/sub`);
  await assert.rejects(e.dispatch('--staged'), (error: { code?: number; stdout?: string }) => {
    assert.equal(error.code, 1);
    assert.deepEqual((JSON.parse(error.stdout ?? '') as Result).blocked, ['vendor/sub']);
    return true;
  });
  await e.git('commit', '-q', '-m', 'submodule');
  await assert.rejects(e.dispatch('--range', e.base, 'HEAD', '--ci'), { code: 1 });
});

void test('§2 分派表：Git 讀取失敗（不存在的端點）非零結束，不當成沒有改動', async t => {
  const e = await setup(t);
  await assert.rejects(e.dispatch('--range', 'no-such-ref', 'HEAD'), (error: { code?: number; stderr?: string }) => {
    assert.equal(error.code, 2);
    assert.match(error.stderr ?? '', /不能當成沒有改動/);
    return true;
  });
});

void test('§2 分派表：合併 commit 用兩棵樹比（第一個 parent 對合併的結果），不是 combined diff', async t => {
  const e = await setup(t);
  await e.git('checkout', '-q', '-b', 'feature');
  await edit(`${C}src/core/files.ts`)(e);
  await e.git('commit', '-q', '-m', 'feature');
  await e.git('checkout', '-q', 'main');
  await edit('plugins/mindboard/docs/backlog.md')(e);
  await e.git('commit', '-q', '-m', 'main');
  await e.git('merge', '-q', '--no-ff', '-m', 'merge', 'feature');
  // 第一個 parent 已經有 Mindboard 的改動，合併帶進來的只有 Cards。
  assert.deepEqual(actual(await e.dispatch('--range', 'HEAD^1', 'HEAD')), expected({ cards: 'full' }));
  assert.deepEqual(actual(await e.dispatch('--range', e.base, 'HEAD')), expected({ cards: 'full', mindboard: 'full' }));
});

void test('§2 分派表：第一個 commit（還沒有 HEAD）的暫存區照常分派', async t => {
  const root = await mkdtemp(join(tmpdir(), 'essence-dispatch-first-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const env = { ...process.env };
  for (const key of Object.keys(env)) if (key.toUpperCase().startsWith('GIT_')) delete env[key];
  await run('git', ['init', '-q'], { cwd: root, env });
  await mkdir(join(root, 'plugins/mindboard'), { recursive: true });
  await writeFile(join(root, 'plugins/mindboard/a.ts'), 'export {};\n');
  await run('git', ['add', '-A'], { cwd: root, env });
  const { stdout } = await run(process.execPath, [DISPATCH, '--staged'], { cwd: root, env, encoding: 'utf8' });
  assert.deepEqual(actual(JSON.parse(stdout) as Result), expected({ mindboard: 'full' }));
});

void test('§2 分派表：相關測試照這次比較的內容找（L2 R2）：暫存區不看工作樹的修改與新檔，--range 讀 head 的樹', async t => {
  const e = await setup(t);
  // 工作樹：寫到轉錄稿格式的測試改成沒寫到、規則檔改成不列 english.md、新加一個寫到決定紀錄的測試，都不 stage。
  await e.put(`${C}tests/syntax-a.test.ts`, 'export {};\n');
  await e.put(`${C}src/core/ai/rules.ts`, 'export const files = [];\n');
  await e.put(`${C}tests/unstaged.test.ts`, `'${DECISIONS}';\n`);
  for (const path of [SYNTAX, DECISIONS, ENGLISH]) await edit(path)(e);
  const tests = ['tests/ai-rules.test.ts', 'tests/deck.test.ts', 'tests/nested/syntax-b.test.ts', 'tests/syntax-a.test.ts', 'tests/via-helper.test.ts'];
  assert.deepEqual((await e.dispatch('--staged')).targets.cards.tests, tests, '--staged');
  await e.git('commit', '-q', '-m', 'docs');
  assert.deepEqual((await e.dispatch('--range', e.base, 'HEAD')).targets.cards.tests, tests, '--range');
  // 反過來：head 的樹裡沒寫到（測試的修改先 commit 了），工作樹裡寫到也不選。
  await e.git('add', '--', `${C}tests/syntax-a.test.ts`);
  await e.git('commit', '-q', '-m', 'stub');
  const stub = (await e.git('rev-parse', 'HEAD')).trim();
  await e.put(SYNTAX, '# S\n\n再改一次\n');
  await e.git('add', '--', SYNTAX);
  await e.git('commit', '-q', '-m', 'syntax again');
  await e.put(`${C}tests/syntax-a.test.ts`, `'${SYNTAX}';\n`);
  assert.deepEqual((await e.dispatch('--range', stub, 'HEAD')).targets.cards.tests, ['tests/nested/syntax-b.test.ts', 'tests/via-helper.test.ts'], '--range 讀 head 的樹');
});

void test('§A3 分派表：本 repo 的相關測試照實際搜尋找得到（文件的測試、規則檔的特例、經 helper 的測試）', () => {
  const cards = (path: string) => relatedTests(ROOT, { kind: 'staged' }, 'cards', [path]);
  const tools = (path: string) => relatedTests(ROOT, { kind: 'staged' }, 'tools', [path]);
  assert.ok(tools(DECISIONS).includes('tests/decisions-index.test.ts'));
  const english = cards(ENGLISH);
  assert.ok(english.includes('tests/deck.test.ts') && english.includes('tests/ai-rules.test.ts'), english.join(' '));
  // tests/helpers/add-cases.ts 讀轉錄稿格式，ai-add-move、ai-add-old-version 經由它讀（Codex 第一輪對 de3438f 實測漏選）。
  const syntax = cards(SYNTAX);
  for (const name of ['tests/ai-add-move.test.ts', 'tests/ai-add-old-version.test.ts']) assert.ok(syntax.includes(name), name + '：' + syntax.join(' '));
  // 這份測試自己不算：路徑用拼接寫。
  for (const path of [SYNTAX, DECISIONS, ENGLISH, PRODUCT, SKILL]) assert.ok(!tools(path).includes('tests/dispatch.test.ts'), path);
  assert.deepEqual(cards(PRODUCT), []);
});

/** 從 hook、check.yml、外掛 scripts 照字面取 tools/ 檔，import 用 TypeScript 自己的 preProcessFile 往下找（和 dispatch 的正規式分開算）。 */
async function independentEntries(): Promise<Set<string>> {
  const found = new Set(['tools/dispatch.ts', 'tools/hooks.ts', 'tools/ci-gate.ts']);
  const literal = (text: string, base: string | undefined) => {
    for (const match of text.matchAll(/((?:\.\.\/)*tools\/[\w./-]+\.(?:ts|mts|mjs|cjs|js))\b/g)) {
      const path = base === undefined ? posix.normalize(match[1].replace(/^(\.\.\/)+/, '')) : posix.normalize(posix.join(base, match[1]));
      if (path.startsWith('tools/')) found.add(path);
    }
  };
  for (const name of await readdir(join(ROOT, '.githooks'))) literal(await readFile(join(ROOT, '.githooks', name), 'utf8'), '.');
  literal(await readFile(join(ROOT, '.github/workflows/check.yml'), 'utf8'), undefined);
  for (const plugin of await readdir(join(ROOT, 'plugins'))) {
    let pkg: { scripts?: Record<string, string> };
    try { pkg = JSON.parse(await readFile(join(ROOT, 'plugins', plugin, 'package.json'), 'utf8')) as typeof pkg; } catch { continue; }
    for (const script of Object.values(pkg.scripts ?? {})) literal(script, `plugins/${plugin}`);
  }
  const queue = [...found];
  while (queue.length) {
    const file = queue.pop()!;
    let text: string;
    try { text = await readFile(join(ROOT, file), 'utf8'); } catch { continue; }
    for (const { fileName } of ts.preProcessFile(text, true, true).importedFiles) {
      if (!fileName.startsWith('.')) continue;
      const target = posix.normalize(posix.join(posix.dirname(file), fileName));
      if (target.startsWith('tools/') && !found.has(target)) { found.add(target); queue.push(target); }
    }
  }
  return found;
}

void test('§A3 分派表：本 repo 的檢查入口（hook、check.yml、外掛 scripts 寫到的 tools/ 檔與它們 import 到的）都命中第 6 條', async () => {
  const independent = await independentEntries();
  const entries = entryTools(ROOT, { kind: 'staged' });
  const rule6 = RULES.find(rule => rule.id === 6)!;
  for (const path of independent) {
    assert.ok(entries.has(path), `${path} 是入口，分派表沒算到`);
    const hit = RULES.find(rule => rule.matches(path, { status: 'M', path, oldMode: '100644', newMode: '100644' }, { entries: () => entries }));
    assert.equal(hit, rule6, `${path} 應命中第 6 條，實際是第 ${hit?.id} 條`);
  }
  // 2026-11-19 的實況（§A3）：入口有這幾支；check-docs、白板、codex 等落第 7 條。
  for (const path of ['tools/hooks.ts', 'tools/dispatch.ts', 'tools/ci-gate.ts', 'tools/check-local-paths.ts']) assert.ok(entries.has(path), path);
  for (const path of ['tools/check-docs.ts', 'tools/progress-board.ts', 'tools/roadmap-board.ts', 'tools/codex.ts']) assert.ok(!entries.has(path), path);
});

void test('§A3 分派表：import 的正規式和 TypeScript 的 preProcessFile 取到的一樣（tools/ 與 helper 的每個檔）', async () => {
  const files: string[] = [];
  for (const name of await readdir(join(ROOT, 'tools'))) if (/\.(ts|mjs)$/.test(name)) files.push(join(ROOT, 'tools', name));
  for (const dir of [join(ROOT, 'tools/tests'), join(ROOT, C, 'tests/helpers')]) {
    for (const name of await readdir(dir)) if (/\.(ts|mjs)$/.test(name)) files.push(join(dir, name));
  }
  for (const file of files) {
    const text = await readFile(file, 'utf8');
    const expectedImports = [...new Set(ts.preProcessFile(text, true, true).importedFiles.map(f => f.fileName).filter(name => name.startsWith('./') || name.startsWith('../')))].sort();
    assert.deepEqual([...relativeImports(text)].sort(), expectedImports, file);
  }
});
