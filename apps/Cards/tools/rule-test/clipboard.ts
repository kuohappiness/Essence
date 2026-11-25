// 比較測試工具：Windows 的剪貼簿（paste 讀手貼的回覆；探針 P9 暫時借用）。
// 內容一律用 base64 經 stdout 讀、經 stdin 寫：避開主控台的編碼，也避開命令列的長度上限
// （2026-11-25 使用者電腦：原本的剪貼簿很長，探針把它塞進命令列放回去時開不起來，原本的內容沒了）。
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { runProcess, type RunResult } from './proc.ts';

/** 跑一段 PowerShell；input 從 stdin 給。 */
export type PowerShell = (command: string, input?: string) => Promise<RunResult>;

const powershell: PowerShell = (command, input) =>
  runProcess('powershell.exe', ['-NoProfile', '-Command', command], { cwd: tmpdir(), timeoutMs: 60_000, ...input === undefined ? {} : { input } });

const READ = '$t = Get-Clipboard -Raw; if ($null -eq $t) { "" } else { [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($t)) }';
const WRITE = 'Set-Clipboard -Value ([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String([Console]::In.ReadToEnd().Trim())))';
const CLEAR = 'Add-Type -AssemblyName System.Windows.Forms; [Windows.Forms.Clipboard]::Clear()';
const FORMATS = 'Add-Type -AssemblyName System.Windows.Forms; $d = [Windows.Forms.Clipboard]::GetDataObject(); if ($null -ne $d) { $d.GetFormats() -join [char]10 }';
/** 純文字會出現的格式；其他的（圖片、檔案、網頁與 RTF）借用後放不回去。 */
const TEXT_FORMATS = new Set(['System.String', 'UnicodeText', 'Text', 'OEMText', 'Locale']);

const failed = (what: string, result: RunResult): Error =>
  Error(`${what}失敗：${(result.error ?? (result.timedOut ? '逾時' : result.stderr)).slice(0, 200)}`);
/** 比對時不管換行的寫法與最後一個換行。 */
const same = (a: string, b: string): boolean => a.replace(/\r\n/g, '\n').replace(/\n$/, '') === b.replace(/\r\n/g, '\n').replace(/\n$/, '');

export async function readClipboard(ps: PowerShell = powershell): Promise<string> {
  const result = await ps(READ);
  if (result.code !== 0) throw failed('讀剪貼簿', result);
  return Buffer.from(result.stdout.trim(), 'base64').toString('utf8');
}

export async function writeClipboard(text: string, ps: PowerShell = powershell): Promise<void> {
  const result = await ps(WRITE, Buffer.from(text, 'utf8').toString('base64'));
  if (result.code !== 0) throw failed('寫剪貼簿', result);
}

/** 放回原本的內容並讀回來核對；放不回去時把原本的內容存進 backup，不讓它消失。 */
async function restore(original: string, backup: string, ps: PowerShell): Promise<void> {
  try {
    if (original === '') {
      const result = await ps(CLEAR);
      if (result.code !== 0) throw failed('清空剪貼簿', result);
    } else await writeClipboard(original, ps);
    if (!same(await readClipboard(ps), original)) throw Error('讀回來和原本的不同');
  } catch (error) {
    writeFileSync(backup, original, { flag: 'wx' });
    throw Error(`剪貼簿沒有放回原本的內容（${error instanceof Error ? error.message : String(error)}）；原本的內容存在 ${backup}，請使用者自己複製回去，再刪掉這個檔`);
  }
}

/**
 * 暫時借用剪貼簿：剪貼簿裡有純文字以外的東西就不借；先讀出原本的內容，用完（出錯也一樣）放回去並核對。
 * backup 是放不回去時存原本內容的檔（還不存在的路徑）。
 */
export async function borrowClipboard<T>(use: () => Promise<T>, backup: string, ps: PowerShell = powershell): Promise<T> {
  const formats = await ps(FORMATS);
  if (formats.code !== 0) throw failed('看剪貼簿的格式', formats);
  const other = formats.stdout.split(/\r?\n/).map(each => each.trim()).filter(each => each && !TEXT_FORMATS.has(each));
  if (other.length) throw Error(`剪貼簿裡有純文字以外的東西（${other.join('、')}），借用後放不回去，所以沒有借；清空或複製一段純文字後再跑`);
  const original = await readClipboard(ps);
  try {
    return await use();
  } finally {
    await restore(original, backup, ps);
  }
}
