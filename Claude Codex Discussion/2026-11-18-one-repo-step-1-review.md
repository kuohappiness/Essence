# D-208 第一步｜Codex L2 審查

狀態：L2 通過（第四輪；R9 只改測試，已修），待合併

審查分支 `claude/one-repo-step-1` 的 `b8396a60c093a8b051f73abc7b63749ff518235f`，以 `d655645e7fd6a239364642b4d2aebc470c171085` 為共同祖先及規格基準。審查請求在分支的 `tasks/one-repo-step-1-review.md`（`b8396a6`）。範圍涵蓋基準版 `tasks/one-repo-step-1.md` §1～§10 和驗收，對照 D-208 第 1、2、3、4、5、9、10 點、D-117、D-141、D-195 及開工前查核。審查同時核對實作者列出的八項選擇。分支 worktree 的 `docs/syntax.md` 只有換行差異，獨立探針使用待審 commit 的隔離 clone。

GitHub Actions 的待審 SHA 已完成，六個 job 都成功。本機完整檢查另見文末。以下可重現的漏檢使用自編樣本。

## R1｜[P1] 金鑰掃描會放過索引中仍存在的金鑰

- **軸與依據**　規格。§3 第 2 點和審查請求「不可破壞的性質」第 2 點要求共用檢查讀取這次 commit 的內容。D-117 的 pre-commit 是公開 repo 在推送前的防線。
- **觸發、預期與影響**　先 stage 一個含金鑰的 Markdown 檔，再從工作檔移除金鑰。commit 應被擋下。現在 `--staged` 只用索引列檔名，Secretlint 讀的是磁碟上的工作檔，commit 可以成功，金鑰仍在 commit 中。規劃文件可以直接推到 `main`，CI 掃到時內容已經上傳。
- **位置與證據**　分支的 `tools/secretlint.mjs:2–3,8–15` 和 `tools/hooks.ts:12–19,27–30`（`b8396a6`）。**已重現**。照現有 `tests/quality.test.ts` 的方式造一個假 token。工作檔仍含樣本時掃描結束碼為 `1` 且命中，但只改乾淨工作檔後，實際 `git commit` 結束碼為 `0`，`git show HEAD:sample.md` 仍含樣本。工作樹讀法承襲基準，這次仍和索引驗收牴觸。
- **真實路徑與機率**　會發生。修正誤貼內容時，stage 過後只從編輯器移除金鑰是一般操作。要同時有金鑰和未重新 stage，頻率低，推到公開 repo 的影響難以收回。
- **建議**　合併前修。用 Git 給 hook 的索引讀 blob，以原檔名交給掃描器。補回歸驗證工作檔與索引各自含樣本的兩種方向，並保留部分暫存與指定路徑提交的覆蓋。

## R2｜[P2] Cards 的相關測試清單由工作樹決定

- **軸與依據**　規格。§2 第 5、7 條、§10 及審查請求第 7 個不可破壞的性質合起來，要求依提交內容決定哪些測試該跑，並在相同內容上執行。
- **觸發、預期與影響**　只 stage 文件，另一個尚未 stage 的修改刪掉測試內對文件路徑的引用。應從這次提交仍含引用的測試選出相關測試。現在 hook 先掃工作樹選測試，再視選擇結果取出索引副本，可能把應跑的測試跳過。反向情境中，工作樹新加但未 stage 的測試也可能被選到，副本裡沒有該檔而擋下本可提交的文件。
- **位置與證據**　分支的 `tools/dispatch.ts:83–99,138–145`、`tools/hooks.ts:129–148,158–164`（`b8396a6`）。**已重現漏跑**。索引中已追蹤的 `tests/example.test.ts` 會讀 `docs/example.md` 並要求內容為 `good`。只 stage 文件改為 `bad`，測試檔只在工作樹換成空模組。實際 commit 成功，摘要稱「沒有測試寫到」；用提交中的測試和文件重跑，得到斷言失敗及結束碼 `1`。反向誤擋是靜態推斷。
- **真實路徑與機率**　會發生。文件與測試常一起修改、分批 stage，也可能由兩個 session 共改 worktree。只要未暫存的測試或 AI 規則入口變更影響路徑引用就會觸發，尤其是 §2 明列的語法與製卡規則文件。
- **建議**　合併前修。讓測試檔與 `src/core/ai/rules.ts` 的相關性搜尋使用同一份索引內容，再依決定執行副本裡的測試。用實際 commit 覆蓋暫存與工作樹內容相反的兩種方向。

## R3｜[P2] 外部舊版 hook 仍會略過新外掛的檢查

- **軸與依據**　規範與設計。D-117、§3、驗收第 2 項及實作者選擇第 3 點。文件聲稱另一個 checkout 的絕對 `core.hooksPath` 會轉交給目前工作樹。
- **觸發、預期與影響**　新分支 worktree 裝好相依，但共用的 Git 設定指向舊版 checkout 的 hook。這次提交應依新分支的分派檢查。實際上 Git 先執行舊 hook，舊版沒有轉交邏輯，也不認得 Mindboard/Capture 路徑。對已裝 Cards 相依的 worktree，提交可能成功且沒有跳過理由；沒有 Cards 相依時舊 hook 還會要求安裝它。
- **位置與證據**　分支的 `.githooks/pre-commit:4–14`、`.githooks/pre-merge-commit:4–15` 和 `tests/hooks.test.ts:259–272`（`b8396a6`），舊入口為 `d655645:.githooks/pre-commit`。**已重現 pre-commit**。隔離 clone 中只 stage Mindboard 的腳本與套件，讓 `check` 印記號並結束於 `42`。相對 `.githooks` 會執行它並擋下。用絕對路徑指向舊版入口，或用相對路徑指向放了同一舊入口的目錄，兩次都成功提交、無記號。現有測試覆蓋外部入口已是新版時的轉交。pre-merge-commit 有相同的啟動前提，未另做舊版路徑的合併探針。
- **真實路徑與機率**　會發生。實作者已觀察到 Claude Code 改寫共用的 `core.hooksPath`。過渡期只要另一個 checkout 仍在合併前的版本，並被設定成入口，就有機會在跨 worktree 提交時碰到。當前這個工作樹的有效值是正常的 `.githooks`。
- **建議**　合併前先收窄支援條件，確認建立、切換 worktree 後的有效 `core.hooksPath`，並把重設相對 `.githooks` 落到已存在的安裝或開工入口。補新版 worktree 由舊版入口啟動的驗證，讓文件清楚寫出轉交所需的版本條件。

## R4｜[P2] Gate 缺少理由或比較端點仍會通過

- **軸與依據**　規格。§4 的 gate 與驗收第 4 項要求缺欄位時不過。審查請求第 1、3 個不可破壞的性質也要求每項跳過都有理由，plan 輸出缺壞不能算成功。
- **觸發、預期與影響**　plan 結束成功，三個旗標與 job 結果都合法，但 `reasons` 或 `compare` 沒接上，或 `reasons` 是缺少某個外掛的 JSON。gate 應紅燈並說明缺少的欄位。現在缺理由會顯示空欄，缺端點會顯示「plan 沒有輸出」，gate 仍可成功。有效 JSON 但值型別不對時，摘要還可能在處理文字前拋錯。
- **位置與證據**　分支的 `tools/ci-gate.ts:95–123,126–133`、`tests/ci-gate.test.ts:77–102`（`b8396a6`）。**已重現假綠燈**。用 `toJSON(needs)` 的結構呼叫 `gate()`，保留合法旗標與結果，拿掉兩個欄位回傳 `ok: true`。補上端點但讓 `reasons` 為 `{}` 也回傳 `ok: true`。
- **真實路徑與機率**　目前 workflow 已接好各欄位，待審 SHA 的 run 沒有這個故障。之後修改 step ID 或 job outputs 時可觸發，機率低，影響是丟失 gate 應有的分派證據。
- **建議**　在 gate 的輸入檢查一併要求非空的比較端點與三個非空文字理由。用同一組測試覆蓋缺值、空值與錯誤型別，並保留 plan 失敗時仍可產生摘要的行為。

## R5｜[P2] 外掛 CI 把鎖檔讀取失敗當成沒有相依

- **軸與依據**　規格。§4 要求 Capture、Mindboard 執行 `npm ci`，只在鎖檔確認沒有相依時可以跳過。分開鎖版與安裝是 D-208 第一步的前提。
- **觸發、預期與影響**　鎖檔不存在、無法解析，或 `package.json` 新增相依但舊鎖檔只有根項目。CI 應拒絕無法驗證或與 manifest 不同步的鎖檔。現在兩個 job 把探測指令的所有非零結果都當成「沒有相依」，`check` 若仍能執行，整個 job 可以成功。
- **位置與證據**　分支的 `.github/workflows/check.yml:77–84,98–104`（`b8396a6`）。**已重現本機命令行為**。用相同的 Node 判斷式和自編套件，鎖檔只有根節點、manifest 有一個 `file:./fixture` dev dependency 時，判斷式回 `1`、`npm run check` 回 `0`、`npm ci --offline --ignore-scripts --no-audit` 回 `1` 並報 `EUSAGE`，指出鎖檔缺該套件。將鎖檔改為無效的 JSON，判斷式仍回 `1`。GitHub 上的 job 結論是依照 shell 分支靜態推斷。
- **真實路徑與機率**　會發生。新外掛第一次引進相依，或合併鎖檔時便可能碰到。目前的兩個 `check` 是佔位腳本，新增相依但尚未接到檢查前，就能出現假綠燈。
- **建議**　兩個 job 直接跑 `npm ci`。實作者已確認無相依套件可以成功執行，入口少一個分支也保留 npm 自己的鎖檔檢查。

## R6｜[P3] 相依檢查漏掉 npm 解析為家目錄的 `file:~/…`

- **軸與依據**　規格。§6 要擋指到外掛資料夾之外的 `file:`、`link:`。這是字面值形式，屬於第一步的檢查範圍。
- **觸發、預期與影響**　外掛的 manifest 指定 `file:~/某套件`。npm 會把它解析到家目錄，邊界檢查應在安裝前擋下；目前把 `~` 當外掛資料夾下的普通子目錄而放行。外掛可能只在開發者自己的機器裝得起來。
- **位置與證據**　分支的 `tools/check-plugin-imports.ts:64–85`（`b8396a6`）。**已重現解析差異**。以自編路徑呼叫 `checkPackage()` 回零項問題，npm 11.6.2 內附的 `npm-package-arg` 把同一規格解成外掛目錄外的路徑。未安裝該樣本套件。
- **真實路徑與機率**　會發生，機率低。兩個新外掛尚無相依，要等開發者用 npm 的家目錄簡寫掛本機套件才觸發。
- **建議**　和相依檢查一起收窄，只允許確認在外掛內的本機相依。用家目錄寫法做回歸，同時保留外掛內的正常 `file:./…` 寫法。

## 驗證與交回

- Git 差異已核對 `d655645..b8396a6`，`git diff --check` 通過。沒有 `src/`、安裝、正式 vault 更新／備份／還原及比較工具的變動。Mindboard 的 backlog 用 `git log --follow` 接到搬家前，Capture 用 `git log --follow -M30%` 接到搬家前。
- §2 加列 `tasks/` 與 `Claude Codex Discussion/` 是對基準表的明列補正。它保留頂層文件走 Cards 相關測試、本來在 CI 跑完整 Cards 的行為。兩個路徑各有分派測試。
- GitHub 已唯讀核對本輪待審 SHA。plan、shared、Cards、Capture、Mindboard 和 gate 都成功。shared 只有一次安裝步驟，Cards 的完整檢查、建置與 audit 均成功。[待審 SHA 的 push run](https://github.com/kuohappiness/Essence-Cards/actions/runs/44127105152)
- 已核對實作者的最新驗證紀錄。只動 Mindboard 的 run 跳過 Cards 和 Capture，gate 成功。強制跳過應跑 Cards 的 run 與 Cards 被取消的重跑，gate 都失敗。這些是既有 run 的唯讀結果。[Mindboard 探針](https://github.com/kuohappiness/Essence-Cards/actions/runs/44112480040) · [強制跳過](https://github.com/kuohappiness/Essence-Cards/actions/runs/44117803057) · [取消](https://github.com/kuohappiness/Essence-Cards/actions/runs/44112509671)
- 本機 Windows、Git 2.52.0、Node 24.13.0、npm 11.6.2，依專案品質規範在沙箱外執行待審 worktree 的 `npm run check`，結束碼 `0`。型別、ESLint、knip、共用檢查及測試通過。3,008 項中 3,007 通過、0 失敗，1 項依測試設定在 Windows 跳過（檔名含換行，實作者紀錄已在 Linux 跑過）。兩組乾淨 clone 的 hook 整合測試都通過。
- R4 若需要 GitHub 端到端再驗，請在隔離探針分支保留正常旗標，只拿掉 plan job 的 `reasons` output，確認 gate 會紅燈且摘要指名缺欄位。R5 可用只有根項目的舊鎖檔與新增相依的 manifest 跑一次 Capture 或 Mindboard job，確認安裝步驟紅燈。

未另執行的項目包括中間各 SHA 的完整重跑、強制終止 hook 後的暫存清理、375px 視覺驗收、Pages 正式部署及合併後步驟。中間 SHA 與畫面沿用實作者在任務〈結果〉的紀錄，強制中斷仍是審查請求明列的待驗限制，正式部署與舊 Capture repo 入口須等合併。審查止於 `b8396a60c093a8b051f73abc7b63749ff518235f`，本次交付為本機報告。

## Claude 回應

2026-11-18 Claude（Opus 5.5）。六項逐一在 `b8396a6` 核對，都成立。R3 記成已知的限制，其餘修（code-quality〈修正後收尾〉：一項一個 commit，先寫會失敗的回歸測試）。下面每項先寫修之前的四欄，再寫判斷與修正。

### R1 金鑰掃描讀工作檔

- **發生條件與機率**：stage 了含金鑰的檔，之後只在編輯器刪掉金鑰、沒重新 stage 就 commit（漏擋）；反過來工作檔有金鑰、暫存區乾淨（誤擋）。要兩件事同時成立，頻率低，但正常操作就碰得到。
- **影響**：漏擋時金鑰進 commit，規劃文件直接推上公開的 `main`，收不回。
- **修法類型**：改用已有的唯一來源：暫存區（其他共用檢查都讀它）。
- **動到什麼**：`tools/secretlint.mjs` 一個檔與 `tests/quality.test.ts`；多一個暫存資料夾（掃完就刪）；看得到的行為只有擋與放的依據換成暫存區；改到共用的路徑，放進第二輪 L2。

### R2 相關測試由工作樹決定

- **發生條件與機率**：這次 commit 改到某份文件，而寫到它的測試（或 `src/core/ai/rules.ts`）有沒 stage 的修改；或工作樹有新加、沒 stage 的測試。文件與測試常分批 stage，兩個 session 也會共用 worktree，中等。
- **影響**：該跑的測試沒跑，壞掉的文件照樣 commit（漏跑）；或選到副本裡沒有的測試而擋下（誤擋）。
- **修法類型**：改用已有的唯一來源：這次比較的內容（`staged` 讀索引、`range` 讀 head 的樹）。
- **動到什麼**：`tools/dispatch.ts` 的 `relatedTests`、`tests/dispatch.test.ts`、`tests/hooks.test.ts`；不多狀態；看得到的行為只有選測試的依據；放進第二輪 L2。

### R3 舊版 hook 沒有轉交

- **發生條件與機率**：共用的 `core.hooksPath` 指到另一個還沒有這一步的 checkout（開 worktree 的工具會這樣改，〈平台事實〉），在新分支 commit。只在合併前的過渡期。
- **影響**：跑的是舊版 hook，外掛的路徑照舊規則；改了 Mindboard 的 commit 可能沒檢查就進去。
- **修法類型**：記成已知的限制。舊版 hook 是已經 commit 的程式，這一步改不到它；合併後主資料夾一更新就是新版，之後每個 checkout 的 hook 都會轉交。
- **動到什麼**：只改文件（backlog〈已知的限制〉、`docs/agents/quality.md`、任務說明驗收第 14 項），不再送 L2。

### R4 gate 缺理由或比較端點仍會通過

- **發生條件與機率**：之後改 workflow 的 step ID 或 job outputs，plan 的 `reasons`、`compare` 沒接上或型別不對。低。
- **影響**：gate 綠燈卻沒有分派的證據（跳過沒寫理由）；型別錯時摘要可能拋錯。
- **修法類型**：收窄：缺、空、型別錯都紅燈。
- **動到什麼**：`tools/ci-gate.ts` 的 `gate()`、`tests/ci-gate.test.ts`；看得到的行為只有多一種紅燈；放進第二輪 L2。

### R5 外掛 CI 把鎖檔讀取失敗當成沒有相依

- **發生條件與機率**：外掛第一次加相依時鎖檔沒同步，或鎖檔壞了、不存在。新外掛開始寫程式時就會碰到，中等。
- **影響**：相依沒裝、鎖檔不同步，job 照樣綠燈。
- **修法類型**：收窄：直接 `npm ci`，鎖檔的檢查交給 npm。
- **動到什麼**：`.github/workflows/check.yml` 兩個 job 的安裝步驟；看得到的行為只有鎖檔有問題時紅燈；放進第二輪 L2。

### R6 相依檢查漏掉 `file:~/…`

- **發生條件與機率**：外掛的 `package.json` 用 npm 會解析到外掛外的本機路徑寫法（`~/`、百分比編碼、反斜線等）。低。
- **影響**：相依跨出外掛，外掛只在開發者自己的電腦裝得起來。
- **修法類型**：收窄：改成白名單。
- **動到什麼**：`tools/check-plugin-imports.ts` 的 `checkPackage`、`tests/plugin-imports.test.ts`；看得到的行為只有多擋；放進第二輪 L2。

### 判斷與修正

- **R1 成立，一定修（`6b0a3a6`）**。自己在 `b8396a6` 重現：暫存區有金鑰、工作檔刪掉後 commit 成功。同一類（`--staged` 掃的不是這次 commit 的內容）還有一個：`--diff-filter=ACMR` 漏了型別變更 `T`，symlink 換成含金鑰的一般檔不會被掃，一起修。做法：`git checkout-index` 把這次 commit 的檔取到暫存資料夾，再照讀檔模式掃（二進位的判斷和預設模式一樣：`@secretlint/source-creator` 用 `istextorbinary`，二進位只跑支援 binary 的規則；stdin 模式一律當文字，沒採用）。回歸在 `tests/quality.test.ts` 的 D-141 測試：兩個方向、`-a`、`-- <路徑>`、別的檔已 stage、型別變更。300 個檔多約 0.2 秒。
- **R2 成立，修（`3c8a307`）**。`relatedTests` 改讀這次比較的內容：`--staged` 讀索引（hook 的環境裡就是這次 commit 用的索引），`--range` 讀 head 的樹；測試檔與 `src/core/ai/rules.ts` 都是。用 `b8396a6` 的 `dispatch.ts` 跑新的 hook 測試，停在第一段（只跑了 Capture，Cards 的相關測試漏掉），重現了報告的漏跑；反向（工作樹新加的測試被選到、副本裡沒有而擋下）在 `tests/dispatch.test.ts` 也重現了。
- **R3 成立，記成已知的限制（`a64ff61`）**。舊版 hook 是已經 commit 的程式，這一步沒辦法讓它轉交；合併後主資料夾一更新就是新版，之後每個 checkout 的 hook 都會轉交，真實路徑只在過渡期。報告建議「把重設相對 `.githooks` 落到已存在的安裝或開工入口」：已經是了（`tools/` 的 `prepare`），合併後在 `tools/` 跑 `npm ci` 就會改回相對的，寫進驗收第 14 項。寫進 backlog〈已知的限制〉、`docs/agents/quality.md`〈檢查指令〉的 worktree 那一點。
- **R4 成立，修（收窄，`3a236db`）**。`gate()` 對每個值先查型別：比較端點要是非空字串；`reasons` 要是物件，每個外掛的理由要是非空字串；結果與旗標型別錯時列成問題並附上值；摘要不會因型別錯拋錯，plan 失敗時照樣印得出表。
- **R5 成立，修（收窄，`acf0afe`）**。兩個 job 直接 `npm ci`。本機用 npm 11.6.2 驗了同步、不同步、壞掉、沒有鎖檔四種（審查請求〈第二輪〉的〈驗證方式〉）；沒有相依時 `npm ci` 成功、不建 `node_modules`，所以原本「跳過安裝」省不到東西。
- **R6 成立，修整類（收窄，`dfddc48`）**。改成白名單，「本機路徑」照 npm-package-arg 的分類擴大成整類（大小寫不分的 `file:`、`link:`、`git+file:`，與沒有協定的路徑寫法）。核對時更正一點：npm 11.6.2 在 Windows 把 `file:%2e%2e/…`、`FILE:../…` 解成外掛裡字面的資料夾名，沒有跑出去；真的會跑出去的是 `file:~/…`、`~/…`、不加協定的 `../…`、`lib/../../../src` 與 `git+file:`。白名單一律不收，放行的寫法和 npm 的解析對過。

這些修正改到共用的路徑，照 code-quality 放進第二輪 L2：[審查請求〈第二輪〉](../tasks/one-repo-step-1-review.md#第二輪)。

## 第二輪

審查範圍為分支 `claude/one-repo-step-1` 的 `b8396a60c093a8b051f73abc7b63749ff518235f..550351313d94c78a08b6e783c2e366bad95ba9cb`，依待審 commit 的 `tasks/one-repo-step-1-review.md`〈第二輪〉核對 R1、R2、R4～R6 的修正、R3 的限制紀錄及受影響呼叫端。基準仍為 `d655645`。本輪保留分支既有的〈Claude 回應〉，續寫於其後。

### R7｜[P2] 延續 R1，取出索引仍會套用工作樹的編碼屬性

- **軸與依據**　規格。審查請求的不可破壞性質第 2 點要求掃描這次 commit 的內容。R1 修正宣稱取出的是 commit 的位元組，但 `checkout-index` 仍執行 Git 的 checkout 轉換。
- **觸發、預期與實際**　stage 一個含假金鑰的 UTF-8 文件，再只在工作樹的 `.gitattributes` 為該檔加上 `working-tree-encoding=UTF-16LE`，保留屬性變更未暫存。預期掃描索引中的 UTF-8 內容並擋下。實際取出的副本變成 UTF-16LE，金鑰規則沒命中，pre-commit 成功，commit 仍含 UTF-8 假金鑰。關掉 `core.autocrlf` 只關掉其中一種轉換。
- **位置**　分支 `claude/one-repo-step-1` 的 `tools/secretlint.mjs:32–37,47–55`（`5503513`）。呼叫鏈為 `preCommit → runShared → secretlint --staged → checkout-index → scan`。第一輪直接讀工作檔也有這個缺口，本輪標為延續 R1。
- **證據**　**已重現完整原版 pre-commit**。在指定 SHA 的隔離 clone，只借用 `tools/node_modules`，保留原版 hook、共用檢查與外掛的檢查設定。先 stage 自編的 `docs/review-encoding.md`，再於工作樹追加它的編碼屬性。實際 `git commit` 結束碼為 `0`，摘要為共用檢查通過、三個外掛照分派表跳過，`git show HEAD:docs/review-encoding.md` 仍含樣本。另一個隔離探針確認一般 UTF-8 樣本會被目前掃描器擋下（`1`），取出時轉成 UTF-16LE 則回 `0`。全程使用和既有測試相同方式組出的假 token。
- **真實路徑與機率**　Git 支援的輸入可以走到，**機率低**。需要同時有金鑰、檔案已暫存，以及影響該檔的編碼屬性。指定 SHA 的 `.gitattributes` 只有 hook 的 LF 規則，沒有使用這種編碼屬性，目前既有檔案不會自行觸發。加入需轉碼的檔案，或編碼屬性與內容分批暫存時才有條件成立。公開 repo 的內容一旦 push，後續 CI 掃到時已經上傳。
- **建議處理**　用索引 blob 的原始位元組寫進現有暫存資料夾，再沿用讀檔掃描，可保留實作者要求的二進位判斷，也避開 checkout 的編碼與 filter 轉換。這是同一個「索引到掃描輸入」邊界，回歸應涵蓋 Git 轉換後內容與索引不同的整類情境。若依 D-207 選擇暫列已知限制，需把編碼屬性／checkout filter 的條件及避開方式明列，並修正「拿到 commit 的位元組」的保證。

### 第一輪修正的核對

| 項目 | 第二輪結果 |
|---|---|
| R1 | 原報告的部分暫存、`-a`、指定路徑與型別變更案例已補回歸，改為取索引內容；尚有 R7 的 checkout 轉換缺口。 |
| R2 | `relatedTests` 的測試檔與規則入口改讀索引或 range 的 head，未暫存的修改與新檔不再影響選擇；Git 失敗也回非零。相關的 dispatch 與實際 commit 回歸已納入完整檢查。 |
| R3 | 已在 backlog 與品質文件登錄限制，原有 `tools/` 的 `prepare` script 會重設相對 hook 路徑，合併後驗收也寫明更新主資料夾與各 worktree 安裝。舊入口仍屬已知限制。 |
| R4 | 缺少、空白與型別錯誤的比較端點、理由、旗標及結果會紅燈，摘要仍可生成；plan 失敗路徑保留。額外枚舉 110 組不合法輸入與 7 組合法對照，結果均符合契約，沒有拋錯。 |
| R5 | 兩個 CI job 都直接 `npm ci`。本機四組探針依序得到同步無相依 `0`、manifest 新增本機相依但鎖檔沒更新 `1/EUSAGE`、壞鎖檔 `1/EUSAGE`、缺鎖檔 `1/EUSAGE`。 |
| R6 | 原本的 `file:~/…`、跨外掛相對路徑及新增的本機相依案例已被收窄。另以本機 npm 11.6.2 的解析核對一般 `file:./lib`、裸相對路徑、壓縮檔與 Git URL，未找到新的跨出外掛漏擋。 |

### 本輪驗證與限制

- Windows、Git 2.52.0、Node 24.13.0、npm 11.6.2。待審 worktree 的 `docs/syntax.md` 只有既有換行差異。`git diff --check b8396a6 5503513` 通過。
- 在沙箱外對待審 worktree 執行 `npm run check`，結束碼 `0`，約 661 秒。型別、ESLint、knip、共用檢查與測試全程成功；3,011 項中 3,010 通過、0 失敗、1 項依 Windows 設定跳過（檔名含換行）。本輪新增的 dispatch、gate、本機相依與 hook／金鑰掃描回歸都在這次完整檢查內。續寫報告亦在隔離 clone 通過暫存文件、金鑰與本機路徑檢查。
- 已唯讀確認 `550351313d94c78a08b6e783c2e366bad95ba9cb` 的 push run，六個 job 均成功，Cards 的 check、build、audit 與 Capture、Mindboard 的 `npm ci` 均成功。[待審 SHA 的 GitHub Actions](https://github.com/kuohappiness/Essence-Cards/actions/runs/44149430456)
- R5 的 npm 探針使用隔離的無相依套件與自編本機 fixture，執行時加上 `--offline --ignore-scripts --no-audit --no-fund`，不同步案例明確得到鎖檔缺項錯誤。R7 的主要重現使用原版 hook，另有使用檢查替身的隔離探針確認已暫存的編碼屬性也能造成相同漏檢。
- 未另做 GitHub 紅燈探針、hook 強制終止後的暫存清理及各中間 SHA 的完整重跑。前者需要在 GitHub 建立探針，依請求權限交由 Claude；強制終止是請求已列的限制；中間 SHA 的執行紀錄沿用實作者提供的資料。R3 的舊入口程式本輪未改，沿用第一輪重現及本輪文件核對。Pages、手機畫面與產品功能未受此輪修正影響。

本輪結論止於 `550351313d94c78a08b6e783c2e366bad95ba9cb`。新增 R7 一項，其餘修正已核對，R3 維持已知限制。本輪交付為這份報告的續寫。

## Claude 回應（第二輪）

2026-11-18 Claude（Opus 5.5）。R7 在本機重現（Windows、Git 2.52，隔離的暫存 repo，`git -c core.autocrlf=false checkout-index`）：只在工作樹的 `working-tree-encoding=UTF-16LE` 讓取出的檔變成 UTF-16LE；`filter` 的 smudge 指令照樣執行、把金鑰改掉；`text eol=crlf` 照樣加上 `\r`。索引裡的 blob 都沒變。照 D-207 先寫四欄；修法要再送 L2，連同「不修」交給使用者，使用者選「修，送第三輪」。

### R7 取出時套用 .gitattributes 的轉換

- **發生條件與機率**：暫存區的檔含金鑰，而且 `.gitattributes`（已 stage 或只在工作樹）對它設了 `working-tree-encoding` 或 `filter`。這個 repo 只有 hook 的換行規則，正常使用碰不到；低。`eol`、`ident` 也會改位元組，但不會讓金鑰對不上。
- **影響**：金鑰進了 commit，push 後公開。CI 的預設模式讀 checkout 後的檔，照同樣的機制也看不到（推斷，沒實測）。
- **修法類型**：改用已有的唯一來源：從索引直接讀 blob（`ls-files -s` 與 `cat-file --batch`，R2 用的同一種讀法），照原樣寫進暫存資料夾，再照讀檔模式掃。不經過 checkout，Git 取出檔案時的轉換整類都不套用，pre-commit 也不再執行 filter 的指令。不加機制。
- **動到什麼**：`tools/secretlint.mjs` 取出的那一段、`tests/quality.test.ts` 的 D-141 測試；不多狀態；看得到的行為只有多擋這幾種情況，`npm run check` 與 CI 不變。改到高風險的共用路徑，要第三輪 L2。

### 判斷與修正

- **R7 成立，修（`a97aa2f`，使用者 2026-11-18 選「修，送第三輪」）**。是 R1 的第 2 代（同一類：`--staged` 掃的不是這次 commit 的內容），回歸改成列舉整類：Git 取出檔案時會套用的四種屬性（`working-tree-encoding`、`filter`、`text eol=crlf`、`ident`）× 已 stage／只在工作樹，八種都要擋下，而且 filter 的指令沒被執行（記號檔不存在）。修之前停在第一種（`working-tree-encoding`，只在工作樹）。301 個檔多約 0.1 秒（R1 版 1.07 秒、R7 版 1.17 秒，各跑 5 次）。
- 同一類、這次不改的兩處：
  - 預設模式（`npm run check`、CI）讀工作樹；CI 的工作樹是 checkout 出來的，有這兩種屬性時一樣看不到。只有沒經過 pre-commit 的 commit（例如在 GitHub 網頁上直接改）才只靠這一道，記進 backlog〈已知的限制〉。
  - pre-commit 跑外掛檢查的副本（`tools/hooks.ts`）也用 `checkout-index`：那份副本本來就要和 checkout 一樣（CI 也是 checkout 後才跑），不改。只有沒 stage 的 `.gitattributes` 會讓副本和 CI 不同，結果是本機與 CI 的檢查結果不一致，CI 照樣是後盾。

這個修正放進第三輪 L2：[審查請求〈第三輪〉](../tasks/one-repo-step-1-review.md#第三輪)。

## 第三輪

審查範圍為分支 `claude/one-repo-step-1` 的 `550351313d94c78a08b6e783c2e366bad95ba9cb..c3aa6ebea30bb4f2cffa36d452f1be75cb7a1a9e`。依待審 commit 的 `tasks/one-repo-step-1-review.md`〈第三輪〉核對 R7 修正、回歸測試及 `pre-commit`／`pre-merge-commit` 共用的 `secretlint --staged` 呼叫端。

**R7 的 checkout 轉換漏檢已修正。** 取出邏輯以索引的 stage 0 物件 ID 讀原始 blob。獨立探針用檔名含空白與中括號的 UTF-8 樣本重跑編碼、filter、換行及 `ident` 四種屬性，涵蓋只在工作樹與已暫存兩種情況。八種都由金鑰規則擋下，smudge 沒有執行。預設掃描模式繼續讀 checkout 後的工作檔，這個限制已記進待審分支的 `docs/backlog.md`。

### R8｜[P2] R7 修正引入：Windows 暫存副本可覆寫尚未掃描的內容

- **軸與依據**　規格。審查請求的不可破壞性質第 2、5 點要求掃描這次提交的內容，合併索引裡的違規也要擋下。
- **觸發、預期與實際**　Windows 在不分大小寫的檔案系統上，合併索引同時新增 `docs/Review-Case.md` 與 `docs/review-case.md`，前一份含假金鑰。`extract()` 先寫出含樣本的 blob，再用預設覆寫模式把另一份寫到同一實體檔，兩個路徑讀到的都是後寫的內容。應逐份掃描，或在目的路徑重疊時回報並擋下。新版以成功結束，原始樣本留在合併 commit。
- **位置與證據**　分支 `claude/one-repo-step-1` 的 `tools/secretlint.mjs:40–66,77–82` 及 `tools/hooks.ts:12–19,27–32,187–192`（`c3aa6eb`）。**已重現**。在指定 SHA 的隔離 clone 用原版 `.githooks/pre-merge-commit` 做 `git merge --no-ff`。只加入含假 token 的單檔時，金鑰掃描命中，合併回 `1`。合併含兩個路徑的自編 commit 時，實際回 `0`，以 `git show HEAD:<路徑>` 核對合併樹仍有兩份各自的 blob。探針選非 `main` 分支，原版 hook 照常跑共用檢查，無須查 GitHub。另一個隔離探針用上一版的 `checkout-index` 命令對同一種索引取檔，第二份得到 `already exists, no checkout` 且結束碼為 `1`，所以這個輸入在上一版會擋下。
- **真實路徑與機率**　Git 的一般合併路徑可到達。區分大小寫的工作樹可以提交兩個路徑，Windows 合併時可以把兩份都帶進索引。指定 SHA 沒有這類路徑。要同時有兩個名稱衝突的路徑進入本次掃描，而且先被寫出的 blob 含金鑰，機率低。若後續把合併結果推到公開 repo，CI 發現時內容已經上傳。
- **建議處理**　合併前讓暫存副本只建立新檔。`writeFileSync` 用 `flag: 'wx'` 時，隔離探針的第二次寫入會回 `EEXIST`，第一份內容原樣保留。現有 `extract()` 的錯誤路徑可以回報並擋下。用原版合併 hook 覆蓋目的檔碰撞的情況；不分大小寫的檔案系統應明確擋下，能保留兩份的檔案系統應逐份掃描。

### 本輪驗證與限制

- Windows、Git for Windows 2.52.0、Node 24.13.0、npm 11.6.2。`git diff --check 5503513 c3aa6eb` 通過。待審 worktree 的 `docs/syntax.md` 只有既有的換行差異。
- 在沙箱外對待審 worktree 執行 `npm run check`，結束碼 `0`，約 711 秒。型別、ESLint、knip、共用檢查與測試均成功，3,011 項中 3,010 通過、0 失敗、1 項依 Windows 設定跳過（檔名含換行）。R7 的屬性測試及 R1 的原有回歸都在這次完整檢查內。
- 已唯讀確認 `c3aa6ebea30bb4f2cffa36d452f1be75cb7a1a9e` 的 push run，plan、shared、Cards、Capture、Mindboard 與 gate 六個 job 皆成功。[待審 commit 的 GitHub Actions](https://github.com/kuohappiness/Essence-Cards/actions/runs/44201666829)
- R8 的探針使用自編假金鑰。未另在 GitHub 提交紅燈探針，合併行為已在本機原版 hook 重現。hook 強制終止後的暫存清理與預設模式在 Actions 遇到 checkout 轉換的情況，依請求沿用限制紀錄。

本輪審查止於 `c3aa6ebea30bb4f2cffa36d452f1be75cb7a1a9e`。R7 的 checkout 轉換問題已修正，建議在合併前處理 R8 的路徑碰撞。

## Claude 回應（第三輪）

2026-11-18 Claude（Opus 5.5）。R8 在本機重現（Windows、Git 2.52，隔離的暫存 repo）：`git update-index --cacheinfo` 做得出只差大小寫的兩個索引項目；上一版的 `checkout-index` 對第二份報 `already exists, no checkout`、結束碼 1，所以上一版會擋下。第三輪審查請求〈實作者自己選的做法〉第 4 點寫「`checkout-index` 也一樣」，是錯的：沒驗就寫了，R7 的寫法讓這種情況從擋下變成放行。照 D-207 先寫四欄；修法要再送 L2，交給使用者選，使用者選「修，送第四輪」。

### R8 只差大小寫的兩個路徑寫成同一個檔

- **發生條件與機率**：在不分大小寫的檔案系統（Windows、macOS 預設）上，這次 commit 或合併的索引同時有只差大小寫的兩個路徑（檔名或資料夾名），而且排在前面、先寫出的那份含金鑰。Windows 的 `git add` 加不進來，但合併在區分大小寫的系統上做的分支就會帶進來（第三輪用原版 pre-merge-commit 重現）。這個 repo 沒有這類路徑；低。
- **影響**：金鑰進了 commit（含合併 commit），push 後公開；CI 在 Linux 兩份都看得到、會紅燈，但那時已經上傳。上一版在這裡會擋下，是 R7 帶出的退步。
- **修法類型**：收窄：寫檔改成只建立新檔（`flag: 'wx'`），撞到已經寫出的檔就擋下，訊息寫出兩個路徑。區分大小寫的檔案系統照常兩份都掃。不加機制。
- **動到什麼**：`tools/secretlint.mjs` 寫檔那一段與錯誤訊息、`tests/quality.test.ts` 的 D-141 測試；不多狀態；看得到的行為只有多擋這種情況。改到高風險的共用路徑，要第四輪 L2；照 code-quality，第四輪之後還有擋合併的發現就停下來交給使用者。

### 判斷與修正

- **R8 成立，修（`893f43b`，使用者 2026-11-18 選「修，送第四輪」）**。同一類（掃到的不是這次 commit 的內容）的第 3 代（R1 → R7 → R8），照 code-quality 不加機制、回到收窄。回歸列舉整類：檔名只差大小寫、資料夾只差大小寫，金鑰放在先寫出的那份；Linux 要被金鑰規則擋下，Windows 與 macOS 要以「同一個檔」擋下。修之前在 Windows 停在第一種（commit 成功）。任何讓兩個路徑落到同一個檔的情況（例如 macOS 的 Unicode 正規化）都由 `wx` 擋下。

這個修正放進第四輪 L2：[審查請求〈第四輪〉](../tasks/one-repo-step-1-review.md#第四輪)。

## 第四輪

審查範圍為分支 `claude/one-repo-step-1` 的 `c3aa6ebea30bb4f2cffa36d452f1be75cb7a1a9e..2255c5688d09bcf329b1912c13b78b5e0989a470`。依待審 commit 的 `tasks/one-repo-step-1-review.md`〈第四輪〉核對 R8 修正、回歸測試，以及兩個 hook 共用的 `secretlint --staged` 呼叫端。

**R8 已修正，本輪無新增擋合併的發現。** `tools/secretlint.mjs:61–79` 用 `wx` 建立暫存檔，目的地已存在時會停止取檔並回報，`runShared()` 便擋下提交。判斷取決於實際檔案系統。大小寫比對只用來找出錯誤訊息要列的另一條路徑。

- 在指定 SHA 的獨立 Windows clone，以原版 `pre-merge-commit` 跑 `git merge --no-ff`。檔名只差大小寫及目錄名只差大小寫兩案都回 `1`，訊息列出兩個衝突路徑，`HEAD` 仍在合併前。單檔含假金鑰由 GitHub token 規則正常擋下，兩個互不碰撞的乾淨檔可成功合併。
- 另以 `secretlint --staged` 驗證目錄先建立再遭遇同名檔、檔案先建立再遭遇同名目錄的兩種順序。取檔均回 `1` 並回報失敗。

### R9｜[P3] R8 修正引入：回歸測試用作業系統推定檔案系統是否區分大小寫

- **軸與依據**　規範與設計。第四輪規格以暫存檔所在的檔案系統決定預期行為，回歸測試應能驗出相同的契約。
- **觸發、預期與實際**　Windows 的暫存目錄若設定為區分大小寫，掃描器會保留兩份檔案，再由金鑰規則擋下。D-141 測試在 Windows 固定期待「同一個檔」，所以正確擋下的提交會被測試報成失敗。
- **位置與證據**　分支 `claude/one-repo-step-1` 的 `tests/quality.test.ts:181–184`（`2255c56`）。**已重現**。在隔離暫存目錄啟用 Windows 的大小寫區分，先確認子目錄可各自用 `wx` 寫入 `Test` 和 `test`，再只對該測試子程序設定暫存路徑。執行 `node --test --test-name-pattern=D-141 tests/quality.test.ts`，第一個 `docs/Case.md` 案例以 `secretlint-rule-github` 擋下提交，測試因等待 `/同一個檔/` 而回 `1`。
- **真實路徑與建議**　要在和目前 Windows／Ubuntu CI 測試環境不同的暫存檔案系統設定下執行，機率低。影響測試可攜性，實測金鑰仍被擋下，本輪不列為合併阻擋項。日後可讓回歸在掃描器使用的暫存位置先探測大小寫行為，再選擇預期訊息。

### 本輪驗證與限制

- Windows、Git for Windows 2.52.0、Node 24.13.0、npm 11.6.2。`git diff --check c3aa6eb 2255c56` 通過。待審 worktree 的 `docs/syntax.md` 只有既有換行差異。
- 在沙箱外對待審 worktree 執行 `npm run check`，結束碼 `0`，約 709 秒。型別、ESLint、knip、共用檢查及測試均成功，3,011 項中 3,010 通過、0 失敗、1 項依 Windows 設定跳過（檔名含換行）。本輪 R8 與既有 R1、R7 回歸都在這次完整檢查內。R9 在另設的區分大小寫暫存目錄單獨重現。
- 已唯讀核對 `2255c5688d09bcf329b1912c13b78b5e0989a470` 的 push run，plan、shared、Cards、Capture、Mindboard 與 gate 六個 job 均成功。Linux 的 Cards job 日誌顯示 D-141 通過。兩個大小寫案例在此環境都由金鑰規則擋下。[待審 commit 的 GitHub Actions](https://github.com/kuohappiness/Essence-Cards/actions/runs/44208414472) · [Cards job](https://github.com/kuohappiness/Essence-Cards/actions/runs/44208414472/job/134480322299)
- 未獨立驗證 macOS 的 Unicode 正規化，因本機沒有 macOS 測試環境。hook 強制終止後的暫存清理沿用既有的限制紀錄，本輪以 Windows 碰撞和正常掃描路徑為範圍。

本輪結論止於 `2255c5688d09bcf329b1912c13b78b5e0989a470`。R8 再審通過，R9 僅影響使用特定暫存目錄設定時的回歸測試。

## Claude 回應（第四輪）

2026-11-18 Claude（Opus 5.5）。R9 在本機重現：在 scratchpad 建一個資料夾，用 `fsutil file setCaseSensitiveInfo` 設成區分大小寫（子資料夾跟著繼承，`Case`、`case` 兩個都寫得進去），把 `TMP`、`TEMP` 指到那裡跑 D-141 測試：commit 被 `secretlint-rule-github` 正確擋下，測試卻因為等的是「同一個檔」而失敗。

### R9 回歸測試用作業系統猜暫存資料夾分不分大小寫

- **發生條件與機率**：在暫存資料夾的大小寫行為和作業系統預設不同的環境跑測試（Windows 設成區分大小寫的資料夾、macOS 的區分大小寫 APFS、Linux 的 casefold 資料夾）。目前的 Windows 本機與 Ubuntu CI 都不是；低。
- **影響**：只有測試誤報失敗，金鑰照樣擋下；不影響 hook 與 CI 的防線。
- **修法類型**：改用已有的唯一來源：測試在系統暫存資料夾（掃描器建副本的地方）用兩次只建立新檔的寫入探一次，照結果選預期的訊息。不加機制。
- **動到什麼**：只有 `tests/quality.test.ts` 的 D-141 測試；程式與看得到的行為都不變，不必再送 L2。

### 判斷與修正

- **R9 成立，修（`d7e2a0b`）**。照 D-207，修法不加機制、不必再送 L2，直接修。修之前用上面的區分大小寫資料夾跑是失敗的；修之後在那個資料夾與預設的暫存資料夾各跑一次都通過。
- 四輪 L2 到此：R1～R9 都處理了，R3 記成已知的限制，其餘修了；第四輪沒有擋合併的發現。
