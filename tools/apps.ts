/**
 * 軟體代號對資料夾（D-218 第 4 點）：共用工具與它們的測試只從這裡取，不用代號組字串。路徑照 git 追蹤的寫法，大小寫要和
 * `git ls-files` 完全相同（Windows 不分、Linux 分：寫錯大小寫本機照樣能跑，推上去才壞）。
 * `.claude/hooks/cloud-setup.mjs` 不 import tools/，照抄有程式的那幾列，測試比對兩份相同。
 */
export const APPS_ROOT = 'plugins/';

export const FOLDERS = {
  cards: 'plugins/cards',
  capture: 'plugins/capture',
  mindboard: 'plugins/mindboard',
} as const;
