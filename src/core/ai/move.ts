import { expandTabs, linesOf, listTree, markNeed, nameIds, parseDeck } from '../deck/index.ts';
import type { Deck, Line } from '../deck/index.ts';
import { canRead, PICK_NEEDS } from '../version/index.ts';
import { findItem, introBoxes } from './intro.ts';
import type { BoxItem, IntroBox, ItemRef } from './intro.ts';

// 候選卡片的加入（tasks/ai-cards-add.md §2）：同一篇，把框裡的項目搬到本文最後一個學習目標的後面，拿掉引言框的前綴與「理由」。只算文字，不寫檔。

/** 沒搬的那一項與原因（給家長看的一句話）。 */
export interface Left { ref: ItemRef; why: string }
export interface MovePlan {
  /** 搬完的全文；一項都沒搬是 null。 */
  text: string | null;
  moved: ItemRef[];
  left: Left[];
}
interface MoveContext {
  /** vault 裡其他卡組的學習目標用了這個 ID（這一篇自己不算）。 */
  elsewhere: (id: string) => boolean;
}

export const WHY = {
  changed: '這一項剛改過，請再按一次',
  duplicate: '框裡有一樣的項目，請先刪掉多的',
  reason: '理由底下有內容，請手動搬',
  noId: '名稱那一行的行尾沒有學習目標 ID，請手動搬',
  takenId: (id: string): string => `學習目標 ID「${id}」和別的學習目標重複，請先改掉其中一個`,
  need: '有比較卡，卡組的屬性區加不上「需要版本」，請手動搬',
  verify: '搬出來會改到別的內容，請手動搬',
} as const;

const REASON = /^理由\s*[：:]/;
/** 一行的縮排寬度（Tab 展開）與縮排之後的字。 */
export function indentOf(raw: string): { width: number; rest: string } {
  const lead = /^[ \t]*/.exec(raw)![0];
  return { width: expandTabs(lead).length, rest: raw.slice(lead.length) };
}
/** 這一篇的縮排字元：本文第一個有縮排的清單行用 Tab 就是 Tab，否則空白。 */
function usesTabs(lines: readonly Line[], boxes: readonly IntroBox[]): boolean {
  const inBox = (i: number): boolean => boxes.some(box => i >= box.line && i < box.end);
  for (const [i, line] of lines.entries()) {
    if (inBox(i) || !/^[ \t]+(?:[-*+]|\d+[.)])(?:\s|$)/.test(line.raw)) continue;
    return line.raw.startsWith('\t');
  }
  return false;
}
export const encode = (width: number, tabs: boolean): string => tabs ? '\t'.repeat(Math.floor(width / 4)) + ' '.repeat(width % 4) : ' '.repeat(width);

/** 框裡一項搬出來的幾行（不含換行字元）：拿掉理由、照最後一個目標的根項對齊。不能自動搬回傳原因。 */
function unboxed(item: BoxItem, rootIndent: number, tabs: boolean): { lines: string[] } | { why: string } {
  const inner = item.original.split('\n');
  const [root] = listTree(inner.map(raw => ({ raw, eol: '\n' })), 0);
  if (!root) return { why: WHY.changed };
  const drop = new Set<number>();
  for (const child of root.children) {
    if (!REASON.test(child.text)) continue;
    // 理由底下有子項目或接續行：拿掉會讓它們變成前一題的詳解（F4）。
    if (child.children.length || child.starts.length > 1) return { why: WHY.reason };
    for (let i = child.line; i < child.end; i++) drop.add(i);
  }
  const ids = nameIds(inner[0]);
  if (!ids.trailing || ids.middle.length) return { why: WHY.noId };
  const shift = rootIndent - root.indent;
  const lines = inner.flatMap((raw, i) => {
    if (drop.has(i)) return [];
    if (!raw.trim()) return [''];
    const { width, rest } = indentOf(raw);
    const lead = raw.slice(0, raw.length - rest.length);
    // 不用換算的行照原文（硬換行、表格、程式碼逐字相同）。
    if (shift === 0 && (tabs ? !/ {4}/.test(lead) : !lead.includes('\t'))) return [raw];
    return [encode(Math.max(0, width + shift), tabs) + rest];
  });
  return { lines };
}

/** 比完整內容用：拿掉行號（搬動後會變的）。 */
const content = (value: unknown, drop: readonly string[] = []): string => JSON.stringify(value, (key, each: unknown) => key === 'line' || key === 'targetLine' || drop.includes(key) ? undefined : each);
const needsMark = (deck: Deck): boolean => deck.targets.some(t => t.group) || deck.problems.some(p => p.code === 'pick-answer-invalid');

/**
 * 候選卡片的加入（§2）：refs 照順序搬，接在一起，一次算好。每一項在最新的文字裡重新找（findItem）；搬之前核對 ID，搬完核對其他目標的
 * 完整內容不變、新目標和在框裡時相同。不能搬的留在框裡、寫原因。
 */
export function moveCandidates(text: string, refs: readonly ItemRef[], context: MoveContext): MovePlan {
  const left: Left[] = [];
  const lines = linesOf(text);
  const boxes = introBoxes(text);
  const before = parseDeck(text, { layout: true });
  const last = before.targets.at(-1);
  const rootIndent = last ? indentOf(lines[last.line].raw).width : 0;
  const tabs = usesTabs(lines, boxes);
  const bodyIds = new Set(before.targets.flatMap(t => t.id ?? []));
  const plans: { ref: ItemRef; item: BoxItem; box: IntroBox; lines: string[]; id: string }[] = [];
  for (const ref of refs) {
    const found = findItem(text, ref);
    if (found.kind !== 'found' || found.item.kind !== 'candidate') { left.push({ ref, why: found.kind === 'duplicate' ? WHY.duplicate : WHY.changed }); continue; }
    const out = unboxed(found.item, rootIndent, tabs);
    if ('why' in out) { left.push({ ref, why: out.why }); continue; }
    const id = nameIds(found.item.original.split('\n')[0]).trailing!.id;
    // 和本文的目標、這一篇框裡的其他項目、vault 裡其他卡組的目標都不重複（F6）。
    const others = boxes.flatMap(box => box.items).filter(each => each.line !== found.item.line && each.id === id);
    if (bodyIds.has(id) || others.length || context.elsewhere(id)) { left.push({ ref, why: WHY.takenId(id) }); continue; }
    plans.push({ ref, item: found.item, box: found.box, lines: out.lines, id });
  }
  const attempt = (chosen: typeof plans): string | null => {
    if (!chosen.length) return null;
    const next = compose(lines, boxes, chosen, last ? before.layout.get(last.line)!.end : chosen[0].box.line);
    const after = parseDeck(next);
    // 寫之前核對（F4、第三輪 R5）：原本的每個目標完整內容不變，新的目標恰好這幾個、和在框裡時相同。
    const fresh = new Set(chosen.map(each => each.id));
    const kept = after.targets.filter(t => !t.id || !fresh.has(t.id));
    if (content(kept) !== content(before.targets)) return null;
    for (const each of chosen) {
      const target = after.targets.filter(t => t.id === each.id);
      const alone = parseDeck(each.lines.join('\n'), { subject: before.props.subject }).targets;
      if (target.length !== 1 || alone.length !== 1 || content(target, ['section', 'sectionIndex']) !== content(alone, ['section', 'sectionIndex'])) return null;
    }
    if (after.problems.some(p => p.code === 'duplicate-id')) return null;
    // 比較卡搬進本文，同一次補 `需要版本`（D-191）：現在的值和比較卡最低版本取較高者。
    if (needsMark(after) && !(typeof after.props.need === 'string' && canRead(PICK_NEEDS, after.props.need))) return markNeed(next, PICK_NEEDS);
    return next;
  };
  let next = attempt(plans);
  if (next === null && plans.length) {
    const marks = (each: (typeof plans)[number]): boolean => parseDeck(each.lines.join('\n'), { subject: before.props.subject }).targets.some(t => t.group);
    const withoutPick = plans.filter(each => !marks(each));
    const retry = withoutPick.length < plans.length ? attempt(withoutPick) : null;
    if (retry !== null) {
      for (const each of plans) if (marks(each)) left.push({ ref: each.ref, why: WHY.need });
      return { text: retry, moved: withoutPick.map(each => each.ref), left: sortLeft(left, refs) };
    }
    for (const each of plans) left.push({ ref: each.ref, why: WHY.verify });
    next = null;
  }
  return { text: next, moved: next === null ? [] : plans.map(each => each.ref), left: sortLeft(left, refs) };
}
const sortLeft = (left: Left[], refs: readonly ItemRef[]): Left[] => left.sort((a, b) => refs.indexOf(a.ref) - refs.indexOf(b.ref));

/**
 * 從框裡拿掉這幾項（§4 第 4 步：跨篇加入確認之後）：和搬移同一套拿法，框空了整個拿掉。
 */
export function takeOut(text: string, items: readonly { item: BoxItem; box: IntroBox }[]): string {
  return items.length ? compose(linesOf(text), introBoxes(text), items.map(each => ({ ...each, lines: [] })), null) : text;
}

/**
 * 組出搬完的全文：拿掉框裡搬走的那幾項（框空了整個拿掉），在 at（最後一個目標完整根項的結束處，沒有目標時在第一個搬出項目的框前面）插入，
 * 前後各留一個外部空行；at 是 null 時只拿不插。換行字元照這一篇，檔尾有沒有換行照舊。
 */
function compose(lines: readonly Line[], boxes: readonly IntroBox[], chosen: readonly { item: BoxItem; box: IntroBox; lines: string[] }[], at: number | null): string {
  const eol = lines.find(line => line.eol)?.eol ?? '\n';
  const finalEol = (lines.at(-1)?.eol ?? '') !== '';
  const remove = new Set<number>();
  for (const { item } of chosen) for (let i = item.line; i < item.end; i++) remove.add(i);
  for (const box of boxes) {
    if (box.merged || !chosen.some(each => each.box.line === box.line)) continue;
    // 框裡只剩標題行與空的 `>` 行：整個框拿掉（第二輪 R5：還有家長的字就留著）。
    const rest = [];
    for (let i = box.line + 1; i < box.end; i++) if (!remove.has(i)) rest.push(lines[i].raw);
    if (rest.every(raw => /^\s{0,3}>\s*$/.test(raw))) for (let i = box.line; i < box.end; i++) remove.add(i);
  }
  const block = chosen.flatMap(each => each.lines);
  // 照原本的行走一次：拿掉的那幾段記成一個缺口（gap），插入處記成 null。
  type Slot = { raw: string } | { gap: true } | null;
  const slots: Slot[] = [];
  for (let i = 0; i <= lines.length; i++) {
    if (i === at) slots.push(null);
    if (i === lines.length) break;
    if (!remove.has(i)) slots.push({ raw: lines[i].raw });
    else if (!(slots.at(-1) && 'gap' in slots.at(-1)!)) slots.push({ gap: true });
  }
  const blank = (slot: Slot | undefined): boolean => !!slot && 'raw' in slot && slot.raw.trim() === '';
  // 缺口兩邊都是空行時只留一個；缺口在檔頭或檔尾時，旁邊的空行也拿掉（只動拿掉的框旁邊，別處的空行照舊）。
  for (let i = 0; i < slots.length; i++) {
    const slot = slots[i];
    if (!slot || !('gap' in slot)) continue;
    const rawBefore = slots.slice(0, i).filter(each => each && 'raw' in each);
    const rawAfter = slots.slice(i + 1).filter(each => each && 'raw' in each);
    if (blank(slots[i + 1]) && (blank(slots[i - 1]) || !rawBefore.length)) slots.splice(i + 1, 1);
    else if (blank(slots[i - 1]) && !rawAfter.length) { slots.splice(i - 1, 1); i--; }
  }
  const kept = slots.filter((slot): slot is { raw: string } | null => !(slot && 'gap' in slot));
  const result: string[] = [];
  for (const [i, slot] of kept.entries()) {
    if (slot !== null) { result.push(slot.raw); continue; }
    // 插入處前後要有外部空行（F4）。
    if (i > 0 && !blank(kept[i - 1])) result.push('');
    result.push(...block);
    if (i < kept.length - 1 && !blank(kept[i + 1])) result.push('');
  }
  return result.join(eol) + (finalEol ? eol : '');
}
