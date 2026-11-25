# 題型模組：照形式分、每一科通用（給 Claude，L2 在本機）

狀態：待審｜下一步：合併 PR #52 後開工 A1；使用者回 §6 第 1～3 題與第 4 題的兩件（不擋 A1）｜等誰：Claude、使用者

來自：使用者 2026-11-25：「我要做的不是每一科目不同的題型，是一個通用模組，例如每一科都有填空題，配對題，單選題等等」「現在做，進0.7.0」；[題型模組規劃稿](<../Claude Codex Discussion/2026-11-25-question-type-modules.md>)（第 2 版，Fable 5.2 xhigh 第一輪審過）的 §2、§5 第 1、2 段。

遵守 repo 根目錄的 `AGENTS.md`。建議模型與推理等級：寫這份用 **Opus、xhigh**，實作用 **Opus、高**（[quality.md](../../../../docs/agents/quality.md)）。改的是卡型怎麼認（[syntax §2-3](../syntax.md)，P1：寫進筆記的格式不能讀成別的）、組卡、作答與畫面，跨 `core/deck`、`core/study`、`core/ai`、`review`、`ui`，屬於高風險範圍：每一個 PR 合併前各做 L2（Codex 額度已重置，照 quality.md 在使用者的電腦跑）。必讀 code-quality 的〈測試〉。

依據：[D-181](../../../../docs/decisions.md#d-181-題型是可以接上的模組開題型專區)（題型是可以接上的模組；第一步只搬不改的做法）、[D-233](../../../../docs/decisions.md#d-233-題型照形式分各科與題庫共用配對單選也進每天複習)（題型照形式分、各科共用；配對、單選進 0.7.0）、D-110（模組邊界，`eslint.config.js` 擋）、[D-182](../../../../docs/decisions.md#d-182-比較點選各科都能用家長出題時勾選)、[D-187](../../../../docs/decisions.md#d-187-全詩順序卡一首一張放在這首最後)、[D-192](../../../../docs/decisions.md#d-192-比較點選改名點選填空英文預設也勾)、[D-193](../../../../docs/decisions.md#d-193-英文的學習地圖詞是根句型是骨架) 第 5、6、8 點、[D-230](../../../../docs/decisions.md#d-230-國語字義卡和詞義卡錯開混淆點第一次就比多音字改點選填空) 第 4 點（多音字）、[D-195](../../../../docs/decisions.md#d-195-測試分兩類改不回來的做足其餘延後但不漏)、[D-207](../../../../docs/decisions.md#d-207-l2-的發現先分一定修可記限制交使用者選修法先收窄最後才加機制)；[Cards backlog〈技術債〉](../backlog.md#技術債)「讀手寫文字的去格式各處自己寫」。第 2 版照 Fable 第一輪（§7）改寫，每一項的處理在 §8；第 3 版照第二輪（§9）改寫，處理在 §10；第三輪核對（§11）可以開工 A1、A2。

## 和「不做」比較（D-153）

比較表在規劃稿 §3，這裡只寫結論與使用者的選擇：

- **不做**：每加一種卡在 `Target` 多一欄，16 個讀卡型欄位的檔靠人記得改，漏接要到 L2 才抓到（英文 L2 的 R2）；去格式有三套以上，L2 的發現多半是這一類（多音字 L2 四輪、英文 L2 的 R6）；排序照科目分成兩套，和使用者「照形式、不照科目」的方向不合。配對、單選（D-233）也要接在同樣散開的地方。
- **做的好處**：加一種卡型或一種作答方式時，每一層漏了哪裡編譯不過，配對、單選直接受益；「畫面上看得到的字」只算一次。孩子看不到差別（第 B 步的例外列在 §2-3）。
- **代價**：碰到排程、組卡與畫面的檔，孩子正在用（國二 2027-01-19 段考）。使用者 2026-11-25 選現在做、進 0.7.0，所以第 A 步照 D-181 第一步的驗收做足（§1-7），每一步自己一個 PR、自己的 L2。

## 排程與分支

| 步 | 內容 | 驗收 | 等什麼 |
|---|---|---|---|
| 0 | 這份說明；Fable 5.2 xhigh 審（第一輪 §7、第二輪 §9） | | |
| A1 | §1-1～§1-6：卡型欄位併成一欄、拆檔、每一層照卡型分；`QuestionType` 仍是三個；行為不變 | §1-7 | PR #53（多音字）與 PR #52（卡型分類表）都已合併，`main` 上 `npm run check` 全過、分類表已有多音字的列與範例。A1 照搬、不改卡組的寫法與解析結果，不用格式查核 |
| A2 | §1-8：排序成為自己的題型（內部的 `QuestionType`） | §1-8 | A1；§6 第 3 題只影響文件與家長看得到的名稱，程式不等 |
| — | 配對、單選（D-233）：另寫任務說明，接在 A2 的結構上 | 照那份 | A2；[配對與單選討論稿](<../Claude Codex Discussion/2026-11-25-matching-single-choice.md>)談定 |
| C | §3：去格式一處 | §3-5 | A2；自己一個 PR。解析結果除了 §3-3 列的句首例外都不變（第 1 條不變量保證），不用格式查核 |
| B | §2：好幾題的排序各科都能點 | §2-4 | A2；使用者同意 §6 第 1 題；§2 先過格式查核（§2-5）；自己一個 PR |

- **A1、A2 一個 PR、一次 L2，先合併**；其他在動 `core/ai`、`session.ts`、`practice.ts` 的串照 §1-6 的對照表改一次。C、B 各自開 PR、各自 L2（D-181 也是兩步分開查）。L2 每次到第四輪為止（D-171）。Windows 看一次畫面在每個 PR 合併前；iPhone 併進 0.7.0 的那一次。
- **時程與停損**（先後使用者 2026-11-25 已同意；A 的日子與配對單選的限制 💡 等使用者，§6 第 4 題）：0.7.0 要在 2027-01-11 前裝好（[提早試用計畫〈0.7.0 放什麼〉](../plans/early-trial.md#070-放什麼)），同一版還有考前抽測、AI 製卡存不了草稿的修正、多音字。順序是 A → 配對與單選 → C → B；2027-01-04 之後只修錯；來不及時先延後 B（段考前沒有卡組用得到，所有預設裡非英文的排序只有 `鳥鳴澗 全詩 排序`），再延後 C，延到 0.7.x。
  - **A 的日子**：2026-12-07 前送第一輪 L2（L2 最多四輪），2026-12-14（星期一）前合併，配對與單選才有三週。過了還沒合併（L2 卡住、或被其他串的合併拖住），配對與單選二選一：改接現在的結構（`Target` 再多一欄，A 之後再搬），或延到 0.7.x；交使用者選（§6 第 4 題）。
  - **配對、單選排在 C 前面**：認法只用 `kinds/shared.ts` 現有的函式（`membersOf`、`pickKey` 等），不新寫去格式；C 再一起收（Fable G12）。
- **兩個正式 vault 的 `compare-versions`**：分三次，每次在那個 PR 合併前跑，預期寫在各步的驗收（§1-7、§2-3、§3-5）。在使用者的電腦用 Remote Control 跑，使用者只要按同意。
- 分支：每一步從當時的 `main` 開新分支；一個 commit 只做一件事（code-quality〈測試〉）。
- 同時在動 Cards 的串：考前抽測、手機啟用第二步、API 製卡、比較測試工具（也改 `tools/compare/adapter.ts`，§1-7 的快照欄位先和它對）、AI 提示詞架構。A1 開工前問各串預計合併的日子。

## §1 第 A 步：一種卡型在每一層一處（行為不變）

### 1-1 兩層的名稱

- **題型**（作答的形式，D-181、D-233）：A1 不動，`QuestionType` 仍是 `'flip' | 'typed' | 'pick'`。A2 才加 `order`（§1-8）。紀錄不記題型（`questionType` 只在 `review/flow.ts`、`ui/Review.tsx` 用），所以紀錄不變。
- **卡型**（孩子看到的那一種卡，名稱等使用者確認，規劃稿 §7 第 3 題）：`KindId = 'group' | 'polyphone' | 'order' | 'typing' | 'couplet'`（多音字的代號用 `polyphone`，不用 `choice`，免得和接著要加的單選撞名；型別名稱 `Choice` 照 PR #53 不改，Fable G14）。沒有卡型的目標（一般問答、填空、英翻中、中翻英）是 `kind` 沒有值。

| 卡型 | 現在的欄位 | 題型 | 選項從哪裡來 |
|---|---|---|---|
| `group` 比較卡（相似字、相似詞、比較） | `Target.group` | pick | 組裡的其他目標 |
| `polyphone` 多音字 | `Target.choice`（PR #53） | pick | 這個目標自己的括號 |
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
  | { id: 'polyphone'; polyphone: Choice }
  | { id: 'order'; order: Order }
  | { id: 'typing'; typing: Typing }
  | { id: 'couplet'; couplet: Couplet };
export type KindId = Kind['id'];
```

- `Target` 拿掉 `group`、`choice`、`order`、`sentence`、`typing`、`couplet`，加 `kind?: Kind`。一個目標最多一種卡型，由型別保證，不再靠呼叫的先後。
- `Typing.kind`（`'grammar' | 'inflection'`）改名 `Typing.style`，免得寫成 `target.kind.typing.kind`；和 `Order.style` 同一個字。
- 讀的地方一律寫 `target.kind?.id === 'group' ? target.kind.group : undefined` 這種只靠型別的寫法。`study` 從 `deck` 只能 `import type`（`eslint.config.js:55-75`），守衛函式放在 `deck` 會被擋；`study` 自己定義的不會被擋，一律寫在行內是選擇（少一層、各處一樣），不是限制。Fable 第二輪用 TS 5.9 strict 編過九種寫法，零錯誤。不另外匯出存取函式；`tests/card-kinds.test.ts` 裡本地的 `kindOf` 照舊是測試自己的。
- `PoemOrder`、`SentenceOrder` 的欄位不改；`style` 只分畫面與組卡的兩種樣子，第 B 步才改誰是哪一種。

### 1-3 認法（`src/core/deck/kinds/`）

`question-types.ts` 的內容照卡型拆進一個資料夾，一種卡型一個檔（檔名照 `KindId`）；`question-types.ts` 本身留著，改成從 `kinds/` 轉出（現有 23 個文件連結指到它，其中兩份是 L2 紀錄，照 D-143 不改，Fable F7）。共用的小函式放 `kinds/shared.ts`，第 C 步再換成 §3 的一處：

| 檔 | 內容（照搬，邏輯一字不改） |
|---|---|
| `kinds/shared.ts` | `splitName`、`endingOf`、`membersOf`、`foldWidth`、`pickKey`、`withoutComments`、`visibleOf`、`countBlanks`、`blanksIn`、`unbold`、`LIST_SHAPE` |
| `kinds/group.ts` | `readPick`、`readGroup`、`groupFailure`、`pickWord` |
| `kinds/polyphone.ts` | `readChoice`、`choiceProblems`、`choiceStem`、`anchorsOf`、`plainSentence` |
| `kinds/order.ts` | `readOrder`、`readSentence`、`sentenceCells`、`plainBlock`、`visibleText` |
| `kinds/typing.ts` | `readTyping`、`pairWordOf`、`mentions`、`splitMeaning`、`lastBracket`、`wordKey` |
| `kinds/couplet.ts` | `readCouplet`、`coupletLines` |
| `question-types.ts` | 認的先後（下面）、`KIND_NEEDS`（§1-5）；對外的匯出和現在一樣，`core/deck/index.ts` 照舊轉出 |

`typedAnswer` 是打字題型的（中翻英也用），放 `src/core/deck/typed-answer.ts`，由 `question-types.ts` 轉出。

- **`kinds/` 之間的 import**：`polyphone.ts`（`readPick`）、`typing.ts`（第 302 行）、`order.ts`（第 392 行）都呼叫 `group.ts` 的 `readPick`／`readGroup`，允許這三個 import `group.ts`；其他 `kinds/` 之間不互相 import（Fable G14）。
- **「邏輯一字不改」的例外**：`readOrder`、`readSentence`、`readCouplet` 裡排除 `target.group`、`target.order` 的條件，在「讀成就停」的流程裡不會成立（前面已經讀成就不會走到），A1 刪掉，差分證明行為不變（Fable G14）。
- **lookbehind 的基準**：`eslint-suppressions.json` 照檔名記 `obsidianmd/regex-lookbehind` 的基準，`question-types.ts` 的那 1 筆是 `plainBlock` 的 `(?<![\p{L}\p{N}])_`。A1 照 [Obsidian 官方檢查的任務說明](obsidian-review-check.md)的做法把那一筆移到 `kinds/order.ts`，總數 13 不變，不改寫 regex、不加 `eslint-disable`；原檔少一筆時 ESLint 報不報錯，A1 跑一次寫進〈結果〉（Fable G3）。

**認的先後**（`parse.ts` 第 181～183 行與第 363～375 行換成照表跑）：

1. 名稱階段（題目讀之前，因為題目要知道打不打字）：`typing`，照舊只在英文的卡組。認成 `typing` 的目標不進題目階段。
2. 題目階段，照這個順序：`group` → `polyphone` → `order` → `couplet`。讀成卡型就停；**有提示也停**。現在多音字就是這樣接在 `group` 後面；`order`、`couplet` 現在不看前面的提示，但前面會出提示的情況（結尾是相似字、相似詞、比較、讀音，或題目是比較句、多音字句，都是問答題）和它們的條件（結尾排序、接句，一題填空）互斥。
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
| 加題核對 | `core/ai/existing.ts:259-264` | 只比種類與身分：比較卡比 `group.key`；全詩、句子排序、接句只比有沒有；多音字比 `word` 與 `optionKeys`；`typing` 在其餘欄位裡整個比（註解：「題型的內容跟著題目變，只比種類與組的身分」） | 照現在的比法，寫成照 `KindId` 的 `switch`：`kind.id`（排序再比 `style`）、`group.key`、多音字的 `word` 與 `optionKeys`、`typing` 整個比。**不是** `kind` 整個比：那樣多音字加一句、加記憶錨點，全詩加記憶錨點，接句加記憶錨點，句子排序加一題都會退件（Fable G1，`g_existing.ts`）。配對、單選接上時編譯會逼著寫「這個卡型比什麼」 |

### 1-5 需要版本（`KIND_NEEDS`）

`KIND_NEEDS: Record<KindId, string | null>` 放 `question-types.ts`：`group` 是 `PICK_NEEDS`，其他是 `null`（和現在一樣：多音字照 PR #53 不擋、照翻面；使用者 2026-11-25：「目前只有我自己的兩個小孩使用，我一定會更新到最新版」）。`needsOf(deck)` 照 `KIND_NEEDS` 算，`pick-answer-invalid` 照舊另外算 `PICK_NEEDS`。

改用 `needsOf` 的：`need.ts:17`、`move.ts:78`（`needsMark`，用在第 122、302 行）、`draft.ts:104`（AI 草稿寫進屬性的 `需要版本`，現在只看比較卡）。`draft.ts` 沒算 `pick-answer-invalid` 不改行為：那是錯誤，AI 草稿的檢查本來就退件（`check.ts:220` → `reply.ts` 的錯誤 → `draft.ts:196` 丟錯，Fable 第一輪核對過），存不進去；A1 加一個測試釘住。

### 1-6 對照表（給其他串）

A1 合併時在這一節附一張「舊寫法 → 新寫法」的表（`target.group` → `target.kind?.id === 'group' ? target.kind.group : undefined`、`typing.kind` → `typing.style`、`question-types.ts` 的函式搬到哪個檔），其他串照表改一次。

### 1-7 A1 的驗收

- **行為測試**：`git diff <基準> -- apps/Cards/tests/` 只准有下面五類改動，全部通過。改到的測試檔與行寫進〈結果〉：先照 `tsc` 的錯誤清單，再跑一次全部測試找 `tsc` 看不到的（下面第 1 類的鍵名）：
  1. 讀卡型欄位的測試只把存取式換成 `target.kind?.id === … ? … : undefined`，`typing.kind` 換成 `typing.style`；斷言的值不改。唯一的例外是預期值裡的鍵名：`tests/english-typed-deck.test.ts:13-19、42-46` 的 12 個 `{ kind: 'inflection', … }` 改成 `{ style: … }`，值不改（`tsc` 不報，要跑測試才看到，Fable G2 a）。
  2. `tests/card-kinds.test.ts`：本地 `kindOf` 改讀 `target.kind`；加 §1-3 的三列；其他格的預期值不改。
  3. `tests/boundaries.test.ts`：`core/deck/index.ts` 的匯出清單最多多這五個：`needsOf`、`KIND_NEEDS` 與型別 `Kind`、`KindId`、`Order`，沒有外部使用者的不匯出（knip 會擋，Fable G14）；「deck、study 不 import catalog」那條改成遞迴掃，掃得到 `kinds/`。
  4. `tests/compare-versions.test.ts`：見下面〈兩個正式 vault〉的轉接器改動，照那裡的 commit 改。
  5. 這份說明要求新增的測試：§1-5 的 `draft.ts` 釘住、下面的「題型對得上」（Fable G2 b）。
- **差分**：另寫一支不進 repo 的腳本，舊版從基準的 worktree 載入：
  - **輸入**：基準的測試跑一輪時記下每次 `parseDeck` 的文字與科目選項；加上 `p1.ts` 那樣的窮舉（名稱的字、括號、結尾、分隔、科目、題目組合），以及幾份混合的卡組：變化目標與英翻中（變化等英翻中記得才出）、同一首的接句與全詩、同一組的比較卡併卡、多音字和比較卡在同一份。搬候選與加題核對吃的是引言框與項目，不是卡組文字：從基準的測試一起錄下來（Fable G14）。
  - **`parseDeck`**：舊版的六個欄位對成新版的 `kind` 後，`targets` 與 `problems` 的 JSON 相同。
  - **AI 與需要版本**：同一批輸入餵 AI 草稿的檢查、搬候選、加題核對、`learnedWords`（`base-form.ts:23`，送給 AI 的已有單字）、`needsOf` 與 `need.ts` 的寫入端，新舊輸出相同。加題核對另外放七種加題：比較卡加一句、變化加一題、多音字加一句、多音字加記憶錨點、全詩加記憶錨點、接句加記憶錨點、句子排序加一題，新舊都寫得進去（Fable G1）。
  - **`createSession`、`createPreview`**：照 D-181 第一步的做法（[題型接點 §2 第 5 點](question-type-seam.md#2-第一步只搬不改)），同一個亂數種子餵同一串動作，2000 串、每串 60 步以上；取卡方式涵蓋今天的份、提早複習、再複習一些、小考。每一步的 `view()`（`card.target` 照同一個欄位對照）與紀錄的每一行相同。卡型範例 10 種（9 種加多音字）各有一份。
  - 差異要逐項說明，不能略過；腳本與結果寫進 L2 請求。
- **畫面**：卡型範例每一種，在作答中與結果兩個階段，新舊的元素樹相同（用 `tests/helpers/review-ui.ts`）。比的是每個元素的標籤、class、文字與非函式的 props，函式不比；`review-ui.ts` 的 Markdown 是替身，渲染後的處理（`postProcess`）不在這個比對裡，由 Windows 看一次畫面補（Fable G14）。
- **兩個正式 vault**：
  - **轉接器先改，自己一個 commit**（在 A1 的第一個 commit，照小步的失敗 → 通過寫測試；這是工具的新行為，不是純重構，Fable G2 c）：`tools/compare/adapter.ts` 的目標快照多一欄「卡型摘要」（卡型、樣子（全詩或句子）、內容的摘要：組員、選項、格子的字、句首），舊版從六個欄位推、新版讀 `kind`，先對成同一個形狀再比；今天的份每張卡多記題型與格數。舊版沒有 `questionType` 與格數（`v0.2.0`、`v0.3.0` 的卡沒有 `blanks`）時這兩欄都輸出 `null`，兩邊有一邊是 `null` 就不比那一欄，報告列出「這一欄沒比」。`compare-versions.test.ts` 跟著改的：`TodaySnap` 的字面值（第 124-125 行、`fakeSnapshot`）、假版本 `fakeGood` 的卡、逐位置換錯值的表（`WRONG`、`CAN_BE_NULL`、`NULLABLE`）、第 293 行跨版本的比較。比較測試工具那一串也改這個檔，開工前先對（〈排程與分支〉）。
  - **A 合併前跑一次**（Fable G4）：基準對 A1 的 commit 零差異；A1 對 A2 只有排序卡的題型不同（`pick` → `order`），其他零差異。在使用者的電腦用 Remote Control 跑。
- **型別與檢查**：`npm run check` 通過；六個舊欄位拿掉了，`tsc` 擋。
- **漏接**：先列出預期會報錯的檔與處數（§1-4 表裡用 `switch` 或 `Record` 的每一處），再在暫存的工作樹加一個假的 `KindId`，`tsc` 報錯的地方和預期逐一相同（結果貼進〈結果〉，不 commit）。
- **題型對得上**：加一個測試：卡型範例的每一張卡，`questionType` 和卡型對得上（`group`、`polyphone`、`order` → pick，其他照 `typed`）。
- 這一步不改 `docs/syntax.md` 與卡組的寫法。

### 1-8 A2：排序成為自己的題型

- `QuestionType` 加 `order`：`FLOWS.order = createPick`、`PREVIEWS.order` 同 `pick`；`SCREENS.order` 是排序的畫面：全詩與句子兩個 body 從 `PickCard.tsx` 搬到 `OrderCard.tsx`，class 不變所以 CSS 不動，照 `order.style` 選 body；`SCREENS.pick` 只剩比較卡與多音字。`questionType` 加一個分支：`card.group?.order ? 'order'`，仍只看卡片自己、不丟錯。`review/pick.ts` 的 `card.group.order !== undefined` 改成看 `questionType(card) === 'order'`。
- 這是程式內部的名稱。題型專區的總表、家長看得到的名稱，以及「取消點選填空的勾選就不出排序」（D-187 第 8 點）都不改，等 §6 第 3 題。
- **驗收**：只准改的測試斷言：`tests/english-order.test.ts:64`、`tests/poem-order-flow.test.ts:35`（`'pick'` → `'order'`）、`tests/question-types.test.ts` 的 `SAMPLES` 多一列、`tests/card-kinds.test.ts` 的排序那 5 格（A1 加了 `寨（寨、塞） 排序` 那一列，Fable G5）與兩個卡型範例的題型（`pick` → `order`）、A1 新增的「題型對得上」裡排序的那一項（改成卡型 `order` 對題型 `order`）。其他照 A1 的差分與元素樹比對，A1 對 A2 相同（`questionType` 的值除外）。

### 1-9 A 之後怎麼接配對、單選

配對、單選的寫法在[討論稿](<../Claude Codex Discussion/2026-11-25-matching-single-choice.md>)談定後另寫任務說明。單選的代號與名稱避開 `choice`、`Choice`、`readChoice`、`choiceStem`（多音字照 PR #53 留著這些名稱）。接法：`KindId` 多值、`QuestionType` 視需要多值，§1-4 表裡用 `switch` 的每一處補一列，A1 的漏接檢查就是清單。

## §2 第 B 步：好幾題的排序各科都能點

### 2-1 現在

| 卡組 | 名稱 | 認成 |
|---|---|---|
| 英文 | `… 全詩 排序` | 全詩順序（一題、兩格以上） |
| 英文 | `… 排序`（沒寫全詩） | 句子排序（每一題兩格以上，一題一張） |
| 其他科 | `… 排序`（寫不寫全詩都一樣） | 全詩順序 |

### 2-2 改成

**認法**（Fable G6 之後收窄）：

1. 名稱寫 `全詩 排序` 的，各科都是全詩的樣子（和現在一樣）。
2. 其他的 `排序`，**好幾題、每一題都讀得成句子**的，各科都是句子的樣子（非英文的卡組現在照翻面，這是唯一會變的）。
3. 只有一題時照現在：英文是句子的樣子，別科是全詩的樣子（舊卡組裡沒寫 `全詩` 的詩多半是一題）。
4. 讀不成句子時照現在：英文照翻面；別科照全詩的樣子讀，全詩也讀不成才照翻面。讀不成句子的原因逐條照 `readSentence`：有一題只有一格或是問答、詞塊不是純文字（粗體以外的連結、公式、程式碼、只有標點）、名稱讀得出比較組（`question-types.ts:392`）。

所以第 B 步之後，認法仍有一處看科目（只有一題、或讀不成句子時），照實寫，不說成「各科同一條」。題型都是排序，選項都是打散的每一格。

**實作就是一行**：`parse.ts:371` 的 `english && !order ? readSentence(target)` 拿掉 `english &&`。一題的目標，`readSentence` 讀得成時 `readOrder` 一定也讀得成，所以別科一題的照舊是全詩（Fable 第三輪在基準的複本上改這一行跑完整套測試，沒有新的失敗）。

- 國語預設本來就寫 `鳥鳴澗 全詩 排序`（[國小國語預設](../card-rules/elementary-chinese.md)），英文預設寫 `間接問句 排序`（[英文預設 §5 B](../card-rules/english.md)），照預設做的卡組認法不變。

**呈現**照卡組的科目定，在解析時算好、存進 `SentenceOrder`（差分與 `compare-versions` 才比得到）。這是呈現，不是認法，不違反「照形式」：

| 卡組 | 語言（`lang`、`is-english`） | 句首大寫、第一格前換行 | 朗讀 |
|---|---|---|---|
| 英文 | 英文（照現在） | 照現在（`starts`） | 照現在（排序卡不念、沒有喇叭） |
| 其他科 | 中文：`lang="zh-Hant"`、不加 `is-english` | 一律沒有（`starts` 全是 false） | 不念 |

不照格子的內容猜語言：`==x== ＋ ==y==`、`==mL==`、`==pH==` 這類會被誤判成英文、轉成大寫（Fable F2）。渲染層也一樣：`rendered.ts:119` 的 `insertMarkedSlots` 在 `breakFirst` 是 false 時，還會看第一格旁邊有沒有拉丁字母（`englishBeside`）決定換不換行；`postProcess` 改成收到卡組的語言，中文的句子排序不看 `englishBeside`（Fable G7：`先量取 ＿ mL 的＿`、`實驗一：pH ＿的是＿`、`化學式：＿O 是＿` 現在都會在第一格前換行）。`isEnglish` 照卡組是英文、樣子是句子。AI 草稿的英文排序檢查（`english-order-*`）照舊只在英文的草稿。

社會的事件先後要哪種樣子，照 [Cards backlog](../backlog.md) 那一項到試作場試，這一步不定。

### 2-3 會變的卡組

只有「非英文的卡組、名稱結尾 `排序`、沒寫 `全詩`、好幾題、每題都讀得成句子」的目標會變：

| 現在 | 之後 | 孩子看到的差別 |
|---|---|---|
| 好幾題、每題兩格以上的填空，照翻面 | 句子排序 | 從翻面變點選 |
| 一題的全詩順序（詞塊是不是純文字、名稱讀不讀得出組都一樣） | 照舊全詩順序 | 沒有 |
| 好幾題、有一題讀不成句子 | 照舊（翻面） | 沒有 |

第 2 版的「一題、純文字從全詩變句子」「讀得出組的名稱從全詩變翻面」兩列不做了：讓一張能點選的卡默默換樣子或變翻面，沒有好處（Fable G6）。

B 合併前，用 A1 加了卡型摘要的 `compare-versions`（樣子也在摘要裡），在使用者的電腦對兩個 vault 的備份跑一次（Remote Control），列出每一個會變的目標（卡組、名稱、行號、從哪一列變到哪一列），給使用者看過才合併。預期是沒有（兩個 vault 的卡組都照預設做），這是推測，要跑了才知道。

### 2-4 驗收

- 現有測試一字不改（`card-kinds.test.ts` 的題目形狀都只有一題，不變）。特別留意這三處照舊通過：`poem-order-deck.test.ts:22-25`「名稱沒有『全詩』也認」、`english-order.test.ts:44` 沒寫科目的 `間接問句 排序` 不是句子排序、`english-order.test.ts:45` 國文卡組「別科照全詩順序卡，和以前一樣」（都是一題，Fable G6 ③）。
- 新的測試（小步的失敗 → 通過）：社會卡組的 `事件先後 排序`，兩題、每題兩格以上的中文填空 → 句子排序、中文畫面、`starts` 全是 false、沒有提示；中文長詞塊（每格 6 字以上、8 格）與含單位（`==5==` `==mL==`）的例子 → 中文畫面、不轉大寫。卡型範例加一個中文句子排序，走到今天的份，`isEnglish` 是 false。
- 釘住現狀的測試（現在就會過，分開寫）：同樣兩題、其中一題只有一格 → 照翻面；國語卡組一題的 `步驟 排序` 配 `==**加熱**==，==[[攪拌]]==`、`公式 排序` 配 `==$a$==＋==$b$==` → 照舊全詩順序。
- 渲染測試：仿 `english-order-render.test.ts`，中文的句子排序放 G7 的三個例子，第一格前不換行。
- Windows 看一次中文句子排序的畫面（長詞塊、8 格的字鍵排法）；iPhone 併進 0.7.0 的那一次，合併時照 D-195 在技術債表寫「補測：」列。
- `docs/syntax.md` 第 264 行「不符合時（好幾題…）照原題型出」改成好幾題的各科都讀成句子排序；使用者同意後寫成 D-ID（改 D-193 第 8 點的「英文卡組」；D-187 第 3 點不用動，別科一題的照舊），照 essence-decision。

### 2-5 開工前的格式查核與平台事實表

- **格式查核**：B 改的是 `排序` 的認法（syntax §2-3），照 [quality.md〈開工前的格式查核〉](../../../../docs/agents/quality.md)另寫 `question-type-modules-format-review.md`，照 quality.md 用 `node tools/codex.ts format` 請 Codex 查，§2 等查核通過才開工（Fable G8）。使用者指定 Fable 5.2 xhigh 的是規劃的審查（「規劃好也是先給 fable 5.2 xhigh 看過再動手」），格式查核照 quality.md。
- **平台事實表**：

| 假設 | 怎麼驗 | 環境 | 結果 |
|---|---|---|---|
| 中文句子排序 8 格、375px 寬的換行與字鍵排法放得下 | 開發命令 `md-cases` 加這幾種，看卡片實際的渲染 | Obsidian 桌面版、Windows，視窗 375px | 待驗：送 L2 前跑完 |
| G7 的三個例子在 Obsidian 裡第一格前不換行 | 同上 | 同上 | 待驗 |

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

- `visibleText(text, { marks })`：畫面上看得到的字。`marks: 'keep'` 把強調記號留著當隔開（數空格要，現在的 `visibleOf`）；`marks: 'drop'` 拿掉（判斷句首、朗讀要）。連結換成顯示的字、嵌入換成隔開的記號、HTML 與 `%%` 註解拿掉。判斷句首現在用的是 `question-types.ts:379` 自己的 `visibleText`（註解、HTML、公式都不處理，嵌入換成檔名），改用這一個會有三種寫法不一樣，放進 §3-3 的「可以不一樣」逐項列出（Fable G9）。
- `stripEmphasis(text, which)`：拿掉強調記號；`which` 列出哪幾種記號、要不要成對、看不看字界，五種現在的做法各是一組設定（`pickKey`／`unbold`、`typedAnswer`、`plainBlock`、`mentions`／`foldPick`、`english.ts` 的 `plain`），併過去時每一處照原本的設定，不統一成一種。
- `plainOr(text, allow)`：只剩允許的格式時回傳拿掉格式後的字，否則 `null`。多音字句、詞塊、接句的切句、補充的排法共用；每一處允許的格式照現在各自寫。
- `compareKey(text, options)`：`pickKey` 的做法；`choiceStem` 是加上 NFKC 與連續底線的選項。
- **lookbehind 的基準**：`plainBlock` 那一筆（A1 已在 `kinds/order.ts`）搬到 `visible.ts`；`review/extras.ts:54` 的那一筆若併進 `plainOr` 也一樣搬。總數不變，不改寫 regex（Fable G3）。

### 3-3 不變量（不准改的）

下面每一條都是「對任何輸入，新的和現在的逐字相同」，驗收用新舊函式的差分。

**輸入怎麼產生**（Fable G10：照第 2 版逐字元隨機組，10 萬筆裡要保護的分支多半只走到 0～100 筆）：

- 片段層級的產生器，每筆由幾個片段接成：成對與不成對的強調（`**`、`__`、`*`、`_`、`==`、`~~`）、`%%…%%` 註解、`[[a|b]]` 與 `[a](b)` 連結、`![[x]]` 嵌入、行內程式碼、`$…$` 公式、HTML 標籤與 `<br>`、字元參照（`&#65343;`、`&amp;`）、跳脫、底線串（`＿`、`__`）、括號（含多音字句的 `字（＿＿）`）、漢字、大小寫英文、英數字、全形字、各種空白（含 `\r`、零寬字元）、`|` 與 `｜`、`.?!` 與引號、組合字元與康熙部首。
- 加上現有測試的所有字串，與兩份 L2 反例（多音字四輪、英文 R6）的變形。
- 詞塊與句首從 `parseDeck` 進去（直接餵字串測不到）。
- 〈結果〉列出每個分支走到幾筆（例如 `pickKey` 拿掉成對的記號、`choiceStem` 拿掉註解、有連結或嵌入、認成句子排序、認成多音字句、`typedAnswer` 好幾個答案、因漢字無效、字元參照、HTML、NFKC 改到全形以外的字）；每個分支至少 200 筆，不到的不算驗過，要補產生器。
- 放兩三個故意寫錯的版本（例如 `compareKey` 連不成對的 `**` 也拿、`countBlanks` 不認字元參照），確認差分抓得到。

**不變量**：

1. **解析結果**（總括，Fable G11）：A1 的差分輸入加上上面的產生器，`parseDeck` 的 `targets` 與 `problems` 新舊相同，只有句首（`SentenceOrder` 的 `starts`）照下面〈可以不一樣〉的類別除外；重用 A1 的腳本。這一條保住 `unbold`（認結尾、`pairWordOf` 決定變化等哪個英翻中）、`splitName` 的去粗體（`group.word` 與 `key`）、`plainSentence`（一題算不算多音字句）、`INLINE_MARKUP`（接句的 `couplet.lines`，`plainOr` 在接句照現在的字元表）。
2. `compareKey(x)` 和 `pickKey(x)`：比較卡的組身分、組員、答案比對、AI 已學單字去重都照它，變了紀錄與併卡對不上。
3. `compareKey(x, { stem })` 和 `choiceStem(x)`。
4. `typedAnswer(x)` 的 `typed` 與 `problem`；`mentions(x)`（文法卡第 2 步有沒有提示，`base-form.ts:33`）；`learnedWord` 裡的 `unbold`。這三個不在 `parseDeck` 裡，逐函式比。
5. `sentenceCells` 的詞塊、`countBlanks(x)`。
6. `fingerprint`：對 `tests/` 裡所有卡組的值和基準相同（A1 的差分多比這一項）。

**可以不一樣**（只能在寫壞或很少見的筆記，D-207：修法先收窄）：

- 不影響解析結果的 `foldPick`、`english.ts`、`extras.ts`。
- 句首（`starts`），照第一格前面是哪一類寫，不寫成幾個字串：`%%` 註解、HTML 標籤與 `<!-- -->`、字元參照（`&nbsp;`、`&#12290;`）、跳脫（`\*`）、刪除線、看不見的格式字元、行內程式碼、嵌入。Fable 量過的例子：現在是 false 的有 `我不知道。%%註%% ==where==…`、`我不知道。<br> ==where==…`、開頭就是 `%%註%%`、`<b>他說：</b>`、`~~他說：~~`、零寬字元後面；現在是 true 的有 `![[圖一]] ==where==…`、`` `中文` ``。
- 差分腳本把每一筆不同歸類（只有 `starts` 不同，而且第一格前面是哪一類），歸不進去的就是錯；〈結果〉列每一類的方向（false → true 或反過來）、筆數、一個 `md-cases` 例子。句首會改英文句子排序第一格的大寫與換行，所以每一類都用 `md-cases` 看過（§3-4）。

### 3-4 平台事實表

| 假設 | 怎麼驗 | 環境 | 結果 |
|---|---|---|---|
| 比較句裡的 `%%…%%`、字元參照 `&#65343;` 等 49 種寫法，渲染結果和程式算的空格數一致 | 開發命令 `md-cases` | Obsidian 1.15.0、Windows（2026-11-05） | 已驗：[題型接點 §10〈Windows 實機的結果〉](question-type-seam.md#windows-實機的結果2026-11-05) |
| 第 C 步和現在不一樣的每一格（含句首的三種） | `md-cases` 加那幾種寫法的例子，看卡片實際的渲染（不是閱讀模式） | Obsidian 桌面版、Windows | 待驗：送 L2 前跑完，跑不了的寫進 L2 請求的〈驗證方式〉 |

### 3-5 驗收

- 新增 `tests/visible.test.ts`：`visible.ts` 開頭的規格表（行是 Markdown 與 HTML 的寫法：粗體、斜體、螢光筆、刪除線、行內程式碼、公式、連結、嵌入、HTML 標籤、`%%` 註解、跳脫、字元參照、看不見的格式字元、全形符號；欄是四個函式，每一格寫「留字」「拿掉」「隔開」或「不收」）每一格至少一個例子，預期值是字面值；多音字 L2 報告（分支 `claude/project-thread-0mpbnw` 的 `apps/Cards/docs/Claude Codex Discussion/2026-11-25-polyphone-pick-l2.md`（3f626bb4），PR #53 合併後改成連結）四輪的反例、[英文打字與排序 L2](<../Claude Codex Discussion/2026-11-15-english-typed-order-review.md>) R6 的例子全部放進去，當回歸例子。
- §3-3 的差分通過；現有測試除了 `boundaries.test.ts` 的匯出清單，一字不改通過。匯出清單的增減逐項寫進〈結果〉：多 `visible.ts` 的四個函式，`compareKey` 取代 `pickKey`、`choiceStem` 時拿掉的也列出（Fable G14）。
- 拿掉 Markdown 記號的 regex 只在 `visible.ts`：寫成測試（掃 `src/`，允許清單寫在測試裡，例如 `bolds`、`fingerprint`、`maskInline`），不靠一次 grep（code-quality 原則 1）。
- C 合併前對兩個 vault 的備份跑一次 `compare-versions`（Remote Control）：零差異，或只有 §3-3「可以不一樣」列出的例外。
- [Cards backlog〈技術債〉](../backlog.md#技術債)「讀手寫文字的去格式各處自己寫」的完成條件（一處算、規格寫明、做 L2）都滿足才劃掉。

## §4 測試怎麼寫

- A1、A2 是純重構：不為了湊失敗寫新斷言，靠既有的行為測試、分類表、差分與元素樹比對（code-quality〈測試〉）。例外是 §1-7 第 4、5 類：`compare-versions` 的轉接器是工具的新行為，`draft.ts` 釘住與「題型對得上」是這份要求的新測試，照小步的失敗 → 通過寫。
- B、C 是新行為：照小步的失敗 → 通過，先寫 §2-4、§3-5 的測試。
- 卡組範例都用自編的最小內容，不放孩子的卡組。兩個正式 vault 只在使用者的電腦用 `compare-versions` 讀備份，結果只寫差異的數字與目標名稱。

## §5 這次不做

- **配對、單選的程式**：使用者 2026-11-25 選這次做、進 0.7.0（D-233），寫法談定後另寫任務說明，接在 A2 的結構上（§1-9），不擠進這份。
- **文法、變化的結尾開放給每一科**：見 §6 第 2 題。
- **改 `fingerprint`**、紀錄的欄位、送給 AI 的提示（規劃稿 §2-5）。
- **另加一行屬性指定題型**、家長在畫面上換題型（規劃稿 §6）。
- **舊版外掛的擋法**：只有自家兩個孩子在用，使用者會一直更新到最新版（2026-11-25），`KIND_NEEDS` 照現在的值。

## §6 要請使用者看的

1. **好幾題的排序各科都能點**（§2-2，第 3 版收窄）：只改一件事：非英文的卡組，名稱結尾 `排序`、好幾題、每題兩格以上的，從翻面改成一題一張的點選排序。一題的照現在：社會的 `事件先後 排序` 寫成一題的，現在就已經是點選的排序卡（一行一句的樣子）；讀不成一整句的也照現在（第 2 版還會讓幾種現在能點的卡換樣子或變翻面，拿掉了）。事實：段考前沒有卡組用得到（預設裡非英文的排序只有 `鳥鳴澗 全詩 排序`），照預設做的卡組都不變，會變的卡組合併前跑給使用者看。時程照使用者已同意的先後（排最後，來不及先延）。選項：照這條規則做、不做（好幾題的照翻面）。💡 建議照這條規則做：這是「照形式、不照科目」在排序上的落點，代價已收窄到只有翻面變點選。同意後寫成 D-ID。
2. **文法、變化的結尾照舊只在英文**（更正 2026-11-25 回覆裡「會把這兩列開放」的說法）：題型每一科都一樣，但認卡的結尾可以只在某一科，因為同一個字在別科可能是別的意思（數學的「複數」，[syntax §2-3](../syntax.md) 已寫明照舊）；而且打字的答案只能比對英文字母，別科寫了 `… 文法`、答案是中文的目標會變成「答案寫錯」、不出題。💡 建議維持。別科要用打字填空（答案是字母或數字）時需要一個不帶英文意思的結尾，記進 backlog，觸發點是第一個這樣的需求。
3. **排序算不算自己一個題型**：使用者 2026-11-24 說「以後每一顆要用哪一種題型，例如還有排序等等」。Claude 把這句讀成「排序是一種題型」，這是解讀，不是使用者說定的；D-192 的「點選填空」是使用者選的名稱，涵蓋「把詞塊照順序點進空格」，題型專區的總表、D-187 第 8 點都照它寫。兩種回答的程式都一樣照 A2 做（內部多一個 `order`）。差別只在文件與名稱：答「算」，題型專區的總表與術語表把排序列成自己一種（作答一樣是點，但要孩子證明的是順序，不是分辨）；答「不算」，總表照舊，排序寫在點選填空底下。家長的勾選兩種都照舊是同一個。💡 建議「算」。
4. **時程與停損**：使用者 2026-11-25 同意「照建議的先後」：順序 A → 配對與單選 → C → B；2027-01-04 之後只修錯；來不及先延後 B、再延後 C。還沒問的兩件（Fable G12，💡）：A 在 2026-12-14 前合併，過了的話配對與單選改接現在的結構或延到 0.7.x（💡 建議延到 0.7.x：國二英文段考前用不到這兩種，接舊結構等於之後再搬一次）；配對、單選的認法只用現有的去格式函式、C 再收。

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

## §9 Fable 審查（第二輪）

Fable 5.2 xhigh，2026-11-25，審第 2 版（`498d936b`）。結論：**改了再開工**，沒有要重想的地方。原文照錄（探針在審查者的暫存資料夾，不在 repo；完整路徑拿掉）：

> **總結論：改了再開工。** 沒有要重想的地方；A1、A2 改完 G1～G5 的文字就能開，C、B 各自開工前要補 G6～G11。第一輪 13 項裡 8 項改好，5 項（F1、F2、F3、F10、F13）還留一處，其中 F13 那一處是我第一輪寫得有歧義造成的。
>
> 以下程式事實都對 PR #53 的樹（3f626bb4）核對；新探針在審查者的暫存資料夾，沒有進 repo。沒有改 repo 的任何檔，沒有 commit。
>
> **第一輪各項的核對**
>
> - **F1：沒改乾淨。** A 拆成 A1／A2、四類與 A2 的斷言都列了。但四類仍不夠（G2），A2 的清單少兩處（G5），§2-4「其他測試不改」不成立（G6 ③）。
> - **F2：大致改好，漏一處。** 呈現照科目、解析時存、非英文 `starts` 全 false、拿掉朗讀、加長詞塊與單位的例子都有。渲染層還有一處照內容猜英文（G7）。
> - **F3：已改好，但帶進一個矛盾。** 四列的表、退回全詩、樣子進快照都有。§2-2 的退回規則和第二列互相矛盾（G6）。
> - **F4：已改好。** PR 與 L2 分開、凍結日、先延 B 再延 C 都有。D-233 加進來之後，A 自己沒有停損（G12）。
> - **F5：已改好。** 前提寫成兩個 PR 合併後 `main` 全綠、分類表已有多音字、範例 10 種。
> - **F6：已改好。** 內部的 `order` 放 A2，總表、名稱、取消勾選的行為不動，列成 §6 第 3 題。問法見 G13。
> - **F7：已改好。** `question-types.ts` 留著轉出。
> - **F8：已改好。** 八點都有對應。AI 那一條差分的輸入還不夠明確（G14）。
> - **F9：已改好，兩處沒對齊。** 「今天的份多記題型與格數」沒進允許的測試改動（G2 c）；「一次跑完」和合併順序對不上（G4）。
> - **F10：①③⑤ 改好，②④ 沒改好。** `visibleText` 分 keep／drop 之後和不變量互相矛盾（G9）；10 萬筆的產生方式抓不到要抓的（G10）；不變量清單漏了會影響認法的函式（G11）。
> - **F11：已改好。** 三句、明寫是更正、backlog 等使用者回覆後寫。
> - **F12：已改好。** `questionType` 不動、不丟錯，用測試釘。
> - **F13：一處改錯，一處不完整，其餘改好。** `existing.ts` 寫成「`kind` 整個比」會改行為（G1）；`kinds/` 的 import 只寫了 `choice.ts`→`group.ts`（G14）。
>
> **特別看的幾點**
>
> - **§1-2 只靠型別的存取寫法：可行。** `narrow.ts` 用 TS 5.9 strict 編過九種寫法，零錯誤：三元、兩邊比 key、巢狀 `order.style`、`switch`＋`never`、`Record<KindId,…>`、`find` 裡窄化、解構其餘欄位、閉包。
> - **`Typing.kind` 改名 `style`：不碰紀錄、快照、AI 的文字。**
>   - 程式五處：`types.ts:69`、`question-types.ts:311,315`、`base-form.ts:23,33`。
>   - 紀錄（`ReviewLine`）沒有目標的欄位；考試切面存的是卡組原文；`tools/compare/adapter.ts` 只讀 `direction`。
>   - `move.ts`、`existing.ts`、`deepen-write.ts` 的 `content()` 是同一版兩次解析互比，不受影響。
>   - 測試那一側有一個 `tsc` 看不到的洞，見 G2 a。
> - **A1／A2 的界線：成立。** A1 在畫面只換三處存取式（`screens.tsx:75,210`、`PickCard.tsx:108`），`questionType` 與 `PickCard.tsx` 的結構都不動，新舊的元素樹應該相同。比的是替身的元素樹，不是 HTML（G14）。
> - **`tsc` 試跑。** 在複本上只改 `types.ts`（拿掉六欄、加 `kind`、改 `style`）：`src` 16 個檔 105 處、`tests` 13 個檔 81 處、`tools` 0 處（`tsc-kind.txt`）。和「16 個檔」的說法一致。
>
> **新發現**
>
> **G1（高，A1，§1-4「加題核對」列）「`kind` 整個比」會改行為**
>
> - **問題**：現在的 `verify`（`existing.ts:259-264`）只比種類與身分，不比卡型的內容。
>   - 比較卡只比 `group.key`。
>   - 全詩、句子排序、接句只比有沒有。
>   - 多音字只比 `word` 與 `optionKeys`。
>   - 只有 `typing` 留在其餘欄位裡整個比。
>   - 程式註解寫明「題型的內容跟著題目變，只比種類與組的身分」。
> - **證據**（`g_existing.ts`，七種加題現在都寫得進去）：照「整個比」，下面五種會退件；比較卡加一句、變化加一題不變。
>   - 多音字加一句（`answers` 變）
>   - 多音字加記憶錨點（`anchors` 變）
>   - 全詩加記憶錨點（`notes` 變）
>   - 接句加記憶錨點
>   - 句子排序加一題（`prompts` 變）
> - **現有測試只擋得到多音字**（`ai-add-existing.test.ts:151`）。全詩、句子排序、接句沒有加題的測試，照字面做會默默變成「留項」。
> - **來源**：我第一輪 F13 寫「要確認 `kind` 仍整個比」，原意是 `typing` 併進 `kind` 後不要漏比。寫得有歧義。
> - **建議**：
>   - 改成照現在的比法：比 `kind.id`（排序再加 `style`）、`group.key`、多音字的 `word` 與 `optionKeys`、`typing` 整個。
>   - 寫成照 `KindId` 的 `switch`，配對、單選接上時編譯會逼著寫「這個卡型比什麼」。
>   - §1-7 的差分加上面七種加題。
>
> **G2（中，A1，§1-7）四類允許的測試改動還是不夠**
>
> - **a. `english-typed-deck.test.ts:13-19、42-46`**：12 個 `deepEqual` 的預期值是 `{ kind: 'inflection', … }`，鍵名要跟著改成 `style`。
>   - 這是改斷言的值，和第 1 類「斷言的值不改」衝突。
>   - `tsc` 不會報：試跑只報到第 9、23、24、31～33、37、38 行。所以「照 `tsc` 的錯誤清單列出改到的測試」會漏，要跑測試才看到。
> - **b. 同一節自己要求新增的測試不在四類裡**：§1-5 的 draft 釘住、§1-7 的「題型對得上」。
> - **c. 第 4 類只准「目標快照多一欄」，但同一節還要今天的份多記題型與格數。** `compare-versions.test.ts` 因此要改的有：
>   - `TodaySnap` 的字面值（第 124-125 行、`fakeSnapshot`）。
>   - 假版本 `fakeGood`：它的卡只有 `prompt`，沒有 `blanks`、`group`。
>   - 逐位置換錯值的表（`WRONG`、`CAN_BE_NULL`、`NULLABLE`）。
>   - 第 293 行跨版本 `deepEqual` 整個今天的份：`v0.2.0`、`v0.3.0` 沒有 `questionType`（`git show` 查過，0 處），轉接器要先定義舊版沒有時輸出什麼。
> - **性質**：這是工具的新行為，不是純重構，和 §4「A1 不寫新斷言」也衝突。
> - **建議**：
>   - 轉接器的改動拆成自己的 commit（或先行的小 PR），照小步的失敗 → 通過寫測試。它是 A1 驗收的前提，比較測試工具那一串也在改同一個檔。
>   - 規格寫明舊版缺欄位時的輸出。
>   - 四類補上 a、b、c。
>
> **G3（中，A1 與 C）`eslint-suppressions.json` 沒寫到**
>
> - **問題**：這個檔照檔名記 lookbehind 的基準，`question-types.ts` 有 1 筆，就是 `plainBlock` 的 `(?<![\p{L}\p{N}])_`。
> - **證據**：把 `plainBlock` 照搬到 `kinds/order.ts` 跑 ESLint，報 `obsidianmd/regex-lookbehind`。
> - **後果**：規格沒寫時，實作者只能改寫 regex（違反「邏輯不改」），或加 `eslint-disable`（被擋）。`obsidian-review-check.md` 的規矩是「同一個檔多一個就擋」「不改寫」。
> - **C 還會再搬一次**：搬到 `visible.ts`；`review/extras.ts:54` 的那 1 筆若併進 `plainOr` 也一樣。
> - **建議**：A1、C 各寫一句「那一筆跟著搬到新檔，總數 13 不變，不改寫 regex」。
>
> **G4（中，驗收流程，§1-7、§2-3、§3-5）`compare-versions` 的「一次跑完」和合併順序對不上**
>
> - **問題**：
>   - A 的 vault 零差異是 A 合併前的驗收；C、B 排在配對與單選之後才有 commit，三組不可能一次跑。
>   - 「基準對 A1、A1 對 C、C 對 B」沒有 A2。A1、A2 同一個 PR，基準對合併後的結果一定不是零差異：每張排序卡的題型從 pick 變 order。
> - **建議**：寫成三次，每次寫明預期。
>   - A 合併前：基準對 A1 的 commit 零差異；A1 對 A2 只有排序卡的題型不同。
>   - C 合併前：零差異，或只有列出的例外。
>   - B 合併前：列出會變的目標。
>
> **G5（低，A2，§1-8）只准改的斷言少兩處**
>
> - A1 加了 `寨（寨、塞） 排序` 那一列之後，分類表裡 `poem-order pick`／`sentence-order pick` 是 5 格，不是 4 格。
> - A1 新增的「題型對得上」測試（`order` → pick）在 A2 也要改。
>
> **G6（中，B，§2-2／§2-3／§2-4／§6 第 1 題）退回全詩的規則自相矛盾，允許改的測試也不對**
>
> - **① 規則和例子矛盾。**
>   - §2-2：非英文讀不成句子就退回全詩，「不默默變成翻面」。
>   - §2-3 第二列、§2-4：非英文的 `寨（寨、塞） 排序` 從全詩順序變翻面。它讀不成句子的原因是 `readSentence` 排除讀得出組的名稱（`question-types.ts:392`），照 §2-2 應該退回全詩。
>   - §6 第 1 題告訴使用者「別科讀不成一整句時照舊一行一句」，和第二列也不一致。
> - **② 括號「（詞塊不是純文字、只有一題時）」讀得出兩種意思。** 讀成「或」，第一列就不成立。
> - **③ §2-4「其他測試不改」不成立。**
>   - `poem-order-deck.test.ts:22-25`：測試名稱就是「名稱沒有『全詩』也認」。
>   - `english-order.test.ts:44`：沒寫科目的 `間接問句 排序` 斷言不是句子排序。
>   - `english-order.test.ts:45`：國文卡組斷言「別科照全詩順序卡，和以前一樣」。
>   - 這三處的意思都被 B 改掉。A1 若把存取式寫成兩種樣子共用，有的還會空過。
> - **建議**：
>   - 第二列也退回全詩。讓一張能點選的卡默默變翻面沒有好處，改了之後 B 的變化只剩「變成句子排序」一種。
>   - §2-2 把退回的條件逐條寫出：只有一題、是兩格以上的填空、句子讀不成（列出原因）。
>   - §2-4 列出上面三處測試。
> - **另外**：退回只在非英文，所以「認法各科同一條」說得太滿。照實寫成「英文讀不成照翻面、別科退回全詩」。
>
> **G7（中，B，§2-2 的表）渲染層還有一處照內容猜英文**
>
> - **問題**：「其他科第一格前換行一律沒有」做不到。`rendered.ts:119` 的 `insertMarkedSlots` 在 `breakFirst` 是 false 時，還會看 `englishBeside`（第一格旁邊有沒有拉丁字母）決定換不換行，和 `english` 選項無關。
> - **證據**（`g_break.ts`，`english: false`、`breakFirst: false`，`/` 是換行）：
>   - `先量取 ＿ mL 的＿` → `先量取/[0] mL 的[1]…`
>   - `實驗一：pH ＿的是＿` → `實驗一：/pH [0]…`
>   - `化學式：＿O 是＿` → `化學式：/[0]O 是…`
>   - 純中文不換行。
> - **為什麼測不到**：§2-4 的測試用 `review-ui.ts`，Markdown 是替身；規格舉的 `==5==` `==mL==` 兩個都是格，也剛好碰不到。
> - **建議**：
>   - §2-2 加「`postProcess` 收到語言；中文的句子排序不看 `englishBeside`」。
>   - §2-4 仿 `english-order-render.test.ts` 加一個渲染測試，放上面三個例子。
>   - B 補自己的平台事實表：中文句子排序 8 格、375px 寬的換行與字鍵，用 `md-cases` 驗。現在的表只有 C 的。
>
> **G8（中，B，〈排程與分支〉）少了開工前的格式查核**
>
> - **問題**：quality.md〈開工前的格式查核〉規定，任務說明會改出題語法的解析時，要另寫 `<任務>-format-review.md` 請 Codex 查，開工條件寫明哪幾節要等。B 改的正是 `排序` 的認法（syntax §2-3）。
> - **前例**：多音字、英文打字與排序、題型接點都有 `-format-review.md`。這份沒有，B 的「等什麼」也沒寫。
> - **建議**：
>   - B 那一列加「§2 等格式查核」。
>   - A1（照搬）與 C（解析結果不變）各寫一句為什麼不用。
>
> **G9（中，C，§3-2 對 §3-3）`visibleText` 的單一定義和「句首逐字相同」不能同時成立**
>
> - **問題**：§3-2 把 `marks: 'drop'` 定義成一種算法（連結換成顯示的字、嵌入換成隔開、HTML 與註解拿掉），用在句首與朗讀。但現在判斷句首用的是 `question-types.ts:379` 自己的 `visibleText`：註解、HTML、公式都不處理，程式碼只拿掉反引號，嵌入換成檔名。
> - **證據**（`g_head.ts`，現在的 `starts[0]`）：
>   - `我不知道。%%註%% ==where==…` 是 false；照 §3-2 註解拿掉，會變 true。
>   - `我不知道。<br> ==where==…` 是 false；會變 true。
>   - `![[圖一]] ==where==…` 是 true；嵌入換成隔開，會變 false。
> - **建議二選一，寫明**：
>   - 句首也照每處原本的設定，那 `visibleText` 就不是一種算法，要像 `stripEmphasis` 列出各處的設定。
>   - 或把句首移到「可以不一樣、逐項列出」那一組，上面三種寫進去，用 `md-cases` 驗。新的算法比較對，我傾向這個。
>
> **G10（高，C，§3-3）10 萬筆差分照字面做，幾乎走不到要保護的分支**
>
> - **證據**（`g_fuzz.ts`，照規格列的字元隨機組 10 萬筆，長度 1～24，量舊函式走到哪裡）：
>
> | 分支 | 筆數 |
> |---|---|
> | `pickKey` 拿掉成對的 `**` 或 `==` | 36 |
> | `choiceStem` 拿掉 `%%` 註解 | 23 |
> | 有連結或嵌入 | 18 |
> | 認成句子排序 | 94 |
> | `typedAnswer` 好幾個答案 | 0 |
> | `typedAnswer` 因漢字無效 | 0 |
> | 字數不同的提示 | 0 |
> | 字元參照 `&#65343;` | 0 |
> | HTML 標籤 | 0 |
> | NFKC 改到全形以外的字 | 0 |
>
> - **原因**：
>   - 字元表缺很多：英數字、漢字、`|` 與 `｜`、`(` `)` `!`、`~` `^`、`.?!` 與引號、`;`、組合字元與康熙部首、`\r`、零寬字元。
>   - 逐字元隨機也組不出 `%%…%%`、`[[a|b]]`、`&#65343;`、`https://` 這種結構。
> - **後果**：F10 說的那些差異（不成對的記號、字界、註解、字元參照）新舊就算不同，這個差分也多半報零差異。
> - **建議**：
>   - 改成片段層級的產生器：成對與不成對的強調、註解、連結、嵌入、程式碼、公式、HTML、字元參照、跳脫、底線串、漢字、大小寫英文、全形、各種空白、`|`。
>   - 再加現有測試與兩份 L2 反例的變形。
>   - 〈結果〉要列每個分支走到幾筆，為 0 的不算驗過。
>   - 放兩三個故意寫錯的版本，確認差分抓得到。例如 `compareKey` 連不成對的 `**` 也拿、`countBlanks` 不認字元參照。
>   - 詞塊與句首要從 `parseDeck` 進去，直接餵字串測不到。
>
> **G11（中，C，§3-3）不變量清單漏了會影響認法與排程的函式**
>
> - **不在兩張清單裡的**：
>   - `unbold`：`readChoice`、`readTyping` 認結尾；`pairWordOf` 決定變化目標等哪個英翻中。
>   - `splitName` 的去粗體：決定 `group.word` 與 `key`。
> - **放錯清單的**：`plainSentence` 被列在「可以不一樣」，但它決定一題算不算多音字句，也就是目標是點選還是翻面。多音字 L2 四輪主要在修它。
> - **建議**：C 加一條總括的不變量：「對 A1 的差分輸入加上 G10 的產生器，`parseDeck` 的 `targets` 與 `problems` 新舊相同」，重用 A1 的腳本。「可以不一樣」只留不影響解析結果的：`foldPick`、`english.ts`、`extras.ts`、`INLINE_MARKUP`。
>
> **G12（中，〈排程與分支〉、§6 第 4 題）D-233 之後的關鍵路徑沒有停損**
>
> - **問題**：
>   - 停損只管 B、C。配對與單選是使用者選的功能，接在 A2 上，但 A 沒有日期。A 的 L2 卡到第四輪或被其他串的合併拖住時，配對與單選怎麼辦沒寫。
>   - 「A → 配對與單選 → C」沒寫理由。配對、單選會新增讀手寫文字的認法（選項寫在題目上）。〈和不做比較〉自己說 L2 的發現多半是去格式這一類，排在 C 前面等於用舊的散裝函式再寫一批，C 的清單又要補。
> - **建議**：
>   - 給 A 一個日期，並寫明過了怎麼辦：配對、單選改接現有結構，或延到 0.7.x，交使用者選。
>   - C 的順序二選一：C 提前；或寫明配對、單選的認法只能用 `kinds/shared.ts` 現有的函式，不新增去格式的寫法，C 再一起收。
>   - 兩件事都列進 §6 第 4 題。
>
> **G13（低，§6 與狀態行）問法**
>
> - **第 1 題**只有提案，沒有「延後」或「不做」的選項，也沒寫〈排程〉自己寫的事實「段考前沒有卡組用得到」。第二列的結果說得不一致（G6）。
> - **第 3 題**的「把排序當成一種題型」是 Claude 對那句話的解讀，寫成了事實。也沒寫兩種回答各自的後果：程式都照 A2 做；差別只在題型專區與術語表要不要跟。
> - **狀態行**寫「§6 三題」，實際四題。
> - **該問而沒問的**：G6 的第二列、G12 的兩件事。
>
> **G14（低，零碎）**
>
> - **§1-3 的 import**：`readTyping`（第 302 行）、`readSentence`（第 392 行）也呼叫 `readGroup`。要嘛 `readGroup` 放 `shared.ts`，要嘛寫明 `typing.ts`、`order.ts` 也可以 import `group.ts`。
> - **§1-3「邏輯一字不改」的例外**：`readOrder`、`readSentence`、`readCouplet` 裡的 `target.group`、`target.order` 判斷，在「讀成就停」的新流程裡不會成立，寫明刪掉或留著。
> - **§1-2「放哪裡都會被擋」不精確**：被擋的是從 `deck` import 執行期的函式，`study` 自己定義的不會被擋。一律寫在行內是選擇，照實寫。
> - **`KindId` 的 `choice`**（多音字）和馬上要加的單選容易撞名。§1-6 的對照表發給其他串之前定名。
> - **§1-7 第 3 類的匯出清單**：`KIND_NEEDS`、`Order` 沒有外部使用者時 knip 會擋。寫成「最多這五個，沒用到的不匯出」。
> - **`boundaries.test.ts`「deck、study 不 import catalog」** 只掃一層，掃不到 `kinds/`。ESLint 仍然擋；要不要改成遞迴寫明。
> - **「畫面 HTML 相同」**：`review-ui.ts` 給的是元素樹，Markdown 是替身。寫明比哪些 props（函式不比），以及渲染後的處理不在這個比對裡。
> - **AI 差分的輸入**：搬候選、加題核對吃的是引言框與項目，不是卡組文字，要一起從基準的測試錄。`learnedWords`（`base-form.ts:23`，送給 AI 的已有單字）沒列。
> - **§3-5 的匯出清單**：`compareKey` 取代 `pickKey`、`choiceStem` 時，不只是「多四個」。
> - **〈結果〉的「延後的測試：」** 要自己一行，開工時寫「（實作後填）」。iPhone 併到 0.7.0 那一次是合併後才看，照 D-195 要有技術債表的「補測：」列。
>
> **把握程度與缺少的資訊**
>
> - **把握高（有探針或逐行對過）**：G1、G2 a 與 c、G3、G7、G9、G10、§1-2 的可行性、`Typing.kind` 改名的範圍、`v0.2.0`／`v0.3.0` 沒有 `questionType`。
> - **把握中（讀程式與測試推的，沒有實作來驗）**：
>   - G6 ③：哪幾個斷言會壞，要看 A1 把存取式改成什麼樣子。
>   - G11：我沒有逐一試每個函式改掉後的影響。
>   - G4、G12 是流程判斷。
> - **沒做的**：
>   - 沒跑 `npm run check` 與整套測試：環境是 Node 22，`package.json` 要 24。`tsc`、單檔 ESLint 與探針都跑得起來。
>   - 沒有在 Obsidian 實際渲染；G7 用的是測試同一套 happy-dom。
>   - 沒看兩個正式 vault。
>   - 沒有 PR #52 與 #53 合併後的樹，分類表含多音字的版本沒對到。
>   - ESLint 對「原檔少了一筆 suppression」會不會報錯沒跑；只驗了新檔會報。
>   - 規劃稿與配對單選討論稿只讀了被引用的段落。
> - **G10 的數字**是我照規格文字選的字元表：全形字取 `＿ＡＡａ１，（）` 這幾個，長度 1～24。換一組會有出入，數量級不會變。

## §10 Claude 的回應（第二輪）

全部接受，第 3 版已照改。要使用者決定的併進 §6：

| 發現 | 處理 |
|---|---|
| G1 | §1-4「加題核對」照現在的比法寫成 `switch`（不是 `kind` 整個比）；§1-7 的差分加七種加題 |
| G2 | §1-7 改成五類：第 1 類加 `english-typed-deck.test.ts` 的鍵名、要跑測試才找得到；第 5 類是這份要求的新測試；轉接器先改、自己一個 commit、照失敗 → 通過寫，舊版沒有 `questionType` 時輸出 `null`、那一欄不比並列出；§4 寫明例外 |
| G3 | §1-3、§3-2：lookbehind 那一筆跟著搬，總數不變、不改寫 regex；A1 跑一次原檔少一筆時 ESLint 的結果 |
| G4 | `compare-versions` 分三次，每個 PR 合併前跑一次，各寫預期（A：基準對 A1 零差異、A1 對 A2 只有排序卡的題型；C：零差異或列出的例外；B：列出會變的目標）；用 Remote Control 跑 |
| G5 | §1-8：排序 5 格、「題型對得上」的排序那一項 |
| G6 | §2-2 收窄：只有「好幾題、每題讀得成句子」的非英文排序從翻面變句子排序；一題的照現在（英文句子、別科全詩），讀不成句子的照現在；照實寫成仍有一處看科目。§2-3 剩一列會變；§2-4 現有測試一字不改，列出三處照舊通過 |
| G7 | §2-2：`postProcess` 收到卡組的語言，中文句子排序不看 `englishBeside`；§2-4 加渲染測試；§2-5 加 B 的平台事實表 |
| G8 | §2-5：B 另寫格式查核，§2 等查核；A1、C 在〈排程與分支〉寫明為什麼不用 |
| G9 | 採第二個做法：句首改用新的 `visibleText`，三種不一樣的寫法列進「可以不一樣」，用 `md-cases` 看 |
| G10 | §3-3 改成片段層級的產生器、加測試字串與 L2 反例的變形、詞塊與句首從 `parseDeck` 進去、〈結果〉列每個分支的筆數（0 筆不算）、放故意寫錯的版本 |
| G11 | §3-3 第 1 條加總括的解析結果不變量（保住 `unbold`、`splitName`、`plainSentence`）；「可以不一樣」只留不影響解析的四處與句首三種 |
| G12 | 〈排程與分支〉加 A 的日子 2026-12-14 與過了怎麼辦、配對單選只用現有的去格式函式；§6 第 4 題（先後已由使用者同意，這兩件另問） |
| G13 | §6 第 1 題寫事實與選項、第 3 題寫成 Claude 的解讀與兩種回答的差別；狀態行改成四題 |
| G14 | 多音字的代號改 `polyphone`；`kinds/` 之間的 import 寫明；刪掉讀成就停後不會成立的條件；§1-2 照實寫；匯出最多五個；`boundaries` 遞迴掃；比元素樹的哪些欄位；AI 差分的輸入與 `learnedWords`；§3-5 匯出的增減；〈結果〉的「延後的測試：」自己一行 |

## §11 Fable 核對（第三輪）

Fable 5.2 xhigh，2026-11-25，只核對第 3 版（`fca61ca7`）有沒有把 G1～G14 改對。結論：**A1、A2 可以開工**；C、B 開工前要改的已在同一個 commit 改好（見表）。原文照錄（探針與基準的複本在審查者的暫存資料夾，不在 repo）：

> **第 3 版核對：A1、A2 可以開工；G9、G11 在 §3-3 留下一處矛盾，C 開工前要改；B 開工前改兩處舊字句。** 只核對 G1～G14，沒有重新全面審查；沒有改 repo、沒有 commit。
>
> **逐項**
>
> - G1：改好。
> - G2：改好。補一處：今天的份多記的「格數」在 `v0.2.0`、`v0.3.0` 也沒有（那兩版的卡沒有 `blanks`），`null` 的規則要連格數一起寫。
> - G3：改好。
> - G4：改好。
> - G5：改好。
> - G6：改好。收窄後的認法我實跑過，現有測試確實不用改（見〈G6 的核對〉）；留三處舊字句（新問題 2）。
> - G7：改好。
> - G8：改好。查核者寫成 Fable，和 quality.md 寫的 Codex 不同，要補依據（新問題 3）。
> - G9：沒改好。選第二個做法可以，但 §3-3 第 1 條和句首的例外互相矛盾，「三種」也不是全部（新問題 1）。
> - G10：改好。補兩處：片段少了括號（多音字句的 `字（＿＿）`），分支清單加「認成多音字句」；「0 筆不算驗過」的門檻太低，建議每個分支至少幾百筆。
> - G11：沒改乾淨。`INLINE_MARKUP` 放錯邊，這是我第二輪的建議寫錯；`mentions` 沒歸到任何一邊（新問題 1）。
> - G12：改好。2026-12-14 是星期一，到 2027-01-04 剛好三週。只有合併日，沒有送 L2 的日子；L2 最多四輪，建議加一個（例如 12-07 前送第一輪），不然到當天才知道來不及。
> - G13：改好。第 1 題的例子要改（新問題 2）。
> - G14：改好。`polyphone` 全文一致。型別 `Choice` 與 `readChoice`、`choiceStem` 不改可以接受（A1 是照搬，PR #53 還沒合併）；§1-9 加一句「單選取名避開這幾個」。配對與單選討論稿第 316、629、678 行還寫「多音字的 `choice`」，對照表發出去時一起改。
>
> **G6 的核對**
>
> - **收窄後的認法等於一行改動**：`parse.ts:371` 的 `english && !order ? readSentence(target)` 拿掉 `english &&`。一題的目標，`readSentence` 讀得成時 `readOrder` 一定也讀得成，所以別科一題的照舊是全詩。建議把這句寫進 §2-2，四條規則就有一個可以對的實作。
> - **現有測試不用改**：我在基準（3f626bb4）的複本上做了這一行改動，跑完整套測試。
>   - 改之前 2,938 個測試有 26 個失敗，都是複本沒有 git 標籤、建置、效能計時這類環境問題。
>   - 改之後 25 個失敗，是同一批少一個計時的，沒有新的失敗。
>   - `card-kinds.test.ts`（PR #52）不在那棵樹上，我用讀的：四種題目形狀都只有一題，不受影響。
> - **§2-4 列的例子現在的讀法**（`g3_b.ts`）：
>   - 國語一題的 `步驟 排序`、`公式 排序` 是全詩順序。
>   - 社會兩題的 `事件先後 排序` 是翻面、沒有提示；其中一題只有一格也是翻面。
>   - 都和 §2-3 的表一致。
>
> **這次改動新帶進的問題**
>
> **1.（中，C，§3-3）第 1 條不變量和「可以不一樣」互相矛盾。**
>
> - **句首在 `targets` 裡**。第 1 條寫 `parseDeck` 的 `targets` 新舊相同，但句首（`SentenceOrder` 的 `starts`）又列在可以不一樣。第 1 條要寫「`starts` 除外」。
> - **`INLINE_MARKUP` 不能放在可以不一樣**。它決定接句的 `couplet.lines`（`readCouplet` 第 435 行），也在 `targets` 裡。這是我第二輪 G11 的建議寫錯；從那張清單拿掉，`plainOr` 在接句照現在的字元表。
> - **「三種」只是我上一輪舉的例子，不是全部**。基準現在的值我多跑了幾種（`g3_head.ts`）：
>   - 現在是 false 的：開頭就是 `%%註%%`、`<b>他說：</b>`、`<!-- c -->`、`&nbsp;`、`&#12290;`、`\*`、`~~他說：~~`、零寬字元後面。
>   - 現在是 true 的：`` `中文` ``。
>   - 新的 `visibleText` 照 §3-5 的規格表會處理程式碼、字元參照、跳脫、刪除線、看不見的字元，這幾類都可能翻。
> - **建議**：
>   - 例外寫成類別，不寫成三個字串。
>   - 產生器會產生上千筆這種輸入，逐筆列不完。差分腳本把每一筆不同歸類（只有 `starts` 不同，而且第一格前面有哪一類），歸不進去的就是錯。
>   - 〈結果〉列每一類的方向、筆數、一個 `md-cases` 例子。
> - **`mentions` 沒有歸類**。它決定文法卡第 2 步有沒有提示（`base-form.ts:33`），不在 `parseDeck` 裡。建議加進逐函式的不變量，和 `typedAnswer` 同一排；`learnedWord` 裡的 `unbold` 也一樣。
> - **〈排程與分支〉C 那一列**的「解析結果不變」跟著改成「只有 §3-3 列的句首例外」。
>
> **2.（低～中，B）收窄之後留下的舊字句。**
>
> - **§2-4 最後一點**還寫 syntax.md「改寫成各科同一條」「改 D-187 第 3 點的認法」，和 §2-2「不說成各科同一條」相反。收窄後 D-187 第 3 點不用動（別科一題的照舊）。要改的是 syntax.md 第 264 行「不符合時（好幾題…）照原題型出」，以及 D-193 第 8 點的「英文卡組」。
> - **§6 第 1 題的例子「社會的事件先後」會讓使用者誤會**。社會卡組一題的 `事件先後 排序` 現在就已經是點選的排序卡（全詩的樣子，`g3_b.ts`）。B 只多了「好幾題」的那一種。請把這個事實寫進題目，使用者才知道 B 實際多了什麼。
> - **標題**「排序不看科目」（§2 與排程表）也可以照實改。
> - **§2-4「新的測試（失敗 → 通過）」**裡，`步驟 排序`、`公式 排序`、「其中一題只有一格」三個現在就會過，是釘住現狀，分開寫。
>
> **3.（低，B，§2-5）格式查核由誰做。** quality.md 第 2 步寫的是 `node tools/codex.ts format` 請 Codex 查，這裡寫成 Fable。使用者的指定有沒有包含格式查核，我看不到；請寫出依據的那句話，沒有就照 quality.md。
>
> **4.（低，零碎）**
>
> - 〈排程與分支〉「照 §1-9 的對照表」應該是 §1-6。第 2 版就有，我上一輪沒看到。
> - §1-8「畫面 HTML 比對」改成元素樹，和 §1-7 一致。
> - §1-8「（`order` → `order`）」讀不出意思，寫成「卡型 `order` 對題型 `order`」。
> - 〈排程與分支〉「時程與停損」整點還標「💡 等使用者看」。先後已經同意，只剩 A 的日子和配對單選的限制兩件還沒問，標示照 §6 第 4 題分開。
>
> **結論**
>
> 可以開工：A1、A2 的部分（G1～G5、G14）都改對了，上面的問題不擋 A。C 開工前改新問題 1；B 開工前改新問題 2、3，並照 §2-5 過格式查核。
>
> **沒做的**：
>
> - 環境是 Node 22，`package.json` 要 24；整套測試在複本上跑得起來，但 26 個和 git 標籤、建置有關的測試在複本上本來就不過，這些我沒有驗到。
> - 沒有 PR #52 與 #53 合併後的樹。

**Claude 的處理**（全部接受）：

| 項目 | 處理 |
|---|---|
| G2 補 | 格數也照 `null` 的規則（§1-7） |
| G10 補 | 產生器加括號與多音字句；分支加「認成多音字句」；每個分支至少 200 筆（§3-3） |
| G12 補 | 2026-12-07 前送第一輪 L2（〈排程與分支〉） |
| G14 補 | §1-9 寫明單選的名稱避開多音字的幾個名稱；配對與單選討論稿裡「多音字的 `choice`」是兩邊的原文，不改，寫任務說明時照 `polyphone` |
| 新 1 | §3-3 第 1 條寫明句首除外、`INLINE_MARKUP` 移進第 1 條、`mentions` 與 `learnedWord` 的 `unbold` 逐函式比；句首的例外寫成類別，差分逐筆歸類；排程表 C 那一列跟著改 |
| 新 2 | §2 改名「好幾題的排序各科都能點」；§2-2 寫明實作就是 `parse.ts:371` 一行；§2-4 分開新行為與釘住現狀的測試，syntax 與 D-ID 要改的地方改成第 264 行與 D-193 第 8 點；§6 第 1 題寫明一題的事件先後現在就能點 |
| 新 3 | 格式查核照 quality.md 請 Codex，寫明使用者指定 Fable 的是規劃的審查 |
| 新 4 | §1-6、元素樹、「卡型 `order` 對題型 `order`」、時程的 💡 標示 |

## 結果

（實作後填：每一步的 commit、改到的測試檔與原因、差分的數字與每個分支走到幾筆、`compare-versions` 的結果、和現在不一樣的格、漏接檢查的結果、lookbehind 基準移動後 ESLint 的結果。）

延後的測試：（實作後填；iPhone 併進 0.7.0 的那一次照 D-195 在技術債表寫「補測：」列）
