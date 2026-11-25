# 題型模組：照形式分、每一科通用（給 Claude，L2 在本機）

狀態：待審｜下一步：使用者回 §6 三題、合併 PR #52 與 #53；Fable 5.2 xhigh 看第 2 版｜等誰：使用者、Claude

來自：使用者 2026-11-25：「我要做的不是每一科目不同的題型，是一個通用模組，例如每一科都有填空題，配對題，單選題等等」「現在做，進0.7.0」；[題型模組規劃稿](<../Claude Codex Discussion/2026-11-25-question-type-modules.md>)（第 2 版，Fable 5.2 xhigh 第一輪審過）的 §2、§5 第 1、2 段。

遵守 repo 根目錄的 `AGENTS.md`。建議模型與推理等級：寫這份用 **Opus、xhigh**，實作用 **Opus、高**（[quality.md](../../../../docs/agents/quality.md)）。改的是卡型怎麼認（[syntax §2-3](../syntax.md)，P1：寫進筆記的格式不能讀成別的）、組卡、作答與畫面，跨 `core/deck`、`core/study`、`core/ai`、`review`、`ui`，屬於高風險範圍：每一個 PR 合併前各做 L2（Codex 額度已重置，照 quality.md 在使用者的電腦跑）。必讀 code-quality 的〈測試〉。

依據：[D-181](../../../../docs/decisions.md#d-181-題型是可以接上的模組開題型專區)（題型是可以接上的模組；第一步只搬不改的做法）、[D-233](../../../../docs/decisions.md#d-233-題型照形式分各科與題庫共用配對單選也進每天複習)（題型照形式分、各科共用；配對、單選進 0.7.0）、D-110（模組邊界，`eslint.config.js` 擋）、[D-182](../../../../docs/decisions.md#d-182-比較點選各科都能用家長出題時勾選)、[D-187](../../../../docs/decisions.md#d-187-全詩順序卡一首一張放在這首最後)、[D-192](../../../../docs/decisions.md#d-192-比較點選改名點選填空英文預設也勾)、[D-193](../../../../docs/decisions.md#d-193-英文的學習地圖詞是根句型是骨架) 第 5、6、8 點、[D-230](../../../../docs/decisions.md#d-230-國語字義卡和詞義卡錯開混淆點第一次就比多音字改點選填空) 第 4 點（多音字）、[D-195](../../../../docs/decisions.md#d-195-測試分兩類改不回來的做足其餘延後但不漏)、[D-207](../../../../docs/decisions.md#d-207-l2-的發現先分一定修可記限制交使用者選修法先收窄最後才加機制)；[Cards backlog〈技術債〉](../backlog.md#技術債)「讀手寫文字的去格式各處自己寫」。第 2 版照 Fable 第一輪（§7）改寫，每一項的處理在 §8。

## 和「不做」比較（D-153）

比較表在規劃稿 §3，這裡只寫結論與使用者的選擇：

- **不做**：每加一種卡在 `Target` 多一欄，16 個讀卡型欄位的檔靠人記得改，漏接要到 L2 才抓到（英文 L2 的 R2）；去格式有三套以上，L2 的發現多半是這一類（多音字 L2 四輪、英文 L2 的 R6）；排序照科目分成兩套，和使用者「照形式、不照科目」的方向不合。配對、單選（D-233）也要接在同樣散開的地方。
- **做的好處**：加一種卡型或一種作答方式時，每一層漏了哪裡編譯不過，配對、單選直接受益；「畫面上看得到的字」只算一次。孩子看不到差別（第 B 步的例外列在 §2-3）。
- **代價**：碰到排程、組卡與畫面的檔，孩子正在用（國二 2027-01-19 段考）。使用者 2026-11-25 選現在做、進 0.7.0，所以第 A 步照 D-181 第一步的驗收做足（§1-7），每一步自己一個 PR、自己的 L2。

## 排程與分支

| 步 | 內容 | 驗收 | 等什麼 |
|---|---|---|---|
| 0 | 這份說明；Fable 5.2 xhigh 審（第一輪已審，§7） | | |
| A1 | §1-1～§1-6：卡型欄位併成一欄、拆檔、每一層照卡型分；`QuestionType` 仍是三個；行為不變 | §1-7 | PR #53（多音字）與 PR #52（卡型分類表）都已合併，`main` 上 `npm run check` 全過、分類表已有多音字的列與範例 |
| A2 | §1-8：排序成為自己的題型（內部的 `QuestionType`） | §1-8 | A1；§6 第 3 題只影響文件與家長看得到的名稱，程式不等 |
| — | 配對、單選（D-233）：另寫任務說明，接在 A2 的結構上 | 照那份 | A2；[配對與單選討論稿](<../Claude Codex Discussion/2026-11-25-matching-single-choice.md>)談定 |
| C | §3：去格式一處 | §3-5 | A2；自己一個 PR |
| B | §2：排序不看科目 | §2-4 | A2；使用者同意 §6 第 1 題；自己一個 PR |

- **A1、A2 一個 PR、一次 L2，先合併**；其他在動 `core/ai`、`session.ts`、`practice.ts` 的串照 §1-9 的對照表改一次。C、B 各自開 PR、各自 L2（D-181 也是兩步分開查）。L2 每次到第四輪為止（D-171）。Windows 看一次畫面在每個 PR 合併前；iPhone 併進 0.7.0 的那一次。
- **時程與停損**（💡 等使用者看，§6 第 4 題）：0.7.0 要在 2027-01-11 前裝好（[提早試用計畫〈0.7.0 放什麼〉](../plans/early-trial.md#070-放什麼)），同一版還有考前抽測、AI 製卡存不了草稿的修正、多音字。順序是 A → 配對與單選 → C → B；2027-01-04 之後只修錯；來不及時先延後 B（段考前沒有卡組用得到，所有預設裡非英文的排序只有 `鳥鳴澗 全詩 排序`），再延後 C，延到 0.7.x。
- 分支：每一步從當時的 `main` 開新分支；一個 commit 只做一件事（code-quality〈測試〉）。
- 同時在動 Cards 的串：考前抽測、手機啟用第二步、API 製卡、比較測試工具（也改 `tools/compare/adapter.ts`，§1-7 的快照欄位先和它對）、AI 提示詞架構。A1 開工前問各串預計合併的日子。

## §1 第 A 步：一種卡型在每一層一處（行為不變）

### 1-1 兩層的名稱

- **題型**（作答的形式，D-181、D-233）：A1 不動，`QuestionType` 仍是 `'flip' | 'typed' | 'pick'`。A2 才加 `order`（§1-8）。紀錄不記題型（`questionType` 只在 `review/flow.ts`、`ui/Review.tsx` 用），所以紀錄不變。
- **卡型**（孩子看到的那一種卡，名稱等使用者確認，規劃稿 §7 第 3 題）：`KindId = 'group' | 'choice' | 'order' | 'typing' | 'couplet'`。沒有卡型的目標（一般問答、填空、英翻中、中翻英）是 `kind` 沒有值。

| 卡型 | 現在的欄位 | 題型 | 選項從哪裡來 |
|---|---|---|---|
| `group` 比較卡（相似字、相似詞、比較） | `Target.group` | pick | 組裡的其他目標 |
| `choice` 多音字 | `Target.choice`（PR #53） | pick | 這個目標自己的括號 |
| `order` 排序（全詩、句子兩種樣子） | `Target.order`、`Target.sentence` | pick（A2 起 order） | 打散的每一格 |
| `typing` 文法、變化 | `Target.typing` | 問答題 typed、填空題 flip | |
| `couplet` 接句 | `Target.couplet` | flip | |

方向（`direction`、`pairKey`、`pairWord`）不是卡型，留在 `Target`：它和卡型能並存的組合由現在的排除條件決定（每個認法都先看方向），`tools/compare/adapter.ts` 也直接讀它。

**題型通用，卡型的認法可以只在某一科**：題型（怎麼作答、怎麼判）每一科都一樣；卡型的認法看名稱的結尾，同一個結尾在別科可能是別的意思（例如數學的「複數」），所以認法可以只在某一科（§6 第 2 題）。

### 1-2 `Target.kind`（`src/core/deck/types.ts`）

```ts
export type Order = ({ style: 'poem' } & PoemOrder) | ({ style: 'sentence' } & SentenceOrder);
export type Kind =
  | { id: 'group'; group: PickGroup }
  | { id: 'choice'; choice: Choice }
  | { id: 'order'; order: Order }
  | { id: 'typing'; typing: Typing }
  | { id: 'couplet'; couplet: Couplet };
export type KindId = Kind['id'];
```

- `Target` 拿掉 `group`、`choice`、`order`、`sentence`、`typing`、`couplet`，加 `kind?: Kind`。一個目標最多一種卡型，由型別保證，不再靠呼叫的先後。
- `Typing.kind`（`'grammar' | 'inflection'`）改名 `Typing.style`，免得寫成 `target.kind.typing.kind`；和 `Order.style` 同一個字。
- 讀的地方一律寫 `target.kind?.id === 'group' ? target.kind.group : undefined` 這種只靠型別的寫法（`study` 從 `deck` 只能 `import type`，`eslint.config.js:55-75`，執行期的守衛函式放哪裡都會被擋）。不另外匯出存取函式；`tests/card-kinds.test.ts` 裡本地的 `kindOf` 照舊是測試自己的。
- `PoemOrder`、`SentenceOrder` 的欄位不改；`style` 只分畫面與組卡的兩種樣子，第 B 步才改誰是哪一種。

### 1-3 認法（`src/core/deck/kinds/`）

`question-types.ts` 的內容照卡型拆進一個資料夾，一種卡型一個檔；`question-types.ts` 本身留著，改成從 `kinds/` 轉出（現有 23 個文件連結指到它，其中兩份是 L2 紀錄，照 D-143 不改，Fable F7）。共用的小函式放 `kinds/shared.ts`，第 C 步再換成 §3 的一處：

| 檔 | 內容（照搬，邏輯一字不改） |
|---|---|
| `kinds/shared.ts` | `splitName`、`endingOf`、`membersOf`、`foldWidth`、`pickKey`、`withoutComments`、`visibleOf`、`countBlanks`、`blanksIn`、`unbold`、`LIST_SHAPE` |
| `kinds/group.ts` | `readPick`、`readGroup`、`groupFailure`、`pickWord` |
| `kinds/choice.ts` | `readChoice`、`choiceProblems`（呼叫 `readPick`，允許 `choice.ts` import `group.ts`）、`choiceStem`、`anchorsOf`、`plainSentence` |
| `kinds/order.ts` | `readOrder`、`readSentence`、`sentenceCells`、`plainBlock`、`visibleText` |
| `kinds/typing.ts` | `readTyping`、`pairWordOf`、`mentions`、`splitMeaning`、`lastBracket`、`wordKey` |
| `kinds/couplet.ts` | `readCouplet`、`coupletLines` |
| `question-types.ts` | 認的先後（下面）、`KIND_NEEDS`（§1-5）；對外的匯出和現在一樣，`core/deck/index.ts` 照舊轉出 |

`typedAnswer` 是打字題型的（中翻英也用），放 `src/core/deck/typed-answer.ts`，由 `question-types.ts` 轉出。

**認的先後**（`parse.ts` 第 181～183 行與第 363～375 行換成照表跑）：

1. 名稱階段（題目讀之前，因為題目要知道打不打字）：`typing`，照舊只在英文的卡組。認成 `typing` 的目標不進題目階段。
2. 題目階段，照這個順序：`group` → `choice` → `order` → `couplet`。讀成卡型就停；**有提示也停**。現在 `choice` 就是這樣接在 `group` 後面；`order`、`couplet` 現在不看前面的提示，但前面會出提示的情況（結尾是相似字、相似詞、比較、讀音，或題目是比較句、多音字句，都是問答題）和它們的條件（結尾排序、接句，一題填空）互斥。
3. 證據：Fable 第一輪的探針（§7 的 `p1.ts`）窮舉 2,751,840 份卡組（15 個字 × 13 種括號 × 42 種結尾 × 3 種分隔 × 4 種科目 × 28 種題目組合），同時有兩個卡型欄位的 0 份，有比較卡提示又認成排序、句子排序或接句的 0 份，認成 `typing` 又是別的卡型或有比較卡提示的 0 份。探針不在 repo；A1 把同樣的窮舉放進差分（§1-7），並把下面三列加進分類表：`寨（寨、塞） 排序` 配兩格填空，國語是全詩順序、英文照翻面（句子排序排除讀得出組的名稱）；`寨（寨、塞） 接句`、`長（ㄓㄤˇ、ㄔㄤˊ） 接句` 配一格填空都是接句。
4. 各認法裡排除別的卡型、看方向的條件第一步不改（規劃稿 §2-3）。

### 1-4 每一層照卡型分的地方

每一處改成照 `KindId` 的 `switch`，結尾 `const never: never = kind` 或 `Record<KindId, …>`，多一種卡型就編譯不過。比較卡的併卡四處各用不同的歷史，不硬併成一個函式（規劃稿 §2-3）。只看單一卡型的地方（例如 `kind?.id === 'group'`）照舊是一個判斷，不改成 `switch`。

| 層 | 檔 | 現在照什麼分 | A1 改成 |
|---|---|---|---|
| 認法的周邊 | `core/deck/base-form.ts:23,31` | `.typing` | 照 `kind`（只看 `typing`） |
| 組卡 | `core/study/compose.ts` | `cardOf` 看 `target.order`、`target.sentence` | `cardOf` 照 `kind` 與 `order.style` 分（`switch`） |
| 題型 | `core/study/compose.ts:10-12` | `questionType` 看 `card.group`、`card.typed` | 不改：只看卡片自己，不丟錯（Fable F12）；卡型和題型對得上由測試釘（§1-7） |
| 今天的份 | `core/study/session.ts`、`plan.ts` | `slot.target.group`、`.choice`、`.typing.pair`、`groupKey` | 照 `kind`；`session.ts` 選組卡的那一處用 `switch` |
| 練習 | `core/study/practice.ts` | `.group`、`.choice`；接句與全詩的先後看 `.couplet`、`.order` | 照 `kind`；選組卡的那一處用 `switch`；接句與全詩只看 `order.style === 'poem'`（句子排序現在不在這條，照舊） |
| 預覽 | `review/preview.ts` | `.group`、`.choice` | 照 `kind`（`switch`） |
| 朗讀與英文 | `review/english.ts` | `.typing`、`.sentence` | 照 `kind`（`isEnglish` 的句子排序是 `order.style === 'sentence'`） |
| 作答 | `review/pick.ts` | `card.group.order !== undefined` | 不改（A2 才改） |
| 畫面 | `ui/screens.tsx:75,210`、`ui/PickCard.tsx` | `target.couplet`、`target.typing`；`group.order?.starts` | 照 `kind`；`PickCard.tsx` 不拆（A2 才拆） |
| 需要版本 | `state/need.ts:17`、`core/ai/move.ts:78,122,302`、`core/ai/draft.ts:104` | `.group` 與 `pick-answer-invalid` | `needsOf(deck)`（§1-5） |
| 搬候選的重試 | `core/ai/move.ts:127` | `marks` 只看比較卡 | 照舊只看比較卡，改寫成 `kind?.id === 'group'`；不換成 `needsOf`（換了會改重試時拿掉哪些候選，Fable F8） |
| AI 草稿 | `core/ai/check.ts` | `.group`、`.choice`、`.typing`、`.sentence`、`.order` | 照 `kind`；兩處各列一次的檢查只包成同一個函式，兩處都呼叫它（很多檢查的對象是沒認成卡型的目標，放不進 `Record<KindId, …>`） |
| 加題核對 | `core/ai/existing.ts` | `.choice`；`typing` 在其餘欄位裡整個比 | 照 `kind`；`kind` 整個比（`typing` 照舊整個比到） |

### 1-5 需要版本（`KIND_NEEDS`）

`KIND_NEEDS: Record<KindId, string | null>` 放 `question-types.ts`：`group` 是 `PICK_NEEDS`，其他是 `null`（和現在一樣：多音字照 PR #53 不擋、照翻面；使用者 2026-11-25：「目前只有我自己的兩個小孩使用，我一定會更新到最新版」）。`needsOf(deck)` 照 `KIND_NEEDS` 算，`pick-answer-invalid` 照舊另外算 `PICK_NEEDS`。

改用 `needsOf` 的：`need.ts:17`、`move.ts:78`（`needsMark`，用在第 122、302 行）、`draft.ts:104`（AI 草稿寫進屬性的 `需要版本`，現在只看比較卡）。`draft.ts` 沒算 `pick-answer-invalid` 不改行為：那是錯誤，AI 草稿的檢查本來就退件（`check.ts:220` → `reply.ts` 的錯誤 → `draft.ts:196` 丟錯，Fable 第一輪核對過），存不進去；A1 加一個測試釘住。

### 1-6 對照表（給其他串）

A1 合併時在這一節附一張「舊寫法 → 新寫法」的表（`target.group` → `target.kind?.id === 'group' ? target.kind.group : undefined`、`typing.kind` → `typing.style`、`question-types.ts` 的函式搬到哪個檔），其他串照表改一次。

### 1-7 A1 的驗收

- **行為測試**：`git diff <基準> -- apps/Cards/tests/` 只准有下面四類改動，全部通過。實作完照 `tsc` 的錯誤清單列出改到的測試檔與行，寫進〈結果〉：
  1. 讀卡型欄位的測試只把存取式換成 `target.kind?.id === … ? … : undefined`，`typing.kind` 換成 `typing.style`；斷言的值不改。
  2. `tests/card-kinds.test.ts`：本地 `kindOf` 改讀 `target.kind`；加 §1-3 的三列；其他格的預期值不改。
  3. `tests/boundaries.test.ts`：`core/deck/index.ts` 的匯出清單只多 `needsOf`、`KIND_NEEDS` 與型別 `Kind`、`KindId`、`Order`。
  4. `tests/compare-versions.test.ts`：目標快照只多下面那一欄，原有欄位的值不改。
- **差分**：另寫一支不進 repo 的腳本，舊版從基準的 worktree 載入：
  - **輸入**：基準的測試跑一輪時記下每次 `parseDeck` 的文字與科目選項；加上 `p1.ts` 那樣的窮舉（名稱的字、括號、結尾、分隔、科目、題目組合），以及幾份混合的卡組：變化目標與英翻中（變化等英翻中記得才出）、同一首的接句與全詩、同一組的比較卡併卡、多音字和比較卡在同一份。
  - **`parseDeck`**：舊版的六個欄位對成新版的 `kind` 後，`targets` 與 `problems` 的 JSON 相同。
  - **AI 與需要版本**：同一批卡組文字餵 AI 草稿的檢查、搬候選、加題核對、`needsOf` 與 `need.ts` 的寫入端，新舊輸出相同。
  - **`createSession`、`createPreview`**：照 D-181 第一步的做法（[題型接點 §2 第 5 點](question-type-seam.md#2-第一步只搬不改)），同一個亂數種子餵同一串動作，2000 串、每串 60 步以上；取卡方式涵蓋今天的份、提早複習、再複習一些、小考。每一步的 `view()`（`card.target` 照同一個欄位對照）與紀錄的每一行相同。卡型範例 10 種（9 種加多音字）各有一份。
  - 差異要逐項說明，不能略過；腳本與結果寫進 L2 請求。
- **畫面**：卡型範例每一種，在作答中與結果兩個階段，新舊渲染出的 HTML 相同（用 `tests/helpers/review-ui.ts`）。
- **兩個正式 vault**：`tools/compare/adapter.ts` 的目標快照多一欄「卡型摘要」：卡型、樣子（全詩或句子）、內容的摘要（組員、選項、格子的字、句首），舊版從六個欄位推、新版讀 `kind`，先對成同一個形狀再比；今天的份每張卡多記題型與格數。在使用者的電腦對兩個 vault 的備份跑 `npm run compare-versions`，零差異。基準對 A1、A1 對 C、C 對 B 可以請使用者一次跑完，只打擾一次。
- **型別與檢查**：`npm run check` 通過；六個舊欄位拿掉了，`tsc` 擋。
- **漏接**：先列出預期會報錯的檔與處數（§1-4 表裡用 `switch` 或 `Record` 的每一處），再在暫存的工作樹加一個假的 `KindId`，`tsc` 報錯的地方和預期逐一相同（結果貼進〈結果〉，不 commit）。
- **題型對得上**：加一個測試：卡型範例的每一張卡，`questionType` 和卡型對得上（`group`、`choice`、`order` → pick，其他照 `typed`）。
- 這一步不改 `docs/syntax.md` 與卡組的寫法。

### 1-8 A2：排序成為自己的題型

- `QuestionType` 加 `order`：`FLOWS.order = createPick`、`PREVIEWS.order` 同 `pick`；`SCREENS.order` 是排序的畫面：全詩與句子兩個 body 從 `PickCard.tsx` 搬到 `OrderCard.tsx`，class 不變所以 CSS 不動，照 `order.style` 選 body；`SCREENS.pick` 只剩比較卡與多音字。`questionType` 加一個分支：`card.group?.order ? 'order'`，仍只看卡片自己、不丟錯。`review/pick.ts` 的 `card.group.order !== undefined` 改成看 `questionType(card) === 'order'`。
- 這是程式內部的名稱。題型專區的總表、家長看得到的名稱，以及「取消點選填空的勾選就不出排序」（D-187 第 8 點）都不改，等 §6 第 3 題。
- **驗收**：只准改的測試斷言：`tests/english-order.test.ts:64`、`tests/poem-order-flow.test.ts:35`（`'pick'` → `'order'`）、`tests/question-types.test.ts` 的 `SAMPLES` 多一列、`tests/card-kinds.test.ts` 的排序那 4 格與兩個卡型範例的題型（`pick` → `order`）。其他照 A1 的差分與畫面 HTML 比對，A1 對 A2 相同（`questionType` 的值除外）。

### 1-9 A 之後怎麼接配對、單選

配對、單選的寫法在[討論稿](<../Claude Codex Discussion/2026-11-25-matching-single-choice.md>)談定後另寫任務說明。接法：`KindId` 多值、`QuestionType` 視需要多值，§1-4 表裡用 `switch` 的每一處補一列，A1 的漏接檢查就是清單。

## §2 第 B 步：排序不看科目

### 2-1 現在

| 卡組 | 名稱 | 認成 |
|---|---|---|
| 英文 | `… 全詩 排序` | 全詩順序（一題、兩格以上） |
| 英文 | `… 排序`（沒寫全詩） | 句子排序（每一題兩格以上，一題一張） |
| 其他科 | `… 排序`（寫不寫全詩都一樣） | 全詩順序 |

### 2-2 改成

**認法**各科同一條：名稱寫 `全詩 排序` 的是全詩的樣子，其他的 `排序` 先照句子的樣子讀；非英文的卡組讀不成句子（詞塊不是純文字、只有一題時）退回全詩的樣子，和現在一樣，不默默變成翻面（Fable F3）。題型都是排序，選項都是打散的每一格。

- 國語預設本來就寫 `鳥鳴澗 全詩 排序`（[國小國語預設](../card-rules/elementary-chinese.md)），英文預設寫 `間接問句 排序`（[英文預設 §5 B](../card-rules/english.md)），照預設做的卡組認法不變。

**呈現**照卡組的科目定，在解析時算好、存進 `SentenceOrder`（差分與 `compare-versions` 才比得到）。這是呈現，不是認法，不違反「照形式」：

| 卡組 | 語言（`lang`、`is-english`） | 句首大寫、第一格前換行 | 朗讀 |
|---|---|---|---|
| 英文 | 英文（照現在） | 照現在（`starts`） | 照現在（排序卡不念、沒有喇叭） |
| 其他科 | 中文：`lang="zh-Hant"`、不加 `is-english` | 一律沒有（`starts` 全是 false） | 不念 |

不照格子的內容猜語言：`==x== ＋ ==y==`、`==mL==`、`==pH==` 這類會被誤判成英文、轉成大寫（Fable F2）。`isEnglish` 照卡組是英文、樣子是句子。AI 草稿的英文排序檢查（`english-order-*`）照舊只在英文的草稿。

社會的事件先後要哪種樣子，照 [Cards backlog](../backlog.md) 那一項到試作場試，這一步不定。

### 2-3 會變的卡組

只有「非英文的卡組、名稱結尾 `排序`、沒寫 `全詩`」的目標會變：

| 現在 | 之後 | 孩子看到的差別 |
|---|---|---|
| 一題、詞塊是純文字的全詩順序 | 句子排序 | 一句一行改成一整句；每句底下的記憶錨點不再出現；字鍵的排法不同；同一首的新接句先出完才出全詩的先後不再套用（`holdOrders` 只看全詩） |
| 一題、名稱讀得出比較組的全詩順序 | 照翻面（句子排序排除讀得出組的名稱，和英文一樣） | 不再點選 |
| 好幾題、每題兩格以上的填空（現在照翻面） | 句子排序 | 從翻面變點選 |
| 一題、詞塊不是純文字（粗體以外的連結、公式、程式碼、只有標點） | 照舊全詩順序（退回） | 沒有 |

用 A1 加了卡型摘要的 `compare-versions`（樣子也在摘要裡），在使用者的電腦對兩個 vault 的備份跑一次，列出每一個會變的目標（卡組、名稱、行號、從哪一列變到哪一列），給使用者看過才合併。預期是沒有（兩個 vault 的卡組都照預設做），這是推測，要跑了才知道。

### 2-4 驗收

- 現有測試只准改 `card-kinds.test.ts` 的這幾格：非英文的 `間接問句 排序` 配兩格填空從全詩順序變句子排序；非英文的 `寨（寨、塞） 排序` 從全詩順序變翻面。其他測試不改；有變的寫進〈結果〉逐項說明。
- 新的測試（小步的失敗 → 通過）：社會卡組的 `事件先後 排序`，兩題、每題兩格以上的中文填空 → 句子排序、中文畫面、`starts` 全是 false、沒有提示；國語卡組的 `步驟 排序` 配 `==**加熱**==，==[[攪拌]]==`、`公式 排序` 配 `==$a$==＋==$b$==` → 照舊全詩順序；中文長詞塊（每格 6 字以上、8 格）與含單位（`==5==` `==mL==`）的例子 → 中文畫面、不轉大寫。卡型範例加一個中文句子排序，走到今天的份，`isEnglish` 是 false。
- Windows 看一次中文句子排序的畫面（長詞塊、8 格的字鍵排法）；iPhone 併進 0.7.0 的那一次。
- `docs/syntax.md` §2-3〈全詩順序卡〉〈英文的句子排序〉改寫成各科同一條；使用者同意後寫成 D-ID（改 D-187 第 3 點的認法、D-193 第 8 點的「英文卡組」），照 essence-decision。

## §3 第 C 步：去格式一處

### 3-1 現在各處各自推「畫面上看得到的字」

| 函式 | 檔 | 用在 | 做法 |
|---|---|---|---|
| `pickKey` | `question-types.ts` | 比對點選的答案、組員、組的身分、AI 已學單字去重 | 拿掉成對的 `**`、`==`，折全半形，連續空白當一個，英文小寫 |
| `foldPick` | `core/ai/check.ts:151` | AI 草稿：答案有沒有寫在題目裡 | 同上，但不成對的 `**`、`==` 也拿掉 |
| `replaceAll('**', '')` 等 | `core/ai/check.ts:181,203,243,409` | AI 草稿的幾條檢查 | 拿掉粗體記號 |
| `unbold` | `question-types.ts` | 認名稱的結尾、拆字義（`readChoice`、`base-form.ts` 也用） | 拿掉成對的 `**`、`==` |
| `splitName` 裡的去粗體 | `question-types.ts:82` | 比較卡、多音字名稱的字 | 拿掉整個字外面成對的 `**` |
| `typedAnswer` | `question-types.ts` | 中翻英、文法與變化的答案 | 不成對的 `**`、`*`、`_`、`==` 也拿掉；有換行、連結、程式碼、公式就整格無效 |
| `visibleOf`、`countBlanks` | `question-types.ts` | 數空格（比較卡、多音字、文法） | 建在 `markdown.ts` 的 `maskInline` 上：遮程式碼、公式、嵌入、連結目的地、HTML、`%%` 註解；粗體記號留著當隔開（`＿**＿**` 算兩格） |
| `plainSentence`、`choiceStem` | `question-types.ts` | 多音字句只收純文字、判斷同一句 | 只准成對的粗體、螢光筆、`%%` 註解；`choiceStem` 加 NFKC、連續底線當一個 |
| `plainBlock`、`visibleText` | `question-types.ts` | 句子排序的詞塊、判斷句首 | 拿掉成對的 `**`、`__`、`*`、`_`（看字界），還有記號就不是詞塊；`visibleText` 連結換成顯示的字 |
| `INLINE_MARKUP` | `question-types.ts` | 接句要不要照標點切 | 有填空以外的行內 Markdown 就不切 |
| `mentions` | `question-types.ts` | 文法題第 2 步的提示 | 拿掉 `**`、`==`（不成對也拿） |
| `SIMPLE`、`LEFTOVER`、`closed` | `review/extras.ts:47-57` | 對答案後的補充怎麼排 | 判斷補充是不是簡單的文字（和 `plainSentence` 同一類） |
| `plain`、第 87 行的 `bare` | `review/english.ts` | 朗讀、填空的英文句子 | 嵌入、連結換成字，拿掉不成對的 `**`、`==`、`__`、`*`、`` ` `` |

不併的：`parse.ts:112-119` 的 `fingerprint` 是一題的身分，複習紀錄與出題歷史照它對（P1），**一個字都不能改**，它也不呼叫上面任何一個函式；`check.ts` 的 `bolds`（取出粗體的字）用途不同；`markdown.ts` 的 `maskInline` 留在原處，`visible.ts` 建在它上面。

### 3-2 改成

新增 `src/core/deck/visible.ts`，`review` 與 `core/ai` 從 `core/deck/index.ts` 拿（`study` 不用去格式，D-110 不受影響）：

- `visibleText(text, { marks })`：畫面上看得到的字。`marks: 'keep'` 把強調記號留著當隔開（數空格要，現在的 `visibleOf`）；`marks: 'drop'` 拿掉（判斷句首、朗讀要）。連結換成顯示的字、嵌入換成隔開的記號、HTML 與 `%%` 註解拿掉。
- `stripEmphasis(text, which)`：拿掉強調記號；`which` 列出哪幾種記號、要不要成對、看不看字界，五種現在的做法各是一組設定（`pickKey`／`unbold`、`typedAnswer`、`plainBlock`、`mentions`／`foldPick`、`english.ts` 的 `plain`），併過去時每一處照原本的設定，不統一成一種。
- `plainOr(text, allow)`：只剩允許的格式時回傳拿掉格式後的字，否則 `null`。多音字句、詞塊、接句的切句、補充的排法共用；每一處允許的格式照現在各自寫。
- `compareKey(text, options)`：`pickKey` 的做法；`choiceStem` 是加上 NFKC 與連續底線的選項。

### 3-3 不變量（不准改的）

下面每一條都是「對任何輸入，新的和現在的逐字相同」，驗收用新舊函式的差分：各 10 萬筆以上、用 Markdown 記號（`*`、`_`、`=`、`` ` ``、`$`、`[`、`]`、`<`、`>`、`%`、`\`、`&`、`#`、全形字、空白、換行）隨機組出的字串。

- `compareKey(x)` 和 `pickKey(x)`：比較卡的組身分、組員、答案比對、AI 已學單字去重都照它，變了紀錄與併卡對不上。
- `compareKey(x, { stem })` 和 `choiceStem(x)`。
- `typedAnswer(x)` 的 `typed` 與 `problem`。
- `sentenceCells` 的詞塊與 `starts`、`countBlanks(x)`。
- `fingerprint`：對 `tests/` 裡所有卡組的值和基準相同（A1 的差分多比這一項）。

其他（`foldPick`、`english.ts`、`extras.ts`、`INLINE_MARKUP`、`plainSentence`）可以和現在不一樣，但只能在寫壞或很少見的筆記，逐項列在〈結果〉（D-207：修法先收窄）。

### 3-4 平台事實表

| 假設 | 怎麼驗 | 環境 | 結果 |
|---|---|---|---|
| 比較句裡的 `%%…%%`、字元參照 `&#65343;` 等 49 種寫法，渲染結果和程式算的空格數一致 | 開發命令 `md-cases` | Obsidian 1.15.0、Windows（2026-11-05） | 已驗：[題型接點 §10〈Windows 實機的結果〉](question-type-seam.md#windows-實機的結果2026-11-05) |
| 第 C 步和現在不一樣的每一格 | `md-cases` 加那幾種寫法的例子，看卡片實際的渲染（不是閱讀模式） | Obsidian 桌面版、Windows | 待驗：送 L2 前跑完，跑不了的寫進 L2 請求的〈驗證方式〉 |

### 3-5 驗收

- 新增 `tests/visible.test.ts`：`visible.ts` 開頭的規格表（行是 Markdown 與 HTML 的寫法：粗體、斜體、螢光筆、刪除線、行內程式碼、公式、連結、嵌入、HTML 標籤、`%%` 註解、跳脫、字元參照、看不見的格式字元、全形符號；欄是四個函式，每一格寫「留字」「拿掉」「隔開」或「不收」）每一格至少一個例子，預期值是字面值；多音字 L2 報告（分支 `claude/project-thread-0mpbnw` 的 `apps/Cards/docs/Claude Codex Discussion/2026-11-25-polyphone-pick-l2.md`（3f626bb4），PR #53 合併後改成連結）四輪的反例、[英文打字與排序 L2](<../Claude Codex Discussion/2026-11-15-english-typed-order-review.md>) R6 的例子全部放進去，當回歸例子。
- §3-3 的差分通過；現有測試除了 `boundaries.test.ts` 的匯出清單（多 `visible.ts` 的四個函式），一字不改通過。
- 拿掉 Markdown 記號的 regex 只在 `visible.ts`：寫成測試（掃 `src/`，允許清單寫在測試裡，例如 `bolds`、`fingerprint`、`maskInline`），不靠一次 grep（code-quality 原則 1）。
- 對兩個 vault 的備份跑一次 `compare-versions`（和 A1、B 一起請使用者跑）。
- [Cards backlog〈技術債〉](../backlog.md#技術債)「讀手寫文字的去格式各處自己寫」的完成條件（一處算、規格寫明、做 L2）都滿足才劃掉。

## §4 測試怎麼寫

- A1、A2 是純重構：不為了湊失敗寫新斷言，靠既有的行為測試、分類表、差分與畫面 HTML 比對（code-quality〈測試〉）。
- B、C 是新行為：照小步的失敗 → 通過，先寫 §2-4、§3-5 的測試。
- 卡組範例都用自編的最小內容，不放孩子的卡組。兩個正式 vault 只在使用者的電腦用 `compare-versions` 讀備份，結果只寫差異的數字與目標名稱。

## §5 這次不做

- **配對、單選的程式**：使用者 2026-11-25 選這次做、進 0.7.0（D-233），寫法談定後另寫任務說明，接在 A2 的結構上（§1-9），不擠進這份。
- **文法、變化的結尾開放給每一科**：見 §6 第 2 題。
- **改 `fingerprint`**、紀錄的欄位、送給 AI 的提示（規劃稿 §2-5）。
- **另加一行屬性指定題型**、家長在畫面上換題型（規劃稿 §6）。
- **舊版外掛的擋法**：只有自家兩個孩子在用，使用者會一直更新到最新版（2026-11-25），`KIND_NEEDS` 照現在的值。

## §6 要請使用者看的

1. **排序不看科目**（§2-2）：名稱寫 `全詩 排序` 的是一行一句的樣子，其他 `排序` 是一整句的樣子，各科一樣；別科讀不成一整句時照舊一行一句。照預設做的卡組都不變；會變的卡組在 §2-3 列給使用者看。同意後寫成 D-ID。
2. **文法、變化的結尾照舊只在英文**（更正 2026-11-25 回覆裡「會把這兩列開放」的說法）：題型每一科都一樣，但認卡的結尾可以只在某一科，因為同一個字在別科可能是別的意思（數學的「複數」，[syntax §2-3](../syntax.md) 已寫明照舊）；而且打字的答案只能比對英文字母，別科寫了 `… 文法`、答案是中文的目標會變成「答案寫錯」、不出題。💡 建議維持。別科要用打字填空（答案是字母或數字）時需要一個不帶英文意思的結尾，記進 backlog，觸發點是第一個這樣的需求。
3. **排序算不算自己一個題型**：使用者 2026-11-24 說「以後每一顆要用哪一種題型，例如還有排序等等」，把排序當成一種題型；D-192 的「點選填空」是使用者選的名稱，涵蓋「把詞塊照順序點進空格」，題型專區的總表、D-187 第 8 點都照它寫。💡 建議題型專區把排序列成自己一種（作答一樣是點，但要孩子證明的是順序，不是分辨），程式 A2 先照這樣做；家長的勾選照舊是同一個。
4. **時程與停損**：順序 A → 配對與單選 → C → B；2027-01-04 之後只修錯；來不及先延後 B、再延後 C（〈排程與分支〉）。

## §7 Fable 審查（第一輪）

Fable 5.2 xhigh，2026-11-25，審第 1 版（`9e6bea23`）。結論：**改了再開工**。原文照錄（探針在 Claude 的 scratchpad，不在 repo）：

> **F1（高）第 A 步的驗收和改法矛盾：測試「只准兩類改動」做不到**。`tests/english-order.test.ts:64`、`tests/poem-order-flow.test.ts:35` 都是 `assert.equal(questionType(card), 'pick')`，排序改成自己的題型後一定要改；`tests/question-types.test.ts` 的 `SAMPLES: Record<QuestionType, string>` 少一列 `tsc` 不過；`card-kinds.test.ts` 有 4 格是 `poem-order pick`、`sentence-order pick`，§1-6 同一句既要 `cell()` 出 `order` 又說其他格不改；`tests/boundaries.test.ts` 釘住 `core/deck/index.ts` 的匯出清單；`tests/compare-versions.test.ts` 用 `deepEqual` 比整個目標快照。建議第 A 步拆兩段（先併欄位與拆檔、`QuestionType` 仍三個；再加 `order`，明列要改的斷言），`boundaries`、`compare-versions` 列成允許的改動，§2-4、§3-4 的「一字不改」補例外。
>
> **F2（高）第 B 步：句子的樣子用在中文時，現在的程式會做出規格沒寫的事**。①句首的判斷（第一格前面沒有字或是中文、全形標點）中文句子幾乎每題都符合，第一格前面強制換行、第一格轉大寫；`starts` 是解析時算好的。②「格子沒有漢字、有拉丁字母就照英文」會誤判 `==x== ＋ ==y==`、`==mL==`、`==pH==`，變成 `X`、`ML`、`PH`，整張卡 `lang="en"`。③排序卡現在不念、沒有喇叭，「朗讀」沒有對應的程式。④`isEnglish` 改成看內容，英文卡組也會變，和 §2-3「只有非英文會變」矛盾。⑤`SentenceBody` 寫死 `is-english`、`lang="en"`；字鍵超過 6 個詞一排 4 個，中文長詞塊要實看。建議補一張科目 × 內容的表，解析時定、存進 `SentenceOrder`；最省事是英文照現在、非英文 `starts` 一律 false、`lang="zh-Hant"`、不加 `is-english`；拿掉「朗讀」；加中文長詞塊與單位的例子，Windows、iPhone 要看的列進第 D 步。
>
> **F3（高）§2-3 列給使用者看的「會變的卡組」不完整**。①少一類：非英文、結尾 `排序`、一題兩格以上但格子不是純文字（連結、公式、程式碼、只有標點）的，現在是全詩順序，之後詞塊讀不成會變翻面，沒有提示（`p2.ts` 實跑：國語、社會的 `步驟 排序` 配 `==**加熱**==，==[[攪拌]]==`、`公式 排序` 配 `==$a$==＋==$b$==` 現在都是全詩順序）。②從全詩變句子還會少掉每句底下的記憶錨點、字鍵兩個一排、同一首的新接句先出完才出全詩（`holdOrders` 只看全詩）。③樣子也要進快照，才列得出卡型代號不變的改變。建議補上、加分類表的列，決定第①類退回全詩或出提示。
>
> **F4（高）時程沒有停損點，三步綁在最後一次 L2**。0.7.0 距今不到七週，沒寫凍結日與砍的順序；A、B、C 合一次 L2，和 D-181 兩步分開查不同；第 B 步段考前沒有卡組用得到（card-rules 裡非英文的排序只有 `鳥鳴澗 全詩 排序`）。建議 A 自己一個 PR、自己的 L2、附舊對新的對照表；B 第一個延後；C 留但另開 PR；寫明凍結日（例如 2027-01-04）與先砍 B 再砍 C。
>
> **F5（中）基準還不是綠的**：卡型分類表在 PR #53 的程式上 25 個測試 2 個失敗（相似詞三格、讀音四格多了 `pick-not-recognized`），是預期中的合併工作但沒寫誰做；`kindOf` 沒有 `choice`、範例 9 種。建議前提改成兩個 PR 合併後 `main` 全綠、分類表已有多音字，由後合併的那一串補；差分範例含多音字。
>
> **F6（中）把「排序」分成第四個題型，是還沒問使用者的名稱決定**。D-192 的「點選填空」涵蓋「把詞塊照順序點進空格」；D-187 第 8 點、D-181 第 4 點與題型專區總表都照它寫；§1-1 說「對到使用者的表」沒附出處。建議 §6 加一題；同意前程式內部可以先做，但不改總表、家長看得到的名稱與取消勾選就不出排序的行為。
>
> **F7（中）拆掉 `question-types.ts` 會讓 23 個文件連結斷掉**（題型專區 1、英文 L2 報告 8、多音字 L2 報告 14），後兩份照 D-143 不改。建議保留 `question-types.ts`，改成從 `kinds/` 轉出。
>
> **F8（中）§1-6 的差分漏掉第 A 步實際會改的幾條路**。①AI 與需要版本不在差分裡；②`move.ts:127` 的 `marks` 只看比較卡，換成 `needsOf` 會改行為，§1-5 只論證了 `draft.ts`；③`check.ts` 的「併成一張表」不是照搬，很多檢查的對象是沒認成卡型的目標，建議只把兩處包成同一個函式；④畫面的拆檔 `view()` 看不到，建議比新舊渲染的 HTML；⑤輸入怎麼來沒寫；⑥卡型之間的關係要有混合的卡組；⑦取卡方式要明列；⑧隨機 2000 份可改成窮舉。
>
> **F9（中）compare-versions 做得到，但快照要加的不只卡型代號**：要加卡型、樣子、內容的摘要，今天的份每張卡加題型與格數；第 C 步也要跑；可以請使用者一次跑三組。
>
> **F10（中）第 C 步：清單有漏，四個函式的切法還不能當規格**。①漏了 `question-types.ts:82`、`review/extras.ts:47-57`、`check.ts:181,203,243,409`，`maskInline` 留在原處；②`visible` 一個函式兩種需求（數空格留記號當隔開、句首與朗讀拿掉）；③`emphasisless` 沒寫拿哪幾種記號，五處都不同；④`compareKey` 要寫成不變量，`choiceStem`、`typedAnswer`、詞塊與句首、`countBlanks` 各一條，加新舊函式差分 10 萬筆以上；⑤regex 只在 `visible.ts` 要寫成測試。`fingerprint` 的保護夠。
>
> **F11（中）§6 第 2 題：結論站得住，說法要改**。「答案是中文的會變成答案寫錯」屬實（`typedAnswer` 遇到漢字回錯誤）、`syntax.md:216` 已寫明只在英文、「數學的複數照舊」。但「中翻英哪一科都會打字」說得太滿（帶的是英文整套行為）；「國中國文之後很可能出現」是推測；要說清楚題型不分科、卡型的認法可以綁科目。建議改成三句，backlog 記一筆中性的打字結尾；這題是更正先前的話，要使用者明確回覆。
>
> **F12（低）`questionType` 改看 `card.target.kind`：等價（`p3.ts` 3176 張卡 0 張不同），但新增丟錯會讓別的串直接對比較卡呼叫 `cardOf` 時整個畫面壞掉**。建議只看卡片自己、不丟錯，對得上用測試釘。
>
> **F13（低）零碎**：§1-2 的型別守衛選項做不到（`study` 只能 `import type`）；`kindOf` 和測試的本地函式同名、`target.kind.typing.kind` 難讀；§1-3 沒寫認成 `typing` 就不進題目階段（`p1.ts` 0 例，等價）；`unbold`、`blanksIn` 該放 `shared.ts`，`choice.ts` 依賴 `group.ts` 要寫明；§1-4 漏了 `base-form.ts:23,31`、`screens.tsx:210`，`existing.ts:260-264` 要確認 `kind` 仍整個比；漏接檢查先列預期；§3-3 證據位置改成題型接點 §10、第三列改用 `md-cases`；§1-3 的「實跑」沒附指令。
>
> 逐題回答與把握程度：第 A 步「行為不變」做得到（`p1.ts` 2,751,840 份 0 例互搶、`draft.ts` 論證成立、`questionType` 所有出卡路徑等價）；三步都進 0.7.0 偏多；和 `syntax.md` 沒有找到矛盾。只讀程式、沒有實際渲染的：F2 的畫面、F1 的 `boundaries` 與 `compare-versions` 會壞、F7 的 check-docs 會擋。沒跑 `npm run check`（環境的 Node 22，`package.json` 要 24）；沒看兩個正式 vault。

## §8 Claude 的回應（第一輪）

全部接受，第 2 版已照改：

| 發現 | 處理 |
|---|---|
| F1 | A 拆成 A1（併欄位、拆檔，`QuestionType` 仍三個）與 A2（加 `order`）；§1-7 列四類允許的測試改動（含 `boundaries`、`compare-versions`），§1-8 列 A2 要改的斷言；§2-4、§3-5 寫明例外 |
| F2 | 呈現照卡組的科目定、解析時存進 `SentenceOrder`（§2-2 的表）；非英文 `starts` 一律 false、中文畫面；拿掉朗讀；§2-4 加長詞塊與單位的例子、Windows 與 iPhone 要看的 |
| F3 | §2-3 改成四列的表；非英文讀不成句子時退回全詩的樣子（不默默變翻面）；快照的卡型摘要含樣子 |
| F4 | A1＋A2 一個 PR、一次 L2 先合併，C、B 各自 PR 與 L2；順序 A → 配對與單選 → C → B；凍結日與停損列成 §6 第 4 題等使用者 |
| F5 | A1 的前提改成兩個 PR 合併後 `main` 全綠、分類表已有多音字；範例 10 種 |
| F6 | 程式內部的 `order` 放 A2；總表、家長看得到的名稱、取消勾選的行為不改，列成 §6 第 3 題（附使用者 2026-11-24 的原話） |
| F7 | 保留 `question-types.ts`，改成從 `kinds/` 轉出並放認的先後 |
| F8 | §1-4 逐處列，`move.ts:127` 照舊只看比較卡；`check.ts` 只包成同一個函式；§1-7 寫明輸入、混合卡組、取卡方式、窮舉、AI 與需要版本的差分、畫面 HTML 比對 |
| F9 | 快照加卡型摘要（卡型、樣子、內容）、今天的份加題型與格數；三組請使用者一次跑 |
| F10 | §3-1 補四處；§3-2 的 `visibleText` 分 `keep`／`drop`、`stripEmphasis` 每處照原本的設定；§3-3 不變量與 10 萬筆差分；regex 的位置寫成測試 |
| F11 | §6 第 2 題改寫成三句並明寫是更正，backlog 那一筆在使用者回覆後寫 |
| F12 | `questionType` 只看卡片自己、不丟錯，對得上改用測試釘 |
| F13 | 存取寫法定成只靠型別的那一種；`Typing.kind` 改名 `style`；認成 `typing` 不進題目階段；`shared.ts` 收 `unbold`、`blanksIn`，`choice.ts` 可以 import `group.ts`；§1-4 補 `base-form.ts`、`screens.tsx:210`、`existing.ts`；漏接檢查先列預期；平台事實表改成題型接點 §10 與 `md-cases`；§1-3 的證據改成 Fable 的窮舉，A1 放進差分與分類表 |

## 結果

（實作後填：每一步的 commit、改到的測試檔與原因、差分的數字、`compare-versions` 的結果、和現在不一樣的格。延後的測試：照 D-195 寫。）
