# 工作流程上線：L2 獨立審查（給 Codex）

狀態：待審｜下一步：第三輪由 Fable 5.2（high）子代理審，通過就不再請 Codex｜等誰：Claude

遵守 repo 根目錄的 `AGENTS.md`。由 Claude 用 `node tools/codex.ts l2` 送出，新的 session。

[任務說明](workflow-impl.md)由 Claude（Opus 5.5）實作：D-214、D-215、D-217 的工具、檢查與文件（D-216 這次不做）。改到 pre-commit 的共用檢查、文件檢查與 CI 跑的 `npm run check`，屬於高風險（[quality.md〈高風險範圍〉](../agents/quality.md#高風險範圍要做-l2)）。開工前的規格查核在 [workflow-impl-plan-review.md](workflow-impl-plan-review.md)。

## 審查對象

- worktree 的分支 `claude/workflow-impl-68afda`，從 `main` 的 `8a03736` 開出，`main` 之後沒有前進（2026-11-21 `git fetch` 過）。commit（由舊到新）：
  - `64b781c`、`f6614c1` 規格與開工前查核（只有文件）
  - `6b16b47` `section` 工具（D-215 第 6 點）
  - `6a1b2b6` 決策查詢工具搬進 `tools/`、索引由條目產生、預設只印一層（D-214 第 5、8、9、10 點）
  - `4a3cfc2` 四份 backlog 與兩份 roadmap 分區、現有狀態板整理成入口的狀態行、凍結清單
  - `9e2b6d6` 狀態行解析、`roadmap-sync`、文件檢查與白板讀新格式，接進 pre-commit、pre-merge-commit 與 `npm run check`
  - 這份請求所在的 commit：工作流程規範的連結、quality.md、兩個 skill、`AGENTS.md`、技術債表一列、任務說明的〈結果〉
- 審查對象的最後一個 commit 是這份請求所在的 commit（`git log -1 --format=%H -- docs/tasks/workflow-impl-review.md`）；之後分支上有新的 commit，就是修正或再審，不在這一輪。沒有未提交的修改要審。
- 看全部：`git diff 8a03736 <這份請求的 commit>`。`4a3cfc2` 是一次性的搬移（腳本沒進 repo），看內容先用 `git show --stat 4a3cfc2`；backlog 的差異大多是標題降一級。

## 規格與優先順序

- 主要規格：任務說明的〈範圍〉1～12、〈驗收〉1～11、〈待使用者決定〉Q1、Q2（都已定）。
- 依據：D-214、D-215、D-217（查法 `node tools/decisions-index.ts D-xxx`，`--deep` 全印）；背景見 [plans/workflow.md](../plans/workflow.md)。新的規範寫在 [工作流程規範](../agents/workflow.md)。
- 規格之間、規格和決定之間衝突或有漏洞時列成問題，不挑容易通過的那份。

## 行為與風險

公開介面與呼叫端：

- `tools/status-line.ts`：`parseStatus`、`looksNew`。呼叫端：文件檢查、`roadmap-sync`、白板。
- `tools/roadmap-sync.ts`：CLI（不帶參數寫工作樹、`--check`、`--check --staged`、`--root`）與 `moveText`、`checkNewDone`。呼叫端：`tools/hooks.ts` 的 `SHARED_CHECKS`（pre-commit 與 pre-merge-commit 都跑）、`tools` 的 `npm run check`（CI 的 shared job）。
- `tools/check-docs.ts`：新格式的狀態行（凍結清單 `tools/legacy-status-docs.json` 以外一律照新格式查）、清單裡的檔要在、backlog 與 roadmap 的分區、「來自」與「→」兩邊對得上、`downstreamOf`（白板的「現在在哪」）。呼叫端：hook、CI、`progress-board.ts`、`roadmap-board.ts`。
- `tools/roadmap-board.ts`：合併兩份〈已完成〉、正式 vault 的版本取較新的、工具產生的「已合併」列算待發布、「最近定案」。呼叫端：`progress-board.yml`（Pages）、hook 的 `--check --staged`。
- `tools/decisions.ts`、`tools/decisions-index.ts`：分界 `BOUNDARY`、索引由條目產生、反推的後續見與已取代、預設一層、`--deep`、「現行寫在」；`experiments/tools/decisions-index.mjs` 轉呼叫。
- `tools/section.ts`。
- 文件：四份 backlog、兩份 roadmap、改成新狀態行的入口（原狀態行與原狀態板的字搬進入口）、封存的〈已完成〉、三份 card-rules（狀態行加在引用框之前、引用框的「狀態：」改「版本：」）、新的 `plugins/cards/docs/plans/entry-and-catalog.md`。

不可破壞的性質：

1. 每個 commit 之後 hook、CI 與 Pages 都能跑；別的 session 在舊分支上只改舊格式的文件，合併後照樣過得了（凍結清單裡的檔不用改）。
2. `roadmap-sync`：冪等；`--check` 不寫檔；`--staged` 只讀暫存區與 HEAD，不混讀工作樹；工具寫出的 roadmap 過得了文件檢查與白板。
3. 舊連結不壞：backlog 與 roadmap 的舊錨點都還在；三份 card-rules 的 AI 標記以下逐字相同（D-151，嵌入規則的雜湊不變）。
4. 決策紀錄和工具產生的一模一樣；純舊資料的 `--deep` 和舊工具逐字相同。
5. 沒有改到使用者筆記的格式與 Cards 的產品程式（`git diff --stat 8a03736 -- plugins/cards/src` 是空的）。

請找新的組合，例如：入口改名或搬家時狀態板那一列；同一個入口同時在兩份 roadmap；狀態行在引用框或程式碼區塊裡；rebase、squash 後的完成日期；上線前開的分支在上線後加手寫的〈已完成〉列（`ROLLOUT`）；CRLF 的檔；路徑有空白、中文、百分比編碼；「→」寫在引用框、表格或程式碼裡；從 backlog 出發的錨點有標點；鏈裡有循環或拆成好幾站；pre-merge-commit 讀合併的索引時的 `--staged`；凍結清單裡的檔改成新格式之後。

明確延後的範圍：D-216（給其他專案的初始架構）；技術債表的「補做：查詢工具的現行寫在只算有連結的引用」；驗收第 11 項（合併後 Pages 的 run）。

## 驗證方式

- 環境：Windows 11、Git 2.52.0、Node 24.13.0；CI 是 GitHub Actions 的 Ubuntu、Node 24（`check.yml` 用 `fetch-depth: 0`）。
- 指令：`npm --prefix tools run check`；`npm --prefix tools run self-check`；`node tools/roadmap-sync.ts --check`；`node tools/check-docs.ts`；`node tools/decisions-index.ts D-117`（加 `--deep` 比較）；`node tools/roadmap-board.ts --out <暫存資料夾>/roadmap.html`。
- 實作者跑過的：任務說明的〈結果〉。
- 平台事實：GitHub 的標題錨點照 github-slugger（降級的標題錨點不變靠這一點）；日期用台北時間；`progress-board.yml` 的 Pages 只讀〈已完成〉的表，不需要 Git 歷史。

## 實作者自己選的做法

規格沒寫、由 Claude 決定的地方，請先看：

1. `BOUNDARY = 218` 寫成 `tools/decisions.ts` 的常數；`origin/main` 的最大號是 D-217（2026-11-21）。合併前再看一次。
2. `ROLLOUT`（`tools/roadmap-sync.ts`）：暫存區新加、HEAD 沒有、日期不早於這天的〈已完成〉列要是工具的格式；更早日期的手寫列放行（上線前開的分支）。合併那天改成合併的日期。
3. 凍結清單裡的檔，狀態行「看起來是新格式」（`looksNew`）時也照新格式嚴格查：清單裡的檔改成新格式後就受檢查。
4. `downstreamOf` 的「最下游」：從起點走得到、和起點不在同一個循環、走不出自己所在循環的站；循環有好幾站時只列從循環外走進來的那幾站。決定的「來自」只把「來自」那一段的 D-ID 算成邊，「修改」「補充」不算（那是後續見，由查詢工具列）。
5. 「最近定案」裡分界之前的決定沒有「現在在哪」（它們沒有「來自」）；「一句話」用 markdown-it 的行內渲染（反引號變 `<code>`）。「現在在哪」的狀態值讀不出來時印「—」。
6. 入口原本的狀態行寫成「原狀態行（2026-11-21 前）：…」、原本在狀態板的字寫成「原狀態板（2026-11-21 前）：」一個清單，連結照入口的位置改寫。
7. 封存的〈已完成〉：除了規格說的五列只有決定的，另把九列放錯表（在 10-27 快照的表裡）的照日期搬進〈已完成〉。
8. 白板的 `headline()`（標題取第一個「：」或「，」之前）沒改，所以「正式 vault 升到 `0.6.0`（tag `v0.6.0`，…」顯示成括號沒閉合的標題；這是原本就有的行為，記成後續。
9. hook 的測試自己建 repo 時，真的複製 `decisions.ts`、`status-line.ts`（文件檢查 import 它們），`roadmap-sync.ts` 在沒有 roadmap 的測試裡換成替身。

## 回報與權限

只審查，不改 repo 裡追蹤的檔案；要寫檔才能重現時，暫存檔放在系統的暫存資料夾，結束前刪掉。每項發現寫觸發條件、預期／實際、影響、位置與證據，並區分「已重現」「靜態推斷」「待驗證」；另標真實路徑會不會發生，會發生的寫發生機率。可以回報「規格本身有漏洞」。報告頭尾寫待審 commit、審查範圍、測試結果與沒驗的項目及原因。格式照 code-quality 的 `review.md`〈回報格式〉。

## 第一輪的回報

Codex（gpt-6.2-sol、high）2026-11-21 交回，審 `64896c0`；235,150 token，交回時週額度剩 3%。

### Codex 回報（原文）

狀態：待修

**建議先修正 P2 再合併。** 正常收尾會被白板測試擋下。我也用真正的 pre-commit 重現另一條路徑：入口已結案，手動刪除狀態板的列卻能提交，〈已完成〉沒有留下紀錄。

待審 commit 為 `64896c05416e812f6504bd88e86d0134ce8d9cf8`，分支 `claude/workflow-impl-68afda`，基準 `8a03736`。審查涵蓋 D-214、D-215、D-217、任務說明的範圍與驗收、Q1／Q2，以及文件遷移、公開工具、hook、CI 與 Pages 的接線。原工作樹乾淨，重現用的暫存檔與 clone 均已清除。

#### 發現

##### P2 R1　最上層最後一件工作正常收尾時，commit 被擋

**規範與設計｜已重現。** 把現有唯一一列「工作流程優化」的入口改為已合併，依規格執行同步並 stage。工具正確產生〈已完成〉列，`roadmap-sync --check --staged`、文件檢查和白板檢查都通過。真正的 `git commit` 仍回傳 1，因為相關測試要求 `parseTopWorks(read(ROADMAP)).length >= 1`。最上層可以暫時沒有跨外掛工作，這個舊斷言把合法的空表當成失敗。

**真實路徑與機率**　本批收尾時若仍只有這一列，必現。**建議合併前修**，用空表測試確認同步、白板與 hook 都接受最後一列搬走後的結果。`docs/roadmap.md:17`、`docs/tasks/workflow-impl.md:97`、`tools/tests/roadmap-board.test.ts:38`、`tools/dispatch.ts:228`

##### P2 R2　完成紀錄檢查會放過漏列與重複，也會阻擋歷史連結修正

**規格｜已重現｜延續開工前 4-4、6-1。** D-217 要求已掛板的工作結案時，原列搬到〈已完成〉，日期取收尾 commit。暫存 clone 中，我把 Cards 的「國小社會預設」入口改為已合併，同時手動刪除它的狀態板列。真正的 pre-commit 回傳 0，包含 Cards 的相關測試。提交後入口已合併，其他進行中工作仍在，〈已完成〉沒有該項紀錄。

另在暫存區測了兩個變體：

- 工具會產生 `2026-12-05` 的完成列。把原列拿掉，手寫兩筆日期為 `2026-12-01`、工作名稱改過、完成句相同的列，`--check --staged` 仍回傳 0。
- 已有完成紀錄的入口重新開工並改名，只更新舊完成列的入口連結。文件檢查通過，同步檢查卻把這列視為新增，要求目前仍為「已合併」或「已結案」。

**真實路徑與機率**　手動整理、解合併衝突時可能漏搬或重複，機率中。重新開工與改名同批發生較少。**建議合併前修**，以 HEAD 的入口和本次狀態轉換核對搬列、日期及唯一性，並加測歷史連結修正。`docs/decisions.md:6329`、`docs/tasks/workflow-impl.md:98`、`tools/roadmap-sync.ts:187`、`tools/roadmap-sync.ts:258`、`tools/roadmap-sync.ts:323`

##### P2 R3　`ROLLOUT` 以列上日期判斷舊分支，會擋住相容操作

**規格漏洞｜已重現。** 從同步檢查接線前的 `4a3cfc2` 開分支，用舊版 hook 提交日期為 `2026-11-24` 的手寫完成列，提交成功。無衝突地合入待審版本時，真正的 `pre-merge-commit` 回傳 1，指出該列不是工具格式。反向測試中，在新版暫存區手寫 `2026-11-21` 的完成列即通過。合併日期會改變切點，分支是不是上線前開的仍然無法由列上日期判斷。

**真實路徑與機率**　上線過渡期內，仍用舊 hook 的分支若在切點當天或之後結案，必現。**建議合併前修**，明訂舊分支的相容條件與遷移步驟，並以真正的合併索引重測兩側。`docs/tasks/workflow-impl-review.md:41`、`docs/tasks/workflow-impl-review.md:63`、`tools/roadmap-sync.ts:17`、`tools/roadmap-sync.ts:258`

##### P2 R4　同步會把合法的 Markdown 連結改壞

**規格｜已重現｜延續開工前 4-3。** 在待審版本的暫存 clone 中，入口的下一步使用 `[索引](../決策%23索引.md)`，目標檔確實存在，文件檢查回傳 0。同步輸出 `[索引](決策#索引.md)`，文件檢查改回傳 1，因為 `#` 已成為錨點分隔符。同一改寫函式也用於觸發點及完成句。

另用公開函式重現，入口格只放行內程式碼 `` `[入口](tasks/a.md)` `` 時也會被當成有效入口。`moveText` 也會改寫行內程式碼裡的連結範例，改變原本要顯示的文字。

**真實路徑與機率**　檔名有編碼保留字元或狀態文字引用 Markdown 範例時會發生，平常機率低，符合條件即重現。**建議合併前修**，按 Markdown 的連結結構處理，並用同一份同步產物驗證文件檢查和白板。`docs/tasks/workflow-impl.md:100`、`tools/roadmap-sync.ts:43`、`tools/roadmap-sync.ts:75`、`tools/roadmap-sync.ts:94`

##### P2 R5　同一入口掛兩份 roadmap，會產生兩筆完成紀錄

**規格漏洞｜已重現。** 同一任務透過不同的相對路徑掛在最上層及 Cards 兩份 roadmap。暫存區同步、文件檢查和白板都通過。入口改成已合併後，工具在兩份 roadmap 各寫一筆完成紀錄，暫存區檢查仍通過。重複檢查的範圍只有當前檔案，白板會彙整兩筆。Q1 規定各份 roadmap 就地搬列，需要補上跨份入口歸屬與唯一性的規則。

**真實路徑與機率**　跨外掛工作或移交歸屬時可能同時掛板，機率低至中。**建議合併前修**，保留 Q1 的就地搬列，跨 roadmap 檢查同一入口的重複列。`docs/decisions.md:6199`、`docs/tasks/workflow-impl.md:91`、`docs/tasks/workflow-impl.md:101`、`tools/roadmap-sync.ts:178`、`tools/roadmap-sync.ts:323`、`tools/roadmap-board.ts:175`

##### P2 R6　backlog 的父子項目可互相代替回鏈，白板也會丟掉錨點

**規格｜已重現｜延續開工前 3-3、6-3。** 任務的 `→` 指到 backlog 的 `#父項`，只有下面的 `#子項` 寫了「來自」連回任務。預期缺少父項回鏈時應擋下。實際文件檢查回傳 0，`downstreamOf` 把父、子各列為一個最下游，白板顯示兩個完全相同的 backlog 檔案網址。另一例的標題「詞（甲）、A+B」正確算出 `#詞甲ab`，白板仍只連到檔案首頁。

**真實路徑與機率**　工作退回 backlog 或項目有多層時會碰到，機率低至中。**建議合併前修**，用同一個「檔案＋錨點」識別站點、核對回鏈與產生白板連結。`docs/tasks/workflow-impl.md:73`、`docs/tasks/workflow-impl.md:78`、`tools/check-docs.ts:394`、`tools/check-docs.ts:484`、`tools/check-docs.ts:538`、`tools/roadmap-board.ts:223`

##### P2 R7　重複的「來自」段會漏算決定的下游

**規格｜已重現。** 新決定 D-219 的狀態行使用 `來自 [任務](tasks/other.md)｜來自 D-218`。規格允許段落重複，文件檢查通過，決策查詢也認得 D-218 是上游。`downstreamOf` 從 D-218 卻回傳空清單，因為只從第一個「來自」段找 D-ID。結果是查詢能找到後續，白板的「現在在哪」漏掉同一條鏈。

**真實路徑與機率**　從任務與既有決定合併出新決定、並分成兩段時會發生。機率低，符合條件即重現。**建議合併前修**，由決策解析器提供所有「來自」邊，加測 D-218 到 D-219 再到下游文件的鏈。`docs/tasks/workflow-impl.md:127`、`tools/decisions.ts:122`、`tools/check-docs.ts:544`

##### P2 R8　白板版本與待發布清單可能用到不同的發版紀錄

**規格｜已重現｜延續開工前 4-5。** 版本說明是 `0.7.0`、日期 `2026-12-05`，完成表的最後一次升版是 `0.6.0`、日期 `2026-12-03`。白板正確顯示 `0.7.0`，但仍把 `2026-12-04` 的合併列作為待發布。另一例只在一般工作的完成句寫「完成相容測試，等正式 vault 升到 `0.7.0` 再公開」，白板就誤把這列當成已經升版。

**真實路徑與機率**　手動補記正式 vault 版本，或在完成句提到計畫中的版本時會發生，機率低至中。**建議合併前修**，以實際選中的最新升版作為兩欄共同依據，並依規格辨識發版任務完成句的開頭。`docs/tasks/workflow-impl.md:108`、`tools/roadmap-board.ts:134`、`tools/roadmap-board.ts:182`

##### P3 R9　兩種箭頭都能以無效的下一站通過檢查

**規格｜已重現。** `parseStatus('狀態：已結案 → 先別做｜完成：已停｜等誰：—')` 成功，規格要求箭頭後是 D-ID 或連結。另在一般段落寫格式與日期都正確的 `→ [外連](https://example.invalid/example)（2026-12-05）`，文件檢查也通過。這個目的地無法成為 repo 裡可核對「來自」的站，鏈上也沒有這條邊。

**真實路徑與機率**　把備註誤填為下一站，或把外部參考資料誤當下一站時會發生，機率低。**建議補檢查規則**，並保留對引用框、表格與程式碼內範例的忽略行為。`docs/tasks/workflow-impl.md:59`、`docs/tasks/workflow-impl.md:78`、`tools/status-line.ts:38`、`tools/check-docs.ts:419`、`tools/check-docs.ts:464`

##### P3 R10　程式碼區塊的邊界在三個工具上判定不一致

**規格｜已重現。** 用 repo 的 Markdown 解析器作對照：

- 把 `D-218` 放在引用框內的 fenced code block，`currentRefs` 仍列出 `AGENTS.md〈規範〉`。這是程式碼區塊判定問題，與已延後的「只算有連結的引用」不同。
- 在 `decisions.md` 使用合法的兩空格縮排 fence，裡面的 `## D-219 範例` 被 `parseDecisions` 認成第二個正式條目。
- 一行以三個反引號開頭，但資訊欄本身又含反引號，Markdown 解析器把它當一般文字。`section` 把它當 fence，漏掉下一行的 `## 真標題`。

**真實路徑與機率**　文件使用引用框、巢狀或縮排範例時會碰到，機率低。**建議補回歸測試**，讓工具與 repo 的 Markdown 區塊語意一致，涵蓋尚未關閉的 fence 與非 fence 的反引號文字。`docs/tasks/workflow-impl.md:133`、`docs/tasks/workflow-impl.md:139`、`tools/decisions.ts:88`、`tools/decisions.ts:301`、`tools/section.ts:26`

##### P3 R11　純舊資料的 `--deep` 輸出和舊工具差八個字元

**規格｜已重現。** 使用實際的 D-117 比對。舊工具輸出 50,100 個 JavaScript UTF-16 字元，新 `--deep` 輸出 50,108，預設輸出 6,505。拿掉新輸出開頭的 `（--deep）` 後，兩份全文完全相同。規格和驗收都要求逐字相同，現有測試反而要求出現這段新前綴。

**真實路徑與機率**　查純舊決定並使用 `--deep` 時必現。人工閱讀影響小，逐字比較一定失敗。**建議恢復舊輸出並加入對照測試**。`docs/tasks/workflow-impl.md:132`、`docs/tasks/workflow-impl.md:194`、`tools/decisions.ts:344`、`tools/tests/decisions-index.test.ts:81`

##### P3 R12　遷移後有三處文件指示與實際內容不符

**規格｜靜態核對。** Cards〈等觸發點〉的列名仍是「AI 製卡最小版」，而任務規格與開工前回應指定「AI 製卡最小版：Claude 網頁補試」。最上層 backlog 的轉址段說技術債及已知限制在「下面兩節」，分區後兩節都在上方。工作流程規範說 2026-11-21 以前的完成項目在封存，但 Cards 的現行 roadmap 仍保有 11-20 和 11-18 的完成紀錄，符合本次保留歷史列的做法。

**真實路徑與機率**　這三處已在待審版本中，讀到對應段落就會遇到。**建議合併前修正列名和指引**，其中 backlog 可直接連到原有錨點。`docs/tasks/workflow-impl.md:163`、`plugins/cards/docs/roadmap.md:35`、`docs/backlog.md:55`、`docs/agents/workflow.md:95`、`plugins/cards/docs/roadmap.md:64`

#### 驗證結果

- **共用檢查與產生頁面**　Windows 11、Git `2.52.0.windows.1`、Node `24.13.0`。七個待審 commit 都分別在暫存 clone 跑過 `npm.cmd --prefix tools run check`，也都成功產生進度畫板和白板。待審 HEAD 的 `roadmap-sync`、`check-docs`、`roadmap-board` 暫存區檢查通過，文件檢查讀到 392 份 Markdown、8,060 個連結。
- **測試**　`self-check` 的型別、ESLint、knip 通過。原工作樹的測試為 198 通過、2 失敗、1 跳過。兩項失敗都停在 Git 的 `dubious ownership` 檢查，移到隔離 clone 重跑後兩項都通過。跳過的是 Windows 檔名含換行的案例。Cards 的 `ai-rules.test.ts` 為 5 項通過。
- **遷移與相容**　四份 backlog、兩份 roadmap 共 59 個舊標題錨點均保留。兩份技術債表原有列均保留，只有最上層多規格指定的一列。三份 card-rules 的 AI 標記以下逐位元組相同，Cards 產品程式、筆記語法與轉錄稿格式無 diff。實際決策索引重產後逐位元組相同。舊分支只修改凍結清單內的舊文件正文時，真正的合併 hook 放行。
- **邊界與手機版**　驗到 staged 與工作樹內容相反時以 staged 為準。CRLF 同步後保留，第二次執行冪等。Git 歷史中的 `2026-11-22 18:30 −05:00` 正確轉成台北 `2026-11-23`，已寫入的完成日期在 rebase 與 squash 後保留。嚴格狀態行拒絕引用框及縮排程式碼，凍結檔改成新格式後會查欄位。Chrome 手機模擬 `375×812` 的 `clientWidth` 與 `scrollWidth` 均為 375，超出右緣的元素為 0，「最近完成」與「最近定案」分成兩個區塊。

本報告限 `64896c05416e812f6504bd88e86d0134ce8d9cf8`。Git 工作樹與暫存區最後仍乾淨。

**待驗證**　GitHub Actions 的 Ubuntu 實跑、合併後 Pages 發布與驗收第 11 項的單檔觸發，以及合併前向使用者展示白板。這輪驗到本機產物與代表性的真實 hook，尚未逐個重播七個歷史 commit 的完整 hook 與外掛 CI。D-216 和「現行寫在只算有連結的引用」依任務明列延後。

### Claude 回應

逐項核對：讀程式與文件確認十二項都是真的；修之前每項先寫成會失敗的測試（R12 是文件，直接核對）。全部合併前修（照 code-quality `review.md`〈修正後收尾〉先分類；沒有可以記成已知限制的：R4、R10 機率低，但發生時會默默改壞連結或漏算，修法都是收窄，不加機制）。

| 發現 | 分類 | 修法 | 動到什麼 |
|---|---|---|---|
| R1 最後一列收尾被擋 | 一定修（本任務收尾就會碰到） | 測試改成「讀得出來」，空的狀態板合法；加 `roadmap-sync` 測試：最後一列搬走後，同步、文件檢查、白板都接受 | 只有測試 |
| R2 漏列、重複、歷史連結 | 一定修（漏搬會默默少一筆紀錄） | 收窄：〈已完成〉的列以「日期＋拿掉連結目標的文字」比對 HEAD，只改連結的舊列算舊列；新列一份入口最多一列、HEAD 的狀態板或〈等觸發點〉有這份入口時工作名稱要相同、日期要等於工具算的（合併時只要不晚於今天）；HEAD 的工具列不見了而入口已結束，就要有新的完成列 | `roadmap-sync.ts` 的完成列檢查與測試 |
| R3 `ROLLOUT` | 規格漏洞 | 收窄：拿掉 `ROLLOUT`，HEAD 沒有的列一律照 R2 查；上線前開的分支合併時，手寫的完成列照錯誤訊息改成入口的已合併再同步（寫進工作流程規範） | 同上；工作流程規範一句 |
| R4 連結改壞 | 修（發生時默默改壞） | 收窄：連結路徑不解碼、照原本的編碼改基準；行內程式碼裡的連結不改、入口一格不算 | `roadmap-sync.ts` 的 `moveText`、入口解析與測試 |
| R5 兩份 roadmap 同一入口 | 修 | 收窄：同一份入口只能在一份 roadmap 的狀態板或〈等觸發點〉，跨檔重複報錯 | `roadmap-sync.ts` 的 `syncAll` 與測試 |
| R6 backlog 父子項 | 修 | 收窄：從 backlog 出發或到 backlog 的站，「來自」要在那個錨點自己的標題底下（最近的標題），子項不算；白板的連結帶錨點 | `check-docs.ts`、`roadmap-board.ts` 與測試 |
| R7 重複的「來自」段 | 修 | 改用唯一來源：決策解析器記下所有「來自」段的 D-ID，`downstreamOf` 讀它 | `decisions.ts`、`check-docs.ts` 與測試 |
| R8 版本與待發布 | 修 | 待發布以選中的那一次升版切；「正式 vault 升到」只在完成那一句開頭才算 | `roadmap-board.ts` 與測試 |
| R9 無效的下一站 | 修 | 收窄：「已結案 →」後面要是 D-ID 或連結；「→」連到外部網址報錯 | `status-line.ts`、`check-docs.ts` 與測試 |
| R10 程式碼區塊 | 修（整類） | 改用唯一來源：一個照 CommonMark 判斷圍欄（縮排 0～3、引用框裡、反引號圍欄的資訊欄不能有反引號、沒關到容器結束）的函式，三個工具共用；回歸測試列舉這幾種 | `decisions.ts`、`section.ts` 與測試 |
| R11 `--deep` 多八字 | 一定修（違反規格的逐字相同） | 拿掉「（--deep）」，測試改成和舊工具的開頭相同 | `decisions.ts` 與測試；〈結果〉的字數 |
| R12 三處文件 | 修 | 列名改成「AI 製卡最小版：Claude 網頁補試」；backlog 那句改連錨點；工作流程規範改寫封存那句 | 三份文件 |

修正放進下一次 L2，只查這些差異與受影響的路徑（R2、R4、R10 改到解析邊界或共用路徑）。Codex 週額度剩 3%（11/23 週一 08:37 重置），下一輪送出前先看額度。

## 第二輪的請求

只審第一輪 12 項的修正與受影響的路徑；〈規格與優先順序〉〈回報與權限〉照上面。

審查者：Codex 週額度剩 3%（11/23 08:37 重置），這一輪改由 Claude 開的 Fable 5.2（high）子代理審：新的上下文、只讀這份請求與 repo，不給實作者的結論。它是整合者開的子代理，照 [quality.md](../agents/quality.md) 算 L3。使用者 2026-11-21：Fable 審通過就不再請 Codex；沒通過時修完再審。

- 審查對象：第一輪審的 `64896c0` 之後、到這份請求所在的 commit。一項發現一個 commit（由舊到新）：R11 `918e387`、R10 `c4c0c38`、R8 `b24ebd0`、R9 `b093894`、R4 `286e4bb`、R7 `54f83ae`、R6 `5c36adb`、R2／R3／R5 `398e1a8`、R1 `83eb796`、R12 `7731f42`。看全部：`git diff 64896c0 <這份請求的 commit>`；看一項：`git show <commit>`。
- 每一項對照〈Claude 回應〉的修法：修到了沒有、有沒有帶進新問題。R2、R4、R10 改到解析邊界或共用路徑，也請看呼叫端：
  - R2、R3、R5：`roadmap-sync.ts` 的 `checkDone`（取代 `checkNewDone`，各份 roadmap 一起看），在 pre-commit 與 pre-merge-commit 的 `roadmap-sync --check --staged` 跑；`Source` 多了 `merging()`（有沒有 `MERGE_HEAD`）。
  - R4：`moveText`、入口一格的解析、工具寫的〈已完成〉列。
  - R10：`tools/fences.ts` 給 `decisions.ts`（解析、索引、`currentRefs`）與 `section.ts` 用；`check-docs.ts` 照舊用 markdown-it。
- 請找新的組合，例如：合併時兩邊各加一筆完成列；解衝突時把列的順序換掉；重新開工又結束（同一個入口第二筆完成列）；入口改名同時結束；同一天升兩次版；清單裡、引用框裡巢狀的圍欄；檔名有 `%`、`#`、`?` 的入口。

實作者自己選的做法（規格沒寫的）：

1. R2：舊列的比對鍵是「日期＋拿掉連結目標的文字」；舊的列改了文字就是新的列，照新列查（〈已完成〉整個由工具產生，手改擋下）。
2. R2：合併時（有 `MERGE_HEAD`）新列的日期只要不晚於今天；不是合併時要等於工具算的收尾日。
3. R2：「HEAD 的狀態板或〈等觸發點〉有列、現在每份都沒有、入口已結束」才要新列；入口檔已經不在（改名）不要。同一個入口、和舊列同一天的新列算重複。
4. R5：同一份入口跨 roadmap 有兩列時，報在順序後面的那份（最上層先，外掛照路徑）。
5. R6：連到 backlog、沒有錨點的「→」照舊看整份；白板的 backlog 站顯示 `檔〈標題〉`，狀態寫「—」。
6. R8：同一天時，同一版照列的位置切；不同版以那句為準，照那句的日期切。
7. R10：清單裡縮排四格以上的圍欄也算，所以不在清單裡、縮排四格以上的「```」也當成圍欄（寧可少列標題）；縮排程式碼區塊本身不認。和 markdown-it 比對 11 個樣本。
8. R4：入口路徑本身要編碼的字只有 `%`、`#`、`?`；入口連結的百分比編碼壞掉時報錯。

驗證方式：每個修正的 commit 都過了 pre-commit（共用檢查讀暫存區；tools 的 self-check：typecheck、lint、knip 與全部測試）。每項先寫會失敗的測試（R12 是文件，直接核對），測試名稱以「L2 R<編號>」開頭。真的 repo：`node tools/roadmap-sync.ts --check`、`node tools/check-docs.ts`、`node tools/roadmap-board.ts --check` 通過；白板照真的 roadmap 重新產生，最上層 5 件進行中、待發布 2 列、正式 vault 0.6.0。沒驗的：GitHub Pages 的 run（驗收第 11 項，合併後）。

## 第二輪的回報

Fable 5.2（high）子代理 2026-11-21 09:04～09:20 交回，審 `3cd78c1`；輸出 80,558 token。

### Fable 回報（原文）

狀態：待修

第一輪的 12 項裡 9 項修到了、3 項部分修到；但 R2／R3 的新檢查帶進三個 P2：真的 `git merge` 跑 pre-merge-commit 時還沒有 `MERGE_HEAD`，「合併時放寬日期」在最主要的路徑不生效；上線這次合併（與上線前開的分支）會被「入口已結束卻沒有新列」擋下；舊的完成列被刪掉沒有人擋。建議修完這三項再合併。

- **待審 commit**：`3cd78c1e5f5be485d13236f367270bb4ccab8d20`，分支 `claude/workflow-impl-68afda`。
- **審查範圍**：`git diff 64896c0 3cd78c1`（10 個修正 commit 與文件）與受影響的呼叫端：`roadmap-sync.ts` 的 `checkDone`／`moveText`／`entryOf`、`fences.ts` 的三個使用者、`check-docs.ts` 的站點核對與 `downstreamOf`、`roadmap-board.ts` 的 `parseRelease`／`recentDecisions`、`status-line.ts`。
- **環境**：Windows 11、Git for Windows 2.52、Node 24.13.0。重現都在系統暫存資料夾的 clone 與 `mkdtemp` 的小 repo，結束前已刪；worktree 的 `git status` 乾淨、HEAD 仍是 `3cd78c1`。

#### 跑了什麼

| 指令 | 結果 |
|---|---|
| `tools/` 裡一次一個檔：`fences`、`status-line`、`section`、`decisions-index`、`roadmap-board`、`roadmap-sync`、`check-docs` | 2、4、3、11、20、10、24 個測試全過，0 失敗、0 跳過 |
| `node tools/roadmap-sync.ts --check` | 通過 |
| `node tools/check-docs.ts` | 通過（392 個 Markdown、8,064 個連結） |
| `node tools/roadmap-board.ts --check` | 通過 |
| 舊工具（`6b16b47` 的 `decisions-index.mjs`）對新的 `--deep`：`D-117`、`D-005 D-214` | 兩組 `cmp` 逐位元組相同（107,069、79,763 bytes） |
| 392 份追蹤的 Markdown：`fences.ts` 對 markdown-it 的圍欄行與標題 | 0 份不同 |
| 在 clone 模擬本任務收尾（入口改已合併 → 同步 → stage） | 最上層狀態板變空表；`roadmap-sync --check --staged`、`checkDocs`（0 個問題）、`roadmap-board --check --staged` 都通過 |

#### 發現

##### P2 N1　真的合併跑 pre-merge-commit 時沒有 `MERGE_HEAD`，跨日的合併一律被擋（R2／R3 修正引入）

**規格與設計｜已重現。**

- **觸發條件**：暫存 repo 掛真的 `pre-merge-commit`，`side` 分支在 11-22 收尾一件工作，11-25 在 `main` 跑 `git merge --no-ff side`（無衝突）。
- **預期**：照做法 2，合併時新列的日期只要不晚於今天。
- **實際**：hook 裡 `git rev-parse -q --verify MERGE_HEAD` 是空的，`merging()` 回傳 false，報「日期要是 2026-11-25（入口收尾的那天）」，合併停下。hook 失敗後 Git 才寫 `MERGE_HEAD`；接著 `git commit` 走 pre-commit，原封不動就通過。
- **影響**：
  - 訊息叫人把日期改成今天，照做就改掉另一邊真正的收尾日。
  - 改用 `git commit` 收尾會繞過 `preMergeCommit` 的 CI 綠燈檢查。
- **真實路徑**：會發生，機率高。把 `main` 併進功能分支（歷史有 `d9357be`、`2415568`）或把分支併進 `main`，只要另一邊在前幾天收尾過任何一件工作就必現；同一天的合併不受影響。
- **位置與證據**：
  - `tools/roadmap-sync.ts:427`（`merging`）、`:375`。
  - `tools/hooks.ts:173` 自己寫著這個平台事實：「這個 hook 執行時還沒有 MERGE_HEAD；2026-11-12 在 Git for Windows 實測」，`mergeHeads()` 改讀 `GITHEAD_<sha>`。
  - `tools/tests/roadmap-sync.test.ts:270` 的測試用 `git merge --no-commit`，那時 `MERGE_HEAD` 已經寫好，和真的 hook 不是同一份契約。
- **建議**：合併前修。`merging()` 和 `mergeHeads()` 用同一個來源（`GITHEAD_*` 或 `MERGE_HEAD`），測試改成掛 hook 的真合併。

##### P2 N2　上線這次合併與上線前開的分支，被「入口已結束卻沒有新列」擋下（R2 修正引入）

**規格漏洞｜已重現。**

- **觸發條件**：clone 裡在 `8a03736` 上加一個無關的 commit 當 HEAD，`git merge --no-ff --no-commit 3cd78c1`，跑 `roadmap-sync --check --staged`。
- **實際**：exit 1，「`docs/roadmap.md:37` 入口 docs/plans/workflow.md 已結束、HEAD 的狀態板或〈等觸發點〉有它，〈已完成〉卻沒有新的一列：把那一列加回來…」。
- **原因**：`8a03736` 的最上層狀態板「工作流程優化」那一列入口是 `[主文](plans/workflow.md)`；`4a3cfc2` 把這一列的入口換成任務說明、plans 改成「已結案 → …」。新規則只看入口路徑，不看同名的列還在。這條規則和 N1 無關，修了 N1 仍會擋。
- **影響**：commit 被擋；照訊息把列加回來再同步，會多出一筆「plans/workflow.md 已結案」的完成列。違反不可破壞的性質 1。
- **真實路徑**：會發生的兩條：
  - `main` 在合併前有新 commit、又在本機用非快轉合併。快轉與 GitHub 上合併 PR 不經過 hook，照過去 PR #16～#28 的習慣機率低。
  - 11-19 之後、上線之前從 `main` 開的分支，之後把 `main` 併進來，必現。現有分支裡帶這一列的只有幾個，機率低到中。
- **位置**：`tools/roadmap-sync.ts:386-394`。
- **建議**：合併前修，或至少在合併步驟寫明走 PR、或先把 `main` 併進分支再快轉。修法可以收窄：同名的工作還在狀態板或〈等觸發點〉（只是換入口）時不要求新列，或 HEAD 的 roadmap 還是上線前的格式（沒有〈等觸發點〉）時不套這條。

##### P2 N3　舊的完成列被刪掉不會擋（延續 R2：漏列）

**規格｜已重現。**

- **觸發條件一**：HEAD 的〈已完成〉有一筆工具列與一筆手寫列，暫存區把兩列都刪掉，`--check --staged` 回傳 0。
- **觸發條件二**：兩邊各在〈已完成〉最上面加一列（必然衝突），解衝突時只留對方那一列、丟掉 HEAD 自己的，回傳 0；反過來丟掉對方的會被擋。
- **預期**：`docs/agents/workflow.md:95`「舊的列只能改連結的目標」、任務說明〈5〉「已有的列不動」。
- **實際**：`checkDone` 用 `left` 記 HEAD 每個鍵的數量，迴圈結束後沒有檢查剩下的（`tools/roadmap-sync.ts:347-358`）。
- **影響**：完成紀錄默默少一筆；那份入口已不在 HEAD 的狀態板，第三條規則也抓不到。
- **真實路徑**：會發生。兩個分支在同一份 roadmap 各收尾一件工作時，〈已完成〉頂端一定衝突；解錯邊的機率低到中，發生時沒有任何訊息。
- **建議**：合併前修（收窄：迴圈後 `left` 還有剩就報「HEAD 的完成列不見了」）。注意和 N2 同一個上線過渡：`4a3cfc2` 從 Cards〈已完成〉搬走 5 列到封存，HEAD 是上線前的 roadmap 時要放行。

##### P3 N4　隔天重播收尾的 commit 被擋在日期（R2／R3 修正引入）

**規格｜已重現。**

- **觸發條件**：11-22 收尾的分支，11-25 用 `git merge --squash` 後 `git commit`，或 cherry-pick 遇到衝突後 `--continue`，都報「日期要是 2026-11-25」。無衝突的 cherry-pick 不跑 pre-commit（hook 執行 0 次）。
- **預期**：任務說明〈5〉（`docs/tasks/workflow-impl.md:98`）「之後 rebase、squash 不回頭改」。
- **真實路徑**：會發生，機率低到中：隔天才 cherry-pick 狀態文件到 `main` 又剛好衝突，或 squash 合併。訊息明確，手改日期就過，但〈已完成〉本來不該手改。
- **建議**：可延後，記進技術債；或和 N1 一起處理（`CHERRY_PICK_HEAD`、`REBASE_HEAD`、squash 比照合併）。

##### P3 N5　同一天結束、重開、再結束，怎麼改都過不了（做法 3）

**規格漏洞｜已重現。**

- **觸發條件**：11-25 收尾並 commit，同一天重開（狀態板手寫一列、commit），同一天再收尾。
- **實際**：照工具寫的新列報「已經有同一天的完成列」；把新列拿掉改報「〈已完成〉卻沒有新的一列」。兩條規則互斥，只能等隔天。
- **真實路徑**：會發生，機率低（合併當天發現問題又照規範重開）。
- **建議**：可延後；同一天的第二筆放行，或訊息寫明怎麼辦。

##### P3 N6　合併時完成列的日期不查格式（做法 2）

**規格與設計｜已重現**（有 `MERGE_HEAD` 時）。對方的列日期寫成 `2026-1-5` 或空的都通過：`row.date > today` 是字串比較（`tools/roadmap-sync.ts:375`），白板與文件檢查也不查這一欄。機率低。建議加一個日期格式與真實日期的檢查，可和 N1 一起做。

##### P3 N7　升版的判斷還有兩個同類的洞（延續 R8）

**規格｜已重現**（`parseRelease`）。

- 工作名稱本身有「：」的發版列（`**發版：0.7.0**：正式 vault 升到 `0.7.0`…`）認不出升版，白板停在 0.6.0，升版前後的列都算待發布。`RELEASE` 只吃到第一個「：」（`tools/roadmap-board.ts:138`）；這個專案的工作名稱常有「：」。
- 舊寫法「升正式版 `x`」沒有錨定：工具寫的列「…等升正式版 `0.7.0` 時再公開（已合併，…）」被當成升版，白板顯示 0.7.0、待發布清空。和 R8 第二個例子同一類，只修了新的那句。
- **真實路徑**：會發生，機率低。建議可延後或順手修：用工具列的 `**工作**：` 結構定位完成句；舊寫法只對沒有「（已合併／已結案，入口）」結尾的手寫列生效。

##### P3 N8　「已結案 →」只查形狀（延續 R9）

`parseStatus` 已重現；文件檢查那一層是靜態推斷。`狀態：已結案 → [外連](https://…)` 與 `已結案 → D-999`（不存在的編號）都通過：`NEXT` 只看是不是 D-ID 或行內連結（`tools/status-line.ts:9-10`），外部連結檢查了「→」行卻沒檢查狀態行，純文字的 D-ID 沒有人核對存在。機率低，可延後。

##### P3 N9　backlog 站點的兩個殘留（延續 R6、做法 5）

**已重現。**

- 「→」的錨點寫大寫（`#AI-製卡`）：連結檢查放行（它會轉小寫再比），站點核對卻報「沒有『來自』連回這裡」，其實有。R6 之前找不到錨點是退回看整份。會擋下，但訊息誤導（`tools/check-docs.ts:486-488`）。
- 「→」連到 backlog 沒帶錨點（做法 5 照舊放行）：`downstreamOf` 回傳 `docs/backlog.md#ai-製卡` 與 `docs/backlog.md#` 兩站，白板同一份 backlog 列兩次。
- 機率低。建議收窄：連到 backlog 的「→」一定要帶錨點（規範本來就說 backlog 的一站是檔＋標題）；比錨點前先轉小寫。

##### P3 N10　圍欄判斷和 CommonMark 還有兩種不同（R10 修正引入、做法 7）

**樣本已重現；真的 repo 392 份都一致。**

- 頂格的圍欄裡，有一行縮排四格以上、後面沒有字的 ```` ``` ````（例如示範「清單裡的程式碼」），被當成收尾（`tools/fences.ts:30` 收尾不限縮排）。結果圍欄裡的 `## …` 被當成真標題、原本的收尾變成新開頭，後面到下一個圍欄都被吃掉。這和做法 7「寧可少列標題」方向相反，舊的 `section.ts` 與舊的 `mask` 在這個形狀反而是對的。
- 清單裡沒關的圍欄，清單結束後仍當成程式碼到檔尾（只追蹤引用框，不追蹤清單）。
- 機率極低。建議記成已知的限制，或收尾的縮排不超過開頭加 3 格。

##### P3 N11　`moveText` 同類的殘留（延續 R4、做法 8）

**已重現**（`moveText`）。帶標題的連結 `[t](../x.md "t")` 不改基準；`/` 開頭的路徑改成錯的相對路徑；`INLINE_LINK` 不認括號（`tools/roadmap-sync.ts:43`）。另外是靜態推斷：檔名有 `#` 的站在 `recentDecisions` 會被第一個 `#` 切錯（`tools/roadmap-board.ts:233`）。多半會被連結檢查擋下而不是默默寫壞；機率極低，記成已知的限制即可。

##### P3 N12　漏記還有兩條走得通的路（做法 3）

**已重現。**

- 先在入口還沒結束時刪掉狀態板的列（通過），下一個 commit 再把入口改成已合併（通過），沒有完成列。
- 入口改名、結束、刪列在同一個 commit，通過。
- 規範寫「狀態板的列不手動刪」，實際只擋「同一個 commit 刪列又結束」。機率低，可延後；第一條可以收窄成 HEAD 有列、現在沒有、入口還在就擋。

##### P3 N13　完成列的核對只在本機 hook 生效

**規格漏洞｜靜態推斷**（無衝突的 cherry-pick 不跑 hook 已重現）。GitHub 上合併 PR、快轉、無衝突的 cherry-pick 與 rebase 都不經過 pre-commit／pre-merge-commit；CI 的 `roadmap-sync --check` 是 HEAD 比自己，`checkDone` 沒有新列可查。上線前開的分支手寫的完成列走 PR 合併就進得來，R3 寫進規範的遷移步驟只在本機合併時才會被提醒。狀態板和入口對不上的檢查在 CI 仍有效。建議記進技術債（CI 的 PR job 拿合併基點當比較對象），不擋這次合併。

#### 實作者自己選的做法

1. **比對鍵是日期＋拿掉連結目標的文字**：合理，和「舊的列只能改連結的目標」一致；但只做了「改」沒做「刪」（N3）。
2. **合併時日期不晚於今天**：方向合理，但偵測方式在真的 hook 不成立（N1），放寬後也沒查格式（N6）。
3. **要新列的條件與同一天算重複**：主規則合理，改名放行可以接受；帶出 N2（上線過渡）、N5（同日互斥）、N12（兩步漏記）。
4. **跨 roadmap 重複報在後面那份**：合理，沒問題。
5. **沒錨點的「→」看整份、白板顯示 `檔〈標題〉`**：顯示合理；沒錨點放行留下重複的站（N9），建議改成必帶錨點。
6. **同一天同一版照位置切、不同版以那句為準**：合理。「同一天不同版」信的是手寫的那句，那句沒更新時白板會落後一版，機率低，不必改。
7. **縮排四格以上也當圍欄**：真的 repo 全部一致，可以接受；收尾不限縮排是多出來的副作用（N10）。
8. **只編碼 `%`、`#`、`?`，編碼壞掉報錯**：合理；括號與帶標題的連結沒處理（N11），機率極低。

#### 第一輪 R1～R12

| 項目 | 結果 | 說明 |
|---|---|---|
| R1 | 修到了 | 在 clone 實際模擬本任務收尾：空的狀態板下，同步、暫存區檢查、文件檢查、白板都通過 |
| R2 | 部分 | 原本三個重現（刪列又結束、手寫兩筆舊日期改名的列、只改舊列的連結）都照預期；但舊列被刪不擋（N3），另有 N5、N12 |
| R3 | 部分 | `ROLLOUT` 拿掉、遷移步驟寫進規範；但取代它的「合併時放寬」在真的 pre-merge-commit 不生效（N1），上線過渡另有 N2 |
| R4 | 修到了 | `%23`、`%20` 不解開；行內程式碼裡的連結不改、不算入口；殘留是極低機率的 N11 |
| R5 | 修到了 | 同一份入口跨 roadmap 兩列報錯，新的完成列跨檔也只能一筆 |
| R6 | 修到了 | 父子項不再互相代替，白板帶錨點；殘留 N9 |
| R7 | 修到了 | 兩段「來自」都成為邊 |
| R8 | 部分 | 待發布以選中的升版切、句中的「正式 vault 升到」不算；同類還有 N7 兩種 |
| R9 | 部分 | 非連結的下一站與外部「→」都擋；狀態行的外部連結與不存在的 D-ID 仍通過（N8） |
| R10 | 修到了 | 第一輪三個例子都對，三個工具共用一份，真的 repo 與 markdown-it 一致；新的邊界見 N10 |
| R11 | 修到了 | 和舊工具逐位元組相同 |
| R12 | 修到了 | 三處都改了，文件檢查通過 |

#### 沒驗的項目與原因

- 完整的 `npm run self-check` 與整包測試：照指示不跑（記憶體）；只跑了上面七個測試檔。
- `hooks.ts` 的 `preMergeCommit` 整條：N1 用等價的 shell hook 加 `roadmap-sync --check --staged` 重現，沒有掛真的 `.githooks`（clone 裡沒裝 `tools/` 的相依）。
- GitHub Actions 的 Ubuntu 實跑、Pages 與驗收第 11 項：要合併後才有。
- N8 在文件檢查那一層、N11 的 `#` 檔名、N13 的 CI 行為：靜態推斷，沒有實跑。
- 白板的手機寬度：這一輪的差異沒動版面，沒重看。

### Claude 回應

逐項核對：N1 的平台事實 repo 裡已有紀錄（`tools/hooks.ts` 的 `mergeHeads` 註解：pre-merge-commit 執行時還沒有 `MERGE_HEAD`，2026-11-12 實測）；N2 對 `8a03736` 的兩份 roadmap 核對過（最上層那一列入口是 `plans/workflow.md`，兩份都沒有〈等觸發點〉）；N3 讀 `checkDone` 確認 `left` 剩下的沒有人看。其他照回報的重現方式寫成測試，修之前都先失敗。分類照 code-quality `review.md`〈修正後收尾〉與 [D-207](../decisions.md#d-207-l2-的發現先分一定修可記限制交使用者選修法先收窄最後才加機制)：修法都是收窄，沒有加新機制；記成已知的限制的三項機率極低，發生時會被別的檢查擋下或只少一筆紀錄。

| 發現 | 分類 | 修法 | 動到什麼 |
|---|---|---|---|
| N1 真的合併沒有 `MERGE_HEAD`（N4 同一個原因） | 一定修（跨日的合併必現） | 偵測搬到新的 `tools/git-state.ts`，`hooks.ts` 與 `roadmap-sync.ts` 共用：`GITHEAD_<sha>`、`MERGE_HEAD`、`CHERRY_PICK_HEAD`、`REBASE_HEAD`、`SQUASH_MSG`、rebase 的資料夾；`merging()` 改名 `replaying()`。測試掛真的 hook：合併、squash、有衝突的 cherry-pick | `git-state.ts`（新）、`hooks.ts`、`roadmap-sync.ts`；hook 的三個測試把新檔複製進暫存 repo |
| N2 上線那次合併被擋 | 一定修 | 收窄兩條：同名的工作還在狀態板或〈等觸發點〉（只換入口）不要新列；HEAD 那份 roadmap 沒有〈等觸發點〉（上線前的格式）時不套 | `checkDone` |
| N3 舊的完成列被刪不擋 | 一定修 | HEAD 的〈已完成〉每一列（照比對鍵）都要還在，少了就報；HEAD 是上線前的格式時放行（上線那次把 5 列搬去封存） | `checkDone` |
| N4 隔天重播被擋 | 修（和 N1 同一個修法） | 見 N1 | 同 N1 |
| N5 同一天結束、重開、再結束 | 修（收窄） | HEAD 的狀態板或〈等觸發點〉有這份入口（重新開工）時，同一天的第二筆放行；不在 HEAD 板上時抄一筆照擋 | `checkDone` |
| N6 重播時日期不查格式 | 修 | 新列的日期要是 YYYY-MM-DD 的真實日期 | `checkDone` |
| N7 升版的判斷 | 修（收窄） | 工具寫的列照 html 的「`<strong>…</strong>：`」找完成那一句，只認「正式 vault 升到」開頭；「升正式版」只認手寫的列 | `roadmap-board.ts` 的 `releaseOf` |
| N8「已結案 →」只查形狀 | 修 | 狀態行「已結案 →」的連結不能是外部網址；純文字的 D-ID 要在決策紀錄裡 | `status-line.ts`、`check-docs.ts`；工作流程規範〈連結〉一句 |
| N9 backlog 站點的殘留 | 修（收窄） | 錨點和標題的 slug 一樣比小寫；連到 backlog 的「→」一定要帶錨點（改掉第二輪的做法 5） | `check-docs.ts`；工作流程規範〈連結〉一句 |
| N10 圍欄和 CommonMark 的不同 | 第一種修；第二種記成已知的限制 | 收尾最多比開頭多縮排三格（tab 算到下一個 4 的倍數）；清單裡沒收尾的圍欄記進 backlog〈已知的限制〉 | `fences.ts`；backlog |
| N11 `moveText` 的殘留 | 記成已知的限制（機率極低，多半被連結檢查擋下） | — | backlog〈已知的限制〉 |
| N12 漏記的兩條路 | 第一條修；第二條記成已知的限制 | HEAD 有列、現在每份都沒有、入口還沒結束就擋（狀態板的列不手動刪）；改名、結束、刪列在同一個 commit 記成已知的限制 | `checkDone`；backlog |
| N13 完成列的核對只在本機 hook | 記進技術債 | 觸發點：第一次在 GitHub 網頁上解〈已完成〉的衝突，或合併上線前開、帶手寫完成列的分支；完成條件：CI 在分支 push 與 PR 時拿和 `main` 的合併基點跑完成列的核對 | backlog〈技術債〉 |

工作流程規範〈roadmap〉的「commit 時和 HEAD 比」一句也照修法改寫（重播的日期、舊的列不刪、沒結束的列不能刪、換入口不算）。

## 第三輪的請求

只審第二輪 N1～N13 的修正與受影響的路徑；〈規格與優先順序〉〈回報與權限〉照上面。

審查者：照第二輪，由 Claude 開新的 Fable 5.2（high）子代理審（L3），不給實作者的結論。使用者 2026-11-21：Fable 審通過就不再請 Codex。

- 審查對象：第二輪審的 `3cd78c1` 之後、到這份請求所在的 commit。一項發現一個 commit（由舊到新；N1 與 N4 同一個原因放一起）：N1／N4 `173e7cc`、N6 `e3722ef`、N2 `4d65a07`、N3 `4965810`、N5 `509c3c1`、N12 `2119e02`、N7 `24554ff`、N8 `41203a0`、N9 `e517fb8`、N10 `4f73393`；文件（規範、backlog 的限制與技術債、這份請求）在最後一個 commit。看全部：`git diff 3cd78c1 <這份請求的 commit>`；看一項：`git show <commit>`。
- 每一項對照〈Claude 回應〉（第二輪）的修法：修到了沒有、有沒有帶進新問題。共用的路徑也請看呼叫端：
  - N1、N4：`tools/git-state.ts` 的 `mergeHeads`（`hooks.ts` 合併進 `main` 前查 CI）與 `replaying`（`roadmap-sync.ts` 的 `Source`）。
  - N2、N3、N5、N6、N12：`roadmap-sync.ts` 的 `checkDone`，在 pre-commit 與 pre-merge-commit 的 `roadmap-sync --check --staged` 跑。
  - N8、N9：`status-line.ts` 的 `parseStatus` 給文件檢查與同步用；`check-docs.ts` 的 `resolveHref` 改成錨點比小寫，`arrowsOf`、`fromLinks`、`downstreamOf` 都用它。
  - N10：`fences.ts` 給 `decisions.ts` 與 `section.ts` 用。
- 請找新的組合，例如：上線前開的分支把新的 `main` 併進來、再併回 `main`；同名的兩份工作在不同 roadmap；放棄的 rebase 或 squash 留下的狀態；重新開工的入口在另一份 roadmap 又結束；連到 backlog 的大寫錨點同時是 backlog 裡另一個標題的小寫；tab 縮排的圍欄。

實作者自己選的做法（規格沒寫的）：

1. N1：重播的判斷是 `GITHEAD_<sha>`、`MERGE_HEAD`、`CHERRY_PICK_HEAD`、`REBASE_HEAD`、`SQUASH_MSG`、`rebase-merge`／`rebase-apply` 其中之一；沒清掉的狀態（例如中斷的 rebase）只會把日期放寬成「不晚於今天」。
2. N2：「同名」是拿掉粗體後工作名稱相同，各份 roadmap 一起看。
3. N2、N3：「上線前的格式」是 HEAD 那份 roadmap 沒有〈等觸發點〉；那份不查「該有新列」「舊列不見」「沒結束的列被刪」，新的列照查。
4. N5：「重新開工」是 HEAD 的狀態板或〈等觸發點〉有這份入口。
5. N7：「工具寫的列」是純文字以「（已合併，入口）」或「（已結案，入口）」結尾。
6. N9：連到 backlog 的「→」一定要帶錨點（改掉第二輪的做法 5）。
7. N10：收尾的縮排不超過開頭加三格，tab 算到下一個 4 的倍數。
8. N12：還沒結束的列被刪掉，報在那份 roadmap〈現在在哪裡〉的標題那一行；入口讀不到狀態行的（手寫的〈等觸發點〉列）不看。

驗證方式：

- 每一項先寫會失敗的測試，測試名以「L2 N…」開頭；N1 的測試在暫存 repo 的 hooks 資料夾掛 shell 寫的 pre-commit 與 pre-merge-commit（呼叫 `roadmap-sync --check --staged`），跑真的合併、squash 與有衝突的 cherry-pick。
- 每個 commit 的 pre-commit 都通過：共用檢查，加 tools 的完整檢查（typecheck、ESLint、knip、測試）；Cards、Capture、Mindboard 照分派表跳過（沒改到它們的路徑）。
- 在 `4f73393`：`fences.ts` 和 markdown-it 比 repo 裡追蹤的 392 份 Markdown，0 份不同；`node tools/decisions-index.ts D-117 --deep` 和舊工具的輸出逐位元組相同。
- clone 模擬（`4f73393`）：從 `8a03736`（現在的 `origin/main`，上線前的格式）開分支、`--no-ff --no-commit` 併入本分支，`roadmap-sync --check --staged` 當天與 `--today 2026-11-28` 都通過；把本任務改成已合併，先擋，同步後通過，狀態板那一列變成〈已完成〉的一列。
- 沒驗：真的 `.githooks` 在 clone 裡跑完整的 pre-merge-commit（clone 沒裝 `tools/` 的相依，改用上面的 shell hook）；GitHub Actions 的 Ubuntu 實跑要 push 後才有；Pages 與驗收第 11 項要合併後才有。
