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
