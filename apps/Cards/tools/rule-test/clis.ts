// 比較測試工具：找 claude 與 codex 的 CLI（任務說明 §7）。不經 shell：Node 在 Windows 開 .cmd 一定要 shell，
// 而 shell 會把 JSON schema、空字串這類參數拆壞，所以 .cmd 的 claude 改用 node 直接跑它指到的 cli.js。
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

/** 要執行的程式與放在參數最前面的字（node 跑 cli.js 時是 [cli.js]）。 */
export interface Cli { command: string; prefix: string[]; found: string }

function where(name: string): string[] {
  try {
    return execFileSync(process.platform === 'win32' ? 'where.exe' : 'which', [name], { encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] })
      .split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  } catch { return []; }
}

/** npm 的 .cmd 包裝裡寫的 JS 檔（`"%dp0%\node_modules\…\cli.js"` 這類）；找不到是 null。 */
export function shimTarget(shim: string, text: string): string | null {
  const match = /%~?dp0%?\\([^"%\r\n]+\.m?js)/i.exec(text);
  return match ? resolve(dirname(shim), match[1]) : null;
}

export function findClaude(): Cli {
  const env = process.env.CLAUDE_CLI;
  if (env) return { command: env, prefix: [], found: env };
  if (process.platform !== 'win32') return { command: 'claude', prefix: [], found: where('claude')[0] ?? 'claude' };
  const all = where('claude');
  const exe = all.find(path => /\.exe$/i.test(path));
  if (exe) return { command: exe, prefix: [], found: exe };
  const cmd = all.find(path => /\.cmd$/i.test(path));
  if (cmd) {
    const target = shimTarget(cmd, readFileSync(cmd, 'utf8'));
    if (target && existsSync(target)) return { command: process.execPath, prefix: [target], found: `${cmd} → ${target}` };
  }
  throw Error('找不到 claude 的 CLI（where claude 沒有 .exe，也讀不出 .cmd 指到的 cli.js）；可以用環境變數 CLAUDE_CLI 指定');
}

/** 同最上層 tools/codex.ts：Windows 用 Codex App 內附的那一份（路徑隨 App 更新而變），CODEX_CLI 可以指定別的。 */
export function findCodex(): Cli {
  const env = process.env.CODEX_CLI;
  if (env) return { command: env, prefix: [], found: env };
  if (process.platform !== 'win32') return { command: 'codex', prefix: [], found: where('codex')[0] ?? 'codex' };
  let location = '';
  try {
    location = execFileSync('powershell.exe', ['-NoProfile', '-Command', '(Get-AppxPackage -Name OpenAI.Codex).InstallLocation'], {
      encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'],
    }).split(/\r?\n/).find(line => line.trim())?.trim() ?? '';
  } catch { /* 下面一起報 */ }
  const cli = join(location, 'app', 'resources', 'codex.exe');
  if (!location || !existsSync(cli)) throw Error('找不到 Codex App 內附的 CLI（Get-AppxPackage OpenAI.Codex）；可以用環境變數 CODEX_CLI 指定');
  return { command: cli, prefix: [], found: cli };
}
