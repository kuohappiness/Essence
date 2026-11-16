import { readFileSync } from 'node:fs';

// tasks/ai-cards-add.md §2 的例子：tests/ai-add-move.test.ts 檢查搬移的結果，tests/deck.test.ts 把輸入與搬完的全文登錄進往返範例（deckCases）。
// 只用 syntax.md 的例子與自編的內容。

const syntax = readFileSync(new URL('../../docs/syntax.md', import.meta.url), 'utf8');
/** syntax §2-9 的例子存成草稿之後的樣子：加進已有的轉成連結、候選與本文補上 ID。 */
export const savedExample = (): string => {
  const at = syntax.indexOf('### 2-9');
  const example = /````markdown\r?\n([\s\S]*?)\r?\n````/.exec(syntax.slice(at))![1];
  return '---\n年級學期: 國二上\n科目: 自然\n單元: "2-2 水溶液"\n狀態: 草稿\n---\n' + example
    .replace('> - q8z3ka 能用密度判斷物體的浮沉', '> - [[國二上自然 2-1#^q8z3ka|能用密度判斷物體的浮沉]]')
    .replace('> - 能說明溫度對溶解度的影響', '> - 能說明溫度對溶解度的影響 ^c4ndd2')
    .replace('- 能用粒子運動說明擴散現象', '- 能用粒子運動說明擴散現象 ^p7q2w8') + '\n';
};

/** 候選卡片框：每一項的每一行加上 `> `，空行是 `>`。 */
export const box = (...items: string[][]): string => ['> [!note]- 候選卡片', ...items.flatMap(item => item.map(line => line ? '> ' + line : '>'))].join('\n');
/** 一項候選：名稱行尾有 ID，第一個子項目是理由。 */
export const cand = (name: string, id: string, ...rest: string[]): string[] => [`- ${name} ^${id}`, '    - 理由：x', ...rest.map(each => '    - ' + each)];

const one = (): string => box(cand('能乙', 'bbbbb2', 'Q :: B'));
/** 全部候選都搬得動的幾篇：插入位置、縮排、換行字元、框留不留、比較卡。 */
export const ADD_INPUTS: readonly string[] = [
  savedExample(),
  `## 甲\n\n- 能甲 ^aaaaa2\n    - 問 :: 答\n| a | b |\n|---|---|\n| 1 | 2 |\n\n${one()}\n`,
  `## 甲\n\n- 能甲 ^aaaaa2\n    - 問 :: 答\n\n### 練習\n\n${one()}\n`,
  `## 甲\n\n${one()}\n`,
  `100. 能甲 ^aaaaa2\n     - 問 :: 答\n\n${one()}\n`,
  `- 能甲 ^aaaaa2\n\t- 問 :: 答\n\n${one()}\n`,
  `- 能甲 ^aaaaa2\n    - 問 :: 答\n\n> [!note]- 候選卡片\n> - 能乙 ^bbbbb2\n> \t- 理由：x\n> \t- Q :: B\n>   \t  - 補充\n`,
  `- 能甲 ^aaaaa2\r\n    - 問 :: 答\r\n\r\n${one().replaceAll('\n', '\r\n')}\r\n`,
  `- 能甲 ^aaaaa2\n    - 問 :: 答\n\n${one()}`,
  `- 能甲 ^aaaaa2\n    - 問 :: 答\n\n${box(cand('能乙', 'bbbbb2', 'Q :: B'), [''], ['家長：下次再補一張圖。'])}\n`,
  `- 能甲 ^aaaaa2\n    - 問 :: 答\n\n${one()}\n> [!note] 給家長的備註\n> - 例題不適合\n`,
  `- 能甲 ^aaaaa2\n    - 問 :: 答\n\n${one()}\n\n## 乙\n\n- 能丁 ^ddddd2\n    - 問 :: 丁\n`,
  `---\n狀態: 草稿\n---\n- 能甲 ^aaaaa2\n    - 問 :: 答\n\n${box(['- 寨（寨、塞） 相似字 ^bbbbb2', '    - 理由：x', '    - 山＿＿。 :: 寨', '    - 安營紮＿＿。 :: 寨', '    - 村＿＿。 :: 寨'])}\n`,
];
