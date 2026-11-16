import { chapterAlias, codeKey, editSource, parseDeck, readSourceParts, readTerm, termKey, tidy } from '../deck/index.ts';
import type { DeckProps, SourceItem, SourceLink, SourcePart } from '../deck/index.ts';

// 加進已有的學習目標的出處（tasks/ai-cards-add.md §3-3）：先讀懂、只搬認得的寫法、照讀出的歸屬轉寫、寫後重讀核對。
// 不逐段加前綴（F1）；認不得的整項留著，請家長手動搬：轉錯的代價（連錯書、題目算進別的考試範圍）比多搬一次大。

export const SOURCE_WHY = '出處請手動搬';

/** 一個位置的歸屬與位置原文：比對鍵都已正規化（科目、年級學期、單元編號、去掉空白的位置）。place 是 null：只寫了單元。 */
interface Place { subject: string; term: string; unit: string; place: string | null; link: SourceLink }
/** 來源讀出的一段：這一篇的位置（照原文的位置字）或寫明的別的單元（整串原文）。 */
type Piece = { kind: 'here'; text: string; place: Place } | { kind: 'chain'; text: string; places: Place[] };

/** 屬性裡出處要用的部分：科目、年級學期、單元、材料。 */
export type SourceOwner = Pick<DeckProps, 'subject' | 'term' | 'unit' | 'materials'>;
/** 出處的端點（§3-3 第 8 步）：來源有材料時，每個轉寫的位置在兩邊解析到的教材端點；解析不到是 null。 */
export type Endpoint = (link: SourceLink, side: 'source' | 'dest') => string | null;

const subjectKey = (subject: string | null): string => tidy(subject ?? '').trim();
const unitKey = (code: string): string => codeKey(chapterAlias(code));
const placeKey = (text: string): string => tidy(text).replace(/\s+/g, '');
const samePlace = (a: Place, b: Place): boolean => a.subject === b.subject && a.term === b.term && a.unit === b.unit && a.place === b.place;
/** 原文含連結或網址：不收（第三輪 R1：看原文，不只看解析出的連結種類）。 */
const LINKISH = /\[\[|\]\(|https?:\/\//;

/** 位置的字：去掉開頭的年級學期、`本單元`、和 unit 相同的編號；剩下的就是位置（含範圍與說明）。沒有是 null。 */
function placeText(text: string, unit: string | null): string | null {
  let rest = tidy(text).trim();
  const term = readTerm(rest);
  if (term) rest = rest.slice(term.length).trim();
  rest = rest.replace(/^本單元\s*/, '');
  const first = /^\S+/.exec(rest)?.[0];
  if (unit !== null && first !== undefined && unitKey(first) === unitKey(unit)) rest = rest.slice(first.length).trim();
  return rest || null;
}
/** 一段讀出的歸屬；這一篇的段用 owner。owner 沒有年級學期或單元時沒有歸屬（null）。 */
function placeOf(part: SourcePart, item: SourceItem, owner: SourceOwner): Place | null {
  const subject = subjectKey(owner.subject);
  if (part.scope === 'this') {
    if (!owner.term || !owner.unit) return null;
    return { subject, term: termKey(owner.term), unit: unitKey(owner.unit.code), place: placeKey(placeText(item.text, owner.unit.code) ?? '') || null, link: item.link };
  }
  if (part.scope === null) return null;
  const rest = item.link.kind === 'unit' ? item.link.rest : null;
  return { subject, term: termKey(part.scope.term), unit: unitKey(part.scope.unit), place: rest === null ? null : placeKey(placeText(item.text, part.scope.unit) ?? '') || null, link: item.link };
}
/** 一欄出處讀出的每一個歸屬（目的地現有的；比對與寫後核對用）。 */
function placesOf(sources: readonly string[], owner: SourceOwner): Place[] {
  return readSourceParts(sources, owner).flatMap(part => part.items.flatMap(item => { const place = placeOf(part, item, owner); return place ? [place] : []; }));
}
const rawOf = (sources: readonly string[], part: SourcePart): string | null => part.from === null || part.to === null ? null : sources[part.entry].slice(part.from, part.to);

/** 第 1、2 步：讀來源那一項的出處，只收白名單的寫法；有一段不收就整項留著（回 null）。 */
function readPieces(sources: readonly string[], owner: SourceOwner): Piece[] | null {
  if (sources.some(source => LINKISH.test(source))) return null;
  const pieces: Piece[] = [];
  let chain: Extract<Piece, { kind: 'chain' }> | null = null;
  for (const part of readSourceParts(sources, owner)) {
    // 一個原文片段含兩個以上位置（`圖2-14 表2-1`）：不自己拆。
    if (part.items.length !== 1) return null;
    const [item] = part.items;
    if (item.problem || item.missed || item.remark) return null;
    const raw = rawOf(sources, part);
    if (raw === null) return null;
    if (part.scope === 'this') {
      chain = null;
      if (item.link.kind !== 'block') return null;
      // 承接前一項記號的（`p.44、46` 的 `46`）補上同一個記號；承接的不只是記號（`圖2-13a、b`）不收。
      if (part.follows === 'place' && !/^\d+(?:\s*[-–~]\s*\d+)?$/.test(raw.trim())) return null;
      const place = placeOf(part, item, owner);
      const text = placeText(item.text, owner.unit?.code ?? null);
      // 來源屬性不足卻有本地位置（`p.15` 但來源沒有單元）：不湊。
      if (!place || text === null) return null;
      pieces.push({ kind: 'here', text, place });
      continue;
    }
    if (part.scope === null || item.link.kind !== 'unit' || (item.link.rest !== null && item.link.rest.kind !== 'block')) return null;
    const place = placeOf(part, item, owner);
    if (!place) return null;
    // 寫明的別的單元：從寫明的年級學期開始，連同靠它承接的段，整串照原文。
    if (readTerm(tidy(raw).trim())) {
      chain = { kind: 'chain', text: raw.trim(), places: [place] };
      pieces.push(chain);
    } else if (chain) {
      chain.text += '、' + raw.trim();
      chain.places.push(place);
    } else return null;
  }
  return pieces;
}

export interface SourcesInput {
  /** 來源那一項的出處欄（parseDeck 讀出的 fields.sources）。 */
  sources: readonly string[];
  /** 來源這一篇最新的屬性。 */
  source: SourceOwner;
  /** 目的地全文與目標那一行。 */
  text: string;
  target: number;
  version: string | null;
  /** 來源有材料時必須給（第 8 步）；沒給就留項。 */
  endpoint?: Endpoint;
}
/** ok：text 是加完出處的目的地全文（不用加時和原本相同），adds 是這次加的段。leave：整項留著。 */
export type SourcesPlan = { kind: 'ok'; text: string; adds: string[] } | { kind: 'leave'; why: string };

/** §3-3：算要加到目的地這個目標的出處、照小表單的寫法寫好、寫後重讀核對。 */
export function planSources(input: SourcesInput): SourcesPlan {
  const leave: SourcesPlan = { kind: 'leave', why: SOURCE_WHY };
  const dest = parseDeck(input.text);
  const target = dest.targets.find(each => each.line === input.target);
  if (!target) return leave;
  const owner = dest.props;
  // 第 3 步：科目不同整項留著（含沒有出處那一行時補課）。
  if (subjectKey(input.source.subject) !== subjectKey(owner.subject)) return leave;
  const pieces = readPieces(input.sources, input.source);
  if (!pieces) return leave;
  const src = input.source;
  // 第 4 步：同一個單元。
  const sameUnit = !!(src.term && owner.term && src.unit && owner.unit) && termKey(src.term) === termKey(owner.term) && unitKey(src.unit.code) === unitKey(owner.unit.code);
  const materials = src.materials.length > 0;
  if (materials && !input.endpoint) return leave;
  const existing = placesOf(target.fields.sources, owner);
  /** 目的地已經有這個位置：歸屬與位置原文相同；來源有材料時端點也要相同（第 8 步）。 */
  const has = (place: Place): boolean => existing.some(each => samePlace(each, place) && (!materials || sameEnd(input.endpoint!, place.link, each.link)));
  // 第 5、6 步：這一篇的位置一個一個比，只寫缺的；別的單元整串比。
  const here = pieces.filter((each): each is Extract<Piece, { kind: 'here' }> => each.kind === 'here').filter(each => !has(each.place));
  const adds: { text: string; own: boolean }[] = [];
  const expect: Place[] = [];
  if (here.length) {
    if (sameUnit) for (const each of here) adds.push({ text: each.text, own: true });
    else {
      if (!src.term || !src.unit) return leave;
      adds.push({ text: `${src.term} ${src.unit.code} ${here.map(each => each.text).join('、')}`, own: false });
    }
    expect.push(...here.map(each => each.place));
  }
  for (const piece of pieces) {
    if (piece.kind !== 'chain' || piece.places.every(has)) continue;
    adds.push({ text: piece.text, own: false });
    expect.push(...piece.places);
  }
  // 第 7 步：補課。同科、不同單元、來源有單元時，目的地（連同這次加的）讀不到任何屬於來源單元的歸屬，就加 `<年級學期> <單元編號>`。
  if (!sameUnit && src.unit) {
    if (!src.term) return leave;
    const unit = { subject: subjectKey(src.subject), term: termKey(src.term), unit: unitKey(src.unit.code) };
    const belongs = (place: Place): boolean => place.subject === unit.subject && place.term === unit.term && place.unit === unit.unit;
    if (!existing.some(belongs) && !expect.some(belongs)) {
      adds.push({ text: `${src.term} ${src.unit.code}`, own: false });
      expect.push({ ...unit, place: null, link: { kind: 'unit', term: src.term, unit: src.unit.code, rest: null } });
    }
  }
  // 第 9 步：每一段用小表單「加一段」的同一套寫法；它拒寫（兩處出處、接續行）就留項。
  let text = input.text;
  for (const add of adds) {
    const result = editSource({ text, target: input.target, action: { kind: 'add', text: add.text, own: add.own }, version: input.version });
    if (!result.ok) return leave;
    text = result.text;
  }
  if (!adds.length) return { kind: 'ok', text, adds: [] };
  // 第 10 步：寫後重讀：原有每一段的歸屬不變（照順序是寫後的子序列）、這次預計加的每一段都讀得到、有材料時端點相同。
  const after = parseDeck(text).targets.find(each => each.line === input.target);
  if (!after) return leave;
  const now = placesOf(after.fields.sources, owner);
  const rest = [...now];
  for (const each of existing) {
    const at = rest.findIndex(other => samePlace(other, each));
    if (at < 0) return leave;
    rest.splice(at, 1);
  }
  for (const each of expect) {
    const at = rest.findIndex(other => samePlace(other, each));
    if (at < 0) return leave;
    if (materials && each.place !== null && !sameEnd(input.endpoint!, each.link, rest[at].link)) return leave;
    rest.splice(at, 1);
  }
  return { kind: 'ok', text, adds: adds.map(each => each.text) };
}
function sameEnd(endpoint: Endpoint, source: SourceLink, dest: SourceLink): boolean {
  const a = endpoint(source, 'source'), b = endpoint(dest, 'dest');
  return a !== null && a === b;
}
