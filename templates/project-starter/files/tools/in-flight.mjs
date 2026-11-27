// 開工前先看（docs/workflow.md〈開工前先看〉）：開著的 PR 改到哪些檔、新增了哪些決定編號；給路徑就只列改到那些路徑的 PR。
// 用法：node tools/in-flight.mjs [路徑或資料夾…]   （路徑照目前的資料夾算，還沒建的檔也可以）
// - PR 清單用 gh 的搜尋。每個 PR 的內容用 git 抓 refs/pull/<編號>/head，和 origin/main 的共同起點比，只印檔名、不讀修改內容：
//   用 GitHub 工具查一個 PR 改了哪些檔，會連整份修改內容一起回來，很花 token。
// - 決定一條一檔（docs/decisions/D-<數字>.md）：origin/main 上有的，加上開著的 PR 新增的檔名，最後一行印下一個可以用的編號。
// - 只讀：不改工作樹與分支，只更新 origin/main 與 FETCH_HEAD。
// - gh 不能用、沒登入或抓不到時印原因、exit 1，改用 GitHub 的 PR 清單手動看。有 PR 沒查完（clone 太淺、搜尋結果不完整）時
//   照樣列出查得到的，但不給下一個編號、exit 1：漏算一個 PR 新增的決定就會撞號。
// - 正在談、還沒開 PR 的事這裡看不到，另外看正在跑的討論串。
// 只用 Node 內建的模組，Node 20 以上直接跑。
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const DECISIONS = 'docs/decisions/';
const DECISION_FILE = /^docs\/decisions\/D-(\d+)\.md$/;

/** origin 的網址 → owner/name；不是 GitHub 的網址回傳 undefined。 */
export function repoSlug(url) {
  const match = /github\.com[:/]+([^/\s]+)\/([^/\s]+?)(?:\.git)?\/*$/.exec(url.trim());
  return match ? `${match[1]}/${match[2]}` : undefined;
}

const clean = (path) => path.replaceAll('\\', '/').replace(/^(?:\.\/)+/, '').replace(/\/+$/, '');

/** 改到的檔裡，和要看的路徑重疊的：同一個檔，或在那個資料夾底下。沒給路徑時全部算。 */
export function overlapping(files, paths) {
  const wanted = paths.map(clean).filter(Boolean);
  if (!wanted.length) return files;
  return files.filter((file) => wanted.some((path) => path === '.' || file === path || file.startsWith(path + '/')));
}

/** 檔名照資料夾分組，印成「資料夾 幾個」：看到第二層資料夾；根目錄的檔照名字。 */
export function grouped(files) {
  const counts = new Map();
  for (const file of files) {
    const dirs = file.split('/').slice(0, -1);
    const key = dirs.length ? `${dirs.slice(0, 2).join('/')}/` : file;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts].map(([key, count]) => (key.endsWith('/') ? `${key} ${count} 個` : key)).join('、');
}

/** 路徑清單裡的決定編號（docs/decisions/D-<數字>.md）。 */
export const decisionIds = (paths) => paths.map((path) => DECISION_FILE.exec(path)?.[1]).filter(Boolean).map(Number);

export const formatId = (id) => `D-${String(id).padStart(3, '0')}`;

/** 搜尋結果 → 開著的 PR（由新到舊）與結果完不完整。 */
export function parseSearch(json) {
  const data = JSON.parse(json);
  const items = (data.items ?? []).filter((item) => item.pull_request !== undefined);
  const prs = items.map((item) => ({ number: item.number, title: item.title, updated: item.updated_at, draft: item.draft === true }))
    .sort((a, b) => b.updated.localeCompare(a.updated));
  return { prs, complete: !data.incomplete_results && (data.total_count ?? prs.length) <= (data.items ?? []).length };
}

/** gh 在 Windows 也可能是 .cmd，經過 shell 找；參數是固定的字，沒有空白與 shell 的特殊字元。 */
function gh(args) {
  const win = process.platform === 'win32';
  return spawnSync(win ? ['gh', ...args].join(' ') : 'gh', win ? [] : args, { encoding: 'utf8', shell: win, timeout: 30_000 });
}

export function main(args) {
  const gitRaw = (gitArgs) => execFileSync('git', ['-c', 'core.quotepath=false', ...gitArgs], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 });
  const git = (gitArgs) => gitRaw(gitArgs).trim();
  const root = git(['rev-parse', '--show-toplevel']);
  const paths = args.map((arg) => clean(relative(root, resolve(arg))) || '.');
  let url = '';
  try { url = git(['config', '--get', 'remote.origin.url']); } catch { /* 沒有 origin */ }
  const slug = repoSlug(url);
  if (!slug) {
    console.error(`origin 不是 GitHub 的網址（${url || '沒有 origin'}），查不到 PR：改用 GitHub 的 PR 清單手動看。`);
    return 1;
  }
  // 一頁 30 個：開著的 PR 很少超過；超過時下面會說結果不完整。網址裡不放 & 與空白，Windows 的 shell 才不會拆開。
  const out = gh(['api', `search/issues?q=repo:${slug}+is:pr+is:open`]);
  let found;
  try {
    if (out.status !== 0) throw new Error(String(out.stderr || out.error?.message || `exit ${out.status}`).trim());
    found = parseSearch(out.stdout);
  } catch (error) {
    console.error(`查不到開著的 PR（gh 不能用、沒登入或連不上：${String(error.message).slice(0, 200)}）：改用 GitHub 的 PR 清單手動看。`);
    return 1;
  }
  const { prs, complete } = found;
  try {
    git(['fetch', '--no-tags', '--quiet', 'origin', '+refs/heads/main:refs/remotes/origin/main', ...prs.map((pr) => `refs/pull/${pr.number}/head`)]);
  } catch (error) {
    console.error(`抓不到 main 或 PR 的內容：${String(error.stderr ?? error.message).trim().slice(-300)}`);
    return 1;
  }
  const heads = new Map();
  for (const line of readFileSync(git(['rev-parse', '--path-format=absolute', '--git-path', 'FETCH_HEAD']), 'utf8').split('\n')) {
    const match = /^([0-9a-f]{40,64})\t[^\t]*\t'refs\/pull\/(\d+)\/head'/.exec(line);
    if (match) heads.set(Number(match[2]), match[1]);
  }
  let onMain = [];
  try { onMain = decisionIds(gitRaw(['ls-tree', '-z', '--name-only', 'refs/remotes/origin/main', DECISIONS]).split('\0')); } catch { /* main 還沒有決定 */ }
  const known = new Set(onMain);
  const taken = [];
  const lines = [];
  let shown = 0;
  let unfinished = 0;
  for (const pr of prs) {
    const head = heads.get(pr.number);
    const title = `#${pr.number} ${pr.title}${pr.draft ? '（草稿）' : ''}（更新 ${pr.updated.slice(0, 16).replace('T', ' ')} UTC）`;
    if (!head) {
      unfinished++;
      lines.push(`${title}\n  抓不到這個 PR 的內容`);
      continue;
    }
    let base;
    try { base = git(['merge-base', 'refs/remotes/origin/main', head]); } catch {
      unfinished++;
      lines.push(`${title}\n  找不到和 main 的共同起點（多半是 clone 太淺）：先跑 git fetch --deepen=200 origin main 再查`);
      continue;
    }
    // -z：檔名不加引號、不跳脫，中文檔名才比得到。
    const files = gitRaw(['diff', '--name-only', '-z', '--no-renames', base, head]).split('\0').filter(Boolean);
    const addedFiles = gitRaw(['diff', '--name-only', '-z', '--no-renames', '--diff-filter=A', base, head, '--', DECISIONS]).split('\0').filter(Boolean);
    const added = decisionIds(addedFiles).filter((id) => !known.has(id));
    taken.push(...added);
    const hits = overlapping(files, paths);
    if (paths.length && !hits.length && !added.length) continue;
    shown++;
    let mine = false;
    try { git(['merge-base', '--is-ancestor', head, 'HEAD']); mine = true; } catch { /* 不是這個分支的 */ }
    const parts = [mine ? `${title}（目前的分支已含它）` : title];
    if (paths.length) parts.push(hits.length ? `  改到你要看的：${hits.join('、')}` : '  沒改到你要看的路徑');
    else parts.push(`  改到 ${files.length} 個檔：${grouped(files) || '（沒有）'}`);
    if (added.length) parts.push(`  新增決定：${added.map(formatId).join('、')}`);
    lines.push(parts.join('\n'));
  }
  const scope = paths.length ? `，其中 ${shown} 個改到 ${paths.join('、')} 或新增決定` : '';
  console.log(`開著的 PR ${prs.length} 個${scope}（和 origin/main 的共同起點比）${complete ? '' : '；搜尋結果不完整，可能有漏'}：`);
  if (lines.length) console.log(lines.join('\n'));
  const latest = `main 最新是 ${onMain.length ? formatId(Math.max(...onMain)) : '（沒有）'}${taken.length ? `，開著的 PR 用了 ${[...new Set(taken)].sort((a, b) => a - b).map(formatId).join('、')}` : ''}`;
  if (unfinished || !complete) {
    const why = [unfinished ? `${unfinished} 個 PR 沒查完` : '', complete ? '' : '搜尋結果不完整'].filter(Boolean).join('、');
    console.log(`決定編號：${latest}；${why}，可能漏算別的 PR 新增的決定，現在不給下一個編號：照上面的說明補齊再跑，或到 GitHub 的 PR 清單看。`);
    return 1;
  }
  console.log(`決定編號：${latest}，下一個可以用 ${formatId(Math.max(0, ...onMain, ...taken) + 1)}。`);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) process.exitCode = main(process.argv.slice(2));
