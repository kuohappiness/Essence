# Essence Cards 協作規則

最上層的 `AGENTS.md` 一體適用；這裡只寫 Cards 特有的。repo 的結構與每一層放什麼見最上層 `docs/architecture.md`〈repo 結構〉。

- **是什麼**：把筆記變成閃卡、讓學生用間隔重複在手機上複習的 Obsidian 外掛；和 Capture、Mindboard 各自安裝、各自可用（D-006）。
- **開工先讀**：`plugins/cards/docs/roadmap.md` 的〈現在在哪裡〉；其他文件照 `plugins/cards/README.md` 的表找。（路徑都從 repo 的根寫起，免得和最上層的 `docs/` 搞混。）
- **文件放這個資料夾**：`plugins/cards/docs/` 底下，任務、討論稿與規畫也是（`docs/tasks/`、`docs/Claude Codex Discussion/`、`docs/plans/`，D-213）；和別的外掛共用的放最上層。決定寫進最上層的 `docs/decisions.md`，狀態行下一行寫「適用：Cards」。
- **製卡規則**：輸出格式要和 `plugins/cards/docs/syntax.md` 一致；讀轉錄稿的部分照最上層的 `docs/transcript.md`。
- **程式**：不 import 其他外掛與最上層的程式（D-208 第 10 點，`tools/check-plugin-imports.ts` 擋）。在這個資料夾 `npm ci`、`npm run check`；commit 時 hook 照分派表自動跑。
- **檢查的範圍**：改到這個資料夾的程式、測試、設定，commit 與 CI 都跑完整檢查；只改文件（`.md` 與 `docs/`），commit 只跑寫到那個檔的測試，CI 跑完整檢查。改到最上層的 `docs/transcript.md`（分派表登錄的共用規格）也一樣。
