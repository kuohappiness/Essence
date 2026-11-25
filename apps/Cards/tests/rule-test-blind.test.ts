// 比較測試工具的格式檢查、匿名與區組、進度（tasks/rule-test-tool.md §5-5、§5-6、§5 status）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Adapter } from '../tools/rule-test/adapters.ts';
import { blindFolder, makeBlocks, openBatch, readBlocks, type BlindEntry } from '../tools/rule-test/blind.ts';
import { checkFolder } from '../tools/rule-test/check.ts';
import { openFolder, type Folder } from '../tools/rule-test/folder.ts';
import { freezeFolder } from '../tools/rule-test/freeze.ts';
import { runQueue } from '../tools/rule-test/generate.ts';
import { statusLines } from '../tools/rule-test/status.ts';
import { RUBRIC } from './helpers/rule-test.ts';

const GOOD = '````markdown\n國二上英文 L3 單字\n- borrow 英翻中\n    - borrow :: v. 借入\n- lend 英翻中\n    - lend :: v. 借出\n<<<完>>>\n````';
const BROKEN = '- borrow 英翻中\n    - borrow ::\n<<<完>>>';

async function folderWith(groups: string[], count: number, gates = '{ 基準: 甲, 候選: [乙], 生成器: [claude], 收益: [{ 指標: 判錯, 至少: 1% }] }', rubric?: string, prompts: Record<string, string> = {}): Promise<Folder> {
  const root = mkdtempSync(join(tmpdir(), 'rule-test-blind-'));
  mkdirSync(join(root, '課', 'L3'), { recursive: true });
  writeFileSync(join(root, '課', 'L3', '教材.pdf'), '%PDF-1.4 假的');
  if (rubric !== undefined) writeFileSync(join(root, '課', 'L3', '評分表.md'), rubric);
  mkdirSync(join(root, '提示'));
  for (const name of groups) writeFileSync(join(root, '提示', `${name}.md`), prompts[name] ?? `組${name}\n\n{{任務段}}`);
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
    ['甲-L3-claude-1', 0, [{ name: '國二上英文 L3 單字', targets: 2, prompts: 2, candidates: 0, adds: 0, addPrompts: 0 }]],
    ['乙-L3-claude-1', 1, [{ name: '國二上英文 L3（卡片）', targets: 1, prompts: 1, candidates: 0, adds: 0, addPrompts: 0 }]],
  ]);
  assert.match(records[1].errors[0], /底下沒有答案/);
  const lines: string[] = [];
  checkFolder(folder, line => lines.push(line));
  assert.deepEqual(lines, []);
});

void test('check：加題一項底下三題，孩子要複習的題算 3（rule-test-d236.md §4）', async () => {
  const added = ['````markdown', '國二上英文 L3 單字', '- borrow 英翻中', '    - borrow :: v. 借入', '',
    '> [!note]- 加進已有的學習目標', '> - abc234 lend 英翻中', '>     - lend :: v. 借出', '>     - 「借出」的英文 :: lend', '>     - lend 的過去式 :: lent', '<<<完>>>', '````'].join('\n');
  const folder = await folderWith(['甲', '乙'], 1);
  await runQueue(folder, { adapters: { claude: reply(() => added) }, log: () => {} });
  const records = checkFolder(folder, () => {});
  assert.deepEqual(records.map(record => record.pieces.map(piece => [piece.prompts, piece.adds, piece.addPrompts])), [[[1, 1, 3]], [[1, 1, 3]]]);
});

void test('blind：卡組段原字照留、每課打亂代號、每組各取一份成區組；評審資料夾有評分表、教材、題池與加行號的卡組；對照表另外封存', async () => {
  const folder = await folderWith(['甲', '乙'], 2);
  await runQueue(folder, { adapters: { claude: reply(() => GOOD) }, log: () => {} });
  assert.throws(() => blindFolder(folder, { log: () => {} }), /還沒有評分表/);
  writeFileSync(join(folder.root, '課', 'L3', '評分表.md'), RUBRIC);
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
  // 評分與狀態只讀區組（代號），對照表鎖定前讀不到（§8 第 12 條）。
  assert.deepEqual(readBlocks(folder, 1), batch.blocks);
  assert.throws(() => openBatch(folder, 1), /批 1 還沒鎖定/);
  // 一批一次：再跑沒有新的原稿。
  assert.throws(() => blindFolder(folder, { log: () => {} }), /沒有新的有效原稿/);
  // 評分表鎖定後改了就停下。
  writeFileSync(join(folder.root, '課', 'L3', '評分表.md'), `${RUBRIC}\n| R3 | 必備 | 改過加的一列 | p.4 | | |`);
  assert.throws(() => blindFolder(folder, { log: () => {} }), /評分表在鎖定之後改過/);
});

void test('blind：區組裡的順序也打亂，評審拿到的清單不會總是基準組在前（PR #54 Codex P2）', async () => {
  const folder = await folderWith(['甲', '乙'], 1);
  await runQueue(folder, { adapters: { claude: reply(() => GOOD) }, log: () => {} });
  writeFileSync(join(folder.root, '課', 'L3', '評分表.md'), RUBRIC);
  // random 回 0：兩份時一定對調，區組裡的順序就不是組的順序（基準組在前）。
  const batch = blindFolder(folder, { random: () => 0, log: () => {} });
  const group = (code: string): string => batch.entries.find(entry => entry.code === code)!.group;
  assert.deepEqual(batch.blocks[0].codes.map(group), ['乙', '甲']);
  assert.deepEqual(readBlocks(folder, 1)[0].codes, batch.blocks[0].codes);
});

void test('blind：掃到洩漏字樣或切不出卡組段就停下給人看；看過可以 --accept-leaks', async () => {
  const folder = await folderWith(['甲', '乙'], 1);
  writeFileSync(join(folder.root, '課', 'L3', '評分表.md'), RUBRIC);
  await runQueue(folder, { adapters: { claude: reply(prompt => prompt.startsWith('組乙') ? GOOD.replace('v. 借出', 'v. 借出（ChatGPT 版）') : GOOD) }, log: () => {} });
  assert.throws(() => blindFolder(folder, { log: () => {} }), /乙-L3-claude-1 第 5 行有「chatgpt」[\s\S]*乙-L3-claude-1 第 5 行有「gpt」/);
  assert.equal(blindFolder(folder, { acceptLeaks: true, log: () => {} }).entries.length, 2);
});

void test('blind 的地圖（rule-test-d236.md §5-1、§5-2）：交三段的組切出地圖、標記換成標題另放一個資料夾；應交沒交記原因；不交的組沒有地圖', async () => {
  const map = (frame: string): string => ['````markdown', '<<<全貌>>>', '- 這一課學借與還', '<<<架構>>>', frame, '<<<卡組>>>', '國二上英文 L3 單字', '- borrow 英翻中', '    - borrow :: v. 借入', '<<<完>>>', '````'].join('\n');
  const folder = await folderWith(['甲', '乙'], 2, undefined, RUBRIC, { 乙: '組乙：照三段交\n\n<<<卡組>>>\n\n{{任務段}}' });
  let n = 0;
  await runQueue(folder, { adapters: { claude: reply(prompt => prompt.startsWith('組乙') ? map(n++ === 0 ? '- 能分辨 borrow 與 lend' : '') : GOOD) }, log: () => {} });
  const batch = blindFolder(folder, { random: max => max - 1, log: () => {} });
  const byJob = Object.fromEntries(batch.entries.map(entry => [entry.job, entry]));
  assert.deepEqual(byJob['甲-L3-claude-1'].map, { kind: 'none' });
  assert.equal(byJob['乙-L3-claude-1'].map.kind, 'ok');
  assert.deepEqual(byJob['乙-L3-claude-2'].map, { kind: 'missing', why: '架構是空的' });
  const withMap = byJob['乙-L3-claude-1'];
  const block = batch.blocks.find(each => each.codes.includes(withMap.code))!;
  assert.deepEqual(block.maps, [withMap.code]);
  assert.deepEqual(batch.blocks.find(each => each !== block)!.maps, []);
  const dir = join(folder.root, '評分', '批1');
  assert.equal(readFileSync(join(dir, '地圖', 'L3', `${withMap.code}.md`), 'utf8'), '## 全貌\n- 這一課學借與還\n## 架構\n- 能分辨 borrow 與 lend\n');
  assert.deepEqual(readdirSync(join(dir, '地圖區組', block.name)).sort(), ['地圖', '已有目標.json', '教材.pdf', '評分表.md']);
  assert.equal(readFileSync(join(dir, '地圖區組', block.name, '地圖', `${withMap.code}.md`), 'utf8'), '1\t## 全貌\n2\t- 這一課學借與還\n3\t## 架構\n4\t- 能分辨 borrow 與 lend\n');
  assert.ok(!existsSync(join(dir, '區組', block.name, '地圖')));
  assert.ok(!existsSync(join(dir, '地圖區組', batch.blocks.find(each => each !== block)!.name)));
});

void test('區組：組多於 4 時拆開，每個區組都有基準組的同一份；候選一定和基準同一區組', () => {
  const folder = { config: { gates: { baseline: '甲', candidates: ['乙'] }, groups: ['甲', '乙', '丙', '丁', '戊', '己'].map(name => ({ name })) } } as unknown as Folder;
  const entries: BlindEntry[] = ['甲', '乙', '丙', '丁', '戊', '己'].map((group, i) => ({ lesson: 'L3', code: `S${String(i + 1)}`, job: `${group}-1`, group, generator: 'claude', copy: 1, replacement: false, raws: [], rawSha256: [], deckSha256: '', chars: 0, blocks: [], map: i === 2 ? { kind: 'ok' as const, sha256: '' } : { kind: 'none' as const } }));
  const blocks = makeBlocks(folder, entries, () => 1);
  assert.deepEqual(blocks.map(block => [block.name, block.codes, block.maps]), [['L3-B01', ['S1', 'S2', 'S3', 'S4'], ['S3']], ['L3-B02', ['S1', 'S5', 'S6'], []]]);
  assert.deepEqual(entries[0].blocks, ['L3-B01', 'L3-B02']);
});

void test('status：凍結、生成、格式、匿名各做到哪裡', async () => {
  const folder = await folderWith(['甲', '乙'], 1);
  assert.deepEqual(statusLines(folder).slice(2), ['生成：2 份｜完成 0、無效 0、跑中 0、待跑 2、放棄 0', '  claude：還沒完成 甲-L3-claude-1（pending）、乙-L3-claude-1（pending）', '格式：0／0 份檢查過', '匿名：還沒（生成都完成後：blind）']);
  await runQueue(folder, { adapters: { claude: () => Promise.resolve({ kind: 'quota', message: '用完', resetsAt: 1_800_000_000 }) }, log: () => {} });
  assert.ok(statusLines(folder).some(line => line.startsWith('上一次停下：額度用完') && line.includes('2027-01-15T08:00:00.000Z')));
  await runQueue(folder, { adapters: { claude: reply(() => GOOD) }, log: () => {} });
  checkFolder(folder, () => {});
  writeFileSync(join(folder.root, '課', 'L3', '評分表.md'), RUBRIC);
  blindFolder(folder, { log: () => {} });
  const lines = statusLines(folder);
  assert.ok(lines.includes('格式：2／2 份檢查過'));
  assert.ok(lines.includes('批 1：2 份、1 個區組｜評分 0／2（下一步：judge）'));
  assert.ok(!lines.some(line => line.startsWith('上一次停下')));
  assert.ok(!existsSync(join(folder.root, '生成', '執行中.json')));
});

/** 第一輪的評分表：欄位順序不同（類別在第 4 欄），重大錯誤另外放一節。 */
const ROUND_ONE_RUBRIC = '| 編號 | 要考的知識或判準 | 頁碼或圖號 | 必備或加分 | 可以接受的等價做法 | 跨單元去向 |\n|---|---|---|---|---|---|\n| R1 | borrow 的字義 | p.3 | 必備 | | |';

void test('凍結與匿名：評分表格式不合就停下、不鎖（2026-11-25 使用者電腦：第一輪的評分表凍結照樣鎖進去，之後換不掉）', async () => {
  await assert.rejects(folderWith(['甲', '乙'], 1, undefined, ROUND_ONE_RUBRIC), /評分表[\s\S]*類別「要考的知識或判準」不是 必備、加分、重大錯誤/);
  const folder = await folderWith(['甲', '乙'], 1);
  await runQueue(folder, { adapters: { claude: reply(() => GOOD) }, log: () => {} });
  writeFileSync(join(folder.root, '課', 'L3', '評分表.md'), ROUND_ONE_RUBRIC);
  assert.throws(() => blindFolder(folder, { log: () => {} }), /評分表[\s\S]*不是 必備、加分、重大錯誤/);
  assert.equal(existsSync(join(folder.root, '凍結', '評分表', 'L3.sha256')), false);
  writeFileSync(join(folder.root, '課', 'L3', '評分表.md'), RUBRIC);
  assert.equal(blindFolder(folder, { log: () => {} }).entries.length, 2);
});

void test('blind：組名叫「候選」時，外掛規定的「候選卡片」框標題不算洩漏，其他地方的組名照樣停下（2026-11-25 使用者電腦）', async () => {
  const gates = '{ 基準: 現行, 候選: [候選], 生成器: [claude], 收益: [{ 指標: 判錯, 至少: 1% }] }';
  const boxed = GOOD.replace('<<<完>>>', '> [!note]- 候選卡片\n> - give 英翻中\n>     - 理由：課本 p.4 有\n>     - give :: v. 給\n<<<完>>>');
  const folder = await folderWith(['現行', '候選'], 1, gates, RUBRIC);
  await runQueue(folder, { adapters: { claude: reply(() => boxed) }, log: () => {} });
  assert.equal(blindFolder(folder, { log: () => {} }).entries.length, 2);
  const leaky = await folderWith(['現行', '候選'], 1, gates, RUBRIC);
  await runQueue(leaky, { adapters: { claude: reply(() => boxed.replace('v. 給', 'v. 給（候選組的寫法）')) }, log: () => {} });
  assert.throws(() => blindFolder(leaky, { log: () => {} }), /第 \d+ 行有「候選」/);
});
