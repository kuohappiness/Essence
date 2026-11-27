import type { Choice, PickGroup, PoemOrder, Prompt, SentenceOrder, Target } from '../deck/index.ts';
import type { Blank, Card, CardGroup, Shown } from './types.ts';

// 題型接點的第二個（D-181）：這張卡是哪一種題型、有哪幾格。其他三個在 core/deck/question-types.ts、review/flow.ts、ui/screens.tsx。

/** 新增題型時多一個值，TypeScript 會指出 FLOWS、PREVIEWS、SCREENS 與 tests/question-types.test.ts 的範例缺哪一列；解析或組卡沒接上，那個範例的測試不過。 */
export type QuestionType = 'flip' | 'typed' | 'pick' | 'order';

/** 一張卡是哪一種題型：唯一判斷的地方，Card 不多存一份。排序（全詩、句子）是自己的題型（題型模組任務說明 §1-8），作答照點選填空。 */
export function questionType(card: Card): QuestionType {
  return card.group?.order ? 'order' : card.group ? 'pick' : card.typed ? 'typed' : 'flip';
}

/**
 * 沒有組的目標的一張卡（nextCard、全部卡的一輪、預覽共用）：翻面與打字是一格，就是自己那一題；全詩順序卡是那一題的每一格。
 * times 是這一題出過幾次，全詩順序卡用它換字鍵的順序，每次不同、重來不變。
 */
export function cardOf(fields: Omit<Card, 'typed' | 'blanks'>, times = 0): Card {
  const { lt, deck, target, prompt, isNew, early } = fields;
  const plain = (): Card => ({ lt, deck, target, prompt, isNew, typed: prompt.kind === 'qa' && prompt.typed !== null, early, blanks: [{ lt, target, prompt }] });
  const kind = target.kind;
  if (!kind || prompt.kind !== 'cloze') return plain();
  // 照卡型分（題型模組任務說明 §1-4）：排序再照樣子；比較卡、多音字由 pickCardOf、choiceCardOf 組，走到這裡照一格出。
  switch (kind.id) {
    case 'order': return kind.order.style === 'poem' ? orderCardOf(fields, kind.order, times) : sentenceCardOf(fields, kind.order, times);
    case 'group': case 'polyphone': case 'typing': case 'couplet': return plain();
    default: { const never: never = kind; return never; }
  }
}

// ── 比較卡（tasks/question-type-seam.md §5）：純計算，不用 Math.random，同一張卡重來不變，測試與回放才固定。 ──

/** 併進這張卡的一個目標；shown 是它的出題歷史（§4）。 */
export interface PickMate { lt: string; target: Target; shown: Shown }

const ANCHOR = /^記憶錨點[：:]\s*/;

/** 字串當種子的亂數：FNV-1a 算種子，mulberry32 出數字。 */
function seeded(seed: string): () => number {
  let state = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) state = Math.imul(state ^ seed.charCodeAt(i), 0x01000193) >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = state;
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled<T>(items: readonly T[], random: () => number): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/** 一組句子的種子：每格的指紋，不看格子的順序。 */
const seedOf = (cells: readonly Blank[]): string => cells.map(cell => cell.prompt.fingerprint).sort().join(' ');

/** 這個目標的句子照該出的順序（§5-2）：最久沒出的（沒出過的先）；一樣久的，次數少的先；再一樣照筆記順序。指紋相同的算一句。 */
function rotation(target: Target, shown: Shown): Prompt[] {
  const prints = new Set<string>();
  const distinct = target.prompts.filter(prompt => {
    if (prints.has(prompt.fingerprint)) return false;
    prints.add(prompt.fingerprint);
    return true;
  });
  const at = (prompt: Prompt): number => shown.get(prompt.fingerprint)?.at ?? 0;
  const count = (prompt: Prompt): number => shown.get(prompt.fingerprint)?.count ?? 0;
  return distinct.sort((a, b) => at(a) - at(b) || count(a) - count(b));
}

/** 一格：答案照 group（選中的目標的括號）的寫法，和字鍵相同。 */
function cellOf(group: PickGroup, mate: PickMate, prompt: Prompt): Blank {
  return { lt: mate.lt, target: mate.target, prompt, answer: group.members[group.memberKeys.indexOf((mate.target.kind?.id === 'group' ? mate.target.kind.group.wordKey : undefined) ?? '')] };
}

/** 格子定了之後的一張卡：打散格子與字鍵（§5-3），lt、target、prompt 是選中的目標在畫面上的第一格。 */
function assembled(fields: { deck: string; isNew: boolean; early: boolean }, chosen: PickMate, cells: readonly Blank[], deckTargets: readonly Target[]): Card {
  const random = seeded(seedOf(cells));
  const blanks = shuffled(cells, random);
  const first = blanks.find(each => each.target === chosen.target) ?? blanks[0];
  return { lt: chosen.lt, deck: fields.deck, target: chosen.target, prompt: first.prompt, isNew: fields.isNew, typed: false, early: fields.early, blanks, group: groupOf(chosen.target, deckTargets, random) };
}

/** 字鍵與對照：這篇卡組裡同一組的字，不看它在不在這次的範圍裡（§5-1）。字鍵三個以上時順序一定和括號不同（§5-3）。 */
function groupOf(chosen: Target, deckTargets: readonly Target[], random: () => number): CardGroup {
  const group = chosen.kind?.id === 'group' ? chosen.kind.group : undefined;
  if (!group) throw TypeError('不是比較卡：' + chosen.name);
  const keys = shuffled(group.members, random);
  if (keys.length >= 3 && keys.every((key, i) => key === group.members[i])) keys.push(keys.shift() as string);
  const rows = group.members.map((member, i) => {
    const target = deckTargets.find(each => each.kind?.id === 'group' && each.kind.group.key === group.key && each.kind.group.wordKey === group.memberKeys[i]);
    const anchor = target?.shared.find(line => ANCHOR.test(line));
    return { member, lt: target?.id ?? null, anchor: anchor === undefined ? null : anchor.replace(ANCHOR, '') };
  });
  return { title: group.title, members: group.members, keys, rows };
}

/**
 * 一張比較卡（§5-2、§5-3）。mates[0] 是選中的目標；只有兩個選項的組，出過的字出兩句；每個字鍵剛好一格時多放一句，從還有別句的字裡選。
 * deckTargets 是這篇卡組全部的目標。
 */
export function pickCardOf(fields: { deck: string; isNew: boolean; early: boolean }, mates: readonly PickMate[], deckTargets: readonly Target[]): Card {
  const chosen = mates[0];
  const group = chosen.target.kind?.id === 'group' ? chosen.target.kind.group : undefined;
  if (!group) throw TypeError('不是比較卡：' + chosen.target.name);
  const cells: Blank[] = [];
  const rest: { mate: PickMate; prompt: Prompt }[] = [];
  // 照筆記順序排，範圍怎麼排都是同一張卡。
  for (const mate of [...mates].sort((a, b) => a.target.line - b.target.line)) {
    const order = rotation(mate.target, mate.shown);
    const count = group.members.length === 2 && mate.shown.size > 0 ? 2 : 1;
    for (const prompt of order.slice(0, count)) cells.push(cellOf(group, mate, prompt));
    if (order.length > count) rest.push({ mate, prompt: order[count] });
  }
  if (rest.length && group.members.every(member => cells.filter(each => each.answer === member).length === 1)) {
    const extra = rest[Math.floor(seeded(seedOf(cells))() * rest.length)];
    cells.push(cellOf(group, extra.mate, extra.prompt));
  }
  return assembled(fields, chosen, cells, deckTargets);
}

// ── 多音字（tasks/polyphone-pick.md §3、§4）：選項是這個目標自己的讀音，一個目標一張卡、好幾格；純計算，同一張卡重來不變。 ──

/** 一格：答案照括號的寫法（解析時已經確認每一句的答案都在括號裡，choice.answers 對齊題目）。 */
function choiceCell(lt: string, target: Target, choice: Choice, prompt: Prompt): Blank {
  const answer = choice.options.at(choice.answers[target.prompts.indexOf(prompt)] ?? -1);
  if (answer === undefined) throw TypeError('多音字的答案不在括號裡：' + target.name);
  return { lt, target, prompt, answer };
}

/**
 * 這一張出的句子（§3-1）：照出題順序（指紋相同的算一句），每個讀音先挑順序最前面的一句（照括號的順序），再照順序補到讀音數加一；
 * 池裡不夠就全出。回傳照筆記的順序：同一組句子出題歷史不同，打亂前的順序也一樣（L2 R5）；畫面的順序由 choiceAssembled 打亂。
 */
function choicePrompts(target: Target, choice: Choice, shown: Shown): Prompt[] {
  const order = rotation(target, shown);
  const optionOf = (prompt: Prompt): number => choice.answers[target.prompts.indexOf(prompt)] ?? -1;
  const picked = new Set<Prompt>();
  choice.options.forEach((_, option) => {
    const first = order.find(prompt => optionOf(prompt) === option);
    if (first) picked.add(first);
  });
  for (const prompt of order) {
    if (picked.size >= choice.options.length + 1) break;
    picked.add(prompt);
  }
  return target.prompts.filter(prompt => picked.has(prompt));
}

/** 格子定了之後的一張多音字卡：打散格子與字鍵（字鍵三個以上時順序一定和括號不同，同比較卡）。 */
function choiceAssembled(fields: ChoiceFields, choice: Choice, cells: readonly Blank[]): Card {
  const random = seeded(seedOf(cells));
  const blanks = shuffled(cells, random);
  const keys = shuffled(choice.options, random);
  if (keys.length >= 3 && keys.every((key, i) => key === choice.options[i])) keys.push(keys.shift() as string);
  // 對照（§4-2）：每個讀音一行，錨點在解析時已經對好；對不到的行接在後面。
  const rows = choice.options.map((member, i) => ({ member, lt: fields.lt, anchor: choice.anchors[i] ?? null }));
  return { ...fields, prompt: blanks[0].prompt, typed: false, blanks, group: { title: `${choice.title}：${choice.word}`, members: choice.options, keys, rows, choice: { rest: choice.rest } } };
}

/** 一張多音字卡需要的欄位：和翻面卡相同，只是題目由這裡挑。 */
type ChoiceFields = Omit<Card, 'typed' | 'blanks' | 'prompt' | 'group'>;

/** 一張多音字卡（§3）：今天的份、全部卡的一輪與小考共用；shown 是這個目標的出題歷史。 */
export function choiceCardOf(fields: ChoiceFields, shown: Shown): Card {
  const { lt, target } = fields;
  const choice = target.kind?.id === 'polyphone' ? target.kind.polyphone : undefined;
  if (!choice) throw TypeError('不是多音字：' + target.name);
  return choiceAssembled(fields, choice, choicePrompts(target, choice, shown).map(prompt => choiceCell(lt, target, choice, prompt)));
}

/** 預覽（§3-4）：一張「第一次」的卡，其餘不同指紋的句子各一張（一格，字鍵照樣是全部讀音）。 */
export function choicePreviewCards(deck: string, target: Target): Card[] {
  const choice = target.kind?.id === 'polyphone' ? target.kind.polyphone : undefined;
  if (!choice) throw TypeError('不是多音字：' + target.name);
  const fields: ChoiceFields = { lt: target.id ?? '', deck, target, isNew: false, early: false };
  const first = choiceCardOf(fields, new Map());
  const rest = rotation(target, new Map())
    .filter(prompt => !first.blanks.some(blank => blank.prompt === prompt))
    .map(prompt => choiceAssembled(fields, choice, [choiceCell(fields.lt, target, choice, prompt)]));
  return [first, ...rest];
}

/**
 * 全詩順序卡（D-187、D-204）：一個目標，每一格是一句，照詩的順序；字鍵是打亂的每一句，相同的句子各一個鍵，順序一定和詩不同（兩句時就是對調）。
 */
function orderCardOf(fields: Omit<Card, 'typed' | 'blanks'>, order: PoemOrder, times: number): Card {
  const { lt, target, prompt } = fields;
  const blanks = order.lines.map((answer, cell): Blank => ({ lt, target, prompt, answer, cell }));
  // 每一次都和上一次不同（L2 R4）：從第 0 次一路算到這一次，幾句的詩算幾百次也很快。
  let keys: string[] = [];
  for (let at = 0; at <= times; at++) keys = orderKeys(order.lines, prompt.fingerprint + ' ' + String(at), keys);
  return { ...fields, typed: false, blanks, group: { title: order.title, members: order.lines, keys, rows: [], order: { head: order.head, tails: order.tails } } };
}

/**
 * 英文的句子排序卡（tasks/english-typed-order.md §4）：一個目標，這一題的每一格是一格；字鍵是打亂的詞塊，打亂的方法和全詩相同。
 * 一格對不對比文字（pick.ts），所以文字相同的詞塊互換不算錯。
 */
function sentenceCardOf(fields: Omit<Card, 'typed' | 'blanks'>, sentence: SentenceOrder, times: number): Card {
  const { lt, target, prompt } = fields;
  // 同一題照物件找，找不到（另一次解析的同一題）照指紋。
  const index = target.prompts.indexOf(prompt);
  const cells = sentence.prompts.at(index >= 0 ? index : target.prompts.findIndex(each => each.fingerprint === prompt.fingerprint));
  if (!cells) throw TypeError('排序卡找不到這一題：' + target.name);
  const blanks = cells.words.map((answer, cell): Blank => ({ lt, target, prompt, answer, cell }));
  // 字鍵避開每一種對的順序（tasks/sentence-order-alternatives.md §3）；沒有另一種排法時和以前一樣只避開題目那一行。
  const avoid = [cells.words, ...(cells.others ?? []).map(other => other.words)];
  let keys: string[] = [];
  for (let at = 0; at <= times; at++) keys = orderKeys(cells.words, prompt.fingerprint + ' ' + String(at), keys, avoid);
  const order = { head: cells.head, tails: cells.tails, starts: cells.starts, ...(cells.others ? { others: cells.others } : {}) };
  return { ...fields, typed: false, blanks, group: { title: sentence.title, members: cells.words, keys, rows: [], order } };
}

const sameOrder = (a: readonly string[], b: readonly string[]): boolean => a.length === b.length && a.every((item, i) => item === b[i]);

/**
 * 排序卡一次的字鍵：打亂；照詩的順序就把第一個移到最後。和上一次（before）一樣時，換掉兩句的位置，取第一個不照詩的順序的。
 * 兩句的詩、句子都相同時沒有別的排法，照舊。avoid 是要避開的對的順序，沒給時是 lines 自己（全詩、沒有另一種排法的句子）。
 */
function orderKeys(lines: readonly string[], seed: string, before: readonly string[], avoid: readonly (readonly string[])[] = [lines]): string[] {
  if (avoid.length > 1) return avoidingKeys(shuffled(lines, seeded(seed)), before, avoid) ?? orderKeys(lines, seed, before);
  const keys = shuffled(lines, seeded(seed));
  if (sameOrder(keys, lines)) keys.push(keys.shift() as string);
  if (!sameOrder(keys, before)) return keys;
  for (let i = 0; i < keys.length; i++) {
    for (let j = i + 1; j < keys.length; j++) {
      if (keys[i] === keys[j]) continue;
      const swapped = [...keys];
      [swapped[i], swapped[j]] = [swapped[j], swapped[i]];
      if (!sameOrder(swapped, lines)) return swapped;
    }
  }
  return keys;
}

/**
 * 有另一種排法的句子（§3）：先避開每一種對的順序，再求和上一次不同。照上面的方法（移一個、再找兩個交換）都撞到時，
 * 照固定的順序列舉打亂結果的排列，取第一個兩樣都符合的；沒有就取第一個不是對的順序的；連這個都沒有（每一種都對）是 null，
 * 照沒有另一種排法的規則打亂（L2 第一輪 R6）。
 */
function avoidingKeys(keys: string[], before: readonly string[], avoid: readonly (readonly string[])[]): string[] | null {
  const right = (order: readonly string[]): boolean => avoid.some(each => sameOrder(order, each));
  const fresh = (order: readonly string[]): boolean => !right(order) && !sameOrder(order, before);
  if (right(keys)) keys.push(keys.shift() as string);
  if (fresh(keys)) return keys;
  for (let i = 0; i < keys.length; i++) {
    for (let j = i + 1; j < keys.length; j++) {
      if (keys[i] === keys[j]) continue;
      const swapped = [...keys];
      [swapped[i], swapped[j]] = [swapped[j], swapped[i]];
      if (fresh(swapped)) return swapped;
    }
  }
  let wrong: string[] | null = null;
  for (const order of arrangementsOf(keys)) {
    if (fresh(order)) return order;
    if (!wrong && !right(order)) wrong = order;
  }
  return wrong;
}

/**
 * keys 的每一種不同的排列（相同文字的詞塊互換算同一種，GitHub 上 Codex 的 P2：照位置列舉要 n! 次）；一個一個產生，找到就停。
 * 每一種字照在 keys 第一次出現的先後編號，從 keys 自己開始照字典順序往後，到最後一種再從頭，回到 keys 為止。
 */
function* arrangementsOf(keys: readonly string[]): Generator<string[]> {
  const distinct = [...new Set(keys)];
  const start = keys.map(key => distinct.indexOf(key));
  const rank = [...start];
  do {
    yield rank.map(i => distinct[i]);
    let i = rank.length - 2;
    while (i >= 0 && rank[i] >= rank[i + 1]) i--;
    if (i >= 0) {
      let j = rank.length - 1;
      while (rank[j] <= rank[i]) j--;
      [rank[i], rank[j]] = [rank[j], rank[i]];
    }
    rank.splice(i + 1, Infinity, ...rank.slice(i + 1).reverse());
  } while (rank.some((each, at) => each !== start[at]));
}

/**
 * 預覽（§9）：這一組一張「第一次」的卡（每個字第一句加多放的一句），剩下的句子各一張（一格，字鍵照樣整組；兩個選項的組也一樣）。
 * members 是這一組要出的目標，照筆記順序，至少一個。
 */
export function pickPreviewCards(deck: string, members: readonly Target[], deckTargets: readonly Target[]): Card[] {
  const fields = { deck, isNew: false, early: false };
  const mates = members.map((target): PickMate => ({ lt: target.id ?? '', target, shown: new Map() as Shown }));
  const first = pickCardOf(fields, mates, deckTargets);
  const rest = mates.flatMap(mate => rotation(mate.target, mate.shown)
    .filter(prompt => !first.blanks.some(blank => blank.prompt === prompt))
    .map(prompt => {
      if (mate.target.kind?.id !== 'group') throw TypeError('不是比較卡：' + mate.target.name);
      return assembled(fields, mate, [cellOf(mate.target.kind.group, mate, prompt)], deckTargets);
    }));
  return [first, ...rest];
}
