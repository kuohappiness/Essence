# AI 連線模組：可以換廠商、能拿到別的 repo 用的共用套件（給 Claude，雲端執行）

狀態：待審｜下一步：本機 Codex 照 [L2 請求〈第二輪〉](ai-client-l2.md#第二輪只審修正) 審修正；使用者看〈13〉D-232、在這個分支開新雲端 session 驗雲端設定第 ① 件｜等誰：Codex、使用者

來自：使用者 2026-11-25 在「讓外掛直接呼叫 AI 製卡」討論串：「1. 取消 chatgpt 登入的作法，也刪除相關的規劃紀錄，未來只做 API　2. 能不能把這個做成 API 模組，我可以任意更改未來要對接的任何一間 API，甚至可以把這個模組拿給其他的 repo 做，要具備長遠的擴充彈性，所以在規劃上值得再三仔細設計。你規劃好之後請 fable 5.2 xhigh 想一下，我們不等，規劃好就來做」。

遵守 repo 根目錄的 `AGENTS.md`。建議模型與推理等級：規劃 **Opus、xhigh**；實作 **Opus、高**。第一步只新增套件與共用檢查，不寫使用者的檔，雲端做得了（[quality.md〈本機或雲端〉](../agents/quality.md#本機或雲端)）；但改到 pre-commit 的共用檢查與 CI，屬於高風險，合併前要 L2（見〈8〉）。第二步改快照格式，開工前要格式查核。設計經 Fable 5.2 xhigh 審過（[審查紀錄](<../Claude Codex Discussion/2026-11-25-ai-client-review.md>)），這份已照它改寫。

依據：[D-007](../decisions.md#d-007-ai-選用且可插拔)（AI 可插拔、不指定供應商）、[D-039](../decisions.md#d-039-v1-範圍)（API 直連在 v1、金鑰只存在電腦本機）、[D-055](../decisions.md#d-055-ai-模型的選擇原則)、[D-059](../decisions.md#d-059-ai-的接法一種介面模型不包進外掛)（原本只做 OpenAI 相容一種介面，這份要改）、[D-072](../decisions.md#d-072-ai-服務的推薦與設定方式)、[D-085](../decisions.md#d-085-首選-openai-gpt-56-terra)（推薦集中在 [ai-models.md](../ai-models.md)）、[D-115](../decisions.md#d-115-回頭查要用的證據先收好)（送出與收回的證據）、[D-126](../decisions.md#d-126-訂閱優先的-ai-製卡與側欄修改)（訂閱接法，已由 [D-231](../decisions.md#d-231-外掛直接呼叫-ai-只走-api-金鑰取消訂閱接法) 取消）、[D-148](../decisions.md#d-148-電腦專用的主機接點)（第 1 點寫 API 直連用 `requestUrl`，第三步要重看）、[D-195](../decisions.md#d-195-測試分兩類改不回來的做足其餘延後但不漏)（測試分兩類）、[D-206](../decisions.md#d-206-essence-capture-移到第二階段v1-的教材直接附給-ai)（教材直接附給 AI）、[D-208](../decisions.md#d-208-三個外掛在同一個-repo-開發每個外掛有自己的資料夾) 第 10 點（軟體之間不 import，這份要補一條例外）、[D-226](../decisions.md#d-226-家長的手機也能製卡與啟用預設關第一批手機只建新檔)（手機製卡）。

## 0. 一段話

在 repo 最上層新增 `packages/ai-client/`：一個不認識 Obsidian、也不認識 Essence 的小套件，對外只有一個入口。呼叫的人用同一種寫法說「用哪一家、哪個模型、送什麼文字與檔案（PDF、圖片）」，套件照那一家的格式送出、收回，交回同一種結果與同一種錯誤。市面上的 AI API 幾乎都講四種格式之一（這份叫「方言」）：OpenAI Responses、OpenAI 相容的 Chat Completions、Google Gemini 的 generateContent、Anthropic Messages。四種各一個檔，廠商、網址、模型、推理等級的寫法與價格寫成資料；換一家講同一種方言的廠商只改資料，不改程式。真的出現第五種方言，加一個檔、加一組範例回應，跑同一張情境表就接上。Cards 是第一個使用者（第二步），之後 Capture、入口網站與別的 repo 都用同一份。

## 1. 和「不做」比較（D-153、D-177）

- **不做（維持複製貼上）會怎樣**：每一課要切課本 PDF、換到 AI 網站、貼上 3.8～6.1 萬字的提示、附教材、等（ChatGPT 約 25 分鐘、Claude 約 15 分鐘）、按程式碼區塊的複製、回 Obsidian 貼回；11-07 真人測試一課 33 分鐘，出過縮排跑掉、沒寫完就複製、多出引用標記三種錯（[AI 製卡最小版〈結果〉](../../apps/Cards/docs/tasks/ai-cards-mvp.md#結果)）。加深也要整趟重來。推理等級靠家長在網站自己選，選錯外掛不知道，快照的 `模型` 只能寫「未記錄」。
- **做了以後**：家長在 Cards 選好教材檔、按「直接製作」，外掛送出、收回、檢查、存成草稿；模型與推理等級由設定固定，快照照實記下模型、用量與請求編號（D-115）。沒有金鑰的家庭照舊用複製貼上。
- **做的代價**：
  - 新程式：套件的程式約 2,200 行、測試約 850 行、範例回應與目錄約 1,000 行；共用檢查認得 `packages/` 約 180 行（含測試）。都有型別、lint 與測試。
  - 維護：廠商改 API 時要改那一種方言與它的範例回應；新模型、改價只改資料。價格會過期，資料寫明查價日期，畫面一律寫「照牌價估計」。
  - 範例回應和程式是同一個 Claude 照官方文件寫的，全部通過也可能和真的 API 對不上；所以真的連一次（〈10〉的冒煙測試）排在 Cards 接上之前。沒有實測的方言不宣稱可用。
  - 繁瑣的部分（金鑰、選模型）放在設定頁一次做完，平時不打擾（[以一般使用者為準](../../apps/Cards/docs/product.md)）。
- **更小的做法**：
  1. **照 D-059 原案，只在 Cards 裡寫 OpenAI 相容的 Chat Completions 一種**：程式最少；但送 PDF、推理等級、用量的寫法各家在這個相容介面上都不一樣（Anthropic 的相容介面是測試用、功能少；OpenAI 新的模型與功能以 Responses 為主），最後還是要為各家寫例外；換廠商要改程式，也拿不到別的 repo。不採用。
  2. **先放在 `apps/Cards/` 裡，等第二個使用者再搬**：少改共用檢查；但使用者明說要拿到別的 repo，Capture 與入口網站也都會用到，晚一點搬一樣要改所有呼叫端的 import 與共用檢查，還要多搬一次。不採用。
  3. **直接用現成的多廠商套件（例如 Vercel 的 AI SDK）**：寫的格式程式最少、廠商會跟著更新。但它的大版本近兩年改過幾次、每次都有不相容的改動；錯誤怎麼分類、證據怎麼收，我們還是要自己包一層；也帶不到別的程式語言；金鑰經過的程式多了一大串第三方相依（外掛在桌面有完整的 Node 權限）。這份的做法是對外介面自己定；傳輸層是標準 `fetch` 的形狀，那類套件也都收自訂的 `fetch`，真的維護不來時可以換引擎，呼叫端不用改。

## 2. 範圍與步驟

| 步驟 | 內容 | 在哪做 | 審查 |
|---|---|---|---|
| 1 | `packages/ai-client/` 本體、四種方言、目錄、情境表測試；共用檢查與 CI 認得 `packages/` | 雲端（已做完，見〈結果〉） | 合併前 L2（〈8〉） |
| 2 | 真的連一次：使用者在電腦用自己的金鑰跑冒煙測試（〈10〉），每一家跑過才標「已實測」；對不上的照實改方言與範例回應 | 本機 | 改到程式的照常審 |
| 3 | Cards 接上：設定頁「AI 連線」、製卡與加深的「直接製作」、選教材檔、快照欄位、錯誤紀錄（〈11〉） | 另寫任務說明 | 開工前格式查核（快照欄位）；合併前 L2 |
| 4 | 用同一課比較模型，更新 [ai-models.md](../ai-models.md) | 本機、試作場 | — |

Fable 建議第一步再拆成「repo 認得 `packages/`」與「套件本體」兩次合併、方言分兩批寫；使用者要「規劃好就來做」，第一步已經一次做完，改成在 PR 裡分開的 commit，L2 照 commit 分段看（[審查紀錄](<../Claude Codex Discussion/2026-11-25-ai-client-review.md>) 第 15 點）。

**這一份不做**（各有觸發點，記在 [backlog〈AI 連線套件〉](../backlog.md#ai-連線套件)）：手機直接呼叫（D-226 的手機製卡先照舊複製貼上；手機在背景會暫停 app，要另外驗）；入口網站與網頁版（金鑰放在瀏覽器或交給 Cloudflare 代管，跟網頁版一起定）；Capture；語音、產生圖片、工具呼叫、向量；先上傳檔案再引用的 Files API；可快取區塊的標記（〈6〉）；送出前估費用；`node:https` 傳輸層；發布到 npm。

## 3. 不可破壞的性質

1. **套件不認識呼叫它的人**：不 import Obsidian、Node 專用模組、Essence 或任何軟體的程式（ESLint 擋 `src/`，`tools/check-app-imports.ts` 擋相對路徑跑出資料夾）；執行期零相依，只用標準的 `fetch`、`AbortController`、`TextDecoder`、`TextEncoder`。Node 24、瀏覽器、Electron、Cloudflare Workers 都能跑。測試與 `tools/smoke.ts` 可以用 Node 模組。
2. **對外只有入口檔**：`src/index.ts` 與 `src/testing.ts` export 的就是全部公開介面；其他檔是內部，改了不算破壞。knip 擋沒用到的 export。
3. **換廠商改資料、加方言加一個檔**：講四種方言之一的廠商只要一筆目錄資料（或呼叫端自己加）；新方言是新增一個實作同一個介面的檔與一組範例回應，自動套上同一張情境表（〈7〉第 11 點）。
4. **金鑰不存、不記、不外流**：金鑰每次由呼叫端交進來；不寫進結果、錯誤、例外訊息與 `JSON.stringify`（服務回的訊息裡出現就換成 `***`；傳輸層丟的例外，連它自己丟的 `AiError`、例外的名稱與 `cause`，都在交給呼叫端的唯一出口再遮一次；8 個字以上的才遮，更短的是本機服務的假金鑰，遮了會改掉正常的字，L2 第二輪 延續 R1）；只放在那一家設定的認證標頭，不放網址；不跟轉址；網址只准 `https`，`http` 只准本機（`localhost`、`127.0.0.1`、`[::1]`），不准帶帳密。
5. **純計算和 I/O 分開**：方言檔只做「組請求」「讀回應」「分類錯誤」的純函式；連線只在 `client.ts` 經傳輸層。測試不必連網。
6. **結果與錯誤都是中立格式**：呼叫端不必知道是哪一家；每種錯誤有固定的種類、能不能重試、一句預設的中文說明。
7. **會寫進設定與快照的東西現在就定**（D-195 的第 1 類）：方言 id、推理等級、用量的意思（〈5〉）。改了要升大版號，CHANGELOG 寫怎麼改呼叫端。
8. **會增加的集合**：`StopReason`、錯誤種類、進度事件的 `type`、`ContentPart` 的種類、方言 id 之後會加成員，算小版號；呼叫端的 `switch` 一定要有 `default`。
9. **證據交給呼叫端**：結果帶實際用的模型、請求編號、回應編號、用量、實際送出的推理參數、每一次嘗試的時間與狀態，呼叫端拿去存快照（D-115）；套件自己不寫檔。

## 4. 結構

```text
packages/ai-client/
├─ package.json        名稱 essence-ai-client、private、版號（semver，0.x）、exports（. ／ ./testing ／ ./catalog.json）；執行期零相依
├─ README.md           怎麼用、各方言的實測狀態、怎麼加一家、怎麼加一種方言、怎麼拿到別的 repo、版號規則
├─ CHANGELOG.md
├─ catalog.json        廠商與模型的資料（schemaVersion 1，語言中立）：方言、網址、認證、上限、推理寫法、模型的能力與價格、查價日期
├─ src/
│  ├─ index.ts         公開入口
│  ├─ testing.ts       公開入口：假的 fetch（mockFetch）與 SSE 產生器，給呼叫端寫測試
│  ├─ types.ts         中立的請求、結果、進度事件、目錄的型別
│  ├─ errors.ts        AiError、錯誤種類、遮蔽金鑰、預設說明（describeAiError）
│  ├─ client.ts        createAiClient：找端點 → 檢查輸入 → 組請求 → 送出 → 串流與逾時 → 重試 → 結果
│  ├─ catalog.ts       驗證 catalog.json、合併呼叫端加的資料
│  ├─ pricing.ts       照牌價算費用
│  ├─ body.ts          請求本文直接組成位元組（檔案的 base64 不經過 JS 字串）
│  ├─ sse.ts           串流事件的解碼
│  ├─ transport.ts     預設的 fetch、讀回應本文
│  └─ dialects/        openai-responses.ts、openai-chat.ts、gemini-generate-content.ts、anthropic-messages.ts、shared.ts、index.ts（登記表）
├─ fixtures/<方言>/    case.json（請求的預期、回應與錯誤的範例、出處與查的日期）與幾段 SSE 原文
├─ tests/              情境表（conformance）、client、SSE 與本文、真的 HTTP 連線（本機伺服器）
└─ tools/smoke.ts      冒煙測試：讀環境變數的金鑰，真的送一次小請求（只在使用者電腦跑，不進 CI）
```

## 5. 對外介面

用法寫在套件的 [README](../../packages/ai-client/README.md)，型別以 `src/types.ts` 為準。這裡只記會影響之後的決定：

- `createAiClient({ fetch?, responseTimeoutMs?, catalog?, clock? })` 回 `generate`、`check`、`providers()`、`catalogProblems`。`check` 拿到 200 也要是那一家模型清單的形狀（用 `checkPath` 的：JSON 物件、沒有 `error`）才算連上（L2 R12）。`estimate`、`listModels`、`capabilities` 等 Cards 真的要用再開（Fable 第 15 點）。
- **傳輸層是標準 `fetch` 的形狀**：`(url, init) => Promise<Response>`，`init` 帶 `method`、`headers`、`body`（`Uint8Array`）、`signal`、`redirect: 'error'`。Obsidian 的 `requestUrl` 包成這個形狀時要設 `responseTimeoutMs: null`（它收完整段本文才交出）。
- **端點**：`{ provider: 'openai' }`（目錄裡的）或 `{ custom: { dialect, baseUrl, auth, options? } }`；`apiKey` 選填（本機的 Ollama 不用）。
- **逃生口**：`extraBody`（深層合併進請求本文，蓋過套件組的欄位）與 `extraHeaders`（不能蓋掉認證標頭）。各家的新參數不必等套件改版。`extraBody` 不能寫最上層的 `model` 與 `stream`（模型用 `request.model`，目錄、費用與證據都照它；一律串流），寫了回 `invalid_request`；改了哪些欄位（只記路徑）記在 `trace.warnings`（L2 R13）。
- **推理等級**：`off`、`minimal`、`low`、`medium`、`high`、`xhigh`、`max`。目錄寫每個模型或廠商每一級送什麼；那一家沒有的等級取最近的一級（一樣近取高的），`trace.warnings` 記一則；不指定就不送，`trace.reasoningSent` 是 `null`。
- **用量的意思**：`inputTokens` 是全部輸入（含快取讀到與寫進快取的）；`cachedInputTokens` 是其中從快取讀到的；`cacheWriteInputTokens` 是其中寫進快取的；`outputTokens` 是全部計費的輸出（含推理）；`reasoningTokens` 是其中的推理。拿不到的寫 `null`，不寫 0。
- **結果**：`text`、`stopReason`（`end`、`length`、`content_filter`、`refusal`、`other`；`length` 不算錯誤）、`usage`、`cost`（服務在回應裡回報金額的（OpenRouter）用它：`estimated: false`、`pricesAsOf: null`，不在目錄的模型也有；其他照目錄的牌價估：`estimated: true`、`pricesAsOf` 是目錄的查價日期；不在目錄又沒有回報的是 `null`，L2 R19）、`message`（可以原樣放回下一輪的 `input`）、`trace`。
- **進度事件**：`sent`、`waiting`、`text`（`delta` 與累計字數）、`retrying`（第幾次、等幾毫秒、原因）、`done`。呼叫端的 `onProgress` 丟例外不影響請求。

## 6. 四種方言與目錄

| 方言 | 涵蓋 | PDF | 圖片 | 推理等級（目錄寫） | 實測 |
|---|---|---|---|---|---|
| `openai-responses` | OpenAI | `input_file` 的 data URL（每檔與每次請求合計 50 MB） | `input_image` | `reasoning.effort` | 沒有：雲端連不到 |
| `openai-chat` | OpenRouter、DeepSeek、Groq、Mistral、xAI、Ollama、LM Studio 等「OpenAI 相容」 | `file`（OpenRouter；其他家照目錄的能力） | `image_url` 的 data URL | `reasoning.effort` 或該家的寫法 | 沒有：雲端連不到 |
| `gemini-generate-content` | Google AI Studio | `inlineData` | `inlineData` | `generationConfig.thinkingConfig.thinkingLevel` | 假金鑰確認網址與錯誤分類（2026-11-25） |
| `anthropic-messages` | Anthropic | `document` 區塊的 base64（請求 128 MB、600 頁） | `image` 區塊 | `output_config.effort` | 假金鑰確認網址與錯誤分類（2026-11-25） |

- 一律要求串流（SSE）；服務回 `application/json` 時照非串流讀。每種方言有自己的「做完」訊號，連線正常關閉卻沒看到算 `network`，收到的文字放在 `partialText`。看到傳完的事件就不再讀、直接交回（Responses 的 `response.completed`／`incomplete`、Anthropic 的 `message_stop`、Chat 的 `[DONE]`；Chat 的 `finish_reason` 只算做完，因為用量在它之後另一塊）。Chat 有 `finish_reason` 卻沒等到 `[DONE]` 就關了，照樣成功、記 warning（用量可能沒到）；Gemini 沒有傳完的事件，讀到服務關串流為止。已經看到做完的訊號、串流卻一直沒關時，閒置或整體逾時照已收到的交回，記 warning，不作廢已經付錢的結果（L2 R10）。
- 每個 `fixtures/<方言>/case.json` 寫依據的官方文件網址與查的日期。
- OpenAI 送 `store: false`，不用背景模式（之後要「斷線接回」就得開 `store`，那時再定）。Gemini 用 generateContent：Google 把它標成 Legacy 但寫明繼續完整支援，Interactions 還是 Beta；之後另加 `gemini-interactions` 方言。Anthropic 的 API 版號和方言綁在一起，不放在可覆蓋的標頭。
- **目錄**：`catalog.json` 的 `schemaVersion` 是 1；一筆廠商寫方言、網址、認證標頭、上限（`maxRequestBytes`、`maxFileBytes`、`maxPdfPages`）、預設的輸入種類與推理寫法、`options`（`openai-chat` 各家的差異：`maxTokensField`、`streamUsage`、`systemRole`；`checkPath` 給列模型不用金鑰的服務）與模型。一筆模型寫能收的輸入、推理寫法、輸出上限、價格（可以有好幾筆，照 `effectiveFrom` 換；長輸入另一組價）與查價日期。壞掉的那一筆跳過、回報在 `catalogProblems`，不讓整個套件不能用；形狀不對（該是物件或陣列的不是、`limits` 不是正整數）與日曆上沒有的日期（`2026-02-30`）也算壞掉（L2 R14）。
- 推薦哪一個給製卡，不寫在套件裡，寫在 Cards 的資料，和 [ai-models.md](../ai-models.md) 同步。Fable 建議套件只留一小份模型種子、主檔放 Cards（第 11 點）：第三步接上時一起定，現在的模型資料標了查價日期。
- **快取**：不做 `cache: 'auto'`。Anthropic 的自動快取把斷點放在最後一個區塊，每課不同的 PDF 在最後，等於每次多付寫入、永遠讀不到（Fable 第 13 點）。之後要做時做成「到這個區塊為止可快取」的標記；第三步組請求時，規則放 `instructions`、PDF 放在文字前面。

## 7. 行為細節與驗收（都寫成測試）

1. **送出前檢查**：模型在目錄裡、又不收 PDF 或圖片時，不連網就回 `unsupported_input`（`checkInputs: false` 可以關掉，目錄過期時才不會誤擋）；請求大小（base64 後的整個本文）、檔案大小（這次所有檔案原始大小的合計）、PDF 頁數（呼叫端給 `pages` 的合計）超過那一家的上限回 `input_too_large`，訊息寫上限與這次的大小。不在目錄的模型照那一家的 `defaults`（能收的輸入、推理寫法、輸出上限），廠商也沒寫就不擋；自訂服務都不擋（L2 R17）。
2. **串流與進度**：進度事件照順序 `sent` → `waiting` → `text`（0 次以上）→ `done`，重試時插 `retrying`。不串流的傳輸層只是文字最後一次才到，結果相同。
3. **中文不斷字**：一個中文字的位元組被切在兩段串流之間，收回的文字和一次收完的完全相同（情境表把每個位元組邊界都切一次）。CR、LF、CRLF、BOM、註解行（keepalive）、多行 `data:` 都照 SSE 的規則解；CR 與 LF 之間夾著空的片段仍是一個換行。和 WHATWG 不同的只有一處：串流結束時最後一個沒有空行結尾的事件照樣交出（有些相容服務最後不送空行）；事件的 JSON 被截斷就解不開、算 `server`，所以不會把半個事件當成做完（L2 R16）。
4. **逾時的結局**：
   - 整體逾時預設 30 分鐘、可改；閒置逾時預設關（推理模型思考時可能好幾分鐘沒有資料），呼叫端可以開。錯誤回應（非 2xx）的本文一律有閒置上限：呼叫端的閒置逾時，沒設就 30 秒；到了就用已經收到的部分照狀態碼分類，不等到整體逾時（L2 R9）。
   - 回應標頭逾時：送出後 120 秒加每 100 KB 本文 1 秒還沒拿到狀態碼，算 `timeout`、不自動重送：請求已經送出，服務可能已經在做（或中間的代理把串流整段收完才交），重送可能做兩次、付兩次錢（L2 R7）；`responseTimeoutMs: null` 關掉。
   - 逾時或取消時：中止底層請求、丟 `timeout` 或 `cancelled`、不開下一次重試。傳輸層不理 `signal` 的，照樣立刻交回錯誤，之後才到的資料丟掉（請求可能還在跑、仍會計費）；本文的讀取直接取消，晚到的 `Response` 也取消本文，不留著沒停的讀取（L2 R9）。進度回呼裡取消的，回呼一結束就停：不送出、不重送，最後一段文字之後取消也是 `cancelled`；`timeoutMs` 是 0 或負數時不送出、直接 `timeout`（L2 R8）。
5. **重試**：只在還沒拿到成功的回應時（連不上、408、429、5xx、529；連不上分不出請求送到了沒有，記在[已知的限制](../backlog.md#已知的限制)，L2 第二輪 延續 R7）；共最多 3 次（`maxAttempts` 只能調少，L2 R6）；等 2 秒、8 秒，各加減 20% 的隨機；服務給 `Retry-After` 或 `retry-after-ms` 照它，要等超過 60 秒就不重試，秒數放在錯誤的 `retryAfterMs`。拿到 200 之後才出錯（串流中斷、沒有結束事件、串流裡的錯誤）一律不自動重試，錯誤標 `afterResponse: true`、帶 `partialText`，由呼叫端問家長（推理模型想了十分鐘才斷，自動重送就多付一次）。等待中取消就立刻停。
6. **停止原因**：各家的結束原因對應成 `end`、`length`、`content_filter`、`refusal`、`other`，原文放在 `trace.rawStopReason`。完全沒有輸出又被擋（內容過濾、拒答、Gemini 的 `promptFeedback.blockReason`）算錯誤 `content_blocked`；有部分輸出算結果。
7. **錯誤種類**：

   | 種類 | 例子 | 可重試 |
   |---|---|---|
   | `auth` | 401、Anthropic `authentication_error`、Gemini 400 `API_KEY_INVALID` | 否 |
   | `permission` | 403、地區不支援、這把金鑰不能用 | 否 |
   | `quota` | OpenAI `insufficient_quota`、Anthropic 402 `billing_error` 與月上限 `enforced_spend_limit_reached`、Gemini 每日額度 | 否 |
   | `rate_limit` | 其他 429 | 是 |
   | `overloaded` | 503、529、Gemini `UNAVAILABLE` | 是 |
   | `server` | 其他 5xx、408（服務說請求沒收完，還沒開始做）；200 的本文不是那一家成功的形狀（代理的登入頁、非標準的錯誤物件，L2 R12） | 是（200 之後的不是） |
   | `network` | 連不上、斷線、沒有結束事件 | 還沒拿到成功的回應時才是 |
   | `timeout`、`cancelled` | 超過逾時、回應標頭逾時、呼叫端取消 | 否 |
   | `invalid_request` | 其他 400 | 否 |
   | `input_too_large` | 413、超過 context（「prompt is too long」「maximum context length」等） | 否 |
   | `unsupported_input` | 模型不收 PDF 或圖片 | 否 |
   | `model_not_found` | 404、模型名稱打錯或下架 | 否 |
   | `content_blocked` | 第 6 點；已經拿到 2xx，標 `afterResponse: true`（L2 R12） | 否 |
   | `unknown` | 其他 | 否 |

   錯誤的 `retryable` 是「自動重送是安全的」：種類可以重試，而且 `afterResponse` 是 false（拿到成功的回應後才出錯的一律 false，L2 R6）。分類看回應內容，不只看狀態碼。分不出是不是額度用完的 429 算 `rate_limit`，重試用完仍失敗時說明加一句「如果一直這樣，可能是額度用完了」。每種方言的錯誤範例各測一次。
8. **金鑰**：情境表在每一種錯誤、每一種結果的 `JSON.stringify` 與例外訊息裡找不到測試用的金鑰；`http://` 的遠端網址、帶帳密的網址在送出前就擋；轉址不跟。
9. **用量與費用**：照〈5〉的意思對應；費用照牌價（含快取讀寫與長輸入的價），不含免費額度；服務回報的金額（OpenRouter）優先，欄位照〈5〉〈結果〉。
10. **目錄驗證**：方言要在登記表裡、網址照〈3〉第 4 點、價格是非負數、日期是合法日期、`schemaVersion` 對得上；壞掉的那一筆跳過並回報。
11. **情境表**：每一種方言都跑同一張表：純文字、文字加圖片、文字加 PDF、推理等級、串流成功（每個位元組切開、CRLF）、非串流、服務回 JSON、輸出上限、內容被擋、串流裡的錯誤、沒有結束事件、中途斷線、格式壞掉、每一種錯誤回應、429 帶 `Retry-After` 後成功、500 兩次後成功、金鑰遮蔽、串流中途取消、結束之後串流沒關、測試連線。新增方言時登記了卻沒有範例，測試會失敗。

## 8. repo 要改的地方

**第一步（已做）**：

- **新類別 `packages/`**：`tools/apps.ts` 加 `PACKAGES` 表（現在只有 `ai-client`）。
- **邊界**：`tools/check-app-imports.ts` 對 `packages/<套件>/` 照軟體的規則查：程式的相對路徑、symlink、`package.json` 的本機相依都不能跑出自己的資料夾；`packages/` 底下的資料夾要在表上、大小寫相同、第一段恰好是 `packages`。
- **分派表與 CI**：`tools/dispatch.ts` 多一個對象 `ai-client`（第 4 條：改到套件的任何檔，跑它自己的完整檢查；第 5 條：`packages/` 底下不認得的路徑全部跑）；套件 `package.json` 的 scripts 寫到的 `tools/` 檔也算檢查的入口。`tools/ci-gate.ts`、`.github/workflows/check.yml`（新的 job 與 gate）、`tools/hooks.ts`（照表，不用改）、`.claude/hooks/cloud-setup.mjs`（多裝一個資料夾）跟著改；`tools/tests/` 的分派、gate、hook、雲端設定與邊界測試都補上套件。
- **審查**：共用檢查與 CI 屬高風險，合併前 L2。雲端叫不到 Codex：推分支回本機請 Codex 審，或由 Claude 開沒參與實作的子代理審（L3），選哪一種先問使用者。改 `cloud-setup.mjs` 照 [quality.md〈本機或雲端〉](../agents/quality.md#本機或雲端) 另開雲端 session 驗兩件事。

**第三步（Cards 接上）要做的**（寫進 D-232，修改 [D-208](../decisions.md#d-208-三個外掛在同一個-repo-開發每個外掛有自己的資料夾) 第 10 點）：

- Cards 不用 npm 的 `file:` 相依：npm 會在 `node_modules` 建連結，pre-commit 的暫存副本借工作樹的 `node_modules`，檢查會讀到工作樹的套件、不是要 commit 的內容（Fable 第 1 點，已重現）；套件被複製進 `node_modules` 時 Node 也不執行 `.ts`。改成 Cards 放一個轉接檔，用相對路徑 import 套件的入口檔，其他檔只 import 轉接檔。
- `check-app-imports.ts` 加一條放行：軟體的程式只准指到表上套件的入口檔；Cards 的 ESLint 邊界、knip 與 `tools/build.mjs` 跟著放行。
- 分派表加一張明列的表（像 `SHARED_SPECS`）：改到套件時哪些軟體也要跑完整檢查，另加一條檢查確認表和實際的 import 一致。
- `tools/tests/hooks.test.ts` 加一條驗收：暫存一個會讓 Cards 測試失敗的套件修改、工作樹是好的，pre-commit 要失敗。

## 9. 拿到別的 repo

- 複製整個 `packages/ai-client/` 資料夾（零相依），用相對路徑 import `src/index.ts`。使用端要 Node 22.18 以上或打包工具（esbuild 等），tsconfig 開 `allowImportingTsExtensions`。
- 不能放進 `node_modules`（git 相依、npm 發布、`file:` 相依都會）：Node 不在 `node_modules` 裡執行 `.ts`。真的要發布到 npm 時另外編譯成 `.js`（觸發點：別的 repo 要用、又不方便複製資料夾）。
- npm 上已經有別人的 `ai-client`，所以套件名稱是 `essence-ai-client`、`"private": true`，照 README 打 `npm install` 不會裝到陌生人的程式。
- **別的程式語言**：`catalog.json` 與 `fixtures/` 是語言中立的 JSON 與 SSE 原文，用別的語言重寫時可以拿同一套情境測。
- **版號**：semver，0.x 期間小版號也可能不相容（寫在 CHANGELOG）；Cards 上線、兩家實測過才 1.0.0。

## 10. 測試與實測

- 單元與情境表測試全部離線（假的 fetch、範例回應、本機的 HTTP 伺服器測真的連線行為），CI 跑。
- 範例回應的來源標兩種：「官方文件」與「實測錄下」。第一步只有官方文件的。之後要加錄製時用白名單留欄位（OpenAI 的回應標頭帶 organization 與 project），只存自編的內容，不存課本。
- **冒煙測試**（使用者電腦，第二步）：`AI_KEY_<廠商>=… npm run smoke -- --provider <廠商> --model <模型>`；金鑰只讀環境變數，不從命令列讀；送一段自編的短文與一頁程式當場產生的 PDF，印出結果、用量、費用與 trace，不印金鑰；另外記下送出到拿到回應標頭花了多久（驗[已知的限制](../backlog.md#已知的限制)裡「連不上時照樣重送」的推斷，L2 第二輪 延續 R7）。每一家跑過才在 README 標「已實測（日期、模型）」。雲端環境若設了有上限的金鑰、又開放那幾個網域，AI 自己也能跑。
- **測試分兩類**（D-195）：這一步不寫使用者的檔；金鑰外流、用量的意思、重試規則歸第 1 類，合併前做足。

## 11. 第三步（Cards 接上）先記下的重點

另寫任務說明，這裡只記已經看到的：

- **設定頁「AI 連線」**（每台裝置自己的，不進 vault，D-039）：選廠商（目錄＋自訂）、貼金鑰、選模型（推薦的放最上面）、推理等級、「測試連線」。每一家的金鑰分開存。
- **金鑰存哪裡**：Obsidian 1.11.4 起有 `SecretStorage`（[說明](https://docs.obsidian.md/plugins/guides/secret-storage)）：存在本機、照 vault 分開，但設計上別的外掛可以用名稱讀到；手機上有不同 vault 會互相蓋掉的回報（[論壇](https://forum.obsidian.md/t/secretstorage-appears-to-be-shared-across-vaults-on-mobile-but-vault-scoped-on-desktop/117793)）。Cards 的 `minAppVersion` 是 1.8.7，舊版要退回 `saveLocalStorage`。不論哪一種，都不宣稱和其他外掛隔離（Cards [architecture §6](../../apps/Cards/docs/architecture.md#6-ai-的位置-細節之後專門討論)）。
- **傳輸層**：預設用 `fetch`（有串流、桌面與手機一樣）。OpenAI、Gemini、OpenRouter 都開了 CORS，Anthropic 加 `anthropic-dangerous-direct-browser-access: true` 也可以，但這是記憶與搜尋結果，先用金鑰在 Obsidian 的開發者主控台各打一次。[D-148](../decisions.md#d-148-電腦專用的主機接點) 第 1 點寫 API 直連用 `requestUrl`，第三步照實測改寫；`requestUrl` 包成 fetch 形狀當備援（不串流，要設 `responseTimeoutMs: null`）。
- **教材**：製卡畫面選檔（PDF 或照片）；PDF 要不要只送某幾頁、檔太大時怎麼縮，第三步定。
- **流程**：「直接製作」的回覆走和貼回完全一樣的整理、檢查、存草稿與啟用；快照的 `接法` 寫 API、`服務` 寫廠商、`模型` 照實寫，另加推理等級、用量、請求編號（要格式查核；`readSnapshot` 只取認得的鍵，加欄位風險低）。
- **畫面**：送出中顯示經過的時間與收到的字數、可以取消；錯誤照種類給一句說明與下一步；拿到回應後才斷的，問家長要不要重送（會再計費）。費用寫「照牌價估計，不含免費額度」。

## 12. 待決（不擋第一步）

- 家裡另一台電腦跑 Ollama（`http://192.168.x.x`）現在會被擋。要不要給呼叫端一個明確的開關：等真的有人要用本機網路上的模型再定。
- 模型資料放套件還是 Cards（〈6〉）：第三步定。
- 推薦哪一家、哪個模型給製卡：第四步比較後更新 [ai-models.md](../ai-models.md)（現在的推薦是 10 月轉錄稿時代測的，教材改成直接附 PDF 後要重測）。

## 13. 要寫的決定

- **只接 API、取消訂閱接法**：已寫成 [D-231](../decisions.md#d-231-外掛直接呼叫-ai-只走-api-金鑰取消訂閱接法)（原本寫成 D-230，和 PR #50 撞號後改號）。
- **D-232 AI 連線做成共用套件**（等使用者看過才寫；合併 PR #51 前要寫好，不然 D-059 與 D-208 第 10 點和這個分支的程式矛盾，L2 R19）：這份的〈3〉〈5〉〈8〉〈9〉；修改 [D-059](../decisions.md#d-059-ai-的接法一種介面模型不包進外掛)（一種介面 → 四種方言的共用套件）與 D-208 第 10 點（新類別 `packages/`；軟體經自己的轉接檔、用相對路徑 import 表上套件的入口檔，不用 npm 相依；套件不 import 軟體、別的套件與最上層的程式）。

## 結果

第一步做完（分支 `claude/project-thread-q0jv5f`：套件 `8a5223cb`、共用檢查與 CI `74143921`），還沒合併：

- 套件：`packages/ai-client/` 的 `npm run check`（型別、ESLint、knip、175 個離線測試）通過。
- GitHub 上的 Codex 自動審查（PR #51，`1c993b62`）提了三項 P2，各先寫一個會失敗的測試再修，一項一個 commit：openai-chat 串流的拒答被丟掉（`1dc7db34`）、非串流回應分段慢到時被誤判閒置逾時（`e3761c6c`）、`extraBody` 改了推理等級時證據記錯（`1fc4d355`）。
- 共用檢查：`tools/` 的 `npm run self-check` 通過；分派、gate、hook、雲端設定、邊界的測試都補了套件的案例。
- 真的連線（雲端，假金鑰，2026-11-25）：Anthropic 回 401 `authentication_error` 並帶 `request-id`，分類成 `auth`；Google 回 400 `API_KEY_INVALID`，分類成 `auth`；OpenAI 與 OpenRouter 被雲端的網路設定擋住，沒測到。
- 改 `cloud-setup.mjs` 的第 ② 件（2026-11-25，這個雲端 session）：另開沒有 `node_modules` 的 worktree（`1c993b62`），PATH 拿掉 `/opt/node24/bin`、設 `CLAUDE_CODE_REMOTE=true` 與 `CLAUDE_PROJECT_DIR=<worktree>` 跑 hook，原文：「雲端環境設定：PATH 上的 Node 是 22.23.5；/opt/node24/bin 有 v24.22.3，但沒有 CLAUDE_ENV_FILE，之後的指令仍是舊版，跑指令前先 export PATH="/opt/node24/bin:$PATH"；core.hooksPath 已設為 .githooks；tools：npm ci 完成；apps/Cards：npm ci 完成；apps/Capture：沒有相依，跳過；apps/Mindboard：沒有相依，跳過；packages/ai-client：npm ci 完成」。
- L2 第一輪（本機 Codex，使用者 2026-11-25 選的，請求 [ai-client-l2.md](ai-client-l2.md)）：19 項發現，都修了，一項一個 commit、先寫會失敗的測試（R17、R19 是規格對齊）；每一項的修法與 commit 在[審查報告〈Claude 核對（第一輪）〉](<../Claude Codex Discussion/2026-11-25-ai-client-l2.md#claude-核對第一輪>)。
- 還沒做：L2 第二輪（只審修正）；D-232（使用者同意後寫，合併前要寫好）；第 ① 件（在這個分支新開雲端 session，讀它的開場訊息）；冒煙測試（第二步）。

延後的測試：沒有。
