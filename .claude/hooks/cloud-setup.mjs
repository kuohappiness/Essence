// Claude Code SessionStart hook，也是雲端環境的 setup script 呼叫的程式（加 --setup-script）。只在雲端（CLAUDE_CODE_REMOTE=true）執行，本機什麼都不做。
// 雲端是新的淺層 clone：沒有 core.hooksPath（pre-commit 不會跑）、沒有 node_modules、沒有 git tag
// （跨版本測試要切到 v0.x.0）；PATH 上的 Node 是 22，映像另外裝了 24 在 /opt/node24。
// 裝的資料夾和 CI（.github/workflows/check.yml）一樣；鎖檔沒變就跳過，resume 時不重裝；沒有相依的不裝；每個資料夾都寫一句結果。
// setup script 只有幾行、存在雲端環境的設定裡，邏輯都放這裡（要經過 PR 與檢查）；寫法見 docs/agents/quality.md〈本機或雲端〉。
import { execFileSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { delimiter, dirname, join } from 'node:path';

if (process.env.CLAUDE_CODE_REMOTE !== 'true') process.exit(0);
const setupScript = process.argv.includes('--setup-script');

const root = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const notes = [];
const env = { ...process.env };
const run = (cmd, args, cwd) => execFileSync(cmd, args, {
  cwd, env, encoding: 'utf8', timeout: 300_000, stdio: ['ignore', 'pipe', 'pipe'],
});

// Node 24 以上：PATH 上的太舊時，找 /opt/node<版本>，寫進 CLAUDE_ENV_FILE 讓之後的指令（含 git hook）都用它。
const major = Number(process.versions.node.split('.')[0]);
if (major < 24) {
  const found = existsSync('/opt') ? readdirSync('/opt')
    .map((name) => ({ name, n: Number(/^node(\d+)$/.exec(name)?.[1]) }))
    .filter(({ name, n }) => n >= 24 && existsSync(join('/opt', name, 'bin', 'node')))
    .sort((a, b) => b.n - a.n)[0] : undefined;
  if (!found) {
    notes.push(`Node 是 ${process.versions.node}，repo 要 24 以上，/opt 底下也找不到；請在雲端環境的 setup script 裝 Node 24`);
  } else {
    const bin = join('/opt', found.name, 'bin');
    env.PATH = `${bin}${delimiter}${env.PATH ?? ''}`;
    const version = run(join(bin, 'node'), ['-v'], root).trim();
    if (process.env.CLAUDE_ENV_FILE) {
      appendFileSync(process.env.CLAUDE_ENV_FILE, `export PATH="${bin}:$PATH"\n`);
      notes.push(`PATH 上的 Node 是 ${process.versions.node}，之後的指令改用 ${bin} 的 ${version}`);
    } else {
      notes.push(`PATH 上的 Node 是 ${process.versions.node}；${bin} 有 ${version}，但沒有 CLAUDE_ENV_FILE，之後的指令仍是舊版，跑指令前先 export PATH="${bin}:$PATH"`);
    }
  }
}

try {
  run('git', ['config', 'core.hooksPath', '.githooks'], root);
  notes.push('core.hooksPath 已設為 .githooks');
} catch (e) {
  notes.push(`設定 core.hooksPath 失敗：${e.message}`);
}

// 每次都抓：容器可能從舊快照開機，已有的 tag 不代表是最新的（之後新打的版本也要抓得到）。
const versionTags = () => run('git', ['tag', '--list', 'v*'], root).split('\n').filter(Boolean).length;
try {
  const before = versionTags();
  run('git', ['fetch', '--tags', '--quiet', 'origin'], root);
  const after = versionTags();
  if (after > before) notes.push(`補抓了 git tag（共 ${after} 個 v*，跨版本測試要用）`);
} catch (e) {
  notes.push(`抓 git tag 失敗，缺的版本的跨版本測試會失敗：${String(e.stderr || e.message).slice(-300)}`);
}

// 和 check.yml 每個 job 安裝的資料夾相同（tools/tests/cloud-setup.test.ts 照字面比，CI 加了外掛 job 沒改這裡就紅燈）。
// 清單寫死、不 import tools/dispatch.ts：雲端 session 開場時 PATH 上可能是 Node 22，跑不了 .ts。
const DIRS = ['tools', 'apps/Cards', 'apps/Capture', 'apps/Mindboard', 'packages/ai-client'];

// 每個資料夾都寫一句結果（第二步 §A5）：跳過的寫理由，分得出「裝好了」和「根本沒走到」。
for (const dir of DIRS) {
  const cwd = join(root, dir);
  const pkgPath = join(cwd, 'package.json');
  if (!existsSync(pkgPath)) {
    notes.push(`${dir}：找不到 package.json，沒有安裝`);
    continue;
  }
  let hasDeps = true;
  try {
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
    hasDeps = ['dependencies', 'devDependencies', 'optionalDependencies'].some((field) => Object.keys(pkg[field] ?? {}).length > 0);
  } catch {
    // package.json 讀不懂就照常交給 npm ci，錯誤由它回報
  }
  if (!hasDeps) {
    notes.push(`${dir}：沒有相依，跳過`);
    continue;
  }
  const lock = join(cwd, 'package-lock.json');
  if (!existsSync(lock)) {
    notes.push(`${dir}：有相依卻沒有鎖檔，沒有安裝`);
    continue;
  }
  const marker = join(cwd, 'node_modules', '.package-lock.json');
  if (existsSync(marker) && statSync(marker).mtimeMs >= statSync(lock).mtimeMs) {
    notes.push(`${dir}：鎖檔沒變，跳過`);
    continue;
  }
  try {
    run('npm', ['ci', '--no-audit', '--no-fund'], cwd);
    notes.push(`${dir}：npm ci 完成`);
  } catch (e) {
    notes.push(`${dir}：npm ci 失敗：${String(e.stderr || e.message).slice(-400)}`);
  }
}

/**
 * 專案討論串的 session 以 repo 的上一層當專案資料夾，讀不到 repo 的 .claude/settings.json，裡面的 hook（這支、擋危險 git 指令、
 * main 紅燈提醒）都不會跑（2026-11-26 查到）。setup script 呼叫時，把那份設定的 hook 抄進這台機器的使用者設定 ~/.claude/settings.json：
 * - 指令裡的 $CLAUDE_PROJECT_DIR 換成 repo 的絕對路徑，執行時 CLAUDE_PROJECT_DIR 也指回 repo（這支與 ci-status.mjs 用它找 repo）；
 * - 專案資料夾本身就是 Essence 的 checkout 時（claude.ai/code 開的 session），repo 的設定讀得到，抄過去的那份直接結束，不跑兩次；
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
  // setup script 的輸出只進雲端環境的紀錄，不給 Claude 看：一行一件，方便出錯時讀。session 開場時這支會以 hook 再跑一次，結果寫給 Claude。
  console.log(notes.join('\n'));
} else {
  console.log(JSON.stringify({
    hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: `雲端環境設定：${notes.join('；')}` },
  }));
}
