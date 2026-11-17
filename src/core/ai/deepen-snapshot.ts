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
  return { path, at: time?.at ?? null, id, ...kindOf(props['工作'], props['記穩目標']), links, map: whole && structure ? { whole, structure } : null, named };
}

/**
 * 歸屬這一篇的快照（§2-3）：`對象` 有一項解析到這一篇（resolve 回傳那個連結指到的卡組路徑；解析不到、有歧義是 null），
 * 而且不是「同一路徑換了一篇」：快照裡的 ID（卡組段與 `記穩目標`）有、卻一個都不在這一篇時不算。
 */
export function ownSnapshots(list: readonly SnapshotInfo[], deckPath: string, deckIds: ReadonlySet<string>, resolve: (link: string) => string | null): SnapshotInfo[] {
  return list.filter(each => {
    if (!each.links.some(link => resolve(link) === deckPath)) return false;
    const ids = [...each.named.map(target => target.id), ...each.stable ?? []];
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
