// 比較測試工具的設定（任務說明 tasks/rule-test-tool.md §4-2）：讀 `測試.yaml`，檢查之後交出型別確定的設定。
// 鍵用中文、和任務說明的範例一樣；值的意思也照任務說明。錯誤一次列完（每一條說是哪一項、為什麼）。
import { parse } from 'yaml';
import { PURPOSES, RULE_SUBJECTS, type CardForm, type Purpose } from '../../src/core/ai/index.ts';
import { ADJUSTABLE, DEFAULT_LEVELS, type Levels } from './levels.ts';

export interface TaskOptions {
  /** 點選填空的說明（pickRules）送不送；任務資料那一行照送。 */
  pickRules: boolean;
  /** 已有目標的比對說明：外掛原文，或換成一行。 */
  existingRules: 'plugin' | 'line';
  /** 加「照規則交三段」那一行，格式檢查用三段的切法。 */
  threeSections: boolean;
  /** 已有目標的清單：原寫法，或 D-229 的精簡寫法。 */
  existingList: 'plugin' | 'lean';
}
export const PLUGIN_TASK: TaskOptions = { pickRules: true, existingRules: 'plugin', threeSections: false, existingList: 'plugin' };

export type RuleSource =
  | { kind: 'plugin'; subject: string }
  | { kind: 'files'; commit: string; files: string[]; task: TaskOptions }
  | { kind: 'own'; files: Record<string, string> };

interface Step { conversation: string; rules: RuleSource; deck: boolean }
/** 加深規則（rule-test-d236.md §6-1 第 5 點）：「檔案」與「自備」來源的組跑加深時一定要寫，送這幾個檔的送給 AI 段加上加深段。 */
interface DeepenRules { commit: string; files: string[] }
export interface Group { name: string; steps: Step[]; deepenRules: DeepenRules | null }

export interface LessonConfig {
  code: string;
  subjectKey: string;
  form: CardForm;
  /** 已有目標：凍結時讀的 vault，或已經凍結好的快照檔（第一輪的重現用）。 */
  existing: { vault: string } | { snapshot: string } | null;
}

export type AdapterKind = 'claude' | 'codex' | 'manual';
export interface Generator { name: string; kind: AdapterKind; model: string; effort: string; count: number; lessons: string[] | null; service: string | null }
export interface Judge { name: string; kind: 'claude' | 'codex'; model: string; effort: string }

/** 學習面的指標（rule-test-d236.md §7-2，D-236 第 4 點）：收益與不能變差只收這幾個，都是越少越好。 */
export const LEARNING_METRICS = ['傷到學習', '判錯', '每個必備平均幾題', '多餘的題', '地圖漏的必備', '地圖問題', '加深機會漏掉', '確定接錯'] as const;
export type LearningMetric = (typeof LEARNING_METRICS)[number];
/** 次要指標（§9）：只報告，學習面打平時才用。 */
export const SECONDARY_METRICS = ['規則字數', '整份提示字數', 'token', '生成時間'] as const;
export type SecondaryMetric = (typeof SECONDARY_METRICS)[number];

/** 容許量＝max（百分比 × 基準平均，絕對下限）；下限處理基準平均是 0 的情況（§7-2 第 3、5 道）。 */
export interface Tolerance { percent: number; floor: number }
/** 不能變差的預設容許量（§7-2 的表）；傷到學習是第 3 道，另外設。 */
export const NO_WORSE_DEFAULTS: Record<Exclude<LearningMetric, '傷到學習'>, Tolerance> = {
  判錯: { percent: 0, floor: 0.5 }, 每個必備平均幾題: { percent: 0.1, floor: 0.2 }, 多餘的題: { percent: 0, floor: 0.5 },
  地圖漏的必備: { percent: 0, floor: 0.5 }, 地圖問題: { percent: 0, floor: 0.5 }, 加深機會漏掉: { percent: 0, floor: 0.5 }, 確定接錯: { percent: 0, floor: 0.5 },
};

export interface Gates {
  baseline: string;
  candidates: string[];
  generators: string[];
  majorErrors: 'zero' | 'notMore';
  rowMissGap: number;
  missedRows: number;
  /** 多餘的題（近義重複）候選每份平均最多多幾題（§4）。 */
  extraPrompts: number;
  /** 第 3 道：傷到學習的容許量（§12 第 4 題，預設 0）。 */
  harm: Tolerance;
  benefits: { metric: LearningMetric; atLeast: number }[];
  /** 收益列了 k 項時每一項用 5%÷k 判明顯（§7-1 第 3 點；§12 第 3 題的 (b) 是不校正）。 */
  correction: boolean;
  /** 不能變差：全部適用的學習面指標自動進來，這裡是改過的容許量。 */
  noWorse: Record<Exclude<LearningMetric, '傷到學習'>, Tolerance>;
  secondary: { metric: SecondaryMetric; atLeast: number; tolerance: number }[];
  tieMinCopies: number;
  /** 「打平，候選較省」工具直接標過，或只報告（§12 第 2 題）。 */
  tieCheaper: 'pass' | 'report';
  /** 時間預算（檢查表課 3，rule-test-d236.md §16）：目標多超過 15% 而必備沒多時只標出來，或算沒過。 */
  timeBudget: 'report' | 'gate';
}

export interface Config {
  name: string;
  library: string;
  systemPrompt: string | null;
  timeoutMinutes: number;
  concurrency: number;
  lessons: LessonConfig[];
  groups: Group[];
  generators: Generator[];
  judges: Judge[];
  rejudge: number;
  adjudicator: Judge;
  /** 評分表的三個對話（§5-2）：寫的一方（也回應核對）與核對的一方。 */
  rubric: { writer: Judge; checker: Judge };
  gates: Gates;
  /** 錯誤分級（rule-test-d236.md §3-1）。 */
  levels: Levels;
  /** 模擬首次加深（§6-1）：跑哪幾個生成器；沒寫是不跑。 */
  deepen: { generators: string[] } | null;
  /** 對照（§8）：甲對乙，只報告。 */
  contrasts: { name: string; a: string; b: string }[];
}

type Raw = Record<string, unknown>;
const isRaw = (value: unknown): value is Raw => typeof value === 'object' && value !== null && !Array.isArray(value);

class Errors {
  list: string[] = [];
  add(where: string, message: string): void { this.list.push(`${where}：${message}`); }
}

const text = (value: unknown): string | null => typeof value === 'string' ? value.trim() : typeof value === 'number' ? String(value) : null;
function need(raw: Raw, key: string, where: string, errors: Errors): string {
  const value = text(raw[key]);
  if (!value) errors.add(where, `少了「${key}」`);
  return value ?? '';
}
function yesNo(value: unknown, yes: string, no: string, where: string, errors: Errors): boolean {
  if (value === true || value === yes) return true;
  if (value === false || value === no) return false;
  errors.add(where, `要寫「${yes}」或「${no}」`);
  return false;
}
function percent(value: unknown, where: string, errors: Errors): number {
  const match = typeof value === 'number' ? [String(value), String(value)] : typeof value === 'string' ? /^\s*(\d+(?:\.\d+)?)\s*%?\s*$/.exec(value) : null;
  if (!match) { errors.add(where, '要寫百分比，例如 20%'); return 0; }
  return Number(match[1]) / 100;
}
function list(value: unknown, where: string, errors: Errors): unknown[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) { errors.add(where, '要是清單'); return []; }
  return value;
}

function taskOptions(raw: unknown, where: string, errors: Errors): TaskOptions {
  if (raw === undefined) return { ...PLUGIN_TASK };
  if (!isRaw(raw)) { errors.add(where, '任務段要寫成 { 點選填空說明, 已有目標說明, 三段, 已有目標清單 }'); return { ...PLUGIN_TASK }; }
  return {
    pickRules: raw['點選填空說明'] === undefined ? true : yesNo(raw['點選填空說明'], '送', '不送', `${where} 點選填空說明`, errors),
    existingRules: raw['已有目標說明'] === undefined || raw['已有目標說明'] === '外掛原文' ? 'plugin' : raw['已有目標說明'] === '一行' ? 'line' : (errors.add(`${where} 已有目標說明`, '要寫「外掛原文」或「一行」'), 'plugin'),
    threeSections: raw['三段'] === undefined ? false : yesNo(raw['三段'], '要', '不要', `${where} 三段`, errors),
    existingList: raw['已有目標清單'] === undefined || raw['已有目標清單'] === '原寫法' ? 'plugin' : raw['已有目標清單'] === '精簡' ? 'lean' : (errors.add(`${where} 已有目標清單`, '要寫「原寫法」或「精簡」'), 'plugin'),
  };
}

/** 一份規則來源；`同` 在 resolve 時換成被沿用那一組第一步的來源，再套上這裡寫的檔案或任務段。 */
type Pending = RuleSource | { kind: 'same'; group: string; files?: string[]; task?: unknown };
function ruleSource(raw: unknown, where: string, errors: Errors): Pending {
  if (!isRaw(raw)) { errors.add(where, '規則要寫成 { 外掛 }、{ commit, 檔案, 任務段 }、{ 同 } 或 { 自備 }'); return { kind: 'plugin', subject: '' }; }
  if (raw['外掛'] !== undefined) {
    const subject = text(raw['外掛']) ?? '';
    if (!RULE_SUBJECTS.some(each => each.key === subject)) errors.add(where, `外掛沒有「${subject}」這一科（有：${RULE_SUBJECTS.map(each => each.key).join('、')}）`);
    return { kind: 'plugin', subject };
  }
  if (raw['同'] !== undefined) {
    const files = raw['檔案'] === undefined ? undefined : list(raw['檔案'], `${where} 檔案`, errors).map(String);
    return { kind: 'same', group: text(raw['同']) ?? '', ...files ? { files } : {}, ...raw['任務段'] === undefined ? {} : { task: raw['任務段'] } };
  }
  if (raw['自備'] !== undefined) {
    if (!isRaw(raw['自備'])) { errors.add(where, '自備要寫成 { <課代號>: <提示/ 裡的檔名> }'); return { kind: 'own', files: {} }; }
    return { kind: 'own', files: Object.fromEntries(Object.entries(raw['自備']).map(([lesson, file]) => [lesson, String(file)])) };
  }
  const files = list(raw['檔案'], `${where} 檔案`, errors).map(String);
  if (!files.length) errors.add(where, '少了「檔案」');
  return { kind: 'files', commit: need(raw, 'commit', where, errors), files, task: taskOptions(raw['任務段'], `${where} 任務段`, errors) };
}

function form(raw: unknown, where: string, errors: Errors): { subjectKey: string; form: CardForm } {
  if (!isRaw(raw)) { errors.add(where, '少了「表單」'); return { subjectKey: '', form: { subject: '', term: '', unit: '', purpose: '準備段考', supplement: false, pick: false, adjust: '', material: '' } }; }
  const subjectKey = need(raw, '科目', where, errors);
  const subject = RULE_SUBJECTS.find(each => each.key === subjectKey);
  if (subjectKey && !subject) errors.add(where, `外掛沒有「${subjectKey}」這一科（有：${RULE_SUBJECTS.map(each => each.key).join('、')}）`);
  const purpose = (text(raw['目的']) ?? '準備段考') as Purpose;
  if (!PURPOSES.includes(purpose)) errors.add(where, `目的要是 ${PURPOSES.join('、')} 之一`);
  return {
    subjectKey,
    form: {
      subject: subjectKey,
      term: need(raw, '年級學期', where, errors),
      unit: need(raw, '單元', where, errors),
      purpose,
      supplement: raw['補充'] === undefined ? subject?.supplement ?? false : yesNo(raw['補充'], '是', '否', `${where} 補充`, errors),
      pick: raw['點選填空'] === undefined ? subject?.pick ?? false : yesNo(raw['點選填空'], '要', '不要', `${where} 點選填空`, errors),
      adjust: text(raw['家長調整']) === '無' ? '' : text(raw['家長調整']) ?? '',
      material: text(raw['教材說明']) ?? '',
    },
  };
}

const SECONDARY_NOTE = '規則字數、整份提示字數、token、生成時間是次要指標，只能寫在「次要」（D-236 第 4 點）';
function learning(value: unknown, where: string, errors: Errors): LearningMetric {
  const name = text(value) ?? '';
  if ((SECONDARY_METRICS as readonly string[]).includes(name)) errors.add(where, SECONDARY_NOTE);
  else if (!(LEARNING_METRICS as readonly string[]).includes(name)) errors.add(where, `指標要是 ${LEARNING_METRICS.join('、')} 之一`);
  return name as LearningMetric;
}
function secondary(value: unknown, where: string, errors: Errors): SecondaryMetric {
  const name = text(value) ?? '';
  if (!(SECONDARY_METRICS as readonly string[]).includes(name)) errors.add(where, `次要指標要是 ${SECONDARY_METRICS.join('、')} 之一`);
  return name as SecondaryMetric;
}
function count(value: unknown, fallback: number, where: string, errors: Errors): number {
  if (value === undefined) return fallback;
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) errors.add(where, '要是 0 以上的數');
  return number;
}

function deepenRules(raw: unknown, where: string, errors: Errors): DeepenRules | null {
  if (raw === undefined) return null;
  const item = isRaw(raw) ? raw : (errors.add(where, '要寫成 { commit, 檔案 }'), {});
  const files = list(item['檔案'], `${where} 檔案`, errors).map(String);
  if (!files.length) errors.add(where, '少了「檔案」');
  return { commit: need(item, 'commit', where, errors), files };
}

function levels(raw: unknown, errors: Errors): Levels {
  if (raw === undefined) return { ...DEFAULT_LEVELS };
  if (!isRaw(raw)) { errors.add('錯誤分級', '要寫成 { 種類: 傷到學習 或 小問題 }'); return { ...DEFAULT_LEVELS }; }
  const out = { ...DEFAULT_LEVELS };
  for (const [kind, level] of Object.entries(raw)) {
    if (!(ADJUSTABLE as readonly string[]).includes(kind)) { errors.add(`錯誤分級 ${kind}`, `只能調 ${ADJUSTABLE.join('、')}（重大錯誤、存不了照 D-234 是重大；判錯、洩漏是 D-236 點名的傷到學習）`); continue; }
    if (level !== '傷到學習' && level !== '小問題') { errors.add(`錯誤分級 ${kind}`, '要寫「傷到學習」或「小問題」'); continue; }
    out[kind as keyof Levels] = level;
  }
  return out;
}

/** 讀設定；有錯就丟一個列出全部錯誤的 Error。 */
export function readConfig(source: string): Config {
  const errors = new Errors();
  let doc: unknown;
  try { doc = parse(source); } catch (error) { throw Error(`測試.yaml 讀不懂：${error instanceof Error ? error.message : String(error)}`); }
  if (!isRaw(doc)) throw Error('測試.yaml 要是一個物件');

  const lessons = list(doc['課'], '課', errors).map((raw, i): LessonConfig => {
    const where = `課 第 ${String(i + 1)} 項`;
    if (!isRaw(raw)) { errors.add(where, '要寫成 { 代號, 表單, 已有目標 }'); return { code: '', subjectKey: '', form: form(undefined, where, errors).form, existing: null }; }
    const existing = raw['已有目標'];
    const parsed = form(raw['表單'], `${where} 表單`, errors);
    return {
      code: need(raw, '代號', where, errors),
      ...parsed,
      existing: !isRaw(existing) ? null : text(existing.vault) ? { vault: text(existing.vault)! } : text(existing['快照']) ? { snapshot: text(existing['快照'])! } : null,
    };
  });
  if (!lessons.length) errors.add('課', '至少要有一課');
  const codes = lessons.map(each => each.code);
  codes.forEach((code, i) => { if (code && codes.indexOf(code) !== i) errors.add('課', `代號「${code}」重複`); });

  const pending = list(doc['組'], '組', errors).map((raw, i) => {
    const where = `組 第 ${String(i + 1)} 項`;
    if (!isRaw(raw)) { errors.add(where, '要寫成 { 名稱, 規則 } 或 { 名稱, 步驟 }'); return { name: '', steps: [] as { conversation: string; rules: Pending | null; deck: boolean }[] }; }
    const name = need(raw, '名稱', where, errors);
    const groupRules = raw['規則'] === undefined ? null : ruleSource(raw['規則'], `${where} 規則`, errors);
    const steps = raw['步驟'] === undefined
      ? [{ conversation: 'A', rules: groupRules, deck: true }]
      : list(raw['步驟'], `${where} 步驟`, errors).map((step, j) => {
        const at = `${where} 步驟 ${String(j + 1)}`;
        if (!isRaw(step)) { errors.add(at, '要寫成 { 對話, 規則, 卡組 }'); return { conversation: 'A', rules: groupRules, deck: false }; }
        return { conversation: text(step['對話']) ?? 'A', rules: step['規則'] === undefined ? groupRules : ruleSource(step['規則'], `${at} 規則`, errors), deck: step['卡組'] === undefined ? false : yesNo(step['卡組'], '是', '否', `${at} 卡組`, errors) };
      });
    if (steps.some(step => step.rules === null)) errors.add(where, '少了「規則」（組或每一步要有一個）');
    if (!steps.some(step => step.deck)) errors.add(where, '至少要有一步「卡組: 是」');
    return { name, steps, deepenRules: deepenRules(raw['加深規則'], `${where} 加深規則`, errors) };
  });
  const names = pending.map(each => each.name);
  names.forEach((name, i) => { if (name && names.indexOf(name) !== i) errors.add('組', `名稱「${name}」重複`); });
  const resolve = (rules: Pending, where: string, seen: string[]): RuleSource => {
    if (rules.kind !== 'same') return rules;
    const target = pending.find(each => each.name === rules.group);
    if (!target || seen.includes(rules.group)) { errors.add(where, target ? `「同: ${rules.group}」繞回自己` : `沒有叫「${rules.group}」的組`); return { kind: 'plugin', subject: '' }; }
    const base = target.steps[0]?.rules;
    const resolved = base ? resolve(base, where, [...seen, rules.group]) : { kind: 'plugin' as const, subject: '' };
    if (rules.files === undefined && rules.task === undefined) return resolved;
    if (resolved.kind !== 'files') { errors.add(where, '只有「檔案」來源的組可以被沿用後換檔案或任務段'); return resolved; }
    return { ...resolved, ...rules.files ? { files: rules.files } : {}, ...rules.task === undefined ? {} : { task: taskOptions(rules.task, `${where} 任務段`, errors) } };
  };
  const groups: Group[] = pending.map(group => ({
    name: group.name, deepenRules: group.deepenRules ?? null,
    steps: group.steps.map((step, j) => {
      const rules = step.rules ? resolve(step.rules, `組「${group.name}」步驟 ${String(j + 1)}`, [group.name]) : { kind: 'plugin' as const, subject: '' };
      if (rules.kind === 'own') for (const code of codes) if (code && !rules.files[code]) errors.add(`組「${group.name}」步驟 ${String(j + 1)}`, `自備少了課「${code}」的檔`);
      return { conversation: step.conversation, rules, deck: step.deck };
    }),
  }));
  if (!groups.length) errors.add('組', '至少要有一組');

  const generators = list(doc['生成'], '生成', errors).map((raw, i): Generator => {
    const where = `生成 第 ${String(i + 1)} 項`;
    const item = isRaw(raw) ? raw : {};
    const kindText = text(item['生成器']);
    const kind: AdapterKind = kindText === '手貼' ? 'manual' : kindText === 'claude' || kindText === 'codex' ? kindText : (errors.add(where, '生成器要是 claude、codex 或 手貼'), 'manual');
    const count = Number(item['份數'] ?? 1);
    if (!Number.isInteger(count) || count < 1) errors.add(where, '份數要是 1 以上的整數');
    const only = item['課'] === undefined ? null : list(item['課'], `${where} 課`, errors).map(String);
    for (const code of only ?? []) if (!codes.includes(code)) errors.add(where, `沒有課「${code}」`);
    const model = need(item, '模型', where, errors);
    return { name: text(item['名稱']) ?? (kind === 'manual' ? text(item['服務']) ?? '手貼' : kind), kind, model, effort: text(item['推理']) ?? 'high', count, lessons: only, service: text(item['服務']) };
  });
  if (!generators.length) errors.add('生成', '至少要有一個生成器');
  const generatorNames = generators.map(each => each.name);
  generatorNames.forEach((name, i) => { if (generatorNames.indexOf(name) !== i) errors.add('生成', `名稱「${name}」重複（同一種生成器有兩項時寫「名稱」分開）`); });

  const judge = (raw: unknown, where: string, key: string): Judge => {
    const item = isRaw(raw) ? raw : {};
    const kindText = text(item[key]);
    const kind = kindText === 'claude' || kindText === 'codex' ? kindText : (errors.add(where, `${key}要是 claude 或 codex`), 'claude');
    return { name: text(item['名稱']) ?? kind, kind, model: need(item, '模型', where, errors), effort: text(item['推理']) ?? 'high' };
  };
  const judges = list(doc['評審'], '評審', errors).map((raw, i) => judge(raw, `評審 第 ${String(i + 1)} 項`, '評審'));
  if (judges.length !== 2) errors.add('評審', '要剛好兩位（合併規則是兩位的，§6-2）');
  if (judges.length === 2 && judges[0].name === judges[1].name) errors.add('評審', '兩位的名稱一樣，寫「名稱」分開');
  const adjudicator = doc['裁定'] === undefined ? { name: 'claude', kind: 'claude' as const, model: 'claude-opus-5-5', effort: 'high' } : judge(doc['裁定'], '裁定', '裁定者');
  const rawRubric = isRaw(doc['評分表']) ? doc['評分表'] : {};
  const rubric = {
    writer: rawRubric['寫'] === undefined ? { name: 'claude', kind: 'claude' as const, model: 'claude-fable-5-2', effort: 'high' } : judge(rawRubric['寫'], '評分表 寫', '評審'),
    checker: rawRubric['核對'] === undefined ? { name: 'codex', kind: 'codex' as const, model: 'gpt-6.2-sol', effort: 'high' } : judge(rawRubric['核對'], '評分表 核對', '評審'),
  };

  const rawGates = isRaw(doc['門檻']) ? doc['門檻'] : (errors.add('門檻', '少了門檻（開跑前一定要寫，§6-3）'), {});
  const baseline = need(rawGates, '基準', '門檻', errors);
  const candidates = list(rawGates['候選'], '門檻 候選', errors).map(String);
  const gateGenerators = list(rawGates['生成器'], '門檻 生成器', errors).map(String);
  if (!candidates.length) errors.add('門檻', '少了「候選」');
  if (!gateGenerators.length) errors.add('門檻', '少了「生成器」（哪幾個生成器算門檻，第一輪沒寫這一項）');
  for (const name of [baseline, ...candidates]) if (name && !names.includes(name)) errors.add('門檻', `沒有叫「${name}」的組`);
  for (const name of gateGenerators) if (!generatorNames.includes(name)) errors.add('門檻', `沒有叫「${name}」的生成器`);
  const majorText = text(rawGates['重大錯誤']) ?? '不比基準多';
  const tolerance = (raw: unknown, where: string, fallback: Tolerance): Tolerance => {
    if (raw === undefined) return { ...fallback };
    const item = isRaw(raw) ? raw : {};
    return { percent: item['百分比'] === undefined ? fallback.percent : percent(item['百分比'], `${where} 百分比`, errors), floor: count(item['下限'], fallback.floor, `${where} 下限`, errors) };
  };
  const noWorse = { ...NO_WORSE_DEFAULTS };
  list(rawGates['不能變差'], '門檻 不能變差', errors).forEach((raw, i) => {
    const where = `門檻 不能變差 第 ${String(i + 1)} 項`;
    const item = isRaw(raw) ? raw : {};
    const name = learning(item['指標'], where, errors);
    if (name === '傷到學習') { errors.add(where, '傷到學習是第 3 道，容許量寫在「傷到學習容許」'); return; }
    if (!(name in noWorse)) return;
    const key = name;
    noWorse[key] = { percent: item['容許'] === undefined ? noWorse[key].percent : percent(item['容許'], `${where} 容許`, errors), floor: count(item['下限'], noWorse[key].floor, `${where} 下限`, errors) };
  });
  const tieText = text(rawGates['打平較省']) ?? '過';
  const budgetText = text(rawGates['時間預算']) ?? '只報告';
  const gates: Gates = {
    baseline, candidates, generators: gateGenerators,
    majorErrors: majorText === '零' ? 'zero' : majorText === '不比基準多' ? 'notMore' : (errors.add('門檻 重大錯誤', '要寫「零」或「不比基準多」'), 'zero'),
    rowMissGap: Number(rawGates['多漏差距'] ?? 0.5),
    missedRows: Number(rawGates['多漏列數'] ?? 1),
    extraPrompts: count(rawGates['多餘的題多出'], 0, '門檻 多餘的題多出', errors),
    harm: tolerance(rawGates['傷到學習容許'], '門檻 傷到學習容許', { percent: 0, floor: 0 }),
    benefits: list(rawGates['收益'], '門檻 收益', errors).map((raw, i) => {
      const item = isRaw(raw) ? raw : {};
      return { metric: learning(item['指標'], `門檻 收益 第 ${String(i + 1)} 項`, errors), atLeast: percent(item['至少'], `門檻 收益 第 ${String(i + 1)} 項 至少`, errors) };
    }),
    correction: (() => {
      const value = text(rawGates['收益校正']) ?? '要';
      return value === '要' ? true : value === '不要' ? false : (errors.add('門檻 收益校正', '要寫「要」或「不要」'), true);
    })(),
    noWorse,
    secondary: list(rawGates['次要'], '門檻 次要', errors).map((raw, i) => {
      const item = isRaw(raw) ? raw : {};
      const where = `門檻 次要 第 ${String(i + 1)} 項`;
      return { metric: secondary(item['指標'], where, errors), atLeast: percent(item['至少'], `${where} 至少`, errors), tolerance: percent(item['容許'] ?? 0, `${where} 容許`, errors) };
    }),
    tieMinCopies: count(rawGates['打平最少份數'], 3, '門檻 打平最少份數', errors),
    tieCheaper: tieText === '過' ? 'pass' : tieText === '只報告' ? 'report' : (errors.add('門檻 打平較省', '要寫「過」或「只報告」'), 'pass'),
    timeBudget: budgetText === '只報告' ? 'report' : budgetText === '算門檻' ? 'gate' : (errors.add('門檻 時間預算', '要寫「只報告」或「算門檻」'), 'report'),
  };
  if (rawGates['近義重複多出'] !== undefined) errors.add('門檻 近義重複多出', '改成「多餘的題多出」（每組題數減一加總，rule-test-d236.md §4）');
  if (!gates.benefits.length) errors.add('門檻', '少了「收益」');

  // 加深與對照（rule-test-d236.md §2、§6-1、§8）。
  let deepen: Config['deepen'] = null;
  if (doc['加深'] !== undefined) {
    const raw = isRaw(doc['加深']) ? doc['加深'] : (errors.add('加深', '要寫成 { 生成器: [...] }'), {});
    const chosen = list(raw['生成器'], '加深 生成器', errors).map(String);
    for (const name of chosen) {
      const generator = generators.find(each => each.name === name);
      if (!generator) errors.add('加深', `沒有叫「${name}」的生成器`);
      else if (generator.kind === 'manual') errors.add('加深', `「${name}」是手貼的生成器，不跑加深（rule-test-d236.md §2）`);
    }
    if (!chosen.length) errors.add('加深', '少了「生成器」');
    deepen = { generators: chosen };
  }
  const contrasts = list(doc['對照'], '對照', errors).map((raw, i) => {
    const where = `對照 第 ${String(i + 1)} 項`;
    const item = isRaw(raw) ? raw : (errors.add(where, '要寫成 { 名稱, 甲, 乙 }'), {});
    const contrast = { name: need(item, '名稱', where, errors), a: need(item, '甲', where, errors), b: need(item, '乙', where, errors) };
    for (const name of [contrast.a, contrast.b]) if (name && !names.includes(name)) errors.add(where, `沒有叫「${name}」的組`);
    if (contrast.a && contrast.a === contrast.b) errors.add(where, '甲和乙是同一組');
    return contrast;
  });
  if (deepen) {
    const compared = new Set(comparedGroups({ baseline, candidates }, contrasts));
    for (const group of groups.filter(each => compared.has(each.name) && !each.deepenRules)) {
      const subjects = new Set(group.steps.filter(step => step.deck).map(step => step.rules.kind === 'plugin' ? step.rules.subject : null));
      if (subjects.has(null) || subjects.size > 1) errors.add(`組「${group.name}」`, '跑加深的組，規則不是同一科的「外掛」來源時，要寫「加深規則: { commit, 檔案 }」（rule-test-d236.md §6-1 第 5 點）');
    }
  }

  // 算門檻的組份數相同（F11）：份數與跑哪幾課都寫在生成器上、每一組照跑，所以讀設定時一定成立；補跑時由 extend 檢查（§5-10）。
  const config: Config = {
    name: need(doc, '名稱', '設定', errors),
    library: need(doc, '課庫', '設定', errors),
    systemPrompt: text(doc['系統提示']),
    timeoutMinutes: Number(doc['逾時分鐘'] ?? 40),
    concurrency: Number(doc['同時'] ?? 2),
    lessons, groups, generators, judges,
    rejudge: Number(doc['評審重評'] ?? 0),
    adjudicator,
    rubric,
    gates,
    levels: levels(doc['錯誤分級'], errors),
    deepen, contrasts,
  };
  if (!(config.timeoutMinutes > 0)) errors.add('逾時分鐘', '要大於 0');
  if (!Number.isInteger(config.concurrency) || config.concurrency < 1) errors.add('同時', '要是 1 以上的整數');
  if (errors.list.length) throw Error(`測試.yaml 有 ${String(errors.list.length)} 個問題：\n${errors.list.map(each => `- ${each}`).join('\n')}`);
  return config;
}

/** 算門檻與對照用到的組（基準、候選、對照的甲乙）：跑加深的就是這幾組（rule-test-d236.md §6-1 第 1 點）。 */
const comparedGroups = (gates: Pick<Gates, 'baseline' | 'candidates'>, contrasts: Config['contrasts']): string[] =>
  [...new Set([gates.baseline, ...gates.candidates, ...contrasts.flatMap(each => [each.a, each.b])])];

/** 跑加深的組；沒設定加深是空的。 */
export const deepenGroups = (config: Config): string[] => config.deepen ? comparedGroups(config.gates, config.contrasts) : [];

/** 一個生成器在哪幾課跑。 */
export const lessonsOf = (config: Config, generator: Generator): LessonConfig[] =>
  generator.lessons === null ? config.lessons : config.lessons.filter(each => generator.lessons!.includes(each.code));
