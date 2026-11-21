# `plugins/` 改名 `apps/`：合併前 L2（給 Fable 5.2 high）

狀態：待審｜下一步：Fable 5.2 high 子代理審 `555f814`，Claude 核對後修正｜等誰：Claude

遵守 repo 根目錄的 `AGENTS.md`。Codex 額度用完（約 2026-11-23 重置），使用者 2026-11-21 指定這件的審查由 **Fable 5.2 high** 做（[D-218](../decisions.md#d-218-plugins-改名-apps每個軟體的資料夾首字大寫) 第 5 點）：本機 session 每一輪開一個沒參與實作的新子代理，報告原文附在這份檔案的那一輪底下。審查照 code-quality 的 `review.md`〈L2〉與〈兩軸〉〈回報格式〉。

## 審查對象

- worktree：`D:\程式開發\Essence-apps`，分支 `claude/project-thread-sdo9aa`（PR #29），沒有未提交的修改（`apps/Cards/docs/syntax.md` 只有工作樹的換行差異，`git diff` 是空的）。
- 規格基準與共同祖先：`main` 的 `252d85deb61293a8ea209029ce33a95f03c711df`。
- 待審：`555f814e7458e13b04d2c1e7181b96ae83659489`。這次要看的 commit：
  - `e565135`：開工前的準備（跨版本認得 `apps/Cards`、`realpathSync.native`、`tools/apps.ts`、`check-plugin-imports` 改名 `check-app-imports`）；
  - `bc0e51d`：合併 `main`（PR #30 的工作流程）；
  - `9b7486b`：搬家（`git mv` 三個資料夾、改連結的腳本、路徑常數）；
  - `c704d40`：§3 的防線；
  - `555f814`：§4 的現行文件。
  - `80499d0` 之前只改任務說明與開工前查核，不必審。

## 規格與優先順序

- [任務說明](rename-plugins-to-apps.md) 全部，特別是 §2（程式要改的）、§3（大小寫的防線）、§4、〈驗收〉；
- [D-218](../decisions.md#d-218-plugins-改名-apps每個軟體的資料夾首字大寫)、[D-208](../decisions.md#d-208-三個外掛在同一個-repo-開發每個外掛有自己的資料夾) 第 5、10 點；
- 開工前查核的兩輪（[rename-plugins-to-apps-plan-review.md](rename-plugins-to-apps-plan-review.md)）已經改進任務說明；規格之間衝突時列成問題，不挑容易通過的那份。

## 行為與風險

- 不可破壞：產品程式（`apps/Cards/src/`）只有 `rules.ts` 的 5 個規則檔路徑字串改了；建置產物、送給 AI 的規則內容、外掛 ID 與版號不變；讀 `v0.2.0`～`v0.6.0` 與第二步 `plugins/cards` 的跨版本工具照常。
- 共用檢查（`tools/check-app-imports.ts`）每次 commit 與 CI 都跑：擋 `plugins/`、大小寫不符的 `apps/` 與資料夾、只有文件的 Portal 出現程式、寫死的路徑大小寫不符、組字串。誤報會讓每次 commit 停下，漏報會讓 Windows 上寫錯的大小寫推到 Linux 才壞。
- 分派表（`tools/dispatch.ts`）第 4 條：Portal 只跑共用檢查；第 5 條：`apps/` 底下不認得的路徑跑全部。
- 明確延後：Portal 的文件（合併後由別的討論串寫）；驗收第 10 項的雲端 session、第 11 項的探針 PR 與 Pages（要使用者開）。

## 驗證方式

- 指令：`tools/` 的 `npm run check`、`npm run self-check`；`apps/Cards/` 的 `npm run check`、`npm run build`。Windows 11、Node 24.13、Git 2.52；這個 worktree 已經 `npm ci`。
- 實作者跑過的（結果見[任務說明〈結果〉](rename-plugins-to-apps.md#結果)）：上面四個檢查（Windows）；Linux CI 在 `9b7486b` 七個 job 全過；§5 三項（建置比對、測試 vault、跨版本）；驗收第 1、2、4、5、8、9、12、16、17、18 項。
- 沒跑的：驗收第 10 項（雲端 session）、第 11 項（探針 draft PR、合併後的 Pages）。

## 實作者自己選的做法（請先看）

1. **防線都放在 `check-app-imports.ts`**，新函式 `checkLayout`（路徑）、`checkText`（一個檔的內容）、`checkPaths`（全部文字檔＋紀錄＋例外表）；掃的是全部追蹤的文字檔（含 NUL 的當二進位跳過），工作樹或 `--staged` 的暫存區。
2. **正規化**：`\.` → `.`，再 `\\`、`\/` → `/`，剩下的 `\` → `/`。`apps/<名稱>` 前後用 `(?<![\w-])`、`(?![\w-])` 界定，只認表上的名稱（不分大小寫比，寫法要恰好相同）。
3. **`plugins\/` 這條在原文上找**（正規化後分不出跳脫），排除 `obsidian\/` 前綴與 `essence-` 後綴；`plugins/<軟體>` 在正規化後找。
4. **組字串**：`` `apps/${ ``、`'apps'`、`"apps"`、`'apps/'`、`"apps/"`，表所在的 `tools/apps.ts` 除外。
5. **例外表**：每列一個檔與類別；例外檔照樣跑 `checkText`，**沒有任何問題**才報「已經沒有被允許的寫法」（不是逐一比對被允許的那一種寫法）；「檔不在了」只在 repo 有 `tools/apps.ts` 時查（測試的暫存 repo 沒有那些檔）。
6. **同一個資料夾的路徑問題只報第一個檔**（`plugins/cards/` 底下 600 個檔不會印 600 行）。
7. **Portal 放在另一張表 `DOCS_ONLY`**，不在 `FOLDERS`；分派表第 4 條加上它、效果是空的（只跑共用檢查），沒有新增條目以免條號全部位移。
8. **`ci-gate.test.ts` 從例外表拿掉**：規格把它列為歷史路徑，但它的情境（搬家前開的分支合併到搬家後）要照現在的分派表才成立，`plugins/cards/…` 在新的分派表落第 10 條（全部），測試的意思會變；所以整份換成 `apps/`。
9. **hook 的乾淨 clone 測試**（`tools/tests/hooks.test.ts`）改成從工作樹複製**每一個**追蹤的檔（原本只複製 `.md` 與 clone 缺的檔）：共用檢查現在掃全部文字檔，HEAD 的舊內容會被擋；替身測試檔照本 repo 的清單找，例外表上的替身留下被允許的寫法（註解）。
10. **探針分支**：§1 第 2 點要的「搬家的 commit 單獨推一個探針分支」改成直接推到 PR 分支（同樣跑 push 的 CI，七個 job 都看到），沒有另開分支。
11. `tools/dispatch.ts` 的 `PLUGINS`、`Plugin` 改名 `APPS`、`App`（驗收第 5 項）；`roadmap-board.ts` 改用 `APPS_ROOT` 讀資料夾。

## 回報與權限

只審查，不改程式與文件；可以在隔離環境（repo 外的 clone、暫存 repo）重現。不碰測試 vault 與正式 vault，不 push。每項發現寫觸發條件、預期／實際、影響、位置與證據，區分「已重現」「靜態推斷」「待驗證」，另標真實路徑會不會發生與發生機率。報告寫在回覆裡，Claude 原文附到下面。

## 第一輪
