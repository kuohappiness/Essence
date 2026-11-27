// 設定頁「AI 連線」的資料與測試連線（apps/Cards/docs/tasks/ai-direct.md §2）：這台電腦選的服務、模型、推理等級與每一家金鑰的名稱。
// 只存在這台電腦（saveLocalStorage，和 src/ui/prefs.ts 的裝置偏好同一個做法），不進 vault。金鑰的值存在 Obsidian 的 SecretStorage，
// 這裡只記它在 SecretStorage 的名稱，要用時才拿值，用完不留。不碰 Obsidian：讀寫與拿金鑰由呼叫端交進來。
import { createAiClient, describeAiError, isAiError } from './client.ts';
import type { AiClient, AiErrorKind, FetchLike, ProviderSpec } from './client.ts';

/**
 * 推薦（docs/ai-models.md〈外掛的預設選單〉，D-072）：這幾家排在最上面、名稱後面加標籤，推薦的模型也放最上面。
 * name 是那張表「選單上的名稱」，和目錄的名稱不同時才寫（L2 第一輪 R11 第 5 項）。
 */
const RECOMMENDED: readonly { provider: string; tag: string; model: string; name?: string }[] = [
  { provider: 'openai', tag: '推薦', model: 'gpt-5.6-terra' },
  { provider: 'google', tag: '免費', model: 'gemini-3.8-flash', name: 'Google Gemini' },
];

/** 選單上的服務名稱（不含標籤）：docs/ai-models.md 有寫的照它，其他照目錄。 */
export function providerName(provider: ProviderSpec): string {
  return RECOMMENDED.find(r => r.provider === provider.id)?.name ?? provider.label;
}

/** 推理等級（§2）：預設不指定，照服務自己的預設。 */
export const REASONING_CHOICES = [
  { value: 'default', label: '照服務的預設' },
  { value: 'low', label: '低' },
  { value: 'medium', label: '中' },
  { value: 'high', label: '高' },
] as const;
type Reasoning = (typeof REASONING_CHOICES)[number]['value'];

export interface Connection {
  /** 選的服務（目錄裡的廠商代號）。 */
  provider: string;
  /** 每一家選的模型：換服務再換回來時還在。 */
  models: Record<string, string>;
  reasoning: Reasoning;
  /** 每一家的金鑰在 SecretStorage 的名稱（不是金鑰本身）。 */
  secrets: Record<string, string>;
}

/**
 * SecretStorage 的名稱：小寫英數與 -（Obsidian 的型別只寫「小寫英數，可以有 -」，沒說 - 能不能連續或在頭尾，所以都收；L2 第一輪 R9）。
 * 名稱都是 SecretComponent 交回的，這條只用來濾掉這台電腦存的設定裡讀不懂的值，收得比 Obsidian 寬不會出錯。
 */
const SECRET_ID = /^[a-z0-9-]+$/;
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const strings = (value: unknown, keep: (text: string) => boolean): Record<string, string> =>
  isRecord(value) ? Object.fromEntries(Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === 'string' && keep(entry[1]))) : {};

/** 服務的選單：推薦的照順序排最上面並加標籤，其他照目錄的順序。 */
export function providerChoices(providers: readonly ProviderSpec[]): { id: string; label: string }[] {
  const rank = (id: string): number => { const at = RECOMMENDED.findIndex(r => r.provider === id); return at < 0 ? RECOMMENDED.length : at; };
  return [...providers].sort((a, b) => rank(a.id) - rank(b.id)).map(provider => {
    const tag = RECOMMENDED.find(r => r.provider === provider.id)?.tag;
    return { id: provider.id, label: tag ? `${providerName(provider)}（${tag}）` : providerName(provider) };
  });
}

/** 模型的選單：推薦的放最上面並標「推薦」。目錄沒有內建模型的服務（OpenRouter）回空陣列，畫面改成自己填。 */
export function modelChoices(provider: ProviderSpec): { id: string; label: string }[] {
  const recommended = RECOMMENDED.find(r => r.provider === provider.id)?.model;
  const models = [...provider.models].sort((a, b) => Number(b.id === recommended) - Number(a.id === recommended));
  return models.map(model => ({ id: model.id, label: (model.label ?? model.id) + (model.id === recommended ? '（推薦）' : '') }));
}

/** 讀這台電腦存的設定：讀不懂的欄位用預設（第一個服務、照服務的預設），不認得的服務也一樣。 */
export function readConnection(raw: unknown, providers: readonly ProviderSpec[]): Connection {
  const value = isRecord(raw) ? raw : {};
  const ids = providers.map(provider => provider.id);
  const provider = typeof value.provider === 'string' && ids.includes(value.provider) ? value.provider : providerChoices(providers)[0]?.id ?? '';
  const reasoning = REASONING_CHOICES.find(choice => choice.value === value.reasoning)?.value ?? 'default';
  return { provider, models: strings(value.models, text => text.trim() !== ''), reasoning, secrets: strings(value.secrets, text => SECRET_ID.test(text)) };
}

/** 這一家現在用的模型：選過而且還在選單上的；沒有選單（自己填）的照填的；都沒有就是推薦的或第一個，再沒有是空字串。 */
export function modelOf(connection: Connection, provider: ProviderSpec): string {
  const choices = modelChoices(provider);
  const chosen = connection.models[provider.id]?.trim();
  if (chosen && (!choices.length || choices.some(choice => choice.id === chosen))) return chosen;
  return choices[0]?.id ?? '';
}

/**
 * 這一家選的金鑰名稱也設給了哪幾家（L2 第一輪 R8）：各家的金鑰不通用，同名多半是選錯，測試連線或製作時會把金鑰送到另一家。
 * SecretComponent 選了之後只顯示遮罩，畫面上看不出是哪一把，所以由設定頁提醒；不擋，家長自己改。
 */
export function sharedWith(connection: Connection): string[] {
  const id = connection.secrets[connection.provider];
  if (!id) return [];
  return Object.entries(connection.secrets).filter(([provider, name]) => provider !== connection.provider && name === id).map(([provider]) => provider);
}

/** 換金鑰的名稱：SecretComponent 交回的名稱，null 或不合格式時拿掉這一家的。 */
export function withSecret(connection: Connection, provider: string, id: string | null): Connection {
  const secrets = { ...connection.secrets };
  if (id !== null && SECRET_ID.test(id)) secrets[provider] = id;
  else delete secrets[provider];
  return { ...connection, secrets };
}

/**
 * 金鑰的樣子（L2 第一輪 R4）：各家的金鑰都是幾十個看得見的半形字（英數與 - _ 這類符號）。短於 8 個字的套件不送到遠端，
 * 中間有空白、換行或全形字的放不進標頭，送出前就分出來，請家長重新貼，不讓他們看到「請求格式不對、請回報給開發者」。
 */
const KEY_SHAPE = /^[!-~]{8,}$/;

/** 這一家的金鑰：拿到了，或為什麼沒有。 */
export type KeyLookup = { ok: true; key: string } | { ok: false; why: KeyProblem };
/** unset：沒選名稱；empty：選了，但 SecretStorage 裡沒有，或存的是空字串（家長清掉金鑰時只能存空字串，探針 P3）；malformed：樣子不像金鑰。 */
type KeyProblem = 'unset' | 'empty' | 'malformed';

/** 這一家的金鑰：前後的空白拿掉；沒選、是空的、樣子不對都不交出值（測試連線與直接製作都用這個判斷）。 */
export function keyOf(connection: Connection, getSecret: (id: string) => string | null): KeyLookup {
  const id = connection.secrets[connection.provider];
  if (!id) return { ok: false, why: 'unset' };
  const value = getSecret(id)?.trim();
  if (!value) return { ok: false, why: 'empty' };
  return KEY_SHAPE.test(value) ? { ok: true, key: value } : { ok: false, why: 'malformed' };
}

/**
 * Cards 用的連線（D-241）：用 fetch；Anthropic 一律加 anthropic-dangerous-direct-browser-access，否則 Obsidian 裡會被 CORS 擋（探針 P1）。
 * fetch 只給測試用，不給就是執行環境的 fetch。
 */
export function cardsClient(fetch?: FetchLike): AiClient {
  return createAiClient({
    ...fetch ? { fetch } : {},
    catalog: { providers: [{ id: 'anthropic', headers: { 'anthropic-dangerous-direct-browser-access': 'true' } }] },
  });
}

/** 測試連線時套件的說明之外再補的下一步（套件的說明已經有下一步的不補）。 */
const NEXT: Partial<Record<AiErrorKind, string>> = {
  network: '確認這台電腦連得上網路，再按一次測試連線。',
  timeout: '再按一次測試連線；一直這樣，可能是服務太慢或網路不穩。',
  model_not_found: '換一個模型再試。',
  invalid_request: '再試一次；一直這樣，請回報給開發者。',
  unknown: '再試一次；一直這樣，請回報給開發者。',
};
/** 沒有可用的金鑰時，不送出、直接寫的一句（L2 第一輪 R4、R11 第 4 項）。 */
const KEY_PROBLEM: Record<KeyProblem, { kind: 'no_key' | 'empty_key' | 'bad_key'; text: string }> = {
  unset: { kind: 'no_key', text: '先在上面選一把這個服務的金鑰，或建立一把新的。' },
  empty: { kind: 'empty_key', text: '這把金鑰是空的或找不到，請重新貼上，或選另一把。' },
  malformed: { kind: 'bad_key', text: '這把金鑰看起來不完整，或夾了空白、全形字，請到服務的網站重新複製再貼上。' },
};
const CONNECTED = '連得上。';

/** 錯誤的一句話：套件的中文說明，加上下一步。 */
function connectionError(kind: AiErrorKind, text: string): string {
  const next = NEXT[kind];
  return next ? `${text}${next}` : text;
}

/**
 * 測試連線（§2）：讀模型清單確認金鑰，不產生內容、不花錢。沒有可用的金鑰時不送出。結果是一句話，金鑰不會在裡面（套件把錯誤裡的金鑰換掉）。
 * signal 中止時（關掉設定頁、停用外掛）回 cancelled，呼叫端不用畫。
 */
export async function testConnection(client: AiClient, request: { provider: string; key: KeyLookup; signal?: AbortSignal }): Promise<{ ok: true; text: string } | { ok: false; kind: AiErrorKind | 'no_key' | 'empty_key' | 'bad_key'; text: string }> {
  if (!request.key.ok) return { ok: false, ...KEY_PROBLEM[request.key.why] };
  let error: unknown;
  try {
    const result = await client.check({ endpoint: { provider: request.provider }, apiKey: request.key.key, ...request.signal ? { signal: request.signal } : {} });
    if (result.ok) return { ok: true, text: CONNECTED };
    error = result.error;
  } catch (thrown) {
    error = thrown;
  }
  if (!isAiError(error)) return { ok: false, kind: 'unknown', text: connectionError('unknown', '未知的錯誤。') };
  return { ok: false, kind: error.kind, text: connectionError(error.kind, describeAiError(error)) };
}
