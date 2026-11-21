# 工作流程上線：L2 獨立審查（給 Codex）

狀態：待審｜下一步：第二輪由 Fable 5.2（high）子代理審，通過就不再請 Codex｜等誰：Claude

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
