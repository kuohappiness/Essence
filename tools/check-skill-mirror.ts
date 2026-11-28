// 檢查 Claude（.claude/skills）與 Codex（.agents/skills）共用的 skill 兩份內容相同，且 Markdown 的相對連結都找得到（D-119）。
// 用法：node tools/check-skill-mirror.ts [--staged] [--root <repo>]；有問題時列出並以 exit code 1 結束。
//   預設讀工作樹。--staged：清單與內容都讀暫存區（pre-commit 用；只 stage 一份、工作樹的兩份剛好一致時也要擋）。
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, posix, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { LINK_TARGET } from './link-target.ts';

export const SHARED = ['code-quality', 'essence-decision', 'essence-discuss'];
export const COPIES = ['.claude/skills', '.agents/skills'];

/** 讀檔的來源：工作樹或暫存區。路徑都是 repo 裡的路徑（/ 分隔）。 */
interface Tree {
  /** 資料夾在不在。 */
  hasDir: (dir: string) => boolean;
  /** 資料夾底下所有的檔（遞迴），回傳相對於 dir 的路徑，排序過。 */
  list: (dir: string) => string[];
  read: (path: string) => string;
  /** 連結的目標在不在（檔或資料夾）；path 可能以 ../ 開頭（跑出 repo）。 */
  exists: (path: string) => boolean;
}

function workTree(root: string): Tree {
  return {
    hasDir: dir => existsSync(join(root, dir)),
    list: dir => readdirSync(join(root, dir), { recursive: true, encoding: 'utf8' })
      .filter(name => statSync(join(root, dir, name)).isFile())
      .map(name => name.split(sep).join('/'))
      .sort(),
    read: path => readFileSync(join(root, path), 'utf8'),
    exists: path => existsSync(resolve(root, path)),
  };
}

function git(root: string, args: string[], input?: string): Buffer {
  return execFileSync('git', ['-c', 'core.quotepath=false', ...args], { cwd: root, input, stdio: 'pipe', maxBuffer: 1 << 28 });
}

/** 暫存區：清單用 git ls-files -s，內容一次用 cat-file 讀完（只讀兩份 skill 底下的檔）。 */
function indexTree(root: string): Tree {
  const objects = new Map<string, string>();
  for (const entry of git(root, ['ls-files', '-s', '-z']).toString('utf8').split('\0').filter(Boolean)) {
    const tab = entry.indexOf('\t');
    const path = entry.slice(tab + 1);
    if (!objects.has(path)) objects.set(path, entry.slice(0, tab).split(' ')[1]);
  }
  const dirs = new Set<string>();
  for (const path of objects.keys()) {
    for (let at = path.indexOf('/'); at > 0; at = path.indexOf('/', at + 1)) dirs.add(path.slice(0, at));
  }
  const wanted = [...objects.keys()].filter(path => COPIES.some(copy => path.startsWith(copy + '/')));
  const texts = new Map<string, string>();
  if (wanted.length) {
    const out = git(root, ['cat-file', '--batch'], wanted.map(path => objects.get(path)).join('\n') + '\n');
    let at = 0;
    for (const path of wanted) {
      const end = out.indexOf(0x0a, at);
      const size = Number(out.subarray(at, end).toString('latin1').split(' ')[2]);
      texts.set(path, out.subarray(end + 1, end + 1 + size).toString('utf8'));
      at = end + 1 + size + 1;
    }
  }
  return {
    hasDir: dir => dirs.has(dir),
    list: dir => [...objects.keys()].filter(path => path.startsWith(dir + '/')).map(path => path.slice(dir.length + 1)).sort(),
    read: path => texts.get(path) ?? '',
    exists: path => path === '.' || objects.has(path) || dirs.has(path),
  };
}

const normalize = (text: string) => text.replace(/\r\n/g, '\n');

function brokenLinks(tree: Tree, file: string, text: string): string[] {
  const problems: string[] = [];
  // [文字](路徑)、[文字](<有空格的路徑>)，路徑裡可以有成對的括號（link-target.ts）
  for (const [, raw] of text.matchAll(new RegExp(String.raw`\]\((${LINK_TARGET})\)`, 'g'))) {
    const target = raw.replace(/^<|>$/g, '');
    if (!target || /^[a-z]+:/i.test(target) || target.startsWith('#')) continue;
    const path = posix.normalize(posix.join(posix.dirname(file), decodeURI(target.split('#')[0]))).replace(/\/+$/, '');
    if (!tree.exists(path)) problems.push(target);
  }
  return problems;
}

export function checkMirror(root: string, { staged = false }: { staged?: boolean } = {}): string[] {
  const tree = staged ? indexTree(root) : workTree(root);
  const problems: string[] = [];
  for (const skill of SHARED) {
    const [a, b] = COPIES.map(copy => `${copy}/${skill}`);
    const missing = [a, b].filter(dir => !tree.hasDir(dir));
    if (missing.length) {
      for (const dir of missing) problems.push(`缺少資料夾：${dir}`);
      continue;
    }
    const filesA = tree.list(a);
    const filesB = tree.list(b);
    for (const name of filesA.filter(name => !filesB.includes(name))) problems.push(`只有 ${COPIES[0]} 有：${skill}/${name}`);
    for (const name of filesB.filter(name => !filesA.includes(name))) problems.push(`只有 ${COPIES[1]} 有：${skill}/${name}`);
    for (const name of filesA.filter(name => filesB.includes(name))) {
      if (normalize(tree.read(`${a}/${name}`)) !== normalize(tree.read(`${b}/${name}`))) problems.push(`內容不同：${skill}/${name}`);
    }
    for (const dir of [a, b]) {
      for (const name of tree.list(dir).filter(name => name.endsWith('.md'))) {
        const file = `${dir}/${name}`;
        for (const target of brokenLinks(tree, file, tree.read(file))) problems.push(`連結找不到：${file} → ${target}`);
      }
    }
  }
  return problems;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const at = process.argv.indexOf('--root');
  const root = at > 0 ? resolve(process.argv[at + 1]) : resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const staged = process.argv.includes('--staged');
  const problems = checkMirror(root, { staged });
  const where = staged ? '暫存區' : '工作樹';
  if (problems.length) {
    console.error(`共用 skill 的兩份副本有 ${problems.length} 個問題（${where}）：\n- ${problems.join('\n- ')}`);
    process.exit(1);
  }
  console.log(`共用 skill 一致（${where}）：${SHARED.join('、')}`);
}
