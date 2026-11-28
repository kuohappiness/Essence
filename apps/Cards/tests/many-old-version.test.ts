import test from 'node:test';
import assert from 'node:assert/strict';
import { parseDeck } from '../src/core/deck/index.ts';
import { parseLine } from '../src/core/study/index.ts';
import { oldRun, PARSE_LINE_SCRIPT } from './helpers/old-version.ts';
import type { OldRun } from './helpers/old-version.ts';
import { TOWNS } from './helpers/many.ts';

// 答案好幾個的卡組給舊版讀（tasks/matching-many.md §2〈舊版〉、〈驗收〉〈認法〉）：v0.6.0 標籤與只有第 1 段的版本（bad3e103）讀同一份卡組，
// 每一題的讀法與指紋和新版相同，紀錄才對得上同一題；卡型與提示照 §2 的表，預期值手寫。

const PART_ONE = 'bad3e103';
const DECK = `---
科目: 社會
---
${TOWNS}- 能說出 X 的名產 ^xxxxx0
    - X 的名產有哪些？ :: A;;X
    - 選項：A;;B;;C;;D;;E
- 能說出整串的名產 ^whole0
    - 整串的名產有哪些？ :: A;D
    - 選項：A;D;;B;;C
- 能說出頭尾的名產 ^semi00
    - 頭尾的名產有哪些？ :: B
    - 選項：A; ;; B;;C
- 能說出沒有選項的名產 ^bare00
    - 沒有選項的名產有哪些？ :: A;;D
- 能說出空的名產 ^empty0
    - 空的名產有哪些？ :: ;;
    - 選項：A;;B;;C;;D;;E
`;
const IDS = ['lukang', 'dajia0', 'waipu0', 'xxxxx0', 'whole0', 'semi00', 'bare00', 'empty0'];
const prints = (run: OldRun): [string, string][][] => run.targets.map(target => target.prompts);

void test('新版、只有第 1 段、v0.6.0 讀同一份卡組：卡型與提示照 §2 的表，每一題的讀法與指紋相同', async t => {
  const now = parseDeck(DECK);
  const nowRun: OldRun = {
    targets: now.targets.map(target => ({ id: target.id, ok: target.ok, kind: target.kind?.id ?? null, shared: target.shared, prompts: target.prompts.map(prompt => [prompt.kind, prompt.fingerprint]) })),
    problems: now.problems.map(problem => problem.code),
  };
  assert.deepEqual(nowRun.targets.map(target => [target.id, target.kind]), [
    ['lukang', 'single'], ['dajia0', 'single'], ['waipu0', 'single'], ['xxxxx0', null], ['whole0', 'single'], ['semi00', null], ['bare00', null], ['empty0', null],
  ]);
  assert.deepEqual(now.problems.map(problem => problem.code), ['options-invalid', 'options-invalid', 'options-invalid']);
  const part = await oldRun(t, PART_ONE, [DECK]) as OldRun;
  assert.deepEqual(part.targets.map(target => [target.id, target.kind]), [
    ['lukang', null], ['dajia0', 'single'], ['waipu0', null], ['xxxxx0', null], ['whole0', 'single'], ['semi00', 'single'], ['bare00', null], ['empty0', null],
  ]);
  assert.deepEqual(part.problems, ['options-invalid', 'options-invalid', 'options-invalid', 'options-invalid']);
  const old = await oldRun(t, 'v0.6.0', [DECK]) as OldRun;
  assert.deepEqual(old.targets.map(target => [target.id, target.kind]), IDS.map(id => [id, null]));
  assert.deepEqual(old.problems, []);
  assert.ok(nowRun.targets.every(target => target.prompts.every(([kind]) => kind === 'qa')));
  assert.deepEqual(prints(part), prints(nowRun));
  assert.deepEqual(prints(old), prints(nowRun));
  assert.deepEqual(old.targets.map(target => target.shared), nowRun.targets.map(target => target.shared));
});

void test('紀錄：v0.6.0 與只有第 1 段的 parseLine 讀 pick 是清單的行，每一行都是合法的作答（不用 need）；新版也一樣', async t => {
  // §5〈紀錄〉的例子，加一行第一次按沒印象、一行 also 裡的 pick 是清單。
  const lines = [
    '{"t":"2026-12-10T19:00:00.000+08:00","lt":"lukang","r":"near","v":"3c4d5e6f","pick":["A","D"],"retry":"right"}',
    '{"t":"2026-12-10T19:00:00.001+08:00","lt":"dajia0","r":"good","v":"7a8b9c0d","pick":["B"],"with":"2026-12-10T19:00:00.000+08:00"}',
    '{"t":"2026-12-10T19:00:00.002+08:00","lt":"waipu0","r":"miss","v":"1e2f3a4b","pick":["C","D","A"],"retry":"wrong","with":"2026-12-10T19:00:00.000+08:00"}',
    '{"t":"2026-12-10T19:00:00.003+08:00","lt":"mammal","r":"miss","v":"5a6b7c8d","pick":null}',
    '{"t":"2026-12-10T19:00:00.004+08:00","lt":"qing00","r":"near","v":"9e0f1a2b","pick":["B"],"retry":"right","also":[{"v":"3c4d5e6f","r":"good","pick":["A","D"]}]}',
  ];
  const at = (t: string): number => Date.parse(t);
  const want = [
    { kind: 'review', t: '2026-12-10T19:00:00.000+08:00', at: at('2026-12-10T19:00:00.000+08:00'), offset: 480, typed: null, src: null, lt: 'lukang', r: 'near', v: '3c4d5e6f' },
    { kind: 'review', t: '2026-12-10T19:00:00.001+08:00', at: at('2026-12-10T19:00:00.001+08:00'), offset: 480, typed: null, src: null, lt: 'dajia0', r: 'good', v: '7a8b9c0d', with: '2026-12-10T19:00:00.000+08:00' },
    { kind: 'review', t: '2026-12-10T19:00:00.002+08:00', at: at('2026-12-10T19:00:00.002+08:00'), offset: 480, typed: null, src: null, lt: 'waipu0', r: 'miss', v: '1e2f3a4b', with: '2026-12-10T19:00:00.000+08:00' },
    { kind: 'review', t: '2026-12-10T19:00:00.003+08:00', at: at('2026-12-10T19:00:00.003+08:00'), offset: 480, typed: null, src: null, lt: 'mammal', r: 'miss', v: '5a6b7c8d' },
    { kind: 'review', t: '2026-12-10T19:00:00.004+08:00', at: at('2026-12-10T19:00:00.004+08:00'), offset: 480, typed: null, src: null, lt: 'qing00', r: 'near', v: '9e0f1a2b', also: ['3c4d5e6f'] },
  ];
  assert.deepEqual(lines.map(line => parseLine(line)), want);
  for (const ref of ['v0.6.0', PART_ONE]) assert.deepEqual(await oldRun(t, ref, [lines], PARSE_LINE_SCRIPT), want, ref);
});
