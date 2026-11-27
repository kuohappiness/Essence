// 比較測試工具：rubric（任務說明 tasks/rule-test-tool.md §5-2）。一課的評分表用三個對話做：寫的一方只看教材與已有目標（不看任何製卡規則）、
// 另一位逐列核對、寫的一方接著原本的對話逐條回應並交改好的表。草稿與每個對話送的提示都留在 評分表/<課>/；
// 操作的 Claude 看過（必要時問使用者）才用 --accept 存進課庫，blind 時鎖住雜湊（之後改要存成新版）。
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { claudeAdapter, codexAdapter, type Adapter } from './adapters.ts';
import { askJson } from './ask.ts';
import { cliPath } from '../cli-path.ts';
import type { Judge, LessonConfig } from './config.ts';
import { materialOf, openFolder, rubricOf, writeOnce, type Folder } from './folder.ts';
import { readFrozenSnapshot, verifyLock } from './freeze.ts';
import { acquireLock, detach } from './generate.ts';
import { countPdfPages } from './probe.ts';
import { parseRubric } from './rubric.ts';

const MARK = '## 改好的評分表';
const dirOf = (folder: Folder, lesson: string): string => join(folder.root, '評分表', lesson);
const LOG = (lesson: string): string => join('評分表', lesson, '事件.jsonl');

/** 回覆裡表頭是「| 列 |」的那一張表（到第一個不是表格的行為止）。 */
function tableOf(reply: string): string | null {
  const lines = reply.replace(/\r\n?/g, '\n').split('\n');
  const start = lines.findIndex(line => /^\|\s*列\s*\|/.test(line.trim()));
  if (start < 0) return null;
  const end = lines.findIndex((line, i) => i > start && !line.trim().startsWith('|'));
  return lines.slice(start, end < 0 ? undefined : end).map(line => line.trim()).join('\n') + '\n';
}
function tableProblems(text: string | null, known: ReadonlySet<string>): string[] {
  if (!text) return ['找不到表頭是「| 列 | 類別 | 要考的知識或判準 | 頁碼 | 可以接受的等價做法 | 跨單元 |」的表'];
  try { parseRubric(text, known); return []; } catch (error) { return (error instanceof Error ? error.message : String(error)).split('\n').slice(1).map(line => line.replace(/^- /, '')); }
}

function lessonPart(folder: Folder, lesson: LessonConfig, pages: number | null, attached: boolean): string {
  const { form } = lesson;
  return ['## 這一課', '', `- 科目、年級學期、單元：${form.subject}、${form.term}、${form.unit}`, ...form.material ? [`- 教材說明：${form.material}`] : [],
    `- 教材：${attached ? '附件（資料夾裡也有一份 教材.pdf）' : '資料夾裡的 教材.pdf'}${pages === null ? '' : `，共 ${String(pages)} 頁`}`].join('\n');
}
/** 評分表的寫法與核對照凍結的那一份（D-236 §11：全部範本進鎖）。 */
const template = (folder: Folder, name: string): string => readFileSync(join(folder.root, '凍結', '範本', name), 'utf8').trim();

export interface RubricOptions { adapters?: Partial<Record<'claude' | 'codex', Adapter>>; log?: (line: string) => void; temp?: string }

/** 跑還沒做完的對話（寫、核對、回應）；都做完就把改好的表存成 評分表/<課>/評分表.md（草稿）。 */
export async function runRubric(folder: Folder, code: string, options: RubricOptions = {}): Promise<void> {
  const { log = console.log, temp = tmpdir() } = options;
  verifyLock(folder);
  const lesson = folder.config.lessons.find(each => each.code === code);
  if (!lesson) throw Error(`沒有課「${code}」`);
  if (existsSync(rubricOf(folder, lesson))) throw Error(`課庫已經有這一課的評分表（${rubricOf(folder, lesson)}）；要改就存成新版、開新的測試資料夾（§5-2）`);
  const snapshot = readFrozenSnapshot(folder, code);
  const known = new Set(snapshot?.targets.map(target => target.id) ?? []);
  const pdf = readFileSync(materialOf(folder, lesson));
  const pages = countPdfPages(pdf);
  const dir = dirOf(folder, code);
  mkdirSync(dir, { recursive: true });
  const adapterOf = (who: Judge): Adapter => who.kind === 'claude' ? options.adapters?.claude ?? claudeAdapter() : options.adapters?.codex ?? codexAdapter();
  const { writer, checker } = folder.config.rubric;
  // 寫的一方的資料夾固定（同一個測試資料夾、同一課就是同一個）：Claude 接著同一個對話要在同一個資料夾。
  const writerCwd = join(temp, `rule-test-rubric-${createHash('sha256').update(`${folder.root}\n${code}`).digest('hex').slice(0, 16)}`);
  const prepare = (cwd: string, table: string | null): void => {
    mkdirSync(cwd, { recursive: true });
    writeFileSync(join(cwd, '教材.pdf'), pdf);
    writeFileSync(join(cwd, '已有目標.json'), JSON.stringify(snapshot?.pool ?? [], null, 2) + '\n', 'utf8');
    if (table) writeFileSync(join(cwd, '評分表.md'), table, 'utf8');
  };
  const file = (name: string): string => join(dir, name);
  const ask = (key: string, who: Judge, text: string, cwd: string, validate: (value: unknown) => string[], save: (value: string, session: string | null) => void, resume: string | null = null): ReturnType<typeof askJson> => {
    writeFileSync(file(`提示-${key}.md`), text, 'utf8');
    return askJson({ folder, log: LOG(code), key, who, adapter: adapterOf(who), text, pdf, cwd, schema: null, validate, save: (value, session) => { save(value as string, session); }, records: file('紀錄'), resume });
  };

  const release = acquireLock(folder, 'rubric', LOG(code));
  try {
    if (!existsSync(file('1-寫.md'))) {
      prepare(writerCwd, null);
      log(`評分表 ${code}：寫（${writer.name} ${writer.model}）`);
      const outcome = await ask('寫', writer, `${template(folder, '評分表寫法.md')}\n\n${lessonPart(folder, lesson, pages, writer.kind === 'claude')}`, writerCwd,
        value => tableProblems(tableOf(value as string), known), (value, session) => { writeOnce(file('寫的對話.json'), JSON.stringify({ session, cwd: writerCwd }) + '\n'); writeOnce(file('1-寫.md'), value); });
      if (outcome !== 'done') { log(`寫：${outcome}`); return; }
    }
    if (!existsSync(file('2-核對.md'))) {
      const cwd = join(temp, `rule-test-rubric-check-${String(process.pid)}-${String(Date.now())}`);
      prepare(cwd, tableOf(readFileSync(file('1-寫.md'), 'utf8')));
      log(`評分表 ${code}：核對（${checker.name} ${checker.model}）`);
      try {
        const outcome = await ask('核對', checker, `${template(folder, '評分表核對.md')}\n\n${lessonPart(folder, lesson, pages, checker.kind === 'claude')}`, cwd,
          value => (value as string).trim() ? [] : ['回覆是空的'], value => { writeOnce(file('2-核對.md'), value); });
        if (outcome !== 'done') { log(`核對：${outcome}`); return; }
      } finally { rmSync(cwd, { recursive: true, force: true }); }
    }
    if (!existsSync(file('3-回應.md'))) {
      const { session } = JSON.parse(readFileSync(file('寫的對話.json'), 'utf8')) as { session: string | null };
      prepare(writerCwd, null);
      const text = [
        '另一位核對了你寫的評分表，意見在下面。逐條回應：寫是哪一條、接受／部分接受／不接受、理由（一兩句，附頁碼）。',
        `回應完，在「${MARK}」這一行底下交整張改好的表（格式和原本一樣；不接受的照原樣留著）。`, '', '## 核對意見', '', readFileSync(file('2-核對.md'), 'utf8').trim(),
        ...session ? [] : ['', '## 你原本寫的評分表', '', readFileSync(file('1-寫.md'), 'utf8').trim()],
      ].join('\n');
      log(`評分表 ${code}：回應（接著寫的對話）`);
      const outcome = await ask('回應', writer, text, writerCwd, value => {
        const reply = value as string;
        const at = reply.indexOf(MARK);
        if (at < 0) return [`找不到「${MARK}」這一行`];
        return [...tableProblems(tableOf(reply.slice(at)), known), ...(/不接受|部分接受|接受/.test(reply.slice(0, at)) ? [] : ['沒有逐條回應（接受／部分接受／不接受）'])];
      }, value => { writeOnce(file('3-回應.md'), value); writeOnce(file('評分表.md'), tableOf(value.slice(value.indexOf(MARK)))!); }, session);
      if (outcome !== 'done') { log(`回應：${outcome}`); return; }
      rmSync(writerCwd, { recursive: true, force: true });
    }
  } finally { release(); }
  log(`評分表 ${code} 的草稿：${file('評分表.md')}（寫、核對、回應在同一個資料夾）。看過、必要時問使用者，再用 rubric ${folder.root} ${code} --accept 存進課庫。`);
}

/** 看過的草稿存進課庫（只寫一次；之後改要存成新版）。 */
export function acceptRubric(folder: Folder, code: string): string {
  const lesson = folder.config.lessons.find(each => each.code === code);
  if (!lesson) throw Error(`沒有課「${code}」`);
  const draft = join(dirOf(folder, code), '評分表.md');
  if (!existsSync(draft)) throw Error(`還沒有草稿（先跑 rubric ${code} --confirmed）`);
  const text = readFileSync(draft, 'utf8');
  parseRubric(text, new Set(readFrozenSnapshot(folder, code)?.targets.map(target => target.id) ?? []));
  if (existsSync(rubricOf(folder, lesson))) throw Error(`課庫已經有這一課的評分表（${rubricOf(folder, lesson)}）`);
  writeOnce(rubricOf(folder, lesson), text);
  return rubricOf(folder, lesson);
}

/** `npm run rule-test -- rubric <測試資料夾> <課> [--confirmed] [--foreground] [--accept]` */
export async function rubric(): Promise<void> {
  const [dir, ...rest] = process.argv.slice(3);
  const flags = rest.filter(each => each.startsWith('--')), [code] = rest.filter(each => !each.startsWith('--'));
  if (!dir || !code) throw Error('用法：npm run rule-test -- rubric <測試資料夾> <課> [--confirmed] [--foreground] [--accept]');
  const folder = openFolder(cliPath(dir, 'rule-test'));
  if (flags.includes('--run')) { await runRubric(folder, code); return; }
  if (flags.includes('--accept')) { console.log(`存進課庫了：${acceptRubric(folder, code)}`); return; }
  verifyLock(folder);
  const { writer, checker } = folder.config.rubric;
  if (!flags.includes('--confirmed')) {
    console.log(`評分表 ${code}：要開 3 個對話（寫：${writer.name} ${writer.model} ${writer.effort}；核對：${checker.name} ${checker.model} ${checker.effort}；回應接著寫的對話）。\n\n同意用量後加 --confirmed 開跑。`);
    return;
  }
  if (flags.includes('--foreground')) { await runRubric(folder, code); return; }
  const pid = detach(folder, 'rubric', join('評分表', code, '執行.log'), [code]);
  console.log(`背景開始做評分表（行程 ${String(pid)}）；做完看 評分表/${code}/評分表.md。`);
}
