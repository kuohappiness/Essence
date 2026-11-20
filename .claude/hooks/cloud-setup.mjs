// Claude Code SessionStart hook：只在雲端 session（CLAUDE_CODE_REMOTE=true）執行，本機什麼都不做。
// 雲端是新的淺層 clone：沒有 core.hooksPath（pre-commit 不會跑）、沒有 node_modules、沒有 git tag
// （跨版本測試要切到 v0.x.0）；PATH 上的 Node 是 22，映像另外裝了 24 在 /opt/node24。
// 裝的資料夾和 CI（.github/workflows/check.yml）一樣；鎖檔沒變就跳過，resume 時不重裝；沒有相依的不裝；每個資料夾都寫一句結果。
import { execFileSync } from 'node:child_process';
import { appendFileSync, existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { delimiter, join } from 'node:path';

if (process.env.CLAUDE_CODE_REMOTE !== 'true') process.exit(0);

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
const DIRS = ['tools', 'plugins/cards', 'plugins/capture', 'plugins/mindboard'];

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

console.log(JSON.stringify({
  hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: `雲端環境設定：${notes.join('；')}` },
}));
