# Essence Cards｜細項規畫的存放方式

工作只分「v1 需要做的任務」與「第二階段想做的事」，統一入口在 [backlog](../backlog.md)；進行中的下一步仍只看[路線圖](../roadmap.md#現在在哪裡)。依據：[D-130](../decisions.md#d-130-任務分成-v1-與第二階段)。

| 內容 | 放在哪裡 | 如何使用 |
|---|---|---|
| 任務與點子的入口 | 外掛的 `docs/backlog.md`；跨外掛的在最上層 `docs/backlog.md` | 先判斷屬於 v1 或第二階段，列簡短項目、狀態及細項連結 |
| 尚在規畫的功能細節 | `docs/plans/<主題>.md`（外掛專用的在外掛的 `docs/plans/`） | 一個主題一份、不按日期重開；記原意、來源、目前狀態與待決問題。很短的新點子先留 backlog，展開後再搬來並改成引用。標題下第一行寫狀態；定案的部分換成一句加 D-ID；整個主題做完標已完成，不刪不搬（D-143） |
| 已確認的決定與理由 | `docs/decisions.md` | 沿用 D-ID；計畫文件引用決定，不另抄完整規格。實作前仍需使用者確認待決部分 |
| 已可交付實作的任務與驗收 | `docs/tasks/<任務>.md`（外掛專用的在外掛的 `docs/tasks/`） | 從 roadmap 或 backlog 引用；主題計畫轉成任務後保留指向任務與決定的連結；做完只改狀態行，不刪不搬 |
| 當前進度與最近完成 | 外掛的 `docs/roadmap.md`；最上層 `docs/roadmap.md` 是入口 | 狀態板一列、已完成一句；不寫經過，細節在主文（D-141） |
| Claude／Codex 討論與交接 | `docs/Claude Codex Discussion/YYYY-MM-DD-主題.md`（外掛專用的在外掛的 `docs/` 底下） | 同一議題接續同一份；正在往返時它就是未決問題的主文，入口連到它；結案在檔頭標 D-ID |
| 重要討論摘要 | `docs/archive/discussions/YYYY-MM-DD-主題.md` | 只收沒有討論稿的討論，結束時才寫；保留歷史取捨並更新該目錄索引；未決問題留在主文；不當作目前規格 |

任務與討論稿在 `docs/` 底下，只講一個外掛的在那個外掛的 `docs/`（[D-213](../decisions.md#d-213-任務與討論稿放進-docs外掛專用的放外掛的-docs)，第二步 B 搬好）。之後這張表改成連到工作流程規範（[D-214](../decisions.md#d-214-工作流程一件事一個現在位置反方向由工具算)）。

## 一件事從點子到完成的路線

```text
點子
 │ 記下來
 ▼
backlog ………………… 短點子、待決問題、技術債的入口
 │ 需要展開
 ▼
plans/<主題>.md ……… 還在規畫的細節，一個主題一份
 │ 要做決定
 ▼
討論 ………………………… essence-discuss：一次問一題、附建議、和「不做」比較
 │ 重大的：docs/Claude Codex Discussion/ 的討論稿，Claude 與 Codex 輪流回覆，一致才交給使用者
 │ 使用者明確同意
 ▼
decisions.md（D-ID）… essence-decision；同步規範文件（product、architecture、syntax、transcript、docs/agents）
 │ 可以交付實作
 ▼
docs/tasks/<任務>.md … 規格與驗收標準；審查報告也在這裡
 │ 實作 → L1 自查 → 高風險的改動請 Codex 做 L2 → 合併
 ▼
roadmap 狀態板與已完成更新、progress-map 改符號、任務狀態行改「已合併」
```

可以跳站（短點子直接談成決定）、拆分、合併、退回。現在的規則是每往下一站，上一站只留一行連結或移除（[D-141](../decisions.md#d-141-文件架構入口只放狀態同一類資訊只維護一份)、[D-143](../decisions.md#d-143-歸檔原則每類文件都有終點不設字數上限)）；D-214 上線後改成上一站加一行「→ 下一站」、不刪。

「第二階段」是下一階段候選清單，不承諾單一版本全部完成。舊文件的「增強版」「v2」「v2 之後」「未來」都由這個入口追蹤；歷史原文可保留，不另設交付級別。已確認方向、使用者提議、助理提案與條件式候選仍要分清楚。

## 目前的主題文件

- [學習動機設計](../../plugins/cards/docs/plans/motivation.md)
- [題庫、拼句與錯題回饋](../../plugins/cards/docs/plans/practice.md)
- [知識庫、依能力複習與精熟循環](../../plugins/cards/docs/plans/learning-growth.md)
- [複習體驗與卡片管理](../../plugins/cards/docs/plans/experience.md)
- [AI 與外掛生態](ai-and-ecosystem.md)
- [相似字比較卡](../../plugins/cards/docs/plans/similar-chars.md)
- [獨立 App](../../plugins/cards/docs/plans/standalone-app.md)
- [更新與相容](../../plugins/cards/docs/plans/updates.md)
- [維修與查修的準備](../../plugins/cards/docs/plans/maintenance.md)
- [工作流程優化：點子到完成的路線](workflow.md)

Capture、Mindboard 的待做與待決已搬到各自的 `docs/backlog.md`（[Capture](../../plugins/capture/docs/backlog.md)、[Mindboard](../../plugins/mindboard/docs/backlog.md)，[D-208](../decisions.md#d-208-三個外掛在同一個-repo-開發每個外掛有自己的資料夾)）。
