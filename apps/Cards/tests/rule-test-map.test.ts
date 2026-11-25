// 比較測試工具的學習地圖（tasks/rule-test-d236.md §5、§13 第 6 條）：切法、匿名、驗證、合併。自編的小例子，預期值是手寫的字面值。
import test from 'node:test';
import assert from 'node:assert/strict';
import { anonymousMap, cutMap, joinMaps, mergeMap, validateMap, type MapResult } from '../tools/rule-test/map.ts';
import type { RubricRow } from '../tools/rule-test/rubric.ts';

const REPLY = ['````markdown', '<<<全貌>>>', '- 這一課學借與還', '', '<<<架構>>>', '- 能分辨 borrow 與 lend', '    - 判準：誰是給的人', '', '<<<卡組>>>', '國二上英文 L3 單字', '- borrow 英翻中', '<<<完>>>', '````'].join('\r\n');

void test('cutMap：全貌到卡組之前，字不改、統一換行；少了標記或一段是空的記沒交', () => {
  assert.deepEqual(cutMap(REPLY), { ok: true, map: '<<<全貌>>>\n- 這一課學借與還\n\n<<<架構>>>\n- 能分辨 borrow 與 lend\n    - 判準：誰是給的人\n' });
  assert.deepEqual(cutMap('國二上英文 L3 單字\n- borrow 英翻中\n<<<完>>>'), { ok: false, why: '沒有照順序的 <<<全貌>>>、<<<架構>>>、<<<卡組>>>' });
  assert.deepEqual(cutMap('<<<全貌>>>\n\n<<<架構>>>\n- 有\n<<<卡組>>>\n'), { ok: false, why: '全貌是空的' });
  assert.deepEqual(cutMap('<<<全貌>>>\n- 有\n<<<架構>>>\n  \n<<<卡組>>>\n'), { ok: false, why: '架構是空的' });
  assert.equal(cutMap('<<<架構>>>\n- a\n<<<全貌>>>\n- b\n<<<卡組>>>\n').ok, false);
});

void test('joinMaps：多步的照順序接、每一步標第幾步；有一步沒交整份沒交', () => {
  const a = { ok: true as const, map: '<<<全貌>>>\n- 甲\n' }, b = { ok: true as const, map: '<<<全貌>>>\n- 乙\n' };
  assert.deepEqual(joinMaps([{ step: 1, cut: a }]), a);
  assert.deepEqual(joinMaps([{ step: 1, cut: a }, { step: 2, cut: b }]), { ok: true, map: '# 第 1 步\n\n<<<全貌>>>\n- 甲\n\n# 第 2 步\n\n<<<全貌>>>\n- 乙\n' });
  assert.deepEqual(joinMaps([{ step: 1, cut: a }, { step: 2, cut: { ok: false, why: '架構是空的' } }]), { ok: false, why: '第 2 步：架構是空的' });
});

void test('anonymousMap：只把兩個標記行換成標題', () => {
  assert.equal(anonymousMap('<<<全貌>>>\n- 甲 <<<全貌>>>\n  <<<架構>>>\n- 乙\n'), '## 全貌\n- 甲 <<<全貌>>>\n## 架構\n- 乙\n');
});

const ROWS: RubricRow[] = [
  { id: 'R1', kind: '必備', text: '借入', pages: 'p.1', equivalents: '', cross: '', basis: null },
  { id: 'R2', kind: '加分', text: '借出', pages: 'p.1', equivalents: '', cross: '加題 aaaaa2', basis: null },
  { id: 'M1', kind: '重大錯誤', text: '字義', pages: 'p.1', equivalents: '', cross: '', basis: null },
];
const MAP = ['## 全貌', '- 這一課學借與還', '', '## 架構', '- 能分辨 borrow 與 lend', '    - 判準：誰是給的人', '      東西從誰手上出去'];
const result = (verdicts: ('有' | '部分' | '沒有')[], issues: MapResult['issues'] = []): MapResult => ({
  rows: verdicts.map((verdict, i) => ({ row: `R${String(i + 1)}`, decks: [{ deck: 'S1', evidence: '', lines: verdict === '沒有' ? [] : [5], verdict }] })),
  issues, unsure: '',
});

void test('validateMap：每列每份一格、行號在地圖有字的行；錨點要是清單項或標題的開頭；接錯已有目標寫跨單元的列', () => {
  const context = { rows: ROWS, codes: ['S1'], maps: new Map([['S1', MAP]]) };
  assert.deepEqual(validateMap(result(['有', '沒有']), context), []);
  const bad: MapResult = {
    rows: [{ row: 'R1', decks: [{ deck: 'S1', evidence: '', lines: [3], verdict: '有' }] }],
    issues: [
      { deck: 'S1', kind: '判準不清', anchor: 7, lines: [6], rubric: '', note: '' },
      { deck: 'S1', kind: '接錯已有目標', anchor: 5, lines: [5], rubric: 'R1', note: '' },
      { deck: 'S1', kind: '分層錯', anchor: 4, lines: [9], rubric: '', note: '' },
    ],
    unsure: '',
  };
  assert.deepEqual(validateMap(bad, context), [
    '少了這幾列：R2',
    '列 R1 的 S1：行號 3 不是地圖裡有字的行',
    '問題第 1 筆（S1 判準不清）：錨點 7 要是那一項的第一行（清單項或標題的開頭）',
    '問題第 2 筆（S1 接錯已有目標）：rubric 要寫評分表「跨單元」有寫的列號',
    '問題第 3 筆（S1 分層錯）：行號 9 不是地圖裡有字的行',
  ]);
});

void test('mergeMap：逐列照合併表；同一種、同一個錨點的問題算一筆，兩位的證據行都留', () => {
  const codex = result(['有', '沒有'], [{ deck: 'S1', kind: '判準不清', anchor: 5, lines: [6], rubric: '', note: '甲' }]);
  const fable = result(['部分', '沒有'], [{ deck: 'S1', kind: '判準不清', anchor: 5, lines: [5], rubric: '', note: '乙' }, { deck: 'S1', kind: '分層錯', anchor: 5, lines: [5], rubric: '', note: '' }]);
  const merged = mergeMap('S1', new Map([['codex', codex], ['fable', fable]]));
  assert.deepEqual(merged.rows, { R1: '部分', R2: '沒有' });
  assert.deepEqual(merged.disagreements, ['R1']);
  assert.deepEqual(merged.issues.map(each => [each.kind, each.anchor, each.lines, each.judges]), [['判準不清', 5, [6, 5], ['codex', 'fable']], ['分層錯', 5, [5], ['fable']]]);
});
