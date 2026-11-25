import test from 'node:test';
import assert from 'node:assert/strict';
import { parseDeck } from '../src/core/deck/index.ts';
import type { Target } from '../src/core/deck/index.ts';
import { choiceCardOf, choicePreviewCards, encodeEntry, mergeHistory, nextCard, planToday, questionType } from '../src/core/study/index.ts';
import type { Card, DeckEntry, Next, TodayInput } from '../src/core/study/index.ts';

// 多音字一張卡出幾句（tasks/polyphone-pick.md §3）：比讀音多一句、每個讀音至少一句、指紋不重複（畫面上同一句寫兩次的解析時就不認，見 polyphone-pick.test.ts）。預期值手算。

const P = 'Essence Cards/國語/第3課.md';
const LONG = `---
科目: 國語
---
- 長（ㄓㄤˇ、ㄔㄤˊ） 讀音 ^k3m9qa
    - 記憶錨點：
        - ㄓㄤˇ：長大、帶頭的人：成長、班長
        - ㄔㄤˊ：距離或時間久：長短、很長
    - 他長（＿＿）得比哥哥高。 :: ㄓㄤˇ
    - 小樹苗慢慢長（＿＿）大了。 :: ㄓㄤˇ
    - 他是我們班的班長（＿＿）。 :: ㄓㄤˇ
    - 這條路很長（＿＿）。 :: ㄔㄤˊ
    - 夏天的白天比較長（＿＿）。 :: ㄔㄤˊ
    - 妹妹留著一頭長（＿＿）髮。 :: ㄔㄤˊ
`;
/** 出題歷史：指紋 → 最後一次出的時間與次數。 */
type Shown = Parameters<typeof choiceCardOf>[1];
const deckOf = (text: string): DeckEntry => ({ path: P, deck: parseDeck(text) });
const long = deckOf(LONG);
const targetOf = (entry: DeckEntry, index = 0): Target => entry.deck.targets[index];
const make = (target: Target, shown: Shown = new Map()): Card => choiceCardOf({ lt: target.id ?? '', deck: P, target, isNew: false, early: false }, shown);
/** 這張卡每一格的題目開頭兩個字。 */
const heads = (card: Card): string[] => card.blanks.map(blank => (blank.prompt.kind === 'qa' ? blank.prompt.question : '').slice(0, 2));
const answers = (card: Card): string[] => card.blanks.map(blank => blank.answer ?? '');
const count = (items: readonly string[], item: string): number => items.filter(each => each === item).length;

void test('兩個讀音：出三句、每個讀音至少一句、指紋不重複；是點選填空', () => {
  const card = make(targetOf(long));
  assert.equal(questionType(card), 'pick');
  assert.equal(card.blanks.length, 3);
  assert.ok(count(answers(card), 'ㄓㄤˇ') >= 1 && count(answers(card), 'ㄔㄤˊ') >= 1, answers(card).join());
  assert.equal(new Set(card.blanks.map(blank => blank.prompt.fingerprint)).size, 3);
  // 沒出過：每個讀音先挑筆記裡的第一句，再照筆記順序補一句（他長、小樹苗、這條路），打亂。
  assert.deepEqual([...heads(card)].sort(), ['他長', '小樹', '這條'].sort());
  assert.ok(card.blanks.every(blank => blank.lt === 'k3m9qa' && blank.target === targetOf(long)));
  assert.deepEqual(card.group?.members, ['ㄓㄤˇ', 'ㄔㄤˊ']);
  assert.deepEqual([...card.group?.keys ?? []].sort(), ['ㄓㄤˇ', 'ㄔㄤˊ'].sort());
});

void test('同一張重來不變；下一次照出題歷史換句', () => {
  const target = targetOf(long);
  assert.deepEqual(heads(make(target)), heads(make(target)));
  assert.deepEqual(make(target).group?.keys, make(target).group?.keys);
  // 第一次出的三句（他長、小樹苗、這條路）出過了：下一次每個讀音挑沒出過的第一句（班長、夏天），再補妹妹。
  const prints = (indexes: readonly number[]): Shown => new Map(indexes.map(i => [target.prompts[i].fingerprint, { at: 100, count: 1 }]));
  const second = make(target, prints([0, 1, 3]));
  assert.deepEqual([...heads(second)].sort(), ['他是', '夏天', '妹妹'].sort());
});

void test('同一組句子，出題歷史不同，畫面的順序也一樣（L2 R5）', () => {
  // 池裡剛好三句：每次都全出，只有出題順序跟著歷史變。
  const three = targetOf(deckOf(LONG.split('\n').filter(line => !/小樹苗|班長（|妹妹/.test(line)).join('\n')));
  assert.equal(three.prompts.length, 3);
  const none = make(three);
  const history: Shown = new Map([[three.prompts[0].fingerprint, { at: 100, count: 2 }], [three.prompts[1].fingerprint, { at: 100, count: 1 }]]);
  const after = make(three, history);
  assert.deepEqual(heads(after), heads(none));
  assert.deepEqual(after.group?.keys, none.group?.keys);
});

void test('三個讀音：出四句；池裡只有讀音數那麼多句時全出；某個讀音只有一句也一定出', () => {
  const three = deckOf(`- 行（ㄒㄧㄥˊ、ㄏㄤˊ、ㄏㄥˋ） 讀音 ^xing01
    - 他行（＿＿）走得很快。 :: ㄒㄧㄥˊ
    - 銀行（＿＿）在街角。 :: ㄏㄤˊ
    - 道行（＿＿）很深。 :: ㄏㄥˋ
    - 這樣做不行（＿＿）。 :: ㄒㄧㄥˊ
    - 他在家排行（＿＿）老二。 :: ㄏㄤˊ
`);
  const card = make(targetOf(three));
  assert.equal(card.blanks.length, 4);
  for (const reading of ['ㄒㄧㄥˊ', 'ㄏㄤˊ', 'ㄏㄥˋ']) assert.ok(answers(card).includes(reading), reading);
  const exact = deckOf(`- 長（ㄓㄤˇ、ㄔㄤˊ） 讀音 ^k3m9qa
    - 他長（＿＿）得比哥哥高。 :: ㄓㄤˇ
    - 這條路很長（＿＿）。 :: ㄔㄤˊ
`);
  assert.deepEqual([...answers(make(targetOf(exact)))].sort(), ['ㄓㄤˇ', 'ㄔㄤˊ'].sort());
  // ㄔㄤˊ 只有一句、而且最近才出過：照樣出它，另外兩句是 ㄓㄤˇ。
  const lone = deckOf(`- 長（ㄓㄤˇ、ㄔㄤˊ） 讀音 ^k3m9qa
    - 這條路很長（＿＿）。 :: ㄔㄤˊ
    - 他長（＿＿）得比哥哥高。 :: ㄓㄤˇ
    - 小樹苗慢慢長（＿＿）大了。 :: ㄓㄤˇ
    - 他是我們班的班長（＿＿）。 :: ㄓㄤˇ
`);
  const target = targetOf(lone);
  const recent = make(target, new Map([[target.prompts[0].fingerprint, { at: 900, count: 5 }]]));
  assert.equal(recent.blanks.length, 3);
  assert.equal(count(answers(recent), 'ㄔㄤˊ'), 1);
});

void test('預覽：一張第一次的卡，其餘不同指紋的句子各一張（一格，字鍵照樣是全部讀音）', () => {
  const cards = choicePreviewCards(P, targetOf(long));
  assert.deepEqual(cards.map(card => card.blanks.length), [3, 1, 1, 1]);
  assert.deepEqual(new Set(cards.flatMap(card => card.blanks.map(blank => blank.prompt.fingerprint))).size, 6);
  for (const card of cards.slice(1)) assert.deepEqual([...card.group?.keys ?? []].sort(), ['ㄓㄤˇ', 'ㄔㄤˊ'].sort());
});

// ── 出卡的每個地方（§3-5）：今天的份、全部卡的一輪（小考同一條路）。 ──
const at = (date: string, time = '19:00:00.000'): string => `2026-${date}T${time}+08:00`;
function input(lines: readonly string[], now: string): TodayInput {
  return { decks: [long], history: mergeHistory([{ path: 'Essence Cards/紀錄/2026-11 Phone-test.jsonl', text: lines.join('\n') }]), settings: { capMinutes: 30, retention: 0.8, filter: [] }, exam: null, now: Date.parse(now), offset: 480 };
}
function card(next: Next): Card {
  assert.equal(next.kind, 'card');
  if (next.kind !== 'card') throw Error();
  return next.card;
}

void test('今天的份與全部卡的一輪：多音字是一張三格的點選填空，照出題歷史換句', () => {
  const now = at('11-26');
  const fresh = input([], now);
  const today = planToday(fresh);
  const share = card(nextCard(today, fresh, { subject: '國語' }));
  assert.equal(questionType(share), 'pick');
  assert.equal(share.blanks.length, 3);
  assert.equal(share.isNew, true);
  const round = card(nextCard(today, fresh, { targets: ['k3m9qa'], since: Date.parse(now) }));
  assert.deepEqual([...heads(round)].sort(), ['他長', '小樹', '這條'].sort());
  // 前一天出過三句（最上層與 also 都算）：今天換另外三句。
  const target = targetOf(long);
  const line = encodeEntry(at('11-25'), { lt: 'k3m9qa', r: 'good', v: target.prompts[0].fingerprint, pick: 'ㄓㄤˇ', also: [{ v: target.prompts[1].fingerprint, r: 'good', pick: 'ㄓㄤˇ' }, { v: target.prompts[3].fingerprint, r: 'good', pick: 'ㄔㄤˊ' }] });
  const later = input([line], at('11-30'));
  const again = card(nextCard(planToday(later), later, { targets: ['k3m9qa'], since: Date.parse(at('11-30')) }));
  assert.deepEqual([...heads(again)].sort(), ['他是', '夏天', '妹妹'].sort());
});
