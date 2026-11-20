# 工作流程上線：L2 獨立審查（給 Codex）

狀態：待審｜下一步：Codex L2 第一輪｜等誰：Codex

遵守 repo 根目錄的 `AGENTS.md`。由 Claude 用 `node tools/codex.ts l2` 送出，新的 session。

[任務說明](workflow-impl.md)由 Claude（Opus 5.5）實作：D-214、D-215、D-217 的工具、檢查與文件（D-216 這次不做）。改到 pre-commit 的共用檢查、文件檢查與 CI 跑的 `npm run check`，屬於高風險（[quality.md〈高風險範圍〉](../agents/quality.md#高風險範圍要做-l2)）。開工前的規格查核在 [workflow-impl-plan-review.md](workflow-impl-plan-review.md)。

## 審查對象

- worktree 的分支 `claude/workflow-impl-68afda`，從 `main` 的 `8a03736` 開出，`main` 之後沒有前進（2026-11-21 `git fetch` 過）。commit（由舊到新）：
  - `64b781c`、`f6614c1` 規格與開工前查核（只有文件）
  - `6b16b47` `section` 工具（D-215 第 6 點）
  - `6a1b2b6` 決策查詢工具搬進 `tools/`、索引由條目產生、預設只印一層（D-214 第 5、8、9、10 點）
  - `4a3cfc2` 四份 backlog 與兩份 roadmap 分區、現有狀態板整理成入口的狀態行、凍結清單
  - `9e2b6d6` 狀態行解析、`roadmap-sync`、文件檢查與白板讀新格式，接進 pre-commit、pre-merge-commit 與 `npm run check`
  - 這份請求所在的 commit：工作流程規範的連結、quality.md、兩個 skill、`AGENTS.md`、技術債表一列、任務說明的〈結果〉
- 審查對象的最後一個 commit 是這份請求所在的 commit（`git log -1 --format=%H -- docs/tasks/workflow-impl-review.md`）；之後分支上有新的 commit，就是修正或再審，不在這一輪。沒有未提交的修改要審。
- 看全部：`git diff 8a03736 <這份請求的 commit>`。`4a3cfc2` 是一次性的搬移（腳本沒進 repo），看內容先用 `git show --stat 4a3cfc2`；backlog 的差異大多是標題降一級。

## 規格與優先順序

- 主要規格：任務說明的〈範圍〉1～12、〈驗收〉1～11、〈待使用者決定〉Q1、Q2（都已定）。
- 依據：D-214、D-215、D-217（查法 `node tools/decisions-index.ts D-xxx`，`--deep` 全印）；背景見 [plans/workflow.md](../plans/workflow.md)。新的規範寫在 [工作流程規範](../agents/workflow.md)。
- 規格之間、規格和決定之間衝突或有漏洞時列成問題，不挑容易通過的那份。

## 行為與風險

公開介面與呼叫端：

- `tools/status-line.ts`：`parseStatus`、`looksNew`。呼叫端：文件檢查、`roadmap-sync`、白板。
- `tools/roadmap-sync.ts`：CLI（不帶參數寫工作樹、`--check`、`--check --staged`、`--root`）與 `moveText`、`checkNewDone`。呼叫端：`tools/hooks.ts` 的 `SHARED_CHECKS`（pre-commit 與 pre-merge-commit 都跑）、`tools` 的 `npm run check`（CI 的 shared job）。
- `tools/check-docs.ts`：新格式的狀態行（凍結清單 `tools/legacy-status-docs.json` 以外一律照新格式查）、清單裡的檔要在、backlog 與 roadmap 的分區、「來自」與「→」兩邊對得上、`downstreamOf`（白板的「現在在哪」）。呼叫端：hook、CI、`progress-board.ts`、`roadmap-board.ts`。
- `tools/roadmap-board.ts`：合併兩份〈已完成〉、正式 vault 的版本取較新的、工具產生的「已合併」列算待發布、「最近定案」。呼叫端：`progress-board.yml`（Pages）、hook 的 `--check --staged`。
- `tools/decisions.ts`、`tools/decisions-index.ts`：分界 `BOUNDARY`、索引由條目產生、反推的後續見與已取代、預設一層、`--deep`、「現行寫在」；`experiments/tools/decisions-index.mjs` 轉呼叫。
- `tools/section.ts`。
- 文件：四份 backlog、兩份 roadmap、改成新狀態行的入口（原狀態行與原狀態板的字搬進入口）、封存的〈已完成〉、三份 card-rules（狀態行加在引用框之前、引用框的「狀態：」改「版本：」）、新的 `plugins/cards/docs/plans/entry-and-catalog.md`。

不可破壞的性質：

1. 每個 commit 之後 hook、CI 與 Pages 都能跑；別的 session 在舊分支上只改舊格式的文件，合併後照樣過得了（凍結清單裡的檔不用改）。
2. `roadmap-sync`：冪等；`--check` 不寫檔；`--staged` 只讀暫存區與 HEAD，不混讀工作樹；工具寫出的 roadmap 過得了文件檢查與白板。
3. 舊連結不壞：backlog 與 roadmap 的舊錨點都還在；三份 card-rules 的 AI 標記以下逐字相同（D-151，嵌入規則的雜湊不變）。
4. 決策紀錄和工具產生的一模一樣；純舊資料的 `--deep` 和舊工具逐字相同。
5. 沒有改到使用者筆記的格式與 Cards 的產品程式（`git diff --stat 8a03736 -- plugins/cards/src` 是空的）。

請找新的組合，例如：入口改名或搬家時狀態板那一列；同一個入口同時在兩份 roadmap；狀態行在引用框或程式碼區塊裡；rebase、squash 後的完成日期；上線前開的分支在上線後加手寫的〈已完成〉列（`ROLLOUT`）；CRLF 的檔；路徑有空白、中文、百分比編碼；「→」寫在引用框、表格或程式碼裡；從 backlog 出發的錨點有標點；鏈裡有循環或拆成好幾站；pre-merge-commit 讀合併的索引時的 `--staged`；凍結清單裡的檔改成新格式之後。

明確延後的範圍：D-216（給其他專案的初始架構）；技術債表的「補做：查詢工具的現行寫在只算有連結的引用」；驗收第 11 項（合併後 Pages 的 run）。

## 驗證方式

- 環境：Windows 11、Git 2.52.0、Node 24.13.0；CI 是 GitHub Actions 的 Ubuntu、Node 24（`check.yml` 用 `fetch-depth: 0`）。
- 指令：`npm --prefix tools run check`；`npm --prefix tools run self-check`；`node tools/roadmap-sync.ts --check`；`node tools/check-docs.ts`；`node tools/decisions-index.ts D-117`（加 `--deep` 比較）；`node tools/roadmap-board.ts --out <暫存資料夾>/roadmap.html`。
- 實作者跑過的：任務說明的〈結果〉。
- 平台事實：GitHub 的標題錨點照 github-slugger（降級的標題錨點不變靠這一點）；日期用台北時間；`progress-board.yml` 的 Pages 只讀〈已完成〉的表，不需要 Git 歷史。

## 實作者自己選的做法

規格沒寫、由 Claude 決定的地方，請先看：

1. `BOUNDARY = 218` 寫成 `tools/decisions.ts` 的常數；`origin/main` 的最大號是 D-217（2026-11-21）。合併前再看一次。
2. `ROLLOUT`（`tools/roadmap-sync.ts`）：暫存區新加、HEAD 沒有、日期不早於這天的〈已完成〉列要是工具的格式；更早日期的手寫列放行（上線前開的分支）。合併那天改成合併的日期。
3. 凍結清單裡的檔，狀態行「看起來是新格式」（`looksNew`）時也照新格式嚴格查：清單裡的檔改成新格式後就受檢查。
4. `downstreamOf` 的「最下游」：從起點走得到、和起點不在同一個循環、走不出自己所在循環的站；循環有好幾站時只列從循環外走進來的那幾站。決定的「來自」只把「來自」那一段的 D-ID 算成邊，「修改」「補充」不算（那是後續見，由查詢工具列）。
5. 「最近定案」裡分界之前的決定沒有「現在在哪」（它們沒有「來自」）；「一句話」用 markdown-it 的行內渲染（反引號變 `<code>`）。「現在在哪」的狀態值讀不出來時印「—」。
6. 入口原本的狀態行寫成「原狀態行（2026-11-21 前）：…」、原本在狀態板的字寫成「原狀態板（2026-11-21 前）：」一個清單，連結照入口的位置改寫。
7. 封存的〈已完成〉：除了規格說的五列只有決定的，另把九列放錯表（在 10-27 快照的表裡）的照日期搬進〈已完成〉。
8. 白板的 `headline()`（標題取第一個「：」或「，」之前）沒改，所以「正式 vault 升到 `0.6.0`（tag `v0.6.0`，…」顯示成括號沒閉合的標題；這是原本就有的行為，記成後續。
9. hook 的測試自己建 repo 時，真的複製 `decisions.ts`、`status-line.ts`（文件檢查 import 它們），`roadmap-sync.ts` 在沒有 roadmap 的測試裡換成替身。

## 回報與權限

只審查，不改 repo 裡追蹤的檔案；要寫檔才能重現時，暫存檔放在系統的暫存資料夾，結束前刪掉。每項發現寫觸發條件、預期／實際、影響、位置與證據，並區分「已重現」「靜態推斷」「待驗證」；另標真實路徑會不會發生，會發生的寫發生機率。可以回報「規格本身有漏洞」。報告頭尾寫待審 commit、審查範圍、測試結果與沒驗的項目及原因。格式照 code-quality 的 `review.md`〈回報格式〉。

## 第一輪的回報

（Codex 交回後由 Claude 附上原文，再寫〈Claude 回應〉。）
