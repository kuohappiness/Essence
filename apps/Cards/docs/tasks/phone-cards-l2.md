# 手機 AI 製卡（D-226 第一步，Codex L2 審查請求）

狀態：已結案 → [任務說明](phone-cards.md)｜完成：四輪審完（第一輪審 `27da3550`、第二輪 `dfb7f5ed`、第三輪 `20df973d`、第四輪 `cc2240af`，[報告與核對](<../Claude Codex Discussion/2026-11-24-phone-cards-l2.md>)），使用者 2026-11-24 同意第四輪的 P1 記成限制並合併｜等誰：—

## 第四輪（只審重整）

- **待審**：`cc5fa9b3`（第三輪報告所在的 commit）到這份請求所在的 commit 的差異：`src/state/index.ts` 的 `changeStatus`（綁確認的啟用一律 `fillFile`）、`src/obsidian/ai-cards.ts` 的 `copy`（先 `aiWhere([])`），以及**退回** `a7f5660d` 的 `src/core/ai/publish.ts`、`deepen-snapshot.ts`、`deepen-job.ts` 與兩個測試檔（R4 的改動整個拿掉）。
- **先看**：報告最後的〈Claude 核對（第三輪）：照 D-197 重整〉。這是第四輪：還有擋合併的發現時，照 code-quality 交使用者決定，不再自動送第五輪；請把每一項的真實路徑與機率寫清楚，方便使用者選。
- **請特別試**：直接改磁碟的啟用和開著的編輯器（Obsidian 的 `vault.process` 與自動存檔）會不會互相蓋掉；編輯器在回呼裡 `text()` 是 `null`（換篇）時；`copy()` 等 `aiWhere` 時遇到還原、備份、手機開關被關掉；R4 退回之後 `syntax.md` §6 與程式是否一致，新記的三條限制（backlog〈已知的限制〉）寫得對不對。
- **驗證**：完整的 `npm run check` 由這份請求所在 commit 的 pre-commit 在雲端 Linux 跑過。
- 報告接在後面，標「第四輪」。

## 第三輪（只審修正）

- **待審**：`058541eb`（第二輪報告所在的 commit）到這份請求所在的 commit 的差異，範圍：`src/state/index.ts` 的 `changeStatus`（寫入那一列裡讀磁碟）、`src/obsidian/ai-cards.ts` 的 `existing`／`copy`／`save`／`firstSave`、`src/core/ai/publish.ts` 的 `isPublished` 與 `publishedElsewhere`、`src/core/ai/deepen-snapshot.ts` 的 `deckLink`（加深的 `deepen-job.ts` 也改用它）、`src/obsidian/ai-cards-modal.ts` 的文字，以及它們的呼叫端。
- **先看**：報告最後的〈Claude 核對（第二輪）〉。
- **請特別試**：`readTimed` 在寫入列裡的逾時與讀不完整（`completeText`）；`isPublished` 用 `io.where` 時讀不到、ID 被拆到兩篇、跳過的篇、只寫檔名的舊快照；`deckLink` 退回檔名時同檔名有兩篇；加深快照改用 `deckLink` 後，加深自己的認快照（`sameButTargets`）與 `retargetSnapshot` 還對不對；`writeBlock(true)` 先擋之後，電腦在備份還沒成功時按存的說明。
- **驗證**：完整的 `npm run check` 由這份請求所在 commit 的 pre-commit 在雲端 Linux 跑過。
- 報告接在後面，標「第三輪」。這是延續 R1、R5、R6 的第 3 代時，照 D-197 標出來。

## 第二輪（只審修正）

- **待審**：`a7f5660d`（第一輪報告所在的 commit）到這份請求所在的 commit（`git log -1 --format=%H -- apps/Cards/docs/tasks/phone-cards-l2.md`）的差異，範圍：`src/state/index.ts` 的 `changeStatus` 與 `writeBlock`、`src/obsidian/ai-cards.ts` 的 `existing`／`copy`／`save`、`src/core/ai/publish.ts` 的快照 `對象`、`src/obsidian/ai-cards-modal.ts` 的兩句文字，以及它們的呼叫端。不用整包重審。
- **先看**：報告最後的〈Claude 核對（第一輪）〉表：R3 記成限制的理由（兩份相同的快照對加深沒有影響）、R5 的規格釐清、R7 是請求寫錯。
- **請特別試**：R1 的 `REFUSE` 會不會讓原本該存的情形不存（例如暫停／恢復、草稿按暫停）；有確認文字、`tracker.text` 還沒有這一篇（剛建好、讀回還沒到）時會不會一直回 `changed`；`aiWhere([])` 在手機、開關關著、還原中、讀不到的卡組時回什麼、停下的字對不對；`writeBlock(true)` 在電腦與手機各種門檻下的順序；`對象` 改寫完整路徑後，卡組改名、搬移時的 `retargetSnapshot` 與 Obsidian 的自動更新連結（`[[路徑|名稱]]` 的寫法）還對不對。
- **另外**：使用者選了「只有手機建的加識別碼」，寫成 D-227（修改 D-226 第 5 點的字面），`syntax.md` §0、§6 已補，請一起看有沒有和 D-081、D-226 矛盾。
- **驗證**：完整的 `npm run check` 由這份請求所在 commit 的 pre-commit 在雲端 Linux 跑過；回歸測試都先在修正前的程式上確認失敗。
- 報告接在 `Claude Codex Discussion/2026-11-24-phone-cards-l2.md` 的後面，標「第二輪」。延續第一輪的發現標「延續 Rx」，修正帶出的標「Rx 修正引入」。

以下是第一輪的請求，第二輪照用其中的回報格式。

遵守 repo 根目錄的 `AGENTS.md`。建議推理等級：**高**。請**新開一個 Codex 對話**；只審查、不改產品程式，可以在隔離環境重現。

[任務說明](phone-cards.md) §2 讓家長的手機在開關打開後建新檔（原文、草稿卡組、快照），並改了 AI 製卡發布的中斷核對與「啟用」的確認，屬於[高風險範圍](../../../../docs/agents/quality.md#高風險範圍要做-l2)（寫進 vault 的檔、學習目標 ID、寫入閘門），合併前做 L2。

## 審查對象

- 分支 `claude/project-thread-hmbxa2`（已 push）；和 `main` 的共同祖先 `eeeaeb190c422999d779b1553e328940833bdd04`（就是現在的 `main`）。
- 待審：共同祖先到這份請求所在的 commit（`git log -1 --format=%H -- apps/Cards/docs/tasks/phone-cards-l2.md`）的全部改動。程式在 `4b977626`（開關、窄寫入、中斷核對、確認綁內容）與 `2682ce7e`（手機檔名加識別碼），`f8b21905` 補了撞名測試；其餘是文件。
- 沒有未提交的修改。

## 規格與優先順序

- 任務說明 [phone-cards.md](phone-cards.md) §1、§2（全節）與〈結果〉；第二步（§3）不在這次的範圍。
- [D-226](../../../../docs/decisions.md#d-226-家長的手機也能製卡與啟用預設關第一批手機只建新檔) 第 1、2、5、6 點；它補充或修改的 D-134（只有新建草稿可以在手機配 ID）、D-157、D-150；[D-156](../../../../docs/decisions.md#d-156-設定頁依功能分區不寫給家長)（設定頁的字）、[D-222](../../../../docs/decisions.md#d-222-預覽按鈕在電腦預設打開)（每台裝置的開關存法）。
- 格式查核的[回報與 Claude 的回應](<../Claude Codex Discussion/2026-11-24-phone-cards-format-review.md>)：第 1 項（看不見的撞名保證不了）已交使用者選，D-226 第 5 點的字面會照選擇收窄；這項不用再報，除非找到**看得見**卻撞名或覆寫的路徑。
- 規格衝突時列成問題，不挑容易通過的那份。

## 行為與風險

- **公開介面**：`src/state/writes.ts` 的 `WritesOptions.phoneCards`、`create(path, text, guard?, cards?)`；`src/state/index.ts` 的 `StateOptions.phoneCards`、`aiIds(count, avoid?, cards?)`、`aiCreate`／`aiCreateDeck`／`aiCreateSnapshot` 的 `cards` 參數與 `SnapshotDeck`、`activateDraft(path, editor, confirmed?)`、`ActivateResult`（`changed`、`already`）；`src/core/ai/publish.ts` 的 `ownText`、停下原因 `unclear`；`src/core/ai/draft.ts` 的 `withCode`、`planDraft` 的 `code`；`src/obsidian/ai-cards.ts` 的 `inspectionKey`、`save(job, reply, service, shown?)`、`nameOf`、`phone`。
- **呼叫端**：`src/main.ts`（`cardsHere`、`cards()`、`phoneCardsChanged`、AI 製卡在所有平台建立）、`src/obsidian/settings.ts`（手機才有的「AI 製卡」區與確認視窗）、`src/obsidian/ai-cards-modal.ts`（`wireAiCards` 的 `refresh`、命令的 `checkCallback`、ribbon）、`src/obsidian/deck-actions.ts` 與 `deck-status.ts`（啟用帶確認時的全文）。
- **不可破壞的性質**：
  - 手機上開關關著時，任何入口（命令、舊視窗、排隊中的回呼、`resume`）都不建檔、不配號；開關在寫入回呼裡再查一次。
  - 窄入口只開 AI 製卡發布的三種新檔；補 ID、改狀態、引言框加入、加深、其他 `create` 在手機照舊回 `phone`；載入中、還原、`unread` 等既有閘門照舊。
  - 中斷之後：全文和恢復資料相同才認成自己寫的；認不出來就停在 `unclear`，不覆寫、不重建、不重配 ID；寫成之後家長合法改過字（ID 都在）的不被覆寫。快照寫入當下比每一篇的全文與 ID 位置。
  - 「啟用」只在寫入當下的全文和確認視窗顯示的一樣（換行不算）時寫；已經不是草稿回 `already`、全文變了回 `changed`，都不寫。
  - 存草稿綁家長看到的檢查結果：照現況重新檢查，不同就不存、什麼都不寫。
  - 待貼回的工作存完讀回核對，讀回不同就當作沒存好。
  - 電腦的行為除了「啟用」多一層全文核對、中斷核對改用 `ownText` 之外不變；電腦建的檔名不加識別碼。
- **已知邊界例子**（起點，請找新的組合）：開關在排進寫入佇列之後才關；存到一半關掉再打開按繼續；檢查之後同步來的卡組改變了結果；規劃之後才同步來同名卡組與快照；建卡組讀回逾時之後才晚到的寫入（同文、異文）；搬移後的位置是異文；沒有 ID 可以認的篇。
- **明確延後**：第二步的啟用紀錄（§3）；iPhone 實機（〈結果〉的延後的測試）；兩台真的同步的撞名（寫成限制）。

## 驗證方式

- 在 `apps/Cards`：`npm ci`、`npm run check`。實作者在 `4b977626` 跑完整檢查通過（2,919 項），之後每個有程式的 commit 的 pre-commit 都跑了完整檢查並通過；`tests/phone-cards.test.ts` 8 項通過。
- 照 [quality.md〈檢查指令〉](../../../../docs/agents/quality.md#檢查指令)「Codex 審查時」那一點：完整檢查在沙箱外由實作者跑過；Codex 的沙箱只跑和發現有關的測試，失敗的逐項列出、說明哪些是環境造成的；跑測試一次等到結束，不要短間隔查進度。
- 沒跑的：iPhone 與 Obsidian 實機（剪貼簿、切 App、設定頁在手機的樣子）、兩台真的同步。

## 實作者自己選的做法（請先看）

1. **開關文字**：區名「AI 製卡」、一列「在這台裝置製卡」；確認視窗寫「孩子複習用的手機或平板不要打開」，不寫「給家長」（D-156）。只在 `!Platform.isDesktopApp` 顯示；關掉不問。使用者還沒回覆文字。
2. **AI 製卡在所有平台建立**，命令與 ribbon 用 `cards()` 回 `null` 來關：避免開關切換時要重新載入外掛；`refresh()` 關掉已開的視窗。
3. **`ownText` 的三種結果**取代 `writtenIn`：`written` 之後內容變了而 ID 都在算家長改過字（`yes`）；`started`／`rebuild` 的異文、或沒有 ID 可以認的篇算 `unclear`。理由：`started` 時寫入可能逾時晚到，不能只靠 ID。
4. **確認綁內容用全文比（換行不算）**，不另存雜湊：確認視窗本來就有全文；`changed` 與 `already` 對外映射：`setDeckStatus` 照舊回 `unchanged`。
5. **存草稿綁的是 `inspectionKey`**（每篇名稱與數字、擋住與提示的字），不是回覆全文：回覆不變但 vault 變了，結果也可能不同。
6. **手機檔名加識別碼**（`withCode`）：用工作代號，重試沿用 `SaveState` 存下的路徑與基底；發布時要重挑也照存下的基底。這項等使用者選定（見上面〈規格與優先順序〉）。
7. **待貼回工作的提示**：只在手機顯示「這次的提示只記在這台裝置（識別碼 …）」與 14 天到期。

## 回報與權限

照 code-quality 的 `review.md`〈審查請求範本〉的回報格式：每項發現寫觸發條件、預期／實際、影響、位置與證據，區分「已重現」「靜態推斷」「待驗證」，另標真實路徑會不會發生與發生機率。可以回報「規格本身有漏洞」。報告不逐段重述規格與差異；頭尾寫待審 commit、審查範圍、測試結果與沒驗的項目及原因。

報告寫在 `Claude Codex Discussion/2026-11-24-phone-cards-l2.md`，標題下第一行寫狀態。

## 結果

延後的測試：「補測：手機 AI 製卡的 iPhone 實機」（照[任務說明〈結果〉](phone-cards.md#結果)）；第四輪 P1 的實機時序記在 [backlog〈已知的限制〉](../backlog.md#已知的限制)，併進下一次電腦實測。
