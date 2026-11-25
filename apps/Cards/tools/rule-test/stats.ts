// 比較測試工具：兩兩比（任務說明 tasks/rule-test-tool.md §6-3「明顯」）。候選的每一份和基準的每一份比，數候選贏幾場（平手算半場）；
// 門檻是「隨便亂排也贏這麼多場的機會在 5% 以下」：照兩組實際的份數，用 Mann–Whitney U 的精確分布現算（份數不同也算得出）。

/** 數值越小越好時，a 組贏 b 組幾場（平手算半場）。 */
export function wins(a: readonly number[], b: readonly number[]): number {
  let total = 0;
  for (const x of a) for (const y of b) total += x < y ? 1 : x === y ? 0.5 : 0;
  return total;
}

/** m 份對 n 份，U 的每一個值有幾種排法（沒有平手時的精確分布）。 */
function distribution(m: number, n: number): number[] {
  // count[i][j][u]：i 份對 j 份、U＝u 的排法數；遞迴 f(i,j,u) = f(i-1,j,u-j) + f(i,j-1,u)。
  const memo = new Map<string, number[]>();
  const f = (i: number, j: number): number[] => {
    if (i === 0 || j === 0) return [1];
    const key = `${String(i)},${String(j)}`;
    const hit = memo.get(key);
    if (hit) return hit;
    const left = f(i - 1, j), right = f(i, j - 1);
    const out = new Array<number>(i * j + 1).fill(0);
    left.forEach((count, u) => { out[u + j] += count; });
    right.forEach((count, u) => { out[u] += count; });
    memo.set(key, out);
    return out;
  };
  return f(m, n);
}

/** 要贏幾場才算明顯（單尾 5%）；份數太少、全贏也到不了時是 null。 */
export function winsNeeded(m: number, n: number, alpha = 0.05): number | null {
  if (m < 1 || n < 1) return null;
  const counts = distribution(m, n);
  const total = counts.reduce((sum, each) => sum + each, 0);
  let tail = 0;
  for (let u = m * n; u >= 0; u--) {
    if ((tail + counts[u]) / total > alpha) return u === m * n ? null : u + 1;
    tail += counts[u];
  }
  return 0;
}
