import test from 'node:test';
import type { TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { parse } from 'yaml';
import { mockFetch } from '../../../packages/ai-client/src/testing.ts';
import type { MockReply } from '../../../packages/ai-client/src/testing.ts';
import { beginDeepen, directJob, rawPath, runDeepen, sha256Hex, sha256OfBytes } from '../src/core/ai/index.ts';
import type { DeepenJob, EmbeddedRules } from '../src/core/ai/index.ts';
import { cardsClient, readConnection } from '../src/core/connect/index.ts';
import type { DirectFailure, DirectLog, KeyLookup, Material } from '../src/core/connect/index.ts';
import { createState } from '../src/state/index.ts';
import { createDeepen } from '../src/obsidian/deepen.ts';
import { FAKE_KEY, ok, sent, unauthorized } from './helpers/ai-direct.ts';
import { createMemoryFiles } from './helpers/memory-files.ts';

// 加深的直接製作（tasks/ai-direct.md §9）：加深流程（src/obsidian/deepen.ts）＋真正的 createState＋記憶體 Files＋套件的假 fetch。
// 畫面另外在 tests/deepen-modal.test.ts 與 Windows 實機看。

const rules: EmbeddedRules = { science: [{ name: '通用', version: 'v1', text: '# 通用', sha256: sha256Hex('# 通用') }] };
const DECK = 'Essence Cards/學業/國二上/自然/國二上自然 2-1 溫度.md';
const DECK_TEXT = '---\n年級學期: 國二上\n科目: 自然\n單元: 2-1 溫度\n狀態: 啟用\n---\n\n## 溫度計\n\n- 能說出溫度計的原理 ^abc234\n    - 出處：p.40\n    - 類型：定義\n    - 溫度計靠什麼原理？ :: 熱脹冷縮\n';
const REPLY = [
  '<<<全貌>>>', '溫度的全貌', '', '<<<架構>>>', '1. 溫度計', '2. 溫標', '', '<<<卡組>>>', '## 溫度計', '',
  '- 能比較酒精與水銀溫度計的差異', '    - 出處：p.41', '    - 類型：比較', '    - 為什麼**水銀**溫度計可以量較高溫？ :: 水銀**沸點高**', '<<<完>>>',
].join('\n');
const NOW = Date.parse('2026-11-17T10:00:00+08:00');
const FOLDER = 'Essence Cards/紀錄/AI 輸出';
const SNAPSHOT = `${FOLDER}/2026-11-17 國二上自然 2-1 溫度 加深.md`;
const PAGE = new Uint8Array([37, 80, 68, 70, 9, 8, 7]);
const lesson: Material = { name: '自然 2-1 補充.pdf', mediaType: 'application/pdf', data: PAGE, pages: 4, sha256: sha256OfBytes(PAGE) };

function machine() {
  const saved: { jobs: unknown; retired: string[]; skips: unknown; picks: Record<string, boolean>; failNext: number } = { jobs: null, retired: [], skips: null, picks: {}, failNext: 0 };
  return {
    saved,
    store: {
      jobs: () => saved.jobs === null ? null : JSON.parse(JSON.stringify(saved.jobs)) as unknown,
      saveJobs(jobs: DeepenJob[]) { if (saved.failNext > 0) { saved.failNext--; throw Error('存不進去（測試）'); } saved.jobs = JSON.parse(JSON.stringify(jobs)) as unknown; },
      retire(ids: readonly string[]) { saved.retired = [...new Set([...saved.retired, ...ids])]; },
      skips: () => saved.skips,
      saveSkips(value: Record<string, { ids: string[]; at: string }>) { saved.skips = JSON.parse(JSON.stringify(value)) as unknown; },
      remindOff: () => false,
      picks: () => saved.picks,
      savePick(key: string, pick: boolean) { saved.picks = { ...saved.picks, [key]: pick }; },
    },
  };
}
/** 每次載入同一串亂數：兩次載入配出的 ID 相同，存出的卡組才能逐字比。 */
function seeded(): () => number {
  let seed = 11;
  return () => { seed = (seed * 48_271) % 2_147_483_647; return seed / 2_147_483_647; };
}
async function load(t: TestContext, replies: MockReply[], options: { key?: KeyLookup; direct?: boolean; box?: ReturnType<typeof machine>; memory?: ReturnType<typeof createMemoryFiles>; now?: () => number } = {}) {
  const random = seeded();
  const memory = options.memory ?? createMemoryFiles({ [DECK]: DECK_TEXT });
  const box = options.box ?? machine();
  const clipboard: string[] = [];
  const errors: unknown[] = [];
  const failures: DirectFailure[] = [];
  const logs: DirectLog[] = [];
  const fetch = mockFetch(replies);
  const client = cardsClient(fetch);
  const connection = readConnection({ provider: 'google', models: { google: 'gemini-3.8-flash' }, secrets: { google: 'my-key' } }, client.providers());
  const now = options.now ?? (() => NOW);
  const md = () => [...memory.texts.keys()].filter(path => path.endsWith('.md'));
  // eslint-disable-next-line prefer-const -- state 與流程互相參照
  let state: ReturnType<typeof createState>;
  const deepen = createDeepen({
    rules, state: () => state, store: box.store, random,
    names: () => new Set(md().map(path => path.slice(path.lastIndexOf('/') + 1, -3).toLowerCase())),
    named: name => md().filter(path => path.slice(path.lastIndexOf('/') + 1, -3).toLowerCase() === name),
    snapshots: () => Promise.resolve(md().filter(path => path.startsWith(`${FOLDER}/`) && !path.includes('/原文/')).map(path => ({ path, text: memory.texts.get(path)! }))),
    read: path => Promise.resolve(memory.texts.get(path) ?? null),
    editor: () => null,
    unsaved: () => Promise.resolve(false),
    clipboard: text => { clipboard.push(text); return Promise.resolve(); },
    now: () => ({ ms: now(), offset: 480 }),
    onError: error => { errors.push(error); },
    ...options.direct === false ? {} : { direct: { client, connection: () => connection, key: () => options.key ?? { ok: true, key: FAKE_KEY }, onFailure: (log: DirectLog, failure: DirectFailure) => { failures.push(failure); logs.push(log); } } },
  });
  state = createState({ files: memory.files, device: 'PC-test', delay: 1, fillIds: true, random, reserved: () => deepen.reserved(), now: () => NOW, offset: () => 480, onError() {} });
  t.after(() => state.close());
  await state.ready();
  return { deepen, memory, box, clipboard, errors, failures, logs, fetch };
}
function propsOf(memory: ReturnType<typeof createMemoryFiles>, path = SNAPSHOT): { props: Record<string, unknown>; text: string } {
  const text = memory.texts.get(path);
  assert.ok(text, `${path} 不在：${[...memory.texts.keys()].join('、')}`);
  return { props: parse(text.slice(4, text.indexOf('\n---\n'))) as Record<string, unknown>, text };
}

void test('§9 加深的直接製作：送出和複製的同一份提示加上教材檔；收到的寫進加深框，快照是 `接法: API`，欄位與位置和製卡的相同', async t => {
  const made = await load(t, [ok(REPLY)]);
  const progress: string[] = [];
  const outcome = await made.deepen.direct(DECK, '這次不要課外', '補充講義', undefined, [lesson], event => { progress.push(event.type); });
  assert.equal(outcome.kind, 'received', JSON.stringify(outcome));
  if (outcome.kind !== 'received') return;
  assert.equal(outcome.reply, REPLY);
  // 送出的提示和「複製提示」的一模一樣：用另一台、同一串亂數的電腦複製一次來比。
  const copier = await load(t, [], { direct: false });
  const copied = await copier.deepen.copy(DECK, '這次不要課外', '補充講義');
  assert.ok('job' in copied);
  const body = sent(made.fetch.requests[0].body);
  assert.equal(body.text, copier.clipboard[0]);
  assert.deepEqual(body.files, ['application/pdf']);
  assert.ok(!made.fetch.requests[0].body?.includes('自然 2-1 補充'), '檔名不送給服務');
  assert.ok(progress.includes('text'));
  // 收到了、還沒存：工作留著，記著收到的整段（重開不用再付一次錢）。
  const api = directJob(made.deepen.jobOf(DECK)!);
  assert.equal(api?.state, 'received');
  assert.equal(api?.received?.text, REPLY);
  assert.deepEqual(api?.files, [{ sha256: lesson.sha256, pages: 4, name: lesson.name }]);

  const inspection = made.deepen.inspect(outcome.job, outcome.reply);
  assert.ok(!('error' in inspection) && !inspection.errors.length);
  const done = await made.deepen.save(outcome.job, outcome.reply, null, true);
  assert.deepEqual(done, { kind: 'done', wrote: true, path: DECK });
  assert.equal(made.deepen.jobOf(DECK), null);
  assert.ok(made.memory.texts.get(DECK)!.includes('加深的學習目標'));

  const { props, text } = propsOf(made.memory);
  const job = outcome.job;
  assert.equal(props['工作'], '加深');
  assert.equal(props['接法'], 'API');
  assert.equal(props['服務'], 'Gemini');
  assert.equal(props['要求的模型'], 'gemini-3.8-flash');
  assert.equal(props['模型'], 'gemini-3.8-flash-001');
  assert.equal(props['推理等級'], '未指定');
  assert.equal(props['送出時間'], job.copiedAt);
  // 收到時間是服務回完的那一刻（套件記的真時間），不是假時鐘。
  assert.equal(props['收到時間'], outcome.evidence.receivedAt);
  assert.match(String(props['收到時間']), /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+08:00$/);
  assert.equal(props['輸入用量'], 18_000);
  assert.equal(props['輸出用量'], 4_000);
  assert.equal(props['回應編號'], 'gem-1');
  assert.deepEqual(props['教材檔'], [`${lesson.sha256} 4頁 自然 2-1 補充.pdf`]);
  assert.equal(props['教材說明'], '補充講義');
  assert.equal(props['複製時間'], undefined);
  assert.equal(props['收到的回覆'], undefined);
  // 欄位順序（syntax.md §7 的範例）：送出時間、收到時間換掉複製時間；接法以後的在教材說明、教材檔之後；加深的原有目標照舊在記穩目標後面。
  const keys = Object.keys(props);
  const order = ['回覆原文', '送出時間', '收到時間', '已有目標', '記穩目標', '原有目標', '教材說明', '教材檔', '接法', '服務', '要求的模型', '模型', '推理等級', '輸入用量', '輸出用量', '費用', '費用來源', '牌價日期', '回應編號'];
  assert.deepEqual(keys.filter(key => order.includes(key)), order);
  // 原文：送出的每一部分與回覆都在。
  for (const part of job.parts) assert.equal(made.memory.texts.get(rawPath(part.sha256)), part.text);
  assert.equal(made.memory.texts.get(rawPath(sha256Hex(REPLY))), REPLY);
  assert.ok(text.endsWith('\n'));
  assert.deepEqual(made.errors, []);
});

void test('§9 收到的和貼上的同一段：卡組與快照本文逐字相同，只有屬性區的接法欄不同；沒附教材時不寫教材檔、請求裡沒有檔案', async t => {
  const direct = await load(t, [ok(REPLY)]);
  const outcome = await direct.deepen.direct(DECK, '', '', undefined, []);
  assert.equal(outcome.kind, 'received');
  if (outcome.kind !== 'received') return;
  assert.deepEqual(sent(direct.fetch.requests[0].body).files, []);
  assert.equal((await direct.deepen.save(outcome.job, outcome.reply, null, true)).kind, 'done');

  const pasted = await load(t, [], { direct: false });
  const copied = await pasted.deepen.copy(DECK, '', '');
  assert.ok('job' in copied);
  assert.equal((await pasted.deepen.save(copied.job, REPLY, 'Gemini')).kind, 'done');

  assert.equal(direct.memory.texts.get(DECK), pasted.memory.texts.get(DECK));
  const a = propsOf(direct.memory), b = propsOf(pasted.memory);
  assert.equal(a.text.slice(a.text.indexOf('\n---\n')), b.text.slice(b.text.indexOf('\n---\n')));
  assert.equal(a.props['教材檔'], undefined);
  assert.equal(a.props['接法'], 'API');
  assert.equal(b.props['接法'], '複製貼上');
  assert.equal(b.props['服務'], 'Gemini');
  assert.equal(b.props['模型'], '未記錄');
});

void test('§9 收到之後家長改了字：快照多寫 `收到的回覆`，收到的與存下的兩段都進原文', async t => {
  const made = await load(t, [ok(REPLY)]);
  const outcome = await made.deepen.direct(DECK, '', '', undefined, []);
  assert.equal(outcome.kind, 'received');
  if (outcome.kind !== 'received') return;
  const edited = REPLY.replace('水銀**沸點高**', '水銀的**沸點高**');
  assert.equal((await made.deepen.save(outcome.job, edited, null, true)).kind, 'done');
  const { props } = propsOf(made.memory);
  assert.equal(props['收到的回覆'], sha256Hex(REPLY));
  assert.equal(props['回覆原文'], sha256Hex(edited));
  assert.equal(made.memory.texts.get(rawPath(sha256Hex(REPLY))), REPLY);
  assert.equal(made.memory.texts.get(rawPath(sha256Hex(edited))), edited);
});

void test('§9 送不成：工作留著、記失敗；重送用同一份提示與教材，成功後快照的送出時間是第一次的；改用複製貼上拿掉 api，存成複製貼上', async t => {
  let clock = NOW;
  const made = await load(t, [unauthorized, ok(REPLY)], { now: () => clock });
  const failed = await made.deepen.direct(DECK, '', '', undefined, [lesson]);
  assert.equal(failed.kind, 'failed');
  if (failed.kind !== 'failed') return;
  assert.equal(failed.failure.kind, 'auth');
  assert.equal(made.failures.length, 1);
  assert.equal(made.logs[0].service, 'Gemini');
  assert.equal(directJob(made.deepen.jobOf(DECK)!)?.state, 'failed');
  assert.ok(made.deepen.keeps(failed.job));
  const preview = made.deepen.resendPreview(failed.job);
  assert.ok(preview.ok && preview.line.startsWith('會送出：自然 2-1 補充.pdf（4 頁）'), JSON.stringify(preview));
  clock = NOW + 60_000;
  const again = await made.deepen.resend(failed.job);
  assert.equal(again.kind, 'received');
  if (again.kind !== 'received') return;
  assert.equal(sent(made.fetch.requests[0].body).text, sent(made.fetch.requests[1].body).text);
  assert.deepEqual(sent(made.fetch.requests[1].body).files, ['application/pdf']);
  assert.equal((await made.deepen.save(again.job, again.reply, null, true)).kind, 'done');
  const { props } = propsOf(made.memory);
  assert.equal(props['送出時間'], failed.job.copiedAt);
  assert.equal(props['收到時間'], again.evidence.receivedAt);
  assert.notEqual(failed.job.copiedAt, again.job.api?.at, '重送的時間另記在工作裡，快照的送出時間照第一次');

  // 改用複製貼上：同一份提示進剪貼簿，工作改回一般的待貼回，存出來是複製貼上。
  const other = await load(t, [unauthorized]);
  const lost = await other.deepen.direct(DECK, '', '', undefined, []);
  assert.equal(lost.kind, 'failed');
  if (lost.kind !== 'failed') return;
  const plain = await other.deepen.fallback(lost.job);
  assert.ok(plain && plain.api === undefined);
  assert.equal(other.clipboard[0], sent(other.fetch.requests[0].body).text);
  assert.equal(directJob(other.deepen.jobOf(DECK)!), null);
  assert.equal((await other.deepen.save(plain, REPLY, 'Claude', true)).kind, 'done');
  const fallback = propsOf(other.memory).props;
  assert.equal(fallback['接法'], '複製貼上');
  assert.equal(fallback['服務'], 'Claude');
});

void test('§9 格式查核 F14 第 2 點：這一篇上一次直接送出的還沒處理完，直接製作與複製提示都擋下，不把它換掉；取消之後才能再做', async t => {
  const made = await load(t, [unauthorized]);
  const failed = await made.deepen.direct(DECK, '', '', undefined, []);
  assert.equal(failed.kind, 'failed');
  if (failed.kind !== 'failed') return;
  const blocked = await made.deepen.direct(DECK, '', '', undefined, []);
  assert.equal(blocked.kind, 'blocked');
  const copied = await made.deepen.copy(DECK, '', '');
  assert.ok('error' in copied && copied.error.includes('上一次直接送出的還沒處理完'), JSON.stringify(copied));
  assert.equal(made.deepen.jobOf(DECK)?.id, failed.job.id);
  assert.equal(made.fetch.requests.length, 1);
  await made.deepen.cancel(failed.job);
  const again = await made.deepen.copy(DECK, '', '');
  assert.ok('job' in again);
});

void test('§9 重開 Obsidian：收到的整段從工作讀回來、存成 API；上一次沒附教材的直接重送，有附的要重選', async t => {
  const box = machine();
  const first = await load(t, [ok(REPLY)], { box });
  const outcome = await first.deepen.direct(DECK, '', '', undefined, []);
  assert.equal(outcome.kind, 'received');
  const again = await load(t, [], { box, memory: first.memory });
  const job = again.deepen.jobOf(DECK)!;
  assert.equal(directJob(job)?.received?.text, REPLY);
  assert.equal((await again.deepen.save(job, REPLY, null, true)).kind, 'done');
  assert.equal(propsOf(again.memory).props['接法'], 'API');

  // 上一次沒附教材：重開之後照樣記得「沒有檔」，不用重選。有附的：要重選。
  const box2 = machine();
  const lost = await load(t, [unauthorized], { box: box2 });
  assert.equal((await lost.deepen.direct(DECK, '', '', undefined, [])).kind, 'failed');
  const reopened = await load(t, [], { box: box2, memory: lost.memory });
  assert.ok(reopened.deepen.keeps(reopened.deepen.jobOf(DECK)!));
  assert.ok(reopened.deepen.resendPreview(reopened.deepen.jobOf(DECK)!).ok);

  const box3 = machine();
  const withFile = await load(t, [unauthorized], { box: box3 });
  assert.equal((await withFile.deepen.direct(DECK, '', '', undefined, [lesson])).kind, 'failed');
  const reopened3 = await load(t, [], { box: box3, memory: withFile.memory });
  const held = reopened3.deepen.jobOf(DECK)!;
  assert.ok(!reopened3.deepen.keeps(held));
  const need = reopened3.deepen.resendPreview(held);
  assert.ok(!need.ok && need.reason.includes('重新選一次'));
  assert.ok(reopened3.deepen.resendPreview(held, [lesson]).ok);
});

void test('§9 送出前擋下：沒有金鑰、沒選服務標 settings；PDF 太多頁照 §5 擋；沒有直接製作的裝置是 null；都不建工作', async t => {
  const none = await load(t, [], { key: { ok: false, why: 'unset' } });
  const ctx = await none.deepen.context(DECK);
  assert.ok(!('error' in ctx));
  const noKey = none.deepen.directPreview(ctx, '', '', undefined, []);
  assert.ok(noKey && !noKey.ok && noKey.settings === true);
  const blocked = await none.deepen.direct(DECK, '', '', undefined, []);
  assert.equal(blocked.kind, 'blocked');
  assert.equal(none.deepen.jobOf(DECK), null);

  const made = await load(t, []);
  const ctx2 = await made.deepen.context(DECK);
  assert.ok(!('error' in ctx2));
  const big: Material = { ...lesson, pages: 31 };
  const tooMany = made.deepen.directPreview(ctx2, '', '', undefined, [big]);
  assert.ok(tooMany && !tooMany.ok && tooMany.reason.includes('一次最多 30 頁'));
  const line = made.deepen.directPreview(ctx2, '', '', undefined, []);
  assert.ok(line?.ok && line.line.startsWith('會送出：規則與任務段'), JSON.stringify(line));
  assert.equal((await made.deepen.direct(DECK, '', '', undefined, [big])).kind, 'blocked');
  assert.equal(made.fetch.requests.length, 0);

  const phone = await load(t, [], { direct: false });
  const ctx3 = await phone.deepen.context(DECK);
  assert.ok(!('error' in ctx3));
  assert.equal(phone.deepen.directPreview(ctx3, '', '', undefined, []), null);
  assert.equal(phone.deepen.canDirect(), false);
});

void test('§9 收到的那一刻存不進這台電腦：存草稿時證據對不上手上的，當成複製貼上（同製卡的 L2 第三輪 T1）', async t => {
  const made = await load(t, [unauthorized, ok(REPLY)]);
  const failed = await made.deepen.direct(DECK, '', '', undefined, []);
  assert.equal(failed.kind, 'failed');
  if (failed.kind !== 'failed') return;
  made.box.saved.failNext = 0;
  const again = await made.deepen.resend(failed.job);
  assert.equal(again.kind, 'received');
  if (again.kind !== 'received') return;
  // 畫面手上的是失敗時那一份（沒有收到的整段）：存的時候對不上，照複製貼上寫。
  assert.equal((await made.deepen.save(failed.job, again.reply, null, true)).kind, 'done');
  assert.equal(propsOf(made.memory).props['接法'], '複製貼上');
});

void test('§9 恢復資料裡的證據讀不懂（較新的版本存的，F12）：不寫任何檔，停下來請家長更新', async () => {
  const memory = createMemoryFiles({ [DECK]: DECK_TEXT });
  const job: DeepenJob = {
    kind: 'deepen', id: 'w7k2pq', copiedAt: '2026-11-17T10:00:00+08:00', copiedMs: NOW, deck: DECK, ids: ['abc234'], baseSha: sha256Hex(DECK_TEXT),
    form: { subject: 'science', term: '國二上', unit: '2-1 溫度', purpose: '平常複習', supplement: true, adjust: '', material: '' },
    subject: { key: 'science', label: '自然', subject: '自然', r3: false }, parts: [{ name: '通用', version: 'v1', text: '# 通用', sha256: sha256Hex('# 通用') }, { name: '任務', version: '', text: '任務', sha256: sha256Hex('任務') }],
    promptSha: sha256Hex('# 通用\n\n任務'), stable: [], sent: 1, save: null,
  };
  const begun = beginDeepen(job, REPLY, null, { boxes: [], noteItems: [], ids: [], edits: [], snapshotBody: '本文' }, '2026-11-17T10:00:00+08:00', new Set());
  const newer = { ...begun, save: { ...begun.save!, api: { service: 'Gemini', future: true } } } as unknown as DeepenJob;
  const writes: string[] = [];
  const result = await runDeepen(newer, {
    store() {}, remove() {}, read: path => Promise.resolve(memory.texts.get(path) ?? null), displaced: () => false,
    append: () => { writes.push('append'); return Promise.resolve({ kind: 'not', why: 'blocked' }); },
    create: path => { writes.push(path); return Promise.resolve({ kind: 'done' }); }, names: () => new Set(),
  });
  assert.deepEqual(result, { kind: 'stop', why: 'newer' });
  assert.deepEqual(writes, []);
});
