import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

/**
 * 直接製作的本機假 AI 伺服器（tasks/ai-direct.md §10）：Windows 實機用，`npm run fake-ai -- [埠]`（預設 8787，只聽 127.0.0.1）。
 * 講 Google Gemini 的串流方言（`POST /v1beta/models/<模型>:streamGenerateContent?alt=sse`）；Obsidian 裡把
 * `https://generativelanguage.googleapis.com` 換成這裡的網址（偵錯埠改 `window.fetch`，外掛不用改）。不讀也不存金鑰的值，只記有沒有帶。
 *
 * 每一次請求照 `POST /__next` 排好的下一種回法回，沒排就是 ok：
 * - ok：馬上回標頭，回覆分 8 段、每段隔 300 毫秒，最後一段帶用量、模型與回應編號；
 * - slow：等 `slowSeconds`（預設 180 秒，P6）才回標頭，之後同 ok；
 * - trickle：每 3 秒一段、共 20 段（看送出中的畫面、取消與停用外掛時中止）；
 * - bad：同 ok，回覆在 `<<<完>>>` 後面多一句（檢查會擋，看「重送」「改用複製貼上」）；
 * - cut：送兩段後切斷連線（網路中斷）；
 * - e500、e429、e401：照 Google 的錯誤格式回那個狀態碼。
 * 其他控制：`POST /__reply` 換 ok 的回覆本文（預設是最小版開發命令的自然範例）；`GET /__log` 看收到的請求與每一次怎麼結束（含被中止）；`POST /__reset` 全部清掉。
 */

const MODES = ['ok', 'slow', 'trickle', 'bad', 'cut', 'e500', 'e429', 'e401'] as const;
type Mode = typeof MODES[number];

/** 最小版開發命令（src/obsidian/dev-ai.ts）的自然範例：R3 三段，一個目標加一張候選卡。 */
export const DEFAULT_REPLY = [
  '<<<全貌>>>', '## 知識塊', '', '- 擴散：粒子不停運動', '<<<架構>>>', '## 學習目標', '', '- T01｜①｜能用粒子運動說明擴散現象',
  '<<<卡組>>>', '> [!note] 給家長的備註', '> - 例題的濃度計算建議另外練習', '', '## 1 擴散現象', '',
  '- 能用粒子運動說明擴散現象', '    - 出處：p.44｜類型：因果', '    - 黑糖放進水裡，不攪拌也會慢慢變甜，為什麼？ :: 粒子**不停運動**，從**濃度高**的地方散到**濃度低**的地方', '',
  '> [!note]- 候選卡片', '> - 能說明溫度對溶解度的影響', '>     - 理由：補充的內容，段考不一定考', '>     - 出處：p.45｜類型：因果', '>     - 水溫升高時，糖的溶解度會怎麼變？ :: 變**大**', '<<<完>>>',
].join('\n');

/** 收到的一次請求：只記形狀，不記提示與教材的內容。 */
interface Seen {
  n: number;
  at: string;
  mode: Mode;
  model: string | null;
  keyHeader: boolean;
  parts: string[];
  promptChars: number;
  thinking: unknown;
  /** done：回完；aborted：對方在回完之前關掉連線；cut：這裡故意切斷。 */
  end: 'done' | 'aborted' | 'cut' | 'error' | null;
  chunksSent: number;
}

export interface FakeAi { server: Server; url: string; seen: Seen[]; close(): Promise<void> }

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'access-control-allow-private-network': 'true',
  'access-control-expose-headers': '*',
};

/** e401 照第 0 批實機看到的 Google 回法：400 加 details 的 API_KEY_INVALID。 */
const ERRORS: Record<'e500' | 'e429' | 'e401', [number, string, string, string | null]> = {
  e500: [500, 'INTERNAL', 'An internal error has occurred.', null],
  e429: [429, 'RESOURCE_EXHAUSTED', 'Resource has been exhausted (e.g. check quota).', null],
  e401: [400, 'INVALID_ARGUMENT', 'API key not valid. Please pass a valid API key.', 'API_KEY_INVALID'],
};

async function bodyOf(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString('utf8');
}

const wait = (ms: number): Promise<void> => new Promise(resolve => { setTimeout(resolve, ms); });

/** 回覆切成 count 段（照字切，不切斷 UTF-16 的代理對以外的東西；中文一個字一個單位）。 */
function pieces(text: string, count: number): string[] {
  const chars = Array.from(text);
  const size = Math.max(1, Math.ceil(chars.length / count));
  const out: string[] = [];
  for (let i = 0; i < chars.length; i += size) out.push(chars.slice(i, i + size).join(''));
  return out;
}

function partsOf(body: unknown): { parts: string[]; promptChars: number; thinking: unknown } {
  const parsed = (body ?? {}) as { contents?: { parts?: Record<string, unknown>[] }[]; generationConfig?: { thinkingConfig?: unknown } };
  const parts: string[] = [];
  let promptChars = 0;
  for (const content of parsed.contents ?? []) for (const part of content.parts ?? []) {
    if (typeof part.text === 'string') { parts.push('text'); promptChars += part.text.length; } else if (part.inlineData && typeof part.inlineData === 'object') {
      const data = part.inlineData as { mimeType?: unknown; data?: unknown };
      parts.push(`${String(data.mimeType)} ${typeof data.data === 'string' ? String(Math.floor(data.data.length * 3 / 4)) : '?'} bytes`);
    } else parts.push(Object.keys(part).join('+'));
  }
  return { parts, promptChars, thinking: parsed.generationConfig?.thinkingConfig ?? null };
}

export async function startFakeAi(options: { port?: number; slowSeconds?: number; chunkMs?: number; trickleMs?: number } = {}): Promise<FakeAi> {
  const slowMs = (options.slowSeconds ?? 180) * 1000;
  const chunkMs = options.chunkMs ?? 300;
  const trickleMs = options.trickleMs ?? 3000;
  const seen: Seen[] = [];
  let queue: Mode[] = [];
  let reply = DEFAULT_REPLY;

  const json = (res: ServerResponse, status: number, value: unknown): void => {
    res.writeHead(status, { ...CORS, 'content-type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(value, null, 2));
  };

  async function generate(req: IncomingMessage, res: ServerResponse, model: string | null): Promise<void> {
    const raw = await bodyOf(req);
    let body: unknown = null;
    try { body = JSON.parse(raw); } catch { /* 照樣記下來，回 400 */ }
    const mode = queue.shift() ?? 'ok';
    const entry: Seen = { n: seen.length + 1, at: new Date().toISOString(), mode, model, keyHeader: typeof req.headers['x-goog-api-key'] === 'string', ...partsOf(body), end: null, chunksSent: 0 };
    seen.push(entry);
    let closed = false;
    res.on('close', () => { closed = true; if (entry.end === null) entry.end = 'aborted'; });
    if (body === null) { entry.end = 'error'; json(res, 400, { error: { code: 400, status: 'INVALID_ARGUMENT', message: 'Invalid JSON payload received.' } }); return; }
    if (mode === 'e500' || mode === 'e429' || mode === 'e401') {
      const [status, code, message, reason] = ERRORS[mode];
      entry.end = 'done';
      json(res, status, { error: { code: status, status: code, message, ...reason ? { details: [{ '@type': 'type.googleapis.com/google.rpc.ErrorInfo', reason, domain: 'googleapis.com' }] } : {} } });
      return;
    }
    if (mode === 'slow') await wait(slowMs);
    if (closed) return;
    res.writeHead(200, { ...CORS, 'content-type': 'text/event-stream', 'cache-control': 'no-cache' });
    const text = mode === 'bad' ? `${reply.replace(/\s*$/, '')}\n希望這些卡片有幫助` : reply;
    const all = pieces(text, mode === 'trickle' ? 20 : 8);
    const send = (data: unknown): void => { res.write(`data: ${JSON.stringify(data)}\r\n\r\n`); entry.chunksSent++; };
    for (const [i, piece] of all.entries()) {
      if (closed) return;
      if (mode === 'cut' && i === 2) { entry.end = 'cut'; res.destroy(); return; }
      const last = i === all.length - 1;
      send({
        candidates: [{ content: { role: 'model', parts: [{ text: piece }] }, ...last ? { finishReason: 'STOP' } : {}, index: 0 }],
        ...last ? { usageMetadata: { promptTokenCount: 4200, candidatesTokenCount: 380, thoughtsTokenCount: 120, totalTokenCount: 4700 } } : {},
        modelVersion: model ?? 'unknown',
        responseId: `fake-${String(entry.n)}`,
      });
      if (!last) await wait(mode === 'trickle' ? trickleMs : chunkMs);
    }
    entry.end = 'done';
    res.end();
  }

  const server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    if (req.method === 'OPTIONS') { res.writeHead(204, CORS); res.end(); return; }
    const route = `${req.method ?? ''} ${url.pathname}`;
    const fail = (error: unknown): void => { if (!res.headersSent) json(res, 500, { error: String(error) }); else res.destroy(); };
    if (route === 'GET /__log') { json(res, 200, { queue, seen }); return; }
    if (route === 'POST /__reset') { queue = []; seen.length = 0; reply = DEFAULT_REPLY; json(res, 200, { ok: true }); return; }
    if (route === 'POST /__next') {
      bodyOf(req).then(raw => {
        const modes = (JSON.parse(raw) as { modes?: unknown }).modes;
        if (!Array.isArray(modes) || !modes.every((m): m is Mode => (MODES as readonly unknown[]).includes(m))) { json(res, 400, { error: `modes 要是 ${MODES.join('、')} 的陣列` }); return; }
        queue.push(...modes);
        json(res, 200, { queue });
      }).catch(fail);
      return;
    }
    if (route === 'POST /__reply') {
      bodyOf(req).then(raw => { reply = raw; json(res, 200, { chars: raw.length }); }).catch(fail);
      return;
    }
    const match = /^\/v1beta\/models\/(.+):streamGenerateContent$/.exec(url.pathname);
    if (req.method === 'POST' && match) { generate(req, res, decodeURIComponent(match[1] ?? '')).catch(fail); return; }
    json(res, 404, { error: { code: 404, status: 'NOT_FOUND', message: `fake-ai 沒有 ${route}` } });
  });
  await new Promise<void>(resolve => { server.listen(options.port ?? 8787, '127.0.0.1', resolve); });
  const { port } = server.address() as AddressInfo;
  return {
    server, url: `http://127.0.0.1:${String(port)}`, seen,
    close: () => new Promise<void>(resolve => { server.closeAllConnections(); server.close(() => { resolve(); }); }),
  };
}

if (import.meta.main) {
  const port = Number(process.argv[2] ?? 8787);
  const fake = await startFakeAi({ port });
  console.log(`fake-ai 在 ${fake.url}（Gemini 方言）。Obsidian 的偵錯埠裡把 https://generativelanguage.googleapis.com 換成這個網址；Ctrl+C 結束。`);
}
