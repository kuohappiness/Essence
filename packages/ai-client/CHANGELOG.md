# Changelog

## 0.1.0（未發布）

- 第一版：`createAiClient` 的 `generate`、`check`、`providers`；四種方言（`openai-responses`、`openai-chat`、`gemini-generate-content`、`anthropic-messages`）；`catalog.json`（schemaVersion 1）；`testing` 入口的 `mockFetch` 與 `sse`。
- Gemini（`gemini-generate-content`）預設不另外限時等回應標頭，只照整體期限：它想完才送標頭，冒煙測試量到 116～185 秒，原本的 120 秒會把正常的請求算成 `timeout`。呼叫端給了 `responseTimeoutMs` 照給的。
- 傳輸層丟的 `AiError` 不再原樣交出：和其他丟出來的值一樣，拿到 2xx 之前算 `network`（會重送），之後標 `afterResponse`（不重送）。轉接層若曾丟 `auth`、`timeout` 這類 `AiError` 指定種類，現在會當成 `network`。
