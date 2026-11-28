import { anchorParts, extraLabel, questionOf, RATING_LABELS, singleExtras, singleQuestion } from '../review/index.ts';
import type { CardView, PickView } from '../review/index.ts';
import { Icon } from './Icon.tsx';
import { Markdown } from './Markdown.tsx';
import { Rates, type BodyProps, type BottomProps, type Screen } from './screen.tsx';

// 點選填空的畫面（tasks/question-type-seam.md §7、D-182、D-179）：沒有 hook，狀態都在 review/pick.ts。樣式在 PickCard.css。
// 排序（題型 order）的題目區在 OrderCard.tsx，字鍵與底部那一排和這裡共用（題型模組任務說明 §1-8）。

/** 這張卡的組與目前的狀態；點選填空與排序的卡才會走到這裡。 */
export function partsOf(view: CardView): { pick: PickView; group: NonNullable<CardView['card']['group']> } {
  const { pick } = view, { group } = view.card;
  if (!pick || !group) throw Error('比較卡沒有作答的狀態');
  return { pick, group };
}

/** 字從字鍵飛到空格（示意頁的 flyTo）：可有可無，尊重 prefers-reduced-motion；手機切到背景時動畫可能停住，分身不能留在畫面上。 */
function fly(button: HTMLElement, index: number): void {
  if (typeof button.animate !== 'function' || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const root = button.closest('.ec-app');
  const slot = root?.querySelector(`.ec-pick-slot[data-index="${String(index)}"]`);
  if (!root || !slot) return;
  const from = button.getBoundingClientRect(), to = slot.getBoundingClientRect();
  const clone = document.createElement('span');
  clone.className = 'ec-pick-fly';
  clone.textContent = button.textContent;
  root.append(clone);
  const size = clone.getBoundingClientRect();
  const point = (box: DOMRect): string => `${String(box.left + box.width / 2 - size.width / 2)}px,${String(box.top + box.height / 2 - size.height / 2)}px`;
  const motion = clone.animate([
    { transform: `translate(${point(from)}) scale(1)`, opacity: 1 },
    { transform: `translate(${point(to)}) scale(.7)`, opacity: .35 },
  ], { duration: 150, easing: 'ease-out' });
  const remove = (): void => { clone.remove(); };
  motion.onfinish = remove;
  motion.oncancel = remove;
  window.setTimeout(remove, 400);
}

export const MARKS: Partial<Record<PickView['cells'][number]['state'], string>> = { right: '✓', near: '✓', miss: '✕', retry: '✕' };

type Row = NonNullable<CardView['card']['group']>['rows'][number];

/** 對照的順序（D-203 第 3 點）：考到的照句子的順序，沒考到的照組裡的順序接在後面。 */
function compareOrder(rows: readonly Row[], tested: readonly (string | null | undefined)[]): Row[] {
  const first = tested.flatMap(answer => rows.filter(row => row.member === answer));
  return [...new Set([...first, ...rows])];
}

/** 比較卡、多音字、單選與配對（題型 pick）：一題一列，每列一格。排序（題型 order）的畫面在 OrderCard.tsx。 */
function PickBody({ view, app, act, onPainted, onFail }: BodyProps): React.JSX.Element {
  const { card } = view;
  const { pick, group } = partsOf(view);
  const back = (text: string): React.JSX.Element => <Markdown app={app} text={text} sourcePath={card.deck} revealed onFail={(error, path) => { onFail('back', error, path); }} />;
  const note = (text: string, key: number, className: string): React.JSX.Element => <div key={key} className={className}>{back(text)}</div>;
  // 單選與配對（tasks/matching-single-choice.md §5）：卡上不放標題（D-179）；對答案後每一列底下接那個目標的記憶錨點與那一題的詳解，沒有整組的對照。
  const single = group.single === true;
  const many = group.many === true;
  /** 一格的內容：一格一個字的卡是一顆按鈕；一列可以放好幾個的卡（tasks/matching-many.md §6）是容器，裡面每個小塊是自己的按鈕（能改的列才能點）。 */
  const slotOf = (cell: PickView['cells'][number], index: number, movable: boolean): React.JSX.Element => {
    if (!many) return <button type="button" className="ec-pick-slot" data-state={cell.state} data-index={index} aria-label={`第 ${String(index + 1)} 格`}>{cell.state === 'retry' ? <s>{cell.text}</s> : cell.text || '　'}</button>;
    const chips = cell.chips ?? [];
    return <span className="ec-pick-slot is-many" data-state={cell.state} data-index={index} role="group" aria-label={`第 ${String(index + 1)} 列`}>
      {chips.length === 0 ? <span className="ec-pick-ask">{cell.text || '　'}</span> : chips.map((chip, at) => movable && chip.state === 'placed'
        ? <button key={`${chip.text}-${String(at)}`} type="button" className="ec-pick-chip" data-state={chip.state} aria-label={`拿掉${chip.text}`} onClick={event => { event.stopPropagation(); act({ kind: 'unpick', index, at }); }}>{chip.text}</button>
        : <span key={`${chip.text}-${String(at)}`} className="ec-pick-chip" data-state={chip.state} {...(chip.state === 'struck' ? { 'aria-label': `放錯了：${chip.text}` } : chip.state === 'missed' ? { 'aria-label': `漏了：${chip.text}` } : {})}>{chip.text}</span>)}
    </span>;
  };
  return <article className={'ec-card ec-pick' + (single ? ' is-single' : '') + (many ? ' is-many' : '')} lang="zh-Hant">
    <div className="ec-meta">{card.isNew && <span className="ec-new">新</span>}<span>{view.crumb}</span></div>
    {!single && <p className="ec-pick-title">{group.choice ? group.title : group.title ? `${group.title}：${group.members.join('、')}` : group.members.join('、')}</p>}
    <ul className="ec-pick-rows">{card.blanks.map((blank, index) => {
      const cell = pick.cells[index];
      const movable = pick.stage === 'answer' || (pick.stage === 'retry' && cell.state === 'retry');
      const extras = single && pick.stage === 'result' ? singleExtras(blank) : [];
      return <li key={blank.prompt.fingerprint + String(index)} className={'ec-pick-row' + (index === pick.cursor ? ' is-on' : '') + (movable ? '' : ' is-locked')} onClick={() => { act({ kind: 'row', index }); }}>
        <span className="ec-pick-mark" data-state={cell.state}>{MARKS[cell.state] ?? ''}</span>
        <div className="ec-pick-text">
          <Markdown app={app} text={single ? singleQuestion(blank) : questionOf(blank.prompt)} sourcePath={card.deck} mode="pick"
            slotNode={slotOf(cell, index, movable)}
            onReady={index === 0 ? onPainted : undefined} onFail={(error, path) => { onFail('front', error, path); }} />
        </div>
        {extras.length > 0 && <div className="ec-single-back ec-answer">{extras.map((extra, at) => {
          const { label, body } = extraLabel(extra);
          if (label === '記憶錨點') return <div key={at} className="ec-ex-item is-anchor">
            <span className="ec-bulb" role="img" aria-label="記憶提示"><Icon type="bulb" /></span>
            <div className="ec-ex-body"><div className="ec-ex-row">{back(body)}</div></div>
          </div>;
          return <div key={at} className="ec-ex-item">
            {label && <div className="ec-ex-label">{label}：</div>}
            <div className="ec-ex-row">{back(body)}</div>
          </div>;
        })}</div>}
      </li>;
    })}</ul>
    {/* 對照（D-203）：上下排、不標結果；這次考到的照句子的順序排前面 */}
    {pick.stage === 'result' && !single && <div className="ec-pick-compare ec-answer">{compareOrder(group.rows, card.blanks.map(blank => blank.answer)).map(row => {
      const parts = row.anchor === null ? null : anchorParts(row.anchor);
      return <div key={row.member} className="ec-cmp">
        <span className="ec-cmp-ch">{row.member}</span>
        <span className="ec-cmp-why">
          {parts && <Markdown app={app} text={parts.why} sourcePath={card.deck} revealed onFail={(error, path) => { onFail('back', error, path); }} />}
          {parts?.words && <span className="ec-cmp-words">{parts.words}</span>}
        </span>
      </div>;
    })}
    {group.choice && group.choice.rest.length > 0 && <div className="ec-cmp-rest">{group.choice.rest.map((text, i) => note(text, i, 'ec-cmp-line'))}</div>}
    </div>}
  </article>;
}

/**
 * 字鍵幾個一排（D-182 第 6 點）：一個字的 6 個以內一排、7 個以上兩排。
 * 詞比字長（375 寬實測：6 個一排一格 52px，give up 超出字鍵）：一排最多 4 個，5、6 個排成兩排各 3 個。
 */
function keyColumns(count: number, words: boolean): number {
  if (!words) return count <= 6 ? count : Math.ceil(count / 2);
  if (count <= 4) return count;
  return count <= 6 ? 3 : 4;
}

/** 字鍵那一排在 375 寬的手機上的寬度（左右各留 12px）、字鍵之間的空隙、字鍵左右的留白與框線。 */
const TRAY = 351, KEY_GAP = 8, KEY_INSIDE = 6;
/** 一個選項排成一行要多寬（px）：全形字與中日韓文字一個字一個字寬，其他字約六成。只用來估要不要少放一個。 */
const textWidth = (text: string, size: number): number => [...text].reduce((sum, char) => sum + (/[\u2E80-\uFFEF]/u.test(char) ? size : size * 0.6), 0);

/**
 * 單選與配對的字鍵幾個一排（tasks/matching-single-choice.md §5〈畫面〉）：先照 keyColumns；最長的選項在一格裡放不下一行時一排少放一個，
 * 最少 2 個，排數一樣時排得平均（4 個排成 2＋2，不排 3＋1），字才不從詞的中間折斷。照 375 寬的手機估，寬的螢幕字鍵只是比較寬。比較卡照舊。
 */
function singleColumns(keys: readonly string[], words: boolean): number {
  const size = words ? 17 : 31;
  const longest = Math.max(...keys.map(key => textWidth(key, size)));
  let columns = keyColumns(keys.length, words);
  while (columns > 2 && (TRAY - KEY_GAP * (columns - 1)) / columns - KEY_INSIDE < longest) columns--;
  return Math.ceil(keys.length / Math.ceil(keys.length / columns));
}

/** 字鍵與兩個動作（§7）：手指最常停的地方，字鍵在上，動作在下，中間留空，連點才不會誤按「對答案」。 */
function Tray({ view, animating, act, focusApp }: BottomProps): React.JSX.Element {
  const { pick, group } = partsOf(view);
  // 一列可以放好幾個的卡再選時要再按一次「對答案」（tasks/matching-many.md §5），按鈕照作答時的樣子。
  const retrying = pick.stage === 'retry' && group.many !== true;
  const cursor = pick.cursor;
  // 用滑鼠或手指點完，焦點回到畫面：Space、Enter 才是「對答案」，不是再按一次這個字鍵。Tab 過來用鍵盤按的（detail 是 0）留在原處。
  const after = (event: React.MouseEvent): void => { if (event.detail > 0) focusApp(); };
  // 全詩順序卡的字鍵是整句，兩個一排（D-204 第 2 點）；相同的句子各一個鍵，用位置當 key。
  const lines = group.order !== undefined && !group.order.starts;
  const words = !lines && group.keys.some(key => [...key].length > 1);
  return <div className="ec-pick-tray">
    <div className={'ec-pick-keys' + (lines ? ' is-lines' : words ? ' is-words' : '')} style={{ '--ec-pick-columns': String(lines ? 2 : group.single ? singleColumns(group.keys, words) : keyColumns(group.keys.length, words)) } as React.CSSProperties}>
      {group.keys.map((key, index) => <button key={group.order ? index : key} type="button" className={'ec-pick-key' + (pick.used[index] ? ' is-used' : '')} disabled={animating || key === pick.spent} onClick={event => {
        const target = cursor;
        act({ kind: 'key', key, at: index });
        if (target !== null) fly(event.currentTarget, target);
        after(event);
      }}>{key}</button>)}
    </div>
    <div className="ec-pick-acts">
      <button type="button" className="ec-pick-act ec-pick-skip" disabled={animating} onClick={event => { act({ kind: 'skip' }); after(event); }}>{RATING_LABELS.miss}</button>
      <button type="button" className={'ec-pick-act ec-pick-check' + (retrying ? ' is-again' : pick.filled ? ' is-ready' : '')} disabled={animating} onClick={event => {
        act({ kind: 'check' });
        if (!retrying && !pick.filled && typeof event.currentTarget.animate === 'function' && !matchMedia('(prefers-reduced-motion: reduce)').matches) event.currentTarget.animate([{ transform: 'none' }, { transform: 'scale(1.03)' }, { transform: 'none' }], { duration: 300 });
        after(event);
      }}>{retrying ? '再選一次' : '對答案'}</button>
    </div>
  </div>;
}

export const pickScreen: Screen = {
  Body: PickBody,
  bottom(props) {
    const { view, animating, rate, commit } = props;
    const { pick } = partsOf(view);
    if (pick.stage !== 'result') return <Tray {...props} />;
    // 回看：全對的能改評分；被停掉的只留當時按的；有錯的是程式判的，沒有按鈕。
    if (view.viewing) {
      const shown = view.allowed.length ? view.allowed : view.pressed ? [view.pressed] : [];
      return shown.length ? <Rates view={view} shown={shown} animating={animating} rate={rate} /> : null;
    }
    if (view.allowed.length) return <Rates view={view} shown={view.allowed} animating={animating} rate={rate} />;
    // 預覽也一樣（自動展開時是這裡）：上方的 › 之外，下方和複習畫面一樣有「下一張」。
    return <button type="button" className="ec-show" disabled={animating} onClick={commit}>下一張</button>;
  },
  tap() {},
  enter(view, { act, commit }) {
    const { pick, group } = partsOf(view);
    // 一列可以放好幾個的卡再選時也要按「對答案」（tasks/matching-many.md §5〈接點〉）。
    if (pick.stage === 'answer' || (pick.stage === 'retry' && group.many)) act({ kind: 'check' });
    else if (pick.committable) commit();
  },
  stage: () => '',
};
