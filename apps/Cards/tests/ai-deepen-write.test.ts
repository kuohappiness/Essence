import test from 'node:test';
import assert from 'node:assert/strict';
import {
  appendBatch, beginDeepen, composeBatch, idsInDeepenBoxes, inspectDeepen, introBoxes, isDeepenJob, planAppend, readDeepenJobs, runDeepen, settleUnclear, sha256Hex, unclosedFence, verifyAppend,
} from '../src/core/ai/index.ts';
import type { AppendWrite, CardForm, DeepenIo, DeepenJob, DirectEvidence } from '../src/core/ai/index.ts';
import { parseDeck } from '../src/core/deck/index.ts';

// AI 製卡第 2 批：加深交回的內容寫進那一篇（tasks/ai-cards-deepen.md §3-1、§3-2）。預期照任務說明手寫。

const DECK = `---
年級學期: 國二上
科目: 自然
單元: 2-1 溫度
狀態: 啟用
---

> [!note] 給家長的備註
> - 原本的備註

## 溫度計
- 能說出溫度計的原理 ^abc234
    - 出處：p.40
    - 類型：定義
    - 溫度計靠什麼原理？ :: 熱脹冷縮


`;
const REPLY = `## 溫度計

- 能比較酒精與水銀溫度計的差異
    - 出處：p.41
    - 類型：比較
    - 為什麼**水銀**溫度計可以量較高溫？ :: 水銀**沸點高**

> [!note] 加進已有的學習目標
> - abc234 能說出溫度計的原理
>     - 出處：p.40
>     - 溫度上升時液柱怎樣？ :: 上升
> - zzz999 別篇的目標
>     - 出處：p.40
>     - 題目？ :: 答案

> [!note] 候選卡片
> - 能說出攝氏溫標的定點
>     - 理由：課本只提一句
>     - 出處：p.42
>     - 類型：定義
>     - 攝氏 0 度是什麼？ :: 冰點

> [!note] 給家長的備註
> - 課本與講義說法一致

<<<完>>>`;
const FORM: CardForm = { subject: 'science', term: '國二上', unit: '2-1 溫度', purpose: '平常複習', supplement: false, adjust: '', material: '' };
const SUBJECT = { subject: '自然', r3: false };
const HERE = { path: 'Essence Cards/學業/國二上/自然/國二上自然 2-1.md', targets: new Map([['abc234', '能說出溫度計的原理']]) };
const ids = (...list: string[]): () => string => { let n = 0; return () => list[n++]; };

void test('檢查：框以外是新目標，三種框分開收；補題只轉這一篇的目標；框的位置不提示', () => {
  const found = inspectDeepen(REPLY, FORM, SUBJECT, HERE);
  assert.deepEqual(found.errors, []);
  assert.deepEqual(found.counts, { targets: 1, prompts: 1, adds: 2, candidates: 1, notes: 1 });
  assert.equal(found.nothing, false);
  assert.deepEqual(found.adds.map(add => [add.id, add.name]), [['abc234', '能說出溫度計的原理'], ['zzz999', null]]);
  assert.ok(found.hints.some(hint => hint.message.includes('「zzz999」不是這一篇現在的學習目標')));
  assert.ok(!found.hints.some(hint => /放在最後|放在最上面|預設摺起|候選卡片之前/.test(hint.message)));
});

void test('組成一批接在檔尾：備註併進原有的框、補題轉成這一篇的連結、候選摺起、ID 配在名稱行；驗得過', () => {
  const found = inspectDeepen(REPLY, FORM, SUBJECT, HERE);
  const batch = composeBatch(found, '國二上自然 2-1', ids('xyz234', 'qrs567'), '2026-11-17');
  assert.deepEqual(batch.ids, ['xyz234', 'qrs567']);
  const out = appendBatch(DECK, batch);
  assert.ok('text' in out);
  assert.equal(out.merged, true);
  assert.equal(out.text, `---
年級學期: 國二上
科目: 自然
單元: 2-1 溫度
狀態: 啟用
---

> [!note] 給家長的備註
> - 原本的備註
> - 加深 2026-11-17：課本與講義說法一致

## 溫度計
- 能說出溫度計的原理 ^abc234
    - 出處：p.40
    - 類型：定義
    - 溫度計靠什麼原理？ :: 熱脹冷縮

> [!note] 加深的學習目標
> ## 溫度計
>
> - 能比較酒精與水銀溫度計的差異 ^xyz234
>     - 出處：p.41
>     - 類型：比較
>     - 為什麼**水銀**溫度計可以量較高溫？ :: 水銀**沸點高**

> [!note] 加進已有的學習目標（加深）
> - [[國二上自然 2-1#^abc234|能說出溫度計的原理]]
>     - 出處：p.40
>     - 溫度上升時液柱怎樣？ :: 上升
> - zzz999 別篇的目標
>     - 出處：p.40
>     - 題目？ :: 答案

> [!note]- 候選卡片（加深）
> - 能說出攝氏溫標的定點 ^qrs567
>     - 理由：課本只提一句
>     - 出處：p.42
>     - 類型：定義
>     - 攝氏 0 度是什麼？ :: 冰點
`);
  assert.equal(verifyAppend(DECK, out.text, batch, true), true);
  // 正式的目標不變，新的只在框裡。
  assert.deepEqual(parseDeck(out.text).targets.map(t => t.id), ['abc234']);
  assert.deepEqual(introBoxes(out.text).map(box => [box.title, box.items.length]), [['加深的學習目標', 1], ['加進已有的學習目標（加深）', 2], ['候選卡片（加深）', 1]]);
  assert.equal(idsInDeepenBoxes(out.text, batch.ids), true);
  // 驗得出被改過：框裡少一項、原本的目標被動到。
  assert.equal(verifyAppend(DECK, out.text.replace('> - 能說出攝氏溫標的定點 ^qrs567\n', ''), batch, true), false);
  assert.equal(verifyAppend(DECK, out.text.replace('熱脹冷縮', '熱漲冷縮'), batch, true), false);
});

void test('接法：換行符照原檔；沒有頂層備註框時另起一個放在這一批最前面；每次加深是新的一批', () => {
  const plain = DECK.replace('> [!note] 給家長的備註\n> - 原本的備註\n\n', '').replace(/\n/g, '\r\n');
  const found = inspectDeepen(REPLY, FORM, SUBJECT, HERE);
  const batch = composeBatch(found, '國二上自然 2-1', ids('xyz234', 'qrs567'), '2026-11-17');
  const out = appendBatch(plain, batch);
  assert.ok('text' in out);
  assert.equal(out.merged, false);
  assert.ok(!/[^\r]\n/.test(out.text), '全部是 \\r\\n');
  assert.ok(out.text.includes('熱脹冷縮\r\n\r\n> [!note] 給家長的備註\r\n> - 加深 2026-11-17：課本與講義說法一致\r\n\r\n> [!note] 加深的學習目標\r\n'));
  assert.equal(verifyAppend(plain, out.text, batch, false), true);
  // 第二次加深：舊框不併，另起一批。
  const second = composeBatch(inspectDeepen(REPLY, FORM, SUBJECT, HERE), '國二上自然 2-1', ids('mnp234', 'mnp567'), '2026-11-20');
  const again = appendBatch(out.text, second);
  assert.ok('text' in again);
  assert.deepEqual(introBoxes(again.text).filter(box => box.deepen).map(box => box.title), ['加深的學習目標', '加進已有的學習目標（加深）', '候選卡片（加深）', '加深的學習目標', '加進已有的學習目標（加深）', '候選卡片（加深）']);
  assert.equal(verifyAppend(out.text, again.text, second, false), true);
});

void test('擋下不寫：頂層有沒關的程式碼圍欄', () => {
  const broken = DECK + '\n```\nconsole.log(1)\n';
  assert.equal(unclosedFence(broken), true);
  assert.equal(unclosedFence(DECK + '\n```\nx\n```\n'), false);
  const batch = composeBatch(inspectDeepen(REPLY, FORM, SUBJECT, HERE), 'x', ids('xyz234', 'qrs567'), '2026-11-17');
  assert.deepEqual(appendBatch(broken, batch), { why: 'fence' });
});

void test('回覆裡沒有新內容：只寫「這一節目前沒有更深的內容」可以，什麼都沒有不行', () => {
  for (const reply of ['這一節目前沒有更深的內容。\n<<<完>>>', '> [!note] 給家長的備註\n> - 這一節目前沒有更深的內容\n\n<<<完>>>']) {
    const found = inspectDeepen(reply, FORM, SUBJECT, HERE);
    assert.deepEqual(found.errors, [], reply);
    assert.equal(found.nothing, true);
    const batch = composeBatch(found, 'x', ids(), '2026-11-17');
    assert.deepEqual([batch.boxes, batch.noteItems], [[], []]);
  }
  // 只有備註（不是那一句）照樣寫備註。
  const note = inspectDeepen('> [!note] 給家長的備註\n> - 這一節課本寫得很完整\n\n<<<完>>>', FORM, SUBJECT, HERE);
  assert.deepEqual(note.errors, []);
  assert.equal(note.counts.notes, 1);
  // 本文只有小標題、沒有任何內容。
  assert.ok(inspectDeepen('## 溫度計\n\n<<<完>>>', FORM, SUBJECT, HERE).errors.some(each => each.message.startsWith('回覆裡沒有新的內容')));
  // R3 的科目：全貌、架構照樣要。
  assert.ok(inspectDeepen('<<<卡組>>>\n這一節目前沒有更深的內容\n<<<完>>>', FORM, { subject: '自然', r3: true }, HERE).errors.some(each => each.message.includes('<<<全貌>>>')));
  assert.deepEqual(inspectDeepen('<<<全貌>>>\n全貌\n\n<<<架構>>>\n1. 溫度\n\n<<<卡組>>>\n這一節目前沒有更深的內容\n<<<完>>>', FORM, { subject: '自然', r3: true }, HERE).errors, []);
});

void test('認不得的引言框、沒有名稱的題目是錯誤；AI 自己寫的 ID 拿掉重配', () => {
  assert.ok(inspectDeepen('> [!tip] 小提醒\n> - 一句話\n\n<<<完>>>', FORM, SUBJECT, HERE).errors.some(each => each.message.includes('認不得的引言框「小提醒」')));
  const own = inspectDeepen(REPLY.replace('溫度計的差異', '溫度計的差異 ^k3m9qa'), FORM, SUBJECT, HERE);
  assert.deepEqual(own.errors, []);
  assert.equal(own.removed.length, 1);
  const batch = composeBatch(own, 'x', ids('xyz234', 'qrs567'), '2026-11-17');
  assert.ok(batch.boxes[0].includes('> - 能比較酒精與水銀溫度計的差異 ^xyz234'));
  assert.deepEqual(batch.edits, ['第 3 行 拿掉 ^k3m9qa']);
});

// --- §3-2 寫入的順序與中斷 ---

const JOB: DeepenJob = {
  kind: 'deepen', id: 'w7k2pq', copiedAt: '2026-11-17T09:00:00+08:00', copiedMs: Date.parse('2026-11-17T09:00:00+08:00'), deck: HERE.path, ids: ['abc234'], baseSha: sha256Hex(DECK),
  form: FORM, subject: { key: 'science', label: '自然', subject: '自然', r3: false },
  parts: [{ name: '通用規則', version: 'v1', text: '規則', sha256: sha256Hex('規則') }, { name: '任務段', version: '加深 v1', text: '任務', sha256: sha256Hex('任務') }],
  promptSha: 'p', stable: ['abc234'], sent: 1, save: null,
};
/** 直接製作收到的那一次（tasks/ai-direct.md §9）：快照照它寫 `接法: API` 與用量、費用、教材檔。 */
const EVIDENCE: DirectEvidence = {
  service: 'Gemini', requestedModel: 'gemini-3.8-flash', model: 'gemini-3.8-flash-001', reasoning: null, reasoningSent: null, receivedAt: '2026-11-17T09:01:00+08:00',
  usage: { input: 18_000, cacheRead: null, cacheWrite: null, output: 4_000, reasoning: null }, cost: { amount: 0.0123, estimated: true, asOf: '2026-11-01' },
  requestId: null, responseId: 'gem-1', files: [{ sha256: 'a'.repeat(64), pages: 4, name: '補充 講義.pdf' }], text: REPLY, sha256: sha256Hex(REPLY),
};
function started(job = JOB, api?: DirectEvidence): DeepenJob {
  const found = inspectDeepen(REPLY, FORM, SUBJECT, HERE);
  return beginDeepen(job, REPLY, api ? null : 'Claude', composeBatch(found, '國二上自然 2-1', ids('xyz234', 'qrs567'), '2026-11-17'), '2026-11-17T10:00:00+08:00', new Set(), api);
}
function fakeIo(files: Map<string, string>, options: { appendResult?: AppendWrite; after?: (text: string) => string } = {}) {
  const log: string[] = [];
  const stored: (DeepenJob | null)[] = [];
  const io: DeepenIo = {
    store(job) { stored.push(job); },
    remove() { stored.push(null); },
    read: path => Promise.resolve(files.get(path) ?? null),
    displaced: () => false,
    append(path, plan) {
      log.push('append');
      if (options.appendResult) return Promise.resolve(options.appendResult);
      const out = plan(files.get(path)!);
      if ('why' in out) return Promise.resolve({ kind: 'not', why: out.why });
      files.set(path, options.after ? options.after(out.text) : out.text);
      return Promise.resolve({ kind: 'written', confirmed: true });
    },
    create(path, text) {
      log.push('create ' + path);
      if (files.has(path)) return Promise.resolve({ kind: 'exists' });
      files.set(path, text);
      return Promise.resolve({ kind: 'done' });
    },
    names: () => new Set([...files.keys()].map(path => path.slice(path.lastIndexOf('/') + 1).replace(/\.md$/, '').toLowerCase())),
  };
  return { io, log, stored };
}

void test('快照：工作是加深、對象一項寫完整路徑、記穩目標是送出時的集合', () => {
  const job = started();
  assert.ok(isDeepenJob(job));
  const text = job.save!.snapshot;
  assert.match(text, /^工作: 加深$/m);
  assert.match(text, /^對象:\n {2}- "\[\[Essence Cards\/學業\/國二上\/自然\/國二上自然 2-1\.md\|國二上自然 2-1\]\]"$/m);
  assert.match(text, /^記穩目標:\n {2}- abc234$/m);
  assert.match(text, /^已有目標: 1$/m);
  assert.equal(job.save!.snapshotPath, 'Essence Cards/紀錄/AI 輸出/2026-11-17 國二上自然 2-1 加深.md');
  assert.match(beginDeepen({ ...JOB, stable: [] }, REPLY, null, { boxes: [], noteItems: [], ids: [], edits: [], snapshotBody: 'x' }, '2026-11-17T10:00:00+08:00', new Set()).save!.snapshot, /^記穩目標: 無$/m);
});

void test('L2 R7 快照寫上原有目標：複製時這一篇的目標 ID（照 ID 排序、去重）；一個都沒有時不寫', () => {
  const at = '2026-11-17T10:00:00+08:00', batch = { boxes: [], noteItems: [], ids: [], edits: [], snapshotBody: 'x' };
  const many = beginDeepen({ ...JOB, ids: ['def234', 'abc234', 'def234'] }, REPLY, null, batch, at, new Set()).save!.snapshot;
  assert.match(many, /^原有目標:\n {2}- abc234\n {2}- def234$/m);
  assert.doesNotMatch(beginDeepen({ ...JOB, ids: [] }, REPLY, null, batch, at, new Set()).save!.snapshot, /原有目標/);
});

void test('寫入順序：記 writing → 寫卡組 → 原文 → 快照 → 清掉；快照已經寫了就不動卡組', async () => {
  const files = new Map([[HERE.path, DECK]]);
  const { io, log, stored } = fakeIo(files);
  const job = started();
  assert.deepEqual(await runDeepen(job, io), { kind: 'done', wrote: true });
  assert.equal(stored[0]!.save!.writing, true);
  assert.equal(log[0], 'append');
  assert.ok(log.at(-1)!.endsWith('加深.md'));
  assert.equal(stored.at(-1), null);
  assert.equal(files.get(job.save!.snapshotPath), job.save!.snapshot);
  // 重開時恢復資料還在、快照已經寫了：直接清掉。
  const again = fakeIo(files);
  assert.deepEqual(await runDeepen({ ...job, save: { ...job.save!, writing: true } }, again.io), { kind: 'done', wrote: true });
  assert.deepEqual(again.log, []);
});

// 直接製作的快照（tasks/ai-direct.md §10 加深的例子）多了接法 API、用量、費用、教材檔：改名後照樣認得是同一份。
for (const [name, api] of [['複製貼上', undefined], ['接法 API', EVIDENCE]] as const) void test(`L2 R13 快照寫好、工作還在，之後改名改了快照的對象：恢復時認得是同一份，不再建一份；同識別碼有別的不同就停下（${name}）`, async () => {
  const files = new Map([[HERE.path, DECK]]);
  const job = started(JOB, api);
  assert.equal(job.save!.snapshot.includes('接法: API'), api !== undefined);
  assert.deepEqual(await runDeepen(job, fakeIo(files).io), { kind: 'done', wrote: true });
  const path = job.save!.snapshotPath;
  const done = { ...job, save: { ...job.save!, writing: true, written: true } };
  // 外掛改連結（只換對象那一行）、Obsidian 改連結（重排整個屬性區）。
  const moved = job.save!.snapshot.replace('國二上自然 2-1.md|國二上自然 2-1]]', '國二上自然 2-1 溫度.md|國二上自然 2-1 溫度]]');
  assert.notEqual(moved, job.save!.snapshot);
  const resorted = moved.replace(/^(日期: .*)\n(時間: .*)$/m, '$2\n$1');
  for (const text of [moved, resorted]) {
    files.set(path, text);
    const again = fakeIo(files);
    assert.deepEqual(await runDeepen(done, again.io), { kind: 'done', wrote: true });
    assert.deepEqual(again.log, []);
    assert.equal([...files.keys()].filter(each => each.includes('加深')).length, 1);
  }
  // 同一個識別碼、對象以外也不同：不往後加、不重發。
  files.set(path, moved.replace('已有目標: 1', '已有目標: 2'));
  const conflict = fakeIo(files);
  assert.deepEqual(await runDeepen(done, conflict.io), { kind: 'stop', why: 'conflict', detail: path });
  assert.equal([...files.keys()].filter(each => each.includes('加深')).length, 1);
  // 別的識別碼占了那個位置：照舊往後加。
  files.set(path, moved.replace(`識別碼: ${job.id}`, '識別碼: other1'));
  assert.deepEqual(await runDeepen(done, fakeIo(files).io), { kind: 'done', wrote: true });
  assert.ok(files.has(path.replace('加深.md', '加深 2.md')));
});

void test('寫入回呼裡重驗：複製時的 ID 不見了就不寫、拿掉 writing；沒有 ID 時比全文', async () => {
  const files = new Map([[HERE.path, DECK.replace(' ^abc234', ' ^zzz234')]]);
  const { io, stored } = fakeIo(files);
  assert.deepEqual(await runDeepen(started(), io), { kind: 'stop', why: 'changed' });
  assert.equal(stored.at(-1)!.save!.writing, false);
  const noIds = started({ ...JOB, ids: [] });
  assert.ok('why' in planAppend(noIds, DECK + 'x'));
  assert.ok('text' in planAppend(noIds, DECK));
  // 家長在中間加了字：照樣接在檔尾。
  assert.ok('text' in planAppend(started(), DECK.replace('熱脹冷縮', '熱脹冷縮\n    - 補一題 :: 答')));
});

void test('中斷：有 writing 的不再寫卡組；新 ID 都在加深框裡算寫好，否則結果不明，家長選當作完成才寫快照', async () => {
  const job = started();
  const written = appendBatch(DECK, job.save!);
  assert.ok('text' in written);
  const files = new Map([[HERE.path, written.text]]);
  const resumed = fakeIo(files);
  assert.deepEqual(await runDeepen({ ...job, save: { ...job.save!, writing: true } }, resumed.io), { kind: 'done', wrote: true });
  assert.ok(!resumed.log.includes('append'));

  const lost = new Map([[HERE.path, DECK]]);
  const stuck = fakeIo(lost);
  assert.deepEqual(await runDeepen({ ...job, save: { ...job.save!, writing: true } }, stuck.io), { kind: 'stop', why: 'unclear' });
  const unclear = stuck.stored.at(-1)!;
  assert.equal(unclear.save!.unclear, true);
  // 再按一次照樣停在結果不明，不會自己寫。
  assert.deepEqual(await runDeepen(unclear, stuck.io), { kind: 'stop', why: 'unclear' });
  assert.ok(!stuck.log.includes('append'));
  assert.deepEqual(await runDeepen(settleUnclear(unclear), stuck.io), { kind: 'done', wrote: true });
  assert.equal(lost.get(HERE.path), DECK);
});

void test('寫入後重讀驗不過、寫入逾時：結果不明', async () => {
  const files = new Map([[HERE.path, DECK]]);
  const changed = fakeIo(files, { after: text => text.replace('> - 能說出攝氏溫標的定點 ^qrs567\n', '') });
  assert.deepEqual(await runDeepen(started(), changed.io), { kind: 'stop', why: 'unclear' });
  const slow = fakeIo(new Map([[HERE.path, DECK]]), { appendResult: { kind: 'timeout' } });
  assert.deepEqual(await runDeepen(started(), slow.io), { kind: 'stop', why: 'timeout' });
  assert.equal(slow.stored.at(-1)!.save!.unclear, true);
});

void test('沒有要寫的（只有那一句）：不碰卡組，只寫原文與快照', async () => {
  const found = inspectDeepen('這一節目前沒有更深的內容\n<<<完>>>', FORM, SUBJECT, HERE);
  const job = beginDeepen(JOB, 'r', null, composeBatch(found, 'x', ids(), '2026-11-17'), '2026-11-17T10:00:00+08:00', new Set());
  const { io, log } = fakeIo(new Map([[HERE.path, DECK]]));
  assert.deepEqual(await runDeepen(job, io), { kind: 'done', wrote: false });
  assert.ok(!log.includes('append'));
});

void test('快照的位置被別人用了：往後加；讀到同一份就算寫好', async () => {
  const job = started();
  const files = new Map([[HERE.path, DECK], [job.save!.snapshotPath, '別人的']]);
  const { io } = fakeIo(files);
  assert.deepEqual(await runDeepen(job, io), { kind: 'done', wrote: true });
  assert.equal(files.get('Essence Cards/紀錄/AI 輸出/2026-11-17 國二上自然 2-1 加深 2.md'), job.save!.snapshot);
});

void test('恢復資料：同一篇只留一份（貼回過的優先）；還沒貼回的 14 天過期；壞的算 broken', () => {
  const now = JOB.copiedMs;
  const older = { ...JOB, id: 'a', copiedMs: now - 1000 };
  const saved = { ...started(), id: 'b', copiedMs: now - 2000 };
  const old = { ...JOB, id: 'c', deck: 'other.md', copiedMs: now - 15 * 86_400_000 };
  const read = readDeepenJobs([older, saved, old, { kind: 'deepen' }], now);
  assert.deepEqual(read.jobs.map(job => job.id), ['b']);
  assert.equal(read.broken, 1);
});

void test('§3-1 檔尾的各種樣子：沒有結尾換行、沒關的引言框、表格、接續行、只有屬性區；原本的字不動、驗得過', () => {
  const batch = composeBatch(inspectDeepen(REPLY, FORM, SUBJECT, HERE), '國二上自然 2-1', ids('xyz234', 'qrs567'), '2026-11-17');
  const head = '---\n年級學期: 國二上\n科目: 自然\n單元: 2-1 溫度\n狀態: 啟用\n---\n';
  const target = '\n- 能說出溫度計的原理 ^abc234\n    - 出處：p.40\n    - 溫度計靠什麼原理？ :: 熱脹冷縮';
  const tails = [
    head + target,
    head + target + '\n\n> [!tip] 家長的框\n> 還沒寫完',
    head + target + '\n\n| 溫標 | 冰點 |\n|---|---|\n| 攝氏 | 0 |',
    head + target + '\n  接續的一行   ',
    head,
    head + target + '\n\n\n   \n\t\n',
  ];
  for (const original of tails) {
    const out = appendBatch(original, batch);
    assert.ok('text' in out, original);
    const kept = original.replace(/(?:\n[ \t]*)+$/, '');
    assert.ok(out.text.startsWith(kept + '\n\n> [!note] 給家長的備註\n'), original);
    assert.ok(out.text.endsWith('>     - 攝氏 0 度是什麼？ :: 冰點\n'));
    assert.equal(verifyAppend(original, out.text, batch, false), true, original);
    assert.deepEqual(introBoxes(out.text).map(box => box.title), ['加深的學習目標', '加進已有的學習目標（加深）', '候選卡片（加深）'], original);
  }
  // 檔尾那一行本身行尾的空白不動。
  const spaced = appendBatch(head + target + '  ', batch);
  assert.ok('text' in spaced && spaced.text.includes('熱脹冷縮  \n\n> [!note]'));
});

void test('§3-2 中斷：新 ID 只剩一部分、或這一批沒有新 ID（只補題）都是結果不明', async () => {
  const job = started();
  const written = appendBatch(DECK, job.save!);
  assert.ok('text' in written);
  // 家長已經把候選刪掉：新 ID 只剩一個。
  const partial = new Map([[HERE.path, written.text.replace(/> - 能說出攝氏溫標的定點 \^qrs567\n(?:>.*\n)*/, '')]]);
  const first = fakeIo(partial);
  assert.deepEqual(await runDeepen({ ...job, save: { ...job.save!, writing: true } }, first.io), { kind: 'stop', why: 'unclear' });
  // 只補題：沒有新 ID，檔裡就算已經有同樣的題目也不當證據。
  const addsOnly = inspectDeepen('> [!note] 加進已有的學習目標\n> - abc234 能說出溫度計的原理\n>     - 出處：p.40\n>     - 溫度上升時液柱怎樣？ :: 上升\n\n<<<完>>>', FORM, SUBJECT, HERE);
  assert.deepEqual(addsOnly.errors, []);
  const only = beginDeepen(JOB, 'r', null, composeBatch(addsOnly, '國二上自然 2-1', ids(), '2026-11-17'), '2026-11-17T10:00:00+08:00', new Set());
  const appended = appendBatch(DECK, only.save!);
  assert.ok('text' in appended);
  const second = fakeIo(new Map([[HERE.path, appended.text]]));
  assert.deepEqual(await runDeepen({ ...only, save: { ...only.save!, writing: true } }, second.io), { kind: 'stop', why: 'unclear' });
  assert.ok(!second.log.includes('append'));
});

void test('§3-2 寫入回呼裡驗沒過（沒關的圍欄）：不寫、不留 writing；改好之後照常寫', async () => {
  const files = new Map([[HERE.path, DECK + '\n```\n']]);
  const { io, stored } = fakeIo(files);
  const job = started();
  assert.deepEqual(await runDeepen(job, io), { kind: 'stop', why: 'fence' });
  assert.equal(stored.at(-1)!.save!.writing, false);
  files.set(HERE.path, DECK);
  assert.deepEqual(await runDeepen(stored.at(-1)!, io), { kind: 'done', wrote: true });
});
