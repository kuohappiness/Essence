import type { Choice, Couplet, PickGroup, PoemOrder, SentenceOrder, Single, Target, Typing } from '../../src/core/deck/index.ts';

// 題型模組 A1（tasks/question-type-modules.md §1-6、§1-7 第 1 類）：目標的六個卡型欄位併成 target.kind 之後，測試讀舊欄位的地方換成這幾個存取式，斷言的值不改。
// 全詩順序卡照舊是 PoemOrder 的五個欄位，不帶 kind.order.style。

export const kindGroup = (target: Target | undefined): PickGroup | undefined => target?.kind?.id === 'group' ? target.kind.group : undefined;
export const kindChoice = (target: Target | undefined): Choice | undefined => target?.kind?.id === 'polyphone' ? target.kind.polyphone : undefined;
export function kindPoem(target: Target | undefined): PoemOrder | undefined {
  if (target?.kind?.id !== 'order' || target.kind.order.style !== 'poem') return undefined;
  const { style: _, ...order } = target.kind.order;
  return order;
}
export function kindSentence(target: Target | undefined): SentenceOrder | undefined {
  if (target?.kind?.id !== 'order' || target.kind.order.style !== 'sentence') return undefined;
  const { style: _, ...order } = target.kind.order;
  return order;
}
export const kindTyping = (target: Target | undefined): Typing | undefined => target?.kind?.id === 'typing' ? target.kind.typing : undefined;
export const kindCouplet = (target: Target | undefined): Couplet | undefined => target?.kind?.id === 'couplet' ? target.kind.couplet : undefined;
export const kindSingle = (target: Target | undefined): Single | undefined => target?.kind?.id === 'single' ? target.kind.single : undefined;
