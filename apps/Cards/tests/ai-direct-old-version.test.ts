import test from 'node:test';
import type { TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gitEnv, pluginRoot } from '../tools/git.ts';
import { isJob, readJobs, readSnapshot } from '../src/core/ai/index.ts';
import { tempFolder } from './helpers/vault.ts';
import { form, lesson, load, ok, reply, SNAPSHOT } from './helpers/ai-direct.ts';

// 直接製作寫出的快照與待貼回的工作，已發布的 v0.6.0 讀起來和現在一樣（tasks/ai-direct.md §10、格式查核 F19 第 13 項）：用真的 v0.6.0 標籤的程式，
// 不是用現在的程式假裝舊版。快照是加深要讀的（deepen-snapshot.ts 的 readSnapshot）；工作是更新外掛之前留在這台電腦、舊版也要讀得到的。

const root = fileURLToPath(new URL('../', import.meta.url));
const env = gitEnv();
const git = (dir: string, ...args: string[]): string => execFileSync('git', args, { cwd: dir, env, encoding: 'utf8' }).trim();

/** 在 v0.6.0 的 clone 裡跑一次：另一個 process，載入的都是那個標籤的程式。 */
const SCRIPT = `
import { isJob, readJobs, readSnapshot } from './src/core/ai/index.ts';
const { path, snapshot, jobs, now } = JSON.parse(process.argv[1]);
const read = readJobs(jobs, now);
console.log(JSON.stringify({ snapshot: readSnapshot(path, snapshot), isJob: jobs.map(isJob), kept: read.jobs.map(job => job.id), broken: read.broken }));
`;
async function oldRun(t: TestContext, input: unknown): Promise<{ snapshot: unknown; isJob: boolean[]; kept: string[]; broken: number }> {
  const dir = await tempFolder(t, 'essence-v0.6.0-');
  git(root, 'clone', '-q', '--no-checkout', git(root, 'rev-parse', '--show-toplevel'), dir);
  git(dir, 'checkout', '-q', 'v0.6.0');
  const cards = join(dir, pluginRoot(dir, 'v0.6.0'));
  await symlink(join(root, 'node_modules'), join(cards, 'node_modules'), 'junction');
  const out = execFileSync(process.execPath, ['--input-type=module', '-e', SCRIPT, JSON.stringify(input)], { cwd: cards, env, encoding: 'utf8' });
  return JSON.parse(out) as { snapshot: unknown; isJob: boolean[]; kept: string[]; broken: number };
}

void test('v0.6.0 讀直接製作的快照與工作：readSnapshot 和現在相同；送出中、收到了、失敗的工作都讀得到，沒有算成讀不懂', async t => {
  const now = Date.parse('2026-11-07T10:02:11+08:00');
  // 收到了的工作（有 api.received），存成草稿之前先留一份。
  const received = await load(t, [ok(reply)]);
  const outcome = await received.cards.direct(form, [lesson]);
  assert.ok(outcome.kind === 'received');
  const receivedJob = received.cards.jobs()[0];
  assert.equal((await received.cards.save(outcome.job, outcome.reply, null, undefined, true)).kind, 'done');
  const snapshot = received.memory.texts.get(SNAPSHOT);
  assert.ok(snapshot !== undefined && snapshot.includes('接法: API'));
  // 失敗的與送出中的工作。
  const failing = await load(t, [{ status: 500, headers: { 'content-type': 'application/json' }, chunks: ['{"error":{"code":500,"status":"INTERNAL","message":"x"}}'] }]);
  assert.equal((await failing.cards.direct({ ...form, unit: 'L4 Food' }, [lesson])).kind, 'failed');
  // 兩次載入的亂數相同，識別碼也相同：換一個，三份才分得開。
  const failedJob = { ...failing.cards.jobs()[0], id: 'failed' };
  const sendingJob = { ...failedJob, id: 'sendin', api: { ...failedJob.api!, state: 'sending', kind: null } };
  const jobs = JSON.parse(JSON.stringify([receivedJob, failedJob, sendingJob])) as unknown[];
  assert.deepEqual(jobs.map(isJob), [true, true, true]);
  const old = await oldRun(t, { path: SNAPSHOT, snapshot, jobs, now });
  const info = readSnapshot(SNAPSHOT, snapshot);
  assert.ok(info);
  assert.deepEqual(old.snapshot, JSON.parse(JSON.stringify(info)));
  assert.deepEqual(old.isJob, [true, true, true]);
  assert.deepEqual(old.kept, readJobs(jobs, now).jobs.map(job => job.id));
  assert.equal(old.broken, 0);
});
