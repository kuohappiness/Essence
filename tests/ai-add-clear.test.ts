import test from 'node:test';
import assert from 'node:assert/strict';
import { CLEAR_WHY, clearExisting, EXISTING_WHY, introBoxes, planExisting, WHY } from '../src/core/ai/index.ts';
import type { ClearItem, ItemRef } from '../src/core/ai/index.ts';
import { parseDeck } from '../src/core/deck/index.ts';

// tasks/ai-cards-add.md §4 第 4 步的文字部分：跨篇的項目在最新的來源文字裡重新找、用來源最新的屬性對目的地再確認一次，成立才從框裡拿掉；
// 同一篇的項目加進自己的目標，和拿掉放在同一次寫入。只用自編的內容。

const SRC = 'Essence Cards/學業/國二上/自然/2-2.md';
const DEST = 'Essence Cards/學業/國二上/自然/2-1.md';
const head = (unit: string): string => `---\n年級學期: 國二上\n科目: 自然\n單元: "${unit}"\n---\n`;
const Q1 = '    - 密度怎麼算？ :: 質量除以體積';
const Q2 = '    - 雞蛋為什麼浮起來？ :: 鹽水的密度變大';
const LINK = '- [[國二上自然 2-1#^q8z3ka|能用密度判斷物體的浮沉]]';
const destText = (...body: string[]): string => head('2-1 密度') + ['- 能用密度判斷物體的浮沉 ^q8z3ka', ...body].join('\n') + '\n';
const BODY = '- 能說出溶解 ^p7q2w8\n    - 溶解？ :: 溶質均勻分散\n';
const boxed = (...items: string[][]): string => ['> [!note]- 加進已有的學習目標', ...items.flatMap(item => item.map(line => '> ' + line))].join('\n') + '\n';
const source = (unit: string, ...items: string[][]): string => head(unit) + BODY + '\n' + boxed(...items);
const refsOf = (text: string): ItemRef[] => introBoxes(text).flatMap(box => box.items).map(({ kind, id, original }) => ({ kind, id, original }));
const cross = (ref: ItemRef, text: string): ClearItem => ({ ref, id: ref.id!, dest: { path: DEST, text } });
const clear = (text: string, items: ClearItem[]) => clearExisting({ path: SRC, text, items, version: '0.5.0' });
/** 目的地照第 2 步加過的樣子（planExisting 算的）。 */
const added = (original: string, before: string, unit = '2-2 水溶液'): string => {
  const plan = planExisting({ original, id: 'q8z3ka', source: { path: SRC, props: parseDeck(head(unit)).props }, dest: { path: DEST, text: before }, version: '0.5.0' });
  assert.ok(plan.kind === 'plan' && plan.text !== null, JSON.stringify(plan));
  return plan.text;
};

void test('§4 第 4 步：目的地已經有整項才拿；框空了整個拿掉', () => {
  const item = [LINK, '    - 出處：p.46', Q2];
  const text = source('2-2 水溶液', item);
  const [ref] = refsOf(text);
  const dest = added(item.join('\n'), destText(Q1));
  const out = clear(text, [cross(ref, dest)]);
  assert.deepEqual(out, { text: head('2-2 水溶液') + BODY, done: [ref], left: [] });
});

void test('§4 第 4 步：確認後家長刪掉目的地原本就在的那一題、或草稿的單元改了（出處變成別的單元）都不拿', () => {
  const item = [LINK, '    - 出處：p.46', Q2];
  const text = source('2-2 水溶液', item);
  const [ref] = refsOf(text);
  const dest = added(item.join('\n'), destText(Q1));
  const trimmed = dest.replace(Q2 + '\n', '');
  assert.deepEqual(clear(text, [cross(ref, trimmed)]), { text: null, done: [], left: [{ ref, why: CLEAR_WHY.destChanged }] });
  const moved = text.replace('"2-2 水溶液"', '"2-3 熱"');
  assert.deepEqual(clear(moved, [cross(ref, dest)]), { text: null, done: [], left: [{ ref, why: CLEAR_WHY.destChanged }] });
});

void test('§4 只拿掉自己搬的：家長在中間改了來源那一項就留著、提示；框裡兩個原文相同的項目都不拿', () => {
  const item = [LINK, Q2];
  const text = source('2-1 密度', item);
  const [ref] = refsOf(text);
  const dest = added(item.join('\n'), destText(Q1), '2-1 密度');
  const edited = text.replace('鹽水的密度變大', '鹽水比較重');
  assert.deepEqual(clear(edited, [cross(ref, dest)]), { text: null, done: [], left: [{ ref, why: CLEAR_WHY.edited }] });
  const twice = source('2-1 密度', item, item);
  assert.deepEqual(clear(twice, [cross(ref, dest)]), { text: null, done: [], left: [{ ref, why: WHY.duplicate }] });
});

void test('§4 同一批：一項不成立、另一項照拿；所有區間對同一份文字一次算好', () => {
  const a = [LINK, Q2];
  const b = ['- [[國二上自然 2-1#^q8z3ka|能用密度判斷物體的浮沉]]', '    - 鐵塊會沉嗎？ :: 會'];
  const text = source('2-1 密度', a, b);
  const [refA, refB] = refsOf(text);
  const dest = added(a.join('\n'), destText(Q1), '2-1 密度');
  const out = clear(text, [cross(refA, dest), cross(refB, dest)]);
  assert.deepEqual(out, { text: head('2-1 密度') + BODY + '\n' + boxed(b), done: [refA], left: [{ ref: refB, why: CLEAR_WHY.destChanged }] });
});

void test('§4 同一篇的項目：加進這一篇自己的目標、從框裡拿掉，一次寫入；和跨篇的拿掉放在一起', () => {
  const self = ['- [[國二上自然 2-2#^p7q2w8|能說出溶解]]', '    - 糖溶在水裡看得到嗎？ :: 看不到'];
  const other = [LINK, Q2];
  const text = source('2-1 密度', self, other);
  const [refSelf, refOther] = refsOf(text);
  const dest = added(other.join('\n'), destText(Q1), '2-1 密度');
  const out = clear(text, [{ ref: refSelf, id: 'p7q2w8', dest: null }, cross(refOther, dest)]);
  assert.deepEqual(out, { text: head('2-1 密度') + BODY + self[1] + '\n', done: [refSelf, refOther], left: [] });
  // 同一篇的那一項加不進去（窄版防呆）就留在框裡，跨篇的照拿。
  const clash = ['- [[國二上自然 2-2#^p7q2w8|能說出溶解]]', '    - 溶解？ :: 溶劑消失'];
  const text2 = source('2-1 密度', clash, other);
  const [refClash] = refsOf(text2);
  const out2 = clear(text2, [{ ref: refClash, id: 'p7q2w8', dest: null }, cross(refOther, dest)]);
  assert.deepEqual(out2, { text: head('2-1 密度') + BODY + '\n' + boxed(clash), done: [refOther], left: [{ ref: refClash, why: EXISTING_WHY.qaConflict('2-2') }] });
});
