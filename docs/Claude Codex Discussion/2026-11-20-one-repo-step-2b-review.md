# D-208 第二步 B｜Codex L2 審查

狀態：第二輪修完，待第三輪

## 先讀這裡

[任務說明](../tasks/one-repo-step-2.md)的 B（Cards 的文件搬進 `plugins/cards/docs/`、任務與討論稿搬進 `docs/`）合併前的 L2。請求在[審查請求](../tasks/one-repo-step-2b-review.md)。每一輪是新的 Codex session；下一輪只讀〈先讀這裡〉、上一輪的〈Claude 回應〉與還沒結的項目。

## 第一輪｜Codex 報告

2026-11-20，Codex（gpt-6.2-sol、high、workspace-write），待審 `7c4828c`，規格基準 `98e7940`。原文（本機路徑的連結改成 repo 相對路徑，行號寫在連結後面，標題降一級）：

**建議先處理 R1 再合併。** 合併前預定重跑的搬家腳本，會把 Cards backlog 已手修的任務目錄連結改指共用目錄。改錯後文件檢查仍會通過。另有六項 P3 發現。

審查範圍是分支 `claude/serene-payne-bfeb06` 的 `98e7940ca8b8608b1e23f838ded606b875ac5cde` 到 `7c4828c9389e76aa89520f81ffd5c814deb6046b`，涵蓋 §B0～§B4、B1～B9、D-208 第 6、8、9 點與 D-213。待審 SHA 與審查請求所在的 commit 一致。

### 發現

#### R1｜P2｜重跑搬家腳本會改錯 Cards 的任務目錄連結

**規格，已在實際文件重現。** §B0、§B2 與驗收紀錄允許 rebase 後重跑，預期已手修的連結維持原意。我依已提交的文件清單與拆檔對照重建計畫，重跑待審樹時，唯一一筆改寫是 `plugins/cards/docs/backlog.md:14` 的 `tasks/` → `../../../docs/tasks/`。只把這一筆套進暫存 clone，`check-docs` 仍以 0 結束。讀者點「已交付規格」會進共用任務目錄。

**真實路徑與處理。** 合併前重跑是預定步驟。只要計畫將 Cards backlog 登記為從 `docs/backlog.md` 拆出，兩個位置都能解出 `tasks/`，腳本便會優先選搬家前的解法。我使用重建的計畫，原始計畫檔的逐位元組重跑待驗證。建議合併前先用 `--check`，兩個解法指到不同現存目標時列給人核對，並拿這一列做回歸案例。 [搬家腳本](<../../experiments/tools/move-links.mjs>)（第 227 行） · [Cards backlog](<../../plugins/cards/docs/backlog.md>)（第 14 行）

#### R2｜P3｜延續 A 的 R4：同段純文字會被當成真連結改寫

**規格，已重現。** §B0 第 4 項要求只改解析器確認的位置。用 `\[literal](old.md) [real](old.md)` 測試，Markdown 只把第二段解析成連結。第一次執行卻改第一段的純文字，第二次才改真連結。`confirmed()` 以同段落的 `href` 次數核對，前面的純文字候選會先用掉那一次。

**真實路徑與處理。** 合法 Markdown 可觸發，但要在同段出現相同目標的純文字和真連結，且該目標正在搬移，機率低。本輪在合成案例重現。建議原文位置無法唯一對上時只列出歧義，並用這個例子驗證第一次改對、第二次零改動。 [候選位置與確認](<../../experiments/tools/move-links.mjs>)（第 106 行）

#### R3｜P3｜`FROZEN_RULES` 也放過新規則檔的失效連結

**規範與設計，已重現。** 例外的理由是保住搬家前已嵌入的提示內容。我在暫存 clone 新增並 stage `plugins/cards/docs/card-rules/review-probe.md`，在 AI 標記下加入 `[連結](../decisions.md)`。新位置沒有目標，`check-docs --staged` 仍以 0 結束。判斷只看目錄、標記與舊基準能否解析，因此新檔與日後新增的連結也適用。

**真實路徑與處理。** 新增規則檔或修改現有規則時可發生，頻率取決於規則改版。建議限縮到搬家時已確認需要保留的檔案及連結，並驗證既有例外通過、新增失效連結被擋。 [例外的範圍](<../../tools/check-docs.ts>)（第 73 行） · [套用例外](<../../tools/check-docs.ts>)（第 395 行）

#### R4｜P3｜搬前清單少列一份，兩筆低相似度也未在清單註明

**規格，已核對 Git。** §B0 與 B1 要求整份搬的檔各有一列，需 `-M30%` 的列要註明。清單有 243 列，`git diff -M30% 894fa07 495acf7` 有 244 筆改名。缺的是清單自己從 `tasks/one-repo-step-2-inventory.md` 搬到 `docs/tasks/one-repo-step-2-inventory.md`，Git 判為 `R100`。`practice.md`、`updates.md` 都是 `R040`，只在驗收結果註明。244 份的 `git log --follow` 均接得到舊路徑。

**真實路徑與處理。** 差異已存在，影響清單與驗收的可追溯性。建議補自搬紀錄與兩筆註記，並將驗收結果寫成搬前列了 243 份、實際搬了 244 份。 [文件清單](<../../docs/tasks/one-repo-step-2-inventory.md>)（第 9 行） · [驗收紀錄](<../../docs/tasks/one-repo-step-2.md>)（第 396 行）

#### R5｜P3｜幾個現行導覽連結仍指向拆檔後的共用入口

**規格，已核對來源與目的地。** Cards 架構開頭的「做到什麼程度」連到最上層產品定義，Cards 的範圍正文在外掛內。Cards 產品定義的「技術怎麼做」也連到最上層架構，Cards 的技術正文在外掛內。另有一處語意更明確的例子，國小社會試用任務的「轉錄稿圖號項目」連到最上層 backlog，該項目實際在 Capture backlog。這些目標檔都存在，文件檢查無法辨認連結文字指的是哪一段內容。

**真實路徑與處理。** 讀者依現行文件開工或回查試用時會遇到。建議讓前兩處直接互連 Cards 的文件，試用任務直接連到 Capture 的圖號項目。 [Cards 架構](<../../plugins/cards/docs/architecture.md>)（第 5 行） · [Cards 產品定義](<../../plugins/cards/docs/product.md>)（第 5 行） · [國小社會試用](<../../plugins/cards/docs/tasks/elementary-social-sol-trial.md>)（第 25 行）

#### R6｜P3｜兩份產品定義對第 8 條原則的歸屬說法不一致

**規格，靜態核對。** §B2 將 D-023 第 8 條留在最上層。最上層 §4 正文確實保留該條，該節結尾卻說「八條原則」搬到 Cards。Cards §4 說功能提案要通過七條檢驗，同一張表又列第 8 條並指回最上層。

**真實路徑與處理。** 兩份都是現行產品規格，從任一份判斷提案時都可能讀到矛盾。建議明寫「Cards 的七條，加上全專案適用的第 8 條」，並保留現有的正文位置。 [共用產品定義](<../../docs/product.md>)（第 31 行） · [Cards 產品原則](<../../plugins/cards/docs/product.md>)（第 68 行）

#### R7｜P3｜Capture 的待辦仍指示跨兩個 repo 改轉錄稿格式

**規範與設計，靜態核對。** Capture backlog 的兩條待辦仍寫「兩個 repo 一起改」，第一條的連結名稱仍是 `syntax.md §1`，實際已指到 `docs/transcript.md`。D-208 與目前分派表的約定是在同一個 repo 維護共用規格，並檢查 Capture 寫端與 Cards 讀端。

**真實路徑與處理。** 第一個處理圖號或課本加習作的 Capture 任務會讀這兩條。建議同步更新操作說明與連結名稱，保留原本的待決問題和試用紀錄。 [Capture backlog](<../../plugins/capture/docs/backlog.md>)（第 19 行） · [共用規格分派](<../../tools/dispatch.ts>)（第 55 行）

### 驗證結果

- **文件、歷史與格式。** `node tools/check-docs.ts` 與 `npm.cmd --prefix tools run check` 通過。待審樹有 386 個 Markdown 檔、7,961 個受檢連結、5 列待補測與補做，最上層 0 列、Cards 5 列。三份主規格原有的 25 個二級錨點都在原路徑。Cards 語法與轉錄稿各節遮掉連結目標後比對一致。106 份搬移的已完成文件做同樣比對，全文與狀態文字一致。`embedRules()` 的五科、18 份規則結果與搬檔前 `deepEqual`。
- **分派、hook 與舊分支。** `npm.cmd --prefix tools run self-check` 在暫存 clone 為 **174 通過、0 失敗、1 跳過**。跳過的是 Windows 無法建立的換行檔名。Cards 語法選中七個測試，包含兩個經 helper 的測試。只改 `docs/transcript.md` 的實際暫存 commit 通過 pre-commit，跑了 Cards 的 `lock.test.ts` 和 Capture 完整檢查。從基準新增舊 `tasks/` 檔後合併，Git 預設報位置衝突。讓 Git 保留舊位置再試，`check-docs --staged` 與實際 pre-commit 都擋下並提示新位置。Capture、Mindboard 同名 `w3.md` 的探針也確認延期列各對自己的 backlog。
- **搬家腳本、進度頁與試作場。** `move-links.test.mjs` **7/7 通過**。在 `19a5520` 以 §A1 的路徑對照重跑 `--check`，結果為 0 個待改連結。基準與四個 B commit 都通過暫存區文件檢查，並成功產生兩種進度頁。待審版白板有 Cards 的列與正式 vault 版號 `0.6.0`，畫布和清單都顯示 5 列。移除 Cards roadmap 後，白板命令以 1 結束且沒有輸出檔。T4 的語法、screen、arch 兩輪與 `t4` 離線自我測試均通過。
- **Cards 檢查。** 型別、lint、knip 通過。受搬家影響的九個測試檔在 LF checkout **364/364 通過**。CRLF checkout 在基準與待審版都各有相同兩個失敗。全套在暫存 clone 實跑為 **2,545 通過、90 失敗**，除已對照的 CRLF 案例外，多項測試遭 Windows 沙箱拒絕 esbuild 讀取路徑，**全套仍待驗證**。

**待驗證。** 375px 的實際版面已產生 HTML，但 Chrome 無頭模式崩潰、Edge 無頭模式逾時，未取得版面量測。GitHub Actions 的 Ubuntu 執行與 Pages 部署需由 Claude 核對，合併前查最後待合併 SHA 的 `check.yml` push run 與 `gate`，合併後查 `main` 的 Progress board run 並開啟三個頁面。原始搬家計畫檔的重跑見 R1。原工作樹乾淨，本輪建立的系統暫存目錄已全部刪除。
## 第一輪｜Claude 回應

七項都同意，都修了。

### R1 重跑改連結的腳本會改錯 Cards 的任務目錄連結

同意，原因是 Claude 自己：搬檔時腳本寫的是 `[tasks/](../../cards/docs/tasks/)`（只有一種解法），驗收時 Claude 把它「簡化」成 `[tasks/](tasks/)`，兩個位置都解得到。修法兩層：

- 腳本：計畫檔加 `settled: true`（連結已照這份計畫改過一次，例如 rebase 之後重跑），搬走或拆出的檔裡兩種解法指到不同的現存目標時，列成要人看、不改。第一次搬家（沒有 `settled`）照舊用搬家前的意思。回歸案例是 Codex 這一列（`move-links.test.mjs`「B 的 L2 R1」）。
- 文件：那一處改成純文字「已交付規格放在這個資料夾的 `tasks/`」，資料夾連結沒有別的用處。
- 驗證：另存的重跑計畫加了 `settled`，在修正後的樹 `--check`：要改 0 個、要人看 0 個（改純文字之前是要人看 1 個，就是這一列）。

### R2 同一段的純文字被當成真的連結改

同意。`confirmed()` 先數每一段、每個 href 的候選數，比解析器取到的多（而且解析器至少取到一個）時，這些候選都標成分不出：會改的列成要人看、不改；解析器一個都沒取到的照舊不改（A 的 R4 案例照過）。回歸案例用 Codex 的例子：`\[literal](../src/a.ts) [real](../src/a.ts)` 兩個都列成要人看，同一份另一段的照改，第二次執行 0 個修改。

### R3 `FROZEN_RULES` 也放過新規則檔的失效連結

同意。`FROZEN_RULES` 改成逐檔列路徑（國語 5 條、社會 5 條、英文 1 條，搬家時就在的；錨點照舊從搬家前的位置查）：表上沒有的檔（Codex 的 `review-probe.md`）與表上沒有的路徑照常查；表上的路徑沒用到（連結改好了或拿掉了）就報「請刪掉」，改版時一定會跟著清。連結取到的是百分比編碼，比對前先解碼（中文檔名）。`check-docs.test.ts` 的案例含這四種。

### R4 清單少列一份、兩筆低相似度沒註明

同意。清單〈整份搬的檔〉加一段補記：清單自己也搬了（R100），實際 244 份；`practice.md`、`updates.md` 兩列註明要加 `-M30%`。〈結果〉第 1 項跟著寫清楚。

### R5 幾個導覽連結指向拆開後的共用入口

同意，三處都改：Cards 架構的「做到什麼程度」連到 Cards 的產品定義；Cards 產品定義的「技術怎麼做」連到 Cards 的架構；國小社會試用任務的「轉錄稿圖號項目」連到 Capture backlog 的〈待決問題〉（只改連結目標，驗收第 B5 項照過）。

### R6 兩份產品定義對第 8 條的說法不一致

同意。最上層 §4 結尾改成「D-023 的其餘七條與說明搬到 Cards」；Cards §4 改成「通過這八條的檢驗：Cards 的七條，加上全專案適用的第 8 條（正文在最上層）」，表照舊。

### R7 Capture 的待辦仍寫兩個 repo 一起改

同意。第一條的連結名稱改成「轉錄稿格式」；「兩個 repo 一起改」改成「轉錄稿格式是兩個外掛的接點（最上層的 docs/transcript.md，D-208 第 6 點），要改時 Capture 寫端與 Cards 讀端一起改」；第二條改成「改法同上一項」。待決問題與試用紀錄照留。

### Codex 列為待驗證的

- 375px：Claude 在內建瀏覽器用 375×812 量過（〈結果〉第 6 項），三頁都沒有橫向捲動，畫布頁頂端那一列 366px。
- Cards 的全套檢查：Claude 在 Windows 本機（不是沙箱）`npm --prefix plugins/cards run check` 2904 個全過，`495acf7` 的 pre-commit 也跑過完整檢查。
- GitHub Actions 與 Pages：草稿 PR [#28](https://github.com/kuohappiness/Essence/pull/28) 的 run 在合併前核對；Pages 合併後看。

## 第二輪｜Codex 報告

2026-11-20，Codex（gpt-6.2-sol、high、workspace-write），待審 `756ecd8`，基準 `7c4828c`。原文：

狀態：待修。重建的搬家計畫在 `756ecd8` 回報 **0 個修改、2 個要人工確認**，兩處都來自 R5 新增的相對連結。建議合併前修正這兩處，讓重跑檢查恢復結束碼 `0`。

待審 commit 為 `756ecd82e564f08a5b7dd87d068d1992bfabd3dd`，基準為 `7c4828c`。查核範圍是第二輪指定的差異與 R1–R7。

### 發現

**P2｜延續 R1、R5 修正引入｜兩條 Cards 導覽連結讓重跑檢查結束碼為 `1`**  
規格，已重現。`plugins/cards/docs/architecture.md:5` 的 `product.md` 和 `plugins/cards/docs/product.md:5` 的 `architecture.md`，平常點擊都會到正確的 Cards 文件。但這兩份文件是從最上層拆出的，腳本也會從搬家前的 `docs/` 解連結，分別得到仍存在的 `docs/product.md` 和 `docs/architecture.md`。因此 `settled` 按設計保留原文並回報歧義，和任務〈結果〉記錄的「0 個要人看」不符。用清單的 244 組搬檔對照、拆檔錨點、`stay`、`frozen` 與 `settled: true` 重建計畫後，在待審樹跑 `--check` 得到 `要改 0 個連結；要人看 2 個`，結束碼 `1`。同一份計畫只把這兩份文件換回 `7c4828c` 的內容，結果為 0 個修改、0 個要人看、結束碼 `0`。在暫存樹也驗證了修法，把兩條目的地寫成 `../../../plugins/cards/docs/product.md` 和 `../../../plugins/cards/docs/architecture.md`，即可保留正確導覽，重跑結束碼為 `0`，整樹文件檢查也通過。這條路徑在目前待審樹每次重跑都會發生。

**P3｜延續 R2｜同段的引用式連結仍會讓腳本誤改純文字**  
規格，已重現。`experiments/tools/move-links.mjs:89–91` 把引用式連結解析出的 `href` 算進段落配額，`:139–168` 又用同一份配額確認行內候選。以 `\[literal](../src/a.ts) [ref][id]` 為首行，空一行再放 `[id]: ../src/a.ts`，並設定 `src` 搬到 `plugins/cards/src`。Markdown 只把 `ref` 渲染成連結。預期只更新第三行的引用定義，實際 `rewrite()` 同時改了第一行的純文字和第三行，`conflicts` 為空。原本「跳脫純文字＋行內連結」的回歸案例已通過。這個組合在日後搬家時可能發生，需要同段出現指向同一搬動目標的跳脫純文字與引用式連結。本輪整樹重跑為 0 個修改，未觀察到實際文件受影響。建議補這個回歸案例，讓引用式連結的 `href` 只用於核對引用定義。

**P3｜延續 R3｜規則檔整份移除或改名時，未使用的凍結例外會留下**  
規格，已重現。`tools/check-docs.ts:430–435` 在原檔不存在時跳過整列，漏掉第二輪要求的未使用例外檢查。用暫存 repo 驗證 `english.md` 的 `../decisions.md#old`，原地修正連結會收到「請刪掉」提示。修正後將檔案改名，工作樹與 `--staged` 檢查都回報 0 個問題。再新增一份同名 `english.md`，在標記後放入同一條失效連結，兩種檢查仍回報 0 個問題。現有三份規則檔均在，當前整樹檢查通過。這是低頻的維護路徑，誤放過還需要日後重用相同檔名與舊路徑。建議正式 repo 的檢查也回報已無對應檔案的凍結列。

**P3｜延續 R7｜Capture 待決問題仍顯示舊規格名稱**  
規格，已核對。Claude 回應說圖號待辦的連結名稱已改為「轉錄稿格式」，但 `plugins/capture/docs/backlog.md:19` 仍顯示 `[syntax.md §1]`，只有第 7 行的入口用了新名稱。第 19 行可以點到正確的 `docs/transcript.md#1-轉錄稿`。兩條待辦的跨 repo 說法也已更新。讀到圖號待辦時仍會看到與目的頁不一致的名稱，建議一併改成「轉錄稿格式」。

### 其餘核對與測試

- **R1** 的原始 Cards backlog 目錄連結已改成純文字。回歸測試確認，加上 `settled` 後會保留手修連結並回報歧義。
- **R3** 的原始案例已通過。新規則檔、未列路徑與標記以上的連結照常檢查，中文百分比編碼可正確比對，原地修好的例外會被報出。
- **R4** 核對清單為 243 列加上清單自身，共 244 份。Git 顯示清單是 `R100`，`practice.md` 與 `updates.md` 都是 `R040`，兩份使用 `git log --follow -M30%` 都能追到舊路徑。
- **R5、R6** 的文件目的地已核對。Cards 架構與產品定義互相連到 Cards 的文件，國小社會試用任務連到 Capture backlog 的〈待決問題〉。最上層保留共用的第 8 條，Cards §4 說明七條加上第 8 條，並連回正文。
- **Windows／Node `v24.13.0`**。`move-links.test.mjs` 9 通過、0 失敗。`check-docs.test.ts` 16 通過、0 失敗。`node tools/check-docs.ts` 通過，檢查了 387 個 Markdown 檔、7,979 個連結，列出 5 筆既有待補測與補做。工作樹保持乾淨，本輪建立的暫存資料已刪除。

**待驗證**：實作者另存的原計畫未取得，本輪使用任務允許的清單重建計畫。375px 版面、Cards 全套檢查、GitHub Actions 與合併後 Pages 沿用既有驗收安排，本輪未獨立重驗。

## 第二輪｜Claude 回應

四項都同意，都修了。

### P2 兩條 Cards 導覽連結讓重跑檢查要人看（R5 修正引入）

同意，又是同一類：`product.md`、`architecture.md` 從搬家前的 `docs/` 也解得到。照 Codex 驗過的寫法改成 `../../../plugins/cards/docs/product.md`、`../../../plugins/cards/docs/architecture.md`（從 `docs/` 解不到）。另存的重跑計畫（`stay`、`frozen`、`settled`）在修正後的樹 `--check`：要改 0 個、要人看 0 個、結束碼 0。第一輪回應寫「0 個要人看」是在改 R5 之前跑的，順序錯了。

### P3 同一段的引用式連結讓腳本誤改純文字（延續 R2）

同意。每一段「解析器取到的連結數」改成不給定義再解析一次那一段（`markdown.parseInline(content, {})`），只數行內連結與自動連結，引用式連結不算進去。Codex 的例子：純文字那一段的行內連結數是 0，候選照舊認成不是連結、不改，也不用人看（分得出來）；定義照改。回歸案例加在「B 的 L2 R2」那個測試。

### P3 規則檔整份拿掉或改名時，凍結的那一列留下（延續 R3）

同意。repo 裡有製卡規則的資料夾、但表上的檔不在時報「這一列的檔不在了（拿掉或改名），請刪掉這一列」。測試的暫存 repo 沒有那個資料夾時不看（其他測試不受影響）。`check-docs.test.ts` 的凍結案例加了這一種（表上的國語那份不在）。

### P3 Capture 待決問題仍顯示舊規格名稱（延續 R7）

同意。第一輪的替換只改到第一個（第 7 行的入口），第 19 行漏了；兩處都改成「轉錄稿格式」，Capture backlog 已沒有 `syntax.md §1`。
