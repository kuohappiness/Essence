// 本機假 AI 伺服器（tools/fake-ai.ts）：Windows 實機要靠它，所以先確認 Cards 的連線（cardsClient，真的 fetch）讀得懂它回的每一種。
// 只聽 127.0.0.1、隨機埠；假金鑰。
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cardsClient, isAiError } from '../src/core/connect/index.ts';
import type { AiClient } from '../src/core/connect/index.ts';
import { DEFAULT_REPLY, startFakeAi, type FakeAi } from '../tools/fake-ai.ts';

const GOOGLE = 'https://generativelanguage.googleapis.com';
type Request = Parameters<AiClient['generate']>[0];

async function withFake(run: (fake: FakeAi, send: (extra?: Partial<Request>) => ReturnType<AiClient['generate']>) => Promise<void>): Promise<void> {
  const fake = await startFakeAi({ port: 0, slowSeconds: 0.2, chunkMs: 1, trickleMs: 40 });
  const client = cardsClient((url, init) => fetch(url.replace(GOOGLE, fake.url), init as RequestInit));
  const send = (extra: Partial<Request> = {}) => client.generate({
    endpoint: { provider: 'google' }, apiKey: 'AIzaSy-fake-ai-test-0000', model: 'gemini-3.5-flash-lite', maxAttempts: 1,
    input: [{ role: 'user', content: [{ type: 'text', text: '題目' }, { type: 'image', mediaType: 'image/png', data: new Uint8Array([1, 2, 3]) }] }], ...extra,
  });
  try { await run(fake, send); } finally { await fake.close(); }
}

async function next(fake: FakeAi, ...modes: string[]): Promise<void> {
  const res = await fetch(`${fake.url}/__next`, { method: 'POST', body: JSON.stringify({ modes }) });
  assert.equal(res.status, 200);
}

void test('ok、slow 與 bad：收得到整段、用量、模型與回應編號；只記請求的形狀', async () => {
  await withFake(async (fake, send) => {
    const ok = await send();
    assert.equal(ok.text, DEFAULT_REPLY);
    assert.equal(ok.usage.inputTokens, 4200);
    assert.equal(ok.usage.outputTokens, 500);
    assert.equal(ok.usage.reasoningTokens, 120);
    assert.equal(ok.trace.resolvedModel, 'gemini-3.5-flash-lite');
    assert.equal(ok.trace.responseId, 'fake-1');
    assert.deepEqual(fake.seen[0]?.parts, ['text', 'image/png 3 bytes']);
    assert.equal(fake.seen[0]?.keyHeader, true);
    assert.equal(fake.seen[0]?.end, 'done');
    assert.ok(!JSON.stringify(fake.seen).includes('AIzaSy'));
    await next(fake, 'slow', 'bad');
    assert.equal((await send()).text, DEFAULT_REPLY);
    assert.equal((await send()).text, `${DEFAULT_REPLY}\n希望這些卡片有幫助`);
  });
});

void test('錯誤：e500、e429、e401 照 Google 的格式回，套件分得出種類；cut 是網路中斷', async () => {
  await withFake(async (fake, send) => {
    await next(fake, 'e500', 'e429', 'e401', 'cut');
    for (const kind of ['server', 'rate_limit', 'auth', 'network']) {
      const error = await send().then(() => null, (e: unknown) => e);
      assert.ok(isAiError(error), kind);
      assert.equal(error.kind, kind);
    }
    assert.equal(fake.seen[3]?.end, 'cut');
  });
});

void test('trickle 中途取消：伺服器記成 aborted', async () => {
  await withFake(async (fake, send) => {
    await next(fake, 'trickle');
    const stop = new AbortController();
    let chars = 0;
    const sent = send({ signal: stop.signal, onProgress: event => { if (event.type === 'text') { chars = event.totalChars; if (chars > 0) stop.abort(); } } });
    const error = await sent.then(() => null, (e: unknown) => e);
    assert.ok(isAiError(error));
    assert.equal(error.kind, 'cancelled');
    for (let i = 0; i < 50 && fake.seen[0]?.end === null; i++) await new Promise(resolve => setTimeout(resolve, 10));
    assert.equal(fake.seen[0]?.end, 'aborted');
    assert.ok(chars > 0 && chars < DEFAULT_REPLY.length);
  });
});
