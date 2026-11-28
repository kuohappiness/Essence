import test from 'node:test';
import assert from 'node:assert/strict';
import { parseDeck } from '../src/core/deck/index.ts';
import { RATE_DELAY } from '../src/review/index.ts';
import { check, PC, pick, setup, skip, stage, tap, view } from './helpers/pick-session.ts';
import { oldRun, PARSE_LINE_SCRIPT } from './helpers/old-version.ts';
import type { OldRun } from './helpers/old-version.ts';

// 單選給舊版讀（tasks/matching-single-choice.md §2〈舊版〉、〈驗收〉）：用真的 v0.6.0 標籤的程式。舊版不認選項行，
// 照一般的問答出，選項行是背面的補充；每一題的讀法與指紋和新版相同，紀錄才對得上同一題。
const DECK = `---
科目: 社會
---
- 能從景觀描述認出西部的海岸 ^aaa111
    - 出處：p.42
    - 海岸平直，有沙灘和潟湖，是臺灣哪一部的海岸？ :: 西部
    - 選項：北部;;東部;;西部;;南部
- 能從景觀描述認出東部的海岸 ^bbb222
    - 山緊靠著海，海岸陡直，是臺灣哪一部的海岸？ :: **東部**
    - 臺灣哪一部的海岸有斷層？ :: 東部
        - 詳解：中央山脈緊靠海邊
    - 記憶錨點：東部山靠海
    - 選項：北部;;東部;;西部;;南部 %%AI 的備註%%
- 能說出臺灣北部海岸的地形 ^ccc333
    - 臺灣北部的海岸主要是哪一種海岸？ :: 岩岸
    - 選項：岩岸;;沙岸;;斷層海岸;;珊瑚礁海岸 ^ddd444
`;

void test('v0.6.0 讀單選：照一般的問答、選項行是補充、沒有提示；每一題的讀法與指紋和新版相同', async t => {
  const now = parseDeck(DECK);
  assert.deepEqual(now.targets.map(target => target.kind?.id), ['single', 'single', 'single']);
  assert.deepEqual(now.problems, []);
  const old = await oldRun(t, 'v0.6.0', [DECK]) as OldRun;
  assert.deepEqual(old.targets.map(target => [target.id, target.ok, target.kind]), [['aaa111', true, null], ['bbb222', true, null], ['ccc333', true, null]]);
  assert.deepEqual(old.targets.map(target => target.shared), [
    ['選項：北部;;東部;;西部;;南部'],
    ['記憶錨點：東部山靠海', '選項：北部;;東部;;西部;;南部 %%AI 的備註%%'],
    ['選項：岩岸;;沙岸;;斷層海岸;;珊瑚礁海岸 ^ddd444'],
  ]);
  assert.deepEqual(old.targets.map(target => target.prompts), now.targets.map(target => target.prompts.map(prompt => [prompt.kind, prompt.fingerprint])));
  assert.deepEqual(now.targets.map(target => target.shared), old.targets.map(target => target.shared));
  assert.deepEqual(old.problems, []);
});

void test('選項行的 %% 註解裡有 ::、==（L2 第一輪 R1）：和其他行一樣先讀成一題，新舊版同樣多一題、指紋相同，新版多提示', async t => {
  const deck = `---
科目: 社會
---
- 能說出臺灣北部海岸的地形 ^aaa111
    - 臺灣北部的海岸主要是哪一種海岸？ :: 岩岸
    - 選項：岩岸;;沙岸;;斷層海岸 %%例：甲 :: 乙%%
- 能說出臺灣西部海岸的地形 ^bbb222
    - 臺灣西部的海岸主要是哪一種海岸？ :: 沙岸
    - 選項：岩岸;;沙岸;;斷層海岸 %%例：==沙岸==%%
`;
  const now = parseDeck(deck);
  assert.deepEqual(now.targets.map(target => [target.kind?.id ?? null, target.prompts.map(prompt => prompt.kind)]), [[null, ['qa', 'qa']], [null, ['qa', 'cloze']]]);
  assert.deepEqual(now.problems.map(problem => [problem.line, problem.code]), [[5, 'options-invalid'], [8, 'options-invalid']]);
  const old = await oldRun(t, 'v0.6.0', [deck]) as OldRun;
  assert.deepEqual(old.targets.map(target => target.prompts), now.targets.map(target => target.prompts.map(prompt => [prompt.kind, prompt.fingerprint])));
  assert.deepEqual(old.problems, []);
});

void test('v0.6.0 的 parseLine 讀單選卡寫的行：每一行都是合法的作答，pick、retry 忽略、with 照比較卡讀（不用 need）', async t => {
  // 只留同一組選項的兩個目標：併成一張兩格的卡。
  const h = await setup(t, { 'Essence Cards/社會/海岸.md': DECK.slice(0, DECK.indexOf('- 能說出臺灣北部')) });
  const s = await h.open({ subject: '社會' });
  const lts = view(s).card.blanks.map(blank => blank.lt);
  assert.deepEqual([...lts].sort(), ['aaa111', 'bbb222']);
  // 西部那格先選錯、再選對；東部那格按沒印象。
  for (let index = 0; index < lts.length; index++) {
    s.act({ kind: 'row', index });
    if (lts[index] === 'aaa111') tap(h, s, '北部');
    else skip(h, s);
  }
  check(h, s);
  assert.equal(stage(s), 'retry');
  const west = lts.indexOf('aaa111');
  assert.equal(pick(s).cells[west].state, 'retry');
  s.act({ kind: 'row', index: west });
  tap(h, s, '西部');
  if (stage(s) === 'retry') check(h, s);
  assert.equal(stage(s), 'result');
  h.clock.now += RATE_DELAY;
  assert.equal(s.commit(), true);
  await h.state.flush();
  const lines = (h.texts.get(PC) ?? '').split('\n').filter(line => line.includes('"lt"'));
  const written = lines.map(line => JSON.parse(line) as { t: string; lt: string; r: string; v: string; pick: string | null; retry?: string; with?: string });
  const first = written[0];
  assert.deepEqual(written.map(({ t: _t, v: _v, ...rest }) => rest), lts[0] === 'aaa111'
    ? [{ lt: 'aaa111', r: 'near', pick: '北部', retry: 'right' }, { lt: 'bbb222', r: 'miss', pick: null, with: first.t }]
    : [{ lt: 'bbb222', r: 'miss', pick: null }, { lt: 'aaa111', r: 'near', pick: '北部', retry: 'right', with: first.t }]);
  const read = await oldRun(t, 'v0.6.0', [lines], PARSE_LINE_SCRIPT);
  assert.deepEqual(read, written.map(each => ({ kind: 'review', t: each.t, at: Date.parse(each.t), offset: 480, typed: null, src: null, lt: each.lt, r: each.r, v: each.v, ...each.with === undefined ? {} : { with: each.with } })));
});
