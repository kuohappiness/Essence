import { mentions, unbold } from './question-types.ts';
import type { Target } from './types.ts';

/**
 * 中翻英目標的原形（D-121 的第 2 步提示）：名稱去掉最後的「 中翻英」（前面的空白半形全形都算，用 pairKey），再去掉最後一組全形括號與它前後的空白
 * （一字多義的第二個意思，D-125：`light（輕的） 中翻英` → `light`）；名稱中間的全形括號不動。其他目標回傳 null。
 */
export function baseForm(target: Target): string | null {
  if (target.direction !== 'zh-en' || target.pairKey === null) return null;
  return withoutMeaning(target.pairKey);
}

/** 去掉最後一組全形括號與它前後的空白（D-125 的第二個意思）；名稱中間的全形括號不動。剩下空的是 null。 */
const withoutMeaning = (name: string): string | null => name.replace(/\s*（[^（）]*）\s*$/, '').trim() || null;

/**
 * 已學過的字（D-125、D-210 第 4 點、tasks/ai-cards-materials.md §1-1）：英翻中、中翻英是名稱去掉方向、再去掉最後一組全形括號（同 baseForm）；
 * 不規則變化是變化的字（`lie（躺） 過去式` → lie）。文法、排序、比較與其他目標是 null。
 * 先去掉成對的粗體與螢光筆再去義項（L2 第一輪 R3：`**light（輕的）** 英翻中` → light，只剩義項的是 null）；baseForm 不動。
 */
export function learnedWord(target: Target): string | null {
  if (target.direction !== null && target.pairKey !== null) return withoutMeaning(unbold(target.pairKey));
  return target.kind?.id === 'typing' && target.kind.typing.style === 'inflection' ? target.kind.typing.hint : null;
}

/**
 * 打字卡第 2 步的提示（D-121、tasks/english-typed-order.md §2）：中翻英與變化是原形；文法是文法點，題目已經寫了同一個文法點就沒有。
 * 和答案一樣時跳過由複習端判斷（typed.ts）。
 */
export function typedHint(target: Target, question: string): string | null {
  const typing = target.kind?.id === 'typing' ? target.kind.typing : undefined;
  if (!typing) return baseForm(target);
  if (typing.style === 'grammar' && typing.hint !== null && mentions(question, typing.hint)) return null;
  return typing.hint;
}
