import { mentions } from './question-types.ts';
import type { Target } from './types.ts';

/**
 * 中翻英目標的原形（D-121 的第 2 步提示）：名稱去掉最後的「 中翻英」，再去掉最後一組全形括號與它前後的空白
 * （一字多義的第二個意思，D-125：`light（輕的） 中翻英` → `light`）；名稱中間的全形括號不動。其他目標回傳 null。
 */
export function baseForm(target: Target): string | null {
  if (target.direction !== 'zh-en') return null;
  const name = target.name.replace(/ 中翻英$/, '');
  return name.replace(/\s*（[^（）]*）\s*$/, '').trim() || null;
}

/**
 * 打字卡第 2 步的提示（D-121、tasks/english-typed-order.md §2）：中翻英與變化是原形；文法是文法點，題目已經寫了同一個文法點就沒有。
 * 和答案一樣時跳過由複習端判斷（typed.ts）。
 */
export function typedHint(target: Target, question: string): string | null {
  const typing = target.typing;
  if (!typing) return baseForm(target);
  if (typing.kind === 'grammar' && typing.hint !== null && mentions(question, typing.hint)) return null;
  return typing.hint;
}
