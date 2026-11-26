// 比較測試工具：加深評分（任務說明 tasks/rule-test-d236.md §6-3）。每個區組、每位評審另開一個對話：逐列判加深機會、每一項判接得對或接錯、
// 記加深內容的問題（種類同卡組）。工具驗項 ID、行號、判「有」的證據不能是這位評審判接錯的項；合併照卡組的表，項兩位不同是歧見。
import { QUALITY_KINDS } from './levels.ts';
import { mergeVerdict, type Verdict } from './merge.ts';
import type { DeepenChance } from './rubric.ts';

/** 加深內容的問題種類：卡組的錯（§3），不含只有卡組才有的近義重複、跨單元去向與值得學。 */
const DEEPEN_ISSUE_KINDS = ['重大錯誤', ...QUALITY_KINDS] as const;
type DeepenIssueKind = (typeof DEEPEN_ISSUE_KINDS)[number];
const REASONS = ['沒有加深', '層次不對', '接錯目標'] as const;

export interface DeepenResult {
  rows: { row: string; decks: { deck: string; evidence: string; items: string[]; verdict: Verdict }[] }[];
  items: { deck: string; item: string; verdict: '接得對' | '接錯'; reason: '' | (typeof REASONS)[number]; note: string }[];
  issues: { deck: string; kind: DeepenIssueKind; item: string; lines: number[]; note: string }[];
  unsure: string;
}

const object = (properties: Record<string, unknown>): Record<string, unknown> => ({ type: 'object', additionalProperties: false, required: Object.keys(properties), properties });
const array = (items: unknown): Record<string, unknown> => ({ type: 'array', items });

/** 加深評分的 schema（同卡組：陣列、enum、全部必填）。 */
export function deepenSchema(codes: readonly string[]): Record<string, unknown> {
  const deck = { type: 'string', enum: [...codes] };
  return object({
    rows: array(object({ row: { type: 'string' }, decks: array(object({ deck, evidence: { type: 'string' }, items: array({ type: 'string' }), verdict: { type: 'string', enum: ['有', '部分', '沒有'] } })) })),
    items: array(object({ deck, item: { type: 'string' }, verdict: { type: 'string', enum: ['接得對', '接錯'] }, reason: { type: 'string', enum: ['', ...REASONS] }, note: { type: 'string' } })),
    issues: array(object({ deck, kind: { type: 'string', enum: [...DEEPEN_ISSUE_KINDS] }, item: { type: 'string' }, lines: array({ type: 'integer' }), note: { type: 'string' } })),
    unsure: { type: 'string' },
  });
}

export interface DeepenContext {
  chances: readonly DeepenChance[];
  codes: readonly string[];
  /** 每一份給評審的檔（沒有行號的原文，一行一個元素）與項 ID。 */
  sheets: ReadonlyMap<string, readonly string[]>;
  items: ReadonlyMap<string, readonly string[]>;
}

/** 驗加深評分（§6-3）：每列每份一格、每份每項一筆；證據的項存在、判「有」的證據不能是這位判接錯的項；行號落在有字的行。 */
export function validateDeepen(value: unknown, context: DeepenContext): string[] {
  const problems: string[] = [];
  const result = value as Partial<DeepenResult> | undefined;
  if (!result || typeof result !== 'object' || !Array.isArray(result.rows) || !Array.isArray(result.items) || !Array.isArray(result.issues)) return ['不是照 schema 的 JSON（要有 rows、items、issues、unsure）'];
  const known = (deck: string, item: string): boolean => context.items.get(deck)?.includes(item) ?? false;
  const wanted = context.chances.map(row => row.id), given = result.rows.map(row => row.row);
  const missing = wanted.filter(id => !given.includes(id));
  if (missing.length) problems.push(`少了這幾列：${missing.join('、')}`);
  const extra = given.filter(id => !wanted.includes(id));
  if (extra.length) problems.push(`評分表沒有這幾列（只判加深機會）：${[...new Set(extra)].join('、')}`);
  const twice = given.filter((id, i) => given.indexOf(id) !== i);
  if (twice.length) problems.push(`這幾列寫了不只一次：${[...new Set(twice)].join('、')}`);
  const wrong = new Set(result.items.filter(each => each.verdict === '接錯').map(each => `${each.deck} ${each.item}`));
  for (const row of result.rows) {
    const decks = row.decks.map(each => each.deck);
    const lack = context.codes.filter(code => !decks.includes(code));
    if (lack.length || decks.length !== context.codes.length) problems.push(`列 ${row.row}：每份要剛好一格（少了 ${lack.join('、') || '無'}，共寫了 ${String(decks.length)} 格）`);
    for (const cell of row.decks) {
      if (cell.verdict !== '沒有' && !cell.items.length) problems.push(`列 ${row.row} 的 ${cell.deck}：判「${cell.verdict}」要寫證據的項`);
      const bad = cell.items.filter(item => !known(cell.deck, item));
      if (bad.length) problems.push(`列 ${row.row} 的 ${cell.deck}：${bad.join('、')} 不是這一份的項`);
      const judgedWrong = cell.items.filter(item => wrong.has(`${cell.deck} ${item}`));
      if (cell.verdict === '有' && judgedWrong.length) problems.push(`列 ${row.row} 的 ${cell.deck}：${judgedWrong.join('、')} 你判了接錯，不能當「有」的證據（改判部分，或換證據）`);
    }
  }
  for (const code of context.codes) {
    const mine = result.items.filter(each => each.deck === code).map(each => each.item);
    const lack = (context.items.get(code) ?? []).filter(item => !mine.includes(item));
    if (lack.length) problems.push(`${code} 少了這幾項：${lack.join('、')}`);
    const bad = mine.filter(item => !known(code, item));
    if (bad.length) problems.push(`${code} 沒有這幾項：${[...new Set(bad)].join('、')}`);
    const again = mine.filter((item, i) => mine.indexOf(item) !== i);
    if (again.length) problems.push(`${code} 這幾項寫了不只一次：${[...new Set(again)].join('、')}`);
  }
  for (const each of result.items) {
    if (each.verdict === '接錯' && !each.reason) problems.push(`${each.deck} ${each.item}：接錯要選原因`);
    if (each.verdict === '接得對' && each.reason) problems.push(`${each.deck} ${each.item}：接得對的原因寫空字串`);
  }
  result.issues.forEach((issue, i) => {
    const at = `問題第 ${String(i + 1)} 筆（${issue.deck} ${issue.kind}）`;
    if (!issue.lines.length) problems.push(`${at}：要寫行號`);
    const sheet = context.sheets.get(issue.deck) ?? [];
    const bad = issue.lines.filter(line => !Number.isInteger(line) || line < 1 || !(sheet[line - 1] ?? '').trim());
    if (bad.length) problems.push(`${at}：行號 ${bad.join('、')} 不是這一份有字的行`);
    // 草稿在第一個「# 第 N 篇的加深」之前（deepen.ts 的 deepenSheet）。
    const replies = sheet.findIndex(line => /^# 第 \d+ 篇的加深$/.test(line));
    const draft = issue.lines.filter(line => !bad.includes(line) && (replies < 0 || line - 1 < replies));
    if (draft.length) problems.push(`${at}：行號 ${draft.join('、')} 在草稿，草稿不評（只記加深回覆裡的問題）`);
    if (issue.item && !known(issue.deck, issue.item)) problems.push(`${at}：${issue.item} 不是這一份的項`);
  });
  return problems;
}

interface MergedDeepenIssue { kind: DeepenIssueKind; item: string; lines: number[]; judges: string[]; notes: string[] }
export interface MergedDeepen {
  rows: Record<string, Verdict>; disagreements: string[];
  /** 每一項：兩位都說對是對、都說錯是錯，不同是歧見（§6-3）。 */
  items: Record<string, '對' | '錯' | '歧見'>;
  issues: MergedDeepenIssue[];
}

/** 問題算同一筆：同一種、同一項；不在項裡的，同一種、行號有重疊。 */
const sameIssue = (a: { kind: string; item: string; lines: readonly number[] }, b: { kind: string; item: string; lines: readonly number[] }): boolean =>
  a.kind === b.kind && (a.item || b.item ? a.item === b.item : a.lines.some(line => b.lines.includes(line)));

/** 合併一份加深的兩位評審（§6-3）。 */
export function mergeDeepen(code: string, results: ReadonlyMap<string, DeepenResult>): MergedDeepen {
  const judges = [...results.keys()];
  const rows: Record<string, Verdict> = {}, disagreements: string[] = [];
  for (const { row } of results.get(judges[0])!.rows) {
    const verdicts = judges.map(judge => results.get(judge)!.rows.find(each => each.row === row)!.decks.find(each => each.deck === code)!.verdict);
    rows[row] = verdicts.reduce(mergeVerdict);
    if (new Set(verdicts).size > 1) disagreements.push(row);
  }
  const items: Record<string, '對' | '錯' | '歧見'> = {};
  for (const { item } of results.get(judges[0])!.items.filter(each => each.deck === code)) {
    const verdicts = new Set(judges.map(judge => results.get(judge)!.items.find(each => each.deck === code && each.item === item)!.verdict));
    items[item] = verdicts.size > 1 ? '歧見' : verdicts.has('接得對') ? '對' : '錯';
  }
  const issues: MergedDeepenIssue[] = [];
  for (const judge of judges) {
    for (const issue of results.get(judge)!.issues.filter(each => each.deck === code)) {
      const found = issues.find(each => sameIssue(each, issue));
      if (found) {
        if (!found.judges.includes(judge)) found.judges.push(judge);
        found.lines.push(...issue.lines.filter(line => !found.lines.includes(line)));
        found.notes.push(issue.note);
      } else issues.push({ kind: issue.kind, item: issue.item, lines: [...issue.lines], judges: [judge], notes: [issue.note] });
    }
  }
  return { rows, disagreements, items, issues };
}
