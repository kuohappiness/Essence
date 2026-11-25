// 比較測試工具：兩兩比（任務說明 tasks/rule-test-d236.md §7-1）。候選的每一份和基準的每一份比，數候選贏幾場（平手算半場）；
// 明顯是「兩組混在一起隨便分，也贏這麼多場的機會」不超過門檻：照實際的值列舉每一種分法（有平手也算得對）。

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
 * 把兩組的觀察值混在一起，列舉每一種分成 a、b 兩組的分法，p＝場數不少於觀察值的分法的比例。有平手時也照實際的值算，不用沒有平手的分布。
 */
export function permutationP(a: readonly number[], b: readonly number[]): number {
  const pooled = [...a, ...b], m = a.length;
  const observed = wins(a, b);
  let hit = 0, total = 0;
  const pick: number[] = [];
  const walk = (start: number): void => {
    if (pick.length === m) {
      const chosen = new Set(pick);
      const left = pick.map(i => pooled[i]), right = pooled.filter((_, i) => !chosen.has(i));
      total++;
      if (wins(left, right) >= observed - 1e-9) hit++;
      return;
    }
    for (let i = start; i <= pooled.length - (m - pick.length); i++) { pick.push(i); walk(i + 1); pick.pop(); }
  };
  walk(0);
  return hit / total;
}
