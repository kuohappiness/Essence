/**
 * 軟體代號對資料夾（D-218 第 4 點）：共用工具與它們的測試只從這裡取，不用代號組字串。路徑照 git 追蹤的寫法，大小寫要和
 * `git ls-files` 完全相同（Windows 不分、Linux 分：寫錯大小寫本機照樣能跑，推上去才壞）。
 * `.claude/hooks/cloud-setup.mjs` 不 import tools/，照抄有程式的那幾列，測試比對兩份相同。
 */
export const APPS_ROOT = 'apps/';

/** 有程式的軟體：檢查分派、pre-commit、CI 都照這張表。 */
export const FOLDERS = {
  cards: 'apps/Cards',
  capture: 'apps/Capture',
  mindboard: 'apps/Mindboard',
} as const;

/** 只有文件、還沒有程式的軟體（D-218 第 1 點）：資料夾建好前不出現在 FOLDERS，檢查不為它開一格。 */
export const DOCS_ONLY = {
  portal: 'apps/Portal',
} as const;
