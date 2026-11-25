// 比較測試工具：judge（任務說明 tasks/rule-test-tool.md §5-7）。每個區組、每位評審一個新對話，只拿到那個區組資料夾的複本；
// 交 JSON（schema 只用兩家 CLI 都收的寫法），工具驗列號、行號、頁數，格式不合就在同一個對話補正；一批全部交齊就鎖定（雜湊寫進 鎖定.md）。
import { randomInt } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, sep } from 'node:path';
import { claudeAdapter, codexAdapter, type Adapter } from './adapters.ts';
import { askJson, type AskOutcome } from './ask.ts';
import { batchDir, batchNumbers, mapBlockDir, readBlocks, type Block } from './blind.ts';
import { cliPath } from '../cli-path.ts';
import type { Judge } from './config.ts';
import { copyDir, materialOf, openFolder, rubricOf, sha256File, writeOnce, type Folder } from './folder.ts';
import { readFrozenSnapshot, verifyLock } from './freeze.ts';
import { acquireLock, detach } from './generate.ts';
import { appendEvent, jobState, readEvents, reopenFailed } from './jobs.ts';
import { countPdfPages } from './probe.ts';
import { ISSUE_KINDS, type IssueKind } from './levels.ts';
import { mapSchema, validateMap } from './map.ts';
import { twoPrompts } from './merge.ts';
import { judgedRows, parseRubric, type RubricRow } from './rubric.ts';

type Verdict = '有' | '部分' | '沒有';
export interface JudgeResult {
  pages: { page: number; note: string }[];
  rows: { row: string; decks: { deck: string; evidence: string; lines: number[]; verdict: Verdict }[] }[];
  issues: { deck: string; kind: IssueKind; lines: number[]; rubric: string; note: string }[];
  unsure: string;
}

const object = (properties: Record<string, unknown>): Record<string, unknown> => ({ type: 'object', additionalProperties: false, required: Object.keys(properties), properties });
const array = (items: unknown): Record<string, unknown> => ({ type: 'array', items });

/** 評審交的 JSON 的 schema：陣列、enum、全部必填、不用動態鍵（F9）。 */
export function judgeSchema(codes: readonly string[]): Record<string, unknown> {
  const deck = { type: 'string', enum: [...codes] };
  const lines = array({ type: 'integer' });
  return object({
    pages: array(object({ page: { type: 'integer' }, note: { type: 'string' } })),
    rows: array(object({ row: { type: 'string' }, decks: array(object({ deck, evidence: { type: 'string' }, lines, verdict: { type: 'string', enum: ['有', '部分', '沒有'] } })) })),
    issues: array(object({ deck, kind: { type: 'string', enum: [...ISSUE_KINDS] }, lines, rubric: { type: 'string' }, note: { type: 'string' } })),
    unsure: { type: 'string' },
  });
}

export interface JudgeContext { rows: readonly RubricRow[]; codes: readonly string[]; decks: ReadonlyMap<string, readonly string[]>; pages: number | null }

/** 驗評審交的結果（§5-7）：列號和評分表一樣、一列一筆、每份一格；行號落在那份卡組有字的行；頁數照教材。回傳問題清單。 */
export function validateResult(value: unknown, context: JudgeContext): string[] {
  const problems: string[] = [];
  const result = value as Partial<JudgeResult> | undefined;
  if (!result || typeof result !== 'object' || !Array.isArray(result.rows) || !Array.isArray(result.issues) || !Array.isArray(result.pages)) return ['不是照 schema 的 JSON（要有 pages、rows、issues、unsure）'];
  const lineOk = (deck: string, line: number): boolean => Number.isInteger(line) && line >= 1 && (context.decks.get(deck)?.[line - 1]?.trim() ?? '') !== '';
  const badLines = (deck: string, lines: readonly number[]): number[] => lines.filter(line => !lineOk(deck, line));
  const wanted = judgedRows(context.rows).map(row => row.id);
  const given = result.rows.map(row => row.row);
  const missing = wanted.filter(id => !given.includes(id));
  if (missing.length) problems.push(`少了這幾列：${missing.join('、')}`);
  const extra = given.filter(id => !wanted.includes(id));
  if (extra.length) problems.push(`評分表沒有這幾列（只判必備與加分）：${[...new Set(extra)].join('、')}`);
  const twice = given.filter((id, i) => given.indexOf(id) !== i);
  if (twice.length) problems.push(`這幾列寫了不只一次：${[...new Set(twice)].join('、')}`);
  for (const row of result.rows) {
    const decks = row.decks.map(each => each.deck);
    const lack = context.codes.filter(code => !decks.includes(code));
    if (lack.length || decks.length !== context.codes.length) problems.push(`列 ${row.row}：每份卡組要剛好一格（少了 ${lack.join('、') || '無'}，共寫了 ${String(decks.length)} 格）`);
    for (const cell of row.decks) {
      if (cell.verdict !== '沒有' && !cell.lines.length) problems.push(`列 ${row.row} 的 ${cell.deck}：判「${cell.verdict}」要寫證據的行號`);
      const bad = badLines(cell.deck, cell.lines);
      if (bad.length) problems.push(`列 ${row.row} 的 ${cell.deck}：行號 ${bad.join('、')} 不是卡組裡有字的行`);
    }
  }
  const rubricIds = new Set(context.rows.map(row => row.id));
  result.issues.forEach((issue, i) => {
    const at = `問題第 ${String(i + 1)} 筆（${issue.deck} ${issue.kind}）`;
    if (!issue.lines.length) problems.push(`${at}：要寫行號`);
    const bad = badLines(issue.deck, issue.lines);
    if (bad.length) problems.push(`${at}：行號 ${bad.join('、')} 不是卡組裡有字的行`);
    if (issue.kind === '近義重複' && !twoPrompts(context.decks.get(issue.deck)?.join('\n') ?? '', issue.lines)) problems.push(`${at}：近義重複要剛好寫兩道不同的題的行號（不是目標名稱行、不是同一題）`);
    if ((issue.kind === '跨單元去向') && !rubricIds.has(issue.rubric)) problems.push(`${at}：rubric 要寫評分表的列號`);
    if (issue.kind === '重大錯誤' && issue.rubric && !context.rows.some(row => row.id === issue.rubric && row.kind === '重大錯誤')) problems.push(`${at}：rubric「${issue.rubric}」不是評分表的重大錯誤列`);
  });
  if (context.pages !== null) {
    const pages = new Set(result.pages.map(page => page.page));
    const lack = Array.from({ length: context.pages }, (_, i) => i + 1).filter(page => !pages.has(page));
    if (lack.length) problems.push(`逐頁少了第 ${lack.join('、')} 頁（教材共 ${String(context.pages)} 頁）`);
  }
  return problems;
}

const LOG = (batch: number): string => join('評分', `批${String(batch)}`, '事件.jsonl');
/** 評分的階段（rule-test-d236.md §6-2）：卡組、地圖各一個對話；卡組的結果檔照舊叫 `<區組>.json`。 */
export type Stage = '卡組' | '地圖';
export const resultFile = (folder: Folder, batch: number, judge: string, block: string, stage: Stage = '卡組'): string => join(batchDir(folder, batch), '結果', judge, `${block}${stage === '卡組' ? '' : `-${stage}`}.json`);
const jobOf = (block: Block, judge: Judge, again = false, stage: Stage = '卡組'): string => `${block.name}-${judge.name}${stage === '卡組' ? '' : `-${stage}`}${again ? '-重評' : ''}`;
/** 一批要交的結果：每個區組兩位評審的卡組，有地圖的區組再加地圖。 */
export const stagesOf = (block: Block): Stage[] => block.maps.length ? ['卡組', '地圖'] : ['卡組'];
const rejudgeFile = (folder: Folder, batch: number, judge: string, block: string): string => join(batchDir(folder, batch), '重評', judge, `${block}.json`);

/**
 * 評審重評（F20）：每位評審挑設定的幾個區組，另開對話再評一次，只報兩次的差、不進門檻。挑哪幾個第一次決定、存進 重評.json，之後照這一份。
 */
function rejudgePicks(folder: Folder, batch: number, blocks: readonly Block[]): Record<string, string[]> {
  const count = Math.min(folder.config.rejudge, blocks.length);
  if (count < 1) return {};
  const file = join(batchDir(folder, batch), '重評.json');
  if (existsSync(file)) return JSON.parse(readFileSync(file, 'utf8')) as Record<string, string[]>;
  const picks = Object.fromEntries(folder.config.judges.map(judge => {
    const names = blocks.map(block => block.name);
    for (let i = names.length - 1; i > 0; i--) { const j = randomInt(i + 1); [names[i], names[j]] = [names[j], names[i]]; }
    return [judge.name, names.slice(0, count)];
  }));
  writeOnce(file, JSON.stringify(picks, null, 2) + '\n');
  return picks;
}

interface Task { block: Block; judge: Judge; again: boolean; stage: Stage }
const taskFile = (folder: Folder, batch: number, task: Task): string => task.again ? rejudgeFile(folder, batch, task.judge.name, task.block.name) : resultFile(folder, batch, task.judge.name, task.block.name, task.stage);
const taskKey = (task: Task): string => jobOf(task.block, task.judge, task.again, task.stage);
/** 還沒交的評分：先是每個區組兩位評審（卡組、有地圖的再加地圖），再是重評（只重評卡組）。 */
function pendingTasks(folder: Folder, batch: number, blocks: readonly Block[]): Task[] {
  const picks = rejudgePicks(folder, batch, blocks);
  const tasks: Task[] = [
    ...blocks.flatMap(block => stagesOf(block).flatMap(stage => folder.config.judges.map(judge => ({ block, judge, again: false, stage })))),
    ...folder.config.judges.flatMap(judge => (picks[judge.name] ?? []).map(name => ({ block: blocks.find(block => block.name === name)!, judge, again: true, stage: '卡組' as const }))),
  ];
  return tasks.filter(task => !existsSync(taskFile(folder, batch, task)));
}

/** 重評和第一次的差（評審自己的雜訊）：逐列每份的判定有幾格不同、問題的筆數。兩次都交了才算。 */
export function rejudgeStats(folder: Folder, batch: number): { judge: string; block: string; cells: number; changed: number; issues: [number, number] }[] {
  const file = join(batchDir(folder, batch), '重評.json');
  if (!existsSync(file)) return [];
  const read = (path: string): JudgeResult => JSON.parse(readFileSync(path, 'utf8')) as JudgeResult;
  return Object.entries(JSON.parse(readFileSync(file, 'utf8')) as Record<string, string[]>).flatMap(([judge, names]) => names.flatMap(block => {
    const [first, second] = [resultFile(folder, batch, judge, block), rejudgeFile(folder, batch, judge, block)];
    if (!existsSync(first) || !existsSync(second)) return [];
    const a = read(first), b = read(second);
    const cells = a.rows.flatMap(row => row.decks.map(cell => ({ row: row.row, deck: cell.deck, verdict: cell.verdict })));
    const changed = cells.filter(cell => b.rows.find(row => row.row === cell.row)?.decks.find(each => each.deck === cell.deck)?.verdict !== cell.verdict).length;
    const count = (result: JudgeResult): number => result.issues.filter(issue => issue.kind !== '值得學').length;
    return [{ judge, block, cells: cells.length, changed, issues: [count(a), count(b)] as [number, number] }];
  }));
}

/** 給評審的提示：凍結的評分說明、科目口徑，加這個區組的代號、列號與頁數。 */
export function judgePrompt(folder: Folder, block: Block, rows: readonly RubricRow[], pages: number | null, attached: boolean): string {
  const lesson = folder.config.lessons.find(each => each.code === block.lesson)!;
  const frozen = join(folder.root, '凍結', '範本');
  const subject = join(frozen, '口徑', `${lesson.subjectKey}.md`);
  return [
    readFileSync(join(frozen, '評分說明.md'), 'utf8').trim(),
    ...existsSync(subject) ? [readFileSync(subject, 'utf8').trim()] : [],
    [
      '## 這一次',
      '',
      `- 卡組：${block.codes.map(code => `卡組/${code}.md`).join('、')}（共 ${String(block.codes.length)} 份）`,
      `- 要逐列判的列（${String(judgedRows(rows).length)} 列）：${judgedRows(rows).map(row => row.id).join('、')}`,
      `- 教材：${attached ? '附件（資料夾裡也有一份 教材.pdf）' : '資料夾裡的 教材.pdf'}${pages === null ? '' : `，共 ${String(pages)} 頁`}`,
    ].join('\n'),
  ].join('\n\n');
}

export interface JudgeOptions { adapters?: Partial<Record<'claude' | 'codex', Adapter>>; log?: (line: string) => void; temp?: string; batch?: number }

/** 地圖評分的提示（rule-test-d236.md §5-3）：凍結的地圖評分說明，加這個區組有地圖的代號與列號。 */
function mapPrompt(folder: Folder, block: Block, rows: readonly RubricRow[], attached: boolean): string {
  return [
    readFileSync(join(folder.root, '凍結', '範本', '地圖評分說明.md'), 'utf8').trim(),
    [
      '## 這一次',
      '',
      `- 地圖：${block.maps.map(code => `地圖/${code}.md`).join('、')}（共 ${String(block.maps.length)} 份）`,
      `- 要逐列判的列（${String(judgedRows(rows).length)} 列）：${judgedRows(rows).map(row => row.id).join('、')}`,
      `- 教材：${attached ? '附件（資料夾裡也有一份 教材.pdf）' : '資料夾裡的 教材.pdf'}`,
    ].join('\n'),
  ].join('\n\n');
}

/** 跑一位評審評一個區組的一個階段：驗結果，不合就在同一個對話補正。 */
async function runOne(folder: Folder, batch: number, task: Task, adapter: Adapter, temp: string): Promise<AskOutcome> {
  const { block, judge } = task;
  const lesson = folder.config.lessons.find(each => each.code === block.lesson)!;
  const rows = parseRubric(readFileSync(rubricOf(folder, lesson), 'utf8'), new Set(readFrozenSnapshot(folder, lesson.code)?.targets.map(t => t.id) ?? []));
  const pdf = readFileSync(materialOf(folder, lesson));
  const lines = (dir: string, codes: readonly string[]): Map<string, string[]> => new Map(codes.map(code => [code, readFileSync(join(batchDir(folder, batch), dir, block.lesson, `${code}.md`), 'utf8').split('\n')]));
  const cwd = mkdtempSync(join(temp, 'rule-test-judge-'));
  const common = { folder, log: LOG(batch), key: taskKey(task), who: judge, adapter, pdf, cwd, records: join(batchDir(folder, batch), '紀錄'), save: (value: unknown) => { writeOnce(taskFile(folder, batch, task), JSON.stringify(value, null, 2) + '\n'); } };
  try {
    if (task.stage === '地圖') {
      copyDir(mapBlockDir(folder, batch, block.name), cwd);
      const maps = lines('地圖', block.maps);
      return await askJson({ ...common, text: mapPrompt(folder, block, rows, judge.kind === 'claude'), schema: mapSchema(block.maps), validate: value => validateMap(value, { rows, codes: block.maps, maps }) });
    }
    copyDir(join(batchDir(folder, batch), '區組', block.name), cwd);
    const pages = countPdfPages(pdf);
    const decks = lines('卡組', block.codes);
    return await askJson({ ...common, text: judgePrompt(folder, block, rows, pages, judge.kind === 'claude'), schema: judgeSchema(block.codes), validate: value => validateResult(value, { rows, codes: block.codes, decks, pages }) });
  } finally { rmSync(cwd, { recursive: true, force: true }); }
}

/** 一批的每個區組、每個階段兩位都交了：每個結果檔的雜湊寫進 鎖定.md（§5-7；rule-test-d236.md §6-2 列全部階段）。回傳有沒有鎖定。 */
function lockBatch(folder: Folder, batch: number, blocks: readonly Block[]): boolean {
  const file = join(batchDir(folder, batch), '鎖定.md');
  if (existsSync(file)) return true;
  const files = blocks.flatMap(block => stagesOf(block).flatMap(stage => folder.config.judges.map(judge => ({ block, judge, stage, path: resultFile(folder, batch, judge.name, block.name, stage) }))));
  if (!files.every(each => existsSync(each.path))) return false;
  const time = new Date().toISOString();
  writeOnce(file, [`# 批 ${String(batch)} 鎖定`, '', '| 課 | 區組 | 評審 | 結果檔 | sha256 | 鎖定（UTC） |', '|---|---|---|---|---|---|',
    ...files.map(each => `| ${each.block.lesson} | ${each.block.name} | ${each.judge.name} | ${relative(batchDir(folder, batch), each.path).split(sep).join('/')} | ${sha256File(each.path)} | ${time} |`), ''].join('\n'));
  return true;
}

/** 跑一批還沒評完的區組（兩位評審）。 */
export async function runJudges(folder: Folder, options: JudgeOptions = {}): Promise<void> {
  const { log = console.log, temp = tmpdir() } = options;
  verifyLock(folder);
  const numbers = batchNumbers(folder);
  const batch = options.batch ?? numbers.at(-1) ?? 0;
  const blocks = readBlocks(folder, batch);
  const adapters: Record<string, Adapter | undefined> = { claude: options.adapters?.claude ?? claudeAdapter(), codex: options.adapters?.codex ?? codexAdapter() };
  const release = acquireLock(folder, 'judge', LOG(batch));
  const todo = pendingTasks(folder, batch, blocks).filter(task => jobState(readEvents(folder, LOG(batch)), taskKey(task)).status !== 'failed');
  let stopped: string | null = null;
  try {
    const worker = async (): Promise<void> => {
      for (let next = todo.shift(); next && !stopped; next = todo.shift()) {
        const key = taskKey(next);
        log(`評分 ${key}`);
        const outcome = await runOne(folder, batch, next, adapters[next.judge.kind]!, temp);
        log(`${key}：${outcome}`);
        if (outcome === 'quota' || outcome === 'fatal') {
          stopped = outcome === 'quota' ? '額度用完' : `${key} 碰到重試也沒用的錯誤`;
          appendEvent(folder, { type: 'stop', detail: { reason: stopped } }, LOG(batch));
        }
      }
    };
    await Promise.all(Array.from({ length: folder.config.concurrency }, worker));
  } finally { release(); }
  if (lockBatch(folder, batch, blocks)) log(`批 ${String(batch)} 兩位評審都交齊了，已鎖定（鎖定.md）。`);
}

/** `npm run rule-test -- judge <測試資料夾> [--confirmed] [--foreground] [--retry]` */
export async function judge(): Promise<void> {
  const [dir, ...flags] = process.argv.slice(3);
  if (!dir) throw Error('用法：npm run rule-test -- judge <測試資料夾> [--confirmed] [--foreground] [--retry]');
  const folder = openFolder(cliPath(dir, 'rule-test'));
  if (flags.includes('--run')) { await runJudges(folder); return; }
  verifyLock(folder);
  const numbers = batchNumbers(folder);
  if (!numbers.length) throw Error('還沒匿名（先跑 blind）');
  const batch = numbers.at(-1)!, retry = flags.includes('--retry');
  const events = readEvents(folder, LOG(batch));
  const keys = pendingTasks(folder, batch, readBlocks(folder, batch)).map(taskKey);
  const failed = keys.filter(key => jobState(events, key).status === 'failed');
  const todo = retry ? keys : keys.filter(key => !failed.includes(key));
  // 放棄的不重開就鎖不了這一批（兩位都要交）。
  if (failed.length && !retry) console.log(`放棄的 ${String(failed.length)} 個沒算進去，這一批要它們交了才能鎖定（原因看 評分/批${String(batch)}/事件.jsonl 與 紀錄/；決定再試就加 --retry）：${failed.join('、')}\n`);
  if (!flags.includes('--confirmed')) {
    console.log(todo.length ? `批 ${String(batch)}：要開 ${String(todo.length)} 個評審對話（${folder.config.judges.map(each => `${each.name} ${each.model} ${each.effort}`).join('、')}）：${todo.join('、')}\n\n同意用量後加 --confirmed 開跑。` : failed.length ? '' : `批 ${String(batch)} 都評完了。`);
    return;
  }
  if (retry && failed.length) console.log(`重開放棄的：${reopenFailed(folder, failed, LOG(batch)).join('、')}`);
  if (!todo.length) return;
  if (flags.includes('--foreground')) { await runJudges(folder); return; }
  const pid = detach(folder, 'judge', join('評分', `批${String(batch)}`, '執行.log'));
  console.log(`背景開始評分（行程 ${String(pid)}）；進度用 status 看。`);
}
