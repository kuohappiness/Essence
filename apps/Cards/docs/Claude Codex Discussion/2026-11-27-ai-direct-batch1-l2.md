# Cards 直接呼叫 AI 第 1 批的 L2 審查（審查紀錄）

狀態：待審｜下一步：兩輪都通過、R2 已補；合併前等使用者過目 S3 列的畫面文字、同意合併｜等誰：使用者

審查請求：[ai-direct-l2.md](../tasks/ai-direct-l2.md)；任務說明：[ai-direct.md](../tasks/ai-direct.md)。

## 第一輪

狀態：待修（審查者原文：待修，沒有 P1）

審查者：Fable 5.2 high（Claude 開的子代理，沒有參與實作）。Codex 的額度不夠（GitHub 上的 Codex 自動審查在 PR #78 回「已達用量上限」），照使用者先前定的規則暫用 Fable（[quality.md〈角色〉](../../../../docs/agents/quality.md#角色)的 L2 原本是 Codex）。以下是原文（暫存資料夾的路徑略去）。

### 審查報告（原文）

狀態：待修。沒有發現會讓金鑰外流、弄壞資料或讓共用檢查漏跑的程式缺陷，沒有 P1。合併前要處理的是 R1（實機補驗）、R2 與 R3（文件），建議一起修 R4。

#### 待審 commit 與範圍

- 分支 `claude/project-thread-q0jv5f`，HEAD `14e4dbd782e8cc20b290f83a31175a0ccf310a0e`，共同祖先 `32e52caaf6574cea9871a9d286e9098b0a6da81b`；工作樹乾淨。
- 範圍：`f1bd2630`（§3 費用估計）、`a8f02bd5`（§1 接上套件與共用檢查）、`7adf0096`（§2 設定頁）、`14e4dbd7`（審查請求）。§4～§9 不在範圍。
- 規格：`apps/Cards/docs/tasks/ai-direct.md` §1～§3、§10、§11 與〈平台事實表〉；`docs/tasks/ai-client.md`〈3〉〈5〉〈6〉〈8〉；D-231、D-232 第 5 點、D-241、D-208 第 10 點、D-201、D-117。

#### 審查請求點名的性質，核對結果

- **改到套件一定跑 Cards 的完整檢查，pre-commit 與 CI 同一張表**：成立。`tools/tests/dispatch.test.ts` 與 hooks 的新測試通過；暫存副本用 `checkout-index --all` 取出，含 `packages/`，Cards 讀到的是暫存的套件。
- **只有轉接檔能 import 套件主入口**：成立。轉接檔搬走而表沒改時，`checkSource` 與 `checkUsers` 各報一次，暫存區與工作樹兩種模式都擋（已重現）。少副檔名、指到套件內部檔、動態 import、不在表上的軟體都擋。
- **state、複習、發布前比較不會間接載入套件**：現在成立。我沿 import 往下走，`src/state/index.ts`、`src/review/index.ts`、`src/core/ai/index.ts`、`tools/compare/adapter.ts` 都走不到 `core/connect` 或 `packages/`；只有 `src/main.ts` 經 `obsidian/settings.ts` 走得到。但沒有規則守住，見 R5。
- **`main.js` 只 require `obsidian` 與 CodeMirror**：成立。實際建置後 1,935,635 bytes，共同祖先是 1,873,692，多了約 62 KB；手機也會載入這一份。套件裡沒有 lookbehind 這類舊 iOS 解析不了的語法。
- **金鑰不外流**：沒找到任何寫入路徑。金鑰只在 `runTest` 的區域變數裡；結果文字只用錯誤種類加固定句子；沒有金鑰時 0 個請求；短於 8 個字的金鑰不會送到遠端。
- **同一時間只有一個測試；被取代或中止的結果不畫**：成立（用 controller 的身分判斷；關掉設定頁、換服務、換金鑰、停用外掛都中止）。
- **Anthropic 一律加標頭**：`check` 與 `generate` 都帶，其他三家不帶；覆寫只多了 `headers`，Anthropic 的其他欄位和內建目錄相同（已重現）。
- **費用估計**：我另外手算五個內建模型的「一課」例子（6,000 個中文字加 3,000 個其他字元、6 頁 PDF、輸出 3,000～10,000），全部和程式相同：

  | 模型 | 最少 | 最多 |
  |---|---|---|
  | `gpt-5.6-terra` | 0.0564 | 0.1881 |
  | `claude-sonnet-5-5` | 0.0564 | 0.174916 |
  | `claude-haiku-5-5` | 0.00282 | 0.0087458 |
  | `gemini-3.8-flash` | 0.015561 | 0.0475575 |
  | `gemini-3.5-flash-lite` | 0.0092244 | 0.029023 |

  Gemini 3.8 Flash 在 2027-01-01（UTC）正確換成新價；Haiku 的長內容價只套在超過門檻的那一端；OpenRouter 回 `null`。Anthropic 的每頁範圍和官方頁一致（文字 1,500～3,000，頁面圖最多 1,568，請求 128 MB、600 頁）。

#### 發現

##### R1　P1 的探針沒打過「測試連線」實際用的端點（規格／驗證；合併前在實機補驗）

- **觸發條件**：家長在 Obsidian 電腦版按「測試連線」。
- **預期／實際**：〈平台事實表〉P1 寫「用假金鑰各打一次 `check`」，審查請求也把 P1 列為已驗。實際的探針 `apps/Cards/src/obsidian/dev-ai-probe.ts:13-35,47` 送的是四家**製卡端點的 POST**。`check` 打的是另一組：OpenAI 與 Google、Anthropic 的 `GET …/models`，OpenRouter 的 `GET /api/v1/key`（`packages/ai-client/src/client.ts:486,501`）。CORS 是照端點與方法回的，這四個 GET 在 `app://obsidian.md` 能不能讀到回應，沒有證據。
- **影響**：某一家的清單端點不放行時，那一家的測試連線永遠寫「網路連不上」，金鑰對也一樣。第 1 批在畫面上唯一的功能就是這顆按鈕。
- **真實路徑與機率**：會走到，每次按都走。四家都公開支援瀏覽器直連，我估被擋的機率低，但沒驗過。
- **證據**：靜態推斷（探針與 `check` 的請求不同）；實際行為待驗證。
- **建議**：合併前的第 1 批實機明寫這一項：四家各用假金鑰按一次，每一家都要是「金鑰不對或已失效…」；出現「網路連不上」就是被擋，照 D-241 第 2 點處理。P1 那一列的探針敘述改成實際做的事。

##### R2　`apps/Cards/AGENTS.md` 的轉接檔例外還沒補（規格；合併前處理）

- **預期／實際**：`ai-direct.md` §1 與 `ai-client.md`〈8〉第三步都要求「和放行規則同一個 commit」。放行在 `a8f02bd5` 進了，`apps/Cards/AGENTS.md:9` 還是「不 import 其他軟體與最上層的程式」，和 `src/core/connect/client.ts:7-8` 矛盾。任務說明的狀態行寫了「等使用者回覆」，但審查請求的〈實作者自己選的做法〉沒列。
- **影響**：之後的 AI 協作者照 AGENTS.md 會把轉接檔當成違規，或不知道有這個例外。
- **證據**：靜態推斷。
- **建議**：合併前拿到使用者的明確同意後補上（五關的第 ⑤ 關）；使用者要延後就在任務說明寫明延到哪裡。

##### R3　現行規範和程式不一致：`docs/architecture.md`（規範與設計，D-141；合併前修）

- **預期／實際**：`docs/agents/quality.md:40` 寫分派規則只記在 architecture.md。這一批之後有兩句過時：
  - `docs/architecture.md:156`「只改 `packages/<套件>/`，就只檢查那個套件」：現在 Cards 也跑完整檢查。
  - `docs/architecture.md:113`「這條放行等第一個軟體接上時才加進檢查，在那之前軟體不能 import 套件」：放行已經加了。
- **影響**：照文件判斷「改套件要跑什麼」會錯；`AGENTS.md`〈Code Review Rules〉要求看和決定、規範矛盾的地方。
- **證據**：靜態推斷。
- **建議**：合併前改這兩句，只改文件。

##### R4　金鑰太短或含特殊字時，結果寫「請求格式不對…請回報給開發者」（規格 §2；建議合併前修）

- **觸發條件**：SecretStorage 裡的值短於 8 個字，或含 Latin-1 以外的字（全形字、`…`）、中間有換行。例如貼錯剪貼簿，或從網站的遮罩顯示複製到 `sk-…abcd`。
- **預期**：§2「失敗照錯誤的種類寫原因與下一步…家長看得懂」，應該指向金鑰。
- **實際**（已重現）：沒有送出，結果是「請求格式不對。再試一次；一直這樣，請回報給開發者。」再試也一樣。
- **影響**：家長沒辦法自己排除，還被引去回報。金鑰沒有外流。
- **真實路徑與機率**：會發生；要貼錯才碰到，估計偶爾。
- **位置**：`apps/Cards/src/core/connect/connection.ts:99-105,119-131`；套件 `client.ts:582-585` 與標頭驗證。
- **建議**：收窄。`testConnection` 送出前判斷金鑰的樣子，直接回一句「金鑰看起來不完整或有不能用的字，請重新貼上」；不必動套件。

##### R5　「只有 `main.ts` 與 `src/obsidian/` 拿 `core/connect`」沒有規則守住（規範與設計；加檢查規則，第 2 批開工前）

- **預期／實際**：轉接檔的註解與 §1 說 `core/connect` 不能被 `core/ai`、`state` 載入，畫面只拿交進來的動作。實際用 ESLint 跑（已重現）：`src/ui/prefs.ts`、`src/state/index.ts`、`src/core/ai/index.ts` 寫 import `core/connect/index.ts` 的值，都沒有訊息。對照組 ui 拿 `core/ai` 的值有被 `essence/module-boundaries` 擋。
- **影響**：第 2 批加直接製作時，一行 import 就會讓 `state` 載入套件，或讓畫面直接連網。失守時會以測試壞掉或架構走樣出現，不是默默壞資料。
- **真實路徑與機率**：現在沒有；第 2、3 批正好在這一帶加程式，機率中等。
- **位置**：`apps/Cards/eslint.config.js:64-88,126-132`。
- **建議**：`layerBoundary` 的 `backup|ai|settings` 加 `connect`；另加一條只有 `src/obsidian/` 與 `main.ts` 能 import `core/connect`。

##### R6　`runTest` 中途丟例外會卡在「測試中…」（規範與設計；低，可和 R4 一起修）

- **觸發條件**：`app.secretStorage.getSecret` 丟例外，或 `refresh()` 丟例外。
- **實際**（已重現，替身的 `getSecret` 改成丟錯）：`aiTest` 留著，重畫後一直是「測試中…」、按鈕不能按，另有一個沒處理的 rejection；關掉設定頁再開才恢復。
- **真實路徑與機率**：`obsidian.d.ts:8157` 沒寫 `getSecret` 會丟，名稱也先過了格式檢查，估計極低；真的 Obsidian 在鑰匙圈不能用時會不會丟，待驗證。
- **位置**：`apps/Cards/src/obsidian/settings.ts:385-397`。
- **建議**：拿金鑰那一段包 try，失敗時清掉 `aiTest`、寫一句結果。

##### R7　pre-commit 的 `--staged` 檢查讀的是工作樹的 `PACKAGE_USERS`（規範與設計；記成已知的限制）

- **觸發條件**：暫存了「轉接檔搬家」，`tools/dispatch.ts` 的表只在工作樹改了、沒有 stage。
- **實際**（已重現）：`node tools/check-app-imports.ts --staged` 通過；把暫存的內容取出來照 CI 的方式跑，報 3 個問題。
- **影響**：pre-commit 放行、CI 擋下，不會進 main。和既有的 `tools/apps.ts` 的 `FOLDERS` 是同一類（共用檢查的程式本來就從工作樹跑），這次多一張表。反方向（工作樹拿掉表上的列，本機就不跑 Cards）一樣由 CI 補。
- **機率**：低，要部分 stage 才碰到。
- **建議**：記進 `docs/backlog.md`〈已知的限制〉，不加機制。

##### R8　同一個金鑰名稱給兩家用，金鑰會送到另一家（規格邊界；低）

- **觸發條件**：家長替 OpenAI 建了名稱 `ai` 的金鑰，換到 Google 後在金鑰欄又選同一個。
- **實際**（已重現）：OpenAI 的金鑰放在 `x-goog-api-key` 送到 Google，結果寫「金鑰不對」。
- **影響**：金鑰值到了另一家服務；是家長自己選的，沒有寫進任何檔。
- **機率**：低到中，要看真的 `SecretComponent` 選單長什麼樣（待驗證）。
- **建議**：記成已知的限制，或在同名被兩家用時多寫一句提示。請使用者選。

##### R9　金鑰名稱的格式可能比 Obsidian 收的嚴（待驗證；低）

- **實際**（已重現替身）：`SECRET_ID`（`connection.ts:33`）不收 `open--ai`、`openai-`、`-openai`；選了之後名稱被拿掉，重畫後金鑰欄變空，沒有任何說明。
- **依據**：`obsidian.d.ts:8142` 只寫「Lowercase alphanumeric ID with optional dashes」，沒說能不能連續或在頭尾。
- **建議**：實機試一個尾端有 `-` 的名稱；Obsidian 收的話放寬成 `^[a-z0-9-]+$`。

##### R10　費用估計的三個小項（規格 §3，第 2 類；記技術債，第 2 批顯示前處理）

1. **文字係數對少數字偏低**（已重現）：注音聲調、擴充區漢字、emoji 算成「其他字元」（每字 0.2～0.35）。「ㄓㄨˋ ㄧㄣ ㄈㄨˊ ㄏㄠˋ」14 個字元估 6～14 token；3 個擴充區漢字估 1～2。文字只占一課費用的小部分，影響估在幾個百分點內。位置 `packages/ai-client/src/estimate.ts:10-13`。
2. **PDF 沒頁數時先丟錯、不回 `null`**（已重現）：沒有價格的模型（OpenRouter、目錄外）附了沒寫 `pages` 的 PDF，丟 `invalid_request`。介面註解有寫，但第 2 批的畫面要一律給 `pdfPages` 或接住例外，否則「不知道這個模型的價格」那句出不來。位置 `estimate.ts:58-64`。
3. **Google 的 `source` 只支持 258**：目錄引的頁面只寫每頁 258 token，沒有 560 與 1,120，這一筆也沒標 `guessed`。§3 要求附官方網址，查不到的標估計。位置 `packages/ai-client/catalog.json:100`。

##### R11　其他小項（低，隨手修或記下）

- **測試只掃一筆 localStorage**：`apps/Cards/tests/settings-tab.test.ts:424` 只看 `essence-cards-ai-connection`，§2 驗收寫的是「`saveLocalStorage` 的任何一筆」；替身沒有列出全部 key 的方法。
- **抄表沒有一致性測試**：`eslint.config.js` 的 `packageAdapter` 與 `tests/helpers/layout.ts` 的 `BUNDLED_PACKAGES` 是手抄。不同步時是擋下或測試失敗，不是漏放，風險低。
- **OpenRouter 的模型欄會失焦**：整頁重畫（備份狀態變了、測試連線結束）時游標不見；每個按鍵都存過，值不會丟。
- **清掉的金鑰寫「先選一把」**：金鑰欄明明顯示著名稱，結果卻寫「先在上面選一把這個服務的金鑰…」，建議另寫一句「這把金鑰是空的」。
- **選單標籤**：「Google AI Studio（Gemini）（免費）」兩層括號，`docs/ai-models.md` 寫的是「Google Gemini（免費）」。
- **文件**：`packages/ai-client/src/types.ts:16` 的註解還寫 `pages`「只用來檢查頁數上限」；`docs/tasks/ai-client.md`〈5〉第一點還寫 `estimate` 之後再開。

#### 對〈實作者自己選的做法〉

八項都沒有反對。第 1 項（自成 `core/connect`）理由成立，要補 R5 的規則才守得住。第 2 項（一張表兩個用途）沒問題，限制見 R7。第 3 項（名稱存在這台裝置）符合 D-201，`saveLocalStorage` 是照 vault 分的（`obsidian.d.ts:1400`）。第 4 項見 R4。

#### 我跑了什麼

都在 Claude 的暫存資料夾的暫時 worktree 與 clone 裡，做完已移除；主工作樹沒動，沒有 commit，沒有用真的金鑰。讀了三家的公開文件頁，沒有呼叫任何 AI 服務。

- **套件**：`npm run check` 通過（232 個測試）。
- **共用工具**：`app-imports.test.ts` 與 `dispatch.test.ts` 104 個通過；`hooks.test.ts` 的「§1 改到套件時…」通過；`check-app-imports.ts` 兩種模式通過。
- **Cards**：`typecheck`、`lint`、`knip` 通過；`ai-connection`、`ai-connect`、`settings-tab` 共 27 個通過；`build.test.ts` 與 `eslint-rules.test.ts` 33 個通過、1 個照舊略過；`npm run build` 成功。
- **重現**：R4、R5、R6、R7、R8、R9、R10 的第 1、2 點，以及上面核對的各項。

#### 沒驗的項目與原因

- **Cards 的完整測試**（約 4 分鐘）沒有整包跑，只跑了上面幾個檔；`install.test.ts` 沒跑。
- **真的 Obsidian**：設定頁的畫面與存讀、`SecretComponent` 的樣子與 `onChange` 的時機、`hide()` 的實際呼叫、四家的測試連線能不能讀到回應（R1）、`getSecret` 會不會丟（R6）、名稱格式（R9）、選單列哪些金鑰（R8）、換 vault 讀不讀得到金鑰。這裡沒有 Obsidian，替身驗不了，全部標待驗證。
- **iPhone**：設定頁沒有「AI 連線」、外掛照常載入，要實機。
- **OpenAI 的每頁、每張範圍**：目錄已標 `guessed`，沒有另外查證。Gemini 的 560 與 1,120 沒找到出處頁（R10 第 3 點）。

### Claude 回應（第一輪）

核對：R1 對照了 `dev-ai-probe.ts` 與 `client.ts` 的 `check`，探針確實只送製卡的 POST；其他項照報告的位置讀過程式。分類照 code-quality 的 `review.md`〈修正後收尾〉。

| 發現 | 發生條件與機率／影響 | 處理 | 修法會動到什麼 |
|---|---|---|---|
| R1 | 每次按測試連線都走；某一家被 CORS 擋時那一家永遠「網路連不上」 | 一定修（驗證）：第 1 批的 Windows 實機已經寫成四家各用假金鑰按一次、每一家都要是「金鑰不對」；P1 那一列改寫成探針實際做的事 | 只改文件；實機結果寫進任務說明〈結果〉 |
| R2 | 文件和程式矛盾 | 等使用者回覆（改 AGENTS.md 要使用者同意）；合併前補上，或照使用者的意思在任務說明寫明延到哪裡 | 一行文件 |
| R3 | 文件過時 | 修：改 `docs/architecture.md` 的兩句 | 只改文件 |
| R4 | 貼錯金鑰時偶爾碰到；家長被引去回報 | 修，和 R11 第 4 項同一類（金鑰的值的樣子），在 `keyOf` 一次分清：沒選、選了但是空的、樣子不對（短於 8 個字、有空白或非 ASCII 的字），各寫一句；直接製作（第 2 批）用同一個判斷 | `connection.ts`、`settings.ts`、測試；收窄，不加機制 |
| R5 | 第 2、3 批改到這一帶時中等機率 | 修：加檢查規則（ui 從 `core/connect` 只拿型別；`src/` 裡只有 `main.ts`、`src/obsidian/` 與 `core/connect` 自己能拿它的值） | `eslint.config.js`、`tests/eslint-rules.test.ts` |
| R6 | 極低；卡在「測試中…」 | 修：拿金鑰到收到結果之間丟例外時，按鈕回來、寫一句，錯誤交給錯誤紀錄（`where: "ai"`，D-155） | `settings.ts`、`main.ts` 的接線、測試 |
| R7 | 低；pre-commit 放行、CI 擋下 | 記進 `docs/backlog.md`〈已知的限制〉 | 只改文件 |
| R8 | 低到中；金鑰送到另一家 | 修：同一個名稱已經設給另一家時，金鑰那一列多寫一句提醒（不擋）。各家的金鑰不會通用，同名一定是選錯 | `connection.ts`、`settings.ts`、測試 |
| R9 | 低；名稱被拿掉、欄位變空 | 修：放寬成小寫英數與 `-`（比 Obsidian 寬不會出錯：名稱都是 `SecretComponent` 交回的，這條只用來濾掉讀不懂的本機設定） | `connection.ts`、測試 |
| R10 | 第 2 批顯示估計費用時才會被看到 | 記進 Cards 的技術債，觸發點是第 2 批顯示估計費用 | 只改文件 |
| R11 第 1 項 | 測試涵蓋不足 | 修：掃 localStorage 的每一筆（替身加列出全部的方法） | 測試替身、測試 |
| R11 第 2 項 | 不同步時是擋下或測試失敗，不會漏放 | 不修：Cards 的設定與測試不 import 最上層的程式（D-208 第 10 點），一致性要靠 `tools/` 的測試讀 Cards 的設定檔，代價比好處大 | — |
| R11 第 3 項 | 打字時剛好重畫才碰到，值不會丟 | 記進 Cards 的〈已知的限制〉 | 只改文件 |
| R11 第 4 項 | 見 R4 | 和 R4 一起修 | 見 R4 |
| R11 第 5 項 | 選單和 `docs/ai-models.md` 不一致 | 修：推薦的那幾家用 `docs/ai-models.md` 的名稱（Google 寫「Google Gemini」） | `connection.ts`、測試 |
| R11 第 6 項 | 文件過時 | 修：`types.ts` 的註解、`docs/tasks/ai-client.md`〈5〉 | 註解與文件 |

修正的差異（R4、R5、R6、R8、R9、R11）送第二輪，只查那段差異與受影響的路徑。

**修完的 commit**（2026-11-27，每一個的 pre-commit 都照分派表跑 Cards 的完整檢查並通過；最後一個另跑套件的完整檢查）：

| 發現 | commit |
|---|---|
| R1（文件）、R3、R7、R10、R11 第 3 項、R11 第 6 項的任務說明 | `e5c5ce14` |
| R9 | `111a1dcd` |
| R11 第 5 項 | `f83265a9` |
| R5 | `d9acb4af` |
| R6 | `0f7f35a8` |
| R4、R11 第 4 項 | `921d88d9` |
| R11 第 1 項 | `27f0b306` |
| R8 | `b98bd57c` |
| R11 第 6 項的套件註解 | `d25a771f` |

R1 的實機：第 1 批的 Windows 實機（2026-11-27）四家各用假金鑰按測試連線，都是「金鑰不對或已失效…」，清單端點沒有被 CORS 擋（[任務說明〈結果〉](../tasks/ai-direct.md#結果)）。R1 結了。

R9 的實機沒有另外試尾端有 `-` 的名稱：放寬之後比 Obsidian 寬，Obsidian 收不收都不影響這條。

## 第二輪

狀態：再審通過（審查者原文；R2 仍等使用者回覆，不在這一輪）

審查者：Fable 5.2 high（新開的子代理，沒有參與實作，也沒有看過第一輪的對話）。以下是原文（暫存資料夾的路徑略去）。

### 審查報告（原文）

#### 待審範圍與結論

- **範圍**：`git diff 14e4dbd782e8cc20b290f83a31175a0ccf310a0e..e3211508`，分支 `claude/project-thread-q0jv5f`，HEAD `e3211508a3c2ecf1d21139e696d3f98783a35de2`；主工作樹乾淨。
- **結論**：通過。R4、R5、R6、R8、R9、R11（第 1、4、5、6 項）都修了，修法沒有帶進擋合併的問題，回歸測試大多守得住（下面的變異測試）。
- **新發現**：五項，全是低，可以隨手修或記下，不必再送 L2。
- **合併前還剩**：第一輪的 R2（`apps/Cards/AGENTS.md` 的轉接檔例外），等使用者回覆。

#### 每一項修了沒有

| 發現 | 判定 | 證據 |
|---|---|---|
| R4、R11 第 4 項 | 修了 | 已重現：設定頁用 15 種金鑰值各按一次，沒有一種再出現「請求格式不對…請回報給開發者」。另跑 6,000 個隨機值（四家各 1,500）：`keyOf` 收的 4,199 個都送出並分類成 `auth`，不收的 1,801 個一個都沒送出，0 個違反。 |
| R5 | 修了 | 已重現：40 種 import 寫法與位置。`state`、`review`、`ui`、`dev`、`desktop`、`core` 其他模組、`tools/compare/`（含子資料夾）拿 `core/connect` 的值都被擋，靜態、`export * from`、動態、`require`、`import =` 都擋；型別照常放行；`main.ts`、`src/obsidian/`、模組自己不誤擋。 |
| R6 | 修了 | 已重現：`getSecret` 丟錯後寫「測試連線沒有完成…」，按鈕可按，沒有未處理的 rejection，錯誤紀錄有 `where:"ai"`。恢復後再按一次送得出去、得到「連得上。」。丟錯時設定頁已關也不卡。 |
| R8 | 修了（提醒，不擋） | 已重現：三家同名時列出另外兩家；localStorage 裡不認得的服務同名不列；換成別的名稱或清掉後提醒消失。 |
| R9 | 修了 | 已重現：`open--ai-` 存得下、重畫後還在。 |
| R11 第 1 項 | 修了 | 變異測試：在 `runTest` 把金鑰寫進另一筆 localStorage，「金鑰的值不出現在任何寫入」的測試就失敗。 |
| R11 第 5 項 | 修了 | 選單是「Google Gemini（免費）」，和 `docs/ai-models.md:95-97` 一致。 |
| R11 第 6 項 | 修了 | `packages/ai-client/src/types.ts:16` 的註解和 `estimate.ts:57-61`、`client.ts:617` 的行為一致；`docs/tasks/ai-client.md`〈5〉已改。 |
| R3、R7、R10、R11 第 3 項 | 文件已補 | `node tools/check-docs.ts` 通過（468 個檔、9,792 個連結）；backlog 各列有觸發點與完成條件。 |

**變異測試**：九個變異殺掉八個。

- 殺掉的：`KEY_SHAPE` 放寬成任何字、`empty` 改回 `unset`、`sharedWith` 把自己算進去、`SECRET_ID` 改回舊式、catch 不清 `aiTest`、`aiFailed` 改成空的、`guardConnect` 拿掉 `tools/compare/`、`mayConnect` 放寬成整個 core。
- 活下來的：`{8,}` 改成 `{9,}`（見 S4）。

#### 對〈實作者另外選的做法〉

1. **R4（`keyOf` 回 `KeyLookup`、`/^[!-~]{8,}$/`、空的與找不到合成 `empty`）：站得住。**
   - 這條比套件嚴：套件只擋短於 8 個字與超出 Latin-1 的字，Cards 另外擋掉中間的空白與 Latin-1 的字。
   - 四家的金鑰字元都在範圍內；被引號包住的會送出、得到「金鑰不對」，可以接受。
   - 空的和找不到在畫面上分不出來也沒關係，下一步相同。
2. **R5（`tools/compare/` 也擋）：站得住。**
   - 沒擋到的 `tools/compare-versions.ts`、`tools/export-compare.ts`、`tools/rule-test/` 不構成漏洞：`compare-versions.ts` 只 import core 的 `backup`、`settings`、`study`，這三個自己拿不到 `core/connect`。
   - 轉一手也走不通：`state`、`review`、`core` import `src/obsidian/` 已被既有規則擋（已重現）。
   - `ui` import `src/obsidian/`、任何檔 import `main.ts` 沒有規則擋，但要有人在那裡刻意再轉出 `core/connect` 的值才繞得過，不算發現。
   - 現況用 esbuild 的模組圖核對：`src/state/index.ts`、`src/review/index.ts`、`src/core/ai/index.ts`、`tools/compare/adapter.ts`、`src/ui/prefs.ts` 都沒帶進套件或 `core/connect`，只有 `main.ts` 有。
3. **R6（交給 `aiFailed`、不再往上丟）：站得住。** 設定頁當場寫一句，錯誤進錯誤紀錄，不必再跳通知。小瑕疵見 S1。
4. **R8（只提醒、不擋，名稱用 `providerName`）：技術上站得住。** 沒問使用者就選了這一邊，見 S3。
5. **R9（放寬成 `/^[a-z0-9-]+$/`、沒先上實機）：站得住。**
   - `obsidian.d.ts:8142` 只寫「Lowercase alphanumeric ID with optional dashes」，新的式子涵蓋這句話的任何讀法。
   - 名稱只從 `SecretComponent.onChange` 來；Cards 的正式程式不呼叫 `setSecret`（只有開發探針用自己的常數，`dev-ai-probe.ts:91`）。
   - 剩下的待驗證：真的 Obsidian 如果收得比型別寫的寬（大寫、底線），名稱還是會被默默拿掉（替身上 `Open_AI` 已重現）。機率低，第 2 批實機順手試一個就好。
6. **R11 第 2 項不修：站得住（靜態推斷）。** 兩張抄表不同步時都是擋下，不會漏放：
   - `eslint.config.js` 的 `packageAdapter` 少了就擋轉接檔。
   - `tools/check-app-imports.ts` 照 `PACKAGE_USERS` 獨立再擋一次。
   - `BUNDLED_PACKAGES` 少了，建置與安裝測試解析不到套件就失敗。

#### 發現（依嚴重程度）

##### S1（R6 修正引入）catch 裡先報錯才清狀態，`aiFailed` 自己丟錯時又卡在「測試中…」

- **哪一軸**：規範與設計（呼叫順序）。
- **觸發條件**：`runTest` 進了 catch，`host.aiFailed` 又丟例外。
- **預期／實際**：預期無論如何按鈕都回來。實際 `aiTest` 沒清，重畫後是「測試中…」、按鈕不能按，另有一個未處理的 rejection。
- **影響**：和第一輪 R6 同一個症狀，關掉設定頁再開才恢復。
- **真實路徑與機率**：幾乎走不到。`main.ts:209` 的 `aiFailed` 只呼叫 `fail`（`main.ts:602-605`）：`console.error` 加 `errors.record`，後者整段包了 try 不丟（`src/core/errors/log.ts:225-237`）。
- **位置**：`apps/Cards/src/obsidian/settings.ts:407-414`（`aiFailed` 在 409）。
- **證據**：已重現（替身裡把 `console.error` 換成丟錯）。
- **建議**：隨手修，不加機制。先清 `aiTest`、設 `aiResult`，再呼叫 `aiFailed`，最後重畫；被換掉的那一次照舊只報不畫。不修也可以。

##### S2　第 1 批實機做完了，狀態行還寫在等實機；實機紀錄是修正前的版本

- **哪一軸**：規範與設計（roadmap 與狀態行，D-141）。
- **預期／實際**：`e3211508` 在 `ai-direct.md`〈結果〉補了第 1 批的 Windows 實機，但 `apps/Cards/docs/tasks/ai-direct.md:3` 與 `apps/Cards/docs/roadmap.md:22` 還寫「等合併前的 L2…與 Windows 版 Obsidian 的實機（§10）」。
- **另一點**：那次實機用的是 `14e4dbd7`（修正前）。紀錄裡「金鑰存成空字串時是『先在上面選一把…』」是舊句子，現在是「這把金鑰是空的或找不到…」。R4 的三句、R6 的一句、R8 的提醒、選單的「Google Gemini」都只在替身上驗過。
- **影響**：讀入口的人以為實機還沒做，或以為實機看過的就是現在的文字。
- **證據**：靜態推斷。
- **建議**：合併前改兩處狀態行（只改文件）；〈結果〉加一句「R4、R6、R8、R11 第 5 項的文字在實機之後才改，併進第 2 批的實機一起看」。我不認為要為這幾句單獨再上一次實機：R8 的提醒和已在實機顯示過的測試連線結果是同一種畫法（`descEl.createDiv`）。

##### S3（延續 R8）看得到的行為改了，沒有使用者選擇的紀錄

- **哪一軸**：規範（`.claude/skills/code-quality/review.md`〈修正後收尾〉：修法會改到看得到的行為的，先問使用者）。
- **預期／實際**：第一輪 R8 的建議是「記成已知的限制，或多寫一句提示，請使用者選」。〈Claude 回應（第一輪）〉直接選了提示，`ai-direct.md` §2 寫成「施工時補」，沒有使用者的回覆。
- **同一批新增的文字**：R4 三句、R6 一句、R8 一句、選單名稱改成 Google Gemini。
- **影響**：行為本身合理、隨時改得回來，是程序上少一步。
- **證據**：靜態推斷（讀審查紀錄與任務說明）。
- **建議**：不擋合併。和 R2 一起交給使用者時，把這六句列出來請使用者過目。

##### S4（R4 修正引入）「8 個字」是抄套件的數字，邊界沒有測試、也沒有一致性檢查

- **哪一軸**：規範與設計（同一條規則兩處各寫一份）。
- **觸發條件**：套件的 `MIN_SECRET_LENGTH`（`packages/ai-client/src/redact.ts:8`）以後調高，Cards 的 `KEY_SHAPE`（`apps/Cards/src/core/connect/connection.ts:104`）沒跟著改。
- **預期／實際**：介於兩個數字之間的金鑰應該請家長重貼。實際 `keyOf` 放行、套件丟 `invalid_request`，R4 原本的句子默默回來，沒有測試會失敗。
- **證據**：已重現一半：把 `{8,}` 改成 `{9,}` 測試全過（測試只有 7 個字的例子，沒有剛好 8 個字的）。「套件調高」是靜態推斷。
- **真實路徑與機率**：現在不會發生；要套件改門檻才碰到，低。
- **建議**：記下或隨手補一個性質測試：`keyOf` 收的金鑰（含剛好 8 個字）交給 `testConnection` 配 `mockFetch`，結果不會是 `invalid_request`。這樣不用 import 套件的常數也對得上。我用探針跑過這個性質，現在成立。

##### S5（R4 修正引入，未來）`keyOf` 不分服務，接「自訂」端點時會擋掉本機伺服器

- **哪一軸**：規格邊界（§2 把「自訂」放到第 2 類）。
- **觸發條件**：之後加自訂端點，家長連本機伺服器（不用金鑰，或用很短的金鑰）。
- **預期／實際**：套件對 localhost 放行短金鑰（`client.ts:583` 的 `isLocalUrl`），沒有認證的端點不要金鑰（`!r.auth`）。`keyOf` 會先回 `unset` 或 `malformed`，送不出去。
- **真實路徑與機率**：現在走不到，選單只有四家雲端服務。
- **位置**：`apps/Cards/src/core/connect/connection.ts:104,112-118`。
- **證據**：靜態推斷。
- **建議**：記進「自訂」那一項的 backlog 或任務說明：做的時候 `keyOf` 要看端點。現在不改。

#### 我跑了什麼

都用假金鑰與假的 `fetch`，沒有連任何 AI 服務。

- **主工作樹（HEAD `e3211508`，只讀）**：`ai-connection`、`ai-connect`、`settings-tab`、`eslint-rules` 四個測試檔 44 個通過；`apps/Cards` 的 typecheck、lint、knip 通過；`check-docs`、`check-app-imports`、`check-local-paths` 通過；`packages/ai-client` 的 `npm run check` 232 個通過。
- **暫存的 worktree**（做完已移除，主工作樹沒動、沒有 commit）：ESLint 探針 40 例（R5）；設定頁探針五組（R6 的丟錯與恢復、`aiFailed` 自己丟、設定頁已關；R8 的多家同名與不認得的服務；R4 的 15 種金鑰值）；`keyOf` 加 `testConnection` 的隨機測試兩輪各 6,000 個；變異測試九個；esbuild 模組圖六個入口。

#### 沒驗的項目與原因

- **Cards 的完整測試**（約 4 分鐘）：照指示沒有整包跑；`build.test.ts`、`install.test.ts` 沒跑，這一輪的修正沒碰建置。實作者回報每個 commit 的 pre-commit 都跑過完整檢查，我沒有重驗。
- **真的 Obsidian**（這裡沒有，替身驗不了，都標待驗證）：R8 的提醒在真的 `Setting` 列上長什麼樣；`SecretComponent` 清掉時 `onChange` 給 `null` 還是空字串（兩種程式都處理了，替身已重現）；`getSecret` 在鑰匙圈不能用時會不會丟、丟的訊息裡有什麼（R6 之後這個錯誤會寫進 console 與 vault 的錯誤紀錄；Obsidian 自己的錯誤訊息帶明文的機率估極低，沒辦法驗）；金鑰名稱實際收哪些字（R9）。
- **第 1 批實機的結果**（R1）：是實作者在 `14e4dbd7` 做的，只讀了紀錄，沒有重驗，也不涵蓋之後的修正（S2）。
- **iPhone**：沒有，這一輪的修正都在電腦專用的設定區。
- **R2**：不在這一輪。

### Claude 回應（第二輪）

| 發現 | 處理 | commit |
|---|---|---|
| S1 | 修：catch 先清狀態、設結果，再交給錯誤紀錄，重畫放在 `finally`。沒有另加測試：要讓錯誤紀錄本身丟錯，測試的 rejection 會被測試框架當成失敗，審查者的探針已重現修正前的情況 | `7c6eec2a` |
| S2 | 修：任務說明與 roadmap 的狀態行改成實機做完；〈結果〉補一句實機之後才改的文字 | 本節所在的 commit |
| S3 | 合併前把 L2 加的六句畫面文字列給使用者過目，和 R2 一起問 | — |
| S4 | 修：加性質測試，`keyOf` 收的金鑰（剛好 8 個字、每一個看得見的半形字）四家都送得出去、不會是 `invalid_request`；少一個字的不收。把 `{8,}` 改成 `{9,}` 這個測試會失敗 | `50265337` |
| S5 | 記進任務說明〈待決〉的「自訂」那一項：做的時候 `keyOf` 要看端點 | 本節所在的 commit |

兩輪都通過，不再送第三輪（S1、S4 不加機制、不改公開行為）。

第一輪的 R2：使用者 2026-11-27 同意，`apps/Cards/AGENTS.md`〈程式〉已補上轉接檔的例外（本行所在的 commit）。
