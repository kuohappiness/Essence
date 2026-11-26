# AI 連線模組的設計審查（請 Fable 5.2 xhigh）

狀態：已結案｜完成：Fable 回報 19 項，Claude 照它改設計與程式（見〈Claude 回應〉），任務說明已改寫；合併前另做 L2｜等誰：—

來自 [AI 連線模組的任務說明](../tasks/ai-client.md)。基準：分支 `claude/project-thread-q0jv5f` 的 `56a7ce26`（任務說明的第一版）。使用者 2026-11-25 要「規劃好之後請 fable 5.2 xhigh 想一下，我們不等，規劃好就來做」，所以 Claude 送審後就開始寫程式，回報到了再照它改。

## 請 Fable 審什麼

讀任務說明全文，站在「長遠擴充、可換廠商、能拿到別的 repo」的角度找問題：對外介面之後會不會被迫破壞相容、四家 API 的事實對不對、重試與逾時會不會害家長多付錢、和 repo 的共用檢查（pre-commit 的暫存副本、分派表、CI）會不會衝突、和現有決定有沒有矛盾。可以查官方文件、在暫存資料夾做最小重現，不改 repo 的檔。

## Fable 5.2 xhigh 的回報

下面是回報原文；只把兩個本機路徑改成 repo 相對的寫法，標題降一級。

獨立審查｜Fable 5.2 xhigh

方向站得住：自己寫方言、資料和程式分開、放 `packages/` 都對。最大的兩個問題在 repo 這一側：照任務說明用 `file:` 相依，pre-commit 會讀到工作樹而不是暫存內容（已重現）；套件名 `ai-client` 在 npm 上是別人的套件。
對外介面有幾處現在不留、之後一定破壞相容：用量的語意、推理等級、逃生口、可接回下一輪的助理訊息、傳輸層的形狀。重試規則也會讓家長重複付推理的錢。

審的是 `docs/tasks/ai-client.md`。沒有改任何檔、沒有 commit。

### 發現（依嚴重度）

#### 1. `file:` 相依讓 pre-commit 讀到工作樹的套件
- **問題**：〈8〉要 Cards 用 `file:../../packages/ai-client`。npm 會在 `apps/Cards/node_modules/` 建一個連結；`tools/hooks.ts` 的 `stagedCopy` 又把副本的 `node_modules` 整個連回工作樹，所以副本裡的 Cards 檢查讀到的是工作樹的套件。
- **重現**：最小 repo 放在那個 session 的暫存資料夾（沒有留下）。副本裡跑測試印出工作樹版；改成相對路徑 import，印出暫存版。
- **為什麼重要**：破壞「檢查讀到的就是要 commit 的內容」；沒 stage 的套件修改會讓該擋的 commit 通過。同一次也測到兩件事：
  - 套件版號改了，`npm ci` 不報錯，Cards 的鎖檔悄悄過期。
  - 套件一旦被複製進 `node_modules`（git 相依、tarball、npm 發布），Node 直接拒跑 `.ts`（`ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING`）。〈9〉寫的「也可以用 git 相依」在 Node 裡不成立。
- **建議**：Cards 不走 npm 相依。在 Cards 放一個轉接檔，用相對路徑 import 套件入口，其他檔只 import 轉接檔。
  - `check-app-imports.ts` 加一條放行：只准指到表上套件的入口檔。
  - Cards 的 ESLint 邊界規則與 knip 跟著放行。
  - 不論選哪種做法，`tools/tests/hooks.test.ts` 加一條驗收：暫存一個會讓 Cards 測試失敗的套件修改、工作樹是好的，pre-commit 必須失敗。
- **把握**：高。Windows 的 junction 沒測，方向相同。

#### 2. 套件名 `ai-client` 已是 npm 上別人的套件
- **問題**：今天查 registry，`ai-client@1.0.4` 是「An AI client for using OpenAI ChatGPT API」。
- **為什麼重要**：`file:` 寫錯，或別的 repo 照 README 打 `npm install ai-client`，裝到的是陌生人的程式，金鑰就交給它。
- **建議**：合併前改成沒被佔用的名稱，或使用者自己擁有的 scope（`@essence` 目前查不到套件，但 scope 屬於誰要另查）。`package.json` 寫 `"private": true`，到真的要發布才拿掉。照發現 1 改用相對路徑，repo 內就完全不經過 npm 解析名稱。
- **把握**：高。

#### 3. 會寫進設定與快照的識別字和語意，現在就要定（D-195）
- **方言 id 用協定命名**：`openai-responses`、`openai-chat`、`anthropic-messages`、`gemini-generate-content`。Google 現在有兩套 API，`gemini` 這個名字之後會撞。
- **用量的語意各家不同**，「對應成同一組」不夠，要寫定義，否則快照裡的數字跨廠商不能比、費用算錯，第三步的模型比較也跟著錯：
  - Anthropic 的 `input_tokens` 只是沒快取的部分，總輸入是三個欄位相加；OpenAI 的含快取。
  - OpenAI 的 `output_tokens` 含推理；Gemini 的 `candidatesTokenCount` 不含思考（Gemini 這一點是記憶）。
  - 建議定義：`inputTokens` 是全部輸入，`cachedInputTokens` 是其中快取讀到的，另加 `cacheWriteInputTokens`；`outputTokens` 是全部計費輸出，`reasoningTokens` 是其中的推理。
- **推理五級不夠**：
  - Anthropic 的 `xhigh` 和 `max` 是兩級，專案自己的實驗也寫「Sol xhigh」。
  - `off` 在 Opus 5.5、Fable 5.x 會被 400（不能關思考）。
  - 各模型不給時的預設也不同（Opus 5.5 是 medium）。
  - 建議：中立等級加 `minimal`、`xhigh`；對不上時選一種規則寫死（取最近一級加 warning，或報錯）；`trace` 記實際送出的參數原文，沒指定就記「未指定」。
- **把握**：高。Anthropic 部分有官方參考資料；OpenAI 的等級名稱是記憶。

#### 4. 對外介面缺的幾樣，之後補會破壞相容
- **逃生口**：`extraBody`、`extraHeaders`，原樣併進請求。沒有它，每個新參數（OpenRouter 的 PDF 引擎、`service_tier`、beta 標頭）都要等套件改版。這是「長遠擴充」最值錢的一條。
- **可接回下一輪的助理訊息**：結果除了 `text` 再給 `message`，可以原樣放回 `input`，裡面允許只有同方言看得懂的不透明區塊。多輪加工具時，Anthropic 的 thinking 區塊、Gemini 的 thought signature、OpenAI 的 reasoning item 都要原樣帶回。
- **會增加的集合**：進度事件、`stopReason`、錯誤種類寫明「之後會加成員、算小版號，呼叫端必須有 default 分支」。`text` 事件帶 `delta`，不只累計字數。`stopReason` 現在就加 `refusal`。
- **檔案來源留聯集**：`data`、`fileId`、`url`。
- **端點**：`endpoint` 一律是解析後的物件，目錄提供查詢函式，「自訂」就不是特例。`apiKey` 選填（Ollama；入口網站之後走自己的代理）。
- **把握**：中高。

#### 5. 傳輸層改成「和 fetch 相容的函式」，body 用 bytes
- **問題**：〈4〉是自訂傳輸介面，Cards 還要另寫 `requestUrl` 版。
- **為什麼重要**：四家官方 SDK 與 AI SDK 都接受注入自訂 `fetch`。傳輸長成 fetch 的樣子，「引擎可換」才真的成立，別的環境的 fetch 也直接能用。
- **建議**：`transport` 就是 `(url, init) => Promise<Response>`；`requestUrl` 版與 `node:https` 版各自包成回 `Response`。請求 body 直接組成 `Uint8Array`，base64 直接編成位元組，不經過 JS 字串。50 MB 的 PDF 峰值約 2.3 倍；現在的寫法約 4 到 5 倍，手機會爆。
- **把握**：中高。

#### 6. 和 D-148 衝突，而且「桌面要 node:https 才沒有 CORS」可能不成立
- **問題**：D-148 第 1 點明寫「API 直連用 Obsidian 的 `requestUrl`」。`apps/Cards/tools/build.mjs` 只准 `src/desktop/` 引入明列的 Node 模組，從 Cards import 套件的 `node` 傳輸層會讓建置失敗。任務說明沒提 D-148。
- **CORS**：OpenAI、Gemini 原生端點、OpenRouter 都開 CORS；Anthropic 加 `anthropic-dangerous-direct-browser-access: true` 也可以。那麼 `fetch` 在桌面與手機都能串流，`node:https` 只為 Ollama 這類不開 CORS 的端點。
- **建議**：
  - 第一步的套件只出 fetch 傳輸，〈3〉第 1 點的 Node 例外就能拿掉。
  - 第二步預設用 `fetch`。
  - `node:https` 版延後；要做就放 Cards 的 `src/desktop/`，或明寫修改 D-148。
  - 先用金鑰在 Obsidian 開發者主控台各打一次確認。
- **把握**：D-148 衝突高；CORS 中（依記憶與搜尋結果，沒實測）。

#### 7. 重試規則會讓家長重複付錢
- **問題**：〈7-5〉寫「還沒收到任何回覆文字就可重試」。推理模型可能想了十分鐘、還沒出字就斷線，自動重送等於再付一次推理的錢。
- **建議**：
  - 只在還沒拿到 2xx 回應標頭時自動重試（連不上、429、5xx、529）。
  - 拿到 200 之後斷線一律不自動重試，錯誤標 `retryable: true`，由呼叫端問家長。
  - `Retry-After` 超過上限就不重試，把秒數放進錯誤（D-072 要告訴家長什麼時候恢復）。
- **把握**：高。

#### 8. 合格情境表漏了「串流沒有結束事件就結束」
- **問題**：連線正常關閉，卻沒有 `response.completed`、`message_stop`、`[DONE]` 或 `finishReason`。這是複製貼上時代「沒寫完就複製」的 API 版，現在會被當成成功。
- **建議**：每種方言定義結束事件，沒看到就丟 `network` 並帶 `partialText`。情境表再加：
  - SSE 註解行（OpenRouter 的 keepalive）
  - CRLF 與多行 `data:`
  - HTTP 200 但內容是錯誤（OpenAI 的 `response.failed`、Anthropic 與 OpenRouter 串流中的 error）
- **把握**：高。

#### 9. 錯誤種類表的事實問題
- **Anthropic**（官方參考資料，把握高）：
  - 餘額不足是 402 `billing_error`。
  - 月花費上限是 429 但不可重試，沒有 `retry-after`，`error.details.error_code` 是 `enforced_spend_limit_reached`。
  - 模型不能用和名稱打錯都是 404。
  - 超過 context 是 400「prompt is too long」；請求太大是 413。
  - 拒答是 HTTP 200 加 `stop_reason: refusal`。
- **Gemini**（記憶，把握中高）：金鑰錯是 HTTP 400（`API_KEY_INVALID`），不是 401；地區不支援是 400。被擋有兩種：`promptFeedback.blockReason`（完全沒有輸出）與 `finishReason` 的 `SAFETY`、`RECITATION`。課本內容特別容易碰到 `RECITATION`。
- **建議**：
  - 分類看回應內容，不只看狀態碼。
  - 寫明：完全沒有輸出算錯誤 `content_blocked`；有部分輸出算結果，`stopReason` 是 `content_filter` 或 `refusal`。
  - 超過 context window 併入 `input_too_large` 或另立一種，不要落到 `invalid_request`。

#### 10. 逾時與非串流
- **問題**：閒置逾時關著時，連不上要等滿 30 分鐘才知道。〈7-2〉說非串流傳輸「結果相同」，但十幾分鐘沒有任何位元組的連線很容易被中間設備切斷，Anthropic 也要求大輸出用串流。
- **建議**：加「回應標頭逾時」（串流時 60 到 120 秒沒拿到狀態碼就算連不上，可重試）。非串流改寫成限制：只適合短的生成。手機要走 `fetch` 串流，不是 `requestUrl`。
- **把握**：中高。

#### 11. 目錄的切法
- **問題**：廠商資料（網址、認證、方言、上限）幾年不變；模型資料（能力、價格、推理對應）幾個月就變。全放套件，會和 `docs/ai-models.md`、Cards 的推薦資料變成三處（D-141）。
- **建議**：
  - 套件留廠商表與模型資料的格式和計算；模型只附一小份標日期的種子，主檔在 Cards。
  - 目錄加 `schemaVersion`，因為「自訂廠商」會存在使用者設定。
  - 「模型不收 PDF 就不送」的檢查要能由呼叫端關掉，目錄過期時才不會誤擋。
  - `openai-chat` 的各家差異做成明列欄位：`max_tokens` 或 `max_completion_tokens`、串流要不要 `stream_options.include_usage`、system 或 developer 角色、PDF 寫法、推理寫法。
- **把握**：中高。

#### 12. 費用估計不能是一個數字
- **問題**：
  - PDF 的 token 要知道頁數，套件不解析 PDF 就不知道；〈7-1〉的頁數上限檢查同樣做不到。
  - 推理 token 算輸出價，而且不可預測。
  - `ai-models.md` 推薦的 OpenAI 資料分享有每日免費額度，超過的那一筆整筆計價。
- **建議**：`estimate` 回範圍與假設；頁數與預期輸出量由呼叫端給；畫面寫「照牌價估計，不含免費額度」。之後可接各家免費的 count tokens 端點。
- **把握**：高。

#### 13. `cache: 'auto'` 對 Cards 是反效果
- **問題**：Anthropic 的自動快取把斷點放在最後一個區塊。每課不同的 PDF 與任務段在最後，等於每次多付 1.25 倍寫入、永遠讀不到。TTL 從請求開始算 5 分鐘，一課生成超過 5 分鐘，下一課就讀不到；1 小時 TTL 的寫入是 2 倍。
- **建議**：第一步不做 `cache`。之後做成「到這個區塊為止可快取」的標記，放在 `instructions` 或某個 content part。第二步組請求時，規則放 `instructions`、PDF 放在文字前面（Anthropic 官方建議）。
- **把握**：高。

#### 14. 安全細節
- `fetch` 傳輸設 `redirect: 'error'`：跨站轉址時，瀏覽器不會拿掉 `x-api-key`、`x-goog-api-key` 這類自訂標頭。把握高。
- Gemini 金鑰只走標頭，不走 `?key=`。
- `baseUrl` 用 `new URL()` 解析後比對 hostname，擋 `localhost.evil.com` 與帶帳密的網址。
- 家裡另一台電腦跑 Ollama（`http://192.168.x.x`）現在會被擋。要不要給呼叫端一個明確開關，請定下來。
- 測試用的假金鑰要避開 secretlint 的樣式。`--record` 用白名單留欄位：OpenAI 回應標頭帶 organization 與 project，屬於 AGENTS.md 底線。

#### 15. 範圍與順序
- **拆兩次合併**：先「repo 認得 `packages/`」加空殼套件（高風險、要 L2、但很小），再套件本體。
- **真的連線提前到 Cards 接上之前**：範例回應和實作是同一個 Claude 照同一份文件寫的，全綠也可能和真的 API 對不上。雲端環境若能放一把有上限的金鑰並開放那幾個網域，AI 自己就能跑。
- **四種方言分兩批寫**：四家先在紙上對到中立型別（任務說明加一張對照表）。第一批是 `openai-responses`（現在的首選）與 `gemini-generate-content`（免費入門），冒煙測過再做 `openai-chat` 與 `anthropic-messages`。`ai-models.md` 現在沒有推薦 Anthropic 直連，它最不急。
- **第一步的公開介面縮小**：只留 `generate`、`check`、目錄與錯誤。`estimate`、`listModels`、`capabilities` 等第二步真的要用再開。
- **版號**：維持 0.x，Cards 上線加兩家實測後才 1.0.0。
- **行數**：含測試與範例回應，我估 4,000 行以上，L2 的量要照這個算。
- **把握**：中。

#### 16. Gemini 用 generateContent
- **今天查到的**：Google 把 generateContent 的頁面標「Legacy」，但寫「remains fully supported」。Interactions 的文件仍寫 Beta，並建議穩定部署繼續用 generateContent；它五月有過破壞性改動，預設會存對話（`store=true`），文件自己不一致（`v1beta` 與 `v1beta2`、`type` 與 `event_type`）。
- **建議**：第一步用 generateContent，之後另加 `gemini-interactions` 方言並送 `store: false`。
- **把握**：中高。

#### 17. 自己寫方言，還是用現成套件
- **結論**：同意自己寫。
- **補強理由**：金鑰經過的程式零第三方相依（外掛在桌面有完整 Node 權限）；需要的範圍小，而且是各家最穩的部分。
- **提醒**：「引擎可換」只在發現 5 成立時才成立，不必再為它多花設計。真正的保險是範例回應加合格測試。
- **把握**：中高。

#### 18. `packages/` 的 repo 風險
- **共用檢查**：`check-app-imports.ts` 現在完全不掃 `packages/`，要加三條：套件不能用相對路徑出自己的資料夾、不能有本機相依、要在表上。
- **寫死對象清單的地方**：`dispatch.ts`、`ci-gate.ts`、`check.yml`、`cloud-setup.mjs` 等 15 個檔。
- **分派**：套件改動對到哪些軟體，建議用明列的表（像 `SHARED_SPECS`），再加一條檢查確認表和實際 import 一致。
- **〈9〉的使用條件要寫清楚**：使用端要 Node 22.18 以上或打包工具，tsconfig 要 `allowImportingTsExtensions`，不能放進 `node_modules`。
- **把握**：高。

#### 19. 較小的
- `maxOutputTokens` 各家都含推理 token；Anthropic 的 `max_tokens` 必填，沒給時要有預設。
- `trace` 改成每次嘗試一筆（時間、狀態、請求編號），另記回應 id。錯誤也要帶 `trace` 與已知用量。
- Anthropic 的版號和方言綁在一起，不放在可覆蓋的目錄標頭。`2026-10-21` 送 `temperature` 會 400。
- `check` 對 OpenRouter 不能用列模型（不用金鑰也列得出來），要打金鑰端點。
- OpenAI 的 `store: false` 和背景模式互斥。之後要「斷線接回」就得開 `store`，寫進不做清單的觸發點。
- 快照加欄位的風險低：`readSnapshot` 只取認得的鍵。

### 表中事實核對

| 項目 | 結果 | 來源 |
|---|---|---|
| OpenAI：每檔與每次請求合計 50 MB；`input_file` 加 `filename` 與 `file_data` 的 data URL；PDF 抽文字也看頁面圖 | 正確；頁數上限官方頁沒寫 | 今天查 |
| Anthropic：請求 128 MB、600 頁（context 不到 1M 時 100 頁）；範例用 `2026-10-21` | 正確 | 今天查 |
| Gemini generateContent：inline 每次請求 100 MB、PDF 50 MB、1000 頁；`x-goog-api-key` | 正確；REST 同時收 `inlineData` 與 `inline_data` | 今天查 |
| Gemini 每頁 token | 兩頁官方文件寫的不一樣（258，以及 280、560、1120） | 沒把握 |
| 「OpenAI、Gemini 自動快取，不用標」 | 大致正確 | 記憶，中 |
| 錯誤表 | 見發現 9 | — |

### 修正後的設計要點
- **〈依據〉〈13〉**：加 D-148、D-195。若保留 `node` 傳輸層，要寫的決定加「修改 D-148 第 1 點」。
- **〈2〉步驟**：
  - 1a：repo 認得 `packages/`（空殼）。
  - 1b：套件本體，先兩種方言。
  - 1c：真的連線。
  - 1d：另外兩種方言。
  - 2：Cards 接上。
  - 3：模型比較。
- **〈3〉性質**：
  - 第 1 點拿掉 Node 例外。
  - 加一條「會寫進設定與快照的 id、用量語意、推理等級」。
  - 加一條「會增加的集合」。
- **〈4〉結構**：
  - 改名，加 `private: true`。
  - `transports/` 只留 fetch。
  - 目錄拆成廠商表與模型種子，加 `schemaVersion`。
  - 第一步不出 `estimate.ts`。
- **〈5〉介面**：
  - 傳輸是 fetch 形狀。
  - `endpoint` 是解析後的物件；`apiKey` 選填。
  - 加 `extraBody`、`extraHeaders`。
  - 結果加 `message`。
  - 事件帶 `delta`。
  - 檔案來源用聯集。
  - `reasoning` 加 `minimal`、`xhigh`。
  - `trace` 逐次嘗試。
  - 拿掉 `cache`。
- **〈6〉方言**：
  - 四個 id 改成協定名。
  - Gemini 用 generateContent。
  - 上限照上表更新。
  - `openai-chat` 的差異明列成欄位。
  - Anthropic 版號綁在方言。
- **〈7〉行為**：
  - 重試照發現 7。
  - 加回應標頭逾時。
  - 結束事件必到。
  - 錯誤表照發現 9。
  - 情境表加發現 8 的項目與一個 30 MB 假 PDF。
  - `estimate` 回範圍。
- **〈8〉repo**：
  - Cards 用轉接檔加相對路徑，不用 `file:`。
  - 加暫存副本的驗收測試。
  - `check-app-imports` 掃 `packages/`。
  - 分派用明列的表。
  - 假金鑰與錄製走白名單。
- **〈9〉**：寫使用端條件；拿掉「git 相依」。
- **〈11〉**：
  - 預設用 `fetch`（先實測 CORS）。
  - Anthropic 加瀏覽器標頭。
  - 規則放 `instructions`、PDF 放前面。
  - 費用寫「照牌價估計」。

### 需要但拿不到的資訊
- 沒有金鑰，所以沒實測：各家串流事件的實際形狀、推理期間有沒有 keepalive、Obsidian 桌面與手機用 `fetch` 的 CORS。
- OpenAI「資料分享」的免費額度會不會受 `store: false` 影響。
- Gemini 3.x 現在的思考參數寫法與每頁 token。
- `file:` 在 Windows（junction）的行為；`@essence` 這個 npm scope 屬於誰。
- 雲端環境能不能設 secrets 與開放對外網域。
- Capture 之後要送的輸入型別（聲音、轉錄），會影響 `file` 區塊要不要現在就通用化。
- `tools/ci-gate.ts` 與 `tools/tests/` 我沒全讀，只確認它們寫死對象清單。

### 查證來源（2026-11-25）
- https://platform.claude.com/docs/en/build-with-claude/pdf-support.md
- https://ai.google.dev/gemini-api/docs/generate-content/file-input-methods
- https://ai.google.dev/gemini-api/docs/interactions/document-processing.md.txt
- https://aistudio.google.com/docs/migrate-to-interactions.md
- https://ai.google.dev/gemini-api/docs/interactions-breaking-changes-may-2026.md（只看到標題，沒讀內文）
- https://developers.openai.com/api/docs/guides/file-inputs.md
- https://simonwillison.net/2024/Aug/23/anthropic-dangerous-direct-browser-access （搜尋結果，沒讀內文）
- npm registry：`npm view ai-client`

## Claude 回應

照 D-207 先分：都是設計階段的發現，沒有要交使用者選的；能在第一步做的都做了，其餘寫明延到哪一步。

| # | 處理 | 怎麼做 |
|---|---|---|
| 1 | 採用 | 第一步沒有軟體 import 套件，不受影響。第三步改成轉接檔加相對路徑、不用 `file:`，連同放行規則、分派的明列表與 hook 的驗收測試寫進任務說明〈8〉與 D-232。 |
| 2 | 採用 | 名稱改成 `essence-ai-client`、`"private": true`；README 寫明不要 `npm install` 同名的套件。 |
| 3 | 採用 | 方言 id 改成協定名；用量照建議的意思定義（`cacheWriteInputTokens` 也加了）；推理七級，對不上時取最近一級（一樣近取高）加 warning；`trace.reasoningSent` 記實際送出的參數。都有情境表的測試。 |
| 4 | 大部分採用 | 加了 `extraBody`、`extraHeaders`、結果的 `message`、`text` 事件的 `delta`、`stopReason` 的 `refusal`、`apiKey` 選填、會增加的集合寫進 README 與型別註解。檔案來源只有 `data`、助理訊息還沒有不透明區塊：都是聯集加成員，之後加是小版號，等多輪或 Files API 真的要用再做。`endpoint` 保留 `{ provider }` 與 `{ custom }` 兩種寫法，由套件解析，呼叫端不用自己查目錄。 |
| 5 | 採用 | 傳輸層就是 fetch 的形狀；本文直接組成位元組（`src/body.ts`）。 |
| 6 | 採用 | `node` 傳輸層拿掉，套件不用 Node 模組；D-148 與 CORS 實測寫進任務說明〈11〉，第三步定。 |
| 7 | 採用 | 只在拿到成功的回應前自動重試；之後的錯誤 `afterResponse: true`、帶 `partialText`；`Retry-After` 超過 60 秒不重試，秒數放 `retryAfterMs`。 |
| 8 | 採用 | 每種方言都要看到結束事件；情境表加了註解行、CRLF、多行 `data:`、200 裡的錯誤、沒有結束事件。 |
| 9 | 採用 | 錯誤分類看回應內容；Anthropic 的 402、月上限、413、拒答，Gemini 的 400 金鑰錯、兩種被擋，都有範例與測試；超過 context 歸 `input_too_large`。實測確認了 Anthropic 401 與 Gemini 400 `API_KEY_INVALID`（任務說明〈結果〉）。 |
| 10 | 採用 | 加回應標頭逾時（120 秒加每 100 KB 1 秒，可重試，可關）；不串流只寫成限制。 |
| 11 | 部分採用 | 加了 `schemaVersion`、可關的輸入檢查、`openai-chat` 的差異欄位。模型資料要不要搬到 Cards，第三步接上時再定（任務說明〈6〉〈12〉）。 |
| 12 | 採用 | 第一步不出 `estimate`；費用只在結果裡照牌價算，標 `estimated` 與查價日期。 |
| 13 | 採用 | 不做 `cache: 'auto'`；之後做成區塊標記，記在任務說明〈6〉。 |
| 14 | 採用 | `redirect: 'error'`；金鑰只走標頭；網址用 `new URL()` 比 hostname、擋帶帳密的；假金鑰避開 secretlint。區網的 Ollama 留在〈12〉待決。 |
| 15 | 部分採用 | 冒煙測試排到 Cards 接上之前（第二步）；公開介面縮小；0.x 到實測後才 1.0.0。拆兩次合併與方言分兩批沒有照做：使用者要「規劃好就來做」，四種方言已經寫完並用同一張情境表測；改成 PR 分 commit、README 標實測狀態，沒實測的不宣稱可用。實際行數：程式約 2,200、測試約 850、範例與目錄約 1,000。 |
| 16 | 採用 | 用 generateContent；`gemini-interactions` 記成之後的方言。 |
| 17 | 同意 | 不另外處理。 |
| 18 | 採用 | `check-app-imports` 掃 `packages/`（相對路徑、symlink、本機相依、表與大小寫）；寫死對象的地方改成照表或補上；使用條件寫進 README 與任務說明〈9〉。改到套件時要跑哪些軟體的明列表，等第三步有軟體用它才加。 |
| 19 | 採用 | Anthropic 的 `max_tokens` 有預設；`trace.attempts` 逐次記、另記回應 id；Anthropic 的版號綁在方言；OpenRouter 的 `check` 打金鑰端點（目錄的 `checkPath`）；`store: false` 與背景模式記進任務說明〈6〉。錯誤帶 `attempts`，還沒帶已知用量（之後加欄位是小版號）。 |
