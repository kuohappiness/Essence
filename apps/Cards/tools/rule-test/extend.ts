// 比較測試工具：extend（任務說明 tasks/rule-test-tool.md §5-10）。同一課多跑幾份：寫進 追加.jsonl（不改 測試.yaml），每一組各加同樣的份數
// （算門檻的組份數相同，§4-2）；只能加已凍結的課與生成器，規則與門檻不能改。記原因、時間、是不是在某一批解開之後才加；
// 加的份照樣 generate、check，blind 時成為新的一批。
import { appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { cliPath } from '../cli-path.ts';
import { lessonsOf } from './config.ts';
import { openFolder, type Folder } from './folder.ts';
import { readFrozenSteps, verifyLock } from './freeze.ts';
import { EXTENSIONS, jobState, planJobs, readEvents, type Extension } from './jobs.ts';
import { readReports } from './unblind.ts';

export function extendFolder(folder: Folder, request: { lesson: string; generator: string; count: number; reason: string }, now = new Date()): Extension {
  verifyLock(folder);
  const generator = folder.config.generators.find(each => each.name === request.generator);
  if (!generator) throw Error(`沒有叫「${request.generator}」的生成器`);
  if (!lessonsOf(folder.config, generator).some(each => each.code === request.lesson)) throw Error(`生成器「${generator.name}」沒有跑課「${request.lesson}」`);
  if (!Number.isInteger(request.count) || request.count < 1) throw Error('份數要是 1 以上的整數');
  if (!request.reason.trim()) throw Error('要寫追加的原因');
  const events = readEvents(folder);
  const jobs = planJobs(folder, readFrozenSteps(folder), events);
  const open = jobs.filter(job => !['done', 'invalid', 'failed'].includes(jobState(events, job.key).status));
  if (open.length) throw Error(`還有 ${String(open.length)} 份沒生成完，等都完成再追加：${open.map(job => job.key).join('、')}`);
  const from = Object.fromEntries(folder.config.groups.map(group => [group.name, 1 + Math.max(0, ...jobs.filter(job => job.group === group.name && job.lesson === request.lesson && job.generator === generator.name).map(job => job.copy))]));
  const extension: Extension = { time: now.toISOString(), lesson: request.lesson, generator: generator.name, count: request.count, reason: request.reason.trim(), from, afterBatch: readReports(folder).at(-1)?.batch ?? null };
  appendFileSync(join(folder.root, EXTENSIONS), JSON.stringify(extension) + '\n', 'utf8');
  return extension;
}

/** `npm run rule-test -- extend <測試資料夾> <課> <生成器> <份數> <原因>` */
export function extend(): Promise<void> {
  const [dir, lesson, generator, count, ...reason] = process.argv.slice(3);
  if (!dir || !lesson || !generator || !count || !reason.length) throw Error('用法：npm run rule-test -- extend <測試資料夾> <課> <生成器> <份數> <原因>');
  const extension = extendFolder(openFolder(cliPath(dir, 'rule-test')), { lesson, generator, count: Number(count), reason: reason.join(' ') });
  console.log(`追加了：課 ${extension.lesson}、生成器 ${extension.generator}，每組 ${String(extension.count)} 份${extension.afterBatch === null ? '' : `（在批 ${String(extension.afterBatch)} 解開之後）`}。下一步：generate、check、blind（成為新的一批）。`);
  return Promise.resolve();
}
