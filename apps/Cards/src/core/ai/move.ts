import { expandTabs, frontmatterLines, headingKey, linesOf, listTree, markNeed, nameIds, parseDeck } from '../deck/index.ts';
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
      // 用插入處的小標題讀這一項（L2 R6）：接句卡的詩名就是它所在的小標題，脫離標題讀會和搬完的不同。
      const section = target[0]?.section ?? null;
      const alone = parseDeck((section === null ? '' : `# ${section}\n`) + each.lines.join('\n'), { subject: before.props.subject }).targets;
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
    // 加深的框裡的小標題是 AI 分組用的（tasks/ai-cards-deepen.md §3-1）：項目都搬走了，只剩小標題也算空。
    const empty = (raw: string): boolean => /^\s{0,3}>\s*$/.test(raw) || (box.kind === 'deepen' && HEADING.test(raw.replace(/^\s{0,3}> ?/, '')));
    if (rest.every(empty)) for (let i = box.line; i < box.end; i++) remove.add(i);
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

// ── 「加深的學習目標」的加入（tasks/ai-cards-deepen.md §3-3）：移到同名小標題直屬的範圍。 ──

const DEEPEN_WHY = {
  twoHeadings: (title: string): string => `卡組裡有兩個以上同名的小標題「${title}」，請手動搬`,
} as const;

interface Heading { line: number; level: number; key: string; text: string }
const HEADING = /^ {0,3}(#{1,6})(?:[ \t]+(.*?))?(?:[ \t]+#+)?[ \t]*$/;
const OPEN_FENCE = /^ {0,3}(`{3,}|~{3,})(.*)$/;

/** 本文（引言框與程式碼圍欄以外、屬性區之後）的標題。 */
function bodyHeadings(lines: readonly Line[], boxes: readonly IntroBox[], start: number): Heading[] {
  const found: Heading[] = [];
  let fence: { char: string; count: number } | null = null;
  for (let i = start; i < lines.length; i++) {
    const raw = lines[i].raw;
    if (fence) { if (new RegExp('^ {0,3}' + fence.char + '{' + String(fence.count) + ',}[ \\t]*$').test(raw)) fence = null; continue; }
    const open = OPEN_FENCE.exec(raw);
    if (open && !(open[1][0] === '`' && open[2].includes('`'))) { fence = { char: open[1][0], count: open[1].length }; continue; }
    if (/^\s{0,3}>/.test(raw) || boxes.some(box => i >= box.line && i < box.end)) continue;
    const m = HEADING.exec(raw);
    if (m) found.push({ line: i, level: m[1].length, key: headingKey(m[2] ?? ''), text: (m[2] ?? '').trim() });
  }
  return found;
}

/** 框裡那一項上面最近的小標題（同一個框裡、拿掉引言框前綴之後的標題行）；沒有是 null。 */
function boxHeading(lines: readonly Line[], box: IntroBox, item: BoxItem): { level: number; key: string; raw: string } | null {
  for (let i = item.line - 1; i > box.line; i--) {
    const inner = lines[i].raw.replace(/^\s{0,3}> ?/, '');
    const m = HEADING.exec(inner);
    if (m) return { level: m[1].length, key: headingKey(m[2] ?? ''), raw: inner.trimEnd() };
  }
  return null;
}

/**
 * 加深的學習目標一項一項搬（§3-3）：照框裡那一項上面的小標題找本文同級同名的標題。剛好一個：放在它直屬的範圍（到第一個子標題或下一個
 * 同級以上的標題，取先到的）最後一個目標整項的後面，直屬範圍沒有目標時放在標題的下一行；一個都沒有：在本文最後一個目標後面新增這個小標題
 * （本文沒有目標時放在第一個加深框之前）；不只一個：那一項留著。框裡沒有小標題的照候選的放法。搬完核對其他目標不變、新目標歸在預期的標題底下。
 */
export function moveDeepen(text: string, refs: readonly ItemRef[], context: MoveContext): MovePlan {
  let current = text;
  const moved: ItemRef[] = [], left: Left[] = [];
  for (const ref of refs) {
    const step = moveOneDeepen(current, ref, context);
    if ('why' in step) { left.push({ ref, why: step.why }); continue; }
    current = step.text;
    moved.push(ref);
  }
  return { text: moved.length ? current : null, moved, left };
}

function moveOneDeepen(text: string, ref: ItemRef, context: MoveContext): { text: string } | { why: string } {
  const lines = linesOf(text);
  const boxes = introBoxes(text);
  const found = findItem(text, ref);
  if (found.kind !== 'found' || found.item.kind !== 'deepen') return { why: found.kind === 'duplicate' ? WHY.duplicate : WHY.changed };
  const before = parseDeck(text, { layout: true });
  const last = before.targets.at(-1);
  const tabs = usesTabs(lines, boxes);
  const id = nameIds(found.item.original.split('\n')[0]).trailing?.id;
  if (!id) return { why: WHY.noId };
  const bodyIds = new Set(before.targets.flatMap(t => t.id ?? []));
  const others = boxes.flatMap(box => box.items).filter(each => each.line !== found.item.line && each.id === id);
  if (bodyIds.has(id) || others.length || context.elsewhere(id)) return { why: WHY.takenId(id) };
  const fm = frontmatterLines(lines);
  const headings = bodyHeadings(lines, boxes, fm && fm !== 'unclosed' ? fm.close + 1 : 0);
  const wanted = boxHeading(lines, found.box, found.item);
  const endOf = (target: (typeof before.targets)[number]): number => before.layout.get(target.line)!.end;
  let at: number, head: string[] = [], expect: string | null = null;
  const indentOfTarget = (target: (typeof before.targets)[number] | undefined): number => target ? indentOf(lines[target.line].raw).width : 0;
  let rootIndent = indentOfTarget(last);
  if (wanted) {
    const same = headings.filter(h => h.level === wanted.level && h.key === wanted.key);
    if (same.length > 1) return { why: DEEPEN_WHY.twoHeadings(same[0].text) };
    expect = wanted.key;
    if (same.length === 1) {
      const h = same[0];
      const stop = headings.find(each => each.line > h.line)?.line ?? lines.length;
      const inScope = before.targets.filter(t => t.line > h.line && t.line < stop);
      const tail = inScope.at(-1);
      at = tail ? endOf(tail) : h.line + 1;
      rootIndent = tail ? indentOfTarget(tail) : 0;
    } else {
      at = last ? endOf(last) : found.box.line;
      head = [wanted.raw, ''];
    }
  } else {
    at = last ? endOf(last) : found.box.line;
  }
  const out = unboxed(found.item, rootIndent, tabs);
  if ('why' in out) return out;
  const next = compose(lines, boxes, [{ item: found.item, box: found.box, lines: [...head, ...out.lines] }], at);
  const after = parseDeck(next);
  // 寫之前核對：原本的每個目標完整內容不變（新增標題會讓後面的小標題序號位移，不比 sectionIndex），新目標恰好一個、和在框裡時相同、歸在預期的標題底下。
  const kept = after.targets.filter(t => t.id !== id);
  if (content(kept, ['sectionIndex']) !== content(before.targets, ['sectionIndex'])) return { why: WHY.verify };
  const target = after.targets.filter(t => t.id === id);
  if (target.length !== 1) return { why: WHY.verify };
  if (expect !== null && headingKey(target[0].section ?? '') !== expect) return { why: WHY.verify };
  const alone = parseDeck((target[0].section === null ? '' : `# ${target[0].section}\n`) + out.lines.join('\n'), { subject: before.props.subject }).targets;
  if (alone.length !== 1 || content(target, ['section', 'sectionIndex']) !== content(alone, ['section', 'sectionIndex'])) return { why: WHY.verify };
  if (after.problems.some(p => p.code === 'duplicate-id')) return { why: WHY.verify };
  if (needsMark(after) && !(typeof after.props.need === 'string' && canRead(PICK_NEEDS, after.props.need))) {
    const marked = markNeed(next, PICK_NEEDS);
    return marked === null ? { why: WHY.need } : { text: marked };
  }
  return { text: next };
}

/** 一次加入的項目分兩種搬法：候選（含「候選卡片（加深）」）照 §2 一起搬，加深的學習目標照 §3-3 一項一項搬。 */
export function moveItems(text: string, refs: readonly ItemRef[], context: MoveContext): MovePlan {
  const deepen = refs.filter(ref => ref.kind === 'deepen'), plain = refs.filter(ref => ref.kind !== 'deepen');
  const first = plain.length ? moveCandidates(text, plain, context) : { text: null, moved: [], left: [] };
  if (!deepen.length) return first;
  const second = moveDeepen(first.text ?? text, deepen, context);
  const left = [...first.left, ...second.left].sort((a, b) => refs.indexOf(a.ref) - refs.indexOf(b.ref));
  return { text: second.text ?? first.text, moved: [...first.moved, ...second.moved], left };
}
