import { blanksIn } from '../core/deck/index.ts';
import type { Card } from '../core/study/index.ts';
import { questionOf } from './english.ts';
import { extraLabel } from './extras.ts';

// 單選與配對的一列（tasks/matching-single-choice.md §5〈畫面〉）：題目與對答案後接在底下的補充。畫面在 ui/PickCard.tsx。

/**
 * 這一列的題目：題幹有 `＿＿` 就填在那一格；沒有時在最後補一個，走有空格的同一條路（使用者 2026-11-28 選「接在題目後面」）：
 * 最後一行放得下就接在問號後面，放不下才自己換到下一行（rendered.ts 的 gluePunctuation 只黏前後的標點，不帶著前面的字）。
 */
export function singleQuestion(blank: Card['blanks'][number]): string {
  const text = questionOf(blank.prompt);
  return blanksIn(text) > 0 ? text : text + '＿＿';
}

/** 對答案後接在那一列底下的補充：這個目標的記憶錨點先，再來是這一題底下的補充（詳解），最後是目標的其他補充；選項行不再顯示。 */
export function singleExtras(blank: Card['blanks'][number]): string[] {
  const single = blank.target.kind?.id === 'single' ? blank.target.kind.single : undefined;
  const shared = blank.target.shared.filter((_, i) => i !== single?.at);
  const anchor = (text: string): boolean => extraLabel(text).label === '記憶錨點';
  return [...shared.filter(anchor), ...blank.prompt.extras, ...shared.filter(text => !anchor(text))];
}
