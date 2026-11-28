import type { Deck, Target } from '../core/deck/index.ts';
import { cardOf, choicePreviewCards, pickPreviewCards, singlePreviewCards } from '../core/study/index.ts';
import type { Card } from '../core/study/index.ts';
import { crumb } from './crumb.ts';
import { isEnglish } from './english.ts';
import { applyChange, canLeave, EMPTY, feedbackKey, left, type FeedbackChange, type FeedbackSink, type FeedbackView } from './feedback.ts';
import { createPreviewFlow } from './flow.ts';
import type { CardView, Session, View } from './session.ts';

// 預覽（D-161、D-163 第 3 點）：和複習一樣的畫面，但不走 state.answer，也不增加 Pick 的種類；這一個物件實作 Session 介面，畫面不用知道。
// 內容是編輯器目前的文字解析出來的，所以看到的就是畫面上寫的；什麼都不寫，排程也不動。逐張的狀態在 Flow（flow.ts），這裡只留換張與上方的文字。

const LABEL = '預覽，不記錄';

export interface PreviewOptions {
  path: string;
  deck: Deck;
  /** 預覽時自動展開答案：一進卡片就是背面。 */
  reveal: boolean;
  /** 單張卡的回饋（D-246、tasks/card-feedback.md）：設定頁打開才給；沒給就沒有回饋列。 */
  feedback?: FeedbackSink;
}

/**
 * 這一篇的每一題（同一個目標的整個題目池），照筆記順序；寫錯的目標跳過。還沒補 ID 的目標 lt 是空字串，畫面只拿它組鍵。
 * 比較卡（tasks/question-type-seam.md §9）：一組的卡放在組裡第一個目標的位置。多音字（tasks/polyphone-pick.md §3-4）：第一次的卡加其餘的句子各一張。
 */
function cardsOf(path: string, targets: readonly Target[]): Card[] {
  const ok = targets.filter(target => target.ok);
  const groups = new Set<string>();
  return ok.flatMap(target => {
    const plain = (): Card[] => target.prompts.map(prompt => cardOf({ lt: target.id ?? '', deck: path, target, prompt, isNew: false, early: false }));
    // 照卡型分（題型模組任務說明 §1-4）。
    switch (target.kind?.id) {
      case 'group': {
        const key = target.kind.group.key;
        if (groups.has(key)) return [];
        groups.add(key);
        return pickPreviewCards(path, ok.filter(each => each.kind?.id === 'group' && each.kind.group.key === key), targets);
      }
      case 'polyphone': return choicePreviewCards(path, target);
      // 單選與配對（tasks/matching-single-choice.md §4）：預覽不併，每一題一張，家長看得到每一題。
      case 'single': return singlePreviewCards(path, target);
      case 'order': case 'typing': case 'couplet': case undefined: return plain();
      default: { const never: never = target.kind; return never; }
    }
  });
}

/** 沒有任何題目時是 null：呼叫的一方用通知說明，不開畫面。 */
export function createPreview(options: PreviewOptions): Session | null {
  const { path, deck } = options;
  const cards = cardsOf(path, deck.targets);
  const first = cards.at(0);
  if (!first) return null;
  const skipped = deck.targets.filter(target => !target.ok).length;
  const crumbText = crumb(deck.props, path);
  const listeners = new Set<() => void>();
  let index = 0;
  let cached: View | null = null;
  /** 目前這張的狀態：每次進卡片都從頭開始。 */
  let flow = createPreviewFlow(first, options.reveal);
  const sink = options.feedback;
  /** 這一輪每張卡留的回饋（照 feedbackKey）：往回翻看得到，關掉預覽就清掉（§3-1）。 */
  const feedbacks = new Map<string, FeedbackView>();
  /** 每張卡最近一次存的序號：先送出的晚回來時，不蓋掉後來那一次的結果。 */
  const saves = new Map<string, number>();
  let closed = false;

  const notify = (): void => { cached = null; for (const listener of [...listeners]) listener(); };

  function go(to: number): void {
    index = Math.min(cards.length, Math.max(0, to));
    const card = cards.at(index);
    if (card) flow = createPreviewFlow(card, options.reveal);
    notify();
  }

  function compute(): View {
    // 開頭寫跳過了幾個，之後只留「預覽，不記錄」。
    const center = index === 0 && skipped ? `${LABEL}（跳過 ${String(skipped)} 個寫法有問題的目標）` : LABEL;
    const top = { center, fraction: Math.min(1, (index + 1) / cards.length), canBack: index > 0, viewing: false, canForward: index < cards.length, pinned: true };
    const card = cards.at(index);
    if (!card) {
      const count = [...feedbacks.values()].filter(left).length;
      const detail = `共 ${String(cards.length)} 張` + (count ? `，留了 ${String(count)} 張的回饋` : '');
      return { kind: 'done', top: { ...top, center: LABEL }, done: { title: '預覽完了', detail, buttons: [{ kind: 'close', label: '結束預覽' }] } };
    }
    const { revealed, allowed, speakable, typed, pick } = flow.view();
    const view: CardView = {
      kind: 'card', card, crumb: crumbText, revealed, typed, pick, allowed, pressed: null, english: isEnglish(card),
      speakable, autoRead: flow.autoRead, viewing: null, shown: index,
      ...sink && canLeave(card) ? { feedback: feedbacks.get(feedbackKey(card)) ?? { ...EMPTY, status: null } } : {},
    };
    return { kind: 'card', top, card: view };
  }

  /**
   * 改這張卡的回饋：先畫出來，再寫；寫的結果只在它還是這張卡最近一次時才畫（§2-3）。
   * 上一次沒存到時（格式查核 F2）：點「再存」、一句話沒改字再按「存」，都把現在的整份再寫一次。
   */
  function feedback(change: FeedbackChange): void {
    const card = cards.at(index);
    if (!sink || !card || !canLeave(card)) return;
    const at = feedbackKey(card);
    const old = feedbacks.get(at) ?? { ...EMPTY, status: null };
    const again = old.status === 'failed' && (change.kind === 'retry' || change.kind === 'note');
    const next = applyChange(old, change) ?? (again ? old : null);
    if (!next) return;
    feedbacks.set(at, { ...next, status: 'saving' });
    const seq = (saves.get(at) ?? 0) + 1;
    saves.set(at, seq);
    notify();
    const done = (status: FeedbackView['status']): void => {
      const now = feedbacks.get(at);
      if (closed || !now || saves.get(at) !== seq) return;
      feedbacks.set(at, { ...now, status });
      notify();
    };
    // 寫的一方丟錯也算寫不進去：畫面寫「沒存到」，家長再點一次就再寫一次整份。
    let saving: Promise<FeedbackView['status']>;
    try { saving = sink.save(card, { rate: next.rate, tags: next.tags, note: next.note }); } catch { saving = Promise.resolve('failed'); }
    void saving.then(done, () => { done('failed'); });
  }

  return {
    view() { cached ??= compute(); return cached; },
    subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    ready: () => Promise.resolve(),
    reveal() { if (index < cards.length && flow.act({ kind: 'reveal' })) notify(); },
    input(text) { if (flow.act({ kind: 'input', text })) notify(); },
    submit() { if (index < cards.length && flow.act({ kind: 'submit' })) notify(); },
    skip() { if (index < cards.length && flow.act({ kind: 'skip' })) notify(); },
    act(action) { if (index < cards.length && flow.act(action)) notify(); },
    // 自評按鈕與「下一張」只換下一張，不寫任何東西。
    rate() {
      if (index >= cards.length || !flow.view().revealed) return false;
      go(index + 1);
      return true;
    },
    commit() {
      if (index >= cards.length || !flow.view().pick?.committable) return false;
      go(index + 1);
      return true;
    },
    back() { if (index > 0) go(index - 1); },
    forward() { if (index < cards.length) go(index + 1); },
    toCurrent() {},
    continueWith() {},
    pause() {},
    resume() { notify(); return false; },
    close() { closed = true; listeners.clear(); },
    history: () => [],
    pick: () => ({ deck: path }),
    ...sink ? { feedback } : {},
  };
}
