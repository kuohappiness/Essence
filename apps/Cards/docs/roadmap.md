# Essence Cards｜開發現況與路線圖

更新：2026-11-21｜狀態：2026-11-20 從最上層的 roadmap 拆出（D-208 第 8 點，第二步 B）；跨外掛的工作在[最上層的入口](../../../docs/roadmap.md#現在在哪裡)。

手機看進度：[進度白板](https://kuohappiness.github.io/Essence/roadmap.html)，由各份 roadmap 的〈現在在哪裡〉〈已完成〉與決策紀錄自動產生，合併進 `main` 後一兩分鐘更新（`tools/roadmap-board.ts`）。

## 現在在哪裡

v1 開發中（2026-10-20 開始寫程式）。開工只讀這一節；還沒開工的 v1 工作看 [backlog 的 v1 任務](backlog.md#v1-需要做的任務)，要找決定看[決策索引](../../../docs/decisions.md#索引)（[D-141](../../../docs/decisions.md#d-141-文件架構入口只放狀態同一類資訊只維護一份)）。

| 工作 | 狀態 | 下一步 | 等誰 | 入口 |
|---|---|---|---|---|
| 國小國語預設 | 實作中 | 跑跨課比對（翰林五上 L9 的新舊兩版對照已做，[試用紀錄](card-rules/trials.md) 2026-11-25）；v0.11 的多音字與 v0.12 跟著外掛 0.7.0 上線（[任務說明](tasks/polyphone-pick.md)） | Claude | [預設草稿](card-rules/elementary-chinese.md) |
| 入口與目錄 | 討論中 | 決定第三批（管理模式）要不要進 v1 | 使用者 | [四批](plans/entry-and-catalog.md) |
| 英文的學習地圖與預設 | 待實機 | 下一次 iPhone 實機測試看換行、句首大寫與朗讀 | 實機 | [英文預設](card-rules/english.md) |
| 自家孩子的提早試用 | 實作中 | 用 AI 製卡做 Unit 4～6 的卡組；12 月 2 日起開始算數字 | 使用者、Claude | [計畫](plans/early-trial.md) |
| 家長的手機也能製卡與啟用 | 實作中 | 第一步（手機製卡、存成草稿）L2 四輪審完（[報告](<Claude Codex Discussion/2026-11-24-phone-cards-l2.md>)），使用者同意第四輪的 P1 記成限制並合併；開關文字使用者 2026-11-25 同意（「在這台裝置製卡」）；iPhone 實機測試在提早試用之後；第二步（手機啟用）另開；格式查核已做（[回報](<Claude Codex Discussion/2026-11-24-phone-cards-format-review.md>)，第二步開工前再查一次 §3） | 使用者 | [任務說明](tasks/phone-cards.md) |
| 驗證卡片評估機制（先確定 AI 評審判得出好卡片，才比規則） | 實作中 | 盲版資料已整理好，使用者電腦正在照 §3 跑第 2 層的 AI 評審（今天 Fable，11-30 加 Codex）；第 1 層等使用者貼段考考卷；第 2 層的比對等使用者寫完 30 張的感受 | 使用者、Claude | [討論稿](<Claude Codex Discussion/2026-11-27-validate-evaluation.md>) |
| 製卡規則重整的比較測試 | 實作中 | 使用者決定國小社會換不換（〈結果〉門檻 3）；外掛施工寫在[另一份任務說明](tasks/rule-restructure-plugin.md)；英文照 §7 維持現行，下一版照 §9 與[三層架構檢討](<Claude Codex Discussion/2026-11-25-three-layer-review.md>)測試 1 改，用[比較測試工具](tasks/rule-test-tool.md)跑 | 使用者 | [任務說明](tasks/rule-restructure-test.md) |
| 使用說明書 | 討論中 | 使用者看〈自己寫卡組〉的內容；其他部分已定案，正文等 v1 的功能都合併才寫 | 使用者 | [規畫](plans/manual.md) |
| 題型模組（每個學習目標掛上一種題型） | 實作中 | 第 A 步（PR #56，2026-11-26，`ff848530`）與[句子排序好幾種順序都算對](tasks/sentence-order-alternatives.md)（D-238，PR #73，2026-11-27，`8433d5f6`）已合併；照使用者同意的先後做[配對與單選](tasks/matching-single-choice.md)（使用者看任務說明）→ 第 C 步 → 第 B 步；§6 第 1、2、4 題使用者 2026-11-27 回了（第 1 題寫成 [D-243](../../../docs/decisions.md#d-243-好幾題的排序各科都用點的)），第 3 題等使用者選 | 使用者、Claude | [任務說明](tasks/question-type-modules.md) |
| Cards 直接呼叫 AI 製卡（設定頁、直接製作、加深） | 實作中 | 第 1 批已合併（PR #78，2026-11-27）；第 2 批照 §4～§8 實作，§7 已照[格式查核](<Claude Codex Discussion/2026-11-27-ai-direct-format-review.md>)改定，`服務` 寫什麼等使用者選（先照建議的甲做） | Claude | [任務說明](tasks/ai-direct.md) |

正式使用的 vault 現在是 `0.6.0`（2026-11-20，見已完成，[清單](tasks/release-0.6.0.md)），換版時外掛做了備份；更新與相容的下一步見〈等觸發點〉。

第一個里程碑：W1～W6 打通「手寫卡組 → iPhone 複習 → 自評 → 排程」（D-111），2026-10-27 達成（[檢查](<Claude Codex Discussion/2026-10-27-milestone-1-review.md>)已結案）。第二個里程碑：上線前，第一次升正式版 `0.4.0`，2026-11-12 裝到正式 vault；品質檢查見〈等觸發點〉。下一個里程碑還沒定（[quality.md](../../../docs/agents/quality.md#里程碑)）。接下來照 D-111 的順序，從 [backlog 的 v1 任務](backlog.md#v1-需要做的任務)挑下一批。

## 等觸發點

觸發點到了才動的工作，不上白板。入口狀態是等觸發點的列由 `node tools/roadmap-sync.ts` 從狀態板搬過來，觸發點取入口的「下一步」；入口只有 D-ID、或連到沒有狀態行的紀錄的列手寫（[工作流程規範〈roadmap〉](../../../docs/agents/workflow.md#roadmap)）。

| 工作 | 觸發點 | 入口 |
|---|---|---|
| 製卡規則下一輪試用 | 有真實影片筆記時試用：看目標數量、共同成功判準、洩漏與放錯池 | [試用紀錄](card-rules/trials.md) |
| 英文一字多義 | 有多義字的真實教材時試用（規則已改） | [D-125](../../../docs/decisions.md#d-125-英文規則依製卡流程重排與一字多義的學習目標) |
| iCloud 雲端佔位檔 | 說明書開工時一起寫兩段說明與「電腦的 iCloud 要開著」，回頭查 iOS 的「移除下載」「保持下載」 | [任務說明](tasks/icloud-placeholders.md) |
| 正式版的錯誤紀錄與回報 | 說明書開工時一起寫那幾句 | [任務說明](tasks/error-log.md) |
| 第二次里程碑的品質檢查 | R8 剩下的「只刪自己建的」入口，照技術債表的觸發點 | [報告](<Claude Codex Discussion/2026-11-10-milestone-2-review.md>) |
| 更新與相容 | 下一版發布時 | [規畫](plans/updates.md) |
| AI 製卡最小版：Claude 網頁補試 | Claude 網頁額度夠時再試 §8 第 3 點 | [任務說明](tasks/ai-cards-mvp.md) |

## 路線圖

只分 **v1 需要做的任務** 與 **第二階段想做的事**（[D-130](../../../docs/decisions.md#d-130-任務分成-v1-與第二階段)）。目前規格照 D-039、D-111 開發；v1 完工後先做真實使用驗證，不算 v1（D-130 補充）；第二階段不再細分「增強版」「v2 之後」等階段，也未排定功能先後。

```mermaid
flowchart LR
  A["v1 要做<br/>最小複習閉環、AI 製卡（教材直接附給 AI）"]:::now --> B["真實使用驗證（不算 v1）<br/>一位學生 × 一次考試"]
  B -.->|依結果與使用者選擇排優先順序| C["第二階段想做<br/>統一清單，細項以連結引用"]
  classDef now fill:#ffd54f,stroke:#f57f17,color:#000
```

| 工作 | 範圍與入口 | 完成或開工條件 |
|---|---|---|
| v1 需要做的任務 | [產品定義 §5](product.md#5-範圍-第-7-步)、[任務入口](backlog.md#v1-需要做的任務)。W4～W6 後接 AI 製卡，照 D-111；Capture 移到第二階段（[D-206](../../../docs/decisions.md#d-206-essence-capture-移到第二階段v1-的教材直接附給-ai)）；目前進度見上方「現在在哪裡」 | 能在 iPhone 完成段考範圍的每日複習；交付完整 HTML 使用說明書（D-048），說明學習目標 ID 與題目指紋；[技術債表](backlog.md#技術債)的「補測：」「補做：」清空（[D-195](../../../docs/decisions.md#d-195-測試分兩類改不回來的做足其餘延後但不漏)）。v1 完工前（功能做完、開始真實使用驗證前）Claude 仍先問使用者：[產品路線](plans/learning-growth.md)要不要納入部分內容；[學習地圖的視覺化](plans/motivation.md#使用者提議把學習地圖做成有質感的視覺化)要不要做（使用者 2026-10-26 要求在 v1 正式結案前提醒）；同時提醒整理說明書附錄的開發回顧時間軸（[D-099](../../../docs/decisions.md#d-099-文件精簡)） |
| 真實使用驗證 | 一位學生、一次考試，依[成功標準](product.md#2-成功標準-第-1-步)與 D-075 記錄結果；不算 v1，也不算功能階段（[D-130](../../../docs/decisions.md#d-130-任務分成-v1-與第二階段) 補充）。舊決定稱「第 2 階段」 | v1 完工後開始；結果決定第二階段先做什麼 |
| 第二階段想做的事 | [唯一清單](backlog.md#第二階段想做的事)，細項放 [docs/plans/](../../../docs/plans/README.md)，包括動機、題庫、內容深化、體驗、生態及獨立 App | 依驗證結果及使用者選擇排定要做的項目，再完成各自規格與驗收；列入不代表全部已採用或同版交付 |

## 未來準備開發：獨立 App

已列入第二階段清單（D-129），尚未實作。2026-11-20～21 改成網頁版（使用者）：孩子每天打開的入口網站，Cards 在裡面的 `/cards` 複習；利用 v1 空檔先做不含登入的第一次驗證，不算進 v1 的完成條件。進度看最上層 roadmap 的[跨外掛的工作](../../../docs/roadmap.md#現在在哪裡)，主文是 [Cards 網頁版稿](<Claude Codex Discussion/2026-11-20-cards-web.md>)；[開工準備與未決選擇](plans/standalone-app.md)集中在同一主題文件，架構邊界見[架構文件](architecture.md#未來獨立-app規劃中)。

## 已完成

由工具產生：入口的狀態變成已合併或已結案時，`node tools/roadmap-sync.ts` 把那一列移到最上面（[D-217](../../../docs/decisions.md#d-217-狀態只寫在入口狀態板與已完成由工具產生)）；不設列數上限、不搬去封存（[D-214](../../../docs/decisions.md#d-214-工作流程一件事一個現在位置反方向由工具算) 第 5 點）。決定不列在這裡：白板的「最近定案」從決策紀錄產生。2026-11-21 以前搬走的列在[已完成（封存）](../../../docs/archive/roadmap-completed.md#已完成)。入口改成已合併時，[開發進度地圖](../../../docs/progress-map.md)裡對應那一項的符號也一起改。

| 日期 | 工作 |
|---|---|
| 2026-11-27 | **英文句子排序好幾種順序都算對（D-238、D-240）**：PR #73 合併（使用者 2026-11-27 同意，`8433d5f6`），〈結果〉；iPhone 實機併進 0.7.0 那一次（[backlog](backlog.md)）（已結案，[入口](tasks/sentence-order-alternatives.md)） |
| 2026-11-25 | **製卡規則的比較測試工具**：比較測試工具的 13 個指令做完（PR #54）；使用者電腦上的 `claude` 探針與 §8 第 17～19 條照〈結果〉的延後測試補（已合併，[入口](tasks/rule-test-tool.md)） |
| 2026-11-25 | **多音字的點選填空**：PR #53 合併進 `main`（2026-11-25，使用者同意）；L2 四輪結束，第四輪使用者選收窄修完、不再送審；外掛畫面在雲端看過，真的 Obsidian 的畫面與 iPhone 併進 0.7.0 的實機測試（〈結果〉的延後的測試）（已合併，[入口](tasks/polyphone-pick.md)） |
| 2026-11-23 | **國小社會預設**：v0.9 定稿（使用者 2026-11-23；歷史單元 3-1、3-2 試用通過）（已合併，[入口](card-rules/elementary-social.md)） |
| 2026-11-22 | **Obsidian 官方審查檢查**：Cards 的 lint 擋 Obsidian 官方審查會算錯誤的寫法，現有 13 個 lookbehind 記成基準（PR #39）（已合併，[入口](tasks/obsidian-review-check.md)） |
| 2026-11-21 | 三個外掛同一個 repo 的第二步 B 合併進 `main`：Cards 的文件搬進 `plugins/cards/docs/`，任務與討論稿搬進 `docs/`，轉錄稿格式拆到最上層的 `docs/transcript.md`；製卡規則送給 AI 的內容逐位元組不變；Codex L2 四輪（[PR #28](https://github.com/kuohappiness/Essence/pull/28)、[任務說明](../../../docs/tasks/one-repo-step-2.md)） |
| 2026-11-20 | 三個外掛同一個 repo 的第二步 A 合併進 `main`：Cards 的程式、測試與工具搬進 `plugins/cards/`，產品程式逐位元組不變；共用工具有自己的檢查與分派對象；Codex L2 四輪（[PR #27](https://github.com/kuohappiness/Essence/pull/27)、[任務說明](../../../docs/tasks/one-repo-step-2.md)） |
| 2026-11-20 | 正式 vault 升到 `0.6.0`（tag `v0.6.0`，`037b359`）：全詩順序卡、接句卡、英文的打字與排序、AI 製卡第 1～3 批與閱讀模式按「啟用」的修正；iPhone 必測 A1～A5 通過，兩台都換好，是 Cards 搬家的穩定基線（[清單](tasks/release-0.6.0.md)） |
| 2026-11-18 | Claude 改成直接呼叫本機 Codex：`npm run codex` 照類型帶模型與等級、每輪新開、回覆末端附 token 與額度，不再請使用者轉貼；任務開始時分本機或雲端，雲端的 hook 裝相依，會影響做法的記憶搬進 repo（[D-212](../../../docs/decisions.md#d-212-claude-直接呼叫本機-codex任務開始時分本機或雲端)） |
| 2026-11-18 | 本機資料夾改名 `Essence` 完成：演練發現 app 的舊對話記著舊路徑、接不上，改成改名前收尾、交接寫進文件，用腳本改名並核對全部通過，新對話接手測試對得上（[D-211](../../../docs/decisions.md#d-211-本機資料夾也改名舊對話收尾後不接續)、[任務說明](../../../docs/tasks/local-folder-rename.md)） |
