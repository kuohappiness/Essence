import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DecisionsError, buildIndex, currentRefs, decisionPart, isNormative, linksOf, parseDecisions, query } from '../decisions.ts';

// 舊路徑轉呼叫新工具：AGENTS.md 與舊文件寫的指令照樣能用。
const shim = fileURLToPath(new URL('../../experiments/tools/decisions-index.mjs', import.meta.url));
const script = fileURLToPath(new URL('../decisions-index.ts', import.meta.url));
const real = fileURLToPath(new URL('../../docs/decisions.md', import.meta.url));
const run = (...args: string[]) => spawnSync(process.execPath, [shim, ...args], { encoding: 'utf8' });
const hash = async (path: string) => createHash('sha256').update(await readFile(path)).digest('hex');

// D-001 的狀態行提到 D-002、D-003，兩者都指到 D-004；D-003 提到比自己小的 D-001 不算；D-005 已取代 → D-004。
const fixture = [
  '# 決策紀錄',
  '',
  '## 索引',
  '',
  '| 決定 | 一句話 | 日期 | 狀態 |',
  '|---|---|---|---|',
  '| [D-004 丁](#d-004-丁) | 丁的一句話。 | 2026-01-04 | ✅ |',
  '',
  '---',
  '',
  '## D-001 甲',
  '',
  '✅ 2026-01-01｜補充見 D-002、D-003',
  '',
  '甲的內文。',
  '',
  '## D-002 乙',
  '',
  '✅ 2026-01-02｜後續見 D-004',
  '',
  '**決定**：',
  '',
  '- 乙的決定。',
  '',
  '**理由**：',
  '',
  '- 乙的理由。',
  '',
  '## D-003 丙',
  '',
  '✅ 2026-01-03｜見 D-004、D-001',
  '',
  '```markdown',
  '## D-099 程式碼區塊裡的不算',
  '```',
  '',
  '## D-004 丁',
  '',
  '✅ 2026-01-04',
  '',
  '## D-005 戊',
  '',
  '已取代 → [D-004](#d-004-丁)｜2026-01-05',
  '',
].join('\n');

async function fixtureFile(t: { after: (fn: () => Promise<void>) => void }, text = fixture) {
  const dir = await mkdtemp(join(tmpdir(), 'essence-decisions-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const path = join(dir, 'decisions.md');
  await writeFile(path, text);
  return { dir, path };
}

const headingsOf = (stdout: string) => stdout.split('\n').filter(line => line.startsWith('## D-')).map(line => line.slice(3, 8));

void test('--deep 照改之前的行為：指定條目與狀態行明示的後續條目全文，遞迴、去重、照出現順序，不改檔', async t => {
  const { path } = await fixtureFile(t);
  const before = await hash(path);
  const one = run('--file', path, 'D-001', '--deep');
  assert.equal(one.status, 0);
  // 開頭那句和舊工具（experiments/tools/decisions-index.mjs，6b16b47）逐字相同（L2 R11）。
  assert.ok(one.stdout.startsWith('以下是原文與明示的後續條目，不等於完整的現行規則；實作以 product、architecture、syntax 與任務說明為準。\n\n'));
  // D-099 那一行是 D-003 內文的程式碼區塊，跟著 D-003 印出，但不是一條決定。
  assert.deepEqual(headingsOf(one.stdout), ['D-001', 'D-002', 'D-003', 'D-099', 'D-004']);
  assert.match(one.stdout, /甲的內文。/);
  assert.equal(run('--file', path, 'D-099').status, 1);
  assert.deepEqual(headingsOf(run('--file', path, 'D-005', '--deep').stdout), ['D-005', 'D-004']);
  assert.deepEqual(headingsOf(run('--file', path, 'd-4', 'D-002', 'D-004', '--deep').stdout), ['D-004', 'D-002']);
  assert.equal(await hash(path), before);
});

void test('預設只印一層：本條全文與「現行寫在」，直接的後續只印〈決定〉，更深的一行一句話', async t => {
  const { dir, path } = await fixtureFile(t);
  // 規範文件從 --root 的 Git 追蹤檔找：AGENTS.md 提到 D-001，任務說明提到不算（不是規範文件）。
  execFileSync('git', ['init', '-q'], { cwd: dir });
  await writeFile(join(dir, 'AGENTS.md'), '# 協作\n\n## 底線\n\n- 照 D-001 做。\n');
  await mkdir(join(dir, 'docs', 'tasks'), { recursive: true });
  await writeFile(join(dir, 'docs', 'tasks', 'x.md'), '# x\n\nD-001\n');
  execFileSync('git', ['add', '-A'], { cwd: dir });
  const out = run('--file', path, '--root', dir, 'D-001');
  assert.equal(out.status, 0);
  const text = out.stdout;
  assert.match(text, /^## D-001 甲\n\n✅ 2026-01-01｜補充見 D-002、D-003\n\n甲的內文。\n\n現行寫在：AGENTS\.md〈底線〉\n/m);
  // 直接的後續 D-002、D-003：D-002 只印標題與〈決定〉（沒有狀態行、理由）；D-003 沒有〈決定〉小標，註明後印全文（狀態行只出現一次）。
  assert.match(text, /## D-002 乙\n\n\*\*決定\*\*：\n\n- 乙的決定。\n/);
  assert.doesNotMatch(text, /乙的理由|後續見 D-004/);
  assert.match(text, /## D-003 丙\n\n（這條沒有〈決定〉小標，印全文）\n\n✅ 2026-01-03｜見 D-004、D-001\n/);
  assert.equal((text.match(/✅ 2026-01-03/g) ?? []).length, 1);
  // 更深的 D-004 一行，一句話取現有索引。
  assert.match(text, /更深的後續：\n\n- D-004 丁：丁的一句話。\n?$/);
  assert.equal((text.match(/^## D-004/gm) ?? []).length, 0);
  // 沒有規範文件引用的照實寫。
  assert.match(run('--file', path, '--root', dir, 'D-004').stdout, /現行寫在：沒有規範文件引用/);
});

void test('查詢未知的 D-ID 報到 stderr、exit code 1、什麼都不印', async t => {
  const { path } = await fixtureFile(t);
  const before = await hash(path);
  const result = run('--file', path, 'D-001', 'D-999');
  assert.equal(result.status, 1);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /D-999/);
  assert.equal(await hash(path), before);
});

void test('查詢真正的決策紀錄前後逐位元組相同；D-117 預設的輸出比 --deep 短很多', async () => {
  const before = await hash(real);
  const result = run('D-099');
  assert.equal(result.status, 0);
  assert.deepEqual(headingsOf(result.stdout).slice(0, 1), ['D-099']);
  const one = [...spawnSync(process.execPath, [script, 'D-117'], { encoding: 'utf8' }).stdout].length;
  const deep = [...spawnSync(process.execPath, [script, 'D-117', '--deep'], { encoding: 'utf8' }).stdout].length;
  assert.ok(one * 3 < deep, `預設 ${one} 字、--deep ${deep} 字`);
  assert.equal(await hash(real), before);
});

void test('主題對照表和決策紀錄對不上時報錯且不寫檔', async t => {
  const { path } = await fixtureFile(t);
  const before = await hash(path);
  const result = run('--file', path);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /主題有問題，未修改檔案/);
  assert.match(result.stderr, /D-006 不存在/);
  assert.equal(await hash(path), before);
});

void test('分組索引由工具產生：真正的決策紀錄和工具產生的一模一樣（改了決定沒重產就擋）；重跑兩次沒有差異', async t => {
  const { dir } = await fixtureFile(t);
  const copy = join(dir, 'real.md');
  await copyFile(real, copy);
  const original = await readFile(copy, 'utf8');
  execFileSync(process.execPath, [script, '--file', copy], { stdio: 'pipe' });
  const once = await readFile(copy, 'utf8');
  assert.equal(once, original, '決策紀錄的索引不是最新的：執行 node tools/decisions-index.ts 重產');
  execFileSync(process.execPath, [script, '--file', copy], { stdio: 'pipe' });
  assert.equal(await readFile(copy, 'utf8'), once);
  const ids = once.replace(/\r\n/g, '\n').split('\n').filter(line => line.startsWith('| [D-')).map(row => /^\| \[(D-\d+) /.exec(row)?.[1]);
  assert.equal(new Set(ids).size, ids.length);
  assert.match(once, /^## 索引\r?\n[\s\S]*?^### 產品與範圍\r?$/m);
});

// 新寫法（分界設成 D-006）：D-006 來自 plans、修改 D-002；D-007 取代 D-003。舊決定的狀態行不用改。
const newer = fixture + [
  '## D-006 己',
  '',
  '✅ 2026-01-06｜來自 [plans/a](plans/a.md#一節)｜修改 [D-002](#d-002-乙)（第 1 點）',
  '',
  '主題：協作與文件｜一句話：己的一句話。',
  '',
  '適用：全部',
  '',
  '## D-007 庚',
  '',
  '✅ 2026-01-07｜使用者提出｜取代 [D-003](#d-003-丙)',
  '',
  '主題：畫面｜一句話：庚的一句話。',
  '',
].join('\n');
const LEGACY = { '協作與文件': ['D-001', 'D-002', 'D-004'], '畫面': ['D-003', 'D-005'] };

void test('新寫法：從「來自／修改」反推後續見、從「取代」反推已取代；主題與一句話讀條目', () => {
  const parsed = parseDecisions(newer, 6);
  const links = linksOf(parsed);
  assert.deepEqual(links.get('D-002'), { next: ['D-004', 'D-006'] });
  assert.deepEqual(links.get('D-003'), { next: ['D-004', 'D-007'], supersededBy: 'D-007' });
  assert.deepEqual(parsed.byId.get('D-006')!.sources, ['plans/a.md#一節']);
  const { updated } = buildIndex(parsed, LEGACY);
  const row = (id: string) => updated.split('\n').find(line => line.startsWith(`| [${id} `));
  assert.equal(row('D-002'), '| [D-002 乙](#d-002-乙) |  | 2026-01-02 | ✅ 後續見 [D-004](#d-004-丁)、[D-006](#d-006-己) |');
  assert.equal(row('D-003'), '| [D-003 丙](#d-003-丙) |  | 2026-01-03 | 已取代 → [D-007](#d-007-庚) |');
  assert.equal(row('D-006'), '| [D-006 己](#d-006-己) | 己的一句話。 | 2026-01-06 | ✅ |');
  assert.equal(row('D-004'), '| [D-004 丁](#d-004-丁) | 丁的一句話。 | 2026-01-04 | ✅ |');
  assert.ok(updated.indexOf('| [D-007 ') > updated.indexOf('### 畫面'));
  // 預設查詢：D-003 的直接後續是 D-004 與取代它的 D-007（D-099 是 D-003 全文裡程式碼區塊的一行）。
  assert.deepEqual(headingsOf(query(parsed, ['D-003'])), ['D-003', 'D-099', 'D-004', 'D-007']);
  // --deep 也列出反推出的後續。
  assert.deepEqual(headingsOf(query(parsed, ['D-002'], { deep: true })), ['D-002', 'D-004', 'D-006']);
});

void test('新寫法的條目少了主題或一句話、主題不在索引裡、凍結表放了新決定：報錯不產生', () => {
  const missing = newer.replace('主題：畫面｜一句話：庚的一句話。', '');
  assert.throws(() => buildIndex(parseDecisions(missing, 6), LEGACY), (e: unknown) => e instanceof DecisionsError && /D-007 少了「主題：…｜一句話：…」/.test(e.message));
  const unknown = newer.replace('主題：畫面', '主題：雜項');
  assert.throws(() => buildIndex(parseDecisions(unknown, 6), LEGACY), /D-007 的主題「雜項」不是索引的主題之一/);
  assert.throws(() => buildIndex(parseDecisions(newer, 6), { ...LEGACY, '畫面': ['D-003', 'D-005', 'D-007'] }), /D-007 是 D-6 起的決定/);
  // 狀態行「來自／修改／補充／取代」段裡的 D-ID 要存在、而且比自己小；其他段不看。
  assert.throws(() => parseDecisions(newer.replace('修改 [D-002](#d-002-乙)', '修改 [D-008](#d-008)'), 6), /D-006 的狀態行「修改」那一段提到 D-008/);
  assert.throws(() => parseDecisions(newer.replace('取代 [D-003](#d-003-丙)', '取代 D-007'), 6), /D-007 的狀態行「取代」那一段提到 D-007/);
  assert.doesNotThrow(() => parseDecisions(newer.replace('使用者提出', '使用者提出，見 D-009'), 6));
});

void test('〈決定〉那一段：到下一個行首粗體小標為止；沒有小標回 undefined', () => {
  assert.equal(decisionPart('## D-1 a\n\n**決定**（使用者同意）：\n\n- 一\n- **粗體**不算小標\n\n**理由**：\n\n- 二\n'), '**決定**（使用者同意）：\n\n- 一\n- **粗體**不算小標');
  assert.equal(decisionPart('## D-1 a\n\n內文\n'), undefined);
});

void test('現行寫在：規範文件與最近的標題，同一份檔的標題接在一起；程式碼區塊裡的 # 與 D-ID 都不算', () => {
  const refs = currentRefs([
    { path: 'docs/agents/workflow.md', text: '# 規範\n\n## 決定\n\nD-214 與 D-215\n\n```text\n# 不是標題\nD-214、D-216\n```\n\n## 狀態行\n\n照 D-214。\n' },
    { path: 'AGENTS.md', text: '前言提到 D-214\n\n# 協作\n' },
  ]);
  assert.deepEqual(refs.get('D-214'), ['AGENTS.md', 'docs/agents/workflow.md〈決定〉〈狀態行〉']);
  assert.deepEqual(refs.get('D-215'), ['docs/agents/workflow.md〈決定〉']);
  // 程式碼區塊裡的 D-ID 是範例，不算引用。
  assert.equal(refs.get('D-216'), undefined);
  for (const path of ['AGENTS.md', 'plugins/cards/AGENTS.md', 'docs/product.md', 'plugins/cards/docs/syntax.md', 'plugins/cards/docs/card-rules/english.md',
    'docs/agents/quality.md', 'docs/agents/workflow.md', '.claude/skills/essence-decision/SKILL.md', 'docs/transcript.md', 'docs/ai-models.md']) assert.ok(isNormative(path), path);
  for (const path of ['docs/tasks/x.md', 'plugins/cards/docs/card-rules/trials.md', 'docs/agents/token-usage.md', 'docs/agents/token-usage/a.md',
    '.agents/skills/essence-decision/SKILL.md', 'docs/decisions.md', 'docs/roadmap.md']) assert.ok(!isNormative(path), path);
});

void test('轉呼叫從任何工作目錄都能跑', () => {
  const result = spawnSync(process.execPath, [shim, 'D-001', '--deep'], { encoding: 'utf8', cwd: dirname(real) });
  assert.equal(result.status, 0);
  assert.deepEqual(headingsOf(result.stdout).slice(0, 1), ['D-001']);
});
