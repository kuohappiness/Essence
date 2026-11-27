// 給新專案的模板的防線（D-247，docs/tasks/project-starter-template.md〈3-3〉〈3-4〉與〈7〉第 2 項）：
// 把起步包複製進暫存資料夾、git init，跑它自己的檢查與 hook。
// 這幾個路徑寫在這裡，只改模板程式的 commit，pre-commit 也會跑這個測試（分派表的相關測試照路徑全名找）：
//   templates/project-starter/files/tools/check.mjs
//   templates/project-starter/files/tools/in-flight.mjs
//   templates/project-starter/files/dot-claude/hooks/block-dangerous-git.mjs
//   templates/project-starter/files/dot-claude/hooks/cloud-setup.mjs
//   templates/project-starter/files/dot-claude/settings.json
//   templates/project-starter/files/.githooks/pre-commit
//   templates/project-starter/files/.github/workflows/check.yml
//   templates/project-starter/files/.github/ruleset-main.json
//   templates/project-starter/files/SETUP.md
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile, execFileSync, spawnSync } from 'node:child_process';
import { chmod, cp, mkdir, mkdtemp, readFile, rename, rm, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const run = promisify(execFile);
const REPO = fileURLToPath(new URL('../../', import.meta.url));
const FILES = join(REPO, 'templates/project-starter/files');
/** 第一個 commit 要 add 的路徑（hook 擋 git add -A 與 git add .，逐一寫出）。 */
const TOP = ['AGENTS.md', 'CLAUDE.md', 'SETUP.md', 'docs', 'tools', '.claude', '.githooks', '.github', '.gitignore', '.gitattributes'];

function cleanEnv(base: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env, GIT_CONFIG_GLOBAL: join(base, 'gitconfig'), GIT_CONFIG_NOSYSTEM: '1', HOME: join(base, 'home') };
  for (const key of Object.keys(env)) if (key.toUpperCase().startsWith('GIT_') && !['GIT_CONFIG_GLOBAL', 'GIT_CONFIG_NOSYSTEM'].includes(key)) delete env[key];
  delete env.CLAUDE_CODE_REMOTE;
  delete env.CLAUDE_PROJECT_DIR;
  return env;
}

/** 照使用說明複製：files/ 整包進新的 repo，dot-claude/ 改名 .claude/，全部 stage。 */
async function project(t: test.TestContext) {
  const base = await mkdtemp(join(tmpdir(), 'starter-'));
  t.after(() => rm(base, { recursive: true, force: true }));
  const env = cleanEnv(base);
  await mkdir(join(base, 'home'));
  const root = join(base, 'repo');
  await cp(FILES, root, { recursive: true });
  await rename(join(root, 'dot-claude'), join(root, '.claude'));
  const git = (...args: string[]) => execFileSync('git', ['-c', 'user.name=StarterTest', '-c', 'user.email=test@example.invalid', ...args], { cwd: root, env, encoding: 'utf8' });
  git('init', '-q', '-b', 'main');
  git('add', '--', ...TOP);
  const check = (...args: string[]) => spawnSync(process.execPath, ['tools/check.mjs', ...args], { cwd: root, env, encoding: 'utf8' });
  return { base, root, env, git, check };
}

void test('模板：複製過去、全部 stage，check.mjs 通過，空格只報數字（驗收第 2 項）', async t => {
  const { git, check } = await project(t);
  assert.match(git('ls-files', '-s', '.githooks/pre-commit'), /^100755 /, '.githooks/pre-commit 要以可執行的模式進 repo');
  for (const args of [['--staged'], []]) {
    const result = check(...args);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /^檢查通過（(暫存區|整個 repo)）：\d+ 個檔；還有 \d+ 個沒填的空格（SETUP\.md 還在，先不擋）$/m);
  }
});

void test('模板：假金鑰、壞連結、沒有執行權限的 git hook、刪掉 SETUP.md 但留著空格，四種都被擋下，訊息指得出檔名（驗收第 2 項）', async t => {
  const { root, git, check } = await project(t);
  const blocked = async (name: string, change: () => Promise<void> | void, expected: RegExp) => {
    await change();
    const result = check('--staged');
    assert.equal(result.status, 1, `${name}應該被擋下：${result.stdout}`);
    assert.match(result.stderr, expected, name);
    git('reset', '-q');
    git('add', '--', ...TOP);
  };
  // 假金鑰在執行時才組出來，Essence 自己的金鑰掃描才不會擋下這個測試檔。
  const fakeKey = ['gh', 'p_', 'a1B2c3D4'.repeat(5)].join('');
  await blocked('假金鑰', async () => {
    await writeFile(join(root, 'docs/notes.md'), `token = ${fakeKey}\n`);
    git('add', '--', 'docs/notes.md');
  }, /^docs\/notes\.md:1 {2}看起來是GitHub 權杖/m);
  await unlink(join(root, 'docs/notes.md'));
  await blocked('.env 檔', async () => {
    await writeFile(join(root, '.env.local'), 'X=1\n');
    git('add', '-f', '--', '.env.local');
  }, /^\.env\.local {2}\.env 檔不能進 repo/m);
  await unlink(join(root, '.env.local'));
  await blocked('壞連結', async () => {
    await writeFile(join(root, 'docs/broken.md'), '# 壞\n\n見[這裡](missing.md#一節)。\n\n```text\n[程式碼裡的不算](nope.md)\n```\n');
    git('add', '--', 'docs/broken.md');
  }, /^docs\/broken\.md:3 {2}連結 missing\.md#一節 找不到檔案/m);
  await unlink(join(root, 'docs/broken.md'));
  await blocked('沒有執行權限的 git hook', () => {
    git('update-index', '--chmod=-x', '--', '.githooks/pre-commit');
  }, /^\.githooks\/pre-commit {2}git hook 在 git 裡不是可執行的模式（現在是 100644）/m);
  git('update-index', '--chmod=+x', '--', '.githooks/pre-commit');
  await blocked('刪掉 SETUP.md 但留著空格', () => {
    git('rm', '-q', '--cached', '--', 'SETUP.md');
  }, /^AGENTS\.md:\d+ {2}還有沒填的空格/m);
});

void test('模板：設好 core.hooksPath 後，有壞連結的 commit 被 pre-commit 擋下（驗收第 3 項的本機版）', async t => {
  const { root, git } = await project(t);
  git('config', 'core.hooksPath', '.githooks');
  git('commit', '-q', '-m', 'first');
  await writeFile(join(root, 'docs/broken.md'), '[壞](missing.md)\n');
  git('add', '--', 'docs/broken.md');
  assert.throws(() => git('commit', '-q', '-m', 'broken'), (error: { stderr?: string }) => /docs\/broken\.md:1 {2}連結 missing\.md 找不到檔案/.test(String(error.stderr)));
});

void test('模板：擋危險 git 指令的 hook 和 Essence 那支的判斷一樣（規則照搬）', () => {
  const commands = [
    'git add -A', 'git add .', 'git add -u', 'git commit -am x', 'git push --force', 'git push -f origin x', 'git push --force-with-lease',
    'git reset --hard', 'git clean -fd', 'git checkout -- .', 'git restore .', 'git stash', 'git commit --no-verify -m x', 'git commit -nm x',
    'git -c core.hooksPath=/dev/null commit -m x', 'GIT.EXE add -A', 'git -C x add --all',
    'git add -- a.md', 'git status', 'git stash list', 'git push -u origin x', 'git commit -m "add -A later"', 'git reset --soft HEAD~1', 'echo hi',
  ];
  const code = (hook: string, command: string) => spawnSync(process.execPath, [hook], { input: JSON.stringify({ tool_input: { command } }), encoding: 'utf8' }).status;
  const ours = join(FILES, 'dot-claude/hooks/block-dangerous-git.mjs');
  const theirs = join(REPO, '.claude/hooks/block-dangerous-git.mjs');
  const differ = commands.filter(command => code(ours, command) !== code(theirs, command));
  assert.deepEqual(differ, []);
  assert.equal(code(ours, 'git push --force'), 2);
  assert.equal(code(ours, 'git status'), 0);
});

void test('模板：雲端開場只在雲端跑；--setup-script 把 hook 接到使用者設定，重跑結果一樣；出錯照樣結束在 0', async t => {
  const { base, root, env } = await project(t);
  const hook = join(root, '.claude/hooks/cloud-setup.mjs');
  const start = (args: string[], extra: NodeJS.ProcessEnv) => spawnSync(process.execPath, [hook, ...args], { cwd: root, env: { ...env, ...extra }, encoding: 'utf8' });
  const local = start([], {});
  assert.equal(local.status, 0);
  assert.equal(local.stdout, '', '在使用者的電腦上什麼都不做');
  const remote = { CLAUDE_CODE_REMOTE: 'true', CLAUDE_PROJECT_DIR: root };
  const session = start([], remote);
  assert.equal(session.status, 0);
  assert.match((JSON.parse(session.stdout) as { hookSpecificOutput: { additionalContext: string } }).hookSpecificOutput.additionalContext, /core\.hooksPath 已設為 \.githooks/);
  assert.equal(execFileSync('git', ['config', 'core.hooksPath'], { cwd: root, env, encoding: 'utf8' }).trim(), '.githooks');
  const userSettings = join(base, 'home/.claude/settings.json');
  await mkdir(join(base, 'home/.claude'));
  await writeFile(userSettings, JSON.stringify({ theme: 'dark', hooks: { Stop: [{ hooks: [{ type: 'command', command: 'echo other' }] }] } }));
  const first = start(['--setup-script'], remote);
  assert.equal(first.status, 0);
  assert.match(first.stdout, /repo 的 2 個 Claude hook 已接到/);
  const once = await readFile(userSettings, 'utf8');
  assert.equal(start(['--setup-script'], remote).status, 0);
  assert.equal(await readFile(userSettings, 'utf8'), once, '重跑結果一樣');
  const settings = JSON.parse(once) as { theme: string; hooks: Record<string, { hooks: { command: string }[] }[]> };
  assert.equal(settings.theme, 'dark', '使用者設定裡其他的東西不動');
  assert.equal(settings.hooks.Stop[0].hooks[0].command, 'echo other');
  const guard = settings.hooks.PreToolUse[0].hooks[0].command;
  assert.ok(guard.startsWith('[ -f "$CLAUDE_PROJECT_DIR/.claude/hooks/cloud-setup.mjs" ] || '), '專案資料夾就是 repo 時不跑兩次');
  assert.ok(guard.includes(`${root}/.claude/hooks/block-dangerous-git.mjs`), '指令換成絕對路徑');
  // 抄過去的指令在專案資料夾是 repo 的上一層時會跑 hook、擋下 force push；專案資料夾就是 repo 時直接結束。
  const sh = (projectDir: string) => spawnSync('sh', ['-c', guard], { input: JSON.stringify({ tool_input: { command: 'git push --force' } }), env: { ...env, CLAUDE_PROJECT_DIR: projectDir }, encoding: 'utf8' }).status;
  assert.equal(sh(base), 2);
  assert.equal(sh(root), 0);
  await writeFile(join(root, '.claude/settings.json'), '{ 壞掉的 JSON');
  const broken = start(['--setup-script'], remote);
  assert.equal(broken.status, 0, '出錯不擋開場');
  assert.match(broken.stdout, /把 Claude 的 hook 接到使用者設定失敗/);
});

/** 假的 GitHub：bare repo 放 main 與 refs/pull/<n>/head，origin 用 insteadOf 指過去；gh 換成印固定搜尋結果的替身（同 in-flight.test.ts）。 */
void test('模板：in-flight.mjs 讀一條一檔的決定，算出下一個編號；有 PR 沒查完時不給', async t => {
  const base = await mkdtemp(join(tmpdir(), 'starter-in-flight-'));
  t.after(() => rm(base, { recursive: true, force: true }));
  const env = cleanEnv(base);
  const bare = join(base, 'origin.git');
  const work = join(base, 'work');
  const git = (cwd: string, args: string[]) => execFileSync('git', ['-c', 'user.name=StarterTest', '-c', 'user.email=test@example.invalid', ...args], { cwd, env, encoding: 'utf8' }).trim();
  await mkdir(join(work, 'docs/decisions'), { recursive: true });
  git(base, ['init', '-q', '--bare', bare]);
  git(work, ['init', '-q', '-b', 'main']);
  await writeFile(join(work, 'docs/decisions/D-001.md'), '# D-001 甲\n');
  await writeFile(join(work, 'docs/decisions/D-002.md'), '# D-002 乙\n');
  await writeFile(join(work, 'docs/decisions/README.md'), '# 決定\n');
  git(work, ['add', '--', 'docs']);
  git(work, ['commit', '-q', '-m', 'base']);
  git(work, ['push', '-q', bare, 'main']);
  // PR 7：加 D-003、改 AGENTS.md。PR 8：只改 docs/decisions/D-002.md（不是新增）。PR 9：和 main 沒有共同起點。
  git(work, ['checkout', '-q', '-b', 'seven']);
  await writeFile(join(work, 'docs/decisions/D-003.md'), '# D-003 丙\n');
  await writeFile(join(work, 'AGENTS.md'), '規則\n');
  git(work, ['add', '--', 'docs', 'AGENTS.md']);
  git(work, ['commit', '-q', '-m', 'seven']);
  git(work, ['push', '-q', bare, 'HEAD:refs/pull/7/head']);
  git(work, ['checkout', '-q', 'main']);
  git(work, ['checkout', '-q', '-b', 'eight']);
  await writeFile(join(work, 'docs/decisions/D-002.md'), '# D-002 乙（改）\n');
  git(work, ['add', '--', 'docs']);
  git(work, ['commit', '-q', '-m', 'eight']);
  git(work, ['push', '-q', bare, 'HEAD:refs/pull/8/head']);
  git(work, ['checkout', '-q', '--orphan', 'nine']);
  await writeFile(join(work, 'docs/decisions/D-004.md'), '# D-004 丁\n');
  git(work, ['add', '--', 'docs']);
  git(work, ['commit', '-q', '-m', 'nine']);
  git(work, ['push', '-q', bare, 'HEAD:refs/pull/9/head']);
  git(work, ['checkout', '-q', 'main']);
  git(work, ['remote', 'add', 'origin', 'https://github.com/owner/name.git']);
  git(work, ['config', `url.${bare.replaceAll('\\', '/')}.insteadOf`, 'https://github.com/owner/name.git']);
  const bin = join(base, 'bin');
  await mkdir(bin);
  await writeFile(join(bin, 'gh.mjs'), "if (process.env.FAKE_GH === 'fail') { console.error('gh: not logged in'); process.exit(1); }\nconsole.log(process.env.FAKE_GH);\n");
  if (process.platform === 'win32') await writeFile(join(bin, 'gh.cmd'), '@node "%~dp0gh.mjs" %*\r\n');
  else {
    await writeFile(join(bin, 'gh'), '#!/bin/sh\nexec node "$(dirname "$0")/gh.mjs" "$@"\n');
    await chmod(join(bin, 'gh'), 0o755);
  }
  const pathKey = Object.keys(env).find(key => key.toUpperCase() === 'PATH') ?? 'PATH';
  env[pathKey] = bin + delimiter + (env[pathKey] ?? '');
  const search = (numbers: number[]) => JSON.stringify({
    total_count: numbers.length, incomplete_results: false,
    items: numbers.map(number => ({ number, title: `PR ${number}`, updated_at: `2026-11-2${number - 6}T01:02:03Z`, pull_request: {} })),
  });
  const tool = (args: string[], fake: string) => run(process.execPath, [join(FILES, 'tools/in-flight.mjs'), ...args], { cwd: work, env: { ...env, FAKE_GH: fake }, encoding: 'utf8' });

  const { stdout } = await tool([], search([7, 8]));
  assert.match(stdout, /^#7 PR 7.*\n {2}改到 2 個檔：AGENTS\.md、docs\/decisions\/ 1 個\n {2}新增決定：D-003$/m);
  assert.match(stdout, /^#8 PR 8.*\n {2}改到 1 個檔：docs\/decisions\/ 1 個$/m, '改到既有的決定不算新增');
  assert.match(stdout, /^決定編號：main 最新是 D-002，開著的 PR 用了 D-003，下一個可以用 D-004。$/m);
  const scoped = (await tool(['AGENTS.md'], search([7, 8]))).stdout;
  assert.match(scoped, /^#7 PR 7.*\n {2}改到你要看的：AGENTS\.md\n {2}新增決定：D-003$/m);
  assert.doesNotMatch(scoped, /#8/);
  await assert.rejects(tool([], search([7, 9])), (error: { code?: number; stdout?: string }) => {
    assert.equal(error.code, 1);
    assert.match(String(error.stdout), /^#9 PR 9.*\n {2}找不到和 main 的共同起點/m);
    assert.doesNotMatch(String(error.stdout), /下一個可以用/);
    return true;
  });
  await assert.rejects(tool([], 'fail'), (error: { code?: number; stderr?: string }) => {
    assert.equal(error.code, 1);
    assert.match(String(error.stderr), /查不到開著的 PR（gh 不能用、沒登入或連不上：gh: not logged in）/);
    return true;
  });
});

void test('模板：CI 的最後一關叫 gate、一定會跑、只在 push 跑；保護規則檔必過的就是它', async () => {
  const workflow = await readFile(join(FILES, '.github/workflows/check.yml'), 'utf8');
  assert.match(workflow, /^on: \[push\]$/m);
  assert.doesNotMatch(workflow, /pull_request|cancel-in-progress|paths:/);
  assert.match(workflow, /^ {2}gate:\n {4}needs: \[[^\]]+\]\n {4}if: always\(\)$/m);
  const ruleset = JSON.parse(await readFile(join(FILES, '.github/ruleset-main.json'), 'utf8')) as {
    bypass_actors: unknown[]; rules: { type: string; parameters?: { strict_required_status_checks_policy: boolean; required_status_checks: { context: string }[] } }[];
  };
  assert.deepEqual(ruleset.bypass_actors, []);
  assert.deepEqual(ruleset.rules.map(rule => rule.type).sort(), ['deletion', 'non_fast_forward', 'required_status_checks']);
  const checks = ruleset.rules.find(rule => rule.type === 'required_status_checks')!.parameters!;
  assert.deepEqual(checks.required_status_checks.map(check => check.context), ['gate']);
  assert.equal(checks.strict_required_status_checks_policy, false);
});
