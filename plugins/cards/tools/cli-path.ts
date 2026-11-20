import { resolve } from 'node:path';

/**
 * 命令列給的檔案路徑（vault、備份檔、計畫檔、--to）。經 `npm run <script>` 執行這支工具時，npm 先把工作資料夾換到套件的資料夾
 * （plugins/cards/），相對路徑改照叫 npm 的那個資料夾（INIT_CWD）算：從 repo 根用 `npm --prefix plugins/cards run …`，
 * 和搬家前在根目錄 `npm run …` 解到同一個地方（D-208 第二步 L2 R2）。
 * npm 每次都設 INIT_CWD，子程序也會繼承（例如 `npm test` 底下的測試再叫工具），所以只有 npm_lifecycle_event 是這支工具的 script 時才用它；
 * 其他情況（直接 `node tools/…`、別的 script 的子程序）照目前的資料夾算。
 * 空字串丟錯：resolve('') 是目前的資料夾，會對沒指定的資料夾安裝或備份（L2 第二輪；腳本把空變數加引號傳進來時會碰到）。要目前的資料夾就明寫 `.`。
 */
export function cliPath(path: string, script: string, env: NodeJS.ProcessEnv = process.env, cwd = process.cwd()): string {
  if (path === '') throw Error('命令列給的路徑是空的；要用目前的資料夾請寫 .');
  return resolve(env.npm_lifecycle_event === script && env.INIT_CWD ? env.INIT_CWD : cwd, path);
}
