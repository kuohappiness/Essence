# 官方審查的程式檢查加進 Cards 的檢查（D-220 第 3 點，給 Claude，雲端可做）

狀態：已合併｜完成：Cards 的 lint 擋 Obsidian 官方審查會算錯誤的寫法，現有 13 個 lookbehind 記成基準（PR #39）｜等誰：—

遵守 repo 根目錄的 `AGENTS.md`。建議模型與推理等級：**Opus、高**。

依據：[D-220](../../../../docs/decisions.md#d-220-給其他家庭的外掛上架-obsidian-官方目錄第一個外部家庭要裝時才上架) 第 3 點。上架前其他要做的事在[更新與相容的規畫〈上架 Obsidian 官方目錄〉](../plans/updates.md#上架-obsidian-官方目錄d-220)，不在這一步。

基準：`main` 的 `b30f596`（2026-11-22）。下面的數字是在這個基準、用 `eslint-plugin-obsidianmd` 0.6.0 的審查等同設定（官方說明〈[Community plugin scanner configuration](https://github.com/obsidianmd/eslint-plugin/blob/HEAD/docs/configuration.md#community-plugin-scanner-configuration)〉的〈Full scanner-equivalent configuration〉，另加新送審外掛的那一層）跑 `apps/Cards/src` 與 `manifest.json` 得到的；開工時在新的 `main` 重跑一次。

## 和「不做」比較（D-153、D-177）

- **不做**：v1 期間新寫的程式可能再加會擋上架的寫法（`<style>` 元素、`innerHTML`、lookbehind 的正規表示式、直接設樣式），上架前一次改，量更大、離寫的時候更久。
- **做**：新的錯誤在 commit 當下擋下；現有的錯誤用基準記住，不改讀格式的程式。代價是多一個開發相依、lint 慢一點，量一次寫進〈結果〉。
- **更小的做法**：只在上架前手動跑一次。擋不到 v1 期間新加的，和不做差不多。

## 本機或雲端（[quality.md〈本機或雲端〉](../../../../docs/agents/quality.md#本機或雲端)）

雲端。只改 lint 設定、`package.json` 與鎖檔、`src/main.ts` 一行、文件；不碰 Obsidian、vault、資料格式，不在高風險範圍，不做 L2。`main.ts` 那一行改的是電腦的狀態列「N 項提醒」一開始先藏起來，用現有的測試與建置確認；下一次電腦實機測試順便看一眼狀態列。

## §1 要做的

1. **相依**：在 `apps/Cards/` 把 `eslint-plugin-obsidianmd` 加進 `devDependencies`，釘開工時的最新版（基準時是 0.6.0）。Cards 用 ESLint 10，安裝時的 peer 警告照它 README 的說明可以忽略；`npm ci` 要能過。
2. **規則只開會擋上架的**（官方設定新送審的外掛算錯誤的那些），在 `apps/Cards/eslint.config.js` 加一個區塊，範圍是 `src/**/*.{ts,tsx}`，排除開發版專用的檔（見第 4 點），全部設 `error`：
   - 安全類：`no-eval`、`no-new-func`、`@typescript-eslint/no-implied-eval`、`no-unsanitized/method`、`no-unsanitized/property`、`obsidianmd/regex-lookbehind`、`obsidianmd/no-forbidden-elements`。
   - 新送審外掛的那一層：`obsidianmd/no-static-styles-assignment`、`obsidianmd/platform`、`obsidianmd/no-unsupported-api`、`obsidianmd/sample-names`、`obsidianmd/no-sample-code`、`obsidianmd/no-plugin-as-component`、`obsidianmd/detach-leaves`、`obsidianmd/no-view-references-in-plugin`、`obsidianmd/settings-tab/no-manual-html-headings`、`obsidianmd/settings-tab/no-problematic-settings-headings`。
   - 註解：`eslint-comments/no-unlimited-disable`、`eslint-comments/require-description`、`eslint-comments/disable-enable-pair`，以及 `eslint-comments/no-restricted-disable` 擋 `obsidianmd/*`（官方設定不准用註解關掉這些規則，所以我們也不准）。
   - 不用 `configs.recommended` 整包：它會再開約 290 項警告的規則與一整套 typescript-eslint 的設定。只開上面這些的寫法照它的 [configuration.md〈Using only obsidianmd rules〉](https://github.com/obsidianmd/eslint-plugin/blob/HEAD/docs/configuration.md#using-only-obsidianmd-rules-without-the-recommended-config)；`no-unsupported-api` 要讀得到 `obsidian` 的型別（Cards 已經裝了）。規則名稱照開工時的版本核對，改名或拿掉的照實寫進〈結果〉。
3. **現有的錯誤**（基準時正式程式 14 項）：
   - `src/main.ts` 第 324 行 `this.statusBar.style.display = 'none'`：改用 Obsidian 的 `hide()`／`toggle()` 或 CSS class；第 478 行同一個元素的顯示切換一起改成同一種寫法，行為不變（沒有提醒時不顯示，有提醒時顯示「Essence Cards：N 項提醒」）。
   - 13 項 `regex-lookbehind`（`core/ai/deepen-snapshot.ts`、`core/catalog/scope.ts`、`core/deck/markdown.ts`、`core/deck/question-types.ts`、`core/deck/sources.ts`、`review/extras.ts`）：**不改寫**，它們多在讀學習目標 ID 與出處的程式，改寫在上架前配完整測試與發布前比較做（D-220 理由最後一點）。用 ESLint 的 bulk suppressions（`eslint --suppress-rule obsidianmd/regex-lookbehind`，產生 `apps/Cards/eslint-suppressions.json`）記成基準：之後同一個檔多一個就擋，改寫掉的用 `--prune-suppressions` 拿掉。不用 `eslint-disable` 註解（第 2 點已擋）。
4. **開發版專用的檔先不檢查**：基準時錯誤在 `src/obsidian/dev-*.ts`（建 `<style>`、`insertAdjacentHTML`、直接設樣式、1 項 lookbehind）。先確認哪些檔只在 `DEV` 是 true 時才進得了 `main.js`：正式建置（`DEV` 是 false）後在 `main.js` 找這些檔獨有的字串，找不到才算開發版專用，排除清單照實列；進得了正式建置的就照第 3 點處理。上架時這些檔不放進公開 repo 或改掉，已寫在規畫。
5. **文件**：[quality.md〈檢查指令〉](../../../../docs/agents/quality.md#檢查指令)的 Cards `npm run check` 那一句補上「含 Obsidian 官方審查會算錯誤的規則（D-220）」；`eslint.config.js` 的新區塊開頭用一兩行註解寫為什麼、連到 D-220。

## §2 驗收

1. `apps/Cards/` 的 `npm run check` 通過，CI 綠燈。
2. **探針**：在 `src/` 一個不是開發版專用的檔暫時加這幾種寫法，`npm run lint` 每一種都擋下，拿掉後通過；結果寫進〈結果〉，探針不 commit。
   - 一個含 lookbehind 的正規表示式（例如 `/(?<=a)b/`），加 `// eslint-disable-next-line obsidianmd/regex-lookbehind -- 測試` 也擋。
   - `document.head.appendChild(document.createElement('style'))`。
   - `el.innerHTML = text`。
   - `el.style.color = 'red'`。
3. 已記成基準的 13 項不擋；在其中一個檔再加一個 lookbehind 會擋。
4. 用官方的審查等同設定（同上，含新送審外掛那一層）重跑 `apps/Cards/src`（排除第 4 點的檔）與 `manifest.json`：錯誤只剩基準的 lookbehind；警告的數量寫進〈結果〉當之後清理的起點。
5. 正式建置的 `main.js` 除了第 3 點那一處以外沒有差別（建置前後比對，或說明為什麼有別的差別）。
6. 量一次：`npm ci` 與 `npm run lint` 在加之前、加之後各花多少時間，寫進〈結果〉。

## 不在這一步

改寫 lookbehind 的正規表示式、清警告、改開發版專用的檔、`manifest.json` 的介紹（目前結尾是「。」，官方要英文句點、驚嘆號或問號，算警告）、公開 repo、授權、上架。這些都在[規畫](../plans/updates.md#上架-obsidian-官方目錄d-220)。

## 結果

實作在分支 `claude/project-thread-nkvvca` 的 `6c609fd`（雲端，2026-11-22），基準是 `main` 的 `ee4ab0a`；開工時重跑，錯誤和 `b30f596` 一樣是正式程式 14 項。

延後的測試：「補測：電腦狀態列改用 hide()／toggle() 之後的顯示」

### 做了什麼

- **相依**：`eslint-plugin-obsidianmd` 釘 `0.6.0`（開工時 npm 上的最新版）。安裝印 `ERESOLVE overriding peer dependency`，照它 README 是 ESLint 10 的已知情況；`npm ci` 通過（`node_modules` 從 153 個套件變成 315 個）。
- **規則**：`apps/Cards/eslint.config.js` 最後的 `obsidianReview` 區塊，§1 第 2 點列的 22 條規則全部 `error`，名稱和 0.6.0 一致，沒有改名或拿掉的。`no-unsanitized`、`eslint-comments` 兩個外掛不另外裝，從 `obsidianmd.configs.recommended` 取它帶的那一份（和官方審查同版本，找不到就讓 lint 直接失敗）。`no-restricted-disable` 只擋 `obsidianmd/*`，沒有照官方再擋 `no-console` 等其他規則：那些不在這一步的範圍。
- **排除清單**：`src/obsidian/dev.ts` 與 `src/obsidian/dev-*.ts`（21 個檔）。確認方法：正式建置的 esbuild metafile 裡這 21 個檔都不是輸入；`dev.ts` 只由 `main.ts` 的 `if (DEV)` 動態載入，其餘 20 個只被 `dev*.ts` import；有字串可比的 15 個檔，各自的字串在開發版 `main.js` 有、正式版沒有。
- **`main.ts`**：狀態列一開始用 `hide()`，更新時用 `toggle(count > 0)`，兩處同一種寫法；`no-unsupported-api` 沒報，表示 `minAppVersion` 1.8.7 就有。測試用的 Obsidian 替身（`tests/helpers/obsidian.ts`）照 Obsidian 的寫法補上 `hide()`／`show()`／`toggle()`（改 `style.display`），`main-wiring` 原有的三個斷言（有提醒時 `''`、沒有時 `'none'`）不改、照樣通過。
- **回歸測試**（規格沒寫，另加）：`tests/eslint-rules.test.ts` 加一個測試，把 §2 第 2 點的五種寫法（含用註解關）在 `src/obsidian/save.ts` 都要擋、在 `src/obsidian/dev-markup.ts` 都不擋寫死，之後有人改設定時自動發現；拿掉 `obsidianReview` 區塊時這個測試失敗。同一個檔原本的測試用 `disableTypeChecked` 跑片段，新區塊的 `no-unsupported-api` 等要型別，所以改用 `syntaxOnly`：再關掉 `obsidianmd.ruleConfigs.recommendedTypeChecked` 列的規則，其他不變。
- **基準**：`apps/Cards/eslint-suppressions.json`，只記 `obsidianmd/regex-lookbehind`：`core/deck/sources.ts` 8 項，`core/ai/deepen-snapshot.ts`、`core/catalog/scope.ts`、`core/deck/markdown.ts`、`core/deck/question-types.ts`、`review/extras.ts` 各 1 項，共 13 項，和規格一致。

### 驗收

1. `apps/Cards/` 的 `npm run check` 通過（型別、lint、knip；測試 2907 項：通過 2903、失敗 0、略過 4）。第一次跑有 27 項失敗：6 項 ESLint 測試是本來的片段測試碰到新區塊要型別的規則（已改，見上面〈回歸測試〉），21 項是雲端的 clone 沒有版本 tag（`pathspec 'v0.3.0' did not match`），抓下 tag 後重跑都通過。CI 看 PR 的 Check。
2. **探針**（加在 `src/obsidian/save.ts` 檔尾，一次一種，跑 `npx eslint` 那個檔；都已拿掉、沒有 commit）：
   - `/(?<=a)b/` → `obsidianmd/regex-lookbehind` 擋。
   - 同一行前面加 `// eslint-disable-next-line obsidianmd/regex-lookbehind -- 測試` → 改由 `eslint-comments/no-restricted-disable` 擋（「Disabling 'obsidianmd/regex-lookbehind' is not allowed」）。
   - `document.head.appendChild(document.createElement("style"))` → `obsidianmd/no-forbidden-elements` 擋。
   - `el.innerHTML = text` → `no-unsanitized/property` 擋。
   - `el.style.color = "red"` → `obsidianmd/no-static-styles-assignment` 擋。
   - 拿掉後 exit 0。
3. 基準的 13 項不擋（`npm run lint` exit 0）；在 `core/deck/sources.ts` 再加一個 lookbehind → 擋。注意：超過基準時 ESLint 會把那個檔的 9 項全部列出，不是只列新加的那一項。
4. **官方設定重跑**：用 `obsidianmd.configs.recommended`（parserOptions 照官方的 `projectService`），排除測試、`tools/` 與第 4 點的檔，跑 `src` 與 `manifest.json`，再照官方說明的嚴重度分（舊外掛只有安全類與 `regex-lookbehind`、`no-forbidden-elements` 算錯誤，加上新送審外掛那一層與三條註解規則；`no-undef`、`restrict-template-expressions` 等官方關掉的不算）。錯誤只剩基準的 13 項 lookbehind。警告 125 項：`prefer-window-timers` 49、`prefer-create-el` 24、`no-irregular-whitespace` 17、`prefer-active-doc` 11、`prefer-instanceof` 9、`no-nodejs-modules` 8、`no-useless-assignment` 2，`no-control-regex`、`no-misleading-character-class`、`preserve-caught-error`、`settings-tab/prefer-setting-definitions`、`no-useless-escape` 各 1；另外 `manifest.json` 的介紹結尾不是英文標點（`validate-manifest`，官方審查關掉這條，上架前照規畫改）。這是之後清理的起點；比規畫時的「約 290」少，是因為這次排除了開發版專用的檔。這份設定是暫時的，沒有 commit。
5. **建置比對**：在同一個 commit 前後各建一次正式版，`main.js` 以分號切開逐行比，只有兩種差別：狀態列那兩處（`style.display="none"` → `hide()`，`style.display=t?"":"none"` → `toggle(t>0)`），以及建置版本多了 `.dirty`（工作樹有沒 commit 的改動，不是程式的差別）。
6. **時間**（雲端容器，Node 22，各量 1～2 次）：`npm ci` 加之前 3.8～4.3 秒、加之後 5.5 秒；`npm run lint` 加之前 32.0～36.2 秒、加之後 37.9～40.1 秒，約多 3～6 秒。

### 其他

- `npm audit`（含開發相依）從 9 項 moderate 變成 12 項，多的 3 項（`eslint-plugin-obsidianmd`、它帶的 `@microsoft/eslint-plugin-sdl`、`eslint-plugin-n`）都只在開發相依；CI 跑的 `npm audit --omit=dev --audit-level=high` 是 0 項。
- 這個容器只有 Node 22（`package.json` 要 24），`npm` 印 `EBADENGINE` 警告；檢查都在 Node 22 跑過，CI 用 Node 24。
- **另修一個既有的問題**（`d8d9adf`，單獨一個 commit）：雲端 commit 時，pre-commit 的 Cards 完整檢查在 `tests/build.test.ts` 的 sourcemap 測試失敗（「相對 repo、用 /」）。原因：hook 的暫存副本借工作樹的 `node_modules`（連結），esbuild 給的是真實路徑，對照表裡 `node_modules` 的來源變成 `../../…` 開頭；和[技術債表](../backlog.md#技術債)那一列 Windows 同一顆磁碟才失敗是同一個原因。`tools/build.mjs` 把連結指到的真實路徑換回 root 底下的 `node_modules`，只動對照表、不動 `main.js`。在連結的副本裡：改之前這個測試失敗、改之後通過；工作樹的 `build`、`locate` 測試 22 項通過。Windows 的 junction 還沒跑過，那一列改成等 Windows 驗證。
- 和規格不同的地方：多了上面的回歸測試與 sourcemap 的修正；其他沒有。
