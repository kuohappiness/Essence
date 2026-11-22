# 官方審查的程式檢查加進 Cards 的檢查（D-220 第 3 點，給 Claude，雲端可做）

狀態：規劃中｜下一步：開一個雲端 session 照這份實作｜等誰：Claude

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

（實作完填：版本、排除清單、基準的內容、探針與重跑的結果、量到的時間、和規格不同的地方。）
