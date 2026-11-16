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
interface Call { refs: readonly ItemRef[]; still: (text: string) => boolean; editor: unknown }
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
  // 逾時的那一篇由 state 記（State.addLocked）：替身照同一個約定，回 timeout 時記下。
  const locks = new Set<string>();
  const state = {
    addLocked: (path: string) => locks.has(path),
    addCandidates(path: string, chosen: readonly ItemRef[], editor: unknown, still: (text: string) => boolean) {
      calls.push({ refs: chosen, still, editor });
      const result = results.shift() ?? { kind: 'written', confirmed: true, moved: chosen, left: [] };
      if (result.kind === 'timeout') locks.add(path);
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

// ── 加進已有的學習目標（§3-1、§3-4、§4）──

const SOURCE = 'Essence Cards/學業/國二上/自然/2-2.md';
const OLD = 'Essence Cards/學業/國二上/自然/2-1.md';
const OLD_TEXT = '- 能用密度判斷物體的浮沉 ^q8z3ka\n    - 密度怎麼算？ :: 質量除以體積\n';
const BOX = '> [!note] 加進已有的學習目標\n> - [[國二上自然 2-1#^q8z3ka|能用密度判斷物體的浮沉]]\n>     - 鐵會沉嗎？ :: 會\n> - [[國二上自然 2-3#^w2e3r4|能說出熱]]\n>     - 熱？ :: 能量\n> - q8z3ka 能用密度判斷物體的浮沉\n>     - 木頭會浮嗎？ :: 會\n';
interface ExistingCall { refs: readonly ItemRef[]; still: (text: string) => boolean; destStill?: (path: string, text: string) => boolean; editorOf: (path: string) => unknown }
/** foundAfter：state 被叫了這麼多次之後才找得到 q8z3ka（讀完變動才出現的目的地）。 */
function existingSetup(results: Result[] = [], foundAfter = 0) {
  const stub = createObsidianStub();
  stub.texts.set(SOURCE, BOX);
  const module = stub.load<Module>(code);
  const calls: ExistingCall[] = [];
  const decks = [{ path: OLD, deck: { props: { materials: [] }, targets: [{ id: 'q8z3ka', name: '能用密度判斷物體的浮沉', prompts: [{ kind: 'qa', question: '密度怎麼算？', answer: '質量除以體積' }] }] } }];
  const locks = new Set<string>();
  const state = {
    addLocked: (path: string) => locks.has(path),
    decks: () => decks,
    unitMaterials: () => [],
    aiTarget: (id: string) => id === 'q8z3ka' && calls.length >= foundAfter ? { kind: 'one', path: OLD, name: '能用密度判斷物體的浮沉' } : { kind: 'none' },
    addExisting(request: ExistingCall) {
      calls.push(request);
      const result = results.shift() ?? { kind: 'done', added: request.refs.map(ref => ({ ref, dest: OLD })), left: [], cleared: true, locked: [], blocked: null };
      if (result.kind === 'done') for (const each of result.locked as string[]) locks.add(each);
      return Promise.resolve(result);
    },
  };
  const runner = module.createIntroRunner({ app: stub.app, state: () => state, notify: (message: string) => { stub.notices.push(message); }, onError() {}, refresh() {} });
  const modal = (): FakeEl | null => { const open = stub.modals.filter(each => each.isOpen).at(-1); return open ? open.contentEl : null; };
  const answer = (yes: boolean): void => { modal()!.querySelectorAll('button')[yes ? 1 : 0].click(); };
  return { stub, runner, calls, modal, answer };
}
const boxRefs = refs(BOX);

void test('§3-4 加進已有的全部加入：先問項數與卡組篇數，沒轉成連結的另說；交出轉成連結的那幾項；通知加入了幾項、到哪幾篇', async () => {
  const h = existingSetup();
  h.runner.add({ path: SOURCE, kind: 'existing', refs: boxRefs, all: true });
  await tick();
  assert.equal(h.modal()!.querySelectorAll('p')[0].text, '把 2 項加進已有的學習目標（1 篇卡組）？1 項沒有核對過，請逐項加入。');
  h.answer(true);
  await tick();
  assert.deepEqual(h.calls[0].refs, boxRefs.slice(0, 2));
  assert.equal(h.calls[0].still(BOX), true);
  assert.equal(h.calls[0].still(BOX.replace('鐵會沉嗎', '鐵塊會沉嗎')), false);
  assert.deepEqual(h.stub.notices, ['已把 2 項加進已有的學習目標（「2-1」）']);
});

void test('§3-1 轉成連結的單項不問；沒轉成連結的先確認卡組、名稱與第一題，寫入時目的地變了就重新確認', async () => {
  const linked = existingSetup();
  linked.runner.add({ path: SOURCE, kind: 'existing', refs: [boxRefs[0]], all: false });
  await tick();
  assert.equal(linked.modal(), null);
  assert.equal(linked.calls.length, 1);
  const h = existingSetup([{ kind: 'changed' }]);
  h.runner.add({ path: SOURCE, kind: 'existing', refs: [boxRefs[2]], all: false });
  await tick();
  assert.equal(h.modal()!.querySelectorAll('p')[0].text, '把這一項加進「2-1」的「能用密度判斷物體的浮沉」？那個學習目標的第一題：密度怎麼算？ :: 質量除以體積');
  h.answer(true);
  await tick();
  const destStill = h.calls[0].destStill!;
  assert.equal(destStill(OLD, OLD_TEXT), true);
  assert.equal(destStill(OLD, OLD_TEXT.replace('質量除以體積', '體積除以質量')), false);
  assert.equal(destStill(OLD, OLD_TEXT.replace('浮沉', '浮與沉')), false);
  // state 回 changed：重新問一次。
  assert.ok(h.modal(), '重新確認');
  h.answer(true);
  await tick();
  assert.equal(h.calls.length, 2);
});

void test('§4 通知的字：來源清除沒確認、沒加入的原因；逾時的目的地這次開著 Obsidian 的期間停用', async () => {
  const [first, second] = boxRefs;
  const h = existingSetup([{ kind: 'done', added: [{ ref: first, dest: OLD }], left: [{ ref: second, why: '原本的卡組裡找不到這個學習目標' }], cleared: false, locked: [OLD], blocked: null }]);
  h.runner.add({ path: SOURCE, kind: 'existing', refs: [first], all: false });
  await tick();
  assert.deepEqual(h.stub.notices, ['已把 1 項加進已有的學習目標（「2-1」）\n目的地已確認，來源清除未確認：框裡的項目如果還在，請再按一次\n「能說出熱」：原本的卡組裡找不到這個學習目標']);
  assert.equal(h.runner.busy(OLD), true);
});

// Windows 實機（2026-11-16，開發命令 intro-add）：閱讀模式的分頁改隱藏的編輯器，view.save() 沒把它寫進磁碟，
// 之後每次都是「還沒存進去的修改」。按鈕只在閱讀模式，所以只有開在編輯模式的分頁才走編輯器，其餘走檔案。
const openTab = (stub: ReturnType<typeof createObsidianStub>, path: string, text: string, mode: 'source' | 'preview'): void => {
  const leaf = stub.leaf(path);
  Object.assign(leaf.view as object, { value: text, mode });
  stub.leaves.push(leaf);
};

void test('§2 只開在閱讀模式的那一篇走檔案（不交編輯器）；另有開在編輯模式的分頁才走編輯器', async () => {
  const h = setup();
  openTab(h.stub, DECK, TEXT, 'preview');
  h.runner.add(one);
  await tick();
  assert.equal(h.calls[0].editor, null);
  openTab(h.stub, DECK, TEXT, 'source');
  h.runner.add(one);
  await tick();
  assert.notEqual(h.calls[1].editor, null);
});

void test('§4 加進已有：來源與目的地只開在閱讀模式時都走檔案；目的地開在編輯模式才走編輯器', async () => {
  const h = existingSetup();
  openTab(h.stub, SOURCE, BOX, 'preview');
  openTab(h.stub, OLD, OLD_TEXT, 'preview');
  h.runner.add({ path: SOURCE, kind: 'existing', refs: [boxRefs[0]], all: false });
  await tick();
  assert.equal(h.calls[0].editorOf(SOURCE), null);
  assert.equal(h.calls[0].editorOf(OLD), null);
  openTab(h.stub, OLD, OLD_TEXT, 'source');
  assert.notEqual(h.calls[0].editorOf(OLD), null);
});

void test('§2、§4 閱讀模式的隱藏編輯器不跟著重讀（實機）：它的字和磁碟不同也不算「還沒存進去」，確認框的項數照磁碟', async () => {
  const h = setup();
  // 磁碟上已經搬走第一項，閱讀模式的隱藏編輯器還是舊的。
  const now = TEXT.replace('> - 能說出浮力 ^p7q2w8\n>     - 理由：x\n>     - 浮力？ :: 向上的力\n', '');
  h.stub.texts.set(DECK, now);
  openTab(h.stub, DECK, TEXT, 'preview');
  h.runner.add({ path: DECK, kind: 'candidate', refs: refs(now).filter(ref => ref.id === 'r5t6y7'), all: true });
  await tick();
  assert.equal(h.modal()!.querySelectorAll('p')[0].text, TIPS.confirm.replace('2 個', '1 個'));
  h.answer(true);
  await tick();
  assert.deepEqual(h.calls.map(each => each.refs.map(ref => ref.id)), [['r5t6y7']]);
  assert.deepEqual(h.stub.notices, [TIPS.moved(1)]);
});

void test('§3-1 確認時找不到目的地：交給 state 時不算確認過；state 讀完變動才找到的回 changed，下一輪照找到的問（L2 R5）', async () => {
  const raw = boxRefs[2];
  const h = existingSetup([{ kind: 'changed' }], 1);
  h.runner.add({ path: SOURCE, kind: 'existing', refs: [raw], all: false });
  await tick();
  assert.equal(h.calls.length, 1);
  assert.equal(h.calls[0].destStill?.(OLD, OLD_TEXT), false);
  assert.equal(h.modal()!.querySelectorAll('p')[0].text, '把這一項加進「2-1」的「能用密度判斷物體的浮沉」？那個學習目標的第一題：密度怎麼算？ :: 質量除以體積');
  h.answer(true);
  await tick();
  assert.equal(h.calls.length, 2);
  assert.equal(h.calls[1].destStill?.(OLD, OLD_TEXT), true);
});
