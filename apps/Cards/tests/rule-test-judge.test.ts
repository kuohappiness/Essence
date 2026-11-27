// 比較測試工具的評分（tasks/rule-test-tool.md §5-2 評分表、§5-7 評分、驗證、補正與鎖定）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Adapter } from '../tools/rule-test/adapters.ts';
import { jobState, readEvents, reopenFailed } from '../tools/rule-test/jobs.ts';
import { judgePrompt, judgeSchema, rejudgeStats, runJudges, validateResult, type JudgeResult } from '../tools/rule-test/judge.ts';
import { deepenChances, judgedRows, parseRubric } from '../tools/rule-test/rubric.ts';
import { statusLines } from '../tools/rule-test/status.ts';
import { blinded, fakeJudge, RUBRIC } from './helpers/rule-test.ts';

void test('評分表：讀列號、類別與跨單元；列號重複、類別不對、跨單元的 ID 不在快照裡都列出來', () => {
  const rows = parseRubric(RUBRIC, new Set(['aaaaa2']));
  assert.deepEqual(rows.map(row => [row.id, row.kind, row.cross]), [['R1', '必備', ''], ['R2', '加分', '加題 aaaaa2'], ['M1', '重大錯誤', '']]);
  const broken = RUBRIC + '\n| R1 | 必要 | x | | | |\n| R3 | 必備 | y | | | 加題 zzzzz9 |\n| R4 | 必備 | z | | | 合併 |';
  assert.throws(() => parseRubric(broken, new Set(['aaaaa2'])), (error: Error) => {
    assert.match(error.message, /類別「必要」不是 必備、加分、重大錯誤、加深機會/);
    assert.match(error.message, /跨單元 ID「zzzzz9」不在已有目標快照裡/);
    assert.match(error.message, /列「R4」的跨單元「合併」要寫/);
    return true;
  });
});

void test('評分表的加深機會（rule-test-d236.md §6-3）：用到哪幾個必備、要問什麼、課外的來源；不逐列判卡組；寫法不對列出來', () => {
  const rows = parseRubric(RUBRIC + '\n| D1 | 加深機會 | 用到 R1：borrow 和 lend 的方向怎麼分 | p.3 | | |\n| D2 | 加深機會 | 用到 R1：借貸的英文說法（課外：高中英文 第一冊 L2） | p.3 | | |');
  assert.deepEqual(deepenChances(rows), [
    { id: 'D1', uses: ['R1'], ask: 'borrow 和 lend 的方向怎麼分', outside: null, pages: 'p.3' },
    { id: 'D2', uses: ['R1'], ask: '借貸的英文說法（課外：高中英文 第一冊 L2）', outside: '高中英文 第一冊 L2', pages: 'p.3' },
  ]);
  assert.deepEqual(judgedRows(rows).map(row => row.id), ['R1', 'R2']);
  const broken = RUBRIC + '\n| D1 | 加深機會 | 問更深的 | | | |\n| D2 | 加深機會 | 用到 R2、R9：x | | | |\n| D3 | 加深機會 | 用到 R1：y（課外：） | | | 另立 |';
  assert.throws(() => parseRubric(broken), (error: Error) => {
    assert.match(error.message, /列「D1」是加深機會，判準要寫成「用到 R1、R3：往下一層要問什麼」/);
    assert.match(error.message, /列「D2」用到的 R2、R9 不是這張表的必備列/);
    assert.match(error.message, /列「D3」是加深機會，跨單元要空著/);
    assert.match(error.message, /列「D3」是課外，要在最後寫「（課外：可以查的來源）」/);
    return true;
  });
});

void test('評分表的依據欄（rule-test-d236.md §16，檢查表課 2、1a）：第七欄；必備寫正文、提問、後面要靠它、容易混、規律之一，其他類別空著；表頭要照兩種寫法之一', () => {
  const header = '| 列 | 類別 | 要考的知識或判準 | 頁碼 | 可以接受的等價做法 | 跨單元 | 依據 |\n|---|---|---|---|---|---|---|\n';
  const rows = parseRubric(`${header}| R1 | 必備 | borrow 的字義 | p.3 | | | 正文 |\n| R2 | 必備 | 借入與借出的方向 | p.3 | | | 容易混 |\n| R3 | 加分 | lend 的片語 | p.3 | | | |`);
  assert.deepEqual(rows.map(row => [row.id, row.basis]), [['R1', '正文'], ['R2', '容易混'], ['R3', '']]);
  // 沒有依據欄的舊表（第一輪的評分表）照樣讀得懂，依據是 null。
  assert.deepEqual(parseRubric(RUBRIC).map(row => row.basis), [null, null, null]);
  assert.throws(() => parseRubric(`${header}| R1 | 必備 | a | | | | |\n| R2 | 必備 | b | | | | 重要 |\n| R3 | 加分 | c | | | | 正文 |`), (error: Error) => {
    assert.match(error.message, /列「R1」是必備，依據要寫 正文、提問、後面要靠它、容易混、規律 之一/);
    assert.match(error.message, /列「R2」是必備，依據要寫 正文、提問、後面要靠它、容易混、規律 之一/);
    assert.match(error.message, /列「R3」不是必備，依據要空著/);
    return true;
  });
  assert.throws(() => parseRubric('| 列 | 類別 | 頁碼 | 要考的知識或判準 | 可以接受的等價做法 | 跨單元 |\n|---|---|---|---|---|---|\n| R1 | 必備 | p.3 | borrow | | |'), /表頭要是「\| 列 \| 類別 \| 要考的知識或判準 \| 頁碼 \| 可以接受的等價做法 \| 跨單元 \|」（可以在最後加「依據」）/);
  assert.throws(() => parseRubric('| R1 | 必備 | borrow | p.3 | | |'), /少了表頭/);
});

void test('評審的 schema：全部必填、不用動態鍵；卡組代號是 enum', () => {
  const schema = judgeSchema(['S1', 'S2']) as { required: string[]; additionalProperties: boolean; properties: { issues: { items: { properties: { deck: { enum: string[] } } } } } };
  assert.deepEqual(schema.required, ['pages', 'rows', 'issues', 'unsure']);
  assert.equal(schema.additionalProperties, false);
  assert.deepEqual(schema.properties.issues.items.properties.deck.enum, ['S1', 'S2']);
  // 種類只靠 schema 的 enum 擋（驗結果時不驗種類），所以直接看 enum：§17 的新種類要在裡面。
  const kinds = (judgeSchema(['S1']) as { properties: { issues: { items: { properties: { kind: { enum: string[] } } } } } }).properties.issues.items.properties.kind.enum;
  assert.ok(kinds.includes('沒講為什麼'));
});

const DECKS = new Map([['S1', ['- borrow 英翻中', '    - borrow :: 借入', '', '- lend 英翻中', '    - lend :: 借出', '']], ['S2', ['- borrow 英翻中', '    - borrow :: 借入', '']]]);
const good = (): JudgeResult => ({
  pages: [{ page: 1, note: '單字表' }],
  rows: ['R1', 'R2'].map(row => ({ row, decks: [{ deck: 'S1', evidence: 'borrow 英翻中', lines: [1], verdict: '有' as const }, { deck: 'S2', evidence: '', lines: [], verdict: '沒有' as const }] })),
  issues: [{ deck: 'S1', kind: '近義重複', lines: [2, 5], rubric: '', note: '' }],
  unsure: '',
});

void test('驗評審的結果：列號一列一筆、每份一格、判有要有行號、行號落在有字的行、近義重複兩行、逐頁照頁數', () => {
  const context = { rows: parseRubric(RUBRIC), codes: ['S1', 'S2'], decks: DECKS, pages: 1 };
  assert.deepEqual(validateResult(good(), context), []);
  const bad = good();
  bad.rows = [bad.rows[0], bad.rows[0], { row: 'M1', decks: [{ deck: 'S1', evidence: 'x', lines: [3], verdict: '部分' }] }];
  bad.issues = [{ deck: 'S2', kind: '近義重複', lines: [9], rubric: '', note: '' }, { deck: 'S1', kind: '跨單元去向', lines: [1], rubric: '', note: '' }];
  bad.pages = [];
  assert.deepEqual(validateResult(bad, { ...context, pages: 2 }), [
    '少了這幾列：R2',
    '評分表沒有這幾列（只判必備與加分）：M1',
    '這幾列寫了不只一次：R1',
    '列 M1：每份卡組要剛好一格（少了 S2，共寫了 1 格）',
    '列 M1 的 S1：行號 3 不是卡組裡有字的行',
    '問題第 1 筆（S2 近義重複）：行號 9 不是卡組裡有字的行',
    '問題第 1 筆（S2 近義重複）：近義重複要剛好寫兩道不同的題的行號（不是目標名稱行、不是同一題）',
    '問題第 2 筆（S1 跨單元去向）：rubric 要寫評分表的列號',
    '逐頁少了第 1、2 頁（教材共 2 頁）',
  ]);
  const noLines = good();
  noLines.rows[0].decks[0].lines = [];
  assert.deepEqual(validateResult(noLines, context), ['列 R1 的 S1：判「有」要寫證據的行號']);
  assert.deepEqual(validateResult('不是 JSON', context), ['不是照 schema 的 JSON（要有 pages、rows、issues、unsure）']);
});

void test('驗評審的結果：沒講為什麼一題一筆（rule-test-d236.md §17），行號要落在同一題；有好幾題的目標不寫名稱行，只有一題的可以', () => {
  // S3 第 1 行是有兩題的目標名稱，第 2、3 行是兩題，第 4 行是第 3 行那一題的詳解。
  const decks = new Map([...DECKS, ['S3', ['- borrow 的用法', '    - borrow 英翻中 :: 借入', '    - 「借入」的英文 :: borrow', '        - 詳解', '']]]);
  const context = { rows: parseRubric(RUBRIC), codes: ['S1', 'S2', 'S3'], decks, pages: 1 };
  const why = (deck: string, lines: number[]): JudgeResult => {
    const result = good();
    result.rows = result.rows.map(row => ({ ...row, decks: [...row.decks, { deck: 'S3', evidence: '', lines: [], verdict: '沒有' as const }] }));
    result.issues = [{ deck, kind: '沒講為什麼', lines, rubric: '', note: '' }];
    return result;
  };
  const wrong = '問題第 1 筆（S3 沒講為什麼）：沒講為什麼一題一筆，行號要落在同一題（題目行或它底下的行；有好幾題的目標不寫名稱行）';
  assert.deepEqual(validateResult(why('S3', [3, 4]), context), []);
  assert.deepEqual(validateResult(why('S1', [1]), context), []);
  assert.deepEqual(validateResult(why('S3', [1]), context), [wrong]);
  assert.deepEqual(validateResult(why('S3', [2, 3]), context), [wrong]);
  // 兩個目標各自的第 1 題（S1 第 2、5 行）也不是同一題（L2 §17 第 2 輪 P3-7）。
  assert.deepEqual(validateResult(why('S1', [2, 5]), context), [wrong.replace('S3', 'S1')]);
});

void test('judge：每個區組、每位評審一個新對話（只開 Read、照 schema 交、資料夾是複本）；兩位都交了就鎖定', async () => {
  const folder = await blinded();
  const claude = fakeJudge(), codex = fakeJudge();
  await runJudges(folder, { adapters: { claude: claude.adapter, codex: codex.adapter }, log: () => {} });
  assert.equal(claude.requests.length, 1);
  assert.equal(codex.requests.length, 1);
  const [request] = claude.requests;
  assert.equal(request.tools, 'Read');
  assert.equal(request.model, 'claude-fable-5-2');
  assert.ok(request.pdf !== null && codex.requests[0].pdf === null);
  assert.ok(request.jsonSchema?.includes('"enum":["S1","S2"]') || request.jsonSchema?.includes('"enum":["S2","S1"]'));
  assert.ok(!request.cwd.startsWith(folder.root));
  assert.match(request.text, /^# 評分說明/);
  assert.match(request.text, /- 要逐列判的列（2 列）：R1、R2/);
  const dir = join(folder.root, '評分', '批1');
  assert.deepEqual(readdirSync(join(dir, '結果')).sort(), ['claude', 'codex']);
  const lock = readFileSync(join(dir, '鎖定.md'), 'utf8');
  assert.match(lock, /\| L3 \| L3-B01 \| codex \| 結果\/codex\/L3-B01\.json \| [0-9a-f]{64} \|/);
  // 重跑：都交了，不再開對話。
  const again = fakeJudge();
  await runJudges(folder, { adapters: { claude: again.adapter, codex: again.adapter }, log: () => {} });
  assert.equal(again.requests.length, 0);
});

void test('judge：格式不合就在同一個對話補正（只列問題、其他判定不改）', async () => {
  const folder = await blinded();
  const claude = fakeJudge({ first: result => { result.rows.pop(); } });
  const codex = fakeJudge();
  await runJudges(folder, { adapters: { claude: claude.adapter, codex: codex.adapter }, log: () => {} });
  assert.equal(claude.requests.length, 2);
  assert.equal(claude.requests[1].resume, 'judge-1');
  assert.equal(claude.requests[1].pdf, null);
  assert.match(claude.requests[1].text, /^你交的 JSON 有這些問題：\n- 少了這幾列：R2/);
  assert.ok(existsSync(join(folder.root, '評分', '批1', '結果', 'claude', 'L3-B01.json')));
  const steps = readEvents(folder, join('評分', '批1', '事件.jsonl')).filter(event => event.type === 'step' && event.job === 'L3-B01-claude');
  assert.deepEqual(steps.map(event => event.detail?.problems), [1, 0]);
});

void test('judge：試滿 3 次的放棄、這一批鎖不了；重開（--retry）後再評一次，交齊就鎖定', async () => {
  const folder = await blinded();
  const codex = fakeJudge();
  const broken: Adapter = () => Promise.resolve({ kind: 'fail', message: '壞了' });
  for (let i = 0; i < 3; i++) await runJudges(folder, { adapters: { claude: broken, codex: codex.adapter }, log: () => {} });
  const log = join('評分', '批1', '事件.jsonl');
  assert.equal(jobState(readEvents(folder, log), 'L3-B01-claude').status, 'failed');
  const idle = fakeJudge();
  await runJudges(folder, { adapters: { claude: idle.adapter, codex: idle.adapter }, log: () => {} });
  assert.equal(idle.requests.length, 0);
  assert.ok(!existsSync(join(folder.root, '評分', '批1', '鎖定.md')));
  assert.ok(statusLines(folder).includes('  放棄：L3-B01-claude：壞了（看過原因要再試：judge --retry）'));
  assert.deepEqual(reopenFailed(folder, ['L3-B01-claude', 'L3-B01-codex'], log), ['L3-B01-claude']);
  const claude = fakeJudge();
  await runJudges(folder, { adapters: { claude: claude.adapter, codex: idle.adapter }, log: () => {} });
  assert.equal(claude.requests.length, 1);
  assert.ok(existsSync(join(folder.root, '評分', '批1', '鎖定.md')));
});

void test('評審的提示：凍結的評分說明在前，附這個區組的卡組、列號與教材', async () => {
  const folder = await blinded();
  const text = judgePrompt(folder, { name: 'L3-B01', lesson: 'L3', generator: 'claude', codes: ['S2', 'S1'], maps: [], deepens: [] }, parseRubric(RUBRIC), 12, false);
  assert.ok(text.startsWith(readFileSync(join(folder.root, '凍結', '範本', '評分說明.md'), 'utf8').trim()));
  assert.ok(text.endsWith('## 這一次\n\n- 卡組：卡組/S2.md、卡組/S1.md（共 2 份）\n- 要逐列判的列（2 列）：R1、R2\n- 教材：資料夾裡的 教材.pdf，共 12 頁'));
});

void test('評審重評：每位評審挑設定的幾個區組另開對話再評一次，只報兩次的差；不影響鎖定', async () => {
  const folder = await blinded({}, '評審重評: 1');
  let calls = 0;
  const claude = fakeJudge({ shape: result => { if (++calls === 2) result.rows[0].decks[0].verdict = '部分'; } }), codex = fakeJudge();
  await runJudges(folder, { adapters: { claude: claude.adapter, codex: codex.adapter }, log: () => {} });
  assert.deepEqual([claude.requests.length, codex.requests.length], [2, 2]);
  assert.deepEqual([claude.requests[1].resume, claude.requests[1].text], [null, claude.requests[0].text]);
  const dir = join(folder.root, '評分', '批1');
  assert.deepEqual(JSON.parse(readFileSync(join(dir, '重評.json'), 'utf8')), { codex: ['L3-B01'], claude: ['L3-B01'] });
  assert.ok(existsSync(join(dir, '鎖定.md')));
  assert.ok(!readFileSync(join(dir, '鎖定.md'), 'utf8').includes('重評'));
  assert.deepEqual(rejudgeStats(folder, 1), [
    { judge: 'codex', block: 'L3-B01', cells: 4, changed: 0, issues: [0, 0] },
    { judge: 'claude', block: 'L3-B01', cells: 4, changed: 1, issues: [0, 0] },
  ]);
  assert.equal(readEvents(folder, join('評分', '批1', '事件.jsonl')).filter(event => event.job === 'L3-B01-claude-重評' && event.type === 'done').length, 1);
  await runJudges(folder, { adapters: { claude: claude.adapter, codex: codex.adapter }, log: () => {} });
  assert.deepEqual([claude.requests.length, codex.requests.length], [2, 2]);
});
