# 題型模組：照形式分、每一科通用（給 Claude，L2 在本機）

狀態：待審｜下一步：Fable 5.2 xhigh 審這份任務說明（使用者指定），照審查改完再開工；§6 兩題等使用者｜等誰：Claude、使用者

來自：使用者 2026-11-25：「我要做的不是每一科目不同的題型，是一個通用模組，例如每一科都有填空題，配對題，單選題等等」「現在做，進0.7.0」；[題型模組規劃稿](<../Claude Codex Discussion/2026-11-25-question-type-modules.md>)（第 2 版，Fable 5.2 xhigh 第一輪審過）的 §2、§5 第 1、2 段。

遵守 repo 根目錄的 `AGENTS.md`。建議模型與推理等級：寫這份用 **Opus、xhigh**，實作用 **Opus、高**（[quality.md](../../../../docs/agents/quality.md)）。改的是卡型怎麼認（[syntax §2-3](../syntax.md)，P1：寫進筆記的格式不能讀成別的）、組卡、作答與畫面，跨 `core/deck`、`core/study`、`core/ai`、`review`、`ui`，屬於高風險範圍：合併前做 L2（Codex 額度已重置，照 quality.md 在使用者的電腦跑）。必讀 code-quality 的〈測試〉。

依據：[D-181](../../../../docs/decisions.md#d-181-題型是可以接上的模組開題型專區)（題型是可以接上的模組；第一步只搬不改的做法）、D-110（模組邊界，`eslint.config.js` 擋）、[D-182](../../../../docs/decisions.md#d-182-比較點選各科都能用家長出題時勾選)、[D-187](../../../../docs/decisions.md#d-187-全詩順序卡一首一張放在這首最後)、D-192、[D-193](../../../../docs/decisions.md#d-193-英文的學習地圖詞是根句型是骨架) 第 5、6、8 點、[D-230](../../../../docs/decisions.md#d-230-國語字義卡和詞義卡錯開混淆點第一次就比多音字改點選填空) 第 4 點（多音字）、[D-195](../../../../docs/decisions.md#d-195-測試分兩類改不回來的做足其餘延後但不漏)、[D-207](../../../../docs/decisions.md#d-207-l2-的發現先分一定修可記限制交使用者選修法先收窄最後才加機制)；[Cards backlog〈技術債〉](../backlog.md#技術債)「讀手寫文字的去格式各處自己寫」。

## 和「不做」比較（D-153）

比較表在規劃稿 §3，這裡只寫結論與使用者的選擇：

- **不做**：每加一種卡在 `Target` 多一欄，16 個讀卡型欄位的檔靠人記得改，漏接要到 L2 才抓到（英文 L2 的 R2）；去格式有三套以上，L2 的發現多半是這一類（多音字 L2 四輪、英文 L2 的 R6）；排序照科目分成兩套，和使用者「照形式、不照科目」的方向不合。
- **做的好處**：加一種卡型或一種作答方式時，每一層漏了哪裡編譯不過；排序一套、各科同一個寫法；「畫面上看得到的字」只算一次。孩子看不到差別（第 B 步的例外列在 §2-3）。
- **代價**：碰到排程、組卡與畫面的檔，孩子正在用（國二 2027-01-19 段考）。使用者 2026-11-25 選現在做、進 0.7.0，所以第 A 步照 D-181 第一步的驗收做足（§1-6），第 B、C 步各自驗收。

## 排程與分支

| 步 | 內容 | 驗收 | 等什麼 |
|---|---|---|---|
| 0 | 這份說明；Fable 5.2 xhigh 審 | | |
| A | §1：一種卡型在每一層一處，排序分成自己的題型；行為不變 | §1-6 | 第 0 步；PR #53（多音字）與 PR #52（卡型分類表）已合併 |
| B | §2：排序不看科目 | §2-4 | 第 A 步；使用者同意 §6 第 1 題 |
| C | §3：去格式一處 | §3-4 | 第 A 步（和 B 不互等） |
| D | L2（本機 Codex，到第四輪為止，D-171）；Windows 看一次畫面；iPhone 併進 0.7.0 的那一次 | | B、C |
| E | 合併；`syntax.md`、`question-types.md`、題型專區的〈程式現況〉、roadmap 更新；技術債那一列劃掉 | | 使用者同意合併 |

- 分支：開工時從當時的 `main` 開新分支；三步各自一串 commit，一個 commit 只做一件事（code-quality〈測試〉）。
- 0.7.0 要在 2027-01-11 前裝好（[提早試用計畫〈0.7.0 放什麼〉](../plans/early-trial.md#070-放什麼)）。同在 0.7.0、也動 Cards 的：考前抽測、AI 製卡存不了草稿的修正；另外手機啟用第二步、API 製卡、比較測試工具、AI 提示詞架構也在動 `core/ai`。開工前問各串，第 A 步會改到 `check.ts`、`parse.ts`、`session.ts`、`practice.ts`，先合併的那一邊之後要照新的存取方式改。

## §1 第 A 步：一種卡型在每一層一處（行為不變）

### 1-1 兩層的名稱

- **題型**（作答的形式，D-181）：`QuestionType` 從三個改成四個：`'flip' | 'typed' | 'pick' | 'order'`，對到使用者的表（問答、打字填空、點選填空、排序）。`order` 的作答流程與預覽照舊用點選的那一套（`FLOWS.order = createPick`、`PREVIEWS.order` 同 `pick`），畫面另成一列（`SCREENS.order`，§1-4）。紀錄不記題型（`questionType` 只在 `review/flow.ts`、`ui/Review.tsx` 用），所以紀錄不變。
- **卡型**（孩子看到的那一種卡，名稱等使用者確認，規劃稿 §7 第 3 題）：`KindId = 'group' | 'choice' | 'order' | 'typing' | 'couplet'`。沒有卡型的目標（一般問答、填空、英翻中、中翻英）是 `kind` 沒有值。

| 卡型 | 現在的欄位 | 題型 | 選項從哪裡來 |
|---|---|---|---|
| `group` 比較卡（相似字、相似詞、比較） | `Target.group` | pick | 組裡的其他目標 |
| `choice` 多音字 | `Target.choice`（PR #53） | pick | 這個目標自己的括號 |
| `order` 排序（全詩、句子兩種樣子） | `Target.order`、`Target.sentence` | order | 打散的每一格 |
| `typing` 文法、變化 | `Target.typing` | 問答題 typed、填空題 flip | |
| `couplet` 接句 | `Target.couplet` | flip | |

方向（`direction`、`pairKey`、`pairWord`）不是卡型，留在 `Target`：它和卡型能並存的組合由現在的排除條件決定（每個認法都先看方向），`tools/compare/adapter.ts` 也直接讀它。

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
- 讀的地方只用一種寫法：`kindOf(target, 'group')` 回傳那一種的資料或 `undefined`（`core/deck` 匯出，`study` 照舊只拿型別，所以 `study` 裡用 `target.kind?.id === 'group' ? target.kind.group : undefined` 這種只靠型別的寫法，或把 `kindOf` 寫成型別守衛放在 `types.ts` 旁不帶執行期依賴的檔；實作時選一種，兩個模組同一種）。
- `PoemOrder`、`SentenceOrder` 的欄位不改；`style` 只分畫面與組卡的兩種樣子，第 B 步才改誰是哪一種。

### 1-3 認法（`src/core/deck/kinds/`）

`question-types.ts` 照卡型拆成一個資料夾，一種卡型一個檔，共用的小函式（`splitName`、`endingOf`、`membersOf`、`countBlanks`、`pickKey`…）放 `kinds/shared.ts`，第 C 步再換成 §3 的一處：

| 檔 | 內容（照搬，邏輯一字不改） |
|---|---|
| `kinds/group.ts` | `readPick`、`readGroup`、`groupFailure`、`pickWord` |
| `kinds/choice.ts` | `readChoice`、`choiceProblems`、`choiceStem`、`anchorsOf`、`plainSentence` |
| `kinds/order.ts` | `readOrder`、`readSentence`、`sentenceCells`、`plainBlock`、`visibleText` |
| `kinds/typing.ts` | `readTyping`、`pairWordOf`、`mentions`、`blanksIn`、`unbold` |
| `kinds/couplet.ts` | `readCouplet`、`coupletLines` |
| `kinds/index.ts` | 認的先後（下面）、`KIND_NEEDS`（§1-5）；對外的匯出和現在 `question-types.ts` 一樣，`core/deck/index.ts` 照舊轉出 |

`typedAnswer` 是打字題型的（中翻英也用），放 `src/core/deck/typed-answer.ts`。

**認的先後**（`parse.ts` 第 181～183 行與第 363～375 行換成照表跑）：

1. 名稱階段（題目讀之前，因為題目要知道打不打字）：`typing`，照舊只在英文的卡組。
2. 題目階段，照這個順序：`group` → `choice` → `order` → `couplet`。讀成卡型就停；**有提示也停**。現在 `choice` 就是這樣接在 `group` 後面；`order`、`couplet` 現在不看前面的提示，但前面會出提示的情況（結尾是相似字、相似詞、比較、讀音，或題目是比較句、多音字句，都是問答題）和它們的條件（結尾排序、接句，一題填空）互斥，所以這條不改行為。分類表加兩列釘住名稱有括號、結尾是別的卡型時（2026-11-25 在 PR #53 的分支實跑）：`寨（寨、塞） 排序` 配兩格填空，國語是全詩順序、英文照翻面（句子排序排除讀得出組的名稱）；`寨（寨、塞） 接句`、`長（ㄓㄤˇ、ㄔㄤˊ） 接句` 配一格填空都是接句。
3. 各認法裡排除別的卡型、看方向的條件第一步不改（規劃稿 §2-3），先後由 `tests/card-kinds.test.ts` 與差分（§1-6）驗。

### 1-4 每一層照卡型分的地方

每一處改成照 `KindId` 的 `switch`，結尾 `const never: never = kind` 或 `Record<KindId, …>`，多一種卡型就編譯不過。比較卡的併卡四處各用不同的歷史，不硬併成一個函式（規劃稿 §2-3）。

| 層 | 檔 | 現在照什麼分 | 改成 |
|---|---|---|---|
| 組卡 | `core/study/compose.ts` | `cardOf` 看 `target.order`、`target.sentence`；`questionType` 看 `card.group`、`card.typed` | `cardOf` 照 `order.style`；`questionType` 照 `card.target.kind` 與 `card.typed`（`group`、`choice` → pick，`order` → order），`card.group` 沒有值卻是 pick 或 order 時丟 `TypeError` |
| 今天的份 | `core/study/session.ts`、`plan.ts` | `slot.target.group`、`.choice`、`.typing.pair`、`groupKey` | 照 `kind` |
| 練習 | `core/study/practice.ts` | `.group`、`.choice`；接句與全詩的先後看 `.couplet`、`.order` | 照 `kind`；接句與全詩只看 `order.style === 'poem'`（句子排序現在不在這條，照舊） |
| 預覽 | `review/preview.ts` | `.group`、`.choice` | 照 `kind` |
| 朗讀與英文 | `review/english.ts` | `.typing`、`.sentence` | 照 `kind`（`isEnglish` 的句子排序是 `order.style === 'sentence'`） |
| 作答 | `review/pick.ts` | `card.group.order !== undefined` | 照 `questionType(card) === 'order'` |
| 畫面 | `ui/screens.tsx`、`ui/PickCard.tsx` | `group.order?.starts` 猜句子排序；`target.couplet` | `SCREENS.order` 是排序的畫面（全詩與句子兩個 body 從 `PickCard.tsx` 搬到 `OrderCard.tsx`，class 不變所以 CSS 不動），照 `order.style` 選 body；`SCREENS.pick` 只剩比較卡與多音字 |
| 需要版本 | `state/need.ts`、`core/ai/move.ts`、`core/ai/draft.ts` | `.group` 與 `pick-answer-invalid` | `KIND_NEEDS`（§1-5） |
| AI 草稿 | `core/ai/check.ts`、`existing.ts` | `.group`、`.choice`、`.typing`、`.sentence`、`.order` | 照 `kind`；兩處各列一次的檢查（規劃稿 §1-2〈漏接一條路〉）併成照卡型的一張表 |

### 1-5 需要版本（`KIND_NEEDS`）

`KIND_NEEDS: Record<KindId, string | null>` 放 `kinds/index.ts`：`group` 是 `PICK_NEEDS`，其他是 `null`（和現在一樣：多音字照 PR #53 不擋、照翻面；使用者 2026-11-25：「目前只有我自己的兩個小孩使用，我一定會更新到最新版」）。`pick-answer-invalid` 照舊另外算 `PICK_NEEDS`。`need.ts`、`move.ts`、`draft.ts`（AI 草稿寫進屬性的 `需要版本`，現在只看比較卡）改用同一個 `needsOf(deck)`。`draft.ts` 沒算 `pick-answer-invalid`，但那是錯誤，AI 草稿的檢查本來就退件（`check.ts` 第 220 行），存不進去，所以不改行為；實作時加一個測試釘住，釘不住就照舊分開、寫進〈結果〉。

### 1-6 驗收

- **行為測試一字不改**：除了下面兩類，`git diff <基準> -- apps/Cards/tests/` 是空的，全部通過。實作完照 `tsc` 的錯誤清單列出改到的測試檔，寫進〈結果〉：
  - 讀卡型欄位的測試（`tests/pick-*.test.ts`、`poem-order-*`、`couplet-*`、`english-*`、`polyphone-*`、`ai-add-*`、`deck.test.ts` 等）只准把 `target.group` 這類存取式換成 `kindOf(...)`，斷言的值不改。
  - `tests/card-kinds.test.ts`：只改 `kindOf`（讀 `target.kind`）與 `cell()` 的題型（`order` 卡型出 `order`），加 §1-3 的兩列；其他格的預期值不改。
- **差分**：另寫一支不進 repo 的腳本，舊版從基準的 worktree 載入：
  - `parseDeck`：`tests/` 裡所有卡組文字、`card-kinds.test.ts` 的 15 列 × 4 種形狀 × 3 科，加 2000 份隨機組的卡組（名稱的結尾、括號、方向、題目形狀隨機配），舊版的六個欄位對成新版的 `kind` 後，`targets` 與 `problems` 的 JSON 相同。
  - `createSession`、`createPreview`：照 D-181 第一步的做法（[題型接點 §2 第 5 點](question-type-seam.md#2-第一步只搬不改)），同一個亂數種子餵同一串動作，2000 串、每串 60 步以上，每一步的 `view()` 與紀錄的每一行相同（卡型範例表的 9 種卡各有一份卡組在裡面）。
  - 差異要逐項說明，不能略過；腳本與結果寫進 L2 請求。
- **兩個正式 vault**：`tools/compare/adapter.ts` 的快照多一欄卡型（舊版從六個欄位推，新版讀 `kind`），在使用者的電腦對兩個 vault 的備份跑 `npm run compare-versions`，零差異。
- `npm run check` 通過；`src/` 裡讀不到 `.group`、`.choice`、`.order`、`.sentence`、`.typing`、`.couplet` 這六個 `Target` 欄位（欄位拿掉了，`tsc` 擋）。
- 漏接：在暫存的工作樹加一個假的 `KindId`，`tsc` 在 §1-4 的每一處報錯（結果貼進〈結果〉，不 commit）。
- 這一步不改 `docs/syntax.md` 與卡組的寫法。

## §2 第 B 步：排序不看科目

### 2-1 現在

| 卡組 | 名稱 | 認成 |
|---|---|---|
| 英文 | `… 全詩 排序` | 全詩順序（一題、兩格以上） |
| 英文 | `… 排序`（沒寫全詩） | 句子排序（每一題兩格以上，一題一張） |
| 其他科 | `… 排序`（寫不寫全詩都一樣） | 全詩順序 |

### 2-2 改成

各科同一條：**名稱寫 `全詩 排序` 的是全詩的樣子，其他的 `排序` 是句子的樣子**。題型都是排序（§1-1），選項都是打散的每一格。

- 國語預設本來就寫 `鳥鳴澗 全詩 排序`（[國小國語預設](../card-rules/elementary-chinese.md)），英文預設寫 `間接問句 排序`（[英文預設 §5 B](../card-rules/english.md)），所以照預設做的卡組認法不變。
- 句子的樣子用在非英文時，畫面的語言照格子的字定，不照科目：格子都沒有漢字、有拉丁字母時照英文（`lang="en"`、句首大寫、朗讀），否則照中文。句首大寫只動拉丁字母，漢字不受影響。`isEnglish` 跟著改成看內容。
- AI 草稿的英文排序檢查（`english-order-*`）照舊只在英文的草稿：它們是英文預設的規則，不是題型的規則。
- 社會的事件先後要哪種樣子（一行一個事件比較像全詩的樣子），照 [Cards backlog](../backlog.md) 那一項到試作場試，這一步不定。

### 2-3 會變的卡組

只有「非英文的卡組、名稱結尾 `排序`、沒寫 `全詩`」的目標會變：一題的從全詩的樣子變成句子的樣子（畫面從一句一行改成一整句），名稱讀得出比較組的變成翻面，好幾題的從翻面變成句子排序。用第 A 步加了卡型的 `compare-versions`，在使用者的電腦對兩個 vault 的備份跑一次，列出每一個會變的目標（卡組、名稱、行號），給使用者看過才合併。預期是沒有（兩個 vault 的卡組都照預設做）。

### 2-4 驗收

- `card-kinds.test.ts` 只有這幾格變：非英文的 `間接問句 排序` 配兩格填空從全詩順序變句子排序；非英文的 `寨（寨、塞） 排序` 從全詩順序變翻面（句子排序照舊排除讀得出組的名稱，和英文一樣）。其他格不變。加一列：社會卡組的 `事件先後 排序`，兩題、每題兩格以上的中文填空，現在照翻面（全詩順序只收一題），改成句子排序、中文畫面、沒有提示。
- 卡型範例表加一個中文句子排序的例子，走到今天的份，題型是 `order`，`isEnglish` 是 false。
- 現有測試一字不改通過（英文與國語的排序測試都照預設的寫法，不受影響；有變的寫進〈結果〉逐項說明）。
- `docs/syntax.md` §2-3〈全詩順序卡〉〈英文的句子排序〉改寫成各科同一條；使用者同意後寫成 D-ID（改 D-187 第 3 點的認法、D-193 第 8 點的「英文卡組」），照 essence-decision。

## §3 第 C 步：去格式一處

### 3-1 現在各處各自推「畫面上看得到的字」

| 函式 | 檔 | 用在 | 做法 |
|---|---|---|---|
| `pickKey` | `question-types.ts` | 比對點選的答案、組員、組的身分 | 拿掉成對的 `**`、`==`，折全半形，連續空白當一個，英文小寫 |
| `foldPick` | `core/ai/check.ts` | AI 草稿：答案有沒有寫在題目裡 | 同上，但不成對的 `**`、`==` 也拿掉 |
| `unbold` | `question-types.ts` | 認名稱的結尾、拆字義 | 拿掉成對的 `**`、`==` |
| `typedAnswer` | `question-types.ts` | 中翻英、文法與變化的答案 | 不成對的 `**`、`*`、`_`、`==` 也拿掉；有換行、連結、程式碼、公式就整格無效 |
| `visibleOf`、`countBlanks` | `question-types.ts` | 數空格（比較卡、多音字、文法） | 遮程式碼、公式、嵌入、連結目的地、HTML、`%%` 註解 |
| `plainSentence`、`choiceStem` | `question-types.ts` | 多音字句只收純文字、判斷同一句 | 只准成對的粗體、螢光筆、`%%` 註解；`choiceStem` 加 NFKC、連續底線當一個 |
| `plainBlock`、`visibleText` | `question-types.ts` | 句子排序的詞塊、判斷句首 | 拿掉成對的 `**`、`*`、`__`、`_`，還有記號就不是詞塊；`visibleText` 連結換成顯示的字 |
| `INLINE_MARKUP` | `question-types.ts` | 接句要不要照標點切 | 有填空以外的行內 Markdown 就不切 |
| `mentions` | `question-types.ts` | 文法題第 2 步的提示 | 拿掉 `**`、`==`（不成對也拿） |
| `plain`、第 87 行的 `bare` | `review/english.ts` | 朗讀、填空的英文句子 | 嵌入、連結換成字，拿掉 `**`、`==`、`__`、`*`、`` ` `` |

`parse.ts` 的 `fingerprint` 不在這張表：它是一題的身分，複習紀錄與出題歷史照它對（P1），**一個字都不能改**。`check.ts` 的 `bolds`（取出粗體的字）用途不同，也不併。

### 3-2 改成

新增 `src/core/deck/visible.ts`，`review` 與 `core/ai` 從 `core/deck/index.ts` 拿（`study` 不用去格式，D-110 不受影響）：

- `visible(text)`：畫面上看得到的字（`visibleOf` 加上連結換成顯示的字、嵌入換成隔開的記號）。數空格、判斷句首、朗讀都用它。
- `emphasisless(text, { unpaired })`：拿掉粗體、斜體、螢光筆；`unpaired` 是 true 時不成對的記號也拿掉（打字答案、AI 檢查要；比對鍵不要）。
- `plainOr(text, allow)`：只剩允許的格式（`allow` 列出哪幾種）時回傳拿掉格式後的字，否則 `null`。多音字句、詞塊、接句的切句共用；三處允許的格式照現在各自寫，參數不同、判斷同一套。
- `compareKey(text)`：`pickKey` 的做法；`choiceStem` 是 `compareKey` 加 NFKC 與連續底線，寫成 `compareKey` 的選項。

**規格**：`visible.ts` 開頭寫一張表，行是 Markdown 與 HTML 的寫法（粗體、斜體、螢光筆、刪除線、行內程式碼、公式、連結、嵌入、HTML 標籤、`%%` 註解、跳脫、字元參照、看不見的格式字元、全形符號），欄是四個函式，每一格寫「留字」「拿掉」「隔開」或「不收」。和現在不一樣的格要在〈結果〉逐項列出，而且只能是寫壞或很少見的筆記（D-207：修法先收窄）。依據 Obsidian 渲染結果的格，照沿用的證據寫出處（[題型接點 §3〈空格怎麼數〉](question-type-seam.md#3-卡組名稱與題目格式查核第四輪已接住)、多音字的 L2），沒有證據的列進 §3-3。

### 3-3 平台事實表

| 假設 | 怎麼驗 | 環境 | 結果 |
|---|---|---|---|
| `%%…%%` 渲染後看不見，行內的也是 | 沿用題型接點 §3 | | 已驗（沿用） |
| `&#65343;` 渲染成 `＿` | 沿用題型接點 §3 | | 已驗（沿用） |
| 第 C 步新改成「留字」或「隔開」的每一格 | 在 Windows 的測試 vault 開一篇含那種寫法的卡組，看閱讀模式 | Obsidian 桌面版、Windows | 待驗：送 L2 前跑完，跑不了的寫進 L2 請求的〈驗證方式〉 |

### 3-4 驗收

- 新增 `tests/visible.test.ts`：表的每一格至少一個例子，預期值是字面值；多音字 L2 報告（分支 `claude/project-thread-0mpbnw` 的 `apps/Cards/docs/Claude Codex Discussion/2026-11-25-polyphone-pick-l2.md`（3f626bb4），PR #53 合併後改成連結）四輪的反例、[英文打字與排序 L2](<../Claude Codex Discussion/2026-11-15-english-typed-order-review.md>) R6 的例子全部放進去，當回歸例子。
- 現有測試一字不改通過；`fingerprint` 對 `tests/` 裡所有卡組的值和基準相同（差分腳本多比這一項）。
- `src/` 裡拿掉 Markdown 記號的 regex 只在 `visible.ts`（`grep` `\*\*|==` 類的 replace，〈結果〉列出剩下的與原因，例如 `bolds`）。
- [Cards backlog〈技術債〉](../backlog.md#技術債)「讀手寫文字的去格式各處自己寫」的完成條件（一處算、規格寫明、做 L2）都滿足才劃掉。

## §4 測試怎麼寫

- 第 A 步是純重構：不為了湊失敗寫新斷言，靠既有的行為測試、分類表與差分（code-quality〈測試〉）。
- 第 B、C 步是新行為：照小步的失敗 → 通過，先寫 §2-4、§3-4 的測試。
- 卡組範例都用自編的最小內容，不放孩子的卡組。兩個正式 vault 只在使用者的電腦用 `compare-versions` 讀備份，結果只寫差異的數字與目標名稱。

## §5 這次不做

- **配對、單選**：只留位置（`KindId` 與 `QuestionType` 多一個值、每一層補一處）；要不要這次做等使用者的決定卡。選了要做就另寫任務說明，不擠進這份。
- **文法、變化的結尾開放給每一科**：見 §6 第 2 題。
- **改 `fingerprint`**、紀錄的欄位、送給 AI 的提示（規劃稿 §2-5）。
- **另加一行屬性指定題型**、家長在畫面上換題型（規劃稿 §6）。
- **舊版外掛的擋法**：只有自家兩個孩子在用，使用者會一直更新到最新版（2026-11-25），`KIND_NEEDS` 照現在的值。

## §6 要請使用者看的

1. **排序不看科目**（§2-2）：名稱寫 `全詩 排序` 的是一行一句的樣子，其他 `排序` 是一整句的樣子，各科一樣。照預設做的卡組都不變；會變的卡組在 §2-3 列給使用者看。同意後寫成 D-ID。
2. **文法、變化的結尾照舊只在英文**：打字填空這個題型每一科都能用（中翻英哪一科都會打字），但 `文法`、`過去式`、`複數`、`比較級` 這些結尾是英文文法的詞，而且打字的答案只能是英文（程式比對字母；中文打字要用輸入法選字，等於先看到選項）。開放給每一科，別科寫了 `… 文法`、答案是中文的目標會變成「答案寫錯」、不出題（國中國文之後很可能出現），好處沒有。💡 建議維持；這和 2026-11-25 回覆裡「會把這兩列開放」的說法不同，照這裡更正。

## 結果

（實作後填：每一步的 commit、改到的測試檔與原因、差分的數字、`compare-versions` 的結果、和現在不一樣的格。延後的測試：照 D-195 寫。）
