// 比較測試工具的剪貼簿（探針 P9 借用、paste 讀）：用假的 PowerShell 代替 Windows 的剪貼簿。
// 2026-11-25 使用者電腦：原本的剪貼簿很長，探針放回去時命令列太長、開不起來，原本的內容沒了。
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { borrowClipboard, readClipboard, writeClipboard, type PowerShell } from '../tools/rule-test/clipboard.ts';
import type { RunResult } from '../tools/rule-test/proc.ts';

/** 假的剪貼簿：Windows 命令列上限約 32,767 字，超過就開不起來（和 spawn ENAMETOOLONG 一樣）。 */
function fakeClipboard(start: string, options: { formats?: string[]; failWrites?: boolean } = {}) {
  const state = { text: start, commands: [] as string[] };
  const ok = (stdout = ''): RunResult => ({ code: 0, stdout, stderr: '', timedOut: false, ms: 1 });
  const ps: PowerShell = command => {
    state.commands.push(command);
    if (command.length > 32_767) return Promise.resolve({ code: null, stdout: '', stderr: '', timedOut: false, error: 'spawn ENAMETOOLONG', ms: 1 });
    return Promise.resolve(ok());
  };
  const run: PowerShell = async (command, input) => {
    const started = await ps(command);
    if (started.error) return started;
    if (command.includes('GetFormats')) return ok(`${(options.formats ?? ['System.String', 'UnicodeText', 'Text']).join('\r\n')}\r\n`);
    if (command.includes('Clear()')) { state.text = ''; return ok(); }
    if (command.includes('Set-Clipboard')) {
      if (options.failWrites && state.text !== start) return { code: 1, stdout: '', stderr: '寫不進去', timedOut: false, ms: 1 };
      state.text = Buffer.from((input ?? '').trim(), 'base64').toString('utf8');
      return ok();
    }
    if (command.includes('Get-Clipboard')) return ok(`${Buffer.from(state.text, 'utf8').toString('base64')}\r\n`);
    throw Error(`沒想到的命令：${command}`);
  };
  return { state, run };
}

const SAMPLE = '繁體中文：鬱龜龘\n第二行 ABC';

void test('borrowClipboard：原本的剪貼簿很長也放得回去（內容經 stdin，命令列不隨內容變長）', async () => {
  const long = `${'很長的筆記，'.repeat(40_000)}\n最後一行`;
  const { state, run } = fakeClipboard(long);
  const back = await borrowClipboard(async () => { await writeClipboard(SAMPLE, run); return readClipboard(run); }, join(mkdtempSync(join(tmpdir(), 'clip-')), '原本.txt'), run);
  assert.equal(back, SAMPLE);
  assert.equal(state.text, long);
  assert.ok(state.commands.every(command => command.length < 1_000), '命令列不能帶剪貼簿的內容');
});

void test('borrowClipboard：中間出錯也放回去，錯照樣丟出來', async () => {
  const { state, run } = fakeClipboard('原本的內容');
  await assert.rejects(borrowClipboard(async () => { await writeClipboard(SAMPLE, run); throw Error('測到一半壞了'); }, join(tmpdir(), '不會用到.txt'), run), /測到一半壞了/);
  assert.equal(state.text, '原本的內容');
});

void test('borrowClipboard：原本是空的就清空', async () => {
  const { state, run } = fakeClipboard('');
  await borrowClipboard(() => writeClipboard(SAMPLE, run), join(tmpdir(), '不會用到.txt'), run);
  assert.equal(state.text, '');
});

void test('borrowClipboard：放不回去時把原本的內容存進備份檔，錯誤說檔在哪裡', async () => {
  const backup = join(mkdtempSync(join(tmpdir(), 'clip-')), '剪貼簿原本的內容.txt');
  const { run } = fakeClipboard('原本的內容', { failWrites: true });
  await assert.rejects(borrowClipboard(() => writeClipboard(SAMPLE, run), backup, run), error => error instanceof Error && error.message.includes(backup));
  assert.equal(readFileSync(backup, 'utf8'), '原本的內容');
});

void test('borrowClipboard：有純文字以外的東西（圖片、網頁格式）就不借，剪貼簿不動', async () => {
  const backup = join(mkdtempSync(join(tmpdir(), 'clip-')), '剪貼簿原本的內容.txt');
  const { state, run } = fakeClipboard('網頁複製的字', { formats: ['HTML Format', 'System.String', 'UnicodeText', 'Text'] });
  let used = false;
  await assert.rejects(borrowClipboard(async () => { used = true; await writeClipboard(SAMPLE, run); }, backup, run), /HTML Format/);
  assert.equal(used, false);
  assert.equal(state.text, '網頁複製的字');
  assert.equal(existsSync(backup), false);
});
