// 比較測試工具：評分表（任務說明 tasks/rule-test-tool.md §5-2）。Markdown 表
// `| 列 | 類別 | 要考的知識或判準 | 頁碼 | 可以接受的等價做法 | 跨單元 |`；類別是必備、加分、重大錯誤或加深機會（rule-test-d236.md §6-3）；
// 跨單元寫 `加題 <ID>`、`另立`、`疑似重複 <ID>` 或空白。檢查列號不重複、類別合法、ID 在已有目標快照裡。
// 加深機會的判準寫成 `用到 R1、R3：<往下一層要問什麼>`，課外的在最後寫 `（課外：<可以查的來源>）`；用到的要是必備列。
import { readFileSync } from 'node:fs';

type RowKind = '必備' | '加分' | '重大錯誤' | '加深機會';
export interface RubricRow { id: string; kind: RowKind; text: string; pages: string; equivalents: string; cross: string }

const KINDS: readonly RowKind[] = ['必備', '加分', '重大錯誤', '加深機會'];
const CHANCE = /^用到 ([^：:]+)[：:]\s*(.+?)\s*$/;
const OUTSIDE = /（課外[：:]\s*([^（）]*?)\s*）$/;
const cells = (line: string): string[] => line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(cell => cell.trim().replace(/^\*\*(.*)\*\*$/, '$1'));

/** 讀評分表；有問題丟一個列出全部問題的錯誤。knownIds 是已有目標快照的 ID（沒有快照時不查）。 */
export function parseRubric(text: string, knownIds: ReadonlySet<string> | null = null): RubricRow[] {
  const rows: RubricRow[] = [], problems: string[] = [];
  for (const line of text.replace(/\r\n?/g, '\n').split('\n')) {
    if (!line.trim().startsWith('|')) continue;
    const [id = '', kind = '', what = '', pages = '', equivalents = '', cross = ''] = cells(line);
    if (id === '列' || /^:?-{2,}:?$/.test(id)) continue;
    if (!KINDS.includes(kind as RowKind)) { problems.push(`列「${id}」的類別「${kind}」不是 ${KINDS.join('、')}`); continue; }
    if (rows.some(row => row.id === id)) problems.push(`列號「${id}」重複`);
    if (cross && !/^(加題|疑似重複) \S+$|^另立$/.test(cross)) problems.push(`列「${id}」的跨單元「${cross}」要寫 加題 <ID>、另立、疑似重複 <ID> 或空白`);
    const ref = /^(?:加題|疑似重複) (\S+)$/.exec(cross)?.[1];
    if (ref && knownIds && !knownIds.has(ref)) problems.push(`列「${id}」的跨單元 ID「${ref}」不在已有目標快照裡`);
    rows.push({ id, kind: kind as RowKind, text: what, pages, equivalents, cross });
  }
  if (!rows.some(row => row.kind === '必備')) problems.push('沒有必備的列');
  for (const row of rows.filter(each => each.kind === '加深機會')) {
    const match = CHANCE.exec(row.text);
    if (!match) { problems.push(`列「${row.id}」是加深機會，判準要寫成「用到 R1、R3：往下一層要問什麼」`); continue; }
    const uses = match[1].split(/[、,，]\s*/).map(each => each.trim());
    const bad = uses.filter(id => !rows.some(each => each.id === id && each.kind === '必備'));
    if (bad.length) problems.push(`列「${row.id}」用到的 ${bad.join('、')} 不是這張表的必備列`);
    if (row.cross) problems.push(`列「${row.id}」是加深機會，跨單元要空著`);
    if (/（課外/.test(row.text) && !OUTSIDE.exec(row.text)?.[1]) problems.push(`列「${row.id}」是課外，要在最後寫「（課外：可以查的來源）」`);
  }
  if (problems.length) throw Error(`評分表有 ${String(problems.length)} 個問題：\n${problems.map(each => `- ${each}`).join('\n')}`);
  return rows;
}

/**
 * 課庫裡一課的評分表要讀得通才鎖（凍結、匿名時）：格式不合的鎖進去就換不掉了（2026-11-25 使用者電腦：第一輪的評分表欄位順序不同，凍結照樣鎖了）。
 */
export function checkRubricFile(path: string, lesson: string, knownIds: ReadonlySet<string> | null): void {
  try { parseRubric(readFileSync(path, 'utf8'), knownIds); }
  catch (error) { throw Error(`課「${lesson}」的評分表不能用（${path}）：${error instanceof Error ? error.message : String(error)}`); }
}

/** 評審要逐列判的（必備與加分）。 */
export const judgedRows = (rows: readonly RubricRow[]): RubricRow[] => rows.filter(row => row.kind === '必備' || row.kind === '加分');

/** 加深機會（§6-3）：用到哪幾個必備、往下一層要問什麼、課外的來源（課內是 null）。 */
export interface DeepenChance { id: string; uses: string[]; ask: string; outside: string | null; pages: string }
export const deepenChances = (rows: readonly RubricRow[]): DeepenChance[] => rows.filter(row => row.kind === '加深機會').map(row => {
  const match = CHANCE.exec(row.text)!;
  return { id: row.id, uses: match[1].split(/[、,，]\s*/).map(each => each.trim()), ask: match[2], outside: OUTSIDE.exec(row.text)?.[1] ?? null, pages: row.pages };
});
