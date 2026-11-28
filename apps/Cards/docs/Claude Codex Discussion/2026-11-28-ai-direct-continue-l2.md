# 直接製作的輸出上限與接著要的 L2 審查（請求與紀錄）

狀態：待審｜下一步：Fable 5.2 high 審第一輪，Claude 核對｜等誰：Claude

任務說明：[直接製作的輸出上限與接著要](../tasks/ai-direct-continue.md)。審查者照使用者 2026-11-28 在決定卡選的「Fable 5.2 high 在雲端審」（Claude 開的子代理，沒有參與實作）。

## 審查請求

遵守 repo 根目錄的 `AGENTS.md` 與 `apps/Cards/AGENTS.md`。只審查、不改產品程式，可以在隔離環境（暫存資料夾、暫存的 worktree）重現；重現只用假金鑰與套件的 `mockFetch`，不連真的 AI 服務，不碰剪貼簿。

### 審查對象

- 分支 `claude/project-thread-s3c95r`（已 push）；和 `main` 的共同祖先 `e5ea93edfe8a2d43f2d710add805ede52b83a007`。
- 待審：共同祖先到 `e08bc4c909ea35eb25b0ed980c4ff2b8dbfc65e9` 的兩個 commit。`3b95e91e` 是套件目錄的 Gemini 兩個模型補上限；`e08bc4c9` 是 Cards 的送出、畫面、測試與文件。這份請求本身之後才 commit，不在範圍。
- 工作樹除了這份請求沒有別的未提交修改。

### 規格與優先順序

1. [任務說明](../tasks/ai-direct-continue.md)全文（做法 1～5、〈不做〉、〈平台事實表〉、〈驗收〉）。
2. 它改到的：[ai-direct.md](../tasks/ai-direct.md) §4 第 3 步、§6 的表、§7（快照與待貼回的工作的欄）、§8（錯誤紀錄）；[syntax.md §6](../syntax.md#6-ai-輸出快照) 新加的「接著要過的」一點與「用量」那一點。
3. 套件的行為：`packages/ai-client/src/`（`GenerateRequest` 的 `maxOutputTokens` 沒寫時照 `模型.maxOutputTokens ?? defaults.maxOutputTokens`、各方言怎麼轉 `assistant`、`stopReason`、`partialText`、進度事件）與 `docs/tasks/ai-client.md`。
4. 決定：D-231、D-232 第 5 點（只有轉接檔 import 套件）、D-195（測試分兩類）。規格之間衝突時列成問題，不挑容易通過的那份。

### 行為與風險

- 公開介面：`apps/Cards/src/core/connect/direct.ts` 的 `directRequest`（不再有 `maxOutputTokens` 與 `onProgress`）、`sendDirect(client, request, onProgress?)`（新的第三個參數）、型別 `DirectProgress`（套件的進度事件加 `{ type: 'continuing'; part }`）。呼叫端：`src/obsidian/ai-cards.ts`、`deepen.ts`（送出）、`ai-cards-modal.ts`、`deepen-modal.ts`、`direct-ui.ts`（送出中的畫面）。
- 不可破壞的性質：
  - 模型照規矩接著寫時，接好的整段和一次交完的**逐字相同**，之後的檢查、存草稿、快照、加深都和一次交完的走同一條路（`tests/ai-direct-continue.test.ts` 的「第一段碰到上限、第二段寫完」與「製卡的整條路」）。
  - 快照與工作的 `api` 欄沒有新增或改名；三欄（用量與費用、請求／回應編號、模型）在接著要過時的寫法照 syntax.md §6。舊版外掛讀得到（快照屬性區只是字串與數字）。
  - 收到過回覆（已計費）之後的任何失敗都標 `afterResponse`，重送的按鈕寫會再計費、工作記 `charged`。
  - 不存半份：碰到上限而沒接完時是失敗，不放進可以存草稿的那條路。
- 已知的邊界例子（都寫成測試了，測試名在 `tests/ai-direct-continue.test.ts`）：又開了一次外層程式碼區塊、前面有開場白、重寫了最後兩行、下一段以空行開頭；三次都碰到上限；沒有內容、只有程式碼區塊開頭、只有半行；接著要的那一次 503 與取消；進度字數接著算；用量有一段沒回報。請另找新的組合，例如：接縫剛好落在 `<<<完>>>` 或結尾圍欄、重複的行其實是合法的重複內容（兩張卡同一行）、`````markdown` 以外的圍欄長度、模型在接著要時改寫成別的語言或從頭重寫、加深的回覆格式、Obsidian 在接著要的中途被關掉後重開的清單畫面。
- 明確延後：拆段送、送出前的費用估計（輸出量照舊 3 千～1 萬）、接錯時自動修、每一段的原樣另存（任務說明〈不做〉）。

### 實作者自己選的做法（請先看這些）

1. **從行的邊界接**，不改成「只重要沒交完的那一篇」：各科、現行與三層的規則、加深都用同一個做法，不用讀懂回覆的結構。最後一行可能只寫一半，拿掉讓 AI 重寫。
2. **不用助理預填**：Claude 5 系列與 4.6 以後的模型送預填會回 400（Claude API 的模型資料）；改成對話後面加 `assistant`（收到的完整的行）與 `user`（接著寫的一句，附上一則的最後一行）。
3. **接縫只拿掉兩種**：又開了一次外層的程式碼區塊（前面最多兩行開場白）、開頭重寫了上一段最後幾行（最多比 40 行、要有非空白的行）。其餘照原樣接，交給原本的檢查擋。
4. **最多再要 2 次**（共 3 次請求）。
5. **沒寫出完整的一行就不接**：多半是推理把上限用完了，接著要也只是從頭再來；失敗的那句請家長把推理等級調低一級，有「打開設定頁」。`length` 的預設那一句因此改寫（原本是「回答太長被截斷了」）。
6. **接著要的那一次送不成**：照那一種錯的一句話，一律標 `afterResponse`；`partial` 是已經接好的那一段加上這一次收到的半段（用同一個接縫的拿法）。
7. **證據**：用量與費用每一段加起來，有一段沒回報那一種就不寫（不寫少的數字）；請求／回應編號照順序空一格；模型相同寫一次；收到時間取最後一段；`attempts` 加起來。沒有新的欄，所以格式的查核併進這次 L2。
8. **進度**：`text` 事件的 `totalChars` 加上已經接好的那一段的長度（不是前一段收到的全部字數）；接著要時先發一個 `continuing`。`continuing` 只在 Cards 的型別裡，套件不動。
9. **上限**：`directRequest` 完全不寫 `maxOutputTokens`，交給套件照目錄；OpenRouter 自己填的模型不在目錄裡，就不送（照服務的預設）。

### 驗證方式

- 環境：雲端容器，Node 在 `/opt/node24/bin`（先 `export PATH=/opt/node24/bin:$PATH`）；`apps/Cards` 與 `packages/ai-client` 的相依都裝好了。
- 指令：`cd apps/Cards && node --test tests/ai-direct-continue.test.ts tests/ai-direct-send.test.ts tests/ai-cards-modal.test.ts`（相關的）；`npm run check`（完整，約 6 分鐘）；`cd packages/ai-client && npm run check`。
- 實作者跑過：兩個 commit 的 pre-commit 都跑了完整檢查並通過（Cards 與套件）；新加的 9 個測試在舊程式上都失敗、改好後通過。
- 沒跑的（要真金鑰，雲端沒有）：〈平台事實表〉三列（四家收不收三則的對話、Gemini 收不收 65,536、Claude 收不收 128,000）與送出中那一行的實機，記在 Cards backlog 技術債「補測：直接製作的輸出上限與接著要在真的服務」那一列。
- 範例：測試裡的回覆範例都是自編的最小內容；mockFetch 與 sse 的用法看 `packages/ai-client/src/testing.ts` 與現有的 `tests/ai-direct-send.test.ts`。

### 回報與權限

照 `.claude/skills/code-quality/review.md`〈審查請求範本〉的〈回報與權限〉與〈回報格式〉：每項寫哪一軸、觸發條件、預期／實際、影響、真實路徑會不會發生與機率、位置、證據（已重現／靜態推斷／待驗證）、建議處理；發現編號用 R1、R2…。報告第一行寫狀態（通過、待修），頭尾寫待審 commit、範圍、跑了哪些測試與結果、沒驗的項目與原因。不逐段重述規格。用繁體中文。
