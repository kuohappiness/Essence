# 三個外掛同一個 repo：第一步（D-208 第 5 點，給 Claude，本機執行）

狀態：已合併進 `main`（2026-11-18，[PR #21](https://github.com/kuohappiness/Essence-Cards/pull/21)，`16cef58`；合併後的步驟見〈結果〉驗收第 14 項。Codex L2 四輪：R1～R9 都處理了，R3 記成已知的限制，其餘修了；[審查請求](one-repo-step-1-review.md)；[報告與回應](<../Claude Codex Discussion/2026-11-18-one-repo-step-1-review.md>)；開工前 Codex 查核過一輪，Claude 照回報改完：[報告與回應](<../Claude Codex Discussion/2026-11-17-one-repo-step-1-plan-review.md>)）

遵守 repo 根目錄的 `AGENTS.md`。建議模型與推理等級：**Opus、高**。這一步改 pre-commit、pre-merge-commit 與 CI，也就是合併前的防線：合併前做 L2（[D-208](../docs/decisions.md#d-208-三個外掛在同一個-repo-開發每個外掛有自己的資料夾) 第 5 點）。**不改 Cards 的產品程式（`src/`），不改會動到正式 vault 的工具**（安裝、更新、備份、還原、比較）。

依據：D-208 第 1、2、3、4、5、9、10 點；細節與 Codex 的驗收建議見[討論稿](<../Claude Codex Discussion/2026-11-09-one-repo-three-plugins.md>)的〈Codex 回應：第二輪〉第 2、3 題與〈修正後的提案〉，以及[開工前查核](<../Claude Codex Discussion/2026-11-17-one-repo-step-1-plan-review.md>)（下面寫「查核第 n 題」）。相關：[D-006](../docs/decisions.md#d-006-兩個獨立外掛)、[D-056](../docs/decisions.md#d-056-保留和心智圖外掛對接的彈性)、[D-117](../docs/decisions.md#d-117-技術債預防機械檢查全自動ai-審查只在關鍵點)（不跳過 pre-commit）、[D-141](../docs/decisions.md#d-141-文件架構入口只放狀態同一類資訊只維護一份)、[D-143](../docs/decisions.md#d-143-歸檔原則每類文件都有終點不設字數上限)、[D-195](../docs/decisions.md#d-195-測試分兩類改不回來的做足其餘延後但不漏)。

**不在這一步**：改名 `Essence`（第 7 點，另排停手時段）、轉錄稿格式搬到最上層（第 6 點，第一個需要的 Capture 任務做）、Cards 搬進 `plugins/cards/`（第 8 點，等穩定基線）、Capture 要不要回 v1（D-206，使用者另外決定）。

## 和「不做」比較（D-153）

- **不做會怎樣**：D-208 規定 Capture、Mindboard 寫第一行程式前先做這一步，不做就不能開工。硬開的話：現在的 pre-commit 只把 `src/`、`tests/`、`tools/` 與根目錄設定當程式，`plugins/` 底下的程式 commit 時只跑文件、金鑰、本機路徑三項，外掛的程式完全沒檢查；反過來要它檢查，就只能跑 Cards 的 `npm run check`（先裝根目錄約 250 個套件，再跑 2,700 多個測試），和改的東西無關。CI 也一樣，每次都從根目錄裝 Cards、跑 Cards。
- **做的代價**：
  - hook 與 CI 從「一條規則」改成照表分派，表錯了會漏查：所以下面的驗收每種情況都測，合併前 L2，跳過的與漏跑的分得出來。
  - 共用檢查的相依從根目錄搬到 `tools/` 自己的 `package.json`：合併後每個工作資料夾要在 `tools/` 跑一次 `npm ci`（hook 會說）。
  - 過渡期 `tools/` 同時放共用的與 Cards 的工具，分派表要逐檔分清；第二步 Cards 的工具搬走後只剩共用的。
  - 改到 Cards 測試會讀的共用文件（例如 `docs/decisions.md`、`docs/syntax.md`）時，即使是做 Mindboard 的對話也要裝 Cards 跑那幾個測試：這是「改到共用的輸入，受影響的外掛都要檢查」，照 D-208 本來就該這樣。
  - 外掛這一步不分「相關測試」，只改外掛裡的文件也跑那個外掛的完整檢查（§2）；現在外掛沒有程式，完整檢查只印一行。
  - 合併進 `main` 時，有改動就要 CI 綠燈（§3），只改文件的分支也是；文件多半直接 commit 在 `main`，不經過合併，影響小。

## 開工條件

- 先看有沒有開著的分支改到 `.githooks/`、`.github/`、`tools/` 的共用工具或根目錄的 `package.json`；有的話先問使用者順序，避免兩邊一起改 hook。
- 開 worktree 與分支（例如 `claude/one-repo-step-1`）。一個決定一個 commit，**每個 commit 之後 hook、CI 與 Pages 都要能跑**（查核第 1 題：先搬相依、後切 CI，中間的 commit 會讓 CI 與 Pages 壞掉）：
  1. §1 的 `tools/` 套件，連同所有用到這些相依的地方（hook 開頭的安裝檢查、`check.yml` 與 `progress-board.yml` 的安裝、`knip.jsonc`、`quality.test.ts` 借相依的那一段）同一個 commit 切過去。`tools` 的 `check` 先只放已經有的檢查，§6、§8 做好時再加進去。
  2. §5 外掛的骨架與搬檔。
  3. §2 的 `tools/dispatch.ts`、§6 的 `tools/check-plugin-imports.ts`、§4 的 `tools/ci-gate.ts`，各自一個 commit，還沒接上 hook 與 CI。
  4. §3 hook 改用分派表；§4 CI 改用分派表與 gate（各一個 commit）。
  5. §7、§8、§9、§10。

## 1. 共用檢查自己一份套件：`tools/`

- 新增 `tools/package.json`（`name: essence-tools`、`private`、`type: module`、`engines.node >=24`）與 `tools/package-lock.json`。只放共用檢查用的相依：從根目錄的 `package.json` 搬過來、根目錄刪掉的 `markdown-it`、`@types/markdown-it`、`github-slugger`、`secretlint`、`@secretlint/secretlint-rule-preset-recommend`，加上 §6 用的 `typescript`（根目錄的 Cards 照樣留著自己的 `typescript`）。
- **為什麼放 `tools/`**：Node 與 TypeScript 從檔案所在的資料夾往上找套件。共用的工具在 `tools/`，會先找到 `tools/node_modules`，不用裝 Cards；Cards 的工具也在 `tools/`，找不到時往上找到根目錄的 `node_modules`，照常能用。共用工具的路徑不變，AGENTS.md、quality.md、skill 裡的 `node tools/check-docs.ts --staged` 都不用改；第二步 Cards 的工具搬走後，`tools/` 本來就是共用的套件，不必再搬一次。查核第 1 題同意。
- **共用工具不靠執行時的資料夾**：npm 在 `tools/` 執行 script，`secretlint.mjs` 用 CWD 列檔、找設定，`check-local-paths.ts` 的全量模式用相對路徑，照搬只會掃到 `tools/`（查核第 1 題，Windows 已重現）。共用工具一律用 `git rev-parse --show-toplevel` 找 repo 根，列檔、讀檔、找設定都以 repo 根為準；從根目錄、`tools/`、外掛資料夾跑，結果一樣。
- **hook 的安裝入口搬到 `tools/package.json`**：根目錄的 `preprepare`、`prepare` 移過去（`preprepare` 讀的路徑改成 `../.githooks`），根目錄刪掉；外掛的 `package.json` 不設（D-208 第 5 點：子套件不重設 `core.hooksPath`）。每個人都要裝 `tools/`（hook 要用），所以入口放這裡，只改 Mindboard 的人不裝根目錄也會裝到 hook。Git 以工作樹的根解讀相對的 `core.hooksPath`，從 `tools/` 設定也一樣（〈平台事實〉）。
- `tools/package.json` 的 `scripts`：`check` 依序跑 `docs`、`secretlint`、`local-paths`、`skills`、`plugin-imports`（§6）、`roadmap-board --check`（§8），各自也能單獨跑。根目錄（Cards）的 `npm run check` 照樣跑這些共用檢查，另加 `plugin-imports`，所以 Cards 的檢查要兩邊都裝。
- `knip.jsonc`：`tools` 設成 knip 的工作區（`workspaces` 的 `"."` 與 `"tools"`），根目錄工作區的 `tools/*` 模式移過去，`tools/compare/*.ts` 等既有範圍不能少。沒設的話 knip 會報 5 個「Unlisted dependencies」（〈平台事實〉）。
- 共用的工具（分派表照這份）：`check-docs.ts`、`secretlint.mjs`、`check-local-paths.ts`、`check-skill-mirror.ts`、`progress-board*.ts`、`roadmap-board.ts`，加上這次新增的 `dispatch.ts`（§2）、`hooks.ts`（§3）、`ci-gate.ts`（§4）、`check-plugin-imports.ts`（§6），以及 `experiments/tools/decisions-index.mjs`。`tools/` 其餘的都是 Cards 的（`build.mjs`、`install*`、`backup.ts`、`restore.ts`、`compare*`、`compare/`、`update-vault.ts`、`locate.ts`、`vault-io.ts`、`node-files.ts`、`git.ts`、`exam-reminder.ts`、`bench-study.ts`、`export-compare.ts`、`knip.mjs`、`build.d.mts`）。
- 共用工具的測試這一步留在 `tests/`（Cards 的測試）：共用工具一改就分派到全部（§2），Cards 一定會跑到；第二步再跟著搬。

## 2. 分派表：`tools/dispatch.ts`

hook 與 CI 只讀這一份（D-208 第 5 點）。`tools/dispatch.ts` 不用任何 npm 套件，CI 的分派 job 與 hook 不必先安裝就能跑。

- **輸入**：`--staged` 讀暫存區，`--range <base> <head>` 比兩棵樹（合併 commit 也是兩棵樹比，不用 combined diff）。一律 `git diff --raw -z --no-renames`（暫存區加 `--cached`），**不加 `--diff-filter`**：刪檔、改名的舊路徑、型別變更（一般檔換成 symlink 的 `T`）都要算到；`-z` 拿到原本的路徑，不受 `core.quotepath` 的跳脫影響（查核第 2-3 題）。Git 讀取失敗就非零結束，不能當成「沒有改動」。
- **輸出**：JSON（對象、跑法、命中的規則、比較的端點）；`--explain` 逐個路徑印出命中哪一條（給人看，也給〈第一批的紀錄〉用）。顯示時才跳脫特殊字元。
- **對象與跑法**：共用檢查每次都跑。外掛是 `cards`、`capture`、`mindboard`：
  - **完整**：在那個外掛的資料夾跑 `npm run check`（Cards 在根目錄，照現在加 dot reporter）。
  - **相關測試**（只有 Cards）：只跑 `tests/` 裡寫到這個路徑字串的測試檔，找法照現在 pre-commit 的 `grep -rlF`，加上 `src/core/ai/rules.ts` 的特例；找不到就不跑。外掛這一步不設這種跑法，改到外掛裡任何檔都跑完整檢查：兩個外掛還沒有程式，完整檢查很便宜，現在定測試讀文件的登錄約定也沒有測試能驗（查核第 2-5 題，觸發點見 §10）。
- **規則**：照順序比，**第一條命中的算**；一次改好幾個路徑時，各路徑的結果加起來，完整蓋過相關測試；「全部」＝共用加三個外掛都完整。副檔名不分大小寫（照 `check-docs`）。

| 順序 | 路徑 | 對象 |
|---|---|---|
| 1 | Git 的 gitlink（mode `160000`，子模組） | 擋下：這個 repo 不支援子模組 |
| 2 | `plugins/capture/`、`plugins/mindboard/` 底下的檔 | 那個外掛完整 |
| 3 | `plugins/` 底下其他的檔（不認得的資料夾、直接放在 `plugins/` 的檔） | 全部 |
| 4 | 共用的輸入：§1 列的共用工具、`tools/package.json`、`tools/package-lock.json`、`.githooks/`、`.github/workflows/`、根目錄的 `.secretlintrc.json`、`.gitattributes`、`.gitignore` | 全部 |
| 5 | 共用規格（登錄表；第二步前新增兩個外掛都讀的規格，在這裡加一列）：`docs/syntax.md`（過渡期轉錄稿格式在 §1，Capture 寫、Cards 讀） | Cards 相關測試、Capture 完整 |
| 6 | Cards 的程式與設定：`src/`、`tests/`、§1 列的 Cards 工具、`manifest.json`、根目錄的 `package.json`、`package-lock.json`、`tsconfig.json`、`eslint.config.js`、`knip.jsonc` | Cards 完整 |
| 7 | `docs/`、`tasks/`、`Claude Codex Discussion/`、`experiments/`、`.claude/`、`.agents/` 底下的檔（含 skill），以及根目錄的 `.md`（`tasks/` 與 `Claude Codex Discussion/` 是施工時補的，見〈結果〉） | Cards 相關測試 |
| 8 | 以上都不是（例如根目錄新出現的設定檔） | 全部 |

  `.claude/`、`.agents/` 現在改到 skill 會跑 Cards 完整；改成相關測試，是因為 skill 的兩份一致改由共用檢查讀暫存區每次都跑（§3）。外掛的測試要讀最上層的檔，就在第 5 列登錄，不靠搜尋字串。
- **CI 的跑法**：CI 不花 token，把 Cards 的「相關測試」升成「完整」：根目錄（過渡期都是 Cards 的）有任何改動，Cards 照現在每次跑完整檢查，保留 `b63c1bb` 那次只改文件也紅燈的後盾；只改外掛時 Cards 不跑。
- pre-commit 與 pre-merge-commit 不再各寫一份路徑的正規式；`tests/quality.test.ts` 比對兩份相同的斷言改成兩個 hook 都呼叫分派表。

**驗收用的例子**（每一列寫成 `tests/dispatch.test.ts` 的一個案例，`--staged` 與 `--range` 兩種都測；只列 Cards 的測試是 2026-11-17 `main` 上寫到那個路徑的，以實際搜尋為準）：

| 這次改的 | pre-commit 跑 | CI 跑 |
|---|---|---|
| 新增 `plugins/mindboard/src/a.ts` | 共用、Mindboard | 共用、Mindboard |
| 改 `plugins/mindboard/docs/backlog.md` | 共用、Mindboard | 共用、Mindboard |
| 改 `plugins/capture/README.md`，加新增 `plugins/mindboard/src/a.ts` | 共用、Capture、Mindboard | 共用、Capture、Mindboard |
| 改 `src/core/files.ts` | 共用、Cards 完整 | 共用、Cards |
| 改 `tools/build.mjs` | 共用、Cards 完整 | 共用、Cards |
| 改 `tools/check-docs.ts`、`tools/dispatch.ts`、`tools/package-lock.json`、`.githooks/pre-commit`、`.github/workflows/check.yml` 或 `experiments/tools/decisions-index.mjs`（各一案） | 全部 | 全部 |
| 改 `docs/syntax.md` | 共用、Cards 寫到它的 5 個測試檔、Capture | 共用、Cards、Capture |
| 改 `docs/decisions.md` | 共用、`tests/decisions-index.test.ts` | 共用、Cards |
| 改 `docs/card-rules/english.md` | 共用、`tests/deck.test.ts` 與 `tests/ai-rules.test.ts` | 共用、Cards |
| 改 `docs/product.md`（沒有測試寫到它） | 共用 | 共用、Cards |
| 改根目錄的 `NOTES.MD`（大寫副檔名） | 共用 | 共用、Cards |
| 改 `.claude/skills/code-quality/SKILL.md` | 共用（含 skill 一致） | 共用、Cards |
| 刪 `plugins/mindboard/src/a.ts` | 共用、Mindboard | 共用、Mindboard |
| `git mv plugins/mindboard/a.ts plugins/capture/a.ts` | 共用、Mindboard、Capture | 共用、Mindboard、Capture |
| `git mv src/a.ts plugins/mindboard/a.ts` | 共用、Cards 完整、Mindboard | 共用、Cards、Mindboard |
| 只差大小寫的改名 `plugins/mindboard/A.ts` → `a.ts`（Windows） | 共用、Mindboard | 共用、Mindboard |
| `src/a.ts` 從一般檔換成 symlink（型別變更） | 共用、Cards 完整 | 共用、Cards |
| `git rm --cached plugins/mindboard/b.ts` 並改 `.gitignore` | 全部 | 全部 |
| 新增 `plugins/whiteboard/a.ts`，或 `plugins/a.ts` | 全部 | 全部 |
| 新增根目錄的 `foo.config.js` | 全部 | 全部 |
| 新增子模組 | 擋下 | plan 失敗 |
| 空 commit（`--allow-empty`） | 共用 | 共用 |
| 檔名有中文與空白 `plugins/mindboard/docs/規畫 草稿.md`（`core.quotepath=true` 的 repo） | 共用、Mindboard | 共用、Mindboard |
| 檔名有換行 `plugins/mindboard/a⏎b.ts`（只在 Linux 測） | 共用、Mindboard | 共用、Mindboard |

## 3. pre-commit 與 pre-merge-commit

hook 的邏輯寫成 node 程式 `tools/hooks.ts`（不用 npm 套件），`.githooks/pre-commit`、`.githooks/pre-merge-commit` 只檢查 `tools/node_modules` 再呼叫它；路徑全程用陣列傳，不經過 sh 拆字（查核第 2-3 題）。

**pre-commit**：

1. 沒有 `tools/node_modules` 就擋下，說「先在 `tools/` 執行 `npm ci`」。不再要求根目錄的 `node_modules`。
2. **在 hook 原本的環境裡**（Git 給的 `GIT_INDEX_FILE` 等還在）做完：讀暫存區；共用檢查 `check-docs --staged`、`secretlint --staged`、`check-local-paths --staged`、`check-skill-mirror --staged`（新增：兩份 skill 都從暫存區讀）、`check-plugin-imports --staged`；呼叫分派表。`git commit <路徑>`、`git commit -a` 用的是暫時的索引，清掉環境再讀會讀到另一份（查核第 2-2 題，已重現）。
3. 跑會碰別的 repo 的測試之前，才把子程序的環境清掉（`git rev-parse --local-env-vars` 列的那些，照現在）。
4. 每個對象：完整就在它的資料夾跑 `npm run check`；相關測試就跑找到的測試檔（Cards 照現在用 dot reporter，通過時只印一行）。要跑的外掛有相依卻沒安裝時擋下，說要在哪個資料夾執行 `npm ci`；沒有相依的外掛（現在的 Capture、Mindboard）不用安裝。
5. 最後印一行：跑了哪些、照表跳過哪些，例如「Cards：照分派表跳過（只改 plugins/mindboard/）」。跳過一定有理由，沒理由的就是漏跑。

**pre-merge-commit**：

- 合併不經過 pre-commit，所以這裡也在原本的環境跑一次共用檢查，讀合併的索引（不再跑整份本機測試）。
- 判斷要不要先看 CI：用分派表的 **CI 跑法**比 `<合併基點>..<head>`；有任何外掛要跑就要 CI 綠燈，只查同一個 head 的 **push** run（`gh run list --commit <head> --workflow check.yml --event push`）：分支 push 的比較範圍才是「整個分支對 `main`」，PR 或探針的 run 比的是別的範圍（查核第 3 題）。比較基點讀不到就照要 CI 處理。
- 照舊：只管在 `main` 上的合併；快轉與有衝突的合併不經過這個 hook，`gh` 不能用時警告放行，這些例外在 quality.md 照寫。

## 4. CI：`.github/workflows/check.yml`

- **plan job**：`fetch-depth: 0`，跑 `node tools/dispatch.ts --range` 的 CI 跑法。比較的端點由事件決定，**不用 checkout 出來的 `HEAD`**（PR 預設 checkout 的是 GitHub 的試合併結果；base 分岔後改了 Cards，用它比會讓只改 Mindboard 的 PR 也裝 Cards，查核第 3 題）：
  - `pull_request`：`merge-base(pull_request.base.sha, pull_request.head.sha)..pull_request.head.sha`。
  - push 到 `refs/heads/main`：`github.event.before..github.sha`；`before` 全是 0、clone 裡找不到、或不是祖先時，跑全部。
  - push 到其他分支：`merge-base(origin/main, github.sha)..github.sha`，算整個分支改過的。不能只算這次 push 的差異：pre-merge-commit 只看分支最後一個 commit 的 CI，最後一次 push 只改 Mindboard、前一次改了 Cards 卻紅燈時，只算這次就會讓分支綠燈合併。
  - push tag：跑全部。
  - 找不到基點或 Git 命令失敗：跑全部，理由寫清楚。
  - 輸出對象、理由、比較的端點與 checkout 的 SHA。
- **shared job**：每次都跑。在 `tools/` `npm ci`（快取用 `tools/package-lock.json`），跑 `tools` 的 `npm run check`（全部檔案）。不裝根目錄。
- **cards job**：plan 有 Cards 才跑。照現在：根目錄與 `tools/` 都 `npm ci`、`npm run check`、`npm run build`、`npm audit --omit=dev --audit-level=high`；`fetch-depth: 0`（比較測試要讀 tag）。
- **capture、mindboard job**：plan 有才跑。在外掛資料夾 `npm ci`（鎖檔沒有相依時跳過安裝）、`npm run check`。建置與 audit 等外掛有程式的第一個任務再加。
- **gate job**：`needs` plan、shared、三個外掛 job，`if: always()`，跑 `node tools/ci-gate.ts`，讀 plan 的輸出與 `toJSON(needs)`。過的條件：plan 成功、shared 成功、三個外掛的旗標都是合法值、每個 job 的結果都在而且符合 plan（要跑的 `success`、不跑的 `skipped`）。欄位缺、解析失敗、要跑的被跳過或取消、不該跑的跑了，都不過。在 `$GITHUB_STEP_SUMMARY` 印一張表：外掛｜跑不跑｜理由｜結果，加上比較的端點；plan 失敗也要印得出來。gate 不過，整個 workflow 就失敗（要跑的 job 被跳過時，其他 job 都綠，只有 gate 擋得到）。整個 workflow 被取消時 gate 不一定跑完，合併條件照樣要成功（查核第 3 題）。
- **必過檢查**：在本機用 `gh api repos/kuohappiness/Essence-Cards/rules/branches/main`（或 branch protection）查 `main` 有沒有設必過的檢查；有的話改成 gate，不讓會被照表跳過的外掛 job 單獨當必過檢查。查到什麼寫進〈結果〉。
- **`.claude/hooks/ci-status.mjs`**：照舊讀 `check.yml`，提醒的結論加上 `cancelled`（被取消的 run 不能證明 `main` 是綠的）。
- **`.github/workflows/progress-board.yml`**：`markdown-it` 搬到 `tools/` 之後，這裡改在 `tools/` 安裝（快取用 `tools/package-lock.json`）、直接跑 `node tools/progress-board.ts`、`node tools/roadmap-board.ts`；觸發路徑加 `plugins/*/docs/roadmap.md` 與 `tools/package-lock.json`。和 §1 同一個 commit 改，不然 Pages 會壞。

## 5. 外掛的骨架

`plugins/capture/`、`plugins/mindboard/` 各放：

- `AGENTS.md`：只寫這個外掛特有的，內容照〈附錄 B〉。`CLAUDE.md` 一行 `@AGENTS.md`（Claude Code 讀的是 `CLAUDE.md`，沒有它，外掛的 AGENTS.md 不會載入）。
- `package.json`（`name: essence-capture`／`essence-mindboard`、`private`、`type: module`、`engines.node >=24`）：沒有相依；`scripts.check` 先印一行「Mindboard 還沒有程式，沒有可檢查的項目」並結束碼 0，寫程式的第一個任務換成型別、lint 與測試（〈附錄 B〉列給那個任務）。不設 `prepare`。`package-lock.json` 用 `npm install` 產生。
- `docs/backlog.md`：用 `git mv` 把 `docs/plans/capture.md`、`docs/plans/mindboard.md` 搬過來（D-208 第 9 點的一次性例外，只限這兩份）。這兩份本來就是那個外掛的「待做與待決」，當它的 backlog 起點，之後技術債表也寫在這裡（§7）。內容不改，只改相對連結；狀態行原文不改，後面加一句「（2026-11 搬到這裡，D-208 第一步）」，Mindboard 那份原本寫「到時搬進」的未來式才不會誤導（查核第 4 題）。其他資料夾（`tasks/`、`Claude Codex Discussion/`、`docs/plans/`）等第一份文件出現才建。
- Capture 另外：`plugins/capture/.gitignore` 寫 `*.pdf`（舊 `Essence-Capture` repo 的規則：課本 PDF 有版權）；舊 repo AGENTS.md 的底線（不提交 API 金鑰、PDF、課本頁面或轉錄出來的教材；測試結果放 repo 外）寫進 `plugins/capture/AGENTS.md`。
- **引用跟著改**：`git grep -n -E "plans/(capture|mindboard)\.md|\]\((capture|mindboard)\.md" -- ':!docs/archive'` 在 2026-11-17 找到 `docs/architecture.md:99`、`docs/backlog.md:137,198,245,246`、`docs/card-rules/trials.md:34`、`docs/decisions.md:5561,5890`、`docs/plans/README.md:24,25`（兩項改成一句「Capture、Mindboard 的待做與待決已搬到各自的 `docs/backlog.md`（D-208）」）、`docs/plans/ai-and-ecosystem.md:55`、`docs/plans/motivation.md:52`、`Claude Codex Discussion/2026-10-23-future-plans-consolidation.md:21,34`、`tasks/elementary-social-sol-trial-2.md:34`，以及兩份互相的連結。連結全改；只是文字提到舊路徑的，現行的入口（backlog、architecture、plans、trials）改成新路徑，決定與討論稿裡描述搬家的原文（例如 D-208 第 5 點）不改。`node tools/check-docs.ts` 通過、用新路徑再 `git grep` 一次沒有漏。不留轉址的空檔：repo 外連到這兩份的只有使用者的書籤。

**合併之後**（新路徑在 `main` 上了才做，免得新對話被指到還不存在的路徑；查核第 7 題）：舊的 `Essence-Capture` repo（本機在 Essence Cards 旁邊的資料夾）的 `AGENTS.md` 現在寫「這裡放程式」，新對話可能在那裡開始寫 Capture。改成：開發已移到 Essence Cards repo 的 `plugins/capture/`（D-208）；這個 repo 之後當 Capture 的公開 repo（放發布檔），現在不放程式。`README.md` 的「規劃、決定與進度都寫在 Essence Cards」改成同樣的意思。在那個 repo 的 `main` 直接 commit、push（只改文件）。

## 6. 外掛之間不 import：`tools/check-plugin-imports.ts`

D-208 第 10 點要機械檢查擋。放在共用檢查做一次，兩個外掛與 Cards 都適用，不必等各自的第一個任務各設一次（查核第 5 題同意）。

- 用 `typescript` 的 `ts.preProcessFile(文字, true, true)` 取出字面的路徑：註解與字串裡的不算；`import … from`、`import '…'`、多行的 `export … from`、`import x = require('…')`、`require('…')`、`import('…')`、沒有代換的模板字面值都取得到（〈平台事實〉）。`import('../../src/' + name)` 會取到字面的前段，照前段判斷（偏嚴）。
- 掃 Git 追蹤的檔（`--staged` 讀暫存區），副檔名 `.ts`、`.tsx`、`.mts`、`.cts`、`.js`、`.jsx`、`.mjs`、`.cjs`，不含 `node_modules`。Vue、Svelte 等到有外掛要用時再加解析。
- 擋：
  - `plugins/<外掛>/` 底下的檔，相對路徑解開後跑出 `plugins/<外掛>/`；
  - 根目錄 `src/`、`tests/`、`tools/` 的檔，相對路徑解開後進到 `plugins/`；
  - `plugins/<外掛>/` 底下追蹤的 symlink（mode `120000`），指向解開後在外掛外；
  - `plugins/<外掛>/package.json` 的相依用 `file:`、`link:` 指到外掛外。
  套件名稱、`node:`、網址照常。
- 有問題時每個一行「檔案:行  目標  原因」，結束碼 1。
- 已知的限制（寫進 [backlog〈已知的限制〉](../docs/backlog.md#已知的限制)）：執行時才組出來的路徑認不得；`tsconfig` 的 `paths`、打包工具的 alias、自訂 resolver 讓套件名稱指到別的外掛，這裡看不到，由第一個用到它們的任務把解析後的邊界加進測試（附錄 B）。
- 測試 `tests/plugin-imports.test.ts`，擋的：`plugins/mindboard/src/a.ts` 引用 `../../../src/core/files.ts`、`../../capture/src/x.ts`、`../../../tools/check-docs.ts`；多行的 `export { a,\n b } from '../../capture/b.ts'`；`import x = require('../../../src/x')`；`` import(`../../capture/a.ts`) ``；`src/main.ts` 引用 `../plugins/mindboard/a.ts`；`tests/x.test.ts` 用 `import('../plugins/capture/a.ts')`；外掛裡指到 `../../src` 的 symlink；外掛 `package.json` 的 `"x": "file:../capture"`。放行的：註解與字串裡的 `import '../../../src/a.ts'`、外掛裡互相引用、套件名稱、`node:fs`、`tests/check-docs.test.ts` 引用 `../tools/check-docs.ts`。

## 7. 文件檢查：`tools/check-docs.ts`

D-208 第 4 點：只加目錄清單會漏掉 roadmap 與補測列的歸屬（Codex 第二輪第 3 題）。

- **狀態目錄**：除了 `tasks`、`Claude Codex Discussion`、`docs/plans`，`plugins/<外掛>/` 底下同樣三個目錄也要標題下第一行有狀態。
- **roadmap**：`docs/roadmap.md` 與存在的 `plugins/<外掛>/docs/roadmap.md` 都檢查「現在在哪裡」一節與「已完成」最多 10 列。外掛的 roadmap 存在時，最上層 `docs/roadmap.md` 的〈現在在哪裡〉一節裡要有連到 `plugins/<外掛>/docs/roadmap.md#現在在哪裡` 的連結（D-208 第 4 點：最上層的入口連到各外掛的 roadmap）。
- **延後的測試**（D-195）：`tasks/` 的任務對最上層的 `docs/backlog.md`；`plugins/<外掛>/tasks/` 的任務對 `plugins/<外掛>/docs/backlog.md` 的技術債表，那份沒有技術債表卻寫了列名時報錯。列名照現在**只查這次暫存改到的任務**（補完刪掉的列不會讓舊任務壞掉）；讀「這次改到哪些」改用 `-z`（查核第 4 題）。
- `BEFORE_D195` 現在照檔名比，`plugins/mindboard/tasks/w3.md` 會被當成舊任務放過：改成只比最上層 `tasks/` 的檔。
- `countDeferred`（進度畫板的待補測數）這一步照舊只數最上層的 backlog；畫面上那句寫明只算最上層的 backlog（§8）。
- 測試：外掛的狀態目錄；外掛 roadmap 的兩項檢查；最上層沒連到外掛 roadmap、連到錯的錨點、連結在〈現在在哪裡〉以外；外掛任務的列名只在最上層 backlog 有（要報錯）；外掛沒有 backlog；補完刪掉列的歷史任務（不報錯）；`BEFORE_D195` 不放過外掛的同名 `w3.md`；檔名有空白與中文的外掛任務照樣查到。

## 8. 進度白板讀每一份 roadmap：`tools/roadmap-board.ts`

D-208 第 4 點：進度白板從各外掛的 roadmap 產生。外掛的 roadmap 由它的第一個任務建，這一步先讓白板讀得到，建了就自動出現，不用再改工具。

- 讀 `docs/roadmap.md`，加上存在的 `plugins/<外掛>/docs/roadmap.md` 的「現在在哪裡」。外掛的列在名稱前加外掛名（「Mindboard｜」）。正式 vault 的版本與「已完成」只從最上層讀（過渡期都是 Cards）。
- 連結以各自的 roadmap 為準：現在的 `fixLinks` 用固定的 `DOCS_URL`、`ROADMAP_URL`，改成依來源檔算；同一個 `../tasks/x.md` 或 `#現在在哪裡` 在兩份 roadmap 要各自指回自己的位置。
- 加 `--check`：只讀、只解析，不產生網頁；放進 `tools` 的 `check`（§1），外掛的 roadmap 寫壞時 commit 就擋，報檔案與行號，不會等到 Pages 才失敗、網頁停在上一版（查核第 4 題）。
- 功能地圖的待補測數那句寫明「只算最上層的 backlog」（`tools/progress-board-data.ts` 的 `debtNote`）。
- 測試用暫存資料夾裡自編的外掛 roadmap（含寫壞的一份）；手機寬度（375px）照 [roadmap-board 任務](roadmap-board.md)的驗收看一次。

## 9. 文件

- **`docs/architecture.md` 加〈9. repo 結構 ✅（D-208）〉**：使用者要的架構說明只寫這一處（D-208 第 1 點）。草稿在〈附錄 A〉，照實際做出來的名稱改。
- **`AGENTS.md`**（D-208 已定，不用另過五關）：
  - 〈開始工作前〉第一項後面加一句：「做 Capture 或 Mindboard 時，先讀 `plugins/<外掛>/AGENTS.md`。」
  - 〈文件分工〉的表搬進〈repo 結構〉，原處改成一句「每一層放什麼、新文件放哪裡，見 architecture.md〈repo 結構〉（D-208）。」，連到 `docs/architecture.md#9-repo-結構-d-208` 與 D-208。表下面的規則照留。
- **skill `essence-decision`**（`.claude/` 與 `.agents/` 兩份一起改）：第 2 步的條目格式在狀態行下一行加「適用：Cards／Capture／Mindboard／全部（可以多個）」（D-208 第 3 點）；第 5 步的「依 `AGENTS.md` 的文件分工」改成「依 architecture.md〈repo 結構〉」，第 6 步的路線圖改成「受影響的外掛的 roadmap」。
- **`docs/agents/quality.md`〈檢查指令〉**：寫 `tools/` 要先 `npm ci`、pre-commit 照分派表（連到 `tools/dispatch.ts` 與〈repo 結構〉，規則不抄第二份）、CI 的 job 與 gate、pre-merge-commit 的條件與例外。
- **`docs/backlog.md`**：〈三個外掛併進同一個 repo〉第一步那行改成狀態與這份的連結；〈Essence Capture 與 Essence Mindboard〉的列連到新的 backlog；§6 的已知的限制；§10 的技術債。
- **`docs/roadmap.md`**：「三個外掛的 repo 架構」那一列照進度改；合併後已完成加一列。

## 10. 技術債

- **到期的一列**：[backlog 技術債](../docs/backlog.md#技術債)「pre-commit 的 `npm run check` 讀工作樹、不是暫存區」的觸發點是「下次改 `.githooks/pre-commit` 時」，這次就是（查核第 7 題）。這一步先量：Cards 的完整檢查在只有暫存內容的副本跑一次（`git checkout-index` 到暫存資料夾、`node_modules` 用連結），記時間與跑不了的測試（例如要讀 `.git` 或 tag 的）。可行而且多花的時間不大，就改成預設、刪掉那一列；不可行，就把量到的數字與原因寫進那一列，觸發點更新（那一列的另一個完成條件「確認不再共用資料夾」要有實際的依據才用）。外掛的檢查也照同一個結論。
- **新的一列**：「外掛只改文件也跑完整檢查」：觸發點是某個外掛的 `npm run check` 在本機超過 1 分鐘；完成條件是替那個外掛定「相關測試」的找法與登錄方式（測試讀到哪些檔要寫得出來），分派表加上那個外掛的相關測試跑法與案例。

## 驗收

1. `tests/dispatch.test.ts`：§2 的例子每一列一個案例，`--staged`（暫存 repo）與 `--range` 都測；另測 Git 讀取失敗（例如不存在的端點）非零結束、合併 commit 用兩棵樹比。
2. **乾淨 checkout 的 hook**（`tests/quality.test.ts` 或新的測試檔，查核第 6 題）：
   - `git clone --no-local` 到暫存資料夾。clone 拿的是 commit 過的版本：測試要驗的 hook 與工具先 commit 在分支上，或由測試明確複製進 clone，寫清楚是哪一種。乾淨的 clone 不繼承 `core.hooksPath`：在 clone 的 `tools/` 跑安裝入口，並斷言 hook 真的有跑。
   - `tools/node_modules` 借真的那份：Linux 用 symlink、Windows 用 junction，清理前先拆連結。三個外掛的 `check` 換成寫記號檔的替身，替身也要能回非零（hook 要擋）。只改 Mindboard 的情況根目錄沒有 `node_modules`（斷言不存在）；要跑 Cards 的情況放一個空的 `node_modules` 當作裝過。
   - 照 D-208 的五種情況各 commit 一次：只改 Mindboard、只改 Cards、改轉錄稿格式（`docs/syntax.md`）、刪檔、跨外掛改名；斷言跑了哪些（記號檔）、沒跑哪些、最後那行寫了跳過的理由。
   - 另測：從 `plugins/mindboard/` 裡 commit；`git commit -- <路徑>` 時另一個外掛已預先 stage（只照這次 commit 的路徑分派）；`git commit -a`；只 stage 一份 skill、工作樹的兩份剛好一致（要擋）；已經存在的 linked worktree 切到新分支後 hook 照跑；沒有 `tools/node_modules` 時擋下；要跑 Cards 卻沒有根目錄的 `node_modules` 時擋下並說在根目錄 `npm ci`。
   - 現在 `tests/quality.test.ts` 對 hook 的覆蓋都保留，改成從新的入口跑：hook 檔是 LF（CRLF 的回歸）、只改文件也跑文件檢查、原有的 `NODE_OPTIONS` 與結束碼、pre-merge-commit 擋合併。pre-merge-commit 另測：用 `gh` 的替身，查的是同一個 head 的 push run；合併索引裡的違規會被共用檢查擋。
3. **真的工具跑一次共用檢查**：根目錄沒有 `node_modules`，在 `tools/` 跑 `npm run check` 通過；再在根目錄與 `plugins/mindboard/` 各放一個自編的違規樣本（金鑰、本機路徑、壞連結），每一個都要擋；從根目錄、`tools/`、外掛資料夾跑，結果一樣。樣本不 commit。
4. `tests/ci-gate.test.ts`：
   - gate：要跑的 `success`、`failure`、`cancelled`、`skipped`；不跑的 `skipped` 與跑了；plan 失敗；欄位缺、JSON 解析失敗、旗標不是合法值。
   - 比較端點：PR（`base.sha` 在分岔後前進、改了 Cards，`head` 只改 Mindboard → 只有 Mindboard）；push 到 `main` 有 `before`；`before` 全是 0；`before` 不在 clone 裡；`before` 不是祖先；push 到分支（和 `origin/main` 的合併基點）；沒有 `origin/main`；push tag。
5. **GitHub 上實際跑**（查核第 6 題，比五個 PR 省、又多驗 gate 會紅）：
   - 第一步的分支 push 後，CI 是「全部」（改到共用的輸入），每個 job 都跑、gate 綠燈；shared job 的 log 沒有根目錄的 `npm ci`。
   - 從這個分支開探針分支，各一個 commit，開 draft PR **合併到第一步的分支**（不是 `main`，比較的基點才會是第一步的分支）：
     - 只在 `plugins/mindboard/` 加一個非 `.md` 的檔：plan 只有共用與 Mindboard，cards、capture 顯示 skipped，gate 的摘要寫了理由，log 沒有根目錄的 `npm ci`。
     - 只改 `docs/product.md`：Cards 升成完整檢查。
     - 反向：讓 plan 說要跑、某個外掛 job 卻被跳過（例如在探針分支把那個 job 的 `if` 改成 `false`）：其他 job 都綠，gate 紅燈，摘要寫「要跑卻跳過」。
   - 小探針：只重跑一個外掛 job，gate 跟著重跑、結論照樣對；取消一次 run，結論不是成功。做不了的標待驗。
   - run 的網址寫進〈結果〉，之後關掉 PR、刪探針分支。
6. Cards 的 `npm run check`（根目錄與 `tools/` 都裝）通過，含 `plugin-imports`。
7. knip 沒有把 `tools/` 忽略：在一個共用工具與一個 Cards 工具各暫時加一個沒用到的 export，`npm run knip` 兩個都報出來，再拿掉；`tools/package.json` 的 script 入口與 secretlint preset 的動態載入沒有被報成沒用到。
8. §6、§7、§8 的測試。
9. `node tools/check-docs.ts` 通過（搬檔與引用沒漏）；`git log --follow plugins/mindboard/docs/backlog.md` 接得到搬之前的歷史。
10. §10 量到的數字與結論寫進 backlog。
11. Windows 本機與 CI 的 Linux 都跑過第 1～4 項的測試（本機是 Git for Windows 的 sh）。
12. `main` 的必過檢查查過，結果寫進〈結果〉（§4）。
13. 合併前 L2：新開的 Codex session，審查請求照 code-quality 的 `review.md` 寫在 `tasks/one-repo-step-1-review.md`。第二輪起的再審照[試行](auto-codex-rereview-trial.md)由 Claude 用 `codex exec` 送，第一輪照舊由使用者轉交。
14. 合併後：先更新主資料夾（共用的 `core.hooksPath` 常指到它，舊版的 hook 不會轉交，L2 R3）；主資料夾與每個 worktree 在 `tools/` 跑一次 `npm ci`，確認 `git config core.hooksPath` 是相對的 `.githooks`；Pages 的 Progress board 跑成功、兩個網址打得開；舊 `Essence-Capture` repo 的入口改好（§5）。

## 平台事實

送 L2 之前跑完；跑不了的標待驗，寫進審查請求的〈驗證方式〉（code-quality〈寫規格〉）。

| 假設 | 探針與環境 | 結果 |
|---|---|---|
| 共用相依搬到 `tools/package.json` 後，Cards 的型別與 lint 照常通過，共用檢查不靠根目錄的 `node_modules` 也能跑 | 2026-11-17 Claude 在暫存複本（Linux、Node 22.23、npm 10.9、`main` 的 `6bfdad9`）：搬 5 個相依、兩邊各 `npm install`；`tsc`、`eslint` 通過；拿掉根目錄 `node_modules` 後 `check-docs`、`secretlint`、`check-local-paths`、`check-skill-mirror`、`decisions-index` 都能跑（從根目錄跑） | 通過；Windows 2026-11-17 由驗收第 3 項驗過（乾淨 clone、沒有根目錄的 `node_modules`） |
| knip 要把 `tools` 設成工作區 | 同上：沒設時報 5 個 Unlisted dependencies（`markdown-it` 三處、`github-slugger`、`secretlint`）；`knip.jsonc` 寫 `workspaces` 的 `"."` 與 `"tools"` 後通過（knip 6.42.1，沒用 npm workspaces 也認） | 通過；沒有漏抓：驗收第 7 項（2026-11-17 Windows）在 `tools/progress-board-data.ts`（共用）與 `tools/vault-io.ts`（Cards）各加一個沒用到的 export，兩個都報出來；拿掉後通過，script 入口與 secretlint preset 沒被報 |
| 只有一個測試要改 | 同上，跑 `check-docs`、`quality`、`local-paths`、`progress-board`、`roadmap-board`、`decisions-index`、`block-dangerous-git` 的測試：只有 `quality.test.ts` 的「D-141 每次 commit 都跑文件檢查」失敗（它把根目錄的 `node_modules` 連進暫存 repo，要改成連 `tools/node_modules`） | 已知；施工時 §1 也只改了這個測試（`ef88c86`），完整檢查通過 |
| npm 在套件的資料夾執行 script（`npm --prefix tools run` 也是），從 `tools/` 跑 `git ls-files` 只列得到 `tools/` | Codex 2026-11-17（Windows、npm 11.6.2） | 已重現：共用工具要自己找 repo 根（§1） |
| 從子資料夾執行 `git config core.hooksPath .githooks`，hook 照樣從工作樹的根執行 | Claude 2026-11-17 暫存 repo（Linux）：在 `tools/` 設定，從 `plugins/mb/` commit，hook 有跑；Codex 同日在 Windows（Git 2.52）確認讀到相對的 `.githooks` | 通過；Git for Windows 的實際 commit 由驗收第 2 項驗過（`tests/hooks.test.ts` 在 clone 的 `tools/` 跑安裝入口，再從 `plugins/mindboard/` commit） |
| `git commit <路徑>`、`-a` 時，hook 拿到的 `GIT_INDEX_FILE` 是另一份索引，清掉環境再讀會讀到預設的索引 | Codex 2026-11-17 暫存 repo：同一條 `git diff --cached` 隨 `GIT_INDEX_FILE` 換成另一組 | 已重現：在 hook 原本的環境讀（§3） |
| `core.quotepath=true` 時 `--name-only` 會跳脫中文與空白，`-z` 交回原路徑；`--diff-filter=ACMRD` 會濾掉型別變更 `T`；只差大小寫的 `git mv` 加 `--no-renames` 出現 A、D 兩條；子模組只出現一條 `160000` | Codex 2026-11-17（Windows、Git 2.52） | 已重現（§2） |
| `ts.preProcessFile(文字, true, true)`：註解與字串裡的 `import` 不算；多行 `export … from`、`import x = require()`、`require()`、沒有代換的模板字面值都取得到；`import('../../src/' + name)` 取到前段 | Claude 2026-11-17（Linux、TypeScript 5.9.3） | 通過（§6） |
| 沒有相依的 `package.json`：`npm install` 產生只有根項目的鎖檔，`npm ci` 成功、不建 `node_modules` | Claude 2026-11-17 暫存 repo（Linux）；2026-11-18 Windows（npm 11.6.2），複製 `plugins/mindboard/` 的 `package.json` 與鎖檔 | 通過；鎖檔和 `package.json` 不同步、不是 JSON、不存在時結束碼都是 1（`EUSAGE`），所以安裝直接 `npm ci`（L2 R5） |
| `actions/setup-node` 的 npm 快取遇到沒有相依的鎖檔 | 沒測 | 不適用：capture、mindboard 的 job 不設快取（沒有相依，沒有可快取的）。shared 與 cards 照常快取，CI 沒有快取的警告（只有 GitHub 說 `actions/checkout@v4`、`actions/setup-node@v4` 用的 Node.js 20 已停止支援，`main` 原本就有） |
| 跳過的 job 在 `needs` 裡是 `skipped`；`pull_request` 合併到非預設分支也會觸發（`check.yml` 是 `on: [push, pull_request]`，沒限分支）；新分支第一次 push 的 `before` 是全 0；只重跑上游 job 會連帶重跑依賴它的 gate | GitHub 文件；2026-11-17 驗收第 5 項實測（run 的網址在〈結果〉） | `skipped`：通過（照表跳過的 cards、capture，gate 讀到 `skipped` 判成功；`if: false` 跳過的 cards，gate 判「要跑卻跳過」）。合併到第一步分支的 draft PR 都觸發了。`before` 全 0：沒用到，push 到 `main` 以外的分支比和 `origin/main` 的合併基點，不讀 `before`（全 0 的處理由 `tests/ci-gate.test.ts` 測）。只重跑 mindboard：gate 跟著重跑、成功，plan 與 shared 沿用第一次的結果。另外：取消正在跑 cards 的 run，gate 照樣跑（`if: always()`）並判「要跑，結果是 cancelled」，run 的結論是 `cancelled` |
| 開 worktree 的工具（Claude Code）把共用的 `.git/config` 的 `core.hooksPath` 改成另一個 checkout 的 `.githooks` 絕對路徑，新舊分支的 hook 會混用 | Claude 2026-11-17 這個 worktree（Windows）：開好後 `git config core.hooksPath` 是主資料夾的絕對路徑；在 `tools/` 跑 `npm ci`（`prepare`）後回到相對的 `.githooks` | 已重現：兩個 hook 先轉給這個 worktree 自己的 `.githooks`（§3）；`tests/hooks.test.ts` 測絕對路徑轉交 |
| `git clone --no-local <worktree 的路徑>` 拿到那個 worktree 的 HEAD 所在的分支 | Claude 2026-11-17 Windows（Git 2.52.0） | 確認；一次約 8 秒，`tests/hooks.test.ts` 每個案例 clone 一次 |
| `git log --follow` 接得到搬家前的歷史 | Claude 2026-11-17：Mindboard 那份預設接得到；Capture 那份改了相對連結後和原檔的相似度 40%，低於預設的 50% | Mindboard 通過；Capture 要加 `-M30%`（`git log --follow -M30% -- plugins/capture/docs/backlog.md`） |
| knip 對只被測試 import 的檔也做 export 分析 | Claude 2026-11-17 Windows（knip 6.42.1）：在 `tools/dispatch.ts`（當時只被 `tests/dispatch.test.ts` import）加一個沒用到的 export，knip 沒報 | 不成立；驗收第 7 項改在有其他程式 import 的共用工具與 Cards 工具驗。hook 直接執行、沒有程式 import 的 `hooks.ts` 列成 knip 的入口（沒列時報成沒用到的檔）；`dispatch.ts` 由它 import，export 照樣檢查；CI 直接執行的 `ci-gate.ts` 只被測試 import，export 不受檢查 |
| secretlint 的讀檔模式怎麼處理二進位檔（L2 R1 的修法依賴它） | Claude 2026-11-18 讀 `tools/node_modules` 的 secretlint 13.1.0：`@secretlint/source-creator` 用 `istextorbinary` 判斷，二進位只跑支援 binary 的規則（preset 裡只有 gcp，只看 `.p12`、`.json`）；`executeOnContent`（stdin 模式）一律當文字。Windows 探針：暫存一個含 token 的 PNG | 兩種模式都不報那個 PNG：`--staged` 取出副本後照讀檔模式掃，判斷一致 |
| npm 怎麼解析外掛相依的本機路徑寫法（L2 R6） | Claude 2026-11-18 Windows、npm 11.6.2：用 npm 內附的 `npm-package-arg` 從 `plugins/mindboard/` 解 | `file:~/x`、`~/x` 到家目錄；`../capture`、`lib/../../../src` 到外掛外；`git+file:` 是本機的 git repo；`file:%2e%2e/…`、`FILE:../…` 是外掛裡字面的資料夾名（沒跑出去）；`link:` 不支援（`EUNSUPPORTEDPROTOCOL`）；`a/b`、`a/b#feature/x` 是 GitHub 的簡寫 |
| `git checkout-index --prefix` 取出的副本（加一個指向工作樹 git 資料夾的 `.git` 檔、`node_modules` 用 junction）跑得了 Cards 的完整檢查，多花的時間不大（§10） | Claude 2026-11-17 Windows（Git 2.52、Node 24.13），`af4b12a` 的暫存區 892 個檔 | 通過：不給 `.git` 時共用檢查與 21 個測試失敗；給了全部通過。取出約 0.58 秒、清理約 0.13 秒（〈結果〉第 10 項） |

## 結果

2026-11-17 Claude（Opus 5.5、高）在分支 `claude/one-repo-step-1` 施工。本機是 Windows 11、Git for Windows 2.52、Node 24.13；CI 是 GitHub Actions 的 Ubuntu。

**commit**（一個決定一個；每個都經過 pre-commit，push 後的 CI 見驗收第 5 項）：

| commit | 內容 |
|---|---|
| `ef88c86` | §1 共用檢查自己一份套件（連同 hook 的安裝檢查、兩個 workflow、`knip.jsonc`、`quality.test.ts`） |
| `c4220f0` | §5 外掛的骨架、`git mv` 兩份 backlog、引用跟著改 |
| `09b1c02` | §2 分派表 |
| `08a0431` | §6 外掛之間不 import |
| `267f7e5` | §4 的 `ci-gate.ts`（還沒接上 CI） |
| `0d05273` | §3 的前置：`check-skill-mirror --staged` 讀暫存區 |
| `4a4acf0` | §3 兩個 hook 改用分派表 |
| `047815c` | §4 CI 改用分派表與 gate；`ci-status.mjs` 加 `cancelled` |
| `3f56947` | §7 文件檢查涵蓋外掛 |
| `13ceb89` | §8 進度白板讀每一份 roadmap |
| `af4b12a` | §9 文件 |
| `9a55771` | §10 pre-commit 的外掛檢查改在只有暫存內容的副本跑 |
| `02afb0a` | §2 的補正：第 7 條加上 `tasks/`、`Claude Codex Discussion/` |
| `b8396a6` | 驗收、平台事實、〈結果〉、L2 審查請求、roadmap |
| `6b0a3a6` | L2 R1：`secretlint --staged` 掃暫存區的內容（含型別變更） |
| `3c8a307` | L2 R2：相關測試照這次比較的內容選 |
| `a64ff61` | L2 R3：舊版 hook 不會轉交，記成已知的限制（只改文件）；Codex 的第一輪報告 |
| `3a236db` | L2 R4：gate 對比較端點、理由、結果與旗標都查型別 |
| `acf0afe` | L2 R5：capture、mindboard 的 job 直接 `npm ci` |
| `dfddc48` | L2 R6：外掛的本機相依只接受外掛裡的相對路徑（白名單） |
| `5503513` | 第一輪的回應、第二輪的審查請求、〈結果〉、roadmap |
| `a97aa2f` | L2 R7：`secretlint --staged` 照原樣寫出索引的 blob，不經過 checkout |
| `c3aa6eb` | 第二輪的報告與回應、第三輪的審查請求、〈結果〉、backlog、roadmap |
| `893f43b` | L2 R8：只差大小寫的兩個路徑寫成同一個檔時擋下（只建立新檔） |
| `2255c56` | 第三輪的報告與回應、第四輪的審查請求、〈結果〉、roadmap |
| `d7e2a0b` | L2 R9：撞名的回歸照暫存資料夾實際分不分大小寫選預期（只改測試） |
| `dfc1954` | 第四輪的報告與回應、〈結果〉、roadmap |
| `2415568` | 併進 `main`（再審輪試行的說明）：解任務說明第 13、14 項與 roadmap 的衝突 |
| `16cef58` | [PR #21](https://github.com/kuohappiness/Essence-Cards/pull/21) 合併進 `main` |
| 這一列所在的 commit（`main`） | 合併後：狀態、〈結果〉第 14 項、roadmap、backlog |

**和任務說明不一樣、或自己選的做法**（L2 請一併看）：

- §2 第 7 條加上 `tasks/`、`Claude Codex Discussion/`（`02afb0a`，§2 的表也補了）：表只列 `docs/`、`experiments/`、`.claude/`、`.agents/` 與根目錄的 `.md`，這兩個最上層的文件資料夾落到第 8 條「以上都不是」，只改任務說明或討論稿的 commit 會跑三個外掛的完整檢查（本機約 10 分鐘、CI 每個 job 都跑）；原本的 hook 對它們只跑文件檢查。寫〈結果〉前用 `--staged --explain` 看這個 commit 的分派才發現。補完後拿整個 repo 跑一次（`--range` 從空樹到 `HEAD`），落到第 8 條的只剩 `.ignore`（搜尋工具略過舊白板 HTML 的設定），照表三個外掛都檢查，沒有再改。外掛自己的 `tasks/` 等資料夾不受影響（在外掛資料夾底下，照外掛的那一條）。

- `roadmap-board --check --staged` 也放進 hook 的共用檢查（§3 的清單沒有）：§8 要「外掛的 roadmap 寫壞時 commit 就擋」，commit 跑的是 hook 的共用檢查、不是 `tools` 的 `npm run check`，不放進去就擋不到。
- `roadmap-board --check` 除了解析，也跑產生網頁時的私人資訊檢查（`findPrivate`）：Pages 產生時會因為它失敗，commit 就該擋；測試加了一個帶電子郵件的例子。
- `check-skill-mirror --staged` 獨立一個 commit（`0d05273`），放在 §3 之前：§3 的 hook 要呼叫它。
- `knip.jsonc` 的 `tools` 工作區把 `hooks.ts` 列成入口：hook 用 node 直接執行、沒有程式 import 它，沒列時 knip 報它是沒用到的檔（〈平台事實〉）。
- 兩個 hook 先檢查 `core.hooksPath`：指到別的 checkout 的 `.githooks`（開 worktree 的工具會這樣改，〈平台事實〉）時，轉給這個工作樹自己的 hook；不轉的話，舊分支的 worktree 會跑新分支的 hook，反過來也一樣。`tests/hooks.test.ts` 有案例。
- §10 改成預設時的做法（副本放系統暫存資料夾、LF、`.git` 檔、借 `node_modules` 的連結、Ctrl+C 與刪不掉時怎麼辦）逐條寫在[審查請求](one-repo-step-1-review.md)〈實作者自己選的做法〉第 7 點。
- capture、mindboard 的 job 不設 `setup-node` 的快取（沒有相依，沒有可以快取的）。安裝那一步原本在鎖檔沒有相依時跳過；L2 R5 指出讀鎖檔失敗、鎖檔和 `package.json` 不同步也會被當成沒有相依，改成直接 `npm ci`（`acf0afe`）。
- L2 第一輪的修正裡自己選的做法，列在[審查請求〈第二輪〉](one-repo-step-1-review.md#第二輪)。

**驗收**：

1. `tests/dispatch.test.ts`：§2 的每一列都有案例（第 7 條補的兩個資料夾也有），`--staged` 與 `--range` 都測；Git 讀取失敗非零結束、合併 commit 用兩棵樹比也測了。檔名有換行那一列只在 Linux 跑（CI 通過）。L2 R2 加了相關測試照這次比較的內容找的案例（暫存區不看工作樹的修改與新檔、`--range` 讀 head 的樹）。
2. `tests/hooks.test.ts`（新檔，從工作樹明確複製 hook 與工具進 clone 再 commit 一次當基準）：五種情況、從外掛資料夾 commit、`git commit -- <路徑>`、`-a`、只 stage 一份 skill、已經存在的 linked worktree、`core.hooksPath` 被改成絕對路徑、缺 `tools/node_modules`、缺根目錄的 `node_modules` 都有案例；§10 加了：暫存區與工作樹不同時照暫存區（擋下與放行各一）、`git commit -- <路徑>` 照 HEAD 的內容、`-a` 照工作樹的內容，每次 commit 後副本都刪了、借出去的 `node_modules` 還在。`tests/quality.test.ts` 原有的 hook 覆蓋都保留，改成從新的入口跑；pre-merge-commit 用 `gh` 的替身測 push run 的參數、`cancelled`、只改文件也要 CI、合併索引裡的壞連結被擋。L2 第一輪後：R1 的金鑰（暫存區與工作檔兩個方向、`-a`、`-- <路徑>`、別的檔已 stage、型別變更）加進 `tests/quality.test.ts` 的 D-141 測試；R2 的兩個方向（測試的修改沒 stage、工作樹新加的測試）加進 `tests/hooks.test.ts` 的第二個測試。L2 第二輪後：R7 的整類（Git 取出檔案時會套用的四種屬性 × 已 stage／只在工作樹）加進同一個 D-141 測試。L2 第三輪後：R8 的整類（檔名只差大小寫、資料夾只差大小寫）也加進同一個測試；第四輪的 R9 讓它照暫存資料夾實際分不分大小寫選預期的訊息。
3. Windows 2026-11-17：`git clone --no-local` 一份、根目錄沒有 `node_modules`、只連 `tools/node_modules`，`npm run check` 從根目錄、`tools/`、`plugins/mindboard/` 跑都通過；金鑰、本機路徑、壞連結三種樣本放在根目錄與 `plugins/mindboard/` 各一次（stage、不 commit），六次三處都擋下、結束碼一樣。新 clone 沒有主資料夾 `.local/` 的測試 vault 登錄時，本機路徑檢查會把測試 vault 的名稱當成正式 vault 擋下：這是原本就有的行為（登錄不進 repo），驗收時把登錄複製進 clone。
4. `tests/ci-gate.test.ts`：gate 的每種結論、plan 失敗、欄位缺、JSON 壞、旗標不合法；比較端點的八種事件都有案例。L2 R4 加了比較端點、理由、結果與旗標缺、空或型別錯的 16 種輸入。
5. GitHub 上實際跑：
   - 第一步的分支 push（`047815c`）：[run 44109504787](https://github.com/kuohappiness/Essence-Cards/actions/runs/44109504787) plan 判斷「全部」（比較 `d655645..047815c`，push 到分支：和 `origin/main` 的合併基點到這次），六個 job 都成功；shared 的 log 只有 `tools/` 的 `npm ci`。§9 之後的 `af4b12a` 也全綠：[run 44115207246](https://github.com/kuohappiness/Essence-Cards/actions/runs/44115207246)（cards 297 秒，其他都在 15 秒內）。
   - 只在 `plugins/mindboard/` 加非 `.md` 的檔（draft PR #18 合併到第一步的分支）：[run 44112480040](https://github.com/kuohappiness/Essence-Cards/actions/runs/44112480040) 只跑 plan、shared、mindboard，cards 與 capture 是 skipped，gate 成功，摘要寫了「照分派表跳過（這次改的路徑都不是它的：…）」；沒有根目錄的 `npm ci`。
   - 只改 `docs/product.md`（draft PR #19）：[run 44112509671](https://github.com/kuohappiness/Essence-Cards/actions/runs/44112509671) Cards 升成完整檢查、通過，capture、mindboard skipped，gate 成功。
   - 反向（draft PR #20，探針分支把 cards job 的 `if` 改成 `false`）：[run 44117803057](https://github.com/kuohappiness/Essence-Cards/actions/runs/44117803057) plan 判斷「全部」，shared、capture、mindboard 都成功，cards skipped，gate 紅燈，摘要寫「Cards：要跑卻跳過」。
   - 小探針：[run 44112480040](https://github.com/kuohappiness/Essence-Cards/actions/runs/44112480040) 只重跑 mindboard（第 2 次），gate 跟著重跑、成功，plan 與 shared 沿用第 1 次的結果；[run 44112509671](https://github.com/kuohappiness/Essence-Cards/actions/runs/44112509671) 重跑後在 cards 跑到一半時取消（第 2 次），gate 照樣跑完並判「Cards：要跑，結果是 cancelled」，run 的結論是 `cancelled`。
   - 看完後三個 PR 都關掉、探針分支刪掉。
   - L2 第一輪的修正 push 後（`dfddc48`）：[run 44147697017](https://github.com/kuohappiness/Essence-Cards/actions/runs/44147697017) plan 判斷「全部」（比較 `d655645..dfddc48`），六個 job 都成功；capture、mindboard 的 `npm ci`（L2 R5）成功，鎖檔沒有相依（`up to date, audited 1 package`）。
   - L2 第二輪的修正 push 後（`a97aa2f`）：[run 44200346263](https://github.com/kuohappiness/Essence-Cards/actions/runs/44200346263) plan 判斷「全部」（比較 `d655645..a97aa2f`），六個 job 都成功。
   - L2 第三輪的修正 push 後（`893f43b`）：[run 44207031006](https://github.com/kuohappiness/Essence-Cards/actions/runs/44207031006) 六個 job 都成功；Linux 上 R8 的撞名案例兩份都掃、被金鑰規則擋下（D-141 測試通過）。
   - 合併前最後的 head（`2415568`）：push [run 44215829441](https://github.com/kuohappiness/Essence-Cards/actions/runs/44215829441) 與 PR [run 44218037463](https://github.com/kuohappiness/Essence-Cards/actions/runs/44218037463) 都成功；合併後 `main` 的 push（`16cef58`）：[run 44218946028](https://github.com/kuohappiness/Essence-Cards/actions/runs/44218946028) plan、shared、cards、capture、mindboard、gate 都成功。
6. Cards 的 `npm run check`：CI 的 cards job 每次都通過；Windows 本機：改到共用輸入或 Cards 程式的 commit 在 pre-commit 都跑了完整檢查並通過（§10 的 `9a55771` 起在暫存內容的副本跑：`9a55771` 616 秒、`02afb0a` 約 600 秒；這段時間照常改任務說明，沒有影響檢查）；反向探針的 commit 也跑了一次（565 秒）。L2 第一輪的修正：R1、R2、R4、R5、R6 的 commit 改到共用的輸入，pre-commit 都跑了三個外掛的完整檢查並通過。第二輪的 R7（`a97aa2f`）、第三輪的 R8（`893f43b`）也一樣；第四輪的 R9 只改測試，pre-commit 跑了 Cards 的完整檢查並通過（`d7e2a0b`）。
7. knip：2026-11-17 Windows，在 `tools/progress-board-data.ts`（共用）與 `tools/vault-io.ts`（Cards）各加一個沒用到的 export，`npm run knip` 兩個都報出來（Unused exports 2）；拿掉後通過，`tools/package.json` 的 script 入口與 secretlint preset 沒被報。
8. §6、§7、§8 的測試在 `tests/plugin-imports.test.ts`、`tests/check-docs.test.ts`、`tests/roadmap-board.test.ts`、`tests/progress-board.test.ts`，都在上面的完整檢查裡通過。§8 的手機寬度：用自編的 Mindboard roadmap（兩列、一格超過 50 字）產生白板，375px 沒有橫向捲動（`scrollWidth` 375），外掛的列照「等誰」分組，連結指回 `plugins/mindboard/` 自己的位置。L2 R6 加了外掛本機相依的白名單案例（25 個擋、17 個放行）。
9. `node tools/check-docs.ts` 通過（362 個 Markdown 檔、7563 個連結）。`git log --follow -- plugins/mindboard/docs/backlog.md` 接到搬之前的 `47636f4`；Capture 那份改了相對連結後和原檔的相似度低於預設的 50%，要用 `git log --follow -M30% -- plugins/capture/docs/backlog.md` 才接得到（六個 commit 都在）。
10. §10 量測（2026-11-17 Windows，`af4b12a` 的暫存區，892 個檔）：`git checkout-index` 取出到暫存資料夾、`node_modules` 用 junction 借工作樹的，依序跑 Cards 完整檢查的每一步。
    - 不給 `.git`：型別、lint、knip 通過；共用檢查（`git ls-files`）與 21 個測試失敗，都是要讀 tag、歷史或 clone 這個 repo 的（`compare-versions` 8、`pick-old-version` 6、`ai-add-old-version` 2、`hooks` 2、`backup`、`build`、`update-vault` 各 1）。
    - 放一個 `.git` 檔指向工作樹的 git 資料夾：每一步都通過，型別 9.5 秒、lint 25 秒、knip 3.5 秒、共用檢查 8.6 秒、測試 536 秒，合計約 590 秒；同一份檢查在工作樹裡跑的 commit（反向探針）是 565 秒（量測時同時跑了別的檢查，差距在誤差內）。
    - 多花的只有取出與清理：取出（含寫 `.git` 檔、連 `node_modules`）約 0.58 秒、清理約 0.13 秒（各量 5 次取中位數）；只改外掛、本來約 4 秒的 commit 多約 0.7 秒，Cards 的完整檢查約 9 分鐘。
    - 結論：可行、多花的時間不大，改成預設（`9a55771`）：pre-commit 的外掛檢查（Cards、Capture、Mindboard，完整與相關測試）都在副本跑。backlog 那一列刪掉。
11. 第 1～4 項的測試：Windows 本機（Git for Windows 的 sh）在改到共用輸入的 commit 的 pre-commit 都跑過，另外也單獨跑過；Linux 在 CI 的 cards job 跑過。
12. `main` 沒有必過檢查：`gh api repos/kuohappiness/Essence-Cards/branches/main/protection` 回 404「Branch not protected」，`rules/branches/main` 回 `[]`（2026-11-17）。之後要設時只設 gate（quality.md〈檢查指令〉）。
13. L2：第一輪 Codex（2026-11-18，`b8396a6`）回報 R1～R6，都成立：R3 記成已知的限制，其餘修了（[報告與回應](<../Claude Codex Discussion/2026-11-18-one-repo-step-1-review.md>)）。第二輪 Codex（2026-11-18，`5503513`）核對 R1～R6 的修正都通過，新報 R7（延續 R1：取出時套用 `.gitattributes` 的轉換）；使用者選修並送第三輪，修了。第三輪 Codex（2026-11-18，`c3aa6eb`）確認 R7 已修，新報 R8（R7 修正引入：只差大小寫的路徑寫成同一個檔）；使用者選修並送第四輪，修了。第四輪 Codex（2026-11-18，`2255c56`）確認 R8 已修、沒有擋合併的發現，另報不擋合併的 R9（回歸測試用作業系統猜暫存資料夾分不分大小寫），只改測試、已修（[報告與回應](<../Claude Codex Discussion/2026-11-18-one-repo-step-1-review.md>)〈第四輪〉）。第二～四輪都由使用者轉交：上面第 13 項的「再審照試行由 Claude 用 codex exec 送」是在分支開工後才寫進 main（11898ab），合併 main 時才看到，這件沒用上。
14. 合併後（2026-11-18，`16cef58`）：
    - 主資料夾：未追蹤的 L2 報告（內容已在 `main`）搬到 repo 外，再 `git merge --ff-only`；在 `tools/` 跑 `npm ci`，`core.hooksPath` 是相對的 `.githooks`（共用的 `.git/config`）。這個 worktree 也跑了，同樣是相對的。
    - 其他三個 worktree（`ai-cards-materials-0a4b27`、`edit-markup-2ba4bd`、`progress-board-382fc5`，別的 session 的）還在沒有第一步的版本，沒有 `tools/package.json`，不裝也不改設定：它們的 `config.worktree` 把 `core.hooksPath` 設成主資料夾 `.githooks` 的絕對路徑，主資料夾的新 hook 轉給它們自己的舊 hook。併進 `main` 後要在 `tools/` 跑 `npm ci`（hook 缺 `tools/node_modules` 時會提示）。
    - backlog〈已知的限制〉的「舊版的 hook 不會轉交」那一列刪掉：開 worktree 的工具指到的是主資料夾，主資料夾已經是會轉交的新版，過渡期結束。
    - Pages：Progress board [run 44218946129](https://github.com/kuohappiness/Essence-Cards/actions/runs/44218946129) 成功；`roadmap.html`、`progress-map-list.html`、`progress-map-board.html` 都回 200，進度白板是合併後的內容。
    - 舊 `Essence-Capture` repo：`AGENTS.md` 與 `README.md` 改成開發在這個 repo 的 `plugins/capture/`、那個 repo 之後放發布檔、現在不放程式，在它的 `main` commit `af34daa` 並 push（作者用和這個 repo 相同的 GitHub noreply：那個 repo 沒設 repo 層級的信箱，全域的是個人信箱）。

**另外看到的**：

- 新開的 Windows worktree 取出的 `docs/syntax.md` 是 CRLF，Cards 的 deck 測試會失敗（原本就有的情況，探針 worktree 又遇到一次）；把工作檔轉成 LF 後通過。§10 之後 pre-commit 的副本一律取出成 LF，commit 不再受影響；自己在工作樹跑 `npm run check` 時還是要轉。
- `tools/` 的 `npm ci` 報 3 個高風險，都是 secretlint 13 的相依 `picomatch` 4.0.7（ReDoS，GHSA-fc5q-39xc-vjpf）；合併前根目錄的鎖檔就是同一版。只在開發工具、比對的樣式是自己的設定，CI 的稽核是 `--omit=dev`，不受影響；`npm audit fix --force` 會降回 secretlint 12，這一步不處理。
- CI 每個 job 都有 GitHub 的警告：`actions/checkout@v4`、`actions/setup-node@v4` 用的 Node.js 20 已經停止支援。`main` 原本就有，不在這一步改。

延後的測試：無（第 1～4 項的測試在 Windows 本機與 CI 的 Linux 都跑過；檔名有換行那一例只在 Linux 跑，CI 通過。第 14 項是合併後的步驟，不是延後的測試）。

## 第一批的紀錄

D-208 第 5 點：第二步（Cards 搬家）開工前，用這些紀錄核對做法。從第一步合併起，到第二步寫任務說明為止，做 Capture、Mindboard、Cards 或跨外掛工作的對話，遇到下面三種事就在這裡加一列；外掛的 AGENTS.md 會提醒。第一步本身記第一列（Capture 從沒設過的檢查，這次一次到位）。

- **一起改的檔案**：一件任務或一個 commit 同時改到兩個以上外掛，或外掛加最上層共用的（`node tools/dispatch.ts --range <base> <head> --explain` 列得出來）。記哪幾個檔、為什麼要一起改、分開的 repo 會要幾個 commit 或 PR。
- **共用檢查省下的步驟**：共用的工具、hook、skill 改一次三個外掛都生效；新外掛不用另外設的檢查。記省了什麼。
- **共用資料夾帶來的衝突**：push 被拒、`main` 上的文件撞到（`decisions.md` 編號、roadmap 同一列）、別的外掛的檢查擋到自己、worktree 或本機資料夾撞到。記花了多少時間或 token 解決。

| 日期 | 種類 | 發生了什麼 | 省下或花掉 | 出處 |
|---|---|---|---|---|
| 2026-11-17 | 共用檢查省下的步驟 | 第一步一次設好共用檢查（文件、金鑰、本機路徑、skill 兩份一致、外掛之間不 import、進度白板讀得出來）、分派表、兩個 hook 與 CI 的 gate；Capture、Mindboard 寫第一行程式前就有。舊 `Essence-Capture` repo 從沒設過 hook 與 CI | 分開的 repo 要在 Capture、Mindboard 各設一次 hook、CI、金鑰與本機路徑掃描、文件檢查，之後改規則也要改兩三處；這裡改一次就生效 | 這份任務說明〈結果〉 |

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
   ├─ capture/                   AGENTS.md、CLAUDE.md、package.json、.gitignore、docs/backlog.md
   └─ mindboard/                 同上（沒有 .gitignore）
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

分派表 `tools/dispatch.ts` 照改到的路徑決定檢查誰，commit 與 CI 讀同一份：

- 只改 `plugins/<外掛>/`，就只裝、只檢查那個外掛。
- 改到兩個外掛都讀的規格（登錄在分派表，現在是轉錄稿格式所在的 `syntax.md`），讀它的外掛都檢查。
- 改到 Cards 的文件，commit 只跑寫到那個檔的測試，CI 跑 Cards 的完整檢查。
- 改到共用的工具、hook、CI，或判斷不了的路徑，三個外掛都檢查。

文件、金鑰、本機路徑、skill 一致與外掛之間不 import 這幾項共用檢查每次都跑，只要在 `tools/` 裝過。CI 最後的 gate 分得出「照表跳過」與「漏跑」。細節見 [quality.md〈檢查指令〉](agents/quality.md#檢查指令)。
````

## 附錄 B：外掛的 AGENTS.md

照這個寫，兩份只差名稱與定位；Capture 另加〈§5〉的底線（放在最前面）與 `.gitignore` 的說明。

````markdown
# Essence Mindboard 協作規則

最上層的 `AGENTS.md` 一體適用；這裡只寫 Mindboard 特有的。repo 的結構與每一層放什麼見最上層 `docs/architecture.md`〈repo 結構〉。

- **是什麼**：把知識架構視覺化的 Obsidian 外掛（D-076）；和 Cards 各自安裝、各自可用（D-006），Cards 保留對接的彈性（D-056）。
- **開工先讀**：`plugins/mindboard/docs/roadmap.md` 的〈現在在哪裡〉；還沒有 roadmap 時讀 `plugins/mindboard/docs/backlog.md`。（路徑都從 repo 的根寫起，免得和最上層的 `docs/` 搞混。）
- **文件放這個資料夾**：`plugins/mindboard/` 底下的 `docs/`、`tasks/`、`Claude Codex Discussion/`，第一份文件出現才建；和別的外掛共用的放最上層。建了 `plugins/mindboard/docs/roadmap.md` 就從最上層的 `docs/roadmap.md` 連過來（文件檢查會擋）。決定寫進最上層的 `docs/decisions.md`，狀態行下一行寫「適用：Mindboard」。
- **程式**：不 import 其他外掛與最上層的程式（D-208 第 10 點，`tools/check-plugin-imports.ts` 擋）。在這個資料夾 `npm ci`、`npm run check`；commit 時 hook 照分派表自動跑。
- **寫程式的第一個任務要一起做**：`npm run check` 換成型別、lint 與測試；建置產物加進 `.gitignore`；CI 的 job 加上建置與相依稽核；用了 `tsconfig` 的 `paths`、打包工具的 alias 或自訂 resolver 時，把解析後不出外掛的邊界加進測試（`check-plugin-imports` 看不到這些）；測試安裝的入口：從這個資料夾安裝、只拿這個外掛的產物，先裝到測試 vault 量一次，才裝到正式 vault。
- **檢查的範圍**：改到這個資料夾的任何檔，commit 與 CI 都跑這個外掛的完整檢查；超過 1 分鐘時照最上層 backlog 的技術債〈外掛只改文件也跑完整檢查〉定相關測試。
- **第一批的紀錄**：遇到一起改的檔案、共用檢查省下的步驟、共用資料夾帶來的衝突，寫進最上層 `tasks/one-repo-step-1.md`〈第一批的紀錄〉（D-208 第 5 點）。
````
