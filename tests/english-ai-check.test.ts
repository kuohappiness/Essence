import test from 'node:test';
import assert from 'node:assert/strict';
import { check } from '../src/core/ai/index.ts';

// AI 草稿的檢查比解析嚴（tasks/english-typed-order.md §5）：文法與變化讀不成打字、英文的排序卡認不出來，都算錯誤。
const codes = (text: string): string[] => check(text, { subject: '英文' }).issues.filter(each => each.level === '錯誤').map(each => each.code);

void test('文法與變化讀不成打字是錯誤；讀得成的不報', () => {
  assert.deepEqual(codes('- go 過去式\n    - Yesterday I ＿＿ to school.（去） :: 去了\n'), ['english-typed-invalid']);
  assert.deepEqual(codes('- 被動語態 文法\n    - The window ==was broken== yesterday.\n'), ['english-typed-invalid']);
  assert.deepEqual(codes('- go 過去式\n    - Yesterday I ＿＿ to school.（去） :: went\n'), []);
});

void test('英文的排序卡認不出來是錯誤：只有一格、標點包進最後一格又只剩標點', () => {
  assert.deepEqual(codes('- 間接問句 排序\n    - 我不知道他住在哪裡。I don\'t know ==where== he lives.\n'), ['english-order-invalid']);
  assert.deepEqual(codes('- 間接問句 排序\n    - 我不知道他住在哪裡。I don\'t know ==where== ==he== ==lives==.\n'), []);
  assert.deepEqual(codes('- 鳥鳴澗 全詩 排序\n    - ==人閒桂花落==，==夜靜春山空==。\n'), []);
});
