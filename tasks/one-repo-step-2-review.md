# 三個外掛同一個 repo 第二步 A：L2 獨立審查（給 Codex）

狀態：第一輪待審（2026-11-20）

遵守 repo 根目錄的 `AGENTS.md`。建議推理等級：**高**。請**新開一個 session**。

[任務說明](one-repo-step-2.md)的 A（程式）由 Claude（Opus 5.5）實作：Cards 的 `src/`、`tests/`、工具與設定搬進 `plugins/cards/`，共用工具在 `tools/` 有自己的檢查與分派對象。這一步改到安裝、更新、備份、還原、跨版本比較的工具，也改 pre-commit、pre-merge-commit 與 CI，屬於高風險範圍（[D-208](../docs/decisions.md#d-208-三個外掛在同一個-repo-開發每個外掛有自己的資料夾) 第 8 點、[docs/agents/quality.md](../docs/agents/quality.md)〈高風險範圍〉），合併前做 L2。B（文件）另一個 PR，不在這一輪。

## 審查對象

- 分支 `claude/one-repo-step-2a`（已 push），本機 worktree `D:\程式開發\Essence-step2a`。沒有未提交的修改（`docs/syntax.md` 在 Windows 的工作檔被轉成 LF 才顯示有改，內容沒變，不用看）。
- 從 `main` 的 `ecb85f9ed4e42b7090a152472d98e63bea936507`（`<基準>`）開出。施工期間 `main` 前進了一個只改 `docs/backlog.md` 的 commit（`1153ba8`），和這一步無關，合併時處理。規格基準是 `<基準>` 上的任務說明。commit（由舊到新）：
  - `870b01886dd5f3f178d407508c75572c822c31a4` §A2 `quality.test.ts` 拆出 ESLint 的那一半
  - `e7130d463abbf67801e0898094a9724f2b62ce71` §A2～§A4 共用工具的檢查、分派對象、hook 與 CI
  - `f22a52601cd819947c0bb70c9a33ea355e40315a` §A3 分派表的完整案例
  - `012a68a4ee0938fafccd1c7da002c95c027d7507` §A1 `update-vault` 跑三段檢查
  - `33cb030cfff8730e43380f80b0b44037a856f8a4` §A5 `cloud-setup` 照 CI 安裝並逐個資料夾回報
  - `4db90b0d888febfa2dfec4329ee4fe3f3dee733f` §A5 建置從 repo 根讀卡片規則
  - `5e30d3c3670d0d841d6aa2d477dc03396b4ea08f` §A5 跨版本工具找各自的外掛根
  - `e7f1e2ebd6c28472025a57c3be772d270b5071f5` §A6 搬檔後改連結的腳本
  - `9e923b612abfec6614a6851bcfebdacc4e25116b` §A2 ESLint 測試的檔頭寫拆出前的 commit
  - `36261e055d3b4c6c48fb3142c415d6487f54925f` §A6 前置：Cards 的 knip 設定先改成搬家後的寫法
  - `7637a8cde50951a93a505d2cad048d7e7f0af812` §A6 搬家（`<搬家>`）
  - `83af5c598c7812e54c3a56c1a268545272953aa4` §A3（驗收）`buildPlugin` 的固定建置版本選項
  - `33fde4fc4bb91495bb28f9a2b1153b08764c60fe` §A8 入口文件
  - `bd2ef86`、`288fc3d`、`1bdc1ef`、`b133e6f` 驗收結果；`7262ed8` 驗收第 A6 項補的兩組測試
  - 這份請求所在的 commit
- 審查對象的最後一個 commit 是這份請求所在的 commit（`git log -1 --format=%H -- tasks/one-repo-step-2-review.md`）；之後分支上有新的 commit，就是修正或再審，不在這一輪。
- 看整個分支：`git diff -M ecb85f9 <那個 commit>`；逐個 commit 看：`git log --reverse -p -M ecb85f9..<那個 commit>`。`<搬家>` 有 379 個改名，看內容差異用 `git diff -M 7637a8c^ 7637a8c --stat` 先找 M 的 38 個檔。

## 規格與優先順序

- 主要規格：[tasks/one-repo-step-2.md](one-repo-step-2.md) 的〈A｜程式〉（§A0～§A8）、〈驗收〉A1～A19、〈平台事實〉。開工前 Codex 查核四輪後雙方一致（[報告與回應](<../Claude Codex Discussion/2026-11-19-one-repo-step-2-plan-review.md>)）。
- 依據：D-208 第 1、2、4、8、9、10 點；第一步的[任務說明](one-repo-step-1.md)與 [L2](one-repo-step-1-review.md)（分派表、hook、CI 的原設計）。相關：D-117、D-149、D-195、D-212。查法：`node experiments/tools/decisions-index.mjs D-xxx`。
- 規格互相衝突或有漏洞時列成問題，不挑容易通過的那份。

## 行為與風險

公開介面與呼叫端：

- `tools/dispatch.ts`：分派表加了共用工具（`tools`）這個對象與 §A3 的表；`CARDS` 從 `.` 換成 `plugins/cards`。呼叫端 `tools/hooks.ts`、`tools/ci-gate.ts`。
- `tools/hooks.ts`、`.githooks/*`：共用工具跑 `self-check` 或相關測試；Cards 的檢查在 `plugins/cards/` 的暫存內容副本跑。
- `tools/ci-gate.ts`、`.github/workflows/check.yml`：多了 tools job 與旗標；cards job 在 `plugins/cards` 安裝與執行，不裝 `tools/`。
- `.claude/hooks/cloud-setup.mjs`：安裝的資料夾和 `check.yml` 的 `npm ci` 一致，每個資料夾印一行結果。
- `plugins/cards/tools/update-vault.ts`：`--check` 在備份前依序跑 `tools` 的 `check`、`self-check`、Cards 的 `check`。
- `plugins/cards/tools/git.ts` 的 `pluginRoot(repo, ref)`；`compare-versions.ts` 與讀舊 tag 的測試用它。
- `plugins/cards/tools/build.mjs`：`RULES_FROM_ROOT`、`rulesRoot`；只給測試與驗收用的 `version` 選項。
- `plugins/cards/tools/install.ts` 的 `.local/` 位置（`--git-common-dir`）、`backup`、`restore` 只跟著搬，沒改邏輯。
- `experiments/tools/move-links.mjs`：搬檔後改連結（只在 `<搬家>` 用過一次，之後 B 也會用）。

不可破壞的性質：

1. 產品程式一行都沒改：`src/` 全是 R100；固定建置版本時，`<基準>` 與 A 的正式版、dev 版 `main.js` 逐位元組相同。
2. 搬的每個檔都是改名，`git log --follow` 接得到搬之前的歷史。
3. 正式 vault 的安裝、更新、備份、還原照舊：`.local/`（正式產物與測試 vault 的登錄）的位置不變；舊 ZIP 搬家後還原得了；`update-vault --check` 任一段沒過就停，還沒有備份、比較與安裝。
4. 跨版本的工具照每個 commit 自己的外掛根做；判不出就丟錯、不猜。
5. 分派：跳過一定有理由；改共用工具跑共用工具；改 `.githooks/` 全部跑；外掛之間、外掛與共用工具之間不互相 import（`check-plugin-imports`）。
6. Cards 的檢查不靠 `tools/node_modules`，共用工具的檢查不靠 Cards 的 `node_modules`；兩邊都不靠根目錄的 `node_modules`。
7. 每個 commit 之後 hook、CI 與 Pages 都能跑（過渡的 commit 也是）。

已知的邊界例子在任務說明 §A3 的表與〈驗收〉；這些只是起點，請找新的組合，例如：搬家前開的 worktree 或分支在搬家後 commit 或合併（`core.hooksPath` 被別的 checkout 改過、pre-merge-commit 讀到的是哪一版的 `tools/hooks.ts`）；從搬家前的 tag 跑 `update-vault`、`install-vault --release`；`.local/releases/` 裡搬家前產生的 `release.json`；`compare-versions` 一邊是淺層 clone；`npm --prefix plugins/cards run …` 從 repo 根或子資料夾執行；`plugins/cards/docs/` 與最上層 `docs/` 在分派表的先後（B 會用到）；Windows 的大小寫與 junction；雲端 session 的 `CLAUDE_PROJECT_DIR`。

明確延後的範圍：B 的文件搬家（含 `syntax.md` 拆分與轉錄稿格式）、D-213 的任務與討論稿搬進 `docs/`、Capture 寫 Cards 讀的共用範例與已部署讀端的相容檢查（D-208 第 6 點）。

## 驗證方式

- 環境：Windows 11、Git 2.52.0、Node 24.13.0、npm 11.6.2；CI 是 GitHub Actions 的 Ubuntu、Node 24。
- 安裝：`tools/` 與 `plugins/cards/` 各自 `npm ci`；根目錄不再有 `package.json`。新開的 Windows worktree 的 `docs/syntax.md` 會被取出成 CRLF，Cards 的 deck 測試會失敗：先把工作檔轉成 LF，或用 `git -c core.autocrlf=false worktree add`（commit 的副本一律 LF，不受影響）。
- 指令：`npm --prefix plugins/cards run check`（Cards 的完整檢查，不含共用檢查）；`npm --prefix tools run check`（共用檢查）；`npm --prefix tools run self-check`（共用工具的型別、lint、knip 與測試）。在 `tools/` 只跑這一步的測試：`node --test --test-timeout=600000 tests/dispatch.test.ts tests/hooks.test.ts tests/ci-gate.test.ts tests/plugin-imports.test.ts tests/cloud-setup.test.ts tests/quality.test.ts`；在 `plugins/cards/`：`node --test --test-timeout=600000 tests/plugin-root.test.ts tests/compare-versions.test.ts tests/update-vault.test.ts tests/build.test.ts tests/eslint-rules.test.ts`。`hooks.test.ts` 每個案例 `git clone --no-local` 一次，Windows 約 150 秒。
- 看分派：`node tools/dispatch.ts --range <base> <head> --explain`。
- 實作者跑過的驗收、演練、CI 的 run 與探針 PR：任務說明〈結果〉的〈A 的進度〉，每一項都附 commit 與 run。
- 平台事實：任務說明〈平台事實〉；待驗的只剩雲端 session（驗收第 A11 項，合併前在這個分支、合併後在 `main` 各開一個新的雲端 session 看開場訊息；Claude 另外做，不用 Codex 做）。
- 需要實機的：已做完（§A7 第 4 項 Windows 版 Obsidian、第 6 項 iPhone，結果在〈A 的進度〉）。

## 實作者自己選的做法

規格沒寫、由 Claude 決定的地方。請先看這些：

1. `36261e0` 先把 Cards 的 `knip.jsonc` 改成搬家後的 glob，搬家前用 `ignore` 擋住還在 `tools/` 的共用工具；`<搬家>` 只刪那段 `ignore`。目的：`knip.jsonc` 在 `<搬家>` 是 R068，不是 D 加 A（驗收第 A2 項）。代價：搬家前的那個 commit，Cards 的 knip 看的範圍靠 `ignore` 的清單，共用工具在那之間新增的檔要手動加進清單（只隔一個 commit）。
2. `e7130d4` 的檢查入口（分派表要知道哪些檔是共用工具的入口）從 hook、`check.yml` 與外掛的 npm scripts 算出來，不手寫清單；`dispatch.test.ts` 在這個 commit 只做讓改名成立的最小修改，完整的表在下一個 commit。
3. `012a68a` 拿掉 `codex` 的 npm script：`npm --prefix tools` 會改變請求檔相對路徑的基準，改成在 repo 根執行 `node tools/codex.ts`。
4. `33cb030` 用一個測試逐字比對 `cloud-setup.mjs` 的資料夾清單與 `check.yml` 每個 job 的 `npm ci` 資料夾：新增外掛的 job 沒同步就失敗。每個資料夾印一行（安裝了、失敗、鎖檔沒變、沒有相依、沒有鎖檔、沒有 `package.json`），跳過不再沒有聲音。
5. `4db90b0` 測試自己建的暫存專案照真的 repo 排（`tests/helpers/layout.ts`：規則檔在暫存 repo 的根、Cards 在和這個 repo 相同的相對位置），搬家時這些測試不用改。
6. `5e30d3c` `pluginRoot` 用 `ls-tree --full-tree`（Codex 開工前查核第三輪實測，不加時從子資料夾呼叫會回 0 筆）；只有一個位置有 `id` 對的 manifest 才算，其餘一律丟錯。讀舊 tag 的測試改成從 repo 根 clone（搬家後 clone 子資料夾在 checkout 前就失敗），`node_modules` 連到那一版自己的外掛根。
7. `e7f1e2e` 改連結的腳本用和 `check-docs` 相同的 markdown-it 設定找連結（行內、引用式、角括號；不含程式碼），保留錨點與原本的編碼，也改這個 repo 的 `blob/main/` 網址；從檔案現在的位置解得到的連結不動，所以第二次執行不改任何字。`<搬家>` 用它改了 415 個連結。
8. `<搬家>` 是一個 commit（檢查只有在路徑與指到它們的設定一起改時才過）。`tools/tests/dispatch.test.ts` 的 fixture 加一個 `plugins/capture/docs/` 的檔（`git mv` 不建目的資料夾）；`plugin-root.test.ts` 在 HEAD 的 manifest 和暫存區不同時（也就是 `<搬家>` 自己的 pre-commit）跳過 HEAD 那一項，由下一個 commit 驗。
9. `83af5c5` 的 `version` 選項只給測試與驗收用（驗收第 A3 項要固定建置版本比整份），安裝與發布的流程不傳。
10. 演練（§A7）時的偏離：演練 vault 拿掉一篇 `需要版本 9.9.9` 的 iPhone 測試卡組（它是用來測讀取閘門的，留著時 `--release 0.6.0` 照規則拒絕退版）；clone 改 `0.6.1` 時，照 `fb1a051` 一起改了版號寫死的三個測試（只在演練的 clone）。

## 合併後才做的（不用審，列出來讓審查者知道）

- 主資料夾 `D:\程式開發\Essence` 還有搬家前在根目錄的建置產物與 `node_modules`（`.gitignore` 改成 `plugins/cards/` 之後會變成沒追蹤的檔）：合併後先問使用者再搬走；`tools/`、`plugins/cards/` 各自 `npm ci`。
- `docs/backlog.md`、`docs/roadmap.md` 的兩列在 `main` 改；合併後在 `main` 開新的雲端 session（第 A11 項）、看 Pages 的 run（第 A14 項）。

## 回報與權限

- 只審查與回報，不改檔；可以在隔離的暫存 repo 或 clone 重現。不要 push、不要開 PR、不要動 `main` 的設定（分支保護、必過檢查）；需要在 GitHub 上實際跑的，寫成探針步驟交給 Claude。不要碰 iCloud 裡的任何 vault（測試 vault 也不要）。
- 每項發現寫：哪一軸（規格／規範與設計）、觸發條件、預期／實際、影響、位置、證據（已重現／靜態推斷／待驗證）、**真實路徑會不會發生**與發生機率、建議處理。可以回報「規格本身有漏洞」。
- 報告寫在 `Claude Codex Discussion/2026-11-20-one-repo-step-2-review.md`，標題下第一行寫狀態；頭尾寫待審 commit、審查範圍、測試結果與沒驗的項目及原因。
