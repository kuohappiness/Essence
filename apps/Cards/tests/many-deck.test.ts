import test from 'node:test';
import assert from 'node:assert/strict';
import { assignIds, parseDeck } from '../src/core/deck/index.ts';
import type { Target } from '../src/core/deck/index.ts';
import { kindSingle } from './helpers/kinds.ts';
import { TOWNS } from './helpers/many.ts';
import { EDIT_CASES } from './helpers/source-edit-cases.ts';

// 一列好幾個答案的認法（tasks/matching-many.md §2、§3）：預期值照 §2 的邊界例子表手寫。

/** 一個目標：題目幾行（各自寫好縮排之後的內容），再接選項行；options 是 null 時沒有選項行。 */
const one = (answers: readonly string[], options: string | null = 'A;;B;;C;;D;;E', question = '這裡的名產有哪些？'): string =>
  ['- 能說出這裡的名產', ...answers.map(answer => `    - ${question} :: ${answer}`), ...options === null ? [] : [`    - 選項：${options}`], ''].join('\n');
const first = (text: string): Target => parseDeck(text).targets[0];
const hints = (text: string): string[] => parseDeck(text).problems.filter(p => p.code === 'options-invalid').map(p => p.message);
/** 認成單選，每一題的答案位置與 many。 */
function reads(text: string, answers: readonly (readonly number[])[], many: boolean): void {
  const single = kindSingle(first(text));
  assert.deepEqual(single && [single.answers, single.many], [answers, many], text);
  assert.deepEqual(hints(text), [], text);
}
/** 認不成：照原本的題型（問答），提示一次，訊息含 reason。 */
function fails(text: string, reason: string): void {
  const target = first(text);
  assert.equal(target.kind, undefined, text);
  assert.deepEqual(target.prompts.map(prompt => prompt.kind), target.prompts.map(() => 'qa'), text);
  const found = hints(text);
  assert.equal(found.length, 1, text);
  assert.ok(found[0].includes(reason), `${found[0]}｜${reason}`);
}

void test('§2 例子：一組三列、整組一列可以放好幾個；答案照寫的先後', () => {
  const deck = parseDeck(TOWNS);
  assert.deepEqual(deck.targets.map(target => { const single = kindSingle(target); return single && [target.id, single.answers, single.many]; }), [
    ['lukang', [[0, 3, 4]], true],
    ['dajia0', [[1]], true],
    ['waipu0', [[2, 3]], true],
  ]);
  assert.deepEqual(deck.problems, []);
});

void test('§2 表：;; 全半形混打、連打三個都切；重複的只留一個；空的丟掉', () => {
  for (const answer of ['A；；D', 'A;;;D', 'A；;D']) reads(one([answer]), [[0, 3]], true);
  reads(one(['A;;A;;D']), [[0, 3]], true);
  // 比對鍵相同的（大小寫、全半形、粗體）也是重複。
  reads(one(['A;;**a**;;Ｄ']), [[0, 3]], true);
  for (const answer of ['A;;', ';;A']) reads(one([answer]), [[0]], false);
});

void test('§2 表：切完是空的、有一項不在選項裡、少打一個分號或用頓號接', () => {
  fails(one([';;']), '答案是空的');
  fails(one(['A;;X']), '答案「X」不在選項裡，');
  for (const answer of ['A;D', 'A、D']) fails(one([answer]), `答案「${answer}」不在選項裡（答案好幾個時用 ;; 接）`);
  // 不在選項裡、也沒有分號或頓號：不多那一句。
  assert.ok(!hints(one(['X']))[0].includes('答案好幾個時'));
  // 註解不去掉：照寫的字比。
  fails(one(['A;;D %%備註%%']), '答案「D %%備註%%」不在選項裡');
});

void test('§2 表：選項裡有 A;D 時，答案 A;D 整串比', () => {
  reads(one(['A;D'], 'A;D;;B;;C'), [[0]], false);
});

void test('§2 表：選項的頭尾不能是分號（看比對鍵：粗體包住的、全形的也算）', () => {
  fails(one(['B'], 'A; ;; B;;C'), '選項的頭尾不能是分號');
  fails(one(['A;'], '**A;**;;A;;B'), '選項的頭尾不能是分號');
  fails(one(['B'], '；A;;B;;C'), '選項的頭尾不能是分號');
  fails(one(['B'], 'A;;B;;C；'), '選項的頭尾不能是分號');
  // 中間的分號是選項的字。
  reads(one(['A;D'], 'A;D;;B;;C'), [[0]], false);
});

void test('§2 表：選項行讀不成、答案有 ;;：問答，答案照字', () => {
  const text = one(['A;;D'], 'A;;B');
  fails(text, '選項至少要 3 個');
  const prompt = first(text).prompts[0];
  assert.equal(prompt.kind === 'qa' ? prompt.answer : null, 'A;;D');
});

void test('§2 表：沒有選項行，答案 A;;D 照字、不提示', () => {
  const text = one(['A;;D'], null);
  const target = first(text);
  assert.equal(target.kind, undefined);
  assert.deepEqual(target.prompts.map(prompt => prompt.kind === 'qa' ? prompt.answer : null), ['A;;D']);
  assert.deepEqual(parseDeck(text).problems, []);
});

void test('§2 表：答案是全部的選項，解析不擋', () => {
  reads(one(['A;;B;;C;;D;;E']), [[0, 1, 2, 3, 4]], true);
});

void test('§2 表：一個目標兩題，一題一個一題兩個是 many；一題兩個一題不在選項裡整個目標認不成', () => {
  reads(one(['B', 'A;;D']), [[1], [0, 3]], true);
  fails(one(['A;;D', 'X']), '答案「X」不在選項裡');
});

void test('§2 表：題幹有一個 ＿＿、答案好幾個', () => {
  reads(one(['A;;D'], undefined, '鹿港的名產有＿＿'), [[0, 3]], true);
});

void test('§3 many 是整組的：同一篇、同一組選項的都跟著；沒有 ID、暫停的也算；別組不受影響', () => {
  const text = [
    '- 能說出鹿港的名產',
    '    - 狀態：暫停',
    '    - 鹿港的名產有哪些？ :: A;;D',
    '    - 選項：A;;B;;C;;D',
    '- 能說出大甲的名產 ^dajia0',
    '    - 大甲的名產有哪些？ :: B',
    '    - 選項：**D**;;C;;B;;A',
    '- 能說出北部的海岸 ^coast0',
    '    - 北部的海岸是哪一種？ :: 岩岸',
    '    - 選項：岩岸;;沙岸;;斷層海岸',
    '',
  ].join('\n');
  assert.deepEqual(parseDeck(text).targets.map(target => kindSingle(target)?.many), [true, true, false]);
  // 只有大甲那一組（沒有答案好幾個的）：照第 1 段。
  assert.deepEqual(parseDeck(text.slice(text.indexOf('- 能說出大甲'))).targets.map(target => kindSingle(target)?.many), [false, false]);
});

void test('§2 格式查核：出處寫回的例子讀成一列好幾個，答案那一行不動', () => {
  const cases = EDIT_CASES.filter(each => each.name.startsWith('連連看：'));
  assert.equal(cases.length, 1);
  for (const text of [cases[0].text, cases[0].want as string]) {
    assert.deepEqual(kindSingle(parseDeck(text).targets[0])?.answers, [[0, 2]]);
    assert.ok(text.includes('    - Q :: A;;C\n'));
  }
});

void test('§2 格式查核：補 ID 與改縮排不動答案那一行，補完照樣是一列好幾個', () => {
  const bare = TOWNS.replace(/ \^\w+$/gm, '');
  const { text } = assignIds(bare, { taken: new Set(), random: () => 0.5 });
  const answerLines = (all: string): string[] => all.split('\n').filter(line => line.includes(' :: '));
  assert.deepEqual(answerLines(text), answerLines(TOWNS));
  assert.deepEqual(parseDeck(text).targets.map(target => kindSingle(target)?.many), [true, true, true]);
  assert.equal(assignIds(text, { taken: new Set(), random: () => 0.5 }).text, text);
  const crooked = '- 能說出鹿港的名產\n  - 鹿港的名產有哪些？ :: A;;D\n  - 選項：A;;B;;C;;D\n';
  const fixed = assignIds(crooked, { taken: new Set(), random: () => 0.5 }).text;
  assert.deepEqual(kindSingle(parseDeck(fixed).targets[0])?.answers, [[0, 3]]);
  assert.ok(fixed.includes(':: A;;D\n'));
});
