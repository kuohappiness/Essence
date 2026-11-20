import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BACKLOG, checkDocs, downstreamOf, formatProblem, LEGACY_STATUS, ROADMAP } from '../check-docs.ts';

// pre-commit 會匯出 GIT_DIR / GIT_INDEX_FILE 等；在另一個 repo 操作前必須清除。
for (const key of Object.keys(process.env)) if (key.toUpperCase().startsWith('GIT_')) delete process.env[key];

// CI 的 git 沒有設作者身分：暫存 repo 裡 commit 時自己給一個。
const git = (root: string, ...args: string[]) => execFileSync('git', ['-c', 'core.autocrlf=false', '-c', 'core.safecrlf=false', '-c', 'user.name=test', '-c', 'user.email=test@example.invalid', ...args], { cwd: root, stdio: 'pipe' });

async function repo(t: { after: (fn: () => Promise<void>) => void }) {
  const root = await mkdtemp(join(tmpdir(), 'essence-docs-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  git(root, 'init', '-q');
  const put = async (path: string, text: string) => {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), text);
  };
  const add = async (path: string, text: string) => {
    await put(path, text);
    git(root, 'add', '--', path);
  };
  // 舊測試的狀態檔都當凍結清單裡的（'all'）；新格式的測試另外給清單或讀 repo 裡的。
  const run = (staged = false) => checkDocs(root, { staged, exceptions: [], legacy: 'all' }).problems.map(formatProblem);
  return { root, put, add, run };
}

void test('一般連結、圖片、參照式連結、角括號與百分比編碼的路徑；找不到的報出檔案與行號', async t => {
  const { add, run } = await repo(t);
  await add('docs/有 空格.md', '# 標題\n');
  await add('docs/pic.png', '');
  await add('docs/a.md', [
    '# A',
    '',
    '見 [好的](<有 空格.md>)、[編碼](%E6%9C%89%20%E7%A9%BA%E6%A0%BC.md)、![圖](pic.png)、[參照][ok]。',
    '',
    '第二段的第一行',
    '接著 [壞的](<沒有 這個.md>)、![壞圖](missing.png)、[壞參照][bad]。',
    '',
    '[ok]: 有%20空格.md',
    '[bad]: ../nowhere.md',
    '',
  ].join('\n'));
  assert.deepEqual(run(), [
    'docs/a.md:5  沒有 這個.md  找不到檔案',
    'docs/a.md:5  missing.png  找不到檔案',
    'docs/a.md:5  ../nowhere.md  找不到檔案',
  ]);
});

void test('程式碼區塊與行內程式碼裡的連結不算；網址、mailto、obsidian 與 // 開頭的不查', async t => {
  const { add, run } = await repo(t);
  await add('a.md', [
    '# A',
    '',
    '```markdown',
    '[假的](missing.md)',
    '```',
    '',
    '    [縮排的假連結](missing.md)',
    '',
    '行內 `[假的](missing.md)` 不算；[網站](https://example.com/x.md)、[信](mailto:a@example.com)、[庫](obsidian://open?vault=x)、[協定相對](//example.com/x.md)。',
    '',
  ].join('\n'));
  assert.deepEqual(run(), []);
});

void test('錨點：中文標題、重複標題的 -1、行內程式碼與連結的標題文字、<a id>；連到非 .md 的不查錨點', async t => {
  const { add, run } = await repo(t);
  await add('b.md', [
    '# B',
    '',
    '## D-141 文件架構：入口只放狀態，同一類資訊只維護一份',
    '',
    '## 重複',
    '',
    '## 重複',
    '',
    '### 0-1 答案格拆開 ` | `（D-122）',
    '',
    '### 見 [連結文字](a.md) 一節',
    '',
    '<a id="自訂錨點"></a>',
    '',
    '段落裡的 <span id="行內錨點">x</span>。',
    '',
  ].join('\n'));
  await add('c.ts', '');
  await add('a.md', [
    '# A',
    '',
    '[1](b.md#d-141-文件架構入口只放狀態同一類資訊只維護一份)、[2](b.md#重複)、[3](b.md#重複-1)、[4](b.md#0-1-答案格拆開-d-122)、[5](b.md#見-連結文字-一節)、[6](b.md#自訂錨點)、[7](b.md#行內錨點)、[8](c.ts#L3)、[9](#a)',
    '',
    '[壞1](b.md#重複-2)、[壞2](b.md#0-1-答案格拆開--d-122)、[壞3](#沒有)',
    '',
  ].join('\n'));
  assert.deepEqual(run(), [
    'a.md:5  b.md#重複-2  找不到錨點',
    'a.md:5  b.md#0-1-答案格拆開--d-122  找不到錨點',
    'a.md:5  #沒有  找不到錨點',
  ]);
});

void test('大小寫不符要報；連到資料夾時有檔案在底下就算存在；指到 repo 外要報', async t => {
  const { add, run } = await repo(t);
  await add('docs/plans/README.md', '# 計畫\n');
  await add('docs/a.md', '# A\n\n[大小寫](Plans/README.md)、[資料夾](plans/)、[資料夾2](plans)、[根](/docs/plans/README.md)、[外面](../../x.md)、[空資料夾](empty/)\n');
  assert.deepEqual(run(), [
    'docs/a.md:3  Plans/README.md  大小寫不符（實際是 docs/plans/README.md）',
    'docs/a.md:3  ../../x.md  指到 repo 外',
    'docs/a.md:3  empty/  找不到檔案',
  ]);
});

void test('--staged 讀暫存區：沒 stage 的檔案與修改不算，已 stage 的刪除算不存在', async t => {
  const { root, put, add, run } = await repo(t);
  await add('target.md', '# T\n');
  await add('gone.md', '# G\n');
  await add('a.md', '# A\n\n[t](target.md)、[g](gone.md)\n');
  assert.deepEqual(run(true), []);
  // 只在工作樹的新檔案：兩種模式都不算存在（不是 Git 追蹤的檔案）。
  await put('new.md', '# N\n');
  await add('b.md', '# B\n\n[n](new.md)\n');
  assert.deepEqual(run(true), ['b.md:3  new.md  找不到檔案']);
  assert.deepEqual(run(false), ['b.md:3  new.md  找不到檔案']);
  git(root, 'rm', '-q', '--cached', '--', 'b.md');
  // 部分 stage：工作樹有壞連結但沒 stage，暫存區照舊。
  await put('a.md', '# A\n\n[t](target.md)、[g](gone.md)、[壞](broken.md)\n');
  assert.deepEqual(run(true), []);
  assert.deepEqual(run(false), ['a.md:3  broken.md  找不到檔案']);
  git(root, 'add', '--', 'a.md');
  assert.deepEqual(run(true), ['a.md:3  broken.md  找不到檔案']);
  await add('a.md', '# A\n\n[t](target.md)、[g](gone.md)\n');
  // 已 stage 的刪除。
  git(root, 'rm', '-q', '-f', '--', 'gone.md');
  assert.deepEqual(run(true), ['a.md:3  gone.md  找不到檔案']);
  // 已 stage 的改名：舊路徑不存在，新路徑存在。
  git(root, 'mv', 'target.md', 'moved.md');
  assert.deepEqual(run(true), ['a.md:3  target.md  找不到檔案', 'a.md:3  gone.md  找不到檔案']);
});

const roadmap = (rows: string[]) => [
  '# 路線圖',
  '',
  '## 現在在哪裡',
  '',
  '## 等觸發點',
  '',
  '## 已完成',
  '',
  '| 日期 | 工作 |',
  '|---|---|',
  ...rows.map(work => `| 2026-10-27 | ${work} |`),
  '',
].join('\n');

void test('roadmap 依序有〈現在在哪裡〉〈等觸發點〉〈已完成〉，中間可以有別的節；〈已完成〉不設列數上限（D-214 第 4、5 點）', async t => {
  const { add, run } = await repo(t);
  const rows = (n: number) => Array.from({ length: n }, (_, i) => `第 ${i + 1} 件`);
  await add(ROADMAP, roadmap(rows(30)));
  assert.deepEqual(run(), []);
  await add(ROADMAP, '# 路線圖\n\n## 現在在哪裡\n\n## 路線圖\n\n## 等觸發點\n\n## 未來\n\n## 已完成\n');
  assert.deepEqual(run(), []);
  await add(ROADMAP, '# 路線圖\n\n## 現在在哪裡\n\n## 已完成\n');
  assert.deepEqual(run(), [`${ROADMAP}:1  ## 等觸發點  找不到這一節`]);
  await add(ROADMAP, '# 路線圖\n\n## 現在在哪裡\n\n## 已完成\n\n## 等觸發點\n');
  assert.deepEqual(run(), [`${ROADMAP}:3  ## 現在在哪裡  三節要依序是〈現在在哪裡〉、〈等觸發點〉、〈已完成〉`]);
});

void test('backlog 的二級標題只有〈待處理〉〈已轉出〉，依這個順序；外掛的也是，更深的資料夾不查', async t => {
  const { add, run } = await repo(t);
  await add(BACKLOG, '# B\n\n## 待處理\n\n### 技術債\n\n#### 更深\n\n## 已轉出\n\n### 已定案對照\n');
  await add('plugins/capture/docs/backlog.md', '# C\n\n## 待處理\n\n## v1\n\n## 已轉出\n');
  await add('plugins/mindboard/docs/backlog.md', '# M\n\n## 已轉出\n\n## 待處理\n');
  await add('plugins/cards/docs/backlog.md', '# Cards\n\n## 待處理\n');
  await add('plugins/cards/docs/x/backlog.md', '# 不查\n\n## 別的\n');
  const reason = 'backlog 的二級標題只有〈待處理〉、〈已轉出〉，依這個順序；其他分類降成三級放進這兩節';
  assert.deepEqual(run(), [
    `plugins/capture/docs/backlog.md:5  ## v1  ${reason}`,
    `plugins/cards/docs/backlog.md:1  ## 待處理  ${reason}`,
    `plugins/mindboard/docs/backlog.md:1  ## 待處理  ${reason}`,
  ]);
});

void test('狀態行：凍結清單外的狀態檔照新格式；清單裡的照舊，改成新格式就照新格式查；其他檔看起來是新格式也查；清單裡不在的要刪', async t => {
  const { root, add } = await repo(t);
  await add(LEGACY_STATUS, JSON.stringify(['docs/tasks/old.md', 'docs/tasks/old-new.md', 'docs/tasks/gone.md', 'docs/x.md']));
  await add('docs/tasks/old.md', '# 舊\n\n狀態：進行中（舊寫法照舊）\n');
  await add('docs/tasks/old-new.md', '# 舊改新\n\n狀態：進行中｜下一步：x｜等誰：Claude\n');
  await add('docs/tasks/new.md', '# 新\n\n狀態：實作中｜下一步：寫測試｜等誰：Claude\n\n來自：無\n');
  await add('docs/tasks/new-old.md', '# 新的用舊寫法\n\n狀態：進行中\n');
  await add('docs/plans/quoted.md', '# 引用框\n\n> 狀態：規劃中｜下一步：x｜等誰：使用者\n');
  await add('docs/Claude Codex Discussion/2026-11-21-x.md', '# 討論\n\n狀態：已結案 → D-218｜完成：談定｜等誰：—\n');
  await add('plugins/cards/docs/card-rules/a.md', '# 規則\n\n狀態：實作中｜下一步：試一課｜等誰：新教材\n\n> 版本：第 2 版\n');
  await add('plugins/cards/docs/card-rules/b.md', '# 規則\n\n> 狀態：第 2 版（舊寫法，不是狀態行）\n');
  await add('docs/x.md', '# 不是狀態檔\n');
  const problems = checkDocs(root, { exceptions: [] }).problems.map(formatProblem);
  assert.deepEqual(problems, [
    'docs/plans/quoted.md:3  狀態：  狀態行要是標題下的一般段落（不在引用框、清單或程式碼區塊裡）',
    'docs/tasks/new-old.md:3  狀態：  要剛好三欄、用全形「｜」分，現在是 1 欄（欄裡的「｜」改用「，」）。寫法：狀態：<狀態值>｜下一步：<一句>｜等誰：<值>；結束時「狀態：已合併｜完成：<一句>｜等誰：—」',
    'docs/tasks/old-new.md:3  狀態：  「進行中」不是狀態值；可用：規劃中、討論中、實作中、待審、待實機、等觸發點、已合併、已結案、已結案 → <下一站>、暫停（<原因>）',
    'plugins/cards/docs/card-rules/a.md:3  狀態：  等誰只收使用者、Claude、Codex、實機、—（好幾個用「、」接）；「新教材」不是',
    `${LEGACY_STATUS}  docs/tasks/gone.md  凍結清單的這一項不在了（或不是任務、討論稿、plans 第一層的檔），請刪掉這一列`,
    `${LEGACY_STATUS}  docs/x.md  凍結清單的這一項不在了（或不是任務、討論稿、plans 第一層的檔），請刪掉這一列`,
  ]);
  // 清單不是 JSON 陣列要報；沒有清單時每份狀態檔都照新格式查。
  await add(LEGACY_STATUS, '{}');
  assert.ok(checkDocs(root, { exceptions: [] }).problems.map(formatProblem).includes(`${LEGACY_STATUS}  ${LEGACY_STATUS}  要是路徑字串的 JSON 陣列`));
  git(root, 'rm', '-q', '--cached', '--', LEGACY_STATUS);
  assert.ok(checkDocs(root, { staged: true, exceptions: [] }).problems.map(formatProblem).some(p => p.startsWith('docs/tasks/old.md:3  狀態：')));
});

void test('「→」與「來自」互相連回；日期要是真的；backlog〈待處理〉裡不能有「→」；「→」指到舊決定報錯；新決定的「來自」也要有「→」', async t => {
  const { add, run } = await repo(t);
  await add('docs/decisions.md', [
    '# 決策紀錄', '', '## D-217 舊', '', '✅ 2026-11-20', '',
    '## D-218 新', '', '✅ 2026-11-22｜來自 [plans/a](plans/a.md)', '', '主題：協作與文件｜一句話：x。', '',
    '## D-219 再新', '', '✅ 2026-11-22｜來自 [plans/b](plans/b.md)', '', '主題：協作與文件｜一句話：y。', '',
  ].join('\n'));
  await add(BACKLOG, [
    '# B', '', '## 待處理', '', '### 還在等', '', '- 待辦', '  → [plans/c](plans/c.md)（2026-11-21）', '',
    '## 已轉出', '', '### 點子甲', '', '- 甲', '  → [plans/a](plans/a.md)（2026-11-21）', '',
  ].join('\n'));
  const doc = (title: string, from = '') => `# ${title}\n\n狀態：實作中｜下一步：x｜等誰：Claude\n${from ? `\n來自：${from}\n` : ''}`;
  await add('docs/plans/a.md', [
    '# A', '', '狀態：已結案 → [D-218](../decisions.md#d-218-新)｜完成：談定｜等誰：—', '',
    '來自：[backlog〈點子甲〉](../backlog.md#點子甲)', '', '## 一', '',
    '→ [D-218](../decisions.md#d-218-新)（2026-11-22）',
    '→ [tasks/t](../tasks/t.md)（2026-11-22）',
    '→ [D-217](../decisions.md#d-217-舊)（2026-11-22）',
    '→ [tasks/u](../tasks/u.md)（2026-02-30）',
    '→ [tasks/t](../tasks/t.md) 2026-11-22',
    '',
    '> → [不算](../tasks/u.md)（引用框）',
    '',
    '```text', '→ [不算](../tasks/u.md)（程式碼）', '```', '',
  ].join('\n'));
  await add('docs/plans/b.md', doc('B'));
  await add('docs/plans/c.md', doc('C', '[backlog](../backlog.md#還在等)'));
  await add('docs/tasks/t.md', doc('T', '[plans/a](../plans/a.md)'));
  await add('docs/tasks/u.md', doc('U'));
  await add('docs/tasks/v.md', doc('V', '[plans/b](../plans/b.md)、[D-217](../decisions.md#d-217-舊)'));
  await add('docs/tasks/w.md', doc('W', '[backlog〈點子甲〉](../backlog.md#點子甲)'));
  await add('docs/tasks/twice.md', `${doc('Twice', '[plans/a](../plans/a.md)')}\n來自：[plans/b](../plans/b.md)\n`);
  const noArrow = (from: string) => `${from} 沒有「→」連到這裡：在那一站加一行「→ [文字](連結)（YYYY-MM-DD）」`;
  assert.deepEqual(run(), [
    'docs/backlog.md:8  →  轉出的項目搬到〈已轉出〉：〈待處理〉裡不能有「→」（D-214 第 4 點）',
    'docs/plans/a.md:12  →  2026-02-30 不是真的日期',
    'docs/plans/a.md:13  →  「→」那一行寫成「→ [文字](連結)（YYYY-MM-DD）」，一行一個連結',
    'docs/plans/a.md:11  →  D-217 是 D-218 以前的決定，沒有「來自」：不寫「→」，在內文提到就好',
    'docs/plans/a.md:12  →  docs/tasks/u.md 沒有「來自」連回這裡：在它第一個二級標題之前寫「來自：[…](…)」',
    'docs/tasks/twice.md:7  來自  「來自」只寫一段；好幾處用「、」接',
    `docs/tasks/twice.md:5  來自  ${noArrow('docs/plans/a.md')}`,
    `docs/tasks/twice.md:7  來自  ${noArrow('docs/plans/b.md')}`,
    `docs/tasks/v.md:5  來自  ${noArrow('docs/plans/b.md')}`,
    `docs/tasks/w.md:5  來自  ${noArrow('docs/backlog.md#點子甲')}`,
    `docs/decisions.md:13  來自  ${noArrow('docs/plans/b.md')}`,
  ]);
});

void test('tasks、討論稿與 docs/plans 第一層的檔案，標題下第一個非空行要有狀態；README、子資料夾與其他資料夾不查', async t => {
  const { add, run } = await repo(t);
  await add('docs/tasks/ok.md', '# 任務\n\n狀態：進行中\n');
  await add('docs/tasks/inline.md', '# 任務\n日期：2026-10-27｜整理者：Claude｜狀態：討論中 → D-141\n');
  await add('docs/tasks/missing.md', '# 任務\n\n建議模型：Opus\n\n狀態：進行中\n');
  await add('docs/tasks/no-title.md', '狀態：進行中\n');
  await add('docs/Claude Codex Discussion/2026-10-27-x.md', '# 討論\n\n日期：2026-10-27\n');
  await add('docs/plans/x.md', '# 主題\n\n[第二階段清單](../../a.md)\n\n狀態：規畫中\n');
  await add('docs/tasks/sub/deep.md', '# 不查\n');
  await add('docs/plans/sub/y.md', '# 不查\n');
  await add('docs/plans/README.md', '# 不查\n');
  await add('docs/tasks/README.md', '# 不查\n');
  await add('docs/x.md', '# 不查\n');
  await add('a.md', '# A\n');
  assert.deepEqual(run(), [
    'docs/Claude Codex Discussion/2026-10-27-x.md:3  狀態：  標題下第一個非空行沒有狀態',
    'docs/plans/x.md:3  狀態：  標題下第一個非空行沒有狀態',
    'docs/tasks/missing.md:3  狀態：  標題下第一個非空行沒有狀態',
    'docs/tasks/no-title.md:1  # 標題  沒有一級標題',
  ]);
});

void test('D-195：結束的任務〈結果〉要有恰好一行填好的「延後的測試：」；進行中、審查請求、D-195 之前結束的不查；印出補測列數', async t => {
  const { root, add, run } = await repo(t);
  const task = (status: string, result?: string, title = '結果') => `# 任務\n\n狀態：${status}\n\n## 1. 做什麼\n\n延後的測試：寫在這裡不算\n${result === undefined ? '' : `\n## ${title}\n\n${result}\n`}`;
  await add('docs/tasks/doing.md', task('進行中', '延後的測試：（實作後填）'));
  await add('docs/tasks/part.md', task('已完成第一部分，第二部分進行中', '合併了一半。'));
  await add('docs/tasks/not-yet.md', task('完成條件還沒達成，實作中', '還沒。'));
  await add('docs/tasks/none.md', task('已合併（2026-11-08）', '延後的測試：無'));
  // 「已合併進 `main`」也是結束（第二次里程碑檢查 R1：這樣寫的 5 份任務原本都沒被查）；「無」後面接說明可以，「無法測」不算無。
  await add('docs/tasks/into.md', task('已合併進 `main`（2026-11-10）', '合併了。'));
  await add('docs/tasks/into-ok.md', task('已合併進 `main`', '延後的測試：無（全部在 Node 測過）'));
  await add('docs/tasks/no-way.md', task('已完成', '延後的測試：無法測'));
  await add('docs/tasks/bold.md', task('已結案｜備註', '- **延後的測試**：「補測：存到一半中斷」、「補做：重貼」'));
  await add('docs/tasks/sub.md', task('已完成', '### Windows\n\n延後的測試：無', '結果（2026-11-08）'));
  await add('docs/tasks/missing.md', task('已結案', '合併了。'));
  await add('docs/tasks/no-result.md', task('完成：已合併'));
  await add('docs/tasks/todo.md', task('已完成', '延後的測試：（實作後填）'));
  await add('docs/tasks/empty-bold.md', task('已完成', '**延後的測試：**'));
  await add('docs/tasks/twice.md', task('已完成', '延後的測試：（實作後填）\n\n延後的測試：無'));
  await add('docs/tasks/no-quote.md', task('已完成', '延後的測試：補測：沒有括號'));
  await add('docs/tasks/quoted.md', task('已完成', '> 引言\n延後的測試：無'));
  await add('docs/tasks/fenced.md', task('已完成', '```\n延後的測試：無\n```\n\n<!-- 延後的測試：無 -->\n\n| 延後的測試：無 |\n|---|'));
  await add('docs/tasks/h3.md', task('已完成', '### 結果\n\n延後的測試：無', '10. 實機'));
  await add('docs/tasks/x-review.md', task('已完成', '通過'));
  await add('docs/tasks/w4.md', task('已合併', '合併了。'));
  await add('docs/x.md', task('已完成', '合併了。'));
  await add('docs/backlog.md', '# B\n\n## 待處理\n\n| 項目 | 觸發點 |\n|---|---|\n| 補測：不算 | 別節 |\n\n### 技術債\n\n| 項目 | 觸發點 |\n|---|---|\n| **補測：存到一半中斷**，影響小 | 空檔 |\n| 補做：重貼 | 空檔 |\n| 其他 | 空檔 |\n\n### 待決問題\n\n| 補做：也不算 | x |\n|---|---|\n\n## 已轉出\n');
  const common = [
    'docs/tasks/empty-bold.md:11  延後的測試：  還沒填：寫「無」或技術債表的列名（D-195）',
    'docs/tasks/fenced.md:3  延後的測試：  任務已結束，〈結果〉沒有「延後的測試：」一行（D-195）',
    'docs/tasks/h3.md:3  延後的測試：  任務已結束，〈結果〉沒有「延後的測試：」一行（D-195）',
    'docs/tasks/into.md:3  延後的測試：  任務已結束，〈結果〉沒有「延後的測試：」一行（D-195）',
    'docs/tasks/missing.md:3  延後的測試：  任務已結束，〈結果〉沒有「延後的測試：」一行（D-195）',
    'docs/tasks/no-quote.md:11  延後的測試：  寫「無」，或用「」括住技術債表的列名，例如「補測：……」（D-195）',
    'docs/tasks/no-result.md:3  延後的測試：  任務已結束，〈結果〉沒有「延後的測試：」一行（D-195）',
    'docs/tasks/no-way.md:11  延後的測試：  寫「無」，或用「」括住技術債表的列名，例如「補測：……」（D-195）',
    'docs/tasks/quoted.md:3  延後的測試：  任務已結束，〈結果〉沒有「延後的測試：」一行（D-195）',
    'docs/tasks/todo.md:11  延後的測試：  還沒填：寫「無」或技術債表的列名（D-195）',
    'docs/tasks/twice.md:13  延後的測試：  「延後的測試：」有 2 行，只能有一行（D-195）',
  ];
  assert.deepEqual(run(), common);
  assert.equal(checkDocs(root, { exceptions: [] }).deferred, 2);
  // 暫存區模式只對這次改到的任務對照列名；找不到的列報出來。
  await add('docs/tasks/ghost.md', task('已完成', '延後的測試：「補測：存到一半中斷」、「補測：不存在」'));
  assert.deepEqual(run(true), [...common.slice(0, 2), 'docs/tasks/ghost.md:11  延後的測試：  技術債表找不到「補測：不存在」開頭的列（D-195）', ...common.slice(2)]);
  git(root, 'commit', '-q', '-m', 'x', '--no-verify');
  assert.deepEqual(run(true).filter(p => p.startsWith('docs/tasks/ghost.md')), []);
});

void test('例外表只蓋掉逐項列出的連結；沒用到的例外要報', async t => {
  const { root, add } = await repo(t);
  await add('a.md', '# A\n\n[壞](missing.md)、[也壞](other.md)\n');
  const exceptions = [
    { file: 'a.md', target: 'missing.md', reason: '測試' },
    { file: 'a.md', target: 'unused.md', reason: '測試' },
  ];
  assert.deepEqual(checkDocs(root, { exceptions }).problems.map(formatProblem), [
    'a.md:3  other.md  找不到檔案',
    'a.md  unused.md  例外表的這一項沒有用到，請刪掉',
  ]);
});

void test('命令列：有問題時 exit code 1 並逐行列出，沒有時印摘要', async t => {
  const { root, add } = await repo(t);
  const script = fileURLToPath(new URL('../check-docs.ts', import.meta.url));
  await add('a.md', '# A\n\n[b](b.md)、[網站](https://example.com)\n');
  await add('b.md', '# B\n');
  assert.equal(execFileSync(process.execPath, [script, '--root', root], { encoding: 'utf8', stdio: 'pipe' }).trim(), '文件檢查通過（工作樹）：2 個 Markdown 檔、1 個連結；待補測與補做 0 列（最上層與 Cards 的 backlog 技術債，D-195）');
  await add('a.md', '# A\n\n[c](c.md)\n');
  assert.throws(
    () => execFileSync(process.execPath, [script, '--staged', '--root', root], { encoding: 'utf8', stdio: 'pipe' }),
    (error: { status: number; stderr: string }) => error.status === 1 && error.stderr.includes('a.md:3  c.md  找不到檔案'),
  );
});

// D-208 第一步 §7：外掛的資料夾照最上層的規則查。
void test('§7 外掛的 tasks、討論稿與 docs/plans 第一層也要有狀態；README、子資料夾與外掛的其他資料夾不查', async t => {
  const { add, run } = await repo(t);
  await add('plugins/mindboard/docs/tasks/ok.md', '# 任務\n\n狀態：進行中\n');
  await add('plugins/mindboard/docs/tasks/missing.md', '# 任務\n\n建議模型：Opus\n');
  await add('plugins/capture/docs/Claude Codex Discussion/2026-11-17-x.md', '# 討論\n\n日期：2026-11-17\n');
  await add('plugins/capture/docs/plans/x.md', '# 主題\n\n規畫中\n');
  await add('plugins/mindboard/docs/tasks/README.md', '# 不查\n');
  await add('plugins/mindboard/docs/tasks/sub/deep.md', '# 不查\n');
  await add('plugins/mindboard/docs/backlog.md', '# 不查狀態\n\n## 待處理\n\n## 已轉出\n');
  await add('plugins/mindboard/notes/x.md', '# 不查\n');
  assert.deepEqual(run(), [
    'plugins/capture/docs/Claude Codex Discussion/2026-11-17-x.md:3  狀態：  標題下第一個非空行沒有狀態',
    'plugins/capture/docs/plans/x.md:3  狀態：  標題下第一個非空行沒有狀態',
    'plugins/mindboard/docs/tasks/missing.md:3  狀態：  標題下第一個非空行沒有狀態',
  ]);
});

void test('§7 外掛的 roadmap：三節都要有、已完成不設列數上限；最上層的〈現在在哪裡〉要連到它的〈現在在哪裡〉', async t => {
  const { add, run } = await repo(t);
  const rows = (n: number) => Array.from({ length: n }, (_, i) => `第 ${i + 1} 件`);
  const plugin = 'plugins/mindboard/docs/roadmap.md';
  const target = '../plugins/mindboard/docs/roadmap.md#現在在哪裡';
  const missing = (line: number) => `${ROADMAP}:${line}  ${target}  外掛有自己的 roadmap，最上層的〈現在在哪裡〉要連到它的〈現在在哪裡〉（D-208 第 4 點）`;
  const top = (now: string, after = '') => ['# 路線圖', '', '## 現在在哪裡', '', now, '', '## 等觸發點', '', '## 已完成', '', after, ''].join('\n');
  // 外掛沒有 roadmap：最上層不用連。
  await add(ROADMAP, top('Cards 的進度。'));
  assert.deepEqual(run(), []);
  // 外掛的 roadmap 本身照最上層的規則。
  await add(plugin, '# Mindboard 路線圖\n\n## 已完成\n\n| 日期 | 工作 |\n|---|---|\n' + rows(11).map(work => `| 2026-11-17 | ${work} |`).join('\n') + '\n');
  assert.deepEqual(run(), [
    `${plugin}:1  ## 現在在哪裡  找不到這一節`,
    `${plugin}:1  ## 等觸發點  找不到這一節`,
    missing(3),
  ]);
  await add(plugin, roadmap(rows(11)));
  // 最上層沒連、連到錯的錨點、連結在〈現在在哪裡〉以外都要報。
  assert.deepEqual(run(), [missing(3)]);
  await add(ROADMAP, top('Mindboard 見 [它的路線圖](../plugins/mindboard/docs/roadmap.md#已完成)。'));
  assert.deepEqual(run(), [missing(3)]);
  await add(ROADMAP, top('Cards 的進度。', '[Mindboard](../plugins/mindboard/docs/roadmap.md#現在在哪裡)'));
  assert.deepEqual(run(), [missing(3)]);
  await add(ROADMAP, top('Mindboard 見 [它的路線圖](../plugins/mindboard/docs/roadmap.md#現在在哪裡)。'));
  assert.deepEqual(run(), []);
});

void test('§7 外掛的任務對外掛自己的 backlog；BEFORE_D195 只放過最上層與 Cards 的舊任務；檔名有空白與中文照樣查到', async t => {
  const { root, add, run } = await repo(t);
  const task = (result: string) => `# 任務\n\n狀態：已完成\n\n## 結果\n\n${result}\n`;
  const debt = (...rows: string[]) => `# B\n\n## 待處理\n\n### 技術債\n\n| 項目 | 觸發點 |\n|---|---|\n${rows.map(row => `| ${row} | 空檔 |`).join('\n')}\n\n## 已轉出\n`;
  await add('docs/backlog.md', debt('補測：最上層才有'));
  await add('plugins/capture/docs/backlog.md', debt('補測：外掛的列'));
  await add('plugins/mindboard/docs/backlog.md', '# Mindboard 的待做\n\n## 待處理\n\n還沒有技術債表。\n\n## 已轉出\n');
  await add('plugins/capture/docs/tasks/ok.md', task('延後的測試：「補測：外掛的列」'));
  await add('plugins/capture/docs/tasks/轉錄 稿.md', task('延後的測試：「補測：最上層才有」'));
  await add('plugins/mindboard/docs/tasks/no-table.md', task('延後的測試：「補測：外掛的列」'));
  await add('plugins/mindboard/docs/tasks/none.md', task('延後的測試：無'));
  await add('plugins/mindboard/docs/tasks/w3.md', task('合併了。'));
  await add('docs/tasks/w3.md', task('合併了。'));
  const w3 = 'plugins/mindboard/docs/tasks/w3.md:3  延後的測試：  任務已結束，〈結果〉沒有「延後的測試：」一行（D-195）';
  assert.deepEqual(run(true), [
    'plugins/capture/docs/tasks/轉錄 稿.md:7  延後的測試：  plugins/capture/docs/backlog.md 的技術債表找不到「補測：最上層才有」開頭的列（D-195）',
    'plugins/mindboard/docs/tasks/no-table.md:7  延後的測試：  plugins/mindboard/docs/backlog.md 沒有技術債表（或沒有這份檔），對不到列名（D-195）',
    w3,
  ]);
  // 外掛沒有 backlog 也一樣。
  git(root, 'rm', '-q', '--cached', '--', 'plugins/mindboard/docs/backlog.md');
  assert.deepEqual(run(true).filter(p => p.includes('no-table.md')), ['plugins/mindboard/docs/tasks/no-table.md:7  延後的測試：  plugins/mindboard/docs/backlog.md 沒有技術債表（或沒有這份檔），對不到列名（D-195）']);
  // 補完刪掉列的歷史任務：沒改到就不對照列名。
  await add('plugins/capture/docs/tasks/轉錄 稿.md', task('延後的測試：「補測：外掛的列」'));
  git(root, 'commit', '-q', '-m', 'x', '--no-verify');
  await add('plugins/capture/docs/backlog.md', debt('補測：別的列'));
  assert.deepEqual(run(true), [w3]);
});

void test('§B3 BEFORE_D195 也放過 Cards 的舊任務（那時都在最上層），只放過清單上的檔名', async t => {
  const { add, run } = await repo(t);
  const task = (result: string) => `# 任務\n\n狀態：已完成\n\n## 結果\n\n${result}\n`;
  await add('plugins/cards/docs/tasks/w3.md', task('合併了。'));
  await add('plugins/cards/docs/tasks/new.md', task('合併了。'));
  assert.deepEqual(run(), ['plugins/cards/docs/tasks/new.md:3  延後的測試：  任務已結束，〈結果〉沒有「延後的測試：」一行（D-195）']);
});

void test('§B3 舊位置：最上層或外掛根目錄的 tasks/、Claude Codex Discussion/ 有追蹤的檔就報，寫出新位置', async t => {
  const { add, run } = await repo(t);
  await add('tasks/a.md', '# 任務\n\n狀態：進行中\n');
  await add('Claude Codex Discussion/x.png', 'x');
  await add('plugins/capture/tasks/b.md', '# 任務\n\n狀態：進行中\n');
  await add('plugins/mindboard/Claude Codex Discussion/c.md', '# 討論\n\n狀態：進行中\n');
  await add('docs/tasks/ok.md', '# 任務\n\n狀態：進行中\n');
  await add('docs/x/tasks/ok.md', '# 不是舊位置\n');
  // 新位置照常查狀態行。
  await add('docs/tasks/no-status.md', '# 任務\n\n建議模型：Opus\n');
  await add('plugins/capture/docs/tasks/no-status.md', '# 任務\n\n建議模型：Opus\n');
  assert.deepEqual(run(), [
    'Claude Codex Discussion/x.png  docs/Claude Codex Discussion/  任務與討論稿放 docs/ 底下（D-213）：搬到這個位置',
    'plugins/capture/tasks/b.md  plugins/capture/docs/tasks/  任務與討論稿放 docs/ 底下（D-213）：搬到這個位置',
    'plugins/mindboard/Claude Codex Discussion/c.md  plugins/mindboard/docs/Claude Codex Discussion/  任務與討論稿放 docs/ 底下（D-213）：搬到這個位置',
    'tasks/a.md  docs/tasks/  任務與討論稿放 docs/ 底下（D-213）：搬到這個位置',
    'docs/tasks/no-status.md:3  狀態：  標題下第一個非空行沒有狀態',
    'plugins/capture/docs/tasks/no-status.md:3  狀態：  標題下第一個非空行沒有狀態',
  ]);
});

void test('§B3 製卡規則送給 AI 的部分：表上的檔與路徑，標記以下照搬家前的位置解得到也算；新的檔、表上沒有的路徑照常查；沒用到的要刪（L2 R3）', async t => {
  const { add, run } = await repo(t);
  await add('docs/decisions.md', '# D\n\n## d-1\n');
  await add('plugins/cards/docs/backlog.md', '# B\n\n## 待處理\n\n## 已轉出\n');
  const rule = '# 規則\n\n[上](../decisions.md#d-1)\n\n<!-- 以下送給 AI -->\n\n[決定](../decisions.md#d-1)、[backlog](../backlog.md)、[沒有](../nowhere.md)\n';
  // english.md 在 FROZEN_RULES 的表上（只有 ../decisions.md）；review-probe.md 是搬家後新增的規則檔（Codex 的探針）。
  await add('plugins/cards/docs/card-rules/english.md', rule);
  await add('plugins/cards/docs/card-rules/review-probe.md', rule);
  await add('plugins/cards/docs/other/x.md', rule);
  // elementary-social.md 在表上，這裡只連 ../decisions.md 與中文檔名的短規則（解析器取到的是百分比編碼）：試作場的其他三條沒用到，要刪。
  await add('experiments/t4/arch/短規則.md', '# 短規則\n');
  await add('plugins/cards/docs/card-rules/elementary-social.md', '# 社會\n\n<!-- 以下送給 AI -->\n\n[決定](../decisions.md#d-1)、[短規則](../../experiments/t4/arch/短規則.md)\n');
  await add('plugins/cards/manifest.json', '{}\n');
  const social = (path: string) => 'plugins/cards/docs/card-rules/elementary-social.md  ' + path + '  FROZEN_RULES 的這一項沒有用到（連結改好了或拿掉了），請刪掉';
  // elementary-chinese.md 在表上但這裡沒有這份檔（像是改名或拿掉）：那一列要刪，之後同名的新檔才不會被放過（第二輪）。
  assert.deepEqual(run(), [
    'plugins/cards/docs/card-rules/english.md:3  ../decisions.md#d-1  找不到檔案',
    'plugins/cards/docs/card-rules/english.md:7  ../nowhere.md  找不到檔案',
    'plugins/cards/docs/card-rules/review-probe.md:3  ../decisions.md#d-1  找不到檔案',
    'plugins/cards/docs/card-rules/review-probe.md:7  ../decisions.md#d-1  找不到檔案',
    'plugins/cards/docs/card-rules/review-probe.md:7  ../nowhere.md  找不到檔案',
    'plugins/cards/docs/other/x.md:3  ../decisions.md#d-1  找不到檔案',
    'plugins/cards/docs/other/x.md:7  ../decisions.md#d-1  找不到檔案',
    'plugins/cards/docs/other/x.md:7  ../nowhere.md  找不到檔案',
    'plugins/cards/docs/card-rules/elementary-chinese.md  plugins/cards/docs/card-rules/elementary-chinese.md  FROZEN_RULES 的這一列的檔不在了（拿掉或改名），請刪掉這一列',
    social('../../experiments/t4/arch/第二輪/判斷邊界.md'),
    social('../../experiments/t4/arch/第二輪/五步.md'),
    social('../../experiments/t4/arch/第二輪/格式.md'),
  ]);
});

void test('§B3 製卡規則整個資料夾搬走：表上的三列都要刪（L2 第三輪）；沒有 Cards 的 manifest 的 repo 不看', async t => {
  const { add, run } = await repo(t);
  await add('docs/x.md', '# X\n');
  assert.deepEqual(run(), []);
  await add('plugins/cards/manifest.json', '{}\n');
  await add('plugins/cards/docs/rules/english.md', '# 英文\n');
  const gone = (file: string) => `plugins/cards/docs/card-rules/${file}  plugins/cards/docs/card-rules/${file}  FROZEN_RULES 的這一列的檔不在了（拿掉或改名），請刪掉這一列`;
  assert.deepEqual(run(), [gone('elementary-chinese.md'), gone('elementary-social.md'), gone('english.md')]);
});

// D-214 第 2、3 點：「→」與反過來的「來自」都是往下游的邊；拆分列出每一支，退回的循環停在退回到的那一站。
void test('往下游的鏈：拆分、退回、backlog 的一站、決定來自決定', () => {
  const status = (state: string) => state === '實作中' ? '狀態：實作中｜下一步：寫測試｜等誰：Claude' : `狀態：${state}｜完成：做完了｜等誰：—`;
  const texts = new Map([
    ['docs/backlog.md', ['# Backlog', '', '## 待處理', '', '### 點子丙', '', '## 已轉出', '',
      '### 點子甲', '', '→ [plans](plans/p.md)（2026-11-01）', '', '### 點子乙', '', '→ [D-218](decisions.md#d-218-新甲)（2026-11-02）', ''].join('\n')],
    ['docs/plans/p.md', ['# P', '', status('已結案'), '', '來自：[點子甲](../backlog.md#點子甲)', '',
      '→ [任務 a](../tasks/a.md)（2026-11-02）', '', '→ [任務 b](../tasks/b.md)（2026-11-02）', '', '## 內容', ''].join('\n')],
    ['docs/tasks/a.md', ['# A', '', status('實作中'), '', '來自：[P](../plans/p.md)', ''].join('\n')],
    // b 送去討論、討論完退回 b：b ⇄ c 是一個循環，從 P 走進來的是 b。
    ['docs/tasks/b.md', ['# B', '', status('實作中'), '', '來自：[P](../plans/p.md)、[討論 c](<../Claude Codex Discussion/c.md>)', '',
      '→ [討論 c](<../Claude Codex Discussion/c.md>)（2026-11-03）', ''].join('\n')],
    ['docs/Claude Codex Discussion/c.md', ['# C', '', status('已結案'), '', '來自：[B](../tasks/b.md)', '', '→ [退回 b](../tasks/b.md)（2026-11-04）', ''].join('\n')],
    ['docs/decisions.md', ['# 決策紀錄', '', '---', '',
      '## D-218 新甲', '', '✅ 2026-11-02｜來自 [點子乙](backlog.md#點子乙)', '', '主題：協作與文件｜一句話：甲。', '',
      '## D-219 新乙', '', '✅ 2026-11-03｜來自 [D-218](#d-218-新甲)', '', '主題：協作與文件｜一句話：乙。', ''].join('\n')],
    ['docs/notes.txt', '來自：[P](plans/p.md)'],
  ]);
  assert.deepEqual(downstreamOf(texts, 'docs/backlog.md#點子甲'), ['docs/tasks/a.md', 'docs/tasks/b.md']);
  assert.deepEqual(downstreamOf(texts, 'docs/plans/p.md'), ['docs/tasks/a.md', 'docs/tasks/b.md']);
  assert.deepEqual(downstreamOf(texts, 'docs/backlog.md#點子乙'), ['docs/decisions.md#d-219-新乙']);
  assert.deepEqual(downstreamOf(texts, 'docs/decisions.md#d-218-新甲'), ['docs/decisions.md#d-219-新乙']);
  // 走不出去的站：沒有下游。
  assert.deepEqual(downstreamOf(texts, 'docs/tasks/a.md'), []);
  assert.deepEqual(downstreamOf(texts, 'docs/backlog.md#點子丙'), []);
  // b 之後往前走到 d：循環不再是最下游，d 才是。
  texts.set('docs/tasks/d.md', ['# D', '', status('實作中'), '', '來自：[B](b.md)', ''].join('\n'));
  assert.deepEqual(downstreamOf(texts, 'docs/plans/p.md'), ['docs/tasks/a.md', 'docs/tasks/d.md']);
});
