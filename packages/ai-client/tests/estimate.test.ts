// 送出前估費用（Cards 任務說明 apps/Cards/docs/tasks/ai-direct.md §3）：照目錄的牌價與每頁、每張的 token 範圍，
// 算出最少與最多大約多少美元。預期值都是照下面的係數手算的字面值，不用同一套算法再算一次。
//   文字：中日韓的字每字 0.6～1.5 token，其他字元每字 0.2～0.35 token（四捨五入到整數）。
//   附件：目錄寫的每頁、每張範圍；目錄沒寫的用寬範圍 PDF 每頁 258～4,600、每張圖 258～4,800。
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createAiClient, isAiError, type AiClientOptions, type ContentPart, type GenerateRequest } from '../src/index.ts';
import { instantClock } from './helpers.ts';

type Overrides = NonNullable<AiClientOptions['catalog']>;

const PROVIDER = {
  id: 'p', label: 'P', dialect: 'openai-chat', baseUrl: 'https://p.example/v1', auth: null,
  mediaTokens: { pdfPage: { low: 500, high: 1000 }, image: { low: 1000, high: 2000 }, source: 'https://p.example/docs/tokens', asOf: '2026-11-27' },
  models: [
    { id: 'm', prices: [{ input: 1, output: 10 }], pricesAsOf: '2026-11-20' },
    { id: 'long', prices: [{ input: 1, output: 10, longContext: { aboveInputTokens: 10_000, input: 2, output: 20 } }], pricesAsOf: '2026-11-20' },
    { id: 'own-media', mediaTokens: { pdfPage: { low: 100, high: 200 }, guessed: true }, prices: [{ input: 1, output: 10 }], pricesAsOf: '2026-11-20' },
    { id: 'no-price' },
  ],
};
const BARE = { id: 'bare', label: 'Bare', dialect: 'openai-chat', baseUrl: 'https://bare.example/v1', auth: null, models: [{ id: 'm', prices: [{ input: 1, output: 10 }], pricesAsOf: '2026-11-20' }] };

const client = createAiClient({ catalog: { providers: [PROVIDER, BARE] } as unknown as Overrides, clock: instantClock(Date.parse('2026-11-27T00:00:00Z')) });
const OUTPUT = { low: 3000, high: 10_000 };
const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46]);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);

/** 400 個英數字（80～140 token）＋100 個中文字（60～150 token）＝文字 140～290 token。 */
const request = (model: string, extra: ContentPart[] = []): GenerateRequest => ({
  endpoint: { provider: model === 'bare' ? 'bare' : 'p' }, model: model === 'bare' ? 'm' : model,
  instructions: 'abcd'.repeat(100),
  input: [{ role: 'user', content: [{ type: 'text', text: '中文'.repeat(50) }, ...extra] }],
});

void test('估費用：文字加 12 頁 PDF，最少與最多照目錄的牌價與每頁範圍算', () => {
  const estimate = client.estimate(request('m', [{ type: 'file', mediaType: 'application/pdf', data: PDF, pages: 12 }]), { expectedOutputTokens: OUTPUT });
  assert.ok(estimate);
  // 輸入 140 + 12×500 = 6,140～290 + 12×1,000 = 12,290；(6,140×1 + 3,000×10) / 1e6、(12,290×1 + 10,000×10) / 1e6。
  assert.equal(estimate.low, 0.03614);
  assert.equal(estimate.high, 0.11229);
  assert.equal(estimate.currency, 'USD');
  assert.equal(estimate.pricesAsOf, '2026-11-20');
  assert.deepEqual(estimate.assumptions, {
    textChars: 500, pdfPages: 12, images: 0,
    inputTokens: { low: 6140, high: 12_290 }, outputTokens: OUTPUT,
    pdfPageTokens: { low: 500, high: 1000 }, imageTokens: null,
    media: 'catalog', mediaSource: 'https://p.example/docs/tokens', mediaAsOf: '2026-11-27',
  });
});

void test('估費用：照片照張數算；呼叫端給的頁數與張數蓋過請求裡的', () => {
  const photos = request('m', [{ type: 'image', mediaType: 'image/png', data: PNG }, { type: 'image', mediaType: 'image/png', data: PNG }]);
  const counted = client.estimate(photos, { expectedOutputTokens: OUTPUT });
  // 輸入 140 + 2×1,000 = 2,140～290 + 2×2,000 = 4,290。
  assert.deepEqual(counted?.assumptions.inputTokens, { low: 2140, high: 4290 });
  assert.deepEqual(counted?.assumptions.imageTokens, { low: 1000, high: 2000 });
  assert.equal(counted?.assumptions.pdfPageTokens, null);
  const given = client.estimate(photos, { expectedOutputTokens: OUTPUT, images: 1, pdfPages: 3 });
  // 輸入 140 + 3×500 + 1×1,000 = 2,640～290 + 3×1,000 + 1×2,000 = 5,290。
  assert.deepEqual(given?.assumptions.inputTokens, { low: 2640, high: 5290 });
  assert.equal(given?.assumptions.pdfPages, 3);
  assert.equal(given?.assumptions.images, 1);
});

void test('估費用：只有文字時附件的範圍是 null；字串內容也算字數', () => {
  const plain = client.estimate({ endpoint: { provider: 'p' }, model: 'm', input: [{ role: 'user', content: 'abcd'.repeat(100) }] }, { expectedOutputTokens: { low: 0, high: 0 } });
  assert.deepEqual(plain?.assumptions, {
    textChars: 400, pdfPages: 0, images: 0, inputTokens: { low: 80, high: 140 }, outputTokens: { low: 0, high: 0 },
    pdfPageTokens: null, imageTokens: null, media: null, mediaSource: null, mediaAsOf: null,
  });
  assert.equal(plain?.low, 0.00008);
  assert.equal(plain?.high, 0.00014);
});

void test('估費用：輸入超過長內容的門檻時，那一端改用長內容的價格', () => {
  const estimate = client.estimate(request('long', [{ type: 'file', mediaType: 'application/pdf', data: PDF, pages: 12 }]), { expectedOutputTokens: OUTPUT });
  // 最少 6,140 沒超過 10,000：(6,140×1 + 3,000×10) / 1e6；最多 12,290 超過：(12,290×2 + 10,000×20) / 1e6。
  assert.equal(estimate?.low, 0.03614);
  assert.equal(estimate?.high, 0.22458);
});

void test('估費用：模型自己寫的每頁範圍蓋過廠商的，沒寫的照廠商；標成推估', () => {
  const estimate = client.estimate(request('own-media', [
    { type: 'file', mediaType: 'application/pdf', data: PDF, pages: 2 }, { type: 'image', mediaType: 'image/png', data: PNG },
  ]), { expectedOutputTokens: OUTPUT });
  assert.deepEqual(estimate?.assumptions.pdfPageTokens, { low: 100, high: 200 });
  assert.deepEqual(estimate?.assumptions.imageTokens, { low: 1000, high: 2000 });
  assert.equal(estimate?.assumptions.media, 'guessed');
});

void test('估費用：目錄沒寫每頁範圍的廠商用寬範圍，標 fallback', () => {
  const estimate = client.estimate(request('bare', [
    { type: 'file', mediaType: 'application/pdf', data: PDF, pages: 1 }, { type: 'image', mediaType: 'image/png', data: PNG },
  ]), { expectedOutputTokens: OUTPUT });
  assert.deepEqual(estimate?.assumptions.pdfPageTokens, { low: 258, high: 4600 });
  assert.deepEqual(estimate?.assumptions.imageTokens, { low: 258, high: 4800 });
  assert.equal(estimate?.assumptions.media, 'fallback');
  assert.equal(estimate?.assumptions.mediaSource, null);
  // 輸入 140 + 258 + 258 = 656～290 + 4,600 + 4,800 = 9,690。
  assert.deepEqual(estimate?.assumptions.inputTokens, { low: 656, high: 9690 });
});

void test('估費用：目錄沒有這個模型的價格、目錄沒有這個模型、自訂服務都回 null', () => {
  assert.equal(client.estimate(request('no-price'), { expectedOutputTokens: OUTPUT }), null);
  assert.equal(client.estimate(request('not-in-catalog'), { expectedOutputTokens: OUTPUT }), null);
  const custom: GenerateRequest = { endpoint: { custom: { dialect: 'openai-chat', baseUrl: 'https://c.example/v1' } }, model: 'x', input: [{ role: 'user', content: 'hi' }] };
  assert.equal(client.estimate(custom, { expectedOutputTokens: OUTPUT }), null);
});

void test('估費用：不認得的廠商、PDF 沒寫頁數又沒給、數字不對都丟 invalid_request', () => {
  const invalid = (run: () => unknown, label: string) => {
    assert.throws(run, (error: unknown) => isAiError(error) && error.kind === 'invalid_request', label);
  };
  invalid(() => client.estimate({ ...request('m'), endpoint: { provider: 'nope' } }, { expectedOutputTokens: OUTPUT }), '不認得的廠商');
  invalid(() => client.estimate(request('m', [{ type: 'file', mediaType: 'application/pdf', data: PDF }]), { expectedOutputTokens: OUTPUT }), 'PDF 沒寫頁數');
  for (const bad of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, '3']) {
    invalid(() => client.estimate(request('m'), { expectedOutputTokens: OUTPUT, pdfPages: bad as number }), `pdfPages=${String(bad)}`);
    invalid(() => client.estimate(request('m'), { expectedOutputTokens: OUTPUT, images: bad as number }), `images=${String(bad)}`);
    invalid(() => client.estimate(request('m'), { expectedOutputTokens: { low: bad as number, high: 10 } }), `low=${String(bad)}`);
  }
  invalid(() => client.estimate(request('m'), { expectedOutputTokens: { low: 10, high: 5 } }), 'low 比 high 大');
  invalid(() => client.estimate({ ...request('m'), input: null as unknown as GenerateRequest['input'] }, { expectedOutputTokens: OUTPUT }), 'input 不是陣列');
});

void test('估費用：內建目錄的每一家都有每頁範圍的依據，OpenRouter 照模型不同、用寬範圍', () => {
  const builtin = createAiClient({ clock: instantClock(Date.parse('2026-11-27T00:00:00Z')) });
  for (const provider of builtin.providers()) {
    const media = provider.mediaTokens;
    if (provider.id === 'openrouter') {
      assert.equal(media, undefined);
      continue;
    }
    assert.ok(media?.pdfPage && media.image, provider.id);
    assert.match(media.source ?? '', /^https:\/\//, provider.id);
    assert.match(media.asOf ?? '', /^\d{4}-\d{2}-\d{2}$/, provider.id);
  }
  // Gemini 3.8 Flash：兩萬個中文字（12,000～30,000）加 12 頁（258～560 一頁）；牌價每百萬輸入 0.75、輸出 3.75（2026-11-25 查）。
  // (15,096×0.75 + 3,000×3.75) / 1e6 = 0.022572；(36,720×0.75 + 10,000×3.75) / 1e6 = 0.06504。
  const gemini = builtin.estimate({
    endpoint: { provider: 'google' }, model: 'gemini-3.8-flash',
    input: [{ role: 'user', content: [{ type: 'text', text: '字'.repeat(20_000) }, { type: 'file', mediaType: 'application/pdf', data: PDF, pages: 12 }] }],
  }, { expectedOutputTokens: OUTPUT });
  assert.equal(gemini?.low, 0.022572);
  assert.equal(gemini?.high, 0.06504);
});
