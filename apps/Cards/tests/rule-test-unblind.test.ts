// 比較測試工具的解開與結果（tasks/rule-test-tool.md §5-9、§6-1、§8 第 12、16 條）：鎖定、裁定都填了才讀對照表；
// 照裁定另算、算每一份的指標；摘要裡沒有評分表、卡組與教材的原文。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { checkFolder } from '../tools/rule-test/check.ts';
import { runDisputes } from '../tools/rule-test/disputes.ts';
import type { Folder } from '../tools/rule-test/folder.ts';
import { runJudges, type JudgeResult } from '../tools/rule-test/judge.ts';
import { statusLines } from '../tools/rule-test/status.ts';
import { unblindFolder } from '../tools/rule-test/unblind.ts';
import { blinded, fakeJudge, RUBRIC } from './helpers/rule-test.ts';

// 乙的第一個目標有兩題，彼此的題幹有對方的答案（程式找的洩漏候選）。
const SECOND = '````markdown\n國二上英文 L3 單字\n- borrow 的用法\n    - borrow 英翻中 :: **借入**\n    - 「借入」的英文 :: borrow\n- lend 英翻中\n    - lend :: v. 借出\n<<<完>>>\n````';
const CROSS_RUBRIC = RUBRIC.replace(' 加題 aaaaa2 ', ' 另立 ');

/** 兩位評審照自編的判定交（見各行的註）；回傳每一組的代號。 */
async function judged(): Promise<{ folder: Folder; code: Record<'甲' | '乙', string> }> {
  const folder = await blinded({ 乙: SECOND }, '', CROSS_RUBRIC);
  const decks = join(folder.root, '評分', '批1', '卡組', 'L3');
  const codes = readdirSync(decks).map(name => name.replace('.md', ''));
  const second = codes.find(code => readFileSync(join(decks, `${code}.md`), 'utf8').includes('「借入」的英文'))!;
  const code = { 甲: codes.find(each => each !== second)!, 乙: second };
  const set = (result: JudgeResult, row: string, deck: string, verdict: '有' | '部分' | '沒有'): void => {
    const cell = result.rows.find(each => each.row === row)!.decks.find(each => each.deck === deck)!;
    cell.verdict = verdict;
    if (verdict === '沒有') { cell.lines = []; cell.evidence = ''; }
  };
  const codex = fakeJudge({
    shape: result => {
      set(result, 'R2', code.甲, '沒有');
      result.issues.push({ deck: code.乙, kind: '多解', lines: [3], rubric: '', note: '借入、借用都對' }, { deck: code.乙, kind: '重大錯誤', lines: [6], rubric: 'M1', note: 'lend 的字義' });
      result.unsure = '乙的第二題算不算考到 R2';
    },
  });
  const fable = fakeJudge({
    shape: result => {
      set(result, 'R1', code.乙, '部分'); // 和 Codex 的「有」合併成部分（歧見）
      set(result, 'R2', code.甲, '沒有');
      result.issues.push({ deck: code.乙, kind: '多解', lines: [2], rubric: '', note: '' }, { deck: code.甲, kind: '近義重複', lines: [3, 5], rubric: '', note: '' }, { deck: code.乙, kind: '跨單元去向', lines: [5], rubric: 'R2', note: '' });
    },
  });
  await runJudges(folder, { adapters: { codex: codex.adapter, claude: fable.adapter }, log: () => {} });
  return { folder, code };
}

const ruling = (folder: Folder): Promise<void> => runDisputes(folder, {
  adapters: {
    claude: request => {
      request.record('{}', '');
      const value = request.text.startsWith('# 裁定說明') ? { verdict: '不成立', quality: '其他品質', reason: '第 6 行的字義沒錯，但詳解不清楚' }
        : { items: [{ notes: ['U1'], kind: '教學選擇', question: 'R2 要不要算必備？', answer: '' }] };
      return Promise.resolve({ kind: 'ok', reply: JSON.stringify(value), session: 's', warnings: [], ms: 1, models: [], structured: value });
    },
  },
  log: () => {},
});

void test('unblind：沒鎖定、沒裁定、教學選擇沒填或寫錯、沒做格式檢查都停下；都好了才解開', async () => {
  const folder = await blinded();
  assert.throws(() => unblindFolder(folder, { log: () => {} }), /批 1 還沒鎖定/);
  assert.ok(statusLines(folder).includes('批 1：2 份、1 個區組｜評分 0／2（下一步：judge）'));
  const { folder: judgedFolder } = await judged();
  assert.ok(statusLines(judgedFolder).includes('批 1：2 份、1 個區組｜已鎖定（下一步：disputes）'));
  assert.throws(() => unblindFolder(judgedFolder, { log: () => {} }), /批 1 還沒裁定（先跑 disputes）/);
  await ruling(judgedFolder);
  assert.ok(statusLines(judgedFolder).includes('批 1：2 份、1 個區組｜已裁定（教學選擇填好後：unblind）'));
  const file = join(judgedFolder.root, '評分', '批1', '裁定.md');
  assert.throws(() => unblindFolder(judgedFolder, { log: () => {} }), /C1 是教學選擇，「使用者的選擇」還沒填/);
  const text = readFileSync(file, 'utf8');
  writeFileSync(file, text.replace('| R2 要不要算必備？ |  |  |', '| R2 要不要算必備？ |  | R9 改必備 |'));
  assert.throws(() => unblindFolder(judgedFolder, { log: () => {} }), /C1：「R9」不是 L3 評分表的必備或加分列/);
  writeFileSync(file, text.replace('| R2 要不要算必備？ |  |  |', '| R2 要不要算必備？ |  | R2 改必備 |'));
  assert.throws(() => unblindFolder(judgedFolder, { log: () => {} }), /還有 2 份沒做格式檢查（先跑 check）/);
  checkFolder(judgedFolder, () => {});
  assert.equal(unblindFolder(judgedFolder, { log: () => {} }).decks.length, 2);
  assert.ok(statusLines(judgedFolder).includes('批 1：2 份、1 個區組｜已解開（結果/）'));
});

void test('指標：照合併表與裁定另算；問題兩位聯集去重；教學選擇改了列的類別；程式找的洩漏候選另列', async () => {
  const { folder, code } = await judged();
  await ruling(folder);
  const file = join(folder.root, '評分', '批1', '裁定.md');
  writeFileSync(file, readFileSync(file, 'utf8').replace('| R2 要不要算必備？ |  |  |', '| R2 要不要算必備？ |  | R2 改必備 |'));
  checkFolder(folder, () => {});
  const report = unblindFolder(folder, { log: () => {} });
  const first = report.decks.find(deck => deck.code === code.甲)!, second = report.decks.find(deck => deck.code === code.乙)!;
  assert.deepEqual([first.group, second.group], ['甲', '乙']);
  // R2 改成必備：甲兩位都沒有＝漏；乙 R1 一有一部分＝部分。
  assert.deepEqual([first.required, first.missed, first.partial, first.bonus.有], [{ 有: 1, 部分: 0, 沒有: 1 }, ['R2'], [], 0]);
  assert.deepEqual([second.required, second.missed, second.partial, second.disagreements], [{ 有: 1, 部分: 1, 沒有: 0 }, [], ['R1'], 1]);
  // 乙：多解兩位都記（名稱行和題目行算同一題）；只有 Codex 記的重大錯誤裁定不成立、改記其他品質；跨單元去向錯一列。
  assert.deepEqual([second.major, second.quality.多解, second.quality.其他品質, second.qualityBoth, second.qualityOne], [0, 1, 1, 1, 1]);
  assert.deepEqual([second.childErrors, second.childErrorsNoMulti, second.crossRows, second.crossWrong], [2, 1, 1, 1]);
  assert.deepEqual([second.targets, second.prompts, second.perQuestion], [2, 3, 2 / 3]);
  assert.deepEqual(second.leakCandidates, ['目標 1 第 1 題的題幹有第 2 題的答案', '目標 1 第 2 題的題幹有第 1 題的答案']);
  assert.deepEqual([first.nearDuplicates, first.childErrors, first.targets, first.prompts, first.leakCandidates], [1, 0, 2, 2, []]);
  assert.equal(first.generationMs, 1200);
  assert.deepEqual(first.byJudge, { codex: { missed: 1, issues: 0 }, claude: { missed: 1, issues: 1 } });
  assert.deepEqual(report.rows.L3.map(each => [each.id, each.effect]), [['R1', null], ['R2', '改必備'], ['M1', null]]);
});

void test('結果：摘要沒有評分表、卡組與教材的原文；使用紀錄加一行；再跑不重算、不重記', async () => {
  const { folder } = await judged();
  await ruling(folder);
  const file = join(folder.root, '評分', '批1', '裁定.md');
  writeFileSync(file, readFileSync(file, 'utf8').replace('| R2 要不要算必備？ |  |  |', '| R2 要不要算必備？ |  | 照原樣 |'));
  checkFolder(folder, () => {});
  unblindFolder(folder, { log: () => {} });
  const summary = readFileSync(join(folder.root, '結果', '摘要.md'), 'utf8');
  for (const secret of ['borrow', 'lend', '借入', '借出', '字義', '假的', '詳解', '第 6 行']) assert.ok(!summary.includes(secret), `摘要裡有「${secret}」`);
  assert.match(summary, /\| 甲 \| 1 \| 0\.0 \| 0\.0 \| 0\.0 \| 0\.0 \| 1\.0 \| 0\.0 \| 0\.0 \| 0\.000 \| 2\.0 \| 2\.0 \| 0／1 \|/);
  assert.match(summary, /\| 乙 \| 1 \| 0\.0 \| 1\.0 \| 0\.0 \| 2\.0 \| 0\.0 \| 2\.0 \| 1\.0 \| 0\.667 \| 2\.0 \| 3\.0 \| 0／1 \|/);
  // 門檻：規則字數一樣，收益沒達到。
  assert.match(summary, /### L3｜claude｜乙 對 甲：沒過\n\n- 份數：候選 1、基準 1（不到 3 份/);
  assert.match(summary, /- ［過］ 重大錯誤：候選每份平均 0.0、基準 0.0，不比基準多\n/);
  assert.match(summary, /- ［沒過］ 收益 規則字數：.*少 0%（設定至少 1%）→ 沒達到\n/);
  const detail = readFileSync(join(folder.root, '結果', '明細.md'), 'utf8');
  assert.match(detail, /多解 目標 1 第 1 題，codex、claude：借入、借用都對/);
  assert.match(detail, /M1：L3-B01 S\d 目標 2 第 1 題：不成立，改記其他品質/);
  const log = join(folder.root, '課', 'L3', '使用紀錄.md');
  assert.match(readFileSync(log, 'utf8'), /^- \d{4}-\d{2}-\d{2}「評分測試」批 1 解開，commit [0-9a-f]{40}（組：甲、乙）\n$/);
  unblindFolder(folder, { log: () => {} });
  assert.equal(readFileSync(log, 'utf8').split('\n').filter(Boolean).length, 1);
});
