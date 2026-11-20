# 三個外掛同一個 repo 第二步 A：L2 獨立審查（給 Codex）

狀態：第三輪待審（2026-11-20；報告與回應見〈第二輪〉開頭連結的討論稿）

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

## 第二輪

第一輪（Codex，`c298cf1`）回報 R1～R5，Claude 逐項核對都成立：R1、R2、R3、R5 修，R4 記成 B 的開工條件（腳本只在 B 再用）。報告與逐項的回應（真實、修之前、修之後三欄，判斷與修正的 commit）在 [`Claude Codex Discussion/2026-11-20-one-repo-step-2-review.md`](<../Claude Codex Discussion/2026-11-20-one-repo-step-2-review.md>)〈第一輪｜Claude 回應〉。這一輪只審修正：

### 審查對象

- 分支 `claude/one-repo-step-2a`（已 push），本機 worktree `D:\程式開發\Essence-step2a`。沒有未提交的修改（`docs/syntax.md` 同第一輪）。`main` 仍在 `1153ba8`。
- 只審 `c298cf15c03591c7bdc421a2c0ba87116446c85e..<最後的 commit>` 的差異與受影響的路徑，不必整包重審。新的 commit（由舊到新，一項發現一個）：
  - `caefd63` R1 PR 的 plan 也照合併樹分派
  - `63b0c70` R5 對照表的路徑以 repo 根為基準
  - `62595e2` R2 命令列的相對路徑照叫 `npm run` 的資料夾算
  - `e01d466` R3 入口相依認同一行的 import、`require` 與 `.cjs`
  - `c0234f1` 第一輪的報告與回應；R4 記進任務說明 §B0 第 4 項
  - 最後一個是這一節所在的 commit
- 看差異：`git diff c298cf15c03591c7bdc421a2c0ba87116446c85e <最後的 commit>`；逐個：`git log --reverse -p c298cf15c03591c7bdc421a2c0ba87116446c85e..<最後的 commit>`。最後的 commit 是 `git log -1 --format=%H -- tasks/one-repo-step-2-review.md`。

### 受影響的路徑

- R1：`tools/ci-gate.ts` 的 `endpoints`、`plan`（只有 `pull_request` 事件多一組合併樹的分派；push、`workflow_dispatch`、`merge_group` 不變）。plan 的輸出格式不變，`compare` 多一段「合併樹 x..y」，gate 照舊只讀旗標與理由。
- R5：`plugins/cards/tools/build.mjs` 寫的 `main.js.map`（正式與 dev 建置都寫）；讀它的 `plugins/cards/tools/locate.ts` 沒改。
- R2：七個命令列入口的參數解析（`install-vault`、`backup`、`restore`、`update-vault`、`compare-versions`、`export-compare`、`bench`）。被別的工具 import 的函式介面沒改；`update-vault` 內部呼叫 `backup`、`install` 走函式，不經命令列。
- R3：`tools/dispatch.ts` 的 `relativeImports` 與入口遞迴；呼叫端是 `entries()`（第 6 條：pre-commit、pre-merge-commit、CI 的 plan 都用）。
- R4：只改文件。

### 實作者自己選的做法（第二輪）

1. R1 不另外讀 PR 的 base 分支，直接用 GitHub 給的合併 commit（`GITHUB_SHA`）：它就是 job checkout 的樹。合併 commit 必須正好兩個 parent、第二個是 PR 的 head，對不上（例如 Actions 換了合併方式、或有人手動觸發時給的不是合併 commit）就跑全部。兩組分派取聯集（任一邊要跑就跑），跳過的理由兩邊都要有；聯集只會讓結果多跑，不會比只看分岔點少。
2. R2 用 `INIT_CWD`，而且只在 `npm_lifecycle_event` 是這支工具自己的 script 時才用：npm 11.6.2 每次執行都把 `INIT_CWD` 設成叫 npm 的資料夾、子程序會繼承（`@npmcli/config/lib/set-envs.js:58`），所以 `npm test` 底下的測試再直接叫 `node tools/install.ts` 時，不能被外層的 `INIT_CWD` 帶偏。沒採用另一個建議（拒絕相對路徑）：會改掉在 `plugins/cards/` 裡 `npm run install-vault -- ../…` 這種現有用法，而且 `quality.md` 的寫法也要跟著改；`INIT_CWD` 讓兩種位置都回到「照你打指令的地方算」。`--config` 是相對 vault 的設定資料夾，不是檔案系統路徑，沒改。
3. R3 的靜態 import 認同一行 `;` 之後的敘述與 `require(…)`；不在行首的先確認不在字串裡（沿用原本動態 import 的判斷）。沒有改用 TypeScript 的 `preProcessFile`：`dispatch.ts` 不用 npm 套件（檔頭：CI 的分派 job 與 hook 不必先安裝就能跑），所以照舊用正規式；改成一組樣本同時餵兩邊、斷言取到的相同，當作獨立驗收。
4. R5 只改新建置寫出的對照表；搬家前存的對照表相對當時的根（也就是 repo 根），照舊對，`locate` 不用分新舊。

### 驗證方式

- 回歸測試都先寫，修之前跑過是失敗的：
  - R1：`tools/tests/ci-gate.test.ts`「§4 比較端點：PR 也看合併樹（第二步 L2 R1）…」：在暫存 repo 做出搬家前的分支只改 `tools/install.ts`、`main` 已搬家、真的合併 commit；預期 `tools,cards`，Cards 的理由提到 `plugins/cards/tools/install.ts`；合併 commit 的 parent 對不上 → 全部。修之前是 `tools`。原本兩個 PR 測試改用真的合併 commit（原本的 `merge-sha` 是假值，照新規則會跑全部）。
  - R5：`plugins/cards/tests/build.test.ts` 與 `locate.test.ts`：對照表的 `sources` 是 `plugins/cards/src/…`，`locate` 回傳的路徑在 repo 裡找得到檔（`existsSync`）。修之前回 `src/…`。
  - R2：`plugins/cards/tests/cli-path.test.ts`：單元測試（注入環境變數）與真的 npm：暫存的 `top/plugins/cards` 套件，從 `top` 用 `npm --prefix plugins/cards run probe -- vault` → `top/vault`；在套件裡 → 套件的 `vault`；套件的另一個 script 再叫 `npm run probe` 時照它自己那一層。修之前第一種解到套件裡。
  - R3：`tools/tests/dispatch.test.ts` 兩個分派案例（`hooks.ts` 同一行第二個敘述 `import './new-entry.ts'`，只改 `new-entry.ts`；hook 跑 `node tools/start.cjs`、它 `require('./worker.cjs')`，只改 `worker.cjs`）→ 全部；一組 `relativeImports` 的樣本（`require`、同一行、字串與註解裡的不算），每個樣本也和 `ts.preProcessFile` 對過。修之前兩個案例都只跑共用工具。
- 每個 commit 都經過 pre-commit 的分派與完整檢查（R3 改到入口，三個外掛與共用工具全部跑）。
- GitHub：R1 的探針（照第一輪的建議，從 `ecb85f9` 開分支只改 `tools/install.ts`，對 `c0234f1` 開 draft [PR #26](https://github.com/kuohappiness/Essence/pull/26)）：GitHub 判有衝突（`mergeable` false、`dirty`，關掉重開再算一次也一樣），沒有建合併 commit，`pull_request` 的 run 沒跑，合併條件的 gate 也就不會過。本機 Git 2.52 的 `merge-tree` 合得乾淨（改名限制調到 10 也一樣）。所以在 GitHub 上，這種分支要先在本機把 A 合進來才能合併；合進來之後分岔點就在搬家後，原本的分派就對。R1 的修正留著，GitHub 為什麼判衝突沒查出原因，判得出合併時照樣有效；記進任務說明〈平台事實〉。`c0234f1` 的 push run [44695210758](https://github.com/kuohappiness/Essence/actions/runs/44695210758) 七個 job 都成功。這一節所在的 commit 的 run：`gh run list --commit <最後的 commit> --workflow check.yml --event push`（Claude 確認全綠後才交給 Codex）。
- 沒驗的：R4 等 B 開工時修與驗收；雲端 session（第 A11 項）照第一輪〈驗證方式〉。

### 回報

照第一輪〈回報與權限〉。延續第一輪的發現標「延續 Rx」，修正帶出的標「Rx 修正引入」。報告接在同一份討論稿的最後，加〈第二輪｜Codex 報告〉一節。

## 第三輪

第二輪（Codex，`c7d5493`）回報三項，Claude 的回應依序叫 R6（P2，R2 修正引入）、R7、R8（P3，延續 R3），逐項核對都成立，都修。報告與回應在討論稿〈第二輪｜Codex 報告〉〈第二輪｜Claude 回應〉。這一輪只審修正：

### 審查對象

- 分支 `claude/one-repo-step-2a`（已 push）。沒有未提交的修改（`docs/syntax.md` 同第一輪）。`main` 仍在 `1153ba8`。
- 只審 `c7d5493a5efea576c69cc3540bc922ef7ccf9fce..<最後的 commit>`。新的 commit（由舊到新，一項發現一個）：
  - `9ec207b` R6 命令列給空字串的路徑就停下
  - `27a3d3e` R7 分派照一行裡的字串狀態判斷，不再分別數引號
  - `7f64932` R8 入口遞迴照 Node CommonJS 會載入的檔，入口多認 `.cts`；獨立驗收改用 `require.resolve`
  - 最後一個是這一節所在的 commit（第二輪的報告與回應、這一節）
- 看差異：`git diff c7d5493a5efea576c69cc3540bc922ef7ccf9fce <最後的 commit>`；最後的 commit 是 `git log -1 --format=%H -- tasks/one-repo-step-2-review.md`。

### 受影響的路徑

- R6：`cliPath` 的所有呼叫端（第一輪 R2 列的七個命令列入口）。只多擋空字串，其他輸入的結果不變。
- R7、R8：`tools/dispatch.ts` 的 `relativeImports`、`toolPaths`、`entryTools`；呼叫端照第一輪（第 6 條：pre-commit、pre-merge-commit、CI 的 plan）。入口集合只會變大，不會變小。

### 實作者自己選的做法（第三輪）

1. R6 只擋空字串，不擋只有空白的字串：`resolve('  ')` 是目前資料夾底下一個叫兩個空白的路徑，不是目前的資料夾（Windows、Node 24.13 實測：`realpath`、`stat`、在它底下寫檔都報 `ENOENT`）。擋在 `cliPath` 一處，不在每個入口各寫一次。
2. R7 用一行內的字串狀態（引號與模板字串 `${}` 的堆疊），不跨行：跨行的模板字串裡，行首的 `import` 會被算進去（多算，只會多跑檢查；第一輪起就是這樣，和 `preProcessFile` 的逐檔比對照舊相同）。模板字串 `${…}` 裡的 `require` 照 Node 算，和 `preProcessFile` 不同，測試裡另外斷言。
3. R8 不實際查檔案存不存在，把 Node 可能載入的路徑全部算入口：查存在要多讀一次樹，而不存在的路徑不會出現在改動裡。資料夾 `package.json` 的 `main` 不認：現在沒有這種接線，要認得讀 JSON 與再一層解析。

### 驗證方式

- 回歸測試都先寫，修之前跑過是失敗的：
  - R6：`plugins/cards/tests/cli-path.test.ts`「L2 第二輪 cliPath：空字串的路徑丟錯，`.` 照舊」「L2 第二輪：install-vault、backup 的命令列給空字串的 vault 就停下，資料夾裡什麼都沒寫」。修之前前者沒丟錯；後者的安裝停在找不到 9.9.9，不是空路徑（Codex 用雜湊對得上的產物重現了真的寫入）。
  - R7：`tools/tests/dispatch.test.ts` 的分派案例「hooks.ts 同一行前面是 console.log("it's ready")、再 import ./new-entry.ts…」與樣本測試。修之前停在 `console.log("it's ready"); import './apostrophe.ts';`。
  - R8：三個分派案例（`require('./worker')` 載入 `worker.js`；hook 跑 `start.cts`、它 `require('./worker.cjs')`；hook 直接跑 `start.cts`，只改它）。修之前三個都只跑共用工具。
- 每個 commit 都經過 pre-commit 的分派與完整檢查（R7、R8 改到入口，全部跑）。
- GitHub：這一節所在的 commit 的 run：`gh run list --commit <最後的 commit> --workflow check.yml --event push`（Claude 確認全綠後才交給 Codex）。
- 沒驗的：同第二輪（R4 等 B；雲端 session 合併後在 `main` 再一次；R1 在 GitHub 上沒有可合併的探針）。

### 回報（第三輪）

照第一輪〈回報與權限〉。延續的發現標「延續 Rx」，修正帶出的標「Rx 修正引入」，發現請編號（接著 R9）。報告接在同一份討論稿的最後，加〈第三輪｜Codex 報告〉一節。
