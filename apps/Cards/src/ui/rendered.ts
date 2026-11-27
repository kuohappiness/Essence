import { BLANK, closingRun, englishBeside, englishBreak, glueArticles, openingRun, tailStart } from '../review/index.ts';

// Obsidian 渲染出來的卡片內容的後處理（D-145）：打字卡的空格、中文後面的英文換行、冠詞連著下一個字、空格後面的標點不換到下一行、喇叭接在最後一個字後面。
// 只改一般的 HTML 文字；圖、SVG、公式、嵌入、程式碼與填空、空格自己的內容一律不動（Codex 審查 F3）。
// 開發命令 md-cases 用 Obsidian 真的渲染器跑這些情況（Node 沒有 DOM），結果檔看 checks。

/** 不能動裡面文字的內容：喇叭接在它們後面，冠詞與換行也不處理它們裡面的字。 */
const PROTECTED = 'svg, math, mjx-container, .math, .internal-embed, img, audio, video, iframe, code, pre, .ec-slot, .ec-blank';
/** 一段文字所在的區塊（換行與冠詞只在同一個區塊裡找）。 */
const BLOCK = 'p, li, td, th, h1, h2, h3, h4, h5, h6, blockquote, div';

/** root 底下照順序的文字節點，不含受保護的內容裡的。 */
function textNodes(root: Node): Text[] {
  const out: Text[] = [];
  const walk = (node: Node): void => {
    for (let child = node.firstChild; child; child = child.nextSibling) {
      if (child instanceof Text) out.push(child);
      else if (child instanceof Element && !child.matches(PROTECTED)) walk(child);
    }
  };
  walk(root);
  return out;
}

/** root 底下所有的文字節點，含受保護的內容裡的（拿掉重複的記號用）。 */
function allText(root: Node): Text[] {
  const out: Text[] = [];
  const walk = (node: Node): void => {
    for (let child = node.firstChild; child; child = child.nextSibling) {
      if (child instanceof Text) out.push(child);
      else walk(child);
    }
  };
  walk(root);
  return out;
}

/** node 在 root 裡的受保護內容裡面（嵌入筆記自己的螢光筆不是本題的填空，Codex 再查 R2）。 */
function guarded(node: Node, root: Node): boolean {
  for (let el = node.parentElement; el && el !== root; el = el.parentElement) if (el.matches(PROTECTED)) return true;
  return false;
}

const blockOf = (node: Node, container: HTMLElement): Element => node.parentElement?.closest(BLOCK) ?? container;

/**
 * Markdown.tsx 渲染完的全部處理（md-cases 也用它）：填空題的 <mark> 換成空格、打字卡第一處 ＿＿ 換成線、英文卡的冠詞、空格連著後面的標點、
 * 喇叭那一格。回傳放線的那一格（找不到 ＿＿ 或不是打字卡時是 null）與喇叭那一格。
 */
export function postProcess(container: HTMLElement, options: { mode: 'plain' | 'cloze' | 'typed' | 'pick'; lines: number; english: boolean; markers?: readonly string[]; tailMarkers?: readonly string[]; breakFirst?: boolean }): { slot: HTMLElement | null; slots: HTMLElement[]; tail: HTMLElement; slotMissing: boolean; tails: (TailParts | null)[] } {
  const blanks: HTMLElement[] = [];
  if (options.mode === 'cloze') {
    for (const mark of Array.from(container.querySelectorAll('mark'))) {
      if (guarded(mark, container)) continue;
      const blank = document.createElement('span');
      blank.className = 'ec-blank';
      const answer = document.createElement('span');
      answer.className = 'ec-blank-answer';
      answer.textContent = mark.textContent;
      blank.append(answer);
      mark.replaceWith(blank);
      blanks.push(blank);
    }
  }
  const typedSlot = options.mode === 'typed' ? insertLines(container, options.lines) : null;
  // 英文的句子排序（tasks/english-typed-order.md §6-1、L2 R1）：每一格照自己的記號放，不找 ＿＿；找不到的格放在句尾。
  // 會變的格後面的字（tasks/sentence-order-alternatives.md §5）先放好位置，格的記號旁邊就沒有私用區的字。
  const tails = options.mode === 'pick' && options.tailMarkers ? insertTails(container, options.tailMarkers) : [];
  const marked = options.mode === 'pick' && options.markers ? insertMarkedSlots(container, options.markers, !!options.breakFirst) : null;
  const pickSlot = options.mode === 'pick' && !marked ? insertPickSlot(container) : null;
  if (options.mode === 'pick') stripMarkAttributes(container);
  const slotMissing = marked ? marked.some(each => !each) : options.mode === 'pick' && !pickSlot;
  const slots = marked ? marked.map(each => each ?? endSlot(container)) : [];
  // 比較卡一定要有空格（§3）：找不到時放在句尾。
  const slot = marked ? slots.at(0) ?? null : typedSlot ?? pickSlot ?? (slotMissing ? endSlot(container) : null);
  if (marked) blanks.push(...slots);
  else if (slot) { blanks.push(slot); slots.push(slot); }
  if (options.english) glueText(container);
  blanks.forEach(gluePunctuation);
  return { slot, slots, tail: attachTail(container), slotMissing, tails };
}

/**
 * 句子排序第 i 格在 Markdown 裡的記號：私用區的一個字（U+E000 起），渲染器原樣留著；題目本來的 ＿＿、相鄰的兩格都不會搞混（L2 R1）。
 * 題目文字裡的私用區字先拿掉（stripSlotMarks），不會撞到。
 */
export const slotMark = (index: number): string => String.fromCharCode(0xe000 + index);
const PRIVATE_USE = new RegExp('[' + String.fromCharCode(0xe000) + '-' + String.fromCharCode(0xf8ff) + ']', 'g');
/** 題目文字裡的私用區字與會解成私用區字的字元參照（`&#57344;`、`&#xE000;`，L2 第二輪）都拿掉。 */
export const stripSlotMarks = (text: string): string => text.replace(PRIVATE_USE, '').replace(/&#(?:[xX]([0-9a-fA-F]+)|(\d+));/g, (reference, hex?: string, decimal?: string) => {
  const code = hex ? parseInt(hex, 16) : parseInt(decimal ?? '', 10);
  return code >= 0xe000 && code <= 0xf8ff ? '' : reference;
});

/**
 * 記號寫進了屬性（圖片的替代文字或標題，L2 第二輪 F5）就沒有位置可放，格照找不到放在句尾；屬性裡的記號拿掉，
 * 圖片載入不了或輔助工具讀出來時不會碰到。題目文字裡本來的私用區字已經拿掉了（stripSlotMarks），這裡只會是記號。
 */
function stripMarkAttributes(container: HTMLElement): void {
  for (const element of Array.from(container.querySelectorAll('*'))) {
    for (const { name, value } of Array.from(element.attributes)) {
      const clean = value.replace(PRIVATE_USE, '');
      if (clean !== value) element.setAttribute(name, clean);
    }
  }
}

/**
 * 句子排序第 k 個會變的格後面的字在 Markdown 裡的記號（tasks/sentence-order-alternatives.md §5）：私用區的另一段（U+E800 起），和格的記號分開。
 * 另一種排法讓某個位置的標點跟著作答改變時，句子的 Markdown 不變、不重畫（重畫時整句空一個畫面，L2 第一輪在 Windows 量到），只改這裡的字。
 */
export const tailMark = (index: number): string => String.fromCharCode(0xe800 + index);

/** 一個會變的格後面的字放的三段：前面的標點和前一格包在一起、後面的開括號和下一格包在一起（gluePunctuation），中間照常換行。 */
export interface TailParts { close: Element; mid: Element; open: Element }

/** 照記號的順序各放三段空的 span；找不到（在受保護的內容裡）或畫面上不只一個的是 null，記號從畫面上拿掉。 */
function insertTails(container: HTMLElement, markers: readonly string[]): (TailParts | null)[] {
  return markers.map(marker => {
    if ((container.textContent ?? '').split(marker).length === 2) {
      for (const node of textNodes(container)) {
        const text = node.textContent ?? '';
        const at = text.indexOf(marker);
        if (at < 0) continue;
        const after = node.splitText(at);
        after.textContent = text.slice(at + marker.length);
        const part = (name: string): Element => {
          const span = document.createElement('span');
          span.className = 'ec-tail-text ' + name;
          return span;
        };
        const parts = { close: part('is-close'), mid: part('is-mid'), open: part('is-open') };
        after.before(parts.close, parts.mid, parts.open);
        return parts;
      }
    }
    for (const node of allText(container)) if (node.textContent?.includes(marker)) node.textContent = node.textContent.replaceAll(marker, '');
    return null;
  });
}

/** 會變的格後面的字照 texts（記號的順序）換：只改那三段的字，開括號那一段在格的 .ec-glue 裡時跟著標 has-opening。 */
export function fillTails(tails: readonly (TailParts | null)[], texts: readonly string[]): void {
  tails.forEach((parts, i) => {
    if (!parts) return;
    const text = texts[i] ?? '';
    const close = closingRun(text);
    const open = openingRun(text.slice(close));
    parts.close.textContent = text.slice(0, close);
    parts.mid.textContent = text.slice(close, text.length - open);
    parts.open.textContent = text.slice(text.length - open);
    if (parts.open.parentElement?.matches('.ec-glue')) parts.open.parentElement.classList.toggle('has-opening', open > 0);
  });
}

/**
 * 照記號的順序各放一格；找不到（記號在程式碼、公式等受保護的內容裡）或畫面上不只一個（別的寫法也渲染出同一個字）的是 null，
 * 那個記號從畫面上拿掉，不猜哪一個才是格（L2 第二輪）。
 * 第一格前面的英文換行：breakFirst（第一格就是英文句子的開頭，L2 R5）或旁邊有英文時做一次。
 */
function insertMarkedSlots(container: HTMLElement, markers: readonly string[], breakFirst: boolean): (HTMLElement | null)[] {
  const found = markers.map(marker => {
    if ((container.textContent ?? '').split(marker).length !== 2) {
      for (const node of allText(container)) if (node.textContent?.includes(marker)) node.textContent = node.textContent.replaceAll(marker, '');
      return null;
    }
    for (const node of textNodes(container)) {
      const text = node.textContent ?? '';
      const at = text.indexOf(marker);
      if (at < 0) continue;
      const slot = emptySlot();
      const after = node.splitText(at);
      after.textContent = text.slice(at + marker.length);
      node.parentNode?.insertBefore(slot, after);
      return { slot, node, after };
    }
    return null;
  });
  const first = found.at(0);
  if (first) {
    const inBlock = textNodes(blockOf(first.node, container));
    const at = inBlock.indexOf(first.after);
    if (breakFirst || englishBeside(joined(inBlock.slice(0, at)), joined(inBlock.slice(at)))) breakBeforeEnglish(container, first.node);
  }
  return found.map(each => each?.slot ?? null);
}

/** 在 element 前面放一個空的 .ec-glue（裡面不換行），由呼叫的地方把內容照順序放進去。 */
function gluedAround(element: Element): HTMLElement {
  const glue = document.createElement('span');
  glue.className = 'ec-glue';
  element.before(glue);
  return glue;
}

/**
 * 空格和緊接在前後的標點包在一起（.ec-glue，不換行）：「有 攪拌 ，」的逗號不會被換到下一行開頭，「「」不會留在行尾（backlog 技術債）。
 * 中間沒有可以斷行的地方，不靠各瀏覽器怎麼判斷空格和標點的交界能不能斷行（Chromium 會斷，md-cases 量得到）。
 * 只看同一層緊接的文字（==…== 與 ＿＿ 前後直接寫的標點）；中間有空白的不包。最後是標點時，喇叭那一格也在裡面（attachTail）。
 * 打字卡後面的標點已經在線那一格裡（closeLastLine），這裡只會包到前面的開括號。
 */
function gluePunctuation(blank: HTMLElement): void {
  const before = blank.previousSibling instanceof Text ? blank.previousSibling : null;
  const after = blank.nextSibling instanceof Text ? blank.nextSibling : null;
  // 會變的格後面的字（insertTails）：前一段的開括號、後一段的標點整段包進來，字由 fillTails 放。
  const openTail = tailPart(blank, 'is-open');
  const closeTail = tailPart(blank, 'is-close');
  const opening = before ? openingRun(before.textContent ?? '') : 0;
  const closing = after ? closingRun(after.textContent ?? '') : 0;
  if (!opening && !closing && !openTail && !closeTail) return;
  const glue = gluedAround(blank);
  if (openTail) glue.append(openTail);
  else if (before && opening) {
    glue.classList.add('has-opening');
    glue.append(before.splitText(before.length - opening));
  }
  glue.append(blank);
  if (closeTail) glue.append(closeTail);
  else if (after && closing) {
    after.splitText(closing);
    glue.append(after);
  }
}

/** 格前面（is-open）或後面（is-close）緊接的那一段會變的字；中間空的文字節點（插格時切出來的）跳過。 */
function tailPart(blank: HTMLElement, name: 'is-open' | 'is-close'): Element | null {
  let node = name === 'is-open' ? blank.previousSibling : blank.nextSibling;
  while (node instanceof Text && !node.length) node = name === 'is-open' ? node.previousSibling : node.nextSibling;
  return node instanceof Element && node.matches('.ec-tail-text.' + name) ? node : null;
}

const emptySlot = (): HTMLElement => {
  const slot = document.createElement('span');
  slot.className = 'ec-slot';
  return slot;
};

/**
 * 比較卡（tasks/question-type-seam.md §7）：第一處 ＿＿ 換成一格空的 .ec-slot，按鈕由 Markdown 的 slotNode 放進去。不用打字卡的線：
 * 線那一格（closeLastLine）把後面的標點包進去，和按鈕疊在同一格會蓋住；標點交給 gluePunctuation。
 */
function insertPickSlot(container: HTMLElement): HTMLElement | null {
  for (const node of textNodes(container)) {
    const text = node.textContent ?? '';
    const match = BLANK.exec(text);
    if (!match) continue;
    const slot = emptySlot();
    const after = node.splitText(match.index);
    after.textContent = text.slice(match.index + match[0].length);
    node.parentNode?.insertBefore(slot, after);
    const inBlock = textNodes(blockOf(node, container));
    const at = inBlock.indexOf(after);
    if (englishBeside(joined(inBlock.slice(0, at)), joined(inBlock.slice(at)))) breakBeforeEnglish(container, node);
    return slot;
  }
  return null;
}

function joined(nodes: Text[]): string {
  return nodes.map(node => node.textContent ?? '').join('');
}

/** 找不到空格時放在句尾：最後一個內容所在區塊的最後面。 */
function endSlot(container: HTMLElement): HTMLElement {
  const slot = emptySlot();
  const last = lastContent(container);
  (last ? blockOf(last, container) : container).append(slot);
  return slot;
}

/** 把第一處 ＿＿ 所在的文字節點拆開，中間放幾條線；回傳放線的那一格，找不到 ＿＿ 時是 null。 */
function insertLines(container: HTMLElement, lines: number): HTMLElement | null {
  for (const node of textNodes(container)) {
    const text = node.textContent ?? '';
    const match = BLANK.exec(text);
    if (!match) continue;
    const blanks = document.createElement('span');
    blanks.className = 'ec-lines';
    for (let i = 0; i < Math.max(1, lines); i++) {
      const line = document.createElement('span');
      line.className = 'ec-line';
      const word = document.createElement('span');
      word.className = 'ec-line-word';
      line.append(word);
      blanks.append(line);
    }
    const slot = document.createElement('span');
    slot.className = 'ec-slot';
    slot.append(blanks);
    const after = node.splitText(match.index);
    after.textContent = text.slice(match.index + match[0].length);
    node.parentNode?.insertBefore(slot, after);
    closeLastLine(blanks, after);
    breakBeforeEnglish(container, node);
    return slot;
  }
  return null;
}

/**
 * 打字卡的空格後面緊接的標點，和最後一條線包成一格（.ec-line-end，不換行）：線排成幾列，標點都緊跟著最後一條線。
 * 不放在線的外面：線排滿一列換行時，外面的標點會留在第一列後面（made up his . 下一列才是 mind）。
 * 打字途中線藏起來，標點也一起藏（Markdown.css 的 .ec-slot）；喇叭在空格外面，照常看得到。
 */
function closeLastLine(blanks: HTMLElement, after: Text): void {
  const run = closingRun(after.textContent ?? '');
  const last = blanks.lastElementChild;
  if (!run || !last) return;
  after.splitText(run);
  const end = document.createElement('span');
  end.className = 'ec-line-end';
  last.before(end);
  end.append(last, after);
}

/**
 * 中文句子後面接英文句子時，英文換到下一行（D-145 第 5 點）：在同一個區塊裡、空格前面的文字中，最後一個中文字或全形標點後面斷行。
 * 跨過粗體、連結也找得到（「我昨天去了公園。**I** ＿＿ …」，Codex 審查 F4）。英文在前、中文提示在後的（Can I ＿＿ your pen?（借））不斷行。
 */
function breakBeforeEnglish(container: HTMLElement, beforeBlank: Text): void {
  const block = blockOf(beforeBlank, container);
  const before = textNodes(block);
  const upto = before.indexOf(beforeBlank);
  for (let i = upto; i >= 0; i--) {
    const node = before[i];
    const at = englishBreak(node.textContent ?? '');
    if (at === null) continue;
    const english = node.splitText(at);
    english.textContent = (english.textContent ?? '').trimStart();
    const br = document.createElement('br');
    br.className = 'ec-break';
    node.parentNode?.insertBefore(br, english);
    return;
  }
}

/**
 * 冠詞和後面的字用不斷行空白連起來（glueArticles）；冠詞在一個節點的最後、下一個字在粗體或連結裡（a **book**）也連（Codex 審查 F4）。
 */
function glueText(container: HTMLElement): void {
  const nodes = textNodes(container);
  nodes.forEach((node, index) => {
    let text = glueArticles(node.textContent ?? '');
    const next = nodes[index + 1] as Text | undefined;
    if (next && /\b(?:a|an|the) +$/iu.test(text) && /^\S/u.test(next.textContent ?? '') && blockOf(next, container) === blockOf(node, container)) {
      text = text.replace(/ +$/u, ' ');
    }
    if (text !== node.textContent) node.textContent = text;
  });
}

/** 最後一個內容：一般文字的文字節點，或一整個受保護的內容（圖、公式、嵌入、空格…）。 */
function lastContent(node: Node): Text | Element | null {
  for (let child = node.lastChild; child; child = child.previousSibling) {
    if (child instanceof Text) {
      if (child.textContent?.trim()) return child;
      continue;
    }
    if (!(child instanceof Element)) continue;
    if (child.matches(PROTECTED)) return child;
    const inner = lastContent(child);
    if (inner) return inner;
  }
  return null;
}

/**
 * 準備接在最後一個字後面的那一格（.ec-tail），喇叭放進去（D-145 第 6 點：和最後一個字一起換行，不會單獨掉到下一行）。
 * - 最後是一般文字：最後一個字（中文兩個字）和喇叭包在一起（white-space: nowrap）。
 * - 最後的字在連結裡（連結裡的程式碼、圖片也算，Codex 再查 R3）：喇叭在連結外面（按喇叭不會開連結，Codex 審查 F5），
 *   整個連結放進那一格；連結裡最後一個字以外的文字包進 .ec-tail-wrap 照常換行，長連結也不超出，最後一個字和喇叭不分開
 *   （Codex 再查 R4）。連結本身跟著那一格不換行：最後一個字、</a> 與喇叭之間沒有可以斷行的地方，不靠各瀏覽器怎麼判斷
 *   元素交界能不能斷行（WebKit 可能和 Chromium 不同）。
 * - 最後是圖、公式、嵌入：原樣不動，喇叭接在它後面（Codex 審查 F3）。
 * - 最後是空格：同樣不動裡面，空格和喇叭包進 .ec-glue，喇叭不會單獨掉到下一行。打字卡的喇叭不放進線那一格（.ec-line-end）：
 *   第 3 步照著打時就有喇叭，那時輸入框蓋在線上，線也藏起來了。
 */
function attachTail(container: HTMLElement): HTMLElement {
  const tail = document.createElement('span');
  tail.className = 'ec-tail';
  const last = lastContent(container);
  if (last === null) { container.append(tail); return tail; }
  const link = (last instanceof Text ? last.parentElement : last)?.closest('a');
  if (link && container.contains(link)) {
    const word = last instanceof Text ? last.splitText(tailStart(last.textContent ?? '')) : last;
    for (const node of textNodes(link)) {
      if (node === word || !node.textContent) continue;
      const wrap = document.createElement('span');
      wrap.className = 'ec-tail-wrap';
      node.replaceWith(wrap);
      wrap.append(node);
    }
    link.before(tail);
    tail.append(link);
    return tail;
  }
  if (last instanceof Element) {
    if (last.matches('.ec-slot, .ec-blank') && !last.parentElement?.matches('.ec-glue')) {
      const glue = gluedAround(last);
      glue.append(last);
    }
    last.after(tail);
    return tail;
  }
  const rest = last.splitText(tailStart(last.textContent ?? ''));
  rest.replaceWith(tail);
  tail.append(rest);
  return tail;
}
