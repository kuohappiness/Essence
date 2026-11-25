// 比較測試工具的生成（tasks/rule-test-tool.md §4-2 有效原稿、多步，§5-4 事件、佇列、額度、斷路器、行程鎖、手貼，§5-6 切法）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { inspectReply, type CardForm, type ExistingNow } from '../src/core/ai/index.ts';
import { claudeAdapter, type Adapter, type StepRequest } from '../tools/rule-test/adapters.ts';
import { blindFolder } from '../tools/rule-test/blind.ts';
import { cutDeck, validity } from '../tools/rule-test/deck-cut.ts';
import { openFolder, type Folder } from '../tools/rule-test/folder.ts';
import { freezeFolder, readFrozenSteps } from '../tools/rule-test/freeze.ts';
import { acquireLock, runQueue, savePasted, writeManual } from '../tools/rule-test/generate.ts';
import { appendEvent, jobState, planJobs, readEvents, reopenFailed } from '../tools/rule-test/jobs.ts';
import { RUBRIC } from './helpers/rule-test.ts';

const DECK = '<<<全貌>>>\n全貌\n<<<架構>>>\n架構\n<<<卡組>>>\n國二上英文 L3 單字\n- borrow 英翻中\n    - borrow :: 借入\n<<<完>>>';

void test('切卡組段：三段的只留卡組到最後一個完；外層程式碼框只拿掉頭尾一行；不分段的整份留', () => {
  assert.deepEqual(cutDeck('````markdown\n' + DECK + '\n````\n說明', true), { ok: true, deck: '國二上英文 L3 單字\n- borrow 英翻中\n    - borrow :: 借入\n' });
  assert.deepEqual(cutDeck('````markdown\r\n- a\r\n    - q :: a\r\n<<<完>>>\r\n````\r\n', false), { ok: true, deck: '- a\n    - q :: a\n' });
  // 卡組段裡的程式碼區塊不是外層的框：只看頭尾一行。
  assert.deepEqual(cutDeck('- a\n    ```\n    x\n    ```\n<<<完>>>', false), { ok: true, deck: '- a\n    ```\n    x\n    ```\n' });
  assert.deepEqual(cutDeck('<<<全貌>>>\n只有全貌\n<<<完>>>', true), { ok: false, why: '找不到 <<<卡組>>>' });
});

void test('切卡組段和外掛認的卡組段同一個範圍（§8 第 8 條）：格式沒錯時，切出的行就是 inspectReply 每篇涵蓋的行；兩個完的切到最後一個', () => {
  const form: CardForm = { subject: 'english', term: '國二上', unit: 'L3', purpose: '準備段考', supplement: false, pick: false, adjust: '', material: '' };
  const none = (): ExistingNow => ({ kind: 'none' });
  const three = '<<<全貌>>>\n全貌\n<<<架構>>>\n架構\n<<<卡組>>>\n國二上英文 L3 單字\n- borrow 英翻中\n    - borrow :: 借入\n\n國二上英文 L3 文法\n- 現在完成式的用法\n    - I ==have== lived here. :: 現在完成式\n<<<完>>>\n';
  const flat = '國二上英文 L3 單字\n- borrow 英翻中\n    - borrow :: 借入\n<<<完>>>\n';
  for (const [reply, r3] of [[three, true], [flat, false]] as const) {
    const inspection = inspectReply(reply, form, { subject: '英文', r3 }, [], none);
    assert.deepEqual(inspection.errors, []);
    const lines = reply.split('\n');
    const covered = inspection.pieces.flatMap(piece => [...piece.line === null ? [] : [piece.line], ...piece.lines].map(i => lines[i])).filter(line => line.trim());
    const cut = cutDeck(reply, r3);
    assert.ok(cut.ok);
    assert.deepEqual(cut.deck.split('\n').filter(line => line.trim()), covered);
  }
  // 兩個完是格式錯誤（外掛停在第一個）；評內容照第一輪切到最後一個。
  const twice = three.replace('<<<架構>>>', '<<<完>>>\n<<<架構>>>');
  assert.deepEqual(cutDeck(twice, true), { ok: true, deck: twice.slice(twice.indexOf('國二上英文 L3 單字'), twice.lastIndexOf('<<<完>>>')) });
});

void test('有效原稿：有 <<<完>>>、卡組段不是空的；不是卡組的步驟只要不是空的', () => {
  assert.deepEqual(validity(DECK, true, true), { valid: true, why: null });
  assert.deepEqual(validity(DECK.replace('<<<完>>>', ''), true, true), { valid: false, why: '沒有 <<<完>>>' });
  assert.deepEqual(validity('<<<全貌>>>\nx\n<<<卡組>>>\n\n<<<完>>>', true, true), { valid: false, why: '卡組段是空的' });
  assert.deepEqual(validity('第一段的清單\n<<<第一段完>>>', false, true), { valid: true, why: null });
  assert.deepEqual(validity('  \n', false, true), { valid: false, why: '回覆是空的' });
});

/** 自備提示的測試資料夾（不用 git 的檔案來源），凍結好。 */
async function frozenFolder(groups: string, generators: string, concurrency = 1): Promise<Folder> {
  const root = mkdtempSync(join(tmpdir(), 'rule-test-gen-folder-'));
  mkdirSync(join(root, '課', 'L3'), { recursive: true });
  writeFileSync(join(root, '課', 'L3', '教材.pdf'), '%PDF-1.4 假的');
  mkdirSync(join(root, '提示'));
  for (const name of ['甲', '乙', '一', '二']) writeFileSync(join(root, '提示', `${name}.md`), name === '二' ? '組二第二步：前一步是「{{A.1}}」' : `組${name}\n\n{{任務段}}`);
  writeFileSync(join(root, '測試.yaml'), `
名稱: 生成測試
課庫: 課
同時: ${String(concurrency)}
課: [{ 代號: L3, 表單: { 科目: english, 年級學期: 國二上, 單元: L3 } }]
組:
${groups}
生成:
${generators}
評審: [{ 評審: codex, 模型: a }, { 評審: claude, 模型: b }]
門檻: { 基準: 甲, 候選: [乙], 生成器: [claude], 收益: [{ 指標: 規則字數, 至少: 1% }] }
`);
  await freezeFolder(openFolder(root), { log: () => {} });
  return openFolder(root);
}
const TWO_GROUPS = '  - { 名稱: 甲, 規則: { 自備: { L3: 甲.md } } }\n  - { 名稱: 乙, 規則: { 自備: { L3: 乙.md } } }';

/** 假的轉接器：照提示開頭的組名回覆；記下每一次的請求。 */
function fake(reply: (request: StepRequest, n: number) => Awaited<ReturnType<Adapter>>): { adapter: Adapter; requests: StepRequest[] } {
  const requests: StepRequest[] = [];
  return {
    requests,
    adapter: request => { requests.push(request); request.record('{"type":"result"}', ''); return Promise.resolve(reply(request, requests.length)); },
  };
}
const ok = (text: string, session = 's1'): Awaited<ReturnType<Adapter>> => ({ kind: 'ok', reply: text, session, warnings: [], ms: 5, models: ['claude-opus-5-5'] });

void test('生成：每組每份一個新對話、附 PDF；無效原稿照記並自動補一份；原稿與事件都留著', async () => {
  const folder = await frozenFolder(TWO_GROUPS, '  - { 生成器: claude, 模型: claude-opus-5-5, 份數: 2 }');
  const { adapter, requests } = fake((request, n) => request.text.startsWith('組乙') && n === 3 ? ok('沒有結尾的回覆') : ok(DECK));
  await runQueue(folder, { adapters: { claude: adapter }, log: () => {} });
  const events = readEvents(folder);
  const jobs = planJobs(folder, readFrozenSteps(folder), events);
  assert.deepEqual(jobs.map(job => [job.key, jobState(events, job.key).status]), [
    ['甲-L3-claude-1', 'done'], ['甲-L3-claude-2', 'done'],
    ['乙-L3-claude-1', 'invalid'], ['乙-L3-claude-2', 'done'], ['乙-L3-claude-3', 'done'],
  ]);
  assert.equal(requests.length, 5);
  assert.ok(requests.every(request => request.pdf?.toString() === '%PDF-1.4 假的' && request.resume === null && request.model === 'claude-opus-5-5'));
  assert.equal(readFileSync(join(folder.root, '生成', '原稿', '乙-L3-claude-1.md'), 'utf8'), '沒有結尾的回覆');
  assert.deepEqual(events.find(event => event.type === 'invalid')?.detail, { why: ['沒有 <<<完>>>'] });
  assert.equal(readdirSync(join(folder.root, '生成', '原稿')).length, 5);
  assert.ok(!existsSync(join(folder.root, '生成', '執行中.json')));
});

void test('多步：同一個對話接著說（resume、不再附 PDF），{{A.1}} 代入前一步的回覆；卡組步驟各自存原稿', async () => {
  const groups = '  - { 名稱: 甲, 規則: { 自備: { L3: 甲.md } } }\n  - { 名稱: 乙, 步驟: [{ 對話: A, 規則: { 自備: { L3: 一.md } }, 卡組: 否 }, { 對話: A, 規則: { 自備: { L3: 二.md } }, 卡組: 是 }] }';
  const folder = await frozenFolder(groups, '  - { 生成器: claude, 模型: claude-opus-5-5, 份數: 1 }');
  const { adapter, requests } = fake(request => request.text.startsWith('組一') ? ok('第一步的清單', 'conv-1') : ok(DECK, 'conv-1'));
  await runQueue(folder, { adapters: { claude: adapter }, log: () => {} });
  const second = requests.find(request => request.text.startsWith('組二'))!;
  assert.equal(second.text, '組二第二步：前一步是「第一步的清單」');
  assert.equal(second.resume, 'conv-1');
  assert.equal(second.pdf, null);
  assert.deepEqual(readdirSync(join(folder.root, '生成', '原稿')).sort(), ['乙-L3-claude-1-1.md', '乙-L3-claude-1-2.md', '甲-L3-claude-1.md']);
  assert.equal(jobState(readEvents(folder), '乙-L3-claude-1').status, 'done');
});

void test('多步的後一步失敗：那一步開新的對話時，重跑從那一步接著做（沿用前一步的回覆、記下沿用哪一次）；接著同一個對話的從頭來', async () => {
  const groups = [
    '  - { 名稱: 甲, 步驟: [{ 對話: A, 規則: { 自備: { L3: 一.md } }, 卡組: 否 }, { 對話: B, 規則: { 自備: { L3: 二.md } }, 卡組: 是 }] }',
    '  - { 名稱: 乙, 步驟: [{ 對話: A, 規則: { 自備: { L3: 一.md } }, 卡組: 否 }, { 對話: A, 規則: { 自備: { L3: 二.md } }, 卡組: 是 }] }',
  ].join('\n');
  const folder = await frozenFolder(groups, '  - { 生成器: claude, 模型: claude-opus-5-5, 份數: 1 }');
  let second = 0;
  const { adapter, requests } = fake(request => request.text.startsWith('組一') ? { ...ok('第一步的清單'), ms: 7 } : ++second % 2 ? { kind: 'timeout', message: '睡過頭' } : ok(DECK));
  await runQueue(folder, { adapters: { claude: adapter }, log: () => {} });
  assert.deepEqual(requests.map(request => request.text.slice(0, 2)), ['組一', '組二', '組二', '組一', '組二', '組一', '組二']);
  // 甲：第二步是另一個對話，第二次只送第二步，帶著第一次的第一步回覆、附 PDF。
  assert.equal(requests[2].text, '組二第二步：前一步是「第一步的清單」');
  assert.equal(requests[2].resume, null);
  assert.ok(requests[2].pdf !== null);
  const events = readEvents(folder);
  const reused = events.find(event => event.job === '甲-L3-claude-1' && event.attempt === 2 && event.step === 1);
  assert.deepEqual([reused?.type, reused?.detail?.reused, reused?.detail?.ms], ['step', 1, 7]);
  assert.equal(readFileSync(join(folder.root, '生成', '嘗試', '甲-L3-claude-1-2', '1.md'), 'utf8'), '第一步的清單');
  // 乙：第二步接著同一個對話，第二次從第一步重來（中斷過的對話不等於沒中斷的）。
  assert.equal(requests[5].resume, null);
  assert.equal(requests[6].resume, 's1');
  assert.deepEqual(['甲-L3-claude-1', '乙-L3-claude-1'].map(key => jobState(events, key).status), ['done', 'done']);
});

void test('同時跑兩份：兩份一起在跑，事件檔每一行都完整', async () => {
  const folder = await frozenFolder(TWO_GROUPS, '  - { 生成器: claude, 模型: claude-opus-5-5, 份數: 3 }', 2);
  let running = 0, most = 0;
  const adapter: Adapter = async request => {
    most = Math.max(most, ++running);
    await new Promise(resolve => setTimeout(resolve, 5));
    running--;
    request.record('{"type":"result"}', '');
    return ok(DECK);
  };
  await runQueue(folder, { adapters: { claude: adapter }, log: () => {} });
  assert.equal(most, 2);
  const lines = readFileSync(join(folder.root, '生成', '事件.jsonl'), 'utf8').split('\n').filter(Boolean);
  const parsed = lines.map(line => JSON.parse(line) as { type: string });
  assert.deepEqual(['start', 'done'].map(type => parsed.filter(event => event.type === type).length), [6, 6]);
});

void test('匿名時多步的把卡組步驟的卡組段照順序接起來（§8 第 8 條）', async () => {
  const groups = '  - { 名稱: 甲, 規則: { 自備: { L3: 甲.md } } }\n  - { 名稱: 乙, 步驟: [{ 對話: A, 規則: { 自備: { L3: 一.md } }, 卡組: 是 }, { 對話: B, 規則: { 自備: { L3: 二.md } }, 卡組: 是 }] }';
  const folder = await frozenFolder(groups, '  - { 生成器: claude, 模型: claude-opus-5-5, 份數: 1 }');
  const three = new Map(readFrozenSteps(folder).map(step => [`${step.group}-${String(step.step)}`, step.threeSections]));
  const deck = (word: string, sections: boolean): string => `${sections ? '<<<全貌>>>\n全貌\n<<<架構>>>\n架構\n<<<卡組>>>\n' : ''}國二上英文 L3 單字\n- ${word} 英翻中\n    - ${word} :: 意思\n<<<完>>>`;
  const { adapter } = fake(request => request.text.startsWith('組一') ? ok(deck('borrow', three.get('乙-1')!)) : request.text.startsWith('組二') ? ok(deck('lend', three.get('乙-2')!)) : ok(deck('keep', three.get('甲-1')!)));
  await runQueue(folder, { adapters: { claude: adapter }, log: () => {} });
  writeFileSync(join(folder.root, '課', 'L3', '評分表.md'), RUBRIC);
  const batch = blindFolder(folder, { log: () => {} });
  const code = batch.entries.find(entry => entry.group === '乙')!.code;
  assert.equal(readFileSync(join(folder.root, '評分', '批1', '卡組', 'L3', `${code}.md`), 'utf8'),
    '國二上英文 L3 單字\n- borrow 英翻中\n    - borrow :: 意思\n\n國二上英文 L3 單字\n- lend 英翻中\n    - lend :: 意思\n');
});

void test('額度用完：整個佇列停下、記下重置時間、不重試；下一次開跑接著做沒做完的', async () => {
  const folder = await frozenFolder(TWO_GROUPS, '  - { 生成器: claude, 模型: claude-opus-5-5, 份數: 1 }');
  const quota = fake(() => ({ kind: 'quota', message: '額度用完', resetsAt: 1_800_000_000 }));
  await runQueue(folder, { adapters: { claude: quota.adapter }, log: () => {} });
  assert.equal(quota.requests.length, 1);
  const events = readEvents(folder);
  assert.deepEqual(events.filter(event => event.type === 'quota' || event.type === 'stop').map(event => [event.type, event.detail?.resetsAt ?? event.detail?.reason]), [['quota', 1_800_000_000], ['stop', '額度用完']]);
  const after = fake(() => ok(DECK));
  await runQueue(folder, { adapters: { claude: after.adapter }, log: () => {} });
  assert.equal(after.requests.length, 2);
  assert.ok(planJobs(folder, readFrozenSteps(folder), readEvents(folder)).every(job => jobState(readEvents(folder), job.key).status === 'done'));
});

void test('斷路器：連續 3 份失敗就停；同一份最多試 3 次', async () => {
  const folder = await frozenFolder(TWO_GROUPS, '  - { 生成器: claude, 模型: claude-opus-5-5, 份數: 2 }');
  const failing = fake(() => ({ kind: 'fail', message: '壞了' }));
  await runQueue(folder, { adapters: { claude: failing.adapter }, log: () => {} });
  assert.equal(failing.requests.length, 3);
  assert.equal(readEvents(folder).at(-1)?.detail?.reason, '連續 3 份失敗');
  // 沒登入這類重試也沒用的錯誤：第一份就停。
  const fatal = fake(() => ({ kind: 'fatal', message: 'claude 沒有登入' }));
  await runQueue(folder, { adapters: { claude: fatal.adapter }, log: () => {} });
  assert.equal(fatal.requests.length, 1);
  // 試滿 3 次的那一份停在 failed，不再開。
  for (let i = 0; i < 3; i++) {
    appendEvent(folder, { type: 'start', job: '甲-L3-claude-2' });
    appendEvent(folder, { type: 'timeout', job: '甲-L3-claude-2' });
  }
  assert.equal(jobState(readEvents(folder), '甲-L3-claude-2').status, 'failed');
});

void test('再試放棄的工作（--retry）：只重開放棄的、記一筆事件、再給 3 次；嘗試的號碼接著算，前幾次的紀錄留著', async () => {
  const folder = await frozenFolder(TWO_GROUPS, '  - { 生成器: claude, 模型: claude-opus-5-5, 份數: 1 }');
  const failing = fake(() => ({ kind: 'timeout', message: '睡過頭' }));
  for (let i = 0; i < 3; i++) await runQueue(folder, { adapters: { claude: failing.adapter }, log: () => {} });
  assert.deepEqual(['甲-L3-claude-1', '乙-L3-claude-1'].map(key => jobState(readEvents(folder), key).status), ['failed', 'failed']);
  appendEvent(folder, { type: 'start', job: '乙-L3-claude-1', attempt: 4 });
  appendEvent(folder, { type: 'done', job: '乙-L3-claude-1', attempt: 4 });
  assert.deepEqual(reopenFailed(folder, ['甲-L3-claude-1', '乙-L3-claude-1']), ['甲-L3-claude-1']);
  assert.deepEqual(readEvents(folder).filter(event => event.type === 'reopen').map(event => event.job), ['甲-L3-claude-1']);
  assert.equal(jobState(readEvents(folder), '甲-L3-claude-1').status, 'retry');
  const { adapter, requests } = fake(() => ok(DECK));
  await runQueue(folder, { adapters: { claude: adapter }, log: () => {} });
  assert.equal(requests.length, 1);
  assert.equal(jobState(readEvents(folder), '甲-L3-claude-1').status, 'done');
  assert.deepEqual(readdirSync(join(folder.root, '生成', '嘗試')).filter(name => name.startsWith('甲')).sort(), ['甲-L3-claude-1-1', '甲-L3-claude-1-2', '甲-L3-claude-1-3', '甲-L3-claude-1-4']);
  // 重開後又試滿 3 次，再停在放棄。
  appendEvent(folder, { type: 'reopen', job: '乙-L3-claude-1' });
  for (let i = 0; i < 3; i++) {
    appendEvent(folder, { type: 'start', job: '乙-L3-claude-1' });
    appendEvent(folder, { type: 'fail', job: '乙-L3-claude-1' });
  }
  assert.deepEqual(jobState(readEvents(folder), '乙-L3-claude-1'), { status: 'failed', attempts: 7, last: readEvents(folder).at(-1) });
});

void test('行程鎖：另一個還在跑就停下；上一次的行程已經不在時，跑到一半的工作記成中斷、可以重跑', async () => {
  const folder = await frozenFolder(TWO_GROUPS, '  - { 生成器: claude, 模型: claude-opus-5-5, 份數: 1 }');
  const other = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 20000)']);
  try {
    mkdirSync(join(folder.root, '生成'), { recursive: true });
    writeFileSync(join(folder.root, '生成', '執行中.json'), JSON.stringify({ pid: other.pid, command: 'generate', started: 'x' }));
    assert.throws(() => acquireLock(folder, 'generate'), /已經有一個 generate 在跑/);
  } finally { other.kill(); }
  await new Promise(done => other.on('exit', done));
  appendEvent(folder, { type: 'start', job: '甲-L3-claude-1', attempt: 1 });
  const release = acquireLock(folder, 'generate');
  release();
  const state = jobState(readEvents(folder), '甲-L3-claude-1');
  assert.equal(state.status, 'retry');
  assert.equal(state.last?.type, 'interrupted');
});

void test('手貼：說明寫清楚服務、模型、PDF 與順序；貼回一步一步存，後一步的提示等前一步貼回才產生', async () => {
  const groups = '  - { 名稱: 甲, 規則: { 自備: { L3: 甲.md } } }\n  - { 名稱: 乙, 步驟: [{ 對話: A, 規則: { 自備: { L3: 一.md } }, 卡組: 否 }, { 對話: A, 規則: { 自備: { L3: 二.md } }, 卡組: 是 }] }';
  const folder = await frozenFolder(groups, '  - { 生成器: claude, 模型: m, 份數: 1, 課: [] }\n  - { 生成器: 手貼, 服務: ChatGPT, 模型: GPT-6.2 Thinking, 份數: 1 }');
  const job = planJobs(folder, readFrozenSteps(folder), readEvents(folder)).find(each => each.key === '乙-L3-ChatGPT-1')!;
  const guide = readFileSync(writeManual(folder, job), 'utf8');
  assert.match(guide, /服務：ChatGPT/);
  assert.match(guide, /1\. 新對話，附 PDF：複製 凍結\/提示\/乙-L3-1\.md 的全文/);
  assert.match(guide, /2\. 同一個對話接著：生成時才產生：貼回 A\.1 之後，複製 生成\/手貼\/乙-L3-ChatGPT-1-2\.md/);
  assert.throws(() => savePasted(folder, job, 2, DECK), /要先貼第 1 步/);
  const notes = savePasted(folder, job, 1, '第一步的清單');
  assert.equal(readFileSync(join(folder.root, '生成', '手貼', '乙-L3-ChatGPT-1-2.md'), 'utf8'), '組二第二步：前一步是「第一步的清單」');
  assert.match(notes[0], /第 2 步的提示/);
  // 等使用者貼第二步時又開了一次自動的生成：手貼的不是背景行程在跑的，不記成中斷（PR #54 Codex P2）。
  const release = acquireLock(folder, 'generate');
  release();
  assert.equal(jobState(readEvents(folder), job.key).status, 'running');
  assert.match(savePasted(folder, job, 2, DECK).join('\n'), /貼完了：有效原稿/);
  assert.throws(() => savePasted(folder, job, 2, DECK), /已經貼完了/);
  assert.equal(jobState(readEvents(folder), job.key).status, 'done');
});

/** 假的 claude CLI：照 MODE 印 stream-json 事件；把收到的參數與 stdin 寫進 result。 */
function fakeCli(mode: string): { command: string; prefix: string[]; found: string } {
  const dir = mkdtempSync(join(tmpdir(), 'rule-test-cli-'));
  const script = join(dir, 'cli.mjs');
  writeFileSync(script, `
let input = '';
process.stdin.on('data', chunk => { input += chunk; });
process.stdin.on('end', () => {
  const mode = ${JSON.stringify(mode)};
  const say = event => process.stdout.write(JSON.stringify(event) + '\\n');
  say({ type: 'system', subtype: 'init', model: 'claude-opus-5-5', tools: mode === 'tools' ? ['Bash'] : [], mcp_servers: [] });
  if (mode === 'quota') say({ type: 'rate_limit_event', rate_limit_info: { status: 'rejected', resetsAt: 1800000000 } });
  const text = mode === 'login' ? 'Not logged in · Please run /login' : JSON.stringify({ args: process.argv.slice(2), input: JSON.parse(input) });
  say({ type: 'result', subtype: 'success', is_error: mode === 'login' || mode === 'quota', result: text, session_id: 'sess-1', duration_ms: 7, modelUsage: { 'claude-opus-5-5': {} } });
});
`);
  return { command: process.execPath, prefix: [script], found: script };
}

void test('claude 轉接器：safe-mode、不開工具、stream-json 進出、PDF 當附件；沒登入、隔離沒生效、額度用完分得出來', async () => {
  const records: string[] = [];
  const request = (over: Partial<StepRequest> = {}): StepRequest => ({ text: '提示', pdf: Buffer.from('%PDF'), resume: null, model: 'claude-opus-5-5', effort: 'high', systemPrompt: null, cwd: tmpdir(), timeoutMs: 20_000, record: out => { records.push(out); }, ...over });
  const result = await claudeAdapter(() => fakeCli('ok'))(request());
  assert.equal(result.kind, 'ok');
  if (result.kind !== 'ok') return;
  const seen = JSON.parse(result.reply) as { args: string[]; input: { message: { content: { type: string; source?: { data: string } }[] } } };
  assert.deepEqual(seen.args, ['-p', '--safe-mode', '--strict-mcp-config', '--output-format', 'stream-json', '--verbose', '--input-format', 'stream-json', '--model', 'claude-opus-5-5', '--effort', 'high', '--tools', '']);
  assert.deepEqual(seen.input.message.content.map(block => block.type), ['document', 'text']);
  assert.equal(Buffer.from(seen.input.message.content[0].source!.data, 'base64').toString(), '%PDF');
  assert.equal(result.session, 'sess-1');
  assert.ok(records[0].includes('"subtype":"init"'));
  const resumed = await claudeAdapter(() => fakeCli('ok'))(request({ resume: 'sess-1', pdf: null, systemPrompt: '系統' }));
  assert.ok(resumed.kind === 'ok' && (JSON.parse(resumed.reply) as { args: string[] }).args.join(' ').endsWith('--tools  --resume sess-1 --system-prompt 系統'));
  assert.deepEqual(await claudeAdapter(() => fakeCli('login'))(request()), { kind: 'fatal', message: 'claude 沒有登入（在終端機執行 claude 登入）' });
  assert.deepEqual(await claudeAdapter(() => fakeCli('tools'))(request()), { kind: 'fatal', message: '隔離沒生效：工具 1 個、MCP 0 個' });
  assert.equal((await claudeAdapter(() => fakeCli('quota'))(request())).kind, 'quota');
  assert.deepEqual(await claudeAdapter(() => { throw Error('找不到 claude'); })(request()), { kind: 'fatal', message: '找不到 claude' });
});

void test('Codex 生成：不收附件，教材放進對話的資料夾，每個對話的第一步前面加同一句說明（記進事件）', async () => {
  const folder = await frozenFolder(TWO_GROUPS, '  - { 生成器: claude, 模型: claude-opus-5-5, 份數: 1, 課: [] }\n  - { 生成器: codex, 模型: gpt-6.2-sol, 推理: high, 份數: 1 }');
  const seen: string[][] = [];
  const { adapter, requests } = fake(request => { seen.push(readdirSync(request.cwd)); return ok(DECK, 'codex-1'); });
  await runQueue(folder, { adapters: { codex: adapter }, log: () => {} });
  assert.equal(requests.length, 2);
  assert.ok(requests.every(request => request.pdf === null && request.model === 'gpt-6.2-sol' && request.effort === 'high'));
  assert.deepEqual(seen, [['教材.pdf'], ['教材.pdf']]);
  assert.ok(requests[0].text.startsWith('（教材是這個資料夾裡的 教材.pdf，先讀完再照下面做。）\n\n組'));
  const steps = readEvents(folder).filter(event => event.type === 'step');
  assert.ok(steps.every(event => event.detail?.material === '（教材是這個資料夾裡的 教材.pdf，先讀完再照下面做。）'));
  assert.equal(readFileSync(join(folder.root, '生成', '原稿', '甲-L3-codex-1.md'), 'utf8'), DECK);
});
