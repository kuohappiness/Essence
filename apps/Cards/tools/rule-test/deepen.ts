// 比較測試工具：deepen（任務說明 tasks/rule-test-d236.md §6-1、§6-2）。模擬家長把這一份的草稿全部加入、孩子都記穩了，第一次按加深：
// 每一篇用外掛的 planDraft 做成草稿（假 ID）、改成啟用，照外掛的 deckTargets、deepenTargets、unitSiblings、learnedWords 與 buildDeepenPrompt
// 組提示，一篇一個對話送給生成那一份的生成器。計畫（草稿與提示）先算好存檔，再照事件跑；重跑只跑還沒完成、也還沒放棄的。
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  buildDeepenPrompt, deepenTargets, inspectDeepen, inspectReply, issueText, learnedWords, planDraft, readSnapshot as readNote, unitSiblings, type CardForm, type DeepenInspection, type ExistingNow,
} from '../../src/core/ai/index.ts';
import { buildIndex } from '../../src/core/catalog/index.ts';
import { blockIds, newId, parseDeck, type Deck } from '../../src/core/deck/index.ts';
import type { Mastery } from '../../src/core/study/index.ts';
import { cliPath } from '../cli-path.ts';
import { claudeAdapter, codexAdapter, type Adapter, type StepResult } from './adapters.ts';
import { deepenGroups } from './config.ts';
import { materialOf, openFolder, sha256File, sha256Text, writeOnce, type Folder } from './folder.ts';
import { confirmSpec, DEEPEN_PROMPT, readDeepenFrozen, readFrozenSnapshot, readFrozenSteps, readWordDecks, SPEC, verifyLock } from './freeze.ts';
import { acquireLock, CODEX_MATERIAL, detach, rawName } from './generate.ts';
import { appendEvent, jobState, planJobs, readEvents, reopenFailed, type Job } from './jobs.ts';
import { subjectOf } from './prompts.ts';

/** 加深的事件檔（和生成的分開，機制相同）。 */
const LOG = join('加深', '事件.jsonl');
/** 連續幾篇失敗就整個佇列停下（同生成）。 */
const BREAKER = 3;

/** 一篇加深的工作鍵（§6-2）。 */
const pieceKey = (job: string, n: number): string => `${job}~加深~${String(n)}`;

/** 一篇：模擬加入的卡組（啟用、帶假 ID）、它的提示。n 是這一份裡的篇序（多步的照步驟順序接著數）。 */
interface DeepenPiece { n: number; key: string; step: number; threeSections: boolean; name: string; path: string; deck: string; ids: string[]; chars: number; sha256: string }
/** 一份原稿的加深計畫：卡組存不了的不模擬（記原因，§6-1 第 1 點）。 */
export interface DeepenPlan { job: string; group: string; lesson: string; generator: string; copy: number; savable: boolean; why: string[]; map: boolean; pieces: DeepenPiece[] }

const planFile = (folder: Folder, job: string): string => join(folder.root, '加深', '計畫', `${job}.json`);
const promptFile = (folder: Folder, key: string): string => join(folder.root, '加深', '提示', `${key}.md`);
const replyFile = (folder: Folder, key: string): string => join(folder.root, '加深', '原稿', `${key}.md`);
const formatFile = (folder: Folder, key: string): string => join(folder.root, '加深', '格式', `${key}.json`);

/** 跑加深的份：設定的生成器、跑加深的組、生成完成（有效原稿）的。 */
function deepenJobs(folder: Folder, jobs: readonly Job[]): Job[] {
  const groups = deepenGroups(folder.config), generators = folder.config.deepen?.generators ?? [];
  return jobs.filter(job => groups.includes(job.group) && generators.includes(job.generator));
}

/** 同一份原稿每次產生的假 ID 都一樣（§6-1 第 2 點）：用工作鍵的雜湊當種子。 */
function seeded(key: string): () => number {
  let state = createHash('sha256').update(key).digest().readUInt32LE(0);
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 卡組的屬性區把狀態改成啟用（模擬家長按加入）。 */
function activate(text: string): string {
  const out = text.replace(/^(---\n[\s\S]*?^)狀態: 草稿$/m, '$1狀態: 啟用');
  if (out === text) throw Error('草稿的屬性區找不到「狀態: 草稿」');
  return out;
}

const fileName = (path: string): string => path.slice(path.lastIndexOf('/') + 1).replace(/\.md$/, '');

/** 外掛讀快照的地圖（latestMap 的口徑）：快照本文就是整理過、配好 ID 的回覆。 */
const mapOf = (body: string): { whole: string; structure: string } | null => readNote('模擬.md', `---\n識別碼: 模擬\n---\n\n${body}`)?.map ?? null;

/** 一份原稿的加深計畫與每一篇的提示（不寫檔）。 */
export function planCopy(folder: Folder, job: Job): { plan: DeepenPlan; prompts: Map<string, string> } {
  const lesson = folder.config.lessons.find(each => each.code === job.lesson)!;
  const subject = subjectOf(lesson.subjectKey);
  const snapshot = readFrozenSnapshot(folder, lesson.code);
  const sent = snapshot?.targets ?? [];
  const now = (id: string): ExistingNow => {
    const found = sent.find(each => each.id === id);
    return found ? { kind: 'one', path: found.path, name: found.name } : { kind: 'none' };
  };
  const base = { job: job.key, group: job.group, lesson: job.lesson, generator: job.generator, copy: job.copy };
  const steps = job.steps.filter(step => step.deck).map(step => {
    const reply = readFileSync(join(folder.root, '生成', '原稿', rawName(job, step)), 'utf8');
    return { step, inspection: inspectReply(reply, lesson.form, { subject: subject.subject, r3: step.threeSections }, sent, now) };
  });
  const why = steps.flatMap(({ step, inspection }) => inspection.errors.map(issue => `${steps.length > 1 ? `第 ${String(step.step)} 步 ` : ''}${issueText(issue)}`));
  if (why.length) return { plan: { ...base, savable: false, why, map: false, pieces: [] }, prompts: new Map() };

  // 假 ID 避開凍結的已有目標與原稿裡出現的 ID（§6-1 第 2 點）。
  const used = new Set([...sent.map(each => each.id), ...steps.flatMap(({ inspection }) => [...blockIds(inspection.normalized.lines.join('\n'))])]);
  const random = seeded(job.key);
  const next = (): string => { const id = newId(random, used); used.add(id); return id; };
  const taken = new Set<string>();
  const drafts = steps.map(({ step, inspection }) => ({ step, draft: planDraft(inspection, lesson.form, { subject: subject.subject, r3: step.threeSections }, sent, now, next, taken, '2000-01-01') }));
  const decks = drafts.flatMap(({ step, draft }) => draft.decks.map(each => {
    const text = activate(each.text);
    return { step, path: each.path, text, ids: each.ids, deck: parseDeck(text) };
  }));
  const entries: { path: string; deck: Deck }[] = decks.map(({ path, deck }) => ({ path, deck }));
  const index = buildIndex(entries);

  // 地圖（§6-1 第 4 點）：這一份的全貌、架構原文；多步的每一步照順序接，有一步沒有就是無。
  const maps = drafts.map(({ step, draft }) => ({ step, map: step.threeSections ? mapOf(draft.snapshotBody) : null }));
  const join2 = (part: 'whole' | 'structure'): string => maps.length > 1 ? maps.map(each => `# 第 ${String(each.step.step)} 步\n\n${each.map![part]}`).join('\n\n') : maps[0].map![part];
  const map = maps.length && maps.every(each => each.map) ? { whole: join2('whole'), structure: join2('structure') } : null;

  // 英文的已有單字（§6-1 第 4 點）：凍結的這一科卡組加上模擬加入的，交給外掛的 learnedWords 排、去重。
  let words: string[] | null = null;
  if (subject.subject === '英文') {
    const frozen = readWordDecks(folder, lesson.code);
    if (!frozen) throw Error(`課「${lesson.code}」沒有凍結的單字卡組（凍結時沒有設定加深？）`);
    const parsed = frozen.decks.map(each => ({ path: each.path, deck: parseDeck(each.text) }));
    const skip = new Set(frozen.skip);
    if (JSON.stringify(learnedWords(parsed, subject.subject, lesson.form.term, skip)) !== JSON.stringify(snapshot?.words ?? [])) throw Error(`課「${lesson.code}」凍結的單字卡組算出的單字和凍結的已有目標不同`);
    words = learnedWords([...parsed, ...entries], subject.subject, lesson.form.term, skip);
  }

  const rules = readDeepenFrozen(folder).groups[job.group];
  if (!rules) throw Error(`凍結的加深規則沒有組「${job.group}」`);
  const prompts = new Map<string, string>();
  const pieces = decks.map((each, i): DeepenPiece => {
    const key = pieceKey(job.key, i + 1);
    // 記穩了（§6-1 第 3 點）：啟用卡組照外掛的 deckTargets，裡面的一律記穩了；其他照外掛送「還沒記穩」。
    const mastery = new Map<string, Mastery>(index.deckTargets(each.path).map(id => [id, 'stable']));
    const { unit } = each.deck.props;
    const form: Pick<CardForm, 'term' | 'unit' | 'purpose' | 'adjust' | 'material' | 'pick'> = {
      term: lesson.form.term, unit: unit ? `${unit.code} ${unit.name}`.trim() : fileName(each.path),
      purpose: lesson.form.purpose, adjust: lesson.form.adjust, material: lesson.form.material, pick: lesson.form.pick,
    };
    const prompt = buildDeepenPrompt({
      form, subject: { subject: subject.subject, r3: each.step.threeSections }, targets: deepenTargets(each.deck, mastery),
      siblings: unitSiblings(entries, each.path, each.deck), map, gone: [], words,
    }, rules);
    prompts.set(key, prompt.text);
    return { n: i + 1, key, step: each.step.step, threeSections: each.step.threeSections, name: fileName(each.path), path: each.path, deck: each.text, ids: each.ids, chars: prompt.text.length, sha256: sha256Text(prompt.text) };
  });
  return { plan: { ...base, savable: true, why: [], map: map !== null, pieces }, prompts };
}

export function readPlan(folder: Folder, job: string): DeepenPlan | null {
  const file = planFile(folder, job);
  return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) as DeepenPlan : null;
}

/** 算好、存好每一份還沒有計畫的（存過的照舊；算出不同的內容就停下）。回全部的計畫。 */
function planFolder(folder: Folder): DeepenPlan[] {
  const events = readEvents(folder);
  const done = deepenJobs(folder, planJobs(folder, readFrozenSteps(folder), events)).filter(job => jobState(events, job.key).status === 'done');
  return done.map(job => {
    const { plan, prompts } = planCopy(folder, job);
    for (const [key, text] of prompts) writeOnce(promptFile(folder, key), text);
    writeOnce(planFile(folder, job.key), JSON.stringify(plan, null, 2) + '\n');
    return plan;
  });
}

/** 凍結之後外掛的加深任務段改過就停下（§6-1 第 5 點）。 */
function verifyDeepenPrompt(folder: Folder): void {
  if (!folder.config.deepen) throw Error('測試.yaml 沒有設定「加深」');
  if (sha256File(DEEPEN_PROMPT) !== readDeepenFrozen(folder).prompt) throw Error('外掛的加深任務段（src/core/ai/deepen-prompt.ts）在凍結之後改過：用凍結時的 commit 跑');
}

/** 這幾份原稿的加深還沒完成、也還沒放棄的篇；沒有計畫的寫「還沒跑 deepen」（blind 用，§6-2）。 */
export function deepenUnfinished(folder: Folder, jobs: readonly Job[]): string[] {
  if (!folder.config.deepen) return [];
  const events = readEvents(folder, LOG);
  return deepenJobs(folder, jobs).flatMap(job => {
    const plan = readPlan(folder, job.key);
    if (!plan) return [`${job.key}（還沒跑 deepen）`];
    return plan.pieces.filter(piece => !['done', 'failed'].includes(jobState(events, piece.key).status)).map(piece => `${piece.key}（${jobState(events, piece.key).status}）`);
  });
}

/** status 用（§6-2）：加深做到哪裡；沒設定加深是空的。 */
export function deepenStatus(folder: Folder, jobs: readonly Job[]): string[] {
  if (!folder.config.deepen) return [];
  const events = readEvents(folder, LOG), mine = deepenJobs(folder, jobs);
  const plans = mine.map(job => readPlan(folder, job.key));
  const pieces = plans.flatMap(plan => plan?.pieces ?? []);
  const count = (status: string): number => pieces.filter(piece => jobState(events, piece.key).status === status).length;
  const unplanned = plans.filter(plan => !plan).length, unsavable = plans.filter(plan => plan && !plan.savable).length;
  const lines = [`加深：${String(mine.length)} 份、${String(pieces.length)} 篇｜完成 ${String(count('done'))}、跑中 ${String(count('running'))}、待跑 ${String(count('pending') + count('retry'))}、放棄 ${String(count('failed'))}${unsavable ? `；卡組存不了、不能加深 ${String(unsavable)} 份` : ''}${unplanned ? `；還沒算計畫 ${String(unplanned)} 份（生成完成後：deepen）` : ''}`];
  for (const piece of pieces.filter(each => jobState(events, each.key).status === 'failed')) {
    const detail = jobState(events, piece.key).last?.detail?.message;
    lines.push(`  放棄：${piece.key}：${typeof detail === 'string' ? detail : JSON.stringify(detail ?? '')}（看過原因要再試：deepen --retry）`);
  }
  return lines;
}

interface Todo { job: Job; plan: DeepenPlan; piece: DeepenPiece }

function todos(folder: Folder, plans: readonly DeepenPlan[]): Todo[] {
  const jobs = new Map(planJobs(folder, readFrozenSteps(folder), readEvents(folder)).map(job => [job.key, job]));
  return plans.flatMap(plan => plan.pieces.map(piece => ({ job: jobs.get(plan.job)!, plan, piece })));
}

/** 外掛的 inspectDeepen（§6-1 第 7 點）：這一篇模擬加入的卡組、這一組交不交三段。 */
function inspectPiece(folder: Folder, plan: DeepenPlan, piece: DeepenPiece, reply: string): DeepenInspection {
  const lesson = folder.config.lessons.find(each => each.code === plan.lesson)!;
  const deck = parseDeck(piece.deck);
  const targets = new Map(deck.targets.flatMap(t => t.id !== null && t.ok && !t.implicit ? [[t.id, t.name] as const] : []));
  return inspectDeepen(reply, lesson.form, { subject: subjectOf(lesson.subjectKey).subject, r3: piece.threeSections }, { path: piece.path, targets });
}

/** 加深的一項（§6-2）：新的學習目標一項，加進已有目標的每一題一項；候選卡片不是。line 是給評審的檔的行號（從 1 算）。 */
interface DeepenItem { id: string; kind: '新目標' | '加題'; target: string | null; line: number; text: string }
/** 給評審的一份加深：草稿（帶假 ID）與每一篇的加深回覆；放棄的篇不評。 */
export interface DeepenSheet { text: string; items: DeepenItem[]; pieces: { n: number; abandoned: boolean }[]; unsavable: number }

const MARK = /^\s{0,3}<<<([^<>\n]*)>>>\s*$/;
const QUOTE = /^\s{0,3}>\s?/;
const bodyOf = (text: string): string[] => {
  const lines = text.replace(/\n$/, '').split('\n');
  const close = lines[0] === '---' ? lines.indexOf('---', 1) : -1;
  const body = lines.slice(close + 1);
  while (body.length && !body[0].trim()) body.shift();
  return body;
};

/** 一份原稿的加深給評審的檔與項（§6-2）：標記行換成標題（同地圖），`<<<完>>>` 拿掉；加深存不了的篇數另外記（§6-1 第 7 點）。 */
function deepenSheet(folder: Folder, plan: DeepenPlan): DeepenSheet {
  const events = readEvents(folder, LOG);
  const out: string[] = ['# 草稿', '', '家長把這一份的草稿全部加入、孩子都記穩了，然後第一次按加深。學習目標的 ID 是程式給的。', ''];
  for (const piece of plan.pieces) out.push(`## 第 ${String(piece.n)} 篇：${piece.name}`, '', ...bodyOf(piece.deck), '');
  const items: DeepenItem[] = [], pieces: DeepenSheet['pieces'] = [];
  let unsavable = 0;
  for (const piece of plan.pieces) {
    out.push(`# 第 ${String(piece.n)} 篇的加深`, '');
    const abandoned = jobState(events, piece.key).status !== 'done';
    pieces.push({ n: piece.n, abandoned });
    if (abandoned) { out.push('（這一篇沒有加深回覆，不評。）', ''); continue; }
    const inspection = inspectPiece(folder, plan, piece, readFileSync(replyFile(folder, piece.key), 'utf8'));
    if (inspection.errors.length) unsavable++;
    const { lines } = inspection.normalized;
    const at = new Map<number, number>();
    lines.forEach((line, i) => {
      const mark = MARK.exec(line);
      if (mark?.[1].trim() === '完') return;
      out.push(mark ? `## ${mark[1].trim()}` : line);
      at.set(i, out.length);
    });
    out.push('');
    // 新的學習目標：名稱行，候選卡片裡的不算；加題：每一個加進已有目標的項目底下的每一題。
    const found: Omit<DeepenItem, 'id'>[] = inspection.names.filter(line => !inspection.candidates.includes(line)).map(line => ({ kind: '新目標', target: null, line: at.get(line)!, text: lines[line].trim() }));
    const adds = [...inspection.adds].sort((a, b) => a.line - b.line);
    adds.forEach((add, i) => {
      const segment = inspection.existing.filter(line => line >= add.line && (i + 1 >= adds.length || line < adds[i + 1].line));
      const deck = parseDeck(segment.map(line => lines[line].replace(QUOTE, '')).join('\n'));
      for (const prompt of deck.targets[0]?.prompts ?? []) found.push({ kind: '加題', target: add.id, line: at.get(segment[prompt.line])!, text: lines[segment[prompt.line]].replace(QUOTE, '').trim() });
    });
    found.sort((a, b) => a.line - b.line).forEach((item, k) => items.push({ id: `${String(piece.n)}-${String(k + 1)}`, ...item }));
  }
  while (out.at(-1) === '') out.pop();
  return { text: out.join('\n') + '\n', items, pieces, unsavable };
}

/** 一份原稿給評審的加深（blind 用）：沒跑加深是 null；卡組存不了的回原因；其他回給評審的檔。 */
export function deepenOf(folder: Folder, job: Job): { why: string[] } | DeepenSheet | null {
  if (!deepenJobs(folder, [job]).length) return null;
  const plan = readPlan(folder, job.key);
  if (!plan) throw Error(`${job.key} 還沒跑 deepen`);
  return plan.savable ? deepenSheet(folder, plan) : { why: plan.why };
}

/** 跑一篇：一個新對話，模型、推理同生成那一份；回覆存 加深/原稿/，外掛的 inspectDeepen 結果存 加深/格式/。 */
async function runPiece(folder: Folder, todo: Todo, adapter: Adapter, temp: string): Promise<StepResult['kind'] | 'done'> {
  const { config } = folder;
  const { job, piece } = todo;
  const generator = config.generators.find(each => each.name === job.generator)!;
  const lesson = config.lessons.find(each => each.code === job.lesson)!;
  const attempt = jobState(readEvents(folder, LOG), piece.key).attempts + 1;
  appendEvent(folder, { type: 'start', job: piece.key, attempt }, LOG);
  const dir = join(folder.root, '加深', '嘗試');
  mkdirSync(dir, { recursive: true });
  const cwd = mkdtempSync(join(temp, 'rule-test-deepen-'));
  const pdf = readFileSync(materialOf(folder, lesson));
  const codex = job.kind === 'codex';
  if (codex) writeFileSync(join(cwd, '教材.pdf'), pdf);
  try {
    const prompt = readFileSync(promptFile(folder, piece.key), 'utf8');
    if (sha256Text(prompt) !== piece.sha256) throw Error(`${piece.key} 的提示和計畫的雜湊不同`);
    const text = codex ? `${CODEX_MATERIAL}\n\n${prompt}` : prompt;
    const result = await adapter({
      text, pdf: codex ? null : pdf, resume: null, model: generator.model, effort: generator.effort, systemPrompt: config.systemPrompt, cwd,
      timeoutMs: config.timeoutMinutes * 60_000,
      record: (stdout, stderr) => { writeFileSync(join(dir, `${piece.key}-${String(attempt)}.jsonl`), stdout + (stderr ? `\n--- stderr ---\n${stderr}` : ''), 'utf8'); },
    });
    if (result.kind !== 'ok') {
      appendEvent(folder, { type: result.kind === 'fatal' ? 'fail' : result.kind, job: piece.key, attempt, detail: { message: result.message, ...result.kind === 'quota' && result.resetsAt ? { resetsAt: result.resetsAt } : {}, ...result.kind === 'fatal' ? { fatal: true } : {} } }, LOG);
      return result.kind;
    }
    writeOnce(replyFile(folder, piece.key), result.reply);
    // 外掛存不存得了（§6-1 第 7 點）：有錯誤記「加深存不了」，內容照評。
    const inspection = inspectPiece(folder, todo.plan, piece, result.reply);
    writeOnce(formatFile(folder, piece.key), JSON.stringify({ job: piece.key, ended: inspection.ended, errors: inspection.errors.map(issueText), hints: inspection.hints.map(issueText) }, null, 2) + '\n');
    appendEvent(folder, { type: 'done', job: piece.key, attempt, detail: { ms: result.ms, costUsd: result.costUsd, usage: result.usage, models: result.models, sent: text.length, chars: result.reply.length, ...codex ? { material: CODEX_MATERIAL } : {}, ...result.warnings.length ? { warnings: result.warnings } : {} } }, LOG);
    return 'done';
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
}

export interface DeepenOptions { adapters?: Partial<Record<'claude' | 'codex', Adapter>>; log?: (line: string) => void; temp?: string }

/** 跑加深的佇列到沒有工作、或停下（額度用完、fatal、斷路器），同生成的 runQueue。 */
export async function runDeepen(folder: Folder, options: DeepenOptions = {}): Promise<void> {
  const { log = console.log, temp = tmpdir() } = options;
  const adapters: Record<string, Adapter | undefined> = { claude: options.adapters?.claude ?? claudeAdapter(), codex: options.adapters?.codex ?? codexAdapter() };
  verifyLock(folder);
  verifyDeepenPrompt(folder);
  const release = acquireLock(folder, 'deepen', LOG);
  let stopped: string | null = null, failures = 0;
  const inFlight = new Set<string>();
  const stop = (reason: string, detail: Record<string, unknown> = {}): void => {
    if (stopped) return;
    stopped = reason;
    appendEvent(folder, { type: 'stop', detail: { reason, ...detail } }, LOG);
    log(`停下：${reason}`);
  };
  try {
    const all = todos(folder, planFolder(folder));
    const worker = async (): Promise<void> => {
      while (!stopped) {
        const events = readEvents(folder, LOG);
        const todo = all.find(each => !inFlight.has(each.piece.key) && ['pending', 'retry'].includes(jobState(events, each.piece.key).status));
        if (!todo) return;
        inFlight.add(todo.piece.key);
        log(`開始 ${todo.piece.key}`);
        let outcome: Awaited<ReturnType<typeof runPiece>>;
        try { outcome = await runPiece(folder, todo, adapters[todo.job.kind]!, temp); }
        catch (error) {
          appendEvent(folder, { type: 'fail', job: todo.piece.key, detail: { message: error instanceof Error ? error.message : String(error) } }, LOG);
          outcome = 'fail';
        } finally { inFlight.delete(todo.piece.key); }
        log(`${todo.piece.key}：${outcome}`);
        if (outcome === 'quota') stop('額度用完', { job: todo.piece.key });
        else if (outcome === 'fatal') stop(`${todo.piece.key} 碰到重試也沒用的錯誤（看事件檔）`);
        else if (outcome === 'fail' || outcome === 'timeout') { if (++failures >= BREAKER) stop(`連續 ${String(BREAKER)} 篇失敗`); }
        else failures = 0;
      }
    };
    await Promise.all(Array.from({ length: folder.config.concurrency }, worker));
  } finally { release(); }
}

/** `npm run rule-test -- deepen <測試資料夾> [--confirmed] [--foreground] [--retry]`；--run 是背景行程自己用的。 */
export async function deepen(): Promise<void> {
  const [dir, ...flags] = process.argv.slice(3);
  if (!dir) throw Error('用法：npm run rule-test -- deepen <測試資料夾> [--confirmed] [--foreground] [--retry]');
  const folder = openFolder(cliPath(dir, 'rule-test'));
  if (flags.includes('--run')) { await runDeepen(folder); return; }
  verifyLock(folder);
  verifyDeepenPrompt(folder);
  const plans = planFolder(folder);
  const unsavable = plans.filter(plan => !plan.savable);
  if (unsavable.length) console.log(`卡組存不了、不能加深（記最差值）：${unsavable.map(plan => plan.job).join('、')}\n`);
  const events = readEvents(folder, LOG), retry = flags.includes('--retry');
  const all = todos(folder, plans);
  const failed = all.filter(each => jobState(events, each.piece.key).status === 'failed');
  const todo = all.filter(each => ['pending', 'retry'].includes(jobState(events, each.piece.key).status) || (retry && failed.includes(each)));
  if (failed.length && !retry) console.log(`放棄的 ${String(failed.length)} 篇沒算進去（決定再試就加 --retry）：${failed.map(each => each.piece.key).join('、')}\n`);
  if (!flags.includes('--confirmed')) {
    for (const generator of folder.config.generators) {
      const mine = todo.filter(each => each.job.generator === generator.name);
      if (mine.length) console.log(`${generator.name}（${generator.model}，${generator.effort}）：${String(mine.length)} 篇、提示共 ${mine.reduce((sum, each) => sum + each.piece.chars, 0).toLocaleString('en-US')} 字`);
    }
    console.log(todo.length ? `\n給使用者看用量時，一起給〈評估規格〉：${join(folder.root, SPEC)}。同意用量後加 --confirmed 開跑。` : '沒有要加深的了。');
    return;
  }
  if (todo.length) confirmSpec(folder, LOG);
  if (retry && failed.length) console.log(`重開放棄的：${reopenFailed(folder, failed.map(each => each.piece.key), LOG).join('、')}`);
  if (!todo.length) return;
  if (flags.includes('--foreground')) { await runDeepen(folder); return; }
  const pid = detach(folder, 'deepen', join('加深', '執行.log'));
  console.log(`背景開始加深 ${String(todo.length)} 篇（行程 ${String(pid)}）；進度用 status 看，輸出在 加深/執行.log。`);
}
