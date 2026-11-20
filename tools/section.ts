// 只讀需要的那一段（D-215 第 6 點）：長文件不整份讀進對話，指定檔案與標題，只印那一節。
// 用法：node tools/section.ts <檔案> <標題>   印那一節（到下一個同級或更高的標題為止），開頭一行「<檔案>:<起>-<迄>」
//       node tools/section.ts <檔案>          列出每個標題的行號、層級與字數
// 標題先比完全相同的純文字，沒有再比包含（不分大小寫）；對到好幾個時列出候選、exit 1；沒對到列出全部標題、exit 1。
// 程式碼區塊（``` 或 ~~~）裡的 # 不算標題。不寫任何檔。
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { fencedLines } from './fences.ts';

export interface Heading { level: number; title: string; line: number; end: number; chars: number }

/** 標題的純文字：拿掉結尾的 #、連結只留文字、反引號與強調符號拿掉。 */
export function plainTitle(raw: string): string {
  return raw.replace(/\s+#+\s*$/, '')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[`*_]/g, '')
    .trim();
}

/** 每個 ATX 標題；line 與 end 是 1 起算的行號（end 是這一節最後一行），chars 是這一節的字數。 */
export function headings(text: string): Heading[] {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/);
  const found: Omit<Heading, 'end' | 'chars'>[] = [];
  // 圍欄的判斷和決策查詢共用（fences.ts，L2 R10）。
  const code = fencedLines(lines);
  lines.forEach((line, i) => {
    if (code[i]) return;
    const match = /^ {0,3}(#{1,6})(?:[ \t]+(.*))?$/.exec(line);
    if (match) found.push({ level: match[1].length, title: plainTitle(match[2] ?? ''), line: i + 1 });
  });
  // 程式碼區塊沒關到檔尾：照 CommonMark 算到檔尾都是程式碼，標題照上面的結果。
  let total = lines.length;
  if (lines.at(-1) === '') total--;
  return found.map((heading, i) => {
    const next = found.slice(i + 1).find(other => other.level <= heading.level);
    const end = next ? next.line - 1 : total;
    const chars = [...lines.slice(heading.line - 1, end).join('\n')].length;
    return { ...heading, end, chars };
  });
}

export type Found = { section: Heading } | { candidates: Heading[] };

/** 完全相同的優先；沒有才比包含。兩種都不分大小寫。 */
export function findSection(text: string, query: string): Found {
  const all = headings(text);
  const want = plainTitle(query).toLowerCase();
  const exact = all.filter(h => h.title.toLowerCase() === want);
  const hits = exact.length ? exact : all.filter(h => h.title.toLowerCase().includes(want));
  return hits.length === 1 ? { section: hits[0] } : { candidates: hits.length ? hits : all };
}

const listLine = (h: Heading) => `${String(h.line).padStart(5)}  ${'#'.repeat(h.level)} ${h.title}（${h.chars} 字）`;

function main(): void {
  const [file, ...rest] = process.argv.slice(2);
  if (!file) {
    console.error('用法：node tools/section.ts <檔案> [標題]');
    process.exit(1);
  }
  const text = readFileSync(resolve(file), 'utf8');
  const query = rest.join(' ').trim();
  if (!query) {
    console.log(headings(text).map(listLine).join('\n'));
    return;
  }
  const found = findSection(text, query);
  if ('section' in found) {
    const { line, end } = found.section;
    const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).slice(line - 1, end);
    console.log(`${file}:${line}-${end}\n${lines.join('\n')}`);
    return;
  }
  const exactless = found.candidates.some(h => h.title.toLowerCase().includes(plainTitle(query).toLowerCase()));
  console.error(exactless ? `「${query}」對到好幾個標題，寫完整一點：` : `沒有包含「${query}」的標題，全部的標題：`);
  console.error(found.candidates.map(listLine).join('\n'));
  process.exit(1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main();
