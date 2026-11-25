import test from 'node:test';
import assert from 'node:assert/strict';
import { EXISTING_WHY, planExisting } from '../src/core/ai/index.ts';
import type { ExistingInput } from '../src/core/ai/index.ts';
import { parseDeck } from '../src/core/deck/index.ts';

// tasks/ai-cards-add.md §3-2：加進已有的學習目標，只加缺的（一對一配對）、窄版防呆、留項條件、寫前寫後核對。只用自編的內容。

const SRC = 'Essence Cards/學業/國二上/自然/2-2.md';
const DEST = 'Essence Cards/學業/國二上/自然/2-1.md';
const head = (unit: string): string => `---\n年級學期: 國二上\n科目: 自然\n單元: "${unit}"\n---\n`;
/** 來源預設是同一個單元的另一篇（出處與補課在 ai-add-sources.test.ts）；驗收那一例用 2-2。 */
const srcProps = parseDeck(head('2-1 密度')).props;
const otherUnit = { path: SRC, props: parseDeck(head('2-2 水溶液')).props };
/** 目的地：一個目標 q8z3ka，body 是它底下的行（每行前面已經有縮排）。 */
const dest = (...body: string[]): string => head('2-1 密度') + ['- 能用密度判斷物體的浮沉 ^q8z3ka', ...body].join('\n') + '\n';
/** 框裡的那一項（去掉 `> ` 之後）。 */
const item = (...body: string[]): string => ['- [[國二上自然 2-1#^q8z3ka|能用密度判斷物體的浮沉]]', ...body].join('\n');
const input = (original: string, text: string, extra: Partial<ExistingInput> = {}): ExistingInput =>
  ({ original, id: 'q8z3ka', source: { path: SRC, props: srcProps }, dest: { path: DEST, text }, version: '0.5.0', ...extra });
const planned = (original: string, text: string, extra: Partial<ExistingInput> = {}): string => {
  const plan = planExisting(input(original, text, extra));
  assert.equal(plan.kind, 'plan', JSON.stringify(plan));
  assert.ok(plan.kind === 'plan' && plan.text !== null, '要有改字');
  return plan.text;
};
const left = (original: string, text: string, extra: Partial<ExistingInput> = {}): string => {
  const plan = planExisting(input(original, text, extra));
  assert.equal(plan.kind, 'leave', JSON.stringify(plan));
  return plan.kind === 'leave' ? plan.why : '';
};
const already = (original: string, text: string): void => { assert.deepEqual(planExisting(input(original, text)), { kind: 'plan', text: null }); };

const Q1 = '    - 密度怎麼算？ :: 質量除以體積';
const Q2 = '    - 雞蛋在清水裡會沉，在濃鹽水裡卻浮起來，為什麼？ :: 鹽水的**密度變大**，比雞蛋**大**';

void test('§3-2 驗收：syntax §2-9 的加進已有，題目接在最後一題後面、出處補年級學期與單元；再算一次是「已經在」', () => {
  const before = dest('    - 出處：p.30', Q1, '        - 補充：說明', '', '- 能說出浮力 ^p7q2w8', '    - 浮力？ :: 向上的力');
  const out = planned(item('    - 出處：p.46', Q2), before, { source: otherUnit });
  assert.equal(out, dest('    - 出處：p.30、國二上 2-2 p.46', Q1, '        - 補充：說明', Q2, '', '- 能說出浮力 ^p7q2w8', '    - 浮力？ :: 向上的力'));
  const target = parseDeck(out).targets[0];
  assert.equal(target.prompts.length, 2);
  assert.deepEqual(target.fields.sources, ['p.30', '國二上 2-2 p.46']);
  assert.deepEqual(planExisting(input(item('    - 出處：p.46', Q2), out, { source: otherUnit })), { kind: 'plan', text: null });
});

void test('§3-2 一對一配對：部分已在只加缺的；來源兩份相同、目的地一份就加一份；單位之間的順序不算', () => {
  const base = dest(Q1);
  assert.equal(planned(item(Q2, Q1), base), dest(Q1, Q2));
  assert.equal(planned(item(Q1, Q1), base), dest(Q1, Q1));
  already(item(Q1), dest(Q2, Q1));
  // 等價縮排、Tab、CRLF 算相同。
  already(item('\t- 密度怎麼算？ :: 質量除以體積'), dest(Q1));
  already(item(Q1), dest(Q1).replaceAll('\n', '\r\n'));
});

void test('§3-2 單位的完整範圍：題下的補充跟著那一題；同一段補充在另一題底下不算；多行答案的行序照字比', () => {
  const extra = '        - 記住：單位體積的質量';
  assert.equal(planned(item(Q2, extra), dest(Q1)), dest(Q1, Q2, extra));
  // 目的地的補充在 Q1 底下，來源在 Q2 底下：Q2 連同補充要加。
  assert.equal(planned(item(Q2, extra), dest(Q1, extra)), dest(Q1, extra, Q2, extra));
  const multi = (a: string, b: string): string[] => ['    - 夏天的昆蟲 ::', `        - ${a}`, `        - ${b}`];
  // 「草／蚱蜢」和「蚱蜢／草」不同：多行答案不同、題目相同 → 窄版防呆留項。
  assert.equal(left(item(...multi('蚱蜢', '草')), dest(...multi('草', '蚱蜢'))), EXISTING_WHY.qaConflict('2-1'));
});

void test('§3-2 窄版防呆：問答同題異答留項；同題同答是已經在；填空不擋；行內空白不同的程式字串不算同題；打字題答案換順序也擋', () => {
  assert.equal(left(item('    - 密度怎麼算？ :: 體積除以質量'), dest(Q1)), EXISTING_WHY.qaConflict('2-1'));
  already(item(Q1), dest(Q1));
  assert.equal(left(item('    - 舉一種會導電的金屬 :: 鋁'), dest('    - 舉一種會導電的金屬 :: 銅')), EXISTING_WHY.qaConflict('2-1'));
  assert.equal(planned(item('    - 密度是==質量==除以體積'), dest('    - 密度是質量除以==體積==')), dest('    - 密度是質量除以==體積==', '    - 密度是==質量==除以體積'));
  assert.equal(planned(item('    - `"a  b"` 的長度？ :: 4'), dest('    - `"a b"` 的長度？ :: 3')), dest('    - `"a b"` 的長度？ :: 3', '    - `"a  b"` 的長度？ :: 4'));
  assert.equal(left(item('    - 影響 :: influence | affect'), dest('    - 影響 :: affect | influence')), EXISTING_WHY.qaConflict('2-1'));
});

void test('§3-2 同指紋不同詳解：留項，提示補充不一樣', () => {
  assert.equal(left(item(Q1, '        - 詳解：乙'), dest(Q1, '        - 詳解：甲')), EXISTING_WHY.sameQuestion);
});

void test('§3-2 欄位：備註、錯題補強在資料欄位後面加一行，照讀出的值比；類型、重要性、狀態不搬；只有不搬的欄位留項', () => {
  assert.equal(planned(item('    - 備註：容易和重量搞混', Q1), dest('    - 類型：計算', Q1)), dest('    - 類型：計算', '    - 備註：容易和重量搞混', Q1));
  // `備註：甲、乙` 和分兩行寫甲、乙相同。
  already(item('    - 備註：甲、乙', Q1), dest('    - 備註：甲', '    - 備註：乙', Q1));
  // 備註的值不能拿錯題補強的值充數。
  assert.equal(planned(item('    - 備註：甲'), dest('    - 錯題補強：甲', Q1)), dest('    - 錯題補強：甲', '    - 備註：甲', Q1));
  assert.equal(left(item('    - 類型：計算｜重要性：高'), dest(Q1)), EXISTING_WHY.nothing);
  assert.equal(left(item('    - 備註：', '        - 甲'), dest(Q1)), EXISTING_WHY.multiline);
});

void test('§3-2 欄位那一行底下還有字（子項目或接續行）一律留項：複合欄位的首項或非首項、不搬的欄位、出處都一樣（L2 R2）', () => {
  const lines = [
    '    - 類型：事實｜備註：甲', '    - 備註：甲｜類型：事實', '    - 重要性：高｜錯題補強：乙', '    - 錯題補強：乙｜重要性：高',
    '    - 類型：事實', '    - 出處：p.46', '    - 備註：甲',
  ];
  for (const line of lines) {
    for (const below of ['        - 家長補充不可刪', '      家長補充不可刪']) {
      assert.equal(left(item(line, below, '    - 新問 :: 新答'), dest(Q1)), EXISTING_WHY.multiline, `${line} / ${below}`);
    }
  }
  // 底下沒有字的複合欄位照常：備註照讀出的值加一行，類型不搬。
  assert.equal(planned(item('    - 類型：事實｜備註：甲', Q2), dest(Q1)), dest('    - 備註：甲', Q1, Q2));
});

void test('§3-2 留項：欄位在題目或補充底下、這一項讀不懂、目的地找不到或是隱含題或寫錯', () => {
  assert.equal(left(item(Q1, '        - 出處：p.3'), dest(Q2)), EXISTING_WHY.fieldInside);
  assert.equal(left(item('    - 記憶錨點：重的沉', '        - 狀態：暫停'), dest(Q1)), EXISTING_WHY.fieldInside);
  assert.equal(left(item('    - :: 沒有題目'), dest(Q1)), EXISTING_WHY.broken);
  assert.equal(left(item(Q2), dest(Q1), { id: 'zzzzz2' }), EXISTING_WHY.noTarget);
  assert.equal(left(item(Q2), head('2-1 密度') + '- 密度？ :: 質量除以體積 ^q8z3ka\n'), EXISTING_WHY.noTarget);
  assert.equal(left(item(Q2), dest('    - :: 沒有題目', Q1)), EXISTING_WHY.noTarget);
});

void test('§3-2 只有記憶錨點或圖片：接在這一項的最後；縮排對齊目的地子項目那一層，縮排字元照目的地', () => {
  const anchor = ['    - 記憶錨點：重的沉', '        - 輕的浮'];
  assert.equal(planned(item(...anchor), dest(Q1, '        - 補充')), dest(Q1, '        - 補充', ...anchor));
  const tabbed = head('2-1 密度') + '- 能用密度判斷物體的浮沉 ^q8z3ka\n\t- 密度怎麼算？ :: 質量除以體積\n';
  assert.equal(planned(item(Q2), tabbed), tabbed + '\t' + Q2.trimStart() + '\n');
  assert.equal(planned(item('    - ![[密度.png]]'), dest(Q1), { resolve: link => `附件/${link}` }), dest(Q1, '    - ![[密度.png]]'));
});

void test('§3-2 區塊 ID 與連結：跨篇的行帶區塊 ID 留項（目的地已有同文也留）；連結兩邊解析到不同檔或解析不到留項；同一篇照常', () => {
  const tagged = '    - 密度怎麼算？ :: 質量除以體積 ^abc123';
  assert.equal(left(item(tagged), dest(Q2)), EXISTING_WHY.links);
  assert.equal(left(item(tagged), dest(tagged)), EXISTING_WHY.links);
  const linked = '    - 看 [[筆記#段落|這裡]]，密度怎麼算？ :: 質量除以體積';
  assert.equal(left(item(linked), dest(Q2), { resolve: (link, from) => from === SRC ? `甲/${link}` : `乙/${link}` }), EXISTING_WHY.links);
  assert.equal(left(item(linked), dest(Q2)), EXISTING_WHY.links);
  assert.equal(left(item('    - 密度？ :: 看 [這裡](筆記.md#段落)'), dest(Q2), { resolve: () => null }), EXISTING_WHY.links);
  assert.equal(planned(item(linked), dest(Q2), { resolve: link => `同一個/${link}` }), dest(Q2, linked));
  assert.equal(planned(item('    - 密度？ :: 看 [網頁](https://x.test/a)'), dest(Q2)), dest(Q2, '    - 密度？ :: 看 [網頁](https://x.test/a)'));
  assert.equal(planned(item(tagged), dest(Q2), { source: { path: DEST, props: parseDeck(head('2-1 密度')).props } }), dest(Q2, tagged));
});

void test('§3-2 寫前寫後核對：比較卡混進普通問答（新的寫法問題）不寫；比較卡加同組的句子照常', () => {
  const pick = (...body: string[]): string => head('2-1 密度') + ['- 寨（寨、塞） 相似字 ^q8z3ka', '    - 山＿＿。 :: 寨', ...body].join('\n') + '\n';
  const pickItem = (...body: string[]): string => ['- [[國二上自然 2-1#^q8z3ka|寨（寨、塞） 相似字]]', ...body].join('\n');
  assert.equal(left(pickItem('    - 寨是什麼？ :: 營'), pick()), EXISTING_WHY.verify);
  assert.equal(planned(pickItem('    - 村＿＿。 :: 寨'), pick()), pick('    - 村＿＿。 :: 寨'));
  // 其他目標完全不變：另一個目標的內容和行都照舊。
  const two = dest(Q1, '', '- 能說出浮力 ^p7q2w8', '    - 浮力？ :: 向上的力');
  const out = planned(item(Q2), two);
  assert.deepEqual(parseDeck(out).targets[1].prompts.map(p => p.fingerprint), parseDeck(two).targets[1].prompts.map(p => p.fingerprint));
});

void test('多音字（tasks/polyphone-pick.md §5）：加合規的句子照常、再算一次是已經在；括號外的讀音、空格不合規、普通問答不寫；翻面的讀音卡照原池加題', () => {
  const choice = (...body: string[]): string => head('2-1 密度') + ['- 長（ㄓㄤˇ、ㄔㄤˊ） 讀音 ^q8z3ka', '    - 他長（＿＿）得比哥哥高。 :: ㄓㄤˇ', '    - 這條路很長（＿＿）。 :: ㄔㄤˊ', ...body].join('\n') + '\n';
  const choiceItem = (...body: string[]): string => ['- [[國二上自然 2-1#^q8z3ka|長（ㄓㄤˇ、ㄔㄤˊ） 讀音]]', ...body].join('\n');
  const more = '    - 小樹苗慢慢長（＿＿）大了。 :: ㄓㄤˇ';
  const out = planned(choiceItem(more), choice());
  assert.equal(out, choice(more));
  assert.ok(parseDeck(out).targets[0].choice);
  already(choiceItem(more), out);
  for (const bad of ['    - 他長（＿＿）得很快。 :: ㄓㄤ', '    - 他長__得很快。 :: ㄓㄤˇ', '    - 「長」有幾種念法？ :: 兩種']) assert.equal(left(choiceItem(bad), choice()), EXISTING_WHY.verify, bad);
  // 已有的翻面讀音卡（名稱沒有括號）：照原池的問句加題，還是翻面。
  const flip = (...body: string[]): string => head('2-1 密度') + ['- 長 讀音 ^q8z3ka', '    - 「他長得比哥哥高」的長怎麼念？ :: ㄓㄤˇ', ...body].join('\n') + '\n';
  const flipItem = (...body: string[]): string => ['- [[國二上自然 2-1#^q8z3ka|長 讀音]]', ...body].join('\n');
  const asked = '    - 「這條路很長」的長怎麼念？ :: ㄔㄤˊ';
  assert.equal(planned(flipItem(asked), flip()), flip(asked));
});
