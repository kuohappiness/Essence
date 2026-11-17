import test from 'node:test';
import type { TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { introBoxes, sha256Hex } from '../src/core/ai/index.ts';
import type { DeepenJob, EmbeddedRules } from '../src/core/ai/index.ts';
import { parseDeck } from '../src/core/deck/index.ts';
import { encodeEntry } from '../src/core/study/index.ts';
import { createState } from '../src/state/index.ts';
import { createDeepen } from '../src/obsidian/deepen.ts';
import { createMemoryFiles } from './helpers/memory-files.ts';

// tasks/ai-cards-deepen.md §1～§3 接起來：加深流程（src/obsidian/deepen.ts）＋真正的 createState＋記憶體 Files。畫面另外在 Windows 實機看。

const rules: EmbeddedRules = { science: [{ name: '通用', version: 'v1', text: '# 通用', sha256: sha256Hex('# 通用') }] };
const DECK = 'Essence Cards/學業/國二上/自然/國二上自然 2-1 溫度.md';
const DECK_TEXT = '---\n年級學期: 國二上\n科目: 自然\n單元: 2-1 溫度\n狀態: 啟用\n---\n\n## 溫度計\n\n- 能說出溫度計的原理 ^abc234\n    - 出處：p.40\n    - 類型：定義\n    - 溫度計靠什麼原理？ :: 熱脹冷縮\n';
const SIBLING = 'Essence Cards/學業/國二上/自然/國二上自然 2-1 熱量.md';
const SIBLING_TEXT = '---\n年級學期: 國二上\n科目: 自然\n單元: 2-1 溫度\n狀態: 啟用\n---\n\n- 能說出熱量的單位 ^def234\n    - 出處：p.44\n    - 類型：定義\n    - 熱量的單位？ :: 卡\n';
const OLD_SNAPSHOT = 'Essence Cards/紀錄/AI 輸出/2026-11-01 國二上自然 2-1 溫度.md';
const OLD_SNAPSHOT_TEXT = '---\n時間: 2026-11-01T10:00:00+08:00\n識別碼: old111\n工作: 製卡\n對象:\n  - "[[國二上自然 2-1 溫度]]"\n記穩目標: 無（初次製卡）\n---\n\n<<<全貌>>>\n溫度的全貌\n\n<<<架構>>>\n1. 溫度計\n\n<<<卡組>>>\n## 溫度計\n\n- 能說出溫度計的原理 ^abc234\n- 被刪掉的目標 ^ghj234\n\n<<<完>>>\n';
const REPLY = [
  '<<<全貌>>>', '溫度的全貌', '', '<<<架構>>>', '1. 溫度計', '2. 溫標', '', '<<<卡組>>>', '## 溫度計', '',
  '- 能比較酒精與水銀溫度計的差異', '    - 出處：p.41', '    - 類型：比較', '    - 為什麼**水銀**溫度計可以量較高溫？ :: 水銀**沸點高**', '',
  '> [!note] 加進已有的學習目標', '> - abc234 能說出溫度計的原理', '>     - 出處：p.40', '>     - 溫度上升時液柱怎樣？ :: 上升', '<<<完>>>',
].join('\n');
const NOW = Date.parse('2026-11-17T10:00:00+08:00');

function machine() {
  const saved: { jobs: unknown; retired: string[]; skips: unknown; off: boolean } = { jobs: null, retired: [], skips: null, off: false };
  return {
    saved,
    store: {
      jobs: () => saved.jobs === null ? null : JSON.parse(JSON.stringify(saved.jobs)) as unknown,
      saveJobs(jobs: DeepenJob[]) { saved.jobs = JSON.parse(JSON.stringify(jobs)) as unknown; },
      retire(ids: readonly string[]) { saved.retired = [...new Set([...saved.retired, ...ids])]; },
      skips: () => saved.skips,
      saveSkips(value: Record<string, { ids: string[]; at: string }>) { saved.skips = JSON.parse(JSON.stringify(value)) as unknown; },
      remindOff: () => saved.off,
    },
  };
}
async function load(t: TestContext, memory: ReturnType<typeof createMemoryFiles>, box: ReturnType<typeof machine>) {
  const clipboard: string[] = [];
  const errors: unknown[] = [];
  /** 只有加深的 read 讀不到的篇（state 照常讀得到）。 */
  const broken = new Set<string>();
  // eslint-disable-next-line prefer-const -- state 與流程互相參照
  let state: ReturnType<typeof createState>;
  const md = () => [...memory.texts.keys()].filter(path => path.endsWith('.md'));
  const deepen = createDeepen({
    rules, state: () => state, store: box.store, random: Math.random,
    names: () => new Set(md().map(path => path.slice(path.lastIndexOf('/') + 1, -3).toLowerCase())),
    named: name => md().filter(path => path.slice(path.lastIndexOf('/') + 1, -3).toLowerCase() === name),
    snapshots: () => Promise.resolve(md().filter(path => path.startsWith('Essence Cards/紀錄/AI 輸出/') && !path.includes('/原文/')).map(path => ({ path, text: memory.texts.get(path)! }))),
    read: path => broken.has(path) ? Promise.reject(Error('讀不到')) : Promise.resolve(memory.texts.get(path) ?? null),
    editor: () => null,
    unsaved: () => Promise.resolve(false),
    clipboard: text => { clipboard.push(text); return Promise.resolve(); },
    now: () => ({ ms: NOW, offset: 480 }),
    onError: error => { errors.push(error); },
  });
  state = createState({ files: memory.files, device: 'PC-test', delay: 1, fillIds: true, random: Math.random, reserved: () => deepen.reserved(), now: () => NOW, offset: () => 480, onError() {} });
  t.after(() => state.close());
  await state.ready();
  return { deepen, state, clipboard, errors, broken };
}

void test('§1～§3 加深：提示帶這一篇的目標、同單元其他篇、地圖與以前出過的；貼回寫進檔尾的加深框，快照與原文都在，工作清掉', async t => {
  const memory = createMemoryFiles({ [DECK]: DECK_TEXT, [SIBLING]: SIBLING_TEXT, [OLD_SNAPSHOT]: OLD_SNAPSHOT_TEXT });
  const box = machine();
  const { deepen, clipboard, errors } = await load(t, memory, box);
  const ready = deepen.ready(DECK);
  assert.ok(ready.ok);
  assert.deepEqual(ready.counts, { stable: 0, weak: 0, unstable: 1 });
  const copied = await deepen.copy(DECK, '這次不要課外', '');
  assert.ok('job' in copied, JSON.stringify(copied));
  const prompt = clipboard[0];
  assert.match(prompt, /- abc234 能說出溫度計的原理｜還沒記穩｜第一題：溫度計靠什麼原理？/);
  assert.match(prompt, /- def234 能說出熱量的單位/);
  assert.match(prompt, /<<<全貌>>>\n溫度的全貌/);
  assert.match(prompt, /- ghj234 被刪掉的目標/);
  assert.match(prompt, /- 家長調整：這次不要課外/);
  assert.equal(deepen.jobOf(DECK)?.id, copied.job.id);

  const inspection = deepen.inspect(copied.job, REPLY);
  assert.ok(!('error' in inspection));
  assert.deepEqual(inspection.errors, []);
  const done = await deepen.save(copied.job, REPLY, 'Claude');
  assert.deepEqual(done, { kind: 'done', wrote: true, path: DECK });
  assert.deepEqual(errors, []);
  const text = memory.texts.get(DECK)!;
  assert.ok(text.startsWith(DECK_TEXT));
  assert.deepEqual(introBoxes(text).map(each => each.title), ['加深的學習目標', '加進已有的學習目標（加深）']);
  assert.match(text, /\[\[國二上自然 2-1 溫度#\^abc234\|能說出溫度計的原理\]\]/);
  assert.deepEqual(parseDeck(text).targets.map(each => each.id), ['abc234']);
  const snapshot = [...memory.texts.keys()].find(path => path.endsWith('加深.md'))!;
  assert.equal(snapshot, 'Essence Cards/紀錄/AI 輸出/2026-11-17 國二上自然 2-1 溫度 加深.md');
  assert.match(memory.texts.get(snapshot)!, /^記穩目標: 無$/m);
  assert.match(memory.texts.get(snapshot)!, /"\[\[Essence Cards\/學業\/國二上\/自然\/國二上自然 2-1 溫度\.md\|國二上自然 2-1 溫度\]\]"/);
  assert.ok(memory.texts.has(`Essence Cards/紀錄/AI 輸出/原文/${sha256Hex(REPLY).slice(0, 12)}.md`));
  assert.equal(deepen.jobOf(DECK), null);
  assert.deepEqual(box.saved.jobs, []);
});

void test('§1 不能加深的篇：草稿、沒有 ID 的目標；同一篇只留一份工作', async t => {
  const draft = 'Essence Cards/學業/國二上/自然/草稿.md';
  const memory = createMemoryFiles({ [DECK]: DECK_TEXT, [draft]: DECK_TEXT.replace('狀態: 啟用', '狀態: 草稿').replace(' ^abc234', ' ^mnp234') });
  const box = machine();
  const { deepen } = await load(t, memory, box);
  const no = deepen.ready(draft);
  assert.ok(!no.ok && no.why.startsWith('草稿'));
  const first = await deepen.copy(DECK, '', '');
  const second = await deepen.copy(DECK, '', '');
  assert.ok('job' in first && 'job' in second);
  assert.deepEqual(deepen.jobs().map(job => job.id), [second.job.id]);
});

void test('§3-2 複製之後家長刪了目標：不寫、可以取消；取消不留 ID 預留', async t => {
  const memory = createMemoryFiles({ [DECK]: DECK_TEXT });
  const box = machine();
  const { deepen, state } = await load(t, memory, box);
  const copied = await deepen.copy(DECK, '', '');
  assert.ok('job' in copied);
  // 家長把唯一的目標換成另一個 ID。
  memory.texts.set(DECK, DECK_TEXT.replace('^abc234', '^xyz789'));
  await state.flush();
  const stop = await deepen.save(copied.job, REPLY, null);
  assert.equal(stop.kind, 'stop');
  assert.equal(memory.texts.get(DECK), DECK_TEXT.replace('^abc234', '^xyz789'));
  assert.ok(deepen.jobOf(DECK)?.save, '恢復資料留著，可以取消');
  assert.deepEqual(await deepen.cancel(copied.job), { kind: 'done', wrote: false, path: DECK });
  assert.equal(deepen.jobOf(DECK), null);
  assert.deepEqual(box.saved.retired, []);
});

void test('§4 提醒一區：複製後是等待貼回，寫好後是待審核；總開關關掉時不出現；「這次不用」記下現在記穩了的', async t => {
  const memory = createMemoryFiles({ [DECK]: DECK_TEXT });
  const box = machine();
  const { deepen } = await load(t, memory, box);
  await deepen.refresh();
  assert.deepEqual(deepen.rows(), []);
  const copied = await deepen.copy(DECK, '', '');
  assert.ok('job' in copied);
  await deepen.refresh();
  assert.deepEqual(deepen.rows().map(row => row.kind), ['waiting']);
  assert.deepEqual(await deepen.save(copied.job, REPLY, null), { kind: 'done', wrote: true, path: DECK });
  await deepen.refresh();
  assert.deepEqual(deepen.rows(), [{ path: DECK, kind: 'pending', text: '國二上自然 2-1 溫度：上一次加深的結果還沒審完' }]);
  box.saved.off = true;
  await deepen.refresh();
  assert.deepEqual(deepen.rows(), []);
  await deepen.skip(DECK);
  assert.deepEqual(box.saved.skips, { [DECK]: { ids: [], at: '2026-11-17T10:00:00+08:00' } });
});

void test('§3-2 複製之後卡組改名再貼回：不寫，新的那一篇不動', async t => {
  const memory = createMemoryFiles({ [DECK]: DECK_TEXT });
  const box = machine();
  const { deepen, state } = await load(t, memory, box);
  const copied = await deepen.copy(DECK, '', '');
  assert.ok('job' in copied);
  const renamed = DECK.replace('溫度.md', '溫度與熱.md');
  memory.rename(DECK, renamed);
  await state.flush();
  const stop = await deepen.save(copied.job, REPLY, null);
  assert.equal(stop.kind, 'stop');
  assert.equal(memory.texts.get(renamed), DECK_TEXT);
  assert.equal(memory.texts.has(DECK), false);
});

void test('§2-3 快照只寫檔名、同檔名的卡組有兩篇：不歸屬，提示裡沒有那份地圖', async t => {
  const twin = 'Essence Cards/學業/國二上/自然/舊/國二上自然 2-1 溫度.md';
  const memory = createMemoryFiles({ [DECK]: DECK_TEXT, [twin]: DECK_TEXT.replace('^abc234', '^tuv234'), [OLD_SNAPSHOT]: OLD_SNAPSHOT_TEXT });
  const box = machine();
  const { deepen, clipboard } = await load(t, memory, box);
  const copied = await deepen.copy(DECK, '', '');
  assert.ok('job' in copied);
  assert.match(clipboard[0], /最新的學習地圖：無/);
  assert.doesNotMatch(clipboard[0], /溫度的全貌/);
});

// L2 第一輪（Claude Codex Discussion/2026-11-17-ai-cards-deepen-l2.md）：提醒與手動流程用同一份啟用目標與紀錄。
const THREE = 'Essence Cards/學業/國二上/自然/國二上自然 2-2 熱.md';
const THREE_TEXT = '---\n年級學期: 國二上\n科目: 自然\n單元: 2-2 熱\n狀態: 啟用\n---\n\n'
  + '- 甲 ^aaa234\n    - 出處：p.50\n    - 甲？ :: 甲\n- 乙 ^bbb234\n    - 出處：p.51\n    - 乙？ :: 乙\n- 丙 ^ccc234\n    - 出處：p.52\n    - 丙？ :: 丙\n- 丁 ^ddd234\n    - 出處：p.53\n    - 丁？ :: 丁\n';
const LOG = 'Essence Cards/紀錄/2026-11 PC-old.jsonl';
function stableLog(text: string, ids: readonly string[]): string {
  const deck = parseDeck(text);
  const fp = (id: string): string => deck.targets.find(target => target.id === id)!.prompts[0].fingerprint;
  return ids.flatMap((id, i) => [
    encodeEntry(`2026-11-01T10:0${String(i)}:00.000+08:00`, { lt: id, r: 'good', v: fp(id) }),
    encodeEntry(`2026-11-02T10:0${String(i)}:00.000+08:00`, { lt: id, r: 'good', v: fp(id) }),
  ]).join('\n') + '\n';
}

void test('L2 R4 紀錄讀不到：不出可以按的列、手動加深也先擋；讀回來後照常', async t => {
  const memory = createMemoryFiles({ [THREE]: THREE_TEXT, [LOG]: stableLog(THREE_TEXT, ['aaa234', 'bbb234', 'ccc234']) });
  const box = machine();
  const { deepen, state } = await load(t, memory, box);
  await deepen.refresh();
  assert.deepEqual(deepen.rows().map(row => row.kind), ['ready']);
  memory.failing.add(LOG);
  memory.notify(LOG);
  for (let i = 0; i < 50 && state.writeBlock() !== 'unread'; i++) await new Promise(resolve => setTimeout(resolve, 5));
  assert.equal(state.writeBlock(), 'unread');
  await deepen.refresh();
  assert.deepEqual(deepen.rows(), []);
  assert.ok(!deepen.ready(THREE).ok);
  memory.failing.delete(LOG);
  memory.notify(LOG);
  for (let i = 0; i < 400 && state.writeBlock() === 'unread'; i++) await new Promise(resolve => setTimeout(resolve, 5));
  await deepen.refresh();
  assert.deepEqual(deepen.rows().map(row => row.kind), ['ready']);
});

void test('L2 R4 一篇讀不到只略過那一篇，不留舊的列、不擋別篇', async t => {
  const memory = createMemoryFiles({ [THREE]: THREE_TEXT, [DECK]: DECK_TEXT, [LOG]: stableLog(THREE_TEXT, ['aaa234', 'bbb234', 'ccc234']) });
  const box = machine();
  const { deepen, broken } = await load(t, memory, box);
  await deepen.refresh();
  assert.deepEqual(deepen.rows().map(row => row.path), [THREE]);
  broken.add(THREE);
  await deepen.refresh();
  assert.deepEqual(deepen.rows(), []);
  broken.delete(THREE);
  await deepen.refresh();
  assert.deepEqual(deepen.rows().map(row => row.path), [THREE]);
});

void test('L2 R5 重複 ID、暫停的目標：記穩了也不算、不進快照的記穩目標；提醒與手動的數字相同', async t => {
  const twin = 'Essence Cards/學業/國二上/自然/另一篇.md';
  const paused = THREE_TEXT.replace('    - 甲？ :: 甲\n', '    - 狀態：暫停\n    - 甲？ :: 甲\n');
  const memory = createMemoryFiles({
    [THREE]: paused, [twin]: DECK_TEXT.replace('^abc234', '^bbb234'),
    [LOG]: stableLog(THREE_TEXT, ['aaa234', 'bbb234', 'ccc234']),
  });
  const box = machine();
  const { deepen, state } = await load(t, memory, box);
  assert.deepEqual([...state.deckTargets(THREE)].sort(), ['ccc234', 'ddd234']);
  const ready = deepen.ready(THREE);
  assert.ok(ready.ok);
  assert.equal(ready.counts.stable, 1);
  const copied = await deepen.copy(THREE, '', '');
  assert.ok('job' in copied);
  assert.deepEqual(copied.job.stable, ['ccc234']);
});

void test('L2 R8 學習目的：今天以後有這個單元的小考是準備小考；在生效的考試範圍裡是準備段考；都有時寫小考', async t => {
  const exam = 'Essence Cards/考試範圍/段考.md';
  const quiz = 'Essence Cards/考試範圍/小考/熱.md';
  const examText = '---\n識別碼: x7f3k2\n考試開始: 2026-11-25\n考試結束: 2026-11-26\n---\n- 國二上 自然 2\n';
  const quizText = '---\n識別碼: q4m8t2\n小考日期: 2026-11-20\n---\n- 國二上 自然 2-2\n';
  const purpose = async (files: Record<string, string>): Promise<string> => {
    const memory = createMemoryFiles({ [THREE]: THREE_TEXT, ...files });
    const { deepen, clipboard } = await load(t, memory, machine());
    const copied = await deepen.copy(THREE, '', '');
    assert.ok('job' in copied);
    return /- 學習目的：(.+)/.exec(clipboard[0])![1];
  };
  assert.equal(await purpose({}), '平常複習');
  assert.equal(await purpose({ [exam]: examText }), '準備段考');
  assert.equal(await purpose({ [quiz]: quizText }), '準備小考');
  assert.equal(await purpose({ [exam]: examText, [quiz]: quizText }), '準備小考');
  // 已經考過的小考不算。
  assert.equal(await purpose({ [quiz]: quizText.replace('2026-11-20', '2026-11-10') }), '平常複習');
});

void test('L2 R9 寫入中按取消：取消不了、工作照常寫完；列是「正在寫」', async t => {
  const memory = createMemoryFiles({ [DECK]: DECK_TEXT });
  const box = machine();
  const { deepen } = await load(t, memory, box);
  const copied = await deepen.copy(DECK, '', '');
  assert.ok('job' in copied);
  const held = memory.holdModify(DECK);
  const saving = deepen.save(copied.job, REPLY, null);
  // 等寫入進了 modify。
  for (let i = 0; i < 50 && !memory.texts.get(DECK)!.includes('加深的學習目標'); i++) await new Promise(resolve => setTimeout(resolve, 5));
  await deepen.refresh();
  assert.deepEqual(deepen.rows().map(row => row.kind), ['writing']);
  const cancel = await deepen.cancel(copied.job);
  assert.equal(cancel.kind, 'stop');
  held.release();
  const done = await saving;
  assert.equal(done.kind, 'done');
  assert.match(memory.texts.get(DECK)!, /加深的學習目標/);
});
