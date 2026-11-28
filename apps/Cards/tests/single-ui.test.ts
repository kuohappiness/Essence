import test from 'node:test';
import type { TestContext } from 'node:test';
import assert from 'node:assert/strict';
import type { App } from 'obsidian';
import { encodeEntry } from '../src/core/study/index.ts';
import { RATE_DELAY } from '../src/review/index.ts';
import type { Session } from '../src/review/index.ts';
import { check, pick, setup, skip, stage, tap, view } from './helpers/pick-session.ts';
import type { Harness } from './helpers/pick-session.ts';
import { renderReview, type ReviewUi } from './helpers/review-ui.ts';

// 單選與配對的作答、紀錄與畫面（tasks/matching-single-choice.md §5、〈驗收〉）：計分與紀錄沿用點選填空；預期值手寫。
const P = 'Essence Cards/社會/海岸.md';
const PHONE = 'Essence Cards/紀錄/2026-10 iPhone-test.jsonl';
const OPTIONS = '    - 選項：北部、東部、西部、南部';
const COASTS = `---
科目: 社會
---
- 能認出西部的海岸 ^west00
    - 海岸平直，有沙灘和潟湖，是哪一部的海岸？ :: 西部
        - 詳解：西部是平原，河流帶來沙
    - 記憶錨點：西部平、沙多
${OPTIONS}
- 能認出東部的海岸 ^east00
    - 山緊靠著海，海岸陡直，是哪一部的海岸？ :: 東部
${OPTIONS}
    - 例句：清水斷崖
- 能認出北部的海岸 ^north0
    - 臺灣的＿＿海岸岬灣交錯 :: 北部
${OPTIONS}
- 能認出南部的海岸 ^south0
    - 有珊瑚礁的是哪一部的海岸？ :: 南部
${OPTIONS}
`;
const ANSWER: Record<string, string> = { west00: '西部', east00: '東部', north0: '北部', south0: '南部' };
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
const ltAt = (s: Session, index: number): string => view(s).card.blanks[index].lt;
/** 照每一格的目標填：給字就點那個字、null 是按沒印象。 */
function fillBy(h: Harness, s: Session, choose: (lt: string) => string | null): void {
  for (let index = 0; index < view(s).card.blanks.length; index++) {
    s.act({ kind: 'row', index });
    const key = choose(ltAt(s, index));
    if (key === null) skip(h, s);
    else tap(h, s, key);
  }
}
const lineOf = (h: Harness, lt: string): Record<string, unknown> => {
  const line = h.log().find(each => each.lt === lt);
  assert.ok(line, lt);
  return line;
};
const shape = (line: Record<string, unknown>): Record<string, unknown> => Object.fromEntries(Object.entries(line).filter(([key]) => ['lt', 'r', 'pick', 'retry'].includes(key)));

void test('全對：每個目標一行、pick 是那一格選的字、沒有 retry 與 also；第二行起 with 是第一行的 t', async t => {
  const h = await setup(t, { [P]: COASTS });
  const s = await h.open({ subject: '社會' });
  assert.equal(view(s).card.blanks.length, 4);
  fillBy(h, s, lt => ANSWER[lt]);
  check(h, s);
  assert.deepEqual([stage(s), view(s).allowed], ['result', ['good', 'easy']]);
  h.clock.now += RATE_DELAY;
  assert.equal(s.rate('good'), true);
  await h.state.flush();
  const lines = h.log();
  assert.deepEqual(lines.map(shape).sort((a, b) => String(a.lt).localeCompare(String(b.lt))), [
    { lt: 'east00', r: 'good', pick: '東部' },
    { lt: 'north0', r: 'good', pick: '北部' },
    { lt: 'south0', r: 'good', pick: '南部' },
    { lt: 'west00', r: 'good', pick: '西部' },
  ]);
  assert.equal(lines[0].with, undefined);
  for (const line of lines.slice(1)) assert.equal(line.with, lines[0].t);
  for (const line of lines) assert.equal(Object.hasOwn(line, 'also'), false);
});

void test('再選對、再選也錯、第一次按沒印象：near／miss 各照點選填空記', async t => {
  const h = await setup(t, { [P]: COASTS });
  const s = await h.open({ subject: '社會' });
  fillBy(h, s, lt => lt === 'west00' ? '西部' : lt === 'east00' ? '北部' : lt === 'north0' ? '南部' : null);
  check(h, s);
  assert.equal(stage(s), 'retry');
  // 再選：東部選對、北部又選錯（剛才選的字不能按）。
  for (let index = 0; index < 4; index++) {
    const lt = ltAt(s, index);
    if (pick(s).cells[index].state !== 'retry') continue;
    s.act({ kind: 'row', index });
    tap(h, s, lt === 'east00' ? '東部' : '西部');
  }
  if (stage(s) === 'retry') check(h, s);
  assert.equal(stage(s), 'result');
  h.clock.now += RATE_DELAY;
  assert.equal(s.commit(), true);
  await h.state.flush();
  assert.deepEqual(shape(lineOf(h, 'west00')), { lt: 'west00', r: 'good', pick: '西部' });
  assert.deepEqual(shape(lineOf(h, 'east00')), { lt: 'east00', r: 'near', pick: '北部', retry: 'right' });
  assert.deepEqual(shape(lineOf(h, 'north0')), { lt: 'north0', r: 'miss', pick: '南部', retry: 'wrong' });
  assert.deepEqual(shape(lineOf(h, 'south0')), { lt: 'south0', r: 'miss', pick: null });
});

void test('沒到期的格各記一行；目標和選項一樣多時最後一格靠刪去法也照記住了', async t => {
  const before = ['east00', 'north0', 'south0'].map((lt, i) => encodeEntry(`2026-10-23T19:00:00.00${String(i)}+08:00`, { lt, r: 'good', v: 'x', pick: ANSWER[lt] }));
  const h = await setup(t, { [P]: COASTS, [PHONE]: before.join('\n') + '\n' });
  const s = await h.open({ subject: '社會' });
  assert.deepEqual(view(s).card.blanks.map(blank => blank.lt).sort(), ['east00', 'north0', 'south0', 'west00']);
  fillBy(h, s, lt => ANSWER[lt]);
  check(h, s);
  h.clock.now += RATE_DELAY;
  assert.equal(s.rate('good'), true);
  await h.state.flush();
  assert.deepEqual(h.log().map(line => line.lt).sort(), ['east00', 'north0', 'south0', 'west00']);
  assert.ok(h.log().every(line => line.r === 'good'));
});

void test('兩列同一個答案：兩個目標各一行；寫法不同的同一組照選中的寫法判得對', async t => {
  const text = `---\n科目: 社會\n---\n- 能認出西部的海岸 ^west00\n    - 海岸平直的是哪一部？ :: 西部\n${OPTIONS}\n- 能認出西部的平原 ^west01\n    - 嘉南平原在哪一部？ :: **西部**\n    - 選項：南部、**西部**、東部、北部\n`;
  const h = await setup(t, { [P]: text });
  const s = await h.open({ subject: '社會' });
  assert.deepEqual(view(s).card.blanks.map(blank => blank.answer), ['西部', '西部']);
  fillBy(h, s, () => '西部');
  check(h, s);
  assert.deepEqual(pick(s).cells.map(cell => cell.state), ['right', 'right']);
  h.clock.now += RATE_DELAY;
  assert.equal(s.rate('good'), true);
  await h.state.flush();
  assert.deepEqual(h.log().map(shape).sort((a, b) => String(a.lt).localeCompare(String(b.lt))), [{ lt: 'west00', r: 'good', pick: '西部' }, { lt: 'west01', r: 'good', pick: '西部' }]);
});

const markdownOf = (ui: ReviewUi, className: string): string[][] => ui.find(className).map(each => each.children.flatMap(child => typeof child === 'string' || child.type !== 'markdown' ? [] : [String(child.props.text)]));

void test('畫面：不印標題；題幹沒有空格時最後補 ＿＿，有空格的照原文；字鍵一排 4 個', async t => {
  const h = await setup(t, { [P]: COASTS });
  const s = await h.open({ subject: '社會' });
  const ui = await show(t, s);
  assert.deepEqual(ui.find('ec-pick-title'), []);
  const questions = new Map(view(s).card.blanks.map((blank, index) => [blank.lt, markdownOf(ui, 'ec-pick-text')[index][0]]));
  assert.equal(questions.get('west00'), '海岸平直，有沙灘和潟湖，是哪一部的海岸？＿＿');
  assert.equal(questions.get('north0'), '臺灣的＿＿海岸岬灣交錯');
  assert.equal(ui.find('ec-pick-keys')[0].props.style?.['--ec-pick-columns' as keyof object], '4');
});

void test('畫面：對答案後每列接自己的記憶錨點、詳解與其他補充，不顯示選項行，沒有整組的對照', async t => {
  const h = await setup(t, { [P]: COASTS });
  const s = await h.open({ subject: '社會' });
  const ui = await show(t, s);
  fillBy(h, s, lt => ANSWER[lt]);
  check(h, s);
  await ui.settle();
  assert.deepEqual(ui.find('ec-pick-compare'), []);
  const backs = ui.find('ec-single-back');
  const order = view(s).card.blanks.map(blank => blank.lt).filter(lt => lt === 'west00' || lt === 'east00');
  const texts = markdownOf(ui, 'ec-ex-row');
  assert.equal(backs.length, 2);
  const expected: Record<string, string[][]> = { west00: [['西部平、沙多'], ['西部是平原，河流帶來沙']], east00: [['清水斷崖']] };
  assert.deepEqual(texts, order.flatMap(lt => expected[lt]));
  assert.ok(ui.find('ec-ex-label').every(each => !ui.text(each).startsWith('選項')));
});

void test('字鍵：最長的選項放不下一行時一排少放一個、排得平均（4 個排成 2＋2）', async t => {
  const text = `---\n科目: 社會\n---\n- 能說出北部海岸的地形 ^rock00\n    - 北部的海岸是哪一種？ :: 岩岸\n    - 選項：岩岸、沙岸、斷層海岸、珊瑚礁海岸\n`;
  const h = await setup(t, { [P]: text });
  const ui = await show(t, await h.open({ subject: '社會' }));
  assert.equal(ui.find('ec-pick-keys')[0].props.style?.['--ec-pick-columns' as keyof object], '2');
});
