import test from 'node:test';
import assert from 'node:assert/strict';
import { baseForm, parseDeck, typedHint } from '../src/core/deck/index.ts';

// 英文的文法與變化的認法（tasks/english-typed-order.md §1、§2）：英文的卡組裡從名稱的結尾認，問答題打字。預期值照任務說明的邊界例子手寫。

const english = (body: string) => parseDeck(`---\n科目: 英文\n---\n${body}`);
const one = (name: string, prompt = 'I ＿＿ to school. (go) :: went') => english(`- ${name}\n    - ${prompt}\n`);
const typingOf = (name: string) => one(name).targets[0].typing;

void test('變化的結尾：五種變化種類，前面要有半形、全形空白或右括號', () => {
  for (const ending of ['過去式', '過去分詞', '複數', '比較級', '最高級']) assert.equal(typingOf(`go ${ending}`)?.kind, 'inflection', ending);
  assert.deepEqual(typingOf('go　過去式'), { kind: 'inflection', hint: 'go', pair: { key: 'go', exact: false } });
  assert.deepEqual(typingOf('light（輕的）比較級'), { kind: 'inflection', hint: 'light', pair: { key: 'light(輕的)', exact: true } });
  assert.deepEqual(typingOf('lie（躺） 過去式'), { kind: 'inflection', hint: 'lie', pair: { key: 'lie(躺)', exact: true } });
  assert.deepEqual(typingOf('lie (躺) 過去式'), { kind: 'inflection', hint: 'lie', pair: { key: 'lie(躺)', exact: true } }, '半形括號、括號前有空白');
  assert.deepEqual(typingOf('**Go** 過去式'), { kind: 'inflection', hint: 'Go', pair: { key: 'go', exact: false } });
  assert.deepEqual(typingOf('**go 過去式**'), { kind: 'inflection', hint: 'go', pair: { key: 'go', exact: false } }, '整個名稱粗體也認得');
  assert.deepEqual(typingOf('give up 過去式'), { kind: 'inflection', hint: 'give up', pair: { key: 'give up', exact: false } });
});

void test('不是變化：別科、沒寫科目、字有中文、括號不成對或不只一組、結尾前沒有空白、方向優先、組優先、最上層直接寫題目', () => {
  assert.equal(parseDeck('---\n科目: 數學\n---\n- 能化簡 複數\n    - i² = ＿＿ :: -1\n').targets[0].typing, undefined);
  assert.equal(parseDeck('- go 過去式\n    - I ＿＿ to school. :: went\n').targets[0].typing, undefined);
  assert.equal(typingOf('能說出 go 的 過去式'), undefined);
  assert.equal(typingOf('go（去 過去式'), undefined);
  assert.equal(typingOf('go（v.）（去） 過去式'), undefined);
  assert.equal(typingOf('go過去式'), undefined);
  assert.equal(typingOf('過去式'), undefined);
  assert.equal(typingOf('go 過去式 中翻英'), undefined);
  assert.equal(one('borrow（borrow、lend） 文法', 'Can I ＿＿ your pen? :: borrow').targets[0].typing, undefined);
  assert.equal(one('borrow（borrow、lend） 文法', 'Can I ＿＿ your pen? :: borrow').targets[0].group?.title, '文法');
  assert.equal(english('- I ＿＿ to school. 過去式 :: went\n').targets[0].typing, undefined);
});

void test('沒寫科目時用呼叫端給的科目；屬性寫了照屬性', () => {
  assert.equal(parseDeck('- go 過去式\n    - I ＿＿ to school. :: went\n', { subject: '英文' }).targets[0].typing?.kind, 'inflection');
  assert.equal(parseDeck('---\n科目: 數學\n---\n- go 過去式\n    - I ＿＿ to school. :: went\n', { subject: '英文' }).targets[0].typing, undefined);
});

void test('文法：文法點是去掉最後一組括號（用法）的那段；沒有括號是整段；只有括號沒有提示；錯題補強的舊寫法不打字', () => {
  assert.deepEqual(typingOf('現在完成式（從過去持續到現在） 文法'), { kind: 'grammar', hint: '現在完成式', pair: null });
  assert.deepEqual(typingOf('動名詞(當主詞) 文法'), { kind: 'grammar', hint: '動名詞', pair: null });
  assert.deepEqual(typingOf('被動語態 文法'), { kind: 'grammar', hint: '被動語態', pair: null });
  assert.deepEqual(typingOf('（當主詞） 文法'), { kind: 'grammar', hint: null, pair: null });
  assert.deepEqual(typingOf('不定詞（to V）（當受詞） 文法'), { kind: 'grammar', hint: null, pair: null }, '前面還有括號的不猜文法點');
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

void test('英文卡組裡讀不成打字是錯誤（同中翻英）；填空題照翻面、只提示', () => {
  for (const prompt of ['Q :: 去', 'Q :: [[went]]', 'Q ::\n        - went\n        - gone']) {
    const parsed = one('go 過去式', prompt);
    assert.deepEqual(parsed.problems.map(p => [p.code, p.level]), [['typed-answer-invalid', 'error']], prompt);
    assert.match(parsed.problems[0].message, /^文法與變化的答案/);
    assert.equal(parsed.targets[0].ok, false, prompt);
  }
  const cloze = one('被動語態 文法', 'The window ==was broken==.');
  assert.deepEqual(cloze.problems.map(p => [p.code, p.level]), [['cloze-not-typed', 'hint']]);
  assert.equal(cloze.targets[0].ok, true);
});

void test('中翻英照舊：讀不成打字是錯誤，訊息照舊', () => {
  const parsed = one('go 中翻英', 'Q :: 去');
  assert.deepEqual(parsed.problems.map(p => [p.code, p.level]), [['typed-answer-invalid', 'error']]);
  assert.match(parsed.problems[0].message, /^中翻英的答案/);
  assert.equal(parsed.targets[0].ok, false);
});

void test('英翻中記下配對用的寫法：字和意思各自正規化，括號前的空白、全半形不算', () => {
  assert.deepEqual(one('go 英翻中', 'go :: 去').targets[0].pairWord, { exact: 'go', base: 'go' });
  assert.deepEqual(one('light（輕的） 英翻中', 'light :: 輕的').targets[0].pairWord, { exact: 'light(輕的)', base: 'light' });
  assert.deepEqual(one('Light(輕的)　英翻中', 'light :: 輕的').targets[0].pairWord, { exact: 'light(輕的)', base: 'light' });
  assert.equal(one('go 中翻英', 'Q :: go').targets[0].pairWord, undefined);
});

void test('中翻英的原形：方向前的空白半形全形都算', () => {
  assert.equal(baseForm(one('light（輕的）　中翻英', 'Q :: light').targets[0]), 'light');
  assert.equal(baseForm(one('go 中翻英', 'Q :: went').targets[0]), 'go');
});

void test('第 2 步的提示：變化是原形；文法是文法點，題目開頭用括號標了同一個文法點就沒有；中翻英照舊', () => {
  const target = (name: string, prompt: string) => one(name, prompt).targets[0];
  assert.equal(typedHint(target('lie（躺） 過去式', 'He ＿＿ down. :: lay'), 'He ＿＿ down.'), 'lie');
  const grammar = target('現在完成式（從過去持續到現在） 文法', 'I ＿＿ Tom. (know) :: have known');
  assert.equal(typedHint(grammar, 'I ＿＿ Tom since I was six. (know)'), '現在完成式');
  assert.equal(typedHint(grammar, '（**現在完成式**）I ＿＿ Tom since I was six. (know)'), null);
  assert.equal(typedHint(grammar, ' (現在完成式) I ＿＿ Tom.'), null);
  assert.equal(typedHint(grammar, '不要用現在完成式：I ＿＿ Tom.'), '現在完成式', '題目中間提到不算');
  assert.equal(typedHint(grammar, '（現在完成式的否定）I ＿＿ Tom.'), '現在完成式', '標的不是同一個');
  assert.equal(typedHint(target('light（輕的） 中翻英', 'Q :: light'), 'Q'), 'light');
  assert.equal(typedHint(target('寨 字形', 'Q :: A'), 'Q'), null);
});

void test('別科、沒寫科目的英翻中不記配對用的寫法（L2 其餘核對：解析結果和以前相同）', () => {
  assert.equal(parseDeck('- go 英翻中\n    - go :: 去\n').targets[0].pairWord, undefined);
  assert.equal(parseDeck('---\n科目: 國文\n---\n- go 英翻中\n    - go :: 去\n').targets[0].pairWord, undefined);
});
