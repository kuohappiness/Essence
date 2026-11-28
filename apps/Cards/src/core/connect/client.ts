// AI 連線套件的轉接檔（docs/tasks/ai-client.md〈8〉第三步，D-232 第 5 點）：Cards 只有這個檔 import 套件，
// 其他檔從 core/connect/index.ts 拿。core/connect 自成一個核心模組、不從 core/ai 轉出：state 與複習用到 core/ai，發布前比較的轉接器也載入 state，套件不跟著載入；
// 要連 AI 的地方（設定頁、直接製作）由 main.ts 與 src/obsidian/ 拿這個模組，再把動作交給畫面。
// 用相對路徑 import 套件的入口檔，不用 npm 的 file: 相依：npm 會在 node_modules 建連結，pre-commit 的暫存副本借工作樹的
// node_modules，檢查就會讀到工作樹的套件、不是要 commit 的內容。套件被打包進 main.js，不另外載入。
// tools/check-app-imports.ts 照 tools/dispatch.ts 的 PACKAGE_USERS 只放行這一個檔；改到套件時 Cards 也跑完整檢查。
export { createAiClient, describeAiError, isAiError } from '../../../../../packages/ai-client/src/index.ts';
export type { AiClient, AiErrorKind, FetchLike, GenerateRequest, GenerateResult, InputKind, ProgressEvent, ProviderSpec } from '../../../../../packages/ai-client/src/index.ts';
