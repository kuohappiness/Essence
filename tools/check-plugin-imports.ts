// 外掛之間不 import（D-208 第 10 點，tasks/one-repo-step-1.md §6）：三個外掛各自安裝、各自可用（D-006），程式不跨出自己的資料夾。
// 用法：node tools/check-plugin-imports.ts [--staged]
//   預設：Git 追蹤的檔，內容讀工作樹（npm run check 與 CI 用）。--staged：清單與內容都讀暫存區（pre-commit 用）。
// 擋：plugins/<外掛>/ 的程式用相對路徑跑出自己的資料夾；根目錄 src/、tests/、tools/ 的程式用相對路徑進到 plugins/；
//     plugins/<外掛>/ 追蹤的 symlink 指到外掛外；plugins/<外掛>/package.json 的 file:、link: 相依指到外掛外。
// 路徑用 TypeScript 的 preProcessFile 取字面值：註解與字串裡的不算，import、export … from、require、import()、
// import x = require() 與沒有代換的模板字面值都取得到；import('../../src/' + name) 取到字面的前段，照前段判斷（偏嚴）。
// 套件名稱、node:、網址照常。執行時才組出來的路徑、tsconfig 的 paths、打包工具的 alias 這裡看不到（backlog〈已知的限制〉）。
// 有問題時每個一行「檔案:行  目標  原因」，結束碼 1。
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join, posix, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

export interface Problem { file: string; line: number; target: string; reason: string }
interface Entry { path: string; mode: string; object: string }

const SOURCE = /\.(?:ts|tsx|mts|cts|js|jsx|mjs|cjs)$/i;
const PLUGIN = /^plugins\/([^/]+)\//;
const ROOT_CODE = /^(?:src|tests|tools)\//;
const DEPENDENCY_FIELDS = ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies'];

const isRelative = (spec: string) => spec === '.' || spec === '..' || spec.startsWith('./') || spec.startsWith('../');
const inside = (path: string, dir: string) => path === dir || path.startsWith(dir + '/');
/** 從 from 那個檔所在的資料夾解開相對路徑；跑出 repo 的回傳以 ../ 開頭的路徑。 */
const resolveFrom = (from: string, spec: string) => posix.normalize(posix.join(posix.dirname(from), spec.replaceAll('\\', '/'))).replace(/\/+$/, '');

function lineOf(text: string, pos: number): number {
  let line = 1;
  for (let i = 0; i < pos && i < text.length; i++) if (text.charCodeAt(i) === 10) line++;
  return line;
}

/** 一個程式檔的問題。path 是 repo 裡的路徑（/ 分隔）。 */
export function checkSource(path: string, text: string): Problem[] {
  const plugin = PLUGIN.exec(path)?.[1];
  const rootCode = !plugin && ROOT_CODE.test(path);
  if (!plugin && !rootCode) return [];
  const problems: Problem[] = [];
  const { importedFiles } = ts.preProcessFile(text, true, true);
  for (const { fileName, pos } of importedFiles) {
    if (!isRelative(fileName)) continue;
    const target = resolveFrom(path, fileName);
    if (plugin && !inside(target, `plugins/${plugin}`)) {
      problems.push({ file: path, line: lineOf(text, pos), target: fileName, reason: `跑出 plugins/${plugin}/：外掛不 import 其他外掛與最上層的程式（D-208 第 10 點）` });
    } else if (rootCode && inside(target, 'plugins')) {
      problems.push({ file: path, line: lineOf(text, pos), target: fileName, reason: '根目錄的程式不 import plugins/ 裡的外掛（D-208 第 10 點）' });
    }
  }
  return problems;
}

/** 外掛裡的 symlink 指到外掛外（target 是連結的內容）。 */
export function checkLink(path: string, target: string): Problem[] {
  const plugin = PLUGIN.exec(path)?.[1];
  if (!plugin) return [];
  const absolute = /^(?:[a-z]:)?[\\/]/i.test(target);
  if (!absolute && inside(resolveFrom(path, target), `plugins/${plugin}`)) return [];
  return [{ file: path, line: 1, target, reason: `symlink 指到 plugins/${plugin}/ 外（D-208 第 10 點）` }];
}

/** 外掛 package.json 的 file:、link: 相依指到外掛外。 */
export function checkPackage(path: string, text: string): Problem[] {
  const plugin = /^plugins\/([^/]+)\/package\.json$/.exec(path)?.[1];
  if (!plugin) return [];
  let pkg: Record<string, unknown>;
  try {
    pkg = JSON.parse(text) as Record<string, unknown>;
  } catch {
    return [{ file: path, line: 1, target: 'package.json', reason: '不是合法的 JSON，看不出相依指到哪裡' }];
  }
  const problems: Problem[] = [];
  const lines = text.split('\n');
  for (const field of DEPENDENCY_FIELDS) {
    const deps = pkg[field];
    if (!deps || typeof deps !== 'object') continue;
    for (const [name, value] of Object.entries(deps as Record<string, unknown>)) {
      if (typeof value !== 'string') continue;
      const local = /^(?:file|link):(.*)$/.exec(value)?.[1];
      if (local === undefined) continue;
      const absolute = /^(?:[a-z]:)?[\\/]/i.test(local);
      if (!absolute && inside(posix.normalize(posix.join(`plugins/${plugin}`, local.replaceAll('\\', '/'))).replace(/\/+$/, ''), `plugins/${plugin}`)) continue;
      const line = lines.findIndex(l => l.includes(JSON.stringify(name))) + 1 || 1;
      problems.push({ file: path, line, target: value, reason: `${field} 的 ${name} 指到 plugins/${plugin}/ 外（D-208 第 10 點）` });
    }
  }
  return problems;
}

function git(root: string, args: string[], input?: string): Buffer {
  return execFileSync('git', ['-c', 'core.quotepath=false', ...args], { cwd: root, input, maxBuffer: 1 << 30, stdio: ['pipe', 'pipe', 'pipe'] });
}

/** 追蹤的檔：mode、物件與路徑（git ls-files -s；--staged 時就是暫存區）。 */
function entries(root: string): Entry[] {
  const seen = new Map<string, Entry>();
  for (const line of git(root, ['ls-files', '-s', '-z']).toString('utf8').split('\0').filter(Boolean)) {
    const tab = line.indexOf('\t');
    const [mode, object] = line.slice(0, tab).split(' ');
    const path = line.slice(tab + 1);
    if (!seen.has(path)) seen.set(path, { path, mode, object });
  }
  return [...seen.values()];
}

/** 一次讀好幾個物件的內容（git cat-file --batch）。 */
function blobs(root: string, objects: string[]): Buffer[] {
  if (!objects.length) return [];
  const out = git(root, ['cat-file', '--batch'], objects.join('\n') + '\n');
  const result: Buffer[] = [];
  let at = 0;
  for (let i = 0; i < objects.length; i++) {
    const end = out.indexOf(10, at);
    const size = Number(out.subarray(at, end).toString('latin1').split(' ')[2]);
    result.push(out.subarray(end + 1, end + 1 + size));
    at = end + 1 + size + 1;
  }
  return result;
}

export function checkPluginImports(root: string, { staged = false }: { staged?: boolean } = {}): Problem[] {
  const all = entries(root).filter(e => !e.path.split('/').includes('node_modules'));
  const links = all.filter(e => e.mode === '120000');
  const files = all.filter(e => e.mode !== '120000' && e.mode !== '160000' && (SOURCE.test(e.path) || /^plugins\/[^/]+\/package\.json$/.test(e.path)))
    .filter(e => PLUGIN.test(e.path) || ROOT_CODE.test(e.path));
  const problems: Problem[] = [];
  // symlink 的內容一律讀索引裡的物件：Windows 沒開 symlink 時工作樹是一般檔。
  const linkTargets = blobs(root, links.filter(e => PLUGIN.test(e.path)).map(e => e.object));
  links.filter(e => PLUGIN.test(e.path)).forEach((e, i) => problems.push(...checkLink(e.path, linkTargets[i].toString('utf8'))));
  const texts = staged ? blobs(root, files.map(e => e.object)).map(b => b.toString('utf8'))
    : files.map(e => (existsSync(join(root, e.path)) ? readFileSync(join(root, e.path), 'utf8') : ''));
  files.forEach((e, i) => problems.push(...(e.path.endsWith('package.json') ? checkPackage(e.path, texts[i]) : checkSource(e.path, texts[i]))));
  return problems.sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : a.line - b.line));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const root = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
  const staged = process.argv.includes('--staged');
  const problems = checkPluginImports(root, { staged });
  if (problems.length) {
    console.error(`外掛之間的 import 有 ${problems.length} 個問題（${staged ? '暫存區' : '工作樹'}，D-208 第 10 點）：`);
    for (const p of problems) console.error(`${p.file}:${p.line}  ${p.target}  ${p.reason}`);
    process.exitCode = 1;
  } else console.log(`外掛之間沒有互相 import（${staged ? '暫存區' : '工作樹'}）`);
}
