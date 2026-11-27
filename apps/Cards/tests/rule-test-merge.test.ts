// 比較測試工具的合併兩位評審與兩兩比（tasks/rule-test-tool.md §6-2、§6-3、§8 第 11、13 條）。
import test from 'node:test';
import assert from 'node:assert/strict';
import type { JudgeResult } from '../tools/rule-test/judge.ts';
import { duplicateGroups, leakCandidates, mergeDeck, mergeVerdict, sameAt, twoPrompts, type MergedIssue, type Verdict } from '../tools/rule-test/merge.ts';
import { wins } from '../tools/rule-test/stats.ts';

void test('合併表 §6-2 的九格：兩位都有是有、都沒有是沒有（漏），其他都是部分', () => {
  const table: [Verdict, Verdict, Verdict][] = [
    ['有', '有', '有'], ['有', '部分', '部分'], ['有', '沒有', '部分'],
    ['部分', '有', '部分'], ['部分', '部分', '部分'], ['部分', '沒有', '部分'],
    ['沒有', '有', '部分'], ['沒有', '部分', '部分'], ['沒有', '沒有', '沒有'],
  ];
  for (const [codex, fable, merged] of table) assert.equal(mergeVerdict(codex, fable), merged, `${codex}＋${fable}`);
});

// 第 2 行是只有一題的目標，第 5 行是有兩題的目標（第 6、7 行是題）。
const DECK = ['國二上英文 L3 單字', '- borrow 英翻中', '    - borrow :: v. 借入', '        - 詳解', '- lend 的用法', '    - lend 英翻中 :: 借出', '    - 我把書 ==借給== 他', ''].join('\n');
const result = (verdicts: Verdict[], issues: JudgeResult['issues']): JudgeResult => ({
  pages: [],
  rows: verdicts.map((verdict, i) => ({ row: `R${String(i + 1)}`, decks: [{ deck: 'S1', evidence: '', lines: verdict === '沒有' ? [] : [2], verdict }] })),
  issues,
  unsure: '',
});
const issue = (kind: JudgeResult['issues'][number]['kind'], lines: number[], rubric = ''): JudgeResult['issues'][number] => ({ deck: 'S1', kind, lines, rubric, note: kind });

void test('合併一份卡組：逐列照合併表、列出歧見；問題用 parseDeck 歸到題去重，另記兩位都記或只有一位記', () => {
  const codex = result(['有', '有', '沒有'], [
    issue('判錯', [2]), // 名稱行，只有一題的目標＝第 3 行那一題
    issue('洩漏', [6]),
    issue('近義重複', [3, 6]),
    issue('重大錯誤', [7], 'M1'),
    issue('值得學', [5]),
  ]);
  const fable = result(['有', '沒有', '沒有'], [
    issue('判錯', [4]), // 詳解行，歸第 3 行那一題：和 Codex 的同一筆
    issue('洩漏', [7]), // 同一個目標的另一題：不是同一筆
    issue('近義重複', [6, 2]), // 同一對，順序相反
    issue('跨單元去向', [5], 'R2'),
  ]);
  const merged = mergeDeck('S1', DECK, new Map([['codex', codex], ['fable', fable]]));
  assert.deepEqual(merged.rows, { R1: '有', R2: '部分', R3: '沒有' });
  assert.deepEqual(merged.disagreements, ['R2']);
  assert.equal(merged.worthLearning, 1);
  assert.deepEqual(merged.issues.map(each => [each.kind, each.at.join('＋'), each.judges.join('、')]), [
    ['判錯', '目標 1 第 1 題', 'codex、fable'],
    ['洩漏', '目標 2 第 1 題', 'codex'],
    ['近義重複', '目標 1 第 1 題＋目標 2 第 1 題', 'codex、fable'],
    ['重大錯誤', '目標 2 第 2 題', 'codex'],
    ['洩漏', '目標 2 第 2 題', 'fable'],
    ['跨單元去向', '目標 2', 'fable'],
  ]);
});

void test('有兩題的目標：名稱行和其中一題算同一筆；同一位記兩次也只算一筆', () => {
  const codex = result(['有'], [issue('一題多事', [5]), issue('一題多事', [6])]);
  const fable = result(['有'], [issue('一題多事', [6])]);
  const merged = mergeDeck('S1', DECK, new Map([['codex', codex], ['fable', fable]]));
  assert.deepEqual(merged.issues.map(each => [each.kind, each.at.join('＋'), each.judges.join('、'), each.lines.join(',')]), [['一題多事', '目標 2', 'codex、fable', '5,6']]);
});

void test('裁定改記時「同一題」（§3 去重）：比合併定下的位置，和合併同一條規則；名稱行和題目行兩個方向都算，同一個目標的兩題不算', () => {
  const cases: [string | undefined, string | undefined, boolean][] = [
    ['目標 2', '目標 2 第 1 題', true], ['目標 2 第 1 題', '目標 2', true], ['目標 2 第 1 題', '目標 2 第 2 題', false],
    ['目標 2', '目標 20 第 1 題', false], ['第 1 行', '第 1 行', true], ['第 1 行', '第 12 行', false], [undefined, '目標 2', false],
  ];
  for (const [a, b, expected] of cases) assert.equal(sameAt(a, b), expected, `${String(a)} 對 ${String(b)}`);
  // 整類：兩位各記一筆（行號 a、b）合併之後，第三筆（c，裁定改記的那一筆）照 sameAt 算不算已經有，
  // 要和那一筆一開始就記成同一種、跟著合併時的筆數一樣（L2 第 3 輪 1：不能從合併後的行號聯集重推位置）。
  // DECK：第 1 行標題（目標外），第 2 行只有一題的目標（第 3 行是題、第 4 行是它的詳解），第 5 行有兩題的目標（第 6、7 行）。
  const sets = [[1], [2], [3], [4], [5], [6], [7], [2, 3], [5, 6], [6, 5], [6, 7], [3, 6]];
  const merge = (...lines: number[][]): ReturnType<typeof mergeDeck> => mergeDeck('S1', DECK, new Map(lines.map((each, i) => [`評審${String(i)}`, result([], [issue('判錯', each)])])));
  for (const a of sets) for (const b of sets) for (const c of sets) {
    const two = merge(a, b), lone = merge(c).issues[0].at[0];
    const relabeled = two.issues.length + (two.issues.some(each => sameAt(each.at[0], lone)) ? 0 : 1);
    assert.equal(relabeled, merge(a, b, c).issues.length, `${a.join('、')}／${b.join('、')}／${c.join('、')}`);
  }
  // 第 3 輪的反例：6 與 5（名稱行）合併成第 6 行那一題，第 7 行是另一題。
  assert.equal(merge([6], [5]).issues.some(each => sameAt(each.at[0], merge([7]).issues[0].at[0])), false);
});

void test('引言框（候選卡片、加進已有的學習目標）裡的題分開算；目標範圍外的行（框的標題、備註）不歸給前一題（PR #54 Codex P2）', () => {
  const boxed = [
    '國二上英文 L3 單字', '- borrow 英翻中', '    - borrow :: v. 借入', '',
    '> [!note]- 候選卡片', '> - lend 英翻中', '>     - 理由：課本只出現一次', '>     - lend :: 借出', '> - keep 英翻中', '>     - keep :: 保持', '',
    '給家長：候選卡片是補充的',
  ].join('\n');
  // 第 8 行、第 10 行是框裡兩個不同的目標的題；第 5 行是框的標題，第 12 行是框外的備註。
  const codex = result([], [issue('重大錯誤', [8]), issue('小問題', [5])]);
  const fable = result([], [issue('重大錯誤', [10]), issue('小問題', [12])]);
  const merged = mergeDeck('S1', boxed, new Map([['codex', codex], ['fable', fable]]));
  assert.deepEqual(merged.issues.map(each => [each.kind, each.at, each.judges]), [
    ['重大錯誤', ['目標 2 第 1 題'], ['codex']],
    ['小問題', ['第 5 行'], ['codex']],
    ['重大錯誤', ['目標 3 第 1 題'], ['fable']],
    ['小問題', ['第 12 行'], ['fable']],
  ]);
});

void test('兩兩比：數候選贏幾場（平手算半場）', () => {
  assert.equal(wins([1, 2, 3], [2, 4, 4]), 7.5);
});

void test('近義重複（rule-test-d236.md §4）：兩行要是兩道不同的題；共用一題的對併成一組，多餘的題＝每組題數減一加總', () => {
  // 第 3 行是目標 1 的題，第 6、7 行是目標 2 的兩題；第 5 行是目標 2 的名稱行，第 4 行是第 3 行那一題的詳解。
  assert.equal(twoPrompts(DECK, [3, 6]), true);
  assert.equal(twoPrompts(DECK, [6, 7]), true);
  assert.equal(twoPrompts(DECK, [3, 4]), false); // 同一題
  assert.equal(twoPrompts(DECK, [5, 6]), false); // 名稱行
  assert.equal(twoPrompts(DECK, [3]), false);
  assert.equal(twoPrompts(DECK, [3, 6, 7]), false);
  const chain = [['1', '2'], ['2', '3'], ['3', '4'], ['4', '5'], ['5', '6']];
  assert.deepEqual(duplicateGroups(chain), { groups: 1, extra: 5 });
  assert.deepEqual(duplicateGroups([['a', 'b'], ['c', 'd'], ['b', 'a']]), { groups: 2, extra: 2 });
  assert.deepEqual(duplicateGroups([]), { groups: 0, extra: 0 });
});

void test('程式找的洩漏候選（rule-test-d236.md §18）：只比同一題，答案原樣出現在自己的題幹才列；別一題的題幹有這個答案不算；評審記過的不列', () => {
  const deck = [
    '國二上英文 L3 單字',
    '- borrow 的用法',
    '    - borrow 英翻中 :: **借入**',
    '    - 「借入」的英文 :: borrow',
    '- lend 怎麼拼',
    '    - 「借出」的英文 lend 怎麼拼？ :: lend',
    '- lend 的句子',
    '    - I ==lend== him my book. (lend：借出)',
    '- 短的答案',
    '    - I 是第幾人稱？ :: I',
    '',
  ].join('\n');
  // 第 1 個目標兩題互相有對方的答案：別一題的不算。第 2 個目標問答題、第 3 個目標填空題挖空之後，題幹還有自己的答案。第 4 個目標的答案只有一個字，不比。
  assert.deepEqual(leakCandidates(deck, []), ['目標 2 第 1 題的題幹有自己的答案', '目標 3 第 1 題的題幹有自己的答案']);
  const recorded = (at: string): MergedIssue => ({ kind: '洩漏', at: [at], lines: [], judges: ['甲'], rubric: '', notes: [''] });
  assert.deepEqual(leakCandidates(deck, [recorded('目標 2 第 1 題'), recorded('目標 3')]), []);
  // 記在別的目標的洩漏不擋這一題（L2 §17 第 2 輪 P3-6）。
  assert.deepEqual(leakCandidates(deck, [recorded('目標 1 第 1 題')]), ['目標 2 第 1 題的題幹有自己的答案', '目標 3 第 1 題的題幹有自己的答案']);
  // 不分大小寫；挖空之後句子裡沒有答案的填空題不列。
  const more = ['國二上英文 L3 單字', '- borrow 的拼法', '    - BORROW 寫成小寫是什麼？ :: borrow', '- lend 的句子', '    - She ==lends== me a pen.', ''].join('\n');
  assert.deepEqual(leakCandidates(more, []), ['目標 1 第 1 題的題幹有自己的答案']);
});
