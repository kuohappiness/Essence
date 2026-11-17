import { MarkdownView, Modal } from 'obsidian';
import type { App, Plugin } from 'obsidian';
import { deepenPending, groupHints, issueText } from '../core/ai/index.ts';
import type { DeepenInspection, DeepenJob } from '../core/ai/index.ts';
import { isDeckPath } from '../core/deck/index.ts';
import { SERVICES } from './ai-cards.ts';
import { limitedRead } from './deepen.ts';
import type { Deepen, DeepenOutcome } from './deepen.ts';

// 加深這一節的視窗（tasks/ai-cards-deepen.md §1）：沿用 AI 製卡的視窗，第一步換成加深的內容。只在電腦（D-134、D-039）。

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
};

/** 貼到一半的回覆：關掉視窗也留著（只在這次開著 Obsidian 的期間）。 */
const pasted = new Map<string, string>();

export interface DeepenHost {
  deepen: () => Deepen | null;
  /** 這一篇最新的全文（開著的用編輯器的字）；讀不到是 null。 */
  read: (path: string) => Promise<string | null>;
  openNote: (path: string) => void;
  notify: (message: string) => void;
  /** 打開時讀這一篇最多等多久（毫秒，預設同 deepen.ts 的 READ_WAIT；L2 R17），只在測試裡改。 */
  readWait?: number;
}

class DeepenModal extends Modal {
  private job: DeepenJob | null = null;
  private inspection: DeepenInspection | null = null;
  private confirmed = false;
  private service: string | null = null;
  private busy = false;
  private direction = '';
  private material = '';
  private readonly host: DeepenHost;
  /** 第幾次開始讀（L2 R17）：關掉或重試之後，前一次晚到的結果不接手。 */
  private round = 0;
  private readonly modals: Set<Modal>;
  readonly path: string;
  constructor(app: App, host: DeepenHost, modals: Set<Modal>, path: string) {
    super(app);
    this.host = host;
    this.modals = modals;
    this.path = path;
  }
  onOpen(): void {
    this.modals.add(this);
    this.modalEl.addClass('essence-cards-ai-modal');
    this.titleEl.setText(TEXT.title);
    void this.start();
  }
  onClose(): void { this.round++; this.modals.delete(this); this.contentEl.empty(); }
  private reset(): HTMLElement {
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
    if (job) { this.job = job; this.showPaste(null); return; }
    // 讀這一篇有上限（L2 R17）：讀不到、等不到就停在可以重試的訊息，不留空白的視窗。
    const round = ++this.round;
    let text: string | null;
    try { text = await limitedRead(this.host.read(this.path), this.host.readWait); } catch {
      if (round !== this.round) return;
      const el = this.reset();
      el.createEl('p', { text: TEXT.unreadable });
      const row = this.buttons(el);
      row.createEl('button', { text: '重試', cls: 'mod-cta' }).addEventListener('click', () => { void this.start(); });
      row.createEl('button', { text: '關閉' }).addEventListener('click', () => { this.close(); });
      return;
    }
    if (round !== this.round) return;
    if (text !== null && deepenPending(text)) {
      const el = this.reset();
      el.createEl('p', { text: TEXT.pending });
      const row = this.buttons(el);
      row.createEl('button', { text: '打開', cls: 'mod-cta' }).addEventListener('click', () => { this.close(); this.host.openNote(this.path); });
      row.createEl('button', { text: '仍要加深' }).addEventListener('click', () => { this.showForm(); });
      return;
    }
    this.showForm();
  }

  /** 第一步：篇名與三個數字、這次的方向、教材、複製提示（§1 第 2 點）。 */
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
    direction.addEventListener('input', () => { this.direction = direction.value; });
    const material = field('教材').createEl('input', { type: 'text', placeholder: '選填，例如「課本 p.40～51 的照片」' });
    material.value = this.material;
    material.addEventListener('input', () => { this.material = material.value; });
    const message = el.createEl('p', { cls: 'essence-cards-issue-note' });
    const copy = this.buttons(el).createEl('button', { text: '複製提示', cls: 'mod-cta' });
    copy.addEventListener('click', () => {
      copy.disabled = true;
      void deepen.copy(this.path, this.direction, this.material).then(result => {
        copy.disabled = false;
        if ('error' in result) { message.setText(result.error); return; }
        this.job = result.job;
        this.showPaste(result.chars);
      });
    });
    direction.focus();
  }

  /** 貼回與檢查（同製卡的第二、三步）。 */
  private showPaste(chars: number | null): void {
    const deepen = this.host.deepen(), job = this.job;
    if (!deepen || !job) { this.close(); return; }
    const el = this.reset();
    el.createEl('p', { text: (chars === null ? '加深的提示已複製，等你貼回。' : TEXT.copied(chars)) + TEXT.next });
    this.buttons(el).createEl('button', { text: '再複製一次提示' }).addEventListener('click', () => { void deepen.recopy(job).then(ok => { this.host.notify(ok ? '已複製提示' : '放不進剪貼簿；請再按一次'); }); });
    const box = el.createEl('textarea', { cls: 'essence-cards-ai-paste', attr: { placeholder: TEXT.paste, rows: '12' } });
    box.value = pasted.get(job.id) ?? '';
    const service = el.createDiv({ cls: 'essence-cards-ai-form' });
    service.createEl('label', { text: '用的是（選填）' });
    const pick = service.createDiv().createEl('select', { cls: 'dropdown' });
    pick.createEl('option', { text: '不選', value: '' });
    for (const each of SERVICES) pick.createEl('option', { text: each, value: each });
    pick.value = this.service ?? '';
    pick.addEventListener('change', () => { this.service = pick.value || null; });
    const result = el.createDiv();
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
    box.addEventListener('input', () => { pasted.set(job.id, box.value); this.inspection = null; this.confirmed = false; result.empty(); update(); });
    checkButton.addEventListener('click', () => {
      const inspection = deepen.inspect(job, box.value);
      if ('error' in inspection) { result.setText(inspection.error); return; }
      this.inspection = inspection;
      this.confirmed = false;
      this.showResult(result, inspection, update);
      update();
    });
    saveButton.addEventListener('click', () => {
      this.busy = true;
      update();
      void this.finish(deepen.save(job, box.value, this.service));
    });
    update();
  }

  private showResult(el: HTMLElement, inspection: DeepenInspection, update: () => void): void {
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
      for (const group of groupHints(inspection.hints)) {
        const item = hints.createEl('li', { text: group.text });
        if (group.lines.length) { const lines = item.createEl('ul'); for (const line of group.lines) lines.createEl('li', { text: line }); }
      }
    }
    if (!inspection.ended) {
      const label = el.createEl('label', { cls: 'essence-cards-remind-off' });
      const box = label.createEl('input', { type: 'checkbox' });
      label.createEl('span', { text: TEXT.confirmEnd });
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

/** 命令「加深這一節」（§1 第 1 點）：打開的是卡組筆記才可用。從提醒一區按「加深」走同一個入口（open）。停用外掛時關掉開著的視窗。 */
export function wireDeepen(plugin: Plugin, host: DeepenHost): { open: (path: string) => void } {
  const modals = new Set<Modal>();
  plugin.register(() => { for (const modal of [...modals]) modal.close(); });
  const open = (path: string): void => {
    const deepen = host.deepen();
    if (!deepen) return;
    // 同一篇已經開著視窗：不另開一份。
    if ([...modals].some(modal => modal instanceof DeepenModal && modal.path === path)) return;
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
