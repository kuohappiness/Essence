// 費用（docs/tasks/ai-client.md〈7〉第 9 點）：只在目錄有價格時算，照牌價、不含免費額度，一律標「估計」與查價日期。
import type { Cost, ModelSpec, PriceSpec, Usage } from './types.ts';

/** 那一天適用的價格：effectiveFrom 不晚於那天的最後一筆。 */
function pickPrice(model: ModelSpec | undefined, day: string): PriceSpec | null {
  let chosen: PriceSpec | null = null;
  for (const price of model?.prices ?? []) {
    if (price.effectiveFrom !== undefined && price.effectiveFrom > day) continue;
    if (!chosen || (price.effectiveFrom ?? '') >= (chosen.effectiveFrom ?? '')) chosen = price;
  }
  return chosen;
}

interface Rates { input: number; output: number; cached: number; write: number }

function ratesFor(price: PriceSpec, inputTokens: number): Rates {
  const lc = price.longContext;
  if (lc && inputTokens > lc.aboveInputTokens) {
    const scale = price.input > 0 ? lc.input / price.input : 1;
    return { input: lc.input, output: lc.output, cached: lc.cachedInput ?? lc.input, write: (price.cacheWrite ?? price.input) * scale };
  }
  return { input: price.input, output: price.output, cached: price.cachedInput ?? price.input, write: price.cacheWrite ?? price.input };
}

/** 去掉浮點數的雜訊（到 10^-10 美元）。 */
const round = (amount: number): number => Math.round(amount * 1e10) / 1e10;

export function costOf(usage: Usage, model: ModelSpec | undefined, day: string): Cost | null {
  const price = pickPrice(model, day);
  if (!price || usage.inputTokens === null || usage.outputTokens === null) return null;
  const rates = ratesFor(price, usage.inputTokens);
  const cached = usage.cachedInputTokens ?? 0;
  const written = usage.cacheWriteInputTokens ?? 0;
  const plain = Math.max(0, usage.inputTokens - cached - written);
  const amount = (plain * rates.input + cached * rates.cached + written * rates.write + usage.outputTokens * rates.output) / 1e6;
  return { amount: round(amount), currency: 'USD', estimated: true, pricesAsOf: model?.pricesAsOf ?? null };
}
