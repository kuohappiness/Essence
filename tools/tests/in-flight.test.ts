// tools/in-flight.ts（D-242 開工前先看）：開著的 PR 改到哪些檔、新增了哪些決定編號。
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile, execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { chmod, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { addedDecisions, decisionIds, formatId, grouped, overlapping, parseSearch, repoSlug } from '../in-flight.ts';

const run = promisify(execFile);
const TOOL = fileURLToPath(new URL('../in-flight.ts', import.meta.url));

void test('D-242：origin 的網址認得 https、ssh 與結尾的 .git；不是 GitHub 的不認', () => {
  assert.equal(repoSlug('https://github.com/kuohappiness/Essence'), 'kuohappiness/Essence');
  assert.equal(repoSlug('https://github.com/kuohappiness/Essence.git\n'), 'kuohappiness/Essence');
  assert.equal(repoSlug('git@github.com:kuohappiness/Essence.git'), 'kuohappiness/Essence');
  assert.equal(repoSlug('/tmp/bare-repo'), undefined);
  assert.equal(repoSlug(''), undefined);
});

void test('D-242：重疊是同一個檔或在那個資料夾底下；不是字首相同就算，路徑寫法不同也對得上', () => {
  const files = ['AGENTS.md', 'tools/hooks.ts', 'tools/tests/hooks.test.ts', 'toolsets/x.ts', 'docs/agents/workflow.md'];
  assert.deepEqual(overlapping(files, []), files, '沒給路徑時全部算');
  assert.deepEqual(overlapping(files, ['tools']), ['tools/hooks.ts', 'tools/tests/hooks.test.ts']);
  assert.deepEqual(overlapping(files, ['./tools/']), ['tools/hooks.ts', 'tools/tests/hooks.test.ts']);
  assert.deepEqual(overlapping(files, ['docs\\agents\\workflow.md', 'AGENTS.md']), ['AGENTS.md', 'docs/agents/workflow.md']);
  assert.deepEqual(overlapping(files, ['.']), files, 'repo 的根目錄等於全部');
  assert.deepEqual(overlapping(files, ['apps/Cards']), []);
});

void test('D-242：檔名照資料夾分組，apps 看到軟體裡的第一層，其他看到第二層', () => {
  assert.equal(grouped(['apps/Cards/src/a.ts', 'apps/Cards/src/b/c.ts', 'apps/Cards/tests/a.test.ts', 'docs/agents/quality.md', 'docs/backlog.md', 'AGENTS.md', 'tools/hooks.ts']),
    'apps/Cards/src/ 2 個、apps/Cards/tests/ 1 個、docs/agents/ 1 個、docs/ 1 個、AGENTS.md、tools/ 1 個');
  assert.equal(grouped([]), '');
});

void test('D-242：決定編號讀二級標題；diff 只算新加的行', () => {
  assert.deepEqual(decisionIds('# 決定\n\n## D-001 甲\n\n### D-002 不是二級\n\n## D-241 乙\n文字 ## D-999\n'), [1, 241]);
  assert.deepEqual(addedDecisions(' ## D-240 舊的\n-## D-239 刪掉\n+## D-242 新的\n+## D-243 又一條\n+### D-244 三級\n'), [242, 243]);
  assert.equal(formatId(7), 'D-007');
  assert.equal(formatId(1234), 'D-1234');
});

void test('D-242：搜尋結果只留 PR、由新到舊；總數比拿到的多時算不完整', () => {
  const item = (number: number, updated_at: string, extra = {}) => ({ number, title: `t${number}`, updated_at, pull_request: {}, ...extra });
  const full = parseSearch(JSON.stringify({ total_count: 2, incomplete_results: false, items: [item(1, '2026-11-01T00:00:00Z'), item(2, '2026-11-02T00:00:00Z', { draft: true })] }));
  assert.deepEqual(full, { complete: true, prs: [{ number: 2, title: 't2', updated: '2026-11-02T00:00:00Z', draft: true }, { number: 1, title: 't1', updated: '2026-11-01T00:00:00Z', draft: false }] });
  const issue = { number: 3, title: 'issue', updated_at: '2026-11-03T00:00:00Z' };
  assert.equal(parseSearch(JSON.stringify({ total_count: 1, items: [issue] })).prs.length, 0, 'issue 不算');
  assert.equal(parseSearch(JSON.stringify({ total_count: 40, items: [item(1, '2026-11-01T00:00:00Z')] })).complete, false);
  assert.equal(parseSearch(JSON.stringify({ total_count: 1, incomplete_results: true, items: [item(1, '2026-11-01T00:00:00Z')] })).complete, false);
});

/** 一個假的 GitHub：本機的 bare repo 放 main 與 refs/pull/<n>/head，origin 寫成 GitHub 的網址、用 insteadOf 指過去；gh 換成印固定搜尋結果的替身。 */
async function fixture(t: test.TestContext) {
  const base = await mkdtemp(join(tmpdir(), 'essence-in-flight-'));
  t.after(() => rm(base, { recursive: true, force: true }));
  const env: NodeJS.ProcessEnv = { ...process.env, GIT_CONFIG_GLOBAL: join(base, 'gitconfig'), GIT_CONFIG_NOSYSTEM: '1' };
  for (const key of Object.keys(env)) if (key.toUpperCase().startsWith('GIT_') && !['GIT_CONFIG_GLOBAL', 'GIT_CONFIG_NOSYSTEM'].includes(key)) delete env[key];
  const bare = join(base, 'origin.git');
  const work = join(base, 'work');
  const git = (cwd: string, args: string[]) => execFileSync('git', ['-c', 'user.name=InFlightTest', '-c', 'user.email=test@example.invalid', ...args], { cwd, env, encoding: 'utf8' }).trim();
  await mkdir(work);
  git(base, ['init', '-q', '--bare', bare]);
  git(work, ['init', '-q', '-b', 'main']);
  await mkdir(join(work, 'docs'));
  await writeFile(join(work, 'docs/decisions.md'), '# 決定\n\n## D-001 甲\n\n## D-002 乙\n');
  await writeFile(join(work, 'AGENTS.md'), '規則\n');
  git(work, ['add', '--', 'docs/decisions.md', 'AGENTS.md']);
  git(work, ['commit', '-q', '-m', 'base']);
  git(work, ['push', '-q', bare, 'main']);
  // PR 7：改 AGENTS.md、加 D-003。PR 8：只改 tools/。
  git(work, ['checkout', '-q', '-b', 'seven']);
  await writeFile(join(work, 'AGENTS.md'), '規則\n多一行\n');
  await writeFile(join(work, 'docs/decisions.md'), '# 決定\n\n## D-001 甲\n\n## D-002 乙\n\n## D-003 丙\n');
  git(work, ['add', '--', 'docs/decisions.md', 'AGENTS.md']);
  git(work, ['commit', '-q', '-m', 'seven']);
  git(work, ['push', '-q', bare, 'HEAD:refs/pull/7/head']);
  git(work, ['checkout', '-q', 'main']);
  git(work, ['checkout', '-q', '-b', 'eight']);
  await mkdir(join(work, 'tools'));
  await writeFile(join(work, 'tools/x.ts'), 'export {};\n');
  git(work, ['add', '--', 'tools/x.ts']);
  git(work, ['commit', '-q', '-m', 'eight']);
  git(work, ['push', '-q', bare, 'HEAD:refs/pull/8/head']);
  git(work, ['checkout', '-q', 'main']);
  git(work, ['remote', 'add', 'origin', 'https://github.com/owner/name.git']);
  git(work, ['config', `url.${bare.replaceAll('\\', '/')}.insteadOf`, 'https://github.com/owner/name.git']);
  // gh 的替身：記下參數，印 FAKE_GH 給的搜尋結果；FAKE_GH=fail 時失敗。
  const bin = join(base, 'bin');
  await mkdir(bin);
  const ghArgs = join(base, 'gh-args.txt');
  await writeFile(join(bin, 'gh.mjs'), [
    "import { appendFileSync } from 'node:fs';",
    `appendFileSync(${JSON.stringify(ghArgs)}, process.argv.slice(2).join(' ') + '\\n');`,
    "if (process.env.FAKE_GH === 'fail') { console.error('gh: not logged in'); process.exit(1); }",
    'console.log(process.env.FAKE_GH);',
    '',
  ].join('\n'));
  if (process.platform === 'win32') await writeFile(join(bin, 'gh.cmd'), '@node "%~dp0gh.mjs" %*\r\n');
  else {
    await writeFile(join(bin, 'gh'), '#!/bin/sh\nexec node "$(dirname "$0")/gh.mjs" "$@"\n');
    await chmod(join(bin, 'gh'), 0o755);
  }
  const pathKey = Object.keys(env).find(key => key.toUpperCase() === 'PATH') ?? 'PATH';
  env[pathKey] = bin + delimiter + (env[pathKey] ?? '');
  const search = JSON.stringify({
    total_count: 2, incomplete_results: false,
    items: [7, 8].map(number => ({ number, title: `PR ${number}`, updated_at: `2026-11-2${number - 6}T01:02:03Z`, pull_request: {} })),
  });
  const tool = (args: string[], fake = search) => run(process.execPath, [TOOL, ...args], { cwd: work, env: { ...env, FAKE_GH: fake }, encoding: 'utf8' });
  return { tool, ghArgs };
}

void test('D-242：列出每個開著的 PR 改到的資料夾與新增的決定，算出下一個可以用的編號；搜尋的是這個 repo 開著的 PR', async t => {
  const { tool, ghArgs } = await fixture(t);
  const { stdout } = await tool([]);
  assert.match(stdout, /^開著的 PR 2 個（和 origin\/main 的共同起點比）：$/m);
  assert.match(stdout, /^#8 PR 8（更新 2026-11-22 01:02 UTC）\n {2}改到 1 個檔：tools\/ 1 個$/m);
  assert.match(stdout, /^#7 PR 7（更新 2026-11-21 01:02 UTC）\n {2}改到 2 個檔：AGENTS\.md、docs\/ 1 個\n {2}新增決定：D-003$/m);
  assert.match(stdout, /^決定編號：main 最新是 D-002，開著的 PR 用了 D-003，下一個可以用 D-004。$/m);
  assert.equal(readFileSync(ghArgs, 'utf8').trim(), 'api search/issues?q=repo:owner/name+is:pr+is:open');
});

void test('D-242：給路徑時只列改到那些路徑（或新增決定）的 PR，並寫出重疊的檔', async t => {
  const { tool } = await fixture(t);
  const tools = (await tool(['tools/'])).stdout;
  assert.match(tools, /^開著的 PR 2 個，其中 2 個改到 tools 或新增決定/m);
  assert.match(tools, /^#8 PR 8.*\n {2}改到你要看的：tools\/x\.ts$/m);
  assert.match(tools, /^#7 PR 7.*\n {2}沒改到你要看的路徑\n {2}新增決定：D-003$/m, '新增決定的 PR 一定列出，取號才不會撞');
  const none = (await tool(['apps/Cards'], JSON.stringify({ total_count: 1, items: [{ number: 8, title: 'PR 8', updated_at: '2026-11-22T01:02:03Z', pull_request: {} }] }))).stdout;
  assert.match(none, /^開著的 PR 1 個，其中 0 個改到 apps\/Cards 或新增決定/m);
  assert.doesNotMatch(none, /#8/);
});

void test('D-242：gh 不能用時說清楚、exit 1，不當成沒有 PR', async t => {
  const { tool } = await fixture(t);
  await assert.rejects(tool([], 'fail'), (error: unknown) => {
    const { code, stdout, stderr } = error as { code: unknown; stdout: string; stderr: string };
    assert.equal(code, 1);
    assert.equal(stdout, '');
    assert.match(stderr, /查不到開著的 PR（gh 不能用、沒登入或連不上：gh: not logged in）：改用 GitHub 的 PR 清單手動看。/);
    return true;
  });
});
