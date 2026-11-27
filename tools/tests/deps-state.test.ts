// tools/deps-state.ts：commit 檢查前先看套件和鎖檔對不對得上（優化 Essence 開發流程第 1 步）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { depsState } from '../deps-state.ts';

type Packages = Record<string, Record<string, unknown>>;

/** 造一個資料夾：鎖檔要的（want）與 npm 裝完記下的（have）；have 是 undefined 時不寫 node_modules。 */
function folder(t: test.TestContext, want: Packages | string, have?: Packages | string | null): string {
  const dir = mkdtempSync(join(tmpdir(), 'essence-deps-state-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const text = (value: Packages | string) => (typeof value === 'string' ? value : JSON.stringify({ lockfileVersion: 3, packages: value }));
  writeFileSync(join(dir, 'package-lock.json'), typeof want === 'string' ? want : text({ '': { name: 'x' }, ...want }));
  if (have === undefined) return dir;
  mkdirSync(join(dir, 'node_modules'));
  if (have !== null) writeFileSync(join(dir, 'node_modules/.package-lock.json'), text(have));
  return dir;
}

const lock: Packages = {
  'node_modules/a': { version: '1.0.0' },
  'node_modules/@s/b': { version: '2.0.0', dev: true },
  'node_modules/a/node_modules/c': { version: '3.0.0' },
};

void test('第 1 步：沒有 node_modules 是沒裝；npm 沒留紀錄時不猜，當成對得上', t => {
  assert.deepEqual(depsState(folder(t, lock)), { state: 'missing' });
  assert.deepEqual(depsState(folder(t, lock, null)), { state: 'ok' });
});

void test('第 1 步：每個套件的版本都對得上才算裝好；巢狀的也比', t => {
  assert.deepEqual(depsState(folder(t, lock, lock)), { state: 'ok' });
  const nested = { ...lock, 'node_modules/a/node_modules/c': { version: '3.1.0' } };
  assert.deepEqual(depsState(folder(t, lock, nested)), { state: 'stale', detail: 'c 裝的是 3.1.0，鎖檔要 3.0.0' });
});

void test('第 1 步：鎖檔新加的套件沒裝就擋，說出套件名稱與不符的個數', t => {
  const added = { ...lock, 'node_modules/@secretlint/secretlint-rule-pattern': { version: '1.0.0', dev: true } };
  assert.deepEqual(depsState(folder(t, added, lock)), { state: 'stale', detail: '@secretlint/secretlint-rule-pattern 沒裝' });
  const two = { ...added, 'node_modules/a': { version: '1.1.0' } };
  const result = depsState(folder(t, two, lock));
  assert.equal(result.state, 'stale');
  assert.match(result.state === 'stale' ? result.detail : '', /，共 2 個不符$/);
});

void test('第 1 步：選用的、限定作業系統或 CPU 的套件沒裝不算錯；連結的工作區不比', t => {
  const extra = {
    ...lock,
    'node_modules/@esbuild/win32-x64': { version: '0.1.0', optional: true, os: ['win32'], cpu: ['x64'] },
    'node_modules/fsevents': { version: '2.0.0', devOptional: true },
    'node_modules/glibc-only': { version: '1.0.0', libc: ['glibc'] },
    'node_modules/local': { resolved: '../local', link: true },
  };
  assert.deepEqual(depsState(folder(t, extra, lock)), { state: 'ok' });
  // 有裝的選用套件版本不對，照樣算不符。
  const wrongOptional = { ...lock, 'node_modules/@esbuild/win32-x64': { version: '0.2.0' } };
  assert.equal(depsState(folder(t, extra, wrongOptional)).state, 'stale');
});

void test('第 1 步：鎖檔讀不懂時不擋，交給檢查本身回報', t => {
  assert.deepEqual(depsState(folder(t, '{ 壞掉', lock)), { state: 'ok' });
  assert.deepEqual(depsState(folder(t, lock, '{ 壞掉')), { state: 'ok' });
});

void test('第 1 步：鎖檔和 node_modules 可以在不同資料夾（commit 檢查讀副本的鎖檔、借工作樹的套件）', t => {
  const staged = folder(t, { ...lock, 'node_modules/new': { version: '1.0.0' } });
  const tree = folder(t, lock, lock);
  assert.deepEqual(depsState(staged, tree), { state: 'stale', detail: 'new 沒裝' });
  assert.deepEqual(depsState(tree, tree), { state: 'ok' });
});
