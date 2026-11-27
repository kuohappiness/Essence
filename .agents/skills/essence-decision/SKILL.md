---
name: essence-decision
description: 把使用者明確同意的事寫成 Essence Cards 的 D-ID 決定，並同步索引與受影響的文件。Use when a discussion has been settled, the user says 確定/同意/就這樣, or an existing D-ID needs to be superseded or amended.
---

# 寫入決定

只寫使用者**明確同意**的內容，不確定時先問一句。寫法的細節（狀態行的段、主題、索引怎麼產生）在 `docs/agents/workflow.md`〈決定〉，這裡只列步驟，不抄第二份。

## 步驟

1. **要不要寫成 D-ID**（D-215 第 5 點）：改不回來的（資料格式、學習目標 ID、複習紀錄、排程、相容）、跨外掛或整個專案的規則、產品範圍，才寫成 D-ID。其他小事，在那件事現在的位置（任務說明、plans、討論稿或 backlog 的那一項）寫「使用者 YYYY-MM-DD 同意」加一句內容，不寫 D-ID。拿不準就寫 D-ID。
2. **查重**：已知 D-ID 用 `node tools/decisions-index.ts D-xxx`（預設只印一層，`--deep` 全印）；不知道時讀索引裡相關的主題。D-ID 不重用：新編號用 `node tools/in-flight.ts` 最後一行的「下一個可以用」（`origin/main` 與開著的 PR 都算過）；同時有別的 session 在寫決定、還沒開 PR 時，先用 SendMessage 預約。分支上寫的決定，合併前再跑一次確認沒有撞號（D-172 曾被 main 先用掉，分支的改成 D-174）。
3. **寫條目**：在正文最後加：

   ```markdown
   ## D-xxx 名稱

   ✅ YYYY-MM-DD｜來自 <上一站的連結>｜修改 <D-yyy 的連結>（第 n 點）、補充 <D-zzz 的連結>｜取代 <D-www 的連結>

   主題：<索引既有的主題之一>｜一句話：<一句>

   適用：Cards／Capture／Mindboard／全部（可以多個）

   **決定**：

   - ……

   **理由**：

   - ……

   **曾考慮的做法**：

   - 不做：不做會怎樣、為什麼不夠（D-153）。
   - ……
   ```

   - 「來自」連到它是從哪一站來的（plans、討論稿、backlog 的那一項、任務說明，連結以 `docs/` 為基準）；沒有上一站寫「使用者提出」。沒有修改、補充或取代就不寫那一段。
   - 「曾考慮的做法」必寫，第一項是「不做」；有代價時一併寫，並寫出怎麼解決（D-177）。
4. **不改舊決定的狀態行**：被修改、補充或取代的舊決定不用動；「後續見」「已取代」由工具從新決定的狀態行反推。
5. **重產索引**：`node tools/decisions-index.ts`（決策紀錄和工具產生的不一樣，commit 擋）。
6. **上一站加「→」**：在「來自」連到的那一站加一行「→ <D-xxx 的連結>（YYYY-MM-DD）」，「→」後面直接接連結。backlog 的那一項先搬到〈已轉出〉再加；plans 或討論稿整份都談定的，狀態行改成「已結案 → <D-xxx 的連結>」（照〈入口的狀態行〉）。
7. **同步規範文件**：依 `docs/agents/workflow.md` 與 `docs/architecture.md`〈repo 結構〉，把規則寫進受影響的規範文件（`product.md`、`architecture.md`、`syntax.md`、`transcript.md`、`docs/agents/`；最上層與外掛各有一份的，改內容所在的那份）。寫完用查詢工具看「現行寫在」有沒有列出來。要改 `AGENTS.md` 時，先照它最後一節的五關檢查。
8. **不寫 roadmap**：決定不列進〈已完成〉，白板的「最近定案」從決策紀錄產生。要開工的工作，開工時才在狀態板手寫一列（工作、入口）。
9. **Commit**：commit 訊息照 repo 慣例，例如 `docs: <做了什麼> (D-xxx)`。
