# Essence Capture 協作規則

最上層的 `AGENTS.md` 一體適用；這裡只寫 Capture 特有的。repo 的結構與每一層放什麼見最上層 `docs/architecture.md`〈repo 結構〉。

- **底線**：不提交 API 金鑰、PDF、課本頁面或轉錄出來的教材（有版權）；測試結果放 repo 外。`plugins/capture/.gitignore` 擋 `*.pdf`（舊 `Essence-Capture` repo 的規則），其他的靠自己留意。
- **是什麼**：可靠的知識入口，把課本、講義的 PDF 與圖片忠實轉錄成 Markdown，存進 vault 成為教材庫（D-076）；和 Cards 各自安裝、各自可用（D-006）。轉錄稿的格式是和 Cards 的接點，現在在最上層 `docs/syntax.md` §1，第一個需要共同規格的 Capture 任務把它搬到最上層 `docs/` 的獨立一份（D-208 第 6 點）。現在列在第二階段（D-206）。
- **開工先讀**：`plugins/capture/docs/roadmap.md` 的〈現在在哪裡〉；還沒有 roadmap 時讀 `plugins/capture/docs/backlog.md`。（路徑都從 repo 的根寫起，免得和最上層的 `docs/` 搞混。）
- **文件放這個資料夾**：`plugins/capture/` 底下的 `docs/`、`tasks/`、`Claude Codex Discussion/`，第一份文件出現才建；和別的外掛共用的放最上層。建了 `plugins/capture/docs/roadmap.md` 就從最上層的 `docs/roadmap.md` 連過來（文件檢查會擋）。決定寫進最上層的 `docs/decisions.md`，狀態行下一行寫「適用：Capture」。
- **程式**：不 import 其他外掛與最上層的程式（D-208 第 10 點，`tools/check-plugin-imports.ts` 擋）。在這個資料夾 `npm ci`、`npm run check`；commit 時 hook 照分派表自動跑。
- **寫程式的第一個任務要一起做**：`npm run check` 換成型別、lint 與測試；建置產物加進 `.gitignore`；CI 的 job 加上建置與相依稽核；用了 `tsconfig` 的 `paths`、打包工具的 alias 或自訂 resolver 時，把解析後不出外掛的邊界加進測試（`check-plugin-imports` 看不到這些）；測試安裝的入口：從這個資料夾安裝、只拿這個外掛的產物，先裝到測試 vault 量一次，才裝到正式 vault。
- **檢查的範圍**：改到這個資料夾的任何檔，commit 與 CI 都跑這個外掛的完整檢查；改到最上層的 `docs/syntax.md`（轉錄稿格式所在）也跑。超過 1 分鐘時照最上層 backlog 的技術債〈外掛只改文件也跑完整檢查〉定相關測試。
- **第一批的紀錄**：遇到一起改的檔案、共用檢查省下的步驟、共用資料夾帶來的衝突，寫進最上層 `tasks/one-repo-step-1.md`〈第一批的紀錄〉（D-208 第 5 點）。
