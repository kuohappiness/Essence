# Essence Cards 協作規則

本文件給所有 AI 協作者（Claude、Codex 等）共同使用；`CLAUDE.md` 只有一行 `@AGENTS.md`。

## 底線

- 不提交 API 金鑰、登入憑證、私人學習資料或未獲授權的教材（例如出版社課本 PDF）。
- 不 force push。
- 不用 `--no-verify` 跳過 pre-commit；沒通過就修到通過（[D-117](docs/decisions.md#d-117-技術債預防機械檢查全自動ai-審查只在關鍵點)）。
- 不用 `git add -A`：commit 前看 `git status`，只 stage 自己改過的檔案，不動別人未提交的修改。
- 使用者沒有明確同意就不標 ✅；沒有反對不等於同意。
- 任務說明沒寫到、做了又很難收回的步驟，停下來問使用者。
- 沒做完的功能不寫成已可使用；學習效果寫成待驗證的目標。

## 北極星

- 最高目的：讓知識從獲取到深化形成閉環，縮短複習時間、加深記憶、提升學業表現。
- 最高原則：思考任何問題先問這樣做會不會明顯更好；有明顯的優勢、又沒有解決不了的代價，就應該做，工作量不是理由；好處很小的不用花很多力氣（[D-177](docs/decisions.md#d-177-先問會不會明顯更好優勢明顯代價解決得了就該做)）。
- 新提案先說明它哪裡更好：產品功能對上北極星，開發流程寫出具體省下的時間、token 或錯誤；兩種都和「不做」比較（[D-153](docs/decisions.md#d-153-每個新決定與新任務先和不做比較)），說不出哪裡更好的只記進 backlog，不升格為決定。
- 以學習目標為單位貫穿整個流程（[D-114](docs/decisions.md#d-114-產品核心以學習目標為單位回饋先找原因)）：一格題目只對一個目標，一張卡有好幾格的只有點選作答的題型（點選填空、排序、配對與單選，[D-178](docs/decisions.md#d-178-相似字用點字比較卡一格一個學習目標)、[D-182](docs/decisions.md#d-182-比較點選各科都能用家長出題時勾選)、[D-233](docs/decisions.md#d-233-題型照形式分各科與題庫共用配對單選也進每天複習)、[D-248](docs/decisions.md#d-248-排序是自己一種題型)、[D-249](docs/decisions.md#d-249-配對與單選題目後面一行選項有一個要出就整組作答)），不改用卡片排程。

## 開始工作前

- 先讀最上層 `docs/roadmap.md` 的「現在在哪裡」（入口，[工作流程規範〈roadmap〉](docs/agents/workflow.md#roadmap)）；做某個軟體時，先讀 `apps/<軟體>/AGENTS.md`，再讀它的 roadmap。其他文件看任務需要，照〈文件分工〉找。
- 查決定：已知 D-ID 用 `node tools/decisions-index.ts D-xxx`；不知道時讀索引裡相關的主題。
- 讀長文件（backlog、roadmap、quality.md、決策紀錄）只取需要的那一段：用 `node tools/section.ts <檔案> <標題>`，或先找標題的行號再讀那一段；入口文件只讀上面那一節（[工作流程規範](docs/agents/workflow.md#只讀需要的那一段)，[D-215](docs/decisions.md#d-215-狀態留在-repo獨立的第一輪決定的門檻只讀需要的那一段)）。
- 只在試作場（`experiments/`）做測試時，只讀 `experiments/README.md` 和該任務連到的說明（[D-065](docs/decisions.md#d-065-試作場)）。
- `docs/archive/v0-planning/` 已被取代，不當依據；`docs/archive/discussions/` 是過程紀錄，不當規格。
- 以 repo 中的最新文件為準，不以舊聊天紀錄為準。
- 判斷這件工作在本機還是雲端做；雲端做得了就提醒使用者改到雲端，分法見 `docs/agents/quality.md`〈本機或雲端〉（[D-212](docs/decisions.md#d-212-claude-直接呼叫本機-codex任務開始時分本機或雲端)）。
- 開工改檔、取決定編號前，跑 `node tools/in-flight.ts` 看開著的 PR 改到哪些檔、用了哪些編號，也看正在跑的串；受影響的那段等那邊合併或談定再做，其餘照做（[工作流程規範〈開工前先看〉](docs/agents/workflow.md#開工前先看)，[D-242](docs/decisions.md#d-242-開工前先看有沒有人在改同一樣東西)）。
- 先載入對應的 skill：設計討論用 `essence-discuss`、寫 D-ID 用 `essence-decision`、寫或審程式、請 Codex 查核用 `code-quality`。

## 文件分工

每一層放什麼、新文件放哪裡，見 [architecture.md〈repo 結構〉](docs/architecture.md#9-repo-結構-d-208)（[D-208](docs/decisions.md#d-208-三個外掛在同一個-repo-開發每個外掛有自己的資料夾)）。

- 同一類資訊只維護一份，其他地方用連結（[D-141](docs/decisions.md#d-141-文件架構入口只放狀態同一類資訊只維護一份)）。
- 狀態標示：✅ 已確認｜🔁 舊共識，待重新確認｜💬 待討論｜💡 助理提案。
- 新點子先記進 `docs/backlog.md`，保留原意與來源。
- roadmap 的「現在在哪裡」怎麼寫，見[工作流程規範〈roadmap〉](docs/agents/workflow.md#roadmap)。
- 做完的任務、討論稿與 plans 不刪不搬，只改標題下的狀態行（[D-143](docs/decisions.md#d-143-歸檔原則每類文件都有終點不設字數上限)）。
- 提到只在分支上的檔案時寫「分支 `x` 的 `path`（commit）」，不用相對連結。
- 文件與給使用者的回覆（含進度短句、wrap_up、問題與按鈕）用繁體中文，commit 訊息照慣例用英文；英文名稱、程式識別字與必要引用保留原文（[D-212](docs/decisions.md#d-212-claude-直接呼叫本機-codex任務開始時分本機或雲端)）。

## AI 協作分工

- Claude 做架構判斷、文件維護與實作，包含規格清楚的機械式工作（[D-131](docs/decisions.md#d-131-claude-實作codex-在關鍵點查核)）。
- 模型、推理等級、什麼時候請 Codex 查核、卡關時怎麼升級，照 `docs/agents/quality.md`（[D-140](docs/decisions.md#d-140-fable-規劃opus-執行codex-查核)、[D-144](docs/decisions.md#d-144-決策交給-opus-xhighfable-只在解不了的時候)）。
- 重大決策點先在 `docs/Claude Codex Discussion/`（外掛專用的在外掛的 `docs/` 底下，[D-213](docs/decisions.md#d-213-任務與討論稿放進-docs外掛專用的放外掛的-docs)）寫討論稿和 Codex 輪流回覆，雙方一致才交給使用者。
- Codex 只查核與回報，修改由 Claude 做。

## 實作與 Git

- AI 能測的由 AI 測；請使用者測之前，先說明 AI 為什麼測不了；需要 iPhone 實機的測試集中成一次。
- 測試或功能要延後時，照 `docs/agents/quality.md`〈測試分兩類〉（[D-195](docs/decisions.md#d-195-測試分兩類改不回來的做足其餘延後但不漏)）記進技術債表，不能只是沒做。
- 規劃文件與程式都開分支、走 PR：`main` 要 CI 的 gate 綠燈才合得進去，不能直接 push（[D-245](docs/decisions.md#d-245-ci-只在-push-跑main-要-gate-綠燈才合得進去)）。

## Code Review Rules

給 GitHub 上的 Codex 審查讀，是合併前的補充，不取代 L2（[D-212](docs/decisions.md#d-212-claude-直接呼叫本機-codex任務開始時分本機或雲端) 第 7 點）。

- 用繁體中文回覆。
- 標成 P1：寫進使用者筆記的格式（`apps/Cards/docs/syntax.md`、`docs/transcript.md`）被改壞或舊版外掛讀不到、學習目標 ID 或複習紀錄遺失或重複、排程（FSRS 與紀錄重播）算錯、寫回筆記不冪等、金鑰或個人資料進了 repo。
- 只改文件的 PR，看壞掉的連結、狀態行，以及和 `docs/decisions.md` 矛盾的地方。

## 改這份檔案

- 新增規則前要過五關（[D-147](docs/decisions.md#d-147-agentsmd-的寫法底線在上新增規則先過五關)）：① 是整個專案的重大決定（附 D-ID），或同一個錯已犯兩三次（附實例）；② 每個 session 都用得到；③ 一句話、一個具體動作；④ 一條規則只放一處：每個 session 都要的放這裡，只有某類工作用的放 skill 或 `docs/agents/`，skill 裡全域適用的搬上來並從 skill 刪掉；⑤ 使用者明確同意。
- 每加一條，同時檢查有沒有過時或用不到、可以刪的。
