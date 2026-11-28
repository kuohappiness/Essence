// 加深的直接製作的測試共用（tests/ai-deepen-direct.test.ts、tests/deepen-modal-direct.test.ts）：加深流程（src/obsidian/deepen.ts）
// ＋真正的 createState＋記憶體 Files＋套件的假 fetch。
import assert from 'node:assert/strict';
import type { TestContext } from 'node:test';
import { parse } from 'yaml';
import { mockFetch } from '../../../../packages/ai-client/src/testing.ts';
import type { MockReply } from '../../../../packages/ai-client/src/testing.ts';
import { sha256Hex, sha256OfBytes } from '../../src/core/ai/index.ts';
import type { DeepenJob, EmbeddedRules } from '../../src/core/ai/index.ts';
import { cardsClient, readConnection } from '../../src/core/connect/index.ts';
import type { DirectFailure, DirectLog, KeyLookup, Material } from '../../src/core/connect/index.ts';
import { createState } from '../../src/state/index.ts';
import { createDeepen } from '../../src/obsidian/deepen.ts';
import { FAKE_KEY } from './ai-direct.ts';
import { createMemoryFiles } from './memory-files.ts';

const rules: EmbeddedRules = { science: [{ name: '通用', version: 'v1', text: '# 通用', sha256: sha256Hex('# 通用') }] };
export const DECK = 'Essence Cards/學業/國二上/自然/國二上自然 2-1 溫度.md';
export const DECK_TEXT = '---\n年級學期: 國二上\n科目: 自然\n單元: 2-1 溫度\n狀態: 啟用\n---\n\n## 溫度計\n\n- 能說出溫度計的原理 ^abc234\n    - 出處：p.40\n    - 類型：定義\n    - 溫度計靠什麼原理？ :: 熱脹冷縮\n';
export const REPLY = [
  '<<<全貌>>>', '溫度的全貌', '', '<<<架構>>>', '1. 溫度計', '2. 溫標', '', '<<<卡組>>>', '## 溫度計', '',
  '- 能比較酒精與水銀溫度計的差異', '    - 出處：p.41', '    - 類型：比較', '    - 為什麼**水銀**溫度計可以量較高溫？ :: 水銀**沸點高**', '<<<完>>>',
].join('\n');
export const NOW = Date.parse('2026-11-17T10:00:00+08:00');
const FOLDER = 'Essence Cards/紀錄/AI 輸出';
export const SNAPSHOT = `${FOLDER}/2026-11-17 國二上自然 2-1 溫度 加深.md`;
const PAGE = new Uint8Array([37, 80, 68, 70, 9, 8, 7]);
export const lesson: Material = { name: '自然 2-1 補充.pdf', mediaType: 'application/pdf', data: PAGE, pages: 4, sha256: sha256OfBytes(PAGE) };

export function machine() {
  // failNext：接下來幾次存工作丟錯（存不進這台電腦）；failIf：要存的這一份符合時丟錯（例如收到回覆的那一刻）。
  const saved: { jobs: unknown; retired: string[]; skips: unknown; picks: Record<string, boolean>; failNext: number; failIf?: (jobs: DeepenJob[]) => boolean } = { jobs: null, retired: [], skips: null, picks: {}, failNext: 0 };
  return {
    saved,
    store: {
      jobs: () => saved.jobs === null ? null : JSON.parse(JSON.stringify(saved.jobs)) as unknown,
      saveJobs(jobs: DeepenJob[]) {
        if (saved.failNext > 0) { saved.failNext--; throw Error('存不進去（測試）'); }
        if (saved.failIf?.(jobs)) throw Error('存不進去（測試）');
        saved.jobs = JSON.parse(JSON.stringify(jobs)) as unknown; },
      retire(ids: readonly string[]) { saved.retired = [...new Set([...saved.retired, ...ids])]; },
      skips: () => saved.skips,
      saveSkips(value: Record<string, { ids: string[]; at: string }>) { saved.skips = JSON.parse(JSON.stringify(value)) as unknown; },
      remindOff: () => false,
      picks: () => saved.picks,
      savePick(key: string, pick: boolean) { saved.picks = { ...saved.picks, [key]: pick }; },
    },
  };
}
/** 每次載入同一串亂數：兩次載入配出的 ID 相同，存出的卡組才能逐字比。 */
function seeded(): () => number {
  let seed = 11;
  return () => { seed = (seed * 48_271) % 2_147_483_647; return seed / 2_147_483_647; };
}
export async function load(t: TestContext, replies: MockReply[], options: { key?: KeyLookup; direct?: boolean; box?: ReturnType<typeof machine>; memory?: ReturnType<typeof createMemoryFiles>; now?: () => number } = {}) {
  const random = seeded();
  const memory = options.memory ?? createMemoryFiles({ [DECK]: DECK_TEXT });
  const box = options.box ?? machine();
  const clipboard: string[] = [];
  const errors: unknown[] = [];
  const failures: DirectFailure[] = [];
  const logs: DirectLog[] = [];
  const fetch = mockFetch(replies);
  const client = cardsClient(fetch);
  const connection = readConnection({ provider: 'google', models: { google: 'gemini-3.8-flash' }, secrets: { google: 'my-key' } }, client.providers());
  const now = options.now ?? (() => NOW);
  const md = () => [...memory.texts.keys()].filter(path => path.endsWith('.md'));
  // eslint-disable-next-line prefer-const -- state 與流程互相參照
  let state: ReturnType<typeof createState>;
  const deepen = createDeepen({
    rules, state: () => state, store: box.store, random,
    names: () => new Set(md().map(path => path.slice(path.lastIndexOf('/') + 1, -3).toLowerCase())),
    named: name => md().filter(path => path.slice(path.lastIndexOf('/') + 1, -3).toLowerCase() === name),
    snapshots: () => Promise.resolve(md().filter(path => path.startsWith(`${FOLDER}/`) && !path.includes('/原文/')).map(path => ({ path, text: memory.texts.get(path)! }))),
    read: path => Promise.resolve(memory.texts.get(path) ?? null),
    editor: () => null,
    unsaved: () => Promise.resolve(false),
    clipboard: text => { clipboard.push(text); return Promise.resolve(); },
    now: () => ({ ms: now(), offset: 480 }),
    onError: error => { errors.push(error); },
    ...options.direct === false ? {} : { direct: { client, connection: () => connection, key: () => options.key ?? { ok: true, key: FAKE_KEY }, onFailure: (log: DirectLog, failure: DirectFailure) => { failures.push(failure); logs.push(log); } } },
  });
  state = createState({ files: memory.files, device: 'PC-test', delay: 1, fillIds: true, random, reserved: () => deepen.reserved(), now: () => NOW, offset: () => 480, onError() {} });
  t.after(() => state.close());
  await state.ready();
  return { deepen, memory, box, clipboard, errors, failures, logs, fetch };
}
/** 快照的屬性區（解析後）與全文。 */
export function propsOf(memory: ReturnType<typeof createMemoryFiles>, path = SNAPSHOT): { props: Record<string, unknown>; text: string } {
  const text = memory.texts.get(path);
  assert.ok(text, `${path} 不在：${[...memory.texts.keys()].join('、')}`);
  return { props: parse(text.slice(4, text.indexOf('\n---\n'))) as Record<string, unknown>, text };
}
