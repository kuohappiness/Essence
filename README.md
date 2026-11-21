# Essence

> **最高目的（北極星）**：透過程式讓知識從「獲取」到「深化」形成完美閉環，提高知識增長的效率，並幫助學生在學業表現上進步。
>
> 所有功能與設計決策都以此檢驗：無法說明如何縮短學生的複習時間、加深記憶或提升學業表現的提案，不進入目前範圍。

Essence 是三個 Obsidian 外掛，在同一個 repo 開發、各自安裝、各自可用（[D-208](docs/decisions.md#d-208-三個外掛在同一個-repo-開發每個外掛有自己的資料夾)）。**目前階段**：看[開發現況（入口）](docs/roadmap.md)的「現在在哪裡」。

| 外掛 | 是什麼 | 進度 | 協作規則 |
|---|---|---|---|
| [Essence Cards](apps/Cards/README.md) | 把筆記變成閃卡，讓學生用間隔重複在手機上快速複習；v1 開發中 | [roadmap](apps/Cards/docs/roadmap.md) | [AGENTS.md](apps/Cards/AGENTS.md) |
| Essence Capture | 可靠的知識入口：想保存任何資料進知識庫就用它；PDF 與圖片的忠實轉錄移到第二階段（[D-206](docs/decisions.md#d-206-essence-capture-移到第二階段v1-的教材直接附給-ai)）；原本的 [repo](https://github.com/kuohappiness/Essence-Capture) 之後當公開 repo | [backlog](apps/Capture/docs/backlog.md) | [AGENTS.md](apps/Capture/AGENTS.md) |
| Essence Mindboard | 把知識架構視覺化；還沒開始，Cards 保留和它對接的彈性（[D-056](docs/decisions.md#d-056-保留和心智圖外掛對接的彈性)） | [backlog](apps/Mindboard/docs/backlog.md) | [AGENTS.md](apps/Mindboard/AGENTS.md) |

## 共用的文件

| 想知道 | 看這裡 |
|---|---|
| 為什麼做、為誰做 | [產品定義](docs/product.md) |
| 三個外掛怎麼分工、怎麼接、repo 怎麼放 | [架構](docs/architecture.md) |
| 轉錄稿怎麼寫（Capture 寫、Cards 讀） | [轉錄稿格式](docs/transcript.md) |
| 已經決定了什麼、為什麼 | [決策紀錄](docs/decisions.md) |
| 跨外掛的技術債與已知的限制 | [跨外掛的 backlog](docs/backlog.md) |
| 某個主題的細項規畫、規畫放哪裡 | [主題計畫與存放規則](docs/plans/README.md) |
| 現在推薦用哪個 AI 服務 | [AI 模型推薦](docs/ai-models.md) |
| 過去的討論與舊規劃 | [封存區](docs/archive/README.md) |
| AI 協作者的工作規則 | [AGENTS.md](AGENTS.md) |

## 授權

程式碼與文件的授權條款尚未選定。
