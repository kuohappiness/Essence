# 預覽畫面的單張卡回饋（L2 審查請求）

狀態：待審｜下一步：Codex 在使用者電腦做第一輪 L2，報告寫進審查紀錄｜等誰：Codex

遵守 repo 根目錄的 `AGENTS.md` 與 `apps/Cards/AGENTS.md`。建議推理等級：**高**。請**新開一個對話**；只審查、不改產品程式，可以在隔離環境重現。

[任務說明](card-feedback.md)（[D-246](../../../../docs/decisions.md#d-246-單張卡的回饋有空才留先給開發者拿來改製卡規則與評分說明) 第 4-3、5 點）：設定頁「預覽時可以留回饋」打開時，預覽的每張卡多一列回饋（可以用、要改、不要這張、四個標籤、一句話），每一次動作追加一行到 `Essence Cards/紀錄/回饋/<年-月> <裝置碼> 回饋.jsonl`（格式在 [syntax §11](../syntax.md#11-回饋紀錄)）；還原不列也不補回這個資料夾。開工前的格式查核由 Fable 5.2 high 代查（[回報](<../Claude Codex Discussion/2026-11-28-card-feedback-format-review.md>)），處理在任務說明 §2 的表。

## 審查對象

- 分支 `claude/project-thread-5xhx0r`（PR 見任務說明的狀態行）；共同祖先用 `git merge-base origin/main HEAD`。
- 程式在兩個 commit：`1001e64e` 設定頁的開關與回饋列的畫面（review 的狀態、`Feedback.tsx`、`Review.tsx` 的按鍵與 `inert`）；之後一個是紀錄的寫入（`src/core/feedback/`）、`main.ts` 的接線、還原的例外（`plan.ts` 的 `listed`）、錯誤紀錄的 `where: "feedback"`、格式查核的修正與 syntax §11。其他是文件與合併 `main` 的 commit，不在範圍內。

## 第一輪

- **待審**：共同祖先到這份請求所在的 commit（`git log -1 --format=%H -- apps/Cards/docs/tasks/card-feedback-l2.md`），不含合併的 commit，每個 commit 看自己的差異。
- **讀**：任務說明全篇、syntax §11 與 §9（錯誤紀錄，回饋紀錄照它寫）、格式查核回報；決定 D-246、D-155、D-161、D-163 第 6 點、D-150 第 7 點。
- **看什麼**（高風險：寫進 vault 的新紀錄檔與還原分類，[quality.md〈高風險範圍〉](../../../../docs/agents/quality.md#高風險範圍要做-l2)）：
  - 寫出來的行和 syntax §11 一致：欄位與順序、`run`、`t` 嚴格遞增、`cells` 的去重、`card` 的切法（比較卡與多音字帶整組、CRLF、Tab、目標裡的空行）、16,000 bytes 的截短、1,000 行的上限、跨月換檔。
  - 舊版與其他讀者：`0.6.0` 與現在的程式（複習紀錄、版本回報、讀取閘門、加深、資料夾防呆、比較工具）都不讀 `紀錄/回饋/`；還原的例外只擋這個資料夾。
  - 預覽的狀態：沒存到時「再存」寫的是現在的整份、評等不會被取消；先送的晚回來、關掉預覽之後才回來的結果；同一份回饋照每一格的 ID 與指紋算（查核 F7）。
  - 畫面：回饋列不在 `.ec-stage` 裡（點卡片、滑動不觸發）；「寫一句」的框開著時按鍵只交給框，背後 `inert`；一般複習的畫面完全沒有回饋列；設定頁的開關只存這台、缺值與壞值是關。
  - 預覽照舊不寫複習紀錄、不動排程（D-161）。
- 報告寫在 `apps/Cards/docs/Claude Codex Discussion/<審查那天>-card-feedback-l2.md`（新檔），標「第一輪」。每項寫觸發條件、預期與實際、影響、位置與證據，區分「已重現」與「看程式推斷」；照 [D-207](../../../../docs/decisions.md#d-207-l2-的發現先分一定修可記限制交使用者選修法先收窄最後才加機制) 分。照 [D-171](../../../../docs/decisions.md#d-171-省-token-靠縮短上下文不靠少審或換模型)，第四輪之後停下交給使用者。

## 驗證方式

- 必跑：在 `apps/Cards/` `npm ci`、`npm run check`。舊版的測試（`tests/feedback-old-version.test.ts`）會 clone 這個 repo 取出 `v0.6.0`，要有完整的 tag。
- 平台事實（任務說明 §6 的表）：iPhone 的鍵盤與語音輸入、375 px 擠不擠、一行接近 16,000 bytes 的 `append` 在 iPhone 上，這裡驗不了，記在技術債「補測：預覽回饋的 iPhone 實機」；請只看程式有沒有讓它們更容易出錯。

## 結果

延後的測試：（審完後填）
