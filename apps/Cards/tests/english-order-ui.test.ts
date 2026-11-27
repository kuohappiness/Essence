import test from 'node:test';
import type { TestContext } from 'node:test';
import assert from 'node:assert/strict';
import type { App } from 'obsidian';
import type { Session } from '../src/review/index.ts';
import { setup } from './helpers/pick-session.ts';
import { renderReview, type ReviewUi } from './helpers/review-ui.ts';
import { slotMark } from '../src/ui/rendered.ts';

// 英文的句子排序卡的畫面（tasks/english-typed-order.md §6-1、§6-2）：用 hook 替身跑真的 Review。版面在 Obsidian 用開發命令看。
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
const P = 'Essence Cards/英文/L3 文法.md';
const DECK = `---
科目: 英文
---
- 間接問句 排序 ^order1
    - 他住在哪裡？==where== ==does== ==he== ==live==?
        - 詳解：問句的詞序
    - 記憶錨點：疑問詞放最前面
`;
const keyTexts = (ui: ReviewUi): string[] => ui.find('ec-pick-key').map(key => ui.text(key));
const slotTexts = (ui: ReviewUi): string[] => ui.find('ec-pick-slot').map(slot => ui.text(slot));

void test('整題一列、每個 ＿＿ 一格；字鍵照原樣（作者寫小寫）；放進句首那一格的字第一個字母大寫', async t => {
  const h = await setup(t, { [P]: DECK });
  const s = await h.open({ subject: '英文' });
  const ui = await show(t, s);
  assert.equal(ui.find('ec-pick')[0].props.className, 'ec-card ec-pick is-sentence is-english');
  assert.equal(ui.text(ui.find('ec-pick-title')[0]), '間接問句');
  assert.equal(ui.find('ec-pick-row').length, 1);
  assert.deepEqual([...keyTexts(ui)].sort(), ['does', 'he', 'live', 'where']);
  assert.equal(ui.find('ec-pick-slot').length, 4);
  for (const word of ['where', 'does', 'he', 'live']) { h.clock.now += 400; ui.click(ui.find('ec-pick-key')[keyTexts(ui).indexOf(word)]); }
  assert.deepEqual(slotTexts(ui), ['Where', 'does', 'he', 'live']);
  assert.equal(ui.find('ec-ex').length, 0, '對答案前沒有補充');
  h.clock.now += 400;
  ui.click(ui.find('ec-pick-check')[0]);
  assert.equal(ui.text(ui.find('ec-pick-mark')[0]), '✓');
  assert.equal(ui.find('ec-ex-item').length, 2, '對答案後詳解與記憶錨點接在句子下面');
});

// 另一種排法（tasks/sentence-order-alternatives.md §5）：作答時藏起只有某一種才有的逗號；結果照排的那一種，補充區列其他對的順序的整句。
const ALT_DECK = `---
科目: 英文
---
- 用 because 合成一句 排序 ^order2
    - I was tired. I went to bed early.（用 because 合成一句）==I went to bed early== ==because== ==I was tired==.
        - 另一種排法：==because== ==I was tired==, ==I went to bed early==.
        - 詳解：because 放前面時，兩個子句中間加逗號
`;
const HEAD = 'I was tired. I went to bed early.（用 because 合成一句）';
const sentenceText = (ui: ReviewUi): unknown => ui.find('ec-pick-text')[0].children.map(child => typeof child === 'string' ? child : child.props.text)[0];
const exRows = (ui: ReviewUi): [string, unknown][] => ui.find('ec-ex-item').map(item => {
  const label = ui.find('ec-ex-label').find(each => item.children.includes(each));
  const row = item.children.find(child => typeof child !== 'string' && child.props.className === 'ec-ex-row');
  const markdown = row && typeof row !== 'string' ? row.children[0] : undefined;
  return [label ? ui.text(label) : '', markdown && typeof markdown !== 'string' ? markdown.props.text : undefined];
});

void test('另一種排法：作答時第 2 格後面是空白；排另一種是全對，句子照它；補充區只列題目那一行的整句', async t => {
  const h = await setup(t, { [P]: ALT_DECK });
  const s = await h.open({ subject: '英文' });
  const ui = await show(t, s);
  assert.equal(sentenceText(ui), HEAD + slotMark(0) + ' ' + slotMark(1) + ' ' + slotMark(2) + '.');
  for (const word of ['because', 'I was tired', 'I went to bed early']) { h.clock.now += 400; ui.click(ui.find('ec-pick-key')[keyTexts(ui).indexOf(word)]); }
  h.clock.now += 400;
  ui.click(ui.find('ec-pick-check')[0]);
  await ui.settle();
  assert.equal(ui.text(ui.find('ec-pick-mark')[0]), '✓');
  assert.deepEqual(slotTexts(ui), ['Because', 'I was tired', 'I went to bed early']);
  assert.equal(sentenceText(ui), HEAD + slotMark(0) + ' ' + slotMark(1) + ', ' + slotMark(2) + '.');
  assert.deepEqual(exRows(ui), [['另一種排法：', 'I went to bed early because I was tired.'], ['詳解：', 'because 放前面時，兩個子句中間加逗號']]);
});
