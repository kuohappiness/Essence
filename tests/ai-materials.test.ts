import test from 'node:test';
import assert from 'node:assert/strict';
import { learnedWord, parseDeck } from '../src/core/deck/index.ts';
import { buildPrompt, learnedWords, readJobs, RULE_SUBJECTS, sha256Hex, taskSection } from '../src/core/ai/index.ts';
import type { CardForm, RuleSubject } from '../src/core/ai/index.ts';

// AI 製卡第 3 批（tasks/ai-cards-materials.md §1、D-210 第 4 點）：英文已學過的單字。

const english = (body: string): string => `---\n科目: 英文\n年級學期: 國二上\n單元: L3\n狀態: 啟用\n---\n${body}`;

// §1-1 的表，含 syntax §2-3 第二個意思那一條的例子。
for (const [name, expected] of [
  ['light 英翻中', 'light'],
  ['light（輕的） 英翻中', 'light'],
  ['light（輕的） 中翻英', 'light'],
  ['bank（河岸） 英翻中', 'bank'],
  ["make up one's mind 中翻英", "make up one's mind"],
  ['take（搭乘） a bus 中翻英', 'take（搭乘） a bus'],
  ['go 過去式', 'go'],
  ['lie（躺） 過去式', 'lie'],
  ['borrow（borrow、lend） 比較', null],
  ['現在完成式（從過去持續到現在） 文法', null],
  ['間接問句 排序', null],
  ['能說明擴散', null],
] as const) void test('§1-1 名稱的字 ' + JSON.stringify(name), () => {
  const deck = parseDeck(english(`- ${name}\n    - Q ＿＿ :: light\n`));
  assert.equal(learnedWord(deck.targets[0]), expected);
});

const deckOf = (path: string, front: string, body: string): { path: string; deck: ReturnType<typeof parseDeck> } => ({ path, deck: parseDeck(`---\n${front}\n---\n${body}`) });

void test('§1-2 同一批卡組、去重、照第一次出現的順序、只看單字的目標', () => {
  const decks = [
    deckOf('b.md', '科目: 英文\n年級學期: 國二上\n單元: L2\n狀態: 啟用', '- Light 英翻中 ^bbbbb2\n    - light :: n. 光\n- light（輕的） 英翻中 ^bbbbb3\n    - light :: adj. 輕的\n- 現在完成式 文法 ^bbbbb4\n    - I ＿＿ him. (know) :: have known\n'),
    deckOf('a.md', '科目: 英文\n年級學期: 國一下\n單元: L5\n狀態: 啟用', '- borrow 英翻中 ^aaaaa2\n    - borrow :: v. 借入\n- borrow 中翻英 ^aaaaa3\n    - 借 ＿＿ :: borrow\n- go 過去式 ^aaaaa4\n    - I ＿＿ home. :: went\n'),
    deckOf('c.md', '科目: 英文\n年級學期: 國二下\n單元: L1\n狀態: 啟用', '- later 英翻中 ^ccccc2\n    - later :: adv. 之後\n'),
    deckOf('d.md', '科目: 英文\n年級學期: 國二上\n單元: L3\n狀態: 草稿', '- draft 英翻中 ^ddddd2\n    - draft :: n. 草稿\n'),
    deckOf('e.md', '科目: 自然\n年級學期: 國二上\n單元: 2-1\n狀態: 啟用', '- water 英翻中 ^eeeee2\n    - water :: 水\n'),
    deckOf('f.md', '科目: 英文\n年級學期: 國二上\n單元: L1\n狀態: 暫停', '- go（走） 英翻中 ^fffff2\n    - go :: v. 走\n- skip 英翻中 ^fffff3\n    - skip :: v. 跳過\n'),
  ];
  // 國一下的 a 在前，國二上 L1 的 f、L2 的 b；國二下、草稿、別科不算；Light 和 light 同一個字，照第一次的寫法；go 第二次不列。
  assert.deepEqual(learnedWords(decks, '英文', '國二上'), ['borrow', 'go', 'skip', 'Light']);
  // 重複的 ID 跳過（同 existingTargets）。
  assert.deepEqual(learnedWords(decks, '英文', '國二上', new Set(['fffff3'])), ['borrow', 'go', 'Light']);
});

const form = (over: Partial<CardForm> = {}): CardForm => ({ subject: 'english', term: '國二上', unit: 'L3', purpose: '準備段考', supplement: false, pick: true, adjust: '', material: '', ...over });
const subject = (key: string): RuleSubject => RULE_SUBJECTS.find(each => each.key === key)!;
const lines = (text: string): string[] => text.split('\n');

void test('§1-3 英文的已有單字接在已有目標後面；沒有寫無；其他科沒有這一行', () => {
  const task = lines(taskSection(form(), subject('english'), [{ id: 'aaaaa2', name: 'borrow 英翻中', source: '國一下 L5', path: 'a.md', first: 'borrow :: v. 借入' }], ['borrow', "make up one's mind"]));
  const at = task.indexOf('  - aaaaa2 borrow 英翻中｜國一下 L5｜第一題：borrow :: v. 借入');
  assert.equal(task[at + 1], "- 孩子已有的英文單字（只用來挑記憶錨點的連結，不用來判斷加題）：borrow、make up one's mind");
  assert.ok(taskSection(form(), subject('english'), [], []).includes('- 孩子已有的英文單字（只用來挑記憶錨點的連結，不用來判斷加題）：無'));
  assert.ok(!taskSection(form({ subject: 'science' }), subject('science'), []).includes('英文單字'));
});

void test('§2-2、§3 點選填空：任務資料一行，「另外」寫勾或沒勾的規則；提示 v4', () => {
  const on = lines(taskSection(form(), subject('science'), []));
  assert.equal(on[on.indexOf('- 允許 AI 補充：否') + 1], '- 點選填空：要');
  assert.ok(on.includes('- 家長勾了點選填空：容易混淆的一組字、詞或觀念（說得出這一課容易錯在哪），寫成點選填空的比較：'));
  assert.ok(on.some(line => line.includes('`borrow（borrow、lend） 比較`')));
  assert.ok(!on.some(line => line.startsWith('- 家長沒勾')));
  const off = lines(taskSection(form({ pick: false }), subject('science'), []));
  assert.equal(off[off.indexOf('- 允許 AI 補充：否') + 1], '- 點選填空：不要');
  assert.ok(off.some(line => line.startsWith('- 家長沒勾點選填空：比較題寫成一般的問答題')));
  assert.ok(!off.some(line => line.startsWith('- 家長勾了')));
  // 規則在「另外」底下，不在任務資料裡。
  assert.ok(on.indexOf('另外：') < on.findIndex(line => line.startsWith('- 家長勾了')));
  const prompt = buildPrompt(form(), subject('english'), [], [], ['go']);
  assert.equal(prompt.parts.at(-1)!.version, '提示 v4');
  assert.ok(prompt.text.includes('：go'));
});

void test('§2-1 預設：國語、英文勾，其他不勾', () => {
  assert.deepEqual(Object.fromEntries(RULE_SUBJECTS.map(each => [each.key, each.pick])), { chinese: true, english: true, science: false, general: false, social: false });
});

void test('§2-3 提示 v4 之前存的工作（沒有 pick）照樣讀得懂；pick 不是布林的讀不懂', () => {
  const job = (formValue: Record<string, unknown>) => ({
    id: 'a', copiedAt: 'x', copiedMs: 0, form: formValue, subject: { key: 'science', label: '自然', subject: '自然', r3: true },
    parts: [{ name: '任務段', version: '提示 v3', text: 't', sha256: sha256Hex('t') }], promptSha: 'p', existing: [], save: null,
  });
  const { pick: _pick, ...old } = form();
  assert.equal(readJobs([job(old)], 0).jobs.length, 1);
  assert.equal(readJobs([job({ ...old, pick: 'yes' })], 0).broken, 1);
});
