// 比較測試工具的設定（任務說明 tasks/rule-test-tool.md §4-2）：讀 `測試.yaml`，檢查之後交出型別確定的設定。
// 鍵用中文、和任務說明的範例一樣；值的意思也照任務說明。錯誤一次列完（每一條說是哪一項、為什麼）。
import { parse } from 'yaml';
import { PURPOSES, RULE_SUBJECTS, type CardForm, type Purpose } from '../../src/core/ai/index.ts';

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
interface Group { name: string; steps: Step[] }

export interface LessonConfig {
  code: string;
  subjectKey: string;
  form: CardForm;
  /** 已有目標：凍結時讀的 vault，或已經凍結好的快照檔（第一輪的重現用）。 */
  existing: { vault: string } | { snapshot: string } | null;
}

type AdapterKind = 'claude' | 'codex' | 'manual';
export interface Generator { name: string; kind: AdapterKind; model: string; effort: string; count: number; lessons: string[] | null; service: string | null }
interface Judge { name: string; kind: 'claude' | 'codex'; model: string; effort: string }

const METRICS = ['規則字數', '整份提示字數', '孩子會碰到的錯', '孩子會碰到的錯（不算多解）', '重大錯誤', '題目品質', '近義重複', '漏的必備', '部分的必備', '題數', '目標數', '生成時間'] as const;
type Metric = (typeof METRICS)[number];

interface Gates {
  baseline: string;
  candidates: string[];
  generators: string[];
  majorErrors: 'zero' | 'notMore';
  rowMissGap: number;
  missedRows: number;
  nearDuplicates: number;
  benefits: { metric: Metric; atLeast: number }[];
  noWorse: { metric: Metric; tolerance: number }[];
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
  gates: Gates;
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

function metric(value: unknown, where: string, errors: Errors): Metric {
  const name = text(value) ?? '';
  if (!(METRICS as readonly string[]).includes(name)) errors.add(where, `指標要是 ${METRICS.join('、')} 之一`);
  return name as Metric;
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
    return { name, steps };
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
    name: group.name,
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

  const rawGates = isRaw(doc['門檻']) ? doc['門檻'] : (errors.add('門檻', '少了門檻（開跑前一定要寫，§6-3）'), {});
  const baseline = need(rawGates, '基準', '門檻', errors);
  const candidates = list(rawGates['候選'], '門檻 候選', errors).map(String);
  const gateGenerators = list(rawGates['生成器'], '門檻 生成器', errors).map(String);
  if (!candidates.length) errors.add('門檻', '少了「候選」');
  if (!gateGenerators.length) errors.add('門檻', '少了「生成器」（哪幾個生成器算門檻，第一輪沒寫這一項）');
  for (const name of [baseline, ...candidates]) if (name && !names.includes(name)) errors.add('門檻', `沒有叫「${name}」的組`);
  for (const name of gateGenerators) if (!generatorNames.includes(name)) errors.add('門檻', `沒有叫「${name}」的生成器`);
  const majorText = text(rawGates['重大錯誤']) ?? '零';
  const gates: Gates = {
    baseline, candidates, generators: gateGenerators,
    majorErrors: majorText === '零' ? 'zero' : majorText === '不比基準多' ? 'notMore' : (errors.add('門檻 重大錯誤', '要寫「零」或「不比基準多」'), 'zero'),
    rowMissGap: Number(rawGates['多漏差距'] ?? 0.5),
    missedRows: Number(rawGates['多漏列數'] ?? 1),
    nearDuplicates: Number(rawGates['近義重複多出'] ?? 0),
    benefits: list(rawGates['收益'], '門檻 收益', errors).map((raw, i) => {
      const item = isRaw(raw) ? raw : {};
      return { metric: metric(item['指標'], `門檻 收益 第 ${String(i + 1)} 項`, errors), atLeast: percent(item['至少'], `門檻 收益 第 ${String(i + 1)} 項 至少`, errors) };
    }),
    noWorse: list(rawGates['不能變差'], '門檻 不能變差', errors).map((raw, i) => {
      const item = isRaw(raw) ? raw : {};
      return { metric: metric(item['指標'], `門檻 不能變差 第 ${String(i + 1)} 項`, errors), tolerance: percent(item['容許'], `門檻 不能變差 第 ${String(i + 1)} 項 容許`, errors) };
    }),
  };
  if (!gates.benefits.length) errors.add('門檻', '少了「收益」');

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
    gates,
  };
  if (!(config.timeoutMinutes > 0)) errors.add('逾時分鐘', '要大於 0');
  if (!Number.isInteger(config.concurrency) || config.concurrency < 1) errors.add('同時', '要是 1 以上的整數');
  if (errors.list.length) throw Error(`測試.yaml 有 ${String(errors.list.length)} 個問題：\n${errors.list.map(each => `- ${each}`).join('\n')}`);
  return config;
}

/** 一個生成器在哪幾課跑。 */
export const lessonsOf = (config: Config, generator: Generator): LessonConfig[] =>
  generator.lessons === null ? config.lessons : config.lessons.filter(each => generator.lessons!.includes(each.code));
