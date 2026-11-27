# Changelog

## 0.1.0（未發布）

- 第一版：`createAiClient` 的 `generate`、`check`、`providers`；四種方言（`openai-responses`、`openai-chat`、`gemini-generate-content`、`anthropic-messages`）；`catalog.json`（schemaVersion 1）；`testing` 入口的 `mockFetch` 與 `sse`。
- Gemini（`gemini-generate-content`）預設不另外限時等回應標頭，只照整體期限：它想完才送標頭，冒煙測試量到 116～177 秒，原本的 120 秒會把正常的請求算成 `timeout`。呼叫端給了 `responseTimeoutMs` 照給的。
- 新增 `estimate(request, { pdfPages, images, expectedOutputTokens })`：送出前照牌價估最少與最多的費用，不呼叫服務；目錄的廠商與模型多一個選填的 `mediaTokens`（每頁 PDF、每張圖的 token 範圍），OpenAI、Anthropic、Google 已填。
- 傳輸層丟的 `AiError` 不再原樣交出：和其他丟出來的值一樣，拿到 2xx 之前算 `network`（會重送），之後標 `afterResponse`（不重送）。轉接層若曾丟 `auth`、`timeout` 這類 `AiError` 指定種類，現在會當成 `network`。
- `catalog.json` 的廠商名稱改成一般人認得的產品名稱：`ChatGPT`、`Claude`、`Gemini`（`OpenRouter` 不變），代號不變（D-242）。
