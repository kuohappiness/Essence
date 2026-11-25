// 比較測試工具：judge（任務說明 tasks/rule-test-tool.md §5-7）。每個區組、每位評審一個新對話，只拿到那個區組資料夾的複本；
// 交 JSON（schema 只用兩家 CLI 都收的寫法），工具驗列號、行號、頁數，格式不合就在同一個對話補正；一批全部交齊就鎖定（雜湊寫進 鎖定.md）。
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { claudeAdapter, codexAdapter, type Adapter } from './adapters.ts';
import { askJson, type AskOutcome } from './ask.ts';
import { batchDir, batchNumbers, readBlocks, type Block } from './blind.ts';
import { cliPath } from '../cli-path.ts';
import type { Judge } from './config.ts';
import { materialOf, openFolder, rubricOf, sha256File, writeOnce, type Folder } from './folder.ts';
import { readFrozenSnapshot, verifyLock } from './freeze.ts';
import { acquireLock, detach } from './generate.ts';
import { appendEvent, jobState, readEvents } from './jobs.ts';
import { countPdfPages } from './probe.ts';
import { judgedRows, parseRubric, type RubricRow } from './rubric.ts';

const ISSUE_KINDS = ['重大錯誤', '洩漏', '多解', '一題多事', '池裡判準不同', '其他品質', '近義重複', '跨單元去向', '值得學'] as const;
type IssueKind = (typeof ISSUE_KINDS)[number];
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
    if (issue.kind === '近義重複' && issue.lines.length !== 2) problems.push(`${at}：近義重複要剛好寫兩題的行號`);
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
export const resultFile = (folder: Folder, batch: number, judge: string, block: string): string => join(batchDir(folder, batch), '結果', judge, `${block}.json`);
const jobOf = (block: Block, judge: Judge): string => `${block.name}-${judge.name}`;

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

/** 跑一位評審評一個區組：驗結果，不合就在同一個對話補正。 */
async function runOne(folder: Folder, batch: number, block: Block, judge: Judge, adapter: Adapter, temp: string): Promise<AskOutcome> {
  const lesson = folder.config.lessons.find(each => each.code === block.lesson)!;
  const rows = parseRubric(readFileSync(rubricOf(folder, lesson), 'utf8'), new Set(readFrozenSnapshot(folder, lesson.code)?.targets.map(t => t.id) ?? []));
  const pdf = readFileSync(materialOf(folder, lesson));
  const pages = countPdfPages(pdf);
  const decks = new Map(block.codes.map(code => [code, readFileSync(join(batchDir(folder, batch), '卡組', block.lesson, `${code}.md`), 'utf8').split('\n')]));
  const cwd = mkdtempSync(join(temp, 'rule-test-judge-'));
  cpSync(join(batchDir(folder, batch), '區組', block.name), cwd, { recursive: true });
  try {
    return await askJson({
      folder, log: LOG(batch), key: jobOf(block, judge), who: judge, adapter, text: judgePrompt(folder, block, rows, pages, judge.kind === 'claude'), pdf, cwd,
      schema: judgeSchema(block.codes), records: join(batchDir(folder, batch), '紀錄'),
      validate: value => validateResult(value, { rows, codes: block.codes, decks, pages }),
      save: value => { writeOnce(resultFile(folder, batch, judge.name, block.name), JSON.stringify(value, null, 2) + '\n'); },
    });
  } finally { rmSync(cwd, { recursive: true, force: true }); }
}

/** 一批的每個區組兩位都交了：每個結果檔的雜湊寫進 鎖定.md（§5-7）。回傳有沒有鎖定。 */
function lockBatch(folder: Folder, batch: number, blocks: readonly Block[]): boolean {
  const file = join(batchDir(folder, batch), '鎖定.md');
  if (existsSync(file)) return true;
  const files = blocks.flatMap(block => folder.config.judges.map(judge => ({ block, judge, path: resultFile(folder, batch, judge.name, block.name) })));
  if (!files.every(each => existsSync(each.path))) return false;
  const time = new Date().toISOString();
  writeOnce(file, [`# 批 ${String(batch)} 鎖定`, '', '| 課 | 區組 | 評審 | 結果檔 | sha256 | 鎖定（UTC） |', '|---|---|---|---|---|---|',
    ...files.map(each => `| ${each.block.lesson} | ${each.block.name} | ${each.judge.name} | 結果/${each.judge.name}/${each.block.name}.json | ${sha256File(each.path)} | ${time} |`), ''].join('\n'));
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
  const todo = blocks.flatMap(block => folder.config.judges.map(judge => ({ block, judge })))
    .filter(({ block, judge }) => !existsSync(resultFile(folder, batch, judge.name, block.name)) && jobState(readEvents(folder, LOG(batch)), jobOf(block, judge)).status !== 'failed');
  let stopped: string | null = null;
  try {
    const worker = async (): Promise<void> => {
      for (let next = todo.shift(); next && !stopped; next = todo.shift()) {
        log(`評分 ${jobOf(next.block, next.judge)}`);
        const outcome = await runOne(folder, batch, next.block, next.judge, adapters[next.judge.kind]!, temp);
        log(`${jobOf(next.block, next.judge)}：${outcome}`);
        if (outcome === 'quota' || outcome === 'fatal') {
          stopped = outcome === 'quota' ? '額度用完' : `${jobOf(next.block, next.judge)} 碰到重試也沒用的錯誤`;
          appendEvent(folder, { type: 'stop', detail: { reason: stopped } }, LOG(batch));
        }
      }
    };
    await Promise.all(Array.from({ length: folder.config.concurrency }, worker));
  } finally { release(); }
  if (lockBatch(folder, batch, blocks)) log(`批 ${String(batch)} 兩位評審都交齊了，已鎖定（鎖定.md）。`);
}

/** `npm run rule-test -- judge <測試資料夾> [--confirmed] [--foreground]` */
export async function judge(): Promise<void> {
  const [dir, ...flags] = process.argv.slice(3);
  if (!dir) throw Error('用法：npm run rule-test -- judge <測試資料夾> [--confirmed] [--foreground]');
  const folder = openFolder(cliPath(dir, 'rule-test'));
  if (flags.includes('--run')) { await runJudges(folder); return; }
  verifyLock(folder);
  const numbers = batchNumbers(folder);
  if (!numbers.length) throw Error('還沒匿名（先跑 blind）');
  const batch = numbers.at(-1)!;
  const todo = readBlocks(folder, batch).flatMap(block => folder.config.judges.filter(each => !existsSync(resultFile(folder, batch, each.name, block.name))).map(each => `${block.name}-${each.name}`));
  if (!flags.includes('--confirmed')) {
    console.log(todo.length ? `批 ${String(batch)}：要開 ${String(todo.length)} 個評審對話（${folder.config.judges.map(each => `${each.name} ${each.model} ${each.effort}`).join('、')}）：${todo.join('、')}\n\n同意用量後加 --confirmed 開跑。` : `批 ${String(batch)} 都評完了。`);
    return;
  }
  if (flags.includes('--foreground')) { await runJudges(folder); return; }
  const pid = detach(folder, 'judge', join('評分', `批${String(batch)}`, '執行.log'));
  console.log(`背景開始評分（行程 ${String(pid)}）；進度用 status 看。`);
}
