// Claude Code SessionStart hook，也是雲端環境的 setup script 呼叫的程式（加 --setup-script）。只在雲端（CLAUDE_CODE_REMOTE=true）執行，
// 在使用者的電腦上什麼都不做。雲端是新的 clone，沒有設 core.hooksPath，提交前的檢查不會跑；這支把它設好。
// setup script 只有幾行、存在雲端環境的設定裡，邏輯都放這裡（改它要經過 PR 與檢查）；寫法見 SETUP.md。
// 任何一步出錯都只寫一句、照樣結束在 0：這支失敗會擋住討論串開場。
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

if (process.env.CLAUDE_CODE_REMOTE !== 'true') process.exit(0);
const setupScript = process.argv.includes('--setup-script');
const root = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const notes = [];

try {
  execFileSync('git', ['config', 'core.hooksPath', '.githooks'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'], timeout: 30_000 });
  notes.push('core.hooksPath 已設為 .githooks');
} catch (e) {
  notes.push(`設定 core.hooksPath 失敗：${String(e.stderr || e.message).trim().slice(-300)}`);
}

/**
 * 專案討論串的 session 以 repo 的上一層當專案資料夾，讀不到 repo 的 .claude/settings.json，裡面的 hook 都不會跑。
 * setup script 呼叫時，把那份設定的 hook 抄進這台機器的使用者設定 ~/.claude/settings.json：
 * - 指令裡的 $CLAUDE_PROJECT_DIR 換成 repo 的絕對路徑，執行時 CLAUDE_PROJECT_DIR 也指回 repo（這支用它找 repo）；
 * - 專案資料夾本身就是這個 repo 時，repo 的設定讀得到，抄過去的那份直接結束，不跑兩次；
 * - 先拿掉上次抄的（指令寫到這個 repo 的 hook）再照 repo 現在的設定重抄，重跑幾次結果都一樣；使用者設定裡其他的東西不動。
 */
function installUserHooks() {
  if (/["'$`\\\s]/.test(root)) return `repo 的路徑有引號、空白或 $，沒有把 Claude 的 hook 接到使用者設定：${root}`;
  const own = JSON.parse(readFileSync(join(root, '.claude', 'settings.json'), 'utf8')).hooks ?? {};
  const file = join(homedir(), '.claude', 'settings.json');
  const user = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {};
  const mark = `${root}/.claude/hooks/`;
  const hooks = { ...(user.hooks ?? {}) };
  for (const event of Object.keys(hooks)) {
    hooks[event] = hooks[event].filter((group) => !group.hooks?.some((hook) => hook.command?.includes(mark)));
    if (!hooks[event].length) delete hooks[event];
  }
  let count = 0;
  const skip = `[ -f "$CLAUDE_PROJECT_DIR/.claude/hooks/cloud-setup.mjs" ] || CLAUDE_PROJECT_DIR='${root}' `;
  for (const [event, groups] of Object.entries(own)) {
    hooks[event] = [...(hooks[event] ?? []), ...groups.map((group) => ({
      ...group,
      hooks: group.hooks.map((hook) => {
        if (typeof hook.command !== 'string') return hook;
        count++;
        return { ...hook, command: skip + hook.command.replace(/\$\{?CLAUDE_PROJECT_DIR\}?/g, root) };
      }),
    }))];
  }
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify({ ...user, hooks }, null, 2)}\n`);
  return `repo 的 ${count} 個 Claude hook 已接到 ${file}`;
}

if (setupScript) {
  try {
    notes.push(installUserHooks());
  } catch (e) {
    notes.push(`把 Claude 的 hook 接到使用者設定失敗：${e.message}`);
  }
  // setup script 的輸出只進雲端環境的紀錄：一行一件。session 開場時這支會以 hook 再跑一次，結果寫給 Claude。
  console.log(notes.join('\n'));
} else {
  console.log(JSON.stringify({
    hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: `雲端環境設定：${notes.join('；')}` },
  }));
}
