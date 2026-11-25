// 比較測試工具的測試共用的自編資料：一課、兩組各一份、凍結到匿名做完的測試資料夾，與照提示交結果的假評審。
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Adapter, StepRequest } from '../../tools/rule-test/adapters.ts';
import { blindFolder } from '../../tools/rule-test/blind.ts';
import { openFolder, type Folder } from '../../tools/rule-test/folder.ts';
import { freezeFolder } from '../../tools/rule-test/freeze.ts';
import { runQueue } from '../../tools/rule-test/generate.ts';
import type { JudgeResult } from '../../tools/rule-test/judge.ts';

export const RUBRIC = [
  '| 列 | 類別 | 要考的知識或判準 | 頁碼 | 可以接受的等價做法 | 跨單元 |',
  '|---|---|---|---|---|---|',
  '| R1 | 必備 | borrow 的字義 | p.3 | | |',
  '| R2 | **加分** | lend 的字義 | p.3 | | 加題 aaaaa2 |',
  '| M1 | 重大錯誤 | 字義教錯 | | | |',
].join('\n');

const GOOD_REPLY = '````markdown\n國二上英文 L3 單字\n- borrow 英翻中\n    - borrow :: v. 借入\n- lend 英翻中\n    - lend :: v. 借出\n<<<完>>>\n````';

/** 凍結、每組生成一份（replies 可以照組換回覆）、匿名做完的測試資料夾。 */
export async function blinded(replies: Partial<Record<'甲' | '乙', string>> = {}, more = '', rubric = RUBRIC.replace(' 加題 aaaaa2 ', ' ')): Promise<Folder> {
  const root = mkdtempSync(join(tmpdir(), 'rule-test-'));
  mkdirSync(join(root, '課', 'L3'), { recursive: true });
  writeFileSync(join(root, '課', 'L3', '教材.pdf'), '%PDF-1.4 假的');
  writeFileSync(join(root, '課', 'L3', '評分表.md'), rubric);
  mkdirSync(join(root, '提示'));
  for (const name of ['甲', '乙']) writeFileSync(join(root, '提示', `${name}.md`), `組${name}\n\n{{任務段}}`);
  writeFileSync(join(root, '測試.yaml'), `
名稱: 評分測試
課庫: 課
同時: 1
課: [{ 代號: L3, 表單: { 科目: english, 年級學期: 國二上, 單元: L3 } }]
組:
  - { 名稱: 甲, 規則: { 自備: { L3: 甲.md } } }
  - { 名稱: 乙, 規則: { 自備: { L3: 乙.md } } }
生成: [{ 生成器: claude, 模型: claude-opus-5-5, 份數: 1 }]
評審: [{ 評審: codex, 模型: gpt-6.2-sol }, { 評審: claude, 模型: claude-fable-5-2 }]
門檻: { 基準: 甲, 候選: [乙], 生成器: [claude], 收益: [{ 指標: 規則字數, 至少: 1% }] }
${more}`);
  await freezeFolder(openFolder(root), { log: () => {} });
  const folder = openFolder(root);
  const reply = (prompt: string): string => (prompt.startsWith('組乙') ? replies.乙 : replies.甲) ?? GOOD_REPLY;
  await runQueue(folder, { adapters: { claude: request => Promise.resolve({ kind: 'ok', reply: reply(request.text), session: null, warnings: [], ms: 1200, models: [] }) }, log: () => {} });
  blindFolder(folder, { log: () => {} });
  return folder;
}

/**
 * 假的評審：從提示讀代號與列號，每份每列判「有」（證據第 2 行）；shape 可以照代號改結果（例如記問題），first 可以讓第一次交的不合格。
 */
export function fakeJudge(options: { shape?: (result: JudgeResult, codes: string[]) => void; first?: (result: JudgeResult) => void } = {}): { adapter: Adapter; requests: StepRequest[] } {
  const requests: StepRequest[] = [];
  let prompt = '';
  return {
    requests,
    adapter: request => {
      requests.push(request);
      request.record('{}', '');
      if (request.resume === null) prompt = request.text;
      const codes = /- 卡組：(.*)（共/.exec(prompt)![1].split('、').map(each => /卡組\/(S\d+)\.md/.exec(each)![1]);
      const rows = /- 要逐列判的列（\d+ 列）：(.*)/.exec(prompt)![1].split('、');
      const result: JudgeResult = { pages: [], rows: rows.map(row => ({ row, decks: codes.map(deck => ({ deck, evidence: 'borrow 英翻中', lines: [2], verdict: '有' as const })) })), issues: [], unsure: '' };
      options.shape?.(result, codes);
      if (options.first && requests.length === 1) options.first(result);
      return Promise.resolve({ kind: 'ok', reply: JSON.stringify(result), session: 'judge-1', warnings: [], ms: 1, models: [], structured: result });
    },
  };
}
