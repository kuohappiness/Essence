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

const ID = /^[A-Za-z0-9-]+$/;

/**
 * 這台電腦的「這次不用」（§5-1）：`{ [卡組路徑]: { ids, at } }`。外層不是物件就整份當沒有；某一篇的值壞了（ids 不是 ID 字串陣列、at 不是合法時刻）只略過那一篇。
 * at 照快照的 `時間` 寫法，讀法由呼叫端給（parseTime）。
 */
export function readSkips(value: unknown, timeOf: (text: string) => number | null): Map<string, { ids: string[]; at: number }> {
  const found = new Map<string, { ids: string[]; at: number }>();
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return found;
  for (const [path, each] of Object.entries(value as Record<string, unknown>)) {
    if (typeof each !== 'object' || each === null || Array.isArray(each)) continue;
    const { ids, at } = each as Record<string, unknown>;
    if (!Array.isArray(ids) || !ids.every(id => typeof id === 'string' && ID.test(id)) || typeof at !== 'string') continue;
    const ms = timeOf(at);
    if (ms === null) continue;
    found.set(path, { ids: [...new Set(ids as string[])].sort(), at: ms });
  }
  return found;
}

/** 路徑重用（§5-1）：存下的 ids 和這一篇現在的目標一個都對不上就當沒有；ids 是空的照路徑用。 */
export const skipFor = (skip: { ids: string[]; at: number } | undefined, deckIds: ReadonlySet<string>): { ids: string[]; at: number } | null =>
  skip && (!skip.ids.length || skip.ids.some(id => deckIds.has(id))) ? skip : null;

/** 提醒一區的一行（§4-2、§4-3）：等待貼回、待審核、可以加深。name 是篇名（D-189 第 3 點：檔名）。 */
export interface DeepenRow { path: string; kind: 'waiting' | 'pending' | 'ready'; text: string }
export function deepenRow(path: string, name: string, state: { waiting: boolean; pending: boolean; remind: RemindResult | null }): DeepenRow | null {
  if (state.waiting) return { path, kind: 'waiting', text: `${name}：加深的提示已複製，等你貼回` };
  if (state.pending) return { path, kind: 'pending', text: `${name}：上一次加深的結果還沒審完` };
  const remind = state.remind;
  if (!remind?.show) return null;
  return { path, kind: 'ready', text: `${name}：${remind.first ? '有' : '又有'} ${String(remind.fresh)} 個記穩了，要加深嗎？` };
}
