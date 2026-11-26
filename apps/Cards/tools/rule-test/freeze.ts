// 比較測試工具：freeze（任務說明 tasks/rule-test-tool.md §5-3）。凍結已有目標與每一組、每一課（多步的每一步）的提示，
// 鎖.json 記設定、提示、快照、教材與評分表的雜湊和當時的 commit；之後每一步開頭只核對這些雜湊（verifyLock），不要求 repo 停在同一個 commit。
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { RULE_SUBJECTS, unitCode, type EmbeddedRule } from '../../src/core/ai/index.ts';
import { cliPath } from '../cli-path.ts';
import { deepenGroups, type RuleSource } from './config.ts';
import { lessonDir, libraryOf, materialOf, openFolder, rubricOf, sha256File, sha256Text, writeOnce, type Folder } from './folder.ts';
import { checkInherited, templateHashes } from './init.ts';
import { EVALUATION } from './levels.ts';
import { APP_ROOT, buildFor, deepenRulesFor, REPO_ROOT, subjectOf, type PromptPart } from './prompts.ts';
import { checkRubricFile } from './rubric.ts';
import { evaluationSpec, unreachable } from './spec.ts';
import { appendEvent } from './jobs.ts';
import { parseSnapshotFile, readVault, snapshotOf, unitDecks, wordDecksOf, type Snapshot, type WordDecks } from './snapshot.ts';

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
  /** 評估版本（rule-test-d236.md §2）：之後每一步都核對，和工具的不同就停下。 */
  evaluation: string;
  /** 檔案 → SHA-256。測試資料夾裡的寫相對路徑；課庫的檔寫 `<課庫>/<課>/<檔>`。 */
  files: Record<string, string>;
}

const LIBRARY = '<課庫>';
export const git = (args: string[], root = REPO_ROOT): string => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const portable = (path: string): string => path.split(sep).join('/');

const promptFile = (group: string, lesson: string, step: number, steps: number): string => `${group}-${lesson}${steps > 1 ? `-${String(step)}` : ''}.md`;

/** 鎖裡一個鍵的實際位置。 */
function located(folder: Folder, key: string): string {
  return key.startsWith(`${LIBRARY}/`) ? join(libraryOf(folder), key.slice(LIBRARY.length + 1)) : join(folder.root, key);
}

export function readLock(folder: Folder): Lock | null {
  const path = join(folder.root, '凍結', '鎖.json');
  return existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) as Lock : null;
}

/** 每一步開頭：凍結的檔都還在、雜湊沒變；有一個不同就停下並說是哪個。 */
export function verifyLock(folder: Folder): Lock {
  const lock = readLock(folder);
  if (!lock) throw Error('還沒凍結（先跑 freeze）');
  if (lock.evaluation !== EVALUATION) throw Error(`這個資料夾是用舊的評估版本（${lock.evaluation ?? 'D-236 以前'}）凍結的，現在的工具是 ${EVALUATION}：用凍結時的 commit（${lock.commit.slice(0, 8)}）跑`);
  const changed = Object.entries(lock.files).filter(([key, hash]) => {
    const path = located(folder, key);
    return !existsSync(path) || sha256File(path) !== hash;
  }).map(([key]) => key);
  if (changed.length) throw Error(`凍結之後改過或不見了：${changed.join('、')}（要改就開新的測試資料夾，或照 §5-2 存成新版評分表）`);
  return lock;
}

/** 使用者同意用量（--confirmed）：在事件裡記下〈評估規格〉的雜湊，代表使用者看過的就是這一份（rule-test-d236.md §11）。 */
export function confirmSpec(folder: Folder, log?: string): void {
  appendEvent(folder, { type: 'confirmed', detail: { spec: sha256File(join(folder.root, SPEC)) } }, log);
}

/** 外掛的加深任務段（§6-1 第 5 點）：凍結時記雜湊，模擬時核對。 */
/**
 * 模擬加深用到的外掛原始碼（D-236 §11；L2 第 1 輪 O：不只 deepen-prompt.ts，planDraft、unitSiblings、learnedWords、inspectDeepen 也會改變送出的提示）：
 * 從 deepen.ts 起順著相對 import 找（工具的檔也跟著找），收 src 底下的檔。
 */
export function deepenSources(): string[] {
  const src = join(APP_ROOT, 'src') + sep, seen = new Set<string>(), out: string[] = [];
  const visit = (file: string): void => {
    if (seen.has(file)) return;
    seen.add(file);
    if (file.startsWith(src)) out.push(file);
    for (const match of readFileSync(file, 'utf8').matchAll(/(?:^|\n)\s*(?:import|export)\b[^'";]*?(?:from\s*)?'(\.{1,2}\/[^']+\.ts)'/g)) visit(resolve(dirname(file), match[1]));
  };
  visit(join(import.meta.dirname, 'deepen.ts'));
  return out.sort();
}
/** 這些檔合成一個雜湊（相對路徑＋各自的雜湊），凍結時記、模擬時核對。 */
export const deepenSourcesHash = (): string => sha256Text(deepenSources().map(file => `${relative(APP_ROOT, file).split(sep).join('/')} ${sha256File(file)}`).join('\n'));
const DEEPEN_RULES = join('凍結', '加深', '規則.json');
/** 〈評估規格〉的位置（§11）。 */
export const SPEC = join('凍結', '評估規格.md');
/** 凍結的加深規則：每一組送的規則全文（已經組好、算好雜湊），與 deepen-prompt.ts 的雜湊。 */
export interface DeepenFrozen { plugin: string; groups: Record<string, EmbeddedRule[]> }
export const readDeepenFrozen = (folder: Folder): DeepenFrozen => JSON.parse(readFileSync(join(folder.root, DEEPEN_RULES), 'utf8')) as DeepenFrozen;
export function readWordDecks(folder: Folder, lesson: string): WordDecks | null {
  const path = join(folder.root, '凍結', '加深', '單字卡組', `${lesson}.json`);
  return existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) as WordDecks : null;
}

export function readFrozenSteps(folder: Folder): FrozenStep[] {
  return JSON.parse(readFileSync(join(folder.root, '凍結', '提示.json'), 'utf8')) as FrozenStep[];
}

export function readFrozenSnapshot(folder: Folder, lesson: string): Snapshot | null {
  const path = join(folder.root, '凍結', '已有目標', `${lesson}.json`);
  return existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) as Snapshot : null;
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
  // 設定的檢查（§4-2）：教材與自備提示檔一次列完；commit 裡的規則檔讀不到時，組提示那一步說是哪一份。
  const own = config.groups.flatMap(group => group.steps.flatMap(step => step.rules.kind === 'own' ? Object.values(step.rules.files) : []));
  const missing = [
    ...config.lessons.map(lesson => materialOf(folder, lesson)).filter(path => !existsSync(path)).map(path => `教材：${path}`),
    ...[...new Set(own)].map(file => join(folder.root, '提示', file)).filter(path => !existsSync(path)).map(path => `自備提示：${path}`),
  ];
  if (missing.length) throw Error(`少了這些檔：\n${missing.map(each => `- ${each}`).join('\n')}`);
  // 外掛版本照這個工具所在的 Cards（和用來組提示、讀卡組的程式同一份）。
  const version = (JSON.parse(readFileSync(join(APP_ROOT, 'package.json'), 'utf8')) as { version: string }).version;

  const files: Record<string, string> = {};
  const record = (path: string): void => { files[portable(relative(folder.root, path))] = sha256File(path); };
  // 先組好、核對過沿用的那一輪（init --from）才寫檔：停下時什麼都沒寫，改好重跑不會撞到寫了一半的凍結檔。
  const writes: [string, string | Buffer][] = [];
  const steps: FrozenStep[] = [];
  for (const lesson of config.lessons) {
    const subject = subjectOf(lesson.subjectKey);
    let snapshot: Snapshot | null = null;
    const vault = lesson.existing && 'vault' in lesson.existing ? await readVault(cliPath(lesson.existing.vault, 'rule-test')) : null;
    if (vault) snapshot = snapshotOf(vault, subject.subject, lesson.form.term, version);
    else if (lesson.existing && 'snapshot' in lesson.existing) snapshot = parseSnapshotFile(readFileSync(cliPath(lesson.existing.snapshot, 'rule-test', {}, folder.root), 'utf8'), version);
    if (snapshot) {
      writes.push([join(folder.root, '凍結', '已有目標', `${lesson.code}.json`), JSON.stringify(snapshot, null, 2) + '\n']);
    }
    if (config.deepen) {
      // 加深模擬的是新課（rule-test-d236.md §6-1 第 4 點）：快照檔查不了單元有沒有卡組、也沒有英文單字的排序，要從 vault 讀。
      if (lesson.existing && !vault) throw Error(`課「${lesson.code}」跑加深，已有目標要從 vault 讀（快照檔查不了這個單元有沒有卡組，英文也排不了單字）`);
      const taken = vault && subject.subject !== null ? unitDecks(vault, subject.subject, lesson.form.term, unitCode(lesson.form.unit)) : [];
      if (taken.length) throw Error(`課「${lesson.code}」跑加深，但 vault 裡這個單元已經有卡組（含草稿）：${taken.join('、')}；加深模擬的是沒做過卡的新課`);
      if (subject.subject === '英文') writes.push([join(folder.root, '凍結', '加深', '單字卡組', `${lesson.code}.json`), JSON.stringify(wordDecksOf(vault ?? [], subject.subject, version), null, 2) + '\n']);
    }
    for (const group of config.groups) {
      group.steps.forEach((step, i) => {
        const built = buildFor(step.rules, { lesson, snapshot, testFolder: folder.root, root });
        const file = promptFile(group.name, lesson.code, i + 1, group.steps.length);
        writes.push([join(folder.root, '凍結', '提示', file), built.text]);
        if (step.rules.kind === 'own') record(join(folder.root, '提示', step.rules.files[lesson.code]));
        steps.push({
          group: group.name, lesson: lesson.code, step: i + 1, steps: group.steps.length, conversation: step.conversation, deck: step.deck,
          threeSections: threeSectionsOf(step.rules, subject.r3, built.text), file, chars: built.text.length, sha256: sha256Text(built.text),
          rulesChars: built.rulesChars, parts: built.parts, pending: built.pending,
        });
      });
    }
    files[`${LIBRARY}/${lesson.code}/教材.pdf`] = sha256File(materialOf(folder, lesson));
    if (existsSync(rubricOf(folder, lesson))) {
      checkRubricFile(rubricOf(folder, lesson), lesson.code, snapshot ? new Set(snapshot.targets.map(target => target.id)) : null);
      files[`${LIBRARY}/${lesson.code}/評分表.md`] = sha256File(rubricOf(folder, lesson));
    }
  }
  if (config.deepen) {
    const rules: DeepenFrozen = {
      plugin: deepenSourcesHash(),
      groups: Object.fromEntries(deepenGroups(config).map(name => [name, deepenRulesFor(config.groups.find(group => group.name === name)!, root)])),
    };
    writes.push([join(folder.root, DEEPEN_RULES), JSON.stringify(rules, null, 2) + '\n']);
  }
  // 評審與裁定的範本（§5-7、§5-8）：評分說明、用到的科目口徑、裁定與拿不準的說明、評分表的寫法與核對（D-236 §11），凍結一份，之後照這一份。
  const templates = join(import.meta.dirname, 'templates');
  const names = ['評分說明.md', '地圖評分說明.md', '加深評分說明.md', '裁定說明.md', '拿不準說明.md', '評分表寫法.md', '評分表核對.md', ...[...new Set(config.lessons.map(lesson => lesson.subjectKey))].map(key => `口徑/${key}.md`).filter(name => existsSync(join(templates, name)))];
  checkInherited(folder, steps, templateHashes(names, templates));
  for (const name of names) writes.push([join(folder.root, '凍結', '範本', name), readFileSync(join(templates, name))]);
  writes.push([join(folder.root, '凍結', '提示.json'), JSON.stringify(steps, null, 2) + '\n']);
  // 〈評估規格〉（rule-test-d236.md §11）：照設定與工具的常數產生，鎖住；給使用者看用量時一起給。
  writes.push([join(folder.root, SPEC), evaluationSpec(config, steps)]);
  for (const [path, content] of writes) {
    writeOnce(path, content);
    record(path);
  }
  record(join(folder.root, '測試.yaml'));

  const lock: Lock = { time: new Date().toISOString(), commit: git(['rev-parse', 'HEAD'], root), dirty: git(['status', '--porcelain'], root) !== '', version, evaluation: EVALUATION, files };
  writeOnce(join(folder.root, '凍結', '鎖.json'), JSON.stringify(lock, null, 2) + '\n');

  for (const lesson of config.lessons) {
    log(`\n課 ${lesson.code}${existsSync(rubricOf(folder, lesson)) ? '' : '（評分表還沒有：做好後 blind 時才鎖）'}`);
    for (const step of steps.filter(each => each.lesson === lesson.code)) {
      log(`  ${step.group}${step.steps > 1 ? ` 第 ${String(step.step)} 步` : ''}：規則 ${step.rulesChars.toLocaleString('en-US')} 字、整份 ${step.chars.toLocaleString('en-US')} 字${step.pending.length ? `（生成時代入 ${step.pending.join('、')}）` : ''}`);
    }
  }
  for (const warning of [...usedWarnings(folder, root), ...unreachable(config)]) log(`警告：${warning}`);
  log(`評估規格：${join(folder.root, SPEC)}（給使用者看用量時一起給）`);
  log(`\n凍結完成：commit ${lock.commit.slice(0, 8)}${lock.dirty ? '（工作樹有別的修改）' : ''}。`);
  return lock;
}

/** `npm run rule-test -- freeze <測試資料夾>` */
export async function freeze(): Promise<void> {
  const dir = process.argv[3];
  if (!dir) throw Error('用法：npm run rule-test -- freeze <測試資料夾>');
  await freezeFolder(openFolder(cliPath(dir, 'rule-test')));
}
