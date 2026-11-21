// 加深主動提示的門檻試作（D-194 第 4 點，tasks/ai-cards-deepen.md §6）：
// 用外掛的 FSRS（src/core/study/fsrs.ts）模擬學生每天把到期的卡做完，看門檻什麼時候第一次成立、之後多久再成立。
// 跑法：node experiments/tools/deepen-threshold.ts
// 答對機率 = 當下的 recall；答錯（沒印象）一分鐘後再答對一次（同一輪重學）。答對的 15% 按「太簡單」。
// 「記穩了」= 穩定度 ≥ STABLE 天，而且最後一次是記住了或太簡單。
import { dueAt, recall, review } from '../../apps/Cards/src/core/study/fsrs.ts';
import type { Memory, Rating, ReviewEntry } from '../../apps/Cards/src/core/study/types.ts';

const DAY = 86_400_000;
const OFFSET = 480;
const START = Date.UTC(2026, 8, 1, 2, 0); // 台灣 10:00
const RUNS = 400;

let seed = 1;
const rand = (): number => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };

interface Card { id: string; memory: Memory | null }
const entry = (lt: string, r: Rating, at: number): ReviewEntry => ({ kind: 'review', t: `${lt}-${at}`, at, offset: OFFSET, lt, r, v: null, typed: null, src: null });

function study(cards: Card[], day: number, retention: number): void {
  const at = START + day * DAY;
  for (const card of cards) {
    if (card.memory && dueAt(card.memory, retention) > at) continue;
    const p = card.memory ? recall(card.memory, at) : 0.6; // 新卡第一次答對約六成
    if (rand() < p) card.memory = review(card.memory, entry(card.id, rand() < 0.15 ? 'easy' : 'good', at));
    else {
      card.memory = review(card.memory, entry(card.id, 'miss', at));
      card.memory = review(card.memory, entry(card.id, 'good', at + 60_000));
    }
  }
}
const stable = (card: Card, days: number): boolean => card.memory !== null && card.memory.stability >= days && (card.memory.last.r === 'good' || card.memory.last.r === 'easy');

interface Rule { name: string; stableDays: number; fraction: number; firstMin: number; laterMin: number }
/** D-194 第 4 點：上一次沒記穩的裡面，新記穩的 ≥ max(ceil(n·fraction), min)，而且至少 1 個。 */
function ready(rule: Rule, cards: Card[], base: Set<string>, first: boolean): boolean {
  const pool = cards.filter(card => !base.has(card.id));
  const fresh = pool.filter(card => stable(card, rule.stableDays)).length;
  return fresh > 0 && fresh >= Math.max(Math.ceil(pool.length * rule.fraction), first ? rule.firstMin : rule.laterMin);
}

const median = (list: number[]): number => { const s = [...list].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : NaN; };
const pct = (list: number[], q: number): number => { const s = [...list].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(s.length * q))]; };

/** 情境：一篇 start 個目標；每次提示家長都按「加深」，加 add 個新目標；跑 days 天。回傳每次提示的日子。 */
function run(rule: Rule, start: number, add: number, days: number, retention = 0.8, accept = true): number[] {
  const cards: Card[] = Array.from({ length: start }, (_, i) => ({ id: `a${i}`, memory: null }));
  let base = new Set<string>(), first = true, next = start;
  const prompts: number[] = [];
  for (let day = 0; day < days; day++) {
    study(cards, day, retention);
    if (!ready(rule, cards, base, first)) continue;
    prompts.push(day);
    base = new Set(cards.filter(card => stable(card, rule.stableDays)).map(card => card.id));
    first = false;
    if (accept) for (let i = 0; i < add; i++) cards.push({ id: `a${next++}`, memory: null });
  }
  return prompts;
}

const RULES: Rule[] = [
  { name: 'D-194（7 天、1/3、首輪 3、之後 1）', stableDays: 7, fraction: 1 / 3, firstMin: 3, laterMin: 1 },
  { name: '對照：7 天、1/2、首輪 3、之後 1', stableDays: 7, fraction: 1 / 2, firstMin: 3, laterMin: 1 },
  { name: '對照：7 天、1/3、首輪 3、之後 2', stableDays: 7, fraction: 1 / 3, firstMin: 3, laterMin: 2 },
  { name: '對照：10 天、1/3、首輪 3、之後 1', stableDays: 10, fraction: 1 / 3, firstMin: 3, laterMin: 1 },
];

const summary = (label: string, runs: number[][]): string => {
  const firsts = runs.map(p => p[0]).filter(d => d !== undefined);
  const gaps = runs.flatMap(p => p.slice(1).map((d, i) => d - p[i]));
  const counts = runs.map(p => p.length);
  return `  ${label}：第一次 第 ${median(firsts)} 天（10%～90%：${pct(firsts, 0.1)}～${pct(firsts, 0.9)}）；之後間隔中位數 ${median(gaps)} 天（10%：${pct(gaps, 0.1)}）；60 天提示 ${median(counts)} 次（90%：${pct(counts, 0.9)}）`;
};

for (const rule of RULES) {
  console.log(rule.name);
  for (const [label, start, add, retention] of [
    ['首輪 10 個、每次加深加 3 個、保持率 80%', 10, 3, 0.8],
    ['首輪 10 個、每次加深加 3 個、考試 90%', 10, 3, 0.9],
    ['首輪 6 個（小篇）、每次加 2 個', 6, 2, 0.8],
    ['首輪 20 個（大篇）、每次加 4 個', 20, 4, 0.8],
    ['每次加深都沒有新目標（只補題）', 10, 0, 0.8],
  ] as const) {
    seed = 1;
    console.log(summary(label, Array.from({ length: RUNS }, () => run(rule, start, add, 60, retention))));
  }
  seed = 1;
  console.log(summary('首輪 10 個、每次都按「這次不用」', Array.from({ length: RUNS }, () => run(rule, 10, 0, 60, 0.8, false))));
}
