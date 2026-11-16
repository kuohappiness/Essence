# AI 製卡第 1 批（引言框的「加入」）的 L2 審查請求（給 Codex）

狀態：待審

遵守 repo 根目錄的 `AGENTS.md`。建議推理等級：**高**。請**新開一個 session**。

## 審查對象

- repo：Essence Cards；worktree `.claude/worktrees/edit-markup-2ba4bd`；分支 `claude/ai-cards-batch-1-intro-39e0ff`。
- 待審 commit：`5376a8fd3a89968b1bfa6bb12ef8beb6518ba99d`；共同祖先：`5562207`（`origin/main`）。這份請求在下一個 commit，只改這個檔。
- 程式的 commit：`d17d32d`（§1）、`2086056`、`d6be885`（§2）、`cf1ad14`（§3）、`18897c0`（§4 的 state）、`fa4abae`（接上按鈕）、`45c4a18`（§5 提示 v3、檢查、存草稿）、`0693275`（Windows 實機找到的閱讀模式寫入）；開發命令 `0ac589c`、`4442d2d`；pre-commit 只改規則檔也跑規則的測試 `4c5fcc7`（技術債，不屬於這批的規格）；其他是文件與規則檔（`b01b4c0`、`5376a8f`）。
- 沒有未提交的修改。

## 規格與優先順序

- [任務說明](ai-cards-add.md) §0～§7 與〈結果〉；格式查核報告 `Claude Codex Discussion/2026-11-16-ai-cards-add-format-review.md`（四輪）與後面的回應；§5 的討論稿 `Claude Codex Discussion/2026-11-16-existing-targets-for-ai.md`。任務說明和報告不一致時以任務說明為準，並回報。
- 決定：D-089 第 8 條、D-027、D-092、D-167 第 9、10 點、D-134、D-170、D-157、D-149；§4 的限制 1、2 使用者已接受（任務說明 §4〈剩下的限制〉），不必再報，除非實作讓它們變大或多出新的觸發。
- 格式：[syntax](../docs/syntax.md) §2-9（這次改了〈候選卡片〉那一列與〈引言框〉的加入說明）、§2-5。
- §5 的 `提示 v3` 與三份科目預設（國小社會 v0.9、國語 v0.8、英文 v0.15）**還沒試用**；試用要使用者貼提示，和這次審查同時進行，結果出來另外交使用者決定。請審程式與規則文字是否一致，不必判斷 AI 會不會照做。

## 行為與風險

- 公開介面：`src/core/ai/` 的 `introBoxes`、`findItem`、`boxBatch`、`moveCandidates`（`move.ts`）、`planExisting`（`existing.ts`）、`planSources`（`existing-sources.ts`）、`clearExisting`、`takeOut`；`state` 的 `addCandidates`、`addExisting`（`ExistingRequest`、`ExistingResult`）；`src/obsidian/intro-run.ts` 的 `createIntroRunner`；`buildPrompt` 的 `提示 v3` 與 `ExistingTarget.first`；`check` 的 `candidate-suspect-format`；存草稿時疑似重複理由的 ID 轉連結。
- 主要呼叫端：閱讀模式的 post processor（`src/obsidian/intro-add.ts`）→ `main.ts` → `intro-run.ts` → `state`。
- 不可破壞的性質：
  - 加入只改兩篇卡組的字，不刪檔；從框裡**只拿掉自己搬的**（§4 第 4 步、§6 是 R8「只刪自己建的」在文字層的版本）：家長在中間改了那一項、目的地確認之後又變了、有兩個原文相同的項目，都不拿。**請特別查這一條**。
  - 先寫目的地、讀回確認，才拿掉來源；確認不了的留在框裡，重按只補缺的（已經在的不再加）。
  - 逾時的那一篇這次開著 Obsidian 的期間不再寫（§4〈逾時後晚到的寫入〉）。
  - 一次「加入」或「全部加入」只通知、重排一次。
  - 草稿、別科、沒有引言框的卡組解析與排程和 `main` 相同；手機不寫卡組。
- 已知邊界例子：任務說明 §7 的清單；已寫成測試的在 `tests/ai-add*.test.ts`、`tests/ai-check-suspect.test.ts`、`tests/intro-run-wiring.test.ts`、`tests/ai-cards.test.ts`、`tests/deck.test.ts` 的 `deckCases`。**§7 列了但沒寫成測試的**在任務說明〈結果〉的「延後的測試」與 backlog 技術債「補測：AI 製卡第 1 批」：請判斷裡面有沒有屬於改不回來、合併前要補的（D-195）。
- 明確延後：即時預覽的按鈕（P3 不成立，技術債「補做」）、R8 的刪除入口（§6）、工作紀錄與恢復按鈕（§4）。

## 驗證方式

- `npm run check`（Codex 在沙箱外跑，照 [quality.md](../docs/agents/quality.md#檢查指令)：一次等到結束）。
- 只跑這次的測試：`node --test --test-timeout=60000 tests/ai-add.test.ts tests/ai-add-move.test.ts tests/ai-add-state.test.ts tests/ai-add-existing.test.ts tests/ai-add-sources.test.ts tests/ai-add-clear.test.ts tests/ai-add-existing-state.test.ts tests/ai-check-suspect.test.ts tests/intro-run-wiring.test.ts tests/ai-cards.test.ts tests/ai-rules.test.ts tests/deck.test.ts`。
- 平台事實表（任務說明 §1 的 P1～P5，加上這次實機找到的一列）：

| 假設 | 探針 | 結果 |
|---|---|---|
| P1～P5（起訖行、`li` 順序、即時預覽、重畫、摺起） | Windows 版 Obsidian 1.15.1，開發命令 `intro` | P1、P2、P4、P5 成立；P3 不成立（只有閱讀模式） |
| 閱讀模式的分頁改 `view.editor` 再 `view.save()`，磁碟上留得住 | 開發命令 `intro-add` 第一次跑（修正前） | **不成立**：通知說加好了，磁碟的來源還是舊的；隱藏的編輯器也不跟著外部修改重讀。改成只有編輯模式的分頁走編輯器（`0693275`），修後四步都通過（任務說明〈結果〉） |
| 只開在閱讀模式的那一篇用 `vault.process` 寫，Obsidian 重讀、不把舊內容存回去 | 修後的 `intro-add`：同一個分頁連按四次，每次讀磁碟 | 成立（四次都照預期，沒有「還沒存進去」） |
| 編輯模式的分頁開著同一篇時（加入時另開一個編輯分頁） | 沒跑 | 待驗：單元測試只驗了交出的是編輯模式那個分頁的編輯器 |
| iPhone：加入的卡組同步後照常出題、引言框沒有按鈕 | 下一次 iPhone 實機測試 | 待驗 |

## 實作者自己選的做法

- **同一篇的項目**（`clearExisting`）：同一篇裡的幾項先一起從框裡拿掉，再對拿掉後的文字依序套 `planExisting`；有一項不成立就把它放回、重算整批，不留半套。
- **第 4 步回呼的重驗**（`state` 的 `existingBatch`）：目的地照 `tracker.text` 和確認時同一份、開著的編輯器的字相同、沒有未讀與等待中的讀取、`locate(id)` 還是同一篇，才交給 `clearExisting`。
- **來源清除逾時**：來源也記進 `locked`（和目的地逾時一樣），這次開著 Obsidian 的期間停用。
- **通知只一次**：沿用還原用的 `holdingNow` 計數與 `release()`，批次內每篇寫成照常採用，批次結束才重排、通知一次。
- **確認框**：轉成連結的單項不問；沒轉成連結的單項先問目的地（卡組、名稱、第一題），寫入時目的地的字變了就重新問；「全部加入」問項數與目的地篇數，沒核對過的另說一句；一直在變問三次就停（`CONFIRM_ROUNDS`）。
- **出處的教材端點**：兩篇各自用自己的材料清單（`resolveSource`）；連結的解析用 `metadataCache.getFirstLinkpathDest`。
- **閱讀模式**（Windows 實機後改，`0693275`）：只有開在編輯模式的分頁才交編輯器、做「還沒存進去」的比對、取最新的字；只開在閱讀模式的照沒開著處理。
- **疑似重複**：`check.ts` 的 `SUSPECT` 認 `理由：可能重複 <ID 或連結>｜<說明>`；格式不全（沒有 `｜` 與說明）的照樣不算進五個，另給 `candidate-suspect-format` 提示。存草稿時理由裡的 ID 只在加題的核對成立時轉成連結，其餘照原文、提示。
- **第一題**：圖換成「［圖］」、多行用「／」接、填空整行；比較卡送第一句（`tests/ai-cards.test.ts` 的 §5 第一題那個測試）。

## 回報

只審查，不改產品程式。寫在 `Claude Codex Discussion/2026-11-16-ai-cards-add-l2.md`，格式照 code-quality 的 `review.md`〈回報格式〉。
