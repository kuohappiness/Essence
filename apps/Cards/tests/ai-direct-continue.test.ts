// 直接製作的輸出上限與接著要（apps/Cards/docs/tasks/ai-direct-continue.md）：上限照套件目錄的模型；碰到上限（停止原因 length）
// 自動接著要、接好的整段照原本的檢查。假的 fetch，不連網。
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mockFetch, sse } from '../../../packages/ai-client/src/testing.ts';
import type { MockReply } from '../../../packages/ai-client/src/testing.ts';
import { cardsClient, directRequest, evidenceOf, readConnection, sendDirect } from '../src/core/connect/index.ts';
import type { DirectProgress, Material, ProviderSpec } from '../src/core/connect/index.ts';
import { form, lesson, load, ok, propsOf, reply } from './helpers/ai-direct.ts';

const FAKE_KEY = 'AIzaSy-cards-direct-continue-4444';
const providers = cardsClient().providers();
const provider = (id: string): ProviderSpec => { const found = providers.find(p => p.id === id); assert.ok(found, id); return found; };
const pdf: Material = { name: '英文 L3.pdf', mediaType: 'application/pdf', data: new Uint8Array(10).fill(1), pages: 3, sha256: 'a'.repeat(64) };
const google = readConnection({ provider: 'google', models: { google: 'gemini-3.8-flash' }, reasoning: 'default', secrets: { google: 'my-key' } }, providers);

/** 一段 Gemini 的串流：text 分成兩塊送（測進度），finishReason 是 STOP 或 MAX_TOKENS。 */
const gemini = (text: string, finishReason: string, responseId = 'gem-1', usage: { promptTokenCount: number; candidatesTokenCount: number; cachedContentTokenCount?: number } = { promptTokenCount: 18_000, candidatesTokenCount: 4_000 }): MockReply => ({
  status: 200, headers: { 'content-type': 'text/event-stream' },
  chunks: [sse([
    { data: { candidates: [{ content: { parts: [{ text: text.slice(0, 3) }], role: 'model' } }], modelVersion: 'gemini-3.8-flash-001', responseId } },
    { data: { candidates: [{ content: { parts: [{ text: text.slice(3) }], role: 'model' } }], modelVersion: 'gemini-3.8-flash-001', responseId } },
    { data: { candidates: [{ content: { parts: [], role: 'model' }, finishReason }], usageMetadata: { ...usage, totalTokenCount: usage.promptTokenCount + usage.candidatesTokenCount } } },
  ])],
});
const send = (replies: MockReply[], extra: { signal?: AbortSignal; onProgress?: (event: DirectProgress) => void } = {}) => {
  const fetch = mockFetch(replies);
  const request = { ...directRequest({ connection: google, provider: provider('google'), apiKey: FAKE_KEY, prompt: '任務段', materials: [pdf] }), ...extra.signal ? { signal: extra.signal } : {} };
  return { fetch, result: sendDirect(cardsClient(fetch), request, extra.onProgress) };
};
/** Gemini 請求本文的每一則：角色與文字。 */
const turns = (body: string | null): { role: string; text: string }[] =>
  (JSON.parse(body ?? '{}') as { contents: { role: string; parts: { text?: string }[] }[] }).contents.map(each => ({ role: each.role, text: each.parts.map(part => part.text ?? '').join('') }));
const maxOutput = (body: string | null): unknown => (JSON.parse(body ?? '{}') as { generationConfig?: { maxOutputTokens?: unknown } }).generationConfig?.maxOutputTokens;

const HEAD = ['````markdown', '<<<全貌>>>', '全貌一', '<<<架構>>>', '架構一', ''].join('\n');
const TAIL = ['<<<卡組>>>', '國二上英文 L3 單字', '', '- borrow 英翻中', '    - borrow :: 借入', '<<<完>>>', '````'].join('\n');
const WHOLE = HEAD + TAIL;

void test('上限照目錄：請求不寫上限，送出時是目錄裡這個模型的上限（Gemini 65,536、Claude 128,000）；目錄沒有的模型（OpenRouter 自己填的）不送', async () => {
  const request = directRequest({ connection: google, provider: provider('google'), apiKey: FAKE_KEY, prompt: '任務段', materials: [pdf] });
  assert.equal('maxOutputTokens' in request, false);
  const gem = send([gemini(WHOLE, 'STOP')]);
  assert.ok((await gem.result).ok);
  assert.equal(maxOutput(gem.fetch.requests[0].body), 65_536);
  const claude = readConnection({ provider: 'anthropic', models: { anthropic: 'claude-sonnet-5-5' } }, providers);
  const anthropic = mockFetch([{ status: 200, headers: { 'content-type': 'text/event-stream', 'request-id': 'req_1' }, chunks: [sse([
    { event: 'message_start', data: { type: 'message_start', message: { id: 'msg_1', model: 'claude-sonnet-5-5', usage: { input_tokens: 10, output_tokens: 1 } } } },
    { event: 'content_block_delta', data: { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: WHOLE } } },
    { event: 'message_delta', data: { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 20 } } },
    { event: 'message_stop', data: { type: 'message_stop' } },
  ])] }]);
  assert.ok((await sendDirect(cardsClient(anthropic), directRequest({ connection: claude, provider: provider('anthropic'), apiKey: 'sk-ant-fake-key-5555', prompt: '任務段', materials: [pdf] }))).ok);
  assert.equal((JSON.parse(anthropic.requests[0].body ?? '{}') as { max_tokens?: unknown }).max_tokens, 128_000);
  const router = readConnection({ provider: 'openrouter', models: { openrouter: 'some/model' } }, providers);
  const openrouter = mockFetch([{ status: 200, headers: { 'content-type': 'application/json' }, chunks: [JSON.stringify({ model: 'some/model', choices: [{ message: { content: WHOLE }, finish_reason: 'stop' }] })] }]);
  assert.ok((await sendDirect(cardsClient(openrouter), directRequest({ connection: router, provider: provider('openrouter'), apiKey: 'sk-or-fake-key-6666', prompt: '任務段', materials: [pdf] }))).ok);
  const body = JSON.parse(openrouter.requests[0].body ?? '{}') as Record<string, unknown>;
  assert.equal('max_tokens' in body || 'max_completion_tokens' in body, false);
});

void test('碰到上限就接著要：沒寫完的最後一行拿掉，第二次送同一份提示加上收到的那一段，接好的整段和一次交完的相同', async () => {
  const { fetch, result } = send([gemini(HEAD + '<<<卡', 'MAX_TOKENS', 'gem-1'), gemini(TAIL, 'STOP', 'gem-2')]);
  const sent = await result;
  assert.ok(sent.ok, JSON.stringify(sent));
  assert.equal(sent.result.text, WHOLE);
  assert.equal(fetch.requests.length, 2);
  const [first, second] = [turns(fetch.requests[0].body), turns(fetch.requests[1].body)];
  assert.equal(first.length, 1);
  assert.deepEqual(second.slice(0, 2), [first[0], { role: 'model', text: HEAD }]);
  assert.equal(second[2].role, 'user');
  // 要 AI 從哪裡接、不要再開程式碼區塊：寫出上一則的最後一行。
  assert.ok(second[2].text.endsWith('\n架構一'), second[2].text);
  assert.match(second[2].text, /不要再開/);
  assert.equal(maxOutput(fetch.requests[1].body), 65_536);
});

void test('接的地方：AI 又開了一次外層的程式碼區塊（前面可能有一句開場白）、重寫了上一則最後幾行，都拿掉', async () => {
  const again = send([gemini(HEAD, 'MAX_TOKENS'), gemini('````markdown\n' + TAIL, 'STOP')]);
  const sentAgain = await again.result;
  assert.ok(sentAgain.ok);
  assert.equal(sentAgain.result.text, WHOLE);
  const preface = send([gemini(HEAD, 'MAX_TOKENS'), gemini('好的，接著寫：\n\n````markdown\n' + TAIL, 'STOP')]);
  const sentPreface = await preface.result;
  assert.ok(sentPreface.ok);
  assert.equal(sentPreface.result.text, WHOLE);
  const repeated = send([gemini(HEAD, 'MAX_TOKENS'), gemini('<<<架構>>>\n架構一\n' + TAIL, 'STOP')]);
  const sentRepeated = await repeated.result;
  assert.ok(sentRepeated.ok);
  assert.equal(sentRepeated.result.text, WHOLE);
  // 沒有重複的不動：下一段剛好以空行開頭也照留。
  const blank = send([gemini(HEAD.slice(0, -1), 'MAX_TOKENS'), gemini('\n\n' + TAIL, 'STOP')]);
  const sentBlank = await blank.result;
  assert.ok(sentBlank.ok);
  assert.equal(sentBlank.result.text, HEAD.slice(0, HEAD.lastIndexOf('\n', HEAD.length - 2) + 1) + '\n\n' + TAIL);
});

void test('接著要最多再要 2 次：三次都碰到上限就照截斷失敗，帶著接好的那一段；可能已經計費', async () => {
  const { fetch, result } = send([gemini('````markdown\n一\n', 'MAX_TOKENS'), gemini('二\n', 'MAX_TOKENS'), gemini('三\n', 'MAX_TOKENS'), gemini('四\n', 'STOP')]);
  const sent = await result;
  assert.ok(!sent.ok);
  assert.equal(fetch.requests.length, 3);
  assert.deepEqual([sent.failure.kind, sent.failure.text, sent.failure.next, sent.failure.afterResponse], ['length', '回答太長，接著要了 2 次還是沒寫完。', '切成小一點的檔再送。', true]);
  assert.equal(sent.partial, '````markdown\n一\n二\n三\n');
  assert.equal(sent.result?.text, '````markdown\n一\n二\n三\n');
});

void test('還沒寫出內容就碰到上限（只想、沒寫，或只開了程式碼區塊）：不接著要，請家長調低推理等級，有「打開設定頁」', async () => {
  for (const text of ['', '````markdown\n', '````markdown\n\n第一行還沒寫完']) {
    const { fetch, result } = send([gemini(text, 'MAX_TOKENS'), gemini(TAIL, 'STOP')]);
    const sent = await result;
    assert.ok(!sent.ok, text);
    assert.equal(fetch.requests.length, 1, text);
    assert.deepEqual([sent.failure.kind, sent.failure.text, sent.failure.next, sent.failure.settings, sent.failure.afterResponse],
      ['length', 'AI 還沒寫出內容，就用完了一次回覆的上限（多半是想太久）。', '到設定頁把推理等級調低一級再送，或切成小一點的檔。', true, true], text);
  }
});

void test('接著要的那一次送不成：照那一種錯的一句話，一律標可能已經計費（前一段已經收到）；取消也是', async () => {
  const error: MockReply = { status: 503, headers: { 'content-type': 'application/json', 'retry-after': '0' }, chunks: [JSON.stringify({ error: { code: 503, message: 'overloaded', status: 'UNAVAILABLE' } })] };
  const busy = await send([gemini(HEAD, 'MAX_TOKENS'), error]).result;
  assert.ok(!busy.ok);
  assert.deepEqual([busy.failure.kind, busy.failure.text, busy.failure.afterResponse], ['overloaded', 'AI 那邊太忙或出錯，送了 3 次都沒成功。', true]);
  assert.equal(busy.partial, HEAD);
  const controller = new AbortController();
  const slow = send([gemini(HEAD, 'MAX_TOKENS'), { ...gemini(TAIL, 'STOP'), headersDelayMs: 5_000 }], {
    signal: controller.signal, onProgress: event => { if (event.type === 'continuing') controller.abort(); },
  });
  const cancelled = await slow.result;
  assert.ok(!cancelled.ok);
  assert.deepEqual([cancelled.failure.kind, cancelled.failure.afterResponse], ['cancelled', true]);
});

void test('進度：接著要時先報第幾段，收到的字數接著前一段算', async () => {
  const events: DirectProgress[] = [];
  const sent = await send([gemini(HEAD + '<<<卡', 'MAX_TOKENS'), gemini(TAIL, 'STOP')], { onProgress: event => { events.push(event); } }).result;
  assert.ok(sent.ok);
  const at = events.findIndex(event => event.type === 'continuing');
  assert.deepEqual(events[at], { type: 'continuing', part: 2 });
  const chars = events.flatMap(event => event.type === 'text' ? [event.totalChars] : []);
  assert.equal(chars.at(-1), HEAD.length + TAIL.length);
  assert.ok(events.slice(at).filter(event => event.type === 'text').every(event => event.type === 'text' && event.totalChars > HEAD.length - 1));
});

void test('接好的那一份的證據：用量與費用是每一段加起來，回應編號照順序寫；有一段沒回報的用量不寫', async () => {
  const sent = await send([
    gemini(HEAD, 'MAX_TOKENS', 'gem-1', { promptTokenCount: 18_000, candidatesTokenCount: 60_000 }),
    gemini(TAIL, 'STOP', 'gem-2', { promptTokenCount: 30_000, candidatesTokenCount: 5_000, cachedContentTokenCount: 10_000 }),
  ]).result;
  assert.ok(sent.ok);
  const now = { ms: Date.parse('2026-11-07T10:02:11+08:00'), offset: 480 };
  const evidence = evidenceOf(sent.result, 'Gemini', [], null, now);
  assert.deepEqual([evidence.usage.input, evidence.usage.output, evidence.usage.cacheRead], [48_000, 65_000, null]);
  assert.equal(evidence.responseId, 'gem-1 gem-2');
  assert.equal(evidence.model, 'gemini-3.8-flash-001');
  assert.equal(evidence.text, WHOLE);
  // 費用照牌價算、和 token 數成正比：兩段加起來，等於一次用掉同樣多 token 的費用（第二段的快取讀取照 cachedInput 的價格另算）。
  const single = await send([gemini(WHOLE, 'STOP', 'gem-3', { promptTokenCount: 38_000, candidatesTokenCount: 65_000 })]).result;
  const cached = await send([gemini(WHOLE, 'STOP', 'gem-4', { promptTokenCount: 10_000, candidatesTokenCount: 0, cachedContentTokenCount: 10_000 })]).result;
  assert.ok(single.ok && cached.ok && single.result.cost && cached.result.cost && evidence.cost);
  assert.equal(evidence.cost.estimated, true);
  assert.equal(Number(evidence.cost.amount.toPrecision(10)), Number((single.result.cost.amount + cached.result.cost.amount).toPrecision(10)));
});

void test('製卡的整條路：接好的回覆和一次交完的存出相同的卡組；快照的用量是兩段加起來', async t => {
  const whole = await load(t, [ok(reply)]);
  const once = await whole.cards.direct(form, [lesson]);
  assert.ok(once.kind === 'received');
  const cut = reply.indexOf('- 能用');
  const parts = await load(t, [ok(reply.slice(0, cut + 3), 'MAX_TOKENS'), ok(reply.slice(cut))]);
  const twice = await parts.cards.direct(form, [lesson]);
  assert.ok(twice.kind === 'received', JSON.stringify(twice));
  assert.equal(twice.reply, reply);
  assert.equal(parts.fetch.requests.length, 2);
  for (const made of [{ flow: whole, outcome: once }, { flow: parts, outcome: twice }]) {
    assert.equal((await made.flow.cards.save(made.outcome.job, made.outcome.reply, null, undefined, true)).kind, 'done');
  }
  const decks = (flow: typeof whole) => [...flow.memory.texts].filter(([path]) => path.includes('/學業/') && !path.includes('L1')).map(([path, text]) => [path, text]);
  assert.deepEqual(decks(parts), decks(whole));
  const { props } = propsOf(parts.memory);
  assert.deepEqual([props['輸入用量'], props['輸出用量'], props['回應編號']], [36_000, 8_000, 'gem-1 gem-1']);
});
