// client 的共同行為（docs/tasks/ai-client.md〈7〉）：送出前的檢查、推理對應、逾時、重試、進度、金鑰與費用。
// 各家格式的部分在 conformance.test.ts；這裡用 openai-responses 的範例當代表。
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AiError, createAiClient, isAiError, type FetchLike, type GenerateRequest, type ProgressEvent } from '../src/index.ts';
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
    // 只數推理的 warning：範例回應報的是範例自己的模型，對某些列是目錄裡另一個模型，會多一筆估價的 warning（L2 第二輪 R13）。
    const reasoningWarnings = result.trace.warnings.filter(w => !w.startsWith('cost priced as'));
    assert.equal(reasoningWarnings.length, warnings, `${provider} ${model} ${level}: ${result.trace.warnings.join('; ')}`);
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
  // extraBody 沒碰推理參數：照原本的值，不記推理的 warning（改了哪些欄位另記一條，L2 R13）。
  const untouched = await client.generate(request({ reasoning: 'high', extraBody: { service_tier: 'flex' } }));
  assert.equal(untouched.trace.reasoningSent, 'high');
  assert.ok(!untouched.trace.warnings.some(w => /reasoning set by extraBody/.test(w)));
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

void test('數字欄位整類：給了不是有限的數字就不送出；很大的逾時當成很長，不是立刻逾時（L2 第二輪 R6）', async () => {
  const BAD: unknown[] = [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, '3', true, {}];
  for (const field of ['maxAttempts', 'timeoutMs', 'idleTimeoutMs', 'maxOutputTokens'] as const) {
    for (const value of BAD) {
      const fetch = mockFetch([{ status: 500, chunks: [] }, { status: 500, chunks: [] }, { status: 500, chunks: [] }, { status: 500, chunks: [] }, OK]);
      const error = await rejects(createAiClient({ fetch, clock: instantClock() }).generate(request({ [field]: value })));
      assert.deepEqual([error.kind, fetch.requests.length], ['invalid_request', 0], `${field} = ${String(value)}`);
    }
  }
  for (const value of [0, -1, 1.5]) {
    const fetch = mockFetch([OK]);
    const error = await rejects(createAiClient({ fetch, clock: instantClock() }).generate(request({ maxOutputTokens: value })));
    assert.deepEqual([error.kind, fetch.requests.length], ['invalid_request', 0], `maxOutputTokens = ${String(value)}`);
  }
  for (const value of BAD) {
    const fetch = mockFetch([OK]);
    const error = await rejects(createAiClient({ fetch, clock: instantClock(), responseTimeoutMs: value as number }).generate(request()));
    assert.deepEqual([error.kind, fetch.requests.length], ['invalid_request', 0], `responseTimeoutMs = ${String(value)}`);
    const checkFetch = mockFetch([OK]);
    const checked = await createAiClient({ fetch: checkFetch, clock: instantClock() }).check({ endpoint: { provider: 'openai' }, apiKey: KEY, timeoutMs: value as number });
    assert.deepEqual([checked.ok ? 'ok' : checked.error.kind, checkFetch.requests.length], ['invalid_request', 0], `check timeoutMs = ${String(value)}`);
  }
  // 沒給或 null 照預設。
  const unset = mockFetch([OK]);
  await createAiClient({ fetch: unset, clock: instantClock() }).generate(request({ maxAttempts: undefined, timeoutMs: undefined }));

  // 超過計時器上限（約 24.8 天）的數字：計時器會當成 1 ms 立刻到，要當成很長（L2 第二輪 R6）。
  const huge = 1e10;
  const slow: MockReply = { ...OK, delayMs: 5 };
  for (const extra of [{ timeoutMs: huge }, { idleTimeoutMs: huge }] as Partial<GenerateRequest>[]) {
    const result = await createAiClient({ fetch: mockFetch([slow]), clock: instantClock() }).generate(request(extra));
    assert.equal(result.text, openai.stream.text, JSON.stringify(extra));
  }
  const longHeaders = await createAiClient({ fetch: mockFetch([{ ...slow, headersDelayMs: 5 }]), clock: instantClock(), responseTimeoutMs: huge }).generate(request());
  assert.equal(longHeaders.text, openai.stream.text);
  const longCheck = await createAiClient({ fetch: mockFetch([{ status: 200, headers: { 'content-type': 'application/json' }, chunks: ['{"data":[{"id":"gpt-5.6-terra"}]}'], headersDelayMs: 5 }]), clock: instantClock() })
    .check({ endpoint: { provider: 'openai' }, apiKey: KEY, timeoutMs: huge });
  assert.ok(longCheck.ok, longCheck.ok ? '' : longCheck.error.message);
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

void test('在進度回呼裡取消或逾時是 0：不再送出、不再重送，最後一段文字之後取消也不算成功（L2 R8）', async () => {
  const fail500: MockReply = { status: 500, headers: { 'content-type': 'application/json' }, chunks: ['{"error":{"message":"boom"}}'] };
  const cancelOn = (type: ProgressEvent['type']) => {
    const controller = new AbortController();
    return { signal: controller.signal, onProgress: (e: ProgressEvent) => { if (e.type === type) controller.abort(); } };
  };

  const retry = mockFetch([fail500, OK]);
  const onRetry = await rejects(createAiClient({ fetch: retry, clock: instantClock() }).generate(request(cancelOn('retrying'))));
  assert.deepEqual([onRetry.kind, retry.requests.length], ['cancelled', 1]);

  const sent = mockFetch([OK]);
  const onSent = await rejects(createAiClient({ fetch: sent, clock: instantClock() }).generate(request(cancelOn('sent'))));
  assert.deepEqual([onSent.kind, sent.requests.length], ['cancelled', 0]);

  const zero = mockFetch([OK]);
  const noTime = await rejects(createAiClient({ fetch: zero, clock: instantClock() }).generate(request({ timeoutMs: 0 })));
  assert.deepEqual([noTime.kind, zero.requests.length], ['timeout', 0]);

  const json = mockFetch([{ status: 200, headers: { 'content-type': 'application/json' }, chunks: [JSON.stringify(openai.json.body)] }]);
  const onText = await rejects(createAiClient({ fetch: json, clock: instantClock() }).generate(request(cancelOn('text'))));
  assert.equal(onText.kind, 'cancelled');

  const checkZero = mockFetch([OK]);
  const checked = await createAiClient({ fetch: checkZero, clock: instantClock() }).check({ endpoint: { provider: 'openai' }, apiKey: KEY, timeoutMs: 0 });
  assert.deepEqual([checked.ok ? 'ok' : checked.error.kind, checkZero.requests.length], ['timeout', 0]);
});

void test('停下來時本文的讀取也停：卡住的本文、晚到的回應、錯誤本文卡住都會被取消（L2 R9）', async () => {
  // 像不理 signal 的傳輸層：交回標準 Response，本文送一段之後就不再送。
  const stalled = (status: number, contentType: string, first: string) => {
    let cancels = 0;
    const body = new ReadableStream<Uint8Array>({
      start(controller) { controller.enqueue(new TextEncoder().encode(first)); },
      pull: () => new Promise<void>(() => undefined),
      cancel: () => { cancels++; },
    });
    return { response: new Response(body, { status, headers: { 'content-type': contentType } }), cancels: () => cancels };
  };
  const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  const sseStall = stalled(200, 'text/event-stream', ': ping\n\n');
  const idle = await rejects(createAiClient({ fetch: () => Promise.resolve(sseStall.response), clock: instantClock() }).generate(request({ idleTimeoutMs: 20 })));
  await wait(10);
  assert.deepEqual([idle.kind, sseStall.cancels()], ['timeout', 1]);

  const checkStall = stalled(200, 'application/json', '{"data":[');
  const checked = await createAiClient({ fetch: () => Promise.resolve(checkStall.response), clock: instantClock() }).check({ endpoint: { provider: 'openai' }, apiKey: KEY, timeoutMs: 20 });
  await wait(10);
  assert.deepEqual([checked.ok ? 'ok' : checked.error.kind, checkStall.cancels()], ['timeout', 1]);

  const lateStall = stalled(200, 'text/event-stream', ': ping\n\n');
  const late = await rejects(createAiClient({ fetch: () => wait(40).then(() => lateStall.response), clock: instantClock(), responseTimeoutMs: 10 }).generate(request()));
  await wait(60);
  assert.deepEqual([late.kind, lateStall.cancels()], ['timeout', 1]);

  const errorStall = stalled(429, 'application/json', '{"error":');
  const started = Date.now();
  const limited = await rejects(createAiClient({ fetch: () => Promise.resolve(errorStall.response), clock: instantClock() }).generate(request({ idleTimeoutMs: 15, timeoutMs: 2_000, maxAttempts: 1 })));
  await wait(10);
  assert.deepEqual([limited.kind, errorStall.cancels()], ['rate_limit', 1]);
  assert.ok(Date.now() - started < 1_000, `錯誤本文卡住時等了 ${Date.now() - started} ms`);
});

void test('讀錯誤本文整類：開始讀之前就取消，立刻停；本文超過上限還一直來，照狀態碼分類，不讀到逾時（L2 第二輪 R9）', async () => {
  const encoder = new TextEncoder();
  const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
  // 先送 first，之後每 2 ms 送 1 byte，直到被取消；約 2 秒後才自己結束，修好之前的失敗也會停下來。
  const endless = (first: Uint8Array) => {
    let cancelled = false;
    let pulls = 0;
    const body = new ReadableStream<Uint8Array>({
      async pull(controller) {
        if (pulls++ === 0) { controller.enqueue(first); return; }
        await wait(2);
        if (cancelled) return;
        if (pulls > 1_000) controller.close();
        else controller.enqueue(encoder.encode(' '));
      },
      cancel: () => { cancelled = true; },
    });
    return { body, cancelled: () => cancelled };
  };
  const reply = (status: number, contentType: string, first: Uint8Array, onStatus?: () => void) => {
    const stream = endless(first);
    const response = new Response(stream.body, { status, headers: { 'content-type': contentType } });
    // 標頭交回之後、開始讀本文之前的空隙：第一次讀狀態碼時做 onStatus。
    if (onStatus) {
      let fired = false;
      Object.defineProperty(response, 'status', { get: () => { if (!fired) { fired = true; onStatus(); } return status; } });
    }
    return { response, cancelled: stream.cancelled };
  };
  const overCap = encoder.encode(' '.repeat(64 * 1024));
  const kindOf = async (promise: Promise<unknown>) => (await rejects(promise)).kind;
  const checkKind = async (promise: Promise<Awaited<ReturnType<ReturnType<typeof createAiClient>['check']>>>) => {
    const result = await promise;
    return result.ok ? 'ok' : result.error.kind;
  };

  for (const c of loadCases()) {
    for (const status of [400, 429, 503]) {
      const label = `${c.dialect} ${String(status)}`;
      const base = { endpoint: c.endpoint, model: c.model, maxAttempts: 1 };
      const empty = mockFetch([{ status, headers: { 'content-type': 'application/json' }, chunks: [] }]);
      const expected = await kindOf(createAiClient({ fetch: empty, clock: instantClock() }).generate(request(base)));
      const expectedCheck = await checkKind(createAiClient({ fetch: empty, clock: instantClock() }).check({ endpoint: c.endpoint, apiKey: KEY }));

      const caller = new AbortController();
      const gap = reply(status, 'application/json', encoder.encode('{"error":'), () => caller.abort());
      let started = Date.now();
      const cancelled = await kindOf(createAiClient({ fetch: () => Promise.resolve(gap.response), clock: instantClock() })
        .generate(request({ ...base, signal: caller.signal, idleTimeoutMs: 1_000, timeoutMs: 1_500 })));
      await wait(10);
      assert.deepEqual([cancelled, gap.cancelled()], ['cancelled', true], `${label} 讀本文前取消`);
      assert.ok(Date.now() - started < 300, `${label} 讀本文前取消等了 ${String(Date.now() - started)} ms`);

      const long = reply(status, 'application/json', overCap);
      started = Date.now();
      const classified = await kindOf(createAiClient({ fetch: () => Promise.resolve(long.response), clock: instantClock() })
        .generate(request({ ...base, idleTimeoutMs: 1_000, timeoutMs: 1_500 })));
      await wait(10);
      assert.deepEqual([classified, long.cancelled()], [expected, true], `${label} 本文超過上限`);
      assert.ok(Date.now() - started < 500, `${label} 本文超過上限等了 ${String(Date.now() - started)} ms`);

      const checkLong = reply(status, 'application/json', overCap);
      const checked = await checkKind(createAiClient({ fetch: () => Promise.resolve(checkLong.response), clock: instantClock() })
        .check({ endpoint: c.endpoint, apiKey: KEY, timeoutMs: 1_500 }));
      await wait(10);
      assert.deepEqual([checked, checkLong.cancelled()], [expectedCheck, true], `${label} 測試連線的本文超過上限`);
    }
  }

  // 成功的測試連線本文也有上限：超過就不再讀，算形狀不對。
  const huge = reply(200, 'application/json', encoder.encode(`{"data":[${' '.repeat(4 * 1024 * 1024)}`));
  const checked = await checkKind(createAiClient({ fetch: () => Promise.resolve(huge.response), clock: instantClock() })
    .check({ endpoint: { provider: 'openai' }, apiKey: KEY, timeoutMs: 1_500 }));
  await wait(10);
  assert.deepEqual([checked, huge.cancelled()], ['server', true]);
});

void test('OpenAI 相容服務有 finish_reason 卻沒有 [DONE] 就關了：文字照交、用量不明時記 warning（L2 R10）', async () => {
  const chat = loadCases().find(c => c.dialect === 'openai-chat')!;
  const cut = readSse(chat, chat.stream.file).split(/\n\n/).filter(e => !e.includes('"usage"') && !e.includes('[DONE]')).map(e => `${e}\n\n`).join('');
  const fetch = mockFetch([{ status: 200, headers: { 'content-type': 'text/event-stream' }, chunks: [cut] }]);
  const result = await createAiClient({ fetch, clock: instantClock() }).generate(request({ endpoint: { provider: 'openrouter' }, model: chat.model }));
  assert.equal(result.text, chat.stream.text);
  assert.deepEqual([result.usage.inputTokens, result.cost], [null, null]);
  assert.ok(result.trace.warnings.some(w => w.includes('[DONE]')), result.trace.warnings.join('; '));
});

void test('Gemini 最後一塊只有用量：前面的停止原因、模型、回應編號不被蓋掉（L2 R11）', async () => {
  const gemini = { endpoint: { provider: 'google' }, model: 'gemini-3.8-flash' } as const;
  const reply = (events: unknown[]): MockReply => ({ status: 200, headers: { 'content-type': 'text/event-stream' }, chunks: [sse(events.map(data => ({ data })))] });
  const usageOnly = { usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 2, totalTokenCount: 12 } };
  const safety = { candidates: [{ content: { parts: [], role: 'model' }, finishReason: 'SAFETY' }], modelVersion: 'gemini-3.8-flash-001', responseId: 'gem-1' };

  const blocked = await rejects(createAiClient({ fetch: mockFetch([reply([safety, usageOnly])]), clock: instantClock() }).generate(request(gemini)));
  assert.deepEqual([blocked.kind, blocked.providerCode], ['content_blocked', 'SAFETY']);

  const partial = { candidates: [{ content: { parts: [{ text: '光合作用' }], role: 'model' } }], modelVersion: 'gemini-3.8-flash-001', responseId: 'gem-2' };
  const stop = { candidates: [{ content: { parts: [], role: 'model' }, finishReason: 'SAFETY' }] };
  const result = await createAiClient({ fetch: mockFetch([reply([partial, stop, usageOnly])]), clock: instantClock() }).generate(request(gemini));
  assert.deepEqual(
    [result.text, result.stopReason, result.trace.rawStopReason, result.trace.resolvedModel, result.trace.responseId, result.usage.inputTokens],
    ['光合作用', 'content_filter', 'SAFETY', 'gemini-3.8-flash-001', 'gem-2', 10],
  );
});

void test('服務說回答的是目錄裡另一個模型：整類照回答的那一個估價、記 warning；不認得的照請求的（L2 第二輪 R13）', async () => {
  const client = createAiClient({ fetch: mockFetch([OK]), clock: instantClock() });
  for (const c of loadCases()) {
    const providerId = 'provider' in c.endpoint ? c.endpoint.provider : null;
    const provider = client.providers().find(p => p.id === providerId);
    assert.ok(provider, c.dialect);
    const sse = readSse(c, c.stream.file);
    const run = async (requested: string, reported: string) => {
      const baseline = await createAiClient({ fetch: mockFetch([{ status: 200, headers: { 'content-type': 'text/event-stream' }, chunks: [sse] }]), clock: instantClock() })
        .generate(request({ endpoint: c.endpoint, model: c.model }));
      const original = baseline.trace.resolvedModel;
      assert.ok(original, `${c.dialect} 的範例要回報模型`);
      const body = sse.split(original).join(reported);
      return createAiClient({ fetch: mockFetch([{ status: 200, headers: { 'content-type': 'text/event-stream' }, chunks: [body] }]), clock: instantClock() })
        .generate(request({ endpoint: c.endpoint, model: requested }));
    };
    const ids = provider.models.map(m => m.id);
    for (const a of ids) {
      for (const b of ids) {
        if (a === b) continue;
        const swapped = await run(a, b);
        const direct = await run(b, b);
        assert.equal(swapped.trace.resolvedModel, b);
        assert.deepEqual(swapped.cost, direct.cost, `${c.dialect}：請求 ${a}、服務說 ${b}`);
        assert.ok(swapped.trace.warnings.some(w => w.includes(b)), `${c.dialect}：請求 ${a}、服務說 ${b}：${swapped.trace.warnings.join(' / ')}`);
        assert.ok(!direct.trace.warnings.some(w => w.includes('different model')), `${c.dialect}：${b}`);
      }
      const unknown = await run(a, 'zz-unlisted-model');
      assert.deepEqual(unknown.cost, (await run(a, a)).cost, `${c.dialect}：請求 ${a}、服務說不認得的模型`);
    }
  }
});

void test('Gemini 的用量欄位分在好幾塊送：整類照每一欄最後的值合起來，和一次送齊一樣（L2 第二輪 R11）', async () => {
  const gemini = { endpoint: { provider: 'google' }, model: 'gemini-3.8-flash' } as const;
  const full = { promptTokenCount: 7, candidatesTokenCount: 3, totalTokenCount: 15, cachedContentTokenCount: 2, thoughtsTokenCount: 5 };
  const fields = Object.keys(full) as (keyof typeof full)[];
  const text = { candidates: [{ content: { parts: [{ text: '光合作用' }], role: 'model' } }], modelVersion: 'gemini-3.8-flash-001', responseId: 'gem-3' };
  const stop = { candidates: [{ content: { parts: [], role: 'model' }, finishReason: 'STOP' }] };
  const usageOf = async (events: unknown[]) => {
    const fetch = mockFetch([{ status: 200, headers: { 'content-type': 'text/event-stream' }, chunks: [sse(events.map(data => ({ data })))] }]);
    return (await createAiClient({ fetch, clock: instantClock() }).generate(request(gemini))).usage;
  };
  const expected = await usageOf([text, { ...stop, usageMetadata: full }]);
  assert.equal(expected.inputTokens, 7);
  // 每一欄放進三塊中的一塊（3^5 種分法）；放在哪一塊都一樣。
  for (let code = 0; code < 3 ** fields.length; code++) {
    const parts: Record<string, number>[] = [{}, {}, {}];
    fields.forEach((field, i) => { parts[Math.floor(code / 3 ** i) % 3][field] = full[field]; });
    const events = [{ ...text, usageMetadata: parts[0] }, { ...stop, usageMetadata: parts[1] }, { usageMetadata: parts[2] }];
    assert.deepEqual(await usageOf(events), expected, JSON.stringify(parts));
  }
  // 同一欄後面又送一次（累計值變大）：用最後的值。
  const updated = await usageOf([{ ...text, usageMetadata: { ...full, candidatesTokenCount: 1, totalTokenCount: 13 } }, { ...stop, usageMetadata: { candidatesTokenCount: 3, totalTokenCount: 15 } }]);
  assert.deepEqual(updated, expected);
});

void test('extraBody 不能改模型或串流；改了哪些欄位記在 trace，未登錄模型的推理欄位也查得到（L2 R13）', async () => {
  const fetch = mockFetch([OK]);
  const client = createAiClient({ fetch, clock: instantClock() });
  for (const extraBody of [{ model: 'gpt-5.6-pro' }, { stream: false }]) {
    assert.equal((await rejects(client.generate(request({ extraBody })))).kind, 'invalid_request', JSON.stringify(extraBody));
  }
  assert.equal(fetch.requests.length, 0);

  const gemini = loadCases().find(c => c.dialect === 'gemini-generate-content')!;
  const google = mockFetch([{ status: 200, headers: { 'content-type': 'text/event-stream' }, chunks: [readSse(gemini, gemini.stream.file)] }]);
  const result = await createAiClient({ fetch: google, clock: instantClock() }).generate(request({
    endpoint: { provider: 'google' }, model: 'gemini-9-unlisted', extraBody: { generationConfig: { thinkingConfig: { thinkingLevel: 'high' } } },
  }));
  assert.deepEqual(bodyOf(google).generationConfig, { thinkingConfig: { thinkingLevel: 'high' } });
  assert.ok(result.trace.warnings.includes('extraBody set: generationConfig.thinkingConfig.thinkingLevel'), result.trace.warnings.join(' / '));
});

void test('目錄的形狀壞掉：跳過那一筆、回報，不讓整個 client 建不起來；不存在的日期也擋（L2 R14）', () => {
  const overrides = { providers: [
    { id: 'openai', models: [
      { id: 'null-price', prices: [null] },
      { id: 'feb-30', prices: [{ input: 1, output: 2 }], pricesAsOf: '2026-02-30' },
      { id: 'bad-from', prices: [{ input: 1, output: 2, effectiveFrom: '2026-13-01' }], pricesAsOf: '2026-11-25' },
      null,
    ] },
    { id: 'anthropic', models: 'nope' },
    { id: 'google', limits: { maxRequestBytes: 'big' } },
    null,
  ] } as unknown as NonNullable<Parameters<typeof createAiClient>[0]>['catalog'];
  const client = createAiClient({ catalog: overrides });
  const found = client.catalogProblems.map(p => `${p.provider}/${p.model ?? ''}`).sort();
  assert.deepEqual(found, ['(沒有 id)/', 'anthropic/', 'google/', 'openai/', 'openai/bad-from', 'openai/feb-30', 'openai/null-price'].sort());
  // 其他廠商照常能用。
  assert.ok(client.providers().some(p => p.id === 'openrouter'));
  assert.ok(!createAiClient({ catalog: { providers: 'nope' } as unknown as typeof overrides }).catalogProblems.some(p => p.provider === 'openai'));
});

void test('金鑰不出現在任何公開的出口：傳輸層丟的各種例外（含 AiError、名稱、包在裡面的 cause），generate 與 check 都一樣（L2 第二輪 延續 R1）', async () => {
  const withName = new Error(`failed ${KEY}`);
  withName.name = `Name_${KEY}`;
  const nested = new Error('outer', { cause: new Error(`inner ${KEY}`) });
  const adapterError = new AiError({ kind: 'network', message: `adapter ${KEY}`, requestId: `req_${KEY}`, providerCode: `code_${KEY}`, partialText: `part ${KEY}` });
  const throws: unknown[] = [withName, nested, adapterError, `plain ${KEY}`];
  // 轉不成 JSON 或字串的值：清理例外時不能再丟一次（L2 第二輪 R1 修正引入）。
  const circular: Record<string, unknown> = { note: KEY };
  circular.self = circular;
  throws.push(circular, { big: 10n, note: KEY }, Object.create(null) as object);
  // 錯誤物件上看得到的每一個字串：訊息、堆疊、JSON、cause 的名稱與訊息與堆疊。
  const surface = (error: AiError): string => {
    const cause = error.cause as { name?: unknown; message?: unknown; stack?: unknown } | undefined;
    return [error.message, error.stack, JSON.stringify(error), String(error), cause?.name, cause?.message, cause?.stack].map(String).join('\n');
  };
  for (const thrown of throws) {
    // 同步丟（不是回傳被拒絕的 promise）也一樣。
    const fetch = () => { throw thrown; };
    const generated = await rejects(createAiClient({ fetch, clock: instantClock() }).generate(request({ maxAttempts: 1 })));
    assert.ok(!surface(generated).includes(KEY), surface(generated));
    const checked = await createAiClient({ fetch, clock: instantClock() }).check({ endpoint: { provider: 'openai' }, apiKey: KEY });
    assert.ok(!checked.ok);
    assert.ok(!surface(checked.error).includes(KEY), surface(checked.error));
  }
});

void test('丟出來的值整類：每一個讀取都會丟（getter、轉字串、Proxy 的每個 trap），從哪裡丟都回 AiError、不卡住、不帶金鑰（L2 第三輪 R1 修正引入）', async () => {
  const boom = () => { throw new Error(`leak ${KEY}`); };
  const adversaries: [string, () => unknown][] = [
    ...['message', 'name', 'cause', 'stack', 'toString', 'valueOf', 'toJSON', 'constructor'].map(property => [`${property} getter`, () => {
      const error = new Error('x');
      Object.defineProperty(error, property, { get: boom });
      return error;
    }] as [string, () => unknown]),
    ['Symbol.toPrimitive', () => ({ [Symbol.toPrimitive]: boom, toJSON: boom })],
    ['每個 trap 都丟的 Proxy', () => new Proxy(new Error('x'), { get: boom, has: boom, ownKeys: boom, getPrototypeOf: boom, getOwnPropertyDescriptor: boom })],
    ['撤銷的 Proxy', () => { const { proxy, revoke } = Proxy.revocable({}, {}); revoke(); return proxy; }],
  ];
  const surface = (error: unknown): string => {
    assert.ok(isAiError(error), '要是 AiError');
    const cause = error.cause as { name?: unknown; message?: unknown } | undefined;
    return [error.message, JSON.stringify(error), cause?.name, cause?.message].map(String).join('\n');
  };
  // 傳輸層同步丟、回傳被拒絕的 promise、本文讀到一半丟。
  const sources: [string, (value: unknown) => FetchLike][] = [
    ['同步丟', value => () => { throw value; }],
    ['被拒絕的 promise', value => () => Promise.resolve().then(() => { throw value; })],
    ['讀本文時丟', value => () => Promise.resolve(new Response(new ReadableStream({ pull(controller) { controller.error(value); } }), { status: 200, headers: { 'content-type': 'application/json' } }))],
  ];
  for (const [label, make] of adversaries) {
    for (const [where, source] of sources) {
      const fetch = source(make());
      const started = Date.now();
      let generated: unknown;
      try {
        await createAiClient({ fetch, clock: instantClock() }).generate(request({ maxAttempts: 1, timeoutMs: 2_000 }));
      } catch (error) { generated = error; }
      assert.ok(!surface(generated).includes(KEY), `${label}／${where}：${surface(generated)}`);
      assert.notEqual((generated as AiError).kind, 'timeout', `${label}／${where}：卡到逾時`);
      const checked = await createAiClient({ fetch: source(make()), clock: instantClock() }).check({ endpoint: { provider: 'openai' }, apiKey: KEY, timeoutMs: 2_000 });
      assert.ok(!checked.ok, `${label}／${where}`);
      assert.ok(!surface(checked.error).includes(KEY), `${label}／${where}：${surface(checked.error)}`);
      assert.notEqual(checked.error.kind, 'timeout', `${label}／${where}：卡到逾時`);
      assert.ok(Date.now() - started < 1_500, `${label}／${where}：等了 ${String(Date.now() - started)} ms`);
    }
  }
});

void test('短於 8 個字的金鑰不遮（不是真的金鑰，遮了會改掉正常的字），8 個字以上的照遮（L2 第二輪 延續 R1）', async () => {
  const chat = loadCases().find(c => c.dialect === 'openai-chat')!;
  const reply = (): MockReply => ({ status: 200, headers: { 'content-type': 'text/event-stream' }, chunks: [readSse(chat, chat.stream.file)] });
  const local = (apiKey: string) => createAiClient({ fetch: mockFetch([reply()]), clock: instantClock() }).generate(request({
    apiKey, endpoint: { custom: { dialect: 'openai-chat', baseUrl: 'http://localhost:11434/v1' } }, model: 'llama',
  }));
  // 「光合作用把」是 5 個字。
  assert.equal((await local('光合作用把')).text, chat.stream.text);
  assert.equal((await local('光合作用把光能轉')).text, '***成化學能。');
});

void test('金鑰整類：短於 8 個字的只送本機、不遮；送到遠端的一律 8 個字以上，回來的每個出口都遮（L2 第三輪 延續 R1）', async () => {
  const remote = [{ custom: { dialect: 'openai-chat' as const, baseUrl: 'https://api.example.com/v1' } }, { provider: 'openrouter' }];
  const local = [{ custom: { dialect: 'openai-chat' as const, baseUrl: 'http://localhost:11434/v1' } }, { custom: { dialect: 'openai-chat' as const, baseUrl: 'https://127.0.0.1:8443/v1' } }];
  // 服務把金鑰原樣回在文字、錯誤訊息與模型清單裡。
  const echo = (key: string): MockReply => ({ status: 200, headers: { 'content-type': 'text/event-stream' }, chunks: [sse([
    { data: { id: 'x', model: 'm', choices: [{ index: 0, delta: { content: `key=${key}.` } }] } },
    { data: { id: 'x', model: 'm', choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] } },
    { data: '[DONE]' },
  ])] });
  const rejected = (key: string): MockReply => ({ status: 401, headers: { 'content-type': 'application/json' }, chunks: [JSON.stringify({ error: { message: `bad key ${key}` } })] });
  for (let length = 1; length <= 12; length++) {
    const key = 'k7Q-9zX_w2Lm'.slice(0, length);
    for (const endpoint of [...remote, ...local]) {
      const label = `${length} 個字 → ${JSON.stringify(endpoint)}`;
      const isLocal = local.includes(endpoint as (typeof local)[number]);
      const fetch = mockFetch([echo(key)]);
      const events: ProgressEvent[] = [];
      const generated = createAiClient({ fetch, clock: instantClock() }).generate(request({ apiKey: key, endpoint, model: 'm', onProgress: e => events.push(e) }));
      const checkFetch = mockFetch([rejected(key)]);
      const checked = await createAiClient({ fetch: checkFetch, clock: instantClock() }).check({ endpoint, apiKey: key });
      if (length < 8 && !isLocal) {
        assert.deepEqual([(await rejects(generated)).kind, fetch.requests.length], ['invalid_request', 0], label);
        assert.deepEqual([checked.ok ? 'ok' : checked.error.kind, checkFetch.requests.length], ['invalid_request', 0], label);
        continue;
      }
      const result = await generated;
      const shown = JSON.stringify([result, events, checked]);
      if (length < 8) assert.ok(result.text.includes(key), `${label}：本機的短金鑰不是秘密，不遮`);
      else assert.ok(!shown.includes(key), `${label}：${shown.slice(0, 300)}`);
    }
  }
});

void test('遮蔽只動服務回的字串：金鑰剛好等於固定的值時，結構照舊、可以原樣放回下一輪（L2 第二輪 R1 修正引入）', async () => {
  const chat = loadCases().find(c => c.dialect === 'openai-chat')!;
  for (const apiKey of ['assistant', 'openai-chat', 'localhost:11434']) {
    const fetch = mockFetch([{ status: 200, headers: { 'content-type': 'text/event-stream' }, chunks: [readSse(chat, chat.stream.file)] }]);
    const result = await createAiClient({ fetch, clock: instantClock() }).generate(request({
      apiKey, endpoint: { custom: { dialect: 'openai-chat', baseUrl: 'http://localhost:11434/v1' } }, model: 'llama',
    }));
    assert.deepEqual(result.message, { role: 'assistant', content: [{ type: 'text', text: chat.stream.text }] }, apiKey);
    assert.deepEqual([result.trace.dialect, result.trace.host, result.trace.provider], ['openai-chat', 'localhost:11434', 'custom'], apiKey);
  }
});

void test('進度回呼裡取消，每一種事件、每一條路都停：cancelled、不再送、已交出的文字留在 partialText（L2 第二輪 R8、R10 修正交互）', async () => {
  const chat = loadCases().find(c => c.dialect === 'openai-chat')!;
  // 最後一段文字以金鑰的開頭結尾：遮蔽器扣住它，串流做完卻沒關，閒置逾時後才補交（R10 的路）。
  const heldKey = '能。這不是真的金鑰';
  const lingering = (): MockReply => ({
    status: 200, headers: { 'content-type': 'text/event-stream' }, keepOpen: true,
    chunks: [readSse(chat, chat.stream.file).split(/\n\n/).filter(e => !e.includes('[DONE]')).map(e => `${e}\n\n`).join('')],
  });
  const routes: { name: string; reply: () => MockReply; extra: Partial<GenerateRequest> }[] = [
    { name: 'SSE', reply: () => OK, extra: {} },
    { name: 'JSON', reply: () => ({ status: 200, headers: { 'content-type': 'application/json' }, chunks: [JSON.stringify(openai.json.body)] }), extra: {} },
    { name: '做完沒關', reply: lingering, extra: { endpoint: { provider: 'openrouter' }, model: chat.model, apiKey: heldKey, idleTimeoutMs: 30 } },
  ];
  const pickers: { name: string; pick: (e: ProgressEvent, seen: ProgressEvent[]) => boolean; sends: number; hasText: boolean }[] = [
    { name: 'sent', pick: e => e.type === 'sent', sends: 0, hasText: false },
    { name: 'waiting', pick: e => e.type === 'waiting', sends: 1, hasText: false },
    { name: '第一段 text', pick: (e, seen) => e.type === 'text' && !seen.some(s => s.type === 'text'), sends: 1, hasText: true },
  ];
  for (const route of routes) {
    for (const picker of pickers) {
      const controller = new AbortController();
      const seen: ProgressEvent[] = [];
      const fetch = mockFetch([route.reply()]);
      const error = await rejects(createAiClient({ fetch, clock: instantClock() }).generate(request({
        ...route.extra, signal: controller.signal,
        onProgress: e => { if (picker.pick(e, seen)) controller.abort(); seen.push(e); },
      })));
      const label = `${route.name}／${picker.name}`;
      assert.deepEqual([error.kind, fetch.requests.length], ['cancelled', picker.sends], label);
      assert.equal(error.partialText !== null, picker.hasText, `${label}：${String(error.partialText)}`);
    }
    // 最後一段 text：先跑一次數出有幾段，再在最後一段取消。
    let texts = 0;
    await createAiClient({ fetch: mockFetch([route.reply()]), clock: instantClock() }).generate(request({ ...route.extra, onProgress: e => { if (e.type === 'text') texts++; } }));
    const controller = new AbortController();
    let at = 0;
    const last = await rejects(createAiClient({ fetch: mockFetch([route.reply()]), clock: instantClock() }).generate(request({
      ...route.extra, signal: controller.signal, onProgress: e => { if (e.type === 'text' && ++at === texts) controller.abort(); },
    })));
    assert.equal(last.kind, 'cancelled', `${route.name}／最後一段 text`);
    assert.ok(last.partialText, `${route.name}／最後一段 text 的 partialText`);
  }
});

void test('sent 的回呼拖過整體期限：不送出，丟 timeout（L2 第二輪 R8）', async () => {
  let now = Date.parse('2026-11-25T00:00:00Z');
  const fetch = mockFetch([OK]);
  const clock = { now: () => now, sleep: () => Promise.resolve(), random: () => 0.5 };
  const error = await rejects(createAiClient({ fetch, clock }).generate(request({ timeoutMs: 10, onProgress: e => { if (e.type === 'sent') now += 25; } })));
  assert.deepEqual([error.kind, fetch.requests.length], ['timeout', 0]);
});

void test('取消之後一個事件都不再交：每一條路的每一個事件，在回呼裡取消或排到下一步才取消，都是 cancelled，partialText 包含已交出的文字（L2 第三輪 延續 R8）', async () => {
  const chat = loadCases().find(c => c.dialect === 'openai-chat')!;
  const stream = (chunks: string[], extra: Partial<MockReply> = {}): MockReply => ({ status: 200, headers: { 'content-type': 'text/event-stream' }, chunks, ...extra });
  const chatEvents = readSse(chat, chat.stream.file).split(/\n\n/).filter(Boolean).map(e => `${e}\n\n`);
  const routes: { name: string; replies: () => MockReply[]; extra: Partial<GenerateRequest> }[] = [
    { name: 'SSE', replies: () => [OK], extra: {} },
    { name: 'JSON', replies: () => [{ status: 200, headers: { 'content-type': 'application/json' }, chunks: [JSON.stringify(openai.json.body)] }], extra: {} },
    { name: '500 後重送', replies: () => [{ status: 500, headers: { 'content-type': 'application/json' }, chunks: ['{"error":{"message":"boom"}}'] }, OK], extra: {} },
    // 遮蔽器扣住金鑰開頭的最後一段，做完與 [DONE] 在同一段本文（第三輪的例子）。
    {
      name: '扣住的尾段和結束同一段',
      replies: () => [stream([[
        'data: {"choices":[{"index":0,"delta":{"content":"before FAKE-"}}]}\n\n',
        'data: {"choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}\n\n',
        'data: [DONE]\n\n',
      ].join('')])],
      extra: { endpoint: { provider: 'openrouter' }, model: chat.model, apiKey: 'FAKE-key-not-real' },
    },
    // 做完卻沒關：閒置逾時後才補交扣住的尾段（R10 的路）。
    {
      name: '做完沒關',
      replies: () => [stream([chatEvents.filter(e => !e.includes('[DONE]')).join('')], { keepOpen: true })],
      extra: { endpoint: { provider: 'openrouter' }, model: chat.model, apiKey: '能。這不是真的金鑰', idleTimeoutMs: 30 },
    },
  ];
  for (const route of routes) {
    const all: ProgressEvent[] = [];
    await createAiClient({ fetch: mockFetch(route.replies()), clock: instantClock() }).generate(request({ ...route.extra, onProgress: e => all.push(e) }));
    assert.ok(all.some(e => e.type === 'text'), route.name);
    for (let at = 0; at < all.length; at++) {
      if (all[at].type === 'done') continue;
      for (const mode of ['回呼裡', '排到下一步'] as const) {
        const label = `${route.name}／第 ${String(at + 1)} 個事件（${all[at].type}）／${mode}`;
        const controller = new AbortController();
        const late: string[] = [];
        let shown = '';
        let seen = 0;
        const error = await rejects(createAiClient({ fetch: mockFetch(route.replies()), clock: instantClock() }).generate(request({
          ...route.extra, signal: controller.signal,
          onProgress: e => {
            if (controller.signal.aborted) late.push(e.type);
            if (e.type === 'text') shown += e.delta;
            if (seen++ !== at) return;
            if (mode === '回呼裡') controller.abort();
            else queueMicrotask(() => controller.abort());
          },
        })));
        assert.deepEqual(late, [], `${label}：取消之後還交了事件`);
        assert.equal(error.kind, 'cancelled', label);
        assert.ok((error.partialText ?? '').startsWith(shown), `${label}：partialText ${JSON.stringify(error.partialText)} 不含已交出的 ${JSON.stringify(shown)}`);
      }
    }
  }
});
