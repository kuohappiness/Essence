import type { TestContext } from 'node:test';
import { execFileSync } from 'node:child_process';
import { symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gitEnv, pluginRoot } from '../../tools/git.ts';
import { tempFolder } from './vault.ts';

// 用舊版的程式跑一段（tasks/matching-single-choice.md、matching-many.md〈舊版〉）：把 repo 的那個版本 clone 到暫存資料夾，
// 借用現在的 node_modules，在那一版的 Cards 根跑 script；args 以 JSON 傳進 process.argv[1]，script 印出的 JSON 讀回來。

const root = fileURLToPath(new URL('../../', import.meta.url));
const env = gitEnv();
const git = (dir: string, ...args: string[]): string => execFileSync('git', args, { cwd: dir, env, encoding: 'utf8' }).trim();

/** 讀一份卡組：每個目標的 ID、ok、卡型、共用補充與每一題的題型與指紋，和全部提示的代號。 */
const PARSE_SCRIPT = `
import { parseDeck } from './src/core/deck/index.ts';
const [text] = JSON.parse(process.argv[1]);
const deck = parseDeck(text);
console.log(JSON.stringify({
  targets: deck.targets.map(target => ({ id: target.id, ok: target.ok, kind: target.kind?.id ?? null, shared: target.shared, prompts: target.prompts.map(prompt => [prompt.kind, prompt.fingerprint]) })),
  problems: deck.problems.map(problem => problem.code),
}));
`;
export interface OldRun { targets: { id: string | null; ok: boolean; kind: string | null; shared: string[]; prompts: [string, string][] }[]; problems: string[] }

/** 讀紀錄的每一行：那一版的 parseLine 的結果。args 是 [行的清單]。 */
export const PARSE_LINE_SCRIPT = "import { parseLine } from './src/core/study/index.ts'; console.log(JSON.stringify(JSON.parse(process.argv[1])[0].map(line => parseLine(line))));";

/** 那一版的 Cards 根（暫存資料夾裡），借用現在的 node_modules。 */
export async function checkout(t: TestContext, ref: string): Promise<string> {
  const dir = await tempFolder(t, 'essence-old-');
  git(root, 'clone', '-q', '--no-checkout', git(root, 'rev-parse', '--show-toplevel'), dir);
  git(dir, 'checkout', '-q', ref);
  const cards = join(dir, pluginRoot(dir, ref));
  await symlink(join(root, 'node_modules'), join(cards, 'node_modules'), 'junction');
  return cards;
}

export async function oldRun(t: TestContext, ref: string, args: readonly unknown[], script = PARSE_SCRIPT): Promise<unknown> {
  const cards = await checkout(t, ref);
  const out = execFileSync(process.execPath, ['--input-type=module', '-e', script, JSON.stringify(args)], { cwd: cards, env, encoding: 'utf8' });
  return JSON.parse(out) as unknown;
}
