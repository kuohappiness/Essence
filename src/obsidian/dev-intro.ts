import { MarkdownView, type App, type Plugin, type WorkspaceLeaf } from 'obsidian';
import { introBoxes } from '../core/ai/index.ts';
import type { State } from '../state/index.ts';
import type { AddRequest } from './intro-add.ts';
import { withTempFile } from './dev-temp.ts';
import { capturePng, keepRendering } from './dev-review.ts';

// tasks/ai-cards-add.md §1 的平台事實 P1～P5：自編的一篇草稿卡組，閱讀模式數按鈕、比行號，點按鈕只交給探針（不寫加入）。

export interface IntroDevHost extends Plugin {
  state: State | null;
  intro: { refresh(): void } | null;
  introProbe: ((request: AddRequest) => void) | null;
}

const DECK = [
  '---', '狀態: 草稿', '---', '## 甲', '', '- 能甲一 ^zqxwa2', '    - Q1 :: A1', '',
  '> [!note] 加進已有的學習目標',
  '> - [[不存在的卡組#^zqxwb2|能乙二]]',
  '>     - 乙二題 :: 答',
  '>         - ![[不存在的圖.png]]',
  '> - zqxwc2 丙三',
  '>     - 丙三題 ::',
  '>         - 第一行',
  '>         - 第二行',
  '>     - 程式：',
  '>         ```',
  '>         a  b',
  '>         ```',
  '',
  '> [!note]- 候選卡片',
  '> - 能丁四 ^zqxwd2',
  '>     - 理由：x',
  '>     - 丁四題 :: 答',
  '> - 能戊五 ^zqxwe2',
  '>     - 理由：可能重複 zqxwa2｜x',
  '>     - 戊五題 :: 答',
  '',
].join('\n');
const KEYWORDS = [['能乙二', '丙三'], ['能丁四', '能戊五']];

async function until<T>(read: () => T | null | undefined | false, ms = 5000): Promise<T | null> {
  const end = performance.now() + ms;
  for (;;) {
    const value = read();
    if (value) return value;
    if (performance.now() > end) return null;
    await new Promise(resolve => { window.setTimeout(resolve, 100); });
  }
}
const sleep = (ms: number): Promise<void> => new Promise(resolve => { window.setTimeout(resolve, ms); });

export async function introDev(host: IntroDevHost, folder: string): Promise<unknown> {
  const app: App = host.app;
  if (!host.state) throw Error('state 還沒建立');
  await host.state.ready();
  const rendering = keepRendering();
  const clicks: AddRequest[] = [];
  host.introProbe = request => { clicks.push(request); };
  await app.vault.adapter.mkdir(folder).catch(() => undefined);
  await app.vault.adapter.mkdir('Essence Cards/開發測試').catch(() => undefined);
  let leaf: WorkspaceLeaf | null = null;
  try {
    return (await withTempFile(app, 'Essence Cards/開發測試/引言框', DECK, async path => {
      const file = app.vault.getFileByPath(path)!;
      leaf = app.workspace.getLeaf('tab');
      await leaf.openFile(file, { active: true, state: { mode: 'preview' } });
      const view = leaf.view as MarkdownView;
      const root = view.containerEl;
      const boxesInFile = introBoxes(await app.vault.read(file));
      const callouts = await until(() => { const found = Array.from(root.querySelectorAll<HTMLElement>('.markdown-reading-view .callout[data-essence-box]')); return found.length === 2 ? found : null; });
      const shot1 = await capturePng(app, `${folder}/1 閱讀模式.png`);
      const result: Record<string, unknown> = { path, shots: [shot1] };
      // P1：畫按鈕時記下的框起始行（getSectionInfo 的 lineStart）和檔案裡的框相同。
      result.p1 = callouts ? { ok: callouts.map(c => Number(c.dataset.essenceBox)).join() === boxesInFile.map(b => b.line).join(), drawn: callouts.map(c => c.dataset.essenceBox), file: boxesInFile.map(b => b.line) } : { ok: false, drawn: [] };
      // P2：最上層 li 的個數與順序（每一項的第一行字）和原文相同。
      result.p2 = (callouts ?? []).map((callout, i) => {
        const lis = Array.from(callout.querySelectorAll<HTMLElement>(':scope > .callout-content > ul > li'));
        const texts = lis.map(li => (li.firstChild?.textContent ?? li.textContent ?? '').trim().slice(0, 20));
        return { ok: lis.length === boxesInFile[i].items.length && KEYWORDS[i].every((word, k) => (lis[k]?.textContent ?? '').includes(word)), lis: lis.length, items: boxesInFile[i].items.length, texts, buttons: lis.map(li => li.querySelector(':scope > .essence-intro-add')?.textContent ?? null) };
      });
      // P5：摺起的候選框，按標題列的「全部加入」不展開。
      const candidate = callouts?.[1] ?? null;
      const collapsedBefore = candidate?.classList.contains('is-collapsed') ?? null;
      const all = candidate?.querySelector<HTMLButtonElement>(':scope > .callout-title > .essence-intro-add') ?? null;
      all?.click();
      await sleep(500);
      result.p5 = { ok: collapsedBefore === true && candidate?.classList.contains('is-collapsed') === true && clicks.length === 1, collapsedBefore, collapsedAfter: candidate?.classList.contains('is-collapsed') ?? null, clicks: clicks.map(each => ({ kind: each.kind, all: each.all, refs: each.refs.map(ref => ref.id) })) };
      // 每一項的按鈕也只交給探針，不跟著點到連結或摺起。
      const itemButton = callouts?.[0]?.querySelector<HTMLButtonElement>('li > .essence-intro-add') ?? null;
      itemButton?.click();
      await sleep(300);
      result.itemClick = clicks.at(-1)?.refs.map(ref => ref.id) ?? null;
      // P4：檔案改了（拿掉候選的第一項），改到的那個框重畫，舊按鈕不在畫面上；沒改到的框 Obsidian 不重畫，按鈕留著（身分照原文，不受影響）。
      const oldCandidate = Array.from(callouts?.[1]?.querySelectorAll<HTMLElement>('.essence-intro-add') ?? []);
      const oldExisting = Array.from(callouts?.[0]?.querySelectorAll<HTMLElement>('.essence-intro-add') ?? []);
      const text = await app.vault.read(file);
      await app.vault.modify(file, text.replace('> - 能丁四 ^zqxwd2\n>     - 理由：x\n>     - 丁四題 :: 答\n', ''));
      const redrawn = await until(() => oldCandidate.some(b => b.isConnected) ? null : Array.from(root.querySelectorAll<HTMLElement>('.markdown-reading-view .callout[data-essence-box] .essence-intro-add')), 5000);
      // 候選框剩疑似重複的一項：只有「加入為新目標」，沒有「全部加入」。
      result.p4 = { ok: redrawn !== null && redrawn.length === oldExisting.length + 1, candidateBefore: oldCandidate.length, after: redrawn?.length ?? null, candidateOldShown: oldCandidate.filter(b => b.isConnected).length, existingKept: oldExisting.filter(b => b.isConnected).length };
      result.shots = [shot1, await capturePng(app, `${folder}/2 改檔之後.png`)];
      // P3：即時預覽的引言框也跑不跑 post processor。
      await leaf.setViewState({ type: 'markdown', state: { file: path, mode: 'source', source: false } });
      await sleep(1500);
      const live = Array.from(view.containerEl.querySelectorAll<HTMLElement>('.markdown-source-view .essence-intro-add'));
      result.p3 = { livePreviewButtons: live.length, mode: view.getMode() };
      (result.shots as unknown[]).push(await capturePng(app, `${folder}/3 即時預覽.png`));
      // 改回原文再關掉分頁，withTempFile 才認得是這次建的、清得掉。
      leaf.detach();
      leaf = null;
      await app.vault.modify(file, DECK);
      return result;
    })).result;
  } finally {
    host.introProbe = null;
    rendering.restore();
    (leaf as WorkspaceLeaf | null)?.detach();
  }
}
