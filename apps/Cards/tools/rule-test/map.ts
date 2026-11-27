// 比較測試工具：學習地圖（任務說明 tasks/rule-test-d236.md §5）。原稿 `<<<全貌>>>` 到 `<<<卡組>>>` 之前是地圖：切法同卡組段，字不改、統一換行；
// 給評審的把兩個標記行換成標題。評審照同一份評分表逐列判全貌齊不齊、記地圖的問題（每筆一個錨點）；合併照卡組的表。
import type { FrozenStep } from './freeze.ts';
import { mergeVerdict, type Verdict } from './merge.ts';
import { judgedRows, type RubricRow } from './rubric.ts';

const WHOLE = '<<<全貌>>>', FRAME = '<<<架構>>>', DECK = '<<<卡組>>>';

/** 交不交地圖（§2 適用表）：卡組步驟都交三段的組才交。 */
export const handsInMap = (steps: readonly FrozenStep[]): boolean => steps.filter(step => step.deck).every(step => step.threeSections);

export type MapCut = { ok: true; map: string } | { ok: false; why: string };

/** 一份回覆的地圖：`<<<全貌>>>` 到 `<<<卡組>>>` 之前；少了標記或全貌、架構有一段是空的，回原因（記「沒交地圖」，§2-1）。 */
export function cutMap(reply: string): MapCut {
  const lines = reply.replace(/^﻿/, '').replace(/\r\n?/g, '\n').split('\n');
  const at = (mark: string): number => lines.findIndex(line => line.trim() === mark);
  const whole = at(WHOLE), frame = at(FRAME), deck = at(DECK);
  if (whole < 0 || frame < 0 || deck < 0 || !(whole < frame && frame < deck)) return { ok: false, why: `沒有照順序的 ${WHOLE}、${FRAME}、${DECK}` };
  const blank = (from: number, to: number): boolean => lines.slice(from + 1, to).every(line => !line.trim());
  if (blank(whole, frame)) return { ok: false, why: '全貌是空的' };
  if (blank(frame, deck)) return { ok: false, why: '架構是空的' };
  const part = lines.slice(whole, deck);
  while (part.length && !part.at(-1)!.trim()) part.pop();
  return { ok: true, map: part.join('\n') + '\n' };
}

/** 多步的組：每一個卡組步驟的地圖照順序接起來，每一步前面標第幾步（§5-1）。有一步沒交就整份沒交。 */
export function joinMaps(cuts: readonly { step: number; cut: MapCut }[]): MapCut {
  const missing = cuts.find(each => !each.cut.ok);
  if (missing && !missing.cut.ok) return cuts.length > 1 ? { ok: false, why: `第 ${String(missing.step)} 步：${missing.cut.why}` } : missing.cut;
  const maps = cuts.map(each => (each.cut as { map: string }).map);
  return { ok: true, map: cuts.length > 1 ? cuts.map((each, i) => `# 第 ${String(each.step)} 步\n\n${maps[i]}`).join('\n') : maps[0] };
}

/** 給評審的：兩個標記行換成標題，其他字不改（§5-2）。 */
export const anonymousMap = (map: string): string => map.split('\n').map(line => line.trim() === WHOLE ? '## 全貌' : line.trim() === FRAME ? '## 架構' : line).join('\n');

const MAP_ISSUE_KINDS = ['判準不清', '分層錯', '接錯已有目標', '其他'] as const;
type MapIssueKind = (typeof MAP_ISSUE_KINDS)[number];

export interface MapResult {
  rows: { row: string; decks: { deck: string; evidence: string; lines: number[]; verdict: Verdict }[] }[];
  issues: { deck: string; kind: MapIssueKind; anchor: number; lines: number[]; rubric: string; note: string }[];
  unsure: string;
}

const object = (properties: Record<string, unknown>): Record<string, unknown> => ({ type: 'object', additionalProperties: false, required: Object.keys(properties), properties });
const array = (items: unknown): Record<string, unknown> => ({ type: 'array', items });

/** 地圖評分的 schema（同卡組：陣列、enum、全部必填）。 */
export function mapSchema(codes: readonly string[]): Record<string, unknown> {
  const deck = { type: 'string', enum: [...codes] };
  const lines = array({ type: 'integer' });
  return object({
    rows: array(object({ row: { type: 'string' }, decks: array(object({ deck, evidence: { type: 'string' }, lines, verdict: { type: 'string', enum: ['有', '部分', '沒有'] } })) })),
    issues: array(object({ deck, kind: { type: 'string', enum: [...MAP_ISSUE_KINDS] }, anchor: { type: 'integer' }, lines, rubric: { type: 'string' }, note: { type: 'string' } })),
    unsure: { type: 'string' },
  });
}

/** 錨點（§5-3）：那個目標或判準所在那一項的第一行，要是清單項或標題的開頭。 */
const ANCHOR = /^\s*(?:[-*+]\s|\d+[.)、]\s*|#{1,6}\s)/;

/** 驗地圖評分：列號同卡組（必備與加分每列每份一格）；行號落在地圖有字的行；錨點是清單項或標題；接錯已有目標要寫評分表的跨單元列。 */
export function validateMap(value: unknown, context: { rows: readonly RubricRow[]; codes: readonly string[]; maps: ReadonlyMap<string, readonly string[]> }): string[] {
  const problems: string[] = [];
  const result = value as Partial<MapResult> | undefined;
  if (!result || typeof result !== 'object' || !Array.isArray(result.rows) || !Array.isArray(result.issues)) return ['不是照 schema 的 JSON（要有 rows、issues、unsure）'];
  const text = (deck: string, line: number): string => Number.isInteger(line) && line >= 1 ? context.maps.get(deck)?.[line - 1] ?? '' : '';
  const badLines = (deck: string, lines: readonly number[]): number[] => lines.filter(line => !text(deck, line).trim());
  const wanted = judgedRows(context.rows).map(row => row.id);
  const given = result.rows.map(row => row.row);
  const missing = wanted.filter(id => !given.includes(id));
  if (missing.length) problems.push(`少了這幾列：${missing.join('、')}`);
  const extra = given.filter(id => !wanted.includes(id));
  if (extra.length) problems.push(`評分表沒有這幾列（只判必備與加分）：${[...new Set(extra)].join('、')}`);
  const twice = given.filter((id, i) => given.indexOf(id) !== i);
  if (twice.length) problems.push(`這幾列寫了不只一次：${[...new Set(twice)].join('、')}`);
  for (const row of result.rows) {
    const decks = row.decks.map(each => each.deck);
    const lack = context.codes.filter(code => !decks.includes(code));
    if (lack.length || decks.length !== context.codes.length) problems.push(`列 ${row.row}：每份地圖要剛好一格（少了 ${lack.join('、') || '無'}，共寫了 ${String(decks.length)} 格）`);
    for (const cell of row.decks) {
      if (cell.verdict !== '沒有' && !cell.lines.length) problems.push(`列 ${row.row} 的 ${cell.deck}：判「${cell.verdict}」要寫證據的行號`);
      const bad = badLines(cell.deck, cell.lines);
      if (bad.length) problems.push(`列 ${row.row} 的 ${cell.deck}：行號 ${bad.join('、')} 不是地圖裡有字的行`);
    }
  }
  const cross = new Set(context.rows.filter(row => row.cross).map(row => row.id));
  result.issues.forEach((issue, i) => {
    const at = `問題第 ${String(i + 1)} 筆（${issue.deck} ${issue.kind}）`;
    if (!ANCHOR.test(text(issue.deck, issue.anchor))) problems.push(`${at}：錨點 ${String(issue.anchor)} 要是那一項的第一行（清單項或標題的開頭）`);
    const bad = badLines(issue.deck, issue.lines);
    if (bad.length) problems.push(`${at}：行號 ${bad.join('、')} 不是地圖裡有字的行`);
    if (issue.kind === '接錯已有目標' && !cross.has(issue.rubric)) problems.push(`${at}：rubric 要寫評分表「跨單元」有寫的列號`);
  });
  return problems;
}

interface MergedMapIssue { kind: MapIssueKind; anchor: number; lines: number[]; judges: string[]; rubric: string; notes: string[] }
export interface MergedMap { rows: Record<string, Verdict>; disagreements: string[]; issues: MergedMapIssue[] }

/** 合併一份地圖的兩位評審（§5-3）：逐列照合併表；問題聯集，同一種、同一個錨點算一筆，兩位的證據行都留。 */
export function mergeMap(code: string, results: ReadonlyMap<string, MapResult>): MergedMap {
  const judges = [...results.keys()];
  const rows: Record<string, Verdict> = {}, disagreements: string[] = [];
  for (const { row } of results.get(judges[0])!.rows) {
    const verdicts = judges.map(judge => results.get(judge)!.rows.find(each => each.row === row)!.decks.find(each => each.deck === code)!.verdict);
    rows[row] = verdicts.reduce(mergeVerdict);
    if (new Set(verdicts).size > 1) disagreements.push(row);
  }
  const issues: MergedMapIssue[] = [];
  for (const judge of judges) {
    for (const issue of results.get(judge)!.issues.filter(each => each.deck === code)) {
      const found = issues.find(each => each.kind === issue.kind && each.anchor === issue.anchor);
      if (found) {
        if (!found.judges.includes(judge)) found.judges.push(judge);
        found.lines.push(...issue.lines.filter(line => !found.lines.includes(line)));
        found.notes.push(issue.note);
      } else issues.push({ kind: issue.kind, anchor: issue.anchor, lines: [...issue.lines], judges: [judge], rubric: issue.rubric, notes: [issue.note] });
    }
  }
  return { rows, disagreements, issues };
}
