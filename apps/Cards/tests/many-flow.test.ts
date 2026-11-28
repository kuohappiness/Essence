import test from 'node:test';
import assert from 'node:assert/strict';
import { parseDeck } from '../src/core/deck/index.ts';
import { createPreview, RATE_DELAY } from '../src/review/index.ts';
import type { Session } from '../src/review/index.ts';
import { check, pick, setup, skip, stage, tap, view } from './helpers/pick-session.ts';
import type { Harness } from './helpers/pick-session.ts';
import { TOWNS } from './helpers/many.ts';

// 一列好幾個的作答、判分與紀錄（tasks/matching-many.md §5、〈驗收〉〈作答與判分〉〈紀錄〉）：預期值手寫。
// 鹿港 A、D、E；大甲 B；外埔 C、D。格子打散，照目標找列。
const P = 'Essence Cards/社會/名產.md';
const DECK = '---\n科目: 社會\n---\n' + TOWNS;
const ONE = `---\n科目: 社會\n---\n- 能說出哪些是哺乳類 ^mammal\n    - 下面哪些是哺乳類？ :: 鯨魚;;蝙蝠;;海豚\n    - 選項：鯨魚;;蝙蝠;;企鵝;;鯊魚;;海豚\n`;

async function open(t: Parameters<typeof setup>[0], text = DECK): Promise<{ h: Harness; s: Session }> {
  const h = await setup(t, { [P]: text });
  const s = await h.open({ subject: '社會' });
  return { h, s };
}
const rowOf = (s: Session, lt: string): number => view(s).card.blanks.findIndex(blank => blank.lt === lt);
/** 換到那一列（已經在那一列時 row 不算數，照樣停在那裡）再一個一個點字鍵。 */
function put(h: Harness, s: Session, lt: string, words: readonly string[]): void {
  s.act({ kind: 'row', index: rowOf(s, lt) });
  for (const word of words) tap(h, s, word);
}
const chips = (s: Session, lt: string): [string, string][] => (pick(s).cells[rowOf(s, lt)].chips ?? []).map(chip => [chip.text, chip.state]);
const state = (s: Session, lt: string): string => pick(s).cells[rowOf(s, lt)].state;
const cursorAt = (s: Session): string | null => { const at = pick(s).cursor; return at === null ? null : view(s).card.blanks[at].lt; };
const shape = (line: Record<string, unknown>): Record<string, unknown> => Object.fromEntries(Object.entries(line).filter(([key]) => ['lt', 'r', 'pick', 'retry'].includes(key)));
const byLt = (lines: Record<string, unknown>[]): Record<string, unknown>[] => lines.map(shape).sort((a, b) => String(a.lt).localeCompare(String(b.lt)));
async function finish(h: Harness, s: Session, rating?: 'good' | 'easy'): Promise<Record<string, unknown>[]> {
  h.clock.now += RATE_DELAY;
  assert.equal(rating ? s.rate(rating) : s.commit(), true);
  await h.state.flush();
  return h.log();
}

void test('卡：整組一列可以放好幾個，每一格的 answers 照寫的先後；沒有單一的 answer', async t => {
  const { s } = await open(t);
  const card = view(s).card;
  assert.equal(card.group?.many, true);
  assert.deepEqual(card.blanks.map(blank => [blank.lt, blank.answers, blank.answer]).sort(), [['dajia0', ['B'], undefined], ['lukang', ['A', 'D', 'E'], undefined], ['waipu0', ['C', 'D'], undefined]]);
  assert.deepEqual([...card.group?.keys ?? []].sort(), ['A', 'B', 'C', 'D', 'E']);
  assert.deepEqual([pick(s).spent, pick(s).used], [null, [false, false, false, false, false]]);
});

void test('作答：點字鍵加在最後、再點拿掉；加了停在同一列；點別列的小塊拿掉並換到那一列', async t => {
  const { h, s } = await open(t);
  put(h, s, 'lukang', ['E', 'A', 'B']);
  assert.deepEqual(chips(s, 'lukang'), [['E', 'placed'], ['A', 'placed'], ['B', 'placed']]);
  assert.deepEqual([cursorAt(s), state(s, 'lukang'), pick(s).cells[rowOf(s, 'lukang')].text], ['lukang', 'filled', 'E、A、B']);
  tap(h, s, 'A');
  assert.deepEqual(chips(s, 'lukang'), [['E', 'placed'], ['B', 'placed']]);
  // 同一個字 0.3 秒內連點不算（不會加了又拿掉）。
  h.clock.now += 400;
  s.act({ kind: 'key', key: 'D' });
  s.act({ kind: 'key', key: 'D' });
  assert.deepEqual(chips(s, 'lukang'), [['E', 'placed'], ['B', 'placed'], ['D', 'placed']]);
  put(h, s, 'dajia0', ['B']);
  assert.equal(cursorAt(s), 'dajia0');
  s.act({ kind: 'unpick', index: rowOf(s, 'lukang'), at: 1 });
  assert.deepEqual([cursorAt(s), chips(s, 'lukang')], ['lukang', [['E', 'placed'], ['D', 'placed']]]);
  s.act({ kind: 'unpick', index: rowOf(s, 'lukang'), at: 5 });
  assert.deepEqual(chips(s, 'lukang'), [['E', 'placed'], ['D', 'placed']], '沒有那一個字');
});

void test('作答：沒印象清空、記成跳過、跳到下一個空的列；跳過的列點字鍵取消跳過；有空的列按對答案跳過去', async t => {
  const { h, s } = await open(t);
  put(h, s, 'lukang', ['A']);
  skip(h, s);
  assert.deepEqual([state(s, 'lukang'), pick(s).cells[rowOf(s, 'lukang')].text, chips(s, 'lukang')], ['skipped', '？', []]);
  assert.notEqual(cursorAt(s), 'lukang');
  put(h, s, 'lukang', ['D']);
  assert.deepEqual([state(s, 'lukang'), chips(s, 'lukang')], ['filled', [['D', 'placed']]]);
  assert.equal(pick(s).filled, false);
  check(h, s);
  assert.equal(stage(s), 'answer');
  assert.equal(pick(s).cells[pick(s).cursor ?? -1].state, 'open');
});

void test('判分：第一次全對是記住了，可以按太簡單；每一行的 pick 是清單（答案一個的列也是）', async t => {
  const { h, s } = await open(t);
  put(h, s, 'lukang', ['E', 'A', 'D']);
  put(h, s, 'dajia0', ['B']);
  put(h, s, 'waipu0', ['D', 'C']);
  check(h, s);
  assert.deepEqual([stage(s), view(s).allowed, pick(s).committable], ['result', ['good', 'easy'], false]);
  assert.deepEqual(chips(s, 'waipu0'), [['D', 'right'], ['C', 'right']]);
  const lines = await finish(h, s, 'easy');
  assert.deepEqual(byLt(lines), [
    { lt: 'dajia0', r: 'easy', pick: ['B'] },
    { lt: 'lukang', r: 'easy', pick: ['E', 'A', 'D'] },
    { lt: 'waipu0', r: 'easy', pick: ['D', 'C'] },
  ]);
  assert.equal(lines[0].with, undefined);
  for (const line of lines.slice(1)) assert.equal(line.with, lines[0].t);
});

void test('判分：漏一個再選補上、多放一個再選自己拿掉都是差一點；再選時字都留著、只標這一列不對，字鍵都能按', async t => {
  const { h, s } = await open(t);
  put(h, s, 'lukang', ['A', 'D']);
  put(h, s, 'dajia0', ['B']);
  put(h, s, 'waipu0', ['C', 'D', 'A']);
  check(h, s);
  assert.equal(stage(s), 'retry');
  assert.deepEqual([state(s, 'lukang'), state(s, 'waipu0'), state(s, 'dajia0')], ['retry', 'retry', 'right']);
  // 不劃掉：第一次放的字照樣是放著的；看不出是多放還是漏放。
  assert.deepEqual(chips(s, 'lukang'), [['A', 'placed'], ['D', 'placed']]);
  assert.deepEqual(chips(s, 'waipu0'), [['C', 'placed'], ['D', 'placed'], ['A', 'placed']]);
  assert.deepEqual(chips(s, 'dajia0'), [['B', 'right']]);
  assert.deepEqual([pick(s).spent, view(s).allowed], [null, []]);
  // 對的列鎖住：換不過去、拿不掉。
  s.act({ kind: 'row', index: rowOf(s, 'dajia0') });
  s.act({ kind: 'unpick', index: rowOf(s, 'dajia0'), at: 0 });
  assert.deepEqual([cursorAt(s), chips(s, 'dajia0')], ['lukang', [['B', 'right']]]);
  put(h, s, 'lukang', ['E']);
  s.act({ kind: 'unpick', index: rowOf(s, 'waipu0'), at: 2 });
  assert.deepEqual([cursorAt(s), chips(s, 'waipu0')], ['waipu0', [['C', 'placed'], ['D', 'placed']]]);
  assert.equal(pick(s).filled, true);
  check(h, s);
  assert.deepEqual([stage(s), pick(s).committable, view(s).allowed], ['result', true, []]);
  assert.deepEqual([state(s, 'lukang'), chips(s, 'lukang')], ['near', [['A', 'near'], ['D', 'near'], ['E', 'near']]]);
  assert.deepEqual(byLt(await finish(h, s)), [
    { lt: 'dajia0', r: 'good', pick: ['B'] },
    { lt: 'lukang', r: 'near', pick: ['A', 'D'], retry: 'right' },
    { lt: 'waipu0', r: 'near', pick: ['C', 'D', 'A'], retry: 'right' },
  ]);
});

void test('判分：全放的列不改送出是沒印象；再選也不對是沒印象；結果劃掉放錯的、補上漏的', async t => {
  const { h, s } = await open(t);
  put(h, s, 'lukang', ['A', 'B', 'C', 'D', 'E']);
  put(h, s, 'dajia0', ['B']);
  put(h, s, 'waipu0', ['C']);
  check(h, s);
  assert.equal(stage(s), 'retry');
  // 外埔再選：拿掉 C、加了 B（第一次 C，第二次 B）。
  put(h, s, 'waipu0', ['C', 'B']);
  check(h, s);
  assert.equal(stage(s), 'result');
  assert.deepEqual(chips(s, 'lukang'), [['A', 'kept'], ['B', 'struck'], ['C', 'struck'], ['D', 'kept'], ['E', 'kept']]);
  assert.deepEqual(chips(s, 'waipu0'), [['B', 'struck'], ['C', 'missed'], ['D', 'missed']]);
  assert.deepEqual(byLt(await finish(h, s)), [
    { lt: 'dajia0', r: 'good', pick: ['B'] },
    { lt: 'lukang', r: 'miss', pick: ['A', 'B', 'C', 'D', 'E'], retry: 'wrong' },
    { lt: 'waipu0', r: 'miss', pick: ['C'], retry: 'wrong' },
  ]);
});

void test('再選：字都拿掉的列按對答案跳過去、不判；再選時按沒印象定案、跳到下一個不對的列；結果照第一次放的', async t => {
  const { h, s } = await open(t);
  put(h, s, 'lukang', ['A']);
  put(h, s, 'dajia0', ['A']);
  put(h, s, 'waipu0', ['C']);
  check(h, s);
  assert.deepEqual([state(s, 'lukang'), state(s, 'dajia0'), state(s, 'waipu0')], ['retry', 'retry', 'retry']);
  // 大甲：拿掉 A 空著，按對答案跳到大甲。
  s.act({ kind: 'unpick', index: rowOf(s, 'dajia0'), at: 0 });
  put(h, s, 'lukang', ['D']);
  check(h, s);
  assert.deepEqual([stage(s), cursorAt(s)], ['retry', 'dajia0']);
  // 大甲按沒印象：定案，跳到下一個沒定案的。
  skip(h, s);
  assert.deepEqual([state(s, 'dajia0'), pick(s).cells[rowOf(s, 'dajia0')].text, chips(s, 'dajia0')], ['miss', '？', []]);
  const before = cursorAt(s);
  s.act({ kind: 'row', index: rowOf(s, 'dajia0') });
  assert.equal(cursorAt(s), before, '定案的列換不過去');
  // 外埔加了 D 又按沒印象：結果看第一次的 C。
  put(h, s, 'waipu0', ['D']);
  skip(h, s);
  assert.equal(stage(s), 'retry', '鹿港還放著字、沒定案');
  check(h, s);
  assert.equal(stage(s), 'result');
  assert.deepEqual(chips(s, 'dajia0'), [['A', 'struck'], ['B', 'missed']]);
  assert.deepEqual(chips(s, 'waipu0'), [['C', 'kept'], ['D', 'missed']]);
  assert.deepEqual(chips(s, 'lukang'), [['A', 'kept'], ['D', 'kept'], ['E', 'missed']]);
  assert.deepEqual(byLt(await finish(h, s)), [
    { lt: 'dajia0', r: 'miss', pick: ['A'], retry: 'skip' },
    { lt: 'lukang', r: 'miss', pick: ['A'], retry: 'wrong' },
    { lt: 'waipu0', r: 'miss', pick: ['C'], retry: 'skip' },
  ]);
});

void test('再選：最後一個不對的列按沒印象直接到結果，不用再按對答案；第一次就按沒印象的不進再選、補上整組答案', async t => {
  const { h, s } = await open(t);
  put(h, s, 'lukang', ['A']);
  put(h, s, 'dajia0', ['B']);
  s.act({ kind: 'row', index: rowOf(s, 'waipu0') });
  skip(h, s);
  check(h, s);
  assert.deepEqual([stage(s), cursorAt(s), state(s, 'waipu0')], ['retry', 'lukang', 'miss']);
  s.act({ kind: 'row', index: rowOf(s, 'waipu0') });
  assert.equal(cursorAt(s), 'lukang', '第一次按沒印象的鎖住');
  put(h, s, 'lukang', ['D']);
  skip(h, s);
  assert.equal(stage(s), 'result');
  assert.deepEqual(chips(s, 'waipu0'), [['C', 'missed'], ['D', 'missed']]);
  assert.deepEqual(chips(s, 'lukang'), [['A', 'kept'], ['D', 'missed'], ['E', 'missed']]);
  assert.deepEqual(byLt(await finish(h, s)), [
    { lt: 'dajia0', r: 'good', pick: ['B'] },
    { lt: 'lukang', r: 'miss', pick: ['A'], retry: 'skip' },
    { lt: 'waipu0', r: 'miss', pick: null },
  ]);
});

void test('多選（一組一個目標）：第一次按沒印象再按對答案直接到結果，pick 是 null、沒有 retry；全對可以按太簡單', async t => {
  {
    const { h, s } = await open(t, ONE);
    assert.equal(view(s).card.group?.many, true);
    skip(h, s);
    check(h, s);
    assert.equal(stage(s), 'result');
    assert.deepEqual(chips(s, 'mammal'), [['鯨魚', 'missed'], ['蝙蝠', 'missed'], ['海豚', 'missed']]);
    assert.deepEqual(byLt(await finish(h, s)), [{ lt: 'mammal', r: 'miss', pick: null }]);
  }
});

void test('第二次對答案：放完字 0.35 秒內不算', async t => {
  const { h, s } = await open(t);
  put(h, s, 'lukang', ['A']);
  put(h, s, 'dajia0', ['B']);
  put(h, s, 'waipu0', ['C', 'D']);
  check(h, s);
  assert.equal(stage(s), 'retry');
  h.clock.now += 400;
  s.act({ kind: 'key', key: 'D' });
  h.clock.now += 100;
  s.act({ kind: 'check' });
  assert.equal(stage(s), 'retry');
  h.clock.now += 300;
  s.act({ kind: 'check' });
  assert.equal(stage(s), 'result');
});

void test('回看：全對按記住了之後改成太簡單，新寫的每一行 pick 照樣是清單', async t => {
  const { h, s } = await open(t);
  put(h, s, 'lukang', ['A', 'D', 'E']);
  put(h, s, 'dajia0', ['B']);
  put(h, s, 'waipu0', ['C', 'D']);
  check(h, s);
  const old = await finish(h, s, 'good');
  s.back();
  assert.deepEqual([stage(s), view(s).allowed], ['result', ['good', 'easy']]);
  h.clock.now += 1000;
  assert.equal(s.rate('easy'), true);
  await h.state.flush();
  const fresh = h.log().slice(old.length + old.length);
  assert.deepEqual(byLt(fresh), [
    { lt: 'dajia0', r: 'easy', pick: ['B'] },
    { lt: 'lukang', r: 'easy', pick: ['A', 'D', 'E'] },
    { lt: 'waipu0', r: 'easy', pick: ['C', 'D'] },
  ]);
});

void test('預覽：一題一張，自動展開時直接顯示這一列的整組答案；卡照樣是一列可以放好幾個', () => {
  const deck = parseDeck('---\n科目: 社會\n狀態: 草稿\n---\n' + TOWNS);
  for (const reveal of [true, false]) {
    const session = createPreview({ path: P, deck, reveal });
    assert.ok(session);
    const seen: unknown[] = [];
    for (let current = session.view(); current.kind === 'card'; current = session.view()) {
      const { card, pick: shown } = current.card;
      assert.equal(card.group?.many, true);
      seen.push(reveal ? [shown?.stage, shown?.cells.map(cell => [cell.state, cell.chips?.map(chip => [chip.text, chip.state])])] : [shown?.stage, card.blanks.map(blank => blank.answers)]);
      session.forward();
    }
    assert.deepEqual(seen, reveal ? [
      ['result', [['shown', [['A', 'shown'], ['D', 'shown'], ['E', 'shown']]]]],
      ['result', [['shown', [['B', 'shown']]]]],
      ['result', [['shown', [['C', 'shown'], ['D', 'shown']]]]],
    ] : [['answer', [['A', 'D', 'E']]], ['answer', [['B']]], ['answer', [['C', 'D']]]]);
  }
});

void test('今天只出答案一個的那一列（同一天重出）：卡照樣是一列可以放好幾個', async t => {
  const { h, s } = await open(t);
  put(h, s, 'lukang', ['A', 'D', 'E']);
  put(h, s, 'dajia0', ['A']);
  put(h, s, 'waipu0', ['C', 'D']);
  check(h, s);
  s.act({ kind: 'row', index: rowOf(s, 'dajia0') });
  skip(h, s);
  await finish(h, s);
  // 大甲答錯，沒別張時提早再出：只出大甲那一列，作答的樣子不變。
  const again = view(s).card;
  assert.deepEqual([again.blanks.map(blank => blank.lt), again.group?.many, again.blanks[0].answers], [['dajia0'], true, ['B']]);
  put(h, s, 'dajia0', ['B', 'C']);
  check(h, s);
  assert.equal(stage(s), 'retry');
});

void test('單篇練習、全部卡的一輪：卡照樣是一列可以放好幾個', async t => {
  for (const choice of [{ deck: P }, { deck: P, since: Date.parse('2026-10-24T18:00:00.000+08:00') }]) {
    const h = await setup(t, { [P]: DECK });
    const s = await h.open(choice);
    assert.deepEqual([view(s).card.group?.many, view(s).card.blanks.map(blank => blank.lt).sort()], [true, ['dajia0', 'lukang', 'waipu0']], JSON.stringify(choice));
  }
});
