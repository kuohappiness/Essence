# 新專案的初始架構（使用說明）

這份說明不複製進新專案。依據：[D-247](../../docs/decisions.md#d-247-新專案的初始架構分起步包與成長包防線第-0-天就帶)、[D-216](../../docs/decisions.md#d-216-給其他專案的初始架構essence-裡的一包檔案用前先看是不是最新)；規格與驗收在[任務說明](../../docs/tasks/project-starter-template.md)。

## 裡面有什麼

| 資料夾 | 是什麼 | 怎麼用 |
|---|---|---|
| `files/` | 起步包：全專案規則、一頁工作流程、三類入口文件、三個 skill、幾道防線 | 新專案第 0 天整包複製到 repo 的根目錄 |
| `growth/` | 成長包：每個成長條件一份做法，加三支做好的小工具 | 不複製；新專案長大到某個條件，才來拿那一份 |

`files/` 裡放 Claude 設定的資料夾叫 `dot-claude/`，複製後要改名成 `.claude/`。在 Essence 裡維持這個名字，是因為 Claude Code 讀到某個資料夾的檔時，會載入那裡的 `.claude/skills/`：模板的 `discuss`、`decision` 會和 Essence 自己的 `essence-discuss`、`essence-decision` 搶著被選到（2026-11-27 實測，任務說明〈結果〉）。

## 用前先看是不是最新

這包不持續維護（D-216）。整理自 Essence 的 commit 65448dc5（2026-11-28）。它對應這些流程文件：

`AGENTS.md`、`docs/agents/workflow.md`、`docs/agents/quality.md`、`.claude/`、`.githooks/`、`tools/in-flight.ts`、`.github/workflows/check.yml`

用前在 Essence 跑一次，看整理之後這些檔有沒有改過：

```sh
git log 65448dc5.. -- AGENTS.md docs/agents/workflow.md docs/agents/quality.md .claude .githooks tools/in-flight.ts .github/workflows/check.yml
```

有改，而且改的是新專案也用得到的做法，先更新這包再複製。

## 怎麼複製

兩種都在雲端（Linux）與使用者的電腦（Windows 11、Git Bash）實測過（2026-11-28）。在新 repo 的根目錄跑：

```sh
# 方法 A：degit（要能跑 npx）。--force 是因為資料夾裡已經有 .git
npx -y degit kuohappiness/Essence/templates/project-starter/files . --force
```

```sh
# 方法 B：只取模板那個資料夾（不用 npx）。在新 repo 的上一層跑，<新 repo> 換成資料夾名
git clone --depth 1 --filter=blob:none --sparse https://github.com/kuohappiness/Essence.git essence-src
git -C essence-src sparse-checkout set templates/project-starter/files
cp -a essence-src/templates/project-starter/files/. <新 repo>/
rm -rf essence-src
```

Windows 上兩種方法複製後，`git add` 進去的 `.githooks/pre-commit` 都是 `100644`（Windows 的 git 不記執行權限），所以下面第 3 步一定要做：不做的話在 Windows 上 hook 照樣會跑，但推上去之後在 Mac、Linux 與雲端的 clone 裡不會跑。Linux 上複製後已經是 `100755`。

步驟：

1. 把 `files/` 底下的所有檔（含 `.` 開頭的）複製到新 repo 的根目錄。
2. `dot-claude/` 改名成 `.claude/`。
3. `git add` 之後，確認 `.githooks/` 底下的檔在 git 裡是可執行的模式（`git ls-files -s .githooks` 每一行開頭是 `100755`）；不是就 `git update-index --chmod=+x -- .githooks/pre-commit`。
4. 跑 `git config core.hooksPath .githooks`：git 預設不用 repo 裡的 `.githooks/`，沒設的話提交前的檢查不會跑（雲端由 `cloud-setup.mjs` 設）。
5. 已經有內容的 repo：不覆蓋既有的檔，逐檔比對後併入。

複製完，請新專案的第一個 Claude session 照 `SETUP.md` 做：第一個 commit 怎麼推、八個問題、三步設定與核對都寫在那裡。AI 協作者的 hook 不准一次 stage 全部，第一個 commit 由 AI 做時逐一寫出路徑：`git add -- AGENTS.md CLAUDE.md SETUP.md docs tools .claude .githooks .github .gitignore .gitattributes`。

## 開專案時貼到 Claude 專案設定的文字

```text
上下文提醒：對話很長、或發現較早的內容已被自動摘要時，主動提醒使用者，並建議把重要結論寫進 repo 的文件或專案記憶，必要時另開新的討論串。
```

## 成長包

新專案的 `docs/workflow.md`〈成長條件〉列出每個條件與要拿的那一份；表的全文、怎麼拿與三支小工具怎麼接進檢查，在 [growth/README.md](growth/README.md)。

## 第一個專案要回報的兩項

這兩項要有真的 repo、雲端環境與專案才驗得了（任務說明〈7〉第 3、4 項），由第一個用模板的專案驗：

1. **防線在雲端真的有跑**：照 `SETUP.md` 設好雲端環境後，開一個新的專案討論串，確認開場自動設好 git hook、危險的 git 指令被擋、有壞連結的 commit 被擋。
2. **`main` 的保護規則**：紅燈的 PR 合併不了；直接推 `main` 被拒絕；只改文件的 PR 等 `gate` 綠燈才自動合併。
