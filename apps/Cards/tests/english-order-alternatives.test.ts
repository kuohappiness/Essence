import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gitEnv, pluginRoot } from '../tools/git.ts';
import { parseDeck } from '../src/core/deck/index.ts';
import type { Deck } from '../src/core/deck/index.ts';
import { cardOf } from '../src/core/study/index.ts';
import { kindPoem, kindSentence } from './helpers/kinds.ts';
import { tempFolder } from './helpers/vault.ts';

// 英文句子排序的另一種排法（D-238、D-240、tasks/sentence-order-alternatives.md）：認法。預期值照任務說明〈驗收〉的邊界表手寫。

const english = (body: string, subject = '英文'): Deck => parseDeck(`---\n科目: ${subject}\n---\n${body}`);
/** 一個目標、一題，題目底下的子項目一行一個。 */
const one = (question: string, extras: readonly string[], name = '用 because 合成一句 排序'): Deck =>
  english(`- ${name}\n    - ${question}\n${extras.map(extra => `        - ${extra}\n`).join('')}`);
const codes = (deck: Deck): [number, string][] => deck.problems.map(problem => [problem.line, problem.code]);
const othersOf = (deck: Deck) => kindSentence(deck.targets[0])?.prompts[0].others;

const BECAUSE = 'I was tired. I went to bed early.（用 because 合成一句）==I went to bed early== ==because== ==I was tired==.';
const ALT = '另一種排法：==because== ==I was tired==, ==I went to bed early==.';
const PARK = '他昨天放學後在公園打籃球。He played basketball ==in the park== ==after school== ==yesterday==.';

void test('§1 的例子：一種另一種排法，詞塊與格後面的字；題目那一行不變；沒有提示；指紋和沒寫時相同', () => {
  const deck = one(BECAUSE, [ALT]);
  assert.deepEqual(codes(deck), []);
  assert.deepEqual(kindSentence(deck.targets[0])?.prompts, [{
    head: 'I was tired. I went to bed early.（用 because 合成一句）', words: ['I went to bed early', 'because', 'I was tired'], tails: [' ', ' ', '.'], starts: [true, false, false],
    others: [{ words: ['because', 'I was tired', 'I went to bed early'], tails: [' ', ', ', '.'], source: ALT }],
  }]);
  const prompt = deck.targets[0].prompts[0];
  assert.deepEqual(prompt.extras, [ALT], '原文照留在補充');
  assert.equal(prompt.fingerprint.slice(0, 8), '99057b9d');
  assert.equal(prompt.fingerprint, one(BECAUSE, []).targets[0].prompts[0].fingerprint);
  assert.equal(kindSentence(one(BECAUSE, []).targets[0])?.prompts[0].others, undefined, '沒有另一種排法時不帶這一欄');
});

void test('不認、提示（order-alt-invalid）：詞塊不同、塊數不同、順序重複、格外的字不同；提示指到那一題的行，照補充留著', () => {
  const invalid = (question: string, extras: readonly string[], needle: RegExp): void => {
    const deck = one(question, extras);
    assert.deepEqual(codes(deck), [[4, 'order-alt-invalid']], extras.join(' / '));
    assert.match(deck.problems[0].message, needle);
    assert.equal(deck.problems[0].level, 'hint');
    assert.equal(kindSentence(deck.targets[0])?.prompts[0].words.length, question.split('==').length >> 1, '這一題照題目那一行認');
  };
  invalid(BECAUSE, ['另一種排法：==Because== ==I was tired==, ==I went to bed early==.'], /Because.*小寫/s);
  invalid(BECAUSE, ['另一種排法：==because I was tired==, ==I went to bed early==.'], /2 塊.*3 塊/);
  invalid(BECAUSE, ['另一種排法：I was tired. I went to bed early.（用 because 合成一句）==I went to bed early== ==because== ==I was tired==.'], /題目那一行的順序相同/);
  invalid('我們明天會去公園。We will go ==to the park== ==tomorrow==.', ['另一種排法：==tomorrow==, we will go ==to the park==.'], /第 1 格後面/);
  invalid('我喜歡茶，她喜歡咖啡。==I like tea==, and ==she likes coffee==.', ['另一種排法：==she likes coffee== and ==I like tea==.'], /第 1 格後面/);
  invalid(PARK, ['另一種排法：（because 放前面）==in the park== ==yesterday== ==after school==.'], /結尾/);
  invalid(BECAUSE, ['另一種排法:==because== ==I was tired==, ==I went to bed early==.'], /全形/);
  invalid(BECAUSE, ['另一種排法 ：==because== ==I was tired==, ==I went to bed early==.'], /全形/);
  invalid(BECAUSE, ['另一種排法：because I was tired, I went to bed early.'], /兩格以上/);
  invalid(BECAUSE, ['另一種排法：==because== ==[I was tired](a.md)==, ==I went to bed early==.'], /兩格以上/);
  invalid('她說她累了。"==I\'m tired==," ==she== ==said==.', ['另一種排法：==she== ==said==, "==I\'m tired==."'], /引號/);

  const twice = one(BECAUSE, [ALT, ALT]);
  assert.deepEqual(codes(twice), [[4, 'order-alt-invalid']], '第二行和前面一行相同');
  assert.match(twice.problems[0].message, /前面另一行/);
  assert.equal(othersOf(twice)?.length, 1);

  const nested = english(`- 用 because 合成一句 排序\n    - ${BECAUSE}\n        - ${ALT}\n            - 連接詞放前面時中間加逗號\n`);
  assert.deepEqual(codes(nested), [[4, 'order-alt-invalid']], '底下又有子項目');
  assert.match(nested.problems[0].message, /同一行/);
  assert.equal(othersOf(nested), undefined);
});

void test('第一格前面的字（§1 第 3 點）：不寫、寫題目那段的結尾、整行照抄都認；空白連續算一個', () => {
  const words = ['in the park', 'yesterday', 'after school'];
  for (const alt of [
    '另一種排法：He played basketball ==in the park== ==yesterday== ==after school==.',
    '另一種排法：==in the park== ==yesterday== ==after school==.',
    '另一種排法：他昨天放學後在公園打籃球。He played basketball ==in the park== ==yesterday== ==after school==.',
    '另一種排法：  played   basketball ==in the park== ==yesterday== ==after school==.',
  ]) {
    const deck = one(PARK, [alt], '副詞的位置 排序');
    assert.deepEqual(codes(deck), [], alt);
    assert.deepEqual(othersOf(deck), [{ words, tails: [' ', ' ', '.'], source: alt }], alt);
  }
});

void test('排錯的排法太少（order-alt-all-right）：照樣認；相同文字的詞塊互換算同一種', () => {
  const two = one('我們明天中午見。See you ==tomorrow== ==at noon==.', ['另一種排法：See you ==at noon== ==tomorrow==.'], '時間的位置 排序');
  assert.deepEqual(codes(two), [[4, 'order-alt-all-right']]);
  assert.equal(two.problems[0].level, 'hint');
  assert.deepEqual(othersOf(two)?.map(other => other.words), [['at noon', 'tomorrow']]);

  const very = (extras: readonly string[]): Deck => one('這非常好。It is ==very== ==very== ==good==.', extras, '加強語氣 排序');
  assert.deepEqual(codes(very(['另一種排法：It is ==very== ==good== ==very==.'])), [[4, 'order-alt-all-right']], '3 種排法列 2 種，只剩 1 種');
  assert.deepEqual(codes(very(['另一種排法：==very== ==good== ==very==.', '另一種排法：==good== ==very== ==very==.'])), [[4, 'order-alt-all-right']]);

  const orders = ['==because== ==I was tired== ==I went to bed early==.', '==I was tired== ==I went to bed early== ==because==.', '==I was tired== ==because== ==I went to bed early==.', '==because== ==I went to bed early== ==I was tired==.'];
  assert.deepEqual(codes(one(BECAUSE, orders.slice(0, 3).map(order => `另一種排法：${order}`))), [], '6 種列 4 種，剩 2 種');
  assert.deepEqual(codes(one(BECAUSE, orders.map(order => `另一種排法：${order}`))), [[4, 'order-alt-all-right']], '6 種列 5 種，剩 1 種');
});

void test('寫在別的地方（§1 第 6 點）：不是英文句子排序的題目底下，照補充顯示、提示', () => {
  const misplaced = (deck: Deck, line: number): void => {
    assert.deepEqual(codes(deck), [[line, 'order-alt-invalid']]);
    assert.match(deck.problems[0].message, /英文句子排序/);
  };
  const poem = one('==Twinkle, twinkle==, ==little star==.', ['另一種排法：==little star==, ==Twinkle, twinkle==.'], 'Twinkle 全詩 排序');
  misplaced(poem, 4);
  assert.equal(kindPoem(poem.targets[0])?.title, 'Twinkle');
  assert.deepEqual(poem.targets[0].prompts[0].extras, ['另一種排法：==little star==, ==Twinkle, twinkle==.']);
  misplaced(english('- 鳥鳴澗 排序\n    - ==人閒桂花落==，==夜靜春山空==。\n        - 另一種排法：==夜靜春山空==，==人閒桂花落==。\n', '國文'), 4);
  misplaced(english('- 現在完成式 文法\n    - She ＿＿ here since 2020. :: has lived\n        - 另一種排法：Since 2020 she has lived here.\n'), 4);
  misplaced(english('- 能說出 because 的用法\n    - because 接什麼 :: 原因\n        - 另一種排法：Because ...\n'), 4);
  const single = one(BECAUSE.replace(' ==because== ==I was tired==', ' because I was tired'), [ALT]);
  misplaced(single, 4);
  assert.equal(kindSentence(single.targets[0]), undefined, '只有一格，不是句子排序');
});

void test('少縮一層、寫在目標底下（§1 第 6 點）：認法照現在（多一題、全詩退成翻面），提示要縮到那一題底下', () => {
  const sentence = english(`- 用 because 合成一句 排序\n    - ${BECAUSE}\n    - ${ALT}\n`);
  assert.deepEqual(codes(sentence), [[5, 'order-alt-invalid']]);
  assert.match(sentence.problems[0].message, /縮到那一題底下/);
  assert.equal(kindSentence(sentence.targets[0])?.prompts.length, 2, '和現在一樣多一題');

  const poem = english('- Twinkle 全詩 排序\n    - ==Twinkle, twinkle==, ==little star==.\n    - 另一種排法：==little star==, ==Twinkle, twinkle==.\n');
  assert.deepEqual(codes(poem), [[5, 'order-alt-invalid']]);
  assert.equal(kindPoem(poem.targets[0]), undefined, '和現在一樣退成翻面');

  const shared = english(`- 用 because 合成一句 排序\n    - ${BECAUSE}\n    - 另一種排法：because I was tired, I went to bed early.\n`);
  assert.deepEqual(codes(shared), [[5, 'order-alt-invalid']], '沒有 == 是共用補充');
  assert.deepEqual(shared.targets[0].shared, ['另一種排法：because I was tired, I went to bed early.']);
  assert.deepEqual(codes(english(`- 用 because 合成一句 排序\n    - ${BECAUSE}\n    - 另一種排法:because I was tired.\n`)), [[5, 'order-alt-invalid']], '半形冒號也提示');
});

// 字鍵（§3）：直接用 cardOf 算出第 0～20 次。甲＝I went to bed early、乙＝because、丙＝I was tired。
const keysAt = (deck: Deck, times: number): readonly string[] => {
  const target = deck.targets[0];
  return cardOf({ lt: 'lt', deck: 'Essence Cards/英文/L1.md', target, prompt: target.prompts[0], isNew: false, early: false }, times).group?.keys ?? [];
};
const [A, B, C] = ['I went to bed early', 'because', 'I was tired'];

void test('字鍵避開每一種對的順序，相鄰兩次不同；排錯的只剩一種時每一次都是它', () => {
  const deck = one(BECAUSE, [ALT]);
  let before: readonly string[] | null = null;
  for (let times = 0; times <= 20; times++) {
    const keys = keysAt(deck, times);
    assert.deepEqual([...keys].sort(), [A, B, C].sort());
    assert.notDeepEqual(keys, [A, B, C], `第 ${String(times)} 次照題目那一行`);
    assert.notDeepEqual(keys, [B, C, A], `第 ${String(times)} 次照另一種排法`);
    if (before) assert.notDeepEqual(keys, before, `第 ${String(times)} 次和上一次一樣`);
    before = keys;
  }
  const five = one(BECAUSE, ['==because== ==I was tired== ==I went to bed early==.', '==I was tired== ==I went to bed early== ==because==.', '==I was tired== ==because== ==I went to bed early==.', '==because== ==I went to bed early== ==I was tired==.'].map(order => `另一種排法：${order}`));
  for (let times = 0; times <= 20; times++) assert.deepEqual(keysAt(five, times), [A, C, B], `第 ${String(times)} 次`);
});

void test('字鍵：兩塊、兩種都對的照舊打亂；組卡帶上另一種排法，沒有的不帶', () => {
  const two = one('我們明天中午見。See you ==tomorrow== ==at noon==.', ['另一種排法：See you ==at noon== ==tomorrow==.'], '時間的位置 排序');
  for (let times = 0; times <= 5; times++) assert.deepEqual([...keysAt(two, times)].sort(), ['at noon', 'tomorrow']);
  const card = cardOf({ lt: 'lt', deck: 'Essence Cards/英文/L1.md', target: one(BECAUSE, [ALT]).targets[0], prompt: one(BECAUSE, [ALT]).targets[0].prompts[0], isNew: false, early: false });
  assert.deepEqual(card.group?.order, { head: 'I was tired. I went to bed early.（用 because 合成一句）', tails: [' ', ' ', '.'], starts: [true, false, false], others: [{ words: [B, C, A], tails: [' ', ', ', '.'], source: ALT }] });
  const plain = one(BECAUSE, []).targets[0];
  assert.equal('others' in (cardOf({ lt: 'lt', deck: 'x', target: plain, prompt: plain.prompts[0], isNew: false, early: false }).group?.order ?? {}), false);
});

// 舊版讀另一種排法（§7）：用真的 v0.6.0 標籤的程式，不是用現在的程式假裝舊版。
const root = fileURLToPath(new URL('../', import.meta.url));
const env = gitEnv();
const git = (dir: string, ...args: string[]): string => execFileSync('git', args, { cwd: dir, env, encoding: 'utf8' }).trim();

void test('v0.6.0 讀 §1 的例子：照句子排序、詞塊照題目那一行、另一種排法在補充裡、指紋相同', async t => {
  const text = `---\n科目: 英文\n---\n- 用 because 合成一句 排序\n    - ${BECAUSE}\n        - ${ALT}\n`;
  const dir = await tempFolder(t, 'essence-v060-');
  git(root, 'clone', '-q', '--no-checkout', git(root, 'rev-parse', '--show-toplevel'), dir);
  git(dir, 'checkout', '-q', 'v0.6.0');
  const cards = join(dir, pluginRoot(dir, 'v0.6.0'));
  await symlink(join(root, 'node_modules'), join(cards, 'node_modules'), 'junction');
  const script = "import { parseDeck } from './src/core/deck/index.ts'; const deck = parseDeck(JSON.parse(process.argv[1])); console.log(JSON.stringify({ sentence: deck.targets[0].sentence, prompts: deck.targets[0].prompts.map(prompt => [prompt.fingerprint, prompt.extras]), problems: deck.problems.map(problem => problem.code) }));";
  const old = JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', script, JSON.stringify(text)], { cwd: cards, env, encoding: 'utf8' })) as unknown;
  const now = english(`- 用 because 合成一句 排序\n    - ${BECAUSE}\n        - ${ALT}\n`);
  const { others: _, ...cells } = kindSentence(now.targets[0])?.prompts[0] ?? {};
  assert.deepEqual(old, { sentence: { title: '用 because 合成一句', prompts: [cells] }, prompts: [[now.targets[0].prompts[0].fingerprint, [ALT]]], problems: [] });
});
