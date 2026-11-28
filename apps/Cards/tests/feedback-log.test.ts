import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseDeck } from '../src/core/deck/index.ts';
import { createFeedbackLog, feedbackLogPath, FEEDBACK_FOLDER, isFeedbackLogPath, previewSink } from '../src/core/feedback/index.ts';
import type { FeedbackEntry } from '../src/core/feedback/index.ts';
import type { Files } from '../src/core/files.ts';
import { createPreview } from '../src/review/index.ts';
import type { Session } from '../src/review/index.ts';
import { createMemoryFiles } from './helpers/memory-files.ts';

// 預覽的回饋紀錄（D-246、tasks/card-feedback.md §2、§6 第 2～4、6、8、11～13 項）：預覽接真的寫的一方與記憶體裡的 Files。
// 預期值照 syntax.md §11 與手寫的原文；指紋取自 parseDeck，和複習紀錄的 v 同一個來源。

const DEVICE = 'iPhone-7f3a';
const BUILD = '0.7.0+1a2b3c4';
const AT = Date.parse('2026-12-03T21:15:03.250+08:00');
const FILE = 'Essence Cards/紀錄/回饋/2026-12 iPhone-7f3a 回饋.jsonl';
const PATH = 'Essence Cards/國二上/英文/L3 文法（卡片）.md';
const HEAD = '---\n年級學期: 國二上\n科目: 英文\n單元: L3\n狀態: 草稿\n---\n';
const ONE = `- 過去進行式的問句 ^k3m9x2
    - ＿＿ your brothers eating when you left? :: Were
        - 詳解：問「那時候正在做」用過去進行式
    - 記憶錨點：那時候正在 → was／were + V-ing`;
const DECK = HEAD + ONE + '\n\n- 還沒補 ID\n    - 第二題 :: 二\n';

function setup(files: Files, text: string, failed?: (error: unknown) => void) {
  const clock = { now: AT };
  const log = createFeedbackLog({ files, device: DEVICE, build: BUILD, now: () => clock.now, offset: () => 480, ...failed ? { failed } : {} });
  const session = createPreview({ path: PATH, deck: parseDeck(text), reveal: true, feedback: previewSink(log, PATH, text) });
  assert.ok(session);
  return { log, session, clock };
}
const settle = async (): Promise<void> => { for (let i = 0; i < 5; i++) await new Promise(resolve => setImmediate(resolve)); };
const lines = (text: string | undefined): Record<string, unknown>[] => (text ?? '').split('\n').filter(line => line !== '').map(line => JSON.parse(line) as Record<string, unknown>);
const fingerprints = (text: string): string[] => parseDeck(text).targets.flatMap(target => target.prompts.map(prompt => prompt.fingerprint));
const shown = (s: Session): string[] => {
  const view = s.view();
  return view.kind === 'card' ? view.card.card.blanks.map(blank => blank.lt) : [];
};

void test('syntax.md §11 的範例：檔名照 feedbackLogPath，每一行的欄位與順序和寫的一方相同', async () => {
  const syntax = readFileSync(new URL('../docs/syntax.md', import.meta.url), 'utf8').replaceAll('\r\n', '\n');
  const example = /```\n紀錄\/回饋\/(.+)\n\n([^]*?)\n```/.exec(syntax.slice(syntax.indexOf('## 11. 回饋紀錄')));
  assert.ok(example, 'syntax.md §11 的範例不見了');
  const [, name, text] = example;
  assert.equal(name, FILE.slice(FILE.lastIndexOf('/') + 1));
  const memory = createMemoryFiles();
  const { session } = setup(memory.files, DECK);
  session.feedback?.({ kind: 'rate', rate: 'fix' });
  session.feedback?.({ kind: 'tag', tag: 'explain' });
  session.feedback?.({ kind: 'tag', tag: 'layout' });
  session.feedback?.({ kind: 'note', note: '沒講為什麼用過去進行式' });
  await settle();
  const written = lines(memory.texts.get(FILE));
  assert.deepEqual(lines(text).map(line => Object.keys(line)), [Object.keys(written[1]), Object.keys(written[3])]);
});

void test('檔名與資料夾：照當地的年月與裝置碼，「回饋」兩個字；資料夾裡的都算（含衝突副本），旁邊的不算', () => {
  assert.equal(feedbackLogPath(AT, 480, DEVICE), FILE);
  assert.equal(feedbackLogPath(Date.parse('2026-11-30T16:30:00Z'), 480, DEVICE), 'Essence Cards/紀錄/回饋/2026-12 iPhone-7f3a 回饋.jsonl');
  assert.equal(FEEDBACK_FOLDER, 'Essence Cards/紀錄/回饋');
  assert.equal(isFeedbackLogPath('Essence Cards/紀錄/回饋/2026-12 iPhone-7f3a 回饋 2.jsonl'), true);
  assert.equal(isFeedbackLogPath('Essence Cards/紀錄/回饋.jsonl'), false);
  assert.equal(isFeedbackLogPath('Essence Cards/紀錄/回饋舊/x.jsonl'), false);
  assert.equal(isFeedbackLogPath('Essence Cards/紀錄/2026-12 iPhone-7f3a.jsonl'), false);
});

void test('§6 第 2～4 項：點要改寫一行，欄位照 §11 的順序；加標籤、收回、改回可以用各一行；預覽不寫其他檔', async () => {
  const memory = createMemoryFiles({ [PATH]: DECK });
  const { session, clock } = setup(memory.files, DECK);
  const [v] = fingerprints(DECK);
  session.feedback?.({ kind: 'rate', rate: 'fix' });
  await settle();
  clock.now += 1000;
  session.feedback?.({ kind: 'tag', tag: 'explain' });
  session.feedback?.({ kind: 'tag', tag: 'layout' });
  session.feedback?.({ kind: 'note', note: '沒講\n為什麼' });
  await settle();
  session.feedback?.({ kind: 'rate', rate: 'ok' });
  session.feedback?.({ kind: 'rate', rate: 'ok' });
  session.feedback?.({ kind: 'note', note: '' });
  await settle();
  const written = lines(memory.texts.get(FILE));
  const run = '2026-12-03T21:15:03.250+08:00';
  assert.deepEqual(Object.keys(written[0]), ['t', 'build', 'run', 'path', 'cells', 'rate', 'card']);
  assert.deepEqual(written[0], { t: '2026-12-03T21:15:03.250+08:00', build: BUILD, run, path: PATH, cells: [{ lt: 'k3m9x2', v }], rate: 'fix', card: ONE });
  assert.deepEqual(Object.keys(written[3]), ['t', 'build', 'run', 'path', 'cells', 'rate', 'tags', 'note', 'card']);
  // 同一刻的幾行，t 照順序各加 1 毫秒（嚴格遞增）；同一輪的 run 都相同。
  assert.deepEqual(written.slice(1, 4).map(line => line.t), ['2026-12-03T21:15:04.250+08:00', '2026-12-03T21:15:04.251+08:00', '2026-12-03T21:15:04.252+08:00']);
  assert.ok(written.every(line => line.run === run));
  assert.deepEqual(written.map(line => [line.rate ?? null, line.tags ?? null, line.note ?? null]), [
    ['fix', null, null],
    ['fix', ['explain'], null],
    ['fix', ['explain', 'layout'], null],
    ['fix', ['explain', 'layout'], '沒講 為什麼'],
    ['ok', null, '沒講 為什麼'],
    [null, null, '沒講 為什麼'],
    [null, null, null],
  ]);
  assert.ok(written.every(line => line.card === ONE && JSON.stringify(line.cells) === JSON.stringify([{ lt: 'k3m9x2', v }])));
  assert.deepEqual([...memory.texts.keys()].sort(), [FILE, PATH].sort());
});

void test('§6 第 6 項：比較卡的每一格、照筆記順序的原文（中間隔了別的目標也只取組員）；全詩順序卡、句子排序一題好幾格只有一對', async () => {
  const BORROW = '- borrow（borrow、lend） 比較 ^borrow\n    - Can I ＿＿ your pen? :: borrow';
  const OTHER = '- 不相干的目標 ^other1\n    - 第三題 :: 三';
  const LEND = '- lend（borrow、lend） 比較 ^lendxx\n    - Can you ＿＿ me a pen? :: lend\n        - 詳解：lend 是借出去';
  const MORE = '\n    - May I ＿＿ your book? :: borrow\n    - Could I ＿＿ it? :: borrow';
  const compare = HEAD + BORROW + MORE + '\n' + OTHER + '\n## 另一節\n' + LEND + '\n';
  const memory = createMemoryFiles();
  const { session } = setup(memory.files, compare);
  const [vBorrow, vMay, vMore, , vLend] = fingerprints(compare);
  assert.deepEqual([...shown(session)].sort(), ['borrow', 'borrow', 'lendxx']);
  session.feedback?.({ kind: 'rate', rate: 'drop' });
  // 剩下的那一句自己一張：cells 只有那一格，原文照樣是整組（和畫面的對照同一批）。
  session.forward();
  assert.deepEqual(shown(session), ['borrow']);
  session.feedback?.({ kind: 'rate', rate: 'ok' });
  await settle();
  const [line, rest] = lines(memory.texts.get(FILE));
  assert.deepEqual(new Set(line.cells as { lt: string; v: string }[]), new Set([{ lt: 'borrow', v: vBorrow }, { lt: 'borrow', v: vMay }, { lt: 'lendxx', v: vLend }]));
  assert.equal(line.card, BORROW + MORE + '\n\n' + LEND);
  assert.deepEqual(rest.cells, [{ lt: 'borrow', v: vMore }]);
  assert.equal(rest.card, BORROW + MORE + '\n\n' + LEND);

  const POEM = '### 鳥鳴澗\n- 鳥鳴澗 全詩 排序 ^b3pmae\n    - ==人閒桂花落==，==夜靜春山空==。==月出驚山鳥==，==時鳴春澗中==。\n    - 記憶錨點：由靜寫到動';
  const poem = '---\n科目: 國語\n---\n' + POEM + '\n';
  const poems = createMemoryFiles();
  const second = setup(poems.files, poem);
  assert.equal(shown(second.session).length, 4);
  second.session.feedback?.({ kind: 'rate', rate: 'ok' });
  await settle();
  const [poemLine] = lines(poems.texts.get(FILE));
  assert.deepEqual(poemLine.cells, [{ lt: 'b3pmae', v: fingerprints(poem)[0] }]);
  assert.equal(poemLine.card, POEM.slice(POEM.indexOf('- ')));

  const SENTENCE = '- 間接問句 排序 ^order1\n    - 他住在哪裡？==where== ==does== ==he== ==live==?\n        - 詳解：問句的詞序';
  const sentence = HEAD + SENTENCE + '\n';
  const sentences = createMemoryFiles();
  const third = setup(sentences.files, sentence);
  assert.ok(shown(third.session).length > 1);
  third.session.feedback?.({ kind: 'rate', rate: 'ok' });
  await settle();
  assert.deepEqual(lines(sentences.texts.get(FILE))[0].cells, [{ lt: 'order1', v: fingerprints(sentence)[0] }]);
});

void test('原文：CRLF 換成 \\n、Tab 縮排原樣、結尾沒有換行也切得到；目標底下的空行不算進去', async () => {
  const body = '- 目標一 ^a1b2c3\n\t- 第一題 :: 一\n\t\t- 詳解：因為';
  const text = (HEAD + body + '\n\n\n- 目標二 ^d4e5f6\n    - 第二題 :: 二').replaceAll('\n', '\r\n');
  const memory = createMemoryFiles();
  const { session } = setup(memory.files, text);
  session.feedback?.({ kind: 'rate', rate: 'fix' });
  session.forward();
  session.feedback?.({ kind: 'rate', rate: 'ok' });
  await settle();
  assert.deepEqual(lines(memory.texts.get(FILE)).map(line => line.card), [body, '- 目標二 ^d4e5f6\n    - 第二題 :: 二']);
});

void test('兩輪預覽：同一張卡各留一次，兩行的 run 不同（第二輪的收回只收回那一輪，格式查核 F1）；跨月照每一行的 t 換檔', async () => {
  const memory = createMemoryFiles();
  const first = setup(memory.files, DECK);
  first.session.feedback?.({ kind: 'rate', rate: 'fix' });
  await settle();
  const late = Date.parse('2026-12-31T23:59:59.999+08:00');
  const second = setup(memory.files, DECK);
  second.clock.now = late;
  second.session.feedback?.({ kind: 'rate', rate: 'ok' });
  await settle();
  second.clock.now = late + 1;
  second.session.feedback?.({ kind: 'rate', rate: 'ok' });
  await settle();
  const december = lines(memory.texts.get(FILE));
  assert.deepEqual(december.map(line => [line.run, line.rate ?? null]), [['2026-12-03T21:15:03.250+08:00', 'fix'], ['2026-12-03T21:15:03.250+08:00', 'ok']]);
  assert.notEqual(first.log, second.log);
  const january = lines(memory.texts.get('Essence Cards/紀錄/回饋/2027-01 iPhone-7f3a 回饋.jsonl'));
  assert.deepEqual(january.map(line => [line.t, line.rate ?? null]), [['2027-01-01T00:00:00.000+08:00', null]]);
});

const entry = (card: string): FeedbackEntry => ({ path: PATH, cells: [{ lt: 'k3m9x2', v: 'a1b2c3d4' }], rate: 'fix', tags: ['explain'], note: '看不懂', card });
const LONE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;

void test('§6 第 11 項：一行超過 16,000 bytes 時截短 card、寫 cut；整行剛好不超過，中文、表情符號、要跳脫的字不切在半個字上', async () => {
  const memory = createMemoryFiles();
  const { log } = setup(memory.files, DECK);
  const long = '- 很長的目標 ^k3m9x2\n' + '    - 詳解：「引號」\\反斜線\t😀中文'.repeat(1200);
  assert.equal(await log.write(entry(long)), 'saved');
  const raw = (memory.texts.get(FILE) ?? '').trimEnd();
  const bytes = new TextEncoder().encode(raw).length;
  assert.ok(bytes <= 16_000 && bytes > 15_980, String(bytes));
  const [line] = lines(raw);
  assert.deepEqual(Object.keys(line), ['t', 'build', 'run', 'path', 'cells', 'rate', 'tags', 'note', 'card', 'cut']);
  assert.equal(line.cut, true);
  assert.ok(long.startsWith(line.card as string) && (line.card as string).length < long.length);
  assert.equal(LONE.test(line.card as string), false);
  // 剛好放得下的不截。
  const fresh = createMemoryFiles();
  const short = setup(fresh.files, DECK).log;
  assert.equal(await short.write(entry('- 短的 ^k3m9x2')), 'saved');
  assert.equal(lines(fresh.texts.get(FILE))[0].cut, undefined);
});

void test('§6 第 12 項：一次預覽第 1,001 次不寫、回 full；換一次預覽重新算', async () => {
  const memory = createMemoryFiles();
  const { log } = setup(memory.files, DECK);
  for (let i = 0; i < 1000; i++) assert.equal(await log.write(entry('- 卡 ^k3m9x2')), 'saved');
  assert.equal(await log.write(entry('- 卡 ^k3m9x2')), 'full');
  assert.equal(lines(memory.texts.get(FILE)).length, 1000);
  assert.equal(await setup(memory.files, DECK).log.write(entry('- 卡 ^k3m9x2')), 'saved');
  assert.equal(lines(memory.texts.get(FILE)).length, 1001);
});

void test('§6 第 13 項：append 丟錯回 failed、交給錯誤紀錄；再點一次成功就寫完整的一行', async () => {
  const memory = createMemoryFiles();
  const errors: unknown[] = [];
  const { session } = setup(memory.files, DECK, error => { errors.push(error); });
  memory.control.failAppend = true;
  session.feedback?.({ kind: 'rate', rate: 'fix' });
  await settle();
  const view = session.view();
  assert.equal(view.kind === 'card' && view.card.feedback?.status, 'failed');
  assert.equal(errors.length, 1);
  assert.equal(memory.texts.has(FILE), false);
  memory.control.failAppend = false;
  session.feedback?.({ kind: 'tag', tag: 'point' });
  await settle();
  assert.deepEqual(lines(memory.texts.get(FILE)).map(line => [line.rate, line.tags]), [['fix', ['point']]]);
  // 交給錯誤紀錄的一方丟錯也照樣回 failed。
  const broken = createMemoryFiles();
  broken.control.failAppend = true;
  const log = createFeedbackLog({ files: broken.files, device: DEVICE, build: BUILD, failed: () => { throw Error('記不下來'); } });
  assert.equal(await log.write(entry('- 卡 ^k3m9x2')), 'failed');
});
