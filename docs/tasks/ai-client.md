# AI 連線模組：可以換廠商、能拿到別的 repo 用的共用套件（給 Claude，雲端執行）

狀態：規劃中｜下一步：Fable 5.2 xhigh 審設計，照意見改完請使用者看｜等誰：Claude

來自：使用者 2026-11-25 在「讓外掛直接呼叫 AI 製卡」討論串：「1. 取消 chatgpt 登入的作法，也刪除相關的規劃紀錄，未來只做 API　2. 能不能把這個做成 API 模組，我可以任意更改未來要對接的任何一間 API，甚至可以把這個模組拿給其他的 repo 做，要具備長遠的擴充彈性，所以在規劃上值得再三仔細設計。你規劃好之後請 fable 5.2 xhigh 想一下，我們不等，規劃好就來做」。

遵守 repo 根目錄的 `AGENTS.md`。建議模型與推理等級：規劃 **Opus、xhigh**；實作 **Opus、高**。第一步只新增套件與共用檢查，不寫使用者的檔，雲端做得了（[quality.md〈本機或雲端〉](../agents/quality.md#本機或雲端)）；但改到 pre-commit 的共用檢查與 CI，屬於高風險，合併前要 L2（見〈8〉）。第二步改快照格式，開工前要格式查核。

依據：[D-007](../decisions.md#d-007-ai-選用且可插拔)（AI 可插拔、不指定供應商）、[D-039](../decisions.md#d-039-v1-範圍)（API 直連在 v1、金鑰只存在電腦本機）、[D-055](../decisions.md#d-055-ai-模型的選擇原則)、[D-059](../decisions.md#d-059-ai-的接法一種介面模型不包進外掛)（原本只做 OpenAI 相容一種介面，這份要改）、[D-072](../decisions.md#d-072-ai-服務的推薦與設定方式)、[D-085](../decisions.md#d-085-首選-openai-gpt-56-terra)（推薦集中在 [ai-models.md](../ai-models.md)）、[D-115](../decisions.md#d-115-回頭查要用的證據先收好)（送出與收回的證據）、[D-126](../decisions.md#d-126-訂閱優先的-ai-製卡與側欄修改)（訂閱接法，這次取消）、[D-206](../decisions.md#d-206-essence-capture-移到第二階段v1-的教材直接附給-ai)（教材直接附給 AI）、[D-208](../decisions.md#d-208-三個外掛在同一個-repo-開發每個外掛有自己的資料夾) 第 10 點（軟體之間不 import，這份要補一條例外）、[D-226](../decisions.md#d-226-家長的手機也能製卡與啟用預設關第一批手機只建新檔)（手機製卡）。

## 0. 一段話

在 repo 最上層新增 `packages/ai-client/`：一個不認識 Obsidian、也不認識 Essence 的小套件，對外只有一個入口。呼叫的人用同一種寫法說「用哪一家、哪個模型、送什麼文字與檔案（PDF、圖片）」，套件照那一家的格式送出、收回，交回同一種結果與同一種錯誤。市面上的 AI API 幾乎都講四種格式之一（這份叫「方言」）：OpenAI Responses、OpenAI 相容的 Chat Completions、Google Gemini、Anthropic Claude。四種都做成一個檔，廠商、網址、模型、能力與價格寫成資料；換一家講同一種方言的廠商只改設定，不改程式。真的出現第五種方言，加一個檔、跑同一套合格測試就接上。Cards 是第一個使用者（第二步），之後 Capture、入口網站與別的 repo 都用同一份。

## 1. 和「不做」比較（D-153、D-177）

- **不做（維持複製貼上）會怎樣**：每一課要切課本 PDF、換到 AI 網站、貼上 3.8～6.1 萬字的提示、附教材、等（ChatGPT 約 25 分鐘、Claude 約 15 分鐘）、按程式碼區塊的複製、回 Obsidian 貼回；11-07 真人測試一課 33 分鐘，出過縮排跑掉、沒寫完就複製、多出引用標記三種錯（[AI 製卡最小版〈結果〉](../../apps/Cards/docs/tasks/ai-cards-mvp.md#結果)）。加深也要整趟重來。推理等級靠家長在網站自己選，選錯外掛不知道，快照的 `模型` 只能寫「未記錄」。
- **做了以後**：家長在 Cards 選好教材檔、按「直接製作」，外掛送出、收回、檢查、存成草稿；模型與推理等級由設定固定，快照照實記下模型、用量與請求編號（D-115）。沒有金鑰的家庭照舊用複製貼上。
- **做的代價**：
  - 新程式：套件約 1,500～2,500 行（含測試與固定的範例回應）；共用檢查要認得 `packages/`（約 200 行與它們的測試）。都有型別、lint 與測試。
  - 維護：廠商改 API 時要改那一種方言與它的範例回應；新模型、改價只改資料。價格會過期，資料寫明查價日期，畫面一律寫「估計」。
  - 四種方言在雲端只能用官方文件的例子測；真的連線要使用者用自己的金鑰在電腦跑一次冒煙測試（見〈10〉）。沒有那一家的金鑰，那一種方言就標「沒有實測」，不宣稱可用。
  - 繁瑣的部分（金鑰、選模型）放在設定頁一次做完，平時不打擾（[以一般使用者為準](../../apps/Cards/docs/product.md)）。
- **更小的做法**：
  1. **照 D-059 原案，只在 Cards 裡寫 OpenAI 相容的 Chat Completions 一種**：程式最少；但送 PDF、推理等級、用量的寫法各家在這個相容介面上都不一樣（Anthropic 的相容介面是測試用、功能少；OpenAI 新的模型與功能以 Responses 為主），最後還是要為各家寫例外；換廠商要改程式，也拿不到別的 repo。不採用。
  2. **先放在 `apps/Cards/` 裡，等第二個使用者再搬**：少改共用檢查；但使用者明說要拿到別的 repo，Capture 與入口網站也都會用到，晚一點搬一樣要改所有呼叫端的 import 與共用檢查，還要多搬一次。不採用。
  3. **直接用現成的多廠商套件（例如 Vercel 的 AI SDK）**：寫的格式程式最少、廠商會跟著更新。但它的大版本近兩年改過幾次、每次都有不相容的改動；串流要靠瀏覽器的 fetch，Obsidian 手機的 `requestUrl` 沒有串流；錯誤怎麼分類、證據怎麼收，我們還是要自己包一層；也帶不到別的程式語言。這份的做法是**對外介面自己定、裡面的引擎可以換**：自己的四個方言檔真的維護不來，可以把引擎換成那類套件，呼叫端（Cards）不用改。所以先自己寫，保留換引擎的路。

## 2. 範圍與步驟

| 步驟 | 內容 | 在哪做 | 審查 |
|---|---|---|---|
| 1 | `packages/ai-client/` 本體、四種方言、資料目錄、合格測試；共用檢查認得 `packages/`；寫成決定 | 雲端 | 合併前 L2（〈8〉） |
| 2 | Cards 接上：設定頁「AI 連線」、製卡與加深的「直接製作」、選教材檔、快照欄位、錯誤紀錄 | 另寫任務說明 | 開工前格式查核（快照欄位）；合併前 L2 |
| 3 | 真的連一次：使用者在電腦用自己的金鑰跑冒煙測試；之後用同一課比較模型，更新 [ai-models.md](../ai-models.md) | 本機、試作場 | — |

**這一份不做**（各有觸發點，記在 backlog）：手機直接呼叫（D-226 的手機製卡先照舊複製貼上；手機的 `requestUrl` 沒有串流、iOS 在背景會暫停 app，要另外驗）；入口網站與網頁版（金鑰放在瀏覽器或交給 Cloudflare 代管，跟網頁版一起定）；Capture；語音、產生圖片、工具呼叫、向量；先上傳檔案再引用的 Files API（教材重複送時省流量，觸發點：同一份教材一學期送超過三次的情況變常見）；發布到 npm（觸發點：別的 repo 要用、又不方便複製資料夾）。

## 3. 不可破壞的性質

1. **套件不認識呼叫它的人**：不 import Obsidian、Node 專用模組（除了〈4〉的 `node` 傳輸檔）、Essence 或任何軟體的程式；執行期零相依，只用標準的 `fetch`、`AbortController`、`TextDecoder`、`TextEncoder`。Node 24、瀏覽器、Electron、Cloudflare Workers 都能跑。
2. **對外只有入口檔**：`src/index.ts`（與兩個選用入口 `node`、`testing`）export 的就是全部公開介面；其他檔是內部，改了不算破壞。
3. **換廠商改資料、加方言加一個檔**：講四種方言之一的廠商只要一筆目錄資料（或家長在設定頁填「自訂」）；新方言是新增一個實作同一個介面的檔，跑同一套合格測試（〈7〉）。
4. **金鑰不存、不記、不外流**：金鑰每次由呼叫端交進來；不寫進結果、錯誤、紀錄與例外訊息（出現就換成 `***`）；只送到那一家設定的網址；不是 `https` 的網址只允許本機（`localhost`、`127.0.0.1`、`::1`，給 Ollama 這類本機模型）。
5. **純計算和 I/O 分開**：方言檔只做「組請求」「讀回應」「分類錯誤」的純函式；連線只在傳輸層。測試不必連網。
6. **結果與錯誤都是中立格式**：呼叫端不必知道是哪一家；每種錯誤有固定的種類、能不能重試、給使用者看的預設中文說明。
7. **證據交給呼叫端**：結果帶實際用的模型、請求編號、用量、時間與重試次數，呼叫端拿去存快照（D-115）；套件自己不寫檔。

## 4. 結構

```text
packages/ai-client/
├─ package.json        名稱、版號（semver）、exports（. ／ ./node ／ ./testing）、scripts；執行期零相依
├─ README.md           怎麼用、怎麼加一家、怎麼加一種方言、怎麼拿到別的 repo、版號規則
├─ CHANGELOG.md
├─ catalog.json        廠商與模型的資料（語言中立）：網址、認證方式、方言、限制、模型的能力與價格、查價日期
├─ src/
│  ├─ index.ts         唯一的公開入口
│  ├─ types.ts         中立的請求、結果、進度事件、能力
│  ├─ errors.ts        AiError、錯誤種類、遮蔽金鑰
│  ├─ client.ts        createAiClient：找端點 → 檢查能力 → 組請求 → 送出 → 串流與逾時 → 重試 → 結果
│  ├─ catalog.ts       讀 catalog.json、驗證、合併呼叫端加的廠商
│  ├─ estimate.ts      送出前估 token 與費用
│  ├─ sse.ts           串流事件的解碼（中文字被切在兩段之間也要對）
│  ├─ dialects/        openai-responses.ts、openai-chat.ts、gemini.ts、anthropic.ts、index.ts（登記表）
│  ├─ transports/      fetch.ts（預設）、node.ts（選用入口：node:https，桌面 Obsidian 用，沒有 CORS 問題、有串流）
│  └─ testing/         假的傳輸層與錄好的回應（選用入口，給呼叫端寫測試）
├─ fixtures/           每種方言的請求與回應範例（JSON 與 SSE 原文，語言中立）
├─ tests/              單元測試、合格測試（每種方言跑同一套情境）、傳輸層測試（本機的 HTTP 伺服器）
└─ tools/smoke.ts      冒煙測試：讀環境變數的金鑰，真的送一次小請求（只在使用者電腦跑，不進 CI）
```

Obsidian 的 `requestUrl` 傳輸層寫在 Cards（它 import `obsidian`）；套件提供傳輸層的介面與合格測試，Cards 的實作照同一套測。

## 5. 對外介面（草稿，實作時以測試為準）

```ts
import { createAiClient, isAiError } from 'ai-client';
import { nodeTransport } from 'ai-client/node';

const ai = createAiClient({ transport: nodeTransport() });   // 不給就用 fetch

const result = await ai.generate({
  endpoint: { provider: 'openai' },        // 目錄裡的廠商；或 { custom: { dialect: 'openai-chat', baseUrl: 'http://localhost:11434/v1' } }
  apiKey,                                   // 每次交進來，套件不存
  model: 'gpt-6.1-sol',
  instructions: '…',                        // 選填
  input: [{ role: 'user', content: [
    { type: 'text', text: prompt },
    { type: 'file', mediaType: 'application/pdf', name: 'U5.pdf', data: pdfBytes },
    { type: 'image', mediaType: 'image/jpeg', data: jpgBytes },
  ] }],
  reasoning: 'high',                        // off | low | medium | high | max；各家怎麼對應寫在目錄
  maxOutputTokens: 32_000,
  signal,                                   // 取消
  timeoutMs: 30 * 60_000,
  onProgress: event => { /* sent、waiting、text（累計字數）、retrying（第幾次、等幾秒、原因）、done */ },
});

result.text;        // 回覆全文
result.stopReason;  // end | length | content_filter | other（length 不算錯誤，呼叫端決定怎麼辦）
result.usage;       // inputTokens、outputTokens、reasoningTokens、cachedInputTokens（拿不到的是 null）
result.cost;        // { amount, currency: 'USD', estimated: true, pricesAsOf } 或 null
result.trace;       // provider、dialect、host、requestedModel、resolvedModel、requestId、startedAt、finishedAt、attempts、warnings

await ai.check({ endpoint, apiKey });       // 測試連線：金鑰對不對、能用哪些模型
await ai.listModels({ endpoint, apiKey });  // 廠商有提供清單的才有
ai.estimate(request);                       // 送出前估 token 與費用（估計值）
ai.capabilities(endpoint, model);           // 目錄裡的能力；不在目錄的模型回 unknown
```

- `generate` 失敗只丟 `AiError`（別的例外包成 `unknown`）；`isAiError(e)` 判斷。
- `input` 是訊息陣列，第一步 Cards 只送一則；之後要「請 AI 修正」時接著送，不用改介面。
- `catalog.json` 可以由呼叫端加廠商或蓋掉某些欄位（例如更新價格），不用等套件發新版。

## 6. 四種方言與目錄

| 方言 | 涵蓋 | PDF | 圖片 | 推理等級 | 串流 |
|---|---|---|---|---|---|
| `openai-responses` | OpenAI | `input_file` 的 base64，一次請求的檔案合計 50 MB 內；PDF 會抽文字也看頁面圖 | `input_image` | `reasoning.effort` | SSE |
| `openai-chat` | OpenRouter、DeepSeek、Groq、Mistral、xAI、Ollama、LM Studio，與任何「OpenAI 相容」 | `file` 部分（OpenRouter 支援；其他家照目錄的能力） | `image_url` 的 data URL | `reasoning_effort` 或該家自己的寫法（目錄寫） | SSE |
| `gemini` | Google AI Studio | `inline_data` | `inline_data` | `thinkingConfig`（目錄寫各模型的寫法） | SSE |
| `anthropic` | Anthropic | `document` 區塊的 base64 | `image` 區塊 | `thinking` 或 `effort`（目錄寫） | SSE |

- 每個方言檔開頭寫依據的官方文件網址與查的日期；欄位名稱與上限實作時照官方文件核對，表上的是規劃時的了解。
- OpenAI 送 `store: false`。不用 OpenAI 的背景模式：2026-07 有過「背景模式加檔案一直不結束」的問題（[社群回報](https://community.openai.com/t/responses-api-background-true-input-file-never-leaves-in-progress-sync-works-input-image-works/1386054)，兩天後回報恢復）；長時間的生成用串流撐。
- Anthropic 可以把很長、每課都一樣的規則標成可快取（`cache_control`），連做幾課時省錢；OpenAI、Gemini 會自動快取，不用標。請求帶 `cache: 'auto'` 時各方言自己處理，不支援的忽略並記一則 warning。
- **目錄的一筆廠商**：`id`、顯示名稱、方言、網址、認證（哪個標頭、要不要 `Bearer`）、固定標頭（例如 Anthropic 的版號）、申請金鑰的網址、限制（一次請求最大位元組、PDF 頁數上限）、模型清單。**一筆模型**：`id`、顯示名稱、能收的輸入（文字、圖片、PDF）、推理等級的對應、輸出上限、價格（每百萬 token 的輸入、輸出、快取輸入）與查價日期。推薦哪一個給製卡，不寫在套件裡，寫在 Cards 的資料，和 [ai-models.md](../ai-models.md) 同步。
- **自訂廠商**：選一種方言、填網址；能力未知，照送，錯誤照回應分類。

## 7. 行為細節與驗收（都寫成測試）

1. **送出前檢查**：模型在目錄裡、又不收 PDF 時，帶 PDF 的請求不連網就回 `unsupported_input`；請求大小超過那一家的上限回 `input_too_large`，訊息寫上限與這次的大小。不在目錄的模型不擋。
2. **串流與進度**：有串流的傳輸層一律串流；進度事件照順序 `sent` → `waiting` → `text`（0 次以上）→ `done`，重試時插 `retrying`。沒有串流的傳輸層（例如手機的 `requestUrl`）只有 `sent`、`waiting`、`done`，結果相同。
3. **中文不斷字**：一個中文字的位元組被切在兩段串流之間，收回的文字和一次收完的完全相同（合格測試用自編的中文句子，把每個位元組邊界都切一次）。
4. **逾時的結局**：整體逾時預設 30 分鐘、可改；沒有資料的閒置逾時預設關（推理模型思考時可能好幾分鐘沒有資料），呼叫端可以開。逾時或取消時：中止底層請求（傳輸層必須照 `signal` 中止）、丟 `timeout` 或 `cancelled`、不開下一次重試；之後才到的資料一律丟掉，不交給呼叫端。傳輸層不能中止的（`requestUrl`），寫進它的說明：請求可能還在跑、仍會計費，結果丟掉。
5. **重試**：只在還沒收到任何回覆文字、錯誤種類可重試時重試（〈錯誤種類〉表）；最多共 3 次；等 2 秒、8 秒，各加減 20% 的隨機；有 `Retry-After` 照它，但最多 60 秒；等待中取消就立刻停。`timeout`、`quota`、`auth`、`invalid_request`、`content_blocked` 不重試（長時間的生成重送一次就多付一次錢）。收到部分文字後斷線，丟 `network` 並把收到的文字放在錯誤的 `partialText`，由呼叫端決定。
6. **停止原因**：各家的結束原因對應成 `end`、`length`（輸出上限到了）、`content_filter`、`other`，原文放在 `trace`。
7. **錯誤種類**：

   | 種類 | 例子 | 可重試 | 預設的說明（呼叫端可換） |
   |---|---|---|---|
   | `auth` | 401、金鑰錯或過期 | 否 | 金鑰不對或已失效，請到設定頁重新貼上 |
   | `permission` | 403、這把金鑰不能用這個模型、地區不支援 | 否 | 這把金鑰不能用這個模型 |
   | `quota` | 餘額不足、免費額度用完 | 否 | 額度用完了，等額度恢復或到服務的網站加值 |
   | `rate_limit` | 429 短時間太多次 | 是 | 送得太快，稍等一下再試 |
   | `overloaded` | 503、529、Gemini 忙線 | 是 | 服務忙線中 |
   | `server` | 其他 5xx | 是 | 服務暫時出錯 |
   | `network` | 連不上、斷線 | 是（還沒收到文字時） | 網路連不上 |
   | `timeout` | 超過整體或閒置逾時 | 否 | 等太久了 |
   | `cancelled` | 呼叫端取消 | 否 | 已取消 |
   | `invalid_request` | 400 其他 | 否 | 請求格式不對（附原因） |
   | `input_too_large` | 檔案或請求超過上限 | 否 | 教材太大（附上限） |
   | `unsupported_input` | 模型不收 PDF 或圖片 | 否 | 這個模型不能讀 PDF |
   | `model_not_found` | 404、模型名稱打錯或下架 | 否 | 找不到這個模型 |
   | `content_blocked` | 安全過濾擋下 | 否 | 內容被服務擋下 |
   | `unknown` | 其他 | 否 | 未知的錯誤（附狀態碼） |

   `quota` 和 `rate_limit` 都可能是 429，照各家回應的錯誤代碼分（例如 OpenAI 的 `insufficient_quota`）；分不出來時算 `rate_limit`，重試用完仍失敗時訊息加一句「如果一直這樣，可能是額度用完」。每種方言用錄下或官方文件的錯誤回應各測一次。
8. **金鑰**：合格測試在每一種錯誤、每一種結果的 `JSON.stringify` 與例外訊息裡找不到測試用的金鑰字串；`http://` 的遠端網址在送出前就擋（`invalid_request`）；送出的請求只帶那一家設定的認證標頭。
9. **用量與費用**：各家的用量欄位對應成同一組；拿不到的寫 `null`，不寫 0。費用只在模型有價格時算，`estimated: true`、帶查價日期。
10. **目錄驗證**：`catalog.json` 讀進來時驗格式（每一筆廠商的方言要在登記表裡、網址是 `https` 或本機、價格是非負數、查價日期是合法日期）；壞掉的那一筆跳過並回報，不讓整個套件不能用。
11. **合格測試**：每一種方言都跑同一張情境表：純文字、文字加圖片、文字加 PDF、串流成功、非串流成功、輸出上限、401、429 帶 `Retry-After` 後成功、500 兩次後成功、內容被擋、串流中途取消、串流格式壞掉、中文斷字。新增方言時這張表自動套上。

## 8. repo 要改的地方（第一步）

- **新類別 `packages/`**：放軟體共用的套件。`tools/apps.ts` 加一張 `PACKAGES` 表（現在只有 `ai-client`）。
- **import 規則**（改 [D-208](../decisions.md#d-208-三個外掛在同一個-repo-開發每個外掛有自己的資料夾) 第 10 點，寫進新決定）：軟體之間照舊不 import；軟體可以用 `package.json` 的 `file:../../packages/<名稱>` 相依表上的套件，程式寫套件名稱（`import … from 'ai-client'`），不寫相對路徑；套件不 import 軟體、別的套件與最上層的程式。`tools/check-app-imports.ts` 照這條擋，測試補上。
- **分派表與 CI**：改到 `packages/<名稱>/`，跑那個套件的完整檢查，加上 `package.json` 相依它的軟體的完整檢查；`check.yml` 與 gate 認得新的對象；`tools/tests/` 補分派的測試。
- **雲端環境**：`.claude/hooks/cloud-setup.mjs` 在有相依的套件資料夾 `npm ci`（套件的開發相依：TypeScript、ESLint）；照 [quality.md〈本機或雲端〉](../agents/quality.md#本機或雲端) 改這支要另開雲端 session 驗兩件事。
- **文件**：[architecture.md〈repo 結構〉](../architecture.md#9-repo-結構-d-208) 的樹與表加 `packages/`；套件的 README。
- **審查**：共用檢查與 CI 屬高風險，合併前 L2。雲端叫不到 Codex，照 quality.md 由 Claude 開沒參與實作的子代理審（L3），哪個模型先問使用者；或推分支回本機請 Codex 審。

## 9. 拿到別的 repo

- **現在**：複製整個 `packages/ai-client/` 資料夾就能用（零相依）；版號看 `package.json`，CHANGELOG 寫每一版改了什麼、有不相容時怎麼改呼叫端。也可以用 `file:` 或 git 相依。
- **之後**：別的 repo 真的要用、又不方便複製時，發布到 npm（觸發點記在 backlog）。
- **別的程式語言**：`catalog.json` 與 `fixtures/` 是語言中立的 JSON 與 SSE 原文，用別的語言重寫時，同一套合格情境與範例可以直接拿去測。
- **版號**：semver。公開介面只看入口檔的 export；改了已 export 的型別或行為的意思，就升大版號並在 CHANGELOG 寫怎麼改。knip 擋沒用到的 export。

## 10. 測試與實測

- 單元與合格測試全部離線（假的傳輸層、錄好的回應、本機的 HTTP 伺服器測傳輸層），CI 跑。
- 範例回應的來源標兩種：「官方文件」與「實測錄下」。第一步只有官方文件的；第三步使用者跑冒煙測試時加 `--record`，把回應遮掉金鑰與請求編號後存成「實測錄下」的範例（只存自編的內容，不存課本）。
- **冒煙測試**（使用者電腦）：`npm run smoke -- --provider openai --model <模型>`，金鑰讀環境變數 `AI_KEY_<廠商>`；送一段自編的短文與一頁自編的 PDF，印出結果、用量與費用。每一家跑過才在 README 標「已實測（日期、模型）」。
- **測試分兩類**（D-195）：這一步不寫使用者的檔；金鑰外流歸第 1 類，合併前做足。沒有延後的測試（實作時發現要延後的，照 quality.md 記進最上層的技術債）。

## 11. 第二步（Cards 接上）先記下的重點

另寫任務說明，這裡只記已經看到的：

- **設定頁「AI 連線」**（每台裝置自己的，不進 vault，D-039）：選廠商（目錄＋自訂）、貼金鑰、選模型（推薦的放最上面，也能從服務讀清單）、推理等級、「測試連線」。每一家的金鑰分開存，換來換去不用重貼。
- **金鑰存哪裡**：Obsidian 1.11.4 起有 `SecretStorage`（[說明](https://docs.obsidian.md/plugins/guides/secret-storage)）：存在本機、照 vault 分開，但設計上別的外掛可以用名稱讀到；手機上有不同 vault 會互相蓋掉的回報（[論壇](https://forum.obsidian.md/t/secretstorage-appears-to-be-shared-across-vaults-on-mobile-but-vault-scoped-on-desktop/117793)）。Cards 的 `minAppVersion` 是 1.8.7，舊版要退回 `saveLocalStorage`。第二步定；不論哪一種，都不宣稱和其他外掛隔離（Cards [architecture §6](../../apps/Cards/docs/architecture.md#6-ai-的位置-細節之後專門討論)）。
- **教材**：製卡畫面選檔（PDF 或照片）；PDF 要不要只送某幾頁（切頁要多一個套件，或用 Obsidian 內建的 pdf.js 轉成圖片）、檔太大時怎麼縮，第二步定。
- **流程**：「直接製作」的回覆走和貼回完全一樣的整理、檢查、存草稿與啟用；快照的 `接法` 寫 API、`服務` 寫廠商、`模型` 照實寫，另加推理等級、用量、請求編號（要格式查核）。
- **畫面**：送出中顯示經過的時間與收到的字數、可以取消；錯誤照種類給一句說明與下一步。
- **Obsidian 的傳輸層**：桌面用套件的 `node` 傳輸層（沒有 CORS、有串流）；`requestUrl` 版跟手機一起做。

## 12. 待決（不擋第一步）

- 套件名稱：先叫 `ai-client`，要改在第一步合併前改。
- 推薦哪一家、哪個模型給製卡：第三步比較後更新 [ai-models.md](../ai-models.md)（現在的推薦是 10 月轉錄稿時代測的，教材改成直接附 PDF 後要重測）。

## 13. 要寫的決定

- **只接 API、取消訂閱接法**：使用者 2026-11-25 已決定。修改 D-126 第 1、5、7 點；D-126 第 2～4 點（按鈕送出、Claudian 的通用支援、證據範圍）不變。現行文件（Cards 的 product、architecture、backlog 的驗證表與「沒有 API 金鑰的家庭太繁瑣」那一列、syntax §6 提到訂閱的句子）刪掉訂閱接法；決定與討論稿照 [D-143](../decisions.md#d-143-歸檔原則每類文件都有終點不設字數上限) 不刪，狀態行指向新決定。
- **AI 連線模組**：這份的〈3〉〈4〉〈6〉〈8〉〈9〉；修改 D-059（一種介面 → 四種方言的共用套件）與 D-208 第 10 點（`packages/` 的例外）。等 Fable 審完、使用者看過再寫。

## 結果

延後的測試：（實作後填）
