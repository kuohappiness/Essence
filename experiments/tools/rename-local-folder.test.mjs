// rename-local-folder.mjs 的測試：在暫存資料夾建一個有 worktree、寫死 hooksPath、記憶與 Codex 設定的 repo。
// 執行：node --test --test-timeout=120000 experiments/tools/rename-local-folder.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { once } from 'node:events';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { main, projectKey } from './rename-local-folder.mjs';

const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const run = args => { const lines = []; const code = main(args, m => lines.push(m)); return { code, out: lines.join('\n') }; };

function setup() {
  const root = mkdtempSync(join(tmpdir(), 'rename-test-'));
  const repo = join(root, '舊 名字');
  mkdirSync(repo);
  git(repo, 'init', '-q', '-b', 'main');
  git(repo, 'config', 'user.email', 'test@example.com');
  git(repo, 'config', 'user.name', 'test');
  git(repo, 'config', 'core.hooksPath', '.githooks');
  git(repo, 'config', 'extensions.worktreeConfig', 'true');
  git(repo, 'config', 'test.sibling', `${repo} Backup`); // 名字以舊路徑開頭的別的資料夾，不算舊路徑
  mkdirSync(join(repo, '.githooks'));
  writeFileSync(join(repo, '.githooks', 'pre-commit'), '#!/bin/sh\nexit 0\n');
  writeFileSync(join(repo, '.gitignore'), '.local/\n.claude/settings.local.json\n.claude/worktrees/\n');
  writeFileSync(join(repo, 'a.txt'), 'a\n');
  git(repo, 'add', '.');
  git(repo, 'commit', '-q', '-m', 'init');
  const wt = join(repo, '.claude', 'worktrees', 'wt1');
  git(repo, 'worktree', 'add', '-q', '-b', 'feat', wt);
  const wtConfig = join(git(wt, 'rev-parse', '--path-format=absolute', '--git-dir'), 'config.worktree');
  git(repo, 'config', '--file', wtConfig, 'core.hooksPath', join(repo, '.githooks'));
  mkdirSync(join(repo, '.local'));
  writeFileSync(join(repo, '.local', 'x.json'), '{"a":1}\n');
  writeFileSync(join(repo, '.claude', 'settings.local.json'), '{}\n');
  const projects = join(root, 'projects');
  const memory = join(projects, projectKey(repo), 'memory');
  mkdirSync(memory, { recursive: true });
  writeFileSync(join(memory, 'MEMORY.md'), '- [a](a.md)\n');
  writeFileSync(join(memory, 'a.md'), 'a\n');
  const codex = join(root, 'codex.toml');
  const codexBefore = `[projects.'D:\\other']\ntrust_level = "trusted"\n\n[projects.'${repo}']\ntrust_level = "trusted"\n\n[plugins."x"]\nenabled = true\n`;
  writeFileSync(codex, codexBefore);
  const to = join(root, '新名字');
  const out = join(root, 'out');
  return { root, repo, wt, wtConfig, projects, codex, codexBefore, to, out, opts: ['--claude-projects', projects, '--codex-config', codex] };
}
const cleanup = t => rmSync(t.root, { recursive: true, force: true });
const runArgs = t => ['run', '--repo', t.repo, '--to', t.to, '--out', t.out, ...t.opts];

test('run：改名、接回 worktree、拿掉寫死的 hooksPath、複製記憶、Codex 加新路徑，核對全過', () => {
  const t = setup();
  try {
    const r = run(runArgs(t));
    assert.equal(r.code, 0, r.out);
    assert.equal(existsSync(t.repo), false);
    const wt = join(t.to, '.claude', 'worktrees', 'wt1');
    assert.equal(git(wt, 'rev-parse', '--abbrev-ref', 'HEAD'), 'feat');
    assert.equal(git(wt, 'status', '--porcelain'), '');
    assert.equal(git(wt, 'rev-parse', '--git-path', 'hooks'), '.githooks');
    assert.equal(readFileSync(join(t.projects, projectKey(t.to), 'memory', 'a.md'), 'utf8'), 'a\n');
    assert.equal(readFileSync(join(t.projects, projectKey(t.repo), 'memory', 'a.md'), 'utf8'), 'a\n'); // 舊的留著
    const codex = readFileSync(t.codex, 'utf8');
    assert.equal(codex, t.codexBefore.replace('\n\n[plugins', `\n\n[projects.'${t.to}']\ntrust_level = "trusted"\n\n[plugins`));
    assert.match(r.out, /全部通過/);
  } finally { cleanup(t); }
});

test('rollback：改回原名，worktree、寫死的 hooksPath 與 Codex 都回到改名前', () => {
  const t = setup();
  try {
    assert.equal(run(runArgs(t)).code, 0);
    const r = run(['rollback', '--snapshot', join(t.out, 'snapshot.json')]);
    assert.equal(r.code, 0, r.out);
    assert.equal(existsSync(t.to), false);
    assert.equal(git(t.wt, 'rev-parse', '--abbrev-ref', 'HEAD'), 'feat');
    assert.equal(git(t.repo, 'config', '--file', t.wtConfig, '--get', 'core.hooksPath'), join(t.repo, '.githooks'));
    assert.equal(readFileSync(t.codex, 'utf8'), t.codexBefore);
  } finally { cleanup(t); }
});

test('核對沒過就自動退回：新位置的記憶已有不同內容', () => {
  const t = setup();
  try {
    const clash = join(t.projects, projectKey(t.to), 'memory');
    mkdirSync(clash, { recursive: true });
    writeFileSync(join(clash, 'a.md'), 'other\n');
    const r = run(runArgs(t));
    assert.equal(r.code, 1, r.out);
    assert.match(r.out, /退回原名/);
    assert.equal(existsSync(t.to), false);
    assert.equal(git(t.wt, 'rev-parse', '--abbrev-ref', 'HEAD'), 'feat');
    assert.equal(git(t.repo, 'config', '--file', t.wtConfig, '--get', 'core.hooksPath'), join(t.repo, '.githooks'));
    assert.equal(readFileSync(t.codex, 'utf8'), t.codexBefore);
    assert.equal(readFileSync(join(clash, 'a.md'), 'utf8'), 'other\n'); // 不蓋掉別人的檔
  } finally { cleanup(t); }
});

test('worktree 有沒 commit 的修改：check 列出來，run 什麼都不動', () => {
  const t = setup();
  try {
    writeFileSync(join(t.wt, 'a.txt'), 'changed\n');
    const c = run(['check', '--repo', t.repo, '--to', t.to, ...t.opts]);
    assert.equal(c.code, 1, c.out);
    assert.match(c.out, /❌ 沒 commit 的修改：.*wt1/);
    const r = run(runArgs(t));
    assert.equal(r.code, 1, r.out);
    assert.equal(existsSync(t.to), false);
    assert.equal(existsSync(join(t.out, 'snapshot.json')), false);
  } finally { cleanup(t); }
});

test('終端機在要改名的資料夾裡：check 擋下', () => {
  const t = setup();
  const back = process.cwd();
  try {
    process.chdir(t.repo);
    const c = run(['check', '--repo', t.repo, '--to', t.to, ...t.opts]);
    assert.equal(c.code, 1, c.out);
    assert.match(c.out, /❌ 執行位置/);
  } finally { process.chdir(back); cleanup(t); }
});

test('資料夾被別的程式占用：exit 2，什麼都沒改', { skip: process.platform !== 'win32' && '只有 Windows 會擋' }, async () => {
  const t = setup();
  const child = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 30000)'], { cwd: t.repo, stdio: 'ignore' });
  try {
    await new Promise(r => setTimeout(r, 500));
    const r = run(runArgs(t));
    assert.equal(r.code, 2, r.out);
    assert.match(r.out, /什麼都沒改/);
    assert.equal(existsSync(t.to), false);
    assert.equal(git(t.wt, 'rev-parse', '--abbrev-ref', 'HEAD'), 'feat');
    assert.equal(readFileSync(t.codex, 'utf8'), t.codexBefore);
  } finally {
    child.kill();
    await once(child, 'exit');
    cleanup(t);
  }
});
