import { MarkdownView, type App, type WorkspaceLeaf } from 'obsidian';
import type { IntroDevHost } from './dev-intro.ts';
import { withTempFile } from './dev-temp.ts';
import { capturePng, keepRendering } from './dev-review.ts';

// tasks/ai-cards-add.md §7 的 Windows 實機：自編的兩篇卡組（一篇啟用、一篇草稿），真的按「加入」「全部加入」，
// 檢查兩邊的檔與今天的份。只用這次建的兩篇暫存檔，跑完改回原文、清掉。

const DEST = ['---', '狀態: 啟用', '---', '## 甲', '', '- 能甲一 ^zqxwa2', '    - Q1 :: A1', ''].join('\n');
const source = (dest: string): string => [
  '---', '狀態: 草稿', '---', '## 乙', '', '- 能乙一 ^zqxwf2', '    - Q2 :: A2', '',
  '> [!note] 加進已有的學習目標',
  `> - [[${dest}#^zqxwa2|能甲一]]`,
  '>     - Q3 :: A3',
  `> - [[${dest}#^zqxwa2|能甲一]]`,
  '>     - Q4 :: A4',
  '',
  '> [!note]- 候選卡片',
  '> - 能丙 ^zqxwg2',
  '>     - 理由：x',
  '>     - Q5 :: A5',
  '> - 能丁 ^zqxwh2',
  '>     - 理由：x',
  '>     - Q6 :: A6',
  '',
].join('\n');

async function until<T>(read: () => T | null | undefined | false | Promise<T | null | undefined | false>, ms = 8000): Promise<T | null> {
  const end = performance.now() + ms;
  for (;;) {
    const value = await read();
    if (value) return value;
    if (performance.now() > end) return null;
    await new Promise(resolve => { window.setTimeout(resolve, 100); });
  }
}

export async function introAddDev(host: IntroDevHost, folder: string, notices: readonly string[]): Promise<unknown> {
  const noticeStart = notices.length;
  const app: App = host.app;
  const state = host.state;
  if (!state) throw Error('state 還沒建立');
  await state.ready();
  const rendering = keepRendering();
  await app.vault.adapter.mkdir(folder).catch(() => undefined);
  await app.vault.adapter.mkdir('Essence Cards/開發測試').catch(() => undefined);
  let leaf: WorkspaceLeaf | null = null;
  const read = (path: string): Promise<string> => app.vault.adapter.read(path);
  try {
    return (await withTempFile(app, 'Essence Cards/開發測試/加入目的地', DEST, async destPath => {
      const destName = destPath.slice(destPath.lastIndexOf('/') + 1).replace(/\.md$/, '');
      const original = source(destName);
      return (await withTempFile(app, 'Essence Cards/開發測試/加入來源', original, async srcPath => {
        const result: Record<string, unknown> = { destPath, srcPath };
        await until(() => state.deckTargets(destPath).length === 1);
        result.before = { destTargets: state.deckTargets(destPath), todayDest: state.today().share.filter(item => item.deck === destPath).map(item => item.lt) };
        leaf = app.workspace.getLeaf('tab');
        await leaf.openFile(app.vault.getFileByPath(srcPath)!, { active: true, state: { mode: 'preview' } });
        const root = (leaf.view as MarkdownView).containerEl;
        const boxes = (): HTMLElement[] => Array.from(root.querySelectorAll<HTMLElement>('.markdown-reading-view .callout[data-essence-box]'));
        const button = (pick: (box: HTMLElement[]) => HTMLElement | null | undefined): Promise<HTMLButtonElement | null> =>
          until(() => { const found = pick(boxes()); return found && !(found as HTMLButtonElement).disabled ? found as HTMLButtonElement : null; });
        const confirm = async (): Promise<string | null> => {
          const modal = await until(() => document.querySelector<HTMLElement>('.modal-container .modal'));
          const text = modal?.querySelector('p')?.textContent ?? null;
          modal?.querySelector<HTMLButtonElement>('button.mod-cta')?.click();
          return text;
        };
        await until(() => boxes().length === 2);
        result.shots = [await capturePng(app, `${folder}/1 加入之前.png`)];
        // 1. 加進已有：第一項的「加入」（轉成連結的，不問）。
        (await button(b => b[0]?.querySelector<HTMLElement>('li > .essence-intro-add')))?.click();
        result.existingOne = await until(async () => { const [d, s] = [await read(destPath), await read(srcPath)]; return d.includes('Q3 :: A3') && !s.includes('Q3 :: A3') ? { dest: d, src: s } : null; });
        // 2. 加進已有：「全部加入」（先問）。
        (await button(b => b.find(box => box.textContent?.includes('加進已有'))?.querySelector<HTMLElement>(':scope > .callout-title > .essence-intro-add')))?.click();
        result.existingConfirm = await confirm();
        result.existingAll = await until(async () => { const [d, s] = [await read(destPath), await read(srcPath)]; return d.includes('Q4 :: A4') && !s.includes('加進已有的學習目標') ? { dest: d, src: s } : null; });
        // 3. 候選：第一項的「加入」（不問）。
        (await button(b => b.find(box => box.textContent?.includes('候選'))?.querySelector<HTMLElement>('li > .essence-intro-add')))?.click();
        result.candidateOne = await until(async () => { const s = await read(srcPath); return /\n- 能丙 \^zqxwg2\n/.test(s) ? s : null; });
        // 4. 候選：「全部加入」（先問）。
        (await button(b => b.find(box => box.textContent?.includes('候選'))?.querySelector<HTMLElement>(':scope > .callout-title > .essence-intro-add')))?.click();
        result.candidateConfirm = await confirm();
        result.candidateAll = await until(async () => { const s = await read(srcPath); return /\n- 能丁 \^zqxwh2\n/.test(s) && !s.includes('候選卡片') ? s : null; });
        (result.shots as unknown[]).push(await capturePng(app, `${folder}/2 加入之後.png`));
        // 今天的份：啟用的目的地照常出（新題在同一個目標底下）；草稿的來源不出。
        await until(() => state.deckTargets(srcPath).length === 0 && state.deckTargets(destPath).length === 1);
        // 今天的份可能已經被別的測試卡組排滿（上限），所以連「再複習一些」一起看：目的地的目標在其中一個，草稿的來源都不在。
        const today = state.today();
        const queued = (deck: string): string[] => [...today.share, ...today.more].filter(item => item.deck === deck).map(item => item.lt);
        result.after = {
          destTargets: state.deckTargets(destPath),
          srcTargets: state.deckTargets(srcPath),
          share: today.share.length,
          todayDest: today.share.filter(item => item.deck === destPath).map(item => item.lt),
          queuedDest: queued(destPath),
          queuedSrc: queued(srcPath),
        };
        const finalDest = await read(destPath), finalSrc = await read(srcPath);
        result.ok = {
          dest: finalDest === DEST.replace('    - Q1 :: A1\n', '    - Q1 :: A1\n    - Q3 :: A3\n    - Q4 :: A4\n'),
          src: finalSrc === ['---', '狀態: 草稿', '---', '## 乙', '', '- 能乙一 ^zqxwf2', '    - Q2 :: A2', '', '- 能丙 ^zqxwg2', '    - Q5 :: A5', '', '- 能丁 ^zqxwh2', '    - Q6 :: A6', ''].join('\n'),
          queued: queued(destPath).includes('zqxwa2') && queued(srcPath).length === 0,
          confirmTexts: result.existingConfirm ==='把 1 項加進已有的學習目標（1 篇卡組）？' && result.candidateConfirm === '把 1 個候選卡片加進這一篇的學習目標？',
        };
        result.final = { dest: finalDest, src: finalSrc };
        result.notices = notices.slice(noticeStart);
        // 改回原文再關掉分頁，withTempFile 才認得是這次建的、清得掉。
        (leaf as WorkspaceLeaf | null)?.detach();
        leaf = null;
        await app.vault.modify(app.vault.getFileByPath(srcPath)!, original);
        await app.vault.modify(app.vault.getFileByPath(destPath)!, DEST);
        return result;
      })).result;
    })).result;
  } finally {
    rendering.restore();
    (leaf as WorkspaceLeaf | null)?.detach();
  }
}
