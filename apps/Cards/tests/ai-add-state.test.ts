import test from 'node:test';
import type { TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { introBoxes, WHY } from '../src/core/ai/index.ts';
import type { ItemRef } from '../src/core/ai/index.ts';
import { createState } from '../src/state/index.ts';
import type { State, StateOptions } from '../src/state/index.ts';
import { createMemoryFiles, type MemoryFiles } from './helpers/memory-files.ts';

// tasks/ai-cards-add.md §2 在 state 的部分：候選搬進同一篇，走補 ID 同一條寫入與門檻；確認之後批次變了不寫；逾時另外回報。真正的 createState，記憶體 Files。

const DECK = 'Essence Cards/學業/國二上/自然/2-1.md';
const OTHER = 'Essence Cards/學業/國二上/自然/2-2.md';
const head = (status: string): string => `---\n年級學期: 國二上\n科目: 自然\n單元: 2-1 密度\n狀態: ${status}\n---\n\n`;
const body = '- 能說出密度 ^k3m9qa\n    - 密度？ :: 質量除以體積\n\n> [!note]- 候選卡片\n> - 能說出浮力 ^p7q2w8\n>     - 理由：x\n>     - 浮力？ :: 向上的力\n';
const moved = '- 能說出密度 ^k3m9qa\n    - 密度？ :: 質量除以體積\n\n- 能說出浮力 ^p7q2w8\n    - 浮力？ :: 向上的力\n';
const refsOf = (text: string): ItemRef[] => introBoxes(text).flatMap(box => box.items).map(({ kind, id, original }) => ({ kind, id, original }));

interface Harness extends MemoryFiles { state: State }
async function setup(t: TestContext, texts: Record<string, string>, options: Partial<StateOptions> = {}): Promise<Harness> {
  const memory = createMemoryFiles(texts);
  const state = createState({ files: memory.files, device: 'PC-test', delay: 1, fillIds: true, stuckAfter: 20, random: () => 0, now: () => Date.parse('2026-11-16T10:00:00.000+08:00'), offset: () => 480, onError() {}, ...options });
  t.after(() => state.close());
  await state.ready();
  return { ...memory, state };
}

void test('§2 state：候選搬進同一篇、核對讀取確認寫成；啟用的卡組新目標接著出題', async t => {
  const text = head('啟用') + body;
  const h = await setup(t, { [DECK]: text });
  assert.deepEqual(h.state.deckTargets(DECK), ['k3m9qa']);
  const result = await h.state.addCandidates(DECK, refsOf(text), null, () => true);
  assert.equal(result.kind, 'written');
  assert.ok(result.kind === 'written' && result.confirmed && result.moved.length === 1 && result.left.length === 0);
  assert.equal(h.texts.get(DECK), head('啟用') + moved);
  assert.deepEqual(h.state.deckTargets(DECK), ['k3m9qa', 'p7q2w8']);
});

void test('§2 state：別篇卡組已經用了這個 ID，留項、不寫；不是卡組或沒有要搬的回 nothing', async t => {
  const text = head('草稿') + body;
  const h = await setup(t, { [DECK]: text, [OTHER]: head('啟用') + '- 能說出浮力 ^p7q2w8\n    - 浮力？ :: 向上的力\n' });
  const result = await h.state.addCandidates(DECK, refsOf(text), null, () => true);
  assert.deepEqual(result, { kind: 'nothing', left: [{ ref: refsOf(text)[0], why: WHY.takenId('p7q2w8') }] });
  assert.equal(h.texts.get(DECK), text);
});

void test('§2 state：確認之後批次變了（still 不成立）回 changed、不寫', async t => {
  const text = head('草稿') + body;
  const h = await setup(t, { [DECK]: text });
  assert.deepEqual(await h.state.addCandidates(DECK, refsOf(text), null, () => false), { kind: 'changed' });
  assert.equal(h.texts.get(DECK), text);
});

void test('§2 state：手機、需要新版照補 ID 的門檻擋下', async t => {
  const text = head('草稿') + body;
  const phone = await setup(t, { [DECK]: text }, { fillIds: false });
  assert.deepEqual(await phone.state.addCandidates(DECK, refsOf(text), null, () => true), { kind: 'blocked', reason: 'phone' });
  const newer = text.replace('狀態: 草稿', '狀態: 草稿\n需要版本: 99.0.0');
  const gated = await setup(t, { [DECK]: newer });
  assert.deepEqual(await gated.state.addCandidates(DECK, refsOf(newer), null, () => true), { kind: 'blocked', reason: 'needs-update' });
  assert.equal(gated.texts.get(DECK), newer);
});

void test('§2 state：寫進磁碟逾時回 timeout（呼叫端這次開著 Obsidian 的期間停用這一篇）', async t => {
  const text = head('草稿') + body;
  const h = await setup(t, { [DECK]: text }, { writeTimeout: 30 });
  const held = h.holdModify(DECK);
  const result = await h.state.addCandidates(DECK, refsOf(text), null, () => true);
  assert.deepEqual(result, { kind: 'timeout' });
  held.release();
});
