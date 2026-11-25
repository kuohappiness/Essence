import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFile, mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildPrompt, RULE_MARKER, RULE_SUBJECTS, ruleText } from '../src/core/ai/index.ts';
import { buildPlugin, embedRules, RULES_FROM_ROOT, ruleFiles } from '../tools/build.mjs';

// tasks/ai-cards-mvp.md §1：規則組嵌進外掛、記版號與雜湊。

const root = fileURLToPath(new URL('../', import.meta.url));
const sha = (text: string): string => createHash('sha256').update(text, 'utf8').digest('hex');

void test('§1 送出範圍：只送標記以下，換行統一成 \\n、拿掉 BOM 與前後空行；R3 整份送，拿掉單獨一行的 {{任務資料}}', () => {
  const doc = '﻿# 標題\r\n\r\n> 狀態：v0.2，估 35～45 個\r\n\r\n' + RULE_MARKER + '\r\n\r\n## 規則\r\n\r\n- 一\r\n\r\n';
  assert.equal(ruleText(doc, { path: 'a.md', marker: true }), '## 規則\n\n- 一');
  assert.equal(ruleText('# 五步\n\n做法\n\n{{任務資料}}\n', { path: 'b.md', marker: false }), '# 五步\n\n做法');
  assert.throws(() => ruleText('# 沒有標記\n', { path: 'c.md', marker: true }), /c\.md 找不到標記/);
  assert.throws(() => ruleText('{{科目預設}}\n', { path: 'd.md', marker: false }), /d\.md 還有沒填的變數/);
  assert.throws(() => ruleText('# x\n' + RULE_MARKER + '\n\n', { path: 'e.md', marker: true }), /e\.md 送出的部分是空的/);
});

void test('§1 表：五科全開（§0），規則照表的順序；card-rules 的每一份剛好一個標記，狀態框不送', async () => {
  assert.deepEqual(RULE_SUBJECTS.map(subject => subject.label), ['國語（國小）', '英文（國中）', '自然', '社會（國小）', '其他']);
  const r3 = ['格式', '短規則', '判斷邊界', '五步'];
  assert.deepEqual(Object.fromEntries(RULE_SUBJECTS.map(subject => [subject.key, subject.files.map(file => `${file.name} ${file.version}`)])), {
    chinese: [...r3.map(name => name + ' R3 第二輪'), '國小國語 v0.11'],
    english: ['通用 v0.16', '英文 v0.16'],
    science: r3.map(name => name + ' R3 第二輪'),
    general: ['通用 v0.16', '一般知識 v0.5'],
    social: [...r3.map(name => name + ' R3 第二輪'), '國小社會 v0.9'],
  });
  // 只挑 Cards 的製卡規則（R3 的實驗檔整份送、沒有標記）；挑不到時這一段會默默跳過，所以先確認有挑到。
  const marked = ruleFiles().filter(path => path.startsWith('apps/Cards/docs/card-rules/'));
  assert.ok(marked.length > 0, '一份 card-rules 都沒挑到');
  for (const path of marked) {
    const text = await readFile(join(root, RULES_FROM_ROOT, path), 'utf8');
    assert.equal(text.split(RULE_MARKER).length - 1, 1, path + ' 的標記');
  }
  const rules = await embedRules();
  for (const subject of RULE_SUBJECTS) {
    assert.deepEqual(rules[subject.key].map(rule => rule.name), subject.files.map(file => file.name));
    for (const rule of rules[subject.key]) {
      assert.equal(rule.sha256, sha(rule.text), rule.name);
      assert.ok(!rule.text.includes('> 狀態') && !rule.text.includes('\r') && !rule.text.includes('{{'), rule.name);
    }
  }
  // 狀態框裡給 AI 的那一段搬到標記下面，字不改（§1）。
  assert.ok(rules.english[1].text.startsWith('適用於國中英文，不限版本；國小之後用同一份接上。搭配通用規則（common.md）使用；與通用規則衝突時，以本檔為準。'));
  assert.ok(rules.english[0].text.startsWith('## 你的任務'));
});

void test('§3 社會的提示：規則寫的已有目標格式和任務段實際送出的相同（L2 規格核對）', async () => {
  const social = RULE_SUBJECTS.find(subject => subject.key === 'social')!;
  const rules = (await embedRules()).social;
  const prompt = buildPrompt({ subject: 'social', term: '小五上', unit: '2-2 人口', purpose: '準備段考', supplement: true, adjust: '', material: '' }, social, rules, [{ id: 'k3m9qa', name: '能說出台灣東部海岸的地形', source: '小五上 2-1 p.30', path: 'a.md', first: '台灣東部海岸是什麼地形？ :: 斷層海岸' }]);
  assert.ok(prompt.text.includes('收到的已有目標每項是 `ID 名稱｜出處｜第一題`'));
  assert.ok(!prompt.text.includes('名稱｜ID｜出處'));
  assert.ok(prompt.parts.at(-1)!.text.includes('  - k3m9qa 能說出台灣東部海岸的地形｜小五上 2-1 p.30｜第一題：台灣東部海岸是什麼地形？ :: 斷層海岸\n'));
});

void test('§1 建置：表上的檔讀不到就失敗，說出是哪一份', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'essence-rules-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  await assert.rejects(embedRules(dir), /AI 製卡的規則檔讀不到：experiments\/t4\/arch\/第二輪\/格式\.md/);
});

void test('D-208 第二步 §A5 規則檔的基準和 Cards 的根分開：預設是 repo 的根，buildPlugin 的 rulesRoot 可以另外指定', async t => {
  const repo = resolve(execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd: root, encoding: 'utf8' }).trim());
  assert.equal(resolve(root, RULES_FROM_ROOT), repo, '表上的路徑從 repo 的根算');
  const expected = await embedRules(repo);
  assert.deepEqual(await embedRules(), expected, '不給基準時用 repo 的根');
  // 只有規則檔、沒有 Cards 程式的資料夾也讀得到：讀的是基準，不是 Cards 的根。
  const copy = await mkdtemp(join(tmpdir(), 'essence-rules-root-'));
  const empty = await mkdtemp(join(tmpdir(), 'essence-rules-empty-'));
  t.after(async () => { await rm(copy, { recursive: true, force: true }); await rm(empty, { recursive: true, force: true }); });
  for (const path of ruleFiles()) {
    await mkdir(dirname(join(copy, path)), { recursive: true });
    await copyFile(join(repo, path), join(copy, path));
  }
  assert.deepEqual(await embedRules(copy), expected);
  await assert.rejects(buildPlugin({ root, rulesRoot: empty, outdir: empty }), /AI 製卡的規則檔讀不到/, 'buildPlugin 照 rulesRoot 讀');
});
