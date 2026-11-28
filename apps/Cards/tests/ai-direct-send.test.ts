// 直接製作的送出（apps/Cards/docs/tasks/ai-direct.md §4～§6，src/core/connect/direct.ts）：教材的檢查、這一家的上限、組請求、
// 送出前的一行、用量的一行，與每一種送不成給家長看的一句話。假的 fetch，不連網。
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mockFetch, sse } from '../../../packages/ai-client/src/testing.ts';
import type { MockReply } from '../../../packages/ai-client/src/testing.ts';
import { cardsClient, directRequest, materialProblem, materialType, providerProblem, readConnection, sendDirect, sendingLine, usageLine } from '../src/core/connect/index.ts';
import type { Material, ProviderSpec } from '../src/core/connect/index.ts';

const FAKE_KEY = 'AIzaSy-cards-direct-test-2222';
const providers = cardsClient().providers();
const provider = (id: string): ProviderSpec => { const found = providers.find(p => p.id === id); assert.ok(found, id); return found; };
const pdf = (pages: number | null, name = '英文 L3.pdf', bytes = 10): Material => ({ name, mediaType: 'application/pdf', data: new Uint8Array(bytes).fill(1), pages, sha256: 'a'.repeat(64) });
const photo = (name = 'p40.jpg', bytes = 10): Material => ({ name, mediaType: 'image/jpeg', data: new Uint8Array(bytes).fill(2), pages: null, sha256: 'b'.repeat(64) });
const google = readConnection({ provider: 'google', models: { google: 'gemini-3.8-flash' }, reasoning: 'default', secrets: { google: 'my-key' } }, providers);

void test('§5 教材的種類：只收 PDF、JPG、PNG（副檔名不分大小寫），其他與沒有副檔名的不收', () => {
  assert.deepEqual(['a.pdf', 'B.PDF', 'c.jpg', 'd.JPEG', 'e.png', 'f.heic', 'g.docx', 'noext', 'h.pdf.txt'].map(materialType),
    ['application/pdf', 'application/pdf', 'image/jpeg', 'image/jpeg', 'image/png', null, null, null, null]);
});

void test('§5 教材能不能送：沒選、空檔、讀不出頁數、超過 30 頁、超過 10 張照片各一句；剛好 30 頁、10 張照片可以送', () => {
  assert.equal(materialProblem([]), '先選這一課的教材檔（PDF 或照片）。');
  assert.equal(materialProblem([pdf(3, 'a.pdf', 0)]), '「a.pdf」是空的檔，請重新選。');
  assert.equal(materialProblem([pdf(null, '加密.pdf')]), '「加密.pdf」讀不出頁數（可能加密或壞掉），請改用照片，或改用複製提示。');
  assert.equal(materialProblem([pdf(31)]), 'PDF 一共 31 頁，一次最多 30 頁；請先切出這一課的頁面，或分兩次做。');
  // 好幾個 PDF 的頁數加起來算（施工時補：PDF 與照片可以一起送，各自算上限）。
  assert.equal(materialProblem([pdf(20, 'a.pdf'), pdf(11, 'b.pdf')]), 'PDF 一共 31 頁，一次最多 30 頁；請先切出這一課的頁面，或分兩次做。');
  assert.equal(materialProblem(Array.from({ length: 11 }, (_, i) => photo(`${String(i)}.jpg`))), '照片一次最多 10 張，這次選了 11 張；請分兩次做。');
  assert.equal(materialProblem([pdf(30)]), null);
  assert.equal(materialProblem([pdf(30), ...Array.from({ length: 10 }, (_, i) => photo(`${String(i)}.jpg`))]), null);
});

void test('§4 這一家收不收得下：模型不收 PDF 或照片、超過頁數、檔案或整個請求太大時擋；目錄沒寫上限的不擋', () => {
  const spec: ProviderSpec = {
    id: 'x', label: 'X', dialect: 'openai-chat', baseUrl: 'https://x.example/v1', auth: { header: 'Authorization', scheme: 'Bearer' },
    limits: { maxPdfPages: 20, maxFileBytes: 1_000, maxRequestBytes: 5_000 },
    models: [{ id: 'text-only', inputs: ['text'] }, { id: 'no-image', inputs: ['text', 'pdf'] }, { id: 'all', inputs: ['text', 'image', 'pdf'] }],
  };
  assert.equal(providerProblem(spec, 'text-only', [pdf(3)], 100), '這個模型不收 PDF；請到設定頁換一個模型，或改用照片。');
  assert.equal(providerProblem(spec, 'no-image', [photo()], 100), '這個模型不收照片；請到設定頁換一個模型，或改用 PDF。');
  assert.equal(providerProblem(spec, 'all', [pdf(21)], 100), '這一家一次最多 20 頁，請切成小一點的檔。');
  assert.equal(providerProblem(spec, 'all', [pdf(20, 'a.pdf', 1_001)], 100), '這一家一次收不下這麼大的檔（最多約 0 MB），請切成小一點的檔，或把照片拍小一點。');
  // 1,000 位元組的檔 base64 後 1,336，加上 1,300 字 × 3 = 3,900，超過 5,000。
  assert.match(providerProblem(spec, 'all', [pdf(20, 'a.pdf', 1_000)], 1_300) ?? '', /收不下/);
  assert.equal(providerProblem(spec, 'all', [pdf(20, 'a.pdf', 1_000)], 1_000), null);
  // 目錄沒寫這個模型收什麼（自己填的模型、OpenRouter）：不擋。
  assert.equal(providerProblem(spec, 'unlisted', [pdf(3), photo()], 100), null);
  assert.equal(providerProblem(provider('openrouter'), 'google/gemini-3.8-flash', [pdf(30, 'a.pdf', 40_000_000)], 20_000), null);
  // OpenAI 寫了檔案合計 50 MiB：剛好不超過可以送、多一個位元組擋。
  assert.equal(providerProblem(provider('openai'), 'gpt-5.6-terra', [pdf(30, 'a.pdf', 52_428_800)], 20_000), null);
  assert.match(providerProblem(provider('openai'), 'gpt-5.6-terra', [pdf(30, 'a.pdf', 52_428_801)], 20_000) ?? '', /最多約 52 MB/);
});

void test('§4 送出的請求：教材在提示前面、提示一字不改；PDF 帶代稱的檔名與頁數；推理等級「照服務的預設」不送；不寫輸出上限（照套件目錄的模型，tasks/ai-direct-continue.md）', () => {
  const prompt = '# 通用\n\n# 英文\n\n任務段';
  const materials = [pdf(12), photo('p41.png'), pdf(null, '小明 英文 L4.pdf')];
  const request = directRequest({ connection: google, provider: provider('google'), apiKey: FAKE_KEY, prompt, materials });
  assert.equal(request.model, 'gemini-3.8-flash');
  assert.equal('maxOutputTokens' in request, false);
  assert.equal('reasoning' in request, false);
  assert.deepEqual(request.endpoint, { provider: 'google' });
  const content = request.input[0].content;
  assert.ok(Array.isArray(content));
  assert.deepEqual(content.map(part => part.type), ['file', 'image', 'file', 'text']);
  // 格式查核 F16：送給服務的檔名一律是代稱，照送出的順序編號。
  assert.deepEqual(content[0], { type: 'file', mediaType: 'application/pdf', data: materials[0].data, name: 'material-1.pdf', pages: 12 });
  assert.deepEqual(content[1], { type: 'image', mediaType: 'image/jpeg', data: materials[1].data });
  assert.deepEqual(content[2], { type: 'file', mediaType: 'application/pdf', data: materials[2].data, name: 'material-2.pdf' });
  assert.deepEqual(content[3], { type: 'text', text: prompt });
  const high = directRequest({ connection: { ...google, reasoning: 'high' }, provider: provider('google'), apiKey: FAKE_KEY, prompt, materials });
  assert.equal(high.reasoning, 'high');
});

void test('§4 送出前的一行：教材、字數、模型與估計的費用；目錄沒有價格的模型寫「不知道這個模型的價格」', () => {
  const client = cardsClient();
  const prompt = '字'.repeat(20_000);
  const request = directRequest({ connection: google, provider: provider('google'), apiKey: FAKE_KEY, prompt, materials: [pdf(12)] });
  const line = sendingLine(client, provider('google'), request, [pdf(12)], prompt.length);
  assert.match(line, /^會送出：英文 L3\.pdf（12 頁）、規則與任務段約 2 萬字；送到 Gemini（Gemini 3\.8 Flash），約 US\$[\d.]+～[\d.]+（照牌價估計，不含免費額度）$/);
  const [low, high] = /US\$([\d.]+)～([\d.]+)/.exec(line)!.slice(1).map(Number);
  assert.ok(low > 0 && low < high, line);
  const photos = [photo('a.jpg'), photo('b.jpg')];
  const router = readConnection({ provider: 'openrouter', models: { openrouter: 'some/model' } }, providers);
  const unpriced = directRequest({ connection: router, provider: provider('openrouter'), apiKey: FAKE_KEY, prompt: '短', materials: photos });
  assert.equal(sendingLine(client, provider('openrouter'), unpriced, photos, 1_240), '會送出：照片 2 張、規則與任務段約 1,240 字；送到 OpenRouter（some/model），不知道這個模型的價格');
});

void test('§4 收完的一行：用量寫成萬、千，費用分照牌價估計與服務回報；服務沒回報用量時照實寫', () => {
  const usage = { input: 18_000, output: 4_000, cacheRead: null, cacheWrite: null, reasoning: null };
  assert.equal(usageLine({ usage, cost: { amount: 0.0121, estimated: true, asOf: '2026-11-20' } }), '這次用了輸入 1.8 萬、輸出 4 千 token，約 US$0.012（照牌價估計）');
  // 進位到 10 千的寫成萬（L2 第一輪的文字小項）。
  assert.deepEqual([999, 1_000, 9_949, 9_950, 9_960, 9_999, 10_000, 99_960].map(input => usageLine({ usage: { ...usage, input, output: null }, cost: null })),
    ['這次用了輸入 999 token', '這次用了輸入 1 千 token', '這次用了輸入 9.9 千 token', '這次用了輸入 9.9 千 token', '這次用了輸入 1 萬 token', '這次用了輸入 1 萬 token', '這次用了輸入 1 萬 token', '這次用了輸入 10 萬 token']);
  assert.equal(usageLine({ usage: { ...usage, input: 850, output: 12_345 }, cost: { amount: 0.0019, estimated: false, asOf: null } }), '這次用了輸入 850、輸出 1.2 萬 token，約 US$0.0019（服務回報）');
  assert.equal(usageLine({ usage: { ...usage, input: null, output: null }, cost: null }), '服務沒有回報用量');
  assert.equal(usageLine({ usage: { ...usage, input: null }, cost: { amount: 0, estimated: false, asOf: null } }), '這次用了輸出 4 千 token，約 US$0（服務回報）');
});

const geminiEvents = (text: string, finishReason: string): MockReply => ({
  status: 200, headers: { 'content-type': 'text/event-stream' },
  chunks: [sse([
    { data: { candidates: [{ content: { parts: [{ text }], role: 'model' } }], modelVersion: 'gemini-3.8-flash-001', responseId: 'gem-1' } },
    { data: { candidates: [{ content: { parts: [], role: 'model' }, finishReason }], usageMetadata: { promptTokenCount: 18_000, candidatesTokenCount: 4_000, totalTokenCount: 22_000 } } },
  ])],
});
const send = (reply: MockReply | MockReply[], extra: { signal?: AbortSignal; maxAttempts?: number; timeoutMs?: number } = {}) => {
  const fetch = mockFetch(Array.isArray(reply) ? reply : [reply]);
  const request = { ...directRequest({ connection: google, provider: provider('google'), apiKey: FAKE_KEY, prompt: '任務段', materials: [pdf(3)] }), ...extra };
  return { fetch, result: sendDirect(cardsClient(fetch), request) };
};

void test('§4 送出成功：拿回整段、用量與模型；請求裡有教材與提示，金鑰只在標頭', async () => {
  const { fetch, result } = send(geminiEvents('國二上英文 L3 單字\n<<<完>>>', 'STOP'));
  const sent = await result;
  assert.ok(sent.ok);
  assert.equal(sent.result.text, '國二上英文 L3 單字\n<<<完>>>');
  assert.equal(sent.result.trace.resolvedModel, 'gemini-3.8-flash-001');
  assert.equal(sent.result.usage.inputTokens, 18_000);
  assert.equal(fetch.requests.length, 1);
  assert.ok(!fetch.requests[0].url.includes(FAKE_KEY));
  assert.ok(fetch.requests[0].body?.includes('任務段'));
  assert.ok(fetch.requests[0].body?.includes('application/pdf'));
});

void test('§6 收到了但沒有正常結束：截斷、被擋、空的各一句，都帶著收到的那一份', async () => {
  // 還沒寫完一行就截斷：沒有可以接著要的（接著要的例子在 tests/ai-direct-continue.test.ts）。
  const cut = await send(geminiEvents('國二上英文 L3 單字', 'MAX_TOKENS')).result;
  assert.ok(!cut.ok);
  assert.deepEqual([cut.failure.kind, cut.failure.text, cut.failure.next], ['length', 'AI 還沒寫出內容，就用完了一次回覆的上限（多半是想太久）。', '到設定頁把推理等級調低一級再送，或切成小一點的檔。']);
  assert.equal(cut.result?.text, '國二上英文 L3 單字');
  const filtered = await send(geminiEvents('一半', 'SAFETY')).result;
  assert.ok(!filtered.ok);
  assert.deepEqual([filtered.failure.kind, filtered.failure.text], ['content_filter', 'AI 拒絕回答這份教材。']);
  const empty = await send(geminiEvents('  ', 'STOP')).result;
  assert.ok(!empty.ok);
  assert.deepEqual([empty.failure.kind, empty.failure.text], ['empty', 'AI 回了空的內容。']);
  // 服務已經回完了才知道不成功：都可能已經計費，重送的按鈕要寫出來（L2 第一輪 R6）。
  assert.deepEqual([cut.failure.afterResponse, filtered.failure.afterResponse, empty.failure.afterResponse], [true, true, true]);
});

void test('§6 逾時：整體逾時與等不到標頭都是同一句，不寫死等了幾分鐘（L2 第一輪 R6）', async () => {
  const late = await send({ ...geminiEvents('國二上英文 L3 單字\n<<<完>>>', 'STOP'), headersDelayMs: 300 }, { timeoutMs: 50, maxAttempts: 1 }).result;
  assert.ok(!late.ok);
  assert.deepEqual([late.failure.kind, late.failure.text, late.failure.afterResponse], ['timeout', '等太久還沒收完。', false]);
});

void test('§6 套件丟的錯：金鑰錯（到設定頁）、額度、太頻繁、服務忙（寫送了幾次）、連不上、拿到回應後才斷（可能已經計費）、取消', async () => {
  const error = (status: number, body: unknown, headers: Record<string, string> = {}): MockReply => ({ status, headers: { 'content-type': 'application/json', ...headers }, chunks: [JSON.stringify(body)] });
  const auth = await send(error(400, { error: { code: 400, message: 'API key not valid', status: 'INVALID_ARGUMENT', details: [{ reason: 'API_KEY_INVALID' }] } })).result;
  assert.ok(!auth.ok);
  assert.deepEqual([auth.failure.kind, auth.failure.text, auth.failure.next, auth.failure.settings], ['auth', '金鑰不對，或這把金鑰不能用這個模型。', '到設定頁的「AI 連線」重貼金鑰，按「測試連線」。', true]);
  assert.equal(JSON.stringify(auth).includes(FAKE_KEY), false);
  const quota = await send(error(429, { error: { code: 429, message: 'quota', status: 'RESOURCE_EXHAUSTED', details: [{ reason: 'RATE_LIMIT_EXCEEDED' }] } }, { 'retry-after': '0' }), { maxAttempts: 1 }).result;
  assert.ok(!quota.ok);
  assert.ok(['quota', 'rate_limit'].includes(quota.failure.kind), quota.failure.kind);
  const busy = await send([error(503, { error: { code: 503, message: 'overloaded', status: 'UNAVAILABLE' } }, { 'retry-after': '0' })]).result;
  assert.ok(!busy.ok);
  assert.deepEqual([busy.failure.kind, busy.failure.text], ['overloaded', 'AI 那邊太忙或出錯，送了 3 次都沒成功。']);
  const offline = await send({ networkError: 'getaddrinfo ENOTFOUND' }, { maxAttempts: 1 }).result;
  assert.ok(!offline.ok);
  assert.deepEqual([offline.failure.kind, offline.failure.text, offline.failure.afterResponse], ['network', '連不上，請確認網路。', false]);
  const dropped = await send({ ...geminiEvents('一半', 'STOP'), dropAfter: 0 }).result;
  assert.ok(!dropped.ok);
  assert.deepEqual([dropped.failure.text, dropped.failure.afterResponse], ['收到一部分就斷了；這一次可能已經計費。', true]);
  const controller = new AbortController();
  const slow = send({ ...geminiEvents('慢', 'STOP'), headersDelayMs: 5_000 }, { signal: controller.signal });
  controller.abort();
  const cancelled = await slow.result;
  assert.ok(!cancelled.ok);
  assert.deepEqual([cancelled.failure.kind, cancelled.failure.text], ['cancelled', '已取消；如果 AI 已經開始做，這一次可能仍會計費。']);
});

void test('L2 第二輪 S4 拿到回應之後才取消、服務回了 200 卻完全沒有輸出（被擋）：照自己的一句話，標 afterResponse（可能已經計費）；還沒拿到回應就取消的不標', async () => {
  const controller = new AbortController();
  const streaming = send({ ...geminiEvents('國二上英文 L3 單字', 'STOP'), delayMs: 5_000 }, { signal: controller.signal });
  await new Promise(resolve => setTimeout(resolve, 30));
  controller.abort();
  const cancelled = await streaming.result;
  assert.ok(!cancelled.ok);
  assert.deepEqual([cancelled.failure.kind, cancelled.failure.text, cancelled.failure.afterResponse], ['cancelled', '已取消；如果 AI 已經開始做，這一次可能仍會計費。', true]);
  const blocked: MockReply = {
    status: 200, headers: { 'content-type': 'text/event-stream' },
    chunks: [sse([{ data: { promptFeedback: { blockReason: 'SAFETY' }, usageMetadata: { promptTokenCount: 18_000, totalTokenCount: 18_000 } } }])],
  };
  const refused = await send(blocked).result;
  assert.ok(!refused.ok);
  assert.deepEqual([refused.failure.kind, refused.failure.text, refused.failure.afterResponse], ['content_blocked', 'AI 拒絕回答這份教材。', true]);
  const early = new AbortController();
  const waiting = send({ ...geminiEvents('慢', 'STOP'), headersDelayMs: 5_000 }, { signal: early.signal });
  early.abort();
  const before = await waiting.result;
  assert.ok(!before.ok);
  assert.deepEqual([before.failure.kind, before.failure.afterResponse], ['cancelled', false]);
});
