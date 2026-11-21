# 程式品質：本專案的設定

給 `code-quality` skill 讀（[D-119](../decisions.md#d-119-程式品質的-skill-整併成通用的-code-quality)）。這裡只寫對應與連結，規則本身在連到的地方。

## 角色

| 角色 | 由誰擔任 |
|---|---|
| 規劃者 | Claude 的 Opus 5.5，推理等級 xhigh：任務說明、大的設計、L1 設計回顧（[D-144](../decisions.md#d-144-決策交給-opus-xhighfable-只在解不了的時候)）。重大決策點先寫討論稿和 Codex 討論；解不了才切 Fable 5.1 high。任務說明與決定先和「不做」比較（[D-153](../decisions.md#d-153-每個新決定與新任務先和不做比較)），討論稿請 Codex 專門站在「不做」那一方反駁，理由只能是優勢不明顯或代價解決不了（[D-177](../decisions.md#d-177-先問會不會明顯更好優勢明顯代價解決得了就該做)） |
| 實作者 | Claude 的 Opus 5.5，推理等級 high（[D-131](../decisions.md#d-131-claude-實作codex-在關鍵點查核)、D-140）；例外轉出時是 Codex，任務說明照 `apps/Cards/docs/tasks/w3.md` 寫，交回照 code-quality 的「實作交回」檢查（[D-168](../decisions.md#d-168-拿掉-codex-brief請-codex-查核走-code-quality)） |
| 獨立審查者（L2） | Codex（Sol），由 Claude 在本機用 `node tools/codex.ts` 呼叫，每次都是新 session（[D-212](../decisions.md#d-212-claude-直接呼叫本機-codex任務開始時分本機或雲端)），不能是寫程式的那一個。Codex 不能用時，由 Claude 開子代理（L3），做不到的部分明列 |
| 整合者 | Claude 的 Opus 5.5：L1 對照、核對 L2 的發現、合併 |

成本：檢查不減；能交給自動檢查的就不靠人看。Claude 實作時的 L1 是自己對照規格，不算獨立審查，所以驗收條件要先寫成能用程式判斷的句子。困難的除錯照〈[卡關時的升級](#卡關時的升級)〉。

推理等級：Claude 在任務開頭用一句話建議，使用者在模型選單切換（session 不能替自己改）。照規格的機械工作、改字、commit 用 medium；一般的設計討論與文件用 high；容易漏掉矛盾的工作（大範圍的一致性檢查、牽涉很多文件的改動、把結論寫成多條決定、困難的除錯）用 xhigh，做完提醒切回。測試或推薦模型時最高只到 xhigh，不用 max，結果寫成「xhigh 下的最好表現」。Claude 自己開的子代理或呼叫的 Codex 要用 xhigh、Fable 或 Astra 這類會用掉大量額度的，都先問使用者（2026-11-19）。

換模型時（[D-197](../decisions.md#d-197-同一條發現鏈到第-3-代先重整換模型時重驗依舊行為寫的規則) 第 3 點）：上表寫的是目前的版本。常用角色的模型換版、改用別的模型或推理配置時，先改上表，再挑出依舊模型或工具行為寫的規則（上表的分工與它的理由、標「試行」的規則、Obsidian 截圖的工具限制等），有小探針或代表任務能核對的才重驗，結果記在各自的試行紀錄或依據；使用者只決定有證據的修改。臨時升級求援、單次試用不算。Claude 讀到本檔時，自己的模型和上表不同，先提醒使用者。

## 本機或雲端

[D-212](../decisions.md#d-212-claude-直接呼叫本機-codex任務開始時分本機或雲端) 第 4 點。任務開始時判斷，整件在同一邊做：

- **本機**（電腦要開著）：要 Codex 查核的（L2、開工前的格式查核、討論稿、bug 從頭查、里程碑檢查）；碰 Obsidian、測試或正式 vault、備份工具、iPhone 測試準備的；只有 Windows 才有的問題。
- **雲端**（電腦可以關）：其餘的，例如不屬高風險範圍的程式、文件與規劃、不碰 Obsidian 的試作場與研究。在本機 session 遇到這類任務，開工前提醒使用者可以改到雲端做。
- 雲端做到一半發現要本機：推分支，在任務說明寫下進度與下一步，提醒使用者回本機接手。
- 雲端 session 照它自己的規則只推自己的 `claude/` 分支，不直接推 `main`（只改文件也一樣）；做完開 PR 合併。
- 雲端 session 的環境由 `.claude/hooks/cloud-setup.mjs` 準備：設 `core.hooksPath`、淺層 clone 沒有的 git tag 補抓（跨版本測試要用）、PATH 上的 Node 低於 24 時改用映像裡 `/opt/node24`、在 CI 用到的資料夾（`tools`、`apps/Cards`、`apps/Capture`、`apps/Mindboard`）`npm ci`（沒有相依的跳過），每個資料夾印一行結果。雲端讀不到本機的記憶，會影響做法的規則要寫進 repo。
- 改 `.claude/hooks/cloud-setup.mjs` 或 `.claude/settings.json` 的 `SessionStart` 的任務，合併前在那個分支開一個雲端 session，由那個 session 的 Claude 做兩件事，兩段原文附在回覆裡、寫進任務的〈結果〉：① 讀自己的開場訊息，確認 hook 有跑、之後的指令用 Node 24、`core.hooksPath` 是 `.githooks`；② 新的 session 可能從前一個 session 的快照開機、`node_modules` 已在（只會印「鎖檔沒變，跳過」，2026-11-22 [D-218 改名](../tasks/rename-plugins-to-apps.md#結果)驗收第 10 項遇到），所以另開一個沒有 `node_modules` 的 worktree，PATH 拿掉 `/opt/node24/bin`、設 `CLAUDE_CODE_REMOTE=true` 與 `CLAUDE_PROJECT_DIR=<worktree>` 跑一次 hook，確認有相依的 `tools`、`apps/Cards` 是「`npm ci` 完成」、沒有相依的外掛是「沒有相依，跳過」。分派表只跑得到它們的測試，這幾件只在雲端看得到（[D-208](../decisions.md#d-208-三個外掛在同一個-repo-開發每個外掛有自己的資料夾) 第二步 §A3）。
- 雲端 session 不會回報給本機，本機 session 的工具也讀不到它的對話：要本機接著做時，請使用者給它的 `claude.ai/code/…` 網址，用內建瀏覽器讀（窗格要登入 claude.ai）。

## 檢查指令

- 安裝：每個資料夾有自己的 `package.json`，根目錄沒有。每個 clone 與 worktree 先在 `tools/` 跑 `npm ci`（共用檢查與 hook 的相依；`prepare` 順便設 `core.hooksPath`）；要跑 Cards 的檢查、建置或安裝時再在 `apps/Cards/` `npm ci`；Capture、Mindboard 有相依之後在各自的資料夾 `npm ci`（[D-208](../decisions.md#d-208-三個外掛在同一個-repo-開發每個外掛有自己的資料夾) 第一步、第二步）。
- Cards 的 `npm run check`（在 `apps/Cards/` 跑，或從根目錄 `npm --prefix apps/Cards run check`）：型別、ESLint（含模組邊界）、knip，最後測試（[D-117](../decisions.md#d-117-技術債預防機械檢查全自動ai-審查只在關鍵點)）。共用檢查不在裡面，另外跑。
- `tools/` 的 `npm run check` 是共用檢查：文件檢查、金鑰（secretlint）、本機路徑、skill 副本一致性、軟體之間不 import 與 `apps/` 的資料夾、寫死的路徑對得上 `tools/apps.ts` 的表（`tools/check-app-imports.ts`，[D-218](../decisions.md#d-218-plugins-改名-apps每個軟體的資料夾首字大寫)；紀錄與例外表除外，例外逐檔列在檢查裡）、狀態板與〈已完成〉和入口的狀態行一致（`roadmap-sync --check`，[D-217](../decisions.md#d-217-狀態只寫在入口狀態板與已完成由工具產生)）、進度白板讀得出每一份 roadmap（`roadmap-board --check`）。`tools/` 的 `npm run self-check` 是共用工具本身的完整檢查：型別、ESLint、knip（`tools/knip.jsonc`）與 `tools/tests/` 的測試（含 hook、分派表、CI 的 gate）；hook 照分派表決定什麼時候跑它。Capture、Mindboard 的 `npm run check` 在各自的資料夾，現在只印一行，寫程式的第一個任務換成型別、lint 與測試。
- 文件檢查：`node tools/check-docs.ts`，每次 commit 都跑，只改文件的 commit 也跑（[D-141](../decisions.md#d-141-文件架構入口只放狀態同一類資訊只維護一份)、[D-143](../decisions.md#d-143-歸檔原則每類文件都有終點不設字數上限)）；`apps/<軟體>/` 底下的狀態目錄、roadmap 與任務照同樣的規則查。它只認 git 追蹤的檔：連到還沒 `git add` 的新檔會報找不到，`npm run check` 停在這一步；pre-commit 又在暫存區與工作樹各查一次，所以新文件和連到它的舊文件要一起 stage，要分開 commit 時先 commit 文件。
- 測試的時間上限：`npm test` 每個測試最多 10 分鐘（`--test-timeout`）；自己另外跑 `node --test` 時也加上限。用 Node 的 mock timers 時，呼叫被測的非同步函式後先 `await tick(t, 0)` 再推時間，不然假時鐘不再前進，`await` 永遠等不到（2026-11-04 一個測試因此無聲掛了近三小時）。背景指令超過預期又沒有輸出，先查進程與輸出，不要說成跑得比較久。
- pre-commit（`.githooks/pre-commit` 只確認 `tools/` 裝過，邏輯在 `tools/hooks.ts`）：先在 Git 給的環境讀暫存區（`git commit <路徑>`、`-a` 用的是另一份索引），每次都跑共用檢查的暫存區版本：文件、暫存檔的金鑰（repo 公開，只改文件的 commit 也直接推上 main，[第二次里程碑檢查](<../../apps/Cards/docs/Claude Codex Discussion/2026-11-10-milestone-2-review.md>) R4）、本機路徑（R5：帳號名、iCloud 雲碟、vault 名稱；通用規則不含真實的值，本機規則在執行時從這台電腦取；commit 訊息由 `.githooks/commit-msg` 掃）、兩份 skill、軟體之間不 import 與 `apps/` 的資料夾、狀態板和入口一致、roadmap 讀得出來。接著照**分派表**（`tools/dispatch.ts`，規則見 [architecture.md〈repo 結構〉](../architecture.md#9-repo-結構-d-208)，這裡不抄第二份）決定共用工具與每個外掛跑完整檢查、只跑相關測試或照表跳過，最後印一行每個對象跑了什麼、跳過的理由。要看某次改動怎麼分派：`node tools/dispatch.ts --staged --explain`（或 `--range <base> <head>`）。
  - 測試用 dot reporter（`NODE_OPTIONS` 加 `--test-reporter=dot`）：通過的測試只印一個點，失敗的照常印出，exit code 照常傳回；AI 讀 commit 的輸出要花 token，原本約 4.2 萬字（[外掛架構檢查](<../../apps/Cards/docs/Claude Codex Discussion/2026-10-26-plugin-architecture.md>)環節 9 的 Q2）。代價是通過的測試印的訊息看不到，需要時自己跑 `npm run check`；手動跑與 CI 不變。
  - Cards 的「相關測試」：只改 Cards 的文件時，跑寫到那個路徑的測試檔，通過時只印一行（2026-10-29：`b63c1bb` 只改 `syntax.md` 的範例就讓 CI 紅了）。新的測試要讀文件時，在測試裡寫出它的路徑（例如 `apps/Cards/tests/` 裡的 `new URL('../../../docs/syntax.md', import.meta.url)`），分派表才找得到；兩個以上外掛都讀的最上層檔案，登錄在分派表的 `SHARED_SPECS`。
  - 外掛的檢查（完整與相關測試）在只有暫存內容的副本跑：`git checkout-index` 取出到系統的暫存資料夾（LF，和 CI 一樣），`.git` 檔指向這個工作樹的 git 資料夾，`node_modules` 用連結借工作樹的，跑完先拆連結再刪副本。工作樹裡沒 stage 的改動不影響結果，檢查跑的時候可以繼續改檔。`git commit <路徑>`、`-a` 時，測試裡的 git 讀的是預設的索引，可能和副本不同（[one-repo-step-1 §10](../tasks/one-repo-step-1.md#10-技術債)）。
- CI（`.github/workflows/check.yml`）：plan job 照事件決定比較的端點（PR 是分岔點到 PR 的 head；push 到 `main` 是上一次到這次；push 到其他分支是和 `origin/main` 的合併基點到這次，算整個分支；tag 與找不到基點時跑全部），用分派表的 CI 跑法（Cards 的相關測試升成完整檢查）決定外掛的 job；shared job 每次都跑共用檢查，只裝 `tools/`；tools job 照分派表跑 `tools/` 的 `npm run self-check`；cards job 在 `apps/Cards/` 跑檢查、建置與 `npm audit`，不裝 `tools/`；capture、mindboard 的 job 在自己的資料夾跑。最後的 gate job（`tools/ci-gate.ts`）確認每個 job 都照 plan：要跑的成功、不跑的跳過；要跑的被跳過或取消、不該跑的跑了都紅燈，摘要表寫每個外掛跑不跑、理由與結果。`main` 現在沒有分支保護、也沒有必過檢查（2026-11-17 查過）；之後要設時只設 gate，不設會被照表跳過的外掛 job。
- 合併進 `main`：`.githooks/pre-merge-commit`（邏輯也在 `tools/hooks.ts`）先讀合併的索引跑一次共用檢查（合併不經過 pre-commit，合併到哪個分支都跑）；合併進 `main` 時，用分派表的 CI 跑法比合併基點到要合併的 commit，有外掛要跑（只改文件也算，因為 CI 會跑 Cards 的完整檢查）就要那個 commit 的 **push** run 是綠燈（`gh run list --commit <head> --workflow check.yml --event push`；PR 或探針的 run 比的是別的範圍），沒有紀錄、紅燈、取消、還沒跑完都擋，`gh` 不能用時警告放行。快轉與有衝突的合併不經過它，要自己記得：先 push 分支、等 Check 是綠燈再合併（[第二次里程碑檢查](<../../apps/Cards/docs/Claude Codex Discussion/2026-11-10-milestone-2-review.md>) R2：還原分支沒 push 過就合併，25 個測試在 Linux 失敗）。
- worktree 的 hook：`core.hooksPath` 是相對的 `.githooks`，每個 worktree 讀自己的；開 worktree 的工具把它改成另一個 checkout 的絕對路徑時，hook 會轉給這個 worktree 自己的 `.githooks`（[one-repo-step-1〈平台事實〉](../tasks/one-repo-step-1.md#平台事實)）。在 `tools/` 跑 `npm ci` 會改回相對的。轉交寫在 D-208 第一步之後的 hook 裡：指到的 checkout 還沒有第一步時，跑的是那裡的舊 hook，不會轉交（[backlog〈已知的限制〉](../backlog.md#已知的限制)）；所以合併後先更新主資料夾。
- CI 的結果：每個 Claude session 開始時，`.claude/hooks/ci-status.mjs` 會查 `main` 最近一次跑完的 GitHub Actions，沒通過就提醒；看到提醒先用 `gh run view <id> --log-failed` 找原因，能修就修，不能修就告訴使用者。本機是 Windows、CI 是 Linux，只在一邊壞的問題 pre-commit 擋不到（2026-10 曾紅了三天沒人發現，[第一個里程碑的檢查](<../../apps/Cards/docs/Claude Codex Discussion/2026-10-27-milestone-1-review.md>) R1）。
- knip 報 `RangeError: Array buffer allocation failed` 是電腦可用的記憶體不夠（它的解析器一次預留 6 GB），不是程式的問題：Cards 與 `tools/` 的 `npm run knip`（`apps/Cards/tools/knip.mjs`、`tools/run-knip.mjs`）已經自動加上 `KNIP_DISABLE_RAW_TRANSFER=1`，檢查項目不變；直接跑 `npx knip` 時要自己加（2026-10-27 W6 合併時遇到）。
- Codex 審查時：完整的 `npm run check` 要在沙箱外跑，由 Claude 送審前自己跑、把結果寫進請求。Codex 的沙箱裡會有 10～11 項環境造成的固定失敗（symlink、改名的 EPERM、git config；W5 第二部分三輪都是這樣），所以 Codex 只跑和發現有關的測試，回報裡逐項列出失敗的測試，並說明哪些是環境造成的。跑的時候一次等到結束或出錯（設足夠且有上限的等待），不要短間隔反覆查進度：2026-11-04 那次 L2，這種輪詢約佔 Codex 輸入的 43%（[D-171](../decisions.md#d-171-省-token-靠縮短上下文不靠少審或換模型) 第 7 點，試行）。審查請求的「驗證方式」連到這一點。
- 建置、安裝與 Cards 的工具（`install-vault`、`update-vault`、`backup`、`restore`、`locate` 等）都在 `apps/Cards/` 跑，或從根目錄加 `npm --prefix apps/Cards run …`；產物（`main.js`、`styles.css`）也在 `apps/Cards/`。
- 建置：`npm run build`，`main.js` 只能 require Obsidian 提供的 `obsidian`、`@codemirror/state`、`@codemirror/view`（[D-134](../decisions.md#d-134-學習目標-id-的補上時機與保護) 的編輯器鎖定），不能把另一份 CodeMirror 打包進去（`apps/Cards/tools/build.mjs` 會擋）。
- 安裝：`npm run install-vault -- <vault> [--dev]`（[D-149](../decisions.md#d-149-更新與相容版本紀錄讀取閘門與正式安裝) 第 4 點，擋法在 `apps/Cards/tools/install.ts`）。開發版只裝登錄過的測試 vault：登錄存在主資料夾的 `.local/test-vaults.json`（各 worktree 共用、不進 repo），第一次先 `npm run install-vault -- <測試 vault> --register-test`。裝到測試 vault（含 `--dev`）是在 Cards 的資料夾建置、再從那裡複製（`apps/Cards/tools/install.ts` 的 `install` 裡測試 vault 那一段：`build({ root, … })` 之後 `deploy(root, …)`），中間有別的程序寫了 `main.js` 就會裝到那一份；裝完用開發命令結果檔的 `BUILD` 核對是不是這次的建置（[外掛架構檢查](<../../apps/Cards/docs/Claude Codex Discussion/2026-10-26-plugin-architecture.md>)環節 9 的 N2：照實記下，不改）。其他 vault 一律當正式使用的：要工作樹乾淨、HEAD 是 `v<版號>` 的 tag、`package.json` 版號相同、DEV 關閉，產物與雜湊存到 `.local/releases/<版號>/`；退回用 `--release <版號>`，現有資料的 `需要版本`、`need` 比那一版新就拒絕。

## 規格來源

- 任務說明：軟體的程式在 `apps/<軟體>/docs/tasks/*.md`，跨軟體的在 `docs/tasks/*.md`，試作場在各資料夾的 `TASK.md`。
- 決定：[decisions.md](../decisions.md) 的 D-ID；commit 訊息裡的 `(D-xxx)` 指的就是這裡。
- 資料格式：[syntax.md](../../apps/Cards/docs/syntax.md)。程式結構與模組邊界：[D-110](../decisions.md#d-110-v1-外掛的程式結構) 與 `apps/Cards/eslint.config.js`。

## 高風險範圍（要做 L2）

跨模組的改動、資料格式、排程（FSRS 與紀錄重播）、寫回使用者筆記的函式。

請 Codex 查核時（不只 L2），寫明查什麼、讀哪些檔案、基準 commit 與驗收標準；L2 照 code-quality 的 `review.md`「審查請求範本」寫。

呼叫 Codex（[D-212](../decisions.md#d-212-claude-直接呼叫本機-codex任務開始時分本機或雲端)）：在本機 session 把請求寫進討論稿或審查報告，用背景執行 `node tools/codex.ts <類型> <請求檔> [--note <這一輪讀哪一節>]`（在 repo 根目錄；請求檔的相對路徑照執行的資料夾算，所以不設 npm script），等完成的通知，不輪詢。類型與預設的模型、推理等級、沙箱在 `tools/codex.ts` 的 `PRESETS`。推理等級 xhigh 或 Astra 會用掉大量額度（預設的 `bug`、`escalate`，或用 `--effort`、`--model` 指定的都算）：先問使用者，同意了才加 `--confirmed`；沒加腳本不跑，印出要問的內容與上一輪記錄的週額度（使用者 2026-11-19）。回報存在 `.local/codex/`，原文附進同一份檔案的這一輪再核對；執行紀錄（`.log`）只在沒有回報時才讀。每次呼叫後，回覆末端附腳本印的 token 與額度那一行。xhigh 這類會跑很久的，先讓電腦保持喚醒。每一輪（第一輪、再審、討論稿的下一輪）都是新的 Codex session：沿用同一個對話時，上下文越來越長，每次呼叫都要重讀；2026-11-03 量到「入口與目錄第一批」沿用一個對話做 L2 七輪加討論三輪，那段時間 Codex 週額度上升 21 個百分點（表內各段合計 15，含同時段的其他對話；[D-171](../decisions.md#d-171-省-token-靠縮短上下文不靠少審或換模型) 第 1 點）。腳本找不到 Codex、登入過期或額度用完時，這一輪照舊請使用者手貼：交給使用者貼的文字第一行寫「新開一個 Codex 對話，推理等級：<等級>」。

再審與討論稿的下一輪，那一節的開頭寫「這一輪只讀：本節、〈審查對象〉、上一輪的〈Claude 回應〉」（討論稿寫〈先讀這裡〉與這一輪的那一節），另外列出還沒結的發現 ID，以及這一輪可能碰到的已結發現與它們的驗收證據在哪一節；前幾輪預設不讀，需要時審查者照標題或發現 ID 只查相關的段落。新開的對話不記得前幾輪，沒寫就容易整份從頭讀（[D-171](../decisions.md#d-171-省-token-靠縮短上下文不靠少審或換模型) 第 2 點）。

同一條發現鏈（[D-200](../decisions.md#d-200-l2-的發現鏈待驗問題連兩輪沒驗先讀宿主程式整類修過仍失守就換前提)，改寫 D-197 第 1 點）：照 code-quality 的 `review.md`〈修正後收尾〉，整類修過仍同類失守就換前提；修法依賴的宿主行為連兩輪沒驗，先讀宿主程式或做探針。本專案的宿主是 Obsidian：讀法照〈[Obsidian 相容性檢查](#obsidian-相容性檢查)〉第一層的 `obsidian-<版本>.asar`（只讀不執行），探針用 Windows 版 Obsidian 的開發命令；驗不了照〈[卡關時的升級](#卡關時的升級)〉。代數的標法照 `review.md`〈審查請求範本〉；第四輪交給使用者、工作留在原對話照舊（D-171 第 3、7 點）。

GitHub 上的 Codex 審查（[D-212](../decisions.md#d-212-claude-直接呼叫本機-codex任務開始時分本機或雲端) 第 7 點）是合併前的補充，標準寫在 `AGENTS.md`〈Code Review Rules〉，不取代 L2；留言由 Claude 核對後再修（D-131）。設定（2026-11-19）：自動審查開；審查「團隊 PR」（「所有 PR」存不進去；PR #22 確認使用者帳號開的 PR 會審）；觸發條件「建立 PR 時」，草稿 PR 標成可審查時才審，之後推上去的 commit 不會再自動審，要再審就在 PR 留言 `@codex review`；全面審查關（深審靠 L2，省週額度）。審查中 PR 上有 👀，沒有發現就按 👍，有發現才留言；合併前看一眼。

## 測試分兩類

[D-195](../decisions.md#d-195-測試分兩類改不回來的做足其餘延後但不漏)。問「做錯了，之後改版改得回來嗎？」，一項一項分，同一件任務可以兩類並存：

- **先看正常流程**：會擋住或弄錯正常使用的（例如一般大小的卡組卡住複習、日常作答被擋），照原本的驗收做完，不延後。之後才看少見的情況。
- **第 1 類**：上面的高風險範圍與下面的格式查核涵蓋的（寫進使用者檔案的格式、ID 與複習紀錄、排程與紀錄重播、更新與備份還原、舊版外掛讀得到的東西），以及會默默弄壞紀錄、讓孩子看到沒審過的卡；合併前做足。說不準的歸這一類。
  - 例：AI 製卡中斷後「不會重複或重用 ID、已寫的草稿保留、仍要按啟用」是第 1 類；重開後自動接著存的方便與額外的恢復情況是第 2 類。
  - 例：只在 iPhone 看得到的排版截斷是第 2 類；同步後少了作答、舊版讀到不該出的卡是第 1 類。少見的大卡組第一次顯示稍慢、操作與存檔都正常是第 2 類；逾時會造成重複寫入或丟紀錄是第 1 類。
- **第 2 類**：其餘少數例外狀況的測試、為很少見的情況多做的功能；延後，寫成那個外掛的[技術債表](../../apps/Cards/docs/backlog.md#技術債)（共用工具的記在[最上層](../backlog.md#技術債)）開頭「補測：」或「補做：」的一列。延後功能時，開放的入口要能走完一條安全的路徑，否則合併前先關住入口或做完那條路徑。
- **L2 的發現不在這裡分**：L2 找到的真實缺陷照 [D-207](../decisions.md#d-207-l2-的發現先分一定修可記限制交使用者選修法先收窄最後才加機制) 分成一定修、可記成已知的限制、交使用者選三種，第四輪還擋合併時交使用者決定，不由實作者自己改列第 2 類。
- **任務說明**：規劃者在「和不做比較」或範圍裡寫哪些是第 2 類，每一項寫中斷或出錯時怎麼恢復；`## 結果`（標題以「結果」開頭的二級標題，底下可以有三級小節）的段落或清單項目開頭有恰好一行「延後的測試：」，寫「無」或用「」括住技術債表的列名（例如「補測：存到一半中斷」），開工時先寫「延後的測試：（實作後填）」。
- **狀態行**：照[工作流程規範〈入口的狀態行〉](workflow.md#入口的狀態行)，任務結束時寫「狀態：已合併｜完成：<一句>｜等誰：—」或已結案；部分完成寫在完成那一句。文件檢查看到結束的狀態就檢查〈結果〉；commit 時列名要對得到技術債表的列。2026-11-21 以前的檔（凍結清單 `tools/legacy-status-docs.json`）照舊格式：「狀態：已結案」「已完成」或「已合併」後面接括號、冒號、逗號或「｜」再寫備註，不寫「驗收通過」這類文件檢查認不出來的結束詞。
- **沒有任務說明的改動**：小修、試作場、L2 時才決定延後的項目，整合者在交回或合併前看有沒有延後的測試，有就在同一批改動加進技術債表。
- **補完與留到第二階段**：補完照技術債的做法刪掉那一列，經過寫在那件工作的入口（roadmap 的〈已完成〉由工具從入口產生）；使用者同意留到第二階段時，先在 [backlog 的第二階段清單](../../apps/Cards/docs/backlog.md#第二階段想做的事)寫下來源、完成條件與使用者同意的日期，再從技術債表刪掉。

## 開工前的格式查核

[D-140](../decisions.md#d-140-fable-規劃opus-執行codex-查核) 第 4 點。任務說明會改出題語法的解析、複習紀錄的欄位，或其他寫進使用者檔案的格式時：

1. 規劃者寫好任務說明後，另寫查核請求 `<任務說明的資料夾>/<任務>-format-review.md`：只列格式那幾節、要對照的決定與 syntax.md 的章節、基準 commit；任務說明的開工條件寫明哪幾節要等查核。
2. 用 `node tools/codex.ts format <請求檔>` 請 Codex 查（[D-212](../decisions.md#d-212-claude-直接呼叫本機-codex任務開始時分本機或雲端)）：和已有的決定、syntax.md 有沒有矛盾；舊的資料與還沒更新的舊版外掛讀不讀得到；邊界情況有沒有寫清楚、能不能寫成測試。只回報，寫在 `Claude Codex Discussion/`。
3. Claude 核對回報、改任務說明，再實作那幾節；任務的其他部分不用等。合併前的 L2 照舊。

## 卡關時的升級

[D-140](../decisions.md#d-140-fable-規劃opus-執行codex-查核) 第 3 點、[D-144](../decisions.md#d-144-決策交給-opus-xhighfable-只在解不了的時候)。卡關的 bug 與重大決策走同一條路線。bug 是照 code-quality 的除錯做法，列出的假設都被推翻，或做不出能重現的指令；重大決策是 D-140 第 2 點那幾類（資料格式、模組邊界、要新增決定、製卡規則或學習地圖的設計）。依序：

1. **Opus xhigh**：bug 從除錯做法的第 1 步再做一次；決策寫出問題、選項與各自的代價。規劃型的對話一開始就開 xhigh，中途不切。
2. **Codex**（`node tools/codex.ts bug <請求檔>`，Sol、xhigh，先問使用者，同意了加 `--confirmed`；決策用 `discuss`）：bug 從頭查，只給重現指令（做不出來時給症狀與出現的條件）、錯誤訊息、相關檔案與基準 commit，**不給 Claude 的假設與推論**，Codex 只回報；決策把第 1 步寫成 `docs/Claude Codex Discussion/`（外掛專用的在外掛的 `docs/` 底下）的討論稿（D-106），Codex 回應，雙方一致後交使用者確認。
3. **Fable 5.1 high，或 Codex 的 Astra**（`node tools/codex.ts escalate`，先用 low、必要時 `--effort medium`；都先問使用者）：前兩步都解不了，或兩家不一致又說不出誰對，才用；附交接說明，寫目標、試過的做法、各自為什麼不對、目前的證據。

換 Claude 的模型要使用者做，Codex 那一步由 Claude 呼叫；每升一級都先跟使用者說一聲。找到根因後，回到除錯做法的第 5 步，由 Opus 修；決策定了就寫成 D-ID 或任務說明。

## 本專案的做法

- 寫回筆記的函式，往返與冪等測試登錄進共用的範例清單：`apps/Cards/tests/deck.test.ts` 的 `deckCases`。
- 只在 Node 驗過的檔案存取，接上 Obsidian 前要在 Windows 版 Obsidian 對照一次（D-110）。
- 規格的平台事實表（code-quality〈寫規格〉，[第二次里程碑檢查](<../../apps/Cards/docs/Claude Codex Discussion/2026-11-10-milestone-2-review.md>) R7）在本專案常見的列：iPhone（例如 `stack` 沒有位置，[D-173](../decisions.md#d-173-iphone-的-stack-沒有位置沒接住的錯誤一律收)）、CI 的 Linux、Obsidian 的渲染器（和 markdown-it 不同）、Obsidian 的檔案操作與計時器（例如底層的操作不會因為外掛的上限停下）。探針用 Windows 版 Obsidian 的開發命令；iPhone 的項目集中成一次實機測試。
- 測試只用 syntax.md 的例子或自編的內容。
- markdown-it 只當第一層的快速探針，Obsidian 的渲染器不一樣：`$…$` 是數學式、`%%…%%` 是註解、`www.` 開頭會變連結、字中間的底線也算強調（2026-11-04，Obsidian 1.15.0）。結論取決於實際畫面時，用不提交的開發命令跑真的渲染器，並告訴查核者用哪一個重現；程式判斷 Markdown 時寧可用白名單。
- 開發命令要按按鈕或寫檔時，先找到自己建立那一篇的 leaf，在它的 `containerEl` 裡查，不用 `document.querySelector`；有確認視窗時先核對是不是這一篇。測試 vault 常開著使用者自己的分頁（2026-11-08 誤把一篇草稿改成啟用）。
- 內容含 `\uXXXX` 跳脫時，Write 與 Edit 會把它解開成真的零寬或私用區字元（讀出來看起來仍是跳脫）。寫完用 node 掃改過的檔，有就用腳本換回跳脫，只換自己改的行；repo 裡原本就有的真字元（例如測試裡的 BOM）不動。
- Obsidian 畫面的截圖用開發版的 `ui` 命令（Electron 的 `capturePage()`），不要用 computer-use：它會截到舊畫面，還會讓 Obsidian 被當成隱藏而停止繪製，計時器和 `requestAnimationFrame` 也跟著變慢（W6 的 Windows 實測）。
- 測試不改全域的 `node:fs` 等 Node 內建模組：Node 自己的實作也會呼叫它們，換掉之後結果會隨 Node 的版本改變。要模擬失敗，就把替身直接交給要測的函式（例如 `createNodeFiles` 的 `seams`）。
- 產品程式（`apps/Cards/src/`，開發命令除外）裡的 `catch` 與 `.catch()`，不是交給錯誤紀錄（[D-155](../decisions.md#d-155-正式版的錯誤紀錄)）就要在旁邊寫一句為什麼不用，例如「讀不到是預期的，state 會重試」「已經經過 onError 記下」；ESLint 的 `no-console` 擋得到直接印 console，擋不到空的 `catch` 與吞掉的拒絕，L2 審查照這條看。
- 維修時怎麼讀錯誤紀錄（[D-155](../decisions.md#d-155-正式版的錯誤紀錄)、[D-160](../decisions.md#d-160-學生在複習畫面回報問題點一個選項記進錯誤紀錄)）：使用者回報問題，或問有沒有學生的回報時，先讀 vault 的 `Essence Cards/紀錄/錯誤/` 那段時間的行（格式見 [syntax.md §9](../../apps/Cards/docs/syntax.md#9-錯誤紀錄)；學生的回報是 `where: "report"`，用 `lt` 在卡組裡找到那一行）。用 `build` 找是哪一版；要把 `stack` 對回原始碼時在 `apps/Cards/` 用 `npm run locate -- <版號> <行:欄>`（只有正式安裝存過對照表的版本能用）；iPhone 的 `stack` 只有名稱、沒有行與欄，`where: "uncaught"` 的可能是別的外掛的錯（[D-173](../decisions.md#d-173-iphone-的-stack-沒有位置沒接住的錯誤一律收)）。紀錄可能因同步、上限或寫入失敗而缺漏，沒有那一行不代表沒發生；寫進 repo 的只寫摘要（D-003）。

- 同一件工作留在原對話，靠自動壓縮，不例行請使用者開新對話；壓縮後反覆找不到驗收依據，或工作已換成可獨立交付的一段，才換（[D-171](../decisions.md#d-171-省-token-靠縮短上下文不靠少審或換模型) 第 7 點）。
- 待驗的條件或排除某個修法的原因，從 commit、測試、報告找不回來時，在任務的進度段或審查回覆留一句：驗過哪個測試或 commit、還剩哪個條件，必要時附失敗原因。找得回來就不用寫。
- 量 Claude 與 Codex 的 token 用量：方法與每次的結果記在 [token-usage.md](token-usage.md)（D-171 第 6 點）。

## 技術債清單

[backlog 的「技術債」一節](../../apps/Cards/docs/backlog.md#技術債)。

L2 的發現機率極低或真實路徑走不到、這次不修的，記在那個外掛 backlog 的[「已知的限制」一節](../../apps/Cards/docs/backlog.md#已知的限制)（共用工具的記在[最上層](../backlog.md#已知的限制)）（[D-202](../decisions.md#d-202-l2-的發現先估發生機率極低的記成已知的限制)、[D-207](../decisions.md#d-207-l2-的發現先分一定修可記限制交使用者選修法先收窄最後才加機制)）。

## Obsidian 相容性檢查

[D-138](../decisions.md#d-138-obsidian-出新的次版本時做一次相容性檢查)：Obsidian 出新的次版本（例如 1.14 → 1.15）時做一次，由 AI 做。

- **目前驗證過的版本**：Windows 1.15.0（2026-11-03，[相容性檢查](../../apps/Cards/docs/tasks/obsidian-1.15-compat.md)；npm 還沒有 1.15 的型別檔，比對列在[技術債](../../apps/Cards/docs/backlog.md#技術債)）；iPhone 1.15.0（2026-11-03，[iPhone 測試](../../apps/Cards/docs/tasks/iphone-test-2026-11.md)）。
- **怎麼發現新版**：開發命令的結果檔會記 Obsidian 的版本（`obsidian` 欄位），AI 在 Windows 版 Obsidian 跑開發命令時看到比上面新的次版本就做；每個里程碑結束時也查一次 Obsidian 的改版說明。
- **三層**：
  1. 比對新舊版 `obsidian` 套件的 `obsidian.d.ts` 與 `peerDependencies`（CodeMirror 的版本）：本專案用到的 API 有沒有改、標成不建議使用；CodeMirror 版本變了就把 `apps/Cards/package.json` 的開發相依改成一樣，在 `apps/Cards/` 跑 `npm run check`。npm 常比 app 晚：還沒有新版時，先讀 `%APPDATA%\obsidian\obsidian-<版本>.asar` 裡的 `app.js`（只讀不執行），查用到的匯出還在、用 CodeMirror 新舊版的差異推定版本，型別檔的比對記進技術債；安裝資料夾的 `resources\obsidian.asar` 是安裝當時的舊版，不能當上一版比。
  2. 在 Windows 版 Obsidian 用開發版重跑 `files`、`compare`、`lock`、`save`、`today`、`answer`、`events`、`a3check`（在 `apps/Cards/` 跑 `npm run install-vault -- <測試 vault> --dev`），結果和上一次比。`events` 比對[外掛架構討論稿環節 1 的 A3 表](<../../apps/Cards/docs/Claude Codex Discussion/2026-10-26-plugin-architecture.md#實機記錄t3-與-a32026-10-27opus-55>)。`a3check` 的每個情境都要 `ok`；`skipped` 列的是未測的子項，不算通過，要和上一次相同；`cleanupLeft` 要是空的（iCloud 偶爾會把剛刪的測試卡組放回來）。開發命令的結果拿來當驗收（這一層與任務的完成條件）時都一樣：必要的操作沒做到不算通過，未驗的子項另外列；「完成」的通知或結果檔存在不算通過。`lock`、`save` 會假通過的情境已修（`b9309ca`，外掛架構討論稿環節 9 結論第 5 條）：`save` 的 `checks.clicked` 也要是 true。
  3. 讀改版說明裡和這幾點有關的條目：編輯器與 CodeMirror、Markdown 解析與閱讀模式（清單、區塊 ID）、檔案與 vault 的事件、iOS 與同步；每一點寫一句結論。
- **結果**：寫在相容性檢查的任務說明〈結果〉，收尾時 roadmap 的〈已完成〉由工具從它的狀態行產生；通過就更新上面的版本；有不相容先寫失敗測試再修（高風險範圍做 L2）。iPhone 的部分記進下一次 iPhone 實機測試的清單。

## 里程碑

見 [roadmap](../roadmap.md)。

1. W1～W6 打通「手寫卡組 → iPhone 複習 → 自評 → 排程」（[D-111](../decisions.md#d-111-v1-的開發順序capture-延後)），2026-10-27 達成；[檢查](<../../apps/Cards/docs/Claude Codex Discussion/2026-10-27-milestone-1-review.md>)。
2. 上線前：第一次升正式版前（`0.4.0`，考試範圍、小考、點選填空、AI 製卡最小版、設定頁、補紀錄缺口、外掛內還原），2026-11-10 檢查、2026-11-12 裝到正式 vault；[檢查](<../../apps/Cards/docs/Claude Codex Discussion/2026-11-10-milestone-2-review.md>)。
3. 還沒定。💡 v1 功能做完、開始真實使用驗證之前（roadmap 路線圖 v1 的完成條件）。

## 共用的 skill

`.claude/skills/` 與 `.agents/skills/` 裡的 code-quality、essence-decision、essence-discuss，兩份內容必須相同，由 `tools/check-skill-mirror.ts` 檢查；改其中一份時，另一份一起改。
