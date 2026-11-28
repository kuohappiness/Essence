import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { SETTINGS_FILE } from '../../src/core/settings/index.ts';
import type { AdapterResult, DeckSnap, KindSnap, Snapshot, TodaySnap } from './snapshot.ts';

/**
 * 發布前比較的轉接器（任務說明 1-3）：在一個版本的 worktree 裡，用那個版本自己的 `src/state` 讀凍結的備份，輸出 snapshot.ts 的比較資料。
 * 每個版本在自己的 Node 程序裡跑：
 *
 *   node tools/compare/adapter.ts <那個版本的 repo> <輸入 JSON> <輸出 JSON>
 *
 * 讀取閘門、今天的份與到期都照那一版的 state，不在這裡另寫一份規則：讀得懂哪些「需要版本」與 need 看那一版 manifest 的版號，
 * 重複 ID 的判斷（D-157）是那一版有才有，沒有就是 null，不要求舊版跑新版的規則。
 * 接不上（函式不存在、型別不同、丟錯）、版號不是正式版號（讀取能力不明）就輸出 `ok: false`，比較的一方寫「無法比較」，不能當成零差異。
 *
 * state 載入時會想寫版本行（讀取能力和版本行都綁在 build，src/state/index.ts）。這裡的 Files 拒絕所有寫入，什麼都寫不出去，
 * 也不假裝寫成；看到版本行以外的寫入，就是這一版載入時不只讀，當成無法比較。紀錄照順序寫，第一行被拒絕之後排在後面的不會送到這裡，
 * 所以看得到的是排在最前面的那一行與 modify，不保證抓到版本行之後才排的。
 */

/**
 * 輸入：備份的時間與時區當「現在」，`Essence Cards/` 底下的文字檔，外掛的 data.json 的原文，
 * 設定檔（SETTINGS_FILE）的位元組（base64，BOM 和讀不懂的位元組都照實帶）；後兩個備份裡沒有就不帶。
 */
export interface AdapterInput { now: number; offset: number; files: Record<string, string>; data?: string; settingsFile?: string }

type Fn = (...args: unknown[]) => unknown;
function need(module: unknown, name: string): Fn {
  const value = (module as Record<string, unknown>)[name];
  if (typeof value !== 'function') throw Error('這個版本沒有 ' + name);
  return value as Fn;
}

// 被比較的版本回傳的值，每一個都在讀的時候查型別，比較資料裡只有查過的值。不能靠真假值、靠它自己丟錯，也不能靠之後比出差異：
// Promise 永遠是真的，`!` 之後停掉的目標就成了新卡（Codex L2 F1）；字串也能展開，空字串就成了空清單；空的 typed array 也有 `.map`，
// 不會丟錯（Codex 再審 F2、第三次審查 F3）；NaN 經過程序之間的 JSON 變成 null，和原本的 null 比不出差異（F3）。
// 只有交回同一版處理、這裡不讀內容的不查：作答紀錄的元素、replay 算出的記憶、今天的份交給 nextCard。
const wrongType = (name: string): Error => Error(`這個版本的 ${name} 型別不同`);
function yesNo(value: unknown, name: string): boolean {
  if (typeof value !== 'boolean') throw wrongType(name);
  return value;
}
function finite(value: unknown, name: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw wrongType(name);
  return value;
}
function integer(value: unknown, name: string): number {
  if (!Number.isInteger(value)) throw wrongType(name);
  return value as number;
}
function text(value: unknown, name: string): string {
  if (typeof value !== 'string') throw wrongType(name);
  return value;
}
const textOrNull = (value: unknown, name: string): string | null => value === null ? null : text(value, name);
function array<T>(value: unknown, name: string): T[] {
  if (!Array.isArray(value)) throw wrongType(name);
  // 逐格複製：`some` 和 `map` 會跳過空洞，元素就沒查到，經過 JSON 又成了 null（Codex 第四次審查 F5）；子類別的 `toJSON`、多的屬性也不會留下來。
  const list = Array.from({ length: value.length }, (_, i) => value[i] as unknown);
  if (list.includes(undefined)) throw wrongType(name);
  return list as T[];
}
function strings(value: unknown, name: string): string[] {
  const list = array<unknown>(value, name);
  if (list.some(each => typeof each !== 'string')) throw wrongType(name);
  return list as string[];
}
function map<V>(value: unknown, name: string): Map<string, V> {
  if (!(value instanceof Map)) throw wrongType(name);
  return value as Map<string, V>;
}
/** 比較端拿這些值當 key，重複時只比得到最後一個，其他的不同也是零差異。目標的 ID 不在內：備份照原樣收重複的 ID，比較端每一個都比。 */
function unique<T>(list: T[], key: (each: T) => string, name: string): T[] {
  if (new Set(list.map(key)).size !== list.length) throw Error(`這個版本的 ${name} 重複`);
  return list;
}

/** 凍結的輸入：監看不做事（內容不會變），寫入一律拒絕並記下來。 */
function frozen(texts: Record<string, string>) {
  const paths = Object.keys(texts).sort((a, b) => a < b ? -1 : a > b ? 1 : 0);
  const refused: string[] = [];
  const refusal = Error('比較只能讀，不能寫');
  const refuse = (what: string): Promise<never> => {
    refused.push(what);
    return Promise.reject(refusal);
  };
  return {
    refused,
    refusal,
    files: {
      list: (folder: string): Promise<string[]> => Promise.resolve(paths.filter(path => path.startsWith(folder + '/'))),
      read: (path: string): Promise<string | null> => Promise.resolve(Object.hasOwn(texts, path) ? texts[path] : null),
      modify: (path: string) => refuse('改 ' + path),
      append: (_path: string, line: string) => refuse(line),
      watch: () => () => {},
    },
  };
}
/** 載入時本來就會寫的：版本行、狀態與設定的基準、考試切面（tasks/record-gaps.md §1、§2）。比較時 Files 拒絕這些是預期的。 */
const LOADING = new Set(['app', 'status', 'cap', 'retention', 'filter', 'semester']);
const isLoadingLine = (line: string): boolean => {
  if (line.startsWith('改 Essence Cards/紀錄/考試切面/')) return true;
  try { return LOADING.has(String((JSON.parse(line) as { set?: unknown }).set)); } catch { return false; }
};

interface TargetLike { id: string | null; name: string; line: number; ok: boolean; prompts: unknown;
  fields: { importance: string; paused: boolean }; direction: string | null; kind?: unknown }

/** 題型模組之前的六個卡型欄位（題型模組任務說明 §1-2）：舊版的目標最多有其中一個。 */
const LEGACY_KINDS = ['group', 'choice', 'order', 'sentence', 'typing', 'couplet'] as const;
type Fields = Record<string, unknown>;
function fields(value: unknown, name: string): Fields {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw wrongType(name);
  return value as Fields;
}
const kindItems = {
  group: (value: unknown, name: string): KindSnap => {
    const group = fields(value, name);
    return { id: 'group', style: null, items: [[text(group.word, name + '.word')], strings(group.members, name + '.members')], marks: [] };
  },
  polyphone: (value: unknown, name: string): KindSnap => {
    const choice = fields(value, name);
    return { id: 'polyphone', style: null, items: [[text(choice.word, name + '.word')], strings(choice.options, name + '.options')],
      marks: [array<unknown>(choice.answers, name + '.answers').map(at => integer(at, name + '.answers'))] };
  },
  poem: (value: unknown, name: string): KindSnap => ({ id: 'order', style: 'poem', items: [strings(fields(value, name).lines, name + '.lines')], marks: [] }),
  sentence: (value: unknown, name: string): KindSnap => {
    const prompts = array<unknown>(fields(value, name).prompts, name + '.prompts').map(each => fields(each, name + '.prompts'));
    return { id: 'order', style: 'sentence', items: prompts.map(each => strings(each.words, name + '.words')),
      marks: prompts.map(each => array<unknown>(each.starts, name + '.starts').map(start => yesNo(start, name + '.starts'))) };
  },
  typing: (value: unknown, name: string, styleField: 'kind' | 'style'): KindSnap => {
    const typing = fields(value, name);
    // 提示（文法點或原形）與變化配對的英翻中：items 是 [提示, 配對的鍵]，沒有是空的；marks 是配對只配同一個意思。
    const hint = textOrNull(typing.hint, name + '.hint');
    const pair = typing.pair === null ? null : fields(typing.pair, name + '.pair');
    return { id: 'typing', style: text(typing[styleField], name + '.' + styleField),
      items: [hint === null ? [] : [hint], pair ? [text(pair.key, name + '.pair.key')] : []], marks: pair ? [[yesNo(pair.exact, name + '.pair.exact')]] : [] };
  },
  couplet: (value: unknown, name: string): KindSnap => ({ id: 'couplet', style: null, items: [strings(fields(value, name).lines, name + '.lines')], marks: [] }),
  // 單選與配對（tasks/matching-single-choice.md §8）：只有新版有，舊版的這種目標是 null（一般的問答）。
  // 一列好幾個（tasks/matching-many.md §9）：第 1 段的 answers 是平的 [0,2]、沒有 many；之後是 [[0],[2]] 加 many。沒有 many 的兩種都寫成
  // style: null、marks: [[0,2]]；many 是 true 的是 style: 'many'、marks 每一題一份答案位置。
  single: (value: unknown, name: string): KindSnap => {
    const single = fields(value, name);
    const answers = array<unknown>(single.answers, name + '.answers');
    const many = single.many === undefined ? false : yesNo(single.many, name + '.many');
    const each = (at: unknown): number[] => Array.isArray(at) ? array<unknown>(at, name + '.answers').map(one => integer(one, name + '.answers')) : [integer(at, name + '.answers')];
    if (many) return { id: 'single', style: 'many', items: [strings(single.options, name + '.options')], marks: answers.map(each) };
    return { id: 'single', style: null, items: [strings(single.options, name + '.options')],
      marks: [answers.map(at => { const [only, ...rest] = each(at); if (rest.length) throw wrongType(name + '.answers'); return only; })] };
  },
};

/**
 * 卡型摘要（snapshot.ts 的 KindSnap）：新版讀 kind，舊版從六個欄位推；兩種同時有、舊版有兩個卡型欄位、認不得的卡型都當型別不同。
 * 搬動前後同一個目標的摘要要一樣（Typing.kind 改名 style、多音字的 choice 叫 polyphone、句子排序是 order 的 sentence）。
 */
function kindSnap(target: TargetLike): KindSnap | null {
  const own = target as unknown as Fields;
  const legacy = LEGACY_KINDS.filter(field => own[field] !== undefined);
  if (own.kind !== undefined) {
    if (legacy.length) throw wrongType('target.kind');
    const kind = fields(own.kind, 'target.kind');
    switch (text(kind.id, 'target.kind.id')) {
      case 'group': return kindItems.group(kind.group, 'target.kind.group');
      case 'polyphone': return kindItems.polyphone(kind.polyphone, 'target.kind.polyphone');
      case 'order': {
        const style = text(fields(kind.order, 'target.kind.order').style, 'target.kind.order.style');
        if (style !== 'poem' && style !== 'sentence') throw wrongType('target.kind.order.style');
        return kindItems[style](kind.order, 'target.kind.order');
      }
      case 'typing': return kindItems.typing(kind.typing, 'target.kind.typing', 'style');
      case 'couplet': return kindItems.couplet(kind.couplet, 'target.kind.couplet');
      case 'single': return kindItems.single(kind.single, 'target.kind.single');
      default: throw wrongType('target.kind.id');
    }
  }
  if (legacy.length > 1) throw Error('這個版本的目標有兩個卡型：' + legacy.join('、'));
  switch (legacy[0]) {
    case undefined: return null;
    case 'group': return kindItems.group(own.group, 'target.group');
    case 'choice': return kindItems.polyphone(own.choice, 'target.choice');
    case 'order': return kindItems.poem(own.order, 'target.order');
    case 'sentence': return kindItems.sentence(own.sentence, 'target.sentence');
    case 'typing': return kindItems.typing(own.typing, 'target.typing', 'kind');
    case 'couplet': return kindItems.couplet(own.couplet, 'target.couplet');
  }
}
interface DeckLike { props: { status: string; isTranscript: boolean; term: string | null; subject: string | null; unit: { code: string; name: string } | null; categories: string[] };
  targets: unknown; problems: unknown }
interface ProblemLike { line: number; level: string; code: string }
interface ItemLike { lt: string; deck: string; lane: string; seconds: number }
interface SlotLike { retention: number; target: { direction: string | null } }
interface TodayLike { share: unknown; more: unknown; slots: unknown }
interface ConflictLike { id: string; targets: unknown }
interface StateLike {
  ready(): Promise<unknown>;
  close(): Promise<void>;
  unread(): unknown;
  decks(): unknown;
  history(): { reviews: unknown };
  blocked(): { decks: unknown; targets: unknown; all: unknown };
  canAnswer(lt: string): unknown;
  input(): { settings: { retention: unknown } };
  today(): TodayLike;
  /** D-157 之後才有。 */
  conflicts?(): unknown;
}
const STATE_METHODS = ['ready', 'close', 'unread', 'decks', 'history', 'blocked', 'canAnswer', 'input', 'today'];

/** 讀完的 state 換成比較資料。到期照整份紀錄算（下次到期），但照那一版的 state 停掉的目標不算。 */
function read(state: StateLike, study: unknown, input: AdapterInput, version: string): Snapshot {
  const [nextCard, replay, dueAt, dayOf] = ['nextCard', 'replay', 'dueAt', 'dayOf'].map(name => need(study, name));
  // 題型（D-181）與卡上的 blanks 是 0.4.0 開始才有：更早的版本沒有就是 null，比較時不比；0.4.0 以後沒有是接不上（L2 第二輪 F3）。
  const modern = !/^0\.[0-3]\./.test(version);
  const questionType = modern || typeof (study as Fields).questionType === 'function' ? need(study, 'questionType') : null;
  const dayNumber = (at: number): number => integer(dayOf(at, input.offset), 'dayOf()');
  const blocked = state.blocked();
  const deckSnaps = unique<DeckSnap>(array<{ path: unknown; deck: DeckLike }>(state.decks(), 'decks()').map(({ path, deck: { props, targets, problems } }) => ({
    path: text(path, 'decks() 的 path'),
    props: { status: text(props.status, 'props.status'), isTranscript: yesNo(props.isTranscript, 'props.isTranscript'),
      term: textOrNull(props.term, 'props.term'), subject: textOrNull(props.subject, 'props.subject'),
      unit: props.unit === null ? null : { code: text(props.unit.code, 'props.unit'), name: text(props.unit.name, 'props.unit') },
      categories: strings(props.categories, 'props.categories') },
    targets: array<TargetLike>(targets, 'targets').map(target => {
      const id = textOrNull(target.id, 'target.id'), name = text(target.name, 'target.name'), line = integer(target.line, 'target.line');
      return { key: id ?? `@${line}:${name}`, id, name, line, ok: yesNo(target.ok, 'target.ok'),
        fingerprints: array<{ fingerprint: unknown }>(target.prompts, 'target.prompts').map(prompt => text(prompt.fingerprint, 'prompt.fingerprint')),
        importance: text(target.fields.importance, 'target.fields.importance'), paused: yesNo(target.fields.paused, 'target.fields.paused'),
        direction: textOrNull(target.direction, 'target.direction'), kind: kindSnap(target) };
    }),
    problems: array<ProblemLike>(problems, 'problems').map(problem =>
      ({ line: integer(problem.line, 'problems 的 line'), level: text(problem.level, 'problems 的 level'), code: text(problem.code, 'problems 的 code') })),
  })), deck => deck.path, 'decks() 的 path');
  // 讀不懂的卡組內容不進 decks：比較端兩邊都擋下就不比內容，一邊有內容也比不到。
  const gated = strings(blocked.decks, 'blocked().decks');
  if (deckSnaps.some(deck => gated.includes(deck.path))) throw Error('這個版本的 decks() 有 blocked().decks 擋下的卡組');

  const todayInput = state.input();
  const retention = finite(todayInput.settings.retention, 'input().settings.retention');
  const memories = map(replay(array(state.history().reviews, 'history().reviews')), 'replay()');
  // 先放 Map：ID 只查是字串，叫 `__proto__` 時，指定給一般物件不會留下這個 key。
  const due = new Map<string, Snapshot['due'][string]>();
  for (const entry of deckSnaps) for (const target of entry.targets) {
    if (target.id === null || due.has(target.id)) continue;
    const memory = memories.get(target.id);
    due.set(target.id, !yesNo(state.canAnswer(target.id), 'canAnswer()') ? 'stopped'
      : memory === undefined ? null : finite(dueAt(memory, retention), 'dueAt()'));
  }
  const todayDay = dayNumber(input.now);
  const days = Array.from({ length: 30 }, () => 0);
  for (const at of due.values()) {
    if (typeof at !== 'number') continue;
    const day = Math.max(0, dayNumber(at) - todayDay);
    if (day < 30) days[day]++;
  }

  const today = state.today();
  const slots = map<SlotLike>(today.slots, 'today().slots');
  const lists = (['share', 'more'] as const).map(list => ({ list, items: array<ItemLike>(today[list], 'today().' + list).map(item => {
    const lt = text(item.lt, 'today() 的 lt'), slot = slots.get(lt);
    if (!slot) throw wrongType('today().slots');
    return { item, lt, deck: text(item.deck, 'today() 的 deck'), slot };
  }) }));
  // 每一張卡照那一版真的複習怎麼出（L2 第一輪 R1）：同一個佇列、同一篇的目標一起放進今天的份，nextCard 出一張，這張上的目標拿掉再出下一張。
  // 比較卡併同組的目標看的是範圍，只放一個目標就併不到。不模擬作答：記的是每個目標還沒作答時出現在哪一張卡。今天已經答對的是 done；時間是固定的，不會是 stale。
  // 再複習一些照它自己的入口（{ more: true }，跨篇一起出、跳過英文另一個方向今天已經一般作答的目標）；它跳過的目標沒有卡（L2 第二輪 F1）。
  const shown = new Map<string, Pick<TodaySnap, 'prompt' | 'type' | 'cells' | 'blanks'>>();
  const buckets = lists.flatMap(({ list, items }) => (list === 'more' ? [items] : [...new Set(items.map(each => each.deck))].map(deck => items.filter(each => each.deck === deck))).map(group => ({ list, items: group })));
  for (const { list, items } of buckets) {
    const deck = items[0]?.deck;
    let left = items;
    while (left.length) {
      const next = (list === 'more'
        ? nextCard({ ...today, more: left.map(each => each.item) }, todayInput, { more: true })
        : nextCard({ ...today, share: left.map(each => each.item), more: [] }, todayInput, { deck })) as { kind: string; card?: unknown };
      if (next.kind === 'done') break;
      if (next.kind !== 'card') throw wrongType('nextCard()');
      const card = fields(next.card, 'nextCard() 的 card');
      const lead = text(card.lt, 'nextCard() 的 lt'), prompt = text(fields(card.prompt, 'nextCard() 的 prompt').fingerprint, 'nextCard() 的 fingerprint');
      // 選中的目標一定在還沒出的範圍裡（L2 第二輪 F3）；範圍外的格可以照實記。
      if (!left.some(each => each.lt === lead)) throw wrongType('nextCard() 的 lt');
      if (modern && card.blanks === undefined) throw wrongType('nextCard() 的 blanks');
      // 每一格只讀對哪個目標、哪一題；那一版的卡沒有 blanks（0.3.0 以前）只有選中的那個目標，題型、格數、每一格都是 null。
      const blanks = card.blanks === undefined ? null : array<unknown>(card.blanks, 'nextCard() 的 blanks').map(each => {
        const blank = fields(each, 'nextCard() 的 blanks');
        return { lt: text(blank.lt, 'blanks 的 lt'), prompt: text(fields(blank.prompt, 'blanks 的 prompt').fingerprint, 'blanks 的 fingerprint') };
      });
      if (blanks !== null && !blanks.some(blank => blank.lt === lead)) throw wrongType('nextCard() 的 blanks');
      const lts = blanks === null ? [lead] : [...new Set(blanks.map(blank => blank.lt))];
      const type = questionType ? text(questionType(card), 'questionType()') : null;
      const fresh = lts.filter(lt => left.some(each => each.lt === lt));
      // 這張卡上沒有還沒出的目標：再叫一次也一樣，那一版的 nextCard 不對。
      if (!fresh.length) throw wrongType('nextCard()');
      for (const lt of fresh) {
        shown.set(lt, { prompt: lt === lead ? prompt : blanks!.find(blank => blank.lt === lt)!.prompt, type, cells: blanks?.length ?? null, blanks: blanks?.map(blank => [blank.lt, blank.prompt]) ?? null });
      }
      left = left.filter(each => !fresh.includes(each.lt));
    }
  }
  const items: TodaySnap[] = [];
  for (const { list, items: each } of lists) for (const { item, lt, deck, slot } of each) {
    const card = shown.get(lt) ?? { prompt: null, type: null, cells: null, blanks: null };
    items.push({ list, lt, deck, lane: text(item.lane, 'today() 的 lane'), retention: finite(slot.retention, 'today().slots 的 retention'), seconds: finite(item.seconds, 'today() 的 seconds'),
      prompt: card.prompt, direction: textOrNull(slot.target.direction, 'today().slots 的 direction'), type: card.type, cells: card.cells, blanks: card.blanks });
  }
  return {
    gates: { decks: gated, held: strings(blocked.targets, 'blocked().targets'), incomplete: yesNo(blocked.all, 'blocked().all'),
      // 這個方法不存在是舊版本來就沒有這個判斷，報告會寫出來；存在就要回傳對的清單。
      conflicts: state.conflicts === undefined ? null : unique(array<ConflictLike>(state.conflicts(), 'conflicts()').map(each => ({
        id: text(each.id, 'conflicts() 的 id'),
        targets: array<{ path: unknown; line: unknown; name: unknown }>(each.targets, 'conflicts() 的 targets').map(({ path, line, name }) => ({
          path: text(path, 'conflicts() 的 path'), line: integer(line, 'conflicts() 的 line'), name: text(name, 'conflicts() 的 name') })),
      })), each => each.id, 'conflicts() 的 id') },
    decks: deckSnaps, due: Object.fromEntries(due), today: unique(items, item => item.lt, 'today() 的 lt'), days,
  };
}

/**
 * 那一版有設定（src/core/settings/）就用它自己的讀法；沒有的版本（0.3.0）照用它的預設（tasks/settings-page.md §2-9）。
 * 有設定檔讀法（createSettingsFile）的版本照它讀設定檔、疊上 data.json（tasks/settings-vault-file.md §2）。比較是沒確認過設定檔的一台：
 * 設定檔沒有就讀 data.json，讀不懂是預設，不寫任何東西。沒有設定檔讀法的版本（0.4.0）只讀 data.json。
 */
async function settingsOption(root: string, input: AdapterInput): Promise<{ settingsFirst?: Promise<unknown> }> {
  const path = join(root, 'src/core/settings/index.ts');
  if (!existsSync(path)) return {};
  // eslint-disable-next-line essence/module-boundaries
  const settings = await import(pathToFileURL(path).href) as Record<string, unknown>;
  let raw: unknown = {};
  if (typeof settings.createSettingsFile === 'function') {
    const bytes = input.settingsFile === undefined ? null : new Uint8Array(Buffer.from(input.settingsFile, 'base64'));
    const file = need(settings, 'createSettingsFile')({
      readBytes: (at: string) => Promise.resolve(at === SETTINGS_FILE ? bytes : null),
      modify: () => Promise.reject(Error('比較不寫設定檔')),
      // 和 Obsidian 的 loadData 一樣：沒有檔是 null，讀不懂（含開頭的 BOM）就拒絕。
      loadData: () => new Promise(resolve => { resolve(input.data === undefined ? null : JSON.parse(input.data) as unknown); }),
      confirmed: () => null,
      confirm: () => undefined,
    });
    raw = await need(file, 'load').call(file);
  } else if (input.data !== undefined) {
    // 壞掉的 data.json：外掛用預設值，比較也是。
    try { raw = JSON.parse(input.data); } catch { raw = {}; }
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) raw = {};
  return { settingsFirst: Promise.resolve(need(settings, 'valueOf')(need(settings, 'readSaved')(raw), true)) };
}

export async function snapshot(root: string, input: AdapterInput): Promise<Snapshot> {
  const { version } = JSON.parse(await readFile(join(root, 'manifest.json'), 'utf8')) as { version: unknown };
  // 載入要比較的那個版本的程式：路徑由命令列給，只能是計算出來的（這個檔不進外掛，D-148 的邊界檢查管的是 src/）。
  // eslint-disable-next-line essence/module-boundaries
  const release = await import(pathToFileURL(join(root, 'src/core/version/index.ts')).href) as unknown;
  if (typeof version !== 'string' || typeof need(release, 'releaseOf')(version) !== 'string') throw Error('這個版本的版號不是正式版號，讀取能力不明：' + String(version));
  // eslint-disable-next-line essence/module-boundaries
  const study = await import(pathToFileURL(join(root, 'src/core/study/index.ts')).href) as unknown;
  // eslint-disable-next-line essence/module-boundaries
  const stateModule = await import(pathToFileURL(join(root, 'src/state/index.ts')).href) as unknown;
  const { files, refused, refusal } = frozen(input.files);
  const failures: unknown[] = [];
  // 預期的錯只有這裡的 Files 拒絕寫入（寫了什麼下面查）；其他的都是這一版讀或收尾時出錯，不能當成沒事（Codex 第三次審查 F4）。
  const failed = (error: unknown): void => { if (error !== refusal) failures.push(error); };
  const state = need(stateModule, 'createState')({
    files, device: 'compare', build: version, fillIds: false, now: () => input.now, offset: () => input.offset,
    ...await settingsOption(root, input),
    onError: failed,
  }) as StateLike;
  let result: Snapshot;
  try {
    for (const name of STATE_METHODS) need(state, name);
    await state.ready();
    const unread = strings(state.unread(), 'unread()');
    if (unread.length) throw Error('讀不到：' + unread.join('、'));
    result = read(state, study, input, version);
  } finally {
    // 版本行被拒絕之後，close 重試時也會拒絕，拒絕的是同一個物件。
    await state.close().catch(failed);
  }
  if (failures.length) throw Error('這個版本讀的時候出錯：' + String(failures[0]));
  const write = refused.find(line => !isLoadingLine(line));
  if (write !== undefined) throw Error('這個版本比較的時候想寫入：' + write);
  return result;
}

if (import.meta.main) {
  const [root, inputPath, outputPath] = process.argv.slice(2);
  let result: AdapterResult;
  try {
    const input = JSON.parse(await readFile(inputPath, 'utf8')) as AdapterInput;
    result = { ok: true, snapshot: await snapshot(root, input) };
  } catch (error) {
    result = { ok: false, reason: error instanceof Error ? error.message : String(error) };
  }
  await writeFile(outputPath, JSON.stringify(result));
}
