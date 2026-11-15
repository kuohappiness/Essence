import test from 'node:test';
import type { TestContext } from 'node:test';
import assert from 'node:assert/strict';
import type { App } from 'obsidian';
import { parseDeck } from '../src/core/deck/index.ts';
import { createPreview, RATE_DELAY } from '../src/review/index.ts';
import type { Session } from '../src/review/index.ts';
import { setup } from './helpers/pick-session.ts';
import { renderReview, type ReviewUi } from './helpers/review-ui.ts';

// 全詩順序卡的畫面（D-204）：用 hook 替身跑真的 Review。版面、顏色在 Obsidian 用開發命令看。
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
const LINES = ['人閒桂花落', '夜靜春山空', '月出驚山鳥', '時鳴春澗中'];
const NOTES = ['人心清閒，桂花悄悄飄落；', '夜晚寂靜，春山顯得空曠。', '月亮升起，驚動了山裡的鳥；', '牠們不時在春天的山澗中鳴叫。'];
const poem = (notes: readonly string[]): string => `---
科目: 國語
---
- 鳥鳴澗 全詩 排序 ^b3pmae
    - ==人閒桂花落==，==夜靜春山空==。==月出驚山鳥==，==時鳴春澗中==。
    - 記憶錨點：
${notes.map(note => `        - ${note}\n`).join('')}`;
const preview = (text: string, reveal = false): Session => {
  const session = createPreview({ path: P, deck: parseDeck(text), reveal });
  assert.ok(session);
  return session;
};
const keyTexts = (ui: ReviewUi): string[] => ui.find('ec-pick-key').map(key => ui.text(key));
type Host = ReturnType<ReviewUi['find']>[number];
const all = (node: Host): Host[] => [node, ...node.children.flatMap(child => typeof child === 'string' ? [] : all(child))];
/** node 底下 className 含這個 class 的元素。 */
const within = (node: Host, className: string): Host[] => all(node).filter(each => typeof each.props.className === 'string' && each.props.className.split(' ').includes(className));
/** node 底下每個 Markdown 的原文。 */
const markdown = (node: Host): string[] => all(node).filter(each => each.type === 'markdown').map(each => String(each.props.text));
/** 對答案：照詩的順序點，再按對答案。 */
async function answered(t: TestContext, text: string): Promise<ReviewUi> {
  const h = await setup(t, { [P]: text });
  const s = await h.open({ subject: '國語' });
  const ui = await show(t, s);
  for (const line of LINES) { h.clock.now += 400; ui.click(ui.find('ec-pick-key')[keyTexts(ui).indexOf(line)]); }
  h.clock.now += 400;
  ui.click(ui.find('ec-pick-check')[0]);
  h.clock.now += RATE_DELAY;
  return ui;
}

void test('題目：詩名是標題；一句一列，空格後面接原本的標點；第二聯起多一點空隙；沒有對照', async t => {
  const ui = await show(t, preview(poem([...NOTES, '全詩由靜寫到動。'])));
  assert.equal(ui.text(ui.find('ec-pick-title')[0]), '鳥鳴澗');
  assert.equal(ui.find('ec-pick')[0].props.className, 'ec-card ec-pick is-order');
  const rows = ui.find('ec-pick-row');
  assert.deepEqual(rows.map(row => markdown(row)), [['＿＿，'], ['＿＿。'], ['＿＿，'], ['＿＿。']]);
  assert.deepEqual(rows.map(row => String(row.props.className).includes('is-pair')), [false, false, true, false]);
  assert.deepEqual(ui.find('ec-cmp'), []);
});

void test('字鍵：整句、兩個一排；放在某一格的變淡但還能點', async t => {
  const ui = await show(t, preview(poem(NOTES)));
  const keys = ui.find('ec-pick-keys')[0];
  assert.equal(keys.props.className, 'ec-pick-keys is-lines');
  assert.equal((keys.props.style as Record<string, string>)['--ec-pick-columns'], '2');
  assert.deepEqual([...keyTexts(ui)].sort(), [...LINES].sort());
  const at = keyTexts(ui).indexOf(LINES[0]);
  ui.click(ui.find('ec-pick-key')[at]);
  const after = ui.find('ec-pick-key');
  assert.deepEqual(after.map(key => String(key.props.className).includes('is-used')), after.map((_, i) => i === at));
  assert.ok(after.every(key => key.props.disabled !== true), '淡掉的鍵不是不能按');
});

void test('對答案後：句子照順序，每句底下緊接它的解釋，全詩意境放最後；句子不另外上色', async t => {
  const ui = await answered(t, poem([...NOTES, '全詩由靜寫到動。']));
  assert.deepEqual(ui.find('ec-pick-slot').map(slot => ui.text(slot)), LINES);
  assert.deepEqual(ui.find('ec-pick-row').map(row => within(row, 'ec-order-note').flatMap(markdown)), NOTES.map(note => [note]));
  assert.deepEqual(ui.find('ec-order-rest').flatMap(markdown), ['全詩由靜寫到動。']);
  assert.deepEqual(ui.find('ec-pick-mark').map(mark => ui.text(mark)), ['✓', '✓', '✓', '✓']);
});

void test('解釋比句子少：對不起來，放在詩句之後每行一列；沒有解釋就什麼都不放', async t => {
  const fewer = await answered(t, poem(NOTES.slice(0, 3)));
  assert.deepEqual(fewer.find('ec-order-note'), []);
  assert.deepEqual(fewer.find('ec-order-rest').flatMap(markdown), NOTES.slice(0, 3));
  const none = await answered(t, poem([]).replace(/    - 記憶錨點：\n/, ''));
  assert.deepEqual([none.find('ec-order-note'), none.find('ec-order-rest')], [[], []]);
});

void test('全詩意境寫成「全詩：」：不算進句子的解釋，一律放最後；少一句時其他解釋照樣放在詩句之後（L2 R2）', async t => {
  const whole = '全詩：由靜寫到動。';
  const full = await answered(t, poem([...NOTES, whole]));
  assert.deepEqual(full.find('ec-pick-row').map(row => within(row, 'ec-order-note').flatMap(markdown)), NOTES.map(note => [note]));
  assert.deepEqual(full.find('ec-order-rest').flatMap(markdown), [whole]);
  const missing = await answered(t, poem([NOTES[0], NOTES[2], NOTES[3], whole]));
  assert.deepEqual(missing.find('ec-order-note'), [], '少一句語譯、加上意境剛好四行，也不貼到句子底下');
  assert.deepEqual(missing.find('ec-order-rest').flatMap(markdown), [NOTES[0], NOTES[2], NOTES[3], whole]);
});
