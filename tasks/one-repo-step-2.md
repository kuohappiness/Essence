# 三個外掛同一個 repo：第二步，Cards 搬進 `plugins/cards/`（D-208 第 8 點，給 Claude，本機執行）

狀態：規格寫好，等開工條件（`0.6.0` 裝好、iPhone 驗完）；開工前 Codex 查核見[查核請求](one-repo-step-2-plan-review.md)

遵守 repo 根目錄的 `AGENTS.md`。建議模型與推理等級：**Opus、高**（規劃與牽涉很多檔案的一致性檢查用 xhigh）。A 改到安裝、更新、備份、還原、跨版本比較的工具，也改 pre-commit、pre-merge-commit 與 CI，合併前做 L2；B 改分派表與文件檢查，合併前也做 L2（[quality.md〈高風險範圍〉](../docs/agents/quality.md#高風險範圍要做-l2)、第一步的做法）。

依據：[D-208](../docs/decisions.md#d-208-三個外掛在同一個-repo-開發每個外掛有自己的資料夾) 第 1、2、4、8、9、10 點；[第一步的任務說明](one-repo-step-1.md)（做法、〈結果〉、〈第一批的紀錄〉）；[architecture.md〈repo 結構〉](../docs/architecture.md#9-repo-結構-d-208)的目標圖；使用者 2026-11-18：`0.6.0` 裝好、iPhone 驗完就是穩定基線，搬家排在 AI 製卡第 4、5 批之前（[roadmap](../docs/roadmap.md#現在在哪裡)「三個外掛的 repo 架構」）。相關：[D-006](../docs/decisions.md#d-006-兩個獨立外掛)、[D-110](../docs/decisions.md#d-110-v1-外掛的程式結構)（第二步生效）、[D-117](../docs/decisions.md#d-117-技術債預防機械檢查全自動ai-審查只在關鍵點)、[D-143](../docs/decisions.md#d-143-歸檔原則每類文件都有終點不設字數上限)、[D-149](../docs/decisions.md#d-149-更新與相容版本紀錄讀取閘門與正式安裝)、[D-195](../docs/decisions.md#d-195-測試分兩類改不回來的做足其餘延後但不漏)、[D-212](../docs/decisions.md#d-212-claude-直接呼叫本機-codex任務開始時分本機或雲端)。

這一步分兩個 PR：**A 程式**（`src/`、`tests/`、Cards 的工具與設定搬進 `plugins/cards/`）先合併，**B 文件**（Cards 的文件、任務與討論稿搬進 `plugins/cards/`，三份共用文件逐段拆開）接著做。A 碰正式 vault 的工具，要穩定基線與演練；B 只改文件與讀文件的工具。兩個分開，A 的 L2 只看程式，停手改文件的時間也只到 B 的最後一段（〈停手時段〉）。

**不在這一步**：外掛 ID（`essence-cards`）、tag 的寫法（`v<版號>`）、Cards 寫進 vault 的任何格式、產品程式的行為（A 的 `src/` 一行都不改，驗收第 A2 項）；Capture、Mindboard 的程式；給別人裝的公開 repo 與發布流程（D-208 第 10 點）；Capture 要不要回 v1（D-206）。

## 和「不做」比較（D-153、D-177）

**不做**＝Cards 永遠留在根目錄，D-208 第 8 點放棄。現在的代價（2026-11-19 `main` 上量得到的）：

- **分派表要手動分兩份清單**：`tools/` 同時放共用的與 Cards 的工具，`tools/dispatch.ts` 的 `SHARED_TOOL`、`CARDS_TOOL` 逐檔列名，漏列就落到第 8 條「全部」。實例：D-212 新增的 `tools/codex.ts` 兩邊都沒列，`node tools/dispatch.ts --range 137967f~1 137967f --explain` 顯示「第 8 條（以上都不是）」，之後每改一次都跑三個外掛的完整檢查（Cards 本機約 600 秒，第一步〈結果〉第 6 項）；同一個 commit 的 `.claude/hooks/cloud-setup.mjs` 是程式，卻落到第 7 條當文件，只跑相關測試（它沒有測試，等於沒查）。
- **共用工具的型別、lint 與測試寄住在 Cards**：`tsconfig.json`、`eslint.config.js` 的範圍含 `tools/*.ts`，共用工具的 12 個測試檔在 `tests/`。做 Capture 或 Mindboard 的對話改一個共用工具，要裝 Cards 的根目錄（約 250 個套件）、跑 Cards 的完整檢查才驗得到。
- **Cards 不受外掛邊界保護**：`tools/check-plugin-imports.ts` 對根目錄只擋「進到 `plugins/`」，Cards 的測試現在直接 import 共用工具（例如 `tests/check-docs.test.ts`）；別的外掛做不到的事，Cards 做得到。
- **文件混在一起**：最上層 `tasks/` 117 份、`Claude Codex Discussion/` 94 份，幾乎都是 Cards 的；使用者要的「做 Mindboard 的對話不必翻 Cards 的任務與討論稿」（D-208 理由第 3 點）做不到。`README.md` 的標題還是 Essence Cards，新對話容易把整個 repo 當成 Cards（D-208 改名的理由）。

**做的代價與解法**：

- 停手：A 從搬家的 commit 到合併，不在別處改 Cards 的程式；B 只在最後重跑搬檔腳本到合併的那一段停手改文件（〈停手時段〉）。
- 約 390 個檔搬家、文件裡 192 個連到程式的連結要改：用腳本改、可以重跑，文件檢查擋漏掉的；`git mv` 保住歷史，驗收逐檔確認 `git log --follow` 接得到。
- 跨版本的工具（`compare-versions`、`update-vault`、讀舊版的測試）以後要認得兩種外掛根：寫成一個函式，判不出或兩邊都符合就停（D-208 第 8 點）。這是永久的成本，但只有一處。
- 指令換資料夾（`npm run check` 要在 `plugins/cards/` 跑，`npm run codex` 改成 `node tools/codex.ts`）：quality.md 與本機記憶跟著改；在根目錄打舊指令會因為沒有 `package.json` 直接失敗，不會默默跑錯。
- 共用工具要有自己的型別、lint、測試設定，`tools/` 的相依變多（ESLint、typescript-eslint、knip）：只有改到共用工具時才裝與跑，平常每次 commit 的共用檢查不變。
- 舊 PR 與討論稿裡指到 GitHub 上 `blob/main/src/…` 的網址會失效：repo 外的依賴只有使用者的書籤與已關閉的 PR，接受；repo 裡的連結全改。

**曾考慮的做法**：

- **A、B 一個 PR**：L2 要同時看程式與幾百份文件的搬移，文件也要停手到程式審完；分開時 A 的審查集中在會碰 vault 的部分。
- **只搬程式、文件留在最上層**：上面「文件混在一起」的代價留著，使用者定的目標（D-208 第 1 點）沒做完。
- **根目錄留一份只有 script 的 `package.json`，讓 `npm run check`、`npm run codex` 照舊**：多一個看起來像套件、其實不是的入口，分派表與 knip 都要特別處理；省下的只是指令的肌肉記憶。不採用。
- **共用工具的測試留在 Cards 的 `tests/`**：Cards 的測試要 import 外掛外的檔，`check-plugin-imports` 要開例外，和 D-208 第 10 點相反。

## 第一批紀錄的核對（D-208 第 5 點）

[〈第一批的紀錄〉](one-repo-step-1.md#第一批的紀錄)到這份說明寫好時只有一列：第一步一次設好共用檢查，Capture、Mindboard 不用各設一次。第一步合併後（`16cef58` 到 `fd65c8f`），Capture、Mindboard 都還沒開始寫程式，沒有「一起改的檔案」與「共用資料夾帶來的衝突」可記；紀錄沒有推翻第二步的做法，也還沒有新的證據。另外看到的兩件，寫進上面的比較：D-212 的 Codex 包裝與雲端 hook 在共用的 `tools/`、`.claude/hooks/` 寫一次就三個外掛都用得到（省下的步驟）；`tools/codex.ts` 被分派表判成「以上都不是」（兩份手寫清單的代價）。

## 停手時段

- **A**：開工前和使用者約好，從 §A6（搬家的 commit）rebase 到最新的 `main` 起，到 A 合併為止，別的分支與 `main` 不改 `src/`、`tests/`、`tools/` 的 Cards 工具與根目錄的 Cards 設定。§A1～§A5 期間別處照常改程式，A 開工時先列出開著的分支（2026-11-19 只有 `claude/poem-order-merged-docs`），還沒合併的先問使用者順序。文件照常改；§A6 的連結腳本在 rebase 之後重跑一次。
- **B**：準備（清單、腳本、工具調整）期間文件照常改；最後「rebase → 重跑搬檔與改連結的腳本 → 檢查 → 合併」那一段停手改文件，事先和使用者約時間。

## 本機或雲端（[quality.md〈本機或雲端〉](../docs/agents/quality.md#本機或雲端)）

整件在本機做：A、B 都要 Codex 的 L2（`node tools/codex.ts` 只能在本機叫），A 的演練碰測試 vault、Obsidian 與 Windows 的 junction。

| 在哪裡 | 做什麼 |
|---|---|
| 本機（一定） | §A7 的演練：測試 vault 的開發版、舊版重裝、舊 ZIP 還原、搬後的更新；Windows 的 junction 與路徑；開工前查核與 L2；合併後主資料夾的安裝與清理；改本機記憶 |
| 使用者（iPhone） | §A7 第 6 項：測試 vault 裝搬家後的建置，iPhone 打開、外掛載入、「版本」命令顯示這次的建置 |
| 雲端（一定） | A 合併後開一個雲端 session，看 `.claude/hooks/cloud-setup.mjs` 的開場訊息有 `tools`、`plugins/cards` 的 `npm ci`（驗收第 A11 項）；只讀不改 |
| GitHub | CI（含探針 PR）、PR 上的 Codex 自動審查（不取代 L2） |

## A｜程式

### A0 開工條件

1. `0.6.0` 裝到正式 vault、iPhone 驗完，穩定基線寫進 [`0.6.0` 清單](release-0.6.0.md#第五項升正式版)的〈結果〉（第五項第 10 步：tag `v0.6.0`、開發 commit、`.local/releases/0.6.0/` 的產物雜湊、iPhone 的結果）。
2. 和使用者約好〈停手時段〉；確認沒有別的 session 在用測試 vault（§A7 會換它的開發版）。
3. 開 worktree 與分支（例如 `claude/one-repo-step-2a`），在 `tools/` 與根目錄各 `npm ci`；新 worktree 取出的 `docs/syntax.md` 若是 CRLF 先轉 LF（第一步〈結果〉的另外看到的）。
4. 看[技術債表](../docs/backlog.md#技術債)觸發點已到的列：「外掛只改文件也跑完整檢查」的觸發點是外掛的檢查超過 1 分鐘，Cards 搬進 `plugins/` 就到了（§A3 的第 2 條處理，B 結案時刪那一列）。

### A1 搬的路徑

用 `git mv`，一個檔一個檔搬到 `plugins/cards/` 底下的同名路徑：

| 現在 | 搬到 |
|---|---|
| `src/`、`tests/`（共用工具的測試除外，見 §A2） | `plugins/cards/src/`、`plugins/cards/tests/` |
| `tools/` 的 Cards 工具：`build.mjs`、`build.d.mts`、`install.ts`、`install-vault.mjs`、`backup.ts`、`restore.ts`、`compare-versions.ts`、`compare/`、`update-vault.ts`、`locate.ts`、`vault-io.ts`、`node-files.ts`、`git.ts`、`exam-reminder.ts`、`bench-study.ts`、`export-compare.ts`、`knip.mjs`（就是 `tools/dispatch.ts` 的 `CARDS_TOOL`） | `plugins/cards/tools/` |
| `manifest.json`、`package.json`、`package-lock.json`、`tsconfig.json`、`eslint.config.js`、`knip.jsonc` | `plugins/cards/` |

- 建置產物（`main.js`、`main.js.map`、`styles.css`）在 `plugins/cards/` 產生；`.gitignore` 的 `/main.js`、`/styles.css` 改成 `/plugins/cards/main.js`、`/plugins/cards/styles.css`。
- 開發版裝到測試 vault 的方式不變：`tools/install.ts` 在 Cards 的根目錄建置、再複製到 vault（[quality.md〈檢查指令〉](../docs/agents/quality.md#檢查指令)的安裝那一項），只是根目錄換成 `plugins/cards/`。`.local/`（測試 vault 的登錄、正式產物、Codex 的回報）照舊在主資料夾：`localFolder` 用 git 的共用目錄找（`tools/install.ts:43-45`），`tools/codex.ts` 用 `git rev-parse --show-toplevel`，都和 Cards 在哪裡無關。
- Cards 的 `package.json` 的 `name`、`version` 不改；`scripts.check` 拿掉 `npm --prefix tools run check`（共用檢查由 hook 與 CI 的 shared job 跑，Cards 的檢查只管 Cards，§A2），`scripts.codex` 刪掉（§A2）。

### A2 留在最上層的

- `AGENTS.md`、`CLAUDE.md`、`README.md`（B 再改）、`.claude/`、`.agents/`、`.githooks/`、`.github/`、`.gitattributes`、`.gitignore`、`.secretlintrc.json`、`.ignore`、`docs/`、`tasks/`、`Claude Codex Discussion/`、`experiments/`（A 都不搬）。
- `tools/` 只剩共用的：`check-docs.ts`、`secretlint.mjs`、`check-local-paths.ts`、`check-skill-mirror.ts`、`check-plugin-imports.ts`、`progress-board*.ts`、`roadmap-board.ts`、`dispatch.ts`、`hooks.ts`、`ci-gate.ts`、`codex.ts`、`package.json` 與鎖檔，加上這一步新增的設定與 `tools/tests/`。
- **共用工具自己的完整檢查**：
  - `tools/` 加 `tsconfig.json`、ESLint 設定、knip 設定，`package.json` 加 `typecheck`、`lint`、`knip`、`test` 與合起來的 `self-check`；相依加 ESLint、typescript-eslint、knip（版本和 Cards 的一樣）。ESLint 的規則照現在對 `tools/*.ts` 與 `tests/**/*.ts` 生效的那些搬一份，Cards 專用的邊界規則（`src/` 的模組邊界、D-148）不搬。
  - 共用工具的測試用 `git mv` 搬到 `tools/tests/`：`block-dangerous-git`、`check-docs`、`ci-gate`、`codex`、`decisions-index`、`dispatch`、`hooks`、`local-paths`、`plugin-imports`、`progress-board`、`roadmap-board`、`skill-mirror` 的 `.test.ts`。`tests/quality.test.ts` 拆開：hook 那幾個測試（第 40～400 行附近：安裝 hook、D-141、L2-3、R2、兩個 hook 只呼叫 `tools/hooks.ts`、Q2）搬到 `tools/tests/`，ESLint 規則的測試留給 Cards。拆的時候先 `git mv` 整個檔到 `tools/tests/`，再把 ESLint 那幾個另存成 Cards 的檔：`git log --follow` 只接得到 `git mv` 的那一半，另一半在檔頭寫出處。
  - `tools/package.json` 的 `check`（每次 commit 的共用檢查）**不變**，不加測試：`hooks.test.ts` 每個案例 clone 一次（約 8 秒，第一步〈平台事實〉），放進每次 commit 會讓只改文件的 commit 也慢。共用工具的完整檢查由分派表決定什麼時候跑（§A3）。
  - `.claude/hooks/*.mjs` 算共用工具：`block-dangerous-git` 已有測試；`cloud-setup.mjs` 加一個測試（§A5）；`ci-status.mjs` 照舊沒有測試，但改到時跑共用工具的完整檢查。
- `tools/codex.ts` 歸共用工具；指令改成在 repo 根目錄 `node tools/codex.ts <類型> <請求檔> …`（請求檔的相對路徑照執行時的資料夾算）。`npm --prefix tools run codex` 會把資料夾換成 `tools/`，相對路徑就錯了，所以不設 npm script。

### A3 分派表（`tools/dispatch.ts`）

照順序比，第一條命中的算（現在的寫法照留）。新增對象**共用工具**（`tools`）：完整是在 `tools/` 跑 `npm run self-check`；相關測試是只跑 `tools/tests/` 裡寫到這個路徑的測試檔（例如 `tools/tests/decisions-index.test.ts` 讀真的 `docs/decisions.md`，現在改 `decisions.md` 會跑到它，搬出 Cards 之後不能因此少跑）。

| 順序 | 路徑 | 對象 |
|---|---|---|
| 1 | gitlink（子模組） | 擋下 |
| 2 | `plugins/cards/` 底下：`.md`，以及 `docs/`、`tasks/`、`Claude Codex Discussion/` 底下的檔 | Cards 相關測試 |
| 3 | `plugins/cards/` 底下其他的檔 | Cards 完整 |
| 4 | `plugins/capture/`、`plugins/mindboard/` 底下 | 那個外掛完整 |
| 5 | `plugins/` 底下其他的 | 全部 |
| 6 | 決定別的檢查怎麼跑的：`.githooks/`、`.github/workflows/`、`tools/dispatch.ts`、`tools/hooks.ts`、`tools/ci-gate.ts`、`.gitattributes`、`.gitignore` | 全部（含共用工具） |
| 7 | 其他共用工具：`tools/` 底下其他的檔（含 `tools/tests/`、`tools/package.json` 與鎖檔、設定）、`.claude/hooks/`、`experiments/tools/decisions-index.mjs`、`.secretlintrc.json` | 共用工具完整 |
| 8 | 共用規格的登錄表（A 照舊只有 `docs/syntax.md`） | 照登錄（Cards 相關測試、Capture 完整），加共用工具相關測試 |
| 9 | 最上層的文件：`docs/`、`tasks/`、`Claude Codex Discussion/`、`experiments/`、`.claude/`、`.agents/` 底下其他的檔，根目錄的 `.md` | Cards 相關測試、共用工具相關測試 |
| 10 | 以上都不是（例如根目錄新出現的設定檔） | 全部 |

- 「全部」＝共用檢查、共用工具、三個外掛都完整。CI 的跑法照舊把相關測試升成完整（Cards 與共用工具都是）。
- 第 6 條和第 7 條分開的理由：第 6 條的檔決定 hook 與 CI 怎麼分派、怎麼跑外掛，壞了可能讓外掛的檢查默默不跑，所以全部跑一次；其他共用工具（文件檢查、白板、Codex 包裝）只影響共用檢查本身，跑共用工具的完整檢查就夠，做 Capture 的對話改它們不必裝 Cards。和現在比，`tools/check-docs.ts` 這類的改動不再跑 Cards 的完整檢查（Cards 的測試不再測共用工具，跑了也驗不到它）。
- **相關測試的找法**（Cards）：在 `plugins/cards/tests/` 找寫到路徑字串的 `.test.ts`；改到的路徑在 `plugins/cards/` 底下時，用去掉 `plugins/cards/` 的路徑找（測試寫的是 `../docs/x.md` 這種相對 Cards 的路徑），在最上層時用原路徑找（從 `plugins/cards/tests/` 寫的是 `../../../docs/syntax.md`，含 `docs/syntax.md`）。`rules.ts` 的特例照舊（路徑換成 `plugins/cards/src/core/ai/rules.ts`）。兩種都比到時多跑幾個測試，不會少跑。
- A 的過渡（§A1～§A5 的 commit，Cards 還在根目錄）：`CARDS_TOOL`、`CARDS_CONFIG` 與根目錄的 `src/`、`tests/` 照舊排在共用工具那一條前面；§A6 搬家的 commit 刪掉它們，Cards 的資料夾從 `.` 換成 `plugins/cards`（`tools/hooks.ts` 的 `folder`、`tools/dispatch.ts`、`check.yml`、`cloud-setup.mjs` 同一個 commit 換）。
- 第 2 條讓 Cards 只改文件時照舊只跑相關測試，這就是技術債「外掛只改文件也跑完整檢查」對 Cards 的完成條件（找法與案例都在這一節）；B 搬進文件後才真的用到，B 結案時刪那一列裡 Cards 的部分。

**驗收用的例子**（寫進 `tools/tests/dispatch.test.ts`，`--staged` 與 `--range` 都測；Cards 的測試檔以實際搜尋為準）：

| 這次改的 | pre-commit 跑 | CI 跑 |
|---|---|---|
| 改 `plugins/cards/src/core/files.ts` | 共用、Cards 完整 | 共用、Cards |
| 改 `plugins/cards/tools/build.mjs` 或 `plugins/cards/package-lock.json` | 共用、Cards 完整 | 共用、Cards |
| 改 `plugins/cards/docs/syntax.md`（B 之後才有，A 用暫存 repo 測） | 共用、寫到 `docs/syntax.md` 的 Cards 測試 | 共用、Cards |
| 改 `plugins/cards/README.md`（沒有測試寫到它） | 共用 | 共用、Cards |
| 改 `tools/check-docs.ts`、`tools/tests/check-docs.test.ts`、`tools/codex.ts`、`tools/package-lock.json`、`.claude/hooks/cloud-setup.mjs` 或 `experiments/tools/decisions-index.mjs`（各一案） | 共用、共用工具 | 共用、共用工具 |
| 改 `tools/dispatch.ts`、`tools/hooks.ts`、`.githooks/pre-commit`、`.github/workflows/check.yml` 或 `.gitignore`（各一案） | 全部 | 全部 |
| 改 `docs/syntax.md`（A 期間還在最上層） | 共用、寫到它的 Cards 測試、Capture | 共用、Cards、Capture、共用工具 |
| 改 `docs/product.md`（沒有測試寫到它） | 共用 | 共用、Cards、共用工具 |
| 改 `docs/decisions.md` | 共用、`tools/tests/decisions-index.test.ts`（Cards 沒有測試寫到它時跳過） | 共用、Cards、共用工具 |
| 新增根目錄的 `package.json` 或 `tsconfig.json` | 全部 | 全部 |
| `git mv plugins/cards/src/a.ts plugins/mindboard/a.ts` | 共用、Cards 完整、Mindboard | 共用、Cards、Mindboard |
| `git mv tools/a.ts plugins/cards/tools/a.ts` | 共用、共用工具、Cards 完整 | 共用、共用工具、Cards |
| 第一步的例子（`plugins/mindboard/`、子模組、空 commit、中文與換行的檔名等） | 照舊 | 照舊 |

### A4 hook 與 CI

- **`tools/hooks.ts`**：`folder('cards')` 換成 `plugins/cards`；共用工具的檢查（完整與相關測試）和外掛一樣在暫存內容的副本跑（副本的 `tools/node_modules` 照舊用連結借）；最後那行多一段「共用工具：…」。Cards 要跑卻沒有 `plugins/cards/node_modules` 時擋下，說在 `plugins/cards/` 執行 `npm ci`。pre-merge-commit 照舊，判斷要不要等 CI 時也算共用工具。
- **`.github/workflows/check.yml`**：
  - cards job 的 `working-directory` 是 `plugins/cards`，只裝 `plugins/cards/`（不再裝 `tools/`，§A1 拿掉了 Cards 的 `check` 對共用檢查的呼叫），快取用 `plugins/cards/package-lock.json`；`fetch-depth: 0`、`npm run build`、`npm audit` 照舊。
  - 新增 tools job：plan 說要跑才跑，在 `tools/` `npm ci`、`npm run self-check`。
  - gate 的 `needs` 加 tools job；`tools/ci-gate.ts` 的 plan 輸出與檢查多一個旗標，摘要表多一列。
- **`.github/workflows/progress-board.yml`**：A 不改（B 才搬 roadmap 與 backlog）；觸發路徑沒有程式路徑。
- **`.claude/hooks/ci-status.mjs`**：照舊。

### A5 Cards 的工具、測試與試作場跟著改

- **建置**：`plugins/cards/tools/build.mjs` 的預設根目錄照舊是自己的上一層（搬後就是 `plugins/cards/`）。AI 製卡的規則檔（`src/core/ai/rules.ts` 的表）寫的是「repo 根目錄算的路徑」，A 期間規則檔還在最上層（`docs/card-rules/`、`experiments/t4/arch/`）：`build.mjs` 讀規則檔的基準和 Cards 的根分開成兩個選項（測試可以覆寫），搬家前兩者相同，§A6 的 commit 把規則檔的預設基準改成 Cards 的根往上兩層（repo 的根）；表裡的路徑不改，`rules.ts` 就不用動（驗收第 A2 項要 `src/` 不變）。
- **跨版本的工具認得兩種外掛根**（D-208 第 8 點）：在 Cards 的工具加一個函式，給 commit 回傳那個版本的 Cards 根：只有 `plugins/cards/manifest.json` 而且 `id` 是 `essence-cards` → `plugins/cards`；只有根目錄的 `manifest.json` 而且 `id` 是 `essence-cards` → `.`；兩個都有、都沒有、`id` 不對或讀不出來 → 丟錯「判不出 <commit> 的外掛根」，不猜。用到它的：
  - `compare-versions.ts` 的 `side`：讀版號（`git show <commit>:<根>/manifest.json`）、`npm ci` 的資料夾、交給轉接器的程式根都用那個版本自己的根。
  - `update-vault.ts`：舊版的基線 commit 照 `.local/releases/` 找，比較交給上面那一項。
  - 讀舊版程式的測試（`compare-versions`、`pick-old-version`、`ai-add-old-version` 的 clone 與借 `node_modules`）：checkout 舊 tag 後用同一個函式找根，借的是 `plugins/cards/node_modules`。
- **測試讀最上層的檔**：`new URL('../docs/…', import.meta.url)` 這類改成從 `plugins/cards/tests/` 算的 `../../../docs/…`（`ai-add`、`ai-materials`、`deck`、`errors`、`lock`、`study`、`check-syntax-pick` 等，以 `git grep` 為準）；讀 Cards 自己的檔（`new URL('../', …)`、`../src/…`）不用改。
- **`check-plugin-imports`**：規則照舊，搬家後自動涵蓋 Cards（`plugins/cards/` 底下的檔不能跑出 `plugins/cards/`）。最上層 `tools/` 的檔不能 import `plugins/`（現有規則，`tools/tests/` 也算）。
- **試作場**：`experiments/source-reading/`、`experiments/t4/`、`experiments/tools/deepen-threshold.ts` 這 7 個檔 import Cards 的 `src/`（`git grep -nE "(\.\./)+src/" -- experiments ':!experiments/plugin'`），改成 `plugins/cards/src/` 的相對路徑。`experiments/plugin/` 有自己的 `src/`，不動。
- **`cloud-setup.mjs`**：要裝的資料夾改成 `tools`、`plugins/cards`、`plugins/capture`、`plugins/mindboard`。加一個 `tools/tests/` 的測試：這份清單和 `check.yml` 裡每個 job 安裝的資料夾相同（照字面讀兩個檔比，CI 加了外掛 job 沒改這裡就紅燈），清單寫死的理由（雲端 session 開場時 PATH 上可能是 Node 22，不 import `.ts`）留在註解。
- **knip**：`plugins/cards/knip.jsonc` 只剩 Cards 一個專案（入口 `src/main.ts`、`tests/**/*.test.ts`、`tools/*.mjs`；`project` 加 `tools/*.ts`、`tools/compare/*.ts`）；`tools/` 的 knip 設定自己一份（入口照現在 `tools` 工作區的寫法）。

### A6 搬家的 commit

一個 commit：§A1 的 `git mv`，加上讓這個 commit 的 hook 過得了的最少修改：§A5 測試讀最上層檔的路徑、試作場的 import、`.gitignore`、Cards 資料夾的常數（§A3）、`cloud-setup.mjs` 的清單、`check.yml` 的資料夾、Markdown 的連結。

- **連結用腳本改**：文件檢查讀每個追蹤的 Markdown，連到搬走的檔會讓這個 commit 擋下，所以連結和搬檔同一個 commit。腳本找出所有解開後指到 §A1 搬走的路徑的 Markdown 連結（2026-11-19 有 192 個，在 `docs/`、`tasks/`、`Claude Codex Discussion/`、`experiments/`），換成新路徑的相對寫法，錨點照留；可以重跑（第二次執行不改任何字），rebase 之後再跑一次。腳本放 `experiments/tools/`，B 也用它。已完成的任務與討論稿只改連結的路徑，內文不改（D-143；D-208 第 9 點的例外只管 B 的搬檔）。
- 文件裡用反引號寫的程式路徑（不是連結）：現行入口（`AGENTS.md`、`docs/agents/`、`.claude/skills/`、`.agents/skills/`、`plugins/*/AGENTS.md`、architecture §9）在 §A8 改；決定、已完成的任務與討論稿是當時的紀錄，不改。
- commit 訊息寫明：純搬移之外改了哪幾類、為什麼要同一個 commit（hook 要過）。

### A7 演練（本機，D-208 第 8 點）

在**隔離的 clone**（`git clone --no-local` 到 repo 外的暫存資料夾，它有自己的 `.git`，所以 `.local/` 也是自己的，不會寫到主資料夾的正式產物）做；`.local/releases/0.6.0/` 複製進去。第 1～3 項用**演練 vault**：測試 vault 複製一份到 iCloud 以外的暫存資料夾，**不**登錄成測試 vault，clone 裡的工具就照正式 vault 的路徑走（正式安裝的條件、`.local/releases/`、發布前比較）。演練的版號在 clone 裡改成 `0.6.1`、在 clone 的 `main` 上打 tag `v0.6.1`，**不 push**；iCloud 的測試 vault 不裝這個版號（避免留下比 `main` 新的版本紀錄）。

1. **舊版重裝**：用搬家後的工具 `install-vault -- <演練 vault> --release 0.6.0`，vault 裡三個檔的雜湊和 `.local/releases/0.6.0/release.json` 相同。
2. **舊 ZIP 還原**：在 clone 的 `v0.6.0` worktree 用 `backup` 對演練 vault 做一份備份 ZIP，再用搬家後的 `restore` 與 `v0.6.0` 的 `restore` 各還原到演練 vault 的一份複本，兩份逐檔相同。
3. **搬後的 Windows 更新**：`update-vault` 把演練 vault 從 `0.6.0`（根目錄的外掛根）更新到 `0.6.1`（`plugins/cards` 的外掛根），發布前比較跑得完、報告是「可以比較」，差異只有建置版本。
4. **開發版**：在 clone 用搬家後的程式（版號照舊 `0.6.0`）`install-vault -- <測試 vault> --dev`（測試 vault 的登錄複製進 clone），在 Windows 版 Obsidian 跑「版本」命令，結果檔的 `BUILD` 是這次的建置；照 [quality.md〈Obsidian 相容性檢查〉](../docs/agents/quality.md#obsidian-相容性檢查)第 2 層重跑 `files`、`today`、`a3check`，結果和搬家前那次相同。
5. **跨過搬家的合併**：在 clone 裡，從搬家前的 commit 開一個只改 `src/core/deck/parse.ts` 一行的分支，合併進搬家後的分支，改動落在 `plugins/cards/src/core/deck/parse.ts`、沒有衝突（停手時段之外的分支，之後合併要靠這個）。
6. **iPhone 載入**（使用者）：測試 vault 裝搬家後的建置，iPhone 等 iCloud 同步後打開，外掛載入、「版本」命令顯示這次的建置。A 的 `main.js` 除了第一行以外和搬家前相同（驗收第 A3 項），所以只看載入與版本，不重跑功能。

演練完把測試 vault 換回 `main` 的開發版（或演練前的那一版），通知使用者。

### A8 文件

- `docs/agents/quality.md`〈檢查指令〉：安裝（`tools/`、`plugins/cards/`、外掛各自 `npm ci`）、`npm run check` 在 `plugins/cards/` 跑（或從根目錄 `npm --prefix plugins/cards run check`）、共用工具的完整檢查、建置與安裝的指令、分派表多一個對象、CI 多一個 job；〈高風險範圍〉與〈卡關時的升級〉的 `npm run codex` 改成 `node tools/codex.ts`；〈本機或雲端〉的 `cloud-setup` 一句跟著改。
- `docs/architecture.md` §9：「現在」那張圖改成 A 之後的樣子（程式已在 `plugins/cards/`，文件還在最上層）；〈每一類放哪裡〉程式那一列、〈commit 與 CI 怎麼檢查〉加共用工具。
- `docs/decisions.md` 的 D-110：狀態行後加一句「程式的位置照 D-208 第 8 點改在 `plugins/cards/`（第二步 A，日期）」；本文不改。
- `plugins/capture/AGENTS.md`、`plugins/mindboard/AGENTS.md`：寫到 Cards 位置的句子跟著改（有的話）。
- `docs/backlog.md`：〈三個外掛併進同一個 repo〉第二步那行改成狀態與連結；roadmap 那一列照進度改。
- **合併後**：主資料夾 `git pull`；`tools/` 與 `plugins/cards/` 各 `npm ci`；根目錄留下的 `node_modules/`、`main.js`、`styles.css` 是沒追蹤的舊產物，先問使用者再搬到 repo 外；本機記憶裡寫到根目錄指令的條目（`npm run install-vault`、`update-vault`、`backup`、`restore`、`npm run codex`）改成新的位置。

## B｜文件

A 合併後開工。D-208 第 9 點的一次性例外只限這一節列出、或 §B1 的清單列出的路徑。

### B0 開工條件

1. A 已合併；〈待使用者決定〉第 1 題有答案。
2. 用腳本產生**文件清單**（D-208 第 8 點「先列舊路徑、新路徑與引用處」）：每一份要搬的檔一列（舊路徑、新路徑、歸屬的理由、repo 裡連到它的次數），commit 進這份說明的附錄，再搬；清單是當下 `main` 的實況，所以在 B 開工時產生，不在這裡先寫死。

### B1 歸屬規則

- **最上層留**：`docs/decisions.md`、`docs/progress-map.md`、`docs/agents/`、`docs/ai-models.md`、`docs/archive/`、`docs/roadmap.md`（改成入口）、`docs/backlog.md`（只留跨外掛的：共用工具的技術債與已知的限制、repo 結構）、`docs/architecture.md` 與 `docs/product.md` 的共用段落（§B2）。
- **搬到 `plugins/cards/docs/`**：`syntax.md`（§1 照〈待使用者決定〉第 1 題）、`question-types.md`、`card-rules/`、`research/`、Cards 的 `plans/`、Cards 的 roadmap 與 backlog、`product.md` 與 `architecture.md` 的 Cards 段落。
- **任務、討論稿、規畫**：只講 Cards 的產品、程式、製卡規則、發布或實機測試的 → `plugins/cards/` 的同名資料夾；開發流程、品質流程、文件架構、repo 結構、AI 協作、三個外掛共同的規畫 → 最上層；兩邊都有或判不出的 → 留最上層（之後再搬只要一個 commit，搬錯要改連結）。2026-11-19 看起來留最上層的：`tasks/` 的 `agents-md-rewrite`、`archive-principles`、`auto-codex-rereview-trial`、`docs-architecture`、`local-folder-rename`、`one-repo-step-1*`、`one-repo-step-2*`、`roadmap-board`、`test-two-kinds-review`；討論稿的 `token-and-docs-workflow`、`code-quality-skill`、`docs-architecture`、`token-saving`、`fix-chains-and-rule-pruning`、`one-repo-three-plugins`、`future-plans-consolidation`、`one-repo-step-1-*`。其餘照規則在清單裡判。
- `README.md`：最上層改成 Essence 的入口（三個外掛各一行、連到各自的 roadmap 與 AGENTS.md）；Cards 現在的內容搬成 `plugins/cards/README.md`。
- `plugins/cards/AGENTS.md`（加一行的 `CLAUDE.md`）：照[第一步附錄 B](one-repo-step-1.md#附錄-b外掛的-agentsmd)的格式，加上最上層 `AGENTS.md` 裡只適用 Cards 的規則（例如「製卡規則的輸出格式要和 `docs/syntax.md` 一致」）。〈Code Review Rules〉留在最上層：GitHub 上的 Codex 審查讀不讀子資料夾的 AGENTS.md 沒驗過（〈平台事實〉），留在最上層一定讀得到。

### B2 三份共用文件逐段拆（D-208 第 8 點）

段落的歸屬照 §B1 的規則；下表是起點，實作時逐段確認，表照實際改：

| 文件 | 留最上層 | 搬到 Cards |
|---|---|---|
| `docs/product.md` | §1 北極星（D-001，全專案）；§3 的目標使用者（三個外掛各一行） | §1 的核心差異（D-114）；§2 成功標準；§3 其餘；§4 產品原則（只適用 Cards 的；全專案的留最上層，Cards 那份連過去）；§5 範圍 |
| `docs/architecture.md` | §3 的外掛分工表與 D-006、D-031、D-032、D-056 的段落（三個外掛的定位、關係、接點）；§9 repo 結構 | §1 術語表、§2 概念模型、§3 其餘、§4 平台、§5 資料存放、§6 AI 的位置、§7 製卡規則、§8 整條鏈的分工 |
| `docs/syntax.md` | §1 轉錄稿（看第 1 題） | §0、§2～§10 |

- **舊錨點**：三份文件被搬走的每個 `##` 標題留在原檔，標題下只留一行「搬到 Cards 的〈…〉（連結，D-208 第二步）」，外面連到舊錨點的照樣打得開（D-208 第 8 點「有外部依賴的舊錨點留一行轉往新頁」；`###` 以下不留，repo 裡的連結由腳本改）。整份搬走的檔不留空檔：repo 外連到它們的只有書籤（第一步 §5 的做法）。
- `rules.ts` 的規則檔路徑改成 `plugins/cards/docs/card-rules/…`（只改字串，嵌入的內容與雜湊不變，驗收第 B3 項）。這是 B 唯一改到 `src/` 的地方。

### B3 讀文件的工具

- `tools/check-docs.ts`：Cards 的任務對 `plugins/cards/docs/backlog.md`（現有的外掛規則已經這樣算）；`BEFORE_D195` 也放過 `plugins/cards/tasks/` 的同名舊任務（只放過清單上的檔名，其他外掛照查）。
- `tools/roadmap-board.ts`：正式 vault 的版本與「已完成」改從 `plugins/cards/docs/roadmap.md` 讀；最上層的 roadmap 只剩跨外掛的列與連到三份外掛 roadmap 的入口。
- `tools/progress-board-data.ts`：待補測的列數加上 Cards 的 backlog，說明那句跟著改。
- `tools/dispatch.ts`：登錄表照第 1 題改路徑；第 9 條（最上層的文件）照舊是 Cards 相關測試。
- `.github/workflows/progress-board.yml`：觸發路徑加 `plugins/*/docs/backlog.md`、`plugins/cards/docs/progress-map.md`（若有）。
- Cards 的測試讀文件的路徑改回相對 Cards 的 `../docs/…`。
- `.claude/skills/`、`.agents/skills/` 寫到 Cards 文件路徑的地方（例如 essence-decision 的 syntax.md）兩份一起改。

### B4 收尾

- `docs/architecture.md` §9：兩張圖合成一張（第二步之後），〈每一類放哪裡〉照實際；`AGENTS.md`〈開始工作前〉的「先讀 `docs/roadmap.md`」改成先讀最上層的入口，做 Cards 時讀 `plugins/cards/AGENTS.md`。
- 合併後：本機記憶裡寫到 Cards 文件路徑的條目跟著改；roadmap 的已完成寫一列；技術債「外掛只改文件也跑完整檢查」刪掉 Cards 的部分（Capture、Mindboard 照舊）。

## 驗收

**A**（`<基準>` 是 A 開工時的 `main`，`<搬家>` 是 §A6 的 commit，`<A>` 是要合併的 head）：

1. `git ls-files src tests manifest.json package.json package-lock.json tsconfig.json eslint.config.js knip.jsonc` 是空的；`tools/` 底下沒有 §A1 列的 Cards 工具；`plugins/cards/` 底下有它們。
2. `git diff -M --name-status <基準> <搬家>`：§A1 的每個檔都是一行 `R`，沒有同一個檔的 `D` 加 `A`；`src/` 底下的每一行都是 `R100`，而且 `git diff <基準> <A> -M -- src plugins/cards/src` 除了改名沒有內容差異（產品程式一行都沒改）。
3. **建置相同**：同一份程式在 `<基準>` 與 `<A>` 各建置一次正式版，`main.js` 除了第一行（`build=`）逐位元組相同，`styles.css` 相同，`embedRules()` 的結果 `deepEqual`。
4. **歷史接得到**：腳本對每個搬走的檔跑 `git log --follow --format=%H -- <新路徑>`，結果含 `<基準>` 以前改過它的最後一個 commit；印出檢查的檔數與接不到的清單（要是空的）。拆開的 `quality.test.ts`：`git mv` 的那一半（hook）接得到；另存的那一半（ESLint）檔頭註解寫「從 `tests/quality.test.ts`（<commit>）拆出」。
5. `plugins/cards/` 的 `npm run check`、`npm run build`，`tools/` 的 `npm run check` 與 `npm run self-check` 都通過；CI 的 cards job 沒有裝 `tools/`。
6. `tools/tests/dispatch.test.ts` 有 §A3 每一列的案例；`tools/tests/hooks.test.ts` 第一步的五種情況改成搬家後的路徑，加上「只改共用工具：只跑共用工具」「改 `.githooks/`：全部」；`tools/tests/ci-gate.test.ts` 有 tools 旗標的成功、跳過、要跑卻跳過、旗標不合法。
7. **外掛邊界**：在 `plugins/cards/tests/` 暫時加一個 import `../../../tools/check-docs.ts` 的檔，`check-plugin-imports` 擋下；在 `tools/tests/` 暫時 import `../../plugins/cards/src/core/files.ts`，也擋下；樣本不 commit。
8. **跨版本的外掛根**：Cards 工具的測試用暫存 repo 做四個 commit（只有根目錄的 manifest、只有 `plugins/cards/` 的、兩個都有、都沒有），前兩個回傳正確的根，後兩個丟錯而且訊息有 commit；`compare-versions` 在暫存 repo 比「根目錄的版本」對「`plugins/cards` 的版本」跑得完。讀 `v0.2.0`～`v0.5.0` 的舊版測試照常通過。
9. **沒有殘留**：`git grep -nE "\]\(<?(\.\./)*(src|tests)/"` 在 Markdown 裡沒有結果（`experiments/plugin/` 自己的除外）；指到 §A1 列的 Cards 工具舊路徑的連結沒有；`git grep -nE "(\.\./)+src/" -- experiments ':!experiments/plugin'` 只剩指到 `plugins/cards/src/` 的；連結腳本第二次執行不改任何字；`node tools/check-docs.ts` 通過。
10. 在 `plugins/cards/` 建置後 `git status --porcelain` 是空的（產物有被忽略）。
11. **雲端**：`tools/tests/` 的清單測試通過；合併後開一個雲端 session，開場訊息有 `tools：npm ci 完成` 與 `plugins/cards：npm ci 完成`（或鎖檔沒變的跳過），而且沒有根目錄的 `npm ci`。結果寫進〈結果〉。
12. **GitHub 上實際跑**：A 的分支 push 後 plan 是「全部」、每個 job 都成功；探針分支開 draft PR 合併到 A 的分支：只改 `plugins/cards/src/` 一個檔 → 只有 cards（加 plan、shared、gate）；只改 `tools/check-docs.ts` → 只有 tools；只改 `docs/product.md` → cards 升成完整。run 的網址寫進〈結果〉，看完關 PR、刪探針分支。
13. §A7 演練的六項都做了，結果（雜湊、報告的結論、結果檔的 `BUILD`、iPhone 的畫面）寫進〈結果〉。
14. 外掛 ID、版號與 tag 的寫法沒變：`plugins/cards/manifest.json` 的 `id` 是 `essence-cards`、`version` 和 `<基準>` 的相同。
15. Windows 本機與 CI 的 Linux 都跑過第 4～8 項的測試。
16. 合併前 L2：新的 Codex session（`node tools/codex.ts l2 <請求檔>`，A 開工前還是 `npm run codex -- l2 …`），請求照 code-quality 的 `review.md` 寫在 `tasks/one-repo-step-2-review.md`。

**B**：

1. 〈文件清單〉在搬檔之前 commit；每一列的新路徑存在、舊路徑不存在（三份拆開的文件除外）；腳本對每一列跑 `git log --follow` 接得到搬之前的歷史（相似度低的照第一步的經驗加 `-M30%`，用了就在清單註明）。
2. `node tools/check-docs.ts` 通過；`git grep` 連到清單上舊路徑的連結沒有。
3. 三份拆開的文件：搬家前每個 `##` 的錨點在原檔都還在（腳本先存一份清單再比）；`embedRules()` 的結果和 B 之前 `deepEqual`。
4. 分派表：改 `plugins/cards/docs/syntax.md` 跑寫到它的 Cards 測試（找得到，不是空的）；改最上層的轉錄稿格式（照第 1 題）跑 Capture 與 Cards 的相關測試。
5. 進度白板：Pages 跑成功；`roadmap.html` 有 Cards 的列與正式 vault 的版本；`progress-map` 的待補測數含 Cards 的 backlog；手機寬度（375px）照 [roadmap-board 任務](roadmap-board.md)看一次。
6. `plugins/cards/tasks/` 的舊任務（`w3.md` 等）照舊被 `BEFORE_D195` 放過；Mindboard 的同名任務照查（第一步的測試照留）。
7. 合併前 L2（B 改到分派表與文件檢查）。

## 平台事實

送 L2 之前跑完；跑不了的標待驗，寫進審查請求的〈驗證方式〉。

| 假設 | 探針與環境 | 結果 |
|---|---|---|
| `.local/` 的位置和 Cards 在哪裡無關 | 讀程式：`tools/install.ts:43-45` 用 `--git-common-dir`；`tools/codex.ts:148` 用 `--show-toplevel` | 成立（2026-11-19 讀程式） |
| 分派表把 `tools/codex.ts` 判成第 8 條、`.claude/hooks/cloud-setup.mjs` 判成第 7 條 | `node tools/dispatch.ts --range 137967f~1 137967f --explain`（2026-11-19，Windows） | 成立 |
| 一個 commit 搬約 390 個檔，`git diff -M` 全部認成改名，`git log --follow` 跨得過 | 演練的 clone（Windows、Git 2.52） | 待驗（驗收第 A2、A4 項） |
| 搬家前從舊路徑開的分支，合併進搬家後的分支時改動落到新路徑 | §A7 第 5 項 | 待驗 |
| esbuild 的 `absWorkingDir` 換成 `plugins/cards` 後，`main.js` 除了第一行相同（註解裡的路徑是相對的） | 驗收第 A3 項 | 待驗 |
| ESLint 的 flat config、knip 的設定、`tsconfig.json` 的 `include` 都以設定檔所在的資料夾為基準，整份搬進 `plugins/cards/` 不用改寫法 | §A6 的 commit 跑 `npm run check` | 待驗 |
| `plugins/cards/tools/*.ts` 從 `plugins/cards/node_modules` 找到相依；Cards 的工具用了只在 `tools/` 的相依時會失敗（不會默默借到） | 拿掉 `tools/node_modules` 跑 Cards 的檢查（CI 的 cards job 就是這樣） | 待驗 |
| 讀舊 tag 的測試（舊版是根目錄的外掛根）借 `plugins/cards/node_modules` 跑得起來 | 驗收第 A8 項 | 待驗 |
| 雲端 session 的 `CLAUDE_PROJECT_DIR` 是 repo 根，`cloud-setup.mjs` 在 `plugins/cards/` 跑得了 `npm ci` | 驗收第 A11 項（合併後，雲端） | 待驗 |
| GitHub 上的 Codex 審查讀不讀 `plugins/cards/AGENTS.md` | 沒有探針；§B1 把〈Code Review Rules〉留在最上層，不依賴它 | 不依賴 |

## 待使用者決定

1. 💬 **轉錄稿格式（`syntax.md` §1）在 B 搬到最上層，還是留在 Cards 等第一個 Capture 任務？** D-208 第 6 點說「第一個需要共同規格的 Capture 任務」搬，第 8 點說第二步把 `syntax.md` 拆成共用與 Cards 專用；第二步先到時兩點的時機衝突。
   - Claude 的建議：B 就搬到最上層（例如 `docs/transcript.md`），原節留錨點與一行連結；第 6 點的另一半（Capture 寫、Cards 讀的測試讀同一份自編範例、已部署讀端的相容檢查）照舊等 Capture 的任務。理由：只搬一次；不然 `syntax.md` 先整份進 `plugins/cards/`，Capture 讀規格要讀進 Cards 的資料夾，分派表也要讓登錄表排在外掛資料夾那一條前面，之後再搬出來一次。
   - 留在 Cards 的好處：B 少一件事；代價如上。
   - 這題只擋 B，不擋 A。

## 技術債

- 這一步本身不延後測試。A 的演練與驗收都是第 1 類（更新、備份還原、舊版讀得到的東西），合併前做完。
- 到期的：「外掛只改文件也跑完整檢查」，見 §A0 第 4 項與 §A3。

## 結果

延後的測試：（實作後填）
