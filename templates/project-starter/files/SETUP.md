# 第一次設定（給這個專案的第一個 Claude session）

這份檔只用一次：問完八個問題、做完三步設定、核對過，就刪掉它。它還在的時候，`node tools/check.mjs` 只報還剩幾個沒填的空格、不擋；刪掉之後還有空格就擋。

做法：

- **一次問使用者一題**，每題附你的建議答案與理由；使用者回答了再問下一題。
- 問完一題，就把答案寫進下面寫明的檔與空格（`【待填：…】` 的地方），並在 [docs/decisions/D-001.md](docs/decisions/D-001.md)〈決定〉第 4 點記一行重點。
- 用一般人聽得懂的話問；使用者不熟的名詞，先用一句話解釋。

## 八個問題

1. **這個專案的目的，和做成功是什麼樣子。** → `AGENTS.md`〈目的〉的兩格。
2. **這個專案特有、絕對不能做的事**（例如不能動到正式的資料、不能寄信給真的客戶）。 → `AGENTS.md`〈底線〉最後一格。沒有就刪掉那一行。
3. **repo 是公開還是私人。** 公開的 repo 推上去的東西就是公開了，金鑰與私人的名字要擋在提交前；私人 repo 的 CI 有每月的分鐘數上限，`main` 的保護規則要看 GitHub 的方案支不支援。 → 記進 `D-001.md`；公開又有不能公開的名字或路徑時，照 [docs/workflow.md〈成長條件〉](docs/workflow.md#成長條件) 加私人字詞檢查。
4. **做錯了改不回來的範圍**：之後要做足測試、請獨立查核者看的地方（例如資料格式、會刪改使用者資料的功能、金流）。 → `docs/agents/quality.md`〈高風險範圍〉。
5. **規劃、實作、獨立查核各由誰做，有沒有第二個 AI。** → `docs/agents/quality.md`〈角色〉的四格、`D-001.md`〈決定〉第 3 點。
6. **進度放 repo 的檔案還是 GitHub Issues**（判斷表在 [docs/workflow.md〈進度放檔案還是 Issues〉](docs/workflow.md#進度放檔案還是-issues)；預設放檔案）。 → `D-001.md`〈決定〉第 2 點。
7. **哪些工作一定要在使用者的電腦做**（例如要用本機的帳號、裝置或私人檔案），其餘放雲端。 → `docs/agents/quality.md`〈本機或雲端〉的第一格；也問這個專案的里程碑，填〈里程碑〉。
8. **文件與 commit 用什麼語言**（預設：文件繁體中文、commit 英文）。 → `AGENTS.md`〈文件分工〉最後一行的兩格。

八題問完，`D-001.md` 的日期填今天，`docs/decisions/README.md` 索引那一行的日期也填今天。

## 三步設定

順序固定，不能對調。能用工具做的由你做；只有使用者能做的，給連結和「做完會看到什麼」。設定頁的位置常常改，這份不寫死畫面上的路徑：做的時候先查當時的官方說明，再告訴使用者怎麼點。

### 第 0 步：模板的檔案是第一個 commit

空的 repo：模板的檔案是第一個 commit，在保護規則設好之前直接推上 `main`，讓 CI 先跑過一次、`gate` 這個檢查名稱出現在 GitHub 上（第 2 步要選它）。八個問題的答案和模板的檔案放在同一個 commit，不另開 PR。之後從第二個改動開始都走 PR。

先跑 `git config core.hooksPath .githooks`，提交前的檢查才會跑：git 預設讀 `.git/hooks`，不會自己用 repo 裡的 `.githooks/`；雲端由 `.claude/hooks/cloud-setup.mjs` 設，使用者的電腦與其他新的 clone 要自己跑這一行（跑一次就好），跑完 `git config core.hooksPath` 會印 `.githooks`。

擋危險 git 指令的 hook 不准一次 stage 全部，逐一寫出路徑：`git add -- AGENTS.md CLAUDE.md SETUP.md docs tools .claude .githooks .github .gitignore .gitattributes`。推之前確認 `.githooks/pre-commit` 在 git 裡是可執行的模式：`git ls-files -s .githooks` 每一行開頭是 `100755`；不是就跑 `git update-index --chmod=+x -- .githooks/pre-commit`。

### 第 1 步：建這個專案自己的雲端環境

讓雲端的 session 一開場就設好 git hook、擋危險的 git 指令。

- 請使用者建一個這個專案專用的雲端環境，setup script 貼下面這幾行（`<repo 的資料夾名>` 換成 repo 的名字，雲端會把 repo clone 到同名的資料夾）：

  ```sh
  # 這個專案的雲端開場設定：設 git hook、把 repo 的 Claude hook 接到這台機器。
  # 邏輯在 repo 的 .claude/hooks/cloud-setup.mjs（改它要經過 PR 與檢查），這裡只呼叫它。
  # 出錯不擋開場：session 開場時它會再跑一次，把結果告訴 Claude。
  if [ -f <repo 的資料夾名>/.claude/hooks/cloud-setup.mjs ]; then
    (cd <repo 的資料夾名> && CLAUDE_CODE_REMOTE=true CLAUDE_PROJECT_DIR="$PWD" node .claude/hooks/cloud-setup.mjs --setup-script) || echo "開場設定沒有做完"
  fi
  ```

- 再請使用者到這個專案的設定，選用這個雲端環境。
- **做完會看到什麼**：新開的討論串，開場訊息有一句「雲端環境設定：core.hooksPath 已設為 .githooks」。

### 第 2 步：用使用者的帳號建 `main` 的保護規則

讓紅燈的改動合併不進 `main`、`main` 不能被 force push 或刪掉。內容就是 [.github/ruleset-main.json](.github/ruleset-main.json)。

- 由你在使用者的電腦上代做時，先請使用者在對話裡明確說同意，不然會被安全檢查擋下。指令（寫成檔案再送，是為了避開 Windows 指令列的引號問題）：

  ```sh
  gh api --method POST repos/<owner>/<repo>/rulesets --input .github/ruleset-main.json
  ```

- 也可以請使用者在 GitHub 網頁的 repo 設定裡照檔案的內容手動建：對象是預設分支；必過 `gate`（來源 GitHub Actions）；禁 force push；禁刪除；不設例外名單；不要求分支先跟上 `main`。
- 建完讀回來確認：`gh api repos/<owner>/<repo>/rulesets` 看得到一條叫 `main` 的規則，內容和檔案一樣。
- **私人 repo**：要看 GitHub 的方案支不支援（還沒實測）。不支援就跳過這一步，記進 `docs/backlog.md`〈已知的限制〉，第 3 步也跳過：只改文件的 PR 改由 AI 看到 `gate` 綠燈再合併。
- **做完會看到什麼**：直接 `git push origin main` 被拒絕；PR 頁面的合併按鈕要等 `gate` 綠燈才能按。

### 第 3 步：打開文件 PR 的自動合併

保護規則設好之後才做；順序反了，自動合併不會等檢查。

- 請使用者在 repo 的設定裡打開「允許自動合併」。
- **做完會看到什麼**：PR 頁面多了「啟用自動合併」的按鈕。

## 核對與收尾

三步做完，請使用者開一個新的討論串，由那個 session 核對下面幾件，結果寫進 `D-001.md` 新加的一節〈核對結果〉（每件一行：通過、沒通過與原因）。那一節不要連到 `SETUP.md`：它最後會被刪掉，連過去的連結會讓刪檔的 PR 被自己的檢查擋下。

1. 開場訊息有「core.hooksPath 已設為 .githooks」。
2. 試跑 `git push --force`（不用真的有東西可推），被擋下，訊息寫「不使用 force push」。
3. 在一個分支上 commit 一份有壞連結的 Markdown，被提交前的檢查擋下，訊息指得出檔名與行號（核對完把這個分支刪掉）。
4. 有保護規則時：故意讓檢查失敗的 PR 合併不了；直接推 `main` 被拒絕；只改文件的 PR 等 `gate` 綠燈才自動合併。

都對了，在同一個 PR 刪掉這份 `SETUP.md`；`node tools/check.mjs` 會確認所有空格都填了。
