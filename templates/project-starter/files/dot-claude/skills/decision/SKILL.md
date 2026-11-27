---
name: decision
description: 把使用者明確同意的事寫成 D-ID 決定，並同步索引與受影響的文件。Use when a discussion has been settled, the user says 確定/同意/就這樣, or an existing D-ID needs to be superseded or amended.
---

# 寫入決定

只寫使用者**明確同意**的內容，不確定時先問一句。檔案的格式在 `docs/decisions/README.md`〈一條決定的寫法〉，這裡只列步驟，不抄第二份。

## 步驟

1. **要不要寫成決定**：照 `docs/workflow.md`〈什麼才寫成決定〉。不寫成決定的小事，在那件事現在的位置寫「使用者 YYYY-MM-DD 同意」加一句內容。拿不準就寫成決定。
2. **查重**：讀 `docs/decisions/README.md` 的索引，打開相關的幾條；要修改或取代舊決定時，記下是哪一條、哪一點。
3. **取編號**：跑 `node tools/in-flight.mjs`，用最後一行的「下一個可以用的編號」（`main` 與開著的 PR 都算過）。它沒給編號時，照它的說明補齊再跑。編號不重用。
4. **寫檔**：新增 `docs/decisions/D-xxx.md`，照〈一條決定的寫法〉。「來自」連到它是從哪一站來的；「曾考慮的做法」必寫，第一項是「不做」，有代價時寫出怎麼解決。
5. **索引加一行**：在 `docs/decisions/README.md` 的索引表最下面加一行（編號、一句話、日期、狀態）。修改或取代了舊決定，同時改那一條在索引的狀態欄；舊檔不改。
6. **上一站加「→」**：在「來自」連到的那一站加一行「→ <D-xxx 的連結>（YYYY-MM-DD）」，「→」後面直接接連結。backlog 的那一項先搬到〈已轉出〉再加。
7. **同步規範文件**：把規則寫進受影響的規範文件（`AGENTS.md`、`docs/workflow.md`、`docs/agents/quality.md` 等），並連回這條決定。要改 `AGENTS.md` 時，先照它最後一節的五關檢查。
8. **合併前再查一次編號**：分支上寫的決定，開 PR 與合併前再跑一次 `node tools/in-flight.mjs`；編號被別的 PR 先用掉時，改號並把連結一起改。
9. **Commit**：commit 訊息照 repo 慣例，結尾寫 `(D-xxx)`。
