import { questionType } from '../core/study/index.ts';
import type { Card, Rating } from '../core/study/index.ts';
import type { Flow, ReviewLine } from './flow.ts';

// 點選填空的作答流程（tasks/question-type-seam.md §6）：純程式，時間由 now 給。第一次的選擇與評分的對應（§4）只寫在這裡。

/** 同一個字連點，這麼久之內不算（規畫〈畫面與防點錯〉）。 */
const SAME_KEY = 300;
/** 最後一次填字之後，這麼久之內的「對答案」不算：手順勢多按一下。 */
const AFTER_FILL = 350;

type PickCellState = 'open' | 'filled' | 'skipped' | 'right' | 'retry' | 'near' | 'miss' | 'shown';
interface PickCellView {
  /** 這一格畫面上的字；還沒填是空字串。retry 是剛才選錯的字（劃掉）。 */
  text: string;
  state: PickCellState;
}
export interface PickView {
  stage: 'answer' | 'retry' | 'result';
  /** 待答的那一格；null 是沒有。 */
  cursor: number | null;
  cells: readonly PickCellView[];
  /** 再選時不能按的字：剛才選的。 */
  spent: string | null;
  /**
   * 每個字鍵（照 CardGroup.keys）變不變淡：只有全詩順序卡（D-204 第 3 點）。作答時是現在放在某一格的句子；再選時是已經排對的句子。
   * 淡掉的鍵照樣能點；相同的句子有幾格放著，就有幾個鍵變淡。
   */
  used: readonly boolean[];
  /** 每一格都填了（「對答案」不再變淡）。 */
  filled: boolean;
  /** 結果階段才有：每個字這張卡的結果；這次沒出句子的字沒有。 */
  results: Readonly<Record<string, Rating>>;
  /** 結果階段有錯：只有「下一張」。 */
  committable: boolean;
  /**
   * 英文句子排序寫了另一種排法才有（tasks/sentence-order-alternatives.md §4）：還算數的那幾種對的順序，0 是題目那一行，照先後排。
   * 作答時是全部，再選時是候選，結果是一種，預覽是 [0]。畫面照它決定顯示哪些標點（§5）。
   */
  orders?: readonly number[];
}

interface Cell {
  lt: string;
  v: string;
  /** 這一格對的字。句子排序有另一種排法時，對答案與再選之後換成候選裡排第一的那一種的詞塊（§4）。 */
  answer: string;
  /** 目前這格填的字；對答案之後是最後一次選的字。 */
  filled: string | null;
  /** 這格記成跳過：明確的狀態，不比字串（`？` 可以是組員）。 */
  skipped: boolean;
  /** 對答案時這格的字；第一次按沒印象是 null。 */
  first: string | null;
  /** 對答案之前是 open。 */
  status: 'open' | 'right' | 'retry' | 'near' | 'miss';
  /** 第一次選錯時，再選的結果。 */
  retry?: 'right' | 'wrong' | 'skip';
  /** 全詩順序卡：這一題的第幾格，從 0 算。 */
  cell?: number;
  /** 全詩順序卡：這格放的是第幾個字鍵；沒放是 null。相同的句子靠它分（L2 R1）。 */
  held: number | null;
}

const RANK: Record<Rating, number> = { miss: 0, near: 1, good: 2, easy: 3 };
const ALL_RIGHT: readonly Rating[] = ['good', 'easy'];
const NONE: readonly Rating[] = [];

/** 回看能改成的評分（§8 💡）：孩子自己選的才能改，程式判的不能改。要換做法只改這裡。 */
const changeable = (allRight: boolean): readonly Rating[] => allRight ? ALL_RIGHT : NONE;

/** 一張比較卡從作答開始。revealed：預覽時自動展開答案（D-161）：直接到結果階段，空格是答案，沒有對錯記號與結果。 */
export function createPick(card: Card, options: { now: () => number; revealed?: boolean }): Flow {
  const cells: Cell[] = card.blanks.map(blank => ({ lt: blank.lt, v: blank.prompt.fingerprint, answer: blank.answer ?? '', filled: null, skipped: false, first: null, status: 'open', held: null, ...(blank.cell === undefined ? {} : { cell: blank.cell }) }));
  const keys = card.group?.keys ?? [];
  /** 排序（全詩順序卡 D-187、D-204，句子排序）：放過的字鍵會變淡，點了是交換。 */
  const order = questionType(card) === 'order';
  const shown = options.revealed === true;
  /** 句子排序每一種對的順序的詞塊（§4）：0 是題目那一行；沒有另一種排法時是 null，下面每一步都和以前一樣。 */
  const others = card.group?.order?.others ?? [];
  const orders: readonly (readonly string[])[] | null = others.length ? [cells.map(cell => cell.answer), ...others.map(other => other.words)] : null;
  /** 還算數的那幾種，照先後：作答時是全部；對答案後是和排對的格不衝突的；再選時跟著縮小。 */
  let alive: number[] = orders ? orders.map((_, i) => i) : [];
  let stage: PickView['stage'] = shown ? 'result' : 'answer';
  let cursor: number | null = shown ? null : 0;
  let lastKey = { key: '', at: -Infinity };
  let lastFill = -Infinity;

  const empty = (cell: Cell): boolean => cell.filled === null && !cell.skipped;
  /** 下一個空格，往後繞一圈。 */
  function nextEmpty(from: number): number | null {
    for (let step = 1; step <= cells.length; step++) {
      const index = (from + step) % cells.length;
      if (empty(cells[index])) return index;
    }
    return null;
  }
  function nextRetry(): void {
    const index = cells.findIndex(cell => cell.status === 'retry');
    if (index >= 0) { cursor = index; return; }
    cursor = null;
    stage = 'result';
    flow.revealedAt = options.now();
  }

  function key(value: string, given?: number): boolean {
    if (stage === 'result') return false;
    const at = options.now();
    const index = order ? keyIndex(value, given) : null;
    // 全詩順序卡的相同句子是不同的鍵，照位置算連點；其他照字。
    const id = index === null ? value : String(index);
    const repeated = id === lastKey.key && at - lastKey.at < SAME_KEY;
    lastKey = { key: id, at };
    if (repeated || cursor === null) return false;
    const cell = cells[cursor];
    if (stage === 'answer') {
      if (index !== null) swapFrom(cell, index);
      cell.filled = value;
      cell.held = index;
      cell.skipped = false;
      lastFill = at;
      cursor = nextEmpty(cursor);
      return true;
    }
    if (value === cell.first) return false;
    cell.filled = value;
    cell.held = index === null ? null : retryIndex(cell, value, index);
    const near = orders ? narrow(cursor, value) : value === cell.answer;
    cell.retry = near ? 'right' : 'wrong';
    cell.status = near ? 'near' : 'miss';
    nextRetry();
    return true;
  }

  /**
   * 對答案時排出候選（§4）：和某一種完全一樣就是那一種；都不一樣時照「同位置對得最多格」排，一樣多時第一格和孩子排的相同的在前，
   * 再照寫的順序。排第一的那一種決定哪幾格要再選；候選是和它排對的格都不衝突的那幾種（照同樣的先後）。
   */
  function rank(all: readonly (readonly string[])[]): void {
    const picks = cells.map(cell => cell.skipped ? null : cell.filled);
    const exact = all.findIndex(order => order.every((word, i) => word === picks[i]));
    if (exact >= 0) alive = [exact];
    else {
      const score = (i: number): number => all[i].filter((word, at) => word === picks[at]).length;
      const lead = (i: number): number => picks[0] !== null && all[i][0] === picks[0] ? 0 : 1;
      const ranked = all.map((_, i) => i).sort((a, b) => score(b) - score(a) || lead(a) - lead(b) || a - b);
      const top = all[ranked[0]];
      alive = ranked.filter(i => top.every((word, at) => word !== picks[at] || all[i][at] === word));
    }
    answerAs(all);
  }

  /** 再選一格（§4）：選的字在某一種候選的這個位置是差一點，候選縮成那幾種；都不是是沒印象，候選不變。 */
  function narrow(at: number, value: string): boolean {
    if (!orders) return false;
    const match = alive.filter(i => orders[i][at] === value);
    if (match.length) alive = match;
    answerAs(orders);
    return match.length > 0;
  }

  /** 每一格的答案換成候選裡排第一的那一種的詞塊。 */
  function answerAs(all: readonly (readonly string[])[]): void {
    cells.forEach((cell, at) => { cell.answer = all[alive[0]][at]; });
  }

  /**
   * 點的是第幾個字鍵：畫面給位置（at）就用它；沒給時（測試、鍵盤）先找這一句還沒放的鍵，都放了取第一個。
   */
  function keyIndex(value: string, given?: number): number {
    if (given !== undefined && keys.at(given) === value) return given;
    const held = new Set(cells.map(cell => cell.held));
    const same = keys.flatMap((key, i) => key === value ? [i] : []);
    return same.find(i => !held.has(i)) ?? same[0] ?? -1;
  }

  /**
   * 再選時這一格記成哪個鍵（L2 R5）：點的鍵被已經排對的格佔著，就換用這一句沒被排對的格佔著的鍵，兩個同句的鍵才都淡；排對的格不動。
   */
  function retryIndex(cell: Cell, value: string, index: number): number {
    const locked = new Set(cells.flatMap(each => each !== cell && each.held !== null && (each.status === 'right' || each.status === 'near') ? [each.held] : []));
    if (!locked.has(index)) return index;
    const free = keys.findIndex((key, i) => key === value && !locked.has(i));
    return free === -1 ? index : free;
  }

  /**
   * 全詩順序卡點一句（D-204 第 3 點）：這個鍵放在別格，就從那一格拿過來，那一格換成這一格原本的句子（這一格空著或沒印象，那一格就空出來）。
   * 鍵照位置認，相同的句子也分得出是哪一格（L2 R1）。
   */
  function swapFrom(cell: Cell, index: number): void {
    const other = cells.find(each => each !== cell && each.held === index);
    if (!other) return;
    other.filled = cell.filled;
    other.held = cell.held;
    other.skipped = false;
  }

  /** 字鍵變不變淡：作答時是放在某一格的鍵；再選時是已經排對的格放的鍵。 */
  function usedOf(): boolean[] {
    if (!order || stage === 'result') return keys.map(() => false);
    const held = new Set(cells.flatMap(cell => cell.held !== null && (stage === 'answer' || cell.status === 'right' || cell.status === 'near') ? [cell.held] : []));
    return keys.map((_, i) => held.has(i));
  }

  function skip(): boolean {
    if (stage === 'result' || cursor === null) return false;
    const cell = cells[cursor];
    if (stage === 'answer') {
      cell.filled = null;
      cell.held = null;
      cell.skipped = true;
      lastFill = options.now();
      cursor = nextEmpty(cursor);
      return true;
    }
    cell.retry = 'skip';
    cell.status = 'miss';
    nextRetry();
    return true;
  }

  function row(index: number): boolean {
    const cell = cells.at(index);
    if (index < 0 || !cell || index === cursor) return false;
    if (stage === 'result' || (stage === 'retry' && cell.status !== 'retry')) return false;
    cursor = index;
    return true;
  }

  function check(): boolean {
    if (stage !== 'answer') return false;
    const open = cells.findIndex(empty);
    if (open >= 0) { cursor = open; return true; }
    if (options.now() - lastFill < AFTER_FILL) return false;
    for (const cell of cells) cell.first = cell.filled;
    if (orders) rank(orders);
    for (const cell of cells) cell.status = cell.skipped ? 'miss' : cell.filled === cell.answer ? 'right' : 'retry';
    stage = 'retry';
    nextRetry();
    return true;
  }

  const allRight = (): boolean => stage === 'result' && !shown && cells.every(cell => cell.status === 'right');
  /** 程式判的評分；全對時由孩子選記住了或太簡單（rating）。 */
  const ratingOf = (cell: Cell, rating: Rating | null): Rating => cell.status === 'right' ? (rating === 'easy' ? 'easy' : 'good') : cell.status === 'near' ? 'near' : 'miss';

  function resultsOf(): Record<string, Rating> {
    const results: Record<string, Rating> = {};
    if (stage !== 'result' || shown) return results;
    for (const cell of cells) {
      const rating = ratingOf(cell, null);
      const old = Object.hasOwn(results, cell.answer) ? results[cell.answer] : undefined;
      if (old === undefined || RANK[rating] < RANK[old]) results[cell.answer] = rating;
    }
    return results;
  }

  function cellView(cell: Cell): PickCellView {
    if (shown) return { text: cell.answer, state: 'shown' };
    if (stage === 'result') return { text: cell.answer, state: cell.status };
    switch (cell.status) {
      case 'open': return cell.skipped ? { text: '？', state: 'skipped' } : { text: cell.filled ?? '', state: cell.filled === null ? 'open' : 'filled' };
      case 'retry': return { text: cell.first ?? '', state: 'retry' };
      // 再選也錯的格先不給答案：其他要再選的格還在（示意頁的 slotContent）。
      case 'miss': return { text: '？', state: 'miss' };
      default: return { text: cell.filled ?? '', state: cell.status };
    }
  }
  function pickView(): PickView {
    return {
      stage, cursor, cells: cells.map(cellView),
      spent: stage === 'retry' && cursor !== null ? cells[cursor].first : null, used: usedOf(),
      filled: !cells.some(empty), results: resultsOf(),
      committable: stage === 'result' && !allRight(),
      ...(orders ? { orders: shown ? [0] : stage === 'result' ? [alive[0]] : [...alive] } : {}),
    };
  }

  /** 一個目標一行（§4）：照畫面上第一次出現的順序；最差的格放最上層，一樣差取前面那格，其他格放 also。 */
  function linesOf(rating: Rating | null): ReviewLine[] {
    const byTarget = new Map<string, Cell[]>();
    for (const cell of cells) {
      const list = byTarget.get(cell.lt);
      if (list) list.push(cell);
      else byTarget.set(cell.lt, [cell]);
    }
    return [...byTarget].map(([lt, list]) => {
      const worst = list.reduce((best, cell) => RANK[ratingOf(cell, rating)] < RANK[ratingOf(best, rating)] ? cell : best);
      // 全詩順序卡的格序寫成第幾格（從 1 算），和卡組的「第 1 句」一樣讀。
      const at = (cell: Cell): { cell?: number } => cell.cell === undefined ? {} : { cell: cell.cell + 1 };
      const also = list.filter(cell => cell !== worst).map(cell => ({ v: cell.v, r: ratingOf(cell, rating), ...at(cell), pick: cell.first, ...(cell.retry ? { retry: cell.retry } : {}) }));
      return { lt, r: ratingOf(worst, rating), v: worst.v, ...at(worst), pick: worst.first, ...(worst.retry ? { retry: worst.retry } : {}), ...(also.length ? { also } : {}) };
    });
  }

  const flow: Flow = {
    autoRead: null,
    revealedAt: null,
    view: () => ({ revealed: stage === 'result', allowed: allRight() ? ALL_RIGHT : NONE, speakable: false, typed: null, pick: pickView() }),
    act(action) {
      switch (action.kind) {
        case 'key': return key(action.key, action.at);
        case 'skip': return skip();
        case 'row': return row(action.index);
        case 'check': return check();
        default: return false;
      }
    },
    settle: rating => ({ lines: linesOf(rating), look: { typed: null, pick: pickView(), changeable: changeable(allRight()), lines: linesOf } }),
  };
  return flow;
}
