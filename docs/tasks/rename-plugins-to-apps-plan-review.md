# `plugins/` 改名 `apps/`：開工前查核（給 Fable 5.2 high）

狀態：已結案｜完成：開工前查核兩輪後雙方一致，兩輪的發現都改進任務說明｜等誰：—

遵守 repo 根目錄的 `AGENTS.md`。Codex 額度用完（約 2026-11-23 重置），使用者 2026-11-21 指定這件的查核由 **Fable 5.2 high** 做：本機 session 每一輪開一個沒參與實作的新子代理，報告原文附在這份檔案的那一輪底下，Claude 核對後改任務說明（[任務說明〈本機或雲端〉](rename-plugins-to-apps.md#本機或雲端qualitymd本機或雲端)）。

[任務說明](rename-plugins-to-apps.md)把 [D-218](../decisions.md#d-218-plugins-改名-apps每個軟體的資料夾首字大寫) 寫成可以施工的規格。D-218 已定案，這次**不重議要不要改名、要不要首字大寫**；只查任務說明在 D-218 沒寫死的地方選得對不對、有沒有漏、驗收做不做得到。程式還沒動。

## 審查對象

- repo：`D:\程式開發\Essence`（主資料夾），分支 `claude/project-thread-sdo9aa`。
- 規格基準：`main` 的 `8a03736dd80fe6d09925618dc29e41d618d297d7`（也是分支的共同祖先）。
- 待審：分支上加入這份請求的 commit（`git log -1 --format=%H -- docs/tasks/rename-plugins-to-apps-plan-review.md`），hash 寫進報告。分支上目前只有文件的 commit。

## 規格與優先順序

- 任務說明全文（`docs/tasks/rename-plugins-to-apps.md`）。
- D-218 全文、D-208 第 1、5、8、9、10 點：`node experiments/tools/decisions-index.mjs D-218 D-208`。
- 第二步的做法與踩過的坑：`docs/tasks/one-repo-step-2.md` 的〈結果〉（〈A 的進度〉〈B 的進度〉兩節）。
- 規格之間衝突時列成問題，不挑容易通過的那份。

## 查什麼

1. **規格矛盾**：任務說明內部、和 D-218／D-208 之間有沒有互相矛盾的地方（例如 §1 的 commit 分法與 §2、§3 的內容放在哪個 commit；Portal「只有文件」在分派表、§3 第 1 點與驗收第 7 項的說法是否一致；停手時段與合併後步驟）。
2. **漏列的路徑**（這次最重要）：自己跑 `git grep -n -i -E "plugins"`（或更細的 pattern），和 §2 的表與 §4 的文件清單逐一比對：哪些寫到 `plugins/…` 的程式、設定、測試、hook、workflow、skill、現行文件沒列到；哪些列了但其實是 vault 路徑（`.obsidian/plugins/`、`plugins/essence-cards`）或紀錄，不該改。也看不含 `plugins` 字樣、但靠目錄結構假設的地方（例如 `readdirSync(join(root, 'plugins'))`、`plugins/*` 萬用字元、以 `/` 切出第二段當代號、knip／ESLint／tsconfig 的路徑、`package.json` 的 scripts、`npm --prefix`）。
3. **大小寫的邊界**：§3 的防線（一張表、擋 `plugins/` 再出現、擋大小寫不符的寫死路徑、TypeScript、Markdown）有沒有漏洞：哪些寫法會溜過（例如 `path.join('apps', 'cards')`、模板字串、反斜線路徑、`APPS/Cards`、URL 裡的 `blob/main/apps/cards`、YAML 的 `paths`、`.gitignore`）；哪些合法的寫法會被誤擋（例如 vault 路徑、`experiments/plugin/`、小寫的軟體代號本身、npm 套件名）。Windows 不分大小寫、Linux 分，請找「Windows 本機過、CI 或雲端才壞」或反過來的組合。
4. **跨版本外掛根的邊界**：§1 第 1 點三種外掛根（根目錄、`plugins/cards`、`apps/Cards`）的判定：兩種以上同時存在、`apps/cards` 小寫、`apps/Cards/` 存在但 manifest 不是 Cards 的、tag 在搬家前後；`compare-versions`、`update-vault`、`install-vault`、讀舊版的測試（`ai-add-old-version`、`pick-old-version`）還有沒有假設 Cards 在某個固定路徑的地方。請讀 `plugins/cards/tools/git.ts` 與它的呼叫端核對。
5. **commit 順序**：每個 commit 之後 pre-commit、CI、Pages 都要能跑；搬家的 commit 列的「最少修改」夠不夠讓 hook 過（hook 的副本在搬家的 commit 用哪一份工具、哪一份 `node_modules`）；`git log --follow` 是否仍接得到。
6. **驗收**：每一項是不是程式判斷得了；哪一項做不到或證明不了它要證明的事；有沒有該有而沒列的。

## 驗證方式

- Windows 11、Git 2.52、Node 24；`tools/` 與 `plugins/cards/` 的 `npm run check`。
- 可以在 repo 外的暫存 clone（`git clone --no-local`）重現，不改主資料夾、不 commit、不 push。
- 〈平台事實〉表裡標待驗的，能用探針分辨的請跑；跑不了的寫待驗證。

## 回報與權限

只審查，不改 repo 裡的檔案。照 `.claude/skills/code-quality/review.md`〈回報格式〉：依嚴重程度排序，每項寫哪一軸、觸發條件、預期／實際、影響、發生機率（真實路徑會不會發生）、位置、證據（已重現／靜態推斷／待驗證）、建議處理，並標嚴重度（擋開工／應該改／可以不改）。逐題（上面 1～6）寫同意或發現。頭尾寫待審 commit、審查範圍、跑了什麼、沒驗的項目與原因。

## 第 1 輪

待審 `4dff0bd`。審查者：Fable 5.2 high 子代理（2026-11-21）。

### 報告原文

- 待審 commit：`4dff0bdadf98cd4a97ca21459358b8e85bc1467c`（分支 `claude/project-thread-sdo9aa`；規格基準與共同祖先 `8a03736dd80fe6d09925618dc29e41d618d297d7`）。
- 審查範圍：`docs/tasks/rename-plugins-to-apps.md` 全文、D-218 與 D-208、`docs/tasks/one-repo-step-2.md`〈結果〉，以及任務說明會動到的程式（`tools/`、`.githooks/`、`.github/workflows/`、`.claude/hooks/`、`plugins/cards/tools`、`tests`、`src/core/ai/rules.ts`、`experiments/`）。程式還沒動，這份只查規格。
- 主資料夾沒有改任何檔（結束時 `git status --short` 0 行）。重現都在 session 的暫存資料夾 `review1\` 底下的暫存 clone（`c2`，`core.autocrlf=false`）與探針。
- 結論：1 項擋開工（R1），9 項應該改，4 項可以不改。改連結的腳本、614 個改名、三種外掛根的判定方式本身我都重現過，沒有問題。

#### 擋開工

**R1　§5 第 1 項「`main.js` 逐位元組相同」做不到，「iPhone 不用測」的依據要改寫**

- 軸：規格（驗收證明不了它要證明的事）。第 6 題、第 1 題。
- 位置：任務說明 §5 第 1 項、§5 最後一行「iPhone 不用測…（第 1 項證明產物相同）」、驗收第 14 項、§2 `rules.ts` 那一列、〈平台事實〉第 2 列。
- 觸發條件：照 §2 把 `src/core/ai/rules.ts` 的 5 個規則檔路徑改成 `apps/Cards/docs/card-rules/…`，再照 §5 第 1 項比 `<基準>` 與 `<head>` 的建置。
- 預期／實際：規格預期 `main.js` 相同。實際上 `RULE_SUBJECTS`（含 `path` 字串）被 `src/obsidian/ai-cards.ts`、`deepen.ts` 在執行時 import，整張表打包進 `main.js`。「路徑不進嵌入內容與雜湊」只對 `CARD_RULES` 成立。
- 證據（已重現）：
  - 在 `4dff0bd` 用固定版本 `9.9.9+probe00` 建置，`main.js` 是 1,803,695 bytes，裡面有 5 個 `plugins/cards/docs/card-rules/*.md`。
  - 暫存 clone 搬家並改 `rules.ts` 那 5 個字串後同樣建置，`main.js` 是 1,803,680 bytes（少 15），`cmp` 在第 513555 個字元開始不同。
  - 把新版的 `apps/Cards/docs/card-rules/` 換回 `plugins/cards/docs/card-rules/` 之後，兩份 `main.js` 逐位元組相同。
  - 已部署的 `.local/releases/0.4.0`～`0.6.0` 的 `main.js` 也都有 `docs/card-rules/*.md` 字串。
- 影響：驗收第 14 項照字面一定不過。「iPhone 不用測」現在靠一個不成立的前提。
- 發生機率：一定發生。
- 建議處理（開工前改規格）：§5 第 1 項改成「`<head>` 的 `main.js` 把這 5 個路徑字串換回舊值後，和 `<基準>` 逐位元組相同；`styles.css` 相同」（實跑過，成立）；補一句依據：`path` 在執行時只出現在 `ruleText` 的錯誤訊息（`rules.ts:54-59`，建置時用）；「iPhone 不用測」改用上面兩點當依據，或請使用者決定要不要把一次 iPhone 載入併進下一次實機測試。
- 附帶：兩邊要在同一種換行設定的 checkout 建置。主資料夾是 `core.autocrlf=true`（CSS 取出成 CRLF），和 LF 的 clone 比，`styles.css` 是 64,770 對 63,989 bytes，去掉 CR 後相同（已重現）。

#### 應該改

**R2　驗收第 5 項的 grep 證明不了「沒有殘留」**

- 軸：規格。第 2、6 題。
- 觸發條件：`git grep -i -E "plugins/(cards|capture|mindboard)"` 找不到反斜線跳脫的正規式、字串組與萬用字元。
- 證據（已重現，`git grep`）：`tools/check-docs.ts:24,30,37,38,358`（`/^plugins\/([^/]+)\/…/`、`` `plugins/${plugin}/docs/backlog.md` ``、`OLD_PLACE`）；`tools/check-plugin-imports.ts:21,46,48,60,85,103,147`；`tools/dispatch.ts:25,73,173`；`tools/roadmap-board.ts:17,327`（`readdirSync(join(root, 'plugins'))`）；`.github/workflows/progress-board.yml:11,13`（`plugins/*/docs/…`）；`tools/tests/dispatch.test.ts:279,280,444-447`；`tools/tests/hooks.test.ts:100-101`（`join(repo, 'plugins', plugin)`）；`tools/tests/plugin-imports.test.ts:79`；測試裡跳脫過的 `plugins\/mindboard\/…`（`ci-gate.test.ts:46,249,254,314`、`hooks.test.ts:172`、`roadmap-board.test.ts:133-167`）。
- 影響：工具的通用正規式和它在暫存 repo 的測試如果一起留在 `plugins/`，兩邊都綠，真的 repo 的 `apps/…` 卻沒被查到。例如 `check-docs.ts:30` 漏改時，`apps/*/docs/tasks/` 的狀態行不再檢查，也不報錯。
- 發生機率：§2 的表有點到這幾支，漏改的機率不高；但驗收擋不住，漏了是安靜的。
- §2 另外漏列兩處（改名 `check-plugin-imports.ts` 會動到）：`tools/hooks.ts:17` 的 `SHARED_CHECKS`；`tools/tests/quality.test.ts:73,255,332`。
- 建議處理：驗收第 5 項改成列出程式與設定裡全部的 `plugins`（不分大小寫），扣掉明列的 vault 寫法（`plugins/essence-`、`.obsidian/plugins`、`community-plugins`、esbuild 的 `plugins:`、Obsidian 的 `app.plugins`）與 §3 的例外檔，剩下要是 0；§2 補上 `hooks.ts` 與 `quality.test.ts`。

**R3　新的對照表是工具的新相依，複製工具到暫存 repo 的測試會壞**

- 軸：規格（§1 第 1 點、§2 沒列）。第 5 題。
- 觸發條件：§1 第 1 個 commit 讓 `dispatch.ts` import 新的表（例如 `tools/apps.ts`）。
- 證據：已重現：暫存 clone 裡加 `tools/apps.ts`、讓 `dispatch.ts` import 它，跑 `tools/tests/quality.test.ts`。原本 7 個全過；改後 3 個暫存 repo（`essence-hook-check`、`essence-hook-docs`、`essence-hook-merge`）的 hook 都丟 `ERR_MODULE_NOT_FOUND …\tools\apps.ts`，原因是 `quality.test.ts:73,255,332` 只複製寫死的幾支工具。靜態推斷：`tools/tests/hooks.test.ts:80-92` 的同步只補「clone 沒有的檔」與每一份 `.md`，其他已存在的檔留 HEAD 的版本，只有 `COPIED`（:34-38）會換成要驗的版本；搬家的 commit 時 clone 裡的 `apps.ts` 還是舊值，`dispatch.ts` 卻是新的，測試會失敗。
- 影響：第 1、2 個 commit 的 pre-commit 過不了（大聲失敗）。另一面：不在 `COPIED` 的工具之後再改，`hooks.test.ts` 驗到的是 HEAD 的舊版，這是靜默的。
- 發生機率：照規格做一定碰到。
- 建議處理：§1 第 1 點與 §2 寫明 `quality.test.ts` 三處與 `hooks.test.ts` 的 `COPIED` 都要帶上表；更穩的做法是 `COPIED` 改成「追蹤的 `tools/*.ts`、`*.mjs` 全部」，不手列。

**R4　還沒合併的 `claude/workflow-impl-68afda` 會讓 §2 的清單不完整**

- 軸：規格（停手時段）。第 2 題。
- 證據（已重現，`git diff 8a03736 claude/workflow-impl-68afda`）：分岔點同樣是 `8a03736`，領先 20 個 commit、53 個檔，在 L2 第二輪；改了 `tools/check-docs.ts`、`hooks.ts`、`roadmap-board.ts`、`package.json`、`.github/workflows/progress-board.yml`；新增 `tools/roadmap-sync.ts`（`:16,297-301` 有 `plugins\/[^/]+` 正規式）、`tools/decisions.ts`（4 處）、`tools/legacy-status-docs.json`（193 行含 `plugins`）；另外改了 `plugins/cards/docs` 11 個檔。
- 影響：它先合併，§2 少這幾個檔，其中的通用正規式正好是 R2 那一類驗收找不到的；改名先合併，它的新檔和改名在文字上不衝突，合併後安靜地對不到 `apps/…`；第二步〈平台事實〉也記過，GitHub 對跨搬家的 PR 常判成有衝突，要先在本機合。
- 發生機率：分支已經存在，一定要處理。
- 建議處理：〈停手時段〉點名這個分支，建議讓它先合併、改名最後做；「開工時重列」明寫要用 R2 的寬 pattern 重列。

**R5　§3 第 3 點掃的範圍有洞**

- 軸：規格（D-218 第 4 點）。第 3 題。
- 會溜過的寫法：
  1. `.gitignore`（已重現）：寫成 `/apps/cards/main.js` 時，Windows 上 `git check-ignore` 命中 `apps/Cards/main.js`；加 `-c core.ignorecase=false`（模擬 Linux）就不命中。本機全過，雲端建置後產物變成未追蹤。現有測試不比真的 `.gitignore`，驗收也沒有「建置後 `git status` 是空的」。
  2. 副檔名與位置（靜態推斷）：清單沒有 `.tsx`、`.jsonc`、沒有副檔名的 `.githooks/*`、`.claude/settings.json`，也沒有每個軟體根目錄的設定檔（`apps/Cards/package.json`、`eslint.config.js`、`knip.jsonc`、`tsconfig.json`）。
  3. 父資料夾的大小寫（靜態推斷）：`Apps/Cards`、`APPS/Cards` 只比 `apps/` 後面那一段，抓不到；追蹤檔的第一段寫成 `Apps/` 三條都不擋。
  4. 字串組（靜態推斷）：`join(root, 'apps', code)`、`` `apps/${target}` ``；`hooks.test.ts:100` 現在就是 `join(repo, 'plugins', plugin)`，照樣換成 `'apps'` 就是「Windows 過、Linux 的 CI 才壞」。
  5. 給 git 的路徑（已重現）：Windows 上 `git status --porcelain -- apps/cards/docs/card-rules` 回空的；`git ls-tree`、`git show <rev>:<path>` 也分大小寫。所以「Windows 寫錯也能跑」對 git 的 pathspec 不成立，會安靜地當成沒有改動。`experiments/t4/screen.mjs:78` 的乾淨檢查就是這種寫法。
  6. Markdown 裡的指令與自己 repo 的網址（已重現）：`../apps/cards/AGENTS.md` 與 `../Apps/Cards/AGENTS.md` 都被 `check-docs` 擋下；`https://github.com/kuohappiness/Essence/blob/main/apps/cards/AGENTS.md` 與行內程式碼 `npm --prefix apps/cards run check` 都不擋。現行文件目前沒有這種網址；`quality.md` 的指令有十幾處。
- 發生機率：第 1、4 項在這次施工就可能發生；其餘偏低，但補起來便宜。
- 建議處理：掃的範圍改成「追蹤的文字檔全部，扣掉逐一列出的紀錄資料夾與例外檔」；比對時 `apps` 這一段也不分大小寫，再要求整段恰好等於表上的寫法；表以外的檔出現 `apps/${`、單獨的 `'apps'` 就報錯；追蹤檔的第一段不分大小寫是 `apps` 或 `plugins`、卻不是恰好 `apps` 就報錯；驗收加一項：Linux 建置後 `git status --porcelain` 是空的。

**R6　§3 第 3 點會擋到規格自己要的樣本**

- 軸：規格（內部矛盾）。第 1、3 題。
- 觸發條件與位置：§1 第 1 點要 `plugin-root.test.ts` 加「`apps/cards/`（大小寫不對）」一例；驗收第 7、8 項的防線要有自己的回歸測試，`tools/tests/` 裡必然有 `plugins/cards/a.ts`、`apps/cards/…`；`tools/tests/ci-gate.test.ts:224-254` 是第二步「搬家前開的分支」的歷史情境。
- 預期／實際：§3 的例外只講「舊路徑」、列了 `git.ts`、`plugin-root`、`compare-versions`「等」、`move-links`；大小寫不對的樣本和防線自己的測試沒有歸屬，「等讀舊版的測試」也不是逐檔。
- 證據：靜態推斷。
- 影響：第 3 個 commit 一加防線就擋到第 1 個 commit 的測試，施工時要臨場決定。
- 建議處理：例外表分兩類寫清楚（歷史路徑、故意寫錯的樣本），現在就逐檔列完。`ai-add-old-version.test.ts:39`、`pick-old-version.test.ts:43`、`tests/helpers/layout.ts:2`、`build.test.ts:227` 的註解要不要改，也一起定。

**R7　Portal「只有文件」幾處對不上，大小寫最容易在第一份文件出錯**

1. 只看 `package.json`（靜態推斷）：先寫 `apps/Portal/src/a.ts` 或 `index.html` 而沒有 `package.json`，照表只跑共用檢查，程式安靜地沒人檢查。建議改成「標只有文件的資料夾出現不是文件的檔就報錯」。
2. `cloud-setup.mjs` 的清單（靜態推斷）：`tools/tests/cloud-setup.test.ts:38` 要它等於 `check.yml` 每個 job 安裝的資料夾，驗收第 10 項的開場訊息也只有四個資料夾；照抄含 Portal 的表會多一句「找不到 package.json」。要寫明清單是表上有程式的那幾列。
3. 「報錯」由誰報沒寫：`dispatch.ts` 現在只有 `blocked` 一種擋法，`hooks.ts:138`、`dispatch.ts:362` 的訊息寫死「是子模組」；加第二種理由會動到 `hooks.ts`、`ci-gate.ts`，§2 沒列。
4. Windows 上第一份文件的大小寫照打的字進索引（已重現）：索引裡還沒有 `apps/Portal` 時，`git add -- apps/portal/docs/zz3.md` 記成 `apps/portal/…`；已經有的資料夾才會自動對齊。改回來時 `git mv apps/portal apps/Portal` 失敗（`Invalid argument`），要兩段式。
- 發生機率：第 4 點發生在 Portal 第一份文件，那是合併後馬上要做的事，機率中等。
- 建議處理：第 4 點的錯誤訊息直接寫兩段式的修法；「`apps/` 底下每個追蹤的資料夾都在表上」放進每次 commit 都跑的共用檢查，不只放測試。

**R8　合併後的步驟沒有列**

- 軸：規格（和 D-218〈代價〉第 3 點「任務說明列在合併後的步驟」不一致）。
- 要列的事：主資料夾拉下來後，`plugins/cards/` 會留下 `node_modules/`，以及已經不被忽略的 `main.js`、`styles.css`；主資料夾與每個 worktree 在 `apps/Cards/` 重跑 `npm ci`；本機記憶、核准的指令（`npm --prefix plugins/cards …`）、Codex 的設定。
- `git mv` 的前提（已重現，Windows、Git 2.52）：沒有 `apps/` 資料夾時 `git mv plugins/cards apps/Cards` 失敗（`No such file or directory`），要先 `mkdir apps`；有程序的工作目錄在 `plugins/cards` 底下時失敗（`Permission denied`），一個檔都不動；程序結束後一步完成，`node_modules` 跟著搬。主資料夾有好幾個 session 共用，停手時段要含「不在 `plugins/` 底下開終端機、跑檢查或 commit」。
- 建議處理：加一節〈合併後〉，〈平台事實〉那一列改成成立並寫上兩個前提。

**R9　驗收第 11 項「`roadmap.html` 有三份 roadmap」對不到現況**

- 證據（已重現）：`git ls-files 'plugins/*/docs/roadmap.md'` 只有 Cards 一份；加上最上層是兩份。
- 建議處理：改成「有最上層與 Cards 兩份，Cards 的列前綴是『Cards｜』，連到 GitHub 的網址是 `blob/main/apps/Cards/…`」。

**R10　Windows 用錯大小寫的工作目錄跑 Cards 的工具，行為沒有定義**

- 觸發條件：在 Windows 打 `npm --prefix apps/cards run …` 或 `cd apps/cards`。
- 證據（已重現）：`npm_config_local_prefix` 是 `…\apps\cards`；`process.cwd()`、`import.meta.url` 都照打的字；同一個位置 `git rev-parse --show-prefix` 回 `apps/Cards/`。
- 影響（靜態推斷）：`plugin-root.test.ts:66-70` 用 `relative(top, cards)`，會拿 `apps/cards` 去比 `pluginRoot` 回的 `apps/Cards`，假失敗；`tests/helpers/layout.ts:13` 的 `CARDS_DIR`、`build.mjs:128` 寫進 `main.js.map` 的 `sources` 會帶錯的大小寫。`main.js` 不受影響。
- 發生機率：中，只在 Windows。
- 建議處理（擇一）：Cards 的工具入口先比 `process.cwd()` 與 `realpathSync.native`，不同就停下來說正確寫法；或這兩處改用 git 的 `--show-prefix` 取資料夾。

#### 可以不改

- **R11　commit 的分法有幾件沒寫放哪裡**：`check-plugin-imports.ts` 改名、§3 第 1 點的兩個測試與 Portal 的分派規則、`experiments/` 的路徑、例外表。另外，第二步那樣單獨把搬家的 commit 推一個探針分支看 Linux 的 CI（第二步驗收第 13 項）這次沒列。
- **R12　文字與數字**：〈平台事實〉寫「TypeScript 6」，實際裝的是 5.9.3；§3 第 5 點說只差大小寫的連結「只有一例」，實際是 14 個（Capture backlog 3、Mindboard backlog 5、Cards 6），腳本都會改；D-218 第 5 點寫「開工前 Codex 查核」，任務說明改由 Fable 5.2 high，D-218 沒有補註；§2 列了 `experiments/plugin/` 要改，但它的程式裡只有 vault 路徑（`src/main.ts:118`、`tools/install-vault.mjs:9`），不能改，要改的只有兩份 `.md` 的連結，腳本會處理。
- **R13　`plugin-root` 第三例的寫法**：「`apps/cards` 當成沒有」在 Windows 做得出來（已重現：案例的檔先 `git add`，樹裡是 `apps/cards/manifest.json`）；順序反過來會把 manifest 對齊成 `apps/Cards`（靜態推斷），只在 Windows 失敗。測試旁寫一句順序的理由即可。
- **R14　Markdown 裡指到自己 repo 的 `blob/main/apps/cards/…` 不查大小寫**：現行文件沒有這種網址，等出現再加。

#### 逐題

1. 規格矛盾：R1、R6、R7 第 2 點、R8、R11、R12。Portal 在三處的方向一致，缺的是 R7。
2. 漏列的路徑：§2 漏 `tools/hooks.ts:17`、`tools/tests/quality.test.ts`（R2、R3），以及還沒合併的分支帶來的檔（R4）。§4 的現行文件清單齊全：搬家並跑完腳本後，清單外的 Markdown 只剩 `docs/plans/ai-and-ecosystem.md` 三個 Obsidian 社群外掛的網址，不該改。vault 路徑沒有被列成要改，只有 `experiments/plugin/` 那一列多列了（R12）。
3. 大小寫的邊界：R5、R6、R7 第 4 點、R10。成立的部分：Windows 上 git 會把已有資料夾底下的新檔對齊成索引裡的大小寫；`check-docs` 在 Windows 擋得住相對連結；`tools/` 的 `tsc`（5.9.3，沒有明寫旗標）對 `import './Dispatch.ts'` 報 TS1149，同一行用 Node 直接跑在 Windows 照樣成功，所以沒被型別檢查的 `.mjs` 只靠 Linux 的 CI。
4. 跨版本外掛根：同意做法。`git ls-tree --full-tree`、`git show <rev>:<path>` 在 Windows 也分大小寫（已重現）。`compare-versions.ts:53-59`、`ai-add-old-version.test.ts:42`、`pick-old-version.test.ts:46`、`compare-versions.test.ts:172` 都經過 `pluginRoot`；`update-vault.ts:71`、`install.ts:45` 用 git 的 toplevel 與共用目錄，和資料夾名無關；`build.mjs` 的 `RULES_FROM_ROOT = '../..'` 深度不變；兩個以上同時存在、id 不對、不是 JSON 都落在原本「不猜、丟錯」的路徑。要補的只有 R10 與 R13。
5. commit 順序：搬家的 commit 用的是工作樹的 `tools/hooks.ts`（新版）與 `<root>/apps/Cards/node_modules`（`git mv` 整個資料夾搬時會跟著走）；614 個檔都是 R，最低 R095，沒有 D 加 A（已重現，含 715 個連結的修改）；會卡的是 R3，以及 R8 的 `git mv` 前提。
6. 驗收：R1、R2、R9 做不到或證明不了。該有而沒列的：Linux 建置後 `git status` 乾淨（R5）、合併後主資料夾的整理（R8）。

#### 平台事實的探針結果（Windows 11、Git 2.52、Node 24.13）

| 假設 | 結果 |
|---|---|
| 改連結的腳本一次改完、可以重跑 | 成立（Windows 也是 715 個、0 個要人看，再跑 `--check` 是 0；規則檔送給 AI 的部分沒被改） |
| 規則檔的路徑不進嵌入內容與雜湊 | 對 `CARD_RULES` 成立；但路徑字串進 `main.js`（R1） |
| TypeScript 在 Windows 擋大小寫不對的 import | `tools/` 成立（TS 5.9.3，TS1149）；Cards 的 `tsconfig` 沒跑 |
| `check-docs` 在 Windows 擋只差大小寫的連結 | 成立（工作樹與 `--staged`），只限相對連結 |
| `git mv` 一步完成 | 成立，前提是先 `mkdir apps`、沒有程序占用（R8） |
| 舊版對照表定位不靠 repo 的現行路徑 | 成立（靜態：`locate.ts:45-63` 只讀 `.local/releases/<版本>/` 的 `main.js.map` 與 `sourcesContent`） |
| `cloud-setup.mjs` 在新的雲端 session 跑得了 | 待驗證（開不了雲端 session） |

#### 沒驗的項目與原因

- Cards 的 `npm run check` 與 `tools/` 的完整 `self-check`：沒跑（程式還沒改，暫存 clone 沒裝 Cards 的相依）；`tools/` 只跑了 `quality.test.ts`（原樣 7 個全過）。
- R3 的 `hooks.test.ts` 那一半、R5 第 2～4 項、R6、R7 第 1～3 點、R10 的影響、R13 的反順序：靜態推斷。
- Linux 上的實際行為：沒有 Linux 環境，只用 `-c core.ignorecase=false` 模擬 `.gitignore` 那一項。
- GitHub 的 CI、Pages、探針 PR、雲端 session 的開場訊息：這一輪不 push，也開不了雲端。
- §5 第 2、3 項：照指示不動 Obsidian 與 vault；`compare-versions` 只讀程式。
- `claude/workflow-impl-68afda` 和改名實際合併的結果：只比對了它改的檔，沒試合併。
- 〈和「不做」比較〉的 1,100、675、56：沒逐一重算；搬家並跑完腳本後量到還寫著 `plugins/` 的有 1,190 行，量級相符。

### Claude 的回應

全部接受，照下面改任務說明（R14 不改）。我核對了 R1、R3、R10 引用的程式：`rules.ts:35-42` 的 `path` 確實是執行時的資料表，`hooks.test.ts:34` 的 `COPIED` 是手列，`layout.ts:13` 與 `build.mjs:128` 都用照打的字算出的路徑。

| 項目 | 改法 |
|---|---|
| R1 | §5 第 1 項改成審查者的比法（換回 5 個路徑字串後逐位元組相同，兩邊同一種換行設定）；「iPhone 不用測」改用這個比法與 `path` 在執行時只用於錯誤訊息當依據；〈平台事實〉第 2 列改寫 |
| R2 | 驗收第 5 項改成寬 pattern 減去明列的 vault 寫法與例外檔要是 0；§2 補 `hooks.ts` 的 `SHARED_CHECKS`、`quality.test.ts` |
| R3 | `hooks.test.ts` 的 `COPIED` 改成追蹤的 `tools/*.ts`、`*.mjs`、`*.json` 全部；`quality.test.ts` 三處跟著帶上表；放在 §1 第 1 個 commit |
| R4 | 〈停手時段〉點名 `claude/workflow-impl-68afda`，建議它先合併，已在 2026-11-21 問使用者；開工時用寬 pattern 重列 |
| R5 | §3 第 3 點改成掃追蹤的文字檔全部，扣掉逐一列出的紀錄資料夾與例外檔；`apps` 這一段也不分大小寫比；表以外的檔出現 `apps/${`、`'apps'` 這類組法就報；追蹤檔第一段不分大小寫是 `apps`／`plugins` 卻不是恰好 `apps` 就報；驗收加「Linux 建置後 `git status --porcelain` 是空的」 |
| R6 | 例外表分「歷史路徑」與「故意寫錯的樣本」兩類，逐檔列在 §3 第 3 點；註解寫的是現況的改，寫的是歷史的留、檔進例外表 |
| R7 | 「只有文件」改成出現 `*.md` 與圖檔以外的檔就報；`cloud-setup` 的清單是表上有程式的列；擋法由新的共用檢查（`check-app-imports` 的同一支）報，不經 `dispatch` 的 `blocked`；Windows 第一份文件大小寫錯的訊息寫兩段式改法；「`apps/` 底下每個追蹤的資料夾都在表上」放進每次 commit 的共用檢查 |
| R8 | 加〈合併後〉；施工在 repo 外的新 worktree（`D:\程式開發\Essence-apps`），主資料夾留給其他 session；`git mv` 的兩個前提寫進 §1 與〈平台事實〉 |
| R9 | 驗收第 11 項改成兩份 |
| R10 | `tests/helpers/layout.ts` 與 `build.mjs` 取 Cards 的資料夾先過 `realpathSync.native`（Windows 回磁碟上的真實大小寫），加一個從小寫工作目錄跑的測試（只在 Windows） |
| R11 | §1 寫明每件放哪個 commit；搬家的 commit 推一個探針分支看 Linux 的 CI |
| R12 | 改成 TypeScript 5.9.3、14 個連結；D-218 第 5 點補一句審查者（使用者 2026-11-21）；§2 拿掉 `experiments/plugin/` |
| R13 | 測試旁寫順序的理由（§1 第 1 點） |
| R14 | 不改：現行文件沒有這種網址 |

## 第 2 輪

待審：分支上「第 1 輪的回應」那個 commit（`git log -1 --format=%H -- docs/tasks/rename-plugins-to-apps.md`）。只查：

1. 上面回應表的每一項，任務說明是不是真的照改了、改得對不對（`git diff 4dff0bd -- docs/tasks/rename-plugins-to-apps.md docs/decisions.md`）。
2. 修改帶出的新問題，特別是 §3 第 3 點新的掃描範圍：會不會誤擋現行的合法寫法（請在暫存 clone 用寬 pattern 估一下，搬家並跑完改連結的腳本之後，扣掉紀錄與例外檔，剩下會被報的有哪些）、例外表的兩類是否列齊；§3 第 1 點「只有文件」的判斷與 `check-app-imports` 的分工；〈合併後〉有沒有漏。
3. 不重審第 1 輪已同意、沒改的部分。

### 報告原文

- 待審 commit：`dbd1632878acd8a95358e1a82e76aeb6dccaa0ac`（和第 1 輪的 `4dff0bd` 比，改了任務說明、`docs/decisions.md` 的 D-218 第 5 點與審查請求檔）。審查者：Fable 5.2 high 子代理（2026-11-21），沒參與實作，也沒看過第 1 輪的過程。
- 審查範圍：只做〈第 2 輪〉列的三件事。讀了任務說明全文、`git diff 4dff0bd dbd1632`、D-218 與 D-208，以及修正會動到的程式（`tools/check-plugin-imports.ts`、`dispatch.ts`、`hooks.ts`、`tests/hooks.test.ts`、`tests/quality.test.ts`、`roadmap-board.ts`、`check-docs.ts`、`check.yml`、`progress-board.yml`、`cloud-setup.mjs`、Cards 的 `tools/build.mjs`、`tests/helpers/layout.ts`、`tests/plugin-root.test.ts`、`src/core/ai/rules.ts`）。
- 主資料夾沒有改任何檔（結束時 `git status --short` 0 行、HEAD 仍是 `dbd1632`）。重現都在 session 暫存資料夾的 `review2\` 底下：暫存 clone `c1`（`core.autocrlf=false`，`tools/` 用 `npm ci --ignore-scripts`）、探針 repo `p1`，以及三支只讀的估算腳本 `scan.mjs`、`wide.mjs`、`sim.mjs`。
- 結論：沒有擋開工的項目。5 項應該改（R15～R19，都是把規格再寫清楚一兩句，不改做法），4 項可以不改。第 1 輪回應表的 14 項，任務說明都照改了；其中 R10 少一處、R2 與 R5 的新寫法各帶出一個照字面做不到或沒定義的地方。

#### 跑了什麼

- 暫存 clone 上 `mkdir apps`、三次 `git mv`、跑改連結的腳本：614 個追蹤檔都到 `apps/`、改 715 個連結、再跑 `--check` 是 0；只差大小寫的連結 14 個（和 §3 第 5 點相符）。搬完之後空的 `plugins/` 資料夾還留在磁碟上。
- `scan.mjs`：照 §3 第 3 點的字面掃搬家後、還沒改程式的樹。`sim.mjs`：在記憶體裡把非紀錄、非例外檔的 `plugins/<軟體>` 機械式換成 `apps/<軟體>`，再掃一次，估「施工完還會被報的」。`wide.mjs`：驗收第 5 項的寬 pattern 扣掉各類之後剩什麼。
- Windows 探針：小寫工作目錄的 `realpathSync.native`、`path.relative`、`git rev-parse`；索引裡已有 `apps/Cards/` 時 `git add -- Apps/Cards/x.md` 與 `git update-index --add --cacheinfo`。

#### 第 1 件：回應表逐項核對

| 項目 | 任務說明有沒有照改 | 改得對不對 |
|---|---|---|
| R1 | 有 | 對。`RuleFile.path` 只出現在 `rules.ts:54-59` 的錯誤訊息，`ruleText` 只有 `build.mjs:91` 呼叫，`src/` 其他地方沒有 `card-rules` 或 `plugins/cards` 字串，`buildPlugin` 的對照表一律外部檔，所以 dev 版也是恰好 5 個 |
| R2 | 有 | 方向對；「剩下是 0」照字面做不到，見 R17 |
| R3 | 有 | 對。`COPIED` 改成追蹤的 `tools/*.ts`、`*.mjs`、`*.json` 之後新相依都會換成要驗的版本；`quality.test.ts:73,255,332` 三處是手列，帶上表即可 |
| R4 | 有 | 對。現況：`claude/workflow-impl-68afda` 領先 `main` 24 個 commit（第 1 輪時 20 個），還在動 |
| R5 | 有 | 大方向對；新的掃描有三處沒定義或會報到自己，見 R15、R16 |
| R6 | 有 | 「歷史路徑」那一類對照程式是齊的；「故意寫錯的樣本」少檢查本身，另有兩處文字對不上，見 R16、R21 |
| R7 | 有 | 對。分派表只決定「Portal 只跑共用檢查」，擋法由每次都跑的 `check-app-imports.ts` 報；它用 `git ls-files -s` 與一次 `git cat-file --batch` 讀索引，掃全部 936 個追蹤檔不會慢 |
| R8 | 有 | 對，漏三件小事，見 R19 |
| R9 | 有 | 對。`roadmap-board.ts:170-171` 的前綴取資料夾名首字大寫，改名後仍是「Cards｜」 |
| R10 | 有 | `realpathSync.native` 在 Windows 回真實大小寫，已重現；但第 1 輪點名會假失敗的那一處沒列進去，見 R18 |
| R11 | 有 | 對。`check.yml` 是七個 job |
| R12 | 有 | 對 |
| R13 | 有 | 對 |
| R14 | 不改 | 同意；§3 第 3 點新的規則已經會找到 `blob/main/apps/cards` |

#### 第 2 件：新的掃描範圍估出來的數字（已重現）

- 搬家並跑完腳本、還沒改程式時，「Markdown 以外寫死 `plugins/<軟體>` 或 `plugins\/`」命中 46 檔 311 行。13 個例外檔占 204 行；其餘 33 檔 107 行全部是 §2 已經列要改的，沒有一行是必須留下的。
- 例外表的「歷史路徑」一類對照現況是齊的；後四個的註解確實在寫歷史（例如 `ai-add-old-version.test.ts:39`）。
- 機械式改名之後照字面再掃：Markdown 0 行被報；大小寫那條，分隔符號讀成「恰好一個」是 0 行，讀成「一個以上」會報 2 檔 5 行（12 處）大小寫正確的跳脫正規式（R15）；`plugins\/` 那條：2 檔 2 行 vault 路徑的跳脫正規式被誤報（R17 第 3 點）；字串組那條：6 檔 10 行，4 行照規格改成查表（`dispatch.ts:25`、`roadmap-board.ts:327`、`hooks.test.ts:100-101`），另外 3 檔 6 行「查表」不是對的改法（R16）。

#### 應該改

**R15（R5 修正引入）　§3 第 3 點第 1 條的分隔符號與「名稱」的範圍沒有定義**

- 軸：規格。觸發條件：測試與工具裡的正規式把斜線跳脫，改名後是 `apps\/Mindboard`、`apps\/Cards`。
- 預期／實際：大小寫正確的要放行、大小寫錯的要擋。照字面有兩種讀法，都不對：分隔符號是「一個以上的 `/` 或 `\`」時，`apps\/Mindboard` 不恰好等於 `apps/Mindboard`，被報（`tools/tests/hooks.test.ts:172`、`tools/tests/roadmap-board.test.ts:133,134,160,167`，都不在例外表）；分隔符號是「恰好一個」時，`/^apps\/cards\//` 這種大小寫錯的跳脫正規式整個溜過。
- 另一個沒寫的：「名稱」是只認表上的四個，還是 `apps/` 後面任何字。讀成後者，`apps/<軟體>/`、`apps/*/docs/…`、`apps\/([^/]+)`、測試的 `apps/Other/a.ts` 都會被報（約 40 處）。
- 影響：第 3 個 commit 一加檢查就要臨場決定；選錯讀法會留下安靜的洞。發生機率：一定碰到。證據：已重現（`sim.mjs` 兩種讀法各跑一次）。
- 建議處理：比對前先把 `\/`、`\\`、`\` 都當成 `/`，再只比 `apps` 與名稱兩段的大小寫；明寫只認表上的名稱，`apps/` 後面不是表上名稱的由第 1 點管。

**R16（R5、R6 修正引入）　檢查會報到自己；「要改成查表」對三個檔不適用；字串組的寫法漏一種**

1. 檢查自己（靜態推斷）：`tools/check-app-imports.ts` 要寫出 `plugins\/`、`plugins/(cards|capture|mindboard)` 這些 pattern，自己就是被擋的檔；例外表只列了它的測試。
2. 通用規則不是「代號對資料夾」（已重現）：`check-plugin-imports.ts:46,48,60,103` 的 `` `plugins/${plugin}` `` 與 `inside(target, 'plugins')`、`check-docs.ts:38` 的 `` `plugins/${plugin}/docs/backlog.md` ``，`plugin` 是從追蹤的路徑抓出來的實際資料夾名，大小寫本來就對；改成查表不對，該直接抓整段前綴，例如 `/^(apps\/[^/]+)\//`。`plugins/cards/tests/cli-path.test.ts:32` 的 `join(top, 'plugins', 'cards')`：Cards 的程式不能 import `tools/` 的表，只能寫整段字面 `'apps/Cards'`。
3. 漏一種組法（靜態推斷）：`'apps/' + code` 不在列；但 `'apps/'` 又是分派表第 5 條 `under('apps/')` 的合法寫法。
- 影響：第 1、2 件在第 3 個 commit 大聲失敗；第 3 件是安靜的洞。發生機率：第 1、2 件一定碰到；第 3 件低。
- 建議處理：例外表加第三類「檢查本身」；第 3 條補「資料夾名來自追蹤的路徑時，抓整段前綴、不重組；`apps/<軟體>/` 自己的程式寫整段字面」；`'apps/'` 前綴只准出現在表所在的檔，由它匯出。

**R17（R2 修正引入）　驗收第 5 項「剩下是 0」照字面做不到**

- 實際（已重現，`wide.mjs`，搬家後的樹）：紀錄 891 行、已完成的 plans 3 行、例外檔 218 行、整行只有 vault 寫法的 75 行、§2 與 §4 要改的路徑寫法 55 檔 191 行。之後還剩三種清單沒列、也不該改的：
  1. 不是路徑的識別字，10 檔 18 行：`PluginSettingTab`（`src/obsidian/settings.ts:1,124`、`tests/helpers/obsidian.ts:363,368`、`experiments/plugin/src/main.ts:3,88` 等）；變數 `plugins`（`dev-ids.ts:502,508,509`、`dev.ts:200,202`、`roadmap-board.ts:328`）；`tools/dispatch.ts:13,14,16` 的 `PLUGINS`；`experiments/tools/rename-local-folder.test.mjs:44` 的 Codex 設定樣本 `[plugins."x"]`。
  2. 現行文件裡寫歷史的列，至少 8 行、5 個檔：`docs/roadmap.md:20` 與 `docs/backlog.md:53`（這件自己）、`docs/backlog.md:51,55`、Cards 的 `docs/roadmap.md:56,57`（〈已完成〉的第二步 A、B）、`docs/agents/token-usage.md:13`、`docs/architecture.md:83`。
  3. 跳脫過的 vault 寫法，2 行：`plugins/cards/tests/backup-take.test.ts:90`、`backup.test.ts:150` 的 `\.obsidian\/plugins\/essence-cards`；排除字樣都是沒跳脫的，§3 第 3 點第 2 條的排除字樣同樣對不到。
- 發生機率：一定發生。
- 建議處理：pattern 收成路徑的寫法（`plugins` 後面接 `/`、`\/`、引號、`*`）；扣除清單加「現行文件裡寫歷史的列，逐列附在〈結果〉」；vault 的排除字樣比對前先把 `\/` 當成 `/`、`\.` 當成 `.`；`PLUGINS` 要不要改名，順手寫一句。

**R18（延續 R10）　第 1 輪點名會假失敗的那一處沒列進修法；§2 的「sources 的基準」照字面改不到**

1. `plugin-root.test.ts:66-70` 自己用 `fileURLToPath(new URL('..', import.meta.url))` 算 Cards 的資料夾，不經過 `helpers/layout.ts`；修法只列 `layout.ts` 與 `build.mjs`，這一處照舊會拿 `apps/cards` 比 `apps/Cards`（靜態推斷）。
2. Windows 上 `path.relative` 比對時不分大小寫，回傳的尾段取自第二個參數，只把基準轉成真實大小寫沒用。已重現：在 `…\c1\apps\cards` 執行，`relative(realpathSync.native(top), <照打的字>\src\main.ts)` 回 `apps\cards\src\main.ts`；`relative(top, realpathSync.native(cwd))` 才回 `apps\Cards`。`fs.realpathSync`（非 native）仍回小寫，git 的 `--show-prefix` 回 `apps/Cards/`。
- 發生機率：中，只在 Windows。
- 建議處理：§3 第 6 點改成「Cards 的資料夾（`build.mjs` 的 `root`、`layout.ts` 與 `plugin-root.test.ts:66` 的 `cards`）一進來就過 `realpathSync.native`」；最好只在 `layout.ts` 匯出一個真實大小寫的 Cards 根；§2 的「`sources` 的基準」改成「`root`」。

**R19（R8 修正引入）　〈合併後〉漏三件；〈停手時段〉對主資料夾的理由不再成立**

1. 空的 `plugins/` 資料夾（已重現）：施工的 worktree 搬完就有；主資料夾與其他 worktree 拉下來、搬走 `node_modules` 之後也會剩。應該列一步刪掉。
2. 施工用的 worktree `D:\程式開發\Essence-apps` 怎麼收：合併後移除，先唯讀掃有沒有連結，用不加 `--force` 的 `git worktree remove`。
3. 探針分支與 draft PR 合併後關掉、刪掉。
- 〈停手時段〉：施工移到 repo 外的 worktree 後，「不在主資料夾的 `plugins/` 底下開終端機」這個理由只對施工的 worktree 成立；主資料夾要到〈合併後〉第 1 步才需要沒有程序占著。
- 建議處理：〈合併後〉補這三步，§1 第 2 點補「搬完刪掉空的 `plugins/`」；〈停手時段〉那句改成對施工的 worktree 說。

#### 可以不改

- **R20（R5 修正引入，和 R13 同類）驗收第 17、7 項的樣本在 Windows 用 `git add` 做不出來**：索引裡已有 `apps/Cards/a.md` 時，`git add -- Apps/Cards/x.md` 記成 `apps/Cards/x.md`（已重現）；`git update-index --add --cacheinfo` 可以照字放進去。測試旁寫一句即可。Windows 上平常的 `git add` 不會產生 `Apps/…`，這條防線實際擋的是 Linux。
- **R21（R2、R6 修正引入）文字對不上**：§2 寫測試改名 `app-imports`，例外表與驗收第 7 項寫 `check-app-imports.test.ts`；例外表說 `dispatch.test.ts` 是為了驗收第 7 項的 `plugins/cards/a.ts`，但那個樣本在 `check-app-imports.test.ts`，`dispatch.test.ts` 的 `plugins` 全是要換的，這一列施工時會被自己的規則報出來；Portal 那一列哪個 commit 加沒寫。
- **R22　驗收第 16 項是一次性的人工查**：可以改成常駐、兩個平台都跑的測試：對真的 `.gitignore` 跑 `git -c core.ignorecase=false check-ignore -q apps/Cards/main.js`。
- **R23　其他**：`progress-board.yml` 的 `paths` 沒有表所在的檔；現行文件說明這條防線時不能舉寫錯的例子，要舉就進例外表；待驗證：Portal 的網址如果用 `/apps/cards` 這種小寫路由會被擋；待驗證：在 `D:\程式開發\Essence-apps` 開的 session 讀不讀得到專案記憶與核准的指令，讀不到就從主資料夾的 session 對那個路徑操作；新 worktree 開工前先 `npm ci`。

#### 沒驗的項目與原因

- `tools/` 與 Cards 的 `npm run check`、`self-check`：沒跑，這一輪只查規格。
- R15、R17 的數字來自照規格字面寫的估算腳本，不是之後真的檢查；實作選的 pattern 不同，行數會有出入，命中的檔不會變。
- R16 第 1、3 件、R18 第 1 件、R19 第 2、3 件、R21：靜態推斷。R18 第 2 件只重現了 `path.relative` 與 `realpathSync.native` 的行為，沒有實際從小寫工作目錄建置。
- Linux、GitHub 的 CI 與 Pages、雲端 session、Obsidian 與 vault：沒有環境或照指示不動。`claude/workflow-impl-68afda` 合併後 §2 要重列的內容沒試合併。

雙方一致可以開工：沒有擋開工的項目；R15～R19 建議開工前先補進任務說明。

### Claude 的回應

全部照改（R15～R23），不再送第 3 輪：第 2 輪沒有擋開工的發現，這些修改只把做法寫清楚，施工時由 L1 與合併前的 L2 涵蓋。

| 項目 | 改法 |
|---|---|
| R15 | §3 第 3 點：比對前把 `\/`、`\\`、`\` 當成 `/`、`\.` 當成 `.`；只認表上的名稱，其他交給第 1 點 |
| R16 | 例外表加第三類「檢查本身」（`check-app-imports.ts`）；改法分三種（查表、抓整段前綴、軟體自己的程式寫整段字面）；`'apps/'` 前綴由表所在的檔匯出，其他檔出現就報 |
| R17 | 驗收第 5 項的 pattern 收成路徑寫法、先正規化；扣除清單加現行文件寫歷史的列（逐列附在〈結果〉）；`PLUGINS` 改成 `APPS` |
| R18 | §3 第 6 點改成 `build.mjs` 的 `root`、`layout.ts` 匯出的 Cards 根（`plugin-root.test.ts` 也用它）一進來就過 `realpathSync.native`，寫明只轉 `path.relative` 的基準沒用；§2 改成 `root` |
| R19 | §1 第 2 點與〈合併後〉第 1、2 步刪空的 `plugins/`；〈合併後〉加施工 worktree 的移除與探針的收尾；〈停手時段〉那句改成對施工的 worktree |
| R20 | 例外表的樣本一類寫明用 `--cacheinfo` 或直接餵路徑清單 |
| R21 | 測試檔名統一成 `tools/tests/app-imports.test.ts`；`dispatch.test.ts` 從例外表拿掉；Portal 那一列在搬家的 commit 加 |
| R22 | 驗收第 16 項改成常駐測試，加上 CI 建置後的 `git status` |
| R23 | `progress-board.yml` 的 `paths` 加表所在的檔；現行文件不舉寫錯的例子；施工 worktree 先 `npm ci`、由主資料夾的 session 操作；Portal 的路由等它的設計出來再看 |
