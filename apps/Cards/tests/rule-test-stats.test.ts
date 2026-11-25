// 比較測試工具的兩兩比（tasks/rule-test-d236.md §7-1）：有平手時照觀察值置換，預期值是手算或列舉的字面值。
import test from 'node:test';
import assert from 'node:assert/strict';
import { bestP, permutationP } from '../tools/rule-test/stats.ts';

void test('沒有平手：全贏的機會是 1／C(n+m, n)', () => {
  assert.equal(permutationP([0, 1, 2], [3, 4, 5]), 1 / 20);
  assert.equal(permutationP([0, 1, 2, 3], [4, 5, 6, 7]), 1 / 70);
  assert.equal(permutationP([0, 1, 2, 3, 4], [5, 6, 7, 8, 9]), 1 / 252);
  assert.equal(bestP(3, 3), 1 / 20);
  assert.equal(bestP(5, 5), 1 / 252);
  assert.equal(bestP(1, 1), 1 / 2);
});

void test('有平手：照觀察值列舉（第一輪查核的例子 15／252，不是沒有平手時的門檻）', () => {
  assert.equal(permutationP([0, 1, 1, 1, 1], [1, 1, 2, 2, 2]), 15 / 252);
  assert.ok(Math.abs(permutationP([0, 0, 0, 0, 1], [1, 1, 1, 1, 2]) - 0.0198) < 0.0001);
  assert.ok(Math.abs(permutationP([0, 0, 0, 0, 0], [0, 1, 1, 1, 1]) - 0.0238) < 0.0001);
});

void test('全部一樣、或候選比較差：p 是 1 或接近 1', () => {
  assert.equal(permutationP([2, 2, 2], [2, 2, 2]), 1);
  assert.equal(permutationP([5, 6, 7], [0, 1, 2]), 1);
});
