import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { findSection, headings } from '../section.ts';

const DOC = [
  '# 標題',
  '',
  '前言',
  '',
  '## 待處理',
  '',
  '### 技術債',
  '',
  '```markdown',
  '## 程式碼裡的不算',
  '```',
  '',
  '### 已知的限制',
  '',
  '內容',
  '',
  '## 已轉出',
  '',
  '### 技術債（舊）',
  '',
].join('\n');

void test('標題：行號、層級、每一節到下一個同級或更高的標題為止；程式碼區塊裡的不算', () => {
  const all = headings(DOC);
  assert.deepEqual(all.map(h => [h.level, h.title, h.line, h.end]), [
    [1, '標題', 1, 19], [2, '待處理', 5, 16], [3, '技術債', 7, 12], [3, '已知的限制', 13, 16], [2, '已轉出', 17, 19], [3, '技術債（舊）', 19, 19],
  ]);
  assert.equal(all[2].chars, [...DOC.split('\n').slice(6, 12).join('\n')].length);
});

void test('完全相同的優先，沒有才比包含；好幾個候選或沒對到都回候選', () => {
  const exact = findSection(DOC, '技術債');
  assert.ok('section' in exact && exact.section.line === 7);
  const contains = findSection(DOC, '限制');
  assert.ok('section' in contains && contains.section.title === '已知的限制');
  const many = findSection(DOC, '技術');
  assert.ok('candidates' in many && many.candidates.length === 2);
  const none = findSection(DOC, '沒有這節');
  assert.ok('candidates' in none && none.candidates.length === 6);
  // 標題裡的連結、反引號與結尾的 # 只看文字。
  const fancy = findSection('# a\n\n## 用 `section` 讀 [文件](x.md) ##\n\n內容\n', '用 section 讀 文件');
  assert.ok('section' in fancy && fancy.section.line === 3);
});

void test('命令列：印那一節與行號；沒對到 exit 1 並列出標題；不給標題列出全部', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'essence-section-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const file = join(dir, 'doc.md');
  await writeFile(file, DOC.replaceAll('\n', '\r\n'));
  const script = fileURLToPath(new URL('../section.ts', import.meta.url));
  const run = (...args: string[]) => spawnSync(process.execPath, [script, file, ...args], { encoding: 'utf8' });
  const one = run('已知的限制');
  assert.equal(one.status, 0);
  assert.equal(one.stdout, `${file}:13-16\n### 已知的限制\n\n內容\n\n`);
  const missing = run('沒有這節');
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /全部的標題/);
  assert.match(missing.stderr, /17 {2}## 已轉出/);
  const many = run('技術');
  assert.equal(many.status, 1);
  assert.match(many.stderr, /好幾個/);
  const list = run();
  assert.equal(list.status, 0);
  assert.equal(list.stdout.trim().split('\n').length, 6);
});
