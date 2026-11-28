import test from 'node:test';
import type { TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gitEnv, pluginRoot } from '../tools/git.ts';
import { tempFolder } from './helpers/vault.ts';

// 舊版與現在的讀者碰到回饋紀錄（tasks/card-feedback.md §2-4、§6 第 9 項）：用真的 v0.6.0 標籤的程式與現在的程式，
// 讀卡組、複習紀錄與版本回報，`紀錄/回饋/` 裡有沒有檔結果都一樣。
const root = fileURLToPath(new URL('../', import.meta.url));
const env = gitEnv();
const git = (dir: string, ...args: string[]): string => execFileSync('git', args, { cwd: dir, env, encoding: 'utf8' }).trim();

const DECK = '---\n年級學期: 國二上\n科目: 英文\n單元: L3\n---\n- 過去進行式的問句 ^k3m9x2\n    - ＿＿ your brothers eating when you left? :: Were\n';
const LOG = [
  '{"t":"2026-12-01T20:00:00.000+08:00","set":"app","val":"0.6.0+1a2b3c4"}',
  '{"t":"2026-12-01T20:15:03.250+08:00","lt":"k3m9x2","r":"good","v":"12345678"}',
].join('\n') + '\n';
/** 長得像複習紀錄與版本行的回饋（讀錯的話會多出作答或版本）。 */
const FEEDBACK = [
  '{"t":"2026-12-03T21:15:03.250+08:00","build":"0.7.0+1a2b3c4","path":"Essence Cards/英文/L3.md","cells":[{"lt":"k3m9x2","v":"12345678"}],"rate":"fix","card":"- 過去進行式的問句 ^k3m9x2"}',
  '{"t":"2026-12-03T21:16:00.000+08:00","lt":"k3m9x2","r":"again","v":"12345678","set":"app","val":"9.9.9+fffffff"}',
].join('\n') + '\n';
const BASE: Record<string, string> = { 'Essence Cards/英文/L3.md': DECK, 'Essence Cards/紀錄/2026-12 iPhone-7f3a.jsonl': LOG };
const WITH: Record<string, string> = {
  ...BASE,
  'Essence Cards/紀錄/回饋/2026-12 iPhone-7f3a 回饋.jsonl': FEEDBACK,
  'Essence Cards/紀錄/回饋/2026-12 iPhone-7f3a 回饋 2.jsonl': FEEDBACK,
  'Essence Cards/紀錄/回饋/2026-12 Windows-2c9e 回饋.jsonl': FEEDBACK,
};
/** 讀卡組、複習紀錄與版本回報；Files 只有 list 與 read（照 Files 的契約：底下所有檔、照字串排序）。 */
const SCRIPT = `
import { readDecks } from './src/core/deck/index.ts';
import { isLogPath, readHistory } from './src/core/study/index.ts';
import { lastVersions } from './src/core/backup/index.ts';
const [texts] = JSON.parse(process.argv[1]);
const paths = Object.keys(texts).sort();
const files = { list: async folder => paths.filter(path => path.startsWith(folder + '/')), read: async path => texts[path] ?? null };
const decks = await readDecks(files);
const history = await readHistory(files, '0.6.0');
const logs = paths.filter(isLogPath);
console.log(JSON.stringify({
  decks: decks.map(({ path, deck }) => [path, deck.targets.map(target => target.id)]),
  reviews: history.reviews, changes: history.changes, problems: history.problems,
  logs, versions: lastVersions(logs.map(path => ({ path, text: texts[path] })), '0.6.0'),
}));
`;

const run = (cwd: string, texts: Record<string, string>): unknown => JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', SCRIPT, JSON.stringify([texts])], { cwd, env, encoding: 'utf8' })) as unknown;

async function oldPlugin(t: TestContext): Promise<string> {
  const dir = await tempFolder(t, 'essence-v060-');
  git(root, 'clone', '-q', '--no-checkout', git(root, 'rev-parse', '--show-toplevel'), dir);
  git(dir, 'checkout', '-q', 'v0.6.0');
  const cards = join(dir, pluginRoot(dir, 'v0.6.0'));
  await symlink(join(root, 'node_modules'), join(cards, 'node_modules'), 'junction');
  return cards;
}

void test('v0.6.0 與現在：`紀錄/回饋/` 裡有長得像紀錄的檔，讀出的卡組、作答、變更、版本回報都和沒有時一樣', async t => {
  const now = run(root, BASE);
  assert.deepEqual(run(root, WITH), now);
  const base = now as { decks: unknown[]; reviews: unknown[]; logs: string[]; versions: { build: string }[] };
  assert.equal(base.decks.length, 1);
  assert.equal(base.reviews.length, 1);
  assert.deepEqual(base.versions.map(row => row.build), ['0.6.0+1a2b3c4']);
  assert.deepEqual(base.logs, ['Essence Cards/紀錄/2026-12 iPhone-7f3a.jsonl']);
  const cards = await oldPlugin(t);
  const old = run(cards, BASE);
  assert.deepEqual(run(cards, WITH), old);
  assert.deepEqual((old as { logs: string[] }).logs, base.logs);
  assert.deepEqual((old as { versions: { build: string }[] }).versions.map(row => row.build), ['0.6.0+1a2b3c4']);
});
