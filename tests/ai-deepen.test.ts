import test from 'node:test';
import assert from 'node:assert/strict';
import {
  baselineOf, buildDeepenPrompt, chooseBase, deepenPending, deepenRow, deepenTask, goneTargets, readSkips, skipFor, hasOutsideItem, introBoxes, latestMap, moveDeepen, moveItems, ownSnapshots, readSnapshot, refOf, remindOf,
} from '../src/core/ai/index.ts';
import type { DeepenInput, SnapshotInfo } from '../src/core/ai/index.ts';
import { parseDeck } from '../src/core/deck/index.ts';
import type { Mastery } from '../src/core/study/index.ts';

// AI 製卡第 2 批（tasks/ai-cards-deepen.md）：快照的讀法與基準（§2-3）、任務段（§2-2）、門檻（§4-1）、待審核（§4-3）、加深的加入（§3-3）。預期照任務說明手寫。

const snap = (fields: Record<string, string>, body = ''): string => '---\n' + Object.entries(fields).map(([k, v]) => `${k}: ${v}`).join('\n') + '\n---\n\n' + body;
const MAP_BODY = '<<<全貌>>>\n水溶液的全貌\n\n<<<架構>>>\n1. 溶解\n\n<<<卡組>>>\n## 溶解\n\n- 能說明溶解 ^abc222\n    - Q :: A\n\n> [!note] 加深的學習目標\n> - 能比較兩種溶液 ^abc333\n>     - Q :: A\n\n<<<完>>>\n';

void test('快照：工作與記穩目標一起讀；時間要合法；對象讀連結；卡組段的名稱行 ID', () => {
  const first = readSnapshot('a.md', snap({ 時間: '2026-11-07T10:00:00+08:00', 識別碼: 'm1', 工作: '製卡', 對象: '\n  - "[[國二上自然 2-1]]"', 記穩目標: '無（初次製卡）' }, MAP_BODY))!;
  assert.equal(first.kind, 'first');
  assert.deepEqual(first.stable, []);
  assert.deepEqual(first.links, ['國二上自然 2-1']);
  assert.deepEqual(first.map, { whole: '水溶液的全貌', structure: '1. 溶解' });
  assert.deepEqual(first.named, [{ id: 'abc222', name: '能說明溶解' }, { id: 'abc333', name: '能比較兩種溶液' }]);
  const deepen = readSnapshot('b.md', snap({ 時間: '2026-11-10T10:00:00+08:00', 識別碼: 'm2', 工作: '加深', 對象: '"[[Essence Cards/學業/國二上/自然/國二上自然 2-1.md|國二上自然 2-1]]"', 記穩目標: '\n  - abc333\n  - abc222\n  - abc222' }))!;
  assert.equal(deepen.kind, 'deepen');
  assert.deepEqual(deepen.stable, ['abc222', 'abc333']);
  assert.deepEqual(deepen.links, ['Essence Cards/學業/國二上/自然/國二上自然 2-1.md']);
  assert.deepEqual(readSnapshot('c.md', snap({ 時間: '2026-11-10T10:00:00+08:00', 識別碼: 'm3', 工作: '加深', 對象: 'x', 記穩目標: '無' }))!.stable, []);
  // 其他組合不算加深過。
  for (const [work, stable] of [['製卡', '無'], ['加深', '無（初次製卡）'], ['製卡', '\n  - abc222'], ['加深', '\n  - 不是 ID'], ['錯題分析', '無']]) {
    assert.equal(readSnapshot('d.md', snap({ 時間: '2026-11-10T10:00:00+08:00', 識別碼: 'm4', 工作: work, 記穩目標: stable }))!.kind, null, `${work} ${stable}`);
  }
  // 2 月 30 日、沒有時區：時刻是 null。
  assert.equal(readSnapshot('e.md', snap({ 時間: '2026-02-30T10:00:00+08:00', 識別碼: 'm5', 工作: '加深', 記穩目標: '無' }))!.at, null);
  assert.equal(readSnapshot('e.md', snap({ 時間: '2026-11-10T10:00:00', 識別碼: 'm5', 工作: '加深', 記穩目標: '無' }))!.at, null);
  assert.equal(readSnapshot('f.md', '沒有屬性區'), null);
});

const info = (path: string, over: Partial<SnapshotInfo>): SnapshotInfo => ({ path, at: Date.parse('2026-11-10T10:00:00+08:00'), id: 'x', kind: 'deepen', stable: [], links: ['D'], map: null, named: [], ...over });
const NOW = Date.parse('2026-11-17T10:00:00+08:00');

void test('歸屬：只認解析到這一篇的連結；ID 一個都不在這一篇時不算（同一路徑換了一篇）', () => {
  const resolve = (link: string): string | null => link === 'D' ? 'deck.md' : link === 'E' ? 'other.md' : null;
  const ids = new Set(['abc222']);
  const list = [
    info('a', { links: ['D'], named: [{ id: 'abc222', name: 'x' }] }),
    info('b', { links: ['E'] }),
    info('c', { links: ['?'] }),
    info('d', { links: ['E', 'D'] }),
    info('e', { links: ['D'], named: [{ id: 'zzz999', name: 'x' }], stable: ['zzz888'] }),
    info('f', { links: ['D'], stable: ['abc222'] }),
  ];
  assert.deepEqual(ownSnapshots(list, 'deck.md', ids, resolve).map(each => each.path), ['a', 'd', 'f']);
});

void test('基準：比時刻（不同時區）、同時刻比識別碼再比路徑；未來超過一天、kind 是 null 的不採用', () => {
  const t = (text: string): number => Date.parse(text);
  const a = info('a', { at: t('2026-11-10T10:00:00+08:00'), id: 'a' });
  const b = info('b', { at: t('2026-11-10T03:00:00Z'), id: 'b' }); // 同一刻（11:00+08:00），比 a 晚
  assert.equal(baselineOf([a, b], NOW)?.path, 'b');
  const c = info('c', { at: b.at, id: 'b' });
  assert.equal(baselineOf([a, b, c], NOW)?.path, 'c');
  const future = info('f', { at: NOW + 2 * 86_400_000, id: 'z' });
  assert.equal(baselineOf([a, future], NOW)?.path, 'a');
  assert.equal(baselineOf([a, info('n', { at: NOW, kind: null, stable: null })], NOW)?.path, 'a');
  assert.equal(baselineOf([], NOW), null);
  // 地圖和基準分開選：只補題的那次加深沒有地圖，不遮掉前一份。
  const withMap = info('m', { at: t('2026-11-09T10:00:00+08:00'), map: { whole: 'w', structure: 's' } });
  assert.equal(latestMap([withMap, a], NOW)?.path, 'm');
});

void test('以前出過、現在不在這一篇：每個 ID 一次，名稱取最新的那份', () => {
  const old = info('o', { at: 1, named: [{ id: 'abc333', name: '舊名' }, { id: 'abc222', name: 'x' }] });
  const recent = info('r', { at: 2, named: [{ id: 'abc333', name: '新名' }, { id: 'abc444', name: '候選' }] });
  assert.deepEqual(goneTargets([old, recent], new Set(['abc222'])), [{ id: 'abc333', name: '新名' }, { id: 'abc444', name: '候選' }]);
});

const INPUT: DeepenInput = {
  form: { term: '國二上', unit: '2-1 水溶液', purpose: '平常複習', adjust: '這次不要課外', material: '' },
  subject: { subject: '自然', r3: true },
  targets: [{ id: 'abc222', name: '能說明溶解', mastery: 'stable', first: 'Q :: A' }, { id: 'abc333', name: '能比較', mastery: 'weak' }, { id: 'abc444', name: '能算', mastery: 'unknown' }],
  siblings: [{ id: 'abc555', name: '別篇的目標' }],
  map: { whole: '全貌原文', structure: '架構原文' },
  gone: [{ id: 'abc666', name: '沒採用的' }],
};

void test('任務段：目標標記穩了／常錯／還沒記穩、同單元其他篇、以前出過的、地圖原文；版號 加深 v1', () => {
  const task = deepenTask(INPUT);
  for (const line of ['  - abc222 能說明溶解｜記穩了｜第一題：Q :: A', '  - abc333 能比較｜常錯', '  - abc444 能算｜還沒記穩', '  - abc555 別篇的目標', '  - abc666 沒採用的', '- 家長調整：這次不要課外', '<<<全貌>>>', '全貌原文', '架構原文']) {
    assert.ok(task.split('\n').includes(line), line);
  }
  assert.match(task, /全部\*\*記穩了才出/);
  assert.match(task, /課外：<可以查的來源>/);
  assert.match(task, /這一節目前沒有更深的內容/);
  const none = deepenTask({ ...INPUT, map: null, siblings: [], gone: [] });
  assert.match(none, /最新的學習地圖：無。請先依教材補一份全貌與架構/);
  const prompt = buildDeepenPrompt(INPUT, []);
  assert.equal(prompt.parts.at(-1)?.version, '加深 v1');
});

const m = (entries: [string, Mastery][]): Map<string, Mastery> => new Map(entries);

void test('門檻：pool 的一半、第一次至少 3、之後至少 1；紀錄不完整不算；基準集合裡的不算進 pool', () => {
  // 第一次：6 個啟用、3 個記穩 → 3 ≥ max(3, 3)。
  const six = ['a', 'b', 'c', 'd', 'e', 'f'];
  assert.equal(remindOf(six, m([['a', 'stable'], ['b', 'stable'], ['c', 'stable']]), null).show, true);
  assert.equal(remindOf(six, m([['a', 'stable'], ['b', 'stable'], ['c', 'unknown']]), null).show, false);
  // 首輪只有兩個：全部記穩也到不了 3。
  assert.equal(remindOf(['a', 'b'], m([['a', 'stable'], ['b', 'stable']]), null).show, false);
  // 之後：基準記穩了 a～d，pool 是 e、f、g；要 ⌈3/2⌉ = 2 個。
  const base = { stable: ['a', 'b', 'c', 'd'], first: false };
  const seven = [...six, 'g'];
  assert.deepEqual(remindOf(seven, m([['e', 'stable']]), base), { show: false, first: false, fresh: 1, pool: 3, need: 2 });
  assert.equal(remindOf(seven, m([['e', 'stable'], ['f', 'stable']]), base).show, true);
  // 只剩一個：記穩一個就問。
  assert.equal(remindOf(['a', 'b', 'c', 'd', 'e'], m([['e', 'stable']]), base).show, true);
  // 全部記穩、沒有新的：不問。
  assert.equal(remindOf(['a', 'b', 'c', 'd'], m([['a', 'stable']]), base).show, false);
});

void test('基準的選法：這次不用比快照晚才用它；第一次照快照算', () => {
  const snapshot = { at: 100, stable: ['a'], first: false };
  assert.deepEqual(chooseBase(snapshot, { at: 200, ids: ['a', 'b'] }), { stable: ['a', 'b'], first: false });
  assert.deepEqual(chooseBase(snapshot, { at: 100, ids: ['a', 'b'] }), { stable: ['a'], first: false });
  assert.deepEqual(chooseBase(null, { at: 1, ids: ['a'] }), { stable: ['a'], first: true });
  assert.deepEqual(chooseBase({ at: 100, stable: [], first: true }, null), { stable: [], first: true });
  assert.equal(chooseBase(null, null), null);
});

const DECK = '---\n年級學期: 國二上\n科目: 自然\n單元: 2-1\n---\n\n## 溶解\n\n- 能說明溶解 ^abc222\n    - Q1 :: A1\n\n### 溶解度\n\n- 能讀溶解度表 ^abc777\n    - Q7 :: A7\n\n## 擴散\n\n- 能說明擴散 ^abc888\n    - Q8 :: A8\n';
const box = (heading: string, name = '能比較兩種溶液 ^abc333'): string => `\n> [!note] 加深的學習目標\n> ${heading}\n>\n> - ${name}\n>     - Q3 :: A3\n`;
const add = (text: string): ReturnType<typeof moveDeepen> => {
  const item = introBoxes(text).find(each => each.kind === 'deepen')!.items[0];
  return moveDeepen(text, [refOf(item)], { elsewhere: () => false });
};
const sectionOf = (text: string, id: string): string | null => parseDeck(text).targets.find(t => t.id === id)?.section ?? null;

void test('待審核：加深的框裡還有項目；空框、第 1 批的框不算', () => {
  assert.equal(deepenPending(DECK + box('## 溶解')), true);
  assert.equal(deepenPending(DECK + '\n> [!note] 加深的學習目標\n> 家長自己的字\n'), false);
  assert.equal(deepenPending(DECK + '\n> [!note]- 候選卡片\n> - 能比較 ^abc333\n>     - Q :: A\n'), false);
  assert.equal(deepenPending(DECK + '\n> [!note]- 候選卡片（加深）\n> - 能比較 ^abc333\n>     - Q :: A\n'), true);
  assert.equal(deepenPending(DECK + '\n> [!note] 加進已有的學習目標（加深）\n> - abc222 能說明溶解\n>     - Q9 :: A9\n'), true);
  assert.equal(deepenPending(DECK), false);
});

void test('加深的加入：放進同名標題直屬的範圍，不放到子標題那一節後面（第二輪 R7）', () => {
  const plan = add(DECK + box('## 溶解'));
  assert.ok(plan.text, JSON.stringify(plan.left));
  assert.equal(sectionOf(plan.text, 'abc333'), '溶解');
  // 放在 abc222 後面、### 溶解度 之前。
  const lines = plan.text.split('\n');
  assert.ok(lines.indexOf('- 能比較兩種溶液 ^abc333') < lines.indexOf('### 溶解度'));
  assert.ok(lines.indexOf('- 能比較兩種溶液 ^abc333') > lines.indexOf('- 能說明溶解 ^abc222'));
  // 框搬空了拿掉。
  assert.equal(introBoxes(plan.text).length, 0);
  // 子標題：放在 ### 溶解度 那一節。
  assert.equal(sectionOf(add(DECK + box('### 溶解度')).text!, 'abc333'), '溶解度');
});

void test('加深的加入：直屬範圍沒有目標時放在標題下一行；找不到就新增標題；同名兩個留著', () => {
  const nested = '---\n科目: 自然\n---\n\n## 溶解\n\n### 溶解度\n\n- 能讀溶解度表 ^abc777\n    - Q7 :: A7\n';
  const plan = add(nested + box('## 溶解'));
  assert.equal(sectionOf(plan.text!, 'abc333'), '溶解');
  assert.equal(sectionOf(plan.text!, 'abc777'), '溶解度');
  const created = add(DECK + box('## 沉澱'));
  assert.equal(sectionOf(created.text!, 'abc333'), '沉澱');
  assert.equal(sectionOf(created.text!, 'abc888'), '擴散');
  const twice = '---\n科目: 自然\n---\n\n## A\n\n### 同名\n\n- x ^abc111\n    - Q :: A\n\n## B\n\n### 同名\n\n- y ^abc999\n    - Q :: A\n';
  const left = add(twice + box('### 同名'));
  assert.equal(left.text, null);
  assert.match(left.left[0].why, /兩個以上同名的小標題/);
  // 框裡沒有標題：照候選的放法放在最後一個目標後面。
  const plain = add(DECK + '\n> [!note] 加深的學習目標\n> - 能比較兩種溶液 ^abc333\n>     - Q3 :: A3\n');
  assert.equal(sectionOf(plain.text!, 'abc333'), '擴散');
});

void test('一次加入：候選與加深的學習目標分開搬，結果合在一起', () => {
  const text = DECK + box('## 溶解') + '\n> [!note]- 候選卡片（加深）\n> - 能預測 ^abc444\n>     - Q4 :: A4\n';
  const refs = introBoxes(text).flatMap(each => each.items.map(refOf));
  const plan = moveItems(text, refs, { elsewhere: () => false });
  assert.deepEqual(plan.left, []);
  assert.equal(sectionOf(plan.text!, 'abc333'), '溶解');
  assert.ok(parseDeck(plan.text!).targets.some(t => t.id === 'abc444'));
});

void test('加深的補題：出處有課外：的認得出來（那一項留給家長）', () => {
  assert.equal(hasOutsideItem('- abc222 能說明溶解\n    - 出處：p.44、課外：高中課本\n    - Q :: A'), true);
  assert.equal(hasOutsideItem('- abc222 能說明溶解\n    - 出處：\n        - p.44\n        - 課外：高中課本\n    - Q :: A'), true);
  assert.equal(hasOutsideItem('- abc222 能說明溶解\n    - 出處：p.44\n    - 課外：這是題目 :: A'), false);
  assert.equal(hasOutsideItem('- abc222 能說明溶解\n    - Q :: A'), false);
});

void test('§5-1 這次不用：外層壞了整份當沒有，某一篇壞了只略過那一篇；路徑重用的鍵當沒有，ids 空的照路徑用', () => {
  const timeOf = (text: string): number | null => { const ms = Date.parse(text); return Number.isNaN(ms) ? null : ms; };
  assert.equal(readSkips([], timeOf).size, 0);
  assert.equal(readSkips('x', timeOf).size, 0);
  const skips = readSkips({
    'a.md': { ids: ['abc333', 'abc222', 'abc222'], at: '2026-11-10T10:00:00+08:00' },
    'b.md': { ids: ['不是 ID'], at: '2026-11-10T10:00:00+08:00' },
    'c.md': { ids: [], at: '不是時間' },
    'd.md': { ids: [], at: '2026-11-10T10:00:00+08:00' },
    'e.md': 'x',
  }, timeOf);
  assert.deepEqual([...skips.keys()], ['a.md', 'd.md']);
  assert.deepEqual(skips.get('a.md')!.ids, ['abc222', 'abc333']);
  assert.equal(skipFor(skips.get('a.md'), new Set(['abc222', 'zzz999'])), skips.get('a.md'));
  assert.equal(skipFor(skips.get('a.md'), new Set(['zzz999'])), null);
  assert.equal(skipFor(skips.get('d.md'), new Set(['zzz999'])), skips.get('d.md'));
  assert.equal(skipFor(undefined, new Set()), null);
});

void test('§4-2、§4-3 提醒一區的一行：等待貼回優先、再來待審核；第一次說「有」，之後說「又有」；沒到門檻不出現', () => {
  const ready = { show: true, first: true, fresh: 6, pool: 10, need: 5 };
  assert.deepEqual(deepenRow('a.md', 'L3 單字', { waiting: true, pending: true, remind: ready }), { path: 'a.md', kind: 'waiting', text: 'L3 單字：加深的提示已複製，等你貼回' });
  assert.deepEqual(deepenRow('a.md', 'L3 單字', { waiting: false, pending: true, remind: ready })?.text, 'L3 單字：上一次加深的結果還沒審完');
  assert.equal(deepenRow('a.md', 'L3 單字', { waiting: false, pending: false, remind: ready })?.text, 'L3 單字：有 6 個記穩了，要加深嗎？');
  assert.equal(deepenRow('a.md', 'L3 單字', { waiting: false, pending: false, remind: { ...ready, first: false } })?.text, 'L3 單字：又有 6 個記穩了，要加深嗎？');
  assert.equal(deepenRow('a.md', 'L3 單字', { waiting: false, pending: false, remind: { ...ready, show: false } }), null);
  assert.equal(deepenRow('a.md', 'L3 單字', { waiting: false, pending: false, remind: null }), null);
});
