// 設定頁「AI 連線」的資料與測試連線（apps/Cards/docs/tasks/ai-direct.md §2）：選單的順序與標籤照 docs/ai-models.md、
// 這台電腦存的設定讀不懂時用預設、金鑰只記名稱、空字串當成沒有金鑰、測試連線的每一種結果是一句話而且沒有金鑰。
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mockFetch } from '../../../packages/ai-client/src/testing.ts';
import { cardsClient, keyOf, modelChoices, modelOf, providerChoices, providerName, readConnection, REASONING_CHOICES, sharedWith, testConnection, withSecret } from '../src/core/connect/index.ts';

const FAKE_KEY = 'sk-cards-settings-test-1111';
const client = cardsClient();
const providers = client.providers();
const provider = (id: string) => { const found = providers.find(p => p.id === id); assert.ok(found, id); return found; };

void test('服務的選單：OpenAI（推薦）、Google（免費）排最上面，其他照目錄；模型的推薦放最上面，OpenRouter 沒有選單', () => {
  assert.deepEqual(providerChoices(providers).map(choice => choice.label), ['OpenAI（推薦）', 'Google Gemini（免費）', 'Anthropic Claude', 'OpenRouter']);
  assert.deepEqual(modelChoices(provider('openai')).map(choice => choice.label), ['GPT-5.6 Terra（推薦）']);
  assert.deepEqual(modelChoices(provider('google')).map(choice => choice.id), ['gemini-3.8-flash', 'gemini-3.5-flash-lite']);
  assert.equal(modelChoices(provider('google'))[0].label, 'Gemini 3.8 Flash（推薦）');
  assert.deepEqual(modelChoices(provider('anthropic')).map(choice => choice.label), ['Claude Opus 5.5', 'Claude Sonnet 5.5', 'Claude Haiku 5.5', 'Claude Fable 5.2']);
  assert.deepEqual(modelChoices(provider('openrouter')), []);
  assert.deepEqual(REASONING_CHOICES.map(choice => choice.label), ['照服務的預設', '低', '中', '高']);
  // 選單上的名稱照 docs/ai-models.md〈外掛的預設選單〉（L2 第一輪 R11 第 5 項）；表上沒有的照目錄。
  assert.deepEqual(providers.map(providerName), ['OpenAI', 'Anthropic Claude', 'Google Gemini', 'OpenRouter']);
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

void test('金鑰：只記名稱，值向 SecretStorage 拿；沒選、找不到或是空的、樣子不像金鑰，各自分開，都不交出值', () => {
  // 樣子不像金鑰（L2 第一輪 R4）：短於 8 個字、中間有空白或換行、全形字、網站遮罩的省略號。
  const malformed = { short: 'sk-1234', spaced: 'sk-abcd efgh-1234', newline: 'sk-abcd\nefgh1234', fullwidth: 'sk-ａｂｃｄ12345678', masked: 'sk-…abcd1234' };
  const stored = new Map([['my-openai-key', ` ${FAKE_KEY}\n`], ['cleared', ''], ['blank', '   '], ...Object.entries(malformed)]);
  const get = (id: string) => stored.get(id) ?? null;
  let connection = readConnection({ provider: 'openai' }, providers);
  assert.deepEqual(keyOf(connection, get), { ok: false, why: 'unset' });
  connection = withSecret(connection, 'openai', 'my-openai-key');
  assert.deepEqual(connection.secrets, { openai: 'my-openai-key' });
  assert.ok(!JSON.stringify(connection).includes(FAKE_KEY));
  assert.deepEqual(keyOf(connection, get), { ok: true, key: FAKE_KEY });
  for (const id of ['cleared', 'blank', 'missing']) assert.deepEqual(keyOf(withSecret(connection, 'openai', id), get), { ok: false, why: 'empty' }, id);
  for (const id of Object.keys(malformed)) assert.deepEqual(keyOf(withSecret(connection, 'openai', id), get), { ok: false, why: 'malformed' }, id);
  // 各家真的金鑰的樣子都收（自編、照各家的前綴與字元）。
  for (const key of ['sk-proj-Ab_12-cd34EF56gh78', 'sk-ant-api03-Ab12_cd-34', 'AIzaSyAb12cd34_EF-56gh78ij', 'sk-or-v1-0123456789abcdef']) {
    assert.deepEqual(keyOf(withSecret(connection, 'openai', 'real-shape'), id => (id === 'real-shape' ? key : null)), { ok: true, key }, key);
  }
  assert.deepEqual(withSecret(connection, 'openai', null).secrets, {});
  assert.deepEqual(withSecret(connection, 'openai', 'Not Valid').secrets, {});
  assert.deepEqual(withSecret(connection, 'openai', '').secrets, {});
  // - 連續或在頭尾也收（Obsidian 沒說不行，L2 第一輪 R9）；重讀這台電腦的設定時也留著。
  for (const id of ['openai-', '-openai', 'open--ai']) {
    assert.deepEqual(withSecret(connection, 'openai', id).secrets, { openai: id }, id);
    assert.deepEqual(readConnection({ secrets: { openai: id } }, providers).secrets, { openai: id }, id);
  }
  // 金鑰照服務分開：換到別家，沒選過就是沒有。
  assert.deepEqual(keyOf({ ...connection, provider: 'google' }, get), { ok: false, why: 'unset' });
  // 同一個名稱設給好幾家（L2 第一輪 R8）：列出其他用同名的那幾家，自己不算；沒選、名稱不同的不列。
  const both = withSecret(withSecret(withSecret(connection, 'google', 'my-openai-key'), 'anthropic', 'my-openai-key'), 'openrouter', 'other-key');
  assert.deepEqual(sharedWith(both), ['google', 'anthropic']);
  assert.deepEqual(sharedWith({ ...both, provider: 'google' }), ['openai', 'anthropic']);
  assert.deepEqual(sharedWith({ ...both, provider: 'openrouter' }), []);
  assert.deepEqual(sharedWith(connection), []);
  assert.deepEqual(sharedWith(readConnection({ provider: 'openai' }, providers)), []);
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
  assert.deepEqual(await testConnection(fake, { provider: 'openai', key: { ok: true, key: FAKE_KEY } }), { ok: true, text: '連得上。' });
  assert.equal(fetch.requests.at(-1)?.headers.authorization, `Bearer ${FAKE_KEY}`);

  // 沒有可用的金鑰：各寫一句、指向金鑰，不送出（L2 第一輪 R4、R11 第 4 項）。
  const sent = fetch.requests.length;
  assert.deepEqual(await testConnection(fake, { provider: 'openai', key: { ok: false, why: 'unset' } }), { ok: false, kind: 'no_key', text: '先在上面選一把這個服務的金鑰，或建立一把新的。' });
  assert.deepEqual(await testConnection(fake, { provider: 'openai', key: { ok: false, why: 'empty' } }), { ok: false, kind: 'empty_key', text: '這把金鑰是空的或找不到，請重新貼上，或選另一把。' });
  assert.deepEqual(await testConnection(fake, { provider: 'openai', key: { ok: false, why: 'malformed' } }), { ok: false, kind: 'bad_key', text: '這把金鑰看起來不完整，或夾了空白、全形字，請到服務的網站重新複製再貼上。' });
  assert.equal(fetch.requests.length, sent);

  replies['api.openai.com'] = { status: 401, body: { error: { message: `Incorrect API key provided: ${FAKE_KEY}` } } };
  const auth = await testConnection(fake, { provider: 'openai', key: { ok: true, key: FAKE_KEY } });
  assert.deepEqual(auth, { ok: false, kind: 'auth', text: '金鑰不對或已失效，請到設定頁重新貼上。' });
  replies['api.openai.com'] = 'network';
  assert.deepEqual(await testConnection(fake, { provider: 'openai', key: { ok: true, key: FAKE_KEY } }), { ok: false, kind: 'network', text: '網路連不上。確認這台電腦連得上網路，再按一次測試連線。' });
  replies['generativelanguage.googleapis.com'] = { status: 429, body: { error: { code: 429, status: 'RESOURCE_EXHAUSTED', message: 'Quota exceeded' } } };
  const quota = await testConnection(fake, { provider: 'google', key: { ok: true, key: FAKE_KEY } });
  assert.equal(quota.ok, false);
  assert.ok(!JSON.stringify([auth, quota]).includes(FAKE_KEY));

  // Anthropic 一律加瀏覽器直連的標頭（D-241 第 3 點）。
  replies['api.anthropic.com'] = { status: 200, body: { data: [{ id: 'claude-opus-5-5' }] } };
  assert.equal((await testConnection(fake, { provider: 'anthropic', key: { ok: true, key: FAKE_KEY } })).ok, true);
  assert.equal(fetch.requests.at(-1)?.headers['anthropic-dangerous-direct-browser-access'], 'true');
});

void test('測試連線：關掉設定頁或停用外掛時中止，回 cancelled，請求真的停下', async () => {
  const fetch = mockFetch([{ status: 200, headersDelayMs: 60_000, chunks: ['{}'] }]);
  const controller = new AbortController();
  const pending = testConnection(cardsClient(fetch), { provider: 'openai', key: { ok: true, key: FAKE_KEY }, signal: controller.signal });
  controller.abort();
  const result = await pending;
  assert.equal(result.ok, false);
  assert.equal(result.ok ? '' : result.kind, 'cancelled');
});
