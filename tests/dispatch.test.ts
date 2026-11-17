// 分派表（tasks/one-repo-step-1.md §2 與驗收第 1 項）：§2 的例子每一列一個案例，--staged 與 --range 都測。
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile, execFileSync } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { relatedTests } from '../tools/dispatch.ts';

const run = promisify(execFile);
const DISPATCH = fileURLToPath(new URL('../tools/dispatch.ts', import.meta.url));
const ROOT = fileURLToPath(new URL('..', import.meta.url));

type Runs = { cards?: 'full' | 'related'; capture?: 'full'; mindboard?: 'full'; tests?: string[] };
interface Result { blocked: string[]; plugins: Record<'cards' | 'capture' | 'mindboard', { run: string; tests: string[] }> }

// 本 repo 的文件路徑用拼接寫：這份測試不讀那些文件，字面寫出來會被分派表當成它們的「相關測試」，改文件時白跑這份。
const SYNTAX = 'docs/' + 'syntax.md';
const DECISIONS = 'docs/' + 'decisions.md';
const ENGLISH = 'docs/card-rules/' + 'english.md';
const PRODUCT = 'docs/' + 'product.md';
const SKILL = '.claude/skills/code-quality/' + 'SKILL.md';

/** 基準 repo 的檔案：每一類路徑都有，測試檔寫到幾個文件的路徑（模擬 Cards 讀文件的測試）。 */
const BASE: Record<string, string> = {
  'src/core/files.ts': 'export {};\n',
  'src/a.ts': 'export {};\n',
  // 嵌進 main.js 的規則檔路徑寫在 rules.ts（ai-rules 的特例）。
  'src/core/ai/rules.ts': `export const files = ['${ENGLISH}'];\n`,
  'tests/syntax-a.test.ts': `new URL('../${SYNTAX}', import.meta.url);\n`,
  'tests/nested/syntax-b.test.ts': `readFile('${SYNTAX}');\n`,
  'tests/decisions-index.test.ts': `new URL('../${DECISIONS}', import.meta.url);\n`,
  'tests/deck.test.ts': `'../${ENGLISH}';\n`,
  'tests/helper.ts': `'${PRODUCT}';\n`,
  'tools/build.mjs': '\n', 'tools/check-docs.ts': '\n', 'tools/dispatch.ts': '\n', 'tools/package-lock.json': '{}\n',
  '.githooks/pre-commit': '\n', '.github/workflows/check.yml': '\n', 'experiments/tools/decisions-index.mjs': '\n',
  [SYNTAX]: '# S\n', [DECISIONS]: '# D\n', [ENGLISH]: '# E\n', [PRODUCT]: '# P\n',
  'NOTES.MD': '# N\n', [SKILL]: '# Q\n', '.gitignore': 'node_modules/\n',
  'plugins/capture/README.md': '# C\n', 'plugins/mindboard/docs/backlog.md': '# B\n',
  'plugins/mindboard/a.ts': 'export {};\n', 'plugins/mindboard/b.ts': 'export {};\n', 'plugins/mindboard/Case.ts': 'export {};\n',
  'plugins/mindboard/src/old.ts': 'export {};\n',
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
  cards: runs.cards ?? 'skip', capture: runs.capture ?? 'skip', mindboard: runs.mindboard ?? 'skip',
  tests: runs.tests ?? [],
});
const actual = (result: Result) => ({
  cards: result.plugins.cards.run, capture: result.plugins.capture.run, mindboard: result.plugins.mindboard.run,
  tests: result.plugins.cards.tests,
});
const ALL: Runs = { cards: 'full', capture: 'full', mindboard: 'full' };

type Env = Awaited<ReturnType<typeof setup>>;
interface Case { name: string; change: (e: Env) => Promise<void>; preCommit: Runs; ci: Runs; linuxOnly?: boolean }

const edit = (path: string) => async (e: Env) => {
  await e.put(path, `改了 ${path}\n`);
  await e.git('add', '--', path);
};

const CASES: Case[] = [
  { name: '新增 plugins/mindboard/src/a.ts', change: edit('plugins/mindboard/src/a.ts'), preCommit: { mindboard: 'full' }, ci: { mindboard: 'full' } },
  { name: '改 plugins/mindboard/docs/backlog.md', change: edit('plugins/mindboard/docs/backlog.md'), preCommit: { mindboard: 'full' }, ci: { mindboard: 'full' } },
  {
    name: '改 plugins/capture/README.md，加新增 plugins/mindboard/src/a.ts',
    change: async e => { await edit('plugins/capture/README.md')(e); await edit('plugins/mindboard/src/a.ts')(e); },
    preCommit: { capture: 'full', mindboard: 'full' }, ci: { capture: 'full', mindboard: 'full' },
  },
  { name: '改 src/core/files.ts', change: edit('src/core/files.ts'), preCommit: { cards: 'full' }, ci: { cards: 'full' } },
  { name: '改 tools/build.mjs', change: edit('tools/build.mjs'), preCommit: { cards: 'full' }, ci: { cards: 'full' } },
  ...['tools/check-docs.ts', 'tools/dispatch.ts', 'tools/package-lock.json', '.githooks/pre-commit', '.github/workflows/check.yml', 'experiments/tools/decisions-index.mjs']
    .map((path): Case => ({ name: `改 ${path}`, change: edit(path), preCommit: ALL, ci: ALL })),
  {
    name: `改 ${SYNTAX}`, change: edit(SYNTAX),
    preCommit: { cards: 'related', capture: 'full', tests: ['tests/nested/syntax-b.test.ts', 'tests/syntax-a.test.ts'] }, ci: { cards: 'full', capture: 'full' },
  },
  { name: `改 ${DECISIONS}`, change: edit(DECISIONS), preCommit: { cards: 'related', tests: ['tests/decisions-index.test.ts'] }, ci: { cards: 'full' } },
  {
    name: `改 ${ENGLISH}`, change: edit(ENGLISH),
    preCommit: { cards: 'related', tests: ['tests/ai-rules.test.ts', 'tests/deck.test.ts'] }, ci: { cards: 'full' },
  },
  // tests/helper.ts 寫到 product.md，但不是 *.test.ts（照原本 pre-commit 的 --include='*.test.ts'）。
  { name: `改 ${PRODUCT}（沒有測試寫到它）`, change: edit(PRODUCT), preCommit: {}, ci: { cards: 'full' } },
  { name: '改根目錄的 NOTES.MD（大寫副檔名）', change: edit('NOTES.MD'), preCommit: {}, ci: { cards: 'full' } },
  // 最上層的任務說明與討論稿（過渡期是 Cards 與跨外掛的）：和 docs/ 一樣，規劃文件的 commit 不跑三個外掛的完整檢查。
  { name: '改 tasks/x.md', change: edit('tasks/x.md'), preCommit: {}, ci: { cards: 'full' } },
  { name: '改 Claude Codex Discussion/x.md（路徑有空白）', change: edit('Claude Codex Discussion/x.md'), preCommit: {}, ci: { cards: 'full' } },
  { name: `改 ${SKILL}`, change: edit(SKILL), preCommit: {}, ci: { cards: 'full' } },
  { name: '刪 plugins/mindboard/src/old.ts', change: async e => { await e.git('rm', '-q', '--', 'plugins/mindboard/src/old.ts'); }, preCommit: { mindboard: 'full' }, ci: { mindboard: 'full' } },
  {
    name: 'git mv plugins/mindboard/a.ts plugins/capture/a.ts', change: async e => { await e.git('mv', 'plugins/mindboard/a.ts', 'plugins/capture/a.ts'); },
    preCommit: { capture: 'full', mindboard: 'full' }, ci: { capture: 'full', mindboard: 'full' },
  },
  {
    name: 'git mv src/a.ts plugins/mindboard/moved.ts', change: async e => { await e.git('mv', 'src/a.ts', 'plugins/mindboard/moved.ts'); },
    preCommit: { cards: 'full', mindboard: 'full' }, ci: { cards: 'full', mindboard: 'full' },
  },
  {
    name: '只差大小寫的改名 plugins/mindboard/Case.ts → case.ts', change: async e => { await e.git('mv', 'plugins/mindboard/Case.ts', 'plugins/mindboard/case.ts'); },
    preCommit: { mindboard: 'full' }, ci: { mindboard: 'full' },
  },
  {
    name: 'src/a.ts 從一般檔換成 symlink（型別變更）',
    change: async e => { await e.git('update-index', '--cacheinfo', `120000,${e.hash('target.ts')},src/a.ts`); },
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
];

for (const c of CASES) {
  void test(`§2 分派表：${c.name}`, { skip: c.linuxOnly && process.platform === 'win32' ? 'Windows 的檔名不能有換行' : false }, async t => {
    const e = await setup(t);
    await c.change(e);
    // pre-commit：暫存區；分派表的結果加起來，完整蓋過相關測試。
    assert.deepEqual(actual(await e.dispatch('--staged')), expected(c.preCommit), 'pre-commit（--staged）');
    await e.git('commit', '-q', '--allow-empty', '-m', 'case');
    // 同一個改動用兩棵樹比：不加 --ci 和暫存區一樣，加 --ci 是 CI 的跑法。
    assert.deepEqual(actual(await e.dispatch('--range', e.base, 'HEAD')), expected(c.preCommit), '--range');
    assert.deepEqual(actual(await e.dispatch('--range', e.base, 'HEAD', '--ci')), expected(c.ci), 'CI（--range --ci）');
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
  await edit('src/core/files.ts')(e);
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

void test('§2 分派表：本 repo 的相關測試照實際搜尋找得到（文件的測試、規則檔的特例）', () => {
  assert.ok(relatedTests(ROOT, [DECISIONS]).includes('tests/decisions-index.test.ts'));
  const english = relatedTests(ROOT, [ENGLISH]);
  assert.ok(english.includes('tests/deck.test.ts') && english.includes('tests/ai-rules.test.ts'), english.join(' '));
  // 這份測試自己不算：路徑用拼接寫。
  for (const path of [SYNTAX, DECISIONS, ENGLISH, PRODUCT, SKILL]) assert.ok(!relatedTests(ROOT, [path]).includes('tests/dispatch.test.ts'), path);
  assert.ok(relatedTests(ROOT, [SYNTAX]).length >= 1);
  assert.deepEqual(relatedTests(ROOT, [PRODUCT]), []);
});
