// 金鑰掃描（secretlint，規則在 .secretlintrc.json）。預設掃所有追蹤的檔（npm run secretlint，npm run check 與 CI 用）；
// --staged 只掃這次暫存的檔，pre-commit 每次都跑，只改文件的 commit 也掃：repo 公開，規劃文件直接推上 main，CI 掃到時已經公開
// （第二次里程碑檢查 R4）。--staged 讀的是工作樹的內容：同一個檔只 stage 一部分時，沒 stage 的部分有金鑰也會擋（寧可多擋）。
// 列檔與設定一律以 repo 根為準：npm 在 tools/ 執行 script，照 CWD 只會掃到 tools/（D-208 第一步 §1）。
import { execFileSync } from 'node:child_process';
import { runSecretLint } from 'secretlint';

const root = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
const staged = process.argv.includes('--staged');
const list = staged ? ['diff', '--cached', '--name-only', '-z', '--diff-filter=ACMR'] : ['ls-files', '-z'];
const files = execFileSync('git', list, { cwd: root, encoding: 'utf8' }).split('\0').filter(p => p && !p.split('/').includes('node_modules') && p !== 'main.js');
if (files.length) {
  const result = await runSecretLint({
    cliOptions: { cwd: root, filePathOrGlobList: files, noGlob: true },
    engineOptions: { formatter: 'stylish', color: false, maskSecrets: true },
  });
  if (result.stdout) console.log(result.stdout);
  if (result.stderr) console.error(result.stderr);
  process.exitCode = result.exitStatus;
}
