# 題型模組第 A 步（A1、A2，Codex L2 審查請求）

狀態：待審｜下一步：Codex 第三輪（只審修正，在使用者的電腦），Claude 核對｜等誰：Codex

遵守 repo 根目錄的 `AGENTS.md`。建議推理等級：**高**。請**新開一個 Codex 對話**；只審查、不改產品程式，可以在隔離環境重現。

## 第三輪（只審修正）

- **待審**：`f0622282`（第二輪審的最後一個 commit）到這份請求所在的 commit（`git log -1 --format=%H -- apps/Cards/docs/tasks/question-type-modules-l2.md`）的差異。程式在 `f77372b9`（F1）、`d852596b`（F2）、`058b70a3`（F3），都只改 `tools/compare/adapter.ts`、`tools/compare/snapshot.ts` 與 `tests/compare-versions.test.ts`；`643c359b`（F4，`tools/compare-versions.ts` 的「限制」）、`749eaca7`（F5，任務說明 §1-3、§1-7）是文字。`dd4efc00`、`a7e359bc` 是第二輪的報告與併入。產品程式（`src/`）這一輪沒改，〈差分腳本〉不用重跑。不用整包重審。
- **先看**：報告最後的〈Claude 核對（第二輪）〉。
- **請特別試**：
  - F1：再複習一些整份一起交給 `{ more: true }`，跨篇的目標在同一個範圍裡：和真的再複習一些的先後、併卡是否一致；`v0.2.0`～`v0.6.0` 都走得通。它跳過的目標（`done`）留 `prompt: null`，和「今天已經答對」的 null 混在一起，報告會不會因此少報或誤報。
  - F2：`blanks` 記 `[lt, 指紋]`，`v0.4.0` 以後的卡都有；多音字、排序（全詩、句子）、接句這幾種多格的卡，`blanks` 會不會因為打亂的種子而在兩版間出現不是行為差異的變化。
  - F3：版號界線用 `0.0`～`0.3` 開頭判斷；有沒有正式版號會被分錯。主目標要有自己的格：有沒有哪一版、哪一種卡本來就不符合（例如比較卡的第一格不是選中的目標）。
  - F4：「限制」的寫法是否足以讓看報告的人分辨哪些差異要先用實際複習確認。
- **驗證**：完整的 `npm run check` 由每個改程式的 commit 的 pre-commit 在雲端 Linux 跑過；F1、F3 的回歸測試在修正前失敗，F2 用探針確認修正前零差異。
- 報告接在 `Claude Codex Discussion/2026-11-25-question-type-modules-l2.md` 的後面，標「第三輪」。延續第二輪的發現標「延續 Fx」，修正帶出的標「Fx 修正引入」。照 D-171，這是第三輪；第四輪之後停下交給使用者。

## 第二輪（只審修正）

- **待審**：`25e8304b`（第一輪審的 commit）到這份請求所在的 commit（`git log -1 --format=%H -- apps/Cards/docs/tasks/question-type-modules-l2.md`）的差異，範圍：`tools/compare/adapter.ts` 的今天的份怎麼取卡（R1）、`tools/compare/snapshot.ts` 的 `uncomparedLines` 與 `lts`（R1、R2）、`tools/compare-versions.ts` 的「限制」那一句、`tests/compare-versions.test.ts`，以及〈差分腳本〉的 `session.ts`（R3）、`apps/Cards/docs/backlog.md` 技術債新的一列（R4）、任務說明 §1-3、§1-7、§1-8（R5）。產品程式（`src/`）這一輪沒改。`a4146fc4`、`cec186a4` 是另一份討論稿（配對與單選），不用看。不用整包重審。
- **先看**：報告最後的〈Claude 核對（第一輪）〉：每一項的判斷、修法與 commit。
- **請特別試**：
  - R1 的取卡方式：不模擬作答，記的是每個目標還沒作答時出現的那張卡。有沒有哪種卡的內容（格數、併進誰、題目）會因為沒有作答而和真的複習不同：今天答錯、還沒到時間的同組目標（`joins` 的 `early`）、比較卡多放一句、接句的隔開、全詩與接句同一首、`more` 佇列的 `pair`。
  - R1 對舊版：`v0.2.0`～`v0.6.0` 的 `nextCard` 選卡的先後不同時，併進誰會跟著變；這算真的差異還是取卡方式帶來的雜訊，報告要不要另外寫明。
  - R1 的防呆：一張卡上有不在這一次範圍裡的目標時照記、不擋，這張卡上沒有還沒出的目標才當接不上。這樣夠不夠，會不會有版本出錯卻比成零差異。
  - R2：用 `prompt` 是不是 null 判斷這次有沒有卡；有沒有別的情況 `prompt` 是 null 卻有卡，或有卡卻沒有 `prompt`。
  - R4：同不同意記成技術債（真實路徑由 `withNeed` 補對），還是應該合併前就改。
- **驗證**：完整的 `npm run check` 由每個改程式的 commit 的 pre-commit 在雲端 Linux 跑過；R1、R2 的回歸測試先在修正前確認失敗。R3 重跑的數字在〈Claude 核對（第一輪）〉。
- 報告接在 `Claude Codex Discussion/2026-11-25-question-type-modules-l2.md` 的後面，標「第二輪」。延續第一輪的發現標「延續 Rx」，修正帶出的標「Rx 修正引入」。

以下是第一輪的請求，第二輪照用其中的回報格式。

[任務說明](question-type-modules.md) 的第 A 步把目標的六個卡型欄位併成一欄 `Target.kind`、把卡型的認法拆成每一種一個檔、每一層照卡型分的地方改成照 `KindId` 的 `switch`（A1，行為不變），再讓排序成為自己的題型（A2，內部的 `QuestionType` 多 `order`，作答照點選填空）。碰到卡型的認法（[syntax §2-3](../syntax.md)，`AGENTS.md`〈Code Review Rules〉的 P1 範圍）、組卡、今天的份、作答與畫面，屬於[高風險範圍](../../../../docs/agents/quality.md#高風險範圍要做-l2)，合併前做 L2。

## 審查對象

- 分支 `claude/project-thread-vpoerm`（已 push，PR #56）；和 `main` 的共同祖先、待審 commit 寫在〈第一輪〉。
- 程式在 `4474ff75`（比較新舊版的工具先讀得懂新寫法）、`ec3db446`（拆檔，只搬不改）、`d4451c40`（`Target.kind`、`needsOf` 與所有讀卡型欄位的地方）、`74fb12f6`（A1 新增的測試）、`cc872dc0`（A2）；`d3637b09` 只是併入 `main`（PR #54 的比較測試工具）。其餘是文件。
- 沒有未提交的修改。

## 規格與優先順序

- [任務說明](question-type-modules.md) §1（1-1～1-9）、〈排程與分支〉、§5、§6，與 Fable 三輪審查的處理（§7～§11）；〈結果〉寫了實作和說明不一樣的地方。
- [D-181](../../../../docs/decisions.md#d-181-題型是可以接上的模組開題型專區)（第一步只搬不改的做法）、[D-233](../../../../docs/decisions.md#d-233-題型照形式分各科與題庫共用配對單選也進每天複習)、[D-182](../../../../docs/decisions.md#d-182-比較點選各科都能用家長出題時勾選)、[D-187](../../../../docs/decisions.md#d-187-全詩順序卡一首一張放在這首最後)、[D-192](../../../../docs/decisions.md#d-192-比較點選改名點選填空英文預設也勾)、[D-193](../../../../docs/decisions.md#d-193-英文的學習地圖詞是根句型是骨架) 第 5、6、8 點、[D-230](../../../../docs/decisions.md#d-230-國語字義卡和詞義卡錯開混淆點第一次就比多音字改點選填空) 第 4 點。
- **使用者還沒答的**（§6）：第 3 題「排序算不算一種題型」只影響文件與家長看得到的名稱；A2 照說明只改程式內部，總表、家長看得到的名稱與「取消點選填空的勾選就不出排序」都沒動。請照這個範圍審，不用報「應該先問使用者」。
- 規格衝突時列成問題，不挑容易通過的那份。

## 行為與風險

- **公開介面**：`src/core/deck/types.ts` 的 `Target.kind`、`Kind`、`KindId`（六個舊欄位拿掉）、`Typing.style`（原本的 `Typing.kind`）；`src/core/deck/index.ts` 新匯出的 `needsOf`；`src/core/study/compose.ts` 的 `QuestionType` 多 `order`。舊寫法對新寫法見[任務說明〈1-6〉](question-type-modules.md#1-6-對照表給其他串)。
- **呼叫端**：任務說明 §1-4 的表（`base-form.ts`、`compose.ts`、`session.ts`、`plan.ts`、`practice.ts`、`preview.ts`、`english.ts`、`screens.tsx`、`PickCard.tsx`、`need.ts`、`move.ts`、`draft.ts`、`check.ts`、`existing.ts`）；A2 另有 `review/flow.ts`、`review/pick.ts`、新的 `ui/OrderCard.tsx`。`tools/compare/` 讀新舊兩種寫法。
- **不可破壞的性質**：
  - A1：解析結果（`parseDeck` 的 `targets`、`problems`，照〈1-6〉的表對過）、需要版本的寫入、AI 草稿的檢查與存檔、加題核對、搬候選、今天的份與練習的出卡、每一行紀錄、畫面，都和基準相同。卡組的寫法不變（`syntax.md` 沒改）。
  - A2：A1 對 A2 只有排序卡（全詩、句子）的 `questionType` 從 `pick` 變 `order`；作答、紀錄、畫面的元素樹不變（class 不變，CSS 沒動）。
  - 多一種卡型時編譯不過的地方，就是任務說明 §1-4 列的那幾處（〈結果〉的漏接檢查）。
- **已知邊界例子**（起點，請找新的組合）：名稱同時像兩種卡型（`寨（寨、塞） 排序`、`寨（寨、塞） 接句`、`長（ㄓㄤˇ、ㄔㄤˊ） 接句`，§1-3 的三列）；比較卡的答案是組裡別的字（`pick-answer-invalid`，要 `PICK_NEEDS`，草稿退件）；英文的變化與英翻中（變化等英翻中記得才出）；同一首的接句與全詩（全詩等接句）；句子排序不在那一條；多音字和比較卡在同一份；考試範圍裡只有排序卡。
- **明確延後**：B、C（任務說明 §2、§3）、配對與單選（另一份說明）；Windows 版 Obsidian 看一次畫面與兩個正式 vault 的 `compare-versions`（合併前在使用者的電腦做）；iPhone 併進 0.7.0 的那一次。

## 驗證方式

- 在 `apps/Cards`：`npm ci`、`npm run check`；`compare-versions.test.ts` 與 `pick-old-version.test.ts` 用舊版的 tag：`git fetch --tags origin`。文件：repo 根目錄 `node tools/check-docs.ts`。
- 實作者：每個有程式的 commit 的 pre-commit 都在雲端 Linux（Node 24）跑了 Cards 的完整檢查（型別、lint、knip、全部測試）並通過。
- 照 [quality.md〈檢查指令〉](../../../../docs/agents/quality.md#檢查指令)「Codex 審查時」那一點：完整檢查在沙箱外由實作者跑過；Codex 的沙箱只跑和發現有關的測試，失敗的逐項列出、說明哪些是環境造成的；跑測試一次等到結束，不要短間隔查進度。
- **差分**（任務說明 §1-7〈差分〉；腳本不進 repo，全文在下面〈差分腳本〉，結果在任務說明〈結果〉）：舊版從基準的 worktree 載入、新版從待審的 worktree 載入，兩邊共用同一份 `node_modules`。重跑的步驟：
  1. `git worktree add <base> <基準>`、`git worktree add <head> <待審>`，兩邊的 `apps/Cards/node_modules` 連到同一份。
  2. 在 `<base>/apps/Cards` 跑 `python3 patch-record.py .`（只改那個 worktree 的 `src`），再 `A1_RECORD=<路徑>/recorded.jsonl npm test`，錄下基準的測試裡每次呼叫的輸入。
  3. `node parse-ai.ts <base>/apps/Cards <head>/apps/Cards recorded.jsonl result-parse.md`（約 6 分鐘；`A1_QUICK=1` 只跑一小部分的窮舉）。
  4. `node session.ts <base>/apps/Cards <head>/apps/Cards result-session.md 2000`；加 `A1_UI=1` 另比畫面的元素樹（約 2 分鐘）。A1 對 A2 也用同一支：題型只准排序卡 `pick` → `order`，其他差異都報。
  5. 靈敏度：`A1_BREAK=map` 故意把多音字對錯；或在 `<head>` 暫時改一行產品程式（〈結果〉列了三種），看差分報不報。
- **沒跑的**：Obsidian 實機的畫面（Windows、iPhone）；真的 React（`review-ui.ts` 是替身：子元件直接展開，看不到元件換層之後 DOM 是重建還是沿用，見下面第 9 點）。

## 實作者自己選的做法（請先看）

1. **測試讀卡型的存取式寫在 `tests/helpers/kinds.ts`**，不在 13 個測試檔裡每一處寫一長串（說明 §1-7 第 1 類寫的是每一處換成存取式）。全詩與句子排序的兩個函式拿掉 `style`，回傳和舊欄位一樣的形狀，斷言的值才能不改。
2. **`kinds/` 的 import 規則**（說明沒要求）：`kinds/` 底下的檔只 import `kinds/shared.ts`，多音字、變化、排序另外可以 import `kinds/group.ts`，寫進 `eslint.config.js` 的 `crossModule`。
3. **`readKind`**（`question-types.ts`）是題目讀完後唯一的入口：依序認比較卡 → 多音字 → 排序（全詩；英文另認句子）→ 接句，遇到第一個卡型或提示就停。變化與文法照舊在名稱階段認（只有英文），認到了就不叫 `readKind`。順序照基準的 `parse.ts`；差分的窮舉與錄下的卡組都相同。
4. **拿掉的轉出**：`readPick`、`readChoice`、`readOrder`、`readSentence`、`readCouplet` 與型別 `PickReading`、`ChoiceReading` 不再從 `question-types.ts` 轉出（`parse.ts` 改叫 `readKind`，沒有別的使用者，knip 擋）；`KIND_NEEDS` 與 `Order` 不匯出。
5. **`draft.ts` 內部那一篇的欄位**從 `pick`（有沒有比較卡）改成 `need`（`needsOf` 裡最新的版本，`laterRelease` 挑）；寫進屬性的 `需要版本` 不變。`inspectReply` 的回傳因此少 `pick`、多 `need`（差分把舊的 `pick` 對成新的 `need` 比）。
6. **`check.ts` 兩處各列一次的檢查**包成 `isPickName`，兩處都呼叫它（說明 §1-4 的「只包成同一個函式」）。
7. **`existing.ts` 的 `kindShape`**：照 `KindId` 的 `switch`，比較卡比 `id` 與 `key`、多音字比 `word` 與 `optionKeys`、排序比 `style`、變化整個比、接句只比有沒有；另外留著「加過去之後多音字變不成點選就不寫」那一條。
8. **`move.ts:127` 的重試**照舊只看比較卡（`kind?.id === 'group'`），沒有換成 `needsOf`（Fable F8）。
9. **A2 的畫面**：`OrderCard.tsx` 的 `OrderBody` 照 `target.kind.order.style` 選句子或全詩的題目區（基準照 `group.order.starts` 有沒有；句子排序的卡一定有 `starts`、全詩一定沒有，`compose.ts` 的 `sentenceCardOf`、`orderCardOf`）；`PoemBody` 在沒有 `group.order` 時丟錯（走不到：`questionType` 是 `order` 才會選到它）；`orderScreen` 是 `{ ...pickScreen, Body: OrderBody }`，字鍵、底部那一排、Enter 與點卡片都和點選填空共用同一個函式。全詩的題目區從 `PickBody` 直接回傳 `<article>`，變成 `OrderBody` → `PoemBody` → `<article>`，多一層沒有 hook 的元件；`Review.tsx` 用 `cardKey`（目標、指紋、回看第幾張、第幾次出現）當 `Body` 的 key，換卡就重建，同一張卡的題型不會變。請看真的 React 會不會因為這一層有看得到的差別（焦點、Markdown 重新渲染）。
10. **A2 的測試**：`card-kinds.test.ts` 的「題型對得上」從 `PICKED`（是不是點選）改成 `TYPE_OF`（卡型對到哪一種題型，沒有就照打不打字）；`compare-versions.test.ts` 在 A1 新加的真 root 測試裡，排序的兩張卡 `pick` → `order`（說明的 A2 清單沒列，因為那個測試是 A1 才加的）；`english-order.test.ts` 改的是第 65 行（說明寫 64，A1 在檔頭多 import 一行）。
11. **差分的對照**（`common.ts` 的 `mapOld`）：每個看起來是目標的物件（有 `prompts`、`fields`、`direction`、`pairKey`），六個舊欄位在原本的位置換成 `kind`，JSON 的鍵順序才和新版一樣；同一個目標有兩個舊欄位時另外報。

## 回報與權限

照 code-quality 的 `review.md`〈審查請求範本〉的回報格式：每項發現寫觸發條件、預期／實際、影響、位置與證據，區分「已重現」「靜態推斷」「待驗證」，另標真實路徑會不會發生與發生機率。可以回報「規格本身有漏洞」。報告不逐段重述規格與差異；頭尾寫待審 commit、審查範圍、測試結果與沒驗的項目及原因。

報告寫在 `Claude Codex Discussion/2026-11-25-question-type-modules-l2.md`，標題下第一行寫狀態。

## 第一輪

- **共同祖先**：`40c17f5b25b08896c41d66ab71a5d584f7e6dccb`（現在的 `main`）。
- **待審**：共同祖先到這份請求所在的 commit（`git log -1 --format=%H -- apps/Cards/docs/tasks/question-type-modules-l2.md`）的全部改動（`git diff 40c17f5b..<那個 commit> -- apps/Cards`）。分支上比共同祖先早的 commit 是 PR #52 壓成一個之前的原樣，內容已在 `main`，不用看。
- **差分的基準**：A1 的基準是 `e7304dff`（PR #52、#53 合併之後、A1 之前的分支，`apps/Cards/src` 和 `40c17f5b` 相同）；A2 的基準是 `74fb12f6`。
- **請特別試**（附我跑過的）：
  - 認法的順序（第 3 點）：窮舉的維度在 `parse-ai.ts` 的 `CHARS`、`BRACKETS`、`ENDINGS`、`SEPS`、`SUBJECTS`、`PROMPTS`。窮舉沒涵蓋的組合，例如名稱裡同時有方向的結尾與括號、題目裡有註解與 HTML、隱式目標（最上層直接寫的題目）、`需要版本` 已經寫了更新的版本。
  - `needsOf`：`pick-answer-invalid` 的目標、草稿的 `need` 用 `laterRelease` 挑最新（現在只有 `PICK_NEEDS` 一種，`tests/ai-cards.test.ts` 的「§5 比較句的答案是組裡別的字」）、搬候選的 `needsMark`。
  - 加題核對（第 7 點）：差分的七種加題都寫得進去；其他會讓卡型的摘要變的加法，例如變化的目標加一題之後 `typing` 變不變、全詩加一句詩。
  - `tools/compare/` 從舊版的六個欄位推卡型摘要（`adapter.ts`）：`v0.2.0`～`v0.6.0` 各版本有的欄位不同，摘要和新版讀 `kind` 的對不對得上（`tests/compare-versions.test.ts` 的真 root 測試只跑現在的程式）。
  - A2 的畫面（第 9 點）：用真的 React 跑兩版的 `Review`，在比較卡、全詩、句子排序之間換卡、回看、切走 60 秒重來，焦點與 DOM 有沒有不一樣（題型接點第一步的 L2 F1 就是這一類，那次是底部那一排換了元件）。
- 報告寫在 `Claude Codex Discussion/2026-11-25-question-type-modules-l2.md`，標「第一輪」。

## 差分腳本

四個檔放在同一個資料夾（例如 repo 外的 `diff/`），在那裡執行。腳本不進 repo（任務說明 §1-7），全文貼在這裡。

### `patch-record.py`

在基準的 worktree 加上錄輸入的包裝（`python3 patch-record.py <base>/apps/Cards`）。

````python
# 在基準的 worktree 加上錄輸入的包裝（不 commit）。A1_RECORD 有值時，每次呼叫寫一行 JSON。
import sys, re
root = sys.argv[1]
REC = r'''// 不用靜態 import node:fs：畫面的測試把 src 打包成瀏覽器的程式，靜態 import 會讓打包失敗。
const __enc = (_k: string, v: unknown): unknown => v instanceof Map ? { __map: [...v] } : v instanceof Set ? { __set: [...v] } : v;
const __rec = (entry: unknown): void => { const g = globalThis as any; const p = g.process?.env?.A1_RECORD; if (p) g.process.getBuiltinModule('node:fs').appendFileSync(p, JSON.stringify(entry, __enc) + '\n'); };
'''
def patch(path, names, wrappers):
    p = root + '/' + path
    s = open(p).read()
    for n in names:
        s, k = re.subn(r'^export function ' + n + r'\(', 'function ' + n + '__inner(', s, flags=re.M)
        assert k >= 1, (path, n)
    s = REC + s + '\n' + wrappers + '\n'
    open(p, 'w').write(s)
patch('src/core/deck/parse.ts', ['parseDeck'], '''
export function parseDeck(text: any, options?: any): any { __rec({ f: 'parseDeck', text, options }); return parseDeck__inner(text, options); }
''')
patch('src/core/ai/check.ts', ['check'], '''
export function check(text: any, options: any = {}): any { __rec({ f: 'check', text, options }); return check__inner(text, options); }
''')
patch('src/core/ai/move.ts', ['moveCandidates', 'moveDeepen', 'moveItems'], '''
const __move = (f: string, inner: any) => (text: any, refs: any, context: any): any => {
  const asked: Record<string, boolean> = {};
  const out = inner(text, refs, { ...context, elsewhere: (id: string) => (asked[id] = context.elsewhere(id)) });
  __rec({ f, text, refs, asked });
  return out;
};
export const moveCandidates = __move('moveCandidates', moveCandidates__inner);
export const moveDeepen = __move('moveDeepen', moveDeepen__inner);
export const moveItems = __move('moveItems', moveItems__inner);
''')
patch('src/core/ai/existing.ts', ['planExisting'], '''
export function planExisting(input: any): any {
  const resolved: [string, string, string | null][] = [], ends: [unknown, string, string | null][] = [];
  const wrapped = { ...input,
    ...(input.resolve ? { resolve: (link: string, from: string) => { const r = input.resolve(link, from); resolved.push([link, from, r]); return r; } } : {}),
    ...(input.endpoint ? { endpoint: (link: unknown, side: string) => { const r = input.endpoint(link, side); ends.push([link, side, r]); return r; } } : {}) };
  const out = planExisting__inner(wrapped);
  const { resolve: _r, endpoint: _e, ...plain } = input;
  __rec({ f: 'planExisting', input: plain, hasResolve: !!input.resolve, hasEndpoint: !!input.endpoint, resolved, ends });
  return out;
}
''')
patch('src/core/ai/draft.ts', ['inspectReply', 'planDraft'], '''
const __asked = new WeakMap<object, unknown>();
const __memo = (now: any, seen: [string, unknown][]) => (id: string) => { const r = now(id); seen.push([id, r]); return r; };
export function inspectReply(reply: any, form: any, subject: any, sent: any, now: any): any {
  const seen: [string, unknown][] = [];
  const out = inspectReply__inner(reply, form, subject, sent, __memo(now, seen));
  const args = { reply, form, subject: { subject: subject.subject, r3: subject.r3 }, sent, now: seen };
  __asked.set(out, args);
  __rec({ f: 'inspectReply', ...args });
  return out;
}
export function planDraft(inspection: any, form: any, subject: any, sent: any, now: any, next: any, taken: any, date: any, code: any = null): any {
  const seen: [string, unknown][] = [], ids: string[] = [], before = [...taken];
  let out: unknown, error: string | null = null;
  try { out = planDraft__inner(inspection, form, subject, sent, __memo(now, seen), () => { const id = next(); ids.push(id); return id; }, taken, date, code); }
  catch (e) { error = String(e); }
  __rec({ f: 'planDraft', inspect: __asked.get(inspection) ?? null, form, subject: { subject: subject.subject, r3: subject.r3 }, sent, now: seen, ids, taken: before, date, code, error });
  if (error !== null) throw Error(error.replace(/^Error: /, ''));
  return out;
}
''')
print('patched')
````

### `common.ts`

舊版的六個欄位對成 `kind`、JSON、亂數（兩支腳本共用）。

````ts
// 題型模組 A1 的差分共用（不進 repo）：舊版的六個卡型欄位對成新版的 kind，照原本的位置放，JSON 的鍵順序才一樣。
export const LEGACY = ['group', 'choice', 'order', 'sentence', 'typing', 'couplet'] as const;

export function kindOfLegacy(field: string, value: any): any {
  switch (field) {
    case 'group': return { id: 'group', group: value };
    // 靈敏度檢查：A1_BREAK=map 故意把多音字對錯，差分應該報出來。
    case 'choice': return { id: process.env.A1_BREAK === 'map' ? 'choice' : 'polyphone', polyphone: value };
    case 'order': return { id: 'order', order: { style: 'poem', ...value } };
    case 'sentence': return { id: 'order', order: { style: 'sentence', ...value } };
    case 'typing': { const { kind, ...rest } = value; return { id: 'typing', typing: { style: kind, ...rest } }; }
    case 'couplet': return { id: 'couplet', couplet: value };
  }
  throw Error(field);
}

const isTarget = (v: any): boolean => v !== null && typeof v === 'object' && !Array.isArray(v) && 'prompts' in v && 'fields' in v && 'direction' in v && 'pairKey' in v;

/** 舊版的值裡每一個目標換成新版的寫法（深層）。同一個目標有兩個卡型欄位時記進 doubles。 */
export function mapOld(value: any, doubles: string[] = [], seen = new Map<any, any>()): any {
  if (value === null || typeof value !== 'object') return value;
  if (seen.has(value)) return seen.get(value);
  if (value instanceof Map) { const out = new Map(); seen.set(value, out); for (const [k, v] of value) out.set(k, mapOld(v, doubles, seen)); return out; }
  if (value instanceof Set) { const out = new Set(); seen.set(value, out); for (const v of value) out.add(mapOld(v, doubles, seen)); return out; }
  if (Array.isArray(value)) { const out: any[] = []; seen.set(value, out); for (const v of value) out.push(mapOld(v, doubles, seen)); return out; }
  const out: any = {};
  seen.set(value, out);
  const target = isTarget(value);
  const present = target ? LEGACY.filter(f => value[f] !== undefined) : [];
  if (present.length > 1) doubles.push(present.join('+') + '：' + String(value.name));
  for (const [k, v] of Object.entries(value)) {
    if (target && (LEGACY as readonly string[]).includes(k)) { if (v !== undefined) out.kind = mapOld(kindOfLegacy(k, v), doubles, seen); }
    else out[k] = mapOld(v, doubles, seen);
  }
  return out;
}

const enc = (_k: string, v: unknown): unknown => v instanceof Map ? { __map: [...v] } : v instanceof Set ? { __set: [...v] } : typeof v === 'function' ? '[fn]' : v;
export const json = (v: unknown): string => JSON.stringify(v, enc) ?? 'undefined';
/** 鍵排序後的 JSON：只差鍵順序時用來分辨。 */
export function canon(v: unknown): string {
  const sort = (x: any): any => {
    if (x instanceof Map) return { __map: [...x].map(([k, y]) => [k, sort(y)]) };
    if (x instanceof Set) return { __set: [...x].map(sort) };
    if (typeof x === 'function') return '[fn]';
    if (Array.isArray(x)) return x.map(sort);
    if (x && typeof x === 'object') return Object.fromEntries(Object.keys(x).sort().map(k => [k, sort(x[k])]));
    return x;
  };
  return JSON.stringify(sort(v)) ?? 'undefined';
}
export const revive = (_k: string, v: any): any => v && typeof v === 'object' && '__map' in v ? new Map(v.__map) : v && typeof v === 'object' && '__set' in v ? new Set(v.__set) : v;

/** 照種子的亂數（mulberry32）。 */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
````

### `parse-ai.ts`

`parseDeck`、AI 與需要版本。

````ts
// 題型模組 A1 §1-7〈差分〉的 parseDeck、AI 與需要版本（不進 repo）。
// 用法：node parse-ai.ts <基準的 apps/Cards> <A1 的 apps/Cards> <錄下的 jsonl> <結果的 md>
import { readFileSync, writeFileSync } from 'node:fs';
import { canon, json, mapOld, revive } from './common.ts';

const [baseRoot, headRoot, recordedPath, outPath] = process.argv.slice(2);
delete process.env.A1_RECORD;
async function load(root: string) {
  return {
    deck: await import(root + '/src/core/deck/index.ts'),
    ai: await import(root + '/src/core/ai/index.ts'),
    need: await import(root + '/src/state/need.ts'),
  };
}
const old = await load(baseRoot), now = await load(headRoot);

const diffs = new Map<string, string[]>();
const counts = new Map<string, number>();
const count = (k: string, n = 1): void => { counts.set(k, (counts.get(k) ?? 0) + n); };
function report(kind: string, detail: string): void {
  const list = diffs.get(kind) ?? [];
  if (list.length < 30) list.push(detail);
  diffs.set(kind, list);
  count('差異：' + kind);
}
/** 舊版的值對成新版的寫法後比：先比 JSON（鍵順序也要一樣），不一樣再看是不是只差鍵順序。 */
function same(kind: string, a: unknown, b: unknown, label: string): boolean {
  const doubles: string[] = [];
  const mapped = mapOld(a, doubles);
  for (const d of doubles) report('兩個卡型欄位（' + kind + '）', d + '｜' + label);
  const x = json(mapped), y = json(b);
  if (x === y) return true;
  if (canon(mapped) === canon(b)) { report('只差鍵順序（' + kind + '）', label.slice(0, 200)); return false; }
  report(kind, label.slice(0, 300) + '\n    舊：' + x.slice(0, 600) + '\n    新：' + y.slice(0, 600));
  return false;
}
const run = (f: () => unknown): unknown => { try { return f(); } catch (e) { return { thrown: String(e) }; } };

const VERSIONS = [null, '0.3.0', '0.4.0', '0.6.0', '99.0.0'];
const prepared = (text: string) => ({ text, expect: [], fresh: [], record: null, need: null });

/** 一份卡組文字：parseDeck、學過的單字、打字的提示、需要版本的寫入端。 */
function deckCase(text: string, options: unknown, label: string, deep: boolean): void {
  const a = run(() => old.deck.parseDeck(text, options)) as any, b = run(() => now.deck.parseDeck(text, options)) as any;
  count('parseDeck');
  if (!same('parseDeck', a, b, label + ' ' + json(text))) return;
  if (!a.targets) return;
  for (let i = 0; i < a.targets.length; i++) {
    const t0 = a.targets[i], t1 = b.targets[i];
    same('learnedWord', old.deck.learnedWord(t0), now.deck.learnedWord(t1), label + ' ' + t0.name);
    same('baseForm', old.deck.baseForm(t0), now.deck.baseForm(t1), label + ' ' + t0.name);
    for (const p of t0.prompts) if (p.kind === 'qa') same('typedHint', old.deck.typedHint(t0, p.question), now.deck.typedHint(t1, p.question), label + ' ' + t0.name);
  }
  if (!deep) return;
  count('需要版本與學過的單字');
  for (const v of VERSIONS) {
    same('markOf', run(() => old.need.markOf(text, v)), run(() => now.need.markOf(text, v)), label + ' v=' + v + ' ' + json(text));
    same('withNeed', run(() => old.need.withNeed(prepared(text), text, v)), run(() => now.need.withNeed(prepared(text), text, v)), label + ' v=' + v);
  }
  const props = a.props;
  if (props?.subject && props?.term) {
    same('learnedWords', run(() => old.ai.learnedWords([{ path: 'x.md', deck: a }], props.subject, props.term)), run(() => now.ai.learnedWords([{ path: 'x.md', deck: b }], props.subject, props.term)), label);
  }
}

// ── 1. 基準的測試錄下的呼叫 ──
const lines = readFileSync(recordedPath, 'utf8').split('\n').filter(Boolean);
const seen = new Set<string>();
const memo = (pairs: [string, unknown][]) => { const m = new Map(pairs.map(([k, v]) => [k, v])); return (id: string) => m.get(id); };
for (const line of lines) {
  if (seen.has(line)) { count('重複的錄音（跳過）'); continue; }
  seen.add(line);
  const r = JSON.parse(line, revive);
  switch (r.f) {
    case 'parseDeck': deckCase(r.text, r.options, '錄下的 parseDeck', true); break;
    case 'check': count('check'); same('check', run(() => old.ai.check(r.text, r.options)), run(() => now.ai.check(r.text, r.options)), json(r.text)); break;
    case 'moveCandidates': case 'moveDeepen': case 'moveItems': {
      count(r.f);
      const ctx = { elsewhere: (id: string) => r.asked[id] ?? false };
      same(r.f, run(() => old.ai[r.f](r.text, r.refs, ctx)), run(() => now.ai[r.f](r.text, r.refs, ctx)), json(r.text));
      break;
    }
    case 'planExisting': {
      count('planExisting');
      const resolve = (link: string, from: string) => (r.resolved.find((x: any) => x[0] === link && x[1] === from) ?? [0, 0, null])[2];
      const endpoint = (link: unknown, side: string) => (r.ends.find((x: any) => json(x[0]) === json(link) && x[1] === side) ?? [0, 0, null])[2];
      const input = { ...r.input, ...(r.hasResolve ? { resolve } : {}), ...(r.hasEndpoint ? { endpoint } : {}) };
      same('planExisting', run(() => old.ai.planExisting(input)), run(() => now.ai.planExisting(input)), json(r.input.original));
      break;
    }
    case 'inspectReply': {
      count('inspectReply');
      const a = run(() => old.ai.inspectReply(r.reply, r.form, r.subject, r.sent, memo(r.now))) as any;
      const b = run(() => now.ai.inspectReply(r.reply, r.form, r.subject, r.sent, memo(r.now))) as any;
      // 草稿的一篇：舊版的 pick（有比較卡）對新版的 need（needsOf 的最新版本，§1-5）。
      const piece = (x: any) => x?.pieces ? { ...x, pieces: x.pieces.map(({ pick, need, ...rest }: any) => ({ ...rest, need: need !== undefined ? need : pick ? '0.4.0' : null })) } : x;
      if (!same('inspectReply', piece(a), piece(b), json(r.reply).slice(0, 200))) {
        const flips = (a?.pieces ?? []).filter((p: any, i: number) => !p.pick && b?.pieces?.[i]?.need !== null);
        if (flips.length) report('inspectReply 的 need 多了（說明）', `錯誤 ${String(b?.errors?.length)} 個｜` + json(r.reply).slice(0, 200));
      }
      break;
    }
    case 'planDraft': {
      count('planDraft');
      if (!r.inspect) { count('planDraft 沒有對到 inspectReply（跳過）'); break; }
      const i = r.inspect;
      const go = (v: any) => {
        const ids = [...r.ids];
        const inspection = v.ai.inspectReply(i.reply, i.form, i.subject, i.sent, memo(i.now));
        return run(() => v.ai.planDraft(inspection, r.form, r.subject, r.sent, memo(r.now), () => ids.shift() ?? 'zzzzzz', new Set(r.taken), r.date, r.code));
      };
      same('planDraft', go(old), go(now), json(i.reply).slice(0, 200));
      break;
    }
  }
}

// ── 2. 窮舉：名稱的字 × 括號 × 結尾 × 分隔 × 科目 × 題目組合（Fable 第一輪的 p1.ts 同樣的維度） ──
const CHARS = ['寨', '塞', '長', 'go', 'borrow', 'light', '鳥鳴澗', '間接問句', '現在完成式', '能說明擴散', '**寨**', '==寨==', 'lie', 'I', '？'];
const BRACKETS = ['', '（寨、塞）', '（寨，塞）', '(寨、塞)', '（ㄓㄤˇ、ㄔㄤˊ）', '（borrow、lend）', '（go、went）', '（輕的）', '（躺）', '（寨 塞）', '（寨、塞）（ㄓㄤˇ、ㄔㄤˊ）', '（）', '（寨、塞'];
const ENDINGS = ['', '相似字', '相似詞', '比較', '讀音', '排序', '全詩 排序', '全詩排序', '接句', '第 1 句 接句', '第1句 接句', '第 2 句 接句', '文法', '過去式', '過去分詞', '複數', '比較級', '最高級', '英翻中', '中翻英',
  '寫法', '字義', '字義 相似詞', '辨字', '**相似字**', '==讀音==', '讀音 排序', '排序 接句', '接句 排序', '比較 文法', '文法 比較', '相似字 讀音', '讀音 相似字', '過去式 中翻英', '中翻英 過去式', '全詩', '第 1 句', '句', '序', '排 序', '讀 音', '相似'];
const SEPS = [' ', '　', ''];
const SUBJECTS = ['國語', '英文', '社會', null];
const P = {
  qa: '一般的問題？ :: 寨', sent: '山＿＿。 :: 寨', other: '大＿＿車。 :: 塞', ch1: '他長（＿＿）得比哥哥高。 :: ㄓㄤˇ', ch2: '這條路很長（＿＿）。 :: ㄔㄤˊ',
  c1: '題幹 ==寨== 結尾。', c2: '==人閒桂花落==，==夜靜春山空==。', en3: "I don't know ==where== ==he== ==lives==.", typed: 'Yesterday I ＿＿ to school. :: went', enzh: 'borrow :: 借入',
};
const singles = Object.keys(P) as (keyof typeof P)[];
const PROMPTS: (keyof typeof P)[][] = [...singles.map(k => [k]),
  ['sent', 'sent'], ['sent', 'other'], ['sent', 'qa'], ['sent', 'c1'], ['ch1', 'ch2'], ['ch1', 'ch1'], ['ch1', 'qa'], ['ch1', 'sent'], ['c2', 'c2'], ['c1', 'c1'],
  ['en3', 'en3'], ['en3', 'c2'], ['typed', 'typed'], ['typed', 'c1'], ['typed', 'qa'], ['enzh', 'qa'], ['c2', 'qa'], ['other', 'other']];
if (process.env.A1_QUICK) { CHARS.length = 3; BRACKETS.length = 3; }
let n = 0;
const started = Date.now();
for (const subject of SUBJECTS) for (const ch of CHARS) for (const br of BRACKETS) for (const sep of SEPS) for (const end of ENDINGS) for (const ps of PROMPTS) {
  const name = end ? ch + br + sep + end : ch + br;
  const head = subject === null ? '' : `---\n科目: ${subject}\n---\n`;
  const text = head + `- ${name}\n` + ps.map(k => `    - ${P[k]}\n`).join('');
  deckCase(text, {}, '窮舉', false);
  n++;
}
count('窮舉的卡組', n);
const exhaustiveSeconds = (Date.now() - started) / 1000;

// ── 3. 混合的卡組（§1-7）：變化與英翻中、同一首的接句與全詩、同一組的比較卡、多音字和比較卡在同一份 ──
const MIXED: [string, string][] = [
  ['變化與英翻中', '---\n科目: 英文\n年級學期: 國二上\n單元: L1\n---\n- go 英翻中 ^go0000\n    - go :: 去\n- go 過去式 ^gopast\n    - Yesterday I ＿＿ to school. :: went\n- lie（躺） 過去式 ^liepst\n    - He ＿＿ on the bed. :: lay\n- lie（躺） 英翻中 ^lie000\n    - lie :: 躺\n- 現在完成式 文法 ^gram00\n    - （現在完成式）I ＿＿ Tom since I was six. (know) :: have known\n- 間接問句 排序 ^order0\n    - I don\'t know ==where== ==he== ==lives==.\n'],
  ['接句與全詩', '---\n科目: 國語\n---\n## 鳥鳴澗\n\n- 鳥鳴澗 第 1 句 接句 ^coup01\n    - 人閒桂花落，==夜靜春山空==。\n- 鳥鳴澗 第 2 句 接句 ^coup02\n    - ==人閒桂花落==，夜靜春山空。\n- 鳥鳴澗 全詩 排序 ^poem00\n    - ==人閒桂花落==，==夜靜春山空==。==月出驚山鳥==，==時鳴春澗中==。\n    - 記憶錨點：\n        - 人心清閒\n'],
  ['比較卡併卡', '---\n科目: 國語\n---\n- 寨（寨、塞、寒） 相似字 ^zhai00\n    - 山＿＿。 :: 寨\n    - 古老的＿＿子。 :: 寨\n    - 記憶錨點：下面是**木**\n- 塞（寨、塞、寒） 相似字 ^sai000\n    - 大＿＿車。 :: 塞\n- 寒（寨、塞、寒） 相似字 ^han000\n    - ＿＿冷。 :: 寒\n'],
  ['多音字和比較卡', '---\n科目: 國語\n---\n- 寨（寨、塞） 相似字 ^zhai00\n    - 山＿＿。 :: 寨\n- 塞（寨、塞） 相似字 ^sai000\n    - 大＿＿車。 :: 塞\n- 長（ㄓㄤˇ、ㄔㄤˊ） 讀音 ^chang0\n    - 他長（＿＿）得比哥哥高。 :: ㄓㄤˇ\n    - 這條路很長（＿＿）。 :: ㄔㄤˊ\n    - 記憶錨點：\n        - ㄓㄤˇ：長大\n        - ㄔㄤˊ：很長\n        - 其他\n'],
];
for (const [label, text] of MIXED) for (const subject of [undefined, '國語', '英文']) deckCase(text, subject === undefined ? {} : { subject }, '混合：' + label, true);

// ── 4. 加題核對的七種加題（Fable G1）：新舊都寫得進去、寫出來的字一樣 ──
const head = (subject: string) => `---\n年級學期: 國二上\n科目: ${subject}\n單元: L1 課文\n---\n`;
const props = (subject: string) => now.deck.parseDeck(head(subject)).props;
const ADD: [string, string, string, string, string][] = [
  ['比較卡加一句', '國語', 'zhai00', '- 寨（寨、塞） 相似字 ^zhai00\n    - 盜匪躲在山＿＿裡。 :: 寨\n    - 古老的＿＿子。 :: 寨\n- 塞（寨、塞） 相似字 ^sai000\n    - 大＿＿車。 :: 塞\n', '    - 住在山＿＿裡。 :: 寨'],
  ['變化加一題', '英文', 'gopast', '- go 英翻中 ^go0000\n    - go :: 去\n- go 過去式 ^gopast\n    - Yesterday I ＿＿ to school. :: went\n', '    - He ＿＿ home early. :: went'],
  ['多音字加一句', '國語', 'chang0', '- 長（ㄓㄤˇ、ㄔㄤˊ） 讀音 ^chang0\n    - 他長（＿＿）得比哥哥高。 :: ㄓㄤˇ\n    - 這條路很長（＿＿）。 :: ㄔㄤˊ\n', '    - 班長（＿＿）很負責。 :: ㄓㄤˇ'],
  ['多音字加記憶錨點', '國語', 'chang0', '- 長（ㄓㄤˇ、ㄔㄤˊ） 讀音 ^chang0\n    - 他長（＿＿）得比哥哥高。 :: ㄓㄤˇ\n    - 這條路很長（＿＿）。 :: ㄔㄤˊ\n', '    - 記憶錨點：\n        - ㄓㄤˇ：長大、班長\n        - ㄔㄤˊ：很長、長度'],
  ['全詩加記憶錨點', '國語', 'poem00', '## 鳥鳴澗\n\n- 鳥鳴澗 全詩 排序 ^poem00\n    - ==人閒桂花落==，==夜靜春山空==。\n', '    - 記憶錨點：\n        - 人心清閒，桂花悄悄飄落；'],
  ['接句加記憶錨點', '國語', 'coup00', '## 鳥鳴澗\n\n- 鳥鳴澗 第 1 句 接句 ^coup00\n    - 人閒桂花落，==夜靜春山空==。\n', '    - 記憶錨點：\n        - 夜晚寂靜，春山顯得空曠。'],
  ['句子排序加一題', '英文', 'order0', '- 間接問句 排序 ^order0\n    - I don\'t know ==where== ==he== ==lives==.\n', '    - I wonder ==what== ==she== ==wants==.'],
];
const addResults: string[] = [];
for (const [label, subject, id, body, extra] of ADD) {
  const dest = head(subject) + body;
  const name = body.split('\n').find(l => l.includes('^' + id))!.replace(/^- /, '').replace(/ \^\w+$/, '');
  const original = [`- [[國二上${subject} L1#^${id}|${name}]]`, extra].join('\n');
  const input = { original, id, source: { path: `Essence Cards/學業/國二上/${subject}/L1 另一篇.md`, props: props(subject) }, dest: { path: `Essence Cards/學業/國二上/${subject}/L1.md`, text: dest }, version: '0.6.0' };
  const a = run(() => old.ai.planExisting(input)) as any, b = run(() => now.ai.planExisting(input)) as any;
  same('加題核對（七種）', a, b, label);
  addResults.push(`- ${label}：舊 ${a.kind === 'plan' ? (a.text === null ? '已經在' : '寫得進去') : '留著（' + (a.why ?? a.thrown) + '）'}；新 ${b.kind === 'plan' ? (b.text === null ? '已經在' : '寫得進去') : '留著（' + (b.why ?? b.thrown) + '）'}`);
}

// ── 結果 ──
const out = ['# A1 差分：parseDeck、AI 與需要版本', '', `基準 ${baseRoot}，A1 ${headRoot}。窮舉 ${String(n)} 份卡組，${exhaustiveSeconds.toFixed(0)} 秒。`, '', '## 次數', '',
  ...[...counts].map(([k, v]) => `- ${k}：${String(v)}`), '', '## 七種加題', '', ...addResults, '', '## 差異', ''];
if (!diffs.size) out.push('沒有差異。');
for (const [k, list] of diffs) out.push(`### ${k}（${String(counts.get('差異：' + k))} 處，列前 ${String(list.length)} 處）`, '', ...list.map(d => '- ' + d), '');
writeFileSync(outPath, out.join('\n') + '\n');
console.log(out.slice(0, 40).join('\n'));
````

### `session.ts`

`createSession`、`createPreview`，`A1_UI=1` 另比元素樹。

````ts
// 題型模組 A1 §1-7〈差分〉的 createSession、createPreview（不進 repo）：照 D-181 第一步的做法，同一個亂數種子餵同一串動作，
// 每一步比 view()（舊版的 card.target 照 common.ts 的對照換成 kind）、這一次做過的卡、每個檔的內容（紀錄的每一行）與動作的回傳值。
// A1_UI=1：另外用 tests/helpers/review-ui.ts 畫出兩邊的 Review，每一步比元素樹（標籤、class、文字與非函式的 props；§1-7〈畫面〉）。
// 用法：node session.ts <基準的 apps/Cards> <A1 的 apps/Cards> <結果的 md> [串數，預設 2000]
import { mock } from 'node:test';
import { writeFileSync } from 'node:fs';
import { json, mapOld, seeded } from './common.ts';

const [baseRoot, headRoot, outPath, many] = process.argv.slice(2);
const SEQUENCES = Number(many ?? 2000);
const UI = process.env.A1_UI === '1';
async function load(root: string) {
  return {
    state: await import(root + '/src/state/index.ts'),
    review: await import(root + '/src/review/index.ts'),
    deck: await import(root + '/src/core/deck/index.ts'),
    study: await import(root + '/src/core/study/index.ts'),
    memory: await import(root + '/tests/helpers/memory-files.ts'),
    ui: UI ? await import(root + '/tests/helpers/review-ui.ts') : null,
  };
}
const old = await load(baseRoot), now = await load(headRoot);
mock.timers.enable({ apis: ['setTimeout'] });

// ── 卡組：卡型範例 10 種（翻面、英翻中、接句、中翻英、文法、變化、比較卡、多音字、全詩、句子排序），每一種都有好幾題 ──
const ZH1 = 'Essence Cards/學業/國二上/國語/L1 山居.md';
const ZH2 = 'Essence Cards/學業/國二上/國語/L2 鳥鳴澗.md';
const EN1 = 'Essence Cards/學業/國二上/英文/L1 Back to School.md';
const SCI = 'Essence Cards/學業/國二上/自然/2-2 水溶液.md';
const PHONE = 'Essence Cards/紀錄/2026-10 iPhone-test.jsonl';
const CONFLICT = 'Essence Cards/學業/國二上/國語/重複.md';
const head = (subject: string, unit: string) => `---\n年級學期: 國二上\n科目: ${subject}\n單元: ${unit}\n---\n`;
const DECKS: Record<string, string> = {
  [ZH1]: head('國語', 'L1 山居') + [
    '- 寨（寨、塞、寒、賽） 相似字 ^zhai00', '    - 盜匪躲在山＿＿裡。 :: 寨', '    - 這座古老的＿＿子建在山頂上。 :: 寨', '    - 記憶錨點：下面是**木**',
    '- 塞（寨、塞、寒、賽） 相似字 ^sai000', '    - 下班時間大＿＿車。 :: 塞', '    - 水管＿＿住了。 :: 塞',
    '- 寒（寨、塞、寒、賽） 相似字 ^han000', '    - 冬天很＿＿冷。 :: 寒',
    '- 賽（寨、塞、寒、賽） 相似字 ^sai111', '    - 明天有籃球比＿＿。 :: 賽',
    '- 長（ㄓㄤˇ、ㄔㄤˊ） 讀音 ^chang0', '    - 他長（＿＿）得比哥哥高。 :: ㄓㄤˇ', '    - 這條路很長（＿＿）。 :: ㄔㄤˊ', '    - 記憶錨點：', '        - ㄓㄤˇ：長大', '        - ㄔㄤˊ：很長',
    '- 行（ㄒㄧㄥˊ、ㄏㄤˊ） 讀音 ^xing00', '    - 銀行（＿＿）在對面。 :: ㄏㄤˊ', '    - 我們步行（＿＿）上學。 :: ㄒㄧㄥˊ',
    '- 能說明「寨」的意思 ^mean00', '    - 「山寨」的寨是什麼意思？ :: 防守用的柵欄', '    - 寨是 ==防守用的柵欄== 。', '',
  ].join('\n'),
  [ZH2]: head('國語', 'L2 鳥鳴澗') + [
    '## 鳥鳴澗', '',
    '- 鳥鳴澗 第 1 句 接句 ^coup01', '    - 人閒桂花落，==夜靜春山空==。',
    '- 鳥鳴澗 第 2 句 接句 ^coup02', '    - 月出驚山鳥，==時鳴春澗中==。',
    '- 鳥鳴澗 全詩 排序 ^poem00', '    - ==人閒桂花落==，==夜靜春山空==。==月出驚山鳥==，==時鳴春澗中==。', '    - 記憶錨點：', '        - 人心清閒', '',
  ].join('\n'),
  [EN1]: head('英文', 'L1 Back to School') + [
    "- make up one's mind 英翻中 ^e1aaaa", "    - make up one's mind :: 下定決心",
    "- make up one's mind 中翻英 ^z1aaaa", '    - 他已經下定決心要出國讀書。He has already ＿＿ to study abroad. :: made up his mind | made his mind up', '        - 詳解：兩種都對，課本用前者',
    '- borrow 英翻中 ^e2aaaa', '    - borrow :: v. 借入、向別人借', '        - 例句：Can I borrow your pen? 我可以借你的筆嗎？',
    '- borrow 中翻英 ^z2aaaa', '    - Can I ＿＿ your pen?（借） :: borrow',
    '- go 英翻中 ^go0000', '    - go :: 去',
    '- go 過去式 ^gopast', '    - Yesterday I ＿＿ to school.（去） :: went', '    - He ＿＿ home early. :: went',
    '- lie（躺） 英翻中 ^lie000', '    - lie :: 躺',
    '- lie（躺） 過去式 ^liepst', '    - He ＿＿ on the bed. :: lay',
    '- 現在完成式 文法 ^gram00', '    - I ＿＿ Tom since I was six. (know) :: have known', '    - She ＿＿ here for two years. (live) :: has lived',
    '- 間接問句 排序 ^order0', "    - 我不知道他住在哪裡。I don't know ==where== ==he== ==lives==.", '    - 我想知道她要什麼。I wonder ==what== ==she== ==wants==.',
    '- borrow（borrow、lend） 比較 ^borrow', '    - Can I ＿＿ your pen? :: borrow', '    - May I ＿＿ this? :: borrow',
    '- lend（borrow、lend） 比較 ^lendxx', '    - Can you ＿＿ me a pen? :: lend', '    - Banks ＿＿ money. :: lend', '',
  ].join('\n'),
  [SCI]: head('自然', '2-2 水溶液') + [
    '- 能說出溶質與溶劑的意思 ^a1aaaa', '    - 糖水裡，哪一個是溶質？ :: 糖是**溶質**',
    '- 能說明溶液的質量組成 ^a2aaaa', '    - 溶液的質量怎麼算？ :: **溶質**加**溶劑**', '    - 溶液的質量 = ==溶質== + ==溶劑==', '',
  ].join('\n'),
};
const CONFLICT_TEXT = head('國語', 'L1 山居') + '- 寨（寨、塞） 寫法 ^zhai00\n    - 山＿＿ :: 寨\n- 塞（寨、塞） 寫法 ^sai222\n    - 大＿＿車 :: 塞\n';

// 卡型對照：A1 的 parseDeck 認出來的，每一種都要在上面。
function kindName(target: any): string {
  const kind = target.kind;
  if (!kind) return target.direction ?? 'flip';
  return kind.id === 'order' ? kind.order.style + '-order' : kind.id === 'typing' ? 'typing-' + kind.typing.style : kind.id;
}
const kinds = new Map<string, number>();
const parsed = new Map<string, { old: any; now: any }>();
for (const [path, text] of Object.entries(DECKS)) {
  const a = old.deck.parseDeck(text), b = now.deck.parseDeck(text);
  if (a.problems.length || b.problems.length) throw Error(path + ' 有寫法的問題：' + json(b.problems));
  if (json(mapOld(a)) !== json(b)) throw Error(path + ' 的 parseDeck 不同');
  parsed.set(path, { old: a, now: b });
  for (const target of b.targets) kinds.set(kindName(target), (kinds.get(kindName(target)) ?? 0) + 1);
}
const EXPECTED = ['flip', 'en-zh', 'couplet', 'zh-en', 'typing-grammar', 'typing-inflection', 'group', 'polyphone', 'poem-order', 'sentence-order'];
for (const k of EXPECTED) if (!kinds.has(k)) throw Error('卡組少了卡型 ' + k);
const allTargets = [...parsed.values()].flatMap(p => p.now.targets as any[]);

// ── 比對 ──
const counts = new Map<string, number>();
const count = (k: string, n = 1): void => { counts.set(k, (counts.get(k) ?? 0) + n); };
const diffs: string[] = [];
function differ(label: string, a: string, b: string): boolean {
  if (a === b) return false;
  count('差異');
  if (diffs.length < 40) {
    let i = 0;
    while (i < a.length && a[i] === b[i]) i++;
    diffs.push(`${label}\n    舊：…${a.slice(Math.max(0, i - 200), i + 400)}\n    新：…${b.slice(Math.max(0, i - 200), i + 400)}`);
  }
  return true;
}
// ── 畫面：元素樹（函式與 ref 不比；props 裡的物件照樣比，舊版的目標照 mapOld 換）──
const NO_OWNER = { term: null, subject: null, unit: null };
const uiProps = (session: any) => ({
  app: {}, session, close: () => {}, openLink: () => {}, materials: () => [], owner: () => NO_OWNER, units: () => [],
  speech: { say: () => {}, stop: () => {} }, autoRead: { get: () => false, set: () => {} }, pickedAt: 0, onReport: () => {},
});
function plain(value: any, seen: WeakSet<object>, depth: number): any {
  if (typeof value === 'function') return undefined;
  if (value === null || typeof value !== 'object') return value;
  if (seen.has(value)) return '[cycle]';
  if (depth > 14) return '[deep]';
  seen.add(value);
  const out = Array.isArray(value) ? value.map(each => plain(each, seen, depth + 1)) : Object.fromEntries(Object.entries(value).flatMap(([k, v]) => typeof v === 'function' ? [] : [[k, plain(v, seen, depth + 1)]]));
  seen.delete(value);
  return out;
}
function tree(node: any): any {
  if (typeof node === 'string') return node;
  const props: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(node.props as Record<string, unknown>)) if (k !== 'children' && k !== 'ref' && typeof v !== 'function') props[k] = plain(v, new WeakSet(), 0);
  return { type: node.type, props, children: (node.children as any[]).map(tree) };
}
const stages = new Map<string, number>();
function stageOf(view: any): string {
  if (view.kind !== 'card') return view.kind;
  const c = view.card;
  const kind = kindName(c.card.target);
  const stage = c.viewing ? '回看' : c.pick ? (c.pick.stage === 'result' ? '結果' : c.pick.stage === 'retry' ? '再選' : '作答中') : c.typed ? (c.typed.finished ? '結果' : `作答中（第 ${String(c.typed.step)} 步）`) : c.revealed ? '結果' : '作答中';
  return kind + '｜' + stage;
}
/** 目前這張的題型：相同，或 A2 的排序（舊 pick、新 order，只有組有 order 的卡）；其他都是差異。 */
function sameType(label: string, a: any, b: any): boolean {
  if (a.kind !== 'card' || b.kind !== 'card') return false;
  const x = old.study.questionType(a.card.card), y = now.study.questionType(b.card.card);
  if (x === y) { count('題型相同：' + x); return false; }
  if (x === 'pick' && y === 'order' && b.card.card.group?.order) { count('題型 pick → order（排序卡）'); return false; }
  return differ(label + '（題型）', x, y);
}
const tick = async (): Promise<void> => { for (let i = 0; i < 6; i++) { mock.timers.tick(5); await new Promise<void>(resolve => setImmediate(resolve)); } };

// ── 動作 ──
type Action =
  | { k: 'reveal' } | { k: 'input'; text: string } | { k: 'submit' } | { k: 'skip' } | { k: 'act'; a: any } | { k: 'rate'; r: string } | { k: 'commit' }
  | { k: 'back' } | { k: 'forward' } | { k: 'toCurrent' } | { k: 'pause' } | { k: 'resume' } | { k: 'clock'; ms: number }
  | { k: 'continue'; pick: any } | { k: 'reopen'; pick: any } | { k: 'phone'; line: string } | { k: 'conflict'; on: boolean };
const RATINGS = ['miss', 'near', 'good', 'easy'];
const kindsSeen = new Map<string, number>();

function choose(rng: () => number, view: any, ctx: { picks: () => any[] }, preview: boolean): Action {
  const one = <T>(list: readonly T[]): T => list[Math.floor(rng() * list.length)];
  const roll = rng();
  if (view.kind === 'done') {
    if (preview) return one([{ k: 'back' }, { k: 'forward' }, { k: 'reveal' }] as Action[]);
    const buttons = (view.done.buttons as any[]).filter(b => b.pick);
    if (roll < 0.5 && buttons.length) return { k: 'continue', pick: one(buttons).pick };
    if (roll < 0.65) return { k: 'back' };
    if (roll < 0.8) return { k: 'clock', ms: one([2 * 3600_000, 86_400_000, 3 * 86_400_000]) };
    return { k: 'reopen', pick: one(ctx.picks()) };
  }
  if (view.kind !== 'card') return { k: 'clock', ms: 400 };
  const card = view.card;
  const options: [number, () => Action][] = [
    [6, () => ({ k: 'clock', ms: 400 })],
    [4, () => ({ k: 'reveal' })],
    [5, () => ({ k: 'rate', r: one(RATINGS) })],
    [1.5, () => ({ k: 'back' })], [preview ? 5 : 1, () => ({ k: 'forward' })], [1, () => ({ k: 'toCurrent' })],
    [1, () => ({ k: 'commit' })],
  ];
  if (!preview) options.push(
    [0.6, () => ({ k: 'pause' })], [0.8, () => ({ k: 'resume' })],
    [0.6, () => ({ k: 'clock', ms: one([30_000, 61_000, 2 * 3600_000, 86_400_000]) })],
    [0.3, () => ({ k: 'reopen', pick: one(ctx.picks()) })],
    [0.5, () => { const target = one(allTargets); const prompt = one(target.prompts as any[]); return { k: 'phone', line: old.study.encodeEntry(new Date(clockNow + 8 * 3600_000 - 1000).toISOString().replace('Z', '+08:00'), { lt: target.id, r: one(RATINGS), v: prompt.fingerprint }) }; }],
    [0.15, () => ({ k: 'conflict', on: rng() < 0.6 })],
  );
  if (card.typed) {
    const prompt = card.card.prompt;
    const answers: string[] = prompt.kind === 'qa' ? String(prompt.answer).split('|').map((s: string) => s.trim()) : [''];
    const a0 = one(answers);
    const texts = [a0, a0.toUpperCase() + ' ', a0.slice(0, -1), a0 + 's', 'xyz', '', '   ', card.typed.hint ?? 'went', a0.replace(/a/, 'e')];
    options.push([6, () => ({ k: 'input', text: one(texts) })], [6, () => ({ k: 'submit' })], [2, () => ({ k: 'skip' })]);
  }
  if (card.pick) {
    const keys: string[] = card.card.group?.keys ?? [];
    options.push(
      [10, () => { const at = Math.floor(rng() * Math.max(1, keys.length)); return { k: 'act', a: { kind: 'key', key: keys[at] ?? '？', at } }; }],
      [1.5, () => ({ k: 'act', a: { kind: 'row', index: Math.floor(rng() * (card.pick.cells.length + 1)) } })],
      [3, () => ({ k: 'act', a: { kind: 'check' } })],
      [1.5, () => ({ k: 'act', a: { kind: 'skip' } })],
      [2, () => ({ k: 'commit' })],
    );
  }
  const total = options.reduce((s, [w]) => s + w, 0);
  let x = roll * total;
  for (const [w, f] of options) { if ((x -= w) < 0) return f(); }
  return options[0][1]();
}
let clockNow = 0;

// ── 一串 createSession ──
interface Side { v: typeof old; memory: any; state: any; session: any; ui?: any }
async function sessionSequence(seed: number): Promise<void> {
  const rng = seeded(seed);
  const start = Date.parse('2026-10-24T19:00:00.000+08:00') + Math.floor(rng() * 20) * 86_400_000 + Math.floor(rng() * 6) * 3600_000;
  const clock = { now: start };
  // 每一串的卡組與紀錄不同：卡組挑一部分，紀錄照亂數補前幾天的作答（有到期的、答錯的、新的）。
  const paths = Object.keys(DECKS).filter(() => rng() < 0.75);
  if (!paths.length) paths.push(ZH1);
  const lines: string[] = [];
  for (const path of paths) for (const target of parsed.get(path)!.old.targets) {
    if (rng() < 0.35) continue;
    const times = 1 + Math.floor(rng() * 4);
    let at = start - (1 + Math.floor(rng() * 40)) * 86_400_000;
    for (let i = 0; i < times && at < start; i++) {
      const prompt = target.prompts[Math.floor(rng() * target.prompts.length)];
      const fields: any = { lt: target.id, r: RATINGS[Math.floor(rng() * 4)], v: prompt.fingerprint };
      // 比較卡的紀錄有時帶 pick（舊版的目標有 group、新版的在 kind 裡，兩種都認，亂數才走同一條）。
      const group = target.group ?? (target.kind?.id === 'group' ? target.kind.group : undefined);
      if (group && rng() < 0.5) fields.pick = rng() < 0.7 ? group.members[0] ?? null : null;
      lines.push(old.study.encodeEntry(new Date(at + 8 * 3600_000).toISOString().replace('Z', '+08:00'), fields));
      at += (1 + Math.floor(rng() * 6)) * 86_400_000;
    }
  }
  const vault: Record<string, string> = Object.fromEntries(paths.map(path => [path, DECKS[path]]));
  if (lines.length) vault[PHONE] = lines.join('\n') + '\n';
  // 四成的串有考試範圍（段考前的新卡先出、接句與全詩的先後，practice.ts 與 plan.ts 照卡型分的地方）：單元隨機挑，日期在開始前後。
  if (rng() < 0.4) {
    const units = [['國語', 'L1'], ['國語', 'L2'], ['英文', 'L1'], ['自然', '2-2']].filter(() => rng() < 0.6);
    const day = (d: number): string => new Date(start + d * 86_400_000 + 8 * 3600_000).toISOString().slice(0, 10);
    const from = Math.floor(rng() * 10) - 3, length = Math.floor(rng() * 5);
    vault['Essence Cards/考試範圍/段考.md'] = `---\n識別碼: x7f3k2\n考試開始: ${day(from)}\n考試結束: ${day(from + length)}\n---\n` + units.map(([subject, code]) => `- 國二上 ${subject} ${code}\n`).join('');
    count('有考試範圍的串');
  }
  const settings = { capMinutes: [5, 30, 120][Math.floor(rng() * 3)], retention: 0.8, filter: [] };
  const make = async (v: typeof old): Promise<Side> => {
    const memory = v.memory.createMemoryFiles(vault);
    const state = v.state.createState({ files: memory.files, device: 'PC-test', delay: 1, fillIds: false, now: () => clock.now, offset: () => 480, settings });
    const ready = state.ready();
    await tick();
    await ready;
    return { v, memory, state, session: null, ui: null };
  };
  const A = await make(old), B = await make(now);
  if (vault['Essence Cards/考試範圍/段考.md'] && (A.state.progress?.().subjects ?? []).some((row: any) => row.inExam)) count('考試範圍有作用的串');
  const ctx = {
    picks: (): any[] => {
      const share = (A.state.today().share as any[]).map(item => item.lt);
      const units = (A.state.catalog().terms as any[]).flatMap(term => term.subjects.flatMap((s: any) => s.units.map((u: any) => u.key)));
      const since = clock.now - Math.floor(rng() * 10) * 86_400_000;
      const deck = paths[Math.floor(rng() * paths.length)];
      const unit = units[Math.floor(rng() * units.length)];
      const some = share.filter(() => rng() < 0.5);
      return [{ subject: null }, { subject: '國語' }, { subject: '英文' }, { subject: '自然' }, { deck }, { more: true }, { targets: some }, { targets: some, since },
        { deck, since }, ...(unit ? [{ unit }, { unit, since }] : [])];
    },
  };
  const open = async (pick: any): Promise<void> => {
    for (const side of [A, B]) { side.session?.close(); side.session = side.v.review.createSession({ state: side.state, pick, now: () => clock.now }); }
    const ready = Promise.all([A.session.ready(), B.session.ready()]);
    await tick();
    await ready;
    if (UI) for (const side of [A, B]) { side.ui?.unmount(); side.ui = await side.v.ui.renderReview(uiProps(side.session)); }
  };
  const settleUi = async (): Promise<void> => { if (UI) { const done = Promise.all([A.ui.settle(), B.ui.settle()]); await tick(); await done; } };
  await open(ctx.picks()[Math.floor(rng() * 11)]);
  const steps = 60 + Math.floor(rng() * 40);
  for (let step = 0; step <= steps; step++) {
    clockNow = clock.now;
    const before = A.session.view();
    const action = choose(rng, before, ctx, false);
    count('動作：' + action.k);
    const shown = B.session.view();
    if (shown.kind === 'card') kindsSeen.set(kindName(shown.card.card.target), (kindsSeen.get(kindName(shown.card.card.target)) ?? 0) + 1);
    const results: unknown[] = [];
    switch (action.k) {
      case 'clock': clock.now += action.ms; break;
      case 'reopen': await open(action.pick); break;
      case 'phone': A.memory.append(PHONE, action.line); B.memory.append(PHONE, action.line); break;
      case 'conflict':
        for (const side of [A, B]) {
          if (action.on) side.memory.write(CONFLICT, CONFLICT_TEXT); else if (side.memory.texts.has(CONFLICT)) side.memory.remove(CONFLICT);
        }
        break;
      default:
        for (const side of [A, B]) {
          const s = side.session;
          switch (action.k) {
            case 'reveal': results.push(s.reveal()); break;
            case 'input': results.push(s.input(action.text)); break;
            case 'submit': results.push(s.submit()); break;
            case 'skip': results.push(s.skip()); break;
            case 'act': results.push(s.act(action.a)); break;
            case 'rate': results.push(s.rate(action.r)); break;
            case 'commit': results.push(s.commit()); break;
            case 'back': results.push(s.back()); break;
            case 'forward': results.push(s.forward()); break;
            case 'toCurrent': results.push(s.toCurrent()); break;
            case 'pause': results.push(s.pause()); break;
            case 'resume': results.push(s.resume()); break;
            case 'continue': results.push(s.continueWith(action.pick)); break;
          }
        }
    }
    await tick();
    await Promise.all([A.state.flush(), B.state.flush()]);
    await tick();
    await settleUi();
    const label = `種子 ${String(seed)} 第 ${String(step)} 步 ${json(action).slice(0, 160)}`;
    if (UI) {
      if (differ(label + '（元素樹）', json(mapOld(tree(A.ui.root()))), json(tree(B.ui.root())))) break;
      const st = stageOf(B.session.view());
      stages.set(st, (stages.get(st) ?? 0) + 1);
      count('比過的元素樹');
    }
    const bad = differ(label + '（回傳值）', json(results[0]), json(results[1]))
      || differ(label + '（view）', json(mapOld(A.session.view())), json(B.session.view()))
      || differ(label + '（這一次做過的卡）', json(mapOld(A.session.history())), json(B.session.history()))
      || differ(label + '（每個檔）', json([...A.memory.texts]), json([...B.memory.texts]))
      || differ(label + '（pick）', json(A.session.pick()), json(B.session.pick()))
      || sameType(label, A.session.view(), B.session.view());
    count('比過的步');
    if (bad) break;
  }
  for (const [path, text] of A.memory.texts as Map<string, string>) if (path.endsWith('PC-test.jsonl')) count('這台寫的紀錄行', text.split('\n').filter(Boolean).length);
  for (const side of [A, B]) { side.ui?.unmount(); side.session?.close(); side.state.close(); }
  await tick();
}

// ── 一串 createPreview ──
async function previewSequence(seed: number): Promise<void> {
  const rng = seeded(seed);
  const path = Object.keys(DECKS)[Math.floor(rng() * 4)];
  const reveal = rng() < 0.3;
  const { old: a, now: b } = parsed.get(path)!;
  const A = old.review.createPreview({ path, deck: a, reveal }), B = now.review.createPreview({ path, deck: b, reveal });
  if (differ(`預覽 ${String(seed)} 開頭`, json(A === null), json(B === null)) || !A) return;
  const uiA = UI ? await old.ui.renderReview(uiProps(A)) : null, uiB = UI ? await now.ui.renderReview(uiProps(B)) : null;
  const steps = 60 + Math.floor(rng() * 40);
  for (let step = 0; step <= steps; step++) {
    const before = A.view();
    const action = choose(rng, before, { picks: () => [] }, true);
    count('預覽的動作：' + action.k);
    const shown = B.view();
    if (shown.kind === 'card') kindsSeen.set('預覽 ' + kindName(shown.card.card.target), (kindsSeen.get('預覽 ' + kindName(shown.card.card.target)) ?? 0) + 1);
    const results: unknown[] = [];
    for (const s of [A, B]) {
      switch (action.k) {
        case 'clock': break;
        case 'reveal': results.push(s.reveal()); break;
        case 'input': results.push(s.input(action.text)); break;
        case 'submit': results.push(s.submit()); break;
        case 'skip': results.push(s.skip()); break;
        case 'act': results.push(s.act(action.a)); break;
        case 'rate': results.push(s.rate(action.r)); break;
        case 'commit': results.push(s.commit()); break;
        case 'back': results.push(s.back()); break;
        case 'forward': results.push(s.forward()); break;
        case 'toCurrent': results.push(s.toCurrent()); break;
      }
    }
    if (UI) { const done = Promise.all([uiA.settle(), uiB.settle()]); await tick(); await done; }
    const label = `預覽 ${String(seed)} ${path} 第 ${String(step)} 步 ${json(action).slice(0, 160)}`;
    if (UI) {
      if (differ(label + '（元素樹）', json(mapOld(tree(uiA.root()))), json(tree(uiB.root())))) break;
      const st = '預覽 ' + stageOf(B.view());
      stages.set(st, (stages.get(st) ?? 0) + 1);
      count('預覽比過的元素樹');
    }
    const bad = differ(label + '（回傳值）', json(results[0]), json(results[1]))
      || differ(label + '（view）', json(mapOld(A.view())), json(B.view()))
      || sameType(label, A.view(), B.view());
    count('預覽比過的步');
    if (bad) break;
  }
  uiA?.unmount(); uiB?.unmount();
  A.close(); B.close();
}

const started = Date.now();
for (let i = 0; i < SEQUENCES; i++) { await sessionSequence(1000 + i); count('createSession 的串'); }
for (let i = 0; i < SEQUENCES; i++) { await previewSequence(900_000 + i); count('createPreview 的串'); }
mock.timers.reset();

const out = ['# A1 差分：createSession、createPreview', '', `基準 ${baseRoot}，A1 ${headRoot}。${String(SEQUENCES)} 串 createSession、${String(SEQUENCES)} 串 createPreview，每串 60～100 步，${((Date.now() - started) / 1000).toFixed(0)} 秒。`, '',
  '## 次數', '', ...[...counts].sort().map(([k, v]) => `- ${k}：${String(v)}`), '', '## 出現過的卡型（目前這張是哪一種，步數）', '', ...[...kindsSeen].sort().map(([k, v]) => `- ${k}：${String(v)}`), '',
  ...(UI ? ['## 比過的元素樹：卡型與階段', '', ...[...stages].sort().map(([k, v]) => `- ${k}：${String(v)}`), ''] : []), '## 差異', ''];
if (!diffs.length) out.push('沒有差異。');
for (const d of diffs) out.push('- ' + d);
writeFileSync(outPath, out.join('\n') + '\n');
console.log(out.join('\n').slice(0, 6000));
process.exit(0);
````

## 結果

（審完填。）

延後的測試：無（Windows 版 Obsidian 的畫面、兩個正式 vault 的 `compare-versions` 與 iPhone 屬於[任務說明](question-type-modules.md#結果)的驗收）。
