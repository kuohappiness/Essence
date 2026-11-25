// 傳輸層：和標準 fetch 同一個形狀，套件只在這裡碰網路（docs/tasks/ai-client.md〈4〉）。
// 預設用執行環境的 fetch（Node 24、瀏覽器、Electron、Cloudflare Workers 都有）。要換成別的（例如 Obsidian 的 requestUrl），
// 包成同樣形狀、回傳標準的 Response 即可；不串流的傳輸層在最後一次交出整段本文，結果相同，只是沒有逐段的進度。

export interface FetchInit {
  method: 'GET' | 'POST';
  headers: Record<string, string>;
  body?: Uint8Array;
  /** 必須照它中止底層的請求。做不到的傳輸層，套件這邊仍會立刻停下，但請求可能還在跑、仍會計費。 */
  signal: AbortSignal;
  /** 一律 error：跨站轉址時，瀏覽器不會拿掉 x-api-key 這類自訂標頭，金鑰會被帶到別的網站。 */
  redirect: 'error';
}

export type FetchLike = (url: string, init: FetchInit) => Promise<Response>;

export const defaultFetch: FetchLike = (url, init) => fetch(url, init as RequestInit);

/**
 * 回應本文一段一段讀；呼叫端提早停止時放掉連線。
 * signal 中止時直接取消 reader：卡在 read() 的讀取會立刻結束，不留著沒停的讀取（L2 R9）。
 * 只靠 finally 不夠：產生器卡在 await 時，外面的 return() 要等這次 read() 回來才會執行。
 */
export async function* bodyChunks(response: Response, signal?: AbortSignal): AsyncGenerator<Uint8Array> {
  if (!response.body) return;
  const reader = response.body.getReader();
  const cancel = () => { reader.cancel().catch(() => undefined); };
  signal?.addEventListener('abort', cancel, { once: true });
  try {
    if (signal?.aborted) return;
    for (;;) {
      const { done, value } = await reader.read();
      if (done || signal?.aborted) return;
      yield value;
    }
  } finally {
    signal?.removeEventListener('abort', cancel);
    cancel();
  }
}

/** 把本文讀成字串。收滿 maxBytes 就不再讀（錯誤頁可能很大，也可能一直送，L2 第二輪 R9）。 */
export async function readText(chunks: AsyncIterable<Uint8Array>, maxBytes = Number.POSITIVE_INFINITY): Promise<string> {
  const decoder = new TextDecoder('utf-8');
  let out = '';
  let size = 0;
  for await (const chunk of chunks) {
    const take = size + chunk.byteLength > maxBytes ? chunk.subarray(0, maxBytes - size) : chunk;
    size += take.byteLength;
    out += decoder.decode(take, { stream: true });
    if (size >= maxBytes) break;
  }
  return out + decoder.decode();
}
