// 比較測試工具：status（任務說明 tasks/rule-test-tool.md §5）。每一步、每一批做到哪裡、缺什麼；背景工作在不在跑、為什麼停。
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cliPath } from '../cli-path.ts';
import { batchDir, batchNumbers, readBlocks } from './blind.ts';
import { readFormat } from './check.ts';
import { openFolder, type Folder } from './folder.ts';
import { readFrozenSteps, readLock } from './freeze.ts';
import { resultFile } from './judge.ts';
import { readReports } from './unblind.ts';
import { jobState, planJobs, readEvents, readExtensions, type JobState } from './jobs.ts';

export function statusLines(folder: Folder): string[] {
  const lines: string[] = [`測試：${folder.config.name}`];
  const say = (value: unknown): string => typeof value === 'string' ? value : JSON.stringify(value ?? '');
  const lock = readLock(folder);
  if (!lock) return [...lines, '凍結：還沒（下一步：freeze）'];
  lines.push(`凍結：${lock.time}，commit ${lock.commit.slice(0, 8)}`);

  const events = readEvents(folder);
  const jobs = planJobs(folder, readFrozenSteps(folder), events);
  const states = new Map<string, JobState>(jobs.map(job => [job.key, jobState(events, job.key)]));
  const count = (status: JobState['status']): number => [...states.values()].filter(state => state.status === status).length;
  lines.push(`生成：${String(jobs.length)} 份｜完成 ${String(count('done'))}、無效 ${String(count('invalid'))}、跑中 ${String(count('running'))}、待跑 ${String(count('pending') + count('retry'))}、放棄 ${String(count('failed'))}`);
  for (const each of readExtensions(folder)) lines.push(`  追加：${each.time.slice(0, 10)} 課 ${each.lesson}、${each.generator} 每組 ${String(each.count)} 份（${each.reason}${each.afterBatch === null ? '' : `；批 ${String(each.afterBatch)} 解開之後`}）`);
  for (const generator of folder.config.generators) {
    const mine = jobs.filter(job => job.generator === generator.name);
    const open = mine.filter(job => !['done', 'invalid'].includes(states.get(job.key)!.status));
    if (open.length) lines.push(`  ${generator.name}：還沒完成 ${open.map(job => `${job.key}（${states.get(job.key)!.status}）`).join('、')}`);
  }
  const running = join(folder.root, '生成', '執行中.json');
  if (existsSync(running)) {
    const held = JSON.parse(readFileSync(running, 'utf8')) as { pid: number; started: string };
    lines.push(`背景行程：${String(held.pid)}（${held.started} 開始）`);
  }
  const stop = events.filter(event => event.type === 'stop').at(-1);
  const after = stop ? events.slice(events.lastIndexOf(stop) + 1).some(event => event.type === 'start') : true;
  if (stop && !after) {
    const resets = typeof stop.detail?.resetsAt === 'number' ? `，額度約在 ${new Date(stop.detail.resetsAt * 1000).toISOString()} 重置` : '';
    const quota = events.filter(event => event.type === 'quota').at(-1);
    lines.push(`上一次停下：${say(stop.detail?.reason)}（${stop.t}）${resets || (quota && typeof quota.detail?.resetsAt === 'number' ? `，額度約在 ${new Date(quota.detail.resetsAt * 1000).toISOString()} 重置` : '')}`);
  }
  const failed = jobs.filter(job => states.get(job.key)!.status === 'failed');
  for (const job of failed) lines.push(`  放棄：${job.key}：${say(states.get(job.key)!.last?.detail?.message)}（看過原因要再試：generate --retry）`);

  const finished = jobs.filter(job => ['done', 'invalid'].includes(states.get(job.key)!.status));
  const unchecked = finished.filter(job => readFormat(folder, job) === null);
  lines.push(`格式：${String(finished.length - unchecked.length)}／${String(finished.length)} 份檢查過${unchecked.length ? '（下一步：check）' : ''}`);

  const batches = batchNumbers(folder);
  if (!batches.length) lines.push('匿名：還沒（生成都完成後：blind）');
  const unblinded = new Set(readReports(folder).map(report => report.batch));
  for (const n of batches) {
    const blocks = readBlocks(folder, n);
    const decks = new Set(blocks.flatMap(block => block.codes.map(code => `${block.lesson}/${code}`))).size;
    const dir = batchDir(folder, n);
    const judged = blocks.flatMap(block => folder.config.judges.filter(judge => existsSync(resultFile(folder, n, judge.name, block.name)))).length;
    const state = unblinded.has(n) ? '已解開（結果/）'
      : existsSync(join(dir, '裁定.md')) ? '已裁定（教學選擇填好後：unblind）'
        : existsSync(join(dir, '鎖定.md')) ? '已鎖定（下一步：disputes）'
          : `評分 ${String(judged)}／${String(blocks.length * folder.config.judges.length)}（下一步：judge）`;
    lines.push(`批 ${String(n)}：${String(decks)} 份、${String(blocks.length)} 個區組｜${state}`);
    const judging = readEvents(folder, join('評分', `批${String(n)}`, '事件.jsonl'));
    for (const key of new Set(judging.flatMap(event => event.job ?? []))) {
      const each = jobState(judging, key);
      if (each.status === 'failed') lines.push(`  放棄：${key}：${say(each.last?.detail?.message)}（看過原因要再試：judge --retry）`);
    }
  }
  return lines;
}

/** `npm run rule-test -- status <測試資料夾>` */
export function status(): Promise<void> {
  const dir = process.argv[3];
  if (!dir) throw Error('用法：npm run rule-test -- status <測試資料夾>');
  for (const line of statusLines(openFolder(cliPath(dir, 'rule-test')))) console.log(line);
  return Promise.resolve();
}
