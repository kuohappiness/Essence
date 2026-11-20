# 三個外掛同一個 repo 第二步 B：L2 獨立審查（給 Codex）

狀態：第一輪報告與回應見討論稿；第二輪待審

遵守 repo 根目錄的 `AGENTS.md`。建議推理等級：**高**。請**新開一個 session**。

[任務說明](one-repo-step-2.md)的 B（文件）由 Claude（Opus 5.5）實作：Cards 的文件、製卡規則、研究、任務與討論稿搬進 `plugins/cards/docs/`，共用的任務與討論稿搬進 `docs/`（D-213）；`docs/syntax.md` 的轉錄稿格式拆成 `docs/transcript.md`，`product.md`、`architecture.md`、`roadmap.md`、`backlog.md` 逐段拆；讀文件的工具（文件檢查、進度白板、分派表）與 Cards 的測試跟著改。A 的 L2 在 [one-repo-step-2-review.md](one-repo-step-2-review.md)，這份只看 B。

## 審查對象

- 分支 `claude/serene-payne-bfeb06`（已 push），從 `main` 的 `98e7940`（`<B 的基準>`）開出，`main` 之後沒有前進。commit（由舊到新）：
  - `19a5520` §B0 第 4 項：改連結的腳本只改解析器確認的位置（A 的 L2 R4）
  - `894fa07` §B0 文件清單（[one-repo-step-2-inventory.md](one-repo-step-2-inventory.md)）；D-208 第 8 點連到任務說明
  - `495acf7` §B1～§B4 搬檔、拆檔、工具與測試（`<B 搬檔>`）
  - 這份請求所在的 commit：驗收補的測試（擋舊位置的四種、新位置照查狀態行）、進度畫板的說明字縮短（375px）、〈結果〉的〈B 的進度〉
- 審查對象的最後一個 commit 是這份請求所在的 commit（`git log -1 --format=%H -- docs/tasks/one-repo-step-2b-review.md`）；之後分支上有新的 commit，就是修正或再審，不在這一輪。
- 看整個 B：`git diff -M 98e7940 <這份請求的 commit>`；`<B 搬檔>` 有 244 個改名，看內容差異先用 `git diff -M30% 495acf7^ 495acf7 --stat` 找 M、A 的檔（`--stat` 的改名後面的百分比低的，是連結改得多的）。

## 規格與優先順序

- 主要規格：任務說明的〈B｜文件〉（§B0～§B4）、〈驗收〉B1～B9、〈待使用者決定〉第 1 題（轉錄稿 B 就搬，D-208 第 6 點的時機調整）。
- 依據：D-208 第 6、8、9 點、D-213。查法：`node experiments/tools/decisions-index.mjs D-xxx`。
- 規格互相衝突或有漏洞時列成問題，不挑容易通過的那份。

## 行為與風險

公開介面與呼叫端：

- `tools/check-docs.ts`：狀態目錄、任務對 backlog、`BEFORE_D195`、擋舊位置（`OLD_PLACE`）、`FROZEN_RULES`（製卡規則送給 AI 的部分照搬家前的位置解連結）、例外清單的新路徑；待補測的列數加上 Cards 的 backlog。呼叫端：hook 的共用檢查、CI、`tools/progress-board.ts`。
- `tools/roadmap-board.ts`：「已完成」與正式 vault 的版本改從 `plugins/cards/docs/roadmap.md` 讀；最上層只剩〈現在在哪裡〉。
- `tools/progress-board-data.ts`、`.github/workflows/progress-board.yml`：Cards 的 backlog。
- `tools/dispatch.ts`：登錄的共用規格改成 `docs/transcript.md`；第 9 條拿掉 `tasks/`、`Claude Codex Discussion/`。
- `plugins/cards/src/core/ai/rules.ts`：規則檔路徑字串（B 唯一改到 `src/` 的地方）。
- `experiments/tools/move-links.mjs`：拆檔（`pieces`、`split`）、`stay`、`frozen`。

不可破壞的性質：

1. 外面連到舊錨點的照樣打得開：三份拆開的文件每個 `##` 留在原檔、一行轉往新頁。
2. 製卡規則送給 AI 的內容逐位元組不變：`embedRules()` 與 B 之前 `deepEqual`（嵌入的雜湊不變，D-151）。
3. 已完成的任務、討論稿與規畫只改了連結。
4. 每個 commit 之後 hook、CI 與 Pages 都能跑；擋舊位置在搬檔的同一個 commit 生效。
5. 分派：改 Cards 的文件只跑寫到它的 Cards 測試（含經 helper 的）；改 `docs/transcript.md` 跑 Capture 的完整檢查與 Cards 讀它的測試。

請找新的組合，例如：搬家前開的分支在搬家後新增 `tasks/x.md`（rebase 或合併時）；Capture、Mindboard 的 `docs/tasks/` 與 backlog；連結的錨點在拆開的另一份；`FROZEN_RULES` 放行的範圍是否太寬；進度白板在 Pages 上讀不到 Cards 的 roadmap 時；`move-links` 合併前重跑（rebase 之後）會不會改到手修的連結。

明確延後的範圍：Capture 寫、Cards 讀的共用範例與已部署讀端的相容檢查（D-208 第 6 點）；製卡規則送給 AI 那段的連結（記在 Cards backlog 的技術債，下次改那份規則的版本時一起改）。

## 驗證方式

- 環境：Windows 11、Git 2.52.0、Node 24.13.0；CI 是 GitHub Actions 的 Ubuntu、Node 24。
- 指令：`npm --prefix plugins/cards run check`；`npm --prefix tools run check`；`npm --prefix tools run self-check`；`node tools/check-docs.ts`。
- 實作者跑過的驗收：任務說明〈結果〉的〈B 的進度〉。

## 實作者自己選的做法

規格沒寫、由 Claude 決定的地方，寫在任務說明〈結果〉的〈B 的進度〉末段「實作者自己選的做法」1～6，請先看。另外：

- 進度畫板的說明字改成「v1 結案前待補測 N 列（最上層與 Cards）」：畫布頁頂端那一列在 375px 原本就超出 23px，加長的字會更超出；縮短後整列放得下（驗收第 B6 項）。
- `roadmap-board` 讀不到 `plugins/cards/docs/roadmap.md` 時直接失敗，不退回只讀最上層：白板少了已完成與 vault 版本，不如讓 Pages 的 run 紅燈。

## 合併後才做的（不用審）

- roadmap 的已完成一列；技術債「外掛只改文件也跑完整檢查」刪掉 Cards 的部分；本機記憶的路徑；Pages 的 run。

## 回報與權限

- 只審查與回報，不改檔；可以在隔離的暫存 repo 或 clone 重現。不要 push、不要開 PR、不要動 `main` 的設定；需要在 GitHub 上實際跑的，寫成探針步驟交給 Claude。不要碰 iCloud 裡的任何 vault。
- 每項發現寫：哪一軸（規格／規範與設計）、觸發條件、預期／實際、影響、位置、證據（已重現／靜態推斷／待驗證）、**真實路徑會不會發生**與發生機率、建議處理。可以回報「規格本身有漏洞」。
- 報告寫在 `docs/Claude Codex Discussion/2026-11-20-one-repo-step-2b-review.md`，標題下第一行寫狀態；頭尾寫待審 commit、審查範圍、測試結果與沒驗的項目及原因。

## 第二輪

第一輪的報告與 Claude 的回應在[討論稿](<../Claude Codex Discussion/2026-11-20-one-repo-step-2b-review.md>)。請**新開一個 session**，只讀討論稿的〈先讀這裡〉、〈第一輪｜Claude 回應〉和這一節。

### 審查對象

- 這一節所在的 commit（`git log -1 --format=%H -- docs/tasks/one-repo-step-2b-review.md`），差異只看 `git diff 7c4828c <那個 commit>`。

### 受影響的路徑

- `experiments/tools/move-links.mjs` 與測試：`settled`（R1）、同一段分不出的候選（R2）。
- `tools/check-docs.ts` 與測試：`FROZEN_RULES` 逐檔列路徑、沒用到的要刪、比對前解碼（R3）。
- 文件：清單的補記（R4）、Cards 的架構與產品定義、國小社會試用任務的連結（R5）、兩份產品定義的原則（R6）、Capture 的 backlog（R7）、〈結果〉。

### 驗證方式

- 每一項的修法是不是解了原本的問題、有沒有引入新的；R1 用另存的重跑計畫（[任務說明〈結果〉](one-repo-step-2.md#結果)的〈B 的進度〉「實作者自己選的做法」第 2 點）或照清單重建的計畫加 `settled: true`，在待審樹跑 `node experiments/tools/move-links.mjs --check --plan <計畫>`。
- `node --test experiments/tools/move-links.test.mjs`；在 `tools/`：`node --test tests/check-docs.test.ts`；`node tools/check-docs.ts`。

### 回報（第二輪）

照〈回報與權限〉，報告接在討論稿後面的〈第二輪｜Codex 報告〉（Claude 會貼進去；你寫在 `.local/codex/` 的回報即可）。
