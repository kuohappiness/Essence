#!/usr/bin/env node
// 搬檔之後改 Markdown 連結（D-208 第二步 §A6 與 B）：在 git mv（與拆檔）之後、commit 之前，在 repo 根目錄執行。
//
//   node experiments/tools/move-links.mjs [--check] [--plan <計畫.json>] [<舊路徑>=<新路徑> ...]
//
// 路徑是 repo 根目錄算的；資料夾的對照也套到底下每個檔（src=plugins/cards/src）。
// 計畫檔（B 用）：{ "moves": [["舊", "新"], …], "pieces": { "拆出的新檔": "原檔" }, "split": { "原檔": { "default": "沒有錨點時去的檔", "anchors": { "錨點": "那一段現在在的檔" } } } }
// - 連結目標用和 tools/check-docs.ts 同一個 Markdown 解析器（markdown-it，html: true）取：行內、引用式、角括號、自動連結都算，
//   程式碼框、HTML 區塊與行內程式碼裡的不算。原文裡找到的每個候選位置，都要對得上解析器在同一段（同幾行）取到的連結，
//   引用式定義要對得上解析器登記的定義；重疊的位置只改一次（R4：角括號網址被兩個寫法同時選到改壞過）。
//   目的地可以在下一行（`](` 或 `]:` 之後換行），照改。
// - 連結的意思以搬家前為準：從這個檔搬家前的位置（拆出的新檔是原檔的位置）解開，目標照對照換成新路徑；
//   目標是拆開的原檔時，照錨點換到那一段現在在的檔。從現在的位置解得開、而且是同一個目標的不動，所以第二次執行不改任何字。
//   兩種解法都存在卻是不同的檔，不猜、不改，列成「要人看」（結束碼 1）。
// - 錨點、查詢字串與結尾的斜線照留；拆開的原檔裡連到本頁、但那一段已搬走的錨點，換成新檔的錨點。
// - 指到這個 repo（kuohappiness/Essence，舊名 Essence-Cards）`blob/main/`、`tree/main/` 的網址，路徑照對照換；別人的 repo 不動。
// - 「存在」照 git 的索引（git ls-files）：搬家的 git mv 與拆出的新檔要先 git add。
// --check：只列出會改的連結，不寫檔；有要改的結束碼是 1。
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
import { posix } from 'node:path';
import { pathToFileURL } from 'node:url';

const require = createRequire(new URL('../../tools/package.json', import.meta.url));
const { default: MarkdownIt } = await import(pathToFileURL(require.resolve('markdown-it')).href);
const { default: GithubSlugger } = await import(pathToFileURL(require.resolve('github-slugger')).href);
const markdown = new MarkdownIt({ html: true });

/** 舊路徑 → 新路徑；不在對照裡的回傳原值。資料夾的對照套到底下的檔。 */
export function mapper(moves) {
  const forward = path => {
    for (const [from, to] of moves) if (path === from || path.startsWith(from + '/')) return to + path.slice(from.length);
    return path;
  };
  const backward = path => {
    for (const [from, to] of moves) if (path === to || path.startsWith(to + '/')) return from + path.slice(to.length);
    return path;
  };
  return { forward, backward };
}

const FRONT = /^---\n[\s\S]*?\n---(?:\n|$)/;

/** 標題的純文字（和 tools/check-docs.ts 的 plainText 相同）：行內程式碼取內容、連結取連結文字、HTML 不算。 */
function plainText(children) {
  return children.map(child => {
    if (child.type === 'text' || child.type === 'code_inline') return child.content;
    if (child.type === 'softbreak' || child.type === 'hardbreak') return ' ';
    if (child.type === 'image') return plainText(child.children ?? []);
    return '';
  }).join('');
}

/** 一個字串裡跟著長度不變的遮罩：程式碼框、HTML 區塊、front matter 的行與行內程式碼換成空白，位置不變。 */
function masked(text, tokens) {
  const lines = text.split('\n');
  const front = FRONT.exec(text);
  const hidden = new Set();
  if (front) for (let i = 0; i < front[0].split('\n').length - 1; i++) hidden.add(i);
  for (const token of tokens) {
    if (!token.map || !['fence', 'code_block', 'html_block'].includes(token.type)) continue;
    for (let i = token.map[0]; i < token.map[1]; i++) hidden.add(i);
  }
  return lines.map((line, i) => hidden.has(i) ? line.replace(/[^\n]/g, ' ') : line.replace(/(`+)[^`]*?\1/g, span => ' '.repeat(span.length))).join('\n');
}

/**
 * 解析器取到的連結：每一段（inline token 的行範圍）裡的目的地（正規化後的 href，可重複），與引用式定義。
 * front matter 換成同樣行數的空行，行號不變。
 */
function parsed(text) {
  const blank = text.replace(FRONT, front => front.replace(/[^\n]/g, ''));
  const env = {};
  const tokens = markdown.parse(blank, env);
  const blocks = [];
  let map;
  for (const token of tokens) {
    // 表格儲存格的 inline 沒有行號，用所在那一列（tr_open）的。
    if (token.map) map = token.map;
    if (token.type !== 'inline' || !map) continue;
    // 同一列的儲存格併成一段。
    let block = blocks.at(-1);
    if (!block || block.from !== map[0] || block.to !== map[1]) blocks.push(block = { from: map[0], to: map[1], hrefs: new Map() });
    for (const child of token.children ?? []) {
      const href = child.type === 'link_open' ? child.attrGet('href') : child.type === 'image' ? child.attrGet('src') : null;
      if (href !== null) block.hrefs.set(href, (block.hrefs.get(href) ?? 0) + 1);
    }
  }
  // 本頁的錨點，和 tools/check-docs.ts 同一套（github-slugger 對標題的純文字）。
  const anchors = new Set();
  const slugger = new GithubSlugger();
  const htmlIds = html => { for (const [, id] of html.matchAll(/\b(?:id|name)\s*=\s*["']([^"']+)["']/g)) anchors.add(id); };
  tokens.forEach((token, i) => {
    if (token.type === 'heading_open') anchors.add(slugger.slug(plainText(tokens[i + 1].children ?? [])));
    else if (token.type === 'html_block') htmlIds(token.content);
    else if (token.type === 'inline') for (const child of token.children ?? []) if (child.type === 'html_inline') htmlIds(child.content);
  });
  return { tokens, blocks, references: env.references ?? {}, anchors };
}

/** 原文裡的連結目的地候選：[x](目的地)、![x](目的地)、[x]: 目的地、<網址>。回傳在原文的起訖、種類與去掉角括號的內容。 */
function candidates(mask) {
  const found = [];
  const add = (match, raw, kind, label) => {
    const start = match.index + match[0].length - raw.length;
    const angle = raw.startsWith('<') && raw.endsWith('>');
    found.push({ start, end: start + raw.length, kind, label, angle, inner: angle ? raw.slice(1, -1) : raw });
  };
  const destination = String.raw`(<[^<>\n]*>|(?:[^\s()<>\\]|\\.|\([^\s()]*\))+)`;
  for (const match of mask.matchAll(new RegExp(String.raw`\]\([ \t]*(?:\n[ \t]*)?` + destination, 'g'))) add(match, match[1], 'inline');
  for (const match of mask.matchAll(new RegExp(String.raw`^ {0,3}\[((?:[^\]\\\n]|\\.)+)\]:[ \t]*(?:\n[ \t]*)?(<[^<>\n]*>|\S+)`, 'gm'))) add(match, match[2], 'definition', match[1]);
  for (const match of mask.matchAll(/<https?:\/\/[^\s<>]+>/g)) add(match, match[0], 'autolink');
  // 同一段原文只認一個：起點早的先，同起點的取長的。
  found.sort((a, b) => a.start - b.start || b.end - a.end);
  const kept = [];
  for (const candidate of found) if (!kept.length || candidate.start >= kept.at(-1).end) kept.push(candidate);
  return kept;
}

/** 候選位置對得上解析器的才留下：行內與自動連結要在同一段裡有同一個 href（用掉一個），定義要是解析器登記的那一個。 */
function confirmed(source, list, { blocks, references }) {
  const lineOf = offset => source.slice(0, offset).split('\n').length - 1;
  const usedLabels = new Set();
  const out = [];
  for (const candidate of list) {
    const href = markdown.normalizeLink(markdown.utils.unescapeAll(candidate.inner));
    const line = lineOf(candidate.start);
    if (candidate.kind === 'definition') {
      const key = markdown.utils.normalizeReference(candidate.label);
      if (usedLabels.has(key) || references[key]?.href !== href) continue;
      if (blocks.some(block => line >= block.from && line < block.to)) continue;
      usedLabels.add(key);
      out.push(candidate);
      continue;
    }
    const block = blocks.find(item => line >= item.from && line < item.to);
    const count = block?.hrefs.get(href) ?? 0;
    if (!count) continue;
    block.hrefs.set(href, count - 1);
    out.push(candidate);
  }
  return out;
}

const REPO_URL = /^(https:\/\/github\.com\/kuohappiness\/(?:Essence-Cards|Essence)\/(?:blob|tree)\/main\/)([^?#]*)(.*)$/i;

const decode = part => { try { return decodeURIComponent(part); } catch { return undefined; } };
/** 新路徑寫回原文：原本有百分比編碼的照樣編碼，沒有的只把空白與括號編碼（不加角括號時）。 */
function encodeLike(path, raw, angle) {
  if (/%[0-9a-f]{2}/i.test(raw)) return path.split('/').map(encodeURIComponent).join('/');
  return angle ? path : path.replace(/[ ()]/g, char => encodeURIComponent(char));
}

/** 目標是拆開的原檔時，照錨點換到那一段現在在的檔；沒有錨點去 default；表上沒有的照原檔。 */
function splitter(split = {}) {
  return (target, rest) => {
    const entry = split[target];
    if (!entry) return target;
    const hash = rest.indexOf('#');
    if (hash < 0) return entry.default ?? target;
    const anchor = decode(rest.slice(hash + 1)) ?? rest.slice(hash + 1);
    return entry.anchors?.[anchor] ?? entry.anchors?.[anchor.toLowerCase()] ?? target;
  };
}

/**
 * 一份 Markdown 的新內容、改了哪些連結與要人看的連結。file 是它現在（搬家後）的 repo 路徑；exists 判斷 repo 路徑（檔或資料夾）存在。
 * plan：mapper() 的 forward、backward，加上可選的 pieces（拆出的新檔 → 原檔）與 split（原檔 → 錨點去哪個檔）。
 */
export function rewrite(file, text, plan, exists) {
  const { forward, pieces = {} } = plan;
  const backward = plan.backward ?? (path => path);
  const retarget = splitter(plan.split);
  const bom = text.startsWith('﻿') ? '﻿' : '';
  const crlf = text.includes('\r\n');
  const source = text.slice(bom.length).replace(/\r\n/g, '\n');
  const info = parsed(source);
  const mask = masked(source, info.tokens);
  const origin = pieces[file] ?? backward(file);
  const edits = [];
  const conflicts = [];
  const lineOf = start => source.slice(0, start).split('\n').length;
  for (const candidate of confirmed(source, candidates(mask), info)) {
    const { start, end, angle, inner, kind } = candidate;
    const unescaped = markdown.utils.unescapeAll(inner);
    const wrap = written => angle ? `<${written}>` : written;
    const url = REPO_URL.exec(unescaped);
    if (url) {
      const path = decode(url[2]);
      if (path === undefined) continue;
      const slash = path.length > 1 && path.endsWith('/') ? '/' : '';
      const target = retarget(forward(path.replace(/\/+$/, '')), url[3]);
      if (target + slash === path) continue;
      edits.push({ start, end, from: inner, to: wrap(url[1] + encodeLike(target + slash, url[2], false) + url[3]) });
      continue;
    }
    if (unescaped === '' || /^[a-z][a-z0-9+.-]*:/i.test(unescaped) || unescaped.startsWith('//')) continue;
    if (unescaped.startsWith('#')) {
      // 本頁的錨點：只有拆開的原檔與拆出的新檔要看那一段搬去哪裡。
      // 拆出的新檔先認自己的標題；原檔照錨點表（那一段搬走了就直接連過去，不經留下的一行）。
      if (!plan.split?.[origin] || (file !== origin && info.anchors.has(decode(unescaped.slice(1)) ?? ''))) continue;
      const target = retarget(origin, unescaped);
      if (target === file) continue;
      const written = posix.relative(posix.dirname(file), target) + unescaped;
      edits.push({ start, end, from: inner, to: wrap(encodeLike(written, '', angle)) });
      continue;
    }
    const cut = unescaped.search(/[?#]/);
    const rawPath = cut < 0 ? unescaped : unescaped.slice(0, cut);
    const rest = cut < 0 ? '' : unescaped.slice(cut);
    const path = decode(rawPath);
    if (path === undefined) continue;
    const rooted = path.startsWith('/');
    const slash = path.length > 1 && path.endsWith('/') ? '/' : '';
    const resolveFrom = from => posix.normalize(rooted ? path.slice(1) : posix.join(posix.dirname(from), path)).replace(/\/+$/, '');
    const here = resolveFrom(file);
    const before = forward(resolveFrom(origin));
    const fromHere = exists(here) ? retarget(here, rest) : undefined;
    const fromBefore = exists(before) ? retarget(before, rest) : undefined;
    if (fromHere !== undefined && fromBefore !== undefined && fromHere !== fromBefore) {
      conflicts.push({ line: lineOf(start), link: inner, here: fromHere, before: fromBefore });
      continue;
    }
    const target = fromHere ?? fromBefore;
    if (target === undefined) continue;
    const relativePath = rooted ? '/' + target : target === file && rest.startsWith('#') ? '' : (posix.relative(posix.dirname(file), target) || posix.basename(target));
    const written = (relativePath ? encodeLike(relativePath, rawPath, angle) + slash : '') + rest;
    if (target === here) continue;
    edits.push({ start, end, from: inner, to: wrap(written) });
  }
  edits.sort((a, b) => b.start - a.start);
  let out = source;
  for (const edit of edits) out = out.slice(0, edit.start) + edit.to + out.slice(edit.end);
  if (crlf) out = out.replace(/\n/g, '\r\n');
  return { text: bom + out, edits: edits.reverse().map(({ from, to, start }) => ({ line: lineOf(start), from, to })), conflicts };
}

const USAGE = '用法：node experiments/tools/move-links.mjs [--check] [--plan <計畫.json>] [<舊路徑>=<新路徑> ...]';

export function main(args, root = process.cwd()) {
  const check = args.includes('--check');
  const rest = args.filter(arg => arg !== '--check');
  const at = rest.indexOf('--plan');
  const plan = at < 0 ? {} : JSON.parse(readFileSync(posix.join(root.replaceAll('\\', '/'), rest[at + 1] ?? ''), 'utf8'));
  if (at >= 0 && !rest[at + 1]) throw Error(USAGE);
  const positional = at < 0 ? rest : rest.filter((_, i) => i !== at && i !== at + 1);
  const moves = [...(plan.moves ?? []), ...positional.map(arg => {
    const [from, to, extra] = arg.split('=');
    if (!from || !to || extra !== undefined) throw Error(USAGE);
    return [from, to];
  })].map(([from, to]) => [from.replace(/\/+$/, ''), to.replace(/\/+$/, '')]);
  if (!moves.length && !plan.split) throw Error('沒有給搬檔的對照');
  const git = list => execFileSync('git', list, { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const files = git(['ls-files', '-z']).split('\0').filter(Boolean);
  const paths = new Set();
  for (const file of files) {
    const parts = file.split('/');
    for (let i = 1; i <= parts.length; i++) paths.add(parts.slice(0, i).join('/'));
  }
  const map = { ...mapper(moves), pieces: plan.pieces, split: plan.split };
  let changed = 0;
  let review = 0;
  for (const file of files.filter(name => name.endsWith('.md'))) {
    const text = readFileSync(posix.join(root.replaceAll('\\', '/'), file), 'utf8');
    const result = rewrite(file, text, map, path => paths.has(path));
    for (const item of result.conflicts) console.log(`要人看 ${file}:${item.line}  ${item.link}：現在的位置解成 ${item.here}，搬家前的位置解成 ${item.before}`);
    review += result.conflicts.length;
    if (!result.edits.length) continue;
    changed += result.edits.length;
    for (const edit of result.edits) console.log(`${file}:${edit.line}  ${edit.from} → ${edit.to}`);
    if (!check) writeFileSync(posix.join(root.replaceAll('\\', '/'), file), result.text);
  }
  console.log(`${check ? `要改 ${changed} 個連結` : `改了 ${changed} 個連結`}${review ? `；要人看 ${review} 個` : ''}`);
  return (check && changed) || review ? 1 : 0;
}

if (import.meta.main) process.exitCode = main(process.argv.slice(2));
