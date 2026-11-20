import { readFileSync } from 'node:fs';
import { clearExisting, introBoxes, moveCandidates, planExisting } from '../../src/core/ai/index.ts';
import { parseDeck } from '../../src/core/deck/index.ts';

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

/**
 * §3-2 加進已有的例子：框裡那一項（去掉引言框前綴）、目的地全文、來源的單元。tests/deck.test.ts 把目的地寫前、寫後的全文登錄進往返範例。
 * 目的地都是國二上自然 2-1 的目標 q8z3ka。
 */
const existingHead = (unit: string): string => `---\n年級學期: 國二上\n科目: 自然\n單元: "${unit}"\n---\n`;
const LINK = '- [[國二上自然 2-1#^q8z3ka|能用密度判斷物體的浮沉]]';
const NAME = '- 能用密度判斷物體的浮沉 ^q8z3ka';
const EXISTING_INPUTS: readonly { original: string; text: string; unit: string }[] = [
  { original: [LINK, '    - 出處：p.46', '    - 雞蛋為什麼浮起來？ :: 鹽水的**密度變大**'].join('\n'), text: existingHead('2-1 密度') + [NAME, '    - 出處：p.30', '    - 密度怎麼算？ :: 質量除以體積', '        - 補充：說明', '', '- 能說出浮力 ^p7q2w8', '    - 浮力？ :: 向上的力', ''].join('\n'), unit: '2-2 水溶液' },
  { original: [LINK, '    - 雞蛋為什麼浮起來？ :: 鹽水的**密度變大**'].join('\n'), text: existingHead('2-1 密度') + [NAME, '\t- 密度怎麼算？ :: 質量除以體積', ''].join('\n'), unit: '2-1 密度' },
  { original: [LINK, '    - 備註：容易和重量搞混', '    - 記憶錨點：重的沉', '        - 輕的浮'].join('\n'), text: (existingHead('2-1 密度') + [NAME, '    - 類型：計算', '    - 密度怎麼算？ :: 質量除以體積', ''].join('\n')).replaceAll('\n', '\r\n'), unit: '2-1 密度' },
  { original: [LINK, '    - 夏天的昆蟲 ::', '        - 蚱蜢', '        - ![[蚱蜢.png]]'].join('\n'), text: existingHead('2-1 密度') + [NAME, '    - 密度怎麼算？ :: 質量除以體積'].join('\n'), unit: '2-3 熱' },
];

const one = (): string => box(cand('能乙', 'bbbbb2', 'Q :: B'));
/** 全部候選都搬得動的幾篇：插入位置、縮排、換行字元、框留不留、比較卡。 */
const ADD_INPUTS: readonly string[] = [
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
  // 接句與全詩順序的詩名照插入處的小標題（L2 R6）：本文有目標、沒有目標。
  `---\n科目: 國語\n---\n### 自編四句\n\n- 自編 第 2 句 接句 ^bbbbb2\n    - 清風穿竹徑，==淺水映山光==。\n\n${box(['- 自編 第 1 句 接句 ^aaaaa2', '    - 理由：x', '    - ==清風穿竹徑==，淺水映山光。'], ['- 自編四句 排序 ^ccccc2', '    - 理由：x', '    - ==清風穿竹徑==，==淺水映山光==。'])}\n`,
  `---\n科目: 國語\n---\n### 自編四句\n\n${box(['- 自編 第 1 句 接句 ^aaaaa2', '    - 理由：x', '    - ==清風穿竹徑==，淺水映山光。'])}\n`,
];

/**
 * 加入的輸入與寫出的全文（§7）：候選全部搬完、目的地加完、來源拿掉前後。tests/deck.test.ts 登錄進往返範例，tests/ai-add-old-version.test.ts
 * 交給已發布的舊版讀。每一例都要做得成，做不成丟錯（例子壞了要看得到）。
 */
export function addTexts(): string[] {
  const out: string[] = [];
  for (const text of ADD_INPUTS) {
    const refs = introBoxes(text).filter(box => box.kind === 'candidate').flatMap(box => box.items).map(({ kind, id, original }) => ({ kind, id, original }));
    const plan = moveCandidates(text, refs, { elsewhere: () => false });
    if (plan.text === null || plan.left.length) throw Error('ADD_INPUTS 的例子要全部搬得動：' + JSON.stringify(plan.left));
    out.push(text, plan.text);
  }
  for (const each of EXISTING_INPUTS) {
    const props = parseDeck(existingHead(each.unit)).props;
    const plan = planExisting({ original: each.original, id: 'q8z3ka', source: { path: 'Essence Cards/來源.md', props }, dest: { path: 'Essence Cards/目的地.md', text: each.text }, version: '0.5.0', resolve: link => link });
    if (plan.kind !== 'plan' || plan.text === null) throw Error('EXISTING_INPUTS 的例子要加得進去：' + JSON.stringify(plan));
    // §4 第 4 步：來源把那一項放在框裡，目的地確認之後拿掉的前後全文。
    const source = `${existingHead(each.unit)}- 能乙 ^bbbbb2\n    - 問 :: 答\n\n> [!note]- 加進已有的學習目標\n${each.original.split('\n').map(line => '> ' + line).join('\n')}\n`;
    const [item] = introBoxes(source).flatMap(box => box.items);
    const cleared = clearExisting({ path: 'Essence Cards/來源.md', text: source, items: [{ ref: { kind: item.kind, id: item.id, original: item.original }, id: 'q8z3ka', dest: { path: 'Essence Cards/目的地.md', text: plan.text } }], version: '0.5.0', resolve: link => link });
    if (cleared.text === null) throw Error('EXISTING_INPUTS 的例子要拿得掉：' + JSON.stringify(cleared.left));
    out.push(each.text, plan.text, source, cleared.text);
  }
  return out;
}
