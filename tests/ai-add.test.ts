import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { boxBatch, boxOf, findItem, introBoxes, refOf, suspectOf } from '../src/core/ai/index.ts';

// tasks/ai-cards-add.md §1：引言框裡的項目、按下去時在最新的文字裡重新找。只用 syntax.md 的例子與自編的內容。

const syntax = readFileSync(new URL('../docs/syntax.md', import.meta.url), 'utf8');
/** syntax §2-9 的草稿例子，換成存草稿後的樣子（候選已配好 ID、加進已有的轉成連結），前面加上屬性。 */
const saved = (): string => {
  const at = syntax.indexOf('### 2-9');
  const example = /````markdown\r?\n([\s\S]*?)\r?\n````/.exec(syntax.slice(at))![1];
  return '---\n年級學期: 國二上\n科目: 自然\n單元: "2-2 水溶液"\n狀態: 草稿\n---\n' + example
    .replace('> - q8z3ka 能用密度判斷物體的浮沉', '> - [[國二上自然 2-1#^q8z3ka|能用密度判斷物體的浮沉]]')
    .replace('> - 能說明溫度對溶解度的影響', '> - 能說明溫度對溶解度的影響 ^c4ndd2')
    .replace('- 能用粒子運動說明擴散現象', '- 能用粒子運動說明擴散現象 ^p7q2w8') + '\n';
};

void test('§1 syntax §2-9 的例子：兩個引言框、各一項，身分與原文', () => {
  const boxes = introBoxes(saved());
  assert.deepEqual(boxes.map(box => [box.kind, box.title, box.folded, box.items.length]), [
    ['existing', '加進已有的學習目標', false, 1], ['candidate', '候選卡片', true, 1]]);
  const [existing, candidate] = boxes.map(box => box.items[0]);
  assert.equal(existing.id, 'q8z3ka');
  assert.equal(existing.original, '- [[國二上自然 2-1#^q8z3ka|能用密度判斷物體的浮沉]]\n    - 出處：p.46\n    - 雞蛋在清水裡會沉，在濃鹽水裡卻浮起來，為什麼？ :: 鹽水的**密度變大**，比雞蛋**大**');
  assert.equal(candidate.id, 'c4ndd2');
  assert.equal(candidate.original.split('\n')[0], '- 能說明溫度對溶解度的影響 ^c4ndd2');
  const lines = saved().split('\n');
  assert.equal(lines[candidate.line], '> - 能說明溫度對溶解度的影響 ^c4ndd2');
  assert.equal(lines[candidate.end - 1], '>     - 水溫升高時，糖在水中的溶解度會怎麼變？ :: 變**大**');
});

void test('§1 加進已有的：AI 原稿的 `ID 名稱` 也認得 ID；不是引言框標題的框沒有按鈕；轉錄稿不算', () => {
  const text = '- 目標 ^abc234\n    - Q :: A\n\n> [!note] 加進已有的學習目標\n> - q8z3ka 能用密度判斷物體的浮沉\n>     - Q2 :: A2\n\n> [!note] 給家長的備註\n> - 例題 2-3 不適合\n';
  const boxes = introBoxes(text);
  assert.deepEqual(boxes.map(box => [box.kind, box.items.map(item => item.id)]), [['existing', ['q8z3ka']]]);
  assert.deepEqual(introBoxes('---\n來源類型: 課本\n---\n' + text), []);
});

void test('§1 項目的範圍：子項目、接續行、圖片、程式碼都算；框裡家長寫的段落不算；空的 `>` 行不算', () => {
  const text = [
    '> [!note]- 候選卡片',
    '> - 能甲 ^aaaaa2',
    '>     - 理由：x',
    '>     - Q :: A',
    '>         - ![[圖.png]]',
    '>     - 程式：',
    '>         ```',
    '>         a  b',
    '>         ```',
    '>',
    '> - 能乙 ^bbbbb2',
    '>     - Q2 ::',
    '>         - 草',
    '>         - 蚱蜢',
    '>',
    '> 家長：下次再補一張圖。',
    '',
  ].join('\n');
  const [box] = introBoxes(text);
  assert.deepEqual(box.items.map(item => [item.line, item.end]), [[1, 9], [10, 14]]);
  assert.equal(box.line, 0);
  assert.equal(box.end, 16);
  assert.equal(box.items[0].original.split('\n')[6], '        a  b');
});

void test('§1 兩個框之間沒有外部空行：第二個標題之後的不算任何一框的項目（閱讀模式畫成同一個框）', () => {
  const text = '> [!note] 加進已有的學習目標\n> - q8z3ka 甲\n>     - Q :: A\n> [!note]- 候選卡片\n> - 能乙 ^bbbbb2\n>     - Q :: B\n';
  const boxes = introBoxes(text);
  assert.deepEqual(boxes.map(box => [box.kind, box.end, box.merged, box.items.length]), [['existing', 3, true, 1]]);
});

void test('§1 CRLF：原文不含 \\r，行號照原文', () => {
  const text = '- 目標 ^abc234\r\n    - Q :: A\r\n\r\n> [!note]- 候選卡片\r\n> - 能乙 ^bbbbb2\r\n>     - Q :: B\r\n';
  const [box] = introBoxes(text);
  assert.deepEqual([box.line, box.items[0].line, box.items[0].end, box.items[0].original], [3, 4, 6, '- 能乙 ^bbbbb2\n    - Q :: B']);
});

void test('§1 找項目：在最新的文字裡用身分與原文找；改過、刪掉回 changed；同一篇有兩個原文相同的回 duplicate', () => {
  const text = saved();
  const [, candidate] = introBoxes(text).map(box => box.items[0]);
  const ref = { kind: candidate.kind, id: candidate.id, original: candidate.original };
  const found = findItem(text, ref);
  assert.equal(found.kind, 'found');
  if (found.kind === 'found') assert.equal(found.item.line, candidate.line);
  // 前面多了一行：照樣找得到，行號跟著變。
  const shifted = findItem('\n' + text, ref);
  assert.equal(shifted.kind === 'found' && shifted.item.line, candidate.line + 1);
  assert.deepEqual(findItem(text.replace('變**大**', '變**小**'), ref), { kind: 'changed' });
  assert.deepEqual(findItem(text.replace('> - 能說明溫度對溶解度的影響 ^c4ndd2', '> - 能說明溫度對溶解度的影響 ^c4ndd3'), ref), { kind: 'changed' });
  // 同框兩份、不同框兩份都不自動做。
  const box = text.slice(text.indexOf('> [!note]- 候選卡片'));
  const item = box.slice(box.indexOf('> - '));
  assert.deepEqual(findItem(text + item, ref), { kind: 'duplicate' });
  assert.deepEqual(findItem(text + '\n' + box, ref), { kind: 'duplicate' });
  // 家長刪掉多的那一份之後只剩一份：找得到。
  assert.equal(findItem(text, ref).kind, 'found');
});

void test('§1 加進已有的：同一個框兩項同 ID、原文不同，各自找得到；前一項刪掉後後一項照樣找得到', () => {
  const text = '> [!note] 加進已有的學習目標\n> - q8z3ka 甲\n>     - Q1 :: A\n> - q8z3ka 甲\n>     - Q2 :: A\n';
  const [box] = introBoxes(text);
  const second = box.items[1];
  const ref = { kind: second.kind, id: second.id, original: second.original };
  const found = findItem(text, ref);
  assert.equal(found.kind === 'found' && found.item.line, 3);
  const without = '> [!note] 加進已有的學習目標\n> - q8z3ka 甲\n>     - Q2 :: A\n';
  const again = findItem(without, ref);
  assert.equal(again.kind === 'found' && again.item.line, 1);
});

void test('§2 疑似重複的認法（第二輪 R4）：三種存法、半形冒號、不全的也算；巢狀與第二行的理由不算', () => {
  const item = (reason: string): string => `- 能甲 ^aaaaa2\n    - ${reason}\n    - Q :: A`;
  assert.equal(suspectOf(item('理由：可能重複 abc234｜第一題靠圖')), true);
  assert.equal(suspectOf(item('理由：可能重複 [[舊卡組#^abc234|原目標]]｜第一題靠圖')), true);
  assert.equal(suspectOf(item('理由: 可能重複 [[舊卡組#^abc234|原目標]]')), true);
  assert.equal(suspectOf(item('理由：  可能重複')), true);
  assert.equal(suspectOf(item('理由：知識快遞的內容，可能重複出現')), false);
  assert.equal(suspectOf(item('理由：段考不一定考')), false);
  assert.equal(suspectOf('- 能甲 ^aaaaa2\n    - Q :: A\n        - 理由：可能重複 abc234｜x'), false);
  assert.equal(suspectOf('- 能甲 ^aaaaa2\n    - 理由：段考不一定考\n    - 理由：可能重複 abc234｜x\n    - Q :: A'), false);
  assert.equal(suspectOf('- 能甲 ^aaaaa2\n    - Q :: A'), false);
});

void test('§2、§3-4 全部加入的那幾項：候選框是一般候選、加進已有是轉成連結的；boxOf 找第一個還在的項目所在的框', () => {
  const text = '> [!note]- 候選卡片\n> - 能乙 ^bbbbb2\n>     - 理由：x\n> - 能丙 ^ccccc2\n>     - 理由：可能重複 aaaaa2\n> - 能丁 ^ddddd2\n>     - 理由:可能重複\n\n> [!note] 加進已有的學習目標\n> - [[甲#^aaaaa2|能甲]]\n>     - Q :: A\n> - eeeee2 能戊\n>     - Q :: E\n';
  const [candidate, existing] = introBoxes(text);
  assert.deepEqual(boxBatch(candidate).items.map(item => item.id), ['bbbbb2']);
  assert.equal(boxBatch(candidate).rest, 2);
  assert.deepEqual(boxBatch(existing).items.map(item => item.id), ['aaaaa2']);
  assert.equal(boxBatch(existing).rest, 1);
  const gone = { ...refOf(candidate.items[0]), original: '已經不在' };
  assert.equal(boxOf(text, [gone, refOf(existing.items[1])])?.line, existing.line);
  assert.equal(boxOf(text, [gone]), null);
});
