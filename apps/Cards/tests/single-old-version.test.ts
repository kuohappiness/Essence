import test from 'node:test';
import type { TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gitEnv, pluginRoot } from '../tools/git.ts';
import { parseDeck } from '../src/core/deck/index.ts';
import { tempFolder } from './helpers/vault.ts';

// 單選給舊版讀（tasks/matching-single-choice.md §2〈舊版〉、〈驗收〉）：用真的 v0.6.0 標籤的程式。舊版不認選項行，
// 照一般的問答出，選項行是背面的補充；每一題的讀法與指紋和新版相同，紀錄才對得上同一題。
const root = fileURLToPath(new URL('../', import.meta.url));
const env = gitEnv();
const git = (dir: string, ...args: string[]): string => execFileSync('git', args, { cwd: dir, env, encoding: 'utf8' }).trim();
const DECK = `---
科目: 社會
---
- 能從景觀描述認出西部的海岸 ^aaa111
    - 出處：p.42
    - 海岸平直，有沙灘和潟湖，是臺灣哪一部的海岸？ :: 西部
    - 選項：北部、東部、西部、南部
- 能從景觀描述認出東部的海岸 ^bbb222
    - 山緊靠著海，海岸陡直，是臺灣哪一部的海岸？ :: **東部**
    - 臺灣哪一部的海岸有斷層？ :: 東部
        - 詳解：中央山脈緊靠海邊
    - 記憶錨點：東部山靠海
    - 選項：北部、東部、西部、南部 %%AI 的備註%%
- 能說出臺灣北部海岸的地形 ^ccc333
    - 臺灣北部的海岸主要是哪一種海岸？ :: 岩岸
    - 選項：岩岸、沙岸、斷層海岸、珊瑚礁海岸 ^ddd444
`;
const SCRIPT = `
import { parseDeck } from './src/core/deck/index.ts';
const [text] = JSON.parse(process.argv[1]);
const deck = parseDeck(text);
console.log(JSON.stringify({
  targets: deck.targets.map(target => ({ id: target.id, ok: target.ok, kind: target.kind?.id ?? null, shared: target.shared, prompts: target.prompts.map(prompt => [prompt.kind, prompt.fingerprint]) })),
  problems: deck.problems.map(problem => problem.code),
}));
`;
interface OldRun { targets: { id: string | null; ok: boolean; kind: string | null; shared: string[]; prompts: [string, string][] }[]; problems: string[] }

async function oldRun(t: TestContext, args: readonly unknown[]): Promise<OldRun> {
  const dir = await tempFolder(t, 'essence-v060-');
  git(root, 'clone', '-q', '--no-checkout', git(root, 'rev-parse', '--show-toplevel'), dir);
  git(dir, 'checkout', '-q', 'v0.6.0');
  const cards = join(dir, pluginRoot(dir, 'v0.6.0'));
  await symlink(join(root, 'node_modules'), join(cards, 'node_modules'), 'junction');
  const out = execFileSync(process.execPath, ['--input-type=module', '-e', SCRIPT, JSON.stringify(args)], { cwd: cards, env, encoding: 'utf8' });
  return JSON.parse(out) as OldRun;
}

void test('v0.6.0 讀單選：照一般的問答、選項行是補充、沒有提示；每一題的讀法與指紋和新版相同', async t => {
  const now = parseDeck(DECK);
  assert.deepEqual(now.targets.map(target => target.kind?.id), ['single', 'single', 'single']);
  assert.deepEqual(now.problems, []);
  const old = await oldRun(t, [DECK]);
  assert.deepEqual(old.targets.map(target => [target.id, target.ok, target.kind]), [['aaa111', true, null], ['bbb222', true, null], ['ccc333', true, null]]);
  assert.deepEqual(old.targets.map(target => target.shared), [
    ['選項：北部、東部、西部、南部'],
    ['記憶錨點：東部山靠海', '選項：北部、東部、西部、南部 %%AI 的備註%%'],
    ['選項：岩岸、沙岸、斷層海岸、珊瑚礁海岸 ^ddd444'],
  ]);
  assert.deepEqual(old.targets.map(target => target.prompts), now.targets.map(target => target.prompts.map(prompt => [prompt.kind, prompt.fingerprint])));
  assert.deepEqual(now.targets.map(target => target.shared), old.targets.map(target => target.shared));
  assert.deepEqual(old.problems, []);
});
