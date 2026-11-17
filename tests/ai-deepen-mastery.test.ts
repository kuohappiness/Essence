import test from 'node:test';
import assert from 'node:assert/strict';
import { check } from '../src/core/ai/index.ts';
import { buildIndex, parseScope, targetsInScope } from '../src/core/catalog/index.ts';
import type { CatalogDeck } from '../src/core/catalog/index.ts';
import { isOutside, parseDeck, sourceLinks } from '../src/core/deck/index.ts';
import { encodeEntry, masteryOf, mergeHistory, missCount, planToday } from '../src/core/study/index.ts';
import type { DeckEntry, ExamScope, ReviewEntry, TodayInput } from '../src/core/study/index.ts';

// AI 製卡第 2 批的不寫檔部分（tasks/ai-cards-deepen.md §2-1、§6）：記穩了、常錯、課外層的讀法與排程。預期照任務說明手寫。

const OFFSET = 480;
const at = (text: string): number => Date.parse(text + '+08:00');
const entry = (lt: string, r: ReviewEntry['r'], time: string, src: string | null = null): ReviewEntry =>
  ({ kind: 'review', t: time, at: at(time), offset: OFFSET, lt, r, v: null, typed: null, src });

void test('常錯：同一天連續的答錯算一次，答對斷開，跨天另算', () => {
  assert.equal(missCount([entry('a', 'miss', '2026-11-01T10:00:00'), entry('a', 'miss', '2026-11-01T10:01:00')]), 1);
  assert.equal(missCount([entry('a', 'miss', '2026-11-01T10:00:00'), entry('a', 'good', '2026-11-01T10:01:00'), entry('a', 'near', '2026-11-01T10:02:00')]), 2);
  assert.equal(missCount([entry('a', 'miss', '2026-11-01T10:00:00'), entry('a', 'miss', '2026-11-02T10:00:00')]), 2);
  // 清晨 4 點換日：凌晨 3 點還算前一天。
  assert.equal(missCount([entry('a', 'miss', '2026-11-01T22:00:00'), entry('a', 'miss', '2026-11-02T03:00:00')]), 1);
  // 錯題本緊接著重學答錯，同一天算一次。
  assert.equal(missCount([entry('a', 'miss', '2026-11-01T10:00:00', 'mistake'), entry('a', 'miss', '2026-11-01T10:05:00')]), 1);
  assert.equal(missCount([entry('a', 'good', '2026-11-01T10:00:00'), entry('a', 'easy', '2026-11-03T10:00:00')]), 0);
});

void test('記穩了：穩定度 7 天以上而且最後一次答對；常錯要還沒記穩；紀錄不完整的是 unknown', () => {
  const reviews = [
    // s：第一次記住了，隔 1 天再記住了（穩定度 7.32，討論稿〈現況〉第 4 點的表）
    entry('s', 'good', '2026-11-01T10:00:00'), entry('s', 'good', '2026-11-02T10:00:00'),
    // one：只答對一次（2.31 天）
    entry('one', 'good', '2026-11-01T10:00:00'),
    // w：兩天各錯一次
    entry('w', 'miss', '2026-11-01T10:00:00'), entry('w', 'good', '2026-11-01T10:01:00'), entry('w', 'miss', '2026-11-02T10:00:00'), entry('w', 'good', '2026-11-02T10:01:00'),
    // late：穩了之後錯題本記一筆
    entry('late', 'good', '2026-11-01T10:00:00'), entry('late', 'good', '2026-11-03T10:00:00'), entry('late', 'miss', '2026-11-05T10:00:00', 'mistake'),
    // ws：錯過兩次但後來記穩了
    entry('ws', 'miss', '2026-10-01T10:00:00'), entry('ws', 'good', '2026-10-01T10:01:00'), entry('ws', 'miss', '2026-10-02T10:00:00'), entry('ws', 'good', '2026-10-02T10:01:00'),
    entry('ws', 'good', '2026-10-05T10:00:00'), entry('ws', 'good', '2026-10-15T10:00:00'), entry('ws', 'good', '2026-11-10T10:00:00'),
  ].sort((a, b) => a.at - b.at);
  const result = masteryOf(['s', 'one', 'w', 'late', 'ws', 'none', 'held'], reviews, id => id === 'held');
  assert.deepEqual(Object.fromEntries(result), { s: 'stable', one: 'unstable', w: 'weak', late: 'unstable', ws: 'stable', none: 'unstable', held: 'unknown' });
});

const own = { term: '國二上', subject: '自然', unit: { code: '2-1' } };

void test('課外：那一段只顯示、不連、不算單元；每一項都是課外才算延伸', () => {
  assert.deepEqual(sourceLinks(['課外：高中課本 p.44'], own), [{ text: '課外：高中課本 p.44', link: { kind: 'text' }, outside: true }]);
  assert.deepEqual(sourceLinks(['課外：國三上 2-1'], own).map(item => item.link.kind), ['text']);
  assert.equal(isOutside(['課外：高中基礎物理 熱學'], own), true);
  assert.equal(isOutside(['課外:高中基礎物理'], own), true);
  assert.equal(isOutside(['p.44、課外：高中基礎物理'], own), false);
  assert.equal(isOutside(['國二上 1-3 p.20、課外：高中基礎物理'], own), false);
  assert.equal(isOutside(['[AI 補充]'], own), false);
  assert.equal(isOutside(['先備：國一數學 比例式'], own), false);
  assert.equal(isOutside([], own), false);
  // 跨單元後面接課外：課外那一段不跟前一個單元，單元照算。
  const items = sourceLinks(['國二上 1-3 p.20、課外：高中課本 p.18'], own);
  assert.deepEqual(items.map(item => [item.link.kind, item.outside ?? false]), [['unit', false], ['text', true]]);
});

void test('檢查：課外：要寫來源', () => {
  const reply = (source: string): string => `## 1 溶液\n\n- 能說明水的密度隨溫度改變\n    - 出處：${source}\n    - 4°C 的水和 20°C 的水哪一個密度大？ :: **4°C**\n`;
  const codes = (source: string): string[] => check(reply(source), {}).issues.map(issue => issue.code);
  assert.ok(!codes('課外：高中基礎物理 熱學').includes('source-unknown'));
  assert.ok(codes('課外：').includes('source-outside-empty'));
});

const deck = (path: string, text: string): CatalogDeck => ({ path, deck: parseDeck(text) });
const DECK = '---\n年級學期: 國二上\n科目: 自然\n單元: "2-1"\n---\n'
  + '- 課本 ^abc123\n    - 出處：p.44\n    - 問 1 :: 答 1\n'
  + '- 課外 ^def456\n    - 出處：課外：高中基礎物理 熱學\n    - 問 2 :: 答 2\n';

void test('考試範圍不算課外層的目標', () => {
  const ids = targetsInScope(parseScope('- 國二上 自然 2-1\n'), buildIndex([deck('Essence Cards/自然 2-1.md', DECK)]));
  assert.deepEqual([...ids], ['abc123']);
});

void test('考試範圍生效時，課外的重學排在範圍內的新卡後面；沒有範圍時照常先出', () => {
  const entryOf: DeckEntry = { path: 'Essence Cards/自然 2-1.md', deck: parseDeck(DECK) };
  const v = (id: string): string => entryOf.deck.targets.find(target => target.id === id)?.prompts[0].fingerprint ?? '';
  const lines = [encodeEntry('2026-11-16T10:00:00.000+08:00', { lt: 'def456', r: 'miss', v: v('def456') })];
  const input = (exam: ExamScope | null): TodayInput => ({
    decks: [entryOf], history: mergeHistory([{ path: 'Essence Cards/紀錄/2026-11 Phone-test.jsonl', text: lines.join('\n') }]),
    settings: { capMinutes: 60, retention: 0.8, filter: [] }, exam, now: at('2026-11-17T10:00:00'), offset: OFFSET,
  });
  const order = (exam: ExamScope | null): string[] => planToday(input(exam)).share.map(item => item.lt + ':' + item.lane);
  const exam: ExamScope = { contains: (_entry, target) => target.id === 'abc123', hasPeriod: true, outside: (_entry, target) => isOutside(target.fields.sources, own) };
  assert.deepEqual(order(exam), ['abc123:exam-new', 'def456:due']);
  assert.deepEqual(order({ ...exam, hasPeriod: false }), ['abc123:exam-new', 'def456:due']);
  assert.deepEqual(order(null), ['def456:relearn', 'abc123:new']);
  // 課外的保持率不提高。
  assert.equal(planToday(input(exam)).slots.get('def456')?.retention, 0.8);
});
