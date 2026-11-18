#!/usr/bin/env node
// 本機資料夾改名（D-208 第 7 點，任務說明 tasks/local-folder-rename.md）。一次性的工具。
// 改名時 Claude app、Codex、終端機與編輯器都要關掉（Windows 不讓改正在使用的資料夾），
// 所以從資料夾外面、在一般的終端機執行；腳本本身也要放在資料夾外面。
//
//   node rename-local-folder.mjs check    --repo <舊資料夾> --to <新資料夾>
//       只看不改：拍快照、列出改名前要先處理的事。
//   node rename-local-folder.mjs run      --repo <舊資料夾> --to <新資料夾> --out <紀錄資料夾>
//       快照 → 改名 → git worktree repair → 拿掉 worktree 寫死的 hooksPath → 複製 Claude 的記憶
//       → Codex 加新路徑的信任 → 核對。核對有一項不過就自動退回原名。
//   node rename-local-folder.mjs verify   --snapshot <快照.json> [--at <資料夾>]
//   node rename-local-folder.mjs rollback --snapshot <快照.json>
//
// 測試用：--claude-projects <資料夾>（預設 ~/.claude/projects）、--codex-config <檔>（預設 ~/.codex/config.toml）。
// 這兩個值記在快照裡，verify 與 rollback 沿用。
// 結束碼：0 成功；1 還不能改或核對沒過；2 資料夾被占用，什麼都沒改；3 退回也失敗，要人處理。
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const WIN = process.platform === 'win32';

export const norm = p => resolve(p);
const lower = s => (WIN ? s.toLowerCase() : s);
export const samePath = (a, b) => lower(norm(a)) === lower(norm(b));
export const isUnder = (p, root) => samePath(p, root) || lower(norm(p)).startsWith(lower(norm(root)) + sep);
export const mapPath = (p, from, to) => (isUnder(p, from) ? norm(to) + norm(p).slice(norm(from).length) : norm(p));
/** Claude 存記憶與對話紀錄的資料夾名稱：路徑裡英數字以外的字都換成 -。 */
export const projectKey = p => norm(p).replace(/[^a-zA-Z0-9]/g, '-');
const sha = buf => createHash('sha256').update(buf).digest('hex');

function git(cwd, ...args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true }).replace(/\r?\n$/, '');
}
function tryGit(cwd, ...args) {
  try { return git(cwd, ...args); } catch { return null; }
}
function sleep(ms) { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); }

// ---------- 快照 ----------

function listWorktrees(repo) {
  const out = git(repo, 'worktree', 'list', '--porcelain', '-z');
  const list = [];
  let cur = null;
  for (const field of out.split('\0')) {
    if (field.startsWith('worktree ')) { cur = { path: norm(field.slice(9)), head: null, branch: null, prunable: false }; list.push(cur); }
    else if (!cur) continue;
    else if (field.startsWith('HEAD ')) cur.head = field.slice(5);
    else if (field.startsWith('branch ')) cur.branch = field.slice(7);
    else if (field.startsWith('prunable')) cur.prunable = true;
  }
  return list;
}

function listRefs(repo) {
  const out = git(repo, 'for-each-ref', '--format=%(objectname) %(refname)');
  return Object.fromEntries(out.split('\n').filter(Boolean).map(l => { const i = l.indexOf(' '); return [l.slice(i + 1), l.slice(0, i)]; }));
}

/** 沒 commit 的修改與沒追蹤的檔（不含 .gitignore 擋掉的）。 */
function statusOf(dir) {
  return git(dir, 'status', '--porcelain=v1', '-z', '--untracked-files=all').split('\0').filter(Boolean).sort();
}

function walk(dir, base = dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, base, out);
    else if (e.isFile()) out.push(p);
  }
  return out;
}
/** 資料夾內容的摘要：檔數、總大小、每個檔的相對路徑與雜湊合起來的雜湊。 */
function folderDigest(dir) {
  if (!existsSync(dir)) return null;
  const files = walk(dir).map(f => ({ rel: relative(dir, f).split(sep).join('/'), buf: readFileSync(f) })).sort((a, b) => (a.rel < b.rel ? -1 : 1));
  return { files: files.length, bytes: files.reduce((s, f) => s + f.buf.length, 0), sha: sha(files.map(f => `${f.rel}\t${sha(f.buf)}`).join('\n')) };
}
const fileSha = f => (existsSync(f) ? sha(readFileSync(f)) : null);

function codexEntry(text, path) {
  if (text == null) return null;
  const lines = text.split(/\r?\n/);
  const header = `[projects.'${path}']`;
  const i = lines.findIndex(l => l.trim() === header);
  if (i < 0) return null;
  let end = i + 1;
  let trust = null;
  for (; end < lines.length && !lines[end].trim().startsWith('['); end++) {
    const m = lines[end].match(/^\s*trust_level\s*=\s*"([^"]*)"/);
    if (m) trust = m[1];
  }
  return { line: i, end, trust };
}

export function snapshot({ repo, to, claudeProjects, codexConfig }) {
  const from = norm(repo);
  to = norm(to);
  const commonDir = norm(git(from, 'rev-parse', '--path-format=absolute', '--git-common-dir'));
  const worktrees = listWorktrees(from).map(w => {
    const gone = !existsSync(w.path);
    const gitDir = gone ? null : norm(git(w.path, 'rev-parse', '--path-format=absolute', '--git-dir'));
    const configFile = gitDir ? join(gitDir, 'config.worktree') : null;
    return {
      ...w,
      gitDir,
      configFile,
      hooksOverride: configFile && existsSync(configFile) ? tryGit(from, 'config', '--file', configFile, '--get', 'core.hooksPath') : null,
      hooks: gone ? null : git(w.path, 'rev-parse', '--git-path', 'hooks'),
      status: gone ? null : statusOf(w.path),
    };
  });
  const refs = listRefs(from);
  const localOnly = Object.keys(refs).filter(r => r.startsWith('refs/heads/'))
    .map(r => ({ ref: r, count: Number(git(from, 'rev-list', '--count', r, '--not', '--remotes')) }))
    .filter(x => x.count > 0);
  const ignored = git(from, 'status', '--porcelain=v1', '-z', '--ignored=traditional', '--untracked-files=normal')
    .split('\0').filter(l => l.startsWith('!! ')).map(l => l.slice(3)).sort();
  const memoryDir = join(claudeProjects, projectKey(from), 'memory');
  const memory = existsSync(memoryDir)
    ? walk(memoryDir).map(f => ({ name: relative(memoryDir, f).split(sep).join('/'), sha: sha(readFileSync(f)) })).sort((a, b) => (a.name < b.name ? -1 : 1))
    : null;
  const codexText = existsSync(codexConfig) ? readFileSync(codexConfig, 'utf8') : null;
  const codex = codexEntry(codexText, from);
  return {
    takenAt: new Date().toISOString(),
    from, to, commonDir, claudeProjects: norm(claudeProjects), codexConfig: norm(codexConfig),
    worktrees, refs, localOnly, ignored,
    local: folderDigest(join(from, '.local')),
    settingsLocal: fileSha(join(from, '.claude', 'settings.local.json')),
    memoryKey: projectKey(from), memory,
    codexTrust: codex ? codex.trust : null,
  };
}

/** 改名前要先處理的事。block 擋住改名，note 只提醒。 */
export function readiness(s) {
  const rows = [];
  const block = (what, detail) => rows.push({ ok: false, block: true, what, detail });
  const note = (what, detail) => rows.push({ ok: true, block: false, what, detail });
  if (existsSync(s.to)) block('新資料夾', `已經有 ${s.to}，不能蓋過去`);
  if (isUnder(s.to, s.from) || isUnder(s.from, s.to)) block('新資料夾', '新舊資料夾不能一個在另一個裡面');
  if (isUnder(process.cwd(), s.from)) block('執行位置', `終端機現在在 ${process.cwd()}，請先 cd 到資料夾外面`);
  const self = fileURLToPath(import.meta.url);
  if (isUnder(self, s.from)) block('腳本位置', `腳本在要改名的資料夾裡（${self}），先複製到外面再執行`);
  for (const w of s.worktrees) {
    if (w.prunable || !w.gitDir) block('worktree', `${w.path} 已經不存在，先 git worktree prune`);
    else if (w.status.length) block('沒 commit 的修改', `${w.path}：${w.status.length} 項（${w.status.slice(0, 3).join('、')}${w.status.length > 3 ? '…' : ''}）`);
  }
  for (const x of s.localOnly) note('只在本機的 commit', `${x.ref.replace('refs/heads/', '')}：${x.count} 個（改名不會少，但沒有備份在 GitHub）`);
  if (s.worktrees.length > 1) note('worktree', `${s.worktrees.length - 1} 個，改名後用 git worktree repair 接回`);
  for (const w of s.worktrees) if (w.hooksOverride && isUnder(w.hooksOverride, s.from)) note('寫死的 hooksPath', `${w.path}：改名後拿掉，改用共用的 .githooks`);
  if (!s.memory) note('Claude 的記憶', `${join(s.claudeProjects, s.memoryKey, 'memory')} 不存在，沒有要複製的`);
  else note('Claude 的記憶', `${s.memory.length} 個檔，改名後複製到 ${projectKey(s.to)}`);
  if (s.codexTrust == null) note('Codex', '沒有這個資料夾的信任設定，不用改');
  else note('Codex', `信任設定（${s.codexTrust}）改名後加一份給新路徑`);
  return rows;
}

// ---------- 改名與退回 ----------

function renameWithRetry(from, to) {
  for (let i = 0; ; i++) {
    try { renameSync(from, to); return; } catch (e) {
      if (i >= 4 || !['EPERM', 'EBUSY', 'EACCES'].includes(e.code)) throw e;
      sleep(1000);
    }
  }
}

function addCodexEntry(s, path) {
  if (s.codexTrust == null || !existsSync(s.codexConfig)) return false;
  const text = readFileSync(s.codexConfig, 'utf8');
  if (codexEntry(text, path)) return false;
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const lines = text.split(/\r?\n/);
  const old = codexEntry(text, s.from);
  const at = old ? old.end : lines.length;
  const block = [`[projects.'${path}']`, `trust_level = "${s.codexTrust}"`];
  if (at > 0 && lines[at - 1].trim() !== '') block.unshift('');
  if (at < lines.length && lines[at].trim() !== '') block.push('');
  lines.splice(at, 0, ...block);
  writeFileSync(s.codexConfig, lines.join(eol));
  return true;
}

function removeCodexEntry(s, path) {
  if (!existsSync(s.codexConfig)) return false;
  const text = readFileSync(s.codexConfig, 'utf8');
  const e = codexEntry(text, path);
  if (!e) return false;
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const lines = text.split(/\r?\n/);
  let end = e.end;
  while (end > e.line + 1 && lines[end - 1].trim() === '') end--;
  if (end - e.line !== 2) return false; // 不是腳本加的那兩行，就不動
  const startBlank = e.line > 0 && lines[e.line - 1].trim() === '' ? 1 : 0;
  lines.splice(e.line - startBlank, end - e.line + startBlank);
  writeFileSync(s.codexConfig, lines.join(eol));
  return true;
}

function copyMemory(s, to) {
  if (!s.memory) return [];
  const src = join(s.claudeProjects, s.memoryKey, 'memory');
  const dst = join(s.claudeProjects, projectKey(to), 'memory');
  const conflicts = [];
  for (const f of s.memory) {
    const d = join(dst, ...f.name.split('/'));
    mkdirSync(join(d, '..'), { recursive: true });
    if (existsSync(d)) { if (sha(readFileSync(d)) !== f.sha) conflicts.push(f.name); continue; }
    copyFileSync(join(src, ...f.name.split('/')), d);
  }
  return conflicts;
}

/** 改名後的修補：worktree 接回、拿掉寫死的 hooksPath、記憶、Codex。回傳做了什麼。 */
function fixUp(s, log) {
  const linked = s.worktrees.slice(1).map(w => mapPath(w.path, s.from, s.to));
  if (linked.length) { git(s.to, 'worktree', 'repair', ...linked); log(`git worktree repair：${linked.length} 個`); }
  for (const w of s.worktrees) {
    if (!w.hooksOverride || !isUnder(w.hooksOverride, s.from)) continue;
    git(s.to, 'config', '--file', mapPath(w.configFile, s.from, s.to), '--unset', 'core.hooksPath');
    log(`拿掉寫死的 hooksPath：${mapPath(w.path, s.from, s.to)}`);
  }
  const conflicts = copyMemory(s, s.to);
  if (s.memory) log(`複製記憶：${s.memory.length} 個檔${conflicts.length ? `，${conflicts.length} 個新位置已有不同內容：${conflicts.join('、')}` : ''}`);
  const codexAdded = addCodexEntry(s, s.to);
  if (codexAdded) log('Codex：加了新路徑的信任設定');
  return { codexAdded };
}

export function rollback(s, log = console.log) {
  if (!existsSync(s.to) || existsSync(s.from)) throw new Error(`退回需要 ${s.to} 存在、${s.from} 不存在`);
  renameWithRetry(s.to, s.from);
  log(`改回 ${s.from}`);
  const linked = s.worktrees.slice(1).map(w => w.path);
  if (linked.length) git(s.from, 'worktree', 'repair', ...linked);
  for (const w of s.worktrees) {
    if (!w.hooksOverride || !isUnder(w.hooksOverride, s.from)) continue;
    git(s.from, 'config', '--file', w.configFile, 'core.hooksPath', w.hooksOverride);
  }
  if (removeCodexEntry(s, s.to)) log('Codex：拿掉新路徑的信任設定');
  return verify(s, s.from);
}

// ---------- 核對 ----------

/** 檔案內容有沒有完整的舊路徑（後面接分隔符號、引號、換行或結尾，不算「舊路徑 Backup」這種）。 */
function mentionsPath(text, p) {
  const forms = [p, p.split('\\').join('/')].map(f => f.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  return new RegExp(`(?:${forms.join('|')})(?=$|[\\\\/"'\\r\\n])`, WIN ? 'im' : 'm').test(text);
}

export function verify(s, at = s.to) {
  at = norm(at);
  const moved = !samePath(at, s.from);
  const rows = [];
  const row = (ok, what, detail = '') => rows.push({ ok, what, detail });
  row(existsSync(at) && (!moved || !existsSync(s.from)), '資料夾', moved ? `${at} 在、${s.from} 不在` : `${at} 在`);
  if (!existsSync(at)) return rows;

  const refs = listRefs(at);
  const changed = [...new Set([...Object.keys(refs), ...Object.keys(s.refs)])].filter(r => refs[r] !== s.refs[r]);
  row(!changed.length, '分支與 commit', changed.length ? `不同：${changed.slice(0, 5).join('、')}` : `${Object.keys(refs).length} 個 ref 都和快照相同`);

  const now = listWorktrees(at);
  const wtProblems = [];
  for (const w of s.worktrees) {
    const p = moved ? mapPath(w.path, s.from, at) : w.path;
    const cur = now.find(x => samePath(x.path, p));
    if (!cur) { wtProblems.push(`${p} 不在清單`); continue; }
    if (cur.prunable || !existsSync(p)) { wtProblems.push(`${p} 接不上`); continue; }
    if (cur.head !== w.head) wtProblems.push(`${p} 的 HEAD 變了`);
    if (statusOf(p).join('\n') !== (w.status || []).join('\n')) wtProblems.push(`${p} 的修改和快照不同`);
  }
  if (now.length !== s.worktrees.length) wtProblems.push(`數量 ${now.length}，快照是 ${s.worktrees.length}`);
  row(!wtProblems.length, 'worktree', wtProblems.length ? wtProblems.join('；') : `${s.worktrees.length} 個（含主資料夾）都接上，修改和快照相同`);

  const hookProblems = [];
  for (const w of s.worktrees) {
    const p = moved ? mapPath(w.path, s.from, at) : w.path;
    if (!existsSync(p)) continue;
    const hooks = resolve(p, git(p, 'rev-parse', '--git-path', 'hooks'));
    if (moved && isUnder(hooks, s.from)) hookProblems.push(`${p} 還指向舊資料夾`);
    else if (!existsSync(join(hooks, 'pre-commit'))) hookProblems.push(`${p}：${hooks} 沒有 pre-commit`);
  }
  row(!hookProblems.length, 'commit 前的檢查', hookProblems.length ? hookProblems.join('；') : '每個 worktree 都找得到 pre-commit');

  if (moved) {
    const commonDir = mapPath(s.commonDir, s.from, at);
    const files = [join(commonDir, 'config'), join(commonDir, 'config.worktree')];
    const wtAdmin = join(commonDir, 'worktrees');
    if (existsSync(wtAdmin)) for (const id of readdirSync(wtAdmin)) files.push(join(wtAdmin, id, 'gitdir'), join(wtAdmin, id, 'config.worktree'));
    for (const w of s.worktrees.slice(1)) files.push(join(mapPath(w.path, s.from, at), '.git'));
    const stale = files.filter(f => existsSync(f) && statSync(f).isFile() && mentionsPath(readFileSync(f, 'utf8'), s.from));
    row(!stale.length, 'git 設定裡的舊路徑', stale.length ? stale.join('、') : `${files.filter(existsSync).length} 個設定檔都沒有舊路徑`);
  }

  if (s.memory) {
    const dir = join(s.claudeProjects, projectKey(at), 'memory');
    const bad = s.memory.filter(f => fileSha(join(dir, ...f.name.split('/'))) !== f.sha).map(f => f.name);
    row(!bad.length, 'Claude 的記憶', bad.length ? `不同或缺少：${bad.join('、')}` : `${s.memory.length} 個檔，雜湊都和快照相同（${dir}）`);
  }

  const local = folderDigest(join(at, '.local'));
  row(JSON.stringify(local) === JSON.stringify(s.local), '.local', local ? `${local.files} 個檔、${local.bytes} bytes` : '沒有');
  row(fileSha(join(at, '.claude', 'settings.local.json')) === s.settingsLocal, '.claude/settings.local.json', s.settingsLocal ? '內容相同' : '本來就沒有');
  const missing = s.ignored.filter(p => !existsSync(join(at, p)));
  row(!missing.length, '沒進 git 的檔', missing.length ? `少了：${missing.join('、')}` : `${s.ignored.length} 項都在`);

  if (s.codexTrust != null) {
    const e = codexEntry(existsSync(s.codexConfig) ? readFileSync(s.codexConfig, 'utf8') : null, at);
    row(e?.trust === s.codexTrust, 'Codex 的信任設定', e ? `${at}：${e.trust}` : `沒有 ${at} 的設定`);
  }
  return rows;
}

// ---------- 指令 ----------

function printRows(rows, log = console.log) {
  for (const r of rows) log(`${r.block === false ? '・' : r.ok ? '✅' : '❌'} ${r.what}：${r.detail}`);
}

function parseArgs(argv) {
  const o = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) o[argv[i].slice(2)] = argv[++i];
    else o._.push(argv[i]);
  }
  return o;
}

export function main(argv = process.argv.slice(2), log = console.log) {
  const o = parseArgs(argv);
  const cmd = o._[0];
  const claudeProjects = o['claude-projects'] ?? join(homedir(), '.claude', 'projects');
  const codexConfig = o['codex-config'] ?? join(homedir(), '.codex', 'config.toml');
  const need = k => { if (!o[k]) throw new Error(`缺少 --${k}`); return o[k]; };

  if (cmd === 'check' || cmd === 'run') {
    const s = snapshot({ repo: need('repo'), to: need('to'), claudeProjects, codexConfig });
    const ready = readiness(s);
    log(`快照：${s.from} → ${s.to}`);
    printRows(ready, log);
    const blocked = ready.some(r => r.block);
    if (cmd === 'check') { log(blocked ? '\n還不能改：先處理上面 ❌ 的項目。' : '\n可以改名。'); return blocked ? 1 : 0; }
    if (blocked) { log('\n還不能改，什麼都沒動。'); return 1; }

    const out = norm(need('out'));
    mkdirSync(out, { recursive: true });
    const snapFile = join(out, 'snapshot.json');
    writeFileSync(snapFile, JSON.stringify(s, null, 2));
    if (existsSync(s.codexConfig) && s.codexTrust != null) copyFileSync(s.codexConfig, join(out, 'codex-config.before.toml'));
    log(`\n快照存在 ${snapFile}`);

    try { renameWithRetry(s.from, s.to); } catch (e) {
      log(`\n❌ 改不了名（${e.code ?? e.message}）：還有程式開著這個資料夾。關掉 Claude app（系統匣也要結束）、Codex、終端機、編輯器與開著它的檔案總管視窗，再執行一次。什麼都沒改。`);
      return 2;
    }
    log(`✅ 改名：${s.to}`);
    let rows;
    try { fixUp(s, m => log(`✅ ${m}`)); rows = verify(s); } catch (e) { rows = [{ ok: false, what: '修補', detail: e.message }]; }
    log('\n核對：');
    printRows(rows, log);
    if (rows.every(r => r.ok)) { log('\n全部通過。'); return 0; }

    log('\n有項目沒過，退回原名：');
    try {
      const back = rollback(s, m => log(`↩ ${m}`));
      printRows(back, log);
      if (back.every(r => r.ok)) { log('\n已經退回改名前的樣子（複製出去的記憶留著，不影響）。'); return 1; }
    } catch (e) { log(`退回失敗：${e.message}`); }
    log(`\n❌ 退回沒有完全成功，請把上面的輸出和 ${snapFile} 交給 Claude。`);
    return 3;
  }
  if (cmd === 'verify' || cmd === 'rollback') {
    const s = JSON.parse(readFileSync(need('snapshot'), 'utf8'));
    const rows = cmd === 'verify' ? verify(s, o.at ?? s.to) : rollback(s, log);
    printRows(rows, log);
    return rows.every(r => r.ok) ? 0 : 1;
  }
  log('用法見檔案開頭的說明。');
  return 1;
}

if (process.argv[1] && samePath(process.argv[1], fileURLToPath(import.meta.url))) {
  try { process.exitCode = main(); } catch (e) { console.error(`❌ ${e.message}`); process.exitCode = 1; }
}
