// 比較測試工具：凍結已有目標（任務說明 tasks/rule-test-tool.md §5-3）。照外掛複製提示時的篩選：同一科、年級學期不晚於這一課、
// 啟用或暫停、讀得懂、有 ID；需要新版的卡組不送，它們的 ID（候選也算）與重複的 ID 在別的卡組也不送（state/index.ts 的 aiExisting、aiWords）。
// 只讀 vault，不寫。存兩份：送給 AI 的清單（existingTargets、英文另有 learnedWords），和給評審的完整題池。
import { existingTargets, learnedWords, type ExistingTarget } from '../../src/core/ai/index.ts';
import { codeKey, listDeckPaths, parseDeck, termKey, type Deck, type Prompt } from '../../src/core/deck/index.ts';
import { findDuplicateIds } from '../../src/core/study/index.ts';
import { canRead } from '../../src/core/version/index.ts';
import { createNodeFiles } from '../node-files.ts';

interface PoolTarget { id: string; name: string; source: string; path: string; questions: string[] }

export interface Snapshot {
  /** 讀快照時用的外掛版本（決定哪些卡組「需要新版」）。 */
  version: string;
  subject: string | null;
  term: string;
  /** 送給 AI 的已有目標，順序照外掛。 */
  targets: ExistingTarget[];
  /** 英文的已有單字；其他科是 null。 */
  words: string[] | null;
  /** 給評審的完整題池：targets 的每一個目標、每一題。 */
  pool: PoolTarget[];
  /** 沒送的原因：重複的 ID、需要新版的卡組（路徑）。 */
  skipped: { duplicateIds: string[]; newerDecks: string[] };
}

/** 一題寫成一行：問答是 `題目 :: 答案`，填空與排序是整行；多行的用 ／ 接起來（和外掛的第一題同一種寫法）。 */
function questionLine(prompt: Prompt): string {
  const flat = (text: string): string => text.split('\n').map(line => line.trim()).filter(Boolean).join('／');
  return prompt.kind === 'qa' ? `${flat(prompt.question)} :: ${flat(prompt.answer)}` : flat(prompt.text);
}

/** 讀得懂的卡組與不送的 ID（需要新版的卡組的 ID、重複的 ID），外掛 aiExisting、aiWords 的篩法。 */
function readableOf<T extends { path: string; deck: Deck }>(decks: readonly T[], version: string): { readable: T[]; newer: T[]; duplicateIds: string[]; skip: Set<string> } {
  const sorted = [...decks].sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  const newer = sorted.filter(entry => entry.deck.props.need !== null && !canRead(entry.deck.props.need, version));
  const readable = sorted.filter(entry => !newer.includes(entry));
  const gated = newer.flatMap(entry => entry.deck.targets.flatMap(t => [...t.id ? [t.id] : [], ...t.idCandidates ?? []]));
  const duplicateIds = findDuplicateIds(readable).map(each => each.id);
  return { readable, newer, duplicateIds, skip: new Set([...duplicateIds, ...gated]) };
}

/** 從讀好的卡組算快照（vault 的讀法在 readVault）。subject 是卡組屬性的科目（例如「英文」），一般知識是 null。 */
export function snapshotOf(decks: readonly { path: string; deck: Deck }[], subject: string | null, term: string, version: string): Snapshot {
  const { readable, newer, duplicateIds, skip } = readableOf(decks, version);
  const targets = existingTargets(readable, subject, term, skip);
  const byPath = new Map(readable.map(entry => [entry.path, entry.deck]));
  const pool = targets.map(target => {
    const found = byPath.get(target.path)?.targets.find(t => t.id === target.id);
    return { id: target.id, name: target.name, source: target.source, path: target.path, questions: found ? found.prompts.map(questionLine) : [] };
  });
  return {
    version, subject, term, targets,
    words: subject === '英文' ? learnedWords(readable, subject, term, skip) : null,
    pool,
    skipped: { duplicateIds, newerDecks: newer.map(entry => entry.path) },
  };
}

interface VaultDeck { path: string; text: string; deck: Deck }

/** 讀 vault 的卡組，連全文（加深要用，rule-test-d236.md §6-1 第 4 點）。 */
export async function readVault(vault: string): Promise<VaultDeck[]> {
  const files = createNodeFiles(vault);
  const paths = await listDeckPaths(files);
  const texts = await Promise.all(paths.map(path => files.read(path)));
  return paths.flatMap((path, i) => { const text = texts[i]; return text === null ? [] : [{ path, text, deck: parseDeck(text) }]; });
}

/**
 * 英文的已有單字要和模擬加入的卡組一起排（rule-test-d236.md §6-1 第 4 點）：凍結這一科讀得懂的卡組全文與不送的 ID，
 * 模擬時連同模擬的卡組交給外掛的 learnedWords，篩法與排法都是外掛的。
 */
export interface WordDecks { decks: { path: string; text: string }[]; skip: string[] }
export function wordDecksOf(decks: readonly VaultDeck[], subject: string, version: string): WordDecks {
  const { readable, skip } = readableOf(decks, version);
  return { decks: readable.filter(entry => entry.deck.props.subject?.trim() === subject).map(({ path, text }) => ({ path, text })), skip: [...skip].sort() };
}

/** 這一課的單元已經有的卡組（含草稿，轉錄稿不算）：加深模擬的是新課，有就停下（§6-1 第 4 點）。 */
export function unitDecks(decks: readonly { path: string; deck: Deck }[], subject: string, term: string, code: string): string[] {
  return decks.filter(({ deck: { props } }) => !props.isTranscript && props.subject?.trim() === subject && props.term !== null && termKey(props.term) === termKey(term)
    && props.unit !== null && codeKey(props.unit.code) === codeKey(code)).map(entry => entry.path);
}

interface RoundOnePrompt { kind: string; question?: string; answer?: string; text?: string }
interface RoundOneTarget { id: string; name: string; source: string; path: string; first?: string | null; prompts: RoundOnePrompt[] }

/**
 * 讀一份凍結好的快照檔（`已有目標: { 快照: … }`）：這個工具凍結的（有 pool），或第一輪的（規則重整測試 已有目標快照/*.json：
 * targets 每一筆有 prompts、英文另有 learnedWords；用 eeeaeb19 的 existingTargets 篩過，照原順序）。第一輪的 first 沒有題目時不送（同第一輪 check.ts）。
 */
export function parseSnapshotFile(text: string, version: string): Snapshot {
  const data = JSON.parse(text) as Record<string, unknown>;
  if (Array.isArray(data.pool) && Array.isArray(data.targets)) return data as unknown as Snapshot;
  if (!Array.isArray(data.targets) || typeof data.term !== 'string') throw Error('快照檔認不得：要是這個工具凍結的，或第一輪的已有目標快照');
  const flat = (text: string | undefined): string => (text ?? '').split('\n').map(line => line.trim()).filter(Boolean).join('／');
  const targets = data.targets as RoundOneTarget[];
  const strings = (value: unknown): string[] => Array.isArray(value) ? value.map(String) : [];
  return {
    version,
    subject: typeof data.subject === 'string' ? data.subject : null,
    term: data.term,
    targets: targets.map(t => ({ id: t.id, name: t.name, source: t.source, path: t.path, ...t.first ? { first: t.first } : {} })),
    words: data.subject === '英文' ? strings(data.learnedWords) : null,
    pool: targets.map(t => ({ id: t.id, name: t.name, source: t.source, path: t.path, questions: t.prompts.map(p => p.kind === 'qa' ? `${flat(p.question)} :: ${flat(p.answer)}` : flat(p.text)) })),
    skipped: { duplicateIds: strings(data.duplicateIds), newerDecks: strings(data.gated) },
  };
}
