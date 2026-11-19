import test from 'node:test';
import assert from 'node:assert/strict';
import { exec, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { access, mkdtemp, mkdir, writeFile, readFile, chmod, rm, symlink, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { fileURLToPath } from 'node:url';

void test('安裝 hook 時恢復 LF：Git Bash 可執行，缺相依時程式與文件的 commit 都擋', async t => {
  const root = await mkdtemp(join(tmpdir(), 'essence-hooks-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const run = promisify(execFile);
  const shell = promisify(exec);
  // pre-commit 會匯出 GIT_DIR / GIT_INDEX_FILE 等；在另一個 repo 操作前必須清除。
  const env = { ...process.env };
  for (const key of Object.keys(env)) if (key.toUpperCase().startsWith('GIT_')) delete env[key];
  const isolated = { cwd: root, env };
  await run('git', ['init', '-q'], isolated);
  await mkdir(join(root, '.githooks'));
  await mkdir(join(root, 'src'));
  await mkdir(join(root, 'tools'));
  const original = (await readFile(new URL('../.githooks/pre-commit', import.meta.url), 'utf8')).replaceAll('\r\n', '\n');
  const hook = join(root, '.githooks/pre-commit');
  await writeFile(hook, original.replaceAll('\n', '\r\n'));
  await chmod(hook, 0o755);
  // 安裝入口在 tools/package.json（D-208 第一步 §1）：npm 在 tools/ 執行，從子資料夾設的相對 core.hooksPath 照樣以工作樹的根解讀。
  const pkg = JSON.parse(await readFile(new URL('../tools/package.json', import.meta.url), 'utf8')) as { scripts: { preprepare: string; prepare: string } };
  const inTools = { ...isolated, cwd: join(root, 'tools') };
  await shell(pkg.scripts.preprepare, inTools);
  await shell(pkg.scripts.prepare, inTools);
  assert.equal(await readFile(hook, 'utf8'), original);
  await writeFile(join(root, 'src/probe.ts'), 'export {};\n');
  await run('git', ['add', '--', 'src/probe.ts'], isolated);
  const commit = ['-c', 'user.name=QualityTest', '-c', 'user.email=test@example.invalid', 'commit', '-m', 'probe'];
  await assert.rejects(run('git', commit, isolated), /先在 tools\/ 執行 npm ci/);
  await run('git', ['rm', '--cached', '--', 'src/probe.ts'], isolated);
  await writeFile(join(root, 'doc.md'), '文件\n');
  await run('git', ['add', '--', 'doc.md'], isolated);
  await assert.rejects(run('git', commit, isolated), /先在 tools\/ 執行 npm ci/);
});

void test('D-141 每次 commit 都跑文件檢查且讀暫存區：只改文件不跑程式檢查，沒 stage 的壞連結不擋', async t => {
  // 相依借用本 repo 的 tools/node_modules（junction，Linux 上是 symlink），檢查程式複製一份；兩者都不 stage。
  // 根目錄沒有 node_modules：共用檢查只靠 tools/ 的相依（D-208 第一步 §1）。
  // 清理時先拆掉連結再刪資料夾，不會碰到本 repo 的 node_modules。
  const root = await mkdtemp(join(tmpdir(), 'essence-hook-docs-'));
  const modules = join(root, 'tools/node_modules');
  t.after(async () => {
    await unlink(modules).catch(() => undefined);
    await rm(root, { recursive: true, force: true });
  });
  const run = promisify(execFile);
  const env = { ...process.env };
  for (const key of Object.keys(env)) if (key.toUpperCase().startsWith('GIT_')) delete env[key];
  const isolated = { cwd: root, env };
  const commit = ['-c', 'user.name=QualityTest', '-c', 'user.email=test@example.invalid', 'commit', '-m', 'probe'];
  await run('git', ['init', '-q'], isolated);
  await mkdir(join(root, 'tools'));
  await symlink(fileURLToPath(new URL('../tools/node_modules', import.meta.url)), modules, 'junction');
  // 本 repo 的例外表在這裡會變成「沒用到」，複製時清空。
  const checker = await readFile(new URL('../tools/check-docs.ts', import.meta.url), 'utf8');
  const emptied = checker.replace(/^export const EXCEPTIONS: Exception\[\] = \[[\s\S]*?^\];\r?$/m, 'export const EXCEPTIONS: Exception[] = [];');
  assert.notEqual(emptied, checker);
  await writeFile(join(root, 'tools/check-docs.ts'), emptied);
  await writeFile(join(root, 'tools/secretlint.mjs'), await readFile(new URL('../tools/secretlint.mjs', import.meta.url), 'utf8'));
  await writeFile(join(root, '.secretlintrc.json'), await readFile(new URL('../.secretlintrc.json', import.meta.url), 'utf8'));
  // hook 的邏輯在 tools/hooks.ts，分派表與外掛之間的 import 檢查照真的複製；兩份 skill 與 roadmap 的檢查換成替身（這裡沒有）。
  for (const name of ['check-local-paths.ts', 'hooks.ts', 'dispatch.ts', 'check-plugin-imports.ts']) {
    await writeFile(join(root, 'tools', name), await readFile(new URL('../tools/' + name, import.meta.url), 'utf8'));
  }
  for (const name of ['check-skill-mirror.ts', 'roadmap-board.ts']) await writeFile(join(root, 'tools', name), 'export {};\n');
  await mkdir(join(root, '.githooks'));
  for (const name of ['pre-commit', 'commit-msg']) {
    const hook = join(root, '.githooks', name);
    await writeFile(hook, (await readFile(new URL('../.githooks/' + name, import.meta.url), 'utf8')).replaceAll('\r\n', '\n'));
    await chmod(hook, 0o755);
  }
  await run('git', ['config', 'core.hooksPath', '.githooks'], isolated);
  // 只改文件：沒有 package.json，跑到程式檢查就會失敗，所以通過表示只跑了文件檢查（分派表：根目錄的 .md 是 Cards 的相關測試，沒有測試寫到就跳過）。
  await writeFile(join(root, 'a.md'), '# A\n\n[b](b.md)\n');
  await writeFile(join(root, 'b.md'), '# B\n');
  await run('git', ['add', '--', 'a.md', 'b.md'], isolated);
  await run('git', commit, isolated);
  await assert.rejects(access(join(root, 'node_modules')), { code: 'ENOENT' });
  // 部分 stage：工作樹的壞連結沒 stage，照樣能 commit。
  await writeFile(join(root, 'a.md'), '# A\n\n[b](b.md)、[壞](missing.md)\n');
  await writeFile(join(root, 'b.md'), '# B\n\n改了\n');
  await run('git', ['add', '--', 'b.md'], isolated);
  await run('git', commit, isolated);
  // stage 了就擋。
  await run('git', ['add', '--', 'a.md'], isolated);
  await assert.rejects(run('git', commit, isolated), /a\.md:3 {2}missing\.md {2}找不到檔案/);
  // 只改文件也掃金鑰（第二次里程碑檢查 R4）：repo 公開，規劃文件直接推上 main。假的 GitHub token 拆開寫，本檔才不會被掃到。
  const secret = '# C\n\n' + 'gh' + 'p_' + 'x7Kq2'.repeat(7) + 'Z\n';
  await writeFile(join(root, 'a.md'), '# A\n\n[b](b.md)\n');
  await writeFile(join(root, 'c.md'), secret);
  await run('git', ['add', '--', 'a.md', 'c.md'], isolated);
  await assert.rejects(run('git', commit, isolated), /secretlint-rule-github/);
  await writeFile(join(root, 'c.md'), '# C\n');
  await run('git', ['add', '--', 'c.md'], isolated);
  await run('git', commit, isolated);
  // 掃的是這次 commit 的內容，不是工作檔（L2 R1）。暫存區有金鑰、工作檔已經刪掉：擋。
  await writeFile(join(root, 'c.md'), secret);
  await run('git', ['add', '--', 'c.md'], isolated);
  await writeFile(join(root, 'c.md'), '# C\n\n改了\n');
  await assert.rejects(run('git', commit, isolated), /secretlint-rule-github/);
  // 暫存區乾淨、工作檔有金鑰（只 stage 一部分）：放行。
  await run('git', ['add', '--', 'c.md'], isolated);
  await writeFile(join(root, 'c.md'), secret);
  await run('git', commit, isolated);
  // git commit -a、git commit -- <路徑> 用的是工作檔（暫時的索引）：擋。
  await assert.rejects(run('git', [...commit, '-a'], isolated), /secretlint-rule-github/);
  await assert.rejects(run('git', [...commit, '--', 'c.md'], isolated), /secretlint-rule-github/);
  // 別的檔已經 stage 了金鑰，git commit -- <路徑> 不含它：放行。
  await writeFile(join(root, 'c.md'), '# C\n');
  await writeFile(join(root, 'e.md'), secret);
  await run('git', ['add', '--', 'e.md'], isolated);
  await run('git', [...commit, '--', 'c.md'], isolated);
  await run('git', ['rm', '-q', '--cached', '--', 'e.md'], isolated);
  // symlink 換成含金鑰的一般檔（型別變更 T）也掃。物件直接寫進索引，Windows 不用開 symlink。
  const object = async (text: string) => {
    await writeFile(join(root, 'e.md'), text);
    return (await run('git', ['hash-object', '-w', '--', 'e.md'], isolated)).stdout.trim();
  };
  await run('git', ['update-index', '--add', '--cacheinfo', `120000,${await object('c.md')},s.md`], isolated);
  await run('git', commit, isolated);
  await run('git', ['update-index', '--cacheinfo', `100644,${await object(secret)},s.md`], isolated);
  await assert.rejects(run('git', commit, isolated), /secretlint-rule-github/);
  await run('git', ['reset', '-q', '--', 's.md'], isolated);
  // Git 取出檔案時的轉換都不算（L2 R7，R1 的第 2 代，所以列舉整類）：.gitattributes 不管已 stage 還是只在工作樹，設了
  // 編碼、filter、換行或 ident，掃的仍是索引裡的位元組。filter 的指令把金鑰換掉，也不會在 pre-commit 被執行。
  await run('git', ['config', 'filter.hide.smudge', 'touch smudge-ran; sed s/ghp/XXX/'], isolated);
  await run('git', ['add', '--', 'e.md'], isolated);
  for (const attribute of ['working-tree-encoding=UTF-16LE', 'filter=hide', 'text eol=crlf', 'ident']) {
    for (const staging of ['只在工作樹', '已 stage']) {
      await writeFile(join(root, '.gitattributes'), `e.md ${attribute}\n`);
      if (staging === '已 stage') await run('git', ['add', '--', '.gitattributes'], isolated);
      await assert.rejects(run('git', commit, isolated), /secretlint-rule-github/, `${attribute}（${staging}）`);
      if (staging === '已 stage') await run('git', ['rm', '-q', '--cached', '--', '.gitattributes'], isolated);
    }
  }
  await assert.rejects(access(join(root, 'smudge-ran')), { code: 'ENOENT' });
  await rm(join(root, '.gitattributes'));
  await run('git', ['rm', '-q', '--cached', '--', 'e.md'], isolated);
  // 只差大小寫的兩個路徑（檔名或資料夾名）：不分大小寫的檔案系統會寫成同一個檔，撞到就擋；區分大小寫的照常兩份都掃
  // （L2 R8，R7 修正引入；同一類的第 3 代，列舉整類）。物件直接寫進索引：Windows 的 git add 加不進來，合併在區分大小寫的
  // 系統上做的分支就會帶進來。索引照位元組排序，大寫的先寫出，金鑰放在先寫的那份。
  // 預期照掃描器的副本所在（系統暫存資料夾）實際分不分大小寫，不照作業系統猜（L2 R9）：Windows 的資料夾可以設成區分大小寫。
  const probe = await mkdtemp(join(tmpdir(), 'essence-case-'));
  await writeFile(join(probe, 'Case'), '', { flag: 'wx' });
  const sameFile = await writeFile(join(probe, 'case'), '', { flag: 'wx' }).then(() => false, (error: NodeJS.ErrnoException) => {
    if (error.code !== 'EEXIST') throw error;
    return true;
  });
  await rm(probe, { recursive: true, force: true });
  const clean = await object('# C\n');
  const leaked = await object(secret);
  for (const [first, second] of [['docs/Case.md', 'docs/case.md'], ['Docs/case.md', 'docs/case.md']]) {
    await run('git', ['update-index', '--add', '--cacheinfo', `100644,${leaked},${first}`, '--cacheinfo', `100644,${clean},${second}`], isolated);
    await assert.rejects(run('git', commit, isolated), sameFile ? /同一個檔/ : /secretlint-rule-github/, first);
    await run('git', ['update-index', '--force-remove', '--', first, second], isolated);
  }
  await rm(join(root, 'e.md'));
  // 本機路徑也每次都掃，檔案內容與 commit 訊息都擋（第二次里程碑檢查 R5）。帳號名是自編的，拆開寫本檔才不會被掃到。
  const local = 'C:' + String.raw`\Users\alice\AppData`;
  await writeFile(join(root, 'c.md'), '# C\n\n' + local + '\n');
  await run('git', ['add', '--', 'c.md'], isolated);
  await assert.rejects(run('git', commit, isolated), /c\.md:3:1 {2}Windows 使用者資料夾/);
  await writeFile(join(root, 'c.md'), '# C\n\n' + String.raw`C:\Users\<帳號>\AppData` + '\n');
  await run('git', ['add', '--', 'c.md'], isolated);
  await assert.rejects(run('git', [...commit.slice(0, -1), 'probe ' + local], isolated), /commit 訊息:1:7 {2}Windows 使用者資料夾/);
  await run('git', commit, isolated);
});

for (const scenario of ['中文新增', '移出 src 的改名'] as const) void test('L2-3 hook 擋下缺相依的' + scenario, async t => {
  const root = await mkdtemp(join(tmpdir(), 'essence-hook-path-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const env = { ...process.env };
  for (const key of Object.keys(env)) if (key.toUpperCase().startsWith('GIT_')) delete env[key];
  const isolated = { cwd: root, env };
  const run = promisify(execFile);
  const commit = ['-c', 'user.name=QualityTest', '-c', 'user.email=test@example.invalid', 'commit', '-m', 'probe'];
  await run('git', ['init', '-q'], isolated);
  await run('git', ['config', 'core.quotepath', 'true'], isolated);
  await mkdir(join(root, 'src'));
  if (scenario === '移出 src 的改名') {
    await mkdir(join(root, 'docs'));
    await writeFile(join(root, 'src/x.ts'), 'export {};\n');
    await run('git', ['add', '--', 'src/x.ts'], isolated);
    await run('git', commit, isolated);
    await run('git', ['mv', 'src/x.ts', 'docs/x.ts'], isolated);
  } else {
    await writeFile(join(root, 'src/中文.ts'), 'export {};\n');
    await run('git', ['add', '--', 'src/中文.ts'], isolated);
  }
  await mkdir(join(root, '.githooks'));
  const hook = join(root, '.githooks/pre-commit');
  await writeFile(hook, (await readFile(new URL('../.githooks/pre-commit', import.meta.url), 'utf8')).replaceAll('\r\n', '\n'));
  await chmod(hook, 0o755);
  await run('git', ['config', 'core.hooksPath', '.githooks'], isolated);
  await assert.rejects(run('git', commit, isolated), /先在 tools\/ 執行 npm ci/);
});

// 第二次里程碑檢查 R2：還原分支沒 push 過就合併，Linux 上的失敗合併後才看到。合併進 main 之前，要合併的 commit 的 Check 要綠。
// D-208 第一步 §3：pre-merge-commit 也呼叫分派表（CI 的跑法），只查同一個 head 的 push run；合併不經過 pre-commit，
// 共用檢查在這裡讀合併的索引，不管合併到哪個分支。
void test('R2 合併進 main 前查同一個 head 的 push run：綠燈才放行；沒紀錄、紅燈、還在跑都擋；gh 不能用時警告放行；不在 main 不查 CI；合併索引的違規由共用檢查擋', async t => {
  const root = await mkdtemp(join(tmpdir(), 'essence-hook-merge-'));
  const repo = join(root, 'repo');
  const modules = join(repo, 'tools/node_modules');
  t.after(async () => {
    await unlink(modules).catch(() => undefined);
    await rm(root, { recursive: true, force: true });
  });
  const run = promisify(execFile);
  const env: NodeJS.ProcessEnv = { ...process.env };
  for (const key of Object.keys(env)) if (key.toUpperCase().startsWith('GIT_')) delete env[key];
  // 假的 gh：參數記進 gh-args.txt；照 FAKE_GH（「status conclusion」）印出一筆 run 的 JSON，空字串是沒有 run，fail 就當成 gh 不能用。
  // hook 在 Windows 經過 cmd 找 gh（gh.cmd），其他平台直接執行 gh。
  const bin = join(root, '.bin');
  await mkdir(bin);
  const ghArgs = join(root, 'gh-args.txt');
  await writeFile(join(bin, 'gh.mjs'), [
    "import { appendFileSync } from 'node:fs';",
    `appendFileSync(${JSON.stringify(ghArgs)}, process.argv.slice(2).join(' ') + '\\n');`,
    "const fake = process.env.FAKE_GH ?? '';",
    "if (fake === 'fail') process.exit(1);",
    "const [status, conclusion = ''] = fake.split(' ');",
    'console.log(JSON.stringify(fake ? [{ status, conclusion }] : []));',
    '',
  ].join('\n'));
  if (process.platform === 'win32') await writeFile(join(bin, 'gh.cmd'), '@node "%~dp0gh.mjs" %*\r\n');
  else {
    await writeFile(join(bin, 'gh'), '#!/bin/sh\nexec node "$(dirname "$0")/gh.mjs" "$@"\n');
    await chmod(join(bin, 'gh'), 0o755);
  }
  const pathKey = Object.keys(env).find(key => key.toUpperCase() === 'PATH') ?? 'PATH';
  env[pathKey] = bin + delimiter + (env[pathKey] ?? '');
  await mkdir(repo);
  const git = (args: string[], fake = '') => run('git', ['-c', 'user.name=QualityTest', '-c', 'user.email=test@example.invalid', ...args], { cwd: repo, env: { ...env, FAKE_GH: fake } });
  await git(['init', '-q', '-b', 'main']);
  // hook 與共用檢查的工具複製進來、不 stage，相依借本 repo 的 tools/node_modules。這裡沒有 skill，兩份 skill 的檢查換成替身。
  await mkdir(join(repo, '.githooks'));
  await mkdir(join(repo, 'tools'));
  const hook = join(repo, '.githooks/pre-merge-commit');
  await writeFile(hook, (await readFile(new URL('../.githooks/pre-merge-commit', import.meta.url), 'utf8')).replaceAll('\r\n', '\n'));
  await chmod(hook, 0o755);
  const checker = await readFile(new URL('../tools/check-docs.ts', import.meta.url), 'utf8');
  await writeFile(join(repo, 'tools/check-docs.ts'), checker.replace(/^export const EXCEPTIONS: Exception\[\] = \[[\s\S]*?^\];\r?$/m, 'export const EXCEPTIONS: Exception[] = [];'));
  for (const path of ['tools/hooks.ts', 'tools/dispatch.ts', 'tools/secretlint.mjs', 'tools/check-local-paths.ts', 'tools/check-plugin-imports.ts', '.secretlintrc.json']) {
    await writeFile(join(repo, path), await readFile(new URL('../' + path, import.meta.url), 'utf8'));
  }
  for (const name of ['check-skill-mirror.ts', 'roadmap-board.ts']) await writeFile(join(repo, 'tools', name), 'export {};\n');
  await symlink(fileURLToPath(new URL('../tools/node_modules', import.meta.url)), modules, 'junction');
  await writeFile(join(repo, 'README.md'), '# R\n');
  await git(['add', '--', 'README.md']);
  await git(['commit', '-q', '-m', 'base']);
  await git(['config', 'core.hooksPath', '.githooks']);
  await git(['checkout', '-q', '-b', 'code']);
  await mkdir(join(repo, 'src'));
  await writeFile(join(repo, 'src/x.ts'), 'export {};\n');
  await git(['add', '--', 'src/x.ts']);
  await git(['commit', '-q', '-m', 'code']);
  const code = (await git(['rev-parse', 'HEAD'])).stdout.trim();
  await git(['checkout', '-q', '-b', 'docs', 'main']);
  await writeFile(join(repo, 'notes.md'), '# N\n');
  await git(['add', '--', 'notes.md']);
  await git(['commit', '-q', '-m', 'docs']);
  await git(['checkout', '-q', '-b', 'broken', 'main']);
  await writeFile(join(repo, 'broken.md'), '# B\n\n[壞](missing.md)\n');
  await git(['add', '--', 'broken.md']);
  await git(['commit', '-q', '-m', 'broken link']);
  await git(['checkout', '-q', 'main']);
  const merged = async (branch: string, fake: string) => {
    const { stderr } = await git(['merge', '-q', '--no-ff', '-m', 'merge', branch], fake);
    await git(['reset', '-q', '--keep', 'HEAD~1']);
    return stderr;
  };
  const blocked = async (branch: string, fake: string, message: RegExp) => {
    await assert.rejects(git(['merge', '-q', '--no-ff', '-m', 'merge', branch], fake), message);
    await git(['merge', '--abort']);
  };
  assert.doesNotMatch(await merged('code', 'completed success'), /警告/);
  // 查的是同一個 head 的 push run（PR 或探針的 run 比的是別的範圍）。
  assert.match(await readFile(ghArgs, 'utf8'), new RegExp(`^run list --commit ${code} --workflow check\\.yml --event push `, 'm'));
  await blocked('code', '', /已擋下合併進 main.*沒有 push 的 CI 紀錄/);
  await blocked('code', 'completed failure', /已擋下合併進 main.*CI 沒通過/);
  await blocked('code', 'completed cancelled', /已擋下合併進 main.*CI 沒通過/);
  await blocked('code', 'in_progress', /已擋下合併進 main.*CI 還沒跑完/);
  assert.match(await merged('code', 'fail'), /警告：查不到 GitHub Actions/);
  // 只改文件也要 CI：CI 的跑法把 Cards 的相關測試升成完整檢查。
  await blocked('docs', '', /已擋下合併進 main.*沒有 push 的 CI 紀錄/);
  // 合併索引裡的違規：共用檢查擋下，不管合併到哪個分支。
  await blocked('broken', 'completed success', /broken\.md:3 {2}missing\.md {2}找不到檔案/);
  await git(['checkout', '-q', 'docs']);
  await merged('code', '');
  await blocked('broken', '', /broken\.md:3 {2}missing\.md {2}找不到檔案/);
});

void test('兩個 hook 都只確認 tools/ 裝過再呼叫 tools/hooks.ts（分派表只有一份，不在 hook 裡各寫一份路徑）', async () => {
  for (const name of ['pre-commit', 'pre-merge-commit']) {
    const text = await readFile(new URL('../.githooks/' + name, import.meta.url), 'utf8');
    assert.match(text, new RegExp(`^exec node tools/hooks\\.ts ${name}$`, 'm'), name);
    assert.doesNotMatch(text, /grep -E/, name);
  }
});

// 外掛架構檢查環節 9 結論第 2 條（Q2）：改到程式時跑同一份 npm run check，只是測試改用 dot reporter。
void test('Q2 改到程式時 hook 跑 npm run check：測試只印點、保留原本的 NODE_OPTIONS；失敗時擋下並印出錯誤', async t => {
  const root = await mkdtemp(join(tmpdir(), 'essence-hook-check-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const run = promisify(execFile);
  // 原本的 NODE_OPTIONS 已有 --test-reporter 時（例如這個測試本身由 pre-commit 執行），再加一個 node 會報錯，所以換成已知的值。
  // 這個測試的程序帶著 NODE_TEST_CONTEXT，裡面再跑的 node --test 會當自己是子程序，測試失敗也回 0，所以拿掉。
  const env: NodeJS.ProcessEnv = { ...process.env, NODE_OPTIONS: '--max-old-space-size=1024' };
  delete env.NODE_TEST_CONTEXT;
  for (const key of Object.keys(env)) if (key.toUpperCase().startsWith('GIT_')) delete env[key];
  const isolated = { cwd: root, env };
  const commit = ['-c', 'user.name=QualityTest', '-c', 'user.email=test@example.invalid', 'commit', '-m', 'probe'];
  await run('git', ['init', '-q'], isolated);
  // hook 只看 tools/ 與根目錄的 node_modules 在不在；邏輯（tools/hooks.ts）與分派表照真的複製，共用檢查換成什麼都不做的替身，不 stage。
  await mkdir(join(root, 'node_modules'));
  await mkdir(join(root, 'tools/node_modules'), { recursive: true });
  for (const name of ['hooks.ts', 'dispatch.ts']) {
    await writeFile(join(root, 'tools', name), await readFile(new URL('../tools/' + name, import.meta.url), 'utf8'));
  }
  for (const name of ['check-docs.ts', 'secretlint.mjs', 'check-local-paths.ts', 'check-skill-mirror.ts', 'check-plugin-imports.ts', 'roadmap-board.ts']) {
    await writeFile(join(root, 'tools', name), 'export {};\n');
  }
  await mkdir(join(root, '.githooks'));
  const hook = join(root, '.githooks/pre-commit');
  await writeFile(hook, (await readFile(new URL('../.githooks/pre-commit', import.meta.url), 'utf8')).replaceAll('\r\n', '\n'));
  await chmod(hook, 0o755);
  await run('git', ['config', 'core.hooksPath', '.githooks'], isolated);
  // Cards 的檢查在暫存內容的副本跑（§10）：package.json 與測試檔要 stage；都在分派表的 Cards 範圍（根目錄的 package.json、tests/）。
  const check = 'node -e "console.log(\'NODE_OPTIONS=\' + process.env.NODE_OPTIONS)" && node --test tests/probe.test.mjs';
  await writeFile(join(root, 'package.json'), JSON.stringify({ private: true, scripts: { check } }));
  const probe = "import test from 'node:test';\nvoid test('probe-pass', () => {});\n";
  await mkdir(join(root, 'tests'));
  await writeFile(join(root, 'tests/probe.test.mjs'), probe);
  await mkdir(join(root, 'src'));
  await writeFile(join(root, 'src/probe.ts'), 'export {};\n');
  await run('git', ['add', '--', 'package.json', 'tests/probe.test.mjs', 'src/probe.ts'], isolated);
  const passed = await run('git', commit, isolated);
  assert.match(passed.stdout + passed.stderr, /NODE_OPTIONS=--max-old-space-size=1024 --test-reporter=dot\n/);
  assert.doesNotMatch(passed.stdout + passed.stderr, /probe-pass/);
  await writeFile(join(root, 'tests/probe.test.mjs'), probe + "void test('probe-fail', () => { throw new Error('probe failure message'); });\n");
  await writeFile(join(root, 'src/probe.ts'), 'export const changed = 1;\n');
  await run('git', ['add', '--', 'tests/probe.test.mjs', 'src/probe.ts'], isolated);
  await assert.rejects(run('git', commit, isolated), (error: unknown) => {
    const { code, stdout, stderr } = error as { code: unknown; stdout: string; stderr: string };
    assert.equal(code, 1);
    assert.match(stdout + stderr, /probe failure message/);
    assert.doesNotMatch(stdout + stderr, /probe-pass/);
    return true;
  });
  assert.equal((await run('git', ['rev-list', '--count', 'HEAD'], isolated)).stdout.trim(), '1');
});
