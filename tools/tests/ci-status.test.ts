// .claude/hooks/ci-status.mjs（開場提醒）：main 的 CI 或進度白板的發布最近一次沒通過就提醒（D-245 第 4 點）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const run = promisify(execFile);
const HOOK = fileURLToPath(new URL('../../.claude/hooks/ci-status.mjs', import.meta.url));
// hook 用 execFile 找 gh，Windows 上找不到 .cmd 的替身。
const linuxOnly = { skip: process.platform === 'win32' && 'gh 的替身是 sh 腳本' };

const result = (conclusion: string, title = 'docs: something') => JSON.stringify([{ conclusion, headSha: 'abcdef1234567890', displayTitle: title, url: `https://github.com/o/r/actions/runs/${conclusion}`, createdAt: '2026-11-27T06:09:39Z' }]);

/** gh 的替身：記下參數，照 --workflow 印 FAKE_CHECK 或 FAKE_BOARD；值是 fail 時失敗。 */
async function fixture(t: test.TestContext) {
  const base = await mkdtemp(join(tmpdir(), 'essence-ci-status-'));
  t.after(() => rm(base, { recursive: true, force: true }));
  const bin = join(base, 'bin');
  await mkdir(bin);
  const args = join(base, 'gh-args.txt');
  await writeFile(join(bin, 'gh.mjs'), [
    "import { appendFileSync } from 'node:fs';",
    "const argv = process.argv.slice(2);",
    `appendFileSync(${JSON.stringify(args)}, argv.join(' ') + '\\n');`,
    "const out = argv[argv.indexOf('--workflow') + 1] === 'check.yml' ? process.env.FAKE_CHECK : process.env.FAKE_BOARD;",
    "if (out === 'fail') { console.error('gh: not logged in'); process.exit(1); }",
    'console.log(out);',
    '',
  ].join('\n'));
  await writeFile(join(bin, 'gh'), '#!/bin/sh\nexec node "$(dirname "$0")/gh.mjs" "$@"\n');
  await chmod(join(bin, 'gh'), 0o755);
  const hook = async (check: string, board: string) => {
    const { stdout } = await run(process.execPath, [HOOK], { cwd: base, env: { ...process.env, CLAUDE_PROJECT_DIR: base, PATH: bin + delimiter + (process.env.PATH ?? ''), FAKE_CHECK: check, FAKE_BOARD: board }, encoding: 'utf8' });
    return stdout.trim() ? JSON.parse(stdout) as { systemMessage: string; hookSpecificOutput: { hookEventName: string; additionalContext: string } } : undefined;
  };
  return { hook, args: async () => (await readFile(args, 'utf8')).trim().split('\n').sort() };
}

void test('D-245：兩支都通過時不說話；查的是 main 上兩支 workflow 最近一次跑完的 run', linuxOnly, async t => {
  const { hook, args } = await fixture(t);
  assert.equal(await hook(result('success'), result('success')), undefined);
  assert.deepEqual(await args(), ['check.yml', 'progress-board.yml'].map(file => `run list --branch main --workflow ${file} --status completed --limit 1 --json conclusion,headSha,displayTitle,url,createdAt`));
});

void test('D-245：白板發布失敗時提醒，寫出網址與怎麼重跑；被取消不算（新的 push 取消舊的是正常的）', linuxOnly, async t => {
  const { hook } = await fixture(t);
  const out = await hook(result('success'), result('failure'));
  assert.ok(out);
  assert.equal(out.hookSpecificOutput.hookEventName, 'SessionStart');
  assert.equal(out.systemMessage, '進度白板的發布（Progress board）在 main 沒通過：https://github.com/o/r/actions/runs/failure');
  assert.match(out.hookSpecificOutput.additionalContext, /^進度白板的發布（Progress board）在 main 最近一次跑完沒通過（failure）：abcdef1「docs: something」，2026-11-27T06:09:39Z，https:\/\/github\.com\/o\/r\/actions\/runs\/failure。白板停在舊版：.*gh workflow run progress-board\.yml --ref main/);
  assert.doesNotMatch(out.hookSpecificOutput.additionalContext, /CI（Check）/);
  assert.equal(await hook(result('success'), result('cancelled')), undefined);
});

void test('D-245：CI 照舊提醒，被取消也算；兩支都沒通過時各一行', linuxOnly, async t => {
  const { hook } = await fixture(t);
  const cancelled = await hook(result('cancelled'), result('success'));
  assert.ok(cancelled);
  assert.match(cancelled.hookSpecificOutput.additionalContext, /^CI（Check）在 main 最近一次跑完沒通過（cancelled）：.*gh run view <id> --log-failed/);
  const both = await hook(result('failure'), result('timed_out'));
  assert.ok(both);
  assert.equal(both.hookSpecificOutput.additionalContext.split('\n').length, 2);
  assert.match(both.systemMessage, /^CI（Check）在 main 沒通過：.*；進度白板的發布（Progress board）在 main 沒通過：/);
});

void test('D-245：gh 不能用或印的不是 JSON 時安靜結束，不擋 session；另一支照樣看', linuxOnly, async t => {
  const { hook } = await fixture(t);
  assert.equal(await hook('fail', 'fail'), undefined);
  assert.equal(await hook('not json', '[]'), undefined);
  const board = await hook('fail', result('failure'));
  assert.ok(board);
  assert.match(board.systemMessage, /^進度白板的發布/);
});
