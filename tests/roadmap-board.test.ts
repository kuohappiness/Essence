import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { ROADMAP, RoadmapError, findPrivate, groupByWaiting, headline, parseRoadmap, renderBoard } from '../tools/roadmap-board.ts';

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

void test('docs/roadmap.md 讀得出進行中的工作、已完成與正式 vault 的版本', () => {
  const roadmap = parseRoadmap(readFileSync(ROADMAP, 'utf8'));
  assert.ok(roadmap.works.length >= 1);
  assert.ok(roadmap.done.length >= 1);
  assert.match(roadmap.vault?.version ?? '', /^\d+\.\d+\.\d+$/);
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
  assert.match(first.next.html, /href="https:\/\/github\.com\/kuohappiness\/Essence-Cards\/blob\/main\/tasks\/x\.md"/);
  assert.match(first.next.html, /href="https:\/\/github\.com\/kuohappiness\/Essence-Cards\/blob\/main\/Claude%20Codex%20Discussion\/y\.md"/);
  assert.match(first.entry.html, /href="https:\/\/github\.com\/kuohappiness\/Essence-Cards\/blob\/main\/docs\/decisions\.md#d-1-/);
  assert.match(second.next.html, /href="https:\/\/github\.com\/kuohappiness\/Essence-Cards\/blob\/main\/docs\/roadmap\.md#/);
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
