// Claude Code SessionStart hook：只在雲端 session（CLAUDE_CODE_REMOTE=true）執行，本機什麼都不做。
// 雲端是新的 clone：沒有 core.hooksPath（pre-commit 不會跑），也沒有 node_modules。
// 裝的資料夾和 CI（.github/workflows/check.yml）一樣；鎖檔沒變就跳過，resume 時不重裝。
import { execFileSync } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';

if (process.env.CLAUDE_CODE_REMOTE !== 'true') process.exit(0);

const root = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const notes = [];
const run = (cmd, args, cwd) => execFileSync(cmd, args, {
  cwd, encoding: 'utf8', timeout: 300_000, stdio: ['ignore', 'pipe', 'pipe'],
});

const major = Number(process.versions.node.split('.')[0]);
if (major < 24) notes.push(`Node 是 ${process.versions.node}，repo 要 24 以上（tools/hooks.ts 直接跑 .ts）；請在雲端環境的 setup script 裝 Node 24`);

try {
  run('git', ['config', 'core.hooksPath', '.githooks'], root);
  notes.push('core.hooksPath 已設為 .githooks');
} catch (e) {
  notes.push(`設定 core.hooksPath 失敗：${e.message}`);
}

for (const dir of ['.', 'tools', 'plugins/capture', 'plugins/mindboard']) {
  const cwd = join(root, dir);
  const lock = join(cwd, 'package-lock.json');
  if (!existsSync(lock)) continue;
  const marker = join(cwd, 'node_modules', '.package-lock.json');
  if (existsSync(marker) && statSync(marker).mtimeMs >= statSync(lock).mtimeMs) continue;
  try {
    run('npm', ['ci', '--no-audit', '--no-fund'], cwd);
    notes.push(`${dir}：npm ci 完成`);
  } catch (e) {
    notes.push(`${dir}：npm ci 失敗：${String(e.stderr || e.message).slice(-400)}`);
  }
}

console.log(JSON.stringify({
  hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: `雲端環境設定：${notes.join('；') || '相依已是最新'}` },
}));
