# 接句卡的 L2 審查（給 Codex）

狀態：第一輪已修，等第二輪（[報告](<../Claude Codex Discussion/2026-11-15-couplet-cards-review.md>)）

遵守 repo 根目錄的 `AGENTS.md`。建議推理等級：**高**。請**新開一個 session**，沒參與實作。

[任務說明](couplet-cards.md)：名稱結尾是 `接句` 的填空卡改成接句卡的畫面，同一聯兩張隔開出，新的全詩順序卡等同一首的新接句卡出完。改到全部卡與每日的份的選卡順序，屬於 [quality.md](../docs/agents/quality.md#高風險範圍要做-l2) 的高風險範圍（排程）。紀錄與卡組的格式沒改，不需要格式查核。

## 1. 審查對象

- worktree：`.claude/worktrees/musing-kowalevski-696591`；分支 `claude/couplet-cards-d27469`。
- 共同祖先：`main` 的 `4267c1a`。
- 待審：同一分支上 `4267c1a` 之後的 commit，完整 SHA 見 PR 描述，寫進報告。沒有未提交的修改。
- 看 `git diff 4267c1a <待審> -- src tests docs/syntax.md`。

## 2. 規格與優先順序

1. [D-185](../docs/decisions.md#d-185-接句卡改成一聯兩句挖一句)（畫面、認法、第 7 點的分行）；[D-189](../docs/decisions.md#d-189-小考前的密集複習成對的卡隔開單篇練習與小考標記) 第 1 點（接句的配對、全部卡與每日的份都隔開、找不到時盡量穿插、全詩順序卡的初學順序）；[D-183](../docs/decisions.md#d-183-國語一課分成幾篇古典詩做接句) 第 4 點（兩句同樣大小、解釋分行）；[D-184](../docs/decisions.md#d-184-複習畫面不寫記憶錨點四個字改成圖示)（燈泡只在第一行）。
2. [任務說明](couplet-cards.md) §1～§5 的細節（任務說明自己的選擇，見第 5 節）。
3. 已有的行為：[練習任務](quiz-practice.md) §2（英文的配對與 `chooseSpaced`）、D-069（每日的份的英文兩個方向）、[題型接點](question-type-seam.md) §5（比較卡的併卡）。

規格之間有衝突請列成問題，不挑容易通過的那份。

## 3. 行為與風險

公開介面與呼叫端：

- `readCouplet`（`src/core/deck/question-types.ts`）由 `parse.ts` 呼叫，結果放 `Target.couplet`（`title`、`index`、`lines`、`notes`）。
- `partners(items, english)`、`apartOf`、`chooseSpaced`、`answeredAfter`、`holdOrders`（`src/core/study/practice.ts`）：`practiceNext` 用 `english = true`；`session.ts` 的 `nextCard`（每日的份、單篇、「再複習一些」）用 `english = false`。
- 畫面：`src/ui/screens.tsx` 的 `QaCard`（翻面與打字共用）、`src/ui/Review.css` 的 `.ec-couplet*`。

不可破壞：

- 英文兩個方向在全部卡的順序與隔開、每日的份照 D-069 的行為不變（現有測試全過）。
- 不是接句卡、不是全詩順序卡的目標，每日的份的選法不變：到時間的最早那張 → 範圍順序的第一張新的 → 等最快到時間的那張；`early` 的判斷不變。
- 比較卡的併卡、全詩順序卡的作答與紀錄不變。
- 紀錄、卡組格式、FSRS 都不變；舊版外掛照一般填空出。

已知邊界（已寫成測試）：一首絕句初練第 1、3、2、4 句；兩首一起練先出每一對的第一張；答錯再出照隔開；沒有詩名或編號重複不配對；段考範圍只含排序卡；排序卡學過時不等；分句遇到右引號、空格裡的標點、沒有標點、半形標點。請找新的組合，例如：律詩八句、同一篇兩個同名小標題、編號跳號（只有第 1、2、5 句）、接句卡被暫停或不在範圍裡時排序卡會不會一直等、「再複習一些」（`more`）裡的配對、全部卡這一輪中途有同步進來的作答、跨午夜（`today` 過期）、單篇入口、預覽、回看。

明確延後：翻面後自動念兩句（跟著中文朗讀做）；記憶錨點子項目的新排法用在接句卡以外的卡；同一首詩分在今天的份與「再複習一些」兩邊。

## 4. 驗證方式

- `npm run check`：在待審 commit 上通過（2661 個測試），結果見 PR 描述。
- 新測試：`tests/couplet-deck.test.ts`（認法 4 項）、`couplet-queue.test.ts`（佇列 7 項）、`couplet-ui.test.ts`（畫面 3 項，hook 替身）。單獨跑：`node --test --test-timeout=60000 tests/couplet-*.test.ts tests/poem-order-queue.test.ts`。
- Windows Obsidian 1.15.1 實機看過畫面（獨立的 user-data-dir 與暫存 vault、CDP 截圖，見任務說明〈結果〉）；iPhone 沒跑，已記進 [backlog〈下一次 iPhone 實機測試〉](../docs/backlog.md#v1-需要做的任務)。
- 完整的 `npm run check` 要在沙箱外跑，照 [quality.md](../docs/agents/quality.md) 的〈檢查指令〉那一段。

## 5. 實作者自己選的做法（請先看）

1. **接句卡不是新的題型**：照全詩順序卡（點選填空的一種）的前例，接句卡是翻面卡的一種，`questionType` 仍是 `flip`，作答流程不變；只在畫面多一個分支。
2. **分句在解析時做**：`Couplet.lines` 存原文（含 `==…==`），每一句交給一個 `Markdown` 用填空模式各自渲染，放在 `display: flex; flex-wrap: wrap` 裡、每句 `white-space: nowrap`：放得下同一行，放不下換行，不用量寬度。
3. **底線長度**：挖掉的字照樣排版、只把透明度設成 0，底線就是那句的長度；翻面只改透明度。
4. **記憶錨點**：只有接句卡、而且是第一個 `記憶錨點：` 那一項，改用解析器分好的 `notes` 一行一列（不走 `anchorBreak`，所以 `記憶錨點：一行寫完` 的冒號不再拆成兩行）。
5. **每日的份也照 `chooseSpaced`**：作答從今天的開始算；配對只看這個範圍裡的卡，對方不在範圍裡但今天答過也算。英文不配對（D-069）。
6. **排序卡的初學順序**：`holdOrders` 只在排序卡本身是新卡、同一篇同一個小標題還有新的接句卡沒出時先拿掉；小標題是 null 時不擋。接句卡和排序卡用小標題對，不用名稱。
