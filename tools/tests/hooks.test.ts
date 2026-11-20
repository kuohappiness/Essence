// 乾淨 checkout 的 hook（tasks/one-repo-step-1.md §3、驗收 2）。
// git clone --no-local 拿到的是 commit 過的版本：這個測試把工作樹裡要驗的 hook 與工具明確複製進 clone，連同替身在 clone 裡
// commit 一次（這時還沒安裝 hook，不經過 hook），再在 clone 的 tools/ 跑安裝入口（npm run prepare：preprepare 換回 LF、
// prepare 設 core.hooksPath）。乾淨的 clone 不繼承 core.hooksPath，所以記號檔出現就表示 hook 真的有跑。
// tools/node_modules 借本 repo 那份（Windows 用 junction、Linux 用 symlink），清理前先拆連結，不會碰到本 repo 的 node_modules。
// 替身：三個外掛的 check 與共用工具的 self-check 換成寫記號檔的 mark.mjs（ESSENCE_FAIL 指定的會回非零）；Cards 與共用工具的測試
// 換成空檔，只留一個讀轉錄稿格式的替身。
import test from 'node:test';
import assert from 'node:assert/strict';
import { exec, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { access, appendFile, copyFile, mkdir, mkdtemp, readdir, readFile, rm, symlink, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CARDS } from '../dispatch.ts';

const run = promisify(execFile);
const shell = promisify(exec);
const SOURCE = fileURLToPath(new URL('../..', import.meta.url));
const TOOLS_MODULES = join(SOURCE, 'tools/node_modules');
// Cards 的資料夾照分派表（D-208 第二步 §A6）：替身放在那裡，不靠 clone 的版面（hook 裡 clone 的是 HEAD，搬家的 commit 時還是舊的）。
const C = CARDS === '.' ? '' : CARDS + '/';
const WHERE = CARDS === '.' ? '根目錄' : C;
const UP = C.split('/').filter(Boolean).map(() => '../').join('');
const escaped = (text: string) => text.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
// 路徑拆開寫：分派表照路徑字串找相關測試，寫成一整串會讓改那份文件時也跑這個測試。
const SYNTAX = 'docs/' + 'syntax.md';
const PRODUCT = 'docs/' + 'product.md';
const SKILL = 'code-quality/' + 'SKILL.md';
const SKILL_COPIES = ['.claude/skills', '.agents/skills'];
/** 從工作樹複製進 clone 的：hook 與共用檢查的工具（這次要驗的版本）。 */
const COPIED = [
  '.githooks/pre-commit', '.githooks/pre-merge-commit', '.githooks/commit-msg', '.secretlintrc.json', 'tools/package.json',
  'tools/hooks.ts', 'tools/dispatch.ts', 'tools/check-docs.ts', 'tools/secretlint.mjs', 'tools/check-local-paths.ts',
  'tools/check-skill-mirror.ts', 'tools/check-plugin-imports.ts', 'tools/roadmap-board.ts', 'tools/progress-board-data.ts',
];
const USER = ['-c', 'user.name=HookTest', '-c', 'user.email=test@example.invalid'];

// 外掛的資料夾裡有 flag.txt 時連內容一起記，內容是 bad 就失敗：看得出檢查讀的是暫存區還是工作樹（§10）。
const MARK = `import { appendFileSync, existsSync, readFileSync } from 'node:fs';
const [name] = process.argv.slice(2);
const flag = existsSync('flag.txt') ? ':' + readFileSync('flag.txt', 'utf8').trim() : '';
appendFileSync(String(process.env.ESSENCE_MARKS), name + flag + '\\n');
if (process.env.ESSENCE_FAIL === name || flag === ':bad') {
  console.error(name + ' 的替身照設定失敗');
  process.exit(1);
}
`;

interface Result { ok: boolean; out: string; marks: string[] }

async function clone(t: test.TestContext) {
  const root = await mkdtemp(join(tmpdir(), 'essence-hook-clone-'));
  const repo = join(root, 'repo');
  const linked = join(root, 'linked');
  const marks = join(root, 'marks.txt');
  // hook 的暫存資料夾（暫存內容的副本放這裡，§10）：每次 commit 後要清空。
  const temp = join(root, 'temp');
  await mkdir(temp);
  const links: string[] = [];
  t.after(async () => {
    for (const link of links) await unlink(link).catch(() => undefined);
    await rm(root, { recursive: true, force: true });
  });
  const env: NodeJS.ProcessEnv = { ...process.env, ESSENCE_MARKS: marks, TEMP: temp, TMP: temp, TMPDIR: temp };
  for (const key of Object.keys(env)) if (key.toUpperCase().startsWith('GIT_')) delete env[key];
  // 本檔由 node --test 執行時帶著這兩個：hook 裡再跑的 node --test 會當自己是子程序（失敗也回 0），dot reporter 也會重複加。
  delete env.NODE_TEST_CONTEXT;
  delete env.NODE_OPTIONS;
  const git = async (cwd: string, ...args: string[]) => (await run('git', [...USER, ...args], { cwd, env, encoding: 'utf8' })).stdout.trim();

  await run('git', ['clone', '-q', '--no-local', SOURCE, repo], { cwd: root, env });
  // 已經存在的 linked worktree：在還沒換上新的 hook 之前就建好，之後切到新的分支。
  await git(repo, 'worktree', 'add', '-q', '-b', 'old', linked);

  // 要驗的 hook 與工具、替身，在 clone 裡 commit 成一個基準。
  for (const path of COPIED) {
    await mkdir(dirname(join(repo, path)), { recursive: true });
    await copyFile(join(SOURCE, path), join(repo, path));
  }
  await writeFile(join(repo, 'mark.mjs'), MARK);
  // Cards 的 package.json 用這次要驗的那份（有相依，沒裝時 hook 要擋），check 換成記號。
  const pkg = JSON.parse(await readFile(join(SOURCE, C, 'package.json'), 'utf8')) as { scripts: Record<string, string> };
  pkg.scripts.check = `node ${UP}mark.mjs cards`;
  await mkdir(join(repo, C), { recursive: true });
  await writeFile(join(repo, C, 'package.json'), JSON.stringify(pkg, null, 2) + '\n');
  for (const plugin of ['capture', 'mindboard']) {
    await mkdir(join(repo, 'plugins', plugin), { recursive: true });
    await writeFile(join(repo, 'plugins', plugin, 'package.json'), JSON.stringify({ name: `essence-${plugin}`, private: true, scripts: { check: `node ../../mark.mjs ${plugin}` } }, null, 2) + '\n');
  }
  // 共用工具的完整檢查（第二步 §A2）也換成記號。
  const toolsPkg = JSON.parse(await readFile(join(repo, 'tools/package.json'), 'utf8')) as { scripts: Record<string, string> };
  toolsPkg.scripts['self-check'] = 'node ../mark.mjs tools';
  await writeFile(join(repo, 'tools/package.json'), JSON.stringify(toolsPkg, null, 2) + '\n');
  for (const path of (await git(repo, 'ls-files', '-z', '--', 'tests', `${C}tests`, 'tools/tests')).split('\0').filter(path => path.endsWith('.test.ts'))) {
    await writeFile(join(repo, path), 'export {};\n');
  }
  await mkdir(join(repo, C, 'tests'), { recursive: true });
  await writeFile(join(repo, C, 'tests/syntax-stub.test.ts'), [
    `// 讀 ${SYNTAX} 的測試替身`,
    "import { appendFileSync } from 'node:fs';",
    "appendFileSync(String(process.env.ESSENCE_MARKS), 'cards-related\\n');",
    "if (process.env.ESSENCE_FAIL === 'cards-related') process.exit(1);",
    '',
  ].join('\n'));
  await git(repo, 'add', '--', '.');
  await git(repo, 'commit', '-q', '-m', 'hook test base');
  const base = await git(repo, 'rev-parse', 'HEAD');

  // 安裝入口：tools/ 的 prepare（npm 自動先跑 preprepare）。
  await shell('npm run prepare', { cwd: join(repo, 'tools'), env });
  assert.equal(await git(repo, 'config', 'core.hooksPath'), '.githooks');
  const borrow = async (at: string) => {
    const link = join(at, 'tools/node_modules');
    await symlink(TOOLS_MODULES, link, 'junction');
    links.push(link);
    return link;
  };
  const toolsLink = await borrow(repo);

  const commit = async (args: string[], { cwd = repo, fail }: { cwd?: string; fail?: string } = {}): Promise<Result> => {
    await writeFile(marks, '');
    let ok = true;
    let out = '';
    try {
      const done = await run('git', [...USER, 'commit', '-q', ...args], { cwd, env: { ...env, ESSENCE_FAIL: fail ?? '' }, encoding: 'utf8' });
      out = done.stdout + done.stderr;
    } catch (error) {
      const e = error as { stdout?: string; stderr?: string };
      ok = false;
      out = (e.stdout ?? '') + (e.stderr ?? '');
    }
    // 副本清掉了，借來的相依還在（清理沒有順著連結刪進去）。
    assert.deepEqual((await readdir(temp)).filter(name => name.startsWith('essence-staged-')), [], out);
    await access(join(TOOLS_MODULES, 'markdown-it'));
    return { ok, out, marks: (await readFile(marks, 'utf8')).split('\n').filter(Boolean).sort() };
  };
  const put = async (path: string, text: string, at = repo) => {
    await mkdir(dirname(join(at, path)), { recursive: true });
    await writeFile(join(at, path), text);
  };
  return { root, repo, linked, base, env, git, commit, put, borrow, toolsLink };
}

/** 最後那行：每個外掛跑了什麼、照表跳過的理由。 */
const lastLine = (out: string) => out.trim().split('\n').filter(line => line.startsWith('分派表：')).at(-1) ?? '';

void test('§3 乾淨 clone 的 hook：D-208 的五種情況照分派表跑，跳過的都寫理由', async t => {
  const c = await clone(t);
  const { repo, git, commit, put } = c;

  // 1. 只改 Mindboard：Cards 的資料夾沒有 node_modules 也能 commit。
  await assert.rejects(access(join(repo, C, 'node_modules')), { code: 'ENOENT' });
  await put('plugins/mindboard/src/a.ts', 'export const a = 1;\n');
  await put('plugins/mindboard/src/b.ts', 'export const b = 1;\n');
  await git(repo, 'add', '--', 'plugins/mindboard/src');
  let r = await commit(['-m', 'mindboard only']);
  assert.ok(r.ok, r.out);
  assert.deepEqual(r.marks, ['mindboard']);
  assert.match(lastLine(r.out), /^分派表：共用檢查通過；共用工具：照分派表跳過（這次改的路徑都不是它的：plugins\/mindboard\/src\/a\.ts、plugins\/mindboard\/src\/b\.ts）；Cards：照分派表跳過（這次改的路徑都不是它的：plugins\/mindboard\/src\/a\.ts、plugins\/mindboard\/src\/b\.ts）；Capture：照分派表跳過（.+）；Mindboard：完整檢查（改到 plugins\/mindboard\/src\/a\.ts、plugins\/mindboard\/src\/b\.ts）通過$/);
  await assert.rejects(access(join(repo, C, 'node_modules')), { code: 'ENOENT' });

  // 2. 只改 Cards：Cards 的資料夾沒有 node_modules 擋下，裝過（空的 node_modules）才跑。
  await put(`${C}src/hook-probe.ts`, 'export const probe = 1;\n');
  await git(repo, 'add', '--', `${C}src/hook-probe.ts`);
  r = await commit(['-m', 'cards only']);
  assert.equal(r.ok, false);
  assert.match(r.out, new RegExp(`Cards 要檢查，先在${escaped(WHERE)}執行 npm ci`));
  assert.deepEqual(r.marks, []);
  await mkdir(join(repo, C, 'node_modules'));
  await writeFile(join(repo, C, 'node_modules/keep.txt'), '副本借用時不能被刪\n');
  r = await commit(['-m', 'cards only']);
  assert.ok(r.ok, r.out);
  assert.deepEqual(r.marks, ['cards']);
  await access(join(repo, C, 'node_modules/keep.txt'));
  assert.match(lastLine(r.out), new RegExp(`Capture：照分派表跳過（這次改的路徑都不是它的：${escaped(C)}src/hook-probe\\.ts）；Mindboard：照分派表跳過（`));

  // 3. 改轉錄稿格式：Cards 跑讀到它的測試，Capture 完整檢查。
  await appendFile(join(repo, SYNTAX), '\n');
  await git(repo, 'add', '--', SYNTAX);
  r = await commit(['-m', 'syntax']);
  assert.ok(r.ok, r.out);
  assert.deepEqual(r.marks, ['capture', 'cards-related']);
  assert.match(lastLine(r.out), /Cards：相關測試（寫到 docs\/syntax\.md 的 1 個測試檔）通過；Capture：完整檢查（改到 docs\/syntax\.md）通過；Mindboard：照分派表跳過/);

  // 4. 刪檔。
  await git(repo, 'rm', '-q', '--', 'plugins/mindboard/src/a.ts');
  r = await commit(['-m', 'delete']);
  assert.ok(r.ok, r.out);
  assert.deepEqual(r.marks, ['mindboard']);

  // 5. 跨外掛改名：兩邊都跑。
  await mkdir(join(repo, 'plugins/capture/src'), { recursive: true });
  await git(repo, 'mv', 'plugins/mindboard/src/b.ts', 'plugins/capture/src/b.ts');
  r = await commit(['-m', 'move']);
  assert.ok(r.ok, r.out);
  assert.deepEqual(r.marks, ['capture', 'mindboard']);

  // 6. 只改共用工具（第 7 條）：只跑共用工具的完整檢查，三個外掛都跳過（第二步 §A3）。
  await appendFile(join(repo, 'tools/check-docs.ts'), '\n// 探針\n');
  await git(repo, 'add', '--', 'tools/check-docs.ts');
  r = await commit(['-m', 'shared tool']);
  assert.ok(r.ok, r.out);
  assert.deepEqual(r.marks, ['tools']);
  assert.match(lastLine(r.out), /共用工具：完整檢查（改到 tools\/check-docs\.ts）通過；Cards：照分派表跳過/);

  // 外掛的檢查失敗就擋下，commit 不會進去。
  const head = await git(repo, 'rev-parse', 'HEAD');
  await put('plugins/mindboard/src/fail.ts', 'export const f = 1;\n');
  await git(repo, 'add', '--', 'plugins/mindboard/src/fail.ts');
  r = await commit(['-m', 'fail'], { fail: 'mindboard' });
  assert.equal(r.ok, false);
  assert.match(r.out, /mindboard 的替身照設定失敗/);
  assert.equal(await git(repo, 'rev-parse', 'HEAD'), head);
  await git(repo, 'rm', '-q', '--cached', '--', 'plugins/mindboard/src/fail.ts');
});

void test('§3 乾淨 clone 的 hook：子資料夾、git commit <路徑>、-a、skill 只 stage 一份、linked worktree、缺 tools 的相依', async t => {
  const c = await clone(t);
  const { repo, linked, base, git, commit, put } = c;

  // 從外掛的資料夾裡 commit。
  await put('plugins/mindboard/src/c.ts', 'export const c = 1;\n');
  await git(join(repo, 'plugins/mindboard'), 'add', '--', 'src/c.ts');
  let r = await commit(['-m', 'from subfolder'], { cwd: join(repo, 'plugins/mindboard') });
  assert.ok(r.ok, r.out);
  assert.deepEqual(r.marks, ['mindboard']);

  // §10：外掛的檢查在只有暫存內容的副本跑。工作樹裡沒 stage 的改動，不會讓檢查通過，也不會讓它擋下。
  await put('plugins/mindboard/flag.txt', 'bad\n');
  await git(repo, 'add', '--', 'plugins/mindboard/flag.txt');
  await put('plugins/mindboard/flag.txt', 'good\n');
  r = await commit(['-m', 'staged bad']);
  assert.equal(r.ok, false);
  assert.deepEqual(r.marks, ['mindboard:bad']);
  await put('plugins/mindboard/flag.txt', 'staged\n');
  await git(repo, 'add', '--', 'plugins/mindboard/flag.txt');
  await put('plugins/mindboard/flag.txt', 'bad\n');
  r = await commit(['-m', 'staged good']);
  assert.ok(r.ok, r.out);
  assert.deepEqual(r.marks, ['mindboard:staged']);

  // git commit -- <路徑>：Capture 已經 stage 了，只照這次 commit 的路徑分派。副本照這次 commit 用的暫時索引取出：
  // flag.txt 是 HEAD 的 staged，不是工作樹的 bad。
  await put('plugins/capture/src/d.ts', 'export const d = 1;\n');
  await git(repo, 'add', '--', 'plugins/capture/src/d.ts');
  await put('plugins/mindboard/src/c.ts', 'export const c = 2;\n');
  r = await commit(['-m', 'only path', '--', 'plugins/mindboard/src/c.ts']);
  assert.ok(r.ok, r.out);
  assert.deepEqual(r.marks, ['mindboard:staged']);
  r = await commit(['-m', 'pre-staged capture']);
  assert.ok(r.ok, r.out);
  assert.deepEqual(r.marks, ['capture']);

  // git commit -a：沒 stage 的改動也照分派表，副本也有它們。
  await put('plugins/capture/src/d.ts', 'export const d = 2;\n');
  await put('plugins/mindboard/flag.txt', 'all\n');
  r = await commit(['-a', '-m', 'all']);
  assert.ok(r.ok, r.out);
  assert.deepEqual(r.marks, ['capture', 'mindboard:all']);

  // 相關測試照這次 commit 的內容選（L2 R2）。寫到轉錄稿格式的測試替身在暫存區，工作樹裡改成沒寫到：照樣選到、跑了。
  // Cards 要跑：放一個空的 node_modules 當作裝過。
  await mkdir(join(repo, C, 'node_modules'));
  const stub = `${C}tests/syntax-stub.test.ts`;
  const stubText = await readFile(join(repo, stub), 'utf8');
  await put(stub, 'export {};\n');
  await appendFile(join(repo, SYNTAX), '\n');
  await git(repo, 'add', '--', SYNTAX);
  r = await commit(['-m', 'syntax, stub changed only in the working tree']);
  assert.ok(r.ok, r.out);
  assert.deepEqual(r.marks, ['capture', 'cards-related']);
  await put(stub, stubText);
  // 工作樹新加、沒 stage 的測試寫到這次改的文件：不選它（副本裡沒有它，選到就會擋下可以 commit 的文件）。
  await put(`${C}tests/unstaged.test.ts`, `// ${PRODUCT}\nprocess.exit(1);\n`);
  await appendFile(join(repo, PRODUCT), '\n');
  await git(repo, 'add', '--', PRODUCT);
  r = await commit(['-m', 'product, unstaged test']);
  assert.ok(r.ok, r.out);
  assert.deepEqual(r.marks, []);
  assert.match(lastLine(r.out), /Cards：照分派表跳過（沒有測試寫到 docs\/product\.md）/);
  await rm(join(repo, C, 'tests/unstaged.test.ts'));

  // 只 stage 一份 skill、工作樹的兩份剛好一致：共用檢查讀暫存區，擋下。
  for (const copy of SKILL_COPIES) await appendFile(join(repo, copy, SKILL), '\n補一行。\n');
  await git(repo, 'add', '--', `${SKILL_COPIES[0]}/${SKILL}`);
  r = await commit(['-m', 'one skill copy']);
  assert.equal(r.ok, false);
  assert.match(r.out, /內容不同：code-quality\/SKILL\.md/);
  await git(repo, 'add', '--', `${SKILL_COPIES[1]}/${SKILL}`);
  r = await commit(['-m', 'both skill copies']);
  assert.ok(r.ok, r.out);
  assert.deepEqual(r.marks, []);
  assert.match(lastLine(r.out), /Cards：照分派表跳過（沒有測試寫到 /);

  // 已經存在的 linked worktree 切到新的分支：hook 照跑（core.hooksPath 是相對的，讀那個 worktree 自己的 .githooks）。
  await git(linked, 'checkout', '-q', '-b', 'new', base);
  await c.borrow(linked);
  await put('plugins/mindboard/src/w.ts', 'export const w = 1;\n', linked);
  await git(linked, 'add', '--', 'plugins/mindboard/src/w.ts');
  r = await commit(['-m', 'linked'], { cwd: linked });
  assert.ok(r.ok, r.out);
  assert.deepEqual(r.marks, ['mindboard']);

  // core.hooksPath 被改成另一個 checkout 的絕對路徑（平台事實：開 worktree 的工具會這樣改）：轉給這個 worktree 自己的 hook。
  // hook 從工作樹的根執行，所以 linked 自己的 hook 用 mark.mjs 的相對路徑；有記號就表示跑的是 linked 那份（工作樹裡改過、和 repo 的不同）。
  await git(repo, 'config', 'core.hooksPath', join(repo, '.githooks').replaceAll('\\', '/'));
  const own = join(linked, '.githooks/pre-commit');
  const original = await readFile(own, 'utf8');
  const marked = original.replace('set -eu\n', 'set -eu\nnode mark.mjs own-hook\n');
  assert.notEqual(marked, original);
  await writeFile(own, marked);
  await put('plugins/mindboard/src/w.ts', 'export const w = 2;\n', linked);
  await git(linked, 'add', '--', 'plugins/mindboard/src/w.ts');
  r = await commit(['-m', 'delegated'], { cwd: linked });
  assert.ok(r.ok, r.out);
  assert.deepEqual(r.marks, ['mindboard', 'own-hook']);
  await writeFile(own, original);
  await git(repo, 'config', 'core.hooksPath', '.githooks');

  // 沒有 tools/node_modules：擋下，說在 tools/ 執行 npm ci。
  await unlink(c.toolsLink);
  await put('plugins/mindboard/src/e.ts', 'export const e = 1;\n');
  await git(repo, 'add', '--', 'plugins/mindboard/src/e.ts');
  r = await commit(['-m', 'no tools']);
  assert.equal(r.ok, false);
  assert.match(r.out, /先在 tools\/ 執行 npm ci/);
  assert.deepEqual(r.marks, []);
});
