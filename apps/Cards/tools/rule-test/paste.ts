// 比較測試工具：paste（任務說明 tasks/rule-test-tool.md §5-4 手貼）。把剪貼簿（或 --file 指定的檔）存成手貼那一份的那一步。
import { readFileSync } from 'node:fs';
import { cliPath } from '../cli-path.ts';
import { readClipboard } from './clipboard.ts';
import { openFolder } from './folder.ts';
import { readFrozenSteps, verifyLock } from './freeze.ts';
import { savePasted } from './generate.ts';
import { planJobs, readEvents } from './jobs.ts';

/** Windows 的剪貼簿（探針 P9）。 */
async function clipboard(): Promise<string> {
  if (process.platform !== 'win32') throw Error('這台不是 Windows，讀不了剪貼簿；用 --file <檔> 指定貼回的內容');
  return readClipboard();
}

/** `npm run rule-test -- paste <測試資料夾> <工作> [<步>] [--file <檔>]` */
export async function paste(): Promise<void> {
  const list = process.argv.slice(3);
  const fileAt = list.indexOf('--file');
  const file = fileAt >= 0 ? list[fileAt + 1] : undefined;
  const [dir, key, stepText] = list.filter((_, i) => fileAt < 0 || (i !== fileAt && i !== fileAt + 1));
  if (!dir || !key) throw Error('用法：npm run rule-test -- paste <測試資料夾> <工作> [<步>] [--file <檔>]');
  const folder = openFolder(cliPath(dir, 'rule-test'));
  verifyLock(folder);
  const job = planJobs(folder, readFrozenSteps(folder), readEvents(folder)).find(each => each.key === key);
  if (!job) throw Error(`沒有叫「${key}」的工作（名字看 生成/手貼/ 的檔名）`);
  if (job.kind !== 'manual') throw Error(`${key} 不是手貼的工作`);
  const reply = (file === undefined ? await clipboard() : readFileSync(cliPath(file, 'rule-test'), 'utf8')).replace(/\r\n?/g, '\n');
  for (const note of savePasted(folder, job, stepText === undefined ? 1 : Number(stepText), reply)) console.log(note);
}
