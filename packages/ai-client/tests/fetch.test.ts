// 預設的傳輸層（執行環境的 fetch）對本機的 HTTP 伺服器：邊收邊交、取消會停、轉址不跟。
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import { createAiClient, isAiError, type ProgressEvent } from '../src/index.ts';
import { KEY } from './helpers.ts';

let server: Server;
let baseUrl = '';
const received: { url: string; headers: Record<string, unknown>; body: string }[] = [];

const event = (data: unknown) => `data: ${JSON.stringify(data)}\n\n`;

before(async () => {
  server = createServer((req, res) => {
    let body = '';
    req.on('data', (c: Buffer) => { body += c.toString('utf8'); });
    req.on('end', () => {
      received.push({ url: req.url ?? '', headers: req.headers, body });
      if (req.url === '/redirect/chat/completions') {
        res.writeHead(302, { location: `${baseUrl}/v1/chat/completions` });
        res.end();
        return;
      }
      // 整段本文：/whole 和標頭一起送（同一次寫入），/later 標頭先送、本文 10 ms 後才送（L2 第四輪 第 8 項）。
      if (req.url === '/whole/chat/completions' || req.url === '/later/chat/completions') {
        const body = `${event({ id: 'c1', model: 'local', choices: [{ delta: { content: '完整' }, finish_reason: 'stop' }] })}data: [DONE]\n\n`;
        if (req.url.startsWith('/whole')) {
          res.writeHead(200, { 'content-type': 'text/event-stream', 'content-length': String(Buffer.byteLength(body)) });
          res.end(body);
        } else {
          res.writeHead(200, { 'content-type': 'text/event-stream' });
          res.flushHeaders();
          setTimeout(() => res.end(body), 10);
        }
        return;
      }
      if (req.url === '/hang/chat/completions') {
        res.writeHead(200, { 'content-type': 'text/event-stream' });
        res.write(event({ choices: [{ delta: { content: '開始' } }] }));
        return; // 不結束
      }
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      res.write(event({ id: 'c1', model: 'local', choices: [{ delta: { content: '第一段' } }] }));
      // 第二段晚一點送：呼叫端要先收到第一段。
      setTimeout(() => {
        res.write(event({ choices: [{ delta: { content: '第二段' }, finish_reason: 'stop' }] }));
        res.end('data: [DONE]\n\n');
      }, 80);
    });
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(() => {
  server.closeAllConnections();
  server.close();
});

const endpoint = (path: string) => ({ custom: { dialect: 'openai-chat', baseUrl: `${baseUrl}${path}` } });

void test('邊收邊交：第二段還沒送，第一段已經交給呼叫端', async () => {
  const events: { type: string; at: number }[] = [];
  const started = Date.now();
  const result = await createAiClient().generate({
    endpoint: endpoint('/v1'), apiKey: KEY, model: 'local', input: [{ role: 'user', content: '你好' }],
    onProgress: (e: ProgressEvent) => events.push({ type: e.type, at: Date.now() - started }),
  });
  assert.equal(result.text, '第一段第二段');
  const texts = events.filter(e => e.type === 'text');
  assert.equal(texts.length, 2);
  assert.ok(texts[1].at - texts[0].at >= 50, JSON.stringify(events));
  const sent = received.at(-1)!;
  assert.equal(sent.headers.authorization, `Bearer ${KEY}`);
  assert.equal((JSON.parse(sent.body) as { messages: unknown[] }).messages.length, 1);
});

void test('取消：串流到一半也會停', async () => {
  const controller = new AbortController();
  const promise = createAiClient().generate({
    endpoint: endpoint('/hang'), apiKey: KEY, model: 'local', input: [{ role: 'user', content: '你好' }], signal: controller.signal,
    onProgress: e => { if (e.type === 'text') controller.abort(); },
  });
  await assert.rejects(promise, (e: unknown) => isAiError(e) && e.kind === 'cancelled' && e.partialText === '開始');
});

void test('轉址不跟（金鑰不會被帶到別的網址）', async () => {
  const before = received.length;
  const promise = createAiClient().generate({
    endpoint: endpoint('/redirect'), apiKey: KEY, model: 'local', input: [{ role: 'user', content: '你好' }], maxAttempts: 1,
  });
  await assert.rejects(promise, (e: unknown) => isAiError(e) && e.kind === 'network');
  assert.equal(received.length, before + 1);
});

void test('waiting 的回呼拖過整體期限：回呼結束時本文已經收在本機的照樣交回；還要等網路的，過期的計時器先跑，算 timeout（L2 第四輪 第 8 項）', async () => {
  // 同步的回呼：整個行程（連同這個伺服器）都停住，計時器與網路都要等它結束才輪得到。
  const spin = (ms: number) => { const until = Date.now() + ms; while (Date.now() < until) { /* 忙著 */ } };
  const run = (path: string) => createAiClient().generate({
    endpoint: endpoint(path), apiKey: KEY, model: 'local', input: [{ role: 'user', content: '你好' }], timeoutMs: 300, maxAttempts: 1,
    onProgress: e => { if (e.type === 'waiting') spin(400); },
  });
  // 標頭與整段本文一起到：回呼結束時結果已經完整，和做完沒關的串流同一個前提，不作廢（L2 R10、第三輪 延續 R8）。
  assert.equal((await run('/whole')).text, '完整');
  // 本文還在路上：讀它要等網路，過期的整體計時器先跑。
  await assert.rejects(run('/later'), (e: unknown) => isAiError(e) && e.kind === 'timeout' && e.afterResponse && e.partialText === null);
});
