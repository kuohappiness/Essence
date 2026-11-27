// 測試自己組的暫存 repo，照真的 repo 的版面放 Cards 與 AI 製卡的規則檔（D-208 第二步 §A5、§A6）：
// 搬家前 Cards 在根目錄，搬家後在 plugins/cards/；規則檔照舊在 repo 的根（tools/build.mjs 的 RULES_FROM_ROOT）。
import { execFileSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { cp } from 'node:fs/promises';
import { relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { RULES_FROM_ROOT } from '../../tools/build.mjs';
import { gitEnv } from '../../tools/git.ts';

/**
 * 這個 repo 裡 Cards 的根，磁碟上的真實大小寫（D-218 §3 第 6 點）：Windows 上 npm --prefix 打錯大小寫時 import.meta.url
 * 照打的字，拿它去比 git 回的 apps/Cards 會假失敗；path.relative 在 Windows 不分大小寫、尾段取自第二個參數。
 */
export const CARDS_ROOT = realpathSync.native(fileURLToPath(new URL('../../', import.meta.url)));
const cards = CARDS_ROOT;
const top = execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd: cards, env: gitEnv(), encoding: 'utf8' }).trim();

/** Cards 在 repo 裡的資料夾（repo 相對，用 /）：搬家前是 '.'。 */
const CARDS_DIR = relative(resolve(top), resolve(cards)).replaceAll('\\', '/') || '.';

/** 暫存 repo 裡 Cards 的根；規則檔放在 repo（第一個參數）底下照表的路徑，建置從 Cards 的根往上 RULES_FROM_ROOT 找得到。 */
export function cardsIn(repo: string): string {
  const at = resolve(repo, CARDS_DIR);
  if (resolve(at, RULES_FROM_ROOT) !== resolve(repo)) throw Error(`版面不一致：Cards 在 ${CARDS_DIR}，規則檔的基準是 Cards 往上 ${RULES_FROM_ROOT}`);
  return at;
}

/**
 * Cards 打包進 main.js 的套件（AI 連線套件，docs/tasks/ai-client.md〈8〉第三步；表在 tools/dispatch.ts 的 PACKAGE_USERS，
 * Cards 不 import 最上層的程式，這裡照抄）：轉接檔用相對路徑指到 repo 裡的套件，暫存 repo 也要照版面放一份程式與目錄。
 */
const BUNDLED_PACKAGES = ['packages/ai-client'];

/** 把 Cards 打包進去的套件複製到暫存 repo（第一個參數是 repo 的根，不是 Cards 的根）。 */
export async function copyPackages(repo: string): Promise<void> {
  for (const dir of BUNDLED_PACKAGES) {
    for (const name of ['src', 'catalog.json']) await cp(resolve(top, dir, name), resolve(repo, dir, name), { recursive: true });
  }
}

/** Cards 裡的路徑寫成 repo 相對（對照表的 sources、locate 的回傳；第二步 L2 R5）。 */
export const repoPath = (path: string): string => (CARDS_DIR === '.' ? '' : CARDS_DIR + '/') + path;

/** .gitignore 裡指到 Cards 建置產物的寫法（從 repo 的根算）。 */
export const cardsIgnore = (name: string): string => '/' + (CARDS_DIR === '.' ? '' : CARDS_DIR + '/') + name;
