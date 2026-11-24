import { MarkdownView, type App, type WorkspaceLeaf } from 'obsidian';
import type { ActivateResult, DeckStatusValue, EditorHandle, State, WriteBlock } from '../state/index.ts';
import { editorOf } from './save.ts';

// 目錄的暫停／恢復（D-183 第 6 點、tasks/quiz-practice.md §5）：只在電腦。開在編輯模式的筆記走編輯器（和存檔同一條），沒開著或只開在閱讀模式的走檔案（和離開筆記補 ID 同一條）。
// 閱讀模式的分頁改隱藏的編輯器，磁碟上留不住；它也不跟著外部的修改重讀，拿來比對會一直是「還沒存進去的修改」（Windows 實機 2026-11-18，草稿在閱讀模式按「啟用」；引言框的「加入」在 intro-run.ts 是同一個原因）。

/** 給家長看的提示：寫不進去時畫面不變，要說為什麼。 */
const STATUS_TIPS = {
  /** Obsidian 約 2 秒自動存一次，等一下就存好了。 */
  unsaved: '這篇筆記有還沒存進去的修改，狀態先不改；等一下再按一次',
  stale: '這篇筆記剛剛改過，請再按一次',
  failed: '這篇筆記暫時存不進去，狀態沒有改；請稍後再按一次',
  unwritable: '這篇筆記的屬性區寫法有問題，狀態沒有改；先打開筆記修好',
  blocked: '還有檔案沒讀到，狀態先不改；讀取完成後請再按一次',
  backup: '備份還沒成功，狀態先不改；到設定頁看原因',
  restore: '正在還原，狀態先不改；還原完再按一次',
  restoreStuck: '還原有一步卡住，狀態先不改；重新開啟 Obsidian 之後再按一次',
  needsUpdate: '這篇筆記需要新版的外掛才讀得懂，更新外掛之前不能改狀態',
  /** 啟用（D-226 第 5 點）：確認視窗開著時內容變了、已經不是草稿、檔不見了，都沒有啟用，不能說成已啟用。 */
  changed: '這篇筆記在你按「啟用」之後改過了，還沒啟用；請再按一次「啟用」，看過新的內容再確認',
  already: '這一篇已經不是草稿（啟用或暫停），狀態沒有改',
  gone: '找不到這一篇，狀態沒有改',
};
/** phone、closed 不提示：手機上沒有這個按鈕，關閉時畫面也不在了。 */
const BLOCKED: Partial<Record<WriteBlock | 'needs-update', string>> = { loading: STATUS_TIPS.blocked, unread: STATUS_TIPS.blocked, backup: STATUS_TIPS.backup, restore: STATUS_TIPS.restore, restoreStuck: STATUS_TIPS.restoreStuck, 'needs-update': STATUS_TIPS.needsUpdate };

function tipOf(result: ActivateResult): string | null {
  if (result.kind === 'blocked') return BLOCKED[result.reason] ?? null;
  if (result.kind === 'changed') return STATUS_TIPS.changed;
  if (result.kind === 'already') return STATUS_TIPS.already;
  if (result.kind === 'stale') return STATUS_TIPS.stale;
  if (result.kind === 'failed') return STATUS_TIPS.failed;
  if (result.kind === 'unwritable') return STATUS_TIPS.unwritable;
  return null;
}

const viewOf = (leaf: WorkspaceLeaf, path: string): MarkdownView | null => leaf.view instanceof MarkdownView && leaf.view.file?.path === path ? leaf.view : null;
/** 編輯器一律用 \n，檔案可能是 \r\n：換行不同不算有沒存的修改。 */
const sameText = (a: string, b: string): boolean => a.replace(/\r\n?/g, '\n') === b.replace(/\r\n?/g, '\n');

/** 暫停或恢復這一篇。回傳要提示的字，沒事是 null；不會 reject，寫不進去與讀不到都交給 onError。 */
export function changeDeckStatus(app: App, state: Pick<State, 'setDeckStatus'>, path: string, value: DeckStatusValue, onError: (error: unknown) => void): Promise<string | null> {
  return change(app, path, onError, editor => state.setDeckStatus(path, value, editor));
}
/**
 * 草稿的「啟用」（tasks/ai-cards-mvp.md §7）：和暫停／恢復同一條路，只有草稿能改成啟用。confirmed 是確認視窗顯示的那一版全文（D-226 第 5 點）：寫入當下不同就不寫。
 * 回傳要提示的字；null 才是真的啟用了（寫成，或寫進磁碟、核對還沒讀到）。沒有改的（unchanged：檔不見了）也要說，不能被說成已啟用。
 */
export async function activateDeck(app: App, state: Pick<State, 'activateDraft'>, path: string, confirmed: string, onError: (error: unknown) => void): Promise<string | null> {
  let gone = false;
  const tip = await change(app, path, onError, async editor => {
    const result = await state.activateDraft(path, editor, confirmed);
    gone = result.kind === 'unchanged';
    return result;
  });
  return tip ?? (gone ? STATUS_TIPS.gone : null);
}
async function change(app: App, path: string, onError: (error: unknown) => void, write: (editor: EditorHandle | null) => Promise<ActivateResult>): Promise<string | null> {
  try {
    const view = app.workspace.getLeavesOfType('markdown').map(leaf => viewOf(leaf, path)).find(each => each !== null && each.getMode() === 'source') ?? null;
    if (view?.file && !sameText(view.editor.getValue(), await app.vault.read(view.file))) return STATUS_TIPS.unsaved;
    const result = await write(view && editorOf(view, path));
    if (result.kind === 'failed') onError(result.error);
    return tipOf(result);
  } catch (error) {
    onError(error);
    return STATUS_TIPS.failed;
  }
}
