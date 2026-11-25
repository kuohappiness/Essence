// 比較測試工具：check（任務說明 tasks/rule-test-tool.md §5-5）。每份原稿、多步的每個卡組步驟，用外掛的 inspectReply 檢查格式，
// 只記錄、不改原稿；有錯誤（存不了）的照樣評內容。目標數、題數、候選、加題照 pieces 數，不叫評審數。
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { checkPiece, inspectReply, issueText, pieceText, type ExistingNow } from '../../src/core/ai/index.ts';
import { cliPath } from '../cli-path.ts';
import { openFolder, writeOnce, type Folder } from './folder.ts';
import { git, readFrozenSnapshot, readFrozenSteps, verifyLock } from './freeze.ts';
import { rawName } from './generate.ts';
import { jobState, planJobs, readEvents, type Job } from './jobs.ts';
import { subjectOf } from './prompts.ts';

/** adds 是加題的項目數；addPrompts 是那些項目底下實際的題數（孩子要複習的題，rule-test-d236.md §4）。 */
interface PieceCount { name: string; targets: number; prompts: number; candidates: number; adds: number; addPrompts: number }
export interface FormatRecord { job: string; step: number; threeSections: boolean; ended: boolean; errors: string[]; hints: string[]; pieces: PieceCount[]; commit: string }

const formatFile = (folder: Folder, name: string): string => join(folder.root, '格式', name.replace(/\.md$/, '.json'));

/** 一份工作的格式紀錄（每個卡組步驟一筆）；還沒檢查的是 null。 */
export function readFormat(folder: Folder, job: Job): FormatRecord[] | null {
  const records = job.steps.filter(step => step.deck).map(step => formatFile(folder, rawName(job, step)));
  return records.every(existsSync) ? records.map(file => JSON.parse(readFileSync(file, 'utf8')) as FormatRecord) : null;
}

export function checkFolder(folder: Folder, log: (line: string) => void = console.log): FormatRecord[] {
  verifyLock(folder);
  const events = readEvents(folder);
  const commit = git(['rev-parse', 'HEAD']);
  const all: FormatRecord[] = [];
  for (const job of planJobs(folder, readFrozenSteps(folder), events)) {
    const status = jobState(events, job.key).status;
    if (status !== 'done' && status !== 'invalid') continue;
    const lesson = folder.config.lessons.find(each => each.code === job.lesson)!;
    const subject = subjectOf(lesson.subjectKey);
    const snapshot = readFrozenSnapshot(folder, lesson.code);
    const sent = snapshot?.targets ?? [];
    const now = (id: string): ExistingNow => {
      const found = sent.find(each => each.id === id);
      return found ? { kind: 'one', path: found.path, name: found.name } : { kind: 'none' };
    };
    for (const step of job.steps.filter(each => each.deck)) {
      const name = rawName(job, step), file = formatFile(folder, name);
      if (existsSync(file)) { all.push(JSON.parse(readFileSync(file, 'utf8')) as FormatRecord); continue; }
      const reply = readFileSync(join(folder.root, '生成', '原稿', name), 'utf8');
      const inspection = inspectReply(reply, lesson.form, { subject: subject.subject, r3: step.threeSections }, sent, now);
      const record: FormatRecord = {
        job: job.key, step: step.step, threeSections: step.threeSections, ended: inspection.ended,
        errors: inspection.errors.map(issueText), hints: inspection.hints.map(issueText),
        pieces: inspection.pieces.map(piece => {
          const { text, rawLine } = pieceText(inspection.normalized, piece);
          const added = checkPiece(text, rawLine, { subject: subject.subject, r3: step.threeSections }, lesson.form).result.existing;
          return { name: piece.name, targets: piece.targets, prompts: piece.prompts, candidates: piece.candidates, adds: piece.adds.length, addPrompts: added.reduce((sum, each) => sum + each.questions.length, 0) };
        }),
        commit,
      };
      writeOnce(file, JSON.stringify(record, null, 2) + '\n');
      all.push(record);
      log(`${name}：錯誤 ${String(record.errors.length)}、提示 ${String(record.hints.length)}；${record.pieces.map(piece => `${piece.name}（目標 ${String(piece.targets)}、題 ${String(piece.prompts)}、候選 ${String(piece.candidates)}、加題 ${String(piece.adds)} 項 ${String(piece.addPrompts)} 題）`).join('；') || '沒有篇'}`);
    }
  }
  return all;
}

/** `npm run rule-test -- check <測試資料夾>` */
export function check(): Promise<void> {
  const dir = process.argv[3];
  if (!dir) throw Error('用法：npm run rule-test -- check <測試資料夾>');
  checkFolder(openFolder(cliPath(dir, 'rule-test')));
  return Promise.resolve();
}
