import test from 'node:test';
import type { TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { blockIds, parseDeck } from '../src/core/deck/index.ts';
import { sha256Hex } from '../src/core/ai/index.ts';
import type { CardForm, CardJob, EmbeddedRules } from '../src/core/ai/index.ts';
import { createState } from '../src/state/index.ts';
import { createAiCards, inspectionKey } from '../src/obsidian/ai-cards.ts';
import { createMemoryFiles } from './helpers/memory-files.ts';

// tasks/phone-cards.md §2（D-226 第一步）：手機的 AI 製卡走窄入口。state 是手機（fillIds: false），開關由 phoneCards 決定；製卡流程、記憶體 Files 都是真的。

const rules: EmbeddedRules = { english: [{ name: '通用', version: 'v0.15', text: '# 通用', sha256: sha256Hex('# 通用') }, { name: '英文', version: 'v0.14', text: '# 英文', sha256: sha256Hex('# 英文') }] };
const OLD = 'Essence Cards/學業/國二上/英文/國二上英文 L1 單字.md';
const OLD_TEXT = '---\n年級學期: 國二上\n科目: 英文\n單元: L1 Hi\n狀態: 啟用\n---\n\n## 單字\n\n- hello 英翻中 ^k3m9qa\n    - 出處：p.10\n    - hello :: 你好\n';
/** 手寫、還沒補 ID 的卡組：手機不能替它補（D-134 照舊）。 */
const HAND = 'Essence Cards/學業/國二上/英文/手寫.md';
const HAND_TEXT = '---\n年級學期: 國二上\n科目: 英文\n單元: L2 Go\n狀態: 啟用\n---\n\n- go 英翻中\n    - go :: 去\n';
const REPLY = [
  '國二上英文 L3 單字', '', '## 單字', '', '- borrow 英翻中', '    - 出處：p.40', '    - borrow :: 借入', '',
  '國二上英文 L3 文法', '', '## 文法', '', '- 能用 be going to 說未來的計畫', '    - 出處：p.42', '    - 我明天要去游泳。I ＿＿ swim tomorrow. :: am going to', '<<<完>>>',
].join('\n');
const form: CardForm = { subject: 'english', term: '國二上', unit: 'L3 Sports', purpose: '準備段考', supplement: false, adjust: '', material: '' };
/** 手機建的檔名後面加這次製卡的識別碼（§2-3）。 */
const names = (code: string) => ({
  WORD: `Essence Cards/學業/國二上/英文/國二上英文 L3 單字 ${code}.md`,
  GRAMMAR: `Essence Cards/學業/國二上/英文/國二上英文 L3 文法 ${code}.md`,
  SNAPSHOT: `Essence Cards/紀錄/AI 輸出/2026-11-07 國二上英文 L3 Sports ${code}.md`,
});
const NOW = Date.parse('2026-11-07T10:02:11+08:00');
const settle = () => new Promise(resolve => setTimeout(resolve, 20));

/** 一支手機：localStorage 的替身、開關、state（fillIds: false）與製卡流程。 */
async function phone(t: TestContext, on: boolean) {
  const memory = createMemoryFiles({ [OLD]: OLD_TEXT, [HAND]: HAND_TEXT });
  // 複製提示時開關是開的（關著時入口不在）；之後才照 on 設定，模擬複製之後才關掉。
  const toggle = { on: true };
  const saved: { jobs: unknown } = { jobs: null };
  // eslint-disable-next-line prefer-const -- state 與流程互相參照
  let state: ReturnType<typeof createState>;
  const cards = createAiCards({
    rules, state: () => state, random: Math.random,
    names: () => new Set([...memory.texts.keys()].filter(path => path.endsWith('.md')).map(path => path.slice(path.lastIndexOf('/') + 1, -3).toLowerCase())),
    named: name => [...memory.texts.keys()].filter(path => path.endsWith('.md') && path.slice(path.lastIndexOf('/') + 1, -3).toLowerCase() === name),
    store: {
      jobs: () => saved.jobs === null ? null : JSON.parse(JSON.stringify(saved.jobs)) as unknown,
      saveJobs(jobs: CardJob[]) { saved.jobs = JSON.parse(JSON.stringify(jobs)) as unknown; },
      retired: () => [], retire() {}, last: () => ({}), saveLast() {}, picks: () => ({}), savePick() {},
    },
    clipboard: () => Promise.resolve(),
    phone: true,
    now: () => ({ ms: NOW, offset: 480 }),
    onError: error => { throw error; },
  });
  state = createState({ files: memory.files, device: 'iPhone-test', delay: 1, fillIds: false, phoneCards: () => toggle.on, random: Math.random, reserved: () => cards.reserved(), now: () => NOW, offset: () => 480, onError() {} });
  t.after(() => state.close());
  await state.ready();
  const copied = await cards.copy(form);
  assert.ok('job' in copied);
  const inspection = cards.inspect(copied.job, REPLY);
  assert.ok(!('error' in inspection));
  assert.deepEqual(inspection.errors, []);
  toggle.on = on;
  return { memory, toggle, saved, state, cards, job: copied.job, shown: inspectionKey(inspection), ...names(copied.job.id) };
}

void test('§2-1 開關關著（預設）：手機不配號、不建任何檔，說明要到設定頁打開；工作留著，打開之後接著存', async t => {
  const h = await phone(t, false);
  // 只比 Markdown：這台的複習紀錄（.jsonl）照常寫。
  const markdown = () => [...h.memory.texts].filter(([path]) => path.endsWith('.md'));
  const before = markdown();
  const stop = await h.cards.save(h.job, REPLY, null, h.shown);
  assert.equal(stop.kind, 'stop');
  assert.match((stop as { message: string }).message, /在這台裝置製卡/);
  assert.deepEqual(markdown(), before);
  assert.equal(h.cards.jobs().length, 1);
  h.toggle.on = true;
  assert.equal((await h.cards.save(h.job, REPLY, null, h.shown)).kind, 'done');
});

void test('§2-2 開關打開：手機建原文、草稿卡組與快照，新目標配好 ID、避開已有的；其他寫入照舊擋（不補 ID、不改狀態、加深不配號）', async t => {
  const h = await phone(t, true);
  const result = await h.cards.save(h.job, REPLY, null, h.shown);
  const { WORD, GRAMMAR, SNAPSHOT } = h;
  assert.deepEqual(result, { kind: 'done', decks: [WORD, GRAMMAR], targets: 2 });
  // 檔名後面是這次的識別碼（§2-3），快照的 `識別碼` 也是它；檢查結果的畫面用同一個名字。
  assert.match(h.job.id, /^[a-hjkmnp-z][a-hjkmnp-z2-9]{5}$/);
  assert.equal(h.cards.nameOf(h.job, '國二上英文 L3 單字'), `國二上英文 L3 單字 ${h.job.id}`);
  for (const path of [WORD, GRAMMAR]) {
    const deck = parseDeck(h.memory.texts.get(path)!);
    assert.equal(deck.props.status, 'draft');
    assert.equal(deck.targets.length, 1);
    assert.match(deck.targets[0].id ?? '', /^[a-hjkmnp-z2-9]{6}$/);
    assert.notEqual(deck.targets[0].id, 'k3m9qa');
  }
  assert.ok(h.memory.texts.get(SNAPSHOT)!.includes(`識別碼: ${h.job.id}\n`));
  assert.equal(h.memory.texts.get(OLD), OLD_TEXT);
  assert.equal(h.memory.texts.get(HAND), HAND_TEXT);
  await settle();
  // 窄入口以外照舊回 phone：補 ID、啟用、暫停、沒帶 cards 的配號（加深用的）與建檔。
  assert.equal(await h.state.fillIds(HAND), false);
  assert.equal(h.memory.texts.get(HAND), HAND_TEXT);
  assert.deepEqual(await h.state.activateDraft(WORD, null), { kind: 'blocked', reason: 'phone' });
  assert.deepEqual(await h.state.setDeckStatus(OLD, '暫停', null), { kind: 'blocked', reason: 'phone' });
  assert.equal(h.state.aiIds(1), 'phone');
  assert.deepEqual(await h.state.aiCreate('Essence Cards/紀錄/AI 輸出/別的.md', 'x'), { kind: 'blocked', reason: 'phone' });
  assert.equal(h.state.writeBlock(), 'phone');
});

void test('§2-1 存到一半關掉開關：寫到一半的那一篇照樣讀回核對，之後的卡組、快照都不寫；工作留著，打開後按繼續補齊、不重配 ID', async t => {
  const h = await phone(t, true);
  const { WORD, GRAMMAR, SNAPSHOT } = h;
  const held = h.memory.holdModify(WORD);
  const saving = h.cards.save(h.job, REPLY, null, h.shown);
  while (!h.memory.texts.has(WORD)) await new Promise(resolve => setTimeout(resolve, 1));
  h.toggle.on = false;
  held.release();
  const stop = await saving;
  assert.equal(stop.kind, 'stop');
  assert.match((stop as { message: string }).message, /在這台裝置製卡/);
  assert.ok(!h.memory.texts.has(GRAMMAR));
  assert.ok(!h.memory.texts.has(SNAPSHOT));
  const ids = h.cards.jobs()[0].save!.decks.flatMap(deck => deck.ids);
  h.toggle.on = true;
  assert.equal((await h.cards.resume(h.cards.jobs()[0])).kind, 'done');
  assert.deepEqual([...blockIds(h.memory.texts.get(WORD)!), ...blockIds(h.memory.texts.get(GRAMMAR)!)].sort(), [...ids].sort());
  assert.ok(h.memory.texts.has(SNAPSHOT));
});

void test('§2-1 寫入回呼裡再問一次開關：排進寫入那一列之後才關掉，回呼不寫', async t => {
  const h = await phone(t, true);
  // 讀原文時關掉：建檔已經在佇列前過了門檻，回呼裡要再擋一次。
  const original = h.memory.files.modify.bind(h.memory.files);
  h.memory.files.modify = (path, edit) => { h.toggle.on = false; return original(path, edit); };
  const stop = await h.cards.save(h.job, REPLY, null, h.shown);
  assert.equal(stop.kind, 'stop');
  // 複習紀錄（這台的 .jsonl）照常；Markdown 一份都沒建。
  assert.deepEqual([...h.memory.texts.keys()].filter(path => path.endsWith('.md')).sort(), [HAND, OLD].sort());
});

void test('§2-3 存草稿綁著看到的檢查結果：檢查之後同步來新的卡組、結果變了就不存，請家長回上一步再檢查', async t => {
  const h = await phone(t, true);
  const reply = REPLY.replace('<<<完>>>', '> [!note] 加進已有的學習目標\n> - k3m9qa hello 英翻中\n>     - hello there :: 你好啊\n<<<完>>>');
  const inspection = h.cards.inspect(h.job, reply);
  assert.ok(!('error' in inspection));
  const shown = inspectionKey(inspection);
  // 檢查之後，那個已有的目標被刪掉了（同步來的）：加進已有的會照原文留著，和剛才看到的不同。
  h.memory.write(OLD, OLD_TEXT.replace(' ^k3m9qa', ''));
  await settle();
  const before = new Map(h.memory.texts);
  const stop = await h.cards.save(h.job, reply, null, shown);
  assert.equal(stop.kind, 'stop');
  assert.match((stop as { message: string }).message, /和剛才看到的不同/);
  assert.deepEqual(h.memory.texts, before);
  assert.equal(h.cards.jobs()[0].save, null, '沒有開始存');
});

void test('§2-5 待貼回的工作存完讀回核對：存進去讀回來不同（被系統清掉、存不下）就不算存好，複製失敗、不寫任何檔', async t => {
  const memory = createMemoryFiles({});
  const errors: unknown[] = [];
  // eslint-disable-next-line prefer-const -- state 與流程互相參照
  let state: ReturnType<typeof createState>;
  const cards = createAiCards({
    rules, state: () => state, names: () => new Set(), named: () => [],
    // 存了等於沒存：讀回來永遠是空的。
    store: { jobs: () => null, saveJobs() {}, retired: () => [], retire() {}, last: () => ({}), saveLast() {}, picks: () => ({}), savePick() {} },
    clipboard: () => Promise.resolve(), now: () => ({ ms: NOW, offset: 480 }), onError: error => { errors.push(error); },
  });
  state = createState({ files: memory.files, device: 'iPhone-test', delay: 1, fillIds: false, phoneCards: () => true, now: () => NOW, offset: () => 480, onError() {} });
  t.after(() => state.close());
  await state.ready();
  const copied = await cards.copy(form);
  assert.ok('error' in copied);
  assert.match(copied.error, /存不進這台/);
  assert.equal(errors.length, 1);
  assert.deepEqual(cards.jobs(), []);
});

void test('§2-3 看得見的同名（別台同步來、或電腦篇名剛好帶同一碼）往後加 ` 2`，基底含識別碼；不覆寫別人的檔', async t => {
  const h = await phone(t, true);
  const other = '---\n年級學期: 國二上\n科目: 英文\n單元: L3 Sports\n狀態: 草稿\n---\n\n- 別台的\n    - a :: b\n';
  h.memory.write(h.WORD, other);
  await settle();
  const result = await h.cards.save(h.job, REPLY, null, h.shown);
  const moved = h.WORD.replace(/\.md$/, ' 2.md');
  assert.deepEqual(result, { kind: 'done', decks: [moved, h.GRAMMAR], targets: 2 });
  assert.equal(h.memory.texts.get(h.WORD), other);
});

void test('§2-3 規劃之後才同步來同名的檔：發布時照存下的基底（含識別碼）重挑，卡組與快照都不覆寫', async t => {
  const h = await phone(t, true);
  const other = '---\n年級學期: 國二上\n科目: 英文\n單元: L3 Sports\n狀態: 草稿\n---\n\n- 別台的\n    - a :: b\n';
  // 讀原文時（規劃已經做完）別台的同名卡組與快照到了。
  const original = h.memory.files.modify.bind(h.memory.files);
  let arrived = false;
  h.memory.files.modify = (path, edit) => {
    if (!arrived) { arrived = true; h.memory.write(h.GRAMMAR, other); h.memory.write(h.SNAPSHOT, other); }
    return original(path, edit);
  };
  await settle();
  const result = await h.cards.save(h.job, REPLY, null, h.shown);
  const grammar = h.GRAMMAR.replace(/\.md$/, ' 2.md');
  assert.deepEqual(result, { kind: 'done', decks: [h.WORD, grammar], targets: 2 });
  assert.equal(h.memory.texts.get(h.GRAMMAR), other);
  assert.equal(h.memory.texts.get(h.SNAPSHOT), other);
  const snapshot = h.SNAPSHOT.replace(/\.md$/, ' 2.md');
  assert.ok(h.memory.texts.get(snapshot)!.includes(`識別碼: ${h.job.id}\n`));
});

void test('§2-3 存草稿綁檢查結果（L2 R2）：檢查之後才送來通知、還沒讀進索引的變動也要先讀完再重新檢查；不同就不存', async t => {
  const h = await phone(t, true);
  const reply = REPLY.replace('<<<完>>>', '> [!note] 加進已有的學習目標\n> - k3m9qa hello 英翻中\n>     - hello there :: 你好啊\n<<<完>>>');
  const inspection = h.cards.inspect(h.job, reply);
  assert.ok(!('error' in inspection));
  const shown = inspectionKey(inspection);
  // 通知送到了、state 還沒讀（不等 settle）就按存。
  h.memory.write(OLD, OLD_TEXT.replace(' ^k3m9qa', ''));
  const markdown = () => [...h.memory.texts].filter(([path]) => path.endsWith('.md'));
  const before = markdown();
  const stop = await h.cards.save(h.job, reply, null, shown);
  assert.equal(stop.kind, 'stop');
  assert.match((stop as { message: string }).message, /和剛才看到的不同/);
  assert.deepEqual(markdown(), before);
  assert.equal(h.cards.jobs()[0].save, null, '沒有開始存');
});

void test('§2-5 手機剛開、卡組還在讀（L2 R6）：已有的學習目標是「還不知道」，不能複製提示；讀完才照實數', async t => {
  const memory = createMemoryFiles({ [OLD]: OLD_TEXT });
  const held = memory.holdRead(OLD);
  // eslint-disable-next-line prefer-const -- state 與流程互相參照
  let state: ReturnType<typeof createState>;
  const saved: { jobs: unknown } = { jobs: null };
  const cards = createAiCards({
    rules, state: () => state, names: () => new Set(), named: () => [],
    store: {
      jobs: () => saved.jobs === null ? null : JSON.parse(JSON.stringify(saved.jobs)) as unknown,
      saveJobs(jobs: CardJob[]) { saved.jobs = JSON.parse(JSON.stringify(jobs)) as unknown; },
      retired: () => [], retire() {}, last: () => ({}), saveLast() {}, picks: () => ({}), savePick() {},
    },
    clipboard: () => Promise.resolve(), phone: true, now: () => ({ ms: NOW, offset: 480 }), onError: error => { throw error; },
  });
  state = createState({ files: memory.files, device: 'iPhone-test', delay: 1, fillIds: false, phoneCards: () => true, now: () => NOW, offset: () => 480, onError() {} });
  t.after(() => state.close());
  const ready = state.ready();
  await held.started;
  assert.equal(cards.existing(form), 'loading');
  const early = await cards.copy(form);
  assert.ok('error' in early);
  assert.match(early.error, /正在讀取卡組/);
  assert.deepEqual(cards.jobs(), []);
  held.release();
  await ready;
  assert.equal(cards.existing(form), 1);
  const copied = await cards.copy(form);
  assert.ok('job' in copied);
  assert.equal(copied.job.existing.length, 1);
  // 讀完了、但那篇讀不到（iCloud 還沒下載）：也不能當成沒有（第二輪延續 R6）。
  const failing = createMemoryFiles({ [OLD]: OLD_TEXT });
  const broken = failing.holdRead(OLD);
  // eslint-disable-next-line prefer-const -- state 與流程互相參照
  let other: ReturnType<typeof createState>;
  const cards2 = createAiCards({
    rules, state: () => other, names: () => new Set(), named: () => [],
    store: { jobs: () => null, saveJobs() {}, retired: () => [], retire() {}, last: () => ({}), saveLast() {}, picks: () => ({}), savePick() {} },
    clipboard: () => Promise.resolve(), phone: true, now: () => ({ ms: NOW, offset: 480 }), onError: error => { throw error; },
  });
  other = createState({ files: failing.files, device: 'iPhone-test', delay: 1, fillIds: false, phoneCards: () => true, now: () => NOW, offset: () => 480, onError() {} });
  t.after(() => other.close());
  const loading = other.ready();
  await broken.started;
  broken.release(Error('還在下載'));
  await loading;
  assert.equal(cards2.existing(form), 'unread');
  const refused = await cards2.copy(form);
  assert.ok('error' in refused);
  assert.match(refused.error, /沒讀到/);
});

void test('§2-2 還原中按「存成草稿」（第二輪 R2 修正引入）：立刻停下、不等還原結束才接著存；什麼都不寫，說明照畫面上有的按鈕', async t => {
  const h = await phone(t, true);
  let release = (): void => {};
  let begun = (): void => {};
  const started = new Promise<void>(resolve => { begun = resolve; });
  const restoring = h.state.restore(() => new Promise<void>(resolve => { release = resolve; begun(); }));
  assert.equal(h.state.writeBlock(true), 'restore');
  const markdown = () => [...h.memory.texts].filter(([path]) => path.endsWith('.md'));
  const before = markdown();
  const stop = await h.cards.save(h.job, REPLY, null, h.shown);
  assert.equal(stop.kind, 'stop');
  assert.match((stop as { message: string }).message, /正在還原.*回上一步，再按一次「存成草稿」/);
  await started;
  release();
  await restoring;
  await settle();
  assert.deepEqual(markdown(), before);
  assert.equal(h.cards.jobs()[0].save, null, '沒有開始存');
});

void test('§2-5 讀完之後才同步來的卡組（L2 第三、四輪延續 R6）：通知到了、還在讀時按複製，不等、不複製（剪貼簿要在按下的當下寫）；讀完再按照實數', async t => {
  const memory = createMemoryFiles({});
  const saved: { jobs: unknown } = { jobs: null };
  // eslint-disable-next-line prefer-const -- state 與流程互相參照
  let state: ReturnType<typeof createState>;
  const cards = createAiCards({
    rules, state: () => state, names: () => new Set(), named: () => [],
    store: {
      jobs: () => saved.jobs === null ? null : JSON.parse(JSON.stringify(saved.jobs)) as unknown,
      saveJobs(jobs: CardJob[]) { saved.jobs = JSON.parse(JSON.stringify(jobs)) as unknown; },
      retired: () => [], retire() {}, last: () => ({}), saveLast() {}, picks: () => ({}), savePick() {},
    },
    clipboard: () => Promise.resolve(), phone: true, now: () => ({ ms: NOW, offset: 480 }), onError: error => { throw error; },
  });
  state = createState({ files: memory.files, device: 'iPhone-test', delay: 1, fillIds: false, phoneCards: () => true, now: () => NOW, offset: () => 480, onError() {} });
  t.after(() => state.close());
  await state.ready();
  const held = memory.holdRead(OLD);
  memory.write(OLD, OLD_TEXT);
  await held.started;
  assert.equal(cards.existing(form), 'loading');
  const early = await cards.copy(form);
  assert.ok('error' in early);
  assert.match(early.error, /正在讀取剛同步來的卡組/);
  assert.deepEqual(cards.jobs(), []);
  held.release();
  await settle();
  assert.equal(cards.existing(form), 1);
  const copied = await cards.copy(form);
  assert.ok('job' in copied);
  assert.equal(copied.job.existing.length, 1);
});
