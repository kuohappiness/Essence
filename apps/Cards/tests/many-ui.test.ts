import test from 'node:test';
import type { TestContext } from 'node:test';
import assert from 'node:assert/strict';
import type { App } from 'obsidian';
import type { Session } from '../src/review/index.ts';
import { pick, setup, stage, view } from './helpers/pick-session.ts';
import type { Harness } from './helpers/pick-session.ts';
import { renderReview, type ReviewUi } from './helpers/review-ui.ts';
import { TOWNS } from './helpers/many.ts';

// 一列好幾個的畫面（tasks/matching-many.md §6、〈驗收〉〈畫面〉、experiments/mockups/matching-many.html）：預期值手寫。
const P = 'Essence Cards/社會/名產.md';
const DECK = '---\n科目: 社會\n---\n' + TOWNS;
const NO_OWNER = { term: null, subject: null, unit: null };
async function show(t: TestContext, session: Session): Promise<ReviewUi> {
  const ui = await renderReview({
    app: {} as App, session, close: () => {}, openLink: () => {}, materials: () => [], owner: () => NO_OWNER, units: () => [],
    speech: { say: () => {}, stop: () => {} }, autoRead: { get: () => false, set: () => {} }, pickedAt: performance.now(),
  });
  t.after(() => { ui.unmount(); });
  await ui.settle();
  return ui;
}
async function open(t: TestContext): Promise<{ h: Harness; s: Session; ui: ReviewUi }> {
  const h = await setup(t, { [P]: DECK });
  const s = await h.open({ subject: '社會' });
  return { h, s, ui: await show(t, s) };
}
const rowOf = (s: Session, lt: string): number => view(s).card.blanks.findIndex(blank => blank.lt === lt);
/** 換到那一列，再一個一個點字鍵（畫面上的按鈕）。 */
async function put(h: Harness, s: Session, ui: ReviewUi, lt: string, words: readonly string[]): Promise<void> {
  ui.click(ui.find('ec-pick-row')[rowOf(s, lt)]);
  const keys = view(s).card.group?.keys ?? [];
  for (const word of words) { h.clock.now += 400; ui.click(ui.find('ec-pick-key')[keys.indexOf(word)]); }
  await ui.settle();
}
const slots = (ui: ReviewUi) => ui.find('ec-pick-slot');
/** 那一列的格子裡的小塊：字、樣子、是不是按鈕。 */
const chipsOf = (ui: ReviewUi, s: Session, lt: string): [string, string, string][] =>
  ui.find('ec-pick-chip').filter(chip => slots(ui)[rowOf(s, lt)].children.includes(chip)).map(chip => [ui.text(chip), String(chip.props['data-state']), chip.type]);

void test('畫面：格子是容器不是按鈕，小塊是裡面自己的按鈕；空的列看不出有幾格', async t => {
  const { h, s, ui } = await open(t);
  assert.ok(slots(ui).every(slot => slot.type === 'span' && slot.props.role === 'group'));
  assert.deepEqual(slots(ui).map(slot => ui.text(slot)), ['　', '　', '　']);
  assert.deepEqual(ui.find('ec-pick-chip'), []);
  // 題幹沒有空格：最後補一格（同第 1 段），格子接在問號後面。
  const texts = ui.find('ec-pick-text').map(each => each.children.flatMap(child => typeof child === 'string' || child.type !== 'markdown' ? [] : [String(child.props.text)])[0]);
  assert.equal(texts[rowOf(s, 'lukang')], '鹿港的名產有哪些？＿＿');
  await put(h, s, ui, 'lukang', ['E', 'A']);
  assert.deepEqual(chipsOf(ui, s, 'lukang'), [['E', 'placed', 'button'], ['A', 'placed', 'button']]);
  // 點小塊拿掉。
  ui.click(ui.find('ec-pick-chip')[0]);
  await ui.settle();
  assert.deepEqual(chipsOf(ui, s, 'lukang'), [['A', 'placed', 'button']]);
  // 字鍵照 singleColumns：一個字的 5 個一排。
  assert.equal(ui.find('ec-pick-keys')[0].props.style?.['--ec-pick-columns' as keyof object], '5');
});

void test('畫面：再選時字都留著、字鍵都能按、按鈕還是「對答案」；Enter 兩次都能對答案；結果劃掉放錯的、補上漏的，小塊不是按鈕', async t => {
  const { h, s, ui } = await open(t);
  await put(h, s, ui, 'lukang', ['A', 'D']);
  await put(h, s, ui, 'dajia0', ['B']);
  await put(h, s, ui, 'waipu0', ['C', 'A']);
  h.clock.now += 400;
  ui.key('Enter');
  await ui.settle();
  assert.equal(stage(s), 'retry');
  assert.deepEqual(chipsOf(ui, s, 'waipu0'), [['C', 'placed', 'button'], ['A', 'placed', 'button']]);
  assert.deepEqual(chipsOf(ui, s, 'dajia0'), [['B', 'right', 'span']]);
  assert.ok(ui.find('ec-pick-key').every(key => key.props.disabled !== true));
  const button = ui.find('ec-pick-check')[0];
  assert.deepEqual([ui.text(button), String(button.props.className).includes('is-again')], ['對答案', false]);
  // 鹿港補 E；外埔不改。
  await put(h, s, ui, 'lukang', ['E']);
  h.clock.now += 400;
  ui.key('Enter');
  await ui.settle();
  assert.equal(stage(s), 'result');
  assert.deepEqual(pick(s).cells[rowOf(s, 'waipu0')].state, 'miss');
  assert.deepEqual(chipsOf(ui, s, 'waipu0'), [['C', 'kept', 'span'], ['A', 'struck', 'span'], ['D', 'missed', 'span']]);
  assert.deepEqual(chipsOf(ui, s, 'lukang'), [['A', 'near', 'span'], ['D', 'near', 'span'], ['E', 'near', 'span']]);
});
