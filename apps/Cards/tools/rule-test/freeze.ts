// 比較測試工具：freeze（任務說明 tasks/rule-test-tool.md §5-3）。凍結已有目標與每一組、每一課（多步的每一步）的提示，
// 鎖.json 記設定、提示、快照、教材與評分表的雜湊和當時的 commit；之後每一步開頭只核對這些雜湊（verifyLock），不要求 repo 停在同一個 commit。
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { RULE_SUBJECTS } from '../../src/core/ai/index.ts';
import { cliPath } from '../cli-path.ts';
import type { RuleSource } from './config.ts';
import { lessonDir, libraryOf, materialOf, openFolder, rubricOf, sha256File, sha256Text, writeOnce, type Folder } from './folder.ts';
import { APP_ROOT, buildFor, REPO_ROOT, subjectOf, type PromptPart } from './prompts.ts';
import { parseSnapshotFile, readSnapshot, type Snapshot } from './snapshot.ts';

export interface FrozenStep {
  group: string;
  lesson: string;
  /** 第幾步（從 1 算）與這一組共幾步。 */
  step: number;
  steps: number;
  conversation: string;
  deck: boolean;
  /** 格式檢查用三段的切法（外掛照科目；檔案來源另看任務段選項；自備看提示裡有沒有 `<<<卡組>>>`）。 */
  threeSections: boolean;
  /** 凍結/提示/ 底下的檔名。 */
  file: string;
  chars: number;
  sha256: string;
  rulesChars: number;
  parts: PromptPart[];
  /** 生成時才代入的前面幾步的回覆。 */
  pending: string[];
}

export interface Lock {
  time: string;
  commit: string;
  /** 凍結時 repo 有沒 commit 的修改（只記錄；外掛來源用到的檔有修改時不會走到這裡）。 */
  dirty: boolean;
  version: string;
  /** 檔案 → SHA-256。測試資料夾裡的寫相對路徑；課庫的檔寫 `<課庫>/<課>/<檔>`。 */
  files: Record<string, string>;
}

const LIBRARY = '<課庫>';
const git = (args: string[], root = REPO_ROOT): string => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const portable = (path: string): string => path.split(sep).join('/');

const promptFile = (group: string, lesson: string, step: number, steps: number): string => `${group}-${lesson}${steps > 1 ? `-${String(step)}` : ''}.md`;

/** 鎖裡一個鍵的實際位置。 */
function located(folder: Folder, key: string): string {
  return key.startsWith(`${LIBRARY}/`) ? join(libraryOf(folder), key.slice(LIBRARY.length + 1)) : join(folder.root, key);
}

function readLock(folder: Folder): Lock | null {
  const path = join(folder.root, '凍結', '鎖.json');
  return existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) as Lock : null;
}

/** 每一步開頭：凍結的檔都還在、雜湊沒變；有一個不同就停下並說是哪個。 */
export function verifyLock(folder: Folder): Lock {
  const lock = readLock(folder);
  if (!lock) throw Error('還沒凍結（先跑 freeze）');
  const changed = Object.entries(lock.files).filter(([key, hash]) => {
    const path = located(folder, key);
    return !existsSync(path) || sha256File(path) !== hash;
  }).map(([key]) => key);
  if (changed.length) throw Error(`凍結之後改過或不見了：${changed.join('、')}（要改就開新的測試資料夾，或照 §5-2 存成新版評分表）`);
  return lock;
}

export function readFrozenSteps(folder: Folder): FrozenStep[] {
  return JSON.parse(readFileSync(join(folder.root, '凍結', '提示.json'), 'utf8')) as FrozenStep[];
}

const threeSectionsOf = (source: RuleSource, r3: boolean, text: string): boolean =>
  source.kind === 'plugin' ? r3 : source.kind === 'files' ? r3 || source.task.threeSections : text.includes('<<<卡組>>>');

/** 外掛來源用到的檔（規則檔與 src/）在工作樹有沒 commit 的修改：有就停下（§5-3）。 */
function pluginDirty(folder: Folder, root: string): string[] {
  const subjects = new Set(folder.config.groups.flatMap(group => group.steps.flatMap(step => step.rules.kind === 'plugin' ? [step.rules.subject] : [])));
  if (!subjects.size) return [];
  const paths = [portable(relative(REPO_ROOT, join(APP_ROOT, 'src'))), ...RULE_SUBJECTS.filter(each => subjects.has(each.key)).flatMap(each => each.files.map(file => file.path))];
  return git(['status', '--porcelain', '--', ...paths], root).split('\n').filter(Boolean);
}

/** 用過的課（F15）：使用紀錄.md 裡解開過的 commit；候選規則的 commit 比它新就警告。 */
function usedWarnings(folder: Folder, root: string): string[] {
  const warnings: string[] = [];
  const commits = new Set(folder.config.groups.flatMap(group => group.steps.flatMap(step => step.rules.kind === 'files' ? [step.rules.commit] : step.rules.kind === 'plugin' ? ['HEAD'] : [])));
  for (const lesson of folder.config.lessons) {
    const log = join(lessonDir(folder, lesson), '使用紀錄.md');
    if (!existsSync(log)) continue;
    const used = [...readFileSync(log, 'utf8').matchAll(/commit ([0-9a-f]{7,40})/g)].map(match => match[1]);
    if (!used.length) continue;
    const newer = [...commits].filter(commit => used.every(at => {
      try { git(['merge-base', '--is-ancestor', commit, at], root); return false; } catch { return true; }
    }));
    warnings.push(newer.length
      ? `課「${lesson.code}」解開過 ${String(used.length)} 次，規則（${newer.join('、')}）比最後一次解開時新：這一課只能當回歸，不算新課`
      : `課「${lesson.code}」解開過 ${String(used.length)} 次（規則都不比那時新）`);
  }
  return warnings;
}

export interface FreezeOptions { root?: string; log?: (line: string) => void }

export async function freezeFolder(folder: Folder, options: FreezeOptions = {}): Promise<Lock> {
  const { root = REPO_ROOT, log = console.log } = options;
  const existing = readLock(folder);
  if (existing) {
    verifyLock(folder);
    log(`已經凍結（${existing.time}，commit ${existing.commit.slice(0, 8)}），檔案都沒變。`);
    return existing;
  }
  const dirty = pluginDirty(folder, root);
  if (dirty.length) throw Error(`外掛來源用到的檔有沒 commit 的修改，先 commit 或還原：\n${dirty.join('\n')}`);
  const { config } = folder;
  const missing = config.lessons.filter(lesson => !existsSync(materialOf(folder, lesson))).map(lesson => materialOf(folder, lesson));
  if (missing.length) throw Error(`課庫少了教材：${missing.join('、')}`);
  // 外掛版本照這個工具所在的 Cards（和用來組提示、讀卡組的程式同一份）。
  const version = (JSON.parse(readFileSync(join(APP_ROOT, 'package.json'), 'utf8')) as { version: string }).version;

  const files: Record<string, string> = {};
  const record = (path: string): void => { files[portable(relative(folder.root, path))] = sha256File(path); };
  const steps: FrozenStep[] = [];
  for (const lesson of config.lessons) {
    const subject = subjectOf(lesson.subjectKey);
    let snapshot: Snapshot | null = null;
    if (lesson.existing && 'vault' in lesson.existing) snapshot = await readSnapshot(cliPath(lesson.existing.vault, 'rule-test'), subject.subject, lesson.form.term, version);
    else if (lesson.existing) snapshot = parseSnapshotFile(readFileSync(cliPath(lesson.existing.snapshot, 'rule-test', {}, folder.root), 'utf8'), version);
    if (snapshot) {
      const path = join(folder.root, '凍結', '已有目標', `${lesson.code}.json`);
      writeOnce(path, JSON.stringify(snapshot, null, 2) + '\n');
      record(path);
    }
    for (const group of config.groups) {
      group.steps.forEach((step, i) => {
        const built = buildFor(step.rules, { lesson, snapshot, testFolder: folder.root, root });
        const file = promptFile(group.name, lesson.code, i + 1, group.steps.length);
        const path = join(folder.root, '凍結', '提示', file);
        writeOnce(path, built.text);
        record(path);
        if (step.rules.kind === 'own') record(join(folder.root, '提示', step.rules.files[lesson.code]));
        steps.push({
          group: group.name, lesson: lesson.code, step: i + 1, steps: group.steps.length, conversation: step.conversation, deck: step.deck,
          threeSections: threeSectionsOf(step.rules, subject.r3, built.text), file, chars: built.text.length, sha256: sha256Text(built.text),
          rulesChars: built.rulesChars, parts: built.parts, pending: built.pending,
        });
      });
    }
    files[`${LIBRARY}/${lesson.code}/教材.pdf`] = sha256File(materialOf(folder, lesson));
    if (existsSync(rubricOf(folder, lesson))) files[`${LIBRARY}/${lesson.code}/評分表.md`] = sha256File(rubricOf(folder, lesson));
  }
  const index = join(folder.root, '凍結', '提示.json');
  writeOnce(index, JSON.stringify(steps, null, 2) + '\n');
  record(index);
  record(join(folder.root, '測試.yaml'));

  const lock: Lock = { time: new Date().toISOString(), commit: git(['rev-parse', 'HEAD'], root), dirty: git(['status', '--porcelain'], root) !== '', version, files };
  writeOnce(join(folder.root, '凍結', '鎖.json'), JSON.stringify(lock, null, 2) + '\n');

  for (const lesson of config.lessons) {
    log(`\n課 ${lesson.code}${existsSync(rubricOf(folder, lesson)) ? '' : '（評分表還沒有：做好後 blind 時才鎖）'}`);
    for (const step of steps.filter(each => each.lesson === lesson.code)) {
      log(`  ${step.group}${step.steps > 1 ? ` 第 ${String(step.step)} 步` : ''}：規則 ${step.rulesChars.toLocaleString('en-US')} 字、整份 ${step.chars.toLocaleString('en-US')} 字${step.pending.length ? `（生成時代入 ${step.pending.join('、')}）` : ''}`);
    }
  }
  for (const warning of usedWarnings(folder, root)) log(`警告：${warning}`);
  log(`\n凍結完成：commit ${lock.commit.slice(0, 8)}${lock.dirty ? '（工作樹有別的修改）' : ''}。`);
  return lock;
}

/** `npm run rule-test -- freeze <測試資料夾>` */
export async function freeze(): Promise<void> {
  const dir = process.argv[3];
  if (!dir) throw Error('用法：npm run rule-test -- freeze <測試資料夾>');
  await freezeFolder(openFolder(cliPath(dir, 'rule-test')));
}
