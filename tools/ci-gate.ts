// CI 的分派與把關（D-208 第 5 點，tasks/one-repo-step-1.md §4）。.github/workflows/check.yml 的 plan job 與 gate job 呼叫。
// 用法：
//   node tools/ci-gate.ts plan   依 GitHub 的事件決定比較的端點，跑分派表的 CI 跑法；寫 job 的輸出（GITHUB_OUTPUT）與摘要。
//   node tools/ci-gate.ts gate   讀 plan 的輸出與各 job 的結果（環境變數 NEEDS＝toJSON(needs)）；每個 job 都要符合 plan 才過。
// 不用 npm 套件：plan 與 gate 不必先安裝。比較的端點不用 checkout 出來的 HEAD：PR 預設 checkout 的是 GitHub 的試合併結果。
import { execFileSync } from 'node:child_process';
import { appendFileSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { NAMES, PLUGINS, dispatch, readChanges, shown, type Plugin } from './dispatch.ts';

/** GitHub 的事件：名稱、ref、這次的 SHA 與事件的內容（GITHUB_EVENT_PATH）。 */
export interface Event {
  name: string;
  ref: string;
  sha: string;
  payload: { before?: string; pull_request?: { base?: { sha?: string }; head?: { sha?: string } } };
}
export type Endpoints = { kind: 'range'; base: string; head: string; why: string } | { kind: 'all'; why: string };
/** 跑 git，失敗時回 undefined（找不到基點、不是祖先都算失敗）。 */
export type Git = (args: string[]) => string | undefined;

export function endpoints(event: Event, git: Git): Endpoints {
  if (event.name === 'pull_request') {
    const base = event.payload.pull_request?.base?.sha;
    const head = event.payload.pull_request?.head?.sha;
    if (!base || !head) return { kind: 'all', why: 'PR 事件缺 base 或 head 的 SHA' };
    const fork = git(['merge-base', base, head]);
    if (!fork) return { kind: 'all', why: `找不到 PR 的分岔點（${base}、${head}）` };
    return { kind: 'range', base: fork, head, why: 'PR：分岔點到 PR 的 head' };
  }
  if (event.name !== 'push') return { kind: 'all', why: `事件 ${event.name} 一律跑全部` };
  if (event.ref.startsWith('refs/tags/')) return { kind: 'all', why: 'push tag 一律跑全部' };
  if (event.ref === 'refs/heads/main') {
    const before = event.payload.before ?? '';
    if (!before || /^0+$/.test(before)) return { kind: 'all', why: 'push 到 main，沒有上一次的 SHA' };
    if (git(['cat-file', '-e', `${before}^{commit}`]) === undefined) return { kind: 'all', why: `push 到 main，clone 裡找不到上一次的 ${before}` };
    if (git(['merge-base', '--is-ancestor', before, event.sha]) === undefined) return { kind: 'all', why: `push 到 main，上一次的 ${before} 不是這次的祖先` };
    return { kind: 'range', base: before, head: event.sha, why: 'push 到 main：上一次到這次' };
  }
  // 分支算整個分支改過的：pre-merge-commit 只看分支最後一個 commit 的 CI，只算這次 push 的差異會漏掉前面改的外掛。
  const fork = git(['merge-base', 'refs/remotes/origin/main', event.sha]);
  if (!fork) return { kind: 'all', why: '找不到和 origin/main 的合併基點' };
  return { kind: 'range', base: fork, head: event.sha, why: 'push 到分支：和 origin/main 的合併基點到這次' };
}

export interface Plan {
  runs: Record<Plugin, boolean>;
  reasons: Record<Plugin, string>;
  compare: string;
  checkout: string;
  blocked: string[];
}

export function plan(event: Event, git: Git, root: string): Plan {
  const checkout = git(['rev-parse', 'HEAD']) ?? '（讀不到）';
  const ends = endpoints(event, git);
  const all = (why: string): Plan => ({
    runs: { cards: true, capture: true, mindboard: true },
    reasons: { cards: why, capture: why, mindboard: why },
    compare: '全部', checkout, blocked: [],
  });
  if (ends.kind === 'all') return all(ends.why);
  let changes;
  try {
    changes = readChanges(root, { kind: 'range', base: ends.base, head: ends.head });
  } catch (error) {
    return { ...all(`Git 讀不到 ${ends.base}..${ends.head} 的改動：${(error as Error).message.split('\n')[0]}`), compare: `${ends.base}..${ends.head}` };
  }
  const result = dispatch(changes, { root, ci: true, compare: { kind: 'range', base: ends.base, head: ends.head } });
  const runs = {} as Record<Plugin, boolean>;
  const reasons = {} as Record<Plugin, string>;
  for (const plugin of PLUGINS) {
    runs[plugin] = result.plugins[plugin].run !== 'skip';
    reasons[plugin] = result.plugins[plugin].why;
  }
  return { runs, reasons, compare: `${ends.base}..${ends.head}（${ends.why}）`, checkout, blocked: result.blocked };
}

export type JobResult = 'success' | 'failure' | 'cancelled' | 'skipped';
export interface GateRow { plugin: string; run: string; reason: string; result: string; ok: boolean }
export interface Gate { ok: boolean; rows: GateRow[]; problems: string[]; compare: string }

/** needs 是 toJSON(needs)：{ plan: { result, outputs }, shared: { result }, cards: { result }, … }。 */
export function gate(needsText: string | undefined): Gate {
  const problems: string[] = [];
  let needs: Record<string, { result?: string; outputs?: Record<string, string> }>;
  try {
    needs = JSON.parse(needsText ?? '') as typeof needs;
    if (!needs || typeof needs !== 'object') throw new Error('不是物件');
  } catch (error) {
    return { ok: false, rows: [], problems: [`NEEDS 解析失敗：${(error as Error).message}`], compare: '（不知道）' };
  }
  const planJob = needs.plan;
  if (planJob?.result !== 'success') problems.push(`plan 沒有成功（${planJob?.result ?? '沒有結果'}）`);
  if (needs.shared?.result !== 'success') problems.push(`共用檢查沒有成功（${needs.shared?.result ?? '沒有結果'}）`);
  const outputs = planJob?.outputs ?? {};
  let reasons: Record<string, string> = {};
  try { reasons = JSON.parse(outputs.reasons ?? '{}') as Record<string, string>; } catch { problems.push('plan 的理由解析失敗'); }
  const rows: GateRow[] = [];
  for (const plugin of PLUGINS) {
    const flag = outputs[plugin];
    const result = needs[plugin]?.result;
    let ok = true;
    let run = flag === 'true' ? '跑' : flag === 'false' ? '不跑' : `不合法（${flag ?? '沒有'}）`;
    if (flag !== 'true' && flag !== 'false') {
      ok = false;
      problems.push(`${NAMES[plugin]}：plan 的旗標不合法（${flag ?? '沒有'}）`);
    } else if (!result) {
      ok = false;
      problems.push(`${NAMES[plugin]}：job 沒有結果`);
    } else if (flag === 'true' && result !== 'success') {
      ok = false;
      problems.push(result === 'skipped' ? `${NAMES[plugin]}：要跑卻跳過` : `${NAMES[plugin]}：要跑，結果是 ${result}`);
    } else if (flag === 'false' && result !== 'skipped') {
      ok = false;
      problems.push(`${NAMES[plugin]}：不該跑卻跑了（${result}）`);
    }
    if (planJob?.result !== 'success') run += '（plan 沒有成功）';
    rows.push({ plugin: NAMES[plugin], run, reason: reasons[plugin] ?? '', result: result ?? '沒有結果', ok });
  }
  return { ok: problems.length === 0, rows, problems, compare: outputs.compare ?? '（plan 沒有輸出）' };
}

const cell = (text: string) => text.replace(/\|/g, '\\|').replace(/\n/g, ' ');

export function summary(result: Gate): string {
  const lines = [
    `### 分派與把關：${result.ok ? '通過' : '沒通過'}`, '',
    `比較：${cell(result.compare)}`, '',
    '| 外掛 | 跑不跑 | 理由 | 結果 |', '|---|---|---|---|',
    ...result.rows.map(row => `| ${row.plugin} | ${cell(row.run)} | ${cell(row.reason)} | ${row.ok ? '' : '✗ '}${cell(row.result)} |`),
  ];
  if (result.problems.length) lines.push('', ...result.problems.map(problem => `- ${cell(problem)}`));
  return lines.join('\n') + '\n';
}

/** 在 root 跑 git；失敗（找不到物件、不是祖先、沒有這個 ref）回 undefined。 */
export function gitIn(root: string): Git {
  return args => {
    try {
      return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    } catch {
      return undefined;
    }
  };
}

function readEvent(): Event {
  const path = process.env.GITHUB_EVENT_PATH;
  return {
    name: process.env.GITHUB_EVENT_NAME ?? '',
    ref: process.env.GITHUB_REF ?? '',
    sha: process.env.GITHUB_SHA ?? '',
    payload: path ? (JSON.parse(readFileSync(path, 'utf8')) as Event['payload']) : {},
  };
}

function write(variable: string, text: string) {
  const file = process.env[variable];
  if (file) appendFileSync(file, text);
}

export function main(args: string[]): number {
  if (args[0] === 'plan') {
    const root = gitIn(process.cwd())(['rev-parse', '--show-toplevel']) ?? process.cwd();
    const result = plan(readEvent(), gitIn(root), root);
    const outputs = [...PLUGINS.map(plugin => `${plugin}=${result.runs[plugin]}`), `reasons=${JSON.stringify(result.reasons)}`, `compare=${result.compare.replace(/\n/g, ' ')}`];
    write('GITHUB_OUTPUT', outputs.join('\n') + '\n');
    const lines = [`比較：${result.compare}`, `checkout：${result.checkout}`, ...PLUGINS.map(plugin => `${NAMES[plugin]}：${result.runs[plugin] ? '跑' : '不跑'}，${result.reasons[plugin]}`)];
    console.log(lines.join('\n'));
    write('GITHUB_STEP_SUMMARY', ['### 分派', '', ...lines.map(line => `- ${line}`), ''].join('\n'));
    if (result.blocked.length) {
      console.error(`擋下：${result.blocked.map(shown).join('、')} 是子模組（gitlink），這個 repo 不支援子模組。`);
      return 1;
    }
    return 0;
  }
  if (args[0] === 'gate') {
    const result = gate(process.env.NEEDS);
    const text = summary(result);
    console.log(text);
    write('GITHUB_STEP_SUMMARY', text);
    return result.ok ? 0 : 1;
  }
  console.error('用法：node tools/ci-gate.ts plan | gate');
  return 2;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) process.exitCode = main(process.argv.slice(2));
