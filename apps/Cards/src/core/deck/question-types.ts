import { PICK_NEEDS } from '../version/index.ts';
import { readPick } from './kinds/group.ts';
import { readChoice } from './kinds/polyphone.ts';
import { readOrder, readSentence } from './kinds/order.ts';
import { readCouplet } from './kinds/couplet.ts';
import { optionsInvalid, readOptionLines, readSingle } from './kinds/single.ts';
import type { PickReading } from './kinds/group.ts';
import type { OptionLine } from './kinds/single.ts';
import type { Deck, Kind, KindId, Target } from './types.ts';

// 題型接點的第一個（D-181）：一種題型的名稱與題目怎麼認、哪些算寫錯。其他三個在 core/study/compose.ts、review/flow.ts、ui/screens.tsx。
// 認法照卡型拆在 kinds/，一種卡型一個檔（題型模組任務說明 §1-3）；這裡放認的先後與需要的版本，parse.ts 只經過 readKind 呼叫題目階段的認法。

export { typedAnswer } from './typed-answer.ts';
export { blanksIn, pickKey, unbold } from './kinds/shared.ts';
export { pickWord } from './kinds/group.ts';
export { choiceProblems, choiceStem } from './kinds/polyphone.ts';
export { mentions, pairWordOf, readTyping } from './kinds/typing.ts';
export { ALT_LIKE, altMentions, movingTails, otherSentences, shownTails } from './kinds/order.ts';
export { hasOptionSeparator } from './kinds/single.ts';
export type { OptionLine } from './kinds/single.ts';

/** 題目階段讀出的卡型與提示（比較卡、多音字的診斷；一個目標只有一種）。 */
interface KindReading { kind: Kind | null; problems: PickReading['problems'] }

/** 選項行遇到已經認成的卡型（§3〈先後〉）：照那一種出，提示選項行不算。 */
const KIND_LABEL: Record<Exclude<KindId, 'single'>, string> = { group: '比較卡', polyphone: '多音字', order: '排序', typing: '文法或變化', couplet: '接句' };
export const optionsTaken = (lines: readonly OptionLine[], kind: KindId | null): KindReading['problems'] =>
  lines.length ? [optionsInvalid(lines[0].line, kind && kind !== 'single' ? `這個目標已經是${KIND_LABEL[kind]}，不認選項行` : '這個目標的名稱照比較卡或多音字的寫法讀，不認選項行')] : [];

/**
 * 題目階段的認法（§1-3 第 2 點）：照 group → polyphone → order（全詩，英文的卡組再看句子排序）→ couplet → single，讀成卡型就停，有提示也停。
 * 文法與變化（typing）在名稱階段就認了，認成的目標不走這裡。notes 是目標底下的記憶錨點，promptNotes 是第一題底下的；
 * options 是目標底下的選項行（tasks/matching-single-choice.md §3），前面的讀成卡型或有提示時，有選項行就加一個 options-invalid。
 */
export function readKind(target: Target, notes: readonly string[], promptNotes: readonly string[], english: boolean, options: readonly OptionLine[] = [], stacked: ReadonlySet<number> = new Set()): KindReading {
  const read = readEarlier(target, notes, promptNotes, english);
  if (read.kind || read.problems.length) return { kind: read.kind, problems: [...read.problems, ...optionsTaken(options, read.kind?.id ?? null)] };
  const single = readSingle(target, options, stacked);
  return { kind: single.single ? { id: 'single', single: single.single } : null, problems: single.problems };
}

/**
 * 加進已有的框只補選項行、沒有題目的項目（題目在筆記裡，tasks/matching-single-choice.md §6，L2 第二輪 2、第三輪 4）：
 * 選項行本身讀不成的提示，和 readKind 認單選時同一套讀法。答案在不在選項裡，加入時核對。
 */
export function bareOptionProblems(options: readonly OptionLine[]): KindReading['problems'] {
  if (!options.length) return [];
  const read = readOptionLines(options);
  return 'reason' in read ? [optionsInvalid(read.line, read.reason)] : [];
}

/** 單選以前的四種，照原本的先後。 */
function readEarlier(target: Target, notes: readonly string[], promptNotes: readonly string[], english: boolean): KindReading {
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
 * 每一種卡型要哪一版才讀得懂（§1-5）：舊版會照翻面出、出錯的才要。比較卡是 PICK_NEEDS；多音字照 PR #53 不擋，舊版照翻面出；單選也不擋（tasks/matching-single-choice.md §2〈舊版〉）。
 */
const KIND_NEEDS: Record<KindId, string | null> = { group: PICK_NEEDS, polyphone: null, order: null, typing: null, couplet: null, single: null };

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
