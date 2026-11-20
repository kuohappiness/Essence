import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { RELEASE_ROADMAP, ROADMAP, RoadmapError, findPrivate, groupByWaiting, headline, parsePluginWorks, parseRelease, parseRoadmap, parseTopWorks, renderBoard } from '../roadmap-board.ts';

const SAMPLE = `# 標題

更新：2026-11-16

## 現在在哪裡

說明段落。

| 工作 | 狀態 | 下一步 | 等誰 | 入口 |
|---|---|---|---|---|
| 甲 \\| 乙 | 用 \`a\\|b\` 也行 | 看[任務](../tasks/x.md)、[討論](<../Claude Codex Discussion/y.md>) | 使用者 | [D-1](decisions.md#d-1-標題) |
| 更新與相容 | 正式使用的 vault 現在是 \`0.5.0\`（2026-11-14，見已完成） | [本頁](#已完成) | 下一版 | |
| 丙 | 狀態 | 下一步 | 等觸發點 | |
| 丁 | 狀態 | 下一步 | 觸發點 | |

## 已完成

| 日期 | 工作 |
|---|---|
| 2026-11-16 | 接句卡合併進 \`main\`：細節 |
| 2026-11-15 | 只是決定：沒有合併 |
| 2026-11-14 | 升正式版 \`0.5.0\`（tag \`v0.5.0\`）裝到正式 vault |
| 2026-11-13 | 設定合併進 \`main\`，已在 0.5.0 |
`;

void test('最上層的入口讀得出進行中的工作；Cards 的 roadmap 讀得出已完成與正式 vault 的版本', () => {
  const read = (file: string) => readFileSync(new URL('../../' + file, import.meta.url), 'utf8');
  assert.ok(parseTopWorks(read(ROADMAP)).length >= 1);
  const release = parseRelease(read(RELEASE_ROADMAP));
  assert.ok(release.done.length >= 1);
  assert.match(release.vault?.version ?? '', /^\d+\.\d+\.\d+$/);
  assert.ok(parsePluginWorks(read(RELEASE_ROADMAP), RELEASE_ROADMAP).every(work => work.name.text.startsWith('Cards｜')));
});

void test('最上層的入口不需要「已完成」；發布那份少了「已完成」照樣報', () => {
  const top = SAMPLE.slice(0, SAMPLE.indexOf('## 已完成'));
  assert.equal(parseTopWorks(top).length, 4);
  assert.throws(() => parseRelease(top), /已完成/);
});

void test('格子裡跳脫的 \| 留在同一格，反引號裡的也是', () => {
  const [first] = parseRoadmap(SAMPLE).works;
  assert.equal(first.name.text, '甲 | 乙');
  assert.equal(first.status.html, '用 <code>a|b</code> 也行');
  assert.equal(first.waiting.text, '使用者');
});

void test('反引號裡沒跳脫的 | 會切格（GFM），整列錯位前就報出行號', () => {
  const source = SAMPLE.replace('`a\\|b`', '`a|b`');
  assert.throws(() => parseRoadmap(source), (error: unknown) => error instanceof RoadmapError && error.line === 11 && error.message.includes('\|'));
});

void test('連結改成 GitHub 上的網址：相對 docs/ 的、上一層的、有空白的、roadmap 內的錨點', () => {
  const [first, second] = parseRoadmap(SAMPLE).works;
  assert.match(first.next.html, /href="https:\/\/github\.com\/kuohappiness\/Essence\/blob\/main\/tasks\/x\.md"/);
  assert.match(first.next.html, /href="https:\/\/github\.com\/kuohappiness\/Essence\/blob\/main\/Claude%20Codex%20Discussion\/y\.md"/);
  assert.match(first.entry.html, /href="https:\/\/github\.com\/kuohappiness\/Essence\/blob\/main\/docs\/decisions\.md#d-1-/);
  assert.match(second.next.html, /href="https:\/\/github\.com\/kuohappiness\/Essence\/blob\/main\/docs\/roadmap\.md#/);
  assert.match(second.status.html, /<code>0\.5\.0<\/code>/);
});

void test('file: 與本機路徑的連結只留文字', () => {
  const source = SAMPLE.replace('[D-1](decisions.md#d-1-標題)', '[本機](file:///C:/x.md) [根](/abs.md)');
  const entry = parseRoadmap(source).works[0].entry;
  assert.doesNotMatch(entry.html, /href/);
  assert.match(entry.html, /根$/);
});

void test('正式 vault 的版本先看「現在是」那句，沒有就看最新一次升正式版', () => {
  assert.deepEqual(parseRoadmap(SAMPLE).vault, { version: '0.5.0', date: '2026-11-14' });
  const without = SAMPLE.replace('正式使用的 vault 現在是 `0.5.0`（2026-11-14，見已完成）', '照舊');
  assert.deepEqual(parseRoadmap(without).vault, { version: '0.5.0', date: '2026-11-14' });
  assert.equal(parseRoadmap(without.replace('升正式版 `0.5.0`（tag `v0.5.0`）', '其他')).vault, null);
});

void test('已合併、還沒發布：比最新一次升版新、而且寫到 main 的列', () => {
  const { unreleased } = parseRoadmap(SAMPLE);
  assert.deepEqual(unreleased.map(d => d.date), ['2026-11-16']);
});

void test('等誰分組：去掉開頭的「等」、使用者排第一、空的歸「沒寫」', () => {
  const works = parseRoadmap(SAMPLE.replace('| 丁 | 狀態 | 下一步 | 觸發點 |', '| 丁 | 狀態 | 下一步 |  |')).works;
  assert.deepEqual(groupByWaiting(works).map(([key, list]) => [key, list.length]), [['使用者', 1], ['下一版', 1], ['觸發點', 1], ['沒寫', 1]]);
});

void test('欄的順序換了照樣讀；少了必要的欄報出行號與欄名', () => {
  const swapped = SAMPLE.replace('| 工作 | 狀態 | 下一步 | 等誰 | 入口 |', '| 工作 | 狀態 | 下一步 | 入口 | 等誰 |');
  assert.equal(parseRoadmap(swapped).works[0].waiting.text, 'D-1');
  const missing = SAMPLE.replace('| 工作 | 狀態 | 下一步 | 等誰 | 入口 |', '| 工作 | 狀態 | 下一步 | 卡在 | 入口 |');
  assert.throws(() => parseRoadmap(missing), (error: unknown) => error instanceof RoadmapError && error.line === 9 && error.message.includes('等誰'));
  assert.throws(() => parseRoadmap(SAMPLE.replace('## 已完成', '## 做完的')), /已完成/);
});

void test('已完成的摘要取到第一個冒號或逗號，太長截斷', () => {
  assert.equal(headline('接句卡合併進 main：細節'), '接句卡合併進 main');
  assert.equal([...headline('一'.repeat(50))].length, 36);
});

void test('頁面：等你排最前、有版本與待發布數；不帶出本機路徑與信箱', () => {
  const html = renderBoard(parseRoadmap(SAMPLE), '2026/11/16 10:00');
  assert.ok(html.indexOf('等你') < html.indexOf('等下一版'));
  assert.match(html, /<code>0\.5\.0<\/code>/);
  assert.equal(findPrivate(html), null);
  assert.match(findPrivate('寫到 C:\\Users\\someone\\x') ?? '', /本機路徑/);
  assert.match(findPrivate('聯絡 someone@example.com') ?? '', /電子郵件/);
  assert.equal(findPrivate('12345+bot@users.noreply.github.com'), null);
});

// D-208 第一步 §8：外掛的 roadmap（自編的，放在暫存資料夾）。
const PLUGIN_SAMPLE = `# Mindboard 路線圖

## 現在在哪裡

| 工作 | 狀態 | 下一步 | 等誰 |
|---|---|---|---|
| 畫布 | 規畫中 | 看[任務](../tasks/canvas.md)、[本頁](#現在在哪裡) | 使用者 |
`;
const MINDBOARD = 'plugins/mindboard/docs/roadmap.md';

void test('§8 外掛的 roadmap：只讀現在在哪裡，名稱前加外掛名，連結以它自己的資料夾為準', () => {
  const [work] = parsePluginWorks(PLUGIN_SAMPLE, MINDBOARD);
  assert.equal(work.name.text, 'Mindboard｜畫布');
  assert.match(work.next.html, /href="https:\/\/github\.com\/kuohappiness\/Essence\/blob\/main\/plugins\/mindboard\/tasks\/canvas\.md"/);
  assert.match(work.next.html, /href="https:\/\/github\.com\/kuohappiness\/Essence\/blob\/main\/plugins\/mindboard\/docs\/roadmap\.md#/);
  // 同樣的寫法在最上層指回最上層的位置。
  const [top] = parseRoadmap(SAMPLE.replace('../tasks/x.md', '../tasks/canvas.md')).works;
  assert.match(top.next.html, /href="https:\/\/github\.com\/kuohappiness\/Essence\/blob\/main\/tasks\/canvas\.md"/);
  // 外掛的 roadmap 少了必要的欄照樣報出行號。
  assert.throws(() => parsePluginWorks(PLUGIN_SAMPLE.replace('| 等誰 |', '|').replace('|---|---|---|---|', '|---|---|---|').replace(' | 使用者 |', ' |'), MINDBOARD),
    (error: unknown) => error instanceof RoadmapError && error.line === 5 && error.message.includes('等誰'));
});

void test('§8 命令列：白板帶上外掛的列與來源；--check 只解析、不產生網頁，寫壞的外掛 roadmap 報檔案與行號；--staged 讀暫存區；私人資訊也擋', async t => {
  const root = await mkdtemp(join(tmpdir(), 'essence-roadmap-board-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const script = fileURLToPath(new URL('../roadmap-board.ts', import.meta.url));
  const env = { ...process.env };
  for (const key of Object.keys(env)) if (key.toUpperCase().startsWith('GIT_')) delete env[key];
  const put = async (path: string, text: string) => {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), text);
  };
  const board = (...args: string[]) => execFileSync(process.execPath, [script, '--root', root, ...args], { encoding: 'utf8', stdio: 'pipe', env });
  await put(ROADMAP, SAMPLE.slice(0, SAMPLE.indexOf('## 已完成')));
  await put(MINDBOARD, PLUGIN_SAMPLE);
  await put('plugins/capture/docs/backlog.md', '# 沒有 roadmap 的外掛不讀\n');
  // 沒有 Cards 的 roadmap：正式 vault 與已完成讀不到，報出那份檔。
  assert.throws(() => board('--check'), (error: { status: number; stderr: string }) => error.status === 1 && error.stderr.includes(`${RELEASE_ROADMAP}  找不到這份檔`));
  await put(RELEASE_ROADMAP, SAMPLE.replace('| 甲 \\| 乙 |', '| 卡片 |'));
  assert.match(board('--check'), /進度白板讀得出來：docs\/roadmap\.md、plugins\/cards\/docs\/roadmap\.md、plugins\/mindboard\/docs\/roadmap\.md/);
  await assert.rejects(access(join(root, '_site')), { code: 'ENOENT' });
  board('--out', 'out/board.html');
  const html = await readFile(join(root, 'out/board.html'), 'utf8');
  assert.match(html, /<span class="wname">Mindboard｜畫布<\/span>/);
  assert.match(html, /<span class="wname">Cards｜卡片<\/span>/);
  assert.match(html, /<code>0\.5\.0<\/code>/);
  assert.match(html, /來源：<a href="https:\/\/github\.com\/kuohappiness\/Essence\/blob\/main\/docs\/roadmap\.md"[^>]*>docs\/roadmap\.md<\/a>、<a href="[^"]*plugins\/cards\/docs\/roadmap\.md"[^>]*>[^<]*<\/a>、<a href="[^"]*plugins\/mindboard\/docs\/roadmap\.md"/);
  // 寫壞的外掛 roadmap：--check 報檔案與行號。
  const broken = PLUGIN_SAMPLE.replace('| 工作 | 狀態 | 下一步 | 等誰 |', '| 工作 | 狀態 | 下一步 | 卡在 |');
  await put(MINDBOARD, broken);
  assert.throws(() => board('--check'), (error: { status: number; stderr: string }) =>
    error.status === 1 && error.stderr.includes(`${MINDBOARD}:5  「現在在哪裡」的表格少了「等誰」這一欄`));
  // --staged：工作樹修好了、暫存區還是壞的照樣擋。
  const git = (...args: string[]) => execFileSync('git', args, { cwd: root, env, stdio: 'pipe' });
  git('init', '-q');
  git('add', '--', ROADMAP, RELEASE_ROADMAP, MINDBOARD);
  await put(MINDBOARD, PLUGIN_SAMPLE);
  assert.match(board('--check'), /讀得出來/);
  assert.throws(() => board('--check', '--staged'), (error: { status: number; stderr: string }) => error.status === 1 && error.stderr.includes(`${MINDBOARD}:5`));
  // --check 也查白板會不會帶出私人資訊（Pages 產生時同樣會擋）。信箱是自編的，拆開寫本檔才不會被掃到。
  await put(MINDBOARD, PLUGIN_SAMPLE.replace('| 使用者 |', '| 使用者 ' + 'someone' + '@' + 'example.com |'));
  assert.throws(() => board('--check'), (error: { status: number; stderr: string }) => error.status === 1 && error.stderr.includes('白板會帶出電子郵件'));
});
