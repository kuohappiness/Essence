import { Modal } from 'obsidian';
import type { App, Plugin } from 'obsidian';
import { directJob, freeName, groupHints, issueText, PURPOSES, sha256OfBytes, UNENDED_HINT } from '../core/ai/index.ts';
import type { CardForm, CardJob, Inspection, Purpose } from '../core/ai/index.ts';
import { materialType, usageLine } from '../core/connect/index.ts';
import type { DirectFailure, Material, ProgressEvent } from '../core/connect/index.ts';
import { inspectionKey, PICK_NOTE, SERVICES } from './ai-cards.ts';
import type { AiCards, DirectOutcome, Outcome } from './ai-cards.ts';

// AI 製卡的視窗（tasks/ai-cards-mvp.md §2）：電腦一直有；手機在設定頁打開才有（D-226、tasks/phone-cards.md §2-1）。入口與目錄不放（D-100）。
// 用 Obsidian 的視窗、和存檔按鈕的小視窗同一種做法：家長要在瀏覽器與 Obsidian 之間來回，視窗不蓋住整個工作區。
// 直接製作（tasks/ai-direct.md §4～§6）：電腦才有。第一步多一欄教材檔、多一個「直接製作」；送出中看得到等了多久、收到多少字，可以取消；
// 收完放進貼回的框、自動檢查，之後和貼回一模一樣。

const TEXT = {
  title: 'AI 製卡',
  resumeSave: (label: string) => `繼續存上一次的結果（${label}，存到一半）`,
  resumePaste: (label: string, ago: string) => `接著貼回上一次的結果（${label}，${ago}複製）`,
  newLesson: '做新的一課',
  next: '下一步：到 ChatGPT、Gemini 或 Claude 開一個新對話，附上課本頁面的照片或 PDF，貼上提示送出；AI 回完後，按回覆裡程式碼區塊右上角的「複製」，貼在下面。',
  copied: (chars: number) => `已複製提示，共 ${chars.toLocaleString('en-US')} 字。`,
  paste: '把 AI 的整段回覆貼在這裡',
  confirmEnd: '我確定整段都貼了',
  /** 直接製作收到的回覆沒有 <<<完>>>（L2 第一輪 R3）：不是家長沒複製完，是 AI 沒寫完。 */
  directUnended: '最後一行不是 <<<完>>>：AI 可能沒寫完（例如回答太長被截斷）。可以按下面的「重送（會再計費一次）」，或確定內容完整再勾選、存成草稿',
  confirmReceived: '我確定這一段是完整的',
  blocked: '擋住了，改好再檢查（可以直接在上面改字）：',
  hints: '提示（可以存）：',
  saving: '正在存成草稿…',
  /** 待貼回的工作只存在這台裝置（tasks/phone-cards.md §2-5；保留規則在 core/ai/job.ts）。 */
  // 清掉的時機照 readJobs（載入與存工作時）：寫「可能」，不寫成到期那一刻就清（L2 R7）。
  local: (id: string) => `這次的提示只記在這台裝置（識別碼 ${id}）：換一台貼不回來。還沒開始存成草稿的放超過 14 天，或超過 5 個時，舊的可能被清掉；開始存草稿之後就不會。`,
  broken: (n: number) => `有 ${String(n)} 份之前複製的提示讀不懂，已經拿掉；要用的話請重新複製一次。`,
  files: '選擇檔案',
  filesNote: '課本那一課的 PDF 或照片（JPG、PNG），也可以拖進來。請先切出這一課的頁面，整本送會貴很多倍。',
  notMaterial: (name: string) => `「${name}」不是 PDF、JPG 或 PNG，沒有加進來。`,
  unreadable: (name: string) => `讀不到「${name}」，沒有加進來；請再選一次。`,
  thinking: (time: string) => `AI 正在想（已經 ${time}）`,
  receiving: (chars: number, time: string) => `已收到 ${chars.toLocaleString('en-US')} 字（已經 ${time}）`,
  slowStart: '有些 AI 要想 2～3 分鐘才開始回答。',
  retrying: (seconds: number, attempt: number) => `AI 那邊忙或連不上，${String(seconds)} 秒後再送一次（第 ${String(attempt)} 次）。`,
  askCancel: '要取消這一次嗎？如果 AI 已經開始做，這一次可能仍會計費。',
  received: 'AI 回好了，整段已經放進下面的框、檢查過；看過結果再存成草稿。',
  directPaste: (label: string) => `${label}：AI 的回覆在下面的框裡。`,
  fallback: '已複製同一份提示；到 ChatGPT、Gemini 或 Claude 開一個新對話，自己附上教材檔，貼上提示送出；AI 回完後，按回覆裡程式碼區塊右上角的「複製」，貼在下面。',
  /** 重開製卡時的清單（tasks/ai-direct.md §6〈中斷後接手〉，格式查核 F15）。 */
  resumeReceived: (label: string, ago: string) => `接著存上一次收到的回覆（${label}，${ago}收到）`,
  resumeNoReply: (label: string, ago: string) => `上一次沒有收到回覆，可能已經送出並計費（${label}，${ago}送出）`,
  resumeFailed: (label: string, ago: string) => `上一次直接製作沒有成功（${label}，${ago}）`,
  reselect: '教材檔不會存下來，重開過 Obsidian 之後要重新選一次，才能用同一份提示重送。',
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
function ago(ms: number, now: number): string {
  const minutes = Math.max(0, Math.round((now - ms) / 60_000));
  if (minutes < 1) return '剛剛';
  if (minutes < 60) return `${String(minutes)} 分鐘前`;
  const hours = Math.round(minutes / 60);
  return hours < 24 ? `${String(hours)} 小時前` : `${String(Math.round(hours / 24))} 天前`;
}
const labelOf = (job: { form: CardForm; subject: Pick<CardJob['subject'], 'subject' | 'label'> }): string => `${job.subject.subject === null ? '' : job.form.term}${job.subject.subject ?? job.subject.label} ${job.form.unit}`.trim();

export interface AiCardsModalHost {
  cards: () => AiCards | null;
  /** 打開那篇筆記（新分頁）。 */
  openNote: (path: string) => void;
  notify: (message: string) => void;
  now: () => number;
  /** PDF 的總頁數（Obsidian 內建的 PDF 元件，tasks/ai-direct.md §5）；讀不出來是 null。只在電腦（直接製作）用。 */
  pdfPages?: (data: Uint8Array) => Promise<number | null>;
}

/** 貼到一半的回覆：關掉視窗也留著，下次接著貼回（只在這次開著 Obsidian 的期間）。直接製作收回的整段也放這裡。 */
const pasted = new Map<string, string>();

class AiCardsModal extends Modal {
  private readonly host: AiCardsModalHost;
  private readonly modals: Set<AiCardsModal>;
  private job: CardJob | null = null;
  private form: CardForm | null = null;
  private inspection: Inspection | null = null;
  private confirmed = false;
  private service: string | null = null;
  private busy = false;
  /** 畫面是重開命令時的工作清單（start）。 */
  private inList = false;
  /** 第一步選的教材檔（直接製作，§5）：只在這個視窗開著的期間，內容不存。 */
  private materials: Material[] = [];
  /** 送出中畫面的計時器；畫面換掉或關掉時停。 */
  private timer: number | null = null;
  /** 關掉視窗前問過要不要取消送出中的那一個（§6 最後一點）；停用外掛時不問。 */
  private forced = false;
  /** 拖進視窗的檔交給誰（§5）：只有畫著教材欄的畫面有，換畫面時清掉。監聽器只在開視窗時掛一次，重畫教材欄不再多掛（PR #83 的 GitHub 審查）。 */
  private dropped: ((files: File[]) => void) | null = null;
  constructor(app: App, host: AiCardsModalHost, modals: Set<AiCardsModal>) {
    super(app);
    this.host = host;
    this.modals = modals;
  }
  onOpen(): void {
    this.modals.add(this);
    this.modalEl.addClass('essence-cards-ai-modal');
    this.titleEl.setText(TEXT.title);
    // 從檔案總管拖進整個視窗（§5）：沒有教材欄的畫面不攔，照 Obsidian 原本的處理。
    this.contentEl.addEventListener('dragover', event => { if (this.dropped) event.preventDefault(); });
    this.contentEl.addEventListener('drop', event => {
      if (!this.dropped) return;
      event.preventDefault();
      this.dropped(Array.from(event.dataTransfer?.files ?? []));
    });
    this.start();
  }
  onClose(): void { this.stopTimer(); this.modals.delete(this); this.contentEl.empty(); }
  /** 送出中按關閉（Esc、右上角的 ×）：先問要不要取消（§6）；停用外掛時直接關。 */
  close(): void {
    const cards = this.host.cards();
    if (!this.forced && this.timer !== null && cards?.sending()) { this.askCancel(); return; }
    super.close();
  }
  /** 停用外掛、手機關掉製卡：取消送出中的那一個，不問。 */
  forceClose(): void { this.forced = true; this.host.cards()?.cancel(); this.close(); }
  private stopTimer(): void { if (this.timer !== null) { window.clearInterval(this.timer); this.timer = null; } }

  /** 重開命令時有沒完成的工作就先問（§2、§5）。 */
  private start(): void {
    const cards = this.host.cards();
    if (!cards) { this.close(); return; }
    const jobs = cards.jobs();
    if (!jobs.length && !cards.broken) { this.showForm(); return; }
    const el = this.reset();
    this.inList = true;
    if (cards.broken) el.createEl('p', { text: TEXT.broken(cards.broken), cls: 'essence-cards-issue-note' });
    // 「做新的一課」放最上面、自成一列（使用者 2026-11-24：放在最後一列底下時，看起來像那一課的按鈕，以為被擋住進不去）。
    el.createDiv({ cls: 'essence-cards-issue' }).createDiv({ cls: 'essence-cards-issue-buttons' }).createEl('button', { text: TEXT.newLesson }).addEventListener('click', () => { this.showForm(); });
    for (const job of jobs) {
      const row = el.createDiv({ cls: 'essence-cards-issue' });
      if (job.save) {
        row.createEl('p', { text: TEXT.resumeSave(labelOf(job)) });
        const buttons = row.createDiv({ cls: 'essence-cards-issue-buttons' });
        buttons.createEl('button', { text: '繼續', cls: 'mod-cta' }).addEventListener('click', () => { this.job = job; void this.finish(cards.resume(job)); });
        buttons.createEl('button', { text: '放棄' }).addEventListener('click', () => { this.job = job; void this.abandon(); });
      } else if (directJob(job)) {
        // 直接製作的（§6〈中斷後接手〉）：收到了就接著存；沒收到或沒成功就重送、改用複製貼上或放棄，不自動重送（可能已經計費）。
        const api = directJob(job)!;
        const when = ago(Date.parse(api.at) || job.copiedMs, this.host.now());
        row.createEl('p', { text: api.received ? TEXT.resumeReceived(labelOf(job), when) : api.state === 'failed' ? TEXT.resumeFailed(labelOf(job), when) : TEXT.resumeNoReply(labelOf(job), when) });
        const buttons = row.createDiv({ cls: 'essence-cards-issue-buttons' });
        if (api.received) buttons.createEl('button', { text: '接著看', cls: 'mod-cta' }).addEventListener('click', () => { this.job = job; this.showPaste(null); });
        else this.directButtons(buttons, row.createEl('p', { cls: 'essence-cards-issue-note' }), api.state !== 'failed', job);
        buttons.createEl('button', { text: '放棄' }).addEventListener('click', () => { this.job = job; void this.abandon(); });
      } else {
        row.createEl('p', { text: TEXT.resumePaste(labelOf(job), ago(job.copiedMs, this.host.now())) });
        const buttons = row.createDiv({ cls: 'essence-cards-issue-buttons' });
        buttons.createEl('button', { text: '接著貼回', cls: 'mod-cta' }).addEventListener('click', () => { this.job = job; this.showPaste(null); });
        // 不會再貼回的（使用者 2026-11-24）：還沒寫任何檔、沒有預留 ID，放棄只是從這台電腦清掉這一筆。
        buttons.createEl('button', { text: '放棄' }).addEventListener('click', () => { this.job = job; void this.abandon(); });
      }
    }
  }
  private reset(): HTMLElement {
    this.stopTimer();
    this.inList = false;
    this.dropped = null;
    this.contentEl.empty();
    this.contentEl.addClass('essence-cards-ai');
    return this.contentEl;
  }

  /** 第一步：填單元（§2 的表）。 */
  private showForm(): void {
    const cards = this.host.cards();
    if (!cards) { this.close(); return; }
    const last = cards.last();
    const first = cards.subjects.find(each => each.key === last.subject) ?? cards.subjects[0];
    const form: CardForm = this.form ?? { subject: first.key, term: last.term ?? cards.terms(first.key)[0], unit: '', purpose: '準備段考', supplement: first.supplement, pick: cards.pick(first.key), adjust: '', material: '' };
    this.form = form;
    const el = this.reset();
    const grid = el.createDiv({ cls: 'essence-cards-ai-form' });
    const field = (label: string): HTMLElement => { grid.createEl('label', { text: label }); return grid.createDiv(); };
    const subject = field('科目').createEl('select', { cls: 'dropdown' });
    for (const each of cards.subjects) subject.createEl('option', { text: each.label, value: each.key });
    subject.value = form.subject;
    const term = field('年級學期').createEl('select', { cls: 'dropdown' });
    const fillTerms = (): void => {
      term.empty();
      for (const each of cards.terms(form.subject)) term.createEl('option', { text: each, value: each });
      term.value = form.term;
    };
    fillTerms();
    const unit = field('單元').createEl('input', { type: 'text', placeholder: form.subject === 'general' ? '例如「睡眠講座」' : '「編號 名稱」，例如「2-2 水溶液」' });
    unit.value = form.unit;
    const purpose = field('學習目的').createEl('select', { cls: 'dropdown' });
    for (const each of PURPOSES) purpose.createEl('option', { text: each, value: each });
    purpose.value = form.purpose;
    const supplement = field('允許 AI 補充').createEl('input', { type: 'checkbox' });
    supplement.checked = form.supplement;
    // 點選填空（D-182、D-210）：勾選旁邊附一句說明。
    const pickCell = field('點選填空');
    const pick = pickCell.createEl('input', { type: 'checkbox' });
    pick.checked = form.pick === true;
    pickCell.createSpan({ text: PICK_NOTE, cls: 'essence-cards-ai-pick-note' });
    const adjust = field('這次的調整').createEl('input', { type: 'text', placeholder: '選填，例如「這次最多 8 個目標」' });
    adjust.value = form.adjust;
    const material = field('教材').createEl('input', { type: 'text', placeholder: '選填，例如「課本 p.40～51 的照片」' });
    material.value = form.material;
    const direct = cards.canDirect();
    const files = direct ? this.materialField(field('教材檔'), () => { refresh(); }) : null;
    const rules = el.createEl('p', { cls: 'essence-cards-issue-note' });
    const same = el.createEl('p');
    const existing = el.createEl('p', { cls: 'essence-cards-issue-note' });
    const message = el.createEl('p', { cls: 'essence-cards-issue-note essence-cards-direct-message' });
    const buttons = el.createDiv({ cls: 'essence-cards-issue-buttons' });
    const send = direct ? buttons.createEl('button', { text: '直接製作' }) : null;
    const copy = buttons.createEl('button', { text: '複製提示', cls: 'mod-cta' });
    const preview = direct ? el.createEl('p', { cls: 'essence-cards-issue-note' }) : null;
    const refresh = (): void => {
      files?.();
      rules.setText('規則：' + cards.rulesLine(form.subject));
      const found = cards.sameUnit(form);
      same.setText(found.length ? `已經有：${found.map(each => `${each.name}（${each.status}）`).join('、')}。還是要做一份新的嗎？舊的不會動。` : '');
      const count = cards.existing(form);
      existing.setText(count === 'loading' ? '正在讀取卡組…' : count === 'unread' ? '還有卡組沒讀到（可能還在從 iCloud 下載），讀到才知道已有哪些學習目標' : count ? `會一起送出 ${String(count)} 個已有的學習目標` : '已有的學習目標：無');
      copy.disabled = this.busy || !form.unit.trim();
      // 直接製作（§2、§4〈送出前〉）：設好金鑰時是主按鈕；不能按時寫原因，能按時寫會送出什麼、約多少錢。
      if (send && preview) {
        const ready = cards.directPreview(form, this.materials);
        const ok = ready?.ok === true;
        send.disabled = this.busy || !ok;
        send.toggleClass('mod-cta', ok);
        copy.toggleClass('mod-cta', !ok);
        preview.setText(ready === null ? '' : ready.ok ? ready.line : ready.reason);
      }
    };
    subject.addEventListener('change', () => {
      form.subject = subject.value;
      form.supplement = cards.subjects.find(each => each.key === form.subject)?.supplement ?? false;
      supplement.checked = form.supplement;
      form.pick = cards.pick(form.subject);
      pick.checked = form.pick;
      fillTerms();
      refresh();
    });
    term.addEventListener('change', () => { form.term = term.value; refresh(); });
    unit.addEventListener('input', () => { form.unit = unit.value; refresh(); });
    purpose.addEventListener('change', () => { form.purpose = purpose.value as Purpose; });
    supplement.addEventListener('change', () => { form.supplement = supplement.checked; });
    pick.addEventListener('change', () => { form.pick = pick.checked; });
    adjust.addEventListener('input', () => { form.adjust = adjust.value; });
    material.addEventListener('input', () => { form.material = material.value; });
    send?.addEventListener('click', () => {
      this.busy = true;
      refresh();
      const label = labelOf({ form, subject: cards.subjects.find(each => each.key === form.subject) ?? cards.subjects[0] });
      void this.sendNow(label, progress => cards.direct({ ...form, unit: form.unit.trim() }, this.materials, progress)).then(blocked => {
        if (blocked === null) return;
        this.busy = false;
        this.showForm();
        this.contentEl.querySelector('.essence-cards-direct-message')?.setText(blocked);
      });
    });
    copy.addEventListener('click', () => {
      this.busy = true;
      refresh();
      void cards.copy({ ...form, unit: form.unit.trim() }).then(result => {
        this.busy = false;
        if ('error' in result) { message.setText(result.error); refresh(); return; }
        this.job = result.job;
        this.form = null;
        this.showPaste(result.chars);
      });
    });
    refresh();
    unit.focus();
  }

  /**
   * 第一步的「教材檔」（tasks/ai-direct.md §5）：選擇檔案或拖進來，PDF 讀總頁數；列出檔名、大小、頁數，可以拿掉。
   * 回傳重畫清單的函式；清單變了時呼叫 changed（重算預覽）。
   */
  private materialField(cell: HTMLElement, changed: () => void): () => void {
    const input = cell.createEl('input', { type: 'file', attr: { accept: '.pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png', multiple: '' } });
    input.hide();
    cell.createEl('button', { text: TEXT.files }).addEventListener('click', () => { input.click(); });
    const list = cell.createEl('ul');
    const note = cell.createDiv({ text: TEXT.filesNote, cls: 'essence-cards-ai-pick-note' });
    const problems = cell.createDiv({ cls: 'essence-cards-backup-problem' });
    const draw = (): void => {
      list.empty();
      this.materials.forEach((material, index) => {
        const pages = material.mediaType === 'application/pdf' ? `${material.pages === null ? '讀不出頁數' : `${String(material.pages)} 頁`}，` : '';
        const item = list.createEl('li', { text: `${material.name}（${pages}${size(material.data.length)}） ` });
        item.createEl('button', { text: '拿掉' }).addEventListener('click', () => { this.materials.splice(index, 1); changed(); });
      });
      note.toggle(!this.materials.length);
    };
    const add = async (picked: readonly File[]): Promise<void> => {
      const notes: string[] = [];
      for (const file of picked) {
        const type = materialType(file.name);
        if (!type) { notes.push(TEXT.notMaterial(file.name)); continue; }
        let data: Uint8Array;
        try { data = new Uint8Array(await file.arrayBuffer()); } catch { notes.push(TEXT.unreadable(file.name)); continue; }
        // pdf.js 可能把交給它的緩衝區移到背景執行緒，給它一份複本，送出的那一份才不會變成空的。
        const pages = type === 'application/pdf' ? await (this.host.pdfPages?.(data.slice()) ?? Promise.resolve(null)) : null;
        this.materials.push({ name: file.name, mediaType: type, data, pages, sha256: sha256OfBytes(data) });
      }
      problems.setText(notes.join(' '));
      changed();
    };
    input.addEventListener('change', () => { void add(Array.from(input.files ?? [])); input.value = ''; });
    this.dropped = files => { void add(files); };
    return draw;
  }

  /**
   * 送出中（§4 第 4 步）：等了多久、收到多少字；1 分鐘還沒有字時補一句；一直可以取消。
   * work 送出並交回結果；送出前就擋下時回傳原因（畫面回第一步），其他情況由這裡畫下一步，回傳 null。
   */
  private async sendNow(label: string, work: (progress: (event: ProgressEvent) => void) => Promise<DirectOutcome>): Promise<string | null> {
    const el = this.reset();
    const status = el.createEl('p', { text: `${label}：${TEXT.thinking(elapsed(0))}` });
    const slow = el.createEl('p', { cls: 'essence-cards-issue-note' });
    const retry = el.createEl('p', { cls: 'essence-cards-issue-note' });
    this.ask = el.createDiv();
    const buttons = el.createDiv({ cls: 'essence-cards-issue-buttons' });
    buttons.createEl('button', { text: '取消' }).addEventListener('click', () => { this.host.cards()?.cancel(); });
    const started = this.host.now();
    let chars = 0;
    const draw = (): void => {
      const time = elapsed(this.host.now() - started);
      status.setText(`${label}：${chars ? TEXT.receiving(chars, time) : TEXT.thinking(time)}`);
      slow.setText(!chars && this.host.now() - started >= 60_000 ? TEXT.slowStart : '');
    };
    this.timer = window.setInterval(draw, 1000);
    const outcome = await work(event => {
      if (event.type === 'text') { chars = event.totalChars; retry.setText(''); draw(); }
      else if (event.type === 'retrying') retry.setText(TEXT.retrying(Math.round(event.delayMs / 1000), event.attempt));
    });
    this.stopTimer();
    this.ask = null;
    this.busy = false;
    if (outcome.kind === 'blocked') return outcome.message;
    this.job = outcome.job;
    if (outcome.kind === 'received') {
      pasted.set(outcome.job.id, outcome.reply);
      this.showPaste(null);
    } else this.showFailure(outcome.failure);
    return null;
  }
  /** 送出中「要取消這一次嗎？」那一列（§6 最後一點）：畫在送出中畫面的按鈕上面。 */
  private ask: HTMLElement | null = null;
  private askCancel(): void {
    const el = this.ask;
    if (!el) return;
    el.empty();
    el.createEl('p', { text: TEXT.askCancel });
    const buttons = el.createDiv({ cls: 'essence-cards-issue-buttons' });
    buttons.createEl('button', { text: '取消這一次', cls: 'mod-warning' }).addEventListener('click', () => { this.host.cards()?.cancel(); });
    buttons.createEl('button', { text: '繼續等' }).addEventListener('click', () => { el.empty(); });
  }

  /** 送不成（§6 的表）：一句話、下一步；可以重送（同一份提示與教材）、改用複製貼上（複製同一份提示，教材自己附）或放棄。 */
  private showFailure(failure: DirectFailure): void {
    const cards = this.host.cards(), job = this.job;
    if (!cards || !job) { this.close(); return; }
    const el = this.reset();
    el.createEl('p', { text: `${labelOf(job)}：${failure.text}` });
    if (failure.next) el.createEl('p', { text: failure.next, cls: 'essence-cards-issue-note' });
    const message = el.createEl('p', { cls: 'essence-cards-issue-note' });
    const buttons = el.createDiv({ cls: 'essence-cards-issue-buttons' });
    this.directButtons(buttons, message, failure.afterResponse);
    buttons.createEl('button', { text: '放棄' }).addEventListener('click', () => { void this.abandon(); });
    buttons.createEl('button', { text: '關閉' }).addEventListener('click', () => { this.close(); });
  }
  /**
   * 「重送」與「改用複製貼上」（§6）：送不成的畫面、檢查不過的貼回畫面與重開時的清單共用。charged：服務可能已經回了或已經開始做，重送會再計費，按鈕寫出來。
   * 教材檔不存：這次開著 Obsidian 的期間記得的直接重送，重開過的先請家長重選（格式查核 F15）。
   */
  private directButtons(buttons: HTMLElement, message: HTMLElement, charged: boolean, of?: CardJob): void {
    const cards = this.host.cards(), job = of ?? this.job;
    if (!cards || !job) return;
    buttons.createEl('button', { text: charged ? '重送（會再計費一次）' : '重送', cls: 'mod-cta' }).addEventListener('click', () => {
      this.job = job;
      if (!cards.keeps(job)) { this.showReselect(charged); return; }
      this.resend();
    });
    buttons.createEl('button', { text: '改用複製貼上' }).addEventListener('click', () => {
      void cards.fallback(job).then(plain => {
        if (!plain) { message.setText('放不進剪貼簿；請再按一次'); return; }
        // 框裡放的是直接製作收到的那一份：改用複製貼上要貼的是別處的回覆，清空（L2 第一輪 R2）。
        pasted.delete(plain.id);
        this.job = plain;
        this.showPaste(null, true);
      });
    });
  }
  /** 重送（§6）：同一份提示；materials 是重開之後重選的教材檔，沒給就用這次記得的。 */
  private resend(materials?: readonly Material[]): void {
    const cards = this.host.cards(), job = this.job;
    if (!cards || !job) return;
    this.busy = true;
    void this.sendNow(labelOf(job), progress => cards.resend(job, progress, materials)).then(blocked => {
      if (blocked === null) return;
      this.busy = false;
      this.showFailure({ kind: 'unknown', text: blocked, next: '', afterResponse: false, settings: false });
    });
  }
  /** 重開過 Obsidian 之後的重送（F15）：重選教材檔，和上一次送的比雜湊，不同就提醒一句；快照記這次送的。 */
  private showReselect(charged: boolean): void {
    const cards = this.host.cards(), job = this.job;
    if (!cards || !job) { this.close(); return; }
    const before = directJob(job)?.files.map(file => file.sha256) ?? [];
    this.materials = [];
    const el = this.reset();
    el.createEl('p', { text: `${labelOf(job)}：${TEXT.reselect}` });
    const grid = el.createDiv({ cls: 'essence-cards-ai-form' });
    grid.createEl('label', { text: '教材檔' });
    const compare = el.createEl('p', { cls: 'essence-cards-issue-note' });
    const buttons = el.createDiv({ cls: 'essence-cards-issue-buttons' });
    const send = buttons.createEl('button', { text: charged ? '重送（會再計費一次）' : '重送', cls: 'mod-cta' });
    buttons.createEl('button', { text: '回上一步' }).addEventListener('click', () => { this.start(); });
    const draw = this.materialField(grid.createDiv(), () => { refresh(); });
    const refresh = (): void => {
      draw();
      const now = this.materials.map(material => material.sha256);
      compare.setText(!now.length ? '' : now.length === before.length && now.every((sha, i) => sha === before[i]) ? TEXT.same : TEXT.differs);
      send.disabled = this.busy || !now.length;
    };
    send.addEventListener('click', () => { this.resend([...this.materials]); });
    refresh();
  }

  /**
   * 第二、三步：已複製的說明、貼回、檢查、存成草稿（§2、§4）。chars 是剛複製的字數；接著貼回時是 null。
   * 收到的（tasks/ai-direct.md §4 第 5、6 步、§6）由工作決定：工作裡有直接製作收回的整段就放進框裡，自動檢查、寫用量，不問用的是哪一家、不再複製；
   * 檢查擋住時多「重送」與「改用複製貼上」。從哪個畫面回到這裡都一樣（L2 第一輪 R1：存草稿被擋下後「回上一步」）。
   * fallback 是剛按了改用複製貼上（同一份提示已經複製，教材家長自己附），只換第一行的說明。
   */
  private showPaste(chars: number | null, fallback = false): void {
    const cards = this.host.cards(), job = this.job;
    if (!cards || !job) { this.close(); return; }
    const received = !!directJob(job)?.received;
    const el = this.reset();
    el.createEl('p', { text: received ? TEXT.directPaste(labelOf(job)) + TEXT.received : fallback ? TEXT.fallback : (chars === null ? `${labelOf(job)}：` : TEXT.copied(chars)) + TEXT.next });
    const evidence = received ? directJob(job)?.received ?? null : null;
    if (evidence) el.createEl('p', { text: usageLine(evidence), cls: 'essence-cards-issue-note' });
    el.createEl('p', { text: TEXT.local(job.id), cls: 'essence-cards-issue-note' });
    if (!received) {
      const again = el.createDiv({ cls: 'essence-cards-issue-buttons' }).createEl('button', { text: chars === null ? '再複製一次提示' : '再複製一次' });
      again.addEventListener('click', () => { void cards.recopy(job).then(ok => { this.host.notify(ok ? '已複製提示' : '放不進剪貼簿；請再按一次'); }); });
    }
    const box = el.createEl('textarea', { cls: 'essence-cards-ai-paste', attr: { placeholder: TEXT.paste, rows: '12' } });
    // 重開 Obsidian 之後，收到的整段從工作裡拿回來（§7，F2）。
    box.value = pasted.get(job.id) ?? evidence?.text ?? '';
    // 直接製作收到的：哪一家、哪個模型由程式記（§7），不問家長。
    if (!received) {
      const service = el.createDiv({ cls: 'essence-cards-ai-form' });
      service.createEl('label', { text: '用的是（選填）' });
      const pick = service.createDiv().createEl('select', { cls: 'dropdown' });
      pick.createEl('option', { text: '不選', value: '' });
      for (const each of SERVICES) pick.createEl('option', { text: each, value: each });
      pick.value = this.service ?? '';
      pick.addEventListener('change', () => { this.service = pick.value || null; });
    }
    const result = el.createDiv();
    const message = el.createEl('p', { cls: 'essence-cards-issue-note' });
    const again = received ? el.createDiv({ cls: 'essence-cards-issue-buttons' }) : null;
    const buttons = el.createDiv({ cls: 'essence-cards-issue-buttons' });
    buttons.createEl('button', { text: '取消' }).addEventListener('click', () => { this.close(); });
    const checkButton = buttons.createEl('button', { text: '檢查' });
    const saveButton = buttons.createEl('button', { text: '存成草稿', cls: 'mod-cta' });
    const update = (): void => {
      const ready = !!this.inspection && !this.inspection.errors.length && (this.inspection.ended || this.confirmed);
      saveButton.toggle(!!this.inspection && !this.inspection.errors.length);
      saveButton.disabled = this.busy || !ready;
      checkButton.disabled = this.busy || !box.value.trim();
    };
    const check = (): void => {
      const inspection = cards.inspect(job, box.value);
      again?.empty();
      if ('error' in inspection) { result.setText(inspection.error); return; }
      this.inspection = inspection;
      this.confirmed = false;
      this.showResult(result, inspection, update, received);
      // 收到的回覆檢查不過或沒有 <<<完>>>（§6）：和貼回一樣顯示結果，多「重送」；服務已經回了，重送會再計費。
      if (again && (inspection.errors.length || !inspection.ended)) this.directButtons(again, message, true);
      update();
    };
    box.addEventListener('input', () => { pasted.set(job.id, box.value); this.inspection = null; this.confirmed = false; result.empty(); update(); });
    checkButton.addEventListener('click', check);
    saveButton.addEventListener('click', () => {
      this.busy = true;
      update();
      // 存的是檢查過的那一份、綁著看到的結果（D-226 第 5 點）：改過字的話 inspection 已經清掉，按不到這裡。
      const shown = this.inspection;
      if (!shown) return;
      void this.finish(cards.save(job, box.value, received ? null : this.service, inspectionKey(shown), received));
    });
    this.inspection = null;
    this.confirmed = false;
    if (received && box.value.trim()) check();
    else update();
  }

  /** 檢查的結果（§4 最後一點）：可以存時每一篇一列，底下列出提示；有擋住的只有原因與行號。 */
  private showResult(el: HTMLElement, inspection: Inspection, update: () => void, received = false): void {
    el.empty();
    if (inspection.errors.length) {
      el.createEl('p', { text: TEXT.blocked });
      const list = el.createEl('ul');
      for (const each of inspection.errors) list.createEl('li', { text: issueText(each) });
      return;
    }
    const taken = new Set(this.app.vault.getMarkdownFiles().map(file => file.basename.toLowerCase()));
    const list = el.createEl('ul');
    const cards = this.host.cards(), job = this.job;
    for (const piece of inspection.pieces) {
      // 手機建的檔名多了識別碼（tasks/phone-cards.md §2-3）：照會用的檔名比同名。
      const base = cards && job ? cards.nameOf(job, piece.name) : piece.name;
      const name = freeName(base, taken);
      const renamed = name === base ? '' : `（已有同名的卡組，這一篇存成「${name}」）`;
      list.createEl('li', { text: `${name}${renamed}：學習目標 ${String(piece.targets)}、題目 ${String(piece.prompts)}、候選卡片 ${String(piece.candidates)}、加進已有的學習目標 ${String(piece.adds.length)}` });
    }
    if (inspection.hints.length) {
      el.createEl('p', { text: TEXT.hints, cls: 'essence-cards-issue-note' });
      const hints = el.createEl('ul', { cls: 'essence-cards-issue-note' });
      const shown = received ? inspection.hints.map(hint => hint.message === UNENDED_HINT ? { ...hint, message: TEXT.directUnended } : hint) : inspection.hints;
      for (const group of groupHints(shown)) {
        const item = hints.createEl('li', { text: group.text });
        if (group.lines.length) { const lines = item.createEl('ul'); for (const line of group.lines) lines.createEl('li', { text: line }); }
      }
    }
    if (!inspection.ended) {
      const label = el.createEl('label', { cls: 'essence-cards-remind-off' });
      const box = label.createEl('input', { type: 'checkbox' });
      label.createEl('span', { text: received ? TEXT.confirmReceived : TEXT.confirmEnd });
      box.addEventListener('change', () => { this.confirmed = box.checked; update(); });
    }
  }

  /** 存成草稿或繼續之後（§5、§7）：成功就打開第一篇、通知；停下來寫原因與能選的。 */
  private async finish(work: Promise<Outcome>): Promise<void> {
    const el = this.reset();
    el.createEl('p', { text: TEXT.saving });
    const outcome = await work;
    this.busy = false;
    const job = this.job;
    if (outcome.kind === 'done') {
      if (job) pasted.delete(job.id);
      this.close();
      if (outcome.decks[0]) this.host.openNote(outcome.decks[0]);
      // 列實際的檔名：按下之後才出現同名時，名字會和檢查結果畫面的不同（tasks/phone-cards.md §2-3、L2 R5）。
      const names = outcome.decks.map(path => path.slice(path.lastIndexOf('/') + 1).replace(/\.md$/, '')).join('、');
      // 每一篇都跳過了：快照照樣存，沒有可以啟用的草稿（第二輪 P3）。
      this.host.notify(names ? `已存成草稿：${names}（${String(outcome.targets)} 個學習目標）。看過、改好後按「啟用」，孩子才看得到` : '這次的卡組都跳過了，沒有留下草稿');
      return;
    }
    const cards = this.host.cards();
    if (!cards || !job) { this.close(); return; }
    const box = this.reset();
    box.createEl('p', { text: outcome.message });
    const buttons = box.createDiv({ cls: 'essence-cards-issue-buttons' });
    const latest = cards.jobs().find(each => each.id === job.id);
    if (outcome.deck) {
      const { index, situation } = outcome.deck;
      buttons.createEl('button', { text: '跳過這一篇' }).addEventListener('click', () => { void this.finish(cards.choose(job, index, 'skip')); });
      if (situation === 'missing') buttons.createEl('button', { text: '重建這一篇' }).addEventListener('click', () => { void this.finish(cards.choose(job, index, 'rebuild')); });
    } else if (latest?.save) {
      buttons.createEl('button', { text: '繼續', cls: 'mod-cta' }).addEventListener('click', () => { void this.finish(cards.resume(job)); });
    } else if (latest) {
      buttons.createEl('button', { text: '回上一步', cls: 'mod-cta' }).addEventListener('click', () => { this.showPaste(null); });
    }
    if (latest?.save) buttons.createEl('button', { text: '放棄' }).addEventListener('click', () => { void this.abandon(); });
    buttons.createEl('button', { text: '關閉' }).addEventListener('click', () => { this.close(); });
  }

  /** 放棄（§5）：已寫成的卡組照樣是草稿、不刪；通知寫出留下了哪幾篇。 */
  private async abandon(): Promise<void> {
    const cards = this.host.cards(), job = this.job;
    if (!cards || !job) return;
    const result = await cards.abandon(job);
    if ('kind' in result) { await this.finish(Promise.resolve(result)); return; }
    pasted.delete(job.id);
    const names = result.left.map(path => path.slice(path.lastIndexOf('/') + 1, -3));
    this.host.notify(names.length ? `已放棄這次的製卡，沒有快照。留下的草稿：${names.join('、')}` : `已放棄這次的製卡（${labelOf(job)}），沒有留下任何卡組`);
    // 從清單上放棄還沒貼回的、清單還有別筆：留在清單，可以一筆接一筆清。
    if (!job.save && this.inList && cards.jobs().length) { this.job = null; this.start(); return; }
    this.close();
  }
}

/**
 * 命令「AI 製卡」與左側功能列的圖示（§2）。停用外掛時關掉開著的視窗。
 * 手機（tasks/phone-cards.md §2-1）：host.cards() 在設定頁沒打開時是 null，命令不列、圖示藏起來；refresh() 在開關變了時呼叫，關掉就關掉開著的視窗。
 */
export function wireAiCards(plugin: Plugin, host: AiCardsModalHost): { refresh(): void } {
  const modals = new Set<AiCardsModal>();
  // 停用外掛、手機關掉製卡：送出中的那一個直接取消，不問（§6）。
  const closeAll = (): void => { for (const modal of [...modals]) modal.forceClose(); };
  plugin.register(closeAll);
  const open = (): void => { if (host.cards()) new AiCardsModal(plugin.app, host, modals).open(); };
  const icon = plugin.addRibbonIcon('sparkles', 'Essence Cards：AI 製卡', open);
  plugin.addCommand({ id: 'ai-cards', name: TEXT.title, checkCallback: checking => {
    if (!host.cards()) return false;
    if (!checking) open();
    return true;
  } });
  const refresh = (): void => {
    const on = host.cards() !== null;
    icon.toggle(on);
    if (!on) closeAll();
  };
  refresh();
  return { refresh };
}
