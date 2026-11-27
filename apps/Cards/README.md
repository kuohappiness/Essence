# Essence Cards

Essence Cards 是一個 Obsidian 外掛：把筆記變成閃卡，讓學生用間隔重複，在手機上隨時、低摩擦地快速複習。AI 是選用的加速器，沒有 AI 也能完整使用。北極星與其他兩個外掛見最上層的 [README](../../README.md)。

**目前階段**：看[開發現況與路線圖](docs/roadmap.md)的「現在在哪裡」（進度只寫在那裡）。

## 文件

| 想知道 | 看這裡 |
|---|---|
| 為什麼做、為誰做、做到哪裡 | [產品定義](docs/product.md)（北極星與全專案的原則在[最上層](../../docs/product.md)） |
| 技術上怎麼組成 | [架構](docs/architecture.md)（三個外掛的定位、接點與 repo 結構在[最上層](../../docs/architecture.md)） |
| 卡片、錯題本怎麼寫 | [出題語法與資料格式](docs/syntax.md) |
| 轉錄稿怎麼寫 | [轉錄稿格式](../../docs/transcript.md)（和 Capture 共用） |
| 有哪些題型、各自適合練什麼 | [題型專區](docs/question-types.md) |
| 已經決定了什麼、為什麼 | [決策紀錄](../../docs/decisions.md)（三個外掛共用一份） |
| 現在進行到哪裡、下一步 | [開發現況與路線圖](docs/roadmap.md) |
| v1 要做什麼、第二階段想做什麼 | [統一任務與候選清單](docs/backlog.md) |
| 某個功能的細項規畫、未來文件放哪裡 | [主題計畫與存放規則](../../docs/plans/README.md) |
| AI 怎麼製卡、怎麼試用 | [製卡規則](docs/card-rules/README.md) |
| 給使用者看的說明書 | [使用說明書的正本](docs/manual/README.md)（才開始寫；規畫在 [plans/manual.md](docs/plans/manual.md)） |
| 現在推薦用哪個 AI 服務 | [AI 模型推薦](../../docs/ai-models.md) |
| 參考過哪些軟體 | [參考軟體研究](docs/research/software.md)、[舊外掛分析](docs/research/old-flashcard-plugin.md) |
| 過去的討論與舊規劃 | [封存區](../../docs/archive/README.md) |
| AI 協作者的工作規則 | [Cards 的 AGENTS.md](AGENTS.md)（全專案的在[最上層](../../AGENTS.md)） |
| 寫程式、檢查、建置與安裝的做法 | [Cards 的程式品質設定](docs/quality.md)（全專案的在[最上層](../../docs/agents/quality.md)） |

程式放在這個資料夾的 `src/`、`tests/`、`tools/`（[D-110](../../docs/decisions.md#d-110-v1-外掛的程式結構)）；三個外掛在同一個 repo 開發，每個外掛有自己的資料夾（[D-208](../../docs/decisions.md#d-208-三個外掛在同一個-repo-開發每個外掛有自己的資料夾)）。

## 授權

程式碼與文件的授權條款尚未選定。
