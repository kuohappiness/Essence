import type { PoemOrder, Prompt, SentenceCells, SentenceOrder, Target } from '../types.ts';
import { readGroup } from './group.ts';
import { endingOf } from './shared.ts';

// ── 全詩順序卡（D-187 第 3、10 點、D-204）：點選填空的一種，用填空寫，從名稱最後的「排序」認；和比較卡不互搶（比較卡的題目都是問答）。 ──

/**
 * 這個目標是不是全詩順序卡：名稱最後一段是「排序」（前面要有空白或右括號），只有一題，是兩格以上的填空。
 * 不是時照原題型（填空翻面），不另外提示。英文卡組裡沒寫「全詩」的是句子排序（readSentence），不在這裡認。
 */
export function readOrder(target: Target, notes: readonly string[], english = false): PoemOrder | null {
  const { name, prompts } = target;
  if (english && !/(^|\s)全詩\s*排序$/.test(name)) return null;
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

// ── 英文的句子排序（D-193 第 8 點、§4）：英文卡組裡結尾是「排序」、沒寫「全詩」的。 ──

/** 句末的標點（§4-5）：只拿掉最後一格的，而且後面只剩空白與結束的引號。 */
const FINAL = /[.?!]+$/;
/** 英文句子的開頭（§4-6）：前面沒有字，或最後一個字是中文、全形標點。 */
const OPENS = /(?:^|[\p{Script=Han}\u3000-\u303f\uff00-\uffef])$/u;

/** 一題的格（§4-5、§4-6）；不到兩格、有一格沒有字（空的或只有標點）時是 null。 */
function sentenceCells(prompt: Prompt): SentenceCells | null {
  if (prompt.kind !== 'cloze' || prompt.blanks.length < 2) return null;
  const { text, blanks } = prompt;
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
  const head = visibleText(text.slice(0, blanks[0].start)).replace(/[\s\p{Ps}\p{Pi}"'*_]+$/u, '');
  const starts = words.map((_, i) => i === 0 && OPENS.test(head));
  return { head: text.slice(0, blanks[0].start), words, tails, starts };
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

/** 題目文字看得到的樣子（判斷句首用，L2 第二輪）：連結換成顯示的字，格式記號拿掉。 */
function visibleText(text: string): string {
  return text
    .replace(/!?\[\[([^\]|]*)(?:\|([^\]]*))?\]\]/g, (_m, target: string, alias?: string) => alias ?? target)
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\*\*|==|__|`/g, '');
}

/**
 * 英文的句子排序卡（§4-1）：英文卡組裡名稱最後一段是「排序」、沒有「全詩」、沒有方向，名稱也讀不出點選填空的組；每一題都是兩格以上的填空。
 * 不是時照原題型（填空翻面），不提示；AI 的草稿另外擋（§5）。
 */
export function readSentence(target: Target): SentenceOrder | null {
  const { name, prompts } = target;
  if (target.implicit || target.direction !== null || target.group || readGroup(name) || endingOf(name) !== '排序' || /(^|\s)全詩\s*排序$/.test(name) || !prompts.length) return null;
  const cells = prompts.map(sentenceCells);
  if (cells.some(each => each === null)) return null;
  return { title: name.replace(/\s*排序$/, '').trim(), prompts: cells as SentenceCells[] };
}
