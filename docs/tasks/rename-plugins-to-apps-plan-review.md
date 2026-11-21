# `plugins/` 改名 `apps/`：開工前查核（給 Fable 5.2 high）

狀態：第 1 輪待審

遵守 repo 根目錄的 `AGENTS.md`。Codex 額度用完（約 2026-11-23 重置），使用者 2026-11-21 指定這件的查核由 **Fable 5.2 high** 做：本機 session 每一輪開一個沒參與實作的新子代理，報告原文附在這份檔案的那一輪底下，Claude 核對後改任務說明（[任務說明〈本機或雲端〉](rename-plugins-to-apps.md#本機或雲端qualitymd本機或雲端)）。

[任務說明](rename-plugins-to-apps.md)把 [D-218](../decisions.md#d-218-plugins-改名-apps每個軟體的資料夾首字大寫) 寫成可以施工的規格。D-218 已定案，這次**不重議要不要改名、要不要首字大寫**；只查任務說明在 D-218 沒寫死的地方選得對不對、有沒有漏、驗收做不做得到。程式還沒動。

## 審查對象

- repo：`D:\程式開發\Essence`（主資料夾），分支 `claude/project-thread-sdo9aa`。
- 規格基準：`main` 的 `8a03736dd80fe6d09925618dc29e41d618d297d7`（也是分支的共同祖先）。
- 待審：分支上加入這份請求的 commit（`git log -1 --format=%H -- docs/tasks/rename-plugins-to-apps-plan-review.md`），hash 寫進報告。分支上目前只有文件的 commit。

## 規格與優先順序

- 任務說明全文（`docs/tasks/rename-plugins-to-apps.md`）。
- D-218 全文、D-208 第 1、5、8、9、10 點：`node experiments/tools/decisions-index.mjs D-218 D-208`。
- 第二步的做法與踩過的坑：`docs/tasks/one-repo-step-2.md` 的〈結果〉（〈A 的進度〉〈B 的進度〉兩節）。
- 規格之間衝突時列成問題，不挑容易通過的那份。

## 查什麼

1. **規格矛盾**：任務說明內部、和 D-218／D-208 之間有沒有互相矛盾的地方（例如 §1 的 commit 分法與 §2、§3 的內容放在哪個 commit；Portal「只有文件」在分派表、§3 第 1 點與驗收第 7 項的說法是否一致；停手時段與合併後步驟）。
2. **漏列的路徑**（這次最重要）：自己跑 `git grep -n -i -E "plugins"`（或更細的 pattern），和 §2 的表與 §4 的文件清單逐一比對：哪些寫到 `plugins/…` 的程式、設定、測試、hook、workflow、skill、現行文件沒列到；哪些列了但其實是 vault 路徑（`.obsidian/plugins/`、`plugins/essence-cards`）或紀錄，不該改。也看不含 `plugins` 字樣、但靠目錄結構假設的地方（例如 `readdirSync(join(root, 'plugins'))`、`plugins/*` 萬用字元、以 `/` 切出第二段當代號、knip／ESLint／tsconfig 的路徑、`package.json` 的 scripts、`npm --prefix`）。
3. **大小寫的邊界**：§3 的防線（一張表、擋 `plugins/` 再出現、擋大小寫不符的寫死路徑、TypeScript、Markdown）有沒有漏洞：哪些寫法會溜過（例如 `path.join('apps', 'cards')`、模板字串、反斜線路徑、`APPS/Cards`、URL 裡的 `blob/main/apps/cards`、YAML 的 `paths`、`.gitignore`）；哪些合法的寫法會被誤擋（例如 vault 路徑、`experiments/plugin/`、小寫的軟體代號本身、npm 套件名）。Windows 不分大小寫、Linux 分，請找「Windows 本機過、CI 或雲端才壞」或反過來的組合。
4. **跨版本外掛根的邊界**：§1 第 1 點三種外掛根（根目錄、`plugins/cards`、`apps/Cards`）的判定：兩種以上同時存在、`apps/cards` 小寫、`apps/Cards/` 存在但 manifest 不是 Cards 的、tag 在搬家前後；`compare-versions`、`update-vault`、`install-vault`、讀舊版的測試（`ai-add-old-version`、`pick-old-version`）還有沒有假設 Cards 在某個固定路徑的地方。請讀 `plugins/cards/tools/git.ts` 與它的呼叫端核對。
5. **commit 順序**：每個 commit 之後 pre-commit、CI、Pages 都要能跑；搬家的 commit 列的「最少修改」夠不夠讓 hook 過（hook 的副本在搬家的 commit 用哪一份工具、哪一份 `node_modules`）；`git log --follow` 是否仍接得到。
6. **驗收**：每一項是不是程式判斷得了；哪一項做不到或證明不了它要證明的事；有沒有該有而沒列的。

## 驗證方式

- Windows 11、Git 2.52、Node 24；`tools/` 與 `plugins/cards/` 的 `npm run check`。
- 可以在 repo 外的暫存 clone（`git clone --no-local`）重現，不改主資料夾、不 commit、不 push。
- 〈平台事實〉表裡標待驗的，能用探針分辨的請跑；跑不了的寫待驗證。

## 回報與權限

只審查，不改 repo 裡的檔案。照 `.claude/skills/code-quality/review.md`〈回報格式〉：依嚴重程度排序，每項寫哪一軸、觸發條件、預期／實際、影響、發生機率（真實路徑會不會發生）、位置、證據（已重現／靜態推斷／待驗證）、建議處理，並標嚴重度（擋開工／應該改／可以不改）。逐題（上面 1～6）寫同意或發現。頭尾寫待審 commit、審查範圍、跑了什麼、沒驗的項目與原因。

## 第 1 輪

（報告與 Claude 的回應寫在這裡）
