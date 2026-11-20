# Essence｜跨外掛的 backlog

更新：2026-11-20｜狀態：三個外掛共用的部分；2026-11-20 拆開（[D-208](decisions.md#d-208-三個外掛在同一個-repo-開發每個外掛有自己的資料夾) 第 8 點，第二步 B）：這裡只放共用工具的技術債與已知的限制、repo 結構；Cards 的任務、技術債、待決問題與第二階段清單搬到 [Cards 的 backlog](../plugins/cards/docs/backlog.md)。搬走的每一節留標題與一行轉往新頁。

收錄不等於採用。每項保留原意與來源；談定後寫進[決策紀錄](decisions.md)並從這裡移除，定案但還沒做的任務留一行連到 D-ID，內容以決策紀錄為準；任務與技術債做完就移除（[D-143](decisions.md#d-143-歸檔原則每類文件都有終點不設字數上限)）。

## v1 需要做的任務

搬到 Cards 的[〈v1 需要做的任務〉](../plugins/cards/docs/backlog.md#v1-需要做的任務)（D-208 第二步）。跨外掛的技術債與已知的限制留在這裡（下面兩節）。

## 技術債

共用工具（最上層 `tools/`、分派表、hook 與 CI）與 repo 結構的技術債；每個外掛的在自己的 backlog。

開始一件工作或改到相關區域前，先看這張表；觸發點到了，連同完成條件一起帶進那次工作（[D-119](decisions.md#d-119-程式品質的-skill-整併成通用的-code-quality)）。處理完刪掉那一行，修正與驗證的 commit 寫在 roadmap 的已完成。延後的測試開頭寫「補測：」、延後的功能寫「補做：」，開發空檔或額度有餘時挑來補，v1 結案前清空：補完，或使用者明確同意留到第二階段（[D-195](decisions.md#d-195-測試分兩類改不回來的做足其餘延後但不漏)）。

| 項目與影響 | 觸發點 | 完成條件 | 來源 |
|---|---|---|---|
| 外掛只改文件也跑完整檢查：`plugins/<外掛>/` 底下改任何檔（只改文件也算），commit 與 CI 都跑那個外掛的完整 `npm run check`；Capture、Mindboard 現在的檢查只印一行，不花時間 | 某個外掛的 `npm run check` 在本機超過 1 分鐘 | 替那個外掛定「相關測試」的找法與登錄方式（測試讀到哪些檔要寫得出來），分派表（`tools/dispatch.ts`）加上那個外掛的相關測試跑法與案例 | [三個外掛併進同一個 repo 第一步 §10](tasks/one-repo-step-1.md#10-技術債) |

## 已知的限制

共用工具的已知的限制；每個外掛的在自己的 backlog。

L2 找到、發生機率極低、這次不修的問題（[D-202](decisions.md#d-202-l2-的發現先估發生機率極低的記成已知的限制)）。接受它、不排時程；之後有空想修再修，修好就刪掉那一列。和技術債分開：技術債有觸發點，到點就要做。

| 限制 | 發生條件 | 影響與避開 | 來源 |
|---|---|---|---|
| 金鑰掃描的預設模式（`npm run check`、CI）讀工作樹：Git 取出檔案時的轉換會改到掃的內容 | `.gitattributes` 對含金鑰的文字檔設了 `working-tree-encoding`（例如 UTF-16）或 `filter`，而且這個 commit 沒經過 pre-commit（在 GitHub 網頁上直接改、沒裝 hook 的 clone）；這個 repo 現在只有 hook 的換行規則 | CI 讀 checkout 出來的檔，轉成 UTF-16 或被 filter 改過的金鑰對不上規則，CI 不擋。經過 pre-commit 的 commit 照常擋（`--staged` 讀索引的 blob，L2 R7）。避開：不對可能含金鑰的文字檔設編碼或 filter | [三個外掛併進同一個 repo 第一步的 L2](<Claude Codex Discussion/2026-11-18-one-repo-step-1-review.md>) R7 的同一類、這次不改的（機制和 R7 相同，推斷，沒在 CI 實測） |
| 分派表找入口相依時，區塊註解夾在 `require`／`import` 與括號或路徑之間，或區塊註解裡有不成對引號的 `from '…`，會少認那個相依 | 入口（hook、`check.yml`、外掛 scripts 叫的 `tools/` 檔）或 Cards 的測試檔這樣寫（`require /* … */ ('./x')`），之後只改它載入的下游工具或經 helper 讀的文件；現在的入口與測試都沒有這種寫法 | 該跑的外掛檢查被跳過（入口那一種 pre-commit 與 CI 都跳過；Cards 測試那一種 CI 照跑 Cards 的完整檢查）。入口那一種，`tools/tests/dispatch.test.ts` 的語法樹驗收在加入這種接線的 commit 會失敗。避開：註解不要夾在 `require(` 與路徑中間 | [三個外掛併進同一個 repo 第二步 A 的 L2](<Claude Codex Discussion/2026-11-20-one-repo-step-2-review.md>) R11（R9 修正引入；再補一條判斷就是同一類的第四代，照 D-200 不加） |
| 分派表把結尾有斜線的資料夾路徑（`require('./x/')`）旁邊同名的 `x.js` 也算成入口 | 入口這樣寫，同時有 `x/index.js` 與 `x.js`，只改 `x.js`；現在沒有這種接線 | 多跑三個外掛的檢查，不會少跑。不用避開 | [三個外掛併進同一個 repo 第二步 A 的 L2](<Claude Codex Discussion/2026-11-20-one-repo-step-2-review.md>) R12（R10 修正引入） |
| 外掛之間不 import 的檢查（`tools/check-plugin-imports.ts`）只看寫死的相對路徑：執行時才組出來的路徑、`tsconfig` 的 `paths`、打包工具的 alias、自訂 resolver 讓套件名稱指到別的外掛，都看不到 | 程式用字串組路徑再 import（`import('../../src/' + name)` 只取得到前段），或外掛設了 paths、alias、resolver | 這類跨外掛的引用不會被擋。避開：import 寫成固定的相對路徑；第一個用到 paths、alias 或 resolver 的外掛任務，把解析後不出外掛的邊界加進測試（外掛的 AGENTS.md 有寫） | [三個外掛併進同一個 repo 第一步 §6](tasks/one-repo-step-1.md#6-外掛之間不-importtoolscheck-plugin-importsts)（設計時就知道的限制，不是 L2 找到的） |

## 第二階段想做的事

搬到 Cards 的[〈第二階段想做的事〉](../plugins/cards/docs/backlog.md#第二階段想做的事)（D-208 第二步）。

## Essence Capture 與 Essence Mindboard

另外兩個外掛的工作各自一份，不和 Cards 的混在一起（使用者 2026-10-31）；和 Cards 共用的部分用連結。

| 外掛 | 目前狀態 | 清單 |
|---|---|---|
| Essence Capture | 第二階段（使用者 2026-11-16，[D-206](decisions.md#d-206-essence-capture-移到第二階段v1-的教材直接附給-ai)）：v1 的教材由家長在自己的 AI 對話附課本；開工前先找現成專案 | [查看](../plugins/capture/docs/backlog.md) |
| Essence Mindboard | 未來的第三個外掛，還沒開工；在同一個 repo 的 `plugins/mindboard/` 開發（[D-208](decisions.md#d-208-三個外掛在同一個-repo-開發每個外掛有自己的資料夾)） | [查看](../plugins/mindboard/docs/backlog.md) |

### 三個外掛併進同一個 repo

定案在 [D-208](decisions.md#d-208-三個外掛在同一個-repo-開發每個外掛有自己的資料夾)（使用者 2026-11-17），細節與驗收在決定本文：

- **第一步**：Capture 或 Mindboard 寫第一行程式之前，建 `plugins/capture/`、`plugins/mindboard/` 與分派檢查（D-208 第 5 點），合併前 L2。已合併進 `main`（2026-11-18，[PR #21](https://github.com/kuohappiness/Essence-Cards/pull/21)），結果見[任務說明](tasks/one-repo-step-1.md)。
- **轉錄稿格式**：第二步 B 就搬到最上層的 `docs/transcript.md`（使用者 2026-11-20 調整第 6 點的時機）；共用範例與相容檢查等第一個需要共同規格的 Capture 任務。
- **改名 `Essence`**：和第一步分開，各自挑停手的時段；本機資料夾先演練（第 7 點）。
- **第二步**：Cards 搬進 `plugins/cards/`，觸發點是穩定基線（第 8 點）。基線是 `0.6.0`（[上線前清單](../plugins/cards/docs/tasks/release-0.6.0.md)第五項第 10 步）；裝好之後先搬家，AI 製卡第 4、5 批（錯題補強、補記憶錨點）排在搬家之後（使用者 2026-11-18 選定。理由：第 4、5 批還沒開工，先搬家停手的代價小；先做它們，就成了要一起帶進去的功能，基線要等 `0.7.0`）。[任務說明](tasks/one-repo-step-2.md)寫好（2026-11-19）。A（程式）已合併進 `main`（2026-11-20，[PR #27](https://github.com/kuohappiness/Essence/pull/27)）；B（文件）進行中：搬檔已 commit（分支 `claude/serene-payne-bfeb06` 的 `495acf7`），驗收與 L2 進行中。

## 歷史索引

搬到 Cards 的[〈歷史索引〉](../plugins/cards/docs/backlog.md#歷史索引)（D-208 第二步）。

## 已定案對照

搬到 Cards 的[〈已定案對照〉](../plugins/cards/docs/backlog.md#已定案對照)（D-208 第二步）。
