import test from 'node:test';
import assert from 'node:assert/strict';
import { parseDeck } from '../src/core/deck/index.ts';
import { questionType } from '../src/core/study/index.ts';
import { RATE_DELAY } from '../src/review/index.ts';
import { check, pick, setup, stage, tap, texts, view } from './helpers/pick-session.ts';

// 英文的句子排序卡（D-193 第 8 點、tasks/english-typed-order.md §4）。預期值照任務說明的邊界例子手寫。

const english = (body: string) => parseDeck(`---\n科目: 英文\n---\n${body}`);
const sentenceOf = (body: string, name = '間接問句 排序') => english(`- ${name}\n${body}`).targets[0];
const cellsOf = (question: string) => sentenceOf(`    - ${question}\n`).sentence?.prompts[0];

void test('句子排序：每一題各自的詞塊；句末的標點從最後一格拿掉、接在後面', () => {
  const target = sentenceOf('    - 你知道公車站在哪裡嗎？Do you know ==where== ==the bus stop== ==is==?\n    - 我不知道他住在哪裡。I don\'t know ==where== ==he== ==lives.==\n');
  assert.equal(target.order, undefined, '不是全詩');
  assert.equal(target.sentence?.title, '間接問句');
  assert.deepEqual(target.sentence?.prompts, [
    { head: '你知道公車站在哪裡嗎？Do you know ', words: ['where', 'the bus stop', 'is'], tails: [' ', ' ', '?'], starts: [false, false, false] },
    { head: '我不知道他住在哪裡。I don\'t know ', words: ['where', 'he', 'lives'], tails: [' ', ' ', '.'], starts: [false, false, false] },
  ]);
});

void test('標點只拿句末的：後面還有字、只剩結束的引號、縮寫、中間的格', () => {
  assert.deepEqual(cellsOf('==I== ==live in== ==the U.S.==')?.words, ['I', 'live in', 'the U.S.'], '縮寫不拿');
  assert.deepEqual(cellsOf('「==where== ==is== ==it?==」')?.tails, [' ', ' ', '?」']);
  assert.deepEqual(cellsOf('==where== ==is== ==it?== I asked.')?.words, ['where', 'is', 'it?'], '後面還有字的不是句末');
  assert.deepEqual(cellsOf('==Yes,== ==I== ==do==.')?.words, ['Yes,', 'I', 'do'], '中間格的逗號不拿');
});

void test('句首那格：照原樣當鍵、不改小寫；只有第一格、前面沒有字或是中文與全形標點才標', () => {
  assert.deepEqual(cellsOf('他住在哪裡？==where== ==does== ==he== ==live==?')?.starts, [true, false, false, false]);
  assert.deepEqual(cellsOf('==where== ==does== ==he== ==live==?')?.starts, [true, false, false, false]);
  assert.deepEqual(cellsOf('「==where== ==is== ==it==?」')?.starts, [true, false, false]);
  assert.deepEqual(cellsOf('It rains. ==where== ==do== ==you== ==go==?')?.starts, [false, false, false, false], '英文句子中間不猜');
  assert.deepEqual(cellsOf('他住在哪裡？==Where== ==does== ==he== ==live==?')?.words, ['Where', 'does', 'he', 'live'], '作者寫大寫照原樣（AI 草稿另外提醒）');
  assert.deepEqual(cellsOf('我沒有生氣。==I== ==am== ==not== angry.')?.words, ['I', 'am', 'not']);
});

void test('不是句子排序：只有一格、問答題、拿掉標點後是空的、別科、沒寫科目、全詩', () => {
  assert.equal(sentenceOf('    - I know ==where== he lives.\n').sentence, undefined);
  assert.equal(sentenceOf('    - 請問他住哪裡？ :: Where does he live?\n').sentence, undefined);
  assert.equal(sentenceOf('    - I know ==where== ==?==\n').sentence, undefined);
  assert.equal(parseDeck('- 間接問句 排序\n    - I know ==where== ==he== ==lives==.\n').targets[0].sentence, undefined);
  assert.equal(parseDeck('---\n科目: 國文\n---\n- 間接問句 排序\n    - I know ==where== ==he== ==lives==.\n').targets[0].order?.title, '間接問句', '別科照全詩順序卡，和以前一樣');
  const poem = sentenceOf('    - ==Twinkle, twinkle==, ==little star==.\n', 'Twinkle 全詩 排序');
  assert.deepEqual([poem.sentence, poem.order?.title], [undefined, 'Twinkle'], '英文卡組裡寫了全詩是全詩順序卡');
  const chinese = sentenceOf('    - ==人閒桂花落==，==夜靜春山空==。\n', '鳥鳴澗 排序');
  assert.deepEqual([chinese.sentence?.title, chinese.order], ['鳥鳴澗', undefined], '英文卡組裡沒寫全詩的就是句子排序，空格是中文也一樣');
});

const P = 'Essence Cards/英文/L3 文法.md';
const DECK = `---
科目: 英文
---
- 代名詞的位置 排序 ^order1
    - 我把它看完了。I saw ==the== ==man== and ==the== ==dog==.
`;

void test('句子排序是點選填空：一個目標，這一題的每一格是一格，字鍵是打亂的詞塊', async t => {
  const h = await setup(t, { [P]: DECK });
  const s = await h.open({ subject: '英文' });
  const { card } = view(s);
  assert.equal(questionType(card), 'pick');
  assert.deepEqual(card.blanks.map(blank => [blank.lt, blank.answer, blank.cell]), [['order1', 'the', 0], ['order1', 'man', 1], ['order1', 'the', 2], ['order1', 'dog', 3]]);
  assert.deepEqual([...(card.group?.keys ?? [])].sort(), ['dog', 'man', 'the', 'the']);
  assert.notDeepEqual(card.group?.keys, ['the', 'man', 'the', 'dog'], '字鍵不照句子的順序');
  assert.deepEqual(card.group?.order, { head: '我把它看完了。I saw ', tails: [' ', ' and ', ' ', '.'], starts: [false, false, false, false] });
  assert.equal(view(s).english, true);
});

void test('文字相同的詞塊互換不算錯：兩個 the 用相反的鍵放，照樣全對', async t => {
  const h = await setup(t, { [P]: DECK });
  const s = await h.open({ subject: '英文' });
  const keys = view(s).card.group?.keys ?? [];
  const thes = keys.flatMap((key, i) => key === 'the' ? [i] : []);
  const at = (index: number): void => { h.clock.now += 400; s.act({ kind: 'key', key: keys[index], at: index }); };
  at(thes[1]);
  at(keys.indexOf('man'));
  at(thes[0]);
  at(keys.indexOf('dog'));
  assert.deepEqual(texts(s), ['the', 'man', 'the', 'dog']);
  check(h, s);
  assert.equal(stage(s), 'result');
  assert.deepEqual(pick(s).cells.map(cell => cell.state), ['right', 'right', 'right', 'right']);
  const v = view(s).card.prompt.fingerprint;
  h.clock.now += RATE_DELAY;
  assert.equal(s.rate('good'), true);
  await h.state.flush();
  assert.deepEqual(h.log().map(({ t: _, ...line }) => line), [{
    lt: 'order1', r: 'good', v, cell: 1, pick: 'the',
    also: [{ v, r: 'good', cell: 2, pick: 'man' }, { v, r: 'good', cell: 3, pick: 'the' }, { v, r: 'good', cell: 4, pick: 'dog' }],
  }]);
});

void test('排錯：照比較卡再選，取最差的一格', async t => {
  const h = await setup(t, { [P]: DECK });
  const s = await h.open({ subject: '英文' });
  for (const key of ['the', 'dog', 'the', 'man']) tap(h, s, key);
  check(h, s);
  assert.deepEqual([stage(s), pick(s).cursor], ['retry', 1]);
  tap(h, s, 'man');
  tap(h, s, 'dog');
  assert.equal(stage(s), 'result');
  assert.deepEqual(pick(s).cells.map(cell => cell.state), ['right', 'near', 'right', 'near']);
});

void test('詞塊裡的粗體、斜體記號拿掉（L2 R6）：鍵是看得到的字，和沒有格式的同一個字相同', () => {
  const cells = cellsOf('他去哪裡？==**where**== ==did== ==*he*== go?');
  assert.deepEqual(cells?.words, ['where', 'did', 'he']);
  assert.deepEqual(cells?.starts, [true, false, false]);
  assert.deepEqual(cellsOf('I saw ==**the**== ==man== and ==the== ==dog==.')?.words, ['the', 'man', 'the', 'dog']);
});

void test('詞塊只收純文字（L2 第二輪）：成對的格式拿掉；未成對的底線、連結、程式碼、字元參照，這一題不是句子排序', () => {
  assert.deepEqual(cellsOf('他去哪裡？==_where_== ==__did__== ==he== go?')?.words, ['where', 'did', 'he']);
  for (const question of ['Compare ==A_B== and ==AB==.', 'Compare ==R&amp;D== and ==R&D==.', 'Please ==[turn](turn.md)== ==it== off.', 'Type ==`ls`== ==now==.', 'Say ==a\\*== ==b==.']) {
    assert.equal(cellsOf(question), undefined, question);
  }
});

void test('句首照看得到的字判斷（L2 第二輪）：中文是連結的顯示文字時，第一格也是英文句子的開頭', () => {
  assert.deepEqual(cellsOf('[我累了。](notes.md)==i== ==am== ==tired==.')?.starts, [true, false, false]);
  assert.deepEqual(cellsOf('[[我的筆記|我累了。]]==i== ==am== ==tired==.')?.starts, [true, false, false]);
  assert.deepEqual(cellsOf('[Tired](notes.md) ==i== ==am== ==tired==.')?.starts, [false, false, false]);
});
