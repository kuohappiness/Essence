import test from 'node:test';
import assert from 'node:assert/strict';
import { check } from '../src/core/ai/index.ts';

// tasks/ai-cards-add.md §5 第 2 點：疑似重複放候選，不算進候選五項的上限；理由不全照樣是疑似重複，檢查提示格式。只用自編的內容。

const BODY = '## 1 密度\n\n- 能說出密度\n    - 出處：p.40\n    - 密度怎麼算？ :: 質量除以體積\n';
const candidate = (name: string, reason: string): string => `> - ${name}\n>     - 理由：${reason}\n>     - 出處：p.41\n>     - ${name}是什麼？ :: 一種性質`;
const box = (...items: string[]): string => `\n> [!note]- 候選卡片\n${items.join('\n')}\n`;
const codesOf = (text: string): string[] => check(text, { subject: '自然' }).issues.map(each => each.code).filter(code => code.startsWith('candidate'));
const general = (n: number): string[] => Array.from({ length: n }, (_, i) => candidate(`一般候選${String(i + 1)}`, 'x'));

void test('§5 五個一般候選加兩個疑似重複不超限；六個一般候選照樣超限', () => {
  assert.deepEqual(codesOf(BODY + box(...general(5), candidate('疑似甲', '可能重複 k3m9qa｜第一題要看圖'), candidate('疑似乙', '可能重複 [[舊卡組#^k3m9qa|原目標]]｜只涵蓋一部分'))), []);
  assert.deepEqual(codesOf(BODY + box(...general(6))), ['candidate-count']);
});

void test('§5 疑似重複的理由不全（沒有 ID、沒有 ｜ 與說明）：提醒格式，照樣不算一般候選', () => {
  const found = check(BODY + box(...general(5), candidate('疑似甲', '可能重複 [[舊卡組#^k3m9qa|原目標]]'), candidate('疑似乙', '可能重複')), { subject: '自然' }).issues.filter(each => each.code.startsWith('candidate'));
  assert.deepEqual(found.map(each => [each.level, each.code]), [['提醒', 'candidate-suspect-format'], ['提醒', 'candidate-suspect-format']]);
});
