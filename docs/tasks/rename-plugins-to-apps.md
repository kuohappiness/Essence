# `plugins/` 改名 `apps/`，資料夾首字大寫（D-218，給 Claude，本機執行）

狀態：已合併｜完成：搬家、大小寫的防線與現行文件（D-218）；L2 兩輪，第二輪沒有擋合併的問題｜等誰：—

遵守 repo 根目錄的 `AGENTS.md`。建議模型與推理等級：**Opus、高**；寫規格、改完後的一致性檢查（〈驗收〉第 6～9 項）用 xhigh。這件改到 pre-commit、CI、分派表、跨版本比較的工具與雲端的開場 hook，合併前做 L2（[quality.md〈高風險範圍〉](../agents/quality.md#高風險範圍要做-l2)）。

依據：[D-218](../decisions.md#d-218-plugins-改名-apps每個軟體的資料夾首字大寫)（修改 [D-208](../decisions.md#d-208-三個外掛在同一個-repo-開發每個外掛有自己的資料夾)）；做法沿用 [第二步任務說明](one-repo-step-2.md)（改連結的腳本、跨版本的外掛根、雲端的開場訊息），那份的〈結果〉記了踩過的坑，開工前讀 A、B 的進度兩節。

基準：`main` 的 `252d85d`（2026-11-21，工作流程 PR #30 合併後；分支在 `bc0e51d` 用 merge 併進來）。下面的數字在這個基準重算過。

**不在這一步**：外掛 ID（`essence-cards`）、vault 裡的 `.obsidian/plugins/essence-cards/`、套件名稱（`package.json` 的 `name`）、tag、任何寫進 vault 的格式、產品程式的行為；寫 `apps/Portal/` 的文件（D-218 第 1 點：第一份文件出現時建，由網頁版的討論串在這個 PR 合併後寫；這一步只把 Portal 登記進分派表與 §3 的表）；`experiments/plugin/`（試作外掛自己的資料夾名，不是這一層）。

## 和「不做」比較（D-153、D-177）

見 [D-218](../decisions.md#d-218-plugins-改名-apps每個軟體的資料夾首字大寫)〈理由〉〈曾考慮的做法〉。這裡只補做的成本（最早在 `8a03736` 量；2026-11-21 在分支的 `bc0e51d`（含 `252d85d`）的暫存 clone 重量，Windows）：

- 搬 615 個追蹤檔（`plugins/` 底下全部）。
- 改連結的腳本照 `plugins/cards=apps/Cards plugins/capture=apps/Capture plugins/mindboard=apps/Mindboard` 跑，要改 715 個連結、0 個要人看；改完再跑 `--check` 是 0。
- 搬家並跑完腳本後，還寫著路徑寫法的 `plugins`（〈驗收〉第 5 項的寬 pattern，去掉 vault 路徑）約 1,470 行：約 870 行在決定、任務、討論稿與 archive（紀錄，不改）；其餘在 `tools/legacy-status-docs.json`（192 行）、共用工具與它們的測試、Cards 的工具與測試（含不改的歷史路徑與跳脫過的 vault 路徑）、CI、雲端 hook、試作場與現行文件，見 §2、§4。

## 停手時段

開工前和使用者約：從搬家的 commit 到合併，別的分支與 `main` 不改 `plugins/`、`tools/`、`.githooks/`、`.github/workflows/`、`.claude/`、`.agents/skills/`、`.gitignore`；施工的 worktree 在搬家的 commit 前不在 `plugins/` 底下開終端機或跑檢查（有程序的工作目錄在裡面，`git mv` 會整個失敗，見〈平台事實〉）；主資料夾同樣的限制在〈合併後〉第 1 步。開工時先列出還沒合併、而且分岔點已經有 `plugins/cards/` 的分支（第二步 A 之後開的），有的話先問使用者順序。最後一次 rebase 之後重跑改連結的腳本與〈驗收〉第 2～5、7 項。

2026-11-21 開工時列出的：`claude/workflow-impl-68afda`（D-214／D-215／D-217 的工作流程，L2 中）。它大改 `tools/check-docs.ts`、`hooks.ts`、`roadmap-board.ts`，新增 `tools/roadmap-sync.ts`、`decisions.ts`、`legacy-status-docs.json`（都有 `plugins/` 的寫法），也改 `plugins/*/docs/`。Claude 建議它先合併、搬家的 commit 在它之後：改名靠腳本、可以重跑，反過來它要 rebase 過整個改名，L2 也要重審（已問使用者）。它合併後，用〈驗收〉第 5 項的寬 pattern 重列 §2 的表。

## 本機或雲端（[quality.md〈本機或雲端〉](../agents/quality.md#本機或雲端)）

整件在本機做（Windows 的大小寫與 junction、測試 vault）。

**審查者（使用者 2026-11-21）**：Codex 的額度用完，約 2026-11-23 重置；這件的開工前查核與 L2 改由 **Fable 5.2 high** 做：由本機 session 開沒參與實作的新子代理（每一輪都新開，同 D-171 第 1 點），請求與報告照 code-quality 的 `review.md`，報告原文附進請求檔的那一輪再核對。Codex 重置後，新的任務照 [quality.md](../agents/quality.md) 改回 Codex；這件做到一半 Codex 重置了，也照舊用 Fable 做完，不換審查者。

| 在哪裡 | 做什麼 |
|---|---|
| 本機（一定） | 施工、開工前查核與 L2、§5 的演練、Windows 的檢查、〈合併後〉的整理。施工在 repo 外的新 worktree（`D:\程式開發\Essence-apps`，開好先在 `tools/`、`plugins/cards/` `npm ci`），主資料夾留在 `main` 給其他 session；由主資料夾的 session 對那個路徑操作（在那裡開的 session 讀不讀得到專案記憶與核准的指令沒驗過） |
| 雲端（一定） | 合併前在這個分支、合併後在 `main` 各開一個**新的**雲端 session，看 `cloud-setup.mjs` 的開場訊息（〈驗收〉第 10 項），只讀不改 |
| GitHub | CI（含探針 PR）、PR 上的 Codex 自動審查（不取代 L2） |

## §1 commit 的分法

D-208 第 8 點：路徑搬動與工具調整分開 commit。每個 commit 都經過 pre-commit，不用 `--no-verify`。

1. **準備**（搬之前，`plugins/` 照舊）：
   - Cards 的跨版本外掛根加第三種：`plugins/cards/tools/git.ts` 的 `MANIFESTS` 加 `'apps/Cards/manifest.json': 'apps/Cards'`，`PluginRoot` 加 `'apps/Cards'`；`根目錄與 plugins/cards/ 都有` 這類訊息改成列出找到的每個路徑。`plugin-root.test.ts` 加「只有 `apps/Cards/` 的」「`plugins/cards/` 與 `apps/Cards/` 都有」「`apps/cards/`（大小寫不對）的」三例（最後一例當成沒有，丟「都沒有」的錯；Windows 上這一例的檔要在建任何 `apps/Cards/…` 之前 `git add`，否則 git 會把它對齊成索引裡已有的大小寫，測試旁寫這個理由）。
   - 共用工具裡軟體代號對資料夾的表（§3 第 1 點），先照舊值填 `plugins/…`，把 `dispatch.ts` 的 `` `plugins/${target}` `` 這類字串組法換成查表。
   - 表是工具的新相依：`tools/tests/hooks.test.ts` 的 `COPIED` 改成「追蹤的 `tools/*.ts`、`*.mjs`、`*.json` 全部」（不再手列，之後新增的工具也照樣換成要驗的版本），`tools/tests/quality.test.ts` 三處複製工具的地方也帶上表。
   - `tools/check-plugin-imports.ts` 改名 `check-app-imports.ts`（測試、`SHARED_CHECKS`、`package.json` 的 script 跟著改），規則照舊。
   - Cards 的資料夾一律取磁碟上的真實大小寫（§3 第 6 點）。
2. **搬家**（一個 commit）：先 `mkdir apps`（沒有這個資料夾時 `git mv` 會失敗），確認沒有程序的工作目錄在 `plugins/` 底下，再 `git mv plugins/cards apps/Cards`、`git mv plugins/capture apps/Capture`、`git mv plugins/mindboard apps/Mindboard`，加上讓這個 commit 的 hook 過得了的最少修改：§2 的路徑常數、§3 的表、`.gitignore`、`check.yml`、`progress-board.yml`、`cloud-setup.mjs` 與它們的測試、`experiments/` 的程式與設定裡的路徑、§4 的連結（腳本）。搬完刪掉留在磁碟上的空 `plugins/` 資料夾（git 不追蹤空資料夾，`git mv` 之後它還在）。commit 之前在新位置 `npm ci`（`apps/Cards/`；`tools/` 若改了相依也重裝），hook 的副本借得到 `node_modules`。表上 Portal 那一列（`portal → apps/Portal`，只有文件）在這個 commit 加。這個 commit 單獨推一個探針分支，看 Linux 的 CI 七個 job（同第二步驗收第 13 項）。
3. **防線**：§3 第 1 點的兩個測試、Portal 只有文件的規則、第 2～4 點的機械檢查、例外表與它們的測試。
4. **現行文件**：§4 的文字。

## §2 程式要改的

先 `git grep -n -i "plugins"` 列全（不只找 `plugins/cards` 這種完整路徑：跳脫過的正規式 `plugins\/`、`join(root, 'plugins')`、萬用字元 `plugins/*` 都要看到），逐處判斷；下面是 2026-11-21 列出的，`claude/workflow-impl-68afda` 合併後重列。**不能整批取代**：`plugins/essence-cards`、`.obsidian/plugins/` 是 vault 裡的路徑，一個字都不改（`apps/Cards/src/core/backup/manifest.ts`、`tools/install.ts`、`backup.ts`、`update-vault.ts`、`vault-io.ts` 與多個測試都有）。

| 位置 | 要改的 |
|---|---|
| `tools/dispatch.ts` | `CARDS`、`folder()` 改查表；第 4 條（Capture、Mindboard 的資料夾）、第 5 條（`plugins/` 底下不認得的路徑）改成 `apps/`；`plugins/*/package.json` 的 scripts 入口 |
| `tools/check-plugin-imports.ts` | 改名 `tools/check-app-imports.ts`（測試檔跟著改名、`package.json` 的 script 與文件跟著改）；`PLUGIN` 等規則與訊息改成 `apps/<軟體>/`；§3 第 2、3 點加在這裡 |
| `tools/check-docs.ts` | `DEFERRED_BACKLOGS`、`PLUGIN_ROADMAP`、狀態目錄與任務對 backlog 的規則、`BEFORE_D195_DIRS`、`OLD_PLACE`（舊位置的 `tasks/`、討論稿）、`EXCEPTIONS` 與 `FROZEN_RULES` 的檔名（只改鍵，值是照搬家前位置解的相對路徑，同一層深度不用改）、`rulesHere` 的 manifest 路徑 |
| `tools/roadmap-board.ts`、`tools/progress-board-data.ts` | `PLUGIN_ROADMAP`、`RELEASE_ROADMAP`、`readdirSync(join(root, 'plugins'))`、指到 GitHub 的網址 |
| `tools/hooks.ts` | `SHARED_CHECKS` 裡 `check-plugin-imports.ts` 的名字 |
| `tools/ci-gate.ts`、`tools/eslint.config.js` | 註解 |
| `tools/tests/` | `check-docs`、`dispatch`、`hooks`、`plugin-imports`（改名 `app-imports`）、`ci-gate`、`roadmap-board`、`quality` 的路徑與預期訊息，含跳脫過的 `plugins\/…`；暫存 repo 建資料夾的地方（例如 `hooks.test.ts` 的 `join(repo, 'plugins', plugin)`）用 §3 的表，不用小寫代號組；`hooks.test.ts` 的 `COPIED`、`quality.test.ts` 複製工具的三處見 §1 第 1 點 |
| `.github/workflows/check.yml` | `working-directory`、`cache-dependency-path`（job 的 id 照舊小寫） |
| `.github/workflows/progress-board.yml` | `paths` 的 `plugins/*/docs/**`；加上表所在的檔（只改表時白板也重產） |
| `tools/legacy-status-docs.json`（工作流程 PR #30 加的） | 192 個 `plugins/…` 路徑（舊格式狀態行的凍結清單）。JSON 不歸改連結的腳本管：照資料夾對照機械改，驗收每個路徑改完仍是追蹤的檔（〈驗收〉第 18 項） |
| `tools/decisions.ts`、`tools/roadmap-sync.ts`（PR #30 加的） | `decisions.ts:297-301` 判規範文件的正規式（`^plugins\/[^/]+\/…`）、`roadmap-sync.ts` 的 `ROADMAP` 正規式與檔頭註解：改成 `apps\/[^/]+\/`，資料夾名照 §3 第 3 點抓整段前綴；`tools/tests/roadmap-sync.test.ts`、`decisions-index.test.ts` 的路徑跟著改 |
| `.claude/hooks/cloud-setup.mjs` | `DIRS`；清單測試 |
| `.gitignore` | `/plugins/cards/main.js`、`/plugins/cards/styles.css` |
| `apps/Cards/src/core/ai/rules.ts` | 5 個規則檔路徑（`apps/Cards/docs/card-rules/…`）。路徑不進嵌入內容與雜湊（`tools/build.mjs` 的 `embedRules` 只讀檔），`embedRules()` 的結果要和改名前 `deepEqual`（〈驗收〉第 4 項）。但 `RULE_SUBJECTS` 是執行時的資料表（`src/obsidian/ai-cards.ts`、`deepen.ts` import），路徑字串會進 `main.js`；它在執行時只用在 `ruleText` 的錯誤訊息（`rules.ts:54-59`，建置時才呼叫），所以 §5 第 1 項換回舊字串再比 |
| `apps/Cards/tools/` | `git.ts`（§1 第 1 點）、`build.mjs`（`root` 取真實大小寫，§3 第 6 點）、`cli-path.ts` 的註解與說明；`npm --prefix plugins/cards` 的用法說明 |
| `apps/Cards/tests/` | `plugin-root`、`compare-versions`、`cli-path`、`build`、`pick-old-version`、`ai-rules`、`ai-add-old-version`、`helpers/layout.ts` 的路徑與註解（`layout.ts`、`plugin-root.test.ts` 的 Cards 根取真實大小寫，§3 第 6 點）。註解寫現況的改；寫歷史的（「搬家前在根目錄」這類）留著，那個檔進 §3 第 3 點的例外表 |
| `experiments/` | `t4/` 的設定 JSON 與腳本（含 `screen.mjs` 給 git 的 pathspec）、`source-reading/`、`tools/deepen-threshold.ts` 裡寫到 Cards 規則檔或程式的路徑；`tools/move-links.test.mjs` 的範例照舊（它測的是第二步的搬法）。`experiments/plugin/` 的程式只有 vault 路徑，不改 |

建置的對照表（`main.js.map`）的 `sources` 從 `plugins/cards/…` 變成 `apps/Cards/…`；舊版的對照表照它當時的路徑，定位錯誤時用的是對照表裡的 `sourcesContent`，不受影響（開工時讀 D-155 的定位工具確認，結果寫進〈平台事實〉）。

## §3 大小寫的防線（D-218 第 4 點）

Windows 不分大小寫、Linux 分：在 Windows 寫成 `apps/cards` 本機照樣能跑，推上去 CI 才壞，或更糟，CI 沒有測到的路徑在雲端 session 才壞。

1. **一張表**：共用工具裡軟體代號 → 資料夾（`cards → apps/Cards` 等，含還沒有程式的 `portal → apps/Portal`）只寫一處（例如 `tools/apps.ts`），`dispatch.ts`、`check-docs.ts`、`roadmap-board.ts`、`cloud-setup.mjs`（它不 import `tools/`，就照抄並用測試比對兩份相同）與測試都從這裡取。測試：表上有追蹤檔的資料夾大小寫和 `git ls-files` 完全相同（Portal 在第一份文件之前沒有追蹤檔，可以不存在）；`apps/` 底下每個追蹤的資料夾都在表上。
   - **還沒有程式的軟體（現在是 Portal）**：表上標「只有文件」，分派表對它底下的改動只跑共用檢查（文件檢查會照 `apps/<軟體>/docs/` 的規則查）；這個資料夾出現 `*.md` 與圖檔（`png`、`jpg`、`jpeg`、`gif`、`svg`、`webp`）以外的追蹤檔，而表上還標「只有文件」就報錯（不只看 `package.json`：先寫 `src/a.ts` 或 `index.html` 也擋），寫第一行程式的任務要把它改成有自己檢查的對象、加 CI job（照 D-208 第 5 點）。
   - **誰報**：這條與第 2 點、「`apps/` 底下每個追蹤的資料夾都在表上、大小寫相同」由 `check-app-imports.ts`（每次 commit 都跑的共用檢查，也在 CI 的 shared job）報，不經分派表的 `blocked`，`hooks.ts`、`ci-gate.ts` 的「是子模組」訊息不動。大小寫不符的訊息寫 Windows 的改法：`git mv apps/portal apps/Portal.tmp` 再 `git mv apps/Portal.tmp apps/Portal`（Windows 上索引裡還沒有這個資料夾時，`git add` 照打的字記，一步的 `git mv` 會失敗，見〈平台事實〉）。
   - **`cloud-setup.mjs` 的清單**是表上有程式的列（不含 Portal），和 `check.yml` 每個 job 安裝的資料夾相同（`cloud-setup.test.ts` 照舊比這兩份），另加一個測試比它和表上有程式的列相同。
2. **擋 `plugins/` 再出現**：追蹤的檔路徑第一段不分大小寫是 `plugins` 或 `apps`、卻不是恰好 `apps` 就報錯（`plugins/…`、`Apps/…`、`APPS/…` 都擋），`plugins/` 的訊息寫「改名後放 `apps/<軟體>/`（D-218）」。
3. **擋大小寫不符的寫死路徑**：掃**追蹤的文字檔全部**，扣掉逐一列出的紀錄（`docs/decisions.md`、`docs/tasks/`、`docs/Claude Codex Discussion/`、`docs/archive/`、`apps/*/docs/tasks/`、`apps/*/docs/Claude Codex Discussion/`、`apps/*/docs/archive/`）與下面的例外檔：
   - 比對前先把 `\/`、`\\`、`\` 都當成 `/`、`\.` 當成 `.`（正規式跳脫與 Windows 路徑一起處理，下面兩條也用同一個正規化）；再不分大小寫地找 `apps/<表上的名稱>`（`apps/cards`、`Apps/Cards`、`apps\Cards`、`apps\/cards`、`blob/main/apps/cards` 都找得到），`apps` 與名稱兩段不恰好等於表上的寫法就報錯。只認表上的名稱：`apps/` 後面接的不是表上名稱的（`apps/<軟體>/`、`apps/*/docs/`、`apps\/([^/]+)`、測試的 `apps/Other/a.ts`）不歸這條管，由第 1 點「每個追蹤的資料夾都在表上」管；
   - Markdown 以外的檔寫死 `plugins/(cards|capture|mindboard)` 或 `plugins\/`（不分大小寫）報錯；`plugins/essence-`、`.obsidian/plugins`、`community-plugins` 不算。Markdown 不查這條：已完成的 plans 與 backlog 舊列的反引號是紀錄（D-218 第 5 點），連結由 check-docs 擋（舊路徑找不到檔），現行文件的文字由〈驗收〉第 5 項在合併前查；
   - 表所在的檔以外，用字串組資料夾的（`` `apps/${ ``、`'apps'`、`"apps"`、`'apps/'`）報錯。`'apps/'` 這個前綴由表所在的檔匯出，分派表第 5 條與檢查都用它。改法分三種：從代號找資料夾的改成查表；資料夾名本來就是從追蹤的路徑抓出來的（`check-app-imports.ts` 的 `` `plugins/${plugin}` ``、`inside(target, 'plugins')`，`check-docs.ts:38` 的 backlog 路徑）改成整段抓前綴（例如 `/^(apps\/[^/]+)\//`），不拆開再組；`apps/<軟體>/` 自己的程式不能 import `tools/` 的表（軟體邊界），寫整段字面（例如 `cli-path.test.ts:32` 的 `join(top, 'plugins', 'cards')` 改成 `join(top, 'apps/Cards')`）。
   - **例外表**分三類，逐檔列在檢查裡（不用資料夾萬用字元），每列寫理由；表上的檔不存在或已經沒有它被允許的寫法就報錯，例外才不會越積越多：
     - **歷史路徑**（跨版本的工具要認得改名前的外掛根，D-218〈代價〉）：`apps/Cards/tools/git.ts`（`MANIFESTS`）、`apps/Cards/tests/plugin-root.test.ts`、`compare-versions.test.ts`、`ai-add-old-version.test.ts`、`pick-old-version.test.ts`、`build.test.ts`、`helpers/layout.ts`（後四個只在寫歷史的註解）、`tools/tests/ci-gate.test.ts`（第二步「搬家前開的分支」的情境）、`experiments/tools/move-links.mjs` 與 `move-links.test.mjs`（第二步搬家的範例）。施工時用〈驗收〉第 5 項的寬 pattern 確認，多的或少的照實改這張表。
     - **故意寫錯的樣本**（防線自己的測試）：`apps/Cards/tests/plugin-root.test.ts`（`apps/cards/`）、`tools/tests/app-imports.test.ts`（驗收第 7、17 項的 `plugins/cards/a.ts`、`Apps/Cards/x.md` 等）、`tools/tests/check-docs.test.ts`（驗收第 8 項的 Markdown 樣本）。樣本在 Windows 用 `git add` 做不出來（索引裡已有的資料夾會被對齊大小寫），用 `git update-index --add --cacheinfo` 放，或直接把路徑清單餵給檢查的函式，測試旁寫這個理由。`dispatch.test.ts` 不在表上：它的 `plugins` 全部換成新路徑。
     - **檢查本身**：`tools/check-app-imports.ts`（它要寫出 `plugins\/`、`plugins/(cards|capture|mindboard)` 這些 pattern）。
   - 現行文件（`architecture.md` §9、`quality.md`）說明這條防線時不舉寫錯的例子；要舉就進例外表。
4. **TypeScript 的 import**：`apps/Cards/tsconfig.json`、`tools/tsconfig.json` 明寫 `"forceConsistentCasingInFileNames": true`（TypeScript 5.0 起預設就是 true，現在裝的是 5.9.3，明寫是為了不靠預設）；Windows 上的探針見〈平台事實〉。沒被型別檢查的 `.mjs` 在 Windows 用 Node 直接跑照樣成功，只靠 Linux 的 CI 與第 3 點。
5. **Markdown 連結**：`check-docs` 照 `git ls-files` 比對，大小寫不同算找不到（Windows 上成立，見〈平台事實〉）；行內程式碼裡的指令（`npm --prefix apps/cards`）與指到這個 repo 的網址由第 3 點擋。改連結的腳本會把 14 個只差大小寫的連結改對（例如 `apps/Cards/docs/card-rules/trials.md` 裡的 `../../../capture/docs/backlog.md` 改成 `../../../Capture/…`），驗收時看到它們。
6. **工作目錄的大小寫**：Windows 上打 `npm --prefix apps/cards …` 或 `cd apps/cards`，`process.cwd()`、`import.meta.url` 都照打的字，git 卻回 `apps/Cards/`。Cards 的資料夾一進來就過 `realpathSync.native`（回磁碟上的真實大小寫；非 native 的 `realpathSync` 照舊回打的字）：`tools/build.mjs` 的 `root`、`tests/helpers/layout.ts` 的 `cards`（匯出一個真實大小寫的 Cards 根）、`tests/plugin-root.test.ts:66` 的 `cards`（改用 `layout.ts` 匯出的那個）。只轉 `path.relative` 的基準沒用：Windows 上它比對不分大小寫，回傳的尾段取自第二個參數。測試從小寫的工作目錄跑一次，結果和正確大小寫相同（只在 Windows，Linux 那個資料夾不存在）。
7. **`.gitignore`**：Windows 上 `/apps/cards/main.js` 也會命中 `apps/Cards/main.js`，Linux 不會；第 3 點掃得到 `.gitignore`，〈驗收〉第 16 項在 Linux 建置後看 `git status`。

## §4 連結與文件

- **連結用腳本改**：搬家的 commit 裡跑 `node experiments/tools/move-links.mjs plugins/cards=apps/Cards plugins/capture=apps/Capture plugins/mindboard=apps/Mindboard`（git mv 之後、commit 之前，在 repo 根目錄）。指到這個 repo `blob/main/plugins/…` 的網址也會換。第二次執行不改任何字，rebase 之後再跑。
- **製卡規則送給 AI 的部分**：`apps/Cards/docs/card-rules/` 三份規則的標記以下，連結是照第二步搬家前的位置寫的相對路徑；`card-rules/` 的深度不變，那幾條不用改，`FROZEN_RULES` 只改檔名的鍵。〈驗收〉第 4 項確認送出的內容沒變。
- **已完成的任務、討論稿、決定與 archive**：反引號裡的 `plugins/…` 是當時的紀錄，不改；連結照腳本改（D-218 第 5 點）。
- **現行文件**（文字裡的 `plugins/…` 改成 `apps/<軟體>/…`，「外掛的資料夾」這類說法照 D-218 第 2 點改成「軟體」，講外掛才有的事照舊）：
  - `AGENTS.md`：〈開始工作前〉的 `plugins/<外掛>/AGENTS.md`、〈Code Review Rules〉的 `plugins/cards/docs/syntax.md`；只改路徑，不加規則（不用過五關）。
  - `docs/architecture.md` §9：圖改成 `apps/`，加一行 `Portal/`（「入口網站；文件第一份出現時建、程式與檢查寫第一行程式前才建，D-218」）；〈每一類放哪裡〉〈新文件放哪裡〉〈commit 與 CI 怎麼檢查〉；標題的錨點 `9-repo-結構-d-208` 不改（很多地方連它）。
  - `docs/agents/quality.md`：〈本機或雲端〉`cloud-setup` 的資料夾清單、〈檢查指令〉的安裝、`npm --prefix`、`check-plugin-imports` 的名字與其他路徑。
  - `apps/Cards/AGENTS.md`、`apps/Capture/AGENTS.md`、`apps/Mindboard/AGENTS.md`、各自的 `README.md`。
  - `.claude/skills/` 與 `.agents/skills/` 的 `essence-decision`（兩份一起改，skill 一致性檢查會比）；其他 skill 有寫到的照改。
  - `docs/roadmap.md`、`docs/backlog.md`、`apps/*/docs/roadmap.md`、`apps/*/docs/backlog.md` 現行的段落與表格；`docs/agents/token-usage.md`；`docs/agents/workflow.md`（第 7 行「外掛」指 `plugins/<外掛>/`，PR #30 加的）。
- **狀態板**：`docs/roadmap.md`〈現在在哪裡〉跨外掛的工作加一列（`bc0e51d` 已加，只手寫工作與入口），狀態由這份的狀態行經 `roadmap-sync` 產生（D-217）。

## §5 演練（本機）

搬的只是資料夾，產品程式一行不改，所以不重做第二步的整套演練，只驗三件會因為路徑而壞的事：

1. **建置只差規則檔路徑**：照第二步驗收 A3 的做法，固定建置版本，在 `<基準>` 與要合併的 head 各建置正式版與 dev 版（兩邊都是 `core.autocrlf=false` 的 checkout，換行設定不同 `styles.css` 會差 CR）。head 的 `main.js` 把 5 個 `apps/Cards/docs/card-rules/` 換回 `plugins/cards/docs/card-rules/` 之後，和 `<基準>` 逐位元組相同；`styles.css` 逐位元組相同。換之前先數：head 的 `main.js` 恰好 5 個 `apps/Cards/docs/card-rules/`、0 個 `plugins/cards/`（開工前查核 R1 在暫存 clone 實跑過這個比法）。
2. **測試 vault 的開發版**：在隔離的 clone（`git clone --no-local` 到 repo 外）照第二步 §A7 第 4 項：先留存測試 vault 外掛資料夾的三個檔與雜湊，用改名後的程式 `install-vault -- <測試 vault> --dev`，完全關掉再打開 Windows 版 Obsidian，「版本」命令的 `BUILD` 是這次的建置；做完放回留存的三個檔、核對雜湊。
3. **跨版本**：`compare-versions` 比 `v0.6.0`（根目錄的外掛根）對改名後的 head（`apps/Cards`），以及 `8a03736`（`plugins/cards`）對 head，都跑得完、差異只有預期的。

iPhone 不用測：外掛 ID 與 vault 格式都沒變；建置產物只差 5 個規則檔路徑字串（第 1 項），這些字串在執行時只用在建置時才呼叫的 `ruleText` 錯誤訊息（`rules.ts:54-59`），手機上的行為不會因此不同。

## 合併後（本機，D-218〈代價〉）

1. **主資料夾**：先確認沒有 session 在 `plugins/` 底下跑東西，`git pull` 到合併後的 `main`。留下的未追蹤物（`plugins/cards/node_modules/`，以及改名後不再被忽略的 `plugins/cards/main.js`、`styles.css`）照第二步的做法搬到 `D:\程式開發\Essence Cards Backup` 底下一個註明日期的資料夾（先問使用者），之後 `git status` 是空的；`apps/Cards/`、`tools/` 各 `npm ci`。
   未追蹤物搬走後，刪掉空的 `plugins/` 資料夾（D-218 的理由就是不讓 AI 看到 `plugins/` 照外掛的規矩做）。
2. **其他 worktree**：還開著的 worktree 合進新的 `main` 後，在 `apps/Cards/` `npm ci`；`plugins/` 底下剩的未追蹤物與空資料夾同上。施工用的 `D:\程式開發\Essence-apps`：先唯讀掃有沒有 junction 與連結，沒有就用不加 `--force` 的 `git worktree remove`。
3. **探針**：§1 第 2 點與驗收第 11 項的探針分支、draft PR 關掉、刪掉。
4. **本機記憶與設定**：記憶裡的 `plugins/…` 改成 `apps/<軟體>/…`；核准的指令（`npm --prefix plugins/cards …`）與 Codex 的設定裡的路徑，列出來請使用者改（是使用者的設定，Claude 不自己改）。
5. **通知**：告訴使用者可以請「網頁版同步 2」討論串開始寫 `apps/Portal/docs/`；提醒第一份文件要照 `apps/Portal` 的大小寫 `git add`（§3 第 1 點）。
6. 〈驗收〉第 10 項合併後的那一次、第 11 項的 Pages。

## 驗收

`<基準>` 是開工時的 `main`，`<搬家>` 是 §1 第 2 個 commit，`<head>` 是要合併的 head。

1. `git ls-files plugins` 是空的；`git ls-files apps | cut -d/ -f2 | sort -u` 恰好是 `Cards`、`Capture`、`Mindboard`。
2. **都是改名**：`git diff -M --name-status <搬家>^ <搬家>` 裡 `plugins/` 底下的每個檔都是一行 `R`，沒有 D 加 A；`git diff -M <搬家>^ <head> -- plugins/cards/src apps/Cards/src` 除了改名沒有內容差異（產品程式一行都沒改，§2 的 `rules.ts` 例外：只有路徑字串）。在有完整歷史的 checkout，抽每個資料夾至少 20 個檔跑 `git log --follow`，接得到 `plugins/` 的舊路徑與第二步之前的根目錄路徑。
3. **檢查都過、不是空跑**：`apps/Cards/` 的 `npm run check`、`npm run build`，`tools/` 的 `npm run check` 與 `npm run self-check` 都通過，測試數和 `<基準>` 相同或多（多的是這次加的，列出名字）。
4. **送出的規則不變**：`embedRules()` 在 `<基準>` 與 `<head>` 的結果 `deepEqual`；`ai-rules.test.ts` 挑到的規則檔數大於 0。
5. **沒有殘留**：改連結的腳本 `--check` 是 0；`git grep -n -i -E` 找 `plugins` 後面接 `/`、`\/`、引號或 `*` 的（路徑的寫法：跳脫過的正規式、`join(…, 'plugins')`、萬用字元都會出現；`PluginSettingTab`、變數 `plugins` 這類識別字不進來）先用 §3 第 3 點的正規化，再扣掉 vault 與 Obsidian 的寫法（`plugins/essence-`、`.obsidian/plugins`、`community-plugins`、esbuild 的 `plugins:`、`app.plugins`、Obsidian 社群外掛的網址）、§4 列為紀錄的檔（決定、`docs/tasks/`、討論稿、archive、已完成的 plans）、§3 第 3 點的例外檔，以及現行文件裡寫歷史的列（roadmap、backlog 的已完成與這件自己的列、`token-usage.md`、`architecture.md` 寫第二步經過的句子，逐列附在〈結果〉），剩下是 0；扣掉的每一類各數幾行附在〈結果〉。`tools/dispatch.ts` 的識別字 `PLUGINS` 改成 `APPS`。`node tools/check-docs.ts` 通過。
6. **跨版本的外掛根**：§1 第 1 點的測試通過；讀 `v0.2.0`～`v0.5.0` 的舊版測試照常通過；§5 第 3 項跑完。
7. **分派表**：`tools/tests/dispatch.test.ts` 把第一步、第二步的每一例換成新路徑照樣通過，另加：只改 `apps/Capture/a.ts` → 只有 Capture；新增 `apps/Portal/docs/backlog.md` → 只有共用檢查；新增 `apps/Other/a.ts`（表上沒有）→ 全部。`tools/tests/app-imports.test.ts`：新增 `apps/Portal/package.json`（表上還標只有文件）→ 報錯；新增 `apps/Other/a.ts` → 報「不在表上」；新增 `plugins/cards/a.ts` → §3 第 2 點擋下；索引裡是 `apps/portal/…` → 報錯、訊息有兩段式的改法。
8. **大小寫的防線**（在暫存 repo 或 stage 後再拿掉，樣本不 commit）：`tools/` 裡寫 `'apps/cards/manifest.json'`、`check.yml` 寫 `working-directory: apps/cards`、Markdown 連到 `../apps/cards/AGENTS.md`、`apps/Cards/src/` 裡 import 大小寫不對的檔，四種各自被擋下（前兩種是 §3 第 3 點、第三種是 check-docs、第四種是 TypeScript）；在 **Windows** 本機也都擋下。
9. **外掛邊界**：第二步驗收 A7 的兩例換成新路徑照樣擋下，再加 `apps/Capture/` 的程式 import `../Cards/src/core/files.ts`。
10. **雲端**：合併前在這個分支、合併後在 `main` 各開一個新的雲端 session（只讀），開場訊息：`tools`、`apps/Cards` 是「`npm ci` 完成」，`apps/Capture`、`apps/Mindboard` 是「沒有相依，跳過」，Node 24、`core.hooksPath` 是 `.githooks`。兩次的訊息寫進〈結果〉。
11. **GitHub 上實際跑**：分支 push 後 plan 是「全部」、每個 job 都成功；探針分支對這個分支開 draft PR，只改 `apps/Cards/src/` 一個檔 → 只有 cards；只改 `apps/Mindboard/AGENTS.md` → 只有 mindboard。合併後 Progress board 的 run 成功、`roadmap.html` 有最上層與 Cards 兩份 roadmap（現在只有 Cards 有自己的 roadmap），Cards 的列前綴是「Cards｜」，連到 GitHub 的網址是 `blob/main/apps/Cards/…`。
12. **外掛 ID、版號與 tag**：`apps/Cards/manifest.json` 的 `id` 是 `essence-cards`、`version` 和 `<基準>` 相同；每個 tag 指的 commit 不變。
13. **兩個平台**：Windows 本機跑第 3、8、9 項；Linux 由 CI 跑第 3 項。只在一邊跑的測試寫明。
14. §5 的三項都做了，結果寫進〈結果〉。
15. 合併前 L2：新的 Fable 5.2 high 子代理（見〈本機或雲端〉的審查者），請求照 code-quality 的 `review.md` 寫在 `docs/tasks/rename-plugins-to-apps-review.md`。
16. **建置產物照 Linux 的規則被忽略**：常駐測試（兩個平台都跑）對真的 `.gitignore` 跑 `git -c core.ignorecase=false check-ignore -q apps/Cards/main.js`（`styles.css` 同），之後 `.gitignore` 寫錯大小寫 Windows 本機就會紅；CI 的 cards job 在 `apps/Cards/` `npm run build` 之後 `git status --porcelain` 是空的（§3 第 7 點）。
17. **大小寫的防線也擋父資料夾與組字串**（暫存 repo）：追蹤 `Apps/Cards/x.md`、`plugins/cards/a.ts` 各被 §3 第 2 點擋下；`tools/` 的程式寫 `` `apps/${code}` ``、文件的行內程式碼寫 `npm --prefix apps/cards run check` 各被 §3 第 3 點擋下；`apps/Portal/src/a.ts`（表上只有文件）被 §3 第 1 點擋下；例外表上的檔拿掉允許的寫法、或被刪 → 報錯。
18. **凍結清單改完仍對得到檔**：`tools/legacy-status-docs.json` 改完沒有 `plugins/` 開頭的路徑，每個路徑都是 `git ls-files` 裡的檔（大小寫相同），條數和改之前相同；`tools/` 的 `npm run check`（含 `roadmap-sync --check`）通過，舊格式狀態行的文件照舊被放過。

## 平台事實

送 L2 之前跑完；跑不了的標待驗，寫進審查請求的〈驗證方式〉。

| 假設 | 探針與環境 | 結果 |
|---|---|---|
| 改連結的腳本照資料夾對照能一次改完、可以重跑 | 2026-11-21 雲端暫存複本（Linux），`8a03736` 上 git mv 三個資料夾後跑 | 成立：715 個、0 個要人看，再跑 `--check` 是 0 |
| 規則檔的路徑不進嵌入內容與雜湊 | 讀程式：`plugins/cards/tools/build.mjs` 的 `embedRules`（只用 `file.path` 讀檔與報錯） | 對 `CARD_RULES` 成立（2026-11-21 讀程式）；驗收第 4 項實測。路徑字串會進 `main.js`（`RULE_SUBJECTS` 在執行時被 import），開工前查核 R1 在暫存 clone 重現，§5 第 1 項換回舊字串再比 |
| 路徑字串在執行時不影響行為 | 讀程式：`file.path` 只在 `rules.ts:54-59` 的錯誤訊息；`ruleText` 只有 `tools/build.mjs:91` 呼叫；`ai-cards.ts`、`deepen.ts` 用 `RULE_SUBJECTS` 的 `key`、`subject`、`pick` | 成立（2026-11-21 讀程式） |
| TypeScript（5.9.3）的 `forceConsistentCasingInFileNames` 預設是 true，在 Windows 擋得住大小寫不對的 import | Windows、`tsc`，一個 import 只差大小寫的樣本 | `tools/` 成立（開工前查核，TS1149）；`apps/Cards/` 待驗（驗收第 8 項） |
| `check-docs` 在 Windows 把只差大小寫的連結當成找不到 | Windows、暫存 clone 放 `../apps/cards/AGENTS.md` 與 `../Apps/Cards/AGENTS.md` | 成立（開工前查核，工作樹與 `--staged` 都擋）；只限相對連結，行內程式碼與網址不查（§3 第 3 點補） |
| `git mv plugins/cards apps/Cards` 在 Windows 一步完成（不是只改大小寫，不用兩段式） | Windows、Git 2.52、暫存 clone | 成立，兩個前提：先 `mkdir apps`（沒有時 `No such file or directory`）；沒有程序的工作目錄在 `plugins/cards` 底下（有時 `Permission denied`、一個檔都不動）。`node_modules` 跟著搬（開工前查核） |
| Windows 上索引裡還沒有的資料夾，`git add` 照打的大小寫記；已有的資料夾底下的新檔對齊索引的大小寫 | Windows、Git 2.52、暫存 clone | 成立（開工前查核）：`apps/portal/…` 記成小寫，改回要兩段式 `git mv`；`git status -- apps/cards/…`、`git ls-tree`、`git show <rev>:<path>` 在 Windows 也分大小寫 |
| Windows 上 `.gitignore` 不分大小寫、Linux 分 | `git check-ignore` 與 `-c core.ignorecase=false` | 成立（開工前查核，模擬 Linux）；驗收第 16 項在 Linux 實測 |
| 舊版的對照表定位錯誤不靠 repo 裡的現行路徑 | 讀 D-155 的定位工具 | 成立（開工前查核讀程式：`locate.ts:45-63` 只讀 `.local/releases/<版本>/` 的 `main.js.map` 與 `sourcesContent`） |
| `cloud-setup.mjs` 在新的雲端 session 對 `apps/Cards` 跑得了 `npm ci` | 驗收第 10 項 | 待驗 |

## 技術債

- 這件不延後測試：跨版本外掛根、分派表、CI 與雲端 hook 都是第 1 類，合併前做完。

## 結果

2026-11-21，Claude（Opus 5.5 high）在 worktree `D:\程式開發\Essence-apps` 施工，commit：`e565135`（準備）、`bc0e51d`（合併 `main`）、`9b7486b`（搬家）、`c704d40`（防線）、`555f814`（現行文件）。

**和規格不同的地方**（前四點寫進[合併前 L2 請求](rename-plugins-to-apps-review.md)〈實作者自己選的做法〉，其餘在審查紀錄各輪的處理表）：

- 搬家的 commit 沒另開探針分支，直接推到這個分支（push 的 CI 一樣跑七個 job）。
- `tools/tests/ci-gate.test.ts` 不在例外表：它的情境要照現在的分派表才成立，整份換成 `apps/`。例外表是十二列：歷史路徑九列（規格列的十個扣掉 `ci-gate.test.ts`）、故意寫錯的樣本兩列（`app-imports.test.ts`、`check-docs.test.ts`；`plugin-root.test.ts` 已經在歷史路徑那一列）、檢查本身一列。
- Portal 放在 `tools/apps.ts` 另一張 `DOCS_ONLY` 表；分派表第 4 條帶上它、效果是空的（只跑共用檢查），不加新條目。
- hook 的乾淨 clone 測試改成從工作樹複製每一個追蹤的檔：共用檢查現在掃全部文字檔。
- 例外表每列寫明放行哪幾條規則（`plugins`、`大小寫`、`組字串`），沒放行的照擋；組字串只查程式與設定，不查 Markdown、JSON（L2 第一輪 R3、R4）。
- §3 第 1 點要共用工具「都從表取」只做到 `dispatch.ts`、`check-app-imports.ts`、`roadmap-board.ts` 讀資料夾的地方；`check-docs.ts` 的幾張表、`roadmap-board.ts` 的 `RELEASE_ROADMAP`、`progress-board-data.ts` 的網址還是寫死的 `apps/Cards`。大小寫都對，也由共用檢查看住；之後動到這幾處時再改成 `FOLDERS.cards`（L2 第一輪 R6）。
- `e565135` 順帶把 `tools/tests/quality.test.ts` 整檔從 CRLF 換成 LF（`-w` 之後只有 4 行真的改動）；之後別的分支改這個檔，合併會整檔衝突（L2 第一輪 R10）。

**已知的限制**：L2 兩輪這次不修的發現記在[最上層 backlog〈已知的限制〉](../backlog.md#已知的限制)（共用檢查的漏報、誤報、只查程式的組字串、訊息）與 [Cards 的 backlog〈已知的限制〉](../../apps/Cards/docs/backlog.md#已知的限制)（`build.test.ts` 的 sourcemap 測試與磁碟配置）。

**驗收**（Windows 11、Node 24.13、Git 2.52；Linux 是 CI）：

1. `git ls-files plugins` 是 0 行；`apps/` 底下是 `Capture`、`Cards`、`Mindboard`。
2. `9b7486b` 的 `plugins/` 底下 615 個檔都是 `R`，沒有 D 加 A；`252d85d..555f814` 在 `src/` 的內容差異只有 `rules.ts` 的 5 個路徑字串與一行註解。`git log --follow`（L2 抽查）：Cards 20 檔、Capture 6 檔、Mindboard 5 檔都接得到 `plugins/` 的舊路徑，Cards 20 檔都接到第二步之前的根目錄路徑（Capture、Mindboard 整個資料夾只有 6、5 個檔，全部抽了）。
3. `tools/`：`npm run check` 通過，`npm run self-check` 238 個測試（237 通過、1 個 Windows 跳過），`<基準>` 228 個；多的 10 個是 8 個「D-218 …」開頭的測試與分派表的「只改 apps/Capture/a.ts」「新增 apps/Portal/docs/backlog.md」。`apps/Cards/`：`npm run check` 2906 個測試全過，`<基準>` 2904 個；多的 2 個是準備 commit 加的「D-218 Cards 根的大小寫打錯（只在 Windows）…」「D-218 root 的大小寫打錯（只在 Windows）…」；`npm run build` 通過。Linux CI 在 `9b7486b` 七個 job 都成功，`555f814` 見 PR。
4. `embedRules()` 在 `252d85d` 與 `555f814` 的結果 `deepEqual`（五科，路徑不在內容裡，不用換回）；`ai-rules.test.ts` 照常通過。
5. 改連結的腳本 `--check` 是「要改 0 個連結」。寬 pattern（`plugins` 接 `/`、`\/`、引號或 `*`，正規化後）：vault 與 Obsidian 的寫法 101 行、紀錄 883 行、例外表上的檔 118 行、現行文件寫歷史的列 8 行（`apps/Cards/docs/roadmap.md` 64、65 行〈已完成〉、`docs/agents/token-usage.md` 13 行（同一行另寫了 D-218 之後的路徑）、`docs/architecture.md` 83 行（第二步的經過）、`docs/backlog.md` 55、59 行（D-208 第一、二步的經過）與 57 行、`docs/roadmap.md` 19 行（這件自己的列）），剩 3 行都是 Obsidian 的 `plugins` 資料夾（`experiments/plugin/` 兩行、`rename-local-folder.test.mjs` 一行 Codex 設定的 `[plugins`），實際殘留 0。`PLUGINS` 已改 `APPS`。`node tools/check-docs.ts` 通過。
6. `plugin-root.test.ts` 與讀舊版的測試在 Cards 的 `npm run check` 裡通過；§5 第 3 項見下。
7. `dispatch.test.ts` 全部換成新路徑通過，另加 `apps/Capture/a.ts`、`apps/Portal/docs/backlog.md`、`apps/Other/a.ts` 三例；`app-imports.test.ts` 的「D-218 §3 第 1、2 點」「驗收第 7、17 項」兩個測試涵蓋 `apps/Portal/package.json`、`apps/Other/a.ts`、`plugins/cards/a.ts` 與 `apps/portal/…` 的兩段式改法。
8. 四種在 Windows 都擋下：前兩種是 `app-imports.test.ts`「§3 第 3 點」的測試、第三種是 `check-docs.test.ts`「驗收第 8 項」、第四種在暫存 clone 的 `apps/Cards/src/core/` 寫 `import './Files.ts'` 跑 `tsc`，報 TS1149（只差大小寫）。
9. `app-imports.test.ts` 的 §6 測試：第二步 A7 的兩例換成新路徑照樣擋，另加 `apps/Capture/src/a.ts` import `../../Cards/src/core/files.ts`。
10. 合併前：2026-11-22 使用者在這個分支（`f681828`）開新的雲端 session（只讀），目視確認開場訊息和預期相同（沒有貼原文）：`tools`、`apps/Cards` 是「`npm ci` 完成」，`apps/Capture`、`apps/Mindboard` 是「沒有相依，跳過」，Node 24、`core.hooksPath` 是 `.githooks`。合併後在 `main` 的那一次：待合併。
11. 分支 push 的 run 七個 job 都成功（第 3 項）。探針分支各對這個分支開 draft PR，看 `pull_request` 的 run：只改 `apps/Mindboard/AGENTS.md` 的 #31（run 44917630810）只有 mindboard 跑、成功，tools、cards、capture 跳過，gate 成功；只改 `apps/Cards/src/` 一個檔的 #32（run 44919385585）只有 cards 跑、成功（含建置後的 `git status --porcelain`），tools、capture、mindboard 跳過，gate 成功。兩個 PR 看完關掉、探針分支刪掉。（探針分支自己的 push run 和 `main` 比，帶著整個改名，所以是全部跑。）合併後的 Pages：`ac39302` 的 Progress board run 44928491250 成功；`roadmap.html` 有最上層與 Cards 兩份 roadmap，Cards 的列前綴是「Cards｜」，連到 GitHub 的網址是 `blob/main/apps/Cards/…`，沒有 `blob/main/plugins/`。
12. `apps/Cards/manifest.json` 的 `id` 是 `essence-cards`、`version` 是 `0.6.0`，和 `252d85d` 相同；這次沒有新增或移動 tag。
13. Windows 跑第 3、8、9 項（上面）；Linux 由 CI 跑第 3 項。`plugin-root.test.ts`、`build.test.ts` 的大寫路徑測試只在 Windows 跑（Linux 那個資料夾不存在）。
14. §5：
    - 建置：`252d85d` 與 `555f814` 各在 `core.autocrlf=false` 的 clone 用固定版本建置正式版與 dev 版。head 的 `main.js` 恰好 5 個 `apps/Cards/docs/card-rules/`、0 個 `plugins/cards/`；換回之後兩版都和 `<基準>` 逐位元組相同，`styles.css` 逐位元組相同。
    - 測試 vault：先留存外掛資料夾的三個檔與雜湊；從 repo 外的 clone（`555f814`）登錄測試 vault、`install-vault --dev`；Obsidian 原本沒開，從檔案總管開，開發命令 `version` 的結果檔 `plugin` 是 `0.6.0+555f814e`（Obsidian 1.15.1）。之後放回留存的三個檔，雜湊相同。Obsidian 要使用者關掉（我這邊的權限關不了）；放回的檔下次開 Obsidian 才載入。
    - 跨版本：同一份測試 vault 的備份（2026-11-20 的 `0.6.0+4536a17`），`v0.6.0`（根目錄的外掛根）對 `555f814`、`8a03736`（`plugins/cards`）對 `555f814` 都跑完，差異 0 項。
15. 合併前 L2 見[審查紀錄](rename-plugins-to-apps-review.md)。
16. `app-imports.test.ts`「驗收第 16 項」在 Windows 用 `core.ignorecase=false` 跑 `check-ignore` 通過；CI 的 cards job 在建置後加了一步：`git status --porcelain` 不是空的就失敗（L2 前補，結果見 PR 的 CI）。
17. 同第 7 項的兩個測試，加上「§3 第 3 點：紀錄不查；例外表上的檔…」。
18. `tools/legacy-status-docs.json` 224 條（和 `<基準>` 相同），0 條 `plugins/` 開頭，每條都在 `git ls-files` 裡；`tools/` 的 `npm run check` 通過。

延後的測試：無
