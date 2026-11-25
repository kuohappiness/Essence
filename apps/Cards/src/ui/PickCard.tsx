import { anchorParts, extraLabel, orderNotes, questionOf, RATING_LABELS } from '../review/index.ts';
import type { CardView, PickView } from '../review/index.ts';
import { Icon } from './Icon.tsx';
import { Markdown } from './Markdown.tsx';
import { slotMark, stripSlotMarks } from './rendered.ts';
import { Rates, type BodyProps, type BottomProps, type Screen } from './screen.tsx';

// 點選填空的畫面（tasks/question-type-seam.md §7、D-182、D-179）：沒有 hook，狀態都在 review/pick.ts。樣式在 PickCard.css。

/** 這張卡的組與目前的狀態；只有比較卡會走到這裡。 */
function partsOf(view: CardView): { pick: PickView; group: NonNullable<CardView['card']['group']> } {
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

const MARKS: Partial<Record<PickView['cells'][number]['state'], string>> = { right: '✓', near: '✓', miss: '✕', retry: '✕' };

type Row = NonNullable<CardView['card']['group']>['rows'][number];

/** 對照的順序（D-203 第 3 點）：考到的照句子的順序，沒考到的照組裡的順序接在後面。 */
function compareOrder(rows: readonly Row[], tested: readonly (string | null | undefined)[]): Row[] {
  const first = tested.flatMap(answer => rows.filter(row => row.member === answer));
  return [...new Set([...first, ...rows])];
}

/** 整句最差的那一格的狀態（句子排序的打勾，§6-1）：有錯就打叉，再選才對是橙色，都對才是綠色；還沒對答案時沒有。 */
function worstState(cells: PickView['cells']): PickView['cells'][number]['state'] {
  for (const state of ['miss', 'retry', 'near'] as const) if (cells.some(cell => cell.state === state)) return state;
  return cells.every(cell => cell.state === 'right') ? 'right' : 'open';
}

/** 句首那一格放進去的字第一個字母大寫（tasks/english-typed-order.md §4-6）。 */
const capital = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);

/**
 * 英文的句子排序卡（tasks/english-typed-order.md §6）：整題一列、每個 ＿＿ 一格，空格的樣式照比較卡；左邊一個打勾照最差的一格。
 * 對答案後題目底下的補充與共用補充接在句子下面。
 */
function SentenceBody({ view, app, act, onPainted, onFail }: BodyProps): React.JSX.Element {
  const { card } = view;
  const { pick, group } = partsOf(view);
  const order = group.order;
  const starts = order?.starts ?? [];
  // 每一格用自己的記號（L2 R1）：題目本來的 ＿＿、相鄰的兩格都不會搞混。
  const text = stripSlotMarks(order?.head ?? '') + card.blanks.map((_, i) => slotMark(i) + stripSlotMarks(order?.tails[i] ?? '')).join('');
  const slots = card.blanks.map((_, index) => {
    const cell = pick.cells[index];
    const shown = starts[index] && cell.text && cell.state !== 'skipped' && cell.state !== 'miss' ? capital(cell.text) : cell.text;
    return <button key={index} type="button" className={'ec-pick-slot' + (index === pick.cursor ? ' is-on' : '')} data-state={cell.state} data-index={index} aria-label={`第 ${String(index + 1)} 格`}
      onClick={event => { event.stopPropagation(); act({ kind: 'row', index }); }}>{cell.state === 'retry' ? <s>{shown}</s> : shown || '　'}</button>;
  });
  const mark = worstState(pick.cells);
  const extras = pick.stage === 'result' ? [...card.prompt.extras, ...card.target.shared] : [];
  return <article className="ec-card ec-pick is-sentence is-english" lang="en">
    <div className="ec-meta" lang="zh-Hant">{card.isNew && <span className="ec-new">新</span>}<span>{view.crumb}</span></div>
    <p className="ec-pick-title" lang="zh-Hant">{group.title}</p>
    <ul className="ec-pick-rows"><li className={'ec-pick-row' + (pick.stage === 'result' ? ' is-locked' : '')}>
      <span className="ec-pick-mark" data-state={mark}>{MARKS[mark] ?? ''}</span>
      <div className="ec-pick-text">
        <Markdown app={app} text={text} sourcePath={card.deck} mode="pick" english slotNodes={slots} breakFirst={starts[0]} onReady={onPainted} onFail={(error, path) => { onFail('front', error, path); }} />
      </div>
    </li></ul>
    {extras.length > 0 && <div className="ec-ex ec-answer">{extras.map((extra, index) => {
      const { label, body } = extraLabel(extra);
      const content = <Markdown app={app} text={body} sourcePath={card.deck} revealed onFail={(error, path) => { onFail('back', error, path); }} />;
      if (label === '記憶錨點') return <div key={index} className="ec-ex-item is-anchor">
        <span className="ec-bulb" role="img" aria-label="記憶提示"><Icon type="bulb" /></span>
        <div className="ec-ex-body"><div className="ec-ex-row">{content}</div></div>
      </div>;
      return <div key={index} className="ec-ex-item">
        {label && <div className="ec-ex-label" lang="zh-Hant">{label}：</div>}
        <div className="ec-ex-row">{content}</div>
      </div>;
    })}</div>}
  </article>;
}

function PickBody(props: BodyProps): React.JSX.Element {
  if (props.view.card.group?.order?.starts) return <SentenceBody {...props} />;
  const { view, app, act, onPainted, onFail } = props;
  const { card } = view;
  const { pick, group } = partsOf(view);
  const { order } = group;
  const notes = order && pick.stage === 'result' ? orderNotes(card.target.order?.notes ?? [], card.blanks.length) : null;
  // 全詩順序卡的空格先撐到最長那一句的寬度，填進去時句子不跳（D-204 第 1 點）。
  const width = order ? Math.max(...group.members.map(line => [...line].length)) : 0;
  const note = (text: string, key: number, className: string): React.JSX.Element => <div key={key} className={className}>
    <Markdown app={app} text={text} sourcePath={card.deck} revealed onFail={(error, path) => { onFail('back', error, path); }} />
  </div>;
  return <article className={'ec-card ec-pick' + (order ? ' is-order' : '')} lang="zh-Hant">
    <div className="ec-meta">{card.isNew && <span className="ec-new">新</span>}<span>{view.crumb}</span></div>
    <p className="ec-pick-title">{order || group.choice ? group.title : group.title ? `${group.title}：${group.members.join('、')}` : group.members.join('、')}</p>
    <ul className="ec-pick-rows" style={order ? { '--ec-order-width': `${String(width)}em` } as React.CSSProperties : undefined}>{card.blanks.map((blank, index) => {
      const cell = pick.cells[index];
      const movable = pick.stage === 'answer' || (pick.stage === 'retry' && cell.state === 'retry');
      // 全詩順序卡一句一列：空格後面接原本的標點，第二聯起多一點空隙（D-204 第 1 點）。
      const text = order ? (index === 0 ? order.head : '') + '＿＿' + order.tails[index] : questionOf(blank.prompt);
      const pair = order && index > 0 && index % 2 === 0;
      return <li key={blank.prompt.fingerprint + String(index)} className={'ec-pick-row' + (pair ? ' is-pair' : '') + (index === pick.cursor ? ' is-on' : '') + (movable ? '' : ' is-locked')} onClick={() => { act({ kind: 'row', index }); }}>
        <span className="ec-pick-mark" data-state={cell.state}>{MARKS[cell.state] ?? ''}</span>
        <div className="ec-pick-text">
          <Markdown app={app} text={text} sourcePath={card.deck} mode="pick"
            slotNode={<button type="button" className="ec-pick-slot" data-state={cell.state} data-index={index} aria-label={`第 ${String(index + 1)} 格`}>{cell.state === 'retry' ? <s>{cell.text}</s> : cell.text || '　'}</button>}
            onReady={index === 0 ? onPainted : undefined} onFail={(error, path) => { onFail('front', error, path); }} />
        </div>
        {notes?.under[index] !== undefined && note(notes.under[index], 0, 'ec-order-note')}
      </li>;
    })}</ul>
    {notes && notes.rest.length > 0 && <div className="ec-order-rest">{notes.rest.map((text, i) => note(text, i, 'ec-order-line'))}</div>}
    {/* 對照（D-203）：上下排、不標結果；這次考到的照句子的順序排前面 */}
    {pick.stage === 'result' && !order && <div className="ec-pick-compare ec-answer">{compareOrder(group.rows, card.blanks.map(blank => blank.answer)).map(row => {
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

/** 字鍵與兩個動作（§7）：手指最常停的地方，字鍵在上，動作在下，中間留空，連點才不會誤按「對答案」。 */
function Tray({ view, animating, act, focusApp }: BottomProps): React.JSX.Element {
  const { pick, group } = partsOf(view);
  const retrying = pick.stage === 'retry';
  const cursor = pick.cursor;
  // 用滑鼠或手指點完，焦點回到畫面：Space、Enter 才是「對答案」，不是再按一次這個字鍵。Tab 過來用鍵盤按的（detail 是 0）留在原處。
  const after = (event: React.MouseEvent): void => { if (event.detail > 0) focusApp(); };
  // 全詩順序卡的字鍵是整句，兩個一排（D-204 第 2 點）；相同的句子各一個鍵，用位置當 key。
  const lines = group.order !== undefined && !group.order.starts;
  const words = !lines && group.keys.some(key => [...key].length > 1);
  return <div className="ec-pick-tray">
    <div className={'ec-pick-keys' + (lines ? ' is-lines' : words ? ' is-words' : '')} style={{ '--ec-pick-columns': String(lines ? 2 : keyColumns(group.keys.length, words)) } as React.CSSProperties}>
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
    const { pick } = partsOf(view);
    if (pick.stage === 'answer') act({ kind: 'check' });
    else if (pick.committable) commit();
  },
  stage: () => '',
};
