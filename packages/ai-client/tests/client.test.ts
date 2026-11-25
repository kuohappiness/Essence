// client 的共同行為（docs/tasks/ai-client.md〈7〉）：送出前的檢查、推理對應、逾時、重試、進度、金鑰與費用。
// 各家格式的部分在 conformance.test.ts；這裡用 openai-responses 的範例當代表。
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createAiClient, isAiError, type AiError, type GenerateRequest, type ProgressEvent } from '../src/index.ts';
import { mockFetch, sse, type MockReply } from '../src/testing.ts';
import { KEY, instantClock, loadCases, readSse } from './helpers.ts';

const openai = loadCases().find(c => c.dialect === 'openai-responses')!;
const OK: MockReply = { status: 200, headers: { 'content-type': 'text/event-stream' }, chunks: [readSse(openai, openai.stream.file)] };
const PDF = new TextEncoder().encode('%PDF-1.4');

const request = (extra: Partial<GenerateRequest> = {}): GenerateRequest => ({
  endpoint: { provider: 'openai' }, apiKey: KEY, model: 'gpt-5.6-terra', input: [{ role: 'user', content: '你好' }], ...extra,
});

async function rejects(promise: Promise<unknown>): Promise<AiError> {
  try {
    await promise;
  } catch (error) {
    assert.ok(isAiError(error), String(error));
    return error;
  }
  assert.fail('應該失敗');
}

const bodyOf = (fetch: ReturnType<typeof mockFetch>, i = 0) => JSON.parse(fetch.requests[i].body ?? '') as Record<string, unknown>;

void test('網址只准 https 或本機的 http；帳密與假的 localhost 都擋', async () => {
  const fetch = mockFetch([OK]);
  const client = createAiClient({ fetch, clock: instantClock() });
  const custom = (baseUrl: string) => client.generate(request({ endpoint: { custom: { dialect: 'openai-responses', baseUrl } } }));
  // 帶帳密的網址拆開寫：整串寫出來會被 secretlint 當成真的帳密。
  const withUserinfo = ['https://user', 'pass@api.example.com/v1'].join(':');
  for (const bad of ['http://api.example.com/v1', 'http://localhost.evil.com/v1', withUserinfo, 'ftp://localhost/v1']) {
    assert.equal((await rejects(custom(bad))).kind, 'invalid_request', bad);
  }
  assert.equal(fetch.requests.length, 0);
  await custom('http://localhost:11434/v1');
  await custom('http://127.0.0.1:1234/v1/');
  await custom('http://[::1]:8080/v1');
  assert.deepEqual(fetch.requests.map(r => r.url), [
    'http://localhost:11434/v1/responses', 'http://127.0.0.1:1234/v1/responses', 'http://[::1]:8080/v1/responses',
  ]);
});

void test('要金鑰卻沒給：不連網就丟 auth；自訂服務 auth: null 不帶金鑰', async () => {
  const fetch = mockFetch([OK]);
  const client = createAiClient({ fetch, clock: instantClock() });
  assert.equal((await rejects(client.generate(request({ apiKey: '' })))).kind, 'auth');
  assert.equal(fetch.requests.length, 0);
  const chat = loadCases().find(c => c.dialect === 'openai-chat')!;
  const local = mockFetch([{ status: 200, chunks: [readSse(chat, chat.stream.file)] }]);
  await createAiClient({ fetch: local, clock: instantClock() }).generate(request({ apiKey: undefined, endpoint: { custom: { dialect: 'openai-chat', baseUrl: 'http://localhost:11434/v1', auth: null } } }));
  assert.equal(local.requests[0].headers.authorization, undefined);
});

void test('模型在目錄裡又不收 PDF：不連網就丟 unsupported_input；checkInputs: false 照送', async () => {
  const fetch = mockFetch([OK]);
  const client = createAiClient({ fetch, clock: instantClock(), catalog: { providers: [{ id: 'openai', models: [{ id: 'text-only', inputs: ['text'] }] }] } });
  const withPdf = request({ model: 'text-only', input: [{ role: 'user', content: [{ type: 'file', mediaType: 'application/pdf', data: PDF }] }] });
  assert.equal((await rejects(client.generate(withPdf))).kind, 'unsupported_input');
  assert.equal(fetch.requests.length, 0);
  await client.generate({ ...withPdf, checkInputs: false });
  assert.equal(fetch.requests.length, 1);
});

void test('不是 PDF 的檔案、不是圖片的圖片：unsupported_input', async () => {
  const client = createAiClient({ fetch: mockFetch([OK]), clock: instantClock() });
  const docx = request({ input: [{ role: 'user', content: [{ type: 'file', mediaType: 'application/msword', data: PDF }] }] });
  assert.equal((await rejects(client.generate(docx))).kind, 'unsupported_input');
  const notImage = request({ input: [{ role: 'user', content: [{ type: 'image', mediaType: 'application/pdf', data: PDF }] }] });
  assert.equal((await rejects(client.generate(notImage))).kind, 'unsupported_input');
});

void test('檔案超過上限、頁數超過上限：不連網就丟 input_too_large，訊息寫上限', async () => {
  const fetch = mockFetch([OK]);
  const client = createAiClient({ fetch, clock: instantClock(), catalog: { providers: [{ id: 'openai', limits: { maxFileBytes: 4, maxPdfPages: 10 } }] } });
  const big = await rejects(client.generate(request({ input: [{ role: 'user', content: [{ type: 'file', mediaType: 'application/pdf', data: PDF }] }] })));
  assert.equal(big.kind, 'input_too_large');
  assert.match(big.message, /limit is 4/);
  const pages = await rejects(client.generate(request({ input: [{ role: 'user', content: [{ type: 'file', mediaType: 'application/pdf', data: PDF.subarray(0, 2), pages: 11 }] }] })));
  assert.equal(pages.kind, 'input_too_large');
  assert.equal(fetch.requests.length, 0);
});

void test('推理等級：沒有的用最接近的（一樣近取高的）並記 warning；沒有對應就不送', async () => {
  const cases: [string, string, GenerateRequest['reasoning'], string | null, number][] = [
    ['anthropic', 'claude-sonnet-5-5', 'off', 'low', 1],
    ['anthropic', 'claude-sonnet-5-5', 'minimal', 'low', 1],
    ['anthropic', 'claude-sonnet-5-5', 'xhigh', 'xhigh', 0],
    ['openrouter', 'any/model', 'xhigh', 'high', 1],
    ['openrouter', 'any/model', 'max', 'high', 1],
    ['google', 'gemini-3.8-flash', 'minimal', 'low', 1],
    ['google', 'gemini-3.5-flash-lite', 'off', 'minimal', 0],
    ['google', 'unknown-model', 'high', null, 1],
  ];
  for (const [provider, model, level, sent, warnings] of cases) {
    const reply = loadCases().find(c => c.endpoint && 'provider' in c.endpoint && c.endpoint.provider === provider)!;
    const fetch = mockFetch([{ status: 200, headers: reply.stream.headers, chunks: [readSse(reply, reply.stream.file)] }]);
    const result = await createAiClient({ fetch, clock: instantClock() }).generate(request({ endpoint: { provider }, model, reasoning: level }));
    assert.equal(result.trace.reasoningSent, sent, `${provider} ${model} ${level}`);
    assert.equal(result.trace.warnings.length, warnings, `${provider} ${model} ${level}: ${result.trace.warnings.join('; ')}`);
  }
});

void test('沒指定推理等級：不送、不記 warning', async () => {
  const fetch = mockFetch([OK]);
  const result = await createAiClient({ fetch, clock: instantClock() }).generate(request());
  assert.equal(result.trace.reasoningSent, null);
  assert.deepEqual(result.trace.warnings, []);
  assert.equal(bodyOf(fetch).reasoning, undefined);
});

void test('extraBody 深層合併、extraHeaders 加上去，但蓋不掉認證', async () => {
  const fetch = mockFetch([OK]);
  await createAiClient({ fetch, clock: instantClock() }).generate(request({
    reasoning: 'high',
    extraBody: { reasoning: { summary: 'auto' }, service_tier: 'flex' },
    extraHeaders: { 'X-Trace': 'abc', Authorization: 'Bearer stolen' },
  }));
  assert.deepEqual(bodyOf(fetch).reasoning, { effort: 'high', summary: 'auto' });
  assert.equal(bodyOf(fetch).service_tier, 'flex');
  assert.equal(fetch.requests[0].headers['x-trace'], 'abc');
  assert.equal(fetch.requests[0].headers.authorization, `Bearer ${KEY}`);
});

void test('extraBody 蓋掉推理參數：trace 記實際送出的值並記 warning（GitHub 審查 P2）', async () => {
  const fetch = mockFetch([OK, OK, OK]);
  const client = createAiClient({ fetch, clock: instantClock() });
  const overridden = await client.generate(request({ reasoning: 'high', extraBody: { reasoning: { effort: 'low' } } }));
  assert.deepEqual(bodyOf(fetch, 0).reasoning, { effort: 'low' });
  assert.equal(overridden.trace.reasoningSent, 'low');
  assert.ok(overridden.trace.warnings.some(w => /extraBody/.test(w)), overridden.trace.warnings.join(' / '));
  // 沒指定等級、只用 extraBody 送：一樣照實記。
  const onlyExtra = await client.generate(request({ extraBody: { reasoning: { effort: 'minimal' } } }));
  assert.equal(onlyExtra.trace.reasoningSent, 'minimal');
  // extraBody 沒碰推理參數：照原本的值，不記 warning。
  const untouched = await client.generate(request({ reasoning: 'high', extraBody: { service_tier: 'flex' } }));
  assert.equal(untouched.trace.reasoningSent, 'high');
  assert.ok(!untouched.trace.warnings.some(w => /extraBody/.test(w)));
});

void test('連不上：等 2 秒、8 秒重送，加減 20%', async () => {
  const fetch = mockFetch([{ networkError: 'ECONNRESET' }, { networkError: 'ECONNRESET' }, OK]);
  const clock = { ...instantClock(), random: () => 1 };
  const result = await createAiClient({ fetch, clock }).generate(request());
  assert.equal(result.text, openai.stream.text);
  assert.deepEqual(clock.sleeps, [2400, 9600]);
  assert.deepEqual(result.trace.attempts.map(a => a.error), ['network', 'network', null]);
});

void test('重試用完：丟最後一次的錯誤，rate_limit 的說明提醒可能是額度用完', async () => {
  const limited: MockReply = { status: 429, chunks: ['{"error":{"message":"slow down","code":"rate_limit_exceeded"}}'] };
  const fetch = mockFetch([limited]);
  const error = await rejects(createAiClient({ fetch, clock: instantClock() }).generate(request()));
  assert.equal(error.kind, 'rate_limit');
  assert.equal(error.attempts, 3);
  assert.equal(fetch.requests.length, 3);
  const { describeAiError } = await import('../src/index.ts');
  assert.match(describeAiError(error), /額度用完/);
});

void test('額度用完、金鑰錯誤、請求錯誤：不重試', async () => {
  for (const [status, body] of [
    [429, '{"error":{"message":"quota","code":"insufficient_quota"}}'],
    [401, '{"error":{"message":"bad key","code":"invalid_api_key"}}'],
    [400, '{"error":{"message":"bad","code":"invalid_value"}}'],
  ] as const) {
    const fetch = mockFetch([{ status, chunks: [body] }]);
    await rejects(createAiClient({ fetch, clock: instantClock() }).generate(request()));
    assert.equal(fetch.requests.length, 1, body);
  }
});

void test('服務要等超過 60 秒：不重試，把等待時間交給呼叫端', async () => {
  const fetch = mockFetch([{ status: 429, headers: { 'retry-after': '120' }, chunks: ['{"error":{"message":"slow"}}'] }]);
  const error = await rejects(createAiClient({ fetch, clock: instantClock() }).generate(request()));
  assert.equal(error.retryAfterMs, 120_000);
  assert.equal(fetch.requests.length, 1);
});

void test('送出後拿不到回應標頭：服務可能已經在做，丟 timeout、不自動重送（L2 R7）', async () => {
  const fetch = mockFetch([{ headersDelayMs: 200, ...OK }, OK]);
  const error = await rejects(createAiClient({ fetch, clock: instantClock(), responseTimeoutMs: 20 }).generate(request()));
  assert.deepEqual([error.kind, error.retryable, error.afterResponse], ['timeout', false, false]);
  assert.match(error.message, /no response headers within 20 ms/);
  assert.equal(fetch.requests.length, 1);
});

void test('整體逾時：丟 timeout、帶已收到的文字、不重送；之後不再有進度', async () => {
  const parts = readSse(openai, openai.stream.file).split(/\n\n/).filter(Boolean).map(e => `${e}\n\n`);
  const events: ProgressEvent[] = [];
  const fetch = mockFetch([{ status: 200, chunks: parts, delayMs: 30 }]);
  const error = await rejects(createAiClient({ fetch, clock: { sleep: () => Promise.resolve() } }).generate(request({ timeoutMs: 140, onProgress: e => events.push(e) })));
  assert.equal(error.kind, 'timeout');
  assert.equal(fetch.requests.length, 1);
  const count = events.length;
  await new Promise(resolve => setTimeout(resolve, 150));
  assert.equal(events.length, count);
});

void test('閒置逾時：太久沒資料就丟 timeout', async () => {
  const fetch = mockFetch([{ status: 200, chunks: [': ping\n\n', ': ping\n\n'], delayMs: 100 }]);
  const error = await rejects(createAiClient({ fetch, clock: instantClock() }).generate(request({ idleTimeoutMs: 30 })));
  assert.equal(error.kind, 'timeout');
  assert.match(error.message, /no data/);
});

void test('閒置逾時：服務改回 JSON 時，本文一段段到也算有資料（GitHub 審查 P2）', async () => {
  const json = JSON.stringify(openai.json.body);
  const quarter = Math.ceil(json.length / 4);
  const pieces = [0, 1, 2, 3].map(i => json.slice(i * quarter, (i + 1) * quarter));
  const fetch = mockFetch([{ status: 200, headers: { 'content-type': 'application/json' }, chunks: pieces, delayMs: 25 }]);
  const result = await createAiClient({ fetch, clock: instantClock() }).generate(request({ idleTimeoutMs: 60 }));
  assert.equal(result.text, openai.json.text);
});

void test('fetch 停不下來（像 requestUrl）：取消時這邊仍立刻結束', async () => {
  const controller = new AbortController();
  const fetch = mockFetch([{ ...OK, headersDelayMs: 500 }], { abortable: false });
  const started = Date.now();
  const promise = createAiClient({ fetch, clock: instantClock(), responseTimeoutMs: null }).generate(request({ signal: controller.signal }));
  setTimeout(() => controller.abort(), 20);
  const error = await rejects(promise);
  assert.equal(error.kind, 'cancelled');
  assert.ok(Date.now() - started < 400);
});

void test('還沒送出就取消、等待重送時取消：cancelled，不再送', async () => {
  const before = new AbortController();
  before.abort();
  const fetch = mockFetch([OK]);
  assert.equal((await rejects(createAiClient({ fetch }).generate(request({ signal: before.signal })))).kind, 'cancelled');
  assert.equal(fetch.requests.length, 0);

  const during = new AbortController();
  const slow = mockFetch([{ status: 500, chunks: ['{"error":{"message":"boom"}}'] }, OK]);
  const clock = { now: () => Date.now(), random: () => 0.5, sleep: (_ms: number, signal: AbortSignal) => new Promise<void>((_resolve, reject) => {
    signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
    during.abort();
  }) };
  assert.equal((await rejects(createAiClient({ fetch: slow, clock }).generate(request({ signal: during.signal })))).kind, 'cancelled');
  assert.equal(slow.requests.length, 1);
});

void test('onProgress 丟例外：不影響結果，記一則 warning', async () => {
  const result = await createAiClient({ fetch: mockFetch([OK]), clock: instantClock() }).generate(request({ onProgress: () => { throw new Error('ui'); } }));
  assert.equal(result.text, openai.stream.text);
  assert.ok(result.trace.warnings.includes('onProgress threw; ignored'));
});

void test('費用：照牌價估計、快取讀另計；超過長上下文門檻整筆改價；換價日之後用新價', async () => {
  const usage = (input: number, cached: number) => sse([
    { event: 'response.completed', data: { type: 'response.completed', response: { id: 'r', status: 'completed', model: 'm', output: [{ type: 'message', content: [{ type: 'output_text', text: '好' }] }], usage: { input_tokens: input, input_tokens_details: { cached_tokens: cached }, output_tokens: 350 } } } },
  ]);
  const run = async (provider: string, model: string, body: string, now = Date.parse('2026-11-25T00:00:00Z')) =>
    (await createAiClient({ fetch: mockFetch([{ status: 200, chunks: [body] }]), clock: instantClock(now) }).generate(request({ endpoint: { provider }, model }))).cost;
  // GPT-5.6 Terra：(200×2 + 1000×0.2 + 350×12) / 1e6
  assert.deepEqual(await run('openai', 'gpt-5.6-terra', usage(1200, 1000)), { amount: 0.0048, currency: 'USD', estimated: true, pricesAsOf: '2026-11-25' });
  // 超過 272,000：輸入 4、輸出 18，快取讀沒寫就照長上下文的輸入價：(300000×4 + 350×18) / 1e6
  assert.equal((await run('openai', 'gpt-5.6-terra', usage(300_000, 0)))?.amount, 1.2063);
  // 不在目錄的模型沒有費用。
  assert.equal(await run('openai', 'gpt-unknown', usage(1200, 0)), null);
  const gemini = loadCases().find(c => c.dialect === 'gemini-generate-content')!;
  const geminiBody = readSse(gemini, gemini.stream.file);
  // Gemini 3.8 Flash 2026 年：(200×0.75 + 1000×0.075 + 350×3.75) / 1e6；2027-01-01 起：(200×1.5 + 1000×0.15 + 350×7.5) / 1e6
  assert.equal((await run('google', 'gemini-3.8-flash', geminiBody))?.amount, 0.0015375);
  assert.equal((await run('google', 'gemini-3.8-flash', geminiBody, Date.parse('2027-01-02T00:00:00Z')))?.amount, 0.003075);
});

void test('結果與錯誤序列化後都找不到金鑰', async () => {
  const result = await createAiClient({ fetch: mockFetch([OK]), clock: instantClock() }).generate(request());
  assert.ok(!JSON.stringify(result).includes(KEY));
  for (const reply of [
    { networkError: `connect failed with ${KEY}` },
    { status: 500, chunks: [`{"error":{"message":"bad ${KEY}","code":"x ${KEY}"}}`] },
    { status: 200, chunks: [`data: {"type":"error","code":"c","message":"${KEY}"}\n\n`] },
  ] satisfies MockReply[]) {
    const error = await rejects(createAiClient({ fetch: mockFetch([reply]), clock: instantClock() }).generate(request({ maxAttempts: 1 })));
    assert.ok(!JSON.stringify(error).includes(KEY), JSON.stringify(error));
    assert.ok(!error.message.includes(KEY));
  }
});

void test('目錄：內建的沒有問題；呼叫端加的壞資料跳過並回報，其他照用', () => {
  assert.deepEqual(createAiClient().catalogProblems, []);
  const client = createAiClient({ catalog: { providers: [
    { id: 'insecure', label: 'x', dialect: 'openai-chat', baseUrl: 'http://example.com/v1', auth: null, models: [] },
    { id: 'nodialect', label: 'x', dialect: 'nope', baseUrl: 'https://example.com/v1', auth: null, models: [] },
    { id: 'openai', models: [{ id: 'bad-price', prices: [{ input: -1, output: 1 }], pricesAsOf: '2026-11-25' }, { id: 'fine', inputs: ['text'] }] },
  ] } });
  assert.deepEqual(client.catalogProblems.map(p => `${p.provider}/${p.model ?? ''}`).sort(), ['insecure/', 'nodialect/', 'openai/bad-price']);
  const openaiSpec = client.providers().find(p => p.id === 'openai')!;
  assert.ok(openaiSpec.models.some(m => m.id === 'fine'));
  assert.ok(openaiSpec.models.some(m => m.id === 'gpt-5.6-terra'));
});

void test('OpenAI 相容服務在串流裡拒答（delta.refusal）：沒有文字算 content_blocked，有部分文字時 stopReason 是 refusal（GitHub 審查 P2）', async () => {
  const chunk = (delta: Record<string, unknown>, finish: string | null = null) => ({ data: { id: 'gen-1', model: 'x/y', choices: [{ index: 0, delta, finish_reason: finish }] } });
  const reply = (events: Parameters<typeof sse>[0]): MockReply => ({ status: 200, headers: { 'content-type': 'text/event-stream' }, chunks: [sse(events)] });
  const fetch = mockFetch([
    reply([chunk({ role: 'assistant', refusal: '我不能' }), chunk({ refusal: '幫這個忙。' }), chunk({}, 'stop'), '[DONE]']),
    reply([chunk({ content: '光合作用' }), chunk({ refusal: '後面不能說。' }), chunk({}, 'stop'), '[DONE]']),
  ]);
  const client = createAiClient({ fetch, clock: instantClock() });
  const ask = () => client.generate({ endpoint: { provider: 'openrouter' }, apiKey: KEY, model: 'x/y', input: [{ role: 'user', content: '你好' }] });
  const blocked = await rejects(ask());
  assert.equal(blocked.kind, 'content_blocked');
  const partial = await ask();
  assert.equal(partial.text, '光合作用');
  assert.equal(partial.stopReason, 'refusal');
  assert.ok(partial.trace.warnings.some(w => w.includes('後面不能說')), partial.trace.warnings.join(' / '));
});

void test('providers() 交出的目錄改不動，呼叫端事後改自己傳的 catalog 也不影響送出的網址（L2 R2）', async () => {
  const fetch = mockFetch([OK, OK]);
  const extra = { providers: [{ id: 'mine', label: 'Mine', dialect: 'openai-responses', baseUrl: 'https://mine.example.com/v1', auth: { header: 'Authorization', scheme: 'Bearer' }, models: [] }] };
  const client = createAiClient({ fetch, clock: instantClock(), catalog: extra });
  const openaiSpec = client.providers().find(p => p.id === 'openai')!;
  assert.throws(() => { (openaiSpec as { baseUrl: string }).baseUrl = 'http://evil.example.com/v1'; });
  assert.throws(() => { (openaiSpec.auth as { header: string }).header = 'x-leak'; });
  extra.providers[0].baseUrl = 'http://evil.example.com/v1';
  extra.providers[0].auth.header = 'x-leak';
  await client.generate(request());
  await client.generate(request({ endpoint: { provider: 'mine' } }));
  assert.deepEqual(fetch.requests.map(r => r.url), ['https://api.openai.com/v1/responses', 'https://mine.example.com/v1/responses']);
  assert.equal(fetch.requests[1].headers['x-leak'], undefined);
  assert.equal(fetch.requests[1].headers.authorization, `Bearer ${KEY}`);
});

void test('服務把金鑰回送：跨事件切開、在回應編號與請求編號、斷線前的文字、傳輸層的例外裡，都遮成 ***（L2 R1）', async () => {
  const half = 10;
  const completed = { type: 'response.completed', response: { id: `resp_${KEY}`, model: `m_${KEY}`, status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: `A${KEY}B` }] }], usage: { input_tokens: 1, output_tokens: 1 } } };
  const events = [
    { data: { type: 'response.created', response: { id: `resp_${KEY}`, model: `m_${KEY}` } } },
    { data: { type: 'response.output_text.delta', delta: `A${KEY.slice(0, half)}` } },
    { data: { type: 'response.output_text.delta', delta: `${KEY.slice(half)}B` } },
  ];
  const headers = { 'content-type': 'text/event-stream', 'x-request-id': `req_${KEY}` };
  const leaks = (value: unknown) => JSON.stringify(value).includes(KEY);

  // 成功：進度的 delta 接起來、結果與 trace 都沒有金鑰；文字照原樣，只有金鑰變 ***。
  const deltas: string[] = [];
  const ok = await createAiClient({ fetch: mockFetch([{ status: 200, headers, chunks: [sse([...events, { data: completed }])] }]), clock: instantClock() })
    .generate(request({ onProgress: e => { if (e.type === 'text') deltas.push(e.delta); } }));
  assert.equal(deltas.join(''), 'A***B');
  assert.equal(ok.text, 'A***B');
  assert.ok(!leaks(ok), JSON.stringify(ok));

  // 服務改回 JSON。
  const json = await createAiClient({ fetch: mockFetch([{ status: 200, headers: { 'content-type': 'application/json', 'x-request-id': `req_${KEY}` }, chunks: [JSON.stringify(completed.response)] }]), clock: instantClock() })
    .generate(request());
  assert.equal(json.text, 'A***B');
  assert.ok(!leaks(json), JSON.stringify(json));

  // 拿到 200 後斷線：partialText 與請求編號。
  const cut = await rejects(createAiClient({ fetch: mockFetch([{ status: 200, headers, chunks: [sse(events)] }]), clock: instantClock() }).generate(request()));
  assert.equal(cut.partialText, 'A***B');
  assert.ok(!leaks(cut), JSON.stringify(cut));

  // 傳輸層丟的例外：message 與 cause 都沒有。
  const thrown = await rejects(createAiClient({ fetch: mockFetch([{ networkError: `connect failed: ${KEY}` }]), clock: instantClock() }).generate(request({ maxAttempts: 1 })));
  assert.ok(!thrown.message.includes(KEY));
  assert.ok(!String((thrown.cause as Error | undefined)?.message ?? '').includes(KEY), String(thrown.cause));

  // 測試連線列出的模型。
  const listed = await createAiClient({ fetch: mockFetch([{ status: 200, headers: { 'content-type': 'application/json', 'x-request-id': `req_${KEY}` }, chunks: [JSON.stringify({ data: [{ id: `m_${KEY}` }] })] }]), clock: instantClock() })
    .check({ endpoint: { provider: 'openai' }, apiKey: KEY });
  assert.ok(!leaks(listed), JSON.stringify(listed));
});

void test('寫進快取的輸入：OpenAI Responses 與 OpenRouter 的 cache_write_tokens 讀得到，Terra 照快取寫入價算（L2 R5）', async () => {
  const json = (body: unknown): MockReply => ({ status: 200, headers: { 'content-type': 'application/json' }, chunks: [JSON.stringify(body)] });
  const responses = (input: number) => json({
    id: 'resp_1', model: 'gpt-5.6-terra', status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: 'ok' }] }],
    usage: { input_tokens: input, input_tokens_details: { cached_tokens: 0, cache_write_tokens: input }, output_tokens: 0 },
  });
  // 牌價（catalog.json，2026-11-25）：輸入 2、快取寫入 2.5；超過 272,000 輸入整個請求改長輸入價（輸入 4，寫入照比例 5）。
  const small = await createAiClient({ fetch: mockFetch([responses(100_000)]), clock: instantClock() }).generate(request());
  assert.equal(small.usage.cacheWriteInputTokens, 100_000);
  assert.equal(small.cost?.amount, 0.25);
  const large = await createAiClient({ fetch: mockFetch([responses(1_000_000)]), clock: instantClock() }).generate(request());
  assert.equal(large.cost?.amount, 5);

  const chat = await createAiClient({ fetch: mockFetch([json({
    id: 'gen-1', model: 'openai/gpt-5.6-terra', choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }],
    usage: { prompt_tokens: 100, prompt_tokens_details: { cached_tokens: 10, cache_write_tokens: 90 }, completion_tokens: 1, cost: 0.01 },
  })]), clock: instantClock() }).generate(request({ endpoint: { provider: 'openrouter' }, model: 'openai/gpt-5.6-terra' }));
  assert.deepEqual([chat.usage.cachedInputTokens, chat.usage.cacheWriteInputTokens], [10, 90]);
});

void test('重送的規則一致：maxAttempts 最多 3 次；408 照 5xx 重送；拿到 200 後才出錯的 retryable 是 false（L2 R6）', async () => {
  const fail500: MockReply = { status: 500, headers: { 'content-type': 'application/json' }, chunks: ['{"error":{"message":"boom"}}'] };
  const many = mockFetch([fail500, fail500, fail500, fail500, OK]);
  const error = await rejects(createAiClient({ fetch: many, clock: instantClock() }).generate(request({ maxAttempts: 10 })));
  assert.deepEqual([many.requests.length, error.attempts, error.kind], [3, 3, 'server']);

  const timeout408 = mockFetch([{ status: 408, chunks: [] }, OK]);
  await createAiClient({ fetch: timeout408, clock: instantClock() }).generate(request());
  assert.equal(timeout408.requests.length, 2);

  const events = readSse(openai, openai.stream.file).split(/\n\n/).filter(Boolean).map(e => `${e}\n\n`);
  const cut = await rejects(createAiClient({ fetch: mockFetch([{ status: 200, headers: { 'content-type': 'text/event-stream' }, chunks: events.slice(0, 3) }]), clock: instantClock() }).generate(request()));
  assert.deepEqual([cut.kind, cut.afterResponse, cut.retryable], ['network', true, false]);
});
