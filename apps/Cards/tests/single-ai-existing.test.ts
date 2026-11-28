import test from 'node:test';
import assert from 'node:assert/strict';
import { EXISTING_WHY, planExisting } from '../src/core/ai/index.ts';
import type { ExistingInput } from '../src/core/ai/index.ts';
import { parseDeck } from '../src/core/deck/index.ts';

// 單選加進已有的學習目標（tasks/matching-single-choice.md §6）：選項行是目標底下的補充，走「其他」單位的寫回；寫前核對多允許一種卡型改變
// （沒有卡型的目標加上剛好一行選項行、加完認成單選），其他照舊擋。只用自編的內容；往返與冪等在 tests/helpers/add-cases.ts。
const SRC = 'Essence Cards/學業/五上/社會/2-2.md';
const DEST = 'Essence Cards/學業/五上/社會/2-1.md';
const head = (unit: string): string => `---\n年級學期: 五上\n科目: 社會\n單元: "${unit}"\n---\n`;
const srcProps = parseDeck(head('2-1 海岸')).props;
const OPTIONS = '    - 選項：岩岸;;沙岸;;斷層海岸;;珊瑚礁海岸';
const Q1 = '    - 臺灣北部的海岸是哪一種海岸？ :: 岩岸';
/** 目的地：一個目標 q8z3ka，body 是它底下的行。 */
const dest = (...body: string[]): string => head('2-1 海岸') + ['- 能說出臺灣北部海岸的地形 ^q8z3ka', '    - 出處：p.42', ...body].join('\n') + '\n';
const item = (...body: string[]): string => ['- [[五上社會 2-1#^q8z3ka|能說出臺灣北部海岸的地形]]', ...body].join('\n');
const input = (original: string, text: string): ExistingInput => ({ original, id: 'q8z3ka', source: { path: SRC, props: srcProps }, dest: { path: DEST, text }, version: '0.5.0' });
const planned = (original: string, text: string): string => {
  const plan = planExisting(input(original, text));
  assert.ok(plan.kind === 'plan' && plan.text !== null, JSON.stringify(plan));
  return plan.text;
};
const left = (original: string, text: string): string => {
  const plan = planExisting(input(original, text));
  assert.equal(plan.kind, 'leave', JSON.stringify(plan));
  return plan.kind === 'leave' ? plan.why : '';
};
const kindOf = (text: string): string | undefined => parseDeck(text).targets[0].kind?.id;

void test('已經是單選的目標：加答案在選項裡的題照常，題目接在最後一題後面、選項行不動；再算一次是已經在', () => {
  const more = '    - 野柳在臺灣哪一種海岸？ :: 岩岸';
  const out = planned(item(more), dest(Q1, OPTIONS));
  assert.equal(out, dest(Q1, more, OPTIONS));
  assert.equal(kindOf(out), 'single');
  assert.deepEqual(planExisting(input(item(more), out)), { kind: 'plan', text: null });
});

void test('已經是單選的目標：加的題答案不在選項裡、不是一行的問答、改了選項組，都留在框裡，原因是答案不在選項裡', () => {
  const before = dest(Q1, OPTIONS);
  for (const bad of [['    - 臺灣北部的海岸有什麼地形？ :: 岬灣'], ['    - 臺灣北部是==岩岸=='], ['    - 選項：岩岸;;沙岸;;斷層海岸']]) {
    assert.equal(left(item(...bad), before), EXISTING_WHY.singleLost, bad.join());
  }
});

void test('沒有卡型的舊目標加上選項行：加完認成單選、選項行接在最後；同時加題也可以；再算一次是已經在', () => {
  const out = planned(item(OPTIONS), dest(Q1));
  assert.equal(out, dest(Q1, OPTIONS));
  assert.equal(kindOf(dest(Q1)), undefined);
  assert.equal(kindOf(out), 'single');
  assert.deepEqual(planExisting(input(item(OPTIONS), out)), { kind: 'plan', text: null });
  const more = '    - 野柳在臺灣哪一種海岸？ :: 岩岸';
  assert.equal(planned(item(more, OPTIONS), dest(Q1)), dest(Q1, more, OPTIONS));
});

void test('沒有卡型的舊目標加上選項行：原本的題答案不在選項裡、選項讀不成、加了兩行，都留在框裡', () => {
  assert.equal(left(item(OPTIONS), dest('    - 臺灣北部的海岸有什麼地形？ :: 岬灣')), EXISTING_WHY.singleLost);
  assert.equal(left(item('    - 選項：岩岸;;沙岸'), dest(Q1)), EXISTING_WHY.singleLost);
  assert.equal(left(item(OPTIONS, '    - 選項：岩岸;;沙岸;;斷層海岸'), dest(Q1)), EXISTING_WHY.singleLost);
});

void test('已經是別的卡型的目標加上選項行：不寫（卡型照舊不能變）', () => {
  const group = (...body: string[]): string => head('2-1 海岸') + ['- 岩（岩、沿） 相似字 ^q8z3ka', '    - ＿＿岸 :: 岩', '    - ＿＿石 :: 岩', ...body].join('\n') + '\n';
  const groupItem = (...body: string[]): string => ['- [[五上社會 2-1#^q8z3ka|岩（岩、沿） 相似字]]', ...body].join('\n');
  assert.equal(kindOf(group()), 'group');
  assert.equal(left(groupItem('    - 選項：岩;;沿;;炎'), group()), EXISTING_WHY.singleLost);
});

void test('加了有「以上皆是」「以上皆非」的選項行（L2 第一輪 R5）：草稿之外，寫進筆記前也擋', () => {
  assert.equal(left(item('    - 選項：岩岸;;沙岸;;斷層海岸;;以上皆是'), dest(Q1)), EXISTING_WHY.singleAllNone);
  assert.equal(left(item('    - 野柳在臺灣哪一種海岸？ :: 岩岸', '    - 選項：岩岸;;沙岸;;以上皆非'), dest(Q1)), EXISTING_WHY.singleAllNone);
});

void test('「以上皆是」局部加粗也擋，註解裡寫的不算（L2 第二輪 4）：寫進筆記前', () => {
  assert.equal(left(item('    - 選項：岩岸;;沙岸;;以上**皆是**'), dest(Q1)), EXISTING_WHY.singleAllNone);
  assert.equal(kindOf(planned(item('    - 選項：岩岸;;沙岸;;斷層海岸 %%草稿曾寫以上皆是%%'), dest(Q1))), 'single');
  // 整類（第 2 代）：兩種寫法的每一段加粗都擋。
  for (const phrase of ['以上皆是', '以上皆非']) for (let from = 0; from < 4; from++) for (let to = from + 1; to <= 4; to++) {
    const option = `${phrase.slice(0, from)}**${phrase.slice(from, to)}**${phrase.slice(to)}`;
    assert.equal(left(item(`    - 選項：岩岸;;沙岸;;${option}`), dest(Q1)), EXISTING_WHY.singleAllNone, option);
  }
});

void test('筆記裡已經是單選、這次只加題（L2 第一輪 R6）：題目寫「下列」「以下何者」，寫進筆記前擋', () => {
  assert.equal(left(item('    - 下列何者是臺灣北部最多的海岸？ :: 岩岸'), dest(Q1, OPTIONS)), EXISTING_WHY.singleWhichOf);
  assert.equal(left(item('    - 以下何者在北部最多？ :: 岩岸'), dest(Q1, OPTIONS)), EXISTING_WHY.singleWhichOf);
  // 不是單選的目標照舊寫（草稿的提醒已經報過）。
  assert.equal(planExisting(input(item('    - 下列何者是臺灣北部最多的海岸？ :: 岩岸'), dest(Q1))).kind, 'plan');
});

void test('筆記裡已經是單選、這次加的題目寫出自己的答案：寫進筆記前擋', () => {
  assert.equal(left(item('    - 北部常見岩岸，是哪一種海岸？ :: 岩岸'), dest(Q1, OPTIONS)), EXISTING_WHY.singleLeak);
  // 答案只寫在 %% 註解裡（孩子看不到，L2 第二輪 5）：照常加。
  assert.equal(kindOf(planned(item('    - 北部主要是哪種海岸？ %%岩岸%% :: 岩岸'), dest(Q1, OPTIONS))), 'single');
});

void test('只補選項行就把舊題變成單選（L2 第二輪 3）：筆記裡原本的題目寫「下列」或寫出自己的答案，寫進筆記前擋；已經是單選的舊題不重查', () => {
  assert.equal(left(item(OPTIONS), dest('    - 下列何者是北部主要的海岸？ :: 岩岸')), EXISTING_WHY.singleWhichOf);
  assert.equal(left(item(OPTIONS), dest('    - 北部常見岩岸，是哪種海岸？ :: 岩岸')), EXISTING_WHY.singleLeak);
  // 原本的題目照規則寫：照常加。
  assert.equal(kindOf(planned(item(OPTIONS), dest(Q1))), 'single');
  // 家長手寫、已經是單選的目標，舊題寫了「下列」：這次加的題照規則寫就照常加，不因為舊題擋住。
  assert.equal(kindOf(planned(item('    - 野柳的海岸是哪一種海岸？ :: 岩岸'), dest('    - 下列何者是北部主要的海岸？ :: 岩岸', OPTIONS))), 'single');
  // 整類（第 2 代）：三種寫法 × 寫在筆記裡原本的題或這次加的題 × 這次才變成單選或已經是單選。
  const GOOD = '    - 野柳的海岸是哪一種海岸？ :: 岩岸';
  const bad = [['    - 下列何者是北部主要的海岸？ :: 岩岸', EXISTING_WHY.singleWhichOf], ['    - 以下何者在北部最多？ :: 岩岸', EXISTING_WHY.singleWhichOf], ['    - 北部常見岩岸，是哪種海岸？ :: 岩岸', EXISTING_WHY.singleLeak]];
  for (const [question, why] of bad) {
    assert.equal(left(item(OPTIONS), dest(question)), why, question);
    assert.equal(left(item(GOOD, OPTIONS), dest(question)), why, question);
    assert.equal(left(item(question, OPTIONS), dest(Q1)), why, question);
    assert.equal(left(item(question), dest(Q1, OPTIONS)), why, question);
    assert.equal(kindOf(planned(item(GOOD), dest(question, OPTIONS))), 'single', question);
  }
});

void test('題幹的檢查只看孩子看得到的字（L2 第二輪 5、第三輪 3）：寫在 %% 註解裡的不算，筆記裡原本的題與這次加的題都一樣', () => {
  for (const [words, why] of [['下列何者是', EXISTING_WHY.singleWhichOf], ['以下何者是', EXISTING_WHY.singleWhichOf], ['常見岩岸，', EXISTING_WHY.singleLeak]]) {
    const question = (shown: string): string => `    - 臺灣北部${shown}哪一種海岸？ :: 岩岸`;
    // 這次才變成單選（筆記裡原本的題）、這次加的題。
    assert.equal(left(item(OPTIONS), dest(question(words))), why, words);
    assert.equal(kindOf(planned(item(OPTIONS), dest(question(`%%${words}%%`)))), 'single', words);
    assert.equal(left(item(question(words)), dest(Q1, OPTIONS)), why, words);
    assert.equal(kindOf(planned(item(question(`%%${words}%%`)), dest(Q1, OPTIONS))), 'single', words);
  }
});
