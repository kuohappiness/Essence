import test from 'node:test';
import assert from 'node:assert/strict';
import { parseDeck } from '../src/core/deck/index.ts';
import { encodeEntry, mergeHistory, nextCard, planToday } from '../src/core/study/index.ts';
import type { DeckEntry, ExamScope, Pick, TodayInput } from '../src/core/study/index.ts';

// 接句卡在佇列裡（D-189 第 1 點、tasks/couplet-cards.md §4、§5）：純函式，預期值照 D-189 寫的「第 1、3、2、4 句」手寫。
const P = 'Essence Cards/國語/古詩.md';
const couplets = (title: string, prefix: string, lines: readonly string[]): string => lines.map((line, i) => {
  const mate = lines[i % 2 ? i - 1 : i + 1];
  const text = i % 2 ? `${mate}，==${line}==。` : `==${line}==，${mate}。`;
  return `- ${title} 第 ${String(i + 1)} 句 接句 ^${prefix}${String(i + 1)}\n    - ${text}\n`;
}).join('');
const order = (prefix: string, lines: readonly string[]): string => `- 全詩 排序 ^${prefix}9\n    - ${lines.map((line, i) => `==${line}==${i % 2 ? '。' : '，'}`).join('')}\n`;
const NIAO = ['人閒桂花落', '夜靜春山空', '月出驚山鳥', '時鳴春澗中'];
const CHUN = ['春眠不覺曉', '處處聞啼鳥', '夜來風雨聲', '花落知多少'];
const ONE = `---\n科目: 國語\n---\n### 鳥鳴澗\n${couplets('鳥鳴澗', 'b3pma', NIAO)}${order('b3pma', NIAO)}`;

const entry = (text: string): DeckEntry => ({ path: P, deck: parseDeck(text) });
const printOf = (deck: DeckEntry, lt: string): string => deck.deck.targets.find(target => target.id === lt)?.prompts[0].fingerprint ?? '';
const input = (deck: DeckEntry, lines: readonly string[], now: number, exam: ExamScope | null = null): TodayInput => ({
  decks: [deck], history: mergeHistory([{ path: 'Essence Cards/紀錄/2026-11 Phone-test.jsonl', text: lines.join('\n') }]),
  settings: { capMinutes: 60, retention: 0.8, filter: [] }, exam, now, offset: 480,
});
const START = Date.parse('2026-11-15T19:00:00.000+08:00');

/** 照 pick 一張一張答，answer 決定這張答什麼；回傳出現的順序。 */
function run(text: string, pick: (lines: readonly string[]) => Pick, answer: (lt: string, seen: number) => 'good' | 'miss' = () => 'good', exam: ExamScope | null = null, limit = 30): string[] {
  const deck = entry(text);
  const lines: string[] = [];
  const shown: string[] = [];
  let now = START;
  const today = planToday(input(deck, [], now, exam));
  for (let i = 0; i < limit; i++) {
    const data = input(deck, lines, now, exam);
    const found = nextCard(today, data, pick(lines));
    if (found.kind !== 'card') break;
    const lt = found.card.lt;
    const r = answer(lt, shown.filter(each => each === lt).length);
    shown.push(lt);
    now += 10_000;
    lines.push(encodeEntry(new Date(now).toISOString(), { lt, r, v: printOf(deck, lt) }));
    now += 10_000;
  }
  return shown;
}
const ids = (text: string): string[] => parseDeck(text).targets.flatMap(target => target.id === null ? [] : [target.id]);
const practice = (text: string) => (): Pick => ({ targets: ids(text), since: START - 1000 });

void test('全部卡：一首絕句四張新卡出成第 1、3、2、4 句，排序卡最後（D-189 第 1 點）', () => {
  assert.deepEqual(run(ONE, practice(ONE)), ['b3pma1', 'b3pma3', 'b3pma2', 'b3pma4', 'b3pma9']);
});

void test('每日的份：一樣是第 1、3、2、4 句、排序；英文的每日的份不受影響', () => {
  assert.deepEqual(run(ONE, () => ({ subject: '國語' })), ['b3pma1', 'b3pma3', 'b3pma2', 'b3pma4', 'b3pma9']);
});

const TWO = `---\n科目: 國語\n---\n### 鳥鳴澗\n${couplets('鳥鳴澗', 'b3pma', NIAO)}${order('b3pma', NIAO)}### 春曉\n${couplets('春曉', 'b3pmb', CHUN)}${order('b3pmb', CHUN)}`;

void test('兩首一起練：每一對的第一張先出完，排序卡在同一首的接句卡都出過之後', () => {
  const shown = run(TWO, practice(TWO));
  assert.deepEqual(shown.slice(0, 4), ['b3pma1', 'b3pma3', 'b3pmb1', 'b3pmb3'], '每一對的第一張');
  for (const [first, second] of [['b3pma1', 'b3pma2'], ['b3pma3', 'b3pma4'], ['b3pmb1', 'b3pmb2'], ['b3pmb3', 'b3pmb4']]) {
    assert.ok(shown.indexOf(second) - shown.indexOf(first) > 1, `${first} 和 ${second} 隔開`);
  }
  for (const poem of ['b3pma', 'b3pmb']) {
    const last = Math.max(...[1, 2, 3, 4].map(n => shown.indexOf(poem + String(n))));
    assert.ok(shown.indexOf(poem + '9') > last, `${poem} 的排序卡在接句卡之後`);
  }
  assert.equal(shown.length, 10);
});

void test('答錯再出也照隔開：第 1 句答錯，第 2 句不會緊接在它再出之後', () => {
  const shown = run(ONE, practice(ONE), (lt, seen) => lt === 'b3pma1' && seen === 0 ? 'miss' : 'good');
  assert.equal(shown.filter(lt => lt === 'b3pma1').length, 2);
  const again = shown.lastIndexOf('b3pma1');
  assert.notEqual(shown[again + 1], 'b3pma2');
  assert.notEqual(shown[again - 1], 'b3pma2');
});

void test('沒有詩名或編號重複時不配對，照筆記順序出', () => {
  const bare = `---\n科目: 國語\n---\n${couplets('鳥鳴澗', 'b3pma', NIAO)}`;
  assert.deepEqual(run(bare, practice(bare)), ['b3pma1', 'b3pma2', 'b3pma3', 'b3pma4']);
  const twice = `---\n科目: 國語\n---\n### 鳥鳴澗\n${couplets('鳥鳴澗', 'b3pma', NIAO).replace('第 2 句', '第 1 句')}`;
  assert.deepEqual(run(twice, practice(twice)).slice(0, 2), ['b3pma1', 'b3pma2'], '兩張都叫第 1 句，第 2 句找不到對方');
});

void test('段考範圍只含排序卡時，排序卡照樣等同一首的新接句卡出完（backlog〈已知的限制〉）', () => {
  const exam: ExamScope = { contains: (_entry, target) => target.order !== undefined, hasPeriod: false };
  const deck = entry(ONE);
  assert.equal(planToday(input(deck, [], START, exam)).share[0].lt, 'b3pma9', '排序卡在 exam-new，排在最前面');
  assert.deepEqual(run(ONE, () => ({ subject: '國語' }), undefined, exam), ['b3pma1', 'b3pma3', 'b3pma2', 'b3pma4', 'b3pma9']);
});

void test('排序卡已經學過時照自己的到期時間，不等新的接句卡', () => {
  const deck = entry(ONE);
  const before = Date.parse('2026-11-01T19:00:00.000+08:00');
  const old = encodeEntry(new Date(before).toISOString(), { lt: 'b3pma9', r: 'good', v: printOf(deck, 'b3pma9') });
  const data = input(deck, [old], START);
  const found = nextCard(planToday(data), data, { targets: ids(ONE), since: START - 1000 });
  assert.equal(found.kind === 'card' && found.card.lt, 'b3pma9');
});

// L2 第一輪 R1：同一篇兩個同名小標題是兩首詩（杜甫有好幾首〈絕句〉），配對與排序卡的等待各算各的。
const SAME = `---\n科目: 國語\n---\n### 絕句\n${couplets('絕句', 'b3pma', NIAO)}${order('b3pma', NIAO)}### 絕句\n${couplets('絕句', 'b3pmb', CHUN)}${order('b3pmb', CHUN)}`;

void test('同名的兩首詩各自配對，排序卡只等自己那一首（L2 R1）', () => {
  const expected = ['b3pma1', 'b3pma3', 'b3pmb1', 'b3pmb3', 'b3pma2', 'b3pma4', 'b3pma9', 'b3pmb2', 'b3pmb4', 'b3pmb9'];
  assert.deepEqual(run(SAME, practice(SAME)), expected, '全部卡');
  assert.deepEqual(run(SAME, () => ({ subject: '國語' })), expected, '每日的份');
});

void test('同名的兩首各缺一邊時不會配到另一首（L2 R1）', () => {
  const lines = couplets('絕句', 'b3pmb', CHUN).split(/(?=- 絕句)/);
  const text = `---\n科目: 國語\n---\n### 絕句\n${couplets('絕句', 'b3pma', NIAO).split(/(?=- 絕句)/)[0]}### 絕句\n${lines[1]}${lines[2]}`;
  assert.deepEqual(run(text, practice(text)), ['b3pma1', 'b3pmb2', 'b3pmb3']);
});

// L2 第一輪 R3：對方不在今天的範圍（還沒到期），但今天在全部卡答過，每日的份照樣隔開；只剩它時直接出。
void test('每日的份：對方今天在全部卡答過、自己在今天的份時照樣隔開（L2 R3）', () => {
  const pair = couplets('鳥鳴澗', 'b3pma', NIAO).split(/(?=- 鳥鳴澗)/).slice(0, 2).join('');
  const deck = entry(`---\n科目: 國語\n---\n### 鳥鳴澗\n${pair}### 其他\n- 一般 填空 ^b3pmc1\n    - ==清風==徐來\n`);
  const yesterday = encodeEntry('2026-11-14T19:00:00.000+08:00', { lt: 'b3pma1', r: 'easy', v: printOf(deck, 'b3pma1') });
  const plan = planToday(input(deck, [yesterday], START));
  assert.deepEqual(plan.share.map(item => item.lt), ['b3pma2', 'b3pmc1'], '第 1 句還沒到期，不在今天的份');
  const practiced = encodeEntry(new Date(START + 10_000).toISOString(), { lt: 'b3pma1', r: 'good', v: printOf(deck, 'b3pma1') });
  const first = nextCard(plan, input(deck, [yesterday, practiced], START + 20_000), { subject: '國語' });
  assert.equal(first.kind === 'card' && first.card.lt, 'b3pmc1', '先用別張穿插');
  const plain = encodeEntry(new Date(START + 30_000).toISOString(), { lt: 'b3pmc1', r: 'good', v: printOf(deck, 'b3pmc1') });
  const second = nextCard(plan, input(deck, [yesterday, practiced, plain], START + 40_000), { subject: '國語' });
  assert.equal(second.kind === 'card' && second.card.lt, 'b3pma2', '只剩它時直接出');
});

// L2 第二輪 R7：暫停、今天沒答過的同編號舊卡不當對方，也不取消有效的配對；今天答過才暫停的照樣算。
void test('每日的份：暫停的同編號舊卡不取消配對；對方今天答過之後才暫停，照樣隔開（L2 R7）', () => {
  const pair = couplets('鳥鳴澗', 'b3pma', NIAO).split(/(?=- 鳥鳴澗)/).slice(0, 2).join('');
  const old = '- 鳥鳴澗 第 1 句 接句 ^b3pmz1\n    - 狀態：暫停\n    - ==人閒桂花落==，夜靜春山空。\n';
  const tail = '### 其他\n- 一般 填空 ^b3pmc1\n    - ==清風==徐來\n';
  const firstOf = (text: string): string => {
    const deck = entry(text);
    const yesterday = encodeEntry('2026-11-14T19:00:00.000+08:00', { lt: 'b3pma1', r: 'easy', v: printOf(deck, 'b3pma1') });
    const plan = planToday(input(deck, [yesterday], START));
    const practiced = encodeEntry(new Date(START + 10_000).toISOString(), { lt: 'b3pma1', r: 'good', v: printOf(deck, 'b3pma1') });
    const found = nextCard(plan, input(deck, [yesterday, practiced], START + 20_000), { subject: '國語' });
    return found.kind === 'card' ? found.card.lt : found.kind;
  };
  assert.equal(firstOf(`---\n科目: 國語\n---\n### 鳥鳴澗\n${pair}${old}${tail}`), 'b3pmc1', '暫停的舊卡');
  const paused = pair.replace('^b3pma1\n', '^b3pma1\n    - 狀態：暫停\n');
  assert.equal(firstOf(`---\n科目: 國語\n---\n### 鳥鳴澗\n${paused}${tail}`), 'b3pmc1', '答過之後才暫停');
});
