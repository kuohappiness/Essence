// 比較測試工具的門檻（tasks/rule-test-d236.md §7、§13 第 3、4、5、9、10 條）：自編的逐份指標，預期值是手算的字面值。
// 置換判定的機會：3 對 3 全贏是 1/C(6,3)＝1/20，4 對 4 全贏是 1/C(8,4)＝1/70。
import test from 'node:test';
import assert from 'node:assert/strict';
import { NO_WORSE_DEFAULTS, type Gates } from '../tools/rule-test/config.ts';
import { allGates, judgeGates } from '../tools/rule-test/gates.ts';
import type { DeckMetrics, DeepenMetrics } from '../tools/rule-test/unblind.ts';

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
const many = (group: string, values: number[], pick: (value: number) => Partial<DeckMetrics>): DeckMetrics[] => values.map((value, i) => deck(group, { code: `${group}${String(i)}`, copy: i + 1, ...pick(value) }));
const same = (group: string, n: number, more: Partial<DeckMetrics> = {}): DeckMetrics[] => many(group, Array.from({ length: n }, () => 0), () => more);
const GATES: Gates = {
  baseline: '現行', candidates: ['候選'], generators: ['claude'], majorErrors: 'zero', rowMissGap: 0.5, missedRows: 1, extraPrompts: 0,
  harm: { percent: 0, floor: 0 }, benefits: [{ metric: '判錯', atLeast: 0.2 }], correction: true, noWorse: NO_WORSE_DEFAULTS, secondary: [], tieMinCopies: 3, tieCheaper: 'report', timeBudget: 'report',
};
const wrong = (value: number): Partial<DeckMetrics> => ({ harm: harm({ 判錯: value, total: value }) });

void test('只有一份：收益平均達到是份數不夠，總結果是未定，不是過；重大設定零時候選有一份不是 0 就沒過', () => {
  const result = judgeGates(GATES, [deck('候選')], [deck('現行', wrong(1))]);
  assert.deepEqual(result.benefits.map(each => [each.state, each.text]), [['few', '收益 判錯：候選 0.0、基準 1.0，少 100%（設定至少少 20%）→ 平均達到，份數不夠']]);
  assert.deepEqual([result.harm.pass, result.harm.text], [true, '傷到學習：候選每份 0.0、基準 1.0（容許多 0.0）→ 過']);
  assert.deepEqual([result.verdict, result.basis], ['未定', '收益平均達到，但份數不夠']);
  const zero = judgeGates(GATES, [deck('候選', { majorTotal: 1 })], [deck('現行', wrong(1))]);
  assert.deepEqual([zero.major.pass, zero.major.text, zero.verdict], [false, '重大：候選 1 份裡有 1 份有（共 1 筆，含存不了）；設定是零', '沒過']);
});

void test('存不了、沒有重大錯誤的候選對基準是 1 比 0：第 1 道沒過', () => {
  const result = judgeGates({ ...GATES, majorErrors: 'notMore' }, [deck('候選', { majorTotal: 1, unsaveable: true })], [deck('現行')]);
  assert.deepEqual([result.major.pass, result.major.text, result.verdict], [false, '重大：候選每份平均 1.0、基準 0.0（含存不了：候選 1 份、基準 0 份），比基準多', '沒過']);
});

void test('2 份對 2 份：重大不比基準多（列出只有候選才有的）；逐列多漏到設定的差距就沒過；多餘的題多出設定的量沒過', () => {
  const major = (rubric: string): DeckMetrics['issues'] => [{ kind: '重大錯誤', at: ['目標 1'], lines: [2], judges: ['codex', 'claude'], rubric, notes: [] }];
  const candidate = [deck('候選', { majorTotal: 1, issues: major('M2'), missed: ['R1'], extraPrompts: 1 }), deck('候選', { code: 'S2', missed: ['R1'] })];
  const baseline = [deck('現行', { code: 'S3', majorTotal: 1, issues: major('M1'), missed: ['R1'] }), deck('現行', { code: 'S4', majorTotal: 1, issues: major('M1') })];
  const result = judgeGates({ ...GATES, majorErrors: 'notMore' }, candidate, baseline);
  assert.deepEqual([result.major.pass, result.major.text], [true, '重大：候選每份平均 0.5、基準 1.0（含存不了：候選 0 份、基準 0 份），不比基準多；只有候選才有的：M2']);
  assert.deepEqual([result.rows.pass, result.rows.text], [false, '逐列：多漏 R1（候選 2／2、基準 1／2）；設定是漏的比例高出 0.5 以上算多漏']);
  assert.deepEqual([result.total.pass, result.total.text], [true, '總數：候選每份漏 1.0 列、基準 0.5 列；設定是多 1 列以上算多漏']);
  assert.deepEqual([result.extra.pass, result.extra.text], [false, '多餘的題（近義重複）：候選每份 0.5、基準 0.0；設定是多出 0 以內']);
  assert.equal(result.verdict, '沒過');
});

void test('傷到學習三態：3 對 3 全多是明顯，沒過；平均多但不明顯是未定', () => {
  const clear = judgeGates(GATES, many('候選', [3, 4, 5], value => ({ harm: harm({ 洩漏: value, total: value }) })), many('現行', [0, 1, 2], value => ({ harm: harm({ 洩漏: value, total: value }) })));
  assert.deepEqual([clear.harm.pass, clear.harm.text, clear.verdict], [false, '傷到學習：候選每份 4.0、基準 1.0（容許多 0.0），多了、明顯（p＝5%）→ 沒過', '沒過']);
  const unsure = judgeGates(GATES, many('候選', [1, 2, 5], value => ({ harm: harm({ 洩漏: value, total: value }) })), many('現行', [0, 1, 4], value => ({ harm: harm({ 洩漏: value, total: value }) })));
  assert.equal(unsure.harm.pass, null);
  assert.match(unsure.harm.text, /^傷到學習：候選每份 2\.7、基準 1\.7（容許多 0\.0），多了、不明顯（p＝.+）→ 未定$/);
  assert.deepEqual([unsure.verdict, unsure.basis], ['未定', '傷到學習未定']);
});

void test('少三筆洩漏、多兩筆判錯：第 3 道過；判錯在不能變差單獨一行，明顯多就沒過，多但不明顯照過、標出來', () => {
  const pick = (leak: number, judged: number): Partial<DeckMetrics> => ({ harm: harm({ 判錯: judged, 洩漏: leak, total: leak + judged }) });
  const worse = judgeGates(GATES, same('候選', 3, pick(0, 2)), same('現行', 3, pick(3, 0)));
  assert.equal(worse.harm.pass, true);
  const judgedWorse = worse.noWorse.find(each => each.metric === '判錯');
  assert.deepEqual([judgedWorse?.state, judgedWorse?.text, worse.verdict], ['worse', '不能變差 判錯：候選 2.0、基準 0.0（容許多 0.50），多了、明顯（p＝5%）→ 沒過', '沒過']);
  // 基準 [0,1,0]、候選 [1,1,1]：基準贏 7.5 場；混在一起分，兩個 0 都分到基準的 4 種分法才到 7.5 場，p＝4/20。
  const mild = judgeGates(GATES, many('候選', [1, 1, 1], value => pick(0, value)), many('現行', [0, 1, 0], value => pick(3, value)));
  const judgedMild = mild.noWorse.find(each => each.metric === '判錯');
  assert.deepEqual([judgedMild?.state, judgedMild?.pass, judgedMild?.text], ['more', true, '不能變差 判錯：候選 1.0、基準 0.3（容許多 0.50），多了、不明顯（p＝20%）→ 過，標出來']);
});

void test('不能變差的絕對下限：基準 0、候選每份 0.4 筆在容許量內', () => {
  const result = judgeGates(GATES, many('候選', [0, 1, 0, 1, 0], value => ({ harm: harm({ 判錯: value }) })), same('現行', 5));
  const judged = result.noWorse.find(each => each.metric === '判錯');
  assert.deepEqual([judged?.state, judged?.text], ['within', '不能變差 判錯：候選 0.4、基準 0.0（容許多 0.50）→ 過']);
});

void test('收益的校正：k＝3 時每一項的門檻是 5%÷3；4 對 4 全贏（1/70）明顯，3 對 3 全贏（1/20）不明顯', () => {
  const three: Gates = { ...GATES, benefits: [{ metric: '判錯', atLeast: 0.2 }, { metric: '多餘的題', atLeast: 0.2 }, { metric: '每個必備平均幾題', atLeast: 0.2 }] };
  const four = judgeGates(three, same('候選', 4), same('現行', 4, wrong(1)));
  assert.deepEqual([four.benefits[0].state, four.benefits[0].text], ['clear', '收益 判錯：候選 0.0、基準 1.0，少 100%（設定至少少 20%），p＝1.4%（門檻 1.7%）→ 明顯達到']);
  assert.deepEqual([four.verdict, four.basis], ['過', '學習面有一項明顯比較好']);
  const small = judgeGates(three, same('候選', 3), same('現行', 3, wrong(1)));
  assert.deepEqual([small.benefits[0].state, small.benefits[0].text], ['no', '收益 判錯：候選 0.0、基準 1.0，少 100%（設定至少少 20%），p＝5%（門檻 1.7%）→ 不明顯']);
  // 不校正（§12 第 3 題的 (b)）：每一項都用 5%，3 對 3 全贏剛好明顯。
  assert.equal(judgeGates({ ...three, correction: false }, same('候選', 3), same('現行', 3, wrong(1))).benefits[0].text, '收益 判錯：候選 0.0、基準 1.0，少 100%（設定至少少 20%），p＝5%（門檻 5%）→ 明顯達到');
  // 候選平均少 1 筆但不明顯：每一項的差都在容許量內（少的一定在內），學習面打平。
  assert.equal(small.verdict, '打平');
});

void test('每個必備平均幾題：候選題少，但確定考到的必備也少，不算收益', () => {
  const result = judgeGates({ ...GATES, benefits: [{ metric: '每個必備平均幾題', atLeast: 0.2 }] }, same('候選', 3, { perRequired: 1, sureRequired: 2 }), same('現行', 3, { perRequired: 3, sureRequired: 3 }));
  assert.deepEqual([result.benefits[0].pass, result.benefits[0].text], [false, '收益 每個必備平均幾題：候選 1.0、基準 3.0，少 66.7%（設定至少少 20%），但確定考到的必備候選 2.0、基準 3.0，比較少→ 不算（題少是因為少考）']);
});

void test('打平與較省：字數省 10%、token 翻倍是打平；token 一樣就是打平、候選較省，設定算過時是過；每組 2 份是未定', () => {
  const secondary: Gates['secondary'] = [{ metric: 'token', atLeast: 0.1, tolerance: 0.1 }, { metric: '規則字數', atLeast: 0.1, tolerance: 0.1 }];
  const gates: Gates = { ...GATES, secondary };
  const doubled = judgeGates(gates, same('候選', 3, { rulesChars: 900, tokens: { input: 2000, output: 200 } }), same('現行', 3));
  assert.deepEqual(doubled.secondary.map(each => [each.pass, each.text]), [
    [false, '次要 token：候選 2200.0、基準 1100.0（多 100%；設定至少少 10%、最多多 10%）→ 明顯比較多'],
    [true, '次要 規則字數：候選 900.0、基準 1000.0（少 10%；設定至少少 10%、最多多 10%）→ 明顯比較省'],
  ]);
  assert.deepEqual([doubled.verdict, doubled.basis], ['打平', '學習面打平']);
  const cheaper = judgeGates(gates, same('候選', 3, { rulesChars: 900 }), same('現行', 3));
  assert.deepEqual([cheaper.verdict, cheaper.basis], ['打平，候選較省', '學習面打平、候選較省']);
  assert.equal(judgeGates({ ...gates, tieCheaper: 'pass' }, same('候選', 3, { rulesChars: 900 }), same('現行', 3)).verdict, '過');
  // 有一份的 token 不知道：這一項沒有資料，不進次要的判斷。
  const unknown = judgeGates(gates, [...same('候選', 2), deck('候選', { code: 'S9', tokens: { input: null, output: null } })], same('現行', 3));
  assert.equal(unknown.secondary[0].text, '次要 token：沒有資料');
  const two = judgeGates(gates, same('候選', 2, { rulesChars: 900 }), same('現行', 2));
  assert.equal(two.verdict, '未定');
});

void test('次要指標的基準是 0：候選多了就是多，不當成一樣（L2 第 1 輪 H）', () => {
  const secondary: Gates['secondary'] = [{ metric: 'token', atLeast: 0.1, tolerance: 0.1 }, { metric: '規則字數', atLeast: 0.1, tolerance: 0.1 }];
  const result = judgeGates({ ...GATES, secondary }, same('候選', 3, { rulesChars: 900, tokens: { input: 5000, output: 100 } }), same('現行', 3, { tokens: { input: 0, output: 0 } }));
  assert.deepEqual([result.secondary[0].pass, result.secondary[0].text], [false, '次要 token：候選 5100.0、基準 0.0（基準是 0；設定至少少 10%、最多多 10%）→ 明顯比較多']);
  assert.deepEqual([result.verdict, result.basis], ['打平', '學習面打平']);
});

void test('不交地圖、沒跑加深的指標跳過，不會讓結果變成未定', () => {
  const map = { missing: false, missed: 0, issues: 0 };
  const result = judgeGates(GATES, same('候選', 3, { map }), same('現行', 3));
  assert.deepEqual(result.noWorse.filter(each => each.state === 'skip').map(each => each.text), [
    '不能變差 地圖漏的必備：跳過（基準不適用（凍結時就知道））', '不能變差 地圖問題：跳過（基準不適用（凍結時就知道））',
    '不能變差 加深機會漏掉：跳過（基準不適用（凍結時就知道））', '不能變差 確定接錯：跳過（基準不適用（凍結時就知道））',
  ]);
  assert.equal(result.verdict, '打平');
});

const deepen = (more: Partial<DeepenMetrics> = {}): DeepenMetrics => ({ pieces: 2, abandoned: 0, unsavable: 0, items: 5, undeepened: false, missed: 0, wrong: 0, disputed: 0, major: 0, harm: 0, whyMissing: 0, ...more });

void test('確定接錯的兩端：兩組各 0 筆確定接錯、各 3 筆歧見，兩端是 0 對 3、3 對 0，結論不同，未定', () => {
  const result = judgeGates(GATES, same('候選', 3, { deepen: deepen({ disputed: 3 }) }), same('現行', 3, { deepen: deepen({ disputed: 3 }) }));
  const wrongLinks = result.noWorse.find(each => each.metric === '確定接錯');
  assert.equal(wrongLinks?.state, 'unknown');
  assert.match(wrongLinks?.text ?? '', /^不能變差 確定接錯：加深的歧見會左右結果（有利的一端：.*→ 過；不利的一端：.*明顯.*→ 沒過）→ 未定$/);
  assert.equal(result.verdict, '未定');
});

void test('加深放棄的篇：兩組差 2 篇以上，加深的指標是未定', () => {
  const result = judgeGates(GATES, same('候選', 3, { deepen: deepen({ abandoned: 1 }) }), same('現行', 3, { deepen: deepen() }));
  const missed = result.noWorse.find(each => each.metric === '加深機會漏掉');
  assert.deepEqual([missed?.state, missed?.text], ['unknown', '不能變差 加深機會漏掉：未定（加深放棄的篇：候選 3、基準 0，差 2 篇以上）']);
});

void test('卡組存不了、不能加深的份（§2-1）：確定接錯不算那一份，其餘照比；加深機會漏掉照記的全部列比', () => {
  const candidate = [...same('候選', 3, { deepen: deepen({ wrong: 0 }) }), deck('候選', { deepen: deepen({ undeepened: true, wrong: null, missed: 2, pieces: 0, items: 0 }) })];
  const result = judgeGates(GATES, candidate, same('現行', 3, { deepen: deepen() }));
  assert.deepEqual(result.noWorse.find(each => each.metric === '確定接錯')?.text, '不能變差 確定接錯：候選 0.0、基準 0.0（容許多 0.50）→ 過');
  assert.match(result.noWorse.find(each => each.metric === '加深機會漏掉')?.text ?? '', /^不能變差 加深機會漏掉：候選 0\.5、基準 0\.0/);
});

void test('不算的份拿掉之後不到 3 份：份數不夠照實際留下的份算，不讓拿掉的份湊數；贏的比例也用留下的份算', () => {
  const undeepened = deck('候選', { deepen: deepen({ undeepened: true, wrong: null, pieces: 0, items: 0 }) });
  const candidate = [...same('候選', 2, { deepen: deepen({ wrong: 0 }) }), undeepened, undeepened, undeepened];
  const result = judgeGates({ ...GATES, benefits: [{ metric: '確定接錯', atLeast: 0.2 }] }, candidate, same('現行', 5, { deepen: deepen({ wrong: 2 }) }));
  assert.deepEqual([result.benefits[0].state, result.benefits[0].text], ['few', '收益 確定接錯：候選 0.0、基準 2.0，少 100%（設定至少少 20%）→ 平均達到，份數不夠']);
  assert.deepEqual([result.verdict, result.basis], ['未定', '收益平均達到，但份數不夠']);
  assert.equal(result.chance['確定接錯'], 1);
});

void test('拿掉不算的份（整類，L2 第 1 輪 G）：份數不夠、贏的比例、打平都照每個指標留下的份算；確定接錯的判定和直接拿掉那幾份一樣', () => {
  const gates: Gates = { ...GATES, benefits: [{ metric: '確定接錯', atLeast: 0.2 }] };
  const undeepened = (group: string, i: number): DeckMetrics => deck(group, { code: `${group}x${String(i)}`, copy: 10 + i, deepen: deepen({ undeepened: true, wrong: null, pieces: 0, items: 0 }) });
  for (const kept of [1, 2, 3, 4]) for (const dropped of [0, 1, 3]) for (const [c, b] of [[0, 2], [0, 0], [2, 0]]) {
    const at = `留 ${String(kept)} 份、拿掉 ${String(dropped)} 份、候選 ${String(c)} 對基準 ${String(b)}`;
    const candidate = [...same('候選', kept, { deepen: deepen({ wrong: c }) }), ...Array.from({ length: dropped }, (_, i) => undeepened('候選', i))];
    const baseline = same('現行', kept + dropped, { deepen: deepen({ wrong: b }) });
    const full = judgeGates(gates, candidate, baseline), lean = judgeGates(gates, candidate.slice(0, kept), baseline);
    const pick = (result: typeof full): unknown => [result.benefits[0].state, result.noWorse.find(each => each.metric === '確定接錯')?.state];
    assert.deepEqual(pick(full), pick(lean), at);
    assert.equal(full.chance['確定接錯'], lean.chance['確定接錯'], at);
    if (kept < 3) assert.ok(!full.verdict.startsWith('打平') && full.verdict !== '過', `${at}：${full.verdict}`);
  }
});

void test('配對：只收和基準同一個區組的候選份，混在一起比；沒有基準的區組不進門檻，總結果未定；不算門檻的生成器只報告', () => {
  const decks = [
    deck('候選', { code: 'S1' }), deck('現行', { code: 'S2', ...wrong(1) }),
    deck('候選', { code: 'S3', block: 'L3-B02' }), deck('精簡', { code: 'S4', block: 'L3-B02' }),
    deck('候選', { code: 'S5', generator: 'codex' }), deck('現行', { code: 'S6', generator: 'codex' }),
  ];
  const results = allGates(GATES, decks);
  assert.deepEqual(results.map(each => [each.lesson, each.generator, each.candidate, each.counts, each.verdict, each.basis]), [
    ['L3', 'claude', '候選', { candidate: 1, baseline: 1, unpaired: 1, alone: 0 }, '未定', '候選有 1 份的區組沒有基準，配對的份數不夠'],
  ]);
});

void test('進門檻的份數少於設定的（§7-1 第 1 點）：候選的有效原稿補不滿、有區組只有基準，總結果未定，不是過；候選一份都沒有也列出來', () => {
  const blocks = (group: string, n: number, more: Partial<DeckMetrics>): DeckMetrics[] => Array.from({ length: n }, (_, i) => deck(group, { code: `${group}${String(i)}`, block: `L3-B0${String(i + 1)}`, copy: i + 1, ...more }));
  const [short] = allGates(GATES, [...blocks('候選', 4, {}), ...blocks('現行', 5, wrong(1))]);
  assert.deepEqual([short.counts, short.verdict, short.basis], [{ candidate: 4, baseline: 4, unpaired: 0, alone: 1 }, '未定', '基準有 1 份的區組沒有候選（候選的有效份數比設定的少），配對的份數不夠']);
  const [none] = allGates(GATES, blocks('現行', 3, {}));
  assert.deepEqual([none.counts, none.verdict, none.basis], [{ candidate: 0, baseline: 0, unpaired: 0, alone: 3 }, '未定', '基準有 3 份的區組沒有候選（候選的有效份數比設定的少），配對的份數不夠']);
});

void test('沒講為什麼（rule-test-d236.md §17）：列成收益時候選少、3 對 3 全贏判明顯；不能變差照判錯的預設，候選多出 0.5 以上又明顯就沒過', () => {
  const why = (value: number): Partial<DeckMetrics> => ({ whyMissing: value });
  const gates: Gates = { ...GATES, benefits: [{ metric: '沒講為什麼', atLeast: 0.2 }] };
  const better = judgeGates(gates, many('候選', [0, 0, 1], why), many('現行', [2, 3, 3], why));
  assert.deepEqual([better.benefits[0].state, better.verdict], ['clear', '過']);
  const worse = judgeGates(GATES, many('候選', [3, 3, 4], why), many('現行', [0, 1, 1], why));
  assert.deepEqual([worse.noWorse.find(each => each.metric === '沒講為什麼')!.state, worse.verdict], ['worse', '沒過']);
  // 加深的筆數也算進去：卡組都是 0，候選的加深 0、基準的加深 2，和卡組差 2 一樣判明顯。
  const deepened = (value: number): Partial<DeckMetrics> => ({ deepen: deepen({ whyMissing: value }) });
  assert.equal(judgeGates(gates, many('候選', [0, 0, 0], deepened), many('現行', [2, 2, 2], deepened)).benefits[0].state, 'clear');
});

void test('五組以上拆區組（§5-6）：同一份基準在每個拆開的區組各評一次，沒有候選的那一次不算缺；真的少了才算', () => {
  // 每一輪拆成兩個區組：B 單數是現行、候選、甲、乙，B 雙數是同一份現行和丙。
  const split = (n: number, m: number): DeckMetrics[] => Array.from({ length: m }, (_, i) => [
    deck('現行', { code: `現行${String(i)}`, block: `L3-B${String(2 * i + 1).padStart(2, '0')}`, copy: i + 1, ...wrong(2) }),
    deck('現行', { code: `現行${String(i)}`, block: `L3-B${String(2 * i + 2).padStart(2, '0')}`, copy: i + 1, ...wrong(2) }),
    ...i < n ? [deck('候選', { code: `候選${String(i)}`, block: `L3-B${String(2 * i + 1).padStart(2, '0')}`, copy: i + 1 })] : [],
    deck('丙', { code: `丙${String(i)}`, block: `L3-B${String(2 * i + 2).padStart(2, '0')}`, copy: i + 1 }),
  ]).flat();
  // 5 對 5 全贏：1/C(10,5)＝1/252。
  const [full] = allGates(GATES, split(5, 5));
  assert.deepEqual([full.counts, full.verdict, full.basis], [{ candidate: 5, baseline: 5, unpaired: 0, alone: 0 }, '過', '學習面有一項明顯比較好']);
  const [short] = allGates(GATES, split(4, 5));
  assert.deepEqual([short.counts, short.verdict, short.basis], [{ candidate: 4, baseline: 4, unpaired: 0, alone: 1 }, '未定', '基準有 1 份的區組沒有候選（候選的有效份數比設定的少），配對的份數不夠']);
});

void test('時間預算（檢查表課 3，rule-test-d236.md §16）：目標多超過 15% 而確定考到的必備沒多，標出來；設定算門檻時沒過，只報告時照樣過', () => {
  const candidate = many('候選', [0, 0, 0], () => ({ targets: 12, sureRequired: 3 })), baseline = many('現行', [0, 0, 0], () => ({ targets: 10, sureRequired: 3 }));
  const report = judgeGates(GATES, candidate, baseline);
  assert.deepEqual([report.budget.pass, report.budget.text], [true, '時間預算：候選每份 12.0 個目標、基準 10.0（多 20%）；確定考到的必備候選 3.0、基準 3.0（多 0.0 列）→ 目標多超過 15%、必備沒多，標出來（設定只報告）']);
  assert.notEqual(report.verdict, '沒過');
  const gate = judgeGates({ ...GATES, timeBudget: 'gate' }, candidate, baseline);
  assert.deepEqual([gate.budget.pass, gate.verdict], [false, '沒過']);
  // 多考到必備：多出來的目標對得上，不標。
  const more = judgeGates({ ...GATES, timeBudget: 'gate' }, many('候選', [0, 0, 0], () => ({ targets: 12, sureRequired: 4 })), baseline);
  assert.deepEqual([more.budget.pass, more.budget.text], [true, '時間預算：候選每份 12.0 個目標、基準 10.0（多 20%）；確定考到的必備候選 4.0、基準 3.0（多 1.0 列）→ 過']);
  // 多 15% 剛好不標（「多超過」）。
  const edge = judgeGates({ ...GATES, timeBudget: 'gate' }, many('候選', [0], () => ({ targets: 11.5 })), many('現行', [0], () => ({ targets: 10 })));
  assert.equal(edge.budget.pass, true);
});
