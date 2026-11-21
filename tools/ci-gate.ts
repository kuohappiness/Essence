// CI 的分派與把關（D-208 第 5 點，tasks/one-repo-step-1.md §4）。.github/workflows/check.yml 的 plan job 與 gate job 呼叫。
// 用法：
//   node tools/ci-gate.ts plan   依 GitHub 的事件決定比較的端點，跑分派表的 CI 跑法；寫 job 的輸出（GITHUB_OUTPUT）與摘要。
//   node tools/ci-gate.ts gate   讀 plan 的輸出與各 job 的結果（環境變數 NEEDS＝toJSON(needs)）；每個 job 都要符合 plan 才過。
// 不用 npm 套件：plan 與 gate 不必先安裝。比較的端點不用 checkout 出來的 HEAD：PR 預設 checkout 的是 GitHub 的試合併結果。
import { execFileSync } from 'node:child_process';
import { appendFileSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { NAMES, TARGETS, dispatch, readChanges, shown, type Target } from './dispatch.ts';

/** GitHub 的事件：名稱、ref、這次的 SHA 與事件的內容（GITHUB_EVENT_PATH）。 */
export interface Event {
  name: string;
  ref: string;
  sha: string;
  payload: { before?: string; pull_request?: { base?: { sha?: string }; head?: { sha?: string } } };
}
/** merged：PR 的合併樹，GitHub 的合併 commit 對它第一個 parent 的差異，路徑是合併後實際改到的（第二步 L2 R1）。 */
export type Endpoints = { kind: 'range'; base: string; head: string; why: string; merged?: Range } | { kind: 'all'; why: string };
type Range = { base: string; head: string };
/** 跑 git，失敗時回 undefined（找不到基點、不是祖先都算失敗）。 */
export type Git = (args: string[]) => string | undefined;

export function endpoints(event: Event, git: Git): Endpoints {
  if (event.name === 'pull_request') {
    const base = event.payload.pull_request?.base?.sha;
    const head = event.payload.pull_request?.head?.sha;
    if (!base || !head) return { kind: 'all', why: 'PR 事件缺 base 或 head 的 SHA' };
    const fork = git(['merge-base', base, head]);
    if (!fork) return { kind: 'all', why: `找不到 PR 的分岔點（${base}、${head}）` };
    // 分岔點到 head 是分支上的路徑；搬家前開的分支，改動在合併樹裡落到新路徑（tools/install.ts → apps/Cards/tools/install.ts）。
    // 所以也看 GitHub 的合併 commit（GITHUB_SHA，第二個 parent 是 PR 的 head）對第一個 parent 的差異，兩邊的分派取聯集；對不上就跑全部。
    const parents = git(['rev-list', '--parents', '-n', '1', event.sha])?.split(/\s+/).slice(1) ?? [];
    const first = parents[0];
    if (parents.length !== 2 || !first || parents[1] !== git(['rev-parse', '--verify', '--quiet', `${head}^{commit}`])) {
      return { kind: 'all', why: `PR 的合併 commit（${event.sha}）的 parent 對不上 PR 的 head（${head}）` };
    }
    return { kind: 'range', base: fork, head, why: 'PR：分岔點到 PR 的 head', merged: { base: first, head: event.sha } };
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
  runs: Record<Target, boolean>;
  reasons: Record<Target, string>;
  compare: string;
  checkout: string;
  blocked: string[];
}

export function plan(event: Event, git: Git, root: string): Plan {
  const checkout = git(['rev-parse', 'HEAD']) ?? '（讀不到）';
  const ends = endpoints(event, git);
  const all = (why: string): Plan => ({
    runs: { tools: true, cards: true, capture: true, mindboard: true },
    reasons: { tools: why, cards: why, capture: why, mindboard: why },
    compare: '全部', checkout, blocked: [],
  });
  if (ends.kind === 'all') return all(ends.why);
  const ranges: (Range & { label: string })[] = [{ base: ends.base, head: ends.head, label: '' }];
  if (ends.merged) ranges.push({ ...ends.merged, label: '合併樹：' });
  const compare = `${ends.base}..${ends.head}（${ends.why}）` + (ends.merged ? `；合併樹 ${ends.merged.base}..${ends.merged.head}` : '');
  const results = [];
  for (const range of ranges) {
    let changes;
    try {
      changes = readChanges(root, { kind: 'range', base: range.base, head: range.head });
    } catch (error) {
      return { ...all(`Git 讀不到 ${range.base}..${range.head} 的改動：${(error as Error).message.split('\n')[0]}`), compare: `${range.base}..${range.head}` };
    }
    results.push({ label: range.label, result: dispatch(changes, { root, ci: true, compare: { kind: 'range', base: range.base, head: range.head } }) });
  }
  const runs = {} as Record<Target, boolean>;
  const reasons = {} as Record<Target, string>;
  for (const target of TARGETS) {
    // 任一邊要跑就跑，理由取要跑的那一邊；都不跑時取分支那一邊的理由。
    const ran = results.find(r => r.result.targets[target].run !== 'skip');
    const pick = ran ?? results[0];
    runs[target] = Boolean(ran);
    reasons[target] = pick.label + pick.result.targets[target].why;
  }
  return { runs, reasons, compare, checkout, blocked: [...new Set(results.flatMap(r => r.result.blocked))] };
}

export type JobResult = 'success' | 'failure' | 'cancelled' | 'skipped';
export interface GateRow { target: string; run: string; reason: string; result: string; ok: boolean }
export interface Gate { ok: boolean; rows: GateRow[]; problems: string[]; compare: string }

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
/** 非空的字串才算有值（只有空白也不算）。 */
const filled = (value: unknown): string | undefined => (typeof value === 'string' && value.trim() ? value : undefined);
/** 問題裡顯示不合法的值：沒有、字串照原樣、其他型別用 JSON。 */
const describe = (value: unknown) => (value === undefined ? '沒有' : typeof value === 'string' ? value : JSON.stringify(value));

/**
 * needs 是 toJSON(needs)：{ plan: { result, outputs }, shared: { result }, tools: { result }, cards: { result }, … }。
 * 每個值都先查型別（L2 R4）：缺、空或型別錯的結果、旗標、比較端點與理由都列成問題，摘要不會因為型別錯拋錯。
 */
export function gate(needsText: string | undefined): Gate {
  const problems: string[] = [];
  let needs: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(needsText ?? '');
    if (!isObject(parsed)) throw new Error('不是物件');
    needs = parsed;
  } catch (error) {
    return { ok: false, rows: [], problems: [`NEEDS 解析失敗：${(error as Error).message}`], compare: '（不知道）' };
  }
  const job = (name: string) => (isObject(needs[name]) ? needs[name] : {});
  const planJob = job('plan');
  const planOk = planJob.result === 'success';
  if (!planOk) problems.push(`plan 沒有成功（${planJob.result === undefined ? '沒有結果' : describe(planJob.result)}）`);
  const shared = job('shared').result;
  if (shared !== 'success') problems.push(`共用檢查沒有成功（${shared === undefined ? '沒有結果' : describe(shared)}）`);
  if (planJob.outputs !== undefined && !isObject(planJob.outputs)) problems.push(`plan 的輸出不是物件（${describe(planJob.outputs)}）`);
  const outputs = isObject(planJob.outputs) ? planJob.outputs : {};
  const compare = filled(outputs.compare);
  if (!compare) problems.push(`plan 沒有比較的端點（compare：${describe(outputs.compare)}）`);
  let reasons: Record<string, unknown> = {};
  if (filled(outputs.reasons)) {
    try {
      const parsed: unknown = JSON.parse(outputs.reasons as string);
      if (isObject(parsed)) reasons = parsed;
      else problems.push(`plan 的理由不是物件（${describe(parsed)}）`);
    } catch {
      problems.push('plan 的理由解析失敗');
    }
  }
  const rows: GateRow[] = [];
  for (const target of TARGETS) {
    const flag = outputs[target];
    const raw = job(target).result;
    const result = filled(raw);
    // 跳過一定有理由：每個對象的理由都要是非空的字串。
    const reason = filled(reasons[target]);
    let ok = true;
    let run = flag === 'true' ? '跑' : flag === 'false' ? '不跑' : `不合法（${describe(flag)}）`;
    if (flag !== 'true' && flag !== 'false') {
      ok = false;
      problems.push(`${NAMES[target]}：plan 的旗標不合法（${describe(flag)}）`);
    } else if (!result) {
      ok = false;
      problems.push(`${NAMES[target]}：job 沒有結果${raw === undefined ? '' : `（${describe(raw)}）`}`);
    } else if (flag === 'true' && result !== 'success') {
      ok = false;
      problems.push(result === 'skipped' ? `${NAMES[target]}：要跑卻跳過` : `${NAMES[target]}：要跑，結果是 ${result}`);
    } else if (flag === 'false' && result !== 'skipped') {
      ok = false;
      problems.push(`${NAMES[target]}：不該跑卻跑了（${result}）`);
    }
    if (!reason) {
      ok = false;
      problems.push(`${NAMES[target]}：plan 沒有寫理由`);
    }
    if (!planOk) run += '（plan 沒有成功）';
    rows.push({ target: NAMES[target], run, reason: reason ?? '（沒有）', result: result ?? '沒有結果', ok });
  }
  return { ok: problems.length === 0, rows, problems, compare: compare ?? '（plan 沒有輸出）' };
}

const cell = (text: string) => String(text).replace(/\|/g, '\\|').replace(/\n/g, ' ');

export function summary(result: Gate): string {
  const lines = [
    `### 分派與把關：${result.ok ? '通過' : '沒通過'}`, '',
    `比較：${cell(result.compare)}`, '',
    '| 對象 | 跑不跑 | 理由 | 結果 |', '|---|---|---|---|',
    ...result.rows.map(row => `| ${row.target} | ${cell(row.run)} | ${cell(row.reason)} | ${row.ok ? '' : '✗ '}${cell(row.result)} |`),
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
    const outputs = [...TARGETS.map(target => `${target}=${result.runs[target]}`), `reasons=${JSON.stringify(result.reasons)}`, `compare=${result.compare.replace(/\n/g, ' ')}`];
    write('GITHUB_OUTPUT', outputs.join('\n') + '\n');
    const lines = [`比較：${result.compare}`, `checkout：${result.checkout}`, ...TARGETS.map(target => `${NAMES[target]}：${result.runs[target] ? '跑' : '不跑'}，${result.reasons[target]}`)];
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
