import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkDocs, formatProblem } from '../check-docs.ts';
import { parsePluginWorks, parseRelease, parseTopWorks } from '../roadmap-board.ts';
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
  // 手寫的〈已完成〉列（暫存區有、HEAD 沒有）擋下；舊的列改了文字也算新的列（L2 R3：沒有上線日的例外）。
  const current = await read('docs/roadmap.md');
  await add('docs/roadmap.md', current.replace('|---|---|\n| 2026-11-25', '|---|---|\n| 2026-11-26 | 手寫的完成 |\n| 2026-11-25'));
  const handwritten = sync('--check', '--staged');
  assert.equal(handwritten.status, 1);
  assert.match(handwritten.stderr, /〈已完成〉新加的列要由工具產生.*格式不是/);
  await add('docs/roadmap.md', current.replace('| 2026-11-20 | 舊的一列 |', '| 2026-11-20 | 舊的一列，改個字 |'));
  assert.match(sync('--check', '--staged').stderr, /〈已完成〉新加的列要由工具產生.*格式不是/);
  // 工具格式、但「完成」那一句和入口不一樣也擋。
  await add('docs/roadmap.md', current.replace('**甲**：做完', '**甲**：做完了'));
  assert.match(sync('--check', '--staged').stderr, /和入口 docs\/tasks\/a\.md 的「完成」那一句不一樣/);
});

void test('L2 R2〈已完成〉新的列照 HEAD 核對：漏搬、重複、日期與名稱不對都擋；只改連結目標的舊列與重新開工放行', async t => {
  const NEW_DONE = '〈已完成〉新加的列要由工具產生（入口的狀態改成已合併或已結案，再跑 node tools/roadmap-sync.ts）：';
  const { add, git, read, sync, commit } = await repo(t);
  const check = () => sync('--check', '--staged');
  await add('docs/tasks/a.md', entry('狀態：實作中｜下一步：x｜等誰：Claude'));
  await add('docs/tasks/b.md', entry('狀態：實作中｜下一步：y｜等誰：Claude'));
  const board = ['| 甲 | 實作中 | x | Claude | [任務](tasks/a.md) |', '| 乙 | 實作中 | y | Claude | [任務](tasks/b.md) |'];
  await add('docs/roadmap.md', roadmap(board));
  commit();
  // 入口改成已合併、手動刪掉狀態板那一列、沒有完成列：擋（Codex 重現的那一種）。
  await add('docs/tasks/a.md', entry('狀態：已合併｜完成：做完｜等誰：—'));
  await add('docs/roadmap.md', roadmap([board[1]]));
  assert.equal(check().stderr.split('\n').find(line => line.startsWith('docs/')),
    'docs/roadmap.md:16  入口 docs/tasks/a.md 已結束、HEAD 的狀態板或〈等觸發點〉有它，〈已完成〉卻沒有新的一列：把那一列加回來，再執行 node tools/roadmap-sync.ts');
  // 同步產生的列：通過。
  const row = `| ${TODAY} | **甲**：做完（已合併，[入口](tasks/a.md)） |`;
  const old = '| 2026-11-20 | 舊的一列 |';
  await add('docs/roadmap.md', roadmap(board));
  assert.equal(sync().status, 0);
  assert.equal(await read('docs/roadmap.md'), roadmap([board[1]], [], [row, old]));
  git(['add', 'docs/roadmap.md']);
  assert.equal(check().status, 0, check().stderr);
  // 工具的列換成兩筆手寫的：日期、名稱不對，同一份入口兩筆新列。
  const fake = '| 2026-11-21 | **甲改名**：做完（已合併，[入口](tasks/a.md)） |';
  await add('docs/roadmap.md', roadmap([board[1]], [], [fake, fake, old]));
  assert.deepEqual(check().stderr.split('\n').filter(line => line.startsWith('docs/')), [
    `docs/roadmap.md:20  ${NEW_DONE}日期要是 ${TODAY}（入口收尾的那天）`,
    `docs/roadmap.md:20  ${NEW_DONE}工作名稱要和 HEAD 狀態板的「甲」一樣`,
    `docs/roadmap.md:21  ${NEW_DONE}日期要是 ${TODAY}（入口收尾的那天）`,
    `docs/roadmap.md:21  ${NEW_DONE}工作名稱要和 HEAD 狀態板的「甲」一樣`,
    `docs/roadmap.md:21  ${NEW_DONE}入口 docs/tasks/a.md 在 docs/roadmap.md:20 已經有一筆新的完成列`,
  ]);
  // 手寫列的日期早於上線那天也擋（L2 R3：沒有上線日的例外）。
  await add('docs/roadmap.md', roadmap([board[1]], [], [row, '| 2026-11-19 | 手寫的完成 |', old]));
  assert.match(check().stderr, new RegExp(`docs/roadmap\\.md:21  ${NEW_DONE.replace(/[()]/g, '\\$&')}格式不是`));
  // commit 甲的完成；舊的列再抄一筆（同一個入口、同一天）：擋。
  await add('docs/roadmap.md', roadmap([board[1]], [], [row, old]));
  commit('2026-11-25T10:00:00+08:00');
  await add('docs/roadmap.md', roadmap([board[1]], [], [row, row, old]));
  assert.match(check().stderr, /docs\/roadmap\.md:21  .*入口 docs\/tasks\/a\.md 在 docs\/roadmap\.md:20 已經有同一天的完成列/);
  // 甲重新開工、入口改名：舊的完成列只改入口的連結目標，放行。
  git(['mv', 'docs/tasks/a.md', 'docs/tasks/a2.md']);
  await add('docs/tasks/a2.md', entry('狀態：實作中｜下一步：再做｜等誰：Claude'));
  await add('docs/roadmap.md', roadmap(['| 甲 | 實作中 | 再做 | Claude | [任務](tasks/a2.md) |', board[1]], [], [row.replace('tasks/a.md', 'tasks/a2.md'), old]));
  assert.equal(check().status, 0, check().stderr);
});

void test('L2 R3 合併時新的完成列的日期只要不晚於今天；不是合併時同樣的內容要是收尾那天', async t => {
  const { add, git, sync, commit } = await repo(t);
  const check = () => sync('--check', '--staged');
  await add('docs/tasks/a.md', entry('狀態：實作中｜下一步：x｜等誰：Claude'));
  await add('docs/roadmap.md', roadmap(['| 甲 | 實作中 | x | Claude | [任務](tasks/a.md) |']));
  commit();
  git(['branch', '-M', 'main']);
  git(['checkout', '-q', '-b', 'feature']);
  await add('docs/tasks/a.md', entry('狀態：已合併｜完成：做完｜等誰：—'));
  await add('docs/roadmap.md', roadmap([], [], ['| 2026-11-23 | **甲**：做完（已合併，[入口](tasks/a.md)） |', '| 2026-11-20 | 舊的一列 |']));
  commit('2026-11-23T10:00:00+08:00');
  git(['checkout', '-q', 'main']);
  await add('docs/other.md', '# 別的\n');
  commit('2026-11-24T10:00:00+08:00');
  git(['merge', '-q', '--no-ff', '--no-commit', 'feature']);
  assert.equal(check().status, 0, check().stderr);
  git(['merge', '--abort']);
  // 不是合併：入口在這次 commit 才結束，日期要是今天。
  git(['checkout', 'feature', '--', 'docs/tasks/a.md', 'docs/roadmap.md']);
  assert.match(check().stderr, new RegExp(`docs/roadmap\\.md:19  .*日期要是 ${TODAY}`));
  // 上線前開的分支手寫的完成列，合併時照樣擋，訊息寫出修法。
  git(['reset', '-q', '--hard']);
  git(['checkout', '-q', '-b', 'old', 'main~1']);
  await add('docs/roadmap.md', roadmap([], [], ['| 2026-11-24 | 甲做完了 |', '| 2026-11-20 | 舊的一列 |']));
  await add('docs/tasks/a.md', entry('狀態：已合併｜完成：做完｜等誰：—'));
  commit('2026-11-24T10:00:00+08:00');
  git(['checkout', '-q', 'main']);
  git(['merge', '-q', '--no-ff', '--no-commit', 'old']);
  assert.match(check().stderr, /docs\/roadmap\.md:19  〈已完成〉新加的列要由工具產生（入口的狀態改成已合併或已結案，再跑 node tools\/roadmap-sync\.ts）：格式不是/);
});

void test('L2 N1 N4 掛真的 hook：合併（pre-merge-commit 時還沒有 MERGE_HEAD）、squash、有衝突的 cherry-pick 重播另一邊的完成列，日期照它那邊', async t => {
  const { root, add, put, git, commit } = await repo(t);
  // 和 .githooks 一樣在 hook 原本的環境跑暫存區的檢查（GITHEAD_<sha>、GIT_INDEX_FILE 照 Git 給的）。
  const hooks = git(['rev-parse', '--git-path', 'hooks']).trim();
  const slash = (path: string) => path.replace(/\\/g, '/');
  const hook = `#!/bin/sh\nexec "${slash(process.execPath)}" "${slash(script)}" --check --staged --root "${slash(root)}" --today ${TODAY}\n`;
  await mkdir(join(root, hooks), { recursive: true });
  for (const name of ['pre-commit', 'pre-merge-commit']) await writeFile(join(root, hooks, name), hook, { mode: 0o755 });
  const run = (args: string[]) => spawnSync('git', ['-c', 'core.autocrlf=false', '-c', 'user.name=test', '-c', 'user.email=test@example.invalid', '-c', 'core.editor=true', ...args], { cwd: root, encoding: 'utf8' });
  await add('docs/tasks/a.md', entry('狀態：實作中｜下一步：x｜等誰：Claude'));
  await add('docs/roadmap.md', roadmap(['| 甲 | 實作中 | x | Claude | [任務](tasks/a.md) |']));
  await add('docs/note.md', '# 筆記\n\nbase\n');
  commit();
  git(['branch', '-M', 'main']);
  git(['checkout', '-q', '-b', 'feature']);
  await add('docs/tasks/a.md', entry('狀態：已合併｜完成：做完｜等誰：—'));
  await add('docs/roadmap.md', roadmap([], [], ['| 2026-11-23 | **甲**：做完（已合併，[入口](tasks/a.md)） |', '| 2026-11-20 | 舊的一列 |']));
  await add('docs/note.md', '# 筆記\n\nfeature\n');
  commit('2026-11-23T10:00:00+08:00');
  git(['checkout', '-q', 'main']);
  await add('docs/other.md', '# 別的\n');
  commit('2026-11-24T10:00:00+08:00');
  const merged = run(['merge', '-q', '--no-ff', '-m', 'merge', 'feature']);
  assert.equal(merged.status, 0, merged.stderr);
  git(['reset', '-q', '--hard', 'HEAD~1']);
  // squash：git commit 走 pre-commit，SQUASH_MSG 還在。
  assert.equal(run(['merge', '-q', '--squash', 'feature']).status, 0);
  const squashed = run(['commit', '-q', '-m', 'squash']);
  assert.equal(squashed.status, 0, squashed.stderr);
  git(['reset', '-q', '--hard', 'HEAD~1']);
  // 有衝突的 cherry-pick：解完衝突後 --continue 走 pre-commit，CHERRY_PICK_HEAD 還在。
  await add('docs/note.md', '# 筆記\n\nmain\n');
  commit('2026-11-24T11:00:00+08:00');
  assert.notEqual(run(['cherry-pick', 'feature']).status, 0);
  await put('docs/note.md', '# 筆記\n\nboth\n');
  git(['add', 'docs/note.md']);
  const picked = run(['cherry-pick', '--continue']);
  assert.equal(picked.status, 0, picked.stderr);
  assert.match(git(['show', '-s', '--format=%s', 'HEAD']), /^x$/m);
});

void test('L2 R5 同一份入口只能在一份 roadmap 有列；新的完成列跨 roadmap 也只能一筆', async t => {
  const { add, git, sync, commit } = await repo(t);
  await add('docs/tasks/a.md', entry('狀態：實作中｜下一步：x｜等誰：Claude'));
  await add('docs/roadmap.md', roadmap(['| 甲 | x | x | x | [任務](tasks/a.md) |']));
  await add('plugins/cards/docs/roadmap.md', roadmap([], ['| 甲 | x | [任務](../../../docs/tasks/a.md) |']));
  const both = sync();
  assert.equal(both.status, 1);
  assert.match(both.stderr, /plugins\/cards\/docs\/roadmap\.md:14  入口 docs\/tasks\/a\.md 在 docs\/roadmap\.md:9 也有一列：同一份入口只能在一份 roadmap 有一列/);
  await add('plugins/cards/docs/roadmap.md', roadmap([]));
  assert.equal(sync().status, 0);
  git(['add', 'docs/roadmap.md']);
  commit();
  // 結束後在另一份 roadmap 也抄一筆完成列：擋。
  await add('docs/tasks/a.md', entry('狀態：已合併｜完成：做完｜等誰：—'));
  assert.equal(sync().status, 0);
  git(['add', 'docs/roadmap.md']);
  await add('plugins/cards/docs/roadmap.md', roadmap([], [], [`| ${TODAY} | **甲**：做完（已合併，[入口](../../../docs/tasks/a.md)） |`, '| 2026-11-20 | 舊的一列 |']));
  assert.match(sync('--check', '--staged').stderr, /plugins\/cards\/docs\/roadmap\.md:19  .*入口 docs\/tasks\/a\.md 在 docs\/roadmap\.md:19 已經有一筆新的完成列/);
});

void test('L2 R1 最上層最後一列搬走：同步、暫存區檢查、文件檢查與白板都接受空的狀態板', async t => {
  const { root, add, git, read, sync, commit } = await repo(t);
  const top = (board: string[], done?: string[]) => roadmap(board, [], done).replace('開工只讀這一節。', '外掛的工作：[Cards](../plugins/cards/docs/roadmap.md#現在在哪裡)。');
  await add('docs/tasks/a.md', entry('狀態：實作中｜下一步：x｜等誰：Claude'));
  await add('docs/roadmap.md', top(['| 甲 | 實作中 | x | Claude | [任務](tasks/a.md) |']));
  await add('plugins/cards/docs/roadmap.md', roadmap([]));
  commit();
  await add('docs/tasks/a.md', entry('狀態：已合併｜完成：做完｜等誰：—'));
  assert.equal(sync().status, 0);
  git(['add', 'docs/roadmap.md']);
  assert.equal(await read('docs/roadmap.md'), top([], [`| ${TODAY} | **甲**：做完（已合併，[入口](tasks/a.md)） |`, '| 2026-11-20 | 舊的一列 |']));
  const check = sync('--check', '--staged');
  assert.equal(check.status, 0, check.stderr);
  assert.deepEqual(parseTopWorks(await read('docs/roadmap.md')), []);
  assert.deepEqual(checkDocs(root, { staged: true, exceptions: [], legacy: 'all' }).problems.map(formatProblem).filter(p => p.includes('roadmap')), []);
  const board = spawnSync(process.execPath, [fileURLToPath(new URL('../roadmap-board.ts', import.meta.url)), '--check', '--staged', '--root', root], { encoding: 'utf8' });
  assert.equal(board.status, 0, board.stderr);
});
