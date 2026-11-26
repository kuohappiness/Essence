// 比較測試工具：結果的兩份報告（任務說明 tasks/rule-test-tool.md §5-9；指標照 tasks/rule-test-d236.md）。明細.md（私人）：逐課、逐生成器、逐份的指標，
// 漏與部分的列、問題與裁定、評審 × 生成器的分項。摘要.md：只有數字（每組每份的平均），沒有教材、評分表與題目的原文，可以貼進 repo。
import type { Folder } from './folder.ts';
import { allContrasts } from './contrast.ts';
import { allGates, type GateResult } from './gates.ts';
import { EVALUATION } from './levels.ts';
import { rejudgeStats } from './judge.ts';
import type { BatchReport, DeckMetrics } from './unblind.ts';

const one = (value: number): string => value.toFixed(1);
const mean = (values: readonly number[]): number => values.length ? values.reduce((total, each) => total + each, 0) / values.length : 0;
const minutes = (ms: number | null): string => ms === null ? '—' : one(ms / 60_000);
const row = (cells: readonly (string | number)[]): string => `| ${cells.map(String).join(' | ')} |`;
const head = (cells: readonly string[]): string[] => [row(cells), `|${'---|'.repeat(cells.length)}`];

/** 同一份基準稿在拆開的區組裡評了不只一次時，平均只算它第一個區組的那一次（門檻另照同區組配對，§5-6）。 */
function uniqueDecks(decks: readonly DeckMetrics[]): DeckMetrics[] {
  const seen = new Set<string>();
  return [...decks].sort((a, b) => a.block.localeCompare(b.block)).filter(deck => {
    const key = `${String(deck.batch)}/${deck.lesson}/${deck.code}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** 課 × 生成器，照設定的順序；組照基準、候選、其他。 */
function sections(folder: Folder, decks: readonly DeckMetrics[]): { lesson: string; generator: string; groups: { group: string; decks: DeckMetrics[] }[] }[] {
  const { gates } = folder.config;
  const order = [gates.baseline, ...gates.candidates, ...folder.config.groups.map(each => each.name).filter(name => name !== gates.baseline && !gates.candidates.includes(name))];
  return folder.config.lessons.flatMap(lesson => folder.config.generators.map(generator => ({
    lesson: lesson.code, generator: generator.name,
    groups: order.map(group => ({ group, decks: decks.filter(deck => deck.lesson === lesson.code && deck.generator === generator.name && deck.group === group) })).filter(each => each.decks.length),
  }))).filter(each => each.groups.length);
}

/** 平均；有份沒有資料（null）就是 —，不適用（全部 null）也是 —。 */
function avg(decks: readonly DeckMetrics[], pick: (deck: DeckMetrics) => number | null, round = false): string {
  const values = decks.map(pick);
  if (values.some(value => value === null)) return '—';
  const value = mean(values as number[]);
  return round ? String(Math.round(value)) : one(value);
}
/** 不適用的份（地圖、加深是 null）不算，剩下的平均；全部不適用是 —。 */
function avgOf(decks: readonly DeckMetrics[], pick: (deck: DeckMetrics) => number | null): string {
  const values = decks.map(pick).filter((value): value is number => value !== null);
  return values.length ? one(mean(values)) : '—';
}
const deepenHarm = (deck: DeckMetrics): number => deck.deepen?.harm ?? 0;

/** 三張表（rule-test-d236.md §3、§9）：學習面（門檻用的）、次要（打平時才看）、只報告。 */
const LEARNING_HEAD = ['組', '份數', '重大（含存不了）', '傷到學習', '判錯', '洩漏', '漏的必備', '其他傷到學習', '加深的傷到學習', '每個必備平均幾題', '多餘的題', '地圖漏的必備', '地圖問題', '加深機會漏掉', '確定接錯', '加深歧見'];
function learningCells(decks: readonly DeckMetrics[]): (string | number)[] {
  return [
    decks.length, avg(decks, deck => deck.majorTotal), avg(decks, deck => deck.harm.total + deepenHarm(deck)),
    avg(decks, deck => deck.harm.判錯), avg(decks, deck => deck.harm.洩漏), avg(decks, deck => deck.harm.漏的必備), avg(decks, deck => deck.harm.其他), avg(decks, deepenHarm),
    avg(decks, deck => deck.perRequired), avg(decks, deck => deck.extraPrompts),
    avgOf(decks, deck => deck.map?.missed ?? null), avgOf(decks, deck => deck.map?.issues ?? null),
    avgOf(decks, deck => deck.deepen?.missed ?? null), avgOf(decks, deck => deck.deepen?.wrong ?? null), avgOf(decks, deck => deck.deepen?.disputed ?? null),
  ];
}
const SECONDARY_HEAD = ['組', '規則字數', '整份提示字數', '生成 token 輸入', '生成 token 輸出', '加深 token 輸入', '加深 token 輸出', '生成（分）'];
function secondaryCells(decks: readonly DeckMetrics[]): (string | number)[] {
  const deepen = decks.filter(deck => deck.deepenTokens !== null);
  return [
    avg(decks, deck => deck.rulesChars, true), avg(decks, deck => deck.promptChars, true),
    avg(decks, deck => deck.tokens.input, true), avg(decks, deck => deck.tokens.output, true),
    deepen.length ? avg(deepen, deck => deck.deepenTokens!.input, true) : '—', deepen.length ? avg(deepen, deck => deck.deepenTokens!.output, true) : '—',
    decks.some(deck => deck.generationMs === null) ? '—' : minutes(mean(decks.map(deck => deck.generationMs!))),
  ];
}
const REPORT_HEAD = ['組', '部分的必備', '確定考到的必備', '加分（有）', '小問題', '孩子要複習的題', '目標', '存不了', '加深篇數（放棄）', '加深項數', '接對率', '值得學'];
function reportCells(decks: readonly DeckMetrics[]): (string | number)[] {
  const deepened = decks.filter(deck => deck.deepen && !deck.deepen.undeepened);
  const items = deepened.reduce((total, deck) => total + deck.deepen!.items, 0), right = deepened.reduce((total, deck) => total + deck.deepen!.items - (deck.deepen!.wrong ?? 0) - deck.deepen!.disputed, 0);
  return [
    avg(decks, deck => deck.required.部分), avg(decks, deck => deck.sureRequired), avg(decks, deck => deck.bonus.有), avg(decks, deck => deck.minor),
    avg(decks, deck => deck.childPrompts), avg(decks, deck => deck.targets), `${String(decks.filter(deck => deck.unsaveable).length)}／${String(decks.length)}`,
    deepened.length ? `${avgOf(deepened, deck => deck.deepen!.pieces)}（${String(deepened.reduce((total, deck) => total + deck.deepen!.abandoned, 0))}）` : '—',
    deepened.length ? avgOf(deepened, deck => deck.deepen!.items) : '—',
    !deepened.length ? '—' : items ? `${String(Math.round(right / items * 100))}%` : '沒有項',
    avg(decks, deck => deck.worthLearning),
  ];
}

/** 對話數（§9）：生成、加深、卡組評分、地圖評分、加深評分各報；不含重試與重評。 */
function conversationLine(folder: Folder, decks: readonly DeckMetrics[]): string {
  const judges = folder.config.judges.length;
  const blocks = (pick: (deck: DeckMetrics) => boolean): number => new Set(decks.filter(pick).map(deck => `${String(deck.batch)}/${deck.block}`)).size * judges;
  // 生成與加深一份一次：同一份基準在拆開的區組評了幾次都只算一份（§5-6）；評分照區組算。
  const once = uniqueDecks(decks);
  const deepen = once.reduce((total, deck) => total + (deck.deepen ? deck.deepen.pieces + deck.deepen.abandoned : 0), 0);
  return `對話數（不含重試與重評）：生成 ${String(once.length)}、加深 ${String(deepen)}、卡組評分 ${String(blocks(() => true))}、地圖評分 ${String(blocks(deck => deck.map !== null && !deck.map.missing))}、加深評分 ${String(blocks(deck => deck.deepen !== null && !deck.deepen.undeepened))}`;
}

function batchLines(reports: readonly BatchReport[]): string[] {
  return reports.map(report => `- 批 ${String(report.batch)}：${report.unblinded.slice(0, 10)} 解開，commit ${report.commit.slice(0, 8)}${report.late ? '（在前一批解開之後才匿名：看過前一批結果才決定加跑）' : ''}`);
}

export function summaryLines(folder: Folder, reports: readonly BatchReport[], mode: 'summary' | 'detail'): string[] {
  const all = reports.flatMap(report => report.decks);
  const unique = uniqueDecks(all);
  const lines = [
    `# ${folder.config.name}：${mode === 'summary' ? '結果摘要' : '結果明細'}`, '',
    mode === 'summary' ? '只有數字（每組每份的平均），沒有教材、評分表與題目的原文（§5-9）；明細在同一個資料夾的 明細.md。' : '私人：含評分表的列與評審的說明，不貼進 repo。',
    '', ...batchLines(reports), '',
    `評估版本 ${EVALUATION}。錯誤分三級（重大、傷到學習、小問題，rule-test-d236.md §3）；孩子的時間看每個必備平均幾題與多餘的題（§4）。`, '',
  ];
  for (const section of sections(folder, unique)) {
    lines.push(
      `## ${section.lesson}｜${section.generator}`, '',
      '學習面（門檻用的；每份平均，地圖與加深只算有的份，— 是不適用或沒有資料）：', '', ...head(LEARNING_HEAD), ...section.groups.map(each => row([each.group, ...learningCells(each.decks)])), '',
      '次要（學習面打平時才看）：', '', ...head(SECONDARY_HEAD), ...section.groups.map(each => row([each.group, ...secondaryCells(each.decks)])), '',
      '只報告：', '', ...head(REPORT_HEAD), ...section.groups.map(each => row([each.group, ...reportCells(each.decks)])), '',
    );
  }
  lines.push(conversationLine(folder, all), '');
  lines.push(...gateLines(folder, reports), '', ...contrastLines(folder, reports));
  if (mode === 'summary') return lines;

  for (const report of reports) {
    lines.push(`## 批 ${String(report.batch)} 的評分表與裁定`, '');
    for (const [lesson, rows] of Object.entries(report.rows)) {
      lines.push(`### ${lesson} 評分表`, '', ...head(['列', '類別', '要考的知識或判準', '教學選擇']), ...rows.map(each => row([each.id, each.kind, each.text, each.effect ?? ''])), '');
    }
    lines.push('### 裁定', '', ...report.rulings.length ? report.rulings.map(each => `- ${each.id}：${each.text}`) : ['（沒有）'], '');
    if (report.unsure?.length) lines.push('### 地圖與加深的拿不準（不送裁定，只列出來）', '', ...report.unsure.map(each => `- ${each.block} ${each.stage}，${each.judge}：${each.text}`), '');
  }
  for (const section of sections(folder, all)) {
    lines.push(`## ${section.lesson}｜${section.generator} 逐份`, '', ...head(['批', '區組', '代號', '組', '份', '漏的必備', '部分的必備', '加分（有／部分）', '重大錯誤（兩位／裁定）', '傷到學習', '題目品質（兩位／一位）', '小問題', '多餘的題（近義重複幾對）', '跨單元錯／列', '孩子要複習的題', '每個必備平均幾題', '目標', '題', '候選', '加題', '存不了', '規則字數', '整份提示字數', '生成（分）', '歧見', '洩漏候選', '值得學']));
    for (const deck of section.groups.flatMap(each => each.decks)) {
      lines.push(row([
        deck.batch, deck.block, deck.code, deck.group, `${String(deck.copy)}${deck.replacement ? '（補）' : ''}`, deck.missed.join('、') || '0', deck.partial.join('、') || '0', `${String(deck.bonus.有)}／${String(deck.bonus.部分)}`,
        `${String(deck.major)}（${String(deck.majorBoth)}／${String(deck.majorRuled)}）`, deck.harm.total, `${String(deck.qualityTotal)}（${String(deck.qualityBoth)}／${String(deck.qualityOne)}）`, deck.minor, `${String(deck.extraPrompts)}（${String(deck.nearDuplicates)}）`, `${String(deck.crossWrong)}／${String(deck.crossRows)}`,
        deck.childPrompts, one(deck.perRequired), deck.targets, deck.prompts, deck.candidates, deck.adds, deck.unsaveable ? '是' : '', deck.rulesChars, deck.promptChars, minutes(deck.generationMs), deck.disagreements, deck.leakCandidates.length, deck.worthLearning,
      ]));
    }
    lines.push('');
    for (const deck of section.groups.flatMap(each => each.decks)) {
      const notes = [...deck.issues.map(issue => `${issue.kind} ${issue.at.join('＋') || `行 ${issue.lines.join('、')}`}${issue.rubric ? `（${issue.rubric}）` : ''}，${issue.judges.join('、')}：${issue.notes.filter(Boolean).join('／')}`), ...deck.leakCandidates.map(each => `洩漏候選（程式找的）：${each}`)];
      if (notes.length) lines.push(`### 批 ${String(deck.batch)} ${deck.block} ${deck.code}（${deck.group} 第 ${String(deck.copy)} 份）`, '', ...notes.map(each => `- ${each}`), '');
    }
  }
  const again = reports.flatMap(report => rejudgeStats(folder, report.batch).map(each => ({ batch: report.batch, ...each })));
  lines.push('## 評審重評（同一位評審另開對話再評一次；只報兩次的差，不進門檻）', '', ...again.length
    ? [...head(['批', '評審', '區組', '判定不同的格', '問題（第一次／重評）']), ...again.map(each => row([each.batch, each.judge, each.block, `${String(each.changed)}／${String(each.cells)}`, `${String(each.issues[0])}／${String(each.issues[1])}`]))]
    : ['（沒有做，或重評還沒交）'], '');
  const judges = [...new Set(all.flatMap(deck => Object.keys(deck.byJudge)))];
  lines.push('## 評審 × 生成器（各自的數，不合併）', '', ...head(['評審', '課', '生成器', '組', '份數', '漏的必備', '問題']));
  for (const judge of judges) {
    for (const section of sections(folder, unique)) {
      for (const each of section.groups) lines.push(row([judge, section.lesson, section.generator, each.group, each.decks.length, one(mean(each.decks.map(deck => deck.byJudge[judge]?.missed ?? 0))), one(mean(each.decks.map(deck => deck.byJudge[judge]?.issues ?? 0)))]));
    }
  }
  lines.push('');
  return lines;
}

const MARK = (pass: boolean | null): string => pass === true ? '［過］' : pass === false ? '［沒過］' : '［未定］';
const key = (gate: GateResult): string => `${gate.lesson}｜${gate.generator}｜${gate.candidate}`;

/** 門檻（§6-3）：逐課、逐生成器、逐候選組；另標補跑的結果和前一批相反（結果翻轉）、含後補的份。 */
function gateLines(folder: Folder, reports: readonly BatchReport[]): string[] {
  const all = reports.flatMap(report => report.decks);
  const gates = allGates(folder.config.gates, all);
  const byBatch = reports.length > 1 ? reports.map(report => ({ batch: report.batch, gates: allGates(folder.config.gates, report.decks) })) : [];
  const lines = ['## 門檻', '', `基準：${folder.config.gates.baseline}；算門檻的生成器：${folder.config.gates.generators.join('、')}（其他生成器只報告）。逐課、逐生成器判，怎麼合由人寫；結果翻轉或裁定解不開時，照 D-228 那一科維持現行、再加一課（§6-3）。`, ''];
  if (!gates.length) return [...lines, '（還沒有可以比的份）'];
  for (const gate of gates) {
    const late = [...new Set(all.filter(deck => deck.late && deck.lesson === gate.lesson && deck.generator === gate.generator && [gate.candidate, gate.baseline].includes(deck.group)).map(deck => deck.batch))];
    const verdicts = byBatch.flatMap(each => each.gates.filter(other => key(other) === key(gate)).map(other => `批 ${String(each.batch)} ${other.verdict}`));
    const flipped = verdicts.some(each => each.endsWith(' 過')) && verdicts.some(each => each.endsWith('沒過'));
    lines.push(
      `### ${gate.lesson}｜${gate.generator}｜${gate.candidate} 對 ${gate.baseline}：${gate.verdict}`, '',
      `- ${gate.basis}`,
      `- 份數：候選 ${String(gate.counts.candidate)}、基準 ${String(gate.counts.baseline)}${gate.counts.unpaired ? `；候選另有 ${String(gate.counts.unpaired)} 份的區組沒有基準，不進門檻` : ''}${gate.counts.alone ? `；基準另有 ${String(gate.counts.alone)} 份的區組沒有候選，不進門檻` : ''}${gate.counts.candidate < 3 || gate.counts.baseline < 3 ? '（不到 3 份：不判明顯）' : ''}`,
      ...[gate.major, gate.rows, gate.total, gate.extra, gate.harm, gate.budget, ...gate.benefits, ...gate.noWorse, ...gate.secondary].map(check => `- ${MARK(check.pass)} ${check.text}`),
      `- 收益至少要一項明顯：${gate.benefits.some(each => each.pass === true) ? '有' : '沒有'}`,
      ...Object.keys(gate.chance).length ? [`- 隨便各抽一份，候選比較好的機會：${Object.entries(gate.chance).map(([metric, value]) => `${metric} ${String(Math.round((value ?? 0) * 100))}%`).join('、')}`] : [],
      ...verdicts.length ? [`- 各批：${verdicts.join('、')}${flipped ? '（結果翻轉：照 D-228 維持現行、再加一課）' : ''}`] : [],
      ...late.length ? [`- 含看過前一批結果才決定加跑的份（批 ${late.join('、')}）`] : [],
      '',
    );
  }
  return lines;
}

/** 對照（rule-test-d236.md §8）：只報告，不判過不過。每一個對照先列兩組設定的差別，再逐批、逐課、逐生成器列每個指標。 */
function contrastLines(folder: Folder, reports: readonly BatchReport[]): string[] {
  const contrasts = allContrasts(folder.config, reports.flatMap(report => report.decks));
  if (!contrasts.length) return [];
  const lines = ['## 對照', '', '只報告，不判過不過（§8）。甲、乙只收同一個區組的份；明不明顯是單邊的兩兩比（平均比較少的那一邊，5%），兩組都有 3 份以上才判。', ''];
  for (const contrast of contrasts) {
    lines.push(`### ${contrast.name}：甲 ${contrast.a}、乙 ${contrast.b}`, '', '設定的差別：', '', ...contrast.differences.map(each => `- ${each}`), '');
    for (const result of contrast.results) {
      lines.push(`#### 批 ${String(result.batch)} ${result.lesson}｜${result.generator}（甲 ${String(result.counts.a)} 份、乙 ${String(result.counts.b)} 份）`, '', ...result.metrics.map(each => `- ${each.text}`), '');
    }
    if (contrast.missing.length) lines.push('缺一邊的：', '', ...contrast.missing.map(each => `- ${each}`), '');
  }
  return lines;
}
