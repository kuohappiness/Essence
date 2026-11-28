import test from 'node:test';
import assert from 'node:assert/strict';
import { parseDeck } from '../src/core/deck/index.ts';
import { deepenTargets, deepenTask, existingTargets, readJobs, RULE_SUBJECTS, sha256Hex, taskSection } from '../src/core/ai/index.ts';
import type { CardForm, DeepenInput, ExistingTarget } from '../src/core/ai/index.ts';
import { PLUGIN_TASK } from '../tools/rule-test/config.ts';
import { applyTaskOptions, leanList } from '../tools/rule-test/tasks.ts';

// 單選與配對送給 AI 的（tasks/matching-single-choice.md §6、§7）：已有目標的清單帶選項、社會勾了點選填空多送配對與單選。預期值手寫。
const subject = (key: string) => RULE_SUBJECTS.find(each => each.key === key)!;
const form = (over: Partial<CardForm> = {}): CardForm => ({ subject: 'social', term: '五上', unit: '2-1 臺灣的海岸', purpose: '準備段考', supplement: false, pick: true, adjust: '', material: '', ...over });
const DECK = parseDeck([
  '---', '年級學期: 五上', '科目: 社會', '單元: 2-1 臺灣的海岸', '狀態: 啟用', '---',
  '- 能說出臺灣北部海岸的地形 ^aaaaa2', '    - 出處：p.42', '    - 臺灣北部的海岸是哪一種海岸？ :: 岩岸', '    - 選項：岩岸;;沙岸;;斷層海岸;;珊瑚礁海岸',
  '- 能說出臺灣的四個海岸 ^bbbbb2', '    - 出處：p.42', '    - 臺灣的海岸分成哪幾部？ :: 北部、東部、西部、南部', '',
].join('\n'));
const RULE = '- 清單上寫了「這個目標的選項」的學習目標：那是清單的格式，不是選項行的寫法。加題到這種目標時不寫選項行，答案用那一組裡的字，一字不差。';
const SOCIAL_HEAD = '  - 社會另外有兩種點選，是短規則「沒有選項」的例外，只用在這兩種：';

void test('製卡的已有目標：單選的那一行接「這個目標的選項」，不以「選項」開頭；清單上有才送加題的說明', () => {
  const existing = existingTargets([{ path: 'a.md', deck: DECK }], '社會', '五上');
  assert.deepEqual(existing.map(each => each.options), ['岩岸;;沙岸;;斷層海岸;;珊瑚礁海岸', undefined]);
  assert.ok(!('options' in existing[1]));
  const lines = taskSection(form({ pick: false }), subject('social'), existing).split('\n');
  assert.ok(lines.includes('  - aaaaa2 能說出臺灣北部海岸的地形｜五上 2-1 p.42｜第一題：臺灣北部的海岸是哪一種海岸？ :: 岩岸｜這個目標的選項：岩岸;;沙岸;;斷層海岸;;珊瑚礁海岸'));
  assert.ok(lines.includes('  - bbbbb2 能說出臺灣的四個海岸｜五上 2-1 p.42｜第一題：臺灣的海岸分成哪幾部？ :: 北部、東部、西部、南部'));
  assert.ok(lines.includes(RULE));
  assert.ok(!taskSection(form({ pick: false }), subject('social'), existing.slice(1)).includes(RULE));
});

void test('加深的目標：單選的那一行接「這個目標的選項」；清單上有才送加題的說明', () => {
  const targets = deepenTargets(DECK, new Map());
  assert.deepEqual(targets.map(each => each.options), ['岩岸;;沙岸;;斷層海岸;;珊瑚礁海岸', undefined]);
  const input: DeepenInput = { form: { term: '五上', unit: '2-1 臺灣的海岸', purpose: '平常複習', adjust: '', material: '' }, subject: { subject: '社會', r3: true }, targets, siblings: [], map: null, gone: [], words: null };
  const lines = deepenTask(input).split('\n');
  assert.ok(lines.includes('  - aaaaa2 能說出臺灣北部海岸的地形｜還沒記穩｜第一題：臺灣北部的海岸是哪一種海岸？ :: 岩岸｜這個目標的選項：岩岸;;沙岸;;斷層海岸;;珊瑚礁海岸'));
  assert.ok(lines.includes(RULE));
  assert.ok(!deepenTask({ ...input, targets: targets.slice(1) }).includes(RULE));
});

void test('存著的工作：`提示 v6` 之前沒有選項這一欄也讀得回來；有的要是文字', () => {
  const job = (id: string, existing: unknown[]) => ({
    id, copiedAt: 'x', copiedMs: 0, form: form(), subject: { key: 'social', label: '社會（國小）', subject: '社會', r3: true },
    parts: [{ name: '任務段', version: '提示 v5', text: 't', sha256: sha256Hex('t') }], promptSha: 'p', existing, save: null,
  });
  const old = { id: 'aaaaa2', name: '能甲', source: '五上 2-1', path: 'a.md', first: 'Q :: A' };
  const read = readJobs([job('old', [old]), job('new', [{ ...old, options: '甲;;乙;;丙' }]), job('bad', [{ ...old, options: 3 }])], 0);
  assert.deepEqual(read.jobs.map(each => each.id), ['old', 'new']);
  assert.equal(read.broken, 1);
});

void test('比較測試工具的精簡清單：重組這一行時選項接在最後，不丟', () => {
  const existing: ExistingTarget[] = [{ id: 'aaaaa2', name: '能說出臺灣北部海岸的地形', source: '五上 2-1 p.42', path: 'a.md', first: 'Q :: 岩岸', options: '岩岸;;沙岸;;斷層海岸' }];
  assert.deepEqual(leanList(existing), ['  - aaaaa2 能說出臺灣北部海岸的地形｜五上 2-1｜Q :: 岩岸｜這個目標的選項：岩岸;;沙岸;;斷層海岸']);
  // L2 第一輪 R8：名稱結尾像變化的單選目標，照一個目標一行，選項不丟；同一個字的變化照舊併成一行。
  const english: ExistingTarget[] = [
    { id: 'bbbbb2', name: '能分辨形容詞的 比較級', source: 'L3 p.40', path: 'b.md', first: '比 tall 多一級的形式叫什麼？ :: 比較級', options: '原級;;比較級;;最高級' },
    { id: 'ccccc2', name: 'tall 比較級', source: 'L3 p.40', path: 'b.md', first: 'tall 的比較級？ :: taller' },
  ];
  assert.deepEqual(leanList(english), [
    '  - bbbbb2 能分辨形容詞的 比較級｜L3 p.40｜比 tall 多一級的形式叫什麼？ :: 比較級｜這個目標的選項：原級;;比較級;;最高級',
    '  - tall｜比較級 ccccc2｜第一題：tall 的比較級？ :: taller｜L3 p.40',
  ]);
});

void test('§7 社會勾了點選填空：多送配對與單選的子項目與縮排的例子；沒勾、別科不送；比較測試「點選填空說明：不送」時整段不見', () => {
  const on = taskSection(form(), subject('social'), []).split('\n');
  const head = on.indexOf(SOCIAL_HEAD);
  assert.ok(head > on.findIndex(line => line.startsWith('- 家長勾了點選填空：')), '寫在勾了的那一段底下');
  assert.ok(on.includes('          - 選項：岩岸;;沙岸;;斷層海岸;;珊瑚礁海岸'));
  // 例子縮排：從勾了的那一段到下一個最上層的項目之間，沒有頂格的行。
  const next = on.findIndex((line, i) => i > head && line.startsWith('- '));
  assert.ok(on.slice(head, next).every(line => line === '' || line.startsWith('  ')));
  assert.ok(!taskSection(form({ pick: false }), subject('social'), []).includes(SOCIAL_HEAD));
  assert.ok(!taskSection(form({ subject: 'chinese' }), subject('chinese'), []).includes(SOCIAL_HEAD));
  const deepen: DeepenInput = { form: { term: '五上', unit: '2-1', purpose: '平常複習', adjust: '', material: '', pick: true }, subject: { subject: '社會', r3: true }, targets: [], siblings: [], map: null, gone: [], words: null };
  assert.ok(deepenTask(deepen).includes(SOCIAL_HEAD));
  const cut = applyTaskOptions(taskSection(form(), subject('social'), []), { ...PLUGIN_TASK, pickRules: false }, { subject: subject('social'), existing: [] });
  assert.ok(!cut.includes('家長勾了點選填空') && !cut.includes(SOCIAL_HEAD) && !cut.includes('選項：岩岸'), cut);
});
