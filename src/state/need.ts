import { hasOutside, markNeed, parseDeck } from '../core/deck/index.ts';
import { canRead, laterRelease, OUTSIDE_NEEDS, PICK_NEEDS } from '../core/version/index.ts';
import type { Prepared } from './ids.ts';

// 寫入端的 `需要版本`（syntax §0-1）：比較卡（tasks/question-type-seam.md §3、D-191）與出處的 `課外：`（D-209）。舊裝置讀到標記整篇擋住、提示更新。

/**
 * 這份文字寫入時要長什麼樣子：有比較卡或 pick-answer-invalid 的目標（後者舊版會當翻面卡出）要 PICK_NEEDS，正式目標的出處有 `課外：` 要
 * OUTSIDE_NEEDS，兩者都有取較新的。只算這台讀得懂的那幾種：版本不明、這台還讀不懂的建置不寫（不擋自己）。已有不低於要求的值不動，
 * 看不懂或比這台新的值走不到這裡（整篇本來就被擋）。加不上回 null。
 */
function marked(text: string, version: string | null): { text: string; need: string | null } | null {
  const pickOn = canRead(PICK_NEEDS, version), outsideOn = canRead(OUTSIDE_NEEDS, version);
  if (!pickOn && !outsideOn) return { text, need: null };
  const deck = parseDeck(text);
  const wants: string[] = [];
  if (pickOn && (deck.targets.some(target => target.group) || deck.problems.some(problem => problem.code === 'pick-answer-invalid'))) wants.push(PICK_NEEDS);
  if (outsideOn && deck.targets.some(target => hasOutside(target.fields.sources, deck.props))) wants.push(OUTSIDE_NEEDS);
  if (!wants.length) return { text, need: null };
  const need = wants.reduce(laterRelease);
  if (typeof deck.props.need === 'string' && canRead(need, deck.props.need)) return { text, need: deck.props.need };
  const next = markNeed(text, need);
  return next === null ? null : { text: next, need };
}

/**
 * 準備寫入的最後一步，對最終文字判斷（補 ID、當成新的、還原都經過）。加不上時這次整份不寫：ID、縮排、還原、當成新的都不動，否則新版
 * 自己補的 ID 會讓原本不出題的新目標，在舊版當翻面卡出（R4-1）。original 是這次的原文。
 */
export function withNeed(prepared: Prepared, original: string, version: string | null): Prepared {
  const result = marked(prepared.text, version);
  return result ? { ...prepared, ...result } : { text: original, expect: [], fresh: [], record: null, need: null };
}

/** 目前的文字缺標記（missing）或加不上（refused）；都不是回 null。 */
export function markOf(text: string | undefined, version: string | null): 'missing' | 'refused' | null {
  if (text === undefined) return null;
  const result = marked(text, version);
  return !result ? 'refused' : result.text !== text ? 'missing' : null;
}
