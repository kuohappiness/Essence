import test from 'node:test';
import type { TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gitEnv, pluginRoot } from '../tools/git.ts';
import { parseDeck } from '../src/core/deck/index.ts';
import { encodeEntry } from '../src/core/study/index.ts';
import { tempFolder } from './helpers/vault.ts';

// 多音字給舊版讀（tasks/polyphone-pick.md §4-6）：用真的 v0.6.0 標籤的程式。舊版讀不出括號的讀音，照翻面出；新版的紀錄（一行加 also）
// 舊版讀得懂：每個目標一筆評分、also 的句子算出過、衝突副本合併成一筆。混進舊版翻面自評的情況照 §4-6 的選擇處理，這裡只固定讀得懂。
const root = fileURLToPath(new URL('../', import.meta.url));
const env = gitEnv();
const git = (dir: string, ...args: string[]): string => execFileSync('git', args, { cwd: dir, env, encoding: 'utf8' }).trim();
const DECK = `---
科目: 國語
---
- 長（ㄓㄤˇ、ㄔㄤˊ） 讀音 ^k3m9qa
    - 記憶錨點：
        - ㄓㄤˇ：長大、帶頭的人：成長、班長
        - ㄔㄤˊ：距離或時間久：長短、很長
    - 他長（＿＿）得比哥哥高。 :: ㄓㄤˇ
    - 小樹苗慢慢長（＿＿）大了。 :: ㄓㄤˇ
    - 這條路很長（＿＿）。 :: ㄔㄤˊ
    - 夏天的白天比較長（＿＿）。 :: ㄔㄤˊ
`;
const SCRIPT = `
import { parseDeck } from './src/core/deck/index.ts';
import { mergeHistory, replay } from './src/core/study/index.ts';
const [text, pieces] = JSON.parse(process.argv[1]);
const deck = parseDeck(text);
const history = mergeHistory(pieces);
const reviews = history.reviews.filter(entry => entry.lt === 'k3m9qa');
console.log(JSON.stringify({
  targets: deck.targets.map(target => ({ id: target.id, ok: target.ok, group: target.group !== undefined, prompts: target.prompts.map(prompt => [prompt.kind, prompt.fingerprint]) })),
  problems: deck.problems.map(problem => problem.code),
  reviews: reviews.map(entry => ({ r: entry.r, v: entry.v, also: entry.also ?? [] })),
  reps: replay(reviews).get('k3m9qa')?.reps ?? 0,
}));
`;
interface OldRun { targets: { id: string | null; ok: boolean; group: boolean; prompts: [string, string][] }[]; problems: string[]; reviews: { r: string; v: string; also: string[] }[]; reps: number }

async function oldRun(t: TestContext, pieces: readonly { path: string; text: string }[]): Promise<OldRun> {
  const dir = await tempFolder(t, 'essence-v060-');
  git(root, 'clone', '-q', '--no-checkout', git(root, 'rev-parse', '--show-toplevel'), dir);
  git(dir, 'checkout', '-q', 'v0.6.0');
  const cards = join(dir, pluginRoot(dir, 'v0.6.0'));
  await symlink(join(root, 'node_modules'), join(cards, 'node_modules'), 'junction');
  const out = execFileSync(process.execPath, ['--input-type=module', '-e', SCRIPT, JSON.stringify([DECK, pieces])], { cwd: cards, env, encoding: 'utf8' });
  return JSON.parse(out) as OldRun;
}

void test('v0.6.0 讀多音字：照翻面（一般問答、沒有提示）；新版的一行紀錄讀成一筆評分，also 的 v 都在，衝突副本合併', async t => {
  const now = parseDeck(DECK).targets[0];
  const prints = now.prompts.map(prompt => prompt.fingerprint);
  const line = encodeEntry('2026-11-26T19:00:00.000+08:00', { lt: 'k3m9qa', r: 'near', v: prints[1], pick: 'ㄔㄤˊ', retry: 'right', also: [{ v: prints[0], r: 'good', pick: 'ㄓㄤˇ' }, { v: prints[2], r: 'good', pick: 'ㄔㄤˊ' }] });
  const old = await oldRun(t, [
    { path: 'Essence Cards/紀錄/2026-11 PC-test.jsonl', text: line + '\n' },
    { path: 'Essence Cards/紀錄/2026-11 PC-test 2.jsonl', text: line + '\n' },
  ]);
  assert.equal(old.targets.length, 1);
  assert.deepEqual([old.targets[0].id, old.targets[0].ok, old.targets[0].group], ['k3m9qa', true, false]);
  // 舊版的指紋和新版相同：紀錄對得上同一句。
  assert.deepEqual(old.targets[0].prompts, now.prompts.map(prompt => ['qa', prompt.fingerprint]));
  assert.deepEqual(old.problems, []);
  assert.deepEqual(old.reviews, [{ r: 'near', v: prints[1], also: [prints[0], prints[2]] }]);
  assert.equal(old.reps, 1);
});
