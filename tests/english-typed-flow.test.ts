import test from 'node:test';
import assert from 'node:assert/strict';
import { questionType } from '../src/core/study/index.ts';
import { RATE_DELAY } from '../src/review/index.ts';
import type { Session } from '../src/review/index.ts';
import { setup, view } from './helpers/pick-session.ts';

// 文法與變化的打字卡（tasks/english-typed-order.md §2、§6-3）：createSession 接真的 createState。預期值照 D-121 與任務說明手寫。

const P = 'Essence Cards/英文/L3 文法.md';
const deck = (body: string): string => `---\n科目: 英文\n---\n${body}`;
const GRAMMAR = deck(`- 現在完成式（從過去持續到現在） 文法 ^grammr
    - I ＿＿ Tom since I was six. (know) :: have known | 've known
`);
const GIVEN = deck(`- 現在完成式（從過去持續到現在） 文法 ^grammr
    - （現在完成式）I ＿＿ Tom since I was six. (know) :: have known
`);
const INFLECTION = deck(`- lie（躺） 過去式 ^liepst
    - He ＿＿ on the bed last night.（躺） :: lay
`);
const typedOf = (s: Session) => {
  const typed = view(s).typed;
  assert.ok(typed, '不是打字卡');
  return typed;
};
function type(s: Session, text: string): void {
  s.act({ kind: 'input', text });
  s.act({ kind: 'submit' });
}

void test('文法是打字卡；拼錯進第 2 步，提示文法點；朗讀先念答案再念句子', async t => {
  const h = await setup(t, { [P]: GRAMMAR });
  const s = await h.open({ subject: '英文' });
  assert.equal(questionType(view(s).card), 'typed');
  assert.equal(view(s).english, true);
  type(s, 'knew');
  assert.deepEqual([typedOf(s).step, typedOf(s).hint], [2, '現在完成式']);
  type(s, 'have known');
  assert.equal(typedOf(s).finished, true);
  assert.deepEqual(view(s).autoRead, ['have known', 'I have known Tom since I was six.']);
  assert.equal(view(s).speakable, true);
});

void test('題目已經寫了文法點：第 2 步跳過，紀錄的 retry 是 not-needed', async t => {
  const h = await setup(t, { [P]: GIVEN });
  const s = await h.open({ subject: '英文' });
  type(s, 'knew');
  assert.deepEqual([typedOf(s).step, typedOf(s).second], [3, 'not-needed']);
  type(s, 'have known');
  h.clock.now += RATE_DELAY;
  assert.equal(s.rate('near'), true);
  await h.state.flush();
  assert.deepEqual(h.log().map(({ lt, r, typed, retry }) => ({ lt, r, typed, retry })), [{ lt: 'grammr', r: 'near', typed: 'wrong', retry: 'not-needed' }]);
});

void test('變化的第 2 步提示原形（去掉意思的括號）', async t => {
  const h = await setup(t, { [P]: INFLECTION });
  const s = await h.open({ subject: '英文' });
  assert.equal(questionType(view(s).card), 'typed');
  type(s, 'lied');
  assert.deepEqual([typedOf(s).step, typedOf(s).hint], [2, 'lie']);
});
