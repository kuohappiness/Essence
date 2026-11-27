// 目錄的形狀（docs/tasks/ai-client.md〈6〉、〈7〉第 10 點）：呼叫端加的或蓋掉的目錄寫壞了，壞的那一筆跳過並回報，
// 套件本身不丟原生的例外（L2 R14、第二輪 延續 R14）。每個欄位都換成每一種錯的型別跑一次，不逐個補例子。
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createAiClient, isAiError, type AiClientOptions } from '../src/index.ts';
import { mockFetch } from '../src/testing.ts';
import { KEY, instantClock, loadCases, readSse } from './helpers.ts';

type Overrides = NonNullable<AiClientOptions['catalog']>;
const BAD: unknown[] = [null, {}, [], [null], 7, -1, 0, 1.5, Number.NaN, 'x', '', true];

const MEDIA_FIELDS = [
  'mediaTokens', 'mediaTokens.pdfPage', 'mediaTokens.pdfPage.low', 'mediaTokens.pdfPage.high', 'mediaTokens.image', 'mediaTokens.image.low',
  'mediaTokens.source', 'mediaTokens.asOf', 'mediaTokens.guessed',
];
const PROVIDER_FIELDS = [
  'dialect', 'baseUrl', 'auth', 'auth.header', 'auth.scheme', 'headers', 'headers.x-extra', 'options', 'options.checkPath',
  'options.maxTokensField', 'options.streamUsage', 'options.systemRole', 'limits', 'limits.maxRequestBytes', 'limits.maxFileBytes',
  'limits.maxPdfPages', 'defaults', 'defaults.inputs', 'defaults.reasoning', 'defaults.maxOutputTokens', 'models', 'label',
  ...MEDIA_FIELDS,
];
const MODEL_FIELDS = [
  'id', 'inputs', 'reasoning', 'reasoning.path', 'reasoning.values', 'maxOutputTokens', 'contextTokens', 'prices', 'prices.0',
  'prices.0.input', 'prices.0.longContext', 'prices.0.effectiveFrom', 'pricesAsOf', ...MEDIA_FIELDS,
];

/** 照路徑（a.b.0）把值放進物件，中間沒有的層補上。 */
function withValue(base: Record<string, unknown>, path: string, value: unknown): Record<string, unknown> {
  const copy = structuredClone(base);
  const keys = path.split('.');
  let node: Record<string, unknown> = copy;
  for (const key of keys.slice(0, -1)) {
    if (typeof node[key] !== 'object' || node[key] === null) node[key] = /^\d+$/.test(keys[keys.indexOf(key) + 1] ?? '') ? [] : {};
    node = node[key] as Record<string, unknown>;
  }
  node[keys[keys.length - 1]] = value;
  return copy;
}

const openai = loadCases().find(c => c.dialect === 'openai-responses')!;
const validModel = { id: 'gpt-5.6-terra', prices: [{ input: 1, output: 2 }], pricesAsOf: '2026-11-25' };

/** 建 client、送一次 generate 與 check：只准成功或丟 AiError，不准原生的例外。 */
async function exercise(catalog: Overrides, label: string): Promise<void> {
  let client: ReturnType<typeof createAiClient>;
  try {
    client = createAiClient({ catalog, clock: instantClock(), fetch: mockFetch([{ status: 200, headers: { 'content-type': 'text/event-stream' }, chunks: [readSse(openai, openai.stream.file)] }]) });
  } catch (error) {
    assert.fail(`${label}：createAiClient 丟了 ${String(error)}`);
  }
  try {
    await client.generate({ endpoint: { provider: 'openai' }, apiKey: KEY, model: 'gpt-5.6-terra', input: [{ role: 'user', content: '你好' }] });
  } catch (error) {
    assert.ok(isAiError(error), `${label}：generate 丟了 ${String(error)}`);
  }
  const checked = await client.check({ endpoint: { provider: 'openai' }, apiKey: KEY }).catch((error: unknown) => assert.fail(`${label}：check 丟了 ${String(error)}`));
  assert.ok(typeof checked.ok === 'boolean', label);
  try {
    const pdf = { type: 'file' as const, mediaType: 'application/pdf', data: new Uint8Array([1]), pages: 2 };
    const image = { type: 'image' as const, mediaType: 'image/png', data: new Uint8Array([1]) };
    client.estimate({ endpoint: { provider: 'openai' }, model: 'gpt-5.6-terra', input: [{ role: 'user', content: [pdf, image] }] }, { expectedOutputTokens: { low: 1, high: 2 } });
  } catch (error) {
    assert.ok(isAiError(error), `${label}：estimate 丟了 ${String(error)}`);
  }
}

void test('目錄的每個欄位換成錯的型別：client 建得起來，generate 與 check 只回結果或 AiError（L2 第二輪 延續 R14）', async () => {
  for (const field of PROVIDER_FIELDS) {
    for (const value of BAD) {
      const bad = withValue({ id: 'openai' }, field, value);
      // 同一份覆寫裡同一家寫兩次（第二次是正常的模型），合併時也要讀得過第一筆留下的壞形狀。
      await exercise({ providers: [bad, { id: 'openai', models: [validModel] }] } as unknown as Overrides, `廠商 ${field}=${JSON.stringify(value)}`);
      await exercise({ providers: [{ ...bad, id: 'brand-new' }] }, `新廠商 ${field}=${JSON.stringify(value)}`);
    }
  }
  for (const field of MODEL_FIELDS) {
    for (const value of BAD) {
      const bad = withValue(structuredClone(validModel), field, value);
      await exercise({ providers: [{ id: 'openai', models: [bad, validModel] }] } as unknown as Overrides, `模型 ${field}=${JSON.stringify(value)}`);
    }
  }
});

void test('mediaTokens 寫壞了：那一筆跳過並回報（範圍要是正整數、low 不大於 high，日期要合法）', () => {
  const BAD_MEDIA: unknown[] = [
    { pdfPage: { low: 0, high: 5 } }, { pdfPage: { low: 6, high: 5 } }, { image: { low: 1.5, high: 5 } }, { image: { low: 1 } },
    { image: [1, 2] }, { asOf: '2026-02-30' }, { source: 7 }, { guessed: 'yes' }, [], 'x',
  ];
  for (const mediaTokens of BAD_MEDIA) {
    const asModel = createAiClient({ catalog: { providers: [{ id: 'openai', models: [{ ...validModel, mediaTokens }] }] } as unknown as Overrides });
    assert.ok(asModel.catalogProblems.some(p => p.provider === 'openai' && p.model === 'gpt-5.6-terra'), `模型 ${JSON.stringify(mediaTokens)}`);
    const asProvider = createAiClient({ catalog: { providers: [{ id: 'brand-new', dialect: 'openai-chat', baseUrl: 'https://x.example/v1', auth: null, mediaTokens, models: [] }] } as unknown as Overrides });
    assert.ok(asProvider.catalogProblems.some(p => p.provider === 'brand-new'), `廠商 ${JSON.stringify(mediaTokens)}`);
  }
});

void test('models 是 null、{} 或含 null：回報，不默默變成空的（L2 第二輪 延續 R14）', () => {
  for (const models of [null, {}, [null]]) {
    const client = createAiClient({ catalog: { providers: [{ id: 'openai', models }, { id: 'openai', models: [validModel] }, { id: 'brand-new', dialect: 'openai-chat', baseUrl: 'https://x.example/v1', auth: null, models }] } as unknown as Overrides });
    assert.ok(client.catalogProblems.some(p => p.provider === 'brand-new'), JSON.stringify(models));
    assert.ok(client.catalogProblems.some(p => p.provider === 'openai'), JSON.stringify(models));
  }
});

void test('options.checkPath 不是字串：那一家跳過並回報，check() 不丟例外（L2 第二輪 延續 R14）', async () => {
  const client = createAiClient({ catalog: { providers: [{ id: 'openrouter', options: { checkPath: 7 } }] } as unknown as Overrides, fetch: mockFetch([{ status: 200, chunks: ['{}'] }]) });
  assert.ok(client.catalogProblems.some(p => p.provider === 'openrouter'));
  const checked = await client.check({ endpoint: { provider: 'openrouter' }, apiKey: KEY });
  assert.ok(!checked.ok);
});

void test('合併整類：同一家分好幾筆寫、每一筆的 models 省略、空的、有模型或寫壞，給的每一個模型不是用上就是回報，不默默丟掉（L2 第三輪 R14 修正引入）', () => {
  const choices: { name: string; models: (i: number) => unknown; bad?: boolean; omit?: boolean }[] = [
    { name: '省略', models: () => undefined, omit: true },
    { name: '[]', models: () => [] },
    { name: '一個模型', models: i => [{ ...validModel, id: `m${String(i)}` }] },
    { name: 'null', models: () => null, bad: true },
    { name: '{}', models: () => ({}), bad: true },
  ];
  const fields = { dialect: 'openai-chat', baseUrl: 'https://x.example/v1', auth: { header: 'authorization', scheme: 'Bearer' } };
  const combos = (n: number): number[][] => (n === 0 ? [[]] : combos(n - 1).flatMap(rest => choices.map((_, i) => [i, ...rest])));
  for (const id of ['brand-new', 'openai']) {
    for (const combo of [...combos(2), ...combos(3)]) {
      const entries = combo.map((c, i) => {
        const choice = choices[c];
        const entry: Record<string, unknown> = { id, ...(i === 0 && id === 'brand-new' ? fields : {}) };
        if (!choice.omit) entry.models = choice.models(i);
        return entry;
      });
      const label = `${id}：${combo.map(c => choices[c].name).join(' → ')}`;
      const client = createAiClient({ catalog: { providers: entries } as unknown as Overrides });
      const reported = client.catalogProblems.some(p => p.provider === id);
      if (combo.some(c => choices[c].bad)) {
        assert.ok(reported, `${label}：寫壞的要回報`);
        continue;
      }
      assert.ok(!reported, `${label}：${JSON.stringify(client.catalogProblems)}`);
      const got = client.providers().find(p => p.id === id)?.models.map(m => m.id) ?? [];
      const given = combo.flatMap((c, i) => (choices[c].name === '一個模型' ? [`m${String(i)}`] : []));
      for (const model of given) assert.ok(got.includes(model), `${label}：${model} 不見了（拿到 ${JSON.stringify(got)}）`);
    }
  }
});

void test('服務端點整類：目錄的每一家與自訂服務用同一個驗法，每個欄位換成每一種錯的值，目錄的跳過並回報、自訂的回 invalid_request，都不送出（L2 第三輪 延續 R14）', async () => {
  // 每個欄位的錯的值（合法的拿掉：checkPath 的 'x'、streamUsage 的 true、headers 的 {} 都是合法的）。
  const NOT_STRING = [null, {}, [], [null], 7, 0, Number.NaN, true];
  const NOT_OBJECT = [null, [], [null], 7, 'x', '', true];
  const FIELDS: Record<string, unknown[]> = {
    'options.maxTokensField': [...NOT_STRING, '', 'x', 'model', 'stream', 'messages', 'stream_options', '__proto__', 'max_output_tokens'],
    'options.checkPath': [...NOT_STRING, ''],
    'options.streamUsage': [null, {}, [], 7, 0, 'x', '', 'true'],
    'options.systemRole': [...NOT_STRING, '', 'x', 'user', 'assistant'],
    options: NOT_OBJECT,
    dialect: [...NOT_STRING, '', 'x', 'openai-chatx'],
    baseUrl: [...NOT_STRING, '', 'x', 'http://api.example.com/v1', 'https://u:p@api.example.com/v1'],
    auth: [{}, [], 7, 'x', true],
    'auth.header': [...NOT_STRING, ''],
    'auth.scheme': NOT_STRING,
    headers: NOT_OBJECT,
    'headers.x-extra': NOT_STRING,
  };
  const customBase = { dialect: 'openai-chat', baseUrl: 'https://api.example.com/v1' };
  for (const [field, values] of Object.entries(FIELDS)) {
    for (const value of values) {
      const label = `${field}=${JSON.stringify(value)}`;
      const listed = createAiClient({ catalog: { providers: [withValue({ id: 'openrouter' }, field, value)] } as unknown as Overrides });
      assert.ok(listed.catalogProblems.some(p => p.provider === 'openrouter'), `目錄 ${label}`);
      const fetch = mockFetch([{ status: 200, headers: { 'content-type': 'application/json' }, chunks: ['{"data":[]}'] }]);
      const client = createAiClient({ fetch, clock: instantClock() });
      const custom = withValue(customBase, field, value) as never;
      const error = await client.generate({ endpoint: { custom }, apiKey: KEY, model: 'm', maxOutputTokens: 5, input: [{ role: 'user', content: '你好' }] })
        .then(() => assert.fail(`自訂 ${label}：應該失敗`), (caught: unknown) => caught);
      assert.ok(isAiError(error), `自訂 ${label}：丟了 ${String(error)}`);
      assert.equal(error.kind, 'invalid_request', `自訂 ${label}`);
      const checked = await client.check({ endpoint: { custom }, apiKey: KEY });
      assert.deepEqual(checked.ok ? 'ok' : checked.error.kind, 'invalid_request', `自訂 check ${label}`);
      assert.equal(fetch.requests.length, 0, `自訂 ${label}：不該送出`);
    }
  }
  // 合法的值照用：OpenAI 自己的欄位名稱。
  const fetch = mockFetch([{ status: 200, headers: { 'content-type': 'text/event-stream' }, chunks: [readSse(loadCases().find(c => c.dialect === 'openai-chat')!, 'stream.sse')] }]);
  await createAiClient({ fetch, clock: instantClock() }).generate({
    endpoint: { custom: { ...customBase, options: { maxTokensField: 'max_completion_tokens' } } }, apiKey: KEY, model: 'm', maxOutputTokens: 5, input: [{ role: 'user', content: '你好' }],
  });
  const sent = JSON.parse(fetch.requests[0].body ?? '') as Record<string, unknown>;
  assert.deepEqual([sent.max_completion_tokens, sent.max_tokens, sent.model], [5, undefined, 'm']);
});

void test('自訂服務「是物件」和目錄同一個判斷：沒有原型的、凍結的、類別的都照用；陣列與非物件擋（L2 第四輪 第 10 項）', async () => {
  const chat = loadCases().find(c => c.dialect === 'openai-chat')!;
  const fields = { dialect: 'openai-chat', baseUrl: 'https://api.example.com/v1', headers: { 'x-extra': '1' } };
  const bare = Object.assign(Object.create(null) as Record<string, unknown>, fields);
  class Endpoint { dialect = fields.dialect; baseUrl = fields.baseUrl; headers = fields.headers; }
  const outcome = async (custom: unknown) => {
    const fetch = mockFetch([
      { status: 200, headers: { 'content-type': 'text/event-stream' }, chunks: [readSse(chat, 'stream.sse')] },
      { status: 200, headers: { 'content-type': 'application/json' }, chunks: ['{"data":[]}'] },
    ]);
    const client = createAiClient({ fetch, clock: instantClock() });
    const endpoint = { custom } as never;
    const generated = await client.generate({ endpoint, apiKey: KEY, model: 'm', input: [{ role: 'user', content: '你好' }] })
      .then(r => r.text, (caught: unknown) => (isAiError(caught) ? caught.kind : String(caught)));
    const checked = await client.check({ endpoint, apiKey: KEY });
    return { generated, checked: checked.ok ? 'ok' : checked.error.kind, sent: fetch.requests.map(q => [q.url, q.headers['x-extra']]) };
  };
  const plain = await outcome(fields);
  assert.equal(plain.generated, chat.stream.text);
  for (const [label, custom] of [['Object.create(null)', bare], ['凍結的', Object.freeze({ ...fields })], ['類別', new Endpoint()]] as const) {
    assert.deepEqual(await outcome(custom), plain, label);
  }
  for (const custom of [[], [fields], 'x', 7, null, true]) {
    assert.deepEqual(await outcome(custom), { generated: 'invalid_request', checked: 'invalid_request', sent: [] }, JSON.stringify(custom));
  }
});
