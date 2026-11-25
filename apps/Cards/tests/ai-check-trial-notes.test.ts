import test from 'node:test';
import assert from 'node:assert/strict';
import { check } from '../src/core/ai/index.ts';

// 國小社會 3-1、3-2 試用看到的兩個誤報（Cards backlog，2026-11-23 試用紀錄）：預期值手算。
const codes = (text: string, code: string): number[] => check(text, { subject: '社會' }).issues.filter(each => each.code === code).map(each => each.line);
const TARGET = ['- 能說出臺灣原住民族正名的經過', '    - 出處：p.40', '    - 原住民族正名是在哪一年？ :: 民國 83 年'];

void test('給家長的備註寫「一般常聽到」「一般說法」：是說法不一致，不提醒只寫三種事；其他的事照樣提醒', () => {
  const draft = (note: string): string => ['> [!note] 給家長的備註', `> - ${note}`, '', ...TARGET].join('\n') + '\n';
  assert.deepEqual(codes(draft('課本寫民國八十六年，一般常聽到的是 83 年正名'), 'note-kind'), []);
  assert.deepEqual(codes(draft('講義的年份和一般說法差三年，題目照課本'), 'note-kind'), []);
  assert.deepEqual(codes(draft('這一課的內容比較多，可以分兩天'), 'note-kind'), [2]);
});

void test('「晒」不算常見簡體字形（康軒課本就寫晒）；「晓」照樣算', () => {
  const draft = (answer: string): string => [...TARGET.slice(0, 2), `    - 農民把稻穀放在哪裡？ :: ${answer}`].join('\n') + '\n';
  assert.deepEqual(codes(draft('在曬穀場晒乾'), 'simplified'), []);
  assert.deepEqual(codes(draft('大家都知晓'), 'simplified'), [1]);
});
