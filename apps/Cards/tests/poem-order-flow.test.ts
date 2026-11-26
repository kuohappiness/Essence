import test from 'node:test';
import assert from 'node:assert/strict';
import { questionType } from '../src/core/study/index.ts';
import { RATE_DELAY } from '../src/review/index.ts';
import type { Session } from '../src/review/index.ts';
import { check, pick, setup, skip, stage, tap, texts, view } from './helpers/pick-session.ts';
import type { Harness } from './helpers/pick-session.ts';

// 全詩順序卡的作答（D-187 第 4、5 點、D-204 第 3 點）：createSession 接真的 createState。預期值照決定手寫。

const P = 'Essence Cards/國語/古詩.md';
const LINES = ['人閒桂花落', '夜靜春山空', '月出驚山鳥', '時鳴春澗中'];
const POEM = `---
科目: 國語
---
### 鳥鳴澗
- 鳥鳴澗 全詩 排序 ^b3pmae
    - ==人閒桂花落==，==夜靜春山空==。==月出驚山鳥==，==時鳴春澗中==。
    - 記憶錨點：
        - 人心清閒，桂花悄悄飄落；
        - 夜晚寂靜，春山顯得空曠。
        - 月亮升起，驚動了山裡的鳥；
        - 牠們不時在春天的山澗中鳴叫。
        - 全詩由靜寫到動。
`;
const open = async (t: Parameters<typeof setup>[0], text = POEM): Promise<{ h: Harness; s: Session }> => {
  const h = await setup(t, { [P]: text });
  return { h, s: await h.open({ subject: '國語' }) };
};
const used = (s: Session): string[] => (view(s).card.group?.keys ?? []).filter((_, i) => pick(s).used[i]);

void test('全詩順序卡是點選填空：一個目標四格，每格是一句，字鍵是打亂的四句，詩名是標題', async t => {
  const { s } = await open(t);
  const { card } = view(s);
  assert.equal(questionType(card), 'order');
  assert.deepEqual(card.blanks.map(blank => [blank.lt, blank.answer, blank.cell]), [['b3pmae', LINES[0], 0], ['b3pmae', LINES[1], 1], ['b3pmae', LINES[2], 2], ['b3pmae', LINES[3], 3]]);
  const group = card.group;
  assert.ok(group);
  assert.equal(group.title, '鳥鳴澗');
  assert.deepEqual(group.order, { head: '', tails: ['，', '。', '，', '。'] });
  assert.deepEqual([...group.keys].sort(), [...LINES].sort());
  assert.notDeepEqual(group.keys, LINES, '字鍵不照詩的順序');
  assert.deepEqual(group.rows, [], '沒有比較的對照');
  assert.deepEqual(pick(s).used, [false, false, false, false]);
});

void test('放在某一格的句子字鍵變淡；點淡掉的字鍵是交換，這格空著就搬過來', async t => {
  const { h, s } = await open(t);
  tap(h, s, LINES[1]);
  assert.deepEqual([texts(s), pick(s).cursor], [[LINES[1], '', '', ''], 1]);
  assert.deepEqual(used(s), [LINES[1]]);
  tap(h, s, LINES[1]);
  assert.deepEqual([texts(s), pick(s).cursor], [['', LINES[1], '', ''], 2], '搬到這一格，原來那格空出來；游標照常往後找空格');
  s.act({ kind: 'row', index: 0 });
  tap(h, s, LINES[0]);
  assert.equal(pick(s).cursor, 2);
  tap(h, s, LINES[3]);
  tap(h, s, LINES[2]);
  assert.deepEqual([texts(s), pick(s).cursor, pick(s).filled], [[LINES[0], LINES[1], LINES[3], LINES[2]], null, true]);
  assert.equal(used(s).length, 4);
  s.act({ kind: 'row', index: 2 });
  tap(h, s, LINES[2]);
  assert.deepEqual(texts(s), LINES, '兩格對調');
  assert.equal(pick(s).cursor, null);
});

void test('沒印象清掉這一格，字鍵恢復；同一個字鍵 0.3 秒內連點不算', async t => {
  const { h, s } = await open(t);
  tap(h, s, LINES[0]);
  s.act({ kind: 'row', index: 0 });
  skip(h, s);
  assert.deepEqual(texts(s), ['？', '', '', '']);
  assert.deepEqual(used(s), []);
  tap(h, s, LINES[1]);
  h.clock.now += 100;
  s.act({ kind: 'key', key: LINES[1] });
  assert.deepEqual(texts(s), ['？', LINES[1], '', ''], '連點沒有把它搬走');
});

void test('全對：一行紀錄，最上層是第 1 格，其他三格放 also，每格都寫格序與選的句子', async t => {
  const { h, s } = await open(t);
  const v = view(s).card.prompt.fingerprint;
  for (const line of LINES) tap(h, s, line);
  check(h, s);
  assert.deepEqual([stage(s), view(s).allowed, pick(s).committable], ['result', ['good', 'easy'], false]);
  h.clock.now += RATE_DELAY;
  assert.equal(s.rate('good'), true);
  await h.state.flush();
  assert.deepEqual(h.log().map(({ t: _, ...line }) => line), [{
    lt: 'b3pmae', r: 'good', v, cell: 1, pick: LINES[0],
    also: [2, 3, 4].map(cell => ({ v, r: 'good', pick: LINES[cell - 1], cell })),
  }]);
});

void test('排錯兩句：再選一次，排對的字鍵照樣淡、剛才選錯的不能點；取最差的一格，一樣差取前面那格', async t => {
  const { h, s } = await open(t);
  const v = view(s).card.prompt.fingerprint;
  for (const line of [LINES[0], LINES[1], LINES[3], LINES[2]]) tap(h, s, line);
  check(h, s);
  assert.deepEqual([stage(s), pick(s).cursor, pick(s).spent], ['retry', 2, LINES[3]]);
  assert.deepEqual(used(s).sort(), [LINES[0], LINES[1]].sort());
  tap(h, s, LINES[2]);
  assert.deepEqual([pick(s).cursor, pick(s).spent], [3, LINES[2]]);
  tap(h, s, LINES[0]);
  assert.equal(stage(s), 'result');
  assert.deepEqual(pick(s).cells.map(cell => cell.state), ['right', 'right', 'near', 'miss']);
  assert.deepEqual(texts(s), LINES, '結果是照順序的整首');
  h.clock.now += RATE_DELAY;
  assert.equal(s.commit(), true);
  await h.state.flush();
  assert.deepEqual(h.log().map(({ t: _, ...line }) => line), [{
    lt: 'b3pmae', r: 'miss', v, cell: 4, pick: LINES[2], retry: 'wrong',
    also: [{ v, r: 'good', pick: LINES[0], cell: 1 }, { v, r: 'good', pick: LINES[1], cell: 2 }, { v, r: 'near', pick: LINES[3], retry: 'right', cell: 3 }],
  }]);
});

void test('兩句文字相同：兩個字鍵，各放一格才都淡；填哪一格都算對', async t => {
  const text = POEM.replace('==夜靜春山空==', '==人閒桂花落==');
  const { h, s } = await open(t, text);
  assert.deepEqual(view(s).card.group?.keys.filter(key => key === LINES[0]).length, 2);
  tap(h, s, LINES[0]);
  assert.equal(used(s).length, 1);
  tap(h, s, LINES[0]);
  assert.deepEqual(texts(s), [LINES[0], LINES[0], '', ''], '還有沒放的同一句，就放進這一格，不搬');
  assert.equal(used(s).length, 2);
  tap(h, s, LINES[2]);
  tap(h, s, LINES[3]);
  check(h, s);
  assert.deepEqual(pick(s).cells.map(cell => cell.state), ['right', 'right', 'right', 'right']);
});

void test('兩句文字相同：字鍵照位置算，點淡掉的那個是搬它所在的那格；兩個不同的鍵 0.3 秒內連點都算（L2 R1）', async t => {
  const text = POEM.replace('==夜靜春山空==', '==人閒桂花落==');
  const { h, s } = await open(t, text);
  const keys = view(s).card.group?.keys ?? [];
  const [a, b] = keys.flatMap((key, i) => key === LINES[0] ? [i] : []);
  const at = (index: number): void => { h.clock.now += 400; s.act({ kind: 'key', key: keys[index], at: index }); };
  const faded = (): number[] => pick(s).used.flatMap((on, i) => on ? [i] : []);
  at(a);
  assert.deepEqual([texts(s), faded()], [[LINES[0], '', '', ''], [a]]);
  at(a);
  assert.deepEqual([texts(s), faded(), pick(s).cursor], [['', LINES[0], '', ''], [a], 2], '點淡掉的鍵：從它所在的那格搬過來，另一個同句的鍵不變淡');
  s.act({ kind: 'row', index: 0 });
  at(b);
  assert.deepEqual([texts(s), faded().sort()], [[LINES[0], LINES[0], '', ''], [a, b].sort()]);
  at(keys.indexOf(LINES[2]));
  at(keys.indexOf(LINES[3]));
  s.act({ kind: 'row', index: 3 });
  at(b);
  assert.deepEqual(texts(s), [LINES[3], LINES[0], LINES[2], LINES[0]], '和放著 b 的第 1 格交換');
  const fresh = await open(t, text);
  const keys2 = view(fresh.s).card.group?.keys ?? [];
  const [c, d] = keys2.flatMap((key, i) => key === LINES[0] ? [i] : []);
  fresh.h.clock.now += 400;
  fresh.s.act({ kind: 'key', key: LINES[0], at: c });
  fresh.h.clock.now += 100;
  fresh.s.act({ kind: 'key', key: LINES[0], at: d });
  assert.deepEqual(texts(fresh.s), [LINES[0], LINES[0], '', ''], '兩個不同的鍵不算連點');
  fresh.h.clock.now += 100;
  fresh.s.act({ kind: 'key', key: LINES[0], at: d });
  assert.deepEqual(texts(fresh.s), [LINES[0], LINES[0], '', ''], '同一個鍵 0.3 秒內連點不算');
});

void test('再選時點淡掉的同句鍵：已排對的格保留它的鍵，這一格換用另一個同句的鍵，兩個都淡（L2 R5）', async t => {
  const text = POEM.replace('==夜靜春山空==', '==人閒桂花落==');
  const { h, s } = await open(t, text);
  const keys = view(s).card.group?.keys ?? [];
  const [a, b] = keys.flatMap((key, i) => key === LINES[0] ? [i] : []);
  const at = (index: number): void => { h.clock.now += 400; s.act({ kind: 'key', key: keys[index], at: index }); };
  const faded = (): number[] => pick(s).used.flatMap((on, i) => on ? [i] : []);
  for (const index of [a, keys.indexOf(LINES[2]), b, keys.indexOf(LINES[3])]) at(index);
  check(h, s);
  assert.deepEqual([stage(s), pick(s).cursor], ['retry', 1]);
  at(a);
  assert.deepEqual([pick(s).cells.map(cell => cell.state), pick(s).cursor], [['right', 'near', 'retry', 'right'], 2]);
  assert.deepEqual(faded().sort(), [a, b, keys.indexOf(LINES[3])].sort(), '兩個同句的鍵都淡');
});
