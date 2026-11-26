// 比較測試工具：門檻（任務說明 tasks/rule-test-d236.md §7，取代 rule-test-tool.md §6-3 的收益與不能變差）。逐課、逐生成器、逐候選組各判一次：
// 重大（不比基準多或零）、不多漏必備（逐列、總數、多餘的題）、傷到學習（三態）、收益（學習面，至少一項明顯）、不能變差（學習面全部，明顯變差才沒過），
// 都過而收益沒有明顯時看打平與次要指標。候選只和同一個區組裡的基準配對，收進來以後兩組混在一起做置換判定（stats.ts）。所有指標都是越少越好。
import { LEARNING_METRICS, type Gates, type LearningMetric, type SecondaryMetric, type Tolerance } from './config.ts';
import { permutationP, wins } from './stats.ts';
import type { DeckMetrics } from './unblind.ts';

/** pass：true 過、false 沒過、null 未定。 */
interface Check { pass: boolean | null; text: string }
type BenefitState = 'clear' | 'few' | 'no' | 'skip' | 'unknown';
type WorseState = 'within' | 'more' | 'worse' | 'skip' | 'unknown';
type Verdict = '過' | '沒過' | '未定' | '打平' | '打平，候選較省';
export interface GateResult {
  lesson: string; generator: string; candidate: string; baseline: string;
  /** 進門檻的份數；unpaired 是候選裡區組沒有基準、alone 是基準裡區組沒有候選的份數，都不進門檻（§7-1 第 1 點）。 */
  counts: { candidate: number; baseline: number; unpaired: number; alone: number };
  major: Check; rows: Check; total: Check; extra: Check; harm: Check;
  /** 時間預算（檢查表課 3）：設定只報告時，標出來也是過。 */
  budget: Check;
  benefits: (Check & { metric: LearningMetric; state: BenefitState })[];
  noWorse: (Check & { metric: LearningMetric; state: WorseState })[];
  secondary: (Check & { metric: SecondaryMetric })[];
  verdict: Verdict;
  /** 結果的理由（一句）；「過」可能是學習面打平、候選較省（設定 打平較省: 過）。 */
  basis: string;
  /** 隨便各抽一份，候選比較好的機會（平手算一半）。 */
  chance: Partial<Record<string, number>>;
}

const FIXED: readonly SecondaryMetric[] = ['規則字數', '整份提示字數'];
/** 基準有區組沒有候選：算門檻的組份數一樣（F11），所以是候選的有效原稿補不滿（§7-1 第 1 點：進門檻的份數少於設定的份數是未定）。 */
const lonelyBaseline = (alone: number): string => `基準有 ${String(alone)} 份的區組沒有候選（候選的有效份數比設定的少），配對的份數不夠`;
const EPSILON = 1e-9;
/** 少於幾份時不判明顯（rule-test-d236.md §7-2 第 4 道：份數不夠）。 */
const ENOUGH = 3;
const ALPHA = 0.05;
/** 時間預算：目標數比基準多超過這個比例、確定考到的必備又沒多，標出來（檢查表課 3、A6）。 */
const BUDGET = 0.15;

/** drop：這一份不算進這個指標（卡組存不了、不能加深時的確定接錯，rule-test-d236.md §2-1）。 */
export type Value = number | 'na' | 'unknown' | 'drop';

/** 學習面指標的值（§7-2 第 4 道的清單）；na 是這一組不適用（不交地圖、沒跑加深）。 */
export function learningValue(deck: DeckMetrics, metric: LearningMetric): Value {
  switch (metric) {
    case '傷到學習': return deck.harm.total + (deck.deepen?.harm ?? 0);
    case '判錯': return deck.harm.判錯;
    case '每個必備平均幾題': return deck.perRequired;
    case '多餘的題': return deck.extraPrompts;
    case '地圖漏的必備': return deck.map ? deck.map.missed : 'na';
    case '地圖問題': return deck.map ? deck.map.issues : 'na';
    case '加深機會漏掉': return deck.deepen ? deck.deepen.missed : 'na';
    case '確定接錯': return deck.deepen ? deck.deepen.wrong ?? 'drop' : 'na';
  }
}
export function secondaryValue(deck: DeckMetrics, metric: SecondaryMetric): Value {
  switch (metric) {
    case '規則字數': return deck.rulesChars;
    case '整份提示字數': return deck.promptChars;
    case 'token': return deck.tokens.input === null || deck.tokens.output === null ? 'unknown' : deck.tokens.input + deck.tokens.output;
    case '生成時間': return deck.generationMs ?? 'unknown';
  }
}

const mean = (values: readonly number[]): number => values.reduce((total, each) => total + each, 0) / values.length;
const one = (value: number): string => value.toFixed(1);
const percent = (value: number): string => `${(value * 100).toFixed(1).replace(/\.0$/, '')}%`;
const pText = (p: number): string => `p＝${percent(p)}`;

interface Series { c: number[]; b: number[]; meanC: number; meanB: number }
type SeriesOr = Series | { skip: string } | { unknown: string };
const DEEPEN: readonly LearningMetric[] = ['加深機會漏掉', '確定接錯'];

/**
 * 一個指標兩組的值（§2-1）：任一組不適用是跳過；加深放棄的篇已經不在值裡，放棄到整份沒有加深的份不算，
 * 剩下的份數不到、或兩組放棄的篇差 2 篇以上，是未定（逾時不一定是平台的錯）。
 */
export function series(candidate: readonly DeckMetrics[], baseline: readonly DeckMetrics[], pick: (deck: DeckMetrics) => Value, metric: string): SeriesOr {
  let c = candidate, b = baseline;
  if ((DEEPEN as readonly string[]).includes(metric) || metric === '傷到學習') {
    const gone = (decks: readonly DeckMetrics[]): number => decks.reduce((total, deck) => total + (deck.deepen?.abandoned ?? 0), 0);
    if (Math.abs(gone(c) - gone(b)) >= 2) return { unknown: `加深放棄的篇：候選 ${String(gone(c))}、基準 ${String(gone(b))}，差 2 篇以上` };
    const kept = (decks: readonly DeckMetrics[]): DeckMetrics[] => decks.filter(deck => !deck.deepen || deck.deepen.pieces > 0 || deck.deepen.abandoned === 0);
    if (kept(c).length < c.length || kept(b).length < b.length) return { unknown: '有份的加深整份都放棄了' };
    c = kept(c); b = kept(b);
  }
  const values = (decks: readonly DeckMetrics[]): Value[] => decks.map(pick).filter(value => value !== 'drop');
  const vc = values(c), vb = values(b);
  if (!vc.length || !vb.length) return { unknown: '不算的份（卡組存不了、不能加深）拿掉之後沒有份了' };
  if (vc.every(each => each === 'na') || vb.every(each => each === 'na')) return { skip: vb.every(each => each === 'na') ? '基準不適用（凍結時就知道）' : '候選不適用（凍結時就知道）' };
  if ([...vc, ...vb].some(each => typeof each !== 'number')) return { unknown: '有份沒有資料' };
  return { c: vc as number[], b: vb as number[], meanC: mean(vc as number[]), meanB: mean(vb as number[]) };
}
export const isSeries = (s: SeriesOr): s is Series => 'c' in s;
const allowed = (tolerance: Tolerance, meanB: number): number => Math.max(tolerance.percent * meanB, tolerance.floor);

/** 確定接錯的兩端（§6-3）：兩組交叉，一端候選的歧見當對、基準的當錯，另一端反過來。 */
function ends(candidate: readonly DeckMetrics[], baseline: readonly DeckMetrics[]): { favorable: SeriesOr; unfavorable: SeriesOr } {
  const pick = (withDisputed: boolean) => (deck: DeckMetrics): Value => !deck.deepen ? 'na' : deck.deepen.wrong === null ? 'drop' : deck.deepen.wrong + (withDisputed ? deck.deepen.disputed : 0);
  const both = (c: boolean, b: boolean): SeriesOr => {
    const sc = series(candidate, candidate, pick(c), '確定接錯'), sb = series(baseline, baseline, pick(b), '確定接錯');
    if (!isSeries(sc)) return sc;
    if (!isSeries(sb)) return sb;
    return { c: sc.c, b: sb.c, meanC: sc.meanC, meanB: sb.meanC };
  };
  const base = series(candidate, baseline, pick(false), '確定接錯');
  if (!isSeries(base)) return { favorable: base, unfavorable: base };
  return { favorable: both(false, true), unfavorable: both(true, false) };
}

/** 一個候選組對基準的門檻。candidate、baseline 是同一課、同一個生成器、已經配好對的份。 */
export function judgeGates(gates: Gates, candidate: readonly DeckMetrics[], baseline: readonly DeckMetrics[], unpaired = 0, alone = 0): Omit<GateResult, 'lesson' | 'generator' | 'candidate' | 'baseline'> {
  const n = candidate.length, m = baseline.length;
  // 份數夠不夠、贏的比例，照每個指標拿掉不算的份之後實際留下的份算（不讓存不了、不能加深的份湊數）。
  const few = (s: { c: readonly number[]; b: readonly number[] }): boolean => s.c.length < ENOUGH || s.b.length < ENOUGH;
  const chance: GateResult['chance'] = {};
  const note = (metric: string, s: Series): void => { chance[metric] = wins(s.c, s.b) / (s.c.length * s.b.length); };

  // 第 1 道：重大（D-234）。
  const majors = (decks: readonly DeckMetrics[]): string[] => decks.flatMap(deck => deck.issues.filter(issue => issue.kind === '重大錯誤').map(issue => issue.rubric || '沒對到評分表的列'));
  let major: Check;
  if (gates.majorErrors === 'zero') {
    const withMajor = candidate.filter(deck => deck.majorTotal > 0);
    major = withMajor.length
      ? { pass: false, text: `重大：候選 ${String(n)} 份裡有 ${String(withMajor.length)} 份有（共 ${String(withMajor.reduce((total, deck) => total + deck.majorTotal, 0))} 筆，含存不了）；設定是零` }
      : { pass: true, text: `重大：候選 ${String(n)} 份都是 0` };
  } else {
    const c = mean(candidate.map(deck => deck.majorTotal)), b = mean(baseline.map(deck => deck.majorTotal));
    const only = [...new Set(majors(candidate))].filter(kind => !majors(baseline).includes(kind));
    const unsaveable = (decks: readonly DeckMetrics[]): number => decks.filter(deck => deck.unsaveable).length;
    major = { pass: c <= b + EPSILON, text: `重大：候選每份平均 ${one(c)}、基準 ${one(b)}（含存不了：候選 ${String(unsaveable(candidate))} 份、基準 ${String(unsaveable(baseline))} 份），${c <= b + EPSILON ? '不比基準多' : '比基準多'}${only.length ? `；只有候選才有的：${only.join('、')}` : ''}` };
  }

  // 第 2 道：不多漏必備。
  const rowIds = [...new Set([...candidate, ...baseline].flatMap(deck => deck.missed))];
  const rate = (decks: readonly DeckMetrics[], id: string): number => decks.filter(deck => deck.missed.includes(id)).length / decks.length;
  const worseRows = rowIds.filter(id => rate(candidate, id) - rate(baseline, id) >= gates.rowMissGap - EPSILON);
  const rows: Check = worseRows.length
    ? { pass: false, text: `逐列：多漏 ${worseRows.map(id => `${id}（候選 ${String(candidate.filter(deck => deck.missed.includes(id)).length)}／${String(n)}、基準 ${String(baseline.filter(deck => deck.missed.includes(id)).length)}／${String(m)}）`).join('、')}；設定是漏的比例高出 ${String(gates.rowMissGap)} 以上算多漏` }
    : { pass: true, text: '逐列：沒有多漏的列' };
  const missC = mean(candidate.map(deck => deck.missed.length)), missB = mean(baseline.map(deck => deck.missed.length));
  const total: Check = { pass: missC - missB < gates.missedRows - EPSILON, text: `總數：候選每份漏 ${one(missC)} 列、基準 ${one(missB)} 列；設定是多 ${String(gates.missedRows)} 列以上算多漏` };
  const dupC = mean(candidate.map(deck => deck.extraPrompts)), dupB = mean(baseline.map(deck => deck.extraPrompts));
  const extra: Check = { pass: dupC - dupB <= gates.extraPrompts + EPSILON, text: `多餘的題（近義重複）：候選每份 ${one(dupC)}、基準 ${one(dupB)}；設定是多出 ${String(gates.extraPrompts)} 以內` };

  // 時間預算（檢查表課 3）：多出來的目標要對得上多考到的必備。
  const targetsC = mean(candidate.map(deck => deck.targets)), targetsB = mean(baseline.map(deck => deck.targets));
  const sureC = mean(candidate.map(deck => deck.sureRequired)), sureB = mean(baseline.map(deck => deck.sureRequired));
  const over = targetsC > targetsB * (1 + BUDGET) + EPSILON && sureC <= sureB + EPSILON;
  const budgetHead = `時間預算：候選每份 ${one(targetsC)} 個目標、基準 ${one(targetsB)}（${targetsB === 0 ? '基準是 0' : targetsC >= targetsB ? `多 ${percent((targetsC - targetsB) / targetsB)}` : `少 ${percent((targetsB - targetsC) / targetsB)}`}）；確定考到的必備候選 ${one(sureC)}、基準 ${one(sureB)}（多 ${one(sureC - sureB)} 列）`;
  const budget: Check = !over ? { pass: true, text: `${budgetHead}→ 過` }
    : gates.timeBudget === 'gate' ? { pass: false, text: `${budgetHead}→ 目標多超過 15%、必備沒多，沒過（設定算門檻）` }
    : { pass: true, text: `${budgetHead}→ 目標多超過 15%、必備沒多，標出來（設定只報告）` };

  // 第 3 道：傷到學習（三態）。
  let harm: Check;
  const harmSeries = series(candidate, baseline, deck => learningValue(deck, '傷到學習'), '傷到學習');
  if (!isSeries(harmSeries)) harm = { pass: null, text: `傷到學習：${'skip' in harmSeries ? harmSeries.skip : harmSeries.unknown}→ 未定` };
  else {
    const s = harmSeries, limit = allowed(gates.harm, s.meanB), more = s.meanC - s.meanB;
    note('傷到學習', s);
    const head = `傷到學習：候選每份 ${one(s.meanC)}、基準 ${one(s.meanB)}（容許多 ${one(limit)}）`;
    if (more <= limit + EPSILON) harm = { pass: true, text: `${head}→ 過` };
    else if (few(s)) harm = { pass: null, text: `${head}，多了→ 未定（份數不夠）` };
    else {
      const p = permutationP(s.b, s.c);
      harm = p <= ALPHA + EPSILON ? { pass: false, text: `${head}，多了、明顯（${pText(p)}）→ 沒過` } : { pass: null, text: `${head}，多了、不明顯（${pText(p)}）→ 未定` };
    }
  }

  // 第 4 道：收益（學習面，至少一項明顯；k 項各用 5%÷k）。
  const k = gates.correction ? Math.max(gates.benefits.length, 1) : 1;
  const benefitOf = (metric: LearningMetric, atLeast: number, s: SeriesOr): Check & { metric: LearningMetric; state: BenefitState } => {
    if (!isSeries(s)) return 'skip' in s ? { metric, state: 'skip', pass: null, text: `收益 ${metric}：跳過（${s.skip}）` } : { metric, state: 'unknown', pass: null, text: `收益 ${metric}：未定（${s.unknown}）` };
    note(metric, s);
    const less = s.meanB === 0 ? (s.meanC === 0 ? 0 : -Infinity) : (s.meanB - s.meanC) / s.meanB;
    const change = s.meanB === 0 ? (s.meanC === 0 ? '一樣' : '基準是 0') : less >= 0 ? `少 ${percent(less)}` : `多 ${percent(-less)}`;
    const head = `收益 ${metric}：候選 ${one(s.meanC)}、基準 ${one(s.meanB)}，${change}（設定至少少 ${percent(atLeast)}）`;
    if (metric === '每個必備平均幾題') {
      if (sureC < sureB - EPSILON) return { metric, state: 'no', pass: false, text: `${head}，但確定考到的必備候選 ${one(sureC)}、基準 ${one(sureB)}，比較少→ 不算（題少是因為少考）` };
    }
    if (less < atLeast - EPSILON) return { metric, state: 'no', pass: false, text: `${head}→ 沒達到` };
    if (few(s)) return { metric, state: 'few', pass: false, text: `${head}→ 平均達到，份數不夠` };
    const p = permutationP(s.c, s.b), limit = ALPHA / k;
    return p <= limit + EPSILON ? { metric, state: 'clear', pass: true, text: `${head}，${pText(p)}（門檻 ${percent(limit)}）→ 明顯達到` } : { metric, state: 'no', pass: false, text: `${head}，${pText(p)}（門檻 ${percent(limit)}）→ 不明顯` };
  };
  const benefits = gates.benefits.map(({ metric, atLeast }) => {
    if (metric !== '確定接錯') return benefitOf(metric, atLeast, series(candidate, baseline, deck => learningValue(deck, metric), metric));
    const { favorable, unfavorable } = ends(candidate, baseline);
    const a = benefitOf(metric, atLeast, favorable), b = benefitOf(metric, atLeast, unfavorable);
    return a.state === b.state ? b : { metric, state: 'unknown' as const, pass: null, text: `收益 ${metric}：加深的歧見會左右結果（有利的一端：${a.text}；不利的一端：${b.text}）→ 未定` };
  });

  // 第 5 道：不能變差（學習面全部自動進來；明顯變差才沒過）。
  const worseOf = (metric: LearningMetric, s: SeriesOr): Check & { metric: LearningMetric; state: WorseState } => {
    if (!isSeries(s)) return 'skip' in s ? { metric, state: 'skip', pass: true, text: `不能變差 ${metric}：跳過（${s.skip}）` } : { metric, state: 'unknown', pass: null, text: `不能變差 ${metric}：未定（${s.unknown}）` };
    note(metric, s);
    const tolerance = gates.noWorse[metric as keyof Gates['noWorse']], limit = allowed(tolerance, s.meanB), more = s.meanC - s.meanB;
    const head = `不能變差 ${metric}：候選 ${one(s.meanC)}、基準 ${one(s.meanB)}（容許多 ${limit.toFixed(2)}）`;
    if (more <= limit + EPSILON) return { metric, state: 'within', pass: true, text: `${head}→ 過` };
    if (few(s)) return { metric, state: 'more', pass: true, text: `${head}，多了（份數不夠，不判明顯）→ 過，標出來` };
    const p = permutationP(s.b, s.c);
    return p <= ALPHA + EPSILON ? { metric, state: 'worse', pass: false, text: `${head}，多了、明顯（${pText(p)}）→ 沒過` } : { metric, state: 'more', pass: true, text: `${head}，多了、不明顯（${pText(p)}）→ 過，標出來` };
  };
  const noWorse = LEARNING_METRICS.filter(metric => metric !== '傷到學習').map(metric => {
    if (metric !== '確定接錯') return worseOf(metric, series(candidate, baseline, deck => learningValue(deck, metric), metric));
    const { favorable, unfavorable } = ends(candidate, baseline);
    const a = worseOf(metric, favorable), b = worseOf(metric, unfavorable);
    return (a.state === 'worse') === (b.state === 'worse') && a.state !== 'unknown' && b.state !== 'unknown' ? b : { metric, state: 'unknown' as const, pass: null, text: `不能變差 ${metric}：加深的歧見會左右結果（有利的一端：${a.text}；不利的一端：${b.text}）→ 未定` };
  });

  // 打平時的次要指標（§7-3 第 5 步）。
  const secondary = gates.secondary.map(({ metric, atLeast, tolerance }): Check & { metric: SecondaryMetric } => {
    const s = series(candidate, baseline, deck => secondaryValue(deck, metric), metric);
    if (!isSeries(s)) return { metric, pass: null, text: `次要 ${metric}：沒有資料` };
    const fixed = FIXED.includes(metric);
    const change = s.meanB === 0 ? 0 : (s.meanC - s.meanB) / s.meanB;
    const clear = (a: number[], b: number[]): boolean => fixed || (!few(s) && permutationP(a, b) <= ALPHA + EPSILON);
    const head = `次要 ${metric}：候選 ${one(s.meanC)}、基準 ${one(s.meanB)}（${change <= 0 ? `少 ${percent(-change)}` : `多 ${percent(change)}`}；設定至少少 ${percent(atLeast)}、最多多 ${percent(tolerance)}）`;
    if (change > tolerance + EPSILON && clear(s.b, s.c)) return { metric, pass: false, text: `${head}→ 明顯比較多` };
    if (-change >= atLeast - EPSILON && clear(s.c, s.b)) return { metric, pass: true, text: `${head}→ 明顯比較省` };
    return { metric, pass: null, text: `${head}→ 沒有明顯的差` };
  });

  // 總結果（§7-3）。
  const hard = [major, rows, total, extra, harm, budget];
  let verdict: Verdict, basis: string;
  if (hard.some(each => each.pass === false) || noWorse.some(each => each.state === 'worse')) { verdict = '沒過'; basis = '有一道沒過'; }
  else if (harm.pass === null || [...benefits, ...noWorse].some(each => each.state === 'unknown') || unpaired > 0 || alone > 0) {
    verdict = '未定';
    basis = unpaired > 0 ? `候選有 ${String(unpaired)} 份的區組沒有基準，配對的份數不夠` : alone > 0 ? lonelyBaseline(alone) : harm.pass === null ? '傷到學習未定' : '有指標缺資料或歧見會左右結果';
  } else if (benefits.some(each => each.state === 'clear')) { verdict = '過'; basis = '學習面有一項明顯比較好'; }
  else if (benefits.some(each => each.state === 'few')) { verdict = '未定'; basis = '收益平均達到，但份數不夠'; }
  else if (n >= gates.tieMinCopies && m >= gates.tieMinCopies && harm.pass === true && noWorse.every(each => each.state === 'within' || each.state === 'skip')) {
    const cheaper = secondary.some(each => each.pass === true) && !secondary.some(each => each.pass === false);
    if (!cheaper) { verdict = '打平'; basis = '學習面打平'; }
    else if (gates.tieCheaper === 'pass') { verdict = '過'; basis = '學習面打平、候選較省（設定：打平較省算過）'; }
    else { verdict = '打平，候選較省'; basis = '學習面打平、候選較省'; }
  } else { verdict = '未定'; basis = '學習面沒有明顯的差，但有指標多過容許量或份數不到打平的要求'; }
  return { counts: { candidate: n, baseline: m, unpaired, alone }, major, rows, total, extra, harm, budget, benefits, noWorse, secondary, verdict, basis, chance };
}

/**
 * 配對（§7-1 第 1 點）：只收同一個區組裡有 b 組的 a 組份，和那幾份 b 組；收進來以後兩組混在一起比。
 * 沒有 b 組的區組，那幾份 a 組不收，回傳在 unpaired。對照（§8）用同一個函式。
 */
export function pairUp(decks: readonly DeckMetrics[], lesson: string, generator: string, a: string, b: string): { a: DeckMetrics[]; b: DeckMetrics[]; unpaired: number } {
  const here = decks.filter(deck => deck.lesson === lesson && deck.generator === generator);
  const key = (deck: DeckMetrics): string => `${String(deck.batch)}/${deck.block}`;
  const withB = new Set(here.filter(deck => deck.group === b).map(key));
  const all = here.filter(deck => deck.group === a);
  const paired = all.filter(deck => withB.has(key(deck)));
  const blocks = new Set(paired.map(key));
  return { a: paired, b: here.filter(deck => deck.group === b && blocks.has(key(deck))), unpaired: all.length - paired.length };
}

/** 照設定逐課、逐算門檻的生成器、逐候選組判。 */
export function allGates(gates: Gates, decks: readonly DeckMetrics[]): GateResult[] {
  const out: GateResult[] = [];
  for (const lesson of [...new Set(decks.map(deck => deck.lesson))]) {
    for (const generator of gates.generators) {
      for (const name of gates.candidates) {
        const pair = pairUp(decks, lesson, generator, name, gates.baseline), alone = pairUp(decks, lesson, generator, gates.baseline, name).unpaired;
        if (!pair.a.length && !pair.unpaired && !alone) continue;
        if (!pair.a.length) {
          const empty: Check = { pass: null, text: '沒有和基準同一個區組的份' };
          const basis = pair.unpaired ? `候選 ${String(pair.unpaired)} 份的區組都沒有基準` : lonelyBaseline(alone);
          out.push({ lesson, generator, candidate: name, baseline: gates.baseline, counts: { candidate: 0, baseline: 0, unpaired: pair.unpaired, alone }, major: empty, rows: empty, total: empty, extra: empty, harm: empty, budget: empty, benefits: [], noWorse: [], secondary: [], verdict: '未定', basis, chance: {} });
          continue;
        }
        out.push({ lesson, generator, candidate: name, baseline: gates.baseline, ...judgeGates(gates, pair.a, pair.b, pair.unpaired, alone) });
      }
    }
  }
  return out;
}
