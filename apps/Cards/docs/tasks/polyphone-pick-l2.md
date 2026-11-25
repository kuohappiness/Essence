# 多音字的點選填空（D-230 第 4 點，Codex L2 審查請求）

狀態：待審｜下一步：Codex 審第三輪（只審修正），前兩輪的報告與核對在 [2026-11-25-polyphone-pick-l2.md](<../Claude Codex Discussion/2026-11-25-polyphone-pick-l2.md>)｜等誰：Codex

遵守 repo 根目錄的 `AGENTS.md`。建議推理等級：**高**。請**新開一個 Codex 對話**；只審查、不改產品程式，可以在隔離環境重現。

## 第三輪（只審修正）

- **待審**：`23753ff1`（第二輪審的 commit）到這份請求所在的 commit（`git log -1 --format=%H -- apps/Cards/docs/tasks/polyphone-pick-l2.md`）的差異，範圍：`src/core/deck/question-types.ts`（`choiceStem`、`HTML_TAG`、`isChoiceSentence`、`readChoice` 的 `stems`）、`src/core/deck/types.ts` 的 `Choice.stems`、`src/core/ai/existing.ts`（`readingsBySentence`、`newlyAmbiguous`）、`src/core/ai/check.ts`（句數、錨點的冒號）、`src/core/study/compose.ts`（`distinctSentences`、`choicePrompts`、`choicePreviewCards`）、`apps/Cards/docs/syntax.md` §2-3、§2-8，以及它們的呼叫端與測試。不用整包重審。
- **先看**：報告最後的〈Claude 核對（第二輪）〉。前四項是第一輪 R1～R3 的第二代，這一輪把「同一句」定在一處（`choiceStem`／`Choice.stems`）、多音字句的認法收窄。同一條鏈再有發現就是第三代：照 D-197 先寫前提哪裡不對，不用給逐點的修法。
- **請特別試**：
  - `Choice.stems` 和指紋分開之後：只差底線數的兩句在紀錄裡是兩個指紋，輪流出題（`rotation`）時會不會有一句一直出不到；預覽的張數；三個讀音的字。
  - `newlyAmbiguous`：原本就配兩個讀音的那一句又多配一個讀音（三個讀音的字）、同一批好幾句的組合。
  - 句子裡有 HTML 標籤就照翻面：舊卡組裡原本認成點選、現在變翻面的（例如有 `<br>`），同一個 `lt` 的紀錄從點選變翻面，排程與紀錄重播對不對（同第二輪 R4 試過的路徑）。整個包在連結裡的 `[[長（＿＿）]]`、`[長（＿＿）](…)` 照舊認、選項放在連結裡，點了會不會跳到連結（比較卡原本也一樣）。
  - 錨點的冒號：讀音對不到的行、半形冒號的行不提醒，這樣可不可以。
- **驗證**：同第二輪。
- 報告接在 `Claude Codex Discussion/2026-11-25-polyphone-pick-l2.md` 的後面，標「第三輪」。延續第二輪的發現標「延續第二輪 n」，修正帶出的標「第二輪 n 修正引入」。

## 第二輪（只審修正）

- **待審**：`ef876f6d`（第一輪審的 commit）到這份請求所在的 commit（`git log -1 --format=%H -- apps/Cards/docs/tasks/polyphone-pick-l2.md`）的差異，範圍：`src/core/deck/question-types.ts`（`choiceStem`、`visibleOf`、`readChoice` 的沒有句子的讀音、`readPick` 的結尾）、`src/core/ai/check.ts`（`checkChoice`、`sameSentenceTwice`、錨點的冒號）、`src/core/ai/existing.ts`（`planExisting` 的 `ambiguous`）、`src/core/study/compose.ts` 的 `choicePrompts`、`apps/Cards/docs/card-rules/elementary-chinese.md` 的〈讀音〉與〈輸出前自我檢查〉，以及它們的呼叫端與測試。不用整包重審。
- **先看**：報告最後的〈Claude 核對（第一輪）〉：每一項的修法與 commit。
- **請特別試**：
  - `choiceStem` 只用在比對同一句：底線數不同的兩句指紋不同，出題時仍算兩句（會不會出在同一張、算句數時會不會多算），這樣有沒有問題。
  - `visibleOf` 拆出來之後，比較卡與英文的 `countBlanks` 結果不變；字在連結文字裡（`[[x|長]]（＿＿）`）、在 HTML 標籤之間時多音字句的認法。
  - R4 之後：家長刪到某個讀音沒有句子時改成翻面、補回句子又變回點選，同一個 `lt` 先後混著翻面自評與點選的紀錄，排程與紀錄重播對不對。
  - R5 之後：預覽（`choicePreviewCards`）與今天的份、練習、小考的順序；同一組句子在筆記裡換行序時順序會變（筆記改了），這樣可不可以接受。
  - R6 讓已有的相似字、比較卡組裡「有組、標題多了別的字、題目是一般問答」的目標多了 `pick-not-recognized` 的提示（只提示，出法不變），有沒有別的影響。
  - R1 的 `sameSentenceTwice` 只看名稱結尾是讀音的項目、`（＿…）` 形狀的題目；`EXISTING_WHY.choiceAmbiguous` 只在加入前原本沒有同一句配兩個讀音時才擋。
- **驗證**：完整的 `npm run check` 由每個 commit 的 pre-commit 在雲端 Linux 跑過；每一項的回歸測試都先在修正前的程式上確認失敗。
- 報告接在 `Claude Codex Discussion/2026-11-25-polyphone-pick-l2.md` 的後面，標「第二輪」。延續第一輪的發現標「延續 Rx」，修正帶出的標「Rx 修正引入」。

以下是第一輪的請求，第二輪照用其中的回報格式。

[任務說明](polyphone-pick.md) 改了出題語法的認法（[syntax §2-3](../syntax.md#比較卡點選填空)，`AGENTS.md`〈Code Review Rules〉的 P1 範圍）、一張卡的組法、計分與複習紀錄的寫法，以及 AI 草稿的檢查與送給 AI 的規則，屬於[高風險範圍](../../../../docs/agents/quality.md#高風險範圍要做-l2)，合併前做 L2。

## 審查對象

- 分支 `claude/project-thread-0mpbnw`（已 push，PR #53）；和 `main` 的共同祖先 `a9601bc4`（就是現在的 `main`）。
- 待審：共同祖先到這份請求所在的 commit（`git log -1 --format=%H -- apps/Cards/docs/tasks/polyphone-pick-l2.md`）的全部改動。程式在 `09231d28`（§1 認法）、`d91c7b3c`（§2 相似詞）、`2ec04d30`（§3 組卡）、`75cebb3a`（§4 畫面、對照與紀錄）、`cd724fc5`（§5 草稿檢查）、`4a84cf65`（§6 預設的版號）、`356b7fe1`（三個誤報）；`884a387c` 改了 `tools/check-docs.ts` 的 `FROZEN_RULES` 與國語預設送給 AI 的連結；其餘是文件。
- 沒有未提交的修改。

## 規格與優先順序

- 任務說明 [polyphone-pick.md](polyphone-pick.md) §1～§7、〈和題庫模組的關係〉、〈明確不做〉、〈驗收〉、〈結果〉。
- [D-230](../../../../docs/decisions.md#d-230-國語字義卡和詞義卡錯開混淆點第一次就比多音字改點選填空) 第 3、4 點；它依據的 [D-178](../../../../docs/decisions.md#d-178-相似字用點字比較卡一格一個學習目標)、[D-182](../../../../docs/decisions.md#d-182-比較點選各科都能用家長出題時勾選)（第 4 點程式認括號、第 7 點只有兩個選項的組每個至少三句）、[D-187](../../../../docs/decisions.md#d-187-全詩順序卡一首一張放在這首最後) 第 5 點（一個目標好幾格取最差的一格）、D-191（比較卡擋舊版）、D-203（對照的上下排）、[D-151](../../../../docs/decisions.md#d-151-內建製卡規則改版內建跟著外掛改了就是自訂版)（規則改字就是新版本）。
- 格式查核的[回報與 Claude 的回應](<../Claude Codex Discussion/2026-11-25-polyphone-pick-format-review.md>)；任務說明已照回應改過。
- 兩項**使用者還沒選**，程式照建議做：§3 一張卡出「讀音數加一句」；§4-6 舊版照翻面、不加 `需要版本`。這兩項請照建議審（例如建議的做法有沒有做錯、會不會丟資料），不用再報「應該擋舊版」，除非找到建議的做法會丟資料或算錯排程的路徑。
- 規格衝突時列成問題，不挑容易通過的那份。

## 行為與風險

- **公開介面**：`src/core/deck/types.ts` 的 `Target.choice`、`Choice`（`word`、`options`、`optionKeys`、`title`、`answers`、`anchors`、`rest`）；`src/core/deck/index.ts` 新匯出的 `choiceProblems`；`src/core/study/index.ts` 新匯出的 `choiceCardOf`、`choicePreviewCards`；`src/core/study/types.ts` 的 `CardGroup.choice`；`src/core/ai/check.ts` 的 `choice-*` 代碼；`PROMPT_VERSION` `提示 v5`、`DEEPEN_VERSION` `加深 v3`、國小國語規則 `v0.11`。
- **呼叫端**：`src/core/study/session.ts`（今天的份、小考）、`src/core/study/practice.ts`（練習）、`src/review/preview.ts`（預覽）、`src/review/pick.ts`（計分與紀錄，沒改）、`src/ui/PickCard.tsx`（標題、對照、對不到的錨點行）、`src/core/ai/existing.ts`（加進已有的學習目標的 `verify`）、`experiments/t4/check-syntax.mjs`（共用 `check`）。
- **不可破壞的性質**：
  - 已有的卡組照舊：沒有括號的 `長 讀音`、相似字與比較卡、全詩順序卡、英文的點選與排序，讀法、出法與紀錄都不變；比較卡的認法先於多音字（`長（長、常）（ㄓㄤˇ、ㄔㄤˊ） 讀音` 是比較卡）。
  - 讀不成多音字的照原題型（翻面）出，不跳過、不丟題目；舊版 `0.6.0` 讀新卡組照翻面，讀新版寫的紀錄不出錯。
  - 紀錄一張卡一行，最差的一格在最上層，其餘在 `also`；同一行的 `v` 不重複；排程只看最上層的 `r`（FSRS 與紀錄重播不因為 `also` 多算或少算）。
  - 一張卡每個讀音至少一句；同一張重來順序不變，換句才變。
  - AI 草稿：錯誤一定擋（退回重做），不符與提醒不擋；多音字不算三題上限、名稱不用寫成「能……」；加題不會把多音字變成翻面、把翻面變成多音字。
  - 送給 AI 的規則：國語預設 v0.11 嵌進外掛的內容與雜湊照新內容算；社會、英文的內容與雜湊不變。
- **已知邊界例子**（起點，請找新的組合）：讀音寫粗體、整行粗體、ID 在後面；括號半形全形混用；三個讀音；池裡只有讀音數那麼多句；某個讀音只有一句；同一句寫兩次（指紋相同）；錨點同一行寫的字、同一讀音兩行、半形冒號、未知讀音；`（＿＿）` 前面是粗體的字；英文 `read（/riːd/、/rɛd/） 讀音`；候選卡片與加進已有的學習目標裡的多音字；相似詞在名稱中間（`反映和反應是不是相似詞`）不算。
- **明確延後**：見任務說明〈明確不做〉；Windows 版 Obsidian 看畫面與 iPhone 實機（〈結果〉的還沒做）。

## 驗證方式

- 在 `apps/Cards`：`npm ci`、`npm run check`；共用工具在 `tools/`：`npm ci`，`node --test tests/check-docs.test.ts`；文件：repo 根目錄 `node tools/check-docs.ts`。
- 實作者：每個有程式的 commit 的 pre-commit 都在雲端 Linux 跑了 Cards 的完整檢查（型別、lint、knip、全部測試）並通過；`884a387c` 跑了共用工具的完整檢查。新測試是 `tests/polyphone-pick.test.ts`、`polyphone-compose.test.ts`、`polyphone-ui.test.ts`、`polyphone-old-version.test.ts`（用 `v0.6.0` 的 tag 跑舊的解析與紀錄讀取，要有 tag：`git fetch --tags origin`）、`polyphone-ai-check.test.ts`、`ai-check-trial-notes.test.ts`，其餘是既有測試檔的增補。
- 照 [quality.md〈檢查指令〉](../../../../docs/agents/quality.md#檢查指令)「Codex 審查時」那一點：完整檢查在沙箱外由實作者跑過；Codex 的沙箱只跑和發現有關的測試，失敗的逐項列出、說明哪些是環境造成的；跑測試一次等到結束，不要短間隔查進度。
- 沒跑的：Obsidian 實機的畫面（Windows、iPhone）。

## 實作者自己選的做法（請先看）

1. **錨點在解析時對好**：`Choice.answers` 對齊題目、`Choice.anchors` 對齊讀音、`Choice.rest` 放對不到的行；組卡不再讀字。理由：study 從 deck 只能 import 型別（`essence/module-boundaries`），`pickKey` 不能在 `compose.ts` 用。
2. **一張卡的組法**（`choicePrompts`）：照出題順序（`rotation`，指紋相同的算一句）每個讀音先挑一句，再補到讀音數加一句，回傳照出題順序；畫面的順序由 `choiceAssembled` 用這張卡每格的指紋打亂（字鍵三個以上時剛好照括號順序就轉一格，和比較卡相同）。
3. **預覽**（`choicePreviewCards`）：一張「第一次」的卡，其餘不同指紋的句子各一張單格的卡，字鍵照樣是全部讀音。
4. **今天的份、小考、練習**的 `isNew` 與 `early` 照比較卡的算法；多音字放在 `group` 的判斷之後。
5. **任務段改字就加版號**：`提示 v5`、`加深 v3`（相似詞寫進點選的那兩句；候選卡片範例加 `出處：<這次的頁碼>`）。
6. **沒勾點選填空的 `長 讀音`**：預設寫成句數照通用的三題上限、每個讀音至少一句（翻面一次一句、孩子自評，沒有亂猜的問題）；任務說明 §6 原本沒寫這一條。
7. **候選卡片的名稱**：`check.ts` 讓候選裡的比較卡、多音字也不用寫成「能……」（原本只看本文）。
8. **兩列技術債**（觸發點到了）：國語預設送給 AI 的部分改成新位置的連結，`FROZEN_RULES` 拿掉國語那一列（v0.11 本來就是新版本）；「晒」不算常見簡體字形；給家長的備註寫「常聽到」算說法不一致。

## 回報與權限

照 code-quality 的 `review.md`〈審查請求範本〉的回報格式：每項發現寫觸發條件、預期／實際、影響、位置與證據，區分「已重現」「靜態推斷」「待驗證」，另標真實路徑會不會發生與發生機率。可以回報「規格本身有漏洞」。報告不逐段重述規格與差異；頭尾寫待審 commit、審查範圍、測試結果與沒驗的項目及原因。

報告寫在 `Claude Codex Discussion/2026-11-25-polyphone-pick-l2.md`，標題下第一行寫狀態。
