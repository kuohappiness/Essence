# AI 連線套件第一步（Codex L2 審查請求）

狀態：待審｜下一步：本機 Claude 用 `node tools/codex.ts l2 docs/tasks/ai-client-l2.md --note 第三輪` 請 Codex 審〈第三輪〉，報告接在 [審查報告](<../Claude Codex Discussion/2026-11-25-ai-client-l2.md>) 後面｜等誰：Codex

遵守 repo 根目錄的 `AGENTS.md`。建議推理等級：**高**。請**新開一個 Codex 對話**；只審查、不改產品程式，可以在隔離環境重現。

[任務說明](ai-client.md) 第一步新增 `packages/ai-client/`，並讓 pre-commit 的分派表、CI 的 gate、雲端設定與邊界檢查認得新的 `packages/` 類別。共用檢查與 CI 屬於[高風險範圍](../agents/quality.md#高風險範圍要做-l2)，合併前做 L2。套件本身還沒有軟體 import，但它處理家長的 API 金鑰（`AGENTS.md`〈Code Review Rules〉的 P1：金鑰進了 repo），金鑰外流與重送也一起審。

## 審查對象

- 分支 `claude/project-thread-q0jv5f`（已 push，PR #51）；和 `main` 的共同祖先 `3dcedadf`（PR #52 合併後的 `main`，分支已併入）。
- 待審：共同祖先到這份請求所在的 commit（`git log -1 --format=%H -- docs/tasks/ai-client-l2.md`）的全部改動（`git diff 3dcedadf...<那個 commit>`）。各 commit 分工：

  | commit | 內容 |
  |---|---|
  | `56a7ce26` | D-231（只走 API 金鑰）與 Cards 文件刪掉訂閱接法；只改文件 |
  | `8a5223cb` | `packages/ai-client/` 本體：四種方言、`catalog.json`、`fixtures/`、測試 |
  | `74143921` | 共用檢查與 CI：`tools/apps.ts`、`tools/dispatch.ts`、`tools/ci-gate.ts`、`tools/check-app-imports.ts`、`.github/workflows/check.yml`、`.claude/hooks/cloud-setup.mjs` 與 `tools/tests/` |
  | `1c993b62`、`24e3cbbc`、`a4af5a42` | 任務說明、Fable 的設計審查紀錄、backlog、architecture；只改文件 |
  | `1dc7db34`、`e3761c6c`、`1fc4d355` | GitHub 上 Codex 自動審查的三項 P2，各一個 commit（見下面〈已經修過的〉） |
  | `a718caa7`、`07e70a9c` | 併入 `main`；`07e70a9c` 解了 `docs/decisions.md` 與 Cards backlog 的衝突，改了兩個指到已刪標題的連結 |

- 沒有未提交的修改。

## 規格與優先順序

- 任務說明 [ai-client.md](ai-client.md)：〈3〉不可破壞的性質、〈5〉對外介面、〈6〉四種方言與目錄、〈7〉行為細節與驗收、〈8〉repo 要改的地方（第一步）、〈9〉拿到別的 repo、〈10〉測試與實測、〈結果〉。〈8〉的第三步、〈11〉、〈12〉不在這次範圍。
- 決定：[D-231](../decisions.md#d-231-外掛直接呼叫-ai-只走-api-金鑰取消訂閱接法)；[D-208](../decisions.md#d-208-三個外掛在同一個-repo-開發每個外掛有自己的資料夾) 第 10 點（新類別 `packages/` 是對它的延伸，寫成 D-232 之前先照任務說明〈13〉）；[D-117](../decisions.md#d-117-技術債預防機械檢查全自動ai-審查只在關鍵點)（pre-commit 不能被繞過）；[D-195](../decisions.md#d-195-測試分兩類改不回來的做足其餘延後但不漏)（金鑰外流、用量的意思、重試規則是第 1 類）；[D-218](../decisions.md#d-218-plugins-改名-apps每個軟體的資料夾首字大寫) 的雲端設定。
- 設計審查：[Fable 5.2 xhigh 的報告與 Claude 回應](<../Claude Codex Discussion/2026-11-25-ai-client-review.md>)；任務說明已照回應改寫。回應表寫「沒有照做」的（第 4、11、15 點的一部分），請判斷理由站不站得住。
- 規格衝突時列成問題，不挑容易通過的那份。

## 行為與風險

**共用檢查（最先看）**

- `tools/dispatch.ts`：新對象 `ai-client`。第 4 條：改到 `packages/ai-client/` 的任何檔只跑它自己的完整檢查；第 5 條：`packages/` 底下不認得的路徑（表外的資料夾、直接放在 `packages/` 的檔）全部跑；套件 `package.json` 的 scripts 寫到的 `tools/` 檔也算入口。不可破壞：改到套件的 commit 一定跑套件的 `npm run check`；改名搬進、搬出套件兩邊都算；分派結果在 pre-commit 與 CI 一致。
- `tools/ci-gate.ts`：`all()` 改成照 `TARGETS` 產生。不可破壞：套件要跑卻跳過、不該跑卻跑了、沒有結果，gate 都不過。
- `.github/workflows/check.yml`：plan 多一個輸出、新的 `ai-client` job（`npm ci`、`npm run check`）、gate 的 `needs`。
- `tools/check-app-imports.ts`：套件照軟體的邊界規則查（相對路徑、symlink、`package.json` 的本機相依不能跑出自己的資料夾）；`packages/` 底下的資料夾要在表上、大小寫相同、第一段恰好是 `packages`。
- `.claude/hooks/cloud-setup.mjs`：多裝 `packages/ai-client`。`tools/hooks.ts` 照表跑，沒有改。

**套件**

- 公開介面只有 `src/index.ts` 與 `src/testing.ts` 的 export；README 的〈怎麼用〉是呼叫端的寫法。
- 金鑰（〈3〉第 4 點）：不進結果、錯誤、例外訊息、`JSON.stringify`、`trace` 與進度事件；服務回的訊息裡出現就遮成 `***`；只放在那一家的認證標頭；`redirect: 'error'`；網址只准 `https` 或本機的 `http`，不准帶帳密。
- 重送（〈7〉）：只在拿到成功的回應之前（連不上、429、5xx），最多 3 次；`Retry-After` 超過 60 秒不重送；拿到 2xx 之後的錯誤 `afterResponse: true`、帶 `partialText`，不重送（推理的費用不付兩次）。
- 每種方言都要看到結束事件，沒有就是錯；內容被擋、輸出上限、拒答各有 `stopReason` 或錯誤種類。
- 逾時：回應標頭逾時（可重送）、本文閒置逾時（每收到一塊重新計時）、呼叫端的 `signal`。請看每個限時等待逾時之後，原本的 `fetch` 與讀本文的迴圈怎麼結束（有沒有留著沒停的讀取或計時器）。
- 用量與費用（〈5〉）：快取讀寫、推理 token 的意思四家一致；費用照目錄牌價、標 `estimated`；OpenRouter 用回報的金額。

**例子只是起點，請找新的組合**，例如：分派表的大小寫或 Unicode 正規化不同的 `packages/` 路徑、套件裡的 symlink 指回 repo 其他地方、同一個 commit 同時改套件與 `.githooks/`；SSE 的事件跨塊切在多位元組字元中間、`data:` 後面沒有空白、只有 `\r` 的換行；錯誤回應的本文是 HTML 或空的；`extraBody` 蓋掉 `stream` 或 `model`；`catalog` 加的廠商 `baseUrl` 是 `http://localhost.evil.example`。

## 驗證方式

- 環境：Node 24；`tools/`、`packages/ai-client/` 各自 `npm ci`。
- 指令：`packages/ai-client/` 的 `npm run check`（tsc、ESLint、knip、147 個離線測試）；`tools/` 的 `npm run self-check`（247 個測試，含 hook 的乾淨 clone、分派表、gate、雲端設定、邊界）。實作者在雲端 Linux 跑過都通過；每個 commit 都經過 pre-commit；CI 在 `07e70a9c` 全綠。
- 範例位置：`packages/ai-client/fixtures/<方言>/`（`case.json` 與 SSE 原文，來源都是官方文件），`tests/conformance.test.ts` 的情境表自動套到每一種方言。
- 已經驗過的平台事實（〈結果〉）：雲端用假金鑰打 Anthropic 回 401 `authentication_error`、Google 回 400 `API_KEY_INVALID`，都分類成 `auth`；雲端設定第 ② 件在乾淨 worktree 跑過，每個資料夾的結果都對。
- **沒跑的**：OpenAI 與 OpenRouter 的真的連線（雲端的網路設定擋住，第二步在使用者電腦用真的金鑰跑）；雲端設定第 ① 件（在這個分支新開雲端 session）；Windows 上的 pre-commit（請在本機跑一次 `tools/` 的 `npm run self-check`，結果寫進報告）。

## 實作者自己選的做法（請先看）

1. **傳輸層只收 fetch 的形狀**，套件不用 Node 模組：Obsidian 的 `requestUrl` 由呼叫端包成這個形狀（設 `responseTimeoutMs: null`）。拿掉原本的 `node:https` 傳輸檔，避開 D-148 的電腦專用接點。
2. **請求一律要求服務串流**，不串流的傳輸層一樣能讀（文字最後一次才到）。
3. **推理七級**（`off`～`max`），某一家對不上時取最近的一級、一樣近取高的，加一條 warning；`extraBody` 改了推理欄位時，`trace` 記實際送出的值（`1fc4d355`）。
4. **內容被擋又沒有文字**時是 `content_blocked` 錯誤，有文字時是 `stopReason`。
5. **分派表第 5 條**：`packages/` 底下不認得的路徑跑全部，不是報錯；理由是新套件第一次加進來時還沒登記，寧可多跑。
6. **邊界檢查重用軟體的規則**，不另寫一套；`packages/` 的表與大小寫檢查和 `apps/` 同一個形狀。
7. **套件不進 `node_modules`**：README 與任務說明〈9〉寫明複製資料夾、用相對路徑 import；`"private": true`、名稱 `essence-ai-client`（npm 上已有別人的 `ai-client`）。
8. **一次做完第一步**：Fable 建議拆兩次合併、方言分兩批；使用者要「規劃好就來做」，改成 PR 裡分開的 commit，請照上表的 commit 分段看。

## 已經修過的（GitHub 上 Codex 自動審查，`1c993b62`）

1. openai-chat 串流的拒答（`delta.refusal`）被丟掉 → `1dc7db34`，測試「OpenAI 相容服務在串流裡拒答（delta.refusal）：沒有文字算 content_blocked，有部分文字時 stopReason 是 refusal（GitHub 審查 P2）」。
2. 非串流 JSON 分段慢到時被誤判閒置逾時 → `e3761c6c`，測試「閒置逾時：服務改回 JSON 時，本文一段段到也算有資料（GitHub 審查 P2）」。
3. `extraBody` 改了推理等級時 `trace` 記錯 → `1fc4d355`，測試「extraBody 蓋掉推理參數：trace 記實際送出的值並記 warning（GitHub 審查 P2）」。

請確認修法是在共用的入口修、同一類的其他路徑（例如別的方言的拒答、`check()` 的閒置計時）也涵蓋到。

## 回報與權限

- 只審查，不改產品程式與共用檢查；可以在系統暫存資料夾的隔離 clone 重現。不要用真的金鑰，不要連 AI 服務（假的 fetch 或本機的 HTTP 伺服器就夠）。
- 每項發現寫觸發條件、預期／實際、影響、位置與證據，並區分「已重現」「靜態推斷」「待驗證」；另標**真實路徑會不會發生**，會發生的再寫**發生機率**。可以回報「規格本身有漏洞」。分 P1（金鑰外流、pre-commit 或 CI 該擋沒擋）、P2、P3。
- 報告接在 [審查報告](<../Claude Codex Discussion/2026-11-25-ai-client-l2.md>) 後面，標「第一輪」；頭尾寫待審 commit、審查範圍、測試結果與沒驗的項目及原因。

## 第二輪（只審修正）

第一輪的 19 項都修了，Claude 的核對與每一項的 commit、測試在[審查報告〈Claude 核對（第一輪）〉](<../Claude Codex Discussion/2026-11-25-ai-client-l2.md#claude-核對第一輪>)。

- **待審**：`539e522e` 到這份請求這一節所在的 commit（`git log -1 --format=%H -- docs/tasks/ai-client-l2.md`）；`git diff 539e522e...<那個 commit>`。一項一個 commit，commit 訊息的結尾標著 `(L2 Rn)`。
- **要看**：每一項修了沒有、修法有沒有帶進新的問題、同一類的其他路徑有沒有一起涵蓋。第一輪已經看過、修正沒碰到的程式不用重審。
- **實作者沒有照建議做、或另外選的做法**（請判斷站不站得住）：
  1. R7：回應標頭逾時改成**不自動重送**（報告建議的方向之一）；連不上、429、5xx 照舊重送。
  2. R10：已經看到「做完」的訊號、串流卻一直沒關時，閒置或整體逾時**照已收到的交回成功**並記 warning，不丟錯誤（理由：文字已經付過錢）。Chat 只有 `finish_reason` 沒有 `[DONE]` 也算成功。
  3. R13：只擋 `extraBody` 最上層的 `model` 與 `stream`，並把改了的欄位路徑記進 `trace.warnings`；**沒有**改成依服務回報的模型重新計價。
  4. R9：錯誤本文的閒置上限沒設時是 30 秒（新的常數 `ERROR_BODY_IDLE_MS`）。
  5. R17：照實作改規格（檔案上限是合計、不在目錄的模型照廠商的 `defaults`），不是改程式。
  6. R19：D-232 還沒寫，等使用者同意；任務說明〈13〉註明合併前要寫好。
- **另外請看**：R1 的 `StreamRedactor` 會留住可能是金鑰開頭的尾巴，進度事件會晚一點才交出那幾個字，最後一定交完；R12 的成功形狀檢查會不會擋掉合法的回應（例如 Gemini 只有 `promptFeedback` 的、Responses 的 `incomplete`）。
- **驗證**：`packages/ai-client/` 的 `npm run check`（175 個離線測試）；`tools/` 的 `npm run self-check`。Windows 上請再跑一次這兩個（R15、R18 只有 Windows 能驗），結果寫進報告。
- **回報**：接在審查報告後面，標「第二輪」；格式與權限照上面〈回報與權限〉。

## 第三輪（只審第二輪的修正）

第二輪的 14 項：11 項修了，延續 R7、延續 R5 記進[已知的限制](../backlog.md#已知的限制)，延續 R19 等使用者同意 D-232。Claude 的核對與每一項的 commit、測試在[審查報告〈Claude 核對（第二輪）〉](<../Claude Codex Discussion/2026-11-25-ai-client-l2.md#claude-核對第二輪>)。

- **待審**：`e35aeed0` 到這份請求這一節所在的 commit（`git log -1 --format=%H -- docs/tasks/ai-client-l2.md`）；`git diff e35aeed0...<那個 commit>`。一項一個 commit，commit 訊息的結尾標著 `(L2 round 2, Rn)`。
- **要看**：每一項修了沒有、修法有沒有帶進新的問題、同一類的其他值有沒有一起涵蓋。第二輪的發現都是第 2 代，回歸測試是整類的性質測試；這一輪再報出同一類沒處理到的值就是第 3 代，照 [code-quality〈review〉修正後收尾](../../.claude/skills/code-quality/review.md#修正後收尾)不再加機制，會改前提或交使用者選不修，所以請一併判斷「這一類現在的前提站不站得住」。前兩輪已經看過、修正沒碰到的程式不用重審。
- **實作者沒有照建議做、或另外選的做法**（請判斷站不站得住）：
  1. 延續 R1：短於 8 個字的金鑰**不遮**（報告的兩字元例子照樣留著）。理由：真的金鑰沒有這麼短，這麼短的多半是本機服務的假金鑰，遮了會把回覆裡正常的字換成 `***`。
  2. 延續 R3：不再解析 shell 的引號，改成在入口原文裡找 repo 已有的每一個 `tools/` 路徑；正規式只管樹裡沒有的路徑。
  3. 延續 R7、延續 R5：記進已知的限制，不修。R7 的窗口「通常不到一秒」是推斷，第二步的冒煙測試會記下標頭花的時間。
  4. 延續 R9：`check()` 的錯誤本文改走 `readErrorBody`（64 KiB 上限、照狀態碼分類），原本讀到 4 MiB；成功本文仍是 4 MiB，收滿就停、算形狀不對。
  5. 延續 R12：「本文好好結束卻沒有任何串流事件」算 `server`，不看 `Content-Type`（沒有 `Content-Type` 的空本文也算）；有事件但沒有結束事件的照舊是 `network`。模型清單有東西卻讀不出一筆模型算形狀不對，混著幾筆壞的照樣交回讀得出的那幾筆。
  6. 延續 R6：驗的時候另外找到超過約 24.8 天的期限會被計時器當成 1 ms，一起修（照上限算）。`null` 當成沒給、照預設。
  7. 延續 R13：服務回報的模型在這一家目錄裡才改照它估價；不認得的名稱（快照名稱）照請求的，不改成「費用不明」。
- **驗證**：`packages/ai-client/` 的 `npm run check`（192 個離線測試）；`tools/` 的 `npm run self-check`。Windows 上請再跑一次這兩個，結果寫進報告。
- **回報**：接在審查報告後面，標「第三輪」；格式與權限照上面〈回報與權限〉。照 D-171，第四輪之後還有擋合併的發現就停下來交給使用者。
