// 比較測試工具：錯誤的種類與分級（任務說明 tasks/rule-test-d236.md §3，D-236 第 1 點）。卡組、地圖、加深的計數、裁定的「改記」、
// 報告與〈評估規格〉都用這一份 levelOf，不另寫一份清單。

/** 評估版本（rule-test-d236.md §2）：凍結時寫進鎖，之後每一步核對；評法改了就加一。 */
export const EVALUATION = 'D-236 v1';
/** 評分表與評分說明對到的製卡檢查表版本（rule-test-d236.md §16）：寫進〈評估規格〉，和評估版本一起凍結。 */
export const CHECKLIST = '第二版（2026-11-26 使用者同意，定稿前；已對到 課1～3、門1～5、1a、1b、2a 與 2c 的理由（沒講為什麼），其餘等定稿）';

/** 評審交的問題種類（評分說明的〈每份的問題〉）。 */
export const ISSUE_KINDS = ['重大錯誤', '判錯', '洩漏', '其他傷到學習', '一題多事', '池裡判準不同', '小問題', '近義重複', '跨單元去向', '沒講為什麼', '值得學'] as const;
export type IssueKind = (typeof ISSUE_KINDS)[number];

/** 題目品質：照題去重的錯（同一份、同一題、同一種算一筆），也是裁定「不成立」時可以改記的種類。 */
export const QUALITY_KINDS = ['判錯', '洩漏', '其他傷到學習', '一題多事', '池裡判準不同', '小問題'] as const;
export type QualityKind = (typeof QUALITY_KINDS)[number];

export type Level = '重大' | '傷到學習' | '小問題';

/** 設定可以調的種類：D-236 沒有點名的這幾種（判錯、洩漏是它點名的傷到學習，重大錯誤照 D-234）。 */
export const ADJUSTABLE = ['一題多事', '池裡判準不同', '跨單元去向'] as const;
type AdjustableKind = (typeof ADJUSTABLE)[number];
export type Levels = Record<AdjustableKind, '傷到學習' | '小問題'>;

/** 預設（rule-test-d236.md §3-1）：一題多事、池裡判準不同碰到「一格只對一個目標」，算傷到學習（使用者 2026-11-27 定，§12 第 1 題）；跨單元去向是小問題。 */
export const DEFAULT_LEVELS: Levels = { 一題多事: '傷到學習', 池裡判準不同: '傷到學習', 跨單元去向: '小問題' };

const FIXED: Partial<Record<IssueKind, Level>> = { 重大錯誤: '重大', 判錯: '傷到學習', 洩漏: '傷到學習', 其他傷到學習: '傷到學習', 小問題: '小問題' };

/** 一種錯算哪一級；近義重複（算孩子的時間）、沒講為什麼（自己的學習面指標，rule-test-d236.md §17）與值得學不進三級，回 null。 */
export function levelOf(kind: IssueKind, levels: Levels): Level | null {
  if ((ADJUSTABLE as readonly string[]).includes(kind)) return levels[kind as AdjustableKind];
  return FIXED[kind] ?? null;
}
