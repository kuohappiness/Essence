import { parse } from 'yaml';
import { TRAILING_ID } from '../deck/index.ts';
import { parseTime } from '../study/index.ts';

// 加深讀快照（tasks/ai-cards-deepen.md §2-3、syntax §6）：一份快照歸屬哪一篇、提示的基準、送給 AI 的地圖、以前出過的目標。只讀文字，連結的解析由呼叫端給。

const ID = /^[A-Za-z0-9-]+$/;
const DAY = 86_400_000;
const BOM = String.fromCharCode(0xfeff);

/** 一份快照讀出來的樣子。kind：first 是初次製卡、deepen 是加深，其他組合（舊稿、缺欄、壞值）是 null（不算加深過、不拿來擋，§2-3）。 */
export interface SnapshotInfo {
  path: string;
  /** `時間` 的時刻（毫秒）；不是帶時區的合法時刻是 null（不拿來當基準，也不選地圖）。 */
  at: number | null;
  id: string;
  kind: 'first' | 'deepen' | null;
  /** 送出時凍結的記穩 ID 集合（照 ID 排序、去重）；kind 是 null 時是 null。 */
  stable: string[] | null;
  /** `對象` 每一項連結的目標（`[[` 與 `|` 或 `]]` 之間），沒有連結的項目略過。 */
  links: string[];
  /** 完整的全貌與架構兩段（`<<<全貌>>>`、`<<<架構>>>` 都在、都不是空的）；沒有是 null。 */
  map: { whole: string; structure: string } | null;
  /** 卡組段裡名稱行行尾有 ID 的（新目標、候選；加進已有的原文沒有行尾 ID）：ID 與名稱。 */
  named: { id: string; name: string }[];
  /** 加深的 `原有目標`：複製時這一篇的目標 ID（L2 R7）；沒寫、或清單裡有不是 ID 的字是空的。 */
  original: string[];
}

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

/** 屬性區與本文；沒有屬性區或讀不懂是 null。 */
function split(text: string): { props: Record<string, unknown>; body: string } | null {
  const lines = (text.startsWith(BOM) ? text.slice(1) : text).split(/\r?\n/);
  if (lines[0]?.trim() !== '---') return null;
  const close = lines.findIndex((line, i) => i > 0 && line.trim() === '---');
  if (close < 0) return null;
  let props: unknown;
  try { props = parse(lines.slice(1, close).join('\n')); } catch { return null; }
  return isObject(props) ? { props, body: lines.slice(close + 1).join('\n') } : null;
}

/** 本文的三段：最外層、單獨一行的 `<<<名稱>>>`（快照本文是整理過的回覆，標記一定頂格）。 */
function sections(body: string): Map<string, string> {
  const lines = body.split('\n');
  const marks = lines.flatMap((line, at) => { const m = /^ {0,3}<<<([^<>\n]*)>>>[ \t]*$/.exec(line); return m ? [{ at, name: m[1].trim() }] : []; });
  const found = new Map<string, string>();
  marks.forEach((mark, i) => { if (!found.has(mark.name)) found.set(mark.name, lines.slice(mark.at + 1, marks[i + 1]?.at ?? lines.length).join('\n').trim()); });
  return found;
}

/** 名稱行的名稱：拿掉引言框前綴、清單符號與行尾 ID。 */
const nameOf = (line: string): string => line.replace(TRAILING_ID, '').replace(/^(?:\s{0,3}>\s?)*\s*(?:[-*+]|\d+[.)])\s+/, '').trim();

/** `記穩目標` 和 `工作` 一起讀（§2-3）。 */
function kindOf(work: unknown, stable: unknown): Pick<SnapshotInfo, 'kind' | 'stable'> {
  if (work === '製卡' && stable === '無（初次製卡）') return { kind: 'first', stable: [] };
  if (work === '加深' && stable === '無') return { kind: 'deepen', stable: [] };
  if (work === '加深' && Array.isArray(stable) && stable.length && stable.every(each => typeof each === 'string' && ID.test(each))) {
    return { kind: 'deepen', stable: [...new Set(stable as string[])].sort() };
  }
  return { kind: null, stable: null };
}

/** 讀一份快照；屬性區讀不懂、沒有 `識別碼` 是 null。 */
export function readSnapshot(path: string, text: string): SnapshotInfo | null {
  const parts = split(text);
  if (!parts) return null;
  const { props, body } = parts;
  const id = props['識別碼'];
  if (typeof id !== 'string' || !id) return null;
  const time = typeof props['時間'] === 'string' ? parseTime(props['時間']) : null;
  const targets = Array.isArray(props['對象']) ? props['對象'] : [props['對象']];
  const links = targets.flatMap(each => {
    const m = typeof each === 'string' ? /\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|[^\]]*)?\]\]/.exec(each) : null;
    return m ? [m[1].trim()] : [];
  });
  const found = sections(body);
  const whole = found.get('全貌') ?? '', structure = found.get('架構') ?? '';
  const deck = found.has('卡組') ? found.get('卡組')! : found.size ? '' : body;
  const named = deck.split('\n').flatMap(line => { const m = TRAILING_ID.exec(line); return m ? [{ id: m[1], name: nameOf(line) }] : []; });
  const listed = props['原有目標'];
  const original = Array.isArray(listed) && listed.every(each => typeof each === 'string' && ID.test(each)) ? [...new Set(listed as string[])] : [];
  return { path, at: time?.at ?? null, id, ...kindOf(props['工作'], props['記穩目標']), links, map: whole && structure ? { whole, structure } : null, named, original };
}

/**
 * 歸屬這一篇的快照（§2-3）：`對象` 有一項解析到這一篇（resolve 回傳那個連結指到的卡組路徑；解析不到、有歧義是 null），
 * 而且不是「同一路徑換了一篇」：快照裡的 ID（卡組段、`記穩目標` 與 `原有目標`）有、卻一個都不在這一篇時不算。
 * `原有目標` 只在連結已經指到這一篇時幫忙認回（新目標全部捨棄的同一篇，L2 R7），不拿來跨篇找。
 */
export function ownSnapshots(list: readonly SnapshotInfo[], deckPath: string, deckIds: ReadonlySet<string>, resolve: (link: string) => string | null): SnapshotInfo[] {
  return list.filter(each => {
    if (!each.links.some(link => resolve(link) === deckPath)) return false;
    const ids = [...each.named.map(target => target.id), ...each.stable ?? [], ...each.original];
    return !ids.length || ids.some(id => deckIds.has(id));
  });
}

/** 新的在前：比時刻，相同時比 `識別碼`、再比路徑（字典順序大的算新）。 */
const newer = (a: SnapshotInfo, b: SnapshotInfo): number => (b.at! - a.at!) || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0) || (a.path < b.path ? 1 : a.path > b.path ? -1 : 0);
const usable = (each: SnapshotInfo, nowMs: number): boolean => each.at !== null && each.at <= nowMs + DAY;

/** 提示的基準（§2-3）：時間合法、不比現在晚超過一天、`工作` 與 `記穩目標` 讀得懂的最新一份；沒有是 null（當第一次）。 */
export function baselineOf(owned: readonly SnapshotInfo[], nowMs: number): SnapshotInfo | null {
  return owned.filter(each => each.kind !== null && usable(each, nowMs)).sort(newer)[0] ?? null;
}

/** 送給 AI 的地圖（§2-2）：有完整全貌與架構的最新一份，和基準分開選。 */
export function latestMap(owned: readonly SnapshotInfo[], nowMs: number): SnapshotInfo | null {
  return owned.filter(each => each.map !== null && usable(each, nowMs)).sort(newer)[0] ?? null;
}

/** 以前出過、現在不在這一篇的目標（§2-2）：歸屬這一篇的快照卡組段裡名稱行有 ID、這一篇現在沒有的；同一個 ID 只列一次（取最新那份的名稱）。 */
export function goneTargets(owned: readonly SnapshotInfo[], deckIds: ReadonlySet<string>): { id: string; name: string }[] {
  const seen = new Map<string, string>();
  for (const each of [...owned].sort((a, b) => (b.at ?? -Infinity) - (a.at ?? -Infinity))) {
    for (const target of each.named) if (!deckIds.has(target.id) && !seen.has(target.id)) seen.set(target.id, target.name);
  }
  return [...seen].map(([id, name]) => ({ id, name })).sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

const LINK = /\[\[([^\]|#]+)(#[^\]|]*)?(?:\|([^\]]*))?\]\]/g;
const baseName = (path: string): string => path.slice(path.lastIndexOf('/') + 1).replace(/\.md$/i, '');
/** `對象` 裡外掛會改的寫法（L2 R12）：一項一行的清單或同一行的值，整個值是一對雙引號（外掛自己寫的樣子）；其他寫法（單引號、沒有引號、flow 清單、後面有註解）不改。 */
const QUOTED = /^(\s*-\s+|對象\s*:\s*)"([^"\\]*)"(\s*)$/;
/** 連結的目的地放不下的字：Obsidian 拿 `#`、`^`、`|`、`[`、`]` 當連結語法（L2 R12）。 */
const UNLINKABLE = /[#^|[\]]/;

/**
 * 快照 `對象` 的一項（製卡與加深共用，syntax §6）：完整路徑、顯示檔名，別處有同檔名的筆記也認得出是哪一篇（手機製卡 L2 R4）。
 * 路徑有連結放不下的字（例如資料夾名稱有 `#`）時只寫檔名，照舊靠「同檔名剛好一篇」解析（第二輪 P2）。
 */
export function deckLink(path: string): string {
  const name = baseName(path);
  return UNLINKABLE.test(path) ? `[[${name}]]` : `[[${path}|${name}]]`;
}

/**
 * 卡組改名或搬走之後，把快照 `對象` 裡指向舊位置的連結改到新位置（L2 R7）：只改屬性區 `對象` 那幾行裡雙引號包著的值，其他字一個都不動。
 * 寫完整路徑的照路徑比（和加深解析連結相同：補上 `.md` 後完全相同）。只寫檔名的：檔名相同（不分大小寫），而且現在已經沒有
 * 同檔名的卡組（left 回 0）才是那一篇，改成完整路徑（新位置的檔名不一定只有一篇）。顯示的名稱是舊檔名的跟著換。
 * 新路徑有連結放不下的字、沒有要改的、改完重讀不是「只有那幾個連結換了」（L2 R12）都回 null。
 */
export function retargetSnapshot(text: string, old: string, next: string, left: (name: string) => number): string | null {
  if (UNLINKABLE.test(next)) return null;
  const lines = text.split(/(?<=\n)/);
  const start = lines[0]?.replace(BOM, '').trim() === '---' ? 1 : -1;
  if (start < 0) return null;
  const close = lines.findIndex((line, i) => i > 0 && line.trim() === '---');
  if (close < 0) return null;
  const key = lines.findIndex((line, i) => i >= start && i < close && /^對象\s*:/.test(line));
  if (key < 0) return null;
  let end = key + 1;
  while (end < close && /^(?:[ \t-]|\r?\n$)/.test(lines[end])) end++;
  const oldName = baseName(old), nextName = baseName(next);
  /** 一個值裡的連結換成新位置；沒有指到舊位置的原樣。 */
  const swap = (value: string): string => value.replace(LINK, (whole, raw: string, hash: string | undefined, alias: string | undefined) => {
    const target = raw.trim();
    const shown = alias === undefined || alias.trim() === oldName ? nextName : alias;
    if (target.includes('/')) {
      if ((target.endsWith('.md') ? target : `${target}.md`) !== old) return whole;
      return `[[${target.endsWith('.md') ? next : next.replace(/\.md$/, '')}${hash ?? ''}|${shown}]]`;
    }
    if (target.toLowerCase() !== oldName.toLowerCase() || left(target.toLowerCase()) !== 0) return whole;
    return `[[${next.replace(/\.md$/, '')}${hash ?? ''}|${shown}]]`;
  });
  let changed = false;
  for (let i = key; i < end; i++) {
    const eol = /\r?\n$/.exec(lines[i])?.[0] ?? '';
    const body = lines[i].slice(0, lines[i].length - eol.length);
    const m = QUOTED.exec(body);
    if (!m) continue;
    const value = swap(m[2]);
    if (value === m[2]) continue;
    lines[i] = `${m[1]}"${value}"${m[3]}${eol}`;
    changed = true;
  }
  if (!changed) return null;
  const result = lines.join('');
  // 重讀核對（L2 R12）：其他屬性一樣；`對象` 每一項是原本的值換過連結的樣子；本文一樣。
  const before = split(text), after = split(result);
  if (!before || !after || before.body !== after.body) return null;
  const keys = new Set([...Object.keys(before.props), ...Object.keys(after.props)]);
  for (const name of keys) {
    if (name === '對象') continue;
    if (JSON.stringify(before.props[name]) !== JSON.stringify(after.props[name])) return null;
  }
  const was = before.props['對象'], now = after.props['對象'];
  const expected = Array.isArray(was) ? (was as unknown[]).map((each: unknown) => typeof each === 'string' ? swap(each) : each) : typeof was === 'string' ? swap(was) : was;
  return JSON.stringify(expected) === JSON.stringify(now) ? result : null;
}

/**
 * 兩份快照除了 `對象` 都一樣（L2 R13）：屬性（`對象` 以外）讀出來相同、本文相同。改名時外掛或 Obsidian 只改 `對象`，
 * Obsidian 改的時候會重排整個屬性區，所以比讀出來的值，不比字。任一份讀不懂是 false。
 */
export function sameButTargets(a: string, b: string): boolean {
  const x = split(a), y = split(b);
  if (!x || !y || x.body.replace(/\r\n?/g, '\n') !== y.body.replace(/\r\n?/g, '\n')) return false;
  const rest = (props: Record<string, unknown>): string => JSON.stringify(Object.entries(props).filter(([name]) => name !== '對象').sort(([p], [q]) => p < q ? -1 : p > q ? 1 : 0));
  return rest(x.props) === rest(y.props);
}
