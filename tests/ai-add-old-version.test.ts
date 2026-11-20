import test from 'node:test';
import type { TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gitEnv, pluginRoot } from '../tools/git.ts';
import { parseDeck } from '../src/core/deck/index.ts';
import type { Deck } from '../src/core/deck/index.ts';
import { addTexts } from './helpers/add-cases.ts';
import { tempFolder } from './helpers/vault.ts';

// 引言框的加入寫出的全文，已發布的舊版讀起來一樣（tasks/ai-cards-add.md §7、Codex L2 第一輪〈合併前補驗〉）：用真的 v0.5.0、v0.3.0 標籤的程式，
// 不是用現在的程式假裝舊版。讀得懂的卡組，每個目標的 ID、名稱、出處與每一題的指紋都和現在相同；需要新版的（比較卡）舊版不讀。

const root = fileURLToPath(new URL('../', import.meta.url));
const env = gitEnv();
const git = (dir: string, ...args: string[]): string => execFileSync('git', args, { cwd: dir, env, encoding: 'utf8' }).trim();

interface Seen { id: string | null; name: string; sources: string[]; prints: string[] }
const seen = (deck: Pick<Deck, 'targets'>): Seen[] => deck.targets.map(t => ({ id: t.id, name: t.name, sources: t.fields.sources, prints: t.prompts.map(p => p.fingerprint) }));

/** 在舊版的 clone 裡跑一次：另一個 process，載入的都是那個標籤的程式；build 是那個標籤的版本號（沒傳時舊版當成未知版本，擋下所有 `需要版本`）。 */
const SCRIPT = `
import { createState } from './src/state/index.ts';
import { createMemoryFiles } from './tests/helpers/memory-files.ts';
const vault = JSON.parse(process.argv[1]);
const build = process.argv[2];
const memory = createMemoryFiles(vault);
const state = createState({ build, files: memory.files, device: 'Windows-2c9e', delay: 1, fillIds: true, random: () => 0, now: () => Date.parse('2026-11-16T19:00:00.000+08:00'), offset: () => 480 });
await state.ready();
const decks = Object.fromEntries(state.decks().map(each => [each.path, each.deck.targets.map(t => ({ id: t.id, name: t.name, sources: t.fields.sources, prints: t.prompts.map(p => p.fingerprint) }))]));
console.log(JSON.stringify({ decks, blocked: state.blocked().decks }));
await state.close();
`;
async function oldRun(t: TestContext, tag: string, vault: Record<string, string>): Promise<{ decks: Record<string, Seen[]>; blocked: string[] }> {
  const dir = await tempFolder(t, `essence-${tag}-`);
  // 從 repo 的根 clone：Cards 搬進 plugins/cards/ 之後，clone 子資料夾在 checkout 之前就失敗（D-208 第二步 §A5）。
  git(root, 'clone', '-q', '--no-checkout', git(root, 'rev-parse', '--show-toplevel'), dir);
  git(dir, 'checkout', '-q', tag);
  const cards = join(dir, pluginRoot(dir, tag));
  await symlink(join(root, 'node_modules'), join(cards, 'node_modules'), 'junction');
  const out = execFileSync(process.execPath, ['--input-type=module', '-e', SCRIPT, JSON.stringify(vault), tag.slice(1)], { cwd: cards, env, encoding: 'utf8' });
  return JSON.parse(out) as { decks: Record<string, Seen[]>; blocked: string[] };
}

// 比較卡的最低版本是 0.4.0（D-191）：v0.5.0 每一篇都讀，v0.3.0 擋下有 `需要版本` 的（L2 第二輪 R3：兩邊都擋也要測得出來）。
for (const [tag, readsNeed] of [['v0.5.0', true], ['v0.3.0', false]] as const) {
  void test(`${tag} 讀加入寫出的全文：讀得懂的每個目標和現在相同；${readsNeed ? '比較卡也讀' : '需要新版的不讀'}`, async t => {
    const texts = addTexts();
    const vault = Object.fromEntries(texts.map((text, i) => [`Essence Cards/相容/${String(i).padStart(3, '0')}.md`, text]));
    const old = await oldRun(t, tag, vault);
    let compared = 0;
    for (const [path, text] of Object.entries(vault)) {
      const deck = parseDeck(text);
      if (old.blocked.includes(path)) { assert.ok(deck.props.need, `${tag} 只該擋需要新版的：${path}`); continue; }
      assert.deepEqual(old.decks[path], seen(deck), `${tag}：${path}\n${text}`);
      compared++;
    }
    // 不是空比：有比較卡的至少一篇；v0.5.0 每一篇都比過，v0.3.0 只擋下它們。
    const needs = texts.filter(text => parseDeck(text).props.need).length;
    assert.ok(needs >= 1);
    assert.equal(old.blocked.length, readsNeed ? 0 : needs);
    assert.equal(compared, texts.length - old.blocked.length);
  });
}
