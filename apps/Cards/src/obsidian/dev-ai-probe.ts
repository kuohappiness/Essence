import { loadPdfJs, type App } from 'obsidian';

// 直接呼叫 AI 的第 0 批探針（tasks/ai-direct.md〈平台事實表〉P1、P3、P4）：只在電腦，dev.ts 的 ai-probe 命令，URI 帶 do。
// - do=cors：用假金鑰對四家各送一次和正式請求同形狀的 POST（JSON、串流、認證標頭），看回應讀不讀得到（CORS 擋住時 fetch 直接丟 TypeError）。
// - do=secret／secret-read／secret-clear：secretStorage 存一個探針值、重開後再讀、最後清掉；secret 另外在 vault 的設定資料夾找這個值。
// - do=pdf：內建的 PDF 元件（loadPdfJs）的版本、能用的方法、讀出第 2 頁的字、畫成圖片、能不能把第 2 頁另存成新的 PDF。
// 不用真的金鑰、不讀教材：PDF 是程式當場產生的三頁英文。

const FAKE_KEY = 'essence-probe-not-a-real-key';
const SECRET_ID = 'essence-cards-probe';

interface Target { name: string; url: string; headers: Record<string, string>; body: unknown }

const TARGETS: Target[] = [
  { name: 'openai', url: 'https://api.openai.com/v1/responses', headers: { authorization: `Bearer ${FAKE_KEY}` }, body: { model: 'gpt-5.6-terra', input: 'hi', stream: true, store: false } },
  {
    name: 'anthropic', url: 'https://api.anthropic.com/v1/messages',
    headers: { 'x-api-key': FAKE_KEY, 'anthropic-version': '2026-10-21', 'anthropic-dangerous-direct-browser-access': 'true' },
    body: { model: 'claude-haiku-5-5', max_tokens: 16, stream: true, messages: [{ role: 'user', content: 'hi' }] },
  },
  // 對照：不加直接從瀏覽器呼叫的標頭，看 Anthropic 是不是真的要它。
  {
    name: 'anthropic-without-browser-header', url: 'https://api.anthropic.com/v1/messages',
    headers: { 'x-api-key': FAKE_KEY, 'anthropic-version': '2026-10-21' },
    body: { model: 'claude-haiku-5-5', max_tokens: 16, stream: true, messages: [{ role: 'user', content: 'hi' }] },
  },
  {
    name: 'google', url: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:streamGenerateContent?alt=sse',
    headers: { 'x-goog-api-key': FAKE_KEY }, body: { contents: [{ role: 'user', parts: [{ text: 'hi' }] }] },
  },
  {
    name: 'openrouter', url: 'https://openrouter.ai/api/v1/chat/completions', headers: { authorization: `Bearer ${FAKE_KEY}` },
    body: { model: 'openai/gpt-5.6-terra', stream: true, messages: [{ role: 'user', content: 'hi' }] },
  },
];

const errorText = (error: unknown): string => error instanceof Error ? `${error.name}: ${error.message}` : String(error);

/** P1：回應讀得到（有狀態碼）就是 CORS 放行；讀到的本文只留前 300 字，假金鑰換成 ***。 */
async function cors(): Promise<unknown> {
  const results = [];
  for (const target of TARGETS) {
    const controller = new AbortController();
    const timer = window.setTimeout(() => { controller.abort(); }, 20_000);
    const started = performance.now();
    try {
      const response = await fetch(target.url, {
        method: 'POST', signal: controller.signal, body: JSON.stringify(target.body),
        headers: { 'content-type': 'application/json', accept: 'text/event-stream', ...target.headers },
      });
      const text = await response.text();
      results.push({
        name: target.name, readable: true, status: response.status, ms: Math.round(performance.now() - started),
        contentType: response.headers.get('content-type'), body: text.slice(0, 300).replaceAll(FAKE_KEY, '***'),
      });
    } catch (error) {
      results.push({ name: target.name, readable: false, ms: Math.round(performance.now() - started), error: errorText(error) });
    } finally {
      window.clearTimeout(timer);
    }
  }
  return { origin: window.location.origin, userAgent: navigator.userAgent, results };
}

interface SecretStore { setSecret(id: string, secret: string): void; getSecret(id: string): string | null; listSecrets(): string[] }

/** vault 的設定資料夾（.obsidian）裡哪些檔含有這個字串；只讀 2 MB 以下的檔。 */
async function filesContaining(app: App, needle: string): Promise<{ found: string[]; scanned: number }> {
  const found: string[] = [];
  let scanned = 0;
  const walk = async (folder: string): Promise<void> => {
    const listed = await app.vault.adapter.list(folder);
    for (const file of listed.files) {
      const stat = await app.vault.adapter.stat(file);
      if (!stat || stat.size > 2_000_000) continue;
      scanned++;
      if ((await app.vault.adapter.read(file)).includes(needle)) found.push(file);
    }
    for (const sub of listed.folders) await walk(sub);
  };
  await walk(app.vault.configDir);
  return { found, scanned };
}

/** P3：探針值不是金鑰，可以照寫進結果檔，讓重開之後比對。 */
async function secret(app: App, step: string): Promise<unknown> {
  const store = (app as unknown as { secretStorage?: SecretStore }).secretStorage;
  if (!store) return { available: false };
  if (step === 'secret') {
    const value = `probe-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    store.setSecret(SECRET_ID, value);
    const inVault = await filesContaining(app, value);
    return { available: true, value, readBack: store.getSecret(SECRET_ID) === value, listed: store.listSecrets().includes(SECRET_ID), configDir: app.vault.configDir, inVault };
  }
  if (step === 'secret-read') {
    const value = store.getSecret(SECRET_ID);
    return { available: true, value, listed: store.listSecrets().includes(SECRET_ID) };
  }
  if (step === 'secret-clear') {
    store.setSecret(SECRET_ID, '');
    return { available: true, after: store.getSecret(SECRET_ID), listed: store.listSecrets().includes(SECRET_ID) };
  }
  return { error: `不認得的 do：${step}` };
}

/** 三頁、每頁一行英文的 PDF（標準字型 Helvetica，不需要內嵌字型）。 */
function threePagePdf(): Uint8Array {
  const pages = ['Page one: light', 'Page two: water', 'Page three: air'];
  const objects: string[] = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Kids [${pages.map((_, i) => `${3 + i * 2} 0 R`).join(' ')}] /Count ${pages.length} >>`,
  ];
  const font = 3 + pages.length * 2;
  pages.forEach((line, i) => {
    const content = `BT /F1 18 Tf 72 720 Td (${line}) Tj ET`;
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ${4 + i * 2} 0 R /Resources << /Font << /F1 ${font} 0 R >> >> >>`);
    objects.push(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
  });
  objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map(o => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(pdf);
}

interface PdfPage {
  getTextContent(): Promise<{ items: { str?: string }[] }>;
  getViewport(options: { scale: number }): { width: number; height: number };
  render(options: { canvasContext: CanvasRenderingContext2D; viewport: unknown }): { promise: Promise<void> };
}
interface PdfDocument { numPages: number; getPage(n: number): Promise<PdfPage>; destroy(): Promise<void> }
interface PdfLib { version?: string; build?: string; getDocument(options: { data: Uint8Array }): { promise: Promise<PdfDocument> } }

/** 物件與它的原型鏈上有哪些方法（不含 Object 本身的）。 */
function methodsOf(value: object): string[] {
  const names = new Set<string>();
  for (let proto: object | null = value; proto && proto !== Object.prototype; proto = Object.getPrototypeOf(proto) as object | null) {
    for (const name of Object.getOwnPropertyNames(proto)) if (name !== 'constructor') names.add(name);
  }
  return [...names].sort();
}

async function pageText(doc: PdfDocument, n: number): Promise<string> {
  const page = await doc.getPage(n);
  return (await page.getTextContent()).items.map(item => item.str ?? '').join(' ').trim();
}

/** P4：切頁的方法名稱各版不同，先列出來；extractPages 存在才試，參數照 pdf.js 5 的寫法猜，失敗就記錯誤與函式開頭的原始碼。 */
async function pdf(): Promise<unknown> {
  const lib = await loadPdfJs() as PdfLib;
  const doc = await lib.getDocument({ data: threePagePdf() }).promise;
  const methods = methodsOf(doc);
  const text = await pageText(doc, 2);
  const page = await doc.getPage(2);
  const viewport = page.getViewport({ scale: 1 });
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  let image: unknown;
  try {
    const context = canvas.getContext('2d');
    if (!context) throw Error('沒有 2d context');
    await page.render({ canvasContext: context, viewport }).promise;
    image = { ok: true, width: canvas.width, height: canvas.height, pngChars: canvas.toDataURL('image/png').length };
  } catch (error) {
    image = { ok: false, error: errorText(error) };
  }
  const extract = (doc as unknown as { extractPages?: (...args: unknown[]) => Promise<unknown> }).extractPages;
  let extracted: unknown = { available: false };
  if (typeof extract === 'function') {
    try {
      const out = await extract.call(doc, [{ document: null, includePages: [1] }]);
      if (out instanceof Uint8Array) {
        const again = await lib.getDocument({ data: out.slice() }).promise;
        extracted = { available: true, ok: true, bytes: out.length, pages: again.numPages, text: await pageText(again, 1) };
        await again.destroy();
      } else extracted = { available: true, ok: false, returned: Object.prototype.toString.call(out) };
    } catch (error) {
      extracted = { available: true, ok: false, error: errorText(error), source: extract.toString().slice(0, 600) };
    }
  }
  const pages = doc.numPages;
  await doc.destroy();
  return { version: lib.version ?? null, build: lib.build ?? null, pages, page2Text: text, image, methods, extracted };
}

export async function aiProbe(app: App, step: string | undefined): Promise<unknown> {
  if (step === 'cors') return cors();
  if (step === 'pdf') return pdf();
  if (step?.startsWith('secret')) return secret(app, step);
  return { error: '要帶 do=cors、pdf、secret、secret-read 或 secret-clear' };
}
