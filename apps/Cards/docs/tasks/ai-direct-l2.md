# Cards 直接呼叫 AI 第 1 批（L2 審查請求）

狀態：待審｜下一步：使用者選這一輪由誰審（現在用 Fable 5.2 high，或等 Codex 額度），審查者照本檔審第 1 批（§1～§3），回報寫進 [審查紀錄](<../Claude Codex Discussion/2026-11-27-ai-direct-batch1-l2.md>)｜等誰：使用者

遵守 repo 根目錄的 `AGENTS.md` 與 `apps/Cards/AGENTS.md`。建議推理等級：**高**。每一輪都**新開一個對話**；只審查、不改產品程式，可以在隔離環境重現。重現只用假金鑰與假的 `fetch`，不連真的 AI 服務。

[任務說明](ai-direct.md) 第 1 批：套件加費用估計（§3）、Cards 接上 `packages/ai-client`（§1）、設定頁「AI 連線」與測試連線（§2）。動到共用檢查（`tools/dispatch.ts`、`tools/check-app-imports.ts`）與跨模組的邊界，又處理家長的 API 金鑰（`AGENTS.md`〈Code Review Rules〉的 P1：金鑰或個人資料進了 repo），屬於[高風險範圍](../../../../docs/agents/quality.md#高風險範圍要做-l2)，合併前做 L2。畫面上還沒有任何製卡。

## 審查對象

- 分支 `claude/project-thread-q0jv5f`（已 push）；和 `main` 的共同祖先 `32e52caaf6574cea9871a9d286e9098b0a6da81b`（PR #76 合併後的 `main`）。
- 待審：共同祖先到這份請求所在的 commit（`git log -1 --format=%H -- apps/Cards/docs/tasks/ai-direct-l2.md`）的全部改動。各 commit 分工：

  | commit | 內容 |
  |---|---|
  | `60a9e0f8` | 分支重開時併入已 squash 的舊歷史，沒有內容改動 |
  | `f1bd26304e61310618d8065c0eec735328e2905c` | §3：`packages/ai-client` 的費用估計（`src/estimate.ts`、`catalog.json` 的係數與 `pricesAsOf`、README、CHANGELOG、測試） |
  | `a8f02bd5b42ab94edd8f57cb8eab46d4edcde7bb` | §1：轉接檔 `apps/Cards/src/core/connect/`、`tools/dispatch.ts` 的 `PACKAGE_USERS`、`tools/check-app-imports.ts`、Cards 的 ESLint 邊界、建置與安裝測試帶上套件、`tools/tests/` |
  | `7adf0096d3b21aedcddb513393a5b96f470ecb49` | §2：設定頁「AI 連線」、`core/connect/connection.ts`、`src/ui/prefs.ts`、測試替身與測試 |
  | 本檔所在的 commit | 審查請求，只改文件 |

- 沒有未提交的修改。

## 規格與優先順序

- 任務說明 [ai-direct.md](ai-direct.md)：〈使用者的決定〉、〈範圍與分批〉、〈平台事實表〉、§1、§2、§3、§10、§11。§4～§9 是第 2、3 批，不在這次範圍；§2 驗收裡「沒設金鑰時『直接製作』不能按」明寫跟著第 2 批做。
- 套件的任務說明 [ai-client.md](../../../../docs/tasks/ai-client.md)：〈3〉不可破壞的性質、〈5〉對外介面、〈6〉目錄（含 `mediaTokens`）、〈8〉第三步（Cards 接上）。
- 決定：[D-231](../../../../docs/decisions.md#d-231-外掛直接呼叫-ai-只走-api-金鑰取消訂閱接法)（只走 API 金鑰、送出前顯示估計的費用）、[D-232](../../../../docs/decisions.md#d-232-ai-連線做成共用套件講四種方言能拿到別的-repo) 第 5 點（只有轉接檔 import 套件）、[D-241](../../../../docs/decisions.md#d-241-外掛直接呼叫-ai-用-fetch-連線)（用 `fetch`，Anthropic 一律加瀏覽器直連的標頭）、[D-208](../../../../docs/decisions.md#d-208-三個外掛在同一個-repo-開發每個外掛有自己的資料夾) 第 10 點（軟體之間不 import）、[D-201](../../../../docs/decisions.md#d-201-設定改存-vault-裡的一般檔電腦不再寫-datajson)（設定存在 vault 的一般檔，`data.json` 只讀）、[D-117](../../../../docs/decisions.md#d-117-技術債預防機械檢查全自動ai-審查只在關鍵點)（pre-commit 不能被繞過）。
- 推薦的服務與模型：[docs/ai-models.md](../../../../docs/ai-models.md)。
- 規格衝突時列成問題，不挑容易通過的那份。

## 行為與風險

**共用檢查（最先看）**

- `tools/dispatch.ts`：新的 `PACKAGE_USERS`（套件 → 用它的軟體 → 轉接檔）。第 4 條改到 `packages/ai-client/` 時，除了套件自己，表上的軟體（Cards）也跑完整檢查。不可破壞：改到套件的 commit 一定跑 Cards 的完整檢查；分派結果在 pre-commit 與 CI 一致（CI 的 plan 也用同一張表）。
- `tools/check-app-imports.ts`：`apps/` 的程式指到 `packages/<套件>/` 時，只有表上的轉接檔能 import `src/index.ts`，軟體的測試（`apps/<軟體>/tests/`）另准 import `src/testing.ts`，其他一律擋；不在表上的軟體也擋。`checkUsers` 檢查表上的轉接檔存在、真的 import 主入口；只在 `tools/dispatch.ts` 被追蹤時跑。工作樹與 `--staged` 兩種模式都要對。
- `tools/tests/hooks.test.ts`：暫存一個會讓 Cards 測試失敗的套件修改、工作樹是好的，pre-commit 要失敗（§1 驗收）。

**Cards 的邊界**

- 轉接檔 `apps/Cards/src/core/connect/client.ts` 是 Cards 唯一 import 套件的檔；模組入口 `core/connect/index.ts`。Cards 的 ESLint `crossModule` 只對這一對路徑開例外（`eslint.config.js` 的 `packageAdapter`，抄自 `PACKAGE_USERS`）。
- `core/connect` 不從 `core/ai` 轉出：`state` 與發布前比較的轉接器會載入 `core/ai`，比較時的舊版複本裡沒有 `packages/`。請確認沒有其他路徑讓 `state`、複習或發布前比較間接載入套件。
- 建置：套件被打包進 `main.js`，`main.js` 照舊只 require `obsidian` 與 CodeMirror（§1 最後一條）。

**設定頁「AI 連線」（§2）**

- 只在電腦顯示；Obsidian 低於 1.11.4 只寫一句請更新，沒有欄位，也不碰 `secretStorage`（ESLint 的 `no-unsupported-api` 擋未加版本判斷的呼叫）。
- 服務、模型、推理等級與每一家金鑰的**名稱**存在這台裝置的 localStorage（`essence-cards-ai-connection`），不進 vault 的設定檔、不寫 `data.json`。讀不懂的值退回預設（`readConnection`）。
- 金鑰的值只在按「測試連線」時向 `secretStorage` 拿；空字串或空白（家長清掉）當成沒有金鑰，不送出。
- 測試連線呼叫套件的 `check`（讀一次模型清單，不產生內容），結果一句話寫在按鈕那一列。進行中的測試在關掉設定頁、換服務、停用外掛時中止；被取代或中止的結果不畫。
- **不可破壞**：金鑰的值不出現在 localStorage、`data.json`、vault 的任何檔（含錯誤紀錄）、通知、`console`、測試連線的結果文字；沒有金鑰時不發出任何請求；同一時間只有一個測試在跑。

**費用估計（§3）**

- 套件的新公開介面：照目錄的價格、`mediaTokens` 與係數算出美元的範圍，回傳帶 `pricesAsOf`。第 2 批的畫面會直接顯示這個數字，算錯就是給家長錯的費用（D-231）。請用獨立算出的數字核對（例如手算一課的例子），不要只照程式的公式再算一次。

**請找新的組合**，例如：轉接檔被搬走或改名時兩個檢查各自怎麼報；`--staged` 與工作樹不一致；換服務的瞬間舊的測試回來；`secretStorage` 回 `null`；同一個名稱被兩家共用；目錄裡沒有價格的模型。

## 驗證方式

- 指令：`apps/Cards` 與 `tools`、`packages/ai-client` 各自 `npm ci`、`npm run check`；邊界檢查在 repo 根目錄 `node tools/check-app-imports.ts`（或加 `--staged`）。Node 24。
- 實作者跑過：每個 commit 的 pre-commit 照分派表跑完整檢查並通過（改到 `tools/dispatch.ts` 是核心入口，所有對象都跑完整檢查）；§2 commit 前 `apps/Cards` 的 `npm run check` 通過（3189 個測試，3185 通過、4 個照舊略過、0 失敗）。
- 主要測試：`apps/Cards/tests/ai-connection.test.ts`、`tests/settings-tab.test.ts` 的四個「AI 連線」測試、`tests/ai-connect.test.ts`、`tests/eslint-rules.test.ts` 的轉接檔例子；`tools/tests/app-imports.test.ts`、`dispatch.test.ts`、`hooks.test.ts`；`packages/ai-client/tests/estimate.test.ts`、`catalog.test.ts`。
- 平台事實（〈平台事實表〉）：P1（四家的 `fetch`，Anthropic 要加標頭）、P3（`secretStorage` 重開還在、vault 資料夾裡沒有、沒有刪除的方法）已在 Windows 版 Obsidian 驗過。**待驗**：設定頁在真的 Obsidian 裡的畫面與存讀、`SecretComponent` 放在 `Setting.addComponent` 裡的樣子、假金鑰的測試連線錯誤文字（§10 第 1 批的實機）；「換 vault 讀不到金鑰」（P3 沒驗的那一項）。這些測試替身做不到，請標待驗，不當成已通過。

## 實作者自己選的做法

請先看這些：

1. **轉接檔的位置**：任務說明原本寫 `src/core/ai/connect.ts`，改成自成一個核心模組 `src/core/connect/`（理由見上面〈Cards 的邊界〉，§1 已照改）。
2. **一張表兩個用途**：`PACKAGE_USERS` 同時給分派表與邊界檢查用；Cards 的 ESLint 設定另抄一份路徑（ESLint 設定不 import `tools/`）。`checkUsers` 只在 `tools/dispatch.ts` 被追蹤時跑，讓沒有這張表的暫存 repo 不受影響。
3. **金鑰的名稱存在這台裝置**，不存 `data.json`（任務說明 §2〈這台電腦的設定〉的施工註記）。
4. **測試連線的結果**：沒有金鑰寫「先在上面選一把這個服務的金鑰，或建立一把新的。」不送出；錯誤用套件的 `describeAiError` 再加一句下一步（網路、逾時、找不到模型、請求不對、其他）。
5. **模型下架**：存的模型已經不在選單上時，改回這一家的第一個（推薦的）；OpenRouter 沒有選單，自己填的照存。
6. **推理等級的預設**是「照服務的預設」，選單是照服務的預設、低、中、高。
7. **Anthropic 的標頭**由 `cardsClient()` 用目錄的覆寫一律加上（D-241 第 3 點），不在每次呼叫時加。
8. **舊版 Obsidian**：只寫一句，不退回別的存法；`minAppVersion` 不改。

## 回報與權限

只審查，不改產品程式；可以在隔離環境重現。回報照 code-quality 的 `review.md`〈審查請求範本〉與〈回報格式〉：每項寫觸發條件、預期／實際、影響、位置與證據，區分「已重現」「靜態推斷」「待驗證」，並標真實路徑會不會發生與發生機率。回報寫進[審查紀錄](<../Claude Codex Discussion/2026-11-27-ai-direct-batch1-l2.md>)的〈第一輪〉。
