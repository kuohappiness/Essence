# 新專案的初始架構（使用說明）

這份說明不複製進新專案。依據：[D-247](../../docs/decisions.md#d-247-新專案的初始架構分起步包與成長包防線第-0-天就帶)、[D-216](../../docs/decisions.md#d-216-給其他專案的初始架構essence-裡的一包檔案用前先看是不是最新)；規格與驗收在[任務說明](../../docs/tasks/project-starter-template.md)。

> 初稿（第 1 批）：〈怎麼複製〉的指令還沒實測，整理的日期與 commit 收尾時填（任務說明〈8〉第 4 批）。

## 裡面有什麼

| 資料夾 | 是什麼 | 怎麼用 |
|---|---|---|
| `files/` | 起步包：全專案規則、一頁工作流程、三類入口文件、三個 skill、幾道防線 | 新專案第 0 天整包複製到 repo 的根目錄 |
| `growth/` | 成長包：每個成長條件一份做法，加三支做好的小工具 | 不複製；新專案長大到某個條件，才來拿那一份 |

`files/` 裡放 Claude 設定的資料夾叫 `dot-claude/`，複製後要改名成 `.claude/`。在 Essence 裡維持這個名字，是因為 Claude Code 讀到某個資料夾的檔時，會載入那裡的 `.claude/skills/`：模板的 `discuss`、`decision` 會和 Essence 自己的 `essence-discuss`、`essence-decision` 搶著被選到（2026-11-27 實測，任務說明〈結果〉）。

## 用前先看是不是最新

這包不持續維護（D-216）。整理自 Essence 的 commit 【收尾時填】（【收尾時填】）。它對應這些流程文件：

`AGENTS.md`、`docs/agents/workflow.md`、`docs/agents/quality.md`、`.claude/`、`.githooks/`、`tools/in-flight.ts`、`.github/workflows/check.yml`

用前在 Essence 跑一次，看整理之後這些檔有沒有改過：

```sh
git log <整理時的 commit>.. -- AGENTS.md docs/agents/workflow.md docs/agents/quality.md .claude .githooks tools/in-flight.ts .github/workflows/check.yml
```

有改，而且改的是新專案也用得到的做法，先更新這包再複製。

## 怎麼複製

（第 4 批實測後寫上本機與雲端各一種指令。）

步驟：

1. 把 `files/` 底下的所有檔（含 `.` 開頭的）複製到新 repo 的根目錄。
2. `dot-claude/` 改名成 `.claude/`。
3. 確認 `.githooks/` 底下的檔在 git 裡是可執行的模式（`git ls-files -s .githooks` 每一行開頭是 `100755`）；不是就 `git update-index --chmod=+x .githooks/*`。
4. 已經有內容的 repo：不覆蓋既有的檔，逐檔比對後併入。

複製完，請新專案的第一個 Claude session 照 `SETUP.md` 做。

## 開專案時貼到 Claude 專案設定的文字

```text
上下文提醒：對話很長、或發現較早的內容已被自動摘要時，主動提醒使用者，並建議把重要結論寫進 repo 的文件或專案記憶，必要時另開新的討論串。
```

## 成長包

新專案的 `docs/workflow.md`〈成長條件〉列出每個條件與要拿的那一份；表的全文在 `growth/README.md`。

## 第一個專案要回報的兩項

這兩項要有真的 repo、雲端環境與專案才驗得了（任務說明〈7〉第 3、4 項），由第一個用模板的專案驗：

1. **防線在雲端真的有跑**：照 `SETUP.md` 設好雲端環境後，開一個新的專案討論串，確認開場自動設好 git hook、危險的 git 指令被擋、有壞連結的 commit 被擋。
2. **`main` 的保護規則**：紅燈的 PR 合併不了；直接推 `main` 被拒絕；只改文件的 PR 等 `gate` 綠燈才自動合併。
