// 合併與重播的狀態：hooks.ts（合併進 main 前查 CI）與 roadmap-sync.ts（另一邊帶來的完成列）共用同一個來源（L2 第二輪 N1、第三輪 M1）。
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
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

/**
 * 重播時另一邊的 commit（L2 第三輪 M1）：
 * - 合併：要合併的那些，whole（另一邊的內容整個併進來）；
 * - cherry-pick、rebase：正在套用的那一個；
 * - squash：SQUASH_MSG 列出的 commit 裡沒被其他列出的 commit 包含的（併進來的分支頂端）。
 * 只有合併確定是整個併進來：留下的狀態檔可能是放棄的 squash，不能拿來要求內容。
 */
export function replaySides(root: string, env: NodeJS.ProcessEnv = process.env): { rev: string; whole: boolean }[] {
  const merges = mergeHeads(root, env);
  if (merges.length) return merges.map(rev => ({ rev, whole: true }));
  const picked = ['CHERRY_PICK_HEAD', 'REBASE_HEAD'].flatMap(ref => tryGit(root, ['rev-parse', '--quiet', '--verify', `${ref}^{commit}`]) ?? []);
  if (picked.length) return picked.map(rev => ({ rev, whole: false }));
  const path = tryGit(root, ['rev-parse', '--git-path', 'SQUASH_MSG']);
  if (path === undefined || !existsSync(resolve(root, path))) return [];
  // Git 寫的 SQUASH_MSG：「Squashed commit of the following:」後面每個 commit 一段「commit <sha>」（2026-11-21 在 Git for Windows 2.52 實測）。
  const listed = [...readFileSync(resolve(root, path), 'utf8').matchAll(/^commit ([0-9a-f]{40,64})$/gm)].map(match => match[1]);
  if (!listed.length) return [];
  const tips = tryGit(root, ['merge-base', '--independent', ...listed]);
  return (tips?.split('\n').filter(Boolean) ?? []).map(rev => ({ rev, whole: false }));
}
