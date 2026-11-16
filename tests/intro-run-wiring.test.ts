import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { introBoxes } from '../src/core/ai/index.ts';
import type { ItemRef } from '../src/core/ai/index.ts';
import { createObsidianStub, type FakeEl } from './helpers/obsidian.ts';

// 引言框的「加入」按下去之後（tasks/ai-cards-add.md §2、§4）：用共用的 obsidian 替身跑 src/obsidian/intro-run.ts，state 是假的。
// 寫入本身在 ai-add-state.test.ts 測（真的 createState），這裡看：全部加入先問、確認到寫入之間變了重新問、同一篇同時只跑一個、逾時之後停用、通知的字。
const root = fileURLToPath(new URL('../', import.meta.url));
const code = (await build({
  absWorkingDir: root, stdin: { contents: "export { createIntroRunner } from './src/obsidian/intro-run.ts';", resolveDir: root, loader: 'ts' },
  bundle: true, format: 'cjs', platform: 'browser', target: 'es2022', write: false,
  external: ['obsidian', '@codemirror/state', '@codemirror/view'],
})).outputFiles[0].text;

const DECK = 'Essence Cards/學業/國二上/自然/2-1.md';
const TEXT = '- 能說出密度 ^k3m9qa\n    - 密度？ :: 質量除以體積\n\n> [!note]- 候選卡片\n> - 能說出浮力 ^p7q2w8\n>     - 理由：x\n>     - 浮力？ :: 向上的力\n> - 能說出壓力 ^h2m8qd\n>     - 理由：可能重複 k3m9qa｜x\n>     - 壓力？ :: 單位面積的力\n> - 能說出重量 ^r5t6y7\n>     - 理由：x\n>     - 重量？ :: 受到的重力\n';
const refs = (text: string): ItemRef[] => introBoxes(text).flatMap(box => box.items).map(({ kind, id, original }) => ({ kind, id, original }));
/** 給家長看的字（預期值寫死，不引用程式裡的常數）。 */
const TIPS = {
  confirm: '把 2 個候選卡片加進這一篇的學習目標？可能重複的 1 項請逐項看。',
  moved: (n: number) => `已把 ${String(n)} 個候選卡片加進這一篇的學習目標`,
  changed: '框裡的項目一直在變，沒有加入；請再按一次',
  locked: '「2-1」的寫入還沒確定，請重開 Obsidian 後再按',
  failed: '這篇筆記暫時存不進去，沒有加入；請稍後再按一次',
};

type Result = Record<string, unknown> & { kind: string };
interface Call { refs: readonly ItemRef[]; still: (text: string) => boolean }
interface Runner { busy(path: string): boolean; add(request: unknown): void; close(): void }
interface Module {
  createIntroRunner: (host: unknown) => Runner;
}
const tick = async (): Promise<void> => { for (let i = 0; i < 5; i++) await new Promise(resolve => setImmediate(resolve)); };

function setup(results: Result[] = []) {
  const stub = createObsidianStub();
  stub.texts.set(DECK, TEXT);
  const module = stub.load<Module>(code);
  const calls: Call[] = [], errors: unknown[] = [];
  let refreshed = 0;
  let pending: (() => void) | null = null;
  const state = {
    addCandidates(_path: string, chosen: readonly ItemRef[], _editor: unknown, still: (text: string) => boolean) {
      calls.push({ refs: chosen, still });
      const result = results.shift() ?? { kind: 'written', confirmed: true, moved: chosen, left: [] };
      if (result.kind === 'hold') return new Promise(resolve => { pending = () => { resolve({ kind: 'written', confirmed: true, moved: chosen, left: [] }); }; });
      return Promise.resolve(result);
    },
  };
  const runner = module.createIntroRunner({ app: stub.app, state: () => state, notify: (message: string) => { stub.notices.push(message); }, onError: (error: unknown) => { errors.push(error); }, refresh: () => { refreshed++; } });
  const modal = (): FakeEl | null => { const open = stub.modals.filter(each => each.isOpen).at(-1); return open ? open.contentEl : null; };
  const answer = (yes: boolean): void => { modal()!.querySelectorAll('button')[yes ? 1 : 0].click(); };
  return { stub, runner, calls, errors, modal, answer, refreshed: () => refreshed, release: () => { pending?.(); } };
}
const all = { path: DECK, kind: 'candidate', refs: refs(TEXT).filter((_ref, i) => i !== 1), all: true };
const one = { path: DECK, kind: 'candidate', refs: [refs(TEXT)[0]], all: false };

void test('§2 單項加入不問，交給 state；做完通知加入了幾項', async () => {
  const h = setup();
  h.runner.add(one);
  await tick();
  assert.equal(h.modal(), null);
  assert.deepEqual(h.calls.map(each => each.refs), [one.refs]);
  assert.deepEqual(h.stub.notices, [TIPS.moved(1)]);
});

void test('§2 全部加入先問（疑似重複另說）；取消不寫；確認後交出最新文字裡的一般候選', async () => {
  const h = setup();
  h.runner.add(all);
  await tick();
  assert.equal(h.modal()!.querySelectorAll('p')[0].text, TIPS.confirm);
  h.answer(false);
  await tick();
  assert.equal(h.calls.length, 0);
  assert.deepEqual(h.stub.notices, []);
  assert.equal(h.runner.busy(DECK), false);
  h.runner.add(all);
  await tick();
  h.answer(true);
  await tick();
  assert.deepEqual(h.calls[0].refs.map(ref => ref.id), ['p7q2w8', 'r5t6y7']);
  // 寫入時的核對：批次相同才寫；家長把一項改成疑似重複、刪掉一項、改了原文都不成立。
  const still = h.calls[0].still;
  assert.equal(still(TEXT), true);
  assert.equal(still(TEXT.replace('>     - 理由：x\n>     - 重量', '>     - 理由：可能重複 k3m9qa\n>     - 重量')), false);
  assert.equal(still(TEXT.replace('> - 能說出浮力 ^p7q2w8\n>     - 理由：x\n>     - 浮力？ :: 向上的力\n', '')), false);
  assert.equal(still(TEXT.replace('受到的重力', '地球的引力')), false);
  assert.deepEqual(h.stub.notices, [TIPS.moved(2)]);
});

void test('§2 確認到寫入之間變了：重新問；一直在變問三次就停', async () => {
  const h = setup([{ kind: 'changed' }, { kind: 'changed' }, { kind: 'changed' }]);
  h.runner.add(all);
  for (let i = 0; i < 3; i++) { await tick(); h.answer(true); }
  await tick();
  assert.equal(h.calls.length, 3);
  assert.equal(h.stub.modals.length, 3);
  assert.deepEqual(h.stub.notices, [TIPS.changed]);
});

void test('§4 同一篇同時只跑一個：進行中按鈕停用、雙擊只跑一次，做完恢復', async () => {
  const h = setup([{ kind: 'hold' }]);
  h.runner.add(one);
  h.runner.add(one);
  await tick();
  assert.equal(h.runner.busy(DECK), true);
  assert.equal(h.runner.busy('Essence Cards/別篇.md'), false);
  assert.ok(h.refreshed() >= 1, '開始時重畫按鈕');
  h.release();
  await tick();
  assert.equal(h.calls.length, 1);
  assert.equal(h.runner.busy(DECK), false);
});

void test('§4 寫進磁碟逾時：這一篇這次開著 Obsidian 的期間停用，再按只提示', async () => {
  const h = setup([{ kind: 'timeout' }]);
  h.runner.add(one);
  await tick();
  assert.equal(h.runner.busy(DECK), true);
  h.runner.add(one);
  await tick();
  assert.equal(h.calls.length, 1);
  assert.deepEqual(h.stub.notices, [TIPS.locked, TIPS.locked]);
});

void test('§2 寫不進去交給錯誤紀錄；停用之後確認框關掉、不寫', async () => {
  const broken = Error('寫不進去');
  const h = setup([{ kind: 'failed', error: broken }]);
  h.runner.add(one);
  await tick();
  assert.deepEqual(h.errors, [broken]);
  assert.deepEqual(h.stub.notices, [TIPS.failed]);
  const again = setup();
  again.runner.add(all);
  await tick();
  again.runner.close();
  await tick();
  assert.equal(again.modal(), null);
  assert.equal(again.calls.length, 0);
});

void test('§3-4 通知的字：加入了幾項、沒加入的每一項一句原因；寫進磁碟還沒讀回請再按；手機不提示', async () => {
  const [first, , third] = refs(TEXT);
  const cases: [Result, string | null][] = [
    [{ kind: 'written', confirmed: true, moved: [first], left: [{ ref: third, why: '理由底下有內容，請手動搬' }] }, `${TIPS.moved(1)}\n「能說出重量」：理由底下有內容，請手動搬`],
    [{ kind: 'written', confirmed: false, moved: [first], left: [] }, `${TIPS.moved(1)}\n「2-1」可能已經寫好，請再按一次`],
    [{ kind: 'nothing', left: [] }, '這一項剛改過，請再按一次'],
    [{ kind: 'blocked', reason: 'phone' }, null],
    [{ kind: 'blocked', reason: 'backup' }, '備份還沒成功，先不加入；到設定頁看原因'],
  ];
  for (const [result, message] of cases) {
    const h = setup([result]);
    h.runner.add(one);
    await tick();
    assert.deepEqual(h.stub.notices, message === null ? [] : [message], JSON.stringify(result));
  }
});
