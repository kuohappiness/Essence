import test from 'node:test';
import type { TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gitEnv, pluginRoot } from '../tools/git.ts';
import { snapshot } from '../tools/compare/adapter.ts';
import { diffSnapshots } from '../tools/compare/snapshot.ts';
import { goal, tempFolder } from './helpers/vault.ts';

// 比較工具的單選（tasks/matching-single-choice.md §8）：卡型摘要多 single；舊版沒有這個卡型，有選項行的目標舊版是 null、新版是 single，
// 沒有選項行的卡組零差異。預期值照筆記手寫。
const root = fileURLToPath(new URL('../', import.meta.url));
const env = gitEnv();
const git = (dir: string, ...args: string[]): string => execFileSync('git', args, { cwd: dir, env, encoding: 'utf8' }).trim();
const time = (ms: number): string => new Date(ms).toISOString();
const NOW = Date.UTC(2026, 9, 29, 12);
const A = 'Essence Cards/A.md';
const B = 'Essence Cards/B.md';
const COASTS = '---\n科目: 社會\n---\n' + `- 能說出臺灣北部海岸的地形 ^north0
    - 臺灣北部的海岸是哪一種海岸？ :: 岩岸
    - 選項：岩岸;;沙岸;;斷層海岸;;珊瑚礁海岸
- 能說出臺灣東部海岸的地形 ^east00
    - 臺灣東部的海岸是哪一種海岸？ :: 斷層海岸
    - 東部的海岸有什麼特色？ :: 斷層海岸
    - 選項：岩岸;;沙岸;;斷層海岸;;珊瑚礁海岸
- 能說出臺灣西部海岸的地形 ^west00
    - 臺灣西部的海岸是哪一種海岸？ :: 沙岸
    - 選項：岩岸;;沙岸;;斷層海岸;;珊瑚礁海岸
`;
const PLAIN = goal('aaa111') + goal('bbb222');

async function deployed(t: TestContext, tag: string): Promise<string> {
  const dir = await tempFolder(t, 'essence-deployed-');
  git(root, 'clone', '-q', '--no-checkout', git(root, 'rev-parse', '--show-toplevel'), dir);
  git(dir, 'checkout', '-q', tag);
  const cards = join(dir, pluginRoot(dir, tag));
  await symlink(join(root, 'node_modules'), join(cards, 'node_modules'), 'junction');
  return cards;
}

void test('卡型摘要：單選是 [選項] 與每一題的答案位置；今天的份同一組併成一張三格', async () => {
  const snap = await snapshot(root, { now: NOW, offset: 480, files: { [A]: COASTS } });
  const kinds = Object.fromEntries(snap.decks.flatMap(deck => deck.targets.map(target => [target.key, target.kind])));
  const options = ['岩岸', '沙岸', '斷層海岸', '珊瑚礁海岸'];
  assert.deepEqual(kinds, {
    north0: { id: 'single', style: null, items: [options], marks: [[0]] },
    east00: { id: 'single', style: null, items: [options], marks: [[2, 2]] },
    west00: { id: 'single', style: null, items: [options], marks: [[1]] },
  });
  assert.deepEqual(snap.decks.flatMap(deck => deck.problems), []);
  assert.deepEqual(snap.today.map(item => [item.lt, item.type, item.cells]), [['north0', 'pick', 3], ['east00', 'pick', 3], ['west00', 'pick', 3]]);
});

void test('發布比較：v0.6.0 對現在，沒有選項行的卡組零差異；有選項行的看得到卡型、題型與格數不同', async t => {
  const old = await deployed(t, 'v0.6.0');
  const plain = { now: NOW, offset: 480, files: { [B]: PLAIN } };
  assert.deepEqual(diffSnapshots(await snapshot(old, plain), await snapshot(root, plain), time), []);
  const mixed = { now: NOW, offset: 480, files: { [A]: COASTS, [B]: PLAIN } };
  const before = await snapshot(old, mixed), after = await snapshot(root, mixed);
  assert.deepEqual(before.decks.flatMap(deck => deck.targets.map(target => target.kind)), [null, null, null, null, null]);
  assert.deepEqual(after.decks.find(deck => deck.path === B), before.decks.find(deck => deck.path === B), '別篇照常');
  const lines = diffSnapshots(before, after, time);
  assert.ok(lines.length > 0);
  assert.ok(lines.every(line => line.includes(A) || /north0|east00|west00/.test(line)), lines.join('\n'));
  assert.deepEqual(before.today.filter(item => item.deck === A).map(item => [item.lt, item.type, item.cells]), [['north0', 'flip', 1], ['east00', 'flip', 1], ['west00', 'flip', 1]]);
});
