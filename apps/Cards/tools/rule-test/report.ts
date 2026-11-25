// 比較測試工具：結果的兩份報告（任務說明 tasks/rule-test-tool.md §5-9）。明細.md（私人）：逐課、逐生成器、逐份的指標，
// 漏與部分的列、問題與裁定、評審 × 生成器的分項。摘要.md：只有數字（每組每份的平均），沒有教材、評分表與題目的原文，可以貼進 repo。
import type { Folder } from './folder.ts';
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
  const perQuestion = decks.map(deck => deck.perQuestion).filter((value): value is number => value !== null);
  const ms = decks.map(deck => deck.generationMs).filter((value): value is number => value !== null);
  return [
    decks.length, avg(deck => deck.required.沒有), avg(deck => deck.required.部分), avg(deck => deck.major), avg(deck => deck.qualityTotal), avg(deck => deck.nearDuplicates),
    avg(deck => deck.childErrors), avg(deck => deck.childErrorsNoMulti), perQuestion.length ? mean(perQuestion).toFixed(3) : '—',
    avg(deck => deck.targets), avg(deck => deck.prompts), `${String(decks.filter(deck => deck.unsaveable).length)}／${String(decks.length)}`,
    Math.round(mean(decks.map(deck => deck.rulesChars))), Math.round(mean(decks.map(deck => deck.promptChars))), ms.length === decks.length ? minutes(mean(ms)) : '—',
  ];
}
const AVERAGE_HEAD = ['組', '份數', '漏的必備', '部分的必備', '重大錯誤', '題目品質', '近義重複', '孩子會碰到的錯', '不算多解', '每題', '目標', '題', '存不了', '規則字數', '整份提示字數', '生成（分）'];

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
    '會直接進孩子複習的錯＝重大錯誤＋題目品質（每筆 1）；主要看每份的絕對數，每題的平均只當參考（§6-1）。', '',
  ];
  for (const section of sections(folder, unique)) {
    lines.push(`## ${section.lesson}｜${section.generator}`, '', ...head(AVERAGE_HEAD), ...section.groups.map(each => row([each.group, ...averages(each.decks)])), '');
  }
  if (mode === 'summary') return lines;

  for (const report of reports) {
    lines.push(`## 批 ${String(report.batch)} 的評分表與裁定`, '');
    for (const [lesson, rows] of Object.entries(report.rows)) {
      lines.push(`### ${lesson} 評分表`, '', ...head(['列', '類別', '要考的知識或判準', '教學選擇']), ...rows.map(each => row([each.id, each.kind, each.text, each.effect ?? ''])), '');
    }
    lines.push('### 裁定', '', ...report.rulings.length ? report.rulings.map(each => `- ${each.id}：${each.text}`) : ['（沒有）'], '');
  }
  for (const section of sections(folder, all)) {
    lines.push(`## ${section.lesson}｜${section.generator} 逐份`, '', ...head(['批', '區組', '代號', '組', '份', '漏的必備', '部分的必備', '加分（有／部分）', '重大錯誤（兩位／裁定）', '題目品質（兩位／一位）', '近義重複', '跨單元錯／列', '孩子會碰到的錯', '不算多解', '目標', '題', '候選', '加題', '存不了', '規則字數', '整份提示字數', '生成（分）', '歧見', '洩漏候選', '值得學']));
    for (const deck of section.groups.flatMap(each => each.decks)) {
      lines.push(row([
        deck.batch, deck.block, deck.code, deck.group, `${String(deck.copy)}${deck.replacement ? '（補）' : ''}`, deck.missed.join('、') || '0', deck.partial.join('、') || '0', `${String(deck.bonus.有)}／${String(deck.bonus.部分)}`,
        `${String(deck.major)}（${String(deck.majorBoth)}／${String(deck.majorRuled)}）`, `${String(deck.qualityTotal)}（${String(deck.qualityBoth)}／${String(deck.qualityOne)}）`, deck.nearDuplicates, `${String(deck.crossWrong)}／${String(deck.crossRows)}`,
        deck.childErrors, deck.childErrorsNoMulti, deck.targets, deck.prompts, deck.candidates, deck.adds, deck.unsaveable ? '是' : '', deck.rulesChars, deck.promptChars, minutes(deck.generationMs), deck.disagreements, deck.leakCandidates.length, deck.worthLearning,
      ]));
    }
    lines.push('');
    for (const deck of section.groups.flatMap(each => each.decks)) {
      const notes = [...deck.issues.map(issue => `${issue.kind} ${issue.at.join('＋') || `行 ${issue.lines.join('、')}`}${issue.rubric ? `（${issue.rubric}）` : ''}，${issue.judges.join('、')}：${issue.notes.filter(Boolean).join('／')}`), ...deck.leakCandidates.map(each => `洩漏候選（程式找的）：${each}`)];
      if (notes.length) lines.push(`### 批 ${String(deck.batch)} ${deck.block} ${deck.code}（${deck.group} 第 ${String(deck.copy)} 份）`, '', ...notes.map(each => `- ${each}`), '');
    }
  }
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
