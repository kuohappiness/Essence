// 比較測試工具：generate（任務說明 tasks/rule-test-tool.md §5-4）。沒加 --confirmed 只印要開幾個對話與提示的字數；
// 加了先寫手貼的說明，再在背景開一個行程跑自動的生成（行程鎖：同時只有一個），進度看 status。
import { closeSync, existsSync, mkdirSync, mkdtempSync, openSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { claudeAdapter, codexAdapter, type Adapter, type StepResult } from './adapters.ts';
import { cliPath } from '../cli-path.ts';
import { validity } from './deck-cut.ts';
import { materialOf, openFolder, writeOnce, type Folder } from './folder.ts';
import { readFrozenSteps, verifyLock, type FrozenStep } from './freeze.ts';
import { appendEvent, jobState, planJobs, readEvents, type Job } from './jobs.ts';
import { fillReplies } from './prompts.ts';

/** 連續幾份失敗就整個佇列停下（斷路器，§5-4）。 */
const BREAKER = 3;
/**
 * Codex 不收附件（探針 P6）：教材放進對話的資料夾，每個對話的第一步前面加這一句；各組相同（附件說明各組相同，§5-4），記進那一步的事件。
 */
const CODEX_MATERIAL = '（教材是這個資料夾裡的 教材.pdf，先讀完再照下面做。）';

export const rawName = (job: Job, step: FrozenStep): string => `${job.key}${job.steps.length > 1 ? `-${String(step.step)}` : ''}.md`;
const attemptDir = (folder: Folder, job: Job, attempt: number): string => join(folder.root, '生成', '嘗試', `${job.key}-${String(attempt)}`);
const lockFile = (folder: Folder): string => join(folder.root, '生成', '執行中.json');

/** 每一步在自己的對話裡是第幾步：`A.1` 這類變數的名字。 */
function replyName(job: Job, step: FrozenStep): string {
  return `${step.conversation}.${String(job.steps.filter(each => each.conversation === step.conversation && each.step <= step.step).length)}`;
}

/** 一份工作的每一步都交了：存進 原稿/，照有效原稿的定義記完成或無效（無效的照樣留著、自動補一份，§4-2）。 */
function finalize(folder: Folder, job: Job, attempt: number): void {
  const why: string[] = [];
  for (const step of job.steps) {
    const reply = readFileSync(join(attemptDir(folder, job, attempt), `${String(step.step)}.md`), 'utf8');
    writeOnce(join(folder.root, '生成', '原稿', rawName(job, step)), reply);
    const check = validity(reply, step.deck, step.threeSections);
    if (!check.valid) why.push(`${job.steps.length > 1 ? `第 ${String(step.step)} 步` : ''}${check.why ?? ''}`);
  }
  appendEvent(folder, { type: why.length ? 'invalid' : 'done', job: job.key, attempt, ...why.length ? { detail: { why } } : {} });
}

function alive(pid: number): boolean {
  try { process.kill(pid, 0); return true; } catch (error) { return (error as NodeJS.ErrnoException).code === 'EPERM'; }
}

/** 行程鎖：已經有一個 generate、judge、disputes 或 rubric 在跑就停下（N4）；上一次的行程已經不在時，把它跑到一半的工作記成中斷。 */
export function acquireLock(folder: Folder, command: string, log?: string): () => void {
  const file = lockFile(folder);
  if (existsSync(file)) {
    const held = JSON.parse(readFileSync(file, 'utf8')) as { pid: number; command: string; started: string };
    if (held.pid !== process.pid && alive(held.pid)) throw Error(`已經有一個 ${held.command} 在跑（行程 ${String(held.pid)}，${held.started} 開始）；等它結束或確認它不在了再跑`);
    unlinkSync(file);
  }
  mkdirSync(join(folder.root, '生成'), { recursive: true });
  writeFileSync(file, JSON.stringify({ pid: process.pid, command, started: new Date().toISOString() }) + '\n', { flag: 'wx' });
  const events = readEvents(folder, log);
  for (const key of new Set(events.flatMap(event => event.job ?? []))) {
    if (jobState(events, key).status === 'running') appendEvent(folder, { type: 'interrupted', job: key, detail: { why: '上一次的行程已經不在' } }, log);
  }
  return () => { if (existsSync(file)) unlinkSync(file); };
}

export interface QueueOptions {
  adapters?: Partial<Record<'claude' | 'codex', Adapter>>;
  log?: (line: string) => void;
  /** 暫存資料夾放哪裡（測試用）。 */
  temp?: string;
}

/** 跑一份工作的每一步；回這份工作最後的結果種類。 */
async function runJob(folder: Folder, job: Job, adapter: Adapter, temp: string): Promise<StepResult['kind'] | 'done'> {
  const { config } = folder;
  const generator = config.generators.find(each => each.name === job.generator)!;
  const lesson = config.lessons.find(each => each.code === job.lesson)!;
  const attempt = jobState(readEvents(folder), job.key).attempts + 1;
  appendEvent(folder, { type: 'start', job: job.key, attempt });
  const dir = attemptDir(folder, job, attempt);
  mkdirSync(dir, { recursive: true });
  const cwd = mkdtempSync(join(temp, 'rule-test-gen-'));
  const pdf = readFileSync(materialOf(folder, lesson));
  const codex = job.kind === 'codex';
  if (codex) writeFileSync(join(cwd, '教材.pdf'), pdf);
  const sessions = new Map<string, string>(), replies = new Map<string, string>();
  try {
    for (const step of job.steps) {
      const resume = sessions.get(step.conversation) ?? null;
      const prompt = fillReplies(readFileSync(join(folder.root, '凍結', '提示', step.file), 'utf8'), replies);
      const note = codex && resume === null ? CODEX_MATERIAL : null;
      const text = note ? `${note}\n\n${prompt}` : prompt;
      const result = await adapter({
        text, pdf: resume === null && !codex ? pdf : null, resume, model: generator.model, effort: generator.effort, systemPrompt: config.systemPrompt, cwd,
        timeoutMs: config.timeoutMinutes * 60_000,
        record: (stdout, stderr) => { writeFileSync(join(dir, `${String(step.step)}.jsonl`), stdout + (stderr ? `\n--- stderr ---\n${stderr}` : ''), 'utf8'); },
      });
      if (result.kind !== 'ok') {
        appendEvent(folder, { type: result.kind === 'fatal' ? 'fail' : result.kind, job: job.key, attempt, step: step.step, detail: { message: result.message, ...result.kind === 'quota' && result.resetsAt ? { resetsAt: result.resetsAt } : {}, ...result.kind === 'fatal' ? { fatal: true } : {} } });
        return result.kind;
      }
      writeFileSync(join(dir, `${String(step.step)}.md`), result.reply, { encoding: 'utf8', flag: 'wx' });
      if (result.session) sessions.set(step.conversation, result.session);
      replies.set(replyName(job, step), result.reply);
      appendEvent(folder, { type: 'step', job: job.key, attempt, step: step.step, detail: { ms: result.ms, costUsd: result.costUsd, usage: result.usage, models: result.models, chars: result.reply.length, ...note ? { material: note } : {}, ...result.warnings.length ? { warnings: result.warnings } : {} } });
    }
    finalize(folder, job, attempt);
    return 'done';
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
}

/** 跑佇列到沒有工作、或停下（額度用完、fatal、斷路器）。手貼的工作不在這裡跑。 */
export async function runQueue(folder: Folder, options: QueueOptions = {}): Promise<void> {
  const { log = console.log, temp = tmpdir() } = options;
  const adapters: Record<string, Adapter | undefined> = { claude: options.adapters?.claude ?? claudeAdapter(), codex: options.adapters?.codex ?? codexAdapter() };
  verifyLock(folder);
  const steps = readFrozenSteps(folder);
  const release = acquireLock(folder, 'generate');
  let stopped: string | null = null, failures = 0;
  const inFlight = new Set<string>();
  const stop = (reason: string, detail: Record<string, unknown> = {}): void => {
    if (stopped) return;
    stopped = reason;
    appendEvent(folder, { type: 'stop', detail: { reason, ...detail } });
    log(`停下：${reason}`);
  };
  const worker = async (): Promise<void> => {
    while (!stopped) {
      const events = readEvents(folder);
      const job = planJobs(folder, steps, events).find(each => each.kind !== 'manual' && !inFlight.has(each.key) && ['pending', 'retry'].includes(jobState(events, each.key).status));
      if (!job) return;
      const adapter = adapters[job.kind]!;
      inFlight.add(job.key);
      log(`開始 ${job.key}`);
      let outcome: Awaited<ReturnType<typeof runJob>>;
      try { outcome = await runJob(folder, job, adapter, temp); }
      catch (error) {
        appendEvent(folder, { type: 'fail', job: job.key, detail: { message: error instanceof Error ? error.message : String(error) } });
        outcome = 'fail';
      } finally { inFlight.delete(job.key); }
      log(`${job.key}：${outcome}`);
      if (outcome === 'quota') stop('額度用完', { job: job.key });
      else if (outcome === 'fatal') stop(`${job.key} 碰到重試也沒用的錯誤（看事件檔）`);
      else if (outcome === 'fail' || outcome === 'timeout') { if (++failures >= BREAKER) stop(`連續 ${String(BREAKER)} 份失敗`); }
      else failures = 0;
    }
  };
  try {
    await Promise.all(Array.from({ length: folder.config.concurrency }, worker));
  } finally { release(); }
}

/** 手貼的說明（§5-4）：服務、模型、推理、附哪一份 PDF、照順序貼哪幾段；貼回用 paste。 */
export function writeManual(folder: Folder, job: Job): string {
  const generator = folder.config.generators.find(each => each.name === job.generator)!;
  const lesson = folder.config.lessons.find(each => each.code === job.lesson)!;
  const lines = [
    `# 手貼 ${job.key}`, '',
    `- 服務：${generator.service ?? generator.name}`, `- 模型：${generator.model}`, `- 推理：${generator.effort}`,
    `- 教材：${materialOf(folder, lesson)}（第一段附這一份 PDF）`, '- 每一份開新的對話；不要用專案、記憶或自訂指示。', '',
  ];
  job.steps.forEach((step, i) => {
    const fresh = i === 0 || !job.steps.slice(0, i).some(each => each.conversation === step.conversation);
    const prompt = step.pending.length ? `生成時才產生：貼回 ${step.pending.join('、')} 之後，複製 生成/手貼/${job.key}-${String(step.step)}.md` : `複製 凍結/提示/${step.file} 的全文`;
    lines.push(`${String(i + 1)}. ${fresh ? (i === 0 ? '新對話，附 PDF' : '另開一個新對話，附 PDF') : '同一個對話接著'}：${prompt}，送出；回覆按程式碼區塊的「複製」，然後 \`npm run rule-test -- paste <測試資料夾> ${job.key}${job.steps.length > 1 ? ` ${String(step.step)}` : ''}\``);
  });
  const file = join(folder.root, '生成', '手貼', `${job.key}.md`);
  mkdirSync(join(folder.root, '生成', '手貼'), { recursive: true });
  writeFileSync(file, lines.join('\n') + '\n', 'utf8');
  return file;
}

/** `npm run rule-test -- generate <測試資料夾> [--confirmed] [--foreground]`；--run 是背景行程自己用的。 */
export async function generate(): Promise<void> {
  const [dir, ...flags] = process.argv.slice(3);
  if (!dir) throw Error('用法：npm run rule-test -- generate <測試資料夾> [--confirmed] [--foreground]');
  const folder = openFolder(cliPath(dir, 'rule-test'));
  if (flags.includes('--run')) { await runQueue(folder); return; }
  verifyLock(folder);
  const steps = readFrozenSteps(folder), events = readEvents(folder);
  const todo = planJobs(folder, steps, events).filter(job => ['pending', 'retry'].includes(jobState(events, job.key).status));
  const auto = todo.filter(job => job.kind !== 'manual'), manual = todo.filter(job => job.kind === 'manual');
  if (!flags.includes('--confirmed')) {
    for (const generator of folder.config.generators) {
      const mine = todo.filter(job => job.generator === generator.name);
      if (!mine.length) continue;
      const chars = mine.reduce((sum, job) => sum + job.steps.reduce((n, step) => n + step.chars, 0), 0);
      console.log(`${generator.name}（${generator.model}，${generator.effort}）：${String(mine.length)} 份、${String(mine.reduce((n, job) => n + job.steps.length, 0))} 次送出、提示共 ${chars.toLocaleString('en-US')} 字${generator.kind === 'manual' ? '（手貼）' : ''}`);
    }
    console.log(todo.length ? '\n同意用量後加 --confirmed 開跑。' : '沒有要生成的了。');
    return;
  }
  for (const job of manual) console.log(`手貼說明：${writeManual(folder, job)}`);
  if (!auto.length) return;
  if (flags.includes('--foreground')) { await runQueue(folder); return; }
  const pid = detach(folder, 'generate', join('生成', '執行.log'));
  console.log(`背景開始生成 ${String(auto.length)} 份（行程 ${String(pid)}）；進度用 status 看，輸出在 生成/執行.log。`);
}

/** 在背景開一個行程跑 `<command> <測試資料夾> --run`（主持的 Claude 不在前景等，§5-4）；輸出接到 log（測試資料夾裡的相對路徑）。 */
export function detach(folder: Folder, command: string, log: string, more: string[] = []): number | undefined {
  mkdirSync(dirname(join(folder.root, log)), { recursive: true });
  const out = openSync(join(folder.root, log), 'a');
  const child = spawn(process.execPath, [join(import.meta.dirname, 'cli.ts'), command, folder.root, '--run', ...more], { detached: true, stdio: ['ignore', out, out], windowsHide: true });
  child.unref();
  closeSync(out);
  return child.pid;
}

/** 給 paste 用：把貼回的回覆存進這份工作的這一步；都齊了就存進原稿。 */
export function savePasted(folder: Folder, job: Job, stepNumber: number, reply: string): string[] {
  const events = readEvents(folder);
  const state = jobState(events, job.key);
  const step = job.steps.find(each => each.step === stepNumber);
  if (!step) throw Error(`${job.key} 沒有第 ${String(stepNumber)} 步`);
  if (state.status === 'done' || state.status === 'invalid') throw Error(`${job.key} 已經貼完了`);
  const attempt = state.status === 'running' ? state.attempts : state.attempts + 1;
  if (state.status !== 'running') appendEvent(folder, { type: 'start', job: job.key, attempt });
  const dir = attemptDir(folder, job, attempt);
  mkdirSync(dir, { recursive: true });
  const done = new Set(job.steps.filter(each => existsSync(join(dir, `${String(each.step)}.md`))).map(each => each.step));
  const expected = job.steps.find(each => !done.has(each.step));
  if (expected?.step !== stepNumber) throw Error(expected ? `${job.key} 要先貼第 ${String(expected.step)} 步` : `${job.key} 每一步都貼了`);
  if (!reply.trim()) throw Error('貼回的內容是空的（剪貼簿是空的？）');
  writeFileSync(join(dir, `${String(stepNumber)}.md`), reply, { encoding: 'utf8', flag: 'wx' });
  appendEvent(folder, { type: 'step', job: job.key, attempt, step: stepNumber, detail: { chars: reply.length } });
  const notes: string[] = [];
  const next = job.steps.find(each => each.step > stepNumber);
  if (next?.pending.length) {
    const replies = new Map(job.steps.filter(each => each.step <= stepNumber).map(each => [replyName(job, each), readFileSync(join(dir, `${String(each.step)}.md`), 'utf8')]));
    const file = join(folder.root, '生成', '手貼', `${job.key}-${String(next.step)}.md`);
    writeFileSync(file, fillReplies(readFileSync(join(folder.root, '凍結', '提示', next.file), 'utf8'), replies), 'utf8');
    notes.push(`第 ${String(next.step)} 步的提示：${file}`);
  }
  if (!next) {
    finalize(folder, job, attempt);
    notes.push(`${job.key} 貼完了：${jobState(readEvents(folder), job.key).status === 'done' ? '有效原稿' : '無效原稿（照記，自動補一份）'}`);
  }
  return notes;
}

