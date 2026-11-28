// 決定的索引：讀 docs/decisions/D-*.md，重寫 docs/decisions/README.md 的索引表（做法見模板來源的 growth/long-docs.md）。
// 用法：node tools/decisions-index.mjs           重寫索引表
//       node tools/decisions-index.mjs --check   只比對、不寫檔：對不上或決定的格式不對時 exit 1（給 pre-commit 與 CI）
// 每條決定：第一個非空行是 `# D-xxx 名稱`；下一個非空行是狀態行（`✅ YYYY-MM-DD｜來自 …｜修改 [D-yyy](D-yyy.md)（第 n 點）｜取代 [D-zzz](D-zzz.md)`）；
// 內文有一行 `一句話：…`。狀態欄由工具算：被別條「取代」寫「已取代，見 D-zzz」，被「修改」寫「已修改，見 D-yyy」，都沒有寫狀態行開頭的符號。
// 索引表前後用 BEGIN、END 兩行記號框住，記號之間整段重寫，README 其餘的內容不動。
// 只用 Node 內建的模組，Node 20 以上直接跑。
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const DIR = 'docs/decisions';
export const INDEX = `${DIR}/README.md`;
export const BEGIN = '<!-- 索引開始：由 tools/decisions-index.mjs 產生，不要手改 -->';
export const END = '<!-- 索引結束 -->';

/** 讀一條決定：{ id, name, mark, date, summary, amends, replaces } 或 { error }。 */
export function parseDecision(file, text) {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter((line) => line.trim());
  const heading = /^# +(D-\d+) +(.+?)\s*$/.exec(lines[0] ?? '');
  const expected = /^(D-\d+)\.md$/.exec(file)?.[1];
  if (!heading) return { error: '第一個非空行要是「# D-xxx 名稱」' };
  if (heading[1] !== expected) return { error: `標題的編號 ${heading[1]} 和檔名對不上` };
  const status = lines[1] ?? '';
  const date = /^(\S+)\s+(\d{4}-\d{2}-\d{2})(?:｜|$)/.exec(status);
  if (!date) return { error: '標題下第一個非空行要是狀態行，開頭是符號與日期（例如「✅ 2026-01-31｜來自 …」）' };
  const summary = lines.find((line) => line.startsWith('一句話：'))?.slice('一句話：'.length).trim();
  if (!summary) return { error: '少了「一句話：…」那一行' };
  const refs = (label) => status.split('｜').filter((part) => part.startsWith(label)).flatMap((part) => [...part.matchAll(/\bD-\d+\b/g)].map((m) => m[0]));
  return { id: heading[1], name: heading[2], mark: date[1], date: date[2], summary, amends: refs('修改'), replaces: refs('取代') };
}

/** 索引表的列，依編號排序。 */
export function renderIndex(decisions) {
  const sorted = [...decisions].sort((a, b) => Number(a.id.slice(2)) - Number(b.id.slice(2)));
  const by = (field, id) => sorted.filter((d) => d[field].includes(id)).map((d) => d.id);
  const cell = (text) => text.replaceAll('|', '\\|');
  return ['| 編號 | 一句話 | 日期 | 狀態 |', '|---|---|---|---|', ...sorted.map((d) => {
    const replaced = by('replaces', d.id);
    const amended = by('amends', d.id);
    const state = replaced.length ? `已取代，見 ${replaced.join('、')}` : amended.length ? `已修改，見 ${amended.join('、')}` : d.mark;
    return `| [${d.id}](${d.id}.md) | ${cell(d.summary)} | ${d.date} | ${state} |`;
  })];
}

/** 換掉 BEGIN、END 之間的內容；記號少了或順序不對就報錯。 */
export function replaceIndex(readme, rows) {
  const start = readme.indexOf(BEGIN);
  const end = readme.indexOf(END);
  if (start < 0 || end < start) throw new Error(`${INDEX} 找不到索引的記號：把索引表換成「${BEGIN}」與「${END}」兩行，中間留空`);
  return `${readme.slice(0, start + BEGIN.length)}\n${rows.join('\n')}\n${readme.slice(end)}`;
}

export function main(args, root = process.cwd()) {
  const check = args.includes('--check');
  const decisions = [];
  const problems = [];
  for (const file of readdirSync(join(root, DIR)).filter((name) => /^D-\d+\.md$/.test(name)).sort()) {
    const decision = parseDecision(file, readFileSync(join(root, DIR, file), 'utf8'));
    if (decision.error) problems.push(`${DIR}/${file}：${decision.error}`);
    else decisions.push(decision);
  }
  const known = new Set(decisions.map((d) => d.id));
  for (const d of decisions) {
    for (const id of [...d.amends, ...d.replaces]) if (!known.has(id)) problems.push(`${DIR}/${d.id}.md：狀態行提到的 ${id} 不存在`);
  }
  if (problems.length) {
    console.error(`決定有 ${problems.length} 個問題：\n${problems.join('\n')}`);
    return 1;
  }
  const before = readFileSync(join(root, INDEX), 'utf8');
  let after;
  try {
    after = replaceIndex(before, renderIndex(decisions));
  } catch (error) {
    console.error(error.message);
    return 1;
  }
  if (check) {
    if (after === before) return 0;
    console.error(`${INDEX} 的索引和決定的檔對不上：跑 node tools/decisions-index.mjs，再 git add ${INDEX}`);
    return 1;
  }
  if (after !== before) writeFileSync(join(root, INDEX), after);
  console.log(after === before ? `${INDEX} 已經是最新的` : `已更新 ${INDEX}（記得 git add）`);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const root = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
  process.exitCode = main(process.argv.slice(2), root);
}
