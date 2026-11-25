// 比較測試工具：任務段選項（任務說明 tasks/rule-test-tool.md §4-2）。只有第一輪用過的四個，照候選規則 README〈檔案與組法〉〈精簡清單組〉
// 與第一輪的 build.ts 改外掛的 taskSection（第一輪是從現行組的提示切出任務段再改，結果相同）。
// 外掛沒有匯出組任務段的小函式，所以這裡用文字改：每一處的錨點都要剛好出現一次，找不到或不只一次就停下，不默默送出別的字。
import type { ExistingTarget, RuleSubject } from '../../src/core/ai/index.ts';
import type { TaskOptions } from './config.ts';

const THREE_SECTIONS = '- 照規則交三段，標記照抄（`<<<全貌>>>`、`<<<架構>>>`、`<<<卡組>>>`）。';
const END_LINE = '- 回覆的最後單獨一行寫 `<<<完>>>`。';
const ONE_LINE = '- 「學生已有的學習目標」每一項寫 `ID 名稱｜出處｜第一題：……`，第一題是那個目標現在的第一題（問答寫 `題目 :: 答案`，填空與排序寫整行），沒有題目的不寫；怎麼比對照規則〈和學生已有的目標比對〉。';
const LEAN_LINE = '- 「學生已有的學習目標」英文單字一個字一行：`字｜方向或變化 ID、…｜英翻中的答案｜所在的單元`（沒有英翻中的字寫第一題）；其他每一項 `ID 名稱｜所在的單元｜第一題`。怎麼比對照規則〈和學生已有的目標比對〉。';
const WORD_NAME = /^(.*) (英翻中|中翻英|過去式|過去分詞|複數|比較級|最高級)$/;

function only(lines: readonly string[], test: (line: string) => boolean, what: string): number {
  const found = lines.flatMap((line, i) => test(line) ? [i] : []);
  if (found.length !== 1) throw Error(`任務段的「${what}」${found.length ? `出現 ${String(found.length)} 次` : '找不到'}：外掛的任務段改過了，改用外掛來源或更新任務段選項`);
  return found[0];
}

/** 從 start 那一行到下一個最上層的 `- ` 之前（含中間的空行與縮排的範例）。 */
function blockEnd(lines: readonly string[], start: number): number {
  let end = start + 1;
  while (end < lines.length && !lines[end].startsWith('- ')) end++;
  return end;
}

/**
 * 精簡清單（D-229，照第一輪 build.ts 的 leanList）：名稱結尾是方向或變化的，同一個字（去掉結尾那一段）一行，欄位是
 * `字｜方向 ID、…｜英翻中第一題的答案｜所在的單元`；英翻中沒有或讀不出答案時寫這一行第一個目標的第一題，都沒有就空著。單元取這一行第一個目標的。
 * 其他一個目標一行 `ID 名稱｜所在的單元｜第一題`，沒有題目不寫第三欄。
 */
export function leanList(targets: readonly ExistingTarget[]): string[] {
  const unitOf = (source: string): string => source.split(' ').slice(0, 2).join(' ');
  const answer = (first: string | undefined): string | null => {
    const at = first?.indexOf(' :: ') ?? -1;
    return first === undefined || at < 0 ? null : first.slice(at + 4);
  };
  type Row = { word: string; unit: string; items: { kind: string; id: string; first: string | undefined }[] } | { other: string };
  const rows: Row[] = [], byWord = new Map<string, Extract<Row, { word: string }>>();
  for (const target of targets) {
    const match = WORD_NAME.exec(target.name);
    if (!match) {
      rows.push({ other: `  - ${target.id} ${target.name}｜${unitOf(target.source)}${target.first ? `｜${target.first}` : ''}` });
      continue;
    }
    let row = byWord.get(match[1]);
    if (!row) { row = { word: match[1], unit: unitOf(target.source), items: [] }; byWord.set(match[1], row); rows.push(row); }
    row.items.push({ kind: match[2], id: target.id, first: target.first });
  }
  return rows.map(row => {
    if ('other' in row) return row.other;
    const meaning = row.items.find(item => item.kind === '英翻中');
    const shown = meaning ? answer(meaning.first) : null;
    const third = shown ?? (row.items[0].first ? `第一題：${row.items[0].first}` : '');
    return `  - ${row.word}｜${row.items.map(item => `${item.kind} ${item.id}`).join('、')}｜${third}｜${row.unit}`;
  });
}

/** 照任務段選項改外掛的任務段；全部是外掛的預設時原樣回傳（§8 第 2 條）。 */
export function applyTaskOptions(task: string, options: TaskOptions, context: { subject: RuleSubject; existing: readonly ExistingTarget[] }): string {
  const lines = task.split('\n');
  if (!options.pickRules) {
    const start = only(lines, line => line.startsWith('- 家長沒勾點選填空：') || line.startsWith('- 家長勾了點選填空：'), '點選填空的說明');
    lines.splice(start, blockEnd(lines, start) - start);
  }
  if (context.existing.length && (options.existingRules === 'line' || options.existingList === 'lean')) {
    const start = only(lines, line => line.startsWith('- 「學生已有的學習目標」每一項寫'), '已有目標的比對說明');
    lines.splice(start, blockEnd(lines, start) - start, options.existingList === 'lean' ? LEAN_LINE : ONE_LINE);
  }
  if (options.existingList === 'lean' && context.existing.length) {
    const head = only(lines, line => line === '- 學生已有的學習目標：', '學生已有的學習目標');
    let end = head + 1;
    while (end < lines.length && lines[end].startsWith('  - ')) end++;
    if (end - head - 1 !== context.existing.length) throw Error('任務段的已有目標行數和快照對不上');
    lines.splice(head + 1, end - head - 1, ...leanList(context.existing));
  }
  const three = lines.indexOf(THREE_SECTIONS);
  if (options.threeSections && three < 0) lines.splice(only(lines, line => line === END_LINE, '最後一行寫 <<<完>>>'), 0, THREE_SECTIONS);
  if (!options.threeSections && three >= 0 && !context.subject.r3) lines.splice(three, 1);
  return lines.join('\n');
}
