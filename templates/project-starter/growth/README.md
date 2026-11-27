# 成長包

不複製進新專案。專案長大到下面的條件，才來拿那一份；條件還沒到的不先加。新專案的 `docs/workflow.md`〈成長條件〉是這張表的摘要。

| 條件到了 | 加什麼 | 模板給什麼 |
|---|---|---|
| 第一次要把工作交給另一個 session，或規格寫超過一段 | `docs/tasks/`、入口的狀態行；狀態板改由工具整份產生 | [tasks.md](tasks.md)，加 [tools/status-board.mjs](tools/status-board.mjs) |
| 一個主題要談好幾輪 | `docs/plans/` | [plans.md](plans.md) |
| 有第二個 AI 可以查核，高風險範圍也不是空的 | 討論稿、第一輪各自獨立、合併前的獨立審查、skill 的第二份副本與一致性檢查 | [second-ai.md](second-ai.md) |
| 有一份文件超過約 2 萬字，或決定超過 30 條 | 只讀一節的小工具；決定的索引改由工具產生 | [long-docs.md](long-docs.md)，加 [tools/section.mjs](tools/section.mjs)、[tools/decisions-index.mjs](tools/decisions-index.mjs) |
| repo 公開，又有不能公開的名字或路徑 | 私人字詞檢查，清單只放使用者的電腦 | [private-words.md](private-words.md) |
| 專案開始裝套件（有鎖檔） | 雲端開場加裝套件；提交前比對已裝的套件和鎖檔 | [packages.md](packages.md) |
| 第一個里程碑完成 | 回顧與安全檢查 | `code-quality` 已經內含：照它的 `milestone.md` 做 |
| 出現第二個子專案 | 每個子專案自己的資料夾與規則 | [sub-projects.md](sub-projects.md) |

## 怎麼拿

1. 讀那一份做法，照它改新專案的文件。
2. 有小工具的，把 `growth/tools/` 裡那支複製到新專案的 `tools/`。三支都只用 Node 內建的模組，Node 20 以上直接跑，不用安裝套件。
3. 會寫檔的兩支（`status-board.mjs`、`decisions-index.mjs`）有 `--check`：只比對、不寫檔，對不上時 exit 1。把它接進提交前與 CI，忘了重跑就會被擋：
   - `.githooks/pre-commit`：在 `exec node tools/check.mjs --staged` 之前加一行 `node tools/<那支>.mjs --check || exit 1`。
   - `.github/workflows/check.yml`：`check` 這個 job 加一步 `- run: node tools/<那支>.mjs --check`。兩支都不讀 git 歷史（狀態板〈已完成〉的日期記在 roadmap 裡，第一次產生後沿用），`actions/checkout` 預設的淺層 clone 就夠，不用改 `fetch-depth`。
4. 在新專案的 `docs/workflow.md` 寫一句：這個條件到了、加了什麼、哪天加的。

三支工具的測試在模板來源的 repo 裡，CI 每次跑；拿過去之後由新專案自己守。
