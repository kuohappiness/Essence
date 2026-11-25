// 比較測試工具：blind（任務說明 tasks/rule-test-tool.md §5-6）。切出卡組段、掃洩漏字樣、每課各自打亂代號、分區組，
// 建給評審的資料夾；對照表寫進 封存/，那一批鎖定前不讀。一批一次：已經在前一批的工作不再放進來。
import { randomInt } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { cliPath } from '../cli-path.ts';
import { cutDeck } from './deck-cut.ts';
import { materialOf, openFolder, rubricOf, sha256File, sha256Text, writeOnce, type Folder } from './folder.ts';
import { git, readFrozenSnapshot, readFrozenSteps, verifyLock } from './freeze.ts';
import { rawName } from './generate.ts';
import { jobState, planJobs, readEvents, type Job } from './jobs.ts';

export interface BlindEntry {
  lesson: string; code: string; job: string; group: string; generator: string; copy: number; replacement: boolean;
  raws: string[]; rawSha256: string[]; deckSha256: string; chars: number; blocks: string[];
}
export interface Block { name: string; lesson: string; generator: string; codes: string[] }
export interface Batch { batch: number; commit: string; time: string; entries: BlindEntry[]; blocks: Block[] }

/** 一個區組最多幾份（§5-6，F11）。 */
const BLOCK_SIZE = 4;
const MODEL_WORDS = ['claude', 'opus', 'sonnet', 'haiku', 'fable', 'chatgpt', 'gpt', 'codex', 'gemini'];

const batchFile = (folder: Folder, n: number): string => join(folder.root, '封存', `對照表-批${String(n)}.json`);
export function batchNumbers(folder: Folder): number[] {
  const dir = join(folder.root, '封存');
  return existsSync(dir) ? readdirSync(dir).flatMap(name => /^對照表-批(\d+)\.json$/.exec(name)?.[1] ?? []).map(Number).sort((a, b) => a - b) : [];
}
/** 對照表只在這裡讀：blind 編下一批的號碼，與 unblind 在那一批鎖定、裁定之後（§5-6「那一批鎖定前不讀」）。 */
const readBatch = (folder: Folder, n: number): Batch => JSON.parse(readFileSync(batchFile(folder, n), 'utf8')) as Batch;
export const batchDir = (folder: Folder, n: number): string => join(folder.root, '評分', `批${String(n)}`);
/** 一批的區組（只有代號，沒有組別）：評分、狀態用這個，不讀對照表。 */
export const readBlocks = (folder: Folder, n: number): Block[] => JSON.parse(readFileSync(join(batchDir(folder, n), '區組.json'), 'utf8')) as Block[];

/** 解開時讀對照表：那一批的 鎖定.md 與 裁定.md 都在才讀得到（§5-9）；雜湊與裁定填完沒有由 unblind 先查。 */
export function openBatch(folder: Folder, n: number): Batch {
  const dir = batchDir(folder, n);
  if (!existsSync(join(dir, '鎖定.md'))) throw Error(`批 ${String(n)} 還沒鎖定（兩位評審都交齊才鎖定），不能解開`);
  if (!existsSync(join(dir, '裁定.md'))) throw Error(`批 ${String(n)} 還沒裁定（先跑 disputes）`);
  return readBatch(folder, n);
}

function shuffle<T>(items: readonly T[], random: (max: number) => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = random(i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** 多步的把卡組步驟的卡組段照順序接起來；三段的找不到 `<<<卡組>>>` 回原因。 */
function anonymousDeck(folder: Folder, job: Job): { deck: string } | { why: string } {
  const parts: string[] = [];
  for (const step of job.steps.filter(each => each.deck)) {
    const cut = cutDeck(readFileSync(join(folder.root, '生成', '原稿', rawName(job, step)), 'utf8'), step.threeSections);
    if (!cut.ok) return { why: `${rawName(job, step)}：${cut.why}` };
    parts.push(cut.deck);
  }
  return { deck: parts.join('\n') };
}

/** 洩漏字樣（§5-6）：組名、生成器與模型的名稱、`<<<` 標記。回傳每一處（給人看）。 */
function leaks(folder: Folder, deck: string): string[] {
  const { config } = folder;
  const words = [...new Set([...config.groups.map(each => each.name), ...config.generators.flatMap(each => [each.name, each.model, ...each.service ? [each.service] : []]), ...MODEL_WORDS, '<<<'])].filter(Boolean);
  return deck.split('\n').flatMap((line, i) => words.filter(word => line.toLowerCase().includes(word.toLowerCase())).map(word => `第 ${String(i + 1)} 行有「${word}」`));
}

const numbered = (deck: string): string => deck.split('\n').map((line, i) => line === '' && i === deck.split('\n').length - 1 ? '' : `${String(i + 1)}\t${line}`).join('\n');

/** 每課每個生成器：基準組在最前面，每組各取第 k 份成第 k 個區組；組多於 4 時拆開，每個都有基準組的那一份（F11、N7）。 */
export function makeBlocks(folder: Folder, entries: readonly BlindEntry[], start: (lesson: string) => number): Block[] {
  const { gates } = folder.config;
  const order = [gates.baseline, ...gates.candidates, ...folder.config.groups.map(each => each.name).filter(name => name !== gates.baseline && !gates.candidates.includes(name))];
  const blocks: Block[] = [];
  const next = new Map<string, number>();
  for (const lesson of [...new Set(entries.map(each => each.lesson))]) {
    for (const generator of [...new Set(entries.filter(each => each.lesson === lesson).map(each => each.generator))]) {
      const byGroup = order.map(group => entries.filter(each => each.lesson === lesson && each.generator === generator && each.group === group).sort((a, b) => a.copy - b.copy));
      const rounds = Math.max(0, ...byGroup.map(list => list.length));
      for (let k = 0; k < rounds; k++) {
        const round = byGroup.map(list => list.at(k)).filter((each): each is BlindEntry => each !== undefined);
        const base = round[0]?.group === gates.baseline ? round[0] : null;
        const others = base ? round.slice(1) : round;
        const size = base ? BLOCK_SIZE - 1 : BLOCK_SIZE;
        for (let i = 0; i < Math.max(1, Math.ceil(others.length / size)); i++) {
          const members = [...base ? [base] : [], ...others.slice(i * size, (i + 1) * size)];
          const n = next.get(lesson) ?? start(lesson);
          next.set(lesson, n + 1);
          const name = `${lesson}-B${String(n).padStart(2, '0')}`;
          for (const member of members) member.blocks.push(name);
          blocks.push({ name, lesson, generator, codes: members.map(each => each.code) });
        }
      }
    }
  }
  return blocks;
}

export interface BlindOptions { acceptLeaks?: boolean; random?: (max: number) => number; log?: (line: string) => void }

export function blindFolder(folder: Folder, options: BlindOptions = {}): Batch {
  const { random = randomInt, log = console.log } = options;
  verifyLock(folder);
  // 評分表在這裡鎖（凍結時還沒有的話）：之後改了就停下（§5-2 改了存成新版）。
  for (const lesson of folder.config.lessons) {
    if (!existsSync(rubricOf(folder, lesson))) throw Error(`課「${lesson.code}」還沒有評分表：${rubricOf(folder, lesson)}`);
    try { writeOnce(join(folder.root, '凍結', '評分表', `${lesson.code}.sha256`), sha256File(rubricOf(folder, lesson)) + '\n'); }
    catch { throw Error(`課「${lesson.code}」的評分表在鎖定之後改過；要改就存成新版、開新的測試資料夾（§5-2）`); }
  }
  const events = readEvents(folder);
  const jobs = planJobs(folder, readFrozenSteps(folder), events);
  const unfinished = jobs.filter(job => !['done', 'invalid'].includes(jobState(events, job.key).status));
  if (unfinished.length) throw Error(`還有 ${String(unfinished.length)} 份沒生成完（一批一次，等都完成再匿名）：${unfinished.map(job => `${job.key}（${jobState(events, job.key).status}）`).join('、')}`);
  const previous = batchNumbers(folder).map(n => readBatch(folder, n));
  const seen = new Set(previous.flatMap(batch => batch.entries.map(entry => entry.job)));
  const fresh = jobs.filter(job => jobState(events, job.key).status === 'done' && !seen.has(job.key));
  if (!fresh.length) throw Error('沒有新的有效原稿可以匿名');

  const decks = new Map<string, string>(), problems: string[] = [];
  for (const job of fresh) {
    const cut = anonymousDeck(folder, job);
    if ('why' in cut) { problems.push(cut.why); continue; }
    decks.set(job.key, cut.deck);
    if (!options.acceptLeaks) problems.push(...leaks(folder, cut.deck).map(hit => `${job.key} ${hit}`));
  }
  if (problems.length) throw Error(`停下給人看（看過確定沒問題再加 --accept-leaks；切不出卡組段的要先處理）：\n${problems.join('\n')}`);

  const batch = (previous.at(-1)?.batch ?? 0) + 1;
  const entries: BlindEntry[] = [];
  for (const lesson of folder.config.lessons) {
    const mine = shuffle(fresh.filter(job => job.lesson === lesson.code), random);
    const used = previous.flatMap(each => each.entries).filter(entry => entry.lesson === lesson.code).map(entry => Number(entry.code.slice(1)));
    let n = Math.max(0, ...used);
    for (const job of mine) {
      const deck = decks.get(job.key)!;
      const raws = job.steps.map(step => rawName(job, step));
      entries.push({
        lesson: lesson.code, code: `S${String(++n)}`, job: job.key, group: job.group, generator: job.generator, copy: job.copy, replacement: job.replacement,
        raws, rawSha256: raws.map(raw => sha256File(join(folder.root, '生成', '原稿', raw))), deckSha256: sha256Text(deck), chars: deck.length, blocks: [],
      });
    }
  }
  const usedBlocks = previous.flatMap(each => each.blocks);
  // 區組裡的順序也打亂（§5-6）：評審的提示照 codes 列卡組，不打亂的話基準組永遠在第一個。
  const blocks = makeBlocks(folder, entries, lesson => 1 + usedBlocks.filter(block => block.lesson === lesson).length).map(block => ({ ...block, codes: shuffle(block.codes, random) }));

  const dir = batchDir(folder, batch);
  for (const entry of entries) writeOnce(join(dir, '卡組', entry.lesson, `${entry.code}.md`), decks.get(entry.job)!);
  for (const block of blocks) {
    const lesson = folder.config.lessons.find(each => each.code === block.lesson)!;
    const at = join(dir, '區組', block.name);
    mkdirSync(join(at, '卡組'), { recursive: true });
    copyFileSync(rubricOf(folder, lesson), join(at, '評分表.md'));
    copyFileSync(materialOf(folder, lesson), join(at, '教材.pdf'));
    writeOnce(join(at, '已有目標.json'), JSON.stringify(readFrozenSnapshot(folder, lesson.code)?.pool ?? [], null, 2) + '\n');
    for (const code of block.codes) writeOnce(join(at, '卡組', `${code}.md`), numbered(decks.get(entries.find(each => each.lesson === block.lesson && each.code === code)!.job)!));
  }
  writeOnce(join(dir, '區組.json'), JSON.stringify(blocks, null, 2) + '\n');
  const result: Batch = { batch, commit: git(['rev-parse', 'HEAD']), time: new Date().toISOString(), entries, blocks };
  writeOnce(batchFile(folder, batch), JSON.stringify(result, null, 2) + '\n');
  log(`批 ${String(batch)}：${String(entries.length)} 份、${String(blocks.length)} 個區組（${blocks.map(block => `${block.name} ${String(block.codes.length)} 份`).join('、')}）。對照表在 封存/，鎖定前不讀。`);
  return result;
}

/** `npm run rule-test -- blind <測試資料夾> [--accept-leaks]` */
export function blind(): Promise<void> {
  const [dir, ...flags] = process.argv.slice(3);
  if (!dir) throw Error('用法：npm run rule-test -- blind <測試資料夾> [--accept-leaks]');
  blindFolder(openFolder(cliPath(dir, 'rule-test')), { acceptLeaks: flags.includes('--accept-leaks') });
  return Promise.resolve();
}
