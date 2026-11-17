import type { Mastery } from '../study/index.ts';
import type { Deck } from '../deck/index.ts';
import { codeKey, termKey } from '../deck/index.ts';
import { firstLine, sha256Hex, studentOf } from './prompt.ts';
import type { CardForm, Prompt, SentPart } from './prompt.ts';
import type { EmbeddedRule, RuleSubject } from './rules.ts';

// 加深的任務段（tasks/ai-cards-deepen.md §2-2）：版號 `加深 v1`，和製卡的 `提示 v3` 分開記。規則組照這一篇的科目送（同最小版）。

/** 任務段的版號：改字就加一。 */
const DEEPEN_VERSION = '加深 v1';

/** 這一篇的一個學習目標：ID、名稱、記穩了的判斷（§2-1）與第一題（寫法同 `提示 v3`）。 */
interface DeepenTarget { id: string; name: string; mastery: Mastery; first?: string }

export interface DeepenInput {
  form: Pick<CardForm, 'term' | 'unit' | 'purpose' | 'adjust' | 'material'>;
  subject: Pick<RuleSubject, 'subject' | 'r3'>;
  targets: readonly DeepenTarget[];
  /** 同單元的其他篇的目標（D-190 第 4 點）：只用來去重。 */
  siblings: readonly { id: string; name: string }[];
  /** 最新的地圖（§2-3 的 latestMap）；沒有是 null。 */
  map: { whole: string; structure: string } | null;
  /** 以前出過、現在不在這一篇的目標（goneTargets）。 */
  gone: readonly { id: string; name: string }[];
}

/** 這一篇送出的目標（§2-1）：有 ID、讀得懂的正式目標，照檔裡的順序；同一個 ID 只列一次。 */
export function deepenTargets(deck: Deck, mastery: ReadonlyMap<string, Mastery>): DeepenTarget[] {
  const seen = new Set<string>();
  return deck.targets.filter(t => t.id !== null && t.ok && !seen.has(t.id) && seen.add(t.id)).map(t => {
    const first = t.prompts.at(0);
    return { id: t.id!, name: t.name, mastery: mastery.get(t.id!) ?? 'unknown', ...first ? { first: firstLine(first) } : {} };
  });
}

/** 同單元的其他篇（D-190 第 4 點）：同科目、同年級學期、同單元編號、不是這一篇、不是轉錄稿的目標。一般知識沒有單元，沒有其他篇。 */
export function unitSiblings(decks: readonly { path: string; deck: Deck }[], path: string, deck: Deck): { id: string; name: string }[] {
  const { subject, term, unit } = deck.props;
  if (subject === null || term === null || unit === null) return [];
  return decks.filter(each => each.path !== path && !each.deck.props.isTranscript && each.deck.props.subject === subject && each.deck.props.term !== null
    && termKey(each.deck.props.term) === termKey(term) && each.deck.props.unit !== null && codeKey(each.deck.props.unit.code) === codeKey(unit.code))
    .flatMap(each => each.deck.targets.flatMap(t => t.id !== null && t.ok ? [{ id: t.id, name: t.name }] : []));
}

const LABEL: Record<Mastery, string> = { stable: '記穩了', weak: '常錯', unstable: '還沒記穩', unknown: '還沒記穩' };

/** 加深的規則（§2-2）：通用規則 F 節凍結，所以寫在任務段。 */
function deepenRules(r3: boolean): string[] {
  return [
    '加深的規則：',
    '',
    '- 常錯的先補：寫在「加進已有的學習目標」，題目讓學生自己做出常錯的那個判斷。',
    '- 記穩了的往深處出：新的學習目標要把兩個以上的知識連起來，至少一個是記穩了的；換句話問同一件事不算。還沒記穩的不動。一次只往下一層；這一節課內還有下一層時先出課內。',
    '- 課外層（課內熟了才出）：它用到的課內學習目標**全部**記穩了才出；要說得出讓學生多懂了什麼，附可以查的來源（例如高中課本），查不到就不出。出處的每一項都寫成 `課外：<可以查的來源>`，例如 `出處：課外：高中基礎物理 熱學`。家長調整說不要課外時不出。',
    '- 教材之間說法不一致時照學校的（課本、學校講義），差異寫在給家長的備註；課本和學校講義不一致時也寫在備註，請家長確認。',
    '- 新的學習目標每頁最多約 3 個；沒有值得出的就不出，在給家長的備註寫一句「這一節目前沒有更深的內容」。',
    ...r3 ? ['- 照規則交全貌、架構、卡組三段：地圖有修改就交修改後的全文，沒有修改也照抄一份。新的學習目標只寫在卡組段，分組用這一篇已有的小標題。'] : ['- 新的學習目標分組用這一篇已有的小標題。'],
    '- 引言框的寫法與順序（加進已有的放在新的學習目標之後，候選卡片放在最後）：',
    '',
    '    ```markdown',
    '    > [!note] 加進已有的學習目標',
    '    > - <ID> <已有的名稱>',
    '    >     - 出處：<這次的頁碼>',
    '    >     - <新的題目> :: <答案>',
    '    ```',
    '',
  ];
}

/** 任務段：`## 這一次的任務`（加深）、任務資料、加深的規則與附加說明。 */
export function deepenTask(input: DeepenInput): string {
  const { form, subject } = input;
  const lines = [
    '## 這一次的任務：加深這一節',
    '',
    `- 學生：${studentOf(form.term)}`,
    `- 科目：${subject.subject ?? '一般知識'}`,
    `- 單元：${form.unit.trim()}`,
    `- 學習目的：${form.purpose}`,
    `- 家長調整：${form.adjust.trim() || '無'}`,
    `- 教材：${form.material.trim() ? `附件（${form.material.trim()}）` : '附件的課本頁面'}`,
    '- 這一篇的學習目標（`ID 名稱｜記穩了／常錯／還沒記穩｜第一題`）：',
    ...input.targets.map(each => `  - ${each.id} ${each.name}｜${LABEL[each.mastery]}${each.first === undefined ? '' : `｜第一題：${each.first}`}`),
    input.siblings.length ? '- 同單元的其他篇（只用來避免重複，不要加題到這些目標，也不要把新的學習目標放到那一篇）：' : '- 同單元的其他篇：無',
    ...input.siblings.map(each => `  - ${each.id} ${each.name}`),
    input.gone.length ? '- 以前出過、現在不在這一篇（家長沒採用、刪掉或搬走），不要再出：' : '- 以前出過、現在不在這一篇的：無',
    ...input.gone.map(each => `  - ${each.id} ${each.name}`),
    '',
    ...input.map
      ? ['最新的學習地圖（上一次的全貌與架構，照原文）：', '', '<<<全貌>>>', input.map.whole, '', '<<<架構>>>', input.map.structure, '']
      : ['最新的學習地圖：無。請先依教材補一份全貌與架構，再照它往下一層出。', ''],
    ...deepenRules(subject.r3),
    '另外：',
    '',
    '- 教材在附件。附件沒有圖檔可以連，**不要寫 `![[…]]`**；要提到課本的圖，在出處寫圖號（例如 `p.42、圖 2`）。',
    '- 提到已有的學習目標一律用上面清單的 ID，不要自己編；不要寫新的學習目標 ID 與屬性區，程式會加。',
    ...subject.r3 ? ['- 照規則交三段，標記照抄（`<<<全貌>>>`、`<<<架構>>>`、`<<<卡組>>>`）；卡組段沒有新的內容時可以只寫給家長的備註。'] : [],
    '- 回覆的最後單獨一行寫 `<<<完>>>`。',
    '- 整段回覆放進**一個**程式碼區塊：第一行寫 ````markdown（四個反引號），最後一行寫 ````，`<<<完>>>` 是框裡的最後一行。家長會按程式碼區塊的「複製」把它貼回來，框外不用寫說明。',
  ];
  return lines.join('\n');
}

/** 整份加深的提示：規則組照順序，最後是加深的任務段。 */
export function buildDeepenPrompt(input: DeepenInput, rules: readonly EmbeddedRule[]): Prompt {
  const task = deepenTask(input);
  const parts: SentPart[] = [
    ...rules.map(rule => ({ name: rule.name, version: rule.version, text: rule.text, sha256: rule.sha256 })),
    { name: '任務段', version: DEEPEN_VERSION, text: task, sha256: sha256Hex(task) },
  ];
  const text = parts.map(part => part.text).join('\n\n');
  return { parts, text, sha256: sha256Hex(text) };
}
