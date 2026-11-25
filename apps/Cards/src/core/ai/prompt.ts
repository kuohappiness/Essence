import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';
import { compareCode, compareTerm } from '../catalog/index.ts';
import type { Deck, Prompt as DeckPrompt, Target } from '../deck/index.ts';
import { learnedWord, pickKey, termKey, termRank } from '../deck/index.ts';
import { formatTime } from '../study/index.ts';
import type { EmbeddedRule, RuleSubject } from './rules.ts';

// 提示的組成（tasks/ai-cards-mvp.md §3）：規則組的每一份 → 任務段，照順序、中間空一行接起來；每一部分與整份提示各算 SHA-256。

/** §3 的任務段與附加說明的版號：改字就加一（§1〈提示模板的版本〉）。 */
const PROMPT_VERSION = '提示 v5'; // v5：點選填空的規則加相似詞（tasks/polyphone-pick.md §2）
export const PURPOSES = ['準備段考', '準備小考', '平常複習'] as const;
export type Purpose = (typeof PURPOSES)[number];

/** 製卡畫面第一步的表單（§2）。subject 是規則表的 key。 */
export interface CardForm {
  subject: string;
  term: string;
  unit: string;
  purpose: Purpose;
  supplement: boolean;
  /**
   * 點選填空（D-182、D-192、D-210）：要不要把容易混淆的比較題寫成點選填空。`提示 v4` 之前存的工作沒有這一欄（tasks/ai-cards-materials.md §2-3），
   * 複製之後就用不到。
   */
  pick?: boolean;
  /** 這次的調整：寫進任務資料的「家長調整」；空的寫「無」。 */
  adjust: string;
  /** 教材：家長自己的說明，寫進任務資料與快照；程式沒有看過教材。 */
  material: string;
}

/**
 * 學生已有的一個學習目標（§2）：送出時在哪一篇（之後轉成連結時核對，§5）。first 是送出的第一題（tasks/ai-cards-add.md §5 第 1 點，`提示 v3`）；
 * 沒有題目、或 `提示 v3` 之前存的工作沒有這一欄。
 */
export interface ExistingTarget { id: string; name: string; source: string; path: string; first?: string }

/** 第一題的一行：問答寫 `題目 :: 答案`、填空整行；多行答案用「／」接；圖寫「［圖］」。 */
export function firstLine(prompt: DeckPrompt): string {
  const image = (text: string): string => text.replace(/!\[\[[^\]]*\]\]|!\[[^\]]*\]\([^)]*\)/g, '［圖］');
  const flat = (text: string): string => image(text).split('\n').map(line => line.trim()).filter(Boolean).join('／');
  return prompt.kind === 'qa' ? `${flat(prompt.question)} :: ${flat(prompt.answer)}` : flat(prompt.text);
}
/** 送出的一部分：名稱、版號、全文與它的 SHA-256。 */
export interface SentPart { name: string; version: string; text: string; sha256: string }
export interface Prompt { parts: SentPart[]; text: string; sha256: string }

export const sha256Hex = (text: string): string => bytesToHex(sha256(utf8ToBytes(text)));
/** 帶時區、到秒的時間（快照的 `時間`、`複製時間`）。 */
export const stamp = (ms: number, offset: number): string => formatTime(Math.floor(ms / 1000) * 1000, offset).replace(/\.\d{3}(?=[+-])/, '');

const STAGES: Record<string, string> = { 小: '國小', 國: '國中', 高: '高中' };
/** 「學生」那一行：`國二上` → `國中二年級（國二上）`；認不得的年級學期照原字。 */
export function studentOf(term: string): string {
  const key = termKey(term);
  if (termRank(key) === null) return term;
  return `${STAGES[key[0]]}${key[1]}年級（${key}）`;
}

/** 單元欄的編號：第一個空白前（syntax §2-1）；沒有空白時整段就是編號。 */
export function unitCode(unit: string): string {
  const text = unit.trim();
  const at = text.search(/[ \t　]/);
  return at < 0 ? text : text.slice(0, at);
}

/** 一課分成幾篇時的篇名開頭（§3、§4）：`<年級學期><科目> <單元編號>`；一般知識不分篇，是 null。 */
export function titlePrefix(form: Pick<CardForm, 'term' | 'unit'>, subject: Pick<RuleSubject, 'subject'>): string | null {
  return subject.subject === null ? null : `${form.term.trim()}${subject.subject} ${unitCode(form.unit)}`;
}

/**
 * 會一起送出的已有學習目標（§2）：同一科、年級學期在這一篇之前或相同（認不得的年級學期只算完全相同的）、啟用與暫停的卡組裡讀得懂、有 ID 的目標；
 * 草稿、轉錄稿不算，需要新版的卡組呼叫的一方不傳進來。skip 是不能用的 ID（重複的，D-157）。照年級學期、單元、筆記順序排。
 * 一般知識（subject 是 null）：不是學業卡組的卡組裡的目標。
 */
export function existingTargets(decks: readonly { path: string; deck: Deck }[], subject: string | null, term: string, skip: ReadonlySet<string> = new Set()): ExistingTarget[] {
  return existingDecks(decks, subject, term).flatMap(({ path, deck: { props, targets } }) => usable(targets, skip).map(t => {
    const where = [props.term, props.unit?.code, t.fields.sources.join('、')].filter(Boolean).join(' ');
    const first = t.prompts.at(0);
    return { id: t.id!, name: t.name, source: where, path, ...first ? { first: firstLine(first) } : {} };
  }));
}

/** existingTargets 與 learnedWords 共用的卡組篩選與排序（tasks/ai-cards-materials.md §1-2）。 */
function existingDecks<T extends { path: string; deck: Deck }>(decks: readonly T[], subject: string | null, term: string): T[] {
  const mine = termKey(term.trim()), rank = termRank(mine);
  const before = (other: string): boolean => {
    const key = termKey(other.trim()), at = termRank(key);
    return rank !== null && at !== null ? at <= rank : key === mine;
  };
  const chosen = decks.filter(({ deck: { props } }) => props.status !== 'draft' && !props.isTranscript && (subject === null
    ? props.subject === null && props.term === null
    : props.subject?.trim() === subject && props.term !== null && before(props.term)));
  return [...chosen].sort((a, b) => compareTerm(a.deck.props.term ?? '', b.deck.props.term ?? '')
    || compareCode(a.deck.props.unit?.code ?? '', b.deck.props.unit?.code ?? '') || (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}
/** 會送出的目標：有 ID、讀得懂、不是不能用的 ID。 */
const usable = (targets: readonly Target[], skip: ReadonlySet<string>): Target[] => targets.filter(t => t.id !== null && t.ok && !skip.has(t.id));

/**
 * 孩子已有的英文單字（D-193 第 10 點、D-210 第 4 點、tasks/ai-cards-materials.md §1）：和 existingTargets 同一批目標，取 learnedWord；
 * 同一個字（pickKey：大小寫、全半形、連續空白不分）只列一次，照第一次出現的寫法與位置。
 */
export function learnedWords(decks: readonly { path: string; deck: Deck }[], subject: string, term: string, skip: ReadonlySet<string> = new Set()): string[] {
  const seen = new Set<string>(), words: string[] = [];
  for (const { deck } of existingDecks(decks, subject, term)) {
    for (const target of usable(deck.targets, skip)) {
      const word = learnedWord(target);
      if (word === null || seen.has(pickKey(word))) continue;
      seen.add(pickKey(word));
      words.push(word);
    }
  }
  return words;
}

/**
 * 和已有目標比對的說明（`提示 v3`，tasks/ai-cards-add.md §5 第 2、3、5 點）：同池例與另立例、拿不準的放進候選（不算上限）、
 * 一律用清單的 ID、兩個引言框的短範例。只在有已有目標時送。
 */
function existingRules(r3: boolean): string[] {
  return [
    '- 「學生已有的學習目標」每一項寫 `ID 名稱｜出處｜第一題`，第一題是那個目標現在的第一題。這次的內容和它們比對：',
    '  - 換了情境，答題靠的還是同一個判準：加題，寫在「加進已有的學習目標」。例如兩題都要用「地勢平坦、交通方便」解釋人口分布，換了地點也是加題。',
    '  - 要用新的機制才答得對：另立新的學習目標。例如新題要用「工作機會吸引人口」才答得對，就另立。',
    '  - 拿不準是不是同一個（第一題和名稱對不上、只涵蓋一部分、要看圖才答得出、合起來仍確認不了）：寫成完整的新目標放進候選卡片，理由那一行寫 `理由：可能重複 <ID>｜<哪裡拿不準>`。這種不算進候選卡片最多 5 個的上限，上限只算其他的候選。',
    '  - 提到已有的學習目標一律用這份清單的 ID，不要自己編。',
    ...r3 ? ['  - 架構段的比對結果寫「加題」「另立」或「放進候選」，加一句理由；全貌寫到和已有目標的關係時，用一句話寫清楚是哪兩個目標、為什麼有關。'] : [],
    '  - 兩個引言框的寫法與順序（加進已有的放在學習目標之後，候選卡片放在最後）：',
    '',
    '    ```markdown',
    '    > [!note] 加進已有的學習目標',
    '    > - <ID> <已有的名稱>',
    '    >     - 出處：<這次的頁碼>',
    '    >     - <新的題目> :: <答案>',
    '',
    '    > [!note]- 候選卡片',
    '    > - <新目標的名稱>',
    '    >     - 理由：可能重複 <ID>｜<哪裡拿不準>',
    '    >     - <題目> :: <答案>',
    '    ```',
    '',
  ];
}

/** 任務資料裡點選填空那一行（D-210 第 1 點）：沒有這一欄當成沒勾。 */
export const pickLine = (pick: boolean | undefined): string => `- 點選填空：${pick === true ? '要' : '不要'}`;

/** 英文的已有單字那一行（D-210 第 4 點、tasks/ai-cards-materials.md §1-3）；不是英文是 null。 */
export function wordsLine(words: readonly string[] | null): string[] {
  if (words === null) return [];
  return [`- 孩子已有的英文單字（只用來挑記憶錨點的連結，不用來判斷加題）：${words.length ? words.join('、') : '無'}`];
}

/** 點選填空的規則（D-210 第 1 點、tasks/ai-cards-materials.md §3）：製卡與加深共用，寫在「另外」底下。 */
export function pickRules(pick: boolean | undefined): string[] {
  if (pick !== true) {
    return [
      // L2 第一輪 R1：名稱結尾單獨寫「比較」「相似字」（tasks/polyphone-pick.md §2 加「相似詞」）又沒有括號的組，貼回時會被當成沒寫好的點選填空擋下。R2：排序照 D-187 第 8 點不做。
      '- 家長沒勾點選填空：比較題寫成一般的問答題，名稱不要寫括號的組，最後也不要單獨寫「比較」「相似字」或「相似詞」（程式會當成沒寫好的點選填空，擋下存檔），例如 `質量和重量的差別`、`寨 辨字`。排序的題型（例如英文的排序、國語的全詩順序卡）不做。',
    ];
  }
  return [
    '- 家長勾了點選填空：容易混淆的一組字、詞或觀念（說得出這一課容易錯在哪），寫成點選填空的比較：',
    '  - 組裡每一個一個學習目標，名稱寫 `<這一個>（<整組，用頓號隔開>） 比較`，例如 `borrow（borrow、lend） 比較`、`質量（質量、重量） 比較`；國語的相似字結尾寫「相似字」、詞寫「相似詞」。',
    '  - 題目是一句話，要考的那一個寫成 ＿＿，答案只有組裡的那一個；每一個至少兩句，只有兩個的組至少三句。試填組裡的每一個，有兩個說得通就改句子。',
    '  - 每一個都寫分辨的線索，放在自己目標底下的記憶錨點。',
    '  - 規則寫得更細的（例如英文介系詞的組用整個片語當名稱）照規則。',
  ];
}

/** 任務段（§3）：`## 這一次的任務`、任務資料、附加說明。words：英文的已有單字（learnedWords），其他科是 null。 */
export function taskSection(form: CardForm, subject: Pick<RuleSubject, 'subject' | 'r3'>, existing: readonly ExistingTarget[], words: readonly string[] | null = null): string {
  const prefix = titlePrefix(form, subject);
  const lines = [
    '## 這一次的任務',
    '',
    `- 學生：${studentOf(form.term)}`,
    `- 科目：${subject.subject ?? '一般知識'}`,
    `- 單元：${form.unit.trim()}`,
    `- 學習目的：${form.purpose}`,
    `- 允許 AI 補充：${form.supplement ? '是' : '否'}`,
    pickLine(form.pick),
    `- 家長調整：${form.adjust.trim() || '無'}`,
    `- 教材：${form.material.trim() ? `附件（${form.material.trim()}）` : '附件的課本頁面'}`,
    existing.length ? '- 學生已有的學習目標：' : '- 學生已有的學習目標：無',
    ...existing.map(each => `  - ${each.id} ${each.name}｜${each.source}${each.first === undefined ? '' : `｜第一題：${each.first}`}`),
    ...wordsLine(words),
    '',
    '另外：',
    '',
    '- 教材在附件。附件沒有圖檔可以連，**不要寫 `![[…]]`**；要提到課本的圖，在出處寫圖號（例如 `p.42、圖 2`）。',
    ...pickRules(form.pick),
    ...existing.length ? existingRules(subject.r3) : [],
    ...prefix === null ? [] : [`- 一課分成幾篇時，篇名照 \`${prefix} <篇名>\` 寫${subject.subject === '英文' ? `，例如 \`${prefix} 單字\`` : ''}，單獨一行、前面不加 \`#\`。`],
    '- 不要寫學習目標 ID 與屬性區，程式會加。',
    ...subject.r3 ? ['- 照規則交三段，標記照抄（`<<<全貌>>>`、`<<<架構>>>`、`<<<卡組>>>`）。'] : [],
    '- 回覆的最後單獨一行寫 `<<<完>>>`。',
    // 提示 v2（真人測試 2026-11-07）：網頁的回覆複製按鈕會壓平縮排或跳脫清單符號；程式碼區塊的「複製」照原文。
    '- 整段回覆放進**一個**程式碼區塊：第一行寫 ````markdown（四個反引號），最後一行寫 ````，`<<<完>>>` 是框裡的最後一行。家長會按程式碼區塊的「複製」把它貼回來，框外不用寫說明。',
  ];
  return lines.join('\n');
}

/** 整份提示：規則組照順序，最後是任務段；部分之間空一行。 */
export function buildPrompt(form: CardForm, subject: Pick<RuleSubject, 'subject' | 'r3'>, rules: readonly EmbeddedRule[], existing: readonly ExistingTarget[], words: readonly string[] | null = null): Prompt {
  const task = taskSection(form, subject, existing, words);
  const parts: SentPart[] = [
    ...rules.map(rule => ({ name: rule.name, version: rule.version, text: rule.text, sha256: rule.sha256 })),
    { name: '任務段', version: PROMPT_VERSION, text: task, sha256: sha256Hex(task) },
  ];
  const text = parts.map(part => part.text).join('\n\n');
  return { parts, text, sha256: sha256Hex(text) };
}
