import { sha256OfBytes } from '../core/ai/index.ts';
import { materialType } from '../core/connect/index.ts';
import type { DirectProgress, Material } from '../core/connect/index.ts';

// 直接製作的畫面零件（tasks/ai-direct.md §4～§6、§9）：製卡與加深的視窗共用。這裡只畫，送出、重送與存檔在各自的流程。

export const DIRECT_TEXT = {
  files: '選擇檔案',
  notMaterial: (name: string) => `「${name}」不是 PDF、JPG 或 PNG，沒有加進來。`,
  unreadable: (name: string) => `讀不到「${name}」，沒有加進來；請再選一次。`,
  /** 同一個檔（內容相同，檔名不同也算）只送一次，免得多算一次錢（加深第 3 批實機第 4 點）。 */
  duplicate: (name: string) => `「${name}」已經加過了，沒有再加一次。`,
  thinking: (time: string) => `AI 正在想（已經 ${time}）`,
  receiving: (chars: number, time: string) => `已收到 ${chars.toLocaleString('en-US')} 字（已經 ${time}）`,
  slowStart: '有些 AI 要想 2～3 分鐘才開始回答。',
  retrying: (seconds: number, attempt: number) => `AI 那邊忙或連不上，${String(seconds)} 秒後再送一次（第 ${String(attempt)} 次）。`,
  /** 碰到一次回覆的上限，程式自動接著要（ai-direct-continue.md）：接著要的那一次另外計費。 */
  continuing: (part: number) => `回答太長，一次寫不完；正在接著要第 ${String(part)} 段（這一段另外計費）。`,
  askCancel: '要取消這一次嗎？如果 AI 已經開始做，這一次可能仍會計費。',
  reselect: '教材檔不會存下來，重開過 Obsidian 之後要重新選一次，才能用同一份提示重送。',
  resendKept: '用上一次選的教材檔、同一份提示重送；照設定頁現在的服務與模型送出。',
  differs: '和上一次送的檔不同；快照會記這次送的檔。',
  same: '和上一次送的檔相同。',
};

/** 「1 分 20 秒」「35 秒」。 */
function elapsed(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  return seconds < 60 ? `${String(seconds)} 秒` : `${String(Math.floor(seconds / 60))} 分 ${String(seconds % 60)} 秒`;
}
/** 「1.2 MB」「340 KB」。 */
const size = (bytes: number): string => bytes >= 1_000_000 ? `${(bytes / 1_000_000).toFixed(1)} MB` : `${String(Math.max(1, Math.round(bytes / 1000)))} KB`;

/** 給家長看的「多久以前」。 */
export function ago(ms: number, now: number): string {
  const minutes = Math.max(0, Math.round((now - ms) / 60_000));
  if (minutes < 1) return '剛剛';
  if (minutes < 60) return `${String(minutes)} 分鐘前`;
  const hours = Math.round(minutes / 60);
  return hours < 24 ? `${String(hours)} 小時前` : `${String(Math.round(hours / 24))} 天前`;
}

/**
 * 「教材檔」一欄（§5）：選擇檔案或拖進來，PDF 讀總頁數；列出檔名、大小、頁數，可以拿掉。materials 是畫面手上的那一份（直接改它）；
 * note 是還沒選檔時的說明。回傳重畫清單的 draw 與加檔的 add（拖進視窗的檔交給它）；清單變了時呼叫 changed。
 */
export function materialField(cell: HTMLElement, materials: Material[], note: string, pdfPages: ((data: Uint8Array) => Promise<number | null>) | undefined, changed: () => void): { draw: () => void; add: (files: readonly File[]) => Promise<void> } {
  const input = cell.createEl('input', { type: 'file', attr: { accept: '.pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png', multiple: '' } });
  input.hide();
  cell.createEl('button', { text: DIRECT_TEXT.files }).addEventListener('click', () => { input.click(); });
  const list = cell.createEl('ul');
  const hint = cell.createDiv({ text: note, cls: 'essence-cards-ai-pick-note' });
  const problems = cell.createDiv({ cls: 'essence-cards-backup-problem' });
  const draw = (): void => {
    list.empty();
    materials.forEach((material, index) => {
      const pages = material.mediaType === 'application/pdf' ? `${material.pages === null ? '讀不出頁數' : `${String(material.pages)} 頁`}，` : '';
      const item = list.createEl('li', { text: `${material.name}（${pages}${size(material.data.length)}） ` });
      item.createEl('button', { text: '拿掉' }).addEventListener('click', () => { materials.splice(index, 1); changed(); });
    });
    hint.toggle(!materials.length);
  };
  const add = async (picked: readonly File[]): Promise<void> => {
    const notes: string[] = [];
    for (const file of picked) {
      const type = materialType(file.name);
      if (!type) { notes.push(DIRECT_TEXT.notMaterial(file.name)); continue; }
      let data: Uint8Array;
      try { data = new Uint8Array(await file.arrayBuffer()); } catch { notes.push(DIRECT_TEXT.unreadable(file.name)); continue; }
      const sha256 = sha256OfBytes(data);
      // pdf.js 可能把交給它的緩衝區移到背景執行緒，給它一份複本，送出的那一份才不會變成空的。
      const pages = type === 'application/pdf' ? await (pdfPages?.(data.slice()) ?? Promise.resolve(null)) : null;
      // 讀頁數之後才比：同時加進來的兩批（選檔與拖進來）也只留一份。
      if (materials.some(material => material.sha256 === sha256)) { notes.push(DIRECT_TEXT.duplicate(file.name)); continue; }
      materials.push({ name: file.name, mediaType: type, data, pages, sha256 });
    }
    problems.setText(notes.join(' '));
    changed();
  };
  input.addEventListener('change', () => { void add(Array.from(input.files ?? [])); input.value = ''; });
  return { draw, add };
}

/**
 * 送出中的畫面（§4 第 4 步）：等了多久、收到多少字；1 分鐘還沒有字時補一句；接著要時寫第幾段；一直可以取消。
 * 回傳收進度的 progress、停計時器的 stop，與「要取消這一次嗎？」那一列的位置 ask（畫在按鈕上面）。
 */
export function sendingView(el: HTMLElement, label: string, now: () => number, cancel: () => void): { ask: HTMLElement; progress: (event: DirectProgress) => void; stop: () => void } {
  const status = el.createEl('p', { text: `${label}：${DIRECT_TEXT.thinking(elapsed(0))}` });
  const slow = el.createEl('p', { cls: 'essence-cards-issue-note' });
  const retry = el.createEl('p', { cls: 'essence-cards-issue-note' });
  const more = el.createEl('p', { cls: 'essence-cards-issue-note' });
  const ask = el.createDiv();
  el.createDiv({ cls: 'essence-cards-issue-buttons' }).createEl('button', { text: '取消' }).addEventListener('click', cancel);
  const started = now();
  let chars = 0;
  const draw = (): void => {
    const time = elapsed(now() - started);
    status.setText(`${label}：${chars ? DIRECT_TEXT.receiving(chars, time) : DIRECT_TEXT.thinking(time)}`);
    slow.setText(!chars && now() - started >= 60_000 ? DIRECT_TEXT.slowStart : '');
  };
  let timer: number | null = window.setInterval(draw, 1000);
  return {
    ask,
    progress: event => {
      if (event.type === 'text') { chars = event.totalChars; retry.setText(''); draw(); }
      else if (event.type === 'retrying') retry.setText(DIRECT_TEXT.retrying(Math.round(event.delayMs / 1000), event.attempt));
      else if (event.type === 'continuing') more.setText(DIRECT_TEXT.continuing(event.part));
    },
    stop: () => { if (timer !== null) { window.clearInterval(timer); timer = null; } },
  };
}

/** 送出中按關閉時「要取消這一次嗎？」那一列（§6 最後一點）：家長本來就是要關視窗，取消之後一起關（Windows 實機第 2 批第 3 點）。 */
export function askCancel(el: HTMLElement, cancelAndClose: () => void): void {
  el.empty();
  el.createEl('p', { text: DIRECT_TEXT.askCancel });
  const buttons = el.createDiv({ cls: 'essence-cards-issue-buttons' });
  buttons.createEl('button', { text: '取消這一次', cls: 'mod-warning' }).addEventListener('click', cancelAndClose);
  buttons.createEl('button', { text: '繼續等' }).addEventListener('click', () => { el.empty(); });
}
