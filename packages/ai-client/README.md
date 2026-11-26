# essence-ai-client

一個不認識呼叫它的人的小套件：用同一種寫法呼叫各家 AI 的文字生成 API（可附 PDF 與圖片），交回同一種結果與錯誤。執行期零相依，只用標準的 `fetch`、`AbortController`、`TextDecoder`、`TextEncoder`。設計與決定見 repo 的 [docs/tasks/ai-client.md](../../docs/tasks/ai-client.md)。

狀態：0.x，介面還可能改；改動寫在 [CHANGELOG.md](CHANGELOG.md)。

## 能接哪些服務

市面上的 AI API 幾乎都講下面四種格式之一（這裡叫「方言」）。講同一種方言的服務只要一筆資料（[catalog.json](catalog.json)，或呼叫端加的），不用改程式。

| 方言 | 涵蓋 | 實測 |
|---|---|---|
| `openai-responses` | OpenAI | 沒有（雲端環境連不到；範例照官方文件） |
| `openai-chat` | OpenRouter、DeepSeek、Groq、Mistral、xAI、Ollama、LM Studio 等「OpenAI 相容」 | 沒有（同上） |
| `gemini-generate-content` | Google AI Studio（Gemini） | 2026-11-25 用假金鑰確認網址與錯誤分類 |
| `anthropic-messages` | Anthropic Claude | 2026-11-25 用假金鑰確認網址與錯誤分類 |

「沒有實測」的方言不宣稱可用；真的金鑰跑過 `npm run smoke` 才改成已實測（日期、模型）。

## 怎麼用

```ts
import { createAiClient, describeAiError, isAiError } from '<這個資料夾>/src/index.ts';

const ai = createAiClient();            // 預設用執行環境的 fetch
const result = await ai.generate({
  endpoint: { provider: 'openai' },     // 目錄裡的廠商；或 { custom: { dialect: 'openai-chat', baseUrl: 'http://localhost:11434/v1', auth: null } }
  apiKey,                                // 每次交進來，套件不存
  model: 'gpt-5.6-terra',
  instructions: '每次都一樣的長規則',
  input: [{ role: 'user', content: [
    { type: 'file', mediaType: 'application/pdf', name: 'U5.pdf', data: pdfBytes },
    { type: 'text', text: '照教材出題' },
  ] }],
  reasoning: 'high',                     // off | minimal | low | medium | high | xhigh | max
  maxOutputTokens: 32_000,
  signal,                                // 取消
  onProgress: e => { /* sent、waiting、text（delta、totalChars）、retrying、done */ },
});
result.text; result.stopReason; result.usage; result.cost; result.trace;

const check = await ai.check({ endpoint: { provider: 'openai' }, apiKey });   // 測試連線，不花錢
```

- 失敗一律丟 `AiError`：`kind`（`auth`、`quota`、`rate_limit`、`overloaded`、`network`、`timeout`、`cancelled`、`input_too_large`、`content_blocked`…）、`retryable`、`afterResponse`、`partialText`、`retryAfterMs`、`requestId`。`describeAiError(error)` 給一句中文（或 `'en'`）。
- 自動重送只在**還沒拿到成功的回應**時（連不上、429、5xx）：最多 3 次，等 2 秒、8 秒；服務要等超過 60 秒就不重送。拿到 200 之後才出錯（串流中斷、串流裡的錯誤）不自動重送，`afterResponse: true`，由呼叫端問使用者。
- 金鑰不進結果、錯誤與訊息；只送到那一家的網址；網址只准 `https` 或本機的 `http`（`localhost`、`127.0.0.1`、`::1`）；不跟轉址。
- 費用照目錄的牌價估計（不含免費額度），標 `estimated` 與查價日期；服務自己回報金額的（OpenRouter）用回報的。
- 要用某家還沒包進來的參數：`extraBody`（深層合併進請求本文）、`extraHeaders`。

## 換傳輸層

`createAiClient({ fetch })` 收一個和標準 `fetch` 同形狀的函式，回傳標準的 `Response`。例如 Obsidian 的 `requestUrl` 可以包成這個形狀；它要等整段本文收完才交出，所以同時設 `responseTimeoutMs: null`。請求一律要求服務串流（連線不會因為久沒資料被切斷），不串流的傳輸層一樣能讀，只是文字最後一次才到。

傳輸層要表示失敗就丟例外，丟什麼都可以，但不要自己丟 `AiError` 指定種類：套件只相信自己做的錯誤，傳輸層丟的任何值（連 `AiError`）都照套件看到的狀態處理。拿到 2xx 之前丟的算 `network`、照規則重送；拿到 2xx 之後（讀本文時）丟的標 `afterResponse`、不自動重送，請求編號用回應標頭的。

## 加一家、加一種方言

- **講四種方言之一的服務**：在 `catalog.json` 加一筆廠商（或呼叫端用 `createAiClient({ catalog: { providers: [...] } })` 加），寫方言、網址、認證標頭、上限與模型。各家相容服務的差異寫在 `options`（`maxTokensField`、`streamUsage`、`systemRole`、`checkPath`，見 `src/types.ts`）。
- **新方言**：在 `src/dialects/` 加一個實作 `Dialect` 的檔、登記到 `src/dialects/index.ts`，再加 `fixtures/<方言>/`（`case.json` 與幾段 SSE 原文）。`tests/conformance.test.ts` 的情境表自動套上；登記了卻沒有範例，測試會失敗。

## 拿到別的 repo

- 複製整個資料夾。原始碼是 TypeScript，用 `.ts` 副檔名 import：使用端要用打包工具（esbuild 等），或 Node 22.18 以上直接執行；tsconfig 要開 `allowImportingTsExtensions`。
- 不要放進 `node_modules`（git 相依、npm 發布、`file:` 相依都會）：Node 不在 `node_modules` 裡執行 `.ts`。用相對路徑 import 入口檔。
- `catalog.json` 與 `fixtures/` 是語言中立的 JSON 與 SSE 原文，用別的語言重寫時可以拿同一套情境測。
- `package.json` 寫 `"private": true`：npm 上沒有發布這個套件，`npm install` 同名的東西裝到的不是它。

## 指令

```sh
npm ci
npm run check     # 型別、lint、knip、測試（全部離線）
AI_KEY_OPENAI=… npm run smoke -- --provider openai --model gpt-5.6-terra   # 真的連一次（只在自己的電腦）
```

## 版號

semver，0.x 期間小版號也可能不相容（寫在 CHANGELOG）。公開介面只看 `src/index.ts` 與 `src/testing.ts` 的 export。字串聯集（`StopReason`、`AiErrorKind`、進度事件的 `type`、方言 id）之後會加成員，呼叫端的 `switch` 要有 `default`。
