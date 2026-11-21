// D-208 第二步 L2 R2：命令列給的相對路徑，經 `npm run <script>` 執行時照叫 npm 的資料夾算，
// 從 repo 根用 `npm --prefix apps/Cards run …` 和搬家前從根目錄跑的結果相同；其他情況照目前的資料夾。
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, readdir, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';
import { cliPath } from '../tools/cli-path.ts';

const run = promisify(execFile);

void test('L2 R2 cliPath：npm run 的是這支工具的 script 才照 INIT_CWD；別的 script 的子程序、直接執行照目前的資料夾；絕對路徑不變', () => {
  const cwd = resolve('/repo/apps/Cards');
  const root = resolve('/repo');
  const env = (event?: string, init?: string): NodeJS.ProcessEnv => ({ ...(event ? { npm_lifecycle_event: event } : {}), ...(init ? { INIT_CWD: init } : {}) });
  assert.equal(cliPath('vault', 'backup', env('backup', root), cwd), join(root, 'vault'));
  assert.equal(cliPath('../x/vault', 'backup', env('backup', root), cwd), resolve(root, '../x/vault'));
  // npm test 底下的測試再叫工具：INIT_CWD 是繼承來的，不是這支工具的 npm run。
  assert.equal(cliPath('vault', 'backup', env('test', root), cwd), join(cwd, 'vault'));
  assert.equal(cliPath('vault', 'backup', env(undefined, root), cwd), join(cwd, 'vault'));
  assert.equal(cliPath('vault', 'backup', env('backup'), cwd), join(cwd, 'vault'));
  const absolute = resolve('/elsewhere/vault');
  assert.equal(cliPath(absolute, 'backup', env('backup', root), cwd), absolute);
});

void test('L2 R2 cliPath：真的 npm（--prefix 從上層、在套件裡、套件的另一個 script 再叫一次）', async t => {
  const top = await realpath(await mkdtemp(join(tmpdir(), 'essence-cli-path-')));
  t.after(() => rm(top, { recursive: true, force: true }));
  const pkg = join(top, 'apps/Cards');
  await mkdir(pkg, { recursive: true });
  const helper = pathToFileURL(resolve(import.meta.dirname, '../tools/cli-path.ts')).href;
  await writeFile(join(pkg, 'probe.mjs'), `import { cliPath } from ${JSON.stringify(helper)};\nconsole.log('PATH=' + cliPath(process.argv[2], 'probe'));\n`);
  await writeFile(join(pkg, 'outer.mjs'), "import { execFileSync } from 'node:child_process';\nprocess.stdout.write(execFileSync(process.execPath, ['probe.mjs', 'vault'], { encoding: 'utf8' }));\n");
  await writeFile(join(pkg, 'package.json'), JSON.stringify({ name: 'probe', private: true, scripts: { probe: 'node probe.mjs', outer: 'node outer.mjs' } }));
  const npm = async (cwd: string, args: string[]): Promise<string> => {
    const env = { ...process.env };
    delete env.npm_lifecycle_event; delete env.INIT_CWD;
    const { stdout } = await run(process.platform === 'win32' ? 'npm.cmd' : 'npm', args, { cwd, env, encoding: 'utf8', shell: process.platform === 'win32' });
    const line = stdout.split(/\r?\n/).find(text => text.startsWith('PATH='));
    assert.ok(line, stdout);
    return line.slice('PATH='.length);
  };
  assert.equal(await npm(top, ['--prefix', 'apps/Cards', 'run', 'probe', '--', 'vault']), join(top, 'vault'));
  assert.equal(await npm(pkg, ['run', 'probe', '--', 'vault']), join(pkg, 'vault'));
  assert.equal(await npm(top, ['--prefix', 'apps/Cards', 'run', 'outer']), join(pkg, 'vault'));
});

// 第二步 L2 第二輪：空字串不能變成「目前的資料夾」（搬家前 realpath('') 報 ENOENT；呼叫的腳本把空變數加引號傳進來時會碰到）。
// 明寫的 `.` 照舊是目前的資料夾。
void test('L2 第二輪 cliPath：空字串的路徑丟錯，`.` 照舊', () => {
  const cwd = resolve('/repo/apps/Cards');
  assert.throws(() => cliPath('', 'backup', {}, cwd), /空的/);
  assert.throws(() => cliPath('', 'backup', { npm_lifecycle_event: 'backup', INIT_CWD: resolve('/repo') }, cwd), /空的/);
  assert.equal(cliPath('.', 'backup', {}, cwd), cwd);
});

void test('L2 第二輪：install-vault、backup 的命令列給空字串的 vault 就停下，資料夾裡什麼都沒寫', async t => {
  const dir = await realpath(await mkdtemp(join(tmpdir(), 'essence-cli-empty-')));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const tools = resolve(import.meta.dirname, '../tools');
  const env = { ...process.env };
  delete env.npm_lifecycle_event; delete env.INIT_CWD;
  for (const args of [[join(tools, 'install-vault.mjs'), '', '--release', '9.9.9'], [join(tools, 'backup.ts'), '', '--to', 'out']]) {
    await assert.rejects(run(process.execPath, args, { cwd: dir, env, encoding: 'utf8' }), (error: { stderr: string }) => /空的/.test(error.stderr), args[0]);
    assert.deepEqual(await readdir(dir), [], args[0]);
  }
});
