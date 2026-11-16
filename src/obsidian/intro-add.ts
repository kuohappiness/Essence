import { MarkdownView, type MarkdownPostProcessorContext, type Plugin } from 'obsidian';
import { introBoxes, suspectOf } from '../core/ai/index.ts';
import type { BoxItem, BoxKind, IntroBox, ItemRef } from '../core/ai/index.ts';
import { isDeckPath, linesOf, readProperties } from '../core/deck/index.ts';
import type { State } from '../state/index.ts';

// 引言框的「加入」按鈕（tasks/ai-cards-add.md §1）：閱讀模式的候選卡片與加進已有的學習目標，每一項一個「加入」、標題列一個「全部加入」。
// 只在電腦（呼叫端只在電腦接）、外掛讀完之後；這一篇需要新版或屬性區讀不懂時不放。按下去時交給 add，它在最新的文字裡重新找（findItem）。

/** 按下去要做的：哪一篇、哪一種框、哪幾項（畫按鈕時的身分與原文）；all 是「全部加入」。 */
export interface AddRequest { path: string; kind: BoxKind; refs: readonly ItemRef[]; all: boolean }

export interface IntroButtonsOptions {
  state: () => State | null;
  add: (request: AddRequest) => void;
  /** 這一篇正在加入（§4〈同一篇同時只跑一個加入〉）或寫入還沒確定（〈逾時後晚到的寫入〉）：按鈕停用。 */
  busy: (path: string) => boolean;
}

/** 加進已有的那一項是存草稿時核對過、轉成連結的（§3-1）；原文 `ID 名稱` 的不進「全部加入」。 */
const linkedItem = (item: Pick<BoxItem, 'original'>): boolean => /^\s*(?:[-*+]|\d+[.)])\s+\[\[[^\]]*#\^[A-Za-z0-9-]+[|\]]/.test(item.original);
/** 「全部加入」會做的那幾項：一般候選（疑似重複只能逐項）、轉成連結的加進已有。 */
const batchItems = (box: IntroBox): BoxItem[] => box.items.filter(item => box.kind === 'candidate' ? !suspectOf(item.original) : linkedItem(item));
const refOf = (item: BoxItem): ItemRef => ({ kind: item.kind, id: item.id, original: item.original });

export function wireIntroButtons(plugin: Plugin, options: IntroButtonsOptions): { refresh(): void } {
  plugin.registerMarkdownPostProcessor((el, ctx) => { draw(el, ctx, options); });
  return {
    /** 讀完、加入做完之後重畫閱讀模式的卡組：按鈕跟著狀態出現、停用或恢復。 */
    refresh(): void {
      for (const leaf of plugin.app.workspace.getLeavesOfType('markdown')) {
        const view = leaf.view;
        if (view instanceof MarkdownView && view.file && isDeckPath(view.file.path) && view.getMode() === 'preview') view.previewMode.rerender(true);
      }
    },
  };
}

function draw(el: HTMLElement, ctx: MarkdownPostProcessorContext, options: IntroButtonsOptions): void {
  const path = ctx.sourcePath;
  if (!isDeckPath(path)) return;
  const callout = el.matches('.callout') ? el : el.querySelector<HTMLElement>(':scope > .callout');
  if (!callout) return;
  const state = options.state();
  // 讀完之前、手機（writeBlock 是 phone）不放；讀完之後由 refresh 重畫。
  const blocked = state?.writeBlock();
  if (!state || blocked === 'loading' || blocked === 'phone' || blocked === 'closed') return;
  if (state.deckStatus(path).needsUpdate) return;
  const info = ctx.getSectionInfo(el);
  if (!info) return;
  if (readProperties(linesOf(info.text)).props.statusRead === 'invalid') return;
  const box = introBoxes(info.text).find(each => each.line === info.lineStart);
  if (!box) return;
  callout.dataset.essenceBox = String(box.line);
  // 渲染出的最上層項目和原文的一一對應（P2）：數目不同就不放，免得按到別的項目。
  const content = callout.querySelector(':scope > .callout-content');
  const lis = content ? Array.from(content.querySelectorAll<HTMLElement>(':scope > ul > li, :scope > ol > li')) : [];
  if (lis.length !== box.items.length) return;
  const disabled = options.busy(path);
  const button = (text: string, request: AddRequest): HTMLButtonElement => {
    const b = createEl('button', { cls: 'essence-intro-add', text });
    b.disabled = disabled;
    // 標題列的按鈕不展開、不摺起引言框（P5）；項目的按鈕不跟著點到連結。
    b.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      if (!options.busy(path)) options.add(request);
    });
    return b;
  };
  box.items.forEach((item, i) => {
    const li = lis[i];
    li.dataset.essenceItem = String(item.line);
    const label = box.kind === 'candidate' && suspectOf(item.original) ? '加入為新目標' : '加入';
    const b = button(label, { path, kind: box.kind, refs: [refOf(item)], all: false });
    // 放在第一行的字後面、子項目之前。
    const nested = li.querySelector(':scope > ul, :scope > ol');
    li.insertBefore(b, nested);
  });
  const batch = batchItems(box);
  const title = callout.querySelector(':scope > .callout-title');
  if (batch.length && title) title.appendChild(button('全部加入', { path, kind: box.kind, refs: batch.map(refOf), all: true }));
  // 加進已有的：點連結可以打開原本的學習目標（§3-4、§5 第 4 點）；不寫進檔案。
  if (box.kind === 'existing' && content) content.prepend(createDiv({ cls: 'essence-intro-hint', text: '點連結可以打開原本的學習目標' }));
}
