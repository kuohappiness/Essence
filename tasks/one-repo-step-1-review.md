# 三個外掛同一個 repo 第一步：L2 獨立審查（給 Codex）

狀態：待審

遵守 repo 根目錄的 `AGENTS.md`。建議推理等級：**高**。請**新開一個 session**。

[任務說明](one-repo-step-1.md)由 Claude（Opus 5.5）實作。這一步改了 pre-commit、pre-merge-commit 與 CI，也就是合併前的防線，屬於高風險範圍（[D-208](../docs/decisions.md#d-208-三個外掛在同一個-repo-開發每個外掛有自己的資料夾) 第 5 點、[docs/agents/quality.md](../docs/agents/quality.md)〈高風險範圍〉），合併前做 L2。

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
6. capture、mindboard 的 job 不設 `setup-node` 的快取；鎖檔沒有相依時跳過 `npm ci`。
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
