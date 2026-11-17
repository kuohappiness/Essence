import test from 'node:test';
import type { TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { createState } from '../src/state/index.ts';
import type { EditorHandle } from '../src/state/index.ts';
import { createMemoryFiles } from './helpers/memory-files.ts';

// AI 製卡第 2 批 L2 第一輪（Claude Codex Discussion/2026-11-17-ai-cards-deepen-l2.md）：state 的寫入門檻。R1 啟用時的 `需要版本`、
// R2 逾時鎖擋住排在後面的加深、R3 編輯器有沒存的字時在寫入那一列裡停下。

const DECK = 'Essence Cards/學業/國二上/自然/國二上自然 2-1 溫度.md';
const TEXT = '---\n年級學期: 國二上\n科目: 自然\n單元: 2-1 溫度\n狀態: 啟用\n---\n\n- 能說出溫度計的原理 ^abc234\n    - 出處：p.40\n    - 溫度計靠什麼原理？ :: 熱脹冷縮\n';
const NOW = Date.parse('2026-11-17T10:00:00+08:00');

async function load(t: TestContext, initial: Record<string, string>, extra: { build?: string; writeTimeout?: number } = {}) {
  const memory = createMemoryFiles(initial);
  const state = createState({ files: memory.files, device: 'PC-test', delay: 1, fillIds: true, random: Math.random, now: () => NOW, offset: () => 480, onError() {}, ...extra });
  t.after(() => state.close());
  await state.ready();
  return { memory, state };
}
const tail = (line: string) => (text: string): { text: string } => ({ text: text + line });

void test('R1 啟用含 `課外：` 的草稿：`需要版本` 和狀態一起寫；手寫的、混合出處的都一樣', async t => {
  for (const sources of ['課外：高中課本 p.44', 'p.40、課外：高中基礎物理 熱學']) {
    const draft = TEXT.replace('狀態: 啟用', '狀態: 草稿').replace('出處：p.40', `出處：${sources}`);
    const { memory, state } = await load(t, { [DECK]: draft }, { build: '0.6.0' });
    const result = await state.activateDraft(DECK, null);
    assert.equal(result.kind, 'done', sources);
    const text = memory.texts.get(DECK)!;
    assert.match(text, /^狀態: 啟用$/m);
    assert.match(text, /^需要版本: 0\.6\.0$/m, sources);
  }
  // 沒有課外的：照舊只改狀態。
  const { memory, state } = await load(t, { [DECK]: TEXT.replace('狀態: 啟用', '狀態: 草稿') }, { build: '0.6.0' });
  assert.equal((await state.activateDraft(DECK, null)).kind, 'done');
  assert.doesNotMatch(memory.texts.get(DECK)!, /需要版本/);
});

void test('R1 標記加不上（屬性區沒關）：草稿不啟用，回寫不進去', async t => {
  const broken = TEXT.replace('狀態: 啟用', '狀態: 草稿').replace('出處：p.40', '出處：課外：高中課本').replace('\n---\n\n-', '\n\n-');
  const { memory, state } = await load(t, { [DECK]: broken }, { build: '0.6.0' });
  const result = await state.activateDraft(DECK, null);
  assert.notEqual(result.kind, 'done');
  assert.equal(memory.texts.get(DECK), broken);
});

void test('R2 前一筆加深逾時：排在後面的同一篇加深不寫、回 locked（不是結果不明）', async t => {
  const { memory, state } = await load(t, { [DECK]: TEXT }, { writeTimeout: 30 });
  const held = memory.holdModify(DECK);
  const first = state.aiAppend(DECK, null, tail('\nA\n'));
  const second = state.aiAppend(DECK, null, tail('\nB\n'));
  assert.deepEqual(await first, { kind: 'timeout' });
  held.release();
  assert.deepEqual(await second, { kind: 'not', why: 'locked' });
  assert.ok(memory.texts.get(DECK)!.endsWith('\nA\n'));
  assert.ok(!memory.texts.get(DECK)!.includes('\nB\n'));
  // 之後再按也一樣，不燒掉恢復工作的出口。
  assert.deepEqual(await state.aiAppend(DECK, null, tail('\nC\n')), { kind: 'not', why: 'locked' });
});

void test('R2 反向：加入逾時之後的加深也停在 locked', async t => {
  const SRC = 'Essence Cards/學業/國二上/自然/來源.md';
  const src = TEXT.replace(' ^abc234', ' ^def234').replace('狀態: 啟用', '狀態: 啟用') + '\n> [!note]- 候選卡片\n> - 新的目標 ^ghj234\n>     - 出處：p.41\n>     - 問 :: 答\n';
  const { memory, state } = await load(t, { [DECK]: TEXT, [SRC]: src }, { writeTimeout: 30 });
  const held = memory.holdModify(SRC);
  const { introBoxes, refOf } = await import('../src/core/ai/index.ts');
  const refs = introBoxes(src).flatMap(box => box.items.map(refOf));
  const added = state.addCandidates(SRC, refs, null, () => true);
  const deepen = state.aiAppend(SRC, null, tail('\nB\n'));
  assert.equal((await added).kind, 'timeout');
  held.release();
  assert.deepEqual(await deepen, { kind: 'not', why: 'locked' });
  assert.ok(!memory.texts.get(SRC)!.includes('\nB\n'));
});

function editorFor(memory: ReturnType<typeof createMemoryFiles>, initial: string): EditorHandle & { value: string; saved: number } {
  const handle: EditorHandle & { value: string; saved: number } = {
    path: DECK, value: initial, saved: 0,
    text: () => handle.value,
    apply(from: string, to: string) { if (handle.value !== from) return false; handle.value = to; return true; },
    persist() { handle.saved++; memory.write(DECK, handle.value); return Promise.resolve(); },
  };
  return handle;
}

void test('R3 編輯器有沒存的字（排隊時才打的也算）：在寫入那一列裡停下，不改編輯器、不存', async t => {
  const OTHER = 'Essence Cards/學業/國二上/自然/別篇.md';
  const { memory, state } = await load(t, { [DECK]: TEXT, [OTHER]: TEXT.replace(' ^abc234', ' ^def234') }, { writeTimeout: 1000 });
  const editor = editorFor(memory, TEXT);
  // 別篇的寫入占住那一列；排隊期間家長在編輯器打字。
  const held = memory.holdModify(OTHER);
  const busy = state.aiAppend(OTHER, null, tail('\nX\n'));
  const mine = state.aiAppend(DECK, editor, tail('\nB\n'));
  editor.value = TEXT + '\n家長還沒存的字\n';
  held.release();
  await busy;
  assert.deepEqual(await mine, { kind: 'not', why: 'unsaved' });
  assert.equal(editor.value, TEXT + '\n家長還沒存的字\n');
  assert.equal(editor.saved, 0);
  assert.equal(memory.texts.get(DECK), TEXT);
});

void test('R3 編輯器和磁碟相同：照常經過編輯器寫', async t => {
  const { memory, state } = await load(t, { [DECK]: TEXT });
  const editor = editorFor(memory, TEXT);
  const result = await state.aiAppend(DECK, editor, tail('\nB\n'));
  assert.equal(result.kind, 'written');
  assert.ok(memory.texts.get(DECK)!.endsWith('\nB\n'));
});
