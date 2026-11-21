# `plugins/` 改名 `apps/`：合併前 L2（給 Fable 5.2 high）

狀態：待審｜下一步：第二輪，另一個 Fable 5.2 high 子代理只審第一輪的修正｜等誰：Claude

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
