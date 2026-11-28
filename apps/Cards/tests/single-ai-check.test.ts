import test from 'node:test';
import assert from 'node:assert/strict';
import { check, inspectReply, RULE_SUBJECTS } from '../src/core/ai/index.ts';
import type { CardForm, ExistingNow, ExistingTarget } from '../src/core/ai/index.ts';

// 單選與配對的 AI 草稿檢查（tasks/matching-single-choice.md §6）：解析器只提示、照原本的題型出的，草稿算錯誤；本文、候選框、加進已有的框都擋。
// 每個代碼一個會中、一個不會中的例子；預期值手算（行號從 1 算）。
type Found = [level: string, line: number, code: string];
const CODES = ['options-invalid', 'options-all-none', 'which-of', 'shared-label', 'single-leak'];
const found = (text: string): Found[] => check(text, { subject: '社會' }).issues
  .filter(each => CODES.includes(each.code))
  .map(each => [each.level, each.line, each.code]);
const OPTIONS = '    - 選項：岩岸、沙岸、斷層海岸、珊瑚礁海岸';
/** 一份稿：小標題（第 1 行）、名稱（第 3 行）、出處（第 4 行）、題目（第 5 行）、其餘從第 6 行起。 */
const draft = (question = '    - 臺灣北部的海岸是哪一種海岸？ :: 岩岸', ...rest: string[]): string =>
  ['## 臺灣的海岸', '', '- 能說出臺灣北部海岸的地形', '    - 出處：p.42', question, ...rest].join('\n') + '\n';

void test('照規則寫的單選：沒有任何發現；選項行不報「不是資料欄位」，別的名稱照報', () => {
  assert.deepEqual(found(draft(undefined, OPTIONS)), []);
  assert.deepEqual(found(draft(undefined, OPTIONS, '    - 例子：野柳')), [['提醒', 7, 'shared-label']]);
  // 半形冒號不是選項行：照原本的題型出，也照報不是資料欄位。
  assert.deepEqual(found(draft(undefined, '    - 選項:岩岸、沙岸、斷層海岸')), [['提醒', 6, 'shared-label'], ['錯誤', 6, 'options-invalid']]);
});

void test('options-invalid（錯誤）：選項讀不成、答案不在選項裡、寫在資料那一行或縮在出處底下', () => {
  assert.deepEqual(found(draft(undefined, '    - 選項：岩岸、沙岸')), [['錯誤', 6, 'options-invalid']]);
  assert.deepEqual(found(draft('    - 臺灣北部的海岸是哪一種海岸？ :: 岬灣', OPTIONS)), [['錯誤', 6, 'options-invalid']]);
  assert.deepEqual(found(draft(undefined, OPTIONS, OPTIONS)), [['錯誤', 7, 'options-invalid']]);
  assert.deepEqual(found(['## 臺灣的海岸', '', '- 能說出臺灣北部海岸的地形', '    - 出處：p.42｜選項：岩岸、沙岸、斷層海岸', '    - 臺灣北部的海岸是哪一種海岸？ :: 岩岸', ''].join('\n')), [['錯誤', 4, 'options-invalid']]);
  assert.deepEqual(found(['## 臺灣的海岸', '', '- 能說出臺灣北部海岸的地形', '    - 出處：p.42', '        - 選項：岩岸、沙岸、斷層海岸', '    - 臺灣北部的海岸是哪一種海岸？ :: 岩岸', ''].join('\n')), [['錯誤', 5, 'options-invalid']]);
});

void test('options-invalid（錯誤）：候選框與加進已有的框也擋，同一行只報一次', () => {
  // 本文第 1～6 行，第 7 行空行，框從第 8 行起：名稱第 9 行，選項行在候選框第 13 行、加進已有的框第 12 行。
  const candidate = draft(undefined, OPTIONS) + ['', '> [!note]- 候選卡片', '> - 能說出臺灣東部海岸的地形', '>     - 理由：x', '>     - 出處：p.42', '>     - 臺灣東部的海岸是哪一種海岸？ :: 斷層海岸', '>     - 選項：斷層海岸、岩岸', ''].join('\n');
  assert.deepEqual(found(candidate), [['錯誤', 13, 'options-invalid']]);
  const existing = draft(undefined, OPTIONS) + ['', '> [!note] 加進已有的學習目標', '> - q8z3ka 能說出臺灣東部海岸的地形', '>     - 出處：p.43', '>     - 臺灣東部的海岸是哪一種海岸？ :: 斷層海岸', '>     - 選項：斷層海岸、岩岸', ''].join('\n');
  assert.deepEqual(found(existing), [['錯誤', 12, 'options-invalid']]);
  // 寫對的加進已有：不報。
  assert.deepEqual(found(existing.replace('選項：斷層海岸、岩岸', '選項：岩岸、沙岸、斷層海岸、珊瑚礁海岸')), []);
});

void test('options-all-none（錯誤）：選項有「以上皆是」「以上皆非」', () => {
  assert.deepEqual(found(draft(undefined, '    - 選項：岩岸、沙岸、以上皆非')), [['錯誤', 3, 'options-all-none']]);
  assert.deepEqual(found(draft('    - 野柳是哪一種海岸？ :: 以上皆是', '    - 選項：岩岸、沙岸、以上皆是')), [['錯誤', 3, 'options-all-none']]);
});

void test('options-all-none（錯誤）：加進已有的框也擋（L2 第一輪 R5），報在名稱那一行；只補選項行的也一樣', () => {
  const box = (...rest: string[]): string => draft(undefined, OPTIONS) + ['', '> [!note] 加進已有的學習目標', '> - q8z3ka 能說出臺灣東部海岸的地形', ...rest, ''].join('\n');
  assert.deepEqual(found(box('>     - 臺灣東部的海岸是哪一種海岸？ :: 斷層海岸', '>     - 選項：岩岸、斷層海岸、以上皆是')), [['錯誤', 9, 'options-all-none']]);
  assert.deepEqual(found(box('>     - 選項：岩岸、斷層海岸、以上皆非')), [['錯誤', 9, 'options-all-none']]);
  assert.deepEqual(found(box('>     - 選項：岩岸、沙岸、斷層海岸')), []);
});

void test('which-of：有選項行的目標寫「下列」「以下何者」是錯誤；沒有選項行的照舊是提醒', () => {
  assert.deepEqual(found(draft('    - 下列何者是臺灣北部海岸的地形？ :: 岩岸', OPTIONS)), [['錯誤', 5, 'which-of']]);
  assert.deepEqual(found(draft('    - 以下何者是臺灣北部海岸的地形？ :: 岩岸', OPTIONS)), [['錯誤', 5, 'which-of']]);
  assert.deepEqual(found(draft('    - 下列何者是臺灣北部海岸的地形？ :: 岩岸')), [['提醒', 5, 'which-of']]);
  assert.deepEqual(found(draft('    - 以下何者是臺灣北部海岸的地形？ :: 岩岸')), []);
});

// 整份回覆照家長貼回的路走（inspectReply）：社會的三段，卡組段有一個新目標，加進已有的框是 existing 的那幾行。
const FORM: CardForm = { subject: 'social', term: '五上', unit: '2-1 臺灣的海岸', purpose: '準備段考', supplement: false, pick: true, adjust: '', material: '' };
const SOCIAL = RULE_SUBJECTS.find(each => each.key === 'social')!;
const SENT: ExistingTarget[] = [{ id: 'q8z3ka', name: '能說出臺灣東部海岸的地形', source: '五上 2-1 p.43', path: 'Essence Cards/學業/五上/社會/2-1.md', first: '臺灣東部的海岸是哪一種海岸？ :: 斷層海岸' }];
const here = (): ExistingNow => ({ kind: 'none' });
const reply = (...existing: string[]): string => ['<<<全貌>>>', '## 知識塊', '', '- 海岸：四部各不同', '<<<架構>>>', '## 學習目標', '',
  '- T01｜①｜能說出臺灣北部海岸的地形', '<<<卡組>>>', '## 2-1 臺灣的海岸', '', '- 能說出臺灣北部海岸的地形', '    - 出處：p.42', '    - 臺灣北部的海岸是哪一種海岸？ :: 岩岸', OPTIONS, '',
  '> [!note] 加進已有的學習目標', '> - q8z3ka 能說出臺灣東部海岸的地形', ...existing, '<<<完>>>', ''].join('\n');

void test('加進已有的框只補一行選項行（L2 第一輪 R4）：草稿存得了；連題目都沒有、也沒有選項行的照舊擋', () => {
  const only = inspectReply(reply('>     - 選項：岩岸、沙岸、斷層海岸、珊瑚礁海岸'), FORM, SOCIAL, SENT, here);
  assert.equal(only.ended, true);
  assert.deepEqual(only.errors, []);
  const empty = inspectReply(reply('>     - 出處：p.43'), FORM, SOCIAL, SENT, here);
  assert.equal(empty.errors.length, 1);
  assert.match(empty.errors[0].message, /縮排或清單符號/);
});

void test('single-leak（錯誤）：有選項行的題目寫出這一題自己的答案；寫到別的選項、一個字的答案、沒有選項行的不算', () => {
  assert.deepEqual(found(draft('    - 臺灣北部常見岩岸，是哪一種海岸？ :: 岩岸', OPTIONS)), [['錯誤', 5, 'single-leak']]);
  assert.deepEqual(found(draft('    - 臺灣北部常見**岩岸**，是哪一種海岸？ :: 岩岸', OPTIONS)), [['錯誤', 5, 'single-leak']]);
  assert.deepEqual(found(draft('    - 不像東部的斷層海岸，北部是哪一種海岸？ :: 岩岸', OPTIONS)), []);
  assert.deepEqual(found(draft('    - 臺灣北部常見岩岸，是哪一種海岸？ :: 岩岸')), []);
  assert.deepEqual(found(draft('    - 東北角在臺灣哪一部？ :: 東', '    - 選項：東、西、南、北')), []);
});
