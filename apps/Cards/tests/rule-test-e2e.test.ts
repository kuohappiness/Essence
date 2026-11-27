// 比較測試工具的端到端（tasks/rule-test-d236.md §13 第 13 條）：用假的 CLI，從 init 跑到 unblind。
// 一課三組、每組兩份驗流程（含地圖與模擬加深、對照、評估規格）；再做三份對三份、指定好的資料，驗出精確的總結果：過、沒過、未定、打平各一個例子。
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import type { Adapter, StepRequest } from '../tools/rule-test/adapters.ts';
import { blindFolder } from '../tools/rule-test/blind.ts';
import { checkFolder } from '../tools/rule-test/check.ts';
import { runDeepen } from '../tools/rule-test/deepen.ts';
import { runDisputes } from '../tools/rule-test/disputes.ts';
import { openFolder, type Folder } from '../tools/rule-test/folder.ts';
import { freezeFolder, readLock } from '../tools/rule-test/freeze.ts';
import { allGates } from '../tools/rule-test/gates.ts';
import { runQueue } from '../tools/rule-test/generate.ts';
import { initFolder } from '../tools/rule-test/init.ts';
import { runJudges, type JudgeResult } from '../tools/rule-test/judge.ts';
import { statusLines } from '../tools/rule-test/status.ts';
import { unblindFolder, type BatchReport } from '../tools/rule-test/unblind.ts';
import { fakeJudge } from './helpers/rule-test.ts';

const RUBRIC = [
  '| 列 | 類別 | 要考的知識或判準 | 頁碼 | 可以接受的等價做法 | 跨單元 | 依據 |',
  '|---|---|---|---|---|---|---|',
  '| R1 | 必備 | borrow 的字義 | p.3 | | | 正文 |',
  '| R2 | 加分 | lend 的字義 | p.3 | | | |',
  '| M1 | 重大錯誤 | 字義教錯 | | | | |',
].join('\n');
const ENGLISH = '# 英文\n\n<!-- 以下送給 AI -->\n\n## 英文規則\n- 二\n\n<!-- 以下只在加深時送 -->\n\n- 加深的規則\n';
const deckOf = (tag: string): string => `國二上英文 L3 單字 ${tag}\n- borrow 英翻中\n    - borrow :: v. 借入\n- lend 英翻中\n    - lend :: v. 借出\n<<<完>>>`;

/** 一個只有英文規則檔的 git repo（加深規則從這裡讀，不碰真的 repo）。 */
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

/** init 建資料夾，再照這次的設定改 測試.yaml、放課庫與自備提示。 */
function initialized(yaml: string, prompts: Record<string, string>): Folder {
  const root = join(mkdtempSync(join(tmpdir(), 'rule-test-e2e-')), '這一輪');
  initFolder(root);
  mkdirSync(join(root, '課', 'L3'), { recursive: true });
  writeFileSync(join(root, '課', 'L3', '教材.pdf'), '%PDF-1.4 假的');
  writeFileSync(join(root, '課', 'L3', '評分表.md'), RUBRIC);
  for (const [name, text] of Object.entries(prompts)) writeFileSync(join(root, '提示', `${name}.md`), text);
  writeFileSync(join(root, '測試.yaml'), yaml);
  return openFolder(root);
}

/** 假的生成器：照提示開頭的組名回卡組，每份標上不洩漏組名的記號（a1、a2…）；交三段的組回三段。 */
function fakeGenerator(): Adapter {
  const counts = new Map<string, number>();
  return request => {
    const group = /^組(\S)/.exec(request.text)![1];
    const n = (counts.get(group) ?? 0) + 1;
    counts.set(group, n);
    const tag = `${({ 甲: 'a', 乙: 'b', 丙: 'c' } as Record<string, string>)[group]}${String(n)}`;
    const deck = deckOf(tag);
    const reply = request.text.includes('<<<卡組>>>') ? `<<<全貌>>>\n- 借與借出\n<<<架構>>>\n- 第一層：字義\n<<<卡組>>>\n${deck}` : deck;
    return Promise.resolve({ kind: 'ok', reply, session: null, warnings: [], ms: 1000, models: [] });
  };
}

/** 假的加深：在 borrow 那個已有目標加一題。 */
const fakeDeepener: Adapter = (request: StepRequest) => {
  const id = /^ {2}- (\w{6}) borrow 英翻中｜/m.exec(request.text)![1];
  const deck = ['> [!note] 加進已有的學習目標', `> - ${id} borrow 英翻中`, '>     - 出處：p.3', '>     - I ＿＿ a pen from him. :: borrow', '<<<完>>>'].join('\n');
  const reply = request.text.includes('照規則交全貌') ? `<<<全貌>>>\n- 借與借出\n<<<架構>>>\n- 第一層：字義\n<<<卡組>>>\n${deck}` : deck;
  return Promise.resolve({ kind: 'ok', reply, session: null, warnings: [], ms: 900, models: [] });
};

/** 假的評審：照卡組上的記號記判錯（每份幾筆照 harm），其他照 fakeJudge 的預設（每列有）。 */
function taggedJudge(harm: Record<string, number> = {}, more?: (result: JudgeResult, code: string, tag: string) => void): Adapter {
  let cwd = '';
  const { adapter } = fakeJudge({ shape: (result, codes) => {
    for (const code of codes) {
      const tag = /單字 (\w+)/.exec(readFileSync(join(cwd, '卡組', `${code}.md`), 'utf8'))![1];
      for (const line of [3, 5].slice(0, harm[tag] ?? 0)) result.issues.push({ deck: code, kind: '判錯', lines: [line], rubric: '', note: '另一個說法也對' });
      more?.(result, code, tag);
    }
  } });
  return request => { cwd = request.cwd; return adapter(request); };
}

/** generate 之後的每一步：（加深）、匿名、評分、裁定、格式、解開。 */
async function through(folder: Folder, judge: () => Adapter): Promise<BatchReport> {
  await runQueue(folder, { adapters: { claude: fakeGenerator() }, log: () => {} });
  if (folder.config.deepen) await runDeepen(folder, { adapters: { claude: fakeDeepener }, log: () => {} });
  blindFolder(folder, { log: () => {} });
  await runJudges(folder, { adapters: { codex: judge(), claude: judge() }, log: () => {} });
  await runDisputes(folder, { adapters: {}, log: () => {} });
  checkFolder(folder, () => {});
  return unblindFolder(folder, { log: () => {} });
}

void test('端到端：init 到 unblind，一課三組各兩份；交三段的評地圖、三組都模擬加深；門檻、對照與評估規格都在', async () => {
  const { root, commit } = fixtureRepo();
  const vault = mkdtempSync(join(tmpdir(), 'rule-test-vault-'));
  mkdirSync(join(vault, 'Essence Cards'));
  writeFileSync(join(vault, 'Essence Cards', 'L1.md'), '---\n科目: 英文\n年級學期: 國二上\n單元: L1\n狀態: 啟用\n---\n- go 英翻中 ^aaaaa2\n    - go :: 去\n');
  const rules = `加深規則: { commit: ${commit}, 檔案: [rules/english.md] }`;
  const folder = initialized(`
名稱: 端到端
課庫: 課
同時: 1
課: [{ 代號: L3, 表單: { 科目: english, 年級學期: 國二上, 單元: L3 }, 已有目標: { vault: ${JSON.stringify(vault)} } }]
組:
  - { 名稱: 甲, 規則: { 自備: { L3: 甲.md } }, ${rules} }
  - { 名稱: 乙, 規則: { 自備: { L3: 乙.md } }, ${rules} }
  - { 名稱: 丙, 規則: { 自備: { L3: 丙.md } }, ${rules} }
生成: [{ 生成器: claude, 模型: claude-opus-5-5, 份數: 2 }]
評審: [{ 評審: codex, 模型: gpt-6.2-sol }, { 評審: claude, 模型: claude-fable-5-2 }]
門檻: { 基準: 甲, 候選: [乙, 丙], 生成器: [claude], 收益: [{ 指標: 判錯, 至少: 20% }] }
加深: { 生成器: [claude] }
對照: [{ 名稱: 三段的效果, 甲: 乙, 乙: 丙 }]
`, { 甲: '組甲\n\n{{任務段}}', 乙: '組乙，交三段 <<<卡組>>>\n\n{{任務段}}', 丙: '組丙\n\n{{任務段}}' });
  await freezeFolder(folder, { root, log: () => {} });
  assert.ok(Object.keys(readLock(folder)!.files).includes('凍結/評估規格.md'));
  assert.match(readFileSync(join(folder.root, '凍結', '評估規格.md'), 'utf8'), /\| 乙 \| 交 \| 跑 \|/);

  const report = await through(folder, () => taggedJudge());
  assert.deepEqual(['甲', '乙', '丙'].map(group => report.decks.filter(deck => deck.group === group).length), [2, 2, 2]);
  const second = report.decks.filter(deck => deck.group === '乙');
  assert.ok(second.every(deck => deck.map?.missed === 0 && deck.map.issues === 0));
  assert.ok(report.decks.filter(deck => deck.group !== '乙').every(deck => deck.map === null));
  assert.ok(report.decks.every(deck => deck.deepen?.pieces === 1 && deck.deepen.items === 1 && deck.deepen.wrong === 0));
  // 三組都一樣：兩份對兩份，份數不到打平的要求（3 份），未定。
  assert.deepEqual(allGates(folder.config.gates, report.decks).map(gate => [gate.candidate, gate.counts.candidate, gate.counts.baseline, gate.verdict]), [['乙', 2, 2, '未定'], ['丙', 2, 2, '未定']]);
  const summary = readFileSync(join(folder.root, '結果', '摘要.md'), 'utf8');
  assert.match(summary, /### 三段的效果：甲 乙、乙 丙\n\n設定的差別：\n\n- 規則檔：只有甲有 L3：提示\/乙\.md；只有乙有 L3：提示\/丙\.md\n/);
  assert.match(summary, /#### 批 1 L3｜claude（甲 2 份、乙 2 份）\n\n- 傷到學習：甲 0\.0、乙 0\.0，一樣\n/);
  assert.ok(summary.includes('對話數（不含重試與重評）：生成 6、加深 6、卡組評分 4、地圖評分 4、加深評分 4'));
  const status = statusLines(folder);
  assert.ok(status.includes('加深：6 份、6 篇｜完成 6、跑中 0、待跑 0、放棄 0'));
  assert.ok(status.includes('批 1：6 份、2 個區組｜已解開（結果/）'));
});

/** 兩組各三份、指定每一份的判錯（記號 a1～a3 是基準、b1～b3 是候選），跑完整個流程，回門檻的總結果。 */
async function verdictOf(harm: Record<string, number>): Promise<string> {
  const { folder, report } = await twoGroups(harm);
  const [gate] = allGates(folder.config.gates, report.decks);
  const summary = readFileSync(join(folder.root, '結果', '摘要.md'), 'utf8');
  assert.ok(summary.includes(`### L3｜claude｜乙 對 甲：${gate.verdict}\n`));
  return `${gate.verdict}：${gate.basis}`;
}

async function twoGroups(harm: Record<string, number>, more?: (result: JudgeResult, code: string, tag: string) => void, extra = ''): Promise<{ folder: Folder; report: BatchReport }> {
  const folder = initialized(`
名稱: 精確的總結果
課庫: 課
同時: 1
課: [{ 代號: L3, 表單: { 科目: english, 年級學期: 國二上, 單元: L3 } }]
組:
  - { 名稱: 甲, 規則: { 自備: { L3: 甲.md } } }
  - { 名稱: 乙, 規則: { 自備: { L3: 乙.md } } }
生成: [{ 生成器: claude, 模型: claude-opus-5-5, 份數: 3 }]
評審: [{ 評審: codex, 模型: gpt-6.2-sol }, { 評審: claude, 模型: claude-fable-5-2 }]
門檻: { 基準: 甲, 候選: [乙], 生成器: [claude], 收益: [{ 指標: 判錯, 至少: 20% }], 打平較省: 只報告 }
${extra}`, { 甲: '組甲\n\n{{任務段}}', 乙: '組乙\n\n{{任務段}}' });
  await freezeFolder(folder, { log: () => {} });
  return { folder, report: await through(folder, () => taggedJudge(harm, more)) };
}

void test('端到端的精確總結果：三份對三份，過、沒過、未定、打平各一個（收益只列一項：k＝1 時 3 對 3 全贏 p＝5% 算明顯）', async () => {
  // 過：候選每份 0 筆判錯、基準每份 1 筆，全贏。
  assert.equal(await verdictOf({ a1: 1, a2: 1, a3: 1 }), '過：學習面有一項明顯比較好');
  // 沒過：候選每份 1 筆、基準 0 筆，傷到學習明顯多。
  assert.equal(await verdictOf({ b1: 1, b2: 1, b3: 1 }), '沒過：有一道沒過');
  // 未定：候選只有一份多 1 筆，傷到學習多了、不明顯。
  assert.equal(await verdictOf({ b1: 1 }), '未定：傷到學習未定');
  // 打平：兩組都是 0，三份以上、每一項都在容許量內，沒有設定次要指標。
  assert.equal(await verdictOf({}), '打平：學習面打平');
});

void test('傷到學習照後果加總、分級跟著設定變：判錯 2、洩漏 1、漏的必備 1、一題多事 1 合計 5（一題多事預設是傷到學習，§12 第 1 題）；調成小問題就不算進去，報告的數字跟著變', async () => {
  const more = (result: JudgeResult, code: string, tag: string): void => {
    if (tag !== 'b1') return;
    result.issues.push({ deck: code, kind: '洩漏', lines: [5], rubric: '', note: '題幹露出答案' }, { deck: code, kind: '一題多事', lines: [3], rubric: '', note: '一題問兩件事' });
    Object.assign(result.rows.find(row => row.row === 'R1')!.decks.find(cell => cell.deck === code)!, { verdict: '沒有', evidence: '', lines: [] });
  };
  const b1 = (report: BatchReport): BatchReport['decks'][number] => report.decks.find(deck => deck.group === '乙' && deck.copy === 1)!;
  const { folder, report } = await twoGroups({ b1: 2 }, more);
  assert.deepEqual([b1(report).harm, b1(report).minor], [{ 判錯: 2, 洩漏: 1, 漏的必備: 1, 其他: 1, total: 5 }, 0]);
  // 學習面的表：乙三份的傷到學習平均 5÷3；評估規格的分級表也跟著。
  assert.ok(readFileSync(join(folder.root, '結果', '摘要.md'), 'utf8').includes('| 乙 | 3 | 0.0 | 1.7 | 0.7 | 0.3 | 0.3 | 0.3 |'));
  assert.match(readFileSync(join(folder.root, '凍結', '評估規格.md'), 'utf8'), /\| 一題多事 \| 傷到學習 \|/);
  const minor = await twoGroups({ b1: 2 }, more, '錯誤分級: { 一題多事: 小問題 }');
  assert.deepEqual([b1(minor.report).harm, b1(minor.report).minor], [{ 判錯: 2, 洩漏: 1, 漏的必備: 1, 其他: 0, total: 4 }, 1]);
  assert.match(readFileSync(join(minor.folder.root, '凍結', '評估規格.md'), 'utf8'), /\| 一題多事 \| 小問題 \|/);
});
