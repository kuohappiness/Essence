// 比較測試工具：對照（任務說明 tasks/rule-test-d236.md §8）。把結構和內容分開：每一個對照（甲對乙）逐課、逐生成器、逐批報
// 每個學習面與次要指標兩組的平均、差、兩兩比的場數、明不明顯；只報告，不判過不過。配對用門檻的同一個函式（同一個區組才收），
// 缺一邊的列出來；另外列出兩組設定上的所有差別（規則檔、任務段選項、加深規則），看得出只差五步還是一整套都不同。
import { LEARNING_METRICS, PLUGIN_TASK, SECONDARY_METRICS, type Config, type Group, type LearningMetric, type RuleSource, type SecondaryMetric, type TaskOptions } from './config.ts';
import { isSeries, learningValue, pairUp, secondaryValue, series, type Value } from './gates.ts';
import { subjectOf } from './prompts.ts';
import { permutationP, wins } from './stats.ts';
import type { DeckMetrics } from './unblind.ts';

const ENOUGH = 3;
const ALPHA = 0.05;
const FIXED: readonly SecondaryMetric[] = ['規則字數', '整份提示字數'];

interface ContrastMetric { metric: LearningMetric | SecondaryMetric; text: string }
interface ContrastResult { lesson: string; generator: string; batch: number; counts: { a: number; b: number }; metrics: ContrastMetric[] }
export interface Contrast {
  name: string; a: string; b: string;
  /** 兩組設定上的差別（groupDifferences）。 */
  differences: string[];
  results: ContrastResult[];
  /** 缺一邊的課、生成器、批或區組。 */
  missing: string[];
}

const one = (value: number): string => value.toFixed(1);
const percent = (value: number): string => `${(value * 100).toFixed(1).replace(/\.0$/, '')}%`;
/** 門檻的說法是候選、基準，對照是甲、乙。 */
const sides = (text: string): string => text.replace(/候選/g, '甲').replace(/基準/g, '乙');

/** 一個指標：平均、差、甲贏幾場；兩組都有 3 份以上才判明顯（單邊，照平均比較少的那一邊，5%）。 */
function metricLine(metric: LearningMetric | SecondaryMetric, a: readonly DeckMetrics[], b: readonly DeckMetrics[], pick: (deck: DeckMetrics) => Value): ContrastMetric {
  const s = series(a, b, pick, metric);
  if (!isSeries(s)) return { metric, text: 'skip' in s ? `${metric}：跳過（${sides(s.skip)}）` : `${metric}：沒有資料（${sides(s.unknown)}）` };
  const diff = s.meanC - s.meanB;
  const head = `${metric}：甲 ${one(s.meanC)}、乙 ${one(s.meanB)}`;
  if (Math.abs(diff) < 1e-9) return { metric, text: `${head}，一樣` };
  const change = `${head}，差 ${diff > 0 ? '+' : ''}${one(diff)}（${diff < 0 ? '甲少' : '甲多'}）`;
  if ((FIXED as readonly string[]).includes(metric)) return { metric, text: `${change}；固定的數，不判明顯` };
  const scored = `${change}；甲贏 ${String(wins(s.c, s.b))}／${String(s.c.length * s.b.length)} 場`;
  if (s.c.length < ENOUGH || s.b.length < ENOUGH) return { metric, text: `${scored}；份數不夠，不判明顯` };
  const p = diff < 0 ? permutationP(s.c, s.b) : permutationP(s.b, s.c);
  return { metric, text: `${scored}；p＝${percent(p)}，${p <= ALPHA + 1e-9 ? '明顯' : '不明顯'}` };
}

/** 甲對乙，逐課、逐生成器、逐批。 */
export function allContrasts(config: Pick<Config, 'contrasts' | 'groups' | 'lessons' | 'generators'>, decks: readonly DeckMetrics[]): Contrast[] {
  const batches = [...new Set(decks.map(deck => deck.batch))].sort((x, y) => x - y);
  return config.contrasts.map(({ name, a, b }) => {
    const group = (each: string): Group => config.groups.find(g => g.name === each)!;
    const out: Contrast = { name, a, b, differences: groupDifferences(group(a), group(b)), results: [], missing: [] };
    for (const batch of batches) {
      const here = decks.filter(deck => deck.batch === batch);
      for (const { code: lesson } of config.lessons) {
        for (const { name: generator } of config.generators) {
          const at = `批 ${String(batch)} ${lesson}｜${generator}`;
          const mine = here.filter(deck => deck.lesson === lesson && deck.generator === generator);
          const hasA = mine.some(deck => deck.group === a), hasB = mine.some(deck => deck.group === b);
          if (!hasA && !hasB) continue;
          if (!hasA || !hasB) { out.missing.push(`${at}：${hasA ? `乙（${b}）` : `甲（${a}）`}沒有份`); continue; }
          const pair = pairUp(here, lesson, generator, a, b), reverse = pairUp(here, lesson, generator, b, a);
          if (pair.unpaired) out.missing.push(`${at}：甲有 ${String(pair.unpaired)} 份的區組沒有乙（${pair.lonely.join('、')}）`);
          if (reverse.unpaired) out.missing.push(`${at}：乙有 ${String(reverse.unpaired)} 份的區組沒有甲（${reverse.lonely.join('、')}）`);
          if (!pair.a.length) continue;
          out.results.push({
            lesson, generator, batch, counts: { a: pair.a.length, b: pair.b.length },
            metrics: [
              ...LEARNING_METRICS.map(metric => metricLine(metric, pair.a, pair.b, deck => learningValue(deck, metric))),
              ...SECONDARY_METRICS.map(metric => metricLine(metric, pair.a, pair.b, deck => secondaryValue(deck, metric))),
            ],
          });
        }
      }
    }
    return out;
  });
}

/** 一份規則來源攤成可以比的樣子：外掛來源照外掛那一科的檔案路徑（凍結時讀工作樹）、任務段照外掛原樣。 */
interface Flat { label: string; files: string[]; task: TaskOptions | null }
function flat(source: RuleSource): Flat {
  if (source.kind === 'plugin') return { label: `外掛 ${source.subject}（凍結時的工作樹）`, files: subjectOf(source.subject).files.map(file => file.path), task: PLUGIN_TASK };
  if (source.kind === 'files') return { label: `檔案（commit ${source.commit.slice(0, 8)}）`, files: source.files, task: source.task };
  return { label: '自備', files: Object.entries(source.files).map(([lesson, file]) => `${lesson}：提示/${file}`), task: null };
}

const TASK_LABELS: { key: keyof TaskOptions; name: string; show: (value: TaskOptions[keyof TaskOptions]) => string }[] = [
  { key: 'pickRules', name: '點選填空說明', show: value => value ? '送' : '不送' },
  { key: 'existingRules', name: '已有目標說明', show: value => value === 'line' ? '一行' : '外掛原文' },
  { key: 'threeSections', name: '三段', show: value => value ? '要' : '不要' },
  { key: 'existingList', name: '已有目標清單', show: value => value === 'lean' ? '精簡' : '原寫法' },
];

function compareSources(at: string, a: Flat, b: Flat, what = '規則'): string[] {
  const out: string[] = [];
  if (a.label !== b.label) out.push(`${at}${what}來源：甲 ${a.label}、乙 ${b.label}`);
  const onlyA = a.files.filter(file => !b.files.includes(file)), onlyB = b.files.filter(file => !a.files.includes(file));
  if (onlyA.length || onlyB.length) out.push(`${at}${what}檔：${[onlyA.length ? `只有甲有 ${onlyA.join('、')}` : '', onlyB.length ? `只有乙有 ${onlyB.join('、')}` : ''].filter(Boolean).join('；')}`);
  else if (a.files.join('\n') !== b.files.join('\n')) out.push(`${at}${what}檔的順序：甲 ${a.files.join('、')}；乙 ${b.files.join('、')}`);
  if (a.task && b.task) {
    for (const { key, name, show } of TASK_LABELS) if (a.task[key] !== b.task[key]) out.push(`${at}任務段 ${name}：甲 ${show(a.task[key])}、乙 ${show(b.task[key])}`);
  }
  return out;
}

/** 加深送的規則：寫了「加深規則」的照它；沒寫的是外掛來源（讀設定時檢查過），照那一科外掛的規則。 */
function deepenFlat(group: Group): Flat | null {
  if (group.deepenRules) return { label: `檔案（commit ${group.deepenRules.commit.slice(0, 8)}）`, files: group.deepenRules.files, task: null };
  const source = group.steps.find(step => step.deck)?.rules;
  return source?.kind === 'plugin' ? { ...flat(source), task: null } : null;
}

/** 兩組設定上的所有差別（§8）：步數、每一步的對話與卡組、規則來源與檔、任務段選項、加深規則。 */
export function groupDifferences(a: Group, b: Group): string[] {
  const out: string[] = [];
  if (a.steps.length !== b.steps.length) out.push(`步數：甲 ${String(a.steps.length)} 步、乙 ${String(b.steps.length)} 步`);
  const several = Math.max(a.steps.length, b.steps.length) > 1;
  for (let i = 0; i < Math.min(a.steps.length, b.steps.length); i++) {
    const sa = a.steps[i], sb = b.steps[i], at = several ? `第 ${String(i + 1)} 步 ` : '';
    if (sa.conversation !== sb.conversation) out.push(`${at}對話：甲 ${sa.conversation}、乙 ${sb.conversation}`);
    if (sa.deck !== sb.deck) out.push(`${at}卡組：甲 ${sa.deck ? '是' : '否'}、乙 ${sb.deck ? '是' : '否'}`);
    out.push(...compareSources(at, flat(sa.rules), flat(sb.rules)));
  }
  const da = deepenFlat(a), db = deepenFlat(b);
  if (da && db) out.push(...compareSources('', da, db, '加深規則'));
  else if (da || db) out.push(`加深規則：甲 ${da ? da.label : '沒寫'}、乙 ${db ? db.label : '沒寫'}`);
  return out.length ? out : ['設定一樣（只差組名）'];
}
