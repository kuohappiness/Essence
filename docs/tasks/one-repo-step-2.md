# 三個外掛同一個 repo：第二步，Cards 搬進 `plugins/cards/`（D-208 第 8 點，給 Claude，本機執行）

狀態：規格寫好，開工前 Codex 查核四輪後雙方一致（[請求](one-repo-step-2-plan-review.md)、[報告與回應](<../Claude Codex Discussion/2026-11-19-one-repo-step-2-plan-review.md>)）；2026-11-19 照 [D-213](../decisions.md#d-213-任務與討論稿放進-docs外掛專用的放外掛的-docs) 改 B：任務與討論稿搬進 `docs/` 底下（B 的 L2 一起看，沒有另外送查）；A 開工要等 `0.6.0` 裝好、iPhone 驗完；〈待使用者決定〉第 1 題 2026-11-20 定案（B 就搬）；A 已合併進 `main`（2026-11-20，[PR #27](https://github.com/kuohappiness/Essence/pull/27)），驗收全部完成；B 開工（2026-11-20，分支 `claude/serene-payne-bfeb06`）：§B0 做完，[文件清單](one-repo-step-2-inventory.md)已 commit；B 已合併進 `main`（2026-11-21，[PR #28](https://github.com/kuohappiness/Essence/pull/28)），驗收全部完成（〈結果〉的〈B 的進度〉）

遵守 repo 根目錄的 `AGENTS.md`。建議模型與推理等級：**Opus、高**（規劃與牽涉很多檔案的一致性檢查用 xhigh）。A 改到安裝、更新、備份、還原、跨版本比較的工具，也改 pre-commit、pre-merge-commit 與 CI，合併前做 L2；B 改分派表與文件檢查，合併前也做 L2（[quality.md〈高風險範圍〉](../agents/quality.md#高風險範圍要做-l2)、第一步的做法）。

依據：[D-208](../decisions.md#d-208-三個外掛在同一個-repo-開發每個外掛有自己的資料夾) 第 1、2、4、8、9、10 點；[第一步的任務說明](one-repo-step-1.md)（做法、〈結果〉、〈第一批的紀錄〉）；[architecture.md〈repo 結構〉](../architecture.md#9-repo-結構-d-208)的目標圖；使用者 2026-11-18：`0.6.0` 裝好、iPhone 驗完就是穩定基線，搬家排在 AI 製卡第 4、5 批之前（[roadmap](../roadmap.md#現在在哪裡)「三個外掛的 repo 架構」）。相關：[D-006](../decisions.md#d-006-兩個獨立外掛)、[D-110](../decisions.md#d-110-v1-外掛的程式結構)（第二步生效）、[D-117](../decisions.md#d-117-技術債預防機械檢查全自動ai-審查只在關鍵點)、[D-143](../decisions.md#d-143-歸檔原則每類文件都有終點不設字數上限)、[D-149](../decisions.md#d-149-更新與相容版本紀錄讀取閘門與正式安裝)、[D-195](../decisions.md#d-195-測試分兩類改不回來的做足其餘延後但不漏)、[D-212](../decisions.md#d-212-claude-直接呼叫本機-codex任務開始時分本機或雲端)。

這一步分兩個 PR：**A 程式**（`src/`、`tests/`、Cards 的工具與設定搬進 `plugins/cards/`）先合併，**B 文件**（Cards 的文件、任務與討論稿搬進 `plugins/cards/docs/`，留在最上層的任務與討論稿搬進 `docs/`（D-213），三份共用文件逐段拆開）接著做。A 碰正式 vault 的工具，要穩定基線與演練；B 只改文件與讀文件的工具。兩個分開，A 的 L2 只看程式，停手改文件的時間也只到 B 的最後一段（〈停手時段〉）。

**不在這一步**：外掛 ID（`essence-cards`）、tag 的寫法（`v<版號>`）、Cards 寫進 vault 的任何格式、產品程式的行為（A 的 `src/` 一行都不改，驗收第 A2 項）；Capture、Mindboard 的程式；給別人裝的公開 repo 與發布流程（D-208 第 10 點）；Capture 要不要回 v1（D-206）。

## 和「不做」比較（D-153、D-177）

**不做**＝Cards 永遠留在根目錄，D-208 第 8 點放棄。現在的代價（2026-11-19 `main` 上量得到的）：

- **分派表要手動分兩份清單**：`tools/` 同時放共用的與 Cards 的工具，`tools/dispatch.ts` 的 `SHARED_TOOL`、`CARDS_TOOL` 逐檔列名，漏列就落到第 8 條「全部」。實例：D-212 新增的 `tools/codex.ts` 兩邊都沒列，單獨改它也判成「第 8 條（以上都不是）」、三個外掛都跑完整檢查（2026-11-19 用 `dispatch()` 對只有 `M tools/codex.ts` 的改動實測；Cards 的完整 hook 一次約 600 秒，第一步〈結果〉第 6 項）；`.claude/hooks/cloud-setup.mjs` 是程式，卻落到第 7 條當文件，只跑相關測試（它沒有測試，等於沒查）。分類錯可以在現在的結構裡個別修，但每新增一個工具都要再分一次；搬家後 `tools/` 整個是共用的，才能照資料夾分派。
- **共用工具的型別、lint 與測試寄住在 Cards**：`tsconfig.json`、`eslint.config.js` 的範圍含 `tools/*.ts`，共用工具的 12 個測試檔在 `tests/`。做 Capture 或 Mindboard 的對話改一個共用工具，要裝 Cards 的根目錄（約 250 個套件）、跑 Cards 的完整檢查才驗得到。
- **Cards 不受外掛邊界保護**：`tools/check-plugin-imports.ts` 對根目錄只擋「進到 `plugins/`」，Cards 的測試現在直接 import 共用工具（例如 `tests/check-docs.test.ts`）；別的外掛做不到的事，Cards 做得到。
- **文件混在一起**：最上層 `tasks/` 117 份、`Claude Codex Discussion/` 94 份，幾乎都是 Cards 的；使用者要的「做 Mindboard 的對話不必翻 Cards 的任務與討論稿」（D-208 理由第 3 點）做不到。`README.md` 的標題還是 Essence Cards，新對話容易把整個 repo 當成 Cards（D-208 改名的理由）。

**做的代價與解法**：

- 停手：A 從搬家的 commit 到合併，不在別處改 Cards 的程式；B 只在最後重跑搬檔腳本到合併的那一段停手改文件（〈停手時段〉）。
- 約 390 個檔搬家、文件裡 192 個連到程式的連結要改：用腳本改、可以重跑，文件檢查擋漏掉的；`git mv` 保住歷史，驗收逐檔確認 `git log --follow` 接得到。
- 跨版本的工具（`compare-versions`、`update-vault`、讀舊版的測試）以後要認得兩種外掛根：寫成一個函式，判不出或兩邊都符合就停（D-208 第 8 點）。這是永久的成本，但只有一處。
- 指令換資料夾（`npm run check` 要在 `plugins/cards/` 跑，`npm run codex` 改成 `node tools/codex.ts`）：quality.md 與本機記憶跟著改；在根目錄打舊指令會因為沒有 `package.json` 直接失敗，不會默默跑錯。
- 共用工具要有自己的型別、lint、測試設定，`tools/` 的相依變多（ESLint、typescript-eslint、knip）：只有改到共用工具時才裝與跑，平常每次 commit 的共用檢查不變。
- A 合併到 B 合併之間是第二種過渡狀態（程式在 `plugins/cards/`、文件還在最上層）：測試讀文件要寫 `../../../docs/…`、規則檔的基準和 Cards 的根分開、分派表的第 9 條還把最上層文件算給 Cards；B 再改一次並重驗 `rules.ts` 與建置的規則檔（驗收第 B3 項）。這段愈短愈好，B 緊接著 A 做。
- 舊 PR 與討論稿裡指到 GitHub 上 `blob/main/src/…` 的網址會失效：repo 外的依賴只有使用者的書籤與已關閉的 PR，接受；repo 裡的連結全改。

**曾考慮的做法**：

- **A、B 一個 PR**：L2 要同時看程式與幾百份文件的搬移，文件也要停手到程式審完；分開時 A 的審查集中在會碰 vault 的部分。
- **只搬程式、文件留在最上層**：上面「文件混在一起」的代價留著，使用者定的目標（D-208 第 1 點）沒做完。
- **根目錄留一份只有 script 的 `package.json`，讓 `npm run check`、`npm run codex` 照舊**：多一個看起來像套件、其實不是的入口，分派表與 knip 都要特別處理；省下的只是指令的肌肉記憶。不採用。
- **共用工具的測試留在 Cards 的 `tests/`**：Cards 的測試要 import 外掛外的檔，`check-plugin-imports` 要開例外，和 D-208 第 10 點相反。

## 第一批紀錄的核對（D-208 第 5 點）

[〈第一批的紀錄〉](one-repo-step-1.md#第一批的紀錄)到這份說明寫好時只有一列：第一步一次設好共用檢查，Capture、Mindboard 不用各設一次。第一步合併後（`16cef58` 到 `fd65c8f`），Capture、Mindboard 都還沒開始寫程式，沒有「一起改的檔案」與「共用資料夾帶來的衝突」可記；紀錄沒有推翻第二步的做法，也還沒有新的證據。另外看到的兩件，寫進上面的比較：D-212 的 Codex 包裝與雲端 hook 在共用的 `tools/`、`.claude/hooks/` 寫一次就三個外掛都用得到（省下的步驟）；`tools/codex.ts` 被分派表判成「以上都不是」（兩份手寫清單的代價）。

## 停手時段

- **A**：開工前和使用者約好，從 A 開工到合併，別的分支與 `main` 不改 `src/`、`tests/`、`tools/`（共用與 Cards 的都算）、根目錄的 Cards 設定，以及 A 也要改的共用輸入：`.githooks/`、`.github/workflows/`、`.claude/hooks/`、`.claude/settings.json`、`.gitignore`、`.gitattributes`。開工時先列出開著的分支（2026-11-19 只有 `claude/poem-order-merged-docs`），還沒合併的先問使用者順序。文件照常改；最後一次 rebase 之後重跑連結腳本，並重跑受影響的驗收（至少第 A2～A6、A9 項）。
- **B**：準備（清單、腳本、工具調整）期間文件照常改；最後「rebase → 重跑搬檔與改連結的腳本 → 檢查 → 合併」那一段停手改文件，事先和使用者約時間。

## 本機或雲端（[quality.md〈本機或雲端〉](../agents/quality.md#本機或雲端)）

整件在本機做：A、B 都要 Codex 的 L2（`node tools/codex.ts` 只能在本機叫），A 的演練碰測試 vault、Obsidian 與 Windows 的 junction。

| 在哪裡 | 做什麼 |
|---|---|
| 本機（一定） | §A7 的演練：測試 vault 的開發版、舊版重裝、舊 ZIP 還原、搬後的更新；Windows 的 junction 與路徑；開工前查核與 L2；合併後主資料夾的安裝與清理；改本機記憶 |
| 使用者（iPhone） | §A7 第 6 項：測試 vault 裝搬家後的建置，iPhone 打開、外掛載入、「版本」命令顯示這次的建置 |
| 雲端（一定） | 合併前在 A 的分支、合併後在 `main` 各開一個雲端 session，看 `.claude/hooks/cloud-setup.mjs` 的開場訊息每個資料夾的結果（驗收第 A11 項）；只讀不改 |
| GitHub | CI（含探針 PR）、PR 上的 Codex 自動審查（不取代 L2） |

## A｜程式

### A0 開工條件

1. `0.6.0` 裝到正式 vault、iPhone 驗完，穩定基線寫進 [`0.6.0` 清單](../../apps/Cards/docs/tasks/release-0.6.0.md#第五項升正式版)的〈結果〉（第五項第 10 步：tag `v0.6.0`、開發 commit、`.local/releases/0.6.0/` 的產物雜湊、iPhone 的結果）。
2. 和使用者約好〈停手時段〉；確認沒有別的 session 在用測試 vault（§A7 會換它的開發版）。
3. 開 worktree 與分支（例如 `claude/one-repo-step-2a`），在 `tools/` 與根目錄各 `npm ci`；新 worktree 取出的 `docs/syntax.md` 若是 CRLF 先轉 LF（第一步〈結果〉的另外看到的）。
4. 看[技術債表](../backlog.md#技術債)觸發點已到的列：「外掛只改文件也跑完整檢查」的觸發點是外掛的檢查超過 1 分鐘，Cards 搬進 `plugins/` 就到了（§A3 的第 2 條處理，B 結案時刪那一列）。

### A1 搬的路徑

用 `git mv`，一個檔一個檔搬到 `plugins/cards/` 底下的同名路徑：

| 現在 | 搬到 |
|---|---|
| `src/`、`tests/`（共用工具的測試除外，見 §A2） | `plugins/cards/src/`、`plugins/cards/tests/` |
| `tools/` 的 Cards 工具：`build.mjs`、`build.d.mts`、`install.ts`、`install-vault.mjs`、`backup.ts`、`restore.ts`、`compare-versions.ts`、`compare/`、`update-vault.ts`、`locate.ts`、`vault-io.ts`、`node-files.ts`、`git.ts`、`exam-reminder.ts`、`bench-study.ts`、`export-compare.ts`、`knip.mjs`（就是 `tools/dispatch.ts` 的 `CARDS_TOOL`） | `plugins/cards/tools/` |
| `manifest.json`、`package.json`、`package-lock.json`、`tsconfig.json`、`eslint.config.js`、`knip.jsonc` | `plugins/cards/` |

- 建置產物（`main.js`、`main.js.map`、`styles.css`）在 `plugins/cards/` 產生；`.gitignore` 的 `/main.js`、`/styles.css` 改成 `/plugins/cards/main.js`、`/plugins/cards/styles.css`。
- 開發版裝到測試 vault 的方式不變：`tools/install.ts` 在 Cards 的根目錄建置、再複製到 vault（[quality.md〈檢查指令〉](../agents/quality.md#檢查指令)的安裝那一項），只是根目錄換成 `plugins/cards/`。`.local/` 的位置和 Cards 在哪裡無關，照舊：測試 vault 的登錄與正式產物由 `localFolder` 用 git 的共用目錄找（`tools/install.ts:43-45`，從 worktree 跑也是主資料夾的）；Codex 的回報在 `tools/codex.ts` 用 `git rev-parse --show-toplevel` 找到的那個工作樹的 `.local/codex/`（從 worktree 跑就在那個 worktree）。
- Cards 的 `package.json` 的 `name`、`version` 不改；`scripts.check` 拿掉 `npm --prefix tools run check`（共用檢查由 hook 與 CI 的 shared job 跑，Cards 的檢查只管 Cards，§A2），`scripts.codex` 刪掉（§A2）。
- **升正式版的檢查不能因此變少**：`update-vault --check` 在備份之前跑 Cards 的 `npm run check`（`tools/update-vault.ts:55-60,141`），現在它含共用檢查，`npm test` 也含共用工具的測試（`dispatch`、`hooks`、`ci-gate` 等）。拿掉之後，`update-vault` 在同一步明確跑：`tools/` 的 `npm run check` 與 `npm run self-check`（含 `tools/tests/` 的測試）、Cards 的 `npm run check`，任一段沒過就停，還沒開始備份與安裝（驗收第 A17 項）。

### A2 留在最上層的

- `AGENTS.md`、`CLAUDE.md`、`README.md`（B 再改）、`.claude/`、`.agents/`、`.githooks/`、`.github/`、`.gitattributes`、`.gitignore`、`.secretlintrc.json`、`.ignore`、`docs/`、`tasks/`、`Claude Codex Discussion/`、`experiments/`（A 都不搬）。
- `tools/` 只剩共用的：`check-docs.ts`、`secretlint.mjs`、`check-local-paths.ts`、`check-skill-mirror.ts`、`check-plugin-imports.ts`、`progress-board*.ts`、`roadmap-board.ts`、`dispatch.ts`、`hooks.ts`、`ci-gate.ts`、`codex.ts`、`package.json` 與鎖檔，加上這一步新增的設定與 `tools/tests/`。
- **共用工具自己的完整檢查**：
  - `tools/` 加 `tsconfig.json`、ESLint 設定、knip 設定，`package.json` 加 `typecheck`、`lint`、`knip`、`test` 與合起來的 `self-check`；相依加 ESLint、typescript-eslint、knip（版本和 Cards 的一樣）。ESLint 的規則照現在對 `tools/` 的 `.ts`、`.mjs` 與測試檔生效的那些搬一份（現在的 `moduleFiles` 含 `.mjs`，`eslint.config.js:13`），Cards 專用的邊界規則（`src/` 的模組邊界、D-148）不搬。knip 的入口要加 `tests/**/*.test.ts`（現在 `tools` 工作區只列 `*.{ts,mjs}`，`knip.jsonc:13-19`，照搬會漏掉測試）。
  - 共用工具的測試用 `git mv` 搬到 `tools/tests/`：`block-dangerous-git`、`check-docs`、`ci-gate`、`codex`、`decisions-index`、`dispatch`、`hooks`、`local-paths`、`plugin-imports`、`progress-board`、`roadmap-board`、`skill-mirror` 的 `.test.ts`。`tests/quality.test.ts` 拆開：hook 那幾個測試（第 40～400 行附近：安裝 hook、D-141、L2-3、R2、兩個 hook 只呼叫 `tools/hooks.ts`、Q2）搬到 `tools/tests/`，ESLint 規則的測試留給 Cards。分兩個 commit、各自過得了 hook：先在 `tests/` 裡把 ESLint 那幾個移到 Cards 的新檔（例如 `tests/eslint-rules.test.ts`，檔頭寫出處），`quality.test.ts` 只剩 hook 的部分，兩個都還在 Cards 的 `tests/` 照常跑；下一個 commit 再把只剩 hook 的 `quality.test.ts` 整檔 `git mv` 到 `tools/tests/`（只改取檔的路徑）。這樣 ESLint 的斷言一直在 Cards 的根用 Cards 的設定跑（`new ESLint()` 從執行的資料夾找設定，整檔先搬過去會用到 `tools/` 那份沒有邊界規則的設定），`git log --follow` 接得到 hook 那一半。
  - 搬過去的測試取檔的基準跟著改：`new URL('..', import.meta.url)` 從 `tests/` 是 repo 根，從 `tools/tests/` 變成 `tools/`（`hooks.test.ts` 拿它當 `git clone` 的來源）；讀 `.githooks/`、`.claude/`、`docs/decisions.md`、`experiments/tools/` 的路徑都要多一層。每個搬過去的測試檔都要確認真的載入、跑了（驗收第 A5 項逐檔核對）。
  - 測試搬過去的那個 commit，就要讓 hook 與 CI 跑得到它們（`self-check` 與分派表的共用工具對象先做好，§A3、§A4），不能有一段 commit 共用工具的測試哪裡都不跑。
  - `tools/package.json` 的 `check`（每次 commit 的共用檢查）**不變**，不加測試：`hooks.test.ts` 每個案例 clone 一次（約 8 秒，第一步〈平台事實〉），放進每次 commit 會讓只改文件的 commit 也慢。共用工具的完整檢查由分派表決定什麼時候跑（§A3）。
  - `.claude/hooks/*.mjs` 算共用工具：`block-dangerous-git` 已有測試；`cloud-setup.mjs` 加一個測試（§A5）；`ci-status.mjs` 照舊沒有測試，但改到時跑共用工具的完整檢查。
- `tools/codex.ts` 歸共用工具；指令改成在 repo 根目錄 `node tools/codex.ts <類型> <請求檔> …`（請求檔的相對路徑照執行時的資料夾算）。`npm --prefix tools run codex` 會把資料夾換成 `tools/`，相對路徑就錯了，所以不設 npm script。

### A3 分派表（`tools/dispatch.ts`）

照順序比，第一條命中的算（現在的寫法照留）。新增對象**共用工具**（`tools`）：完整是在 `tools/` 跑 `npm run self-check`；相關測試是只跑 `tools/tests/` 裡寫到這個路徑的測試檔（例如 `tools/tests/decisions-index.test.ts` 讀真的 `docs/decisions.md`，現在改 `decisions.md` 會跑到它，搬出 Cards 之後不能因此少跑）。

| 順序 | 路徑 | 對象 |
|---|---|---|
| 1 | gitlink（子模組） | 擋下 |
| 2 | `plugins/cards/` 底下：`.md`，以及 `docs/` 底下的檔（任務與討論稿也在裡面，D-213） | Cards 相關測試 |
| 3 | `plugins/cards/` 底下其他的檔 | Cards 完整 |
| 4 | `plugins/capture/`、`plugins/mindboard/` 底下 | 那個外掛完整 |
| 5 | `plugins/` 底下其他的 | 全部 |
| 6 | 決定別的檢查怎麼啟動、怎麼跑的：`.githooks/`、`.github/workflows/`、`tools/package.json`（`prepare` 設 `core.hooksPath`）、`.gitattributes`、`.gitignore`，以及**檢查的入口**：`.githooks/` 的 hook、`check.yml`、各外掛 `package.json` 的 scripts 直接寫到的 `tools/` 檔，加上 `tools/dispatch.ts`、`tools/hooks.ts`、`tools/ci-gate.ts`，與這些檔 import 到的 `tools/` 檔 | 全部（含共用工具） |
| 7 | 其他共用工具：`tools/` 底下其他的檔（含 `tools/tests/`、`tools/package-lock.json`、設定）、`.claude/hooks/`、`.claude/settings.json`（Claude Code 呼叫哪些 hook）、`experiments/tools/decisions-index.mjs`、`.secretlintrc.json` | 共用工具完整 |
| 8 | 共用規格的登錄表（A 照舊只有 `docs/syntax.md`） | 照登錄（Cards 相關測試、Capture 完整），加共用工具相關測試 |
| 9 | 最上層的文件：`docs/`、`tasks/`、`Claude Codex Discussion/`、`experiments/`、`.claude/`、`.agents/` 底下其他的檔，根目錄的 `.md` | Cards 相關測試、共用工具相關測試 |
| 10 | 以上都不是（例如根目錄新出現的設定檔） | 全部 |

- 「全部」＝共用檢查、共用工具、三個外掛都完整。CI 的跑法照舊把相關測試升成完整（Cards 與共用工具都是）。
- 第 6 條和第 7 條分開的理由：第 6 條的檔決定 hook 與 CI 怎麼分派、怎麼啟動、怎麼跑外掛，壞了可能讓外掛的檢查默默不跑，要用真的外掛檢查跑一次才看得出來，所以全部跑；其他共用工具（文件檢查、白板、Codex 包裝、雲端的 hook）只影響共用檢查或自己，它們的測試都在 `tools/tests/`，跑共用工具的完整檢查就驗得到，跑外掛的檢查反而驗不到它們。做 Capture 的對話改它們不必裝 Cards。和現在比，`tools/check-docs.ts` 這類的改動不再跑 Cards 的完整檢查。
- 第 6 條的「檢查的入口」不用手寫清單：`tools/tests/dispatch.test.ts` 從 `.githooks/` 的每個 hook、`.github/workflows/check.yml`、`plugins/*/package.json` 的 scripts 取字面寫到的 `tools/…` 路徑，加上 `dispatch.ts`、`hooks.ts`、`ci-gate.ts`，再用 `ts.preProcessFile`（`check-plugin-imports` 已在用）往下找 import 到的 `tools/` 檔，斷言每一個都命中第 6 條。之後有人讓 CI 的外掛 job 直接跑一個新工具、或讓 hook import 一個新檔卻沒改分派表，這個測試就紅燈。驗收含「接線已經在、這次只改被呼叫的檔」的案例（Codex 第二輪的例子：`check.yml` 的 cards job 直接跑 `node tools/check-card-output.mjs`，之後只改這支工具 → 全部）。**只**被 `progress-board.yml`（Pages）或共用檢查本身（`hooks.ts` 的 `SHARED_CHECKS` 與 `tools/package.json` 的 `check` 跑的那幾支）用到的工具不算入口：它們不影響外掛的檢查，共用檢查每次 commit 都用新版跑，壞了當場看得到。同一支工具只要也被上面任一個入口用到（例如外掛的 CI job 也直接跑某個共用檢查），就算入口、走第 6 條；排除只看「沒有被任何入口用到」，不看它有沒有同時是共用檢查。例子表有這種兩用的案例。
- 2026-11-19 照這個規則，入口有 `hooks.ts`（兩個 hook）、`check-local-paths.ts`（`commit-msg`）、`ci-gate.ts`（`check.yml`）與 `dispatch.ts`；`check-docs.ts`、`progress-board*.ts`、`roadmap-board.ts`、`codex.ts` 等落第 7 條。
- **只有雲端驗得到的**：`.claude/hooks/cloud-setup.mjs` 的內容，以及 `.claude/settings.json` 裡 `SessionStart` 怎麼接到它。`tools/tests/` 加一個測試：`settings.json` 的 `SessionStart` 指令寫到的檔存在，而且是 `.claude/hooks/cloud-setup.mjs`（路徑拼錯會讓雲端漏掉環境準備，現有的設定測試只看 `PreToolUse`）。改這兩處的任務，合併前在那個分支開一個**新的**雲端 session（沒有前一次留下的 `node_modules`）看開場訊息：hook 有跑；每個資料夾照預期：有相依的 `tools`、`plugins/cards` 一定是「`npm ci` 完成」（新 session 不接受「鎖檔沒變」的跳過，`npm ci` 失敗或找不到 `package.json` 都不算過），沒有相依的 `plugins/capture`、`plugins/mindboard` 是「沒有相依，跳過」；之後的指令用的是 Node 24；`core.hooksPath` 是 `.githooks`（quality.md〈本機或雲端〉寫進去，§A8）。分派表只負責跑它們的測試。
- **相關測試的找法**（Cards 與共用工具都一樣）：讀 Git 時用 repo 相對的路徑，交給 `node --test` 時用相對那個套件資料夾（`plugins/cards/`、`tools/`）的路徑，副本裡也在那個資料夾執行。一個改到的路徑，**原路徑與去掉 `plugins/cards/` 的路徑兩種都比**（在最上層的檔只有原路徑），任一種出現在測試檔裡就選；`rules.ts` 的特例也兩種都比（B 之後表裡寫的是 `plugins/cards/docs/card-rules/…`）。多比到時多跑幾個測試，不會少跑。
- **經過 helper 讀規格的測試**：`tests/helpers/add-cases.ts:8` 讀 `docs/syntax.md`，`ai-add-move.test.ts`、`ai-add-old-version.test.ts` 經由它讀，現在的找法選不到它們（Codex 第一輪對 `de3438f` 實測：改 `docs/syntax.md` 只選到 `ai-add`、`deck`、`errors`、`lock`、`study`）。這是現在就有的漏洞，A 一起補：helper（`tests/helpers/` 底下的檔）寫到這個路徑時，import 那個 helper 的測試也選（一層，用 `ts.preProcessFile` 取 import）。驗收用這兩個測試。
- A 的過渡（§A1～§A5 的 commit，Cards 還在根目錄）：`CARDS_TOOL`、`CARDS_CONFIG` 與根目錄的 `src/`、`tests/` 照舊排在共用工具那一條前面；§A6 搬家的 commit 刪掉它們，Cards 的資料夾從 `.` 換成 `plugins/cards`（`tools/hooks.ts` 的 `folder`、`tools/dispatch.ts`、`check.yml`、`cloud-setup.mjs` 同一個 commit 換）。
- 第 2 條讓 Cards 只改文件時照舊只跑相關測試，這就是技術債「外掛只改文件也跑完整檢查」對 Cards 的完成條件（找法與案例都在這一節）；B 搬進文件後才真的用到，B 結案時刪那一列裡 Cards 的部分。

**驗收用的例子**（寫進 `tools/tests/dispatch.test.ts`，`--staged` 與 `--range` 都測；每一案斷言**所有**對象的跑法（含該跳過的），相關測試的案例也斷言選到的測試檔；Cards 的測試檔以實際搜尋為準；pre-commit 的「相關測試」只在有測試寫到那個路徑時才跑，沒有就跳過，下表 pre-commit 欄沒寫的就是跳過；CI 照上面把相關測試升成完整，所以 CI 欄不管有沒有命中都跑）：

| 這次改的 | pre-commit 跑 | CI 跑 |
|---|---|---|
| 改 `plugins/cards/src/core/files.ts` | 共用、Cards 完整 | 共用、Cards |
| 改 `plugins/cards/tools/build.mjs` 或 `plugins/cards/package-lock.json` | 共用、Cards 完整 | 共用、Cards |
| 改 `plugins/cards/docs/syntax.md`（B 之後才有，A 用暫存 repo 測） | 共用、寫到 `docs/syntax.md` 的 Cards 測試 | 共用、Cards |
| 改 `plugins/cards/README.md`（沒有測試寫到它） | 共用 | 共用、Cards |
| 改 `tools/check-docs.ts`、`tools/tests/check-docs.test.ts`、`tools/codex.ts`、`tools/package-lock.json`、`.claude/hooks/cloud-setup.mjs` 或 `experiments/tools/decisions-index.mjs`（各一案） | 共用、共用工具 | 共用、共用工具 |
| 改 `tools/dispatch.ts`、`tools/hooks.ts`、`.githooks/pre-commit`、`.github/workflows/check.yml` 或 `.gitignore`（各一案） | 全部 | 全部 |
| 改 `docs/syntax.md`（A 期間還在最上層） | 共用、寫到它的 Cards 測試（含經 helper 的 `ai-add-move`、`ai-add-old-version`）、Capture | 共用、Cards、Capture、共用工具 |
| 改 `docs/product.md`（沒有測試寫到它） | 共用 | 共用、Cards、共用工具 |
| 改 `docs/decisions.md` | 共用、`tools/tests/decisions-index.test.ts`（Cards 沒有測試寫到它時跳過） | 共用、Cards、共用工具 |
| 新增根目錄的 `package.json` 或 `tsconfig.json` | 全部 | 全部 |
| `git mv plugins/cards/src/a.ts plugins/mindboard/a.ts` | 共用、Cards 完整、Mindboard | 共用、Cards、Mindboard |
| `git mv tools/a.ts plugins/cards/tools/a.ts` | 共用、共用工具、Cards 完整 | 共用、共用工具、Cards |
| 同一次改 `plugins/cards/src/core/files.ts`、`tools/check-docs.ts` 與 `docs/syntax.md` | 共用、共用工具、Cards 完整、Capture | 共用、共用工具、Cards、Capture |
| `git mv plugins/cards/docs/x.md plugins/capture/docs/x.md` | 共用、Cards 相關測試（有的話）、Capture | 共用、Cards、Capture |
| 刪 `docs/card-rules/english.md`（`rules.ts` 表上的規則檔） | 共用、`ai-rules` 等寫到它的 Cards 測試 | 共用、Cards、共用工具 |
| 改 `plugins/cards/NOTES.MD`（大寫副檔名） | 共用（沒有測試寫到它） | 共用、Cards |
| 改 `.claude/settings.json` | 共用、共用工具 | 共用、共用工具 |
| 改 `tools/package.json` | 全部 | 全部 |
| hook import 到的 `tools/` 檔（例如 `dispatch.ts` 新 import 的 `tools/a.ts`） | 全部 | 全部 |
| 改 `tools/check-local-paths.ts`（`commit-msg` 直接呼叫） | 全部 | 全部 |
| `check.yml` 的 cards job 已經直接跑 `node tools/x.mjs`，這次只改 `tools/x.mjs`（暫存 repo） | 全部 | 全部 |
| 兩用：`check.yml` 的 cards job 也直接跑共用檢查 `tools/check-docs.ts`，這次只改它（暫存 repo） | 全部 | 全部 |
| 新增 `plugins/whiteboard/a.ts` | 全部（含共用工具） | 全部（含共用工具） |
| CI 找不到比較的基點 | — | 全部（含共用工具） |
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
- **跨版本的工具認得兩種外掛根**（D-208 第 8 點）：在 Cards 的工具加一個函式，給 commit 回傳那個版本的 Cards 根：只有 `plugins/cards/manifest.json` 而且 `id` 是 `essence-cards` → `plugins/cards`；只有根目錄的 `manifest.json` 而且 `id` 是 `essence-cards` → `.`；其他一律丟錯「判不出 <commit> 的外掛根」，不猜：兩個都存在（即使只有一個的 `id` 對）、都不存在、`id` 不對、不是 JSON。判「不存在」的做法：先 `git rev-parse --verify <commit>^{commit}` 確認 commit 在，再用 `git ls-tree --full-tree <commit> -- manifest.json plugins/cards/manifest.json` 列這兩個路徑，指令成功而且沒列出來的才算不存在。讀檔一律用 repo 相對的路徑（`git show <commit>:manifest.json`、`<commit>:plugins/cards/manifest.json`，不加 `./`）。兩個坑：只看 `git cat-file -e` 的結束碼，路徑不在與 commit 不在都回 128（Codex 第二輪實測）；`ls-tree` 不加 `--full-tree` 時路徑照執行的資料夾算，從 `tools/` 或 `plugins/cards/` 執行會回 0 筆、把存在的 manifest 判成不存在（Codex 第三輪在 `5814576` 實測；`<commit>:./manifest.json` 從子資料夾讀也一樣錯）。測試從 `plugins/cards/` 與 repo 根各呼叫一次，結果相同。用到它的：
  - `compare-versions.ts` 的 `side`：讀版號（`git show <commit>:<根>/manifest.json`）、`npm ci` 的資料夾、交給轉接器的程式根都用那個版本自己的根。
  - `update-vault.ts`：舊版的基線 commit 照 `.local/releases/` 找，比較交給上面那一項。
  - 讀舊版程式的測試（`compare-versions`、`pick-old-version`、`ai-add-old-version` 的 clone 與借 `node_modules`）：clone 的來源改成 repo 的根（`git rev-parse --show-toplevel`）；現在寫的是測試檔的上一層，搬後會變成 `plugins/cards/`，`git clone` 一個子資料夾在 checkout 之前就失敗（Codex 第二輪：同一個 repo 的子資料夾 `git ls-remote` 回 128）。checkout 舊 tag 後用同一個函式找根，借的是 `plugins/cards/node_modules`。這些改動和搬家同一個 commit（§A6）。
  - 既有的 fixture 逐一分類：`compare-versions.test.ts` 裡手寫、沒有 `id` 的 manifest（約第 615 行），以及把 `src`、manifest、`package.json` 複製到暫存 repo 根的案例（約第 687～721 行），各自標明是舊根、新根，還是故意判不出的案例，預期跟著寫。
- **測試讀最上層的檔**：`new URL('../docs/…', import.meta.url)` 這類改成從 `plugins/cards/tests/` 算的 `../../../docs/…`（`ai-add`、`ai-materials`、`deck`、`errors`、`lock`、`study`、`check-syntax-pick` 等，以 `git grep` 為準）；讀 Cards 自己的檔（`new URL('../', …)`、`../src/…`）不用改。
- **`check-plugin-imports`**：規則照舊，搬家後自動涵蓋 Cards（`plugins/cards/` 底下的檔不能跑出 `plugins/cards/`）。最上層 `tools/` 的檔不能 import `plugins/`（現有規則，`tools/tests/` 也算）。
- **試作場**：`experiments/source-reading/`、`experiments/t4/`、`experiments/tools/deepen-threshold.ts` 這 7 個檔 import Cards 的 `src/`（`git grep -nE "(\.\./)+src/" -- experiments ':!experiments/plugin'`），改成 `plugins/cards/src/` 的相對路徑。`experiments/plugin/` 有自己的 `src/`，不動。
- **`cloud-setup.mjs`**：要裝的資料夾改成 `tools`、`plugins/cards`、`plugins/capture`、`plugins/mindboard`；開場訊息每個資料夾都寫一句結果，跳過的寫理由（鎖檔沒變、沒有相依、沒有鎖檔），現在跳過時什麼都不寫，分不出「裝好了」和「根本沒走到」。加一個 `tools/tests/` 的測試：這份清單和 `check.yml` 裡每個 job 安裝的資料夾相同（照字面讀兩個檔比，CI 加了外掛 job 沒改這裡就紅燈），清單寫死的理由（雲端 session 開場時 PATH 上可能是 Node 22，不 import `.ts`）留在註解。
- **knip**：`plugins/cards/knip.jsonc` 只剩 Cards 一個專案（入口 `src/main.ts`、`tests/**/*.test.ts`、`tools/*.mjs`；`project` 加 `tools/*.ts`、`tools/compare/*.ts`）；`tools/` 的 knip 設定自己一份（入口照現在 `tools` 工作區的寫法）。

### A6 搬家的 commit

一個 commit：§A1 的 `git mv`，加上讓這個 commit 的 hook 過得了的最少修改：

- §A5 測試讀最上層檔的路徑、讀舊版的測試的 clone 來源、試作場的 import、`.gitignore`；
- Cards 資料夾的常數（§A3：`tools/hooks.ts` 的 `folder`、`tools/dispatch.ts` 刪 `CARDS_TOOL`、`CARDS_CONFIG` 與根目錄的 `src/`、`tests/`）、`check.yml` 的資料夾、`cloud-setup.mjs` 的清單與它的清單測試（搬家前的 commit 比的是 `.`，這裡一起切）；
- **建置的規則檔基準**：`build.mjs` 的規則檔預設基準切成 repo 的根（§A5；選項與 `build.d.mts` 的型別宣告在搬家前的 commit 先加好），`build.test.ts`、`install.test.ts` 等自己組暫存 repo 的 fixture 照新的兩個根放檔；
- Markdown 的連結（下一點）。

commit 之前先在新的位置裝好相依（`plugins/cards/` 的 `npm ci`；`tools/` 若 §A2 加了相依也重裝），hook 在副本裡借得到 `node_modules` 才跑得了。

- **連結用腳本改**：文件檢查讀每個追蹤的 Markdown，連到搬走的檔會讓這個 commit 擋下，所以連結和搬檔同一個 commit。腳本用和 `check-docs` 同一個 Markdown 解析器取連結目標（行內、引用式、角括號的都算，程式碼框裡的不算），找出解開後指到 §A1 搬走的路徑的連結（2026-11-19 用正規式粗算有 192 個，在 `docs/`、`tasks/`、`Claude Codex Discussion/`、`experiments/`），換成新路徑的相對寫法，錨點照留；指到這個 repo `blob/main/`（舊名 `Essence-Cards` 與新名 `Essence` 都算）的舊路徑網址也換（2026-11-19 有 3 個）。可以重跑（第二次執行不改任何字），rebase 之後再跑一次。腳本放 `experiments/tools/`，B 也用它。已完成的任務與討論稿只改連結的路徑，內文不改（D-143；D-208 第 9 點的例外只管 B 的搬檔）。
- 文件裡用反引號寫的程式路徑（不是連結）：現行入口（`AGENTS.md`、`docs/agents/`、`.claude/skills/`、`.agents/skills/`、`plugins/*/AGENTS.md`、architecture §9）在 §A8 改；決定、已完成的任務與討論稿是當時的紀錄，不改。
- commit 訊息寫明：純搬移之外改了哪幾類、為什麼要同一個 commit（hook 要過）。

### A7 演練（本機，D-208 第 8 點）

在**隔離的 clone**（`git clone --no-local` 到 repo 外的暫存資料夾，它有自己的 `.git`，所以 `.local/` 也是自己的，不會寫到主資料夾的正式產物）做；`.local/releases/0.6.0/` 複製進去。第 1～3 項用**演練 vault**：測試 vault 複製一份到 iCloud 以外的暫存資料夾，**不**登錄成測試 vault，clone 裡的工具就照正式 vault 的路徑走（正式安裝的條件、`.local/releases/`、發布前比較）。演練的版號在 clone 裡改成 `0.6.1`、在 clone 的 `main` 上打 tag `v0.6.1`，**不 push**；iCloud 的測試 vault 不裝這個版號（避免留下比 `main` 新的版本紀錄）。開始前印出並記下實際用到的絕對路徑（clone 的 `.local/`、演練 vault、備份的 `--to`），`--to` 指到 clone 旁邊的暫存資料夾，不用平常的備份資料夾。

1. **舊版重裝**：用搬家後的工具 `install-vault -- <演練 vault> --release 0.6.0`，vault 裡三個檔的雜湊和 `.local/releases/0.6.0/release.json` 相同。
2. **舊 ZIP 還原**：在 clone 的 `v0.6.0` worktree 用 `backup` 對演練 vault 做一份備份 ZIP。準備演練 vault 的兩份複本，每份都：刪掉一個備份裡有的卡組 A、拿掉一行備份裡有的複習紀錄 R（拿掉之前記下它所在的紀錄檔、整行內容與能辨認它的欄位，例如學習目標 ID 與作答時間），讓還原真的要寫東西；另外把卡組 B 改得和備份不同，還原時用 `--files` 只選 A，B 是「沒選的資料」。兩份各用搬家後的 `restore` 與 `v0.6.0` 的 `restore` 跑 `--plan` 再 `--apply`。斷言：
   - 兩邊的計畫，拿掉目的 vault 的絕對路徑與建立時間之後，動作、順序與資料相同（計畫的 JSON 原樣一定不同，`tools/restore.ts:82`）；
   - 卡組 A 回來、內容和 ZIP 裡的逐位元組相同；B 和還原前逐位元組相同；
   - 紀錄 R 補回來了：兩邊 `--apply` 之後，整個 vault 的紀錄裡 R 那一行（照記下的欄位找）各恰好一筆、內容和記下的相同；
   - 補回紀錄的還原檔，檔名符合 [syntax §5-3](../../apps/Cards/docs/syntax.md#5-3-還原檔) 的格式（裝置碼每次隨機，兩份檔名本來就不同，`tools/restore.ts:150`），照紀錄的來源比，內容與行數兩邊相同；
   - 其他檔兩份複本逐檔相同。
3. **搬後的 Windows 更新**：`update-vault --check` 把演練 vault 從 `0.6.0`（根目錄的外掛根）比到 `0.6.1`（`plugins/cards` 的外掛根）：共用與 Cards 兩段檢查都跑了、備份做了、發布前比較是「可以比較」、差異只有建置版本；接著 `--install`：vault 裡 `main.js` 第一行的 `BUILD` 是 `0.6.1+<commit>`、三個檔的雜湊和 clone 的 `.local/releases/0.6.1/` 相同，卡組與複習紀錄和更新前逐檔相同（版本紀錄照 D-149 該加的那一行除外）。
4. **開發版**：碰 iCloud 測試 vault 之前，先把它 `.obsidian/plugins/essence-cards/` 的三個檔（`main.js`、`manifest.json`、`styles.css`）複製到隔離的資料夾、記下雜湊與 `BUILD`（開發版沒有存在 `.local/releases/`，原本若是 `.dirty` 的建置，只記 `BUILD` 找不回原檔）。在 clone 用搬家後的程式（版號照舊 `0.6.0`）`install-vault -- <測試 vault> --dev`（測試 vault 的登錄複製進 clone），完全關掉再打開 Windows 版 Obsidian（`BUILD` 寫在程式本體，沒重新載入時「版本」命令回的還是舊的），跑「版本」命令，結果檔的 `BUILD` 是這次的建置；照 [quality.md〈Obsidian 相容性檢查〉](../agents/quality.md#obsidian-相容性檢查)第 2 層重跑 `files`、`today`、`a3check`，結果和搬家前那次相同。這次的 dev 產物也照驗收第 A3 項的方法和搬家前同一份程式的 dev 建置比過（iPhone 裝的就是它）。
5. **跨過搬家的合併**：在 clone 裡，從搬家前的 commit 開一個只改 `src/core/deck/parse.ts` 一行的分支，合併進搬家後的分支，改動落在 `plugins/cards/src/core/deck/parse.ts`、沒有衝突（停手時段之外的分支，之後合併要靠這個）。
6. **iPhone 載入**（使用者）：測試 vault 裝搬家後的建置，iPhone 等 iCloud 同步後打開，外掛載入、「版本」命令顯示這次的建置。固定建置版本時，A 的 `main.js` 和搬家前逐位元組相同（驗收第 A3 項，dev 版也比），所以只看載入與版本，不重跑功能。

演練完（成功、中途停下或失敗都一樣）把第 4 項留存的三個檔放回 iCloud 測試 vault，核對三個檔的雜湊，完全關掉再打開 Obsidian，跑「版本」命令讀回 `BUILD`、和留存時記下的相同，通知使用者。第 6 項 iPhone 也是完全關掉再打開 Obsidian 之後才看「版本」。演練 vault 與 clone 在結果寫進〈結果〉之後刪掉。

### A8 文件

- `docs/agents/quality.md`〈檢查指令〉：安裝（`tools/`、`plugins/cards/`、外掛各自 `npm ci`）、`npm run check` 在 `plugins/cards/` 跑（或從根目錄 `npm --prefix plugins/cards run check`）、共用工具的完整檢查、建置與安裝的指令、分派表多一個對象、CI 多一個 job；〈高風險範圍〉與〈卡關時的升級〉的 `npm run codex` 改成 `node tools/codex.ts`；〈本機或雲端〉的 `cloud-setup` 一句跟著改，並加一句：改 `cloud-setup.mjs` 或 `.claude/settings.json` 的 `SessionStart` 的任務，合併前在那個分支開一個雲端 session 看開場訊息（§A3 列的四件事；分派表只跑得到它們的測試）。
- `docs/architecture.md` §9：「現在」那張圖改成 A 之後的樣子（程式已在 `plugins/cards/`，文件還在最上層）；〈每一類放哪裡〉程式那一列、〈commit 與 CI 怎麼檢查〉加共用工具。
- `docs/decisions.md` 的 D-110：狀態行後加一句「程式的位置照 D-208 第 8 點改在 `plugins/cards/`（第二步 A，日期）」；本文不改。
- `plugins/capture/AGENTS.md`、`plugins/mindboard/AGENTS.md`：寫到 Cards 位置的句子跟著改（有的話）。
- `docs/backlog.md`：〈三個外掛併進同一個 repo〉第二步那行改成狀態與連結；roadmap 那一列照進度改。
- **合併後**：主資料夾 `git pull`；`tools/` 與 `plugins/cards/` 各 `npm ci`；根目錄留下的 `node_modules/`、`main.js`、`styles.css` 是沒追蹤的舊產物，先問使用者再搬到 repo 外；本機記憶裡寫到根目錄指令的條目（`npm run install-vault`、`update-vault`、`backup`、`restore`、`npm run codex`）改成新的位置。

## B｜文件

A 合併後開工。D-208 第 9 點的一次性例外只限這一節列出、或 §B1 的清單列出的路徑。

### B0 開工條件

1. A 已合併；〈待使用者決定〉第 1 題有答案。
2. 用腳本產生**文件清單**（D-208 第 8 點「先列舊路徑、新路徑與引用處」），commit 進這份說明的附錄，再搬；清單是當下 `main` 的實況，所以在 B 開工時產生，不在這裡先寫死。每一份要搬的檔（或三份拆開的文件的每一段）一列，留在最上層的任務與討論稿也列（新路徑是 `docs/tasks/…`、`docs/Claude Codex Discussion/…`，D-213；這份說明自己也在內）：舊路徑、新路徑、搬法（整份 `git mv`、逐段拆出）、歸屬的理由，以及每一個引用處（來源檔:行、連到的錨點）。引用處除了 Markdown 連結，也含工具裡寫死的路徑（例如 `tools/check-docs.ts` 的 `BEFORE_D195` 與例外清單裡的 `tasks/w6-format-review-fixes.md`、`tasks/docs-architecture.md`、測試讀的路徑、`rules.ts` 的表）。
3. D-208 第 9 點說例外只限「本 D-ID 所連遷移任務列出的路徑」：D-208 的第 8 點後面加一個連到這份說明的連結（只加連結，不改決定的內容）。
4. 先修改連結的腳本（`experiments/tools/move-links.mjs`，A 的 L2 R4，[報告](<../Claude Codex Discussion/2026-11-20-one-repo-step-2-review.md>)）：編輯只落在解析器確認的連結位置、同一段不重複改（角括號的網址與引用式定義改壞過）；GitHub 網址只改這個 repo 的 owner；多行的連結目的地照改或明確列出不改。驗收：報告裡的樣本改完仍解析得到新位置、第二次執行不改任何字、別人的 repo 不動。A 用它改的 415 個連結不受影響（A 的待審樹 `--check` 是 0 個修改）。

### B1 歸屬規則

- **最上層留**：`docs/decisions.md`、`docs/progress-map.md`、`docs/agents/`、`docs/ai-models.md`、`docs/archive/`、`docs/roadmap.md`（改成入口）、`docs/backlog.md`（只留跨外掛的：共用工具的技術債與已知的限制、repo 結構）、`docs/architecture.md` 與 `docs/product.md` 的共用段落（§B2）。
- **搬到 `plugins/cards/docs/`**：`syntax.md`（§1 照〈待使用者決定〉第 1 題）、`question-types.md`、`card-rules/`、`research/`、Cards 的 `plans/`、Cards 的 roadmap 與 backlog、`product.md` 與 `architecture.md` 的 Cards 段落。
- **任務、討論稿、規畫**（位置照 [D-213](../decisions.md#d-213-任務與討論稿放進-docs外掛專用的放外掛的-docs)：都在 `docs/` 底下）：只講 Cards 的產品、程式、製卡規則、發布或實機測試的 → `plugins/cards/docs/` 底下的 `tasks/`、`Claude Codex Discussion/`、`plans/`；開發流程、品質流程、文件架構、repo 結構、AI 協作、三個外掛共同的規畫 → 最上層的 `docs/tasks/`、`docs/Claude Codex Discussion/`（規畫照舊在 `docs/plans/`）；兩邊都有或判不出的 → 留最上層（之後再搬只要一個 commit，搬錯要改連結）。2026-11-19 看起來留最上層的：`tasks/` 的 `agents-md-rewrite`、`archive-principles`、`auto-codex-rereview-trial`、`docs-architecture`、`local-folder-rename`、`one-repo-step-1*`、`one-repo-step-2*`、`roadmap-board`、`test-two-kinds-review`；討論稿的 `token-and-docs-workflow`、`code-quality-skill`、`docs-architecture`、`token-saving`、`fix-chains-and-rule-pruning`、`one-repo-three-plugins`、`future-plans-consolidation`、`one-repo-step-1-*`。其餘照規則在清單裡判。
- `README.md`：最上層改成 Essence 的入口（三個外掛各一行、連到各自的 roadmap 與 AGENTS.md）；Cards 現在的內容搬成 `plugins/cards/README.md`。
- `plugins/cards/AGENTS.md`（加一行的 `CLAUDE.md`）：照[第一步附錄 B](one-repo-step-1.md#附錄-b外掛的-agentsmd)的格式，加上最上層 `AGENTS.md` 裡只適用 Cards 的規則（例如「製卡規則的輸出格式要和 `docs/syntax.md` 一致」）。〈Code Review Rules〉留在最上層：GitHub 上的 Codex 審查讀不讀子資料夾的 AGENTS.md 沒驗過（〈平台事實〉），留在最上層一定讀得到。

### B2 三份共用文件逐段拆（D-208 第 8 點）

段落的歸屬照 §B1 的規則；下表是起點，實作時逐段確認，表照實際改：

| 文件 | 留最上層 | 搬到 Cards |
|---|---|---|
| `docs/product.md` | §1 北極星（D-001，全專案）；§3 的目標使用者（三個外掛各一行） | §1 的核心差異（D-114）；§2 成功標準；§3 其餘；§4 產品原則（只適用 Cards 的；全專案的留最上層，Cards 那份連過去）；§5 範圍 |
| `docs/architecture.md` | §3 的外掛分工表與 D-006、D-031、D-032、D-056 的段落（三個外掛的定位、關係、接點）；§9 repo 結構 | §1 術語表、§2 概念模型、§3 其餘、§4 平台、§5 資料存放、§6 AI 的位置、§7 製卡規則、§8 整條鏈的分工 |
| `docs/syntax.md` | §1 轉錄稿（看第 1 題；搬到 `docs/transcript.md` 時，`syntax.md#1-轉錄稿` 留一行轉往新頁：`plugins/capture/docs/backlog.md` 直接連到它） | §0、§2～§10 |

- **舊錨點**：錨點用和 `check-docs` 同一個 Markdown 解析器取（程式碼框裡的 `## …` 字面不算，`syntax.md` 的範例就有）。三份文件被搬走的每個 `##` 標題留在原檔，標題下只留一行「搬到 Cards 的〈…〉（連結，D-208 第二步）」，外面連到舊錨點的照樣打得開（D-208 第 8 點「有外部依賴的舊錨點留一行轉往新頁」）。`###` 以下的錨點：repo 裡的連結由腳本改；repo 外已知的入口（本機記憶、skill、外掛的 AGENTS.md、程式註解）在 B0 的清單裡查，有引用的也留一行轉往新頁。repo 外還有沒有別的入口，repo 本身證明不了；已知的之外只剩使用者的書籤與已關的 PR，接受。
- 整份搬走的檔（`question-types.md`、`card-rules/` 等）不留空檔，照第一步 §5 的做法。
- **連結的來源也會搬**：拆出去的段落裡指向原檔其他段落的連結（例如 `docs/syntax.md` §0 的 `[§1](#1-轉錄稿)`，§0 去 Cards、§1 留最上層或去 `docs/transcript.md`），原本是同一份裡的錨點，拆開後要指到另一個檔。連結腳本對每個連結用**拆之前**的來源解出目標，再照拆之後的來源與目標位置重算相對路徑（A 搬的檔裡沒有 Markdown，A 的腳本只處理目標搬走的情況；B 要加來源搬走的情況）。這條連結當驗收案例，點過去要是轉錄稿的規格。
- `rules.ts` 的規則檔路徑改成 `plugins/cards/docs/card-rules/…`（只改字串，嵌入的內容與雜湊不變，驗收第 B3 項）。這是 B 唯一改到 `src/` 的地方。`tests/ai-rules.test.ts:35` 用 `startsWith('docs/')` 挑規則檔，B 之後會一個都挑不到、「一份規則只有一個標記」的檢查默默跳過：改成新的前綴，並斷言挑到的檔數大於 0。

### B3 讀文件的工具

- `tools/check-docs.ts`：
  - 狀態目錄（`STATUS_DIRS`）改成 `docs/tasks`、`docs/Claude Codex Discussion`、`docs/plans`，最上層與 `plugins/<外掛>/` 底下照舊共用這一份（D-213）；任務對 backlog：`docs/tasks/` 對最上層的 backlog，`plugins/<外掛>/docs/tasks/` 對那個外掛的 backlog，Cards 的任務因此對 `plugins/cards/docs/backlog.md`。
  - `BEFORE_D195` 放過 `docs/tasks/` 與 `plugins/cards/docs/tasks/` 的同名舊任務（只放過清單上的檔名，其他外掛照查）；連結的例外清單（`tools/check-docs.ts:50-58` 寫死的 `tasks/w6-format-review-fixes.md`、`tasks/docs-architecture.md`）照 B0 清單的新路徑改。
  - **擋舊位置**（D-213 第 4 點）：最上層或 `plugins/<外掛>/` 根目錄的 `tasks/`、`Claude Codex Discussion/` 底下有追蹤的檔就報錯，訊息寫新位置；B 搬檔的那個 commit 之後才生效（同一個 commit 加）。
  - `tools/tests/check-docs.test.ts` 寫到這些路徑的案例（狀態行、外掛的任務、`BEFORE_D195`）改成新路徑，加擋舊位置的案例。
- `tools/roadmap-board.ts`：正式 vault 的版本與「已完成」改從 `plugins/cards/docs/roadmap.md` 讀；最上層的 roadmap 只剩跨外掛的列與連到三份外掛 roadmap 的入口。
- `tools/progress-board-data.ts`：待補測的列數加上 Cards 的 backlog，說明那句跟著改。
- `tools/dispatch.ts`：登錄表照第 1 題改路徑；第 9 條（最上層的文件）照舊是 Cards 相關測試，拿掉已經搬進 `docs/` 的 `tasks/`、`Claude Codex Discussion/`（之後在舊位置出現的檔落第 10 條「全部」，文件檢查也會擋）；對應的案例跟著改。
- `.github/workflows/progress-board.yml`：觸發路徑加 `plugins/*/docs/backlog.md`、`plugins/cards/docs/progress-map.md`（若有）。
- Cards 的測試讀文件的路徑改回相對 Cards 的 `../docs/…`。
- `.claude/skills/`、`.agents/skills/` 寫到 Cards 文件路徑或 `tasks/`、`Claude Codex Discussion/` 的地方（例如 essence-decision 的 syntax.md、essence-discuss 的 `tasks/`）兩份一起改；`AGENTS.md`、`docs/agents/`、`docs/plans/`（例如 `README.md` 的存放表與流程圖、`workflow.md`）、外掛的 `AGENTS.md` 寫到這兩個資料夾的句子也改（例如 AGENTS.md〈AI 協作分工〉的討論稿位置）。這些是反引號路徑，連結腳本改不到：B0 的清單用 `git grep -n -e '`tasks/' -e '`Claude Codex Discussion/'` 掃一次，扣掉決定、已完成的任務與討論稿（當時的紀錄），其餘逐條列進清單。

### B4 收尾

- `docs/architecture.md` §9：兩張圖合成一張（第二步之後），〈每一類放哪裡〉照實際；`AGENTS.md`〈開始工作前〉的「先讀 `docs/roadmap.md`」改成先讀最上層的入口，做 Cards 時讀 `plugins/cards/AGENTS.md`。
- 合併後：本機記憶裡寫到 Cards 文件路徑或 `tasks/`、`Claude Codex Discussion/` 的條目跟著改；roadmap 的已完成寫一列；技術債「外掛只改文件也跑完整檢查」刪掉 Cards 的部分（Capture、Mindboard 照舊）。

## 驗收

**A**（`<基準>` 是 A 開工時的 `main`，`<搬家>` 是 §A6 的 commit，`<A>` 是要合併的 head）：

1. `git ls-files src tests manifest.json package.json package-lock.json tsconfig.json eslint.config.js knip.jsonc` 是空的；`tools/` 底下沒有 §A1 列的 Cards 工具；`plugins/cards/` 底下有它們。
2. **都是改名**：每個搬檔的 commit（§A2 共用測試搬家、`quality.test.ts` 的整檔 `git mv`、§A6）各自用 `git diff -M --name-status <那個 commit>^ <那個 commit>` 看，搬的每個檔都是一行 `R`，沒有同一個檔的 `D` 加 `A`；§A6 裡 `src/` 底下的每一行都是 `R100`，而且 `git diff -M <搬家>^ <A> -- src plugins/cards/src` 除了改名沒有內容差異（產品程式一行都沒改）。
3. **建置相同**：建置版本同時寫在第一行與程式本體的 `BUILD`（`tools/build.mjs:111`，`src/main.ts:524,610` 用到），所以不能只去掉第一行比。`<基準>` 沒有固定版本的選項，做法是：在乾淨的 `<基準>` checkout 照原本的入口各建置一次正式版與 dev 版，讀回產物的 `BUILD`；`buildPlugin` 在 A 加一個只給測試與驗收用的選項，在 `<A>` 用這個選項、填 `<基準>` 讀回的那個 `BUILD`，各建置一次正式版與 dev 版。兩邊的 `main.js` 整份逐位元組相同、`styles.css` 相同、`embedRules()` 的結果 `deepEqual`。`<A>` 另外照預設入口建置一次，`BUILD` 是 `<版號>+<A 的 HEAD 短碼>`。
4. **歷史接得到**：在有完整歷史的本機 checkout，腳本對每個搬走的檔跑 `git log --follow --name-status --format=%H -- <新路徑>`，結果裡有舊路徑，也有那個檔搬之前最後一次被改的 commit；印出檢查的檔數與接不到的清單（要是空的）。拆開的 `quality.test.ts`：`git mv` 的那一半（hook）接得到；另存的那一半（ESLint）檔頭註解寫「從 `tests/quality.test.ts`（<commit>）拆出」。
5. **檢查都過、而且不是空跑**：`plugins/cards/` 的 `npm run check`、`npm run build`，`tools/` 的 `npm run check` 與 `npm run self-check` 都通過；`self-check` 在只裝了 `tools/` 的乾淨 clone（沒有根目錄與 `plugins/cards/` 的 `node_modules`）也通過，而且逐檔核對：測試的輸出（用會印檔名的 reporter）裡每一個搬過去的測試檔都出現、每個檔的測試數和搬之前在 Cards 跑的相同（`ci-gate.test.ts` 這類一檔多個測試的，總數證明不了每個檔都載入了）；拆開的 `quality.test.ts`：拆之前用同一個 reporter 記下每個測試的完整名稱與結果，拆之後每個名稱在預期的那一半（hook 的在 `tools/tests/`、ESLint 的在 Cards）恰好跑一次、結果相同，沒有漏的、也沒有重複的；在一個共用工具加一個沒用到的 export，`tools/` 的 knip 報出來（再拿掉）；CI 的 cards job 沒有裝 `tools/`。
6. `tools/tests/dispatch.test.ts` 有 §A3 每一列的案例與 import 範圍的測試；`tools/tests/hooks.test.ts` 第一步的五種情況改成搬家後的路徑，加上「只改共用工具：只跑共用工具」「改 `.githooks/`：全部」；`tools/tests/ci-gate.test.ts` 有 tools 旗標的成功、跳過、要跑卻跳過、旗標不合法。
7. **外掛邊界**：在暫存的 repo（或 worktree 裡 stage 後再拿掉），`plugins/cards/tests/` 一個 import `../../../tools/check-docs.ts` 的檔、`tools/tests/` 一個 import `../../plugins/cards/src/core/files.ts` 的檔，`check-plugin-imports --staged` 兩個都擋下；只放沒追蹤的檔它看不到，所以要 stage。樣本不 commit。
8. **跨版本的外掛根**：Cards 工具的測試用暫存 repo 的 commit 測：只有根目錄的 manifest、只有 `plugins/cards/` 的 → 回傳正確的根；兩個都有（含只有一個 `id` 對）、都沒有、`id` 不對、不是 JSON、Git 讀取失敗 → 丟錯而且訊息有 commit。`compare-versions` 在暫存 repo 比「根目錄的版本」對「`plugins/cards` 的版本」跑得完。讀 `v0.2.0`～`v0.5.0` 的舊版測試照常通過。
9. **沒有殘留**：腳本用 Markdown 解析器取每個連結的目標（行內、引用式、錨點、這個 repo 的 `blob/main/` 網址），沒有一個指到 §A1 搬走的舊路徑；`git grep -nE "(\.\./)+src/" -- experiments ':!experiments/plugin'` 只剩指到 `plugins/cards/src/` 的；連結腳本第二次執行不改任何字；`node tools/check-docs.ts` 通過。
10. 乾淨的 clone 在 `plugins/cards/` 跑 `npm run build`、再用 `install-vault` 的正式版流程產生對照表（`main.js.map`），列出產生的檔，`git status --porcelain` 都是空的。
11. **雲端**：`tools/tests/` 的清單測試通過。合併前，在 A 的分支開一個新的雲端 session（只讀），開場訊息照 §A3〈只有雲端驗得到的〉逐個資料夾核對：`tools`、`plugins/cards` 是「`npm ci` 完成」，`plugins/capture`、`plugins/mindboard` 是「沒有相依，跳過」，沒有根目錄的 `npm ci`，Node 24、`core.hooksPath` 也對；合併後在 `main` 再開一次新的。兩次的訊息寫進〈結果〉。
12. **GitHub 上實際跑**：A 的分支 push 後 plan 是「全部」、每個 job 都成功。探針分支開 draft PR 合併到 A 的分支，看的是 `pull_request` 那個 run，而且它的 plan 摘要裡比較的基點是 A 分支的 head（同一個探針分支的 push run 會把整個 A 算進去，不看它）：只改 `plugins/cards/src/` 一個檔 → 只有 cards（加 plan、shared、gate）；只改 `tools/check-docs.ts` → 只有 tools；只改 `docs/product.md` → cards 與 tools 都跑完整。run 的網址寫進〈結果〉，看完關 PR、刪探針分支。
13. **過渡的 commit 也查過**：§A2 測試搬過去的 commit 與 `<搬家>` 各在 GitHub 跑過一次 CI（push 那個 commit 的探針分支），兩次都綠；本機每個 commit 都經過 pre-commit（commit 的輸出看得到分派那一行）。
14. **進度網頁**：Pages 只在 `main` 的 push 跑，A 的分支看不到。合併前在 `<基準>` 與 `<A>` 各本機跑一次 `node tools/progress-board.ts`、`node tools/roadmap-board.ts`，三個頁面除了產生時間以外相同；合併後 Progress board 的 run 成功、網址打得開。
15. §A7 演練的六項都做了，結果（雜湊、計畫與還原的內容、報告的結論、結果檔的 `BUILD`、iPhone 的畫面）寫進〈結果〉。
16. **外掛 ID、版號與 tag**：`plugins/cards/manifest.json` 的 `id` 是 `essence-cards`；manifest 與 `package.json` 的 `version` 和 `<基準>` 的相同；`v0.2.0`～`v0.6.0` 每個 tag 指的 commit 和開工前記下的相同；正式安裝的條件接受 clone 裡的 `v0.6.1`（§A7 第 3 項）。
17. **升正式版的檢查**：`update-vault --check` 跑 `tools/` 的 `check` 與 `self-check`、Cards 的 `check`；用測試的替身分別讓共用檢查、共用工具的測試、Cards 的檢查失敗，三種都丟錯、沒有做備份（備份資料夾是空的）、沒有比較與安裝。
18. **兩個平台**：Windows 本機跑 `plugins/cards/` 的 `npm run check`、`tools/` 的 `npm run self-check`（含 `hooks`、`dispatch`、`ci-gate`、`plugin-imports` 的測試）與第 7 項；Linux 由 CI 的 cards job 與 tools job 跑同樣的檢查。只在一邊跑的測試（例如檔名有換行的那一例）在〈結果〉寫明。
19. 合併前 L2：新的 Codex session（`node tools/codex.ts l2 <請求檔>`，A 開工前還是 `npm run codex -- l2 …`），請求照 code-quality 的 `review.md` 寫在 `tasks/one-repo-step-2-review.md`。

**B**：

1. 〈文件清單〉在搬檔之前 commit；每一列的新路徑存在、舊路徑不存在（三份拆開的文件除外）。整份搬的檔：腳本對每一列跑 `git log --follow` 接得到搬之前的歷史（相似度低的照第一步的經驗加 `-M30%`，用了就在清單註明）。逐段拆出的段落：新檔是新增的，`--follow` 接不到原檔，清單記原檔、原錨點與拆之前的 commit，腳本取那個 commit 的原段落和新位置的內容比對（連結目標換成佔位字串後相同）。D-208 連到這份說明。
2. `node tools/check-docs.ts` 通過；腳本用 Markdown 解析器確認沒有連結指到清單上的舊路徑或已拿掉的錨點。
3. 三份拆開的文件：搬家前每個 `##` 的錨點（解析器取的，不含程式碼框）與 B0 清單裡要留的 `###` 錨點，在原檔都還在、而且連得到新位置（腳本先存一份清單再比）；`embedRules()` 的結果和 B 之前 `deepEqual`；`ai-rules.test.ts` 挑到的規則檔數大於 0。
4. 分派表：改 `plugins/cards/docs/syntax.md` 選到寫到它的 Cards 測試（含經 helper 的，不是空的）；改最上層的轉錄稿格式（照第 1 題）分派到 Capture 的完整檢查、選到 Cards 真的讀它的測試。Capture 的檢查現在只印一行；Capture 寫、Cards 讀的共用範例與已部署讀端的相容檢查留給第一個需要共同規格的 Capture 任務（D-208 第 6 點）。
5. **已完成的文件只改了連結**：清單上每一份搬走的已完成任務、討論稿與規畫，搬前搬後比對：狀態行相同，把連結目標換成同一個佔位字串之後全文相同。
6. 進度白板：合併前本機產生三個頁面核對；合併後 Pages 跑成功；`roadmap.html` 有 Cards 的列與正式 vault 的版本；`progress-map` 的待補測數含 Cards 的 backlog；手機寬度（375px）照 [roadmap-board 任務](roadmap-board.md)看一次。
7. `docs/tasks/` 與 `plugins/cards/docs/tasks/` 的舊任務（`w3.md` 等）照舊被 `BEFORE_D195` 放過；Mindboard 的同名任務照查（第一步的測試照留）。
8. **都在 `docs/` 底下**（D-213）：`git ls-files tasks "Claude Codex Discussion" "plugins/*/tasks" "plugins/*/Claude Codex Discussion"` 是空的；暫存 repo 在這四種舊位置各新增一個檔，文件檢查都擋下、訊息有新位置，`docs/tasks/` 與 `plugins/capture/docs/tasks/` 的照常查狀態行。
9. 合併前 L2（B 改到分派表與文件檢查）。

## 平台事實

送 L2 之前跑完；跑不了的標待驗，寫進審查請求的〈驗證方式〉。

| 假設 | 探針與環境 | 結果 |
|---|---|---|
| `.local/` 的位置和 Cards 在哪裡無關 | 讀程式：`tools/install.ts:43-45` 用 `--git-common-dir`；`tools/codex.ts:148` 用 `--show-toplevel` | 成立（2026-11-19 讀程式） |
| 分派表把 `tools/codex.ts` 判成第 8 條、`.claude/hooks/cloud-setup.mjs` 判成第 7 條 | `node tools/dispatch.ts --range 137967f~1 137967f --explain`；只有 `M tools/codex.ts` 的改動直接呼叫 `dispatch()`（2026-11-19，Windows） | 成立：單獨改 `codex.ts` 三個外掛都跑完整 |
| 建置版本不只在 `main.js` 第一行，也由 esbuild 的 `define` 寫進程式本體 | 讀程式：`tools/build.mjs:111`、`src/main.ts:524,610`（Codex 第一輪指出） | 成立：驗收第 A3 項改成固定版本比整份 |
| `v0.2.0`～`v0.5.0` 的根目錄 `manifest.json` 有正確的 `id` 與版號 | Codex 第一輪 `git show <tag>:manifest.json` | 成立；`v0.6.0` 打 tag 後再看一次 |
| 改 `docs/syntax.md` 時，經 `tests/helpers/add-cases.ts` 讀它的 `ai-add-move`、`ai-add-old-version` 選不到 | Codex 第一輪在 `de3438f` 呼叫 `dispatch()` | 成立（現在就有）：§A3 補 |
| 一個 commit 搬約 390 個檔，`git diff -M` 全部認成改名，`git log --follow` 跨得過 | 演練的 clone（Windows、Git 2.52） | 成立：`7637a8c` 379 個 R、沒有 D 加 A，`git log --follow` 都接得到（驗收第 A2、A4 項） |
| 搬家前從舊路徑開的分支，合併進搬家後的分支時改動落到新路徑 | §A7 第 5 項 | 成立（2026-11-20，演練的 clone） |
| esbuild 的 `absWorkingDir` 換成 `plugins/cards` 後，固定建置版本時 `main.js` 逐位元組相同（註解裡的路徑是相對的） | 驗收第 A3 項 | 成立：正式版與 dev 版都逐位元組相同（`83af5c5`、`288fc3d`） |
| ESLint 的 flat config、knip 的設定、`tsconfig.json` 的 `include` 都以設定檔所在的資料夾為基準，整份搬進 `plugins/cards/` 不用改寫法 | §A6 的 commit 跑 `npm run check` | 成立：`7637a8c` 的 pre-commit 與 CI 都通過，只搬檔、沒改寫法 |
| `plugins/cards/tools/*.ts` 從 `plugins/cards/node_modules` 找到相依；Cards 的工具用了只在 `tools/` 的相依時會失敗（不會默默借到） | 拿掉 `tools/node_modules` 跑 Cards 的檢查（CI 的 cards job 就是這樣） | 成立：A 分支的 push run [44683399772](https://github.com/kuohappiness/Essence/actions/runs/44683399772) 的 cards job 只在 `plugins/cards` 裝相依，檢查、建置都過 |
| 讀舊 tag 的測試（舊版是根目錄的外掛根）借 `plugins/cards/node_modules` 跑得起來 | 驗收第 A8 項 | 成立（2026-11-20，Windows 本機與 CI） |
| GitHub 對搬家前開、只改舊路徑 `tools/install.ts` 的 PR 能不能建合併 commit（L2 R1） | 從 `ecb85f9` 開分支只改 `tools/install.ts`，對 `c0234f1` 開 draft PR（[PR #26](https://github.com/kuohappiness/Essence/pull/26)） | 不能：GitHub 判有衝突（`mergeable` false、`dirty`，關掉重開再算一次也一樣），沒有合併 commit，`pull_request` 的 run 沒跑；本機 Git 2.52 的 `merge-tree` 合得乾淨（改名限制調到 10 也一樣）。這種分支在 GitHub 上要先在本機把 A 合進來；R1 的修正留著，對 GitHub 判得出合併的情況照樣有效 |
| 雲端 session 的 `CLAUDE_PROJECT_DIR` 是 repo 根，`cloud-setup.mjs` 在 `plugins/cards/` 跑得了 `npm ci` | 驗收第 A11 項（合併前在 A 的分支、合併後在 `main`，雲端） | 成立：合併前（`c298cf1`）與合併後（`main` 的 `5afd46e`）各驗一次，〈A 的進度〉第 11 項 |
| GitHub 上的 Codex 審查讀不讀 `plugins/cards/AGENTS.md` | 沒有探針；§B1 把〈Code Review Rules〉留在最上層，不依賴它 | 不依賴 |

## 待使用者決定

1. ✅ **轉錄稿格式（`syntax.md` §1）在 B 搬到最上層，還是留在 Cards 等第一個 Capture 任務？** 使用者 2026-11-20 選「B 就搬」，寫進 [D-208](../decisions.md#d-208-三個外掛在同一個-repo-開發每個外掛有自己的資料夾) 第 6 點的時機調整；B 照 Claude 的建議做。 D-208 第 6 點說「第一個需要共同規格的 Capture 任務」搬，第 8 點說第二步把 `syntax.md` 拆成共用與 Cards 專用；第二步先到時兩點的時機衝突。
   - Claude 的建議：B 就搬到最上層（例如 `docs/transcript.md`），原節留錨點與一行連結；第 6 點的另一半（Capture 寫、Cards 讀的測試讀同一份自編範例、已部署讀端的相容檢查）照舊等 Capture 的任務。理由：只搬一次；不然 `syntax.md` 先整份進 `plugins/cards/`，Capture 讀規格要讀進 Cards 的資料夾，分派表也要讓登錄表排在外掛資料夾那一條前面，之後再搬出來一次。
   - 留在 Cards 的好處：B 少一件事；代價如上，而且說明要另外寫過渡期「外掛資料夾裡的共用規格」在分派表的優先規則與案例。
   - Codex（開工前查核第一輪）同意 Claude 的建議，並提醒 `plugins/capture/docs/backlog.md` 直接連到 `docs/syntax.md#1-轉錄稿`，舊入口要留一行轉址（§B2 已寫）。
   - 選 B 就搬的話，是調整 D-208 第 6 點的時機，照 essence-decision 在 D-208 補一段（使用者同意的日期）。
   - 這題只擋 B，不擋 A。

## 技術債

- 這一步本身不延後測試。A 的演練與驗收都是第 1 類（更新、備份還原、舊版讀得到的東西），合併前做完。
- 到期的：「外掛只改文件也跑完整檢查」，見 §A0 第 4 項與 §A3。

## 結果

延後的測試：A 沒有延後的測試。

### A 的進度（2026-11-20）

分支 `claude/one-repo-step-2a`（本機 worktree `Essence-step2a`，已 push）。`<基準>` 是 `ecb85f9`；`<搬家>` 是 `7637a8c`（前一個 commit `36261e0` 先把 Cards 的 knip 設定改成搬家後的寫法，讓 `knip.jsonc` 在搬家的 commit 是 R068）；之後 `83af5c5`（§A3 的建置版本選項）、`33fde4f`（§A8 的文件）。每個 commit 都經過 pre-commit，分派那一行都在輸出裡。

已驗的驗收項目（演練與驗收的腳本在本機的暫存資料夾，重開機可能清掉；結果以這裡為準）：

- 第 1 項：`git ls-files src tests manifest.json package.json package-lock.json tsconfig.json eslint.config.js knip.jsonc` 是空的。
- 第 2 項：`<搬家>` 379 個 R、38 個 M、沒有 D 加 A；`src/` 每一行都是 R100，`git diff -M <搬家>^ 33fde4f -- src plugins/cards/src` 194 個檔、0 行改動。§A2 的 `e7130d4` 13 個 R。
- 第 3 項：`<基準>` 與 `83af5c5` 正式版、dev 版的 `main.js` 逐位元組相同，`styles.css` 相同，`embedRules()` `deepEqual`（5 個科目）；`83af5c5` 預設建置的 `BUILD` 是 `0.6.0+83af5c5`。
- 第 4 項：`<搬家>` 379 個、`e7130d4` 13 個，`git log --follow` 都接得到舊路徑與搬之前最後一次改它的 commit（不算合併 commit：`--follow` 不列合併）；`eslint-rules.test.ts` 檔頭寫拆出前的 commit `d7e2a0b`。
- 第 5 項：只裝 `tools/` 的乾淨 clone（`33fde4f`，換行照 CI 用 LF）`npm run self-check` 通過，158 個測試、157 過、1 跳過（檔名有換行，只在 Linux）；14 個測試檔各自跑過、都有測試。逐檔比對：搬之前在 Cards 跑的那些測試檔，每個測試名稱搬之後都還在跑、結果都沒變；名稱不同的 33 個是規格裡的節號從 §2 改成 §A3，加上 `ci-gate` 摘要表頭「外掛」改「對象」。`quality.test.ts` 拆之前 20 個測試，拆之後 hook 的 7 個在 `tools/tests/`、ESLint 的 13 個在 Cards，每個名稱恰好一次、結果相同。在共用工具加一個沒用到的 export，`tools/` 的 knip 報出來，拿掉後通過。CI 的 cards job 不裝 `tools/`：A 分支的 push run [44683399772](https://github.com/kuohappiness/Essence/actions/runs/44683399772) 的 cards job 在 `plugins/cards` 跑 `npm ci`（153 個套件），沒有裝 `tools/` 的步驟，檢查、建置、audit 都過。
- 第 6 項：`dispatch.test.ts` 有 §A3 每一列與 import 範圍的案例；`hooks.test.ts` 原本缺「改 `.githooks/`：全部」、`ci-gate.test.ts` 原本缺 tools 旗標的成功與不合法，`7262ed8` 補上（hook 第 7 個情境：改 `.githooks/commit-msg`，四個對象都跑完整檢查），跑過都通過。
- 第 8 項：`plugin-root.test.ts` 的暫存 repo 有只有根目錄、只有 `plugins/cards/`、兩個都有（其中一個 `id` 不對）、都沒有、`id` 不對、不是 JSON、`manifest.json` 是資料夾、找不到 commit 八種，從 repo 根與兩個子資料夾呼叫結果相同，丟錯的訊息都有 commit；`compare-versions.test.ts` 的「發布前比較跨過搬家」比根目錄的版本對 `plugins/cards` 的版本跑完；讀舊版 tag 的測試：`ai-add-old-version`（`v0.3.0`、`v0.5.0`）、`pick-old-version`（`v0.3.0`）和 `plugin-root` 一起跑，50 個都過；`compare-versions`（`v0.2.0`、`v0.4.0`）在 Cards 的完整檢查裡跑。
- 第 17 項：`update-vault.test.ts` 的「升正式版的檢查」用替身讓三段各自失敗，三種都丟錯、只跑到失敗的那一段、備份資料夾是空的、沒有比較與安裝；10 個測試都過。實際的三段在 §A7 第 3 項的演練跑過。
- 第 18 項（Windows 那一邊）：`7262ed8` 在 `plugins/cards/` 跑 `npm run check`（型別、lint、knip、測試）通過，2900 個測試全過、0 跳過，含讀 `v0.2.0`、`v0.4.0` 的 `compare-versions`；`tools/` 的完整檢查在 `7262ed8` 的 pre-commit 跑過（含 `hooks`、`dispatch`、`ci-gate`、`plugin-imports`）；第 7 項在 Windows 做。只在一邊跑的測試：`dispatch.test.ts` 的「檔名有換行」只在 Linux；`backup-desktop.test.ts` 的「所在的磁碟找不到」與 `backup.test.ts` 的 `\\?\` 長路徑只在 Windows。Linux 那一邊：A 分支的 push run [44683399772](https://github.com/kuohappiness/Essence/actions/runs/44683399772)，cards job 2900 個測試、2898 過、跳過 2 個（「所在的磁碟找不到」只在 Windows；「F4 不分大小寫的檔案系統」在 Linux 的暫存資料夾區分大小寫時跳過），tools job 159 個全過（含「檔名有換行」）。
- 第 7 項：暫存 clone 裡只放沒追蹤的樣本，`check-plugin-imports --staged` 看不到；stage 之後兩個都擋下（「跑出 plugins/cards/」「根目錄的程式不 import plugins/ 裡的外掛」）。樣本沒 commit。
- 第 9 項：連結腳本 `--check` 要改 0 個；`git grep -nE "(\.\./)+src/" -- experiments ':!experiments/plugin'` 只剩連結腳本自己測試裡的範例字串。
- 第 10 項：乾淨 clone 在 `plugins/cards/` `npm run build`、`update-vault --install` 的正式版流程存了 `main.js.map`；產生的檔都被忽略，`git status --porcelain` 是空的。
- 第 12 項：A 分支 push 後的 run [44683399772](https://github.com/kuohappiness/Essence/actions/runs/44683399772) plan 是「全部」（比較 `ecb85f9..1bdc1ef`），plan、shared、tools、cards、capture、mindboard、gate 都成功。三個探針分支各從 `1bdc1ef` 只改一個檔、開 draft PR 合併到 A 的分支，看 `pull_request` 的 run，plan 比較的基點都是 `1bdc1ef`：只改 `plugins/cards/src/core/deck/parse.ts` → [44685340185](https://github.com/kuohappiness/Essence/actions/runs/44685340185) 只有 cards（加 plan、shared、gate），其餘 skipped；只改 `tools/check-docs.ts` → [44685345668](https://github.com/kuohappiness/Essence/actions/runs/44685345668) 只有 tools；只改 `docs/product.md` → [44685350055](https://github.com/kuohappiness/Essence/actions/runs/44685350055) cards 與 tools 都是完整檢查，capture、mindboard skipped。三個都綠；PR #23～#25 已關、探針分支已刪。
- 第 13 項：`e7130d4`（§A2）與 `7637a8c`（`<搬家>`）各 push 一個探針分支，run [44683434100](https://github.com/kuohappiness/Essence/actions/runs/44683434100)、[44683434330](https://github.com/kuohappiness/Essence/actions/runs/44683434330) 七個 job 都成功；探針分支已刪。本機每個 commit 都經過 pre-commit。
- 第 14 項（合併前的部分）：`<基準>` 與 `1bdc1ef` 各在乾淨的 worktree 跑 `node tools/progress-board.ts`、`node tools/roadmap-board.ts`，`index.html`、`progress-map-list.html`、`progress-map-board.html`、`roadmap.html` 四個檔逐行相同（產生時間剛好在同一分鐘）。合併後看 Pages 的 run。
- 第 11 項（合併前）：使用者在分支 `c298cf1` 開新的雲端 session（只讀），2026-11-20 核對開場訊息：`tools`、`plugins/cards` 是「`npm ci` 完成」，`plugins/capture`、`plugins/mindboard` 是「沒有相依，跳過」；`node --version` 是 24 版；`core.hooksPath` 是 `.githooks`。訊息原文沒有存下來（內建瀏覽器沒登入 claude.ai，Claude 讀不到那個 session）。
- 第 19 項：L2 四輪（`c298cf1`、`c7d5493`、`c875cb6`、`dfdc6fa`），第四輪沒有擋合併的發現；十二項裡 R4 記成 §B0 第 4 項、R11 與 R12 記成已知的限制，其餘修（[報告與回應](<../Claude Codex Discussion/2026-11-20-one-repo-step-2-review.md>)）。每一輪的 push run 七個 job 都成功（第四輪 [44712161426](https://github.com/kuohappiness/Essence/actions/runs/44712161426)）。
- 第 16 項：`id` 是 `essence-cards`，版號 `0.6.0` 和 `<基準>` 相同；`v0.1.0`～`v0.6.0` 指的 commit 和 GitHub 上的相同。

§A7 演練（隔離的 clone 與演練 vault，都在本機暫存資料夾）：

- 第 1 項通過：搬家後的 `install-vault --release 0.6.0`，三個檔的雜湊和 `release.json` 相同。演練 vault 先拿掉一篇 `需要版本 9.9.9` 的 iPhone 測試卡組（它是用來測讀取閘門的，留著會照規則拒絕退版）。
- 第 2 項通過：`v0.6.0` 的 `backup` 做的 ZIP，搬家後與 `v0.6.0` 的 `restore` 各還原一份複本（刪卡組 A、拿掉紀錄 R、改卡組 B、`--files` 只選 A）：計畫去掉 vault、建立時間、備份檔路徑後相同；A 和 ZIP 逐位元組相同；B 沒變；R 各恰好一筆、在符合 §5-3 的還原檔裡；還原檔內容相同；兩份複本逐檔相同。
- 第 3 項通過：clone 改 `0.6.1`、打 tag（沒 push），`update-vault --check` 三段檢查都過、做了備份、發布前比較 `0.6.0+037b359f`（根目錄）對 `0.6.1+5d526d97`（`plugins/cards`）差異 0 項；`--install`（演練 vault 在考試期間，加了 `--exam-ok`）裝上 `0.6.1+5d526d97`，三個檔和 clone 的 `.local/releases/0.6.1/` 相同，卡組與紀錄 50 個檔逐檔沒變。過程中遇到的都是環境：clone 沒有測試 vault 的登錄時，本機路徑檢查把文件裡的測試 vault 名稱當成一般 vault；Windows 取出的 `syntax.md` 是 CRLF 讓 deck 測試失敗（clone 改 `core.autocrlf=false`）；升版時要一起改版號寫死的三個測試（照 `fb1a051` 的做法）。
- 第 5 項通過：從 `<基準>` 改 `src/core/deck/parse.ts` 一行的分支，合併進 `33fde4f`，改動落在 `plugins/cards/src/core/deck/parse.ts`，沒有衝突。
- 第 4 項通過（使用者先關掉 Obsidian、只開測試 vault）：測試 vault 原本的開發版 `0.6.0+4536a17` 三個檔另存、雜湊記下，先跑一輪 `version`、`files`、`today`、`a3check`。clone 裡 `288fc3d` 的乾淨 worktree（版號照舊 `0.6.0`）`install-vault --dev` 裝上 `0.6.0+288fc3d9`；照第 A3 項的方法比 `<基準>` 與 `288fc3d`，正式版與 dev 版逐位元組相同、`embedRules()` 相同，裝進去的 `main.js` 把建置版本換回 `<基準>` 的之後和 `<基準>` 的 dev 建置相同、`styles.css` 相同。Obsidian 完全關掉、從檔案總管重開後，`version` 回 `0.6.0+288fc3d9`；`files` 21 項、`today`（卡組、今天的份、進度）、`a3check`（11 個情境都 ok、跳過的子項 C8 與 C10 相同、`cleanupLeft` 空的）和搬家前逐項相同。
- 第 6 項通過：使用者在 iPhone 完全關掉再打開 Obsidian，「版本」顯示 `0.6.0+288fc3d9`。
- 演練後還原：三個檔放回測試 vault，雜湊和另存的相同；Obsidian 完全關掉再打開，`version` 讀回 `0.6.0+4536a17`。測試 vault 的紀錄多了 D-149 的版本行（Windows 換版與換回、iPhone 載入各一行），其他沒動。

合併（2026-11-20）：[PR #27](https://github.com/kuohappiness/Essence/pull/27) 用合併 commit 進 `main`（`414f64c`）。PR 的 run [44725273932](https://github.com/kuohappiness/Essence/actions/runs/44725273932) 七個 job 都成功，plan 同時照分岔點（`ecb85f9..7d6ab0c`）與 GitHub 的合併樹（`1153ba8..412cb2d`）分派，R1 的程式路徑在 GitHub 上實際走過。合併後：主資料夾快轉到 `414f64c`，`tools/`、`plugins/cards/` 各 `npm ci`；第 14 項：Pages 的 run [44725918720](https://github.com/kuohappiness/Essence/actions/runs/44725918720) 成功，`roadmap.html`、`progress-map-list.html`、`index.html` 都回 200，`roadmap.html` 有正式 vault 的 `0.6.0`；backlog、roadmap 兩列與 L2 的兩個已知的限制（R11、R12）在 `main` 改了；`docs/progress-map.md` 的本機預覽指令改成 `node tools/progress-board.ts`（§A8 漏改的）。

根目錄留下的舊產物（使用者 2026-11-20 選搬走）：`main.js`、`styles.css`、`node_modules/` 搬到 `D:程式開發Essence Cards Backup搬家前根目錄的建置產物 2026-11-20`，兩個檔的雜湊相同、`node_modules` 15740 個項目都在；搬走後 `git status` 只剩 `docs/syntax.md` 的換行差異，`npm --prefix tools run check` 通過。`.local/` 留在原處。

- 第 11 項（合併後）：使用者在 `main`（`5afd46e`）開新的雲端 session，2026-11-20 核對開場訊息：四個資料夾的結果、Node 24、`core.hooksPath` 和合併前相同。訊息原文同樣沒有存下來。

A 的驗收全部完成。

### B 的進度（2026-11-20）

分支 `claude/serene-payne-bfeb06`，從 `main` 的 `98e7940` 開出。`19a5520` 修改連結的腳本（§B0 第 4 項）；`894fa07` [文件清單](one-repo-step-2-inventory.md)與 D-208 第 8 點的連結（§B0 第 2、3 項）；`495acf7` 搬檔（§B1～§B4，以下稱 `<B 搬檔>`）：242 個 R、2 個要 `-M30%` 才認得的改名（見第 1 項）、11 個 A（拆出的新檔與 Cards 的 README、AGENTS.md、CLAUDE.md）、91 個 M。每個 commit 都經過 pre-commit；`<B 搬檔>` 的分派是共用工具與 Cards 都跑完整檢查，都通過。

已驗的驗收項目（腳本在本機的暫存資料夾，另存一份在 session 的共用筆記資料夾；結果以這裡為準）：

- 第 1 項：清單在 `894fa07` 先 commit，列了 243 份；實際搬了 244 份，多的是清單自己（`tasks/` → `docs/tasks/`，R100，L2 R4 後補記在清單）。整份搬的 244 列，新路徑都在、舊路徑都不在；每一列 `git log --follow --name-only` 都有舊路徑，也有那個檔搬之前最後一次被改的 commit（不算合併 commit，同 A）。`plugins/cards/docs/plans/practice.md`、`updates.md` 兩份很短、每行很長，改連結後相似度 40%，要加 `-M30%`（L2 R4 後在清單那兩列註明）。逐段拆出的段落：取 `894fa07` 的原段落和新位置比，連結目標換成佔位字串後相同，只有三段刻意改過：`product.md` 的〈3. 使用者與情境〉（目標使用者留最上層，Cards 那份連過去）、〈4. 產品原則〉（全專案的第 8 條與品質目標留最上層，Cards 那份連過去）、`backlog.md` 的〈v1 需要做的任務〉以下（技術債表前加一行連到最上層的技術債、多一列下面「實作者自己選的做法」第 1 點的技術債）。D-208 第 8 點連到這份說明（`894fa07`）。
- 第 2 項：`node tools/check-docs.ts` 通過（385 個 Markdown 檔、7957 個連結）；文件檢查本身就是用 Markdown 解析器查每個連結的檔與錨點，舊路徑都不在了，連到舊路徑或拿掉的錨點都會報。例外是製卡規則送給 AI 的部分（第 1 點）。
- 第 3 項：三份拆開的文件（加上 roadmap、backlog 共五份）搬家前每個 `##` 錨點在原檔都還在，被搬走的那一節都有一行連到新位置；`embedRules()` 用 `894fa07` 的規則檔內容算一次，和 `<B 搬檔>` 的 `deepEqual`（5 個科目、18 份規則的雜湊都相同）；`ai-rules.test.ts` 挑到的 Cards 規則檔 5 份。
- 第 4 項：`tools/tests/dispatch.test.ts` 在本 repo 實際找：改 `plugins/cards/docs/syntax.md` 選到 `ai-add-move`、`ai-add-old-version`（經 helper）、`ai-add`、`deck`、`errors`、`lock`、`study` 七個；改 `docs/transcript.md` 分派到 Capture 的完整檢查、選到 Cards 的 `lock.test.ts`；舊的 `tasks/`、`Claude Codex Discussion/` 落第 10 條「全部」。`hooks.test.ts` 在乾淨 clone 改 `docs/transcript.md`，Cards 跑相關測試、Capture 跑完整檢查。
- 第 5 項：搬走的已完成文件 106 份（狀態行是已完成、已合併、已結案），狀態行與全文在連結目標換成佔位字串後都和搬之前相同。
- 第 6 項（合併前的部分）：本機產生 `index.html`、`progress-map-list.html`、`progress-map-board.html`、`roadmap.html`。`roadmap.html` 有 Cards 的列（前綴「Cards｜」）、正式 vault 的 `0.6.0`；待補測 5 列，都在 Cards 的 backlog（搬之前在最上層也是 5 列）。375px：三頁都沒有橫向捲動；畫布頁頂端那一列在 B 之前就超出 23px（右邊「畫布」按鈕被切掉一段），B 的說明字讓它再多 23px，改成「（最上層與 Cards）」之後那一列到 366px，整列看得到。合併後看 Pages 的 run。
- 第 7 項：`check-docs.test.ts` 的「BEFORE_D195 也放過 Cards 的舊任務」：`plugins/cards/docs/tasks/w3.md` 放過、不在清單上的照查；Mindboard 的同名任務照查（第一步的測試照留）。
- 第 8 項：`git ls-files tasks "Claude Codex Discussion" "plugins/*/tasks" "plugins/*/Claude Codex Discussion"` 是空的。`check-docs.test.ts` 的暫存 repo 在四種舊位置各放一個檔，都報、訊息有新位置；`docs/tasks/`、`plugins/capture/docs/tasks/` 沒有狀態行的照常報。
- 檢查：`<B 搬檔>` 之前在工作樹跑 Cards 的 `npm run check`（2904 個測試全過）、`tools/` 的 `npm run check` 與 `npm run self-check`；self-check 原本 3 個失敗，修了再 commit（第 3 點與 `dispatch.test.ts` 一行註解）。
- 第 9 項：L2 第一輪（`7c4828c`）七項都修了（[報告與回應](<../Claude Codex Discussion/2026-11-20-one-repo-step-2b-review.md>)）：R1 重跑改連結的腳本會把手修的 Cards backlog 連結改回共用目錄（腳本加 `settled`、那一處改成純文字）；R2 同一段的純文字當成連結；R3 `FROZEN_RULES` 範圍太寬（改成逐檔列路徑）；R4～R7 文件。第二輪（`756ecd8`）四項也修了：R5 加的兩條連結從搬家前的位置也解得到（重跑要人看 2 個，改成只有一種解法）、引用式連結也讓純文字被誤改、規則檔改名後凍結的那一列留下、Capture backlog 漏改的一處。第三輪（`a3d307d`）兩項也修了：第二輪的修法改變了解析（引用式連結後緊接括號的純文字會被改，改成保留定義、目的地換佔位值再數）、整個規則資料夾搬走時凍結表的列留下（改成 Cards 的 manifest 在就報缺檔）。第四輪（`9fd01ee`）沒有擋合併的發現，一項 P3 也修了（引用式連結的佔位值可能和真的錨點同名，改成沒有目的地），Codex 已驗證同一個修法，不開第五輪。

實作者自己選的做法（規格沒寫到的）：

1. **製卡規則送給 AI 的部分不改連結**：國語、社會、英文三份規則在 `<!-- 以下送給 AI -->` 以下有連到決定、試作場與討論稿的相對路徑；改了就是改送出的內容，嵌入的雜湊會變（D-151，驗收第 B3 項要相同）。那一段照搬之前的位置留著，文件檢查用 `FROZEN_RULES` 照搬家前的位置解（逐檔列出搬家時就在的路徑，L2 R3；表上沒有的、解不到的照樣報，改好了要從表上刪），社會那份一條連到已搬走的討論稿的放進例外清單；Cards backlog 記一列技術債，下次改那份規則的版本時一起改。代價：在 Obsidian 或 GitHub 上點那幾條連結打不開。
2. **改連結的腳本加三條**：拆出的新檔與整份搬的檔裡，連結先照搬之前的位置解，搬之前解不到、搬之後解得到的（手寫成新位置的）不動；`stay`：沒搬的檔裡連到拆開的原檔、指定錨點（backlog 的〈技術債〉〈已知的限制〉）的連結留在原檔，不跟著那一節的大部分去 Cards；`frozen`：上面第 1 點的範圍不改。合併前 rebase 之後要重跑，用另存的計畫檔（加了 `stay` 與 `settled`：連結已照計畫改過一次，搬走或拆出的檔裡兩種解法不同的也列成要人看，L2 R1），在修正後的樹 `--check` 是 0 個修改、0 個要人看（第四輪修完後再跑一次）。
3. **連到資料夾的連結**（`../tasks/`、`../../../docs/research/` 這類）腳本不處理，手改。
4. `tools/tests/hooks.test.ts` 的乾淨 clone：文件照本 repo 暫存區的檔案清單同步（多的刪、少的與每一份 `.md` 從工作樹複製）。搬檔的 commit 時 clone 的 HEAD 還是舊位置，新的文件檢查會擋，pre-commit 就過不了；之後的 commit 照樣有效。
5. `experiments/t4/` 的腳本與設定檔裡的規則檔路徑改成新位置；那裡的自我測試要在 `experiments/t4/` 另外安裝相依，沒跑。
6. 程式與測試註解裡寫到舊路徑的（例如 `tasks/one-repo-step-1.md §3`）是當時的紀錄，不改。

本機留下的（不影響 repo）：工作樹裡 `tasks/`、`Claude Codex Discussion/`、`docs/card-rules/`、`docs/research/` 四個空資料夾（沒有追蹤）；`D:\Users\` 底下一份白板預覽（產生時 `--out` 給了相對路徑），請使用者刪。

合併（2026-11-21）：使用者同意後，[PR #28](https://github.com/kuohappiness/Essence/pull/28) 用合併 commit 進 `main`（`5cfe573`）。合併前的停手時段：`main` 從 `98e7940` 之後沒有新 commit，不用 rebase；另存的計畫在 `a0cd551` 重跑 `--check` 是 0 個修改、0 個要人看；Cards 的 `npm run check`（2904 個測試）、`tools/` 的 `npm run check` 與 `npm run self-check`（175 個通過，1 個是 Windows 跳過的檔名換行）都過；PR 的 run [44772799850](https://github.com/kuohappiness/Essence/actions/runs/44772799850) 與 push 的 run 七個 job 都成功。合併後：主資料夾快轉到 `5cfe573`（`docs/syntax.md` 只有換行差異、內容相同，另存一份後還原；相依沒變，不用 `npm ci`），舊的 `tasks/`、`Claude Codex Discussion/`、`docs/card-rules/` 都不在了；第 6 項：Pages 的 run [44775682027](https://github.com/kuohappiness/Essence/actions/runs/44775682027) 成功，`roadmap.html`、`progress-map-list.html`、`progress-map-board.html`、`index.html` 都回 200，`roadmap.html` 是合併後的內容（有 Cards 的列、正式 vault 的 `0.6.0`）；Cards 的已完成寫一列（最舊的一列搬到封存），技術債「外掛只改文件也跑完整檢查」只留 Capture、Mindboard；本機記憶裡的舊路徑改了。

B 的驗收全部完成。
