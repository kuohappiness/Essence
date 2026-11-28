// 給新專案的模板的成長包三支小工具（D-247，docs/tasks/project-starter-template.md〈5〉與〈7〉第 8 項）。
// 這幾個路徑寫在這裡，只改這幾支的 commit，pre-commit 也會跑這個測試（分派表的相關測試照路徑全名找）：
//   templates/project-starter/growth/tools/section.mjs
//   templates/project-starter/growth/tools/status-board.mjs
//   templates/project-starter/growth/tools/decisions-index.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const TOOLS = fileURLToPath(new URL('../../templates/project-starter/growth/tools/', import.meta.url));

/** 暫存的 git repo；put 寫檔，commit 時用固定的日期。 */
async function repo(t: test.TestContext) {
  const root = await mkdtemp(join(tmpdir(), 'starter-growth-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const env: NodeJS.ProcessEnv = { ...process.env, GIT_CONFIG_GLOBAL: join(root, '.gitconfig-test'), GIT_CONFIG_NOSYSTEM: '1' };
  for (const key of Object.keys(env)) if (key.toUpperCase().startsWith('GIT_') && !['GIT_CONFIG_GLOBAL', 'GIT_CONFIG_NOSYSTEM'].includes(key)) delete env[key];
  const git = (args: string[], date?: string) => execFileSync('git', ['-c', 'user.name=GrowthTest', '-c', 'user.email=test@example.invalid', ...args], {
    cwd: root, encoding: 'utf8', env: date ? { ...env, GIT_AUTHOR_DATE: `${date}T12:00:00Z`, GIT_COMMITTER_DATE: `${date}T12:00:00Z` } : env,
  });
  git(['init', '-q', '-b', 'main']);
  const put = async (path: string, text: string) => {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), text);
  };
  const commit = (paths: string[], date: string) => {
    git(['add', '--', ...paths]);
    git(['commit', '-q', '-m', 'x'], date);
  };
  const tool = (name: string, ...args: string[]) => spawnSync(process.execPath, [join(TOOLS, name), ...args], { cwd: root, env, encoding: 'utf8' });
  return { root, put, commit, tool };
}

void test('成長包 section.mjs：找得到標題時印那一節與行號；程式碼裡的 # 不算；找不到時列出全部標題、exit 1（驗收第 8 項）', async t => {
  const { put, tool } = await repo(t);
  await put('doc.md', '# 標題\n\n前言\n\n## 待處理\n\n內容\n\n```text\n## 程式碼裡的不算\n```\n\n### 技術債\n\n表\n\n## 已轉出\n\n舊的\n');
  const found = tool('section.mjs', 'doc.md', '待處理');
  assert.equal(found.status, 0, found.stderr);
  assert.equal(found.stdout, 'doc.md:5-16\n## 待處理\n\n內容\n\n```text\n## 程式碼裡的不算\n```\n\n### 技術債\n\n表\n\n');
  const listed = tool('section.mjs', 'doc.md');
  assert.equal(listed.status, 0);
  assert.deepEqual(listed.stdout.trim().split('\n').map(line => line.trim().replace(/（\d+ 字）$/, '')), ['1  # 標題', '5  ## 待處理', '13  ### 技術債', '17  ## 已轉出']);
  const missing = tool('section.mjs', 'doc.md', '不存在的標題');
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /沒有包含「不存在的標題」的標題，全部的標題：\n\s+1 {2}# 標題/);
});

const ROADMAP = '# 開發現況\n\n開工只讀〈現在在哪裡〉。\n\n## 現在在哪裡\n\n（舊的）\n\n## 等觸發點\n\n## 已完成\n\n| 日期 | 工作 |\n|---|---|\n\n## 更早的已完成\n\n手寫的舊列，工具不動。\n';

const EXPECTED_TOP = [
  '# 開發現況', '', '開工只讀〈現在在哪裡〉。', '',
  '## 現在在哪裡', '', '| 工作 | 狀態 | 下一步 | 等誰 | 入口 |', '|---|---|---|---|---|', '| 登入畫面 | 實作中 | 寫測試 | AI | [入口](tasks/a-login.md) |', '',
  '## 等觸發點', '', '| 工作 | 觸發點 | 入口 |', '|---|---|---|', '| 匯出 | 有人要匯出時 | [入口](tasks/b-export.md) |', '',
  '## 已完成', '', '最新的在最上面，由 `node tools/status-board.mjs` 產生。', '', '| 日期 | 工作 |', '|---|---|',
];
const EXPECTED_BOTTOM = ['', '## 更早的已完成', '', '手寫的舊列，工具不動。', ''];
const SETUP_ROW = '| 2026-01-10 | **初始設定**：三步設定做完（已合併，[入口](tasks/c-setup.md)） |';

void test('成長包 status-board.mjs：三種狀態各進對的一節，相對連結改成從 roadmap 出發；〈已完成〉的日期第一次產生後沿用，跨日 commit、淺層 clone 都不變；--check 對不上時失敗（驗收第 8 項）', async t => {
  const { root, put, commit, tool } = await repo(t);
  const { main } = await import(join(TOOLS, 'status-board.mjs')) as { main: (args: string[], root: string, today?: string) => number };
  const errors = t.mock.method(console, 'error', () => {});
  t.mock.method(console, 'log', () => {});
  const roadmap = () => readFile(join(root, 'docs/roadmap.md'), 'utf8');
  await put('docs/roadmap.md', ROADMAP);
  await put('docs/tasks/a-login.md', '# 登入畫面\n\n狀態：實作中｜下一步：寫測試｜等誰：AI\n\n來自：x\n');
  await put('docs/tasks/b-export.md', '# 匯出\n\n狀態：等觸發點｜下一步：有人要匯出時｜等誰：—\n');
  await put('docs/tasks/c-setup.md', '# 初始設定\n\n狀態：已合併｜完成：三步設定做完｜等誰：—\n');
  await put('docs/plans/d-pricing.md', '# 價格方案\n\n狀態：討論中｜下一步：比較三種方案，見 [草稿](d-pricing-draft.md#比較)｜等誰：使用者\n');
  await put('docs/tasks/README.md', '# 任務\n\n沒有狀態行也不算。\n');

  assert.equal(main(['--check'], root, '2026-01-10'), 1, '還沒跑工具，--check 要失敗');
  assert.match(String(errors.mock.calls.at(-1)?.arguments[0]), /對不上：跑 node tools\/status-board\.mjs/);
  assert.equal(await roadmap(), ROADMAP, '--check 不寫檔');
  assert.equal(main([], root, '2026-01-10'), 0);
  assert.equal(await roadmap(), [
    ...EXPECTED_TOP.slice(0, 8), '| 價格方案 | 討論中 | 比較三種方案，見 [草稿](plans/d-pricing-draft.md#比較) | 使用者 | [入口](plans/d-pricing.md) |',
    '| 登入畫面 | 實作中 | 寫測試 | AI | [入口](tasks/a-login.md) |', '',
    ...EXPECTED_TOP.slice(10), SETUP_ROW, ...EXPECTED_BOTTOM,
  ].join('\n'));
  commit(['docs'], '2026-01-10');

  // 跨日結案：1 月 20 日改狀態、重產，1 月 21 日才 commit，1 月 22 日再檢查。
  await put('docs/plans/d-pricing.md', '# 價格方案\n\n狀態：已結案 → [D-002](../decisions/D-002.md)｜完成：談成決定，見 [D-002](../decisions/D-002.md)｜等誰：—\n');
  assert.equal(main(['--check'], root, '2026-01-20'), 1, '狀態改了還沒重產，--check 要失敗');
  assert.equal(main([], root, '2026-01-20'), 0);
  const expected = [
    ...EXPECTED_TOP,
    '| 2026-01-20 | **價格方案**：談成決定，見 [D-002](decisions/D-002.md)（已結案 → [D-002](decisions/D-002.md)，[入口](plans/d-pricing.md)） |',
    SETUP_ROW, ...EXPECTED_BOTTOM,
  ].join('\n');
  assert.equal(await roadmap(), expected, '舊的一列沿用 1 月 10 日，新結案的用產生那天');
  commit(['docs'], '2026-01-21');
  assert.equal(main(['--check'], root, '2026-01-22'), 0, 'commit 之後、隔天再檢查都通過');
  assert.equal(main([], root, '2026-01-22'), 0);
  assert.equal(await roadmap(), expected, '重跑不再改');

  // 淺層 clone（CI 的 actions/checkout 預設深度 1）也通過，因為日期不從 git 歷史來。
  const shallow = join(root, 'shallow');
  execFileSync('git', ['clone', '-q', '--depth', '1', pathToFileURL(root).href, shallow], { stdio: 'ignore' });
  const cloned = spawnSync(process.execPath, [join(TOOLS, 'status-board.mjs'), '--check'], { cwd: shallow, encoding: 'utf8' });
  assert.equal(cloned.status, 0, cloned.stderr);
  assert.equal(tool('status-board.mjs', '--check').status, 0, '從命令列跑也通過');
});

void test('成長包 status-board.mjs：狀態行格式不對時報出檔名與原因，不寫檔', async t => {
  const { root, put, tool } = await repo(t);
  await put('docs/roadmap.md', ROADMAP);
  const cases: [string, RegExp][] = [
    ['# 甲\n\n狀態：實作中｜下一步：寫｜等誰：AI｜多一欄\n', /剛好三欄/],
    ['# 甲\n\n狀態：快好了｜下一步：寫｜等誰：AI\n', /狀態值「快好了」不認得/],
    ['# 甲\n\n狀態：已合併｜下一步：寫｜等誰：—\n', /結束的第二欄寫「完成：/],
    ['# 甲\n\n狀態：實作中｜下一步：｜等誰：AI\n', /「下一步」不能空/],
    ['# 甲\n\n狀態：等觸發點｜下一步：有人要時｜等誰：AI\n', /等觸發點的「等誰」寫「—」/],
    ['# 甲\n\n狀態：暫停｜下一步：寫｜等誰：AI\n', /狀態值「暫停」不認得/],
    ['# 甲\n\n沒有狀態行\n', /標題下第一個非空行要是狀態行/],
    ['沒有標題\n', /一級標題/],
  ];
  for (const [text, expected] of cases) {
    await put('docs/tasks/bad.md', text);
    const result = tool('status-board.mjs');
    assert.equal(result.status, 1, text);
    assert.match(result.stderr, new RegExp(`docs/tasks/bad\\.md：.*${expected.source}`), text);
  }
  assert.equal(await readFile(join(root, 'docs/roadmap.md'), 'utf8'), ROADMAP);
  await put('docs/roadmap.md', '# 開發現況\n\n## 現在在哪裡\n\n## 已完成\n');
  await put('docs/tasks/bad.md', '# 甲\n\n狀態：實作中｜下一步：寫｜等誰：AI\n');
  const missing = tool('status-board.mjs');
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /少了 〈等觸發點〉/);
});

const README = (rows: string) => `# 決定\n\n說明的段落，工具不動。\n\n## 索引\n\n<!-- 索引開始：由 tools/decisions-index.mjs 產生，不要手改 -->\n${rows}<!-- 索引結束 -->\n\n## 一條決定的寫法\n\n後面的段落也不動。\n`;
/** 手寫的、預期的索引（工具重產後要和它一樣）。 */
const HANDWRITTEN = [
  '| 編號 | 一句話 | 日期 | 狀態 |', '|---|---|---|---|',
  '| [D-001](D-001.md) | 採用這套初始架構 | 2026-01-05 | 已修改，見 D-003 |',
  '| [D-002](D-002.md) | 進度放檔案 | 2026-01-06 | 已取代，見 D-010 |',
  '| [D-003](D-003.md) | 查核者改成第二個 AI | 2026-01-08 | ✅ |',
  '| [D-010](D-010.md) | 進度改放 Issues，表格裡的 \\| 要跳脫 | 2026-02-01 | ✅ |', '',
].join('\n');

void test('成長包 decisions-index.mjs：重產後和手寫的一致；--check 對不上時失敗；記號外的內容不動（驗收第 8 項）', async t => {
  const { root, put, tool } = await repo(t);
  await put('docs/decisions/D-001.md', '# D-001 初始架構\n\n✅ 2026-01-05｜使用者提出\n\n一句話：採用這套初始架構\n');
  await put('docs/decisions/D-002.md', '# D-002 進度\n\n✅ 2026-01-06｜來自 [backlog](../backlog.md#x)\n\n一句話：進度放檔案\n');
  await put('docs/decisions/D-003.md', '# D-003 查核者\n\n✅ 2026-01-08｜使用者提出｜修改 [D-001](D-001.md)（第 3 點）\n\n一句話：查核者改成第二個 AI\n');
  await put('docs/decisions/D-010.md', '# D-010 Issues\n\n✅ 2026-02-01｜使用者提出｜取代 [D-002](D-002.md)\n\n一句話：進度改放 Issues，表格裡的 | 要跳脫\n');
  await put('docs/decisions/README.md', README(HANDWRITTEN));
  const ok = tool('decisions-index.mjs', '--check');
  assert.equal(ok.status, 0, ok.stderr);
  assert.match(tool('decisions-index.mjs').stdout, /已經是最新的/);
  assert.equal(await readFile(join(root, 'docs/decisions/README.md'), 'utf8'), README(HANDWRITTEN), '和手寫的一致，重產不改任何字');

  await put('docs/decisions/README.md', README('| 舊的 |\n'));
  const stale = tool('decisions-index.mjs', '--check');
  assert.equal(stale.status, 1);
  assert.match(stale.stderr, /索引和決定的檔對不上：跑 node tools\/decisions-index\.mjs/);
  assert.equal(await readFile(join(root, 'docs/decisions/README.md'), 'utf8'), README('| 舊的 |\n'), '--check 不寫檔');
  assert.equal(tool('decisions-index.mjs').status, 0);
  assert.equal(await readFile(join(root, 'docs/decisions/README.md'), 'utf8'), README(HANDWRITTEN));
});

void test('成長包 decisions-index.mjs：格式不對、提到不存在的決定、少了記號，都報出檔名與原因', async t => {
  const { put, tool } = await repo(t);
  await put('docs/decisions/README.md', README(''));
  const cases: [string, string, RegExp][] = [
    ['D-004.md', '# D-005 編號不對\n\n✅ 2026-01-01｜使用者提出\n\n一句話：x\n', /D-004\.md：標題的編號 D-005 和檔名對不上/],
    ['D-004.md', '# D-004 沒日期\n\n✅ 【還沒填】｜使用者提出\n\n一句話：x\n', /D-004\.md：.*開頭是符號與日期/],
    ['D-004.md', '# D-004 沒一句話\n\n✅ 2026-01-01｜使用者提出\n', /D-004\.md：少了「一句話：…」/],
    ['D-004.md', '# D-004 修改不存在的\n\n✅ 2026-01-01｜修改 [D-009](D-009.md)\n\n一句話：x\n', /D-004\.md：狀態行提到的 D-009 不存在/],
  ];
  for (const [file, text, expected] of cases) {
    await put(`docs/decisions/${file}`, text);
    const result = tool('decisions-index.mjs');
    assert.equal(result.status, 1, text);
    assert.match(result.stderr, expected, text);
  }
  await put('docs/decisions/D-004.md', '# D-004 好的\n\n✅ 2026-01-01｜使用者提出\n\n一句話：x\n');
  await put('docs/decisions/README.md', '# 決定\n\n| 編號 |\n');
  const markers = tool('decisions-index.mjs');
  assert.equal(markers.status, 1);
  assert.match(markers.stderr, /找不到索引的記號/);
});
