// 比較測試工具：組每一組、每一課（多步的每一步）送出的提示（任務說明 tasks/rule-test-tool.md §4-2 規則的四種來源、§5-3）。
// 外掛來源照 RULE_SUBJECTS、ruleText、buildPrompt，和外掛複製提示一字不差；檔案來源從指定的 commit 讀規則檔，任務段用外掛的 taskSection
// 再照任務段選項改（tasks.ts）；自備來源讀測試資料夾 提示/ 的檔，只認三種變數。
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { buildPrompt, RULE_MARKER, RULE_SUBJECTS, ruleText, sha256Hex, taskSection, type CardForm, type EmbeddedRule, type RuleSubject } from '../../src/core/ai/index.ts';
import type { LessonConfig, RuleSource } from './config.ts';
import type { Snapshot } from './snapshot.ts';
import { applyTaskOptions } from './tasks.ts';

/** Cards 的資料夾與 repo 的根（這個檔在 Cards 的 tools/rule-test/）。 */
export const APP_ROOT = join(import.meta.dirname, '..', '..');
export const REPO_ROOT = join(APP_ROOT, '..', '..');

export interface PromptPart { name: string; version: string; chars: number; sha256: string }
export interface BuiltPrompt {
  text: string;
  /** 規則的部分（不含任務段與變數展開的內容）；規則字數是它們的字數加總。 */
  parts: PromptPart[];
  rulesChars: number;
  /** 生成時才代入的變數（`A.1` 這類：前面某一步的回覆）。 */
  pending: string[];
}

/** 字數：JavaScript 的 length（中文一個字算一個；和第一輪 build.ts 的字數口徑相同）。 */
const charsOf = (text: string): number => text.length;

export function subjectOf(key: string): RuleSubject {
  const found = RULE_SUBJECTS.find(each => each.key === key);
  if (!found) throw Error(`外掛沒有「${key}」這一科`);
  return found;
}

const part = (rule: EmbeddedRule): PromptPart => ({ name: rule.name, version: rule.version, chars: charsOf(rule.text), sha256: rule.sha256 });
const embed = (name: string, version: string, text: string): EmbeddedRule => ({ name, version, text, sha256: sha256Hex(text) });

/** 外掛來源的規則：工作樹的規則檔（凍結時另外確認這些檔沒有沒 commit 的修改）。 */
function pluginRules(subject: RuleSubject, root = REPO_ROOT): EmbeddedRule[] {
  return subject.files.map(file => embed(file.name, file.version, ruleText(readFileSync(join(root, file.path), 'utf8'), file)));
}

/** 只送 `<!-- 以下送給 AI -->` 以下、到第一個 `<!-- 以下只在…送 -->` 為止（候選規則 README〈檔案與組法〉）。 */
export function sectionText(raw: string, path: string): string {
  const lines = raw.replace(/\r\n?/g, '\n').split('\n');
  const start = lines.findIndex(line => line.trim() === RULE_MARKER);
  const end = lines.findIndex((line, i) => i > start && /^<!-- 以下只在.*送 -->$/.test(line.trim()));
  return ruleText((end < 0 ? lines : lines.slice(0, end)).join('\n'), { path, marker: true });
}

/** 從 commit 讀一份檔（不讀工作樹）。 */
function showFile(commit: string, path: string, root = REPO_ROOT): string {
  try {
    return execFileSync('git', ['show', `${commit}:${path}`], { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
  } catch { throw Error(`讀不到 ${commit}:${path}（commit 或路徑不對；commit 要先 git fetch）`); }
}

/** 檔案來源的規則：每份從 commit 讀、只取送出的那一段。名稱是檔名，版號是 commit。 */
function commitRules(commit: string, files: readonly string[], root = REPO_ROOT): EmbeddedRule[] {
  return files.map(path => embed(basename(path), commit, sectionText(showFile(commit, path, root), path)));
}

/** 規則加任務段，和外掛同樣的接法（buildPrompt：部分之間空一行）。 */
function assemble(rules: readonly EmbeddedRule[], task: string): BuiltPrompt {
  const text = [...rules.map(rule => rule.text), task].join('\n\n');
  return { text, parts: rules.map(part), rulesChars: rules.reduce((sum, rule) => sum + charsOf(rule.text), 0), pending: [] };
}

const VARIABLE = /\{\{([^{}]*)\}\}/g;
const STEP_REPLY = /^[A-Z]\.\d+$/;

/** 自備檔的變數（§4-2 第 4 種來源）：任務段、已有目標清單在這裡展開；`A.1` 這類留到生成時；其他擋下。 */
export function expandOwn(template: string, file: string, values: { task: string; list: string }): BuiltPrompt {
  const unknown = [...template.matchAll(VARIABLE)].map(match => match[1]).filter(name => name !== '任務段' && name !== '已有目標清單' && !STEP_REPLY.test(name));
  if (unknown.length) throw Error(`${file} 有認不得的變數：${[...new Set(unknown)].map(name => `{{${name}}}`).join('、')}（只認 {{任務段}}、{{已有目標清單}}、{{A.1}} 這類）`);
  const stripped = template.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  const pending = [...new Set([...stripped.matchAll(VARIABLE)].map(match => match[1]).filter(name => STEP_REPLY.test(name)))];
  const own = stripped.replace(VARIABLE, '');
  const text = stripped.replace(VARIABLE, (whole, name: string) => name === '任務段' ? values.task : name === '已有目標清單' ? values.list : whole);
  return { text, parts: [{ name: file, version: '自備', chars: charsOf(own), sha256: sha256Hex(stripped) }], rulesChars: charsOf(own), pending };
}

/** 生成時代入前面幾步的回覆；還有沒代入的就丟錯。 */
export function fillReplies(text: string, replies: ReadonlyMap<string, string>): string {
  return text.replace(VARIABLE, (whole, name: string) => {
    if (!STEP_REPLY.test(name)) return whole;
    const reply = replies.get(name);
    if (reply === undefined) throw Error(`{{${name}}} 還沒有回覆`);
    return reply;
  });
}

/** 任務段裡的已有目標清單那幾行（`- 學生已有的學習目標：` 起、到英文的已有單字那一行為止）。 */
function listLines(task: string): string {
  const lines = task.split('\n');
  const start = lines.findIndex(line => line.startsWith('- 學生已有的學習目標：'));
  if (start < 0) throw Error('任務段找不到「學生已有的學習目標」');
  let end = start + 1;
  while (end < lines.length && (lines[end].startsWith('  - ') || lines[end].startsWith('- 孩子已有的英文單字'))) end++;
  return lines.slice(start, end).join('\n');
}

export interface PromptInput { lesson: LessonConfig; snapshot: Snapshot | null; testFolder: string; root?: string }

/** 一個規則來源在一課組出的提示。 */
export function buildFor(source: RuleSource, input: PromptInput): BuiltPrompt {
  const { lesson, snapshot, root = REPO_ROOT } = input;
  const subject = subjectOf(lesson.subjectKey);
  const existing = snapshot?.targets ?? [];
  const words = subject.subject === '英文' ? snapshot?.words ?? [] : null;
  const form: CardForm = lesson.form;
  if (source.kind === 'plugin') {
    if (source.subject !== lesson.subjectKey) throw Error(`規則是外掛的「${source.subject}」，但課「${lesson.code}」的科目是「${lesson.subjectKey}」`);
    const prompt = buildPrompt(form, subject, pluginRules(subject, root), existing, words);
    return { text: prompt.text, parts: prompt.parts.slice(0, -1).map(each => ({ name: each.name, version: each.version, chars: charsOf(each.text), sha256: each.sha256 })), rulesChars: prompt.parts.slice(0, -1).reduce((sum, each) => sum + charsOf(each.text), 0), pending: [] };
  }
  if (source.kind === 'files') {
    const task = applyTaskOptions(taskSection(form, subject, existing, words), source.task, { subject, existing });
    return assemble(commitRules(source.commit, source.files, root), task);
  }
  const file = source.files[lesson.code];
  const task = taskSection(form, subject, existing, words);
  return expandOwn(readFileSync(join(input.testFolder, '提示', file), 'utf8'), `提示/${file}`, { task, list: listLines(task) });
}

