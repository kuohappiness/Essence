// 金鑰掃描（secretlint，規則在 .secretlintrc.json）。預設掃所有追蹤的檔，內容讀工作樹（npm run secretlint，npm run check 與 CI 用）；
// --staged 只掃這次 commit 的檔，pre-commit 每次都跑，只改文件的 commit 也掃：repo 公開，規劃文件直接推上 main，CI 掃到時已經公開
// （第二次里程碑檢查 R4）。--staged 掃的是暫存區的內容（Git 給 hook 的索引；git commit <路徑>、-a 時是暫時的索引）：用
// git checkout-index 取到暫存資料夾，再照讀檔的模式掃，二進位檔的判斷和預設模式一樣。工作檔裡沒 stage 的修改不影響結果（L2 R1）。
// 列檔與設定一律以 repo 根為準：npm 在 tools/ 執行 script，照 CWD 只會掃到 tools/（D-208 第一步 §1）。
import { execFileSync } from 'node:child_process';
import { lstatSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runSecretLint } from 'secretlint';

const root = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
const staged = process.argv.includes('--staged');
const wanted = path => path && !path.split('/').includes('node_modules') && path !== 'main.js';
// 型別變更（T，例如 symlink 換成一般檔）也是這次 commit 的新內容。
const list = staged ? ['diff', '--cached', '--name-only', '-z', '--diff-filter=ACMRT'] : ['ls-files', '-z'];
const files = execFileSync('git', list, { cwd: root, encoding: 'utf8' }).split('\0').filter(wanted);

/** 掃 cwd 底下的 files；輸出裡的 cwd 換成 shownAs（暫存資料夾的路徑換回 repo 根）。 */
async function scan(cwd, paths, { shownAs = cwd, respectGitignore } = {}) {
  const result = await runSecretLint({
    cliOptions: { cwd, filePathOrGlobList: paths, noGlob: true, ...(respectGitignore === undefined ? {} : { respectGitignore }) },
    engineOptions: { cwd: root, formatter: 'stylish', color: false, maskSecrets: true },
  });
  // Windows 上輸出的路徑是 / 分隔，暫存資料夾的路徑是 \ 分隔：兩種都換。
  const show = text => (cwd === shownAs ? text : text.replaceAll(cwd, shownAs).replaceAll(cwd.replaceAll('\\', '/'), shownAs));
  if (result.stdout) console.log(show(result.stdout));
  if (result.stderr) console.error(show(result.stderr));
  process.exitCode = result.exitStatus;
}

/** 照暫存區取出到 copy：autocrlf 關掉，拿到 commit 的位元組；symlink 寫成內容是目標的一般檔，不會指到副本外。 */
function checkout(copy) {
  try {
    execFileSync('git', ['-c', 'core.autocrlf=false', '-c', 'core.symlinks=false', 'checkout-index', `--prefix=${copy.replaceAll('\\', '/')}/`, '-z', '--stdin'], {
      cwd: root, input: files.join('\0') + '\0', stdio: ['pipe', 'ignore', 'pipe'],
    });
    return true;
  } catch (error) {
    console.error(`取不出暫存區的內容，沒有掃金鑰：${error.stderr?.toString().trim() || error.message}`);
    return false;
  }
}

if (files.length && !staged) await scan(root, files);
else if (files.length) {
  const copy = mkdtempSync(join(tmpdir(), 'essence-secretlint-'));
  try {
    if (!checkout(copy)) process.exitCode = 1;
    else {
      // 子模組（gitlink）沒有內容可掃。這次 commit 的檔都要掃，不照副本裡的 .gitignore 略過。
      const present = files.filter(path => {
        try { return lstatSync(join(copy, path)).isFile(); } catch { return false; }
      });
      if (present.length) await scan(copy, present, { shownAs: root, respectGitignore: false });
    }
  } finally {
    rmSync(copy, { recursive: true, force: true, maxRetries: 5 });
  }
}
