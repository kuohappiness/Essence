// 比較測試工具的格式檢查、匿名與區組、進度（tasks/rule-test-tool.md §5-5、§5-6、§5 status）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Adapter } from '../tools/rule-test/adapters.ts';
import { blindFolder, makeBlocks, readBatch, type BlindEntry } from '../tools/rule-test/blind.ts';
import { checkFolder } from '../tools/rule-test/check.ts';
import { openFolder, type Folder } from '../tools/rule-test/folder.ts';
import { freezeFolder } from '../tools/rule-test/freeze.ts';
import { runQueue } from '../tools/rule-test/generate.ts';
import { statusLines } from '../tools/rule-test/status.ts';

const GOOD = '````markdown\n國二上英文 L3 單字\n- borrow 英翻中\n    - borrow :: v. 借入\n- lend 英翻中\n    - lend :: v. 借出\n<<<完>>>\n````';
const BROKEN = '- borrow 英翻中\n    - borrow ::\n<<<完>>>';

async function folderWith(groups: string[], count: number, gates = '{ 基準: 甲, 候選: [乙], 生成器: [claude], 收益: [{ 指標: 規則字數, 至少: 1% }] }'): Promise<Folder> {
  const root = mkdtempSync(join(tmpdir(), 'rule-test-blind-'));
  mkdirSync(join(root, '課', 'L3'), { recursive: true });
  writeFileSync(join(root, '課', 'L3', '教材.pdf'), '%PDF-1.4 假的');
  mkdirSync(join(root, '提示'));
  for (const name of groups) writeFileSync(join(root, '提示', `${name}.md`), `組${name}\n\n{{任務段}}`);
  writeFileSync(join(root, '測試.yaml'), `
名稱: 匿名測試
課庫: 課
同時: 1
課: [{ 代號: L3, 表單: { 科目: english, 年級學期: 國二上, 單元: L3 } }]
組:
${groups.map(name => `  - { 名稱: ${name}, 規則: { 自備: { L3: ${name}.md } } }`).join('\n')}
生成: [{ 生成器: claude, 模型: claude-opus-5-5, 份數: ${String(count)} }]
評審: [{ 評審: codex, 模型: a }, { 評審: claude, 模型: b }]
門檻: ${gates}
`);
  await freezeFolder(openFolder(root), { log: () => {} });
  return openFolder(root);
}
const reply = (text: (prompt: string) => string): Adapter => request => Promise.resolve({ kind: 'ok', reply: text(request.text), session: null, warnings: [], ms: 1, models: [] });

void test('check：照外掛的 inspectReply 記錯誤、提示與每篇的目標、題、候選、加題；重跑不重算', async () => {
  const folder = await folderWith(['甲', '乙'], 1);
  await runQueue(folder, { adapters: { claude: reply(prompt => prompt.startsWith('組乙') ? BROKEN : GOOD) }, log: () => {} });
  const records = checkFolder(folder, () => {});
  assert.deepEqual(records.map(record => [record.job, record.errors.length, record.pieces]), [
    ['甲-L3-claude-1', 0, [{ name: '國二上英文 L3 單字', targets: 2, prompts: 2, candidates: 0, adds: 0 }]],
    ['乙-L3-claude-1', 1, [{ name: '國二上英文 L3（卡片）', targets: 1, prompts: 1, candidates: 0, adds: 0 }]],
  ]);
  assert.match(records[1].errors[0], /底下沒有答案/);
  const lines: string[] = [];
  checkFolder(folder, line => lines.push(line));
  assert.deepEqual(lines, []);
});

void test('blind：卡組段原字照留、每課打亂代號、每組各取一份成區組；評審資料夾有評分表、教材、題池與加行號的卡組；對照表另外封存', async () => {
  const folder = await folderWith(['甲', '乙'], 2);
  await runQueue(folder, { adapters: { claude: reply(() => GOOD) }, log: () => {} });
  assert.throws(() => blindFolder(folder, { log: () => {} }), /還沒有評分表/);
  writeFileSync(join(folder.root, '課', 'L3', '評分表.md'), '| 列 | 類別 |\n');
  const batch = blindFolder(folder, { random: max => max - 1, log: () => {} });
  assert.equal(batch.entries.length, 4);
  assert.deepEqual(batch.entries.map(entry => entry.code).sort(), ['S1', 'S2', 'S3', 'S4']);
  // 兩個區組，各有甲、乙的第 k 份。
  assert.deepEqual(batch.blocks.map(block => [block.name, block.codes.map(code => batch.entries.find(entry => entry.code === code)!.job)]), [
    ['L3-B01', ['甲-L3-claude-1', '乙-L3-claude-1']],
    ['L3-B02', ['甲-L3-claude-2', '乙-L3-claude-2']],
  ]);
  const dir = join(folder.root, '評分', '批1', '區組', 'L3-B01');
  assert.deepEqual(readdirSync(dir).sort(), ['卡組', '已有目標.json', '教材.pdf', '評分表.md']);
  const code = batch.blocks[0].codes[0];
  assert.equal(readFileSync(join(dir, '卡組', `${code}.md`), 'utf8'), '1\t國二上英文 L3 單字\n2\t- borrow 英翻中\n3\t    - borrow :: v. 借入\n4\t- lend 英翻中\n5\t    - lend :: v. 借出\n');
  assert.equal(readFileSync(join(folder.root, '評分', '批1', '卡組', 'L3', `${code}.md`), 'utf8'), '國二上英文 L3 單字\n- borrow 英翻中\n    - borrow :: v. 借入\n- lend 英翻中\n    - lend :: v. 借出\n');
  // 給評審的資料夾裡沒有組名、生成器與原稿。
  const given = readdirSync(dir, { recursive: true }).map(String).join('\n') + readFileSync(join(dir, '已有目標.json'), 'utf8');
  assert.ok(!/甲|乙|claude/.test(given));
  assert.deepEqual(readBatch(folder, 1).entries, batch.entries);
  // 一批一次：再跑沒有新的原稿。
  assert.throws(() => blindFolder(folder, { log: () => {} }), /沒有新的有效原稿/);
  // 評分表鎖定後改了就停下。
  writeFileSync(join(folder.root, '課', 'L3', '評分表.md'), '| 列 | 類別 | 改過 |\n');
  assert.throws(() => blindFolder(folder, { log: () => {} }), /評分表在鎖定之後改過/);
});

void test('blind：掃到洩漏字樣或切不出卡組段就停下給人看；看過可以 --accept-leaks', async () => {
  const folder = await folderWith(['甲', '乙'], 1);
  writeFileSync(join(folder.root, '課', 'L3', '評分表.md'), '| 列 |\n');
  await runQueue(folder, { adapters: { claude: reply(prompt => prompt.startsWith('組乙') ? GOOD.replace('v. 借出', 'v. 借出（ChatGPT 版）') : GOOD) }, log: () => {} });
  assert.throws(() => blindFolder(folder, { log: () => {} }), /乙-L3-claude-1 第 5 行有「chatgpt」[\s\S]*乙-L3-claude-1 第 5 行有「gpt」/);
  assert.equal(blindFolder(folder, { acceptLeaks: true, log: () => {} }).entries.length, 2);
});

void test('區組：組多於 4 時拆開，每個區組都有基準組的同一份；候選一定和基準同一區組', () => {
  const folder = { config: { gates: { baseline: '甲', candidates: ['乙'] }, groups: ['甲', '乙', '丙', '丁', '戊', '己'].map(name => ({ name })) } } as unknown as Folder;
  const entries: BlindEntry[] = ['甲', '乙', '丙', '丁', '戊', '己'].map((group, i) => ({ lesson: 'L3', code: `S${String(i + 1)}`, job: `${group}-1`, group, generator: 'claude', copy: 1, replacement: false, raws: [], rawSha256: [], deckSha256: '', chars: 0, blocks: [] }));
  const blocks = makeBlocks(folder, entries, () => 1);
  assert.deepEqual(blocks.map(block => [block.name, block.codes]), [['L3-B01', ['S1', 'S2', 'S3', 'S4']], ['L3-B02', ['S1', 'S5', 'S6']]]);
  assert.deepEqual(entries[0].blocks, ['L3-B01', 'L3-B02']);
});

void test('status：凍結、生成、格式、匿名各做到哪裡', async () => {
  const folder = await folderWith(['甲', '乙'], 1);
  assert.deepEqual(statusLines(folder).slice(2), ['生成：2 份｜完成 0、無效 0、跑中 0、待跑 2、放棄 0', '  claude：還沒完成 甲-L3-claude-1（pending）、乙-L3-claude-1（pending）', '格式：0／0 份檢查過', '匿名：還沒（生成都完成後：blind）']);
  await runQueue(folder, { adapters: { claude: () => Promise.resolve({ kind: 'quota', message: '用完', resetsAt: 1_800_000_000 }) }, log: () => {} });
  assert.ok(statusLines(folder).some(line => line.startsWith('上一次停下：額度用完') && line.includes('2027-01-15T08:00:00.000Z')));
  await runQueue(folder, { adapters: { claude: reply(() => GOOD) }, log: () => {} });
  checkFolder(folder, () => {});
  writeFileSync(join(folder.root, '課', 'L3', '評分表.md'), '| 列 |\n');
  blindFolder(folder, { log: () => {} });
  const lines = statusLines(folder);
  assert.ok(lines.includes('格式：2／2 份檢查過'));
  assert.ok(lines.includes('批 1：2 份、1 個區組｜評分中或還沒評（下一步：judge）'));
  assert.ok(!lines.some(line => line.startsWith('上一次停下')));
  assert.ok(!existsSync(join(folder.root, '生成', '執行中.json')));
});
