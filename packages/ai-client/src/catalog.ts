// 讀廠商與模型的資料、驗格式、合併呼叫端加的或蓋掉的（docs/tasks/ai-client.md〈7〉第 10 點）。
// 壞掉的那一筆跳過並回報，不讓整個套件不能用。
import builtin from '../catalog.json' with { type: 'json' };
import type { Catalog, InputKind, MediaTokens, ModelSpec, PriceSpec, ProviderSpec, ReasoningLevel, ReasoningSpec } from './types.ts';
import { REASONING_LEVELS } from './types.ts';

const INPUTS: readonly InputKind[] = ['text', 'image', 'pdf'];
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export interface CatalogProblem {
  provider: string;
  model?: string;
  problem: string;
}

/** 網址只能是 https，或本機的 http（localhost、127.0.0.1、::1，給 Ollama 這類本機模型）。 */
function isAllowedUrl(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.username || url.password) return false;
  if (url.protocol === 'https:') return true;
  return url.protocol === 'http:' && LOCAL_HOSTS.includes(url.hostname);
}

const LOCAL_HOSTS = ['localhost', '127.0.0.1', '[::1]'];

/** 送到這台電腦自己（http 或 https）：短的金鑰只准送這裡（L2 第三輪 延續 R1）。 */
export function isLocalUrl(raw: string): boolean {
  try {
    return LOCAL_HOSTS.includes(new URL(raw).hostname);
  } catch {
    return false;
  }
}

/** 日曆上真的有的日期：2026-02-30 這類 Date.parse 會往後推的也擋（L2 R14）。 */
function isDate(value: unknown): boolean {
  if (typeof value !== 'string' || !DATE.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}
const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const isPrice = (value: unknown): boolean => typeof value === 'number' && Number.isFinite(value) && value >= 0;

function reasoningProblem(spec: unknown): string | null {
  if (spec === undefined) return null;
  const r = spec as Partial<ReasoningSpec>;
  if (typeof r !== 'object' || r === null || typeof r.path !== 'string' || !r.path || typeof r.values !== 'object' || r.values === null) return 'reasoning 要有 path 與 values';
  for (const [level, value] of Object.entries(r.values)) {
    if (!REASONING_LEVELS.includes(level as ReasoningLevel)) return `reasoning 的等級 ${level} 不認得`;
    if (value !== null && typeof value !== 'string' && typeof value !== 'number') return `reasoning 的 ${level} 要是字串、數字或 null`;
  }
  return null;
}

function inputsProblem(inputs: unknown): string | null {
  if (inputs === undefined) return null;
  if (!Array.isArray(inputs) || inputs.some(i => !INPUTS.includes(i as InputKind))) return 'inputs 只能是 text、image、pdf';
  return null;
}

/** 每頁、每張的 token 範圍（估費用用）：範圍是正整數、low 不大於 high。 */
function mediaTokensProblem(media: unknown): string | null {
  if (media === undefined) return null;
  if (!isObject(media)) return 'mediaTokens 要是物件';
  const m = media as MediaTokens;
  for (const key of ['pdfPage', 'image'] as const) {
    const range = m[key] as unknown;
    if (range === undefined) continue;
    if (!isObject(range) || !Number.isInteger(range.low) || !Number.isInteger(range.high) || (range.low as number) <= 0 || (range.low as number) > (range.high as number)) {
      return `mediaTokens.${key} 要是 { low, high }，正整數、low 不大於 high`;
    }
  }
  if (m.source !== undefined && typeof m.source !== 'string') return 'mediaTokens.source 要是字串';
  if (m.asOf !== undefined && !isDate(m.asOf)) return 'mediaTokens.asOf 不是合法日期';
  if (m.guessed !== undefined && typeof m.guessed !== 'boolean') return 'mediaTokens.guessed 要是 true 或 false';
  return null;
}

function priceProblem(price: PriceSpec): string | null {
  if (!isObject(price)) return 'prices 的每一筆要是物件';
  if (price.longContext !== undefined && !isObject(price.longContext)) return 'longContext 要是物件';
  if (price.effectiveFrom !== undefined && !isDate(price.effectiveFrom)) return 'effectiveFrom 不是合法日期';
  for (const key of ['input', 'output'] as const) if (!isPrice(price[key])) return `價格的 ${key} 要是非負數`;
  for (const key of ['cachedInput', 'cacheWrite'] as const) if (price[key] !== undefined && !isPrice(price[key])) return `價格的 ${key} 要是非負數`;
  const lc = price.longContext;
  if (lc !== undefined && (!isPrice(lc.aboveInputTokens) || !isPrice(lc.input) || !isPrice(lc.output) || (lc.cachedInput !== undefined && !isPrice(lc.cachedInput)))) return 'longContext 的數字要是非負數';
  return null;
}

function modelProblem(model: ModelSpec): string | null {
  if (!isObject(model)) return '模型要是物件';
  if (typeof model.id !== 'string' || !model.id) return '模型沒有 id';
  const inputs = inputsProblem(model.inputs);
  if (inputs) return inputs;
  const reasoning = reasoningProblem(model.reasoning) ?? mediaTokensProblem(model.mediaTokens);
  if (reasoning) return reasoning;
  for (const key of ['maxOutputTokens', 'contextTokens'] as const) {
    const value = model[key];
    if (value !== undefined && (!Number.isInteger(value) || value <= 0)) return `${key} 要是正整數`;
  }
  if (model.prices !== undefined) {
    if (!Array.isArray(model.prices) || model.prices.length === 0) return 'prices 要是有內容的陣列';
    for (const price of model.prices) {
      const problem = priceProblem(price);
      if (problem) return problem;
    }
    if (!isDate(model.pricesAsOf)) return '有價格就要有合法的 pricesAsOf';
  }
  return null;
}

/** 廠商裡的物件欄位：形狀不對就整筆跳過，不讓之後讀欄位時丟例外（L2 R14）。 */
function providerShapeProblem(p: ProviderSpec): string | null {
  for (const key of ['defaults', 'limits', 'headers', 'options'] as const) {
    if (p[key] !== undefined && !isObject(p[key])) return `${key} 要是物件`;
  }
  if (p.models !== undefined && !Array.isArray(p.models)) return 'models 要是陣列';
  for (const [key, value] of Object.entries(p.limits ?? {})) {
    if (!Number.isInteger(value) || value <= 0) return `limits 的 ${key} 要是正整數`;
  }
  if (Object.values(p.headers ?? {}).some(v => typeof v !== 'string')) return 'headers 的值要是字串';
  // 送出時直接用到的欄位也驗：checkPath 是數字時 check() 會在 replace 丟例外（L2 第二輪 延續 R14）。
  if (isObject(p.auth) && p.auth.scheme !== undefined && typeof p.auth.scheme !== 'string') return 'auth.scheme 要是字串';
  const o = p.options ?? {};
  if (o.checkPath !== undefined && (typeof o.checkPath !== 'string' || !o.checkPath)) return 'options.checkPath 要是字串';
  // 只准已知的欄位名稱：寫成 model、stream 這類請求本來就有的欄位，會把它們蓋掉（L2 第三輪 延續 R14）。
  if (o.maxTokensField !== undefined && !MAX_TOKENS_FIELDS.includes(o.maxTokensField)) return `options.maxTokensField 要是 ${MAX_TOKENS_FIELDS.join(' 或 ')}`;
  if (o.streamUsage !== undefined && typeof o.streamUsage !== 'boolean') return 'options.streamUsage 要是 true 或 false';
  if (o.systemRole !== undefined && o.systemRole !== 'system' && o.systemRole !== 'developer') return 'options.systemRole 要是 system 或 developer';
  const max = isObject(p.defaults) ? p.defaults.maxOutputTokens : undefined;
  if (max !== undefined && (!Number.isInteger(max) || max <= 0)) return 'defaults.maxOutputTokens 要是正整數';
  return mediaTokensProblem(p.mediaTokens);
}

const MAX_TOKENS_FIELDS: readonly unknown[] = ['max_tokens', 'max_completion_tokens'];

/**
 * 一個服務端點的設定：目錄的每一家與呼叫端的自訂服務都用這一個驗（L2 第三輪 延續 R14）。
 * 送出時直接用到的欄位都在這裡驗，壞的不會走到組請求或 check() 才出錯。auth 沒寫的（自訂服務照方言的預設）不在這裡擋。
 */
export function endpointProblem(p: unknown, dialects: ReadonlySet<string>): string | null {
  // 「是物件」和目錄同一個判斷：沒有原型的（Object.create(null)）、凍結的都照收，只擋陣列與非物件（L2 第四輪 第 10 項）。
  if (!isObject(p)) return '端點設定要是物件';
  if (typeof p.dialect !== 'string' || !dialects.has(p.dialect)) return `方言 ${typeof p.dialect === 'string' ? p.dialect : typeof p.dialect} 沒有登記`;
  if (typeof p.baseUrl !== 'string' || !isAllowedUrl(p.baseUrl)) return 'baseUrl 要是 https，或本機的 http';
  if (p.auth !== undefined && p.auth !== null && (!isObject(p.auth) || typeof p.auth.header !== 'string' || !p.auth.header)) return 'auth 要是 { header, scheme? } 或 null';
  const spec = p as unknown as ProviderSpec;
  const shape = providerShapeProblem(spec);
  if (shape) return shape;
  const defaults = inputsProblem(spec.defaults?.inputs) ?? reasoningProblem(spec.defaults?.reasoning);
  return defaults ? `defaults：${defaults}` : null;
}

/** 驗一份目錄：回傳能用的部分與每個問題。dialects 是登記過的方言名稱。 */
export function validateCatalog(input: unknown, dialects: ReadonlySet<string>): { catalog: Catalog; problems: CatalogProblem[] } {
  const problems: CatalogProblem[] = [];
  const raw = (typeof input === 'object' && input !== null ? input : {}) as Partial<Catalog>;
  const providers: ProviderSpec[] = [];
  const seen = new Set<string>();
  for (const p of Array.isArray(raw.providers) ? raw.providers : []) {
    const id = isObject(p) && typeof p.id === 'string' && p.id ? p.id : '(沒有 id)';
    const fail = (problem: string) => problems.push({ provider: id, problem });
    if (id === '(沒有 id)') { fail('廠商沒有 id'); continue; }
    if (seen.has(id)) { fail('id 重複'); continue; }
    // 目錄的每一家都要寫 auth（不用金鑰的寫 null）；其餘和自訂服務同一個驗法。
    const problem = p.auth === undefined ? 'auth 要是 { header, scheme? } 或 null' : endpointProblem(p, dialects);
    if (problem) { fail(problem); continue; }
    const models: ModelSpec[] = [];
    for (const m of Array.isArray(p.models) ? p.models : []) {
      const problem = modelProblem(m);
      if (problem) problems.push({ provider: id, model: typeof m?.id === 'string' ? m.id : undefined, problem });
      else models.push(m);
    }
    seen.add(id);
    providers.push({ ...p, label: typeof p.label === 'string' && p.label ? p.label : id, models });
  }
  if (raw.schemaVersion !== 1) problems.push({ provider: '(目錄)', problem: `schemaVersion 要是 1，讀到 ${String(raw.schemaVersion)}` });
  return { catalog: { schemaVersion: 1, asOf: typeof raw.asOf === 'string' ? raw.asOf : '', providers }, problems };
}

/**
 * 合併：extra 裡的廠商 id 已經存在時，蓋掉有寫的欄位；models 依模型 id 合併（同 id 的欄位蓋掉，新的加在後面）。
 * extra 的格式和 catalog.json 一樣，但每一筆廠商只要寫要改的欄位（新廠商要寫完整）。
 */
export interface CatalogOverrides {
  providers?: (Partial<Omit<ProviderSpec, 'models'>> & { id: string; models?: (Partial<ModelSpec> & { id: string })[] })[];
}

/**
 * 形狀不對的覆寫不在這裡丟例外：原樣放進結果，交給 validateCatalog 跳過並回報（L2 R14）。
 * 只有 providers 本身不是陣列時沒有可以放的地方，在這裡回報。
 */
export function mergeCatalog(base: Catalog, extra: CatalogOverrides | undefined): { catalog: unknown; problems: CatalogProblem[] } {
  if (!isObject(extra) || extra.providers === undefined) return { catalog: base, problems: [] };
  if (!Array.isArray(extra.providers)) return { catalog: base, problems: [{ provider: '(覆寫)', problem: 'providers 要是陣列' }] };
  const providers: unknown[] = base.providers.map(p => ({ ...p, models: [...p.models] }));
  for (const add of extra.providers as unknown[]) {
    const existing = isObject(add) ? (providers as ProviderSpec[]).find(p => isObject(p) && p.id === add.id) : undefined;
    if (!isObject(add) || !existing) {
      // 新的廠商原樣放進去：models 是 null 也交給 validateCatalog 回報，不默默變成空的（L2 第二輪 延續 R14）。
      // 省略的 models 當成空的：同一家之後的筆數再加模型，才有地方放，不會被默默丟掉（L2 第三輪 R14 修正引入）。
      providers.push(isObject(add) ? { ...add, models: add.models === undefined ? [] : add.models } : add);
      continue;
    }
    const { models, ...fields } = add;
    Object.assign(existing, fields);
    if (models === undefined) continue;
    // 同一家前一筆覆寫已經把 models 寫壞了：留著壞的，交給 validateCatalog 回報（L2 第二輪 延續 R14）。
    if (!Array.isArray(models) || !Array.isArray(existing.models)) {
      if (!Array.isArray(models)) (existing as { models: unknown }).models = models;
      continue;
    }
    for (const m of models as unknown[]) {
      const i = isObject(m) ? existing.models.findIndex(x => isObject(x) && x.id === m.id) : -1;
      if (i === -1) existing.models.push(m as ModelSpec);
      else existing.models[i] = { ...existing.models[i], ...(m as Partial<ModelSpec>) };
    }
  }
  return { catalog: { ...base, providers }, problems: [] };
}

export const BUILTIN_CATALOG: unknown = builtin;
