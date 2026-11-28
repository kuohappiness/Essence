# 程式品質：Cards 的設定

給 `code-quality` skill 讀，補[最上層的設定](../../../docs/agents/quality.md)：全專案共用的（角色、本機或雲端、共用檢查與 CI、高風險範圍、測試分兩類、卡關時的升級）照最上層，這裡只寫 Cards 自己的。標題和最上層對應的那一節同名（使用者 2026-11-27 同意拆開）。

## 檢查指令

- Cards 的 `npm run check`（在 `apps/Cards/` 跑，或從根目錄 `npm --prefix apps/Cards run check`）：型別、ESLint（含模組邊界，以及 Obsidian 官方審查會算錯誤的規則，[D-220](../../../docs/decisions.md#d-220-給其他家庭的外掛上架-obsidian-官方目錄第一個外部家庭要裝時才上架) 第 3 點；現有的 lookbehind 記在 `apps/Cards/eslint-suppressions.json`）、knip，最後測試（[D-117](../../../docs/decisions.md#d-117-技術債預防機械檢查全自動ai-審查只在關鍵點)）。共用檢查不在裡面，另外跑。
- 建置、安裝與 Cards 的工具（`install-vault`、`update-vault`、`backup`、`restore`、`locate` 等）都在 `apps/Cards/` 跑，或從根目錄加 `npm --prefix apps/Cards run …`；產物（`main.js`、`styles.css`）也在 `apps/Cards/`。
- 建置：`npm run build`，`main.js` 只能 require Obsidian 提供的 `obsidian`、`@codemirror/state`、`@codemirror/view`（[D-134](../../../docs/decisions.md#d-134-學習目標-id-的補上時機與保護) 的編輯器鎖定），不能把另一份 CodeMirror 打包進去（`apps/Cards/tools/build.mjs` 會擋）。
- 安裝：`npm run install-vault -- <vault> [--dev]`（[D-149](../../../docs/decisions.md#d-149-更新與相容版本紀錄讀取閘門與正式安裝) 第 4 點，擋法在 `apps/Cards/tools/install.ts`）。開發版只裝登錄過的測試 vault：登錄存在主資料夾的 `.local/test-vaults.json`（各 worktree 共用、不進 repo），第一次先 `npm run install-vault -- <測試 vault> --register-test`。裝到測試 vault（含 `--dev`）是在 Cards 的資料夾建置、再從那裡複製（`apps/Cards/tools/install.ts` 的 `install` 裡測試 vault 那一段：`build({ root, … })` 之後 `deploy(root, …)`），中間有別的程序寫了 `main.js` 就會裝到那一份；裝完用開發命令結果檔的 `BUILD` 核對是不是這次的建置（[外掛架構檢查](<Claude Codex Discussion/2026-10-26-plugin-architecture.md>)環節 9 的 N2：照實記下，不改）。其他 vault 一律當正式使用的：要工作樹乾淨、HEAD 是 `v<版號>` 的 tag、`package.json` 版號相同、DEV 關閉，產物與雜湊存到 `.local/releases/<版號>/`；退回用 `--release <版號>`，現有資料的 `需要版本`、`need` 比那一版新就拒絕。
- 「相關測試」：只改 Cards 的文件時，跑寫到那個路徑的測試檔，通過時只印一行（2026-10-29：`b63c1bb` 只改 `syntax.md` 的範例就讓 CI 紅了）。新的測試要讀文件時，在測試裡寫出它的路徑（例如 `apps/Cards/tests/` 裡的 `new URL('../../../docs/syntax.md', import.meta.url)`），分派表才找得到；兩個以上外掛都讀的最上層檔案，登錄在分派表的 `SHARED_SPECS`。

## Cards 的做法

- 寫回筆記的函式，往返與冪等測試登錄進共用的範例清單：`apps/Cards/tests/deck.test.ts` 的 `deckCases`。
- 只在 Node 驗過的檔案存取，接上 Obsidian 前要在 Windows 版 Obsidian 對照一次（D-110）。
- 規格的平台事實表（code-quality〈寫規格〉，[第二次里程碑檢查](<Claude Codex Discussion/2026-11-10-milestone-2-review.md>) R7）在本專案常見的列：iPhone（例如 `stack` 沒有位置，[D-173](../../../docs/decisions.md#d-173-iphone-的-stack-沒有位置沒接住的錯誤一律收)）、CI 的 Linux、Obsidian 的渲染器（和 markdown-it 不同）、Obsidian 的檔案操作與計時器（例如底層的操作不會因為外掛的上限停下）。探針用 Windows 版 Obsidian 的開發命令；iPhone 的項目集中成一次實機測試。
- 測試只用 syntax.md 的例子或自編的內容。
- markdown-it 只當第一層的快速探針，Obsidian 的渲染器不一樣：`$…$` 是數學式、`%%…%%` 是註解、`www.` 開頭會變連結、字中間的底線也算強調（2026-11-04，Obsidian 1.15.0）。結論取決於實際畫面時，用不提交的開發命令跑真的渲染器，並告訴查核者用哪一個重現；程式判斷 Markdown 時寧可用白名單。
- 開發命令要按按鈕或寫檔時，先找到自己建立那一篇的 leaf，在它的 `containerEl` 裡查，不用 `document.querySelector`；有確認視窗時先核對是不是這一篇。測試 vault 常開著使用者自己的分頁（2026-11-08 誤把一篇草稿改成啟用）。
- Obsidian 畫面的截圖用開發版的 `ui` 命令（Electron 的 `capturePage()`），不要用 computer-use：它會截到舊畫面，還會讓 Obsidian 被當成隱藏而停止繪製，計時器和 `requestAnimationFrame` 也跟著變慢（W6 的 Windows 實測）。
- 產品程式（`apps/Cards/src/`，開發命令除外）裡的 `catch` 與 `.catch()`，不是交給錯誤紀錄（[D-155](../../../docs/decisions.md#d-155-正式版的錯誤紀錄)）就要在旁邊寫一句為什麼不用，例如「讀不到是預期的，state 會重試」「已經經過 onError 記下」；ESLint 的 `no-console` 擋得到直接印 console，擋不到空的 `catch` 與吞掉的拒絕，L2 審查照這條看。
- 維修時怎麼讀錯誤紀錄（[D-155](../../../docs/decisions.md#d-155-正式版的錯誤紀錄)、[D-160](../../../docs/decisions.md#d-160-學生在複習畫面回報問題點一個選項記進錯誤紀錄)）：使用者回報問題，或問有沒有學生的回報時，先讀 vault 的 `Essence Cards/紀錄/錯誤/` 那段時間的行（格式見 [syntax.md §9](syntax.md#9-錯誤紀錄)；學生的回報是 `where: "report"`，用 `lt` 在卡組裡找到那一行）。用 `build` 找是哪一版；要把 `stack` 對回原始碼時在 `apps/Cards/` 用 `npm run locate -- <版號> <行:欄>`（只有正式安裝存過對照表的版本能用）；iPhone 的 `stack` 只有名稱、沒有行與欄，`where: "uncaught"` 的可能是別的外掛的錯（[D-173](../../../docs/decisions.md#d-173-iphone-的-stack-沒有位置沒接住的錯誤一律收)）。紀錄可能因同步、上限或寫入失敗而缺漏，沒有那一行不代表沒發生；寫進 repo 的只寫摘要（D-003）。

## Obsidian 相容性檢查

[D-138](../../../docs/decisions.md#d-138-obsidian-出新的次版本時做一次相容性檢查) 的 Cards 做法：

- **目前驗證過的版本**：Windows 1.15.0（2026-11-03，[相容性檢查](tasks/obsidian-1.15-compat.md)；npm 還沒有 1.15 的型別檔，比對列在[技術債](backlog.md#技術債)）；iPhone 1.15.0（2026-11-03，[iPhone 測試](tasks/iphone-test-2026-11.md)）。
- **怎麼發現新版**：開發命令的結果檔會記 Obsidian 的版本（`obsidian` 欄位），AI 在 Windows 版 Obsidian 跑開發命令時看到比上面新的次版本就做；每個里程碑結束時也查一次 Obsidian 的改版說明。
- **三層**：
  1. 比對新舊版 `obsidian` 套件的 `obsidian.d.ts` 與 `peerDependencies`（CodeMirror 的版本）：本專案用到的 API 有沒有改、標成不建議使用；CodeMirror 版本變了就把 `apps/Cards/package.json` 的開發相依改成一樣，在 `apps/Cards/` 跑 `npm run check`。npm 常比 app 晚：還沒有新版時，先讀 `%APPDATA%\obsidian\obsidian-<版本>.asar` 裡的 `app.js`（只讀不執行），查用到的匯出還在、用 CodeMirror 新舊版的差異推定版本，型別檔的比對記進技術債；安裝資料夾的 `resources\obsidian.asar` 是安裝當時的舊版，不能當上一版比。
  2. 在 Windows 版 Obsidian 用開發版重跑 `files`、`compare`、`lock`、`save`、`today`、`answer`、`events`、`a3check`（在 `apps/Cards/` 跑 `npm run install-vault -- <測試 vault> --dev`），結果和上一次比。`events` 比對[外掛架構討論稿環節 1 的 A3 表](<Claude Codex Discussion/2026-10-26-plugin-architecture.md#實機記錄t3-與-a32026-10-27opus-55>)。`a3check` 的每個情境都要 `ok`；`skipped` 列的是未測的子項，不算通過，要和上一次相同；`cleanupLeft` 要是空的（iCloud 偶爾會把剛刪的測試卡組放回來）。開發命令的結果拿來當驗收（這一層與任務的完成條件）時都一樣：必要的操作沒做到不算通過，未驗的子項另外列；「完成」的通知或結果檔存在不算通過。`lock`、`save` 會假通過的情境已修（`b9309ca`，外掛架構討論稿環節 9 結論第 5 條）：`save` 的 `checks.clicked` 也要是 true。
  3. 讀改版說明裡和這幾點有關的條目：編輯器與 CodeMirror、Markdown 解析與閱讀模式（清單、區塊 ID）、檔案與 vault 的事件、iOS 與同步；每一點寫一句結論。
- **結果**：寫在相容性檢查的任務說明〈結果〉，收尾時 roadmap 的〈已完成〉由工具從它的狀態行產生；通過就更新上面的版本；有不相容先寫失敗測試再修（高風險範圍做 L2）。iPhone 的部分記進下一次 iPhone 實機測試的清單。

## 里程碑

見 [Cards 的 roadmap](roadmap.md)。

1. W1～W6 打通「手寫卡組 → iPhone 複習 → 自評 → 排程」（[D-111](../../../docs/decisions.md#d-111-v1-的開發順序capture-延後)），2026-10-27 達成；[檢查](<Claude Codex Discussion/2026-10-27-milestone-1-review.md>)。
2. 上線前：第一次升正式版前（`0.4.0`，考試範圍、小考、點選填空、AI 製卡最小版、設定頁、補紀錄缺口、外掛內還原），2026-11-10 檢查、2026-11-12 裝到正式 vault；[檢查](<Claude Codex Discussion/2026-11-10-milestone-2-review.md>)。
3. 還沒定。💡 v1 功能做完、開始真實使用驗證之前（roadmap 路線圖 v1 的完成條件）。
