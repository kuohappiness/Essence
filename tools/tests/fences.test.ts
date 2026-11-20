import test from 'node:test';
import assert from 'node:assert/strict';
import MarkdownIt from 'markdown-it';
import { fencedLines } from '../fences.ts';
import { currentRefs, parseDecisions } from '../decisions.ts';
import { headings } from '../section.ts';

// L2 R10：程式碼區塊的邊界，決策查詢、section 與 repo 的 Markdown 解析器（markdown-it）要一致。
// 預期值是 markdown-it 的 fence token 涵蓋的行（獨立的來源）；縮排四格以上、又不在清單裡的「```」是縮排程式碼區塊，工具不認（寧可少算，見 fences.ts）。
const SAMPLES: [string, string][] = [
  ['反引號', 'a\n```\n## x\n```\nb'],
  ['波浪號、資訊欄有反引號也算', '~~~ js`x\n## x\n~~~\nb'],
  ['縮排兩格', 'a\n\n  ```\n## D-219 範例\n  ```\nb'],
  ['清單裡縮排四格', '- a\n\n  - b\n\n    ```\n    ## x\n    ```\n\n- c'],
  ['引用框裡', '> a\n>\n> ```\n> D-218\n> ```\n\nb'],
  ['反引號圍欄的資訊欄有反引號：不是圍欄', '```js`x\n## 真標題\ntext'],
  ['收尾比開頭短：沒收尾，到檔尾', '````\n```\n## x'],
  ['收尾後面有字：不算收尾', '```\n``` x\n## x\n```\nb'],
  ['引用框結束時沒收尾的圍欄跟著結束', '> ```\n> code\n\n## 外面'],
  ['頂層圍欄裡的 > ``` 是內容', '```\n> ```\n## x\n```\nb'],
  ['不同字元不收尾', '```\n~~~\n## x\n```\nb'],
];

const markdown = new MarkdownIt();
function expected(text: string): boolean[] {
  const lines = text.split('\n');
  const out: boolean[] = lines.map(() => false);
  for (const token of markdown.parse(text, {})) {
    if (token.type !== 'fence' || !token.map) continue;
    for (let i = token.map[0]; i < token.map[1]; i++) out[i] = true;
  }
  return out;
}

void test('L2 R10 圍欄的行和 markdown-it 一致：縮排、引用框、清單、資訊欄有反引號、沒收尾、收尾不合格', () => {
  for (const [name, text] of SAMPLES) assert.deepEqual(fencedLines(text.split('\n')), expected(text), name);
});

void test('L2 R10 三個工具共用圍欄的判斷：決策紀錄、現行寫在、section', () => {
  // 縮排兩格的圍欄裡的「## D-219」不是一條決定。
  const decisions = '# 決策紀錄\n\n## D-218 甲\n\n✅ 2026-11-22\n\n  ```\n## D-219 範例\n  ```\n';
  assert.deepEqual(parseDecisions(decisions).decisions.map(d => d.id), ['D-218']);
  // 引用框裡的圍欄是範例，不算引用；圍欄外的照算。
  const refs = currentRefs([{ path: 'AGENTS.md', text: '# A\n\n## 規範\n\n> ```\n> D-218\n> ```\n\n## 其他\n\nD-217\n' }]);
  assert.equal(refs.get('D-218'), undefined);
  assert.deepEqual(refs.get('D-217'), ['AGENTS.md〈其他〉']);
  // 資訊欄有反引號的那一行不是圍欄，下一行的標題照算。
  assert.deepEqual(headings('# A\n\n```js`x\n## 真標題\n').map(h => h.title), ['A', '真標題']);
});
