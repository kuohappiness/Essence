// 直接製作的測試共用（tests/ai-direct-flow.test.ts、tests/ai-cards-modal.test.ts）：製卡流程（src/obsidian/ai-cards.ts）＋真正的 createState＋記憶體 Files＋套件的假 fetch。
import assert from 'node:assert/strict';
import type { TestContext } from 'node:test';
import { parse } from 'yaml';
import { mockFetch, sse } from '../../../../packages/ai-client/src/testing.ts';
import type { MockReply } from '../../../../packages/ai-client/src/testing.ts';
import { sha256Hex, sha256OfBytes } from '../../src/core/ai/index.ts';
import type { CardForm, CardJob, EmbeddedRules } from '../../src/core/ai/index.ts';
import { cardsClient, readConnection } from '../../src/core/connect/index.ts';
import type { DirectFailure, DirectLog, KeyLookup, Material } from '../../src/core/connect/index.ts';
import { createState } from '../../src/state/index.ts';
import { createAiCards } from '../../src/obsidian/ai-cards.ts';
import { createMemoryFiles } from './memory-files.ts';

export const FAKE_KEY = 'AIzaSy-cards-direct-flow-3333';
const rules: EmbeddedRules = { english: [{ name: '通用', version: 'v0.15', text: '# 通用', sha256: sha256Hex('# 通用') }, { name: '英文', version: 'v0.14', text: '# 英文', sha256: sha256Hex('# 英文') }] };
const OLD = 'Essence Cards/學業/國二上/英文/國二上英文 L1 單字.md';
const OLD_TEXT = '---\n年級學期: 國二上\n科目: 英文\n單元: L1 Hi\n狀態: 啟用\n---\n\n## 單字\n\n- hello 英翻中 ^k3m9qa\n    - 出處：p.10\n    - hello :: 你好\n';
export const reply = [
  '國二上英文 L3 單字', '', '## 單字', '', '- borrow 英翻中', '    - 出處：p.40', '    - borrow :: 借入', '',
  '國二上英文 L3 文法', '', '## 文法', '', '- 能用 be going to 說未來的計畫', '    - 出處：p.42', '    - 我明天要去游泳。I ＿＿ swim tomorrow. :: am going to', '<<<完>>>',
].join('\n');
export const form: CardForm = { subject: 'english', term: '國二上', unit: 'L3 Sports', purpose: '準備段考', supplement: false, adjust: '', material: '' };
export const WORD = 'Essence Cards/學業/國二上/英文/國二上英文 L3 單字.md';
export const SNAPSHOT = 'Essence Cards/紀錄/AI 輸出/2026-11-07 國二上英文 L3 Sports.md';
const LESSON_BYTES = new Uint8Array([37, 80, 68, 70, 1, 2, 3]);
export const lesson: Material = { name: '英文 L3.pdf', mediaType: 'application/pdf', data: LESSON_BYTES, pages: 12, sha256: sha256OfBytes(LESSON_BYTES) };

export const ok = (text: string, finishReason = 'STOP'): MockReply => ({
  status: 200, headers: { 'content-type': 'text/event-stream' },
  chunks: [sse([
    { data: { candidates: [{ content: { parts: [{ text }], role: 'model' } }], modelVersion: 'gemini-3.8-flash-001', responseId: 'gem-1' } },
    { data: { candidates: [{ content: { parts: [], role: 'model' }, finishReason }], usageMetadata: { promptTokenCount: 18_000, candidatesTokenCount: 4_000, totalTokenCount: 22_000 } } },
  ])],
});
export const unauthorized: MockReply = { status: 400, headers: { 'content-type': 'application/json' }, chunks: [JSON.stringify({ error: { code: 400, message: 'API key not valid', status: 'INVALID_ARGUMENT', details: [{ reason: 'API_KEY_INVALID' }] } })] };
/** Gemini 的請求本文裡，提示那一段的字與附件的種類。 */
export function sent(body: string | null): { text: string; files: string[] } {
  const parts = (JSON.parse(body ?? '{}') as { contents: { parts: { text?: string; inlineData?: { mimeType: string } }[] }[] }).contents[0].parts;
  return { text: parts.filter(part => part.text !== undefined).map(part => part.text).join(''), files: parts.flatMap(part => part.inlineData ? [part.inlineData.mimeType] : []) };
}

export function machine() {
  // failNext：接下來幾次存工作丟錯（存不進這台電腦）。
  const saved: { jobs: unknown; retired: string[]; last: { subject?: string; term?: string }; picks: Record<string, boolean>; failNext: number } = { jobs: null, retired: [], last: {}, picks: {}, failNext: 0 };
  const store = {
    jobs: () => saved.jobs === null ? null : JSON.parse(JSON.stringify(saved.jobs)) as unknown,
    saveJobs(jobs: CardJob[]) { if (saved.failNext > 0) { saved.failNext--; throw Error('存不進去（測試）'); } saved.jobs = JSON.parse(JSON.stringify(jobs)) as unknown; },
    retired: () => saved.retired,
    retire(ids: readonly string[]) { saved.retired = [...new Set([...saved.retired, ...ids])]; },
    last: () => saved.last,
    saveLast(last: { subject: string; term: string }) { saved.last = last; },
    picks: () => saved.picks,
    savePick(key: string, pick: boolean) { saved.picks = { ...saved.picks, [key]: pick }; },
  };
  return { saved, store };
}
/** 每次載入同一串亂數：兩次載入配出的 ID 相同，存出的卡組才能逐字比。 */
function seeded(): () => number {
  let seed = 7;
  return () => { seed = (seed * 48_271) % 2_147_483_647; return seed / 2_147_483_647; };
}
export async function load(t: TestContext, replies: MockReply[] | ((index: number) => MockReply), options: { key?: KeyLookup; direct?: boolean; reasoning?: string; provider?: string; model?: string; box?: ReturnType<typeof machine>; memory?: ReturnType<typeof createMemoryFiles>; now?: () => number } = {}) {
  const random = seeded();
  const memory = options.memory ?? createMemoryFiles({ [OLD]: OLD_TEXT });
  const box = options.box ?? machine();
  const clipboard: string[] = [];
  const errors: unknown[] = [];
  const failures: DirectFailure[] = [];
  const logs: DirectLog[] = [];
  const fetch = mockFetch(Array.isArray(replies) ? replies : (_request, index) => replies(index));
  const client = cardsClient(fetch);
  const provider = options.provider ?? 'google';
  const connection = readConnection({ provider, models: { [provider]: options.model ?? 'gemini-3.8-flash' }, secrets: { [provider]: 'my-key' }, ...options.reasoning ? { reasoning: options.reasoning } : {} }, client.providers());
  const now = options.now ?? (() => Date.parse('2026-11-07T10:02:11+08:00'));
  // eslint-disable-next-line prefer-const -- state 與流程互相參照
  let state: ReturnType<typeof createState>;
  const cards = createAiCards({
    rules, state: () => state, store: box.store, random,
    names: () => new Set([...memory.texts.keys()].filter(path => path.endsWith('.md')).map(path => path.slice(path.lastIndexOf('/') + 1, -3).toLowerCase())),
    named: name => [...memory.texts.keys()].filter(path => path.endsWith('.md') && path.slice(path.lastIndexOf('/') + 1, -3).toLowerCase() === name),
    clipboard: text => { clipboard.push(text); return Promise.resolve(); },
    now: () => ({ ms: now(), offset: 480 }),
    onError: error => { errors.push(error); },
    ...options.direct === false ? {} : { direct: { client, connection: () => connection, key: () => options.key ?? { ok: true, key: FAKE_KEY }, onFailure: (log, failure) => { failures.push(failure); logs.push(log); } } },
  });
  state = createState({ files: memory.files, device: 'PC-test', delay: 1, fillIds: true, random, reserved: () => cards.reserved(), now: () => Date.parse('2026-11-07T10:02:11+08:00'), offset: () => 480, onError() {} });
  t.after(() => state.close());
  await state.ready();
  return { cards, memory, box, clipboard, errors, failures, logs, fetch };
}

/** 快照的屬性區（解析後）與全文。 */
export function propsOf(memory: ReturnType<typeof createMemoryFiles>, path = SNAPSHOT): { props: Record<string, unknown>; text: string } {
  const text = memory.texts.get(path);
  assert.ok(text, path);
  return { props: parse(text.slice(4, text.indexOf('\n---\n'))) as Record<string, unknown>, text };
}
