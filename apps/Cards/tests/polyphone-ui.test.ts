import test from 'node:test';
import type { TestContext } from 'node:test';
import assert from 'node:assert/strict';
import type { App } from 'obsidian';
import { parseDeck } from '../src/core/deck/index.ts';
import { createPreview, RATE_DELAY } from '../src/review/index.ts';
import type { Session } from '../src/review/index.ts';
import { answers, check, fill, keysOf, pick, setup, stage, tap, view, WRONG } from './helpers/pick-session.ts';
import { renderReview, type ReviewUi } from './helpers/review-ui.ts';

// 多音字的作答、對照與紀錄（tasks/polyphone-pick.md §4）：計分與紀錄沿用點選填空，標題、對照與對不到的錨點是這次加的。預期值手算。
const P = 'Essence Cards/國語/第3課.md';
const PROPS = '---\n科目: 國語\n---\n';
const SENTENCES = [
  '    - 他長（＿＿）得比哥哥高。 :: ㄓㄤˇ',
  '    - 小樹苗慢慢長（＿＿）大了。 :: ㄓㄤˇ',
  '    - 這條路很長（＿＿）。 :: ㄔㄤˊ',
  '    - 夏天的白天比較長（＿＿）。 :: ㄔㄤˊ',
].join('\n');
const LONG = `${PROPS}- 長（ㄓㄤˇ、ㄔㄤˊ） 讀音 ^k3m9qa
    - 記憶錨點：
        - ㄓㄤˇ：長大、帶頭的人：成長、班長
        - ㄔㄤˊ：距離或時間久：長短、很長
${SENTENCES}
`;
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
const preview = (text: string): Session => {
  const session = createPreview({ path: P, deck: parseDeck(text), reveal: true });
  assert.ok(session);
  return session;
};
const markdownOf = (ui: ReviewUi, className: string): string[][] => ui.find(className).map(each => each.children.flatMap(child => typeof child === 'string' || child.type !== 'markdown' ? [] : [String(child.props.text)]));

void test('標題是「讀音：長」，不列讀音；三格；字鍵是兩個讀音', async t => {
  const ui = await show(t, preview(LONG));
  assert.equal(ui.text(ui.find('ec-pick-title')[0]), '讀音：長');
  assert.equal(ui.find('ec-pick-row').length, 3);
  assert.deepEqual(ui.find('ec-pick-slot').length, 3);
});

void test('對照：每個讀音一行，考到的照畫面順序排前面；第一個全形冒號前面對讀音，後面照最後一個冒號分說明與常用詞', async t => {
  const h = await setup(t, { [P]: LONG });
  const s = await h.open({ subject: '國語' });
  const ui = await show(t, s);
  assert.deepEqual([...answers(s)].sort(), ['ㄓㄤˇ', 'ㄓㄤˇ', 'ㄔㄤˊ'].sort());
  fill(h, s, answer => answer);
  check(h, s);
  await ui.settle();
  const order = [...new Set(answers(s))];
  assert.deepEqual(ui.find('ec-cmp-ch').map(each => ui.text(each)), order);
  const WHY: Record<string, string> = { ㄓㄤˇ: '長大、帶頭的人', ㄔㄤˊ: '距離或時間久' };
  const WORDS: Record<string, string> = { ㄓㄤˇ: '成長、班長', ㄔㄤˊ: '長短、很長' };
  assert.deepEqual(markdownOf(ui, 'ec-cmp-why'), order.map(reading => [WHY[reading]]));
  assert.deepEqual(ui.find('ec-cmp-words').map(each => ui.text(each)), order.map(reading => WORDS[reading]));
  assert.deepEqual(ui.find('ec-cmp-line'), [], '都對得到，沒有接在後面的');
});

void test('對照不丟字：同一行的錨點、同一讀音的第二行、未知讀音、半形冒號照原序接在後面；沒有子項目的讀音只顯示讀音', async t => {
  const text = `${PROPS}- 長（ㄓㄤˇ、ㄔㄤˊ） 讀音 ^k3m9qa
    - 記憶錨點：先想是不是變大
        - ㄓㄤˇ：長大：成長
        - ㄓㄤˇ：第二行
        - ㄔㄤ˙：未知的讀音
        - ㄔㄤˊ:半形冒號
${SENTENCES}
`;
  const ui = await show(t, preview(text));
  const rows = ui.find('ec-cmp-ch').map(each => ui.text(each));
  assert.deepEqual([...rows].sort(), ['ㄓㄤˇ', 'ㄔㄤˊ'].sort());
  assert.deepEqual(markdownOf(ui, 'ec-cmp-why'), rows.map(reading => reading === 'ㄓㄤˇ' ? ['長大'] : []));
  assert.deepEqual(markdownOf(ui, 'ec-cmp-line'), [['先想是不是變大'], ['ㄓㄤˇ：第二行'], ['ㄔㄤ˙：未知的讀音'], ['ㄔㄤˊ:半形冒號']]);
});

void test('句子底下的詳解不顯示', async t => {
  const text = LONG.replace('    - 他長（＿＿）得比哥哥高。 :: ㄓㄤˇ', '    - 他長（＿＿）得比哥哥高。 :: ㄓㄤˇ\n        - 詳解：長得高是身體長大');
  const ui = await show(t, preview(text));
  assert.ok(!ui.text(ui.find('ec-body')[0]).includes('身體長大'));
});

void test('紀錄：一行，最差的格在最上層，其他格放 also；沒有 with、cell；v 不重複', async t => {
  const h = await setup(t, { [P]: LONG });
  const s = await h.open({ subject: '國語' });
  const wrong = WRONG(answers(s)[1], keysOf(s));
  fill(h, s, (answer, index) => index === 1 ? wrong : answer);
  check(h, s);
  assert.equal(stage(s), 'retry');
  tap(h, s, answers(s)[1]);
  assert.equal(stage(s), 'result');
  const prints = view(s).card.blanks.map(blank => blank.prompt.fingerprint);
  h.clock.now += RATE_DELAY;
  assert.equal(s.commit(), true);
  await h.state.flush();
  const log = h.log();
  assert.equal(log.length, 1);
  const [line] = log;
  assert.deepEqual([line.lt, line.r, line.v, line.pick, line.retry], ['k3m9qa', 'near', prints[1], wrong, 'right']);
  assert.deepEqual(line.also, [{ v: prints[0], r: 'good', pick: answers(s)[0] }, { v: prints[2], r: 'good', pick: answers(s)[2] }]);
  assert.ok(!('with' in line) && !('cell' in line));
  assert.equal(new Set([line.v, ...(line.also as { v: string }[]).map(each => each.v)]).size, 3);
});

void test('紀錄：第一次按沒印象是 pick: null；全對可以按太簡單', async t => {
  const h = await setup(t, { [P]: LONG });
  const s = await h.open({ subject: '國語' });
  fill(h, s, (answer, index) => index === 2 ? null : answer);
  check(h, s);
  assert.equal(pick(s).cells[2].state, 'miss');
  h.clock.now += RATE_DELAY;
  assert.equal(s.commit(), true);
  await h.state.flush();
  const [line] = h.log();
  assert.deepEqual([line.r, line.pick], ['miss', null]);
  const right = await setup(t, { [P]: LONG });
  const c = await right.open({ subject: '國語' });
  fill(right, c, answer => answer);
  check(right, c);
  assert.deepEqual(view(c).allowed, ['good', 'easy']);
});
