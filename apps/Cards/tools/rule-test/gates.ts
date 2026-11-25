// 比較測試工具：門檻（任務說明 tasks/rule-test-tool.md §6-3）。逐課、逐生成器、逐候選組各判一次，不跨課、不跨生成器合併：
// 重大錯誤（零，或不比基準多）、不多漏必備（逐列與總數，另查近義重複）、收益至少一項、不能變差（過、沒過、未定三態）。
// 候選和同一區組的基準比（§5-6）。所有指標都是越少越好；「明顯」用兩兩比的場數（stats.ts）。
import type { Gates, Metric } from './config.ts';
import { wins, winsNeeded } from './stats.ts';
import type { DeckMetrics } from './unblind.ts';

/** pass：true 過、false 沒過、null 未定。 */
interface Check { pass: boolean | null; text: string }
export interface GateResult {
  lesson: string; generator: string; candidate: string; baseline: string; counts: { candidate: number; baseline: number };
  major: Check; rows: Check; total: Check; nearDuplicates: Check;
  benefits: Check[]; noWorse: Check[];
  verdict: '過' | '沒過' | '未定';
  /** 隨便各抽一份，候選比較好的機會（平手算一半）。 */
  chance: Partial<Record<Metric, number>>;
}

const FIXED: readonly Metric[] = ['規則字數', '整份提示字數'];
const EPSILON = 1e-9;
/** 少於幾份時不判明顯（§6-3：任一組不到 3 份時，平均達標標「份數不夠」、超過容許量算未定）。 */
const ENOUGH = 3;

function valueOf(deck: DeckMetrics, metric: Metric): number | null {
  switch (metric) {
    case '規則字數': return deck.rulesChars;
    case '整份提示字數': return deck.promptChars;
    case '孩子會碰到的錯': return deck.childErrors;
    case '孩子會碰到的錯（不算多解）': return deck.childErrorsNoMulti;
    case '重大錯誤': return deck.major;
    case '題目品質': return deck.qualityTotal;
    case '近義重複': return deck.nearDuplicates;
    case '漏的必備': return deck.required.沒有;
    case '部分的必備': return deck.required.部分;
    case '題數': return deck.prompts;
    case '目標數': return deck.targets;
    case '生成時間': return deck.generationMs;
  }
}

const mean = (values: readonly number[]): number => values.reduce((total, each) => total + each, 0) / values.length;
const one = (value: number): string => value.toFixed(1);
const percent = (value: number): string => `${(value * 100).toFixed(1).replace(/\.0$/, '')}%`;

interface Series { c: number[]; b: number[]; meanC: number; meanB: number }
function series(candidate: readonly DeckMetrics[], baseline: readonly DeckMetrics[], metric: Metric): Series | null {
  const c = candidate.map(deck => valueOf(deck, metric)), b = baseline.map(deck => valueOf(deck, metric));
  if (c.some(each => each === null) || b.some(each => each === null)) return null;
  return { c: c as number[], b: b as number[], meanC: mean(c as number[]), meanB: mean(b as number[]) };
}
/** 候選比基準少了幾成（基準是 0 時：候選也是 0 算沒變，不然算無限多）。 */
const reduction = (s: Series): number => s.meanB === 0 ? (s.meanC === 0 ? 0 : -Infinity) : (s.meanB - s.meanC) / s.meanB;
/** a 組明顯比 b 組少（a 贏的場數達到門檻）。份數太少時永遠不明顯。 */
function clearly(a: readonly number[], b: readonly number[]): { yes: boolean; won: number; need: number | null } {
  const need = winsNeeded(a.length, b.length);
  const won = wins(a, b);
  return { yes: need !== null && won >= need - EPSILON, won, need };
}
const games = (won: number, a: number, b: number, need: number | null): string => `贏 ${String(won)}／${String(a * b)} 場${need === null ? '（份數太少，不會明顯）' : `（要 ${String(need)} 場）`}`;

/** 一個候選組對基準的門檻。candidate、baseline 是同一課、同一個生成器、同一區組裡的份。 */
export function judgeGates(gates: Gates, candidate: readonly DeckMetrics[], baseline: readonly DeckMetrics[]): Omit<GateResult, 'lesson' | 'generator' | 'candidate' | 'baseline'> {
  const n = candidate.length, m = baseline.length, few = n < ENOUGH || m < ENOUGH;
  const majors = (decks: readonly DeckMetrics[]): string[] => decks.flatMap(deck => deck.issues.filter(issue => issue.kind === '重大錯誤').map(issue => issue.rubric || '沒對到評分表的列'));

  let major: Check;
  const withMajor = candidate.filter(deck => deck.major > 0);
  if (gates.majorErrors === 'zero') {
    major = withMajor.length
      ? { pass: false, text: `重大錯誤：候選 ${String(n)} 份裡有 ${String(withMajor.length)} 份有（共 ${String(withMajor.reduce((total, deck) => total + deck.major, 0))} 筆）；設定是零` }
      : { pass: true, text: `重大錯誤：候選 ${String(n)} 份都是 0` };
  } else {
    const c = mean(candidate.map(deck => deck.major)), b = mean(baseline.map(deck => deck.major));
    const only = [...new Set(majors(candidate))].filter(kind => !majors(baseline).includes(kind));
    major = { pass: c <= b + EPSILON, text: `重大錯誤：候選每份平均 ${one(c)}、基準 ${one(b)}，${c <= b + EPSILON ? '不比基準多' : '比基準多'}${only.length ? `；只有候選才有的：${only.join('、')}` : ''}` };
  }

  const rowIds = [...new Set([...candidate, ...baseline].flatMap(deck => deck.missed))];
  const rate = (decks: readonly DeckMetrics[], id: string): number => decks.filter(deck => deck.missed.includes(id)).length / decks.length;
  const worseRows = rowIds.filter(id => rate(candidate, id) - rate(baseline, id) >= gates.rowMissGap - EPSILON);
  const rows: Check = worseRows.length
    ? { pass: false, text: `逐列：多漏 ${worseRows.map(id => `${id}（候選 ${String(candidate.filter(deck => deck.missed.includes(id)).length)}／${String(n)}、基準 ${String(baseline.filter(deck => deck.missed.includes(id)).length)}／${String(m)}）`).join('、')}；設定是漏的比例高出 ${String(gates.rowMissGap)} 以上算多漏` }
    : { pass: true, text: '逐列：沒有多漏的列' };
  const missC = mean(candidate.map(deck => deck.missed.length)), missB = mean(baseline.map(deck => deck.missed.length));
  const total: Check = { pass: missC - missB < gates.missedRows - EPSILON, text: `總數：候選每份漏 ${one(missC)} 列、基準 ${one(missB)} 列；設定是多 ${String(gates.missedRows)} 列以上算多漏` };
  const dupC = mean(candidate.map(deck => deck.nearDuplicates)), dupB = mean(baseline.map(deck => deck.nearDuplicates));
  const nearDuplicates: Check = { pass: dupC - dupB <= gates.nearDuplicates + EPSILON, text: `近義重複：候選每份 ${one(dupC)}、基準 ${one(dupB)}；設定是多出 ${String(gates.nearDuplicates)} 以內` };

  const chance: GateResult['chance'] = {};
  const benefits = gates.benefits.map(({ metric, atLeast }): Check => {
    const s = series(candidate, baseline, metric);
    if (!s) return { pass: false, text: `收益 ${metric}：沒有資料（手貼的沒有生成時間）` };
    chance[metric] = wins(s.c, s.b) / (n * m);
    const less = reduction(s), enough = less >= atLeast - EPSILON;
    const head = `收益 ${metric}：候選 ${one(s.meanC)}、基準 ${one(s.meanB)}，少 ${Number.isFinite(less) ? percent(less) : '（基準是 0）'}（設定至少 ${percent(atLeast)}）`;
    if (FIXED.includes(metric)) return { pass: enough, text: `${head}→ ${enough ? '達到' : '沒達到'}` };
    if (few) return { pass: enough, text: `${head}→ ${enough ? '平均達到（份數不夠）' : '沒達到'}` };
    const test = clearly(s.c, s.b);
    return { pass: enough && test.yes, text: `${head}，${games(test.won, n, m, test.need)}→ ${enough && test.yes ? '明顯達到' : enough ? '沒達到（不明顯）' : '沒達到'}` };
  });
  const noWorse = gates.noWorse.map(({ metric, tolerance }): Check => {
    const s = series(candidate, baseline, metric);
    if (!s) return { pass: null, text: `不能變差 ${metric}：沒有資料` };
    chance[metric] = wins(s.c, s.b) / (n * m);
    const more = -reduction(s);
    const head = `不能變差 ${metric}：候選 ${one(s.meanC)}、基準 ${one(s.meanB)}，${more > 0 ? `多 ${Number.isFinite(more) ? percent(more) : '（基準是 0）'}` : '沒有變多'}（容許 ${percent(tolerance)}）`;
    if (more <= tolerance + EPSILON) return { pass: true, text: `${head}→ 過` };
    if (few) return { pass: null, text: `${head}→ 未定（份數不夠）` };
    const test = clearly(s.b, s.c);
    return test.yes ? { pass: false, text: `${head}，基準${games(test.won, m, n, test.need)}→ 沒過（明顯）` } : { pass: null, text: `${head}，基準${games(test.won, m, n, test.need)}→ 未定（不明顯）` };
  });

  const hard = [major, rows, total, nearDuplicates];
  const benefit = benefits.some(each => each.pass === true);
  const verdict = hard.some(each => each.pass === false) || !benefit || noWorse.some(each => each.pass === false) ? '沒過' : noWorse.some(each => each.pass === null) ? '未定' : '過';
  return { counts: { candidate: n, baseline: m }, major, rows, total, nearDuplicates, benefits, noWorse, verdict, chance };
}

/** 照設定逐課、逐算門檻的生成器、逐候選組判；基準取和候選同一區組的那幾份。 */
export function allGates(gates: Gates, decks: readonly DeckMetrics[]): GateResult[] {
  const out: GateResult[] = [];
  for (const lesson of [...new Set(decks.map(deck => deck.lesson))]) {
    for (const generator of gates.generators) {
      for (const name of gates.candidates) {
        const candidate = decks.filter(deck => deck.lesson === lesson && deck.generator === generator && deck.group === name);
        if (!candidate.length) continue;
        const blocks = new Set(candidate.map(deck => `${String(deck.batch)}/${deck.block}`));
        const baseline = decks.filter(deck => deck.lesson === lesson && deck.generator === generator && deck.group === gates.baseline && blocks.has(`${String(deck.batch)}/${deck.block}`));
        if (!baseline.length) continue;
        out.push({ lesson, generator, candidate: name, baseline: gates.baseline, ...judgeGates(gates, candidate, baseline) });
      }
    }
  }
  return out;
}
