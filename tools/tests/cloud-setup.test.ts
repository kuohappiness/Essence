// 雲端 session 開場的 hook（.claude/hooks/cloud-setup.mjs，D-208 第二步 §A3、§A5）：只有雲端驗得到的部分，這裡先擋住寫錯的接線與清單。
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile, execFileSync, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync } from 'node:fs';
import { copyFile, mkdir, mkdtemp, readFile, rm, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FOLDERS, PACKAGES } from '../apps.ts';

const run = promisify(execFile);
const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const HOOK = join(ROOT, '.claude/hooks/cloud-setup.mjs');

/** cloud-setup.mjs 寫死的資料夾清單（照字面讀，hook 本身不能 import）。 */
async function hookDirs(): Promise<string[]> {
  const text = await readFile(HOOK, 'utf8');
  const literal = /^const DIRS = \[([^\]]*)\];$/m.exec(text)?.[1];
  assert.ok(literal, 'cloud-setup.mjs 要有一行 const DIRS = [...]');
  return [...literal.matchAll(/'([^']+)'/g)].map(match => match[1]);
}

/** check.yml 每個 job 跑 npm ci 的資料夾：步驟自己的 working-directory，沒寫就是 job 的 defaults，再沒有就是根目錄。 */
async function ciInstallDirs(): Promise<Set<string>> {
  const lines = (await readFile(join(ROOT, '.github/workflows/check.yml'), 'utf8')).replace(/\r\n/g, '\n').split('\n');
  const dirs = new Set<string>();
  let jobDefault: string | undefined;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^ {2}[\w-]+:$/.test(line)) jobDefault = undefined;
    if (/^ {6}run:$/.test(line) && /^ {4}defaults:$/.test(lines[i - 1] ?? '')) jobDefault = /^ {8}working-directory: (.+)$/.exec(lines[i + 1] ?? '')?.[1];
    if (/^ {6}- run: npm ci$/.test(line)) dirs.add(/^ {8}working-directory: (.+)$/.exec(lines[i + 1] ?? '')?.[1] ?? jobDefault ?? '.');
  }
  return dirs;
}

void test('§A5 cloud-setup 的資料夾清單和 check.yml 每個 job 安裝的資料夾相同', async () => {
  const dirs = await hookDirs();
  assert.equal(new Set(dirs).size, dirs.length, '清單沒有重複');
  assert.deepEqual([...dirs].sort(), [...(await ciInstallDirs())].sort());
});

void test('D-218 §3 第 1 點：cloud-setup 的清單是 tools 加上表上有程式的軟體（不含只有文件的）與套件', async () => {
  assert.deepEqual(await hookDirs(), ['tools', ...Object.values(FOLDERS), ...Object.values(PACKAGES)]);
});

void test('§A3 SessionStart 接到 cloud-setup.mjs：settings.json 的指令寫到的檔存在', async () => {
  const settings = JSON.parse(await readFile(join(ROOT, '.claude/settings.json'), 'utf8')) as {
    hooks: { SessionStart: { matcher?: string; hooks: { command: string }[] }[] };
  };
  const commands = settings.hooks.SessionStart.flatMap(group => group.hooks.map(hook => ({ matcher: group.matcher, command: hook.command })));
  const setup = commands.filter(({ command }) => command.includes('cloud-setup.mjs'));
  assert.equal(setup.length, 1, '只有一個 SessionStart 指令跑 cloud-setup.mjs');
  assert.match(setup[0].command, /^node "\$CLAUDE_PROJECT_DIR\/\.claude\/hooks\/cloud-setup\.mjs"$/);
  assert.ok(existsSync(HOOK));
  // 新開與 resume 都要跑：新 session 沒有 node_modules。
  assert.match(setup[0].matcher ?? '', /startup/);
});

void test('§A5 cloud-setup 每個資料夾都寫一句結果：沒有相依、鎖檔沒變、找不到 package.json 各有理由', async t => {
  const root = await mkdtemp(join(tmpdir(), 'essence-cloud-setup-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  // HOME 換成空的資料夾：沒加 --setup-script 時不碰使用者設定。
  const home = join(root, 'home');
  const env: NodeJS.ProcessEnv = { ...process.env, CLAUDE_CODE_REMOTE: 'true', CLAUDE_PROJECT_DIR: root, HOME: home };
  for (const key of Object.keys(env)) if (key.toUpperCase().startsWith('GIT_')) delete env[key];
  delete env.CLAUDE_ENV_FILE;
  execFileSync('git', ['init', '-q'], { cwd: root, env });
  const dirs = await hookDirs();
  const [withDeps, ...rest] = dirs;
  // 第一個資料夾有相依、鎖檔與比鎖檔新的 node_modules 記號：鎖檔沒變，不跑 npm ci。
  await mkdir(join(root, withDeps, 'node_modules'), { recursive: true });
  await writeFile(join(root, withDeps, 'package.json'), JSON.stringify({ devDependencies: { a: '1.0.0' } }));
  await writeFile(join(root, withDeps, 'package-lock.json'), '{}');
  await writeFile(join(root, withDeps, 'node_modules/.package-lock.json'), '{}');
  const later = new Date(Date.now() + 60_000);
  await utimes(join(root, withDeps, 'node_modules/.package-lock.json'), later, later);
  // 第二個沒有相依；其餘找不到 package.json。
  const [noDeps, ...missing] = rest;
  await mkdir(join(root, noDeps), { recursive: true });
  await writeFile(join(root, noDeps, 'package.json'), JSON.stringify({ scripts: { check: 'node -e 1' } }));
  const { stdout } = await run(process.execPath, [HOOK], { cwd: root, env, encoding: 'utf8' });
  const context = (JSON.parse(stdout) as { hookSpecificOutput: { additionalContext: string } }).hookSpecificOutput.additionalContext;
  assert.match(context, new RegExp(`${withDeps.replace('.', '\\.')}：鎖檔沒變，跳過`));
  assert.match(context, new RegExp(`${noDeps.replace('.', '\\.')}：沒有相依，跳過`));
  for (const dir of missing) assert.match(context, new RegExp(`${dir.replace('.', '\\.')}：找不到 package\\.json，沒有安裝`));
  assert.match(context, /core\.hooksPath 已設為 \.githooks/);
  assert.equal(execFileSync('git', ['config', 'core.hooksPath'], { cwd: root, env, encoding: 'utf8' }).trim(), '.githooks');
  assert.equal(existsSync(join(home, '.claude')), false, '沒加 --setup-script 不寫使用者設定');
});

interface Hook { type: string; command: string }
interface Settings { [key: string]: unknown; hooks: Record<string, { matcher?: string; hooks: Hook[] }[]> }

/** 跑一支抄過去的 hook 指令：和 Claude Code 一樣交給 sh，stdin 給 JSON。 */
function runCopied(command: string, projectDir: string, stdin: string): Promise<number | null> {
  return new Promise((resolve, reject) => {
    const child = spawn('sh', ['-c', command], { env: { ...process.env, CLAUDE_PROJECT_DIR: projectDir }, stdio: ['pipe', 'ignore', 'ignore'] });
    child.on('error', reject);
    child.on('close', resolve);
    child.stdin.end(stdin);
  });
}

void test('第 1 步 setup script：repo 的 Claude hook 抄進使用者設定，專案資料夾不是 repo 也跑得到、是 repo 時不跑兩次', async t => {
  const base = await mkdtemp(join(tmpdir(), 'essence-cloud-setup-user-'));
  t.after(() => rm(base, { recursive: true, force: true }));
  // repo 放在上一層資料夾底下，和專案討論串一樣：專案資料夾是 base，repo 是 base/Essence。
  const root = join(base, 'Essence');
  const home = join(base, 'home');
  await mkdir(join(root, '.claude/hooks'), { recursive: true });
  for (const file of ['settings.json', 'hooks/cloud-setup.mjs', 'hooks/block-dangerous-git.mjs']) await copyFile(join(ROOT, '.claude', file), join(root, '.claude', file));
  const env: NodeJS.ProcessEnv = { ...process.env, CLAUDE_CODE_REMOTE: 'true', CLAUDE_PROJECT_DIR: root, HOME: home };
  for (const key of Object.keys(env)) if (key.toUpperCase().startsWith('GIT_')) delete env[key];
  delete env.CLAUDE_ENV_FILE;
  execFileSync('git', ['init', '-q'], { cwd: root, env });
  // 使用者設定原本就有的：別的 hook 與設定要留著；上次抄的（寫到這個 repo 的 hook）要換掉，不重複。
  const userFile = join(home, '.claude/settings.json');
  await mkdir(join(home, '.claude'), { recursive: true });
  const other = { type: 'command', command: 'echo other' };
  await writeFile(userFile, JSON.stringify({
    model: 'keep-me',
    hooks: { Stop: [{ hooks: [other] }], PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: `node "${root}/.claude/hooks/old.mjs"` }] }] },
  }));

  const once = await run(process.execPath, [HOOK, '--setup-script'], { cwd: root, env, encoding: 'utf8' });
  assert.match(once.stdout, /^core\.hooksPath 已設為 \.githooks$/m, 'setup script 的輸出一行一件，不是 hook 的 JSON');
  assert.match(once.stdout, /repo 的 3 個 Claude hook 已接到 /);
  const first = await readFile(userFile, 'utf8');
  await run(process.execPath, [HOOK, '--setup-script'], { cwd: root, env, encoding: 'utf8' });
  assert.equal(await readFile(userFile, 'utf8'), first, '重跑結果一樣');

  const user = JSON.parse(first) as Settings;
  const own = JSON.parse(await readFile(join(root, '.claude/settings.json'), 'utf8')) as Settings;
  assert.equal(user.model, 'keep-me');
  assert.deepEqual(user.hooks.Stop, [{ hooks: [other] }]);
  assert.deepEqual(Object.keys(user.hooks).sort(), [...new Set(['Stop', ...Object.keys(own.hooks)])].sort());
  for (const [event, groups] of Object.entries(own.hooks)) {
    assert.equal(user.hooks[event].length, groups.length, `${event} 的群組照 repo 的設定抄，沒有留下舊的`);
    groups.forEach((group, i) => {
      assert.equal(user.hooks[event][i].matcher, group.matcher);
      group.hooks.forEach((hook, j) => {
        const copied = user.hooks[event][i].hooks[j].command;
        assert.ok(copied.startsWith('[ -f "$CLAUDE_PROJECT_DIR/.claude/hooks/cloud-setup.mjs" ] || '), copied);
        assert.ok(copied.endsWith(hook.command.replaceAll('$CLAUDE_PROJECT_DIR', root)), `${event} 的指令改成絕對路徑：${copied}`);
      });
    });
  }

  // 抄過去的擋危險 git 指令：專案資料夾是上一層（或沒有）時照樣擋；專案資料夾就是 repo 時直接結束，由 repo 自己的設定擋。
  const pre = user.hooks.PreToolUse.flatMap(group => group.hooks).find(hook => hook.command.includes('block-dangerous-git.mjs'));
  assert.ok(pre);
  const input = (command: string) => JSON.stringify({ tool_name: 'Bash', tool_input: { command } });
  const stash = input('git stash');
  assert.equal(await runCopied(pre.command, base, stash), 2);
  assert.equal(await runCopied(pre.command, '', stash), 2, 'CLAUDE_PROJECT_DIR 是空的也擋');
  assert.equal(await runCopied(pre.command, base, input('git status')), 0);
  assert.equal(await runCopied(pre.command, root, stash), 0);
});

void test('§A5 cloud-setup 在本機什麼都不做', async t => {
  const root = await mkdtemp(join(tmpdir(), 'essence-cloud-setup-local-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const env: NodeJS.ProcessEnv = { ...process.env, CLAUDE_PROJECT_DIR: root };
  delete env.CLAUDE_CODE_REMOTE;
  const { stdout } = await run(process.execPath, [HOOK], { cwd: root, env, encoding: 'utf8' });
  assert.equal(stdout, '');
});
