# 三個外掛同一個 repo 第二步：開工前查核（給 Codex）

狀態：第四輪查核中（每一輪的報告與 Claude 的回應寫在 [`Claude Codex Discussion/2026-11-19-one-repo-step-2-plan-review.md`](<../Claude Codex Discussion/2026-11-19-one-repo-step-2-plan-review.md>)）

遵守 repo 根目錄的 `AGENTS.md`。由 Claude 用 `npm run codex -- format` 送出，每一輪都是新的 session。

[任務說明](one-repo-step-2.md)把 [D-208](../docs/decisions.md#d-208-三個外掛在同一個-repo-開發每個外掛有自己的資料夾) 第 8 點（Cards 搬進 `plugins/cards/`）寫成可以施工的規格，分 A 程式、B 文件兩個 PR。D-208 已定案，這次**不重議要不要搬**；只查任務說明在 D-208 沒寫死的地方選得對不對、有沒有漏、驗收做不做得到。程式還沒動，開工要等 `0.6.0` 裝好、iPhone 驗完。

## 基準

`main` 上加入這份請求的 commit（`git log -1 --format=%h -- tasks/one-repo-step-2-plan-review.md`），hash 寫進報告。

**只讀**（Codex 週額度到 11/23 前剩約三成，請不要整份讀其他文件）：

- 任務說明全文。
- D-208 只讀第 5、6、8、9、10 點：`node experiments/tools/decisions-index.mjs D-208`。
- 程式只讀這些：`tools/dispatch.ts`（全檔）、`tools/hooks.ts`（`folder`、`stagedCopy`、`runPlugin`、`preCommit`）、`.github/workflows/check.yml`、`.claude/hooks/cloud-setup.mjs`、`tools/compare-versions.ts` 的 `side`（約第 45～70 行）、`tools/build.mjs` 的 `embedRules` 與 `buildPlugin`、`tools/install.ts` 的 `localFolder` 與 `installVault`、根目錄的 `package.json`、`knip.jsonc`、`tsconfig.json`。
- 要核對某個說法時，用 `git grep` 或 `git log` 查到那一行就好；第一步的任務說明（`tasks/one-repo-step-1.md`）只在需要時讀〈平台事實〉或 §2、§3。

不用跑測試（唯讀沙箱）。需要寫檔才能重現的標「待驗證」。

## 查什麼

1. **站在「不做」那一方**（D-153、D-177）：任務說明〈和「不做」比較〉列的代價與好處，有沒有誇大或漏算；反駁的理由只能是「優勢不明顯」或「代價解決不了」。也看 A、B 分兩個 PR 是否比一個好。
2. **分派表**（§A3，**這次最重要**）：十條規則的順序、新增的「共用工具」對象（完整與相關測試）、第 6 條與第 7 條分開（改共用工具不再跑 Cards 的完整檢查）會不會讓哪種壞掉的改動漏檢；Cards 相關測試的找法（去掉 `plugins/cards/` 前綴與原路徑兩種都比）會不會漏找；例子表有沒有算錯、漏了哪些組合。
3. **commit 順序與搬家的 commit**（§A1～§A6）：每個 commit 之後 hook、CI、Pages 都要能跑；搬家的 commit 要同時改哪些才過得了 hook（任務說明的清單有沒有漏）；`git mv` 加上少量修改後 `git log --follow` 是否仍接得到。
4. **跨版本與演練**（§A5、§A7）：判定外掛根的函式（兩個都有、都沒有就停）夠不夠；還有哪些 Cards 工具或測試假設 Cards 在 repo 根（任務說明列了 `compare-versions`、`update-vault`、讀舊版的測試）；演練的六項能不能證明 D-208 第 8 點要的「舊版重裝、舊 ZIP 還原、搬後的 Windows 更新與 iPhone 載入」，隔離的 clone 是否真的不會寫到主資料夾的 `.local/`。
5. **共用工具自己的檢查**（§A2）：測試搬到 `tools/tests/`、`quality.test.ts` 拆兩半、`tools/` 自己的型別／ESLint／knip，和現在比有沒有少檢查到什麼；`tools` 的 `check` 不加測試的理由成不成立。
6. **驗收**：每一項是不是程式判斷得了；哪一項做不到或證明不了它要證明的事。
7. **B 與第 1 題**：§B1、§B2 的歸屬規則與 D-208 第 8、9 點、D-143 有沒有衝突；〈待使用者決定〉第 1 題（轉錄稿格式在 B 搬到最上層）你同不同意 Claude 的建議，附理由。

## 回報

只回報，不改檔案。逐題寫同意或反對；反對附證據（檔案:行、文件或指令），分「已重現」與「看規格推斷」；查不到的直接說。每一項寫建議的改法，並標嚴重度（擋開工／應該改／可以不改）。Claude 核對後改任務說明，下一輪只看還沒結的項目。
