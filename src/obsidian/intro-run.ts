import { MarkdownView, Modal, type App, type WorkspaceLeaf } from 'obsidian';
import { boxBatch, boxOf, refOf, WHY } from '../core/ai/index.ts';
import type { ItemRef } from '../core/ai/index.ts';
import type { AddResult, State, WriteBlock } from '../state/index.ts';
import type { AddRequest } from './intro-add.ts';
import { editorOf } from './save.ts';

// 引言框的「加入」按下去之後（tasks/ai-cards-add.md §2、§4）：「全部加入」先問、確認到寫入之間變了重新問；交給 state 寫；做完一則通知。
// 同一篇同時只跑一個加入（按鈕停用、雙擊不跑兩次）；寫進磁碟逾時的那一篇，這次開著 Obsidian 的期間不再加入。

const deckName = (path: string): string => path.slice(path.lastIndexOf('/') + 1).replace(/\.md$/, '');
/** 通知裡那一項的名字：第一行去掉清單符號、行尾 ID；連結取顯示的字。 */
function itemName(ref: ItemRef): string {
  const first = ref.original.split('\n')[0].replace(/^\s*(?:[-*+]|\d+[.)])\s+/, '').replace(/\s+\^[A-Za-z0-9-]+\s*$/, '');
  return first.replace(/\[\[[^\]|]*\|([^\]]*)\]\]/g, '$1').replace(/\[\[([^\]]*)\]\]/g, '$1').trim();
}

const ADD_TIPS = {
  unsaved: '這篇筆記有還沒存進去的修改，先不加入；等一下再按一次',
  stale: '這篇筆記剛剛改過，請再按一次',
  failed: '這篇筆記暫時存不進去，沒有加入；請稍後再按一次',
  changed: '框裡的項目一直在變，沒有加入；請再按一次',
  existing: '加進已有的學習目標還不能加入',
  locked: (path: string): string => `「${deckName(path)}」的寫入還沒確定，請重開 Obsidian 後再按`,
  saved: (path: string): string => `「${deckName(path)}」可能已經寫好，請再按一次`,
  moved: (count: number): string => `已把 ${String(count)} 個候選卡片加進這一篇的學習目標`,
  confirm: (count: number, suspects: number): string => `把 ${String(count)} 個候選卡片加進這一篇的學習目標？` + (suspects ? `可能重複的 ${String(suspects)} 項請逐項看。` : ''),
};
/** phone、closed 不提示：手機上沒有按鈕，關閉時畫面也不在了。 */
const BLOCKED: Partial<Record<WriteBlock | 'needs-update', string>> = {
  loading: '還有檔案沒讀到，先不加入；讀取完成後請再按一次',
  unread: '還有檔案沒讀到，先不加入；讀取完成後請再按一次',
  backup: '備份還沒成功，先不加入；到設定頁看原因',
  restore: '正在還原，先不加入；還原完再按一次',
  restoreStuck: '還原有一步卡住，先不加入；重新開啟 Obsidian 之後再按一次',
  'needs-update': '這篇筆記需要新版的外掛才讀得懂，更新外掛之前不能加入',
};

/** 做完的通知（§3-4 的口徑）：加入了幾項；沒加入的每一項一句原因，留在框裡。沒有要說的是 null。 */
function addMessage(path: string, result: AddResult): string | null {
  const left = (items: readonly { ref: ItemRef; why: string }[]): string[] => items.map(each => `「${itemName(each.ref)}」：${each.why}`);
  switch (result.kind) {
    case 'written': return [...result.moved.length ? [ADD_TIPS.moved(result.moved.length)] : [], ...result.confirmed ? [] : [ADD_TIPS.saved(path)], ...left(result.left)].join('\n') || null;
    case 'nothing': return result.left.length ? left(result.left).join('\n') : WHY.changed;
    case 'changed': return ADD_TIPS.changed;
    case 'timeout': return ADD_TIPS.locked(path);
    case 'blocked': return BLOCKED[result.reason] ?? null;
    case 'stale': return ADD_TIPS.stale;
    case 'failed': return ADD_TIPS.failed;
  }
}

class ConfirmModal extends Modal {
  private readonly text: string;
  private readonly modals: Set<Modal>;
  private readonly done: (yes: boolean) => void;
  private answered = false;
  constructor(app: App, text: string, modals: Set<Modal>, done: (yes: boolean) => void) {
    super(app);
    this.text = text;
    this.modals = modals;
    this.done = done;
  }
  onOpen(): void {
    this.modals.add(this);
    this.contentEl.empty();
    this.contentEl.createEl('p', { text: this.text });
    const buttons = this.contentEl.createDiv({ cls: 'essence-cards-issue-buttons' });
    buttons.createEl('button', { text: '取消' }).addEventListener('click', () => { this.close(); });
    buttons.createEl('button', { text: '加入', cls: 'mod-cta' }).addEventListener('click', () => { this.answered = true; this.close(); });
  }
  onClose(): void { this.modals.delete(this); this.contentEl.empty(); this.done(this.answered); }
}

export interface IntroRunHost {
  app: App;
  state: () => State | null;
  notify: (message: string) => void;
  onError: (error: unknown, path: string) => void;
  /** 按鈕跟著停用或恢復。 */
  refresh: () => void;
}

const viewOf = (leaf: WorkspaceLeaf, path: string): MarkdownView | null => leaf.view instanceof MarkdownView && leaf.view.file?.path === path ? leaf.view : null;
/** 編輯器一律用 \n，檔案可能是 \r\n：換行不同不算有沒存的修改。 */
const sameText = (a: string, b: string): boolean => a.replace(/\r\n?/g, '\n') === b.replace(/\r\n?/g, '\n');
const sameRefs = (a: readonly ItemRef[], b: readonly ItemRef[]): boolean => JSON.stringify(a) === JSON.stringify(b);
/** 確認到寫入之間批次一直在變：最多問幾次。 */
const CONFIRM_ROUNDS = 3;

export function createIntroRunner(host: IntroRunHost): { busy(path: string): boolean; add(request: AddRequest): void; close(): void } {
  const { app } = host;
  const running = new Set<string>();
  /** 寫進磁碟逾時的那幾篇：晚到的寫入可能之後才落盤，這次開著 Obsidian 的期間不再加入（§4）。 */
  const locked = new Set<string>();
  const modals = new Set<Modal>();
  let alive = true;
  const view = (path: string): MarkdownView | null => app.workspace.getLeavesOfType('markdown').map(leaf => viewOf(leaf, path)).find(each => each !== null) ?? null;
  const latest = async (path: string): Promise<string | null> => {
    const open = view(path);
    if (open) return open.editor.getValue();
    const file = app.vault.getFileByPath(path);
    return file ? app.vault.read(file) : null;
  };
  const ask = (text: string): Promise<boolean> => new Promise(resolve => { new ConfirmModal(app, text, modals, resolve).open(); });

  /** 寫一次：開著的筆記先確認編輯器的字都存進去了，走編輯器；沒開著的走檔案。 */
  async function write(state: State, path: string, refs: readonly ItemRef[], still: (text: string) => boolean): Promise<AddResult | 'unsaved'> {
    const open = view(path);
    if (open?.file && !sameText(open.editor.getValue(), await app.vault.read(open.file))) return 'unsaved';
    return state.addCandidates(path, refs, open && editorOf(open, path), still);
  }

  async function candidates(state: State, request: AddRequest): Promise<AddResult | 'unsaved' | null> {
    const { path } = request;
    if (!request.all) return write(state, path, request.refs, () => true);
    // 全部加入：確認框的數目與項目、寫入時的批次，都從最新的文字取同一組一般候選；兩次之間變了就重新問（§2〈確認到寫入之間變了〉）。
    for (let round = 0; round < CONFIRM_ROUNDS; round++) {
      const text = await latest(path);
      const box = text === null ? null : boxOf(text, request.refs);
      if (!box) return { kind: 'nothing', left: [] };
      const batch = boxBatch(box);
      const refs = batch.items.map(refOf);
      if (!refs.length) return { kind: 'nothing', left: [] };
      if (!await ask(ADD_TIPS.confirm(refs.length, batch.rest)) || !alive) return null;
      const result = await write(state, path, refs, now => {
        const found = boxOf(now, refs);
        return !!found && sameRefs(boxBatch(found).items.map(refOf), refs);
      });
      if (result === 'unsaved' || result.kind !== 'changed') return result;
    }
    return { kind: 'changed' };
  }

  return {
    busy: path => running.has(path) || locked.has(path),
    add(request) {
      const { path } = request;
      const state = host.state();
      if (!alive || !state || running.has(path)) return;
      if (locked.has(path)) { host.notify(ADD_TIPS.locked(path)); return; }
      if (request.kind === 'existing') { host.notify(ADD_TIPS.existing); return; }
      running.add(path);
      host.refresh();
      void (async () => {
        try {
          const result = await candidates(state, request);
          if (!alive || result === null) return;
          if (result === 'unsaved') { host.notify(ADD_TIPS.unsaved); return; }
          if (result.kind === 'timeout') locked.add(path);
          if (result.kind === 'failed') host.onError(result.error, path);
          const message = addMessage(path, result);
          if (message) host.notify(message);
        } catch (error) {
          host.onError(error, path);
          if (alive) host.notify(ADD_TIPS.failed);
        } finally {
          running.delete(path);
          if (alive) host.refresh();
        }
      })();
    },
    close() {
      alive = false;
      for (const modal of [...modals]) modal.close();
    },
  };
}
