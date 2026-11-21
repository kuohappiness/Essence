# `plugins/` 改名 `apps/`：合併前 L2（給 Fable 5.2 high）

狀態：待審｜下一步：兩輪的發現都處理完，等使用者同意合併｜等誰：使用者

遵守 repo 根目錄的 `AGENTS.md`。Codex 額度用完（約 2026-11-23 重置），使用者 2026-11-21 指定這件的審查由 **Fable 5.2 high** 做（[D-218](../decisions.md#d-218-plugins-改名-apps每個軟體的資料夾首字大寫) 第 5 點）：本機 session 每一輪開一個沒參與實作的新子代理，報告原文附在這份檔案的那一輪底下。審查照 code-quality 的 `review.md`〈L2〉與〈兩軸〉〈回報格式〉。

## 審查對象

- worktree：`D:\程式開發\Essence-apps`，分支 `claude/project-thread-sdo9aa`（PR #29），沒有未提交的修改（`apps/Cards/docs/syntax.md` 只有工作樹的換行差異，`git diff` 是空的）。
- 規格基準與共同祖先：`main` 的 `252d85deb61293a8ea209029ce33a95f03c711df`。
- 待審：`244da44`（`git rev-parse HEAD`）。這次要看的 commit：
  - `e565135`：開工前的準備（跨版本認得 `apps/Cards`、`realpathSync.native`、`tools/apps.ts`、`check-plugin-imports` 改名 `check-app-imports`）；
  - `bc0e51d`：合併 `main`（PR #30 的工作流程）；
  - `9b7486b`：搬家（`git mv` 三個資料夾、改連結的腳本、路徑常數）；
  - `c704d40`：§3 的防線；
  - `555f814`：§4 的現行文件；
  - `244da44`：CI 的 cards job 建置後檢查 `git status --porcelain` 是空的（驗收第 16 項），與〈結果〉、這份請求。
  - `80499d0` 之前只改任務說明與開工前查核，不必審。

## 規格與優先順序

- [任務說明](rename-plugins-to-apps.md) 全部，特別是 §2（程式要改的）、§3（大小寫的防線）、§4、〈驗收〉；
- [D-218](../decisions.md#d-218-plugins-改名-apps每個軟體的資料夾首字大寫)、[D-208](../decisions.md#d-208-三個外掛在同一個-repo-開發每個外掛有自己的資料夾) 第 5、10 點；
- 開工前查核的兩輪（[rename-plugins-to-apps-plan-review.md](rename-plugins-to-apps-plan-review.md)）已經改進任務說明；規格之間衝突時列成問題，不挑容易通過的那份。

## 行為與風險

- 不可破壞：產品程式（`apps/Cards/src/`）只有 `rules.ts` 的 5 個規則檔路徑字串改了；建置產物、送給 AI 的規則內容、外掛 ID 與版號不變；讀 `v0.2.0`～`v0.6.0` 與第二步 `plugins/cards` 的跨版本工具照常。
- 共用檢查（`tools/check-app-imports.ts`）每次 commit 與 CI 都跑：擋 `plugins/`、大小寫不符的 `apps/` 與資料夾、只有文件的 Portal 出現程式、寫死的路徑大小寫不符、組字串。誤報會讓每次 commit 停下，漏報會讓 Windows 上寫錯的大小寫推到 Linux 才壞。
- 分派表（`tools/dispatch.ts`）第 4 條：Portal 只跑共用檢查；第 5 條：`apps/` 底下不認得的路徑跑全部。
- 明確延後：Portal 的文件（合併後由別的討論串寫）；驗收第 10 項的雲端 session、第 11 項的探針 PR 與 Pages（要使用者開）。

## 驗證方式

- 指令：`tools/` 的 `npm run check`、`npm run self-check`；`apps/Cards/` 的 `npm run check`、`npm run build`。Windows 11、Node 24.13、Git 2.52；這個 worktree 已經 `npm ci`。
- 實作者跑過的（結果見[任務說明〈結果〉](rename-plugins-to-apps.md#結果)）：上面四個檢查（Windows）；Linux CI 在 `9b7486b` 七個 job 全過；§5 三項（建置比對、測試 vault、跨版本）；驗收第 1、2、4、5、8、9、12、16、17、18 項。
- 沒跑的：驗收第 10 項（雲端 session）、第 11 項（探針 draft PR、合併後的 Pages）。

## 實作者自己選的做法（請先看）

1. **防線都放在 `check-app-imports.ts`**，新函式 `checkLayout`（路徑）、`checkText`（一個檔的內容）、`checkPaths`（全部文字檔＋紀錄＋例外表）；掃的是全部追蹤的文字檔（含 NUL 的當二進位跳過），工作樹或 `--staged` 的暫存區。
2. **正規化**：`\.` → `.`，再 `\\`、`\/` → `/`，剩下的 `\` → `/`。`apps/<名稱>` 前後用 `(?<![\w-])`、`(?![\w-])` 界定，只認表上的名稱（不分大小寫比，寫法要恰好相同）。
3. **`plugins\/` 這條在原文上找**（正規化後分不出跳脫），排除 `obsidian\/` 前綴與 `essence-` 後綴；`plugins/<軟體>` 在正規化後找。
4. **組字串**：`` `apps/${ ``、`'apps'`、`"apps"`、`'apps/'`、`"apps/"`，表所在的 `tools/apps.ts` 除外。
5. **例外表**：每列一個檔與類別；例外檔照樣跑 `checkText`，**沒有任何問題**才報「已經沒有被允許的寫法」（不是逐一比對被允許的那一種寫法）；「檔不在了」只在 repo 有 `tools/apps.ts` 時查（測試的暫存 repo 沒有那些檔）。
6. **同一個資料夾的路徑問題只報第一個檔**（`plugins/cards/` 底下 600 個檔不會印 600 行）。
7. **Portal 放在另一張表 `DOCS_ONLY`**，不在 `FOLDERS`；分派表第 4 條加上它、效果是空的（只跑共用檢查），沒有新增條目以免條號全部位移。
8. **`ci-gate.test.ts` 從例外表拿掉**：規格把它列為歷史路徑，但它的情境（搬家前開的分支合併到搬家後）要照現在的分派表才成立，`plugins/cards/…` 在新的分派表落第 10 條（全部），測試的意思會變；所以整份換成 `apps/`。
9. **hook 的乾淨 clone 測試**（`tools/tests/hooks.test.ts`）改成從工作樹複製**每一個**追蹤的檔（原本只複製 `.md` 與 clone 缺的檔）：共用檢查現在掃全部文字檔，HEAD 的舊內容會被擋；替身測試檔照本 repo 的清單找，例外表上的替身留下被允許的寫法（註解）。
10. **探針分支**：§1 第 2 點要的「搬家的 commit 單獨推一個探針分支」改成直接推到 PR 分支（同樣跑 push 的 CI，七個 job 都看到），沒有另開分支。
11. `tools/dispatch.ts` 的 `PLUGINS`、`Plugin` 改名 `APPS`、`App`（驗收第 5 項）；`roadmap-board.ts` 改用 `APPS_ROOT` 讀資料夾。

## 回報與權限

只審查，不改程式與文件；可以在隔離環境（repo 外的 clone、暫存 repo）重現。不碰測試 vault 與正式 vault，不 push。每項發現寫觸發條件、預期／實際、影響、位置與證據，區分「已重現」「靜態推斷」「待驗證」，另標真實路徑會不會發生與發生機率。報告寫在回覆裡，Claude 原文附到下面。

## 第一輪

### 報告原文：`plugins/` 改名 `apps/`：合併前 L2 第一輪報告（Fable 5.2 high，獨立審查）

**結論：沒有找到擋合併的問題。** 共 10 項發現，都是低嚴重度。建議合併前順手修 R1、R2、R8（各一兩行，不加機制）；R3～R5 是防線的漏報與誤報邊界，請整合者決定收窄或記成已知的限制；R6、R7、R9、R10 可以只記錄。

- 待審 commit：`244da4470e7c6b9481877404ae7c20583b6e6c51`（分支 `claude/project-thread-sdo9aa`，`origin` 同一個 SHA）；基準 `main` 的 `252d85d`。
- 範圍：`e565135`、`bc0e51d`、`9b7486b`、`c704d40`、`555f814`、`244da44`。重點看請求〈實作者自己選的做法〉11 條、`tools/check-app-imports.ts`、`tools/dispatch.ts` 第 4、5 條、`tools/tests/hooks.test.ts`、`apps/Cards/tools/git.ts`、`.github/workflows/check.yml`。
- 工作樹：只有請求檔改 SHA 的未提交修改與 `syntax.md` 的換行差異，審查前後 `git status` 相同。我沒有改檔、commit、push，也沒碰任何 vault。

#### 發現（依嚴重程度）

##### R1 `checkText` 回報的行號會偏前
- **軸**：規範與設計（做了但做錯）。
- **觸發條件**：被擋的寫法前面有反斜線跳脫（`\/`、`\.`、`\\`），例如正規式多的測試檔與工具。
- **預期／實際**：預期回報原文的行號。實際上 `lineAt(text, m.index)` 的 `m.index` 來自正規化後變短的 `flat`，卻拿去數原文的換行。
- **影響**：只影響訊息的行號，不影響擋不擋。使用者會被帶到錯的行。
- **真實路徑與機率**：會發生。這條檢查最常命中的就是含跳脫的檔；單檔跳脫少時偏 0～1 行，多時偏很多。
- **位置**：`tools/check-app-imports.ts:164-168`、`:180`；`:161` 的註解「換行不動，行號照舊」不成立。
- **證據**：已重現。40 行各含 5 個跳脫之後放 `'apps/cards/x'`，真實第 41 行，回報第 35 行；另一例真實第 5 行，回報第 3 行。現有測試 `app-imports.test.ts:170` 的樣本前面沒有跳脫，所以測不到。
- **建議**：合併前修。正規化不動換行，`flat` 上的比對改成 `lineAt(flat, index)`；原文上找的 `plugins\/` 那條照舊。回歸測試補「前面有跳脫」的樣本。

##### R2 `progress-board.yml` 的 `paths` 沒加表所在的檔
- **軸**：規格（要的沒做）。任務說明 §2 那一列寫「加上表所在的檔（只改表時白板也重產）」。
- **觸發條件**：push 到 `main` 只改 `tools/apps.ts`。
- **預期／實際**：預期 Progress board 重跑。實際上 `paths` 只把 `plugins/*/docs/**` 換成 `apps/*/docs/**`，沒有 `tools/apps.ts`，而 `tools/roadmap-board.ts:17` 已經 import 它。
- **影響**：很小。白板只用到 `APPS_ROOT`，下次任何 docs 改動也會重產。
- **真實路徑與機率**：Portal 寫第一行程式、移進 `FOLDERS` 時會只改這個檔；那時白板內容其實不變。
- **位置**：`.github/workflows/progress-board.yml:8-19`。
- **證據**：靜態推斷（讀檔）。這項偏離沒列在〈實作者自己選的做法〉。
- **建議**：合併前加一行 `- tools/apps.ts`，或在〈和規格不同的地方〉寫明不加的理由。

##### R3 例外表上的檔整檔、整組規則都放行（做法第 5 條）
- **軸**：規範與設計；也是規格 §3 第 3 點「已經沒有它被允許的寫法就報錯」只做到一半。
- **觸發條件**：例外表 12 個檔之一出現不屬於它那一類的寫法。
- **預期／實際**：預期「歷史路徑」只放行 `plugins/…`，打錯大小寫的 `apps/cards` 與組字串照樣擋。實際上三種都不報。
- **影響**：
  - 最該被看住的檔（跨版本工具 `git.ts`、檢查本身）不在大小寫防線裡。
  - 「例外過期」的偵測變鈍：`git.ts` 現在有 1 個大小寫命中（註解）加 5 個 `plugins/` 命中，哪天 `MANIFESTS` 拿掉 `plugins/cards`，註解還在就不會報。
- **真實路徑與機率**：低。`git.ts` 的 `MANIFESTS` 寫錯大小寫時，`plugin-root.test.ts` 的 `apps` 一例在 Windows 就會紅（`ls-tree` 分大小寫）；`check-app-imports.ts` 自己有 `app-imports.test.ts` 與 Linux CI。所以是防線少一層，不是沒人擋。
- **位置**：`tools/check-app-imports.ts:216-224`。
- **證據**：已重現（`probe1.ts` E1～E3，三例都是 0 個問題）：
  - `git.ts` 把 `apps/Cards/manifest.json` 寫成小寫、仍留 `plugins/cards`；
  - `git.ts` 只剩 `join(root, 'apps', code)`；
  - `check-app-imports.ts` 寫 `/^(apps\/cards)\//`。
- **各檔現在命中的規則**（`probe4.mjs`）：只有 `plugins/` 的是 `compare-versions`、`ai-add-old-version`、`pick-old-version`、兩個 `move-links`；另有大小寫命中的是 `git.ts`、`plugin-root`、`build.test`、`layout.ts`（都在註解或樣本）。
- **建議**：二選一。
  - 每列加「放行哪幾條」，只放行列出的，沒命中任何一條放行的才報過期。不加狀態，改 `checkPaths` 與表。
  - 或記進已知的限制，寫明由測試與 Linux CI 擋。
  - 我傾向前者，但不擋合併。

##### R4 組字串與 `plugins\/` 兩條套在全部文字檔，有誤報
- **軸**：規範與設計（實作照規格字面，問題在範圍）。
- **觸發條件與重現**（`probe1.ts` B 組，都被擋）：
  - 文件或資料檔出現加引號的字：`docs/architecture.md` 寫「資料夾叫 "apps"」、任何 JSON 有 `"apps"` 鍵或 `keywords`、CSS 的 `[data-kind="apps"]`。訊息是「用字串組資料夾：…改成查 tools/apps.ts」，對文件與 JSON 沒意義。
  - vault 路徑的正規式前面不是字面 `obsidian\/`：`/plugins\/[^/]+\/main\.js$/`、`` new RegExp(`${dir}\/plugins\/${id}`) ``、`/config\/plugins\/x/`。Obsidian 的設定資料夾可以改名，用 `configDir` 組才是對的寫法，反而被擋，訊息寫「改名後是 apps/」。
  - 別的 repo 的網址（`…/tree/main/apps/cards`）、英文句子（`web apps/cards UI`）、`node_modules/@x/apps/portal/…`。
  - `docs/roadmap.md` 要查，它的列卻由不查的紀錄（任務的標題與狀態行）同步而來：任務標題寫了打錯的樣本，會擋在產生的檔上，要回頭改紀錄。
- **預期／實際**：預期只擋程式與設定裡真的在組路徑的寫法。實際上連敘述文字也擋。
- **影響**：擋下的是引入那一行的 commit，改寫法就過。較大的情況是違規的行不經本機 hook 進了 `main`（GitHub 上合併、CI 的 `shared` 紅但 gate 還不是必過檢查），之後每個 worktree 的每次 commit 都停，直到有人修。這和 check-docs 同性質，但這條的誤報面比較寬。
- **真實路徑與機率**：
  - 現況 0 個誤報（955 個追蹤檔，工作樹與暫存區都過）。
  - 之後最可能碰到的是 Portal 的文件、JSON，與現行文件談到這個資料夾；估計偶爾一次。
  - `configDir` 的正規式要等有人新寫 vault 工具才碰到。
- **位置**：`tools/check-app-imports.ts:186-192`。
- **證據**：已重現。
- **建議**（都是收窄，不加機制）：
  - 組字串那條只查程式與設定的副檔名（`ts`、`mts`、`cts`、`js`、`mjs`、`cjs`、`yml`、`yaml`、hook 腳本），至少排除 Markdown。
  - `plugins\/` 的訊息補一句 vault 路徑的放行寫法。
  - 其餘記成已知的限制，寫上怎麼避開。

##### R5 Windows 過得了、Linux 會壞而檢查看不到的寫法
- **軸**：規格（§3 第 3 點列的 pattern 本身有洞），實作照規格。
- **觸發條件與重現**（`probe1.ts` A 組，都是 0 個問題）：
  - `join(root, APPS_ROOT, 'cards')`、`APPS_ROOT + 'cards'`：表匯出的前綴加小寫代號。
  - `` `${root}/apps/${code}` ``、`'./apps/' + code`、`` `./apps/${a}` ``：前面不是緊貼引號或反引號。
  - `join(root, 'Apps', 'Cards')`：組字串那條分大小寫，其他條都不分。
  - `new RegExp('^apps\\/cards\\/')`（字串裡的正規式）、JSON 字串裡四個反斜線的 Windows 路徑：正規化成 `apps//cards`。
  - `apps/{cards,capture}/docs/**`、`apps\/(cards|capture)`：大括號與群組。
  - `cd apps && cd cards`。
- **預期／實際**：D-218 第 4 點要「機械檢查擋大小寫不符的路徑」。實際上這些組法擋不到。
- **影響**：本機照過，推上去 Linux CI 才紅（多一趟來回）。CI 沒跑到的路徑（只在雲端 session 或手動跑的腳本）才會到雲端才壞。
- **真實路徑與機率**：低。最常見的 `join(root, 'apps', code)`、`` `apps/${code}` ``、字面 `apps/cards` 都擋得到。
- **位置**：`tools/check-app-imports.ts:182、191`。
- **證據**：已重現。
- **建議**：
  - 便宜的收窄可以做：組字串的 pattern 加 `i` 旗標，引號後容許 `./` 或 `/`，模板裡 `apps/${` 不要求緊貼反引號。
  - `APPS_ROOT + 代號` 靜態看不出來，其餘（雙重跳脫、大括號）記成已知的限制。
- **同一類、規格明訂不查的**（不算缺失，請知悉）：
  - `docs/tasks/` 是紀錄，新寫的任務說明寫 `npm --prefix apps/cards` 不會被擋，雲端照做會立刻失敗（看得到）。
  - 非 Markdown 的 `startsWith('plugins/')`、`join(root, 'plugins')`、`` `plugins/${x}` ``、`plugins/*` 都不擋；這些兩個平台都壞，不是大小寫問題。

##### R6 `check-docs.ts` 等沒有從表取，偏離沒列出
- **軸**：規格（§3 第 1 點「`dispatch.ts`、`check-docs.ts`、`roadmap-board.ts`…都從這裡取」只做一半）。
- **預期／實際**：預期從 `tools/apps.ts` 取。實際上這些位置寫死字面：
  - `tools/check-docs.ts`：`DEFERRED_BACKLOGS`、`BEFORE_D195_DIRS`、`EXCEPTIONS`、`FROZEN_RULES` 的鍵、`rulesHere`；
  - `tools/roadmap-board.ts:23`：`RELEASE_ROADMAP`；
  - `tools/progress-board-data.ts:135`：網址。
- **影響**：很小，字面的大小寫都對，也在 `checkText` 的範圍內（這幾個檔不在例外表）。只是「只寫一處」沒成立，Cards 的資料夾名在共用工具裡出現很多次。
- **真實路徑與機率**：不會造成行為問題。
- **證據**：靜態推斷（讀檔）。
- **建議**：寫進〈和規格不同的地方〉，說明字面由 §3 第 3 點看住；或之後有人動這幾處時改成 `FOLDERS.cards`。不必為此再送審。

##### R7 `hooks.test.ts` 的改法（做法第 9 條）：方向對，有三個小地方
- **軸**：規範與設計。
- **判斷**：改成「每個追蹤的檔都從工作樹複製」是必要的，共用檢查掃全部文字檔，clone 的 HEAD 是舊內容。替身留下被允許的寫法也成立。兩個測試在 Windows 通過（232 秒），Linux 的 tools job 在 `244da44` 通過。
- **小地方**：
  - 第二個迴圈重複：`HOOK_FILES` 與 `copied(wanted)` 複製的都是追蹤的檔，已經被前一個迴圈涵蓋。可能是剩下的轉手，可以刪。
  - `copyFile` 前沒有判斷檔在不在（`tools/tests/hooks.test.ts:87-90`）：追蹤的檔在工作樹被刪但還沒 stage 時，測試以 ENOENT 失敗，訊息看不出原因。原本只有 `.md` 與 clone 缺的檔會碰到，現在是全部。共用資料夾有別的 session 正在刪檔時偶爾會碰到，重跑就好。
  - 替身留的註解是 `checkText` 的 `target`，靠「再掃一次仍命中」成立，現在成立。R3 若改成逐條放行，這裡要跟著改。
- **證據**：前兩點靜態推斷，測試通過是實跑。
- **建議**：不擋合併。第一點順手刪，第二點記著。

##### R8 〈結果〉的例外表列數寫錯
- **軸**：規格（紀錄和實作不符）。
- **預期／實際**：`docs/tasks/rename-plugins-to-apps.md:187` 寫「例外表是十一列：歷史路徑九列…樣本兩列…檢查本身一列」。實際 `EXCEPTIONS` 是 12 列（9＋2＋1，已實跑計數）。
- **建議**：合併前改成十二列。
- **順帶**：第 2 項「`git log --follow` 待 L2 抽查」已抽查，結果在下面〈跑過的指令〉，可以填回。

##### R9 訊息在少數情況會帶錯路
- **軸**：規範與設計。
- **情況**：
  - 兩段式改法在 Linux、且正確大小寫的資料夾已經存在時會搬錯。例如雲端 session 在已有 `apps/Portal/` 時新增 `apps/portal/docs/b.md`，照訊息 `git mv apps/Portal.tmp apps/Portal` 會搬進 `apps/Portal/Portal.tmp/`，而 `apps/Portal/Portal.tmp/docs/b.md` 是 `.md`，檢查會過。Windows 上這個狀態做不出來（`git add` 會對齊），訊息也寫了「Windows 上」。
  - `apps/` 正下方的檔（`apps/README.md`、`apps/.gitkeep`）報「不在表上：apps/ 底下的軟體要先登記」，看不出是「這一層不放檔」。
  - Portal 底下的 `.gitkeep`、PDF、CSV、txt 都算「程式」被擋。這符合規格的白名單，只是訊息寫「只能有 Markdown 與圖檔」，第一份文件常會附這類檔。同一個資料夾只報第一個，要一個一個修。
- **真實路徑與機率**：第一點低（Linux、打錯、照字面做三個條件同時成立）；後兩點在 Portal 開始寫文件時可能各碰一次。
- **證據**：
  - 第一點靜態推斷（Linux 的 `git mv` 行為我這裡沒法跑）。
  - 後兩點已重現（`probe1.ts` D 組）；Windows 暫存 clone 實跑了 `apps/portal` → 被擋 → 照訊息兩段式改 → 通過。
- **建議**：訊息加半句「Linux 上直接 `git mv <檔> <正確路徑>`」。其餘記著，等 Portal 的第一個任務碰到再調。

##### R10 `e565135` 把 `tools/tests/quality.test.ts` 整檔從 CRLF 換成 LF
- **軸**：規格（做了沒要求的），知會性質。
- **預期／實際**：預期這個檔只改路徑。實際上 `git diff 252d85d..HEAD` 是 366 行對 366 行，加 `-w` 只剩 4 行真的改動；`main` 上的 blob 是 CRLF（git 把它判成 `-text`，不會自動轉）。
- **影響**：內容沒問題，兩個平台測試都過。之後別的分支若改這個檔，合併會整檔衝突；在 GitHub 看 diff 也找不到那 4 行。
- **建議**：在〈結果〉記一句即可；停手時段內沒有別的分支動 `tools/` 就沒事。

**其他小事**（不編號）：`check-app-imports.ts` 的 `checkPluginImports`、`PLUGIN`，以及 `check-docs.ts`、`roadmap-board.ts` 的 `PLUGIN_ROADMAP` 還叫 plugin。驗收第 5 項只要求 `PLUGINS` 改 `APPS`，不算缺失。

#### 核對過、沒有問題的

- **分派表第 4、5 條**（Windows 暫存 clone 實跑 `dispatch.ts --staged --explain`）：
  - `apps/Portal/docs/a.md` 落第 4 條，四個對象都跳過；
  - `apps/portal/docs/a.md` 落第 5 條，全部跑，共用檢查同時擋下；
  - `apps/Portal/package.json` 落第 4 條，由共用檢查擋「只有文件」。
- **Portal 之後移進 `FOLDERS` 卻漏改 `APPS` 或規則時**：落第 5 條（全部），`cloud-setup.test.ts` 也會紅，方向安全。
- **`.gitignore`**（暫存 clone）：改成 `/apps/cards/main.js` 後，`git -c core.ignorecase=false check-ignore` 回 1，Windows 預設回 0，`check-app-imports` 另外報 `.gitignore:8`。兩層都有效。
- **CI 新的一步**：`gh pr checks 29` 顯示 `244da44` 的 push 與 pull_request 兩次 run，七個 job 全過，含 cards job 的 `git status --porcelain`。寫法在子資料夾執行也看整個 repo；只在 cards job 有跑時才驗，而改 `.gitignore` 落第 6 條會全部跑。
- **跨版本工具**：
  - `pluginRoot` 回的是 `MANIFESTS` 的值，不是 `ls-tree` 的路徑；`compare-versions.ts:53-59` 的 `join(dir, at)` 大小寫正確。
  - `.local/` 在主資料夾的根（`install.ts:41-46`），不跟著 `plugins/cards` 搬，登錄與正式產物不受改名影響。
- **打錯大小寫的工作目錄**（§3 第 6 點）：在 `apps/cards`（小寫）跑 Cards 的 11 個測試檔，95 個測試全過，包含 `plugin-root`、`locate`、`ai-rules`、`cli-path`、`build`、`update-vault`、`install`、`dev-version`、`pick-old-version`、`ai-add-old-version`、`compare-versions`。
- **殘留**：我另寫的掃描（紀錄與例外表以外、扣掉 vault 寫法）剩 11 處，和〈結果〉第 5 項列的相同，都是寫歷史的列與 `experiments/plugin/` 的 vault 路徑。
- **`tools/legacy-status-docs.json`**：224 條，和基準逐條照資料夾對應相同，0 條不在追蹤，0 條 `plugins` 開頭。
- **搬家的 commit**：615 個 `R`、96 個 `M`，`plugins/` 底下沒有非 `R` 的。
- **`git log --follow` 抽查**：Cards 抽 20 檔、Capture 6 檔、Mindboard 5 檔，全部接得到 `plugins/` 的舊路徑；Cards 20 檔都接到更早的根目錄路徑。
- **效能**：`check-app-imports.ts` 工作樹 1.8 秒、`--staged` 1.5 秒。
- **做法第 8 條**（`ci-gate.test.ts` 整份換成 `apps/`）：同意，留著 `plugins/cards` 會落第 10 條，測的就不是原本的情境。
- **做法第 7、10、11 條**：沒有意見。

#### 跑過的指令與結果

都在 `D:\程式開發\Essence-apps` 唯讀執行，或在 scratchpad 的暫存 clone。

| 指令 | 結果 |
|---|---|
| `node tools/check-app-imports.ts`、`--staged` | 通過 |
| `tools/` 的 `npm run check` | 通過（文件 395 檔、8114 個連結；skill 一致；狀態板一致；白板讀得出來） |
| `node --test tests/app-imports.test.ts tests/dispatch.test.ts tests/cloud-setup.test.ts tests/ci-gate.test.ts` | 106 個：105 過、1 跳過 |
| `node --test tests/hooks.test.ts` | 2 過（232 秒） |
| 在 `apps/cards`（小寫）跑 Cards 的 11 個測試檔 | 35＋60 個全過 |
| `gh pr checks 29` | 14 列全 pass |
| 暫存 clone 的重現（Portal 大小寫、兩段式 `git mv`、`package.json`、`.gitkeep` 與 CSV、`.gitignore` 小寫、`git add -N`） | 如上各項；`git add -N` 後 `--staged` 正常 |

暫存 clone `scratchpad\rv` 已刪。同一個 scratchpad 裡原本就有的 `probe` worktree 與其他檔不是我建的，沒動。

探針腳本留著，方便核對時重跑：
- `<scratchpad>\probe1.ts`（R1、R3、R4、R5、R9 的樣本；在 `tools/` 底下用 `node` 執行）
- `<scratchpad>\probe2.mjs`（含 NUL 被跳過的檔：只有 2 個 png、1 個 webp）
- `<scratchpad>\probe3.mjs`（殘留掃描）
- `<scratchpad>\probe4.mjs`（例外表各檔命中的規則）
- `<scratchpad>\follow.sh`（`--follow` 抽查與搬家 commit 的統計）

#### 沒驗的項目與原因

- `tools/` 的 `npm run self-check` 全套與 `apps/Cards/` 的 `npm run check` 全套（238、2906 個測試數）：照指示只跑單檔。Linux 以 CI 的結果為準，Windows 以實作者的紀錄為準，測試數沒重數。
- §5 三項演練（建置逐位元組比對、測試 vault 的開發版、用真的備份跑 `compare-versions`）：權限不碰 vault，建置比對也沒重做。
- `embedRules()` 前後 `deepEqual`（驗收第 4 項）：沒重跑，只確認 `ai-rules.test.ts` 通過。
- `apps/Cards/` 的 TS1149 探針（驗收第 8 項第四種）：要在有相依的 clone 寫樣本，沒做。
- 驗收第 10 項（雲端 session）、第 11 項（探針 PR、合併後的 Pages）：要使用者開或合併後才有。
- 驗收第 12 項「每個 tag 指的 commit 不變」：沒有基準可比，沒驗。
- R9 第一點（Linux 上兩段式 `git mv` 搬進既有資料夾）與 R7 第二點（ENOENT）：靜態推斷，沒實跑。
- §4 現行文件的逐句用詞（「外掛／軟體」）：只看了 `AGENTS.md`、`architecture.md` §9 的差異與殘留掃描，沒逐檔讀。

### Claude 核對與處理

逐項核對報告（R1、R3、R4、R5 用審查者的探針與新的回歸測試重跑過），全部同意，沒有不同意的項目。修正在下一個 commit：

| 項目 | 處理 |
|---|---|
| R1 行號偏前 | 修。`flat` 上的比對改用 `lineAt(flat, index)`（正規化不動換行）；原文上找的 `plugins\/` 照舊。回歸測試補「前面有跳脫」的兩個樣本。 |
| R2 白板的 `paths` | 修。`progress-board.yml` 加 `tools/apps.ts`。 |
| R3 例外檔整組放行 | 照建議的前者修。例外表每列加 `allow`（放行哪幾條規則：`plugins`、`大小寫`、`組字串`），沒放行的照擋；放行的某一條在那個檔已經沒有命中就報「用不到」。`checkText` 的每個問題帶規則名。順手改寫 `git.ts`、`build.test.ts`、`helpers/layout.ts` 三處註解，拿掉打錯大小寫的樣本，這三檔只放行 `plugins`。回歸測試補「例外檔出現沒放行的寫法照擋」。 |
| R4 誤報面 | 修前兩點：組字串只查程式與設定（`ts`／`js` 各種、`yml`、`yaml`、`.githooks/`），Markdown、JSON 不查；`plugins\/` 的訊息補 vault 路徑的放行寫法（從 `.obsidian/plugins/` 寫起或接外掛 ID `essence-…`；從 `configDir` 組的正規式仍會被擋，記成已知的限制）。其餘（別的 repo 網址、英文句子、`node_modules` 路徑、由紀錄同步到 roadmap 的列）記成已知的限制，寫進〈結果〉。 |
| R5 漏報 | 修便宜的那幾種：組字串加 `i` 旗標、引號後容許 `./` 或 `/`、模板裡 `apps/${` 不要求緊貼反引號（`` `${root}/apps/${code}` `` 擋得到）。`APPS_ROOT + 代號`、雙重跳脫、大括號與群組、`cd apps && cd cards` 記成已知的限制。 |
| R6 字面沒從表取 | 不改，寫進〈和規格不同的地方〉：字面大小寫都對，並由共用檢查看住；之後動到這幾處時再改成 `FOLDERS.cards`。 |
| R7 hooks 測試 | 修前兩點：刪掉重複的第二個迴圈與 `HOOK_FILES`、`copied`；追蹤但工作樹已刪的檔不複製（clone 裡也刪掉）。第三點：改成逐條放行後，替身留的註解是每個問題的 `target`，再掃一次仍命中同一條規則，`allow` 的每一條都留得下來，self-check 實跑通過。 |
| R8 列數 | 修，〈結果〉改成十二列；`git log --follow` 的抽查結果填回第 2 項。 |
| R9 訊息 | 第一點修：兩段式改法的訊息補「Linux 上正確的資料夾已經存在時，逐檔 `git mv` 到正確的路徑」。後兩點記著，等 Portal 的第一個任務碰到再調。 |
| R10 CRLF | 記進〈結果〉。 |
| 其他小事（`checkPluginImports` 等還叫 plugin） | 不改，驗收第 5 項沒要求。 |

報告原文只把 scratchpad 的完整路徑縮成 `<scratchpad>`（含帳號名稱），其餘照錄。

**第二輪**：R3、R4、R5 改了防線的邏輯（逐條放行、範圍收窄、pattern 放寬），照 `review.md`〈L2〉交給另一個沒參與的 Fable 5.2 high 子代理，只審這一輪的修正。

## 第二輪

待審：`f681828c1b58e21c16cf1bba9589f5f1c6ae4079`（`git diff 244da44 f681828`，第一輪的修正），另一個沒參與的 Fable 5.2 high 子代理審。

### 報告原文：`plugins/` 改名 `apps/`：合併前 L2 第二輪報告（Fable 5.2，獨立審查）

**結論：沒有擋合併的問題。** 第一輪 R1、R2、R3、R4、R5、R7、R8、R9 的修正都和〈Claude 核對與處理〉寫的一致，實跑成立。共 7 項發現，全部低嚴重度：S1、S3 建議合併前順手修（各一行，修法我實跑過），S2 是紀錄放錯地方（規範），其餘記著即可。

- 待審 commit：`f681828c1b58e21c16cf1bba9589f5f1c6ae4079`（`origin` 同一個 SHA）；範圍 `git diff 244da44 f681828`。
- 我沒有改 repo 的檔、沒有 commit、push，也沒碰任何 vault。
- 審查結束時 worktree 多了一個不是我做的未提交修改：`docs/tasks/rename-plugins-to-apps.md` 驗收第 10 項（雲端 session 的結果），應該是別的 session 正在寫，不在這輪範圍。

#### 發現（依嚴重程度）

##### S1（R5 修正引入）組字串的 pattern 放寬後多了三類誤報
- **軸**：規範與設計。
- **觸發條件**：程式或 workflow（`CODE_FILE`）裡出現下面任一種。
  - `apps/${` 左邊沒有界線：`` `myapps/${x}` ``、`` `webapps/${x}` ``、`` `${base}/installed-apps/${id}` ``、`` `x_apps/${a}` ``。
  - 引號後容許 `/`：路由與連結 `router.get('/apps', h)`、`fetch('/apps')`、`<a href="/apps">`。
  - `i` 旗標：介面文字 `t('Apps')`、`title: "Apps"`、`label: 'APPS'`。
- **預期／實際**：預期只擋組 repo 路徑的寫法。實際這些都報「用字串組資料夾：…改成查 tools/apps.ts」。第一輪的 pattern 下，前兩類不會報。
- **影響**：擋下引入那一行的 commit，要改寫法或進例外表；訊息對這些情況沒意義。
- **位置**：`tools/check-app-imports.ts:201`。
- **證據**：已重現（探針逐例跑 `checkText`）。現況 0 個誤報（工作樹與暫存區都過）。
- **真實路徑與機率**：現在不會。Portal（入口網頁）開始寫程式時，`'/apps'` 路由或 `'Apps'` 標籤有機會碰到一次；`xxxapps/${` 很低。
- **建議**：
  - 合併前修第一類：`apps\/\$\{` 前面加 `(?<![\w-])`，和另外兩條規則的界線一致。我實跑過：「§3 第 3 點」兩個測試通過，整個 repo 0 個問題，上面四個前綴例子變 0，`` `apps/${code}` ``、`` `${root}/apps/${code}` ``、`` `Apps/${code}` ``、`working-directory: apps/${{ … }}` 仍擋。
  - 後兩類是 R5 放寬的代價，收不窄，寫進已知的限制（見 S2）。網址模板 `` `https://api.github.com/apps/${slug}` `` 加界線後仍會報，一起記。

##### S2（延續 R4、R5、R9）已知的限制只寫在任務的〈結果〉，沒進 backlog
- **軸**：規範（`docs/agents/quality.md:128`：L2 這次不修的發現，共用工具的記在最上層 backlog 的〈已知的限制〉）。
- **預期／實際**：預期 `docs/backlog.md`〈已知的限制〉有對應的列（那一節已經有 `check-app-imports.ts` 的另一列）。實際 `f681828` 沒動 `docs/backlog.md`，限制只在 `docs/tasks/rename-plugins-to-apps.md:194-199`；`docs/tasks/` 是紀錄，開工不會讀。
- **同一段另外兩個問題**：
  - 第 199 行「`build.test.ts` 的 sourcemap 測試在 worktree 和 `%TEMP%` 同一顆磁碟時失敗」不是共用檢查的限制，也不是第一輪的發現（那段標題寫「L2 第一輪 R4、R5、R9」）。它是 Cards 測試的環境限制，repo 放在 C: 的 Windows 機器會讓 Cards 的 `npm run check` 失敗，該記在 Cards 的 backlog（技術債或已知的限制）。這一項我沒驗（見〈沒驗的項目〉）。
  - 第 197 行「程式裡…碰到 `apps/<軟體名>` 也會報」不準確：大小寫那條查全部文字檔（含 Markdown），而且只有大小寫不符才報。
- **影響**：之後碰到誤報或漏報的人查不到這是已知的。
- **證據**：靜態推斷（讀檔、`git diff --stat`）。
- **真實路徑與機率**：會發生（下一個碰到的 session 不會讀任務紀錄）。
- **建議**：合併前或收尾時把這幾項寫成 `docs/backlog.md`〈已知的限制〉的列（發生條件、影響與避開、來源），連同 S1、S4、S5、S6 要記的；sourcemap 那一項移到 Cards 的 backlog 並附重現。

##### S3（R3、R4 修正的測試缺口）三個行為把修正拿掉測試不會紅
- **軸**：規範與設計（回歸測試沒涵蓋到修正的全部）。
- **做法**：把 `HEAD` 的檢查與測試複製到 `<scratchpad>`，一次拿掉一項修正，跑「§3 第 3 點」兩個測試。

| 變異 | 結果 |
|---|---|
| R1 行號改回在原文上數 | 紅 |
| R3 例外檔沒放行的不報 | 紅 |
| R3 過期改回「整檔沒有任何問題才報」（第一輪的行為） | **綠** |
| R3 過期改成「放行的任一條有命中就不報」 | **綠** |
| R4 組字串查全部的檔 | 紅 |
| R4 `CODE_FILE` 拿掉 `yml` | 紅 |
| R4 `CODE_FILE` 拿掉 `.githooks/` | **綠** |
| R5 pattern 改回第一輪的、只拿掉 `i`、只拿掉引號後的 `./`、`apps/${` 要緊貼反引號 | 四種都紅 |
| `plugins\/`（原文那條）標成別的規則 | **綠** |

- **影響**：「放行的某一條用不到就報」是 R3 修正的重點（多條放行的列有 3 列），現在的測試只測到「整檔沒有任何命中」（`app-imports.test.ts:190`，用的是只放行一條的第一列）。真 repo 的檢查也測不到，因為每一列現在都有命中。
- **位置**：`tools/tests/app-imports.test.ts:181-199`；`tools/check-app-imports.ts:236-238`。
- **證據**：已重現。
- **真實路徑與機率**：之後有人改 `checkPaths` 才會碰到；低。
- **建議**：合併前補一個斷言：取 `allow` 超過一條的列，內容只留其中一條的樣本，期望恰好報出其餘各條「放行的「…」」。我實跑過：不改時通過，上面兩個綠的 R3 變異都變紅。`.githooks/` 與規則標籤那兩個可以順手各補一行，不補也行。

##### S4（延續 R5）仍漏的寫法有幾種沒列進已知的限制
- **軸**：規格（限制的清單不完整），實作照 R5 的建議。
- **觸發條件**（都是 0 個問題）：
  - `'../apps/' + code`、`new URL('../apps/', import.meta.url)`、`'../../apps/' + code`：引號後只容許一個 `./` 或 `/`。
  - `` `${root}/apps/` + code ``、`'x/apps/' + code`：`apps/` 後面緊接引號、前面不是引號。
  - `cd apps/$APP`、`cd "apps/$APP"`、`apps/$(…)`：workflow 與 hook 裡不加大括號的 shell 變數。
  - `'apps/%s'`、`` `apps${sep}${code}` ``。
- **影響**：本機照過，Linux CI 才紅；和 R5 同性質。
- **位置**：`tools/check-app-imports.ts:201`；`docs/tasks/rename-plugins-to-apps.md:196` 的清單。
- **證據**：已重現。
- **真實路徑與機率**：低。最可能的是 `tools/` 的程式寫 `'../apps/'`。現在的 workflow 與 hook 沒有 `apps/$`（已 grep）。
- **建議**：
  - 便宜的收窄可以做：引號後改成容許任意個 `./`、`../`、`/`（`(?:\.{0,2}\/)*`）。我實跑過：整個 repo 的程式與設定檔新增 0 個命中，前三個例子擋得到。
  - 其餘寫進已知的限制。不修也不擋合併。

##### S5（延續 R9）Linux 的補充大致正確，少一個情況
- **軸**：規範與設計。
- **核對結果**：「Linux 上正確的資料夾已經存在時，逐檔 `git mv` 到正確的路徑」方向正確。
- **缺的情況**：目的子資料夾不存在時（例如 `apps/Portal/` 只有 `README.md`，要搬 `apps/portal/guide/c.md`），`git mv` 不會自己建資料夾，回 `fatal: renaming … failed: No such file or directory`，要先 `mkdir -p`，或整個子資料夾一次搬。
- **位置**：`tools/check-app-imports.ts:129`。
- **證據**：
  - 缺的情況已重現（暫存 repo；這個行為和平台無關）。
  - Windows 上索引同時有 `apps/Portal/…` 與 `apps/portal/…`（模擬從 Linux 拉下來的 commit）時，逐檔 `git mv` 與訊息的兩段式都成功，索引都變成正確大小寫（已重現）。
  - Linux 上逐檔搬的成功情況是靜態推斷：這台機器沒有 WSL 發行版，也沒有 Docker。
- **真實路徑與機率**：很低（Linux、打錯大小寫、正確資料夾已存在、子資料夾還沒有，四個條件）。
- **建議**：記著，或訊息補「（目的資料夾不存在先建）」。測試（`app-imports.test.ts:133`）沒比對 Linux 那半句，可以不補。

##### S6（延續 R4）`CODE_FILE` 是白名單，之後新增的腳本類型不會查組字串
- **軸**：規範與設計。
- **觸發條件**：之後追蹤 `.sh`、`.ps1`、`.cmd`、`.py`、`.json`／`.jsonc`（`package.json` 的 scripts、`.claude/settings.json` 的 hook 指令）裡組路徑。
- **預期／實際**：實際 `cd "apps/${APP}"` 寫在 `.sh`、`"apps/"` 寫在 `package.json` 的 scripts 都是 0 個問題。大小寫與 `plugins` 兩條仍查全部檔案（已確認 `package.json` 裡的 `apps/cards`、`plugins/cards` 照擋）。
- **影響**：現在沒有漏。追蹤的檔沒有 `.sh`、`.ps1`、`.cmd`；`.py` 都在 `docs/archive/`（紀錄，本來就不查）；JSON、`.gitignore`、workflow 裡的 `apps` 全是完整字面路徑，由大小寫那條看住（已 grep）。
- **位置**：`tools/check-app-imports.ts:173`。
- **證據**：已重現（逐副檔名跑）。
- **真實路徑與機率**：要等有人新增 shell 或 PowerShell 腳本並在裡面組路徑；低。
- **建議**：寫進已知的限制一句（哪些副檔名查組字串）。不必改成黑名單：JSON 的誤報是 R4 收窄的原因。

##### S7 文字沒跟上的小地方（不必再送審）
- `tools/tests/hooks.test.ts:103` 的註解與 `app-imports.test.ts:181` 的測試名還寫「已經沒有被允許的寫法」，訊息已改成「放行的「…」這個檔已經用不到」。
- `tools/check-app-imports.ts:11-13` 的檔頭仍寫「表所在的檔以外用字串組資料夾」，沒寫只查程式與設定。
- `docs/tasks/rename-plugins-to-apps.md:184`「都寫進〈實作者自己選的做法〉」：新加的三點（逐條放行、R6、R10）在〈第一輪〉的處理表，不在那一節。
- 審查紀錄的〈審查對象〉「待審：`244da44`」是第一輪的；第二輪待審的完整 SHA（`f681828…`）還沒寫進檔案，附這份報告時補上。
- 處理表只有「處理」一欄，`review.md`〈修正後收尾〉要的四欄（條件與機率、影響、修法類型、會動到什麼）沒寫；這輪的修法都是收窄，影響不大。

#### 核對過、沒有問題的

- **R1 行號**：
  - 正規化只吃反斜線，不動 `\n`、`\r`：反斜線接換行、CRLF、連續反斜線的樣本，加 20000 個隨機字串，換行數都不變。
  - 40 行跳脫之後的命中，三條規則（`flat` 上的大小寫、`plugins/<軟體>`、組字串，與原文上的 `plugins\/`）都回報第 41 行；CRLF 與行尾反斜線的例子也對。
- **R3 逐條放行**：
  - 12 列的 `allow` 和各檔實際命中的規則完全一致，工作樹與 `HEAD` 都是（逐檔跑 `checkText` 統計）。`git.ts`、`build.test.ts`、`helpers/layout.ts` 現在只命中 `plugins`。
  - 沒放行的規則照報、放行的某條沒命中就報「用不到」，邏輯正確。
  - 過期偵測剩下的洞是做法本身的：放行的規則只要有一處命中（含註解）就算還在用，例如 `git.ts` 的 `MANIFESTS` 拿掉 `plugins/cards` 而註解還在；同一條規則內新增的命中不會被看見。第一輪 R3 已知，可接受。
- **R4**：`CODE_FILE` 對 `ts`、`tsx`、`mts`、`cts`、`js`、`jsx`、`mjs`、`cjs`、`yml`、`yaml`、`.d.ts`、大寫副檔名、`.githooks/` 底下都成立；`md`、`json`、`jsonc`、`html`、`css` 不查。`plugins\/` 的訊息和正規式的兩個放行條件一致。
- **R5**：`` `${root}/apps/${code}` ``、`'./apps/'`、`root + '/apps/'`、`join(root, 'Apps', 'Cards')`、`` `Apps/${code}` ``、`'apps\\' + code` 都擋得到；`'webapps'`、`'apps.ts'`、`'tools/apps.ts'`、`"apps/**"`、`'apps/*/docs/**'` 不誤報。
- **`hooks.test.ts`**：
  - `.githooks/` 三個檔與 `.secretlintrc.json` 都是追蹤的檔，`tools/*` 本來就取自追蹤清單，所以刪掉第二個迴圈後仍全部從工作樹複製。
  - `existsSync` 過濾後，工作樹已刪的追蹤檔不在 `wanted`，clone 裡的那一份被第 81 行刪掉，之後 `git add` 把刪除記進基準；替身的清單也用過濾後的 `wanted`，不會替已刪的測試檔寫替身。邏輯正確（靜態推斷）。
  - 替身保留註解：7 個會被換成替身的例外檔，替身再掃一次命中的規則與 `allow` 完全相同，`checkPaths` 0 個問題（實跑，含 `plugins\/`、`apps/${`、`'Apps'` 這些 target）。其餘 5 個例外檔不是替身，原檔照抄。
- **`progress-board.yml`**：`tools/apps.ts` 在 `on.push.paths` 裡，位置正確。順帶：`tools/decisions.ts` import 的 `tools/fences.ts` 不在清單，這是這次改動之前就有的，不在本輪範圍。
- **〈結果〉第 2 項**：Capture 6 個、Mindboard 5 個追蹤檔，和「全部抽了」相符；十二列正確。
- **〈結果〉第 11 項**（`gh run view`、`gh pr view`）：
  - run 44917630810（PR #31，只改 `apps/Mindboard/AGENTS.md`）：plan、shared、mindboard、gate 成功，cards、tools、capture 跳過。
  - run 44919385585（PR #32，只改 `apps/Cards/src/core/files.ts`）：plan、shared、cards、gate 成功，cards 的 `npm run build` 與 `git status --porcelain` 兩步成功，tools、capture、mindboard 跳過。
  - 兩個 PR 都是 draft、已關閉，基準是這個分支；遠端沒有 `claude/probe-d218-*`。
  - 探針是在 `244da44` 上做的；`f681828` 沒改 `tools/dispatch.ts` 與 `check.yml`，結論仍適用。
- **狀態行與 roadmap**：任務說明與審查紀錄的狀態行都是 D-217 的三欄，值在允許的範圍；`docs/roadmap.md` 那一列和任務說明的狀態、下一步、等誰相同，`roadmap-sync --check` 通過。
- **測試數**：這次沒有新增或刪除測試（`tools/tests` 兩個 commit 都是 171 個 `test(`），〈結果〉第 3 項的 238 不用改。
- **CI**：`f681828` 的 push（run 44924018613）與 pull_request（run 44924022145）七個 job 都成功，tools job 含 `hooks.test.ts`。

#### 跑過的指令與結果

| 指令 | 結果 |
|---|---|
| `node tools/check-app-imports.ts`、`--staged`（repo 根） | 都通過 |
| `node --test --test-concurrency=1 --test-timeout=600000 tests/app-imports.test.ts` | 12 個全過 |
| 同上 `tests/dispatch.test.ts` | 75 個：74 過、1 跳過 |
| `node tools/check-docs.ts` | 通過（395 檔、8114 個連結） |
| `node roadmap-sync.ts --check` | 狀態板和入口一致 |
| 探針：例外表各檔命中的規則與替身模擬 | 12 列一致，7 個替身 0 個問題 |
| 探針：R1 行號、R4 副檔名、R5 誤報與漏報樣本 | 如各項 |
| 變異測試 13 種（`<scratchpad>` 的副本） | 9 紅、4 綠（S3） |
| 建議的修法實跑（S1 界線、S3 斷言、S4 前綴） | 都成立，repo 0 個新問題 |
| 暫存 repo：混合大小寫的索引逐檔與兩段式 `git mv`、目的資料夾不存在 | 如 S5 |
| `gh run view` 四個 run、`gh pr view 31`／`32`、`git ls-remote --heads` | 如上 |

沒有遇到記憶體錯誤。我建的 `<scratchpad>\l2r2`（探針、變異副本、三個暫存 repo）已刪；scratchpad 裡原有的檔沒動。

#### 沒驗的項目與原因

- **`tools/tests/hooks.test.ts` 在 Windows 沒跑**：機器記憶體偏緊；這次的改動和平台無關，Linux CI 在 `f681828` 兩次都過，替身的部分另用探針驗過。「工作樹已刪的追蹤檔」那條路徑一般的執行走不到，只做靜態推斷。
- **`build.test.ts` 同一顆磁碟會失敗**（〈結果〉第 199 行）：要在 C: 放一份裝好相依的 Cards 才能重現，沒做；`build.mjs:131-134` 讀起來兩種磁碟配置都有處理，看不出失敗點，所以這句的原因（junction 的相對路徑）待驗證。
- **Linux 上的 `git mv`**（S5 成功的情況）：沒有 Linux 環境。
- **`tools/` 的 `npm run self-check` 全套、Cards 的 `npm run check`**：照指示不跑。
- **驗收第 10 項**：別的 session 正在寫，未提交，不在這輪範圍。
- **合併後的 Pages**：要合併後才有。

### Claude 核對與處理

逐項核對，全部同意。S1、S4 的 pattern 照審查者實跑過的寫法改，修完重跑「§3 第 3 點」兩個測試與整個 repo 的 `check-app-imports.ts`，都通過、0 個問題。

| 項目 | 條件與機率 | 影響 | 修法類型 | 會動到什麼 |
|---|---|---|---|---|
| S1 `apps/${` 沒有左界線 | 程式裡 `` `myapps/${x}` `` 這類前綴；低 | 誤報擋 commit | 修：前面加 `(?<![\w-])`；路由 `'/apps'`、介面文字 `'Apps'`、網址模板是 R5 放寬的代價，記成已知的限制 | `check-app-imports.ts` 一個 pattern；測試加四個不報的樣本與 `` `Apps/${code}` `` |
| S2 限制只寫在任務紀錄 | 下一個碰到的 session 不讀紀錄；會發生 | 查不到是已知的 | 修：共用檢查的四列寫進[最上層 backlog〈已知的限制〉](../backlog.md#已知的限制)（含 S1、S4、S6 與第一輪 R4、R5、R9；大小寫那條查全部文字檔的說法改正）；sourcemap 那一項移到 [Cards 的 backlog](../../apps/Cards/docs/backlog.md#已知的限制)，原因寫「沒查」，不寫沒驗證的 junction 推測；〈結果〉那一段換成連結 | 兩份 backlog、任務〈結果〉 |
| S3 過期偵測的測試缺口 | 之後有人改 `checkPaths`；低 | 改壞不會紅 | 修：補「放行好幾條的列只剩一條命中，其餘每條都報用不到」的斷言 | `app-imports.test.ts` |
| S4 引號後只容許一個 `./` 或 `/` | 程式寫 `'../apps/'`；低 | 漏報，Linux CI 才紅 | 修：引號後容許任意個 `./`、`../`、`/`（`(?:\.{0,2}\/)*`）；其餘（`'x/apps/' + code`、不加大括號的 shell 變數、`'apps/%s'`）記成已知的限制 | `check-app-imports.ts` 同一個 pattern；測試加兩個樣本與 hook 裡的 `cd "apps/${APP}"` |
| S5 Linux 目的資料夾不存在 | 四個條件同時成立；很低 | `git mv` 失敗，訊息看得到 | 修：訊息補「目的資料夾不存在就先建」 | `TWO_STEP` 一句 |
| S6 `CODE_FILE` 是白名單 | 新增 `.sh`、`.ps1` 等並在裡面組路徑；低 | 漏報 | 記成已知的限制 | backlog 一列 |
| S7 文字 | — | — | 修：hooks 測試註解、測試名、檔頭註解、〈和規格不同的地方〉的說明；這張表補成四欄 | 註解與文件 |

報告原文照錄（審查者已經把 scratchpad 的路徑寫成 `<scratchpad>`）。

**不送第三輪**：這輪改的兩處 pattern（S1、S4）是審查者提出、並在整個 repo 實跑過的寫法，其餘是測試、訊息與文件；沒有新的判斷邏輯。合併前的 commit 照常跑 pre-commit 與 CI。
