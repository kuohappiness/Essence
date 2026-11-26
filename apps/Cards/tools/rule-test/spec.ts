// 比較測試工具：〈評估規格〉（任務說明 tasks/rule-test-d236.md §11，D-236 第 7 點）。freeze 照設定與工具的常數產生 凍結/評估規格.md、鎖住；
// 給使用者看用量時一起給這一份，generate、deepen 加 --confirmed 時在事件裡記下它的雜湊（使用者看過的就是這一份）。
// 內容：評估版本、適用表、缺資料、分級、指標的算法、門檻的數字（含校正後能不能到）、兩組品質相同時各結果的機會（模擬）、對照、模擬加深的條件、限制。
import { createHash } from 'node:crypto';
import { deepenGroups, LEARNING_METRICS, type Config, type Generator } from './config.ts';
import { groupDifferences } from './contrast.ts';
import type { FrozenStep } from './freeze.ts';
import { judgeGates } from './gates.ts';
import { CHECKLIST, EVALUATION, ISSUE_KINDS, levelOf } from './levels.ts';
import { bestP, permutationP } from './stats.ts';
import type { DeckMetrics } from './unblind.ts';

const percent = (value: number): string => `${(value * 100).toFixed(2).replace(/\.?0+$/, '')}%`;
const row = (cells: readonly (string | number)[]): string => `| ${cells.map(String).join(' | ')} |`;
const table = (head: readonly string[], rows: readonly (readonly (string | number)[])[]): string[] => [row(head), `|${'---|'.repeat(head.length)}`, ...rows.map(row)];

/** 交地圖：卡組步驟都交三段的組（rule-test-d236.md §2）。 */
const mapGroups = (steps: readonly FrozenStep[]): string[] =>
  [...new Set(steps.map(step => step.group))].filter(group => steps.filter(step => step.group === group && step.deck).every(step => step.threeSections));
/** 跑加深的生成器：設定列的（手貼的讀設定時就擋下）。 */
const deepenGenerators = (config: Config): Generator[] => config.generators.filter(each => config.deepen?.generators.includes(each.name));

/** 收益列了 k 項時，每組 n 份到不到得了（§7-1 第 3 點）：最好的情況與兩個有平手的例子。 */
function reach(n: number, k: number): { limit: number; best: number; ties: { a: number[]; b: number[]; p: number }[] } {
  const ones = (count: number, value: number): number[] => Array.from({ length: count }, () => value);
  const ties = [
    { a: [...ones(n - 1, 0), 1], b: [...ones(n - 1, 1), 2] },
    { a: ones(n, 0), b: [0, ...ones(n - 1, 1)] },
  ].map(each => ({ ...each, p: permutationP(each.a, each.b) }));
  return { limit: 0.05 / k, best: bestP(n, n), ties };
}

/** 照設定的份數，收益永遠不會明顯的生成器（freeze 警告）。 */
export function unreachable(config: Config): string[] {
  const k = config.gates.correction ? Math.max(config.gates.benefits.length, 1) : 1;
  return config.gates.generators.flatMap(name => {
    const n = config.generators.find(each => each.name === name)?.count ?? 0;
    return n > 0 && bestP(n, n) > 0.05 / k + 1e-9 ? [`生成器「${name}」每組 ${String(n)} 份、收益 ${String(k)} 項（每項門檻 ${percent(0.05 / k)}）：最好的情況 p＝${percent(bestP(n, n))}，收益永遠不會明顯`] : [];
  });
}

/** 模擬用的固定亂數（同一份設定每次算出一樣的機會）。 */
function seeded(key: string): () => number {
  let state = createHash('sha256').update(key).digest().readUInt32LE(0);
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const poisson = (random: () => number, mean: number): number => {
  const limit = Math.exp(-mean);
  let k = 0, p = random();
  while (p > limit) { k++; p *= random(); }
  return k;
};

/** 模擬的假設：每份的指標各自照這個平均的卜瓦松分布抽，兩組同一個分布（品質相同）。還沒有第二輪的實際分數，先用這幾個數。 */
const ASSUMED = { 重大: 0.2, 判錯: 1, 洩漏: 0.5, 其他傷到學習: 0.5, 必備: 10, 漏必備的機會: 0.1, 每個必備的題: 2, 多餘的題: 0.5, 地圖漏的必備: 0.5, 地圖問題: 1, 加深機會漏掉: 0.5, 確定接錯: 0.5, 加深歧見: 0.5, 加深的傷到學習: 0.3, 目標: 12 };
const RUNS = 400;

function simulatedDeck(random: () => number, group: string, copy: number, map: boolean, deepen: boolean): DeckMetrics {
  const missed = Array.from({ length: ASSUMED.必備 }, (_, i) => `R${String(i + 1)}`).filter(() => random() < ASSUMED.漏必備的機會);
  const sure = ASSUMED.必備 - missed.length;
  const childPrompts = sure * ASSUMED.每個必備的題 + poisson(random, 2);
  const harm = { 判錯: poisson(random, ASSUMED.判錯), 洩漏: poisson(random, ASSUMED.洩漏), 漏的必備: missed.length, 其他: poisson(random, ASSUMED.其他傷到學習), total: 0 };
  harm.total = harm.判錯 + harm.洩漏 + harm.漏的必備 + harm.其他;
  return {
    batch: 1, lesson: '模擬', block: `B${String(copy)}`, code: `${group}${String(copy)}`, group, generator: '模擬', copy, replacement: false, late: false,
    required: { 有: sure, 部分: 0, 沒有: missed.length }, missed, partial: [], bonus: { 有: 0, 部分: 0, 沒有: 0 }, disagreements: 0,
    major: 0, majorBoth: 0, majorRuled: 0, majorTotal: poisson(random, ASSUMED.重大),
    quality: { 判錯: harm.判錯, 洩漏: harm.洩漏, 其他傷到學習: harm.其他, 一題多事: 0, 池裡判準不同: 0, 小問題: 0 }, qualityTotal: 0, qualityBoth: 0, qualityOne: 0,
    harm, minor: 0, nearDuplicates: 0, duplicateGroups: 0, extraPrompts: poisson(random, ASSUMED.多餘的題), crossRows: 0, crossWrong: 0,
    childPrompts, sureRequired: sure, perRequired: childPrompts / Math.max(sure, 0.5),
    targets: poisson(random, ASSUMED.目標), prompts: childPrompts, candidates: 0, adds: 0, unsaveable: false, rulesChars: 1000, promptChars: 5000, generationMs: 60_000, costUsd: null,
    tokens: { input: 1000, output: 100 }, deepenTokens: null,
    map: map ? { missing: false, missed: poisson(random, ASSUMED.地圖漏的必備), issues: poisson(random, ASSUMED.地圖問題) } : null,
    deepen: deepen ? { pieces: 2, abandoned: 0, unsavable: 0, items: 6, undeepened: false, missed: poisson(random, ASSUMED.加深機會漏掉), wrong: poisson(random, ASSUMED.確定接錯), disputed: poisson(random, ASSUMED.加深歧見), major: 0, harm: poisson(random, ASSUMED.加深的傷到學習) } : null,
    leakCandidates: [], worthLearning: 0, byJudge: {}, issues: [],
  };
}

/** 兩組品質相同時，照這份設定各結果的機會（§7-3 最後一段）。 */
function chances(config: Config, candidate: string, n: number, maps: readonly string[], deepen: boolean): Record<string, number> {
  const random = seeded(`${config.name}/${candidate}/${String(n)}`);
  const tally: Record<string, number> = {};
  const map = maps.includes(candidate) && maps.includes(config.gates.baseline);
  for (let run = 0; run < RUNS; run++) {
    const a = Array.from({ length: n }, (_, i) => simulatedDeck(random, candidate, i + 1, map, deepen));
    const b = Array.from({ length: n }, (_, i) => simulatedDeck(random, config.gates.baseline, i + 1, map, deepen));
    const { verdict } = judgeGates(config.gates, a, b);
    tally[verdict] = (tally[verdict] ?? 0) + 1;
  }
  return Object.fromEntries(Object.entries(tally).map(([verdict, count]) => [verdict, count / RUNS]));
}

const STATIC_METRICS = [
  ['重大', '卡組的重大錯誤（兩位都記，或一位記、裁定成立）＋卡組存不了（每份 1）＋加深的重大錯誤＋加深存不了的篇'],
  ['傷到學習', '判錯＋洩漏＋漏的必備＋其他算傷到學習的種類（照分級）＋加深的傷到學習'],
  ['判錯', '卡組裡判錯的筆數（兩位記的、一位記的都算；同一題同一種算一筆）'],
  ['每個必備平均幾題', '孩子要複習的題（正式目標的題＋加題底下的每一題）÷ 確定考到的必備（兩位都判有）；確定考到 0 列時分母當 0.5。評分表沒有的「值得學」題也算成負擔，刪掉它們反而算省時間（照「最精華的卡」）'],
  ['多餘的題', '近義重複併成組，每組題數減一加總'],
  ['地圖漏的必備', '兩位都判地圖沒有的必備列；應交地圖沒交是全部必備列'],
  ['地圖問題', '地圖的問題筆數（兩位的合併）'],
  ['加深機會漏掉', '兩位都判沒有的加深機會列；卡組存不了是全部加深機會列'],
  ['確定接錯', '兩位都判接錯的項；兩位不同是歧見，門檻照兩端（有利、不利）各判一次，結論不同是未定'],
  ['規則字數、整份提示字數', '凍結的規則字數；實際送出的字（多步的含代入的前一步回覆）'],
  ['token', '輸入＝input＋快取寫入＋快取讀取，輸出＝output；生成與加深分開報，打平時的次要指標只看生成的；有一步缺 usage 就是不知道'],
  ['生成時間', '每一份生成所有步驟的時間加總'],
] as const;

/** 〈評估規格〉全文。steps 是凍結的每一步（看哪幾組交地圖）。 */
export function evaluationSpec(config: Config, steps: readonly FrozenStep[]): string {
  const { gates } = config;
  const maps = mapGroups(steps);
  const deepening = deepenGenerators(config), deepenNames = deepenGroups(config);
  const k = gates.correction ? Math.max(gates.benefits.length, 1) : 1;
  const lines: string[] = [
    `# 評估規格：${config.name}`, '',
    `評估版本 ${EVALUATION}；製卡檢查表 ${CHECKLIST}。freeze 照設定與工具的常數產生，鎖在 凍結/鎖.json；之後每一步都核對，改了就停下。`, '',
    '## 1. 適用表', '',
    '凍結時就知道的不適用，那一項的比較跳過，寫原因；不會因此變成未定。', '',
    ...table(['組', '交地圖（卡組步驟都交三段）', '跑加深'], config.groups.map(group => [group.name, maps.includes(group.name) ? '交' : '不交', deepenNames.includes(group.name) ? '跑' : '不跑'])), '',
    ...table(['生成器', '算門檻', '跑加深'], config.generators.map(each => [each.name, gates.generators.includes(each.name) ? '算' : '只報告', deepening.includes(each) ? '跑' : '不跑'])), '',
    '## 2. 缺資料', '',
    '- 凍結時就知道的不適用（基準不交地圖、手貼沒有加深）：跳過這一項的比較。',
    '- 應交地圖沒交、或全貌與架構有一段是空的：地圖漏的必備記全部必備列，地圖問題記 0。',
    '- 卡組存不了：第 1 道記存不了；不能模擬加深，加深機會漏掉記全部加深機會列，確定接錯、加深的傷到學習不算那一份。',
    '- 確定考到的必備是 0：每個必備平均幾題的分母當 0.5。',
    '- 加深放棄（失敗、逾時、額度用完、中斷試滿 3 次）：那幾篇從加深的指標排除，每組放棄幾篇要報；整份都放棄、或兩組放棄的篇差 2 篇以上，加深的指標未定。',
    '- 格式有錯但仍是有效原稿的回覆：照樣評內容，另外記存不了。', '',
    '## 3. 錯誤分級', '',
    ...table(['種類', '級'], [
      ...ISSUE_KINDS.flatMap(kind => { const level = levelOf(kind, config.levels); return level ? [[kind, level]] : []; }),
      ['存不了', '重大'], ['漏的必備', '傷到學習'],
    ]), '',
    '近義重複算孩子的時間（多餘的題），值得學不是錯。', '',
    '## 4. 指標', '',
    ...STATIC_METRICS.map(([name, text]) => `- ${name}：${text}。`), '',
    '## 5. 門檻', '',
    `基準：${gates.baseline}；候選：${gates.candidates.join('、')}；算門檻的生成器：${gates.generators.join('、')}。逐課、逐生成器、逐候選組判；候選只和同一個區組的基準配對，收進來以後兩組混在一起做置換判定。`, '',
    `1. 重大：${gates.majorErrors === 'zero' ? '候選每一份都要 0' : '候選每份平均不比基準多'}。`,
    `2. 不多漏必備：逐列，漏的比例高出 ${String(gates.rowMissGap)} 以上算多漏；總數，每份多漏 ${String(gates.missedRows)} 列以上算多漏；多餘的題，每份多出 ${String(gates.extraPrompts)} 以內。`,
    `3. 傷到學習不比基準多：容許量＝max（${percent(gates.harm.percent)} × 基準平均，${String(gates.harm.floor)}）。超過而且明顯（5%）是沒過，超過但不明顯是未定。`,
    `4. 收益（學習面，至少一項明顯）：${gates.benefits.map(each => `${each.metric} 至少少 ${percent(each.atLeast)}`).join('、') || '沒有列'}；${gates.correction ? `校正，${String(k)} 項各用 ${percent(0.05 / k)}` : '不校正，每項用 5%'}。任一組不到 3 份是份數不夠。`,
    `5. 不能變差：學習面全部自動進來，超過容許量而且明顯（5%，不校正）才沒過。`, '',
    ...table(['指標', '百分比', '絕對下限（每份）'], LEARNING_METRICS.filter(metric => metric !== '傷到學習').map(metric => {
      const tolerance = gates.noWorse[metric];
      return [metric, percent(tolerance.percent), String(tolerance.floor)];
    })), '',
    `時間預算（檢查表課 3）：候選每份目標數比基準多超過 15%、確定考到的必備又沒多，${gates.timeBudget === 'gate' ? '算沒過' : '標出來，只報告'}。`, '',
    `打平：兩組都有 ${String(gates.tieMinCopies)} 份以上、每個學習面指標的差都在容許量以內、第 3 道過。打平時看次要：${gates.secondary.map(each => `${each.metric} 至少少 ${percent(each.atLeast)}、最多多 ${percent(each.tolerance)}`).join('；') || '沒有列'}。「打平，候選較省」${gates.tieCheaper === 'pass' ? '算過（摘要照實寫學習面打平、候選較省）' : '只報告'}。`, '',
    '### 收益到不到得了', '',
  ];
  for (const name of gates.generators) {
    const n = config.generators.find(each => each.name === name)?.count ?? 0;
    if (!n) continue;
    const r = reach(n, k);
    lines.push(
      `- ${name}：每組 ${String(n)} 份、每項門檻 ${percent(r.limit)}。最好的情況（全贏、沒有平手）p＝${percent(r.best)}，${r.best <= r.limit + 1e-9 ? '到得了' : '永遠不會明顯'}。`,
      ...r.ties.map(each => `  - 有平手的例子：候選 [${each.a.join(',')}] 對基準 [${each.b.join(',')}]，p＝${percent(each.p)}，${each.p <= r.limit + 1e-9 ? '明顯' : '不明顯'}。`),
    );
  }
  lines.push('', '### 兩組品質相同時各結果的機會（模擬）', '',
    `假設：兩組每份的指標照同一個分布抽（品質相同），每個指標是卜瓦松分布，平均是：${Object.entries(ASSUMED).map(([name, value]) => `${name} ${String(value)}`).join('、')}。每一種模擬 ${String(RUNS)} 次，亂數固定。還沒有第二輪的實際分數，這幾個平均是暫定的；試跑後換成實際的。`, '');
  const rows: (string | number)[][] = [];
  for (const name of gates.generators) {
    const generator = config.generators.find(each => each.name === name);
    if (!generator?.count) continue;
    for (const candidate of gates.candidates) {
      const result = chances(config, candidate, generator.count, maps, deepening.includes(generator));
      rows.push([name, candidate, generator.count, ...['過', '沒過', '未定', '打平', '打平，候選較省'].map(verdict => percent(result[verdict] ?? 0))]);
    }
  }
  lines.push(...table(['生成器', '候選', '每組份數', '過', '沒過', '未定', '打平', '打平，候選較省'], rows), '');
  lines.push('## 6. 對照', '', ...config.contrasts.length ? config.contrasts.flatMap(each => [
    `### ${each.name}：甲 ${each.a}、乙 ${each.b}`, '',
    ...groupDifferences(config.groups.find(group => group.name === each.a)!, config.groups.find(group => group.name === each.b)!).map(line => `- ${line}`), '',
  ]) : ['（沒有設定對照）', ''], '只報告，不判過不過：逐課、逐生成器、逐批報兩組的平均、差、兩兩比的場數、明不明顯（單邊，5%，兩組都有 3 份以上才判）。', '');
  lines.push('## 7. 模擬加深', '', ...config.deepen ? [
    `- 跑哪幾份：跑加深的生成器 ${deepening.map(each => each.name).join('、') || '沒有'}、跑加深的組 ${deepenNames.join('、')}，每一份有效原稿。卡組存不了的不模擬，照缺資料記最差值。`,
    '- 情境：家長把草稿全部加入、孩子都記穩了，第一次按加深；每一篇一個新對話，模型與推理同生成那一份。',
    '- 草稿：外掛做成草稿再改成啟用；學習目標的 ID 是工具照原稿給的假 ID，避開已有目標與原稿裡的 ID，同一份原稿每次一樣。',
    '- 記穩了：照外掛啟用卡組的目標（暫停、重複 ID、紀錄停用的不在裡面），一律當記穩了；這次測不到「常錯的先補」。',
    '- 其他欄位：同單元的其他篇只有這一份原稿的其他篇；地圖是這一份的全貌與架構（多步的組照步驟順序接起來），不交地圖的組沒有；以前出過的是空的（新課）；英文的已有單字照外掛的排法，凍結的卡組和模擬加入的放在一起；學習目的、家長調整、教材說明、點選填空照這一課的表單。',
    '- 規則：外掛來源照外掛的嵌入規則；檔案、自備來源送凍結的加深規則全文（送出段加上「以下只在加深時送」那一段）。外掛的加深任務段凍結時記了 deepen-prompt.ts 的雜湊，模擬時核對。',
    '- 三段：這一組的卡組步驟交不交三段，同一個值給加深的提示、外掛的檢查與切地圖。',
    '- 外掛的檢查有錯誤的篇記「加深存不了」（重大），內容照評。',
    '- 匿名之後那一份的加深就固定，不再加深。',
  ] : ['（設定沒有寫加深）'], '');
  lines.push('## 8. 限制', '',
    '- 候選和基準混在一起比，忽略同一個評分對話的共同偏差；結果偏保守，不會放寬。',
    '- 評分表由沒讀過規則的評審照課本列，寫、核對、回應三個對話；評分表本身錯了，各組會一起錯。',
    '- 兩位評審都是 AI；只有一位記的重大錯誤送裁定，其他的照兩位的合併。',
    '- 評審看得到哪幾份有地圖、加深回覆有沒有三段，可以猜出哪幾份是三層的組。',
    '- 兩組在同一課、同一個生成器少了一樣多份有效原稿時看不出來；這時兩組都只用留下的份比。',
    '- 模擬的機會照上面的假設，不是實際分數。', '');
  return lines.join('\n');
}
