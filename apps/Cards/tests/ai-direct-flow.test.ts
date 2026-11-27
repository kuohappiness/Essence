import test from 'node:test';
import assert from 'node:assert/strict';
import { sse } from '../../../packages/ai-client/src/testing.ts';
import type { MockReply } from '../../../packages/ai-client/src/testing.ts';
import { directJob, rawPath, readJobs, readSnapshot, sha256Hex, sha256OfBytes } from '../src/core/ai/index.ts';
import type { Material } from '../src/core/connect/index.ts';
import { FAKE_KEY, form, lesson, load, ok, propsOf, reply, sent, SNAPSHOT, unauthorized, WORD } from './helpers/ai-direct.ts';

// 直接製作接上製卡流程（tasks/ai-direct.md §4～§6）：同一份提示加教材送出，收回的整段走貼回的同一條路；先存再送、一次一個、重送不重組。
// 製卡流程（src/obsidian/ai-cards.ts）＋真正的 createState＋記憶體 Files＋套件的假 fetch。畫面另外在 Windows 實機看。

void test('§4 驗收：直接製作收回的整段和貼回的一樣存成草稿；送出的提示和複製的一字不差，教材當附件、不帶檔名；先存工作再送', async t => {
  const pasted = await load(t, [ok(reply)], { direct: false });
  const copied = await pasted.cards.copy(form);
  assert.ok('job' in copied);
  assert.equal((await pasted.cards.save(copied.job, reply, null)).kind, 'done');

  let jobsWhenSent: unknown = null;
  const made = await load(t, [ok(reply)]);
  const outcome = await made.cards.direct(form, [lesson], event => { if (event.type === 'sent') jobsWhenSent = made.box.saved.jobs; });
  assert.equal(outcome.kind, 'received', JSON.stringify(outcome));
  assert.ok(outcome.kind === 'received');
  assert.equal(outcome.reply, reply);
  assert.equal(outcome.evidence.usage.input, 18_000);
  // 先存再送：送出的那一刻，這台電腦已經有這一份工作。
  assert.deepEqual((jobsWhenSent as { id: string }[] | null)?.map(job => job.id), [outcome.job.id]);
  const body = sent(made.fetch.requests[0].body);
  assert.equal(body.text, pasted.clipboard[0]);
  assert.deepEqual(body.files, ['application/pdf']);
  // §5（格式查核 F16）：教材說明沒填時不帶檔名，檔名可能帶孩子的名字，不送給 AI。
  assert.equal(outcome.job.form.material, '');
  assert.equal(made.fetch.requests[0].body?.includes('L3.pdf'), false);
  const inspection = made.cards.inspect(outcome.job, outcome.reply);
  assert.ok('errors' in inspection && !inspection.errors.length);
  assert.equal((await made.cards.save(outcome.job, outcome.reply, null)).kind, 'done');
  for (const path of [WORD, 'Essence Cards/學業/國二上/英文/國二上英文 L3 文法.md']) assert.equal(made.memory.texts.get(path), pasted.memory.texts.get(path), path);
  const body0 = (text: string | undefined) => text?.slice(text.indexOf('\n---\n') + 5);
  assert.equal(body0(made.memory.texts.get(SNAPSHOT)), body0(pasted.memory.texts.get(SNAPSHOT)), '快照本文相同');
  assert.deepEqual(made.cards.jobs(), []);
  assert.deepEqual(made.failures, []);
});

void test('§2、§4 送出前擋下（不建工作、不送出）：沒有金鑰、沒選教材、超過頁數、沒填單元；預覽寫出原因或會送出什麼', async t => {
  const none = await load(t, [ok(reply)], { key: { ok: false, why: 'unset' } });
  assert.deepEqual(none.cards.directPreview(form, [lesson]), { ok: false, reason: '先到設定頁的「AI 連線」選好這個服務的金鑰，才能直接製作。', settings: true });
  assert.deepEqual(await none.cards.direct(form, [lesson]), { kind: 'blocked', message: '先到設定頁的「AI 連線」選好這個服務的金鑰，才能直接製作。' });
  // 單元還空著也先說金鑰：「打開設定頁」不用等填完單元才出現（L2 第二輪）。
  assert.deepEqual(none.cards.directPreview({ ...form, unit: '' }, []), { ok: false, reason: '先到設定頁的「AI 連線」選好這個服務的金鑰，才能直接製作。', settings: true });
  const made = await load(t, [ok(reply)]);
  assert.deepEqual(made.cards.directPreview(form, []), { ok: false, reason: '先選這一課的教材檔（PDF 或照片）。' });
  assert.deepEqual(made.cards.directPreview({ ...form, unit: ' ' }, [lesson]), { ok: false, reason: '先填單元。' });
  assert.equal((await made.cards.direct(form, [{ ...lesson, pages: 31 }])).kind, 'blocked');
  const preview = made.cards.directPreview(form, [lesson]);
  assert.ok(preview?.ok);
  assert.match(preview.line, /^會送出：英文 L3\.pdf（12 頁）、規則與任務段約 [\d,]+ 字；送到 Gemini（Gemini 3\.8 Flash），約 US\$/);
  for (const each of [none, made]) {
    assert.deepEqual(each.cards.jobs(), []);
    assert.equal(each.fetch.requests.length, 0);
  }
  const phone = await load(t, [ok(reply)], { direct: false });
  assert.equal(phone.cards.directPreview(form, [lesson]), null);
  assert.equal(phone.cards.canDirect(), false);
});

void test('§6 送不成：留著工作、交給錯誤紀錄；重送用同一份提示與教材，成功後照常存；取消的不記', async t => {
  const made = await load(t, [unauthorized, ok(reply)]);
  const failed = await made.cards.direct(form, [lesson]);
  assert.equal(failed.kind, 'failed');
  assert.ok(failed.kind === 'failed');
  assert.deepEqual([failed.failure.kind, failed.failure.settings], ['auth', true]);
  assert.deepEqual(made.failures.map(failure => failure.kind), ['auth']);
  assert.deepEqual(made.cards.jobs().map(job => job.id), [failed.job.id]);
  const again = await made.cards.resend(failed.job);
  assert.equal(again.kind, 'received');
  assert.equal(made.fetch.requests[1].body, made.fetch.requests[0].body, '重送不重組');
  assert.ok(again.kind === 'received');
  assert.equal(again.job.id, failed.job.id);
  assert.equal((await made.cards.save(again.job, again.reply, null)).kind, 'done');
  assert.equal(JSON.stringify(made.box.saved).includes(FAKE_KEY), false, '金鑰不進這台電腦的存放');

  const slow = await load(t, [{ ...ok(reply), headersDelayMs: 5_000 }]);
  const pending = slow.cards.direct(form, [lesson]);
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(slow.cards.sending(), true);
  // 一次只送一個（§6 最後一點）。
  assert.deepEqual(await slow.cards.direct({ ...form, unit: 'L4 Jobs' }, [lesson]), { kind: 'blocked', message: '另一課正在送出，等它好了再按' });
  slow.cards.cancel();
  const cancelled = await pending;
  assert.ok(cancelled.kind === 'failed');
  assert.equal(cancelled.failure.kind, 'cancelled');
  assert.deepEqual(slow.failures, [], '取消的不記');
  assert.equal(slow.cards.sending(), false);
  assert.equal(slow.cards.jobs().length, 1, '取消之後工作還在，可以重送或改用複製貼上');
});

// §7（格式查核後定）：直接製作的快照屬性區、收到的回覆存進工作、改用複製貼上、改了字、重開之後接著存。
const PHOTO_BYTES = new Uint8Array([255, 216, 255, 1, 2]);
const photo: Material = { name: 'p41 照片.jpg', mediaType: 'image/jpeg', data: PHOTO_BYTES, pages: null, sha256: sha256OfBytes(PHOTO_BYTES) };
// 預期的雜湊另外用 Node 的 crypto 算過：[37, 80, 68, 70, 1, 2, 3] 與 [255, 216, 255, 1, 2]。
const LESSON_SHA = 'b483f692ba8534b23aa1da87bc1332195ed3cebdb2c2d9234e390528f07aa3e3';
const PHOTO_SHA = '055dfd15d4e238ff12497b7ec3680a797e1cb6a77871a42859cc763013b07d01';
/** Gemini 回報快取與思考的 token：套件的定義是輸入含快取、輸出含思考。 */
const rich = (text: string): MockReply => ({
  status: 200, headers: { 'content-type': 'text/event-stream' },
  chunks: [sse([
    { data: { candidates: [{ content: { parts: [{ text }], role: 'model' } }], modelVersion: 'gemini-3.8-flash-001', responseId: 'gem-7' } },
    { data: { candidates: [{ content: { parts: [], role: 'model' }, finishReason: 'STOP' }], usageMetadata: { promptTokenCount: 18_000, cachedContentTokenCount: 2_000, candidatesTokenCount: 4_000, thoughtsTokenCount: 1_500, totalTokenCount: 23_500 } } },
  ])],
});
/** 兩種接法都有、值也相同的欄（和複製貼上的快照比）。 */
const COMMON = ['日期', '時間', '識別碼', '工作', '對象', '規則版本', '送出', '提示雜湊', '回覆原文', '已有目標', '記穩目標'];
const STAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+08:00$/;

void test('§7 直接製作的快照：接法 API、服務名稱、要求與回報的模型、推理、五個用量、費用、編號、教材檔，照查核定的順序', async t => {
  const pasted = await load(t, [ok(reply)], { direct: false });
  const copied = await pasted.cards.copy(form);
  assert.ok('job' in copied);
  assert.equal((await pasted.cards.save(copied.job, reply, 'Gemini')).kind, 'done');
  const made = await load(t, [rich(reply)], { reasoning: 'high' });
  const outcome = await made.cards.direct(form, [lesson, photo]);
  assert.ok(outcome.kind === 'received', JSON.stringify(outcome));
  // 家長選的服務不寫：直接製作的哪一家由程式記。
  assert.equal((await made.cards.save(outcome.job, outcome.reply, 'Claude', undefined, true)).kind, 'done');
  const { props } = propsOf(made.memory);
  assert.deepEqual(Object.keys(props), [
    '日期', '時間', '識別碼', '工作', '對象', '規則版本', '送出', '提示雜湊', '回覆原文', '送出時間', '收到時間', '已有目標', '記穩目標',
    '教材檔', '接法', '服務', '要求的模型', '模型', '推理等級', '推理參數', '輸入用量', '快取讀取用量', '輸出用量', '推理用量', '費用', '費用來源', '牌價日期', '回應編號',
  ]);
  const copy = propsOf(pasted.memory).props;
  for (const key of COMMON) assert.deepEqual(props[key], copy[key], key);
  assert.equal(copy['複製時間'], '2026-11-07T10:02:11+08:00');
  assert.equal(props['送出時間'], copy['複製時間'], '送出時間在第一次按下的那一刻');
  assert.match(String(props['收到時間']), STAMP);
  assert.deepEqual(props['教材檔'], [`${LESSON_SHA} 12頁 英文 L3.pdf`, `${PHOTO_SHA} 圖 p41 照片.jpg`]);
  assert.deepEqual(
    [props['接法'], props['服務'], props['要求的模型'], props['模型'], props['推理等級'], props['推理參數'], props['輸入用量'], props['快取讀取用量'], props['輸出用量'], props['推理用量'], props['費用來源'], props['回應編號']],
    ['API', 'Gemini', 'gemini-3.8-flash', 'gemini-3.8-flash-001', 'high', 'high', 18_000, 2_000, 5_500, 1_500, '照牌價估計', 'gem-7'],
  );
  // 費用與牌價日期照目錄（會隨牌價更新）：寫的是數字、讀得回同一個值。
  assert.equal(props['費用'], outcome.evidence.cost?.amount);
  assert.ok(typeof props['費用'] === 'number' && props['費用'] > 0);
  assert.match(String(props['牌價日期']), /^\d{4}-\d{2}-\d{2}$/);
  // 沒有複製貼上的欄；`收到的回覆` 只在和輸入框交出的不同時寫。
  for (const key of ['複製時間', '收到的回覆', '請求編號', '快取寫入用量']) assert.equal(key in props, false, key);
  // 原文照舊只有送出的每一部分與回覆原文（收到的和交出的相同）。
  assert.equal(made.memory.texts.get(rawPath(sha256Hex(reply))), reply);
});

void test('§7 收到後改了字：回覆原文是交出的那一段，多寫收到的回覆，兩段都存進原文；改用複製貼上的沒有任何 API 欄', async t => {
  const edited = reply.replace('borrow :: 借入', 'borrow :: 借入、借來');
  const made = await load(t, [ok(reply)]);
  const outcome = await made.cards.direct(form, [lesson]);
  assert.ok(outcome.kind === 'received');
  assert.equal((await made.cards.save(outcome.job, edited, null, undefined, true)).kind, 'done');
  const { props } = propsOf(made.memory);
  assert.equal(props['回覆原文'], sha256Hex(edited));
  assert.equal(props['收到的回覆'], sha256Hex(reply));
  assert.deepEqual(Object.keys(props).slice(8, 12), ['回覆原文', '收到的回覆', '送出時間', '收到時間']);
  assert.equal(made.memory.texts.get(rawPath(sha256Hex(edited))), edited);
  assert.equal(made.memory.texts.get(rawPath(sha256Hex(reply))), reply);

  // 送不成之後改用複製貼上，貼回別處的回覆：工作有 api，存的時候沒說是收到的，就是複製貼上。
  const fallback = await load(t, [unauthorized]);
  const failed = await fallback.cards.direct(form, [lesson]);
  assert.ok(failed.kind === 'failed');
  assert.equal(directJob(fallback.cards.jobs()[0])?.state, 'failed');
  assert.equal((await fallback.cards.save(failed.job, reply, 'Gemini')).kind, 'done');
  const plain = propsOf(fallback.memory).props;
  assert.deepEqual([plain['接法'], plain['服務'], plain['模型'], plain['複製時間']], ['複製貼上', 'Gemini', '未記錄', '2026-11-07T10:02:11+08:00']);
  for (const key of ['送出時間', '收到時間', '教材檔', '要求的模型', '推理等級', '輸入用量', '費用', '回應編號']) assert.equal(key in plain, false, key);
});

void test('§6 收到的回覆檢查不過、改用複製貼上：工作改回一般的待貼回，重開之後也照複製貼上存，快照沒有 API 欄', async t => {
  const broken = `${reply}\n希望這些卡片有幫助`;
  const first = await load(t, [ok(broken)]);
  const outcome = await first.cards.direct(form, [lesson]);
  assert.ok(outcome.kind === 'received');
  const inspection = first.cards.inspect(outcome.job, outcome.reply);
  assert.ok(!('error' in inspection) && inspection.errors.length > 0, '檢查會擋');
  const plain = await first.cards.fallback(outcome.job);
  assert.ok(plain);
  assert.equal(first.clipboard.at(-1), outcome.job.parts.map(part => part.text).join('\n\n'), '同一份提示放進剪貼簿');
  assert.equal(directJob(first.cards.jobs()[0]), null);
  // 重開：存下的工作也沒有 api，清單照複製貼上的工作畫；家長貼的是別處的回覆。
  const again = await load(t, [], { box: first.box, memory: first.memory, direct: false });
  const [kept] = again.cards.jobs();
  assert.equal(kept.id, outcome.job.id);
  assert.equal('api' in kept, false);
  assert.equal((await again.cards.save(kept, reply, 'Claude')).kind, 'done');
  const props = propsOf(again.memory).props;
  assert.deepEqual([props['接法'], props['服務']], ['複製貼上', 'Claude']);
  for (const key of ['收到的回覆', '送出時間', '收到時間', '教材檔', '要求的模型', '輸入用量', '回應編號']) assert.equal(key in props, false, key);
});

void test('§7 OpenRouter：模型照回報的原樣（帶廠商前綴）、服務回報的費用 0 照寫、請求編號與回應編號各寫各的；推理照服務的預設寫「未指定」', async t => {
  const router: MockReply = {
    status: 200, headers: { 'content-type': 'application/json', 'x-request-id': '20261107' },
    chunks: [JSON.stringify({ id: 'gen-9', model: 'openai/gpt-5.6-terra', choices: [{ message: { content: reply }, finish_reason: 'stop' }], usage: { prompt_tokens: 900, completion_tokens: 300, cost: 0 } })],
  };
  const made = await load(t, [router], { provider: 'openrouter', model: 'openai/gpt-5.6-terra' });
  const outcome = await made.cards.direct(form, [lesson]);
  assert.ok(outcome.kind === 'received', JSON.stringify(outcome));
  assert.equal((await made.cards.save(outcome.job, outcome.reply, null, undefined, true)).kind, 'done');
  const { props, text } = propsOf(made.memory);
  assert.deepEqual(
    [props['服務'], props['要求的模型'], props['模型'], props['推理等級'], props['輸入用量'], props['輸出用量'], props['費用'], props['費用來源'], props['請求編號'], props['回應編號']],
    ['OpenRouter', 'openai/gpt-5.6-terra', 'openai/gpt-5.6-terra', '未指定', 900, 300, 0, '服務回報', '20261107', 'gen-9'],
  );
  for (const key of ['推理參數', '牌價日期', '快取讀取用量', '推理用量']) assert.equal(key in props, false, key);
  // 全是數字的請求編號照字串寫（YAML 加引號），讀回仍是字串。
  assert.match(text, /^請求編號: "20261107"$/m);
});

void test('§7 教材檔的檔名寫成單行：換行、控制字元換成空白，超過 200 字截斷；加深照樣讀得到這份快照', async t => {
  const odd = (name: string): Material => ({ ...lesson, name, pages: 2 });
  const names = ['A\n---\nB.pdf', ' 前後 空白 .pdf', '像雜湊 ' + 'f'.repeat(64) + '.pdf', '有 | 與 ]] 與 # 與 : 與 "引號".pdf', '長'.repeat(250) + '.pdf'];
  const made = await load(t, [ok(reply)]);
  const outcome = await made.cards.direct(form, names.map(odd));
  assert.ok(outcome.kind === 'received', JSON.stringify(outcome));
  assert.equal((await made.cards.save(outcome.job, outcome.reply, null, undefined, true)).kind, 'done');
  const { props, text } = propsOf(made.memory);
  const items = props['教材檔'] as string[];
  const split = items.map(item => /^([0-9a-f]{64}) (\d+頁|圖) (.*)$/s.exec(item));
  assert.ok(split.every(each => each !== null), items.join('\n'));
  assert.deepEqual(split.map(each => each[3]), ['A --- B.pdf', ' 前後 空白 .pdf', names[2], names[3], '長'.repeat(200)]);
  assert.ok(items.every(item => !item.includes('\n')));
  // 屬性區裡的 `---` 不會讓讀快照的一方提早切斷（外來字串都排在記穩目標之後，又是單行）。
  const info = readSnapshot(SNAPSHOT, text);
  assert.ok(info);
  assert.equal(info.id, props['識別碼']);
});

void test('§7、§6 收到了、還沒存就重開：回覆與證據還在工作裡，接著存成 API 的快照；收到回覆的不算進「最多 5 個」', async t => {
  const first = await load(t, [ok(reply)]);
  const outcome = await first.cards.direct(form, [lesson]);
  assert.ok(outcome.kind === 'received');
  // 重開：同一台的存放、同一個 vault，新的流程。
  let ms = Date.parse('2026-11-07T10:30:00+08:00');
  const again = await load(t, [], { box: first.box, memory: first.memory, direct: false, now: () => ms });
  const [kept] = again.cards.jobs();
  assert.equal(kept.id, outcome.job.id);
  assert.equal(directJob(kept)?.received?.text, reply);
  // 之後又複製了 5 份別的：收到回覆的那一份不被擠掉。
  for (const unit of ['L4', 'L5', 'L6', 'L7', 'L8']) { ms += 60_000; assert.ok('job' in await again.cards.copy({ ...form, unit })); }
  assert.equal(again.cards.jobs().length, 6);
  assert.equal(readJobs(first.box.saved.jobs, ms).jobs.some(job => job.id === kept.id), true);
  assert.equal((await again.cards.save(kept, reply, null, undefined, true)).kind, 'done');
  assert.equal(propsOf(again.memory).props['接法'], 'API');
});

void test('§7 讀壞的 api：工作的 api 讀不懂就當成複製貼上的工作（不進 broken）；恢復資料的證據讀不懂就不寫快照、停下來', async t => {
  const made = await load(t, [ok(reply)]);
  const outcome = await made.cards.direct(form, [lesson]);
  assert.ok(outcome.kind === 'received');
  const saved = made.box.saved.jobs as Record<string, unknown>[];
  const at = Date.parse('2026-11-07T10:03:00+08:00');
  // 之後的版本加了新的狀態或欄位：多的欄不管。
  const newer = saved.map(job => ({ ...job, api: { ...(job.api as object), state: 'queued', extra: 1 } }));
  assert.equal(directJob(readJobs(newer, at).jobs[0])?.state, 'queued');
  const broken = saved.map(job => ({ ...job, api: { state: 7 } }));
  const read = readJobs(broken, at);
  assert.deepEqual([read.jobs.length, read.broken], [1, 0]);
  assert.equal(directJob(read.jobs[0]), null);

  // 開始存草稿、還沒寫快照就停下（原文讀不到），之後證據被較新的版本存成讀不懂的樣子：接著存時不寫快照、停下來，工作留著。
  const later = await load(t, [ok(reply)]);
  const direct = await later.cards.direct(form, [lesson]);
  assert.ok(direct.kind === 'received');
  later.memory.failing.add(rawPath(sha256Hex(reply)));
  assert.equal((await later.cards.save(direct.job, direct.reply, null, undefined, true)).kind, 'stop');
  later.memory.failing.clear();
  later.box.saved.jobs = (later.box.saved.jobs as Record<string, unknown>[]).map(job => ({ ...job, save: { ...(job.save as object), api: { provider: 1 } } }));
  const reopened = await load(t, [], { box: later.box, memory: later.memory, direct: false });
  const [stuck] = reopened.cards.jobs();
  assert.ok(stuck.save);
  assert.deepEqual(await reopened.cards.resume(stuck), { kind: 'stop', message: '這份草稿是較新的版本存的，請更新外掛' });
  assert.equal(reopened.memory.texts.has(SNAPSHOT), false);
  assert.equal(reopened.cards.jobs().length, 1);
});

void test('§8 送不成的錯誤紀錄：種類與套件的訊息、服務、要求的模型、狀態碼、請求編號、送了幾次；不寫金鑰、提示與檔名', async t => {
  const busy: MockReply = { status: 503, headers: { 'content-type': 'application/json', 'retry-after': '0' }, chunks: [JSON.stringify({ error: { code: 503, message: 'The model is overloaded.', status: 'UNAVAILABLE' } })] };
  const made = await load(t, [unauthorized, busy, busy, busy]);
  const secretName: Material = { ...lesson, name: '小明的英文 L3.pdf' };
  assert.equal((await made.cards.direct(form, [secretName])).kind, 'failed');
  const [job] = made.cards.jobs();
  assert.equal((await made.cards.resend(job)).kind, 'failed');
  assert.equal(made.logs.length, 2);
  const [auth, overloaded] = made.logs;
  assert.match(auth.msg, /^auth: /);
  assert.deepEqual({ ...auth, msg: '' }, { msg: '', service: 'Gemini', model: 'gemini-3.8-flash', status: 400, requestId: null, attempts: 1 });
  assert.match(overloaded.msg, /^overloaded: /);
  assert.deepEqual([overloaded.status, overloaded.attempts], [503, 3]);
  const text = JSON.stringify(made.logs);
  for (const secret of [FAKE_KEY, '小明', 'L3.pdf', '任務段']) assert.equal(text.includes(secret), false, secret);
});

void test('L2 第一輪 R8 記得的教材檔：存成草稿或放棄之後就忘掉（不再重送，不留在記憶體）', async t => {
  const made = await load(t, [ok(reply), unauthorized]);
  const received = await made.cards.direct(form, [lesson]);
  assert.ok(received.kind === 'received');
  assert.equal(made.cards.keeps(received.job), true);
  assert.equal((await made.cards.save(received.job, received.reply, null, undefined, true)).kind, 'done');
  assert.equal(made.cards.keeps(received.job), false);
  const failed = await made.cards.direct({ ...form, unit: 'L4 Food' }, [lesson]);
  assert.ok(failed.kind === 'failed');
  assert.equal(made.cards.keeps(failed.job), true);
  await made.cards.abandon(failed.job);
  assert.equal(made.cards.keeps(failed.job), false);
});

void test('L2 第二輪 S2 收到的回覆重送沒成功：收到的那一份留著、存得回去（接法 API）；重送中與失敗後都不被擠出「最多 5 個」（R13）', async t => {
  let ms = Date.parse('2026-11-07T10:02:11+08:00');
  const made = await load(t, [ok(reply), unauthorized], { now: () => ms });
  const received = await made.cards.direct(form, [lesson]);
  assert.ok(received.kind === 'received');
  for (const unit of ['L4', 'L5', 'L6', 'L7', 'L8']) { ms += 60_000; assert.ok('job' in await made.cards.copy({ ...form, unit })); }
  const failed = await made.cards.resend(received.job);
  assert.ok(failed.kind === 'failed', JSON.stringify(failed));
  const kept = made.cards.jobs().find(job => job.id === received.job.id);
  assert.ok(kept, '沒被擠出清單');
  assert.deepEqual([directJob(kept)?.state, directJob(kept)?.received?.text], ['failed', reply]);
  assert.equal(readJobs(made.box.saved.jobs, ms).jobs.some(job => job.id === kept.id), true, '存放裡也還在');
  assert.equal((await made.cards.save(kept, reply, null, undefined, true)).kind, 'done');
  assert.equal(propsOf(made.memory).props['接法'], 'API');
});

void test('L2 第二輪 S4 拿到回應之後才取消：工作標 charged，重開後的「重送」照樣寫會再計費', async t => {
  const made = await load(t, [{ ...ok(reply), delayMs: 5_000 }]);
  const pending = made.cards.direct(form, [lesson]);
  await new Promise(resolve => setTimeout(resolve, 30));
  made.cards.cancel();
  const cancelled = await pending;
  assert.ok(cancelled.kind === 'failed' && cancelled.failure.kind === 'cancelled');
  assert.equal(directJob(made.cards.jobs()[0])?.charged, true);
});
