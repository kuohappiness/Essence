import test from 'node:test';
import assert from 'node:assert/strict';
import { parseDeck, typedHint } from '../src/core/deck/index.ts';

// 英文的文法與變化的認法（tasks/english-typed-order.md §1、§2）：從名稱的結尾認，問答題打字。預期值照任務說明的邊界例子手寫。

const one = (name: string, prompt = 'I ＿＿ to school. (go) :: went') => parseDeck(`- ${name}\n    - ${prompt}\n`);
const typingOf = (name: string) => one(name).targets[0].typing;

void test('變化的結尾：五種變化種類，前面要有半形、全形空白或右括號', () => {
  for (const ending of ['過去式', '過去分詞', '複數', '比較級', '最高級']) assert.equal(typingOf(`go ${ending}`)?.kind, 'inflection', ending);
  assert.deepEqual(typingOf('go　過去式'), { kind: 'inflection', hint: 'go', pair: { key: 'go', exact: false } });
  assert.deepEqual(typingOf('light（輕的）比較級'), { kind: 'inflection', hint: 'light', pair: { key: 'light(輕的)', exact: true } });
  assert.deepEqual(typingOf('lie（躺） 過去式'), { kind: 'inflection', hint: 'lie', pair: { key: 'lie(躺)', exact: true } });
  assert.deepEqual(typingOf('**Go** 過去式'), { kind: 'inflection', hint: 'Go', pair: { key: 'go', exact: false } });
});

void test('不是變化：結尾前沒有空白、只有結尾、方向優先、組優先、最上層直接寫題目', () => {
  assert.equal(typingOf('go過去式'), undefined);
  assert.equal(typingOf('過去式'), undefined);
  assert.equal(typingOf('go 過去式 中翻英'), undefined);
  assert.equal(one('borrow（borrow、lend） 文法', 'Can I ＿＿ your pen? :: borrow').targets[0].typing, undefined);
  assert.equal(one('borrow（borrow、lend） 文法', 'Can I ＿＿ your pen? :: borrow').targets[0].group?.title, '文法');
  assert.equal(parseDeck('- I ＿＿ to school. 過去式 :: went\n').targets[0].typing, undefined);
});

void test('文法：文法點是第一個左括號前面那段；沒有括號是整段；錯題補強的舊寫法不打字', () => {
  assert.deepEqual(typingOf('現在完成式（從過去持續到現在） 文法'), { kind: 'grammar', hint: '現在完成式', pair: null });
  assert.deepEqual(typingOf('動名詞(當主詞) 文法'), { kind: 'grammar', hint: '動名詞', pair: null });
  assert.deepEqual(typingOf('被動語態 文法'), { kind: 'grammar', hint: '被動語態', pair: null });
  assert.deepEqual(typingOf('（當主詞） 文法'), { kind: 'grammar', hint: null, pair: null });
  assert.equal(typingOf('能在描述經驗時用現在完成式'), undefined);
  const old = one('能在描述經驗時用現在完成式').targets[0].prompts[0];
  assert.equal(old.kind === 'qa' ? old.typed : 'cloze', null);
});

void test('文法與變化的問答題打字：答案照中翻英拆 |，字數不同只是提示', () => {
  const parsed = one('現在完成式（從過去持續到現在） 文法', "I ＿＿ Tom since I was six. (know) :: have known | 've known");
  const prompt = parsed.targets[0].prompts[0];
  assert.equal(prompt.kind, 'qa');
  assert.deepEqual(prompt.kind === 'qa' && prompt.typed, ['have known', "'ve known"]);
  assert.deepEqual(parsed.problems, []);
  assert.equal(parsed.targets[0].ok, true);
  const words = one('動名詞（當主詞） 文法', '＿＿ movies is fun. (watch) :: Watching | To watch');
  assert.deepEqual(words.problems.map(p => [p.code, p.level]), [['typed-answer-words', 'hint']]);
});

void test('讀不成打字時那一題照翻面、只提示，目標照常出題（§1-3）', () => {
  for (const prompt of ['Q :: 去', 'Q :: [[went]]', 'Q ::\n        - went\n        - gone']) {
    const parsed = one('go 過去式', prompt);
    const first = parsed.targets[0].prompts[0];
    assert.equal(first.kind === 'qa' && first.typed, null, prompt);
    assert.deepEqual(parsed.problems.map(p => [p.code, p.level]), [['typed-answer-invalid', 'hint']], prompt);
    assert.match(parsed.problems[0].message, /照翻面出/);
    assert.equal(parsed.targets[0].ok, true, prompt);
  }
  const cloze = one('被動語態 文法', 'The window ==was broken==.');
  assert.deepEqual(cloze.problems.map(p => [p.code, p.level]), [['cloze-not-typed', 'hint']]);
  assert.match(cloze.problems[0].message, /文法與變化/);
});

void test('中翻英照舊：讀不成打字是錯誤', () => {
  const parsed = one('go 中翻英', 'Q :: 去');
  assert.deepEqual(parsed.problems.map(p => [p.code, p.level]), [['typed-answer-invalid', 'error']]);
  assert.equal(parsed.targets[0].ok, false);
});

void test('英翻中記下配對用的寫法：有括號的另記去掉括號的', () => {
  assert.deepEqual(one('go 英翻中', 'go :: 去').targets[0].pairWord, { exact: 'go', base: 'go' });
  assert.deepEqual(one('light（輕的） 英翻中', 'light :: 輕的').targets[0].pairWord, { exact: 'light(輕的)', base: 'light' });
  assert.equal(one('go 中翻英', 'Q :: go').targets[0].pairWord, undefined);
});

void test('第 2 步的提示：變化是原形；文法是文法點，題目已經寫了就沒有；中翻英照舊', () => {
  const target = (name: string, prompt: string) => one(name, prompt).targets[0];
  assert.equal(typedHint(target('lie（躺） 過去式', 'He ＿＿ down. :: lay'), 'He ＿＿ down.'), 'lie');
  const grammar = target('現在完成式（從過去持續到現在） 文法', 'I ＿＿ Tom. (know) :: have known');
  assert.equal(typedHint(grammar, 'I ＿＿ Tom since I was six. (know)'), '現在完成式');
  assert.equal(typedHint(grammar, '（**現在完成式**）I ＿＿ Tom since I was six. (know)'), null);
  assert.equal(typedHint(target('light（輕的） 中翻英', 'Q :: light'), 'Q'), 'light');
  assert.equal(typedHint(target('寨 字形', 'Q :: A'), 'Q'), null);
});
