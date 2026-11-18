# 閱讀模式按「啟用」寫不進去的修正 L2 審查

狀態：待審（2026-11-19）

## 審查請求（第一輪）

- **審查對象**：分支 `fix/activate-reading-mode`，基準 `main` 的 `137967f`（完整 SHA 用 `git rev-parse 137967f`），待審 commit 是這個分支的 HEAD（只有一個改程式的 commit，加上這份請求）。差異只有 `src/obsidian/deck-status.ts` 與 `tests/deck-status-wiring.test.ts`：`git diff 137967f HEAD -- src tests`。
- **背景**：`0.6.0` 已凍結在 `02b12bd`，準備 iPhone 測試時在 Windows 版 Obsidian 找到這個問題（[上線前清單〈結果〉的「準備時找到的問題」](../tasks/release-0.6.0.md#結果)）。使用者決定這一版修：合併後重新凍結。所以這次只審這個修正與它影響的路徑，不擴大範圍。
- **規格與優先順序**：
  - 草稿的「啟用」：[tasks/ai-cards-mvp.md §7](../tasks/ai-cards-mvp.md)；目錄的暫停／恢復：[tasks/quiz-practice.md §5](../tasks/quiz-practice.md)、[D-183 第 6 點](../docs/decisions.md#d-183-國語一課分成幾篇古典詩做接句)。quiz-practice.md §5 的驗收寫「筆記開著、編輯器裡有沒存的修改 → 照存檔受阻處理，不覆蓋」；`deck-status.ts` 原本的檔頭註解寫「開著的筆記走編輯器（和存檔同一條），沒開著的走檔案」。
  - 引言框的「加入」修過同一個原因：[tasks/ai-cards-add.md](../tasks/ai-cards-add.md) 與 `src/obsidian/intro-run.ts` 的 `editingView`（第 130～137 行的註解，Windows 實機 2026-11-16）；加深的寫入在 `src/main.ts` 第 239～241 行也是同一種寫法。
  - 這次把「開著的筆記」收窄成「開在編輯模式的筆記」，和上面兩處一致；檔頭註解跟著改，任務說明的字沒有改：請判斷這算不算和規格衝突、要不要改任務說明。
- **行為與風險**：
  - 公開介面：`changeDeckStatus`、`activateDeck`，都走 `change()`。呼叫端：`src/main.ts` 第 219 行（標題列與命令的「啟用」，經 `src/obsidian/deck-actions.ts` 的 `askActivate` 確認）與第 416 行（目錄的暫停／恢復）。只在電腦（`Platform.isDesktopApp`）。
  - 不可破壞的性質：開在編輯模式、還沒存進去的字不被覆蓋（仍回「還沒存進去的修改」）；寫成的狀態真的在磁碟上；只開在閱讀模式時，寫檔之後 Obsidian 重讀，閱讀畫面跟著變；寫入本身與核對（`stale`、`saved`、`failed`）的結果和提示不變。
  - 已知的邊界例子（新測試涵蓋前兩個）：只開在閱讀模式、隱藏的編輯器比磁碟舊；同一篇同時開在閱讀與編輯模式；還沒載入的分頁；編輯模式有沒存的字。請找新的組合，例如：按下確認框到寫入之間使用者切換模式；兩個分頁都在閱讀模式；同一篇在別的視窗（彈出視窗）開在編輯模式；閱讀模式的分頁在寫檔後重讀之前又被按一次。
  - 明確不在範圍：三處 `editingView` 要不要抽成共用函式（見下面〈實作者自己選的做法〉）；`deck-actions.ts` 的按鈕顯示與確認框。
- **驗證方式**：
  - 實作者跑過：先寫的兩個新測試在修之前失敗（第一個回「這篇筆記有還沒存進去的修改…」，第二個交了編輯器），修之後 `tests/deck-status-wiring.test.ts`、`tests/deck-status.test.ts`、`tests/entry-ui.test.ts` 共 51 個通過；commit 時 pre-commit 照分派跑 Cards 的完整檢查（型別、ESLint、knip、共用檢查、測試），結果寫在下面〈實作者的檢查結果〉。
  - Codex 的沙箱照 `docs/agents/quality.md`〈檢查指令〉：只跑和發現有關的測試（`node --test --test-timeout=600000 <檔>`），失敗的逐項列出並說明是不是環境造成的；完整的 `npm run check` 不用在沙箱跑。
  - 平台事實表：

    | 事實 | 依據 | 狀態 |
    |---|---|---|
    | 閱讀模式的分頁改隱藏的編輯器，`view.save()` 沒寫進磁碟，之後那個編輯器不跟著外部修改重讀 | Windows 版 Obsidian 1.15.1：2026-11-16 引言框的開發命令、2026-11-18 草稿在閱讀模式按「啟用」（照常繪製下用暫存草稿重現兩次） | 實機看過 |
    | 只開在閱讀模式時走檔案，Obsidian 收到修改會重讀閱讀畫面 | 2026-11-18 準備 iPhone 測試時在閱讀模式按「加入」兩次（`intro-run.ts` 走檔案的路），畫面跟著更新 | 實機看過（「加入」這條路）；「啟用」這條路合併後在測試 vault 實測 |
    | iPhone 沒有這個按鈕 | `main.ts` 的 `Platform.isDesktopApp` | 程式 |

- **實作者自己選的做法**（請先看這些）：
  1. 照 `intro-run.ts` 的寫法在 `change()` 裡加 `each.getMode() === 'source'`，不抽共用函式：凍結中的版本只放最小的修正；三處重複的寫法要不要合併，請判斷是現在做、記進技術債，還是不用。
  2. 「還沒存進去的修改」只和編輯模式的分頁比；只開在閱讀模式時不比對，直接走和「沒開著」相同的檔案路徑（`deck-status.test.ts` 已經測過那條路的寫入與核對）。
- **回報與權限**：只審查，不改產品程式；可以在系統暫存資料夾重現，結束前刪掉。每項發現照 `.claude/skills/code-quality/review.md`〈審查請求範本〉的「回報與權限」寫：軸、觸發條件、預期／實際、影響、真實路徑會不會發生與發生機率、位置、證據（已重現／靜態推斷／待驗證）、建議處理。最後寫待審 commit、範圍、跑了哪些測試與沒驗的項目。

### 實作者的檢查結果

待審的程式 commit `d0b5d46694d7dfd8432dd08c83a213ec896cda38`，基準 `137967fd2aaa599a3783a85eea44a820ba57c169`。commit 時 pre-commit 照分派跑 Cards 的完整檢查（Windows、Node v24.13.0，在只有暫存內容的副本）：`tsc --noEmit`、ESLint、knip、`tools/` 的共用檢查（文件、secretlint、本機路徑、skill 副本、外掛之間不 import、進度白板）、`npm test` 都通過；測試用 dot reporter，印了 3,019 個點、沒有失敗的項目（這個 reporter 不印總數）。
