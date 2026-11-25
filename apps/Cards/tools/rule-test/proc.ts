// 比較測試工具：開子行程（任務說明 tasks/rule-test-tool.md §7）。提示從 stdin 給，避開 Windows 命令列的引號與長度；
// 到了上限就結束整個子行程樹（Windows 用 taskkill /T /F，其他用行程群組），記成逾時、不讀晚到的輸出。
import { execFile, spawn } from 'node:child_process';

export interface RunResult {
  /** 結束碼；被結束或沒有正常結束時是 null。 */
  code: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  /** 開不起來（例如找不到程式）時的訊息。 */
  error?: string;
  ms: number;
}

export interface RunOptions {
  cwd: string;
  input?: string;
  timeoutMs: number;
  env?: NodeJS.ProcessEnv;
  /** 每收到一段 stdout 就呼叫（寫進度用）；不影響回傳的 stdout。 */
  onStdout?: (chunk: string) => void;
}

/** 結束整個子行程樹；行程已經不在時不算錯。 */
function killTree(pid: number, platform: NodeJS.Platform = process.platform): Promise<void> {
  return new Promise(done => {
    if (platform === 'win32') {
      execFile('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true }, () => { done(); });
      return;
    }
    try { process.kill(-pid, 'SIGKILL'); } catch { /* 行程群組已經不在 */ }
    try { process.kill(pid, 'SIGKILL'); } catch { /* 已經不在 */ }
    done();
  });
}

/** 跑一個命令到結束或逾時。逾時時結束整棵樹，等 close 事件之後才回傳，所以回傳後不會再有輸出寫進來。 */
export function runProcess(command: string, args: readonly string[], options: RunOptions): Promise<RunResult> {
  const started = Date.now();
  return new Promise(resolve => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env ?? process.env,
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
      // 非 Windows：自己一個行程群組，逾時時整群結束。
      detached: process.platform !== 'win32',
    });
    const out: Buffer[] = [], err: Buffer[] = [];
    let timedOut = false, failed: string | undefined, settled = false;
    const finish = (code: number | null): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        code: timedOut ? null : code,
        stdout: Buffer.concat(out).toString('utf8'),
        stderr: Buffer.concat(err).toString('utf8'),
        timedOut,
        ...failed === undefined ? {} : { error: failed },
        ms: Date.now() - started,
      });
    };
    const timer = setTimeout(() => {
      timedOut = true;
      if (child.pid !== undefined) void killTree(child.pid);
    }, options.timeoutMs);
    child.stdout.on('data', (chunk: Buffer) => { out.push(chunk); options.onStdout?.(chunk.toString('utf8')); });
    child.stderr.on('data', (chunk: Buffer) => { err.push(chunk); });
    child.on('error', error => { failed = error.message; finish(null); });
    child.on('close', code => { finish(code); });
    // 子行程不讀 stdin 就結束時，寫入會 EPIPE；照樣等 close。
    child.stdin.on('error', () => { /* 子行程先關了 stdin */ });
    child.stdin.end(options.input ?? '');
  });
}
