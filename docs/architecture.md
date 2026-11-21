# Essence｜架構

更新：2026-11-20｜狀態：三個外掛共用的部分；2026-11-20 拆開（[D-208](decisions.md#d-208-三個外掛在同一個-repo-開發每個外掛有自己的資料夾) 第 8 點，第二步 B）：這裡留三個外掛的定位與接點（§3）與 repo 結構（§9），Cards 的術語、概念模型、平台、資料存放、AI 的位置、製卡規則與分工搬到 [Cards 的架構](../plugins/cards/docs/architecture.md)。搬走的每一節留標題與一行轉往新頁。

這份文件回答「三個外掛技術上怎麼組成」。為什麼做、為誰做見[產品定義](product.md)；兩個外掛之間唯一的檔案接點見[轉錄稿格式](transcript.md)。

狀態標示：✅ 已確認｜🔁 舊共識，待重新確認｜💬 待討論｜💡 助理提案

## 1. 術語表

搬到 Cards 的[〈1. 術語表〉](../plugins/cards/docs/architecture.md#1-術語表)（D-208 第二步）。

## 2. 概念模型 ✅（第 4 步）

搬到 Cards 的[〈2. 概念模型 ✅（第 4 步）〉](../plugins/cards/docs/architecture.md#2-概念模型-第-4-步)（D-208 第二步）。

## 3. 模組邊界 ✅（第 5 步）

| 模組 | 責任 | 狀態 |
|---|---|---|
| Essence Cards（在本 repo 的 `plugins/cards/` 開發，[D-208](decisions.md#d-208-三個外掛在同一個-repo-開發每個外掛有自己的資料夾)） | 製卡、複習、檢核、排程、選用的 AI 輔助 | ✅ |
| Essence Capture（在本 repo 的 `plugins/capture/` 開發，[D-208](decisions.md#d-208-三個外掛在同一個-repo-開發每個外掛有自己的資料夾)；原本的 [repo](https://github.com/kuohappiness/Essence-Capture) 之後當公開 repo） | 知識入口：來源 → 可讀、可編輯的 Obsidian 筆記；PDF 與圖片的忠實轉錄移到第二階段，v1 的教材由家長在自己的 AI 對話附課本（[D-206](decisions.md#d-206-essence-capture-移到第二階段v1-的教材直接附給-ai)）；接上後成為教材庫（[D-076](decisions.md#d-076-capture-是知識入口教材轉錄成教材庫)）；教材庫是共用、唯讀的文件，可以分享給很多學生，個人回饋只留在卡組與錯題本（[D-093](decisions.md#d-093-教材庫共用個人回饋留在錯題本)）；給通用型使用者，不限學生 | ✅ |
| 題庫（Cards 內的獨立模組，第二階段討論） | 計算與應用題、選擇題、考古題模擬考；題目寫在題庫筆記，和閃卡共用今日佇列、排程與複習紀錄（[D-090](decisions.md#d-090-題庫併入-cards變式題以題型排程)） | ✅ 方向；細節見[第二階段規畫](../plugins/cards/docs/plans/practice.md) |
| Essence Mindboard（未來，尚未建立；在本 repo 的 `plugins/mindboard/` 開發，[D-208](decisions.md#d-208-三個外掛在同一個-repo-開發每個外掛有自己的資料夾)） | 把知識架構視覺化（D-076）；使用者未來想開發的 Obsidian 心智圖外掛；Cards 保留對接的彈性（[D-056](decisions.md#d-056-保留和心智圖外掛對接的彈性)） | ✅ 需求；做法 💡 |

已確認 ✅（[D-006](decisions.md#d-006-兩個獨立外掛)、[D-008](decisions.md#d-008-學習紀錄與來源修改)、[D-009](decisions.md#d-009-一般筆記可直接使用)）：

- 兩個外掛各自安裝、各自可用，不要求同時運作，彼此沒有執行上的依賴。
- Cards 接受一般手寫或其他工具產生的筆記；YAML 不是使用門檻。
- 來源修改時，只提示「可能影響哪些卡」，不自動改卡、不重設進度。

2026-10-10 確認 ✅（[D-031](decisions.md#d-031-capture-定位與交接約定修訂)，取代 D-029）：

- **Capture 是通用的知識保存工具**：任何來源（PDF、影片、網頁……）都能轉成可讀筆記；單純保存知識就是完整的用途，不一定要接到 Cards。Capture 的筆記可以用 Obsidian 標籤；Cards 的卡組與卡片不用（[D-064](decisions.md#d-064-卡組分類改用屬性)）。
- **學習目標的拆解與出題都屬於 Cards。** Capture 不寫入科目、年級這類學生專用的資訊；這些由家長在 Cards 建立卡組時選定，記在卡組筆記裡。
- **交接約定只有少數幾項**：來源類型、來源（檔名或網址）、建立日期；課本另記出版社與版次（D-080 補充）。定位標記改為轉錄稿的頁碼標記與圖表錨點（[D-076](decisions.md#d-076-capture-是知識入口教材轉錄成教材庫)、[D-080](decisions.md#d-080-轉錄稿的錨點與出處的寫法)）。轉錄稿的格式是兩個外掛唯一的接點，只寫在[轉錄稿格式](transcript.md#1-轉錄稿)。

v1 的材料來源 ✅（[D-032](decisions.md#d-032-v1-的材料來源)）：

- 卡組從 Obsidian 筆記製作：手寫、其他工具產生的筆記，或第二階段 Capture 轉錄的教材庫（[D-076](decisions.md#d-076-capture-是知識入口教材轉錄成教材庫)）。v1 的課本與講義由家長在自己的 AI 對話附上（照片或 PDF），Cards 不讀 PDF（[D-206](decisions.md#d-206-essence-capture-移到第二階段v1-的教材直接附給-ai)）；錯題照片仍由 Cards 分析（D-061）。
- Cards 不依賴 Capture：筆記帶有交接資訊就使用，沒有也能運作。

和心智圖外掛對接的做法 💡（助理提案；[D-056](decisions.md#d-056-保留和心智圖外掛對接的彈性)）。使用者 2026-10-11 決定：細節列入未來的專門討論（[Essence Mindboard](../plugins/mindboard/docs/backlog.md)）；用區塊 ID 連結學習目標的方式已同意，並寫進使用說明書（D-048 補充）：

- **用檔案對接，不用程式綁在一起**：和 Capture 一樣，各自安裝、各自可用。心智圖外掛直接讀 vault 裡的卡組筆記和複習紀錄。
- **v1 只要做到三件事，幾乎不增加工作**：
  - 學習目標 ID 寫成 Obsidian 原生的區塊 ID（[舊外掛分析 §7-4](../plugins/cards/docs/research/old-flashcard-plugin.md#7-4-id-的字元與位置) 已經這樣建議）。這樣心智圖的節點、Canvas、一般筆記都能用 `[[卡組#^k3m9x2]]` 連到學習目標。
    - 連結可以自訂顯示文字：`[[卡組#^k3m9x2|密度]]` 顯示「密度」，同一個 ID 在不同筆記、不同節點可以顯示不同文字。嵌入 `![[卡組#^k3m9x2]]` 則顯示原文，包括答案，適合閱讀，不適合拿來複習。心智圖外掛也可以只把 ID 當連結，畫面怎麼呈現由外掛決定。
    - 已知限制：學習目標搬到另一篇卡組時，Obsidian 不會更新寫著舊檔名的連結。對策：ID 在整個 vault 不重複（D-034），外掛用 ID 找學習目標，檔名只當提示；之後可以提供「修復連結」指令。目標之間的連結（第二階段）也照這個做法，修復的界線見 [D-167](decisions.md#d-167-學習目標的連結與整理)。
    - 清單項目加上區塊 ID 後，嵌入時子項目的縮排是否正常，在複習畫面原型一起實測。
  - 卡組語法與複習紀錄格式（D-035）寫進使用說明書（D-048），當成公開格式：之後只新增欄位，不改舊欄位的意思；讀取時忽略不認得的欄位。
  - 排程狀態本來就從複習紀錄計算（D-035），不是藏在外掛內部的資料。
- **之後再做**：
  - Cards 提供給其他外掛呼叫的介面，例如查詢某些學習目標的記憶狀態、只複習某幾個目標。這樣心智圖外掛不必自己實作 FSRS。
  - 心智圖上的提取練習（挖掉節點）要和卡片共用排程的話，也透過這個介面寫入複習紀錄，Cards 仍是唯一寫入紀錄的程式。
  - 依記憶狀態上色（2026-10-11 使用者喜歡這個概念，也想放進儀表板）：顏色由 FSRS 算出的記憶保持率決定，例如綠＝記得、黃＝快忘了、紅＝很可能忘了、灰＝還沒學。心智圖外掛和儀表板用同一套算法；配色和複習卡片的自評按鈕一致（[D-060](decisions.md#d-060-記憶狀態的配色一致)）。
- **例子**：一張「第二章 物質的基本性質」心智圖，「密度」節點連到 `2-1 質量與密度的測量（卡片）#^k3m9x2`；節點依記憶狀態上色，點一下就只複習這一區的卡。

## 4. 平台與裝置 ✅

搬到 Cards 的[〈4. 平台與裝置 ✅〉](../plugins/cards/docs/architecture.md#4-平台與裝置-)（D-208 第二步）。

## 5. 資料存放 ✅（第 6 步）

搬到 Cards 的[〈5. 資料存放 ✅（第 6 步）〉](../plugins/cards/docs/architecture.md#5-資料存放-第-6-步)（D-208 第二步）。

## 6. AI 的位置 ✅（細節之後專門討論）

搬到 Cards 的[〈6. AI 的位置 ✅（細節之後專門討論）〉](../plugins/cards/docs/architecture.md#6-ai-的位置-細節之後專門討論)（D-208 第二步）。

## 7. 製卡規則 ✅

搬到 Cards 的[〈7. 製卡規則 ✅〉](../plugins/cards/docs/architecture.md#7-製卡規則-)（D-208 第二步）。

## 8. 整條鏈的分工 ✅

搬到 Cards 的[〈8. 整條鏈的分工 ✅〉](../plugins/cards/docs/architecture.md#8-整條鏈的分工-)（D-208 第二步）。

## 9. repo 結構 ✅（D-208）

三個外掛（Cards、Capture、Mindboard）在同一個 repo 開發（[D-208](decisions.md#d-208-三個外掛在同一個-repo-開發每個外掛有自己的資料夾)）。最上層放三個外掛共用的東西，每個外掛在 `plugins/<外掛>/` 有自己的規則、文件與程式。各自安裝、各自可用（[D-006](decisions.md#d-006-兩個獨立外掛)），程式不互相 import（`tools/check-plugin-imports.ts` 擋）。

分兩步做完：第一步（2026-11，新外掛寫程式前）建好 Capture、Mindboard 的資料夾與分開檢查；第二步把 Cards 也搬進 `plugins/cards/`，分 A（程式）與 B（文件）兩次合併。

```text
Essence/                         GitHub 的 repo 與本機資料夾（2026-11-18 都改名，D-211）
├─ AGENTS.md、CLAUDE.md          全專案的底線與協作規則
├─ README.md                     Essence 的入口：三個外掛各一行
├─ .claude/、.agents/            權限、hook、skill（三個外掛共用）
├─ .githooks/、.github/          commit 與 CI：照分派表只檢查改到的對象
├─ docs/                         三個外掛共用：本檔（定位、接點、repo 結構）、轉錄稿格式（transcript.md）、
│                                產品定義的共用部分、decisions.md、progress-map.md、roadmap 與 backlog 的入口、
│                                agents/、ai-models.md、archive/，以及跨外掛的 plans/、tasks/、Claude Codex Discussion/（D-213）
├─ experiments/                  試作場
├─ tools/                        共用的檢查、分派表、hook 與 CI gate 的邏輯、進度網頁，與它們的測試（tools/tests/）；
│                                有自己的 package.json
└─ plugins/
   ├─ cards/                     AGENTS.md、CLAUDE.md、README.md、src/、tests/、tools/（建置、安裝、備份還原等）、
   │                             manifest.json、package.json 與鎖檔、設定檔；
   │                             docs/（product、architecture、roadmap、backlog、syntax、question-types、
   │                             card-rules/、plans/、research/、tasks/、Claude Codex Discussion/）
   ├─ capture/                   AGENTS.md、CLAUDE.md、package.json 與鎖檔、.gitignore、docs/backlog.md
   └─ mindboard/                 同上（沒有 .gitignore）
```

Capture、Mindboard 的 `docs/` 與裡面的資料夾，第一份文件出現才建，結構照 Cards。

### 每一類放哪裡

原本在 `AGENTS.md`〈文件分工〉的表搬到這裡。「外掛」指 `plugins/<外掛>/`。這裡只寫放在哪個資料夾；每類文件的用途、什麼時候進來、狀態行與終點，以及「來自」「→」怎麼連，見[工作流程規範](agents/workflow.md)（[D-214](decisions.md#d-214-工作流程一件事一個現在位置反方向由工具算) 第 1 點）。

| 內容 | 位置 |
|---|---|
| 底線與協作規則 | `AGENTS.md`（`CLAUDE.md` 只有一行 `@AGENTS.md`）；外掛特有的在外掛的 `AGENTS.md` |
| 為什麼做、為誰做、原則、範圍（v1／第二階段／不做） | 最上層 `docs/product.md` 放北極星、三個外掛的目標使用者與全專案的原則；其餘在外掛的 `docs/product.md` |
| 三個外掛的定位、關係與接點；repo 結構 | 本檔 |
| 術語、概念模型、平台、資料存放、AI 的位置、製卡規則、整條鏈的分工 | 外掛的 `docs/architecture.md`（Cards 有） |
| 轉錄稿格式：Capture 寫、Cards 讀的接點 | 最上層 `docs/transcript.md`；讀它的外掛登錄在分派表 |
| 出題語法與資料格式：卡組筆記、錯題本、考試範圍、複習紀錄、AI 輸出快照怎麼寫 | 外掛的 `docs/syntax.md`（Cards 有） |
| 題型專區：有哪些題型、各自適合練什麼、怎麼接上 | 外掛的 `docs/question-types.md`（Cards 有） |
| 交給 AI 的製卡規則（未來外掛的內建預設） | 外掛的 `docs/card-rules/`（Cards 有） |
| 已確認的決定與理由（D-ID）；開頭有索引 | 最上層 `docs/decisions.md`，一份、編號接續；狀態行下一行寫適用的外掛 |
| 開發現況、下一步、路線圖、最近完成的事 | 最上層 `docs/roadmap.md` 是入口，只放跨外掛的列；外掛的 `docs/roadmap.md`，建了就要從入口的〈現在在哪裡〉連過去（文件檢查會擋） |
| 任務與第二階段候選的統一入口、待決問題、技術債與已知的限制 | 最上層 `docs/backlog.md` 只放跨外掛的（共用工具、repo 結構）；其餘在外掛的 `docs/backlog.md` |
| 展開的主題細項規畫：一主題一份，從 backlog 引用，命名與維護見[該目錄 README](plans/README.md) | 跨外掛的在最上層 `docs/plans/`，其餘在外掛的 `docs/plans/` |
| 參考軟體研究 | 外掛的 `docs/research/` |
| 現在推薦的 AI 服務與模型；新模型推出時更新 | 最上層 `docs/ai-models.md` |
| 程式品質的專案設定：檢查指令、高風險範圍、卡關時的升級 | 最上層 `docs/agents/`；分派表 `tools/dispatch.ts` |
| 功能地圖 | 最上層 `docs/progress-map.md` |
| 討論紀錄、v0 規劃（已取代）、路線圖較舊的已完成紀錄 | 最上層 `docs/archive/` |
| 交給實作或查核的任務說明與審查請求；標題下第一行寫狀態行（[寫法](agents/workflow.md#入口的狀態行)） | 跨外掛的在最上層 `docs/tasks/`，其餘在外掛的 `docs/tasks/`（[D-213](decisions.md#d-213-任務與討論稿放進-docs外掛專用的放外掛的-docs)） |
| Claude 與 Codex 的討論稿，一個議題一份 `YYYY-MM-DD-主題.md`；只在處理該議題時讀 | 跨外掛的在最上層 `docs/Claude Codex Discussion/`，其餘在外掛的 `docs/Claude Codex Discussion/`（D-213） |
| 試作場：樣式稿、試作外掛與測試結果 | 最上層 `experiments/` |
| 程式、測試與開發工具（[D-110](decisions.md#d-110-v1-外掛的程式結構)） | 外掛的 `src/`、`tests/`、`tools/`；共用的檢查與它們的測試在最上層 `tools/`（自己的 `package.json`） |

### 新文件放哪裡

- 只和一個外掛有關，放那個外掛的資料夾；兩個以上或全專案的，放最上層。兩邊都有或判不出的，留最上層。同一類資訊只放一處，其他地方用連結（[D-141](decisions.md#d-141-文件架構入口只放狀態同一類資訊只維護一份)）。
- 外掛的 `docs/` 與裡面的資料夾，第一份文件出現才建。任務與討論稿一律在 `docs/` 底下；最上層或外掛根目錄的 `tasks/`、`Claude Codex Discussion/` 文件檢查會擋（[D-213](decisions.md#d-213-任務與討論稿放進-docs外掛專用的放外掛的-docs)）。
- 決定一律寫進最上層的 `decisions.md`。
- 已完成的任務、討論稿與規畫不搬（[D-143](decisions.md#d-143-歸檔原則每類文件都有終點不設字數上限)）；D-208 第 9 點的例外只限遷移任務列出的路徑。

### commit 與 CI 怎麼檢查

分派表 `tools/dispatch.ts` 照改到的路徑決定檢查誰，commit 與 CI 讀同一份：

檢查的對象是共用工具（`tools/` 自己的型別、lint、knip 與 `tools/tests/`）與三個外掛：

- 只改 `plugins/<外掛>/`，就只裝、只檢查那個外掛。
- 改到兩個外掛都讀的規格（登錄在分派表，現在是轉錄稿格式 `docs/transcript.md`），讀它的外掛都檢查。
- 改到 Cards 的文件，commit 只跑寫到那個檔的測試，CI 跑 Cards 的完整檢查；寫到那個檔的共用工具測試也跑。
- 改到其他共用工具（文件檢查、進度白板、Codex 包裝、雲端的 hook 等），只跑共用工具的完整檢查。
- 改到決定檢查怎麼啟動、怎麼跑的檔（hook、CI、分派表與它們用到的工具），或判斷不了的路徑，共用工具與三個外掛都檢查。

文件、金鑰、本機路徑、skill 一致、外掛之間不 import 與 roadmap 讀得出來這幾項共用檢查每次都跑，只要在 `tools/` 裝過。commit 時外掛的檢查在只有暫存內容的副本跑，讀到的就是要 commit 的內容。CI 最後的 gate 分得出「照表跳過」與「漏跑」。細節見 [quality.md〈檢查指令〉](agents/quality.md#檢查指令)。
