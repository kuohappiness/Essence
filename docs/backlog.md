# Essence｜跨外掛的 backlog

更新：2026-11-20｜狀態：三個外掛共用的部分；2026-11-20 拆開（[D-208](decisions.md#d-208-三個外掛在同一個-repo-開發每個外掛有自己的資料夾) 第 8 點，第二步 B）：這裡只放共用工具的技術債與已知的限制、repo 結構；Cards 的任務、技術債、待決問題與第二階段清單搬到 [Cards 的 backlog](../apps/Cards/docs/backlog.md)。搬走的每一節留標題與一行轉往新頁。

收錄不等於採用。每項保留原意與來源。分〈待處理〉〈已轉出〉兩區：一項需要展開、談成決定或做成任務時，搬到〈已轉出〉，下一行寫「→ 下一站（日期）」；開工只讀〈待處理〉（[工作流程規範〈backlog〉](agents/workflow.md#backlog)、[D-214](decisions.md#d-214-工作流程一件事一個現在位置反方向由工具算) 第 4 點）。技術債做完就刪那一列（[D-143](decisions.md#d-143-歸檔原則每類文件都有終點不設字數上限)）。

## 待處理

### 技術債

共用工具（最上層 `tools/`、分派表、hook 與 CI）與 repo 結構的技術債；每個外掛的在自己的 backlog。

開始一件工作或改到相關區域前，先看這張表；觸發點到了，連同完成條件一起帶進那次工作（[D-119](decisions.md#d-119-程式品質的-skill-整併成通用的-code-quality)）。處理完刪掉那一行，修正與驗證寫在那件工作的入口（任務說明的〈結果〉）；roadmap 的〈已完成〉由工具從入口產生（[D-217](decisions.md#d-217-狀態只寫在入口狀態板與已完成由工具產生)）。延後的測試開頭寫「補測：」、延後的功能寫「補做：」，開發空檔或額度有餘時挑來補，v1 結案前清空：補完，或使用者明確同意留到第二階段（[D-195](decisions.md#d-195-測試分兩類改不回來的做足其餘延後但不漏)）。

| 項目與影響 | 觸發點 | 完成條件 | 來源 |
|---|---|---|---|
| 外掛只改文件也跑完整檢查：Capture、Mindboard 在 `apps/Capture/`、`apps/Mindboard/` 底下改任何檔（只改文件也算），commit 與 CI 都跑那個外掛的完整 `npm run check`；現在它們的檢查只印一行，不花時間（Cards 的部分在第二步做完：[§A3](tasks/one-repo-step-2.md#a3-分派表toolsdispatchts) 定了相關測試，B 之後只改文件也只跑相關測試） | 某個外掛的 `npm run check` 在本機超過 1 分鐘 | 替那個外掛定「相關測試」的找法與登錄方式（測試讀到哪些檔要寫得出來），分派表（`tools/dispatch.ts`）加上那個外掛的相關測試跑法與案例 | [三個外掛併進同一個 repo 第一步 §10](tasks/one-repo-step-1.md#10-技術債) |
| 補做：查詢工具的現行寫在只算有連結的引用：`node tools/decisions-index.ts D-xxx` 的「現行寫在」只比對字串 `D-xxx`，沒分辨是依據還是只是提到，可能多列和規則無關的出處；多列的人看了跳過，查無引用時照實印「沒有規範文件引用」 | 查詢時列出的出處有一半以上和規則無關 | 只算有連結的引用，或排除〈曾考慮的做法〉這類段落；測試加一份只提到、沒有連結的規範文件 | [工作流程上線〈技術債〉](tasks/workflow-impl.md#技術債) |
| 〈已完成〉的核對只在本機的 hook：GitHub 上合併 PR、快轉、沒衝突的 cherry-pick、rebase 與 `git revert` 都不經過 pre-commit／pre-merge-commit；CI 的 `roadmap-sync --check` 是 HEAD 比自己，手寫或刪掉的〈已完成〉列可以進 `main`（狀態板和入口對不上，CI 照擋）。進去之後的後果：手寫的列在 `main` 刪不掉（是 HEAD 的舊列），比它早開的分支併 `main` 進來要刪、併回去又要加回來；繞過 hook 進了某個分支、格式對但日期不對的列，把那個分支用 `git merge` 併進來時留也擋、刪也擋 | 第一次在 GitHub 網頁上解〈已完成〉的衝突，或合併工作流程上線前開、帶手寫〈已完成〉列的分支 | CI 在分支 push 與 PR 時，拿和 `main` 的合併基點當比較對象跑完成列的核對（日期只查不晚於今天）；測試加一個分支手寫完成列、CI 擋下的案例 | [工作流程上線的 L2 第二輪](tasks/workflow-impl-review.md#第二輪的回報) N13；`git revert` 是[第三輪](tasks/workflow-impl-review.md#第三輪的回報)補的，進去之後的後果是[第五輪](tasks/workflow-impl-review.md#第五輪的回報) J2、J3 補的 |
| 補測：雲端設定第 ① 件（PR #51 改的 `cloud-setup.mjs`，多裝 `packages/ai-client`）：新開的雲端 session 讀自己的開場訊息，hook 有沒有跑還沒看到；專案討論串開的 session 不載 repo 的 hook，驗不了。第 ② 件（乾淨 worktree 照雲端條件跑一次 hook）已過，所以 hook 本身會跑；沒驗的是雲端 session 開場時有沒有叫到它 | 下一次在 claude.ai/code 開 Essence 的雲端 session（不是專案討論串） | 那個 session 的開場訊息有「雲端環境設定：」那一段，`packages/ai-client` 一行是「npm ci 完成」或「鎖檔沒變，跳過」，`core.hooksPath` 是 `.githooks`，之後的指令用 Node 24；原文寫進[AI 連線模組〈結果〉](tasks/ai-client.md#結果) | [AI 連線模組〈結果〉](tasks/ai-client.md#結果)（使用者 2026-11-26 選合併後驗） |

### 已知的限制

共用工具的已知的限制；每個外掛的在自己的 backlog。

L2 找到、發生機率極低、這次不修的問題（[D-202](decisions.md#d-202-l2-的發現先估發生機率極低的記成已知的限制)）。接受它、不排時程；之後有空想修再修，修好就刪掉那一列。和技術債分開：技術債有觸發點，到點就要做。

| 限制 | 發生條件 | 影響與避開 | 來源 |
|---|---|---|---|
| AI 連線套件的費用估計，寫進快取只照預設期限的價 | 呼叫端用 `extraBody` 開了更長的快取期限（OpenAI 的 12 小時、Anthropic 的 1 小時），服務回報的寫入 token 照目錄唯一的 `cacheWrite` 價算；Cards 現在不開 | 估計偏低（審查報告照 OpenAI 官方的倍率算，12 小時的例子少一半；倍率沒另外查）。費用本來就標「照牌價估計」。避開：要開長期限時，在目錄的價格加上那個期限的寫入價（之後再加欄位） | [AI 連線套件的 L2](<Claude Codex Discussion/2026-11-25-ai-client-l2.md>) 第二輪 延續 R5 |
| AI 連線套件（`packages/ai-client`）連不上時照樣重送，分不出請求送到了沒有 | 服務已經收到請求、開始做，回應標頭到之前連線斷掉；標準的 `fetch` 只丟 `TypeError`，分不出是沒連上還是送到才斷 | 同一個請求做兩次、可能付兩次錢。OpenAI、Anthropic 與 Gemini Flash-Lite 收到請求就先回標頭（冒煙測試 2026-11-27 量到 0.6～3.1 秒）；Gemini 3.8 Flash 想完才回標頭（116～177 秒），這一段長得多；回應標頭逾時已經不重送（L2 R7）。避開：沒有，要的話呼叫端把 `maxAttempts` 設成 1 | [AI 連線套件的 L2](<Claude Codex Discussion/2026-11-25-ai-client-l2.md>) 第二輪 延續 R7 |
| 金鑰掃描的預設模式（`npm run check`、CI）讀工作樹：Git 取出檔案時的轉換會改到掃的內容 | `.gitattributes` 對含金鑰的文字檔設了 `working-tree-encoding`（例如 UTF-16）或 `filter`，而且這個 commit 沒經過 pre-commit（在 GitHub 網頁上直接改、沒裝 hook 的 clone）；這個 repo 現在只有 hook 的換行規則 | CI 讀 checkout 出來的檔，轉成 UTF-16 或被 filter 改過的金鑰對不上規則，CI 不擋。經過 pre-commit 的 commit 照常擋（`--staged` 讀索引的 blob，L2 R7）。避開：不對可能含金鑰的文字檔設編碼或 filter | [三個外掛併進同一個 repo 第一步的 L2](<Claude Codex Discussion/2026-11-18-one-repo-step-1-review.md>) R7 的同一類、這次不改的（機制和 R7 相同，推斷，沒在 CI 實測） |
| 分派表找入口相依時，區塊註解夾在 `require`／`import` 與括號或路徑之間，或區塊註解裡有不成對引號的 `from '…`，會少認那個相依 | 入口（hook、`check.yml`、外掛 scripts 叫的 `tools/` 檔）或 Cards 的測試檔這樣寫（`require /* … */ ('./x')`），之後只改它載入的下游工具或經 helper 讀的文件；現在的入口與測試都沒有這種寫法 | 該跑的外掛檢查被跳過（入口那一種 pre-commit 與 CI 都跳過；Cards 測試那一種 CI 照跑 Cards 的完整檢查）。入口那一種，`tools/tests/dispatch.test.ts` 的語法樹驗收在加入這種接線的 commit 會失敗。避開：註解不要夾在 `require(` 與路徑中間 | [三個外掛併進同一個 repo 第二步 A 的 L2](<Claude Codex Discussion/2026-11-20-one-repo-step-2-review.md>) R11（R9 修正引入；再補一條判斷就是同一類的第四代，照 D-200 不加） |
| 分派表認外掛 scripts 呼叫的 `tools/` 檔，只認字面寫出的路徑（`../../tools/x.ts`，加引號或跳脫都算）；指向同一個檔的其他拼法認不到：`./`（`../../tools/./x.ts`）、`//`、大小寫不同、先 `cd ../../tools` 再叫、`npm --prefix ../../tools run x`、用 shell 變數組路徑（`T=../../tools; node $T/x.ts`） | 外掛或套件的 `package.json` 這樣寫，之後只改或刪那支工具；現在 apps/、packages/ 的 scripts 沒有任何一條含 `..`，入口只有 hook 與 `check.yml` 字面寫的 `tools/x.ts` | 那一次 commit 的 pre-commit 與 CI 都跳過那個外掛的檢查。機率低。避開：外掛 scripts 呼叫共用工具時寫正規的相對路徑。拼法數不完，不再補（再補一種就是第 4 代，D-200）；真的要防，改成檢查入口一律寫正規路徑 | [AI 連線套件的 L2](<Claude Codex Discussion/2026-11-25-ai-client-l2.md>) 第四輪 第 2 項（後三種寫法是 Fable 5.2 xhigh 驗的） |
| 分派表把結尾有斜線的資料夾路徑（`require('./x/')`）旁邊同名的 `x.js` 也算成入口 | 入口這樣寫，同時有 `x/index.js` 與 `x.js`，只改 `x.js`；現在沒有這種接線 | 多跑三個外掛的檢查，不會少跑。不用避開 | [三個外掛併進同一個 repo 第二步 A 的 L2](<Claude Codex Discussion/2026-11-20-one-repo-step-2-review.md>) R12（R10 修正引入） |
| 圍欄的判斷（`tools/fences.ts`，決策查詢與 `section.ts` 用）不追蹤清單與引用框，收尾的縮排拿開頭的縮排當基準：清單裡沒收尾的圍欄，清單結束後仍算到檔尾；頂層開頭縮排 1～3 格的圍欄，裡面縮排比開頭多不到 4 格的圍欄記號（CommonMark 只准 3 格以內）被當成收尾；引用框裡 `> ` 後面接 tab 的收尾，tab 寬度算錯 | 清單項目裡開了圍欄、沒寫收尾；頂層的圍欄開頭縮排、內容有縮排 4～6 格的三個反引號；引用框裡用 tab 縮排收尾 | 前兩種：後面的標題與 D-ID 當成程式碼（或反過來），`section.ts` 找不到那些標題、決策查詢少列或多列；第三種只影響到引用框結束。repo 現在 392 份 Markdown 和 markdown-it 一致。避開：圍欄都寫收尾、開頭頂格 | [工作流程上線的 L2 第二輪](tasks/workflow-impl-review.md#第二輪的回報) N10、[第三輪](tasks/workflow-impl-review.md#第三輪的回報) M4 |
| 入口的狀態行搬進 roadmap 時（`moveText`），帶標題的連結 `[t](x.md "t")`、`/` 開頭的路徑、路徑裡有括號的連結不改基準；白板「最近定案」的 backlog 站，檔名有 `#` 時切錯 | 入口的狀態行這樣寫連結，或 backlog 的檔名有 `#`；現在都沒有 | roadmap 或白板的連結指錯，多半由文件檢查報成壞連結，不會默默寫壞。避開：狀態行的連結寫一般的相對路徑 | [工作流程上線的 L2 第二輪](tasks/workflow-impl-review.md#第二輪的回報) N11 |
| 入口改名、改成結束、刪掉狀態板那一列在同一個 commit，沒有完成列也通過 | 同一個 commit 裡 `git mv` 入口、狀態改成已合併或已結案、手動刪列 | 少一筆完成紀錄。避開：照規範不手動刪列，改了狀態就跑 `node tools/roadmap-sync.ts`（工具會寫完成列） | [工作流程上線的 L2 第二輪](tasks/workflow-impl-review.md#第二輪的回報) N12 |
| 重播的判斷靠 Git 留下的狀態：`git cherry-pick -n`（不寫 `CHERRY_PICK_HEAD`）、`git checkout <分支> -- <檔>`、`git restore --source` 把別處的 roadmap 拿過來，commit 時不算重播 | 用這些指令帶進別處已經收尾的完成列，而且不在收尾那天 commit | 擋在新列的核對（例如「日期要是今天」）；照訊息改成今天，記下的就不是收尾那天。避開：用會留狀態的 `git cherry-pick`、`git merge` | [工作流程上線的 L2 第三輪](tasks/workflow-impl-review.md#第三輪的回報) M5 |
| squash、cherry-pick、rebase 時另一邊的完成列不要求都留著（只有真的合併才要求）：留下的 `SQUASH_MSG` 可能是放棄的 squash，不能拿來要求內容；cherry-pick、rebase 的另一邊是正在套用的那一個 commit | `git merge --squash`、`git cherry-pick`、`git rebase` 解〈已完成〉的衝突時丟掉另一邊那一列，而那件工作不在這邊的狀態板或〈等觸發點〉上 | 少一筆完成紀錄。避開：本機合併用 `git merge`，不用 squash；cherry-pick、rebase 解衝突時兩邊的列都留著 | [工作流程上線的 L2 第三輪](tasks/workflow-impl-review.md#第三輪的回報) M1、[第四輪](tasks/workflow-impl-review.md#第四輪的回報) K3（cherry-pick、rebase 是靜態推斷） |
| octopus 合併加 `--no-commit`、之後再 `git commit`，只認得第一個分支是另一邊（`git rev-parse MERGE_HEAD` 只回第一個）；`hooks.ts` 合併進 `main` 前查 CI 也只查第一個 | `git merge --no-commit a b`，第二個以後的分支收尾過、又多做了一步（補一句、重新開工等） | 那些分支帶進來的列被當成新的列重驗而擋下，它們的列也不要求留著；合併進 `main` 前只查到第一個分支的 CI。避開：octopus 不加 `--no-commit`，或一次併一個分支 | [工作流程上線的 L2 第四輪](tasks/workflow-impl-review.md#第四輪的回報) K3 |
| 放棄的 squash 用 `git restore --staged --worktree .` 時 `SQUASH_MSG` 留著，之後一般的 commit 仍當成 squash 那個分支的重播 | 放棄 squash 後沒用 `git reset` 清掉，接著在一般的 commit 手抄那個分支的完成列 | 抄來的列只查格式與日期：入口還沒結束、狀態板那一列還在也通過，〈已完成〉多一筆和入口對不上的列。避開：放棄 squash 用 `git reset` | [工作流程上線的 L2 第四輪](tasks/workflow-impl-review.md#第四輪的回報) K3 |
| 〈已完成〉照「日期＋拿掉連結目標的文字」對 HEAD 的列：同一天、同名、「完成」那一句一字不差、入口不同的兩列分不出來 | 同一件工作同一天收尾、重新開工、換入口、新入口收尾，兩次的「完成」那一句一樣、工作名稱沒改 | 新入口收尾的 commit 被擋，訊息指到舊入口（舊的列被當成新的列，照已經「已結案 →」的舊入口重驗）。不會寫壞資料。避開：第二次的「完成」那一句寫得不一樣 | [工作流程上線的 L2 第五輪](tasks/workflow-impl-review.md#第五輪的回報) J1（第一輪 R2 的做法就有） |
| 軟體之間不 import 的檢查（`tools/check-app-imports.ts`）只看寫死的相對路徑：執行時才組出來的路徑、`tsconfig` 的 `paths`、打包工具的 alias、自訂 resolver 讓套件名稱指到別的外掛，都看不到 | 程式用字串組路徑再 import（`import('../../src/' + name)` 只取得到前段），或外掛設了 paths、alias、resolver | 這類跨外掛的引用不會被擋。避開：import 寫成固定的相對路徑；第一個用到 paths、alias 或 resolver 的外掛任務，把解析後不出外掛的邊界加進測試（外掛的 AGENTS.md 有寫） | [三個外掛併進同一個 repo 第一步 §6](tasks/one-repo-step-1.md#6-外掛之間不-importtoolscheck-plugin-importsts)（設計時就知道的限制，不是 L2 找到的） |
| 共用檢查（`tools/check-app-imports.ts`）擋不到的幾種組路徑寫法 | 程式或 workflow 寫 `APPS_ROOT + 代號`、`join(root, APPS_ROOT, 'cards')`、字串裡雙重跳脫的正規式、大括號與群組（`apps/{cards,capture}`、`apps\/(cards\|capture)`）、`cd apps && cd cards`、`cd apps/$APP`（不加大括號的 shell 變數）、`'x/apps/' + code`、`'apps/%s'`、`` `apps${sep}${code}` ``；紀錄（`docs/tasks/` 等）不查 | 本機照過，Linux CI（分大小寫）才紅；只在雲端 session 或手動跑的腳本，到雲端才壞。避開：從代號找資料夾一律查 `tools/apps.ts` 的 `FOLDERS` | [D-218 合併前 L2](tasks/rename-plugins-to-apps-review.md) 第一輪 R5、第二輪 S4 |
| 共用檢查的組字串那條只查程式與 workflow | 之後追蹤 `.sh`、`.ps1`、`.cmd`、`.py`，或在 `package.json` 的 scripts、`.claude/settings.json` 的 hook 指令裡組 `apps/` 路徑（`CODE_FILE` 是白名單：`ts`／`js` 各種、`yml`、`yaml`、`.githooks/`）；現在沒有 | 組出來的路徑不被擋（大小寫與 `plugins` 兩條仍查全部檔案）。避開：新增這類腳本時把副檔名加進 `CODE_FILE` | [D-218 合併前 L2](tasks/rename-plugins-to-apps-review.md) 第二輪 S6 |
| 共用檢查的誤報 | 程式或 workflow 裡：路由與連結 `'/apps'`、介面文字 `'Apps'`、網址模板 `` `https://…/apps/${slug}` ``（組字串那條）；別的 repo 的網址、英文句子、`node_modules` 路徑碰到大小寫不符的 `apps/<軟體名>`（大小寫那條，查全部文字檔）；vault 路徑的正規式從 `configDir` 組（前面不是字面 `obsidian\/`）；任務標題寫了打錯的樣本，同步到 `docs/roadmap.md` 那一列 | 擋下引入那一行的 commit。避開：改寫法（路由字串拆開、vault 路徑從 `.obsidian\/plugins\/` 寫起或接 `essence-` ID），真的需要時加進例外表並寫明放行哪幾條；任務標題不寫打錯的樣本 | [D-218 合併前 L2](tasks/rename-plugins-to-apps-review.md) 第一輪 R4、第二輪 S1 |
| 共用檢查的訊息在少數情況帶錯路 | `apps/` 正下方放檔（`apps/README.md`）；Portal 這類只有文件的軟體放 `.gitkeep`、PDF、CSV、txt；同一個資料夾有好幾個問題 | 前者報「不在表上」，看不出是「這一層不放檔」；後者算成程式被擋；同一個資料夾只報第一個，要一個一個修。等 Portal 的第一個任務碰到再調 | [D-218 合併前 L2](tasks/rename-plugins-to-apps-review.md) 第一輪 R9 |

### AI 連線套件

`packages/ai-client/`（[任務說明](tasks/ai-client.md)）第一步刻意不做的，各有觸發點（Claude 2026-11-25 規劃、Fable 審查時提的）：

- 💡 **先上傳檔案再引用（各家的 Files API）**：教材重複送時省流量與時間。觸發點：同一份教材一學期送超過三次的情況變常見。
- 💡 **可快取區塊的標記**：「到這個區塊為止可快取」，規則放 `instructions` 時連做幾課省錢；不做自動快取（PDF 在最後，等於每次多付寫入）。觸發點：Cards 的直接製作上線後，連做幾課的費用明顯偏高。
- 💡 **送出前估費用**：回範圍與假設（頁數、預期輸出量由呼叫端給），畫面寫「照牌價估計，不含免費額度」。觸發點：Cards 要在送出前顯示預估。
  → 觸發點到了，併進 [Cards 直接呼叫 AI](../apps/Cards/docs/tasks/ai-direct.md) §3（2026-11-27）
- 💡 **手機直接呼叫**：手機在背景會暫停 app，Gemini 要等 2～3 分鐘才回（冒煙測試 2026-11-27），中途切走就斷；手機照舊複製貼上（D-226）。觸發點：家長想在手機按一下就做，而且實測 iPhone 的 Obsidian 切到背景再回來，請求還收得完（或改成服務端代送）。
- 💡 **`gemini-interactions` 方言**：送 `store: false`。觸發點：Google 宣布 generateContent 要停，或 Interactions 轉成正式版。
- 💡 **區網的本機模型**（`http://192.168.x.x` 的 Ollama）：要一個呼叫端明確打開的開關。觸發點：有人要用家裡另一台電腦跑的模型。
- 💡 **`node:https` 傳輸層**：給不開 CORS 的端點，要放 Cards 的 `src/desktop/`（D-148）。觸發點：第三步的 CORS 實測有一家不通，或要接本機網路上的模型。
- 💡 **錄下真的回應當範例**（冒煙測試加 `--record`，欄位走白名單，只存自編的內容）：觸發點：冒煙測試發現範例和真的回應對不上。
- 💡 **多輪與工具呼叫**：助理訊息帶各方言的不透明區塊（thinking、thought signature、reasoning item）、錯誤帶已知用量。觸發點：要做「請 AI 修正」的多輪或工具呼叫。
- 💡 **目錄補 Gemini 4 與 Haiku 5.5 的快取價**：冒煙測試（2026-11-27）時使用者的 Google 金鑰列得出 `gemini-4-argon`、`gemini-4-hydrogen` 等 Gemini 4 模型，目錄沒有，費用算不出來（null）；`claude-haiku-5-5` 沒寫快取讀取價，照輸入價算、偏高。價格要照官方價目表補。觸發點：第四步用同一課比較模型，或 Cards 的預設模型改成其中一個。
- 💡 **發布到 npm**：另外編譯成 `.js`（Node 不在 `node_modules` 裡執行 `.ts`）。觸發點：別的 repo 要用、又不方便複製資料夾。

### Essence Capture 與 Essence Mindboard

其他軟體的工作各自一份，不和 Cards 的混在一起（使用者 2026-10-31）；和 Cards 共用的部分用連結。

| 外掛 | 目前狀態 | 清單 |
|---|---|---|
| Essence Capture | 第二階段（使用者 2026-11-16，[D-206](decisions.md#d-206-essence-capture-移到第二階段v1-的教材直接附給-ai)）：v1 的教材由家長在自己的 AI 對話附課本；開工前先找現成專案 | [查看](../apps/Capture/docs/backlog.md) |
| Essence Mindboard | 未來的第三個外掛，還沒開工；在同一個 repo 的 `apps/Mindboard/` 開發（[D-208](decisions.md#d-208-三個外掛在同一個-repo-開發每個外掛有自己的資料夾)） | [查看](../apps/Mindboard/docs/backlog.md) |
| Essence Portal | 入口網站（不是 Obsidian 外掛，[D-218](decisions.md#d-218-plugins-改名-apps每個軟體的資料夾首字大寫)）：只有文件、還沒寫程式；方向在[入口網站討論稿](<../apps/Portal/docs/Claude Codex Discussion/2026-11-20-portal.md>) | [查看](../apps/Portal/docs/backlog.md) |

#### 三個外掛併進同一個 repo

定案在 [D-208](decisions.md#d-208-三個外掛在同一個-repo-開發每個外掛有自己的資料夾)（使用者 2026-11-17），細節與驗收在決定本文：

- **第一步**：Capture 或 Mindboard 寫第一行程式之前，建 `plugins/capture/`、`plugins/mindboard/` 與分派檢查（D-208 第 5 點），合併前 L2。已合併進 `main`（2026-11-18，[PR #21](https://github.com/kuohappiness/Essence-Cards/pull/21)），結果見[任務說明](tasks/one-repo-step-1.md)。
- **轉錄稿格式**：第二步 B 就搬到最上層的 `docs/transcript.md`（使用者 2026-11-20 調整第 6 點的時機）；共用範例與相容檢查等第一個需要共同規格的 Capture 任務。
- **`plugins/` 改名 `apps/`、首字大寫**：定案 [D-218](decisions.md#d-218-plugins-改名-apps每個軟體的資料夾首字大寫)（使用者 2026-11-21），[任務說明](tasks/rename-plugins-to-apps.md)；入口網站放 `apps/Portal/`（第一份文件出現時建，網頁版的討論串在改名合併後寫）。
- **改名 `Essence`**：和第一步分開，各自挑停手的時段；本機資料夾先演練（第 7 點）。
- **第二步**：Cards 搬進 `plugins/cards/`，觸發點是穩定基線（第 8 點）。基線是 `0.6.0`（[上線前清單](../apps/Cards/docs/tasks/release-0.6.0.md)第五項第 10 步）；裝好之後先搬家，AI 製卡第 4、5 批（錯題補強、補記憶錨點）排在搬家之後（使用者 2026-11-18 選定。理由：第 4、5 批還沒開工，先搬家停手的代價小；先做它們，就成了要一起帶進去的功能，基線要等 `0.7.0`）。[任務說明](tasks/one-repo-step-2.md)寫好（2026-11-19）。A（程式）已合併進 `main`（2026-11-20，[PR #27](https://github.com/kuohappiness/Essence/pull/27)）；B（文件）也合併進 `main`（2026-11-21，[PR #28](https://github.com/kuohappiness/Essence/pull/28)），第二步做完。

## 已轉出

### v1 需要做的任務

搬到 Cards 的[〈v1 需要做的任務〉](../apps/Cards/docs/backlog.md#v1-需要做的任務)（D-208 第二步）。跨外掛的技術債與已知的限制留在這裡（〈待處理〉的[〈技術債〉](#技術債)、[〈已知的限制〉](#已知的限制)）。

### 第二階段想做的事

搬到 Cards 的[〈第二階段想做的事〉](../apps/Cards/docs/backlog.md#第二階段想做的事)（D-208 第二步）。

### 歷史索引

搬到 Cards 的[〈歷史索引〉](../apps/Cards/docs/backlog.md#歷史索引)（D-208 第二步）。

### 已定案對照

搬到 Cards 的[〈已定案對照〉](../apps/Cards/docs/backlog.md#已定案對照)（D-208 第二步）。
