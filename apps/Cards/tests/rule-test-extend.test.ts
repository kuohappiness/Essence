// 比較測試工具的補跑（tasks/rule-test-tool.md §5-10、§8 第 12、15 條）：extend 寫進 追加.jsonl、不改 測試.yaml；
// 追加的份成為新的一批；第二批還沒鎖定時可以解開第一批；解開後才加的批標出來。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { blindFolder } from '../tools/rule-test/blind.ts';
import { checkFolder } from '../tools/rule-test/check.ts';
import { runDisputes } from '../tools/rule-test/disputes.ts';
import { extendFolder } from '../tools/rule-test/extend.ts';
import { sha256File, type Folder } from '../tools/rule-test/folder.ts';
import { readFrozenSteps, verifyLock } from '../tools/rule-test/freeze.ts';
import { runQueue } from '../tools/rule-test/generate.ts';
import { jobState, planJobs, readEvents } from '../tools/rule-test/jobs.ts';
import { runJudges } from '../tools/rule-test/judge.ts';
import { statusLines } from '../tools/rule-test/status.ts';
import { unblindFolder } from '../tools/rule-test/unblind.ts';
import { blinded, fakeJudge } from './helpers/rule-test.ts';

const REPLY = '````markdown\n國二上英文 L3 單字\n- borrow 英翻中\n    - borrow :: v. 借入\n<<<完>>>\n````';

/** 評一批到解開：兩位評審都沒記問題、沒寫拿不準，所以裁定不用開對話。 */
async function through(folder: Folder, batch: number): Promise<void> {
  await runJudges(folder, { adapters: { codex: fakeJudge().adapter, claude: fakeJudge().adapter }, log: () => {}, batch });
  await runDisputes(folder, { log: () => {}, batch, adapters: { claude: () => Promise.reject(Error('不該開裁定對話')) } });
  checkFolder(folder, () => {});
  unblindFolder(folder, { log: () => {}, batch });
}

void test('extend：只能加已凍結的課與生成器、要寫原因；每組各加同樣份數、號碼接在用過的之後；沒生成完不能再加', async () => {
  const folder = await blinded();
  const yaml = sha256File(join(folder.root, '測試.yaml'));
  assert.throws(() => extendFolder(folder, { lesson: 'L3', generator: 'codex', count: 1, reason: '補跑' }), /沒有叫「codex」的生成器/);
  assert.throws(() => extendFolder(folder, { lesson: 'L9', generator: 'claude', count: 1, reason: '補跑' }), /沒有跑課「L9」/);
  assert.throws(() => extendFolder(folder, { lesson: 'L3', generator: 'claude', count: 0, reason: '補跑' }), /份數要是 1 以上的整數/);
  assert.throws(() => extendFolder(folder, { lesson: 'L3', generator: 'claude', count: 1, reason: ' ' }), /要寫追加的原因/);
  const extension = extendFolder(folder, { lesson: 'L3', generator: 'claude', count: 2, reason: '結果相反，補跑' }, new Date('2026-11-25T08:00:00Z'));
  assert.deepEqual(extension, { time: '2026-11-25T08:00:00.000Z', lesson: 'L3', generator: 'claude', count: 2, reason: '結果相反，補跑', from: { 甲: 2, 乙: 2 }, afterBatch: null });
  const events = readEvents(folder);
  const jobs = planJobs(folder, readFrozenSteps(folder), events);
  assert.deepEqual(jobs.map(job => [job.key, jobState(events, job.key).status]), [
    ['甲-L3-claude-1', 'done'], ['甲-L3-claude-2', 'pending'], ['甲-L3-claude-3', 'pending'],
    ['乙-L3-claude-1', 'done'], ['乙-L3-claude-2', 'pending'], ['乙-L3-claude-3', 'pending'],
  ]);
  assert.throws(() => extendFolder(folder, { lesson: 'L3', generator: 'claude', count: 1, reason: '再補' }), /還有 4 份沒生成完/);
  assert.ok(statusLines(folder).includes('  追加：2026-11-25 課 L3、claude 每組 2 份（結果相反，補跑）'));
  assert.equal(sha256File(join(folder.root, '測試.yaml')), yaml);
  verifyLock(folder);
});

void test('補跑成為新的一批：第二批還沒鎖定時解開第一批；解開後才加的批標出來，門檻另報各批', async () => {
  const folder = await blinded();
  await through(folder, 1);
  extendFolder(folder, { lesson: 'L3', generator: 'claude', count: 1, reason: '結果相反，補跑' });
  await runQueue(folder, { adapters: { claude: () => Promise.resolve({ kind: 'ok', reply: REPLY, session: null, warnings: [], ms: 1, models: [] }) }, log: () => {} });
  const second = blindFolder(folder, { log: () => {} });
  assert.deepEqual([second.batch, second.entries.map(entry => entry.job).sort(), second.blocks.map(block => block.name)], [2, ['乙-L3-claude-2', '甲-L3-claude-2'], ['L3-B02']]);
  assert.deepEqual(second.entries.map(entry => entry.code).sort(), ['S3', 'S4']);
  // 第二批還沒評：第一批照樣解開（重寫報告），第二批停下。
  assert.equal(unblindFolder(folder, { log: () => {}, batch: 1 }).decks.length, 2);
  assert.throws(() => unblindFolder(folder, { log: () => {}, batch: 2 }), /批 2 還沒鎖定/);
  await through(folder, 2);
  const summary = readFileSync(join(folder.root, '結果', '摘要.md'), 'utf8');
  assert.match(summary, /- 批 2：.*（在前一批解開之後才匿名：看過前一批結果才決定加跑）/);
  assert.match(summary, /### L3｜claude｜乙 對 甲：未定\n\n- 學習面沒有明顯的差，但有指標多過容許量或份數不到打平的要求\n- 份數：候選 2、基準 2/);
  assert.match(summary, /- 各批：批 1 未定、批 2 未定\n- 含看過前一批結果才決定加跑的份（批 2）/);
});
