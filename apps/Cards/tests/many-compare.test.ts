import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { snapshot } from '../tools/compare/adapter.ts';
import { diffSnapshots } from '../tools/compare/snapshot.ts';
import { TOWNS } from './helpers/many.ts';
import { checkout } from './helpers/old-version.ts';

// 比較工具的一列好幾個（tasks/matching-many.md §9）：many 的單選摘要是 style 'many'、每一題一份答案位置；
// 第 1 段的 answers 是平的、沒有 many，同一支 adapter 讀兩版，沒有 many 的摘要相同。預期值照筆記手寫。
const root = fileURLToPath(new URL('../', import.meta.url));
const time = (ms: number): string => new Date(ms).toISOString();
const NOW = Date.UTC(2026, 9, 29, 12);
const A = 'Essence Cards/A.md';
const COASTS = '---\n科目: 社會\n---\n' + `- 能說出臺灣北部海岸的地形 ^north0
    - 臺灣北部的海岸是哪一種海岸？ :: 岩岸
    - 選項：岩岸;;沙岸;;斷層海岸;;珊瑚礁海岸
- 能說出臺灣東部海岸的地形 ^east00
    - 臺灣東部的海岸是哪一種海岸？ :: 斷層海岸
    - 東部的海岸有什麼特色？ :: 斷層海岸
    - 選項：岩岸;;沙岸;;斷層海岸;;珊瑚礁海岸
`;
const MIXED = '---\n科目: 社會\n---\n' + TOWNS + `- 能說出清水的名產 ^qing00
    - 清水的名產有哪些？ :: A;;D
    - 清水最有名的是哪一樣？ :: B
    - 選項：A;;B;;C;;D;;E
`;

void test('卡型摘要：many 的單選是 style many、每一題一份答案位置；今天的份同一組一張', async () => {
  const snap = await snapshot(root, { now: NOW, offset: 480, files: { [A]: MIXED } });
  const kinds = Object.fromEntries(snap.decks.flatMap(deck => deck.targets.map(target => [target.key, target.kind])));
  const items = [['A', 'B', 'C', 'D', 'E']];
  assert.deepEqual(kinds, {
    lukang: { id: 'single', style: 'many', items, marks: [[0, 3, 4]] },
    dajia0: { id: 'single', style: 'many', items, marks: [[1]] },
    waipu0: { id: 'single', style: 'many', items, marks: [[2, 3]] },
    qing00: { id: 'single', style: 'many', items, marks: [[0, 3], [1]] },
  });
  assert.deepEqual(snap.today.map(item => [item.lt, item.type, item.cells]), [['lukang', 'pick', 4], ['dajia0', 'pick', 4], ['waipu0', 'pick', 4], ['qing00', 'pick', 4]]);
});

void test('第 1 段（bad3e103）對現在：沒有 many 的單選摘要相同、零差異', async t => {
  const old = await checkout(t, 'bad3e103');
  const input = { now: NOW, offset: 480, files: { [A]: COASTS } };
  const before = await snapshot(old, input), after = await snapshot(root, input);
  const options = ['岩岸', '沙岸', '斷層海岸', '珊瑚礁海岸'];
  for (const snap of [before, after]) {
    assert.deepEqual(snap.decks.flatMap(deck => deck.targets.map(target => [target.key, target.kind])), [
      ['north0', { id: 'single', style: null, items: [options], marks: [[0]] }],
      ['east00', { id: 'single', style: null, items: [options], marks: [[2, 2]] }],
    ]);
  }
  assert.deepEqual(diffSnapshots(before, after, time), []);
});
