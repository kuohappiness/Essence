# 三個外掛同一個 repo 第二步｜開工前查核

狀態：第二輪查核中（第一輪的發現已核對、任務說明已改）

## 先讀這裡

[任務說明](../tasks/one-repo-step-2.md)的開工前查核。請求與只讀的範圍在[查核請求](../tasks/one-repo-step-2-plan-review.md)。每一輪是新的 Codex session；下一輪只讀〈先讀這裡〉、上一輪的〈Claude 回應〉與還沒結的項目。

## 第一輪｜Codex 報告

2026-11-19，Codex（gpt-6.2-sol、high、唯讀），基準 `de3438f`。原文：

基準為 `de3438f`。**同意 Cards 搬進 `plugins/cards/`，也同意先合併 A 程式、再做 B 文件。反對照現稿開工。** A 要先補齊分派的保守退路、搬家 commit 的相依調整，以及正式更新和建置等價的驗收。B 要先確定轉錄稿的唯一位置及舊入口的保留方式。

我用唯讀 Git 查詢和分派探針核對基準。以下「已重現」指在基準上取得的輸出。「看規格推斷，待驗證」指要等實作、暫存 repo、建置、CI 或實機才能驗證的結果。

### 1. 和「不做」比較，以及 A、B 拆分

- **同意拆成兩個 PR。** `tools/codex.ts` 與雲端 hook 的分類問題已重現。`node tools/dispatch.ts --range '137967f~1' 137967f --explain` 把前者判為第 8 條、後者判為第 7 條。分類可以在現有結構單獨修，搬家的額外收益是往後能按目錄分派，且 Cards 文件有自己的入口。第一步記錄的約 600 秒是個別完整 hook 的成本。同一歷史 commit 還改了 `decisions-index.mjs`，它本身也會觸發全部，不能把該次成本全算給 `codex.ts`。**應該改**：把這個例子寫成「單獨改 `codex.ts` 仍會觸發全部」，並計入拆 PR 後 A 到 B 之間的雙路徑維護，以及 B 需要重新驗證 `rules.ts` 與建置規則。證據 `tasks/one-repo-step-2.md:15–36,214`、`tasks/one-repo-step-1.md:323`、`tools/dispatch.ts:27–65`。
- **應該改｜看規格推斷。** §A0 的停手範圍只列 Cards 的程式、工具和設定，但 A 同時改分派、hook、CI 與共用套件。如果其他任務也改這幾處，A 的搬家 commit 和 L2 證據都可能過時。保留文件可繼續編輯的安排，補列會和 A 交疊的共用路徑，並要求最後一次 rebase 後重跑受影響的驗收。證據 `tasks/one-repo-step-2.md:42–55,133–139,156–162`。

### 2. 分派表

- **擋開工｜看規格推斷，待驗證。** **同意已知只服務共用工具的改動只跑共用工具，反對第 7 條把所有其餘 `tools/` 檔都視為影響已知。** `tools/package.json` 的 `prepare` 會設定全 repo 的 `core.hooksPath`。`.claude/hooks/cloud-setup.mjs` 會設定 hook、Node 和各套件的安裝，`.claude/settings.json` 則決定這些 hook 有沒有被呼叫，現稿會讓它落到第 9 條。建議第 6 條涵蓋會改變檢查啟動或安裝的入口，保留第 7 條給已有獨立檢查的工具、測試與設定。新增或改名後用途未明的共用工具路徑走全部。雲端啟動仍要另有實際探針。證據 `docs/decisions.md:5964`、`tasks/one-repo-step-2.md:99–110`、`tools/package.json:9–10`、`.claude/hooks/cloud-setup.mjs:18–75`、`.claude/settings.json:10,19,31`。
- **應該改｜已重現。** 路徑有無 `plugins/cards/` 前綴，解不掉間接引用。我用基準的 `dispatch()` 傳入單一 `M docs/syntax.md`，比較內容取自 `de3438f`，實際只選到 `ai-add`、`deck`、`errors`、`lock`、`study` 五個測試。`ai-add-move.test.ts` 和 `ai-add-old-version.test.ts` 經 `helpers/add-cases.ts` 讀同一份規格，兩者都漏選。建議對這類共用 fixture 明列受影響的測試，或讓依賴的測試各自宣告規格路徑，並用這兩個既有案例驗證。仍從暫存區或比較樹取內容。證據 `tools/dispatch.ts:84–126`、`tests/helpers/add-cases.ts:8`、`tests/ai-add-move.test.ts:6`、`tests/ai-add-old-version.test.ts:11`。
- **應該改｜看規格推斷，待驗證。** §A3 要明定 **同時比原路徑與去前綴的路徑**，而且 `rules.ts` 的特例也適用。B 後該表存的是 `plugins/cards/docs/card-rules/…`，若只拿去前綴後的字串做目前的單引號精確比對，就漏掉 `ai-rules.test.ts`。也要定下執行時的路徑座標。Git 讀取用 repo 相對路徑，從 `plugins/cards/` 或 `tools/` 啟動 Node 測試時，傳各自套件相對路徑。現有 hook 直接把 `tests` 傳給位於套件目錄的 Node 程序。證據 `tasks/one-repo-step-2.md:94,111,214`、`tools/dispatch.ts:111–126`、`tools/hooks.ts:102,120–126`。
- **應該改｜看規格推斷，待驗證。** 例子表中，`docs/syntax.md` 的 pre-commit 欄應寫明「有命中才跑共用工具相關測試」。A12 的 `docs/product.md` 探針依第 9 條應同時跑 **cards 和 tools**，目前只寫 cards。其餘已列的單一路徑與兩個跨目錄改名案例符合表意。補測同一次 Cards 程式＋共用工具＋共用規格、Cards 文件改名到 Capture、嵌入規則檔刪除、`.MD` 大小寫，以及 `plugins/` 未知路徑和缺 CI 基點時共用工具也跑完整。每案斷言所有對象，包括應跳過的，以及實際選到的測試檔。證據 `tasks/one-repo-step-2.md:96–131,240,246`、`tools/dispatch.ts:138–176,192–204`。

### 3. Commit 順序與搬家 commit

- **擋開工｜看規格推斷，待驗證。** §A6 的同批清單漏了 §A5 所寫的**建置規則預設根切換**。`buildPlugin()` 現在把 Cards 根傳給 `embedRules()`，後者從該根解析規則路徑。搬完後若預設仍指 Cards 根，`docs/card-rules/` 及 `experiments/` 下的規則會讀不到。應在搬前加可覆寫的規則根與型別宣告，搬家 commit 同時切預設、修測試及暫存建置／安裝 fixture 的路徑，並在提交前裝好新版 `tools/` 和 `plugins/cards/` 的相依，讓 hook 副本借得到。雲端清單測試可先核對搬前的 `.`，搬家 commit 再和 CI 一起切換。證據 `tasks/one-repo-step-2.md:112,145,153,158`、`tools/build.mjs:79–111`、`tools/build.d.mts:3,11`、`tests/build.test.ts:37,216–217`、`tests/install.test.ts:44–53`、`tools/hooks.ts:78–85,108–116`。
- **應該改｜看規格推斷，待驗證。** §A1～§A5 的章節順序還不足以保證每個 commit 都能查。共用測試移出 Cards 的那個 commit 就要有可執行的新入口，並接上 hook／CI。A6 再切 Cards 根。驗收應跑兩段過渡狀態和搬家 commit，不能只看 A 最後的 head。Pages 現在只在符合條件的 `main` push 或手動觸發時執行，A 的分支 Check 綠燈不涵蓋 Pages。合併前應直接產生並核對三個頁面，發布後再確認實際 Pages 結果。證據 `tasks/one-repo-step-2.md:85–89,112,133–140,246`、`.github/workflows/progress-board.yml:6–18,41–46`。
- **應該改｜看規格推斷，待驗證。** 同意把 `git log --follow` 當驗收。`git mv` 本身不保證辨認改名，`quality.test.ts` 同批拆半也可能低於預設相似度。此外 A2 拿開工的 `<基準>` 比 `<搬家>`，把早於 A6 搬出的測試或停手前獲准合併的改動也算進來。應用搬家 commit 的父 commit 逐一查 A6 的改名，用每個實際搬檔 commit 查其餘搬移，並在 `--follow --name-status` 核對舊路徑及 commit。拆分檔若接不到，先完整搬檔再拆，並讓兩個 commit 各自通過。證據 `tasks/one-repo-step-2.md:44,87,158,233–238`。

### 4. 跨版本與六項演練

- **擋開工｜看規格推斷，待驗證。** §A5 漏了 `update-vault --check` 的正式發布前檢查。它目前執行 Cards 的 `npm run check`，該指令含共用檢查。A 拿掉這段後，直接執行正式更新會少跑原有的共用檢查，即使 hook 與 GitHub 都有自己的 shared 檢查。建議讓更新入口在發布前明確執行原有的兩段檢查，並驗證共用檢查失敗時還沒開始備份或安裝。證據 `package.json:19–21`、`tools/update-vault.ts:55–60,131–158`、`tasks/one-repo-step-2.md:79,148`。
- **應該改｜已重現歷史資料，看規格推斷其餘行為。** 同意以 manifest 辨認新舊根。`git show <tag>:manifest.json` 已確認 `v0.2.0`～`v0.5.0` 都有正確的 ID 和版號。補明只有確定路徑不存在才算缺席，讀取失敗、無效 JSON、錯 ID、兩處都存在但只有一處 ID 正確，依現稿一律停止。§A8 的四個 fixture 案例還缺這些分支。既有比較測試有手寫的無 ID manifest，也有把 `src`、manifest、package 複製到暫存 repo 根的 fixture，需逐一區分舊根案例、新根案例與故意無效的案例。建置／安裝測試則須分開 Cards 根與規則根。證據 `tasks/one-repo-step-2.md:145–150,242`、`tools/compare-versions.ts:47–58`、`tests/compare-versions.test.ts:615,687–721`、`tests/install.test.ts:35–53`。
- **擋開工｜看規格推斷，待驗證。** A7 第 1 項的舊版產物雜湊是有效判準。第 2 項若兩份目標原本就和 ZIP 相同，兩個還原都沒寫入也能逐檔相同。應先讓兩份目標都缺一個可還原的檔、缺一筆可重播的紀錄，各跑 `--plan` 和 `--apply`，斷言確實有還原，並核對檔案位元組、紀錄內容及未選取資料。第 3 項應指定跑完 `update-vault --check` **及** `--install`，驗證從 `0.6.0` 到 `0.6.1` 的實際 `BUILD`、安裝後雜湊、版本紀錄及預期保留的資料。只取得比較報告，仍不足以證明 Windows 更新完成。證據 `tasks/one-repo-step-2.md:166–173`、`tools/restore.ts:82,145–173,360–374`、`tools/update-vault.ts:179–211`。
- **應該改｜看規格推斷，待驗證。** 同意獨立 clone 可隔離預設 `.local/`。安裝工具用 Git 共用目錄定位，Codex 回報用當前工作樹的頂層，§A1 把兩者都描述成「主資料夾」會誤導 linked worktree 的操作。演練先核對實際絕對路徑，並把 `--to` 的備份位置指向隔離目錄。第 4、6 項明確會改共用的 iCloud 測試 vault，應記錄演練前的 `BUILD`，成功、中止或失敗都照原版換回並讀回驗證。第 5 項只能證明所選單行改動可跨搬家合併，保留作實例合理。證據 `tasks/one-repo-step-2.md:78,164–175`、`tools/install.ts:43–45,162–182`、`tools/codex.ts:148–151`、`tools/update-vault.ts:148`。

### 5. 共用工具自己的檢查

- **同意日常 `tools/check` 維持輕量。** clone 測試確有額外成本，依分派跑 `self-check` 合理。**應該改｜看規格推斷，待驗證。** 把搬動測試後的根路徑、`.mjs` lint 涵蓋及 knip 的新測試入口寫成驗收。`hooks.test.ts` 搬到 `tools/tests/` 後，現有 `new URL('..', import.meta.url)` 會變成 `tools/`，而它拿這個值當 `git clone` 來源。拆出的 `quality` 測試、`decisions-index` 和讀 `.claude/settings.json` 的測試也得更新取檔基準。既有 ESLint 規則涵蓋 `mjs`，現有 knip 的 `tools` 工作區只列 `*.{ts,mjs}` 等模式，不能原樣照搬就算涵蓋新測試。建議在完全未裝 Cards 依賴的乾淨 checkout 跑 `self-check`，核對測試清單，並用一個未使用的共用匯出確認 knip 確實掃到。證據 `tests/hooks.test.ts:18,66`、`tests/quality.test.ts:53–106`、`tests/decisions-index.test.ts:10–11`、`tests/block-dangerous-git.test.ts:8–9`、`eslint.config.js:5,13,248`、`knip.jsonc:13–19`。

### 6. 驗收判準

- **擋開工｜看規格推斷，待驗證。** A3 的 `main.js` 去掉首行仍須逐位元組相同，照現況會把正確建置判成失敗。`BUILD` 含 HEAD 短碼，同時寫進 banner 和由 esbuild 注入程式本體。建議驗證各自的真實 `BUILD`，再用同一固定 `BUILD` 比較兩份建置，或只正規化確定的注入位置。`styles.css` 和 `embedRules()` 維持原本的精確比較。A7 用這個判準支持 iPhone 只驗載入與版本時，也要對 iPhone 實際裝的 **dev** 產物做等價比對。證據 `tasks/one-repo-step-2.md:171–173,237`、`tools/build.mjs:58–66,100–111`、`src/main.ts:524,610`。
- **應該改｜看規格推斷，待驗證。** A7 的兩個邊界反例要在隔離 repo 裡 **stage**，或交給檢查器的公開函式。只加未追蹤檔，檢查器看不到。A9 用 Markdown 解析後的連結目標核對，涵蓋引用式連結、錨點及指向 `blob/main` 的舊路徑。A10 用乾淨 checkout 並列出實際產物，`main.js.map` 要另外要求產生才驗得到。A14 應核對既有 tag 指向的 commit、`manifest.json` 和 `package.json` 版號及發布工具接受的 `v<版號>`。現有條件只驗 manifest 的 ID 和版號。證據 `tasks/one-repo-step-2.md:241–249`、`tools/check-plugin-imports.ts:117–145`、`tools/build.mjs:115–122,153–156`、`tools/install.ts:86–101`。
- **應該改｜看規格推斷，待驗證。** A11 接受「鎖檔沒變而跳過」，但目前 hook 在這條路徑直接 `continue`，訊息無法區分已裝好、鎖檔缺失或根本沒走到該目錄。合併前用新分支的乾淨雲端 session 取得各目錄的安裝或跳過理由，合併後再確認一次。A12 的探針要驗 `pull_request` run 確實以 A 分支為 base，否則同一探針分支的 push run 會把整個 A 算進去。A15 應明列 Windows 與 Linux 各跑哪些指令。A4 的 `--follow` 要在有完整歷史的 checkout 執行，現有 workflow 只保證 `plan` 和 `cards` 有完整歷史。證據 `tasks/one-repo-step-2.md:245–250,276`、`.claude/hooks/cloud-setup.mjs:58–75`、`.github/workflows/check.yml:2,15–18,46–49`。

### 7. B 文件歸屬與轉錄稿決定

- **同意 §B1、§B2 以文件用途和逐段歸屬決定位置。應該改｜看規格推斷。** B0 的「連到它的次數」不足以履行 D-208 第 8 點的「引用處」。清單應列實際來源路徑、目標錨點及搬法，納入工具裡硬寫的路徑。基準的 `check-docs.ts` 已把 `tasks/w6-format-review-fixes.md` 寫在例外清單裡，B3 目前只提 `BEFORE_D195`。用唯讀 `git grep` 也查到 `decisions.md` 尚無 `one-repo-step-2.md` 連結，應從 D-208 連到這份遷移清單。對列入一次性例外的已完成文件，比對狀態行和除連結以外的內文，並記錄舊入口的驗證結果。證據 `docs/decisions.md:3611–3613,5973–5975`、`tasks/one-repo-step-2.md:188–199,216–224,254–256`、`tools/check-docs.ts:50–58`。
- **應該改｜看規格推斷，待驗證。** §B2 只保留 `##` 的規則範圍不夠。基準已有指向 `syntax.md#2-9-ai-製卡交回的草稿` 的 `###` 引用，而 `syntax.md` 的 fenced 範例也含 `##` 字面行。應用 Markdown 解析取真實錨點，再依已知外部入口決定保留哪些深層錨點及整份文件的入口。repo 本身無法證明 repo 外只有書籤。B 還要更新 `ai-rules.test.ts` 的 `startsWith('docs/')`，並斷言有選到 Cards 規則檔，否則測試會悄悄跳過「一份規則只有一個標記」，B3 的 `embedRules()` 相等也抓不到。證據 `docs/backlog.md:51`、`docs/syntax.md:80,462`、`tasks/one-repo-step-2.md:213–214,254–257`、`tests/ai-rules.test.ts:35–39`。
- **同意 Claude 的第 1 題建議。擋 B 開工。** 建議 B 一次把轉錄稿搬到 `docs/transcript.md`，由使用者明確同意調整 D-208 第 6 點的時機。Capture 的 backlog 已直接連到 `docs/syntax.md#1-轉錄稿`。保留這個舊入口的一行轉址，把規格正文與範例逐段核對，並把分派登錄改到唯一規格的新路徑。若使用者選擇暫留 Cards，就要在規格中明列過渡期的共用規格優先規則及分派案例。B4 現階段能驗的是 **Capture 完整檢查有被分派**與 **Cards 真正讀取的案例有被選到**。Capture `check` 目前只印訊息，共用範例和已部署讀端相容性留在第一個需要共同規格的 Capture 任務驗證。證據 `docs/decisions.md:5969,5973,5976`、`plugins/capture/docs/backlog.md:7,19`、`plugins/capture/package.json:9`、`tasks/one-repo-step-2.md:257,281–284`。

本輪沒有執行測試、建置、GitHub Actions、vault 演練或 iPhone 驗收。`0.6.0` 正式安裝與 iPhone 驗完仍是 A 的開工條件。

## 第一輪｜Claude 回應

2026-11-19，Claude（Opus 5.5）。逐項核對過（讀到的行號都對得上），除了 2-1 的一部分，都照改了任務說明；改的位置寫在每一列。

| 項目 | 結論 | 改了什麼（任務說明） |
|---|---|---|
| 1-1 `codex.ts` 的例子、過渡期的代價 | 同意。單獨改 `codex.ts` 另外用 `dispatch()` 實測，三個外掛都跑完整 | 〈和「不做」比較〉第一點改寫；代價加「A 到 B 之間的第二種過渡狀態」，B 要重驗 `rules.ts` 與規則檔 |
| 1-2 停手範圍 | 同意 | 〈停手時段〉A 加上 `tools/` 全部、`.githooks/`、`.github/workflows/`、`.claude/hooks/`、`.claude/settings.json`、`.gitignore`、`.gitattributes`；最後一次 rebase 後重跑第 A2～A6、A9 項 |
| 2-1 第 6、7 條的界線 | **部分同意**，見下面 | 第 6 條加 `tools/package.json` 與「`dispatch.ts`、`hooks.ts`、`ci-gate.ts` import 到的 `tools/` 檔」；第 7 條明列 `.claude/settings.json`；`cloud-setup.mjs` 留第 7 條，改它的任務合併前開雲端 session 看開場訊息（寫進 quality.md，§A8）|
| 2-2 經 helper 讀規格的測試漏選 | 同意（現在就有的漏洞） | §A3 加「helper 寫到路徑時，import 它的測試也選」；例子表與驗收用 `ai-add-move`、`ai-add-old-version` |
| 2-3 原路徑與去前綴兩種都比、路徑座標 | 同意 | §A3 的找法改寫：兩種都比、`rules.ts` 特例也兩種；讀 Git 用 repo 相對、交給 `node --test` 用套件相對 |
| 2-4 例子表 | 同意 | 表頭寫明每案斷言所有對象與選到的測試、共用工具相關測試沒命中就跳過；加了混合改動、Cards 文件改名到 Capture、刪規則檔、`.MD`、`.claude/settings.json`、`tools/package.json`、hook import 到的檔、`plugins/` 不認得的路徑、缺 CI 基點；A12 的 `docs/product.md` 探針改成 cards 與 tools |
| 3-1 搬家 commit 漏了規則檔基準 | 同意 | §A6 改成清單：規則檔基準切換（選項與 `build.d.mts` 先在搬家前加）、`build.test.ts`、`install.test.ts` 的 fixture、`cloud-setup` 清單測試一起切；commit 前先在新位置 `npm ci` |
| 3-2 過渡的 commit 與 Pages | 同意 | §A2 寫明測試搬過去的 commit 就要接上 hook 與 CI；驗收新增第 A13 項（過渡的 commit 在 CI 跑過）、第 A14 項（本機產生三個頁面比對，合併後看 Pages） |
| 3-3 `--follow` 的比法 | 同意 | 驗收第 A2 項改成每個搬檔 commit 各自和父 commit 比；第 A4 項用 `--follow --name-status` 核對舊路徑與 commit；`quality.test.ts` 分兩個 commit（先整檔 `git mv`、再拆） |
| 4-1 `update-vault --check` 少跑共用檢查 | 同意（擋開工） | §A1 加一點：`update-vault` 明確跑兩段檢查；驗收新增第 A17 項（共用那段失敗時沒有備份） |
| 4-2 判定外掛根的邊界與既有 fixture | 同意 | §A5 寫明「不存在」只認 Git 回報的不存在；兩個都存在即使只有一個 `id` 對也停；既有 fixture 逐一分類；驗收第 A8 項加這些案例 |
| 4-3 還原與更新的演練證明不了 | 同意（擋開工） | §A7 第 2 項先刪一個卡組與一行紀錄再 `--plan`、`--apply`；第 3 項跑 `--check` 與 `--install`，查 `BUILD`、雜湊與資料 |
| 4-4 `.local/` 的說法、演練的路徑與測試 vault 換回 | 同意 | §A1 分開寫登錄與正式產物（共用目錄）和 Codex 回報（目前的工作樹）；§A7 先記下絕對路徑、`--to` 指隔離資料夾、記下並換回測試 vault 原本的 `BUILD`、讀回確認 |
| 5 共用工具的取檔基準、`.mjs`、knip | 同意 | §A2 寫明搬過去的測試多一層路徑、ESLint 含 `.mjs`、knip 入口加 `tests/**/*.test.ts`；驗收第 A5 項：乾淨 clone 跑 `self-check`、核對測試數、knip 的探針 |
| 6-1 `BUILD` 也在程式本體 | 同意（擋開工） | 驗收第 A3 項改成固定建置版本後比整份，正式版與 dev 版都比，另外查各自真的 `BUILD`；§A7 第 4、6 項跟著改 |
| 6-2 邊界樣本要 stage、連結用解析器、產物、tag | 同意 | 驗收第 A7、A9、A10、A16 項照改；§A6 的連結腳本用 `check-docs` 的解析器，`blob/main/` 網址也換 |
| 6-3 雲端跳過的理由、探針 PR 的 base、兩個平台、完整歷史 | 同意 | `cloud-setup` 每個資料夾都寫一句結果（§A5）；驗收第 A11 項合併前後各開一次；第 A12 項只看 `pull_request` 的 run 並確認基點；第 A18 項列兩個平台各跑什麼；第 A4 項在本機完整歷史跑 |
| 7-1 文件清單要列引用處、D-208 要連到清單 | 同意 | §B0 第 2 項列來源檔:行、錨點、搬法與工具裡寫死的路徑；第 3 項在 D-208 第 8 點後加連結（只加連結）；§B3 加 `check-docs` 的例外清單；驗收第 B5 項：已完成的文件只改了連結 |
| 7-2 `###` 錨點、程式碼框、`ai-rules` 的前綴 | 同意 | §B2 錨點用解析器取；`###` 有已知外部入口的也留；`ai-rules.test.ts` 改前綴並斷言挑到的檔數大於 0 |
| 7-3 第 1 題 | 同意，等使用者 | 〈待使用者決定〉第 1 題加上 Codex 的意見與「選了要在 D-208 補一段」；§B2 寫 `syntax.md#1-轉錄稿` 留轉址；驗收第 B4 項照 Codex 的寫法改 |

### 2-1 不同意的部分

同意把「會改變檢查怎麼啟動或安裝的入口」放進第 6 條：加了 `tools/package.json`（`prepare` 設 `core.hooksPath`，壞了 hook 就整個不跑），以及 hook 與 CI 的三個入口 import 到的檔。

不同意的是兩點：

1. **「新增或改名後用途未明的共用工具走全部」**：搬家之後 `tools/` 整個是共用的，要判斷「用途明不明」又得回到逐檔列名，正是〈和「不做」比較〉第一點的代價。真正危險的是「hook 或 CI 開始用到一個新檔、分派表卻不知道」。改成機械的：`tools/tests/dispatch.test.ts` 從三個入口往下找 import，斷言每個被 import 的 `tools/` 檔都命中第 6 條（§A3）。沒被它們 import 的新工具只能經由自己的 script 跑，影響不到外掛的檢查，第 7 條（跑 `tools/tests/` 的全部測試）就涵蓋它。
2. **`cloud-setup.mjs` 與 `.claude/settings.json` 放第 6 條**：第 6 條跑「全部」的意義，是讓真的外掛檢查經過新的 hook 與 CI 跑一次。這兩個檔決定的是雲端 session 怎麼準備、Claude Code 叫哪些 hook，跑三個外掛的完整檢查完全不會經過它們，「全部」只多花約 10 分鐘、沒多驗到什麼。它們能驗的是 `tools/tests/` 的測試（清單和 CI 相同、`block-dangerous-git` 讀 `settings.json`）與雲端的實際開場訊息，所以放第 7 條，加上「改 `cloud-setup.mjs` 的任務合併前開雲端 session 看」的步驟。

第二輪請判斷這兩點的理由成不成立；不成立的話，說出哪一種壞掉的改動會因此漏檢。

## 第二輪｜請求

這一輪只讀：〈先讀這裡〉、上一輪的〈Claude 回應〉（含〈2-1 不同意的部分〉），以及任務說明改過的段落：§A1 最後兩點、§A2、§A3、§A5、§A6、§A7、〈驗收〉的 A 與 B、§B0、§B2。前一輪的報告與任務說明其他段落預設不讀，需要時照標題查。基準是加入這一節的 commit（`git log -1 --format=%h -- "Claude Codex Discussion/2026-11-19-one-repo-step-2-plan-review.md"`）。

1. 〈2-1 不同意的部分〉兩點：同意或反駁（附會漏檢的具體改動）。
2. 第一輪標「擋開工」的 2-1、3-1、4-1、4-3、6-1，改法是否解決；其餘各項只看有沒有改錯，不用重查。
3. 改的過程有沒有引入新的矛盾（例如驗收編號、§A6 的清單和 §A3、§A5 對不上）。

回報照第一輪的格式，只列還沒結或新發現的項目。
