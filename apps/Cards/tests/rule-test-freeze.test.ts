// 比較測試工具的凍結（tasks/rule-test-tool.md §4-2 規則的四種來源與任務段選項、§5-3、§8 第 2 條）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { RULE_SUBJECTS, taskSection, type CardForm, type ExistingTarget } from '../src/core/ai/index.ts';
import { parseDeck } from '../src/core/deck/index.ts';
import { PLUGIN_TASK } from '../tools/rule-test/config.ts';
import { openFolder } from '../tools/rule-test/folder.ts';
import { freezeFolder, readFrozenSteps, verifyLock } from '../tools/rule-test/freeze.ts';
import { expandOwn, fillReplies, sectionText } from '../tools/rule-test/prompts.ts';
import { parseSnapshotFile, snapshotOf } from '../tools/rule-test/snapshot.ts';
import { applyTaskOptions, leanList } from '../tools/rule-test/tasks.ts';

const subject = (key: string) => RULE_SUBJECTS.find(each => each.key === key)!;
const form = (over: Partial<CardForm> = {}): CardForm => ({ subject: 'english', term: '國二上', unit: 'L3 Going Places', purpose: '準備段考', supplement: false, pick: true, adjust: '', material: '', ...over });
const EXISTING: ExistingTarget[] = [
  { id: 'aaaaa2', name: 'borrow 英翻中', source: '國一下 L5 p.3', path: 'a.md', first: 'borrow :: v. 借入' },
  { id: 'aaaaa3', name: 'borrow 中翻英', source: '國一下 L5 p.3', path: 'a.md', first: '借 ＿＿ :: borrow' },
  { id: 'bbbbb2', name: '現在完成式 文法', source: '國二上 L1', path: 'b.md', first: 'I ＿＿ him. (know) :: have known' },
  { id: 'aaaaa4', name: 'go 過去式', source: '國一下 L5', path: 'a.md', first: 'I ＿＿ home. :: went' },
  { id: 'ccccc2', name: 'skip 中翻英', source: '國二上 L2', path: 'c.md' },
];

void test('任務段選項：全部是外掛的預設時，和 taskSection 一字不差（§8 第 2 條）', () => {
  for (const [key, over] of [['english', {}], ['english', { pick: false }], ['social', { subject: 'social', term: '五上', unit: '1-2 地形', pick: false }]] as const) {
    for (const existing of [[], EXISTING]) {
      const task = taskSection(form(over), subject(key), existing, key === 'english' ? ['borrow'] : null);
      assert.equal(applyTaskOptions(task, PLUGIN_TASK, { subject: subject(key), existing }), task);
    }
  }
});

void test('任務段選項：拿掉點選填空說明、比對說明換一行、英文加三段（候選規則 README 的三處）', () => {
  const task = taskSection(form(), subject('english'), EXISTING, ['borrow']);
  const out = applyTaskOptions(task, { pickRules: false, existingRules: 'line', threeSections: true, existingList: 'plugin' }, { subject: subject('english'), existing: EXISTING }).split('\n');
  const at = out.indexOf('另外：');
  assert.deepEqual(out.slice(at, at + 8), [
    '另外：',
    '',
    '- 教材在附件。附件沒有圖檔可以連，**不要寫 `![[…]]`**；要提到課本的圖，在出處寫圖號（例如 `p.42、圖 2`）。',
    '- 「學生已有的學習目標」每一項寫 `ID 名稱｜出處｜第一題：……`，第一題是那個目標現在的第一題（問答寫 `題目 :: 答案`，填空與排序寫整行），沒有題目的不寫；怎麼比對照規則〈和學生已有的目標比對〉。',
    '- 一課分成幾篇時，篇名照 `國二上英文 L3 <篇名>` 寫，例如 `國二上英文 L3 單字`，單獨一行、前面不加 `#`。',
    '- 不要寫學習目標 ID 與屬性區，程式會加。',
    '- 照規則交三段，標記照抄（`<<<全貌>>>`、`<<<架構>>>`、`<<<卡組>>>`）。',
    '- 回覆的最後單獨一行寫 `<<<完>>>`。',
  ]);
  // 任務資料的「點選填空：要」那一行照留。
  assert.ok(out.includes('- 點選填空：要'));
  // 沒有已有目標時沒有比對說明可換，只拿掉點選填空的說明。
  const none = applyTaskOptions(taskSection(form({ pick: false }), subject('english'), [], []), { ...PLUGIN_TASK, pickRules: false, existingRules: 'line' }, { subject: subject('english'), existing: [] });
  assert.ok(!none.includes('家長沒勾點選填空') && !none.includes('「學生已有的學習目標」每一項寫'));
});

void test('精簡清單：英文單字一個字一行（方向照出現順序、第三欄英翻中的答案或第一題、單元取第一個），其他一個目標一行', () => {
  assert.deepEqual(leanList(EXISTING), [
    '  - borrow｜英翻中 aaaaa2、中翻英 aaaaa3｜v. 借入｜國一下 L5',
    '  - bbbbb2 現在完成式 文法｜國二上 L1｜I ＿＿ him. (know) :: have known',
    '  - go｜過去式 aaaaa4｜第一題：I ＿＿ home. :: went｜國一下 L5',
    '  - skip｜中翻英 ccccc2｜｜國二上 L2',
  ]);
  const task = taskSection(form(), subject('english'), EXISTING, []);
  const out = applyTaskOptions(task, { ...PLUGIN_TASK, existingRules: 'line', existingList: 'lean' }, { subject: subject('english'), existing: EXISTING }).split('\n');
  const head = out.indexOf('- 學生已有的學習目標：');
  assert.equal(out[head + 1], '  - borrow｜英翻中 aaaaa2、中翻英 aaaaa3｜v. 借入｜國一下 L5');
  assert.equal(out[head + 5], '- 孩子已有的英文單字（只用來挑記憶錨點的連結，不用來判斷加題）：無');
  assert.ok(out.includes('- 「學生已有的學習目標」英文單字一個字一行：`字｜方向或變化 ID、…｜英翻中的答案｜所在的單元`（沒有英翻中的字寫第一題）；其他每一項 `ID 名稱｜所在的單元｜第一題`。怎麼比對照規則〈和學生已有的目標比對〉。'));
});

void test('任務段選項：錨點不只一次或找不到時停下，不送出別的字', () => {
  const task = taskSection(form(), subject('english'), EXISTING, []);
  const twice = task.replace('- 教材在附件。', '- 家長勾了點選填空：重複\n- 教材在附件。');
  assert.throws(() => applyTaskOptions(twice, { ...PLUGIN_TASK, pickRules: false }, { subject: subject('english'), existing: EXISTING }), /點選填空的說明」出現 2 次/);
  const gone = task.replace('- 回覆的最後單獨一行寫 `<<<完>>>`。', '- 最後寫完。');
  assert.throws(() => applyTaskOptions(gone, { ...PLUGIN_TASK, threeSections: true }, { subject: subject('english'), existing: EXISTING }), /找不到/);
});

void test('規則檔只送標記以下、到第一個「以下只在…送」為止；換行統一、拿掉 BOM', () => {
  const raw = '﻿# 標題\r\n\r\n<!-- 以下送給 AI -->\r\n\r\n## 規則\r\n- 一\r\n\r\n<!-- 以下只在加深時送 -->\r\n- 加深\r\n';
  assert.equal(sectionText(raw, 'x.md'), '## 規則\n- 一');
  assert.throws(() => sectionText('沒有標記', 'x.md'), /找不到標記/);
});

void test('自備檔：任務段與已有目標清單凍結時展開、A.1 生成時代入、其他變數擋下', () => {
  const built = expandOwn('規則\n\n{{任務段}}\n\n上一段：{{A.1}}', '提示/x.md', { task: '任務', list: '清單' });
  assert.equal(built.text, '規則\n\n任務\n\n上一段：{{A.1}}');
  assert.deepEqual(built.pending, ['A.1']);
  assert.equal(built.rulesChars, '規則\n\n\n\n上一段：'.length);
  assert.equal(fillReplies(built.text, new Map([['A.1', '回覆']])), '規則\n\n任務\n\n上一段：回覆');
  assert.throws(() => fillReplies(built.text, new Map()), /\{\{A\.1\}\} 還沒有回覆/);
  assert.throws(() => expandOwn('{{任務資料}}{{單元}}', '提示/x.md', { task: '', list: '' }), /認不得的變數：\{\{任務資料\}\}、\{\{單元\}\}/);
});

const deck = (path: string, front: string, body: string) => ({ path, deck: parseDeck(`---\n${front}\n---\n${body}`) });

void test('快照：照外掛的篩選；需要新版的卡組與它的 ID、重複的 ID 都不送；評審拿到每一題', () => {
  const decks = [
    deck('Essence Cards/a.md', '科目: 英文\n年級學期: 國一下\n單元: L5\n狀態: 啟用', '- borrow 英翻中 ^aaaaa2\n    - borrow :: v. 借入\n    - lend :: v. 借出\n- go 過去式 ^aaaaa4\n    - I ＿＿ home. :: went\n- dup 英翻中 ^ddddd2\n    - dup :: 重複\n'),
    deck('Essence Cards/b.md', '科目: 英文\n年級學期: 國二上\n單元: L1\n狀態: 啟用', '- dup 中翻英 ^ddddd2\n    - 重複 ＿＿ :: dup\n- 新的 英翻中 ^nnnnn2\n    - new :: 新的\n'),
    deck('Essence Cards/c.md', '科目: 英文\n年級學期: 國二上\n單元: L2\n狀態: 啟用\n需要版本: 9.0.0', '- 新的 中翻英 ^nnnnn2\n    - 新 ＿＿ :: new\n'),
    deck('Essence Cards/d.md', '科目: 英文\n年級學期: 國二下\n單元: L1\n狀態: 啟用', '- later 英翻中 ^lllll2\n    - later :: 之後\n'),
    deck('Essence Cards/e.md', '科目: 英文\n年級學期: 國二上\n單元: L3\n狀態: 草稿', '- draft 英翻中 ^eeeee2\n    - draft :: 草稿\n'),
  ];
  const snap = snapshotOf(decks, '英文', '國二上', '0.6.0');
  assert.deepEqual(snap.targets.map(t => t.id), ['aaaaa2', 'aaaaa4']);
  assert.deepEqual(snap.words, ['borrow', 'go']);
  assert.deepEqual(snap.pool[0], { id: 'aaaaa2', name: 'borrow 英翻中', source: '國一下 L5', path: 'Essence Cards/a.md', questions: ['borrow :: v. 借入', 'lend :: v. 借出'] });
  assert.deepEqual(snap.skipped, { duplicateIds: ['ddddd2'], newerDecks: ['Essence Cards/c.md'] });
  assert.equal(snapshotOf(decks, '社會', '五上', '0.6.0').words, null);
});

void test('第一輪的快照檔照讀：first 是 null 的不送第一題，英文的單字取 learnedWords', () => {
  const roundOne = JSON.stringify({
    vault: 'v', subject: '英文', term: '國二上', commit: 'eeeaeb19', count: 2, learnedWords: ['borrow'], decks: [], gated: [], duplicateIds: [],
    targets: [
      { id: 'aaaaa2', name: 'borrow 英翻中', source: '國一下 L5', path: 'a.md', first: 'borrow :: v. 借入', prompts: [{ kind: 'qa', question: 'borrow', answer: 'v. 借入' }] },
      { id: 'aaaaa5', name: '句型 排序', source: '國一下 L5', path: 'a.md', first: null, prompts: [{ kind: 'cloze', text: 'I ＿＿\n home' }] },
    ],
  });
  const snap = parseSnapshotFile(roundOne, '0.6.0');
  assert.deepEqual(snap.targets, [{ id: 'aaaaa2', name: 'borrow 英翻中', source: '國一下 L5', path: 'a.md', first: 'borrow :: v. 借入' }, { id: 'aaaaa5', name: '句型 排序', source: '國一下 L5', path: 'a.md' }]);
  assert.deepEqual(snap.words, ['borrow']);
  assert.deepEqual(snap.pool[1].questions, ['I ＿＿／home']);
  // 這個工具自己凍結的快照原樣讀回。
  assert.deepEqual(parseSnapshotFile(JSON.stringify(snap), '0.6.0'), snap);
  assert.throws(() => parseSnapshotFile('{"x":1}', '0.6.0'), /快照檔認不得/);
});

/** 一個只有這次要用的檔的 git repo（不碰真的 repo 與工作樹）。 */
function fixtureRepo(): { root: string; commit: string } {
  const root = mkdtempSync(join(tmpdir(), 'rule-test-repo-'));
  const real = join(import.meta.dirname, '..', '..', '..');
  const copy = (path: string, text?: string): void => {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text ?? readFileSync(join(real, path)));
  };
  for (const file of subject('english').files) copy(file.path);
  copy('apps/Cards/docs/card-rules/next/core.md', '# 核心\n\n<!-- 以下送給 AI -->\n\n## 核心規則\n- 一\n');
  copy('apps/Cards/docs/card-rules/next/english.md', '# 英文\n\n<!-- 以下送給 AI -->\n\n## 英文規則\n- 二\n\n<!-- 以下只在加深時送 -->\n- 加深\n');
  copy('apps/Cards/src/.keep', '');
  const git = (...args: string[]): string => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
  git('init', '-q');
  git('-c', 'user.name=t', '-c', 'user.email=t@example.com', 'add', '.');
  git('-c', 'user.name=t', '-c', 'user.email=t@example.com', 'commit', '-q', '-m', 'fixture');
  return { root, commit: git('rev-parse', 'HEAD') };
}

void test('freeze：凍結快照與每組每課每步的提示、鎖住雜湊；重跑不改、凍結的檔被改就停下並說是哪個', async () => {
  const { root, commit } = fixtureRepo();
  const folder = mkdtempSync(join(tmpdir(), 'rule-test-folder-'));
  const vault = join(folder, 'vault');
  mkdirSync(join(vault, 'Essence Cards'), { recursive: true });
  writeFileSync(join(vault, 'Essence Cards', 'L1.md'), '---\n科目: 英文\n年級學期: 國二上\n單元: L1\n狀態: 啟用\n---\n- borrow 英翻中 ^aaaaa2\n    - borrow :: v. 借入\n');
  mkdirSync(join(folder, '課', '英文L3'), { recursive: true });
  writeFileSync(join(folder, '課', '英文L3', '教材.pdf'), '%PDF-1.4 假的');
  mkdirSync(join(folder, '提示'));
  writeFileSync(join(folder, '提示', '分段.md'), '自己的規則\n\n{{任務段}}\n\n前一段：{{A.1}}\n');
  writeFileSync(join(folder, '測試.yaml'), `
名稱: 測試
課庫: 課
課:
  - { 代號: 英文L3, 表單: { 科目: english, 年級學期: 國二上, 單元: "L3 Going Places" }, 已有目標: { vault: ${JSON.stringify(vault)} } }
組:
  - { 名稱: 現行, 規則: { 外掛: english } }
  - 名稱: 候選
    規則: { commit: ${commit}, 檔案: [apps/Cards/docs/card-rules/next/core.md, apps/Cards/docs/card-rules/next/english.md], 任務段: { 點選填空說明: 不送, 已有目標說明: 一行, 三段: 要 } }
  - 名稱: 分段
    步驟:
      - { 對話: A, 規則: { 同: 候選 }, 卡組: 否 }
      - { 對話: A, 規則: { 自備: { 英文L3: 分段.md } }, 卡組: 是 }
生成: [{ 生成器: claude, 模型: claude-opus-5-5, 份數: 1 }]
評審: [{ 評審: codex, 模型: gpt-6.2-sol }, { 評審: claude, 模型: claude-fable-5-2 }]
門檻: { 基準: 現行, 候選: [候選], 生成器: [claude], 收益: [{ 指標: 規則字數, 至少: 20% }] }
`);
  const lines: string[] = [];
  const lock = await freezeFolder(openFolder(folder), { root, log: line => lines.push(line) });
  assert.equal(lock.commit, commit);
  const steps = readFrozenSteps(openFolder(folder));
  assert.deepEqual(steps.map(s => [s.file, s.deck, s.threeSections, s.pending]), [
    ['現行-英文L3.md', true, false, []],
    ['候選-英文L3.md', true, true, []],
    ['分段-英文L3-1.md', false, true, []],
    ['分段-英文L3-2.md', true, false, ['A.1']],
  ]);
  const candidate = readFileSync(join(folder, '凍結', '提示', '候選-英文L3.md'), 'utf8');
  assert.ok(candidate.startsWith('## 核心規則\n- 一\n\n## 英文規則\n- 二\n\n## 這一次的任務\n'));
  assert.ok(!candidate.includes('加深'));
  assert.ok(candidate.includes('  - aaaaa2 borrow 英翻中｜國二上 L1｜第一題：borrow :: v. 借入'));
  assert.equal(steps[1].rulesChars, '## 核心規則\n- 一'.length + '## 英文規則\n- 二'.length);
  assert.deepEqual(Object.keys(lock.files).sort(), ['<課庫>/英文L3/教材.pdf', '凍結/已有目標/英文L3.json', '凍結/提示.json', '凍結/提示/候選-英文L3.md', '凍結/提示/分段-英文L3-1.md', '凍結/提示/分段-英文L3-2.md', '凍結/提示/現行-英文L3.md', '提示/分段.md', '測試.yaml']);
  assert.ok(lines.some(line => line.includes('評分表還沒有')));

  // 重跑：已經凍結，什麼都不寫。
  const again: string[] = [];
  await freezeFolder(openFolder(folder), { root, log: line => again.push(line) });
  assert.match(again.join('\n'), /已經凍結/);
  // 凍結的檔被改：停下並說是哪個。
  writeFileSync(join(folder, '凍結', '提示', '現行-英文L3.md'), '改過');
  assert.throws(() => verifyLock(openFolder(folder)), /凍結之後改過或不見了：凍結\/提示\/現行-英文L3\.md/);
});

void test('freeze：外掛來源用到的檔有沒 commit 的修改就停下', async () => {
  const { root } = fixtureRepo();
  writeFileSync(join(root, subject('english').files[1].path), '改過');
  const folder = mkdtempSync(join(tmpdir(), 'rule-test-folder-'));
  mkdirSync(join(folder, '課', 'U1'), { recursive: true });
  writeFileSync(join(folder, '課', 'U1', '教材.pdf'), '%PDF');
  writeFileSync(join(folder, '測試.yaml'), `
名稱: 測試
課庫: 課
課: [{ 代號: U1, 表單: { 科目: english, 年級學期: 國二上, 單元: U1 } }]
組: [{ 名稱: 現行, 規則: { 外掛: english } }, { 名稱: 候選, 規則: { 外掛: english } }]
生成: [{ 生成器: claude, 模型: m }]
評審: [{ 評審: codex, 模型: a }, { 評審: claude, 模型: b }]
門檻: { 基準: 現行, 候選: [候選], 生成器: [claude], 收益: [{ 指標: 規則字數, 至少: 1% }] }
`);
  await assert.rejects(freezeFolder(openFolder(folder), { root, log: () => {} }), /沒 commit 的修改/);
});
