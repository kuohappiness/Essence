# 新專案的初始架構：起步包與成長包（給 Claude，雲端執行）

狀態：實作中｜下一步：第 3 批（成長包）PR 等使用者同意合併；接著做第 4 批（演練與收尾）｜等誰：使用者、Claude

來自：[D-247](../decisions.md#d-247-新專案的初始架構分起步包與成長包防線第-0-天就帶)

遵守 repo 根目錄的 `AGENTS.md`。建議模型與推理等級：**Opus、高**。規劃由 Fable 5.2（xhigh）在「新專案初始化模板」串做完，使用者 2026-11-28 定稿；規劃稿是 Claude Doc「新專案初始化模板｜規劃稿」，要用的內容都已寫進這份，實作不必回頭讀它。雲端做得了：不碰 Obsidian、vault 與使用者的資料（[quality.md〈本機或雲端〉](../agents/quality.md#本機或雲端)）。不在[高風險範圍](../agents/quality.md#高風險範圍要做-l2)，做 L1；獨立的一眼由〈7〉的冷讀演練擔任。分派表只加一條路徑規則；如果做到一半發現要改分派的邏輯本身，停下來照 quality.md 做 L2。

依據：[D-247](../decisions.md#d-247-新專案的初始架構分起步包與成長包防線第-0-天就帶)（這份的九點）、[D-216](../decisions.md#d-216-給其他專案的初始架構essence-裡的一包檔案用前先看是不是最新)（位置、不持續維護、不提 Essence）、[D-242](../decisions.md#d-242-開工前先看有沒有人在改同一樣東西)（開工前先看）、[D-245](../decisions.md#d-245-ci-只在-push-跑main-要-gate-綠燈才合得進去)（CI 與 `main` 的保護）、[D-147](../decisions.md#d-147-agentsmd-的寫法底線在上新增規則先過五關)（AGENTS.md 的寫法）、[D-195](../decisions.md#d-195-測試分兩類改不回來的做足其餘延後但不漏)（測試分兩類）。

## 0. 一段話

在 Essence 最上層新增 `templates/project-starter/`，裡面三樣：`files/` 是起步包，新專案第 0 天整包複製過去；`growth/` 是成長包，條件到了才拿；`README.md` 是使用說明，不複製。起步包讓一個空的 repo 第一天就有：一份短的全專案規則、一頁工作流程、三類入口文件、三個 skill，以及擋得住「改不回來的事」的幾道防線。第一個 session 照 `SETUP.md` 一次問使用者一題，把答案填進空格，再做三步設定。

## 1. 和「不做」比較（D-153、D-177）

- **不做會怎樣**：每開一個新專案，從頭建流程，或請 Claude 現場從 Essence 整理一次，每次花時間與 token，結果每次不同。Essence 走過的坑會再走一次：專案討論串的雲端 session 不跑 repo 的 hook（2026-11-26 才查到）、PR #45 沒跑檢查就 commit、`main` 沒有保護時紅燈也合得進去、兩個 session 取到同一個決定編號。使用者手上已經有下一個專案（iStock）要開。
- **做了以後**：新專案複製一包檔案、回答八個問題、做三步設定，就有 Essence 現在用的做法，而且只帶小專案用得到的部分。
- **做的代價**：`files/` 約 23 個檔，四支小程式；成長包三支小工具；Essence 這邊多三處登記與幾個測試。模板不持續維護，放久了會和 Essence 的做法有落差：使用說明記整理自哪個 commit，用前先比對（〈6〉）。
- **更小的做法**：只帶文件與 skill，不帶防線（D-216 原樣）。不採用，理由在 D-247 第 2 點。

## 2. 範圍：三個資料夾

```text
templates/project-starter/
├─ README.md        使用說明（不複製）：用前先看是不是最新、怎麼複製、開專案時要貼的設定、成長包怎麼拿
├─ files/           起步包（〈3〉），整包複製進新專案的根目錄
└─ growth/          成長包（〈5〉），不複製；每個條件一份做法，加三支做好的小工具
```

共同的規定：

- **不帶 Essence 的東西**：`files/` 與 `growth/` 不出現 Essence、Cards、Capture、Mindboard、Portal、Obsidian、vault，也不出現 Essence 的決定編號；規則直接寫一句理由。唯一的例外是 `files/docs/workflow.md` 最後那一行出處。範例用的決定編號只用 `D-001`～`D-003` 與 `D-xxx`。
- **不用安裝套件**：`files/` 與 `growth/` 的程式都是 `.mjs`，只用 Node 內建的模組，Node 20 以上直接跑。Essence 自己的工具是 `.ts`、要 Node 24，不能照搬副檔名。
- **留空格的地方用同一種記號**：`【待填：要填什麼】`。檢查會數還剩幾個。
- **語言**：文件用繁體中文寫，commit 訊息預設英文；`SETUP.md` 第 8 題讓新專案改。
- **角色不寫模型名稱**：寫規劃者、實作者、獨立查核者。

## 3. 起步包 `files/`

```text
AGENTS.md                     全專案規則：底線、目的（留空格）、開工前、文件分工、和使用者合作、實作與 Git、改規則的五關
CLAUDE.md                     一行，指到 AGENTS.md
SETUP.md                      第一個 session 照著問、照著設定的清單；做完就刪
docs/workflow.md              一頁：點子到完成的路線、每類文件的用途與終點、連結寫法、
                              什麼才寫成決定、開工前先看、進度放檔案還是 Issues、成長條件；最後一行是出處
docs/roadmap.md               現在在哪裡、等觸發點、已完成
docs/backlog.md               待處理（含技術債、已知的限制）、已轉出
docs/decisions/               一條決定一個檔；README.md 是索引與寫法
docs/agents/quality.md        角色、本機或雲端、檢查指令、高風險範圍（留空格）、測試分兩類、卡關升級
.claude/skills/               discuss、decision、code-quality
.claude/settings.json         接上下面兩支 hook
.claude/hooks/block-dangerous-git.mjs   擋危險的 git 指令
.claude/hooks/cloud-setup.mjs           雲端開場：設 git hook、把上面的 hook 接到專案討論串
.githooks/pre-commit          呼叫 tools/check.mjs
tools/check.mjs               金鑰掃描、還沒填的空格、連到不存在的檔、git hook 有沒有執行權限
tools/in-flight.mjs           開工前先看：開著的 PR 改到哪些檔、下一個決定編號
.github/workflows/check.yml   只在 push 跑同一支檢查；最後一關名稱固定
.github/ruleset-main.json     main 的保護規則：最後一關要過、不能 force push 與刪除
.gitignore、.gitattributes
```

### 3-1 文件

- **`AGENTS.md`**：照 Essence 的 `AGENTS.md` 的骨架（底線在最上面，[D-147](../decisions.md#d-147-agentsmd-的寫法底線在上新增規則先過五關)），目標一頁以內。
  - 〈底線〉帶通用的七條：不提交金鑰與憑證；不 force push；不用 `--no-verify`；不用 `git add -A`；使用者沒有明確同意不標 ✅；任務說明沒寫到、做了很難收回的步驟停下來問；沒做完的不寫成已可使用。再留一格 `【待填：這個專案特有、絕對不能做的事】`。
  - 〈目的〉留空格（目的、做成功的樣子），保留通用的最高原則：先問會不會明顯更好、每個提案和「不做」比。
  - 〈開始工作前〉：先讀 `docs/roadmap.md`〈現在在哪裡〉；開工改檔、取決定編號前跑 `node tools/in-flight.mjs`，也看正在跑的討論串，受影響的那段等那邊合併或談定再做；判斷本機或雲端；先載入對應的 skill。
  - 〈文件分工〉：同一類資訊只維護一份；狀態標示（✅、💬、💡）；新點子先記 backlog；語言。
  - 〈和使用者合作〉：D-247 第 6 點的七條裡的前五條與第七條。第六條（所有改動都走 PR，只改文件的 PR 交給 GitHub 自動合併）放〈實作與 Git〉，並寫明保護規則還沒設好之前不開自動合併。
  - 〈實作與 Git〉：AI 能測的由 AI 測；延後的測試記進 backlog 的技術債表。
  - 〈改這份檔案〉：新增規則先過五關，拿掉「附 D-ID」裡 Essence 的編號，其餘照搬。
  - 不要帶「規劃文件直接 push 到 `main`」這種句子（Essence 已經不能這樣做）。
- **`docs/workflow.md`**：從 Essence 的 [`docs/agents/workflow.md`](../agents/workflow.md) 縮成一頁。拿掉軟體分層、任務說明、plans、討論稿與狀態板工具（這些在成長包）。保留：路線（點子 → backlog → 討論 → 決定 → 實作 → roadmap〈已完成〉）、每類文件的用途與終點、「來自」與「→」怎麼寫、什麼才寫成決定、〈開工前先看〉（照 D-242 談定的版本：工具只列檔名；「同一樣東西」也包含手上工作照著用的標準、規則或工具；有重疊就拆開，受影響的那段等，並告訴使用者在等哪一串的什麼；分支上寫了決定，合併前再跑一次）、進度放檔案還是 Issues 的判斷表、成長條件表（〈5〉的那張，每一列寫去 `growth/` 的哪一份拿）。最後一行：`模板來源：<Essence 的 repo 網址> 的 templates/project-starter（commit <短 hash>，YYYY-MM-DD 整理）`。
- **`docs/roadmap.md`、`docs/backlog.md`**：空白範本，分區照 Essence 的做法（roadmap 三節；backlog 兩節，〈待處理〉底下有技術債與已知的限制兩張空表）。起步包的狀態板是手寫的一張小表；改由工具產生是成長包的事。
- **`docs/decisions/`**：`README.md` 寫索引（表：編號、一句話、日期、狀態）與一條決定的寫法（檔名 `D-001.md`；標題、狀態行、一句話、決定、理由、曾考慮的做法且第一項是「不做」）。放一條 `D-001.md` 當實例：內容是「這個專案採用這套初始架構」，日期與細節留空格，由第一個 session 填。
- **`docs/agents/quality.md`**：照 Essence [最上層那份](../agents/quality.md)的通用部分。標題要和 code-quality 這個 skill 讀的標題對得上（先讀 skill 裡提到哪幾節）。角色由誰做、哪些工作一定在本機、高風險範圍三處留空格；檢查指令只有 `node tools/check.mjs`。
- **`SETUP.md`**：見〈4〉。

### 3-2 三個 skill

從 Essence 的 `.claude/skills/` 改寫，名字不帶 `essence-`：

- `discuss`（來自 essence-discuss）：拿掉教材、外掛、試作場、Codex 的字眼；第二個 AI 的部分只留一句「有獨立查核者時，重大決策的第一輪各自獨立，做法在成長包」。
- `decision`（來自 essence-decision）：改成一條一檔（新增 `docs/decisions/D-xxx.md`、在 `README.md` 的索引加一行、編號看 `node tools/in-flight.mjs` 的最後一行、合併前再跑一次）；拿掉索引工具與「現行寫在」的步驟。
- `code-quality`：已經是通用寫法，連同 `UPSTREAM.md`（上游的 MIT 授權全文）一起帶；檢查有沒有提到 Essence 專屬的檔名，有就改成 `docs/agents/quality.md` 的對應標題。
- Essence 每個 skill 底下的 `agents/`（給第二個 AI 用的那份）不帶；skill 的第二份副本與一致性檢查在成長包。

### 3-3 四支程式

| 檔 | 怎麼來 | 要做到 |
|---|---|---|
| `.claude/hooks/block-dangerous-git.mjs` | 照搬 Essence 的同名檔 | 註解與訊息裡 Essence 的決定編號換成一句理由；規則不動 |
| `.claude/hooks/cloud-setup.mjs` | 照 Essence 的同名檔縮小 | 只在雲端跑；設 `core.hooksPath`；加 `--setup-script` 時把 repo 的 `.claude/settings.json` 的 hook 抄進使用者層級的設定（絕對路徑、重跑結果一樣、專案資料夾就是 repo 時不跑兩次）。拿掉找 Node 24、補 git tag、`npm ci` 三段（裝套件是成長包）。任何一步出錯都只寫一句、照樣結束在 0：這支失敗會擋住討論串開場 |
| `tools/check.mjs` | 新寫，約 150 行 | 四件事，見下面 |
| `tools/in-flight.mjs` | 照 Essence 的 `tools/in-flight.ts` 改 | 拿掉對 `tools/apps.ts` 的相依（檔名分組一律看到第二層資料夾）；決定編號改成讀 `docs/decisions/D-<數字>.md`：`origin/main` 上有的，加上開著的 PR 新增的檔名，最後一行印下一個可以用的編號；有 PR 沒查完時不給編號。只印檔名、不讀修改內容，這一點照舊 |

`tools/check.mjs` 的四件事（`--staged` 給 pre-commit 用，只看暫存區；不加參數看整個 repo，給 CI 用）：

1. **金鑰**：常見的金鑰樣式（私鑰區塊、GitHub、AWS、OpenAI、Anthropic、Google、Slack 的金鑰格式）與 `.env` 檔。Essence 的 `tools/secretlint.mjs` 與它的測試可以當樣式的參考，但不能引用套件。
2. **還沒填的空格**：數 `【待填：` 的個數並印出來。`SETUP.md` 還在時只報數字、不擋（空的 repo 第一個 commit 一定有空格）；`SETUP.md` 刪掉之後還有空格就擋。
3. **連到不存在的檔**：Markdown 的相對連結，目標檔或資料夾要在；錨點不查。
4. **git hook 的執行權限**：`.githooks/` 底下每一支在 git 裡的模式都要是可執行（讀 `git ls-files -s`）。在 Windows 新增的 hook 預設沒有執行權限，Linux 的 git 會不報錯地略過它。

每一項擋下時，訊息寫出哪個檔、哪一行、怎麼修。

### 3-4 git hook、CI 與保護規則

- **`.githooks/pre-commit`**：`exec node tools/check.mjs --staged`。檔案要以可執行的模式 commit 進 Essence。
- **`.github/workflows/check.yml`**：`on: [push]`，不聽 `pull_request`；新的 push 不取消舊的 run。一個 job 跑 `node tools/check.mjs`；最後一個 job 名稱固定叫 `gate`，不論前面成功、失敗或被取消都會跑，前面不是全部成功就失敗。`gate` 不能設「只在某些檔改動時才跑」，不然有些 PR 永遠等不到它。理由都在 [D-245](../decisions.md#d-245-ci-只在-push-跑main-要-gate-綠燈才合得進去)。
- **`.github/ruleset-main.json`**：照 Essence `main` 現在的規則寫成一份可以直接送給 GitHub 的檔：對象是預設分支；必過 `gate`（來源是 GitHub Actions）；禁 force push；禁刪除；不設例外名單；不要求分支先跟上 `main`。寫成檔案，是為了用 `gh api --method POST repos/<owner>/<repo>/rulesets --input .github/ruleset-main.json` 送出時避開 Windows 指令列的引號問題。
- **`.claude/settings.json`**：`SessionStart` 跑 `cloud-setup.mjs`，`PreToolUse`（Bash 與 PowerShell）跑 `block-dangerous-git.mjs`。不帶 Essence 的 `autoCompactWindow` 與 `ci-status.mjs`。
- **`.gitattributes`**：文字檔一律 LF（Windows 取出成 CRLF 會讓 hook 與比對出錯）。**`.gitignore`**：`node_modules/`、`.env*`、`.local/`、作業系統的雜檔。

## 4. `SETUP.md`：第一個 session 做什麼

寫給新專案的第一個 Claude 讀。開頭說明：一次問使用者一題、每題附建議；問完把答案寫進對應的檔；三步設定做完、核對過，就刪掉這份檔。

八個問題（每題寫明答案填到哪個檔的哪一格）：

1. 這個專案的目的，和做成功是什麼樣子。
2. 這個專案特有、絕對不能做的事。
3. repo 公開還是私人：影響金鑰與私人字詞的防線、CI 的分鐘數、`main` 的保護規則能不能用。
4. 做錯了改不回來的範圍：之後要做足測試、請獨立查核者看的地方。
5. 規劃、實作、獨立查核各由誰做，有沒有第二個 AI。
6. 進度放 repo 的檔案還是 GitHub Issues（附判斷表）。
7. 哪些工作一定要在使用者的電腦做，其餘放雲端。
8. 文件與 commit 用什麼語言。

三步設定，順序固定。能由 Claude 用工具做的由 Claude 做；只有使用者能做的，給連結和「做完會看到什麼」。設定頁的位置會變，`SETUP.md` 不寫死畫面上的路徑，請 Claude 做的時候查當時的官方說明。

1. **建這個專案自己的雲端環境**：setup script 只放幾行，呼叫 repo 裡的 `.claude/hooks/cloud-setup.mjs --setup-script`，出錯不擋開場（寫法參考 Essence [quality.md〈本機或雲端〉](../agents/quality.md#本機或雲端)裡那一段，把資料夾名稱換成參數）；再到專案設定選這個環境。
2. **用使用者的帳號建 `main` 的保護規則**：內容就是 `.github/ruleset-main.json`，建完讀回來確認。由 Claude 在使用者的電腦上代做時，要先請使用者在對話裡明確說同意，不然會被安全檢查擋下。私人 repo 要看 GitHub 的方案支不支援：不支援就跳過，記進 backlog 的已知限制，文件 PR 改由 Claude 等綠燈再合併。
3. **保護規則設好之後，才打開文件 PR 的自動合併**。順序反了會不等檢查就合併。

空的 repo 的順序：模板的檔案是第一個 commit，在保護規則設好之前直接推上 `main`，讓檢查先跑過一次；之後才設保護規則，從第二個改動開始都走 PR。

三步做完，由 Claude 開一個新的討論串核對（〈7〉第 3、4 項的內容），再刪 `SETUP.md`。

## 5. 成長包 `growth/`

`growth/README.md` 放這張表，每個條件一份短的做法（`growth/<主題>.md`）；`files/docs/workflow.md` 的成長條件表是它的摘要。

| 條件到了 | 加什麼 | 模板給什麼 |
|---|---|---|
| 第一次要把工作交給另一個 session，或規格寫超過一段 | `docs/tasks/`、入口的狀態行；狀態板改由工具整份產生 | 做法，加 `status-board.mjs` |
| 一個主題要談好幾輪 | `docs/plans/` | 做法 |
| 有第二個 AI 可以查核，高風險範圍也不是空的 | 討論稿、第一輪各自獨立、合併前的獨立審查、skill 的第二份副本與一致性檢查 | 做法；呼叫的指令寫「參考模板來源的現行版本」 |
| 有一份文件超過約 2 萬字，或決定超過 30 條 | 只讀一節的小工具；決定的索引改由工具產生 | `section.mjs`、`decisions-index.mjs` |
| repo 公開，又有不能公開的名字或路徑 | 私人字詞檢查，清單只放本機 | 做法 |
| 專案開始裝套件（有鎖檔） | 雲端開場加裝套件；提交前先比對已裝的套件和鎖檔，對不上就說哪個資料夾要重裝 | 做法 |
| 第一個里程碑完成 | 回顧與安全檢查 | code-quality 已內含，寫一句指過去 |
| 出現第二個子專案 | 每個子專案自己的資料夾與規則；專用的品質設定放子專案自己的 `docs/quality.md`，標題和通用那份對應 | 做法 |

三支小工具放 `growth/tools/`，都有 `--check`（只比對、不寫檔，給 pre-commit 與 CI 用）：

- **`section.mjs`**：照 Essence 的 `tools/section.ts` 改成 `.mjs`；印一份 Markdown 裡某個標題的那一節，找不到時列出全部標題與字數。
- **`status-board.mjs`**：新寫，不搬 Essence 的 `tools/roadmap-sync.ts`。讀 `docs/tasks/`、`docs/plans/` 每份文件標題下的狀態行（`狀態：…｜下一步：…｜等誰：…`，或收尾的 `狀態：已合併｜完成：…｜等誰：—`），整份重寫 `docs/roadmap.md` 的三節：進行中的進〈現在在哪裡〉、等觸發點的進〈等觸發點〉、結束的進〈已完成〉（日期取那份文件最後一次改動的 commit）。不比對歷史、不認舊格式；衝突時重跑一次。狀態行格式不對就報出檔名與原因。
- **`decisions-index.mjs`**：讀 `docs/decisions/D-*.md` 的標題、狀態行與一句話，重寫 `README.md` 的索引表（表前後用固定的記號框住，其餘內容不動）。

## 6. 使用說明 `README.md` 與 Essence 這邊要改的

`templates/project-starter/README.md` 寫給使用者與 Claude：

- **用前先看是不是最新**：記這包整理自 Essence 哪一天、哪個 commit；列出它對應的流程文件（`AGENTS.md`、`docs/agents/workflow.md`、`docs/agents/quality.md`、`.claude/`、`.githooks/`、`tools/in-flight.ts`、`.github/workflows/check.yml`），附一行 `git log <commit>.. -- <這些路徑>`；有改就先更新這包再複製。
- **怎麼複製**：本機與雲端各一種寫得出來、實測過的指令（〈7〉第 6 項）。複製後確認 `.githooks/` 的檔在 git 裡是可執行的模式。已經有內容的 repo：不覆蓋既有的檔，逐檔比對後併入。
- **開專案時要貼到 Claude 專案設定的文字**：一段「對話很長、或被自動摘要過時，主動提醒使用者，並建議把重要結論寫進 repo 的文件或專案記憶，必要時另開新串」。
- **成長包在哪、怎麼拿**；**要真的 repo 才驗得了的兩項**（〈7〉第 3、4 項）給第一個專案照做的清單。

Essence 這邊：

- **分派表**（`tools/dispatch.ts`）：`templates/` 登記成只需共用檢查的路徑，不觸發任何軟體的完整檢查；改到 `templates/project-starter/` 時要跑到〈7〉寫的那幾個測試。
- **文件檢查**：`templates/` 裡的 Markdown 照常查連結。Essence 專為自己的 roadmap、backlog、決策紀錄寫的規則（狀態板同步、凍結清單、D-ID 上游）不套到 `templates/`：模板的格式由它自己的 `check.mjs` 與測試守。
- **[architecture.md〈repo 結構〉](../architecture.md#9-repo-結構-d-208)**：樹狀圖與「每一類放哪裡」各補一行。
- **Essence 自己的 lint、型別檢查、knip、skill 一致性檢查**：確認它們不會把 `templates/` 裡的 `.mjs` 與 skill 當成 Essence 的程式與 skill 來查；會的話在設定裡排除，並寫下原因。
- 不改 Essence 的 `AGENTS.md`、既有的 skill 與流程文件。

## 7. 驗收

| # | 驗收 | 怎麼判斷 | 在哪裡做 |
|---|---|---|---|
| 1 | 不帶 Essence 的東西 | 測試掃 `files/` 與 `growth/`：搜不到〈2〉列的字與 Essence 的決定編號，出處那一行是唯一的例外。vault 的名稱靠本機的私人字詞檢查（清單不在 CI） | `tools/tests/`，CI 每次跑 |
| 2 | 複製過去就能用 | 測試把 `files/` 複製進暫存資料夾、`git init`、全部 stage：`check.mjs` 通過。再各別放進一把假金鑰、一個壞連結、一支沒有執行權限的 git hook，以及刪掉 `SETUP.md` 但留著空格，四種都被擋下，訊息指得出檔名。假金鑰在測試執行時才組出來，不寫成字面，免得 Essence 自己的金鑰掃描擋下 | `tools/tests/`，CI 每次跑 |
| 3 | 防線在雲端真的有跑 | 新專案照 `SETUP.md` 設好雲端環境後，開一個新的專案討論串：開場自動設好 git hook；危險的 git 指令被擋；有壞連結的 commit 被擋 | iStock 自己的專案 |
| 4 | `main` 的保護規則 | 紅燈的 PR 合併不了；直接推 `main` 被拒絕；只改文件的 PR 等 `gate` 綠燈才自動合併 | iStock 自己的專案 |
| 5 | 沒看過 Essence 的 AI 讀得懂 | 開一個全新的 session，只給它複製好的 repo（不給 Essence），請它照 `SETUP.md` 走一遍，再把一個點子走到一條決定。它回頭問的名詞、卡住的地方都記下來；不用回頭問名詞才算過，沒過就改到過 | 雲端，暫存的 repo |
| 6 | 複製指令可用 | 使用說明裡的指令在雲端與使用者的電腦各實測一次，複製後 hook 的執行權限還在。先說明為什麼 AI 測不了使用者電腦那一次，再請使用者做；能由本機的 Claude 代跑就代跑 | 雲端、本機各一次 |
| 7 | 授權 | `files/.claude/skills/code-quality/UPSTREAM.md` 在，內容和 Essence 那份的授權全文一樣 | `tools/tests/` |
| 8 | 成長包的三支工具 | 各有測試：`section.mjs` 找得到與找不到標題；`status-board.mjs` 三種狀態各進對的一節、格式錯報檔名、`--check` 對不上時失敗；`decisions-index.mjs` 重產後和手寫的一致、`--check` 對不上時失敗 | `tools/tests/`，CI 每次跑 |
| 9 | Essence 自己的檢查照常通過 | 共用工具的完整檢查通過；改 `templates/` 不觸發任何軟體的完整檢查（分派表的測試） | commit 與 CI |

第 3、4 項要有真的 repo、雲端環境與專案才驗得了，使用者 2026-11-28 指定拿 iStock 做（D-247 第 7 點）。Essence 這邊合併時這兩項如果還沒做，照 [D-195](../decisions.md#d-195-測試分兩類改不回來的做足其餘延後但不漏) 在 [backlog〈技術債〉](../backlog.md#技術債)記一列「補測：」，寫明在 iStock 初始化時做；做完把結果寫回這份的〈結果〉並刪掉那一列。

## 8. 分批

每一批一個 PR。每一批都有 skill、hook、workflow 或程式，合併前先問使用者（[D-239](../decisions.md#d-239-只改文件的-prci-綠燈就合併)）。開工前跑 `node tools/in-flight.ts templates tools/dispatch.ts docs/architecture.md`。

1. **文件與登記**：`files/` 的文件與三個 skill、`README.md` 的初稿；Essence 這邊的分派表、文件檢查、architecture 兩行；驗收第 1、7、9 項。這一批先做〈9〉的第 1、2 件查證。
2. **防線**：四支程式、git hook、CI、保護規則檔、`.claude/settings.json`、`SETUP.md`；驗收第 2 項。
3. **成長包**：`growth/` 的做法與三支工具；驗收第 8 項。
4. **演練與收尾**：驗收第 5、6 項；`README.md` 與出處那一行填上整理的日期與 commit；交給 iStock 的初始化說明（一段可以直接貼到 iStock 專案的話：從哪裡複製、照 `SETUP.md` 做、驗收第 3、4 項要回報什麼）。收尾時這份的狀態行改成 `狀態：已合併｜完成：…｜等誰：—`，跑 `node tools/roadmap-sync.ts`。

## 9. 開工後要先查的事

規劃時沒有實測、會影響做法的：

1. **巢狀的 `.claude/` 會不會被 Essence 的 session 載入**：`templates/project-starter/files/.claude/skills/` 底下的三個 skill，在 Essence 的 session 裡可能被列成帶路徑的 skill，和 `essence-discuss`、`essence-decision` 搶著被選到。先在雲端 session 實測。會搶的話：`files/` 裡把這個資料夾改用不會被載入的名字（例如 `dot-claude/`），使用說明的複製步驟加一步改回 `.claude/`，驗收第 2 項的測試也照這個步驟複製。不會的話照原樣。結果寫進〈結果〉。
2. **Essence 的文件檢查會不會照檔名把模板的 roadmap、backlog 當成 Essence 的來查**：會的話照〈6〉排除。
3. **複製指令**：`npx degit` 遇到已經有 `.git` 的資料夾要加參數，雲端的網路設定也可能擋它。備案是 `git clone --depth 1 --filter=blob:none --sparse` 只取 `templates/project-starter` 再複製。兩種都實測，使用說明寫測過的那一種。
4. **另一個專案的雲端 session 讀不讀得到 Essence**：專案討論串的 GitHub 權限只到自己的 repo。Essence 是公開的，預期可以唯讀加進來或直接 clone；初始化 iStock 時實測，不行就改由使用者電腦上的 Claude 複製。
5. **私人 repo 的保護規則**：iStock 是公開的，這次驗不到。使用說明照實寫「私人 repo 還沒實測」。

## 10. 不做的事

- 不改 Essence 自己的流程、決定的格式與既有的 skill。
- 不做模板和各專案之間的同步；各專案拿到後自己改。
- 不把 Essence 的 `tools/` 整套搬過去；不做 GitHub Issues 版的狀態工具（只寫判斷條件）。
- 不套用到已經有自己流程的專案。
- 不替 iStock 做產品規劃；iStock 的初始化在它自己的專案裡做，這份只負責交一段說明過去。

## 結果

### 第 1 批：文件與登記（2026-11-27）

- **做了什麼**：`files/` 的 `AGENTS.md`、`CLAUDE.md`、`docs/workflow.md`、`docs/roadmap.md`、`docs/backlog.md`、`docs/decisions/`（`README.md` 與 `D-001.md`）、`docs/agents/quality.md`；三個 skill（`discuss`、`decision`、`code-quality` 連同 `UPSTREAM.md`）；`README.md` 初稿。Essence 這邊：分派表加第 9 條「給新專案的模板」（`templates/` 只讓共用工具跑相關測試，CI 升成共用工具完整；原第 9、10 條改成第 10、11 條），architecture 的樹狀圖與〈每一類放哪裡〉各一行，測試 `tools/tests/project-starter.test.ts`。
- **〈9〉第 1 件（巢狀的 `.claude/`）**：會載入。雲端用 Claude Code 2.1.332 的 `claude -p` 在暫存 repo 實測：開場不列，但一讀到子資料夾裡的檔，那裡 `.claude/skills/` 的 skill 就出現在可用清單。所以 `files/` 裡改叫 `dot-claude/`，使用說明的複製步驟加一步改回 `.claude/`；測試擋 `files/.claude` 再出現。驗收第 2 項的複製步驟（第 2 批）照這個做。
- **順帶查到：巢狀的 `AGENTS.md`、`CLAUDE.md` 也會載入**：同一個實測裡，讀到子資料夾的檔時，那裡的 `AGENTS.md`（有沒有 `CLAUDE.md` 都會）被當成那個資料夾的規則送進來。所以 Essence 的 session 編輯模板時，會看到模板的 `AGENTS.md`。不改名：這兩個檔是起步包的核心，改名會讓複製多一步、容易漏；內容是通用規則，滿是【待填】，看得出是範本；architecture 那一行寫明 Essence 不照著做。
- **〈9〉第 2 件（文件檢查會不會把模板的 roadmap、backlog 當成 Essence 的）**：不會。文件檢查、狀態板同步、進度白板認 roadmap、backlog、決策紀錄與狀態檔，都是從 repo 根目錄或 `apps/<軟體>/` 起算的固定路徑；模板的 Markdown 只查連結（實測放一個壞連結會被擋）。skill 一致性檢查只看根目錄的 `.claude/skills/`、`.agents/skills/`。都不用排除。lint、型別檢查與 knip 的範圍是 `tools/`，模板還沒有程式，第 2 批加 `.mjs` 時再確認。
- **驗收**：第 1 項（掃字詞與決定編號，出處那一行是唯一例外）、第 7 項（授權全文和 Essence 那份一樣）由 `project-starter.test.ts` 守；第 9 項由分派表的測試（模板裡的 hook、CI、程式都不觸發任何軟體）與共用檢查守。
- **分派的取捨**：commit 時「相關測試」只選寫到改動路徑全名的測試，模板的測試寫的是資料夾，所以只改模板的 commit 不跑它，CI 跑。要 commit 時也跑，得改分派的找法（任務說明說改分派邏輯要停下來做 L2），好處不大，沒做。

### 第 2 批：防線（2026-11-27）

- **做了什麼**：`files/` 加四支程式（`dot-claude/hooks/block-dangerous-git.mjs`、`dot-claude/hooks/cloud-setup.mjs`、`tools/check.mjs`、`tools/in-flight.mjs`）、`.githooks/pre-commit`（以 100755 進 repo）、`.github/workflows/check.yml`（只在 push 跑，最後一關 `gate`）、`.github/ruleset-main.json`、`dot-claude/settings.json`、`.gitignore`、`.gitattributes`、`SETUP.md`。測試 `tools/tests/project-starter-guards.test.ts`。
- **block-dangerous-git**：規則一字不改，只換掉註解與訊息裡的決定編號；測試拿 24 個指令比兩支的結束碼，要一樣。
- **cloud-setup**：拿掉找 Node 24、補 git tag、`npm ci` 三段；設 `core.hooksPath` 與 `--setup-script` 接 hook 照 Essence 那支。測試：本機不做事；雲端設好 hooksPath；接 hook 後重跑結果一樣、使用者設定的其他東西不動；抄過去的指令在 repo 的上一層會擋 force push，在 repo 裡直接結束；設定壞掉照樣結束在 0。
- **check.mjs**：〈3-3〉的四件事。程式自己寫到的空格記號拆成兩段，才不會數到自己；金鑰的正規式本身不會被自己或 Essence 的 secretlint 認成金鑰（已跑過）。`--staged` 讀索引的內容，金鑰只掃這次改到的檔，空格、連結與 hook 權限看整個索引。
- **in-flight.mjs**：決定編號改讀 `docs/decisions/D-<數字>.md`：`origin/main` 用 `git ls-tree`，PR 只算新增（`--diff-filter=A`）的檔，改到既有的決定不算。分組一律看到第二層。測試照 Essence 的假 GitHub（bare repo、insteadOf、gh 替身）跑：下一個編號、只看指定路徑、沒有共同起點時不給編號、gh 不能用。
- **驗收第 2 項**：測試把 `files/` 複製進暫存資料夾、`dot-claude/` 改名、`git init`、全部 stage，`check.mjs` 通過；假金鑰（執行時才組出來）、`.env` 檔、壞連結、沒有執行權限的 hook、刪掉 `SETUP.md` 但留著空格，都被擋下，訊息有檔名與行號。另外設好 `core.hooksPath` 後真的 commit 一次壞連結，被 pre-commit 擋下。Node 22 手動跑過 `check.mjs` 與另外兩支的語法檢查（雲端沒有 Node 20）。
- **分派**：測試檔開頭寫了這幾支程式的路徑全名，只改模板程式的 commit，pre-commit 也會跑它（照 Essence 的 block-dangerous-git 測試的做法），不必改分派的找法。
- **GitHub 上 Codex 審查（PR #105）的兩項，都修**：P1，使用者的電腦上 git 預設不用 `.githooks/`、`cloud-setup.mjs` 又只在雲端跑，照舊的 SETUP.md 做時提交前的檢查不會跑；`SETUP.md` 第 0 步、`AGENTS.md`〈開始工作前〉與使用說明的複製步驟都加上 `git config core.hooksPath .githooks`，測試確認三處都寫了。P2，連結目標裡成對的括號（`guide(v1).md`）被當成壞連結；照 Markdown 的規則讀成對的括號，加回歸測試。
- **第一個 commit 的 stage**：模板自己的 hook 擋一次 stage 全部，AI 做第一個 commit 時逐一寫出路徑；`SETUP.md` 與使用說明都寫了那一行。

### 第 3 批：成長包（2026-11-27）

- **做了什麼**：`growth/README.md`（〈5〉的表與怎麼拿、怎麼把 `--check` 接進提交前與 CI），七份做法（`tasks.md`、`plans.md`、`second-ai.md`、`long-docs.md`、`private-words.md`、`packages.md`、`sub-projects.md`；里程碑那一列只寫一句指到 `code-quality` 的 `milestone.md`），三支工具 `growth/tools/section.mjs`、`status-board.mjs`、`decisions-index.mjs`。測試 `tools/tests/project-starter-growth.test.ts`；驗收第 1 項的字詞掃描本來就包含 `growth/`。
- **section.mjs**：照 Essence 的 `section.ts` 改成 `.mjs`，圍欄的判斷縮成一般的寫法（不處理引用框裡的圍欄）。它只讀不寫，所以沒有 `--check`：〈5〉寫「三支都有 `--check`」，對只讀的工具沒有可比對的東西，另外兩支有。
- **status-board.mjs**：讀 `docs/tasks/`、`docs/plans/` 第一層的狀態行，整個重寫 roadmap 的三節，其他節不動。工作的名稱取一級標題；〈已完成〉的日期取那份最後一次改動的 commit，最新的在最上面。不認手寫的舊列：`growth/tasks.md` 寫了改用工具前，先把手寫的〈已完成〉列搬到另一節。
- **decisions-index.mjs**：讀 `docs/decisions/D-*.md` 的標題、狀態行與「一句話」，重寫 README 兩行記號之間的索引表。狀態欄由工具從別條決定的「修改」「取代」反推，起步包手寫索引時要手改的那一欄，改用工具後不用改。
- **驗收第 8 項**：section 找得到、找不到標題，程式碼裡的 # 不算；status-board 三種狀態各進對的一節、日期取 commit、格式錯報檔名與原因（八種）、`--check` 對不上時失敗且不寫檔、重跑不改；decisions-index 重產後和手寫的一字不差、`--check` 對不上時失敗、格式錯與提到不存在的決定都報檔名。
- **分派**：測試檔開頭寫了三支工具的路徑全名，只改它們的 commit 也會跑這個測試。

延後的測試：（收尾時填）
