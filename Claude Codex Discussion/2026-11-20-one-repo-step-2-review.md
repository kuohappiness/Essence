# D-208 第二步 A｜Codex L2 審查

狀態：第一輪：Codex 回報 R1～R5；Claude 修 R1、R2、R3、R5，R4 記成 B 的開工條件；第二輪待送

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
