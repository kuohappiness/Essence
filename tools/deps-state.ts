// 套件裝了沒、和鎖檔對不對得上（優化 Essence 開發流程第 1 步）。串中途併 main 或切分支帶進新的鎖檔時，檢查原本會停在
// 「找不到某個套件」這種看不出原因的錯誤（2026-11-27 併進 PR #72 後，secretlint 找不到新加的規則）。
// 比對 npm 裝完寫的 node_modules/.package-lock.json 和鎖檔裡每個套件的版本，不看檔案時間：git 換分支再換回來，內容沒變也會更新時間。
// 讀不懂或沒有 npm 的紀錄時當成對得上，交給檢查本身回報，不因為這裡猜錯而擋下 commit。不用 npm 套件。
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

interface Entry { version?: string; link?: boolean; optional?: boolean; devOptional?: boolean; os?: unknown; cpu?: unknown; libc?: unknown }

export type DepsState = { state: 'ok' } | { state: 'missing' } | { state: 'stale'; detail: string };

function packages(file: string): Record<string, Entry> | undefined {
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as { packages?: Record<string, Entry> };
    return parsed.packages && typeof parsed.packages === 'object' ? parsed.packages : undefined;
  } catch {
    return undefined;
  }
}

/** lockDir 的 package-lock.json 要的，和 modulesDir 的 node_modules 裝的比（commit 檢查在副本跑，鎖檔讀副本的、套件用工作樹的）。 */
export function depsState(lockDir: string, modulesDir = lockDir): DepsState {
  if (!existsSync(join(modulesDir, 'node_modules'))) return { state: 'missing' };
  const want = packages(join(lockDir, 'package-lock.json'));
  const have = packages(join(modulesDir, 'node_modules', '.package-lock.json'));
  if (!want || !have) return { state: 'ok' };
  const wrong: string[] = [];
  for (const [path, entry] of Object.entries(want)) {
    if (!path.startsWith('node_modules/') && !path.includes('/node_modules/')) continue;
    if (entry.link) continue;
    const name = path.slice(path.lastIndexOf('node_modules/') + 'node_modules/'.length);
    const got = have[path];
    if (!got) {
      // 選用的、限定作業系統或 CPU 的套件，這台機器本來就可能沒裝。
      if (entry.optional || entry.devOptional || entry.os || entry.cpu || entry.libc) continue;
      wrong.push(`${name} 沒裝`);
    } else if (got.version !== entry.version) {
      wrong.push(`${name} 裝的是 ${got.version ?? '不明版本'}，鎖檔要 ${entry.version ?? '不明版本'}`);
    }
  }
  if (!wrong.length) return { state: 'ok' };
  return { state: 'stale', detail: wrong.length > 1 ? `${wrong[0]}，共 ${wrong.length} 個不符` : wrong[0] };
}
