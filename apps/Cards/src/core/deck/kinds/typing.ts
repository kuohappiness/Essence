import type { Target, Typing } from '../types.ts';
import { readGroup } from './group.ts';
import { endingOf, pickKey, unbold } from './shared.ts';

// ── 英文的文法與變化（D-193 第 5、6 點、tasks/english-typed-order.md §1）：只在英文的卡組，從名稱的結尾認，問答題打字。 ──

const INFLECTIONS: ReadonlySet<string> = new Set(['過去式', '過去分詞', '複數', '比較級', '最高級']);

/** 最後一組成對的括號（全半形都算，左右可以不同）與它前面的字；沒有是 null。 */
function lastBracket(text: string): { before: string; inner: string } | null {
  const match = /^(.*?)\s*[（(]([^（）()]*)[）)]\s*$/.exec(text);
  return match ? { before: match[1].trim(), inner: match[2].trim() } : null;
}
const BRACKETS = /[（）()]/;

/** 配對用的鍵（§1-5）：字和意思各自照 pickKey 正規化，再接成 `字(意思)`；括號前的空白不算。 */
const wordKey = (word: string, meaning: string | null): string => pickKey(word) + (meaning === null ? '' : '(' + pickKey(meaning) + ')');

/** 拆成字與最後一組括號的意思（§1-4、§1-5）；前面還有括號、括號不成對時是 null。 */
function splitMeaning(text: string): { word: string; meaning: string | null } | null {
  const bracket = lastBracket(text);
  const word = bracket ? bracket.before : text.trim();
  if (!word || BRACKETS.test(word)) return null;
  return { word, meaning: bracket ? bracket.inner : null };
}

/**
 * 名稱結尾是「文法」或變化種類的目標（§1-1）：只在英文的卡組；最上層直接寫題目、有方向、名稱讀得出點選填空的組都不是。
 * 變化的字（去掉意思的括號）不能有中文：`能說出 go 的 過去式` 照原題型。文法點是名稱去掉結尾與最後一組括號（用法）。
 */
export function readTyping(target: Pick<Target, 'name' | 'implicit' | 'direction'>): Typing | null {
  if (target.implicit || target.direction !== null || target.name.includes('==') || readGroup(target.name)) return null;
  const name = unbold(target.name).trim();
  const ending = endingOf(name);
  if (ending === null || (ending !== '文法' && !INFLECTIONS.has(ending))) return null;
  const rest = name.slice(0, name.length - ending.length).trim();
  if (!rest) return null;
  if (ending === '文法') {
    const bracket = lastBracket(rest);
    const point = bracket ? bracket.before : rest;
    return { kind: 'grammar', hint: point && !BRACKETS.test(point) ? point : null, pair: null };
  }
  const split = splitMeaning(rest);
  if (!split || /\p{Script=Han}/u.test(split.word)) return null;
  return { kind: 'inflection', hint: split.word, pair: { key: wordKey(split.word, split.meaning), exact: split.meaning !== null } };
}

/** 英翻中的 pairKey 配對用的寫法（§3-1）：exact 含意思，base 只有字；拆不開時兩個都是整段。 */
export function pairWordOf(pairKey: string): { exact: string; base: string } {
  const split = splitMeaning(unbold(pairKey));
  if (!split) return { exact: pickKey(pairKey), base: pickKey(pairKey) };
  return { exact: wordKey(split.word, split.meaning), base: wordKey(split.word, null) };
}

/**
 * 題目一開頭就寫了這個文法點（§2-2）：去掉 `**`、`==` 與開頭的空白後，第一段是括號包住的文法點（全半形、大小寫不分）。
 * 題目其他地方出現同樣的字不算（「不要用比較級」）。
 */
export function mentions(question: string, point: string): boolean {
  const label = /^\s*[（(]([^（）()]*)[）)]/.exec(question.replace(/\*\*|==/g, ''));
  return label !== null && pickKey(label[1]) === pickKey(point);
}
