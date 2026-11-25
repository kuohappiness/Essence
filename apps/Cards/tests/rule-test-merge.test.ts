// 比較測試工具的合併兩位評審與兩兩比（tasks/rule-test-tool.md §6-2、§6-3、§8 第 11、13 條）。
import test from 'node:test';
import assert from 'node:assert/strict';
import type { JudgeResult } from '../tools/rule-test/judge.ts';
import { duplicateGroups, mergeDeck, mergeVerdict, twoPrompts, type Verdict } from '../tools/rule-test/merge.ts';
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
