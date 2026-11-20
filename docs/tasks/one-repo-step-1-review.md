# 三個外掛同一個 repo 第一步：L2 獨立審查（給 Codex）

狀態：已結案：L2 第四輪通過（2026-11-18；R9 只改測試，已修），已合併進 `main`（`16cef58`，[PR #21](https://github.com/kuohappiness/Essence-Cards/pull/21)）。各輪見[〈第二輪〉](#第二輪)、[〈第三輪〉](#第三輪)、[〈第四輪〉](#第四輪)

遵守 repo 根目錄的 `AGENTS.md`。建議推理等級：**高**。請**新開一個 session**。

[任務說明](one-repo-step-1.md)由 Claude（Opus 5.5）實作。這一步改了 pre-commit、pre-merge-commit 與 CI，也就是合併前的防線，屬於高風險範圍（[D-208](../decisions.md#d-208-三個外掛在同一個-repo-開發每個外掛有自己的資料夾) 第 5 點、[docs/agents/quality.md](../agents/quality.md)〈高風險範圍〉），合併前做 L2。

## 審查對象

- 分支 `claude/one-repo-step-1`（已 push），本機 worktree `.claude/worktrees/one-repo-step-1`。沒有未提交的修改（`docs/syntax.md` 在 Windows 的工作檔被轉成 LF 才顯示有改，內容沒變，不用看）。
- 從 `main` 的 `d655645e7fd6a239364642b4d2aebc470c171085` 開出，也是和 `origin/main` 的共同祖先（施工期間 `main` 沒有前進）。規格基準是同一個 commit 上的任務說明。commit（由舊到新，一個決定一個；任務說明〈結果〉有對照表）：
  - `ef88c862b392ec18a032999ba43cf67eb88e9291` §1
  - `c4220f04f2d432e18259106b2ba95b5e041d0e07` §5
  - `09b1c027ddfbec23a42d2d848d905bfef91abad7` §2
  - `08a0431b7d230271c73fed6350f09db5283186dc` §6
  - `267f7e5b1d9e0ea4f0a2acb4a819b29f6eb6ee57` §4 的 ci-gate.ts（還沒接上 CI）
  - `0d0527352f00758571fbbff43862d8f6dc1ab151` §3 的前置
  - `4a4acf03a7183e414e4c8d311d762a9424628279` §3
  - `047815c925a391d43628b1384fff0025066d3d41` §4 CI
  - `3f56947a05b9a723e7e19db0500cf3cd80d1501a` §7
  - `13ceb896ffba7de8ee7f6cdc09b0ed291679cf84` §8
  - `af4b12a7a711880d225f1ec3d71e9155f58cfae4` §9
  - `9a55771c6f5e6ba423211b4d9dcf99fac565e4d9` §10
  - `02afb0a40baac16e5d0631d5ac3fdf5c3347381d` §2 的補正（見〈實作者自己選的做法〉第 8 點）
  - 這份請求所在的 commit：驗收、平台事實、〈結果〉、roadmap
- 審查對象的最後一個 commit 是這份請求所在的 commit（`git log -1 --format=%H -- tasks/one-repo-step-1-review.md`）；之後分支上有新的 commit，就是修正或再審，不在這一輪。
- 看整個分支：`git diff d655645e7fd6a239364642b4d2aebc470c171085 <那個 commit>`；逐個 commit 看：`git log --reverse -p d655645e7fd6a239364642b4d2aebc470c171085..<那個 commit>`。

## 規格與優先順序

- 主要規格：[tasks/one-repo-step-1.md](one-repo-step-1.md) §1～§10、〈驗收〉、〈平台事實〉。開工前 Codex 查核過一輪，Claude 照回報改完（[報告與回應](<../Claude Codex Discussion/2026-11-17-one-repo-step-1-plan-review.md>)）。
- 依據：D-208 第 1、2、3、4、5、9、10 點；[討論稿](<../Claude Codex Discussion/2026-11-09-one-repo-three-plugins.md>)的〈Codex 回應：第二輪〉第 2、3 題與〈修正後的提案〉。相關：D-117（不跳過 pre-commit）、D-141、D-195。查法：`node experiments/tools/decisions-index.mjs D-xxx`。
- 規格互相衝突或有漏洞時列成問題，不挑容易通過的那份。

## 行為與風險

公開介面與呼叫端：

- `tools/dispatch.ts`：分派表。`--staged`、`--range <base> <head>`、`--ci`、`--explain`；輸出 JSON。呼叫端是 `tools/hooks.ts` 與 `tools/ci-gate.ts`。
- `tools/hooks.ts`：pre-commit 與 pre-merge-commit 的邏輯。`.githooks/pre-commit`、`.githooks/pre-merge-commit` 先轉給工作樹自己的那一份（見〈實作者自己選的做法〉第 3 點），檢查 `tools/node_modules`，再用 node 執行它。
- `tools/ci-gate.ts`：`plan`（決定比較的端點、寫 `GITHUB_OUTPUT`）與 `gate`（讀 `toJSON(needs)`、寫 `GITHUB_STEP_SUMMARY`、決定結束碼）。呼叫端是 `.github/workflows/check.yml`。
- `tools/check-plugin-imports.ts`、`tools/check-docs.ts`（§7 的改動）、`tools/roadmap-board.ts`（§8，含 `--check`）、`tools/check-skill-mirror.ts`（`--staged`）。

不可破壞的性質：

1. 跳過一定有理由：hook 與 gate 的摘要，每個沒跑的外掛都寫出照哪一條跳過；要跑卻沒跑到的，不能成功（hook 擋下、gate 紅燈）。
2. 讀的是這次 commit 的內容：hook 在 Git 給的環境裡讀索引（`git commit <路徑>`、`-a` 用的是暫時的索引）；共用檢查讀暫存區。
3. Git 讀取失敗、比較的基點找不到、plan 的輸出缺或壞，都不能當成「沒有改動」或「不用跑」。
4. 共用檢查不靠根目錄的 `node_modules`，也不靠執行時的資料夾。
5. pre-merge-commit 只認同一個 head 的 push run；合併索引裡的違規照樣被共用檢查擋。
6. 每個 commit 之後 hook、CI 與 Pages 都能跑（開工條件）。
7. pre-commit 的外掛檢查讀到的就是這次要 commit 的內容（§10）；跑完副本一定刪掉，借出去的 `node_modules` 不能被刪。

已知的邊界例子在任務說明 §2 的表與〈驗收〉；這些只是起點，請找新的組合，例如：改名跨過規則的界線、一次 commit 同時有子模組與其他檔、PR 的 base 在分岔後被 force push、`before` 指到 GitHub 已經回收的 commit、job 被取消後只重跑 gate、hook 在 `git rebase` 或 `git cherry-pick` 時被呼叫、`core.hooksPath` 是相對路徑卻指到別處、Windows 的大小寫與 junction。

明確延後的範圍：改名 `Essence`、轉錄稿格式搬到最上層、Cards 搬進 `plugins/cards/`、外掛的「相關測試」跑法（§10 新的技術債列）。

## 驗證方式

- 環境：Windows 11、Git for Windows 2.52、Node 24.13、npm 11.6；CI 是 GitHub Actions 的 Ubuntu。
- 安裝：根目錄 `npm ci`，`tools/` 也 `npm ci`（hook 要用）。新開的 Windows worktree 的 `docs/syntax.md` 會被取出成 CRLF，在工作樹跑 `npm run check` 時 Cards 的 deck 測試會失敗：先把工作檔轉成 LF（commit 的副本一律 LF，不受影響）。
- 指令：`npm run check`（Cards 的完整檢查，含共用檢查）；`npm --prefix tools run check`（只有共用檢查）；只跑這一步的測試：`node --test --test-timeout=300000 tests/dispatch.test.ts tests/hooks.test.ts tests/ci-gate.test.ts tests/plugin-imports.test.ts tests/check-docs.test.ts tests/roadmap-board.test.ts tests/progress-board.test.ts tests/skill-mirror.test.ts tests/quality.test.ts`。`tests/hooks.test.ts` 每個案例 `git clone --no-local` 一次，Windows 兩個案例共約 100 秒。
- 看分派的結果：`node tools/dispatch.ts --range <base> <head> --explain`。
- 實作者跑過的、CI 的 run 與探針：任務說明〈結果〉的〈驗收〉。
- 平台事實：任務說明〈平台事實〉；沒有待驗的列。沒做探針的：hook 程序被強制結束（不是 Ctrl+C）後留在系統暫存資料夾的副本，裡面有連到工作樹 `node_modules` 的 junction；之後用會順著 junction 刪的工具（例如 PowerShell 5.1 的 `Remove-Item -Recurse`）清暫存資料夾，可能刪到工作樹的相依（`npm ci` 裝得回來）。
- 需要實機的：沒有（不改 `src/`）。

## 實作者自己選的做法

規格沒寫、由 Claude 決定的地方（任務說明〈結果〉也列了）。請先看這些：

1. `roadmap-board --check --staged` 也放進 hook 的共用檢查（§3 的清單沒有它）：§8 要外掛的 roadmap 寫壞時 commit 就擋，commit 跑的是 hook 的共用檢查。
2. `roadmap-board --check` 也跑私人資訊檢查（`findPrivate`）：Pages 產生時會因為它失敗。
3. 兩個 hook 開頭先用 `cmp` 比對自己和這個工作樹的 `.githooks/` 那一份，不一樣就 `exec` 工作樹那一份（〈平台事實〉新增的一列：開 worktree 的工具會把共用的 `core.hooksPath` 改成另一個 checkout 的絕對路徑，新舊分支的 hook 會混用）。判斷寫在 sh 裡，因為這時還不知道該用哪一份 `tools/hooks.ts`；工作樹那一份是舊版（例如還沒有這一步的分支）時，跑的就是舊版。
4. `knip.jsonc` 把 `tools/hooks.ts` 列成入口；`ci-gate.ts` 只被測試 import，它的 export 不受 knip 檢查（〈平台事實〉）。
5. `check-skill-mirror --staged` 獨立一個 commit，放在 §3 之前。
6. capture、mindboard 的 job 不設 `setup-node` 的快取；鎖檔沒有相依時跳過 `npm ci`（第一輪 R5 之後改成直接 `npm ci`）。
7. §10 量完改成預設（`tools/hooks.ts` 的 `stagedCopy`）：外掛的檢查（完整與相關測試）在系統暫存資料夾裡只有暫存內容的副本跑。做法上自己決定的：
   - 在 hook 原本的環境跑 `git checkout-index`，`git commit <路徑>`、`-a` 取到的是暫時的索引；`core.autocrlf=false`，副本一律 LF（和 CI 一樣；Windows 的工作檔是 CRLF）。
   - 副本放一個 `.git` 檔指向這個工作樹的 git 資料夾（`--absolute-git-dir`），要讀 tag 與歷史的測試才跑得了。代價：子程序已經清掉 `GIT_INDEX_FILE`，副本裡的 git 讀預設的索引，`git commit <路徑>`、`-a` 時可能和副本內容不同（原本讀工作樹也有同樣的落差）。也考慮過用 `git worktree add --no-checkout` 加 `read-tree` 做一個索引完全一致的副本，但要多管 `.git/worktrees/` 的登錄與中斷後的清理，沒採用。
   - `node_modules`（根目錄、`tools/`、外掛）用連結借工作樹的；清理先拆連結，拆不掉就不刪副本只警告；刪副本失敗也只警告，不讓通過的檢查變成失敗。
   - 跑外掛檢查期間註冊一個什麼都不做的 `SIGINT` 處理，Ctrl+C 時等子程序停下、走到 `finally` 拆連結。沒有處理 hook 程序被強制結束後留下的副本（會留在系統暫存資料夾，裡面有連結）。
   - 每個外掛都照表跳過時不取出副本。
8. §2 第 7 條加上最上層的 `tasks/`、`Claude Codex Discussion/`（`02afb0a`）：規格的表漏列，這兩個資料夾落到第 8 條，只改任務說明或討論稿的 commit 會跑三個外掛的完整檢查；原本的 hook 對它們只跑文件檢查。表在這一步的〈結果〉commit 補上並註明是施工時補的，規格基準仍是 `d655645` 上的那一份。補完後整個 repo 落到第 8 條的只剩 `.ignore`（`node tools/dispatch.ts --range 4b825dc642cb6eb9a060e54bf8d69288fbee4904 HEAD --explain`）；請一併看規則的界線還有沒有漏的。

## 回報與權限

- 只審查與回報，不改檔；可以在隔離的暫存 repo 或 clone 重現。不要 push、不要開 PR、不要動 `main` 的設定（分支保護、必過檢查）；需要在 GitHub 上實際跑的，寫成探針步驟交給 Claude。
- 每項發現寫：哪一軸（規格／規範與設計）、觸發條件、預期／實際、影響、位置、證據（已重現／靜態推斷／待驗證）、**真實路徑會不會發生**與發生機率、建議處理。可以回報「規格本身有漏洞」。
- 報告寫在 `Claude Codex Discussion/2026-11-18-one-repo-step-1-review.md`，標題下第一行寫狀態；頭尾寫待審 commit、審查範圍、測試結果與沒驗的項目及原因。

## 第二輪

第一輪（Codex，`b8396a6`）回報 R1～R6，Claude 逐項核對都成立：R3 記成已知的限制，其餘修。報告與逐項的回應（修之前的四欄、判斷、修正的 commit）在 [`Claude Codex Discussion/2026-11-18-one-repo-step-1-review.md`](<../Claude Codex Discussion/2026-11-18-one-repo-step-1-review.md>)〈Claude 回應〉。這一輪只審修正：

### 審查對象

- 分支 `claude/one-repo-step-1`（已 push），本機 worktree `.claude/worktrees/one-repo-step-1`。沒有未提交的修改（`docs/syntax.md` 只有換行差異，同第一輪）。`main` 仍在 `d655645`，沒有前進。
- 只審 `b8396a60c093a8b051f73abc7b63749ff518235f..<最後的 commit>` 的差異與受影響的路徑，不必整包重審。新的 commit（由舊到新，一項發現一個）：
  - `6b0a3a637e0b6cb5c78f498a11dfbeea0ee84810` R1 `secretlint --staged` 掃暫存區的內容
  - `3c8a30731ccdada57e2909a2a1aa28f75e5d782c` R2 相關測試照這次比較的內容選
  - `a64ff61773dd45951a4bad114cb3cc0a0382b79f` R3 記成已知的限制（只改文件），連同第一輪報告
  - `3a236db5af1145b3f16bbe83d9bbec807540e3bd` R4 gate 查型別
  - `acf0afe77c39f892e032e7d07f202238183eba98` R5 capture、mindboard 直接 `npm ci`
  - `dfddc48153bf3aa23845ecde98ba7370df2c0247` R6 外掛本機相依的白名單
  - 最後一個是這一節所在的文件 commit（第一輪的回應、這一節、〈結果〉、roadmap）
- 看差異：`git diff b8396a60c093a8b051f73abc7b63749ff518235f <最後的 commit>`；逐個：`git log --reverse -p b8396a60c093a8b051f73abc7b63749ff518235f..<最後的 commit>`。最後的 commit 是這一節所在的 commit（`git log -1 --format=%H -- tasks/one-repo-step-1-review.md`）。

### 受影響的路徑

- R1：`tools/secretlint.mjs --staged` 的呼叫端：pre-commit 與 pre-merge-commit 的共用檢查（`tools/hooks.ts` 的 `SHARED_CHECKS`）。預設模式（`npm run secretlint`、CI）的列檔與讀檔不變，只多了 `engineOptions.cwd`。
- R2：`relatedTests` 的呼叫端 `dispatch()`：pre-commit 的分派（`--staged`）、`--range` 不加 `--ci`（`--explain` 與〈第一批的紀錄〉）。CI 與 pre-merge-commit 用 CI 的跑法，不呼叫它。
- R4：gate 的每種輸入與摘要；plan 的輸出格式沒改。
- R5：CI 的 capture、mindboard job。
- R6：`checkPackage`（共用檢查的 `check-plugin-imports`，預設與 `--staged` 都用）。
- R3：只改文件。

### 實作者自己選的做法（第二輪）

1. R1 用 `git checkout-index` 把這次 commit 的檔取到暫存資料夾，再走 secretlint 的讀檔模式；沒用 `executeOnContent`（stdin 模式）：讀檔模式用 `istextorbinary` 判斷二進位，只跑支援 binary 的規則，`executeOnContent` 一律當文字，兩種模式會不一致。取出時關掉 `core.autocrlf`（拿到 commit 的位元組）與 `core.symlinks`（symlink 寫成內容是目標的一般檔，不會指到副本外）；子模組沒有內容，略過；不照副本裡的 `.gitignore` 略過（`respectGitignore: false`，這次 commit 的檔都掃）；`--diff-filter` 加上 `T`（symlink 換成一般檔也是新內容）。暫存資料夾在 `finally` 刪。規則檔照舊讀工作樹的 `.secretlintrc.json`（`engineOptions.cwd` 設成 repo 根，原本靠從 CWD 往上找）：它不是被掃的內容，改它是共用的輸入，三個外掛都檢查。300 個檔多約 0.2 秒（舊 0.8 秒、新 1.0 秒）。
2. R2 只讀一般檔（mode `100644`、`100755`），symlink 的測試檔不算（原本讀工作樹會跟著連結）。`dispatch.ts` 的 `main` 把 `dispatch()` 也放進 `try`：相關測試讀 Git 失敗時和讀改動失敗一樣，結束碼 2。
3. R4 每個外掛的理由缺、空或不是字串時，那一列標 ✗，理由欄顯示「（沒有）」；`reasons` 整個缺或是空字串時，三個外掛各列一個問題。結果與旗標型別錯時，問題裡附上那個值。
4. R5 沒有在 GitHub 上做鎖檔不同步的紅燈探針：安裝那一步只剩 `npm ci` 一個指令，Actions 照它的結束碼判 step；本機用 npm 11.6.2 驗了四種鎖檔（〈驗證方式〉）。
5. R6 的「本機路徑」照 npm-package-arg 的分類擴大成整類：大小寫不分的 `file:`、`link:`、`git+file:`，以及沒有協定、以 `.`、`~/`、`/`、`\`、磁碟代號開頭、含反斜線、或 `#` 前有兩個以上 `/` 的寫法（只有一個 `/` 的 `a/b` 是 GitHub 的簡寫）。核對時發現 npm 11.6.2 在 Windows 把 `file:%2e%2e/…`、`FILE:../…` 解成外掛裡字面的資料夾名，沒有跑出去：第一輪報告與修正指示裡「decode 後跑出去」在這個版本不成立；白名單照樣不收（隨版本不同，名稱也不合理）。真的會跑出去的是 `file:~/…`、`~/…`、不加協定的 `../…`、`lib/../../../src` 與 `git+file:`。

### 驗證方式

- 回歸測試都先寫，修之前跑過是失敗的：
  - R1：`tests/quality.test.ts`「D-141 每次 commit 都跑文件檢查且讀暫存區…」新增的一段：暫存區有金鑰、工作檔已刪 → 擋；暫存區乾淨、工作檔有金鑰 → 放行；`git commit -a`、`git commit -- <路徑>` → 擋；別的檔 stage 了金鑰、`-- <路徑>` 不含它 → 放行；symlink 換成含金鑰的一般檔（T）→ 擋。修之前停在第一種（Missing expected rejection）。
  - R2：`tests/dispatch.test.ts`「§2 分派表：相關測試照這次比較的內容找（L2 R2）…」（修之前選到工作樹新加的測試、漏掉 `rules.ts` 與暫存區的測試）；`tests/hooks.test.ts`「§3 乾淨 clone 的 hook：子資料夾、…」新增的兩段：測試的修改沒 stage → 照暫存區選到、跑了；工作樹新加、沒 stage 的測試 → 不選、不擋。用 `b8396a6` 的 `dispatch.ts` 跑，停在第一段（記號只有 `capture`）。
  - R4：`tests/ci-gate.test.ts`「§4 gate：比較端點與理由缺、空或型別錯都不過（L2 R4）…」16 種輸入，每種都斷言紅燈、問題的文字與摘要印得出來。修之前停在第一種（沒有 `compare` 仍 `ok: true`）。
  - R5：workflow 沒有本機的自動測試。本機探針（Windows、npm 11.6.2，複製 `plugins/mindboard/` 的 `package.json` 與鎖檔）：同步、沒有相依 → `npm ci` 結束碼 0、不建 `node_modules`；`package.json` 加了相依、鎖檔沒更新 → 1（`EUSAGE`，`--offline` 時先報 `ENOTCACHED`）；鎖檔不是 JSON → 1（`EUSAGE`）；沒有鎖檔 → 1（`EUSAGE`）。GitHub 上的正向結果見下面的 run。
  - R6：`tests/plugin-imports.test.ts`「§6 外掛 package.json 的本機相依只接受外掛裡的相對路徑（L2 R6）…」25 個擋、17 個放行。修之前停在 `file:~/x`。放行的與 npm 11.6.2 的 `npm-package-arg` 解析對過：在外掛裡、不是本機路徑，或 npm 不支援（`link:` 回 `EUNSUPPORTEDPROTOCOL`，npm 自己就裝不起來）。
- 每個改到共用輸入的 commit，pre-commit 都在暫存內容的副本跑了三個外掛的完整檢查。
- GitHub：`dfddc48` 的 push run [44147697017](https://github.com/kuohappiness/Essence-Cards/actions/runs/44147697017)：plan 比較 `d655645..dfddc48`（push 到分支：和 `origin/main` 的合併基點到這次），三個外掛都是完整檢查；plan、shared、cards（247 秒）、capture、mindboard、gate 六個 job 都成功。capture、mindboard 的「Run npm ci」步驟成功（`up to date, audited 1 package`，沒有相依）。這一節所在的文件 commit 的 run：`gh run list --commit <最後的 commit> --workflow check.yml --event push`（Claude 確認全綠後才交給 Codex）。
- 沒驗的：R5 的 GitHub 紅燈探針（上面第 4 點）；hook 程序被強制結束後的暫存資料夾（第一輪就列的限制；R1 的 `essence-secretlint-*` 也一樣可能留下，裡面是暫存區的內容、沒有連結）。

### 回報

照第一輪〈回報與權限〉。延續第一輪的發現標「延續 Rx」，修正帶出的標「Rx 修正引入」。報告接在同一份報告的最後，加〈第二輪〉一節，標題下的狀態行一起改。

## 第三輪

第二輪（Codex，`5503513`）回報 R7（延續 R1：`checkout-index` 取出時套用 `.gitattributes` 的轉換），其餘修正核對通過，R3 維持已知的限制。Claude 重現後寫了四欄，修法要再送 L2，交給使用者選，使用者選「修，送第三輪」。報告、四欄與判斷在 [`Claude Codex Discussion/2026-11-18-one-repo-step-1-review.md`](<../Claude Codex Discussion/2026-11-18-one-repo-step-1-review.md>)〈第二輪〉與〈Claude 回應（第二輪）〉。這一輪只審 R7 的修正：

### 審查對象

- 分支 `claude/one-repo-step-1`（已 push），本機 worktree `.claude/worktrees/one-repo-step-1`。沒有未提交的修改（`docs/syntax.md` 只有換行差異，同前兩輪）。`main` 仍在 `d655645`。
- 只審 `550351313d94c78a08b6e783c2e366bad95ba9cb..<最後的 commit>`：
  - `a97aa2f28a0dcd89a24eb3cdb0e789bf45f43017` R7 `secretlint --staged` 照原樣寫出索引的 blob
  - 最後一個是這一節所在的文件 commit（第二輪的報告與回應、這一節、〈結果〉、backlog、roadmap）
- 看差異：`git diff 550351313d94c78a08b6e783c2e366bad95ba9cb <最後的 commit>`。最後的 commit 是這一節所在的 commit（`git log -1 --format=%H -- tasks/one-repo-step-1-review.md`）。

### 受影響的路徑

- `tools/secretlint.mjs --staged` 的呼叫端：pre-commit 與 pre-merge-commit 的共用檢查（`tools/hooks.ts` 的 `SHARED_CHECKS`）。預設模式（`npm run secretlint`、`npm run check`、CI）的列檔與讀檔不變。

### 實作者自己選的做法（第三輪）

1. 列整個索引（`git ls-files -s -z`）再挑這次 commit 的檔，不把路徑當成 pathspec 交給 Git：`*`、`:` 開頭的檔名不會被解讀，檔很多時也不會超過命令列的長度。只取 stage 0；子模組略過；symlink 寫成內容是目標的一般檔（和第一輪一樣）。
2. `cat-file --batch` 的輸出上限 256MB（和 R2 的 `tools/dispatch.ts` 一樣）：一次 commit 的內容超過時讀不到，照「取不出暫存區的內容，沒有掃金鑰」擋下。
3. 寫出前確認路徑在暫存資料夾裡（索引裡的路徑 Git 已經擋過 `..`，這裡多確認一次）；物件不是 blob 時也擋。
4. 沒處理：同一個索引裡只差大小寫的兩個路徑，在不分大小寫的檔案系統會寫到同一個檔，只掃到後寫的那份（`checkout-index` 也一樣）。Windows 的 `git add` 加不進來，這個 repo 也沒有。（第三輪 R8：這段不對。`checkout-index` 遇到第二份會失敗、整個 commit 擋下；合併也帶得進來。已修，見[〈第四輪〉](#第四輪)。）
5. 同一類、這次不改的兩處（預設模式、外掛檢查用的副本），理由在〈Claude 回應（第二輪）〉；預設模式記進 backlog〈已知的限制〉。

### 驗證方式

- 回歸先寫，修之前跑過是失敗的：`tests/quality.test.ts`「D-141 每次 commit 都跑文件檢查且讀暫存區…」新增的一段，Git 取出檔案時會套用的四種屬性（`working-tree-encoding=UTF-16LE`、`filter`、`text eol=crlf`、`ident`）× 已 stage／只在工作樹，八種都要擋下，filter 的 smudge 指令（`touch smudge-ran; sed …`）沒被執行。修之前停在第一種（`Missing expected rejection: working-tree-encoding=UTF-16LE（只在工作樹）`）。同一個測試裡第一輪的案例（兩個方向、`-a`、`-- <路徑>`、別的檔已 stage、型別變更）照樣通過。
- 本機探針（Windows、Git 2.52）：`git -c core.autocrlf=false checkout-index` 遇到只在工作樹的 `working-tree-encoding=UTF-16LE` 取出 UTF-16LE、smudge 指令改掉內容、`text eol=crlf` 加上 `\r`；`git cat-file blob :a.md` 是原本的內容。
- 301 個檔的 `--staged`：R1 版約 1.07 秒、R7 版約 1.17 秒（各 5 次）。
- pre-commit 在暫存內容的副本跑了三個外掛的完整檢查並通過（`a97aa2f`）。
- GitHub：`a97aa2f` 的 push run [44200346263](https://github.com/kuohappiness/Essence-Cards/actions/runs/44200346263)：plan 比較 `d655645..a97aa2f`，三個外掛都是完整檢查；plan、shared、cards（305 秒）、capture、mindboard、gate 六個 job 都成功。這一節所在的文件 commit 的 run：`gh run list --commit <最後的 commit> --workflow check.yml --event push`（Claude 確認全綠後才交給 Codex）。
- 沒驗的：只差大小寫的路徑（上面第 4 點）；hook 程序被強制結束後的暫存資料夾（前兩輪就列的限制）。

### 回報（第三輪）

照第一輪〈回報與權限〉。報告接在同一份報告的最後，加〈第三輪〉一節，標題下的狀態行一起改。這是第三輪；照 code-quality，第四輪之後還有擋合併的發現就停下來交給使用者。

## 第四輪

第三輪（Codex，`c3aa6eb`）確認 R7 已修，新報 R8（R7 修正引入：只差大小寫的兩個路徑在不分大小寫的檔案系統寫成同一個檔，先寫的那份被蓋掉、沒掃到；上一版的 `checkout-index` 在這裡會失敗而擋下）。Claude 重現後寫了四欄，修法要再送 L2，交給使用者選，使用者選「修，送第四輪」。報告、四欄與判斷在 [`Claude Codex Discussion/2026-11-18-one-repo-step-1-review.md`](<../Claude Codex Discussion/2026-11-18-one-repo-step-1-review.md>)〈第三輪〉與〈Claude 回應（第三輪）〉。這一輪只審 R8 的修正：

### 審查對象

- 分支 `claude/one-repo-step-1`（已 push），本機 worktree `.claude/worktrees/one-repo-step-1`。沒有未提交的修改（`docs/syntax.md` 只有換行差異，同前幾輪）。`main` 仍在 `d655645`。
- 只審 `c3aa6ebea30bb4f2cffa36d452f1be75cb7a1a9e..<最後的 commit>`：
  - `893f43b72330ffc0a1fa46c7fcd33da3e7d6a1ac` R8 只差大小寫的兩個路徑寫成同一個檔時擋下（只建立新檔）
  - 最後一個是這一節所在的文件 commit（第三輪的報告與回應、這一節、〈結果〉、roadmap）
- 看差異：`git diff c3aa6ebea30bb4f2cffa36d452f1be75cb7a1a9e <最後的 commit>`。最後的 commit 是這一節所在的 commit（`git log -1 --format=%H -- tasks/one-repo-step-1-review.md`）。

### 受影響的路徑

- `tools/secretlint.mjs --staged` 的呼叫端：pre-commit 與 pre-merge-commit 的共用檢查（`tools/hooks.ts` 的 `SHARED_CHECKS`）。預設模式不變。

### 實作者自己選的做法（第四輪）

1. 照第三輪報告的建議：寫檔改成只建立新檔（`writeFileSync` 的 `flag: 'wx'`）。暫存資料夾是新建的空資料夾，回 `EEXIST` 只會是這次 commit 的兩個路徑在這台是同一個檔；擋下，訊息寫出兩個路徑（照大小寫不分比對找得到另一個時）。其他寫檔錯誤照舊擋下並印出原因。區分大小寫的檔案系統照常兩份都寫、都掃。
2. 只用收窄，不加機制：這是同一類（掃到的不是這次 commit 的內容）的第 3 代（R1 → R7 → R8），照 code-quality 回到收窄。
3. 不只大小寫：任何讓兩個路徑落到同一個檔的情況（例如 macOS 的 Unicode 正規化）都由 `wx` 擋下，訊息找不到另一個路徑時只寫這一個。資料夾與檔案撞名（`A/b` 和 `a`）時，寫檔或建資料夾會失敗，照「取不出暫存區的內容」擋下。

### 驗證方式

- 回歸先寫，修之前跑過是失敗的：`tests/quality.test.ts`「D-141 每次 commit 都跑文件檢查且讀暫存區…」新增的一段，列舉整類：檔名只差大小寫（`docs/Case.md`、`docs/case.md`）與資料夾只差大小寫（`Docs/case.md`、`docs/case.md`），物件直接寫進索引，金鑰放在先寫出的那份。Linux 要被金鑰規則擋下（兩份都掃），Windows 與 macOS 要以「同一個檔」擋下。修之前在 Windows 停在第一種（`Missing expected rejection: docs/Case.md`，commit 成功）。同一個測試裡 R1、R7 的案例照樣通過。
- 本機探針（Windows、Git 2.52）：`git update-index --cacheinfo` 做得出只差大小寫的兩個索引項目；上一版的 `checkout-index` 對第二份報 `already exists, no checkout`、結束碼 1；新版印「取不出暫存區的內容，沒有掃金鑰：docs/review-case.md 和 docs/Review-Case.md 在這台的檔案系統是同一個檔（例如只差大小寫），兩份不能分開掃」、結束碼 1。Node 的 `wx` 第二次寫入回 `EEXIST`，第一份內容保留。
- pre-commit 在暫存內容的副本跑了三個外掛的完整檢查並通過（`893f43b`）。
- GitHub：`893f43b` 的 push run [44207031006](https://github.com/kuohappiness/Essence-Cards/actions/runs/44207031006)：六個 job 都成功；cards job（Linux，區分大小寫）裡 D-141 測試通過，即撞名的兩種情況在 Linux 兩份都掃、被金鑰規則擋下。這一節所在的文件 commit 的 run：`gh run list --commit <最後的 commit> --workflow check.yml --event push`（Claude 確認全綠後才交給 Codex）。
- 沒驗的：用 `git merge` 帶進撞名路徑的 pre-merge-commit（第三輪報告已用原版 hook 重現；新版走同一段 `extract()`，回歸用索引直接寫入）；macOS 的 Unicode 正規化（沒有機器）；hook 程序被強制結束後的暫存資料夾（前幾輪就列的限制）。

### 回報（第四輪）

照第一輪〈回報與權限〉。報告接在同一份報告的最後，加〈第四輪〉一節，標題下的狀態行一起改。這是第四輪：照 code-quality，這一輪之後還有擋合併的發現，Claude 停下來交給使用者決定，不再自動送下一輪。
