import test from 'node:test';
import type { TestContext } from 'node:test';
import assert from 'node:assert/strict';
import type { App } from 'obsidian';
import { parseDeck } from '../src/core/deck/index.ts';
import { createPreview } from '../src/review/index.ts';
import type { Session } from '../src/review/index.ts';
import { renderReview, type ReviewUi } from './helpers/review-ui.ts';

// 接句卡的畫面（D-185、tasks/couplet-cards.md §3）：用 hook 替身跑真的 Review。底線長度、換行、顏色在 Obsidian 用開發命令看。
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
const P = 'Essence Cards/國語/古詩.md';
const POEM = `---
科目: 國語
---
### 鳥鳴澗
- 鳥鳴澗 第 2 句 接句 ^b3pmab
    - 人閒桂花落，==夜靜春山空==。
    - 記憶錨點：
        - 人心清閒，桂花悄悄飄落；
        - 夜晚寂靜，春山顯得空曠。
        - 兩句都在寫靜。
    - 例句：不是記憶錨點的補充照舊
`;
const preview = (text: string, reveal: boolean): Session => {
  const session = createPreview({ path: P, deck: parseDeck(text), reveal });
  assert.ok(session);
  return session;
};
type Host = ReturnType<ReviewUi['find']>[number];
const all = (node: Host): Host[] => [node, ...node.children.flatMap(child => typeof child === 'string' ? [] : all(child))];
const markdowns = (node: Host): Host[] => all(node).filter(each => each.type === 'markdown');

void test('題目：詩名在最上面；兩句各是一段，用填空的樣子畫', async t => {
  const ui = await show(t, preview(POEM, false));
  assert.equal(ui.text(ui.find('ec-couplet-title')[0]), '鳥鳴澗');
  const lines = ui.find('ec-couplet')[0];
  assert.deepEqual(markdowns(lines).map(each => [each.props.text, each.props.mode, each.props.revealed, each.props.className]), [
    ['人閒桂花落，', 'cloze', false, 'ec-couplet-line'],
    ['==夜靜春山空==。', 'cloze', false, 'ec-couplet-line'],
  ]);
  assert.deepEqual(ui.find('ec-answer'), [], '翻面前沒有答案區');
});

void test('翻面：兩句照樣是同一個題目的大小，填回去；記憶錨點一行一列、只有一個燈泡、不是清單', async t => {
  const ui = await show(t, preview(POEM, true));
  assert.deepEqual(markdowns(ui.find('ec-couplet')[0]).map(each => each.props.revealed), [true, true]);
  const anchor = ui.find('is-anchor');
  assert.equal(anchor.length, 1);
  assert.equal(ui.find('ec-bulb').length, 1);
  const rows = all(anchor[0]).filter(each => typeof each.props.className === 'string' && each.props.className.split(' ').includes('ec-couplet-note'));
  assert.deepEqual(rows.map(row => markdowns(row).map(each => each.props.text)), [['人心清閒，桂花悄悄飄落；'], ['夜晚寂靜，春山顯得空曠。'], ['兩句都在寫靜。']]);
  assert.ok(!markdowns(anchor[0]).some(each => String(each.props.text).includes('- ')), '沒有清單符號');
  const other = ui.find('ec-ex-item').filter(item => !String(item.props.className).includes('is-anchor'));
  assert.equal(other.length, 1, '其他背面補充照舊');
});

void test('沒有小標題時不畫詩名；不是接句卡的填空照舊', async t => {
  const bare = await show(t, preview(POEM.replace('### 鳥鳴澗\n', ''), false));
  assert.deepEqual(bare.find('ec-couplet-title'), []);
  assert.equal(bare.find('ec-couplet').length, 1);
  const plain = await show(t, preview('---\n科目: 國語\n---\n- 一般 填空 ^b3pmab\n    - 人閒桂花落，==夜靜春山空==。\n', false));
  assert.deepEqual(plain.find('ec-couplet'), []);
  assert.deepEqual(plain.find('ec-couplet-title'), []);
});
