# D-208 第二步 A｜Codex L2 審查

狀態：L2 通過（第四輪；R11、R12 記成已知的限制，合併後寫進 `main` 的 backlog），見〈結論〉

## 先讀這裡

[任務說明](../tasks/one-repo-step-2.md)的 A（Cards 搬進 `plugins/cards/`）合併前的 L2。請求與每一輪要讀的範圍在[審查請求](../tasks/one-repo-step-2-review.md)。每一輪是新的 Codex session；下一輪只讀〈先讀這裡〉、上一輪的〈Claude 回應〉與還沒結的項目。

## 第一輪｜Codex 報告

2026-11-20，Codex（gpt-6.2-sol、high、workspace-write），待審 `c298cf1`，規格基準 `ecb85f9`。原文（本機路徑的連結改成 repo 相對路徑，標題降一級）：

狀態：第一輪待修。建議合併前先處理 R1、R2。

待審 commit 為 `c298cf15c03591c7bdc421a2c0ba87116446c85e`，分支為 `claude/one-repo-step-2a`。以 `ecb85f9ed4e42b7090a152472d98e63bea936507` 的規格為基準，查核 §A0～§A8、A1～A19 與平台事實。B 文件搬家另案。所有寫入都在系統暫存區，暫存檔已刪除，原工作樹的狀態與開始時相同。完整報告在本則回覆。 審查請求（`tasks/one-repo-step-2-review.md`） · 任務規格（`tasks/one-repo-step-2.md`）

### 發現

#### R1｜P2｜搬家前分出的 PR 會漏跑 Cards 檢查

- **規格軸，已重現。** §A3 要求 Cards 工具變更跑 Cards 完整檢查。PR 的 job 在合併後的樹執行，`plan` 卻以分岔點到 PR head 的舊路徑分派。只改搬家前的 `tools/install.ts` 時，Git 會把改動合到 `plugins/cards/tools/install.ts`，分派仍按 `tools/` 第 7 條處理。
- **證據與影響。** 在暫存 clone 從 `ecb85f9` 分支，只改 `tools/install.ts`，再合到 `c298cf1`。PR 自己的 diff 是 `M tools/install.ts`，基底到實際合併樹的 diff 是 `M plugins/cards/tools/install.ts`。以這兩個端點和合併樹模擬 `pull_request` 事件，實跑 `node tools/ci-gate.ts plan` 得到「共用工具：跑」「Cards：不跑」。`gate` 依這個旗標接受 Cards 跳過。
- **真實路徑與處理。** 會發生。整體機率偏低，集中在搬家後才送出的舊分支。只要舊分支僅改這類 Cards 工具，且改動能乾淨合到新位置，就會觸發。建議依可核對的 PR 基底與實際合併樹補充分派，無法核對時跑全部。修正後請 Claude 從 `ecb85f9` 建探針分支，只改 `tools/install.ts`，向修正版開 draft PR，核對 `pull_request` 的 plan 與 cards job。 PR 端點與分派（`tools/ci-gate.ts:24`） · 分派表（`tools/dispatch.ts:60`） · CI job（`.github/workflows/check.yml:63`）

#### R2｜P2｜從 repo 根用 `npm --prefix` 時，相對路徑會指到另一個 vault

- **規格軸，已重現。** §A8 把 `npm --prefix plugins/cards run …` 列為從 repo 根執行的入口。npm 在 Cards 套件目錄執行 script，`install-vault` 又用該目錄解析相對參數。以前從 repo 根執行時，同一個相對參數以 repo 根為基準。
- **證據與影響。** 在暫存 clone 同時建立 `review-vault/` 和 `plugins/cards/review-vault/`。從 repo 根執行 `npm --prefix plugins/cards run install-vault -- review-vault --register-test` 成功，`.local/test-vaults.json` 登錄的是第二個。安裝與重裝路徑也在同一個 npm 工作目錄解析 vault。若兩個位置都有 vault，後續操作可能作用在另一個 vault。
- **真實路徑與處理。** 會發生。任何搭配 `--prefix` 的相對參數都會切換解析基準。解析到另一個已存在的 vault 需要路徑剛好吻合，機率偏低。建議以 npm 的 `INIT_CWD` 統一解析使用者傳入的檔案系統路徑，並核對安裝、更新、備份、還原的入口。若要保留套件相對語意，應在這個入口拒絕相對 vault 路徑，並同步改命令說明。 文件入口（`docs/agents/quality.md:49`） · 安裝解析（`plugins/cards/tools/install.ts:168`） · 登錄解析（`plugins/cards/tools/install.ts:244`）

#### R3｜P3｜第 6 條漏認合法的入口相依

- **規格軸，已重現。** §A3 把檢查入口遞迴載入的 `tools/` 檔列入第 6 條。實作的靜態 `import` 比對依賴行首，遞迴讀取也漏掉 `.cjs`。
- **證據與影響。** 暫存 repo 中，`tools/hooks.ts` 在同一行的第二個敘述用 `import './new-entry.ts'`。另一組用 hook 呼叫 `node tools/start.cjs`，由它 `require('./worker.cjs')`，實跑會執行 `worker.cjs`。兩組在接線完成後只改被載入的檔，`--staged` 和 `--range --ci` 都判第 7 條，只跑共用工具。
- **真實路徑與處理。** 目前檢查入口的交叉比對通過，現行接線未觸發。將來新增這類合法接線時會遇到，機率偏低。現有 TypeScript 對照測試可在加入接線時揭露一部分落差。建議讓執行時與獨立驗收涵蓋相同的入口副檔名，並固定驗證「接線已存在，只改下游檔」。無法可靠辨識的語法可保守分派全部。 入口掃描（`tools/dispatch.ts:142`） · 獨立驗收（`tools/tests/dispatch.test.ts:338`）

#### R4｜P3｜搬連結腳本會破壞角括號網址，也會改到同名外部 repo

- **規格軸，已重現。** §A6 要求支援行內、引用式與角括號連結，只更新本 repo 的 GitHub 網址並保留錨點。腳本用整份文件的 `href` 集合確認目標，再用數個正規式找字元範圍。同一段網址可被兩個正規式選中，GitHub 網址比對也接受任何 owner。
- **證據與影響。** 對 `[Code](<https://github.com/kuohappiness/Essence/blob/main/src/a.ts#L11>)` 呼叫 `rewrite()`，同一範圍產生兩筆編輯，輸出尾端變成 `…/plugins/cards/src/a.ts#L11>/src/a.ts#L11>)`。引用式定義同樣重現。另一個樣本把 `someone-else/Essence` 的網址也改到新路徑。多行目的地則漏改。這三種原文都會影響搬完後的連結正確性。
- **真實路徑與處理。** 有合法 Markdown 會觸發。A 的待審樹重跑 `--check` 顯示 0 個修改，未重現 A 已提交的連結被上述樣本破壞。B 再用腳本時的機率取決於文件是否含這些寫法。建議在 B 使用前，讓編輯對應到解析器確認的實際位置、排除重疊、限制 repo owner，並用上述例子驗證改完後仍可解析且第二次無變動。 候選範圍與網址（`experiments/tools/move-links.mjs:66`） · 套用編輯（`experiments/tools/move-links.mjs:100`）

#### R5｜P3｜搬家後的 `locate` 回傳舊的 repo 相對路徑

- **規範與設計軸，已重現。** `locate` 的介面約定回傳 repo 相對路徑。搬家後 `buildPlugin` 把 source map 的路徑改以 Cards 根為基準，`locate` 直接回傳該值。
- **證據與影響。** 用待審程式建置到暫存區，寫入含正確雜湊的測試 `release.json`，再以 `locate` 查 `185:18461`。回傳 `src/main.ts:1:1` 與正確原始碼文字。`git cat-file -t HEAD:src/main.ts` 找不到檔案，`HEAD:plugins/cards/src/main.ts` 是 `blob`。維護者仍可讀出程式碼，但照回報路徑查 Git 會失敗。
- **真實路徑與處理。** 會影響每個搬家後新建置的 Cards 原始碼定位，整體機率隨正式版錯誤排查頻率而定。建議新產物以實際 repo 根產生對照表路徑，保留讀舊對照表的行為，並用新舊建置各驗一次 `locate` 路徑能在各自 commit 找到。 對照表產生（`plugins/cards/tools/build.mjs:122`） · 定位回傳（`plugins/cards/tools/locate.ts:63`）

### 驗證結果

- **搬檔與歷史。** `e7130d4` 的 13 個改名和 `7637a8c` 的 379 個改名均逐檔驗過 `git log --follow`，392 個都接到舊路徑及搬家前最後一次修改。待審範圍內 194 個產品原始檔全是 `R100`。基準與待審版的 `embedRules()` 五個科目 `deepEqual`，四個進度頁逐行相同。
- **本機檢查。** Windows Git 2.52、Node 24.13、npm 11.6.2。只放 `tools/` 相依的暫存 clone，`npm run check` 和 `npm run self-check` 通過，後者 158 過、1 跳過，跳過的是 Windows 換行檔名案例。只放 Cards 相依的 clone，型別、lint、knip 通過。Cards 測試記錄 2,543 過、88 失敗，暫存路徑上的 esbuild 多次回報 `Access is denied`，因此 Cards 全套結果列為待驗證。跨搬家比較的測試及 `update-vault --check` 三段各自失敗即停止的測試都通過。兩個跨外掛 import 樣本 stage 後都被擋下。
- **工作樹與舊資料。** 兩個新舊 worktree 的 `core.hooksPath` 分別指向另一個 checkout，空 commit 仍各自執行到對應版本。非快轉合併跑過共用檢查，舊路徑的變更落到新路徑。舊 tag 與新版 worktree 共用同一個暫存 `.local/`，兩版都能從舊格式的測試 `release.json` 重裝，三檔雜湊相同。用 `v0.6.0` 工具產生的 ZIP 由新版 `--plan`、`--apply` 還原，卡組逐位元組相同，複習紀錄恰好補回一行。淺層 clone 缺 tag 時明確停止，補抓後從 Cards 子資料夾可辨認兩種根。
- **GitHub 唯讀核對。** 已查看既有 job 結果和 plan 日誌。A 的 push 與兩個過渡 commit 的七個 job 都成功。三個 PR 探針的比較基點都是 `1bdc1ef`，分別只選 Cards、只選 tools、同時選 Cards 與 tools，結果符合規格。這些探針都從搬家後的 commit 分出。 [A 的 push](https://github.com/kuohappiness/Essence/actions/runs/44683399772) · [Cards 探針](https://github.com/kuohappiness/Essence/actions/runs/44685340185) · [tools 探針](https://github.com/kuohappiness/Essence/actions/runs/44685345668) · [文件探針](https://github.com/kuohappiness/Essence/actions/runs/44685350055) · [過渡 commit](https://github.com/kuohappiness/Essence/actions/runs/44683434100) · [搬家 commit](https://github.com/kuohappiness/Essence/actions/runs/44683434330)

**待驗證。** 本機乾淨 `npm ci` 讀快取遇到 `EPERM`，這輪改用現有相依的副本。基準版在暫存區建置受 esbuild 存取錯誤阻擋，正式版與 dev 版的逐位元組比較待獨立驗證。舊 tag 與新版本的完整正式更新演練、Obsidian 與 iPhone 依實作者紀錄，本輪使用自編 vault。實際雲端 SessionStart 由 Claude 另驗，Pages 部署合併後驗。R1 的跨搬家 GitHub PR 探針待跑，目前證據為本機合併樹的重現。 實作者驗收紀錄（`tasks/one-repo-step-2.md:346`）

## 第一輪｜Claude 回應

2026-11-20 Claude（Opus 5.5）。五項逐一在 `c298cf1` 核對，都成立。R1、R2、R3、R5 修（一項一個 commit，先寫會失敗的回歸測試，修之前跑過是失敗的）；R4 記成 B 的開工條件（腳本只在 B 再用，[任務說明 §B0](../tasks/one-repo-step-2.md#b0-開工條件) 第 4 項）。每項寫真實、修之前、修之後三欄與判斷。

### R1 搬家前分出的 PR 漏跑 Cards

- **真實／修之前／修之後**：搬家前開的分支只改 `tools/install.ts`，GitHub 的合併樹裡改的是 `plugins/cards/tools/install.ts`，該跑 Cards。修之前 plan 只跑共用工具（測試重現：`tools`）；修之後 `tools,cards`。
- **發生條件與機率**：停手時段之前開、搬家後才發 PR 的分支，只改 Cards 的工具或設定（舊路徑在 `tools/`）。改 `src/` 的舊分支落到第 10 條（不認得的路徑，全部跑），不受影響。低。
- **影響**：Cards 的檢查沒跑，gate 照 plan 放行。
- **修法**：PR 事件另外用 GitHub 的合併 commit（`GITHUB_SHA`）對第一個 parent 的差異分派，和分岔點到 head 的結果取聯集（任一邊要跑就跑，理由取要跑的那一邊）；合併 commit 的第二個 parent 不是 PR 的 head（或不是合併 commit）就跑全部。只會多跑，不會比原本少。
- **動到什麼**：`tools/ci-gate.ts` 的 `endpoints`、`plan`；`tools/tests/ci-gate.test.ts` 新增一個測試，原本兩個 PR 測試改用真的合併 commit（原本寫 `merge-sha` 這種假值，照新規則會跑全部）。
- **GitHub 探針**：照 Codex 的建議，從 `ecb85f9` 開分支只改 `tools/install.ts`，對修正後的 A 開 draft PR，看 `pull_request` 的 plan 與 cards job。結果寫在第二輪的請求。
- commit：`caefd63`。

### R2 從 repo 根用 `npm --prefix` 時，相對路徑換了基準

- **真實／修之前／修之後**：從 repo 根執行 `npm --prefix plugins/cards run install-vault -- review-vault`。搬家前從根目錄 `npm run install-vault -- review-vault` 解到 `<根>/review-vault`；修之前解到 `plugins/cards/review-vault`；修之後 `<根>/review-vault`（測試用真的 npm 跑）。
- **發生條件與機率**：用相對路徑，而且兩個位置剛好都有同名的資料夾才會作用到另一個 vault。平常都用完整路徑（vault 在 iCloud），低；但這是搬家帶來的語意改變，`quality.md` 又寫了從根目錄用 `--prefix` 的寫法。
- **影響**：安裝、更新、備份、還原作用在另一個資料夾；只有同名資料夾都存在時才不會直接報錯。
- **修法**：`plugins/cards/tools/cli-path.ts` 的 `cliPath`：經 `npm run <這支工具的 script>` 執行時照 `INIT_CWD`（叫 npm 的資料夾）算，其他情況照目前的資料夾。npm 每次都設 `INIT_CWD`、子程序會繼承（npm 11.6.2 的 `@npmcli/config/lib/set-envs.js:58`），所以要比對 `npm_lifecycle_event`，`npm test` 底下的測試再叫工具時不會被帶偏。沒採用 Codex 提的另一個做法（拒絕相對路徑）：會改掉在 `plugins/cards/` 裡 `npm run` 的現有用法。
- **動到什麼**：命令列入口：`install-vault`（vault、`--register-test`）、`backup`（vault、`--to`）、`restore`（vault、備份檔、計畫檔、`--to`）、`update-vault`（vault、`--to`）、`compare-versions`（備份檔）、`export-compare`、`bench`（`--vault`）。`--config` 是相對 vault 的設定資料夾，不變；函式介面不變。測試：`plugins/cards/tests/cli-path.test.ts`（單元測試，加上用真的 npm 從上層 `--prefix`、在套件裡、套件的另一個 script 再叫一次三種）。
- commit：`62595e2`。

### R3 第 6 條漏認合法的入口相依

- **真實／修之前／修之後**：接線已在、只改下游的檔（`hooks.ts` 同一行第二個敘述 `import './new-entry.ts'`；hook 跑 `node tools/start.cjs`、它 `require('./worker.cjs')`）：該全部跑。修之前只跑共用工具；修之後全部。
- **發生條件與機率**：現在的接線沒有這兩種寫法（本 repo 的入口交叉比對通過），將來加這類接線時才會碰到。低。
- **修法**：`relativeImports` 的靜態 import 也認同一行 `;` 之後的敘述，另外認 `require(…)`；不在行首的都先確認不在字串裡（原本動態 import 的做法）。入口的遞迴多收 `.cjs`、`.cts`。
- **動到什麼**：`tools/dispatch.ts`；`tools/tests/dispatch.test.ts` 加兩個分派案例與一組樣本（每個樣本也和 TypeScript 的 `preProcessFile` 對過，兩邊取到的相同）。
- commit：`e01d466`。

### R4 改連結的腳本

- **判斷**：成立（角括號網址與引用式定義重複改、別人的 repo 也改、多行目的地漏改）。A 用它改的 415 個連結沒有這三種寫法：待審樹 `--check` 是 0 個修改，文件檢查通過。腳本下一次用是 B，記成 [§B0](../tasks/one-repo-step-2.md#b0-開工條件) 第 4 項：B 開工先修、用 Codex 的樣本驗收，交給 B 的 L2 看。
- commit：這一節所在的文件 commit（§B0 第 4 項）。

### R5 搬家後 `locate` 回傳的路徑在 repo 裡找不到

- **真實／修之前／修之後**：該回 `plugins/cards/src/…`；修之前回 `src/…`；修之後 `plugins/cards/src/…`，而且照回傳的路徑在 repo 裡找得到那個檔（測試斷言）。
- **發生條件與機率**：搬家後新存的每一份正式產物都會；用 `locate` 查錯誤紀錄時才看得到。
- **修法**：建置時對照表的 `sources` 改以 repo 根（Cards 往上 `RULES_FROM_ROOT`）為基準。搬家前存的對照表相對當時的根，也就是 repo 根，照舊對。`main.js` 不變（對照表是外部檔，`main.js` 逐位元組不變的測試照舊過）。
- **動到什麼**：`plugins/cards/tools/build.mjs` 一行；`tests/build.test.ts`、`tests/locate.test.ts` 的預期值改成 repo 相對（`tests/helpers/layout.ts` 的 `repoPath`）。
- commit：`63b0c70`。

### Codex 列為待驗證的

- Cards 的完整測試：Codex 的沙箱裡 esbuild 存取被拒，88 個失敗是環境。Claude 在 `7262ed8` 跑過 `npm run check`（2900 個全過），CI 的 Linux 2898 過、2 個只在 Windows 的跳過（任務說明〈A 的進度〉第 18 項）。修正後的 commit 也都經過 pre-commit 的完整檢查。
- 建置逐位元組相同：Claude 在 `83af5c5` 與 `288fc3d` 各比過（第 3 項、§A7 第 4 項）。R5 只改外部的對照表，不影響這一項。

## 第二輪｜Codex 報告

2026-11-20，Codex（gpt-6.2-sol、high、workspace-write），待審 `c7d5493`。原文（本機路徑的連結改成 repo 相對路徑；三項發現原文沒有編號，Claude 的回應依序叫 R6、R7、R8）：

狀態：待修。建議合併前修正 1 項 P2，另有 2 項 P3 分派漏判。

待審 commit 為 `c7d5493a5efea576c69cc3540bc922ef7ccf9fce`。本輪只查 `c298cf1..c7d5493` 的修正與受影響的呼叫路徑。

### 發現

#### P2｜R2 修正引入｜空 vault 參數會把目前資料夾當成安裝目標

- **規格軸，已重現。** `cliPath('')` 會回傳目前資料夾，經由 `npm run` 則回傳呼叫 npm 的資料夾。原本空字串交給 `realpath` 時會報 `ENOENT`。修正後，命令列省略了有效路徑，安裝與備份卻仍會執行。cli-path.ts（`plugins/cards/tools/cli-path.ts:10`） · install.ts（`plugins/cards/tools/install.ts:169`） · backup.ts（`plugins/cards/tools/backup.ts:73`）
- **證據與影響。** 在沒有 `.obsidian` 的暫存資料夾，備妥一份雜湊相符的測試產物，分別用 `npm --prefix <Cards 套件> run install-vault -- "" --release 9.9.9` 和直接執行 Node 入口測試。`c298cf1` 兩種都以 `ENOENT` 結束，寫入 0 個檔案。`c7d5493` 兩種都成功建立三個外掛檔，並在 `community-plugins.json` 啟用外掛。另以含自編辨識文字的暫存 vault 跑 `backup`，同樣從拒絕空路徑變成成功寫出 ZIP，解開後確認內容來自目前資料夾。
- **真實路徑與處理。** 呼叫腳本把空變數加引號傳入時會觸發。平常使用完整路徑，機率低，但會對未指定的資料夾寫檔。建議合併前在共用入口拒絕空的檔案系統路徑，保留明確傳入 `.` 的用法，並以實際 CLI 驗證拒絕後沒有寫入。

#### P3｜延續 R3｜同一行前面的字串含撇號時，仍會漏掉合法的 `import`

- **規格軸，已重現。** 暫存 repo 的 hook 執行 `start.mjs`，其中一行是 `console.log("it's ready"); import './worker.mjs';`。只改 `worker.mjs` 後，Node 確實載入新版，TypeScript `preProcessFile` 也找到 `./worker.mjs`。分派的引號計數把雙引號字串內的撇號當成未閉合的單引號，讓 `--staged` 和 `--range --ci` 都命中第 7 條，只跑共用工具。把 `"it's ready"` 換成 `'ready'`，兩邊就命中第 6 條、全部跑。dispatch.ts（`tools/dispatch.ts:142`） · 任務規格 §A3（`tasks/one-repo-step-2.md:115`）
- **真實路徑與處理。** 目前的接線未觸發。未來把合法的 `import` 接在同一行的字串敘述後面，而且這次只改下游檔時會漏跑外掛檢查，機率低。建議用同一組測試涵蓋單引號、雙引號、反引號及跳脫字元的組合。無法可靠辨識時，保守分派全部。

#### P3｜延續 R3｜CommonJS 能載入的檔案仍有兩種漏判

- **規格軸，已重現。** 在暫存 repo 逐案實跑 Node，只改被載入的下游檔。`.cjs` 入口用 `require('./worker.cjs')` 時，`--staged` 和 `--range --ci` 都命中第 6 條。以下兩種寫法也確實載入新版下游檔，但兩種分派模式都命中第 7 條，只跑共用工具。dispatch.ts（`tools/dispatch.ts:163`）
  - `start.cjs` 用 `require('./worker')` 載入 `worker.js`。掃描找到 `./worker`，遞迴只比對字面路徑，沒有對到 Node 實際載入的 `worker.js`。
  - hook 直接執行 `node tools/start.cts`，再由它 `require('./worker.cjs')`。`.cts` 已加入遞迴可讀的副檔名，直接入口的掃描仍漏掉它。
- **真實路徑與處理。** 現有接線未使用這兩種寫法，近期機率低。現有獨立驗收也沿用相同的副檔名清單和字面路徑，兩邊可能一起漏掉。建議讓驗收以 Node 實際載入的檔為準，覆蓋直接入口與下游解析。若決定只支援明寫副檔名的接線，應在新增接線時由檢查擋下其他寫法。dispatch.test.ts（`tools/tests/dispatch.test.ts:353`）

### 本輪驗證

- **R1。** 本機用實際 Git 合併 commit 重跑搬家案例，分派結果為 `tools,cards`。另用一個有效但第二個 parent 與 PR head 不符的合併 commit，確認四個對象全部安排。GitHub API 顯示 PR #26 為 `mergeable: false`、`dirty`，沒有合併 SHA。待審 commit 的 push run 七個 job 全部成功。[PR #26](https://github.com/kuohappiness/Essence/pull/26) · [Actions run 44698482939](https://github.com/kuohappiness/Essence/actions/runs/44698482939)
- **R2。** 從 repo 根以 `npm --prefix plugins/cards run backup -- review-vault --to review-backups` 執行。repo 根與 Cards 套件內各放了同名暫存 vault。ZIP 寫到 repo 根指定的目錄，解開後確認內容來自 repo 根的 vault。原有兩個 CLI 路徑測試也通過。
- **R4。** §B0 第 4 項已把修腳本和驗收樣本列為 B 的開工條件。用搬家 commit 的 26 組路徑對照在待審樹執行 `--check`，結果為 0 個待改連結。任務說明 §B0（`tasks/one-repo-step-2.md:228`）
- **R5。** 固定建置版本，使用同一份來源分別跑修正前後的建置器。正式版與開發版的 `main.js` 各自逐位元組相同。新版 `locate` 能把兩種建置都定位至 repo 中的 `plugins/cards/src/core/errors/log.ts:172`。另以含正確雜湊的舊格式對照表樣本確認，`src/core/errors/log.ts` 仍可讀，並能在搬家前的 commit 找到。
- **本機檢查。** Windows、Git 2.52、Node 24.13.0、npm 11.6.2。共用工具的 `npm run check` 與 `npm run self-check` 通過，測試 162 過、0 失敗、1 個因 Windows 檔名不能含換行而跳過。Cards 的型別、lint、knip 通過。完整測試在暫存 clone 中為 2,545 過、88 失敗，輸出多次出現 esbuild 讀取上層目錄被拒。

**待驗證**：Cards 本機全套測試仍受暫存路徑權限影響。R1 的 GitHub `pull_request` 實跑缺少可合併的探針。R4 的腳本修正驗收留在 B 開工時。A11 合併後的雲端 session 依任務留待合併後。審查暫存檔已刪除，repo 的追蹤檔案未修改。

## 第二輪｜Claude 回應

2026-11-20 Claude（Opus 5.5）。三項逐一在 `c7d5493` 核對，都成立，都修（一項一個 commit，先寫會失敗的回歸測試，修之前跑過是失敗的）。R1 的 GitHub 探針沒有可合併的結果（GitHub 判衝突），第二輪請求已寫明，記在任務說明〈平台事實〉。

### R6 空字串的路徑被當成目前的資料夾（R2 修正引入）

- **真實／修之前／修之後**：命令列給空字串的 vault，應該停下、什麼都不寫（R2 之前 `realpath('')` 報 `ENOENT`）。修之前 `cliPath('')` 回目前的資料夾（經 `npm run` 時是叫 npm 的資料夾），安裝與備份照做；修之後丟錯「命令列給的路徑是空的；要用目前的資料夾請寫 .」，明寫的 `.` 照舊。
- **發生條件與機率**：呼叫的腳本把空變數加引號傳進來。平常用完整路徑，低；但會寫進沒指定的資料夾。
- **修法**：`cliPath` 收到空字串就丟錯。所有命令列入口都經過它，一處擋住。
- **動到什麼**：`plugins/cards/tools/cli-path.ts`；`plugins/cards/tests/cli-path.test.ts` 加兩個測試：`cliPath('')` 兩種環境都丟錯、`.` 照舊；真的跑 `install-vault.mjs "" --release 9.9.9` 與 `backup.ts "" --to out`，都以「空的」結束、暫存資料夾裡沒有任何檔。修之前第一個測試沒丟錯，第二個測試的安裝停在別的錯（找不到 9.9.9），不是空路徑。
- commit：`9ec207b`。

### R7 前面的字串含撇號，同一行的 import 漏認（延續 R3）

- **真實／修之前／修之後**：`console.log("it's ready"); import './new-entry.ts';`，只改 `new-entry.ts`，該全部跑。修之前分別數三種引號，撇號被當成沒關上的單引號，只跑共用工具；修之後全部。
- **修法**：照順序走過那一行到 import 之前的字，用堆疊記目前在哪一種引號裡：字串裡的別種引號與跳脫的字不算；模板字串的 `${…}` 裡是程式（裡面的 `require` 算），對應的 `}` 回到模板字串。
- **和 TypeScript 不同的一處**：模板字串 `${…}` 裡的 `require`，Node 執行時會載入，`preProcessFile` 不收。照 Node 算（多算只會多跑檢查），測試裡另外斷言兩邊的差別。
- **動到什麼**：`tools/dispatch.ts` 的 `insideString`；`tools/tests/dispatch.test.ts` 加一個分派案例與五個樣本（雙引號裡的撇號、跳脫的引號、模板字串後面的 `require`、字串裡的 `require` 不算；模板字串裡的另外斷言）。
- commit：`27a3d3e`。

### R8 CommonJS 能載入的兩種寫法漏認（延續 R3）

- **真實／修之前／修之後**：`start.cjs` 寫 `require('./worker')`（Node 載入 `worker.js`），只改 `worker.js`；hook 直接跑 `node tools/start.cts`，只改它或它 `require` 的 `worker.cjs`：三種都該全部跑。修之前只跑共用工具；修之後全部。
- **修法**：hook、`check.yml`、外掛 scripts 寫到的入口多認 `.cts`。遞迴時，每個相對路徑都照 Node CommonJS 的順序列出可能載入的檔（本身、補 `.js`、`.json`、`.node`、資料夾的 `index.*`），全部算入口：不存在的路徑不會出現在改動裡，多算只會多跑檢查。資料夾 `package.json` 的 `main` 不認（現在沒有這種接線）。
- **獨立驗收**：照 Codex 的建議改成以 Node 實際載入的檔為準：`independentEntries` 把 `preProcessFile` 找到的路徑交給 `createRequire(…).resolve`，字面的入口也多認 `.cts`。
- **動到什麼**：`tools/dispatch.ts` 的 `toolPaths`、`entryTools`、`nodeCandidates`；`tools/tests/dispatch.test.ts` 加三個分派案例，改 `independentEntries`。
- commit：`7f64932`。

## 第三輪｜Codex 報告

2026-11-20，Codex（gpt-6.2-sol、high、workspace-write），待審 `c875cb6`。原文（本機路徑的連結改成 repo 相對路徑）：

狀態為待 Claude 核對。第三輪有兩項已重現的 P3 發現。R6 的空路徑修正通過驗證。

審查分支為 `claude/one-repo-step-2a`，範圍限定 `c7d5493a5efea576c69cc3540bc922ef7ccf9fce..c875cb6d4b4fe3eb0d5f964be31292bbbea5964b`，涵蓋 R6～R8 的修正、回歸測試與交接文件。兩項分派探針都在系統暫存 repo 先提交入口接線，再單獨改動被載入的檔案，以 Node 實際執行及 `require.resolve` 確認載入對象，並用 `dispatch.ts --staged` 和 `dispatch.ts --range <base> <head> --ci` 核對分派。

### R9（P3）正規表示式裡的引號讓同一行後面的 `require` 漏判（R7 修正引入）

- **規格與觸發條件。** 依 `tasks/one-repo-step-2.md:107` 的 §A3 第 6 條，入口檔載入的共用工具改動時應跑全部檢查。暫存 repo 的 hook 與 `check.yml` 都接到 `tools/start.cjs`，其中一行為 `const quoted = /["'].*["']/; const worker = require('./worker.cjs');`。之後只改 `tools/worker.cjs`。
- **已重現。** Node 24.13.0 確實執行並載入 `tools/worker.cjs`。`c7d5493` 的 `relativeImports` 取到 `./worker.cjs`，暫存區分派命中第 6 條。`c875cb6` 取到空陣列，暫存區與 CI range 都命中第 7 條，結果是共用工具 `full`，Cards、Capture、Mindboard 都是 `skip`。另以跨行模板字串做對照，把 `require` 放在結尾反引號後的同一行，兩版都漏判。這證實逐行掃描也可能少算入口。
- **原因與驗收缺口。** `tools/dispatch.ts:149–177` 的 `insideString` 把正規表示式字面值裡的引號當成字串邊界。跨行模板字串則在每行重新起算，把結尾反引號當成開頭。正規表示式案例也讓 `tools/tests/dispatch.test.ts:408–409` 所用的 `ts.preProcessFile` 回傳空陣列，因此現有的獨立比對會漏掉同一條相依。另用 TypeScript AST 走訪同一份原始碼，可以取到 `./worker.cjs`。
- **真實路徑與影響。** `c875cb6` 的實際追蹤入口是 `check-local-paths.ts`、`ci-gate.ts`、`dispatch.ts`、`hooks.ts`，目前沒有這種接線。日後須先加入這種寫法，再有一次只改其下游檔案的變更，才會讓外掛檢查被靜默跳過。條件明確，發生機率低。
- **建議處理。** 依 D-200 收窄入口接線的支援寫法，例如要求字面匯入或 `require` 放在獨立敘述，並以 AST 驗收實際接線。回歸案例保留原本的撇號、正規表示式與跨行模板三種輸入，確認支援的接線都命中第 6 條。

### R10（P3）CommonJS 目錄路徑帶尾斜線時漏掉 `index.js`（延續 R8）

- **規格與觸發條件。** 同為 §A3 第 6 條。hook 或 `check.yml` 已接到 `tools/start.cjs`，其中使用 `require('./worker/')`，目錄以 `tools/worker/index.js` 為入口。之後只改 `tools/worker/index.js`。
- **已重現。** Node 實際執行與 `require.resolve('./worker/')` 都指到 `tools/worker/index.js`。`c875cb6` 也有擷取到 `./worker/`，但產生的是 `tools/worker//index.js`。Git 回傳的單斜線路徑未命中，暫存區與 CI range 都落到第 7 條，只跑共用工具。用同一份 fixture 改成 `require('./worker')` 或 `require('./worker/.')`，Node 載入相同檔案，兩種分派都回到第 6 條。
- **位置、真實路徑與影響。** `tools/dispatch.ts:218–236` 先正規化目標再拼接 `/index.js`，而 `posix.normalize` 保留目標原有的尾斜線。現有入口沒有使用這種目錄載入，未來加入這類接線、後續又單獨改 `index.js` 時才會觸發，發生機率低。觸發時三個外掛的檢查都會跳過。
- **建議處理。** 用 `posix.join(target, 'index.js')` 等方式組合目錄入口候選，讓有無尾斜線都對應到 Git 的路徑。以 `require.resolve` 核對這兩種拼法，回歸測試再比對 `--staged` 與 `--range` 下的四個對象。

### 驗證結果與待驗證項目

- **R6。** 七個 Cards CLI 共跑 12 個空路徑探針，涵蓋 vault、備份檔、`--apply`、`--to` 與 `--vault`。全部以非零結束，暫存資料夾與測試 vault 都沒有新增內容。`export-compare` 回傳用法，其餘回傳空路徑錯誤。既有 `cli-path.test.ts` 的 `.`、`npm --prefix` 與巢狀 npm 案例也通過。
- **共用工具。** 指定六個測試檔合計 101 項通過、0 失敗、1 項跳過。另在 `c875cb6` 的暫存 clone 跑 `npm run check` 和 `npm run self-check`，兩者通過，自檢含 166 項測試通過、0 失敗、1 項跳過。兩次跳過的都是 Windows 檔名無法含換行的案例。
- **Cards。** 暫存 clone 的型別、lint、knip 通過。指定六個測試檔合計 61 項通過、15 項建置測試失敗，esbuild 回報無法讀取上層目錄（`Access is denied`）。這 15 項與 Cards 全套測試列為待驗證。
- **沿用交接的待驗證項目。** R1 缺少 GitHub 可合併的 `pull_request` 探針，R4 留待 B 開工驗收，A11 留待合併後在 `main` 開新的雲端 session。

本輪採唯讀審查，報告以討論稿的〈第三輪｜Codex 報告〉格式交回。已確認本輪的暫存探針與 clone 全部清除，工作樹只顯示原有的 `docs/syntax.md` 換行差異。

## 第三輪｜Claude 回應

2026-11-20 Claude（Opus 5.5）。兩項在 `c875cb6` 核對都成立。兩項都是 P3，現在的接線沒有這些寫法；修法動到分派表（高風險的共用路徑），要再送 L2，所以照 D-207 第 2 點連同「不修」交給使用者選。Claude 的做法、Codex 的建議（收窄支援的寫法，用語法樹驗收）、不修（只留語法樹的驗收）三個選項，使用者選「修，送第四輪」。一項一個 commit，先寫會失敗的回歸測試，修之前跑過是失敗的。

### R9 正規表示式裡的引號、跨行的模板字串讓同一行的 require 漏認（R7 修正引入）

- **真實／修之前／修之後**：`const quoted = /["'].*["']/; const worker = require('./worker.cjs');`，只改 `worker.cjs`，該全部跑。修之前只跑共用工具；修之後全部。
- **判斷**：這是同一類（判斷「是不是在字串裡」時漏認入口相依）的第三代：R3（只認行首）→ R7（分別數引號）→ R9（逐行的字串狀態）。照 D-200 第 2 點（D-207 第 3 點），不再補下一個判斷，換前提。
- **修法（換前提）**：`relativeImports` 不判斷是不是在字串、註解或正規表示式裡，`import`、`require`、`from` 後面接相對路徑的字面值就算，寧可多算。多算的路徑不存在就不會出現在改動裡，存在就多跑檢查；少算才會漏跑。拿掉 `insideString` 與去註解的正規式，程式變少。實測這個 repo 的入口前後都是同樣 4 個檔（`check-local-paths.ts`、`ci-gate.ts`、`dispatch.ts`、`hooks.ts`），沒有多算進真的檔。
- **沒採用 Codex 的建議（收窄支援的寫法）**：要另外寫一條擋其他寫法的檢查，以後的接線也受限制；「寧可多算」不必限制寫法。
- **獨立驗收**：`preProcessFile` 本身也漏掉正規表示式那一例，改成用 TypeScript 的語法樹走過（`astImports`：import、export … from、`import x = require`、動態 import、`require` 的字面值參數），路徑再交給 `require.resolve`。斷言分派的正規式涵蓋語法樹找到的每一個（樣本與 `tools/`、helper 的每個檔），入口的獨立計算也改用語法樹。以後有人加了分派漏認的接線，那個 commit 改到入口、會跑全部檢查，這個測試會失敗。
- **動到什麼**：`tools/dispatch.ts` 的 `relativeImports`（刪 `insideString`）；`tools/tests/dispatch.test.ts`：一個分派案例、樣本測試改成「語法樹找到的＋多算的」兩欄（加正規表示式、跨行模板字串、區塊後的 import；字串與註解裡的改成多算）、逐檔比對改成涵蓋、`independentEntries` 改用語法樹。
- commit：`2084537`。

### R10 `require('./worker/')` 結尾有斜線，漏掉 `worker/index.js`（延續 R8）

- **真實／修之前／修之後**：只改 `tools/worker/index.js`，該全部跑。修之前候選路徑拼成 `tools/worker//index.js`，對不上 Git 的路徑，只跑共用工具；修之後全部。
- **修法**：先去掉結尾的斜線，資料夾的 `index.*` 用 `posix.join` 組合。
- **動到什麼**：`tools/dispatch.ts` 的 `nodeCandidates`；`tools/tests/dispatch.test.ts` 一個分派案例。
- commit：`97c4fa8`。

## 第四輪｜Codex 報告

2026-11-20，Codex（gpt-6.2-sol、high、workspace-write），待審 `dfdc6fa`。原文：

狀態為待 Claude 核對。兩項 P3 均已重現，目前接線未觸發。依 D-207，建議核對後記為已知限制，現階段可合併。

2026-11-20，L2 獨立審查。分支 `claude/one-repo-step-2a`，範圍限定 `c875cb6d4b4fe3eb0d5f964be31292bbbea5964b..dfdc6fabeb202fdbb4c4b69e52c40127e9047712`，涵蓋 R9、R10 的修正、回歸測試與交接文件。環境為 Windows、Git 2.52.0、Node 24.13.0、npm 11.6.2。

### R11（P3）區塊註解可讓真實相依漏判（R9 修正引入）

- **規格與影響。** §A3 第 6 條要求改到入口載入的共用工具時跑全部檢查。§A3 也要求只改文件時選到經 helper 讀該文件的測試。`relativeImports` 同時用在 `entryTools` 與 `relatedTests`，兩條路徑都會漏選。位置見 `tasks/one-repo-step-2.md:107`、`:119`，以及 `tools/dispatch.ts:146`、`:189`、`:240`。
- **已重現，入口相依。** 在系統暫存 Git repo 讓 hook 執行 `tools/start.cjs`，分別放入 `console.log(require /* rationale */ ('./worker.cjs'));` 和 `/* Example: from './legacy */ console.log(require('./worker.cjs'));`，接著只改 `tools/worker.cjs`。兩例中 Node 都實際載入該檔，TypeScript AST 也都取到 `./worker.cjs`。`c875cb6` 的暫存區與 CI range 都命中第 6 條。`dfdc6fa` 兩者都落到第 7 條，只跑共用工具，三個外掛跳過。第一例的正規式只允許關鍵字與括號間有空白。第二例的全域比對從註解開始，一路吃到真實 `require` 的開頭引號，只回傳 `./legacy */ console.log(require(`。
- **已重現，Cards 相關測試。** 暫存 repo 的 `tests/review.test.ts` 用 `import text from /* notes on fixture */ './helpers/review.ts';`，由 helper 讀 `docs/review.md`。Node 執行確實讀到文件。只改該文件時，`c875cb6` 的暫存區分派選到 `tests/review.test.ts`，`dfdc6fa` 跳過 Cards。CI range 兩版都跑 Cards 完整檢查。
- **真實路徑與機率。** 兩版在目前分支找到的 4 個追蹤入口相同。共用工具與 Cards 的 160 個測試檔、15 個 helper，分派器辨識出的 helper 相依也無差異。觸發須先加入這類註解寫法，再單改下游工具或文件，機率低。現有 AST 測試能抓到直接接在共用入口的探針寫法。逐檔涵蓋檢查掃描 Cards 的 helper，範圍未含 Cards 的測試檔，因此無法靠它攔住上述 Cards 探針。見 `tools/tests/dispatch.test.ts:455`、`:494`。
- **建議處理。** 記錄兩種註解的觸發方式。新增這類接線時，用 AST 核對入口與 Cards 測試檔。若修正解析，補上兩種註解及文件經 helper 選測試的分派案例。

### R12（P3）目錄路徑帶尾斜線時，把同名檔誤算為入口（R10 修正引入）

- **規格與觸發條件。** §A3 第 6、7 條依工具是否為檢查入口分派。入口使用 `require('./worker/')`，同時存在 `tools/worker/index.js` 與 `tools/worker.js`，之後只改 `tools/worker.js`。應命中第 7 條。`nodeCandidates` 去掉尾斜線後也補上 `.js`，使同名檔命中第 6 條。見 `tasks/one-repo-step-2.md:107`、`tools/dispatch.ts:206`。
- **已重現。** Node 的 `require.resolve('./worker/')` 與實際載入都指向 `tools/worker/index.js`。只有同名 `tools/worker.js` 時，帶斜線的呼叫回報 `MODULE_NOT_FOUND`。暫存 Git repo 只改 `worker.js`，`c875cb6` 在暫存區與 CI range 都只跑共用工具，`dfdc6fa` 兩者都跑全部。對照組只改 `worker/index.js`，`dfdc6fa` 兩者都正確跑全部，確認 R10 的原始案例已修。
- **真實路徑、影響與建議。** 現有入口沒有這組接線。日後須同時使用帶尾斜線的目錄路徑、另有同名檔，且單獨修改該檔才會多跑三個外掛的檢查，機率低。可記為已知限制。若要消除多跑，對尾斜線只產生目錄索引候選，並用同名檔與 `index.js` 的對照案例驗收。

### 驗證結果

- `npm.cmd --prefix tools run check` 通過。`npm.cmd --prefix tools run self-check` 通過，含型別、lint、knip 與測試，**168 項通過、0 項失敗、1 項跳過**。
- 定向執行 `dispatch.test.ts`、`ci-gate.test.ts`，**84 項通過、0 項失敗、1 項跳過**。R9 的正規表示式與跨行模板、R10 的目錄索引回歸均通過。兩次跳過的是同一個 Windows 無法建立含換行檔名的案例。
- `git diff --check c875cb6..dfdc6fa` 通過。待審 HEAD 確認為 `dfdc6fa`。本輪未修改追蹤檔案，暫存探針目錄已刪除。工作樹只顯示原有的 `docs/syntax.md` 換行差異。

**待驗證。** 含換行檔名的案例需在 Linux 執行。Cards 全套與 GitHub Actions 本輪未重跑，範圍限 R9、R10 的修正。交接原列的 R1 可合併 GitHub PR 探針、R4 在 B 開工時的驗收、A11 合併後在 `main` 的新雲端 session，仍依原定條件驗證。

## 第四輪｜Claude 回應

2026-11-20 Claude（Opus 5.5）。兩項在 `dfdc6fa` 照報告核對都成立，照 D-207 第 2 點分類，都記成已知的限制，不修：

### R11 區塊註解讓相依漏認（R9 修正引入）

- **發生條件與機率**：入口或 Cards 的測試檔把區塊註解夾在 `require`／`import` 與括號或路徑之間（`require /* … */ ('./x')`），或區塊註解裡有不成對引號的 `from '…`；之後只改它載入的下游工具，或經 helper 讀的文件。這兩種寫法正常不會出現，現在的 4 個入口、160 個測試檔與 15 個 helper 都沒有（Codex 實測）。極低。
- **影響**：該跑的外掛檢查被跳過（入口的那一種，pre-commit 與 CI 都跳過；Cards 測試的那一種，CI 照跑 Cards 的完整檢查）。
- **為什麼不修**：再補一條註解的判斷就是這一類的第四代，D-200 第 2 點要求不再加；入口那一種，語法樹的驗收（`tools/tests/dispatch.test.ts`）在加入這種接線的 commit 會失敗。
- **記法**：合併後寫進 `main` 的 backlog〈已知的限制〉。

### R12 結尾有斜線的資料夾路徑，把同名的 `.js` 多算成入口（R10 修正引入）

- **發生條件與機率**：入口 `require('./x/')`，同時有 `x/index.js` 與 `x.js`，只改 `x.js`。現在沒有這種接線。極低。
- **影響**：多跑三個外掛的檢查；不會少跑。
- **記法**：同 R11。

## 結論

第四輪沒有擋合併的發現，L2 通過。十二項：R1、R2、R3、R5、R6～R10 修了（R9 照 D-200 換前提）；R4 記成 B 的開工條件（[任務說明 §B0](../tasks/one-repo-step-2.md#b0-開工條件) 第 4 項）；R11、R12 記成已知的限制。Codex 每一輪都列為待驗的：Cards 的完整測試（Codex 的沙箱裡 esbuild 存取被拒）由 pre-commit 與 CI 跑過；R1 在 GitHub 上沒有可合併的探針（GitHub 判衝突，記在任務說明〈平台事實〉）；雲端 session 合併後在 `main` 再看一次（第 A11 項）。
