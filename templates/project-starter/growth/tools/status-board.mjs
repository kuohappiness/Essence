// 狀態板：從入口的狀態行整份產生 docs/roadmap.md 的三節（做法見模板來源的 growth/tasks.md）。
// 用法：node tools/status-board.mjs           重寫 docs/roadmap.md 的〈現在在哪裡〉〈等觸發點〉〈已完成〉
//       node tools/status-board.mjs --check   只比對、不寫檔：對不上或狀態行格式不對時 exit 1（給 pre-commit 與 CI）
// 入口是 docs/tasks/、docs/plans/ 第一層的 .md（README.md 除外）。每份的第一個非空行是一級標題（工作的名稱），
// 下一個非空行是狀態行，兩種寫法：
//   狀態：<狀態值>｜下一步：<一句>｜等誰：<值>
//   狀態：已合併｜完成：<一句>｜等誰：—        （結束：已合併、已結案、已結案 → <下一站>）
// 狀態值：規劃中、討論中、實作中、待審、等觸發點、已合併、已結案、已結案 → <下一站>、暫停（<原因>）。
// 進行中的進〈現在在哪裡〉；等觸發點的進〈等觸發點〉（觸發點取「下一步」）；結束的進〈已完成〉。〈已完成〉的日期是那一列
// 第一次產生的那天（本機日期），之後重跑沿用 roadmap 裡已有的日期，所以 commit、squash、淺層 clone 都不會讓它變；不讀 git 歷史。
// 狀態行裡的相對連結，改寫成從 docs/roadmap.md 出發的路徑。三節整個重寫，roadmap 其他的節不動；不認舊格式；
// 合併時這三節衝突，解完重跑一次。
// 只用 Node 內建的模組，Node 20 以上直接跑。
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, posix, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const ROADMAP = 'docs/roadmap.md';
export const SOURCES = ['docs/tasks', 'docs/plans'];
const ONGOING = ['規劃中', '討論中', '實作中', '待審', '等觸發點'];

/**
 * 讀一份入口：{ title, status, next?, done?, who } 或 { error }。
 * who 可以用「、」接好幾個（使用者、AI 或專案自己的角色名），「—」只能單獨用。
 */
export function parseEntry(text) {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter((line) => line.trim());
  const title = /^# +(.+?)\s*#*\s*$/.exec(lines[0] ?? '')?.[1];
  if (!title) return { error: '第一個非空行要是一級標題（# 工作的名稱）' };
  const line = lines[1] ?? '';
  if (!line.startsWith('狀態：')) return { error: '標題下第一個非空行要是狀態行（狀態：…｜下一步：…｜等誰：…）' };
  const cells = line.split('｜');
  if (cells.length !== 3) return { error: `狀態行要剛好三欄、用全形「｜」分開，現在是 ${cells.length} 欄` };
  const status = cells[0].slice('狀態：'.length).trim();
  const [label, value] = [cells[1].split('：')[0], cells[1].slice(cells[1].indexOf('：') + 1).trim()];
  if (!cells[2].startsWith('等誰：')) return { error: '第三欄要以「等誰：」開頭' };
  const who = cells[2].slice('等誰：'.length).trim();
  const ended = status === '已合併' || status === '已結案' || /^已結案 → \S/.test(status);
  if (!ended && !ONGOING.includes(status) && !/^暫停（.+）$/.test(status)) {
    return { error: `狀態值「${status}」不認得：用 ${[...ONGOING, '已合併', '已結案', '已結案 → <下一站>', '暫停（<原因>）'].join('、')}` };
  }
  if (!cells[1].includes('：') || label !== (ended ? '完成' : '下一步')) return { error: ended ? '結束的第二欄寫「完成：<一句>」' : '第二欄寫「下一步：<一句>」' };
  if (!value) return { error: `「${label}」不能空` };
  const people = who.split('、').map((name) => name.trim());
  if (!who || people.some((name) => !name)) return { error: '「等誰」不能空' };
  if (people.includes('—') && people.length > 1) return { error: '「—」只能單獨用' };
  if ((ended || status === '等觸發點') && who !== '—') return { error: '結束與等觸發點的「等誰」寫「—」' };
  return ended ? { title, status, done: value, who } : { title, status, next: value, who };
}

const cell = (text) => text.replaceAll('|', '\\|');

/** 把從 docs/<fromDir>/ 出發的相對連結，改成從 docs/ 出發；網址、錨點、絕對路徑不動。 */
export function rebaseLinks(text, fromDir) {
  return text.replace(/\]\((<[^>]*>|[^()\s]+)(\s+"[^"]*")?\)/g, (whole, target, title = '') => {
    const angled = target.startsWith('<');
    const raw = angled ? target.slice(1, -1) : target;
    if (!raw || /^[a-z][a-z0-9+.-]*:/i.test(raw) || raw.startsWith('#') || raw.startsWith('/')) return whole;
    const hash = raw.indexOf('#');
    const [path, anchor] = hash === -1 ? [raw, ''] : [raw.slice(0, hash), raw.slice(hash)];
    const moved = posix.normalize(posix.join(fromDir, path)) + anchor;
    return `](${angled ? `<${moved}>` : moved}${title})`;
  });
}

const DONE_ROW = /^\| (\d{4}-\d{2}-\d{2}) \| .*\[入口\]\(([^()\s]+)\)） \|$/;

/** roadmap〈已完成〉裡已有的列：入口路徑 → 日期。 */
export function existingDates(roadmap) {
  const dates = new Map();
  let inside = false;
  for (const line of roadmap.split('\n')) {
    if (/^#{1,2} /.test(line)) inside = /^## +已完成\s*$/.test(line);
    const match = inside ? DONE_ROW.exec(line) : null;
    if (match) dates.set(match[2], match[1]);
  }
  return dates;
}

function localToday() {
  const now = new Date();
  return [now.getFullYear(), now.getMonth() + 1, now.getDate()].map((n) => String(n).padStart(2, '0')).join('-');
}

/** 三節的內容（不含標題）。entries：{ path（以 docs/ 為基準）、date（YYYY-MM-DD）、entry }，依路徑排序。 */
export function render(entries) {
  const sorted = [...entries].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  const link = (path) => `[入口](${path})`;
  const now = sorted.filter(({ entry }) => !entry.done && entry.status !== '等觸發點');
  const waiting = sorted.filter(({ entry }) => entry.status === '等觸發點');
  const done = sorted.filter(({ entry }) => entry.done).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  return {
    現在在哪裡: ['| 工作 | 狀態 | 下一步 | 等誰 | 入口 |', '|---|---|---|---|---|',
      ...now.map(({ path, entry }) => `| ${cell(entry.title)} | ${cell(entry.status)} | ${cell(entry.next)} | ${cell(entry.who)} | ${link(path)} |`)],
    等觸發點: ['| 工作 | 觸發點 | 入口 |', '|---|---|---|',
      ...waiting.map(({ path, entry }) => `| ${cell(entry.title)} | ${cell(entry.next)} | ${link(path)} |`)],
    已完成: ['最新的在最上面，由 `node tools/status-board.mjs` 產生。', '', '| 日期 | 工作 |', '|---|---|',
      ...done.map(({ path, date, entry }) => `| ${date} | **${cell(entry.title)}**：${cell(entry.done)}（${cell(entry.status)}，${link(path)}） |`)],
  };
}

/** 把 roadmap 裡這三節（二級標題）的內容換掉；少了哪一節就報錯。 */
export function replaceSections(roadmap, sections) {
  const lines = roadmap.split('\n');
  const out = [];
  const missing = new Set(Object.keys(sections));
  for (let i = 0; i < lines.length; i++) {
    const name = /^## +(.+?)\s*$/.exec(lines[i])?.[1];
    if (name === undefined || !Object.hasOwn(sections, name)) {
      out.push(lines[i]);
      continue;
    }
    missing.delete(name);
    out.push(lines[i], '', ...sections[name], '');
    while (i + 1 < lines.length && !/^#{1,2} /.test(lines[i + 1])) i++;
  }
  if (missing.size) throw new Error(`${ROADMAP} 少了 ${[...missing].map((name) => `〈${name}〉`).join('、')}：加上這幾個二級標題`);
  return out.join('\n').replace(/\n{3,}/g, '\n\n').replace(/\n*$/, '\n');
}

/** root：repo 根目錄；today：〈已完成〉新的一列用的日期（測試可以指定）。 */
export function main(args, root = process.cwd(), today = localToday()) {
  const check = args.includes('--check');
  const before = readFileSync(join(root, ROADMAP), 'utf8');
  const dates = existingDates(before);
  const entries = [];
  const problems = [];
  for (const dir of SOURCES) {
    if (!existsSync(join(root, dir))) continue;
    for (const name of readdirSync(join(root, dir)).sort()) {
      if (!name.endsWith('.md') || name === 'README.md') continue;
      const file = `${dir}/${name}`;
      const entry = parseEntry(readFileSync(join(root, file), 'utf8'));
      if (entry.error) {
        problems.push(`${file}：${entry.error}`);
        continue;
      }
      const path = file.slice('docs/'.length);
      const fromDir = posix.dirname(path);
      for (const key of ['title', 'status', 'next', 'done']) if (entry[key]) entry[key] = rebaseLinks(entry[key], fromDir);
      entries.push({ path, date: dates.get(path) ?? today, entry });
    }
  }
  if (problems.length) {
    console.error(`狀態行有 ${problems.length} 個問題：\n${problems.join('\n')}`);
    return 1;
  }
  let after;
  try {
    after = replaceSections(before, render(entries));
  } catch (error) {
    console.error(error.message);
    return 1;
  }
  if (check) {
    if (after === before) return 0;
    console.error(`${ROADMAP} 的狀態板和入口的狀態行對不上：跑 node tools/status-board.mjs，再 git add ${ROADMAP}`);
    return 1;
  }
  if (after !== before) writeFileSync(join(root, ROADMAP), after);
  console.log(after === before ? `${ROADMAP} 已經是最新的` : `已更新 ${ROADMAP}（記得 git add）`);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const root = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
  process.exitCode = main(process.argv.slice(2), root);
}
