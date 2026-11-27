import test from 'node:test';
import assert from 'node:assert/strict';
import { check } from '../src/core/ai/index.ts';

// AI 草稿的檢查比解析嚴（tasks/english-typed-order.md §5）：只在英文的草稿；文法與變化要能打字、題幹一個 ＿＿，英文的排序卡要認得出來。
const issuesOf = (text: string, subject = '英文') => check(text, { subject }).issues.filter(each => each.code.startsWith('english-') || each.code.startsWith('typed-'));
const codes = (text: string, subject = '英文'): string[] => issuesOf(text, subject).filter(each => each.level === '錯誤').map(each => each.code);

void test('文法與變化：讀不成打字、填空題、不是恰好一個 ＿＿ 都是錯誤；讀得成的（含字數不同的好幾個答案，D-237）不報', () => {
  assert.deepEqual(codes('- go 過去式\n    - Yesterday I ＿＿ to school.（去） :: 去了\n'), ['typed-answer-invalid']);
  assert.deepEqual(codes('- 被動語態 文法\n    - The window ==was broken== yesterday.\n'), ['english-typed-invalid']);
  assert.deepEqual(codes('- 動名詞（當主詞） 文法\n    - ＿＿ movies is fun. (watch) :: Watching | To watch\n'), []);
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

// 另一種排法（tasks/sentence-order-alternatives.md §6）：解析器的兩個提示在草稿都是錯誤，本文、候選框、已有框都擋，不分科。
const altErrors = (text: string, subject = '英文'): [number, string][] => check(text, { subject }).issues.filter(each => each.level === '錯誤' && (each.code.startsWith('order-alt-') || each.code.startsWith('english-order'))).map(each => [each.line, each.code]);
const BECAUSE = 'I was tired. I went to bed early.（用 because 合成一句）==I went to bed early== ==because== ==I was tired==.';
const sentence = (...extras: string[]): string[] => ['- 用 because 合成一句 排序 ^a1b2c3', '    - ' + BECAUSE, ...extras.map(extra => '        - ' + extra)];

void test('另一種排法：認得的不報；不認、少縮一層、排錯的太少在本文是錯誤；別科的題目底下寫了也是錯誤', () => {
  assert.deepEqual(altErrors(sentence('另一種排法：==because== ==I was tired==, ==I went to bed early==.').join('\n') + '\n'), []);
  assert.deepEqual(altErrors(sentence('另一種排法：==Because== ==I was tired==, ==I went to bed early==.').join('\n') + '\n'), [[2, 'order-alt-invalid']]);
  assert.deepEqual(altErrors(sentence().join('\n') + '\n    - 另一種排法：==because== ==I was tired==, ==I went to bed early==.\n'), [[3, 'order-alt-invalid']]);
  assert.deepEqual(altErrors('- 時間的位置 排序\n    - 我們明天中午見。See you ==tomorrow== ==at noon==.\n        - 另一種排法：See you ==at noon== ==tomorrow==.\n'), [[2, 'order-alt-all-right']]);
  assert.deepEqual(altErrors('- 鳥鳴澗 排序\n    - ==人閒桂花落==，==夜靜春山空==。\n        - 另一種排法：==夜靜春山空==，==人閒桂花落==。\n', '國文'), [[2, 'order-alt-invalid']]);
  // L2 第一輪 R2、R3：底下有資料欄位、寫在詳解底下也是錯誤。
  const alt = '另一種排法：==because== ==I was tired==, ==I went to bed early==.';
  assert.deepEqual(altErrors([...sentence(alt), '            - 狀態：暫停'].join('\n') + '\n'), [[2, 'order-alt-invalid']]);
  assert.deepEqual(altErrors([...sentence('詳解：連接詞放前面時中間加逗號'), '            - ' + alt].join('\n') + '\n'), [[4, 'order-alt-invalid']]);
});

void test('另一種排法：候選框與已有框也擋，行號是原文的行；已有框也跑英文的排序檢查', () => {
  const box = (title: string, lines: readonly string[]): string => [`> [!note]- ${title}`, ...lines.map(line => '> ' + line)].join('\n') + '\n';
  const body = '- go 過去式\n    - Yesterday I ＿＿ to school.（去） :: went\n\n';
  const bad = sentence('另一種排法：==because I was tired==, ==I went to bed early==.');
  assert.deepEqual(altErrors(body + box('候選卡片', [bad[0], '    - 理由：課本補充', ...bad.slice(1)])), [[7, 'order-alt-invalid']]);
  assert.deepEqual(altErrors(body + box('加進已有的學習目標', bad)), [[6, 'order-alt-invalid']]);
  assert.deepEqual(altErrors(body + box('加進已有的學習目標', ['- 間接問句 排序 ^d4e5f6', '    - I know ==where== he lives.'])), [[5, 'english-order-invalid']]);
});
