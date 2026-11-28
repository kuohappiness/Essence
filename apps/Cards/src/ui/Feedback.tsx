import type { Ref } from 'react';
import { FEEDBACK_RATES, FEEDBACK_TAGS, NOTE_LIMIT } from '../review/index.ts';
import type { FeedbackChange, FeedbackRate, FeedbackTag, FeedbackView } from '../review/index.ts';

// 預覽的單張卡回饋列（D-246、tasks/card-feedback.md §3）：卡片區和下方按鈕之間自己一條。只畫 review 給的狀態、把點擊轉成動作；
// 沒有自己的 hook（一句話的草稿在 Review 裡），狀態與什麼時候存都在 review/feedback.ts。

const RATE_LABELS: Record<FeedbackRate, string> = { ok: '可以用', fix: '要改', drop: '不要這張' };
const TAG_LABELS: Record<FeedbackTag, string> = { explain: '詳解', point: '考點', layout: '版面', worth: '不值得考' };
/** 開頭那一格：平常寫「回饋」，存好、沒存到、寫滿時換成短短的狀態（§3-2）。 */
const HEAD: Record<NonNullable<FeedbackView['status']>, string> = { saving: '回饋', saved: '已存', failed: '沒存到', full: '已滿' };
/** 沒存到、寫滿時多一行說明（§2-3）。 */
const NOTICE: Partial<Record<NonNullable<FeedbackView['status']>, string>> = { failed: '沒存到，再點一次', full: '這次預覽的回饋滿了' };

interface RowProps {
  view: FeedbackView;
  change: (change: FeedbackChange) => void;
  openNote: () => void;
  disabled: boolean;
  inert: boolean;
}

export function FeedbackRow({ view, change, openNote, disabled, inert }: RowProps): React.JSX.Element {
  const head = view.status ? HEAD[view.status] : '回饋';
  const notice = view.status ? NOTICE[view.status] : undefined;
  const tags = view.rate === 'fix' || view.rate === 'drop';
  return <div className="ec-feedback" inert={inert}>
    <div className="ec-feedback-row" role="group" aria-label="這張卡的回饋">
      <span className="ec-feedback-head" data-status={view.status ?? ''} aria-live="polite">{head}</span>
      {FEEDBACK_RATES.map(rate => <button key={rate} type="button" className="ec-fb" data-rate={rate} aria-pressed={view.rate === rate} disabled={disabled}
        onClick={() => { change({ kind: 'rate', rate }); }}>{RATE_LABELS[rate]}</button>)}
      <button type="button" className="ec-fb ec-fb-note" aria-haspopup="dialog" disabled={disabled} onClick={openNote}>{view.note ? '✎ 改一句' : '✎ 寫一句'}</button>
    </div>
    {tags && <div className="ec-feedback-row ec-feedback-tags" role="group" aria-label="哪裡要改">
      {FEEDBACK_TAGS.map(tag => <button key={tag} type="button" className="ec-fb ec-fb-tag" data-tag={tag} aria-pressed={view.tags.includes(tag)} disabled={disabled}
        onClick={() => { change({ kind: 'tag', tag }); }}>{TAG_LABELS[tag]}</button>)}
    </div>}
    {notice && <p className="ec-feedback-notice">{notice}</p>}
  </div>;
}

interface NoteProps {
  draft: string;
  setDraft: (text: string) => void;
  save: () => void;
  cancel: () => void;
  noteRef: Ref<HTMLTextAreaElement>;
}

/**
 * 寫一句（§3-3）：從上方滑下，iPhone 的鍵盤在下面不會蓋住；可以用語音輸入。點框外的暗處是取消。
 * Enter 是存、Esc 是取消，由 Review 的按鍵處理（框開著時按鍵只交給框）。
 */
export function NoteSheet({ draft, setDraft, save, cancel, noteRef }: NoteProps): React.JSX.Element {
  return <div className="ec-note" onClick={event => { if (event.target === event.currentTarget) cancel(); }}>
    <div className="ec-note-sheet" role="dialog" aria-modal="true" aria-label="寫一句">
      <textarea className="ec-note-input" ref={noteRef} value={draft} maxLength={NOTE_LIMIT} rows={3} enterKeyHint="done" aria-label="一句話"
        placeholder="一句話就好，例如哪裡看不懂、要怎麼改" onChange={event => { setDraft(event.target.value); }} />
      <div className="ec-note-actions">
        <button type="button" className="ec-note-cancel" onClick={cancel}>取消</button>
        <button type="button" className="ec-note-save" onClick={save}>存</button>
      </div>
    </div>
  </div>;
}
