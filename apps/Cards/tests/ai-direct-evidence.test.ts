// 直接製作的快照證據的邊界例子（tasks/ai-direct.md §7、格式查核 F19；L2 第一輪 R7 要補的）：服務沒回報的欄不寫、編號與檔名寫成單行、
// 照片照送出的順序、重送成功寫重送那一次、收到 CRLF 的回覆。走真的製卡流程（tests/helpers/ai-direct.ts）與套件的假 fetch。
import test from 'node:test';
import type { TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { sse } from '../../../packages/ai-client/src/testing.ts';
import type { MockReply } from '../../../packages/ai-client/src/testing.ts';
import { sha256Hex, sha256OfBytes } from '../src/core/ai/index.ts';
import type { Material } from '../src/core/connect/index.ts';
import { form, lesson, load, ok, propsOf, reply, sent, unauthorized } from './helpers/ai-direct.ts';

const USAGE = ['輸入用量', '快取讀取用量', '快取寫入用量', '輸出用量', '推理用量'];
/** 只有整段文字的 Gemini 串流：沒有用量、模型與回應編號。 */
const bare = (text: string): MockReply => ({
  status: 200, headers: { 'content-type': 'text/event-stream' },
  chunks: [sse([{ data: { candidates: [{ content: { parts: [{ text }], role: 'model' }, finishReason: 'STOP' }] } }])],
});
/** 直接製作、收到、存成草稿，交回快照的屬性區。 */
async function saved(t: TestContext, replies: MockReply[], materials: readonly Material[] = [lesson], options: Parameters<typeof load>[2] = {}) {
  const made = await load(t, replies, options);
  const outcome = await made.cards.direct(form, materials);
  assert.ok(outcome.kind === 'received', JSON.stringify(outcome));
  assert.equal((await made.cards.save(outcome.job, outcome.reply, null, undefined, true)).kind, 'done');
  return { made, ...propsOf(made.memory) };
}

void test('§7 服務什麼都沒回報（用量、模型、編號）：用量、費用與編號都不寫，不寫 0；模型寫「未回報」；程式知道的照寫', async t => {
  const { props } = await saved(t, [bare(reply)]);
  assert.deepEqual([props['接法'], props['服務'], props['要求的模型'], props['模型'], props['推理等級']], ['API', 'Gemini', 'gemini-3.8-flash', '未回報', '未指定']);
  for (const key of [...USAGE, '費用', '費用來源', '牌價日期', '請求編號', '回應編號']) assert.equal(key in props, false, key);
  assert.ok('送出時間' in props && '收到時間' in props);
});

void test('§7 只有請求編號、回應編號很長又有換行：各寫各的；寫成單行、最多 200 字，屬性區讀得回來', async t => {
  const requestId = 'r'.repeat(2_000);
  const router: MockReply = {
    status: 200, headers: { 'content-type': 'application/json', 'x-request-id': requestId },
    chunks: [JSON.stringify({ model: 'openai/gpt-5.6-terra', choices: [{ message: { content: reply }, finish_reason: 'stop' }], usage: { prompt_tokens: 900, completion_tokens: 300 } })],
  };
  const only = await saved(t, [router], [lesson], { provider: 'openrouter', model: 'openai/gpt-5.6-terra' });
  assert.equal(only.props['請求編號'], 'r'.repeat(200));
  assert.equal('回應編號' in only.props, false);
  const long = { ...router, headers: { 'content-type': 'application/json' }, chunks: [JSON.stringify({ id: `gen-1\n請求: 偽造\n${'g'.repeat(2_000)}`, model: 'openai/gpt-5.6-terra', choices: [{ message: { content: reply }, finish_reason: 'stop' }] })] };
  const odd = await saved(t, [long], [lesson], { provider: 'openrouter', model: 'openai/gpt-5.6-terra' });
  const id = odd.props['回應編號'];
  assert.ok(typeof id === 'string' && !id.includes('\n') && Array.from(id).length === 200 && id.startsWith('gen-1 請求: 偽造 '), String(id));
  assert.equal('請求編號' in odd.props, false);
  assert.equal('請求' in odd.props, false, '換行沒有變成另一個屬性');
});

void test('§7 教材檔：檔名有全形空白、以「12頁」結尾，照片好幾張；照送出的順序一檔一項，前兩段沒有空白，檔名是第三段到行尾', async t => {
  const bytes = (n: number): Uint8Array => new Uint8Array([n, n + 1, n + 2]);
  const photo = (name: string, n: number, mediaType: Material['mediaType'] = 'image/png'): Material => ({ name, mediaType, data: bytes(n), pages: null, sha256: sha256OfBytes(bytes(n)) });
  const pdf: Material = { ...lesson, name: '英文　L3 12頁.pdf' };
  const materials = [pdf, photo('p.40　上.png', 10), photo('IMG_0012.jpg', 20, 'image/jpeg'), photo('p.41.png', 30)];
  const { made, props } = await saved(t, [ok(reply)], materials);
  const items = props['教材檔'];
  assert.deepEqual(items, [
    `${lesson.sha256} 12頁 英文　L3 12頁.pdf`,
    `${sha256OfBytes(bytes(10))} 圖 p.40　上.png`,
    `${sha256OfBytes(bytes(20))} 圖 IMG_0012.jpg`,
    `${sha256OfBytes(bytes(30))} 圖 p.41.png`,
  ]);
  const names = items.map(item => { const [hash, kind] = item.split(' ', 2); return item.slice(hash.length + kind.length + 2); });
  assert.deepEqual(names, materials.map(material => material.name));
  // 送出的順序和快照一樣：PDF、照片照選的順序。
  assert.deepEqual(sent(made.fetch.requests[0].body).files, ['application/pdf', 'image/png', 'image/jpeg', 'image/png']);
});

void test('§6、§7 送不成之後重送成功：快照的證據是重送那一次（模型、回應編號、用量），教材檔照舊', async t => {
  const second: MockReply = {
    status: 200, headers: { 'content-type': 'text/event-stream' },
    chunks: [sse([
      { data: { candidates: [{ content: { parts: [{ text: reply }], role: 'model' } }], modelVersion: 'gemini-3.8-flash-002', responseId: 'gem-2' } },
      { data: { candidates: [{ content: { parts: [], role: 'model' }, finishReason: 'STOP' }], usageMetadata: { promptTokenCount: 17_000, candidatesTokenCount: 3_000, totalTokenCount: 20_000 } } },
    ])],
  };
  const made = await load(t, [unauthorized, second]);
  const failed = await made.cards.direct(form, [lesson]);
  assert.equal(failed.kind, 'failed');
  const again = await made.cards.resend(failed.job);
  assert.ok(again.kind === 'received', JSON.stringify(again));
  assert.equal((await made.cards.save(again.job, again.reply, null, undefined, true)).kind, 'done');
  const { props } = propsOf(made.memory);
  assert.deepEqual([props['模型'], props['回應編號'], props['輸入用量'], props['輸出用量']], ['gemini-3.8-flash-002', 'gem-2', 17_000, 3_000]);
  assert.deepEqual(props['教材檔'], [`${lesson.sha256} 12頁 英文 L3.pdf`]);
  assert.equal(made.fetch.requests.length, 2);
});

void test('§7 收到的回覆是 CRLF：輸入框交回的是換成 LF 的那一段（textarea 會換）；回覆原文是它、收到的回覆是收到的那一段，兩段都存進原文，卡組沒有 CR', async t => {
  const crlf = reply.replace(/\n/g, '\r\n');
  const made = await load(t, [ok(crlf)]);
  const outcome = await made.cards.direct(form, [lesson]);
  assert.ok(outcome.kind === 'received');
  assert.equal(outcome.reply, crlf, '收到的整段照原樣交給畫面');
  // 瀏覽器的 textarea 把 \r\n 換成 \n（HTML 規格的 API value）：存草稿拿到的是換過的。
  assert.equal((await made.cards.save(outcome.job, reply, null, undefined, true)).kind, 'done');
  const { props } = propsOf(made.memory);
  assert.equal(props['回覆原文'], sha256Hex(reply));
  assert.equal(props['收到的回覆'], sha256Hex(crlf));
  const originals = [...made.memory.texts].filter(([path]) => path.startsWith('Essence Cards/紀錄/AI 輸出/原文/'));
  assert.ok(originals.some(([, text]) => text === crlf) && originals.some(([, text]) => text === reply), originals.map(([path]) => path).join('|'));
  const decks = [...made.memory.texts].filter(([path]) => path.startsWith('Essence Cards/學業/國二上/英文/國二上英文 L3'));
  assert.equal(decks.length, 2);
  for (const [path, text] of decks) assert.equal(text.includes('\r'), false, path);
});
