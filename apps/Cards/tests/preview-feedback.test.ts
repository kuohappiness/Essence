import test from 'node:test';
import assert from 'node:assert/strict';
import { parseDeck } from '../src/core/deck/index.ts';
import type { Card } from '../src/core/study/index.ts';
import { createPreview } from '../src/review/index.ts';
import type { CardView, Feedback, FeedbackSink, SaveResult, Session } from '../src/review/index.ts';

// 預覽的單張卡回饋（D-246、tasks/card-feedback.md §3、§6）：Session 這一層的狀態與什麼時候存。紀錄的寫法另外測。

const PATH = 'Essence Cards/自然.md';
const PROPS = '---\n年級學期: 國二上\n科目: 自然\n單元: 2-1 水溶液\n狀態: 草稿\n---\n';
const DECK = PROPS + '- 目標一 ^a\n    - 第一題 :: 一\n    - 第二題 :: 二\n- 還沒補 ID\n    - 第三題 :: 三\n';
const TWO = PROPS + `- borrow（borrow、lend） 比較 ^borrow
    - Can I ＿＿ your pen? :: borrow
- lend（borrow、lend） 比較 ^lendxx
    - Can you ＿＿ me a pen? :: lend
`;

interface Saved { card: Card; feedback: Feedback }
/** 記下每一次存；結果照 results 的順序給，沒有就是 saved。hold 時先不回，release 才回。 */
function sink(results: (SaveResult | 'throw' | 'reject')[] = []) {
  const saved: Saved[] = [];
  const waiting: (() => void)[] = [];
  let hold = false;
  const value: FeedbackSink = {
    save(card, feedback) {
      saved.push({ card, feedback });
      const result = results.shift() ?? 'saved';
      if (result === 'throw') throw Error('寫不進去');
      if (result === 'reject') return Promise.reject(Error('寫不進去'));
      if (!hold) return Promise.resolve(result);
      return new Promise<SaveResult>(resolve => { waiting.push(() => { resolve(result); }); });
    },
  };
  return {
    value, saved,
    hold() { hold = true; },
    /** 照 order 的順序回（0 是第一個還沒回的）。 */
    release(order?: number[]) {
      const all = waiting.splice(0);
      for (const i of order ?? all.map((_, index) => index)) all[i]();
    },
  };
}
const open = (text: string, feedback?: FeedbackSink): Session => {
  const session = createPreview({ path: PATH, deck: parseDeck(text), reveal: false, ...feedback ? { feedback } : {} });
  assert.ok(session);
  return session;
};
function card(s: Session): CardView {
  const current = s.view();
  assert.equal(current.kind, 'card');
  if (current.kind !== 'card') throw Error();
  return current.card;
}
const settle = async (): Promise<void> => { for (let i = 0; i < 5; i++) await new Promise(resolve => setImmediate(resolve)); };
const question = (saved: Saved): string => saved.card.prompt.kind === 'qa' ? saved.card.prompt.question : saved.card.prompt.text;

void test('沒給寫的一方（設定頁關著）：沒有回饋，Session 也沒有 feedback', () => {
  const s = open(DECK);
  assert.equal(card(s).feedback, undefined);
  assert.equal(s.feedback, undefined);
});

void test('有 ID 的卡有回饋（一開始什麼都沒有）；還沒補 ID 的卡沒有，點了也不寫', () => {
  const store = sink();
  const s = open(DECK, store.value);
  assert.deepEqual(card(s).feedback, { rate: null, tags: [], note: '', status: null });
  s.forward(); s.forward();
  assert.equal(card(s).card.lt, '');
  assert.equal(card(s).feedback, undefined);
  s.feedback?.({ kind: 'rate', rate: 'fix' });
  assert.equal(store.saved.length, 0);
});

void test('點評等立刻存整份；存的途中是 saving，存好是 saved；再點同一個是取消，也存一行', async () => {
  const store = sink();
  const s = open(DECK, store.value);
  s.feedback?.({ kind: 'rate', rate: 'fix' });
  assert.equal(card(s).feedback?.status, 'saving');
  assert.equal(card(s).feedback?.rate, 'fix');
  await settle();
  assert.equal(card(s).feedback?.status, 'saved');
  s.feedback?.({ kind: 'rate', rate: 'fix' });
  await settle();
  assert.deepEqual(store.saved.map(each => each.feedback), [
    { rate: 'fix', tags: [], note: '' },
    { rate: null, tags: [], note: '' },
  ]);
  assert.equal(question(store.saved[0]), '第一題');
  assert.equal(store.saved[0].card.lt, 'a');
});

void test('標籤：沒選評等或選可以用時點了不算；要改、不要這張時可以複選，照畫面的順序；改回可以用、取消評等時清掉', async () => {
  const store = sink();
  const s = open(DECK, store.value);
  s.feedback?.({ kind: 'tag', tag: 'explain' });
  s.feedback?.({ kind: 'rate', rate: 'ok' });
  s.feedback?.({ kind: 'tag', tag: 'explain' });
  assert.equal(store.saved.length, 1, '只有評等那一次');
  s.feedback?.({ kind: 'rate', rate: 'drop' });
  s.feedback?.({ kind: 'tag', tag: 'layout' });
  s.feedback?.({ kind: 'tag', tag: 'explain' });
  s.feedback?.({ kind: 'tag', tag: 'layout' });
  s.feedback?.({ kind: 'rate', rate: 'fix' });
  s.feedback?.({ kind: 'tag', tag: 'worth' });
  s.feedback?.({ kind: 'rate', rate: 'ok' });
  s.feedback?.({ kind: 'rate', rate: 'fix' });
  s.feedback?.({ kind: 'tag', tag: 'point' });
  s.feedback?.({ kind: 'rate', rate: 'fix' });
  await settle();
  assert.deepEqual(store.saved.map(each => [each.feedback.rate, each.feedback.tags.join(',')]), [
    ['ok', ''],
    ['drop', ''],
    ['drop', 'layout'],
    ['drop', 'explain,layout'],
    ['drop', 'explain'],
    ['fix', 'explain'],
    ['fix', 'explain,worth'],
    ['ok', ''],
    ['fix', ''],
    ['fix', 'point'],
    [null, ''],
  ]);
});

void test('一句話：換行換成空白、去掉頭尾空白；整理後沒變不寫；最多 500 字，不切在半個表情符號上；收回寫空的', async () => {
  const store = sink();
  const s = open(DECK, store.value);
  s.feedback?.({ kind: 'note', note: '  詳解沒講\n為什麼\r\n  ' });
  s.feedback?.({ kind: 'note', note: '詳解沒講 為什麼' });
  s.feedback?.({ kind: 'note', note: '   ' });
  s.feedback?.({ kind: 'note', note: '' });
  s.feedback?.({ kind: 'note', note: '字'.repeat(499) + '😀' + '多' });
  s.feedback?.({ kind: 'note', note: '多'.repeat(600) });
  await settle();
  assert.deepEqual(store.saved.map(each => each.feedback.note), ['詳解沒講 為什麼', '', '字'.repeat(499), '多'.repeat(500)]);
  assert.equal(card(s).feedback?.note, '多'.repeat(500));
});

void test('寫不進去：丟錯、拒絕都是 failed；寫滿是 full；畫面上的評等不退回，再點一次就再寫整份', async () => {
  const store = sink(['throw', 'reject', 'full']);
  const s = open(DECK, store.value);
  s.feedback?.({ kind: 'rate', rate: 'fix' });
  await settle();
  assert.equal(card(s).feedback?.status, 'failed');
  assert.equal(card(s).feedback?.rate, 'fix');
  s.feedback?.({ kind: 'tag', tag: 'explain' });
  await settle();
  assert.equal(card(s).feedback?.status, 'failed');
  s.feedback?.({ kind: 'note', note: '看不懂' });
  await settle();
  assert.equal(card(s).feedback?.status, 'full');
  s.feedback?.({ kind: 'tag', tag: 'explain' });
  await settle();
  assert.equal(card(s).feedback?.status, 'saved');
  assert.deepEqual(store.saved.at(-1)?.feedback, { rate: 'fix', tags: [], note: '看不懂' });
});

void test('先送的晚回來：狀態照最後一次的結果', async () => {
  const store = sink(['failed', 'saved']);
  store.hold();
  const s = open(DECK, store.value);
  s.feedback?.({ kind: 'rate', rate: 'fix' });
  s.feedback?.({ kind: 'rate', rate: 'ok' });
  store.release([1, 0]);
  await settle();
  assert.equal(card(s).feedback?.status, 'saved');
  assert.equal(card(s).feedback?.rate, 'ok');
});

void test('往回翻看得到這一輪留過的；每張卡各自的；完成畫面數留了幾張，收回的不算', async () => {
  const store = sink();
  const s = open(DECK, store.value);
  s.feedback?.({ kind: 'rate', rate: 'ok' });
  s.forward();
  assert.deepEqual(card(s).feedback, { rate: null, tags: [], note: '', status: null });
  s.feedback?.({ kind: 'note', note: '例句太長' });
  s.forward(); s.forward();
  const done = s.view();
  assert.equal(done.kind === 'done' && done.done.detail, '共 3 張，留了 2 張的回饋');
  s.back(); s.back();
  assert.equal(card(s).feedback?.note, '例句太長');
  s.feedback?.({ kind: 'note', note: '' });
  s.back();
  assert.equal(card(s).feedback?.rate, 'ok');
  s.feedback?.({ kind: 'rate', rate: 'ok' });
  s.forward(); s.forward(); s.forward();
  const after = s.view();
  assert.equal(after.kind === 'done' && after.done.detail, '共 3 張');
  await settle();
  assert.equal(store.saved.length, 4);
});

void test('比較卡：一組一張，每一格都有 ID 才有回饋；交出去的卡帶著每一格', async () => {
  const store = sink();
  const s = open(TWO, store.value);
  assert.ok(card(s).feedback);
  s.feedback?.({ kind: 'rate', rate: 'fix' });
  await settle();
  assert.deepEqual(store.saved[0].card.blanks.map(blank => blank.lt).sort(), ['borrow', 'lendxx']);
  const missing = open(TWO.replace(' ^lendxx', ''), store.value);
  assert.equal(card(missing).feedback, undefined);
});

void test('關掉之後才回來的結果不通知畫面、不出錯', async () => {
  const store = sink();
  store.hold();
  const s = open(DECK, store.value);
  let calls = 0;
  s.subscribe(() => { calls++; });
  s.feedback?.({ kind: 'rate', rate: 'fix' });
  const before = calls;
  s.close();
  store.release();
  await settle();
  assert.equal(calls, before);
});
