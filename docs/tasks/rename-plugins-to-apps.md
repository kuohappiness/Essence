# `plugins/` 改名 `apps/`，資料夾首字大寫（D-218，給 Claude，本機執行）

狀態：規劃中｜下一步：開工前請 Codex 查核這份說明｜等誰：Codex

遵守 repo 根目錄的 `AGENTS.md`。建議模型與推理等級：**Opus、高**；寫規格、改完後的一致性檢查（〈驗收〉第 6～9 項）用 xhigh。這件改到 pre-commit、CI、分派表、跨版本比較的工具與雲端的開場 hook，合併前做 L2（[quality.md〈高風險範圍〉](../agents/quality.md#高風險範圍要做-l2)）。

依據：[D-218](../decisions.md#d-218-plugins-改名-apps每個軟體的資料夾首字大寫)（修改 [D-208](../decisions.md#d-208-三個外掛在同一個-repo-開發每個外掛有自己的資料夾)）；做法沿用 [第二步任務說明](one-repo-step-2.md)（改連結的腳本、跨版本的外掛根、雲端的開場訊息），那份的〈結果〉記了踩過的坑，開工前讀 A、B 的進度兩節。

基準：`main` 的 `8a03736`（2026-11-21）。開工時換成當下的 `main`，重算下面的數字。

**不在這一步**：外掛 ID（`essence-cards`）、vault 裡的 `.obsidian/plugins/essence-cards/`、套件名稱（`package.json` 的 `name`）、tag、任何寫進 vault 的格式、產品程式的行為；建 `apps/Portal/`（D-218 第 1 點，寫第一行程式前才建）；`experiments/plugin/`（試作外掛自己的資料夾名，不是這一層）。

## 和「不做」比較（D-153、D-177）

見 [D-218](../decisions.md#d-218-plugins-改名-apps每個軟體的資料夾首字大寫)〈理由〉〈曾考慮的做法〉。這裡只補做的成本（2026-11-21 在 `8a03736` 的暫存複本量的）：

- 搬 614 個追蹤檔（`plugins/` 底下全部）。
- 改連結的腳本照 `plugins/cards=apps/Cards plugins/capture=apps/Capture plugins/mindboard=apps/Mindboard` 跑，要改 715 個連結、0 個要人看；改完再跑 `--check` 是 0。
- 連結以外還寫著 `plugins/` 的（去掉 `essence-cards` 那些 vault 路徑）約 1,100 處：675 處在 `docs/tasks/`、56 處在討論稿（紀錄，不改）；其餘在共用工具與它們的測試、Cards 的工具與測試、CI、雲端 hook、試作場與現行文件，見 §2、§4。

## 停手時段

開工前和使用者約：從搬家的 commit 到合併，別的分支與 `main` 不改 `plugins/`、`tools/`、`.githooks/`、`.github/workflows/`、`.claude/`、`.agents/skills/`、`.gitignore`。開工時先列出還沒合併、而且分岔點已經有 `plugins/cards/` 的分支（第二步 A 之後開的），有的話先問使用者順序。最後一次 rebase 之後重跑改連結的腳本與〈驗收〉第 2～5、7 項。

## 本機或雲端（[quality.md〈本機或雲端〉](../agents/quality.md#本機或雲端)）

整件在本機做（要 Codex 查核與 L2、Windows 的大小寫與 junction、測試 vault）。

| 在哪裡 | 做什麼 |
|---|---|
| 本機（一定） | 施工、開工前查核與 L2、§5 的演練、Windows 的檢查、合併後主資料夾與本機記憶的整理 |
| 雲端（一定） | 合併前在這個分支、合併後在 `main` 各開一個**新的**雲端 session，看 `cloud-setup.mjs` 的開場訊息（〈驗收〉第 10 項），只讀不改 |
| GitHub | CI（含探針 PR）、PR 上的 Codex 自動審查（不取代 L2） |

## §1 commit 的分法

D-208 第 8 點：路徑搬動與工具調整分開 commit。每個 commit 都經過 pre-commit，不用 `--no-verify`。

1. **準備**（搬之前，`plugins/` 照舊）：
   - Cards 的跨版本外掛根加第三種：`plugins/cards/tools/git.ts` 的 `MANIFESTS` 加 `'apps/Cards/manifest.json': 'apps/Cards'`，`PluginRoot` 加 `'apps/Cards'`；`根目錄與 plugins/cards/ 都有` 這類訊息改成列出找到的每個路徑。`plugin-root.test.ts` 加「只有 `apps/Cards/` 的」「`plugins/cards/` 與 `apps/Cards/` 都有」「`apps/cards/`（大小寫不對）的」三例（最後一例當成沒有，丟「都沒有」的錯）。
   - 共用工具裡軟體代號對資料夾的表（§3 第 1 點），先照舊值填 `plugins/…`，把 `dispatch.ts` 的 `` `plugins/${target}` `` 這類字串組法換成查表。
2. **搬家**（一個 commit）：`git mv plugins/cards apps/Cards`、`git mv plugins/capture apps/Capture`、`git mv plugins/mindboard apps/Mindboard`，加上讓這個 commit 的 hook 過得了的最少修改：§2 的路徑常數、§3 的表、`.gitignore`、`check.yml`、`progress-board.yml`、`cloud-setup.mjs` 與它們的測試、§4 的連結（腳本）。commit 之前在新位置 `npm ci`（`apps/Cards/`；`tools/` 若改了相依也重裝），hook 的副本借得到 `node_modules`。
3. **防線**：§3 第 2～4 點的機械檢查與測試。
4. **現行文件**：§4 的文字。

## §2 程式要改的

先 `git grep -n -E "plugins"` 列全，逐處判斷；下面是 2026-11-21 列出的，開工時重列。**不能整批取代**：`plugins/essence-cards`、`.obsidian/plugins/` 是 vault 裡的路徑，一個字都不改（`apps/Cards/src/core/backup/manifest.ts`、`tools/install.ts`、`backup.ts`、`update-vault.ts`、`vault-io.ts` 與多個測試都有）。

| 位置 | 要改的 |
|---|---|
| `tools/dispatch.ts` | `CARDS`、`folder()` 改查表；第 4 條（Capture、Mindboard 的資料夾）、第 5 條（`plugins/` 底下不認得的路徑）改成 `apps/`；`plugins/*/package.json` 的 scripts 入口 |
| `tools/check-plugin-imports.ts` | 改名 `tools/check-app-imports.ts`（測試檔跟著改名、`package.json` 的 script 與文件跟著改）；`PLUGIN` 等規則與訊息改成 `apps/<軟體>/`；§3 第 2、3 點加在這裡 |
| `tools/check-docs.ts` | `DEFERRED_BACKLOGS`、`PLUGIN_ROADMAP`、狀態目錄與任務對 backlog 的規則、`BEFORE_D195_DIRS`、`OLD_PLACE`（舊位置的 `tasks/`、討論稿）、`EXCEPTIONS` 與 `FROZEN_RULES` 的檔名（只改鍵，值是照搬家前位置解的相對路徑，同一層深度不用改）、`rulesHere` 的 manifest 路徑 |
| `tools/roadmap-board.ts`、`tools/progress-board-data.ts` | `PLUGIN_ROADMAP`、`RELEASE_ROADMAP`、`readdirSync(join(root, 'plugins'))`、指到 GitHub 的網址 |
| `tools/ci-gate.ts`、`tools/eslint.config.js` | 註解 |
| `tools/tests/` | `check-docs`、`dispatch`、`hooks`、`plugin-imports`、`ci-gate`、`roadmap-board` 的路徑與預期訊息；暫存 repo 建資料夾的地方用 §3 的表，不用小寫代號組 |
| `.github/workflows/check.yml` | `working-directory`、`cache-dependency-path`（job 的 id 照舊小寫） |
| `.github/workflows/progress-board.yml` | `paths` 的 `plugins/*/docs/…` |
| `.claude/hooks/cloud-setup.mjs` | `DIRS`；清單測試 |
| `.gitignore` | `/plugins/cards/main.js`、`/plugins/cards/styles.css` |
| `apps/Cards/src/core/ai/rules.ts` | 規則檔路徑（`apps/Cards/docs/card-rules/…`）。路徑不進嵌入內容與雜湊（`tools/build.mjs` 的 `embedRules` 只讀檔），`embedRules()` 的結果要和改名前 `deepEqual`（〈驗收〉第 4 項） |
| `apps/Cards/tools/` | `git.ts`（§1 第 1 點）、`build.mjs`、`cli-path.ts` 的註解與說明；`npm --prefix plugins/cards` 的用法說明 |
| `apps/Cards/tests/` | `plugin-root`、`compare-versions`、`cli-path`、`build`、`pick-old-version`、`ai-rules`、`ai-add-old-version`、`helpers/layout.ts` 的路徑與註解 |
| `experiments/` | `t4/` 的設定 JSON 與腳本、`source-reading/`、`tools/deepen-threshold.ts`、`plugin/` 裡寫到 Cards 規則檔或程式的路徑；`tools/move-links.test.mjs` 的範例照舊（它測的是第二步的搬法） |

建置的對照表（`main.js.map`）的 `sources` 從 `plugins/cards/…` 變成 `apps/Cards/…`；舊版的對照表照它當時的路徑，定位錯誤時用的是對照表裡的 `sourcesContent`，不受影響（開工時讀 D-155 的定位工具確認，結果寫進〈平台事實〉）。

## §3 大小寫的防線（D-218 第 4 點）

Windows 不分大小寫、Linux 分：在 Windows 寫成 `apps/cards` 本機照樣能跑，推上去 CI 才壞，或更糟，CI 沒有測到的路徑在雲端 session 才壞。

1. **一張表**：共用工具裡軟體代號 → 資料夾（`cards → apps/Cards` 等）只寫一處（例如 `tools/apps.ts`），`dispatch.ts`、`check-docs.ts`、`roadmap-board.ts`、`cloud-setup.mjs`（它不 import `tools/`，就照抄並用測試比對兩份相同）與測試都從這裡取。測試：表上每個資料夾都在 `git ls-files` 裡、大小寫完全相同；`apps/` 底下每個追蹤的資料夾都在表上。
2. **擋 `plugins/` 再出現**：追蹤的檔路徑以 `plugins/` 開頭就報錯，訊息寫「改名後放 `apps/<軟體>/`（D-218）」。
3. **擋大小寫不符的寫死路徑**：在程式（`tools/`、`apps/*/src`、`apps/*/tools`、`apps/*/tests`、`.claude/hooks/`、`.githooks/`、`.github/workflows/`、`experiments/` 的 `.ts`、`.mjs`、`.js`、`.json`、`.yml`）裡找 `apps/<名稱>`，名稱和表上某個資料夾只差大小寫就報錯；寫死的 `plugins/(cards|capture|mindboard)`（不分大小寫）也報錯。`plugins/essence-cards` 不算。
   - **歷史路徑的例外**：跨版本的工具要認得改名前的外掛根（D-218〈代價〉），所以舊路徑在這幾處是對的：`apps/Cards/tools/git.ts` 的 `MANIFESTS`、它的測試（`plugin-root`、`compare-versions` 等讀舊版的測試）、`experiments/tools/move-links.mjs` 與 `move-links.test.mjs`（第二步搬家的範例）。例外逐檔列在檢查裡（不用資料夾萬用字元），表上的檔不存在或已經沒有舊路徑就報錯，例外才不會越積越多；之後要加例外，要在那一列寫理由。
4. **TypeScript 的 import**：`apps/Cards/tsconfig.json`、`tools/tsconfig.json` 明寫 `"forceConsistentCasingInFileNames": true`（TypeScript 5.0 起預設就是 true，明寫是為了不靠預設）；Windows 上的探針見〈平台事實〉。
5. **Markdown 連結**：`check-docs` 照 `git ls-files` 比對，大小寫不同算找不到；Windows 上的探針見〈平台事實〉。改連結的腳本會把 `apps/Cards/docs/card-rules/trials.md` 裡的 `../../../capture/docs/backlog.md` 改成 `../../../Capture/…`（只有大小寫不同的一例），驗收時看到它。

## §4 連結與文件

- **連結用腳本改**：搬家的 commit 裡跑 `node experiments/tools/move-links.mjs plugins/cards=apps/Cards plugins/capture=apps/Capture plugins/mindboard=apps/Mindboard`（git mv 之後、commit 之前，在 repo 根目錄）。指到這個 repo `blob/main/plugins/…` 的網址也會換。第二次執行不改任何字，rebase 之後再跑。
- **製卡規則送給 AI 的部分**：`apps/Cards/docs/card-rules/` 三份規則的標記以下，連結是照第二步搬家前的位置寫的相對路徑；`card-rules/` 的深度不變，那幾條不用改，`FROZEN_RULES` 只改檔名的鍵。〈驗收〉第 4 項確認送出的內容沒變。
- **已完成的任務、討論稿、決定與 archive**：反引號裡的 `plugins/…` 是當時的紀錄，不改；連結照腳本改（D-218 第 5 點）。
- **現行文件**（文字裡的 `plugins/…` 改成 `apps/<軟體>/…`，「外掛的資料夾」這類說法照 D-218 第 2 點改成「軟體」，講外掛才有的事照舊）：
  - `AGENTS.md`：〈開始工作前〉的 `plugins/<外掛>/AGENTS.md`、〈Code Review Rules〉的 `plugins/cards/docs/syntax.md`；只改路徑，不加規則（不用過五關）。
  - `docs/architecture.md` §9：圖改成 `apps/`，加一行 `Portal/`（「入口網站，寫第一行程式前才建，D-218」）；〈每一類放哪裡〉〈新文件放哪裡〉〈commit 與 CI 怎麼檢查〉；標題的錨點 `9-repo-結構-d-208` 不改（很多地方連它）。
  - `docs/agents/quality.md`：〈本機或雲端〉`cloud-setup` 的資料夾清單、〈檢查指令〉的安裝、`npm --prefix`、`check-plugin-imports` 的名字與其他路徑。
  - `apps/Cards/AGENTS.md`、`apps/Capture/AGENTS.md`、`apps/Mindboard/AGENTS.md`、各自的 `README.md`。
  - `.claude/skills/` 與 `.agents/skills/` 的 `essence-decision`（兩份一起改，skill 一致性檢查會比）；其他 skill 有寫到的照改。
  - `docs/roadmap.md`、`docs/backlog.md`、`apps/*/docs/roadmap.md`、`apps/*/docs/backlog.md` 現行的段落與表格；`docs/agents/token-usage.md`。
- **狀態板**：`docs/roadmap.md`〈現在在哪裡〉跨外掛的工作加一列，入口連到這份說明（D-217 起狀態從這份的狀態行讀）。

## §5 演練（本機）

搬的只是資料夾，產品程式一行不改，所以不重做第二步的整套演練，只驗三件會因為路徑而壞的事：

1. **建置相同**：照第二步驗收 A3 的做法，固定建置版本，在 `<基準>` 與要合併的 head 各建置正式版與 dev 版，`main.js`、`styles.css` 逐位元組相同（`main.js` 的註解若有路徑，先確認是相對 Cards 的根）。
2. **測試 vault 的開發版**：在隔離的 clone（`git clone --no-local` 到 repo 外）照第二步 §A7 第 4 項：先留存測試 vault 外掛資料夾的三個檔與雜湊，用改名後的程式 `install-vault -- <測試 vault> --dev`，完全關掉再打開 Windows 版 Obsidian，「版本」命令的 `BUILD` 是這次的建置；做完放回留存的三個檔、核對雜湊。
3. **跨版本**：`compare-versions` 比 `v0.6.0`（根目錄的外掛根）對改名後的 head（`apps/Cards`），以及 `8a03736`（`plugins/cards`）對 head，都跑得完、差異只有預期的。

iPhone 不用測：外掛 ID、建置產物與 vault 格式都沒變（第 1 項證明產物相同）。

## 驗收

`<基準>` 是開工時的 `main`，`<搬家>` 是 §1 第 2 個 commit，`<head>` 是要合併的 head。

1. `git ls-files plugins` 是空的；`git ls-files apps | cut -d/ -f2 | sort -u` 恰好是 `Cards`、`Capture`、`Mindboard`。
2. **都是改名**：`git diff -M --name-status <搬家>^ <搬家>` 裡 `plugins/` 底下的每個檔都是一行 `R`，沒有 D 加 A；`git diff -M <搬家>^ <head> -- plugins/cards/src apps/Cards/src` 除了改名沒有內容差異（產品程式一行都沒改，§2 的 `rules.ts` 例外：只有路徑字串）。在有完整歷史的 checkout，抽每個資料夾至少 20 個檔跑 `git log --follow`，接得到 `plugins/` 的舊路徑與第二步之前的根目錄路徑。
3. **檢查都過、不是空跑**：`apps/Cards/` 的 `npm run check`、`npm run build`，`tools/` 的 `npm run check` 與 `npm run self-check` 都通過，測試數和 `<基準>` 相同或多（多的是這次加的，列出名字）。
4. **送出的規則不變**：`embedRules()` 在 `<基準>` 與 `<head>` 的結果 `deepEqual`；`ai-rules.test.ts` 挑到的規則檔數大於 0。
5. **沒有殘留**：改連結的腳本 `--check` 是 0；`git grep -n -i -E "plugins/(cards|capture|mindboard)"` 只出現在 §4 列為紀錄的檔（決定、`docs/tasks/`、討論稿、archive）與 §3 第 3 點的歷史路徑例外，清單附在〈結果〉；`node tools/check-docs.ts` 通過。
6. **跨版本的外掛根**：§1 第 1 點的測試通過；讀 `v0.2.0`～`v0.5.0` 的舊版測試照常通過；§5 第 3 項跑完。
7. **分派表**：`tools/tests/dispatch.test.ts` 把第一步、第二步的每一例換成新路徑照樣通過，另加：只改 `apps/Capture/a.ts` → 只有 Capture；新增 `apps/Portal/a.ts`（表上沒有）→ 全部；新增 `plugins/cards/a.ts` → §3 第 2 點擋下；例外表上的檔拿掉舊路徑、或表上的檔被刪 → 報錯。
8. **大小寫的防線**（在暫存 repo 或 stage 後再拿掉，樣本不 commit）：`tools/` 裡寫 `'apps/cards/manifest.json'`、`check.yml` 寫 `working-directory: apps/cards`、Markdown 連到 `../apps/cards/AGENTS.md`、`apps/Cards/src/` 裡 import 大小寫不對的檔，四種各自被擋下（前兩種是 §3 第 3 點、第三種是 check-docs、第四種是 TypeScript）；在 **Windows** 本機也都擋下。
9. **外掛邊界**：第二步驗收 A7 的兩例換成新路徑照樣擋下，再加 `apps/Capture/` 的程式 import `../Cards/src/core/files.ts`。
10. **雲端**：合併前在這個分支、合併後在 `main` 各開一個新的雲端 session（只讀），開場訊息：`tools`、`apps/Cards` 是「`npm ci` 完成」，`apps/Capture`、`apps/Mindboard` 是「沒有相依，跳過」，Node 24、`core.hooksPath` 是 `.githooks`。兩次的訊息寫進〈結果〉。
11. **GitHub 上實際跑**：分支 push 後 plan 是「全部」、每個 job 都成功；探針分支對這個分支開 draft PR，只改 `apps/Cards/src/` 一個檔 → 只有 cards；只改 `apps/Mindboard/AGENTS.md` → 只有 mindboard。合併後 Progress board 的 run 成功、`roadmap.html` 有三份 roadmap。
12. **外掛 ID、版號與 tag**：`apps/Cards/manifest.json` 的 `id` 是 `essence-cards`、`version` 和 `<基準>` 相同；每個 tag 指的 commit 不變。
13. **兩個平台**：Windows 本機跑第 3、8、9 項；Linux 由 CI 跑第 3 項。只在一邊跑的測試寫明。
14. §5 的三項都做了，結果寫進〈結果〉。
15. 合併前 L2：新的 Codex session，請求照 code-quality 的 `review.md` 寫在 `docs/tasks/rename-plugins-to-apps-review.md`。

## 平台事實

送 L2 之前跑完；跑不了的標待驗，寫進審查請求的〈驗證方式〉。

| 假設 | 探針與環境 | 結果 |
|---|---|---|
| 改連結的腳本照資料夾對照能一次改完、可以重跑 | 2026-11-21 雲端暫存複本（Linux），`8a03736` 上 git mv 三個資料夾後跑 | 成立：715 個、0 個要人看，再跑 `--check` 是 0 |
| 規則檔的路徑不進嵌入內容與雜湊 | 讀程式：`plugins/cards/tools/build.mjs` 的 `embedRules`（只用 `file.path` 讀檔與報錯） | 成立（2026-11-21 讀程式）；驗收第 4 項實測 |
| TypeScript 6 的 `forceConsistentCasingInFileNames` 預設是 true，在 Windows 擋得住大小寫不對的 import | Windows、`apps/Cards/` 的 `tsc`，一個 import 只差大小寫的樣本 | 待驗 |
| `check-docs` 在 Windows 把只差大小寫的連結當成找不到 | Windows 跑驗收第 8 項的 Markdown 樣本 | 待驗 |
| `git mv plugins/cards apps/Cards` 在 Windows 一步完成（不是只改大小寫，不用兩段式） | Windows、Git 2.52 | 待驗（父資料夾不同，預期一步） |
| 舊版的對照表定位錯誤不靠 repo 裡的現行路徑 | 讀 D-155 的定位工具 | 待驗 |
| `cloud-setup.mjs` 在新的雲端 session 對 `apps/Cards` 跑得了 `npm ci` | 驗收第 10 項 | 待驗 |

## 技術債

- 這件不延後測試：跨版本外掛根、分派表、CI 與雲端 hook 都是第 1 類，合併前做完。

## 結果

延後的測試：（實作後填）
