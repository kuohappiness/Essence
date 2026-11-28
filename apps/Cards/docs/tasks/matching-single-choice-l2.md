# 配對與單選第 1 段（L2 審查請求）

狀態：待審｜下一步：第五輪（使用者選的窄查，只審兩個 commit），Codex 回報後 Claude 逐項核對｜等誰：Codex

遵守 repo 根目錄的 `AGENTS.md`。建議推理等級：**高**。請**新開一個對話**；只審查、不改產品程式，可以在隔離環境重現。

[任務說明](matching-single-choice.md) 的第 1 段（§1～§9）：學習目標底下一行 `選項：`，問答題的答案是其中一個時認成單選（`Target.kind` 的 `single`）；同一篇、選項組相同的單選目標在每天複習併成一張配對（一張最多 5 格），作答照點選填空；AI 製卡與加深的檢查、送給 AI 的已有目標與社會的規則跟著改。寫進筆記的新寫法、組卡、今天的份、作答與畫面，屬於高風險範圍。

## 審查對象

- 分支 `claude/project-thread-vpoerm`（PR 見任務說明的狀態行）；和 `main` 的共同祖先、待審 commit 寫在下面〈第一輪〉。
- 程式在七個 commit，照任務說明的章節：認法（§1～§3）、組卡與排程（§4）、畫面與紀錄（§5）、AI 草稿的檢查與加題核對（§6）、送給 AI 的清單與社會的規則（§6、§7）、比較工具與文件（§8、§9），最後一個是替身截圖看到的畫面修正（每一列底下的記憶錨點與詳解被 `Review.css` 的 `.ec-answer` 蓋掉間距與字級）。
- 沒有未提交的修改。

## 第一輪

- **待審**：共同祖先到這份請求所在的 commit（`git log -1 --format=%H -- apps/Cards/docs/tasks/matching-single-choice-l2.md`）的差異；共同祖先用 `git merge-base origin/main HEAD`。
- 報告寫在 `apps/Cards/docs/Claude Codex Discussion/2026-11-28-matching-single-choice-l2.md`（新檔），標「第一輪」。照 D-171，第四輪之後停下交給使用者。

## 第二輪

- **待審**：第一輪的待審 commit `c9caa03501811de832d5df8255d59e1e52ee6607` 之後、到這份請求所在的 commit 為止，不含合併的 commit（`git log --no-merges c9caa035..<請求所在的 commit>`），每個 commit 看自己的差異。中間併過一次 `main`（`ff5eafb6`），併進來的別的工作不在範圍內。
- **這一輪只讀**：[審查紀錄](<../Claude Codex Discussion/2026-11-28-matching-single-choice-l2.md>)的〈第一輪〉與〈Claude 回應（第一輪）〉、上面那些 commit 改到的檔案與相關的段落；第一輪沒有發現的地方不重審。
- **看什麼**：每一項是不是真的修好、有沒有帶進新的問題。特別是 R3 的跟著出（今天的份、剩幾張、單篇練習與小考）、R2 的多行答案判斷（對別的卡型有沒有影響）、R4 讓加進已有的框沒有題目也能過（有沒有放過不該過的）、新加的 `single-leak`（會不會擋掉正常的題目）。R1、R10 前半沒照建議改，理由在〈Claude 回應〉，不同意就再列。
- **第一輪之後改的寫法**：選項之間改成 `;;`（[D-250](../../../../docs/decisions.md#d-250-選項行的選項之間用兩個分號隔開)，使用者 2026-11-28 同意）：切法（`single.ts`）、錯誤訊息、送給 AI 的規則與清單（`prompt.ts`）、syntax §2-3、任務說明 §2 的邊界表，測試與往返範例跟著換。請看有沒有漏改、`;;` 會不會和別的寫法撞在一起（資料欄位的分隔、出處的切法、比較卡的組、舊版讀到的樣子）。
- **社會的規則先不送**（§7 開頭）：§7 再試一次停損成立，`pickRules` 拿掉第一輪時多收的科目與社會的那一段，回到和 `main` 一樣；送給 AI 的已有目標帶選項照送。請看拿掉之後版號、比較測試工具的任務段與測試是否一致。
- 報告寫在同一份紀錄的最後，標「第二輪」。

## 第三輪

- **待審**：第二輪報告的 commit `6840179c` 之後、到這份請求所在的 commit 為止（`git log --no-merges 6840179c..<請求所在的 commit>`），每個 commit 看自己的差異：第二輪 9 項各一個 commit，加上第 1 項整類的測試一個。
- **這一輪只讀**：[審查紀錄](<../Claude Codex Discussion/2026-11-28-matching-single-choice-l2.md>)的〈第二輪〉與〈Claude 回應（第二輪）〉、上面那些 commit 改到的檔案與相關的段落；前兩輪沒有發現的地方不重審。
- **看什麼**：每一項是不是真的修好、有沒有帶進新的問題。特別是：
  - 第 1 項：切開的組整組放進同一份、照整組的格數占時間（`plan.ts`）；整組放不下時第一張也不先放，今天的份有沒有因此少掉該出的、或「再複習一些」出得不完整。
  - 第 2 項：`readSingle` 拆出 `readOptionLines`（`single.ts`），解析的結果應該和之前完全一樣；框裡只補選項行的，會不會擋到寫對的。
  - 第 3 項：這次才變成單選的，連筆記裡原本的題目一起查；已經是單選的不查。
  - 第 7 項：最上層像選項行、不是目標的一般筆記也提示（第一輪的「一般筆記不提示」收回，理由在〈Claude 回應（第二輪）〉）：會不會在真的筆記裡誤報。
  - 第 1、3、4、7 項是前兩輪同一類的第 2 代（R3、R6、R5、R7），回歸改成整類的測試，請看列舉的範圍夠不夠。
- 報告寫在同一份紀錄的最後，標「第三輪」。

## 第四輪（最後一輪）

- **待審**：第三輪報告的 commit `0dea4524` 之後、到這份請求所在的 commit 為止（`git log --no-merges 0dea4524..<請求所在的 commit>`），每個 commit 看自己的差異：第三輪 5 項，第 1 項另有一個測試 commit。
- **這一輪只讀**：[審查紀錄](<../Claude Codex Discussion/2026-11-28-matching-single-choice-l2.md>)的〈第三輪〉與〈Claude 回應（第三輪）〉、上面那些 commit 改到的檔案與相關的段落；前三輪沒有發現的地方不重審。
- **看什麼**：每一項是不是真的修好、有沒有帶進新的問題。特別是：
  - 第 1、2 項：切開的每一張各自出（`plan.ts`）。今天的份與「再複習一些」各自完整嗎；沒進今天的份的那幾張，按「再複習一些」時照順序出、不重複不漏；配對超過上限照放只在今天的份還空著時。§4〈上限〉的改法還在等使用者確認，請只看程式和現在的 §4 一不一致。
  - 第 3 項：`asksWhichOf` 拿掉註解之後，看得到的「下列」「以下何者」還是擋得住。
  - 第 4 項：`parseDeck` 的 `bare` 預設關，卡組的解析結果應該和之前完全一樣；`blocksOf` 認分隔線之後，本文、候選框、給家長的備註的切法有沒有變。
  - 第 5 項：最上層要有 `;;` 才提示，有沒有漏掉該提示的寫法。
- 這是 D-171 的最後一輪：還有擋合併的發現就照樣列，Claude 交給使用者決定。
- 報告寫在同一份紀錄的最後，標「第四輪」。

## 第五輪（使用者選的窄查）

D-171 第四輪之後原本停，使用者 2026-11-28 在決定卡選「只查兩處再合併」。

- **待審**：只看兩個 commit 自己的差異：`21d58d22`（第四輪第 1 項，AI 草稿裡最上層的分隔線）與 `84b40b09`（使用者選同一組配對不切，拿掉切開）。`39335238`、`2a8f5807` 與文件 commit 不審。
- **這一輪只讀**：[審查紀錄](<../Claude Codex Discussion/2026-11-28-matching-single-choice-l2.md>)的〈第四輪〉與〈Claude 回應（第四輪）〉、任務說明 §4〈上限〉〈估時〉、這兩個 commit 改到的檔案與相關的段落；之前的輪次沒有發現的地方不重審。
- **看什麼**：
  - `21d58d22`：分隔線只在縮到還開著的某一項底下時接在那一項；最上層的自己一塊，清單在這裡結束，下一行另外判斷。第三輪 `blocksOf` 認分隔線想擋的情形（項目裡的分隔線）還擋得住嗎；候選框、加進已有、加深的切法有沒有變。
  - `84b40b09`：同一組幾個目標都是一張（`singleCardKey`），每天複習、單篇練習、小考、再複習一些都整組出、不重複不漏；今天的份照第三輪的規則算（排在組裡第一個要出的位置、占今天要出的格數，自己就超過上限時今天的份空著照放）。拿掉切開之後有沒有留下只為切開寫的程式或測試。
- **另外跑**：兩個正式 vault 的備份跑 `compare-versions`（`main` 對這個分支的 HEAD），回報差異數；vault 名稱用甲、乙。
- 還有擋合併的發現就照樣列，Claude 交給使用者決定，不再開下一輪。
- 報告寫在同一份紀錄的最後，標「第五輪」。

## 規格與優先順序

- [任務說明](matching-single-choice.md) §1～§9 與〈驗收〉；§10 之後是 Fable 的計畫審查與處理，〈結果〉寫了實作時自己定的幾件。
- [D-249](../../../../docs/decisions.md#d-249-配對與單選題目後面一行選項有一個要出就整組作答)、[D-233](../../../../docs/decisions.md#d-233-題型照形式分各科與題庫共用配對單選也進每天複習)、[D-178](../../../../docs/decisions.md#d-178-相似字用點字比較卡一格一個學習目標)、[D-191](../../../../docs/decisions.md#d-191-比較卡舊裝置整篇擋住每個字鍵一格就多放一句)（為什麼這次不加 `需要版本`，任務說明 §2〈舊版〉）、[D-210](../../../../docs/decisions.md#d-210-點選填空的勾選寫在任務段加深也帶英文送學過的單字)（`pickRules` 製卡與加深共用）。
- 寫法的正式規範：[syntax §2-3〈單選與配對〉](../syntax.md#單選與配對點選作答)、[§5](../syntax.md#5-複習紀錄)。規格衝突時列成問題，不挑容易通過的那份。

## 行為與風險

- **公開介面**：`src/core/deck/types.ts` 的 `Kind` 多 `{ id: 'single'; single: Single }`、`ProblemCode` 多 `options-invalid`；`src/core/study/types.ts` 的 `CardGroup.single?: true`；`src/core/study/index.ts` 多 `singlePreviewCards`；`src/review/index.ts` 多 `singleQuestion`、`singleExtras`；`src/core/ai/prompt.ts` 的 `ExistingTarget.options?`、`optionsOf`、`optionsSuffix`、`optionsRule`；`EXISTING_WHY.singleLost`。
- **呼叫端**：認法在 `src/core/deck/kinds/single.ts`、`question-types.ts`（`readKind` 最後才認）、`parse.ts`（收選項行、寫錯與放錯位置的提示）；組卡在 `src/core/study/compose.ts`（`singleCardKey`、`singleCardOf`、`singlePreviewCards`）、`plan.ts`（跟著出的那幾格）、`session.ts`、`practice.ts`、`src/review/preview.ts`；畫面在 `src/review/single.ts`、`src/ui/PickCard.tsx`、`PickCard.css`；AI 在 `src/core/ai/check.ts`、`existing.ts`、`prompt.ts`、`deepen-prompt.ts`、`job.ts`；工具在 `tools/compare/adapter.ts`、`tools/rule-test/tasks.ts`。
- **不可破壞的性質**：
  - 沒有選項行的卡組：解析、今天的份、作答、紀錄、畫面都和 `main` 相同（`tests/single-compare.test.ts` 對 `v0.6.0` 零差異；合併前在使用者的電腦對兩個正式 vault 跑 `compare-versions`）。
  - 舊版（`v0.6.0`）讀新寫法照一般的問答出、選項行在背面、沒有提示，每一題的指紋相同；讀單選卡寫的紀錄行，每一行都是合法的作答（`tests/single-old-version.test.ts`）。
  - 一格只對一個目標，一個目標一行紀錄；沒到期的那幾格也記；回看改評分整張一起改。
  - 寫回筆記冪等：補 ID、加進已有、搬候選不動選項行（`tests/helpers/source-edit-cases.ts` 的三個「單選：」、`tests/helpers/add-cases.ts` 的兩個新例子，跟著 `tests/deck.test.ts` 的往返與冪等）。
- **已知邊界例子**（起點，請找新的組合）：任務說明 §2 的邊界表（每一列在 `tests/single-deck.test.ts`）；名稱同時像別的卡型又帶選項行（`寨（寨、塞） 相似字`、`長（ㄓㄤˇ、ㄔㄤˊ） 讀音`、`… 排序`、`… 接句`、英文的 `… 文法`）；同一篇 8 個同組的新目標（兩張，5＋3）；同一組有暫停的目標；今天答過又到期（只出答錯的）；單篇練習與小考（mates 從那一輪的目標）；兩列同一個答案；同一組兩個目標寫法或順序不同的選項。
- **明確延後**：每題自己的選項（寫在題目底下的不認，晚一版）、「同一篇兩組選項只差一項」的提醒（§6〈提醒級不做〉）、iPhone 實機（技術債「補測：單選與配對的 iPhone 實機」）。

## 驗證方式

- 在 `apps/Cards` 裡 `npm ci`、`npm run check`（型別、lint、knip、全部測試）。每個改程式的 commit 的 pre-commit 在雲端 Linux 跑過完整檢查。
- 新的測試：`tests/single-deck.test.ts`、`single-old-version.test.ts`、`single-queue.test.ts`、`single-ui.test.ts`、`single-ai-check.test.ts`、`single-ai-existing.test.ts`、`single-ai-prompt.test.ts`、`single-compare.test.ts`；改到的：`card-kinds.test.ts`、`question-types.test.ts`、`pick-render.test.ts`、`deck.test.ts`、`boundaries.test.ts`、`ai-cards.test.ts`、`ai-deepen.test.ts`、`ai-materials.test.ts`。
- `single-old-version.test.ts`、`single-compare.test.ts` 要 clone `v0.6.0` 的標籤（`git fetch --tags`）。
- **還沒跑的**：Windows 版 Obsidian 看畫面、兩個正式 vault 的 `compare-versions`、§7 改過的規則再試一次（合併前在使用者的電腦做）。畫面在雲端用替身拍過（375、1100 寬），替身的 Markdown 渲染是簡化的。
- **平台事實**：字鍵一排幾個照 375px 寬的手機估字寬（`PickCard.tsx` 的 `singleColumns`：中文一個字算一個字高、其他 0.6 個，字級照比較卡），沒在 iPhone 量過。

## 實作者自己選的做法

請先看這些（任務說明〈結果〉第 1 段有同一份）：

1. 跟著出的那幾格（沒到期、同一組）在今天的份裡，今天剩幾張與進度都算它們；秒數照每一格自己的，不占每天的時間上限。
2. 單篇練習與小考：同一張卡的其他格從那一輪的目標裡找，不從整篇找。
3. 5 格一張照筆記順序切，算同一篇、同一組選項、讀得懂又有 ID 的目標，暫停的也佔位置（暫停的不出，那一張少一格）。
4. 同一天答過的那一組再出時，只出答錯的（照比較卡的 `joins`）。
5. 加題核對：原本是單選、或這次加了選項行，加完卻不是單選的，都用 `singleLost`（比較卡加選項行也是）。
6. 「下列」「以下何者」：同一份草稿看得到選項行時升成錯誤；看不到的（選項行只在筆記裡），寫進筆記前擋（第一輪 R6 之後改的）。
7. 送給 AI 的說明只在清單上有單選目標時送，寫在「另外」底下；比較測試工具的 `ONE_LINE`、`LEAN_LINE` 不改。
8. 「以上皆是」報在名稱那一行。

## 回報與權限

照 code-quality 的審查請求範本：每項發現寫觸發條件、預期／實際、影響、位置與證據，區分「已重現」「靜態推斷」「待驗證」，另標真實路徑會不會發生與發生機率。可以回報「規格本身有漏洞」。報告頭尾寫待審 commit、審查範圍、測試結果與沒驗的項目及原因。
