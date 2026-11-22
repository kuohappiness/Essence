import { Platform, type App } from 'obsidian';

// 只存在這台裝置的選擇（saveLocalStorage，同 D-116，不隨 vault 同步）：全部卡的提醒（D-146）、預覽的兩個開關（D-163 第 6 點；按鈕的預設見 D-220）、
// 目錄的學期收合（D-097）、目錄的小考按鈕（tasks/quiz-mark.md §2，入口那一列不看它）。

const flag = (key: string) => ({
  get: (app: App): boolean => app.loadLocalStorage(key) === true,
  set: (app: App, on: boolean): void => { app.saveLocalStorage(key, on); },
});
export const noRemind = flag('essence-cards-full-deck-no-remind');
const PREVIEW_BUTTON = 'essence-cards-preview-button';
/** 預覽按鈕（D-220）：存了 true／false 照存的；沒動過或壞值時電腦開、手機關。 */
export const previewButton = {
  get(app: App): boolean {
    const value: unknown = app.loadLocalStorage(PREVIEW_BUTTON);
    return typeof value === 'boolean' ? value : Platform.isDesktopApp;
  },
  set: (app: App, on: boolean): void => { app.saveLocalStorage(PREVIEW_BUTTON, on); },
};
export const previewReveal = flag('essence-cards-preview-reveal');
export const quizMark = flag('essence-cards-quiz-mark');
/** 這台電腦的加深提醒（tasks/ai-cards-deepen.md §5-2）：存的是 true 才算關，缺值或壞值是開。 */
export const deepenRemindOff = flag('essence-cards-deepen-remind-off');

const TERMS = 'essence-cards-catalog-terms';
/** 學期收合：只記使用者動過的；沒有記的照預設（最新的學期展開）。 */
export type TermOpen = Record<string, boolean>;
export function loadTerms(app: App): TermOpen {
  const value: unknown = app.loadLocalStorage(TERMS);
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as TermOpen : {};
}
export function saveTerms(app: App, terms: TermOpen): void { app.saveLocalStorage(TERMS, terms); }

// AI 製卡（tasks/ai-cards-mvp.md §3、§5）：待貼回的工作與存草稿的恢復資料、不再配出的 ID、上一次選的科目與年級學期。只存在這台電腦，不寫進 vault。
const AI_JOBS = 'essence-cards-ai-jobs';
const AI_RETIRED = 'essence-cards-ai-retired';
const AI_LAST = 'essence-cards-ai-last';
const AI_PICK = 'essence-cards-ai-pick';
const AI_DEEPEN = 'essence-cards-deepen-jobs';
const DEEPEN_SKIPS = 'essence-cards-deepen-skips';
export const aiPrefs = {
  /** 原樣讀出來，由 core/ai 的 readJobs 判斷讀不讀得懂。 */
  jobs: (app: App): unknown => app.loadLocalStorage(AI_JOBS),
  /** 存不進去時 Obsidian 丟錯，交給呼叫的一方（存草稿就停下）。 */
  saveJobs: (app: App, jobs: unknown[]): void => { app.saveLocalStorage(AI_JOBS, jobs); },
  retired(app: App): string[] {
    const value: unknown = app.loadLocalStorage(AI_RETIRED);
    return Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : [];
  },
  /** 不再配出的清單只增不減（§5〈ID 的預留〉）。 */
  retire(app: App, ids: readonly string[]): void {
    if (!ids.length) return;
    app.saveLocalStorage(AI_RETIRED, [...new Set([...aiPrefs.retired(app), ...ids])]);
  },
  last(app: App): { subject?: string; term?: string } {
    const value: unknown = app.loadLocalStorage(AI_LAST);
    if (value === null || typeof value !== 'object') return {};
    const { subject, term } = value as Record<string, unknown>;
    return { ...typeof subject === 'string' ? { subject } : {}, ...typeof term === 'string' ? { term } : {} };
  },
  saveLast: (app: App, last: { subject: string; term: string }): void => { app.saveLocalStorage(AI_LAST, last); },
  /** 點選填空每一科上次的選擇（D-210 第 2 點）：`{ 科目的 key: true/false }`；讀不懂的那一科當成沒記過。 */
  picks(app: App): Record<string, boolean> {
    const value: unknown = app.loadLocalStorage(AI_PICK);
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return {};
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).filter((entry): entry is [string, boolean] => typeof entry[1] === 'boolean'));
  },
  savePick: (app: App, key: string, pick: boolean): void => { app.saveLocalStorage(AI_PICK, { ...aiPrefs.picks(app), [key]: pick }); },
  /** 加深的工作（tasks/ai-cards-deepen.md §3-2）：和製卡的工作分開存，原樣讀出來，由 core/ai 的 readDeepenJobs 判斷。 */
  deepenJobs: (app: App): unknown => app.loadLocalStorage(AI_DEEPEN),
  saveDeepenJobs: (app: App, jobs: unknown[]): void => { app.saveLocalStorage(AI_DEEPEN, jobs); },
  /** 「這次不用」（§5-1）：原樣讀出來，由 core/ai 的 readSkips 判斷。 */
  deepenSkips: (app: App): unknown => app.loadLocalStorage(DEEPEN_SKIPS),
  saveDeepenSkips: (app: App, value: Record<string, unknown>): void => { app.saveLocalStorage(DEEPEN_SKIPS, value); },
  /** 卡組改名、搬移：鍵換成新路徑（目的地已經有舊值時蓋掉）；刪除：拿掉那一鍵（to 是 null）。 */
  moveDeepenSkip(app: App, from: string, to: string | null): void {
    const value: unknown = app.loadLocalStorage(DEEPEN_SKIPS);
    if (typeof value !== 'object' || value === null || Array.isArray(value) || !(from in value)) return;
    const next = { ...value as Record<string, unknown> };
    if (to !== null) next[to] = next[from];
    delete next[from];
    app.saveLocalStorage(DEEPEN_SKIPS, next);
  },
};
