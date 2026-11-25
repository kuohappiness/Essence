// 讀廠商與模型的資料、驗格式、合併呼叫端加的或蓋掉的（docs/tasks/ai-client.md〈7〉第 10 點）。
// 壞掉的那一筆跳過並回報，不讓整個套件不能用。
import builtin from '../catalog.json' with { type: 'json' };
import type { Catalog, InputKind, ModelSpec, PriceSpec, ProviderSpec, ReasoningLevel, ReasoningSpec } from './types.ts';
import { REASONING_LEVELS } from './types.ts';

const INPUTS: readonly InputKind[] = ['text', 'image', 'pdf'];
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export interface CatalogProblem {
  provider: string;
  model?: string;
  problem: string;
}

/** 網址只能是 https，或本機的 http（localhost、127.0.0.1、::1，給 Ollama 這類本機模型）。 */
export function isAllowedUrl(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.username || url.password) return false;
  if (url.protocol === 'https:') return true;
  return url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
}

const isDate = (value: unknown): boolean => typeof value === 'string' && DATE.test(value) && !Number.isNaN(Date.parse(value));
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

function priceProblem(price: PriceSpec): string | null {
  if (price.effectiveFrom !== undefined && !isDate(price.effectiveFrom)) return 'effectiveFrom 不是合法日期';
  for (const key of ['input', 'output'] as const) if (!isPrice(price[key])) return `價格的 ${key} 要是非負數`;
  for (const key of ['cachedInput', 'cacheWrite'] as const) if (price[key] !== undefined && !isPrice(price[key])) return `價格的 ${key} 要是非負數`;
  const lc = price.longContext;
  if (lc !== undefined && (!isPrice(lc.aboveInputTokens) || !isPrice(lc.input) || !isPrice(lc.output) || (lc.cachedInput !== undefined && !isPrice(lc.cachedInput)))) return 'longContext 的數字要是非負數';
  return null;
}

function modelProblem(model: ModelSpec): string | null {
  if (typeof model.id !== 'string' || !model.id) return '模型沒有 id';
  const inputs = inputsProblem(model.inputs);
  if (inputs) return inputs;
  const reasoning = reasoningProblem(model.reasoning);
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

/** 驗一份目錄：回傳能用的部分與每個問題。dialects 是登記過的方言名稱。 */
export function validateCatalog(input: unknown, dialects: ReadonlySet<string>): { catalog: Catalog; problems: CatalogProblem[] } {
  const problems: CatalogProblem[] = [];
  const raw = (typeof input === 'object' && input !== null ? input : {}) as Partial<Catalog>;
  const providers: ProviderSpec[] = [];
  const seen = new Set<string>();
  for (const p of Array.isArray(raw.providers) ? raw.providers : []) {
    const id = typeof p?.id === 'string' && p.id ? p.id : '(沒有 id)';
    const fail = (problem: string) => problems.push({ provider: id, problem });
    if (id === '(沒有 id)') { fail('廠商沒有 id'); continue; }
    if (seen.has(id)) { fail('id 重複'); continue; }
    if (!dialects.has(p.dialect)) { fail(`方言 ${String(p.dialect)} 沒有登記`); continue; }
    if (typeof p.baseUrl !== 'string' || !isAllowedUrl(p.baseUrl)) { fail('baseUrl 要是 https，或本機的 http'); continue; }
    if (p.auth !== null && (typeof p.auth !== 'object' || typeof p.auth.header !== 'string' || !p.auth.header)) { fail('auth 要是 { header, scheme? } 或 null'); continue; }
    const defaultsProblem = inputsProblem(p.defaults?.inputs) ?? reasoningProblem(p.defaults?.reasoning);
    if (defaultsProblem) { fail(`defaults：${defaultsProblem}`); continue; }
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

export function mergeCatalog(base: Catalog, extra: CatalogOverrides | undefined): unknown {
  if (!extra?.providers) return base;
  const providers = base.providers.map(p => ({ ...p, models: [...p.models] }));
  for (const add of extra.providers) {
    const existing = providers.find(p => p.id === add.id);
    if (!existing) {
      providers.push({ ...add, models: add.models ?? [] } as ProviderSpec);
      continue;
    }
    const { models, ...fields } = add;
    Object.assign(existing, fields);
    for (const m of models ?? []) {
      const i = existing.models.findIndex(x => x.id === m.id);
      if (i === -1) existing.models.push(m);
      else existing.models[i] = { ...existing.models[i], ...m };
    }
  }
  return { ...base, providers };
}

export const BUILTIN_CATALOG: unknown = builtin;
