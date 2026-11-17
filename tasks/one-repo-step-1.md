# 三個外掛同一個 repo：第一步（D-208 第 5 點，給 Claude，本機執行）

狀態：等 Codex 開工前查核（[請求](one-repo-step-1-plan-review.md)）；Claude 照回報改完這份才開工

遵守 repo 根目錄的 `AGENTS.md`。建議模型與推理等級：**Opus、高**。這一步改 pre-commit、pre-merge-commit 與 CI，也就是合併前的防線：開工前 Codex 查核這份說明，合併前做 L2（[D-208](../docs/decisions.md#d-208-三個外掛在同一個-repo-開發每個外掛有自己的資料夾) 第 5 點）。**不改 Cards 的產品程式（`src/`），不改會動到正式 vault 的工具**（安裝、更新、備份、還原、比較）。

依據：D-208 第 1、2、3、4、5、9、10 點；細節與 Codex 的驗收建議見[討論稿](<../Claude Codex Discussion/2026-11-09-one-repo-three-plugins.md>)的〈Codex 回應：第二輪〉第 2、3 題與〈修正後的提案〉。相關：[D-006](../docs/decisions.md#d-006-兩個獨立外掛)、[D-056](../docs/decisions.md#d-056-保留和心智圖外掛對接的彈性)、[D-117](../docs/decisions.md#d-117-技術債預防機械檢查全自動ai-審查只在關鍵點)（不跳過 pre-commit）、[D-141](../docs/decisions.md#d-141-文件架構入口只放狀態同一類資訊只維護一份)、[D-143](../docs/decisions.md#d-143-歸檔原則每類文件都有終點不設字數上限)、[D-195](../docs/decisions.md#d-195-測試分兩類改不回來的做足其餘延後但不漏)。

**不在這一步**：改名 `Essence`（第 7 點，另排停手時段）、轉錄稿格式搬到最上層（第 6 點，第一個需要的 Capture 任務做）、Cards 搬進 `plugins/cards/`（第 8 點，等穩定基線）、Capture 要不要回 v1（D-206，使用者另外決定）。

## 和「不做」比較（D-153）

- **不做會怎樣**：D-208 規定 Capture、Mindboard 寫第一行程式前先做這一步，不做就不能開工。硬開的話：現在的 pre-commit 只把 `src/`、`tests/`、`tools/` 與根目錄設定當程式，`plugins/` 底下的程式 commit 時只跑文件、金鑰、本機路徑三項，外掛的程式完全沒檢查；反過來要它檢查，就只能跑 Cards 的 `npm run check`（先裝根目錄約 250 個套件，再跑 2,700 多個測試），和改的東西無關。CI 也一樣，每次都從根目錄裝 Cards、跑 Cards。
- **做的代價**：
  - hook 與 CI 從「一條規則」改成照表分派，表錯了會漏查：所以下面的驗收每種情況都測，合併前 L2，跳過的與漏跑的分得出來。
  - 共用檢查的相依從根目錄搬到 `tools/` 自己的 `package.json`：合併後每個工作資料夾要在 `tools/` 跑一次 `npm ci`（hook 會說）。
  - 過渡期 `tools/` 同時放共用的與 Cards 的工具，分派表要逐檔分清；第二步 Cards 的工具搬走後只剩共用的。
  - 改到 Cards 測試會讀的共用文件（例如 `docs/decisions.md`、`docs/syntax.md`）時，即使是做 Mindboard 的對話也要裝 Cards 跑那幾個測試：這是「改到共用的輸入，受影響的外掛都要檢查」，照 D-208 本來就該這樣。

## 開工條件

- Codex 的[開工前查核](one-repo-step-1-plan-review.md)回報後，Claude 改完這份說明。
- 先看有沒有開著的分支改到 `.githooks/`、`.github/`、`tools/` 的共用工具或根目錄的 `package.json`；有的話先問使用者順序，避免兩邊一起改 hook。
- 開 worktree 與分支（例如 `claude/one-repo-step-1`），照下面的順序一個決定一個 commit：§1 → §2 → §3 → §4 → §5 → §6 → §7 → §8 → §9。

## 1. 共用檢查自己一份套件：`tools/`

- 新增 `tools/package.json`（`name: essence-tools`、`private`、`type: module`、`engines.node >=24`）與 `tools/package-lock.json`。只放共用檢查用的相依，從根目錄的 `package.json` 搬過來、根目錄刪掉：`markdown-it`、`@types/markdown-it`、`github-slugger`、`secretlint`、`@secretlint/secretlint-rule-preset-recommend`。
- **為什麼放 `tools/`**：Node 與 TypeScript 從檔案所在的資料夾往上找套件。共用的工具在 `tools/`，會先找到 `tools/node_modules`，不用裝 Cards；Cards 的工具也在 `tools/`，找不到時往上找到根目錄的 `node_modules`，照常能用。共用工具的路徑不變，AGENTS.md、quality.md、skill 裡的 `node tools/check-docs.ts --staged` 都不用改；第二步 Cards 的工具搬走後，`tools/` 本來就是共用的套件，不必再搬一次。
- **hook 的安裝入口搬到 `tools/package.json`**：根目錄的 `preprepare`、`prepare` 移過去（`preprepare` 讀的路徑改成 `../.githooks`），根目錄刪掉；外掛的 `package.json` 不設（D-208 第 5 點：子套件不重設 `core.hooksPath`）。每個人都要裝 `tools/`（hook 要用），所以入口放這裡，只改 Mindboard 的人不裝根目錄也會裝到 hook。`core.hooksPath` 的相對路徑由 Git 以工作樹的根為準，從 `tools/` 設定也一樣（下面〈平台事實〉）。
- `tools/package.json` 的 `scripts`：`check` 依序跑 `docs`、`secretlint`、`local-paths`、`skills`、`plugin-imports`（§6），各自也能單獨跑。根目錄（Cards）的 `npm run check` 內容不變，照樣跑這些共用檢查，所以 Cards 的檢查要兩邊都裝。
- `knip.jsonc`：`tools` 設成 knip 的工作區（`workspaces` 的 `"."` 與 `"tools"`），根目錄工作區的 `tools/*` 模式移過去。沒設的話 knip 會報 5 個「Unlisted dependencies」（下面〈平台事實〉）。
- 共用的工具（分派表照這份）：`check-docs.ts`、`secretlint.mjs`、`check-local-paths.ts`、`check-skill-mirror.ts`、`progress-board*.ts`、`roadmap-board.ts`，加上這次新增的 `dispatch.ts`（§2）、`ci-gate.ts`（§4）、`check-plugin-imports.ts`（§6），以及 `experiments/tools/decisions-index.mjs`。`tools/` 其餘的都是 Cards 的（`build.mjs`、`install*`、`backup.ts`、`restore.ts`、`compare*`、`update-vault.ts`、`locate.ts`、`vault-io.ts`、`node-files.ts`、`git.ts`、`exam-reminder.ts`、`bench-study.ts`、`export-compare.ts`、`knip.mjs`、`build.d.mts`）。
- 共用工具的測試這一步留在 `tests/`（Cards 的測試）：共用工具一改就分派到全部（§2），Cards 一定會跑到；第二步再跟著搬。

## 2. 分派表：`tools/dispatch.ts`

hook 與 CI 只讀這一份（D-208 第 5 點）。`tools/dispatch.ts` 不用任何 npm 套件，CI 的分派 job 與 hook 不必先安裝就能跑。

- **輸入**：一串改到的路徑。`--staged` 讀暫存區（`git diff --cached --name-only --no-renames --diff-filter=ACMRD`，和現在的 pre-commit 一樣）；`--range <base> <head>` 讀 `git diff --name-only --no-renames <base> <head>`。`--no-renames` 讓刪檔與改名都算進舊路徑，改名同時算新路徑（D-208：刪檔與跨外掛改名算新舊兩個路徑）。
- **輸出**：要檢查的對象與跑法，給 sh 讀的一行一項與給 CI 讀的 JSON；`--explain` 逐個路徑印出命中哪一條規則（給人看，也給〈第一批的紀錄〉用）。
- **對象**：共用檢查每次都跑；外掛是 `cards`、`capture`、`mindboard`。外掛有兩種跑法：
  - **完整**：在那個外掛的資料夾跑 `npm run check`（Cards 在根目錄，照現在加 dot reporter）。
  - **相關測試**：只跑那個外掛裡寫到這個路徑的測試檔，找法照現在 pre-commit 的 `grep -rlF`，加上 `src/core/ai/rules.ts` 的特例；外掛的測試檔是 `plugins/<外掛>/` 底下（不含 `node_modules`）檔名有 `.test.` 的檔，路徑在外掛裡時用相對於外掛資料夾的寫法找。找不到測試就不跑。
- **規則**（過渡期；命中多條就全部加起來；「全部」＝共用加三個外掛都完整）：

| 路徑 | 對象 |
|---|---|
| `plugins/<外掛>/` 底下的 `.md` | `<外掛>` 相關測試 |
| `plugins/<外掛>/` 底下其他的檔 | `<外掛>` 完整 |
| `plugins/` 底下不認得的資料夾，或直接放在 `plugins/` 的檔 | 全部 |
| 共用的輸入：§1 列的共用工具、`tools/package.json`、`tools/package-lock.json`、`.githooks/`、`.github/workflows/`、`.secretlintrc.json`、`.gitattributes`、`.gitignore` | 全部 |
| `docs/syntax.md`（過渡期轉錄稿格式在 §1，Capture 寫、Cards 讀） | Cards 相關測試、Capture 完整 |
| Cards 的程式與設定：`src/`、`tests/`、§1 列的 Cards 工具、`manifest.json`、根目錄的 `package.json`、`package-lock.json`、`tsconfig.json`、`eslint.config.js`、`knip.jsonc` | Cards 完整 |
| 其他的 `.md`、`docs/`、`experiments/`、`.claude/`、`.agents/` 底下的檔（含 skill） | Cards 相關測試；其他外掛的測試寫到這個路徑時，那個外掛也跑相關測試 |
| 以上都不是（例如根目錄新出現的設定檔） | 全部 |

  `.claude/`、`.agents/` 現在改到 skill 會跑 Cards 完整，改成相關測試是因為 skill 的兩份一致改由共用檢查每次都跑（§3）。
- **CI 的跑法**：CI 不花 token，把「相關測試」一律升成「完整」：根目錄（過渡期都是 Cards 的）有任何改動，Cards 照現在每次跑完整檢查，保留 `b63c1bb` 那次只改文件也紅燈的後盾；只改外掛時 Cards 不跑。
- pre-commit 與 pre-merge-commit 不再各寫一份路徑的正規式；`tests/quality.test.ts` 比對兩份相同的斷言改成兩個 hook 都呼叫分派表。

**驗收用的例子**（每一列寫成 `tests/dispatch.test.ts` 的一個案例，`--staged` 與 `--range` 兩種都測）：

| 這次改的 | pre-commit 跑 | CI 跑 |
|---|---|---|
| 新增 `plugins/mindboard/src/a.ts` | 共用、Mindboard 完整 | 共用、Mindboard |
| 改 `plugins/mindboard/docs/backlog.md`（Mindboard 沒有測試寫到它） | 共用 | 共用 |
| 改 `plugins/capture/README.md`，加新增 `plugins/mindboard/src/a.ts` | 共用、Mindboard 完整（Capture 沒有相關測試） | 共用、Mindboard |
| 改 `src/core/files.ts` | 共用、Cards 完整 | 共用、Cards |
| 改 `tools/build.mjs` | 共用、Cards 完整 | 共用、Cards |
| 改 `tools/check-docs.ts`、`tools/dispatch.ts`、`tools/package-lock.json`、`.githooks/pre-commit` 或 `.github/workflows/check.yml`（各一案） | 全部 | 全部 |
| 改 `docs/syntax.md` | 共用、Cards 寫到它的測試（現在 5 個檔）、Capture 完整 | 共用、Cards、Capture |
| 改 `docs/decisions.md` | 共用、`tests/decisions-index.test.ts` | 共用、Cards |
| 改 `docs/card-rules/english.md` | 共用、寫到它的測試加 `tests/ai-rules.test.ts` | 共用、Cards |
| 改 `docs/product.md`（沒有測試寫到它） | 共用 | 共用、Cards |
| 改 `.claude/skills/code-quality/SKILL.md` | 共用（含 skill 一致） | 共用、Cards |
| 刪 `plugins/mindboard/src/a.ts` | 共用、Mindboard 完整 | 共用、Mindboard |
| `git mv plugins/mindboard/a.ts plugins/capture/a.ts` | 共用、Mindboard 與 Capture 完整 | 共用、Mindboard、Capture |
| `git mv src/a.ts plugins/mindboard/a.ts` | 共用、Cards 與 Mindboard 完整 | 共用、Cards、Mindboard |
| 新增 `plugins/whiteboard/a.ts`，或 `plugins/a.ts` | 全部 | 全部 |
| 新增根目錄的 `foo.config.js` | 全部 | 全部 |
| 中文檔名 `plugins/mindboard/docs/規畫.md`（`core.quotepath=true` 的 repo） | 共用 | 共用 |

## 3. pre-commit 與 pre-merge-commit

**pre-commit**（`.githooks/pre-commit`）：

1. 開頭改查 `tools/node_modules`：沒有就擋下，說「先在 `tools/` 執行 `npm ci`」。不再要求根目錄的 `node_modules`。
2. 共用檢查每次都跑：`check-docs --staged`、`secretlint --staged`、`check-local-paths --staged`（照現在），加 `check-skill-mirror`（現在只在 `npm run check` 裡）與 `check-plugin-imports --staged`（§6）。
3. 照現在讀完暫存區後 `unset $(git rev-parse --local-env-vars)`，再呼叫 `node tools/dispatch.ts --staged`。
4. 每個對象：完整就在它的資料夾跑 `npm run check`；相關測試就跑找到的測試檔（Cards 照現在用 dot reporter，通過時只印一行）。要跑的外掛有相依卻沒安裝時擋下，說要在哪個資料夾執行 `npm ci`；沒有相依的外掛（現在的 Capture、Mindboard）不用安裝。
5. 最後印一行：跑了哪些、照表跳過哪些，例如「Cards：照分派表跳過（只改 plugins/mindboard/）」。跳過一定有理由，沒理由的就是漏跑，驗收要分得出來。

**pre-merge-commit**：判斷「要不要先看 CI」改用 `node tools/dispatch.ts --range <合併基點> <head>`：有任何外掛是完整就要 CI 綠燈（照現在的擋法與訊息），只有共用與相關測試就照現在放行。

## 4. CI：`.github/workflows/check.yml`

- **plan job**：`fetch-depth: 0`，決定基點後跑 `node tools/dispatch.ts --range`，把對象、跑法、理由與基點寫成 job 的輸出。基點：
  - `pull_request`：PR 的 base 與 head 的合併基點。
  - push 到 `main`：`github.event.before`；全是 0（新分支）、clone 裡找不到、或不是祖先時，跑全部。
  - push 到其他分支：和 `origin/main` 的合併基點，算整個分支改過的。不能只算這次 push 的差異：pre-merge-commit 只看分支最後一個 commit 的 CI，最後一次 push 只改 Mindboard、前一次改了 Cards 卻紅燈時，只算這次就會讓分支綠燈合併。
  - 找不到基點就跑全部，理由寫「沒有基點」。
- **shared job**：每次都跑。在 `tools/` `npm ci`（快取用 `tools/package-lock.json`），跑 `tools` 的 `npm run check`（全部檔案，不是暫存區）。
- **cards job**：plan 有 Cards 才跑。照現在：根目錄與 `tools/` 都 `npm ci`、`npm run check`、`npm run build`、`npm audit --omit=dev --audit-level=high`；`fetch-depth: 0`（比較測試要讀 tag）。
- **capture、mindboard job**：plan 有才跑。在外掛資料夾 `npm ci`（鎖檔沒有相依時跳過安裝）、`npm run check`。建置與 audit 等外掛有程式的第一個任務再加。
- **gate job**：`needs` 全部、`if: always()`，跑 `node tools/ci-gate.ts`，讀 plan 的輸出與 `toJSON(needs)`。plan 要跑的 job 一定要 `success`；plan 不跑的要是 `skipped`；plan 自己失敗、要跑的被跳過或取消、不該跑的跑了，都算失敗。在 `$GITHUB_STEP_SUMMARY` 印一張表：外掛｜跑不跑｜理由｜結果。gate 失敗，整個 workflow 就失敗（要跑的 job 被跳過時，其他 job 都綠，只有 gate 擋得到），pre-merge-commit 與 `.claude/hooks/ci-status.mjs` 照舊讀 `check.yml` 的結論，不用改。
- **`.github/workflows/progress-board.yml`**：`markdown-it` 搬到 `tools/` 之後，這裡改在 `tools/` 安裝（快取用 `tools/package-lock.json`）、直接跑 `node tools/progress-board.ts`、`node tools/roadmap-board.ts`；觸發路徑加 `plugins/*/docs/roadmap.md` 與 `tools/package-lock.json`。不改的話合併後 Pages 會壞。

## 5. 外掛的骨架

`plugins/capture/`、`plugins/mindboard/` 各放：

- `AGENTS.md`：只寫這個外掛特有的，內容照〈附錄 B〉。`CLAUDE.md` 一行 `@AGENTS.md`（Claude Code 讀的是 `CLAUDE.md`，沒有它，外掛的 AGENTS.md 不會載入）。
- `package.json`（`name: essence-capture`／`essence-mindboard`、`private`、`type: module`、`engines.node >=24`）：沒有相依；`scripts.check` 先印一行「Mindboard 還沒有程式，沒有可檢查的項目」並結束碼 0，寫程式的第一個任務換成型別、lint 與測試（〈附錄 B〉列給那個任務）。不設 `prepare`。`package-lock.json` 用 `npm install` 產生。
- `docs/backlog.md`：用 `git mv` 把 `docs/plans/capture.md`、`docs/plans/mindboard.md` 搬過來（D-208 第 9 點的一次性例外，只限這兩份）。內容與狀態行不改，只改相對連結；這兩份本來就是那個外掛的「待做與待決」，當它的 backlog 起點，之後技術債表也寫在這裡（§7）。其他資料夾（`tasks/`、`Claude Codex Discussion/`、`docs/plans/`）等第一份文件出現才建。
- Capture 另外：`plugins/capture/.gitignore` 寫 `*.pdf`（舊 `Essence-Capture` repo 的規則：課本 PDF 有版權）；舊 repo AGENTS.md 的底線（不提交 API 金鑰、PDF、課本頁面或轉錄出來的教材；測試結果放 repo 外）寫進 `plugins/capture/AGENTS.md`。
- **引用跟著改**（`git grep -n -E "plans/(capture|mindboard)\.md|\]\((capture|mindboard)\.md"` 在 2026-11-17 找到這些）：`docs/architecture.md` 第 3 節、`docs/backlog.md`（待決問題一處、〈Essence Capture 與 Essence Mindboard〉兩列）、`docs/decisions.md` D-196 的連結、`docs/plans/README.md`（兩項改成一句「Capture、Mindboard 的待做與待決已搬到各自的 `docs/backlog.md`（D-208）」）、`docs/plans/ai-and-ecosystem.md`、`docs/plans/motivation.md`、`Claude Codex Discussion/2026-10-23-future-plans-consolidation.md`、`tasks/elementary-social-sol-trial-2.md`，以及兩份互相的連結。`node tools/check-docs.ts` 通過就表示沒有漏。不留轉址的空檔：repo 外沒有連到這兩份的地方（使用者的書籤除外）。
- **舊的 `Essence-Capture` repo**（本機在 Essence Cards 旁邊的資料夾）：`AGENTS.md` 現在寫「這裡放程式」，新對話可能在那裡開始寫 Capture。改成：開發已移到 Essence Cards repo 的 `plugins/capture/`（D-208）；這個 repo 之後當 Capture 的公開 repo（放發布檔），現在不放程式。`README.md` 的「規劃、決定與進度都寫在 Essence Cards」改成同樣的意思。在那個 repo 的 `main` 直接 commit、push（只改文件）。

## 6. 外掛之間不 import：`tools/check-plugin-imports.ts`

D-208 第 10 點要機械檢查擋。現在兩個新外掛都還沒有程式，放在共用檢查做一次，兩個外掛與 Cards 都適用，不必等各自的第一個任務各設一次。

- 不用 npm 套件。掃 Git 追蹤的檔（`--staged` 讀暫存區），副檔名 `.ts`、`.tsx`、`.mts`、`.cts`、`.js`、`.jsx`、`.mjs`、`.cjs`、`.svelte`、`.vue`，不含 `node_modules`。
- 認寫死的字串：`import … from '…'`、`import '…'`、`export … from '…'`、`import('…')`、`require('…')`。
- 擋：`plugins/<外掛>/` 底下的檔，相對路徑解開後跑出 `plugins/<外掛>/`；根目錄 `src/`、`tests/`、`tools/` 的檔，相對路徑解開後進到 `plugins/`。套件名稱、`node:`、網址照常。
- 有問題時每個一行「檔案:行  目標  原因」，結束碼 1。
- 已知的限制（寫進 [backlog〈已知的限制〉](../docs/backlog.md#已知的限制)）：動態組出來的路徑認不得；註解裡的 `import '…'` 也會擋（改寫註解即可）。
- 測試 `tests/plugin-imports.test.ts`：擋的（`plugins/mindboard/src/a.ts` 引用 `../../../src/core/files.ts`、`../../capture/src/x.ts`、`../../../tools/check-docs.ts`；`src/main.ts` 引用 `../plugins/mindboard/a.ts`；`tests/x.test.ts` 用 `import('../plugins/capture/a.ts')`）；放行的（外掛裡互相引用、套件名稱、`node:fs`、`tests/check-docs.test.ts` 引用 `../tools/check-docs.ts`）。

## 7. 文件檢查：`tools/check-docs.ts`

D-208 第 4 點：只加目錄清單會漏掉 roadmap 與補測列的歸屬（Codex 第二輪第 3 題）。

- **狀態目錄**：除了 `tasks`、`Claude Codex Discussion`、`docs/plans`，`plugins/<外掛>/` 底下同樣三個目錄也要標題下第一行有狀態。
- **roadmap**：`docs/roadmap.md` 與存在的 `plugins/<外掛>/docs/roadmap.md` 都檢查「現在在哪裡」一節與「已完成」最多 10 列。外掛的 roadmap 存在時，最上層 `docs/roadmap.md` 要有連到它「現在在哪裡」的連結（D-208 第 4 點：最上層的入口連到各外掛的 roadmap）。
- **延後的測試**（D-195）：`tasks/` 的任務對最上層的 `docs/backlog.md`；`plugins/<外掛>/tasks/` 的任務對 `plugins/<外掛>/docs/backlog.md` 的技術債表，那份沒有技術債表卻寫了列名時報錯。
- `BEFORE_D195` 現在照檔名比，`plugins/mindboard/tasks/w3.md` 會被當成舊任務放過：改成只比最上層 `tasks/` 的檔。
- `countDeferred`（進度畫板的待補測數）這一步照舊只數最上層的 backlog。
- 測試：外掛的狀態目錄、外掛 roadmap 的兩項檢查、最上層沒連到外掛 roadmap、外掛任務的列名對外掛的 backlog、外掛沒有 backlog、`BEFORE_D195` 不放過外掛的同名檔。

## 8. 進度白板讀每一份 roadmap：`tools/roadmap-board.ts`

D-208 第 4 點：進度白板從各外掛的 roadmap 產生。外掛的 roadmap 由它的第一個任務建，這一步先讓白板讀得到，建了就自動出現，不用再改工具。

- 讀 `docs/roadmap.md`，加上存在的 `plugins/<外掛>/docs/roadmap.md` 的「現在在哪裡」。外掛的列在名稱前加外掛名（「Mindboard｜」），連結以那份 roadmap 的位置為準；正式 vault 的版本與「已完成」只從最上層讀（過渡期都是 Cards）。
- 測試用暫存資料夾裡自編的外掛 roadmap；手機寬度（375px）照 [roadmap-board 任務](roadmap-board.md)的驗收看一次。

## 9. 文件

- **`docs/architecture.md` 加〈9. repo 結構 ✅（D-208）〉**：使用者要的架構說明只寫這一處（D-208 第 1 點）。草稿在〈附錄 A〉，照實際做出來的名稱改。
- **`AGENTS.md`**（D-208 已定，不用另過五關）：
  - 〈開始工作前〉第一項後面加一句：「做 Capture 或 Mindboard 時，先讀 `plugins/<外掛>/AGENTS.md`。」
  - 〈文件分工〉的表搬進〈repo 結構〉，原處改成一句「每一層放什麼、新文件放哪裡，見 architecture.md〈repo 結構〉（D-208）。」，連到 `docs/architecture.md#9-repo-結構-d-208` 與 D-208。表下面的規則照留。
- **skill `essence-decision`**（`.claude/` 與 `.agents/` 兩份一起改）：第 2 步的條目格式在狀態行下一行加「適用：Cards／Capture／Mindboard／全部（可以多個）」（D-208 第 3 點）；第 5 步的「依 `AGENTS.md` 的文件分工」改成「依 architecture.md〈repo 結構〉」，第 6 步的路線圖改成「受影響的外掛的 roadmap」。
- **`docs/agents/quality.md`〈檢查指令〉**：寫 `tools/` 要先 `npm ci`、pre-commit 照分派表（連到 `tools/dispatch.ts` 與〈repo 結構〉，規則不抄第二份）、CI 的五個 job 與 gate、pre-merge-commit 的條件。
- **`docs/backlog.md`〈三個外掛併進同一個 repo〉**第一步那行改成狀態與這份的連結；〈Essence Capture 與 Essence Mindboard〉兩列連到新的 backlog。
- **`docs/roadmap.md`**：「三個外掛的 repo 架構」那一列照進度改；合併後已完成加一列。

## 驗收

1. `tests/dispatch.test.ts`：§2 的例子每一列一個案例，`--staged`（暫存 repo）與 `--range` 都測。
2. **乾淨 checkout 的 hook**（`tests/quality.test.ts` 或新的測試檔）：`git clone --no-local` 到暫存資料夾，`tools/node_modules` 連到真的那份，三個外掛的 `check` 換成寫記號檔的替身。只改 Mindboard 的情況根目錄沒有 `node_modules`（斷言不存在）；要跑 Cards 的情況放一個空的 `node_modules` 當作裝過。照 D-208 的五種情況各 commit 一次：只改 Mindboard、只改 Cards、改轉錄稿格式（`docs/syntax.md`）、刪檔、跨外掛改名；斷言跑了哪些（記號檔）、沒跑哪些、最後那行寫了跳過的理由。另測：沒有 `tools/node_modules` 時擋下；要跑 Cards 卻沒有根目錄的 `node_modules` 時擋下並說在根目錄 `npm ci`。
3. `tests/ci-gate.test.ts`：要跑的 `success`、`failure`、`cancelled`、`skipped`；不跑的 `skipped` 與跑了；plan 失敗。基點的決定也測：PR、push 到 `main` 有 `before`、`before` 全是 0、`before` 不在 clone 裡、push 到分支（和 `origin/main` 的合併基點）、沒有 `origin/main`。
4. **GitHub 上實際跑**：分支 push 後 CI 是「全部」（改到共用輸入），每個 job 都跑、gate 綠燈。再從這個分支開 5 個探針分支，各一個 commit，開 draft PR **合併到這個分支**（不是 `main`，PR 的合併基點才會是這個分支，差異只有那一個 commit）：只改 Mindboard（加一個非 `.md` 的檔）、只改 Cards（`tests/` 的一行註解）、改 `docs/syntax.md`、刪檔與跨外掛改名（這兩個 PR 合併到「只改 Mindboard」那個探針分支：一個只刪它加的檔，一個把那個檔 `git mv` 到 `plugins/capture/`）。每個 PR 的 plan 與 §2 的表一致，不跑的 job 顯示 skipped、gate 的摘要寫了理由；只改 Mindboard 那個的 log 沒有根目錄的 `npm ci`。run 的網址寫進〈結果〉，之後關掉 PR、刪探針分支。
5. Cards 的 `npm run check`（根目錄與 `tools/` 都裝）通過；`tools/` 的 `npm run check` 在**根目錄沒有 `node_modules`** 時通過。
6. knip 沒有把 `tools/` 忽略：在 `tools/` 的共用工具暫時加一個沒用到的 export，`npm run knip` 報出來，再拿掉。
7. §6、§7、§8 的測試。
8. `node tools/check-docs.ts` 通過（搬檔與引用沒漏）；`git log --follow plugins/mindboard/docs/backlog.md` 接得到搬之前的歷史。
9. Windows 本機與 CI 的 Linux 都跑過第 1～3 項的測試（本機是 Git for Windows 的 sh）。
10. 合併前 L2：新開的 Codex session，審查請求照 code-quality 的 `review.md` 寫在 `tasks/one-repo-step-1-review.md`。
11. 合併後：主資料夾與每個 worktree 在 `tools/` 跑一次 `npm ci`；Pages 的 Progress board 跑成功、兩個網址打得開。

## 平台事實

送 L2 之前跑完；跑不了的標待驗，寫進審查請求的〈驗證方式〉（code-quality〈寫規格〉）。

| 假設 | 探針與環境 | 結果 |
|---|---|---|
| 共用相依搬到 `tools/package.json` 後，Cards 的型別與 lint 照常通過，共用檢查不靠根目錄的 `node_modules` 也能跑 | 2026-11-17 Claude 在暫存複本（Linux、Node 22.23、npm 10.9、`main` 的 `6bfdad9`）：搬 5 個相依、兩邊各 `npm install`；`tsc`、`eslint` 通過；拿掉根目錄 `node_modules` 後 `check-docs`、`secretlint`、`check-local-paths`、`check-skill-mirror`、`decisions-index` 都能跑 | 通過；Windows 待驗 |
| knip 要把 `tools` 設成工作區 | 同上：沒設時報 5 個 Unlisted dependencies（`markdown-it` 三處、`github-slugger`、`secretlint`）；`knip.jsonc` 寫 `workspaces` 的 `"."` 與 `"tools"` 後通過（knip 6.42.1，沒用 npm workspaces 也認） | 通過；第 6 項驗收另驗沒有漏抓 |
| 只有一個測試要改 | 同上，跑 `check-docs`、`quality`、`local-paths`、`progress-board`、`roadmap-board`、`decisions-index`、`block-dangerous-git` 的測試：只有 `quality.test.ts` 的「D-141 每次 commit 都跑文件檢查」失敗（它把根目錄的 `node_modules` 連進暫存 repo，要改成連 `tools/node_modules`） | 已知；`tests/` 其餘的測試沒跑 |
| 從子資料夾執行 `git config core.hooksPath .githooks`，hook 照樣從工作樹的根執行 | 2026-11-17 暫存 repo（Linux、Git）：在 `tools/` 設定，從 `plugins/mb/` commit，hook 有跑 | 通過；Git for Windows 待驗 |
| 沒有相依的 `package.json`：`npm install` 產生只有根項目的鎖檔，`npm ci` 成功、不建 `node_modules` | 同上 | 通過 |
| `actions/setup-node` 的 npm 快取遇到沒有相依的鎖檔 | 沒測 | 待驗：會警告就不設快取 |
| 跳過的 job 在 `needs` 裡是 `skipped`；`pull_request` 合併到非預設分支也會觸發；新分支第一次 push 的 `before` 是全 0 | GitHub 文件；驗收第 4 項實測 | 待驗 |

## 結果

延後的測試：（實作後填）

## 第一批的紀錄

D-208 第 5 點：第二步（Cards 搬家）開工前，用這些紀錄核對做法。從第一步合併起，到第二步寫任務說明為止，做 Capture、Mindboard、Cards 或跨外掛工作的對話，遇到下面三種事就在這裡加一列；外掛的 AGENTS.md 會提醒。第一步本身記第一列（Capture 從沒設過的檢查，這次一次到位）。

- **一起改的檔案**：一件任務或一個 commit 同時改到兩個以上外掛，或外掛加最上層共用的（`node tools/dispatch.ts --range <base> <head> --explain` 列得出來）。記哪幾個檔、為什麼要一起改、分開的 repo 會要幾個 commit 或 PR。
- **共用檢查省下的步驟**：共用的工具、hook、skill 改一次三個外掛都生效；新外掛不用另外設的檢查。記省了什麼。
- **共用資料夾帶來的衝突**：push 被拒、`main` 上的文件撞到（`decisions.md` 編號、roadmap 同一列）、別的外掛的檢查擋到自己、worktree 或本機資料夾撞到。記花了多少時間或 token 解決。

| 日期 | 種類 | 發生了什麼 | 省下或花掉 | 出處 |
|---|---|---|---|---|

## 附錄 A：〈repo 結構〉的草稿

放在 `docs/architecture.md` 第 8 節之後；檔名、指令照實際做出來的改。連結以 `docs/` 為基準，所以放在程式碼框裡（不然這份的文件檢查會報連結找不到）。

````markdown
## 9. repo 結構 ✅（D-208）

三個外掛（Cards、Capture、Mindboard）在同一個 repo 開發（[D-208](decisions.md#d-208-三個外掛在同一個-repo-開發每個外掛有自己的資料夾)）。最上層放三個外掛共用的東西，每個外掛在 `plugins/<外掛>/` 有自己的規則、文件與程式。各自安裝、各自可用（[D-006](decisions.md#d-006-兩個獨立外掛)），程式不互相 import。

分兩步：第一步（2026-11，新外掛寫程式前）建好 Capture、Mindboard 的資料夾與分開檢查；第二步等 Cards 有穩定的基線，把 Cards 也搬進 `plugins/cards/`。現在在兩步之間，所以有兩張圖。

### 現在（第一步之後）

```text
Essence-Cards/
├─ AGENTS.md、CLAUDE.md          全專案的底線與協作規則
├─ .claude/、.agents/            權限、hook、skill（三個外掛共用）
├─ .githooks/、.github/          commit 與 CI：照分派表只檢查改到的外掛
├─ docs/                         共用的文件，加上 Cards 自己的（第二步搬走）
├─ tasks/、Claude Codex Discussion/   跨外掛的，加上 Cards 的（第二步搬走）
├─ experiments/                  試作場
├─ tools/                        共用的檢查（有自己的 package.json），加上 Cards 的工具（第二步搬走）
├─ src/、tests/、manifest.json、package.json   Cards 的程式（第二步搬走）
└─ plugins/
   ├─ capture/                   AGENTS.md、package.json、docs/backlog.md
   └─ mindboard/                 同上
```

### 目標（第二步之後）

```text
Essence/                         repo 與本機資料夾改名（另排時段，D-208 第 7 點）
├─ AGENTS.md、CLAUDE.md、README.md
├─ .claude/、.agents/、.githooks/、.github/
├─ docs/                         三個外掛共用：本檔（定位、接點、repo 結構）、轉錄稿格式、decisions.md、
│                                progress-map.md、roadmap 的入口、agents/、ai-models.md、archive/
├─ tasks/、Claude Codex Discussion/   只放跨外掛的
├─ experiments/
├─ tools/                        跨外掛的檢查與進度網頁
└─ plugins/
   ├─ cards/                     AGENTS.md、package.json、manifest.json、src/、tests/、tools/、
   │                             docs/（product、architecture、roadmap、backlog、syntax、question-types、
   │                             card-rules、plans、research）、tasks/、Claude Codex Discussion/
   ├─ capture/                   結構同上
   └─ mindboard/                 結構同上
```

### 每一類放哪裡

| 內容 | 現在 | 目標 |
|---|---|---|
| 底線與協作規則 | `AGENTS.md`；外掛特有的在 `plugins/<外掛>/AGENTS.md` | 同左 |
| 為什麼做、為誰做、範圍 | `docs/product.md`（Cards） | 各外掛的 `docs/product.md` |
| 術語、模組、平台、資料存放 | 本檔第 1～8 節（Cards；第 3 節含三個外掛的分工） | 最上層只留三個外掛的定位、接點與本節，其餘到 Cards |
| 出題語法與資料格式 | `docs/syntax.md`；§1 轉錄稿是 Capture 寫、Cards 讀的接點 | 轉錄稿格式在最上層 `docs/`（第一個需要的 Capture 任務搬，D-208 第 6 點），其餘到 Cards |
| 題型、製卡規則 | `docs/question-types.md`、`docs/card-rules/` | Cards |
| 決定 | `docs/decisions.md`，一份、編號接續；狀態行下一行寫適用的外掛 | 同左 |
| 現況與下一步 | `docs/roadmap.md`（Cards 與跨外掛）；外掛的 `docs/roadmap.md`（建了就要從最上層連過去） | 最上層的入口，加上每個外掛一份 |
| 任務、點子、技術債 | `docs/backlog.md`（Cards 與跨外掛）；外掛的 `docs/backlog.md` | 每個外掛一份 |
| 主題規畫、參考軟體研究 | `docs/plans/`、`docs/research/`（Cards）；外掛的同名資料夾 | 各外掛 |
| AI 模型、程式品質與檢查 | `docs/ai-models.md`、`docs/agents/`；分派表 `tools/dispatch.ts` | 最上層 |
| 功能地圖 | `docs/progress-map.md` | 最上層 |
| 舊紀錄 | `docs/archive/` | 最上層 |
| 任務說明、Claude 與 Codex 的討論稿 | `tasks/`、`Claude Codex Discussion/`（Cards 與跨外掛）；外掛的同名資料夾 | 跨外掛的在最上層，其餘各外掛 |
| 試作場 | `experiments/` | 最上層 |
| 程式、測試、建置與安裝工具 | Cards：`src/`、`tests/`、`tools/` 的 Cards 工具；其他外掛在自己的資料夾 | 各外掛 |

### 新文件放哪裡

- 只和一個外掛有關，放那個外掛的資料夾；兩個以上或全專案的，放最上層。同一類資訊只放一處，其他地方用連結（[D-141](decisions.md#d-141-文件架構入口只放狀態同一類資訊只維護一份)）。
- 外掛的 `docs/`、`tasks/`、`Claude Codex Discussion/` 等第一份文件出現才建。
- 決定一律寫進最上層的 `decisions.md`。
- 已完成的任務、討論稿與規畫不搬（[D-143](decisions.md#d-143-歸檔原則每類文件都有終點不設字數上限)）；D-208 第 9 點的例外只限遷移任務列出的路徑。

### commit 與 CI 怎麼檢查

分派表 `tools/dispatch.ts` 照改到的路徑決定檢查誰：只改一個外掛，就只裝、只檢查它；改到共用的工具、hook、CI，或判斷不了的路徑，三個外掛都檢查。文件、金鑰、本機路徑、skill 一致與外掛之間不 import 這幾項共用檢查每次都跑，只要在 `tools/` 裝過。細節見 [quality.md〈檢查指令〉](agents/quality.md#檢查指令)。
````

## 附錄 B：外掛的 AGENTS.md

照這個寫，兩份只差名稱與定位（Capture 加上〈§5〉的底線）。

````markdown
# Essence Mindboard 協作規則

最上層的 `AGENTS.md` 一體適用；這裡只寫 Mindboard 特有的。repo 的結構與每一層放什麼見最上層 `docs/architecture.md`〈repo 結構〉。

- **是什麼**：把知識架構視覺化的 Obsidian 外掛（D-076）；和 Cards 各自安裝、各自可用（D-006），Cards 保留對接的彈性（D-056）。
- **開工先讀**：`plugins/mindboard/docs/roadmap.md` 的〈現在在哪裡〉；還沒有 roadmap 時讀 `plugins/mindboard/docs/backlog.md`。（路徑都從 repo 的根寫起，免得和最上層的 `docs/` 搞混。）
- **文件放這個資料夾**：`plugins/mindboard/` 底下的 `docs/`、`tasks/`、`Claude Codex Discussion/`，第一份文件出現才建；和別的外掛共用的放最上層。建了 `plugins/mindboard/docs/roadmap.md` 就從最上層的 `docs/roadmap.md` 連過來（文件檢查會擋）。決定寫進最上層的 `docs/decisions.md`，狀態行下一行寫「適用：Mindboard」。
- **程式**：不 import 其他外掛與最上層的程式（D-208 第 10 點，`tools/check-plugin-imports.ts` 擋）。在這個資料夾 `npm ci`、`npm run check`；commit 時 hook 照分派表自動跑。
- **寫程式的第一個任務要一起做**：`npm run check` 換成型別、lint 與測試；建置產物加進 `.gitignore`；CI 的 job 加上建置與相依稽核；測試要讀文件時在測試裡寫出路徑（分派表才找得到）。
- **第一批的紀錄**：遇到一起改的檔案、共用檢查省下的步驟、共用資料夾帶來的衝突，寫進最上層 `tasks/one-repo-step-1.md`〈第一批的紀錄〉（D-208 第 5 點）。
````
