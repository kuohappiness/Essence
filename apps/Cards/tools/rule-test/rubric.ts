// 比較測試工具：評分表（任務說明 tasks/rule-test-tool.md §5-2）。Markdown 表
// `| 列 | 類別 | 要考的知識或判準 | 頁碼 | 可以接受的等價做法 | 跨單元 |`；類別是必備、加分或重大錯誤；
// 跨單元寫 `加題 <ID>`、`另立`、`疑似重複 <ID>` 或空白。檢查列號不重複、類別合法、ID 在已有目標快照裡。
import { readFileSync } from 'node:fs';

type RowKind = '必備' | '加分' | '重大錯誤';
export interface RubricRow { id: string; kind: RowKind; text: string; pages: string; equivalents: string; cross: string }

const KINDS: readonly RowKind[] = ['必備', '加分', '重大錯誤'];
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
export const judgedRows = (rows: readonly RubricRow[]): RubricRow[] => rows.filter(row => row.kind !== '重大錯誤');
