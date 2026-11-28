import test from 'node:test';
import assert from 'node:assert/strict';
import { parseDeck } from '../src/core/deck/index.ts';
import { encodeEntry, mergeHistory, nextCard, planToday, questionType } from '../src/core/study/index.ts';
import type { Card, DeckEntry, Next, Pick, Today, TodayInput } from '../src/core/study/index.ts';
import { createPreview } from '../src/review/index.ts';

// 單選與配對的組卡（tasks/matching-single-choice.md §4、〈驗收〉組卡）：預期值手寫，不用同樣的算法再算一次。
const P = 'Essence Cards/社會/海岸.md';
const COAST = ['北部', '東部', '西部', '南部'];
const OPTIONS = '    - 選項：北部;;東部;;西部;;南部';
const target = (id: string, name: string, question: string, answer: string, options = OPTIONS): string =>
  `- ${name} ^${id}\n    - ${question} :: ${answer}\n${options}\n`;
const COASTS = target('west00', '能認出西部的海岸', '海岸平直，有沙灘和潟湖，是哪一部的海岸？', '西部')
  + target('east00', '能認出東部的海岸', '山緊靠著海，海岸陡直，是哪一部的海岸？', '東部')
  + target('north0', '能認出北部的海岸', '岬灣交錯，是哪一部的海岸？', '北部')
  + target('south0', '能認出南部的海岸', '有珊瑚礁，是哪一部的海岸？', '南部');
const ALL = ['east00', 'north0', 'south0', 'west00'];
const deckOf = (body: string, path = P): DeckEntry => ({ path, deck: parseDeck(`---\n科目: 社會\n---\n${body}`) });
const coasts = deckOf(COASTS);
const at = (date: string, time = '19:00:00.000'): string => `2026-${date}T${time}+08:00`;
function v(deck: DeckEntry, lt: string, index = 0): string {
  const found = deck.deck.targets.find(each => each.id === lt);
  assert.ok(found, lt);
  return found.prompts[index].fingerprint;
}
function input(decks: DeckEntry[], lines: readonly string[], now: string, cap = 30): TodayInput {
  return { decks, history: mergeHistory([{ path: 'Essence Cards/紀錄/2026-10 Phone-test.jsonl', text: lines.join('\n') }]), settings: { capMinutes: cap, retention: 0.8, filter: [] }, exam: null, now: Date.parse(now), offset: 480 };
}
const good = (t: string, lt: string, print: string, pick = '西部'): string => encodeEntry(t, { lt, r: 'good', v: print, pick });
function card(next: Next): Card {
  assert.equal(next.kind, 'card');
  if (next.kind !== 'card') throw Error();
  return next.card;
}
const SUBJECT: Pick = { subject: '社會' };
const next = (today: Today, data: TodayInput, pick: Pick = SUBJECT): Card => card(nextCard(today, data, pick));
const plan = (decks: DeckEntry[], lines: readonly string[], now: string, cap?: number): { today: Today; data: TodayInput } => {
  const data = input(decks, lines, now, cap);
  return { today: planToday(data), data };
};
const ids = (c: Card): string[] => c.blanks.map(blank => blank.lt).sort();
/** 東、北、南三個前一天答對（還沒到期），西部是新的。 */
const othersGood = (when: string): string[] => ['east00', 'north0', 'south0'].map(lt => good(when, lt, v(coasts, lt)));

void test('單選：一組只有一個目標，一張一格；字鍵是全部選項，卡上沒有標題，題型是點選', () => {
  const one = deckOf(target('west00', '能認出西部的海岸', '海岸平直，是哪一部的海岸？', '西部'));
  const { today, data } = plan([one], [], at('10-24'));
  const c = next(today, data);
  assert.equal(questionType(c), 'pick');
  assert.deepEqual(c.blanks.map(blank => [blank.lt, blank.answer]), [['west00', '西部']]);
  assert.deepEqual(c.group?.members, COAST);
  assert.deepEqual([...c.group?.keys ?? []].sort(), [...COAST].sort());
  assert.notDeepEqual(c.group?.keys, COAST);
  assert.deepEqual([c.group?.title, c.group?.rows, c.group?.single], ['', [], true]);
  assert.equal(c.isNew, true);
});

void test('配對：同一組 4 個新目標，出一張 4 格；每一格的答案照選中的目標的寫法', () => {
  const { today, data } = plan([coasts], [], at('10-24'));
  assert.deepEqual(today.share.map(item => item.lt).sort(), ALL);
  const c = next(today, data);
  assert.deepEqual(ids(c), ALL);
  assert.deepEqual(Object.fromEntries(c.blanks.map(blank => [blank.lt, blank.answer])), { west00: '西部', east00: '東部', north0: '北部', south0: '南部' });
  assert.ok(c.blanks.some(blank => blank.lt === c.lt && blank.prompt === c.prompt));
});

void test('配對：只有一個要出（新的），沒到期的三個也跟著出，整組一張 4 格；跟著出的在同一份裡、不占時間', () => {
  const { today, data } = plan([coasts], othersGood(at('10-23')), at('10-24'), 0.25);
  // 15 秒的上限：只放得下一格的時間（沒有紀錄時一格 15 秒），跟著出的不占，照樣全在今天的份。
  assert.deepEqual(today.share.map(item => item.lt), ['west00', 'east00', 'north0', 'south0']);
  assert.deepEqual(today.more, []);
  assert.deepEqual(ids(next(today, data)), ALL);
});

void test('配對：只有一個到期，整組一張 4 格', () => {
  const lines = [good(at('10-01'), 'west00', v(coasts, 'west00')), ...othersGood(at('10-23'))];
  const { today, data } = plan([coasts], lines, at('10-24'));
  assert.deepEqual(ids(next(today, data)), ALL);
});

void test('配對：寫法、順序不同的同一組照樣併，答案換成選中的目標的寫法', () => {
  const mixed = deckOf(target('west00', '能認出西部的海岸', '海岸平直，是哪一部的海岸？', '西部')
    + target('east00', '能認出東部的海岸', '山緊靠著海，是哪一部的海岸？', '**東部**', '    - 選項：南部;;**東部**;;西部;;北部'));
  const { today, data } = plan([mixed], [], at('10-24'));
  const c = next(today, data);
  assert.equal(c.lt, 'west00');
  assert.deepEqual(c.group?.members, COAST);
  assert.deepEqual(Object.fromEntries(c.blanks.map(blank => [blank.lt, blank.answer])), { west00: '西部', east00: '東部' });
});

void test('配對：不同組、不同篇、比較卡的組不併', () => {
  const kinds = deckOf(COASTS + target('rock00', '能說出北部海岸的地形', '北部的海岸是哪一種？', '岩岸', '    - 選項：岩岸;;沙岸;;斷層海岸')
    + '- 寨（寨、塞、寒） 相似字 ^zhai00\n    - 山＿＿ :: 寨\n- 塞（寨、塞、寒） 相似字 ^sai000\n    - 大＿＿車 :: 塞\n'
    + target('han000', '能分辨寒', '「＿＿冷」要填哪個字？', '寒', '    - 選項：寨;;塞;;寒'));
  const twin = deckOf(COASTS.replaceAll('00\n', '01\n').replaceAll('0\n', '1\n'), 'Essence Cards/社會/另一篇.md');
  const { today, data } = plan([kinds, twin], [], at('10-24'));
  assert.deepEqual(ids(next(today, data, { deck: P })), ALL);
  const rock = next(today, { ...data }, { targets: ['rock00'] });
  assert.deepEqual(ids(rock), ['rock00']);
  // 單選的選項剛好和比較卡的括號一樣：比較卡不併它，它也不併比較卡。
  assert.equal(parseDeck(`---\n科目: 社會\n---\n${target('han000', '能分辨寒', '「＿＿冷」要填哪個字？', '寒', '    - 選項：寨;;塞;;寒')}`).targets[0].kind?.id, 'single');
  assert.deepEqual(ids(next(today, data, { targets: ['zhai00', 'sai000', 'han000'] })), ['sai000', 'zhai00']);
  assert.deepEqual(ids(next(today, data, { targets: ['han000'] })), ['han000']);
  assert.deepEqual(ids(next(today, data, { deck: 'Essence Cards/社會/另一篇.md' })), ['east01', 'north1', 'south1', 'west01']);
});

void test('配對：同一組 7 個目標照筆記順序切成 5、2 兩張，兩張都出；不多放一題', () => {
  const seven = deckOf(['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((x, i) => target(`${x}${x}${x}000`, `能認出第 ${String(i + 1)} 個`, `第 ${String(i + 1)} 題是哪一部？`, COAST[i % 4])).join(''));
  const { today, data } = plan([seven], [], at('10-24'));
  const first = next(today, data);
  assert.deepEqual(ids(first), ['aaa000', 'bbb000', 'ccc000', 'ddd000', 'eee000']);
  assert.deepEqual(ids(next(today, data, { targets: ['ggg000'] })), ['fff000', 'ggg000']);
  assert.equal(first.blanks.length, 5);
});

const SEVEN = ['aaa000', 'bbb000', 'ccc000', 'ddd000', 'eee000', 'fff000', 'ggg000'];
const sevenOf = (ids: readonly string[] = SEVEN, path = P): DeckEntry => deckOf(ids.map((id, i) => target(id, `能認出第 ${String(i + 1)} 個`, `第 ${String(i + 1)} 題是哪一部？`, COAST[i % 4])).join(''), path);
const plainOf = (n: number, path: string, head = ''): DeckEntry => ({ path, deck: parseDeck(`---\n科目: 社會\n${head}---\n` + Array.from({ length: n }, (_, i) => `- 能說出第 ${String(i + 1)} 個 ^p${String(i).padStart(5, '0')}\n    - 第 ${String(i + 1)} 個？ :: 答${String(i + 1)}\n`).join('')) });
const where = (today: Today, lt: string): 'share' | 'more' | null => today.share.some(item => item.lt === lt) ? 'share' : today.more.some(item => item.lt === lt) ? 'more' : null;

void test('配對：切開的每一張各自出（L2 第三輪 1、2，§4〈上限〉）：那一張有一格要出才出、整張作答，別張沒有要出的不跟著出', () => {
  const seven = sevenOf();
  const later = SEVEN.slice(1).map(lt => good(at('10-23'), lt, v(seven, lt)));
  const { today, data } = plan([seven], later, at('10-24'), 0.25);
  assert.deepEqual([today.share.map(item => item.lt), today.more], [SEVEN.slice(0, 5), []]);
  assert.deepEqual(ids(next(today, data)), SEVEN.slice(0, 5));
  // 反過來，只有第二張有要出的：只出第二張（跟著出的接在要出的後面）。
  const first = SEVEN.slice(0, 6).map(lt => good(at('10-23'), lt, v(seven, lt)));
  assert.deepEqual(plan([seven], first, at('10-24'), 0.25).today.share.map(item => item.lt), ['ggg000', 'fff000']);
});

void test('配對：一組很大時（L2 第三輪 1），前面幾張照放進今天的份，放不下的那張和後面的進「再複習一些」', () => {
  const big = Array.from({ length: 21 }, (_, i) => `g${String(i).padStart(5, '0')}`);
  const today = plan([sevenOf(big), plainOf(1, 'Essence Cards/社會/海洋.md')], [], at('10-24'), 5).today;
  assert.deepEqual([today.share.map(item => item.lt), today.more.map(item => item.lt)], [big.slice(0, 20), [big[20], 'p00000']]);
});

void test('配對：別張的新目標不借先出那一張的先後（L2 第三輪 2）：到期的一般目標照樣排在新的前面', () => {
  // 第二張只有一格，前一天答錯，在重學；第一張 5 格都是新的。19 個一般目標都到期了，加上重學的一格剛好 5 分鐘。
  const six = SEVEN.slice(0, 6);
  const group = sevenOf(six);
  const plain = plainOf(19, 'Essence Cards/社會/一般.md');
  const due = Array.from({ length: 19 }, (_, i) => `p${String(i).padStart(5, '0')}`);
  const lines = [...due.map(lt => good(at('10-04'), lt, v(plain, lt))), encodeEntry(at('10-23', '21:00:00.000'), { lt: 'fff000', r: 'miss', v: v(group, 'fff000'), pick: null })];
  const today = plan([plain, group], lines, at('10-24'), 5).today;
  assert.deepEqual(today.share.map(item => item.lt).sort(), ['fff000', ...due].sort());
  assert.deepEqual(today.more.map(item => item.lt), six.slice(0, 5));
});

void test('配對：切開的組整類（第 3 代）：每一張整張在同一份、沒有要出的那張不出', () => {
  const seven = sevenOf();
  const plain = plainOf(16, 'Essence Cards/社會/一般.md');
  const patterns = [[], ['eee000', 'ggg000'], SEVEN.slice(0, 5), ['fff000', 'ggg000'], ['bbb000', 'fff000'], SEVEN.slice(1)];
  for (const before of [[], [plain]]) for (const skip of patterns) for (let quarter = 1; quarter <= 24; quarter++) {
    const today = plan([...before, seven], skip.map(lt => good(at('10-23'), lt, v(seven, lt))), at('10-24'), quarter / 4).today;
    const say = JSON.stringify({ before: before.length, skip, quarter });
    for (const card of [SEVEN.slice(0, 5), SEVEN.slice(5)]) {
      const places = new Set(card.map(lt => where(today, lt)));
      assert.equal(places.size, 1, say);
      assert.equal(places.has(null), card.every(lt => skip.includes(lt)), say);
    }
  }
});

void test('配對：今天答過一次之後，答錯的那幾格到時間只出那幾格，不再整組', () => {
  const t0 = Date.parse(at('10-24'));
  const when = (seconds: number): string => new Date(t0 + seconds * 1000 + 8 * 3600_000).toISOString().slice(0, 23) + '+08:00';
  const today = planToday(input([coasts], [], at('10-24', '18:00:00.000')));
  const lines = [
    encodeEntry(at('10-24'), { lt: 'west00', r: 'miss', v: v(coasts, 'west00'), pick: null }),
    encodeEntry(at('10-24', '19:00:00.001'), { lt: 'east00', r: 'near', v: v(coasts, 'east00'), pick: '北部', retry: 'right', with: at('10-24') }),
    encodeEntry(at('10-24', '19:00:00.002'), { lt: 'north0', r: 'good', v: v(coasts, 'north0'), pick: '北部', with: at('10-24') }),
    encodeEntry(at('10-24', '19:00:00.003'), { lt: 'south0', r: 'good', v: v(coasts, 'south0'), pick: '南部', with: at('10-24') }),
  ];
  // 沒別張時提早出：答錯的兩個併成一張。
  const early = next(today, input([coasts], lines, when(10)));
  assert.equal(early.early, true);
  assert.deepEqual(ids(early), ['east00', 'west00']);
  // 西部（miss）先到時間、東部（near）還沒：只出西部。
  const west = next(today, input([coasts], lines, when(120)));
  assert.equal(west.early, false);
  assert.deepEqual(ids(west), ['west00']);
});

void test('配對：單篇練習、全部卡的一輪也整組；這一輪答過了只併答錯的', () => {
  const { today, data } = plan([coasts], othersGood(at('10-23')), at('10-24'));
  const since = Date.parse(at('10-24'));
  assert.deepEqual(ids(next(today, data, { targets: ALL, since })), ALL);
  const wrongs = [encodeEntry(at('10-24', '19:00:01.000'), { lt: 'west00', r: 'miss', v: v(coasts, 'west00'), pick: null }),
    ...['east00', 'north0', 'south0'].map((lt, i) => good(at('10-24', `19:00:01.00${String(i + 1)}`), lt, v(coasts, lt)))];
  const round = next(today, input([coasts], [...othersGood(at('10-23')), ...wrongs], at('10-24', '19:10:00.000')), { targets: ALL, since });
  assert.deepEqual(ids(round), ['west00']);
});

void test('配對：字鍵與格子的順序同一張卡重來不變', () => {
  const a = plan([coasts], [], at('10-24'));
  const b = plan([deckOf(COASTS)], [], at('10-24'));
  const x = next(a.today, a.data), y = next(b.today, b.data);
  assert.deepEqual(x.group?.keys, y.group?.keys);
  assert.deepEqual(x.blanks.map(blank => blank.lt), y.blanks.map(blank => blank.lt));
});

void test('配對：題目照出題歷史輪替，第一次出第一題，之後出最久沒出的', () => {
  const two = deckOf(`- 能認出西部的海岸 ^west00\n    - 海岸平直，是哪一部的海岸？ :: 西部\n    - 有沙灘和潟湖的是哪一部的海岸？ :: 西部\n${OPTIONS}\n`);
  const fresh = plan([two], [], at('10-24'));
  assert.equal(next(fresh.today, fresh.data).prompt.fingerprint, v(two, 'west00', 0));
  const again = plan([two], [good(at('10-01'), 'west00', v(two, 'west00', 0))], at('10-24'));
  assert.equal(next(again.today, again.data).prompt.fingerprint, v(two, 'west00', 1));
});

void test('估時：同一組的新目標排在一起，每一格各自的秒數；上限只看今天要出的那幾格', () => {
  const plain = (id: string): string => `- 能說明 ${id} ^${id}\n    - ${id} 是什麼？ :: ${id}\n`;
  const mixed = deckOf(target('west00', '能認出西部的海岸', '海岸平直，是哪一部的海岸？', '西部') + plain('plain0') + target('east00', '能認出東部的海岸', '山靠海，是哪一部的海岸？', '東部'));
  const { today } = plan([mixed], [], at('10-24'));
  assert.deepEqual(today.share.map(item => item.lt), ['west00', 'east00', 'plain0']);
  assert.deepEqual(today.share.map(item => item.seconds), [15, 15, 15]);
  // 兩個新的單選一張要 30 秒：36 秒的上限放得下那一張，第三個進「再複習一些」。
  const tight = plan([mixed], [], at('10-24'), 0.6).today;
  assert.deepEqual([tight.share.map(item => item.lt), tight.more.map(item => item.lt)], [['west00', 'east00'], ['plain0']]);
});

void test('預覽：不併，每一題一張一格，字鍵照樣整組', () => {
  const text = `---\n科目: 社會\n狀態: 草稿\n---\n${COASTS}- 能認出西部的兩題 ^west02\n    - 一 :: 西部\n    - 二 :: 東部\n${OPTIONS}\n`;
  const session = createPreview({ path: P, deck: parseDeck(text), reveal: false });
  assert.ok(session);
  const seen: string[][] = [];
  for (let current = session.view(); current.kind === 'card'; current = session.view()) {
    const c = current.card.card;
    seen.push(c.blanks.map(blank => `${blank.lt}:${blank.answer ?? ''}`));
    assert.equal(c.group?.keys.length, 4);
    session.forward();
  }
  assert.deepEqual(seen, [['west00:西部'], ['east00:東部'], ['north0:北部'], ['south0:南部'], ['west02:西部'], ['west02:東部']]);
});
