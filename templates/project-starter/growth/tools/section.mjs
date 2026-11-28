// 只讀需要的那一段：長文件不整份讀進對話，指定檔案與標題，只印那一節。只讀不寫，所以沒有 --check。
// 用法：node tools/section.mjs <檔案> <標題>   印那一節（到下一個同級或更高的標題為止），開頭一行「<檔案>:<起>-<迄>」
//       node tools/section.mjs <檔案>          列出每個標題的行號、層級與字數
// 標題先比完全相同的純文字，沒有再比包含（不分大小寫）；對到好幾個時列出候選、exit 1；沒對到列出全部標題、exit 1。
// 程式碼區塊（``` 或 ~~~）裡的 # 不算標題。只用 Node 內建的模組，Node 20 以上直接跑。
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

/** 每一行是不是在圍欄程式碼區塊裡（開頭與收尾那一行也算）。收尾要同一種字元、不短於開頭；沒收尾的算到檔尾。 */
function fencedLines(lines) {
  let open;
  return lines.map((line) => {
    const fence = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
    if (open) {
      if (fence && fence[1][0] === open[0] && fence[1].length >= open.length && !fence[2].trim()) open = undefined;
      return true;
    }
    if (!fence || (fence[1][0] === '`' && fence[2].includes('`'))) return false;
    open = fence[1];
    return true;
  });
}

/** 標題的純文字：拿掉結尾的 #、連結只留文字、反引號與強調符號拿掉。 */
export function plainTitle(raw) {
  return raw.replace(/\s+#+\s*$/, '')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[`*_]/g, '')
    .trim();
}

/** 每個標題：level、title、line 與 end（1 起算的行號，end 是這一節最後一行）、chars（這一節的字數）。 */
export function headings(text) {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/);
  const code = fencedLines(lines);
  const found = [];
  lines.forEach((line, i) => {
    if (code[i]) return;
    const match = /^ {0,3}(#{1,6})(?:[ \t]+(.*))?$/.exec(line);
    if (match) found.push({ level: match[1].length, title: plainTitle(match[2] ?? ''), line: i + 1 });
  });
  let total = lines.length;
  if (lines.at(-1) === '') total--;
  return found.map((heading, i) => {
    const next = found.slice(i + 1).find((other) => other.level <= heading.level);
    const end = next ? next.line - 1 : total;
    return { ...heading, end, chars: [...lines.slice(heading.line - 1, end).join('\n')].length };
  });
}

/** 完全相同的優先；沒有才比包含。兩種都不分大小寫。回傳 { section } 或 { candidates }。 */
export function findSection(text, query) {
  const all = headings(text);
  const want = plainTitle(query).toLowerCase();
  const exact = all.filter((h) => h.title.toLowerCase() === want);
  const hits = exact.length ? exact : all.filter((h) => h.title.toLowerCase().includes(want));
  return hits.length === 1 ? { section: hits[0] } : { candidates: hits.length ? hits : all };
}

const listLine = (h) => `${String(h.line).padStart(5)}  ${'#'.repeat(h.level)} ${h.title}（${h.chars} 字）`;

function main() {
  const [file, ...rest] = process.argv.slice(2);
  if (!file) {
    console.error('用法：node tools/section.mjs <檔案> [標題]');
    process.exit(1);
  }
  const text = readFileSync(resolve(file), 'utf8');
  const query = rest.join(' ').trim();
  if (!query) {
    console.log(headings(text).map(listLine).join('\n'));
    return;
  }
  const found = findSection(text, query);
  if (found.section) {
    const { line, end } = found.section;
    const lines = text.replace(/^﻿/, '').split(/\r?\n/).slice(line - 1, end);
    console.log(`${file}:${line}-${end}\n${lines.join('\n')}`);
    return;
  }
  const several = found.candidates.some((h) => h.title.toLowerCase().includes(plainTitle(query).toLowerCase()));
  console.error(several ? `「${query}」對到好幾個標題，寫完整一點：` : `沒有包含「${query}」的標題，全部的標題：`);
  console.error(found.candidates.map(listLine).join('\n'));
  process.exit(1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main();
