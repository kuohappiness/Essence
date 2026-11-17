import { replay } from './fsrs.ts';
import { dayOf } from './time.ts';
import type { ReviewEntry } from './types.ts';

// 加深用的「記穩了」與「常錯」（tasks/ai-cards-deepen.md §2-1、D-194 第 3 點）：提示與送給 AI 共用這一份。
// 只看複習紀錄，不看保持率、考試與目錄顏色。

/** 記穩了的穩定度門檻（天）：D-194 第 3 點的試作值。 */
export const STABLE_DAYS = 7;
/** 常錯：答錯的次數（同一天連續的答錯算一次）達到這個數。 */
export const WEAK_MISSES = 2;

/** stable 記穩了；weak 常錯（還沒記穩）；unstable 其他；unknown 紀錄不完整，不算進任何一種（D-194 第 4 點：不湊數）。 */
export type Mastery = 'stable' | 'weak' | 'unstable' | 'unknown';

const wrong = (entry: ReviewEntry): boolean => entry.src === 'mistake' || entry.r === 'miss' || entry.r === 'near';

/**
 * 答錯的次數：照時間順序看同一個目標的紀錄，答錯（沒印象、差一點、錯題本）接著答錯、而且是同一天（清晨 4 點換日，照那一筆自己的時區）算同一次；
 * 中間有答對（記住了、太簡單）就斷開。穿插別的目標不影響（只看這一個目標）。
 */
export function missCount(entries: readonly ReviewEntry[]): number {
  let count = 0, open: number | null = null;
  for (const entry of entries) {
    if (!wrong(entry)) { open = null; continue; }
    const day = dayOf(entry.at, entry.offset);
    if (open !== day) count++;
    open = day;
  }
  return count;
}

/**
 * 每個目標的狀態。reviews 依時間排好（mergeHistory 的結果，undo 已經拿掉）；incomplete 是紀錄不完整的目標（讀不懂的行停掉的、整份不完整時全部）。
 * 記穩了：穩定度 ≥ 7 天，而且最後一次是記住了或太簡單、不是錯題本。沒有紀錄的是 unstable。
 */
export function masteryOf(ids: readonly string[], reviews: readonly ReviewEntry[], incomplete: (id: string) => boolean = () => false): Map<string, Mastery> {
  const wanted = new Set(ids);
  const own = new Map<string, ReviewEntry[]>();
  for (const entry of reviews) {
    if (!wanted.has(entry.lt)) continue;
    const list = own.get(entry.lt);
    if (list) list.push(entry);
    else own.set(entry.lt, [entry]);
  }
  const memories = replay(reviews.filter(entry => wanted.has(entry.lt)));
  const result = new Map<string, Mastery>();
  for (const id of ids) {
    if (incomplete(id)) { result.set(id, 'unknown'); continue; }
    const memory = memories.get(id);
    const stable = !!memory && memory.stability >= STABLE_DAYS && (memory.last.r === 'good' || memory.last.r === 'easy') && memory.last.src !== 'mistake';
    result.set(id, stable ? 'stable' : missCount(own.get(id) ?? []) >= WEAK_MISSES ? 'weak' : 'unstable');
  }
  return result;
}
