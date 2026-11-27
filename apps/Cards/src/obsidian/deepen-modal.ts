import { MarkdownView, Modal } from 'obsidian';
import type { App, Plugin } from 'obsidian';
import { deepenPending, directJob, groupHints, issueText } from '../core/ai/index.ts';
import type { DeepenInspection, DeepenJob } from '../core/ai/index.ts';
import { usageLine } from '../core/connect/index.ts';
import type { DirectFailure, Material, ProgressEvent } from '../core/connect/index.ts';
import { isDeckPath } from '../core/deck/index.ts';
import { PICK_NOTE, SERVICES } from './ai-cards.ts';
import { limitedRead } from './deepen.ts';
import type { Deepen, DeepenContext, DeepenDirectOutcome, DeepenOutcome } from './deepen.ts';
import { ago, askCancel, DIRECT_TEXT, materialField, sendingView } from './direct-ui.ts';

// 加深這一節的視窗（tasks/ai-cards-deepen.md §1）：沿用 AI 製卡的視窗，第一步換成加深的內容。只在電腦（D-134、D-039）。
// 直接製作（tasks/ai-direct.md §9）：第一步多一欄選填的教材檔、多一個「直接製作」；送出中、送不成、重送與收到的畫面和製卡的相同，
// 收完放進貼回的框、自動檢查，之後照加深原本的寫法。

const TEXT = {
  title: '加深這一節',
  counts: (name: string, c: { stable: number; weak: number; unstable: number }) => `${name}：記穩了 ${String(c.stable)}、常錯 ${String(c.weak)}、還沒記穩 ${String(c.unstable)}`,
  countsNote: '依複習紀錄判斷；目錄的顏色另外受到期與考試影響。',
  pending: '上一次加深的結果還沒審完（卡組最後面的加深框裡還有項目），要先打開嗎？',
  next: '下一步：到 ChatGPT、Gemini 或 Claude 開一個新對話，附上這一課的課本頁面，貼上提示送出；AI 回完後，按回覆裡程式碼區塊右上角的「複製」，貼在下面。',
  copied: (chars: number) => `已複製提示，共 ${chars.toLocaleString('en-US')} 字。`,
  paste: '把 AI 的整段回覆貼在這裡',
  confirmEnd: '我確定整段都貼了',
  blocked: '擋住了，改好再檢查（可以直接在上面改字）：',
  hints: '提示（可以寫）：',
  writing: '正在寫進卡組…',
  resume: '上一次的結果寫到一半，按「繼續」從停下的地方接著做。',
  unreadable: '讀不到這一篇（可能還在從 iCloud 下載）；等一下再按「重試」。',
  /** 加深送的是這一篇的地圖與記穩的目標，通常不用附課本（§9）。 */
  filesNote: '選填。加深通常不用附課本；要附的話放這一課的 PDF 或照片（JPG、PNG），也可以拖進來。',
  /** 重送的畫面（L2 第一輪小項 4）：上一次附了教材、重開過要重選的，這一欄是必選；上一次沒附的，不寫「上一次選的教材檔」。 */
  reselectNote: '上一次附了教材檔，選好才能重送；PDF 或照片（JPG、PNG），也可以拖進來。',
  resendNoFiles: '上一次沒有附教材檔，用同一份提示重送；照設定頁現在的服務與模型送出。',
  reading: '正在讀這一篇…',
  received: 'AI 回好了，整段已經放進下面的框、檢查過；看過結果再寫進卡組。',
  /** 收到的回覆沒有 <<<完>>>（同製卡的 L2 第一輪 R3）：不是家長沒複製完，是 AI 沒寫完。 */
  directUnended: '最後一行不是 <<<完>>>：AI 可能沒寫完（例如回答太長被截斷）。可以按下面的「重送（會再計費一次）」，或確定內容完整再勾選、寫進卡組',
  confirmReceived: '我確定這一段是完整的',
  fallback: '已複製同一份提示；到 ChatGPT、Gemini 或 Claude 開一個新對話，貼上提示送出（有教材檔的自己附上）；AI 回完後，按回覆裡程式碼區塊右上角的「複製」，貼在下面。',
  /** 重開加深時，上一次直接送出還沒有結果（§6〈中斷後接手〉）：不自動重送（可能已經計費）。 */
  heldNoReply: (when: string) => `上一次直接送出沒有收到回覆，可能已經送出並計費（${when}送出）。`,
  heldFailed: (when: string) => `上一次直接製作沒有成功（${when}）。`,
};

/** 貼到一半的回覆：關掉視窗也留著（只在這次開著 Obsidian 的期間）。直接製作收回的整段也放這裡。 */
const pasted = new Map<string, string>();

const nameOf = (path: string): string => path.slice(path.lastIndexOf('/') + 1).replace(/\.md$/, '');

export interface DeepenHost {
  deepen: () => Deepen | null;
  /** 這一篇最新的全文（開著的用編輯器的字）；讀不到是 null。 */
  read: (path: string) => Promise<string | null>;
  openNote: (path: string) => void;
  notify: (message: string) => void;
  /** 打開時讀這一篇最多等多久（毫秒，預設同 deepen.ts 的 READ_WAIT；L2 R17），只在測試裡改。 */
  readWait?: number;
  /** 送出中等了多久、上一次是多久以前（預設 Date.now）。 */
  now?: () => number;
  /** PDF 的總頁數（tasks/ai-direct.md §5）；讀不出來是 null。 */
  pdfPages?: (data: Uint8Array) => Promise<number | null>;
  /** 打開設定頁的 Essence Cards 分頁（金鑰、模型要到那裡改）。 */
  openSettings?: () => void;
}

class DeepenModal extends Modal {
  private job: DeepenJob | null = null;
  private inspection: DeepenInspection | null = null;
  private confirmed = false;
  private service: string | null = null;
  private busy = false;
  private direction = '';
  private material = '';
  /** 這次勾不勾點選填空（D-210 第 3 點）；null 是還沒開過表單，照這一科記的。 */
  private pick: boolean | null = null;
  /** 第一步選的教材檔（§9 選填）：只在這個視窗開著的期間，內容不存。 */
  private materials: Material[] = [];
  /** 這一篇讀好的材料（送出前那一行用）：表單打開時讀一次；讀不到是原因。 */
  private ctx: DeepenContext | { error: string } | null = null;
  /** 回到第一步時要顯示的原因（直接製作在送出前就被擋下）。 */
  private notice = '';
  /**
   * 送出中的畫面與送出的那個流程；畫面換掉或關掉時停計時器。流程在送出時拿好（PR #99 的 GitHub 審查）：停用外掛時 host.deepen() 已經是 null，
   * 關視窗照樣要中止得到。
   */
  private view: { ask: HTMLElement; stop: () => void; flow: Deepen } | null = null;
  /** 關掉視窗前問過要不要取消送出中的那一個（§6 最後一點）；停用外掛時不問。 */
  private forced = false;
  /** 拖進視窗的檔交給誰（§5）：只有畫著教材欄的畫面有。 */
  private dropped: ((files: readonly File[]) => void) | null = null;
  private readonly host: DeepenHost;
  /** 第幾次開始讀（L2 R17）：關掉或重試之後，前一次晚到的結果不接手。 */
  private round = 0;
  private readonly modals: Set<DeepenModal>;
  readonly path: string;
  constructor(app: App, host: DeepenHost, modals: Set<DeepenModal>, path: string) {
    super(app);
    this.host = host;
    this.modals = modals;
    this.path = path;
  }
  onOpen(): void {
    this.modals.add(this);
    this.modalEl.addClass('essence-cards-ai-modal');
    this.titleEl.setText(TEXT.title);
    // 從檔案總管拖進整個視窗（§5）：沒有教材欄的畫面不攔。
    this.contentEl.addEventListener('dragover', event => { if (this.dropped) event.preventDefault(); });
    this.contentEl.addEventListener('drop', event => {
      if (!this.dropped) return;
      event.preventDefault();
      this.dropped(Array.from(event.dataTransfer?.files ?? []));
    });
    void this.start();
  }
  onClose(): void { this.stopView(); this.round++; this.modals.delete(this); this.contentEl.empty(); }
  /** 送出中按關閉（Esc、右上角的 ×）：先問要不要取消（§6）；停用外掛時直接關。 */
  close(): void {
    const view = this.view;
    if (!this.forced && view?.flow.sending()) { askCancel(view.ask, () => { this.forceClose(); }); return; }
    super.close();
  }
  /** 停用外掛、按關閉後選了「取消這一次」：取消送出中的那一個，不再問。 */
  forceClose(): void { this.forced = true; this.view?.flow.abort(); this.close(); }
  private now(): number { return this.host.now?.() ?? Date.now(); }
  private stopView(): void { this.view?.stop(); this.view = null; }
  private reset(): HTMLElement {
    this.stopView();
    this.dropped = null;
    this.contentEl.empty();
    this.contentEl.addClass('essence-cards-ai');
    return this.contentEl;
  }
  private buttons(el: HTMLElement): HTMLElement { return el.createDiv({ cls: 'essence-cards-issue-buttons' }); }

  /** 防重（§1 第 3 點）：有還沒完成的工作就打開那一份；有待審核的先問。 */
  private async start(): Promise<void> {
    const deepen = this.host.deepen();
    if (!deepen) { this.close(); return; }
    const job = deepen.jobOf(this.path);
    if (job?.save) { this.job = job; this.showStop(job.save.unclear ? { kind: 'stop', message: TEXT.resume, unclear: true } : { kind: 'stop', message: TEXT.resume, unclear: false }); return; }
    if (job) {
      this.job = job;
      // 直接送出還沒有結果的（§9、§6）：重送、改用複製貼上或取消；收到了的接著看。
      const api = directJob(job);
      if (api && !api.received) this.showHeld(); else this.showPaste(null);
      return;
    }
    // 讀這一篇有上限（L2 R17）：讀不到、等不到就停在可以重試的訊息，不留空白的視窗。
    // 讀到空（剛被移走、刪掉或同步中暫時看不到）也一樣（L2 R19）。
    const round = ++this.round;
    let text: string;
    try {
      const read = await limitedRead(this.host.read(this.path), this.host.readWait);
      if (read === null) throw Error('missing');
      text = read;
    } catch {
      if (round !== this.round) return;
      const el = this.reset();
      el.createEl('p', { text: TEXT.unreadable });
      const row = this.buttons(el);
      row.createEl('button', { text: '重試', cls: 'mod-cta' }).addEventListener('click', () => { void this.start(); });
      row.createEl('button', { text: '關閉' }).addEventListener('click', () => { this.close(); });
      return;
    }
    if (round !== this.round) return;
    if (deepenPending(text)) {
      const el = this.reset();
      el.createEl('p', { text: TEXT.pending });
      const row = this.buttons(el);
      row.createEl('button', { text: '打開', cls: 'mod-cta' }).addEventListener('click', () => { this.close(); this.host.openNote(this.path); });
      row.createEl('button', { text: '仍要加深' }).addEventListener('click', () => { this.showForm(); });
      return;
    }
    this.showForm();
  }

  /** 第一步：篇名與三個數字、這次的方向、教材、複製提示或直接製作（§1 第 2 點、tasks/ai-direct.md §9）。 */
  private showForm(): void {
    const deepen = this.host.deepen();
    if (!deepen) { this.close(); return; }
    const now = deepen.ready(this.path);
    const el = this.reset();
    if (!now.ok) { el.createEl('p', { text: now.why }); this.buttons(el).createEl('button', { text: '關閉' }).addEventListener('click', () => { this.close(); }); return; }
    el.createEl('p', { text: TEXT.counts(now.name, now.counts) });
    el.createEl('p', { text: TEXT.countsNote, cls: 'essence-cards-issue-note' });
    const grid = el.createDiv({ cls: 'essence-cards-ai-form' });
    const field = (label: string): HTMLElement => { grid.createEl('label', { text: label }); return grid.createDiv(); };
    const direction = field('這次的方向').createEl('input', { type: 'text', placeholder: '選填，例如「這次不要課外」' });
    direction.value = this.direction;
    const material = field('教材').createEl('input', { type: 'text', placeholder: '選填，例如「課本 p.40～51 的照片」' });
    material.value = this.material;
    const pickCell = field('點選填空');
    const pick = pickCell.createEl('input', { type: 'checkbox' });
    this.pick ??= deepen.pick(this.path);
    pick.checked = this.pick;
    pickCell.createSpan({ text: PICK_NOTE, cls: 'essence-cards-ai-pick-note' });
    const direct = deepen.canDirect();
    const files = direct ? materialField(field('教材檔'), this.materials, TEXT.filesNote, this.host.pdfPages, () => { refresh(); }) : null;
    if (files) this.dropped = picked => { void files.add(picked); };
    const message = el.createEl('p', { text: this.notice, cls: 'essence-cards-issue-note' });
    this.notice = '';
    const row = this.buttons(el);
    const send = direct ? row.createEl('button', { text: '直接製作' }) : null;
    const copy = row.createEl('button', { text: '複製提示', cls: 'mod-cta' });
    const preview = direct ? el.createEl('p', { cls: 'essence-cards-issue-note' }) : null;
    const settings = direct ? this.settingsButton(row) : null;
    // 表單打開時讀不到（例如還在從 iCloud 下載）：不必關掉視窗重開，按這個再讀一次（L2 第一輪 R4）。
    const reread = direct ? row.createEl('button', { text: '再讀一次' }) : null;
    const load = (): void => {
      const round = this.round;
      void deepen.context(this.path).then(ctx => {
        if (round !== this.round) return;
        this.ctx = ctx;
        refresh();
      });
    };
    const refresh = (): void => {
      files?.draw();
      copy.disabled = this.busy;
      if (!send || !preview) return;
      // 直接製作（§9，同製卡的 §2、§4〈送出前〉）：設好金鑰時是主按鈕；不能按時寫原因，能按時寫會送出什麼、約多少錢。
      const ctx = this.ctx;
      const ready = ctx === null ? { ok: false as const, reason: TEXT.reading } : 'error' in ctx ? { ok: false as const, reason: ctx.error }
        : deepen.directPreview(ctx, this.direction, this.material, this.pick ?? undefined, this.materials);
      const ok = ready?.ok === true;
      send.disabled = this.busy || !ok;
      send.toggleClass('mod-cta', ok);
      copy.toggleClass('mod-cta', !ok);
      preview.setText(ready === null ? '' : ready.ok ? ready.line : ready.reason);
      if (ready && !ready.ok && 'settings' in ready && ready.settings) settings?.show(); else settings?.hide();
      if (ctx !== null && 'error' in ctx && !this.busy) reread?.show(); else reread?.hide();
    };
    reread?.addEventListener('click', () => { this.ctx = null; refresh(); load(); });
    direction.addEventListener('input', () => { this.direction = direction.value; refresh(); });
    material.addEventListener('input', () => { this.material = material.value; refresh(); });
    pick.addEventListener('change', () => { this.pick = pick.checked; refresh(); });
    send?.addEventListener('click', () => {
      this.busy = true;
      refresh();
      void this.sendNow(deepen, progress => deepen.direct(this.path, this.direction, this.material, this.pick ?? undefined, this.materials, progress)).then(blocked => {
        if (blocked === null) return;
        this.busy = false;
        this.notice = blocked;
        this.showForm();
      });
    });
    copy.addEventListener('click', () => {
      this.busy = true;
      refresh();
      void deepen.copy(this.path, this.direction, this.material, this.pick ?? undefined).then(result => {
        this.busy = false;
        if ('error' in result) { message.setText(result.error); refresh(); return; }
        this.job = result.job;
        this.showPaste(result.chars);
      });
    });
    // 送出前那一行用的材料：表單打開時讀一次（按下直接製作時會再讀一次最新的）。
    if (direct && this.ctx === null) load();
    refresh();
    direction.focus();
  }

  /**
   * 送出中（§4 第 4 步）：work 送出並交回結果；送出前就擋下時回傳原因，其他情況由這裡畫下一步，回傳 null。
   */
  private async sendNow(flow: Deepen, work: (progress: (event: ProgressEvent) => void) => Promise<DeepenDirectOutcome>): Promise<string | null> {
    const el = this.reset();
    const view = sendingView(el, nameOf(this.path), () => this.now(), () => { flow.abort(); });
    this.view = { ...view, flow };
    const outcome = await work(event => { view.progress(event); });
    this.stopView();
    this.busy = false;
    if (outcome.kind === 'blocked') return outcome.message;
    this.job = outcome.job;
    if (outcome.kind === 'received') {
      pasted.set(outcome.job.id, outcome.reply);
      this.showPaste(null);
    } else this.showFailure(outcome.failure);
    return null;
  }
  /** 「打開設定頁」：關掉加深視窗再開設定頁，工作留著；主程式沒給開法時不畫。 */
  private settingsButton(row: HTMLElement): HTMLElement | null {
    const open = this.host.openSettings;
    if (!open) return null;
    const button = row.createEl('button', { text: '打開設定頁' });
    button.addEventListener('click', () => { this.close(); open(); });
    return button;
  }
  /** 重開時上一次直接送出還沒有結果（§6〈中斷後接手〉）：重送、改用複製貼上或取消，不自動重送。 */
  private showHeld(): void {
    const job = this.job, api = job && directJob(job);
    if (!job || !api) { this.close(); return; }
    const el = this.reset();
    const when = ago(Date.parse(api.at) || job.copiedMs, this.now());
    el.createEl('p', { text: `${nameOf(job.deck)}：${api.state === 'failed' ? TEXT.heldFailed(when) : TEXT.heldNoReply(when)}` });
    const message = el.createEl('p', { cls: 'essence-cards-issue-note' });
    const row = this.buttons(el);
    this.directButtons(row, message, api.state !== 'failed' || api.charged === true);
    row.createEl('button', { text: '取消這次加深' }).addEventListener('click', () => { void this.cancel(); });
    row.createEl('button', { text: '關閉' }).addEventListener('click', () => { this.close(); });
  }
  /** 送不成（§6 的表）：一句話、下一步；重送、改用複製貼上或取消這次加深。 */
  private showFailure(failure: DirectFailure): void {
    const job = this.job;
    if (!job) { this.close(); return; }
    const el = this.reset();
    el.createEl('p', { text: `${nameOf(job.deck)}：${failure.text}` });
    if (failure.next) el.createEl('p', { text: failure.next, cls: 'essence-cards-issue-note' });
    const message = el.createEl('p', { cls: 'essence-cards-issue-note' });
    const row = this.buttons(el);
    // 收到過回覆的那一份已經付過一次（同製卡的 L2 第三輪 T2）：重送會再計費。
    this.directButtons(row, message, failure.afterResponse || !!directJob(job)?.received);
    if (failure.settings) this.settingsButton(row);
    // 重送的是收到過的那一份：沒成功時它還在（同製卡的 L2 第二輪 S2）。
    if (directJob(job)?.received) row.createEl('button', { text: '回到收到的回覆' }).addEventListener('click', () => { this.showPaste(null); });
    row.createEl('button', { text: '取消這次加深' }).addEventListener('click', () => { void this.cancel(); });
    row.createEl('button', { text: '關閉' }).addEventListener('click', () => { this.close(); });
  }
  /** 「重送」與「改用複製貼上」（§6）：charged 是服務可能已經回了或已經開始做，重送會再計費，按鈕寫出來。 */
  private directButtons(row: HTMLElement, message: HTMLElement, charged: boolean): void {
    const deepen = this.host.deepen(), job = this.job;
    if (!deepen || !job) return;
    // 一律先到重送的畫面（同製卡的 L2 第一輪 R9）：寫出照現在的設定會送到哪一家、哪個模型、約多少錢，再按一次才送。
    row.createEl('button', { text: charged ? '重送（會再計費一次）' : '重送', cls: 'mod-cta' }).addEventListener('click', () => { this.showResend(charged); });
    row.createEl('button', { text: '改用複製貼上' }).addEventListener('click', () => {
      void deepen.fallback(job).then(plain => {
        if (!plain) { message.setText('放不進剪貼簿；請再按一次'); return; }
        // 框裡放的是直接製作收到的那一份：改用複製貼上要貼的是別處的回覆，清空（同製卡的 L2 第一輪 R2）。
        pasted.delete(plain.id);
        this.job = plain;
        this.showPaste(null, true);
      });
    });
  }
  /**
   * 重送的畫面（§6）：送出前那一行照現在的設定寫。這次開著 Obsidian 的期間記得教材檔的、上一次沒附教材的直接用；
   * 重開過、上一次有附的先重選（F15），和上一次送的比雜湊，不同就提醒一句。
   */
  private showResend(charged: boolean): void {
    const deepen = this.host.deepen(), job = this.job;
    if (!deepen || !job) { this.close(); return; }
    const kept = deepen.keeps(job);
    const before = directJob(job)?.files.map(file => file.sha256) ?? [];
    this.materials = [];
    const el = this.reset();
    el.createEl('p', { text: `${nameOf(job.deck)}：${!kept ? DIRECT_TEXT.reselect : before.length ? DIRECT_TEXT.resendKept : TEXT.resendNoFiles}` });
    let files: { draw(): void } | null = null;
    if (!kept) {
      const grid = el.createDiv({ cls: 'essence-cards-ai-form' });
      grid.createEl('label', { text: '教材檔' });
      const field = materialField(grid.createDiv(), this.materials, TEXT.reselectNote, this.host.pdfPages, () => { refresh(); });
      this.dropped = picked => { void field.add(picked); };
      files = field;
    }
    const compare = el.createEl('p', { cls: 'essence-cards-issue-note' });
    const line = el.createEl('p', { cls: 'essence-cards-issue-note' });
    const row = this.buttons(el);
    const send = row.createEl('button', { text: charged ? '重送（會再計費一次）' : '重送', cls: 'mod-cta' });
    const settings = this.settingsButton(row);
    row.createEl('button', { text: '回上一步' }).addEventListener('click', () => { void this.start(); });
    const picked = (): Material[] | undefined => kept ? undefined : [...this.materials];
    const refresh = (): void => {
      files?.draw();
      const now = this.materials.map(material => material.sha256);
      compare.setText(kept || !now.length ? '' : now.length === before.length && now.every((sha, i) => sha === before[i]) ? DIRECT_TEXT.same : DIRECT_TEXT.differs);
      const ready = kept || now.length ? deepen.resendPreview(job, picked()) : null;
      line.setText(ready === null ? '' : ready.ok ? ready.line : ready.reason);
      if (ready && !ready.ok && ready.settings) settings?.show(); else settings?.hide();
      send.disabled = this.busy || ready?.ok !== true;
    };
    send.addEventListener('click', () => {
      const materials = picked();
      this.busy = true;
      void this.sendNow(deepen, progress => deepen.resend(job, progress, materials)).then(blocked => {
        if (blocked === null) return;
        this.busy = false;
        this.showFailure({ kind: 'unknown', text: blocked, next: '', afterResponse: false, settings: false });
      });
    });
    refresh();
  }

  /**
   * 貼回與檢查（同製卡的第二、三步）。直接製作收到的（§9）：整段放進框裡、自動檢查、寫用量，不問用的是哪一家、不再複製；
   * 檢查擋住或沒有 <<<完>>> 時多「重送」與「改用複製貼上」。fallback 是剛按了改用複製貼上，只換第一行的說明。
   */
  private showPaste(chars: number | null, fallback = false): void {
    const deepen = this.host.deepen(), job = this.job;
    if (!deepen || !job) { this.close(); return; }
    const evidence = directJob(job)?.received ?? null;
    const received = evidence !== null;
    const el = this.reset();
    el.createEl('p', { text: received ? `${nameOf(job.deck)}：${TEXT.received}` : fallback ? TEXT.fallback : (chars === null ? '加深的提示已複製，等你貼回。' : TEXT.copied(chars)) + TEXT.next });
    if (evidence) el.createEl('p', { text: usageLine(evidence), cls: 'essence-cards-issue-note' });
    else this.buttons(el).createEl('button', { text: '再複製一次提示' }).addEventListener('click', () => { void deepen.recopy(job).then(ok => { this.host.notify(ok ? '已複製提示' : '放不進剪貼簿；請再按一次'); }); });
    const box = el.createEl('textarea', { cls: 'essence-cards-ai-paste', attr: { placeholder: TEXT.paste, rows: '12' } });
    // 重開 Obsidian 之後，收到的整段從工作裡拿回來（§7，F2）；框被清空過也一樣（加深第 3 批 L2 R7）。
    const kept = pasted.get(job.id);
    box.value = kept ? kept : evidence?.text ?? '';
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
    const again = received ? this.buttons(el) : null;
    const row = this.buttons(el);
    row.createEl('button', { text: '取消這次加深' }).addEventListener('click', () => { void this.cancel(); });
    const checkButton = row.createEl('button', { text: '檢查' });
    const saveButton = row.createEl('button', { text: '寫進卡組', cls: 'mod-cta' });
    const update = (): void => {
      const ready = !!this.inspection && !this.inspection.errors.length && (this.inspection.ended || this.confirmed);
      saveButton.toggle(!!this.inspection && !this.inspection.errors.length);
      saveButton.disabled = this.busy || !ready;
      checkButton.disabled = this.busy || !box.value.trim();
    };
    const check = (): void => {
      const inspection = deepen.inspect(job, box.value);
      again?.empty();
      if ('error' in inspection) { result.setText(inspection.error); return; }
      this.inspection = inspection;
      this.confirmed = false;
      this.showResult(result, inspection, update, received);
      // 收到的回覆檢查不過或沒有 <<<完>>>（§6）：多「重送」；服務已經回了，重送會再計費。
      if (again && (inspection.errors.length || !inspection.ended)) this.directButtons(again, message, true);
      update();
    };
    box.addEventListener('input', () => { pasted.set(job.id, box.value); this.inspection = null; this.confirmed = false; result.empty(); again?.empty(); update(); });
    checkButton.addEventListener('click', check);
    saveButton.addEventListener('click', () => {
      this.busy = true;
      update();
      void this.finish(deepen.save(job, box.value, received ? null : this.service, received));
    });
    this.inspection = null;
    this.confirmed = false;
    if (received && box.value.trim()) check();
    else update();
  }

  private showResult(el: HTMLElement, inspection: DeepenInspection, update: () => void, received = false): void {
    el.empty();
    if (inspection.errors.length) {
      el.createEl('p', { text: TEXT.blocked });
      const list = el.createEl('ul');
      for (const each of inspection.errors) list.createEl('li', { text: issueText(each) });
      return;
    }
    const c = inspection.counts;
    el.createEl('p', { text: inspection.nothing ? '這一節目前沒有更深的內容：不寫卡組，只記下這次加深。' : `新的學習目標 ${String(c.targets)}（題目 ${String(c.prompts)}）、補題 ${String(c.adds)}、候選卡片 ${String(c.candidates)}、給家長的備註 ${String(c.notes)}。會放進卡組最後面的加深框，按「加入」才進卡組。` });
    if (inspection.hints.length) {
      el.createEl('p', { text: TEXT.hints, cls: 'essence-cards-issue-note' });
      const hints = el.createEl('ul', { cls: 'essence-cards-issue-note' });
      // 收到的沒有 <<<完>>>：換成直接製作的說法（不是家長沒複製完）。行號照原本的那一則。
      const shown = received && !inspection.ended ? inspection.hints.map(hint => hint.message.startsWith('最後一行不是 <<<完>>>') ? { ...hint, message: TEXT.directUnended } : hint) : inspection.hints;
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

  private async finish(work: Promise<DeepenOutcome>): Promise<void> {
    const el = this.reset();
    el.createEl('p', { text: TEXT.writing });
    const outcome = await work;
    this.busy = false;
    if (outcome.kind === 'done') {
      if (this.job) pasted.delete(this.job.id);
      this.close();
      if (outcome.wrote) { this.host.openNote(outcome.path); this.host.notify('已寫進卡組最後面的加深框；看過之後按「加入」才進卡組'); }
      else this.host.notify('這一節目前沒有更深的內容，已記下這次加深');
      return;
    }
    this.showStop(outcome);
  }

  /** 停下來（§3-2）：還能接著做的給「繼續」；結果不明的給「當作完成」「放棄」。 */
  private showStop(outcome: Extract<DeepenOutcome, { kind: 'stop' }>): void {
    const deepen = this.host.deepen(), job = this.job;
    if (!deepen || !job) { this.close(); return; }
    const el = this.reset();
    el.createEl('p', { text: outcome.message });
    const row = this.buttons(el);
    const latest = deepen.jobs().find(each => each.id === job.id);
    if (outcome.unclear && latest?.save) {
      row.createEl('button', { text: '打開卡組' }).addEventListener('click', () => { this.host.openNote(job.deck); });
      row.createEl('button', { text: '當作完成', cls: 'mod-cta' }).addEventListener('click', () => { void this.finish(deepen.settle(job)); });
    } else if (latest?.save) {
      row.createEl('button', { text: '繼續', cls: 'mod-cta' }).addEventListener('click', () => { void this.finish(deepen.resume(job)); });
    } else if (latest) {
      row.createEl('button', { text: '回上一步', cls: 'mod-cta' }).addEventListener('click', () => { this.showPaste(null); });
    }
    if (latest) row.createEl('button', { text: latest.save ? '放棄' : '取消這次加深' }).addEventListener('click', () => { void this.cancel(); });
    row.createEl('button', { text: '關閉' }).addEventListener('click', () => { this.close(); });
  }

  private async cancel(): Promise<void> {
    const deepen = this.host.deepen(), job = this.job;
    if (!deepen || !job) return;
    const wrote = !!deepen.jobs().find(each => each.id === job.id)?.save?.writing;
    const result = await deepen.cancel(job);
    if (result.kind === 'stop') { this.showStop(result); return; }
    pasted.delete(job.id);
    this.close();
    this.host.notify(wrote ? '已放棄這次加深：卡組裡已經寫進去的框留著，加入或刪掉由你決定' : '已取消這次加深');
  }
}

/** 命令「加深這一節」（§1 第 1 點）：打開的是卡組筆記才可用。從提醒一區按「加深」走同一個入口（open）。停用外掛時關掉開著的視窗、取消送出中的那一個。 */
export function wireDeepen(plugin: Plugin, host: DeepenHost): { open: (path: string) => void } {
  const modals = new Set<DeepenModal>();
  plugin.register(() => { for (const modal of [...modals]) modal.forceClose(); });
  const open = (path: string): void => {
    const deepen = host.deepen();
    if (!deepen) return;
    // 同一篇已經開著視窗：不另開一份。
    if ([...modals].some(modal => modal.path === path)) return;
    new DeepenModal(plugin.app, host, modals, path).open();
  };
  plugin.addCommand({
    id: 'deepen',
    name: TEXT.title,
    checkCallback: checking => {
      const file = plugin.app.workspace.getActiveViewOfType(MarkdownView)?.file;
      if (!file || !isDeckPath(file.path) || !host.deepen()) return false;
      if (!checking) open(file.path);
      return true;
    },
  });
  return { open };
}
