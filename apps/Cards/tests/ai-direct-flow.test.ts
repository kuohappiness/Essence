import test from 'node:test';
import type { TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { mockFetch, sse } from '../../../packages/ai-client/src/testing.ts';
import type { MockReply } from '../../../packages/ai-client/src/testing.ts';
import { sha256Hex } from '../src/core/ai/index.ts';
import type { CardForm, CardJob, EmbeddedRules } from '../src/core/ai/index.ts';
import { cardsClient, readConnection } from '../src/core/connect/index.ts';
import type { DirectFailure, KeyLookup, Material } from '../src/core/connect/index.ts';
import { createState } from '../src/state/index.ts';
import { createAiCards } from '../src/obsidian/ai-cards.ts';
import { createMemoryFiles } from './helpers/memory-files.ts';

// 直接製作接上製卡流程（tasks/ai-direct.md §4～§6）：同一份提示加教材送出，收回的整段走貼回的同一條路；先存再送、一次一個、重送不重組。
// 製卡流程（src/obsidian/ai-cards.ts）＋真正的 createState＋記憶體 Files＋套件的假 fetch。畫面另外在 Windows 實機看。

const FAKE_KEY = 'AIzaSy-cards-direct-flow-3333';
const rules: EmbeddedRules = { english: [{ name: '通用', version: 'v0.15', text: '# 通用', sha256: sha256Hex('# 通用') }, { name: '英文', version: 'v0.14', text: '# 英文', sha256: sha256Hex('# 英文') }] };
const OLD = 'Essence Cards/學業/國二上/英文/國二上英文 L1 單字.md';
const OLD_TEXT = '---\n年級學期: 國二上\n科目: 英文\n單元: L1 Hi\n狀態: 啟用\n---\n\n## 單字\n\n- hello 英翻中 ^k3m9qa\n    - 出處：p.10\n    - hello :: 你好\n';
const reply = [
  '國二上英文 L3 單字', '', '## 單字', '', '- borrow 英翻中', '    - 出處：p.40', '    - borrow :: 借入', '',
  '國二上英文 L3 文法', '', '## 文法', '', '- 能用 be going to 說未來的計畫', '    - 出處：p.42', '    - 我明天要去游泳。I ＿＿ swim tomorrow. :: am going to', '<<<完>>>',
].join('\n');
const form: CardForm = { subject: 'english', term: '國二上', unit: 'L3 Sports', purpose: '準備段考', supplement: false, adjust: '', material: '' };
const WORD = 'Essence Cards/學業/國二上/英文/國二上英文 L3 單字.md';
const SNAPSHOT = 'Essence Cards/紀錄/AI 輸出/2026-11-07 國二上英文 L3 Sports.md';
const lesson: Material = { name: '英文 L3.pdf', mediaType: 'application/pdf', data: new Uint8Array([37, 80, 68, 70, 1, 2, 3]), pages: 12 };

const ok = (text: string, finishReason = 'STOP'): MockReply => ({
  status: 200, headers: { 'content-type': 'text/event-stream' },
  chunks: [sse([
    { data: { candidates: [{ content: { parts: [{ text }], role: 'model' } }], modelVersion: 'gemini-3.8-flash-001', responseId: 'gem-1' } },
    { data: { candidates: [{ content: { parts: [], role: 'model' }, finishReason }], usageMetadata: { promptTokenCount: 18_000, candidatesTokenCount: 4_000, totalTokenCount: 22_000 } } },
  ])],
});
const unauthorized: MockReply = { status: 400, headers: { 'content-type': 'application/json' }, chunks: [JSON.stringify({ error: { code: 400, message: 'API key not valid', status: 'INVALID_ARGUMENT', details: [{ reason: 'API_KEY_INVALID' }] } })] };
/** Gemini 的請求本文裡，提示那一段的字與附件的種類。 */
function sent(body: string | null): { text: string; files: string[] } {
  const parts = (JSON.parse(body ?? '{}') as { contents: { parts: { text?: string; inlineData?: { mimeType: string } }[] }[] }).contents[0].parts;
  return { text: parts.filter(part => part.text !== undefined).map(part => part.text).join(''), files: parts.flatMap(part => part.inlineData ? [part.inlineData.mimeType] : []) };
}

function machine() {
  const saved: { jobs: unknown; retired: string[]; last: { subject?: string; term?: string }; picks: Record<string, boolean> } = { jobs: null, retired: [], last: {}, picks: {} };
  const store = {
    jobs: () => saved.jobs === null ? null : JSON.parse(JSON.stringify(saved.jobs)) as unknown,
    saveJobs(jobs: CardJob[]) { saved.jobs = JSON.parse(JSON.stringify(jobs)) as unknown; },
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
async function load(t: TestContext, replies: MockReply[] | ((index: number) => MockReply), options: { key?: KeyLookup; direct?: boolean } = {}) {
  const random = seeded();
  const memory = createMemoryFiles({ [OLD]: OLD_TEXT });
  const box = machine();
  const clipboard: string[] = [];
  const errors: unknown[] = [];
  const failures: DirectFailure[] = [];
  const fetch = mockFetch(Array.isArray(replies) ? replies : (_request, index) => replies(index));
  const client = cardsClient(fetch);
  const connection = readConnection({ provider: 'google', models: { google: 'gemini-3.8-flash' }, secrets: { google: 'gemini-key' } }, client.providers());
  // eslint-disable-next-line prefer-const -- state 與流程互相參照
  let state: ReturnType<typeof createState>;
  const cards = createAiCards({
    rules, state: () => state, store: box.store, random,
    names: () => new Set([...memory.texts.keys()].filter(path => path.endsWith('.md')).map(path => path.slice(path.lastIndexOf('/') + 1, -3).toLowerCase())),
    named: name => [...memory.texts.keys()].filter(path => path.endsWith('.md') && path.slice(path.lastIndexOf('/') + 1, -3).toLowerCase() === name),
    clipboard: text => { clipboard.push(text); return Promise.resolve(); },
    now: () => ({ ms: Date.parse('2026-11-07T10:02:11+08:00'), offset: 480 }),
    onError: error => { errors.push(error); },
    ...options.direct === false ? {} : { direct: { client, connection: () => connection, key: () => options.key ?? { ok: true, key: FAKE_KEY }, onFailure: failure => { failures.push(failure); } } },
  });
  state = createState({ files: memory.files, device: 'PC-test', delay: 1, fillIds: true, random, reserved: () => cards.reserved(), now: () => Date.parse('2026-11-07T10:02:11+08:00'), offset: () => 480, onError() {} });
  t.after(() => state.close());
  await state.ready();
  return { cards, memory, box, clipboard, errors, failures, fetch };
}

void test('§4 驗收：直接製作收回的整段和貼回的一樣存成草稿；送出的提示和複製的一字不差，教材當附件、不帶檔名；先存工作再送', async t => {
  const pasted = await load(t, [ok(reply)], { direct: false });
  const copied = await pasted.cards.copy(form);
  assert.ok('job' in copied);
  assert.equal((await pasted.cards.save(copied.job, reply, null)).kind, 'done');

  let jobsWhenSent: unknown = null;
  const made = await load(t, [ok(reply)]);
  const outcome = await made.cards.direct(form, [lesson], event => { if (event.type === 'sent') jobsWhenSent = made.box.saved.jobs; });
  assert.equal(outcome.kind, 'received', JSON.stringify(outcome));
  assert.ok(outcome.kind === 'received');
  assert.equal(outcome.reply, reply);
  assert.equal(outcome.result.usage.inputTokens, 18_000);
  // 先存再送：送出的那一刻，這台電腦已經有這一份工作。
  assert.deepEqual((jobsWhenSent as { id: string }[] | null)?.map(job => job.id), [outcome.job.id]);
  const body = sent(made.fetch.requests[0].body);
  assert.equal(body.text, pasted.clipboard[0]);
  assert.deepEqual(body.files, ['application/pdf']);
  // §5（格式查核 F16）：教材說明沒填時不帶檔名，檔名可能帶孩子的名字，不送給 AI。
  assert.equal(outcome.job.form.material, '');
  assert.equal(made.fetch.requests[0].body?.includes('L3.pdf'), false);
  const inspection = made.cards.inspect(outcome.job, outcome.reply);
  assert.ok('errors' in inspection && !inspection.errors.length);
  assert.equal((await made.cards.save(outcome.job, outcome.reply, null)).kind, 'done');
  for (const path of [WORD, 'Essence Cards/學業/國二上/英文/國二上英文 L3 文法.md']) assert.equal(made.memory.texts.get(path), pasted.memory.texts.get(path), path);
  const body0 = (text: string | undefined) => text?.slice(text.indexOf('\n---\n') + 5);
  assert.equal(body0(made.memory.texts.get(SNAPSHOT)), body0(pasted.memory.texts.get(SNAPSHOT)), '快照本文相同');
  assert.deepEqual(made.cards.jobs(), []);
  assert.deepEqual(made.failures, []);
});

void test('§2、§4 送出前擋下（不建工作、不送出）：沒有金鑰、沒選教材、超過頁數、沒填單元；預覽寫出原因或會送出什麼', async t => {
  const none = await load(t, [ok(reply)], { key: { ok: false, why: 'unset' } });
  assert.deepEqual(none.cards.directPreview(form, [lesson]), { ok: false, reason: '先到設定頁的「AI 連線」選好這個服務的金鑰，才能直接製作。' });
  assert.deepEqual(await none.cards.direct(form, [lesson]), { kind: 'blocked', message: '先到設定頁的「AI 連線」選好這個服務的金鑰，才能直接製作。' });
  const made = await load(t, [ok(reply)]);
  assert.deepEqual(made.cards.directPreview(form, []), { ok: false, reason: '先選這一課的教材檔（PDF 或照片）。' });
  assert.deepEqual(made.cards.directPreview({ ...form, unit: ' ' }, [lesson]), { ok: false, reason: '先填單元。' });
  assert.equal((await made.cards.direct(form, [{ ...lesson, pages: 31 }])).kind, 'blocked');
  const preview = made.cards.directPreview(form, [lesson]);
  assert.ok(preview?.ok);
  assert.match(preview.line, /^會送出：英文 L3\.pdf（12 頁）、規則與任務段約 [\d,]+ 字；Gemini 3\.8 Flash，約 US\$/);
  for (const each of [none, made]) {
    assert.deepEqual(each.cards.jobs(), []);
    assert.equal(each.fetch.requests.length, 0);
  }
  const phone = await load(t, [ok(reply)], { direct: false });
  assert.equal(phone.cards.directPreview(form, [lesson]), null);
  assert.equal(phone.cards.canDirect(), false);
});

void test('§6 送不成：留著工作、交給錯誤紀錄；重送用同一份提示與教材，成功後照常存；取消的不記', async t => {
  const made = await load(t, [unauthorized, ok(reply)]);
  const failed = await made.cards.direct(form, [lesson]);
  assert.equal(failed.kind, 'failed');
  assert.ok(failed.kind === 'failed');
  assert.deepEqual([failed.failure.kind, failed.failure.settings], ['auth', true]);
  assert.deepEqual(made.failures.map(failure => failure.kind), ['auth']);
  assert.deepEqual(made.cards.jobs().map(job => job.id), [failed.job.id]);
  const again = await made.cards.resend(failed.job);
  assert.equal(again.kind, 'received');
  assert.equal(made.fetch.requests[1].body, made.fetch.requests[0].body, '重送不重組');
  assert.ok(again.kind === 'received');
  assert.equal(again.job.id, failed.job.id);
  assert.equal((await made.cards.save(again.job, again.reply, null)).kind, 'done');
  assert.equal(JSON.stringify(made.box.saved).includes(FAKE_KEY), false, '金鑰不進這台電腦的存放');

  const slow = await load(t, [{ ...ok(reply), headersDelayMs: 5_000 }]);
  const pending = slow.cards.direct(form, [lesson]);
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(slow.cards.sending(), true);
  // 一次只送一個（§6 最後一點）。
  assert.deepEqual(await slow.cards.direct({ ...form, unit: 'L4 Jobs' }, [lesson]), { kind: 'blocked', message: '另一課正在送出，等它好了再按' });
  slow.cards.cancel();
  const cancelled = await pending;
  assert.ok(cancelled.kind === 'failed');
  assert.equal(cancelled.failure.kind, 'cancelled');
  assert.deepEqual(slow.failures, [], '取消的不記');
  assert.equal(slow.cards.sending(), false);
  assert.equal(slow.cards.jobs().length, 1, '取消之後工作還在，可以重送或改用複製貼上');
});
