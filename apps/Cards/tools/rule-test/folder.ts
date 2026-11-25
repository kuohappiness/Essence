// 比較測試工具：測試資料夾的位置與「凍結過的檔不覆蓋」（任務說明 tasks/rule-test-tool.md §4-1、§5 開頭）。
import { createHash } from 'node:crypto';
import { constants, copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { readConfig, type Config, type LessonConfig } from './config.ts';
import { REPO_ROOT } from './prompts.ts';

export interface Folder { root: string; config: Config; configText: string }

/** 在 repo 裡（repo 是公開的，D-003）：測試資料夾與課庫都要放在使用者電腦的 repo 外面（§3、§8 第 6 條）。 */
export function insideRepo(path: string, repo = REPO_ROOT): boolean {
  const rel = relative(resolve(repo), resolve(path));
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}
const outside = (path: string, what: string): void => {
  if (insideRepo(path)) throw Error(`${what}在 repo 裡（${path}）：教材、原稿與分數是私人資料，放到 repo 外面`);
};

export function openFolder(root: string): Folder {
  outside(root, '測試資料夾');
  const file = join(root, '測試.yaml');
  if (!existsSync(file)) throw Error(`${root} 沒有 測試.yaml（先跑 init）`);
  const configText = readFileSync(file, 'utf8');
  const folder = { root, config: readConfig(configText), configText };
  outside(libraryOf(folder), '課庫');
  return folder;
}

export const libraryOf = (folder: Folder): string => resolve(folder.root, folder.config.library);
export const lessonDir = (folder: Folder, lesson: LessonConfig): string => join(libraryOf(folder), lesson.code);
export const materialOf = (folder: Folder, lesson: LessonConfig): string => join(lessonDir(folder, lesson), '教材.pdf');
export const rubricOf = (folder: Folder, lesson: LessonConfig): string => join(lessonDir(folder, lesson), '評分表.md');

export const sha256File = (path: string): string => createHash('sha256').update(readFileSync(path)).digest('hex');
export const sha256Text = (text: string): string => createHash('sha256').update(text, 'utf8').digest('hex');

/**
 * 複製整個資料夾，已經有的檔不覆蓋。不用 cpSync 的 recursive：Windows 上 Node 24.13 的來源或目的地路徑有中文時，
 * 整個行程直接結束（2026-11-25 使用者電腦，exit 0xC0000409、stderr 是空的）；一個個檔的 copyFileSync 沒事。eslint 擋 cpSync。
 */
export function copyDir(from: string, to: string): void {
  mkdirSync(to, { recursive: true });
  for (const entry of readdirSync(from, { withFileTypes: true })) {
    if (entry.isDirectory()) copyDir(join(from, entry.name), join(to, entry.name));
    else copyFileSync(join(from, entry.name), join(to, entry.name), constants.COPYFILE_EXCL);
  }
}

/**
 * 寫一份凍結的檔：不存在就建（含上層資料夾）；已經有而且一樣就跳過；不一樣就停下並說是哪個檔（重跑安全，§5 開頭）。
 * 回傳 true 是這次新寫的。
 */
export function writeOnce(path: string, content: string | Uint8Array): boolean {
  const bytes = typeof content === 'string' ? Buffer.from(content, 'utf8') : Buffer.from(content);
  if (existsSync(path)) {
    if (Buffer.compare(readFileSync(path), bytes) === 0) return false;
    throw Error(`${path} 已經有了、內容不同；凍結過的檔不覆蓋（要重來請開新的測試資料夾）`);
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, bytes, { flag: 'wx' });
  return true;
}
