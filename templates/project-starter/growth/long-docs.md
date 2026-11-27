# 長文件與決定的索引

條件：有一份文件超過約 2 萬字（整份讀進對話很花 token），或決定超過 30 條（手改索引容易漏）。

## 只讀一節

- 把 `growth/tools/section.mjs` 複製到 `tools/`。
- `node tools/section.mjs <檔案> <標題>` 印那一節與行號；`node tools/section.mjs <檔案>` 列出每個標題的行號與字數，先看要哪一節。
- `AGENTS.md`〈開始工作前〉加一行：讀長文件（backlog、roadmap、品質設定）只取需要的那一節，用這支工具。

## 決定的索引改由工具產生

1. 把 `growth/tools/decisions-index.mjs` 複製到 `tools/`。
2. `docs/decisions/README.md` 的索引表（含表頭）換成下面兩行記號，工具只重寫記號之間：

   ```markdown
   <!-- 索引開始：由 tools/decisions-index.mjs 產生，不要手改 -->
   <!-- 索引結束 -->
   ```

3. 跑 `node tools/decisions-index.mjs`。狀態欄由工具算：被別條決定的狀態行「取代」的寫「已取代，見 D-xxx」，被「修改」的寫「已修改，見 D-xxx」，其餘照狀態行開頭的符號。
4. 照[成長包的使用說明](README.md#怎麼拿)把 `--check` 接進提交前與 CI。
5. `decision` skill 的第 5 步改成「跑 `node tools/decisions-index.mjs`」，`docs/decisions/README.md`〈一條決定的寫法〉的「寫完」也改。

每條決定的格式：第一行 `# D-xxx 名稱`；下一個非空行是狀態行，開頭是符號與日期；內文有一行 `一句話：…`。格式不對時工具會說是哪個檔、少了什麼。
