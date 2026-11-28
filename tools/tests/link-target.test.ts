// 檔名有括號的連結（guide(v1).md）：切連結目標的工具都共用 link-target.ts，每支都認得整個檔名（文件檢查的部分在 check-docs.test.ts）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { checkMirror, COPIES, SHARED } from '../check-skill-mirror.ts';
import { parseDecisions } from '../decisions.ts';
import { asTarget, LINK_TARGET } from '../link-target.ts';
import { moveText } from '../roadmap-sync.ts';
import { parseStatus } from '../status-line.ts';

const targets = (text: string) => [...text.matchAll(new RegExp(String.raw`\]\((${LINK_TARGET})\)`, 'g'))].map(m => m[1]);

void test('目標裡成對的括號算在檔名裡；不成對的不收，和 CommonMark 一樣', () => {
  assert.deepEqual(targets('見 [指南](guide(v1).md#一節)、[空白](<a (b).md>)、[一般](a.md)。'), ['guide(v1).md#一節', '<a (b).md>', 'a.md']);
  // 連結後面的括號、包住整個連結的括號都不吃進來。
  assert.deepEqual(targets('（見 [甲](a.md) (備註)）、([乙](b(1).md))'), ['a.md', 'b(1).md']);
  assert.deepEqual(targets('[壞](a(b.md) 和 [壞](a)b).md)'), ['a']);
});

void test('工具寫出的目標：切得回原樣的照寫，有空白或不成對的括號用 <> 包', () => {
  assert.equal(asTarget('guide(v1).md#一節'), 'guide(v1).md#一節');
  assert.equal(asTarget('Claude Codex Discussion/d.md'), '<Claude Codex Discussion/d.md>');
  assert.equal(asTarget('a(b.md'), '<a(b.md>');
  for (const path of ['guide(v1).md', 'a b.md', 'a(b.md', 'a)b.md']) assert.deepEqual(targets(`[x](${asTarget(path)})`).map(t => t.replace(/^<|>$/g, '')), [path]);
});

void test('roadmap 同步：入口的連結有括號時照樣改基準', () => {
  assert.deepEqual(moveText('看 [指南](../guide(v1).md#一節)、[舊版](<../a(b.md>)', 'docs/tasks/x.md', 'docs/roadmap.md'),
    { text: '看 [指南](guide(v1).md#一節)、[舊版](<a(b.md>)' });
});

void test('狀態行：「已結案 →」的下一站可以是檔名有括號的連結，外部連結照樣擋', () => {
  const ok = parseStatus('狀態：已結案 → [指南](../plans/guide(v1).md)、D-218｜完成：談定｜等誰：—');
  assert.ok('status' in ok && ok.status.state === '已結案');
  const external = parseStatus('狀態：已結案 → [外連](https://example.invalid/a(b))｜完成：交出去｜等誰：—');
  assert.ok('error' in external && /下一站要在 repo 裡/.test(external.error));
});

void test('決策紀錄：「來自」的連結有括號時整個路徑都記下', () => {
  const parsed = parseDecisions(['# 決策紀錄', '', '## D-006 己', '', '✅ 2026-01-06｜來自 [指南](plans/guide(v1).md#一節)', '', '主題：畫面｜一句話：己。', ''].join('\n'), 6);
  assert.deepEqual(parsed.byId.get('D-006')!.sources, ['plans/guide(v1).md#一節']);
});

void test('skill 鏡像檢查：檔名有括號的連結找得到就不報，找不到時報整個檔名', async t => {
  const root = await mkdtemp(join(tmpdir(), 'essence-link-target-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const put = async (path: string, text: string) => {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), text);
  };
  for (const copy of COPIES) {
    for (const skill of SHARED) {
      await put(`${copy}/${skill}/SKILL.md`, '見 [指南](guide(v1).md)、[舊版](old(v0).md)。\n');
      await put(`${copy}/${skill}/guide(v1).md`, '指南\n');
      await put(`${copy}/${skill}/agents/openai.yaml`, 'interface: {}\n');
    }
  }
  assert.deepEqual(checkMirror(root), SHARED.flatMap(skill => COPIES.map(copy => `連結找不到：${copy}/${skill}/SKILL.md → old(v0).md`)));
});
