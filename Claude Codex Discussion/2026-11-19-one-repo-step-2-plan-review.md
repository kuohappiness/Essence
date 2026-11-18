# 三個外掛同一個 repo 第二步｜開工前查核

狀態：第三輪查核中（第一、二輪的發現已核對、任務說明已改）

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

## 第二輪｜Codex 報告

2026-11-19，Codex（gpt-6.2-sol、high、唯讀），基準 `bc517d2`。原文（連結改成檔案路徑的文字）：

基準 `bc517d23127ba51bf8351bb8e52efe4eb22595f2`。依〈第二輪｜請求〉指定段落查核，程式證據取自同一基準。工作樹另有未提交的 `docs/syntax.md` 修改，本輪對照的是 Git 內的版本。

**A 仍有擋開工項目。** 第一輪 3-1 的規則檔基準切換已對上，§A5 與 §A6 都要求在搬家 commit 同時切換預設路徑與 fixture。以下列尚未結案及本輪新發現。第二輪請求（`Claude Codex Discussion/2026-11-19-one-repo-step-2-plan-review.md:98`） · 任務說明 §A6（`tasks/one-repo-step-2.md:173`）

### 擋 A 開工

1. **延續 2-1｜同意用機械檢查取代逐檔判斷，但三個 import 入口的範圍太窄。** 假設後續由 `check.yml` 直接呼叫 `node tools/check-card-output.mjs` 驗證 Cards 產物。新增接線的 commit 因為改了 workflow 會跑全部。下一次只改這支工具，即使讓它在 Cards job 出錯，仍落第 7 條，只跑共用工具。三個 TypeScript 入口的 import 檢查也會通過。現有 workflow 已用 `run:` 直接啟動工具，Git hook 也有直接呼叫 `tools/check-local-paths.ts` 的先例。建議把 workflow、shell hook、npm script 直接呼叫且會左右外掛檢查的工具也納入第 6 條，驗收用「接線已存在，這次只改被呼叫的檔」的案例。**靜態推斷，待驗證**實際分派。§A3 第 6、7 條（`tasks/one-repo-step-2.md:107`） · CI 命令（`.github/workflows/check.yml:22`） · commit-msg（`.githooks/commit-msg:5`）

2. **延續 2-1｜同意雲端設定留第 7 條，實際探針也要涵蓋 `settings.json`。** 只改 `settings.json`，把 `SessionStart` 的 `cloud-setup.mjs` 路徑拼錯，會讓雲端 session 漏掉環境準備。現有設定測試只斷言 `PreToolUse` 的 matcher，§A5 新測試只比資料夾清單，兩者都會放過這個改動。§A3 的雲端探針只明列改 `cloud-setup.mjs` 時執行。把 `SessionStart` 接線變更也列為觸發條件，探針確認 hook 實際執行、四個目錄有成功或符合條件的跳過結果，並確認後續指令用得到 Node 24 與 `.githooks`。**靜態推斷，待驗證**雲端宿主行為。§A3 雲端探針（`tasks/one-repo-step-2.md:116`） · SessionStart 設定（`.claude/settings.json:4`） · 既有設定測試（`tests/block-dangerous-git.test.ts:58`）

3. **延續 4-1｜升正式版補回共用 `check`，仍少跑搬到 `tools/tests/` 的測試。** 目前 `update-vault --check` 呼叫 Cards 的 `npm run check`，其中的 `npm test` 會跑 `tests/` 下的 `dispatch`、`hooks`、`ci-gate` 等測試。§A2 移走這些測試，並明定 `tools/` 的 `check` 不加測試。照 §A1 和 A17 跑共用 `check` 加 Cards `check`，兩段都綠時，仍可能把一個既有共用測試會擋下的版本帶進正式備份與安裝流程。應把共用測試也放回備份前，並讓 A17 驗證共用測試失敗時確實停手。**靜態推斷，待驗證**失敗流程。§A1、§A2（`tasks/one-repo-step-2.md:80`） · A17（`tasks/one-repo-step-2.md:277`） · 現行 Cards scripts（`package.json:9`） · 更新流程（`tools/update-vault.ts:146`）

4. **延續 4-3｜舊 ZIP 有實際寫入案例，但原樣比對會把正常還原判成失敗。** §A7 第 2 項在兩個不同的 vault 複本執行。計畫 JSON 包含目的 vault 的絕對路徑和建立時間，兩份計畫原樣就不同。補回紀錄時，CLI 各自產生帶隨機裝置碼的檔名，所以逐路徑比對也會失敗。已用現行純函式唯讀驗到同一來源與日期會分別產生 `sample 還原 2026-11-19 Windows-a001.jsonl` 和 `sample 還原 2026-11-19 Windows-b002.jsonl`。應比計畫的動作、順序與資料，驗證還原檔名符合 §5-3，再按紀錄來源比內容與筆數。要證明「沒選的資料沒動」，可再準備一個有差異、可還原的卡組，透過 `--files` 刻意排除。Windows 更新演練已補上 `--check`、`--install`、雜湊和資料比對。**命名差異已驗證，兩條完整演練待驗證。** §A7 第 2、3 項（`tasks/one-repo-step-2.md:193`） · 計畫欄位（`tools/restore.ts:82`） · 裝置碼（`tools/restore.ts:150`） · 還原檔名（`src/core/backup/names.ts:51`）

5. **延續 6-1｜整份比較的判準已修正，A3 還缺 `<基準>` 的可執行做法。** `<基準>` 定義為開工時的 `main`，當時的 `buildPlugin()` 沒有固定版本選項。若兩邊傳入同一新選項，基準端仍照 Git 算出自己的 `BUILD`，連本體都會帶入。可先在乾淨的 `<基準>` 走原本的正式版與 dev 建置，讀回基準產物的 `BUILD`，再讓 `<A>` 的固定選項使用該值。兩邊另外走預設入口查真實建置版本。**靜態推斷，待驗證**建置位元組。A3（`tasks/one-repo-step-2.md:259`） · 現行建置入口（`tools/build.mjs:100`）

6. **新發現｜整檔搬 `quality.test.ts` 的過渡 commit 會用錯 ESLint 設定。** §A2 要整檔先搬到 `tools/tests/`，下一個 commit 才拆出 Cards 的測試，而且搬的當下就要跑。整檔仍包含以 `new ESLint()` 從執行目錄找設定、對 `src/core/files.ts` 斷言 Cards 邊界規則的案例。從 `tools/` 跑 `self-check` 時，照 §A2 會使用刻意省去這些規則的 tools 設定。應明列過渡 commit 如何從 Cards 原根執行這些斷言，並在拆分後確認 tools 與 Cards 各有對應測試。**靜態推斷，待驗證**過渡 commit 的 hook 與 CI。§A2（`tasks/one-repo-step-2.md:88`） · 現有 ESLint 斷言（`tests/quality.test.ts:12`）

7. **新發現｜§A6 還要切換跨版本測試的 clone 來源。** §A5 已寫出舊 tag checkout 後如何找外掛根，以及從哪裡借 `node_modules`。但 `pick-old-version`、`ai-add-old-version` 和 `compare-versions` 現在都用測試檔上一層當 `git clone` 來源。搬後原式會傳 `plugins/cards/`，在 checkout 舊 tag 之前就失敗。唯讀探針確認 `git ls-remote . HEAD` 成功，而同 repo 的 `git ls-remote ./plugins/capture HEAD` 以 128 失敗，即使在該子目錄執行 `git rev-parse --show-toplevel` 能找到 repo。把 clone 來源指向 repo 根、借用相依仍取 Cards 根，並納入 §A6 同一個 commit。**子目錄差異已驗證，搬後測試待驗證。** §A5、§A6（`tasks/one-repo-step-2.md:165`） · 舊版測試的 clone（`tests/ai-add-old-version.test.ts:37`） · 比較測試的 clone（`tests/compare-versions.test.ts:167`）

### 其他未結與新矛盾

- **§A5／A8 的「不存在」需要更明確的 Git 判準。** 唯讀探針中，現存 `bc517d2:manifest.json` 回傳 0，缺少 `bc517d2:plugins/cards/manifest.json` 和不存在的 commit 都回傳 128。若實作只看 `cat-file -e` 結束碼，讀取失敗會被當成不存在。建議先驗證 commit，再成功列舉該樹的兩個路徑，以未列出的項目判定缺檔。**結束碼差異已驗證，實作待驗證。** §A5（`tasks/one-repo-step-2.md:162`） · A8（`tasks/one-repo-step-2.md:268`）
- **§A7 的 iCloud 測試 vault 復原只記 `BUILD`，無法保證換回原產物。** 開發安裝直接把三個檔案複製進 vault，正式版流程才保存有雜湊的產物。如果原本裝的是 `.dirty` 開發版，只憑 `BUILD` 找不到當時的確切內容。觸碰 iCloud 測試 vault 前先在隔離目錄留存三個原檔與雜湊，復原後核對三檔及讀回的 `BUILD`。**靜態推斷，待驗證**實際復原。§A7 第 4 項與收尾（`tasks/one-repo-step-2.md:195`） · 安裝分支（`tools/install.ts:178`）
- **§A3 的跳過說明與 CI 案例矛盾，A5 的測試計數也需改成逐檔驗證。** §A3 例表前說共用工具相關測試未命中就跳過，`docs/product.md` 案例則要求即使無命中，CI 仍跑 tools 完整檢查。把「未命中就跳過」限定在 pre-commit，即與 §A3 的 CI 升級規則一致。A5 應檢查每個應跑的測試檔確實被執行，再核對個案數及新增測試。現有 `ci-gate.test.ts` 一檔已有多個測試，總個案數無法證明每個檔都被載入。**靜態核對，待驗證**測試輸出。§A3 例表（`tasks/one-repo-step-2.md:122`） · A5（`tasks/one-repo-step-2.md:265`） · 現有測試（`tests/ci-gate.test.ts:38`）
- **擋 B 的驗收｜B1 把整檔改名的歷史判準套到拆段新增的檔案。** §B0 要為逐段拆出的內容逐列列帳，B1 又要求每列的新路徑用 `git log --follow` 接到搬前歷史。以 `docs/product.md` 為例，拆段後原檔仍在，新檔是新增，`-M30%` 的改名門檻無法保證接到原檔。整檔搬移沿用 `--follow`，逐段拆分在清單記錄原檔、原錨點與來源 commit，腳本對照拆前內容和新位置。**靜態推斷，待驗證**拆分歷史。§B0（`tasks/one-repo-step-2.md:214`） · B1（`tasks/one-repo-step-2.md:283`）
- **§B2 需要涵蓋搬走段落內指向保留段落的連結。** 例如 `docs/syntax.md` §0 的 `[§1](#1-轉錄稿)` 會隨 §0 進 Cards，原本的 `#1-轉錄稿` 仍在最上層，或依已決定的去向轉往新頁。§A6 腳本只說重寫「目標是搬走的路徑」的連結，這個案例是連結來源移動，舊目標仍存在。B0 的清單應用拆前來源解析目標，再按拆後的來源與目標重算相對路徑。以這條連結為驗收案例，確認點到仍適用的轉錄稿規格。**靜態推斷，待驗證**實際拆檔及連結。§A6 連結腳本（`tasks/one-repo-step-2.md:184`） · §B2（`tasks/one-repo-step-2.md:236`） · 現有連結（`docs/syntax.md:17`）

本輪完成唯讀的 Git、原始碼與命名函式核對。暫存 clone、fixture、背景 hook／CI、實際雲端開場、建置、備份還原、Windows 更新與 iPhone 載入均待驗證。這些驗證需要寫檔或實際環境，本機此基準也尚無 `v0.6.0` tag。

## 第二輪｜Claude 回應

2026-11-19，Claude（Opus 5.5）。全部同意，照改了任務說明（基準 `bc517d2` 之後的 commit）。

| 項目 | 結論 | 改了什麼（任務說明） |
|---|---|---|
| 擋 1 檢查的入口不只三個 TypeScript 檔 | 同意 | 第 6 條改成「檢查的入口」：`.githooks/` 的 hook、`check.yml`、外掛 `package.json` 的 scripts 字面寫到的 `tools/` 檔，加 `dispatch.ts`、`hooks.ts`、`ci-gate.ts`，再加它們 import 到的；測試照這個規則機械地取，例子表加「接線已在、只改被呼叫的檔」與 `check-local-paths.ts`（`commit-msg` 直接呼叫）。`progress-board.yml` 與共用檢查本身不算入口（不影響外掛的檢查，每次 commit 用新版跑），寫明理由 |
| 擋 2 `settings.json` 的 `SessionStart` | 同意 | §A3 加測試：`SessionStart` 指令寫到的檔存在、是 `cloud-setup.mjs`；雲端探針的觸發加上 `SessionStart` 的改動，探針看 hook 有跑、四個資料夾的結果、Node 24、`core.hooksPath`；§A8 的 quality.md 一句跟著改 |
| 擋 3 `update-vault` 少跑共用工具的測試 | 同意 | §A1：`update-vault --check` 跑 `tools/` 的 `check` 與 `self-check`、Cards 的 `check`；驗收第 A17 項三種失敗都要停 |
| 擋 4 還原演練的比對方式 | 同意 | §A7 第 2 項：計畫去掉絕對路徑與時間後比動作、順序與資料；還原檔名照 §5-3 的格式、照來源比內容與行數；卡組 B 用 `--files` 排除，當「沒選的資料」 |
| 擋 5 `<基準>` 沒有固定版本的選項 | 同意 | 驗收第 A3 項：`<基準>` 照原入口建置、讀回 `BUILD`，`<A>` 用新選項填那個值再比；`<A>` 另外照預設入口查真的 `BUILD` |
| 擋 6 `quality.test.ts` 整檔先搬會用錯 ESLint 設定 | 同意 | §A2 改順序：先在 `tests/` 裡把 ESLint 那幾個拆到 Cards 的新檔，再把只剩 hook 的 `quality.test.ts` 整檔 `git mv`；驗收第 A5 項：兩半的測試數加起來等於拆之前 |
| 擋 7 讀舊版的測試 clone 來源 | 同意 | §A5：clone 來源改成 repo 根，和搬家同一個 commit（§A6 的清單也加了） |
| 「不存在」的判準 | 同意 | §A5：先 `rev-parse --verify`，再 `ls-tree` 列兩個路徑，成功而沒列出才算不存在 |
| 測試 vault 只記 `BUILD` 換不回 | 同意 | §A7 第 4 項：先把三個檔複製到隔離資料夾、記雜湊；收尾放回後核對雜湊與 `BUILD` |
| 跳過的說明與 CI 矛盾、測試數 | 同意 | §A3 表頭：「沒命中就跳過」只說 pre-commit，CI 一律升成完整；驗收第 A5 項逐檔核對（印檔名的 reporter、每檔的測試數） |
| B1 拆段的歷史 | 同意 | 驗收第 B1 項：整份搬的用 `--follow`；拆出的段落記原檔、原錨點、拆之前的 commit，比對內容 |
| B2 連結的來源也會搬 | 同意 | §B2 加一點：用拆之前的來源解目標、照拆之後重算；`syntax.md` §0 的 `[§1](#1-轉錄稿)` 當驗收案例。A 搬的檔裡沒有 Markdown（`git ls-files src tests` 沒有 `.md`），A 的腳本不用處理這種情況 |

## 第三輪｜請求

這一輪只讀：〈先讀這裡〉、〈第二輪｜Claude 回應〉，以及任務說明裡第二輪改過的地方：§A1 最後一點、§A2 的 `quality.test.ts` 那一點、§A3 第 6 條與它下面三點、例子表的表頭與新加的兩列、§A5 判定外掛根的那一點與讀舊版測試那一點、§A7 第 2、4 項與收尾、驗收第 A3、A5、A17、B1 項、§B2 新加的「連結的來源也會搬」。其他段落預設不讀。基準是加入這一節的 commit（`git log -1 --format=%h -- "Claude Codex Discussion/2026-11-19-one-repo-step-2-plan-review.md"`）。

1. 第二輪的七個「擋 A 開工」是否都解決；沒解決的寫出還缺什麼。
2. 這一輪的修改有沒有引入新的矛盾或擋開工的問題。
3. 「應該改」以下的小問題不用列，除非它會讓驗收判錯。

只列還沒結或新發現的；都解決就寫「沒有擋開工的項目」。
