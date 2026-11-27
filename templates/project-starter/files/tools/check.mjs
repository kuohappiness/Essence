// 提交前與 CI 都跑的檢查（docs/agents/quality.md〈檢查指令〉）。只用 Node 內建的模組，Node 20 以上直接跑，不用安裝套件。
// 用法：
//   node tools/check.mjs            看整個 repo（git 追蹤的檔，內容讀工作樹；CI 用）
//   node tools/check.mjs --staged   只看暫存區（這次 commit 的內容；.githooks/pre-commit 用）
// 查四件事，擋下時寫出哪個檔、哪一行、怎麼修，以 exit code 1 結束：
//   1. 金鑰：常見的金鑰樣式與 .env 檔。--staged 只掃這次 commit 新增或改到的檔。
//   2. 還沒填的空格：數「待填」記號的個數。SETUP.md 還在時只報數字、不擋；SETUP.md 刪掉之後還有空格就擋。
//   3. 連到不存在的檔：Markdown 的相對連結，目標檔或資料夾要在；錨點不查。
//   4. git hook 的執行權限：.githooks/ 底下每一支在 git 裡都要是可執行的模式（100755）。
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { posix } from 'node:path';

const staged = process.argv.includes('--staged');
const git = (args, input) => execFileSync('git', ['-c', 'core.quotepath=false', ...args], {
  input, maxBuffer: 1 << 28, stdio: ['pipe', 'pipe', 'pipe'],
});
const root = git(['rev-parse', '--show-toplevel']).toString('utf8').trim();

// 記號分兩段寫，這支程式自己才不會被算成一個空格。
const PLACEHOLDER = '【待填' + '：';

/** 金鑰的樣式：名稱與正規式。測試裡的假金鑰在執行時才組出來，不寫成字面。 */
const SECRETS = [
  ['私鑰', /-----BEGIN (?:[A-Z0-9]+ )*PRIVATE KEY-----/],
  ['GitHub 權杖', /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{50,})/],
  ['AWS 存取金鑰', /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/],
  ['Anthropic 金鑰', /\bsk-ant-[A-Za-z0-9_-]{20,}/],
  ['OpenAI 金鑰', /\bsk-(?!ant-)(?:proj-|svcacct-|admin-)?[A-Za-z0-9_-]{20,}/],
  ['Google API 金鑰', /\bAIza[0-9A-Za-z_-]{35}/],
  ['Slack 權杖', /\bxox[abposr]-[A-Za-z0-9-]{10,}/],
  ['Slack webhook', /hooks\.slack\.com\/services\/T[A-Za-z0-9]+\/B[A-Za-z0-9]+\/[A-Za-z0-9]+/],
];
/** .env、.env.local 這類放金鑰的檔；範本（.env.example、.env.sample、.env.template）可以進 repo。 */
const isEnvFile = (path) => /^\.env(?:\..+)?$/.test(posix.basename(path)) && !/^\.env\.(?:example|sample|template)$/.test(posix.basename(path));

/** git 裡的檔：路徑、模式、內容（讀不到或是子模組時是 undefined）。 */
function listFiles() {
  const entries = git(['ls-files', '-s', '-z']).toString('utf8').split('\0').filter(Boolean).map((entry) => {
    const tab = entry.indexOf('\t');
    const [mode, object] = entry.slice(0, tab).split(' ');
    return { path: entry.slice(tab + 1), mode, object };
  });
  // 合併衝突時同一個路徑有好幾個 stage，只留一個。
  const seen = new Set();
  const files = entries.filter((entry) => !seen.has(entry.path) && seen.add(entry.path));
  const blobs = files.filter((file) => file.mode !== '160000');
  let read;
  if (staged) {
    const texts = new Map();
    if (blobs.length) {
      const out = git(['cat-file', '--batch'], blobs.map((file) => file.object).join('\n') + '\n');
      let at = 0;
      for (const file of blobs) {
        const end = out.indexOf(0x0a, at);
        const size = Number(out.subarray(at, end).toString('latin1').split(' ')[2]);
        texts.set(file.path, out.subarray(end + 1, end + 1 + size));
        at = end + 1 + size + 1;
      }
    }
    read = (path) => texts.get(path);
  } else {
    read = (path) => {
      try { return readFileSync(posix.join(root, path)); } catch { return undefined; }
    };
  }
  return files.map((file) => {
    const bytes = file.mode === '160000' ? undefined : read(file.path);
    const binary = !bytes || bytes.subarray(0, 8000).includes(0);
    return { ...file, text: binary ? undefined : bytes.toString('utf8') };
  });
}

/** 這次 commit 新增或改到的檔（--staged 用；第一個 commit 沒有 HEAD 時是全部）。 */
function changedPaths() {
  return new Set(git(['diff', '--cached', '--name-only', '-z', '--diff-filter=ACMRT']).toString('utf8').split('\0').filter(Boolean));
}

/** Markdown 裡的程式碼不算：```、~~~ 區塊整段換成空行，`行內程式碼` 換成空白，行號不變。 */
function stripCode(text) {
  let fence = '';
  return text.split('\n').map((line) => {
    const mark = /^\s{0,3}(`{3,}|~{3,})/.exec(line)?.[1];
    if (fence) {
      if (mark && mark[0] === fence[0] && mark.length >= fence.length) fence = '';
      return '';
    }
    if (mark) {
      fence = mark;
      return '';
    }
    return line.replace(/(`+)[^`]*?\1/g, (match) => ' '.repeat(match.length));
  });
}

/** 一行裡的連結目標：[文字](目標)、![圖](目標)、[文字](<有空白的目標>)，與參考式的 [名稱]: 目標。目標裡可以有成對的括號（guide(v1).md）。 */
function linkTargets(line) {
  const targets = [];
  for (const match of line.matchAll(/\]\(\s*(<[^>]*>|(?:[^()\s]|\([^()\s]*\))+)(?:\s+["'(][^)]*)?\)/g)) targets.push(match[1]);
  const reference = /^\s{0,3}\[[^\]]+\]:\s*(<[^>]*>|\S+)/.exec(line);
  if (reference) targets.push(reference[1]);
  return targets.map((target) => target.replace(/^<|>$/g, ''));
}

const problems = [];
const add = (file, line, what, fix) => problems.push(`${file}${line ? `:${line}` : ''}  ${what}。${fix}`);

const files = listFiles();
const paths = new Set(files.map((file) => file.path));
const dirs = new Set();
for (const path of paths) for (let at = path.indexOf('/'); at > 0; at = path.indexOf('/', at + 1)) dirs.add(path.slice(0, at));

// 1. 金鑰
const scanned = staged ? changedPaths() : paths;
for (const file of files) {
  if (!scanned.has(file.path)) continue;
  if (isEnvFile(file.path)) add(file.path, 0, '.env 檔不能進 repo', `用 git rm --cached -- "${file.path}" 拿出暫存區，金鑰只放在使用者的電腦或雲端環境的設定`);
  if (file.text === undefined) continue;
  file.text.split('\n').forEach((line, index) => {
    for (const [name, pattern] of SECRETS) {
      if (pattern.test(line)) add(file.path, index + 1, `看起來是${name}`, '拿掉這一行的金鑰，改從環境變數讀；已經推上去的金鑰要到服務商那裡作廢、換新的');
    }
  });
}

// 2. 還沒填的空格
const setupPending = paths.has('SETUP.md');
let blanks = 0;
const blankAt = [];
for (const file of files) {
  if (file.text === undefined) continue;
  file.text.split('\n').forEach((line, index) => {
    const count = line.split(PLACEHOLDER).length - 1;
    if (!count) return;
    blanks += count;
    blankAt.push([file.path, index + 1]);
  });
}
if (blanks && !setupPending) {
  for (const [path, line] of blankAt) add(path, line, `還有沒填的空格「${PLACEHOLDER}…】」`, '把它換成這個專案的答案；不知道答案就問使用者');
}

// 3. 連到不存在的檔
for (const file of files) {
  if (file.text === undefined || !file.path.toLowerCase().endsWith('.md')) continue;
  stripCode(file.text).forEach((line, index) => {
    for (const raw of linkTargets(line)) {
      if (!raw || raw.startsWith('#') || /^[a-z][a-z0-9+.-]*:/i.test(raw) || raw.startsWith('//')) continue;
      let target = raw.replace(/[?#].*$/, '');
      try { target = decodeURIComponent(target); } catch { /* 照原樣比 */ }
      const resolved = posix.normalize(target.startsWith('/') ? target.slice(1) : posix.join(posix.dirname(file.path), target)).replace(/\/$/, '');
      if (resolved.startsWith('..')) {
        add(file.path, index + 1, `連結 ${raw} 跑出 repo 外`, '改成 repo 裡的檔，或改用完整的網址');
      } else if (!paths.has(resolved) && !dirs.has(resolved) && resolved !== '.') {
        add(file.path, index + 1, `連結 ${raw} 找不到檔案`, '改成正確的相對路徑；目標是新檔的話，記得一起 git add');
      }
    }
  });
}

// 4. git hook 的執行權限
for (const file of files) {
  if (!file.path.startsWith('.githooks/') || file.mode === '100755') continue;
  add(file.path, 0, `git hook 在 git 裡不是可執行的模式（現在是 ${file.mode}），Linux 的 git 會不報錯地略過它`, `跑 git update-index --chmod=+x -- "${file.path}"，再 commit`);
}

const where = staged ? '暫存區' : '整個 repo';
if (problems.length) {
  console.error(`檢查沒通過（${where}），${problems.length} 個問題：\n${problems.join('\n')}`);
  process.exitCode = 1;
} else {
  const blankNote = blanks ? `；還有 ${blanks} 個沒填的空格（SETUP.md 還在，先不擋）` : '';
  console.log(`檢查通過（${where}）：${files.length} 個檔${blankNote}`);
}
