// 比較測試工具：disputes（任務說明 tasks/rule-test-tool.md §5-8）。一批鎖定後合併兩位評審；要裁定的只有兩種：
// 只有一位記的重大錯誤（每一筆一個新的隔離對話：看得到教材、評分表、已有目標與那一份卡組，看不到組別，照定義重判、寫理由），
// 與兩位評審的「拿不準」（彙成一個對話，分出教學選擇與照口徑就能判的）。結果寫進 評分/批N/裁定.md；教學選擇由使用者答，
// 操作的 Claude 照使用者的話填。解開前做；原評分不改，解開時照裁定另算。
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { claudeAdapter, codexAdapter, type Adapter } from './adapters.ts';
import { askJson } from './ask.ts';
import { batchDir, batchNumbers, readBlocks, type Block } from './blind.ts';
import { cliPath } from '../cli-path.ts';
import { copyDir, materialOf, openFolder, rubricOf, sha256File, writeOnce, type Folder } from './folder.ts';
import { verifyLock } from './freeze.ts';
import { acquireLock, detach } from './generate.ts';
import { resultFile, type JudgeResult } from './judge.ts';
import { jobState, readEvents } from './jobs.ts';
import { QUALITY_KINDS, type QualityKind } from './levels.ts';
import { mergeDeck, type MergedDeck } from './merge.ts';
import { countPdfPages } from './probe.ts';


interface MergedEntry { block: Block; code: string; deck: string; merged: MergedDeck }
interface BatchMerge { entries: MergedEntry[]; results: Map<string, Map<string, JudgeResult>> }

/** 一批鎖定了才合併：鎖定.md 記的每個結果檔，雜湊都要對得上（§5-7 鎖定、§5-9）。 */
export function mergeBatch(folder: Folder, n: number): BatchMerge {
  const dir = batchDir(folder, n);
  const lock = join(dir, '鎖定.md');
  if (!existsSync(lock)) throw Error(`批 ${String(n)} 還沒鎖定（兩位評審都交齊才鎖定）`);
  for (const line of readFileSync(lock, 'utf8').split('\n')) {
    const cells = line.split('|').map(cell => cell.trim());
    if (!/^[0-9a-f]{64}$/.test(cells[5] ?? '')) continue;
    const path = join(dir, cells[4]);
    if (!existsSync(path) || sha256File(path) !== cells[5]) throw Error(`批 ${String(n)} 鎖定之後，${cells[4]} 改過或不見了`);
  }
  const results = new Map<string, Map<string, JudgeResult>>();
  const entries: MergedEntry[] = [];
  for (const block of readBlocks(folder, n)) {
    const mine = new Map(folder.config.judges.map(judge => [judge.name, JSON.parse(readFileSync(resultFile(folder, n, judge.name, block.name), 'utf8')) as JudgeResult]));
    results.set(block.name, mine);
    for (const code of block.codes) {
      const deck = readFileSync(join(dir, '卡組', block.lesson, `${code}.md`), 'utf8');
      entries.push({ block, code, deck, merged: mergeDeck(code, deck, mine) });
    }
  }
  return { entries, results };
}

export interface MajorDispute { id: string; lesson: string; block: string; code: string; at: string; lines: number[]; rubric: string; judge: string; note: string }
interface UnsureNote { id: string; lesson: string; block: string; judge: string; text: string }

/** 要裁定的：只有一位記的重大錯誤（M1…）、評審寫了的拿不準（U1…）。 */
export function collectDisputes(merge: BatchMerge): { majors: MajorDispute[]; unsure: UnsureNote[] } {
  const majors = merge.entries.flatMap(entry => entry.merged.issues.filter(issue => issue.kind === '重大錯誤' && issue.judges.length === 1)
    .map(issue => ({ lesson: entry.block.lesson, block: entry.block.name, code: entry.code, at: issue.at.join('＋'), lines: issue.lines, rubric: issue.rubric, judge: issue.judges[0], note: issue.notes.join('／') })))
    .map((each, i) => ({ id: `M${String(i + 1)}`, ...each }));
  const unsure = [...merge.results].flatMap(([block, results]) => [...results].filter(([, result]) => result.unsure.trim())
    .map(([judge, result]) => ({ lesson: merge.entries.find(entry => entry.block.name === block)!.block.lesson, block, judge, text: result.unsure.trim() })))
    .map((each, i) => ({ id: `U${String(i + 1)}`, ...each }));
  return { majors, unsure };
}

const LOG = (n: number): string => join('評分', `批${String(n)}`, '裁定', '事件.jsonl');
const rulingFile = (folder: Folder, n: number, id: string): string => join(batchDir(folder, n), '裁定', `${id}.json`);
const object = (properties: Record<string, unknown>): Record<string, unknown> => ({ type: 'object', additionalProperties: false, required: Object.keys(properties), properties });

interface MajorRuling { verdict: '成立' | '不成立'; quality: '' | QualityKind; reason: string }
interface UnsureRuling { items: { notes: string[]; kind: '教學選擇' | '照口徑'; question: string; answer: string }[] }

const MAJOR_SCHEMA = object({ verdict: { type: 'string', enum: ['成立', '不成立'] }, quality: { type: 'string', enum: ['', ...QUALITY_KINDS] }, reason: { type: 'string' } });
const unsureSchema = (ids: readonly string[]): Record<string, unknown> => object({
  items: { type: 'array', items: object({ notes: { type: 'array', items: { type: 'string', enum: [...ids] } }, kind: { type: 'string', enum: ['教學選擇', '照口徑'] }, question: { type: 'string' }, answer: { type: 'string' } }) },
});

function validateMajor(value: unknown): string[] {
  const ruling = value as Partial<MajorRuling> | null;
  if (!ruling || typeof ruling !== 'object' || !['成立', '不成立'].includes(ruling.verdict ?? '')) return ['verdict 要是「成立」或「不成立」'];
  const problems: string[] = [];
  if (ruling.verdict === '成立' && ruling.quality) problems.push('成立時 quality 寫空字串');
  if (!ruling.reason?.trim()) problems.push('reason 要寫理由');
  return problems;
}

function validateUnsure(value: unknown, ids: readonly string[]): string[] {
  const ruling = value as Partial<UnsureRuling> | null;
  if (!ruling || typeof ruling !== 'object' || !Array.isArray(ruling.items)) return ['不是照 schema 的 JSON（要有 items）'];
  const problems: string[] = [];
  const given = ruling.items.flatMap(item => item.notes);
  const lack = ids.filter(id => !given.includes(id));
  if (lack.length) problems.push(`這幾筆沒有放進任何一項：${lack.join('、')}`);
  const twice = given.filter((id, i) => given.indexOf(id) !== i);
  if (twice.length) problems.push(`這幾筆放進了不只一項：${[...new Set(twice)].join('、')}`);
  ruling.items.forEach((item, i) => {
    if (!item.notes.length) problems.push(`第 ${String(i + 1)} 項沒有寫是哪幾筆`);
    if (item.kind === '教學選擇' && !item.question.trim()) problems.push(`第 ${String(i + 1)} 項是教學選擇，question 要寫給使用者的問題`);
    if (item.kind === '照口徑' && !item.answer.trim()) problems.push(`第 ${String(i + 1)} 項照口徑，answer 要寫怎麼判`);
  });
  return problems;
}

const template = (folder: Folder, name: string): string => readFileSync(join(folder.root, '凍結', '範本', name), 'utf8').trim();
/** 評審拿到的評分說明與那一科的口徑：裁定照同一份定義。 */
function judgingRules(folder: Folder, lessons: readonly string[]): string {
  const keys = new Set(lessons.map(code => folder.config.lessons.find(each => each.code === code)!.subjectKey));
  const subjects = [...keys].map(key => join(folder.root, '凍結', '範本', '口徑', `${key}.md`)).filter(existsSync).map(path => readFileSync(path, 'utf8').trim());
  return ['## 附：評審拿到的評分說明（定義照這一份）', template(folder, '評分說明.md').replace(/^# /m, '### '), ...subjects].join('\n\n');
}

function majorPrompt(folder: Folder, dispute: MajorDispute, pages: number | null, attached: boolean): string {
  return [
    template(folder, '裁定說明.md'),
    ['## 這一筆', '', `- 卡組：卡組/${dispute.code}.md`, `- 位置：${dispute.at}（行號 ${dispute.lines.join('、')}）`,
      `- 評審記的：重大錯誤${dispute.rubric ? `，對到評分表的 ${dispute.rubric}` : '（沒有對到評分表的列）'}；說明：${dispute.note || '（沒寫）'}`,
      `- 教材：${attached ? '附件（資料夾裡也有一份 教材.pdf）' : '資料夾裡的 教材.pdf'}${pages === null ? '' : `，共 ${String(pages)} 頁`}`].join('\n'),
    judgingRules(folder, [dispute.lesson]),
  ].join('\n\n');
}

function unsurePrompt(folder: Folder, notes: readonly UnsureNote[]): string {
  return [
    template(folder, '拿不準說明.md'),
    ['## 這一批的拿不準', '', ...notes.map(note => `- ${note.id}（課 ${note.lesson}）：${note.text.replace(/\s*\n\s*/g, ' ')}`)].join('\n'),
    judgingRules(folder, notes.map(note => note.lesson)),
  ].join('\n\n');
}

const cell = (text: string): string => text.replace(/\|/g, '｜').replace(/\s*\n\s*/g, ' ').trim();
const row = (cells: readonly string[]): string => `| ${cells.map(cell).join(' | ')} |`;

/** 裁定都交了（或放棄了）就寫 裁定.md（只寫一次：之後教學選擇由操作的 Claude 照使用者的話填）。 */
function renderRulings(folder: Folder, n: number, majors: readonly MajorDispute[], unsure: readonly UnsureNote[]): string {
  const read = <T>(id: string): T | null => existsSync(rulingFile(folder, n, id)) ? JSON.parse(readFileSync(rulingFile(folder, n, id), 'utf8')) as T : null;
  const classified = unsure.length ? read<UnsureRuling>('拿不準') : null;
  return [
    `# 批 ${String(n)} 裁定`, '',
    '原評分不改；解開時照這裡另算（§5-8）。空著的格子要填好才能解開（裁定對話失敗的，由操作的 Claude 照評分說明的定義判了填上）。', '',
    '## 只有一位記的重大錯誤', '',
    `裁定寫「成立」（照算重大錯誤）或「不成立」；不成立、但是題目品質的問題時，「改記」寫是哪一種（${QUALITY_KINDS.join('、')}）。`, '',
    ...majors.length ? [
      row(['編號', '課', '區組', '卡組', '位置', '行號', '評分表列', '記的評審', '評審的說明', '裁定', '改記', '理由']), `|${'---|'.repeat(12)}`,
      ...majors.map(each => {
        const ruling = read<MajorRuling>(each.id);
        return row([each.id, each.lesson, each.block, each.code, each.at, each.lines.join('、'), each.rubric, each.judge, each.note, ruling?.verdict ?? '', ruling?.quality ?? '', ruling?.reason ?? '']);
      }),
    ] : ['（沒有）'], '',
    '## 拿不準', '',
    ...unsure.length ? [
      row(['編號', '課', '區組', '評審', '原文']), `|${'---|'.repeat(5)}`, ...unsure.map(each => row([each.id, each.lesson, each.block, each.judge, each.text])), '',
      '教學選擇由使用者答，寫在「使用者的選擇」：照原樣、拿掉 <列>、<列> 改加分、<列> 改必備（好幾個用「、」隔開；列是那幾筆的課的評分表列號）。照口徑的不用答。', '',
      row(['編號', '來源', '分類', '問題', '照口徑的判法', '使用者的選擇']), `|${'---|'.repeat(6)}`,
      ...classified ? classified.items.map((item, i) => row([`C${String(i + 1)}`, item.notes.join('、'), item.kind, item.question, item.answer, '']))
        : [row(['C1', unsure.map(each => each.id).join('、'), '', '（分類對話失敗：由操作的 Claude 分類後填）', '', ''])],
    ] : ['（沒有）'], '',
  ].join('\n');
}

export interface DisputeOptions { adapters?: Partial<Record<'claude' | 'codex', Adapter>>; log?: (line: string) => void; temp?: string; batch?: number }

/** 跑一批的裁定（只開還沒做完的對話）；都做完或放棄了就寫 裁定.md。 */
export async function runDisputes(folder: Folder, options: DisputeOptions = {}): Promise<void> {
  const { log = console.log, temp = tmpdir() } = options;
  verifyLock(folder);
  const n = options.batch ?? batchNumbers(folder).at(-1) ?? 0;
  const merge = mergeBatch(folder, n);
  const { majors, unsure } = collectDisputes(merge);
  const who = folder.config.adjudicator;
  const adapter = (who.kind === 'claude' ? options.adapters?.claude ?? claudeAdapter() : options.adapters?.codex ?? codexAdapter());
  const dir = batchDir(folder, n);
  const finished = (id: string): boolean => existsSync(rulingFile(folder, n, id)) || jobState(readEvents(folder, LOG(n)), id).status === 'failed';
  const release = acquireLock(folder, 'disputes', LOG(n));
  try {
    for (const dispute of majors.filter(each => !finished(each.id))) {
      const lesson = folder.config.lessons.find(each => each.code === dispute.lesson)!;
      const pdf = readFileSync(materialOf(folder, lesson));
      const cwd = mkdtempSync(join(temp, 'rule-test-ruling-'));
      try {
        const block = join(dir, '區組', dispute.block);
        for (const name of ['評分表.md', '教材.pdf', '已有目標.json']) copyFileSync(join(block, name), join(cwd, name));
        mkdirSync(join(cwd, '卡組'));
        copyFileSync(join(block, '卡組', `${dispute.code}.md`), join(cwd, '卡組', `${dispute.code}.md`));
        log(`裁定 ${dispute.id}（${dispute.block} ${dispute.code} ${dispute.at}）`);
        const outcome = await askJson({
          folder, log: LOG(n), key: dispute.id, who, adapter, text: majorPrompt(folder, dispute, countPdfPages(pdf), who.kind === 'claude'), pdf, cwd,
          schema: MAJOR_SCHEMA, validate: validateMajor, records: join(dir, '裁定', '紀錄'),
          save: value => { writeOnce(rulingFile(folder, n, dispute.id), JSON.stringify(value, null, 2) + '\n'); },
        });
        log(`${dispute.id}：${outcome}`);
        if (outcome === 'quota' || outcome === 'fatal') return;
      } finally { rmSync(cwd, { recursive: true, force: true }); }
    }
    if (unsure.length && !finished('拿不準')) {
      const cwd = mkdtempSync(join(temp, 'rule-test-unsure-'));
      try {
        for (const lesson of new Set(unsure.map(each => each.lesson))) {
          mkdirSync(join(cwd, '評分表'), { recursive: true });
          copyFileSync(rubricOf(folder, folder.config.lessons.find(each => each.code === lesson)!), join(cwd, '評分表', `${lesson}.md`));
        }
        for (const block of new Set(unsure.map(each => each.block))) copyDir(join(dir, '區組', block, '卡組'), join(cwd, '卡組', unsure.find(each => each.block === block)!.lesson));
        const ids = unsure.map(each => each.id);
        log(`分類拿不準（${String(ids.length)} 筆）`);
        const outcome = await askJson({
          folder, log: LOG(n), key: '拿不準', who, adapter, text: unsurePrompt(folder, unsure), pdf: null, cwd,
          schema: unsureSchema(ids), validate: value => validateUnsure(value, ids), records: join(dir, '裁定', '紀錄'),
          save: value => { writeOnce(rulingFile(folder, n, '拿不準'), JSON.stringify(value, null, 2) + '\n'); },
        });
        log(`拿不準：${outcome}`);
        if (outcome === 'quota' || outcome === 'fatal') return;
      } finally { rmSync(cwd, { recursive: true, force: true }); }
    }
  } finally { release(); }
  // 只寫一次：之後由操作的 Claude 照使用者的話填教學選擇，重跑不蓋掉。
  if (!existsSync(join(dir, '裁定.md')) && [...majors.map(each => each.id), ...unsure.length ? ['拿不準'] : []].every(finished)) {
    writeOnce(join(dir, '裁定.md'), renderRulings(folder, n, majors, unsure));
    log(`批 ${String(n)} 的裁定寫在 裁定.md；${unsure.length ? '教學選擇要使用者答，填好再 unblind。' : '可以 unblind 了。'}`);
  }
}

/** `npm run rule-test -- disputes <測試資料夾> [--confirmed] [--foreground]` */
export async function disputes(): Promise<void> {
  const [dir, ...flags] = process.argv.slice(3);
  if (!dir) throw Error('用法：npm run rule-test -- disputes <測試資料夾> [--confirmed] [--foreground]');
  const folder = openFolder(cliPath(dir, 'rule-test'));
  if (flags.includes('--run')) { await runDisputes(folder); return; }
  verifyLock(folder);
  const n = batchNumbers(folder).at(-1);
  if (n === undefined) throw Error('還沒匿名（先跑 blind）');
  const { majors, unsure } = collectDisputes(mergeBatch(folder, n));
  const chats = majors.length + (unsure.length ? 1 : 0);
  if (!chats) { await runDisputes(folder, { batch: n }); return; }
  const who = folder.config.adjudicator;
  if (!flags.includes('--confirmed')) {
    console.log(`批 ${String(n)}：只有一位記的重大錯誤 ${String(majors.length)} 筆、拿不準 ${String(unsure.length)} 筆；要開 ${String(chats)} 個裁定對話（${who.name} ${who.model} ${who.effort}）。\n\n同意用量後加 --confirmed 開跑。`);
    return;
  }
  if (flags.includes('--foreground')) { await runDisputes(folder, { batch: n }); return; }
  const pid = detach(folder, 'disputes', join('評分', `批${String(n)}`, '裁定', '執行.log'));
  console.log(`背景開始裁定（行程 ${String(pid)}）；進度用 status 看。`);
}
