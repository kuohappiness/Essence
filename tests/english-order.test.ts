import test from 'node:test';
import assert from 'node:assert/strict';
import { parseDeck } from '../src/core/deck/index.ts';
import { questionType } from '../src/core/study/index.ts';
import { RATE_DELAY } from '../src/review/index.ts';
import { check, pick, setup, stage, tap, texts, view } from './helpers/pick-session.ts';

// 英文的句子排序卡（D-193 第 8 點、tasks/english-typed-order.md §4）。預期值照任務說明的邊界例子手寫。

const sentenceOf = (body: string) => parseDeck(`- 間接問句 排序\n${body}`).targets[0];
const cellsOf = (question: string) => sentenceOf(`    - ${question}\n`).sentence?.prompts[0];

void test('句子排序：每一題各自的詞塊；結尾的標點從鍵拿掉、接在後面', () => {
  const target = sentenceOf('    - 你知道公車站在哪裡嗎？Do you know ==where== ==the bus stop== ==is==?\n    - 我不知道他住在哪裡。I don\'t know ==where== ==he== ==lives.==\n');
  assert.equal(target.order, undefined, '不是全詩');
  assert.equal(target.sentence?.title, '間接問句');
  assert.deepEqual(target.sentence?.prompts, [
    { head: '你知道公車站在哪裡嗎？Do you know ', words: ['where', 'the bus stop', 'is'], tails: [' ', ' ', '?'], starts: [false, false, false] },
    { head: '我不知道他住在哪裡。I don\'t know ', words: ['where', 'he', 'lives'], tails: [' ', ' ', '.'], starts: [false, false, false] },
  ]);
});

void test('句首的詞塊改小寫：中文後面、句尾標點後面、冒號後面、整句開頭；I、全大寫不改', () => {
  assert.deepEqual(cellsOf('他住在哪裡？==Where== ==does== ==he== ==live==?')?.words, ['where', 'does', 'he', 'live']);
  assert.deepEqual(cellsOf('他住在哪裡？==Where== ==does== ==he== ==live==?')?.starts, [true, false, false, false]);
  assert.deepEqual(cellsOf('==Where== ==does== ==he== ==live==?')?.words, ['where', 'does', 'he', 'live']);
  assert.deepEqual(cellsOf('It rains. ==Where== ==do== ==you== ==go==?')?.words, ['where', 'do', 'you', 'go']);
  assert.deepEqual(cellsOf('B: ==Where== ==is== ==it==?')?.words, ['where', 'is', 'it']);
  assert.deepEqual(cellsOf('我沒有生氣。==I== ==am== ==not== angry.')?.words, ['I', 'am', 'not']);
  assert.deepEqual(cellsOf("我很好。==I'm== ==fine== today.")?.words, ["I'm", 'fine']);
  assert.deepEqual(cellsOf('==TV== ==is== ==fun==.')?.words, ['TV', 'is', 'fun']);
  assert.deepEqual(cellsOf('「==Where== ==is== ==it==?」')?.words, ['where', 'is', 'it']);
});

void test('不是句子排序：只有一格、問答題、拿掉標點後是空的、空格裡沒有英文的好幾題', () => {
  assert.equal(sentenceOf('    - I know ==where== he lives.\n').sentence, undefined);
  assert.equal(sentenceOf('    - 請問他住哪裡？ :: Where does he live?\n').sentence, undefined);
  assert.equal(sentenceOf('    - I know ==where== ==?==\n').sentence, undefined);
  const poem = parseDeck('- 鳥鳴澗 排序\n    - ==人閒桂花落==，==夜靜春山空==。\n    - ==月出驚山鳥==，==時鳴春澗中==。\n').targets[0];
  assert.deepEqual([poem.sentence, poem.order], [undefined, undefined]);
  const single = parseDeck('- 鳥鳴澗 排序\n    - ==人閒桂花落==，==夜靜春山空==。\n').targets[0];
  assert.equal(single.sentence, undefined);
  assert.equal(single.order?.title, '鳥鳴澗', '只有一題、空格是中文的是全詩');
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
