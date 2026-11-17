# AI 製卡第 3 批（送給 AI 的材料）的 L2 審查請求（給 Codex）

狀態：第二輪審完、發現已修（2026-11-17）；第一輪的報告與回應在 [討論稿](<../Claude Codex Discussion/2026-11-17-ai-cards-materials-l2.md>)

遵守 repo 根目錄的 `AGENTS.md`。建議推理等級：**高**。請**新開一個 session**。

## 審查對象

- repo：Essence Cards；worktree `.claude/worktrees/ai-cards-materials-0a4b27`；分支 `claude/ai-cards-materials-b3`（PR 見任務說明的狀態行；base 是第 2 批的分支 `claude/ai-cards-deepen-04562a`，第 2 批合併後改成 `main`）。
- 待審 commit：這份請求所在 commit 的上一個；hash 寫進報告。
- 範圍：`origin/claude/ai-cards-deepen-04562a..HEAD` 裡這一批的程式與測試：`af90394`（程式與測試）、`93b23b8`（規則檔與 `rules.ts` 的版號）、`1c011cf` 的衝突解法（只有 `src/obsidian/deepen.ts` 的 `formOf`）。第 2 批本身的程式不在範圍，那邊有自己的 L2。只改文件的 commit 只需要對照規格。
- 沒有未提交的修改。

## 規格與優先順序

- [任務說明](ai-cards-materials.md) §0～§7 與〈結果〉（〈結果〉寫了和規格不同的兩處）；決定 [D-210](../docs/decisions.md#d-210-點選填空的勾選寫在任務段加深也帶英文送學過的單字)，以及 D-125、D-182、D-192、D-193 第 10、13 點；syntax §2-3 第二個意思那一條；英文預設 §2、§5 B、§5 C；國語預設〈相似字〉；規畫 `docs/plans/similar-chars.md`〈卡組怎麼寫〉。
- 第 1 批（引言框的加入）與第 2 批（加深）的行為不應改變，只多送任務段的幾行。
- 規格衝突時列成問題，不挑容易通過的那份。

## 行為與風險

- 公開介面：
  - `src/core/deck/`：`learnedWord`（`base-form.ts`，和 `baseForm` 共用去括號）、`pickKey` 改成匯出。
  - `src/core/ai/prompt.ts`：`learnedWords`、`existingDecks`（和 `existingTargets` 共用篩選）、`pickLine`、`wordsLine`、`pickRules`、`CardForm.pick`、`提示 v4`；`deepen-prompt.ts` 的 `words` 與 `加深 v2`；`job.ts`、`deepen-job.ts` 的 `isForm` 接受沒有 `pick`；`rules.ts` 每一科的 `pick` 預設。
  - `src/state/index.ts` 的 `aiWords`；`src/ui/prefs.ts` 的 `picks`／`savePick`；`src/obsidian/ai-cards.ts`、`ai-cards-modal.ts`、`deepen.ts`、`deepen-modal.ts`、`src/main.ts` 的接線。
- 不可破壞的性質：
  - 已有目標的清單（`existingTargets`）和第 1 批相同：篩法搬進 `existingDecks` 之後順序、內容不變。
  - `baseForm`（打字卡第 2 步的原形）結果不變。
  - 這一版之前存的製卡與加深工作照樣讀得懂、能貼回。
  - 不寫使用者的卡組；勾選只存在這台電腦。
- 請特別看：
  - `learnedWord` 對各種名稱的結果：粗體、螢光筆、半形括號的意思（`lie(躺) 過去式`）、片語、隱含題（最上層直接寫題目）、名稱只有括號、全詩與比較卡的名稱；`pickKey` 去重會不會把不該合的字合在一起。
  - 任務段的兩種寫法和英文預設、國語預設、R3 的說法有沒有衝突，AI 會不會照錯（例如沒勾時國語的相似字、英文的排序）。
  - 換科目時勾選照那一科記的值；「接著貼回」的舊工作、加深沒記過時的預設。
- 已知邊界例子：`tests/ai-materials.test.ts`、`tests/ai-cards-flow.test.ts` 的 §2-1、`tests/ai-deepen.test.ts` 的 D-210 那一題。請找新的組合。
- 明確延後：無。真的貼給 AI 的試用照製卡規則的試用另排。

## 驗證方式

- `npm run check`（在沙箱外跑，照 [quality.md](../docs/agents/quality.md#檢查指令)：一次等到結束，不要短間隔查進度）。每個 commit 在 pre-commit 都跑過。
- 只跑這批：`node --test --test-timeout=300000 tests/ai-materials.test.ts tests/ai-cards.test.ts tests/ai-cards-flow.test.ts tests/ai-deepen.test.ts tests/ai-deepen-flow.test.ts tests/deck.test.ts tests/ai-rules.test.ts tests/boundaries.test.ts`。
- 平台事實表：

| 假設 | 探針 | 結果 |
|---|---|---|
| `app.loadLocalStorage`／`saveLocalStorage` 存物件、重開製卡畫面讀得回來 | Windows 版 Obsidian 1.15.1（獨立的 Obsidian、暫存 vault、CDP） | 成立 |
| 兩個畫面的勾選與說明顯示在表單格線裡 | 同上，截圖 | 成立 |

- 實作者沒跑：真的貼給 AI、另一台電腦。

## 實作者自己選的做法

1. 勾選的規則放在任務段的「另外」底下，任務資料只留一行 `- 點選填空：要／不要`。
2. 「記住」在工作存好之後、放進剪貼簿之前；`savePick` 和既有的 `saveLast` 一樣沒有包 try/catch（存不進這台電腦時，前一步存工作通常已經先失敗）。
3. 單字清單只取英翻中、中翻英與不規則變化；比較、文法、排序的名稱不取字。
4. 加深的 `copy` 多一個選填的 `pick`，沒給照這一科記的值（開發命令與測試沿用三個參數）。
5. 沒有規則的科目（`RULE_SUBJECTS` 有、建置沒嵌規則）預設照規則表，只是那一科選不到。

## 回報

只審查，不改產品程式；可以在隔離環境重現。寫在 `Claude Codex Discussion/2026-11-17-ai-cards-materials-l2.md`，標題〈第一輪〉；格式照 code-quality 的 `review.md`〈回報格式〉：每項寫軸、觸發條件、預期／實際、影響、真實路徑會不會發生與發生機率、位置、證據（已重現／靜態推斷／待驗證）、建議處理；最後一行寫沒測的項目與原因。
