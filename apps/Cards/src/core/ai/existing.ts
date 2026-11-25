import { choiceStem, fieldStart, linesOf, listTree, parseDeck, readProperties } from '../deck/index.ts';
import type { Deck, DeckProps, Item, Line, Prompt, Target } from '../deck/index.ts';
import { planSources, SOURCE_WHY } from './existing-sources.ts';
import type { Endpoint } from './existing-sources.ts';
import { encode, indentOf } from './move.ts';

// 加進已有的學習目標（tasks/ai-cards-add.md §3-2）：框裡那一項的第一層子項目分成資料欄位、題目、其他，各自的完整範圍跟著走；
// 和目的地這個目標已有的逐字比（一對一配對），只加缺的；出處照 §3-3。只算文字，不寫檔。
// 計畫（算缺什麼）、§4 的確認（整項都在）與拿掉來源用同一個函式：計畫的 text 是 null 就是「目的地已經有這一項」。

/** 通知裡的卡組名：檔名去掉 .md。 */
const deckName = (path: string): string => path.slice(path.lastIndexOf('/') + 1).replace(/\.md$/, '');
export const EXISTING_WHY = {
  noTarget: '原本的卡組裡找不到這個學習目標',
  fieldInside: '題目或補充底下有資料欄位，請手動搬',
  multiline: '資料欄位（例如備註、錯題補強）底下有子項目或分成好幾行，請手動搬',
  broken: '這一項的寫法有問題，請先改好',
  rootText: '名稱那一行底下有接續的文字，請手動搬',
  nothing: '這一項沒有要加的題目或補充，請手動處理',
  links: '這一項有別處連過來的位置或換了位置會指到別的檔的連結，請手動搬',
  sameQuestion: '目的地已經有同一題，但補充不一樣，請自己看',
  qaConflict: (deck: string): string => `「${deck}」已經有同一個問題、答案不一樣：可能是改過的答案，也可能這題本來就有好幾個答案（例如舉一種會導電的金屬）。請打開對照；要加就改寫題目或手動貼上`,
  verify: '加過去會改到別的內容，請手動搬',
  choiceAmbiguous: '加過去之後同一句配了兩個讀音，孩子分不出該念哪一個：請換只有一種念法的句子再手動貼上',
  sources: SOURCE_WHY,
  // §3-1、§4：目的地這一篇的狀況（state 判斷）。
  targetBroken: '原本的學習目標寫法有問題，請先改好',
  newer: '原本的卡組需要新版的外掛才讀得懂，更新外掛之前不能加入',
  // 加深的補題（tasks/ai-cards-deepen.md §3-3、D-190 第 3、4 點）。
  otherDeck: '加深的補題只加進這一篇；這個學習目標在別篇，請手動處理',
  outside: '出處裡有「課外：」，合併出處的規則還沒涵蓋課外，請手動搬',
  locked: (path: string): string => `「${deckName(path)}」的寫入還沒確定，請重開 Obsidian 後再按`,
  unsure: (path: string): string => `「${deckName(path)}」可能已經寫好，請再按一次`,
  failed: (path: string): string => `「${deckName(path)}」暫時存不進去，請稍後再按一次`,
  notNow: '這次沒有加入，請照上面的說明再按一次',
} as const;

/** 一個要搬的單位：題目（連同它的完整範圍）或其他（記憶錨點這類共用補充、第一層圖片）。lines 是原文的行，key 是比對用的正規化。 */
interface Unit { kind: 'prompt' | 'other'; lines: string[]; base: number; key: string; prompt: Prompt | null }
interface Units { units: Unit[]; remarks: string[]; mistakes: string[]; sources: string[] }

/** 比對用：換行字元與縮排換算成同一種（Tab 展開、照單位第一行的相對欄位），其他照字（行尾空白的硬換行、行序、程式碼）。 */
function keyOf(lines: readonly string[], base: number): string {
  return lines.map(raw => { if (!raw.trim()) return ''; const { width, rest } = indentOf(raw); return `${String(width - base)}|${rest}`; }).join('\n');
}
/** 一項底下的範圍，去掉最後的空行。 */
function rangeOf(lines: readonly Line[], item: Item): string[] {
  const out = lines.slice(item.line, item.end).map(line => line.raw);
  while (out.length && !out.at(-1)!.trim()) out.pop();
  return out;
}
/** 子項目（不含自己）裡有資料欄位。 */
const fieldBelow = (item: Item): boolean => item.children.some(child => fieldStart.test(child.text) || fieldBelow(child));
const without = (prompt: Prompt): unknown => { const { line: _line, ...rest } = prompt; return rest; };

/**
 * 一個目標的根項（目的地）或框裡的那一項（來源）分成單位。deck 是同一份文字用同一個科目解析的結果；root 是那一項。
 * 來源那一項沒有題目時解析器不回傳目標：欄位用同一套讀法（補一題假的題目再讀），單位照子項目切。
 */
function unitsOf(lines: readonly Line[], root: Item, target: Target | null, fields: Target['fields'], strict: boolean): Units | { why: string } {
  const units: Unit[] = [];
  for (const child of root.children) {
    if (fieldStart.test(child.text)) {
      // 欄位只搬讀出的值（備註、錯題補強各成一行，類型、重要性、狀態不搬）：那一行底下的子項目、接續行不會跟著走，拿掉來源就丟了；
      // 複合欄位（`類型：事實｜備註：甲`）不論哪一個欄位在前都一樣（第二輪 R5、L2 R2）。
      if (strict && (child.children.length || child.starts.length > 1)) return { why: EXISTING_WHY.multiline };
      continue;
    }
    // 欄位出現在題目或補充底下（例如記憶錨點底下的 `狀態：暫停`、題目底下的 `出處：`）：不知道該不該跟著走（F5）。目的地自己這樣寫照常比。
    if (strict && fieldBelow(child)) return { why: EXISTING_WHY.fieldInside };
    const prompt = target?.prompts.find(each => each.line === child.line) ?? null;
    const range = rangeOf(lines, child);
    units.push({ kind: prompt ? 'prompt' : 'other', lines: range, base: child.indent, key: keyOf(range, child.indent), prompt });
  }
  return { units, remarks: fields.remarks, mistakes: fields.mistakes, sources: fields.sources };
}

/** 框裡那一項（去掉引言框前綴、用 \n 接的原文）的單位；用目的地的科目讀（題型照目的地的名稱，寫後核對也用它）。 */
function itemUnits(original: string, subject: string | null): Units | { why: string } {
  const lines = linesOf(original);
  const [root] = listTree(lines, 0);
  if (!root) return { why: EXISTING_WHY.broken };
  if (root.starts.length > 1) return { why: EXISTING_WHY.rootText };
  const deck = parseDeck(original, { subject });
  const target = deck.targets[0] ?? null;
  if (target && !target.ok) return { why: EXISTING_WHY.broken };
  // 沒有題目：補一題假的題目只為了讀欄位（同一套欄位讀法）；假的那一題不算進任何單位。
  const indent = root.children[0] ? lines[root.children[0].line].raw.slice(0, lines[root.children[0].line].raw.length - lines[root.children[0].line].raw.trimStart().length) : '    ';
  const fields = target?.fields ?? parseDeck(original.replace(/\s*$/, '') + `\n${indent}- 甲 :: 乙\n`, { subject }).targets[0]?.fields;
  if (!fields) return { why: EXISTING_WHY.broken };
  return unitsOf(lines, root, target, fields, true);
}

/** 一對一配對（§3-2〈已經在目的地〉）：來源的每個單位在目的地找一個逐字相同、還沒配過的；回傳缺的那幾個。 */
function missingOf(source: readonly Unit[], dest: readonly Unit[]): Unit[] {
  const pool = dest.map(unit => unit.kind + '\n' + unit.key);
  return source.filter(unit => {
    const at = pool.indexOf(unit.kind + '\n' + unit.key);
    if (at < 0) return true;
    pool.splice(at, 1);
    return false;
  });
}
/** 問答題的題目那一面：只去掉每行頭尾空白與清單符號，不把行內的空白摺成一個（程式字串 `"a  b"` 和 `"a b"` 是不同的題）。 */
const questionSide = (question: string): string => question.split('\n').map(line => line.replace(/^\s*(?:[-*+]|\d+[.)])\s+/, '').trim()).join('\n');

/** 一行裡的連結與嵌入的目標（Wiki、Markdown、圖片、片段）；網址另外回傳。 */
function linksIn(line: string): { internal: string[]; external: string[] } {
  const internal: string[] = [], external: string[] = [];
  for (const match of line.matchAll(/!?\[\[([^\]|]*)(?:\|[^\]]*)?\]\]/g)) internal.push(match[1].trim());
  for (const match of line.matchAll(/!?\[[^\]\n]*\]\(([^)\n]*)\)/g)) {
    const target = match[1].trim().replace(/^<|>$/g, '');
    if (/^[a-z][a-z0-9+.-]*:/i.test(target)) external.push(target); else internal.push(decodeURI(target));
  }
  return { internal, external };
}
/** 跨篇搬的行裡帶區塊 ID（題尾的不當目標 ID，D-089 第 9 條）。 */
const BLOCK_ID = /(?:^|\s)\^[A-Za-z0-9-]+\s*$/;

/** 目的地這個目標的範圍（listTree 的根項）。 */
function rootAt(lines: readonly Line[], line: number): Item | null {
  return listTree([...lines], readProperties([...lines]).start).find(item => item.line === line) ?? null;
}
/** 這一篇的縮排字元：第一個有縮排的清單行用 Tab 就是 Tab。 */
const usesTabs = (lines: readonly Line[]): boolean => lines.find(line => /^[ \t]+(?:[-*+]|\d+[.)])(?:\s|$)/.test(line.raw))?.raw.startsWith('\t') ?? false;

export interface ExistingInput {
  /** 框裡那一項去掉引言框前綴的原文（BoxItem.original）。 */
  original: string;
  /** 目的地目標的 ID（連結的 `#^ID` 或原文開頭的 ID）。 */
  id: string;
  /** 來源這一篇：路徑與最新的屬性（出處照它讀，§4 第 4 步重驗也照最新的）。 */
  source: { path: string; props: DeckProps };
  /** 目的地這一篇：路徑與最新的全文。 */
  dest: { path: string; text: string };
  version: string | null;
  /** 連結從某一篇解析到的檔（Obsidian 的 metadataCache）；解析不到是 null。同一篇時不用。 */
  resolve?: (link: string, from: string) => string | null;
  /** 出處的教材端點（§3-3 第 8 步）。 */
  endpoint?: Endpoint;
}
/** plan：text 是加完的目的地全文；null 是什麼都不用加（目的地已經有這一項）。leave：那一項留著，why 是給家長看的原因。 */
export type ExistingPlan = { kind: 'plan'; text: string | null } | { kind: 'leave'; why: string };

/** §3-2：算要加到目的地那個目標的、組好全文、寫前寫後核對。 */
export function planExisting(input: ExistingInput): ExistingPlan {
  const leave = (why: string): ExistingPlan => ({ kind: 'leave', why });
  const destText = input.dest.text;
  const deck = parseDeck(destText);
  const subject = deck.props.subject;
  const found = deck.targets.filter(t => t.id === input.id);
  // 目的地是隱含題（ID 是 null）不會被 ID 找到；找不到、不只一個、寫法有問題的都不加（§3-1）。
  if (found.length !== 1 || found[0].implicit || !found[0].ok) return leave(EXISTING_WHY.noTarget);
  const target = found[0];
  const read = itemUnits(input.original, subject);
  if ('why' in read) return leave(read.why);
  const lines = linesOf(destText);
  const root = rootAt(lines, target.line);
  if (!root) return leave(EXISTING_WHY.noTarget);
  const dest = unitsOf(lines, root, target, target.fields, false) as Units;
  const sourceLines = linesOf(input.original);
  // 先過留項條件（第四輪）：不成立的項目不能用「其餘都在」證明。
  if (input.source.path !== input.dest.path) {
    const moving = sourceLines.slice(1).map(line => line.raw);
    if (moving.some(line => BLOCK_ID.test(line))) return leave(EXISTING_WHY.links);
    for (const line of moving) {
      const { internal } = linksIn(line);
      for (const link of internal) {
        const a = input.resolve?.(link, input.source.path) ?? null, b = input.resolve?.(link, input.dest.path) ?? null;
        if (a === null || a !== b) return leave(EXISTING_WHY.links);
      }
    }
  }
  const hasMove = read.units.length > 0 || read.remarks.length > 0 || read.mistakes.length > 0 || read.sources.length > 0;
  if (!hasMove) return leave(EXISTING_WHY.nothing);
  const missing = missingOf(read.units, dest.units);
  // 窄版防呆（問答）與同指紋不同內容：只查真正要新增的。
  const destPrompts = dest.units.filter(unit => unit.prompt);
  for (const unit of missing) {
    const prompt = unit.prompt;
    if (!prompt) continue;
    if (prompt.kind === 'qa' && destPrompts.some(each => each.prompt!.kind === 'qa' && questionSide(each.prompt!.question) === questionSide(prompt.question) && each.prompt!.answer !== prompt.answer)) {
      return leave(EXISTING_WHY.qaConflict(deckName(input.dest.path)));
    }
    if (destPrompts.some(each => each.prompt!.fingerprint === prompt.fingerprint && each.key !== unit.key)) return leave(EXISTING_WHY.sameQuestion);
  }
  const remarks = read.remarks.filter(value => !dest.remarks.includes(value));
  const mistakes = read.mistakes.filter(value => !dest.mistakes.includes(value));
  const { text: composed, block } = compose(lines, root, target, missing, remarks, mistakes);
  const sources = planSources({ sources: read.sources, source: input.source.props, text: composed, target: target.line, version: input.version, endpoint: input.endpoint });
  if (sources.kind === 'leave') return leave(sources.why);
  const text = sources.text;
  if (text === destText) return { kind: 'plan', text: null };
  const after = parseDeck(text);
  // 多音字（tasks/polyphone-pick.md §5，PR #53 的 Codex 審查、L2 R1、R2）：合起來的池裡同一句（照 choiceStem）配了兩個讀音就不寫，同一批的、和原本的句子都算。
  const now = after.targets[deck.targets.indexOf(target)] as Target | undefined;
  if (now && ambiguous(now) && !ambiguous(target)) return leave(EXISTING_WHY.choiceAmbiguous);
  return verify(deck, after, target, [lines[root.line].raw, ...block], remarks, mistakes, subject) ? { kind: 'plan', text } : leave(EXISTING_WHY.verify);
}

/** 多音字的池裡有沒有同一句配了兩個讀音（同 check.ts 的 choice-ambiguous）。 */
function ambiguous(target: Target): boolean {
  const choice = target.choice;
  if (!choice) return false;
  const stems = new Map<string, number>();
  return target.prompts.some((prompt, i) => {
    if (prompt.kind !== 'qa') return false;
    const key = choiceStem(prompt.question), seen = stems.get(key);
    stems.set(key, choice.answers[i]);
    return seen !== undefined && seen !== choice.answers[i];
  });
}

/**
 * 組出加完的目的地（出處除外）：題目接在最後一題完整範圍的結束處（沒有題目時接在資料欄位後面），其他接在這一項的最後，
 * 備註與錯題補強在資料欄位後面各加一行。第一層對齊目的地子項目那一層，更深的照相對欄位換算；縮排字元照目的地。
 */
function compose(lines: readonly Line[], root: Item, target: Target, missing: readonly Unit[], remarks: readonly string[], mistakes: readonly string[]): { text: string; block: string[] } {
  const eol = lines.find(line => line.eol)?.eol ?? '\n';
  const finalEol = (lines.at(-1)?.eol ?? '') !== '';
  const tabs = usesTabs(lines);
  const childIndent = root.children[0]?.indent ?? root.contentColumn + 2;
  const marker = /^\s*([-*+])\s/.exec(lines[root.children[0]?.line ?? -1]?.raw ?? '')?.[1] ?? '-';
  const endOf = (item: Item): number => item.line + rangeOf(lines, item).length;
  const headerEnd = Math.max(...root.starts.map(start => start.line)) + 1;
  const fields = root.children.filter(child => fieldStart.test(child.text));
  const prompts = root.children.filter(child => target.prompts.some(prompt => prompt.line === child.line));
  const afterFields = fields.length ? endOf(fields.at(-1)!) : headerEnd;
  const afterPrompts = prompts.length ? endOf(prompts.at(-1)!) : afterFields;
  const afterAll = root.children.length ? endOf(root.children.at(-1)!) : headerEnd;
  const shift = (unit: Unit): string[] => unit.lines.map(raw => {
    if (!raw.trim()) return '';
    const { width, rest } = indentOf(raw);
    return encode(Math.max(childIndent, childIndent + width - unit.base), tabs) + rest;
  });
  const inserts = new Map<number, string[]>();
  const add = (at: number, block: string[]): void => { inserts.set(at, [...inserts.get(at) ?? [], ...block]); };
  const pad = encode(childIndent, tabs);
  if (remarks.length) add(afterFields, [`${pad}${marker} 備註：${remarks.join('、')}`]);
  if (mistakes.length) add(afterFields, [`${pad}${marker} 錯題補強：${mistakes.join('、')}`]);
  // block：實際插入的題目與其他（核對時接在名稱那一行後面單獨讀）。
  const block: string[] = [];
  for (const unit of missing) if (unit.kind === 'prompt') { const shifted = shift(unit); block.push(...shifted); add(afterPrompts, shifted); }
  for (const unit of missing) if (unit.kind === 'other') { const shifted = shift(unit); block.push(...shifted); add(afterAll, shifted); }
  const out: string[] = [];
  for (let i = 0; i <= lines.length; i++) {
    out.push(...inserts.get(i) ?? []);
    if (i < lines.length) out.push(lines[i].raw);
  }
  return { text: out.join(eol) + (finalEol ? eol : ''), block };
}

const content = (value: unknown): string => JSON.stringify(value, (key, each: unknown) => key === 'line' || key === 'targetLine' ? undefined : each);
/** 多重集合：b 是 a 再加上 extra（順序不算）。 */
function grows(a: readonly unknown[], b: readonly unknown[], extra: readonly unknown[]): boolean {
  const pool = b.map(content);
  for (const each of [...a, ...extra]) { const at = pool.indexOf(content(each)); if (at < 0) return false; pool.splice(at, 1); }
  return pool.length === 0;
}

/**
 * 寫之前核對（F5）：用目的地的科目解析寫前、寫後兩份文字：其他目標完全不變；這個目標的 ID、名稱、題型、既有題目與補充（完整內容）不變，
 * 題目與補充只多出預期的（和單獨讀那幾個單位相同）、欄位只多出預計的備註與錯題補強、出處由 §3-3 核對；沒有新的寫法問題。
 */
function verify(before: Deck, after: Deck, target: Target, block: readonly string[], remarks: readonly string[], mistakes: readonly string[], subject: string | null): boolean {
  if (content(before.props) !== content(after.props)) return false;
  const index = before.targets.indexOf(target);
  if (before.targets.length !== after.targets.length) return false;
  if (content(before.targets.filter((_, i) => i !== index)) !== content(after.targets.filter((_, i) => i !== index))) return false;
  const now = after.targets[index];
  // 題型不變（比較卡的組、全詩、句子排序、接句、打字）；題型的內容跟著題目變，只比種類與組的身分。
  const { prompts: p0, shared: s0, fields: f0, group: g0, order: o0, sentence: q0, couplet: c0, choice: h0, ...rest0 } = target;
  const { prompts: p1, shared: s1, fields: f1, group: g1, order: o1, sentence: q1, couplet: c1, choice: h1, ...rest1 } = now;
  // 多音字（tasks/polyphone-pick.md §5）：答案與錨點跟著題目變，只比是不是多音字與括號裡的讀音。
  const choiceOf = (choice: typeof h0): string | null => choice ? content([choice.word, choice.optionKeys]) : null;
  if (content(rest0) !== content(rest1) || g0?.key !== g1?.key || !o0 !== !o1 || !q0 !== !q1 || !c0 !== !c1 || choiceOf(h0) !== choiceOf(h1)) return false;
  // 預期新增的題目與補充：目的地的名稱那一行接上實際插入的那幾行，單獨讀。
  // 最後補一題假的題目：只加補充（沒有題目）時解析器才會回傳目標；假的那一題不算。
  const alone = parseDeck([...block, '    - 甲 :: 乙'].join('\n') + '\n', { subject }).targets[0] as Target | undefined;
  if (!alone) return false;
  const expectPrompts = alone.prompts.slice(0, -1), expectShared = alone.shared;
  if (!grows(p0.map(without), p1.map(without), expectPrompts.map(without))) return false;
  if (!grows(s0, s1, expectShared)) return false;
  const { sources: _a, remarks: r0, mistakes: m0, ...k0 } = f0, { sources: _b, remarks: r1, mistakes: m1, ...k1 } = f1;
  if (content(k0) !== content(k1) || content([...r0, ...remarks]) !== content(r1) || content([...m0, ...mistakes]) !== content(m1)) return false;
  // 沒有新的寫法問題（比較卡混進普通問答的 pick-mixed、答案不在組裡、排序退化……）。
  const codes = (deck: Deck, line: number): string[] => deck.problems.filter(p => p.targetLine === line).map(p => p.code + p.message).sort();
  const old = codes(before, target.line);
  return codes(after, now.line).every(code => old.includes(code));
}
