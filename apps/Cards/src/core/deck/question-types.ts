import { PICK_NEEDS } from '../version/index.ts';
import { readPick } from './kinds/group.ts';
import { readChoice } from './kinds/polyphone.ts';
import { readOrder, readSentence } from './kinds/order.ts';
import { readCouplet } from './kinds/couplet.ts';
import type { PickReading } from './kinds/group.ts';
import type { Deck, Kind, KindId, Target } from './types.ts';

// 題型接點的第一個（D-181）：一種題型的名稱與題目怎麼認、哪些算寫錯。其他三個在 core/study/compose.ts、review/flow.ts、ui/screens.tsx。
// 認法照卡型拆在 kinds/，一種卡型一個檔（題型模組任務說明 §1-3）；這裡放認的先後與需要的版本，parse.ts 只經過 readKind 呼叫題目階段的認法。

export { typedAnswer } from './typed-answer.ts';
export { blanksIn, pickKey, unbold } from './kinds/shared.ts';
export { pickWord } from './kinds/group.ts';
export { choiceProblems, choiceStem } from './kinds/polyphone.ts';
export { mentions, pairWordOf, readTyping } from './kinds/typing.ts';
export { ALT_LIKE, altMentions, movingTails, otherSentences, shownTails } from './kinds/order.ts';

/** 題目階段讀出的卡型與提示（比較卡、多音字的診斷；一個目標只有一種）。 */
interface KindReading { kind: Kind | null; problems: PickReading['problems'] }

/**
 * 題目階段的認法（§1-3 第 2 點）：照 group → polyphone → order（全詩，英文的卡組再看句子排序）→ couplet，讀成卡型就停，有提示也停。
 * 文法與變化（typing）在名稱階段就認了，認成的目標不走這裡。notes 是目標底下的記憶錨點，promptNotes 是第一題底下的。
 */
export function readKind(target: Target, notes: readonly string[], promptNotes: readonly string[], english: boolean): KindReading {
  const pick = readPick(target);
  if (pick.group) return { kind: { id: 'group', group: pick.group }, problems: [] };
  if (pick.problems.length) return { kind: null, problems: pick.problems };
  const choice = readChoice(target, notes);
  if (choice.choice) return { kind: { id: 'polyphone', polyphone: choice.choice }, problems: [] };
  if (choice.problems.length) return { kind: null, problems: choice.problems };
  const poem = readOrder(target, notes, english);
  if (poem) return { kind: { id: 'order', order: { style: 'poem', ...poem } }, problems: [] };
  // 句子排序的提示是另一種排法的（tasks/sentence-order-alternatives.md §1 第 5、7 點），都是 hint，照樣認成句子排序。
  const sentence = english ? readSentence(target) : null;
  if (sentence?.sentence) return { kind: { id: 'order', order: { style: 'sentence', ...sentence.sentence } }, problems: sentence.problems };
  const couplet = readCouplet(target, notes, promptNotes);
  return { kind: couplet ? { id: 'couplet', couplet } : null, problems: [] };
}

/**
 * 每一種卡型要哪一版才讀得懂（§1-5）：舊版會照翻面出、出錯的才要。比較卡是 PICK_NEEDS；多音字照 PR #53 不擋，舊版照翻面出。
 */
const KIND_NEEDS: Record<KindId, string | null> = { group: PICK_NEEDS, polyphone: null, order: null, typing: null, couplet: null };

/** 這份卡組要的版本（不重複，照卡組裡第一次出現的順序）：照每個目標的卡型查 KIND_NEEDS；答案是組裡別的字（pick-answer-invalid）的目標舊版會當翻面卡出，照舊要 PICK_NEEDS。 */
export function needsOf(deck: Pick<Deck, 'targets' | 'problems'>): string[] {
  const needs = new Set<string>();
  for (const target of deck.targets) {
    const need = target.kind ? KIND_NEEDS[target.kind.id] : null;
    if (need !== null) needs.add(need);
  }
  if (deck.problems.some(problem => problem.code === 'pick-answer-invalid')) needs.add(PICK_NEEDS);
  return [...needs];
}
