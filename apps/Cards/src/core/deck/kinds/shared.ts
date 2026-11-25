import { maskInline } from '../markdown.ts';

// 各卡型共用的小函式（題型模組任務說明 §1-3，第 C 步再換成 §3 的一處）。

/** 只折全半形（U+FF01～FF5E），不做整串 NFKC：`①` 和 `1` 不同。 */
export const foldWidth = (text: string): string => text.replace(/[！-～]/g, char => String.fromCharCode(char.charCodeAt(0) - 0xFEE0));

/** 比對答案、組員與組的身分用的寫法：去掉成對的 `**`、`==` 與前後空白，連續空白（含全形）當一個，英文不分大小寫。字鍵照括號裡寫的顯示。 */
export function pickKey(text: string): string {
  const bare = text.replace(/\*\*(.+?)\*\*/g, '$1').replace(/==(.+?)==/g, '$1');
  return foldWidth(bare).replace(/\s+/g, ' ').trim().toLowerCase();
}

/** 拿掉 `%%` 註解（渲染後看不見）。 */
export const withoutComments = (text: string): string => text.replace(/%%[^]*?%%/g, '');

/**
 * 畫面上看得到的文字（§3〈空格怎麼數〉）：不看行內程式碼、公式、整個圖片與嵌入、連結目的地、HTML 標籤與 `%%` 註解；連結文字算。
 * 隔開的內容換成 \0，渲染後它們也是不同的文字節點；註解渲染後不見了，直接拿掉。字元參照照原樣（數空格時才當成 `＿`）。
 */
function visibleOf(text: string): string {
  return maskInline(text)
    .replace(/%%[^]*?%%/g, '')
    .replace(/!\[\[[^\]\n]*\]\]/g, '\0')
    .replace(/!\[[^\]\n]*\]\([^)\n]*\)/g, '\0')
    .replace(/\[\[[^\]\n|]*\|([^\]\n]*)\]\]/g, '\0$1\0')
    .replace(/\[([^\]\n]*)\]\([^)\n]*\)/g, '\0$1\0')
    .replace(/<\/?[a-zA-Z][^<>\n]*>/g, '\0');
}

/** 一段文字有幾個空格：畫面上連續的 `＿` 算一格，半形 `__` 不算；字元參照當一個 `＿`（渲染後就是）。 */
export function countBlanks(text: string): number {
  return visibleOf(text).replace(/&#(?:65343|[xX]0*[fF][fF]3[fF]);/g, '＿').match(/＿+/g)?.length ?? 0;
}

/** 名稱拆成字或詞、連續的括號與其後的文字；這一段有不成對、巢狀的括號，或沒有括號就是 null。 */
export function splitName(name: string): { word: string; brackets: string[]; rest: string } | null {
  const head = /^[^（(）)]+/.exec(name);
  if (!head) return null;
  const word = head[0].trim().replace(/^\*\*(.+)\*\*$/, '$1').trim();
  let rest = name.slice(head[0].length);
  const brackets: string[] = [];
  for (let match = /^\s*[（(]([^（）()]*)[）)]/.exec(rest); match; match = /^\s*[（(]([^（）()]*)[）)]/.exec(rest)) {
    brackets.push(match[1]);
    rest = rest.slice(match[0].length);
  }
  if (/^\s*[（(）)]/.test(rest) || !word || !brackets.length) return null;
  return { word, brackets, rest: rest.trim() };
}

/** 切項目：有頓號或逗號時只照它們切，空白留在項目裡；完全沒有時空白都切。空的項目丟掉，重複的只留第一個。 */
export function membersOf(inner: string): string[] {
  const items = (/[、,，]/.test(inner) ? inner.split(/[、,，]/) : inner.split(/\s+/)).map(item => item.trim()).filter(Boolean);
  const first = new Map<string, string>();
  for (const item of items) if (!first.has(pickKey(item))) first.set(pickKey(item), item);
  return [...first.values()];
}

export const LIST_SHAPE = /[、,，\s]/;

/** 沒有組時的結尾：名稱最後一段，前面要有空白或右括號。 */
export const endingOf = (name: string): string | null => /[\s）)]([^\s）)]+)$/.exec(name)?.[1] ?? null;

/**
 * 去掉成對的 `**` 與 `==`（名稱的粗體、螢光筆，§1-1：只為了認結尾與拆字義，名稱本身不改）。變化與英翻中都先做這一步再拆括號（L2 R7）。
 */
export const unbold = (text: string): string => text.replace(/\*\*(.+?)\*\*/g, '$1').replace(/==(.+?)==/g, '$1');

/** 文法與變化的題目：題幹有幾個空格（AI 草稿的檢查用，§5）。 */
export const blanksIn = (question: string): number => countBlanks(question);
