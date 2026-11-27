// 比較測試工具：兩兩比（任務說明 tasks/rule-test-d236.md §7-1）。候選的每一份和基準的每一份比，數候選贏幾場（平手算半場）；
// 明顯是「兩組混在一起隨便分，也贏這麼多場的機會」不超過門檻：照實際的值算每一種分法（有平手也算得對；用秩和的分布算，不逐一列舉）。

/** 數值越小越好時，a 組贏 b 組幾場（平手算半場）。 */
export function wins(a: readonly number[], b: readonly number[]): number {
  let total = 0;
  for (const x of a) for (const y of b) total += x < y ? 1 : x === y ? 0.5 : 0;
  return total;
}

/** C(n, k) 種分法；兩組的份數小（每組最多十來份），直接乘。 */
function choose(n: number, k: number): number {
  let out = 1;
  for (let i = 1; i <= k; i++) out = out * (n - k + i) / i;
  return Math.round(out);
}

/** 沒有平手時，a 份對 b 份最好的情況（全贏）的機會（tasks/rule-test-d236.md §7-1 第 3 點：〈評估規格〉印能不能到）。 */
export const bestP = (m: number, n: number): number => 1 / choose(m + n, m);

/**
 * 置換判定（rule-test-d236.md §7-1 第 2 點）：a 組（越小越好）贏 b 組的場數（平手算半場）是統計量；
 * 把兩組的觀察值混在一起，每一種分成 a、b 兩組的分法機會一樣，p＝場數不少於觀察值的分法的比例。有平手時也照實際的值算，不用沒有平手的分布。
 * 不逐一列舉（15 對 15 就有一億五千多萬種分法）：場數＝a 份數×b 份數＋a 份數×(a 份數＋1)／2－a 組的秩和（平手用平均秩），
 * 所以「場數不少於觀察值」就是「a 組的秩和不多於觀察值」；用動態規劃數每種份數、每種秩和各有幾種挑法。
 */
export function permutationP(a: readonly number[], b: readonly number[]): number {
  if (![...a, ...b].every(Number.isFinite)) throw Error(`兩兩比的值有不是有限的數：${JSON.stringify([a, b])}`);
  const pooled = [...a, ...b].sort((x, y) => x - y), m = a.length, total = pooled.length;
  // 秩乘 2，平手的平均秩也是整數。
  const doubled = new Map<number, number>();
  for (let i = 0; i < total;) {
    let j = i;
    while (j < total && pooled[j] === pooled[i]) j++;
    doubled.set(pooled[i], i + 1 + j);
    i = j;
  }
  const ranks = pooled.map(value => doubled.get(value) ?? 0);
  const observed = a.reduce((sum, value) => sum + (doubled.get(value) ?? 0), 0);
  const most = ranks.slice(total - m).reduce((sum, rank) => sum + rank, 0);
  // ways[j][s]：挑 j 份、秩和（乘 2）是 s 的挑法有幾種。份數多時數字很大，用浮點數；比的是比例，誤差遠小於門檻。
  const ways = Array.from({ length: m + 1 }, () => new Float64Array(most + 1));
  ways[0][0] = 1;
  for (const rank of ranks) {
    for (let j = m; j >= 1; j--) {
      const from = ways[j - 1], to = ways[j];
      for (let sum = most; sum >= rank; sum--) if (from[sum - rank]) to[sum] += from[sum - rank];
    }
  }
  let hit = 0, all = 0;
  ways[m].forEach((count, sum) => { all += count; if (sum <= observed) hit += count; });
  return hit / all;
}
