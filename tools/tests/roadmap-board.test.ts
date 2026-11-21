import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { RELEASE_ROADMAP, ROADMAP, RoadmapError, findPrivate, groupByWaiting, headline, mergeDone, parseDone, parsePluginWorks, parseRelease, parseRoadmap, parseTopWorks, recentDecisions, renderBoard } from '../roadmap-board.ts';

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

void test('最上層的入口讀得出來；Cards 的 roadmap 讀得出已完成與正式 vault 的版本', () => {
  const read = (file: string) => readFileSync(new URL('../../' + file, import.meta.url), 'utf8');
  // 最上層可以暫時沒有跨外掛的工作：空的狀態板合法，讀得出來就好（L2 R1）。
  assert.doesNotThrow(() => parseTopWorks(read(ROADMAP)));
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

// D-217：〈已完成〉的列由 roadmap-sync 產生，格式是「**工作**：完成（狀態，[入口](…)）」。
const generated = (date: string, work: string, state: string) => `| ${date} | **${work}**：做完了（${state}，[入口](tasks/${work}.md)） |`;

void test('工具產生的「已合併」列算待發布（沒寫 main 也算），「已結案」不算', () => {
  const source = SAMPLE.replace('| 2026-11-16 | 接句卡合併進 `main`：細節 |',
    [generated('2026-11-22', '白板', '已合併'), generated('2026-11-21', '討論', '已結案'), '| 2026-11-16 | 接句卡合併進 `main`：細節 |'].join('\n'));
  assert.deepEqual(parseRoadmap(source).unreleased.map(d => d.work.text), ['白板：做完了（已合併，入口）', '接句卡合併進 main：細節']);
});

void test('正式 vault：認得「正式 vault 升到」，和「現在是」那句取日期較新的，同一天以那句為準', () => {
  const release = '| 2026-11-20 | **發版**：正式 vault 升到 `0.6.0`，tag `v0.6.0`（已結案，[入口](tasks/r.md)） |';
  const withRelease = (stated: string) => SAMPLE.replace('正式使用的 vault 現在是 `0.5.0`（2026-11-14，見已完成）', stated)
    .replace('| 2026-11-16 | 接句卡合併進 `main`：細節 |', `${generated('2026-11-21', '白板', '已合併')}\n${release}\n| 2026-11-16 | 接句卡合併進 \`main\`：細節 |`);
  // 升版的列比那句新：用列的版本；比升版新的才是待發布（11-16 那列已經在 0.6.0 裡）。
  const newer = parseRoadmap(withRelease('正式使用的 vault 現在是 `0.5.0`（2026-11-14）'));
  assert.deepEqual(newer.vault, { version: '0.6.0', date: '2026-11-20' });
  assert.deepEqual(newer.unreleased.map(d => d.date), ['2026-11-21']);
  // 那句比較新（手動升版後還沒有任務列）：用那句。
  assert.deepEqual(parseRoadmap(withRelease('正式使用的 vault 現在是 `0.6.1`（2026-11-21）')).vault, { version: '0.6.1', date: '2026-11-21' });
  // 同一天：以那句為準。
  assert.deepEqual(parseRoadmap(withRelease('正式使用的 vault 現在是 `0.5.9`（2026-11-20）')).vault, { version: '0.5.9', date: '2026-11-20' });
});

void test('L2 R8 待發布以選中的那一次升版切；「正式 vault 升到」只在完成那一句開頭才算升版', () => {
  const rows = (...lines: string[]) => SAMPLE.replace('| 2026-11-16 | 接句卡合併進 `main`：細節 |', [...lines, '| 2026-11-16 | 接句卡合併進 `main`：細節 |'].join('\n'));
  // 那句（0.7.0，12-05）比升版的列（0.6.0，12-03）新：12-04 合併的已經在 0.7.0 裡，不是待發布；12-06 的才是。
  const stated = rows(generated('2026-12-06', '新', '已合併'), generated('2026-12-04', '舊', '已合併'),
    '| 2026-12-03 | **發版**：正式 vault 升到 `0.6.0`（已結案，[入口](tasks/r.md)） |')
    .replace('正式使用的 vault 現在是 `0.5.0`（2026-11-14，見已完成）', '正式使用的 vault 現在是 `0.7.0`（2026-12-05）');
  const parsed = parseRoadmap(stated);
  assert.deepEqual(parsed.vault, { version: '0.7.0', date: '2026-12-05' });
  assert.deepEqual(parsed.unreleased.map(d => d.date), ['2026-12-06']);
  // 同一天：同一版照列的位置切（升版之後才合併的是待發布）；不同版以那句為準，照那句的日期切。
  const sameDay = (version: string) => parseRoadmap(rows(generated('2026-12-05', '後', '已合併'), '| 2026-12-05 | **發版**：正式 vault 升到 `0.7.0`（已結案，[入口](tasks/r.md)） |')
    .replace('正式使用的 vault 現在是 `0.5.0`（2026-11-14，見已完成）', `正式使用的 vault 現在是 \`${version}\`（2026-12-05）`));
  assert.deepEqual(sameDay('0.7.0').vault, { version: '0.7.0', date: '2026-12-05' });
  assert.deepEqual(sameDay('0.7.0').unreleased.map(d => d.work.text), ['後：做完了（已合併，入口）']);
  assert.deepEqual(sameDay('0.7.1').vault, { version: '0.7.1', date: '2026-12-05' });
  assert.deepEqual(sameDay('0.7.1').unreleased, []);
  // 只是提到計畫中的版本，不是升版：版本照舊、12-04 那列照樣待發布。
  const mention = rows(generated('2026-12-04', '相容', '已合併').replace('做完了', '完成相容測試，等正式 vault 升到 `0.7.0` 再公開'));
  assert.deepEqual(parseRoadmap(mention).vault, { version: '0.5.0', date: '2026-11-14' });
  assert.deepEqual(parseRoadmap(mention).unreleased.map(d => d.date), ['2026-12-04', '2026-11-16']);
  const handwritten = rows('| 2026-12-04 | 完成相容測試，等正式 vault 升到 `0.7.0` 再公開，合併進 `main` |');
  assert.deepEqual(parseRoadmap(handwritten).vault, { version: '0.5.0', date: '2026-11-14' });
});

void test('L2 N7 工具寫的列照「**工作**：」的結構找完成那一句：工作名稱有「：」也認得升版；舊寫法「升正式版」只看手寫的列', () => {
  const rows = (...lines: string[]) => SAMPLE.replace('| 2026-11-16 | 接句卡合併進 `main`：細節 |', [...lines, '| 2026-11-16 | 接句卡合併進 `main`：細節 |'].join('\n'));
  const named = parseRoadmap(rows(generated('2026-12-06', '後', '已合併'), '| 2026-12-05 | **發版：0.7.0**：正式 vault 升到 `0.7.0`（已結案，[入口](tasks/r.md)） |'));
  assert.deepEqual(named.vault, { version: '0.7.0', date: '2026-12-05' });
  assert.deepEqual(named.unreleased.map(d => d.date), ['2026-12-06']);
  // 工具寫的列提到「升正式版」只是計畫：版本照舊、那一列照樣待發布。
  const planned = parseRoadmap(rows(generated('2026-12-04', '相容', '已合併').replace('做完了', '完成相容測試，等升正式版 `0.7.0` 時再公開')));
  assert.deepEqual(planned.vault, { version: '0.5.0', date: '2026-11-14' });
  assert.deepEqual(planned.unreleased.map(d => d.date), ['2026-12-04', '2026-11-16']);
});

void test('L2 M3 工具寫的發版列，版本號帶連結或粗體也認得', () => {
  const rows = (line: string) => SAMPLE.replace('| 2026-11-16 | 接句卡合併進 `main`：細節 |', [line, '| 2026-11-16 | 接句卡合併進 `main`：細節 |'].join('\n'));
  for (const version of ['[`0.7.0`](https://example.invalid/releases/0.7.0)', '**0.7.0**', '[v0.7.0](../tags.md)']) {
    const parsed = parseRoadmap(rows(`| 2026-12-05 | **發版**：正式 vault 升到 ${version}（已結案，[入口](tasks/r.md)） |`));
    assert.deepEqual(parsed.vault, { version: '0.7.0', date: '2026-12-05' }, version);
    assert.deepEqual(parsed.unreleased.map(d => d.date), [], version);
  }
});

void test('最近完成合併每份 roadmap 的〈已完成〉：照日期新到舊，同一天照 roadmap 的順序與原本的順序；沒有表的那份是空的', () => {
  const table = (rows: string[]) => `# R\n\n## 現在在哪裡\n\n## 等觸發點\n\n## 已完成\n\n| 日期 | 工作 |\n|---|---|\n${rows.join('\n')}\n`;
  const top = parseDone(table(['| 2026-11-22 | 頂甲 |', '| 2026-11-20 | 頂乙 |']), ROADMAP);
  const cards = parseDone(table(['| 2026-11-22 | 卡甲 |', '| 2026-11-21 | 卡乙 |', '| 2026-11-20 | 卡丙 |']), RELEASE_ROADMAP);
  const empty = parseDone('# R\n\n## 現在在哪裡\n\n## 等觸發點\n\n## 已完成\n\n還沒有。\n', 'apps/Mindboard/docs/roadmap.md');
  assert.deepEqual(empty, []);
  assert.deepEqual(mergeDone([top, cards, empty]).map(d => d.work.text), ['頂甲', '卡甲', '卡乙', '頂乙', '卡丙']);
  const html = renderBoard({ ...parseRoadmap(SAMPLE), done: mergeDone([top, cards]) }, '2026/11/22 10:00');
  assert.ok(html.indexOf('頂甲') < html.indexOf('卡丙'));
});

// 分界是 D-218：D-218 起的是新寫法（有「來自」，算得出現在在哪）。
const DECISIONS = ['# 決策紀錄', '', '## 索引', '', '| 決定 | 一句話 | 日期 | 狀態 |', '|---|---|---|---|',
  ...['210', '212', '215', '216'].map(n => `| [D-${n} 舊${n}](#d-${n}-舊${n}) | 舊${n}的一句話。 | 2026-11-01 | ✅ |`), '', '---', '',
  '## D-210 舊210', '', '✅ 2026-11-10', '',
  '## D-211 舊211', '', '🔁 2026-11-12（待重新確認）', '',
  '## D-212 舊212', '', '✅ 2026-11-15', '',
  '## D-213 舊213', '', '✅ 2026-11-16', '',
  '## D-214 舊214', '', '💡 2026-11-19（提案）', '',
  '## D-215 舊215', '', '✅ 2026-11-20', '',
  '## D-216 舊216', '', '✅ 2026-11-20', '',
  '## D-217 舊217', '', '已取代 → [D-219](#d-219-新乙)｜2026-11-21', '',
  '## D-218 新甲', '', '✅ 2026-11-21｜來自 [plans](plans/w.md)', '', '主題：協作與文件｜一句話：新甲的 `x` 一句話。', '',
  '## D-219 新乙', '', '✅ 2026-11-20｜來自 [plans](plans/w.md)｜取代 [D-213](#d-213-舊213)', '', '主題：協作與文件｜一句話：新乙的一句話。', '',
  '## D-220 新丙', '', '💬 2026-11-22｜來自 [plans](plans/w.md)', '', '主題：協作與文件｜一句話：還在談。', ''].join('\n');

void test('L2 R6 決定退回 backlog 的項目：「現在在哪」連到那一項的錨點，父子兩項是兩個連結', () => {
  const texts = new Map([
    ['docs/decisions.md', DECISIONS],
    ['docs/backlog.md', ['# B', '', '## 待處理', '', '### 詞（甲）、A+B', '', '來自：[D-218](decisions.md#d-218-新甲)', '',
      '#### 子項', '', '來自：[D-218](decisions.md#d-218-新甲)', '', '## 已轉出', ''].join('\n')],
  ]);
  const [d218] = recentDecisions(DECISIONS, texts);
  assert.deepEqual(d218.now.map(x => [x.label, x.url.replace(/^.*\/blob\/main\//, '')]), [
    ['docs/backlog.md〈詞（甲）、A+B〉', `docs/backlog.md#${encodeURIComponent('詞甲ab')}`],
    ['docs/backlog.md〈子項〉', `docs/backlog.md#${encodeURIComponent('子項')}`],
  ]);
});

void test('最近定案：只取 ✅、沒被取代的最新 5 條，照日期再照編號新到舊；新寫法的加「現在在哪」與狀態值', () => {
  const texts = new Map([
    ['docs/decisions.md', DECISIONS],
    ['docs/tasks/t.md', '# T\n\n狀態：實作中｜下一步：寫測試｜等誰：Claude\n\n來自：[D-218](../decisions.md#d-218-新甲)\n'],
    ['docs/tasks/u.md', '# U\n\n狀態：已合併｜完成：先做的一半｜等誰：—\n\n來自：[D-218](../decisions.md#d-218-新甲)\n'],
  ]);
  const decided = recentDecisions(DECISIONS, texts);
  // D-211 待重新確認、D-214 提案、D-220 討論中、D-213 被 D-219 取代、D-217 舊寫法的已取代：都不列。D-210 是第 6 條。
  assert.deepEqual(decided.map(d => d.id), ['D-218', 'D-219', 'D-216', 'D-215', 'D-212']);
  assert.deepEqual(decided.map(d => d.date), ['2026-11-21', '2026-11-20', '2026-11-20', '2026-11-20', '2026-11-15']);
  assert.equal(decided[0].summary.text, '新甲的 x 一句話。');
  assert.equal(decided[0].summary.html, '新甲的 <code>x</code> 一句話。');
  assert.equal(decided[2].summary.text, '舊216的一句話。');
  assert.match(decided[0].url, /docs\/decisions\.md#d-218-/);
  assert.deepEqual(decided[0].now.map(x => [x.label, x.status]), [['docs/tasks/t.md', '實作中'], ['docs/tasks/u.md', '已合併']]);
  assert.match(decided[0].now[0].url, /blob\/main\/docs\/tasks\/t\.md$/);
  // 新寫法但還沒有下游、舊寫法：沒有「現在在哪」。
  assert.deepEqual(decided[1].now, []);
  assert.deepEqual(decided[2].now, []);
  // 頁面：最近完成與最近定案分兩塊。
  const html = renderBoard({ ...parseRoadmap(SAMPLE), decided }, '2026/11/22 10:00');
  assert.match(html, /<section class="list" id="decided"><h2>最近定案<\/h2>/);
  assert.ok(html.indexOf('最近完成') < html.indexOf('最近定案'));
  assert.match(html, /現在在：<a href="[^"]*docs\/tasks\/t\.md"[^>]*>docs\/tasks\/t\.md<\/a>（實作中）/);
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
const MINDBOARD = 'apps/Mindboard/docs/roadmap.md';

void test('§8 外掛的 roadmap：只讀現在在哪裡，名稱前加外掛名，連結以它自己的資料夾為準', () => {
  const [work] = parsePluginWorks(PLUGIN_SAMPLE, MINDBOARD);
  assert.equal(work.name.text, 'Mindboard｜畫布');
  assert.match(work.next.html, /href="https:\/\/github\.com\/kuohappiness\/Essence\/blob\/main\/apps\/Mindboard\/tasks\/canvas\.md"/);
  assert.match(work.next.html, /href="https:\/\/github\.com\/kuohappiness\/Essence\/blob\/main\/apps\/Mindboard\/docs\/roadmap\.md#/);
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
  await put('apps/Capture/docs/backlog.md', '# 沒有 roadmap 的外掛不讀\n');
  // 沒有 Cards 的 roadmap：正式 vault 與已完成讀不到，報出那份檔。
  assert.throws(() => board('--check'), (error: { status: number; stderr: string }) => error.status === 1 && error.stderr.includes(`${RELEASE_ROADMAP}  找不到這份檔`));
  await put(RELEASE_ROADMAP, SAMPLE.replace('| 甲 \\| 乙 |', '| 卡片 |'));
  assert.match(board('--check'), /進度白板讀得出來：docs\/roadmap\.md、apps\/Cards\/docs\/roadmap\.md、apps\/Mindboard\/docs\/roadmap\.md/);
  await assert.rejects(access(join(root, '_site')), { code: 'ENOENT' });
  board('--out', 'out/board.html');
  const html = await readFile(join(root, 'out/board.html'), 'utf8');
  assert.match(html, /<span class="wname">Mindboard｜畫布<\/span>/);
  assert.match(html, /<span class="wname">Cards｜卡片<\/span>/);
  assert.match(html, /<code>0\.5\.0<\/code>/);
  assert.match(html, /來源：<a href="https:\/\/github\.com\/kuohappiness\/Essence\/blob\/main\/docs\/roadmap\.md"[^>]*>docs\/roadmap\.md<\/a>、<a href="[^"]*apps\/Cards\/docs\/roadmap\.md"[^>]*>[^<]*<\/a>、<a href="[^"]*apps\/Mindboard\/docs\/roadmap\.md"/);
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
