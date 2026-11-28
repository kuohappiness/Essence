import type { Card } from '../core/study/index.ts';

// 預覽的單張卡回饋（D-246、tasks/card-feedback.md §3）：這一輪每張卡留的評等、標籤與一句話。純程式，畫面只畫出來。
// 只在預覽、設定頁打開時有；紀錄怎麼寫交給呼叫的一方（FeedbackSink），這裡只管狀態與什麼時候存。

/** 評等（§3-2）：可以用、要改、不要這張。 */
export type FeedbackRate = 'ok' | 'fix' | 'drop';
/** 標籤（使用者 2026-11-28 選加四個）：詳解、考點、版面、不值得考。只在要改、不要這張時有。 */
export type FeedbackTag = 'explain' | 'point' | 'layout' | 'worth';
/** 畫面的順序。 */
export const FEEDBACK_RATES: readonly FeedbackRate[] = ['ok', 'fix', 'drop'];
export const FEEDBACK_TAGS: readonly FeedbackTag[] = ['explain', 'point', 'layout', 'worth'];
/** 一句話最多幾個字（照字算，表情符號算一個字，syntax.md §11）。 */
export const NOTE_LIMIT = 500;

/** 一張卡那一刻的完整回饋：每次存都是整份，不是差異（§2-1）。 */
export interface Feedback {
  rate: FeedbackRate | null;
  tags: readonly FeedbackTag[];
  note: string;
}
/** 存的結果：寫好了、寫不進去、這次預覽寫滿了（§2-3）。 */
export type SaveResult = 'saved' | 'failed' | 'full';
export interface FeedbackView extends Feedback {
  /** 最近一次存的結果；還沒存過是 null，存的途中是 saving。 */
  status: SaveResult | 'saving' | null;
}
export type FeedbackChange =
  | { kind: 'rate'; rate: FeedbackRate }
  | { kind: 'tag'; tag: FeedbackTag }
  | { kind: 'note'; note: string }
  /** 沒存到之後點「再存」：把這張卡現在的整份再寫一次（格式查核 F2：評等與標籤的點法不因為沒存到而改變）。 */
  | { kind: 'retry' };

/** 寫紀錄的一方：卡是畫面上那一張，feedback 是改完的整份。丟錯算寫不進去。 */
export interface FeedbackSink {
  save(card: Card, feedback: Feedback): Promise<SaveResult>;
}

export const EMPTY: Feedback = { rate: null, tags: [], note: '' };

/** 有留東西：評等、標籤或一句話（完成畫面數「留了 M 張」，§3-5）。 */
export const left = (feedback: Feedback): boolean => feedback.rate !== null || feedback.tags.length > 0 || feedback.note !== '';

/** 這張卡能不能留回饋：每一格都有學習目標 ID（§3-1；預覽讀的是編輯器的文字，還沒補 ID 的是空字串）。 */
export const canLeave = (card: Card): boolean => card.blanks.every(blank => blank.lt !== '');

/**
 * 這張卡的回饋算哪一份：每一格的學習目標 ID 與題目指紋，去掉重複、照字串排序（和讀紀錄的一方認同一張卡的方法相同，syntax.md §11）。
 * 同一個目標裡同一題寫了兩次的兩張卡是同一份（格式查核 F7）：畫面和讀的一方一致。
 */
export const feedbackKey = (card: Card): string =>
  JSON.stringify([...new Set(card.blanks.map(blank => JSON.stringify([blank.lt, blank.prompt.fingerprint])))].sort());

/** 整理一句話（§2-2）：換行換成一個空白、去掉頭尾空白、最多 NOTE_LIMIT 個字（照字算，不切在半個表情符號上）。 */
function cleanNote(text: string): string {
  const flat = text.replace(/\r\n|[\r\n\u2028\u2029]/g, ' ').trim();
  const chars = Array.from(flat);
  return chars.length <= NOTE_LIMIT ? flat : chars.slice(0, NOTE_LIMIT).join('').trimEnd();
}

/**
 * 套用一個動作，回傳改完的整份；什麼都沒變是 null（不寫）。
 * - 評等：點已經選的那一個是取消（連標籤一起清掉）；改成可以用也清掉標籤。
 * - 標籤：只在要改、不要這張時能點，點一次加、再點一次拿掉，照畫面的順序排。
 * - 一句話：整理過後和現在一樣就不算。
 */
export function applyChange(old: Feedback, change: FeedbackChange): Feedback | null {
  switch (change.kind) {
    case 'rate': {
      if (old.rate === change.rate) return { ...old, rate: null, tags: [] };
      return { ...old, rate: change.rate, tags: change.rate === 'ok' ? [] : old.tags };
    }
    case 'tag': {
      if (old.rate !== 'fix' && old.rate !== 'drop') return null;
      const on = old.tags.includes(change.tag);
      return { ...old, tags: FEEDBACK_TAGS.filter(tag => tag === change.tag ? !on : old.tags.includes(tag)) };
    }
    case 'note': {
      const note = cleanNote(change.note);
      return note === old.note ? null : { ...old, note };
    }
    case 'retry': return null;
    default: { const never: never = change; return never; }
  }
}
