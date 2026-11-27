import { maskInline, questionSyntax } from '../markdown.ts';
import type { PoemOrder, Prompt, SentenceAlt, SentenceCells, SentenceOrder, Target } from '../types.ts';
import { readGroup } from './group.ts';
import type { PickReading } from './group.ts';
import { endingOf } from './shared.ts';

// ── 全詩順序卡（D-187 第 3、10 點、D-204）：點選填空的一種，用填空寫，從名稱最後的「排序」認；和比較卡不互搶（比較卡的題目都是問答）。 ──

/**
 * 這個目標是不是全詩順序卡：名稱最後一段是「排序」（前面要有空白或右括號），只有一題，是兩格以上的填空。
 * 不是時照原題型（填空翻面），不另外提示。英文卡組裡沒寫「全詩」的是句子排序（readSentence），不在這裡認。
 */
export function readOrder(target: Target, notes: readonly string[], english = false): PoemOrder | null {
  const { name, prompts } = target;
  if (english && !/(^|\s)全詩\s*排序$/.test(name)) return null;
  if (target.implicit || target.direction !== null || endingOf(name) !== '排序') return null;
  const prompt = prompts.length === 1 ? prompts[0] : null;
  if (prompt?.kind !== 'cloze' || prompt.blanks.length < 2) return null;
  const { text, blanks } = prompt;
  const lines = blanks.map(blank => text.slice(blank.start + 2, blank.end - 2).trim());
  if (lines.some(line => !line)) return null;
  const tails = blanks.map((blank, i) => text.slice(blank.end, blanks.at(i + 1)?.start ?? text.length));
  const title = name.replace(/\s*排序$/, '').replace(/(^|\s)全詩$/, '').trim();
  return { title, head: text.slice(0, blanks[0].start), lines, tails, notes };
}

// ── 英文的句子排序（D-193 第 8 點、§4）：英文卡組裡結尾是「排序」、沒寫「全詩」的。 ──

/** 句末的標點（§4-5）：只拿掉最後一格的，而且後面只剩空白與結束的引號。 */
const FINAL = /[.?!]+$/;
/** 英文句子的開頭（§4-6）：前面沒有字，或最後一個字是中文、全形標點。 */
const OPENS = /(?:^|[\p{Script=Han}\u3000-\u303f\uff00-\uffef])$/u;

/** 一題的格（§4-5、§4-6）；不到兩格、有一格沒有字（空的或只有標點）時是 null。 */
function sentenceCells(prompt: Prompt): SentenceCells | null {
  if (prompt.kind !== 'cloze') return null;
  const { text, blanks } = prompt;
  const blocks = readBlocks(text, blanks);
  if (!blocks) return null;
  const head = visibleText(text.slice(0, blanks[0].start)).replace(/[\s\p{Ps}\p{Pi}"'*_]+$/u, '');
  const starts = blocks.words.map((_, i) => i === 0 && OPENS.test(head));
  return { head: text.slice(0, blanks[0].start), words: blocks.words, tails: blocks.tails, starts };
}

/**
 * 一行填空的詞塊與每一格後面的字（§4-3、§4-5）：題目那一行與另一種排法共用同一套（tasks/sentence-order-alternatives.md §2）。
 * 不到兩格、有一格不是純文字或只有標點時是 null。
 */
function readBlocks(text: string, blanks: readonly { start: number; end: number }[]): { words: string[]; tails: string[] } | null {
  if (blanks.length < 2) return null;
  // 詞塊是純文字（L2 R6 與第二輪）：成對的粗體、斜體拿掉，鍵、句首大寫與比對都照看得到的字；題目的指紋照原文。
  const read = blanks.map(blank => plainBlock(text.slice(blank.start + 2, blank.end - 2)));
  if (read.some(word => word === null)) return null;
  const words = read as string[];
  const tails = blanks.map((blank, i) => text.slice(blank.end, blanks.at(i + 1)?.start ?? text.length));
  const last = words.length - 1;
  const mark = FINAL.exec(words[last])?.[0] ?? '';
  const bare = words[last].slice(0, words[last].length - mark.length).trim();
  // 句末才拿：後面只剩空白與結束的引號、括號；拿掉後還有點的是縮寫（U.S.），不拿。
  if (mark && /^[\s\p{Pe}\p{Pf}"'*_]*$/u.test(tails[last]) && bare && !bare.includes('.')) {
    words[last] = bare;
    tails[last] = mark + tails[last];
  }
  // 只有標點的格不是詞塊（`==?==`）：照原題型。
  if (words.some(word => !/[\p{L}\p{N}]/u.test(word))) return null;
  return { words, tails };
}

/**
 * 一格的詞塊（§4-3）：成對的 `**`、`*`、`__`、`_` 拿掉後剩下純文字；還有 Markdown 的記號（未成對的 `*`、`_`，連結、程式碼、公式、
 * 跳脫、字元參照）就是 null，這一題不是句子排序（L2 第二輪：不默默改字，`A_B` 和 `AB` 不會變成同一個鍵）。
 */
function plainBlock(raw: string): string | null {
  const text = raw.replace(/\*\*(.+?)\*\*/g, '$1').replace(/__(.+?)__/g, '$1').replace(/\*(.+?)\*/g, '$1')
    .replace(/(?<![\p{L}\p{N}])_(.+?)_(?![\p{L}\p{N}])/gu, '$1').trim();
  return /[*_[\]<>`$\\|~]|&#?\w+;/.test(text) ? null : text;
}

// ── 有另一種排法時畫面上的字（tasks/sentence-order-alternatives.md §5）：純函式，畫面只拿來用。 ──

/** 畫面要的那幾欄：CardGroup.order（core/study）和 SentenceCells 都是這個樣子。 */
interface SentenceShape { head: string; tails: readonly string[]; starts?: readonly boolean[]; others?: readonly SentenceAlt[] }

/** 第 i 種對的順序的格後面的字：0 是題目那一行，其他照 others。 */
const tailsOf = (order: SentenceShape, i: number): readonly string[] => i === 0 ? order.tails : order.others?.[i - 1]?.tails ?? order.tails;

/**
 * 每一格後面顯示的字：orders（PickView.orders）每一種都一樣的位置照顯示；不一樣的位置（只會是標點與空白，§1 第 4 點）顯示一個空白，
 * 最後一格後面不一樣時什麼都不顯示。沒有 orders（沒有另一種排法）照題目那一行。
 */
export function shownTails(order: SentenceShape, orders: readonly number[] | undefined): string[] {
  if (!orders?.length) return [...order.tails];
  const all = orders.map(i => tailsOf(order, i));
  return all[0].map((tail, at) => all.every(each => each[at] === tail) ? tail : at === all[0].length - 1 ? '' : ' ');
}

/**
 * 格後面的字在每一種對的順序都一樣嗎（§5）：不一樣的位置（true）畫面另外放、作答時只換那裡的字，句子本身不重新渲染（L2 第一輪：重畫會閃一下）。
 * 沒有另一種排法時都是 false。
 */
export function movingTails(order: SentenceShape): boolean[] {
  return order.tails.map((tail, at) => (order.others ?? []).some(other => other.tails[at] !== tail));
}

/**
 * 結果是第 result 種時，其他對的順序的整句（照寫的順序，題目那一行最前）：題目第一格前面看得到的英文（sentenceLead），
 * 接上詞塊與格後面的字，句首大寫照 starts。words 是題目那一行的詞塊（CardGroup.members）。
 */
export function otherSentences(order: SentenceShape, result: number, words: readonly string[]): string[] {
  const lead = sentenceLead(order.head);
  const orders = [{ words, tails: order.tails }, ...(order.others ?? [])];
  return orders.flatMap((each, i) => i === result ? [] : [lead + each.words.map((word, at) => (order.starts?.[at] ? word.charAt(0).toUpperCase() + word.slice(1) : word) + each.tails[at]).join('')]);
}

/**
 * 題目第一格前面看得到的英文：最後一個中文或全形標點之後的字，開頭的結束括號與空白拿掉（半形的 `(用 because 合成一句) ` 不留 `) `）。
 */
function sentenceLead(head: string): string {
  const visible = visibleText(head);
  const cut = [...visible.matchAll(/[\p{Script=Han}\u3000-\u303f\uff00-\uffef]/gu)].at(-1);
  return (cut ? visible.slice(cut.index + cut[0].length) : visible).replace(/^[\s\p{Pe}]+/u, '');
}

/** 題目文字看得到的樣子（判斷句首用，L2 第二輪）：連結換成顯示的字，格式記號拿掉。 */
function visibleText(text: string): string {
  return text
    .replace(/!?\[\[([^\]|]*)(?:\|([^\]]*))?\]\]/g, (_m, target: string, alias?: string) => alias ?? target)
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\*\*|==|__|`/g, '');
}

/**
 * 英文的句子排序卡（§4-1）：英文卡組裡名稱最後一段是「排序」、沒有「全詩」、沒有方向，名稱也讀不出點選填空的組；每一題都是兩格以上的填空。
 * 不是時照原題型（填空翻面），不提示；AI 的草稿另外擋（§5）。是的時候順便讀每一題底下的另一種排法，problems 是它們的提示。
 */
export function readSentence(target: Target): { sentence: SentenceOrder | null; problems: KindProblem[] } {
  const { name, prompts } = target;
  if (target.implicit || target.direction !== null || readGroup(name) || endingOf(name) !== '排序' || /(^|\s)全詩\s*排序$/.test(name) || !prompts.length) return { sentence: null, problems: [] };
  const cells: SentenceCells[] = [], problems: KindProblem[] = [];
  for (const prompt of prompts) {
    const each = sentenceCells(prompt);
    if (!each) return { sentence: null, problems: [] };
    const read = readOthers(prompt.line, prompt.extras, each);
    problems.push(...read.problems);
    cells.push(read.others.length ? { ...each, others: read.others } : each);
  }
  return { sentence: { title: name.replace(/\s*排序$/, '').trim(), prompts: cells }, problems };
}

type KindProblem = PickReading['problems'][number];

// ── 另一種排法（D-238、D-240、tasks/sentence-order-alternatives.md §1）：句子排序的題目底下的子項目，一行一種。 ──

/** 認得的開頭：全形冒號緊接（和其他背面補充的名稱一樣，review/extras.ts）。 */
const ALT_LABEL = '另一種排法：';
/** 看起來是另一種排法的補充（冒號前有空白、半形冒號、加粗或螢光的標籤也算，L2 第二輪 F2）：認不得的、放錯地方的都用它找出來提示（§1 第 5、6 點）。 */
export const ALT_LIKE = /^[*_=~\s]*另一種排法[*_=~\s]*[：:]/u;
/** 寫在一行中間的另一種排法：前面不是字（「換成另一種排法：」是題目自己的話），後面還有填空（L2 第二輪 F2）。 */
const ALT_INLINE = /(?:^|[^\p{L}\p{N}])另一種排法[*_=~\s]*[：:].*==/u;

/**
 * 一項的文字裡看起來是另一種排法的地方（§1 第 6 點，L2 第二輪 F2）：照行回傳，at 是第幾行（0 是這一項本身那一行，之後是接續行），
 * start 是寫在行首（ALT_LIKE），否則是寫在行的中間（ALT_INLINE）。行內程式碼、公式、`%%` 註解裡的是字面的內容，不算。
 */
export function altMentions(text: string): { at: number; start: boolean }[] {
  const masked = maskInline(text).replace(/%%[^]*?%%/g, part => part.replace(/[^\n]/g, '\0'));
  const lines = masked.split('').map((char, i) => text[i] === '\n' ? '\n' : char).join('').split('\n');
  return lines.flatMap((line, at): { at: number; start: boolean }[] => ALT_LIKE.test(line) ? [{ at, start: true }] : ALT_INLINE.test(line) ? [{ at, start: false }] : []);
}
/** 字元參照寫的引號、括號、空白（`&quot;`、`&#34;`、`&nbsp;`）也看得出來（R1）：解開數字的參照與這些名稱（大小寫都算，HTML 也認 `&QUOT;`，L2 第二輪），其他照原文。 */
const NAMED: Readonly<Record<string, string>> = {
  quot: '"', apos: "'", ldquo: '“', rdquo: '”', lsquo: '‘', rsquo: '’', laquo: '«', raquo: '»', lsaquo: '‹', rsaquo: '›',
  opencurlydoublequote: '“', closecurlydoublequote: '”', opencurlyquote: '‘', closecurlyquote: '’',
  lpar: '(', rpar: ')', lsqb: '[', rsqb: ']', lbrack: '[', rbrack: ']', lcub: '{', rcub: '}', lbrace: '{', rbrace: '}',
  nbsp: ' ', ensp: ' ', emsp: ' ', thinsp: ' ',
};
const decoded = (text: string): string => text.replace(/&(?:#[xX]([0-9a-fA-F]+)|#(\d+)|([a-zA-Z][a-zA-Z0-9]*));/g, (match, hex?: string, decimal?: string, name?: string) => {
  if (name !== undefined) return Object.hasOwn(NAMED, name.toLowerCase()) ? NAMED[name.toLowerCase()] : match;
  const point = hex !== undefined ? parseInt(hex, 16) : parseInt(decimal ?? '', 10);
  return point <= 0x10ffff ? String.fromCodePoint(point) : match;
});

/**
 * 題目第一格前面的字結尾是開頭的引號或括號嗎（§1 第 5 點最後一項）：引號跟著第一格，換一種排法就跟錯詞塊。看解開字元參照後看得到的字（L2 第二輪 F1、F3）：
 * - 開頭的括號、引號（`(`、`“`、`「`…）是；
 * - 雙直引號（半形、全形當同一種）照成對數：到這裡是單數個，最後一個就是開頭的（`—"`、`:"` 是，`"I'm tired," ` 不是）；
 * - 單直引號不數（L2 第三輪 F6）：前一個字是字母或數字的是所有格或結束的引號（`boys' `），不是；其他的看不出來，當成是；
 * - 最後是認不得的字元參照：看不出是不是引號，當成是（這一題只照題目那一行判）。
 */
function opensFirstBlock(head: string): boolean {
  const visible = decoded(visibleText(head)).replace(/\s+$/u, '');
  if (/&#?[a-zA-Z0-9]+;$/.test(visible)) return true;
  const chars = [...visible];
  const last = chars.at(-1) ?? '';
  if (/[\p{Ps}\p{Pi}]/u.test(last)) return true;
  const word = (char: string | undefined): boolean => char !== undefined && /[\p{L}\p{N}]/u.test(char);
  if (last === '"' || last === '＂') return chars.filter(char => char === '"' || char === '＂').length % 2 === 1;
  // 單引號也當撇號用（所有格 boys'、年代 '90s），數不準（L2 第三輪 F6）：前一個字是字母或數字的是所有格或結束的引號，其他的看不出來，算開頭。
  if (last === "'" || last === '＇') return !word(chars.at(-2));
  return false;
}

/** 一題底下的另一種排法（§1 第 1～7 點）：認得的照寫的順序放進 others；認不得的提示，照背面補充顯示（prompt.extras 不動）。 */
function readOthers(line: number, extras: readonly string[], cells: SentenceCells): { others: SentenceAlt[]; problems: KindProblem[] } {
  const others: SentenceAlt[] = [], problems: KindProblem[] = [];
  const opening = opensFirstBlock(cells.head);
  for (const source of extras) {
    if (!ALT_LIKE.test(source)) continue;
    const read = readOther(source, cells, others, opening);
    if (typeof read === 'string') problems.push({ line, level: 'hint', code: 'order-alt-invalid', message: `這一行另一種排法不認，照背面補充顯示：${read}` });
    else others.push(read);
  }
  if (others.length && arrangements(cells.words) - 1 - others.length < 2) {
    problems.push({ line, level: 'hint', code: 'order-alt-all-right', message: '詞塊的排法扣掉列出的對的順序，排錯的剩不到兩種，很容易猜對；換一句，或多挖一塊' });
  }
  return { others, problems };
}

/** 一行另一種排法：認得的回傳詞塊與格後面的字，認不得的回傳原因（給家長看的一句）。 */
function readOther(source: string, cells: SentenceCells, before: readonly SentenceAlt[], opening: boolean): SentenceAlt | string {
  if (source.includes('\n')) return '另一種排法寫在同一行，底下不放子項目、程式碼或其他內容';
  if (!source.startsWith(ALT_LABEL)) return '開頭寫成「另一種排法：」（全形冒號，前面不空格）';
  if (opening) return '題目第一格前面的字結尾是開頭的引號或括號，每一種排法都會在句首帶著它；這一題只照題目那一行判';
  const text = source.slice(ALT_LABEL.length);
  const { blanks } = questionSyntax(text);
  const blocks = readBlocks(text, blanks);
  if (!blocks) return '要和題目一樣是兩格以上的填空，每一格是純文字的詞塊（不放連結、程式碼、底線，不能只有標點）';
  const { words, tails } = blocks;
  if (words.length !== cells.words.length) return `詞塊有 ${String(words.length)} 塊，題目那一行是 ${String(cells.words.length)} 塊；每一種排法用同樣的詞塊，只換順序`;
  const extra = without(words, cells.words), missing = without(cells.words, words);
  if (extra.length) return `詞塊和題目那一行不一樣（這一行有「${extra.join('」「')}」，題目那一行是「${missing.join('」「')}」）；每一種排法用同樣的詞塊，只換順序，句首那塊也寫小寫`;
  const space = (part: string): string => part.replace(/\s+/g, ' ').trim();
  const head = space(text.slice(0, blanks[0].start));
  if (!space(cells.head).endsWith(head)) return `第一格前面的「${head}」不是題目第一格前面那段的結尾；可以不寫，要寫就照抄題目那段的結尾`;
  const at = tails.findIndex((tail, i) => tail !== cells.tails[i] && !(plainMarks(tail) && plainMarks(cells.tails[i])));
  if (at >= 0 && /[\p{L}\p{N}]/u.test(tails[at] + cells.tails[at])) return `第 ${String(at + 1)} 格後面的字和題目那一行不同（「${tails[at]}」對「${cells.tails[at]}」）；空格外面的字每一種排法都要一樣，只有標點可以不同，會移動的字挖成詞塊`;
  if (at >= 0) return `第 ${String(at + 1)} 格後面不一樣的地方只能是一般的標點與空白（「${tails[at]}」對「${cells.tails[at]}」）；* _ % # & [ ] \\ 和 :: 在 Obsidian 是格式記號，放在會移動的位置會讓空格跑掉`;
  const same = (other: readonly string[]): boolean => other.every((word, i) => word === words[i]);
  if (same(cells.words)) return '和題目那一行的順序相同';
  if (before.some(other => same(other.words))) return '和前面另一行的順序相同';
  return { words, tails, source };
}

/**
 * 格後面會因排法不同的字只能是一般的標點與空白（§1 第 4 點，L2 第一輪 R4）：Obsidian 的格式記號（`%%` 註解、`::` 問答、`*`、`_`、`#` 標籤、
 * `&` 字元參照、`[`、`]`、`\\`）和其他符號（`=`、`~`、`$`…）不算，拼在一起會吃掉空格的記號，畫面就把格子放到句尾。
 */
const plainMarks = (tail: string): boolean => /^[\s\p{P}]*$/u.test(tail) && !/[*_\\%#&[\]]|::/.test(tail);

/** a 有、b 沒有的詞塊（同一塊寫兩次算兩塊）。 */
function without(a: readonly string[], b: readonly string[]): string[] {
  const left = [...b];
  return a.filter(word => {
    const i = left.indexOf(word);
    if (i < 0) return true;
    left.splice(i, 1);
    return false;
  });
}

/** 詞塊有幾種不同的排法（相同文字的詞塊互換算同一種，§1 第 7 點）：n! 除以每一種重複次數的階乘，一塊一塊乘上去。 */
function arrangements(words: readonly string[]): number {
  const seen = new Map<string, number>();
  let total = 1;
  words.forEach((word, i) => {
    const count = (seen.get(word) ?? 0) + 1;
    seen.set(word, count);
    total = total * (i + 1) / count;
  });
  return total;
}
