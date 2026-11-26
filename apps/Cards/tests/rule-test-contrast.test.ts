// 比較測試工具的對照（tasks/rule-test-d236.md §8、§13 第 11 條）：自編的逐份指標，預期值是手算的字面值；
// 「現行英文＋五步」用檔案來源寫得出來：設定讀得懂、提示與加深規則組得出來。
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { readConfig, type Config } from '../tools/rule-test/config.ts';
import { allContrasts, groupDifferences } from '../tools/rule-test/contrast.ts';
import { freezeFolder, readDeepenFrozen, readFrozenSteps } from '../tools/rule-test/freeze.ts';
import { openFolder } from '../tools/rule-test/folder.ts';
import type { DeckMetrics } from '../tools/rule-test/unblind.ts';

type Harm = DeckMetrics['harm'];
const harm = (more: Partial<Harm> = {}): Harm => ({ 判錯: 0, 洩漏: 0, 漏的必備: 0, 其他: 0, total: 0, ...more });
function deck(group: string, more: Partial<DeckMetrics> = {}): DeckMetrics {
  return {
    batch: 1, lesson: 'L3', block: 'L3-B01', code: 'S1', group, generator: 'claude', copy: 1, replacement: false, late: false,
    required: { 有: 3, 部分: 0, 沒有: 0 }, missed: [], partial: [], bonus: { 有: 0, 部分: 0, 沒有: 0 }, disagreements: 0,
    major: 0, majorBoth: 0, majorRuled: 0, majorTotal: 0,
    quality: { 判錯: 0, 洩漏: 0, 其他傷到學習: 0, 一題多事: 0, 池裡判準不同: 0, 小問題: 0 }, qualityTotal: 0, qualityBoth: 0, qualityOne: 0,
    harm: harm(), minor: 0, nearDuplicates: 0, duplicateGroups: 0, extraPrompts: 0, whyMissing: 0, crossRows: 0, crossWrong: 0,
    childPrompts: 9, sureRequired: 3, perRequired: 3,
    targets: 9, prompts: 9, candidates: 0, adds: 0, unsaveable: false, rulesChars: 1000, promptChars: 5000, generationMs: 60_000, costUsd: null,
    tokens: { input: 1000, output: 100 }, deepenTokens: null, map: null, deepen: null,
    leakCandidates: [], worthLearning: 0, byJudge: {}, issues: [], ...more,
  };
}
const wrong = (value: number): Partial<DeckMetrics> => ({ harm: harm({ 判錯: value, total: value }) });

const YAML = (commit: string): string => `
名稱: 對照測試
課庫: 課
課: [{ 代號: L3, 表單: { 科目: english, 年級學期: 國二上, 單元: L3 } }]
組:
  - { 名稱: 現行, 規則: { 外掛: english } }
  - 名稱: 現行＋五步
    規則: { commit: ${commit}, 檔案: [apps/Cards/docs/card-rules/common.md, apps/Cards/docs/card-rules/english.md, apps/Cards/docs/card-rules/next/five-steps.md], 任務段: { 三段: 要 } }
    加深規則: { commit: ${commit}, 檔案: [apps/Cards/docs/card-rules/common.md, apps/Cards/docs/card-rules/english.md] }
  - 名稱: 候選
    規則: { commit: ${commit}, 檔案: [apps/Cards/docs/card-rules/next/core.md, apps/Cards/docs/card-rules/next/english.md, apps/Cards/docs/card-rules/next/five-steps.md], 任務段: { 三段: 要, 已有目標清單: 精簡 } }
    加深規則: { commit: ${commit}, 檔案: [apps/Cards/docs/card-rules/next/core.md, apps/Cards/docs/card-rules/next/english.md] }
生成: [{ 生成器: claude, 模型: claude-opus-5-5, 份數: 3 }, { 生成器: codex, 模型: gpt-6.2-sol, 份數: 3 }]
評審: [{ 評審: codex, 模型: gpt-6.2-sol }, { 評審: claude, 模型: claude-fable-5-2 }]
門檻: { 基準: 現行, 候選: [候選], 生成器: [claude], 收益: [{ 指標: 判錯, 至少: 20% }] }
對照: [{ 名稱: 五步的效果, 甲: 現行＋五步, 乙: 現行 }, { 名稱: 英文模組重寫的效果, 甲: 候選, 乙: 現行＋五步 }]
`;
const config = (): Config => readConfig(YAML('288ba1ef'));

void test('對照的設定差別：外掛和檔案來源照檔案路徑比，看得出只差五步；任務段與加深規則逐項列出', () => {
  const { groups } = config();
  const [current, five, candidate] = groups;
  assert.deepEqual(groupDifferences(five, current), [
    '規則來源：甲 檔案（commit 288ba1ef）、乙 外掛 english（凍結時的工作樹）',
    '規則檔：只有甲有 apps/Cards/docs/card-rules/next/five-steps.md',
    '任務段 三段：甲 要、乙 不要',
    '加深規則來源：甲 檔案（commit 288ba1ef）、乙 外掛 english（凍結時的工作樹）',
  ]);
  assert.deepEqual(groupDifferences(candidate, five), [
    '規則檔：只有甲有 apps/Cards/docs/card-rules/next/core.md、apps/Cards/docs/card-rules/next/english.md；只有乙有 apps/Cards/docs/card-rules/common.md、apps/Cards/docs/card-rules/english.md',
    '任務段 已有目標清單：甲 精簡、乙 原寫法',
    '加深規則檔：只有甲有 apps/Cards/docs/card-rules/next/core.md、apps/Cards/docs/card-rules/next/english.md；只有乙有 apps/Cards/docs/card-rules/common.md、apps/Cards/docs/card-rules/english.md',
  ]);
  assert.deepEqual(groupDifferences(current, { ...current, name: '另一份現行' }), ['設定一樣（只差組名）']);
});

void test('對照逐課、逐生成器、逐批：平均、差、兩兩比的場數、明不明顯；固定的指標不判明顯；不適用的跳過', () => {
  const decks = [
    ...[0, 0, 0].map((value, i) => deck('現行＋五步', { code: `A${String(i)}`, copy: i + 1, rulesChars: 1500, ...wrong(value) })),
    ...[1, 2, 3].map((value, i) => deck('現行', { code: `B${String(i)}`, copy: i + 1, ...wrong(value) })),
  ];
  const [five, rewrite] = allContrasts(config(), decks);
  assert.deepEqual([five.name, five.a, five.b], ['五步的效果', '現行＋五步', '現行']);
  assert.equal(five.results.length, 1);
  const [result] = five.results;
  assert.deepEqual([result.lesson, result.generator, result.batch, result.counts], ['L3', 'claude', 1, { a: 3, b: 3 }]);
  const line = (metric: string): string => result.metrics.find(each => each.metric === metric)!.text;
  // 3 對 3 全贏：1/C(6,3)＝5%，含等號算明顯。
  assert.equal(line('判錯'), '判錯：甲 0.0、乙 2.0，差 -2.0（甲少）；甲贏 9／9 場；p＝5%，明顯');
  assert.equal(line('傷到學習'), '傷到學習：甲 0.0、乙 2.0，差 -2.0（甲少）；甲贏 9／9 場；p＝5%，明顯');
  assert.equal(line('多餘的題'), '多餘的題：甲 0.0、乙 0.0，一樣');
  assert.equal(line('地圖漏的必備'), '地圖漏的必備：跳過（乙不適用（凍結時就知道））');
  assert.equal(line('規則字數'), '規則字數：甲 1500.0、乙 1000.0，差 +500.0（甲多）；固定的數，不判明顯');
  assert.equal(line('整份提示字數'), '整份提示字數：甲 5000.0、乙 5000.0，一樣');
  // 第二個對照的乙（現行＋五步）有，甲（候選）沒有：列出缺的一邊，不報數字。
  assert.deepEqual(rewrite.results, []);
  assert.deepEqual(rewrite.missing, ['批 1 L3｜claude：甲（候選）沒有份']);
});

void test('對照只收同一個區組的份：缺乙的區組列出來；份數不到 3 份不判明顯', () => {
  const decks = [
    deck('現行＋五步', { code: 'A1', ...wrong(0) }), deck('現行', { code: 'B1', ...wrong(1) }),
    deck('現行＋五步', { code: 'A2', block: 'L3-B02', ...wrong(0) }),
    deck('現行', { code: 'B3', generator: 'codex', block: 'L3-B03' }),
  ];
  const [five] = allContrasts(config(), decks);
  assert.equal(five.results.length, 1);
  assert.deepEqual(five.results[0].counts, { a: 1, b: 1 });
  assert.equal(five.results[0].metrics.find(each => each.metric === '判錯')!.text, '判錯：甲 0.0、乙 1.0，差 -1.0（甲少）；甲贏 1／1 場；份數不夠，不判明顯');
  assert.deepEqual(five.missing, ['批 1 L3｜claude：甲有 1 份的區組沒有乙（L3-B02）', '批 1 L3｜codex：甲（現行＋五步）沒有份']);
  // 組多於 4 拆區組時，同一份現行（B1）在 B01、B02 各評一次：B02 沒有甲那一次不算缺（§5-6）。
  const split = allContrasts(config(), [deck('現行＋五步', { code: 'A1' }), deck('現行', { code: 'B1' }), deck('現行', { code: 'B1', block: 'L3-B02' }), deck('候選', { code: 'C1', block: 'L3-B02' })])[0];
  assert.deepEqual(split.missing, []);
});

/** 一個有現行英文規則、候選規則與一份五步檔的 git repo（不碰真的 repo）。 */
function fixtureRepo(): { root: string; commit: string } {
  const root = mkdtempSync(join(tmpdir(), 'rule-test-repo-'));
  const real = join(import.meta.dirname, '..', '..', '..');
  const copy = (path: string, text?: string): void => {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text ?? readFileSync(join(real, path)));
  };
  copy('apps/Cards/docs/card-rules/common.md');
  copy('apps/Cards/docs/card-rules/english.md');
  copy('apps/Cards/docs/card-rules/next/core.md', '# 核心\n\n<!-- 以下送給 AI -->\n\n## 核心規則\n- 一\n');
  copy('apps/Cards/docs/card-rules/next/english.md', '# 英文\n\n<!-- 以下送給 AI -->\n\n## 英文規則\n- 二\n');
  copy('apps/Cards/docs/card-rules/next/five-steps.md', '# 五步\n\n<!-- 以下送給 AI -->\n\n## 先畫全貌，再倒推目標\n- 五步的內容\n');
  copy('apps/Cards/src/.keep', '');
  const git = (...args: string[]): string => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
  git('init', '-q');
  git('-c', 'user.name=t', '-c', 'user.email=t@example.com', 'add', '.');
  git('-c', 'user.name=t', '-c', 'user.email=t@example.com', 'commit', '-q', '-m', 'fixture');
  return { root, commit: git('rev-parse', 'HEAD') };
}

void test('「現行英文＋五步」用檔案來源寫得出來：設定讀得懂，提示是現行英文規則＋五步＋交三段的任務段，加深送現行的規則', async () => {
  const { root, commit } = fixtureRepo();
  const folder = mkdtempSync(join(tmpdir(), 'rule-test-'));
  const vault = join(folder, 'vault');
  mkdirSync(join(vault, 'Essence Cards'), { recursive: true });
  writeFileSync(join(vault, 'Essence Cards', 'L1.md'), '---\n科目: 英文\n年級學期: 國二上\n單元: L1\n狀態: 啟用\n---\n- go 英翻中 ^aaaaa2\n    - go :: 去\n');
  mkdirSync(join(folder, '課', 'L3'), { recursive: true });
  writeFileSync(join(folder, '課', 'L3', '教材.pdf'), '%PDF-1.4 假的');
  writeFileSync(join(folder, '測試.yaml'), YAML(commit)
    .replace('單元: L3 } }]', `單元: L3 }, 已有目標: { vault: ${JSON.stringify(vault)} } }]`)
    .replace('對照: [', '加深: { 生成器: [claude] }\n對照: ['));
  await freezeFolder(openFolder(folder), { root, log: () => {} });
  const steps = readFrozenSteps(openFolder(folder));
  const five = steps.find(step => step.file === '現行＋五步-L3.md')!;
  const text = readFileSync(join(folder, '凍結', '提示', five.file), 'utf8');
  const common = readFileSync(join(root, 'apps/Cards/docs/card-rules/common.md'), 'utf8');
  assert.deepEqual(five.parts.map(part => part.name), ['common.md', 'english.md', 'five-steps.md']);
  assert.equal(five.threeSections, true);
  assert.ok(text.includes('## 先畫全貌，再倒推目標\n- 五步的內容\n\n## 這一次的任務'));
  assert.ok(text.includes(common.split('<!-- 以下送給 AI -->')[1].trim().split('\n')[0]));
  const frozen = readDeepenFrozen(openFolder(folder));
  assert.deepEqual(Object.keys(frozen.groups), ['現行', '候選', '現行＋五步']);
  assert.deepEqual(frozen.groups['現行＋五步'].map(rule => rule.name), ['common.md', 'english.md']);
  assert.ok(frozen.groups['現行＋五步'].every(rule => !rule.text.includes('五步的內容')));
});
