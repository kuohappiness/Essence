import test from 'node:test';
import assert from 'node:assert/strict';
import { check } from '../src/core/ai/index.ts';

// 單選與配對的 AI 草稿檢查（tasks/matching-single-choice.md §6）：解析器只提示、照原本的題型出的，草稿算錯誤；本文、候選框、加進已有的框都擋。
// 每個代碼一個會中、一個不會中的例子；預期值手算（行號從 1 算）。
type Found = [level: string, line: number, code: string];
const CODES = ['options-invalid', 'options-all-none', 'which-of', 'shared-label'];
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

void test('which-of：有選項行的目標寫「下列」「以下何者」是錯誤；沒有選項行的照舊是提醒', () => {
  assert.deepEqual(found(draft('    - 下列何者是臺灣北部海岸的地形？ :: 岩岸', OPTIONS)), [['錯誤', 5, 'which-of']]);
  assert.deepEqual(found(draft('    - 以下何者是臺灣北部海岸的地形？ :: 岩岸', OPTIONS)), [['錯誤', 5, 'which-of']]);
  assert.deepEqual(found(draft('    - 下列何者是臺灣北部海岸的地形？ :: 岩岸')), [['提醒', 5, 'which-of']]);
  assert.deepEqual(found(draft('    - 以下何者是臺灣北部海岸的地形？ :: 岩岸')), []);
});
