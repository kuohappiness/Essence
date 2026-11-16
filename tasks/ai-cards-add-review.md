# AI 製卡第 1 批（引言框的「加入」）的 L2 審查請求（給 Codex）

狀態：待審（第二輪）

遵守 repo 根目錄的 `AGENTS.md`。建議推理等級：**高**。請**新開一個 session**。

## 審查對象

- repo：Essence Cards；worktree `.claude/worktrees/edit-markup-2ba4bd`；分支 `claude/ai-cards-batch-1-intro-39e0ff`。
- 第二輪待審 commit：`4be66d8203b117b158fcce4fbd0db6dd70ae9275`；第一輪待審 `5376a8fd3a89968b1bfa6bb12ef8beb6518ba99d`；共同祖先 `5562207`（`origin/main`）。這份請求在下一個 commit，只改這個檔。
- **這一輪只查第一輪修正的差異與受影響的路徑**（`eb08162..4be66d8`），不必整包重審：R2 `c822759`、R6 `ef1e384`、R7 `9ec3d64`、第一輪報告進分支 `1c41f13`、R9 `93a895b`、R3 `8b35f9f`、R1 `423803a`、R4 `0be816c`、R5 `fad704a`、R8 `b31bc32`、文件 `4be66d8`（`37eb492` 的舊版讀取測試已在後面的 commit 拿掉）。
- 沒有未提交的修改。

## 規格與優先順序

- 第一輪報告與 Claude 的核對：`Claude Codex Discussion/2026-11-16-ai-cards-add-l2.md`（最後一節〈Claude 核對與修正〉是每一項的判定與修法）。
- [任務說明](ai-cards-add.md) §0～§7 與〈結果〉；格式查核報告 `Claude Codex Discussion/2026-11-16-ai-cards-add-format-review.md`。任務說明和報告不一致時以任務說明為準，並回報。
- 決定：D-089 第 8 條、D-027、D-092、D-167 第 9、10 點、D-134、D-170、D-157、D-149；§4 的限制 1、2 使用者已接受（任務說明 §4〈剩下的限制〉），不必再報，除非修正讓它們變大或多出新的觸發。
- 格式：[syntax](../docs/syntax.md) §2-9（這一輪加了兩種留在框裡的情況）。
- **舊版外掛的相容不在範圍**（使用者 2026-11-16：產品還沒開始使用，不會有舊版外掛，不做）：不報舊版讀不讀得到。
- §5 的 `提示 v3` 與科目預設（國小社會 v0.9、國語 v0.8、英文 v0.15，加上這一輪的通用 v0.16、一般知識 v0.5）**還沒試用**；試用要使用者貼提示，結果另外交使用者決定。請審程式與規則文字是否一致，不必判斷 AI 會不會照做。

## 行為與風險

- 公開介面的變動：`State.addLocked(path)`（新增）；`ExistingRequest` 拿掉 `locked`；`ClearInput.read`（新增）；`CLEAR_WHY.sourceChanged`（新增）；`ExistingResult` 的 `added` 改成「目的地確認過的」，`cleared: false` 涵蓋來源寫不進去、被擋、讀回不同；`EXISTING_WHY.multiline` 的字。
- 不可破壞的性質（同第一輪）：只拿掉自己搬的；先寫目的地、讀回確認，才拿掉來源；逾時的那一篇這次開著 Obsidian 的期間不再寫；一次加入只重排、通知一次；草稿、別科、沒有引言框的卡組和 `main` 相同；手機不寫卡組。
- 請特別看：
  - **R8 的修法改了 state 的共用路徑**：加入的批次中，讀取層因外部變動要的重排也留到批次結束（今天的份清掉，`fresh()` 照需要排）；核對過的寫入當場 `adopt`。請查還原（`restore` 也用 `holdingNow`）、存檔、答題、換日與這段期間的互動，以及 `current = null` 有沒有讀者沒經過 `fresh()`。
  - **R1 的全文相等條件**：會不會讓真實路徑（例如來源開在編輯模式、Obsidian 自動存檔補 ID、iCloud 換行字元）一直清不掉；重按是否一定收斂。
  - **R4 讀回**：來源經編輯器寫、`saved` 時的讀回；`added` 的新語意下通知的字是否誤導（同一篇的項目在 `cleared: false` 時）。
  - **R3**：停用跟著 state 的生命週期（外掛重新載入時是新的 state）；按鈕的 `busy` 改問 state。
- 已知邊界例子：各項的回歸測試在 `tests/ai-add-existing.test.ts`、`tests/ai-add-existing-state.test.ts`、`tests/ai-add-clear.test.ts`、`tests/ai-add-move.test.ts`、`tests/ai-cards.test.ts`、`tests/intro-run-wiring.test.ts`。§7 仍沒寫成測試的在任務說明〈結果〉的「延後的測試」與 backlog 技術債「補測：AI 製卡第 1 批」：請再判斷裡面有沒有屬於改不回來、合併前要補的（D-195）。
- 明確延後：即時預覽的按鈕（技術債「補做」）、R8 的刪除入口（§6）、工作紀錄與恢復按鈕（§4）。

## 驗證方式

- `npm run check`（Codex 在沙箱外跑，照 [quality.md](../docs/agents/quality.md#檢查指令)：一次等到結束）。每個修正的 commit 在 pre-commit 都跑過一次。
- 只跑這批的測試：`node --test --test-timeout=300000 tests/ai-add.test.ts tests/ai-add-move.test.ts tests/ai-add-state.test.ts tests/ai-add-existing.test.ts tests/ai-add-sources.test.ts tests/ai-add-clear.test.ts tests/ai-add-existing-state.test.ts tests/ai-check-suspect.test.ts tests/intro-run-wiring.test.ts tests/ai-cards.test.ts tests/ai-rules.test.ts tests/deck.test.ts`。
- 平台事實表（同第一輪，這一輪沒有新的平台假設；修正沒有重跑 Windows 實機）：

| 假設 | 探針 | 結果 |
|---|---|---|
| P1～P5（起訖行、`li` 順序、即時預覽、重畫、摺起） | Windows 版 Obsidian 1.15.1，開發命令 `intro` | P1、P2、P4、P5 成立；P3 不成立（只有閱讀模式） |
| 閱讀模式的分頁改 `view.editor` 再 `view.save()`，磁碟上留得住 | 開發命令 `intro-add` 第一次跑（修正前） | **不成立**，改成只有編輯模式的分頁走編輯器（`0693275`） |
| 只開在閱讀模式的那一篇用 `vault.process` 寫，Obsidian 重讀、不把舊內容存回去 | 修後的 `intro-add`：同一個分頁連按四次 | 成立 |
| 編輯模式的分頁開著同一篇時 | 沒跑 | 待驗 |
| iPhone：加入的卡組同步後照常出題、引言框沒有按鈕 | 下一次 iPhone 實機測試 | 待驗 |

## 實作者自己選的做法（這一輪）

- **R1**：不追檔案身分（`Files` 沒有），改成第 4 步要求來源最新的全文和第 1 步讀到的相同（只把 `\r\n`、`\r` 當成 `\n`）；不同就一項都不拿，跨篇的提示「這篇筆記剛改過，題目已經加進原本的卡組；這一項先留在框裡，請再按一次」，同一篇的照 `WHY.changed`。那一項自己被改的仍先報 `CLEAR_WHY.edited`。
- **R2**：留項的條件從「備註、錯題補強」放寬到來源那一項的**任何**資料欄位（類型、重要性、狀態、出處也算），只要那一行底下有子項目或接續行。
- **R3**：鎖在 `state`，`addCandidates` 進佇列前也查；來源被停用時整批不寫、每一項寫停用的原因。
- **R4**：`done` 與 `saved` 都讀回來源比；逾時照舊停用、`cleared: false`；批次中途被門檻擋下時，已確認的目的地也列進 `added`（第一輪沒列）。
- **R5**：`destStill` 只在單項、沒轉成連結時才有；同一篇的在拿掉的回呼裡問，不成立回 `changed`。
- **R6**：候選加上一行 `# <插入處的小標題>` 再讀，和搬完的比；名稱裡的詩名和小標題不同不擋（詩名照小標題顯示，規則這樣寫）。
- **R7**：理由只認候選名稱底下第一個直接一層、而且是檢查認的那一行（`check` 的 `children[0]`）；`suspectOf`（按鈕用）仍是第一個 `理由：` 子項目，在通過檢查的草稿裡兩者相同。
- **R8**：核對過的寫入（`done`）在批次中當場 `adopt`；批次中所有要重排的（`adopt` 與讀取層）都只記下；批次結束時若 `current` 還是空的才排，否則只通知。
- **R9**：國小社會 v0.9、國語 v0.8 只改〈和學生已有的目標比對〉開頭那一句，沒升版（還沒試用、沒發布）；通用、一般知識升版。

## 回報

只審查，不改產品程式。接在 `Claude Codex Discussion/2026-11-16-ai-cards-add-l2.md` 最後，標題〈第二輪〉；延續第一輪的標「延續 Rx」，修正帶出的標「Rx 修正引入」；格式照 code-quality 的 `review.md`〈回報格式〉。
