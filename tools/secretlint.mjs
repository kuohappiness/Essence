// 金鑰掃描（secretlint，規則在 .secretlintrc.json）。預設掃所有追蹤的檔，內容讀工作樹（npm run secretlint，npm run check 與 CI 用）；
// --staged 只掃這次 commit 的檔，pre-commit 每次都跑，只改文件的 commit 也掃：repo 公開，規劃文件直接推上 main，CI 掃到時已經公開
// （第二次里程碑檢查 R4）。--staged 掃的是暫存區的內容（Git 給 hook 的索引；git commit <路徑>、-a 時是暫時的索引）：把索引裡的
// blob 照原樣寫進暫存資料夾，再照讀檔的模式掃，二進位檔的判斷和預設模式一樣。工作檔裡沒 stage 的修改（L2 R1）與 .gitattributes
// 的轉換（編碼、filter、換行、ident，L2 R7）都不影響結果。
// 列檔與設定一律以 repo 根為準：npm 在 tools/ 執行 script，照 CWD 只會掃到 tools/（D-208 第一步 §1）。
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, relative } from 'node:path';
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

const git = (args, input) => execFileSync('git', args, { cwd: root, input, maxBuffer: 1 << 28, stdio: ['pipe', 'pipe', 'pipe'] });

/**
 * 把這次 commit 的檔從索引照原樣寫進 copy，回傳寫出的路徑；讀不到或寫不出來時回傳 undefined（L2 R7）。直接讀 blob、不經過
 * checkout：.gitattributes 的轉換都不套用，filter 的指令也不會執行。symlink 寫成內容是目標的一般檔，不會指到副本外；
 * 子模組（gitlink）沒有內容，略過。
 */
function extract(copy) {
  try {
    const chosen = new Set(files);
    const entries = [];
    // ls-files -s：「<mode> <物件> <stage>\t<路徑>」。列整個索引再挑：路徑不當成 pathspec，* 與 : 不會被解讀。
    for (const entry of git(['ls-files', '-s', '-z']).toString('utf8').split('\0').filter(Boolean)) {
      const tab = entry.indexOf('\t');
      const [mode, object, stage] = entry.slice(0, tab).split(' ');
      const path = entry.slice(tab + 1);
      if (stage === '0' && mode !== '160000' && chosen.has(path)) entries.push({ path, object });
    }
    if (!entries.length) return [];
    const out = git(['cat-file', '--batch'], entries.map(entry => entry.object).join('\n') + '\n');
    let at = 0;
    for (const { path, object } of entries) {
      const end = out.indexOf(0x0a, at);
      const [, type, size] = out.subarray(at, end).toString('latin1').split(' ');
      if (type !== 'blob') throw new Error(`${path} 的物件 ${object} 不是 blob（${type}）`);
      // 索引裡的路徑 Git 已經擋過 ..，照樣確認寫在副本裡。
      const target = join(copy, path);
      const inside = relative(copy, target);
      if (!inside || isAbsolute(inside) || inside.split(/[\\/]/)[0] === '..') throw new Error(`${path} 不在 repo 裡`);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, out.subarray(end + 1, end + 1 + Number(size)));
      at = end + 1 + Number(size) + 1;
    }
    return entries.map(entry => entry.path);
  } catch (error) {
    console.error(`取不出暫存區的內容，沒有掃金鑰：${error.stderr?.toString().trim() || error.message}`);
    return undefined;
  }
}

if (files.length && !staged) await scan(root, files);
else if (files.length) {
  const copy = mkdtempSync(join(tmpdir(), 'essence-secretlint-'));
  try {
    const written = extract(copy);
    // 這次 commit 的檔都要掃，不照副本裡的 .gitignore 略過。
    if (!written) process.exitCode = 1;
    else if (written.length) await scan(copy, written, { shownAs: root, respectGitignore: false });
  } finally {
    rmSync(copy, { recursive: true, force: true, maxRetries: 5 });
  }
}
