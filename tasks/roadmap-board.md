# 開發進度白板（給 Claude，本機執行）

狀態：進行中

遵守 repo 根目錄的 `AGENTS.md`。建議模型與推理等級：**Opus、高**。只讀 roadmap、輸出一頁網頁，不碰使用者資料與外掛程式，不在 [quality.md](../docs/agents/quality.md#高風險範圍要做-l2) 的高風險範圍，做 L1。

依據：使用者 2026-11-16 選擇用程式從 roadmap 產生一頁進度白板，主要在手機上看；[D-141](../docs/decisions.md#d-141-文件架構入口只放狀態同一類資訊只維護一份)（roadmap 是唯一來源）、[D-179](../docs/decisions.md#d-179-介面的每一項都要有必要性非必要不出現)（每一項都要必要）。前例：`tools/progress-board.ts`（從 [progress-map.md](../docs/progress-map.md) 產生功能地圖）。

## 和「不做」比較（D-153）

- **不做會怎樣**：「現在在哪裡」的表有五欄、一格常超過 200 字，手機上要左右捲才看得到「等誰」；想知道現在卡在誰，要請 AI 讀 roadmap 再摘要，每次都花 token。
- **做的代價**：多一支約 250 行的產生程式與測試；roadmap 的節名或欄名改了要跟著改程式（產生時會報出行號，不會默默錯）。

## 範圍

- `tools/roadmap-board.ts`：讀 `docs/roadmap.md` 的「現在在哪裡」與「已完成」兩張表，輸出 `_site/roadmap.html`（`_site/` 在 `.gitignore`）；本機預覽 `npm run roadmap-board`。
- 發布：接進既有的 `.github/workflows/progress-board.yml`，和功能地圖同一站：<https://kuohappiness.github.io/Essence-Cards/roadmap.html>。`docs/roadmap.md` 合併進 `main` 就自動重新產生，不用手動。原本規畫發成私人 Artifact，開工後發現 repo 已有這條自動發布的路，使用者 2026-11-16 選了 GitHub Pages（repo 是公開的，roadmap 本來就公開）。連結寫在 roadmap 開頭。
- 欄位照表頭名稱找（工作、狀態、下一步、等誰；入口可以沒有），欄的順序與列數怎麼變都照樣產生。
- 頁面：最上面是正式 vault 的版本與「已合併、還沒發布」的列數，接著是「等誰」的分組標籤；每件工作只露名稱，點開才看下一步、狀態、入口。「使用者」那組寫成「等你」排第一；「等觸發點」與「觸發點」算同一組。最近完成露 5 列，其餘收起來。
- 衍生的資料（roadmap 沒有專門的欄）：
  - 正式 vault 版本：「正式使用的 vault 現在是 `x`（日期」那句；沒有就用已完成裡最新一列「升正式版 `x`」。
  - 已合併、還沒發布：已完成裡比最新一列「升正式版」新、而且寫到 `main` 的列。
- 連結：相對路徑改成 GitHub 上 `main` 的網址，roadmap 內的錨點接到 roadmap 的網址，其他（`file:`、絕對路徑）只留文字。頁面帶出本機路徑或電子郵件就不產生。
- 不改 `docs/archive/v0-planning/board/` 與既有的 `tools/progress-board*.ts`（只引用它的配色與 `escape`）。

## 驗收

- `npm run check` 通過；`tests/roadmap-board.test.ts` 涵蓋：格子裡的 `\|`、反引號、連結（上一層、有空白、錨點、`file:`）、欄的順序換了、少了必要的欄、沒跳脫的 `|` 讓整列多格時報出行號、版本的兩個來源、已合併還沒發布、等誰的分組。
- 用真的 roadmap 產生，手機寬度（375px）沒有橫向捲動；發布前給使用者看一次畫面（2026-11-16 使用者看過，可以）。
- 合併後 GitHub Actions 的 Progress board 跑成功，網址打得開。

## 結果

延後的測試：無

- `tools/roadmap-board.ts`、`tests/roadmap-board.test.ts`（11 項）、`npm run roadmap-board`；接進 `.github/workflows/progress-board.yml`，roadmap 開頭加了白板的連結。
- 本機檢查（worktree，2026-11-16）：typecheck、lint、knip、secretlint、local-paths、skills、docs 都通過；`npm test` 2683 項中 2680 通過。沒過的 3 項和這次改動無關：`build.test.ts` 的兩項 D-148 是機器記憶體不足讓建置當掉，單獨重跑通過；`deck.test.ts` 的 §2-2 是這個 worktree 用 CRLF 取出 `docs/syntax.md`（`core.autocrlf=true`），測試讀到 ``。
- 衍生資料的寫法（roadmap 沒有專門的欄）：「已合併、還沒發布」靠已完成的列寫到 `main`、而且排在最新一次「升正式版」之上；正式 vault 版本靠「正式使用的 vault 現在是 `x`（日期」那句。roadmap 換了寫法，白板會少算，不會報錯。
