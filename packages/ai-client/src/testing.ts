// 選用入口 ai-client/testing：給呼叫端寫測試用的假 fetch 與 SSE 本文，不連網。
import type { FetchInit, FetchLike } from './transport.ts';

export interface MockReply {
  status?: number;
  headers?: Record<string, string>;
  /** 本文的每一段；字串用 UTF-8 編碼。 */
  chunks?: (string | Uint8Array)[];
  /** 每一段之前等幾毫秒（測逾時與取消）。 */
  delayMs?: number;
  /** 交出 Response 之前等幾毫秒（測回應標頭逾時）。 */
  headersDelayMs?: number;
  /** 送出就失敗（模擬連不上）。 */
  networkError?: string;
  /** 交出這幾段後就斷線（模擬串流中途斷掉）。 */
  dropAfter?: number;
}

export interface MockRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  /** 本文（UTF-8 解碼後的字串）。 */
  body: string | null;
}

export interface MockFetch extends FetchLike {
  /** 收到的每個請求（依順序）。 */
  readonly requests: MockRequest[];
}

export interface MockOptions {
  /** false：像 Obsidian 的 requestUrl，整段本文收完才交出 Response。預設 true。 */
  streaming?: boolean;
  /** false：不理會 signal（請求停不下來）。預設 true。 */
  abortable?: boolean;
}

/** handler 是依序的回覆，或收到第幾次（從 0 算）與請求後回傳回覆的函式。 */
export function mockFetch(handler: MockReply[] | ((request: MockRequest, index: number) => MockReply), options: MockOptions = {}): MockFetch {
  const requests: MockRequest[] = [];
  const streaming = options.streaming ?? true;
  const abortable = options.abortable ?? true;
  const fn = async (url: string, init: FetchInit): Promise<Response> => {
    const request: MockRequest = {
      url, method: init.method, headers: { ...init.headers },
      body: init.body ? new TextDecoder().decode(init.body) : null,
    };
    const index = requests.length;
    requests.push(request);
    const reply = Array.isArray(handler) ? handler[Math.min(index, handler.length - 1)] : handler(request, index);
    const signal = abortable ? init.signal : undefined;
    if (reply.headersDelayMs) await wait(reply.headersDelayMs, signal);
    if (reply.networkError) throw new Error(reply.networkError);
    if (signal?.aborted) throw new Error('aborted');
    const encoder = new TextEncoder();
    const parts = (reply.chunks ?? []).map(p => (typeof p === 'string' ? encoder.encode(p) : p));
    const responseInit = { status: reply.status ?? 200, headers: reply.headers ?? {} };
    if (!streaming) {
      for (let i = 0; i < parts.length; i++) {
        if (reply.dropAfter !== undefined && i >= reply.dropAfter) throw new Error('connection reset');
        if (reply.delayMs) await wait(reply.delayMs, signal);
      }
      return new Response(concat(parts), responseInit);
    }
    let i = 0;
    const stream = new ReadableStream<Uint8Array>({
      async pull(controller) {
        if (i >= parts.length) { controller.close(); return; }
        if (reply.dropAfter !== undefined && i >= reply.dropAfter) { controller.error(new Error('connection reset')); return; }
        try {
          if (reply.delayMs) await wait(reply.delayMs, signal);
        } catch (error) {
          controller.error(error);
          return;
        }
        controller.enqueue(parts[i++]);
      },
    });
    signal?.addEventListener('abort', () => {
      try { stream.cancel().catch(() => undefined); } catch { /* 已經被讀的串流不能 cancel，讀取端會自己停 */ }
    }, { once: true });
    return new Response(stream, responseInit);
  };
  return Object.assign(fn, { requests });
}

function concat(parts: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const p of parts) { out.set(p, offset); offset += p.length; }
  return out;
}

function wait(ms: number, signal: AbortSignal | undefined): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(new Error('aborted')); return; }
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => { clearTimeout(timer); reject(new Error('aborted')); }, { once: true });
  });
}

/** 組 SSE 本文：每個事件一段 `event:`（選填）＋`data:`，以空行結尾。字串直接當 data。 */
export function sse(events: ({ event?: string; data: unknown } | string)[]): string {
  return events
    .map(e => {
      if (typeof e === 'string') return `data: ${e}\n\n`;
      const data = typeof e.data === 'string' ? e.data : JSON.stringify(e.data);
      return `${e.event ? `event: ${e.event}\n` : ''}data: ${data}\n\n`;
    })
    .join('');
}
