import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkDocs, formatProblem } from '../check-docs.ts';
import { parsePluginWorks, parseRelease } from '../roadmap-board.ts';
import { moveText } from '../roadmap-sync.ts';

// pre-commit 會匯出 GIT_DIR / GIT_INDEX_FILE 等；在另一個 repo 操作前必須清除。
for (const key of Object.keys(process.env)) if (key.toUpperCase().startsWith('GIT_')) delete process.env[key];

const script = fileURLToPath(new URL('../roadmap-sync.ts', import.meta.url));
const TODAY = '2026-11-25';

async function repo(t: { after: (fn: () => Promise<void>) => void }) {
  const root = await mkdtemp(join(tmpdir(), 'essence-sync-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const git = (args: string[], date?: string) => execFileSync('git', ['-c', 'core.autocrlf=false', '-c', 'user.name=test', '-c', 'user.email=test@example.invalid', ...args], {
    cwd: root, stdio: 'pipe', encoding: 'utf8', env: date ? { ...process.env, GIT_COMMITTER_DATE: date, GIT_AUTHOR_DATE: date } : process.env,
  });
  git(['init', '-q']);
  const put = async (path: string, text: string) => {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), text);
  };
  const add = async (path: string, text: string) => {
    await put(path, text);
    git(['add', '--', path]);
  };
  const read = (path: string) => readFile(join(root, path), 'utf8');
  const commit = (date = '2026-11-21T10:00:00+08:00') => git(['commit', '-q', '-m', 'x', '--no-verify'], date);
  const sync = (...args: string[]) => spawnSync(process.execPath, [script, '--root', root, '--today', TODAY, ...args], { encoding: 'utf8' });
  return { root, git, put, add, read, commit, sync };
}

const entry = (status: string, body = '') => `# 任務\n\n${status}\n\n來自：無\n\n## 結果\n\n${body}\n`;

const roadmap = (board: string[], waiting: string[] = [], done: string[] = ['| 2026-11-20 | 舊的一列 |']) => [
  '# 路線圖', '', '## 現在在哪裡', '', '開工只讀這一節。', '',
  '| 工作 | 狀態 | 下一步 | 等誰 | 入口 |', '|---|---|---|---|---|', ...board, '',
  '## 等觸發點', '', '| 工作 | 觸發點 | 入口 |', '|---|---|---|', ...waiting, '',
  '## 已完成', '', '| 日期 | 工作 |', '|---|---|', ...done, '',
].join('\n');

void test('狀態板跟著入口改：狀態、下一步、等誰由工具寫；等觸發點搬到〈等觸發點〉；手寫的列不動；跑兩次第二次不改', async t => {
  const { add, read, sync } = await repo(t);
  await add('docs/tasks/a.md', entry('狀態：實作中｜下一步：寫 [規格](#結果)｜等誰：Claude、Codex'));
  await add('docs/tasks/b.md', entry('狀態：等觸發點｜下一步：說明書開工時｜等誰：—'));
  await add('docs/roadmap.md', roadmap(
    ['| 甲 | 舊 | 舊 | 舊 | [任務](tasks/a.md) |', '| 乙 | 舊 | 舊 | 舊 | [任務](tasks/b.md) |'],
    ['| 手寫 | 新教材 | [D-132](decisions.md#d-132) |', '| 紀錄 | 等影片 | [試用紀錄](tasks/trials.md) |'],
  ));
  await add('docs/tasks/trials.md', '# 試用紀錄\n\n沒有狀態行。\n');
  const first = sync();
  assert.equal(first.status, 0, first.stderr);
  assert.match(first.stdout, /已同步：docs\/roadmap\.md/);
  assert.equal(await read('docs/roadmap.md'), roadmap(
    ['| 甲 | 實作中 | 寫 [規格](tasks/a.md#結果) | Claude、Codex | [任務](tasks/a.md) |'],
    ['| 手寫 | 新教材 | [D-132](decisions.md#d-132) |', '| 紀錄 | 等影片 | [試用紀錄](tasks/trials.md) |', '| 乙 | 說明書開工時 | [任務](tasks/b.md) |'],
  ));
  const again = sync();
  assert.equal(again.status, 0);
  assert.match(again.stdout, /roadmap 已是最新/);
  assert.equal(sync('--check').status, 0);
});

void test('改回進行中搬回狀態板最後面；結束的移到〈已完成〉最上面：沒 commit 的是今天，已 commit 的是狀態第一次結束的那個 commit（台北時間）', async t => {
  const { add, read, sync, commit, put } = await repo(t);
  await add('docs/tasks/a.md', entry('狀態：實作中｜下一步：x｜等誰：Claude'));
  await add('docs/tasks/b.md', entry('狀態：等觸發點｜下一步：y｜等誰：—'));
  await add('docs/tasks/c.md', entry('狀態：實作中｜下一步：w｜等誰：Claude'));
  await add('docs/tasks/d.md', entry('狀態：實作中｜下一步：z｜等誰：使用者'));
  commit('2026-11-21T10:00:00+08:00');
  // c 在 11-22 第一次結束（UTC 17:30 是台北隔天 01:30）、之後又改了內文；d 結束了但還沒 commit。
  await add('docs/tasks/c.md', entry('狀態：已合併｜完成：做完了，見 [結果](#結果)｜等誰：—'));
  commit('2026-11-22T17:30:00+00:00');
  await add('docs/tasks/c.md', entry('狀態：已合併｜完成：做完了，見 [結果](#結果)｜等誰：—', '補一句。'));
  commit('2026-11-24T09:00:00+08:00');
  await add('docs/roadmap.md', roadmap(
    ['| 甲 | 實作中 | x | Claude | [任務](tasks/a.md) |', '| 丙 | 實作中 | 舊 | Claude | [任務](tasks/c.md) |', '| 丁 | 實作中 | z | 使用者 | [任務](tasks/d.md) |'],
    ['| 乙 | y | [任務](tasks/b.md) |'],
  ));
  await put('docs/tasks/b.md', entry('狀態：待審｜下一步：L2｜等誰：Codex'));
  await put('docs/tasks/d.md', entry('狀態：已結案 → [D-218](../decisions.md#d-218)｜完成：不做了｜等誰：—'));
  assert.equal(sync().status, 0);
  assert.equal(await read('docs/roadmap.md'), roadmap(
    ['| 甲 | 實作中 | x | Claude | [任務](tasks/a.md) |', '| 乙 | 待審 | L2 | Codex | [任務](tasks/b.md) |'],
    [],
    [
      '| 2026-11-23 | **丙**：做完了，見 [結果](tasks/c.md#結果)（已合併，[入口](tasks/c.md)） |',
      `| ${TODAY} | **丁**：不做了（已結案，[入口](tasks/d.md)） |`,
      '| 2026-11-20 | 舊的一列 |',
    ],
  ));
  assert.equal(sync().status, 0);
  assert.match(sync().stdout, /已是最新/);
});

void test('入口一格兩個連結、入口不是新格式、同一份入口兩列、少了一節、參照式連結：報錯且不改檔', async t => {
  const { add, read, sync } = await repo(t);
  await add('docs/tasks/a.md', entry('狀態：實作中｜下一步：x｜等誰：Claude'));
  await add('docs/tasks/old.md', entry('狀態：進行中'));
  await add('docs/tasks/ref.md', entry('狀態：實作中｜下一步：看 [結果][r]｜等誰：Claude'));
  await add('docs/tasks/none.md', '# 沒有狀態行\n\n內文。\n');
  const text = roadmap([
    '| 兩個 | x | x | x | [任務](tasks/a.md)、[另一份](tasks/old.md) |',
    '| 舊 | x | x | x | [任務](tasks/old.md) |',
    '| 甲 | x | x | x | [任務](tasks/a.md) |',
    '| 甲又一次 | x | x | x | [任務](tasks/a.md) |',
    '| 參照 | x | x | x | [任務](tasks/ref.md) |',
    '| 沒狀態 | x | x | x | [任務](tasks/none.md) |',
    '| 沒入口 | x | x | x | D-132 |',
  ]);
  await add('docs/roadmap.md', text);
  const result = sync();
  assert.equal(result.status, 1);
  assert.equal(result.stderr.trim(), [
    '沒有改任何檔：',
    'docs/roadmap.md:9  入口一格要剛好一個連到 Markdown 檔的連結，現在有 2 個',
    'docs/roadmap.md:10  入口 docs/tasks/old.md 的狀態行：要剛好三欄、用全形「｜」分，現在是 1 欄（欄裡的「｜」改用「，」）。寫法：狀態：<狀態值>｜下一步：<一句>｜等誰：<值>；結束時「狀態：已合併｜完成：<一句>｜等誰：—」',
    'docs/roadmap.md:12  入口 docs/tasks/a.md 在第 11 行也有一列：同一份入口只能有一列',
    'docs/roadmap.md:13  參照式連結（[文字][名稱]）搬不進 roadmap：入口的狀態行改用 [文字](路徑)',
    'docs/roadmap.md:14  入口 docs/tasks/none.md 的標題下第一行沒有「狀態：…」',
    'docs/roadmap.md:15  入口一格要剛好一個連到 Markdown 檔的連結，現在有 0 個',
  ].join('\n'));
  assert.equal(await read('docs/roadmap.md'), text);
  await add('docs/roadmap.md', '# 路線圖\n\n## 現在在哪裡\n\n| 工作 | 狀態 | 下一步 | 等誰 | 入口 |\n|---|---|---|---|---|\n\n## 已完成\n');
  assert.match(sync().stderr, /docs\/roadmap\.md:1  找不到「## 等觸發點」/);
  // --staged 只能和 --check 一起用。
  assert.equal(sync('--staged').status, 1);
});

void test('L2 R4 連結的路徑照原本的編碼改基準（%23、%20 不解開）；行內程式碼裡的連結不改，入口一格也不算', async t => {
  const { root, add, read, sync } = await repo(t);
  assert.deepEqual(moveText('[索引](../決策%23索引.md#一節)', 'docs/tasks/x.md', 'docs/roadmap.md'), { text: '[索引](決策%23索引.md#一節)' });
  assert.deepEqual(moveText('[空白](../Claude%20Codex%20Discussion/d.md)', 'plugins/cards/docs/tasks/x.md', 'plugins/cards/docs/roadmap.md'),
    { text: '[空白](Claude%20Codex%20Discussion/d.md)' });
  assert.deepEqual(moveText('範例 `[入口](a.md)`、``[也是](a.md)``，[真的](a.md)', 'plugins/cards/docs/tasks/x.md', 'plugins/cards/docs/roadmap.md'),
    { text: '範例 `[入口](a.md)`、``[也是](a.md)``，[真的](tasks/a.md)' });
  // 同步寫出的 roadmap，文件檢查照樣找得到 %23 的檔。
  await add('docs/決策#索引.md', '# 索引\n\n## 一節\n');
  await add('docs/tasks/x.md', entry('狀態：實作中｜下一步：看 [索引](../決策%23索引.md#一節)｜等誰：Claude'));
  await add('docs/roadmap.md', roadmap(['| 甲 | x | x | x | [任務](tasks/x.md) |']));
  assert.equal(sync().status, 0);
  assert.ok((await read('docs/roadmap.md')).includes('| 甲 | 實作中 | 看 [索引](決策%23索引.md#一節) | Claude | [任務](tasks/x.md) |'));
  assert.deepEqual(checkDocs(root, { exceptions: [], legacy: 'all' }).problems.map(formatProblem).filter(p => p.startsWith('docs/roadmap.md')), []);
  // 入口一格只有行內程式碼裡的連結：沒有入口。
  await add('docs/roadmap.md', roadmap(['| 範例 | x | x | x | `[任務](tasks/x.md)` |']));
  assert.match(sync().stderr, /docs\/roadmap\.md:9  入口一格要剛好一個連到 Markdown 檔的連結，現在有 0 個/);
});

void test('連結改寫：上一層、只有錨點、有空白的路徑、格子裡的直線；寫出的 roadmap 文件檢查與白板都讀得出來', async t => {
  const { root, add, read, sync } = await repo(t);
  const roadmapFile = 'plugins/cards/docs/roadmap.md';
  await add('plugins/cards/docs/tasks/x.md', entry('狀態：實作中｜下一步：看 [上一層](../plans/p.md#一節)、[本檔](#結果)、[空白](<../Claude Codex Discussion/d.md>)、[外部](https://example.com)、a|b｜等誰：使用者'));
  await add('plugins/cards/docs/plans/p.md', '# P\n\n狀態：規劃中｜下一步：x｜等誰：使用者\n\n## 一節\n');
  await add('plugins/cards/docs/Claude Codex Discussion/d.md', '# D\n\n狀態：討論中｜下一步：x｜等誰：Codex\n');
  await add(roadmapFile, roadmap(['| 甲 | x | x | x | [任務](tasks/x.md) |']));
  assert.equal(sync().status, 0);
  const text = await read(roadmapFile);
  const next = '看 [上一層](plans/p.md#一節)、[本檔](tasks/x.md#結果)、[空白](<Claude Codex Discussion/d.md>)、[外部](https://example.com)、a\\|b';
  assert.ok(text.includes(`| 甲 | 實作中 | ${next} | 使用者 | [任務](tasks/x.md) |`), text);
  const problems = checkDocs(root, { exceptions: [], legacy: 'all' }).problems.map(formatProblem);
  assert.deepEqual(problems.filter(p => p.startsWith(roadmapFile)), []);
  const [work] = parsePluginWorks(text, roadmapFile);
  assert.equal(work.next.text, '看 上一層、本檔、空白、外部、a|b');
  assert.match(work.next.html, /href="https:\/\/github\.com\/kuohappiness\/Essence\/blob\/main\/plugins\/cards\/docs\/Claude%20Codex%20Discussion\/d\.md"/);
  assert.deepEqual(moveText('[a][b]', 'docs/tasks/x.md', 'docs/roadmap.md'), { error: '參照式連結（[文字][名稱]）搬不進 roadmap：入口的狀態行改用 [文字](路徑)' });
  // 工具寫的〈已完成〉列白板也讀得出來。
  await add('plugins/cards/docs/tasks/x.md', entry('狀態：已合併｜完成：正式 vault 升到 `0.7.0`：做完｜等誰：—'));
  assert.equal(sync().status, 0);
  const release = parseRelease(await read(roadmapFile), roadmapFile);
  assert.equal(release.done[0].date, TODAY);
  assert.equal(release.done[0].work.text, '甲：正式 vault 升到 0.7.0：做完（已合併，入口）');
});

void test('暫存區：入口轉態後沒同步就擋、同步並 stage 後通過；只在工作樹的修改不算；刪掉列再加回、手寫的〈已完成〉列都有明確的結果', async t => {
  const { add, put, read, sync, commit, git } = await repo(t);
  await add('docs/tasks/a.md', entry('狀態：實作中｜下一步：x｜等誰：Claude'));
  await add('docs/tasks/b.md', entry('狀態：實作中｜下一步：y｜等誰：Claude'));
  await add('docs/roadmap.md', roadmap(['| 甲 | 實作中 | x | Claude | [任務](tasks/a.md) |', '| 乙 | 實作中 | y | Claude | [任務](tasks/b.md) |']));
  commit();
  assert.equal(sync('--check', '--staged').status, 0);
  // 入口轉成已合併、只 stage 入口：擋下，並寫出修法。
  await add('docs/tasks/a.md', entry('狀態：已合併｜完成：做完｜等誰：—'));
  const blocked = sync('--check', '--staged');
  assert.equal(blocked.status, 1);
  assert.match(blocked.stderr, /docs\/roadmap\.md:9  狀態板、〈等觸發點〉或〈已完成〉和入口的狀態行對不上/);
  assert.match(blocked.stderr, /執行 node tools\/roadmap-sync\.ts，再 git add docs\/roadmap\.md/);
  // 同步、stage：通過；工作樹再改 b 但沒 stage，暫存區的檢查不受影響。
  assert.equal(sync().status, 0);
  git(['add', 'docs/roadmap.md']);
  await put('docs/tasks/b.md', entry('狀態：待審｜下一步：L2｜等誰：Codex'));
  assert.equal(sync('--check', '--staged').status, 0);
  assert.equal(sync('--check').status, 1);
  commit('2026-11-25T10:00:00+08:00');
  await put('docs/tasks/b.md', entry('狀態：實作中｜下一步：y｜等誰：Claude'));
  // 手動刪掉乙那一列：入口沒有列就不在板上，檢查通過（要加回就在開工時手寫一列）；加回時舊的格子對不上就擋，同步後通過。
  const synced = await read('docs/roadmap.md');
  await add('docs/roadmap.md', synced.replace('| 乙 | 實作中 | y | Claude | [任務](tasks/b.md) |\n', ''));
  assert.equal(sync('--check', '--staged').status, 0);
  await add('docs/roadmap.md', synced.replace('| 乙 | 實作中 | y | Claude |', '| 乙 | 舊 | 舊 | 舊 |'));
  assert.equal(sync('--check', '--staged').status, 1);
  assert.equal(sync().status, 0);
  git(['add', 'docs/roadmap.md']);
  assert.equal(sync('--check', '--staged').status, 0);
  // 手寫的〈已完成〉列（暫存區有、HEAD 沒有、上線之後的日期）擋下；舊日期的列手改不擋。
  const current = await read('docs/roadmap.md');
  await add('docs/roadmap.md', current.replace('|---|---|\n| 2026-11-25', '|---|---|\n| 2026-11-26 | 手寫的完成 |\n| 2026-11-25'));
  const handwritten = sync('--check', '--staged');
  assert.equal(handwritten.status, 1);
  assert.match(handwritten.stderr, /〈已完成〉新加的列要由工具產生.*格式不是/);
  await add('docs/roadmap.md', current.replace('| 2026-11-20 | 舊的一列 |', '| 2026-11-20 | 舊的一列，改個字 |'));
  assert.equal(sync('--check', '--staged').status, 0);
  // 工具格式、但「完成」那一句和入口不一樣也擋。
  await add('docs/roadmap.md', current.replace('**甲**：做完', '**甲**：做完了'));
  assert.match(sync('--check', '--staged').stderr, /和入口 docs\/tasks\/a\.md 的「完成」那一句不一樣/);
});
