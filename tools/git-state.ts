// 合併與重播的狀態：hooks.ts（合併進 main 前查 CI）與 roadmap-sync.ts（另一邊帶來的完成列）共用同一個來源（L2 第二輪 N1）。
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const tryGit = (root: string, args: string[]) => {
  try {
    return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return undefined;
  }
};

/** 合併的 commit：Git 把要合併的放在 GITHEAD_<sha> 環境變數（pre-merge-commit 執行時還沒有 MERGE_HEAD；2026-11-12 在 Git for Windows 實測）。 */
export function mergeHeads(root: string, env: NodeJS.ProcessEnv = process.env): string[] {
  const heads = Object.keys(env).flatMap(key => /^GITHEAD_([0-9a-f]{40,64})$/i.exec(key)?.[1].toLowerCase() ?? []);
  if (heads.length) return heads;
  const head = tryGit(root, ['rev-parse', '--quiet', '--verify', 'MERGE_HEAD']);
  return head ? [head] : [];
}

/**
 * 正在把別處已經 commit 的內容再 commit 一次：合併（含解完衝突後的 git commit）、squash、cherry-pick、rebase 與 git am。
 * 這時 commit 裡的完成列是另一邊收尾那天寫的（L2 第二輪 N1、N4）。
 */
export function replaying(root: string, env: NodeJS.ProcessEnv = process.env): boolean {
  if (mergeHeads(root, env).length) return true;
  if (['CHERRY_PICK_HEAD', 'REBASE_HEAD'].some(ref => tryGit(root, ['rev-parse', '--quiet', '--verify', ref]) !== undefined)) return true;
  return ['SQUASH_MSG', 'rebase-merge', 'rebase-apply'].some(name => {
    const path = tryGit(root, ['rev-parse', '--git-path', name]);
    return path !== undefined && existsSync(resolve(root, path));
  });
}
