import { loadPdfJs, requireApiVersion } from 'obsidian';
import type { App } from 'obsidian';
import { cardsClient, keyOf, readConnection } from '../core/connect/index.ts';
import type { DirectFailure, GenerateResult, KeyLookup } from '../core/connect/index.ts';
import { aiConnection } from '../ui/prefs.ts';
import type { AiCardsDeps } from './ai-cards.ts';

// 直接製作接上 Obsidian（tasks/ai-direct.md §4、§5）：只在電腦用。設定頁「AI 連線」存的服務與模型、SecretStorage 裡的金鑰（1.11.4 起才有）、內建的 PDF 元件。

/** 讀 PDF 頁數最多等多久；讀不完就當成讀不出頁數，請家長改用照片或複製提示。 */
const PDF_WAIT = 30_000;

/** 製卡流程用的連線：每次按下都重讀設定頁的值與金鑰（家長可能剛改過）。金鑰的值只交給套件，不留在這裡。 */
export function directHost(app: App, onFailure: (failure: DirectFailure, error: unknown, result: GenerateResult | null) => void): NonNullable<AiCardsDeps['direct']> {
  const client = cardsClient();
  const connection = () => readConnection(aiConnection.get(app), client.providers());
  const key = (): KeyLookup => requireApiVersion('1.11.4') ? keyOf(connection(), id => app.secretStorage.getSecret(id)) : { ok: false, why: 'unset' };
  return { client, connection, key, onFailure };
}

interface PdfLoadingTask { promise: Promise<{ numPages: number; destroy(): Promise<void> }>; destroy(): Promise<void> }

/**
 * PDF 的總頁數（§5，平台事實表 P4：Obsidian 內建的 pdf.js）；加密、壞檔或 30 秒讀不完是 null。
 * data 交給 pdf.js 之後可能被移到背景執行緒，呼叫端要給一份複本。逾時就停掉那一個讀取，晚到的結果不用。
 */
export async function pdfPages(data: Uint8Array): Promise<number | null> {
  let task: PdfLoadingTask | null = null;
  let timer: number | null = null;
  try {
    // loadPdfJs 回傳的是 any（obsidian.d.ts）：只用 getDocument 的這兩個欄。
    const pdfjs = await loadPdfJs() as { getDocument(source: { data: Uint8Array }): PdfLoadingTask };
    const loading = pdfjs.getDocument({ data });
    task = loading;
    const late = new Promise<null>(resolve => { timer = window.setTimeout(() => { resolve(null); }, PDF_WAIT); });
    const doc = await Promise.race([loading.promise, late]);
    if (doc === null) return null;
    const pages = doc.numPages;
    return Number.isInteger(pages) && pages > 0 ? pages : null;
  } catch {
    return null;
  } finally {
    if (timer !== null) window.clearTimeout(timer);
    void task?.destroy().catch(() => {});
  }
}
