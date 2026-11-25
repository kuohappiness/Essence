// 目錄的形狀（docs/tasks/ai-client.md〈6〉、〈7〉第 10 點）：呼叫端加的或蓋掉的目錄寫壞了，壞的那一筆跳過並回報，
// 套件本身不丟原生的例外（L2 R14、第二輪 延續 R14）。每個欄位都換成每一種錯的型別跑一次，不逐個補例子。
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createAiClient, isAiError, type AiClientOptions } from '../src/index.ts';
import { mockFetch } from '../src/testing.ts';
import { KEY, instantClock, loadCases, readSse } from './helpers.ts';

type Overrides = NonNullable<AiClientOptions['catalog']>;
const BAD: unknown[] = [null, {}, [], [null], 7, -1, 0, 1.5, Number.NaN, 'x', '', true];

const PROVIDER_FIELDS = [
  'dialect', 'baseUrl', 'auth', 'auth.header', 'auth.scheme', 'headers', 'headers.x-extra', 'options', 'options.checkPath',
  'options.maxTokensField', 'options.streamUsage', 'options.systemRole', 'limits', 'limits.maxRequestBytes', 'limits.maxFileBytes',
  'limits.maxPdfPages', 'defaults', 'defaults.inputs', 'defaults.reasoning', 'defaults.maxOutputTokens', 'models', 'label',
];
const MODEL_FIELDS = [
  'id', 'inputs', 'reasoning', 'reasoning.path', 'reasoning.values', 'maxOutputTokens', 'contextTokens', 'prices', 'prices.0',
  'prices.0.input', 'prices.0.longContext', 'prices.0.effectiveFrom', 'pricesAsOf',
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
