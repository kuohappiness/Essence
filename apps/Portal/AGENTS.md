# Essence Portal 協作規則

最上層的 `AGENTS.md` 一體適用；這裡只寫 Portal 特有的。repo 的結構與每一層放什麼見最上層 `docs/architecture.md`〈repo 結構〉。

- **是什麼**：孩子每天自己打開的入口網站，裡面有 Cards 的複習（`/cards`）、番茄園讀書社的連結、自己的學習狀態，之後還有網頁版 Mindboard 與其他軟體；加上中繼站（伺服器那一端），在電腦的 Obsidian 與孩子的網頁之間搬 Essence 的資料。Obsidian 的 vault 是唯一的正本，中繼站只放副本與還沒寫回的作答。不是 Obsidian 外掛（D-218）。
- **現在**：只有文件，還沒寫程式；方向與待決在 `apps/Portal/docs/Claude Codex Discussion/2026-11-20-portal.md`。開工先讀它，再讀 `apps/Portal/docs/backlog.md`。（路徑都從 repo 的根寫起，免得和最上層的 `docs/` 搞混。）
- **底線**：孩子的帳號、作答與名單是個人資料，不進 repo，測試用自編的；不提交 Firebase、Cloudflare 的金鑰與服務帳戶；不讓伺服器保管 Firebase 專案的私鑰（討論稿第 4-3 節）。
- **文件放這個資料夾**：`apps/Portal/docs/`，任務、討論稿與規畫也在裡面（`docs/tasks/`、`docs/Claude Codex Discussion/`、`docs/plans/`，D-213），第一份文件出現才建；和 Cards 共用的格式（作答紀錄、卡組、設定）只寫在 Cards 的 `docs/syntax.md`，這裡用連結。建了 `apps/Portal/docs/roadmap.md` 就從最上層的 `docs/roadmap.md` 連過來（文件檢查會擋）。決定寫進最上層的 `docs/decisions.md`，狀態行下一行寫「適用：Portal」。
- **程式**：還沒有。寫第一行程式前照 D-208 第 5 點建套件設定、檢查與分派表的正式登記（現在分派表把這裡登記成只有文件，出現 `package.json` 就報錯）；不 import 其他軟體的原始碼，`/cards` 用 Cards 建好的成品（D-208 第 10 點、D-218）。
