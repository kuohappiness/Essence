// 測試自己組的暫存 repo，照真的 repo 的版面放 Cards 與 AI 製卡的規則檔（D-208 第二步 §A5、§A6）：
// 搬家前 Cards 在根目錄，搬家後在 plugins/cards/；規則檔照舊在 repo 的根（tools/build.mjs 的 RULES_FROM_ROOT）。
import { execFileSync } from 'node:child_process';
import { relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { RULES_FROM_ROOT } from '../../tools/build.mjs';
import { gitEnv } from '../../tools/git.ts';

const cards = fileURLToPath(new URL('../../', import.meta.url));
const top = execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd: cards, env: gitEnv(), encoding: 'utf8' }).trim();

/** Cards 在 repo 裡的資料夾（repo 相對，用 /）：搬家前是 '.'。 */
const CARDS_DIR = relative(resolve(top), resolve(cards)).replaceAll('\\', '/') || '.';

/** 暫存 repo 裡 Cards 的根；規則檔放在 repo（第一個參數）底下照表的路徑，建置從 Cards 的根往上 RULES_FROM_ROOT 找得到。 */
export function cardsIn(repo: string): string {
  const at = resolve(repo, CARDS_DIR);
  if (resolve(at, RULES_FROM_ROOT) !== resolve(repo)) throw Error(`版面不一致：Cards 在 ${CARDS_DIR}，規則檔的基準是 Cards 往上 ${RULES_FROM_ROOT}`);
  return at;
}

/** .gitignore 裡指到 Cards 建置產物的寫法（從 repo 的根算）。 */
export const cardsIgnore = (name: string): string => '/' + (CARDS_DIR === '.' ? '' : CARDS_DIR + '/') + name;
