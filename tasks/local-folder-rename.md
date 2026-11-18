# 本機資料夾改名 `Essence`（D-211，給 Claude，本機執行）

狀態：改名完成（2026-11-18）：〈改名後〉第 1～4、6、7 項做完，見〈結果〉；第 5 項（手機看新對話、Codex 從新資料夾開）等使用者確認。

遵守 repo 根目錄的 `AGENTS.md`。建議模型與推理等級：**Opus、高**。依據：[D-208](../docs/decisions.md#d-208-三個外掛在同一個-repo-開發每個外掛有自己的資料夾) 第 7 點、[D-211](../docs/decisions.md#d-211-本機資料夾也改名舊對話收尾後不接續)。

本機資料夾 `D:\程式開發\Essence Cards` 改成 `D:\程式開發\Essence`，和 GitHub 的 repo 名稱一致（GitHub 2026-11-18 已改名）。改名後這個資料夾裡的舊對話都接不上，所以這份說明是改名前後唯一的交接：改名後的新對話從〈改名後〉接手。

## 和「不做」比較（D-153）

不做：本機叫 `Essence Cards`、GitHub 叫 `Essence`，新對話看到資料夾名稱會把整個 repo 當成 Cards（D-208 改名的原因），使用者重視名字一致。做的代價是一次停工、舊對話不接續；換到的除了名字，還有清掉 worktree 寫死的路徑，以後再搬家也不會讓 commit 前的檢查悄悄不跑。

## 演練的結果（2026-11-18）

在丟棄式的目錄 `D:\程式開發\Rename Rehearsal A` 開了三個對話（兩個沒用 worktree、一個用），改名成 `Rename Rehearsal B` 後：

| 項目 | 結果 |
|---|---|
| 改名時對話開著 | Windows 擋下：「檔案正被另一個程序使用」。閒著的對話程序也占著資料夾；停對話的工具只中斷正在跑的那一輪 |
| git | `git worktree repair <新路徑>` 一次接回兩個方向，worktree 狀態乾淨 |
| Claude 的記憶 | 存在 `~/.claude/projects/<路徑換成 - 的名稱>/memory`，用 worktree 的對話也寫進主資料夾那一份。複製到新名稱後，新對話讀得到三條標記 |
| app 的舊對話 | 記著舊路徑，點開顯示「工作資料夾已不存在」；在那裡重新選資料夾，app 會複製出一個標題加「(fork)」的新對話，原本的留著、打不開 |
| 刪掉重新下載 | 沒試：對 app 和改名一樣，還要另外搬沒進 GitHub 的東西（D-211 曾考慮的做法） |

## 腳本：`experiments/tools/rename-local-folder.mjs`

用法寫在檔案開頭。`check` 只看不改；`run` 拍快照 → 改名 → `git worktree repair` → 拿掉 worktree 寫死的 hooksPath → 複製 Claude 的記憶 → Codex 加新路徑的信任 → 和快照逐項核對，有一項不過就自動退回原名；`verify`、`rollback` 用存下的快照單獨跑。

快照記：每個 ref 的 commit、每個 worktree 的路徑、HEAD、沒 commit 的修改與 hooksPath、只在本機的 commit、沒進 git 的檔（`git status --ignored` 的最上層）、`.local/` 的摘要（檔數、大小、合起來的雜湊）、`.claude/settings.local.json` 的雜湊、記憶每個檔的雜湊、Codex 的信任設定。

核對：資料夾、每個 ref、每個 worktree 接上而且修改和快照相同、每個 worktree 找得到 `pre-commit`、git 設定檔裡沒有舊路徑、記憶的雜湊、`.local/`、`settings.local.json`、沒進 git 的檔、Codex 有新路徑。

測試：`node --test --test-timeout=120000 experiments/tools/rename-local-folder.test.mjs`，在暫存資料夾建有 worktree、寫死的 hooksPath、記憶與 Codex 設定的 repo，測改名、退回、核對失敗自動退回、資料夾被占用、有沒 commit 的修改、終端機在資料夾裡。

## 改名前（舊資料夾，app 開著時做）

1. **worktree**（2026-11-18 盤點，四個都沒有獨有的內容）：

   | worktree | 狀態 | 建議 |
   |---|---|---|
   | `ai-cards-materials-0a4b27` | 停在 `d655645`（已在 `main`），乾淨；寫死的 hooksPath | 清掉 |
   | `edit-markup-2ba4bd` | 停在 `0ac86e6`（`main`），乾淨，對話已刪；寫死的 hooksPath | 清掉 |
   | `one-repo-step-1` | 分支已合併（PR #21）；`docs/syntax.md` 只有換行差異 | 還原換行後清掉 |
   | `progress-board-382fc5` | 分支 `claude/ai-cards-module-ea4f3b` 停在 `94c6ea4`（已在 `main`），乾淨；「AI 製卡模組完整版」對話用它，最後的回報已過時（第 2、3 批都合併了）；寫死的 hooksPath | 清掉 |

   清之前先唯讀掃一次有沒有連結（junction）；沒有就用不加 `--force` 的 `git worktree remove`。對應的對話一起封存。

   2026-11-18 做完：四個都沒有連結，`git worktree remove` 都移除了登錄；`one-repo-step-1`、`progress-board-382fc5` 各留一個空資料夾，被還開著的程式占著刪不掉（app 關掉後就能刪，改名後的新對話順手刪）。「AI 製卡模組完整版」的對話自動審核不讓封存，請使用者自己封存。

2. **只在本機的分支** `claude/ai-cards-materials-0a4b27`：多一個 `280a217`（第 3 批的任務說明），`git cherry main` 標 `-`，內容已在 `main`。2026-11-18 刪掉了。
3. **交接**：每件進行中的工作在 roadmap「現在在哪裡」寫清楚做到哪、下一步、等誰；有任務說明的寫在〈結果〉或狀態行。這一刻的 roadmap 就是改名後接手測試的答案。
4. **演練留下的東西**：五個演練對話封存；`D:\程式開發\Rename Rehearsal B` 與 `~/.claude/projects` 裡 `Rename-Rehearsal` 開頭的四個資料夾搬到 scratchpad。2026-11-18 做完。
5. **腳本放到資料夾外面**：複製到 `D:\程式開發\Essence Cards Backup\rename-local-folder\`，在 `D:\程式開發` 執行 `check`，沒有 ❌。2026-11-18 做完：只剩記憶（51 個檔）與 Codex 兩項提醒，印「可以改名。」
6. **停手**：其他對話與 Codex 都停下，沒有在跑的背景工作。

## 改名（使用者，app 關掉時）

1. 結束 Claude app（系統匣的圖示也要按結束）、Codex、終端機、編輯器，以及開著這個資料夾的檔案總管視窗。
2. 開 Windows 終端機（PowerShell），貼上：

   ```powershell
   cd D:\程式開發
   node "D:\程式開發\Essence Cards Backup\rename-local-folder\rename-local-folder.mjs" run --repo "D:\程式開發\Essence Cards" --to "D:\程式開發\Essence" --out "D:\程式開發\Essence Cards Backup\rename-local-folder\紀錄"
   ```

3. 看最後一行：
   - 「全部通過。」：重開 app，用 `D:\程式開發\Essence` 開新對話（不用 worktree），貼〈改名後〉開頭的那段話。
   - 「改不了名……什麼都沒改」：還有程式開著資料夾，關掉再跑一次。
   - 「已經退回改名前的樣子」：重開 app，回到舊資料夾的對話，把終端機的輸出貼上。
   - 「退回沒有完全成功」：不要再動，重開 app，在 `D:\程式開發` 開對話，把輸出與 `紀錄\snapshot.json` 交給 Claude。

## 改名後（新對話在 `D:\程式開發\Essence` 做）

開場貼的話：

```text
本機資料夾剛從 Essence Cards 改名成 Essence。照 AGENTS.md 開工，再照 tasks/local-folder-rename.md 的〈改名後〉逐項做。
第一件事：不讀 roadmap 以外的文件，說出「現在在哪裡」每件進行中的工作下一步是什麼、等誰。
```

1. **接手測試**：新對話說的下一步與等誰，和改名前那個 commit 的 roadmap「現在在哪裡」對得上。
2. **記憶**：新對話開頭載入的記憶索引和改名前一樣多條；再跑一次 `verify --snapshot <紀錄\snapshot.json>`（app 開著時跑，全部 ✅）。
3. **工具**：在新資料夾跑 `npm run check`（背景執行、加時間上限）與 `npm run build`，都通過。
4. **第一個 commit**：下面第 6 項的文件更新照常 commit，看到 pre-commit 有跑。
5. **Remote Control 與 Codex**：手機看得到新對話；Codex 從新資料夾開，問它 AGENTS.md 的北極星，答得出來。
6. **文件與設定**：本檔〈結果〉；roadmap 那一列與已完成；`docs/architecture.md`〈repo 結構〉第一行；Capture repo `AGENTS.md`〈要開發 Capture 時〉的「旁邊的 `Essence Cards`」；記憶裡寫著舊路徑的幾條（`essence-cards-project-state`、`production-vault`、`worktree-docs-to-main`、`backup-folder` 裡指 repo 的那幾處；`Essence Cards Backup` 這個資料夾不改名）。
7. **留著的舊東西**：`~/.claude/projects/D-------Essence-Cards`（舊對話紀錄）、Codex 舊路徑的信任設定、app 裡的舊對話都不刪。

## 驗收

1. `check` 在真的資料夾沒有 ❌（改名前）。
2. `run` 印「全部通過。」、結束碼 0；`紀錄\snapshot.json` 存在。
3. 改名後 `D:\程式開發\Essence Cards` 不存在；`git worktree list` 每一行都在 `D:\程式開發\Essence` 底下，沒有 `prunable`。
4. `git config --show-origin --get-all core.hooksPath` 在主資料夾只有 `.githooks`；`.git` 底下沒有任何設定檔含舊路徑。
5. 記憶：新位置每個檔的雜湊和快照相同；舊位置的檔還在。
6. 〈改名後〉第 1～5 項都做到，結果逐項寫進〈結果〉。

## 結果

2026-11-18，改名後的新對話（`D:\程式開發\Essence`，不用 worktree）：

| 項目 | 結果 |
|---|---|
| 1. 接手測試 | 新對話只讀 roadmap 說出的 14 列下一步與等誰，和改名前的 `1cdc1a9` 一致（改名後工作樹乾淨、HEAD 就是它） |
| 2. 記憶 | 開頭載入的索引 50 條，和舊位置的 `MEMORY.md` 相同（兩邊各 51 個檔）；`verify --snapshot` 10 項全部 ✅，結束碼 0（之後第 6 項才改記憶，所以現在的雜湊會和快照不同，是預期的） |
| 3. 工具 | `npm run build` 通過。`npm run check` 第一次有 2 項 deck 測試失敗：`docs/syntax.md` 的工作檔是 CRLF（2026-11-17 20:45 寫出，早於改名；git 存的是 LF），轉回 LF 後沒有差異。第二次是本對話在 roadmap 寫了本機路徑，被白板檢查擋下，改掉了。第三次 3011 項：3010 通過、0 失敗、1 略過 |
| 4. 第一個 commit | 本檔、roadmap 與 architecture 的更新，pre-commit 有跑（見那個 commit） |
| 5. Remote Control 與 Codex | 等使用者：手機看不看得到新對話；Codex app 從新資料夾開、問北極星（電腦上沒有 Codex 的命令列工具，AI 測不了） |
| 6. 文件與設定 | 本檔、roadmap（那一列與已完成）、`docs/architecture.md`〈repo 結構〉兩張圖的第一行；Capture repo 的 `AGENTS.md` 改成「旁邊的 `Essence`」（另外 commit）；記憶改了 `essence-cards-project-state`、`production-vault`（release worktree 改叫 `../Essence-release`）、`worktree-docs-to-main` 與索引；`backup-folder` 指的都是 `Essence Cards Backup`，不用改 |
| 7. 留著的舊東西 | `~/.claude/projects/D-------Essence-Cards`、Codex 舊路徑的信任設定、app 裡的舊對話都沒動 |
| 順手 | `.claude/worktrees/` 裡 `one-repo-step-1`、`progress-board-382fc5` 兩個空資料夾刪掉了（先確認是空的） |

驗收：第 1、2 項在改名前後由使用者跑（`紀錄\snapshot.json` 在；`run` 的輸出沒有另外存檔；使用者貼了〈改名〉第 3 步只在「全部通過」時才貼的開場話，`verify` 也全部 ✅）；第 3 項 `D:\程式開發\Essence Cards` 不在，`git worktree list` 只有主資料夾一行；第 4 項 `core.hooksPath` 只有 `.git/config` 的 `.githooks`，`.git` 底下的設定檔沒有舊路徑；第 5 項由 `verify` 核對；第 6 項除第 5 項外都做到。
