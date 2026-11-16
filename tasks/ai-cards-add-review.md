# AI 製卡第 1 批（引言框的「加入」）的 L2 審查請求（給 Codex）

狀態：待審（第三輪）

遵守 repo 根目錄的 `AGENTS.md`。建議推理等級：**高**。請**新開一個 session**。

## 審查對象

- repo：Essence Cards；worktree `.claude/worktrees/edit-markup-2ba4bd`；分支 `claude/ai-cards-batch-1-intro-39e0ff`。
- 第三輪待審 commit：`6a60979ce5e58535b52d0b7258a72b09a163f62e`；第二輪待審 `4be66d8203b117b158fcce4fbd0db6dd70ae9275`；共同祖先 `5562207`（`origin/main`）。這份請求和核對紀錄在下一個 commit，只改文件。
- **這一輪只查第二輪修正的差異與受影響的路徑**（`4be66d8..6a60979`）：R3 `e583fd9`、R1 `dcaeab3`、R2 `9301db6`、R4 `50c0cc8`、〈合併前補驗〉的回歸測試 `6a60979`。中間的 `c8b7f7e` 和 `4a9a349` 互相抵消（拿掉又放回舊版讀取的測試），淨差為零；`794bc3c`、`f806976` 只改文件。
- 沒有未提交的修改。

## 規格與優先順序

- 第二輪報告與 Claude 的核對：`Claude Codex Discussion/2026-11-16-ai-cards-add-l2.md` 的〈第二輪〉與最後〈Claude 核對與修正（第二輪）〉（每一項的判定與修法、部分同意的理由）。
- [任務說明](ai-cards-add.md) §0～§7 與〈結果〉；任務說明和報告不一致時以任務說明為準，並回報。
- 決定：D-089 第 8 條、D-027、D-092、D-167 第 9、10 點、D-134、D-170、D-157、D-149、D-191、D-195；§4 的限制 1、2 使用者已接受（任務說明 §4〈剩下的限制〉），不必再報，除非修正讓它們變大或多出新的觸發。
- §5 的 `提示 v3` 與科目預設**還沒試用**；這一輪沒有改規則文字。

## 行為與風險

- 公開介面的變動：`writes.ts` 新增 `STOP`，`fillFile`、`edit` 的 `plan` 可以回它（`edit` 不改編輯器、不 `persist`，回 fallback；`fillFile` 當成沒有要寫的）；`ExistingResult` 在來源結局不明時的內容（跨篇的照第 3 步讀回列 `added`，同一篇的留著寫原因，`cleared: false`）；`intro-run` 的通知在來源停用時說要重開。
- 不可破壞的性質（同前兩輪）：只拿掉自己搬的；先寫目的地、讀回確認，才拿掉來源；逾時的那一篇這次開著 Obsidian 的期間不再寫（含編輯器沒存的字，第二輪 R1）；一次加入只重排、通知一次；草稿、別科、沒有引言框的卡組和 `main` 相同；手機不寫卡組。
- 請特別看：
  - **R1 改了共用的寫入路徑**：`STOP` 只有加入的三個回呼會回；一般存檔、ID 處理、狀態切換仍回 `null` 照舊 `persist`。請查有沒有別的呼叫端受影響，以及 `edit` 回 fallback 時 `begin`／`end` 與核對讀取的配對。
  - **R2 的回報**：`ownMoved`（同一篇的目標變了）在有跨篇已確認時，從回 `{ done, added: [], cleared: true }` 改成跨篇列 `added`、同一篇留 `WHY.changed`；請查通知的字與重按是否收斂。
  - **部分同意的一點**：第 4 步仍照字比，等價改寫靠重按收斂（理由與測試在核對表）。若認為照字比在真實路徑上會一直清不掉，請附重現。
- 已知邊界例子：`tests/ai-add-existing-state.test.ts`（第二輪 R1、R2 與〈合併前補驗〉）、`tests/intro-run-wiring.test.ts`、`tests/ai-add-old-version.test.ts`。仍延後的在任務說明〈結果〉的「延後的測試」與 backlog 技術債「補測：AI 製卡第 1 批」：請再判斷有沒有屬於改不回來、合併前要補的（D-195）。
- 明確延後：即時預覽的按鈕（技術債「補做」）、R8 的刪除入口（§6）、工作紀錄與恢復按鈕（§4）。

## 驗證方式

- `npm run check`（Codex 在沙箱外跑，照 [quality.md](../docs/agents/quality.md#檢查指令)：一次等到結束）。每個修正的 commit 在 pre-commit 都跑過一次。
- 只跑這批的測試：`node --test --test-timeout=300000 tests/ai-add.test.ts tests/ai-add-move.test.ts tests/ai-add-state.test.ts tests/ai-add-existing.test.ts tests/ai-add-sources.test.ts tests/ai-add-clear.test.ts tests/ai-add-existing-state.test.ts tests/ai-add-old-version.test.ts tests/ai-check-suspect.test.ts tests/intro-run-wiring.test.ts tests/ai-cards.test.ts tests/ai-rules.test.ts tests/deck.test.ts`（舊版的測試會 clone 兩個 tag，較慢）。
- 平台事實表（同前兩輪，這一輪沒有新的平台假設；修正沒有重跑 Windows 實機）：

| 假設 | 探針 | 結果 |
|---|---|---|
| P1～P5（起訖行、`li` 順序、即時預覽、重畫、摺起） | Windows 版 Obsidian 1.15.1，開發命令 `intro` | P1、P2、P4、P5 成立；P3 不成立（只有閱讀模式） |
| 閱讀模式的分頁改 `view.editor` 再 `view.save()`，磁碟上留得住 | 開發命令 `intro-add` 第一次跑（修正前） | **不成立**，改成只有編輯模式的分頁走編輯器（`0693275`） |
| 只開在閱讀模式的那一篇用 `vault.process` 寫，Obsidian 重讀、不把舊內容存回去 | 修後的 `intro-add`：同一個分頁連按四次 | 成立 |
| 編輯模式的分頁開著同一篇時（含第二輪 R1 的存檔順序） | 沒跑 | 待驗 |
| iPhone：加入的卡組同步後照常出題、引言框沒有按鈕 | 下一次 iPhone 實機測試 | 待驗 |

## 回報

只審查，不改產品程式。接在 `Claude Codex Discussion/2026-11-16-ai-cards-add-l2.md` 最後，標題〈第三輪〉；延續前兩輪的標「延續 Rx」或「延續第二輪 Rx」，修正帶出的標「第二輪 Rx 修正引入」；格式照 code-quality 的 `review.md`〈回報格式〉。
