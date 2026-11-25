# 比較測試工具照 D-236 改：規劃查核（給 Codex）

狀態：待審｜下一步：第二輪查核改過的規劃｜等誰：使用者

遵守 repo 根目錄的 `AGENTS.md`。建議推理等級：**高**。

由 Claude（Opus 5.5）規劃，開工前請你查核規劃（D-131、D-140）。**只查核、只回報**，不改任何檔、不 commit。報告寫在 `apps/Cards/docs/Claude Codex Discussion/2026-11-25-rule-test-d236-review.md`。

## 查核對象

- 規劃：分支 `claude/project-thread-lhii7b` 的 `apps/Cards/docs/tasks/rule-test-d236.md`（這份請求的同一個 commit）。
- 決定：D-236 還沒合併，在分支 `claude/project-thread-g21wd8` 的 `docs/decisions.md`（`git show origin/claude/project-thread-g21wd8:docs/decisions.md`，找「## D-236」）；同一個分支的 `apps/Cards/docs/Claude Codex Discussion/2026-11-25-three-layer-review.md` §8 與 `2026-11-25-english-candidate-diff.md` §4。
- 被改的工具：`apps/Cards/tools/rule-test/`（尤其 `gates.ts`、`unblind.ts`、`report.ts`、`config.ts`、`judge.ts`、`merge.ts`、`deck-cut.ts`、`blind.ts`、`templates/評分說明.md`），規格 `apps/Cards/docs/tasks/rule-test-tool.md`（§4-2、§5-6～§5-9、§6）。
- 加深用到的外掛函式：`apps/Cards/src/core/ai/deepen-prompt.ts`、`deepen-write.ts`、`draft.ts`（`planDraft`）。

## 請你看的

1. **和 D-236 逐點對照**，第 1～7 點各寫：規劃有沒有做到、有沒有做超過或改了原意。尤其是：
   - 傷到學習的判法：用三態，不用平均多就沒過；
   - 「現行沒有地圖」時地圖指標跳過；
   - 「打平，候選較省」的處理；
   - 把「其他品質」拆成兩種。
2. **站在「不做」那一方反駁**（D-153、D-177）：每一項新指標、新指令（地圖評分、`deepen`、加深評分、對照），能不能用更便宜的做法拿到同樣的判讀？理由只能是優勢不明顯，或代價解決不了。
3. **算法的漏洞**：每個公式找會讓候選「不做事反而比較好看」或「被雜訊判過」的例子。現有的例子是一項都不出的加深、只考少數必備而題數少。
   - 每個必備平均幾題：「部分 × 0.5」、分母是 0 的處理；
   - 近義重複的分組；
   - 加深接對率、0.5 的合併；
   - 沒有資料時跳過，會不會讓候選繞過門檻。
4. **加深的重現**：
   - 用 `planDraft` 加假 ID、一律當記穩了、同一份原稿的其他篇當同單元，送出的提示和外掛實際加深時差在哪裡；
   - 有沒有外掛的前提這樣做不成立（例如需要快照、需要 vault 裡的檔）；
   - 一篇一個對話的成本合不合理。
5. **工具內部的一致性**：
   - 新指令放進現在的事件、批、鎖、區組、裁定流程，有沒有衝突，例如 `blind` 要等 `deepen`、`extend` 補跑時加深怎麼辦、裁定加深的重大錯誤；
   - 驗收條件夠不夠用程式判斷；
   - 實作順序有沒有相依弄反。
6. 規劃以外看到的問題另列。

每一項發現寫：在規劃的哪一節、問題、會造成什麼、建議的改法；分成「開工前一定要改」「可以實作時順手改」「只是意見」。

## 第二輪（2026-11-25）

第一輪的報告在 `apps/Cards/docs/Claude Codex Discussion/2026-11-25-rule-test-d236-review.md`。規劃照 R1～R9 與兩個既有問題改了，對應表在規劃的〈查核的回應〉。這一輪請：

1. 逐項確認〈查核的回應〉的每一列真的改對了，沒有改出新的漏洞（尤其 §2-1 缺資料、§7-1 校正與置換判定、§7-3 總結果的順序、§6-1 模擬加深的七條、§6-3 加深機會與上下界）。
2. 第一輪的 1～6 再看一次，只報新的或沒改好的；已經改好的不用重寫。
3. 報告接在同一個檔的最後，標題〈第二輪〉。
