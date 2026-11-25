// 合格測試（docs/tasks/ai-client.md〈7〉第 11 點）：每一種方言跑同一張情境表，範例在 fixtures/<方言>/。
// 新增方言時加一個 fixtures 資料夾，這張表自動套上；登記了卻沒有範例的方言，第一個測試就會失敗。
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { DIALECTS } from '../src/dialects/index.ts';
import { createAiClient, isAiError, type AiError, type GenerateRequest, type ProgressEvent } from '../src/index.ts';
import { mockFetch, type MockReply } from '../src/testing.ts';
import { KEY, contains, findPart, instantClock, loadCases, readSse } from './helpers.ts';

const cases = loadCases();
const PNG = new Uint8Array([0, 1, 2]);
const PDF = new TextEncoder().encode('%PDF-1.4');

void test('每一種登記的方言都有範例', () => {
  assert.deepEqual(cases.map(c => c.dialect).sort(), [...DIALECTS.keys()].sort());
});

async function rejects(promise: Promise<unknown>): Promise<AiError> {
  try {
    await promise;
  } catch (error) {
    assert.ok(isAiError(error), `應該是 AiError：${String(error)}`);
    return error;
  }
  assert.fail('應該失敗');
}

const sseReply = (body: string, headers: Record<string, string> = {}): MockReply => ({
  status: 200, headers: { 'content-type': 'text/event-stream', ...headers }, chunks: [body],
});

// 成功的回應裡，成功的那一項放在哪裡（各家官方格式）：換成別的值就不是成功的回應（L2 第二輪 R12）。
// lists：裝成功項的陣列；items：一定要是物件的那一項；models：測試連線的模型清單。
const SUCCESS_SHAPE: Record<string, { lists: (string | number)[][]; items: (string | number)[][]; models: string; terminal?: { type: string; field: string } }> = {
  'openai-responses': { lists: [['output']], items: [], models: 'data', terminal: { type: 'response.completed', field: 'response' } },
  'openai-chat': { lists: [['choices']], items: [['choices', 0], ['choices', 0, 'message']], models: 'data' },
  'anthropic-messages': { lists: [['content']], items: [], models: 'data' },
  'gemini-generate-content': { lists: [['candidates']], items: [['candidates', 0]], models: 'models' },
};
const NOT_LIST = [null, 0, 'x', {}];
const STOP_KEYS = ['finish_reason', 'finishReason', 'stop_reason', 'status'];
const NOT_OBJECT = [null, 0, 'x', []];
const ERROR_ITEM = { error: { message: 'upstream failed', code: 502 } };

function replaced(body: unknown, path: (string | number)[], value: unknown): unknown {
  const copy = structuredClone(body) as Record<string | number, unknown>;
  let at = copy;
  for (const key of path.slice(0, -1)) at = at[key] as Record<string | number, unknown>;
  at[path[path.length - 1]] = value;
  return copy;
}

for (const c of cases) {
  void describe(`${c.dialect}（${c.source}）`, () => {
    const base = (extra: Partial<GenerateRequest> = {}): GenerateRequest => ({
      endpoint: c.endpoint, apiKey: KEY, model: c.model, instructions: '只用繁體中文。', input: [{ role: 'user', content: '你好' }], ...extra,
    });
    const run = (replies: MockReply[] | ((index: number) => MockReply), extra: Partial<GenerateRequest> = {}, options: { streaming?: boolean } = {}) => {
      const fetch = mockFetch(Array.isArray(replies) ? replies : (_r, i) => replies(i), options);
      const clock = instantClock();
      const client = createAiClient({ fetch, clock });
      return { fetch, clock, promise: client.generate(base(extra)) };
    };
    const success = () => sseReply(readSse(c, c.stream.file), c.stream.headers);

    void test('純文字的請求：網址、認證、本文', async () => {
      const { fetch, promise } = run([success()]);
      await promise;
      const sent = fetch.requests[0];
      assert.equal(sent.url, c.request.url);
      assert.equal(sent.method, 'POST');
      assert.equal(sent.headers[c.request.authHeader], c.request.authValue.replace('{key}', KEY));
      for (const [name, value] of Object.entries(c.request.headers)) assert.equal(sent.headers[name], value);
      assert.ok(contains(JSON.parse(sent.body ?? ''), c.request.textBody), sent.body ?? '');
    });

    void test('文字加圖片、文字加 PDF：檔案照那一家的格式', async () => {
      const fetch = mockFetch([success()]);
      await createAiClient({ fetch, clock: instantClock() }).generate(base({
        input: [{ role: 'user', content: [
          { type: 'file', mediaType: 'application/pdf', name: 'U5.pdf', data: PDF },
          { type: 'image', mediaType: 'image/png', data: PNG },
          { type: 'text', text: '照教材出題' },
        ] }],
      }));
      const body = JSON.parse(fetch.requests[0].body ?? '') as unknown;
      assert.ok(findPart(body, c.request.imagePart), `找不到圖片：${JSON.stringify(c.request.imagePart)}`);
      assert.ok(findPart(body, c.request.pdfPart), `找不到 PDF：${JSON.stringify(c.request.pdfPart)}`);
    });

    void test('輸出上限與推理等級寫在那一家的欄位', async () => {
      const { fetch, promise } = run([success()], { maxOutputTokens: 1000, reasoning: 'high' });
      const result = await promise;
      const body = JSON.parse(fetch.requests[0].body ?? '') as unknown;
      assert.ok(contains(body, c.request.maxOutputTokens), fetch.requests[0].body ?? '');
      assert.ok(contains(body, c.request.reasoningHigh), fetch.requests[0].body ?? '');
      assert.equal(result.trace.reasoningSent, 'high');
    });

    void test('串流成功：文字、停止原因、用量、證據', async () => {
      const events: ProgressEvent[] = [];
      const { promise } = run([success()], { onProgress: e => events.push(e) });
      const result = await promise;
      assert.equal(result.text, c.stream.text);
      assert.equal(result.stopReason, c.stream.stopReason);
      assert.equal(result.trace.rawStopReason, c.stream.rawStopReason);
      assert.deepEqual(result.usage, c.stream.usage);
      assert.equal(result.trace.resolvedModel, c.stream.resolvedModel);
      assert.equal(result.trace.requestId, c.stream.requestId);
      assert.equal(result.trace.responseId, c.stream.responseId);
      assert.equal(result.trace.dialect, c.dialect);
      assert.equal(result.trace.attempts.length, 1);
      assert.deepEqual(result.message, { role: 'assistant', content: [{ type: 'text', text: c.stream.text }] });
      if (c.stream.reportedCost !== undefined) assert.deepEqual(result.cost, { amount: c.stream.reportedCost, currency: 'USD', estimated: false, pricesAsOf: null });
      const types = events.map(e => e.type);
      assert.deepEqual([types[0], types[1], types.at(-1)], ['sent', 'waiting', 'done']);
      assert.equal(events.filter(e => e.type === 'text').map(e => (e.type === 'text' ? e.delta : '')).join(''), c.stream.text);
    });

    void test('中文不斷字：在每一個位元組切成兩段，結果都一樣', async () => {
      const bytes = new TextEncoder().encode(readSse(c, c.stream.file));
      for (let i = 1; i < bytes.length; i++) {
        const fetch = mockFetch([{ status: 200, headers: c.stream.headers, chunks: [bytes.subarray(0, i), bytes.subarray(i)] }]);
        const result = await createAiClient({ fetch, clock: instantClock() }).generate(base());
        assert.equal(result.text, c.stream.text, `切在第 ${i} 個位元組`);
      }
    });

    void test('CRLF 換行、一個位元組一段：結果一樣', async () => {
      const bytes = new TextEncoder().encode(readSse(c, c.stream.file).replaceAll('\n', '\r\n'));
      const fetch = mockFetch([{ status: 200, headers: c.stream.headers, chunks: [...bytes].map(b => new Uint8Array([b])) }]);
      const result = await createAiClient({ fetch, clock: instantClock() }).generate(base());
      assert.equal(result.text, c.stream.text);
      assert.deepEqual(result.usage, c.stream.usage);
    });

    void test('傳輸層不串流（整段最後才到）：結果一樣', async () => {
      const { promise } = run([success()], {}, { streaming: false });
      const result = await promise;
      assert.equal(result.text, c.stream.text);
      assert.deepEqual(result.usage, c.stream.usage);
    });

    void test('服務沒照要求串流、直接回 JSON：照樣讀', async () => {
      const { promise } = run([{ status: 200, headers: { 'content-type': 'application/json' }, chunks: [JSON.stringify(c.json.body)] }]);
      const result = await promise;
      assert.equal(result.text, c.json.text);
      assert.equal(result.stopReason, c.json.stopReason);
    });

    void test('服務回 200 JSON：Content-Type 大小寫不同照樣讀；形狀不對算 server，不當成空白的成功（L2 R12）', async () => {
      const upper = run([{ status: 200, headers: { 'content-type': 'Application/JSON; charset=utf-8' }, chunks: [JSON.stringify(c.json.body)] }]);
      assert.equal((await upper.promise).text, c.json.text);
      const wrong = run([{ status: 200, headers: { 'content-type': 'application/json' }, chunks: ['{"ok":true}'] }]);
      const error = await rejects(wrong.promise);
      assert.deepEqual([error.kind, error.afterResponse, wrong.fetch.requests.length], ['server', true, 1]);
    });

    void test('測試連線：200 卻不是模型清單（錯誤物件、HTML 登入頁）算失敗（L2 R12）', async () => {
      for (const [type, body] of [['application/json', '{"error":{"message":"no"}}'], ['text/html', '<html>login</html>']]) {
        const fetch = mockFetch([{ status: 200, headers: { 'content-type': type }, chunks: [body] }]);
        const result = await createAiClient({ fetch }).check({ endpoint: c.endpoint, apiKey: KEY });
        assert.ok(!result.ok, `${c.dialect}：${body}`);
      }
    });

    void test('200 的回應不是成功的形狀，整類都不算成功：成功的那一項換成別的值、不是串流的本文、模型清單裡沒有模型（L2 第二輪 R12）', async () => {
      const shape = SUCCESS_SHAPE[c.dialect];
      assert.ok(shape, `${c.dialect} 要在 SUCCESS_SHAPE 登記成功項的位置`);
      const bodies: [string, unknown][] = [
        ...shape.lists.flatMap(path => NOT_LIST.map(v => [`${path.join('.')} = ${JSON.stringify(v)}`, replaced(c.json.body, path, v)] as [string, unknown])),
        ...shape.items.flatMap(path => NOT_OBJECT.map(v => [`${path.join('.')} = ${JSON.stringify(v)}`, replaced(c.json.body, path, v)] as [string, unknown])),
        ...shape.items.slice(0, 1).map(path => [`${path.join('.')} = 錯誤物件`, replaced(c.json.body, path, ERROR_ITEM)] as [string, unknown]),
      ];
      for (const [label, body] of bodies) {
        const { fetch, promise } = run([{ status: 200, headers: { 'content-type': 'application/json' }, chunks: [JSON.stringify(body)] }]);
        const error = await rejects(promise);
        assert.deepEqual([error.afterResponse, error.retryable, fetch.requests.length], [true, false, 1], `${c.dialect} ${label}`);
        if (!label.endsWith('錯誤物件')) assert.equal(error.kind, 'server', `${c.dialect} ${label}`);
      }

      if (shape.terminal) {
        const { type, field } = shape.terminal;
        for (const v of NOT_OBJECT) {
          const events = readSse(c, c.stream.file).split(/\n\n/).filter(Boolean).map(e => {
            const data = e.split('\n').find(line => line.startsWith('data: '))?.slice(6);
            if (!data || data === '[DONE]') return `${e}\n\n`;
            const json = JSON.parse(data) as Record<string, unknown>;
            if (json.type !== type) return `${e}\n\n`;
            return `${e.split('\n').filter(line => !line.startsWith('data: ')).join('\n')}\ndata: ${JSON.stringify({ ...json, [field]: v })}\n\n`;
          });
          const { promise } = run([sseReply(events.join(''))]);
          const error = await rejects(promise);
          assert.deepEqual([error.kind, error.afterResponse], ['server', true], `${c.dialect} ${type}.${field} = ${JSON.stringify(v)}`);
        }
      }

      for (const [type, body] of [['text/html', '<html>login</html>'], ['text/plain', 'OK'], ['', '']]) {
        const { fetch, promise } = run([{ status: 200, headers: { 'content-type': type }, chunks: [body] }]);
        const error = await rejects(promise);
        assert.deepEqual([error.kind, error.afterResponse, fetch.requests.length], ['server', true, 1], `${c.dialect} 200 ${type || '沒有 Content-Type'}`);
      }

      // 自訂的服務沒有 checkPath，一定讀模型清單。
      const listed = { custom: { dialect: c.dialect, baseUrl: 'https://api.example.com/v1' } };
      for (const entries of [[null], [0], ['x'], [{}], [ERROR_ITEM]]) {
        const fetch = mockFetch([{ status: 200, headers: { 'content-type': 'application/json' }, chunks: [JSON.stringify({ [shape.models]: entries })] }]);
        const result = await createAiClient({ fetch, clock: instantClock() }).check({ endpoint: listed, apiKey: KEY });
        assert.ok(!result.ok, `${c.dialect} 模型清單 ${JSON.stringify(entries)}`);
        assert.deepEqual([result.error.kind, result.error.afterResponse, result.error.retryable], ['server', true, false], `${c.dialect} 模型清單 ${JSON.stringify(entries)}`);
      }
      const none = mockFetch([{ status: 200, headers: { 'content-type': 'application/json' }, chunks: [JSON.stringify({ [shape.models]: [] })] }]);
      assert.deepEqual(await createAiClient({ fetch: none, clock: instantClock() }).check({ endpoint: listed, apiKey: KEY }), { ok: true, models: [] });
    });

    void test('200 的成功一定要有服務說的停止原因、而且有文字，整類：只有輸出上限到了算空的結果，被擋算 content_blocked，其餘都算 server（L2 第三輪 延續 R12）', async () => {
      const shape = SUCCESS_SHAPE[c.dialect];
      // 各家放停止原因的欄位（Responses 的 status 也在每一個輸出項上，一起拿掉）。
      const withoutStop = (value: unknown): unknown =>
        Array.isArray(value) ? value.map(withoutStop)
          : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).filter(([k]) => !STOP_KEYS.includes(k)).map(([k, v]) => [k, withoutStop(v)]))
          : value;
      // 把範例裡屬於回答文字的字串都換成空的：成功的形狀照舊，只是沒有文字。
      const blank = (value: unknown, text: string): unknown =>
        typeof value === 'string' ? (value && text.includes(value) ? '' : value)
          : Array.isArray(value) ? value.map(v => blank(v, text))
          : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([k, v]) => [k, blank(v, text)]))
          : value;
      const mapSse = (sse: string, change: (data: unknown) => unknown) => sse.split(/\n\n/).filter(Boolean).map(e => e.split('\n').map(line => {
        const data = line.startsWith('data: ') ? line.slice(6) : null;
        return data && data !== '[DONE]' ? `data: ${JSON.stringify(change(JSON.parse(data)))}` : line;
      }).join('\n')).map(e => `${e}\n\n`).join('');
      const blankSse = (sse: string, text: string) => mapSse(sse, data => blank(data, text));

      const bodies: [string, unknown][] = [
        ['文字都是空的', blank(c.json.body, c.json.text)],
        ['沒有停止原因', withoutStop(c.json.body)],
        ...shape.lists.map(path => [`${path.join('.')} = []`, replaced(c.json.body, path, [])] as [string, unknown]),
        ...shape.items.flatMap(path => [
          [`${path.join('.')} = {}`, replaced(c.json.body, path, {})],
          [`${path.join('.')} 只有 error`, replaced(c.json.body, path, ERROR_ITEM)],
        ] as [string, unknown][]),
      ];
      for (const [label, body] of bodies) {
        const { promise } = run([{ status: 200, headers: { 'content-type': 'application/json' }, chunks: [JSON.stringify(body)] }]);
        const error = await rejects(promise);
        assert.deepEqual([error.afterResponse, error.retryable], [true, false], `${c.dialect} JSON ${label}`);
        if (!label.endsWith('error')) assert.equal(error.kind, 'server', `${c.dialect} JSON ${label}`);
      }

      const streams: [string, string][] = [
        ['文字都是空的', blankSse(readSse(c, c.stream.file), c.stream.text ?? '')],
        ['沒有停止原因', mapSse(readSse(c, c.stream.file), withoutStop)],
      ];
      if (shape.terminal) {
        const { type, field } = shape.terminal;
        for (const [label, v] of [['{}', {}], ['只有 error', ERROR_ITEM]] as const) {
          const events = readSse(c, c.stream.file).split(/\n\n/).filter(Boolean).map(e => {
            const data = e.split('\n').find(line => line.startsWith('data: '))?.slice(6);
            if (!data || data === '[DONE]') return `${e}\n\n`;
            const json = JSON.parse(data) as Record<string, unknown>;
            if (json.type !== type) return `${e}\n\n`;
            return `${e.split('\n').filter(line => !line.startsWith('data: ')).join('\n')}\ndata: ${JSON.stringify({ ...json, [field]: v })}\n\n`;
          });
          streams.push([`${type}.${field} ${label}`, events.join('')]);
        }
      }
      for (const [label, body] of streams) {
        const error = await rejects(run([sseReply(body)]).promise);
        assert.deepEqual([error.afterResponse, error.retryable], [true, false], `${c.dialect} 串流 ${label}`);
        // 串流沒有停止原因的，有的方言因此等不到做完的訊號，算 network；一樣不是成功。
        if (!label.endsWith('error') && label !== '沒有停止原因') assert.equal(error.kind, 'server', `${c.dialect} 串流 ${label}`);
      }

      // 輸出上限到了、一個字都沒寫（推理模型想完了還沒開始寫）：是結果，不是錯誤。
      const cut = await run([sseReply(blankSse(readSse(c, c.length.file), c.length.text ?? ''))]).promise;
      assert.deepEqual([cut.text, cut.stopReason], ['', 'length'], c.dialect);
    });

    void test('停止原因的空字串和沒有一樣，各家在讀的地方就當成沒有；前面已經有的，不會被後面一塊的空字串蓋掉（L2 第四輪 第 6 項）', async () => {
      // 停止原因的欄位換成某個值（Responses 的 status 也在每一個輸出項上，一起換）。
      const withStop = (value: unknown, stop: unknown): unknown =>
        Array.isArray(value) ? value.map(v => withStop(v, stop))
          : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([k, v]) => [k, STOP_KEYS.includes(k) ? stop : withStop(v, stop)]))
          : value;
      const mapSse = (sse: string, change: (data: unknown) => unknown) => sse.split(/\n\n/).filter(Boolean).map(e => e.split('\n').map(line => {
        const data = line.startsWith('data: ') ? line.slice(6) : null;
        return data && data !== '[DONE]' ? `data: ${JSON.stringify(change(JSON.parse(data)))}` : line;
      }).join('\n')).map(e => `${e}\n\n`).join('');
      // 沒有、null、空字串；Responses 另外加不是結束的狀態（還在做、排隊中）。
      const stops: unknown[] = [undefined, null, '', ...(c.dialect === 'openai-responses' ? ['in_progress', 'queued'] : [])];
      for (const stop of stops) {
        const label = stop === undefined ? '沒有' : JSON.stringify(stop);
        const json = await rejects(run([{ status: 200, headers: { 'content-type': 'application/json' }, chunks: [JSON.stringify(withStop(c.json.body, stop))] }]).promise);
        assert.deepEqual([json.kind, json.afterResponse, json.retryable], ['server', true, false], `${c.dialect} JSON 停止原因 ${label}`);
        const streamed = await rejects(run([sseReply(mapSse(readSse(c, c.stream.file), data => withStop(data, stop)))]).promise);
        assert.deepEqual([streamed.afterResponse, streamed.retryable, streamed.partialText], [true, false, c.stream.text], `${c.dialect} 串流停止原因 ${label}`);
        // 沒有結束事件的（Gemini）等不到做完的訊號，算 network；其餘算 server。都不是成功。
        assert.equal(streamed.kind, c.dialect === 'gemini-generate-content' ? 'network' : 'server', `${c.dialect} 串流停止原因 ${label}`);
      }
      // 先有停止原因，後面一塊（用量、轉接服務補的）帶空字串：照前面的，結果是成功。Responses 的結束事件只有一個，不適用。
      const LATER_EMPTY: Record<string, { event: unknown; before: string | null }> = {
        'openai-chat': { event: { id: 'x', choices: [{ index: 0, delta: {}, finish_reason: '' }] }, before: '[DONE]' },
        'anthropic-messages': { event: { type: 'message_delta', delta: { stop_reason: '' } }, before: '"message_stop"' },
        'gemini-generate-content': { event: { candidates: [{ finishReason: '' }] }, before: null },
      };
      const later = LATER_EMPTY[c.dialect];
      if (later) {
        const events = readSse(c, c.stream.file).split(/\n\n/).filter(Boolean).map(e => `${e}\n\n`);
        const at = later.before === null ? events.length : events.findIndex(e => e.includes(later.before!));
        assert.ok(at >= 0, c.dialect);
        events.splice(at, 0, `data: ${JSON.stringify(later.event)}\n\n`);
        const result = await run([sseReply(events.join(''))]).promise;
        assert.deepEqual([result.text, result.stopReason, result.trace.rawStopReason], [c.stream.text, c.stream.stopReason, c.stream.rawStopReason ?? result.trace.rawStopReason], c.dialect);
        assert.ok(result.trace.rawStopReason, `${c.dialect}：前面的停止原因不見了`);
      }
    });

    void test('輸出上限到了：算結果，停止原因 length', async () => {
      const { promise } = run([sseReply(readSse(c, c.length.file))]);
      const result = await promise;
      assert.equal(result.text, c.length.text);
      assert.equal(result.stopReason, 'length');
      assert.equal(result.trace.rawStopReason, c.length.rawStopReason);
    });

    void test('完全沒有輸出就被擋：丟 content_blocked，不重試', async () => {
      const { fetch, promise } = run([sseReply(readSse(c, c.filter.file))]);
      const error = await rejects(promise);
      assert.equal(error.kind, 'content_blocked');
      // 已經拿到 2xx：服務可能已經計費（L2 R12）。
      assert.deepEqual([error.afterResponse, error.retryable], [true, false]);
      assert.equal(fetch.requests.length, 1);
    });

    void test('拿到 200 後串流裡來了錯誤：照種類分，不自動重試', async () => {
      const { fetch, promise } = run([sseReply(readSse(c, c.streamError.file))]);
      const error = await rejects(promise);
      assert.equal(error.kind, c.streamError.kind);
      assert.equal(error.providerCode, c.streamError.providerCode);
      assert.equal(error.afterResponse, true);
      assert.equal(fetch.requests.length, 1);
    });

    void test('結束之後串流沒關：有結束事件的不等，Gemini 這類沒有的在逾時時照已收到的交回（L2 R10）', async () => {
      const started = Date.now();
      if (c.dialect === 'gemini-generate-content') {
        const { promise } = run([{ ...success(), keepOpen: true }], { idleTimeoutMs: 30 });
        const result = await promise;
        assert.equal(result.text, c.stream.text);
        assert.ok(result.trace.warnings.some(w => w.includes('stayed open')), result.trace.warnings.join('; '));
        return;
      }
      const { promise } = run([{ ...success(), keepOpen: true }], { timeoutMs: 5_000 });
      const result = await promise;
      assert.equal(result.text, c.stream.text);
      assert.deepEqual(result.usage, c.stream.usage);
      assert.ok(Date.now() - started < 1_000, `等了 ${Date.now() - started} ms`);
    });

    void test('串流沒有結束事件就斷了：network，帶已收到的文字，不自動重試', async () => {
      const full = readSse(c, c.stream.file);
      const events = full.split(/\n\n/).filter(Boolean);
      // 只留到第一段文字為止：之後的（含結束事件）都沒到。
      const firstText = events.findIndex(e => e.includes('光合作用把'));
      const cut = events.slice(0, firstText + 1).join('\n\n') + '\n\n';
      const { fetch, promise } = run([sseReply(cut, c.stream.headers)]);
      const error = await rejects(promise);
      assert.equal(error.kind, 'network');
      assert.equal(error.partialText, '光合作用把');
      assert.equal(error.afterResponse, true);
      assert.equal(fetch.requests.length, 1);
    });

    void test('串流中途斷線：network，帶已收到的文字，不自動重試', async () => {
      const full = readSse(c, c.stream.file);
      const events = full.split(/\n\n/).filter(Boolean).map(e => `${e}\n\n`);
      const firstText = events.findIndex(e => e.includes('光合作用把'));
      const { fetch, promise } = run([{ status: 200, headers: c.stream.headers, chunks: events, dropAfter: firstText + 1 }]);
      const error = await rejects(promise);
      assert.equal(error.kind, 'network');
      assert.equal(error.partialText, '光合作用把');
      assert.equal(fetch.requests.length, 1);
    });

    void test('串流格式壞掉：server，不自動重試', async () => {
      const { fetch, promise } = run([sseReply('data: {not json\n\n')]);
      const error = await rejects(promise);
      assert.equal(error.kind, 'server');
      assert.equal(error.afterResponse, true);
      assert.equal(fetch.requests.length, 1);
    });

    for (const e of c.errors) {
      void test(`HTTP ${e.status} → ${e.kind}${e.retryAfterMs ? `（等 ${e.retryAfterMs} ms）` : ''}`, async () => {
        const reply = { status: e.status, headers: { 'content-type': 'application/json', ...e.headers }, chunks: [JSON.stringify(e.body)] };
        const { fetch, promise } = run([reply], { maxAttempts: 1 });
        const error = await rejects(promise);
        assert.equal(error.kind, e.kind);
        assert.equal(error.status, e.status);
        assert.equal(error.afterResponse, false);
        if (e.retryAfterMs !== undefined) assert.equal(error.retryAfterMs, e.retryAfterMs);
        assert.equal(fetch.requests.length, 1);
      });
    }

    const retryable = c.errors.find(e => e.kind === 'rate_limit' && e.retryAfterMs !== undefined);
    if (retryable) {
      void test('429 帶等待時間，照它等之後成功', async () => {
        const events: ProgressEvent[] = [];
        const reply = { status: 429, headers: { 'content-type': 'application/json', ...retryable.headers }, chunks: [JSON.stringify(retryable.body)] };
        const { fetch, clock, promise } = run([reply, success()], { onProgress: ev => events.push(ev) });
        const result = await promise;
        assert.equal(result.text, c.stream.text);
        assert.equal(fetch.requests.length, 2);
        assert.deepEqual(clock.sleeps, [retryable.retryAfterMs]);
        assert.deepEqual(events.find(ev => ev.type === 'retrying'), { type: 'retrying', attempt: 2, delayMs: retryable.retryAfterMs, reason: 'rate_limit' });
      });
    }

    const server = c.errors.find(e => e.kind === 'server');
    if (server) {
      void test('伺服器錯兩次後成功：等 2 秒、8 秒，記下每一次', async () => {
        const reply = { status: server.status, headers: { 'content-type': 'application/json' }, chunks: [JSON.stringify(server.body)] };
        const { fetch, clock, promise } = run([reply, reply, success()]);
        const result = await promise;
        assert.equal(result.text, c.stream.text);
        assert.equal(fetch.requests.length, 3);
        assert.deepEqual(clock.sleeps, [2000, 8000]);
        assert.deepEqual(result.trace.attempts.map(a => [a.status, a.error]), [[server.status, 'server'], [server.status, 'server'], [200, null]]);
      });
    }

    const auth = c.errors.find(e => e.kind === 'auth');
    if (auth) {
      void test('金鑰錯誤不重試；回應裡出現金鑰也遮掉', async () => {
        const body = JSON.stringify(auth.body).replace('"message":"', `"message":"key ${KEY}: `);
        const { fetch, promise } = run([{ status: auth.status, headers: { 'content-type': 'application/json' }, chunks: [body] }]);
        const error = await rejects(promise);
        assert.equal(error.kind, 'auth');
        assert.equal(fetch.requests.length, 1);
        assert.ok(!error.message.includes(KEY));
        assert.ok(!JSON.stringify(error).includes(KEY));
        assert.ok(!String(error.stack).includes(KEY));
      });
    }

    void test('串流中途取消：cancelled，帶已收到的文字，之後不再有進度', async () => {
      const controller = new AbortController();
      const events: ProgressEvent[] = [];
      const parts = readSse(c, c.stream.file).split(/\n\n/).filter(Boolean).map(e => `${e}\n\n`);
      const fetch = mockFetch([{ status: 200, headers: c.stream.headers, chunks: parts, delayMs: 5 }]);
      const promise = createAiClient({ fetch, clock: instantClock() }).generate(base({
        signal: controller.signal,
        onProgress: e => { events.push(e); if (e.type === 'text') controller.abort(); },
      }));
      const error = await rejects(promise);
      assert.equal(error.kind, 'cancelled');
      assert.equal(error.partialText, '光合作用把');
      const count = events.length;
      await new Promise(resolve => setTimeout(resolve, 50));
      assert.equal(events.length, count);
      assert.equal(fetch.requests.length, 1);
    });

    void test('測試連線：讀模型清單或 checkPath，帶金鑰', async () => {
      const fetch = mockFetch([{ status: c.check.status, headers: { 'content-type': 'application/json' }, chunks: [JSON.stringify(c.check.body)] }]);
      const result = await createAiClient({ fetch }).check({ endpoint: c.endpoint, apiKey: KEY });
      assert.ok(result.ok);
      assert.deepEqual(result.models?.map(m => m.id) ?? null, c.check.models);
      assert.equal(fetch.requests[0].method, 'GET');
      assert.equal(fetch.requests[0].headers[c.request.authHeader], c.request.authValue.replace('{key}', KEY));
    });

    const checkAuth = c.errors.find(e => e.kind === 'auth');
    if (checkAuth) {
      void test('測試連線：金鑰錯誤回 ok: false', async () => {
        const fetch = mockFetch([{ status: checkAuth.status, chunks: [JSON.stringify(checkAuth.body)] }]);
        const result = await createAiClient({ fetch }).check({ endpoint: c.endpoint, apiKey: KEY });
        assert.ok(!result.ok);
        assert.equal(result.error.kind, 'auth');
      });
    }
  });
}
