import type { Mastery } from '../study/index.ts';

// 加深的主動提示的門檻（tasks/ai-cards-deepen.md §4-1、D-194 第 4 點、D-209 第 1 點）：只算數字，不讀檔。

/** 比例（D-209：二分之一）。 */
const REMIND_RATIO = 1 / 2;
/** 第一次至少幾個新記穩的。 */
const FIRST_MIN = 3;

/** 基準：快照的（§2-3）或這台電腦的「這次不用」（§5-1）。 */
interface RemindBase {
  /** 基準集合（快照的 `記穩目標`，或「這次不用」凍結的）。 */
  stable: readonly string[];
  /** 從來沒有加深過（沒有基準快照、初次製卡的快照、只有「這次不用」而快照被刪）：門檻至少 3 個、文字不說「又」。 */
  first: boolean;
}

interface RemindResult { show: boolean; first: boolean; fresh: number; pool: number; need: number }

/**
 * 門檻（§4-1）：pool＝啟用目標裡不在基準集合的；fresh＝pool 裡現在記穩了的。fresh ≥ max(⌈pool × 比例⌉, 第一次 ? 3 : 1) 才提示。
 * active 是這一篇現在的啟用目標 ID（§2-1）；基準集合裡之後被刪、暫停、變成重複 ID 的不在 active，不算進 pool。unknown 不算記穩。
 */
export function remindOf(active: readonly string[], mastery: ReadonlyMap<string, Mastery>, base: RemindBase | null): RemindResult {
  const first = base?.first ?? true;
  const frozen = new Set(base?.stable ?? []);
  const pool = [...new Set(active)].filter(id => !frozen.has(id));
  const fresh = pool.filter(id => mastery.get(id) === 'stable').length;
  const need = Math.max(Math.ceil(pool.length * REMIND_RATIO), first ? FIRST_MIN : 1);
  return { show: fresh >= 1 && fresh >= need, first, fresh, pool: pool.length, need };
}

/**
 * 門檻用哪一份基準（§5-1）：「這次不用」的時刻比基準快照晚（相同時算快照的）就用它的集合；是不是第一次照快照算
 * （按過「這次不用」不算加深過；快照被刪、只剩這一份時也照第一次）。
 */
export function chooseBase(snapshot: { at: number; stable: readonly string[]; first: boolean } | null, skip: { at: number; ids: readonly string[] } | null): RemindBase | null {
  const first = snapshot?.first ?? true;
  if (skip && (!snapshot || skip.at > snapshot.at)) return { stable: skip.ids, first };
  return snapshot ? { stable: snapshot.stable, first } : null;
}
