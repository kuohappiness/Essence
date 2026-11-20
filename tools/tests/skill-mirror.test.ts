import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { checkMirror, COPIES, SHARED } from '../check-skill-mirror.ts';

// 兩份副本都寫入同樣的檔案；個別測試再改其中一份。
async function fixture(t: { after: (fn: () => Promise<void>) => void }) {
  const root = await mkdtemp(join(tmpdir(), 'essence-skills-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const put = async (copy: string, path: string, text: string) => {
    await mkdir(dirname(join(root, copy, path)), { recursive: true });
    await writeFile(join(root, copy, path), text);
  };
  for (const copy of COPIES) {
    for (const skill of SHARED) {
      await put(copy, `${skill}/SKILL.md`, `# ${skill}\n\n見 [細節](detail.md#一節)、[網站](https://example.com)、[本頁](#標題)。\n`);
      await put(copy, `${skill}/detail.md`, '細節\n');
      await put(copy, `${skill}/agents/openai.yaml`, 'interface: {}\n');
    }
  }
  return { root, put };
}

void test('兩份相同時沒有問題；只差換行（CRLF／LF）也算相同', async t => {
  const { root, put } = await fixture(t);
  assert.deepEqual(checkMirror(root), []);
  await put(COPIES[1], `${SHARED[0]}/detail.md`, '細節\r\n');
  assert.deepEqual(checkMirror(root), []);
});

void test('內容不同、少一個檔案、多一個檔案都報出來', async t => {
  const { root, put } = await fixture(t);
  await put(COPIES[0], `${SHARED[0]}/detail.md`, '改過的細節\n');
  await put(COPIES[1], `${SHARED[1]}/extra.md`, '只有一邊\n');
  await rm(join(root, COPIES[1], SHARED[2], 'agents/openai.yaml'));
  assert.deepEqual(checkMirror(root), [
    `內容不同：${SHARED[0]}/detail.md`,
    `只有 ${COPIES[1]} 有：${SHARED[1]}/extra.md`,
    `只有 ${COPIES[0]} 有：${SHARED[2]}/agents/openai.yaml`,
  ]);
});

void test('缺少整個 skill 資料夾時報出來', async t => {
  const { root } = await fixture(t);
  await rm(join(root, COPIES[0], SHARED[1]), { recursive: true });
  assert.deepEqual(checkMirror(root), [`缺少資料夾：${COPIES[0]}/${SHARED[1]}`]);
});

void test('相對連結找不到時報出來，兩份各報一次；網址與頁內錨點不檢查', async t => {
  const { root, put } = await fixture(t);
  const text = '見 [不存在](missing.md)、[上層](<../../../有 空格.md>)、[壞的上層](<../../../沒有 這個.md#節>)。\n';
  for (const copy of COPIES) await put(copy, `${SHARED[0]}/SKILL.md`, text);
  await put('', '有 空格.md', '');
  assert.deepEqual(checkMirror(root), COPIES.flatMap(copy => [
    `連結找不到：${copy}/${SHARED[0]}/SKILL.md → missing.md`,
    `連結找不到：${copy}/${SHARED[0]}/SKILL.md → ../../../沒有 這個.md#節`,
  ]));
});

// --staged：pre-commit 讀暫存區（tasks/one-repo-step-1.md §3）。只 stage 一份、工作樹的兩份剛好一致時，commit 進去的是不一致的兩份。
async function staged(t: { after: (fn: () => Promise<void>) => void }) {
  const f = await fixture(t);
  const env = { ...process.env };
  for (const key of Object.keys(env)) if (key.toUpperCase().startsWith('GIT_')) delete env[key];
  const git = (...args: string[]) => execFileSync('git', args, { cwd: f.root, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  git('init', '-q');
  git('add', '--', ...COPIES);
  return { ...f, git };
}

void test('--staged 讀暫存區：只 stage 一份、工作樹的兩份剛好一致時擋下', async t => {
  const { root, put, git } = await staged(t);
  assert.deepEqual(checkMirror(root, { staged: true }), []);
  for (const copy of COPIES) await put(copy, `${SHARED[0]}/detail.md`, '兩份都改了\n');
  git('add', '--', `${COPIES[0]}/${SHARED[0]}/detail.md`);
  assert.deepEqual(checkMirror(root), []);
  assert.deepEqual(checkMirror(root, { staged: true }), [`內容不同：${SHARED[0]}/detail.md`]);
  git('add', '--', `${COPIES[1]}/${SHARED[0]}/detail.md`);
  assert.deepEqual(checkMirror(root, { staged: true }), []);
});

void test('--staged：檔案的有無與連結的目標也照暫存區算', async t => {
  const { root, put, git } = await staged(t);
  // 兩份都多一個檔，只 stage 一份：工作樹一致，暫存區只有一邊有。
  for (const copy of COPIES) await put(copy, `${SHARED[1]}/extra.md`, '新的\n');
  git('add', '--', `${COPIES[1]}/${SHARED[1]}/extra.md`);
  // 連結到工作樹有、暫存區沒有的檔。
  for (const copy of COPIES) await put(copy, `${SHARED[2]}/SKILL.md`, '見 [說明](<../../../說 明.md>)。\n');
  await put('', '說 明.md', '');
  git('add', '--', ...COPIES.map(copy => `${copy}/${SHARED[2]}/SKILL.md`));
  assert.deepEqual(checkMirror(root), []);
  assert.deepEqual(checkMirror(root, { staged: true }), [
    `只有 ${COPIES[1]} 有：${SHARED[1]}/extra.md`,
    ...COPIES.map(copy => `連結找不到：${copy}/${SHARED[2]}/SKILL.md → ../../../說 明.md`),
  ]);
  git('add', '--', '說 明.md');
  assert.deepEqual(checkMirror(root, { staged: true }), [`只有 ${COPIES[1]} 有：${SHARED[1]}/extra.md`]);
});
