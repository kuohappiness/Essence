# 英文的打字與排序的 L2 審查請求（給 Codex）

狀態：等審查（第一輪）

遵守 repo 根目錄的 `AGENTS.md`。建議推理等級：**高**。請**新開一個 session**。

## 審查對象

- repo：Essence Cards；worktree `.claude/worktrees/edit-markup-2ba4bd`；分支 `claude/english-typed-order-9bc4bb`。
- 待審 commit：`261c1bac5747d99624f6e3df0a56b2171f315061`；共同祖先：`4267c1a`（`main`）。這份請求在下一個 commit，只改這個檔。
- 程式的 commit：`5a4ca30`（初版）、`8f888c7`（依格式查核改）；其他是文件。

## 規格與優先順序

- [任務說明](english-typed-order.md) §1～§6；格式查核報告 `Claude Codex Discussion/2026-11-15-english-typed-order-format-review.md` 與後面〈Claude 的回應〉。任務說明和回應不一致時以任務說明為準，並回報。
- 決定：D-193 第 5、6、8、13 點；D-121、D-069、D-125、D-187、D-204、D-182 第 4 點、D-186、D-157。
- 格式：[syntax](../docs/syntax.md) §2-3（〈文法與不規則變化也打字〉〈英文的句子排序〉）、§2-7、§2-10、§5 的 `typed`、`retry`、`cell` 與句子排序的紀錄例子。

## 行為與風險

- 公開介面：`parseDeck(text, { subject })` 與 `Target.typing`、`Target.sentence`、`Target.pairWord`；`typedHint`、`baseForm`、`blanksIn`；`planToday` 的變化開始條件；`CardGroup.order.starts`；`check` 的 `english-typed-invalid`、`english-order-invalid`、`english-order-capital`。
- 不可破壞的性質：別科與沒寫科目的卡組解析結果和 `main` 相同（包括全詩順序卡）；中翻英、英翻中、比較卡、全詩順序卡的行為與紀錄不變；英文卡組裡排序卡的格與字鍵順序同一張卡重來不變；文字相同的詞塊互換不算錯。
- 已知邊界例子：任務說明各節的邊界例子；測試在 `tests/english-*.test.ts`。

## 驗證方式

- `npm run check`（Codex 在沙箱外跑，照 [quality.md](../docs/agents/quality.md#檢查指令)：一次等到結束）。
- 只跑這次的測試：`node --test --test-timeout=60000 tests/english-typed-deck.test.ts tests/english-typed-flow.test.ts tests/english-inflection-plan.test.ts tests/english-order.test.ts tests/english-order-ui.test.ts tests/english-ai-check.test.ts`。
- 平台事實表：

| 假設 | 探針 | 結果 |
|---|---|---|
| 多個 `＿＿` 在 Obsidian 的 `MarkdownRenderer` 渲染後，`rendered.ts` 的 `insertPickSlot` 各放一格、照順序 | Windows 版 Obsidian 1.15.1，獨立的使用者資料夾與暫存 vault，CDP 開今天的份、點鍵、對答案（[任務說明〈結果〉](english-typed-order.md#結果)） | 通過：三格照順序、句末 `.` 接在最後一格後、對答案後各自著色 |
| iPhone 的排版、朗讀與手感 | 下一次 iPhone 實機測試（backlog） | 待驗 |

## 實作者自己選的做法

- 英文的判斷在 `parseDeck` 一處（屬性的科目，沒寫時用選項），`readTyping`、`readSentence` 本身不看科目；`readOrder` 多一個 `english` 參數，只用來把沒寫 `全詩` 的讓給句子排序。
- `typedAnswer` 加一個 `label` 參數，只換錯誤訊息的開頭；判定不變。
- 句子排序沒有新增 `PoemOrder` 的欄位，另立 `SentenceOrder`；卡片接 `CardGroup.order`，用 `starts` 有沒有區分句子版面（`PickCard.tsx` 的 `SentenceBody`）。
- 開始條件裡「讀不懂停掉的英翻中」用 `history.held` 與 `incomplete`（`stopped`），條件和選候選時相同，扣掉被篩的、暫停的、寫錯的。
- 只有標點的格（`==?==`）不算詞塊，這一題照填空（任務說明 §4-1）。
- 格式查核的修正擠在一個 commit（`8f888c7`），因為 F1 的科目判斷改到每一項的入口；測試照查核項目分段。

## 回報

只審查，不改產品程式。寫在 `Claude Codex Discussion/2026-11-15-english-typed-order-review.md`，格式照 code-quality 的 `review.md`〈審查請求範本〉。
