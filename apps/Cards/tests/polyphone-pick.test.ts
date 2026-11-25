import test from 'node:test';
import assert from 'node:assert/strict';
import { parseDeck } from '../src/core/deck/index.ts';
import type { ProblemCode } from '../src/core/deck/index.ts';

// 多音字的點選填空（tasks/polyphone-pick.md §1）：選項寫在名稱最後一個括號、結尾是讀音。預期值照任務說明的表。

const SIX = [
  '他長（＿＿）得比哥哥高。 :: ㄓㄤˇ',
  '小樹苗慢慢長（＿＿）大了。 :: ㄓㄤˇ',
  '他是我們班的班長（＿＿）。 :: ㄓㄤˇ',
  '這條路很長（＿＿）。 :: ㄔㄤˊ',
  '夏天的白天比較長（＿＿）。 :: ㄔㄤˊ',
  '妹妹留著一頭長（＿＿）髮。 :: ㄔㄤˊ',
];
const deck = (name: string, prompts: readonly string[] = SIX, tail = ''): string => `- ${name}\n${prompts.map(line => `    - ${line}\n`).join('')}${tail}`;
const first = (text: string) => parseDeck(text).targets[0];
const hints = (text: string): { code: ProblemCode; line: number }[] => parseDeck(text).problems.filter(p => p.code.startsWith('pick-')).map(p => ({ code: p.code, line: p.line }));

void test('多音字：正式的寫法', () => {
  const target = first(deck('長（ㄓㄤˇ、ㄔㄤˊ） 讀音 ^k3m9qa', SIX, '    - 記憶錨點：\n        - ㄓㄤˇ：長大、帶頭的人：成長、班長\n        - ㄔㄤˊ：距離或時間久：長短、很長\n'));
  assert.deepEqual(target.choice, { word: '長', options: ['ㄓㄤˇ', 'ㄔㄤˊ'], optionKeys: ['ㄓㄤˇ', 'ㄔㄤˊ'], title: '讀音', answers: [0, 0, 0, 1, 1, 1], anchors: ['長大、帶頭的人：成長、班長', '距離或時間久：長短、很長'], rest: [] });
  assert.equal(target.id, 'k3m9qa');
  assert.equal(target.group, undefined);
  assert.equal(target.ok, true);
  assert.deepEqual(hints(deck('長（ㄓㄤˇ、ㄔㄤˊ） 讀音')), []);
});

void test('多音字：名稱的寫法容忍粗體、括號寬度、逗號與全形空白', () => {
  const names = [
    '行（ㄒㄧㄥˊ、ㄏㄤˊ）讀音',
    '**長**(ㄓㄤˇ，ㄔㄤˊ）　讀音 ^k3m9qa',
    '**長（ㄓㄤˇ、ㄔㄤˊ） 讀音**',
    '長(ㄓㄤˇ,ㄔㄤˊ) 讀音',
  ];
  for (const name of names) {
    const word = name.startsWith('行') ? '行' : '長';
    const prompts = word === '行' ? ['銀行（＿＿）在街角。 :: ㄏㄤˊ', '他行（＿＿）走得很快。 :: ㄒㄧㄥˊ'] : SIX;
    const choice = first(deck(name, prompts)).choice;
    assert.equal(choice?.word, word, name);
    assert.equal(choice?.options.length, 2, name);
    assert.deepEqual(hints(deck(name, prompts)), [], name);
  }
});

void test('多音字：空格是緊接字後面的（＿…），括號全半形、底線長短都可以', () => {
  for (const question of ['他長(＿)得比哥哥高。', '他長（＿＿＿）得比哥哥高。', '他**長**（＿＿）得比哥哥高。', '他長(＿＿）得比哥哥高。']) {
    assert.ok(first(deck('長（ㄓㄤˇ、ㄔㄤˊ） 讀音', [question + ' :: ㄓㄤˇ', '這條路很長（＿＿）。 :: ㄔㄤˊ'])).choice, question);
  }
});

void test('多音字：名稱沒有括號照翻面，不提示（沒勾點選填空、現在的讀音卡）', () => {
  for (const prompts of [SIX, ['「他長得比哥哥高」的「長」怎麼念？ :: ㄓㄤˇ']]) {
    const text = deck('長 讀音', prompts);
    assert.equal(first(text).choice, undefined);
    assert.deepEqual(hints(text), []);
  }
});

void test('多音字：比較卡認不成時，選項是最後一個括號；前面的括號留在名稱', () => {
  assert.deepEqual(first(deck('長（長、常）（ㄓㄤˇ、ㄔㄤˊ） 讀音')).choice?.options, ['ㄓㄤˇ', 'ㄔㄤˊ']);
  const choice = first(deck('長（大）（長大、很長）（ㄓㄤˇ、ㄔㄤˊ）讀音')).choice;
  assert.equal(choice?.word, '長');
  assert.deepEqual(choice?.options, ['ㄓㄤˇ', 'ㄔㄤˊ']);
});

void test('多音字：選項讀不出、括號之後不只讀音：照翻面，提示 pick-not-recognized', () => {
  for (const name of ['長（ㄓㄤˇ） 讀音', '長（ㄓㄤˇㄔㄤˊ） 讀音', '長（**　**、ㄓㄤˇ） 讀音', '長（ㄓㄤˇ、ㄔㄤˊ）（大） 讀音', '長（ㄓㄤˇ、ㄔㄤˊ） 字義 讀音', '長（ㄓㄤˇ、`ㄔㄤˊ`） 讀音']) {
    const text = deck(name);
    assert.equal(first(text).choice, undefined, name);
    assert.deepEqual(hints(text), [{ code: 'pick-not-recognized', line: 0 }], name);
    assert.equal(first(text).ok, true, name);
  }
});

void test('多音字：一題都不是多音字句：照翻面，提示 pick-not-recognized', () => {
  const bad = ['他長__得比哥哥高。', '他長　＿＿得比哥哥高。', '他長（**＿＿**）得比哥哥高。', '他長（＿　＿）得比哥哥高。', '他長（＿）又長（＿）高。', '他＿＿長得比哥哥高。', '他長（&#65343;）得比哥哥高。', '他長（`＿＿`）得比哥哥高。'];
  for (const question of bad) {
    const text = deck('長（ㄓㄤˇ、ㄔㄤˊ） 讀音', [question + ' :: ㄓㄤˇ']);
    assert.equal(first(text).choice, undefined, question);
    assert.deepEqual(hints(text).map(h => h.code), ['pick-not-recognized'], question);
  }
  const cloze = deck('長（ㄓㄤˇ、ㄔㄤˊ） 讀音', ['他==長==得比哥哥高。']);
  assert.equal(first(cloze).choice, undefined);
  assert.deepEqual(hints(cloze).map(h => h.code), ['pick-not-recognized']);
});

void test('多音字：有的題是、有的不是：照翻面，pick-mixed 標不是的題', () => {
  const tone = deck('長（ㄓㄤˇ、ㄔㄤˊ） 讀音', [...SIX.slice(0, 5), '妹妹留著一頭長（＿＿）髮。 :: ㄔㄤ´']);
  assert.equal(first(tone).choice, undefined);
  assert.deepEqual(hints(tone), [{ code: 'pick-mixed', line: 6 }]);
  const missing = deck('長（ㄓㄤˇ、ㄔㄤˊ） 讀音', [...SIX.slice(0, 5), '妹妹留著一頭長（＿＿）髮。 :: ㄔㄤ']);
  assert.deepEqual(hints(missing), [{ code: 'pick-mixed', line: 6 }]);
  const other = deck('長（ㄓㄤˇ、ㄔㄤˊ） 讀音', [...SIX.slice(0, 5), '「長」有幾種念法？ :: 兩種']);
  assert.deepEqual(hints(other), [{ code: 'pick-mixed', line: 6 }]);
});

void test('多音字：原本就停出的照舊', () => {
  const empty = parseDeck(deck('長（ㄓㄤˇ、ㄔㄤˊ） 讀音', ['他長（＿＿）得比哥哥高。 ::']));
  assert.equal(empty.targets[0].ok, false);
  assert.ok(empty.problems.some(p => p.code === 'missing-answer'));
  const group = parseDeck(deck('長（長、常） 讀音', ['他＿＿得比哥哥高。 :: 長', '時＿＿來看我。 :: 常']));
  assert.equal(group.targets[0].ok, false);
  assert.deepEqual(group.problems.map(p => p.code), ['pick-answer-invalid']);
  assert.equal(group.targets[0].choice, undefined);
  assert.ok(first(deck('長（長、常） 讀音', ['他＿＿得比哥哥高。 :: 長'])).group);
});

void test('多音字：結尾不是單獨的讀音就不看', () => {
  for (const name of ['長（ㄓㄤˇ、ㄔㄤˊ）讀音（進階）', '長（ㄓㄤˇ、ㄔㄤˊ） 字義', '長（ㄓㄤˇ、ㄔㄤˊ）', '長（ㄓㄤˇ、ㄔㄤˊ） 讀聲']) {
    const text = deck(name);
    assert.equal(first(text).choice, undefined, name);
    assert.deepEqual(hints(text), [], name);
  }
});

void test('多音字：程式不分科，手寫的英文也認', () => {
  const choice = first(deck('read（/riːd/、/rɛd/） 讀音', ['I have read（＿＿） it. :: /rɛd/', 'I read（＿＿） every day. :: /riːd/'])).choice;
  assert.deepEqual(choice?.options, ['/riːd/', '/rɛd/']);
});
