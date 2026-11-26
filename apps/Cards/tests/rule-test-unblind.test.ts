// 比較測試工具的解開與結果（tasks/rule-test-tool.md §5-9、§6-1、§8 第 12、16 條）：鎖定、裁定都填了才讀對照表；
// 照裁定另算、算每一份的指標；摘要裡沒有評分表、卡組與教材的原文。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { checkFolder } from '../tools/rule-test/check.ts';
import { runDisputes } from '../tools/rule-test/disputes.ts';
import type { Folder } from '../tools/rule-test/folder.ts';
import { runJudges, type JudgeResult } from '../tools/rule-test/judge.ts';
import type { MapResult } from '../tools/rule-test/map.ts';
import { statusLines } from '../tools/rule-test/status.ts';
import { tokensOf, unblindFolder, type DeckMetrics } from '../tools/rule-test/unblind.ts';
import { blinded, fakeJudge, RUBRIC } from './helpers/rule-test.ts';

// 乙的第一個目標有兩題，彼此的題幹有對方的答案（程式找的洩漏候選）。
const SECOND = '````markdown\n國二上英文 L3 單字\n- borrow 的用法\n    - borrow 英翻中 :: **借入**\n    - 「借入」的英文 :: borrow\n- lend 英翻中\n    - lend :: v. 借出\n<<<完>>>\n````';
const CROSS_RUBRIC = RUBRIC.replace(' 加題 aaaaa2 ', ' 另立 ');

/** 兩位評審照自編的判定交（見各行的註）；回傳每一組的代號。 */
async function judged(): Promise<{ folder: Folder; code: Record<'甲' | '乙', string> }> {
  const folder = await blinded({ 乙: SECOND }, '', CROSS_RUBRIC);
  const decks = join(folder.root, '評分', '批1', '卡組', 'L3');
  const codes = readdirSync(decks).map(name => name.replace('.md', ''));
  const second = codes.find(code => readFileSync(join(decks, `${code}.md`), 'utf8').includes('「借入」的英文'))!;
  const code = { 甲: codes.find(each => each !== second)!, 乙: second };
  const set = (result: JudgeResult, row: string, deck: string, verdict: '有' | '部分' | '沒有'): void => {
    const cell = result.rows.find(each => each.row === row)!.decks.find(each => each.deck === deck)!;
    cell.verdict = verdict;
    if (verdict === '沒有') { cell.lines = []; cell.evidence = ''; }
  };
  const codex = fakeJudge({
    shape: result => {
      set(result, 'R2', code.甲, '沒有');
      result.issues.push({ deck: code.乙, kind: '判錯', lines: [3], rubric: '', note: '借入、借用都對' }, { deck: code.乙, kind: '重大錯誤', lines: [6], rubric: 'M1', note: 'lend 的字義' });
      result.unsure = '乙的第二題算不算考到 R2';
    },
  });
  const fable = fakeJudge({
    shape: result => {
      set(result, 'R1', code.乙, '部分'); // 和 Codex 的「有」合併成部分（歧見）
      set(result, 'R2', code.甲, '沒有');
      result.issues.push({ deck: code.乙, kind: '判錯', lines: [2], rubric: '', note: '' }, { deck: code.甲, kind: '近義重複', lines: [3, 5], rubric: '', note: '' }, { deck: code.乙, kind: '跨單元去向', lines: [5], rubric: 'R2', note: '' });
    },
  });
  await runJudges(folder, { adapters: { codex: codex.adapter, claude: fable.adapter }, log: () => {} });
  return { folder, code };
}

const ruling = (folder: Folder): Promise<void> => runDisputes(folder, {
  adapters: {
    claude: request => {
      request.record('{}', '');
      const value = request.text.startsWith('# 裁定說明') ? { verdict: '不成立', quality: '小問題', reason: '第 6 行的字義沒錯，但詳解不清楚' }
        : { items: [{ notes: ['U1'], kind: '教學選擇', question: 'R2 要不要算必備？', answer: '' }] };
      return Promise.resolve({ kind: 'ok', reply: JSON.stringify(value), session: 's', warnings: [], ms: 1, models: [], structured: value });
    },
  },
  log: () => {},
});

void test('unblind：沒鎖定、沒裁定、教學選擇沒填或寫錯、沒做格式檢查都停下；都好了才解開', async () => {
  const folder = await blinded();
  assert.throws(() => unblindFolder(folder, { log: () => {} }), /批 1 還沒鎖定/);
  assert.ok(statusLines(folder).includes('批 1：2 份、1 個區組｜評分 0／2（下一步：judge）'));
  const { folder: judgedFolder } = await judged();
  assert.ok(statusLines(judgedFolder).includes('批 1：2 份、1 個區組｜已鎖定（下一步：disputes）'));
  assert.throws(() => unblindFolder(judgedFolder, { log: () => {} }), /批 1 還沒裁定（先跑 disputes）/);
  await ruling(judgedFolder);
  assert.ok(statusLines(judgedFolder).includes('批 1：2 份、1 個區組｜已裁定（教學選擇填好後：unblind）'));
  const file = join(judgedFolder.root, '評分', '批1', '裁定.md');
  assert.throws(() => unblindFolder(judgedFolder, { log: () => {} }), /C1 是教學選擇，「使用者的選擇」還沒填/);
  const text = readFileSync(file, 'utf8');
  writeFileSync(file, text.replace('| R2 要不要算必備？ |  |  |', '| R2 要不要算必備？ |  | R9 改必備 |'));
  assert.throws(() => unblindFolder(judgedFolder, { log: () => {} }), /C1：「R9」不是 L3 評分表的必備或加分列/);
  writeFileSync(file, text.replace('| R2 要不要算必備？ |  |  |', '| R2 要不要算必備？ |  | R2 改必備 |'));
  assert.throws(() => unblindFolder(judgedFolder, { log: () => {} }), /還有 2 份沒做格式檢查（先跑 check）/);
  checkFolder(judgedFolder, () => {});
  assert.equal(unblindFolder(judgedFolder, { log: () => {} }).decks.length, 2);
  assert.ok(statusLines(judgedFolder).includes('批 1：2 份、1 個區組｜已解開（結果/）'));
});

void test('指標：照合併表與裁定另算；問題兩位聯集去重；教學選擇改了列的類別；程式找的洩漏候選另列', async () => {
  const { folder, code } = await judged();
  await ruling(folder);
  const file = join(folder.root, '評分', '批1', '裁定.md');
  writeFileSync(file, readFileSync(file, 'utf8').replace('| R2 要不要算必備？ |  |  |', '| R2 要不要算必備？ |  | R2 改必備 |'));
  checkFolder(folder, () => {});
  const report = unblindFolder(folder, { log: () => {} });
  const first = report.decks.find(deck => deck.code === code.甲)!, second = report.decks.find(deck => deck.code === code.乙)!;
  assert.deepEqual([first.group, second.group], ['甲', '乙']);
  // R2 改成必備：甲兩位都沒有＝漏；乙 R1 一有一部分＝部分。
  assert.deepEqual([first.required, first.missed, first.partial, first.bonus.有], [{ 有: 1, 部分: 0, 沒有: 1 }, ['R2'], [], 0]);
  assert.deepEqual([second.required, second.missed, second.partial, second.disagreements], [{ 有: 1, 部分: 1, 沒有: 0 }, [], ['R1'], 1]);
  // 乙：判錯兩位都記（名稱行和題目行算同一題）；只有 Codex 記的重大錯誤裁定不成立、改記小問題；跨單元去向錯一列（預設算小問題）。
  assert.deepEqual([second.major, second.majorTotal, second.quality.判錯, second.quality.小問題, second.qualityBoth, second.qualityOne], [0, 0, 1, 1, 1, 1]);
  assert.deepEqual([second.harm, second.minor, second.crossRows, second.crossWrong], [{ 判錯: 1, 洩漏: 0, 漏的必備: 0, 其他: 0, total: 1 }, 2, 1, 1]);
  // 孩子的時間：3 題、確定考到的必備 1 列（R1 是部分不算），每個必備平均 3 題。
  assert.deepEqual([second.targets, second.prompts, second.childPrompts, second.sureRequired, second.perRequired], [2, 3, 3, 1, 3]);
  assert.deepEqual(second.leakCandidates, ['目標 1 第 1 題的題幹有第 2 題的答案', '目標 1 第 2 題的題幹有第 1 題的答案']);
  // 甲：漏 R2 算傷到學習；近義重複一對＝多餘的題 1。
  assert.deepEqual([first.nearDuplicates, first.duplicateGroups, first.extraPrompts, first.harm.total, first.targets, first.prompts, first.leakCandidates], [1, 1, 1, 1, 2, 2, []]);
  assert.equal(first.generationMs, 1200);
  assert.deepEqual(first.byJudge, { codex: { missed: 1, issues: 0 }, claude: { missed: 1, issues: 1 } });
  assert.deepEqual(report.rows.L3.map(each => [each.id, each.effect]), [['R1', null], ['R2', '改必備'], ['M1', null]]);
});

void test('裁定改記的去重（§3）：比合併定下的位置；名稱行和題目行算同一題，同一個目標的另一題不算', async () => {
  const relabeled = async (codexIssues: JudgeResult['issues'], fableIssues: JudgeResult['issues']): Promise<DeckMetrics> => {
    const folder = await blinded({ 乙: SECOND });
    const decks = join(folder.root, '評分', '批1', '卡組', 'L3');
    const second = readdirSync(decks).map(name => name.replace('.md', '')).find(code => readFileSync(join(decks, `${code}.md`), 'utf8').includes('「借入」的英文'))!;
    const mine = (issues: JudgeResult['issues']): JudgeResult['issues'] => issues.map(each => ({ ...each, deck: second }));
    const codex = fakeJudge({ shape: result => { result.issues.push(...mine(codexIssues)); } });
    const fable = fakeJudge({ shape: result => { result.issues.push(...mine(fableIssues)); } });
    await runJudges(folder, { adapters: { codex: codex.adapter, claude: fable.adapter }, log: () => {} });
    await runDisputes(folder, {
      adapters: {
        claude: request => {
          request.record('{}', '');
          const value = { verdict: '不成立', quality: '判錯', reason: '字義沒錯，但答案只收一種說法' };
          return Promise.resolve({ kind: 'ok', reply: JSON.stringify(value), session: 's', warnings: [], ms: 1, models: [], structured: value });
        },
      },
      log: () => {},
    });
    checkFolder(folder, () => {});
    return unblindFolder(folder, { log: () => {} }).decks.find(each => each.code === second)!;
  };
  // 乙的第 2 行是有兩題的目標（第 3、4 行是題）。
  // Codex 只記重大（名稱行），Fable 在第 1 題記判錯：改記判錯是同一題，只算一筆。
  const one = await relabeled([{ deck: '', kind: '重大錯誤', lines: [2], rubric: 'M1', note: 'borrow 的字義' }], [{ deck: '', kind: '判錯', lines: [3], rubric: '', note: '' }]);
  assert.deepEqual([one.quality.判錯, one.harm.判錯, one.major], [1, 1, 0]);
  // 判錯第 1 題（Codex）和名稱行（Fable）合併成第 1 題；只有 Codex 記的重大在第 2 題，改記判錯是另一題（L2 第 4 輪 P3-1）。
  const two = await relabeled([{ deck: '', kind: '判錯', lines: [3], rubric: '', note: '' }, { deck: '', kind: '重大錯誤', lines: [4], rubric: 'M1', note: '' }], [{ deck: '', kind: '判錯', lines: [2], rubric: '', note: '' }]);
  assert.deepEqual([two.quality.判錯, two.harm.判錯, two.major], [2, 2, 0]);
});

void test('結果：摘要沒有評分表、卡組與教材的原文；使用紀錄加一行；再跑不重算、不重記', async () => {
  const { folder } = await judged();
  await ruling(folder);
  const file = join(folder.root, '評分', '批1', '裁定.md');
  writeFileSync(file, readFileSync(file, 'utf8').replace('| R2 要不要算必備？ |  |  |', '| R2 要不要算必備？ |  | 照原樣 |'));
  checkFolder(folder, () => {});
  unblindFolder(folder, { log: () => {} });
  const summary = readFileSync(join(folder.root, '結果', '摘要.md'), 'utf8');
  for (const secret of ['borrow', 'lend', '借入', '借出', '字義', '假的', '詳解', '第 6 行']) assert.ok(!summary.includes(secret), `摘要裡有「${secret}」`);
  // 甲：多餘的題 1（近義重複一對）；乙：判錯 1、小問題 2，R1 是部分、確定考到的必備 0 列，每個必備平均幾題用最差值 3÷0.5。
  // 三張表：學習面、次要、只報告（§3、§9）；沒有地圖、加深的是 —。
  assert.ok(summary.includes('| 甲 | 1 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 2.0 | 1.0 | — | — | — | — | — |'));
  assert.ok(summary.includes('| 乙 | 1 | 0.0 | 1.0 | 1.0 | 0.0 | 0.0 | 0.0 | 0.0 | 6.0 | 0.0 | — | — | — | — | — |'));
  assert.ok(summary.includes('| 組 | 規則字數 | 整份提示字數 | 生成 token 輸入 | 生成 token 輸出 | 加深 token 輸入 | 加深 token 輸出 | 生成（分） |'));
  assert.ok(summary.includes('| 甲 | 0.0 | 1.0 | 0.0 | 0.0 | 2.0 | 2.0 | 0／1 | — | — | — | 0.0 |'));
  assert.ok(summary.includes('| 乙 | 1.0 | 0.0 | 1.0 | 2.0 | 3.0 | 2.0 | 0／1 | — | — | — | 0.0 |'));
  assert.ok(summary.includes('對話數（不含重試與重評）：生成 2、加深 0、卡組評分 2、地圖評分 0、加深評分 0'));
  // 門檻：各一份，傷到學習多了但份數不夠，未定。
  assert.match(summary, /### L3｜claude｜乙 對 甲：未定\n\n- 傷到學習未定\n- 份數：候選 1、基準 1（不到 3 份：不判明顯）/);
  assert.match(summary, /- ［過］ 重大：候選每份平均 0\.0、基準 0\.0（含存不了：候選 0 份、基準 0 份），不比基準多\n/);
  assert.match(summary, /- ［未定］ 傷到學習：候選每份 1\.0、基準 0\.0（容許多 0\.0），多了→ 未定（份數不夠）\n/);
  assert.match(summary, /- ［沒過］ 收益 判錯：候選 1\.0、基準 0\.0，基準是 0（設定至少少 1%）→ 沒達到\n/);
  const detail = readFileSync(join(folder.root, '結果', '明細.md'), 'utf8');
  assert.match(detail, /判錯 目標 1 第 1 題，codex、claude：借入、借用都對/);
  assert.match(detail, /M1：L3-B01 S\d 目標 2 第 1 題：不成立，改記小問題/);
  const log = join(folder.root, '課', 'L3', '使用紀錄.md');
  assert.match(readFileSync(log, 'utf8'), /^- \d{4}-\d{2}-\d{2}「評分測試」批 1 解開，commit [0-9a-f]{40}（組：甲、乙）\n$/);
  unblindFolder(folder, { log: () => {} });
  assert.equal(readFileSync(log, 'utf8').split('\n').filter(Boolean).length, 1);
});

void test('對話數（L2 第 3 輪 5）：五組拆成兩個區組、同一份基準評兩次時，生成照份數算，評分照區組算', async () => {
  const folder = await blinded({}, '', undefined, ['甲', '乙', '丙', '丁', '戊']);
  await runJudges(folder, { adapters: { codex: fakeJudge().adapter, claude: fakeJudge().adapter }, log: () => {} });
  await runDisputes(folder, { adapters: { claude: () => Promise.reject(Error('沒有要裁定的')) }, log: () => {} });
  checkFolder(folder, () => {});
  unblindFolder(folder, { log: () => {} });
  const summary = readFileSync(join(folder.root, '結果', '摘要.md'), 'utf8');
  assert.ok(summary.includes('對話數（不含重試與重評）：生成 5、加深 0、卡組評分 4、地圖評分 0、加深評分 0'), summary.split('\n').find(line => line.startsWith('對話數')));
});

void test('token（rule-test-d236.md §9）：輸入＝input＋快取寫入＋快取讀取，輸出＝output；有一步沒有 usage 就是不知道', () => {
  const step = { input_tokens: 10, cache_creation_input_tokens: 200, cache_read_input_tokens: 3000, output_tokens: 40 };
  assert.deepEqual(tokensOf([step, { input_tokens: 5, output_tokens: 6 }]), { input: 3215, output: 46 });
  assert.deepEqual(tokensOf([step, undefined]), { input: null, output: null });
  assert.deepEqual(tokensOf([{ input_tokens: 5 }]), { input: null, output: null });
  assert.deepEqual(tokensOf([]), { input: null, output: null });
});

void test('地圖（rule-test-d236.md §5、§13 第 6 條）：交三段的組另評地圖、鎖定列全部階段；漏的必備與問題照合併算；應交沒交是全部必備漏；不交的組是不適用', async () => {
  const map = (frame: string): string => ['<<<全貌>>>', '- 這一課學借與還', '<<<架構>>>', frame, '<<<卡組>>>', '國二上英文 L3 單字', '- borrow 英翻中', '    - borrow :: v. 借入', '<<<完>>>'].join('\n');
  const three = '組乙：照三段交\n\n<<<卡組>>>\n\n{{任務段}}';
  const run = async (frame: string): Promise<{ folder: Folder; codes: string[] }> => {
    const folder = await blinded({ 乙: map(frame) }, '', undefined, ['甲', '乙'], { 乙: three });
    let codes: string[] = [];
    // 兩位都判 R1 在地圖裡沒有；同一個錨點（第 2 行）都記判準不清：算一筆。
    const shapeMap = (result: MapResult, maps: string[]): void => {
      codes = maps;
      result.rows.find(each => each.row === 'R1')!.decks.forEach(cell => { cell.verdict = '沒有'; cell.lines = []; cell.evidence = ''; });
      result.issues.push({ deck: maps[0], kind: '判準不清', anchor: 2, lines: [2], rubric: '', note: '' });
    };
    await runJudges(folder, { adapters: { codex: fakeJudge({ shapeMap }).adapter, claude: fakeJudge({ shapeMap }).adapter }, log: () => {} });
    return { folder, codes };
  };
  const { folder, codes } = await run('- 能分辨 borrow 與 lend');
  assert.equal(codes.length, 1);
  const lock = readFileSync(join(folder.root, '評分', '批1', '鎖定.md'), 'utf8');
  assert.match(lock, /\| 結果\/codex\/L3-B01-地圖\.json \| [0-9a-f]{64} \|/);
  assert.match(lock, /\| 結果\/claude\/L3-B01\.json \| [0-9a-f]{64} \|/);
  assert.ok(statusLines(folder).includes('批 1：2 份、1 個區組｜已鎖定（下一步：disputes）'));
  await runDisputes(folder, { adapters: { claude: () => Promise.reject(Error('沒有要裁定的')) }, log: () => {} });
  checkFolder(folder, () => {});
  const report = unblindFolder(folder, { log: () => {} });
  const byGroup = Object.fromEntries(report.decks.map(deck => [deck.group, deck]));
  assert.equal(byGroup.甲.map, null);
  assert.deepEqual(byGroup.乙.map, { missing: false, missed: 1, issues: 1 });

  // 改了鎖定的地圖結果檔：拒絕。
  const tampered = await run('- 能分辨 borrow 與 lend');
  writeFileSync(join(tampered.folder.root, '評分', '批1', '結果', 'codex', 'L3-B01-地圖.json'), '{}');
  await assert.rejects(runDisputes(tampered.folder, { adapters: {}, log: () => {} }), /鎖定之後，結果\/codex\/L3-B01-地圖\.json 改過或不見了/);

  // 架構是空的：沒有地圖評分，全部必備漏（R1 一列）。
  const empty = await run('');
  assert.equal(empty.codes.length, 0);
  await runDisputes(empty.folder, { adapters: {}, log: () => {} });
  checkFolder(empty.folder, () => {});
  const missing = unblindFolder(empty.folder, { log: () => {} }).decks.find(deck => deck.group === '乙')!;
  assert.deepEqual(missing.map, { missing: true, missed: 1, issues: 0 });
});
