#!/usr/bin/env node
// 搬檔之後改 Markdown 連結（D-208 第二步 §A6，B 也用）：在 git mv 之後、commit 之前，在 repo 根目錄執行。
//
//   node experiments/tools/move-links.mjs [--check] <舊路徑>=<新路徑> ...
//
// 路徑是 repo 根目錄算的；資料夾的對照也套到底下每個檔（src=plugins/cards/src）。
// - 連結目標用和 tools/check-docs.ts 同一個 Markdown 解析器（markdown-it，html: true）取：行內、引用式、角括號的都算，
//   程式碼框、HTML 區塊與行內程式碼裡的不算。
// - 從檔案現在的位置解得開的連結不動；解不開的，從那個檔搬家前的位置解，目標照對照換成新路徑、而且存在，才換成新的相對寫法。
//   錨點、查詢字串與結尾的斜線照留。所以第二次執行不改任何字，rebase 之後可以再跑一次。
// - 指到這個 repo `blob/main/`（舊名 Essence-Cards 與新名 Essence 都算）的舊路徑網址，換成新路徑。
// - 「存在」照 git 的索引（git ls-files）：搬家的 git mv 要先做。
// --check：只列出會改的連結，不寫檔；有要改的結束碼是 1。
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
import { posix } from 'node:path';
import { pathToFileURL } from 'node:url';

const require = createRequire(new URL('../../tools/package.json', import.meta.url));
const { default: MarkdownIt } = await import(pathToFileURL(require.resolve('markdown-it')).href);
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

/** 一個字串裡跟著長度不變的遮罩：程式碼框、HTML 區塊、front matter 的行與行內程式碼換成空白，位置不變。 */
function masked(text, tokens) {
  const lines = text.split('\n');
  const front = /^---\n[\s\S]*?\n---(?:\n|$)/.exec(text);
  const hidden = new Set();
  if (front) for (let i = 0; i < front[0].split('\n').length - 1; i++) hidden.add(i);
  for (const token of tokens) {
    if (!token.map || !['fence', 'code_block', 'html_block'].includes(token.type)) continue;
    for (let i = token.map[0]; i < token.map[1]; i++) hidden.add(i);
  }
  return lines.map((line, i) => hidden.has(i) ? line.replace(/[^\n]/g, ' ') : line.replace(/(`+)[^`]*?\1/g, span => ' '.repeat(span.length))).join('\n');
}

/** 解析器認得的連結與圖片的目的地（正規化之後的 href）。 */
function parsedHrefs(text) {
  const blank = text.replace(/^---\n[\s\S]*?\n---(?:\n|$)/, front => front.replace(/[^\n]/g, ''));
  const tokens = markdown.parse(blank, {});
  const hrefs = new Set();
  for (const token of tokens) {
    if (token.type !== 'inline') continue;
    for (const child of token.children ?? []) {
      const href = child.type === 'link_open' ? child.attrGet('href') : child.type === 'image' ? child.attrGet('src') : null;
      if (href !== null) hrefs.add(href);
    }
  }
  return { hrefs, tokens };
}

/** 原文裡的連結目的地：[x](目的地)、![x](目的地)、[x]: 目的地、<網址>。回傳在原文的起訖與去掉角括號的內容。 */
function* candidates(mask) {
  const patterns = [
    /\]\([ \t]*(<[^<>\n]*>|(?:[^\s()<>]|\([^\s()]*\))+)/g,
    /^ {0,3}\[[^\]\n]+\]:[ \t]*(<[^<>\n]*>|\S+)/gm,
    /(<https?:\/\/[^\s<>]+>)/g,
  ];
  for (const pattern of patterns) {
    for (const match of mask.matchAll(pattern)) {
      const raw = match[1];
      const start = match.index + match[0].length - raw.length;
      const angle = raw.startsWith('<') && raw.endsWith('>');
      yield { start, end: start + raw.length, angle, inner: angle ? raw.slice(1, -1) : raw };
    }
  }
}

const REPO_URL = /^(https:\/\/github\.com\/[^/]+\/(?:Essence-Cards|Essence)\/blob\/main\/)([^?#]*)(.*)$/;

const decode = part => { try { return decodeURIComponent(part); } catch { return undefined; } };
/** 新路徑寫回原文：原本有百分比編碼的照樣編碼，沒有的只把空白與括號編碼（不加角括號時）。 */
function encodeLike(path, raw, angle) {
  if (/%[0-9a-f]{2}/i.test(raw)) return path.split('/').map(encodeURIComponent).join('/');
  return angle ? path : path.replace(/[ ()]/g, char => encodeURIComponent(char));
}

/**
 * 一份 Markdown 的新內容與改了哪些連結。file 是它現在（搬家後）的 repo 路徑；exists 判斷 repo 路徑（檔或資料夾）存在。
 */
export function rewrite(file, text, { forward, backward }, exists) {
  const bom = text.startsWith('\uFEFF') ? '\uFEFF' : '';
  const crlf = text.includes('\r\n');
  const source = text.slice(bom.length).replace(/\r\n/g, '\n');
  const { hrefs, tokens } = parsedHrefs(source);
  const mask = masked(source, tokens);
  const oldFile = backward(file);
  const edits = [];
  for (const { start, end, angle, inner } of candidates(mask)) {
    const unescaped = markdown.utils.unescapeAll(inner);
    if (!hrefs.has(markdown.normalizeLink(unescaped))) continue;
    const url = REPO_URL.exec(unescaped);
    if (url) {
      const path = decode(url[2]);
      if (path === undefined || forward(path) === path) continue;
      edits.push({ start, end, from: inner, to: (angle ? '<' : '') + url[1] + encodeLike(forward(path), url[2], false) + url[3] + (angle ? '>' : '') });
      continue;
    }
    if (unescaped === '' || /^[a-z][a-z0-9+.-]*:/i.test(unescaped) || unescaped.startsWith('//') || unescaped.startsWith('#')) continue;
    const cut = unescaped.search(/[?#]/);
    const rawPath = cut < 0 ? unescaped : unescaped.slice(0, cut);
    const rest = cut < 0 ? '' : unescaped.slice(cut);
    const path = decode(rawPath);
    if (path === undefined) continue;
    const rooted = path.startsWith('/');
    const slash = path.length > 1 && path.endsWith('/') ? '/' : '';
    const resolveFrom = from => posix.normalize(rooted ? path.slice(1) : posix.join(posix.dirname(from), path)).replace(/\/+$/, '');
    if (exists(resolveFrom(file))) continue;
    const target = forward(resolveFrom(oldFile));
    if (!exists(target)) continue;
    const relativePath = rooted ? '/' + target : (posix.relative(posix.dirname(file), target) || posix.basename(target));
    const written = encodeLike(relativePath, rawPath, angle) + slash + rest;
    if (written === inner) continue;
    edits.push({ start, end, from: inner, to: angle ? `<${written}>` : written });
  }
  edits.sort((a, b) => b.start - a.start);
  let out = source;
  for (const edit of edits) out = out.slice(0, edit.start) + edit.to + out.slice(edit.end);
  if (crlf) out = out.replace(/\n/g, '\r\n');
  return { text: bom + out, edits: edits.reverse().map(({ from, to, start }) => ({ line: source.slice(0, start).split('\n').length, from, to })) };
}

export function main(args, root = process.cwd()) {
  const check = args.includes('--check');
  const moves = args.filter(arg => arg !== '--check').map(arg => {
    const [from, to, extra] = arg.split('=');
    if (!from || !to || extra !== undefined) throw Error('用法：node experiments/tools/move-links.mjs [--check] <舊路徑>=<新路徑> ...');
    return [from.replace(/\/+$/, ''), to.replace(/\/+$/, '')];
  });
  if (!moves.length) throw Error('沒有給搬檔的對照');
  const git = list => execFileSync('git', list, { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const files = git(['ls-files', '-z']).split('\0').filter(Boolean);
  const paths = new Set();
  for (const file of files) {
    const parts = file.split('/');
    for (let i = 1; i <= parts.length; i++) paths.add(parts.slice(0, i).join('/'));
  }
  const map = mapper(moves);
  let changed = 0;
  for (const file of files.filter(name => name.endsWith('.md'))) {
    const text = readFileSync(posix.join(root.replaceAll('\\', '/'), file), 'utf8');
    const result = rewrite(file, text, map, path => paths.has(path));
    if (!result.edits.length) continue;
    changed += result.edits.length;
    for (const edit of result.edits) console.log(`${file}:${edit.line}  ${edit.from} → ${edit.to}`);
    if (!check) writeFileSync(posix.join(root.replaceAll('\\', '/'), file), result.text);
  }
  console.log(check ? `要改 ${changed} 個連結` : `改了 ${changed} 個連結`);
  return check && changed ? 1 : 0;
}

if (import.meta.main) process.exitCode = main(process.argv.slice(2));
