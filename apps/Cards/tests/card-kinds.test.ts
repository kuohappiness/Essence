import test from 'node:test';
import assert from 'node:assert/strict';
import { parseDeck } from '../src/core/deck/index.ts';
import type { Target } from '../src/core/deck/index.ts';
import { cardOf, questionType } from '../src/core/study/index.ts';
import { setup, view } from './helpers/pick-session.ts';

// 卡型分類表（題型模組討論稿 §5 第 0 段，apps/Cards/docs/Claude Codex Discussion/2026-11-25-question-type-modules.md）：
// 名稱 × 題目形狀 × 科目，釘住現在認成哪一種卡型、每一題用哪個題型、有哪些提示。卡型之間會不會互搶，從此由這張表擋。
// 預期值逐格對過 syntax.md §2-3（中翻英、文法與變化、比較卡、全詩順序、句子排序）與接句的任務說明，不是用同樣的算法再算一次。
// 加一種卡型（例如多音字）時：會變的格改掉，再加它自己的列；其他格變了就是互搶。之後把 Target 的卡型欄位併成一欄時，只改 kindOf。

/** 現在的卡型：Target 的 kind（題型模組 A1 把六個卡型欄位併成一欄），排序照樣子分、文法與變化照種類分；沒有卡型時看方向。 */
function kindOf(target: Target): string {
  const kind = target.kind;
  if (!kind) return target.direction ?? 'flip';
  switch (kind.id) {
    case 'group': return 'group';
    case 'polyphone': return 'choice';
    case 'order': return kind.order.style + '-order';
    case 'couplet': return 'couplet';
    case 'typing': return 'typing-' + kind.typing.style;
  }
}

/** 一個目標底下一題，四種題目形狀；w 是這個名稱該填的字（比較句的答案、填空挖的字）。 */
const SHAPES = {
  qa: (w: string) => `一般的問題？ :: ${w}`,
  sentence: (w: string) => `題幹有一個＿＿空格。 :: ${w}`,
  cloze1: (w: string) => `題幹 ==${w}== 結尾。`,
  cloze2: () => '==人閒桂花落==，==夜靜春山空==。',
} as const;
type Shape = keyof typeof SHAPES;
const ORDER: readonly Shape[] = ['qa', 'sentence', 'cloze1', 'cloze2'];

/** 一格：「卡型 題型」，有提示或錯誤時接代碼。 */
function cell(subject: string, name: string, w: string, shape: Shape): string {
  const deck = parseDeck(`---\n科目: ${subject}\n---\n- ${name}\n    - ${SHAPES[shape](w)}\n`);
  assert.equal(deck.targets.length, 1, `${subject}｜${name}｜${shape}`);
  const target = deck.targets[0];
  const types = target.prompts.map(prompt => target.kind?.id === 'group' || target.kind?.id === 'polyphone' ? 'pick' : questionType(cardOf({ lt: 'aaa111', deck: 'd', target, prompt, isNew: false, early: false })));
  return [kindOf(target), ...types, ...deck.problems.map(problem => problem.code)].join(' ');
}

/** [名稱, 填的字, 國語的四格, 英文的四格]；四格照 qa、sentence、cloze1、cloze2。非英文的科目都和國語相同。 */
const ROWS: readonly [string, string, readonly string[], readonly string[]][] = [
  ['能說明擴散', '擴散',
    ['flip flip', 'flip flip', 'flip flip', 'flip flip'],
    ['flip flip', 'flip flip', 'flip flip', 'flip flip']],
  // 英翻中照翻面；中翻英的填空題照翻面並提示（§2-3〈中翻英要打字〉）。
  ['borrow 英翻中', 'borrow',
    ['en-zh flip', 'en-zh flip', 'en-zh flip', 'en-zh flip'],
    ['en-zh flip', 'en-zh flip', 'en-zh flip', 'en-zh flip']],
  ['borrow 中翻英', 'borrow',
    ['zh-en typed', 'zh-en typed', 'zh-en flip cloze-not-typed', 'zh-en flip cloze-not-typed'],
    ['zh-en typed', 'zh-en typed', 'zh-en flip cloze-not-typed', 'zh-en flip cloze-not-typed']],
  // 文法與變化只在英文的卡組（§2-3〈文法與不規則變化也打字〉）。
  ['go 過去式', 'went',
    ['flip flip', 'flip flip', 'flip flip', 'flip flip'],
    ['typing-inflection typed', 'typing-inflection typed', 'typing-inflection flip cloze-not-typed', 'typing-inflection flip cloze-not-typed']],
  ['現在完成式 文法', 'have known',
    ['flip flip', 'flip flip', 'flip flip', 'flip flip'],
    ['typing-grammar typed', 'typing-grammar typed', 'typing-grammar flip cloze-not-typed', 'typing-grammar flip cloze-not-typed']],
  // 比較卡認括號不認結尾；結尾是相似字、比較時讀不成才提示（§2-3〈比較卡〉）。
  ['寨（寨、塞） 相似字', '寨',
    ['flip flip pick-not-recognized', 'group pick', 'flip flip pick-not-recognized', 'flip flip pick-not-recognized'],
    ['flip flip pick-not-recognized', 'group pick', 'flip flip pick-not-recognized', 'flip flip pick-not-recognized']],
  ['borrow（borrow、lend） 比較', 'borrow',
    ['flip flip pick-not-recognized', 'group pick', 'flip flip pick-not-recognized', 'flip flip pick-not-recognized'],
    ['flip flip pick-not-recognized', 'group pick', 'flip flip pick-not-recognized', 'flip flip pick-not-recognized']],
  ['寨（寨、塞） 寫法', '寨',
    ['flip flip', 'group pick', 'flip flip', 'flip flip'],
    ['flip flip', 'group pick', 'flip flip', 'flip flip']],
  // 相似詞（D-230）和相似字一樣：讀不成比較卡時提示。
  ['節（節、筋） 相似詞', '節',
    ['flip flip pick-not-recognized', 'group pick', 'flip flip pick-not-recognized', 'flip flip pick-not-recognized'],
    ['flip flip pick-not-recognized', 'group pick', 'flip flip pick-not-recognized', 'flip flip pick-not-recognized']],
  // 互搶：方向的結尾不看組；組佔了名稱、又不成比較卡時照翻面、不提示（Fable 審查 F3）。
  ['borrow（borrow、lend） 中翻英', 'borrow',
    ['zh-en typed', 'zh-en typed', 'zh-en flip cloze-not-typed', 'zh-en flip cloze-not-typed'],
    ['zh-en typed', 'zh-en typed', 'zh-en flip cloze-not-typed', 'zh-en flip cloze-not-typed']],
  ['borrow（borrow、lend） 文法', 'borrow',
    ['flip flip', 'group pick', 'flip flip', 'flip flip'],
    ['flip flip', 'group pick', 'flip flip', 'flip flip']],
  // 排序：非英文是全詩順序（不用寫全詩）；英文沒寫全詩是句子排序（§2-3〈全詩順序卡〉〈英文的句子排序〉）。
  ['鳥鳴澗 全詩 排序', '人閒桂花落',
    ['flip flip', 'flip flip', 'flip flip', 'poem-order pick'],
    ['flip flip', 'flip flip', 'flip flip', 'poem-order pick']],
  ['間接問句 排序', 'where',
    ['flip flip', 'flip flip', 'flip flip', 'poem-order pick'],
    ['flip flip', 'flip flip', 'flip flip', 'sentence-order pick']],
  ['鳥鳴澗 第 1 句 接句', '夜靜春山空',
    ['flip flip', 'flip flip', 'couplet flip', 'flip flip'],
    ['flip flip', 'flip flip', 'couplet flip', 'flip flip']],
  // 多音字（D-230 第 4 點）：題目裡沒有「長（＿＿）」這種句子時讀不成，照翻面並提示；讀得成的在下面自己的測試。
  ['長（ㄓㄤˇ、ㄔㄤˊ） 讀音', 'ㄓㄤˇ',
    ['flip flip pick-not-recognized', 'flip flip pick-not-recognized', 'flip flip pick-not-recognized', 'flip flip pick-not-recognized'],
    ['flip flip pick-not-recognized', 'flip flip pick-not-recognized', 'flip flip pick-not-recognized', 'flip flip pick-not-recognized']],
];

for (const [name, w, chinese, english] of ROWS) {
  void test(`卡型分類表：${name}`, () => {
    for (const [subject, expected] of [['國語', chinese], ['社會', chinese], ['英文', english]] as const) {
      assert.deepEqual(ORDER.map(shape => cell(subject, name, w, shape)), expected, `${subject}｜${name}`);
    }
  });
}

void test('卡型分類表：多音字的句子（字後面接（＿＿））認成多音字，每一題都點選、沒有提示，各科一樣', () => {
  for (const subject of ['國語', '英文']) {
    const deck = parseDeck(`---\n科目: ${subject}\n---\n- 長（ㄓㄤˇ、ㄔㄤˊ） 讀音\n    - 他長（＿＿）得比哥哥高。 :: ㄓㄤˇ\n    - 這條路很長（＿＿）。 :: ㄔㄤˊ\n`);
    const target = deck.targets[0];
    assert.equal(kindOf(target), 'choice', subject);
    assert.equal(target.prompts.length, 2, subject);
    assert.deepEqual(deck.problems, [], subject);
  }
});

void test('卡型分類表：最上層直接寫的題目一律照翻面，不看結尾與形狀', () => {
  for (const subject of ['國語', '英文']) {
    for (const line of ['題幹有一個＿＿空格。 :: 寨', '==人閒桂花落==，==夜靜春山空==。', 'borrow :: 借入', '借入 :: borrow']) {
      const deck = parseDeck(`---\n科目: ${subject}\n---\n- ${line}\n`);
      assert.equal(deck.targets[0].implicit, true, line);
      assert.equal(kindOf(deck.targets[0]), 'flip', `${subject}｜${line}`);
      assert.deepEqual(deck.problems, [], `${subject}｜${line}`);
    }
  }
});

// 每一種卡型一個例子，從筆記的文字經過今天的份、組卡、作答流程（題型接點的範例表只有三個題型各一例，Fable 審查 F8）。
const KIND_SAMPLES: readonly { kind: string; type: string; subject: string; text: string }[] = [
  { kind: 'flip', type: 'flip', subject: '國語', text: '- 能說明擴散 ^aaa111\n    - 擴散是什麼？ :: 粒子散開\n' },
  { kind: 'en-zh', type: 'flip', subject: '英文', text: '- borrow 英翻中 ^aaa111\n    - borrow :: 借入\n' },
  { kind: 'couplet', type: 'flip', subject: '國語', text: '## 鳥鳴澗\n\n- 鳥鳴澗 第 1 句 接句 ^aaa111\n    - 人閒桂花落，==夜靜春山空==。\n' },
  { kind: 'zh-en', type: 'typed', subject: '英文', text: '- borrow 中翻英 ^aaa111\n    - 借入 :: borrow\n' },
  { kind: 'typing-grammar', type: 'typed', subject: '英文', text: '- 現在完成式 文法 ^aaa111\n    - I ＿＿ Tom since I was six. (know) :: have known\n' },
  { kind: 'typing-inflection', type: 'typed', subject: '英文', text: '- go 過去式 ^aaa111\n    - Yesterday I ＿＿ to school.（去） :: went\n' },
  { kind: 'group', type: 'pick', subject: '國語', text: '- 寨（寨、塞） 相似字 ^aaa111\n    - 山＿＿ :: 寨\n- 塞（寨、塞） 相似字 ^bbb222\n    - 大＿＿車 :: 塞\n' },
  { kind: 'choice', type: 'pick', subject: '國語', text: '- 長（ㄓㄤˇ、ㄔㄤˊ） 讀音 ^aaa111\n    - 他長（＿＿）得比哥哥高。 :: ㄓㄤˇ\n    - 這條路很長（＿＿）。 :: ㄔㄤˊ\n' },
  { kind: 'poem-order', type: 'pick', subject: '國語', text: '## 鳥鳴澗\n\n- 鳥鳴澗 全詩 排序 ^aaa111\n    - ==人閒桂花落==，==夜靜春山空==。\n' },
  { kind: 'sentence-order', type: 'pick', subject: '英文', text: '- 間接問句 排序 ^aaa111\n    - 我不知道他住在哪裡。I don\'t know ==where== ==he== ==lives==.\n' },
];

for (const { kind, type, subject, text } of KIND_SAMPLES) {
  void test(`卡型範例：${kind} 從筆記到今天的份，出來是 ${type}`, async t => {
    const h = await setup(t, { [`Essence Cards/${subject}/範例.md`]: `---\n科目: ${subject}\n---\n${text}` });
    const s = await h.open({ subject });
    const card = view(s).card;
    assert.equal(kindOf(card.target), kind);
    assert.equal(questionType(card), type);
  });
}
