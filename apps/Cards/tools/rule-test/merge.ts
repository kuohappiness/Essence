// 比較測試工具：合併兩位評審（任務說明 tasks/rule-test-tool.md §6-1、§6-2）。逐列照合併表（一有一沒有、一有一部分都算部分，只數歧見）；
// 問題兩位聯集去重：行號用 parseDeck 歸到題，同一份、同一題、同一種算一筆（目標名稱行和那個目標的題算同一題），另記兩位都記或只有一位記。
import { parseDeck } from '../../src/core/deck/index.ts';
import type { JudgeResult } from './judge.ts';

export type Verdict = '有' | '部分' | '沒有';
type Issue = JudgeResult['issues'][number];

/** §6-2 的表：兩位都有＝有、都沒有＝沒有（漏），其他都是部分。 */
export function mergeVerdict(a: Verdict, b: Verdict): Verdict {
  return a === b ? a : '部分';
}

/** 一行歸到哪裡：target 是第幾個目標（不在目標裡的行是 null），prompt 是那個目標的第幾題（名稱與欄位行是 null；詳解等接在題目下的行歸那一題）。 */
interface Unit { target: number | null; prompt: number | null; line: number }

function unitsOf(deck: string): (line: number) => Unit {
  const targets = [...parseDeck(deck).targets].sort((a, b) => a.line - b.line);
  return line => {
    const at = line - 1;
    const index = targets.findLastIndex(target => target.line <= at);
    const target = targets.at(index);
    if (index < 0 || !target || at >= (targets.at(index + 1)?.line ?? Infinity)) return { target: null, prompt: null, line };
    const prompt = target.prompts.findLastIndex(each => each.line <= at);
    // 只有一題的目標，名稱行就是那一題（§8 第 11 條「同一題不同行（名稱行與題目行）」）。
    return { target: index, prompt: prompt >= 0 ? prompt : target.prompts.length === 1 ? 0 : null, line };
  };
}

/** 一筆問題指到哪裡：全部行在同一題就是那一題，在同一個目標就是那個目標，不然照第一行。 */
function issueUnit(units: readonly Unit[]): Unit {
  const [first] = units;
  if (first.target === null) return first;
  if (units.every(unit => unit.target === first.target && unit.prompt === first.prompt)) return first;
  if (units.every(unit => unit.target === first.target)) return { ...first, prompt: null };
  return first;
}

/** 兩個位置算不算同一題：同一個目標裡，其中一個只指到目標（名稱行）就算；不在目標裡的行要同一行。 */
function same(a: Unit, b: Unit): boolean {
  if (a.target === null || b.target === null) return a.target === b.target && a.line === b.line;
  return a.target === b.target && (a.prompt === null || b.prompt === null || a.prompt === b.prompt);
}

const unitName = (unit: Unit): string => unit.target === null ? `第 ${String(unit.line)} 行` : `目標 ${String(unit.target + 1)}${unit.prompt === null ? '' : ` 第 ${String(unit.prompt + 1)} 題`}`;

interface MergedIssue { kind: Issue['kind']; at: string[]; lines: number[]; judges: string[]; rubric: string; notes: string[] }
export interface MergedDeck {
  /** 逐列合併後的判定。 */
  rows: Record<string, Verdict>;
  /** 兩位判得不同的列（歧見，只列數、不裁定）。 */
  disagreements: string[];
  /** 不含「值得學」。 */
  issues: MergedIssue[];
  worthLearning: number;
}

/**
 * 合併一個區組裡一份卡組的兩位評審。deck 是匿名卡組（沒有行號）；results 照評審名稱。
 * 近義重複：兩題都對得上才算同一對；跨單元去向：照評分表的列。
 */
export function mergeDeck(code: string, deck: string, results: ReadonlyMap<string, JudgeResult>): MergedDeck {
  const judges = [...results.keys()];
  const rows: Record<string, Verdict> = {}, disagreements: string[] = [];
  for (const { row } of results.get(judges[0])!.rows) {
    const verdicts = judges.map(judge => results.get(judge)!.rows.find(each => each.row === row)!.decks.find(each => each.deck === code)!.verdict);
    rows[row] = verdicts.reduce(mergeVerdict);
    if (new Set(verdicts).size > 1) disagreements.push(row);
  }
  const unitOf = unitsOf(deck);
  const merged: (MergedIssue & { units: Unit[] })[] = [];
  let worthLearning = 0;
  for (const judge of judges) {
    for (const issue of results.get(judge)!.issues.filter(each => each.deck === code)) {
      if (issue.kind === '值得學') { worthLearning++; continue; }
      const lineUnits = issue.lines.map(unitOf);
      const units = issue.kind === '近義重複' ? lineUnits : lineUnits.length ? [issueUnit(lineUnits)] : [];
      const found = merged.find(each => each.kind === issue.kind && (
        issue.kind === '跨單元去向' ? each.rubric === issue.rubric
          : issue.kind === '近義重複' ? units.length === 2 && each.units.length === 2 && ((same(each.units[0], units[0]) && same(each.units[1], units[1])) || (same(each.units[0], units[1]) && same(each.units[1], units[0])))
            : units.length > 0 && each.units.length > 0 && same(each.units[0], units[0])));
      if (found) {
        if (!found.judges.includes(judge)) found.judges.push(judge);
        found.lines.push(...issue.lines.filter(line => !found.lines.includes(line)));
        found.notes.push(issue.note);
      } else merged.push({ kind: issue.kind, units, at: units.map(unitName), lines: [...issue.lines], judges: [judge], rubric: issue.rubric, notes: [issue.note] });
    }
  }
  return { rows, disagreements, issues: merged.map(({ units: _units, ...rest }) => rest), worthLearning };
}
