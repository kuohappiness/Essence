# AI 製卡第 2 批（加深這一節與主動提示）的 L2 審查請求（給 Codex）

狀態：第二輪待審（2026-11-17）；第一輪的報告與核對在 [L2 討論稿](<../Claude Codex Discussion/2026-11-17-ai-cards-deepen-l2.md>)

遵守 repo 根目錄的 `AGENTS.md`。建議推理等級：**高**。請**新開一個 session**。

## 審查對象

- repo：Essence Cards；worktree `.claude/worktrees/edit-markup-2ba4bd`；分支 `claude/ai-cards-deepen-04562a`（[PR #16](https://github.com/kuohappiness/Essence-Cards/pull/16)）。
- 待審 commit：`afdb2bf7a76c1a895e4da89f5ccc145b811388ca`；共同祖先 `6bfdad96e34956dd6a2c8e2ae6e439af0e202e27`（`origin/main` 之後多了兩個只改 one-repo 文件的 commit，沒有衝突）。這份請求在下一個 commit，只改文件。
- 範圍：`6bfdad9..afdb2bf` 的程式與測試。只改文件的 commit（`efe50f0`、`233d1ad`、`b9a55b8`、`3414431`、`afdb2bf`）只需要對照規格。
- 沒有未提交的修改。

## 規格與優先順序

- [任務說明](ai-cards-deepen.md) §0～§9 與〈結果〉；格式查核兩輪（[請求](ai-cards-deepen-format-review.md)、[報告](<../Claude Codex Discussion/2026-11-17-ai-cards-deepen-format-review.md>)）的結論已改進任務說明，以任務說明為準。
- 決定：D-077、D-100、D-136、D-152、D-190、D-194、[D-209](../docs/decisions.md#d-209-加深第-2-批的六項選擇門檻二分之一課外-標法常錯兩次)；syntax §1（`來源類型`）、§2-5（`課外：`）、§2-9〈加深的草稿〉。
- 第 1 批（引言框的「加入」，[任務說明](ai-cards-add.md)）的行為不應改變，只多認三種加深框；第 1 批 L2 記成已知的限制的 R1、R2 不必再報，除非這一批讓它們變大。
- 規格衝突時列成問題，不挑容易通過的那份。

## 行為與風險

- 公開介面：
  - `src/core/ai/`：`deepen-write.ts`（`inspectDeepen`、`composeBatch`、`appendBatch`、`verifyAppend`、`unclosedFence`、`idsInDeepenBoxes`）、`deepen-job.ts`（`beginDeepen`、`planAppend`、`runDeepen`、`settleUnclear`、`readDeepenJobs`）、`deepen-prompt.ts`、`deepen-remind.ts`、`intro.ts` 的 `deepenPending` 與三種加深框、`reply.ts` 的 `checkPiece` 多了 `skip`。
  - `src/core/study/mastery.ts`（記穩了、常錯）、`src/core/deck/` 的 `課外：` 讀法、排程裡課外層的位置、`src/core/version/release.ts` 的 `OUTSIDE_NEEDS`。
  - `src/state/index.ts` 的 `aiAppend`（走既有的寫入佇列與門檻）。
  - `src/obsidian/deepen.ts`、`deepen-modal.ts`、`src/main.ts` 的接線、`src/review/entry.ts` 與 `src/ui/Entry.tsx` 的提醒列、`src/ui/prefs.ts` 的這台電腦偏好、`src/obsidian/settings.ts` 的開關。
- 不可破壞的性質：
  - 加深只**接在檔尾**，原本的字一個都不動（含行尾空白、CRLF）；寫入回呼裡重驗、寫後重讀再驗。
  - 中斷後不重寫卡組：有 `writing` 的工作只核對、不再接一次；結果不明交家長選，不自動當成完成。
  - 加深框在「加入」之前不出題（手機、電腦都一樣）；只有按「加入」才進卡組。
  - 考試範圍不算課外層、不提高它的保持率；沒有範圍時排程和 `main` 相同。
  - 舊版（`0.5.0`）讀到含 `課外：` 的卡組要停（`需要版本`），其餘卡組讀法和 `main` 相同。
  - 提醒列只在電腦出現；總開關關掉時不算；按鈕按下去時重算一次，不照舊的列做事。
- 請特別看：
  - `planAppend` 判定「還是這一篇」的條件（§3-2 第二輪）與它和 `aiAppend` 的門檻、逾時、鎖的配合。
  - `deepenPending` 的判定（`93e196d`：只看框裡還有 AI 內容的項目）在家長手改之後會不會一直卡在「還沒審完」或太早解除。
  - 背景的提醒計算（`deepen.ts` 的 `compute`）在改名、刪除、同步晚到、紀錄還沒讀完時的結果。
  - **實機發現（還沒改）**：卡組改名而快照的 `對象` 連結沒跟著改時，照第一次算，第一次至少要 3 個記穩，提示反而少出現（任務說明〈結果〉）。請判斷這屬於一定修、可記成限制，還是交使用者選，並提出最窄的修法。
- 已知邊界例子：`tests/ai-deepen.test.ts`、`tests/ai-deepen-write.test.ts`、`tests/ai-deepen-flow.test.ts`、`tests/ai-deepen-mastery.test.ts`；任務說明〈結果〉的單元測試清單。請找新的組合。
- 明確延後：§8 表格的五項（backlog 技術債）、iPhone 項目（下一次實機）、試用（真的貼給 AI）。

## 驗證方式

- `npm run check`（在沙箱外跑，照 [quality.md](../docs/agents/quality.md#檢查指令)：一次等到結束，不要短間隔查進度）。每個 commit 在 pre-commit 都跑過。
- 只跑這批：`node --test --test-timeout=300000 tests/ai-deepen.test.ts tests/ai-deepen-write.test.ts tests/ai-deepen-flow.test.ts tests/ai-deepen-mastery.test.ts tests/main-wiring.test.ts`。
- 平台事實表：

| 假設 | 探針 | 結果 |
|---|---|---|
| `vault.process` 接在檔尾後，開著的分頁與磁碟一致 | Windows 版 Obsidian 1.15.1（獨立的 Obsidian、暫存 vault、CDP），寫入後讀檔 | 成立 |
| 閱讀模式按「加入」，加深的三種框各自照規格搬 | 同上 | 成立 |
| 改名時 `vault.on('rename')` 把偏好換成新路徑 | 同上，`fileManager.renameFile` | 成立 |
| 編輯模式的分頁開著同一篇、有沒存的字時加深 | 沒跑（單元測試以 `unsaved` 擋下） | 待驗 |
| iPhone：加深框不出題、課外考試期間排在後面 | 下一次 iPhone 實機測試 | 待驗 |

- 實作者沒跑：真的貼給 AI 的試用、iPhone、另一台電腦同步。

## 實作者自己選的做法

1. 寫入被全域門檻擋下（備份、手機、載入中）時，貼上的回覆不存，回上一步要重貼；理由：還沒動卡組，恢復資料只在要寫時才存，少一種中間狀態。
2. 結果不明或逾時時，這一批預留的 ID 當成用過（`retire`），不再發給別的寫入。
3. 沒有頂層備註框時，在這一批最前面另起一個；剛好一個時併進去；兩個以上不併（照 §3-1）。
4. 快照名稱撞到時往後加後綴；讀到同一份內容就算寫好。
5. 提醒列在背景算，事件後 1.5 秒防抖；按下按鈕時重算那一篇，不一致就不做。
6. 「這次不用」記在這台電腦，鍵是路徑；`ids` 一個都不在那一篇時當成路徑被重用、不採用；`ids` 是空的照路徑用。
7. `deepenPending` 只把「補題底下還有題目行」與「新目標、候選的名稱行有行尾 ID」算成還沒審完。
8. `main.ts` 的 vault 事件監聽包在 try/catch 裡：監聽失敗只少了提醒，不擋外掛啟動；這裡不另記錯誤，因為監看不了時 state 建立也會失敗並照常記錄與提示（D-155 補充）。

## 回報

只審查，不改產品程式；可以在隔離環境重現。寫在 `Claude Codex Discussion/2026-11-17-ai-cards-deepen-l2.md`，標題〈第一輪〉；格式照 code-quality 的 `review.md`〈回報格式〉：每項寫軸、觸發條件、預期／實際、影響、真實路徑會不會發生與發生機率、位置、證據（已重現／靜態推斷／待驗證）、建議處理；最後一行寫沒測的項目與原因。

## 第二輪

- 待審 commit：`1c780ff82a82de97c205b13b2827441373309b23`；只查第一輪修正的差異與受影響的路徑（`d5378bb..1c780ff`）。請**新開一個 session**，推理等級高。
- 先讀 [L2 討論稿](<../Claude Codex Discussion/2026-11-17-ai-cards-deepen-l2.md>)最後的〈Claude 核對與修正（第一輪）〉：每一項的修法、收窄在哪、回歸測試。
- 請特別看：
  - R2：`aiAppend` 新增的 `locked`（前一筆不明、這一筆確定沒寫）與 `timeout`（這一筆自己不明）的分界；鎖改在寫入那一列裡設之後，第 1 批的加入、補題與加深互相排隊的順序。
  - R3：`aiAppend` 用 state 最後讀到或寫進的文字當磁碟；plan 裡才發現有沒存的字時 `edit` 仍會存一次編輯器（存的是家長自己的字）。這個剩下的窗口要不要再收，請附真實路徑的判斷。
  - R1：`changeStatus` 對所有狀態變更都套 `withNeed`（暫停、恢復也會補上缺的標記）；加不上時回 `unwritable`。
  - R5：暫停的卡組手動加深時，啟用目標的挑法和 `deckTargets` 是否一致。
  - R7 的分類（同路徑捨棄改列「交使用者選」）與理由，請判斷是否同意。
- 第一輪〈驗證〉第 3 點：不可破壞的性質「原本的字一個都不動」有兩個任務說明寫明的例外：檔尾的空白行清掉、給家長的備註併進原有的頂層備註框（§3-1）。
- 驗證：`node --test --test-timeout=300000 tests/ai-deepen.test.ts tests/ai-deepen-write.test.ts tests/ai-deepen-flow.test.ts tests/ai-deepen-mastery.test.ts tests/ai-deepen-state.test.ts tests/main-wiring.test.ts`；完整的 `npm run check` 照第一輪。修正沒有重跑 Windows 實機。
- 回報接在同一份討論稿最後，標題〈第二輪〉；延續第一輪的標「延續 Rx」，修正帶出的標「Rx 修正引入」。
