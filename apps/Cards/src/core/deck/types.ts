import type { SourcePart } from './sources.ts';

export interface Deck {
  props: DeckProps;
  targets: Target[];
  problems: Problem[];
}
export interface DeckProps {
  term: string | null;
  subject: string | null;
  unit: { code: string; name: string } | null;
  materials: string[];
  status: 'draft' | 'active' | 'paused';
  /**
   * 屬性 `狀態` 寫得怎樣（tasks/record-gaps.md §1）：沒寫、合法，或無效（值認不得、空值、屬性區寫壞或沒有結束）。
   * status 無效時照舊當啟用（顯示與排程的預設）；紀錄端照這一欄判斷，無效的不比，不把預設值當成看到的值。
   */
  statusRead: 'missing' | 'valid' | 'invalid';
  categories: string[];
  isTranscript: boolean;
  /**
   * 屬性「需要版本」（syntax.md §0-1、§2-1）：沒寫是 null；值是字串時是那個字串，格式與新舊由知道這台版本的一方判斷；
   * 值不是字串，或屬性區讀不出來而原文含「需要版本」時是 false（有標記但壞掉，等於讀不懂）。
   */
  need: string | false | null;
  /** 屬性寫法有問題（`單元: 3`、沒加引號的 `材料: [[…]]`，§9-2）：目錄與存檔的提示共用，不默默變成沒有。 */
  issues: PropertyIssue[];
}
/** line 從 0 算（檔案的第幾行）。 */
export interface PropertyIssue { line: number; message: string }
export interface Target {
  id: string | null;
  name: string;
  line: number;
  implicit: boolean;
  section: string | null;
  /**
   * section 是這篇的第幾個小標題（從 0 算）；沒有標題時沒有這一欄。同一篇同名的兩首詩靠它分（接句卡 L2 R1）。
   * 不用行號：加出處這類插行的改動會讓後面的標題位移，寫回前的核對會當成內容變了（L2 R5）。
   */
  sectionIndex?: number;
  fields: Fields;
  prompts: Prompt[];
  shared: string[];
  direction: 'en-zh' | 'zh-en' | null;
  pairKey: string | null;
  ok: boolean;
  /** 只有 ambiguous-id 的目標才有：那一行出現的 ID 寫法，照出現的順序、不重複（W5 §8-3）。 */
  idCandidates?: string[];
  /** 只有點選填空的目標才有（D-182、tasks/question-type-seam.md §3）。 */
  group?: PickGroup;
  /** 只有多音字的點選填空才有（D-230 第 4 點、tasks/polyphone-pick.md §1）：選項是這個目標自己的，寫在名稱最後一個括號。 */
  choice?: Choice;
  /** 只有全詩順序卡才有（D-187、D-204）：名稱最後是「排序」、題目是一題好幾格的填空。 */
  order?: PoemOrder;
  /** 只有英文的句子排序卡才有（D-193 第 8 點）：名稱最後是「排序」、每一題都是好幾格的英文填空。 */
  sentence?: SentenceOrder;
  /** 只有名稱結尾是「文法」或變化種類的目標才有（D-193 第 5、6 點）：問答題打字。 */
  typing?: Typing;
  /** 只有英翻中才有：pairKey 正規化後的寫法，變化目標找配對用（D-193 第 5 點）；base 是去掉最後一組括號的。 */
  pairWord?: { exact: string; base: string };
  /** 只有接句卡才有（D-185 第 8 點）：名稱最後是「接句」、題目是一題剛好一格的填空。 */
  couplet?: Couplet;
}
/**
 * 文法或變化目標（D-193、tasks/english-typed-order.md §1）：hint 是第 2 步的提示（文法點或原形），沒有是 null。
 * pair 只有變化才有：配對英翻中的鍵；exact 是名稱有括號，只配同一個意思。
 */
export interface Typing { kind: 'grammar' | 'inflection'; hint: string | null; pair: { key: string; exact: boolean } | null }
/**
 * 英文的句子排序卡（tasks/english-typed-order.md §4）：prompts 和目標的 prompts 一一對應。
 * 每一題：第一格前面的字、每一格的詞塊（拿掉結尾的標點、句首改小寫，比對與字鍵都用它）、每一格後面接的字（含拿掉的標點）、哪幾格在句首。
 */
export interface SentenceOrder { title: string; prompts: readonly SentenceCells[] }
export interface SentenceCells { head: string; words: readonly string[]; tails: readonly string[]; starts: readonly boolean[] }
/**
 * 全詩順序卡：詩名（名稱拿掉最後的「排序」「全詩」）、每一格的文字（照填空的順序，相同的兩句兩格都留）、
 * 第一格前面的字、每一格後面接到下一格之前的字（多半是標點）。
 * notes 是記憶錨點的子項目，一項一行，照解析器分好的結構（L2 R7）；項目裡的續行與更深的子項目接在那一行裡。
 */
export interface PoemOrder { title: string; head: string; lines: readonly string[]; tails: readonly string[]; notes: readonly string[] }
/**
 * 接句卡（tasks/couplet-cards.md §1、§2）：詩名（目標所在的小標題，沒有是 null）、第幾句（名稱的「第 N 句 接句」，讀不到是 null）、
 * 題目照句尾標點切成的每一句（原文，連同自己的標點與 ==…==）、目標底下第一個記憶錨點的子項目（和 PoemOrder.notes 同一份）、
 * 題目底下第一個記憶錨點的子項目（§2-7，L2 R2）；沒有是空的。
 */
export interface Couplet { title: string | null; index: number | null; lines: readonly string[]; notes: readonly string[]; promptNotes: readonly string[] }
/**
 * 點選填空的組：名稱的字或詞、字鍵（照括號裡寫的）、組的身分（正規化後排序的陣列的 JSON）、結尾（卡片的標題）。
 * wordKey、memberKeys 是 word、members 正規化後的寫法（memberKeys 和 members 對齊）：出題端從 deck 只拿型別，比對同一個字用它們。
 */
export interface PickGroup { word: string; members: readonly string[]; key: string; title: string; wordKey: string; memberKeys: readonly string[] }
/**
 * 多音字（tasks/polyphone-pick.md §1、§4-2）：選項屬於這個目標的點選填空，選項是名稱最後一個括號裡的讀音（optionKeys 是正規化後的，和 options 對齊）。
 * 不放進 group：group.key 是好幾個目標的組。answers 對齊 prompts，是每一題的答案在 options 的位置；stems 對齊 prompts，是每一題畫面上的句子
 * （choiceStem：只差粗體、底線數、註解的算同一句，L2 第二輪 3）；anchors 對齊 options，是記憶錨點裡那個讀音的說明與常用詞（第一個全形冒號後面，
 * 沒有是 null）；rest 是對不到讀音的錨點行，照原本的順序。
 */
export interface Choice { word: string; options: readonly string[]; optionKeys: readonly string[]; title: string; answers: readonly number[]; stems: readonly string[]; anchors: readonly (string | null)[]; rest: readonly string[] }
export interface Fields {
  sources: string[];
  type: string | null;
  importance: 'high' | 'medium' | 'low';
  paused: boolean;
  /** `狀態` 的第一個值認不得（tasks/record-gaps.md §1）：paused 照舊是 false，紀錄端不比。只有這種情況才有這一欄。 */
  statusInvalid?: true;
  remarks: string[];
  mistakes: string[];
}
export type Prompt =
  // typed：中翻英的正確答案，答案格照 | 拆開，第一個是課本用的（D-122）；其他題目是 null。answer 與指紋仍是整個答案格。
  | { kind: 'qa'; line: number; question: string; answer: string; extras: string[]; typed: readonly string[] | null; fingerprint: string }
  | { kind: 'cloze'; line: number; text: string; blanks: { start: number; end: number }[]; extras: string[]; fingerprint: string };
export interface Problem {
  line: number;
  level: 'error' | 'hint';
  code: ProblemCode;
  message: string;
  targetLine: number | null;
  /**
   * 資料欄位那一項的其中一段（tasks/edit-markup.md §1-2，座標照 §3-2）：line 是那一段所在的行（接續行照實），from、to 是那一行原文的位置。
   * 只有 unknown-field-value、duplicate-field（那一段的值）與 unknown-field（整段）會填；跨了兩行的不填，畫 line 那一行。
   */
  columns?: Span;
}
/**
 * 原文的一段（tasks/edit-markup.md §3-2）：line 從 0 算，是檔案的第幾行；from、to 是那一行原文的 UTF-16 位置，範圍是 [from, to)。
 * Tab、全形空白各算一個字元；縮排的顯示寬度（Item.indent、contentColumn）是另一種單位，不能拿來切字串。
 */
export interface Span { line: number; from: number; to: number }
/** 資料欄位的名稱（syntax §2-4）。 */
export type FieldName = '出處' | '類型' | '重要性' | '狀態' | '備註' | '錯題補強';
/**
 * 一個 `出處` 欄位（§3-3 第 1 點），照遞迴的順序；同一行用 `｜` 寫了兩個算兩個。line 是欄位那一項的第一行；
 * name、colon 各帶自己的行號（出處從接續行開始、名稱後面換行才打冒號時就在接續行）；value 是冒號後面同一行的值，那一行沒有字是 null。
 * joined：這一項用 `｜` 或半形 `|` 接了別的欄位；continued：這一項或當成出處值的子項目有接續行；children：當成出處值的子項目的第一行。
 */
export interface SourceFieldLayout { line: number; name: Span; colon: Span; value: Span | null; joined: boolean; continued: boolean; children: number[] }
/** 一個資料欄位的名稱與冒號（§3-3 第 4 點）：六個欄位都算，同一行用 `｜` 接的每一段也算；可以跨行。 */
export interface FieldColon { field: FieldName; name: Span; colon: Span }
/**
 * 一個目標的出處原文位置（§3-3），只有 parseDeck(text, { layout: true }) 才有；不放進 Target，改縮排與 ID 的保護比的是 targets（回報 R2）。
 * entries 和 fields.sources 一一對應，跨了接續行或原文沒有一段連續的字等於它時是 null；parts 是 sourceLinks 讀的時候切出的每一段，那一項是 null 時它的段也沒有位置。
 */
/** end：目標的範圍到哪一行之前（從 0 算，不含），和解析把題目歸給這個目標的範圍相同（L2 第一輪 R4）。 */
export interface TargetLayout { fields: SourceFieldLayout[]; entries: (Span | null)[]; parts: SourcePart[]; fieldColons: FieldColon[]; end: number }
export type ProblemCode =
  | 'empty-question' | 'missing-answer' | 'typed-answer-invalid'
  // typed-answer-words：hint，好幾個答案的字數不一樣，畫線照第一個（D-122）。
  | 'typed-answer-words'
  | 'duplicate-field' | 'unknown-field-value' | 'unknown-field'
  | 'unknown-property-value' | 'duplicate-id' | 'cloze-not-typed'
  // misplaced-id：hint，目標的 ID 不在行尾，照樣認得、存檔時移回行尾；ambiguous-id：error，目標那一行有兩個以上的 ID（D-134）。
  | 'misplaced-id' | 'ambiguous-id'
  // field-children：hint，分行的資料裡忽略的子項目（§9-4）。
  | 'field-children'
  // 點選填空（tasks/question-type-seam.md §3）：pick-answer-invalid 是 error，答案是組裡別的字；另外兩個是 hint，照原題型。一個目標最多一種。
  | 'pick-answer-invalid' | 'pick-mixed' | 'pick-not-recognized';
export interface AssignOptions {
  taken: ReadonlySet<string>;
  random?: () => number;
  /** 這些行的目標不補、不移動、不改縮排（待處理的，W5 §8-5）。 */
  skip?: ReadonlySet<number>;
}
export interface AssignResult {
  text: string;
  assigned: { line: number; id: string }[];
}
