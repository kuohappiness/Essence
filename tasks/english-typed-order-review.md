# 英文的打字與排序的 L2 審查請求（給 Codex）

狀態：草稿，等格式查核的結果改完任務說明再送

遵守 repo 根目錄的 `AGENTS.md`。建議推理等級：**高**。請**新開一個 session**。

## 審查對象

- repo：Essence Cards；worktree `.claude/worktrees/edit-markup-2ba4bd`；分支 `claude/english-typed-order-9bc4bb`。
- 待審 commit：（送審時填完整 SHA）；共同祖先：`4267c1a`（`main`）。沒有未提交的修改。

## 規格與優先順序

- [任務說明](english-typed-order.md) §1～§6；格式查核報告 `Claude Codex Discussion/2026-11-15-english-typed-order-format-review.md`與 Claude 的回應。
- 決定：D-193 第 5、6、8、13 點；D-121、D-069、D-125、D-187、D-204、D-182 第 4 點、D-186。
- 格式：[syntax](../docs/syntax.md) §2-3（〈文法與不規則變化也打字〉〈英文的句子排序〉）、§2-7、§5 的 `retry`。

## 行為與風險

- 公開介面：`parseDeck` 的 `Target.typing`、`Target.sentence`、`Target.pairWord`；`typedHint`；`planToday` 的變化開始條件；`CardGroup.order.starts`；`check` 的 `english-typed-invalid`、`english-order-invalid`。
- 不可破壞的性質：中翻英、英翻中、比較卡、全詩順序卡的行為與紀錄不變；讀不成打字的文法與變化不會停掉目標；排序卡的格與字鍵順序同一張卡重來不變。
- 已知邊界例子：任務說明各節的邊界例子；測試在 `tests/english-*.test.ts`。

## 驗證方式

- `npm run check`（Codex 在沙箱外跑，照 [quality.md](../docs/agents/quality.md#檢查指令)：一次等到結束）。
- 只跑這次的測試：`node --test --test-timeout=60000 tests/english-typed-deck.test.ts tests/english-typed-flow.test.ts tests/english-inflection-plan.test.ts tests/english-order.test.ts tests/english-order-ui.test.ts tests/english-ai-check.test.ts`。
- 平台事實表：多個 `＿＿` 在 Obsidian 渲染後各放一格（`rendered.ts` 的 `insertPickSlot`）只在 happy-dom 的替身測過，Windows 版 Obsidian 待驗；iPhone 的排版記進下一次實機測試。

## 實作者自己選的做法

（送審時填）

## 回報

只審查，不改產品程式。寫在 `Claude Codex Discussion/2026-11-15-english-typed-order-review.md`，格式照 code-quality 的 `review.md`〈審查請求範本〉。
