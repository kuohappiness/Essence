// 比較測試工具：unblind（任務說明 tasks/rule-test-tool.md §5-9、§6-1）。那一批鎖定、裁定.md 每一格都填了，才讀對照表解開；
// 照裁定另算（原評分不改），算每一份的指標，寫 結果/批N.json，再從解開過的每一批重寫 明細.md、明細.json（私人）與 摘要.md
// （只有數字與結論，可以貼進 repo）；每一課的 使用紀錄.md 加一行（之後用這一課時，凍結會警告只能當回歸，F15）。
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { batchDir, batchNumbers, openBatch, type Batch } from './blind.ts';
import { cliPath } from '../cli-path.ts';
import { collectDisputes, deepenAt, mergeBatch } from './disputes.ts';
import { levelOf, QUALITY_KINDS, type Level, type QualityKind } from './levels.ts';
import { lessonDir, openFolder, rubricOf, sha256File, writeOnce, type Folder } from './folder.ts';
import { git, readFrozenSteps, verifyLock } from './freeze.ts';
import { readFormat } from './check.ts';
import { jobState, planJobs, readEvents } from './jobs.ts';
import { duplicateGroups, leakCandidates, type MergedIssue, type Verdict } from './merge.ts';
import { deepenChances, parseRubric, type RubricRow } from './rubric.ts';
import type { JudgeResult } from './judge.ts';
import { allContrasts } from './contrast.ts';
import { allGates } from './gates.ts';
import { summaryLines } from './report.ts';

interface Effect { row: string; to: '拿掉' | '加分' | '必備' }
interface Rulings {
  majors: Map<string, { verdict: '成立' | '不成立'; quality: '' | QualityKind }>;
  choices: { id: string; notes: string[]; kind: '教學選擇' | '照口徑'; effects: Effect[] }[];
}

function parseEffects(text: string): Effect[] | null {
  if (text === '照原樣') return [];
  const effects = text.split(/[、，,]/).map(each => each.trim()).filter(Boolean).map(each => {
    const drop = /^拿掉 (\S+)$/.exec(each), change = /^(\S+) 改(加分|必備)$/.exec(each);
    return drop ? { row: drop[1], to: '拿掉' as const } : change ? { row: change[1], to: change[2] as '加分' | '必備' } : null;
  });
  return effects.length && effects.every(each => each !== null) ? effects : null;
}

/** 讀 裁定.md（disputes 寫、操作的 Claude 填）；空格或寫法不對的一次列完。 */
function parseRulings(text: string, expected: { majors: readonly string[]; notes: readonly string[] }): Rulings {
  const problems: string[] = [];
  const rows = text.split('\n').filter(line => line.trim().startsWith('|')).map(line => line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(cell => cell.trim()));
  const majors: Rulings['majors'] = new Map();
  for (const id of expected.majors) {
    const cells = rows.find(each => each[0] === id);
    const verdict = cells?.[9] ?? '', quality = cells?.[10] ?? '';
    if (!cells) { problems.push(`${id}：裁定.md 裡沒有這一列`); continue; }
    if (verdict !== '成立' && verdict !== '不成立') { problems.push(`${id}：「裁定」要寫成立或不成立`); continue; }
    if (quality && !(QUALITY_KINDS as readonly string[]).includes(quality)) problems.push(`${id}：「改記」要寫 ${QUALITY_KINDS.join('、')} 之一或空著`);
    if (verdict === '成立' && quality) problems.push(`${id}：成立時「改記」空著`);
    majors.set(id, { verdict, quality: quality as '' | QualityKind });
  }
  const choices: Rulings['choices'] = [];
  for (const cells of rows.filter(each => /^C\d+$/.test(each[0]))) {
    const [id, notes = '', kind = '', , , choice = ''] = cells;
    if (kind !== '教學選擇' && kind !== '照口徑') { problems.push(`${id}：「分類」要寫教學選擇或照口徑`); continue; }
    const effects = kind === '照口徑' ? [] : parseEffects(choice);
    if (!effects) problems.push(choice ? `${id}：「使用者的選擇」要寫 照原樣、拿掉 <列>、<列> 改加分 或 <列> 改必備` : `${id} 是教學選擇，「使用者的選擇」還沒填（照使用者的話填）`);
    choices.push({ id, notes: notes.split('、').map(each => each.trim()).filter(Boolean), kind, effects: effects ?? [] });
  }
  const covered = choices.flatMap(each => each.notes);
  const lack = expected.notes.filter(id => !covered.includes(id));
  if (lack.length) problems.push(`拿不準的 ${lack.join('、')} 沒有分進任何一項`);
  if (problems.length) throw Error(`裁定.md 還有 ${String(problems.length)} 處要填或改：\n${problems.map(each => `- ${each}`).join('\n')}`);
  return { majors, choices };
}

export interface DeckMetrics {
  batch: number; lesson: string; block: string; code: string; group: string; generator: string; copy: number; replacement: boolean;
  /** 這一批是在前面某一批解開之後才匿名的（看過前一批結果才決定加跑，§5-10）。 */
  late: boolean;
  required: Record<Verdict, number>; missed: string[]; partial: string[];
  bonus: Record<Verdict, number>;
  disagreements: number;
  major: number; majorBoth: number; majorRuled: number;
  /** 第 1 道的重大（rule-test-d236.md §7-2）：重大錯誤＋存不了（每份 1）＋加深的重大與加深存不了。 */
  majorTotal: number;
  quality: Record<QualityKind, number>; qualityTotal: number; qualityBoth: number; qualityOne: number;
  /** 傷到學習（§3）：判錯、洩漏、漏的必備，其他是其餘算傷到學習的種類；total 是合計（加深的另外加在 deepen）。 */
  harm: { 判錯: number; 洩漏: number; 漏的必備: number; 其他: number; total: number };
  /** 小問題的筆數（只報告）。 */
  minor: number;
  /** 近義重複：對數、併成幾組、多餘的題（每組題數減一加總，§4）。 */
  nearDuplicates: number; duplicateGroups: number; extraPrompts: number;
  crossRows: number; crossWrong: number;
  /** 孩子要複習的題（正式目標的題＋加題底下的每一題）、確定考到的必備（兩位都判有）、每個必備平均幾題（§4）。 */
  childPrompts: number; sureRequired: number; perRequired: number;
  targets: number; prompts: number; candidates: number; adds: number; unsaveable: boolean;
  rulesChars: number; promptChars: number;
  generationMs: number | null; costUsd: number | null;
  /** token（§9）：輸入含快取寫入與讀取、輸出；有一步不知道就是 null。 */
  tokens: { input: number | null; output: number | null };
  /** 加深的 token（§9）：評了的每一篇加總，和生成的分開；沒跑加深是 null。 */
  deepenTokens: { input: number | null; output: number | null } | null;
  /** 地圖（§5）：這一組不交地圖是 null。 */
  map: { missing: boolean; missed: number; issues: number } | null;
  /** 加深（§6）：沒跑加深（手貼、設定沒寫）是 null。 */
  deepen: DeepenMetrics | null;
  leakCandidates: string[]; worthLearning: number;
  /** 每位評審自己的數（評審 × 生成器的分項，§5-9）。 */
  byJudge: Record<string, { missed: number; issues: number }>;
  issues: MergedIssue[];
}

/** 一份的加深（§6-3）：放棄的篇不算進來，另外報。 */
export interface DeepenMetrics {
  /** 評了幾篇（放棄的不算）、放棄幾篇、加深存不了幾篇、幾項。 */
  pieces: number; abandoned: number; unsavable: number; items: number;
  /** 卡組存不了、不能模擬加深（§2-1）：加深機會漏掉記全部列，確定接錯這一份不算（null）。 */
  undeepened: boolean;
  /** 加深機會漏掉（兩位都判沒有的列數）；確定接錯、歧見（兩位不同）；加深的重大（含加深存不了）與傷到學習。 */
  missed: number; wrong: number | null; disputed: number; major: number; harm: number;
}

export interface BatchReport {
  batch: number; unblinded: string; commit: string; late: boolean;
  rows: Record<string, { id: string; kind: string; text: string; effect: string | null }[]>;
  rulings: { id: string; text: string }[];
  decks: DeckMetrics[];
}

const resultsDir = (folder: Folder): string => join(folder.root, '結果');
const reportFile = (folder: Folder, n: number): string => join(resultsDir(folder), `批${String(n)}.json`);
export const readReports = (folder: Folder): BatchReport[] => existsSync(resultsDir(folder))
  ? readdirSync(resultsDir(folder)).flatMap(name => /^批(\d+)\.json$/.exec(name)?.[1] ?? []).map(Number).sort((a, b) => a - b).map(n => JSON.parse(readFileSync(reportFile(folder, n), 'utf8')) as BatchReport)
  : [];

const sum = (values: readonly number[]): number => values.reduce((total, each) => total + each, 0);

/** 生成時間與用量：完成的那一次嘗試，每一步的時間加起來（手貼的沒有）。 */
/**
 * 一份生成的用量：完成的那一次嘗試的每一步。實送字數（rule-test-d236.md §9，含代入的前一步回覆）在送出時記進事件；
 * 舊的事件與手貼沒有記，照凍結的提示字數（sent 是 null）。
 */
function generationOf(folder: Folder, job: string): { ms: number | null; cost: number | null; tokens: DeckMetrics['tokens']; sent: number | null } {
  const events = readEvents(folder);
  const attempt = jobState(events, job).last?.attempt;
  const steps = events.filter(event => event.job === job && event.attempt === attempt && event.type === 'step');
  const ms = steps.map(event => event.detail?.ms).filter((value): value is number => typeof value === 'number');
  const cost = steps.map(event => event.detail?.costUsd).filter((value): value is number => typeof value === 'number');
  const sent = steps.map(event => event.detail?.sent).filter((value): value is number => typeof value === 'number');
  return { ms: ms.length ? sum(ms) : null, cost: cost.length ? sum(cost) : null, tokens: tokensOf(steps.map(event => event.detail?.usage)), sent: sent.length && sent.length === steps.length ? sum(sent) : null };
}

/** 加深的 token（§9）：這一份每一篇完成的那一次。 */
function deepenTokensOf(folder: Folder, job: string): DeckMetrics['tokens'] {
  const events = readEvents(folder, join('加深', '事件.jsonl'));
  return tokensOf(events.filter(event => event.type === 'done' && event.job?.startsWith(`${job}~加深~`)).map(event => event.detail?.usage));
}

/** token（rule-test-d236.md §9）：每一步的 usage 加總；輸入＝input＋快取寫入＋快取讀取，輸出＝output。有一步沒有就是不知道（null），不是 0。 */
export function tokensOf(usages: readonly unknown[]): DeckMetrics['tokens'] {
  if (!usages.length) return { input: null, output: null };
  let input = 0, output = 0;
  for (const usage of usages) {
    const each = typeof usage === 'object' && usage !== null ? usage as Record<string, unknown> : null;
    const n = (key: string): number | null => typeof each?.[key] === 'number' ? each[key] : null;
    if (n('input_tokens') === null || n('output_tokens') === null) return { input: null, output: null };
    input += n('input_tokens')! + (n('cache_creation_input_tokens') ?? 0) + (n('cache_read_input_tokens') ?? 0);
    output += n('output_tokens')!;
  }
  return { input, output };
}

/** 照教學選擇調整後的評分表列（拿掉、改加分、改必備）。 */
function effectiveRows(rows: readonly RubricRow[], effects: readonly Effect[]): { row: RubricRow; kind: '必備' | '加分'; effect: string | null }[] {
  return rows.filter(row => row.kind === '必備' || row.kind === '加分').flatMap(row => {
    const effect = effects.filter(each => each.row === row.id).at(-1);
    if (effect?.to === '拿掉') return [];
    return [{ row, kind: effect ? effect.to : row.kind as '必備' | '加分', effect: effect ? `改${effect.to}` : null }];
  });
}

export function unblindFolder(folder: Folder, options: { batch?: number; log?: (line: string) => void } = {}): BatchReport {
  const { log = console.log } = options;
  verifyLock(folder);
  const n = options.batch ?? batchNumbers(folder).at(-1) ?? 0;
  if (existsSync(reportFile(folder, n))) {
    writeReports(folder);
    log(`批 ${String(n)} 已經解開過；照解開過的每一批重寫了 明細 與 摘要。`);
    return JSON.parse(readFileSync(reportFile(folder, n), 'utf8')) as BatchReport;
  }
  for (const lesson of folder.config.lessons) {
    const locked = join(folder.root, '凍結', '評分表', `${lesson.code}.sha256`);
    if (existsSync(locked) && readFileSync(locked, 'utf8').trim() !== sha256File(rubricOf(folder, lesson))) throw Error(`課「${lesson.code}」的評分表在鎖定之後改過`);
  }
  const merge = mergeBatch(folder, n);
  const disputes = collectDisputes(merge);
  const rulingsFile = join(batchDir(folder, n), '裁定.md');
  if (!existsSync(rulingsFile)) throw Error(`批 ${String(n)} 還沒裁定（先跑 disputes）`);
  const rulings = parseRulings(readFileSync(rulingsFile, 'utf8'), { majors: disputes.majors.map(each => each.id), notes: disputes.unsure.map(each => each.id) });

  const rubrics = new Map(folder.config.lessons.map(lesson => [lesson.code, parseRubric(readFileSync(rubricOf(folder, lesson), 'utf8'))]));
  const effects = new Map<string, Effect[]>();
  const effectProblems: string[] = [];
  for (const choice of rulings.choices) {
    const lessons = [...new Set(choice.notes.map(id => disputes.unsure.find(each => each.id === id)?.lesson).filter((each): each is string => each !== undefined))];
    for (const effect of choice.effects) {
      const hits = lessons.filter(lesson => rubrics.get(lesson)?.some(row => row.id === effect.row && (row.kind === '必備' || row.kind === '加分')));
      if (!hits.length) effectProblems.push(`${choice.id}：「${effect.row}」不是 ${lessons.join('、')} 評分表的必備或加分列`);
      for (const lesson of hits) effects.set(lesson, [...effects.get(lesson) ?? [], effect]);
    }
  }
  if (effectProblems.length) throw Error(`裁定.md 的教學選擇寫錯了：\n${effectProblems.map(each => `- ${each}`).join('\n')}`);

  // 檢查都過了才讀對照表（§5-9）。
  const batch: Batch = openBatch(folder, n);
  const earlier = readReports(folder).filter(report => report.batch < n);
  const late = earlier.some(report => report.unblinded < batch.time);
  const jobs = planJobs(folder, readFrozenSteps(folder), readEvents(folder));
  const unchecked = batch.entries.filter(entry => readFormat(folder, jobs.find(each => each.key === entry.job)!) === null);
  if (unchecked.length) throw Error(`還有 ${String(unchecked.length)} 份沒做格式檢查（先跑 check）`);
  const steps = readFrozenSteps(folder);
  const decks: DeckMetrics[] = merge.entries.map(({ block, code, deck, merged, map, deepen }) => {
    const entry = batch.entries.find(each => each.lesson === block.lesson && each.code === code)!;
    const job = jobs.find(each => each.key === entry.job)!;
    const rows = effectiveRows(rubrics.get(block.lesson)!, effects.get(block.lesson) ?? []);
    const count = (kind: '必備' | '加分', verdict: Verdict): string[] => rows.filter(each => each.kind === kind && merged.rows[each.row.id] === verdict).map(each => each.row.id);
    const issues: MergedIssue[] = [];
    let majorBoth = 0, majorRuled = 0;
    for (const issue of merged.issues) {
      if (issue.kind !== '重大錯誤') { issues.push(issue); continue; }
      if (issue.judges.length > 1) { majorBoth++; issues.push(issue); continue; }
      const dispute = disputes.majors.find(each => each.block === block.name && each.code === code && each.at === issue.at.join('＋'))!;
      const ruling = rulings.majors.get(dispute.id)!;
      if (ruling.verdict === '成立') { majorRuled++; issues.push({ ...issue, notes: [...issue.notes, `裁定 ${dispute.id} 成立`] }); continue; }
      if (ruling.quality && !merged.issues.some(each => each.kind === ruling.quality && each.at.join('＋') === issue.at.join('＋'))) issues.push({ ...issue, kind: ruling.quality, notes: [...issue.notes, `裁定 ${dispute.id} 不成立，改記${ruling.quality}`] });
    }
    const quality = Object.fromEntries(QUALITY_KINDS.map(kind => [kind, issues.filter(issue => issue.kind === kind).length])) as Record<QualityKind, number>;
    const qualityIssues = issues.filter(issue => (QUALITY_KINDS as readonly string[]).includes(issue.kind));
    const crossIds = new Set(rows.filter(each => each.row.cross).map(each => each.row.id));
    const counted = issues.filter(issue => issue.kind !== '跨單元去向' || crossIds.has(issue.rubric));
    const levelCount = (level: Level, skip: readonly string[] = []): number => counted.filter(issue => !skip.includes(issue.kind) && levelOf(issue.kind, folder.config.levels) === level).length;
    const formats = readFormat(folder, job)!;
    const pieces = formats.flatMap(record => record.pieces);
    const prompts = sum(pieces.map(piece => piece.prompts));
    const childPrompts = prompts + sum(pieces.map(piece => piece.addPrompts));
    const mine = steps.filter(step => step.group === entry.group && step.lesson === block.lesson);
    const generation = generationOf(folder, job.key);
    const major = majorBoth + majorRuled;
    const unsaveable = formats.some(record => record.errors.length > 0);
    const missed = count('必備', '沒有');
    const harm = { 判錯: quality.判錯, 洩漏: quality.洩漏, 漏的必備: missed.length, 其他: levelCount('傷到學習', ['判錯', '洩漏']), total: 0 };
    harm.total = harm.判錯 + harm.洩漏 + harm.漏的必備 + harm.其他;
    const pairs = issues.filter(issue => issue.kind === '近義重複').map(issue => issue.at);
    const duplicates = duplicateGroups(pairs);
    const sure = count('必備', '有').length;
    // 地圖（rule-test-d236.md §5、§2-1）：不交是 null；應交沒交是全部必備漏、問題 0。
    const required = rows.filter(each => each.kind === '必備');
    let mapMetrics: DeckMetrics['map'] = null;
    if (entry.map.kind === 'missing') mapMetrics = { missing: true, missed: required.length, issues: 0 };
    else if (entry.map.kind === 'ok') {
      if (!map) throw Error(`${block.name} ${code} 有地圖，卻沒有地圖的評分`);
      mapMetrics = { missing: false, missed: required.filter(each => map.rows[each.row.id] === '沒有').length, issues: map.issues.length };
    }
    // 加深（§6-3、§2-1）：卡組存不了是加深機會全漏、確定接錯不算；只有一位記的重大照裁定，不成立改記的照那一種算級。
    const chances = deepenChances(rubrics.get(block.lesson)!).length;
    let deepenMetrics: DeckMetrics['deepen'] = null;
    if (entry.deepen.kind === 'unsavable') deepenMetrics = { pieces: 0, abandoned: 0, unsavable: 0, items: 0, undeepened: true, missed: chances, wrong: null, disputed: 0, major: 0, harm: 0 };
    else if (entry.deepen.kind === 'ok') {
      const { pieces, abandoned, unsavable, items } = entry.deepen;
      const kinds: string[] = [];
      let deepenMajor = 0;
      for (const issue of deepen?.issues ?? []) {
        if (issue.kind !== '重大錯誤') { kinds.push(issue.kind); continue; }
        if (issue.judges.length > 1) { deepenMajor++; continue; }
        const dispute = disputes.majors.find(each => each.stage === '加深' && each.block === block.name && each.code === code && each.at === deepenAt(issue))!;
        const ruling = rulings.majors.get(dispute.id)!;
        if (ruling.verdict === '成立') deepenMajor++;
        else if (ruling.quality) kinds.push(ruling.quality);
      }
      const verdicts = Object.values(deepen?.items ?? {});
      deepenMetrics = {
        pieces: pieces - abandoned, abandoned, unsavable, items, undeepened: false,
        missed: deepen ? Object.values(deepen.rows).filter(verdict => verdict === '沒有').length : 0,
        wrong: verdicts.filter(each => each === '錯').length, disputed: verdicts.filter(each => each === '歧見').length,
        major: deepenMajor + unsavable,
        harm: kinds.filter(kind => levelOf(kind as QualityKind, folder.config.levels) === '傷到學習').length,
      };
    }
    const results = merge.results.get(block.name)!;
    return {
      batch: n, lesson: block.lesson, block: block.name, code, group: entry.group, generator: entry.generator, copy: entry.copy, replacement: entry.replacement, late,
      required: { 有: sure, 部分: count('必備', '部分').length, 沒有: missed.length }, missed, partial: count('必備', '部分'),
      bonus: { 有: count('加分', '有').length, 部分: count('加分', '部分').length, 沒有: count('加分', '沒有').length },
      disagreements: merged.disagreements.filter(id => rows.some(each => each.row.id === id)).length,
      major, majorBoth, majorRuled, majorTotal: major + (unsaveable ? 1 : 0) + (deepenMetrics?.major ?? 0),
      quality, qualityTotal: qualityIssues.length, qualityBoth: qualityIssues.filter(issue => issue.judges.length > 1).length, qualityOne: qualityIssues.filter(issue => issue.judges.length === 1).length,
      harm, minor: levelCount('小問題'),
      nearDuplicates: pairs.length, duplicateGroups: duplicates.groups, extraPrompts: duplicates.extra,
      crossRows: crossIds.size, crossWrong: issues.filter(issue => issue.kind === '跨單元去向' && crossIds.has(issue.rubric)).length,
      childPrompts, sureRequired: sure, perRequired: childPrompts / Math.max(sure, 0.5),
      targets: sum(pieces.map(piece => piece.targets)), prompts, candidates: sum(pieces.map(piece => piece.candidates)), adds: sum(pieces.map(piece => piece.adds)),
      unsaveable,
      rulesChars: sum(mine.map(step => step.rulesChars)), promptChars: generation.sent ?? sum(mine.map(step => step.chars)),
      generationMs: generation.ms, costUsd: generation.cost, tokens: generation.tokens,
      deepenTokens: entry.deepen.kind === 'ok' ? deepenTokensOf(folder, entry.job) : null,
      map: mapMetrics, deepen: deepenMetrics,
      leakCandidates: leakCandidates(deck, issues), worthLearning: merged.worthLearning,
      byJudge: Object.fromEntries([...results].map(([judge, result]: [string, JudgeResult]) => [judge, {
        missed: result.rows.filter(row => rows.some(each => each.kind === '必備' && each.row.id === row.row) && row.decks.find(each => each.deck === code)?.verdict === '沒有').length,
        issues: result.issues.filter(issue => issue.deck === code && issue.kind !== '值得學').length,
      }])),
      issues,
    };
  });

  const commit = git(['rev-parse', 'HEAD']);
  const report: BatchReport = {
    batch: n, unblinded: new Date().toISOString(), commit, late,
    rows: Object.fromEntries([...new Set(decks.map(deck => deck.lesson))].map(lesson => [lesson, rubrics.get(lesson)!.map(row => {
      const effect = effectiveRows([row], effects.get(lesson) ?? []).at(0);
      return { id: row.id, kind: row.kind, text: row.text, effect: row.kind === '重大錯誤' || row.kind === '加深機會' ? null : effect ? effect.effect : '拿掉' };
    })])),
    rulings: [
      ...disputes.majors.map(each => ({ id: each.id, text: `${each.block} ${each.code} ${each.at}：${rulings.majors.get(each.id)!.verdict}${rulings.majors.get(each.id)!.quality ? `，改記${rulings.majors.get(each.id)!.quality}` : ''}` })),
      ...rulings.choices.map(each => ({ id: each.id, text: `${each.kind}（${each.notes.join('、')}）：${each.kind === '照口徑' ? '照口徑' : each.effects.length ? each.effects.map(effect => effect.to === '拿掉' ? `拿掉 ${effect.row}` : `${effect.row} 改${effect.to}`).join('、') : '照原樣'}` })),
    ],
    decks,
  };
  mkdirSync(resultsDir(folder), { recursive: true });
  writeOnce(reportFile(folder, n), JSON.stringify(report, null, 2) + '\n');
  for (const lesson of new Set(decks.map(deck => deck.lesson))) {
    const config = folder.config.lessons.find(each => each.code === lesson)!;
    const groups = folder.config.groups.map(each => each.name).filter(group => decks.some(deck => deck.lesson === lesson && deck.group === group));
    appendFileSync(join(lessonDir(folder, config), '使用紀錄.md'), `- ${report.unblinded.slice(0, 10)}「${folder.config.name}」批 ${String(n)} 解開，commit ${commit}（組：${groups.join('、')}）\n`, 'utf8');
  }
  writeReports(folder);
  log(`批 ${String(n)} 解開了：結果/明細.md、明細.json、摘要.md；${String(decks.length)} 份。`);
  return report;
}

/** 從解開過的每一批重寫 明細.json、明細.md 與 摘要.md。 */
function writeReports(folder: Folder): void {
  const reports = readReports(folder);
  writeFileSync(join(resultsDir(folder), '明細.json'), JSON.stringify({ name: folder.config.name, batches: reports, gates: allGates(folder.config.gates, reports.flatMap(report => report.decks)), contrasts: allContrasts(folder.config, reports.flatMap(report => report.decks)) }, null, 2) + '\n', 'utf8');
  writeFileSync(join(resultsDir(folder), '摘要.md'), summaryLines(folder, reports, 'summary').join('\n') + '\n', 'utf8');
  writeFileSync(join(resultsDir(folder), '明細.md'), summaryLines(folder, reports, 'detail').join('\n') + '\n', 'utf8');
}

/** `npm run rule-test -- unblind <測試資料夾> [--batch N]` */
export function unblind(): Promise<void> {
  const [dir, ...flags] = process.argv.slice(3);
  if (!dir) throw Error('用法：npm run rule-test -- unblind <測試資料夾> [--batch N]');
  const at = flags.indexOf('--batch');
  unblindFolder(openFolder(cliPath(dir, 'rule-test')), at >= 0 ? { batch: Number(flags[at + 1]) } : {});
  return Promise.resolve();
}
