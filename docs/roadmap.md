# Essence｜開發現況（入口）

更新：2026-11-21｜狀態：三個外掛的入口；2026-11-20 拆開（[D-208](decisions.md#d-208-三個外掛在同一個-repo-開發每個外掛有自己的資料夾) 第 8 點，第二步 B）：這裡只留跨外掛的工作，每個外掛的進度在自己的 roadmap。

手機看進度：[進度白板](https://kuohappiness.github.io/Essence/roadmap.html)，由各份 roadmap 的〈現在在哪裡〉〈已完成〉與決策紀錄自動產生，合併進 `main` 後一兩分鐘更新（`tools/roadmap-board.ts`）。

## 現在在哪裡

開工只讀這一節與要做的外掛的〈現在在哪裡〉；要找決定看[決策索引](decisions.md#索引)（[D-141](decisions.md#d-141-文件架構入口只放狀態同一類資訊只維護一份)）。

- **Essence Cards**：v1 開發中，見 [Cards 的〈現在在哪裡〉](../plugins/cards/docs/roadmap.md#現在在哪裡)。
- **Essence Capture**：移到第二階段（[D-206](decisions.md#d-206-essence-capture-移到第二階段v1-的教材直接附給-ai)），還沒有 roadmap，見 [backlog](../plugins/capture/docs/backlog.md)。
- **Essence Mindboard**：還沒開始，見 [backlog](../plugins/mindboard/docs/backlog.md)。

跨外掛的工作：

| 工作 | 狀態 | 下一步 | 等誰 | 入口 |
|---|---|---|---|---|
| 工作流程優化：點子到完成的路線 | 待審 | L2 第一輪的 12 項已修，第二輪由 Fable 5.2（high）審，合併前看白板 | Claude | [任務說明](tasks/workflow-impl.md) |

## 等觸發點

觸發點到了才動的工作，不上白板。入口狀態是等觸發點的列由 `node tools/roadmap-sync.ts` 從狀態板搬過來；入口只有 D-ID、或連到沒有狀態行的紀錄的列手寫（[工作流程規範〈roadmap〉](agents/workflow.md#roadmap)）。

| 工作 | 觸發點 | 入口 |
|---|---|---|
| 給其他專案的初始架構 | D-214～D-217 用過一段時間再整理 | [D-216](decisions.md#d-216-給其他專案的初始架構essence-裡的一包檔案用前先看是不是最新) |

## 路線圖

搬到 Cards 的[〈路線圖〉](../plugins/cards/docs/roadmap.md#路線圖)（D-208 第二步）。

## 未來準備開發：獨立 App

搬到 Cards 的[〈未來準備開發：獨立 App〉](../plugins/cards/docs/roadmap.md#未來準備開發獨立-app)（D-208 第二步）。

## 已完成

由工具產生：入口的狀態變成已合併或已結案時，`node tools/roadmap-sync.ts` 把那一列移到最上面（[D-217](decisions.md#d-217-狀態只寫在入口狀態板與已完成由工具產生)）；不設列數上限、不搬去封存（[D-214](decisions.md#d-214-工作流程一件事一個現在位置反方向由工具算) 第 5 點）。決定不列在這裡：白板的「最近定案」從決策紀錄產生。2026-11-21 以前跨外掛的完成在 [Cards 的〈已完成〉](../plugins/cards/docs/roadmap.md#已完成)與[已完成（封存）](archive/roadmap-completed.md#已完成)。

| 日期 | 工作 |
|---|---|
