import type { Files } from '../files.ts';
import { parseDeck } from '../deck/index.ts';
import type { Card } from '../study/index.ts';
import { formatTime } from '../study/index.ts';

/**
 * 預覽的單張卡回饋紀錄（D-246、syntax.md §11）：家長或開發者在預覽留的評等、標籤與一句話，每台裝置每月一個檔，只往後加。
 * 外掛只寫、不讀；讀的是品測模組與維護的 AI。一次預覽建一個，上限照一次預覽算。
 */

export const FEEDBACK_FOLDER = 'Essence Cards/紀錄/回饋';

/** 一行最多幾 bytes（UTF-8，含 JSON 的跳脫，§11）。 */
const MAX_BYTES = 16_000;
/** 一次預覽最多寫幾行（§11）：防程式出錯時一直寫。 */
const SESSION_LINES = 1_000;

/** 一張卡的一格：學習目標 ID 與題目指紋。 */
interface FeedbackCell { lt: string; v: string }

/** 要寫的一行：卡組、每一格、那一刻的完整回饋與卡的原文。沒選的評等是 null，沒寫的一句話是空字串。 */
export interface FeedbackEntry {
  path: string;
  cells: readonly FeedbackCell[];
  rate: string | null;
  tags: readonly string[];
  note: string;
  card: string;
}

export interface FeedbackLog {
  /** 寫一行：寫好是 saved，這次預覽寫滿是 full，寫不進去（含太長）是 failed。不拋錯。 */
  write(entry: FeedbackEntry): Promise<'saved' | 'full' | 'failed'>;
}

export interface FeedbackLogOptions {
  files: Files;
  /** 這台的裝置碼，和複習紀錄相同。 */
  device: string;
  /** 建置版本 `BUILD` 原樣。 */
  build: string;
  now?: () => number;
  offset?: (ms: number) => number;
  /** 寫不進去時（append 丟錯）交給錯誤紀錄（where: feedback）。 */
  failed?: (error: unknown, path: string) => void;
}

export function feedbackLogPath(ms: number, offset: number, device: string): string {
  return `${FEEDBACK_FOLDER}/${formatTime(ms, offset).slice(0, 7)} ${device} 回饋.jsonl`;
}

/** `紀錄/回饋/` 裡的檔（含 iCloud 的衝突副本）：整個資料夾都是外掛自己寫、只往後加的。 */
export function isFeedbackLogPath(path: string): boolean {
  return path.startsWith(FEEDBACK_FOLDER + '/');
}

/** 這張卡的每一格，照卡上的順序；同一對 lt、v 只留第一個（全詩順序卡、句子排序同一題好幾格）。 */
function cellsOf(card: Card): FeedbackCell[] {
  const cells: FeedbackCell[] = [];
  for (const blank of card.blanks) {
    const v = blank.prompt.fingerprint;
    if (!cells.some(cell => cell.lt === blank.lt && cell.v === v)) cells.push({ lt: blank.lt, v });
  }
  return cells;
}

/**
 * 一張卡用到的每個目標在卡組裡的原文（syntax.md §11 的 `card`）：從目標那一行到 layout 的 `end` 前一行，每一行照原文（Tab、行尾空白不動），
 * 行與行之間一律寫 \n，最後不加換行；好幾個目標時照筆記的順序、目標之間多一個空行。比較卡、多音字是同一組的每個目標
 * （和畫面對答案後的對照同一批，格式查核 F4），不只這張卡出的那幾格。切不到的目標（文字和卡對不上）略過。
 */
function sourceOf(lines: readonly string[], layout: ReadonlyMap<number, { end: number }>, lineOf: ReadonlyMap<string, number>, card: Card): string {
  const rows = (card.group?.rows ?? []).flatMap(row => row.lt === null ? [] : [lineOf.get(row.lt)]).filter(line => line !== undefined);
  const starts = [...new Set([...card.blanks.map(blank => blank.target.line), ...rows])].sort((a, b) => a - b);
  return starts.flatMap(line => {
    const end = layout.get(line)?.end;
    return end === undefined ? [] : [lines.slice(line, end).join('\n')];
  }).join('\n\n');
}

/** 預覽留的回饋（review 的 Feedback）：沒選的評等是 null，沒寫的一句話是空字串。 */
interface Left { rate: string | null; tags: readonly string[]; note: string }

/**
 * 一次預覽寫回饋的一方（review 的 FeedbackSink）：path 是卡組，text 是預覽打開時編輯器的文字（預覽的卡從它來，行號對得上）。
 * 第一次存時才解析原文的位置。
 */
export function previewSink(log: FeedbackLog, path: string, text: string): { save(card: Card, feedback: Left): Promise<'saved' | 'full' | 'failed'> } {
  let source: ((card: Card) => string) | null = null;
  return {
    save(card, feedback) {
      if (!source) {
        const lines = text.split(/\r\n|\n|\r/);
        const { layout, targets } = parseDeck(text, { layout: true });
        const lineOf = new Map<string, number>();
        for (const target of targets) if (target.id !== null && !lineOf.has(target.id)) lineOf.set(target.id, target.line);
        source = each => sourceOf(lines, layout, lineOf, each);
      }
      return log.write({ path, cells: cellsOf(card), card: source(card), rate: feedback.rate, tags: feedback.tags, note: feedback.note });
    },
  };
}

interface Line { t: string; build: string; run: string; path: string; cells: readonly FeedbackCell[]; rate?: string; tags?: readonly string[]; note?: string; card: string; cut?: true }

const encoder = new TextEncoder();
const bytes = (line: Line): number => encoder.encode(JSON.stringify(line)).length;

/** 一行 JSON，欄位照 §11 的表排；太長時截短 card（照字截，不切在半個字上）並寫 cut。card 截到空還放不下是 null。 */
function encode(line: Line): string | null {
  if (bytes(line) <= MAX_BYTES) return JSON.stringify(line);
  const chars = Array.from(line.card);
  const cut = (k: number): Line => ({ ...line, card: chars.slice(0, k).join(''), cut: true });
  if (bytes(cut(0)) > MAX_BYTES) return null;
  let lo = 0, hi = chars.length - 1;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (bytes(cut(mid)) <= MAX_BYTES) lo = mid; else hi = mid - 1;
  }
  return JSON.stringify(cut(lo));
}

/**
 * 一次預覽一個（上限、`run` 都照這一輪算）。`run` 是建立的那一刻（這一輪預覽打開的時間，格式查核 F1）；
 * 同一個寫的 `t` 嚴格遞增（照複習紀錄的 createLogWriter，格式查核 F6），同一輪不會有同一刻的兩行。
 */
export function createFeedbackLog(options: FeedbackLogOptions): FeedbackLog {
  const { files, device, build, failed } = options;
  const now = options.now ?? Date.now;
  const offsetOf = options.offset ?? (ms => -new Date(ms).getTimezoneOffset());
  const opened = Math.trunc(now());
  let used = 0;
  let last = -Infinity;
  return {
    async write(entry) {
      if (used >= SESSION_LINES) return 'full';
      let path = FEEDBACK_FOLDER;
      try {
        const at = Math.max(Math.trunc(now()), last + 1);
        const offset = offsetOf(at);
        path = feedbackLogPath(at, offset, device);
        const run = formatTime(opened, offsetOf(opened));
        const text = encode({
          t: formatTime(at, offset), build, run, path: entry.path, cells: entry.cells.map(({ lt, v }) => ({ lt, v })),
          ...entry.rate === null ? {} : { rate: entry.rate },
          ...entry.tags.length ? { tags: [...entry.tags] } : {},
          ...entry.note === '' ? {} : { note: entry.note },
          card: entry.card,
        });
        if (text === null) return 'failed';
        last = at;
        used++;
        await files.append(path, text);
        return 'saved';
      } catch (error) {
        try { failed?.(error, path); } catch { /* 記不下來也照樣回 failed。 */ }
        return 'failed';
      }
    },
  };
}
