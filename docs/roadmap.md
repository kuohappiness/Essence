# Essence｜開發現況（入口）

更新：2026-11-21｜狀態：三個外掛的入口；2026-11-20 拆開（[D-208](decisions.md#d-208-三個外掛在同一個-repo-開發每個外掛有自己的資料夾) 第 8 點，第二步 B）：這裡只留跨外掛的工作，每個外掛的進度在自己的 roadmap。

手機看進度：[進度白板](https://kuohappiness.github.io/Essence/roadmap.html)，由各份 roadmap 的〈現在在哪裡〉〈已完成〉與決策紀錄自動產生，合併進 `main` 後一兩分鐘更新（`tools/roadmap-board.ts`）。

## 現在在哪裡

開工只讀這一節與要做的外掛的〈現在在哪裡〉；要找決定看[決策索引](decisions.md#索引)（[D-141](decisions.md#d-141-文件架構入口只放狀態同一類資訊只維護一份)）。

- **Essence Cards**：v1 開發中，見 [Cards 的〈現在在哪裡〉](../apps/Cards/docs/roadmap.md#現在在哪裡)。
- **Essence Capture**：移到第二階段（[D-206](decisions.md#d-206-essence-capture-移到第二階段v1-的教材直接附給-ai)），還沒有 roadmap，見 [backlog](../apps/Capture/docs/backlog.md)。
- **Essence Mindboard**：還沒開始，見 [backlog](../apps/Mindboard/docs/backlog.md)。
- **Essence Portal**（入口網站）：只有文件、還沒寫程式，還沒有 roadmap，討論在下表，點子見 [backlog](../apps/Portal/docs/backlog.md)。

跨外掛的工作：

| 工作 | 狀態 | 下一步 | 等誰 | 入口 |
|---|---|---|---|---|
| 入口網站與網頁版的 Cards | 討論中 | 請 Codex 回答第 7 節（D-215），雙方一致後把第 2 節談定的寫成 D-ID；同時和使用者談第 6 節 | Codex、使用者 | [入口網站討論稿](<../apps/Portal/docs/Claude Codex Discussion/2026-11-20-portal.md>) |
| AI 連線模組（外掛直接呼叫 AI，可換廠商的共用套件） | 實作中 | 第一、二步做完（〈結果〉）；第三步照 [Cards 直接呼叫 AI](../apps/Cards/docs/tasks/ai-direct.md) 做（Cards 不切頁，切頁與轉錄放 Capture，使用者 2026-11-27），第 1 批（設定頁與測試連線）已合併（PR #78），接著做第 2 批的直接製作 | Claude | [任務說明](tasks/ai-client.md) |
| 給其他專案的初始架構（新專案的模板：起步包與成長包） | 實作中 | 第 3 批（成長包）PR 等使用者同意合併；接著做第 4 批（演練與收尾） | 使用者、Claude | [任務說明](tasks/project-starter-template.md) |

## 等觸發點

觸發點到了才動的工作，不上白板。入口狀態是等觸發點的列由 `node tools/roadmap-sync.ts` 從狀態板搬過來；入口只有 D-ID、或連到沒有狀態行的紀錄的列手寫（[工作流程規範〈roadmap〉](agents/workflow.md#roadmap)）。

| 工作 | 觸發點 | 入口 |
|---|---|---|

## 路線圖

搬到 Cards 的[〈路線圖〉](../apps/Cards/docs/roadmap.md#路線圖)（D-208 第二步）。

## 未來準備開發：獨立 App

搬到 Cards 的[〈未來準備開發：獨立 App〉](../apps/Cards/docs/roadmap.md#未來準備開發獨立-app)（D-208 第二步）。

## 已完成

由工具產生：入口的狀態變成已合併或已結案時，`node tools/roadmap-sync.ts` 把那一列移到最上面（[D-217](decisions.md#d-217-狀態只寫在入口狀態板與已完成由工具產生)）；不設列數上限、不搬去封存（[D-214](decisions.md#d-214-工作流程一件事一個現在位置反方向由工具算) 第 5 點）。決定不列在這裡：白板的「最近定案」從決策紀錄產生。2026-11-21 以前跨外掛的完成在 [Cards 的〈已完成〉](../apps/Cards/docs/roadmap.md#已完成)與[已完成（封存）](archive/roadmap-completed.md#已完成)。

| 日期 | 工作 |
|---|---|
| 2026-11-22 | **`plugins/` 改名 `apps/`、首字大寫**：搬家、大小寫的防線與現行文件（D-218）；L2 兩輪，第二輪沒有擋合併的問題（已合併，[入口](tasks/rename-plugins-to-apps.md)） |
| 2026-11-21 | **工作流程優化：點子到完成的路線**：狀態行、roadmap 同步、決策查詢、文件檢查與進度白板上線（D-214、D-215、D-217）；L2 五輪，第五輪通過（已合併，[入口](tasks/workflow-impl.md)） |
