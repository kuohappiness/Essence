// Cards 接上 AI 連線套件（apps/Cards/docs/tasks/ai-direct.md §1，docs/tasks/ai-client.md〈8〉第三步）：Cards 只有轉接檔
// src/core/connect/client.ts import 套件的入口，其他檔從 core/connect/index.ts 拿；測試另准 import 套件的 testing 入口（假的 fetch，不連網）。
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mockFetch } from '../../../packages/ai-client/src/testing.ts';
import { createAiClient, describeAiError, isAiError } from '../src/core/connect/index.ts';

const FAKE_KEY = 'sk-cards-connect-test-0000';

void test('轉接檔：用套件的目錄與假的 fetch 測試連線，金鑰對時連得上、金鑰錯時是 auth 並有中文說明，金鑰不出現在錯誤裡', async () => {
  const fetch = mockFetch(request => (request.headers.authorization === `Bearer ${FAKE_KEY}`
    ? { status: 200, headers: { 'content-type': 'application/json' }, chunks: [JSON.stringify({ data: [{ id: 'gpt-5.6-terra' }] })] }
    : { status: 401, headers: { 'content-type': 'application/json' }, chunks: [JSON.stringify({ error: { message: `bad key ${FAKE_KEY}x` } })] }));
  const client = createAiClient({ fetch });
  assert.ok(client.providers().some(provider => provider.id === 'openai'));

  const ok = await client.check({ endpoint: { provider: 'openai' }, apiKey: FAKE_KEY });
  assert.equal(ok.ok, true);
  assert.equal(fetch.requests.length, 1);
  assert.match(fetch.requests[0].url, /^https:\/\/api\.openai\.com\//);

  const bad = await client.check({ endpoint: { provider: 'openai' }, apiKey: FAKE_KEY + 'x' });
  assert.equal(bad.ok, false);
  if (bad.ok) return;
  assert.ok(isAiError(bad.error));
  assert.equal(bad.error.kind, 'auth');
  assert.ok(describeAiError(bad.error).length > 0);
  assert.ok(!JSON.stringify(bad.error).includes(FAKE_KEY) && !String(bad.error.message).includes(FAKE_KEY), '錯誤裡不能有金鑰');
});
