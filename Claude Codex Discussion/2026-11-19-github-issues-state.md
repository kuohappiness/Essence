# 開發狀態要不要搬到 GitHub Issues

狀態：雙方一致，待使用者決定（第一輪各自獨立回答，第二輪 Claude 交叉後改採 Codex 的建議）

[工作流程優化主文](../docs/plans/workflow.md)｜[D-214](../docs/decisions.md#d-214-工作流程一件事一個現在位置反方向由工具算)

## 先讀這裡

這是第一次照「多個 AI 第一輪各自獨立回答」的做法（使用者 2026-11-19 同意，還沒寫成 D-ID）：

- 第一輪只讀〈提問稿〉，以及它列的檔案與決定。**不要讀這份檔裡〈提問稿〉以外的段落**（第一輪結束前也不會有）。Claude 的第一輪答案已在呼叫你之前寫好、存在檔案外，等你交回後才一起放進來。
- 用〈回答格式〉回答。只讀不改：不要修改任何檔案，不要在 GitHub 開 Issue、留言或改設定。
- 第二輪才交叉評論，那時你會站在「不做」那一方反駁。

## 提問稿

### 要回答的問題

Essence 的開發狀態（哪些工作在進行、等誰、下一步、待辦、做完了什麼）現在寫在 repo 的 md 檔裡。**該不該把其中「常變動的狀態」搬到 GitHub Issues（加上標籤、里程碑、PR 連結），長期內容留在 repo？** 若該搬，範圍、時機、怎麼做；若不該，為什麼、現在的做法要不要改。也可以提出問題沒列到的做法。

使用者的原則（[D-177](../docs/decisions.md#d-177-先問會不會明顯更好優勢明顯代價解決得了就該做)）：有實質優勢、代價解決得了就做，工作量不是理由；好處很小的不用花力氣。每個選項都要和「不做」比較（[D-153](../docs/decisions.md#d-153-每個新決定與新任務先和不做比較)）。使用者要求本題**不考慮手機白板的功能**，只看文件管理的效率（白板可以之後另外處理）。

### 可以考慮的選項（只是起點，不代表排序）

- 甲：全部留在 repo，照 D-214 上線（狀態板、backlog 分上下兩部分、狀態板加文件檢查）。
- 乙：常變動的狀態層搬到 Issues：狀態板、backlog 的 v1 任務與待決問題、技術債表等；決定、規格、plans、任務說明、討論稿留在 repo。
- 丙：留在 repo，但「已完成」與「做完沒移出」由工具從任務說明的狀態行與已合併的 PR 算出來，不手寫。
- 其他你認為更好的。

### 現況與事實

請自己核對，數字附了怎麼算的。

- **狀態現在寫在哪**：`docs/roadmap.md`〈現在在哪裡〉狀態板（每件進行中的工作一列：狀態、下一步、等誰、入口）與〈已完成〉；`docs/backlog.md`（v1 任務、技術債、已知的限制、待決問題、第二階段）；`docs/progress-map.md`（功能地圖）。規則見 [D-141](../docs/decisions.md#d-141-文件架構入口只放狀態同一類資訊只維護一份)、[D-143](../docs/decisions.md#d-143-歸檔原則每類文件都有終點不設字數上限)、[D-214](../docs/decisions.md#d-214-工作流程一件事一個現在位置反方向由工具算)。
- **改 roadmap 的頻率**：`git log --no-merges` 1,987 個 commit 裡 641 個改到 `docs/roadmap.md`（約 32%，Claude 2026-11-19 量）。另一次量測（Fable，同日）：2026-10-20 之後改到它的 549 個裡，405 個既沒改 `docs/decisions.md` 也沒改程式。
- **狀態板長回來過兩次**：D-141 記的「現在在哪裡」從約 950 字長到 13,477 字；D-214 記的 10-27 清過一次，20 天後 7,174 字（3 倍），15 列裡 7 列在等觸發點。
- **平行工作**：常有好幾個 Claude session 同時工作，本機與雲端都有；雲端 session 只讀得到 repo，讀不到本機檔案（[D-212](../docs/decisions.md#d-212-claude-直接呼叫本機-codex任務開始時分本機或雲端)）；本機 session 之間用訊息協調（例如 D-ID 先預約）。規劃文件直接 commit 到 `main` 並 push。
- **commit 時的機械檢查**：pre-commit 跑文件檢查（連結與錨點、狀態行、技術債表的「補測：」與任務〈結果〉對照，[D-195](../docs/decisions.md#d-195-測試分兩類改不回來的做足其餘延後但不漏)）、金鑰掃描（secretlint）、本機路徑檢查；CI 再跑一次。見 `docs/agents/quality.md`〈檢查指令〉、`tools/check-docs.ts`。
- **repo 是公開的**（`kuohappiness/Essence`）。三個外掛之後會給其他家長、學生使用（還沒廣泛使用）。手機白板用 GitHub Pages。
- **以前的相關紀錄**（沒有一條正式比較過「開發進度用不用 Issues」）：
  - [D-014](../docs/decisions.md#d-014-文件重整)：v0 的討論看板連同產生器封存，理由是維護太重，進度改由路線圖呈現。
  - [D-119](../docs/decisions.md#d-119-程式品質的-skill-整併成通用的-code-quality)：刪第三方 skill 時寫明它們預設有 issue tracker，和本專案分工不同。
  - [plans/maintenance.md](../docs/plans/maintenance.md) 第 78 行：維修與問題回報不另開問題追蹤系統（使用者會碰到的流程不能要求 Git；技術債表已經是問題清單）。
  - D-212 的「曾考慮的做法」：貼成公開 repo 的留言會繞過 pre-commit 的掃描。
- **進行中的相關工作**：Cards 搬家第二步（[任務說明](../tasks/one-repo-step-2.md)）的 B 會把 `tasks/`、`Claude Codex Discussion/` 搬進 `docs/`（[D-213](../docs/decisions.md#d-213-任務與討論稿放進-docs外掛專用的放外掛的-docs)），D-214 的工具與檢查排在 B 合併之後。
- **另一個私人專案的做法**（給你參考機制，細節不在這個 repo）：狀態只記在 Issue 的標籤（範圍、想法／討論中／已決定、等擁有者、卡住）、里程碑（對應路線圖階段）、開關與連結的 PR；待辦、進行中、完成不貼標籤，由「有沒有未合併的 PR、怎麼關的」推算；PR 寫 `Closes #編號` 合併後自動關。標籤與里程碑的定義放 repo 裡用工作流程同步；Issue 不在 git 裡，所以另外做了每日備份與「標籤同步不刪使用中的標籤」的安全模式。那個專案建立才兩天，還沒有長期效果的證據。

### 要特別判斷的

- 公開 repo 的 Issue：陌生人能留言、文字不經 pre-commit 掃描。這兩點有沒有可靠的解法（例如 GitHub 對公開 repo 的 Issue 是否有金鑰掃描、用 `--author` 只讀擁有者開的、互動限制），哪些解不了。
- 本機 Codex（沙箱、read-only）、本機 Claude、雲端 Claude 各自怎麼讀寫 Issue；Essence 的雲端 session 能不能寫 Issue 沒有實測過。
- Issue 裡連到 repo 檔案的網址不受文件檢查保護；第二步 B 會搬動大量檔案。
- D-214 哪幾點會被取代、哪幾點仍需要。
- 若要做，和第二步 A、B 的先後。

### 回答格式

- 第一行：`第一輪：獨立回答（Codex，<模型>、<推理等級>，<日期>）`
- 三行摘要
- 建議（選哪個選項或你的新選項；範圍、時機）
- 理由（附數字與怎麼算的）
- 風險與解法（標出解不了的）
- 替代方案與它們輸在哪
- 把握程度（高／中／低，和原因）
- 缺少的資訊（哪些事實你查不到、會改變結論的）

## 第一輪：Claude（獨立回答，寫於呼叫 Codex 之前）

第一輪：獨立回答（Claude，claude-opus-5-5，2026-11-19；寫於呼叫 Codex 之前，Codex 交回前沒有放進討論稿）

**三行摘要**

1. 建議乙的縮小版：狀態板與 backlog 的 v1 任務、待決問題搬到 Issues；技術債表、已知的限制與所有長期內容留在 repo。
2. 主要理由是平行 session 與狀態 commit：約三分之一的 commit 在改 roadmap，多數只是狀態；Issue 各改各的、PR 合併自動關，「已完成」不用寫。
3. 時機在第二步 B 合併之後，和 D-214 的工具一起做；先實測雲端 session 與本機 Codex 讀寫 Issue，實測不過就退回丙。

**建議**

- 範圍：狀態板每一列 → 一張 Issue（標籤：外掛範圍、等誰；里程碑：v1 階段）；backlog 的 v1 任務與待決問題 → Issue；「已完成」由已關閉的 Issue 與已合併的 PR 推算。技術債表留在 repo（它和任務〈結果〉在 commit 時對照，D-195）；已知的限制、決定、plans、任務說明、討論稿、progress-map 留在 repo。
- AI 讀法：開工用腳本 `gh issue list --author <擁有者> --state open` 只列標題與標籤，取代讀〈現在在哪裡〉。
- 時機：B 合併後；先做兩個探針（雲端 session 開關 Issue、本機 Codex 讀 Issue），都通過才搬。
- D-214：第 4 點的 roadmap 部分、第 7 點狀態板檢查、第 6 點的「已完成」被取代；第 1～3、5、8～12 點照舊（backlog 的第二階段仍分上下兩部分）。

**理由**

- 641／1,987 個 commit 改到 roadmap；Fable 量到 10-20 之後 549 個裡 405 個沒改決定或程式，多是狀態。搬走後這些 commit 與它們的衝突都沒了。
- 狀態板兩次長回來，根源是手寫的列只在尾巴全收完才離開；Issue 關閉就離開，不靠檢查擋。
- 一張 Issue 就是 D-214 說的「一件事一個現在位置」，不用另做「→ 下一站」對狀態層的追蹤。

**風險與解法**

- 公開 repo 陌生人留言：腳本只讀擁有者開的 Issue 與擁有者的留言；必要時開互動限制。可解。
- Issue 文字不經 pre-commit：GitHub 對公開 repo 的 Issue 有金鑰掃描（要核實）；學生姓名這類私人資訊掃不到，靠「Issue 不寫學生資料、只寫工作狀態」的規則。**部分解不了**，要靠規則。
- Issue 連到 repo 檔案的網址不受文件檢查：Issue 只連 D-ID 與任務檔名，B 之後才搬，搬後路徑穩定；或在 CI 加一支掃 Issue 連結的檢查。可解。
- 狀態不在 git：要備份（用 `gh` 匯出進 repo 或排程備份）。可解，多一個工具。
- 本機 Codex 讀不到：Codex 的工作是查核，不需要開工狀態。影響小。
- 雲端 session 寫不了 Issue：沒實測，實測不過就退回丙。

**替代方案**

- 甲：狀態 commit 與平行衝突照舊，狀態板靠檢查擋，屬於治標。
- 丙：解掉「已完成」手寫，但狀態板仍是一個多 session 共改的檔。比甲好，是乙不可行時的退路。

**把握程度**：中。最大的不確定是雲端 session 寫 Issue 的能力，以及公開 Issue 帶出私人資訊的實際機率。

**缺少的資訊**：Essence 雲端 session 的 GitHub 工具權限；GitHub 對 Issue 的金鑰掃描範圍；狀態 commit 實際造成過幾次衝突（沒量）。

## 第一輪：Codex（獨立回答，原文；本機路徑的連結改成相對路徑）

> 第一輪：獨立回答（Codex，gpt-6.2-sol、high，2026-11-19）
>
> - **建議選甲。** Cards 搬家第二步 B 合併後，上線 D-214 的文件流程與檢查。若收尾仍常漏，再把丙的唯讀對照加進來。
> - `main` 的 1,987 個非合併 commit 中，641 個改到 roadmap。這證實 roadmap 改得頻繁。現有資料還無法估出搬到 Issues 能省下多少人工、交接時間或衝突。
> - 如果 D-214 上線後，純狀態更新仍經常造成衝突或交接延誤，再試少量可由單一 PR 結案的新工作。技術債、實機驗收、發布與待決問題繼續由 repo 文件追蹤。
>
> ## 建議
>
> **A 照原排程，B 接著搬文件，B 合併後再上線 D-214。** 開工先讀狀態板，活躍列只寫目前狀態、下一個動作、等誰和入口。只有等條件成熟的列移到〈等觸發點〉，已做完的工作移到〈已完成〉，定案則沿 D-ID 查。backlog 分〈待處理〉與〈已轉出〉，轉出時保留原意、來源與舊錨點。已完成的任務、討論稿、規格及驗收證據留在各自的文件。這直接減少 session 每次開工要重讀的文字，也讓同一次 Git 更新可以一起核對狀態、來源和驗收。 [第二步任務說明〈B｜文件〉](<../tasks/one-repo-step-2.md>)（第 219 行）、[D-214](<../docs/decisions.md>)（第 6185 行）
>
> D-214 上線時，有兩個具體邊界值得寫進驗收。第一，狀態檢查應看**整件工作的目前狀態**。`0.6.0` 已完成幾個關卡，也已有修正 PR 合併，但發布仍在等 iPhone 驗收。第二，現行檢查仍限制〈已完成〉最多 10 列。D-214 取消往封存搬移時，需要同步調整這條檢查，否則第 11 列會被擋。若之後還有漏收尾，再先做丙的唯讀清單，找出「活躍列連到已結案任務」或「任務狀態與已知 PR 結果不一致」的候選，由整合者核對。 [發布清單](<../tasks/release-0.6.0.md>)（第 3 行）、[現行列數檢查](<../tools/check-docs.ts>)（第 207 行）、[D-214 第 5、7 點](<../docs/decisions.md>)（第 6199 行）
>
> ## 理由與查核證據
>
> 1. **改動頻率已重現，搬遷收益仍待量。** 基準是本機 `HEAD`、`main` 與 `origin/main` 一致的 `fa9d4c9bf217621790f005568fe48ae21f1bc69b`。用 `git rev-list --count --no-merges <SHA>`，再加上 `-- docs/roadmap.md` 重算，得到 **641／1,987（32.3%）**。另以台北時間 2026-10-20 00:00 起，用 `git log --no-merges --name-only` 按 commit 分組。557 個碰到 roadmap，423 個未碰 `docs/decisions.md`，其中 397 個只改 Markdown，採用副檔名判準時有 407 個未碰 JS／TS、CSS、HTML、Python、Shell、PowerShell 或 YAML。557 個裡只有 27 個只改 roadmap。較早的 `137967f` 可重現分母 549，同一副檔名判準得到 401，提問稿的 **549／405 未能成對重現**。需要原量測的截止 commit、起算時間與程式檔判準才能精確對照。這些數字量的是檔案共變動頻率，無法換算為可省掉的 commit 數，也沒有量到多少時間花在重複整理或解衝突。 [查核基準](https://github.com/kuohappiness/Essence/commit/fa9d4c9bf217621790f005568fe48ae21f1bc69b)、[較早快照](https://github.com/kuohappiness/Essence/commit/137967f)
> 2. **兩次膨脹都能從歷史看到，部分原敘述是約數。** 用 `git show <SHA>:docs/roadmap.md` 取快照，從〈現在在哪裡〉標題算到下一個二級標題前，換行統一成 LF，以 Unicode 碼點計。D-099 時的 `0a1b47b` 是 **922**，`576edae` 是 **13,477**。10-27 清理提交 `8e4fde9` 是 **1,508**，11-19 的 `2710283` 是 **7,174、15 列**，基準則是 **7,324、16 列**。以這兩個可定位的快照算，第二次是約 **23 天、4.8 倍**。15 列裡，說明書開工 2、觸發點 1、下一版 1、新教材 3，共 7 列，若也把「額度」算成條件就是 8 列。條件列和工作經過都擠在入口，是目前能直接處理的成本。基準的〈已完成〉也確實收了 D-214、D-213 等尚待落地的決定。 [D-141](<../docs/decisions.md>)（第 3549 行）、[10-27 清理](https://github.com/kuohappiness/Essence/commit/8e4fde9)、[7,174 字快照](https://github.com/kuohappiness/Essence/commit/2710283)、[已完成表](<../docs/roadmap.md>)（第 59 行）
> 3. **技術債表已有可執行的保證。** 在 Node `v24.13.0` 執行 `node tools/check-docs.ts`，工作樹檢查通過，掃到 **372 個 Markdown、7,738 個連結、5 列待補測／補做**。程式碼也確認，暫存模式會把本次改到的結案任務〈結果〉和對應 backlog 的技術債列名核對。本輪實跑的是工作樹模式。整張技術債表搬到 Issues 時，現有核對會找不到對應列。要保留 D-195 的保證，就得另外驗證 Issue 是否存在、觸發點與完成條件是否齊全，以及 v1 結案如何清點。D-014 記錄了自製看板的維護負擔，D-119 與維修規畫記錄了技術債的用途和使用者回報流程。這些是現行設計的依據，三份文件都未做本題的開發狀態效率比較。 [文件檢查](<../tools/check-docs.ts>)（第 314 行）、[D-195](<../docs/decisions.md>)（第 5521 行）、[D-014](<../docs/decisions.md>)（第 368 行）、[D-119](<../docs/decisions.md>)（第 2856 行）、[維修規畫](<../docs/plans/maintenance.md>)（第 78 行）
>
> ## 風險與解法
>
> - **公開互動可局部控制。** GitHub 連接器確認 Essence 是公開 repo，預設分支是 `main`。`gh issue list --author kuohappiness` 可篩出由擁有者開立的 Issue，讀取時還要明確選欄位，省略留言。逐張鎖定可限制誰能留言，仍可公開閱讀。全 repo 的互動限制也會影響開 Issue、開 PR 等行為，最長六個月後到期。**目前沒有找到適合長期使用、又能讓公開 repo 的 Issues 只供維護者開立和留言的設定。** 如果試行，AI 可只讀指定作者或核准身分的 Issue 欄位，外部留言另由維護者處理。 [Essence](https://github.com/kuohappiness/Essence)、[`gh issue list`](https://cli.github.com/manual/gh_issue_list)、[鎖定對話](https://docs.github.com/en/communities/moderating-comments-and-conversations/locking-conversations)、[互動限制](https://docs.github.com/en/communities/moderating-comments-and-conversations/limiting-interactions-in-your-repository)
> - **GitHub 會掃描公開 Issue 裡支援的憑證，發文前的同等保護仍待驗證。** 官方把 Issue 的描述、留言及歷史 Issue 標題列入 secret scanning。Push protection 的 REST 文件明列建立 blob、建立或更新檔案，未列 Issue 的建立、編輯與留言端點。試行時可以把內容縮到公開任務名、固定狀態欄位與連結，受控寫入工具發送前可以沿用掃描。**直接在 GitHub 網頁、CLI 或其他入口發文，仍會繞過 Essence 的 pre-commit**。本機路徑、私人學習資料和未獲授權教材也超出憑證掃描的保證範圍。 [GitHub secret scanning](https://docs.github.com/en/code-security/concepts/secret-security/secret-scanning)、[REST push protection](https://docs.github.com/en/code-security/concepts/secret-security/push-protection-from-the-rest-api)、[Essence 檢查指令](<../docs/agents/quality.md>)（第 31 行）
> - **三種 session 的存取能力要分開驗。** **本機 Codex**：本輪 `gh issue list` 和 `gh repo view` 回 HTTP 401，`gh auth status` 回本機登入憑證無效。另經 GitHub 連接器查到 repo，Issue 搜尋成功回傳空清單。這證實本輪有連接器的唯讀路徑，實際 Issue 內文讀取未取樣。**本機 Claude**：可走已授權的 `gh`／API，需在 Claude 實際環境確認登入、工具授權及目標 repo 的寫入權限。**雲端 Claude**：專案已記錄可推 `claude/` 分支及開 PR，Anthropic 也記載雲端 Git 驗證由代理處理。Issue API 是否可達、有無適用憑證、能否建立、更新與結案，均**待驗證**。公開 REST 的讀取可匿名，寫入涉及對應授權。若雲端最後只能請本機或使用者代寫，應把這段交接算進成本。 [本機或雲端](<../docs/agents/quality.md>)（第 20 行）、[Claude 雲端環境](https://code.claude.com/docs/en/claude-code-on-the-web)、[GitHub Issues REST API](https://docs.github.com/en/rest/issues/issues)
> - **搬家會切斷指向舊 `blob/main` 路徑的外部連結。** `check-docs.ts` 從受 Git 追蹤的檔案取 Markdown，並略過 HTTPS 等外部網址。B 有針對 repo 內受影響連結的搬移驗收，也替部分舊二級錨點留入口，Issue 內的舊連結在這些檢查之外。若日後試行，B 合併後再建立指向現行文件的連結。歷史證據用固定 commit 網址，現行規格用搬完的路徑。若現行連結需要自動驗證，應另外檢查 Issue 內的目標。 [檢查程式](<../tools/check-docs.ts>)（第 343 行）、[B 的舊錨點與搬移規則](<../tasks/one-repo-step-2.md>)（第 247 行）、[GitHub 永久連結](https://docs.github.com/en/repositories/working-with-files/using-files/getting-permanent-links-to-files)
>
> ## 替代方案與取捨
>
> - **不做，照現在寫。** 工作流最熟悉，代價已有兩次歷史證據。每次開工反覆讀工作經過，已定案、已合併和已交付也容易混在同一個入口。甲保留現有 Git 流程，增加分區與可在 commit 時執行的檢查。 [D-141](<../docs/decisions.md>)（第 3549 行）、[D-214](<../docs/decisions.md>)（第 6185 行）
> - **乙，搬整個常變動狀態層。** 若平行 session 多半在更新不同工作，各張 Issue 能減少同一份 Markdown 的編輯衝突。標籤與里程碑可查詢，`Closes #編號` 可在 PR 合併到預設分支時結案。收益最大的是一個 PR 就交付的工作。未開 PR 的調查、等使用者決定、等實機與發布需要另外記錄，合併多批的工作也要指定哪一步才算完。同一張 Issue 仍可能被兩個 session 同時更新。全面搬遷會取代 D-214 **第 4、7 點中已搬項目的 Markdown 分區與活躍列檢查，以及第 5 點的完成記錄方式**。仍需要**第 1–3 點**的流程規範、唯一狀態來源和文件追溯，以及**第 5、8–10 點**的 D-ID 索引、現行規格查詢與新舊分界。跨到 Issue 的連結還需定義工具如何追蹤。 [D-214](<../docs/decisions.md>)（第 6185 行）、[GitHub 的 Issue／PR 連結規則](https://docs.github.com/en/issues/tracking-your-work-with-issues/using-issues/linking-a-pull-request-to-an-issue)
> - **丙，從任務狀態行和 PR 推算完成。** 適合先做唯讀核對。有真實的不一致可供驗收：roadmap 記載 AI 製卡第 2 批已合併 PR #16，任務檔頭還寫實作完成、Windows 已測和舊分支，同時仍有 iPhone 後續。只讀任務檔頭會漏掉合併，只讀 PR 會漏掉待驗收。待決、等觸發及下一步仍需要甲的入口。 [roadmap 第 2 批](<../docs/roadmap.md>)（第 28 行）、[第 2 批任務說明](<../tasks/ai-cards-deepen.md>)（第 3 行）
> - **B 後小範圍試行。** 如果甲上線後仍持續有純狀態更新的衝突或接手延遲，可用接下來 3–5 件能由單一 PR 結案、新開且可公開的任務試行。這幾件的即時狀態由 Issue 管，repo 任務說明記規格與驗收，開工入口放一個查詢連結。量每次更新耗時、衝突或漏接手的次數、代寫次數、錯關與壞連結。量出明顯收益再擴大，試行結束若回 repo，只需把少數還活躍的狀態帶回。提問稿所述的私人專案只有兩天經驗，可借用標籤與 PR 的機制，長期維護成本留待實測。
>
> ## 把握程度
>
> **中。** 現有讀寫成本、文件檢查的保障、B 的搬移順序與 PR 結案的語意都有直接證據，足以決定先上線甲。甲上線後的剩餘成本，以及 Issues 在 Essence 三種工作環境的實際維護成本，都還缺實測。
>
> ## 缺少的資訊
>
> - **會改變結論的是 D-214 上線後的交接紀錄。** 如果活躍列縮短後，主要成本仍是多人修改同一檔、等 push 或找不到最新下一步，就值得啟動 Issues 試行。若主因是同一個結果要抄到 roadmap、任務說明和進度地圖，先用丙找可省掉的重複寫入。
> - **待驗證**：本機及雲端 Claude 實際使用的 GitHub 身分與 Issue 寫權限、Essence 的 Issues 啟用與互動設定、Issue 發文前是否有額外阻擋、搬家後 Issue 連結驗證，以及自動結案與退回流程。這輪未建立或修改 Issue、未改設定、未寫檔。文件檢查只跑了唯讀工作樹模式，暫存模式及完整 `npm run check` 未跑。
> - 首行的模型與推理等級依討論稿呼叫的 repo 預設填寫。本輪未取得可確認有無呼叫端覆寫的執行資訊。 [Codex 呼叫設定](<../tools/codex.ts>)（第 24 行）
## 第二輪：Claude 的交叉評論（2026-11-19）

讀了 Codex 第一輪後，**我改採 Codex 的建議（甲，加觸發點與試行條件）**，理由是它指出的三點我在第一輪沒算到：

1. **Essence 的工作大多不是「一個 PR 就結案」**：多批合併、等 iPhone 實機、等使用者決定、發布關卡（`0.6.0` 已合併修正 PR 但仍在等實機）。`Closes #編號` 自動結案只適合單一 PR 的工作，我第一輪寫的「已完成不用寫」高估了。
2. **我引用的「405 個純狀態 commit」量的是檔案一起被改的次數**，不是搬走後能省下的 commit 或時間；Codex 重算也無法成對重現 549／405。乙的收益目前沒有量到。
3. **公開 repo 沒有長期可用、只讓維護者開 Issue 與留言的設定**（互動限制最長六個月）；本機 Codex 的 `gh` 這輪回 401。乙的前提有兩項還沒驗證。

我仍保留的看法：

- **平行 session 共改 `roadmap.md` 是真實成本**，只是沒量過。D-214 上線後量交接與衝突，數字出來再決定要不要試 Issues，這正是 Codex 的觸發點。
- **丙先做成唯讀核對**，不直接自動產生〈已完成〉：Codex 舉的實例（AI 製卡第 2 批 roadmap 寫已合併 PR #16，任務檔頭還是舊狀態）說明任務狀態行目前不夠可靠，自動產生會把錯的狀態顯示到白板上。這一點和 Fable 的評估（〈已完成〉改由工具從任務狀態行產生）不同，請使用者看。

Codex 第一輪也找到兩個 D-214 上線時要處理的邊界，我同意寫進 D-214 的驗收：

- 狀態板檢查看**整件工作**的狀態，不是某一個 PR 或關卡合併了就算做完。
- 現行文件檢查限制〈已完成〉最多 10 列；D-214 取消搬去封存時要同步改這條，否則第 11 列會被擋。

雙方一致，不再跑 Codex 第二輪（週額度剩 22%）；第二輪原本要請 Codex 站「不做」那一方，Codex 第一輪的結論已經是較保守的那一方。

## 請使用者決定

兩邊一致的建議，以及和 Fable 評估不同的地方：

1. **狀態留在 repo，照 D-214 上線；Issues 先不搬，設觸發點。** D-214 上線後，若純狀態更新仍常造成衝突、等 push 或接手找不到最新下一步，就用接下來 3～5 件能由單一 PR 結案、可公開的新任務試行 Issues，量更新耗時、衝突、代寫、錯關與壞連結，有明顯收益再擴大。
   - Claude：第一輪建議乙的縮小版，看到 Codex 的三點後改採甲。不採用乙的代價：平行 session 共改一個檔的成本照舊，要等量到數字。
   - Codex：甲；乙的收益沒量到、多批工作與公開 repo 的前提沒解。不採用甲的代價：狀態板仍靠檢查擋，屬於治標。
2. **丙的做法**：先做唯讀核對清單（列出「活躍列連到已結案任務」「任務狀態與 PR 不一致」的候選，由整合者核對），還是照 Fable 直接由工具產生〈已完成〉？
   - Claude、Codex：先做唯讀核對；任務狀態行目前不夠可靠。
   - Fable：直接產生，roadmap 不再手寫〈已完成〉。不採用的代價：〈已完成〉仍要手寫一列。
3. **D-214 的驗收加兩條**（狀態板檢查看整件工作；〈已完成〉10 列上限的檢查跟著改）。
