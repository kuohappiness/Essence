import test from 'node:test';
import assert from 'node:assert/strict';
import { check } from '../src/core/ai/index.ts';

// 多音字的 AI 草稿檢查（tasks/polyphone-pick.md §5）：比解析嚴，本文與候選都檢查；每個代碼一個會中、一個不會中的例子。預期值手算。
type Found = [level: string, line: number, code: string];
const found = (text: string, subject = '國語'): Found[] => check(text, { subject }).issues
  .filter(each => each.code.startsWith('choice-') || each.code.startsWith('pick-') || ['too-many-questions', 'target-name'].includes(each.code))
  .map(each => [each.level, each.line, each.code]);
const ANCHOR = ['    - 記憶錨點：', '        - ㄓㄤˇ：長大、帶頭的人：成長、班長', '        - ㄔㄤˊ：距離或時間久：長短、很長'];
const SIX = [
  '    - 他長（＿＿）得比哥哥高。 :: ㄓㄤˇ',
  '    - 小樹苗慢慢長（＿＿）大了。 :: ㄓㄤˇ',
  '    - 他是我們班的班長（＿＿）。 :: ㄓㄤˇ',
  '    - 這條路很長（＿＿）。 :: ㄔㄤˊ',
  '    - 夏天的白天比較長（＿＿）。 :: ㄔㄤˊ',
  '    - 妹妹留著一頭長（＿＿）髮。 :: ㄔㄤˊ',
];
/** 一份稿：小標題、名稱（第 3 行）、出處（第 4 行）、記憶錨點（第 5～7 行）、題目從第 8 行起。 */
const draft = (name: string, sentences: readonly string[] = SIX, anchor: readonly string[] = ANCHOR): string => ['## 讀音', '', `- ${name}`, '    - 出處：p.20', ...anchor, ...sentences].join('\n') + '\n';
const NAME = '長（ㄓㄤˇ、ㄔㄤˊ） 讀音';

void test('照預設寫的多音字：沒有任何發現；六句不算三題上限，名稱不用寫成「能……」', () => {
  assert.deepEqual(found(draft(NAME)), []);
});

void test('choice-invalid（錯誤）：讀音結尾、有括號，卻讀不成或混了別的；pick-* 不重複報', () => {
  assert.deepEqual(found(draft('長（ㄓㄤˇ） 讀音')), [['錯誤', 3, 'choice-invalid']]);
  assert.deepEqual(found(draft(NAME, [...SIX.slice(0, 5), '    - 「長」有幾種念法？ :: 兩種'])), [['錯誤', 13, 'choice-invalid']]);
  assert.deepEqual(found(draft(NAME, ['    - 他長__得比哥哥高。 :: ㄓㄤˇ'])), [['錯誤', 3, 'choice-invalid']]);
  // 沒有括號的讀音卡是翻面：不是多音字，照一般目標。
  assert.deepEqual(found(draft('長 讀音', ['    - 「他長得高」的長怎麼念？ :: ㄓㄤˇ'], [])), [['不符', 3, 'target-name']]);
});

void test('choice-ambiguous（錯誤）：加進已有的學習目標裡，同一批的同一句配兩個讀音也報（PR #53 的 Codex 審查）；和原本的句子比在寫入時', () => {
  // 本文第 1～13 行，第 14 行空行，框從第 15 行起：名稱第 16 行、出處第 17 行、題目第 18 行起。
  const box = (...sentences: string[]): string => draft(NAME) + ['', '> [!note] 加進已有的學習目標', `> - q8z3ka ${NAME}`, '>     - 出處：p.21', ...sentences.map(each => '>' + each)].join('\n') + '\n';
  assert.deepEqual(found(box('     - 小樹苗慢慢長（＿＿）大了。 :: ㄓㄤˇ', '     - 小樹苗慢慢**長**（＿＿）大了。 :: ㄔㄤˊ')), [['錯誤', 18, 'choice-ambiguous'], ['錯誤', 19, 'choice-ambiguous']]);
  assert.deepEqual(found(box('     - 小樹苗慢慢長（＿＿）大了。 :: ㄓㄤˇ', '     - 這條路很長（＿＿）。 :: ㄔㄤˊ')), []);
  // 底線數不同畫面上是同一句（L2 R2）。
  assert.deepEqual(found(box('     - 小樹苗慢慢長（＿）大了。 :: ㄓㄤˇ', '     - 小樹苗慢慢長（＿＿＿）大了。 :: ㄔㄤˊ')), [['錯誤', 18, 'choice-ambiguous'], ['錯誤', 19, 'choice-ambiguous']]);
});

void test('choice-ambiguous（錯誤）：同一個題幹配兩個讀音；題幹不同不報', () => {
  const twice = [...SIX.slice(0, 5), '    - 他長（＿＿）得比哥哥高。 :: ㄔㄤˊ'];
  assert.deepEqual(found(draft(NAME, twice)), [['錯誤', 8, 'choice-ambiguous'], ['錯誤', 13, 'choice-ambiguous']]);
  assert.deepEqual(found(draft(NAME)).filter(each => each[2] === 'choice-ambiguous'), []);
  // 底線數不同的同一句畫面上一樣，也算同一句（L2 R2）。
  const underscores = [...SIX.slice(0, 5), '    - 這條路很長（＿）。 :: ㄓㄤˇ'];
  assert.deepEqual(found(draft(NAME, underscores)).filter(each => each[2] === 'choice-ambiguous'), [['錯誤', 11, 'choice-ambiguous'], ['錯誤', 13, 'choice-ambiguous']]);
});

void test('choice-reading（錯誤，只在國語）：讀音不是注音；輕聲的 ˙ 在前面、聲調在後面都可以', () => {
  const tones = draft('了（˙ㄌㄜ、ㄌㄧㄠˇ） 讀音', ['    - 他走了（＿＿）。 :: ˙ㄌㄜ', '    - 他吃完了（＿＿）。 :: ˙ㄌㄜ', '    - 這件事他已經知道了（＿＿）。 :: ˙ㄌㄜ', '    - 我了（＿＿）解了。 :: ㄌㄧㄠˇ', '    - 他了（＿＿）不起。 :: ㄌㄧㄠˇ', '    - 一目了（＿＿）然。 :: ㄌㄧㄠˇ'], ['    - 記憶錨點：', '        - ˙ㄌㄜ：完成：走了、吃了', '        - ㄌㄧㄠˇ：明白：了解、了不起']);
  assert.deepEqual(found(tones), []);
  const pinyin = draft('長（zhǎng、cháng） 讀音', SIX.map(line => line.replace('ㄓㄤˇ', 'zhǎng').replace('ㄔㄤˊ', 'cháng')), ['    - 記憶錨點：', '        - zhǎng：長大：成長', '        - cháng：很長：長短']);
  assert.deepEqual(found(pinyin), [['錯誤', 3, 'choice-reading']]);
  // 英文的手寫多音字不套注音的規則（格式查核 2-4）。
  assert.deepEqual(found(pinyin, '英文').filter(each => each[2] === 'choice-reading'), []);
});

void test('choice-unused（錯誤）：括號裡有讀音沒有句子', () => {
  const three = draft('長（ㄓㄤˇ、ㄔㄤˊ、ㄓㄤ） 讀音', SIX, [...ANCHOR, '        - ㄓㄤ：沒有這個念法：無']);
  assert.deepEqual(found(three).filter(each => each[2] === 'choice-unused'), [['錯誤', 3, 'choice-unused']]);
  assert.deepEqual(found(draft(NAME)).filter(each => each[2] === 'choice-unused'), []);
});

void test('choice-few-sentences（不符）：只有兩個讀音的每個讀音至少三句，三個以上的至少兩句；同一句寫兩次算一句', () => {
  assert.deepEqual(found(draft(NAME, SIX.slice(1))), [['不符', 3, 'choice-few-sentences']]);
  assert.deepEqual(found(draft(NAME, [...SIX.slice(1), SIX[1]])), [['不符', 3, 'choice-few-sentences']]);
  const three = ['    - 他行（＿＿）走得很快。 :: ㄒㄧㄥˊ', '    - 這樣做不行（＿＿）。 :: ㄒㄧㄥˊ', '    - 銀行（＿＿）在街角。 :: ㄏㄤˊ', '    - 他在家排行（＿＿）老二。 :: ㄏㄤˊ', '    - 道行（＿＿）很深。 :: ㄏㄥˋ', '    - 他的道行（＿＿）不夠。 :: ㄏㄥˋ'];
  const anchor = ['    - 記憶錨點：', '        - ㄒㄧㄥˊ：走：行走', '        - ㄏㄤˊ：行業：銀行', '        - ㄏㄥˋ：修行：道行'];
  assert.deepEqual(found(draft('行（ㄒㄧㄥˊ、ㄏㄤˊ、ㄏㄥˋ） 讀音', three, anchor)), []);
});

void test('choice-no-anchor（不符）：有讀音在記憶錨點沒有子項目；choice-anchor-colon（提醒）：子項目有三個以上全形冒號', () => {
  assert.deepEqual(found(draft(NAME, SIX, ANCHOR.slice(0, 2))), [['不符', 3, 'choice-no-anchor']]);
  const colons = [ANCHOR[0], '        - ㄓㄤˇ：長大：帶頭的人：成長', ANCHOR[2]];
  assert.deepEqual(found(draft(NAME, SIX, colons)), [['提醒', 3, 'choice-anchor-colon']]);
});

void test('choice-word（提醒，只在國語）：括號前面不是一個漢字', () => {
  const word = draft('長大（ㄓㄤˇ、ㄔㄤˊ） 讀音', SIX.map(line => line.replace('長（', '長大（')));
  assert.deepEqual(found(word).filter(each => each[2] === 'choice-word'), [['提醒', 3, 'choice-word']]);
});

void test('候選卡片裡的多音字也一樣檢查，行號是原文的行', () => {
  const box = ['## 讀音', '', '- 能說出長的意思', '    - 出處：p.20', '    - 長大是什麼意思？ :: 變大', '', '> [!note]- 候選卡片', `> - ${'長（ㄓㄤˇ） 讀音'}`, '>     - 理由：課本補充', '>     - 出處：p.20', '>     - 他長（＿＿）得比哥哥高。 :: ㄓㄤˇ'].join('\n') + '\n';
  assert.deepEqual(found(box).filter(each => each[2].startsWith('choice-')), [['錯誤', 8, 'choice-invalid']]);
});
