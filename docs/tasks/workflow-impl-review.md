# 工作流程上線：L2 獨立審查（給 Codex）

狀態：已結案｜完成：第五輪 Fable 5.2（high）通過，J1～J3 記進 backlog 與規範，不再請 Codex｜等誰：—

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

## 第三輪的回報

Fable 5.2（high）子代理，2026-11-21，審 `f9023bf`；約 20 分鐘、53 次工具呼叫。下面是回報原文，標題降兩級。

### Fable 回報（原文）

狀態：待修

第二輪的 13 項裡 9 項修到了、4 項部分修到；N1 的修法只放寬了日期，合併時另一邊已經 commit 過的完成列仍被當成新的列、拿現在的入口重新驗一次，所以「把 main 併進功能分支」在幾種正常的操作之後還是會被擋（M1，P2，六種觸發都用真的合併加 hook 重現）。其餘四項是 P3。建議修完 M1 再合併。

- **待審 commit**：`f9023bf523de63f11a91354fa9506e08d37b6aea`，分支 `claude/workflow-impl-68afda`。
- **審查範圍**：`git diff 3cd78c1 f9023bf`（10 個修正 commit 與文件）與受影響的路徑：`tools/git-state.ts`（`mergeHeads`、`replaying`）、`roadmap-sync.ts` 的 `checkDone`、`status-line.ts` 的 `parseStatus`、`check-docs.ts` 的 `resolveHref`／`arrowsOf`／`checkStations`、`roadmap-board.ts` 的 `releaseOf`、`fences.ts`，以及工作流程規範、backlog 的限制與技術債。
- **環境**：Windows 11、Git for Windows 2.52、Node 24.13.0。重現都在系統暫存資料夾的 `mkdtemp` 小 repo 與一份 clone（掛 shell 寫的 pre-commit／pre-merge-commit，呼叫這個 worktree 的 `roadmap-sync.ts --check --staged --root <暫存 repo>`），結束前都刪了；worktree 的 `git status` 乾淨、HEAD 仍是 `f9023bf`、分支沒換。

#### 跑了什麼

| 指令 | 結果 |
|---|---|
| `tools/` 裡一次一個檔：`roadmap-sync`、`fences`、`status-line`、`check-docs`、`roadmap-board` | 15、2、5、26、21 個測試全過，0 失敗、0 跳過 |
| `node tools/roadmap-sync.ts --check`、`node tools/check-docs.ts`、`node tools/roadmap-board.ts --check` | 都通過（392 個 Markdown、8,071 個連結） |
| `fences.ts` 對 markdown-it：repo 追蹤的 392 份 Markdown | 0 份不同 |
| clone：`8a03736` 加一個無關的 commit，掛 hook 跑真的 `git merge --no-ff f9023bf` | 通過（hook 裡 `GITHEAD_*` 有 1 個、沒有 `MERGE_HEAD`）；接著把本任務改成已合併：沒同步先擋，同步後通過，狀態板那一列變成〈已完成〉的一列 |
| clone：上線前開的分支（沒動 roadmap）把新的 main 併進來，再用非快轉併回 main | 兩次都通過 |
| clone：上線前開的分支在舊格式的 Cards roadmap 手寫一筆完成列，把新的 main 併進來，再併回 main | 併進來通過（HEAD 是舊格式、那一列在 HEAD 裡）；併回 main 時擋在「格式不是…」，和規範寫的遷移步驟一致 |
| 小 repo 掛 hook：兩邊各收尾一件工作，真的合併、解衝突兩列都留後 `git commit` | 通過；丟掉對方那一列會擋 |
| 小 repo 掛 hook：有衝突的 rebase 後 `--continue` | 通過 |
| `git merge --squash` 後 `git reset --hard` | `SQUASH_MSG` 被清掉，之後手寫別天的日期照樣擋 |
| 這個 worktree（路徑有中文）：`git rev-parse --git-path` 的結果經 `resolve` 後找得到檔 | 正確；`replaying()` 是 false |

#### 發現

##### P2 M1　合併、squash 帶進來的完成列被當成新的列，拿現在的入口重新驗；另一邊做過兩步以上就擋（延續 N1、N2、N5；規格漏洞）

**規格與設計｜已重現**（六種都用真的 `git merge --no-ff` 加 pre-merge-commit）。

- **原因**：`checkDone` 的「新的列」是「暫存區有、HEAD 沒有」（任務說明 `docs/tasks/workflow-impl.md:99`）。合併時這些列是另一邊各自過了 hook 才 commit 的，`replaying()` 只放寬日期（`tools/roadmap-sync.ts:393`）；入口的狀態、完成那一句、工作名稱、一份入口一筆、同一天、「HEAD 有列就要有新列」（`:385-399`、`:413-424`）仍照「暫存區只比 HEAD 多一步」驗。另一邊在分岔之後對同一件工作做了兩步，兩步合起來就過不了。
- **觸發條件與實際**（`feature` 在第一步之前開、沒動過 roadmap，之後 `git merge main`；方向反過來、或 `merge --squash` 後 `git commit` 也一樣）：

| main 上分開的 commit（各自通過 hook） | 合併時的錯誤 |
|---|---|
| 收尾 → 之後補寫入口的「完成」那一句 | 「和入口 … 的『完成』那一句不一樣」 |
| 收尾（已合併）→ 之後改成已結案 | 「入口 … 的狀態是『已結案』」 |
| 收尾 → 重新開工（照規範手寫一列） | 「入口 … 的狀態是『實作中』」 |
| 收尾 → 重新開工 → 再收尾（不同天也一樣） | 「完成那一句不一樣」加「已經有一筆新的完成列」；第一次收尾之後才開的分支、同一天時是「已經有同一天的完成列」（N5 放行的那條路） |
| 換入口（討論稿已結案 → 任務，同名）→ 任務收尾 | 「入口 docs/plans/p.md 已結束、HEAD 的狀態板或〈等觸發點〉有它，〈已完成〉卻沒有新的一列」（N2 的同名放行只在單一 commit 裡成立） |
| 改工作名稱 → 收尾 | 「工作名稱要和 HEAD 狀態板的『甲』一樣」 |

- **預期**：另一邊已經 commit 的完成列是它那邊驗過的，合併只該確認兩邊的列都還在。
- **影響**：
  - 和這件工作無關的分支沒辦法把 main 併進來；`AGENTS.md` 不准 `--no-verify`，沒有出口。
  - 訊息的修法是錯的：照「把那一列加回來再同步」會在分支上多出一筆討論稿的「已結案」完成列；照訊息改完成列的字，之後併回 main 會和 main 自己那一列衝突，或被「HEAD 的列不見了」擋下。
- **真實路徑**：會發生，機率中。
  - 這個 repo 過去約 60 個本機合併 commit 大多是「把 origin/main 併進分支」，都走 pre-merge-commit；同時開好幾個 session 的分支是常態。
  - main 那邊只要在某個分支分岔之後收尾一件工作、之後又動到那份入口的狀態行（補一句、改狀態值、重新開工），或「換入口再收尾」（討論稿 → 任務 → 完成，這個流程設計的正常路線；本分支自己就是 `plans/workflow.md` → `tasks/workflow-impl.md`）。
  - 上線這一次不受影響（上面的 clone 模擬通過）。在 GitHub 上合併 PR 與快轉不經過 hook，也不受影響。
- **位置**：`tools/roadmap-sync.ts:366-400`、`:411-425`；`tools/git-state.ts:26`；`docs/agents/workflow.md:95`（規範也只寫日期放寬）。
- **建議**：合併前修。兩個方向：
  - **用已有的來源**：真的合併時（`mergeHeads()` 有值）把另一邊那個 commit 的同一份 roadmap 讀出來，它已有的完成列算舊的列（不重驗、也不能少），HEAD 狀態板有而現在沒有的列，另一邊也沒有就不看。cherry-pick、rebase 有 `CHERRY_PICK_HEAD`、`REBASE_HEAD` 可以比照；squash 沒有 ref。
  - **更小的收窄**：重播時新的列只查格式與日期，其餘不查。代價是解衝突時丟掉對方的列不再擋（現在擋得到）。
  - 測試改成「另一邊兩個以上的 commit」的整類，不只補這六個例子。

##### P3 M2　同名放行太寬：別處有同名的列，就能刪列不留完成紀錄（N2 修正引入）

**規格｜已重現**（`--check --staged`）。

- **觸發條件**：最上層與 Cards 的 roadmap 各有一列同名的工作（不同入口），或同一份 roadmap 兩列同名。刪掉其中一列（入口還沒結束），或入口改成已合併又刪列，都 exit 0。另外，換入口時舊入口還是「討論中」也放行，舊入口留在板外沒有人提醒。
- **原因**：`works` 是所有 roadmap 現在的工作名稱（`tools/roadmap-sync.ts:412-414`），不看是不是「同一列換了入口」。
- **影響**：N12、R2 要擋的漏記在這個條件下又走得通。
- **真實路徑**：會發生，機率低（要有同名的兩列，或換入口時忘了結案）。
- **建議**：可延後或和 M1 一起做：同名只看同一份 roadmap、而且那個名稱的列數沒有變少；或改用入口狀態行「已結案 →」的下一站判斷換入口（下一站在板上或有完成列才算）。

##### P3 M3　工具寫的發版列，版本號帶連結或粗體時認不出升版（N7 修正引入）

**規格｜已重現**（`parseRelease`）。

- **觸發條件**：`**發版**：正式 vault 升到 [`0.7.0`](…)（已合併，[入口](…)）` 或 `…升到 **0.7.0**…`。
- **實際**：版本停在 0.6.0，發版那一列自己被列成待發布。`3cd78c1` 用純文字比對時認得；現在比 html，只接受 `<code>` 或沒有標記（`tools/roadmap-board.ts:140`）。照規範寫 `` `x.y.z` `` 的不受影響。
- **真實路徑**：會發生，機率低（把版本連到 tag 或 release 頁）。
- **建議**：可延後或順手修：版本前容許任意標籤；或在規範那一句註明版本只用反引號。

##### P3 M4　圍欄判斷的兩個殘留（延續 N10）

**樣本已重現；repo 的 392 份都一致。**

- 頂層的開頭縮排 1～3 格、裡面有一行縮排 4～6 格的 ```` ``` ````：仍被當成收尾（CommonMark 的上限是所在區塊加 3 格，不是開頭加 3 格），後面的 `## x` 被當成真標題。和 N10 第一種同一個形狀，只修了開頭頂格的。
- 引用框裡 `> ` 後面接 tab 的收尾：markdown-it 算縮排 2 格、是收尾；`fences.ts` 拿掉 `> ` 後才算 tab，算成 4 格（`tools/fences.ts:30-36`）。影響只到引用框結束。
- **真實路徑**：機率極低。**建議**：記進 backlog〈已知的限制〉N10 那一列。

##### P3 M5　重播的判斷漏掉沒有狀態檔的搬法（延續 N4）

**已重現**（`git cherry-pick -n` 後 `git commit`）。

- **實際**：`cherry-pick -n` 不寫 `CHERRY_PICK_HEAD`，隔天 commit 時報「日期要是今天」。`git checkout <分支> -- <檔>`、`git restore --source` 拿別的分支的 roadmap 是同一類（靜態推斷）。照訊息把日期改成今天，記下的就不是收尾那天。
- **真實路徑**：會發生，機率低。主資料夾 cherry-pick 狀態文件的做法沒有衝突時不跑 hook，不受影響。
- **建議**：記成已知的限制，寫明「用會留狀態的指令：`cherry-pick`、`merge --squash`」。

#### 實作者自己選的做法

1. **重播的判斷清單**：來源選得對（真的 hook 裡驗過 `GITHEAD_*`，中文路徑的 worktree 也對），沒清掉的狀態只放寬日期也合理。問題在放寬的範圍只有日期（M1），另漏沒有狀態檔的搬法（M5）。
2. **同名是拿掉粗體後相同、各份一起看**：太寬（M2）。
3. **上線前的格式是 HEAD 沒有〈等觸發點〉**：合理，clone 裡真的合併驗過；同步要求這一節存在，上線後不會再被當成舊格式；新的列照查也驗過。
4. **重新開工是 HEAD 的板上有這份入口**：直線歷史合理，跨 roadmap 也驗過（最上層收尾、Cards 重開再收尾，同一天通過）；經過合併就不成立（M1）。
5. **工具寫的列以「（已合併，入口）」結尾**：合理；比 html 帶出 M3。
6. **連到 backlog 的「→」一定帶錨點**：合理，和規範「backlog 的一站是檔＋最近的標題」一致。從 backlog 出發時，「來自」沒帶錨點也會被回鏈的核對擋下，兩邊對稱。
7. **收尾不超過開頭加三格、tab 算到 4 的倍數**：頂格開頭的都對；殘留見 M4。
8. **N12 報在〈現在在哪裡〉的標題、讀不到狀態行的不看**：合理。

和規格的衝突：沒有發現程式和規範互相矛盾。M1 是規格本身的漏洞：任務說明把新的列定義成「暫存區有、HEAD 沒有」，沒考慮合併。

#### 第二輪 N1～N13

| 項目 | 結果 | 說明 |
|---|---|---|
| N1 | 部分 | 真的 pre-merge-commit 認得出合併，跨日的單純合併通過；但只放寬日期，其餘規則見 M1 |
| N2 | 部分 | 上線那次合併與上線前開的分支都通過（clone 實測）；同名放行太寬（M2），換入口再收尾經過合併仍擋（M1） |
| N3 | 修到了 | 刪列、解衝突丟掉自己那一列都擋；只改連結目標、換順序放行；舊格式的 HEAD 放行 |
| N4 | 修到了 | squash、有衝突的 cherry-pick 與 rebase 通過；殘留是 M5 |
| N5 | 部分 | 直線歷史同一天第二筆放行；重開與再收尾經過合併時仍擋（M1） |
| N6 | 修到了 | `2026-1-5`、`2026-02-30`、空的都擋 |
| N7 | 修到了 | 名稱有「：」認得、工具列的「升正式版」不算；帶出 M3 |
| N8 | 修到了 | 外部連結（含大寫 scheme、`//`、`mailto:`）與不存在的 D-ID 都擋 |
| N9 | 修到了 | 大寫錨點對得上（決定與 backlog 都是）；兩個標題 `AI`、`ai` 時 `#AI` 對到第一個，和連結檢查一致；沒帶錨點擋下 |
| N10 | 部分 | 頂格開頭的修到了，repo 392 份一致；清單那一種記成已知的限制合理；殘留見 M4 |
| N11 | 分類合理 | 機率極低、多半被連結檢查擋下；backlog 那一列的觸發點與影響寫得對 |
| N12 | 修到了（第一條） | 沒結束的列被刪會擋；第二條記成已知的限制合理；同名時繞得過（M2） |
| N13 | 分類合理 | 觸發點與完成條件具體。順帶：沒衝突的 `git revert` 也不跑 hook（實測，收尾的 commit 與合併都能 revert 掉完成列），屬於同一類 |

#### 沒驗的項目與原因

- 完整的 `npm run self-check`、`hooks.test.ts`、`quality.test.ts`、`section`、`decisions-index` 的測試：照指示不跑整包；只跑了上面五個檔。
- 真的 `.githooks` 加 `tools/hooks.ts` 的 `preMergeCommit` 整條（含合併進 main 前查 CI）：clone 沒裝相依，改用等價的 shell hook。`hooks.ts` 這一輪只把 `mergeHeads` 搬到共用檔，讀過差異，沒有實跑。
- `node tools/decisions-index.ts D-117 --deep` 和舊工具逐位元組比對：沒重跑；改以 392 份 Markdown 的圍欄行和 markdown-it 全部一致代替。
- GitHub Actions 的 Ubuntu 實跑、Pages 與驗收第 11 項：要 push、合併後才有。
- M1 裡 cherry-pick、rebase 方向的同類組合，M5 的 `git checkout <分支> -- <檔>`：靜態推斷，沒有實跑。
- 白板的版面：這一輪的差異沒動，沒重看。

### Claude 回應

逐項核對：M1 的第一種先寫成掛真的 hook 的測試，修之前同樣擋在「和入口 docs/tasks/x.md 的『完成』那一句不一樣」（真的合併、pre-merge-commit）；M2、M3 照回報的觸發條件寫成測試，修之前都先失敗。分類照 code-quality `review.md`〈修正後收尾〉與 [D-207](../decisions.md#d-207-l2-的發現先分一定修可記限制交使用者選修法先收窄最後才加機制)。M1 不選「重播時新的列只查格式與日期」：解〈已完成〉的衝突在兩邊各收尾一件時每次都會遇到，那個做法會讓丟掉另一邊那一列不再擋；讀另一邊的 roadmap 用的是 Git 已經給的 ref，沒有新的狀態要維護。

| 發現 | 分類 | 修法 | 動到什麼 |
|---|---|---|---|
| M1 合併帶進來的完成列被重驗 | 一定修（把 `main` 併進分支的正常路線會被擋，沒有出口） | 重播時讀另一邊那個 commit 的同一份 roadmap（`git-state.ts` 新的 `replaySides`：真的合併是 `GITHEAD_*`／`MERGE_HEAD`，cherry-pick 與 rebase 是正在套用的那一個，squash 是 `SQUASH_MSG` 列出的分支頂端）。另一邊已有的完成列不照這邊的入口重驗，只查格式與日期（第一版連格式都不查，既有的 R3 測試擋下：上線前開的分支手寫的列，先併進新的 `main` 再併回來就不擋了），入口算有完成列；真的合併時另一邊的列也要都在；新的列和另一邊帶進來的列同一份入口就擋；上線前格式的另一邊不算。測試掛真的 hook 跑「另一邊做了兩步以上」六種，每種都跑合併、squash 與反方向，另加解衝突丟掉另一邊那一列 | `git-state.ts`、`roadmap-sync.ts` 的 `Source` 與 `checkDone`；規範〈roadmap〉、任務說明各一句 |
| M2 同名放行太寬 | 修（收窄；M1 的「換入口再收尾」也靠它） | 換入口只認舊入口自己寫的「已結案 → <新入口>」，新入口在狀態板或〈等觸發點〉、或有完成列（新的或另一邊帶進來的）；不再看別處有沒有同名的列。換入口時舊入口沒結束就擋（N12 的訊息）；「沒有新的一列」的訊息加一句換入口的寫法 | `checkDone`；規範〈roadmap〉一句 |
| M3 發版列的版本號帶標記 | 修 | 「正式 vault 升到」後面、版本號前容許任何標籤（連結、粗體、行內程式碼） | `roadmap-board.ts` 的 `GENERATED_RELEASE` |
| M4 圍欄的兩個殘留 | 記成已知的限制（機率極低；要修得追蹤清單與引用框，和 N10 第二種同一個原因） | backlog N10 那一列改寫，納入這兩種 | backlog〈已知的限制〉 |
| M5 沒有狀態檔的搬法 | 記成已知的限制（機率低，新列的核對會擋下） | 寫明用會留狀態的 `git cherry-pick`、`git merge` | backlog〈已知的限制〉 |
| N13 的補充：沒衝突的 `git revert` | 併進技術債那一列 | — | backlog〈技術債〉 |

修 M1 時另外記一條已知的限制：squash 不要求另一邊的列都留著（留下的 `SQUASH_MSG` 可能是放棄的 squash），解衝突時丟掉另一邊那一列、那件工作又不在這邊的板上時會漏記。

## 第四輪的請求

只審第三輪 M1～M5 的修正與受影響的路徑；〈規格與優先順序〉〈回報與權限〉照上面。

審查者：照第三輪，由 Claude 開新的 Fable 5.2（high）子代理審，不給實作者的結論。使用者 2026-11-21：Fable 審通過就不再請 Codex。

- 審查對象：第三輪審的 `f9023bf` 之後、到這份請求所在的 commit。一項發現一個 commit（由舊到新；M2 在 M1 前面，M1 的「換入口再收尾」要靠它）：M2 `cc15f41`、M1 `fe4081a`、M3 `d44c2cc`；文件（規範、任務說明、backlog 的限制與技術債、這份請求）在最後一個 commit。看全部：`git diff f9023bf <這份請求的 commit>`；看一項：`git show <commit>`。
- 每一項對照〈Claude 回應〉（第三輪）的修法：修到了沒有、有沒有帶進新問題。共用的路徑也請看呼叫端：
  - M1：`tools/git-state.ts` 的 `replaySides`，只有 `roadmap-sync.ts` 的 `gitSource` 用；`checkDone` 在 pre-commit 與 pre-merge-commit 的 `roadmap-sync --check --staged` 跑，`npm run check` 與 CI 的 `--check` 也跑（那時沒有重播，另一邊是空的）。
  - M2：`checkDone` 最後一段（HEAD 板上有、現在不見的列）。
  - M3：`roadmap-board.ts` 的 `releaseOf`。
- 請找新的組合，例如：octopus 合併；兩邊都改了同一列舊列的連結目標再合併；另一邊是上線前的格式、這邊是新的（或反過來）；squash 的分支頂端是合併 commit；一串 cherry-pick 中途衝突；「已結案 →」的下一站在另一份 roadmap，或下一站自己也換了入口；放棄的 squash 留下 `SQUASH_MSG` 之後的 commit。

實作者自己選的做法（規格沒寫的）：

1. M1：另一邊的列照 `doneKey`（日期＋拿掉連結目標的文字）對；同一列兩邊都有時，對到一次兩邊各扣一次。
2. M1：只有真的合併（`GITHEAD_*`、`MERGE_HEAD`）要求另一邊的列都在；cherry-pick、rebase、squash 只拿來認出另一邊帶進來的列（squash 的缺口記成已知的限制）。
3. M1：squash 的另一邊是 `SQUASH_MSG` 列出的 commit 經 `git merge-base --independent` 剩下的。
4. M1：另一邊帶進來的列照查格式與日期（工具的格式、真實日期、不晚於今天），入口的狀態、完成那一句、工作名稱、一份入口一筆、同一天都不查。代價：另一邊經過 GitHub 網頁進了手寫的列，把它併進來會被擋（N13 那一類）。
5. M1：新的列和另一邊帶進來的列是同一份入口就擋。
6. M1：上線前格式（沒有〈等觸發點〉）的另一邊不算：不認它的列，也不要求它的列。
7. M2：下一站只認連到 Markdown 檔的連結（D-ID 不算換入口）；新入口在任何一份 roadmap 的板上都算。

驗證方式：

- 每一項先寫會失敗的測試，測試名以「L2 M…」開頭。M1 的測試在暫存 repo 掛 shell 寫的 pre-commit 與 pre-merge-commit，修之前擋在第一種（「和入口 docs/tasks/x.md 的『完成』那一句不一樣」，真的合併）；M2、M3 照回報的觸發條件，修之前都失敗。
- 每個 commit 的 pre-commit 都通過：M2、M3 跑共用檢查與 tools 的完整檢查；M1 改到 hook 用的 `git-state.ts`，另外跑 Cards、Capture、Mindboard 的完整檢查（第一次在 Cards 的檢查記憶體用完，騰出記憶體後重跑通過）。
- `roadmap-sync` 的 17 個測試在 M1 的版本都通過（M1 的第一版讓既有的 R3 測試失敗，見〈Claude 回應〉）；`roadmap-board` 的 22 個測試通過。
- clone 模擬（工具是 `fe4081a` 的 `roadmap-sync.ts`，併的是 `cc15f41`）：上線那次合併通過；上線前開的分支在舊格式的 Cards roadmap 手寫一列，把新的 main 併進來通過（HEAD 是舊格式、那一列在 HEAD 裡），再併回新的 main 擋在「格式不是」。
- 真的 repo：`node tools/roadmap-sync.ts --check`、`node tools/roadmap-board.ts --check`、文件檢查通過。
- 沒驗：真的 `.githooks` 在 clone 裡跑完整的 pre-merge-commit（改用上面的 shell hook）；M1 的 octopus 合併、一串 cherry-pick 中途衝突、rebase 方向沒有實跑；GitHub Actions 的 Ubuntu 實跑要 push 後才有；Pages 與驗收第 11 項要合併後才有。

## 第四輪的回報

Fable 5.2（high）子代理，2026-11-21，審 `0e84459`。下面是回報原文，標題降兩級；一處格式說明包成行內程式碼（裡面的 `[入口](…)` 會被文件檢查當成連結）。

### Fable 回報（原文）

狀態：通過

第三輪的 M1～M3 都修到了，M4、M5 記成已知的限制合理；沒有 P1、P2。這一輪找到三項 P3（K1～K3），都用真的合併加 hook 重現。K1 是 M1 修正帶出的：規範寫的遷移步驟在一種順序下會被擋，修法很小，建議合併前順手修或在規範補一句，但不擋合併。

- **待審 commit**：`0e84459c3225a7951241ff37cb66c498fe188f88`，分支 `claude/workflow-impl-68afda`。
- **審查範圍**：`git diff f9023bf 0e84459`（`cc15f41` M2、`fe4081a` M1、`d44c2cc` M3 與文件）與受影響的路徑：`tools/git-state.ts` 的 `replaySides`、`tools/roadmap-sync.ts` 的 `Source.sides`／`checkDone`／`nextStations`、`tools/roadmap-board.ts` 的 `GENERATED_RELEASE`，以及 `docs/agents/workflow.md`〈roadmap〉、任務說明、backlog 的限制與技術債。
- **環境**：Windows 11、Git for Windows 2.52、Node 24.13.0。重現都在系統暫存資料夾的 `mkdtemp` 小 repo（掛 shell 寫的 pre-commit／pre-merge-commit，呼叫這個 worktree 的 `roadmap-sync.ts --check --staged --root <暫存 repo> --today 2026-11-25`）與一份 `git clone -s` 的 clone，結束前都刪了。worktree 的 `git status` 乾淨、HEAD 仍是 `0e84459`、分支沒換。
- **操作上的說明**：暫存小 repo 裡模擬「上線前、還沒有工具的分支」的 commit 是不經 hook 進去的（腳本內）；在 clone 裡有一次指令帶了跳過 hook 的旗標，被這個專案的 hook 擋下，改成先把 clone 的 hooks 資料夾暫時移開再 commit。都只在暫存 repo，沒有動到真的 repo。

#### 跑了什麼

| 指令 | 結果 |
|---|---|
| `tools/` 裡一次一個檔：`tests/roadmap-board.test.ts`、`tests/roadmap-sync.test.ts` | 22、17 個測試全過，0 失敗、0 跳過 |
| 真的 repo：`node tools/roadmap-sync.ts --check`、`node tools/roadmap-board.ts --check` | 都通過 |
| clone：`8a03736` 加一個無關的 commit，掛 hook 跑真的 `git merge --no-ff 0e84459` | 通過 |
| clone：真的進行中分支 `claude/project-thread-sdo9aa`（`a289fcf`，上線前的格式、狀態板多一列）把上面那個合併後的 main 併進來 | `docs/roadmap.md` 與 `experiments/tools/decisions-index.mjs` 衝突；兩個都取 main 那邊後 `git commit` 通過 |
| 小 repo：上線前的分支手寫完成列，直接併進新的 main，照規範的遷移步驟做 | 先擋在「格式不是」，照步驟做完後通過 |
| 小 repo：同上，但分支先把新的 main 併進來再併回 main；`f9023bf` 與 `0e84459` 的工具各跑一次 | 見 K1 |
| 小 repo：另一邊連換兩次入口（p → t1 → t2），功能分支把它併進來 | 見 K2 |
| 小 repo：octopus `git merge a b`（自動 commit）；`--no-commit` 後 `git commit` | 自動 commit 通過（兩種順序）；`--no-commit` 見 K3 |
| 小 repo：兩邊各自把同一列舊列的連結目標改成不同的檔，合併、取一邊 | 通過 |
| 小 repo：squash 的分支頂端是合併 commit（`SQUASH_MSG` 列 4 個 commit） | 通過 |
| 小 repo：`git cherry-pick` 一串四個（收尾、重新開工、再收尾），第一個衝突後 `--continue` | 通過，四個都套上 |
| 小 repo：rebase，另一邊做了三步（收尾、補一句、重新開工），〈已完成〉衝突兩次後 `--continue` | 通過 |
| 小 repo：「已結案 →」的下一站在另一份 roadmap（最上層 → Cards），換入口後、再收尾後各合併一次 | 都通過 |
| 小 repo：放棄的 squash（`git restore --staged --worktree .`，`SQUASH_MSG` 留著）之後的一般 commit | 見 K3 |

#### 發現

##### P3 K1　另一邊帶進來、不是工具格式的完成列：真的合併時既不能留、也不能刪；規範寫的遷移步驟在這個順序下被擋（M1 修正引入；延續第二輪 N13）

**規格與設計｜已重現**（`f9023bf` 與 `0e84459` 的工具跑同一串操作對照）。

- **觸發條件**：另一邊（新格式的 roadmap）有一列這邊 HEAD 沒有、又不是工具格式的完成列，用真的 `git merge` 併進來。兩條路會走到：
  1. 上線前開的分支手寫了完成列，先把新的 main 併進分支（HEAD 是舊格式，通過），再用本機的 `git merge` 併回 main。
  2. 手寫的列不經 hook 進了某個分支（GitHub 網頁、沒衝突的 cherry-pick／rebase／revert，N13 那一類），再把那個分支併進來。
- **實際**（`0e84459`）：
  - 合併先擋在「格式不是『`**工作**：完成（已合併，[入口](…)）`』」（`tools/roadmap-sync.ts:403-406`，預期內）。
  - 照 `docs/agents/workflow.md:97` 的遷移步驟（刪掉那一列、入口改成已合併、狀態板加回那一列、跑同步）之後 `git commit`，擋在「合併進來的 47174b7 的〈已完成〉有『| 2026-11-24 | 甲做完了 |』這一列，現在不見了：解衝突時兩邊的完成列都留著，把它加回來」（`:447`）。加回來又回到「格式不是」，兩個訊息互相打架。
  - 放棄合併、改在分支上做同樣的遷移：擋在「HEAD 的〈已完成〉有…現在不見了」（`:445`，第二輪 N3 的規則，這一輪之前就有）。
  - 對照 `f9023bf`：同一串操作，在進行中的合併裡照步驟做完就通過。
- **預期**：另一邊的列不是工具格式時，「要求留著」不該成立（它同時被要求刪掉）；或規範寫明這個順序要怎麼做。
- **影響**：合併被擋，訊息指不出路，`AGENTS.md` 又不准跳過 hook。不會弄壞資料。走得通的出口（實測）：`git merge --squash` 那個分支再做遷移；或分支還沒把新的 main 併進來之前直接併進 main（另一邊是上線前的格式，不要求它的列，遷移步驟通過）；在 GitHub 上合併 PR 不經過 hook。
- **真實路徑**：會發生，機率低。
  - 第 1 條：現在沒合併的分支只有 `claude/project-thread-sdo9aa` 一條是上線前開、還在動的，它只在狀態板加了一列、沒有手寫完成列；要它在把新的 main 併進來之前先手寫完成列才會碰到。這個 repo 本機合併很常見（11 月以來 93 個合併 commit，兩個方向都有），所以碰到時多半就是本機合併。
  - 第 2 條：要先有手寫的列繞過 hook 進了分支，已記在技術債 N13。
- **位置**：`tools/roadmap-sync.ts:403-406`、`:445-447`；`docs/agents/workflow.md:97`；請求〈實作者自己選的做法〉第 4 點只寫了「會被擋」，沒寫沒有出口。
- **建議**：不擋合併；修法是收窄，建議順手修。兩種擇一：
  - `:447` 要求另一邊的列都在時，跳過不符合 `DONE_CELL` 的列（這種列本來就一定被 `:405` 擋，要求它留著沒有意義）；既有的 R3 測試（先併進新的 main 再併回來照擋）不受影響，另加「擋下後照遷移步驟做完會通過」的測試。
  - 不改程式：`workflow.md:97` 那一句補上「分支已經把新的 main 併進來的，用 `git merge --squash`」，並把 N13 那一列技術債的觸發點補上這一條。

##### P3 K2　另一邊連換兩次入口，合併時仍擋（延續 M1、M2；同一類的第 2 代）

**規格｜已重現**（真的 `git merge --no-ff` 加 pre-merge-commit）。

- **觸發條件**：另一邊分兩個 commit 換了兩次入口（p「已結案 → t1」、狀態板那一列改連 t1；之後 t1「已結案 → t2」、改連 t2），每一步自己的 hook 都通過。在第一步之前開的分支把它併進來。再接一步「t2 收尾」也一樣。
- **實際**：「入口 docs/plans/p.md 已結束、HEAD 的狀態板或〈等觸發點〉有它，〈已完成〉卻沒有新的一列：把那一列加回來，再執行 node tools/roadmap-sync.ts（只是換了入口就在舊入口寫『已結案 → <新入口>』）」。舊入口已經照訊息寫了箭頭。
- **原因**：`nextStations` 只看舊入口自己的下一站（`tools/roadmap-sync.ts:460`）；p 的下一站 t1 不在板上、也沒有完成列，t1 自己的下一站 t2 沒有接著看。
- **影響**：和這件工作無關的分支沒辦法把 main 併進來。照訊息「把那一列加回來再同步」會在分支上多出一筆 p 的完成列，之後和 main 對不上；把 p 的箭頭直接改成 t2 會被文件檢查的「來自」回鏈擋。
- **真實路徑**：會發生，機率低：要同一件工作在另一邊手動換兩次入口（討論稿 → plans → 任務，或任務拆成第二份），而且這邊在這段時間都沒併過 main。用同步工具收尾舊入口（寫一筆已結案的完成列、再手寫新的一列）的不受影響。
- **建議**：可延後，或順手修：順著下一站一路看下去（記下看過的入口避免繞圈），其中一站在板上或有完成列就算。M1 的回歸測試是六個例子，這一項是同一類又漏一個，照 `review.md`〈修正後收尾〉改成整類的性質測試較穩（另一邊任意兩步以上的組合）。不修就記進 backlog〈已知的限制〉。

##### P3 K3　另一邊的來源有兩個小缺口：octopus `--no-commit` 只認第一個；留下的 `SQUASH_MSG` 現在放寬的不只日期（M1 修正引入；前一個延續 N1）

**已重現。**

- **octopus**：`git merge --no-commit b a` 之後 `git commit`，`MERGE_HEAD` 有兩行，`git rev-parse MERGE_HEAD` 只回第一個（`tools/git-state.ts:18`）。第二個分支帶進來的列被當成新的列重驗，另一邊做過兩步就擋在「和入口 docs/tasks/x.md 的『完成』那一句不一樣」；順序換成 `a b` 就通過。自動 commit 的 octopus 有 `GITHEAD_*`，兩個都認得，通過。兩邊都動到〈已完成〉的 octopus 會衝突，Git 自己就不做。`hooks.ts` 合併進 main 前查 CI 也用同一個函式，同樣只查到第一個。
- **留下的 `SQUASH_MSG`**：`git merge --squash b` 後用 `git restore --staged --worktree .` 放棄（`git reset` 會清掉，`restore` 不會），之後一般的 commit 手抄一列 b 的完成列，入口還是「實作中」、狀態板那一列也還在，exit 0。第二輪做法 1 寫的是「沒清掉的狀態只會把日期放寬」，M1 之後留下的 `SQUASH_MSG` 也讓抄自那個分支的列不照入口重驗（`tools/roadmap-sync.ts:409-414`）。
- **真實路徑**：兩個都機率極低（octopus 加 `--no-commit`；放棄 squash 後還手抄它的列）。
- **建議**：記進 backlog〈已知的限制〉即可；要修的話 octopus 改成讀 `MERGE_HEAD` 檔的每一行。backlog 新加的 squash 那一列可以順便補一句：cherry-pick、rebase 解衝突時丟掉那一列也不要求留著（程式是同一個 `whole: false`；靜態推斷）。

#### 第三輪 M1～M5

| 項目 | 結果 | 說明 |
|---|---|---|
| M1 | 修到了 | 第三輪的六種觸發，測試裡各跑合併、squash 與併回都通過；解衝突丟掉另一邊那一列照擋。另外實跑 cherry-pick 一串、rebase、squash 頂端是合併 commit、自動 commit 的 octopus、兩邊改同一列的連結目標都通過；上線那次合併與真的進行中分支在 clone 裡通過。帶出 K1，殘留 K2、K3 |
| M2 | 修到了 | 同名的列在別處、同一份兩列同名、舊入口沒結束、沒寫箭頭都擋（測試）；下一站在另一份 roadmap 放行（實跑）。殘留是連換兩次（K2） |
| M3 | 修到了 | 連結包反引號、粗體、連結裡帶 `v` 都認得（測試）；標籤整個吃掉後才比版本號，不會誤抓 href 裡的數字（靜態推斷） |
| M4 | 分類合理 | `fences.ts` 這一輪沒改；backlog 那一列的三種觸發點與影響和第三輪的回報一致，機率極低 |
| M5 | 分類合理 | 觸發點、影響與避開的寫法正確；M1 之後這類搬法擋下的原因不只日期，那一列寫的是「擋在新列的核對（例如…）」，涵蓋得到 |

#### 實作者自己選的做法

1. **另一邊的列照 `doneKey` 對、兩邊各扣一次**：合理。兩邊各改同一列的連結目標、同一列兩邊都有、同一個鍵有兩列的情形都對得上。
2. **只有真的合併要求另一邊的列都在**：合理，squash 的缺口也記了。帶出 K1（要求留著的範圍包含一定會被格式擋下的列）；cherry-pick、rebase 也有和 squash 一樣的缺口，限制那一列只寫了 squash（K3 最後一句）。
3. **squash 的另一邊用 `merge-base --independent`**：合理，頂端是合併 commit 時實測剩一個。`SQUASH_MSG` 列的 commit 很多時指令列可能超過 Windows 的長度上限（約 780 個以上，靜態推斷，沒實跑），失敗時退回「沒有另一邊」，只會多擋不會放行。
4. **另一邊帶進來的列只查格式與日期**：合理，R3 的測試守住「先併進新的 main 再併回來照擋」。寫下的代價少一句：真的合併時這種列沒有出口（K1）。
5. **新的列和另一邊帶進來的列同一份入口就擋**：合理，想不到正常流程會同時有這兩種列。
6. **上線前格式的另一邊不算**：合理；上線前的分支直接併進新的 main，遷移步驟實測通過。
7. **下一站只認 Markdown 檔的連結、任何一份 roadmap 的板上都算**：合理，和規範「談定寫已結案 → D-xxx」不衝突（那種收尾由工具寫一筆完成列）。提醒一點：這個 repo 自己的 `docs/plans/workflow.md` 箭頭只寫 D-ID、任務的連結寫在「完成」那一句，照新規則不算換入口；這次靠「HEAD 是上線前的格式」放行，上線後要把新入口寫進箭頭，擋下時的訊息有寫。

和規格的衝突：程式和 `workflow.md`〈roadmap〉、任務說明、D-217 沒有互相矛盾；唯一對不上的是 `workflow.md:97` 的遷移步驟在 K1 的順序下做不完。

#### 順帶看到、不在這一輪範圍

真的進行中分支 `claude/project-thread-sdo9aa` 把上線後的 main 併進來時，`docs/roadmap.md` 會衝突；整份取 main 那邊，它自己加的那一列（`plugins/` 改名 `apps/`）會不見，檢查不擋（HEAD 是上線前的格式，不查沒結束的列被刪，第二輪 N2、N3 的設計）。建議上線後通知那個 session 解衝突時把那一列加回來。

#### 沒驗的項目與原因

- 完整的 `npm run self-check` 與 `hooks`、`check-docs`、`status-line`、`fences`、`section`、`decisions-index` 的測試：照指示不跑整包；這一輪的差異沒動到它們，只跑了 `roadmap-sync` 與 `roadmap-board` 兩個檔。
- 真的 `.githooks/pre-merge-commit` 加 `tools/hooks.ts` 整條：clone 沒裝相依，改用等價的 shell hook。靜態讀過 `tools/hooks.ts:29`，共用檢查的子行程沒有另給 env，`GITHEAD_*` 會帶下去；沒有實跑。
- K1 第 2 條路（GitHub 網頁進來的手寫列）用不經 hook 的 commit 模擬，沒有真的在 GitHub 上操作。
- 只 cherry-pick「再收尾」那一個 commit：衝突後沒有解到底，只確認會衝突。
- `merge-base --independent` 的指令列長度上限、cherry-pick／rebase 丟掉列的缺口：靜態推斷。
- GitHub Actions 的 Ubuntu 實跑、Pages 與驗收第 11 項：要 push、合併後才有。
- 白板的版面：這一輪的差異只動到版本號的比對，沒重看。

### Claude 回應

逐項核對：K1、K2 照回報的觸發條件寫成測試，修之前都先失敗（K1 擋在「合併進來的 … 的〈已完成〉有『| 2026-11-24 | 甲做完了 |』這一列，現在不見了」，和回報的訊息相同；K2 的類別測試擋在「換入口→換入口→收尾（合併）」）。分類照 code-quality `review.md`〈修正後收尾〉與 [D-207](../decisions.md#d-207-l2-的發現先分一定修可記限制交使用者選修法先收窄最後才加機制)。使用者 2026-11-21 同意修 K0～K2、再審一輪。

這一輪送審之後，Claude 自己另找到一項（K0）：比 `8a03736` 更早分岔、上線前開的分支把新的 `main` 併進來，`main` 在分岔之後手寫的〈已完成〉列對這個分支是另一邊帶進來的列，照 M1 只查格式與日期，就擋在「格式不是」。clone 模擬（工具 `0e84459`；`8a03736` 併入本分支當新的 `main`；分支從 `a0cd551` 開，衝突都取 `main` 那邊）重現；真的分支 `claude/poem-order-merged-docs`（從 `4ef9db3` 分岔）會碰到。那些列是 `main` 的歷史，不能照遷移步驟刪；本機合併沒有出口。

| 發現 | 分類 | 修法 | 動到什麼 |
|---|---|---|---|
| K0 比上線早分岔的分支併進新的 `main`，`main` 手寫的舊列被擋 | 一定修（真的分支會碰到，本機合併沒有出口） | 這邊 HEAD 是上線前的格式時，另一邊帶進來的列照收，不查格式與日期；真的合併時仍要都留著（丟掉照擋） | `checkDone` |
| K1 另一邊手寫的列既不能留、也不能刪 | 修（收窄；回報的第一種） | 這邊是新格式時，真的合併只要求另一邊工具格式的列留著：手寫的列留著一定擋在格式，照遷移步驟刪掉。這邊是上線前的格式時照舊全部要求 | `checkDone` 的 `Tally`、`missing` |
| K2 連換兩次入口 | 修（同一類的第 2 代，改成類別測試） | 從舊入口沿著已結束的下一站一路走（看過的入口不再看），其中一站在板上、〈等觸發點〉或有完成列（新的或另一邊帶進來的）就算換入口。M1 的六個例子改成整類的測試：另一邊對同一件工作的六種步驟（收尾、補一句、改成已結案、重新開工、換入口、改名），從進行中開始的每一種兩步（9 種），加上兩個三步的（收尾、重新開工、再收尾；連換兩次入口再收尾），每種都跑合併、squash 與併回 | `checkDone` 最後一段；M1 的測試 |
| K3 octopus 加 `--no-commit` 只認第一個；留下的 `SQUASH_MSG` | 記成已知的限制（機率極低；前一個只會多擋） | backlog 兩列；squash 那一列補上 cherry-pick、rebase | backlog〈已知的限制〉 |

〈順帶看到〉的 `claude/project-thread-sdo9aa`：合併後通知那個 session，把上線後的 `main` 併進來、解 `docs/roadmap.md` 的衝突時，把它自己加的那一列加回來。

## 第五輪的請求

只審第四輪 K0～K2 的修正與受影響的路徑；〈規格與優先順序〉〈回報與權限〉照上面。

審查者：照第四輪，由 Claude 開新的 Fable 5.2（high）子代理審，不給實作者的結論。第四輪之後還擋合併的發現，照 code-quality `review.md`〈修正後收尾〉交使用者決定。

- 審查對象：第四輪審的 `0e84459` 之後、到這份請求所在的 commit。一項發現一個 commit：K0 `64353c9`、K1 `e8ed4d7`、K2 `8eaadb3`；文件（backlog 的限制、任務說明、這份請求）在最後一個 commit。看全部：`git diff 0e84459 <這份請求的 commit>`；看一項：`git show <commit>`。
- 每一項對照〈Claude 回應〉（第四輪）的修法：修到了沒有、有沒有帶進新問題。這一輪沒有改 `tools/git-state.ts`；三項都在 `tools/roadmap-sync.ts` 的 `checkDone`：
  - K0：`legacy`（這邊 HEAD 是上線前的格式）時另一邊帶進來的列。
  - K1：`Tally` 的 `tool`、`missing` 的 `toolOnly`。
  - K2：最後一段的 `handedOn`；M1 的測試改成的類別測試。
- 請找新的組合，例如：上線前的分支把新的 `main` 併進來時丟掉自己手寫的列，或 `main` 的列在分岔後改過連結目標；另一邊有一列和 HEAD 的一列鍵相同、一邊是手寫的；下一站繞回舊入口、下一站是 D-ID 或不存在的檔、下一站在另一份 roadmap 又換了一次；類別測試沒涵蓋的步驟（兩邊都動了同一件工作、在〈等觸發點〉的工作）。

實作者自己選的做法（規格沒寫的）：

1. K0：這邊 HEAD 是上線前的格式時，另一邊帶進來的列不查格式與日期（那時 `main` 的列都是手寫的）；真的合併時仍要求另一邊的列都在，HEAD 的列照第二輪 N3 的設計不要求。
2. K1：「工具格式」用和格式檢查同一個 `DONE_CELL` 判斷；只在這邊是新格式時放寬。
3. K2：只沿著「已結束」的下一站走；下一站沒有狀態行、讀不到或還沒結束就停在那裡；看過的入口不再看。
4. K2 的類別測試：一件工作、六種步驟，產生從進行中開始的每一種兩步；三步的只加兩個（各對應一個已知的同類：第二輪 N5、第四輪 K2）。

驗證方式：

- 先寫會失敗的測試：K0 的「L2 K0」修之前擋在「格式不是」；K1 的「L2 K1」修之前擋在「合併進來的 … 這一列，現在不見了」；K2 改寫後的「L2 M1」修之前擋在「換入口→換入口→收尾（合併）」。
- 每個 commit 的 pre-commit 都通過（共用檢查與 tools 的完整檢查；沒改 hook 用的 `git-state.ts`，分派表跳過三個外掛）。
- `roadmap-sync` 的 19 個測試在 K2 的版本都通過（M1 的類別測試約 80 秒）；ESLint、tsc 通過；真的 repo 的 `node tools/roadmap-sync.ts --check`、`node tools/roadmap-board.ts --check`、文件檢查通過。
- clone 模擬（工具是 K2 版本的 `roadmap-sync.ts`；`8a03736` 併入 `e8ed4d7` 當新的 `main`，衝突都取 `main` 那邊）：從 `a0cd551`、`4ef9db3`（`claude/poem-order-merged-docs` 的分岔點）開的分支把新的 `main` 併進來都通過（工具 `0e84459` 在 `a0cd551` 擋在「格式不是」）；上線前開的分支在舊格式的 Cards roadmap 手寫一列，把新的 `main` 併進來通過，再併回新的 `main` 照舊擋在「格式不是」。
- 沒驗：真的 `.githooks` 在 clone 裡跑完整的 pre-merge-commit（改用 shell hook）；GitHub Actions 的 Ubuntu 實跑要 push 後才有；Pages 與驗收第 11 項要合併後才有。

## 第五輪的回報

Fable 5.2（high）子代理，2026-11-21，審 `d9af354`；約 32 分鐘、51 次工具呼叫。下面是回報原文，標題降兩級；兩處引用的訊息包成行內程式碼（裡面的連結會被文件檢查當成壞連結）。

### Fable 回報（原文）

狀態：通過

第四輪的 K0～K2 都修到了，K3 記成已知的限制合理；沒有 P1、P2。這一輪找到三項 P3（J1～J3），都已重現，發生機率極低或只是文件少一句，不擋合併。其中 J1 不是這一輪的修正帶進來的，是把類別測試往外延伸時碰到的既有問題。

- **待審 commit**：`d9af35437311d3420272b64a40b55ba55c013a85`，分支 `claude/workflow-impl-68afda`。
- **審查範圍**：`git diff 0e84459 d9af354`（K0 `64353c9`、K1 `e8ed4d7`、K2 `8eaadb3` 與文件 `d9af354`）與受影響的路徑：`tools/roadmap-sync.ts` 的 `checkDone`（`legacy` 分支、`Tally.tool`、`missing` 的 `toolOnly`、`handedOn`／`statusOf`）、`nextStations`、`doneKey`／`take`，`tools/tests/roadmap-sync.test.ts` 的 L2 M1 類別測試與 L2 K0、L2 K1，以及 `docs/agents/workflow.md`〈roadmap〉、backlog〈已知的限制〉三列、任務說明。`tools/git-state.ts` 這一輪沒改，只讀過。
- **環境與做法**：Windows 11、Git Bash、Node 24.13.0。重現都在系統暫存資料夾的 `mkdtemp` 小 repo（沒有掛 hook，改成每一步 commit 前與 `git merge --no-ff --no-commit`、`git merge --squash` 之後直接跑這個 worktree 的 `roadmap-sync.ts --check --staged --root <暫存 repo> --today 2026-11-25`），加一份 `git clone -s` 的 clone；結束前都刪了。worktree 的 `git status` 乾淨、HEAD 仍是 `d9af354`、分支沒換。
- **操作上的說明**：clone 裡有一次指令帶了 `git reset --hard`，被這個專案的 hook 擋下，沒有執行，改用 `git merge --abort`。clone 的第三個模擬（`claude/project-thread-sdo9aa`）因為我前一步直接改了索引，`merge --abort` 失敗、沒跑成，見〈沒驗的項目〉。

#### 跑了什麼

| 指令 | 結果 |
|---|---|
| `tools/` 裡單獨跑 `node --test --test-timeout=600000 tests/roadmap-sync.test.ts` | 19 個測試全過，0 失敗、0 跳過（約 327 秒） |
| 真的 repo：`node tools/roadmap-sync.ts --check`、`node tools/roadmap-board.ts --check`、`node check-docs.ts` | 都通過 |
| clone：`8a03736` 用 `--no-ff --no-commit` 併入 `d9af354` 當新的 `main`，跑 `--check --staged --today 2026-11-21` | 通過 |
| clone：真的分支 `claude/poem-order-merged-docs`（`b2f3f1c`，從 `4ef9db3` 分岔，舊格式的 `docs/roadmap.md` 有一列手寫的完成列）把新的 `main` 併進來 | 4 個檔衝突（含 `docs/roadmap.md`），都取 `main` 那邊後通過 |
| clone：從 `a0cd551` 開的分支加一個無關的 commit，把新的 `main` 併進來 | 沒有衝突，通過；`main` 在分岔後手寫的那一列（2026-11-21「三個外掛同一個 repo 的第二步 B…」）照收。從索引拿掉那一列再檢查：擋在「合併進來的 493370d 的〈已完成〉有…這一列，現在不見了」 |
| 小 repo K0：上線前的分支有自己手寫的列 X，`main` 分岔後手寫一列、上線、舊列改了連結目標、再用工具收尾一件 | 兩邊都留、丟掉自己的 X、舊列的連結目標留分支這邊的：通過。丟掉 `main` 工具寫的列、解衝突時改了 `main` 手寫列的字：擋 |
| 小 repo K0 接著併回 `main` | X 還在：擋在「格式不是」。刪 X、入口改已合併、狀態板加回、同步：通過。只刪 X、入口與狀態板照舊：通過 |
| 小 repo K1：另一邊同時有手寫的列與工具寫的列 | 兩列都留：擋在格式。刪手寫的、留工具的：通過。兩列都刪：擋（工具的列不見了） |
| 小 repo K1：另一邊把一列手寫的舊列重複了一次 | 照樣併進來：擋在格式。只留一列：通過 |
| 小 repo K2：p → t1 → p 繞圈（板上都沒有）；下一站是連到決策紀錄的連結、不存在的檔 | 都照擋，沒有卡住 |
| 小 repo K2：最上層的 p → Cards 的 t1 → t2 →（轉等觸發點）→ t3 → 收尾 → 補一句 → 重新開工 → 換回 p，每一步之後把另一邊併進功能分支 | 8 次都通過 |
| 小 repo K2：下一站的檔 `git mv` 改名；〈等觸發點〉的工作 w → w2 → w3 再收尾；另一邊刪掉手寫的〈等觸發點〉列 | 都通過 |
| 小 repo：類別測試的延伸，見下面〈實作者自己選的做法〉第 4 點 | 60 個序列、549 次檢查，1 個失敗（J1） |

#### 發現

##### P3 J1　同一天、同名、同一句完成、入口不同的兩列，鍵相同；新入口收尾的一般 commit 被擋（既有，不是這一輪引入）

**規範與設計｜已重現**（一般的 commit，和合併無關）。「這一輪之前就有」是靜態推斷：`doneKey` 與 `take` 在 `0e84459` 就是這樣，這一輪只多了 `tool` 欄。

- **觸發條件**：同一件工作同一天做了「收尾 → 重新開工 → 換入口 → 新入口收尾」，兩次的「完成」那一句一字不差、工作名稱也沒改。類別測試的 11 個序列沒有這一個；它是延伸出來的四步。
- **實際**：新入口收尾、同步之後 `--check --staged` exit 1，兩個訊息都指錯地方：
  - 「入口 docs/tasks/x.md 的狀態是『`已結案 → [任務](x-2.md)`』」（指向舊的那一列）；
  - 「入口 docs/tasks/x-2.md 已結束、HEAD 的狀態板或〈等觸發點〉有它，〈已完成〉卻沒有新的一列」（新的一列明明在）。
- **預期**：通過。第二次的完成那一句改一個字（「做完」→「做完了」）就通過。
- **原因**：`doneKey` 拿掉連結目標，兩列的鍵都是 `2026-11-25|**甲**：做完（已合併，[入口]）`。HEAD 只有一列，表裡排在上面的新列（x-2）先對走 HEAD 那一次，舊列（x）反而被當成新的列，照已經改成「已結案 →」的舊入口重驗。
- **影響**：照規範做的一步被擋，訊息指不出原因。不會弄壞資料。另一邊做同一串再合併、squash、併回都通過（兩列都算另一邊帶進來的）。
- **真實路徑**：會發生，機率極低：要同一天、同名、同一句、又換過入口。同一份入口重開再收尾（第二輪 N5）不受影響。
- **位置**：`tools/roadmap-sync.ts:322`（`doneKey`）、`:399`（`take`）、`:431`、`:492`。
- **建議**：可以延後，記進 backlog〈已知的限制〉（避開：第二次的完成那一句寫得不一樣）。要修的話是收窄：對 HEAD 的列時先找原文完全相同的，找不到才用拿掉連結目標的鍵。

##### P3 J2　另一邊工具格式、日期不對的完成列：真的合併時既不能留、也不能刪（K1 同一類剩下的一種）

**規範與設計｜已重現**（另一邊那一列用不經 hook 的 commit 放進去）。

- **觸發條件**：另一邊（新格式）有一列這邊 HEAD 沒有、格式是工具的、日期不是真實日期或晚於今天，用真的 `git merge` 併進來。
- **實際**：
  - 留著：「日期要寫成 YYYY-MM-DD 的真實日期（現在是『2026-11-3』）」；
  - 刪掉：「合併進來的 … 的〈已完成〉有『`| 2026-11-3 | **甲**：做完（已合併，[入口](tasks/a.md)） |`』這一列，現在不見了」；
  - 改成正確的日期：同一個「不見了」（鍵含日期）。
- **原因**：K1 的放寬只看格式（`DONE_CELL`）；格式對、日期不對的列仍然被要求留著。
- **影響**：合併沒有出口，和第四輪 K1 一樣。不會弄壞資料。
- **真實路徑**：只有那一列先繞過 hook 進了另一邊才會有（GitHub 網頁、快轉等，技術債 N13 那一類）；工具自己寫不出這種日期。機率極低。
- **位置**：`tools/roadmap-sync.ts:329`（`tool`）、`:419-420`、`:450`、`:458`。
- **建議**：可以延後。兩種擇一：`toolOnly` 改成「留著會通過另一邊那一段檢查的列才要求」（格式加日期，同一個判斷）；或在 N13 那一列技術債補上這個後果。

##### P3 J3　K0 之後，上線前的分支留著自己手寫的列併完新的 `main`，想在分支上先做遷移會被擋；規範沒寫要在哪一次合併做

**規格｜已重現**。

- **觸發條件**：上線前開的分支有自己手寫的完成列 X，把新的 `main` 併進來時留著 X（通過，X 在 HEAD 裡），之後在分支上的一般 commit 照 `docs/agents/workflow.md:97` 做遷移。
- **實際**：擋在「HEAD 的〈已完成〉有『| 2026-11-21 | 甲做完了（手寫 X） |』這一列，現在不見了：舊的列不刪也不搬…把它加回來」，和規範寫的「刪掉那一列」相反。第四輪 K1 的回報提過這一點，K1 的修正只處理了合併那一側。
- **走得通的時機**（都實測通過）：
  1. 把新的 `main` 併進來的那一次合併裡就做（刪 X、入口改已合併、狀態板留那一列、同步）；
  2. 之後用非快轉的本機合併併回 `main`，被「格式不是」擋下時做。
- **走不通的後果**（靜態推斷，沒有實跑）：分支併完新的 `main` 後，`main` 多半沒有新 commit，`git merge` 會是快轉，不經過 hook，X 就進了 `main`（N13 已記）。進去之後 `main` 自己也刪不掉（同一條 HEAD 規則）；在 X 進來之前開的分支，把 `main` 併進來要刪 X（K1 之後可以），併回 `main` 又要加回來。
- **真實路徑**：機率低。現在上線前開、還沒合併的分支只有兩條：`claude/poem-order-merged-docs` 手寫的那一列（2026-11-15 全詩順序卡）`main` 的 `docs/archive/roadmap-completed.md:79` 已經有，解衝突取 `main` 那邊就沒有了；`claude/project-thread-sdo9aa` 只在狀態板加一列。
- **位置**：`docs/agents/workflow.md:97`；`tools/roadmap-sync.ts:455`。
- **建議**：不擋合併。`workflow.md:97` 那一句補上時機（例如「在把新的 `main` 併進來的那次合併裡做，或併回 `main` 被擋時做；併完之後在分支上單獨刪會被擋」）；N13 那一列技術債可以補「已經進了 `main` 的手寫列」的後果。

#### 第四輪 K0～K3

| 項目 | 結果 | 說明 |
|---|---|---|
| K0 | 修到了 | clone 裡從 `a0cd551` 開的分支、真的 `claude/poem-order-merged-docs` 把新的 `main` 併進來都通過；丟掉 `main` 的列照擋。小 repo 裡 `main` 的列改過連結目標、分支丟掉自己手寫的列、`main` 有工具寫的列都符合設計。這條路上沒有找到「留也擋、刪也擋」的組合。殘留是 J3 |
| K1 | 修到了 | 「L2 K1」測試與小 repo：手寫的列刪掉放行、工具的列刪掉照擋、照遷移步驟做完通過；這邊是上線前的格式時仍然全部要求。殘留是 J2（日期不對的工具格式列） |
| K2 | 修到了 | 連換兩次到四次、跨 roadmap、經過〈等觸發點〉、繞回舊入口都通過；繞圈、下一站是 D-ID 或不存在的檔照擋。延伸的 60 個序列裡，合併、squash、併回沒有一個被擋 |
| K3 | 分類合理 | backlog 的三列（squash／cherry-pick／rebase 不要求留著、octopus 加 `--no-commit`、留下的 `SQUASH_MSG`）觸發點與影響和第四輪的回報一致；`git-state.ts` 沒改，這一輪沒有重跑 |

#### 實作者自己選的做法

1. **K0：這邊是上線前的格式時，另一邊的列不查格式與日期，真的合併仍要求都在**：合理。另一邊的列都是已經 commit 的，不會多放進新的東西；四種組合（這邊新／舊 × 另一邊新／舊）沒有互相打架。提醒一點：這個放寬只在 HEAD 是舊格式時有效。上線前的分支如果用 `git merge --squash` 把新的 `main` 拿進來、又丟掉 `main` 手寫的列（實測通過，squash 不要求留著），之後真的合併 `main` 時那些列會擋在「格式不是」。機率極低，squash 的限制那一列已經涵蓋。
2. **K1：用同一個 `DONE_CELL` 判斷，只在這邊是新格式時放寬**：合理。HEAD 有的手寫列仍由 HEAD 那一段要求留著，所以 `main` 原有的舊列不會因為這個放寬被併掉。少涵蓋的一種是 J2。
3. **K2：只沿著已結束的下一站走，沒有狀態行、讀不到、還沒結束就停，看過的不再看**：合理。下一站還沒結束又不在板上，照擋是對的（它該在板上）。連到決策紀錄的連結會被當成一站，但那份檔沒有狀態行，走到那裡就停，結果和不算一樣。
4. **K2 的類別測試：六種步驟的每一種兩步，三步的只加兩個**：合理，夠守住 M1 與 K2。我往外延伸跑了一次：
   - 多加一種步驟（進行中和等觸發點互換），共七種；每一種三步 55 個，加 5 個四步。
   - 每個序列做完後六種合併：功能分支只改無關的檔，和功能分支自己也開工又收尾一件（〈已完成〉兩邊都加列），各做合併、squash、併回。
   - 549 次檢查裡，合併那六種全部通過；唯一的失敗是 J1，在「另一邊每一步自己的 commit」那裡。
   - 沒涵蓋的是「兩邊都動了同一件工作」：那會在入口檔與狀態板衝突，結果取決於怎麼解，沒有系統地跑。

和規格的衝突：程式和 `workflow.md`〈roadmap〉、任務說明第 5 節、D-217 沒有互相矛盾。兩處文字可以更準，但不影響行為：`workflow.md:95` 的「合併時兩邊工具寫的列都要留著」沒寫這邊是上線前的格式時全部都要留；`workflow.md:97` 的遷移步驟沒寫時機（J3）。

#### 沒驗的項目與原因

- 完整的 `npm run self-check` 與其他測試檔（`roadmap-board`、`hooks`、`check-docs`、`status-line` 等）：照指示不跑整包；這一輪的差異只動到 `roadmap-sync.ts` 與它的測試，只跑了那一個檔。
- 真的 `.githooks` 加 `tools/hooks.ts` 整條、`GITHEAD_*` 的路徑：小 repo 沒有掛 hook，合併都用 `--no-commit` 之後直接跑檢查（那時有 `MERGE_HEAD`）。自動 commit 的合併走 `GITHEAD_*`，由既有的 L2 M1、N1 測試涵蓋（已通過）。
- 用 `0e84459` 的工具對照 K0、K1 修之前的行為：沒有跑（舊版的檔要放進 `tools/` 才跑得起來，不能動 worktree）；採用請求裡寫的修之前的訊息。
- clone 裡 `claude/project-thread-sdo9aa` 把新的 `main` 併進來：沒跑成（見〈操作上的說明〉）；第四輪跑過，這一輪的修正不影響它（它沒有手寫完成列，HEAD 是上線前的格式）。
- octopus、cherry-pick、rebase 方向：這一輪的差異和重播的種類無關，沒有重跑。
- J3 的快轉後果、J1「這一輪之前就有」：靜態推斷。
- GitHub Actions 的 Ubuntu 實跑、Pages 與驗收第 11 項：要 push、合併後才有。

### Claude 回應

第五輪通過，三項都是 P3，審查者建議都不擋合併。照使用者 2026-11-21 的決定，Fable 審通過就不再請 Codex。分類照 [D-207](../decisions.md#d-207-l2-的發現先分一定修可記限制交使用者選修法先收窄最後才加機制)：

- J1、J2 要改 `checkDone`。那是共用的高風險路徑，改了就要再審一輪 L2，而兩項的機率都極低、也不會寫壞資料，所以記下來，不在這次修。
- J3 只改文件。

| 發現 | 分類 | 處理 | 動到什麼 |
|---|---|---|---|
| J1 同一天、同名、同一句、入口不同的兩列，鍵相同 | 記成已知的限制（既有；要同一天換入口又寫一樣的一句） | 寫明觸發、影響與避開：第二次的「完成」那一句寫得不一樣。修法（對 HEAD 的列先找原文完全相同的）留在那一列的來源 | backlog〈已知的限制〉 |
| J2 另一邊工具格式、日期不對的列 | 併進 N13 那一列技術債（只有繞過 hook 才會有） | N13 那一列補上這個後果；N13 的完成條件（CI 跑完成列的核對）做到時一起消失 | backlog〈技術債〉 |
| J3 遷移步驟沒寫時機 | 改規範 | 〈roadmap〉的遷移那一句補上時機：在把新的 `main` 併進來的那次合併裡做，或用 `git merge --no-ff` 併回 `main` 被擋時做；併完之後在分支上單獨刪會被擋。N13 那一列補上「手寫的列進了 `main` 之後」的後果。另外照回報〈和規格的衝突〉，`workflow.md` 第 95 行補一句：這邊還是上線前的格式時，兩邊的列都要留著 | `docs/agents/workflow.md`、backlog〈技術債〉 |

回報〈順帶看到〉的兩條上線前開的分支：

- `claude/poem-order-merged-docs` 手寫的那一列，`main` 已經有；解衝突時取 `main` 那邊即可。
- `claude/project-thread-sdo9aa` 照第四輪的〈Claude 回應〉，合併後通知那個 session。
