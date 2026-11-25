// 比較測試工具的〈評估規格〉（tasks/rule-test-d236.md §11、§13 第 2 條）：照固定設定產生的全文和預期檔相同；
// freeze 鎖住它、再跑不改；--confirmed 在事件裡記它的雜湊；份數讓收益永遠不會明顯時警告。
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readConfig } from '../tools/rule-test/config.ts';
import type { Folder } from '../tools/rule-test/folder.ts';
import { confirmSpec, type FrozenStep } from '../tools/rule-test/freeze.ts';
import { jobState, readEvents } from '../tools/rule-test/jobs.ts';
import { evaluationSpec, unreachable } from '../tools/rule-test/spec.ts';

const YAML = `
名稱: 規格測試
課庫: 課
課: [{ 代號: L3, 表單: { 科目: english, 年級學期: 國二上, 單元: L3 }, 已有目標: { vault: v } }]
組:
  - { 名稱: 現行, 規則: { 外掛: english } }
  - 名稱: 候選
    規則: { commit: 288ba1ef, 檔案: [apps/Cards/docs/card-rules/next/core.md], 任務段: { 三段: 要 } }
    加深規則: { commit: 288ba1ef, 檔案: [apps/Cards/docs/card-rules/next/core.md] }
生成: [{ 生成器: claude, 模型: claude-opus-5-5, 份數: 5 }, { 生成器: 手貼, 服務: ChatGPT, 模型: GPT-6.2 Thinking, 份數: 1 }]
評審: [{ 評審: codex, 模型: gpt-6.2-sol }, { 評審: claude, 模型: claude-fable-5-2 }]
門檻:
  基準: 現行
  候選: [候選]
  生成器: [claude]
  收益: [{ 指標: 傷到學習, 至少: 20% }, { 指標: 每個必備平均幾題, 至少: 10% }, { 指標: 加深機會漏掉, 至少: 20% }]
  次要: [{ 指標: token, 至少: 10%, 容許: 10% }]
錯誤分級: { 一題多事: 傷到學習 }
加深: { 生成器: [claude] }
對照: [{ 名稱: 候選的效果, 甲: 候選, 乙: 現行 }]
`;
const steps = [{ group: '現行', deck: true, threeSections: false }, { group: '候選', deck: true, threeSections: true }] as FrozenStep[];

void test('評估規格：照固定設定產生的全文和預期檔相同（適用表、分級、門檻的數字、校正後到不到得了、模擬的機會、對照的設定差別）', () => {
  const expected = readFileSync(join(import.meta.dirname, 'fixtures', 'rule-test-spec.txt'), 'utf8');
  assert.equal(evaluationSpec(readConfig(YAML), steps), expected);
});

void test('份數讓收益永遠不會明顯就警告：k＝3、每組 3 份，最好的情況 5% 大於 1.67%', () => {
  assert.deepEqual(unreachable(readConfig(YAML)), []);
  assert.deepEqual(unreachable(readConfig(YAML.replace('份數: 5', '份數: 3'))), ['生成器「claude」每組 3 份、收益 3 項（每項門檻 1.67%）：最好的情況 p＝5%，收益永遠不會明顯']);
});

void test('--confirmed 在事件裡記下〈評估規格〉的雜湊（使用者看過的就是這一份）；不屬於哪一份工作，不影響工作的狀態', () => {
  const root = mkdtempSync(join(tmpdir(), 'rule-test-spec-'));
  mkdirSync(join(root, '凍結'));
  writeFileSync(join(root, '凍結', '評估規格.md'), '# 評估規格\n');
  const folder = { root } as Folder;
  confirmSpec(folder);
  confirmSpec(folder, join('加深', '事件.jsonl'));
  const spec = createHash('sha256').update('# 評估規格\n').digest('hex');
  for (const log of [undefined, join('加深', '事件.jsonl')]) {
    const events = readEvents(folder, log);
    assert.deepEqual(events.map(event => [event.type, event.job, event.detail]), [['confirmed', undefined, { spec }]]);
    assert.equal(jobState(events, '甲-L3-claude-1').status, 'pending');
  }
});
