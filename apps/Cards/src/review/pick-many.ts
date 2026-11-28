import type { Card, Rating } from '../core/study/index.ts';
import type { Flow, ReviewLine } from './flow.ts';
import type { PickChip, PickView } from './pick.ts';
import { AFTER_FILL, ALL_RIGHT, changeable, NONE, RANK, SAME_KEY } from './pick-shared.ts';

// 一列可以放好幾個的配對（tasks/matching-many.md §5、D-252）：純程式，時間由 now 給。createPick 遇到 group.many 走這裡；
// 比較卡、多音字、排序與一列一個的配對都不經過。一列要剛好放對（不多、不少，先後不算）才算對；再選時不劃掉、只說這一列不對。

interface Row {
  lt: string;
  v: string;
  /** 這一列對的那一組字（照字鍵的寫法）。 */
  answers: readonly string[];
  /** 現在放著的字，照放的先後。 */
  placed: string[];
  /** 作答時記成跳過（沒印象）。 */
  skipped: boolean;
  /** 第一次對答案時放的字；第一次按沒印象是 null。 */
  first: string[] | null;
  /** 第一次對答案之前是 open；不對的列再選時是 retry，定案之後是 near 或 miss。 */
  status: 'open' | 'right' | 'retry' | 'near' | 'miss';
  /** 第一次不對時，再選的結果。 */
  retry?: 'right' | 'wrong' | 'skip';
}

/** 放的那一組和答案的那一組剛好一樣（先後不算）。字都是同一組字鍵的寫法，照字串比就是照比對鍵比。 */
const same = (placed: readonly string[], answers: readonly string[]): boolean =>
  placed.length === answers.length && placed.every(word => answers.includes(word));

export function createPickMany(card: Card, options: { now: () => number; revealed?: boolean }): Flow {
  const rows: Row[] = card.blanks.map(blank => ({ lt: blank.lt, v: blank.prompt.fingerprint, answers: blank.answers ?? [], placed: [], skipped: false, first: null, status: 'open' }));
  const keys = card.group?.keys ?? [];
  const shown = options.revealed === true;
  let stage: PickView['stage'] = shown ? 'result' : 'answer';
  let cursor: number | null = shown ? null : 0;
  let lastKey = { key: '', at: -Infinity };
  let lastFill = -Infinity;

  /** 作答時沒放字、也沒記成跳過。 */
  const empty = (row: Row): boolean => row.placed.length === 0 && !row.skipped;
  /** 再選時還沒定案的不對的列。 */
  const open = (row: Row): boolean => row.status === 'retry' && row.retry === undefined;
  /** 能改的列：作答時每一列，再選時只有沒定案的不對的列。 */
  const movable = (row: Row): boolean => stage === 'answer' || (stage === 'retry' && open(row));
  /** from 之後第一個符合的列，往後繞一圈；from 自己最後才看。 */
  function after(from: number, wanted: (row: Row) => boolean): number | null {
    for (let step = 1; step <= rows.length; step++) {
      const index = (from + step) % rows.length;
      if (wanted(rows[index])) return index;
    }
    return null;
  }
  function toResult(): void {
    stage = 'result';
    cursor = null;
    flow.revealedAt = options.now();
  }

  function key(value: string): boolean {
    if (stage === 'result') return false;
    const at = options.now();
    const repeated = value === lastKey.key && at - lastKey.at < SAME_KEY;
    lastKey = { key: value, at };
    if (repeated || cursor === null || !keys.includes(value)) return false;
    const row = rows[cursor];
    if (!movable(row)) return false;
    // 跳過的列點字鍵：取消跳過、放進那個字。已經在這一列就拿掉，不在就加在最後；放了之後停在同一列（不知道有幾個）。
    if (row.skipped) { row.skipped = false; row.placed = [value]; } else if (row.placed.includes(value)) { row.placed = row.placed.filter(word => word !== value); return true; } else row.placed.push(value);
    lastFill = at;
    return true;
  }

  /** 點列裡的小塊：拿掉那個字，換到那一列。 */
  function unpick(index: number, at: number): boolean {
    const row = rows.at(index);
    if (index < 0 || !row || stage === 'result' || !movable(row) || at < 0 || at >= row.placed.length) return false;
    row.placed.splice(at, 1);
    cursor = index;
    return true;
  }

  function row(index: number): boolean {
    const target = rows.at(index);
    if (index < 0 || !target || index === cursor || stage === 'result' || !movable(target)) return false;
    cursor = index;
    return true;
  }

  function skip(): boolean {
    if (stage === 'result' || cursor === null) return false;
    const row = rows[cursor];
    if (stage === 'answer') {
      row.placed = [];
      row.skipped = true;
      lastFill = options.now();
      cursor = after(cursor, empty);
      return true;
    }
    // 再選時按沒印象：這一列定案；不對的列都定案了就直接到結果，還有放著字、沒定案的列等第二次對答案。
    row.retry = 'skip';
    row.status = 'miss';
    cursor = after(cursor, open);
    if (cursor === null) toResult();
    return true;
  }

  function check(): boolean {
    if (stage === 'result') return false;
    const waiting = stage === 'answer' ? rows.findIndex(empty) : rows.findIndex(each => open(each) && each.placed.length === 0);
    if (waiting >= 0) { cursor = waiting; return true; }
    if (options.now() - lastFill < AFTER_FILL) return false;
    if (stage === 'answer') {
      for (const each of rows) {
        each.first = each.skipped ? null : [...each.placed];
        each.status = each.skipped ? 'miss' : same(each.placed, each.answers) ? 'right' : 'retry';
      }
      const first = rows.findIndex(open);
      if (first >= 0) { stage = 'retry'; cursor = first; } else toResult();
      return true;
    }
    for (const each of rows) {
      if (!open(each)) continue;
      const right = same(each.placed, each.answers);
      each.retry = right ? 'right' : 'wrong';
      each.status = right ? 'near' : 'miss';
    }
    toResult();
    return true;
  }

  const allRight = (): boolean => stage === 'result' && !shown && rows.every(each => each.status === 'right');
  /** 程式判的評分；全對時由孩子選記住了或太簡單（rating）。 */
  const ratingOf = (each: Row, rating: Rating | null): Rating => each.status === 'right' ? (rating === 'easy' ? 'easy' : 'good') : each.status === 'near' ? 'near' : 'miss';

  /** 結果裡這一列最後一次放的字（§5〈結果〉）：第二次對答案的看現在的，再選時按沒印象的看第一次，第一次按沒印象的沒有。 */
  const lastOf = (each: Row): readonly string[] => each.first === null ? [] : each.retry === 'skip' ? each.first : each.placed;
  function chipsOf(each: Row): PickChip[] {
    const chips = (words: readonly string[], state: PickChip['state']): PickChip[] => words.map(text => ({ text, state }));
    if (shown) return chips(each.answers, 'shown');
    if (stage !== 'result') {
      if (each.skipped || each.status === 'miss') return [];
      return chips(each.placed, each.status === 'right' ? 'right' : 'placed');
    }
    if (each.status === 'right' || each.status === 'near') return chips(lastOf(each), each.status);
    const last = lastOf(each);
    return [...last.map((text): PickChip => ({ text, state: each.answers.includes(text) ? 'kept' : 'struck' })), ...chips(each.answers.filter(word => !last.includes(word)), 'missed')];
  }
  function cellView(each: Row): PickView['cells'][number] {
    const chips = chipsOf(each);
    const text = chips.map(chip => chip.text).join('、');
    if (shown) return { text, state: 'shown', chips };
    if (stage === 'result') return { text, state: each.status, chips };
    if (each.status === 'open') return each.skipped ? { text: '？', state: 'skipped', chips } : { text, state: each.placed.length ? 'filled' : 'open', chips };
    // 再選時跳過、按了沒印象的列先不給答案（同一格一個字的卡）。
    if (each.status === 'miss') return { text: '？', state: 'miss', chips };
    return { text, state: each.status, chips };
  }
  function pickView(): PickView {
    return {
      stage, cursor, cells: rows.map(cellView),
      // 再選時字鍵都能按（D-252 第 4 點：不劃掉，也不停用）；放過的字不變淡。
      spent: null, used: keys.map(() => false),
      filled: stage === 'answer' ? !rows.some(empty) : !rows.some(each => open(each) && each.placed.length === 0),
      results: {}, committable: stage === 'result' && !allRight(),
    };
  }

  /** 一個目標一行（同一格一個字的卡）：最差的格放最上層，其他格放 also；pick 是第一次對答案時放的字的清單，第一次按沒印象是 null。 */
  function linesOf(rating: Rating | null): ReviewLine[] {
    const byTarget = new Map<string, Row[]>();
    for (const each of rows) {
      const list = byTarget.get(each.lt);
      if (list) list.push(each);
      else byTarget.set(each.lt, [each]);
    }
    return [...byTarget].map(([lt, list]) => {
      const worst = list.reduce((best, each) => RANK[ratingOf(each, rating)] < RANK[ratingOf(best, rating)] ? each : best);
      const also = list.filter(each => each !== worst).map(each => ({ v: each.v, r: ratingOf(each, rating), pick: each.first, ...(each.retry ? { retry: each.retry } : {}) }));
      return { lt, r: ratingOf(worst, rating), v: worst.v, pick: worst.first, ...(worst.retry ? { retry: worst.retry } : {}), ...(also.length ? { also } : {}) };
    });
  }

  const flow: Flow = {
    autoRead: null,
    revealedAt: null,
    view: () => ({ revealed: stage === 'result', allowed: allRight() ? ALL_RIGHT : NONE, speakable: false, typed: null, pick: pickView() }),
    act(action) {
      switch (action.kind) {
        case 'key': return key(action.key);
        case 'unpick': return unpick(action.index, action.at);
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
