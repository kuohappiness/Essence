# Essence｜開發現況（入口）

更新：2026-11-20｜狀態：三個外掛的入口；2026-11-20 拆開（[D-208](decisions.md#d-208-三個外掛在同一個-repo-開發每個外掛有自己的資料夾) 第 8 點，第二步 B）：這裡只留跨外掛的工作，每個外掛的進度在自己的 roadmap。

手機看進度：[進度白板](https://kuohappiness.github.io/Essence/roadmap.html)，由這份與各外掛 roadmap 的「現在在哪裡」、Cards 的「已完成」自動產生，合併進 `main` 後一兩分鐘更新（`tools/roadmap-board.ts`）。

## 現在在哪裡

開工只讀這一節與要做的外掛的〈現在在哪裡〉；要找決定看[決策索引](decisions.md#索引)（[D-141](decisions.md#d-141-文件架構入口只放狀態同一類資訊只維護一份)）。

- **Essence Cards**：v1 開發中，見 [Cards 的〈現在在哪裡〉](../plugins/cards/docs/roadmap.md#現在在哪裡)。
- **Essence Capture**：移到第二階段（[D-206](decisions.md#d-206-essence-capture-移到第二階段v1-的教材直接附給-ai)），還沒有 roadmap，見 [backlog](../plugins/capture/docs/backlog.md)。
- **Essence Mindboard**：還沒開始，見 [backlog](../plugins/mindboard/docs/backlog.md)。

跨外掛的工作：

| 工作 | 狀態 | 下一步 | 等誰 | 入口 |
|---|---|---|---|---|
| 三個外掛的 repo 架構 | 已定案（[D-208](decisions.md#d-208-三個外掛在同一個-repo-開發每個外掛有自己的資料夾)，2026-11-17）：三個外掛在同一個 repo 開發、改名 `Essence`，每個外掛在 `plugins/` 有自己的 docs、tasks 與討論稿；決定維持一份 | 第一步已合併進 `main`（2026-11-18，見已完成），合併後的步驟做完（[驗收第 14 項](tasks/one-repo-step-1.md#結果)）；GitHub 已改名 `Essence`（2026-11-18，Pages 網址跟著換成 `/Essence/`）；本機資料夾也改名 `Essence`（2026-11-18，[D-211](decisions.md#d-211-本機資料夾也改名舊對話收尾後不接續)，見已完成）：驗收全部通過（[任務說明〈結果〉](tasks/local-folder-rename.md#結果)）；Cards 搬家的穩定基線到了：`v0.6.0` 裝好、iPhone 驗完（2026-11-20，[清單](../plugins/cards/docs/tasks/release-0.6.0.md)〈結果〉），下一步約停手時段開始搬家；裝好之後先搬家，AI 製卡第 4、5 批（錯題補強、補記憶錨點）排在搬家之後（使用者 2026-11-18）；搬家的[任務說明](tasks/one-repo-step-2.md)寫好（2026-11-19，A 程式、B 文件兩個 PR），開工前 Codex 查核四輪後一致；B 也把任務與討論稿搬進 `docs/`（[D-213](decisions.md#d-213-任務與討論稿放進-docs外掛專用的放外掛的-docs)）；A（Cards 的程式搬進 `plugins/cards/`）已合併進 `main`（2026-11-20，見已完成），停手時段結束；轉錄稿格式在 B 就搬到最上層（使用者 2026-11-20，D-208 第 6 點的時機調整），共用範例與相容檢查等第一個需要共同規格的 Capture 任務 | Claude（B 開工：先修改連結的腳本，[§B0](tasks/one-repo-step-2.md#b0-開工條件) 第 4 項） | [第二步任務說明](tasks/one-repo-step-2.md)、[第一步任務說明](tasks/one-repo-step-1.md)、[本機改名](tasks/local-folder-rename.md)、[D-208](decisions.md#d-208-三個外掛在同一個-repo-開發每個外掛有自己的資料夾)、[backlog](backlog.md#三個外掛併進同一個-repo) |
| 工作流程優化：點子到完成的路線 | Essence 的流程已定案（[D-214](decisions.md#d-214-工作流程一件事一個現在位置反方向由工具算)、[D-215](decisions.md#d-215-狀態留在-repo獨立的第一輪決定的門檻只讀需要的那一段)、[D-216](decisions.md#d-216-給其他專案的初始架構essence-裡的一包檔案用前先看是不是最新)、[D-217](decisions.md#d-217-狀態只寫在入口狀態板與已完成由工具產生)）；獨立的第一輪與 D-ID 門檻現在就照做 | 改檔排在第二步 B 合併之後，狀態板與〈已完成〉改由工具產生也在那時；初始架構等 D-214、D-215 用過一段時間再整理 | 使用者 | [主文](plans/workflow.md) |

## 路線圖

搬到 Cards 的[〈路線圖〉](../plugins/cards/docs/roadmap.md#路線圖)（D-208 第二步）。

## 未來準備開發：獨立 App

搬到 Cards 的[〈未來準備開發：獨立 App〉](../plugins/cards/docs/roadmap.md#未來準備開發獨立-app)（D-208 第二步）。

## 已完成

搬到 Cards 的[〈已完成〉](../plugins/cards/docs/roadmap.md#已完成)（D-208 第二步）；跨外掛的完成也記在那裡（進度白板只讀一份〈已完成〉）。
