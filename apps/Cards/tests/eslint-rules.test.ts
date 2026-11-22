// ESLint 規則的測試，從 tests/quality.test.ts 拆出來（D-208 第二步 §A2；拆之前的最後一版是 commit d7e2a0b，git log --follow 接得到 hook 那一半）：留在 Cards，用 Cards 的 ESLint 設定跑；hook 的測試搬到 tools/tests/。
import test from 'node:test';
import assert from 'node:assert/strict';
import { ESLint } from 'eslint';
import obsidianmd from 'eslint-plugin-obsidianmd';
import tseslint from 'typescript-eslint';

// 片段不是完整產品檔案，不建 TypeScript project：typescript-eslint 與 obsidianmd 要型別的規則都關掉（D-220 的區塊有 no-unsupported-api 等）。
const syntaxOnly = [tseslint.configs.disableTypeChecked, { rules: Object.fromEntries(Object.keys(obsidianmd.ruleConfigs.recommendedTypeChecked).map(rule => [rule, 'off' as const])) }];

void test('ESLint 的模組邊界與日期規則會擋下違規寫法，允許公開介面與 UTC', async () => {
  // 這裡只驗證語法規則；片段不是完整產品檔案，不需要建立 TypeScript project。
  const lint = new ESLint({ overrideConfig: syntaxOnly });
  for (const name of ['obsidian', 'react/jsx-runtime', 'react-dom/client', 'motion/react', 'node:fs', 'fs/promises', 'path', 'ts-fsrs']) {
    const [result] = await lint.lintText(`import '${name}';`, { filePath: 'src/core/files.ts' });
    assert.ok(result.messages.some(m => m.ruleId === 'no-restricted-imports'), name);
  }
  for (const method of ['getFullYear', 'getMonth', 'getDate', 'getDay', 'getHours', 'getMinutes', 'getSeconds', 'getMilliseconds', 'setFullYear', 'setMonth', 'setDate', 'setHours', 'setMinutes', 'setSeconds', 'setMilliseconds', 'toLocaleString', 'toLocaleDateString', 'toLocaleTimeString', 'toString']) {
    for (const call of [`new Date().${method}()`, `new Date()['${method}']()`]) {
      const [result] = await lint.lintText(`${call};`, { filePath: 'src/core/files.ts' });
      assert.ok(result.messages.some(m => m.ruleId === 'no-restricted-syntax'), call);
    }
  }
  for (const [path, name, blocked] of [
    ['src/main.ts', './core/deck/parse.ts', true],
    ['tools/example.mjs', '../src/core/study/fsrs.ts', true],
    ['tests/example.test.ts', '../src/core/deck/types.ts', true],
    ['src/main.ts', './core/files.ts', false],
    ['src/main.ts', './core/deck/index.ts', false],
    ['src/core/study/fsrs.ts', 'ts-fsrs', false],
  ] as const) {
    const [result] = await lint.lintText(`import '${name}';`, { filePath: path });
    assert.equal(result.messages.some(m => m.ruleId === 'no-restricted-imports'), blocked, path + ': ' + name);
  }
  const [utc] = await lint.lintText('new Date().getUTCDate(); new Date().getTimezoneOffset();', { filePath: 'src/core/files.ts' });
  assert.deepEqual(utc.messages, []);
});

const loadForms = (name: string) => [
  "import '" + name + "';", "export * from '" + name + "';",
  "void import('" + name + "');", "require('" + name + "');",
];
const isBoundary = (message: { ruleId: string | null }) => message.ruleId === 'no-restricted-imports' || message.ruleId === 'essence/module-boundaries';
/** D-148：src/ 一律不准 require（不管載入的是什麼），其他寫法照各自的邊界。 */
const expected = (path: string, code: string, blocked: boolean): boolean => blocked || (path.startsWith('src/') && code.startsWith('require('));
for (const [name, path, dependency] of [
  ['核心不能載入 React', 'src/core/files.ts', 'react'],
  ['入口不能載入核心內部', 'src/main.ts', './core/study/fsrs.ts'],
  ['工具不能直接載入 ts-fsrs', 'tools/example.mjs', 'ts-fsrs'],
] as const) void test('L2-4 ' + name + '，涵蓋 import、export、動態 import 與 require', async () => {
  const lint = new ESLint({ overrideConfig: syntaxOnly });
  for (const code of loadForms(dependency)) {
    const [result] = await lint.lintText(code, { filePath: path });
    assert.ok(result.messages.some(isBoundary), path + ': ' + code);
  }
});

void test('L2-4 三個目錄都受邊界規則保護，公開入口與 FSRS 包裝例外仍可使用', async () => {
  const lint = new ESLint({ overrideConfig: syntaxOnly });
  for (const [path, name, blocked] of [
    ['src/core/files.ts', 'node:fs', true], ['src/core/files.ts', 'fs/promises', true],
    ['src/core/files.ts', 'obsidian', true], ['src/core/files.ts', 'motion/react', true],
    ['src/core/files.ts', 'react-dom/client', true], ['src/core/files.ts', 'react/jsx-runtime', true],
    ['src/core/study/fsrs.ts', 'react', true],
    ['src/core/study/entries.ts', 'ts-fsrs', true], ['src/main.ts', 'ts-fsrs', true],
    ['tests/example.test.ts', 'ts-fsrs', true],
    ['tools/nested/example.mjs', 'ts-fsrs', true], ['tests/nested/example.mjs', 'ts-fsrs', true],
    ['tools/example.mjs', '../src/core/study/log.ts', true],
    ['tests/example.test.ts', '../src/core/deck/types.ts', true],
    ['src/core/study/fsrs.ts', 'ts-fsrs', false],
    ['src/main.ts', './core/files.ts', false], ['src/main.ts', './core/study/index.ts', false],
    ['tools/example.mjs', '../src/core/study/index.ts', false],
    ['tests/example.test.ts', '../src/core/deck/index.ts', false],
  ] as const) for (const code of loadForms(name)) {
    const [result] = await lint.lintText(code, { filePath: path });
    assert.equal(result.messages.some(isBoundary), expected(path, code, blocked), path + ': ' + code);
  }
  for (const [path, blocked] of [['src/core/study/types.ts', true], ['tests/example.test.ts', true], ['src/core/study/fsrs.ts', false]] as const) {
    const [result] = await lint.lintText("export type External = import('ts-fsrs').FSRS;", { filePath: path });
    assert.equal(result.messages.some(isBoundary), blocked, path);
  }
});

void test('W4 核心模組之間只能 import 對方的 index.ts，deck 不能依賴 study，study 從 deck 只拿型別', async () => {
  const lint = new ESLint({ overrideConfig: syntaxOnly });
  for (const [path, code, blocked] of [
    ['src/core/study/plan.ts', "import type { Deck } from '../deck/index.ts';", false],
    ['src/core/study/plan.ts', "export type { Deck } from '../deck/index.ts';", false],
    ['src/core/study/plan.ts', "export type Deck = import('../deck/index.ts').Deck;", false],
    ['src/core/study/plan.ts', "import type { Files } from '../files.ts';", false],
    ['src/core/study/plan.ts', "import { review } from './fsrs.ts';", false],
    ['src/core/study/plan.ts', "import type { Deck } from '../deck/types.ts';", true],
    ['src/core/study/plan.ts', "import '../deck/parse.ts';", true],
    ['src/core/study/plan.ts', "import { parseDeck } from '../deck/index.ts';", true],
    ['src/core/study/plan.ts', "import { type Deck } from '../deck/index.ts';", true],
    ['src/core/study/plan.ts', "export * from '../deck/index.ts';", true],
    ['src/core/study/plan.ts', "void import('../deck/index.ts');", true],
    ['src/core/study/plan.ts', "require('../deck/index.ts');", true],
    ['src/core/deck/parse.ts', "import type { Memory } from '../study/index.ts';", true],
    ['src/core/deck/parse.ts', "export type Memory = import('../study/index.ts').Memory;", true],
    ['src/core/deck/parse.ts', "void import('../study/index.ts');", true],
    ['src/core/deck/parse.ts', "require('../study/time.ts');", true],
    ['src/core/deck/parse.ts', "import { linesOf } from './markdown.ts';", false],
    ['src/core/future/x.ts', "import { planToday } from '../study/index.ts';", false],
    ['src/core/future/x.ts', "import { planToday } from '../study/plan.ts';", true],
    ['src/core/future/x.ts', "export { dayOf } from '../study/time.ts';", true],
  ] as const) {
    const [result] = await lint.lintText(code, { filePath: path });
    assert.equal(result.messages.some(isBoundary), expected(path, code, blocked), path + ': ' + code);
  }
});

void test('W5 state 與 dev 不能 import Obsidian、畫面或 Node；核心不能 import 核心以外的 src', async () => {
  const lint = new ESLint({ overrideConfig: syntaxOnly });
  for (const [path, code, blocked] of [
    ['src/state/index.ts', "import { Notice } from 'obsidian';", true],
    ['src/state/index.ts', "void import('obsidian');", true],
    ['src/state/index.ts', "import 'react';", true],
    ['src/dev/compare.ts', "import { readFile } from 'node:fs/promises';", true],
    ['src/dev/compare.ts', "require('fs');", true],
    ['src/dev/compare.ts', "import '../core/deck/parse.ts';", true],
    ['src/dev/compare.ts', "import { parseDeck } from '../core/deck/index.ts';", false],
    ['src/state/index.ts', "import type { Files } from '../core/files.ts';", false],
    ['src/state/index.ts', "import { x } from '../dev/compare.ts';", false],
    ['src/core/study/plan.ts', "import { createState } from '../../state/index.ts';", true],
    ['src/core/study/plan.ts', "export * from '../../dev/compare.ts';", true],
    ['src/core/study/plan.ts', "void import('../../main.ts');", true],
    ['src/core/files.ts', "import type { State } from '../state/index.ts';", true],
    ['src/core/files.ts', "import type { Deck } from './deck/index.ts';", false],
    ['src/obsidian/files.ts', "import { Notice } from 'obsidian';", false],
    // W5 §8-7 I10：CodeMirror 只能在 src/obsidian/ 與 main.ts。
    ['src/core/deck/parse.ts', "import { EditorState } from '@codemirror/state';", true],
    ['src/core/deck/parse.ts', "import type { Extension } from '@codemirror/state';", true],
    ['src/core/study/plan.ts', "void import('@codemirror/view');", true],
    ['src/state/index.ts', "import { EditorView } from '@codemirror/view';", true],
    ['src/dev/compare.ts', "require('@codemirror/state');", true],
    ['src/obsidian/lock.ts', "import { EditorState } from '@codemirror/state';", false],
  ] as const) {
    const [result] = await lint.lintText(code, { filePath: path });
    assert.equal(result.messages.some(isBoundary), expected(path, code, blocked), path + ': ' + code);
  }
});

// 技術債 A7：state 和核心一樣只能透過 index.ts 使用（state 裡面互相 import 照舊）。
// 第一個里程碑回顧的 R1：tests/node-files.test.ts 換掉全域的 fs.readdirSync，Linux 上 Node 自己的遞迴監看也被換掉，CI 紅了三天。
void test('R1 測試不能改全域的 Node 內建模組：syncBuiltinESMExports 與指定 fs 的成員都擋，呼叫照常', async () => {
  const lint = new ESLint({ overrideConfig: syntaxOnly });
  for (const [code, rule] of [
    ["import { syncBuiltinESMExports } from 'node:module';\nsyncBuiltinESMExports();", 'no-restricted-imports'],
    ["import fs from 'node:fs';\nfs.readdirSync = () => [];", 'no-restricted-syntax'],
    ["import * as path from 'node:path';\npath.join = () => '';", 'no-restricted-syntax'],
    ["import fs from 'node:fs';\nconsole.log(fs.readdirSync('.'));", null],
    ["import { createRequire } from 'node:module';\nconsole.log(createRequire);", null],
  ] as const) {
    const [result] = await lint.lintText(code, { filePath: 'tests/example.test.ts' });
    const rules = result.messages.map(message => message.ruleId);
    assert.deepEqual(rules, rule === null ? [] : [rule], code);
  }
});

void test('A7 src/state/ 只能透過 index.ts 使用，涵蓋 import、export、動態 import 與 require', async () => {
  const lint = new ESLint({ overrideConfig: syntaxOnly });
  for (const [path, name, blocked] of [
    ['src/main.ts', './state/ids.ts', true],
    ['src/main.ts', './state/device.ts', true],
    ['src/obsidian/device.ts', '../state/device.ts', true],
    ['src/dev/compare.ts', '../state/ids.ts', true],
    ['tests/example.test.ts', '../src/state/device.ts', true],
    ['tools/example.mjs', '../src/state/ids.ts', true],
    ['src/main.ts', './state/index.ts', false],
    ['src/obsidian/device.ts', '../state/index.ts', false],
    ['tests/example.test.ts', '../src/state/index.ts', false],
    ['src/state/index.ts', './ids.ts', false],
    ['src/state/ids.ts', './device.ts', false],
  ] as const) for (const code of loadForms(name)) {
    const [result] = await lint.lintText(code, { filePath: path });
    assert.equal(result.messages.some(isBoundary), expected(path, code, blocked), path + ': ' + code);
  }
});

// W6 限制第 3 點：review 和 state 一樣純；ui 與 review 只透過 state 拿資料，不碰檔案存取、排程與寫紀錄的函式。
void test('W6 src/review/ 不能依賴畫面、Obsidian 或 Node；ui 與 review 不能 import 讀檔、排程、寫紀錄的函式', async () => {
  const lint = new ESLint({ overrideConfig: syntaxOnly });
  for (const [path, code, blocked] of [
    ['src/review/index.ts', "import { useState } from 'react';", true],
    ['src/review/index.ts', "import { Notice } from 'obsidian';", true],
    ['src/review/index.ts', "import { animate } from 'motion';", true],
    ['src/review/index.ts', "import { readFile } from 'node:fs/promises';", true],
    ['src/review/index.ts', "void import('react-dom/client');", true],
    ['src/review/index.ts', "import type { Files } from '../core/files.ts';", true],
    ['src/review/index.ts', "import { planToday } from '../core/study/index.ts';", true],
    ['src/review/index.ts', "import { nextCard, progress } from '../core/study/index.ts';", true],
    ['src/review/index.ts', "import { readDecks } from '../core/deck/index.ts';", true],
    ['src/review/index.ts', "import { parseDeck } from '../core/deck/index.ts';", true],
    ['src/review/index.ts', "import { checkTyped, dayStart, dayOf } from '../core/study/index.ts';", false],
    ['src/review/index.ts', "import { baseForm } from '../core/deck/index.ts';", false],
    ['src/review/index.ts', "import type { Card, Pick } from '../core/study/index.ts';", false],
    ['src/review/index.ts', "import type { State } from '../state/index.ts';", false],
    ['src/review/index.ts', "import { x } from '../state/ids.ts';", true],
    // tasks/state-split.md §3：拆出來的讀取層與寫入一樣只能在 state 裡用。
    ['src/review/index.ts', "import { x } from '../state/reads.ts';", true],
    ['src/review/index.ts', "import { x } from '../state/writes.ts';", true],
    ['src/state/index.ts', "import { createReads } from './reads.ts';", false],
    ['src/ui/Review.tsx', "import type { Files } from '../core/files.ts';", true],
    ['src/ui/Review.tsx', "void import('../core/files.ts');", true],
    ['src/ui/Review.tsx', "import { appendLine, createLogWriter, mergeHistory, readHistory, replay, review } from '../core/study/index.ts';", true],
    ['src/ui/Review.tsx', "import { type Card, nextCard } from '../core/study/index.ts';", true],
    ['src/ui/Review.tsx', "import { checkTyped } from '../core/study/index.ts';", false],
    ['src/ui/Review.tsx', "import type { Prompt } from '../core/deck/index.ts';", false],
    ['src/ui/Review.tsx', "import { MarkdownRenderer } from 'obsidian';", false],
    ['src/ui/Review.tsx', "import { useState } from 'react';", false],
    ['src/ui/Review.tsx', "import { animate } from 'motion';", false],
    ['src/ui/Review.tsx', "import { createSession } from '../review/index.ts';", false],
    ['src/ui/nested/Card.tsx', "import { planToday } from '../../core/study/index.ts';", true],
    ['src/ui/nested/Card.tsx', "import '../../core/files.ts';", true],
    // 這些函式在其他地方照舊可以用。
    ['src/main.ts', "import { planToday } from './core/study/index.ts';", false],
    ['src/state/index.ts', "import { planToday } from '../core/study/index.ts';", false],
  ] as const) {
    const [result] = await lint.lintText(code, { filePath: path });
    assert.equal(result.messages.some(isBoundary), expected(path, code, blocked), path + ': ' + code);
  }
});

// D-148 第 3 點與技術債「D-148 的檢查會漏掉別的 require 寫法」：整個 src/ 禁用 Node 與 Electron，只有 src/desktop/ 能用明列的；
// require 的各種寫法都擋（開發命令 src/obsidian/dev*.ts 是放行清單，正式建置不含它們）；src/desktop/ 只能由 main.ts 動態載入；
// @codemirror 只有 src/obsidian/ 與 main.ts。
// 第二次里程碑檢查 R8：依賴方向是 ui → review → state，ui 拿備份、AI、設定的動作由 main.ts 交進來；deck、study 不知道 AI 與備份。
void test('R8 state、review 不能 import ui；deck、study 不能 import ai、backup；ui 從 backup、ai、settings 只拿型別', async () => {
  const lint = new ESLint({ overrideConfig: syntaxOnly });
  const toUi = /state 與 review 不能 import 畫面/;
  const toAi = /不能 import (ai|backup)。/;
  const runtime = /ui 從 core 的 backup、ai、settings 只能 import 型別/;
  for (const [path, code, message] of [
    ['src/state/index.ts', "import { x } from '../ui/prefs.ts';", toUi],
    ['src/state/reads.ts', "import type { X } from '../ui/Review.tsx';", toUi],
    ['src/review/session.ts', "void import('../ui/index.ts');", toUi],
    ['src/review/session.ts', "export { x } from '../ui/speech.ts';", toUi],
    ['src/review/nested/a.ts', "import '../../ui/screen.tsx';", toUi],
    ['src/review/session.ts', "type T = import('../ui/index.ts').T;", toUi],
    ['src/core/deck/parse.ts', "import { x } from '../ai/index.ts';", toAi],
    ['src/core/deck/parse.ts', "import type { X } from '../backup/index.ts';", toAi],
    ['src/core/study/plan.ts', "void import('../ai/index.ts');", toAi],
    ['src/core/study/plan.ts', "export * from '../backup/index.ts';", toAi],
    ['src/ui/Entry.tsx', "import { takeBackup } from '../core/backup/index.ts';", runtime],
    ['src/ui/Entry.tsx', "import { type Settings, readSettings } from '../core/settings/index.ts';", runtime],
    // 只有行內 type 的 import 編譯後還會留下載入那個檔（同 W4 study 從 deck 只拿型別）。
    ['src/ui/Entry.tsx', "import { type Settings } from '../core/settings/index.ts';", runtime],
    ['src/ui/Entry.tsx', "import '../core/backup/index.ts';", runtime],
    ['src/ui/Entry.tsx', "export { x } from '../core/ai/index.ts';", runtime],
    ['src/ui/nested/a.tsx', "void import('../../core/ai/index.ts');", runtime],
    // 不誤擋：反方向、別的模組、型別、不在範圍的資料夾。
    ['src/ui/Review.tsx', "import { createSession } from '../review/index.ts';", null],
    ['src/ui/Review.tsx', "import type { State } from '../state/index.ts';", null],
    ['src/main.ts', "import { x } from './ui/index.ts';", null],
    ['src/obsidian/view.ts', "import { x } from '../ui/index.ts';", null],
    ['src/state/index.ts', "import { x } from './ui-helpers.ts';", null],
    ['src/state/index.ts', "import { x } from '../core/ai/index.ts';", null],
    ['src/core/deck/parse.ts', "import { x } from '../errors/index.ts';", null],
    ['src/core/ai/cards.ts', "import type { Deck } from '../deck/index.ts';", null],
    ['src/ui/Entry.tsx', "import type { Settings } from '../core/settings/index.ts';", null],
    ['src/ui/Entry.tsx', "export type { Settings } from '../core/settings/index.ts';", null],
    ['src/ui/Entry.tsx', "type S = import('../core/backup/index.ts').Result;", null],
    ['src/ui/Entry.tsx', "import { checkTyped } from '../core/study/index.ts';", null],
    ['src/ui/Entry.tsx', "import { x } from '../core/errors/index.ts';", null],
    ['src/obsidian/settings-tab.ts', "import { readSettings } from '../core/settings/index.ts';", null],
    ['src/main.ts', "import { takeBackup } from './core/backup/index.ts';", null],
  ] as const) {
    const [result] = await lint.lintText(code, { filePath: path });
    const found = result.messages.filter(isBoundary);
    if (message) assert.ok(found.some(m => message.test(m.message)), path + ': ' + code + ' → ' + JSON.stringify(found.map(m => m.message)));
    else assert.deepEqual(found, [], path + ': ' + code);
  }
});

void test('D-148 Node 與 Electron 只在 src/desktop/，require 的各種寫法都擋，src/desktop/ 只能由 main.ts 動態載入', async () => {
  const lint = new ESLint({ overrideConfig: syntaxOnly });
  const cases: [string, string, boolean][] = [
    ['src/ui/a.ts', "import { readFile } from 'node:fs/promises';", true],
    ['src/obsidian/a.ts', "import 'fs';", true],
    ['src/obsidian/a.ts', "void import('electron');", true],
    ['src/main.ts', "import { shell } from 'electron';", true],
    ['src/desktop/a.ts', "import { readFile } from 'node:fs/promises';", false],
    ['src/desktop/a.ts', "import { shell } from 'electron';", false],
    ['src/desktop/a.ts', "import { exec } from 'node:child_process';", true],
    ['src/desktop/a.ts', "import { readFile } from 'fs/promises';", true],
    ['src/obsidian/a.ts', "require('fs');", true],
    ['src/obsidian/a.ts', "const load = require; load('fs');", true],
    ['src/obsidian/a.ts', "(window as unknown as { require(name: string): unknown }).require('fs');", true],
    ['src/obsidian/a.ts', "(globalThis as Record<string, (name: string) => unknown>)['require']('fs');", true],
    ['src/obsidian/a.ts', "(globalThis as Record<string, (name: string) => unknown>)[`require`]('fs');", true],
    ['src/obsidian/a.ts', "declare const module: { require(name: string): unknown }; module.require('fs');", true],
    ['src/obsidian/a.ts', "require.call(null, 'fs');", true],
    // Codex L2 B5：解構取出載入器（識別字、字串、樣板字串、簡寫、解構賦值）與 Reflect.get 也擋。
    ['src/obsidian/a.ts', "const { require: load } = window as unknown as { require(name: string): unknown }; load('fs');", true],
    ['src/obsidian/a.ts', "const { 'require': load } = window as unknown as { require(name: string): unknown }; load('fs');", true],
    ['src/obsidian/a.ts', "const { [`require`]: load } = window as unknown as { require(name: string): unknown }; load('fs');", true],
    ['src/obsidian/a.ts', "const { require } = window as unknown as { require(name: string): unknown }; require('fs');", true],
    ['src/obsidian/a.ts', "let load: unknown; ({ require: load } = window as unknown as { require: unknown }); void load;", true],
    ['src/obsidian/a.ts', "const load = Reflect.get(window, 'require') as (name: string) => unknown; load('fs');", true],
    ['src/obsidian/a.ts', "type T = 'require'; const a: T[] = []; void a;", false],
    // Codex 再審 C2：普通的字串資料不是取出載入器，不擋。
    ['src/obsidian/a.ts', "export const text = 'require';", false],
    ['src/obsidian/a.ts', "export const labels = ['require'];", false],
    ['src/obsidian/a.ts', "export const text = `require`;", false],
    ['src/desktop/a.ts', "const fs = require('node:fs/promises');", true],
    ['src/obsidian/dev-x.ts', "const load = (window as unknown as { require?: (name: string) => unknown }).require;", false],
    ['src/obsidian/a.ts', "const o = { require: 1 }; type T = { require: () => void }; interface U { require(): void }", false],
    ['src/main.ts', "void import('./desktop/index.ts');", false],
    ['src/main.ts', "import { createDesktop } from './desktop/index.ts';", true],
    ['src/obsidian/a.ts', "void import('../desktop/index.ts');", true],
    ['src/obsidian/a.ts', "import { createDesktop } from '../desktop/index.ts';", true],
    ['src/obsidian/a.ts', "import type { Desktop } from '../desktop/index.ts';", false],
    ['src/desktop/a.ts', "import { x } from './io.ts';", false],
    ['src/ui/a.ts', "import { EditorState } from '@codemirror/state';", true],
    ['src/obsidian/a.ts', "import { EditorState } from '@codemirror/state';", false],
    ['tools/a.ts', "import { readFile } from 'node:fs/promises'; require('fs');", false],
  ];
  for (const [path, code, blocked] of cases) {
    const [result] = await lint.lintText(code, { filePath: path });
    assert.equal(result.messages.some(isBoundary), blocked, path + ': ' + code + ' ' + JSON.stringify(result.messages.map(message => message.message)));
  }
});

// tasks/error-log.md §2-4：產品程式的錯要交給錯誤紀錄（D-155 第 2 點）；只有先印 console 再交出錯誤的幾個檔、開發命令可以用 console。
void test('§2-4 src/ 開 no-console：新加的 console.log 報錯；main.ts、Markdown.tsx、開發命令放行；tools 與 tests 不管', async () => {
  const lint = new ESLint({ overrideConfig: syntaxOnly });
  for (const [path, blocked] of [
    ['src/core/errors/log.ts', true],
    ['src/state/index.ts', true],
    ['src/ui/Review.tsx', true],
    ['src/ui/host.tsx', true],
    ['src/obsidian/save.ts', true],
    ['src/main.ts', false],
    ['src/ui/Markdown.tsx', false],
    ['src/obsidian/dev.ts', false],
    ['src/obsidian/dev-review.ts', false],
    ['src/dev/compare.ts', false],
    ['tools/example.ts', false],
    ['tests/example.test.ts', false],
  ] as const) {
    const [result] = await lint.lintText("console.log('x');\nconsole.error('y');", { filePath: path });
    const found = result.messages.filter(message => message.ruleId === 'no-console').length;
    assert.equal(found, blocked ? 2 : 0, path);
  }
});

void test('D-220 Obsidian 官方審查會算錯誤的寫法在 src/ 擋下，註解關不掉；開發版專用的檔不查', async () => {
  const lint = new ESLint({ overrideConfig: syntaxOnly });
  const rulesAt = async (code: string, filePath: string) => (await lint.lintText(code, { filePath }))[0].messages.map(m => m.ruleId);
  for (const [code, rule] of [
    ['export const a = /(?<=a)b/;', 'obsidianmd/regex-lookbehind'],
    ['document.head.appendChild(document.createElement("style"));', 'obsidianmd/no-forbidden-elements'],
    ['export function f(el: HTMLElement, text: string): void { el.innerHTML = text; }', 'no-unsanitized/property'],
    ['export function f(el: HTMLElement): void { el.style.color = "red"; }', 'obsidianmd/no-static-styles-assignment'],
    ['// eslint-disable-next-line obsidianmd/regex-lookbehind -- 測試\nexport const a = /(?<=a)b/;', 'eslint-comments/no-restricted-disable'],
  ] as const) {
    assert.ok((await rulesAt(code, 'src/obsidian/save.ts')).includes(rule), code);
    assert.ok(!(await rulesAt(code, 'src/obsidian/dev-markup.ts')).includes(rule), 'dev-markup.ts: ' + code);
  }
});
