// 比較測試工具：合併兩位評審（任務說明 tasks/rule-test-tool.md §6-1、§6-2）。逐列照合併表（一有一沒有、一有一部分都算部分，只數歧見）；
// 問題兩位聯集去重：行號用 parseDeck 歸到題，同一份、同一題、同一種算一筆（目標名稱行和那個目標的題算同一題），另記兩位都記或只有一位記。
import { parseDeck, type Prompt } from '../../src/core/deck/index.ts';
import type { JudgeResult } from './judge.ts';

export type Verdict = '有' | '部分' | '沒有';
type Issue = JudgeResult['issues'][number];

/** §6-2 的表：兩位都有＝有、都沒有＝沒有（漏），其他都是部分。 */
export function mergeVerdict(a: Verdict, b: Verdict): Verdict {
  return a === b ? a : '部分';
}

/** 一行歸到哪裡：target 是第幾個目標（不在目標裡的行是 null），prompt 是那個目標的第幾題（名稱與欄位行是 null；詳解等接在題目下的行歸那一題）。 */
interface Unit { target: number | null; prompt: number | null; line: number }

/**
 * AI 回覆的卡組段裡，候選卡片與加進已有的學習目標寫在引言框（`> [!note]- 候選卡片`）裡，parseDeck 不讀框裡的行。
 * 拿掉一層 `> `、框的標題行換成空行，一行對一行（行號不變），框裡的目標和題就和本文的一樣歸得到。
 */
function unquoted(deck: string): string[] {
  return deck.split('\n').map(line => /^>\s*\[!/.test(line) ? '' : line.replace(/^> ?/, ''));
}

/** 目標照行號排好，每個目標到哪一行為止（不含）：下一個不是空行、也沒有縮排的行（下一個目標、篇名、框的標題、備註）之前，再去掉結尾的空行。 */
function targetsOf(deck: string): { target: ReturnType<typeof parseDeck>['targets'][number]; end: number }[] {
  const lines = unquoted(deck);
  return [...parseDeck(lines.join('\n')).targets].sort((a, b) => a.line - b.line).map(target => {
    let end = target.line + 1;
    while (end < lines.length && (!lines[end].trim() || /^\s/.test(lines[end]))) end++;
    while (end > target.line + 1 && !lines[end - 1].trim()) end--;
    return { target, end };
  });
}

function unitsOf(deck: string): (line: number) => Unit {
  const ranges = targetsOf(deck), targets = ranges.map(each => each.target);
  return line => {
    const at = line - 1;
    const index = targets.findLastIndex(target => target.line <= at);
    const target = targets.at(index);
    if (index < 0 || !target || at >= ranges[index].end) return { target: null, prompt: null, line };
    const prompt = target.prompts.findLastIndex(each => each.line <= at);
    // 只有一題的目標，名稱行就是那一題（§8 第 11 條「同一題不同行（名稱行與題目行）」）。
    return { target: index, prompt: prompt >= 0 ? prompt : target.prompts.length === 1 ? 0 : null, line };
  };
}

/** 近義重複的兩行是不是兩道不同的題（rule-test-d236.md §4）：兩行都歸得到題（不是目標外的行、不是有好幾題的目標的名稱行），而且不是同一題。 */
export function twoPrompts(deck: string, lines: readonly number[]): boolean {
  if (lines.length !== 2) return false;
  const unitOf = unitsOf(deck);
  const [a, b] = lines.map(unitOf);
  return a.target !== null && b.target !== null && a.prompt !== null && b.prompt !== null && !(a.target === b.target && a.prompt === b.prompt);
}

/**
 * 近義重複併成組（§4）：共用一題的對併在一起；多餘的題＝每組（題數 − 1）加總。pairs 是每一對的兩個位置名稱（合併後的 at）。
 */
export function duplicateGroups(pairs: readonly (readonly string[])[]): { groups: number; extra: number } {
  const parent = new Map<string, string>();
  const find = (x: string): string => { let root = x; while (parent.get(root) !== root) root = parent.get(root)!; parent.set(x, root); return root; };
  for (const pair of pairs) for (const each of pair) if (!parent.has(each)) parent.set(each, each);
  for (const [a, b] of pairs) if (a !== undefined && b !== undefined) parent.set(find(a), find(b));
  const sizes = new Map<string, number>();
  for (const each of parent.keys()) sizes.set(find(each), (sizes.get(find(each)) ?? 0) + 1);
  return { groups: sizes.size, extra: [...sizes.values()].reduce((sum, size) => sum + size - 1, 0) };
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

export interface MergedIssue { kind: Issue['kind']; at: string[]; lines: number[]; judges: string[]; rubric: string; notes: string[] }
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

/** 一題的答案：問答題取答案裡的粗體字，沒有粗體時整個答案（`|` 分開的各算一個）；填空題取挖空的字。 */
function answersOf(prompt: Prompt): string[] {
  if (prompt.kind === 'cloze') return prompt.blanks.map(blank => prompt.text.slice(blank.start + 2, blank.end - 2).trim());
  const bold = [...prompt.answer.matchAll(/\*\*(.+?)\*\*/g)].map(match => match[1].trim());
  return bold.length ? bold : prompt.answer.split('|').map(each => each.trim());
}
/** 一題的題幹：問答題是問題；填空題是挖掉空格之後的句子。 */
function stemOf(prompt: Prompt): string {
  if (prompt.kind === 'qa') return prompt.question;
  let text = prompt.text;
  for (const blank of [...prompt.blanks].sort((a, b) => b.start - a.start)) text = text.slice(0, blank.start) + '＿' + text.slice(blank.end);
  return text;
}

/**
 * 程式找的洩漏候選（§5-8，照第一輪 cross.py）：同一個目標裡，一張卡的答案出現在另一張卡的題幹（不分大小寫、兩個字以上才比，免得單字母亂中）。
 * 那張卡兩位評審都沒記洩漏的才算；一張卡算一筆。只比字面，換句話說的會漏；另列一個數，不進門檻。
 */
export function leakCandidates(deck: string, issues: readonly MergedIssue[]): string[] {
  const recorded = new Set(issues.filter(issue => issue.kind === '洩漏').flatMap(issue => issue.at));
  const found = new Map<string, number[]>();
  targetsOf(deck).forEach(({ target }, t) => {
    const answers = target.prompts.map(prompt => answersOf(prompt).map(each => each.toLowerCase()).filter(each => [...each].length >= 2));
    target.prompts.forEach((prompt, to) => {
      const stem = stemOf(prompt).toLowerCase();
      const from = answers.flatMap((list, i) => i !== to && list.some(answer => stem.includes(answer)) ? [i + 1] : []);
      const at = unitName({ target: t, prompt: to, line: prompt.line + 1 });
      if (from.length && !recorded.has(at) && !recorded.has(unitName({ target: t, prompt: null, line: target.line + 1 }))) found.set(at, from);
    });
  });
  return [...found].map(([at, from]) => `${at}的題幹有第 ${from.join('、')} 題的答案`);
}
