// 比較測試工具的評分表指令（tasks/rule-test-tool.md §5-2）：寫（只看教材與已有目標）、核對、回應接著寫的對話；看過才存進課庫。
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Adapter, StepRequest } from '../tools/rule-test/adapters.ts';
import { openFolder, type Folder } from '../tools/rule-test/folder.ts';
import { freezeFolder } from '../tools/rule-test/freeze.ts';
import { acceptRubric, runRubric } from '../tools/rule-test/rubric-chat.ts';

const TABLE = '| 列 | 類別 | 要考的知識或判準 | 頁碼 | 可以接受的等價做法 | 跨單元 |\n|---|---|---|---|---|---|\n| R1 | 必備 | borrow 的字義 | p.3 | | |\n';

async function frozen(): Promise<Folder> {
  const root = mkdtempSync(join(tmpdir(), 'rule-test-rubric-'));
  mkdirSync(join(root, '課', 'L3'), { recursive: true });
  writeFileSync(join(root, '課', 'L3', '教材.pdf'), '%PDF-1.4 假的');
  mkdirSync(join(root, '提示'));
  writeFileSync(join(root, '提示', '甲.md'), '組甲\n\n{{任務段}}');
  writeFileSync(join(root, '測試.yaml'), `
名稱: 評分表測試
課庫: 課
課: [{ 代號: L3, 表單: { 科目: english, 年級學期: 國二上, 單元: L3 Going Places } }]
組: [{ 名稱: 甲, 規則: { 自備: { L3: 甲.md } } }]
生成: [{ 生成器: claude, 模型: claude-opus-5-5, 份數: 1 }]
評審: [{ 評審: codex, 模型: gpt-6.2-sol }, { 評審: claude, 模型: claude-fable-5-2 }]
門檻: { 基準: 甲, 候選: [甲], 生成器: [claude], 收益: [{ 指標: 規則字數, 至少: 1% }] }
`);
  await freezeFolder(openFolder(root), { log: () => {} });
  return openFolder(root);
}

/** 寫的一方（claude）：第一次交的表類別寫錯，補正後合格；回應時逐條回應並交改好的表。核對的一方（codex）回意見。 */
function fakes(): { claude: Adapter; codex: Adapter; requests: { who: string; request: StepRequest; files: string[] }[] } {
  const requests: { who: string; request: StepRequest; files: string[] }[] = [];
  const reply = (who: string, request: StepRequest, text: string, session: string): ReturnType<Adapter> => {
    requests.push({ who, request, files: readdirSync(request.cwd).sort() });
    request.record('{}', '');
    return Promise.resolve({ kind: 'ok', reply: text, session, warnings: [], ms: 1, models: [] });
  };
  let writes = 0;
  return {
    requests,
    claude: request => request.text.startsWith('# 評分表寫法') || request.text.startsWith('你交的回覆')
      ? reply('寫', request, ++writes === 1 ? TABLE.replace('必備', '必要') : TABLE, 'writer-1')
      : reply('回應', request, `1. R1：接受，p.3 有 lend\n\n## 改好的評分表\n\n${TABLE}| R2 | 加分 | lend 的字義 | p.3 | | |\n\n以上`, 'writer-1'),
    codex: request => reply('核對', request, '- 新增：lend 的字義（p.3）\n共 1 條', 'checker-1'),
  };
}

void test('rubric：寫的只看教材與已有目標、格式不合在同一個對話補正；核對另開；回應接著寫的對話；草稿看過才存進課庫', async () => {
  const folder = await frozen();
  const temp = mkdtempSync(join(tmpdir(), 'rule-test-rubric-temp-'));
  const { claude, codex, requests } = fakes();
  await runRubric(folder, 'L3', { adapters: { claude, codex }, log: () => {}, temp });
  assert.deepEqual(requests.map(each => [each.who, each.request.resume]), [['寫', null], ['寫', 'writer-1'], ['核對', null], ['回應', 'writer-1']]);
  const [write, fix, check, respond] = requests;
  assert.deepEqual(write.files, ['已有目標.json', '教材.pdf']);
  assert.ok(write.request.pdf !== null && write.request.model === 'claude-fable-5-2');
  assert.match(write.request.text, /你只看教材，不看任何製卡規則/);
  assert.match(write.request.text, /## 這一課\n\n- 科目、年級學期、單元：.*、國二上、L3 Going Places/);
  assert.ok(!write.request.text.includes('組甲'));
  assert.match(fix.request.text, /^你交的回覆有這些問題：\n- 列「R1」的類別「必要」不是 必備、加分、重大錯誤/);
  assert.deepEqual([check.files, check.request.pdf, check.request.model], [['已有目標.json', '教材.pdf', '評分表.md'], null, 'gpt-6.2-sol']);
  assert.equal(respond.request.cwd, write.request.cwd);
  assert.match(respond.request.text, /## 核對意見\n\n- 新增：lend 的字義（p\.3）/);
  const dir = join(folder.root, '評分表', 'L3');
  assert.equal(readFileSync(join(dir, '評分表.md'), 'utf8'), `${TABLE}| R2 | 加分 | lend 的字義 | p.3 | | |\n`);
  assert.ok(['1-寫.md', '2-核對.md', '3-回應.md', '提示-寫.md', '提示-核對.md', '提示-回應.md'].every(name => existsSync(join(dir, name))));
  assert.ok(!existsSync(write.request.cwd));
  // 再跑：都做完了，不開對話。
  await runRubric(folder, 'L3', { adapters: { claude, codex }, log: () => {}, temp });
  assert.equal(requests.length, 4);
  // 存進課庫；之後再做就停下。
  assert.equal(readFileSync(acceptRubric(folder, 'L3'), 'utf8'), readFileSync(join(dir, '評分表.md'), 'utf8'));
  assert.throws(() => acceptRubric(folder, 'L3'), /課庫已經有這一課的評分表/);
  await assert.rejects(runRubric(folder, 'L3', { adapters: { claude, codex }, log: () => {}, temp }), /課庫已經有這一課的評分表/);
});
