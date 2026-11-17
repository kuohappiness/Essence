import { frontmatterLines, linesOf, listTree, outsideSource, parseDeck, readProperties, splitSourceItems, TRAILING_ID } from '../deck/index.ts';
import { blocksOf, calloutHead } from './check.ts';

// 引言框的「加入」（tasks/ai-cards-add.md §1）：哪些引言框、框裡最上層的每一項、按下去時在最新的文字裡重新找。只讀文字。

/** 引言框的種類：候選卡片、加進已有的學習目標、加深的學習目標（tasks/ai-cards-deepen.md §3-1）。 */
export type BoxKind = 'candidate' | 'existing' | 'deepen';
/**
 * 對象表（§1）：標題 → 怎麼加入、是不是加深寫的。標題的認法和檢查相同（check.ts 的 calloutHead）。
 * 加深那一批的三種框名只有加深會寫（tasks/ai-cards-deepen.md §3-1）：待審核、補題只寫進這一篇都照框名認。
 */
const BOX_TITLES: Readonly<Record<string, { kind: BoxKind; deepen: boolean }>> = {
  候選卡片: { kind: 'candidate', deepen: false },
  加進已有的學習目標: { kind: 'existing', deepen: false },
  加深的學習目標: { kind: 'deepen', deepen: true },
  '加進已有的學習目標（加深）': { kind: 'existing', deepen: true },
  '候選卡片（加深）': { kind: 'candidate', deepen: true },
};

/** 框裡最上層的一項。line、end 是檔案的行（從 0 算，end 不含）；original 是那幾行去掉引言框前綴之後的字，用 \n 接。 */
export interface BoxItem {
  kind: BoxKind;
  line: number;
  end: number;
  original: string;
  /** 候選：名稱行行尾的 ID；加進已有：第一行連結的 `#^ID`，或原文開頭的 ID。沒有是 null。 */
  id: string | null;
}
export interface IntroBox {
  kind: BoxKind;
  /** 加深寫的框（框名帶「加深」）。 */
  deepen: boolean;
  title: string;
  folded: boolean;
  /** 標題行（從 0 算）。 */
  line: number;
  /** 框的最後一行之後（不含）：到下一個標題行或引言框結束。 */
  end: number;
  /** 這個框和下一個框之間沒有外部空行，閱讀模式畫成同一個框：只拿項目、不拿框（§2〈框空了〉）。 */
  merged: boolean;
  items: BoxItem[];
}

/** 引言框的前綴：行首最多 3 個空白、`>`、後面一個空白（§2〈怎麼改〉）。 */
const BOX_PREFIX = /^\s{0,3}> ?/;
/** 加進已有的那一項第一行的 ID：存草稿時轉成的連結 `[[卡組#^ID|名稱]]`，或 AI 原稿的 `ID 名稱`。 */
function existingId(first: string): string | null {
  const link = /^\s*(?:[-*+]|\d+[.)])\s+\[\[[^\]#|]*#\^([A-Za-z0-9-]+)[|\]]/.exec(first);
  if (link) return link[1];
  return /^\s*(?:[-*+]|\d+[.)])\s+([A-Za-z0-9-]+)(?:\s|$)/.exec(first)?.[1] ?? null;
}

/** 這一篇（卡組筆記；轉錄稿沒有）的候選卡片與加進已有的學習目標引言框。 */
export function introBoxes(text: string): IntroBox[] {
  const lines = linesOf(text);
  const bounds = frontmatterLines(lines);
  if (readProperties(lines).props.isTranscript) return [];
  const start = bounds && bounds !== 'unclosed' ? bounds.close + 1 : 0;
  const boxes: IntroBox[] = [];
  for (const block of blocksOf(lines.slice(start).map((line, i) => ({ no: start + i, raw: line.raw })))) {
    if (block.kind !== 'callout') continue;
    const head = calloutHead(block.body[0].raw);
    const known = head ? BOX_TITLES[head.title] : undefined;
    if (!head || !known) continue;
    const { kind, deepen } = known;
    // 同一塊裡的下一個標題行：沒有外部空行的兩個框（blocksOf 讀成同一塊），這一框到它之前為止。
    const next = block.body.findIndex((line, i) => i > 0 && calloutHead(line.raw) !== null);
    const body = next < 0 ? block.body : block.body.slice(0, next);
    const inner = body.slice(1).map(line => line.raw.replace(BOX_PREFIX, ''));
    const first = block.line + 1;
    const items = listTree(inner.map(raw => ({ raw, eol: '\n' })), 0).map((root): BoxItem => {
      const original = inner.slice(root.line, root.end).join('\n');
      const head = original.split('\n')[0];
      return { kind, line: first + root.line, end: first + root.end, original, id: kind === 'existing' ? existingId(head) : TRAILING_ID.exec(head)?.[1] ?? null };
    });
    boxes.push({ kind, deepen, title: head.title, folded: head.folded, line: block.line, end: block.line + body.length, merged: next >= 0, items });
  }
  return boxes;
}

/** 畫按鈕時記下的那一項：種類、身分與原文。 */
export interface ItemRef { kind: BoxKind; id: string | null; original: string }
export type Found = { kind: 'found'; item: BoxItem; box: IntroBox } | { kind: 'changed' } | { kind: 'duplicate' };

/**
 * 按下去時，在這一篇最新的文字裡找那一項（§1）：種類、身分與原文都相同、只有一處才算找到。這一篇有兩個以上原文相同的項目
 * （不論在不在同一個框）時是 duplicate，那幾項都不自動做；找不到或原文變了是 changed。不用第幾項縮小範圍：家長刪掉前一項之後會指到另一項（第四輪）。
 */
export function findItem(text: string, ref: ItemRef): Found {
  const all = introBoxes(text).flatMap(box => box.items.map(item => ({ item, box })));
  const same = all.filter(each => each.item.original === ref.original);
  if (same.length > 1) return { kind: 'duplicate' };
  const hit = same.find(each => each.item.kind === ref.kind && each.item.id === ref.id);
  return hit ? { kind: 'found', ...hit } : { kind: 'changed' };
}

/**
 * 疑似重複的候選（§2、第二輪 R4）：名稱底下第一個直接一層的理由行（`理由：` 或 `理由:`），冒號後去掉空白以 `可能重複` 開頭。
 * 後面的 ID 是原稿的 `abc234`、存草稿核對後的連結、核對不到的原文都算；ID、`｜` 或理由不全的也算。檢查、存草稿、加入共用這一份。
 * original 是那一項去掉引言框前綴之後的字。
 */
export function suspectOf(original: string): boolean {
  const [root] = listTree(linesOf(original), 0);
  const reason = root?.children.find(child => /^理由\s*[：:]/.test(child.text));
  return !!reason && /^理由\s*[：:]\s*可能重複/.test(reason.text);
}

/** 加進已有的那一項是存草稿時核對過、轉成連結的（§3-1）；原文 `ID 名稱` 的不進「全部加入」。 */
const linked = (item: BoxItem): boolean => /^\s*(?:[-*+]|\d+[.)])\s+\[\[[^\]]*#\^[A-Za-z0-9-]+[|\]]/.test(item.original);
/**
 * 「全部加入」會做的那幾項（§2、§3-4）：候選框是一般候選（疑似重複只能逐項），加進已有的框是轉成連結的。rest 是其餘只能逐項的項數。
 * 畫按鈕、確認框、寫入前的核對共用這一份。
 */
export function boxBatch(box: IntroBox): { items: BoxItem[]; rest: number } {
  const items = box.items.filter(item => box.kind === 'existing' ? linked(item) : !suspectOf(item.original));
  return { items, rest: box.items.length - items.length };
}
/** 那幾項（畫按鈕時的身分與原文）現在在哪個框：第一個在最新文字裡找得到的；都找不到是 null。 */
export function boxOf(text: string, refs: readonly ItemRef[]): IntroBox | null {
  for (const ref of refs) {
    const found = findItem(text, ref);
    if (found.kind === 'found') return found.box;
  }
  return null;
}
/** 畫按鈕時記下的身分與原文。 */
export const refOf = (item: BoxItem): ItemRef => ({ kind: item.kind, id: item.id, original: item.original });

/**
 * 待審核（tasks/ai-cards-deepen.md §4-3）：這一篇有任何一個加深的框（三種框名，哪一批都算）裡還有項目。只看卡組本身，不看快照；
 * 空框、框裡只剩家長自己的字（沒有行尾 ID 的清單、沒有題目的補題）、第 1 批與最小版留下的框不算。
 */
export const deepenPending = (text: string): boolean => introBoxes(text).some(box => box.deepen && box.items.some(item => box.kind === 'existing'
  // 補題：底下還有卡組讀得到的題目。新目標、候選：名稱行有行尾 ID。框裡只剩家長自己的字（沒有 ID 的清單、說明）不算（tasks/ai-cards-deepen.md §4-3）。
  ? hasPrompt(item.original)
  : item.id !== null));
/**
 * 補題那一項底下有沒有題目（L2 R6）：名稱行換成一個假的目標，交給卡組的解析器讀，和出題、加入用同一套題目的邊界
 * （圍欄、行內程式碼、說明裡的 `::` 都照卡組的讀法）。寫法有問題、讀不出題目的不算。
 */
function hasPrompt(original: string): boolean {
  const [, ...rest] = original.split('\n');
  // 和加入（existing.ts 的 unitsOf）一樣只看直接的子項目：名稱的接續行、更深的說明不算。兩份文字的行號相同。
  const kids = new Set(listTree(linesOf(original), 0)[0]?.children.map(child => child.line) ?? []);
  return parseDeck(['- 補題 ^zzz000', ...rest].join('\n')).targets.some(target => target.prompts.some(prompt => kids.has(prompt.line)));
}

/** 框裡那一項的出處有 `課外：`（tasks/ai-cards-deepen.md §3-3：加深的補題出處合併還沒涵蓋課外，那一項留給家長）。original 是那一項去掉引言框前綴之後的字。 */
export function hasOutsideItem(original: string): boolean {
  const [root] = listTree(linesOf(original), 0);
  const field = root?.children.find(child => /^出處\s*[：:]/.test(child.text));
  if (!field) return false;
  const values = [field.text.replace(/^出處\s*[：:]/, ''), ...field.children.map(child => child.text)];
  return values.some(value => splitSourceItems(value).some(item => outsideSource(item) !== null));
}
