// CI 的分派與把關（tasks/one-repo-step-1.md §4、驗收 4）：gate 的每種結果，與每種事件的比較端點。
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile, execFileSync } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gate, gitIn, plan, summary, type Event } from '../ci-gate.ts';
import { CARDS } from '../dispatch.ts';

const run = promisify(execFile);
const GATE = fileURLToPath(new URL('../ci-gate.ts', import.meta.url));
const ZEROS = '0'.repeat(40);

type Needs = Record<string, { result?: string; outputs?: Record<string, string> }>;

/** plan 說 Cards、Mindboard 要跑，共用工具、Capture、AI 連線套件不跑；每個 job 都照 plan。 */
function needs(change: (n: Needs) => void = () => {}): string {
  const n: Needs = {
    plan: {
      result: 'success',
      outputs: {
        tools: 'false', cards: 'true', capture: 'false', mindboard: 'true', 'ai-client': 'false',
        reasons: JSON.stringify({
          tools: '照分派表跳過（這次改的路徑都不是它的：src/a.ts）', cards: '完整檢查（改到 src/a.ts）', capture: '照分派表跳過（這次改的路徑都不是它的：src/a.ts）',
          mindboard: '完整檢查（改到 apps/Mindboard/a.ts）', 'ai-client': '照分派表跳過（這次改的路徑都不是它的：src/a.ts）',
        }),
        compare: 'aaa..bbb（PR：分岔點到 PR 的 head）',
      },
    },
    shared: { result: 'success' },
    tools: { result: 'skipped' },
    cards: { result: 'success' },
    capture: { result: 'skipped' },
    mindboard: { result: 'success' },
    'ai-client': { result: 'skipped' },
  };
  change(n);
  return JSON.stringify(n);
}

void test('§4 gate：每個 job 都照 plan 才過；摘要有對象、跑不跑、理由、結果與比較的端點', () => {
  const result = gate(needs());
  assert.equal(result.ok, true, result.problems.join('\n'));
  const text = summary(result);
  assert.match(text, /\| 對象 \| 跑不跑 \| 理由 \| 結果 \|/);
  assert.match(text, /\| Capture \| 不跑 \| 照分派表跳過（這次改的路徑都不是它的：src\/a\.ts） \| skipped \|/);
  assert.match(text, /\| Mindboard \| 跑 \| 完整檢查（改到 apps\/Mindboard\/a\.ts） \| success \|/);
  assert.match(text, /\| 共用工具 \| 不跑 \| 照分派表跳過（這次改的路徑都不是它的：src\/a\.ts） \| skipped \|/);
  assert.match(text, /\| AI 連線套件 \| 不跑 \| 照分派表跳過（這次改的路徑都不是它的：src\/a\.ts） \| skipped \|/);
  assert.match(text, /比較：aaa\.\.bbb/);
});

void test('§4 gate：套件（docs/tasks/ai-client.md〈8〉）要跑卻跳過、不該跑卻跑了、沒有結果都不過', () => {
  const skipped = gate(needs(n => { n.plan.outputs!['ai-client'] = 'true'; }));
  assert.equal(skipped.ok, false);
  assert.match(skipped.problems.join('\n'), /AI 連線套件：要跑卻跳過/);
  const extra = gate(needs(n => { n['ai-client'].result = 'success'; }));
  assert.equal(extra.ok, false);
  assert.match(extra.problems.join('\n'), /AI 連線套件：不該跑卻跑了（success）/);
  const missing = gate(needs(n => { delete n['ai-client']; }));
  assert.equal(missing.ok, false);
  assert.match(missing.problems.join('\n'), /AI 連線套件：job 沒有結果/);
});

void test('§4 gate：共用工具（第二步 §A4）要跑卻跳過、不該跑卻跑了、沒有結果都不過', () => {
  const skipped = gate(needs(n => { n.plan.outputs!.tools = 'true'; }));
  assert.equal(skipped.ok, false);
  assert.match(skipped.problems.join('\n'), /共用工具：要跑卻跳過/);
  const extra = gate(needs(n => { n.tools.result = 'success'; }));
  assert.equal(extra.ok, false);
  assert.match(extra.problems.join('\n'), /共用工具：不該跑卻跑了（success）/);
  const missing = gate(needs(n => { delete n.tools; }));
  assert.equal(missing.ok, false);
  assert.match(missing.problems.join('\n'), /共用工具：job 沒有結果/);
});

void test('§4 gate：共用工具要跑且 success 才過；旗標不是 true／false 不過（第二步驗收第 A6 項）', () => {
  const ran = gate(needs(n => { n.plan.outputs!.tools = 'true'; n.tools.result = 'success'; }));
  assert.equal(ran.ok, true, ran.problems.join('\n'));
  assert.match(summary(ran), /\| 共用工具 \| 跑 \| .* \| success \|/);
  const badFlag = gate(needs(n => { n.plan.outputs!.tools = 'yes'; }));
  assert.equal(badFlag.ok, false);
  assert.match(badFlag.problems.join('\n'), /共用工具：plan 的旗標不合法（yes）/);
});

void test('§4 gate：要跑的 failure、cancelled、skipped 都不過', () => {
  for (const [result, message] of [['failure', /Cards：要跑，結果是 failure/], ['cancelled', /Cards：要跑，結果是 cancelled/], ['skipped', /Cards：要跑卻跳過/]] as const) {
    const g = gate(needs(n => { n.cards.result = result; }));
    assert.equal(g.ok, false, result);
    assert.match(g.problems.join('\n'), message);
    assert.match(summary(g), /\| Cards \| 跑 \| .* \| ✗ /);
  }
});

void test('§4 gate：不跑的照表 skipped 才過，跑了就不過', () => {
  const g = gate(needs(n => { n.capture.result = 'success'; }));
  assert.equal(g.ok, false);
  assert.match(g.problems.join('\n'), /Capture：不該跑卻跑了（success）/);
});

void test('§4 gate：plan 或共用檢查沒成功都不過；plan 失敗時摘要照樣印得出表', () => {
  const failed = gate(needs(n => { n.plan = { result: 'failure', outputs: {} }; n.cards.result = 'skipped'; n.mindboard.result = 'skipped'; }));
  assert.equal(failed.ok, false);
  assert.match(failed.problems.join('\n'), /plan 沒有成功（failure）/);
  const text = summary(failed);
  assert.match(text, /\| 對象 \| 跑不跑 \| 理由 \| 結果 \|/);
  assert.match(text, /\| Cards \| 不合法（沒有）（plan 沒有成功） \|/);
  assert.match(text, /比較：（plan 沒有輸出）/);

  const shared = gate(needs(n => { n.shared.result = 'failure'; }));
  assert.equal(shared.ok, false);
  assert.match(shared.problems.join('\n'), /共用檢查沒有成功（failure）/);
});

void test('§4 gate：欄位缺、JSON 解析失敗、旗標不是合法值都不過', () => {
  const missingJob = gate(needs(n => { delete n.mindboard; }));
  assert.equal(missingJob.ok, false);
  assert.match(missingJob.problems.join('\n'), /Mindboard：job 沒有結果/);

  const missingShared = gate(needs(n => { delete n.shared; }));
  assert.equal(missingShared.ok, false);

  const missingFlag = gate(needs(n => { delete n.plan.outputs!.capture; }));
  assert.equal(missingFlag.ok, false);
  assert.match(missingFlag.problems.join('\n'), /Capture：plan 的旗標不合法（沒有）/);

  const badFlag = gate(needs(n => { n.plan.outputs!.cards = 'yes'; }));
  assert.equal(badFlag.ok, false);
  assert.match(badFlag.problems.join('\n'), /Cards：plan 的旗標不合法（yes）/);

  const badReasons = gate(needs(n => { n.plan.outputs!.reasons = '{'; }));
  assert.equal(badReasons.ok, false);
  assert.match(badReasons.problems.join('\n'), /plan 的理由解析失敗/);

  for (const text of [undefined, '', 'not json', 'null', '[1']) {
    const g = gate(text);
    assert.equal(g.ok, false, String(text));
    assert.match(g.problems.join('\n'), /NEEDS 解析失敗/);
  }
});

void test('§4 gate：比較端點與理由缺、空或型別錯都不過（L2 R4）；值的型別錯了摘要照樣印得出來', () => {
  const loose = (n: Needs) => n as Record<string, Record<string, unknown>>;
  const outputs = (n: Needs) => n.plan.outputs as Record<string, unknown>;
  const reasons = (value: unknown) => (n: Needs) => { n.plan.outputs!.reasons = JSON.stringify(value); };
  const full = { tools: '照分派表跳過（…）', cards: '完整檢查（改到 src/a.ts）', capture: '照分派表跳過（…）', mindboard: '完整檢查（改到 apps/Mindboard/a.ts）', 'ai-client': '照分派表跳過（…）' };
  const cases: [string, (n: Needs) => void, RegExp][] = [
    ['沒有 compare', n => { delete n.plan.outputs!.compare; }, /plan 沒有比較的端點/],
    ['compare 是空字串', n => { n.plan.outputs!.compare = ''; }, /plan 沒有比較的端點/],
    ['compare 只有空白', n => { n.plan.outputs!.compare = ' '; }, /plan 沒有比較的端點/],
    ['compare 不是字串', n => { outputs(n).compare = 5; }, /plan 沒有比較的端點/],
    ['沒有 reasons', n => { delete n.plan.outputs!.reasons; }, /Cards：plan 沒有寫理由[\s\S]*Capture：plan 沒有寫理由[\s\S]*Mindboard：plan 沒有寫理由/],
    ['reasons 是空字串', n => { n.plan.outputs!.reasons = ''; }, /Capture：plan 沒有寫理由/],
    ['reasons 是 {}', reasons({}), /Cards：plan 沒有寫理由[\s\S]*Capture：plan 沒有寫理由[\s\S]*Mindboard：plan 沒有寫理由/],
    ['reasons 少一個外掛', reasons({ tools: full.tools, cards: full.cards, capture: full.capture, 'ai-client': full['ai-client'] }), /Mindboard：plan 沒有寫理由/],
    ['reasons 少套件', reasons({ tools: full.tools, cards: full.cards, capture: full.capture, mindboard: full.mindboard }), /AI 連線套件：plan 沒有寫理由/],
    ['reasons 是陣列', reasons([full.tools, full.cards, full.capture, full.mindboard, full['ai-client']]), /plan 的理由不是物件/],
    ['reasons 是 null', reasons(null), /plan 的理由不是物件/],
    ['理由是空字串', reasons({ ...full, capture: '' }), /Capture：plan 沒有寫理由/],
    ['理由不是字串', reasons({ ...full, cards: 5 }), /Cards：plan 沒有寫理由/],
    ['outputs 不是物件', n => { loose(n).plan.outputs = 'x'; }, /plan 的輸出不是物件/],
    ['job 的結果不是字串', n => { loose(n).cards.result = 5; }, /Cards：job 沒有結果（5）/],
    ['plan 的結果不是字串', n => { loose(n).plan.result = { ok: true }; }, /plan 沒有成功（\{"ok":true\}）/],
    ['旗標不是字串', n => { outputs(n).cards = true; }, /Cards：plan 的旗標不合法（true）/],
  ];
  for (const [name, change, message] of cases) {
    const g = gate(needs(change));
    assert.equal(g.ok, false, name);
    assert.match(g.problems.join('\n'), message, name);
    assert.match(summary(g), /^### 分派與把關：沒通過$/m, name);
  }
  // 理由缺的那一列標成沒過，表上看得出缺。
  const missing = gate(needs(reasons({ tools: full.tools, cards: full.cards, capture: full.capture })));
  assert.match(summary(missing), /\| Mindboard \| 跑 \| （沒有） \| ✗ success \|/);
});

void test('§4 gate 的命令：結束碼跟著結論，摘要寫進 GITHUB_STEP_SUMMARY', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'essence-ci-gate-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const file = join(dir, 'summary.md');
  await run(process.execPath, [GATE, 'gate'], { env: { ...process.env, NEEDS: needs(), GITHUB_STEP_SUMMARY: file } });
  assert.match(await readFile(file, 'utf8'), /分派與把關：通過/);
  await assert.rejects(run(process.execPath, [GATE, 'gate'], { env: { ...process.env, NEEDS: needs(n => { n.cards.result = 'skipped'; }), GITHUB_STEP_SUMMARY: file } }), { code: 1 });
  assert.match(await readFile(file, 'utf8'), /要跑卻跳過/);
});

/**
 * 暫存 repo：
 *   start ── cards1（改 src/a.ts）── mindboard1（改 apps/Mindboard/a.ts）   ← feature（分支改過 Cards）
 *     ├── main1（改 src/b.ts）                                               ← main（PR 開了之後 base 前進、改了 Cards）
 *     └── only（改 apps/Mindboard/b.ts）                                   ← only（只改 Mindboard 的分支）
 */
async function history(t: test.TestContext) {
  const root = await mkdtemp(join(tmpdir(), 'essence-ci-plan-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const env = { ...process.env };
  for (const key of Object.keys(env)) if (key.toUpperCase().startsWith('GIT_')) delete env[key];
  const git = (...args: string[]) => execFileSync('git', args, { cwd: root, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const commit = async (path: string, text: string) => {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), text);
    git('add', '--', path);
    git('-c', 'user.name=t', '-c', 'user.email=t@example.invalid', 'commit', '-q', '--no-verify', '-m', path);
    return git('rev-parse', 'HEAD');
  };
  git('init', '-q', '-b', 'main');
  // Cards 的檔照分派表的資料夾放（D-208 第二步 §A6）。
  const C = CARDS === '.' ? '' : CARDS + '/';
  const start = await commit(`${C}src/a.ts`, 'export const a = 1;\n');
  const main1 = await commit(`${C}src/b.ts`, 'export const b = 1;\n');
  git('checkout', '-q', '-b', 'feature', start);
  const cards1 = await commit(`${C}src/a.ts`, 'export const a = 2;\n');
  const mindboard1 = await commit('apps/Mindboard/a.ts', 'export const m = 1;\n');
  git('checkout', '-q', '-b', 'only', start);
  const only = await commit('apps/Mindboard/b.ts', 'export const m = 2;\n');
  // GitHub 的 refs/pull/N/merge：base（main1）與 PR 的 head（only）的合併 commit。
  git('checkout', '-q', '--detach', main1);
  git('-c', 'user.name=t', '-c', 'user.email=t@example.invalid', 'merge', '-q', '--no-ff', '--no-verify', '-m', 'pr', only);
  const prMerge = git('rev-parse', 'HEAD');
  git('checkout', '-q', 'only');
  git('update-ref', 'refs/remotes/origin/main', main1);
  git('tag', 'v0.0.1', only);
  return { root, env, git, start, main1, cards1, mindboard1, only, prMerge };
}

const runs = (p: ReturnType<typeof plan>) => Object.entries(p.runs).filter(([, on]) => on).map(([name]) => name).join(',');

void test('§4 比較端點：PR 用分岔點到 head，不用 base 的最新；base 前進改了 Cards、head 只改 Mindboard → 只有 Mindboard', async t => {
  const h = await history(t);
  const event: Event = { name: 'pull_request', ref: 'refs/pull/1/merge', sha: h.prMerge, payload: { pull_request: { base: { sha: h.main1 }, head: { sha: h.only } } } };
  const p = plan(event, gitIn(h.root), h.root);
  assert.equal(runs(p), 'mindboard');
  assert.match(p.compare, new RegExp(`^${h.start}\\.\\.${h.only}`));
  assert.match(p.reasons.cards, /照分派表跳過/);
  // 缺 SHA：跑全部。
  assert.equal(runs(plan({ ...event, payload: {} }, gitIn(h.root), h.root)), 'tools,cards,capture,mindboard,ai-client');
});

void test('§4 比較端點：PR 也看合併樹（第二步 L2 R1）：搬家前開的分支只改 tools/install.ts，合併後落在 apps/Cards/tools/ → Cards 也跑', async t => {
  const root = await mkdtemp(join(tmpdir(), 'essence-ci-moved-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const env = { ...process.env };
  for (const key of Object.keys(env)) if (key.toUpperCase().startsWith('GIT_')) delete env[key];
  const git = (...args: string[]) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.invalid', ...args], { cwd: root, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const write = async (path: string, text: string) => { await mkdir(dirname(join(root, path)), { recursive: true }); await writeFile(join(root, path), text); git('add', '--', path); };
  git('init', '-q', '-b', 'main');
  // 搬家前：Cards 的工具在 tools/。
  await write('tools/install.ts', 'export const a = 1;\nexport const b = 2;\nexport const c = 3;\n');
  git('commit', '-q', '--no-verify', '-m', 'before');
  const before = git('rev-parse', 'HEAD');
  git('checkout', '-q', '-b', 'old', before);
  await write('tools/install.ts', 'export const a = 1;\nexport const b = 20;\nexport const c = 3;\n');
  git('commit', '-q', '--no-verify', '-m', 'old branch');
  const old = git('rev-parse', 'HEAD');
  git('checkout', '-q', 'main');
  await mkdir(join(root, 'apps/Cards/tools'), { recursive: true });
  git('mv', 'tools/install.ts', 'apps/Cards/tools/install.ts');
  git('commit', '-q', '--no-verify', '-m', 'move');
  const moved = git('rev-parse', 'HEAD');
  // GitHub 的 refs/pull/N/merge：第一個 parent 是 base，第二個是 PR 的 head。
  git('checkout', '-q', '--detach', moved);
  git('merge', '-q', '--no-ff', '--no-verify', '-m', 'merge', old);
  const merge = git('rev-parse', 'HEAD');
  assert.match(git('diff', '--name-only', moved, merge), /^apps\/Cards\/tools\/install\.ts$/);

  const event: Event = { name: 'pull_request', ref: 'refs/pull/1/merge', sha: merge, payload: { pull_request: { base: { sha: moved }, head: { sha: old } } } };
  const p = plan(event, gitIn(root), root);
  assert.equal(runs(p), 'tools,cards');
  assert.match(p.reasons.cards, /apps\/Cards\/tools\/install\.ts/);
  assert.match(p.compare, new RegExp(`^${before}\\.\\.${old}.*${moved}\\.\\.${merge}`));
  // 合併 commit 的第二個 parent 不是 PR 的 head、或不是合併 commit：對不上就跑全部。
  for (const sha of [moved, 'merge-sha']) {
    const all = plan({ ...event, sha }, gitIn(root), root);
    assert.equal(runs(all), 'tools,cards,capture,mindboard,ai-client', sha);
    assert.match(all.reasons.cards, /合併 commit/);
  }
});

void test('§4 比較端點：push 到 main 有 before 就比 before..sha；全是 0、clone 裡沒有、不是祖先都跑全部', async t => {
  const h = await history(t);
  const push = (before: string, sha: string): Event => ({ name: 'push', ref: 'refs/heads/main', sha, payload: { before } });
  const ok = plan(push(h.start, h.main1), gitIn(h.root), h.root);
  assert.equal(runs(ok), 'cards');
  assert.match(ok.compare, new RegExp(`^${h.start}\\.\\.${h.main1}`));

  for (const [before, why] of [[ZEROS, /沒有上一次的 SHA/], ['1234567890abcdef1234567890abcdef12345678', /clone 裡找不到/], [h.only, /不是這次的祖先/]] as const) {
    const all = plan(push(before, h.main1), gitIn(h.root), h.root);
    assert.equal(runs(all), 'tools,cards,capture,mindboard,ai-client', before);
    assert.match(all.reasons.mindboard, why);
    assert.equal(all.compare, '全部');
  }
});

void test('§4 比較端點：push 到分支算整個分支（和 origin/main 的合併基點）；沒有 origin/main 跑全部；push tag 跑全部', async t => {
  const h = await history(t);
  const branch = (ref: string, sha: string): Event => ({ name: 'push', ref, sha, payload: { before: h.cards1 } });
  // 最後一次 push 只改 Mindboard，前一次改了 Cards：照整個分支算，Cards 也要跑。
  const feature = plan(branch('refs/heads/feature', h.mindboard1), gitIn(h.root), h.root);
  assert.equal(runs(feature), 'cards,mindboard');
  assert.match(feature.compare, new RegExp(`^${h.start}\\.\\.${h.mindboard1}`));
  assert.equal(runs(plan(branch('refs/heads/only', h.only), gitIn(h.root), h.root)), 'mindboard');

  const tag = plan(branch('refs/tags/v0.0.1', h.only), gitIn(h.root), h.root);
  assert.equal(runs(tag), 'tools,cards,capture,mindboard,ai-client');
  assert.match(tag.reasons.cards, /push tag/);

  h.git('update-ref', '-d', 'refs/remotes/origin/main');
  const lost = plan(branch('refs/heads/only', h.only), gitIn(h.root), h.root);
  assert.equal(runs(lost), 'tools,cards,capture,mindboard,ai-client');
  assert.match(lost.reasons.capture, /找不到和 origin\/main 的合併基點/);
});

void test('§4 plan 的命令：寫 GITHUB_OUTPUT 的旗標、理由與比較的端點，也印 checkout 的 SHA', async t => {
  const h = await history(t);
  const dir = await mkdtemp(join(tmpdir(), 'essence-ci-plan-out-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const event = join(dir, 'event.json');
  const output = join(dir, 'output.txt');
  const summaryFile = join(dir, 'summary.md');
  await writeFile(event, JSON.stringify({ pull_request: { base: { sha: h.main1 }, head: { sha: h.only } } }));
  const { stdout } = await run(process.execPath, [GATE, 'plan'], {
    cwd: h.root,
    env: { ...h.env, GITHUB_EVENT_NAME: 'pull_request', GITHUB_REF: 'refs/pull/1/merge', GITHUB_SHA: h.prMerge, GITHUB_EVENT_PATH: event, GITHUB_OUTPUT: output, GITHUB_STEP_SUMMARY: summaryFile },
    encoding: 'utf8',
  });
  const lines = (await readFile(output, 'utf8')).trim().split('\n');
  assert.deepEqual(lines.slice(0, 5), ['tools=false', 'cards=false', 'capture=false', 'mindboard=true', 'ai-client=false']);
  const reasons = JSON.parse(lines.find(line => line.startsWith('reasons='))!.slice('reasons='.length)) as Record<string, string>;
  assert.match(reasons.mindboard, /完整檢查（改到 apps\/Mindboard\/b\.ts）/);
  assert.match(lines.find(line => line.startsWith('compare='))!, new RegExp(`${h.start}\\.\\.${h.only}`));
  assert.match(stdout, new RegExp(`checkout：${h.only}`));
  assert.match(await readFile(summaryFile, 'utf8'), /Mindboard：跑/);
});
