import test from 'node:test';
import assert from 'node:assert/strict';
import { check } from '../src/core/ai/index.ts';

// AI 草稿的檢查比解析嚴（tasks/english-typed-order.md §5）：只在英文的草稿；文法與變化要能打字、題幹一個 ＿＿，英文的排序卡要認得出來。
const issuesOf = (text: string, subject = '英文') => check(text, { subject }).issues.filter(each => each.code.startsWith('english-') || each.code.startsWith('typed-'));
const codes = (text: string, subject = '英文'): string[] => issuesOf(text, subject).filter(each => each.level === '錯誤').map(each => each.code);

void test('文法與變化：讀不成打字、填空題、字數不同、不是恰好一個 ＿＿ 都是錯誤；讀得成的不報', () => {
  assert.deepEqual(codes('- go 過去式\n    - Yesterday I ＿＿ to school.（去） :: 去了\n'), ['typed-answer-invalid']);
  assert.deepEqual(codes('- 被動語態 文法\n    - The window ==was broken== yesterday.\n'), ['english-typed-invalid']);
  assert.deepEqual(codes('- 動名詞（當主詞） 文法\n    - ＿＿ movies is fun. (watch) :: Watching | To watch\n'), ['english-typed-invalid']);
  assert.deepEqual(codes('- go 過去式\n    - Yesterday I went to school. :: went\n'), ['english-typed-invalid']);
  assert.deepEqual(codes('- go 過去式\n    - Yesterday I ＿＿ to school.（去） :: went\n'), []);
});

void test('別科的草稿不套英文的規則', () => {
  assert.deepEqual(codes('- 能化簡 複數\n    - i² = ＿＿ :: -1\n', '數學'), []);
});

void test('英文的排序卡認不出來是錯誤：只有一格；標點包進最後一格照樣認得；全詩不報', () => {
  assert.deepEqual(codes('- 間接問句 排序\n    - 我不知道他住在哪裡。I don\'t know ==where== he lives.\n'), ['english-order-invalid']);
  assert.deepEqual(codes('- 間接問句 排序\n    - 我不知道他住在哪裡。I don\'t know ==where== ==he== ==lives==.\n'), []);
  assert.deepEqual(codes('- 間接問句 排序\n    - 我不知道他住在哪裡。I don\'t know ==where== ==he== ==lives.==\n'), []);
  assert.deepEqual(codes('- Twinkle 全詩 排序\n    - ==Twinkle, twinkle==, ==little star==.\n'), []);
});

void test('句子開頭那格大寫是提醒；I、全大寫、句子中間的不提醒', () => {
  const capital = (question: string) => issuesOf(`- 疑問句 排序\n    - ${question}\n`).map(each => [each.level, each.code]);
  assert.deepEqual(capital('他住在哪裡？==Where== ==does== ==he== ==live==?'), [['提醒', 'english-order-capital']]);
  assert.deepEqual(capital('他住在哪裡？==where== ==does== ==he== ==live==?'), []);
  assert.deepEqual(capital('我沒有生氣。==I== ==am== ==not== angry.'), []);
  assert.deepEqual(capital('==TV== ==is== ==fun==.'), []);
});

void test('候選卡片裡的英文目標也照英文的規則擋（L2 R2），行號是原文的行', () => {
  const body = '- go 過去式\n    - Yesterday I ＿＿ to school.（去） :: went\n\n> [!note]- 候選卡片\n> - 被動語態 文法\n>     - 理由：課本補充\n>     - The window ==was broken== yesterday.\n> - 間接問句 排序\n>     - 理由：課本補充\n>     - I know ==where== he lives.\n';
  const found = check(body, { subject: '英文' }).issues.filter(each => each.level === '錯誤' && each.code.startsWith('english-')).map(each => [each.line, each.code]);
  assert.deepEqual(found, [[7, 'english-typed-invalid'], [8, 'english-order-invalid']]);
});
