import { execFileSync, spawn } from 'node:child_process';
import { appendFileSync, createWriteStream, existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

/**
 * Claude 直接呼叫本機的 Codex（D-212）：`npm run codex -- <類型> <請求檔> [--note <這一輪的說明>] [--model <模型>] [--effort <等級>] [--confirmed]`。
 * xhigh 或 Astra 會用掉大量額度，沒有 `--confirmed` 就不跑：先問使用者，同意了才加（D-212 第 2 點）。
 * 每次都是新的 Codex session（D-171 第 1 點）。回報存在 `.local/codex/`，Codex 的執行紀錄另存一份 .log，Claude 只讀回報。
 * 跑完印一行 token 與額度，Claude 附在回覆末端（D-212 第 3 點）。
 * CLI 是 Codex App 內附的那一份，路徑隨 App 更新而變，每次用 Get-AppxPackage 找；`CODEX_CLI` 可以指定別的。
 */

interface Preset {
  model: string;
  effort: 'low' | 'medium' | 'high' | 'xhigh';
  /** read-only 不能寫檔；要跑測試重現的類型用 workspace-write（和之前在 Codex App 裡的設定一樣）。 */
  sandbox: 'read-only' | 'workspace-write';
  label: string;
}

/** 模型與推理等級的預設（D-212 第 2 點；依據是 quality.md 各類查核寫的等級與過去的用法）。 */
export const PRESETS = {
  l2: { model: 'gpt-6.2-sol', effort: 'high', sandbox: 'workspace-write', label: 'L2 獨立審查' },
  format: { model: 'gpt-6.2-sol', effort: 'high', sandbox: 'read-only', label: '開工前的格式查核' },
  discuss: { model: 'gpt-6.2-sol', effort: 'high', sandbox: 'read-only', label: '討論稿' },
  milestone: { model: 'gpt-6.2-sol', effort: 'high', sandbox: 'workspace-write', label: '里程碑的回顧與安全檢查' },
  bug: { model: 'gpt-6.2-sol', effort: 'xhigh', sandbox: 'workspace-write', label: 'bug 從頭查' },
  escalate: { model: 'gpt-6.2-astra', effort: 'low', sandbox: 'workspace-write', label: '卡關的最後一步' },
} as const satisfies Record<string, Preset>;

export type Kind = keyof typeof PRESETS;

const isKind = (value: string): value is Kind => Object.hasOwn(PRESETS, value);

interface Overrides { model?: string | undefined; effort?: Preset['effort'] | undefined }

/** 這一輪實際用的模型與等級：預設，加上個別請求的指定。 */
export function resolvePreset(kind: Kind, overrides: Overrides): Preset {
  return { ...PRESETS[kind], ...(overrides.model ? { model: overrides.model } : {}), ...(overrides.effort ? { effort: overrides.effort } : {}) };
}

/** 會用掉大量額度的模式（D-212 第 2 點，使用者 2026-11-19）：推理等級 xhigh，或 Astra 模型（任何等級）。預設或個別指定都算。 */
export function isCostly(preset: Pick<Preset, 'model' | 'effort'>): boolean {
  return preset.effort === 'xhigh' || /astra/i.test(preset.model);
}

export function buildPrompt(kind: Kind, requestFile: string, note?: string): string {
  const preset: Preset = PRESETS[kind];
  const sandbox = preset.sandbox === 'read-only'
    ? '你在唯讀沙箱，不能寫檔；需要寫檔才能重現的，標「待驗證」。'
    : '只回報，不修改 repo 裡追蹤的檔案；要寫檔才能重現時，暫存檔放在系統的暫存資料夾，結束前刪掉；做不到的標「待驗證」。';
  return [
    `你是 Essence 的獨立查核者（${preset.label}）。讀 \`${requestFile}\`，照裡面的請求查核${note ? `；這一輪：${note}` : ''}。`,
    sandbox,
    '用繁體中文。完整的回報（每一項發現與它的證據）放在最後一則訊息，不要只給摘要：呼叫你的程式只保存最後一則。',
  ].join('\n');
}

/** prompt 從 stdin 給（最後的 `-`），避開 Windows 命令列的引號與換行。 */
export function execArgs(preset: Pick<Preset, 'model' | 'effort' | 'sandbox'>, reportFile: string): string[] {
  return [
    'exec', '--sandbox', preset.sandbox, '-m', preset.model,
    '-c', `model_reasoning_effort="${preset.effort}"`,
    // 沒有人可以按核准；需要提權的指令直接失敗、照實回報，不卡住等待。
    '-c', 'approval_policy="never"',
    '-o', reportFile, '-',
  ];
}

export function sessionIdFromLog(log: string): string | undefined {
  return /session id:\s*([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i.exec(log)?.[1];
}

interface Window { usedPercent: number; resetsAt: number }
export interface Usage { tokens: number; fiveHour?: Window; weekly?: Window }

interface RateWindow { used_percent?: number; window_minutes?: number; resets_at?: number }
interface TokenCount {
  info?: { total_token_usage?: { input_tokens?: number; cached_input_tokens?: number; output_tokens?: number } } | null;
  rate_limits?: { primary?: RateWindow | null; secondary?: RateWindow | null } | null;
}

/** 讀 Codex session 紀錄（rollout）最後一筆 token_count：token 數和 CLI 印的「tokens used」相同（輸入扣掉快取，加上輸出）。 */
export function usageFromRollout(text: string): Usage | undefined {
  let last: TokenCount | undefined;
  for (const line of text.split('\n')) {
    if (!line.includes('"token_count"')) continue;
    try {
      const event = JSON.parse(line) as { payload?: TokenCount & { type?: string } };
      if (event.payload?.type === 'token_count' && event.payload.info) last = event.payload;
    } catch { /* 寫到一半的行 */ }
  }
  const total = last?.info?.total_token_usage;
  if (!total) return undefined;
  const usage: Usage = { tokens: (total.input_tokens ?? 0) - (total.cached_input_tokens ?? 0) + (total.output_tokens ?? 0) };
  for (const window of [last?.rate_limits?.primary, last?.rate_limits?.secondary]) {
    if (window?.used_percent === undefined || window.resets_at === undefined) continue;
    const value = { usedPercent: window.used_percent, resetsAt: window.resets_at };
    if (window.window_minutes === 300) usage.fiveHour = value;
    else if (window.window_minutes === 10080) usage.weekly = value;
  }
  return usage;
}

function resetTime(epochSeconds: number, timeZone?: string): string {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('zh-TW', {
    timeZone, month: 'numeric', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(epochSeconds * 1000)).map((part) => [part.type, part.value]));
  return `${parts.month ?? ''}/${parts.day ?? ''} ${parts.weekday ?? ''} ${parts.hour ?? ''}:${parts.minute ?? ''}`;
}

const remaining = (window: Window): string => `${String(Math.max(0, Math.round(100 - window.usedPercent)))}%`;

/** 附在回覆末端的一行，例如「Codex 本輪：6,395 token｜5 小時額度剩 67%｜週額度剩 40%（11/23 週一 08:37 重置）」。 */
export function usageLine(usage: Usage, timeZone?: string): string {
  const parts = [`Codex 本輪：${usage.tokens.toLocaleString('en-US')} token`];
  if (usage.fiveHour) parts.push(`5 小時額度剩 ${remaining(usage.fiveHour)}`);
  if (usage.weekly) parts.push(`週額度剩 ${remaining(usage.weekly)}（${resetTime(usage.weekly.resetsAt, timeZone)} 重置）`);
  return parts.join('｜');
}

/** usage.jsonl（每輪跑完寫一行）裡最後一筆有週額度的紀錄。 */
export function lastWeekly(jsonl: string): Window | undefined {
  for (const line of jsonl.split('\n').reverse()) {
    try {
      const weekly = (JSON.parse(line) as Partial<Usage>).weekly;
      if (weekly) return weekly;
    } catch { /* 空行或寫到一半的行 */ }
  }
  return undefined;
}

/** 沒有 --confirmed 時印的訊息：Claude 照這段問使用者，同意了才加 --confirmed 重跑。 */
export function confirmationMessage(kind: Kind, preset: Pick<Preset, 'model' | 'effort'>, weekly?: Window, now = Date.now(), timeZone?: string): string {
  const quota = !weekly ? '讀不到之前記錄的週額度。'
    : weekly.resetsAt * 1000 <= now ? '上一輪記錄的週額度已經過了重置時間。'
      : `上一輪記錄的週額度剩 ${remaining(weekly)}（${resetTime(weekly.resetsAt, timeZone)} 重置）。`;
  return `這一輪是${PRESETS[kind].label}，用 ${preset.model}、${preset.effort}，會用掉大量額度（D-212 第 2 點）：先問使用者，同意了再加 --confirmed 重跑。${quota}`;
}

function findCodexCli(): string {
  if (process.env.CODEX_CLI) return process.env.CODEX_CLI;
  if (process.platform !== 'win32') return 'codex';
  let location = '';
  try {
    location = execFileSync('powershell.exe', ['-NoProfile', '-Command', '(Get-AppxPackage -Name OpenAI.Codex).InstallLocation'], {
      encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'],
    }).split(/\r?\n/).find((line) => line.trim())?.trim() ?? '';
  } catch { /* 下面一起報 */ }
  const cli = join(location, 'app', 'resources', 'codex.exe');
  if (!location || !existsSync(cli)) throw Error('找不到 Codex App 內附的 CLI（Get-AppxPackage OpenAI.Codex）；這一輪照舊請使用者手貼（quality.md〈高風險範圍〉）');
  return cli;
}

/** session 紀錄放在 sessions/YYYY/MM/DD（開始那天的本機日期）；跨午夜時找前一天。 */
function findRollout(sessionId: string, started: Date): string | undefined {
  const base = join(process.env.CODEX_HOME ?? join(homedir(), '.codex'), 'sessions');
  for (const day of [started, new Date(started.getTime() - 86_400_000)]) {
    const dir = join(base, String(day.getFullYear()), String(day.getMonth() + 1).padStart(2, '0'), String(day.getDate()).padStart(2, '0'));
    if (!existsSync(dir)) continue;
    const name = readdirSync(dir).find((file) => file.endsWith(`${sessionId}.jsonl`));
    if (name) return join(dir, name);
  }
  return undefined;
}

const gitStatus = (root: string): string => {
  try { return execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8', windowsHide: true }); } catch { return ''; }
};

function changedPaths(before: string, after: string): string[] {
  const seen = new Set(before.split('\n'));
  return after.split('\n').filter((line) => line && !seen.has(line));
}

interface RunOptions extends Overrides { note: string | undefined; confirmed: boolean }

async function run(kind: Kind, requestFile: string, options: RunOptions): Promise<number> {
  const root = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8', windowsHide: true }).trim();
  if (!existsSync(join(root, requestFile))) throw Error(`找不到請求檔：${requestFile}（相對 repo 根目錄）`);
  const preset = resolvePreset(kind, options);
  const dir = join(root, '.local', 'codex');
  if (isCostly(preset) && !options.confirmed) {
    const usageFile = join(dir, 'usage.jsonl');
    throw Error(confirmationMessage(kind, preset, existsSync(usageFile) ? lastWeekly(readFileSync(usageFile, 'utf8')) : undefined));
  }
  mkdirSync(dir, { recursive: true });
  const started = new Date();
  const stamp = started.toISOString().replace(/[:.]/g, '-');
  const report = join(dir, `${stamp}-${kind}.md`);
  const logFile = join(dir, `${stamp}-${kind}.log`);
  const before = gitStatus(root);

  const log = createWriteStream(logFile);
  const child = spawn(findCodexCli(), execArgs(preset, report), { cwd: root, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
  // 兩條都接到同一個檔：不讓先結束的那條把檔案關掉。
  child.stdout.pipe(log, { end: false });
  child.stderr.pipe(log, { end: false });
  child.stdin.end(buildPrompt(kind, requestFile, options.note));
  const code = await new Promise<number>((done) => {
    child.on('error', (error) => { log.write(`\n${error.message}\n`); done(1); });
    child.on('close', (exit) => { done(exit ?? 1); });
  });
  await new Promise<void>((done) => { log.end(() => { done(); }); });

  const sessionId = sessionIdFromLog(readFileSync(logFile, 'utf8'));
  const rollout = sessionId ? findRollout(sessionId, started) : undefined;
  const usage = rollout ? usageFromRollout(readFileSync(rollout, 'utf8')) : undefined;
  const seconds = Math.round((Date.now() - started.getTime()) / 1000);
  appendFileSync(join(dir, 'usage.jsonl'), `${JSON.stringify({ at: started.toISOString(), kind, model: preset.model, effort: preset.effort, seconds, exit: code, sessionId, ...usage })}\n`);

  const changed = changedPaths(before, gitStatus(root));
  console.log(`類型：${preset.label}（${preset.model}、${preset.effort}、${preset.sandbox}），${String(seconds)} 秒，exit ${String(code)}`);
  console.log(`回報：${existsSync(report) ? report : '（沒有產生）'}`);
  console.log(`執行紀錄：${logFile}`);
  if (changed.length) console.log(`執行期間 git status 多了這些（可能是 Codex 或別的 session 改的，請核對）：\n${changed.join('\n')}`);
  console.log(usage ? usageLine(usage) : 'Codex 本輪：讀不到 token 與額度（找不到 session 紀錄）');
  return code === 0 && existsSync(report) ? 0 : 1;
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const confirmedAt = args.indexOf('--confirmed');
  if (confirmedAt >= 0) args.splice(confirmedAt, 1);
  const flag = (name: string): string | undefined => {
    const at = args.indexOf(name);
    if (at < 0) return undefined;
    const [value] = args.splice(at, 2).slice(1);
    return value;
  };
  const note = flag('--note');
  const model = flag('--model');
  const effort = flag('--effort');
  const [kind, requestFile] = args;
  const efforts = ['low', 'medium', 'high', 'xhigh'] as const;
  const isEffort = (value: string): value is Preset['effort'] => (efforts as readonly string[]).includes(value);
  const effortValue = effort !== undefined && isEffort(effort) ? effort : undefined;
  if (!kind || !isKind(kind) || !requestFile || (effort !== undefined && !effortValue)) {
    console.error(`用法：npm run codex -- <${Object.keys(PRESETS).join('|')}> <請求檔> [--note <這一輪的說明>] [--model <模型>] [--effort <${efforts.join('|')}>] [--confirmed]`);
    process.exitCode = 1;
  } else {
    try {
      process.exitCode = await run(kind, requestFile, { note, model, effort: effortValue, confirmed: confirmedAt >= 0 });
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    }
  }
}
