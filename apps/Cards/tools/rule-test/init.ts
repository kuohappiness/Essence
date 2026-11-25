// 比較測試工具：init（任務說明 tasks/rule-test-tool.md §5、§5-10）。建測試資料夾與 測試.yaml 範本；
// --from 沿用另一輪的組、生成器、評審與門檻，只換課（補跑另一課用）：課庫與快照的路徑換成絕對路徑、自備提示檔整個複製，
// 記下沿用哪一輪（沿用.json）；凍結時核對規則與範本的雜湊和那一輪相同、課不重複，不同就停下（checkInherited）。
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseDocument } from 'yaml';
import { cliPath } from '../cli-path.ts';
import type { Config } from './config.ts';
import { copyDir, insideRepo, libraryOf, openFolder, sha256File, type Folder } from './folder.ts';
import { readFrozenSteps, readLock, type FrozenStep } from './freeze.ts';

const INHERITED = '沿用.json';

export function initFolder(root: string, options: { from?: string } = {}): string[] {
  if (insideRepo(root)) throw Error(`測試資料夾在 repo 裡（${root}）：教材、原稿與分數是私人資料，放到 repo 外面`);
  if (existsSync(join(root, '測試.yaml'))) throw Error(`${root} 已經有 測試.yaml`);
  mkdirSync(join(root, '提示'), { recursive: true });
  if (!options.from) {
    writeFileSync(join(root, '測試.yaml'), readFileSync(join(import.meta.dirname, 'templates', '測試.yaml'), 'utf8'), { encoding: 'utf8', flag: 'wx' });
    return [`建好了：${join(root, '測試.yaml')}（照裡面的說明改）`];
  }
  const old = openFolder(options.from);
  if (!readLock(old)) throw Error(`${old.root} 還沒凍結：沿用的那一輪要先凍結，才核對得了規則與範本`);
  const doc = parseDocument(old.configText);
  doc.set('名稱', `${old.config.name}（沿用）`);
  doc.set('課庫', libraryOf(old));
  for (const [i, lesson] of old.config.lessons.entries()) {
    if (lesson.existing && 'snapshot' in lesson.existing) doc.setIn(['課', i, '已有目標', '快照'], resolve(old.root, lesson.existing.snapshot));
  }
  if (existsSync(join(old.root, '提示'))) copyDir(join(old.root, '提示'), join(root, '提示'));
  writeFileSync(join(root, '測試.yaml'), doc.toString(), { encoding: 'utf8', flag: 'wx' });
  writeFileSync(join(root, INHERITED), JSON.stringify({ from: old.root, time: new Date().toISOString() }, null, 2) + '\n', { encoding: 'utf8', flag: 'wx' });
  return [
    `建好了：${join(root, '測試.yaml')}，沿用「${old.config.name}」的組、生成器、評審與門檻。`,
    '把「課」換成這一輪要補跑的課（自備提示的組，「自備」裡也要加新課的檔）；其他設定不要改，凍結時會核對。',
  ];
}

/** 比較用的設定：課不算；自備來源只看是自備（檔每課不同）；生成器不看跑哪幾課。 */
function comparable(config: Config): string {
  return JSON.stringify({
    groups: config.groups.map(group => ({ ...group, steps: group.steps.map(step => ({ ...step, rules: step.rules.kind === 'own' ? { kind: 'own' } : step.rules })) })),
    generators: config.generators.map(({ lessons: _lessons, ...rest }) => rest),
    judges: config.judges, rejudge: config.rejudge, adjudicator: config.adjudicator, gates: config.gates, systemPrompt: config.systemPrompt,
  });
}

/**
 * 沿用另一輪時（沿用.json）：設定除了課都要相同、課不能和那一輪重複（同一課多跑幾份用 extend）、評審與裁定的範本和那一輪凍結的相同、
 * 每一組每一步的規則（自備的除外）和那一輪凍結的相同。steps 是這一輪剛組好的提示；templates 是這一輪要凍結的範本（名稱對雜湊）。
 */
export function checkInherited(folder: Folder, steps: readonly FrozenStep[], templates: Record<string, string>): void {
  const file = join(folder.root, INHERITED);
  if (!existsSync(file)) return;
  const old = openFolder((JSON.parse(readFileSync(file, 'utf8')) as { from: string }).from);
  const lock = readLock(old);
  if (!lock) throw Error(`沿用的 ${old.root} 沒有凍結`);
  const problems: string[] = [];
  if (comparable(folder.config) !== comparable(old.config)) problems.push('設定和那一輪不同（只能換課）');
  const reused = folder.config.lessons.filter(lesson => old.config.lessons.some(each => each.code === lesson.code)).map(lesson => lesson.code);
  if (reused.length) problems.push(`課 ${reused.join('、')} 那一輪跑過（同一課多跑幾份用 extend）`);
  for (const [name, hash] of Object.entries(templates)) {
    const before = lock.files[`凍結/範本/${name}`];
    if (before !== hash) problems.push(`範本 ${name} ${before ? '和那一輪不同' : '那一輪沒有'}`);
  }
  const oldSteps = readFrozenSteps(old);
  const rules = (step: FrozenStep): string => JSON.stringify(step.parts.filter(part => part.version !== '自備').map(part => [part.name, part.sha256]));
  for (const step of steps) {
    const before = oldSteps.find(each => each.group === step.group && each.step === step.step);
    if (before && rules(before) !== rules(step)) problems.push(`組「${step.group}」${step.steps > 1 ? `第 ${String(step.step)} 步` : ''}的規則和那一輪不同`);
  }
  if (problems.length) throw Error(`這一輪沿用「${old.config.name}」，但是：\n${[...new Set(problems)].map(each => `- ${each}`).join('\n')}\n要換規則或設定就開新的一輪（不用 --from）。`);
}

export const templateHashes = (names: readonly string[], dir: string): Record<string, string> => Object.fromEntries(names.map(name => [name, sha256File(join(dir, name))]));

/** `npm run rule-test -- init <測試資料夾> [--from <另一個測試資料夾>]` */
export function init(): Promise<void> {
  const [dir, ...flags] = process.argv.slice(3);
  if (!dir) throw Error('用法：npm run rule-test -- init <測試資料夾> [--from <另一個測試資料夾>]');
  const at = flags.indexOf('--from');
  if (at >= 0 && !flags[at + 1]) throw Error('--from 後面要寫另一個測試資料夾');
  for (const line of initFolder(cliPath(dir, 'rule-test'), at >= 0 ? { from: cliPath(flags[at + 1], 'rule-test') } : {})) console.log(line);
  return Promise.resolve();
}
