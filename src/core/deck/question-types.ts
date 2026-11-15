import { maskInline } from './markdown.ts';
import type { Couplet, PickGroup, PoemOrder, ProblemCode, Prompt, Target } from './types.ts';

// 題型接點的第一個（D-181）：一種題型的名稱與題目怎麼認、哪些算寫錯。其他三個在 core/study/compose.ts、review/flow.ts、ui/screens.tsx。

interface TypedAnswer {
  /** 比對用的答案；不能當打字答案、不拆開時是 null。 */
  typed: readonly string[] | null;
  problem: { code: ProblemCode; message: string; level?: 'error' } | null;
}

/**
 * 中翻英的答案格（打字）：好幾個正確答案用 | 分開（D-122），每一段各自去掉格式與前後空白；`a|b` 也認得。指紋仍用整個答案格。
 * 先看整格（W6 §0-1、syntax.md §2-3）：換行、跳脫的管線、行內程式碼、公式；ASCII 的 [ ] < >（Obsidian 與 Markdown
 * 的連結或嵌入、角括號與參照式連結，字面的括號也一起不收）；任何位置不分大小寫的 http(s)://；全形的｜。
 * 都不能當打字答案，不拆開、typed 是 null（換行要在 trim 之前看；Codex 格式查核 F1、F2，L2 的 S1 與它的格式查核）。
 */
export function typedAnswer(answer: string): TypedAnswer {
  const invalid = { code: 'typed-answer-invalid', message: '中翻英的答案只能是單行英文單字或片語，好幾個答案用 | 分開；不能有換行、連結、程式碼或公式', level: 'error' } as const;
  if (/[\r\n`$[\]<>｜]|\\\||https?:\/\//i.test(answer)) return { typed: null, problem: invalid };
  const typed = answer.split('|').map(part => part.replace(/\*\*|\*|_|==/g, '').trim());
  if (typed.some(part => !part || /\p{Script=Han}/u.test(part))) return { typed, problem: invalid };
  if (new Set(typed.map(part => part.split(/\s+/).length)).size > 1) return { typed, problem: { code: 'typed-answer-words', message: '好幾個答案的字數不一樣，畫線照第一個' } };
  return { typed, problem: null };
}

// ── 點選填空（D-182、tasks/question-type-seam.md §3）：程式認括號，不認結尾的詞；結尾只決定提示。 ──

/** 只折全半形（U+FF01～FF5E），不做整串 NFKC：`①` 和 `1` 不同。 */
const foldWidth = (text: string): string => text.replace(/[！-～]/g, char => String.fromCharCode(char.charCodeAt(0) - 0xFEE0));

/** 比對答案、組員與組的身分用的寫法：去掉成對的 `**`、`==` 與前後空白，連續空白（含全形）當一個，英文不分大小寫。字鍵照括號裡寫的顯示。 */
function pickKey(text: string): string {
  const bare = text.replace(/\*\*(.+?)\*\*/g, '$1').replace(/==(.+?)==/g, '$1');
  return foldWidth(bare).replace(/\s+/g, ' ').trim().toLowerCase();
}

/**
 * 一段文字有幾個空格（§3〈空格怎麼數〉）：連續的 `＿` 算一格，半形 `__` 不算。不看行內程式碼、公式、整個圖片與嵌入、連結目的地、
 * HTML 標籤與 `%%` 註解；連結文字算，字元參照當一個 `＿`（渲染後就是）。隔開的內容換成 \0，渲染後它們也是不同的文字節點；
 * 註解渲染後不見了，直接拿掉。
 */
function countBlanks(text: string): number {
  const visible = maskInline(text)
    .replace(/%%[^]*?%%/g, '')
    .replace(/!\[\[[^\]\n]*\]\]/g, '\0')
    .replace(/!\[[^\]\n]*\]\([^)\n]*\)/g, '\0')
    .replace(/\[\[[^\]\n|]*\|([^\]\n]*)\]\]/g, '\0$1\0')
    .replace(/\[([^\]\n]*)\]\([^)\n]*\)/g, '\0$1\0')
    .replace(/<\/?[a-zA-Z][^<>\n]*>/g, '\0')
    .replace(/&#(?:65343|[xX]0*[fF][fF]3[fF]);/g, '＿');
  return visible.match(/＿+/g)?.length ?? 0;
}

/** 名稱拆成字或詞、連續的括號與其後的文字；這一段有不成對、巢狀的括號，或沒有括號就是 null。 */
function splitName(name: string): { word: string; brackets: string[]; rest: string } | null {
  const head = /^[^（(）)]+/.exec(name);
  if (!head) return null;
  const word = head[0].trim().replace(/^\*\*(.+)\*\*$/, '$1').trim();
  let rest = name.slice(head[0].length);
  const brackets: string[] = [];
  for (let match = /^\s*[（(]([^（）()]*)[）)]/.exec(rest); match; match = /^\s*[（(]([^（）()]*)[）)]/.exec(rest)) {
    brackets.push(match[1]);
    rest = rest.slice(match[0].length);
  }
  if (/^\s*[（(）)]/.test(rest) || !word || !brackets.length) return null;
  return { word, brackets, rest: rest.trim() };
}

/** 切項目：有頓號或逗號時只照它們切，空白留在項目裡；完全沒有時空白都切。空的項目丟掉，重複的只留第一個。 */
function membersOf(inner: string): string[] {
  const items = (/[、,，]/.test(inner) ? inner.split(/[、,，]/) : inner.split(/\s+/)).map(item => item.trim()).filter(Boolean);
  const first = new Map<string, string>();
  for (const item of items) if (!first.has(pickKey(item))) first.set(pickKey(item), item);
  return [...first.values()];
}

const LIST_SHAPE = /[、,，\s]/;

/** 最後一個清單形狀、又含括號前面的字或詞的括號（§3〈組怎麼讀〉）；它讀不成有效的組就是沒有組，不再往前找。 */
function readGroup(name: string): PickGroup | null {
  const split = splitName(name);
  if (!split) return null;
  for (const inner of [...split.brackets].reverse()) {
    if (!LIST_SHAPE.test(inner)) continue;
    const members = membersOf(inner);
    const keys = members.map(pickKey);
    if (!keys.includes(pickKey(split.word))) continue;
    if (members.length < 2 || members.some(member => /[`$[\]<>]/.test(foldWidth(member)))) return null;
    return { word: split.word, members, key: JSON.stringify([...keys].sort()), title: split.rest, wordKey: pickKey(split.word), memberKeys: keys };
  }
  return null;
}

/** 名稱讀得出組時，比較句的答案該寫的字或詞（AI 製卡的錯誤訊息用）；讀不出是 null。 */
export const pickWord = (name: string): string | null => readGroup(name)?.word ?? null;

/** 沒有組時的結尾：名稱最後一段，前面要有空白或右括號。 */
const endingOf = (name: string): string | null => /[\s）)]([^\s）)]+)$/.exec(name)?.[1] ?? null;

/** 讀不出組的原因（pick-not-recognized 的文字，check-syntax 也用它）。 */
function groupFailure(name: string): string {
  const how = '比較卡的名稱寫成「寨（寨、塞） 相似字」';
  const split = splitName(name);
  if (!split || !split.brackets.some(inner => LIST_SHAPE.test(inner))) return `括號讀不出組：括號裡要用頓號隔開。${how}`;
  if (!split.brackets.some(inner => membersOf(inner).some(member => pickKey(member) === pickKey(split.word)))) return `名稱的字或詞不在括號裡。${how}`;
  return `括號讀不出組：至少要兩個不同的字或詞，不能有連結、程式碼或公式。${how}`;
}

export interface PickReading {
  group: PickGroup | null;
  problems: { line: number; level: 'error' | 'hint'; code: ProblemCode; message: string }[];
}

const NOT_PICK: PickReading = { group: null, problems: [] };

/** 比較句：問答題，題幹剛好一個空格，答案單行。 */
const isSentence = (prompt: Prompt): boolean => prompt.kind === 'qa' && countBlanks(prompt.question) === 1 && !prompt.answer.includes('\n');
const answerOf = (prompt: Prompt): string => prompt.kind === 'qa' ? pickKey(prompt.answer) : '';

/**
 * 這個目標是不是比較卡（§3〈判斷的順序〉）：先看目標與題目的形狀，再看組，最後才分類錯誤；每個目標只有一種結果，比較卡的診斷最多一種代碼，
 * 那個代碼可以對到好幾行。括號本來就有別的用途（D-125），所以多半的情況是照原題型，不算寫錯。
 */
export function readPick(target: Target): PickReading {
  const { name, prompts } = target;
  if (target.implicit || name.includes('==') || countBlanks(name) > 0 || target.direction !== null) return NOT_PICK;
  const group = readGroup(name);
  const ending = group ? group.title : endingOf(name);
  const hinted = ending === '相似字' || ending === '比較';
  const notRecognized = (lines: readonly number[], message: string): PickReading => hinted ? { group: null, problems: lines.map(line => ({ line, level: 'hint', code: 'pick-not-recognized', message })) } : NOT_PICK;
  if (prompts.every(prompt => prompt.kind === 'cloze')) return notRecognized([target.line], '填空題不會變成比較卡；比較卡的題目寫成「題幹有一個 ＿＿ :: 答案」');
  if (!group) return notRecognized([target.line], groupFailure(name));
  if (prompts.some(prompt => prompt.kind === 'qa' && (!prompt.question || !prompt.answer.trim()))) return NOT_PICK;
  const word = pickKey(group.word), members = group.members.map(pickKey);
  const other = prompts.filter(prompt => isSentence(prompt) && answerOf(prompt) !== word && members.includes(answerOf(prompt)));
  if (other.length) return { group: null, problems: other.map(prompt => ({ line: prompt.line, level: 'error', code: 'pick-answer-invalid', message: `答案是組裡別的字或詞；一格只對一個目標，這一句要放到「${prompt.kind === 'qa' ? prompt.answer : ''}」那個目標底下` })) };
  const matches = (prompt: Prompt): boolean => isSentence(prompt) && answerOf(prompt) === word;
  if (prompts.every(matches)) return { group, problems: [] };
  if (prompts.some(matches)) {
    return { group: null, problems: prompts.filter(prompt => !matches(prompt)).map(prompt => ({ line: prompt.line, level: 'hint', code: 'pick-mixed', message: `這一題不是比較句（題幹一個 ＿＿，答案是「${group.word}」），所以這個目標照原題型出；不同能力請拆成不同目標` })) };
  }
  const outside = prompts.filter(prompt => isSentence(prompt) && !members.includes(answerOf(prompt)));
  if (outside.length) return notRecognized(outside.map(prompt => prompt.line), '答案不在組裡，所以這個目標不是比較卡');
  return notRecognized([target.line], '題目沒有剛好一個空格（＿＿），所以這個目標不是比較卡');
}

// ── 全詩順序卡（D-187 第 3、10 點、D-204）：點選填空的一種，用填空寫，從名稱最後的「排序」認；和比較卡不互搶（比較卡的題目都是問答）。 ──

/**
 * 這個目標是不是全詩順序卡：名稱最後一段是「排序」（前面要有空白或右括號），只有一題，是兩格以上的填空。
 * 不是時照原題型（填空翻面），不另外提示：英文的排序（D-193）寫成問答題，還沒接上。
 */
export function readOrder(target: Target, notes: readonly string[]): PoemOrder | null {
  const { name, prompts } = target;
  if (target.implicit || target.direction !== null || target.group || endingOf(name) !== '排序') return null;
  const prompt = prompts.length === 1 ? prompts[0] : null;
  if (prompt?.kind !== 'cloze' || prompt.blanks.length < 2) return null;
  const { text, blanks } = prompt;
  const lines = blanks.map(blank => text.slice(blank.start + 2, blank.end - 2).trim());
  if (lines.some(line => !line)) return null;
  const tails = blanks.map((blank, i) => text.slice(blank.end, blanks.at(i + 1)?.start ?? text.length));
  const title = name.replace(/\s*排序$/, '').replace(/(^|\s)全詩$/, '').trim();
  return { title, head: text.slice(0, blanks[0].start), lines, tails, notes };
}

// ── 接句卡（D-185 第 6～8 點、tasks/couplet-cards.md §1、§2）：翻面卡的一種，用填空寫，從名稱最後的「接句」認。 ──

/** 句尾的標點，後面緊接的右引號、右括號算同一句。 */
const SENTENCE_END = /^[，。；！？：,;!?]+[」』）)】〕》〉"”’]*/;
/** 填空以外的行內 Markdown（粗體、連結、程式碼、公式、HTML、註解、跳脫、字元參照）：切開會把結構拆成兩半（L2 R4）。 */
const INLINE_MARKUP = /[*_~`[\]<>$%\\&^|]/;

/**
 * 題目照句尾標點切成每一句，連同自己的標點；==…== 裡面的標點不切，句子之間的空白拿掉。
 * 有填空以外的行內 Markdown 時不切，整句交給渲染器（照一般的方式換行）。
 */
function coupletLines(text: string): string[] {
  if (INLINE_MARKUP.test(text.replace(/==/g, ''))) return [text.trim()];
  const lines: string[] = [];
  let start = 0, inside = false;
  for (let i = 0; i < text.length; i++) {
    if (text.startsWith('==', i)) { inside = !inside; i++; continue; }
    const end = inside ? null : SENTENCE_END.exec(text.slice(i));
    if (!end) continue;
    lines.push(text.slice(start, i + end[0].length).trim());
    start = i + end[0].length;
    i = start - 1;
  }
  lines.push(text.slice(start).trim());
  return lines.filter(Boolean);
}

/**
 * 這個目標是不是接句卡：名稱最後一段是「接句」（前面要有空白或右括號），只有一題，是剛好一格的填空，不是比較組、全詩順序卡也沒有方向。
 * 詩名是目標所在的小標題；第幾句從「第 N 句 接句」讀。不是時照原題型（填空翻面），不另外提示。
 */
export function readCouplet(target: Target, notes: readonly string[]): Couplet | null {
  const { name, prompts } = target;
  if (target.implicit || target.direction !== null || target.group || target.order || endingOf(name) !== '接句') return null;
  const prompt = prompts.length === 1 ? prompts[0] : null;
  if (prompt?.kind !== 'cloze' || prompt.blanks.length !== 1) return null;
  const index = /第\s*(\d+)\s*句\s+接句$/.exec(name);
  return { title: target.section, index: index ? Number(index[1]) : null, lines: coupletLines(prompt.text), notes };
}
