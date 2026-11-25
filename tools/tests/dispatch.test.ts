// 分派表（tasks/one-repo-step-1.md §2 與驗收第 1 項；第二步 §A3 的例子）：每個例子一個案例，--staged 與 --range 都測，
// 每一案斷言所有對象的跑法（含該跳過的）與相關測試選到的檔。Cards 的路徑照 CARDS 組，搬家前後是同一份案例。
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile, execFileSync } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';
import { dirname, join, posix, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { CARDS, RULES, entryTools, relatedTests, relativeImports, toolPaths } from '../dispatch.ts';
import { FOLDERS, PACKAGES } from '../apps.ts';

const run = promisify(execFile);
const DISPATCH = fileURLToPath(new URL('../dispatch.ts', import.meta.url));
const ROOT = fileURLToPath(new URL('../..', import.meta.url));
/** Cards 資料夾的前綴：搬家前是空字串，搬家後是 apps/Cards/。 */
const C = CARDS === '.' ? '' : CARDS + '/';
const moved = C !== '';

type Run = 'full' | 'related';
type Runs = { tools?: Run; cards?: Run; capture?: 'full'; mindboard?: 'full'; 'ai-client'?: 'full'; tests?: string[]; toolsTests?: string[] };
interface Result { blocked: string[]; targets: Record<'tools' | 'cards' | 'capture' | 'mindboard' | 'ai-client', { run: string; tests: string[] }> }

// 本 repo 的文件路徑用拼接寫：這份測試不讀那些文件，字面寫出來會被分派表當成它們的「相關測試」，改文件時白跑這份。
const SPEC = 'docs/' + 'transcript.md';
// 本 repo 裡 Cards 的文件（第二步 B 搬進 apps/Cards/docs/）；上面幾個是暫存 repo 的路徑。
const CARDS_SYNTAX = 'apps/Cards/docs/' + 'syntax.md';
const CARDS_ENGLISH = 'apps/Cards/docs/card-rules/' + 'english.md';
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
  [`${C}tests/syntax-a.test.ts`]: `new URL('../${SPEC}', import.meta.url);\n`,
  [`${C}tests/nested/syntax-b.test.ts`]: `readFile('${SPEC}');\n`,
  [`${C}tests/deck.test.ts`]: `'../${ENGLISH}';\n`,
  // Cards 自己的文件從自己的資料夾寫（第二步 B 之後從 ../docs/ 讀）。
  [`${C}tests/cards-doc.test.ts`]: `new URL('../docs/${'syntax.md'}', import.meta.url);\n`,
  // 經過 helper 讀規格（§A3：ai-add-move、ai-add-old-version 經 tests/helpers/add-cases.ts 讀轉錄稿格式）。
  [`${C}tests/helpers/cases.ts`]: `export const spec = '${SPEC}';\n`,
  [`${C}tests/via-helper.test.ts`]: "import { spec } from './helpers/cases.ts';\nvoid spec;\n",
  // helper 寫到的路徑，不是測試檔本身（照原本 pre-commit 的 --include='*.test.ts'）。
  [`${C}tests/helper.ts`]: `'${PRODUCT}';\n`,
  [`${C}tools/build.mjs`]: '\n', [`${C}package-lock.json`]: '{}\n',
  'tools/check-docs.ts': '\n', 'tools/codex.ts': '\n', 'tools/package.json': '{}\n', 'tools/package-lock.json': '{}\n',
  'tools/check-local-paths.ts': '\n', 'tools/a.ts': 'export {};\n', 'tools/y.ts': '\n', 'tools/x.mjs': '\n',
  'tools/new-entry.ts': '\n', 'tools/start.cjs': '\n', 'tools/worker.cjs': '\n', 'tools/start.cts': '\n', 'tools/worker.js': '\n',
  'tools/worker/index.js': '\n',
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
  [SPEC]: '# S\n', [DECISIONS]: '# D\n', [ENGLISH]: '# E\n', [PRODUCT]: '# P\n',
  'NOTES.MD': '# N\n', [SKILL]: '# Q\n', '.gitignore': 'node_modules/\n',
  'apps/Capture/README.md': '# C\n', 'apps/Capture/package.json': '{ "scripts": { "check": "node -e 1" } }\n',
  // git mv 不建目的資料夾：搬到 apps/Capture/docs/ 的例子要它已經在。
  'apps/Capture/docs/backlog.md': '# B\n',
  'apps/Mindboard/docs/backlog.md': '# B\n',
  'apps/Mindboard/a.ts': 'export {};\n', 'apps/Mindboard/b.ts': 'export {};\n', 'apps/Mindboard/Case.ts': 'export {};\n',
  'apps/Mindboard/src/old.ts': 'export {};\n',
  'packages/ai-client/README.md': '# A\n',
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
  'ai-client': runs['ai-client'] ?? 'skip',
  tests: runs.tests ?? [], toolsTests: runs.toolsTests ?? [],
});
const actual = (result: Result) => ({
  tools: result.targets.tools.run, cards: result.targets.cards.run, capture: result.targets.capture.run, mindboard: result.targets.mindboard.run,
  'ai-client': result.targets['ai-client'].run,
  tests: result.targets.cards.tests, toolsTests: result.targets.tools.tests,
});
const ALL: Runs = { tools: 'full', cards: 'full', capture: 'full', mindboard: 'full', 'ai-client': 'full' };

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
  { name: '新增 apps/Mindboard/src/a.ts', change: edit('apps/Mindboard/src/a.ts'), preCommit: { mindboard: 'full' }, ci: { mindboard: 'full' } },
  { name: '改 apps/Mindboard/docs/backlog.md', change: edit('apps/Mindboard/docs/backlog.md'), preCommit: { mindboard: 'full' }, ci: { mindboard: 'full' } },
  {
    name: '改 apps/Capture/README.md，加新增 apps/Mindboard/src/a.ts',
    change: async e => { await edit('apps/Capture/README.md')(e); await edit('apps/Mindboard/src/a.ts')(e); },
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
  // 第二步 L2 R3：接線已經在，只改下游的檔。
  {
    name: 'hooks.ts 在同一行的第二個敘述 import ./new-entry.ts，這次只改 tools/new-entry.ts',
    prepare: wire('tools/hooks.ts', "import { dispatch } from './dispatch.ts'; import './new-entry.ts';\n"),
    change: edit('tools/new-entry.ts'), preCommit: ALL, ci: ALL,
  },
  {
    // L2 第二輪：前面的字串裡有撇號，原本的引號計數把它當成沒關上的單引號。
    name: 'hooks.ts 同一行前面是 console.log("it\'s ready")、再 import ./new-entry.ts，這次只改 tools/new-entry.ts',
    prepare: wire('tools/hooks.ts', "import { dispatch } from './dispatch.ts';\nconsole.log(\"it's ready\"); import './new-entry.ts';\n"),
    change: edit('tools/new-entry.ts'), preCommit: ALL, ci: ALL,
  },
  {
    name: 'hook 跑 node tools/start.cjs、它 require(\'./worker.cjs\')，這次只改 tools/worker.cjs',
    prepare: async e => {
      await wire('tools/start.cjs', "const worker = require('./worker.cjs');\nworker.run();\n")(e);
      await wire('.githooks/pre-commit', 'exec node tools/hooks.ts pre-commit\nnode tools/start.cjs\n')(e);
    },
    change: edit('tools/worker.cjs'), preCommit: ALL, ci: ALL,
  },
  // L2 第二輪：Node 實際載入的檔。不寫副檔名的 require 照 Node 的順序找到 worker.js；hook 直接跑 .cts。
  {
    name: 'hook 跑 node tools/start.cjs、它 require(\'./worker\')（Node 載入 worker.js），這次只改 tools/worker.js',
    prepare: async e => {
      await wire('tools/start.cjs', "require('./worker');\n")(e);
      await wire('.githooks/pre-commit', 'exec node tools/hooks.ts pre-commit\nnode tools/start.cjs\n')(e);
    },
    change: edit('tools/worker.js'), preCommit: ALL, ci: ALL,
  },
  {
    name: 'hook 跑 node tools/start.cts、它 require(\'./worker.cjs\')，這次只改 tools/worker.cjs',
    prepare: async e => {
      await wire('tools/start.cts', "require('./worker.cjs');\n")(e);
      await wire('.githooks/pre-commit', 'exec node tools/hooks.ts pre-commit\nnode tools/start.cts\n')(e);
    },
    change: edit('tools/worker.cjs'), preCommit: ALL, ci: ALL,
  },
  // L2 第三輪 R9：正規表示式裡的引號。
  {
    name: 'hook 跑 node tools/start.cjs、它在正規表示式 /["\'].*["\']/ 之後 require(\'./worker.cjs\')，這次只改 tools/worker.cjs',
    prepare: async e => {
      await wire('tools/start.cjs', "const quoted = /[\"'].*[\"']/; const worker = require('./worker.cjs');\n")(e);
      await wire('.githooks/pre-commit', 'exec node tools/hooks.ts pre-commit\nnode tools/start.cjs\n')(e);
    },
    change: edit('tools/worker.cjs'), preCommit: ALL, ci: ALL,
  },
  // L2 第三輪 R10：資料夾結尾有斜線。
  {
    name: 'hook 跑 node tools/start.cjs、它 require(\'./worker/\')（Node 載入 worker/index.js），這次只改 tools/worker/index.js',
    prepare: async e => {
      await wire('tools/start.cjs', "require('./worker/');\n")(e);
      await wire('.githooks/pre-commit', 'exec node tools/hooks.ts pre-commit\nnode tools/start.cjs\n')(e);
    },
    change: edit('tools/worker/index.js'), preCommit: ALL, ci: ALL,
  },
  {
    name: 'hook 已經直接跑 node tools/start.cts，這次只改它',
    prepare: wire('.githooks/pre-commit', 'exec node tools/hooks.ts pre-commit\nnode tools/start.cts\n'),
    change: edit('tools/start.cts'), preCommit: ALL, ci: ALL,
  },
  {
    name: '兩用：check.yml 的 cards job 也直接跑共用檢查 tools/check-docs.ts，這次只改它',
    prepare: wire('.github/workflows/check.yml', 'jobs:\n  cards:\n    defaults:\n      run:\n        working-directory: apps/Cards\n    steps:\n      - run: node ../../tools/check-docs.ts\n'),
    change: edit('tools/check-docs.ts'), preCommit: ALL, ci: ALL,
  },
  {
    name: '外掛的 scripts 直接跑 ../../tools/y.ts，這次只改 tools/y.ts',
    prepare: wire('apps/Capture/package.json', '{ "scripts": { "check": "node ../../tools/y.ts" } }\n'),
    change: edit('tools/y.ts'), preCommit: ALL, ci: ALL,
  },
  {
    name: '套件的 scripts 直接跑 ../../tools/y.ts，這次只改 tools/y.ts',
    prepare: wire('packages/ai-client/package.json', '{ "scripts": { "check": "node ../../tools/y.ts" } }\n'),
    change: edit('tools/y.ts'), preCommit: ALL, ci: ALL,
  },
  // L2（ai-client 第一輪）R3：引號括住、有空白或中文的檔名也算入口。
  {
    name: '套件的 scripts 跑 node "../../tools/check package.ts"（雙引號、有空白），這次只改它',
    prepare: wire('packages/ai-client/package.json', '{ "scripts": { "check": "node \\"../../tools/check package.ts\\"" } }\n'),
    change: edit('tools/check package.ts'), preCommit: ALL, ci: ALL,
  },
  {
    name: "外掛的 scripts 跑 node '../../tools/單引號 x.mjs'（單引號），這次只改它",
    prepare: wire('apps/Capture/package.json', '{ "scripts": { "check": "node \'../../tools/單引號 x.mjs\'" } }\n'),
    change: edit('tools/單引號 x.mjs'), preCommit: ALL, ci: ALL,
  },
  // L2（ai-client 第二輪）延續 R3：雙引號裡的單引號是檔名的一部分。
  {
    name: '套件的 scripts 跑 node "../../tools/teacher\'s check.ts"（雙引號裡有單引號），這次只改它',
    prepare: wire('packages/ai-client/package.json', '{ "scripts": { "check": "node \\"../../tools/teacher\'s check.ts\\"" } }\n'),
    change: edit("tools/teacher's check.ts"), preCommit: ALL, ci: ALL,
  },
  {
    name: 'hook 跑 node tools/檢查.ts（沒有引號的中文檔名），這次只改它',
    prepare: wire('.githooks/pre-commit', 'exec node tools/hooks.ts pre-commit\nnode tools/檢查.ts && echo ok\n'),
    change: edit('tools/檢查.ts'), preCommit: ALL, ci: ALL,
  },
  {
    name: `改 ${SPEC}（登錄表；經 helper 的測試也選）`, change: edit(SPEC),
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
  // 最上層的任務說明與討論稿（D-213 搬進 docs/）：規劃文件的 commit 不跑完整檢查。舊位置的落「以上都不是」（文件檢查也擋）。
  { name: '改 docs/tasks/x.md', change: edit('docs/tasks/x.md'), preCommit: {}, ci: DOC_CI },
  { name: '改 docs/Claude Codex Discussion/x.md（路徑有空白）', change: edit('docs/Claude Codex Discussion/x.md'), preCommit: {}, ci: DOC_CI },
  { name: '改舊位置的 tasks/x.md', change: edit('tasks/x.md'), preCommit: ALL, ci: ALL },
  { name: '改舊位置的 Claude Codex Discussion/x.md', change: edit('Claude Codex Discussion/x.md'), preCommit: ALL, ci: ALL },
  { name: `改 ${SKILL}`, change: edit(SKILL), preCommit: {}, ci: DOC_CI },
  {
    name: `同一次改 ${C}src/core/files.ts、tools/check-docs.ts 與 ${SPEC}`,
    change: async e => { for (const path of [`${C}src/core/files.ts`, 'tools/check-docs.ts', SPEC]) await edit(path)(e); },
    preCommit: { tools: 'full', cards: 'full', capture: 'full' }, ci: { tools: 'full', cards: 'full', capture: 'full' },
  },
  // 搬家前根目錄的 package.json 是 Cards 的；搬家後根目錄新出現的設定是「以上都不是」。
  { name: '改根目錄的 package.json', change: edit('package.json'), preCommit: moved ? ALL : { cards: 'full' }, ci: moved ? ALL : { cards: 'full' } },
  { name: '改根目錄的 tsconfig.json', change: edit('tsconfig.json'), preCommit: moved ? ALL : { cards: 'full' }, ci: moved ? ALL : { cards: 'full' } },
  { name: '刪 apps/Mindboard/src/old.ts', change: async e => { await e.git('rm', '-q', '--', 'apps/Mindboard/src/old.ts'); }, preCommit: { mindboard: 'full' }, ci: { mindboard: 'full' } },
  {
    name: 'git mv apps/Mindboard/a.ts apps/Capture/a.ts', change: async e => { await e.git('mv', 'apps/Mindboard/a.ts', 'apps/Capture/a.ts'); },
    preCommit: { capture: 'full', mindboard: 'full' }, ci: { capture: 'full', mindboard: 'full' },
  },
  {
    name: `git mv ${C}src/a.ts apps/Mindboard/moved.ts`, change: async e => { await e.git('mv', `${C}src/a.ts`, 'apps/Mindboard/moved.ts'); },
    preCommit: { cards: 'full', mindboard: 'full' }, ci: { cards: 'full', mindboard: 'full' },
  },
  {
    name: '只差大小寫的改名 apps/Mindboard/Case.ts → case.ts', change: async e => { await e.git('mv', 'apps/Mindboard/Case.ts', 'apps/Mindboard/case.ts'); },
    preCommit: { mindboard: 'full' }, ci: { mindboard: 'full' },
  },
  {
    name: `${C}src/a.ts 從一般檔換成 symlink（型別變更）`,
    change: async e => { await e.git('update-index', '--cacheinfo', `120000,${e.hash('target.ts')},${C}src/a.ts`); },
    preCommit: { cards: 'full' }, ci: { cards: 'full' },
  },
  {
    name: 'git rm --cached apps/Mindboard/b.ts 並改 .gitignore',
    change: async e => { await e.git('rm', '-q', '--cached', '--', 'apps/Mindboard/b.ts'); await e.put('.gitignore', 'node_modules/\napps/Mindboard/b.ts\n'); await e.git('add', '--', '.gitignore'); },
    preCommit: ALL, ci: ALL,
  },
  { name: '新增 apps/Other/a.ts', change: edit('apps/Other/a.ts'), preCommit: ALL, ci: ALL },
  // 只有文件的軟體（D-218 §3 第 1 點）：只跑共用檢查。
  { name: '新增 apps/Portal/docs/backlog.md', change: edit('apps/Portal/docs/backlog.md'), preCommit: {}, ci: {} },
  { name: '只改 apps/Capture/a.ts', change: edit('apps/Capture/a.ts'), preCommit: { capture: 'full' }, ci: { capture: 'full' } },
  { name: '新增 apps/a.ts', change: edit('apps/a.ts'), preCommit: ALL, ci: ALL },
  // 套件（docs/tasks/ai-client.md〈8〉）：改到什麼都跑它自己的完整檢查；packages/ 底下不在表上的，全部跑。
  { name: '新增 packages/ai-client/src/a.ts', change: edit('packages/ai-client/src/a.ts'), preCommit: { 'ai-client': 'full' }, ci: { 'ai-client': 'full' } },
  { name: '改 packages/ai-client/docs/x.md', change: edit('packages/ai-client/docs/x.md'), preCommit: { 'ai-client': 'full' }, ci: { 'ai-client': 'full' } },
  {
    name: 'git mv apps/Mindboard/a.ts packages/ai-client/a.ts', change: async e => { await e.git('mv', 'apps/Mindboard/a.ts', 'packages/ai-client/a.ts'); },
    preCommit: { mindboard: 'full', 'ai-client': 'full' }, ci: { mindboard: 'full', 'ai-client': 'full' },
  },
  { name: '新增 packages/other/a.ts', change: edit('packages/other/a.ts'), preCommit: ALL, ci: ALL },
  { name: '新增 packages/a.md', change: edit('packages/a.md'), preCommit: ALL, ci: ALL },
  { name: '新增根目錄的 foo.config.js', change: edit('foo.config.js'), preCommit: ALL, ci: ALL },
  { name: '空 commit', change: async () => {}, preCommit: {}, ci: {} },
  { name: '檔名有中文與空白（core.quotepath=true）', change: edit('apps/Mindboard/docs/規畫 草稿.md'), preCommit: { mindboard: 'full' }, ci: { mindboard: 'full' } },
  { name: '檔名有換行', change: edit('apps/Mindboard/a\nb.ts'), preCommit: { mindboard: 'full' }, ci: { mindboard: 'full' }, linuxOnly: true },
  // 搬家後才有的路徑（§A3 的例子表；Cards 在 apps/Cards/ 才有意義）。
  ...(moved ? [
    {
      name: `改 ${C}docs/${'syntax.md'}（Cards 資料夾的文件，原路徑與去掉前綴的都比）`, change: edit(`${C}docs/${'syntax.md'}`),
      preCommit: { cards: 'related', tests: ['tests/cards-doc.test.ts'] }, ci: { cards: 'full' },
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
      name: `git mv ${C}docs/x.md apps/Capture/docs/x.md`, change: async (e: Env) => { await e.git('mv', `${C}docs/x.md`, 'apps/Capture/docs/x.md'); },
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
  await edit('apps/Mindboard/docs/backlog.md')(e);
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
  await mkdir(join(root, 'apps/Mindboard'), { recursive: true });
  await writeFile(join(root, 'apps/Mindboard/a.ts'), 'export {};\n');
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
  for (const path of [SPEC, DECISIONS, ENGLISH]) await edit(path)(e);
  const tests = ['tests/ai-rules.test.ts', 'tests/deck.test.ts', 'tests/nested/syntax-b.test.ts', 'tests/syntax-a.test.ts', 'tests/via-helper.test.ts'];
  assert.deepEqual((await e.dispatch('--staged')).targets.cards.tests, tests, '--staged');
  await e.git('commit', '-q', '-m', 'docs');
  assert.deepEqual((await e.dispatch('--range', e.base, 'HEAD')).targets.cards.tests, tests, '--range');
  // 反過來：head 的樹裡沒寫到（測試的修改先 commit 了），工作樹裡寫到也不選。
  await e.git('add', '--', `${C}tests/syntax-a.test.ts`);
  await e.git('commit', '-q', '-m', 'stub');
  const stub = (await e.git('rev-parse', 'HEAD')).trim();
  await e.put(SPEC, '# S\n\n再改一次\n');
  await e.git('add', '--', SPEC);
  await e.git('commit', '-q', '-m', 'syntax again');
  await e.put(`${C}tests/syntax-a.test.ts`, `'${SPEC}';\n`);
  assert.deepEqual((await e.dispatch('--range', stub, 'HEAD')).targets.cards.tests, ['tests/nested/syntax-b.test.ts', 'tests/via-helper.test.ts'], '--range 讀 head 的樹');
});

void test('§A3 分派表：本 repo 的相關測試照實際搜尋找得到（文件的測試、規則檔的特例、經 helper 的測試）', () => {
  const cards = (path: string) => relatedTests(ROOT, { kind: 'staged' }, 'cards', [path]);
  const tools = (path: string) => relatedTests(ROOT, { kind: 'staged' }, 'tools', [path]);
  assert.ok(tools(DECISIONS).includes('tests/decisions-index.test.ts'));
  const english = cards(CARDS_ENGLISH);
  assert.ok(english.includes('tests/deck.test.ts') && english.includes('tests/ai-rules.test.ts'), english.join(' '));
  // tests/helpers/add-cases.ts 讀轉錄稿格式，ai-add-move、ai-add-old-version 經由它讀（Codex 第一輪對 de3438f 實測漏選）。
  const syntax = cards(CARDS_SYNTAX);
  for (const name of ['tests/ai-add-move.test.ts', 'tests/ai-add-old-version.test.ts']) assert.ok(syntax.includes(name), name + '：' + syntax.join(' '));
  // 這份測試自己不算：路徑用拼接寫。
  assert.ok(cards(SPEC).includes('tests/lock.test.ts'), cards(SPEC).join(' '));
  for (const path of [SPEC, CARDS_SYNTAX, DECISIONS, CARDS_ENGLISH, PRODUCT, SKILL]) assert.ok(!tools(path).includes('tests/dispatch.test.ts'), path);
  assert.deepEqual(cards(PRODUCT), []);
});

/**
 * TypeScript 語法樹找到的相對相依（L2 第三輪：和 dispatch 的正規式分開算的獨立來源）：import、export … from、import x = require、
 * 動態 import 與 require(…) 的第一個參數是字面值的。字串、註解、正規表示式裡的不算（語法樹分得出來）。
 */
function astImports(text: string, fileName: string): string[] {
  const kind = /\.[cm]?ts$/.test(fileName) ? ts.ScriptKind.TS : ts.ScriptKind.JS;
  const source = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true, kind);
  const found = new Set<string>();
  const add = (node: ts.Node | undefined) => {
    if (node && (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) && /^\.{1,2}\//.test(node.text)) found.add(node.text);
  };
  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) add(node.moduleSpecifier);
    else if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) add(node.moduleReference.expression);
    else if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(node.expression) && node.expression.text === 'require'))) add(node.arguments[0]);
    ts.forEachChild(node, visit);
  };
  visit(source);
  return [...found].sort();
}

/**
 * 從 hook、check.yml、外掛與套件的 scripts 照字面取 tools/ 檔，相依用 TypeScript 的語法樹往下找（astImports，和 dispatch 的正規式分開算）；
 * 找到的路徑交給 Node 的 require.resolve，以 Node 實際載入的檔為準（L2 第二輪：不寫副檔名的 require；第三輪：結尾有斜線的資料夾）。
 */
async function independentEntries(): Promise<Set<string>> {
  const found = new Set(['tools/dispatch.ts', 'tools/hooks.ts', 'tools/ci-gate.ts']);
  const literal = (text: string, base: string | undefined) => {
    for (const match of text.matchAll(/((?:\.\.\/)*tools\/[\w./-]+\.[cm]?[jt]s)\b/g)) {
      const path = base === undefined ? posix.normalize(match[1].replace(/^(\.\.\/)+/, '')) : posix.normalize(posix.join(base, match[1]));
      if (path.startsWith('tools/')) found.add(path);
    }
  };
  for (const name of await readdir(join(ROOT, '.githooks'))) literal(await readFile(join(ROOT, '.githooks', name), 'utf8'), '.');
  literal(await readFile(join(ROOT, '.github/workflows/check.yml'), 'utf8'), undefined);
  for (const folder of [...Object.values(FOLDERS), ...Object.values(PACKAGES)]) {
    let pkg: { scripts?: Record<string, string> };
    try { pkg = JSON.parse(await readFile(join(ROOT, folder, 'package.json'), 'utf8')) as typeof pkg; } catch { continue; }
    for (const script of Object.values(pkg.scripts ?? {})) literal(script, folder);
  }
  const queue = [...found];
  while (queue.length) {
    const file = queue.pop()!;
    let text: string;
    try { text = await readFile(join(ROOT, file), 'utf8'); } catch { continue; }
    for (const name of astImports(text, file)) {
      let target: string;
      try { target = relative(ROOT, createRequire(join(ROOT, file)).resolve(name)).replaceAll('\\', '/'); } catch { continue; }
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
  // 2026-11-19 的實況（§A3）：入口有這幾支；check-docs、白板、codex 等落第 7 條（多算的前提下也不能把它們算進來）。
  for (const path of ['tools/hooks.ts', 'tools/dispatch.ts', 'tools/ci-gate.ts', 'tools/check-local-paths.ts']) assert.ok(entries.has(path), path);
  for (const path of ['tools/check-docs.ts', 'tools/progress-board.ts', 'tools/roadmap-board.ts', 'tools/codex.ts']) assert.ok(!entries.has(path), path);
});

void test('§A3 分派表：import 的正規式涵蓋語法樹找到的每個相依，字串與註解裡的寧可多算（第二步 L2 R3、第二輪、第三輪）', () => {
  // [原文, 語法樹找到的（Node 會載入的）, 正規式多算的]
  const samples: [string, string[], string[]][] = [
    ["run(); import './new-entry.ts';\n", ['./new-entry.ts'], []],
    ["import { a } from './a.ts'; import b from \"../b.mjs\";\n", ['../b.mjs', './a.ts'], []],
    ["const worker = require('./worker.cjs');\n", ['./worker.cjs'], []],
    ["module.exports = { w: require( \"../w.js\" ) };\n", ['../w.js'], []],
    ["console.log(\"it's ready\"); import './apostrophe.ts';\n", ['./apostrophe.ts'], []],
    ["log('say \"hi\"', 'don\\'t'); import './escaped.ts';\n", ['./escaped.ts'], []],
    ["const s = `it's ${x}`; require('./after-template.cjs');\n", ['./after-template.cjs'], []],
    ["const s = `a ${require('./in-template.cjs')} b`;\n", ['./in-template.cjs'], []],
    // 第三輪 R9：正規表示式裡的引號、跨行的模板字串結束之後。
    ["const quoted = /[\"'].*[\"']/; const worker = require('./regex-line.cjs');\n", ['./regex-line.cjs'], []],
    ["const t = `a\nb`; require('./after-multiline.cjs');\n", ['./after-multiline.cjs'], []],
    ["function f() {} import './after-block.ts';\n", ['./after-block.ts'], []],
    // 前提（第三輪）：不判斷是不是在字串、註解裡，寫到就算。多算的路徑不存在就不會出現在改動裡；存在就多跑檢查。
    ["const s = 'run(); import \"./str.ts\"';\nconst r = \"require('./str.cjs')\";\n", [], ['./str.cjs', './str.ts']],
    ["// require('./comment.cjs');\n/* import x from './block.ts' */\n", [], ['./block.ts', './comment.cjs']],
  ];
  for (const [text, loaded, extra] of samples) {
    assert.deepEqual(astImports(text, 'sample.ts'), loaded, '語法樹：' + text);
    assert.deepEqual([...relativeImports(text)].sort(), [...loaded, ...extra].sort(), text);
  }
});

void test('§A3 分派表：import 的正規式涵蓋語法樹找到的每個相依（tools/ 與 helper 的每個檔）', async () => {
  const files: string[] = [];
  for (const name of await readdir(join(ROOT, 'tools'))) if (/\.[cm]?[jt]s$/.test(name)) files.push(join(ROOT, 'tools', name));
  for (const dir of [join(ROOT, 'tools/tests'), join(ROOT, C, 'tests/helpers')]) {
    for (const name of await readdir(dir)) if (/\.[cm]?[jt]s$/.test(name)) files.push(join(dir, name));
  }
  for (const file of files) {
    const text = await readFile(file, 'utf8');
    const found = new Set(relativeImports(text));
    for (const name of astImports(text, file)) assert.ok(found.has(name), `${file}：${name}`);
  }
});

void test('§A3 分派表：入口寫到的 tools/ 檔，檔名有任何 shell 的特殊字元、怎麼加引號或跳脫都算到（L2 ai-client 第二輪 延續 R3）', () => {
  const names = ["teacher's check.ts", 'say "hi".ts', 'a (1).ts', 'a&b.ts', 'a;b.ts', 'a|b.ts', 'a<b>.ts', 'a$b.ts', 'a`b.ts', 'a#b.ts', 'a\\b.ts', '檢查 工具.mjs', '😀.cjs', 'sub dir/x.mts', 'x.js'];
  const shellEscape = (name: string) => name.replace(/[^\p{L}\p{N}_./-]/gu, ch => `\\${ch}`);
  for (const name of names) {
    const path = `tools/${name}`;
    const forms = [
      `node ../../${shellEscape(path)}`,
      `node "../../${path.replace(/["\\$`]/g, ch => `\\${ch}`)}"`,
      ...(name.includes("'") ? [] : [`node '../../${path}'`]),
      ...(/[\s"'`;&|<>()$#\\]/u.test(name) ? [] : [`node ../../${path} && echo ok`]),
    ];
    for (const script of forms) {
      assert.ok(toolPaths(script, 'packages/ai-client', [path, 'tools/other.ts']).includes(path), script);
      assert.ok(!toolPaths(script, 'packages/ai-client', [path, 'tools/other.ts']).includes('tools/other.ts'), script);
    }
  }
});

