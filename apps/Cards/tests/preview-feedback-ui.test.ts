import test from 'node:test';
import type { TestContext } from 'node:test';
import assert from 'node:assert/strict';
import type { App } from 'obsidian';
import { parseDeck } from '../src/core/deck/index.ts';
import { createPreview } from '../src/review/index.ts';
import type { Feedback, FeedbackSink, SaveResult, Session } from '../src/review/index.ts';
import { renderReview, type ReviewUi } from './helpers/review-ui.ts';

// 預覽的回饋列（tasks/card-feedback.md §3、§6）：用 hook 替身跑真的 Review。版面、iPhone 的鍵盤與語音輸入在實機看（§6 的平台事實）。

const NO_OWNER = { term: null, subject: null, unit: null };
const PATH = 'Essence Cards/自然.md';
const DECK = '---\n年級學期: 國二上\n科目: 自然\n單元: 2-1 水溶液\n狀態: 草稿\n---\n- 目標一 ^a\n    - 第一題 :: 一\n- 還沒補 ID\n    - 第二題 :: 二\n';

function store(results: SaveResult[] = []) {
  const saved: Feedback[] = [];
  const value: FeedbackSink = { save(_card, feedback) { saved.push(feedback); return Promise.resolve(results.shift() ?? 'saved'); } };
  return { value, saved };
}
async function show(t: TestContext, feedback?: FeedbackSink): Promise<{ ui: ReviewUi; session: Session }> {
  const session = createPreview({ path: PATH, deck: parseDeck(DECK), reveal: true, ...feedback ? { feedback } : {} });
  assert.ok(session);
  const ui = await renderReview({
    app: {} as App, session, close: () => {}, openLink: () => {}, materials: () => [], owner: () => NO_OWNER, units: () => [],
    speech: { say: () => {}, stop: () => {} }, autoRead: { get: () => false, set: () => {} }, pickedAt: performance.now(),
  });
  t.after(() => { ui.unmount(); });
  return { ui, session };
}
const button = (ui: ReviewUi, label: string) => {
  const found = ui.find('ec-fb').find(each => ui.text(each) === label);
  assert.ok(found, '找不到：' + label);
  return found;
};
const labels = (ui: ReviewUi, cls: string): string[] => ui.find(cls).map(each => ui.text(each));
const question = (session: Session): string => {
  const view = session.view();
  if (view.kind !== 'card') return view.kind;
  const { prompt } = view.card.card;
  return prompt.kind === 'qa' ? prompt.question : prompt.text;
};

void test('設定頁關著（沒給寫的一方）：沒有回饋列', async t => {
  const { ui } = await show(t);
  assert.equal(ui.find('ec-feedback').length, 0);
});

void test('回饋列在卡片區和下方按鈕之間；三個評等加「寫一句」；點「要改」有底色、出現四個標籤、開頭寫「已存」', async t => {
  const saves = store();
  const { ui } = await show(t, saves.value);
  const kids = ui.root().children.flatMap(child => typeof child === 'string' ? [] : [String(child.props.className)]);
  const at = kids.findIndex(name => name.includes('ec-feedback'));
  assert.ok(kids[at - 1].includes('ec-stage') && kids[at + 1].includes('ec-actions'), kids.join(' / '));
  assert.deepEqual(labels(ui, 'ec-fb'), ['可以用', '要改', '不要這張', '✎ 寫一句']);
  assert.equal(ui.text(ui.find('ec-feedback-head')[0]), '回饋');
  ui.click(button(ui, '要改'));
  await ui.settle();
  assert.equal(button(ui, '要改').props['aria-pressed'], true);
  assert.equal(button(ui, '可以用').props['aria-pressed'], false);
  assert.deepEqual(labels(ui, 'ec-fb-tag'), ['詳解', '考點', '版面', '不值得考']);
  assert.equal(ui.text(ui.find('ec-feedback-head')[0]), '已存');
  ui.click(button(ui, '詳解'));
  await ui.settle();
  assert.equal(button(ui, '詳解').props['aria-pressed'], true);
  ui.click(button(ui, '可以用'));
  await ui.settle();
  assert.equal(ui.find('ec-fb-tag').length, 0, '可以用沒有標籤');
  assert.deepEqual(saves.saved, [
    { rate: 'fix', tags: [], note: '' },
    { rate: 'fix', tags: ['explain'], note: '' },
    { rate: 'ok', tags: [], note: '' },
  ]);
});

void test('寫一句：從上方的框寫，打字不存；Enter 存；框開著時背後不能操作、Space、1～4、方向鍵都不作用；Esc 取消不存', async t => {
  const saves = store();
  const { ui, session } = await show(t, saves.value);
  ui.click(button(ui, '✎ 寫一句'));
  await ui.settle();
  assert.equal(ui.find('ec-note').length, 1);
  for (const cls of ['ec-top', 'ec-stage', 'ec-actions', 'ec-feedback']) assert.equal(ui.find(cls)[0].props.inert, true, cls);
  const input = ui.find('ec-note-input')[0];
  (input.props.onChange as (e: unknown) => void)({ target: { value: '例句太長 看不懂' } });
  await ui.settle();
  for (const key of [' ', '1', '3', 'ArrowRight', 'ArrowLeft']) ui.key(key);
  assert.equal(question(session), '第一題', '沒有換卡');
  assert.equal(saves.saved.length, 0, '打字中不存');
  assert.equal(ui.find('ec-note').length, 1, '框還開著');
  ui.key('Enter');
  await ui.settle();
  assert.equal(ui.find('ec-note').length, 0);
  assert.deepEqual(saves.saved, [{ rate: null, tags: [], note: '例句太長 看不懂' }]);
  assert.deepEqual(labels(ui, 'ec-fb').at(-1), '✎ 改一句');
  ui.click(button(ui, '✎ 改一句'));
  await ui.settle();
  assert.equal(ui.find('ec-note-input')[0].props.value, '例句太長 看不懂', '打開時是現在的字');
  (ui.find('ec-note-input')[0].props.onChange as (e: unknown) => void)({ target: { value: '改掉' } });
  await ui.settle();
  ui.key('Escape');
  await ui.settle();
  assert.equal(ui.find('ec-note').length, 0);
  assert.equal(saves.saved.length, 1, '取消不存');
  ui.click(button(ui, '✎ 改一句'));
  await ui.settle();
  assert.equal(ui.find('ec-note-input')[0].props.value, '例句太長 看不懂', '取消後恢復原字');
  ui.click(ui.find('ec-note-cancel')[0]);
  await ui.settle();
  assert.equal(ui.find('ec-note').length, 0);
});

void test('沒存到：開頭寫「沒存到」、多一行說明；寫滿寫「這次預覽的回饋滿了」', async t => {
  const saves = store(['failed', 'full']);
  const { ui } = await show(t, saves.value);
  ui.click(button(ui, '不要這張'));
  await ui.settle();
  assert.equal(ui.text(ui.find('ec-feedback-head')[0]), '沒存到');
  assert.equal(ui.text(ui.find('ec-feedback-notice')[0]), '沒存到，再點一次');
  ui.click(button(ui, '版面'));
  await ui.settle();
  assert.equal(ui.text(ui.find('ec-feedback-notice')[0]), '這次預覽的回饋滿了');
});

void test('還沒補 ID 的卡沒有回饋列；完成畫面寫留了幾張', async t => {
  const saves = store();
  const { ui, session } = await show(t, saves.value);
  ui.click(button(ui, '可以用'));
  await ui.settle();
  session.forward();
  await ui.settle();
  assert.equal(question(session), '第二題');
  assert.equal(ui.find('ec-feedback').length, 0);
  session.forward();
  await ui.settle();
  const done = session.view();
  assert.equal(done.kind === 'done' && done.done.detail, '共 2 張，留了 1 張的回饋');
  assert.equal(ui.find('ec-feedback').length, 0);
});
