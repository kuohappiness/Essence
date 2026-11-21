// 決策紀錄的索引與查詢（D-141、D-214 第 5、8、9 點）。解析與規則在 decisions.ts。
// 用法（在 repo 任何資料夾都可以；experiments/tools/decisions-index.mjs 轉呼叫這裡，舊文件寫的指令照樣能用）：
//   node tools/decisions-index.ts                  重產 docs/decisions.md 開頭的索引（一律由工具產生，不手改）
//   node tools/decisions-index.ts D-117 [D-xxx …]  查詢：本條全文與「現行寫在」、直接修改它的〈決定〉、更深的一句話；不寫檔
//   node tools/decisions-index.ts D-117 --deep     查詢：本條與所有後續條目全文（改之前的行為）
//   --file <decisions.md> 與 --root <repo> 給測試用：改讀另一份決策紀錄、從另一個 repo 找規範文件。
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { DecisionsError, buildIndex, currentRefs, isNormative, normalizeId, parseDecisions, query } from './decisions.ts';

/** 規範文件：root 底下 Git 追蹤、而且是規範文件的檔，讀工作樹。不是 Git repo 時是空的（查詢照樣印，「現行寫在」寫沒有）。 */
function normativeFiles(root: string): { path: string; text: string }[] {
  let tracked: string[];
  try {
    tracked = execFileSync('git', ['-c', 'core.quotepath=false', 'ls-files', '-z'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 1 << 28 })
      .split('\0').filter(Boolean);
  } catch {
    return [];
  }
  return tracked.filter(isNormative).flatMap(path => {
    try {
      return [{ path, text: readFileSync(join(root, path), 'utf8') }];
    } catch {
      return [];
    }
  });
}

export function main(argv: readonly string[]): void {
  const args = [...argv];
  const take = (flag: string) => {
    const at = args.indexOf(flag);
    if (at < 0) return undefined;
    const [, value] = args.splice(at, 2);
    return value;
  };
  const here = dirname(fileURLToPath(import.meta.url));
  const file = take('--file');
  const root = resolve(take('--root') ?? join(here, '..'));
  const deep = args.includes('--deep');
  const wanted = args.filter(arg => arg !== '--deep');
  const path = file ? resolve(file) : join(here, '..', 'docs', 'decisions.md');
  try {
    const parsed = parseDecisions(readFileSync(path, 'utf8'));
    // 查詢：在任何寫檔之前分流，只讀不寫。
    if (wanted.length) {
      const ids = wanted.map(normalizeId);
      const unknown = ids.filter(id => !parsed.byId.has(id));
      if (unknown.length) throw new DecisionsError(`沒有這些決定：${unknown.join('、')}`);
      console.log(query(parsed, ids, { deep, refs: deep ? undefined : currentRefs(normativeFiles(root)) }));
      return;
    }
    const { updated, empty } = buildIndex(parsed);
    if (updated !== parsed.source) writeFileSync(path, updated, 'utf8');
    console.log(`索引共 ${parsed.decisions.length} 條；還沒寫一句話的舊決定：${empty.length ? empty.join('、') : '無'}。`);
  } catch (error) {
    if (!(error instanceof DecisionsError)) throw error;
    console.error(error.message);
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main(process.argv.slice(2));
