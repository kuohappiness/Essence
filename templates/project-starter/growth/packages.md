# 開始裝套件

條件：專案開始用 npm 等套件管理工具，有了鎖檔（`package-lock.json` 之類）。

## 加什麼

- **雲端開場加裝套件**：`.claude/hooks/cloud-setup.mjs` 在設 `core.hooksPath` 之後，對每個有鎖檔的資料夾跑 `npm ci`；`node_modules` 裡記的鎖檔沒變就跳過（新的 session 可能從前一個的快照開機）。每個資料夾印一行結果（裝好了、沒變跳過、沒有相依、失敗與原因），分得出「裝好了」和「根本沒走到」。失敗照樣結束在 0。
- **雲端的 Node 版本**：專案要的版本比雲端預設的新時，開場程式找映像裡另外裝的版本（例如 `/opt/node<版本>`），寫進 `CLAUDE_ENV_FILE` 讓之後的指令都用它。
- **提交前比對已裝的套件和鎖檔**：`tools/check.mjs` 加一項，鎖檔比 `node_modules` 裡記的新時（換分支或合併帶進新的鎖檔），說是哪個資料夾、要跑 `npm ci`；不然檢查會用舊的套件跑，結果不可信。
- **CI**：`check.yml` 的 job 先 `npm ci` 再跑檢查；`actions/setup-node` 開 `cache: npm`。
- **檢查指令**：`docs/agents/quality.md`〈檢查指令〉加上型別檢查、lint、測試的指令，提交前與 CI 都跑。
- 檢查程式本身照舊不依賴套件：沒裝過套件的 clone 也要能跑提交前的檢查，才擋得住金鑰。
