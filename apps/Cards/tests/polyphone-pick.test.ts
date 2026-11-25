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

void test('多音字（L2 R4）：括號裡有讀音沒有句子：照翻面，提示 pick-not-recognized（不然一直點同一個鍵就全對）', () => {
  const one = deck('長（ㄓㄤˇ、ㄔㄤˊ） 讀音', SIX.slice(0, 3));
  assert.equal(first(one).choice, undefined);
  assert.deepEqual(hints(one), [{ code: 'pick-not-recognized', line: 0 }]);
  assert.match(parseDeck(one).problems[0].message, /「ㄔㄤˊ」沒有句子/);
  // 每個讀音都有一句就認。
  assert.ok(first(deck('長（ㄓㄤˇ、ㄔㄤˊ） 讀音', [SIX[0], SIX[3]])).choice);
});

void test('多音字（L2 R3）：看不見的文字裡的「長（＿＿）」不算；空格要是畫面上那一個', () => {
  const hidden = deck('長（ㄓㄤˇ、ㄔㄤˊ） 讀音', [...SIX.slice(0, 5), '妹妹留著一頭＿髮。%% 長（＿＿） %% :: ㄔㄤˊ']);
  assert.equal(first(hidden).choice, undefined);
  assert.deepEqual(hints(hidden), [{ code: 'pick-mixed', line: 6 }]);
  const html = deck('長（ㄓㄤˇ、ㄔㄤˊ） 讀音', [...SIX.slice(0, 5), '妹妹留著一頭＿髮。<span title="長（＿＿）"></span> :: ㄔㄤˊ']);
  assert.deepEqual(hints(html), [{ code: 'pick-mixed', line: 6 }]);
  // 註解在別的地方：照樣是多音字句。
  const note = deck('長（ㄓㄤˇ、ㄔㄤˊ） 讀音', [...SIX.slice(0, 5), '妹妹留著一頭長（＿＿）髮。%% 註 %% :: ㄔㄤˊ']);
  assert.ok(first(note).choice);
  assert.deepEqual(hints(note), []);
});

void test('多音字（L2 第三輪 1、4）：句子只收純文字，有別的格式就照原題型出', () => {
  // 畫面上的句子要能直接從原文看出來（同一句、空格的位置）：字可以粗體或螢光筆，`%%` 註解拿掉；其他格式都不認。
  const formatted = [
    '妹妹留著一頭<code>長（＿＿）</code>髮。', '妹妹留著一頭長（＿＿）髮。<br>', '妹妹留著一頭<span>長</span>（＿＿）髮。',
    '妹妹留著一頭長（＿＿）髮。<br title="<">', '妹妹留著<!--一頭長（＿＿）-->髮。', '妹妹留著一頭長（＿＿）<https://example.com>髮。',
    '妹妹留著一頭長（＿＿）[[髮]]。', '妹妹留著一頭長（＿＿）[髮](https://example.com)。', '妹妹留著一頭長（＿＿）[髮](<https://example.com>)。',
    '妹妹留著一頭[[長（＿＿）]]髮。', '妹妹留著一頭[長（＿＿）](https://example.com)髮。', '妹妹留著一頭長（＿＿）*烏黑的*髮。',
    '妹妹留著一頭長（＿＿）_烏黑的_髮。', '妹妹留著一頭長（＿＿）`烏黑`髮。', '妹妹留著一頭長（＿＿）~~短~~髮。',
    '妹妹留著一頭長（＿＿）&amp;髮。', '妹妹留著一頭長（＿＿）\\*髮。', '妹妹留著一頭長（＿＿）$x$髮。', '妹妹留著一頭長（＿＿）髮。%% 沒有結束',
    '妹妹留著一頭長（＿＿）\u200b髮。',
    // 開頭是清單、標題的記號（L2 第四輪 2、3：`1.` 後面空五格是程式碼區塊，`-`、`+` 起頭是清單），或分成兩行；區塊 ID 在畫面上看不見、標籤會變成連結（第四輪其他查核）。
    '1.     妹妹留著一頭長（＿＿）髮。', '妹妹留著一頭長（＿＿）髮。 ^my-id', '妹妹留著一頭長（＿＿）#長髮。', '1. 妹妹留著一頭長（＿＿）髮。', '2) 妹妹留著一頭長（＿＿）髮。', '- 妹妹留著一頭長（＿＿）髮。', '+ 妹妹留著一頭長（＿＿）髮。', '# 妹妹留著一頭長（＿＿）髮。',
  ];
  for (const question of formatted) {
    const text = deck('長（ㄓㄤˇ、ㄔㄤˊ） 讀音', [...SIX.slice(0, 5), `${question} :: ㄔㄤˊ`]);
    assert.equal(first(text).choice, undefined, question);
    assert.deepEqual(hints(text), [{ code: 'pick-mixed', line: 6 }], question);
  }
  // 題目分成兩行（第二行可能是清單）也不認。
  const lines = parseDeck(`- 長（ㄓㄤˇ、ㄔㄤˊ） 讀音\n${SIX.slice(0, 5).map(line => `    - ${line}\n`).join('')}    - 妹妹留著一頭長（＿＿）\n      髮。 :: ㄔㄤˊ\n`);
  assert.equal(lines.targets[0].choice, undefined);
  assert.deepEqual(lines.problems.map(p => [p.code, p.line]), [['pick-mixed', 6]]);
  // 粗體、螢光筆（成對）與 `%%` 註解照樣認；全形的符號是一般的字。
  for (const question of ['妹妹留著一頭**長**（＿＿）髮。', '妹妹留著一頭==長==（＿＿）髮。', '**妹妹**留著一頭長（＿＿）髮。', '妹妹留著一頭長（＿＿）髮。%% 註 %%', '妹妹留著一頭長（＿＿）髮＊。']) {
    const text = deck('長（ㄓㄤˇ、ㄔㄤˊ） 讀音', [...SIX.slice(0, 5), `${question} :: ㄔㄤˊ`]);
    assert.ok(first(text).choice, question);
    assert.deepEqual(hints(text), [], question);
  }
});

void test('多音字（L2 第三輪 2、3）：畫面上同一句寫了兩次，標出那幾句、照原題型出', () => {
  // 讀音相同、只差底線數、粗體、螢光筆、註解、全半形括號，或配了另一個讀音，都算同一句。
  const copies = [
    '他長（＿＿）得比哥哥高。 :: ㄓㄤˇ', '他長（＿）得比哥哥高。 :: ㄓㄤˇ', '他**長**（＿＿）得比哥哥高。 :: ㄓㄤˇ', '==他==長（＿＿）得比哥哥高。 :: ㄓㄤˇ',
    '他長（＿＿）得比哥哥高。%% 註 %% :: ㄓㄤˇ', '他長(＿＿)得比哥哥高。 :: ㄓㄤˇ', '他長（＿＿＿）得比哥哥高。 :: ㄔㄤˊ',
  ];
  for (const copy of copies) {
    const text = deck('長（ㄓㄤˇ、ㄔㄤˊ） 讀音', [...SIX, copy]);
    assert.equal(first(text).choice, undefined, copy);
    assert.deepEqual(hints(text), [{ code: 'pick-mixed', line: 1 }, { code: 'pick-mixed', line: 7 }], copy);
    assert.match(parseDeck(text).problems[0].message, /同一句/, copy);
  }
  // 編碼不同、畫面一樣的（L2 第四輪 1：組合字元、康熙部首），只差大小寫、全半形、全形空白的（第四輪 4，寫成定義）也是同一句。
  const pairs = [
    ['例 café，他長（＿＿）得比哥哥高。 :: ㄓㄤˇ', '例 cafe\u0301，他長（＿＿）得比哥哥高。 :: ㄔㄤˊ'], ['弟弟長（＿＿）大了。 :: ㄓㄤˇ', '弟弟長（＿＿）\u2f24了。 :: ㄔㄤˊ'],
    ['Do 這條路很長（＿＿）。 :: ㄔㄤˊ', 'do 這條路很長（＿＿）。 :: ㄔㄤˊ'], ['這條路很長（＿＿）！ :: ㄔㄤˊ', '這條路很長（＿＿）! :: ㄔㄤˊ'], ['甲　乙，這條路很長（＿＿）。 :: ㄔㄤˊ', '甲 乙，這條路很長（＿＿）。 :: ㄔㄤˊ'],
  ];
  for (const [one, two] of pairs) {
    const text = deck('長（ㄓㄤˇ、ㄔㄤˊ） 讀音', [...SIX, one, two]);
    assert.equal(first(text).choice, undefined, two);
    assert.deepEqual(hints(text), [{ code: 'pick-mixed', line: 7 }, { code: 'pick-mixed', line: 8 }], two);
  }
  // 只有這一句有 ㄏㄤˊ（第三輪 2）：照原題型出，不會少考一個讀音。
  const lone = deck('行（ㄒㄧㄥˊ、ㄏㄤˊ、ㄏㄥˋ） 讀音', ['他行（＿＿）走得很快。 :: ㄒㄧㄥˊ', '他行（＿）走得很快。 :: ㄏㄤˊ', '他的道行（＿＿）很深。 :: ㄏㄥˋ']);
  assert.equal(first(lone).choice, undefined);
  // 不同的句子照樣認。
  assert.ok(first(deck('長（ㄓㄤˇ、ㄔㄤˊ） 讀音', [...SIX, '他長（＿＿）得比姊姊高。 :: ㄓㄤˇ'])).choice);
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

void test('多音字：記憶錨點照第一個全形冒號對到讀音；同一行的、同一讀音的第二行、未知讀音、半形冒號照原序留在 rest', () => {
  const tail = '    - 記憶錨點：先想是不是變大\n        - ㄓㄤˇ：長大：成長\n        - ㄓㄤˇ：第二行\n        - ㄔㄤ˙：未知的讀音\n        - ㄔㄤˊ:半形冒號\n';
  const choice = first(deck('長（ㄓㄤˇ、ㄔㄤˊ） 讀音', SIX, tail)).choice;
  assert.deepEqual(choice?.anchors, ['長大：成長', null]);
  assert.deepEqual(choice?.rest, ['先想是不是變大', 'ㄓㄤˇ：第二行', 'ㄔㄤ˙：未知的讀音', 'ㄔㄤˊ:半形冒號']);
  // 讀音寫粗體也對得到；冒號後面是空的當成沒有說明。
  const bold = first(deck('長（ㄓㄤˇ、ㄔㄤˊ） 讀音', SIX, '    - 記憶錨點：\n        - **ㄓㄤˇ**：長大：成長\n        - ㄔㄤˊ：\n')).choice;
  assert.deepEqual([bold?.anchors, bold?.rest], [['長大：成長', null], []]);
  // 沒有記憶錨點：每個讀音都沒有說明。
  assert.deepEqual(first(deck('長（ㄓㄤˇ、ㄔㄤˊ） 讀音')).choice?.anchors, [null, null]);
});
