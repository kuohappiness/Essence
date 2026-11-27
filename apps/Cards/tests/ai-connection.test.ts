// 設定頁「AI 連線」的資料與測試連線（apps/Cards/docs/tasks/ai-direct.md §2）：選單的順序與標籤照 docs/ai-models.md、
// 這台電腦存的設定讀不懂時用預設、金鑰只記名稱、空字串當成沒有金鑰、測試連線的每一種結果是一句話而且沒有金鑰。
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mockFetch } from '../../../packages/ai-client/src/testing.ts';
import { cardsClient, keyOf, modelChoices, modelOf, providerChoices, readConnection, REASONING_CHOICES, testConnection, withSecret } from '../src/core/connect/index.ts';

const FAKE_KEY = 'sk-cards-settings-test-1111';
const client = cardsClient();
const providers = client.providers();
const provider = (id: string) => { const found = providers.find(p => p.id === id); assert.ok(found, id); return found; };

void test('服務的選單：OpenAI（推薦）、Google（免費）排最上面，其他照目錄；模型的推薦放最上面，OpenRouter 沒有選單', () => {
  assert.deepEqual(providerChoices(providers).map(choice => choice.label), ['OpenAI（推薦）', 'Google AI Studio（Gemini）（免費）', 'Anthropic Claude', 'OpenRouter']);
  assert.deepEqual(modelChoices(provider('openai')).map(choice => choice.label), ['GPT-5.6 Terra（推薦）']);
  assert.deepEqual(modelChoices(provider('google')).map(choice => choice.id), ['gemini-3.8-flash', 'gemini-3.5-flash-lite']);
  assert.equal(modelChoices(provider('google'))[0].label, 'Gemini 3.8 Flash（推薦）');
  assert.deepEqual(modelChoices(provider('anthropic')).map(choice => choice.label), ['Claude Opus 5.5', 'Claude Sonnet 5.5', 'Claude Haiku 5.5', 'Claude Fable 5.2']);
  assert.deepEqual(modelChoices(provider('openrouter')), []);
  assert.deepEqual(REASONING_CHOICES.map(choice => choice.label), ['照服務的預設', '低', '中', '高']);
});

void test('這台電腦存的設定：讀不懂的欄位用預設，金鑰的名稱只收 SecretStorage 的格式，換服務再換回來模型還在', () => {
  const empty = readConnection(undefined, providers);
  assert.deepEqual(empty, { provider: 'openai', models: {}, reasoning: 'default', secrets: {} });
  for (const raw of [null, 'x', [1], { provider: 'nope', reasoning: 'max', models: [1], secrets: 'a' }]) assert.deepEqual(readConnection(raw, providers), empty, JSON.stringify(raw));
  const saved = readConnection({
    provider: 'google', reasoning: 'low', models: { google: 'gemini-3.5-flash-lite', openrouter: 'google/gemini-3.8-flash', openai: 7, anthropic: ' ' },
    secrets: { google: 'my-gemini-key', openai: 'Bad Key', anthropic: 3 },
  }, providers);
  assert.deepEqual(saved, { provider: 'google', models: { google: 'gemini-3.5-flash-lite', openrouter: 'google/gemini-3.8-flash' }, reasoning: 'low', secrets: { google: 'my-gemini-key' } });
  assert.equal(modelOf(saved, provider('google')), 'gemini-3.5-flash-lite');
  assert.equal(modelOf(saved, provider('openai')), 'gpt-5.6-terra');
  assert.equal(modelOf(saved, provider('openrouter')), 'google/gemini-3.8-flash');
  assert.equal(modelOf(empty, provider('openrouter')), '');
  // 選單上已經沒有的模型（下架）：改回推薦的。
  assert.equal(modelOf({ ...saved, models: { google: 'gemini-1-gone' } }, provider('google')), 'gemini-3.8-flash');
});

void test('金鑰：只記名稱，值向 SecretStorage 拿；沒選、找不到、存的是空字串或空白都當成沒有', () => {
  const stored = new Map([['my-openai-key', ` ${FAKE_KEY}\n`], ['cleared', ''], ['blank', '   ']]);
  const get = (id: string) => stored.get(id) ?? null;
  let connection = readConnection({ provider: 'openai' }, providers);
  assert.equal(keyOf(connection, get), null);
  connection = withSecret(connection, 'openai', 'my-openai-key');
  assert.deepEqual(connection.secrets, { openai: 'my-openai-key' });
  assert.ok(!JSON.stringify(connection).includes(FAKE_KEY));
  assert.equal(keyOf(connection, get), FAKE_KEY);
  for (const id of ['cleared', 'blank', 'missing']) assert.equal(keyOf(withSecret(connection, 'openai', id), get), null, id);
  assert.deepEqual(withSecret(connection, 'openai', null).secrets, {});
  assert.deepEqual(withSecret(connection, 'openai', 'Not Valid').secrets, {});
  // 金鑰照服務分開：換到別家，沒選過就是沒有。
  assert.equal(keyOf({ ...connection, provider: 'google' }, get), null);
});

void test('測試連線：成功是「連得上」；沒有金鑰不送出；每一種錯誤是套件的說明加下一步，金鑰不在結果裡', async () => {
  const replies: Record<string, { status: number; body: unknown } | 'network'> = {};
  const fetch = mockFetch(request => {
    const reply = replies[new URL(request.url).hostname];
    if (reply === 'network') return { networkError: 'offline' };
    return { status: reply.status, headers: { 'content-type': 'application/json' }, chunks: [JSON.stringify(reply.body)] };
  });
  const fake = cardsClient(fetch);
  replies['api.openai.com'] = { status: 200, body: { data: [{ id: 'gpt-5.6-terra' }] } };
  assert.deepEqual(await testConnection(fake, { provider: 'openai', key: FAKE_KEY }), { ok: true, text: '連得上。' });
  assert.equal(fetch.requests.at(-1)?.headers.authorization, `Bearer ${FAKE_KEY}`);

  const sent = fetch.requests.length;
  assert.deepEqual(await testConnection(fake, { provider: 'openai', key: null }), { ok: false, kind: 'no_key', text: '先在上面選一把這個服務的金鑰，或建立一把新的。' });
  assert.equal(fetch.requests.length, sent);

  replies['api.openai.com'] = { status: 401, body: { error: { message: `Incorrect API key provided: ${FAKE_KEY}` } } };
  const auth = await testConnection(fake, { provider: 'openai', key: FAKE_KEY });
  assert.deepEqual(auth, { ok: false, kind: 'auth', text: '金鑰不對或已失效，請到設定頁重新貼上。' });
  replies['api.openai.com'] = 'network';
  assert.deepEqual(await testConnection(fake, { provider: 'openai', key: FAKE_KEY }), { ok: false, kind: 'network', text: '網路連不上。確認這台電腦連得上網路，再按一次測試連線。' });
  replies['generativelanguage.googleapis.com'] = { status: 429, body: { error: { code: 429, status: 'RESOURCE_EXHAUSTED', message: 'Quota exceeded' } } };
  const quota = await testConnection(fake, { provider: 'google', key: FAKE_KEY });
  assert.equal(quota.ok, false);
  assert.ok(!JSON.stringify([auth, quota]).includes(FAKE_KEY));

  // Anthropic 一律加瀏覽器直連的標頭（D-241 第 3 點）。
  replies['api.anthropic.com'] = { status: 200, body: { data: [{ id: 'claude-opus-5-5' }] } };
  assert.equal((await testConnection(fake, { provider: 'anthropic', key: FAKE_KEY })).ok, true);
  assert.equal(fetch.requests.at(-1)?.headers['anthropic-dangerous-direct-browser-access'], 'true');
});

void test('測試連線：關掉設定頁或停用外掛時中止，回 cancelled，請求真的停下', async () => {
  const fetch = mockFetch([{ status: 200, headersDelayMs: 60_000, chunks: ['{}'] }]);
  const controller = new AbortController();
  const pending = testConnection(cardsClient(fetch), { provider: 'openai', key: FAKE_KEY, signal: controller.signal });
  controller.abort();
  const result = await pending;
  assert.equal(result.ok, false);
  assert.equal(result.ok ? '' : result.kind, 'cancelled');
});
