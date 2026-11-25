// 比較測試工具：開 AI 對話的轉接器（任務說明 tasks/rule-test-tool.md §7）。每一步一個呼叫：新對話或接著同一個對話（resume），
// 結果分成 ok、失敗、逾時、額度用完與 fatal（沒登入、隔離沒生效、找不到 CLI：重試也沒用，整個佇列停下）。
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { findClaude, findCodex, type Cli } from './clis.ts';
import { runProcess } from './proc.ts';
import { parseStream, userMessage } from './stream.ts';

export interface StepRequest {
  text: string;
  /** 這個對話的第一步才附教材（PDF 當附件，§5-4）；之後是 null。 */
  pdf: Buffer | null;
  /** 接著哪個對話；新對話是 null。 */
  resume: string | null;
  model: string;
  effort: string;
  systemPrompt: string | null;
  /** 空的暫存資料夾（隔離，§7）；評審是那個區組資料夾的複本。 */
  cwd: string;
  /** 開哪些工具：生成不開（''），評審只開 Read（讀 cwd 裡的檔）。Codex 一律唯讀沙箱，不看這一欄。 */
  tools?: '' | 'Read';
  /** 要照這個 JSON schema 交（評審，§5-7）；回覆的 structured 是解析好的物件。 */
  jsonSchema?: string | null;
  timeoutMs: number;
  /** CLI 的原始輸出（對話紀錄）。 */
  record: (stdout: string, stderr: string) => void;
}

interface Usage { ms: number; costUsd?: number; usage?: Record<string, unknown>; models: string[] }
export type StepResult =
  | ({ kind: 'ok'; reply: string; session: string | null; warnings: string[]; structured?: unknown } & Usage)
  | { kind: 'fail' | 'timeout' | 'fatal'; message: string }
  | { kind: 'quota'; message: string; resetsAt?: number };

export type Adapter = (request: StepRequest) => Promise<StepResult>;

/** 用量或額度用完的回覆（rate_limit_event 沒有送來時的退路，§5-4）。 */
const QUOTA_TEXT = /usage limit|limit reached|rate limit|額度/i;
const LOGIN_TEXT = /not logged in|please run \/login/i;

/**
 * 開頭事件裡可以有的工具：評審開的 Read，加上照 schema 交時 CLI 自己多開的 StructuredOutput
 * （探針 P4；2026-11-25 使用者電腦的 judge：開頭事件是 Read、StructuredOutput，沒列進來時每位 claude 評審交完都被判 fatal）。
 */
export const allowedTools = (tools: '' | 'Read' | undefined, jsonSchema: boolean): string[] => [...tools === 'Read' ? ['Read'] : [], ...jsonSchema ? ['StructuredOutput'] : []];

/** claude -p：safe-mode、不開工具與 MCP、stream-json 進出（PDF 當附件），探針 P1～P5 驗過的參數。 */
export function claudeAdapter(find: () => Cli = findClaude): Adapter {
  let cli: Cli | null = null;
  return async request => {
    try { cli ??= find(); } catch (error) { return { kind: 'fatal', message: error instanceof Error ? error.message : String(error) }; }
    const args = [
      ...cli.prefix, '-p', '--safe-mode', '--strict-mcp-config', '--output-format', 'stream-json', '--verbose', '--input-format', 'stream-json',
      '--model', request.model, '--effort', request.effort, '--tools', request.tools ?? '',
      ...request.tools === 'Read' ? ['--allowedTools', 'Read'] : [],
      ...request.jsonSchema ? ['--json-schema', request.jsonSchema] : [],
      ...request.resume ? ['--resume', request.resume] : [],
      ...request.systemPrompt ? ['--system-prompt', request.systemPrompt] : [],
    ];
    const result = await runProcess(cli.command, args, { cwd: request.cwd, input: userMessage(request.text, request.pdf?.toString('base64')), timeoutMs: request.timeoutMs });
    request.record(result.stdout, result.stderr);
    if (result.error) return { kind: 'fatal', message: `開不起來：${result.error}` };
    if (result.timedOut) return { kind: 'timeout', message: `超過 ${String(Math.round(request.timeoutMs / 60000))} 分鐘` };
    const run = parseStream(result.stdout);
    const text = run.result?.text ?? '';
    if (run.rateLimit?.status === 'rejected') return { kind: 'quota', message: text.slice(0, 200) || '額度用完', resetsAt: run.rateLimit.resetsAt };
    if (LOGIN_TEXT.test(text)) return { kind: 'fatal', message: 'claude 沒有登入（在終端機執行 claude 登入）' };
    const allowed = allowedTools(request.tools, Boolean(request.jsonSchema));
    if (run.init && (run.init.tools.some(tool => !allowed.includes(tool)) || run.init.mcpServers.length)) return { kind: 'fatal', message: `隔離沒生效：工具 ${String(run.init.tools.length)} 個、MCP ${String(run.init.mcpServers.length)} 個` };
    if (!run.result) return { kind: 'fail', message: `沒有 result（exit ${String(result.code)}）：${result.stderr.slice(0, 300)}` };
    if (run.result.isError) return QUOTA_TEXT.test(text) ? { kind: 'quota', message: text.slice(0, 200) } : { kind: 'fail', message: `${run.result.subtype ?? 'error'}：${text.slice(0, 300)}` };
    const warnings = run.result.models.length && !run.result.models.some(model => model.startsWith(request.model)) ? [`用的模型是 ${run.result.models.join('、')}，不是 ${request.model}`] : [];
    return { kind: 'ok', reply: text, session: run.result.sessionId ?? null, warnings, ms: run.result.durationMs ?? result.ms, costUsd: run.result.costUsd, usage: run.result.usage, models: run.result.models, ...request.jsonSchema ? { structured: run.result.structured } : {} };
  };
}

/** 從回覆裡讀 JSON（Codex 的 -o 檔；外層可能包了程式碼框）；讀不出來是 undefined。 */
export function parseJsonReply(text: string): unknown {
  const body = text.trim().replace(/^```\w*\n/, '').replace(/\n```$/, '');
  try { return JSON.parse(body); } catch { return undefined; }
}

/**
 * codex exec（探針 P6 驗過的參數）：repo 外、唯讀沙箱、不問核准；提示從 stdin，回覆從 -o 的檔讀；接著同一個對話用 `exec resume`。
 * Codex 自己讀 cwd 裡的檔（教材.pdf 也是），不收附件。
 */
export function codexAdapter(find: () => Cli = findCodex): Adapter {
  let cli: Cli | null = null;
  return async request => {
    try { cli ??= find(); } catch (error) { return { kind: 'fatal', message: error instanceof Error ? error.message : String(error) }; }
    const work = mkdtempSync(join(tmpdir(), 'rule-test-codex-'));
    try {
      const out = join(work, 'out.txt'), schema = join(work, 'schema.json');
      if (request.jsonSchema) writeFileSync(schema, request.jsonSchema, 'utf8');
      const args = request.resume
        ? [...cli.prefix, 'exec', '-o', out, '--skip-git-repo-check', 'resume', request.resume, '-']
        : [...cli.prefix, 'exec', '--skip-git-repo-check', '-C', request.cwd, '--sandbox', 'read-only', '-m', request.model,
          '-c', `model_reasoning_effort="${request.effort}"`, '-c', 'approval_policy="never"', ...request.jsonSchema ? ['--output-schema', schema] : [], '-o', out, '-'];
      const result = await runProcess(cli.command, args, { cwd: request.cwd, input: request.text, timeoutMs: request.timeoutMs });
      request.record(result.stdout, result.stderr);
      if (result.error) return { kind: 'fatal', message: `開不起來：${result.error}` };
      if (result.timedOut) return { kind: 'timeout', message: `超過 ${String(Math.round(request.timeoutMs / 60000))} 分鐘` };
      const all = `${result.stdout}\n${result.stderr}`;
      if (result.code !== 0) {
        if (QUOTA_TEXT.test(all)) return { kind: 'quota', message: all.slice(-300) };
        if (/not logged in|codex login/i.test(all)) return { kind: 'fatal', message: 'codex 沒有登入' };
        return { kind: 'fail', message: `exit ${String(result.code)}：${result.stderr.slice(-300)}` };
      }
      const reply = existsSync(out) ? readFileSync(out, 'utf8') : '';
      const session = /session id:\s*([0-9a-f-]{36})/i.exec(all)?.[1] ?? request.resume;
      return { kind: 'ok', reply, session, warnings: [], ms: result.ms, models: [request.model], ...request.jsonSchema ? { structured: parseJsonReply(reply) } : {} };
    } finally { rmSync(work, { recursive: true, force: true }); }
  };
}
