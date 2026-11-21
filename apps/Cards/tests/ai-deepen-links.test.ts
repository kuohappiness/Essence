import test from 'node:test';
import assert from 'node:assert/strict';
import { retargetSnapshots } from '../src/obsidian/deepen-links.ts';
import type { SnapshotLinkIo } from '../src/obsidian/deepen-links.ts';

// AI 製卡第 2 批 L2 R7（使用者 2026-11-17 選 D）：卡組改名時，外掛把快照 `對象` 的連結改到新位置。只看接線：哪些情況改、哪些不改。

const OLD = 'Essence Cards/學業/國二上/自然/國二上自然 2-1.md';
const NEXT = 'Essence Cards/學業/國二上/自然/國二上自然 2-1 溫度.md';
const SNAP = 'Essence Cards/紀錄/AI 輸出/2026-11-10 國二上自然 2-1 加深.md';
const FIRST = 'Essence Cards/紀錄/AI 輸出/2026-11-01 國二上自然 2-1.md';
const snapshot = (target: string, work = '加深'): string => `---\n時間: 2026-11-10T10:00:00+08:00\n識別碼: m1\n工作: ${work}\n對象:\n  - "${target}"\n記穩目標: 無\n---\n\n<<<卡組>>>\n- 能說明溶解 ^abc222\n`;

function io(files: Record<string, string>, over: Partial<SnapshotLinkIo> = {}) {
  const texts = new Map(Object.entries(files));
  const written: string[] = [];
  const handle: SnapshotLinkIo = {
    autoUpdate: () => false,
    blocked: () => false,
    snapshots: () => Promise.resolve([...texts].filter(([path]) => path.startsWith('Essence Cards/紀錄/AI 輸出/')).map(([path, text]) => ({ path, text }))),
    named: name => [...texts.keys()].filter(path => path.slice(path.lastIndexOf('/') + 1, -3).toLowerCase() === name),
    process(path, change) { const next = change(texts.get(path)!); if (next !== texts.get(path)) { texts.set(path, next); written.push(path); } return Promise.resolve(); },
    ...over,
  };
  return { handle, texts, written };
}

void test('L2 R7 卡組改名：加深快照的完整路徑、初次製卡只寫檔名的都改到新位置；別篇的快照不動', async () => {
  const other = snapshot('[[Essence Cards/學業/國二上/自然/別篇.md|別篇]]');
  const { handle, texts, written } = io({
    [NEXT]: '卡組', [SNAP]: snapshot(`[[${OLD}|國二上自然 2-1]]`), [FIRST]: snapshot('[[國二上自然 2-1]]', '製卡'),
    'Essence Cards/紀錄/AI 輸出/別篇.md': other,
  });
  assert.equal(await retargetSnapshots(handle, OLD, NEXT), 2);
  assert.deepEqual(written.sort(), [FIRST, SNAP].sort());
  assert.match(texts.get(SNAP)!, /- "\[\[Essence Cards\/學業\/國二上\/自然\/國二上自然 2-1 溫度\.md\|國二上自然 2-1 溫度\]\]"/);
  assert.match(texts.get(FIRST)!, /- "\[\[Essence Cards\/學業\/國二上\/自然\/國二上自然 2-1 溫度\|國二上自然 2-1 溫度\]\]"/);
  assert.equal(texts.get('Essence Cards/紀錄/AI 輸出/別篇.md'), other);
  // 再收到一次（搬資料夾後 Obsidian 對個別檔案再送）：找不到舊連結，不寫。
  assert.equal(await retargetSnapshots(handle, OLD, NEXT), 0);
});

void test('L2 R7 不改的情況：Obsidian 會自己改、寫入被擋、舊位置不是卡組、只寫檔名而還有別篇同名', async () => {
  const files = { [NEXT]: '卡組', [SNAP]: snapshot(`[[${OLD}|國二上自然 2-1]]`) };
  for (const over of [{ autoUpdate: () => true }, { blocked: () => true }] satisfies Partial<SnapshotLinkIo>[]) {
    const { handle, written } = io(files, over);
    assert.equal(await retargetSnapshots(handle, OLD, NEXT), 0);
    assert.deepEqual(written, []);
  }
  const outside = io({ 'Notes/a.md': 'x', [SNAP]: snapshot('[[Notes/b.md|b]]') });
  assert.equal(await retargetSnapshots(outside.handle, 'Notes/b.md', 'Notes/a.md'), 0);
  // 同檔名的卡組還有一篇：連結現在指到它，不改。
  const twin = io({ [NEXT]: '卡組', 'Essence Cards/學業/國二上/自然/另一層/國二上自然 2-1.md': '卡組', [FIRST]: snapshot('[[國二上自然 2-1]]', '製卡') });
  assert.equal(await retargetSnapshots(twin.handle, OLD, NEXT), 0);
});

void test('L2 R11 掃描中寫入門檻關了：寫入回呼裡再看一次，不改', async () => {
  let closed = false;
  const { handle, texts, written } = io({ [NEXT]: '卡組', [SNAP]: snapshot(`[[${OLD}|國二上自然 2-1]]`) }, { blocked: () => closed });
  const list = handle.snapshots.bind(handle);
  handle.snapshots = () => { closed = true; return list(); };
  assert.equal(await retargetSnapshots(handle, OLD, NEXT), 0);
  assert.deepEqual(written, []);
  assert.match(texts.get(SNAP)!, /國二上自然 2-1\.md\|/);
});

void test('L2 R11 連續改名 A→B→C 照順序做：最後指到 C', async () => {
  const C = NEXT.replace('溫度.md', '溫度與熱.md');
  const { handle, texts } = io({ [C]: '卡組', [SNAP]: snapshot(`[[${OLD}|國二上自然 2-1]]`), [FIRST]: snapshot('[[國二上自然 2-1]]', '製卡') });
  await retargetSnapshots(handle, OLD, NEXT);
  await retargetSnapshots(handle, NEXT, C);
  for (const path of [SNAP, FIRST]) assert.match(texts.get(path)!, /國二上自然 2-1 溫度與熱(?:\.md)?\|國二上自然 2-1 溫度與熱\]\]/, path);
});

void test('L2 R7 讀了之後快照被改過：寫入當下照最新的全文改', async () => {
  const { handle, texts } = io({ [NEXT]: '卡組', [SNAP]: snapshot(`[[${OLD}|國二上自然 2-1]]`) });
  const process = handle.process.bind(handle);
  handle.process = (path, change) => { texts.set(path, texts.get(path)!.replace('記穩目標: 無', '記穩目標: 無\n家長: 加的')); return process(path, change); };
  assert.equal(await retargetSnapshots(handle, OLD, NEXT), 1);
  assert.match(texts.get(SNAP)!, /家長: 加的/);
  assert.match(texts.get(SNAP)!, /國二上自然 2-1 溫度\.md\|/);
});
