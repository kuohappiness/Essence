import test from 'node:test';
import assert from 'node:assert/strict';
import { introBoxes, moveCandidates, WHY } from '../src/core/ai/index.ts';
import type { ItemRef } from '../src/core/ai/index.ts';
import { parseDeck } from '../src/core/deck/index.ts';
import { box, cand, savedExample } from './helpers/add-cases.ts';
import { kindCouplet, kindGroup } from './helpers/kinds.ts';

// tasks/ai-cards-add.md §2：候選卡片搬進同一篇的本文。只用 syntax.md 的例子與自編的內容。
// 輸入與搬完的全文另由 tests/deck.test.ts 的往返範例（deckCases）檢查往返與冪等（tests/helpers/add-cases.ts 的 ADD_INPUTS）。

const nobody = { elsewhere: () => false };
/** 這一篇候選框的每一項（或指定的幾項）。 */
const refs = (text: string, pick?: (item: ItemRef, i: number) => boolean): ItemRef[] =>
  introBoxes(text).filter(box => box.kind === 'candidate').flatMap(box => box.items).map(({ kind, id, original }) => ({ kind, id, original })).filter((ref, i) => pick ? pick(ref, i) : true);
const move = (text: string, pick?: (item: ItemRef, i: number) => boolean) => moveCandidates(text, refs(text, pick), nobody);
const fingerprints = (text: string): string[] => parseDeck(text).targets.flatMap(t => t.prompts.map(p => p.fingerprint));
const moved = (text: string, pick?: (item: ItemRef, i: number) => boolean): string => {
  const plan = move(text, pick);
  assert.deepEqual(plan.left, []);
  assert.ok(plan.text !== null);
  return plan.text;
};

void test('§2 驗收：syntax §2-9 存草稿後的例子，候選搬出來、ID 照舊、指紋相同、理由不見、框拿掉', () => {
  const text = savedExample();
  const before = parseDeck(text);
  const out = moved(text);
  const after = parseDeck(out);
  assert.equal(after.targets.length, before.targets.length + 1);
  const added = after.targets.at(-1)!;
  assert.equal(added.id, 'c4ndd2');
  assert.equal(added.name, '能說明溫度對溶解度的影響');
  assert.equal(added.section, '2 擴散現象');
  assert.deepEqual(added.fields.sources, ['p.45 知識快遞']);
  const inBox = parseDeck('- 能說明溫度對溶解度的影響 ^c4ndd2\n    - 出處：p.45 知識快遞｜類型：因果\n    - 水溫升高時，糖在水中的溶解度會怎麼變？ :: 變**大**\n').targets[0];
  assert.deepEqual(added.prompts.map(p => p.fingerprint), inBox.prompts.map(p => p.fingerprint));
  assert.ok(!out.split('\n').some(line => line.includes('理由')));
  assert.ok(!out.includes('候選卡片'));
  // 加進已有的框照舊，候選搬到本文最後一個目標後面、加進已有的框前面。
  assert.ok(out.includes('> [!note] 加進已有的學習目標'));
  assert.ok(out.indexOf('- 能說明溫度對溶解度的影響 ^c4ndd2') < out.indexOf('> [!note] 加進已有的學習目標'));
  assert.ok(out.endsWith('比雞蛋**大**\n'), '框在檔尾時拿掉，前面的空行不多留，檔尾換行照舊');
});

void test('§2 冪等：同一項按兩次，第二次在新文字裡找不到，不改任何字', () => {
  const text = savedExample();
  const ref = refs(text);
  const once = moveCandidates(text, ref, nobody);
  assert.ok(once.text);
  const twice = moveCandidates(once.text, ref, nobody);
  assert.equal(twice.text, null);
  assert.deepEqual(twice.left.map(each => each.why), [WHY.changed]);
});

void test('§2 插在哪：最後一個目標完整根項的後面，和前後的區塊之間補一個外部空行（段落、表格、程式圍欄、一般清單、下一個標題）', () => {
  const tail = [
    '一般筆記',
    '| a | b |\n|---|---|\n| 1 | 2 |',
    '```\ncode\n```',
    '- 一般清單',
    '### 練習',
  ];
  for (const after of tail) {
    for (const gap of ['\n', '\n\n']) {
      const text = `## 甲\n\n- 能甲 ^aaaaa2\n    - 問 :: 答${gap}${after}\n\n${box(cand('能乙', 'bbbbb2', 'Q :: B'))}\n`;
      const out = moved(text);
      const lines = out.split('\n');
      const at = lines.indexOf('- 能乙 ^bbbbb2');
      assert.equal(lines[at - 1], '', '前面有空行：' + after);
      assert.equal(lines[at + 2], '', '後面有空行：' + after);
      assert.deepEqual(fingerprints(out).slice(0, 1), fingerprints(text).slice(0, 1), '舊題的指紋不變：' + after);
      assert.equal(parseDeck(out).targets.find(t => t.id === 'aaaaa2')!.shared.length, 0, '一般文字沒有黏到舊題：' + after);
      assert.equal(parseDeck(out).targets.find(t => t.id === 'bbbbb2')!.section, '甲');
    }
  }
});

void test('§2 沒有本文目標：插在這個框前面；`###` 後面沒有目標時候選留在最後一個目標的小標題底下', () => {
  const none = `## 甲\n\n${box(cand('能乙', 'bbbbb2', 'Q :: B'))}\n`;
  assert.equal(moved(none), '## 甲\n\n- 能乙 ^bbbbb2\n    - Q :: B\n');
  const later = `## 甲\n\n- 能甲 ^aaaaa2\n    - 問 :: 答\n\n### 練習\n\n${box(cand('能乙', 'bbbbb2', 'Q :: B'))}\n`;
  const out = moved(later);
  assert.equal(parseDeck(out).targets.at(-1)!.section, '甲');
  assert.equal(out, '## 甲\n\n- 能甲 ^aaaaa2\n    - 問 :: 答\n\n- 能乙 ^bbbbb2\n    - Q :: B\n\n### 練習\n');
});

void test('§2 數字根項、Tab 與不等寬縮排：根項對齊、子項目照相對欄位換算，縮排字元照這一篇', () => {
  const numbered = `100. 能甲 ^aaaaa2\n     - 問 :: 答\n\n${box(cand('能乙', 'bbbbb2', 'Q :: B'))}\n`;
  const out = moved(numbered);
  assert.equal(out, '100. 能甲 ^aaaaa2\n     - 問 :: 答\n\n- 能乙 ^bbbbb2\n    - Q :: B\n');
  assert.equal(parseDeck(out).targets.length, 2);
  // 這一篇用 Tab：搬出來的子項目也用 Tab。
  const tabbed = `- 能甲 ^aaaaa2\n\t- 問 :: 答\n\n${box(cand('能乙', 'bbbbb2', 'Q :: B'))}\n`;
  assert.equal(moved(tabbed), '- 能甲 ^aaaaa2\n\t- 問 :: 答\n\n- 能乙 ^bbbbb2\n\t- Q :: B\n');
  // 框裡用 Tab、這一篇用空白；兩格的縮排照欄位留著。
  const mixed = `- 能甲 ^aaaaa2\n    - 問 :: 答\n\n> [!note]- 候選卡片\n> - 能乙 ^bbbbb2\n> \t- 理由：x\n> \t- Q :: B\n>   \t  - 補充\n`;
  const third = moved(mixed);
  assert.equal(third.split('\n').slice(3).join('\n'), '- 能乙 ^bbbbb2\n    - Q :: B\n      - 補充\n');
  assert.deepEqual(parseDeck(third).targets[1].prompts.map(p => p.kind === 'qa' ? p.extras : []), [['補充']]);
});

void test('§2 CRLF 與沒有檔尾換行：換行字元照這一篇、檔尾照舊', () => {
  const crlf = `- 能甲 ^aaaaa2\r\n    - 問 :: 答\r\n\r\n${box(cand('能乙', 'bbbbb2', 'Q :: B')).replaceAll('\n', '\r\n')}\r\n`;
  assert.equal(moved(crlf), '- 能甲 ^aaaaa2\r\n    - 問 :: 答\r\n\r\n- 能乙 ^bbbbb2\r\n    - Q :: B\r\n');
  const bare = `- 能甲 ^aaaaa2\n    - 問 :: 答\n\n${box(cand('能乙', 'bbbbb2', 'Q :: B'))}`;
  assert.equal(moved(bare), '- 能甲 ^aaaaa2\n    - 問 :: 答\n\n- 能乙 ^bbbbb2\n    - Q :: B');
});

void test('§2 框：還有沒搬的或家長的字就留著；只剩空的 `>` 行整個拿掉；兩框沒有外部空行只拿項目', () => {
  const two = `- 能甲 ^aaaaa2\n    - 問 :: 答\n\n${box(cand('能乙', 'bbbbb2', 'Q :: B'), ['', ...cand('能丙', 'ccccc2', 'Q :: C')])}\n`;
  const first = moved(two, (_ref, i) => i === 0);
  assert.equal(first, '- 能甲 ^aaaaa2\n    - 問 :: 答\n\n- 能乙 ^bbbbb2\n    - Q :: B\n\n> [!note]- 候選卡片\n>\n> - 能丙 ^ccccc2\n>     - 理由：x\n>     - Q :: C\n');
  const both = moved(two);
  assert.equal(both, '- 能甲 ^aaaaa2\n    - 問 :: 答\n\n- 能乙 ^bbbbb2\n    - Q :: B\n- 能丙 ^ccccc2\n    - Q :: C\n');
  const note = `- 能甲 ^aaaaa2\n    - 問 :: 答\n\n${box(cand('能乙', 'bbbbb2', 'Q :: B'), [''], ['家長：下次再補一張圖。'])}\n`;
  assert.ok(moved(note).endsWith('> [!note]- 候選卡片\n>\n> 家長：下次再補一張圖。\n'));
  const merged = `- 能甲 ^aaaaa2\n    - 問 :: 答\n\n${box(cand('能乙', 'bbbbb2', 'Q :: B'))}\n> [!note] 給家長的備註\n> - 例題不適合\n`;
  assert.ok(moved(merged).endsWith('> [!note]- 候選卡片\n> [!note] 給家長的備註\n> - 例題不適合\n'));
  // 框在中間：拿掉之後前後只留一個空行。
  const middle = `- 能甲 ^aaaaa2\n    - 問 :: 答\n\n${box(cand('能乙', 'bbbbb2', 'Q :: B'))}\n\n## 乙\n\n- 能丁 ^ddddd2\n    - 問 :: 丁\n`;
  assert.equal(moved(middle), '- 能甲 ^aaaaa2\n    - 問 :: 答\n\n## 乙\n\n- 能丁 ^ddddd2\n    - 問 :: 丁\n\n- 能乙 ^bbbbb2\n    - Q :: B\n');
});

void test('§2 理由：名稱底下直接一層、沒有子項目與接續行才拿掉；在中間又有子項目的留項', () => {
  const middle = `- 能甲 ^aaaaa2\n    - 問 :: 答\n\n> [!note]- 候選卡片\n> - 能乙 ^bbbbb2\n>     - Q1 :: B\n>     - 理由：x\n>         - 補充\n>     - Q2 :: C\n`;
  const plan = move(middle);
  assert.equal(plan.text, null);
  assert.deepEqual(plan.left.map(each => each.why), [WHY.reason]);
  const lazy = `> [!note]- 候選卡片\n> - 能乙 ^bbbbb2\n>     - 理由：x\n>     接著寫\n>     - Q :: B\n`;
  assert.deepEqual(move(lazy).left.map(each => each.why), [WHY.reason]);
  // 理由在題目底下（巢狀）是那一題的補充，照搬。
  const nested = `> [!note]- 候選卡片\n> - 能乙 ^bbbbb2\n>     - Q :: B\n>         - 理由：補充\n`;
  assert.equal(moved(nested), '- 能乙 ^bbbbb2\n    - Q :: B\n        - 理由：補充\n');
});

void test('§2 圖片、多行答案、表格、程式圍欄、硬換行、連結：搬出框後逐字相同', () => {
  const item = ['- 能乙 ^bbbbb2', '    - 理由：x', '    - Q ::', '        - 草', '        - 蚱蜢', '        - ![[圖.png]]', '    - 程式：', '        ```', '        a  b', '        ```', '    - 說明：第一行  ', '        第二行 [[筆記#段落|看這裡]]', '    - | a | b |', '      |---|---|', '      | 1 | 2 |'];
  const text = `- 能甲 ^aaaaa2\n    - 問 :: 答\n\n> [!note]- 候選卡片\n${item.map(line => '> ' + line).join('\n')}\n`;
  const out = moved(text);
  assert.equal(out.split('\n').slice(3).join('\n'), item.filter(line => !line.includes('理由')).join('\n') + '\n');
});

void test('§2 ID（F6）：沒有 ID、在行中、和本文或另一個候選或別篇重複都留項，不自己改配', () => {
  const base = (name: string): string => `- 能甲 ^aaaaa2\n    - 問 :: 答\n\n> [!note]- 候選卡片\n> - ${name}\n>     - Q :: B\n`;
  assert.deepEqual(move(base('能乙')).left.map(each => each.why), [WHY.noId]);
  assert.deepEqual(move(base('能 ^bbbbb2 乙')).left.map(each => each.why), [WHY.noId]);
  assert.deepEqual(move(base('能乙 ^aaaaa2')).left.map(each => each.why), [WHY.takenId('aaaaa2')]);
  const twin = `> [!note]- 候選卡片\n> - 能乙 ^bbbbb2\n>     - Q :: B\n> - 能丙 ^bbbbb2\n>     - Q :: C\n`;
  assert.deepEqual(move(twin).left.map(each => each.why), [WHY.takenId('bbbbb2'), WHY.takenId('bbbbb2')]);
  const elsewhere = moveCandidates(base('能乙 ^bbbbb2'), refs(base('能乙 ^bbbbb2')), { elsewhere: id => id === 'bbbbb2' });
  assert.deepEqual(elsewhere.left.map(each => each.why), [WHY.takenId('bbbbb2')]);
});

void test('§2 比較卡（F6）：只有候選有比較卡，搬出來同一次補 `需要版本`；已經有更高的值照舊', () => {
  const pick = ['- 寨（寨、塞） 相似字 ^bbbbb2', '    - 理由：x', '    - 山＿＿。 :: 寨', '    - 安營紮＿＿。 :: 寨', '    - 村＿＿。 :: 寨', '    - 記憶錨點：**山**寨'];
  const text = `---\n狀態: 草稿\n---\n- 能甲 ^aaaaa2\n    - 問 :: 答\n\n${box(pick)}\n`;
  const out = moved(text);
  assert.equal(parseDeck(out).props.need, '0.4.0');
  assert.ok(parseDeck(out).targets.some(t => kindGroup(t)));
  const newer = text.replace('狀態: 草稿', '狀態: 草稿\n需要版本: 0.9.0');
  assert.equal(parseDeck(moved(newer)).props.need, '0.9.0');
});

void test('§2 寫前核對：多項照順序接在一起；摺起時全部加入只搬給的那幾項', () => {
  const text = `- 能甲 ^aaaaa2\n    - 問 :: 答\n\n${box(cand('能乙', 'bbbbb2', 'Q :: B'), cand('能丙', 'ccccc2', 'Q :: C'), cand('能丁', 'ddddd2', 'Q :: D'))}\n`;
  const out = moved(text, ref => ref.id !== 'ccccc2');
  assert.deepEqual(parseDeck(out).targets.map(t => t.id), ['aaaaa2', 'bbbbb2', 'ddddd2']);
  assert.deepEqual(introBoxes(out)[0].items.map(item => item.id), ['ccccc2']);
});

void test('§2 同一篇搬移後，本文原本的區塊引用照樣有效；檢查撞號時排除被搬走的原位置', () => {
  const text = `- 能甲 ^aaaaa2\n    - 問 :: 答 [[#^bbbbb2]]\n\n${box(cand('能乙', 'bbbbb2', 'Q :: B'))}\n`;
  const out = moved(text);
  assert.equal(out.split('\n').filter(line => /\^bbbbb2$/.test(line)).length, 1);
});

void test('§2 接句與全詩順序的候選照插入處的小標題讀詩名：本文有目標、沒有目標、和一般候選混批都搬得動（L2 R6）', () => {
  const head = '---\n科目: 國語\n狀態: 草稿\n---\n';
  const couplet = ['- 自編 第 1 句 接句 ^aaaaa2', '    - 理由：x', '    - ==清風穿竹徑==，淺水映山光。'];
  const order = ['- 自編四句 排序 ^ccccc2', '    - 理由：x', '    - ==清風穿竹徑==，==淺水映山光==。'];
  const plain = cand('能乙', 'ddddd2', 'Q :: B');
  const body = '- 自編 第 2 句 接句 ^bbbbb2\n    - 清風穿竹徑，==淺水映山光==。\n';
  for (const text of [
    `${head}### 自編四句\n\n${body}\n${box(couplet)}\n`,
    `${head}### 自編四句\n\n${box(couplet)}\n`,
    `${head}### 自編四句\n\n${body}\n${box(couplet, order, plain)}\n`,
  ]) {
    const out = moved(text);
    const added = parseDeck(out).targets.find(t => t.id === 'aaaaa2');
    assert.equal(kindCouplet(added)?.title, '自編四句', out);
    assert.equal(added?.section, '自編四句');
  }
});
