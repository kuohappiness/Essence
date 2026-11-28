import test from 'node:test';
import type { TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gitEnv, pluginRoot } from '../tools/git.ts';
import { isDeepenJob, isJob, readDeepenJobs, readJobs, readSnapshot, retargetSnapshot } from '../src/core/ai/index.ts';
import { tempFolder } from './helpers/vault.ts';
import { form, lesson, load, ok, reply, SNAPSHOT, unauthorized } from './helpers/ai-direct.ts';
import * as deepen from './helpers/deepen-direct.ts';

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
/** 加深（tasks/ai-direct.md §9）：工作照加深的讀法，快照另外改名一次，看 `對象` 以外是不是認得是同一份。 */
const DEEPEN_SCRIPT = `
import { isDeepenJob, readDeepenJobs, readSnapshot, retargetSnapshot } from './src/core/ai/index.ts';
import { sameButTargets } from './src/core/ai/deepen-snapshot.ts';
const { path, deck, snapshot, jobs, now, moved } = JSON.parse(process.argv[1]);
const read = readDeepenJobs(jobs, now);
const renamed = retargetSnapshot(snapshot, deck, moved, () => 0);
console.log(JSON.stringify({ snapshot: readSnapshot(path, snapshot), renamed, same: renamed !== null && sameButTargets(renamed, snapshot), isJob: jobs.map(isDeepenJob), kept: read.jobs.map(job => job.id), broken: read.broken }));
`;
async function oldRun<T = { snapshot: unknown; isJob: boolean[]; kept: string[]; broken: number }>(t: TestContext, input: unknown, script = SCRIPT): Promise<T> {
  const dir = await tempFolder(t, 'essence-v0.6.0-');
  git(root, 'clone', '-q', '--no-checkout', git(root, 'rev-parse', '--show-toplevel'), dir);
  git(dir, 'checkout', '-q', 'v0.6.0');
  const cards = join(dir, pluginRoot(dir, 'v0.6.0'));
  await symlink(join(root, 'node_modules'), join(cards, 'node_modules'), 'junction');
  const out = execFileSync(process.execPath, ['--input-type=module', '-e', script, JSON.stringify(input)], { cwd: cards, env, encoding: 'utf8' });
  return JSON.parse(out) as T;
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

void test('v0.6.0 讀直接製作的加深（§9）：快照的 readSnapshot、改名後的 retargetSnapshot 與 sameButTargets 和現在相同；收到了、失敗、開始寫的加深工作都讀得到', async t => {
  const now = deepen.NOW;
  const made = await deepen.load(t, [ok(deepen.REPLY)]);
  const outcome = await made.deepen.direct(deepen.DECK, '', '', undefined, [deepen.lesson]);
  assert.ok(outcome.kind === 'received');
  const receivedJob = made.deepen.jobOf(deepen.DECK)!;
  assert.equal((await made.deepen.save(outcome.job, outcome.reply, null, true)).kind, 'done');
  const { text: snapshot } = deepen.propsOf(made.memory);
  assert.ok(snapshot.includes('接法: API') && snapshot.includes('教材檔:'));
  // 失敗的工作，與開始寫（save 裡有 api）的工作：別的卡組，三份才分得開（同一篇只留一份）。
  const failing = await deepen.load(t, [unauthorized]);
  assert.equal((await failing.deepen.direct(deepen.DECK, '', '', undefined, [])).kind, 'failed');
  const failedJob = { ...failing.deepen.jobOf(deepen.DECK)!, id: 'failed', deck: 'Essence Cards/學業/國二上/自然/別篇.md' };
  const begunJob = { ...receivedJob, id: 'begun1', deck: 'Essence Cards/學業/國二上/自然/第三篇.md', save: { reply: deepen.REPLY, replySha: 'x', service: null, boxes: [], noteItems: [], ids: [], snapshotPath: deepen.SNAPSHOT, snapshotBase: 'b', snapshot, snapshotSha: 'y', writing: false, unclear: false, written: false, api: outcome.evidence } };
  const jobs = JSON.parse(JSON.stringify([receivedJob, failedJob, begunJob])) as unknown[];
  assert.deepEqual(jobs.map(isDeepenJob), [true, true, true]);
  const moved = 'Essence Cards/學業/國二上/自然/國二上自然 2-1 溫度與熱.md';
  const old = await oldRun<{ snapshot: unknown; renamed: string | null; same: boolean; isJob: boolean[]; kept: string[]; broken: number }>(t, { path: deepen.SNAPSHOT, deck: deepen.DECK, snapshot, jobs, now, moved }, DEEPEN_SCRIPT);
  const info = readSnapshot(deepen.SNAPSHOT, snapshot);
  assert.ok(info);
  assert.deepEqual(old.snapshot, JSON.parse(JSON.stringify(info)));
  assert.equal(old.renamed, retargetSnapshot(snapshot, deepen.DECK, moved, () => 0));
  assert.ok(old.renamed?.includes('溫度與熱'));
  assert.equal(old.same, true);
  assert.deepEqual(old.isJob, [true, true, true]);
  const read = readDeepenJobs(jobs, now);
  assert.deepEqual(old.kept, read.jobs.map(job => job.id));
  assert.equal(old.kept.length, 3);
  assert.equal(old.broken, 0);
});
