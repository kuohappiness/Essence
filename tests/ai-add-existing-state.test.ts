import test from 'node:test';
import type { TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { CLEAR_WHY, EXISTING_WHY, introBoxes, WHY } from '../src/core/ai/index.ts';
import type { Endpoint, ItemRef } from '../src/core/ai/index.ts';
import { createState } from '../src/state/index.ts';
import type { EditorHandle, ExistingRequest, State, StateOptions } from '../src/state/index.ts';
import { createMemoryFiles, type MemoryFiles } from './helpers/memory-files.ts';

// tasks/ai-cards-add.md §4 在 state 的部分：先寫目的地、讀回確認，再從來源拿掉；拿掉前在同一個回呼裡重新確認。真正的 createState，記憶體 Files。

const SRC = 'Essence Cards/學業/國二上/自然/2-2.md';
const DEST = 'Essence Cards/學業/國二上/自然/2-1.md';
const THIRD = 'Essence Cards/學業/國二上/自然/2-3.md';
const head = (unit: string, status = '啟用'): string => `---\n年級學期: 國二上\n科目: 自然\n單元: "${unit}"\n狀態: ${status}\n---\n`;
const Q1 = '    - 密度怎麼算？ :: 質量除以體積';
const Q2 = '    - 雞蛋為什麼浮起來？ :: 鹽水的密度變大';
const LINK = '- [[國二上自然 2-1#^q8z3ka|能用密度判斷物體的浮沉]]';
const DEST_TEXT = head('2-1 密度') + '- 能用密度判斷物體的浮沉 ^q8z3ka\n    - 出處：p.30\n' + Q1 + '\n';
const BODY = '- 能說出溶解 ^p7q2w8\n    - 溶解？ :: 溶質均勻分散\n';
const boxed = (...items: string[][]): string => ['> [!note]- 加進已有的學習目標', ...items.flatMap(item => item.map(line => '> ' + line))].join('\n') + '\n';
const source = (...items: string[][]): string => head('2-2 水溶液', '草稿') + BODY + '\n' + boxed(...items);
const refsOf = (text: string): ItemRef[] => introBoxes(text).flatMap(box => box.items).map(({ kind, id, original }) => ({ kind, id, original }));

interface Harness extends MemoryFiles { state: State; changes: () => number }
async function setup(t: TestContext, texts: Record<string, string>, options: Partial<StateOptions> = {}): Promise<Harness> {
  const memory = createMemoryFiles(texts);
  const state = createState({ files: memory.files, device: 'PC-test', delay: 1, fillIds: true, stuckAfter: 50, random: () => 0, now: () => Date.parse('2026-11-16T10:00:00.000+08:00'), offset: () => 480, onError() {}, ...options });
  t.after(() => state.close());
  await state.ready();
  let count = 0;
  state.onChange(() => { count++; });
  return { ...memory, state, changes: () => count };
}
const request = (text: string, extra: Partial<ExistingRequest> = {}): ExistingRequest =>
  ({ source: SRC, refs: refsOf(text), editorOf: () => null, resolve: link => link, still: () => true, ...extra });

void test('§4 跨篇：目的地加了題與出處、讀回確認，再從來源拿掉（框空了整個拿掉）；整批只通知一次', async t => {
  const item = [LINK, '    - 出處：p.46', Q2];
  const text = source(item);
  const h = await setup(t, { [SRC]: text, [DEST]: DEST_TEXT });
  const result = await h.state.addExisting(request(text));
  assert.deepEqual(result, { kind: 'done', added: [{ ref: refsOf(text)[0], dest: DEST }], left: [], cleared: true, locked: [], blocked: null });
  assert.equal(h.texts.get(DEST), head('2-1 密度') + '- 能用密度判斷物體的浮沉 ^q8z3ka\n    - 出處：p.30、國二上 2-2 p.46\n' + Q1 + '\n' + Q2 + '\n');
  assert.equal(h.texts.get(SRC), head('2-2 水溶液', '草稿') + BODY);
  assert.equal(h.changes(), 1);
});

void test('§4 重按：目的地已經有整項（前一次中斷在拿掉之前）就不寫目的地，只拿掉來源', async t => {
  const item = [LINK, Q2];
  const text = source(item);
  const dest = DEST_TEXT.replace('出處：p.30', '出處：p.30、國二上 2-2') + Q2 + '\n';
  const h = await setup(t, { [SRC]: text, [DEST]: dest });
  const result = await h.state.addExisting(request(text));
  assert.equal(result.kind, 'done');
  assert.ok(result.kind === 'done' && result.added.length === 1 && result.cleared);
  assert.equal(h.texts.get(DEST), dest);
  assert.equal(h.texts.get(SRC), head('2-2 水溶液', '草稿') + BODY);
});

void test('§3-1 目的地找不到、ID 重複、需要新版：那一項不動、寫原因，不寫任何一篇', async t => {
  const item = [LINK, Q2];
  const text = source(item);
  const none = await setup(t, { [SRC]: text });
  assert.deepEqual(await none.state.addExisting(request(text)), { kind: 'done', added: [], left: [{ ref: refsOf(text)[0], why: EXISTING_WHY.noTarget }], cleared: true, locked: [], blocked: null });
  const twice = await setup(t, { [SRC]: text, [DEST]: DEST_TEXT, [THIRD]: head('2-3 熱') + '- 能說出熱 ^q8z3ka\n    - 熱？ :: 能量\n' });
  const out = await twice.state.addExisting(request(text));
  assert.ok(out.kind === 'done' && out.left[0].why === WHY.takenId('q8z3ka'));
  assert.equal(twice.texts.get(DEST), DEST_TEXT);
  const newer = await setup(t, { [SRC]: text, [DEST]: DEST_TEXT.replace('狀態: 啟用', '狀態: 啟用\n需要版本: 99.0.0') });
  const gated = await newer.state.addExisting(request(text));
  assert.ok(gated.kind === 'done' && gated.left[0].why === EXISTING_WHY.newer);
  assert.equal(newer.texts.get(SRC), text);
});

void test('§4 第 4 步：目的地確認之後有未寫回的編輯（編輯器的字和確認的不同）就不拿；目的地已加的題留著（照實回報）', async t => {
  const item = [LINK, Q2];
  const text = source(item);
  const h = await setup(t, { [SRC]: text, [DEST]: DEST_TEXT });
  let calls = 0;
  const editor: EditorHandle = { path: DEST, text: () => 'family typing', apply: () => false, persist: () => Promise.resolve() };
  // 寫目的地時沒開著；拿掉來源時打開了、還有沒存的字。
  const result = await h.state.addExisting(request(text, { editorOf: path => path === DEST && calls++ > 0 ? editor : null }));
  assert.deepEqual(result, { kind: 'done', added: [], left: [{ ref: refsOf(text)[0], why: CLEAR_WHY.destChanged }], cleared: true, locked: [], blocked: null });
  assert.equal(h.texts.get(DEST), DEST_TEXT.replace('出處：p.30', '出處：p.30、國二上 2-2') + Q2 + '\n');
  assert.equal(h.texts.get(SRC), text);
});

void test('§4 只拿掉自己搬的：目的地寫入期間家長改了來源那一項，留著、提示', async t => {
  const item = [LINK, Q2];
  const text = source(item);
  const h = await setup(t, { [SRC]: text, [DEST]: DEST_TEXT });
  const held = h.holdModify(DEST);
  const running = h.state.addExisting(request(text));
  await new Promise(resolve => setTimeout(resolve, 20));
  const edited = text.replace('鹽水的密度變大', '鹽水比較重');
  h.write(SRC, edited);
  held.release();
  const result = await running;
  assert.deepEqual(result, { kind: 'done', added: [], left: [{ ref: refsOf(text)[0], why: CLEAR_WHY.edited }], cleared: true, locked: [], blocked: null });
  assert.equal(h.texts.get(SRC), edited);
});

void test('§4 逾時：目的地寫進磁碟逾時，那一篇記進 locked、項目留著；之後不再寫它', async t => {
  const item = [LINK, Q2];
  const text = source(item);
  const h = await setup(t, { [SRC]: text, [DEST]: DEST_TEXT }, { writeTimeout: 30 });
  const held = h.holdModify(DEST);
  const result = await h.state.addExisting(request(text));
  assert.deepEqual(result, { kind: 'done', added: [], left: [{ ref: refsOf(text)[0], why: EXISTING_WHY.locked(DEST) }], cleared: true, locked: [DEST], blocked: null });
  held.release();
  assert.equal(h.texts.get(SRC), text);
  assert.equal(h.state.addLocked(DEST), true);
  const again = await h.state.addExisting(request(text));
  assert.ok(again.kind === 'done' && again.left[0].why === EXISTING_WHY.locked(DEST) && !again.locked.length);
});

void test('§4 同一篇與跨篇混在一起：同篇的加進自己的目標，跨篇的確認後拿掉，一次寫入來源', async t => {
  const self = ['- [[國二上自然 2-2#^p7q2w8|能說出溶解]]', '    - 糖溶在水裡看得到嗎？ :: 看不到'];
  const other = [LINK, Q2];
  const text = source(self, other);
  const h = await setup(t, { [SRC]: text, [DEST]: DEST_TEXT });
  const result = await h.state.addExisting(request(text));
  assert.equal(result.kind, 'done');
  assert.ok(result.kind === 'done' && result.added.length === 2 && result.cleared && !result.left.length, JSON.stringify(result));
  assert.equal(h.texts.get(SRC), head('2-2 水溶液', '草稿') + BODY + self[1] + '\n');
});

void test('§3-2 複合欄位底下有家長補充：整項留在框裡、兩篇都不寫（L2 R2）', async t => {
  const text = source([LINK, '    - 類型：事實｜備註：甲', '        - 家長補充不可刪', Q2]);
  const h = await setup(t, { [SRC]: text, [DEST]: DEST_TEXT });
  const result = await h.state.addExisting(request(text));
  assert.deepEqual(result, { kind: 'done', added: [], left: [{ ref: refsOf(text)[0], why: EXISTING_WHY.multiline }], cleared: true, locked: [], blocked: null });
  assert.equal(h.texts.get(DEST), DEST_TEXT);
  assert.equal(h.texts.get(SRC), text);
});

void test('§4 手機、全部加入確認之後變了：照門檻擋下或回 changed，不寫', async t => {
  const text = source([LINK, Q2]);
  const phone = await setup(t, { [SRC]: text, [DEST]: DEST_TEXT }, { fillIds: false });
  assert.deepEqual(await phone.state.addExisting(request(text)), { kind: 'blocked', reason: 'phone' });
  const h = await setup(t, { [SRC]: text, [DEST]: DEST_TEXT });
  assert.deepEqual(await h.state.addExisting(request(text, { still: () => false })), { kind: 'changed' });
  assert.equal(h.texts.get(DEST), DEST_TEXT);
});

void test('§4 逾時的目的地當下就停用：同一批後面被門檻擋下也留著；放行後再按不寫它（L2 R3）', async t => {
  const other = ['- [[國二上自然 2-3#^w2e3r4|能說出熱]]', '    - 熱怎麼傳？ :: 傳導'];
  const text = source([LINK, Q2], other);
  const third = head('2-3 熱') + '- 能說出熱 ^w2e3r4\n    - 熱？ :: 能量\n';
  const h = await setup(t, { [SRC]: text, [DEST]: DEST_TEXT, [THIRD]: third }, { writeTimeout: 30, backup: true });
  h.state.backupReady(true);
  const held = h.holdModify(DEST);
  const running = h.state.addExisting(request(text));
  // 第一篇寫進去了、還沒回來：等它的時候備份的門檻關上，第二篇被擋。
  await new Promise(resolve => setTimeout(resolve, 10));
  h.state.backupReady(false);
  assert.deepEqual(await running, { kind: 'blocked', reason: 'backup' });
  assert.equal(h.state.addLocked(DEST), true);
  assert.equal(h.state.addLocked(THIRD), false);
  held.release();
  h.state.backupReady(true);
  const again = await h.state.addExisting(request(text));
  assert.ok(again.kind === 'done', JSON.stringify(again));
  assert.deepEqual(again.left, [{ ref: refsOf(text)[0], why: EXISTING_WHY.locked(DEST) }]);
  assert.deepEqual(again.added.map(each => each.dest), [THIRD]);
});

void test('§4 排著的寫入在回呼裡再查停用：前一批逾時之後才輪到，不寫那一篇（L2 R3）', async t => {
  const other = '- 能說出浮力 ^p7q2w9\n    - 浮力？ :: 向上的力\n\n' + boxed([LINK, '    - 鐵會沉嗎？ :: 會']);
  const SECOND = 'Essence Cards/學業/國二上/自然/2-4.md';
  const second = head('2-4 浮力', '草稿') + other;
  const text = source([LINK, Q2]);
  const h = await setup(t, { [SRC]: text, [DEST]: DEST_TEXT, [SECOND]: second }, { writeTimeout: 30 });
  const held = h.holdModify(DEST);
  // 同一刻按下：兩批都在第一篇逾時之前分好組，第二批的寫入排在第一批後面。
  const first = h.state.addExisting(request(text));
  const queued = h.state.addExisting({ ...request(second), source: SECOND });
  const done = await first;
  assert.ok(done.kind === 'done' && done.locked.includes(DEST), JSON.stringify(done));
  const afterFirst = h.texts.get(DEST);
  held.release();
  const out = await queued;
  assert.ok(out.kind === 'done', JSON.stringify(out));
  assert.deepEqual(out.left.map(each => each.why), [EXISTING_WHY.locked(DEST)]);
  assert.equal(h.texts.get(DEST), afterFirst);
  assert.equal(h.texts.get(SECOND), second);
});

void test('§2 候選加入逾時：那一篇當下停用，再按不寫（L2 R3）', async t => {
  const text = head('2-2 水溶液', '草稿') + BODY + '\n> [!note]- 候選卡片\n> - 能乙 ^bbbbb2\n>     - 理由：x\n>     - 問 :: 答\n';
  const h = await setup(t, { [SRC]: text }, { writeTimeout: 30 });
  const held = h.holdModify(SRC);
  const refs = refsOf(text);
  assert.deepEqual(await h.state.addCandidates(SRC, refs, null, () => true), { kind: 'timeout' });
  assert.equal(h.state.addLocked(SRC), true);
  held.release();
  const written = h.texts.get(SRC);
  assert.deepEqual(await h.state.addCandidates(SRC, refs, null, () => true), { kind: 'timeout' });
  assert.equal(h.texts.get(SRC), written);
});

void test('§4 同一路徑換成別的檔：目的地寫好之後，來源被刪掉、原路徑放了另一篇（同一個框），不拿（L2 R1）', async t => {
  const text = source([LINK, Q2]);
  const h = await setup(t, { [SRC]: text, [DEST]: DEST_TEXT });
  const held = h.holdModify(DEST);
  const running = h.state.addExisting(request(text));
  await new Promise(resolve => setTimeout(resolve, 20));
  h.remove(SRC);
  const other = text.replace('溶質均勻分散', '另一個檔案的內容');
  h.write(SRC, other);
  held.release();
  const result = await running;
  assert.ok(result.kind === 'done', JSON.stringify(result));
  assert.deepEqual(result.left.map(each => each.why), [CLEAR_WHY.sourceChanged]);
  assert.equal(h.texts.get(SRC), other);
});

/** 等到條件成立（最多約 1 秒）：寫入在背景跑，測試要在中間插一步。 */
async function until(ok: () => boolean): Promise<void> {
  for (let i = 0; i < 200 && !ok(); i++) await new Promise(resolve => setTimeout(resolve, 5));
  assert.ok(ok(), '等不到');
}

void test('§4 第 4 步：來源寫好之後、讀回之前又變回有那一項：目的地已確認、來源清除未確認（L2 R4）', async t => {
  const text = source([LINK, Q2]);
  const h = await setup(t, { [SRC]: text, [DEST]: DEST_TEXT });
  const held = h.holdModify(SRC);
  const running = h.state.addExisting(request(text));
  await until(() => h.texts.get(SRC) !== text);
  h.write(SRC, text);
  held.release();
  const result = await running;
  assert.ok(result.kind === 'done', JSON.stringify(result));
  assert.deepEqual(result.added, [{ ref: refsOf(text)[0], dest: DEST }]);
  assert.equal(result.cleared, false);
  assert.equal(h.texts.get(SRC), text);
});

void test('§4 第 4 步：來源寫不進去、或寫的時候被門檻擋下：已確認的目的地照實回報，來源清除未確認；同一篇的留著寫原因（L2 R4）', async t => {
  const self = ['- [[國二上自然 2-2#^p7q2w8|能說出溶解]]', '    - 糖溶在水裡看得到嗎？ :: 看不到'];
  const text = source(self, [LINK, Q2]);
  const [ownRef, crossRef] = refsOf(text);
  const h = await setup(t, { [SRC]: text, [DEST]: DEST_TEXT });
  const held = h.holdModify(DEST);
  const running = h.state.addExisting(request(text));
  await until(() => h.texts.get(DEST) !== DEST_TEXT);
  h.control.failModify = true;
  held.release();
  const result = await running;
  assert.deepEqual(result, { kind: 'done', added: [{ ref: crossRef, dest: DEST }], left: [{ ref: ownRef, why: EXISTING_WHY.failed(SRC) }], cleared: false, locked: [], blocked: null });
  assert.equal(h.texts.get(SRC), text);
});

void test('§3-1 目的地是這一篇的原文項目也要過確認：確認之後那個目標變了回 changed，不寫（L2 R5）', async t => {
  const self = ['- p7q2w8 能說出溶解', '    - 糖溶在水裡看得到嗎？ :: 看不到'];
  const text = source(self);
  const h = await setup(t, { [SRC]: text, [DEST]: DEST_TEXT });
  const asked: string[] = [];
  const changed = await h.state.addExisting(request(text, { destStill: path => { asked.push(path); return false; } }));
  assert.deepEqual(changed, { kind: 'changed' });
  assert.deepEqual(asked, [SRC]);
  assert.equal(h.texts.get(SRC), text);
  const ok = await h.state.addExisting(request(text, { destStill: path => path === SRC }));
  assert.ok(ok.kind === 'done' && ok.added.length === 1 && ok.cleared, JSON.stringify(ok));
  assert.equal(h.texts.get(SRC), head('2-2 水溶液', '草稿') + BODY + self[1] + '\n');
});

void test('第 2 批 L2 R16 同一篇補題排在逾時的加深後面：來源鎖著時不管確認還成不成立，都不存回舊分頁、加深的字留著', async t => {
  const self = ['- p7q2w8 能說出溶解', '    - 糖溶在水裡看得到嗎？ :: 看不到'];
  const text = source(self);
  for (const still of [true, false]) {
    const h = await setup(t, { [SRC]: text, [DEST]: DEST_TEXT }, { writeTimeout: 30 });
    let saved = 0;
    const editor: EditorHandle = {
      path: SRC, text: () => text, apply: () => true,
      persist() { saved++; h.write(SRC, text); return Promise.resolve(); },
    };
    const held = h.holdModify(SRC);
    // 補題先開始（第 1 步讀完變動），加深接著排進來；補題拿掉來源那一筆排在加深後面。
    const added = h.state.addExisting(request(text, { editorOf: path => path === SRC ? editor : null, destStill: () => still }));
    const deepen = h.state.aiAppend(SRC, null, now => ({ text: now + '\nA\n' }));
    assert.deepEqual(await deepen, { kind: 'timeout' });
    held.release();
    const result = await added;
    assert.equal(saved, 0, `確認${still ? '成立' : '不成立'}`);
    assert.ok(h.texts.get(SRC)!.endsWith('\nA\n'), JSON.stringify(result));
  }
});

/** 排了幾次今天的份：每一次排都由 input() 取一次時間（呼叫堆疊裡有 input）。 */
function planCounter(): { now: () => number; count: () => number; reset: () => void } {
  let plans = 0;
  return {
    now: () => { if (/\bat input \(/.test(new Error().stack ?? '')) plans++; return Date.parse('2026-11-16T10:00:00.000+08:00'); },
    count: () => plans,
    reset: () => { plans = 0; },
  };
}

void test('§4 重排：一批跨篇加入（寫兩篇）只排一次今天的份、通知一次（L2 R8）', async t => {
  const text = source([LINK, Q2]);
  const plans = planCounter();
  const h = await setup(t, { [SRC]: text, [DEST]: DEST_TEXT }, { now: plans.now });
  plans.reset();
  const result = await h.state.addExisting(request(text));
  assert.ok(result.kind === 'done' && result.cleared, JSON.stringify(result));
  // 兩篇寫入的 Files.watch 回聲在批次之後才讀到：內容相同，不再排、不再通知。
  await new Promise(resolve => setTimeout(resolve, 50));
  assert.equal(plans.count(), 1);
  assert.equal(h.changes(), 1);
});

void test('§4 重排：批次中有人要今天的份，先照已採用的排；之後又採用了來源，批次結束再排一次；通知仍只一次（L2 R8）', async t => {
  const text = source([LINK, Q2]);
  const plans = planCounter();
  const h = await setup(t, { [SRC]: text, [DEST]: DEST_TEXT }, { now: plans.now });
  const held = h.holdModify(SRC);
  plans.reset();
  const running = h.state.addExisting(request(text));
  await until(() => h.texts.get(SRC) !== text);
  h.state.today();
  assert.equal(plans.count(), 1);
  held.release();
  await running;
  await new Promise(resolve => setTimeout(resolve, 50));
  assert.equal(plans.count(), 2);
  assert.equal(h.changes(), 1);
});
/**
 * 第 3 步確認之後、第 4 步拿掉之前改了別的東西（L2 第二輪〈合併前補驗〉，D-195 第 1 類：決定能不能從來源拿掉）。
 * 來源前面卡著一個別的寫入，清來源的回呼要等它放行；放行前做 change，等 state 讀完再放行。
 */
async function changeBeforeClear(t: TestContext, change: (h: Harness) => void, options: { text?: string; extra?: Partial<ExistingRequest>; files?: Record<string, string> } = {}): Promise<{ h: Harness; text: string; result: Awaited<ReturnType<State['addExisting']>> }> {
  const text = options.text ?? source([LINK, Q2]);
  const h = await setup(t, { [SRC]: text, [DEST]: DEST_TEXT, ...options.files });
  const held = h.holdModify(SRC);
  void h.files.modify(SRC, now => now);
  const running = h.state.addExisting(request(text, options.extra));
  await until(() => h.texts.get(DEST) !== DEST_TEXT);
  await new Promise(resolve => setTimeout(resolve, 30));
  change(h);
  await new Promise(resolve => setTimeout(resolve, 30));
  held.release();
  return { h, text, result: await running };
}
const MOVED = 'Essence Cards/學業/國二上/自然/2-1 改名.md';

void test('§4 第 4 步前目的地改名、刪掉、同路徑換成別的檔、ID 變重複、換科目：來源一字不動（L2 第二輪）', async t => {
  const cases: [string, (h: Harness) => void][] = [
    ['改名', h => { const now = h.texts.get(DEST)!; h.remove(DEST); h.write(MOVED, now); }],
    ['刪掉', h => { h.remove(DEST); }],
    ['同路徑換檔', h => { h.remove(DEST); h.write(DEST, DEST_TEXT); }],
    ['ID 重複', h => { h.write(THIRD, head('2-3 熱') + '- 能用密度判斷物體的浮沉 ^q8z3ka\n    - 另一題？ :: 另一個答案\n'); }],
    ['換科目', h => { h.write(DEST, h.texts.get(DEST)!.replace('科目: 自然', '科目: 社會')); }],
  ];
  for (const [name, change] of cases) {
    await t.test(name, async t => {
      const { h, text, result } = await changeBeforeClear(t, change);
      assert.equal(h.texts.get(SRC), text);
      assert.deepEqual(result, { kind: 'done', added: [], left: [{ ref: refsOf(text)[0], why: CLEAR_WHY.destChanged }], cleared: true, locked: [], blocked: null });
    });
  }
  // 對照：不改就照常拿掉（上面不是因為測試的安排而沒拿）。
  const { h, text, result } = await changeBeforeClear(t, () => {});
  assert.deepEqual(result, { kind: 'done', added: [{ ref: refsOf(text)[0], dest: DEST }], left: [], cleared: true, locked: [], blocked: null });
  assert.ok(!h.texts.get(SRC)!.includes('加進已有的學習目標'));
});

void test('§4 第 4 步前教材的端點改指另一本（目的地的字沒變）：來源一字不動（L2 第二輪）', async t => {
  const text = source([LINK, '    - 出處：p.46', Q2]).replace('狀態: 草稿', '狀態: 草稿\n材料: "[[課本]]"');
  // 目的地那一端解析到的教材：第 3 步確認時和來源同一本，第 4 步前改指另一本。
  let destBook = '課本.md';
  const endpoint = (): Endpoint => (_link, side) => side === 'source' ? '課本.md' : destBook;
  const { h, result } = await changeBeforeClear(t, () => { destBook = '別本.md'; }, { text, extra: { endpoint } });
  assert.equal(h.texts.get(SRC), text);
  assert.deepEqual(result, { kind: 'done', added: [], left: [{ ref: refsOf(text)[0], why: CLEAR_WHY.destChanged }], cleared: true, locked: [], blocked: null });
  // 對照：端點不變就照常拿掉。
  destBook = '課本.md';
  const control = await changeBeforeClear(t, () => {}, { text, extra: { endpoint } });
  assert.ok(control.result.kind === 'done' && control.result.cleared && control.result.added.length === 1, JSON.stringify(control.result));
});

/** 拿掉前後看的那一點：第一次留、重按收尾；回傳重按前後的目的地。 */
async function pressAgain(t: TestContext, change: (h: Harness) => void, text?: string): Promise<{ before: string; after: string }> {
  const first = await changeBeforeClear(t, change, { text });
  assert.deepEqual(first.result, { kind: 'done', added: [], left: [{ ref: refsOf(first.text)[0], why: CLEAR_WHY.destChanged }], cleared: true, locked: [], blocked: null });
  const before = first.h.texts.get(DEST)!;
  const again = await first.h.state.addExisting(request(first.text));
  assert.deepEqual(again, { kind: 'done', added: [{ ref: refsOf(first.text)[0], dest: DEST }], left: [], cleared: true, locked: [], blocked: null });
  assert.ok(!first.h.texts.get(SRC)!.includes('加進已有的學習目標'));
  return { before, after: first.h.texts.get(DEST)! };
}

void test('§4 第 4 步前目的地改成等價的寫法（縮排換 Tab、出處拆成兩行）：第一次照字比留著，重按只拿掉、目的地不再加（L2 第二輪）', async t => {
  const tab = await pressAgain(t, h => { h.write(DEST, h.texts.get(DEST)!.replaceAll('\n    - ', '\n\t- ')); });
  assert.equal(tab.after, tab.before);
  const split = await pressAgain(t, h => { h.write(DEST, h.texts.get(DEST)!.replace('    - 出處：p.30、國二上 2-2\n', '    - 出處：p.30\n    - 出處：國二上 2-2\n')); });
  assert.equal(split.after, split.before);
});

void test('§4 第 4 步前出處的前一段換了單元、後一段跟著換：重按照語意補回這一課的兩頁（L2 第二輪）', async t => {
  const text = source([LINK, '    - 出處：p.46、p.47', Q2]);
  const { after } = await pressAgain(t, h => { h.write(DEST, h.texts.get(DEST)!.replace('國二上 2-2 p.46', '國二上 2-3 p.46')); }, text);
  assert.equal(after, head('2-1 密度') + '- 能用密度判斷物體的浮沉 ^q8z3ka\n    - 出處：\n        - p.30\n        - 國二上 2-3 p.46\n        - p.47\n        - 國二上 2-2 p.46、p.47\n' + Q1 + '\n' + Q2 + '\n');
});

void test('§3-3 L01 和 L1 是不同的單元（syntax §2-5）：目的地已有 L1 的頁，L01 的照樣加（L2 第二輪）', async t => {
  const text = head('L01 水溶液', '草稿') + BODY + '\n' + boxed([LINK, '    - 出處：p.46', Q2]);
  const h = await setup(t, { [SRC]: text, [DEST]: DEST_TEXT.replace('出處：p.30', '出處：p.30、國二上 L1 p.46') });
  const result = await h.state.addExisting(request(text));
  assert.deepEqual(result, { kind: 'done', added: [{ ref: refsOf(text)[0], dest: DEST }], left: [], cleared: true, locked: [], blocked: null });
  assert.equal(h.texts.get(DEST), head('2-1 密度') + '- 能用密度判斷物體的浮沉 ^q8z3ka\n    - 出處：\n        - p.30\n        - 國二上 L1 p.46\n        - 國二上 L01 p.46\n' + Q1 + '\n' + Q2 + '\n');
});

void test('§4 部分成功：第二篇目的地逾時，第一篇已確認的照實發布（state 讀得到加的題）；只通知一次，來源只拿掉第一項（L2 第二輪）', async t => {
  const HEAT = '- [[國二上自然 2-3#^h3t9qa|能說出熱]]';
  const third = head('2-3 熱') + '- 能說出熱 ^h3t9qa\n    - 熱？ :: 一種能量\n';
  const text = source([LINK, Q2], [HEAT, '    - 熱怎麼傳？ :: 傳導、對流、輻射']);
  const [first, second] = refsOf(text);
  const h = await setup(t, { [SRC]: text, [DEST]: DEST_TEXT, [THIRD]: third }, { writeTimeout: 30 });
  const held = h.holdModify(THIRD);
  const before = h.changes();
  const result = await h.state.addExisting(request(text));
  held.release();
  assert.deepEqual(result, { kind: 'done', added: [{ ref: first, dest: DEST }], left: [{ ref: second, why: EXISTING_WHY.locked(THIRD) }], cleared: true, locked: [THIRD], blocked: null });
  assert.equal(h.changes() - before, 1);
  const dest = h.state.decks().find(each => each.path === DEST)!;
  assert.deepEqual(dest.deck.targets[0].prompts.map(p => p.kind === 'qa' ? p.question : ''), ['密度怎麼算？', '雞蛋為什麼浮起來？']);
  assert.ok(!h.texts.get(SRC)!.includes('雞蛋為什麼浮起來'));
  assert.ok(h.texts.get(SRC)!.includes('熱怎麼傳'));
});

void test('§4 來源寫入途中關閉：之後一次通知都沒有（L2 第二輪）', async t => {
  const text = source([LINK, Q2]);
  const h = await setup(t, { [SRC]: text, [DEST]: DEST_TEXT });
  const held = h.holdModify(SRC);
  const running = h.state.addExisting(request(text));
  await until(() => h.texts.get(SRC) !== text);
  const before = h.changes();
  await Promise.race([h.state.close(), new Promise(resolve => setTimeout(resolve, 50))]);
  held.release();
  await running;
  await new Promise(resolve => setTimeout(resolve, 50));
  assert.equal(h.changes(), before);
});
