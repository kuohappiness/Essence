// 比較測試工具的門檻（tasks/rule-test-tool.md §6-3、§8 第 13 條）：自編的逐份指標，預期值是手算的字面值。
import test from 'node:test';
import assert from 'node:assert/strict';
import type { Gates } from '../tools/rule-test/config.ts';
import { allGates, judgeGates } from '../tools/rule-test/gates.ts';
import type { DeckMetrics } from '../tools/rule-test/unblind.ts';

function deck(group: string, more: Partial<DeckMetrics> = {}): DeckMetrics {
  return {
    batch: 1, lesson: 'L3', block: 'L3-B01', code: 'S1', group, generator: 'claude', copy: 1, replacement: false, late: false,
    required: { 有: 3, 部分: 0, 沒有: 0 }, missed: [], partial: [], bonus: { 有: 0, 部分: 0, 沒有: 0 }, disagreements: 0,
    major: 0, majorBoth: 0, majorRuled: 0, quality: { 洩漏: 0, 多解: 0, 一題多事: 0, 池裡判準不同: 0, 其他品質: 0 }, qualityTotal: 0, qualityBoth: 0, qualityOne: 0,
    nearDuplicates: 0, crossRows: 0, crossWrong: 0, childErrors: 0, childErrorsNoMulti: 0, perQuestion: 0,
    targets: 10, prompts: 10, candidates: 0, adds: 0, unsaveable: false, rulesChars: 1000, promptChars: 5000, generationMs: 60_000, costUsd: null,
    leakCandidates: [], worthLearning: 0, byJudge: {}, issues: [], ...more,
  };
}
const many = (group: string, values: number[], pick: (value: number) => Partial<DeckMetrics>): DeckMetrics[] => values.map((value, i) => deck(group, { code: `${group}${String(i)}`, copy: i + 1, ...pick(value) }));
const GATES: Gates = {
  baseline: '現行', candidates: ['候選'], generators: ['claude'], majorErrors: 'zero', rowMissGap: 0.5, missedRows: 1, nearDuplicates: 0,
  benefits: [{ metric: '規則字數', atLeast: 0.2 }, { metric: '孩子會碰到的錯', atLeast: 0.2 }], noWorse: [{ metric: '題數', tolerance: 0.1 }],
};

void test('1 份對 1 份：固定指標達到算收益；會變的指標平均達到標份數不夠；超過容許量算未定', () => {
  const result = judgeGates(GATES, [deck('候選', { rulesChars: 700, childErrors: 2, prompts: 30 })], [deck('現行', { missed: ['R3'], required: { 有: 2, 部分: 0, 沒有: 1 }, childErrors: 4, prompts: 25 })]);
  assert.deepEqual(result.benefits.map(each => [each.pass, each.text]), [
    [true, '收益 規則字數：候選 700.0、基準 1000.0，少 30%（設定至少 20%）→ 達到'],
    [true, '收益 孩子會碰到的錯：候選 2.0、基準 4.0，少 50%（設定至少 20%）→ 平均達到（份數不夠）'],
  ]);
  assert.deepEqual(result.noWorse.map(each => [each.pass, each.text]), [[null, '不能變差 題數：候選 30.0、基準 25.0，多 20%（容許 10%）→ 未定（份數不夠）']]);
  assert.deepEqual([result.major.pass, result.rows.pass, result.total.pass, result.nearDuplicates.pass, result.verdict], [true, true, true, true, '未定']);
  // 重大錯誤設定零：候選有一份不是 0 就沒過。
  const zero = judgeGates(GATES, [deck('候選', { major: 1, rulesChars: 700 })], [deck('現行')]);
  assert.deepEqual([zero.major.pass, zero.major.text, zero.verdict], [false, '重大錯誤：候選 1 份裡有 1 份有（共 1 筆）；設定是零', '沒過']);
});

void test('2 份對 2 份：重大錯誤不比基準多（列出只有候選才有的）；逐列多漏到設定的差距就沒過', () => {
  const major = (rubric: string): DeckMetrics['issues'] => [{ kind: '重大錯誤', at: ['目標 1'], lines: [2], judges: ['codex', 'claude'], rubric, notes: [] }];
  const candidate = [deck('候選', { major: 1, issues: major('M2'), missed: ['R1'], rulesChars: 700 }), deck('候選', { code: 'S2', missed: ['R1'], rulesChars: 700 })];
  const baseline = [deck('現行', { code: 'S3', major: 1, issues: major('M1'), missed: ['R1'] }), deck('現行', { code: 'S4', major: 1, issues: major('M1') })];
  const result = judgeGates({ ...GATES, majorErrors: 'notMore' }, candidate, baseline);
  assert.deepEqual([result.major.pass, result.major.text], [true, '重大錯誤：候選每份平均 0.5、基準 1.0，不比基準多；只有候選才有的：M2']);
  assert.deepEqual([result.rows.pass, result.rows.text], [false, '逐列：多漏 R1（候選 2／2、基準 1／2）；設定是漏的比例高出 0.5 以上算多漏']);
  assert.deepEqual([result.total.pass, result.total.text], [true, '總數：候選每份漏 1.0 列、基準 0.5 列；設定是多 1 列以上算多漏']);
  assert.equal(result.verdict, '沒過');
});

void test('3 份對 3 份：9 場全贏又少兩成以上才明顯達到；贏 7.5 場不明顯；隨便各抽一份候選比較好的機會', () => {
  const clear = judgeGates({ ...GATES, benefits: [{ metric: '孩子會碰到的錯', atLeast: 0.2 }] }, many('候選', [0, 1, 2], value => ({ childErrors: value })), many('現行', [3, 4, 5], value => ({ childErrors: value })));
  assert.deepEqual([clear.benefits[0].pass, clear.benefits[0].text], [true, '收益 孩子會碰到的錯：候選 1.0、基準 4.0，少 75%（設定至少 20%），贏 9／9 場（要 9 場）→ 明顯達到']);
  assert.deepEqual([clear.noWorse[0].pass, clear.verdict, clear.chance.孩子會碰到的錯], [true, '過', 1]);
  const unclear = judgeGates({ ...GATES, benefits: [{ metric: '孩子會碰到的錯', atLeast: 0.2 }] }, many('候選', [0, 1, 4], value => ({ childErrors: value })), many('現行', [3, 4, 5], value => ({ childErrors: value })));
  assert.deepEqual([unclear.benefits[0].pass, unclear.benefits[0].text], [false, '收益 孩子會碰到的錯：候選 1.7、基準 4.0，少 58.3%（設定至少 20%），贏 7.5／9 場（要 9 場）→ 沒達到（不明顯）']);
  assert.deepEqual([unclear.verdict, unclear.chance.孩子會碰到的錯], ['沒過', 7.5 / 9]);
});

void test('4 份對 4 份：變差超過容許量，基準贏 16 場（要 15）算沒過；只贏 12 場算未定', () => {
  const worse = judgeGates(GATES, many('候選', [20, 21, 22, 23], value => ({ prompts: value, rulesChars: 700 })), many('現行', [10, 11, 12, 13], value => ({ prompts: value })));
  assert.deepEqual([worse.noWorse[0].pass, worse.noWorse[0].text, worse.verdict], [false, '不能變差 題數：候選 21.5、基準 11.5，多 87%（容許 10%），基準贏 16／16 場（要 15 場）→ 沒過（明顯）', '沒過']);
  const unsure = judgeGates(GATES, many('候選', [20, 21, 22, 23], value => ({ prompts: value, rulesChars: 700 })), many('現行', [10, 11, 12, 30], value => ({ prompts: value })));
  assert.deepEqual([unsure.noWorse[0].pass, unsure.noWorse[0].text, unsure.verdict], [null, '不能變差 題數：候選 21.5、基準 15.8，多 36.5%（容許 10%），基準贏 12／16 場（要 15 場）→ 未定（不明顯）', '未定']);
});

void test('5 份對 5 份要 21 場：贏 17 場不明顯；3 份對 2 份份數不夠，只看平均', () => {
  const five = judgeGates({ ...GATES, benefits: [{ metric: '孩子會碰到的錯', atLeast: 0.2 }] }, many('候選', [1, 2, 3, 4, 5], value => ({ childErrors: value })), many('現行', [2, 3, 4, 5, 6], value => ({ childErrors: value })));
  assert.equal(five.benefits[0].text, '收益 孩子會碰到的錯：候選 3.0、基準 4.0，少 25%（設定至少 20%），贏 17／25 場（要 21 場）→ 沒達到（不明顯）');
  const few = judgeGates({ ...GATES, benefits: [{ metric: '孩子會碰到的錯', atLeast: 0.2 }] }, many('候選', [0, 1, 2], value => ({ childErrors: value })), many('現行', [3, 4], value => ({ childErrors: value })));
  assert.deepEqual([few.benefits[0].pass, few.benefits[0].text, few.verdict], [true, '收益 孩子會碰到的錯：候選 1.0、基準 3.5，少 71.4%（設定至少 20%）→ 平均達到（份數不夠）', '過']);
});

void test('逐課、逐算門檻的生成器判；基準只取和候選同一區組的份，不算門檻的生成器只報告', () => {
  const decks = [
    deck('候選', { code: 'S1', rulesChars: 700 }), deck('現行', { code: 'S2' }),
    deck('現行', { code: 'S2', block: 'L3-B02', rulesChars: 1 }), deck('精簡', { code: 'S3', block: 'L3-B02' }),
    deck('候選', { code: 'S4', generator: 'codex', rulesChars: 700 }), deck('現行', { code: 'S5', generator: 'codex' }),
  ];
  const results = allGates(GATES, decks);
  assert.deepEqual(results.map(each => [each.lesson, each.generator, each.candidate, each.counts.baseline, each.benefits[0].text]), [
    ['L3', 'claude', '候選', 1, '收益 規則字數：候選 700.0、基準 1000.0，少 30%（設定至少 20%）→ 達到'],
  ]);
});
