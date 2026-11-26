import test from 'node:test';
import assert from 'node:assert/strict';
import { parseDeck } from '../src/core/deck/index.ts';
import { cardOf, encodeEntry, mergeHistory, nextCard, planToday } from '../src/core/study/index.ts';
import type { Card, DeckEntry, Pick, TodayInput } from '../src/core/study/index.ts';
import { kindPoem } from './helpers/kinds.ts';

// 全詩順序卡在佇列裡（D-189 第 1 點、D-204）：純函式，預期值手寫。
const P = 'Essence Cards/國語/古詩.md';
const POEM = `---
科目: 國語
---
### 鳥鳴澗
- 鳥鳴澗 第 1 句 接句 ^b3pmaa
    - ==人閒桂花落==，夜靜春山空。
- 鳥鳴澗 第 2 句 接句 ^b3pmab
    - 人閒桂花落，==夜靜春山空==。
- 鳥鳴澗 第 3 句 接句 ^b3pmac
    - ==月出驚山鳥==，時鳴春澗中。
- 鳥鳴澗 第 4 句 接句 ^b3pmad
    - 月出驚山鳥，==時鳴春澗中==。
- 鳥鳴澗 全詩 排序 ^b3pmae
    - ==人閒桂花落==，==夜靜春山空==。==月出驚山鳥==，==時鳴春澗中==。
`;
const deck: DeckEntry = { path: P, deck: parseDeck(POEM) };
const print = (lt: string): string => deck.deck.targets.find(target => target.id === lt)?.prompts[0].fingerprint ?? '';
const input = (lines: readonly string[], now: string): TodayInput => ({
  decks: [deck], history: mergeHistory([{ path: 'Essence Cards/紀錄/2026-11 Phone-test.jsonl', text: lines.join('\n') }]),
  settings: { capMinutes: 30, retention: 0.8, filter: [] }, exam: null, now: Date.parse(now), offset: 480,
});
function next(lines: readonly string[], now: string, pick: Pick = { subject: '國語' }): Card {
  const data = input(lines, now);
  const found = nextCard(planToday(data), data, pick);
  assert.equal(found.kind, 'card');
  if (found.kind !== 'card') throw Error();
  return found.card;
}
const good = (time: string, lt: string): string => encodeEntry(time, { lt, r: 'good', v: print(lt) });

void test('第一次學這首：四張接句隔開成第 1、3、2、4 句，排序卡排在最後（D-189 第 1 點）', () => {
  const data = input([], '2026-11-15T19:00:00.000+08:00');
  assert.deepEqual(planToday(data).share.map(item => item.lt), ['b3pmaa', 'b3pmab', 'b3pmac', 'b3pmad', 'b3pmae']);
  const lines: string[] = [];
  const order: string[] = [];
  for (let i = 0; i < 5; i++) {
    const card = next(lines, `2026-11-15T19:0${String(i)}:30.000+08:00`);
    order.push(card.lt);
    lines.push(good(`2026-11-15T19:0${String(i)}:40.000+08:00`, card.lt));
  }
  assert.deepEqual(order, ['b3pmaa', 'b3pmac', 'b3pmab', 'b3pmad', 'b3pmae']);
});

void test('字鍵的順序每次出不同，同一次重來不變', () => {
  const earlier = ['b3pmaa', 'b3pmab', 'b3pmac', 'b3pmad'].map((lt, i) => good(`2026-11-01T19:0${String(i)}:00.000+08:00`, lt));
  const first = next(earlier, '2026-11-01T19:10:00.000+08:00');
  assert.equal(first.lt, 'b3pmae');
  assert.deepEqual(next(earlier, '2026-11-01T19:11:00.000+08:00').group?.keys, first.group?.keys, '重來一樣');
  const again = next([...earlier, good('2026-11-01T19:12:00.000+08:00', 'b3pmae')], '2026-11-20T19:00:00.000+08:00', { targets: ['b3pmae'] });
  assert.equal(again.lt, 'b3pmae');
  assert.notDeepEqual(again.group?.keys, first.group?.keys, '出過一次之後換順序');
});

// 字鍵的順序和上一次不同（L2 R4）：直接用 cardOf 算出第 0～200 次。
const keysAt = (text: string, times: number): readonly string[] => {
  const target = parseDeck(text).targets.find(each => kindPoem(each));
  if (!target) throw Error('沒有全詩順序卡');
  return cardOf({ lt: target.id ?? '', deck: P, target, prompt: target.prompts[0], isNew: false, early: false }, times).group?.keys ?? [];
};
const poemOf = (lines: readonly string[]): string => `### 試詩\n- 試詩 全詩 排序 ^b3pmaf\n    - ${lines.map(line => `==${line}==`).join('，')}。\n`;

void test('字鍵每一次都和上一次不同，也不照詩的順序；四句的第 15、16 次也不同（L2 R4）', () => {
  const lines = ['清風入小徑', '石上落微光', '池邊浮竹影', '遠岫起朝陽'];
  const text = poemOf(lines);
  let before: readonly string[] | null = null;
  for (let times = 0; times <= 200; times++) {
    const keys = keysAt(text, times);
    assert.deepEqual([...keys].sort(), [...lines].sort());
    assert.notDeepEqual(keys, lines, `第 ${String(times)} 次照詩的順序`);
    if (before) assert.notDeepEqual(keys, before, `第 ${String(times)} 次和上一次一樣`);
    before = keys;
  }
  assert.notDeepEqual(keysAt(text, 16), keysAt(text, 15));
});

void test('做不到不同時照舊：兩句只有對調一種；有相同句子時照樣不和上一次一樣', () => {
  const two = poemOf(['床前明月光', '疑是地上霜']);
  for (const times of [0, 1, 2]) assert.deepEqual(keysAt(two, times), ['疑是地上霜', '床前明月光']);
  const same = poemOf(['人閒桂花落', '人閒桂花落', '月出驚山鳥']);
  let before: readonly string[] | null = null;
  for (let times = 0; times <= 50; times++) {
    const keys = keysAt(same, times);
    assert.notDeepEqual(keys, ['人閒桂花落', '人閒桂花落', '月出驚山鳥']);
    if (before) assert.notDeepEqual(keys, before, `第 ${String(times)} 次和上一次一樣`);
    before = keys;
  }
});
