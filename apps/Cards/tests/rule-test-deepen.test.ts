// 比較測試工具的模擬首次加深（tasks/rule-test-d236.md §6-1、§6-2）：凍結加深規則與單字卡組、假 ID、和外掛同樣組法的提示、事件與重跑、blind 要等。
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, sep } from 'node:path';
import type { DeepenJob } from '../src/core/ai/index.ts';
import { parseDeck } from '../src/core/deck/index.ts';
import { createDeepen } from '../src/obsidian/deepen.ts';
import { createState } from '../src/state/index.ts';
import { encodeEntry } from '../src/core/study/index.ts';
import type { StepRequest } from '../tools/rule-test/adapters.ts';
import { blindFolder } from '../tools/rule-test/blind.ts';
import { planCopy, readPlan, runDeepen } from '../tools/rule-test/deepen.ts';
import { mergeDeepen, validateDeepen, type DeepenResult } from '../tools/rule-test/deepen-judge.ts';
import { resultFile, runJudges } from '../tools/rule-test/judge.ts';
import { checkFolder } from '../tools/rule-test/check.ts';
import { runDisputes } from '../tools/rule-test/disputes.ts';
import { unblindFolder } from '../tools/rule-test/unblind.ts';
import { openFolder, sha256File, type Folder } from '../tools/rule-test/folder.ts';
import { deepenSources, deepenSourcesHash, freezeFolder, readDeepenFrozen, readFrozenSteps } from '../tools/rule-test/freeze.ts';
import { extendFolder } from '../tools/rule-test/extend.ts';
import { runQueue } from '../tools/rule-test/generate.ts';
import { jobState, planJobs, readEvents, reopenFailed } from '../tools/rule-test/jobs.ts';
import { deepenSectionText } from '../tools/rule-test/prompts.ts';
import { statusLines } from '../tools/rule-test/status.ts';
import { createMemoryFiles } from './helpers/memory-files.ts';
import { fakeJudge, RUBRIC } from './helpers/rule-test.ts';

const ENGLISH = '# 英文\n\n<!-- 以下送給 AI -->\n\n## 英文規則\n- 二\n\n<!-- 以下只在加深時送 -->\n\n- 加深的規則\n\n<!-- 以下只在錯題分析時送 -->\n- 錯題的規則\n';

void test('加深送的規則：送出段加上加深段，其他「以下只在…送」的段不送；沒有加深段就只有送出段', () => {
  assert.equal(deepenSectionText(ENGLISH, 'english.md'), '## 英文規則\n- 二\n\n- 加深的規則');
  assert.equal(deepenSectionText('# x\n<!-- 以下送給 AI -->\n- 一\n<!-- 以下只在錯題分析時送 -->\n- 錯題\n', 'x.md'), '- 一');
});

/** 一個只有英文規則檔的 git repo（不碰真的 repo）。 */
function fixtureRepo(): { root: string; commit: string } {
  const root = mkdtempSync(join(tmpdir(), 'rule-test-repo-'));
  const path = join(root, 'rules', 'english.md');
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, ENGLISH);
  const git = (...args: string[]): string => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
  git('init', '-q');
  git('-c', 'user.name=t', '-c', 'user.email=t@example.com', 'add', '.');
  git('-c', 'user.name=t', '-c', 'user.email=t@example.com', 'commit', '-q', '-m', 'fixture');
  return { root, commit: git('rev-parse', 'HEAD') };
}

const DECK = '國二上英文 L3 單字\n- borrow 英翻中 ^abcdef\n    - borrow :: v. 借入\n- lend 英翻中\n    - lend :: v. 借出\n<<<完>>>';
const THREE = '<<<全貌>>>\n- 借與借出\n<<<架構>>>\n- 第一層：字義\n<<<卡組>>>\n' + DECK;

/** 凍結、生成好的測試資料夾：甲不交三段、乙交三段；vault 已有 L1 的一篇（單字 go）。 */
async function generated(replies: Partial<Record<'甲' | '乙', string>> = {}, unit = 'L1', more = ''): Promise<Folder> {
  const { root, commit } = fixtureRepo();
  const folder = mkdtempSync(join(tmpdir(), 'rule-test-'));
  const vault = join(folder, 'vault');
  mkdirSync(join(vault, 'Essence Cards'), { recursive: true });
  writeFileSync(join(vault, 'Essence Cards', 'L1.md'), `---\n科目: 英文\n年級學期: 國二上\n單元: ${unit}\n狀態: 啟用\n---\n- go 英翻中 ^aaaaa2\n    - go :: 去\n`);
  mkdirSync(join(folder, '課', 'L3'), { recursive: true });
  writeFileSync(join(folder, '課', 'L3', '教材.pdf'), '%PDF-1.4 假的');
  writeFileSync(join(folder, '課', 'L3', '評分表.md'), RUBRIC.replace(' 加題 aaaaa2 ', ' ') + more);
  mkdirSync(join(folder, '提示'));
  writeFileSync(join(folder, '提示', '甲.md'), '組甲\n\n{{任務段}}');
  writeFileSync(join(folder, '提示', '乙.md'), '組乙，交三段 <<<卡組>>>\n\n{{任務段}}');
  const rules = `加深規則: { commit: ${commit}, 檔案: [rules/english.md] }`;
  writeFileSync(join(folder, '測試.yaml'), `
名稱: 加深測試
課庫: 課
同時: 1
課: [{ 代號: L3, 表單: { 科目: english, 年級學期: 國二上, 單元: L3, 目的: 準備小考, 家長調整: 多出文法 }, 已有目標: { vault: ${JSON.stringify(vault)} } }]
組:
  - { 名稱: 甲, 規則: { 自備: { L3: 甲.md } }, ${rules} }
  - { 名稱: 乙, 規則: { 自備: { L3: 乙.md } }, ${rules} }
生成: [{ 生成器: claude, 模型: claude-opus-5-5, 推理: high, 份數: 1 }]
評審: [{ 評審: codex, 模型: gpt-6.2-sol }, { 評審: claude, 模型: claude-fable-5-2 }]
門檻: { 基準: 甲, 候選: [乙], 生成器: [claude], 收益: [{ 指標: 判錯, 至少: 1% }] }
加深: { 生成器: [claude] }
`);
  await freezeFolder(openFolder(folder), { root, log: () => {} });
  const opened = openFolder(folder);
  const reply = (prompt: string): string => (prompt.startsWith('組乙') ? replies.乙 ?? THREE : replies.甲 ?? DECK);
  await runQueue(opened, { adapters: { claude: request => Promise.resolve({ kind: 'ok', reply: reply(request.text), session: null, warnings: [], ms: 1200, models: [] }) }, log: () => {} });
  return opened;
}

/** 假的生成器：記下每次的請求，回一份加深。 */
function fakeDeepener(): { requests: StepRequest[]; adapter: (request: StepRequest) => Promise<{ kind: 'ok'; reply: string; session: null; warnings: string[]; ms: number; models: string[] }> } {
  const requests: StepRequest[] = [];
  return { requests, adapter: request => {
    requests.push(request);
    const id = /^ {2}- (\w{6}) borrow 英翻中｜/m.exec(request.text)![1];
    const deck = [
      '## 文法', '- borrow 和 lend 的差別', '    - 出處：p.3', '    - 向別人拿是 ＿＿ :: borrow', '',
      '> [!note] 加進已有的學習目標', `> - ${id} borrow 英翻中`, '>     - 出處：p.3', '>     - I ＿＿ a pen from him. :: borrow', '>     - 借書 :: borrow a book', '',
      '> [!note]- 候選卡片', '> - lend 的片語', '>     - 理由：課外', '>     - lend a hand :: 幫忙', '<<<完>>>',
    ].join('\n');
    const reply = request.text.includes('照規則交全貌') ? `<<<全貌>>>\n- 借與借出\n<<<架構>>>\n- 第一層：字義\n<<<卡組>>>\n${deck}` : deck;
    return Promise.resolve({ kind: 'ok', reply, session: null, warnings: [], ms: 900, models: [] });
  } };
}

void test('凍結加深：每組送的規則全文、外掛加深用到的原始碼的雜湊、英文這一科的卡組全文', async () => {
  const folder = await generated();
  const frozen = readDeepenFrozen(folder);
  assert.equal(frozen.plugin, deepenSourcesHash());
  // 模擬加深用到的外掛函式（§6-1）所在的檔都在裡面，不只 deepen-prompt.ts（L2 第 1 輪 O）。
  const sources = deepenSources().map(path => relative(join(import.meta.dirname, '..'), path).split(sep).join('/'));
  for (const file of ['src/core/ai/deepen-prompt.ts', 'src/core/ai/draft.ts', 'src/core/ai/prompt.ts', 'src/core/ai/deepen-write.ts', 'src/core/catalog/index.ts', 'src/core/deck/index.ts']) assert.ok(sources.includes(file), file);
  assert.ok(sources.every(file => file.startsWith('src/')));
  assert.deepEqual(Object.keys(frozen.groups), ['甲', '乙']);
  assert.equal(frozen.groups.甲[0].text, '## 英文規則\n- 二\n\n- 加深的規則');
  assert.equal(frozen.groups.甲[0].name, 'english.md');
  const words = JSON.parse(readFileSync(join(folder.root, '凍結', '加深', '單字卡組', 'L3.json'), 'utf8')) as { decks: { path: string }[] };
  assert.deepEqual(words.decks.map(each => each.path), ['Essence Cards/L1.md']);
});

void test('凍結加深：vault 裡這個單元已經有卡組就停下（模擬的是新課）', async () => {
  await assert.rejects(generated({}, 'L3 Old'), /這個單元已經有卡組（含草稿）：Essence Cards\/L1\.md/);
});

void test('模擬首次加深：假 ID 固定、避開原稿與已有的；提示照外掛的加深任務段（記穩了、同單元其他篇、地圖、已有單字）', async () => {
  const folder = await generated();
  const jobs = planJobs(folder, readFrozenSteps(folder), readEvents(folder));
  const first = planCopy(folder, jobs[0]), again = planCopy(folder, jobs[0]);
  assert.deepEqual(first.plan, again.plan);
  const [piece] = first.plan.pieces;
  assert.equal(first.plan.pieces.length, 1);
  assert.equal(piece.key, '甲-L3-claude-1~加深~1');
  assert.equal(piece.ids.length, 2);
  assert.ok(piece.ids.every(id => /^[a-hjkmnp-z2-9]{6}$/.test(id) && id !== 'abcdef' && id !== 'aaaaa2'));
  assert.match(piece.deck, /^---\n年級學期: 國二上\n科目: 英文\n單元: L3\n狀態: 啟用\n---\n/);
  const prompt = first.prompts.get(piece.key)!;
  assert.ok(prompt.startsWith('## 英文規則\n- 二\n\n- 加深的規則\n\n## 這一次的任務：加深這一節\n'));
  assert.ok(!prompt.includes('錯題的規則'));
  for (const line of [
    '- 單元：L3', '- 學習目的：準備小考', '- 家長調整：多出文法',
    `  - ${piece.ids[0]} borrow 英翻中｜記穩了｜第一題：borrow :: v. 借入`,
    `  - ${piece.ids[1]} lend 英翻中｜記穩了｜第一題：lend :: v. 借出`,
    '- 同單元的其他篇：無', '- 以前出過、現在不在這一篇的：無',
    '- 孩子已有的英文單字（只用來挑記憶錨點的連結，不用來判斷加題）：go、borrow、lend',
    '最新的學習地圖：無。請先依教材補一份全貌與架構，再照它往下一層出。',
  ]) assert.ok(prompt.split('\n').includes(line), line);
  // 交三段的組：地圖照原文，提示要交三段。
  const three = planCopy(folder, jobs[1]);
  const text = three.prompts.get('乙-L3-claude-1~加深~1')!;
  assert.ok(text.includes('最新的學習地圖（上一次的全貌與架構，照原文）：\n\n<<<全貌>>>\n- 借與借出\n\n<<<架構>>>\n- 第一層：字義\n'));
  assert.ok(text.includes('照規則交全貌、架構、卡組三段'));
  assert.equal(three.plan.map, true);
});

void test('模擬首次加深：卡組存不了的不模擬（記原因）', async () => {
  const folder = await generated({ 甲: '國二上英文 L3 單字\n- borrow 英翻中\n- lend 英翻中\n    - lend :: v. 借出\n<<<完>>>' });
  const jobs = planJobs(folder, readFrozenSteps(folder), readEvents(folder));
  const { plan } = planCopy(folder, jobs[0]);
  assert.equal(plan.savable, false);
  assert.deepEqual(plan.pieces, []);
  assert.match(plan.why[0], /第 2 行/);
});

void test('deepen：一篇一個新對話、附教材、模型推理同生成；回覆與外掛的檢查存檔；重跑不重做；blind 等加深做完', async () => {
  const folder = await generated();
  assert.throws(() => blindFolder(folder, { log: () => {} }), /還有 2 篇加深沒做完.*甲-L3-claude-1（還沒跑 deepen）/);
  const fake = fakeDeepener();
  await runDeepen(folder, { adapters: { claude: fake.adapter }, log: () => {} });
  assert.equal(fake.requests.length, 2);
  const [request] = fake.requests;
  assert.deepEqual([request.resume, request.model, request.effort, request.pdf?.toString()], [null, 'claude-opus-5-5', 'high', '%PDF-1.4 假的']);
  const plan = readPlan(folder, '甲-L3-claude-1')!;
  const key = plan.pieces[0].key;
  assert.equal(readFileSync(join(folder.root, '加深', '提示', `${key}.md`), 'utf8'), request.text);
  assert.ok(existsSync(join(folder.root, '加深', '原稿', `${key}.md`)));
  for (const each of ['甲-L3-claude-1~加深~1', '乙-L3-claude-1~加深~1']) {
    const format = JSON.parse(readFileSync(join(folder.root, '加深', '格式', `${each}.json`), 'utf8')) as { errors: string[] };
    assert.deepEqual(format.errors, [], each);
  }
  const events = readEvents(folder, join('加深', '事件.jsonl'));
  assert.equal(jobState(events, key).status, 'done');
  assert.equal(events.find(event => event.type === 'done' && event.job === key)?.detail?.sent, request.text.length);
  // 重跑：做完的篇不重做。
  await runDeepen(folder, { adapters: { claude: fake.adapter }, log: () => {} });
  assert.equal(fake.requests.length, 2);
  const batch = blindFolder(folder, { log: () => {} });
  // 給評審的加深（§6-2）：草稿帶假 ID、標記換成標題；新目標一項、加題每一題一項，候選不算；行號對得到那一行。
  const entry = batch.entries.find(each => each.group === '甲')!;
  assert.deepEqual(entry.deepen.kind === 'ok' && [entry.deepen.pieces, entry.deepen.abandoned, entry.deepen.unsavable, entry.deepen.items], [1, 0, 0, 3]);
  const sheet = readFileSync(join(folder.root, '評分', '批1', '加深', 'L3', `${entry.code}.md`), 'utf8').split('\n');
  const { items } = JSON.parse(readFileSync(join(folder.root, '評分', '批1', '加深', 'L3', `${entry.code}.json`), 'utf8')) as { items: { id: string; kind: string; target: string | null; line: number; text: string }[] };
  assert.deepEqual(items.map(item => [item.id, item.kind, item.target, item.text]), [
    ['1-1', '新目標', null, '- borrow 和 lend 的差別'],
    ['1-2', '加題', plan.pieces[0].ids[0], '- I ＿＿ a pen from him. :: borrow'],
    ['1-3', '加題', plan.pieces[0].ids[0], '- 借書 :: borrow a book'],
  ]);
  for (const item of items) assert.equal(sheet[item.line - 1].replace(/^>\s?/, '').trim(), item.text);
  assert.ok(sheet.includes(`- borrow 英翻中 ^${plan.pieces[0].ids[0]}`));
  assert.ok(!sheet.some(line => line.includes('<<<')));
  const other = batch.entries.find(each => each.group === '乙')!;
  assert.ok(readFileSync(join(folder.root, '評分', '批1', '加深', 'L3', `${other.code}.md`), 'utf8').includes('\n## 全貌\n- 借與借出\n'));
  const [block] = batch.blocks;
  assert.deepEqual([...block.deepens].sort(), [entry.code, other.code].sort());
  assert.ok(existsSync(join(folder.root, '評分', '批1', '加深區組', block.name, '加深', `${entry.code}.md`)));
  assert.ok(existsSync(join(folder.root, '評分', '批1', '加深區組', block.name, '地圖', `${other.code}.md`)));
});

void test('extend 只跑新的份的加深（§13 第 8 條）：第一批做完、匿名後補一份，deepen 只送新的兩篇', async () => {
  const folder = await generated();
  await runDeepen(folder, { adapters: { claude: fakeDeepener().adapter }, log: () => {} });
  blindFolder(folder, { log: () => {} });
  extendFolder(folder, { lesson: 'L3', generator: 'claude', count: 1, reason: '補一份' });
  await runQueue(folder, { adapters: { claude: request => Promise.resolve({ kind: 'ok', reply: request.text.startsWith('組乙') ? THREE : DECK, session: null, warnings: [], ms: 1200, models: [] }) }, log: () => {} });
  const fake = fakeDeepener();
  await runDeepen(folder, { adapters: { claude: fake.adapter }, log: () => {} });
  assert.equal(fake.requests.length, 2);
  const events = readEvents(folder, join('加深', '事件.jsonl'));
  assert.deepEqual(['甲', '乙'].map(group => jobState(events, `${group}-L3-claude-2~加深~1`).status), ['done', 'done']);
});

void test('匿名之後不再加深（§6-2）：放棄的篇重開了，deepen 也不跑；那一份的加深固定在匿名時', async () => {
  const folder = await generated();
  const fake = fakeDeepener();
  // 乙那一篇一直失敗，試滿 3 次放棄；甲做完。
  const flaky = (request: StepRequest): ReturnType<typeof fake.adapter> | Promise<{ kind: 'fail'; message: string }> => request.text.includes('照規則交全貌') ? Promise.resolve({ kind: 'fail', message: '假的失敗' }) : fake.adapter(request);
  await runDeepen(folder, { adapters: { claude: flaky }, log: () => {} });
  const LOG = join('加深', '事件.jsonl'), key = '乙-L3-claude-1~加深~1';
  assert.equal(jobState(readEvents(folder, LOG), key).status, 'failed');
  blindFolder(folder, { log: () => {} });
  reopenFailed(folder, [key], LOG);
  const after = fakeDeepener();
  await runDeepen(folder, { adapters: { claude: after.adapter }, log: () => {} });
  assert.equal(after.requests.length, 0);
});

void test('§13-7 加深的提示和外掛一字不差：假 vault 放凍結的卡組與模擬加入的那一篇、孩子都記穩了、這個單元有小考，外掛走一次 copy()', async t => {
  const folder = await generated();
  const jobs = planJobs(folder, readFrozenSteps(folder), readEvents(folder));
  const { plan, prompts } = planCopy(folder, jobs[0]);
  const [piece] = plan.pieces;
  const at = Date.parse('2026-11-17T10:00:00+08:00');
  // 每一個目標兩天各答對一次：外掛算成記穩了。
  const deck = parseDeck(piece.deck);
  const log = piece.ids.flatMap((id, i) => {
    const fingerprint = deck.targets.find(target => target.id === id)!.prompts[0].fingerprint;
    return [encodeEntry(`2026-11-01T10:0${String(i)}:00.000+08:00`, { lt: id, r: 'good', v: fingerprint }), encodeEntry(`2026-11-02T10:0${String(i)}:00.000+08:00`, { lt: id, r: 'good', v: fingerprint })];
  }).join('\n') + '\n';
  const frozen = JSON.parse(readFileSync(join(folder.root, '凍結', '加深', '單字卡組', 'L3.json'), 'utf8')) as { decks: { path: string; text: string }[] };
  const memory = createMemoryFiles({
    ...Object.fromEntries(frozen.decks.map(each => [each.path, each.text])),
    [piece.path]: piece.deck,
    'Essence Cards/紀錄/2026-11 PC-old.jsonl': log,
    'Essence Cards/考試範圍/小考/L3.md': '---\n識別碼: q4m8t2\n小考日期: 2026-11-20\n---\n- 國二上 英文 L3\n',
  });
  const clipboard: string[] = [];
  let jobsSaved: unknown = null;
  // eslint-disable-next-line prefer-const -- state 與流程互相參照
  let state: ReturnType<typeof createState>;
  const deepen = createDeepen({
    rules: { english: readDeepenFrozen(folder).groups.甲 }, state: () => state, random: Math.random,
    store: {
      jobs: () => jobsSaved, saveJobs(next: DeepenJob[]) { jobsSaved = next; }, retire() {}, skips: () => null, saveSkips() {}, remindOff: () => false, picks: () => ({}), savePick() {},
    },
    names: () => new Set(), named: () => [], snapshots: () => Promise.resolve([]),
    read: path => Promise.resolve(memory.texts.get(path) ?? null), editor: () => null, unsaved: () => Promise.resolve(false),
    clipboard: text => { clipboard.push(text); return Promise.resolve(); },
    now: () => ({ ms: at, offset: 480 }), onError: error => { throw error; },
  });
  state = createState({ files: memory.files, device: 'PC-test', delay: 1, fillIds: true, random: Math.random, reserved: () => deepen.reserved(), now: () => at, offset: () => 480, onError() {} });
  t.after(() => state.close());
  await state.ready();
  const copied = await deepen.copy(piece.path, '多出文法', '');
  assert.ok('job' in copied, JSON.stringify(copied));
  assert.equal(clipboard[0], prompts.get(piece.key));
});

const CHANCES = [{ id: 'D1', uses: ['R1'], ask: 'borrow 和 lend 的方向', outside: null, pages: 'p.3' }];
const SHEET = ['# 草稿', '', '- a ^aaaaa2', '# 第 1 篇的加深', '- 新目標', '    - q :: a', '> - aaaaa2 a', '>     - q2 :: a2'];
const context = { chances: CHANCES, codes: ['S1'], sheets: new Map([['S1', SHEET]]), items: new Map([['S1', ['1-1', '1-2']]]) };
const answer = (over: Partial<DeepenResult> = {}): DeepenResult => ({
  rows: [{ row: 'D1', decks: [{ deck: 'S1', evidence: '新目標', items: ['1-1'], verdict: '有' }] }],
  items: [{ deck: 'S1', item: '1-1', verdict: '接得對', reason: '', note: '' }, { deck: 'S1', item: '1-2', verdict: '接得對', reason: '', note: '' }],
  issues: [], unsure: '', ...over,
});

void test('驗加深評分（§6-3）：每列每份一格、每項一筆；判「有」的證據不能是自己判接錯的項；接錯要原因；行號與項要存在', () => {
  assert.deepEqual(validateDeepen(answer(), context), []);
  const wrong = answer({ items: [{ deck: 'S1', item: '1-1', verdict: '接錯', reason: '沒有加深', note: '換句話' }, { deck: 'S1', item: '1-2', verdict: '接錯', reason: '', note: '' }] });
  assert.deepEqual(validateDeepen(wrong, context), ['列 D1 的 S1：1-1 你判了接錯，不能當「有」的證據（改判部分，或換證據）', 'S1 1-2：接錯要選原因']);
  const broken = answer({
    rows: [{ row: 'D1', decks: [{ deck: 'S1', evidence: 'x', items: ['9-9'], verdict: '部分' }] }],
    items: [{ deck: 'S1', item: '1-1', verdict: '接得對', reason: '層次不對', note: '' }],
    issues: [{ deck: 'S1', kind: '判錯', item: '3-1', lines: [2], note: '' }],
  });
  assert.deepEqual(validateDeepen(broken, context), [
    '列 D1 的 S1：9-9 不是這一份的項', 'S1 少了這幾項：1-2', 'S1 1-1：接得對的原因寫空字串',
    '問題第 1 筆（S1 判錯）：行號 2 不是這一份有字的行', '問題第 1 筆（S1 判錯）：3-1 不是這一份的項',
  ]);
  assert.deepEqual(validateDeepen(answer({ rows: [] }), context), ['少了這幾列：D1']);
  // 草稿不評（加深評分說明）：行號指到草稿段的問題擋下（L2 第 1 輪 D）。
  assert.deepEqual(validateDeepen(answer({ issues: [{ deck: 'S1', kind: '洩漏', item: '', lines: [3], note: '' }] }), context), ['問題第 1 筆（S1 洩漏）：行號 3 在草稿，草稿不評（只記加深回覆裡的問題）']);
});

void test('合併加深（§6-3）：項兩位都對是對、都錯是錯、不同是歧見；加深機會照卡組的表；同一項同一種問題算一筆', () => {
  const a = answer({ issues: [{ deck: 'S1', kind: '判錯', item: '1-2', lines: [8], note: '甲' }] });
  const b = answer({
    rows: [{ row: 'D1', decks: [{ deck: 'S1', evidence: '', items: [], verdict: '沒有' }] }],
    items: [{ deck: 'S1', item: '1-1', verdict: '接錯', reason: '沒有加深', note: '' }, { deck: 'S1', item: '1-2', verdict: '接得對', reason: '', note: '' }],
    issues: [{ deck: 'S1', kind: '判錯', item: '1-2', lines: [7], note: '乙' }, { deck: 'S1', kind: '小問題', item: '', lines: [5], note: '' }],
  });
  const merged = mergeDeepen('S1', new Map([['甲', a], ['乙', b]]));
  assert.deepEqual(merged.rows, { D1: '部分' });
  assert.deepEqual(merged.disagreements, ['D1']);
  assert.deepEqual(merged.items, { '1-1': '歧見', '1-2': '對' });
  assert.deepEqual(merged.issues.map(issue => [issue.kind, issue.item, issue.lines, issue.judges]), [['判錯', '1-2', [8, 7], ['甲', '乙']], ['小問題', '', [5], ['乙']]]);
});

void test('加深評分：每個有加深的區組、每位評審另開一個對話；提示列加深機會與每一份的項；結果檔 -加深、鎖定表列進去', async () => {
  const folder = await generated({}, 'L1', '\n| D1 | 加深機會 | 用到 R1：borrow 和 lend 的方向怎麼分 | p.3 | | |');
  await runDeepen(folder, { adapters: { claude: fakeDeepener().adapter }, log: () => {} });
  const batch = blindFolder(folder, { log: () => {} });
  const judge = fakeJudge();
  await runJudges(folder, { adapters: { claude: judge.adapter, codex: judge.adapter }, log: () => {} });
  const [block] = batch.blocks;
  const prompts = judge.requests.filter(request => request.text.startsWith('# 加深評分說明'));
  assert.equal(prompts.length, 2);
  assert.match(prompts[0].text, /- 要逐列判的加深機會（1 列）：D1/);
  assert.match(prompts[0].text, /^ {2}- S\d：1-1（第 \d+ 行）、1-2（第 \d+ 行）、1-3（第 \d+ 行）$/m);
  for (const name of ['codex', 'claude']) {
    const result = JSON.parse(readFileSync(resultFile(folder, 1, name, block.name, '加深'), 'utf8')) as DeepenResult;
    assert.equal(result.items.length, 6);
  }
  const lock = readFileSync(join(folder.root, '評分', '批1', '鎖定.md'), 'utf8');
  assert.match(lock, new RegExp(`${block.name}-加深\\.json`));
});

void test('加深的指標（§6-3、§2-1）：加深機會漏掉、確定接錯、歧見；只有一位記的加深重大照裁定；卡組存不了的份加深機會全漏、確定接錯不算', async () => {
  const broken = '<<<全貌>>>\n- 借與借出\n<<<架構>>>\n- 第一層：字義\n<<<卡組>>>\n國二上英文 L3 單字\n- borrow 英翻中\n- lend 英翻中\n    - lend :: v. 借出\n<<<完>>>';
  const folder = await generated({ 乙: broken }, 'L1', '\n| D1 | 加深機會 | 用到 R1：borrow 和 lend 的方向怎麼分 | p.3 | | |\n| D2 | 加深機會 | 用到 R1：借貸的片語 | p.3 | | |');
  await runDeepen(folder, { adapters: { claude: fakeDeepener().adapter }, log: () => {} });
  const batch = blindFolder(folder, { log: () => {} });
  const [block] = batch.blocks;
  assert.equal(block.deepens.length, 1);
  const mark = (result: DeepenResult, item: string, reason: '接錯目標' | '沒有加深'): void => { Object.assign(result.items.find(each => each.item === item)!, { verdict: '接錯', reason }); };
  const noD2 = (result: DeepenResult): void => { result.rows.find(row => row.row === 'D2')!.decks.forEach(cell => Object.assign(cell, { verdict: '沒有', evidence: '', items: [] })); };
  // 只有 Codex 記的重大錯誤（第 1 項那一行）：送裁定。Fable 在同一項記判錯：裁定改記判錯時，同一項同一種只算一筆（§3 去重）。
  const { items } = JSON.parse(readFileSync(join(folder.root, '評分', '批1', '加深', 'L3', `${block.deepens[0]}.json`), 'utf8')) as { items: { id: string; line: number }[] };
  const fable = fakeJudge({ shapeDeepen: (result, codes) => {
    mark(result, '1-2', '接錯目標'); noD2(result); result.unsure = '1-3 是換句話問，還是往下一層，兩種讀法都說得通';
    result.issues.push({ deck: [...codes.keys()][0], kind: '判錯', item: '1-1', lines: [items[0].line], note: '答案只收一種說法' });
  } });
  const codex = fakeJudge({ shapeDeepen: (result, codes) => {
    mark(result, '1-2', '接錯目標'); mark(result, '1-3', '沒有加深'); noD2(result);
    result.issues.push({ deck: [...codes.keys()][0], kind: '重大錯誤', item: '1-1', lines: [items[0].line], note: 'lend 的方向教反了' });
  } });
  await runJudges(folder, { adapters: { codex: codex.adapter, claude: fable.adapter }, log: () => {} });
  const seen: string[] = [];
  await runDisputes(folder, { adapters: { claude: request => {
    request.record('{}', '');
    seen.push(request.text, ...['加深', '卡組'].filter(sub => existsSync(join(request.cwd, sub))));
    const value = { verdict: '不成立', quality: '判錯', reason: 'lend 沒教反，但答案只收一種說法' };
    return Promise.resolve({ kind: 'ok', reply: JSON.stringify(value), session: 's', warnings: [], ms: 1, models: [], structured: value });
  } }, log: () => {} });
  assert.match(seen[0], /這一筆在加深裡/);
  assert.match(seen[0], /- 位置：加深 項 1-1/);
  assert.deepEqual(seen.slice(1), ['加深']);
  checkFolder(folder, () => {});
  const report = unblindFolder(folder, { log: () => {} });
  const byGroup = Object.fromEntries(report.decks.map(deck => [deck.group, deck]));
  assert.deepEqual(byGroup.甲.deepen, { pieces: 1, abandoned: 0, unsavable: 0, items: 3, undeepened: false, missed: 1, wrong: 1, disputed: 1, major: 0, harm: 1 });
  assert.deepEqual(byGroup.乙.deepen, { pieces: 0, abandoned: 0, unsavable: 0, items: 0, undeepened: true, missed: 2, wrong: null, disputed: 0, major: 0, harm: 0 });
  const summary = readFileSync(join(folder.root, '結果', '摘要.md'), 'utf8'), detail = readFileSync(join(folder.root, '結果', '明細.md'), 'utf8');
  // 學習面的表：甲的傷到學習是加深裁定改記的判錯 1；乙存不了，加深機會全漏 2、確定接錯不算（—）。只報告的表：甲接對率 1／3。
  assert.ok(summary.includes('| 甲 | 1 | 0.0 | 1.0 | 0.0 | 0.0 | 0.0 | 0.0 | 1.0 | 2.0 | 0.0 | — | — | 1.0 | 1.0 | 1.0 |'));
  assert.ok(summary.includes('| 乙 | 1 | 1.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 1.0 | 0.0 | 0.0 | 0.0 | 2.0 | — | 0.0 |'));
  assert.ok(summary.includes('| 甲 | 0.0 | 1.0 | 1.0 | 0.0 | 2.0 | 2.0 | 0／1 | 1.0（0） | 3.0 | 33% | 0.0 |'));
  assert.ok(!summary.includes('兩種讀法'));
  assert.match(detail, /### 地圖與加深的拿不準（不送裁定，只列出來）\n\n- L3-B01 加深，claude：1-3 是換句話問，還是往下一層，兩種讀法都說得通\n/);
});

void test('status 顯示加深做到哪裡：還沒算計畫的份、篇數與完成數、存不了不能加深的份', async () => {
  const broken = '<<<全貌>>>\n- 借與借出\n<<<架構>>>\n- 第一層：字義\n<<<卡組>>>\n國二上英文 L3 單字\n- borrow 英翻中\n- lend 英翻中\n    - lend :: v. 借出\n<<<完>>>';
  const folder = await generated({ 乙: broken });
  assert.ok(statusLines(folder).includes('加深：2 份、0 篇｜完成 0、跑中 0、待跑 0、放棄 0；還沒算計畫 2 份（生成完成後：deepen）'));
  await runDeepen(folder, { adapters: { claude: fakeDeepener().adapter }, log: () => {} });
  assert.ok(statusLines(folder).includes('加深：2 份、1 篇｜完成 1、跑中 0、待跑 0、放棄 0；卡組存不了、不能加深 1 份'));
});

void test('外掛加深用到的原始碼在凍結之後改過：deepen 停下，說用凍結時的 commit 跑', async () => {
  const folder = await generated();
  // 模擬原始碼改過：把凍結記的雜湊換掉，並讓鎖跟著（只測這一道核對，不改真的原始碼）。
  const rules = join(folder.root, '凍結', '加深', '規則.json');
  writeFileSync(rules, readFileSync(rules, 'utf8').replace(/"plugin": "[0-9a-f]{64}"/, `"plugin": "${'0'.repeat(64)}"`));
  const lockFile = join(folder.root, '凍結', '鎖.json');
  const lock = JSON.parse(readFileSync(lockFile, 'utf8')) as { files: Record<string, string> };
  lock.files['凍結/加深/規則.json'] = sha256File(rules);
  writeFileSync(lockFile, JSON.stringify(lock, null, 2) + '\n');
  await assert.rejects(runDeepen(folder, { adapters: { claude: fakeDeepener().adapter }, log: () => {} }), /外掛加深用到的原始碼（src 底下 \d+ 個檔，含 deepen-prompt\.ts）在凍結之後改過：用凍結時的 commit 跑/);
});
