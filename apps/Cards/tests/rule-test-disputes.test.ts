// 比較測試工具的裁定（tasks/rule-test-tool.md §5-8）：鎖定後才合併；只有一位記的重大錯誤一筆一個隔離對話，拿不準彙成一個對話。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Adapter, StepRequest } from '../tools/rule-test/adapters.ts';
import { collectDisputes, mergeBatch, runDisputes } from '../tools/rule-test/disputes.ts';
import type { Folder } from '../tools/rule-test/folder.ts';
import { runJudges } from '../tools/rule-test/judge.ts';
import { blinded, fakeJudge } from './helpers/rule-test.ts';

/** Codex 記兩筆重大錯誤、寫一句拿不準；Fable 只記第一份的那一筆（記在名稱行，和題目行算同一題）。 */
async function judged(): Promise<{ folder: Folder; codes: string[] }> {
  const folder = await blinded();
  let codes: string[] = [];
  const codex = fakeJudge({
    shape: (result, given) => {
      codes = given;
      result.issues.push({ deck: given[0], kind: '重大錯誤', lines: [3], rubric: 'M1', note: '字義教錯' }, { deck: given[1], kind: '重大錯誤', lines: [5], rubric: 'M1', note: 'lend 教成借入' });
      result.unsure = '列 R1 只考英翻中算不算有';
    },
  });
  const fable = fakeJudge({ shape: (result, given) => { result.issues.push({ deck: given[0], kind: '重大錯誤', lines: [2], rubric: 'M1', note: '' }); } });
  await runJudges(folder, { adapters: { codex: codex.adapter, claude: fable.adapter }, log: () => {} });
  return { folder, codes };
}

/** 假的裁定者：記下每次的提示與當時資料夾裡的檔（對話結束就刪了）；拿不準第一次交的漏了一筆。 */
function fakeAdjudicator(): { adapter: Adapter; requests: { request: StepRequest; files: string[] }[] } {
  const requests: { request: StepRequest; files: string[] }[] = [];
  return {
    requests,
    adapter: request => {
      requests.push({ request, files: readdirSync(request.cwd, { recursive: true }).map(String).sort() });
      request.record('{}', '');
      const value = request.text.startsWith('# 裁定說明') ? { verdict: '不成立', quality: '多解', reason: 'p.3 寫的是借出' }
        : request.resume === null ? { items: [] } : { items: [{ notes: ['U1'], kind: '教學選擇', question: 'R1 要不要算必備？', answer: '' }] };
      return Promise.resolve({ kind: 'ok', reply: JSON.stringify(value), session: 'ruling-1', warnings: [], ms: 1, models: [], structured: value });
    },
  };
}

void test('合併：那一批鎖定前停下；鎖定後結果檔改過也停下', async () => {
  const folder = await blinded();
  assert.throws(() => mergeBatch(folder, 1), /批 1 還沒鎖定/);
  await runJudges(folder, { adapters: { codex: fakeJudge().adapter, claude: fakeJudge().adapter }, log: () => {} });
  assert.equal(mergeBatch(folder, 1).entries.length, 2);
  const file = join(folder.root, '評分', '批1', '結果', 'codex', 'L3-B01.json');
  writeFileSync(file, readFileSync(file, 'utf8').replace('"有"', '"沒有"'));
  assert.throws(() => mergeBatch(folder, 1), /結果\/codex\/L3-B01\.json 改過/);
});

void test('要裁定的：只有一位記的重大錯誤（兩位都記的不用），與評審寫了的拿不準', async () => {
  const { folder, codes } = await judged();
  const { majors, unsure } = collectDisputes(mergeBatch(folder, 1));
  assert.deepEqual(majors, [{ id: 'M1', lesson: 'L3', block: 'L3-B01', code: codes[1], at: '目標 2 第 1 題', lines: [5], rubric: 'M1', judge: 'codex', note: 'lend 教成借入' }]);
  assert.deepEqual(unsure, [{ id: 'U1', lesson: 'L3', block: 'L3-B01', judge: 'codex', text: '列 R1 只考英翻中算不算有' }]);
});

void test('disputes：重大錯誤一筆一個隔離對話（只有那一份卡組、附教材）；拿不準彙成一個對話；都做完寫 裁定.md，重跑不再開對話', async () => {
  const { folder, codes } = await judged();
  const fake = fakeAdjudicator();
  await runDisputes(folder, { adapters: { claude: fake.adapter }, log: () => {} });
  const [major, unsure, fix] = fake.requests;
  assert.equal(fake.requests.length, 3);
  assert.deepEqual(major.files, ['卡組', `卡組/${codes[1]}.md`, '已有目標.json', '教材.pdf', '評分表.md']);
  assert.equal(major.request.model, 'claude-opus-5-5');
  assert.ok(major.request.pdf !== null);
  assert.match(major.request.text, /- 位置：目標 2 第 1 題（行號 5）\n- 評審記的：重大錯誤，對到評分表的 M1；說明：lend 教成借入/);
  assert.match(major.request.text, /## 附：評審拿到的評分說明（定義照這一份）\n\n### 評分說明/);
  assert.equal(unsure.request.pdf, null);
  assert.deepEqual(unsure.files, ['卡組', '卡組/L3', ...codes.map(code => `卡組/L3/${code}.md`).sort(), '評分表', '評分表/L3.md']);
  assert.match(unsure.request.text, /- U1（課 L3）：列 R1 只考英翻中算不算有/);
  assert.equal(fix.request.resume, 'ruling-1');
  assert.match(fix.request.text, /這幾筆沒有放進任何一項：U1/);
  const rulings = readFileSync(join(folder.root, '評分', '批1', '裁定.md'), 'utf8');
  assert.ok(rulings.includes(`| M1 | L3 | L3-B01 | ${codes[1]} | 目標 2 第 1 題 | 5 | M1 | codex | lend 教成借入 | 不成立 | 多解 | p.3 寫的是借出 |`));
  assert.ok(rulings.includes('| U1 | L3 | L3-B01 | codex | 列 R1 只考英翻中算不算有 |'));
  assert.ok(rulings.includes('| C1 | U1 | 教學選擇 | R1 要不要算必備？ |  |  |'));
  // 操作的 Claude 照使用者的話填了之後，重跑不開對話、不蓋掉。
  writeFileSync(join(folder.root, '評分', '批1', '裁定.md'), rulings.replace('| R1 要不要算必備？ |  |  |', '| R1 要不要算必備？ |  | 照原樣 |'));
  await runDisputes(folder, { adapters: { claude: fake.adapter }, log: () => {} });
  assert.equal(fake.requests.length, 3);
  assert.match(readFileSync(join(folder.root, '評分', '批1', '裁定.md'), 'utf8'), /\| 照原樣 \|/);
});
