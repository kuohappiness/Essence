import { movingTails, otherSentences, shownTails } from '../core/deck/index.ts';
import { extraLabel, orderNotes } from '../review/index.ts';
import type { PickView } from '../review/index.ts';
import { Icon } from './Icon.tsx';
import { Markdown } from './Markdown.tsx';
import { MARKS, partsOf, pickScreen } from './PickCard.tsx';
import { slotMark, stripSlotMarks, tailMark } from './rendered.ts';
import type { BodyProps, Screen } from './screen.tsx';

// 排序的畫面（題型 order，題型模組任務說明 §1-8）：全詩順序卡（D-187、D-204）與英文的句子排序（tasks/english-typed-order.md §6）兩個題目區，
// 照目標的樣子（order.style）選。class 和點選填空相同，樣式照舊在 PickCard.css；字鍵、底部那一排和點卡片做什麼都和點選填空共用（PickCard.tsx）。

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
  // 格後面的字照還算數的那幾種對的順序的共同部分（tasks/sentence-order-alternatives.md §5）；沒有另一種排法時照題目那一行。
  // 每一種對的順序都一樣的照寫進句子；不一樣的位置寫 tailMark、字另外給（tailTexts），作答時句子不重新渲染（L2 第一輪：重畫會閃一下）。
  const tails = order ? shownTails(order, pick.orders) : [];
  const moving = order ? movingTails(order) : [];
  const marks = moving.reduce<number[]>((list, each, at) => each ? [...list, at] : list, []);
  const text = stripSlotMarks(order?.head ?? '') + card.blanks.map((_, i) => slotMark(i) + (moving[i] ? tailMark(marks.indexOf(i)) : stripSlotMarks(tails[i] ?? ''))).join('');
  const tailTexts = marks.map(at => tails[at] ?? '');
  const slots = card.blanks.map((_, index) => {
    const cell = pick.cells[index];
    const shown = starts[index] && cell.text && cell.state !== 'skipped' && cell.state !== 'miss' ? capital(cell.text) : cell.text;
    return <button key={index} type="button" className={'ec-pick-slot' + (index === pick.cursor ? ' is-on' : '')} data-state={cell.state} data-index={index} aria-label={`第 ${String(index + 1)} 格`}
      onClick={event => { event.stopPropagation(); act({ kind: 'row', index }); }}>{cell.state === 'retry' ? <s>{shown}</s> : shown || '　'}</button>;
  });
  const mark = worstState(pick.cells);
  const extras = pick.stage === 'result' ? [...ownExtras(card.prompt.extras, group, pick.orders), ...card.target.shared] : [];
  return <article className="ec-card ec-pick is-sentence is-english" lang="en">
    <div className="ec-meta" lang="zh-Hant">{card.isNew && <span className="ec-new">新</span>}<span>{view.crumb}</span></div>
    <p className="ec-pick-title" lang="zh-Hant">{group.title}</p>
    <ul className="ec-pick-rows"><li className={'ec-pick-row' + (pick.stage === 'result' ? ' is-locked' : '')}>
      <span className="ec-pick-mark" data-state={mark}>{MARKS[mark] ?? ''}</span>
      <div className="ec-pick-text">
        <Markdown app={app} text={text} sourcePath={card.deck} mode="pick" english slotNodes={slots} breakFirst={starts[0]} {...(marks.length ? { tailTexts } : {})} onReady={onPainted} onFail={(error, path) => { onFail('front', error, path); }} />
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

/**
 * 對答案後題目底下的補充（§5）：認得的另一種排法那幾行，照位置換成其他對的順序的整句（結果那一種不列、題目那一行不是結果時改列它），
 * 所以列的總是「其他」對的順序；認不得的照原文。
 */
function ownExtras(extras: readonly string[], group: ReturnType<typeof partsOf>['group'], orders: readonly number[] | undefined): string[] {
  const { order } = group;
  const sources = (order?.others ?? []).map(other => other.source);
  if (!order || !orders?.length || !sources.length) return [...extras];
  const lines = otherSentences(order, orders[0], group.members);
  return extras.map(extra => {
    const at = sources.indexOf(extra);
    if (at < 0) return extra;
    sources.splice(at, 1);
    return '另一種排法：' + (lines.shift() ?? '');
  });
}

/** 全詩順序卡（D-187、D-204）：一句一列；對答案後記憶錨點照 orderNotes 放在每句底下或最後（D-204 第 5、7 點）。 */
function PoemBody({ view, app, act, onPainted, onFail }: BodyProps): React.JSX.Element {
  const { card } = view;
  const { pick, group } = partsOf(view);
  const { order } = group;
  if (!order) throw Error('排序卡沒有句子的位置');
  const notes = pick.stage === 'result' ? orderNotes((card.target.kind?.id === 'order' && card.target.kind.order.style === 'poem' ? card.target.kind.order.notes : undefined) ?? [], card.blanks.length) : null;
  // 全詩順序卡的空格先撐到最長那一句的寬度，填進去時句子不跳（D-204 第 1 點）。
  const width = Math.max(...group.members.map(line => [...line].length));
  const note = (text: string, key: number, className: string): React.JSX.Element => <div key={key} className={className}>
    <Markdown app={app} text={text} sourcePath={card.deck} revealed onFail={(error, path) => { onFail('back', error, path); }} />
  </div>;
  return <article className="ec-card ec-pick is-order" lang="zh-Hant">
    <div className="ec-meta">{card.isNew && <span className="ec-new">新</span>}<span>{view.crumb}</span></div>
    <p className="ec-pick-title">{group.title}</p>
    <ul className="ec-pick-rows" style={{ '--ec-order-width': `${String(width)}em` } as React.CSSProperties}>{card.blanks.map((blank, index) => {
      const cell = pick.cells[index];
      const movable = pick.stage === 'answer' || (pick.stage === 'retry' && cell.state === 'retry');
      // 一句一列：空格後面接原本的標點，第二聯起多一點空隙（D-204 第 1 點）。
      const text = (index === 0 ? order.head : '') + '＿＿' + order.tails[index];
      const pair = index > 0 && index % 2 === 0;
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
  </article>;
}

/** 照目標的樣子選題目區：句子排序或全詩。 */
function OrderBody(props: BodyProps): React.JSX.Element {
  const { target } = props.view.card;
  return target.kind?.id === 'order' && target.kind.order.style === 'sentence' ? <SentenceBody {...props} /> : <PoemBody {...props} />;
}

export const orderScreen: Screen = { ...pickScreen, Body: OrderBody };
