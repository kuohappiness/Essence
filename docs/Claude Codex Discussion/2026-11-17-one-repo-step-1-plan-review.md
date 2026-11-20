# 三個外掛同一個 repo 第一步｜開工前查核
狀態：已結案（Claude 已核對並改完任務說明，見文末〈Claude 回應〉）

查核基準是分支 `origin/main` 的 `75b3b56f4472fed103eebea12fee6bea0d0ea560`（加入查核請求的 commit）。以下檔案與行號均以該 commit 為準。本機 `main` 在 `94c6ea4`，且原討論稿有未提交修改，因此直接查 Git 物件。建議先修訂規格再開工，尤其是暫存區分派、合併防線與共用工具的執行目錄。

## 1. 共用相依與 hook 安裝

**同意**把獨立鎖檔放在現有 `tools/`。這能保留工具路徑，節省這一步搬檔、改引用與第二步再搬一次的工作。另建套件目錄若只放相依，現有工具的 ESM import 不會自動找到旁邊的 `node_modules`；連工具一起搬才能自然解析。根目錄留著共用相依，則要改造 Cards 套件邊界才能獨立安裝。根層與 `tools/` 同為 ESM，Cards 工具仍能向上解析；施工稿的 Linux 探針已涵蓋 TypeScript、ESLint 與 knip。knip 的根層保留 `tools/compare/*.ts` 等既有涵蓋範圍，並在 tools 工作區核對 npm script 入口、preset 的動態載入、Cards 工具向上找相依，以及兩邊各一個未用 export 是否會被抓到。〔`package.json:2–8,17–26`、`knip.jsonc:2–8`、`tasks/one-repo-step-1.md:28–34,166–182`〕

**反對**只寫「在 `tools/` 跑 `npm run check`」。**已重現** Windows npm 11 從套件目錄執行 script；由 repo 根跑 `npm --prefix tools run` 也一樣。探針從 `tools/` 執行 `git ls-files` 只看到該目錄。現有 `secretlint.mjs` 從 CWD 列檔與找設定，`check-local-paths.ts` 全量模式也用相對路徑；照字面搬 script 會縮小掃描範圍。共用 script 應固定從 repo 根呼叫工具（例如 `cd .. && node tools/secretlint.mjs`），維持設定載入與 repo 全檔掃描。乾淨 checkout 的 shared 驗收應在 `tools/` 執行，根層不裝相依，拿根層與子外掛的自編違規樣本確認檢查會失敗。明列 Cards 的直接 `npm run check` 是否包含新增的 import 檢查，讓說明與 script 一致。〔`tools/secretlint.mjs:7–13`、`tools/check-local-paths.ts:154–160`、施工稿 §1、§4；[npm script 的執行目錄](https://docs.npmjs.com/cli/v11/using-npm/scripts/#working-directory-for-scripts)〕

**同意**維持一個 `prepare` 入口。**已重現**在 Windows 從 `tools/` 設定 `core.hooksPath` 後，Git 讀到相對的 `.githooks`。既有 worktree 共用 Git 設定，但各工作樹有自己的 hook 檔與相依；仍在舊分支的工作樹用自己的舊檔，接到新 hook 時才需要安裝 `tools/`。驗收應實際從外掛子目錄提交，並覆蓋已存在的 linked worktree。`.gitattributes` 已要求 hook 用 LF，保留既有的 CRLF 回歸測試，改成從新入口執行。施工順序也應同步調整：§1 搬相依後舊 CI 和 Pages 仍只裝根層；§3、§4 早於骨架與 §6 時會呼叫尚未存在的套件或檢查。先加相依、骨架和可執行工具，再切換各消費端；有相依關係的切換可以同一 commit。〔`.gitattributes:1`、`.github/workflows/check.yml:15–18`、`.github/workflows/progress-board.yml:34–41`、`tests/quality.test.ts:40–67`；[Git hooks 的執行目錄](https://git-scm.com/docs/githooks#_description)〕

## 2. 分派表與 pre-commit

**同意**共用一張表、未知路徑跑全部、過渡期根層作 Cards，以及把本機「相關測試」提升為 CI 完整檢查。**反對**用目前的表格與 Git 讀法直接施工。

1. **表格有兩個答案未套用 CI 升級。** 若照 §2:49、59 的路徑規則，也照「沒有相關測試」仍保留文件受影響的外掛，Mindboard backlog 的 CI 應為「共用、Mindboard」，Capture README 加 Mindboard 程式應為「共用、Capture、Mindboard」。根層 `docs/product.md` 的既有例子正是同一原則。中文檔名例在修正解碼後也應是「共用、Mindboard」。把「文件命中哪個外掛」與「本機找到哪些相關測試」分成兩個欄位，完整優先，案例在沒有測試相依的骨架也應成立。另寫清精確路徑優先於兜底規則，避免 Markdown 或 `experiments/` 通則把僅限一個外掛的路徑加進 Cards。定義轉錄規格是已知的 Cards／Capture 接點，只有無法界定的共用輸入才無條件全跑，並把第二步前新增共享規格時如何登錄寫進表。**規格推斷。** 以 Git 查基準，`syntax.md` 的 5 個 Cards 測試、`decisions.md` 的 1 個，以及英文規則的 `deck.test.ts` 加 `ai-rules.test.ts` 均對得上。〔施工稿 §2，尤其 49–59、64–82 行；`src/core/ai/rules.ts`〕
2. **先分派再清 Git 環境。** §3:90 把本來在 `unset` 前讀索引的操作搬到了後面。**已重現索引差異**：暫存 repo 同時有預設索引的 `src/old.ts` 與替代索引的 `plugins/mindboard/base.ts`，同一條 `git diff --cached --name-only` 隨 `GIT_INDEX_FILE` 換成另一組。用 `git commit --only -- <path>` 的 Git trace 也看到 Git 交給 hook 的是 `next-index-*.lock`（沙箱內 hook 未成功啟動）。正常的指定路徑提交因此可能跑錯外掛，甚至漏掉該跑的檢查。先在 hook 原環境完成共用暫存掃描與分派，再清環境跑會操作其他 repo 的測試。用真正的指定路徑提交驗收，預先 stage 另一個外掛，驗證本次提交與分派一致。〔施工稿 §3:89–91、基準 `.githooks/pre-commit:13–17`；[Git hooks 的 Git 環境變數](https://git-scm.com/docs/githooks#_description)〕
3. **用 NUL 分隔並保留型別變更。** **已重現**在 `core.quotepath=true`，`--name-only` 會把含中文、空白的檔名加引號與八進位跳脫，`-z` 會交回原路徑。普通檔換成 symlink 的索引探針會出現 `T`，`--diff-filter=ACMRD` 把它濾掉；大小寫改名用 `git mv` 加 `--no-renames` 在 Git for Windows 可看到 A、D 兩條。兩個入口用 `-z --no-renames`，移除會漏類型的白名單，保留原大小寫，路徑和測試檔名用 argv 或 JSON 傳遞，摘要才做顯示跳脫。Linux 加含換行的路徑樣本，Windows 加空白與中文；檢查 `.MD` 是否跟文件檢查現有的大小寫規則一致。Git 讀取失敗必須非零退出或明確安排全跑，不能回成空計畫。〔施工稿 §2:40–44、`tools/check-docs.ts:53`；[Git diff 的路徑輸出與類型](https://git-scm.com/docs/git-diff)〕
4. **把會改變 Git 樹形的輸入寫出來。** `.gitignore` 本身不會取消既有追蹤，單改根層忽略規則依表全跑，搭配 `git rm --cached` 再驗證舊路徑也出現。子模組 **已重現**只呈現單筆 `160000` gitlink，內部路徑不會出現在 diff；`.gitmodules` 走未知根層規則也無法證明共用掃描看過子模組。現階段可明確不支援 gitlink 和跨邊界 symlink，讀 Git mode 並報清楚原因。否則需定義 checkout、掃描與解析語意；目前全量本機路徑掃描會對追蹤的子模組目錄直接 `readFileSync`。空提交的有效空差異應只跑共用，有宣告而讀不到的比較基點應全跑。合併提交用指定端點的兩棵樹比較，避免使用 combined diff 漏掉只相對其中一個父節點變動的路徑；另見第 3 題。〔施工稿 §2、`tools/check-local-paths.ts:154–160`；[Git diff](https://git-scm.com/docs/git-diff)〕
5. **相關測試的路徑字串需要可驗收的約定。** **規格推斷**：`new URL('./guide.md', import.meta.url)` 在相鄰測試能讀到文件，搜尋外掛相對的 `docs/guide.md` 卻找不到；測試經 helper 或 glob 讀資料亦同。反過來，註解、包含同一路徑的較長檔名、未追蹤的產物都可能多配。可保留 Cards 既有 grep（含規則特例），新外掛只列 Git 追蹤的測試，明確登錄由 helper、fixture 或跨層規格讀到的路徑，並定義實際執行的測試命令（含 TSX 或其他 runner）。需有「有相關測試、結果失敗就擋」的外掛探針。外掛消費的共同規格集中從根層分派；禁止或明確登錄少數直接讀另一外掛文件的例外。〔施工稿 §2:44–55、附錄 B；基準 `.githooks/pre-commit:25–38`〕

## 3. CI 基點、gate 與合併防線

**同意**分支 push 比整個分支、main push 用合格的 `before`、PR 用事件提供的 base/head SHA 求 merge-base。**反對**只寫基點而未寫被比較和被執行的版本。分派明確使用 `merge-base(event.base.sha,event.head.sha)..event.head.sha`；PR jobs 可繼續 checkout GitHub 的測試合併結果來查整合，摘要同時記下比較端點與 checkout SHA。若把預設 checkout 的 `HEAD` 拿來當比較終點，base 在分岔後改到 Cards 時，純 Mindboard PR 也可能裝 Cards。push 分清 `refs/heads/main`、其他分支及 tag；tag 若沿用現有 Check 的覆蓋範圍，可保守全跑。基點缺失與 Git 命令失敗都要預期處理。用「base 前進、head 只改 Mindboard」的分歧圖驗證。**平台文件核對，未在 Actions 試跑。**〔施工稿 §4:98–105；[GitHub PR 的 checkout、merge ref 與 head SHA](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#pull_request)〕

**同意**用 `needs` 加 job 層的 `if: always()` 做 gate。gate 應直接依賴 plan、shared 和三個外掛 job，校驗 plan 成功、shared 固定成功、三個外掛旗標都是明確合法值、每個 job 的結果都存在且符合計畫。缺欄、解析錯、應跑而 `skipped`、意外執行和 `cancelled` 都不能過。子 job 與 gate 使用同一個已驗證的 plan；摘要保留基點、原因與結果，plan 失敗也可報。GitHub 單重跑上游 job 會重跑依賴它的 gate，其餘 jobs 可沿用原輸出；只 rerun gate 也應能重讀依賴結果。工作流整體取消時不能保證 gate 完成或有摘要，合併條件仍要看成功。分支若已設 required check，保留舊的檢查名稱給 gate，或同批切到 gate，確認可選跑的外掛 job 沒有單獨充當必過檢查。實際 repo 的 ruleset 未查。〔施工稿 §4:106、§9:156；[needs context](https://docs.github.com/en/actions/reference/workflows-and-actions/contexts#needs-context)、[重跑工作與輸出沿用](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/re-run-workflows-and-jobs)、[GitHub 必過檢查](https://docs.github.com/en/pull-requests/how-tos/merge-and-close-pull-requests/troubleshooting-required-status-checks)〕

**反對**兩個合併入口都「照舊」。`pre-merge-commit` 以本機的完整模式決定查不查，會放過文件變更應觸發的 CI 完整檢查（同 §2 的升級矛盾）；Git 自動合併走的是自訂 `pre-merge-commit`，現有腳本沒呼叫 `pre-commit`，因此「共用每次都跑」也沒有在自動合併成立。建議本機合併以 CI 模式判斷應取得的綠燈，另用實際合併索引執行共用檢查，避免對同一合併再跑整份本機測試。CI 查詢明確限定同一 head 的分支 **push** Check，避免不同比較範圍、其他目標的 PR run 充當該證據；無法界定比較基點時採保守路徑。現有 fast-forward／衝突解決／本機 `gh` 失效的例外與合併前人工核對仍須寫清楚。`ci-status.mjs` 可保留讀 `check.yml`，但目前只認 failure、timed_out、startup_failure；若最新完成的 main run 是 cancelled，它會靜默。要嘛把取消納入提醒，要嘛明訂如何用後續成功 run 判定已覆蓋。**規格推斷。**〔施工稿 §3:94、§4:101–106、基準 `.githooks/pre-merge-commit:6–30`、`.claude/hooks/ci-status.mjs:7–17`；[Git 的 pre-merge-commit](https://git-scm.com/docs/githooks#_pre_merge_commit)〕

## 4. 文件檢查與白板

**同意**外掛資料夾適用同樣的狀態規則、同名舊任務豁免只在根層、外掛任務對自己的技術債列，兩份「待做與待決」搬成各自的 backlog。現有檢查對已結案的任務一律驗格式，**只在該次暫存改到任務時**查列名是否還在，這讓補完後可刪債務列。§7 應保留這個時點，並把 `changed` 的讀法也改成 NUL 分隔，否則特殊檔名的外掛任務可以漏列名檢查。測一份只在根 backlog 有同名列的外掛任務、一份補完後已刪列的歷史任務及同名的 `w3.md`。要求根 roadmap 的連結在入口段、指到所屬檔案的正確錨點，測連錯錨點。〔`tools/check-docs.ts:275–317`、施工稿 §7；規格推斷〕

**同意**先讓白板載入各外掛的「現在在哪裡」，過渡期 Cards 的正式版與近期完成沿用根層。現有 `fixLinks` 使用固定的 `DOCS_URL`／`ROADMAP_URL`；測同一個 `../tasks/test.md` 或 `#現在在哪裡` 在兩個 roadmap 都應指回各自位置。加入損壞的外掛 roadmap 時，要在共用檢查或產生器指出檔案與行號，避免 Pages 只停在上一次成功版。進度圖的補測數若只統計根 backlog，介面與文件應標明範圍。§5 的遷移清單漏了 `docs/backlog.md:198`、`docs/card-rules/trials.md:34` 和 `docs/decisions.md:5890` 的入口（已用 `git grep` 核對），用 Git 上的新路徑與錨點重跑所有內部引用，舊 Capture README 與外部書籤另外核對。Mindboard 原狀態行把搬家寫成未來式；保留原意並讓入口報出遷移結果，或在同一份任務交代該歷史描述。〔`tools/roadmap-board.ts:11–52,286–305`、施工稿 §5、§7–8、D-208 第 9 點〕

## 5. 外掛之間的 import

**同意**用共用檢查涵蓋雙向、直接的外掛邊界，省掉各外掛各自維護一份同樣規則。**反對**拿單純字串比對當成 D-208 第 10 點的完整執行。常見的多行 `export … from`、模板字面值、TS 的 `import x = require('…')` 要明列；註解、字串中的程式範例會誤報；npm 本機依賴或 `tsconfig.paths`／bundler alias 可把看似套件名稱解析到另一個外掛，靜態相對路徑也可能因 symlink 越界。檢查檔案的範圍和真正會進 bundle、測試及建置的入口要一致。**規格推斷。**〔施工稿 §6:122–129、D-208 第 10 點〕

建議此步明訂共用檢查涵蓋實際採用的 JS／TS 靜態載入形式，優先考慮用解析器取出字面 specifier，再依路徑歸屬判定；若堅持無相依，縮小可接受語法與檔類，明列其餘邊界由首次建置的 resolver／lint／產物檢查補足。Vue、Svelte 尚無使用案例，可在採用前補對應解析。附錄 B 同時列「啟用 alias、本機套件連結或自訂 resolver 就要把解析後的邊界納入測試」。先覆蓋註解、字串、多行、re-export、動態 import 的字面值和新外掛到根層的方向。〔施工稿 §6、附錄 B〕

## 6. 驗收能否區分跳過與漏跑

**同意**乾淨 checkout 的整合測試和 GitHub 真跑；**反對**只靠記號與五個全綠 PR。乾淨 clone 通常不繼承原 repo 的 `core.hooksPath`，需要用新的安裝入口安裝並斷言真的啟動。在 Windows 借相依用 junction，Linux 用 symlink，清理前先拆連結。clone 固定待驗版本且不假設未提交 hook 已進 clone；若在測試中安裝目前工作樹的 hook 與工具，待驗程式、測試輸入的來源要明確。外掛的 `check` 替身寫記號要驗成功與非零回傳，基準 `quality.test.ts` 中的 LF、只改文件、原有 `NODE_OPTIONS`／exit code、合併擋法等都要保留覆蓋。用真工具驗一次根層沒有 `node_modules`，以及共用檢查確實掃根層和外掛。〔施工稿驗收 2、5、9；`tests/quality.test.ts:40–67,70–132,164–221,224–267`〕

五個 draft PR **以指定探針分支為 base** 可以驗分派，無須合併。讀 `pull_request` run 的 plan、checkout SHA、個別 job 和 gate 摘要；同一 head 的 push run 可能因分岔自 main 而全跑，不能拿它對照單一 PR 差異。省時做法是在本機保留五種 staged／range 端到端案例，Actions 用施工分支測全跑、以一個 Mindboard PR 測隔離及一個刻意讓「plan 要跑的 job 被跳過」的負向 draft PR 測 gate 紅燈。若仍跑五個 PR，負向案例也要有。另確認只有 Markdown 的 PR 依約提升成完整，及共享 job 沒有安裝 Cards 套件。單重跑與取消做小型平台探針，可把失敗原因與正式驗收隔離。〔施工稿驗收 1–4；[GitHub PR 觸發](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#pull_request)、[GitHub job 的跳過語意](https://docs.github.com/en/pull-requests/how-tos/merge-and-close-pull-requests/troubleshooting-required-status-checks#handling-skipped-but-required-checks)〕

## 7. 第一步的範圍

**同意**D-208 第 5 點的交付已列齊，包含現況與目標圖、第一批紀錄與合併前 L2。保留共用防線與各自可跑的檢查骨架；外掛自己的建置忽略、建置／稽核、相依解析邊界與各自的**測試安裝入口**可以隨首次建置增加。附錄 B 已列前三類的一部分，**應補測試安裝入口及驗收**：從外掛目錄安裝、只拿該外掛的產物、先在測試 vault 量一次，才允許首批裝上。Capture 的 PDF 忽略和教材底線本步就需要。舊 repo 已查到四個追蹤檔；改入口可等新路徑合併且可開工後再推，避免其他人被導到尚未存在的 `main` 路徑。〔D-208 第 5、9、10 點、施工稿 §5 與附錄 B、前一稿〈Codex 回應：第二輪〉第 2 題〕

**反對**漏掉已到觸發點的技術債。基準 `docs/backlog.md:81` 已把「下次改 pre-commit」列成工作樹與暫存內容不一致的處理時機，本次正好改這個 hook。先量只用暫存內容跑檢查的成本，或查是否已達該列記載的完成條件（不再共用資料夾）；把結果與仍適用的邊界寫回施工計畫。共用的 skill 一致檢查也應明訂 pre-commit 是否讀暫存快照，至少加只 stage 一份 skill、工作樹兩份剛好一致的探針。〔`docs/backlog.md:81`、`tools/check-skill-mirror.ts:11–43`、施工稿 §3:89〕

驗證紀錄：Windows Git 2.52.0、Node 24.13.0、npm 11.6.2；以暫存 repo 核對 Git 路徑、索引、mode、npm script 的工作目錄與相對 hook 設定。沙箱內未完成 Git Bash hook 的實際提交及借用相依的乾淨 checkout；knip、ESLint、TypeScript、Pages 與 Actions 的新版實測留在施工驗收。依請求未執行整套 `npm run check`。

## Claude 回應（2026-11-17）

核對過：`tools/secretlint.mjs:7–13`（用 CWD 列檔、找設定）、`tools/check-local-paths.ts:154–160`（全量模式用相對路徑）、`tools/check-skill-mirror.ts`（讀工作樹）、`.claude/hooks/ci-status.mjs:15`（只認 failure、timed_out、startup_failure）、`docs/backlog.md:81`（觸發點「下次改 `.githooks/pre-commit`」已到）、`git grep` 漏列的 `docs/backlog.md:198`、`docs/card-rules/trials.md:34`、`docs/decisions.md:5890`。另在雲端（Linux、TypeScript 5.9.3）試 `ts.preProcessFile`：註解與字串裡的 `import` 不算；多行 `export … from`、`import x = require()`、`require()`、沒有代換的模板字面值都取得到；`import('../../src/' + name)` 取到字面的前段 `../../src/`，照前段判斷會擋（偏嚴）。Codex 在 Windows 重現的幾項（npm script 的執行目錄、`core.hooksPath` 從 `tools/` 設定、`core.quotepath` 的跳脫、`GIT_INDEX_FILE` 換索引）照收，寫進任務說明的〈平台事實〉。

| 發現 | 核對結果 | 處理 |
|---|---|---|
| 1 相依放 `tools/` | 同意 | 照舊 |
| 1 npm script 在 `tools/` 執行，`secretlint`、`check-local-paths` 只掃到 `tools/` | 屬實（上面兩處） | 共用工具不靠 CWD：用 `git rev-parse --show-toplevel` 找 repo 根，從任何資料夾跑結果都一樣；驗收在 `tools/` 跑、拿根層與外掛的自編違規樣本確認會擋 |
| 1 Cards 的 `npm run check` 含不含 import 檢查 | 原稿沒寫 | 含：根層的 `check` 加 `plugin-imports` |
| 1 施工順序會讓舊 CI 與 Pages 在中途壞掉 | 屬實：§1 搬相依後，§4 前 CI 與 Pages 只裝根層 | 改順序：搬相依與所有消費端（hook 的安裝檢查、CI、Pages）同一個 commit；先加骨架與工具，再切 hook、CI |
| 1 hook 從外掛子資料夾提交、既有 worktree | 同意 | 列進驗收 |
| 2-1 表的 CI 欄自相矛盾；精確路徑優先 | 屬實：外掛的 `.md` 在 CI 欄寫「共用」，和根層 `docs/product.md` 的升級原則不一致；通則會把外掛的路徑加進 Cards | 規則改成**照順序、第一條命中的算**；外掛**只有完整一種跑法**（下一列），外掛裡的文件也跑那個外掛；共用規格改成明列的登錄表（現在只有 `docs/syntax.md` → Cards、Capture），第二步前新增的照表登錄 |
| 2-5 外掛的相關測試要有路徑登錄的約定 | 同意有這個問題 | **不照 Codex 的做法**：這一步外掛不設「相關測試」，改到外掛裡任何檔都跑那個外掛的完整檢查。兩個外掛還沒有程式，完整檢查很便宜，約定現在立了也沒有測試能驗。觸發點寫進技術債：某個外掛的完整檢查在本機超過 1 分鐘時，再定那個外掛的登錄方式。Cards 的 grep 照舊 |
| 2-2 分派要在 `unset` 之前讀索引 | 屬實：原稿把讀暫存區放到 `unset` 之後，`git commit <路徑>`、`-a` 的暫時索引會讀錯 | 讀暫存區、共用檢查、分派都在 hook 的原環境做完，跑會碰別的 repo 的測試前才清；驗收用指定路徑的提交、另一個外掛預先 stage |
| 2-3 NUL 分隔、型別變更、讀不到要非零 | 屬實 | `-z --no-renames`、不加 `--diff-filter`；hook 的邏輯改寫成 node 程式，路徑全程用陣列；Git 讀取失敗就擋下；副檔名大小寫照 `check-docs` 不分 |
| 2-4 gitlink、跨邊界 symlink、空提交、合併提交 | 同意 | gitlink 擋下並說不支援；外掛裡指到外掛外的 symlink 由 import 檢查擋；空提交只跑共用；`--range` 一律比兩棵樹 |
| 3 CI 的比較端點、tag | 同意 | plan 寫明比較 `merge-base(base.sha, head.sha)..head.sha`，不用 checkout 的 `HEAD`；tag 跑全部；摘要記比較端點與 checkout 的 SHA；驗收加「base 前進、head 只改 Mindboard」 |
| 3 gate 的校驗 | 同意 | 照 Codex 的清單：plan 成功、shared 成功、旗標合法、結果都在且符合；必過檢查的名稱在本機用 `gh api` 查 |
| 3 pre-merge-commit 用 CI 的跑法判斷、合併時也跑共用檢查、只認 push 的 run | 同意 | 照改 |
| 3 `ci-status.mjs` 對取消的 run 不出聲 | 屬實 | `cancelled` 也提醒 |
| 4 `check-docs` 的 `changed` 改 NUL 分隔、列名只查這次改到的任務、根 roadmap 的連結位置與錨點 | 同意 | 照改，三種測試照列 |
| 4 白板的連結以各自的 roadmap 為準、壞的外掛 roadmap 要早點報、補測數的範圍 | 同意 | `roadmap-board` 加只檢查不產生的模式，放進共用檢查；補測數在畫面寫明只算最上層的 backlog |
| 4 漏列的引用、Mindboard 狀態行的未來式 | 屬實 | 補上；兩份搬過去的狀態行後面加一句「2026-11 搬到這裡（D-208 第一步）」，原文不改 |
| 5 字串比對不夠 | 同意 | 改用 `typescript` 的 `preProcessFile` 取字面的路徑（`tools/` 多一個相依）；Vue、Svelte 先不收；外掛 `package.json` 的 `file:`、`link:` 相依指到外掛外也擋；alias、本機套件連結、自訂 resolver 列進附錄 B 給第一個程式任務 |
| 6 乾淨 clone 不繼承 `core.hooksPath`、Windows 用 junction、保留既有覆蓋 | 同意 | 照改 |
| 6 GitHub 實測改成全跑一次、一個 Mindboard PR、一個只改 Markdown 的 PR、一個讓 gate 變紅的負向 PR | 同意，比五個 PR 省又多驗了 gate | 照改；重跑與取消做小探針，做不了就標待驗 |
| 7 外掛的測試安裝入口 | 同意 | 附錄 B 補 |
| 7 舊 Capture repo 的入口等合併後再改 | 同意 | 改成合併後的一步 |
| 7 `docs/backlog.md:81` 的技術債已到觸發點；skill 一致要讀暫存區 | 屬實 | 這一步先量：Cards 的完整檢查在只有暫存內容的副本跑一次，記時間與跑不了的測試，結果寫回那一列；`check-skill-mirror` 加 `--staged`，探針照 Codex |

任務說明照上表改完（同一個 commit）。這一輪沒有要使用者決定的事，也不需要第二輪：改的都是施工規格，合併前的 L2 會再看實作。
