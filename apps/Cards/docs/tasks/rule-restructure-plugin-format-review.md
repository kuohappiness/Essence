# 貼回擋同名（D-229 第 2 點）開工前的格式查核（給 Codex）

狀態：待審｜下一步：Codex 查任務說明 §4-1｜等誰：Codex

遵守 repo 根目錄的 `AGENTS.md`。建議推理等級：**高**。請**新開一個 session**。

依 [D-140](../../../../docs/decisions.md#d-140-fable-規劃opus-執行codex-查核) 第 4 點與 [quality.md〈開工前的格式查核〉](../../../../docs/agents/quality.md#開工前的格式查核)：[任務說明](rule-restructure-plugin.md) §4-1 會改兩處寫進 vault 的東西：

- **卡組**：家長選「併進已有的」時，程式把 AI 寫成新目標的那一項搬進「加進已有的學習目標」引言框，改名稱行。
- **快照**：本文照 AI 原文、併進的那一項不配 ID，`程式改動` 多兩種寫法。

任務說明其他節（§2、§3、§4-2、§5）不在這次的範圍；§5 只改送給 AI 的提示，存下來的格式不變，§5-2 改 syntax §2-9 備註種類那一列的字也請順便看一眼。

## 基準

這份請求所在的 commit，hash 寫進報告。`apps/Cards/docs/syntax.md` 還沒改：任務說明寫的是提案，和 syntax 不一致的地方請判斷該改哪一邊、syntax 要補哪幾句。

只讀：任務說明 §1、§4（全節）；D-229 全文（`node tools/decisions-index.ts D-229`）；[syntax](../syntax.md) §2-9、§6；`apps/Cards/src/core/ai/draft.ts` 的 `inspectReply`、`planDraft`；`apps/Cards/src/core/ai/reply.ts` 的拆篇；`apps/Cards/src/core/ai/existing.ts` 的 `itemUnits`、`planExisting`、`missingOf`；`apps/Cards/src/core/ai/publish.ts` 寫 `程式改動` 那一段；`apps/Cards/src/core/deck/base-form.ts`；`apps/Cards/src/core/deck/question-types.ts` 的 `pickKey`。要對照 `0.6.0` 的行為時用 `git show v0.6.0:<路徑>`。

## 查什麼

1. **同名的判斷**：英文兩個方向用 `learnedWord` 的取字、其他用整個名稱，`pickKey` 比。會不會把該分開的併在一起、或該問的沒問（一字多義 D-125、點選填空的組名、名稱含粗體或連結、最上層直接寫題目的）。
2. **搬進引言框**：名稱行改成 `- <ID> <已有的名稱>`、其他行原樣加 `> `。目標底下有記憶錨點、詳解、出處、多行答案、程式碼區塊、圖片、Tab 與空白混用時，讀回來的題目與補充是不是和原本的目標相同；新建的框放在哪裡才符合 §2-9 的順序；R3 三段時只動卡組段夠不夠。
3. **一篇搬空、全部搬空**：搬到最後一篇還有新目標的那一篇，和英文規則〈分篇與檔名〉一致嗎；全部搬空擋下存檔，有沒有更好又不加機制的做法。
4. **快照**：本文照 AI 原文、併進的不配 ID，和 §6「比對時：快照有、卡組沒有的是生成後刪掉的」、加深讀快照（`記穩目標`、`原有目標`、卡組段的 ID）會不會衝突；還是本文應該照搬過之後的樣子。`程式改動` 的兩種寫法夠不夠還原；舊版讀到新寫法會怎樣。
5. **中斷後繼續**：存草稿的恢復資料存做好的全文，中斷後不用再選，這樣夠不夠；家長在中斷期間改了已有的那一篇時怎麼辦（現有的 `addProblem` 核對是不是已經涵蓋）。
6. **和決定的矛盾**：§4 和 D-089、D-091、D-115、D-125、D-225、D-229、syntax §2-9 有沒有矛盾。
7. **邊界能不能寫成測試**：§4-3 的例子有沒有寫不成測試的；少了哪些例子。

## 回報

只回報，不改產品程式與文件。寫在 `apps/Cards/docs/Claude Codex Discussion/<日期>-rule-restructure-plugin-format-review.md`，標題下第一行寫狀態。每項寫觸發條件、預期與實際、影響、位置與證據，區分「已重現」與「看規格推斷」，另標真實路徑會不會發生；能用小腳本對現有程式驗證的就驗證。照 [D-207](../../../../docs/decisions.md#d-207-l2-的發現先分一定修可記限制交使用者選修法先收窄最後才加機制) 分：一定修、可記限制、交使用者選。
