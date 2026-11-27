// Claude Code SessionStart hook：main 最近一次跑完的 GitHub Actions 沒通過就提醒（第一個里程碑回顧的 R1：CI 在 main 紅了三天沒人發現）。
// 看兩支 workflow：Check（CI），與 Progress board（進度白板發布失敗時白板停在舊版，曾停 25 小時沒人發現，D-245 第 4 點）。
// 只讀不寫；gh 不能用、沒登入或離線時安靜結束，不擋 session。兩支同時查，各自最多 10 秒。
import { execFile } from 'node:child_process';

/** 每支 workflow 算沒通過的結果。Check 被取消也算：被取消的 run 證明不了 main 是綠的（D-208 第一步 §4：要跑的 job 被取消時 gate 不一定跑完）。
 *  白板被取消不算：同一時間只發布一次，新的 push 取消舊的是正常的，最新的那次會發布。 */
const WATCHED = [
  { file: 'check.yml', name: 'CI（Check）', bad: ['failure', 'timed_out', 'startup_failure', 'cancelled'],
    fix: '開始其他工作前先用 gh run view <id> --log-failed 看原因：能修就修，不能修就告訴使用者（docs/agents/quality.md〈檢查指令〉）。' },
  { file: 'progress-board.yml', name: '進度白板的發布（Progress board）', bad: ['failure', 'timed_out', 'startup_failure'],
    fix: '白板停在舊版：先用 gh run view <id> --log-failed 看原因；是 GitHub 的暫時錯誤就重跑（gh workflow run progress-board.yml --ref main，或 GitHub 工具觸發 workflow_dispatch），不是就告訴使用者。' },
];

/** 這支 workflow 在 main 最近一次跑完的 run；查不到時回傳 undefined。 */
function latest(file) {
  return new Promise(resolve => {
    execFile('gh', ['run', 'list', '--branch', 'main', '--workflow', file, '--status', 'completed', '--limit', '1', '--json', 'conclusion,headSha,displayTitle,url,createdAt'], {
      cwd: process.env.CLAUDE_PROJECT_DIR || process.cwd(), encoding: 'utf8', timeout: 10000, windowsHide: true,
    }, (error, stdout) => {
      if (error) return resolve(undefined);
      try {
        const runs = JSON.parse(stdout);
        resolve(Array.isArray(runs) ? runs[0] : undefined);
      } catch { resolve(undefined); }
    });
  });
}

const failed = (await Promise.all(WATCHED.map(async watched => ({ watched, run: await latest(watched.file) }))))
  .filter(({ watched, run }) => run && watched.bad.includes(run.conclusion));
if (!failed.length) process.exit(0);
const context = failed.map(({ watched, run }) => `${watched.name}在 main 最近一次跑完沒通過（${run.conclusion}）：${String(run.headSha).slice(0, 7)}「${run.displayTitle}」，${run.createdAt}，${run.url}。${watched.fix}`).join('\n');
console.log(JSON.stringify({
  systemMessage: failed.map(({ watched, run }) => `${watched.name}在 main 沒通過：${run.url}`).join('；'),
  hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: context },
}));
