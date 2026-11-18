# Essence Cards｜開發現況與路線圖

更新：2026-11-18

手機看進度：[進度白板](https://kuohappiness.github.io/Essence/roadmap.html)，由這份的「現在在哪裡」與「已完成」自動產生，合併進 `main` 後一兩分鐘更新（`tools/roadmap-board.ts`）。

## 現在在哪裡

v1 開發中（2026-10-20 開始寫程式）。開工只讀這一節；還沒開工的 v1 工作看 [backlog 的 v1 任務](backlog.md#v1-需要做的任務)，要找決定看[決策索引](decisions.md#索引)（[D-141](decisions.md#d-141-文件架構入口只放狀態同一類資訊只維護一份)）。

| 工作 | 狀態 | 下一步 | 等誰 | 入口 |
|---|---|---|---|---|
| iCloud 雲端佔位檔（第一優先） | 已定案（[D-154](decisions.md#d-154-雲端佔位檔讀不到時預防當下說清楚先實測)）；Windows 實測與存檔受阻的提示已合併進 `main`（`9c07caa`，結果在任務說明〈結果〉） | iPhone 實測做完（[結果](../tasks/iphone-test-2026-11.md)）：E1、E6 不是佔位檔，離線作答與恢復通過；iOS 27.0.1 找不到「移除下載」「保持下載」，寫說明書時要回頭查；說明書的兩段與「電腦的 iCloud 要開著」跟說明書一起寫；技術債等觸發點 | 說明書開工 | [任務說明](../tasks/icloud-placeholders.md) |
| 正式版的錯誤紀錄與回報 | 已合併進 `main`（`87a0d2c`，[D-155](decisions.md#d-155-正式版的錯誤紀錄)、[D-160](decisions.md#d-160-學生在複習畫面回報問題點一個選項記進錯誤紀錄)，[Codex L2](../tasks/exam-scope-review.md) 五輪後通過）；隨 `0.2.0` 裝到正式使用的 vault（2026-10-31，見已完成） | iPhone 實測（[結果](../tasks/iphone-test-2026-11.md)）：旗子、重開、傳回電腦都通過；stack 沒有位置，改成全收（[D-173](decisions.md#d-173-iphone-的-stack-沒有位置沒接住的錯誤一律收)），L2 四輪後結案（[報告](<../Claude Codex Discussion/2026-11-03-iphone-test-fixes-review.md>)），已合併進 `main`（`25deec7`），隨 `0.3.0` 裝到正式使用的 vault（2026-11-04，見已完成）；iPhone 確認過（2026-11-11 上線前 [A12](../tasks/release-0.4.0.md)）；說明書的句子跟說明書一起寫 | 說明書開工 | [任務說明](../tasks/error-log.md) |
| 第二次里程碑的品質檢查（上線前） | 檢查做完（2026-11-10），安全檢查沒有達到門檻的發現；R1～R7 與 R8 的 ESLint 已在 `main`（合併 `bbfd804`、`5f39b5d`）；R9 使用者選定改寫 D-197（[D-200](decisions.md#d-200-l2-的發現鏈待驗問題連兩輪沒驗先讀宿主程式整類修過仍失守就換前提)）；R10 的清理做完（2026-11-12） | R8 剩下兩項（刪除收成「只刪自己建的」入口、pre-commit 讀工作樹）照[技術債](backlog.md#技術債)的觸發點；2026-11-09 之後的 token 補量、雲端 session 有沒有接 pre-commit 只記下；R5 的作者信箱已改用 GitHub 的 noreply（之後的 commit） | 觸發點 | [報告](<../Claude Codex Discussion/2026-11-10-milestone-2-review.md>) |
| 國小社會預設 | v0.8；AI 製卡最小版已先開（使用者 2026-11-07），草稿照樣審；試用停在 v0.7，還沒判定通過；跨單元加題的寫法能用，但 Sol 不寫待核對（[試用紀錄](card-rules/trials.md)） | 試一課歷史、文化或公民類的單元，看每課目標量與要不要擋常識題，結果用來改預設（[backlog](backlog.md#v1-需要做的任務)） | 使用者 | [預設](card-rules/elementary-social.md)、[試用紀錄](card-rules/trials.md) |
| 國小國語預設 | 放進 v1、三～六年級（[D-172](decisions.md#d-172-國小國語放進-v1)）；方向已定（[D-175](decisions.md#d-175-國小國語的學習地圖字是根生字拆成字形字義讀音)）：字義是核心，生字拆成字形、字義、讀音三種目標，語境分三階；預設草稿 v0.1 定案（Codex 查核兩輪）；翰林五上 L7 試用過，含只用 R3 的對照（[試用紀錄](card-rules/trials.md) 2026-11-04）；相似字定案做點字比較卡（[D-178](decisions.md#d-178-相似字用點字比較卡一格一個學習目標)），畫面已定，預設的〈相似字〉改成 v0.2，每個字都寫翻面的對照；出題與評分照[規畫](plans/similar-chars.md)；一課分成幾篇、古典詩做接句（[D-183](decisions.md#d-183-國語一課分成幾篇古典詩做接句)），預設到 v0.7，古典詩只用自編的題目試過（[試用紀錄](card-rules/trials.md) 2026-11-05） | 跑 L8 測跨課比對；字義與詞義重疊怎麼留等使用者決定後進下一版；中文朗讀 v1 不做（[D-205](decisions.md#d-205-中文朗讀-v1-不做留到第二階段)） | 使用者 | [預設草稿](card-rules/elementary-chinese.md)、[討論稿](<../Claude Codex Discussion/2026-11-03-elementary-chinese-map.md>) |
| 更新與相容 | 已定案（[D-149](decisions.md#d-149-更新與相容版本紀錄讀取閘門與正式安裝)～[D-151](decisions.md#d-151-內建製卡規則改版內建跟著外掛改了就是自訂版)）；更新防線完成；外掛內備份的第一部分（備份）隨 `0.2.0` 裝到正式使用的 vault，電腦上的外掛已自己做出第一份備份（2026-10-31，見已完成） | 正式使用的 vault 現在是 `0.5.0`（2026-11-14，見已完成，[清單](../tasks/release-0.5.0.md)），換版時外掛做了備份；還原畫面在 iPhone 看得到還原的結果（[A10](../tasks/release-0.4.0.md)）；外掛的備份位置已換成更新命令用的資料夾（[D-162](decisions.md#d-162-更新命令的安裝前備份保留和外掛的備份放同一個資料夾)）；下一次升版照[上線前清單](../tasks/release-0.4.0.md)的第五項 | 下一版 | [外掛內備份任務說明](../tasks/plugin-backup.md)、[還原任務說明](../tasks/plugin-restore.md)、[規畫](plans/updates.md) |
| 入口與目錄（第一批，[D-163](decisions.md#d-163-入口與目錄的四批開法全部卡的一輪與提醒一區)） | 已合併進 `main`，Codex L2 七輪後通過、Windows 實機通過，iPhone 通過（2026-11-03，[結果](../tasks/iphone-test-2026-11.md)），隨 `0.3.0` 裝到正式使用的 vault（見已完成）；出處定在 [D-164](decisions.md#d-164-出處的寫法與讀法)、[D-169](decisions.md#d-169-家長亂填出處是常態程式不猜看不懂就當場教)、[D-170](decisions.md#d-170-出處的讀法不用猜的直接讀懂要猜的讓家長選) | 第二批開工前先定出處結果的欄位（[任務 §9-1](../tasks/entry-and-catalog.md#9-1-模組)） | 第二批開工 | [任務說明](../tasks/entry-and-catalog.md)、[L2 審查請求](../tasks/entry-and-catalog-review.md) |
| AI 製卡最小版（使用者 2026-11-07：盡早開始用外掛最關鍵的一步） | 已合併進 `main`（2026-11-09，見已完成）：第一次製卡的手動接法：電腦填單元 → 複製提示 → 貼到自己的 AI 對話、附課本 → 貼回 → 檢查 → 存成草稿與快照 → 按「啟用」孩子才看得到；不需要 API 金鑰與 Capture。Windows 實機通過；Codex L2 七輪，第七輪通過。引言框的「加入」、加深與主動提示、訂閱接法、規則自訂版之後各自開任務（環節 8 第 10 條） | iPhone 草稿不出題、啟用後才出題通過（[A2](../tasks/release-0.4.0.md)），隨 `0.4.0` 裝到正式 vault（2026-11-12，見已完成）；Claude 網頁等額度再試 | 額度 | [任務說明](../tasks/ai-cards-mvp.md)、[L2 報告](<../Claude Codex Discussion/2026-11-07-ai-cards-mvp-l2.md>) |
| 三個外掛的 repo 架構 | 已定案（[D-208](decisions.md#d-208-三個外掛在同一個-repo-開發每個外掛有自己的資料夾)，2026-11-17）：三個外掛在同一個 repo 開發、改名 `Essence`，每個外掛在 `plugins/` 有自己的 docs、tasks 與討論稿；決定維持一份 | 第一步已合併進 `main`（2026-11-18，見已完成），合併後的步驟做完（[驗收第 14 項](../tasks/one-repo-step-1.md#結果)）；GitHub 已改名 `Essence`（2026-11-18，Pages 網址跟著換成 `/Essence/`）；本機資料夾演練過，舊對話接不上，使用者決定照樣改名（[D-211](decisions.md#d-211-本機資料夾也改名舊對話收尾後不接續)）：腳本與任務說明好了，改名前的收尾做完（worktree 清掉、演練收掉，檢查印「可以改名」），等停手的時段；Cards 搬家等穩定基線；轉錄稿格式等第一個需要共同規格的 Capture 任務；再審輪的試行（[試行說明](../tasks/auto-codex-rereview-trial.md)）在這件沒用上，換哪一件試待使用者決定 | 使用者（挑改名的時段、選試行的下一件） | [第一步任務說明](../tasks/one-repo-step-1.md)、[本機改名](../tasks/local-folder-rename.md)、[D-208](decisions.md#d-208-三個外掛在同一個-repo-開發每個外掛有自己的資料夾)、[backlog](backlog.md#三個外掛併進同一個-repo) |
| 學習目標架構第三輪 | 暫選 R3 | 兩三個新單元與段考到齊再跑 | 新教材 | [D-132](decisions.md#d-132-學習目標架構暫選-r3第三輪在新教材比三組) |
| 製卡規則下一輪試用 | 等真實影片筆記 | 看目標數量、共同成功判準、洩漏與放錯池 | 新教材 | [試用紀錄](card-rules/trials.md) |
| 英文一字多義 | 規則已改（D-125） | 有多義字的真實教材時試用 | 新教材 | [D-125](decisions.md#d-125-英文規則依製卡流程重排與一字多義的學習目標) |
| 英文的學習地圖與預設 | 方向定案（[D-193](decisions.md#d-193-英文的學習地圖詞是根句型是骨架)）：先做國中；每個字都開中翻英；不規則變化另立；文法第一次就做、打字，詞序用排序；容易混淆的字第一次就比；記憶錨點由 AI 預設加、只寫有連結的；一課分單字、文法兩篇。[英文預設](card-rules/english.md) v0.14 草稿：用翰林八上 L4、L5 試過，使用者定了試用找到的缺口，動詞的中翻英翻卡後列出變化，Sonnet 盲測 L5 一次（[trials.md](card-rules/trials.md)） | 打字與排序已合併進 `main`（2026-11-16，[PR #14](https://github.com/kuohappiness/Essence/pull/14)）；手機上的換行、句首大寫與朗讀等下一次 [iPhone 實機測試](backlog.md#v1-需要做的任務) | iPhone 實機 | [english.md](card-rules/english.md) |
| AI 製卡第 2 批：加深這一節與主動提示 | 已合併進 `main`（2026-11-17，[PR #16](https://github.com/kuohappiness/Essence/pull/16)，[D-194](decisions.md#d-194-加深的主動提示記穩了三分之一就問按一下才做)、[D-209](decisions.md#d-209-加深第-2-批的六項選擇門檻二分之一課外-標法常錯兩次)，見已完成） | iPhone 併入下一次實機測試；延後的技術債見任務說明〈結果〉 | Claude、Codex | [任務說明](../tasks/ai-cards-deepen.md)、[討論稿](<../Claude Codex Discussion/2026-11-05-deepening-prompt.md>) |

第一個里程碑：W1～W6 打通「手寫卡組 → iPhone 複習 → 自評 → 排程」（D-111），2026-10-27 達成（[檢查](<../Claude Codex Discussion/2026-10-27-milestone-1-review.md>)已結案）。第二個里程碑：上線前，第一次升正式版 `0.4.0`，2026-11-12 裝到正式 vault；品質檢查見上表。下一個里程碑還沒定（[quality.md](agents/quality.md#里程碑)）。接下來照 D-111 的順序，從 [backlog 的 v1 任務](backlog.md#v1-需要做的任務)挑下一批。

## 路線圖

只分 **v1 需要做的任務** 與 **第二階段想做的事**（[D-130](decisions.md#d-130-任務分成-v1-與第二階段)）。目前規格照 D-039、D-111 開發；v1 完工後先做真實使用驗證，不算 v1（D-130 補充）；第二階段不再細分「增強版」「v2 之後」等階段，也未排定功能先後。

```mermaid
flowchart LR
  A["v1 要做<br/>最小複習閉環、AI 製卡（教材直接附給 AI）"]:::now --> B["真實使用驗證（不算 v1）<br/>一位學生 × 一次考試"]
  B -.->|依結果與使用者選擇排優先順序| C["第二階段想做<br/>統一清單，細項以連結引用"]
  classDef now fill:#ffd54f,stroke:#f57f17,color:#000
```

| 工作 | 範圍與入口 | 完成或開工條件 |
|---|---|---|
| v1 需要做的任務 | [產品定義 §5](product.md#5-範圍-第-7-步)、[任務入口](backlog.md#v1-需要做的任務)。W4～W6 後接 AI 製卡，照 D-111；Capture 移到第二階段（[D-206](decisions.md#d-206-essence-capture-移到第二階段v1-的教材直接附給-ai)）；目前進度見上方「現在在哪裡」 | 能在 iPhone 完成段考範圍的每日複習；交付完整 HTML 使用說明書（D-048），說明學習目標 ID 與題目指紋；[技術債表](backlog.md#技術債)的「補測：」「補做：」清空（[D-195](decisions.md#d-195-測試分兩類改不回來的做足其餘延後但不漏)）。v1 完工前（功能做完、開始真實使用驗證前）Claude 仍先問使用者：[產品路線](plans/learning-growth.md)要不要納入部分內容；[學習地圖的視覺化](plans/motivation.md#使用者提議把學習地圖做成有質感的視覺化)要不要做（使用者 2026-10-26 要求在 v1 正式結案前提醒） |
| 真實使用驗證 | 一位學生、一次考試，依[成功標準](product.md#2-成功標準-第-1-步)與 D-075 記錄結果；不算 v1，也不算功能階段（[D-130](decisions.md#d-130-任務分成-v1-與第二階段) 補充）。舊決定稱「第 2 階段」 | v1 完工後開始；結果決定第二階段先做什麼 |
| 第二階段想做的事 | [唯一清單](backlog.md#第二階段想做的事)，細項放 [docs/plans/](plans/README.md)，包括動機、題庫、內容深化、體驗、生態及獨立 App | 依驗證結果及使用者選擇排定要做的項目，再完成各自規格與驗收；列入不代表全部已採用或同版交付 |

## 未來準備開發：獨立 App

已列入第二階段清單（D-129），尚未實作；不用 iCloud 的同步先做最小驗證，排在 v1 之後（使用者 2026-10-30）；[開工準備與未決選擇](plans/standalone-app.md)集中在同一主題文件，架構邊界見[架構文件](architecture.md#未來獨立-app規劃中)。

## 已完成

只留最近 10 列，一列一句約 80 字加連結；加新的一列時，把最舊的搬到[已完成（封存）](archive/roadmap-completed.md)的最上面，相對路徑改成以 `docs/archive/` 為基準（[D-099](decisions.md#d-099-文件精簡)、[D-141](decisions.md#d-141-文件架構入口只放狀態同一類資訊只維護一份)）。加列時，[開發進度地圖](progress-map.md)裡對應那一項的符號也一起改。

| 日期 | 工作 |
|---|---|
| 2026-11-18 | 本機資料夾也改名 `Essence`：演練發現 app 的舊對話記著舊路徑、接不上，改成改名前收尾、交接寫進文件，用腳本改名並核對，不過就退回（[D-211](decisions.md#d-211-本機資料夾也改名舊對話收尾後不接續)、[任務說明](../tasks/local-folder-rename.md)） |
| 2026-11-18 | 三個外掛同一個 repo 的第一步合併進 `main`：建 `plugins/capture/`、`plugins/mindboard/`，commit 與 CI 照改到的路徑分派各外掛的檢查（gate 是唯一結論），共用檢查自己一份套件、外掛之間不 import；Codex L2 四輪（[PR #21](https://github.com/kuohappiness/Essence/pull/21)、[任務說明](../tasks/one-repo-step-1.md)） |
| 2026-11-17 | AI 製卡第 3 批合併進 `main`：英文製卡與加深送孩子已有的單字（名稱去掉方向、粗體與最後的全形括號），製卡與加深畫面多一個點選填空的勾選、每科記在這台電腦，送出的提示改成 `提示 v4`、`加深 v2`；Codex L2 兩輪（[任務說明](../tasks/ai-cards-materials.md)、[PR #17](https://github.com/kuohappiness/Essence/pull/17)、[L2](<../Claude Codex Discussion/2026-11-17-ai-cards-materials-l2.md>)） |
| 2026-11-17 | 點選填空的勾選寫在送出提示的任務段，五科都收得到；加深也帶勾選，英文另外送學過的單字；預設國語、英文勾（[D-210](decisions.md#d-210-點選填空的勾選寫在任務段加深也帶英文送學過的單字)） |
| 2026-11-17 | AI 製卡第 2 批合併進 `main`：「加深這一節」命令、提醒一區的加深列與「這次不用」、這台電腦的開關、`課外：` 的標法與佇列；Codex L2 四輪，iPhone 併入下一次實機測試（[任務說明](../tasks/ai-cards-deepen.md)、[PR #16](https://github.com/kuohappiness/Essence/pull/16)） |
| 2026-11-17 | 加深第 2 批的六項選擇（[D-209](decisions.md#d-209-加深第-2-批的六項選擇門檻二分之一課外-標法常錯兩次)）：主動提示改成上一次還沒記穩的有一半記穩就問；課外層的出處寫 `課外：<來源>`、算延伸並加需要版本；常錯是答錯兩次以上；混課內課外的比較卡整組出 |
| 2026-11-17 | 三個外掛改在同一個 repo 開發：Capture、Mindboard 寫第一行程式前先建 `plugins/`，Cards 等穩定基線再搬，repo 改名 `Essence` 另排時段；決定維持一份；Codex 查核兩輪（[D-208](decisions.md#d-208-三個外掛在同一個-repo-開發每個外掛有自己的資料夾)） |
| 2026-11-17 | AI 製卡第 1 批合併進 `main`：電腦的閱讀模式按引言框的「加入」，候選搬進同一篇，加進已有目標的先寫進原本的卡組、讀回確認再從框裡拿掉；`提示 v3` 送已有目標的第一題（§5 的試用延到正式用之前，記在技術債；[任務說明](../tasks/ai-cards-add.md)，PR #15） |
| 2026-11-16 | L2 修正常帶出新問題：修之前寫機率、影響、修法與會動到什麼；正常會碰到或弄壞資料的一定修，極低或走不到的記成限制，其餘代價大的交使用者選；修法先收窄、最後才加機制（[D-207](decisions.md#d-207-l2-的發現先分一定修可記限制交使用者選修法先收窄最後才加機制)） |
| 2026-11-16 | 英文的打字與排序合併進 `main`：文法與變化的問答題打字作答，答錯先給中文提示與文法標籤，變化目標等同一個字的英翻中記住了才出；名稱結尾「排序」的填空題用點選填空排詞塊，句首那格顯示大寫；Codex L2 三輪，第三輪三項記成已知的限制（[PR #14](https://github.com/kuohappiness/Essence/pull/14)、[任務說明](../tasks/english-typed-order.md)） |