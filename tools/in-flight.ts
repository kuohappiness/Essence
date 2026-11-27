// 開工前先看（D-242）：開著的 PR 改到哪些檔、新增了哪些決定編號；給路徑就只列改到那些路徑的 PR。
// 用法：node tools/in-flight.ts [路徑或資料夾…]   （路徑照目前的資料夾算，還沒建的檔也可以）
// - PR 清單用 gh 的搜尋（雲端的專案討論串也能用）。每個 PR 的內容用 git 抓 refs/pull/<編號>/head，和 origin/main 的共同起點比，
//   只印檔名：用 GitHub 工具查一個 PR 改了哪些檔，會連整份修改內容一起回來（PR #78 一次 16.7 萬字）。
// - 只讀：不改工作樹與分支，只更新 origin/main 與 FETCH_HEAD。
// - gh 不能用、沒登入或抓不到時印原因、exit 1，改用 GitHub 的 PR 清單手動看。正在談、還沒開 PR 的事這裡看不到，
//   專案討論串另外看正在跑的串（docs/agents/workflow.md〈開工前先看〉）。
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { APPS_ROOT, PACKAGES_ROOT } from './apps.ts';

export interface OpenPr { number: number; title: string; updated: string; draft: boolean }

const DECISIONS = 'docs/decisions.md';

/** origin 的網址 → owner/name；不是 GitHub 的網址回傳 undefined。 */
export function repoSlug(url: string): string | undefined {
  const match = /github\.com[:/]+([^/\s]+)\/([^/\s]+?)(?:\.git)?\/*$/.exec(url.trim());
  return match ? `${match[1]}/${match[2]}` : undefined;
}

const clean = (path: string) => path.replaceAll('\\', '/').replace(/^(?:\.\/)+/, '').replace(/\/+$/, '');

/** 改到的檔裡，和要看的路徑重疊的：同一個檔，或在那個資料夾底下。沒給路徑時全部算。 */
export function overlapping(files: string[], paths: string[]): string[] {
  const wanted = paths.map(clean).filter(Boolean);
  if (!wanted.length) return files;
  return files.filter(file => wanted.some(path => path === '.' || file === path || file.startsWith(path + '/')));
}

/** 檔名照資料夾分組，印成「資料夾 幾個」：apps/、packages/ 底下看到軟體裡的第一層（apps/Cards/src/），其他看到第二層；根目錄的檔照名字。 */
export function grouped(files: string[]): string {
  const counts = new Map<string, number>();
  for (const file of files) {
    const dirs = file.split('/').slice(0, -1);
    const depth = file.startsWith(APPS_ROOT) || file.startsWith(PACKAGES_ROOT) ? 3 : 2;
    const key = dirs.length ? `${dirs.slice(0, depth).join('/')}/` : file;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts].map(([key, count]) => (key.endsWith('/') ? `${key} ${count} 個` : key)).join('、');
}

/** 決定紀錄裡的編號（二級標題「## D-123 …」）。 */
export const decisionIds = (text: string): number[] => [...text.matchAll(/^## D-(\d+)\b/gm)].map(match => Number(match[1]));

/** diff 裡新加的決定標題。 */
export const addedDecisions = (diff: string): number[] => [...diff.matchAll(/^\+## D-(\d+)\b/gm)].map(match => Number(match[1]));

export const formatId = (id: number) => `D-${String(id).padStart(3, '0')}`;

/** 搜尋結果 → 開著的 PR（由新到舊）。 */
export function parseSearch(json: string): { prs: OpenPr[]; complete: boolean } {
  const data = JSON.parse(json) as { total_count?: number; incomplete_results?: boolean; items?: { number: number; title: string; updated_at: string; draft?: boolean; pull_request?: unknown }[] };
  const items = (data.items ?? []).filter(item => item.pull_request !== undefined);
  const prs = items.map(item => ({ number: item.number, title: item.title, updated: item.updated_at, draft: item.draft === true }))
    .sort((a, b) => b.updated.localeCompare(a.updated));
  return { prs, complete: !data.incomplete_results && (data.total_count ?? prs.length) <= (data.items ?? []).length };
}

/** gh 在 Windows 也可能是 .cmd，經過 shell 找；參數是固定的字，沒有空白與 shell 的特殊字元。 */
function gh(args: string[]) {
  const win = process.platform === 'win32';
  return spawnSync(win ? ['gh', ...args].join(' ') : 'gh', win ? [] : args, { encoding: 'utf8', shell: win, timeout: 30_000 });
}

export function main(args: string[]): number {
  const git = (gitArgs: string[]) => execFileSync('git', gitArgs, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 }).trim();
  const root = git(['rev-parse', '--show-toplevel']);
  const paths = args.map(arg => clean(relative(root, resolve(arg))) || '.');
  // 讀設定裡原本的網址（git remote get-url 會先套 insteadOf）。
  let url = '';
  try { url = git(['config', '--get', 'remote.origin.url']); } catch { /* 沒有 origin */ }
  const slug = repoSlug(url);
  if (!slug) {
    console.error(`origin 不是 GitHub 的網址（${url || '沒有 origin'}），查不到 PR：改用 GitHub 的 PR 清單手動看。`);
    return 1;
  }
  // 一頁 30 個：開著的 PR 很少超過；超過時下面會說結果不完整。網址裡不放 & 與空白，Windows 的 shell 才不會拆開。
  const out = gh(['api', `search/issues?q=repo:${slug}+is:pr+is:open`]);
  let found: ReturnType<typeof parseSearch>;
  try {
    if (out.status !== 0) throw new Error(String(out.stderr || out.error?.message || `exit ${out.status}`).trim());
    found = parseSearch(out.stdout);
  } catch (error) {
    console.error(`查不到開著的 PR（gh 不能用、沒登入或連不上：${(error as Error).message.slice(0, 200)}）：改用 GitHub 的 PR 清單手動看。`);
    return 1;
  }
  const { prs, complete } = found;
  try {
    git(['fetch', '--no-tags', '--quiet', 'origin', '+refs/heads/main:refs/remotes/origin/main', ...prs.map(pr => `refs/pull/${pr.number}/head`)]);
  } catch (error) {
    console.error(`抓不到 main 或 PR 的內容：${String((error as { stderr?: string }).stderr ?? (error as Error).message).trim().slice(-300)}`);
    return 1;
  }
  const heads = new Map<number, string>();
  for (const line of readFileSync(git(['rev-parse', '--path-format=absolute', '--git-path', 'FETCH_HEAD']), 'utf8').split('\n')) {
    const match = /^([0-9a-f]{40,64})\t[^\t]*\t'refs\/pull\/(\d+)\/head'/.exec(line);
    if (match) heads.set(Number(match[2]), match[1]);
  }
  let onMain: number[] = [];
  try { onMain = decisionIds(git(['show', `origin/main:${DECISIONS}`])); } catch { /* main 沒有決定紀錄 */ }
  const known = new Set(onMain);
  const taken: number[] = [];
  const lines: string[] = [];
  let shown = 0;
  for (const pr of prs) {
    const head = heads.get(pr.number);
    const title = `#${pr.number} ${pr.title}${pr.draft ? '（草稿）' : ''}（更新 ${pr.updated.slice(0, 16).replace('T', ' ')} UTC）`;
    if (!head) {
      lines.push(`${title}\n  抓不到這個 PR 的內容`);
      continue;
    }
    let base: string;
    try { base = git(['merge-base', 'refs/remotes/origin/main', head]); } catch {
      lines.push(`${title}\n  找不到和 main 的共同起點（clone 太淺）：先跑 git fetch --deepen=200 origin main 再查`);
      continue;
    }
    const files = git(['diff', '--name-only', '--no-renames', base, head]).split('\n').filter(Boolean);
    const added = files.includes(DECISIONS) ? addedDecisions(git(['diff', base, head, '--', DECISIONS])).filter(id => !known.has(id)) : [];
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
  const max = Math.max(0, ...onMain, ...taken);
  console.log(`決定編號：main 最新是 ${onMain.length ? formatId(Math.max(...onMain)) : '（沒有）'}${taken.length ? `，開著的 PR 用了 ${[...new Set(taken)].sort((a, b) => a - b).map(formatId).join('、')}` : ''}，下一個可以用 ${formatId(max + 1)}。`);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) process.exitCode = main(process.argv.slice(2));
