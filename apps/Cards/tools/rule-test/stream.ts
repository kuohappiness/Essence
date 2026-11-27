// 比較測試工具：讀 `claude -p --output-format stream-json` 的輸出（任務說明 §7）。一行一個 JSON 事件；
// 開頭的 system/init 列出實際的工具、MCP 與模型（隔離的機械證據），最後的 result 有回覆、用量與 session ID。
// 回覆碰到模型的輸出上限時，CLI 自己接著要，同一次會有好幾則 assistant 的文字，result 只放最後一則（規則循環第一輪 §5）。

interface ToolUse { name: string; input: Record<string, unknown> }

export interface ClaudeRun {
  init: { model?: string; tools: string[]; mcpServers: string[]; cwd?: string; raw: Record<string, unknown> } | null;
  result: {
    text: string;
    isError: boolean;
    subtype?: string;
    sessionId?: string;
    structured?: unknown;
    durationMs?: number;
    costUsd?: number;
    usage?: Record<string, unknown>;
    models: string[];
    raw: Record<string, unknown>;
  } | null;
  toolUses: ToolUse[];
  /** 每則 assistant 的文字，照順序（不含思考）；沒有工具時多於一則，就是碰到輸出上限後接著寫的。 */
  texts: string[];
  /** 最後一筆 rate_limit_event：status 是 allowed、allowed_warning 或 rejected（額度用完，§5-4）。 */
  rateLimit: { status: string; type?: string; utilization?: number; resetsAt?: number } | null;
  /** 讀不懂的行（不是 JSON）；正常是空的。 */
  junk: string[];
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const strings = (value: unknown): string[] => Array.isArray(value)
  ? value.map(each => typeof each === 'string' ? each : isRecord(each) && typeof each.name === 'string' ? each.name : null).filter((each): each is string => each !== null)
  : [];
const str = (value: unknown): string | undefined => typeof value === 'string' ? value : undefined;
const num = (value: unknown): number | undefined => typeof value === 'number' ? value : undefined;

export function parseStream(stdout: string): ClaudeRun {
  const run: ClaudeRun = { init: null, result: null, toolUses: [], texts: [], rateLimit: null, junk: [] };
  for (const line of stdout.split(/\r?\n/)) {
    if (!line.trim()) continue;
    let event: unknown;
    try { event = JSON.parse(line); } catch { run.junk.push(line.slice(0, 200)); continue; }
    if (!isRecord(event)) continue;
    if (event.type === 'system' && event.subtype === 'init') {
      run.init = { model: str(event.model), tools: strings(event.tools), mcpServers: strings(event.mcp_servers), cwd: str(event.cwd), raw: event };
    } else if (event.type === 'assistant' && isRecord(event.message) && Array.isArray(event.message.content)) {
      for (const block of event.message.content) {
        if (isRecord(block) && block.type === 'tool_use' && typeof block.name === 'string') {
          run.toolUses.push({ name: block.name, input: isRecord(block.input) ? block.input : {} });
        } else if (isRecord(block) && block.type === 'text' && typeof block.text === 'string') {
          run.texts.push(block.text);
        }
      }
    } else if (event.type === 'rate_limit_event' && isRecord(event.rate_limit_info)) {
      const info = event.rate_limit_info;
      run.rateLimit = { status: str(info.status) ?? '', type: str(info.rateLimitType), utilization: num(info.utilization), resetsAt: num(info.resetsAt) };
    } else if (event.type === 'result') {
      run.result = {
        text: str(event.result) ?? '',
        isError: event.is_error === true,
        subtype: str(event.subtype),
        sessionId: str(event.session_id),
        structured: event.structured_output,
        durationMs: num(event.duration_ms),
        costUsd: num(event.total_cost_usd),
        usage: isRecord(event.usage) ? event.usage : undefined,
        models: isRecord(event.modelUsage) ? Object.keys(event.modelUsage) : [],
        raw: event,
      };
    }
  }
  return run;
}

/**
 * 整份回覆：沒有用工具、文字多於一則時（碰到輸出上限，CLI 接著要），照順序直接接起來；其他照 result。
 * 有工具的（評審讀檔）不接：讀檔前說的話不是回覆。`continued` 是接了幾則。
 */
export function fullReply(run: ClaudeRun): { text: string; continued: number } {
  const last = run.result?.text ?? '';
  if (run.toolUses.length || run.texts.length < 2) return { text: last, continued: 0 };
  return { text: run.texts.join(''), continued: run.texts.length - 1 };
}

/** stream-json 輸入的一則使用者訊息（`--input-format stream-json`）：文字，或 PDF 附件加文字。 */
export function userMessage(text: string, pdfBase64?: string): string {
  const content: unknown[] = [];
  if (pdfBase64 !== undefined) content.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: pdfBase64 } });
  content.push({ type: 'text', text });
  return JSON.stringify({ type: 'user', message: { role: 'user', content } }) + '\n';
}
