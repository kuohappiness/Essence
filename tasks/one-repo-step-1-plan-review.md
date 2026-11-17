# 三個外掛同一個 repo 第一步：開工前查核（給 Codex）

狀態：等 Codex 查核（報告寫在 `Claude Codex Discussion/2026-11-17-one-repo-step-1-plan-review.md`）

遵守 repo 根目錄的 `AGENTS.md`。建議推理等級：**高**。請**新開一個 session**。

[任務說明](one-repo-step-1.md)把 [D-208](../docs/decisions.md#d-208-三個外掛在同一個-repo-開發每個外掛有自己的資料夾) 第 5 點的第一步寫成可以施工的規格。D-208 本身已定案（你在第二輪同意過），這次**不重議要不要做**，只查任務說明在 D-208 沒寫死的地方選得對不對、有沒有漏。程式還沒動。這一步會改 pre-commit、pre-merge-commit 與 CI，表錯了會默默漏查，所以開工前先請你看一次，合併前另有 L2。

## 基準

`main` 上加入這份請求的 commit（`git log -1 --format=%h -- tasks/one-repo-step-1-plan-review.md`），hash 寫進報告。

只讀：任務說明全文；需要時讀 D-208、[討論稿](<../Claude Codex Discussion/2026-11-09-one-repo-three-plugins.md>)的〈Codex 回應：第二輪〉與〈修正後的提案〉；`.githooks/pre-commit`、`.githooks/pre-merge-commit`、`.github/workflows/check.yml`、`.github/workflows/progress-board.yml`、`package.json`、`knip.jsonc`、`tools/check-docs.ts`、`tools/secretlint.mjs`、`tests/quality.test.ts` 的 hook 測試。只查文件與指令，不用跑 `npm run check`；要驗證的假設可以在暫存複本用小腳本試。

## 查什麼

1. **共用檢查的相依放 `tools/`**（§1）：`tools/` 自己一份 `package.json`，共用工具路徑不變、Cards 的工具過渡期照樣往上找到根目錄的套件；hook 的安裝入口（`prepare`）也搬過去。比較其他放法（獨立的新資料夾、把共用工具搬走、根目錄留著共用相依）；有沒有 Node、TypeScript、ESLint、knip 或 npm 在巢狀 `package.json` 下的反例（任務〈平台事實〉列了 Claude 在 Linux 試過的）；Windows、既有的 worktree 合併後會怎樣。
2. **分派表**（§2，**這次最重要**）：規則、兩種跑法（完整、相關測試）、「不認得就全部」、過渡期根目錄當 Cards、CI 把相關測試升成完整。驗收例子的表有沒有算錯；漏了哪些路徑或組合（例如 `.gitignore` 讓檔案不再追蹤、子模組、符號連結、大小寫只差一個字的改名、空的 commit、合併 commit、`core.quotepath`、檔名有空白或換行）。相關測試用 `grep -F` 找路徑字串，在外掛裡用相對於外掛的寫法，會不會漏或多。
3. **CI 的基點與 gate**（§4）：push 到分支用和 `origin/main` 的合併基點、push 到 `main` 用 `before`、PR 用合併基點；缺基點跑全部。gate 讓「照表跳過」與「漏跑」分得出來的判法夠不夠；`if: always()`、`needs` 結果、取消、重跑單一 job、plan 自己失敗時的結論對不對；pre-merge-commit 與 `.claude/hooks/ci-status.mjs` 照舊讀 workflow 的結論是否仍成立。
4. **文件檢查與白板**（§7、§8）：外掛的狀態目錄、多份 roadmap、最上層必須連到外掛的 roadmap、外掛任務的補測列對外掛的 backlog、`BEFORE_D195` 改成只比最上層；Capture、Mindboard 的規畫搬成各自的 `docs/backlog.md`（而不是 `docs/plans/`）是否妥當。
5. **外掛之間不 import 的共用檢查**（§6）：用字串比對在共用檢查擋，和各外掛的第一個任務各自設 ESLint 比，哪個好；列出會誤擋或漏擋的寫法。
6. **驗收做不做得到**（驗收第 2、4 項）：乾淨 checkout 的 hook 測試、5 個 draft PR 合併到第一步的分支來實測 CI，能不能證明「只改 Mindboard 不安裝也不檢查 Cards」與「跳過的分得出來」；有沒有更省的實測方法。
7. **範圍**：和 D-208 第 5 點比有沒有漏（例如 Codex 第二輪提的「新外掛的產物忽略規則、外掛邊界檢查、各自的測試安裝入口」放的時機）；有沒有可以拿掉或延後、不影響開工的項目。

## 回報

只回報，不改產品程式與文件。寫在 `Claude Codex Discussion/2026-11-17-one-repo-step-1-plan-review.md`，標題下第一行寫狀態。逐題寫同意或反對；反對附證據（檔案:行、文件或可重現的指令），區分「已重現」與「看規格推斷」；查不到的直接說。每項寫建議的改法，Claude 核對後改任務說明。
