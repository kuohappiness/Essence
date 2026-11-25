// 比較測試工具：結果的兩份報告（任務說明 tasks/rule-test-tool.md §5-9；指標照 tasks/rule-test-d236.md）。明細.md（私人）：逐課、逐生成器、逐份的指標，
// 漏與部分的列、問題與裁定、評審 × 生成器的分項。摘要.md：只有數字（每組每份的平均），沒有教材、評分表與題目的原文，可以貼進 repo。
import type { Folder } from './folder.ts';
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

function averages(decks: readonly DeckMetrics[]): (string | number)[] {
  const avg = (pick: (deck: DeckMetrics) => number): string => one(mean(decks.map(pick)));
  const ms = decks.map(deck => deck.generationMs).filter((value): value is number => value !== null);
  const tokens = decks.map(deck => deck.tokens.input === null || deck.tokens.output === null ? null : deck.tokens.input + deck.tokens.output).filter((value): value is number => value !== null);
  return [
    decks.length, avg(deck => deck.majorTotal), avg(deck => deck.harm.total), avg(deck => deck.harm.判錯), avg(deck => deck.required.沒有), avg(deck => deck.required.部分), avg(deck => deck.minor),
    avg(deck => deck.childPrompts), avg(deck => deck.perRequired), avg(deck => deck.extraPrompts),
    avg(deck => deck.targets), `${String(decks.filter(deck => deck.unsaveable).length)}／${String(decks.length)}`,
    Math.round(mean(decks.map(deck => deck.rulesChars))), Math.round(mean(decks.map(deck => deck.promptChars))), tokens.length === decks.length ? Math.round(mean(tokens)) : '—', ms.length === decks.length ? minutes(mean(ms)) : '—',
  ];
}
const AVERAGE_HEAD = ['組', '份數', '重大', '傷到學習', '判錯', '漏的必備', '部分的必備', '小問題', '孩子要複習的題', '每個必備平均幾題', '多餘的題', '目標', '存不了', '規則字數', '整份提示字數', 'token', '生成（分）'];

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
    lines.push(`## ${section.lesson}｜${section.generator}`, '', ...head(AVERAGE_HEAD), ...section.groups.map(each => row([each.group, ...averages(each.decks)])), '');
  }
  lines.push(...gateLines(folder, reports), '');
  if (mode === 'summary') return lines;

  for (const report of reports) {
    lines.push(`## 批 ${String(report.batch)} 的評分表與裁定`, '');
    for (const [lesson, rows] of Object.entries(report.rows)) {
      lines.push(`### ${lesson} 評分表`, '', ...head(['列', '類別', '要考的知識或判準', '教學選擇']), ...rows.map(each => row([each.id, each.kind, each.text, each.effect ?? ''])), '');
    }
    lines.push('### 裁定', '', ...report.rulings.length ? report.rulings.map(each => `- ${each.id}：${each.text}`) : ['（沒有）'], '');
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
      `- 份數：候選 ${String(gate.counts.candidate)}、基準 ${String(gate.counts.baseline)}${gate.counts.unpaired ? `；候選另有 ${String(gate.counts.unpaired)} 份的區組沒有基準，不進門檻` : ''}${gate.counts.candidate < 3 || gate.counts.baseline < 3 ? '（不到 3 份：不判明顯）' : ''}`,
      ...[gate.major, gate.rows, gate.total, gate.extra, gate.harm, ...gate.benefits, ...gate.noWorse, ...gate.secondary].map(check => `- ${MARK(check.pass)} ${check.text}`),
      `- 收益至少要一項明顯：${gate.benefits.some(each => each.pass === true) ? '有' : '沒有'}`,
      ...Object.keys(gate.chance).length ? [`- 隨便各抽一份，候選比較好的機會：${Object.entries(gate.chance).map(([metric, value]) => `${metric} ${String(Math.round((value ?? 0) * 100))}%`).join('、')}`] : [],
      ...verdicts.length ? [`- 各批：${verdicts.join('、')}${flipped ? '（結果翻轉：照 D-228 維持現行、再加一課）' : ''}`] : [],
      ...late.length ? [`- 含看過前一批結果才決定加跑的份（批 ${late.join('、')}）`] : [],
      '',
    );
  }
  return lines;
}
