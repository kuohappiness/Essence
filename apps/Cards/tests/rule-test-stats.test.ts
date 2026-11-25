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

// 份數多時不能逐一列舉（15 對 15 有 C(30,15)＝155,117,520 種分法）：照秩和的分布算，結果要和逐一列舉的一樣。
const enumerate = (a: readonly number[], b: readonly number[]): number => {
  const pooled = [...a, ...b], wins = (x: readonly number[], y: readonly number[]): number => x.reduce((t, u) => t + y.reduce((s, v) => s + (u < v ? 1 : u === v ? 0.5 : 0), 0), 0);
  const observed = wins(a, b);
  let hit = 0, total = 0;
  for (let mask = 0; mask < 1 << pooled.length; mask++) {
    const left = pooled.filter((_, i) => mask >> i & 1), right = pooled.filter((_, i) => !(mask >> i & 1));
    if (left.length !== a.length) continue;
    total++;
    if (wins(left, right) >= observed - 1e-9) hit++;
  }
  return hit / total;
};

void test('和逐一列舉一樣：有平手、兩組份數不同', () => {
  let seed = 7;
  const next = (): number => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  for (let round = 0; round < 200; round++) {
    const a = Array.from({ length: 1 + Math.floor(next() * 6) }, () => Math.floor(next() * 4));
    const b = Array.from({ length: 1 + Math.floor(next() * 6) }, () => Math.floor(next() * 4));
    assert.ok(Math.abs(permutationP(a, b) - enumerate(a, b)) < 1e-12, `${JSON.stringify(a)} 對 ${JSON.stringify(b)}`);
  }
});

void test('份數多也很快：15 對 15 全贏是 1／155,117,520；30 對 30 全部一樣是 1', { timeout: 2000 }, () => {
  const range = (from: number): number[] => Array.from({ length: 15 }, (_, i) => from + i);
  assert.equal(permutationP(range(0), range(15)), 1 / 155_117_520);
  assert.equal(permutationP(Array.from({ length: 30 }, () => 2), Array.from({ length: 30 }, () => 2)), 1);
});
