import test from 'node:test';
import assert from 'node:assert/strict';
import { parseDeck } from '../src/core/deck/index.ts';
import { mergeHistory, planToday } from '../src/core/study/index.ts';
import type { DeckEntry } from '../src/core/study/index.ts';

// 變化目標的開始條件（D-193 第 5 點、tasks/english-typed-order.md §3）：同一篇配對得上的英翻中記得了才出。預期值照任務說明的邊界例子手寫。

const NOW = '2026-11-15T19:00:00.000+08:00';
const PATH = 'Essence Cards/英文/L3 單字.md';
const deckOf = (body: string, path = PATH): DeckEntry => ({ path, deck: parseDeck(`---\n科目: 英文\n---\n${body}`) });
const line = (lt: string, r: string, t: string): string => JSON.stringify({ t, lt, r, v: '12345678' });
function share(decks: readonly DeckEntry[], lines: readonly string[] = []): string[] {
  const history = mergeHistory([{ path: 'Essence Cards/紀錄/2026-11 PC-test.jsonl', text: lines.join('\n') }]);
  const today = planToday({ decks, history, settings: { capMinutes: 60, retention: 0.9, filter: [] }, exam: null, now: Date.parse(NOW), offset: 480 });
  return [...today.share, ...today.more].map(item => item.lt);
}

const GO = `- go 英翻中 ^goenzh
    - go :: 去
- go 過去式 ^gopast
    - Yesterday I ＿＿ to school.（去） :: went
`;
/** 昨天按太簡單：明天以後才到期（FSRS 第一次太簡單的間隔超過一天）。 */
const REMEMBERED = line('goenzh', 'easy', '2026-11-14T19:00:00.000+08:00');

void test('英翻中還沒紀錄：變化今天不出', () => {
  assert.deepEqual(share([deckOf(GO)]), ['goenzh']);
});

void test('英翻中記住了、今天沒到期：變化照常出', () => {
  assert.deepEqual(share([deckOf(GO)], [REMEMBERED]), ['gopast']);
});

void test('英翻中最後一次答錯：變化不出', () => {
  assert.deepEqual(share([deckOf(GO)], [line('goenzh', 'miss', '2026-11-15T08:00:00.000+08:00')]), ['goenzh']);
});

void test('英翻中暫停：沒有候選的英翻中，變化照常出', () => {
  const paused = GO.replace('    - go :: 去', '    - 狀態：暫停\n    - go :: 去');
  assert.deepEqual(share([deckOf(paused)]), ['gopast']);
});

void test('英翻中在另一篇：這一篇沒有配對，變化照常出', () => {
  const other = deckOf('- go 英翻中 ^goenzh\n    - go :: 去\n', 'Essence Cards/英文/L1 單字.md');
  const here = deckOf('- go 過去式 ^gopast\n    - Yesterday I ＿＿ to school.（去） :: went\n');
  assert.deepEqual(share([other, here]).sort(), ['goenzh', 'gopast']);
});

void test('變化有紀錄之後不再看英翻中', () => {
  assert.deepEqual(share([deckOf(GO)], [line('gopast', 'miss', '2026-11-14T19:00:00.000+08:00')]).sort(), ['goenzh', 'gopast']);
});

const MEANINGS = `- go（走） 英翻中 ^gowalk
    - go :: 走
- go 過去式 ^gopast
    - Yesterday I ＿＿ to school.（去） :: went
- go（走） 過去式 ^gowpst
    - He ＿＿ home.（走） :: went
- go（去） 過去式 ^gogpst
    - She ＿＿ there.（去） :: went
`;

void test('沒有括號的變化配這個字任一個意思；有括號的只配同一個意思，找不到配對照常出', () => {
  assert.deepEqual(share([deckOf(MEANINGS)]), ['gowalk', 'gogpst']);
  assert.deepEqual(share([deckOf(MEANINGS)], [line('gowalk', 'easy', '2026-11-14T19:00:00.000+08:00')]), ['gopast', 'gowpst', 'gogpst']);
});

void test('配對不分大小寫、全半形括號一樣', () => {
  const deck = deckOf('- Light(輕的) 英翻中 ^ltenzh\n    - light :: 輕的\n- light（輕的） 比較級 ^ltcomp\n    - This bag is ＿＿ than that one.（輕的） :: lighter\n');
  assert.deepEqual(share([deck]), ['ltenzh']);
});

void test('英翻中記住了但今天到期：還不算記得，變化不出（同中翻英，remembered）', () => {
  assert.deepEqual(share([deckOf(GO)], [line('goenzh', 'good', '2026-11-12T19:00:00.000+08:00')]), ['goenzh']);
});
