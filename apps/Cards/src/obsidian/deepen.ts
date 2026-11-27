import {
  baselineOf, beginDeepen, buildDeepenPrompt, chooseBase, composeBatch, deepenPending, deepenRow, deepenTargets, directJob, goneTargets, inspectDeepen, latestMap, ownSnapshots, readDeepenJobs, readSkips, readSnapshot, remindOf, RULE_SUBJECTS, skipFor, runDeepen, settleUnclear, sha256Hex, stamp, unitSiblings,
} from '../core/ai/index.ts';
import type { CardForm, Purpose, DeepenInspection, DeepenJob, DeepenResult, DeepenRow, DeepenStop, DirectEvidence, EmbeddedRules, SentFile, SnapshotInfo } from '../core/ai/index.ts';
import { directRequest, evidenceOf, failureLog, materialProblem, providerName, providerProblem, sendDirect, sendingLine, sentFiles } from '../core/connect/index.ts';
import type { Connection, DirectFailure, Material, ProgressEvent, ProviderSpec } from '../core/connect/index.ts';
import { endpoint, NO_KEY } from './ai-cards.ts';
import type { DirectDeps } from './ai-cards.ts';
import { deckInScope, scopeDate, unitKey } from '../core/catalog/index.ts';
import { blockIds, isDeckPath, newId } from '../core/deck/index.ts';
import type { Deck } from '../core/deck/index.ts';
import { dayOf, masteryOf, parseTime } from '../core/study/index.ts';
import type { Mastery } from '../core/study/index.ts';
import type { EditorHandle, State } from '../state/index.ts';

// 加深這一節的流程（tasks/ai-cards-deepen.md §1～§3）：複製提示、貼回檢查、寫進那一篇與快照、中斷後接著做。畫面在 deepen-modal.ts；這裡不碰 Obsidian，測試直接用。

export interface DeepenDeps {
  rules: EmbeddedRules;
  state: () => State | null;
  /** 整個 vault 現在的 Markdown 檔名（小寫、不含 .md）。 */
  names: () => Set<string>;
  /** 整個 vault 裡叫這個檔名（小寫、不含 .md）的 Markdown 路徑。 */
  named: (name: string) => string[];
  /** 快照資料夾裡的筆記（原文不算）：路徑與全文；讀不到的略過。 */
  snapshots: () => Promise<{ path: string; text: string }[]>;
  /** 這台電腦的存放（ui/prefs.ts）：saveJobs 存不進去時丟錯；retire 是製卡共用的「不再配出」清單。 */
  store: {
    jobs(): unknown; saveJobs(jobs: DeepenJob[]): void; retire(ids: readonly string[]): void;
    /** 「這次不用」（§5-1）：原樣讀出來；save 存整份。 */
    skips(): unknown; saveSkips(value: Record<string, { ids: string[]; at: string }>): void;
    /** 總開關（§5-2）：關掉時提醒一區不出現加深的列。 */
    remindOff(): boolean;
    /** 點選填空每一科上次的選擇（D-210 第 2、3 點）：和製卡共用同一份。 */
    picks(): Record<string, boolean>; savePick(key: string, pick: boolean): void;
  };
  /** 這一篇最新的全文（待審核用，§4-3）；讀不到是 null。 */
  read: (path: string) => Promise<string | null>;
  /** 開著這一篇的編輯器（寫入走編輯器）；editor 的字還沒存進檔時 unsaved 是 true。 */
  editor: (path: string) => EditorHandle | null;
  unsaved: (path: string) => Promise<boolean>;
  clipboard: (text: string) => Promise<void>;
  now: () => { ms: number; offset: number };
  random?: () => number;
  onError: (error: unknown) => void;
  /** 一次讀取最多等多久（毫秒，預設 30 秒；L2 R14）：iCloud 佔位檔可能一直不回來，提醒的重算與手動加深不能卡在同一次讀取。 */
  readWait?: number;
  /** 直接製作（tasks/ai-direct.md §9）：只在電腦，和製卡用同一份連線；沒有這一欄就只有複製提示。 */
  direct?: DirectDeps;
}

/** 加深直接送出之前就擋下（沒有建工作、沒有送出）的原因，或送出之後的結果（§9，同製卡的 DirectOutcome）。 */
export type DeepenDirectOutcome =
  | { kind: 'blocked'; message: string }
  | { kind: 'received'; job: DeepenJob; reply: string; evidence: DirectEvidence }
  | { kind: 'failed'; job: DeepenJob; failure: DirectFailure; partial: string | null };

/** 組好、還沒存的一份加深提示（複製與直接製作共用）。 */
type Composed = { job: DeepenJob; prompt: string; key: string };
/** 這一篇讀好的材料：家長改方向、教材說明、點選填空時，用同一份重組提示（送出前那一行的字數與費用）。 */
export interface DeepenContext { build(direction: string, material: string, pick: boolean | undefined): Composed | { error: string } }

/** 這一篇能不能加深（§1 第 1、4 點）：能的話附上卡組與三個數字。 */
export type Readiness =
  | { ok: true; path: string; name: string; deck: Deck; mastery: Map<string, Mastery>; counts: { stable: number; weak: number; unstable: number } }
  | { ok: false; why: string };

export type DeepenOutcome = { kind: 'done'; wrote: boolean; path: string } | { kind: 'stop'; message: string; unclear: boolean };

/** 讀取等不到（L2 R14）：同步中的正常狀態，不記錯誤。 */
class Late extends Error {}
/** 一次讀取最多等多久（L2 R14）：iCloud 佔位檔可能一直不回來；同還原的上限。 */
const READ_WAIT = 30_000;
/** 等一件事最多 ms 毫秒，沒回來丟 Late；晚到的結果沒有人接。 */
export function limitedRead<T>(work: Promise<T>, ms = READ_WAIT): Promise<T> {
  let id: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<never>((_, reject) => { id = setTimeout(() => { reject(new Late(`讀取超過 ${ms / 1000} 秒沒有回來`)); }, ms); });
  return Promise.race([work, late]).finally(() => { clearTimeout(id); });
}

const fileName = (path: string): string => path.slice(path.lastIndexOf('/') + 1).replace(/\.md$/, '');

const STOP: Record<DeepenStop['why'], string> = {
  changed: '這一篇在複製提示之後換了或刪了目標（或改了名、搬了位置、改成草稿），這次沒有寫；請重新複製提示',
  fence: '這一篇有沒關好的程式碼區塊（``` 或 ~~~），接在後面的東西會被當成程式碼；請先修好再按「繼續」',
  verify: '組好的內容讀回來和預期不同，這次沒有寫；請回報這個問題',
  unsaved: '這篇筆記有還沒存進去的修改，先不寫；等一下再按「繼續」',
  locked: '這一篇前一次寫入花太久、不知道寫成沒有，這次開著 Obsidian 的期間不再寫它；這次沒有寫，重開 Obsidian 後再按「繼續」',
  unclear: '上一次寫到一半中斷了，認不出這一批寫進去沒有。看過卡組最後面的加深框再選：已經寫進去就選「當作完成」，沒有就選「放棄」',
  blocked: '先不寫；等一下再按「繼續」',
  failed: '寫不進去，這次停在一半；按「繼續」會從停下的地方接著做',
  unreadable: '讀不到檔（可能還在從 iCloud 下載）；等一下再按「繼續」',
  conflict: '原文或快照的檔對不上：那個位置已經有不同的內容，沒有覆蓋',
  name: '快照的檔名一直被占用（可能正在同步）；等一下再按「繼續」',
  timeout: '寫進去花太久，不知道寫成沒有。看過卡組最後面的加深框再選：已經寫進去就選「當作完成」，沒有就選「放棄」',
  phone: '加深只在電腦上做',
  loading: '正在讀取卡組，先不寫；讀完再按「繼續」',
  'needs-update': '這一篇需要新版的外掛才讀得懂，先不寫',
  displaced: '外掛用的資料夾不在原位，先不寫；照提醒把它放回原位，再按「繼續」',
  newer: '這次加深是較新版的外掛存的，這一版認不出來，先不寫；請更新外掛再按「繼續」',
};

export function createDeepen(deps: DeepenDeps) {
  let jobs = readDeepenJobs(deps.store.jobs(), deps.now().ms).jobs;
  /** 直接製作這次開著 Obsidian 的期間記得的教材檔（重送不用重選，§6）：內容不存。 */
  const sentMaterials = new Map<string, Material[]>();
  /** 正在送出的那一個的中止開關（一次只送一個，§6）。 */
  let sending: AbortController | null = null;
  function persist(next: DeepenJob[]): void {
    const kept = readDeepenJobs(next, deps.now().ms).jobs;
    deps.store.saveJobs(kept);
    jobs = kept;
    for (const id of sentMaterials.keys()) if (!kept.some(job => job.id === id && !job.save)) sentMaterials.delete(id);
    void refreshLater();
  }
  // 等待貼回的列跟著工作變（§4-3）：rows 的計算在下面定義，這裡晚一拍叫。
  const refreshLater = (): Promise<void> => Promise.resolve().then(() => refresh());
  const put = (job: DeepenJob): void => { persist([job, ...jobs.filter(each => each.id !== job.id && each.deck !== job.deck)]); };
  const drop = (job: DeepenJob): void => { persist(jobs.filter(each => each.id !== job.id)); };
  const current = (job: DeepenJob): DeepenJob | undefined => jobs.find(each => each.id === job.id);
  const busy = new Set<string>();
  const BUSY: DeepenOutcome = { kind: 'stop', message: '這一篇還在寫，沒有停下來；等一下再看結果', unclear: false };
  const GONE: DeepenOutcome = { kind: 'stop', message: '這次加深已經結束或取消了；要再做一份請重新複製提示', unclear: false };
  async function exclusive(id: string, work: () => Promise<DeepenOutcome>): Promise<DeepenOutcome> {
    if (busy.has(id)) return BUSY;
    busy.add(id);
    // 寫入中的列不能按取消（L2 R9）：開始與結束都重算一次。
    void refreshLater();
    try { return await work(); } finally { busy.delete(id); void refreshLater(); }
  }
  const busyDeck = (path: string): boolean => jobs.some(job => job.deck === path && busy.has(job.id));

  /**
   * 算記穩了、常錯的目標（§2-1 的啟用目標，L2 R5）：啟用的卡組照 state 的 deckTargets（暫停、重複 ID、紀錄停用的都不在裡面）；
   * 暫停的卡組可以手動加深，照同樣的條件從這一篇自己挑（目標沒暫停、讀得懂、有題目、紀錄沒停用、ID 不重複）。其餘的目標照樣送給 AI
   * 看結構與去重，但標成還沒記穩、不算進記穩目標。
   */
  function eligible(state: State, path: string, deck: Deck): string[] {
    if (deck.props.status === 'active') return [...state.deckTargets(path)];
    const stopped = state.aiStopped(path);
    return [...new Set(deck.targets.filter(t => t.id !== null && t.ok && !t.fields.paused && t.prompts.length > 0 && !stopped({ id: t.id, line: t.line })).map(t => t.id!))];
  }
  /** 紀錄或卡組有讀不到的（state 的 unread，L2 R4）：記穩了的數字不可靠，不問也不讓發起。 */
  // 直接看 unread()：writeBlock 會先回備份、還原等原因，蓋掉讀不到的篇（L2 R14）。
  const partial = (state: State): boolean => state.writeBlock() === 'unread' || state.unread().length > 0;
  /** 讀取等不到就丟錯（L2 R14）：照讀不到處理，晚到的結果不用。 */
  const readWait = deps.readWait ?? READ_WAIT;
  const limited = <T>(work: Promise<T>): Promise<T> => limitedRead(work, readWait);

  /** 這一篇現在的樣子（§1）：卡組筆記、啟用或暫停、讀得懂、不需要新版、至少一個有 ID 的目標。 */
  function ready(path: string): Readiness {
    const state = deps.state();
    if (!state || state.writeBlock() === 'loading') return { ok: false, why: '正在讀取卡組；等一下再按' };
    if (partial(state)) return { ok: false, why: '還有卡組或複習紀錄沒讀到（可能還在從 iCloud 下載），記穩了的數字不準；等一下再按' };
    if (!isDeckPath(path)) return { ok: false, why: '加深只用在卡組筆記' };
    const entry = state.decks().find(each => each.path === path);
    if (!entry) return { ok: false, why: '這篇筆記不是卡組，或還沒讀到' };
    const { props } = entry.deck;
    if (props.isTranscript) return { ok: false, why: '轉錄稿不能加深，請打開卡組' };
    if (props.status === 'draft') return { ok: false, why: '草稿還沒審完，直接改草稿就好；啟用之後才加深' };
    if (props.statusRead === 'invalid') return { ok: false, why: '這一篇的屬性區讀不懂，先修好屬性區' };
    if (state.deckStatus(path).needsUpdate) return { ok: false, why: '這一篇需要新版的外掛才讀得懂' };
    const ids = [...new Set(entry.deck.targets.filter(t => t.id !== null && t.ok).map(t => t.id!))];
    if (!ids.length) return { ok: false, why: '這一篇還沒有讀得懂、有 ID 的學習目標：先存檔補上 ID，或修好寫法有問題的目標' };
    const history = state.history();
    const mastery = masteryOf(eligible(state, path, entry.deck), history.reviews, id => history.incomplete || history.held.includes(id));
    const counts = { stable: 0, weak: 0, unstable: 0 };
    for (const id of ids) { const each = mastery.get(id); if (each === 'stable') counts.stable++; else if (each === 'weak') counts.weak++; else counts.unstable++; }
    return { ok: true, path, name: fileName(path), deck: entry.deck, mastery, counts };
  }

  /** 快照連結指到哪一篇（§2-3）：寫完整路徑的照路徑；只寫檔名的，同檔名的卡組剛好一篇才算。 */
  function resolve(link: string): string | null {
    if (link.includes('/')) return link.endsWith('.md') ? link : `${link}.md`;
    const found = deps.named(link.toLowerCase()).filter(isDeckPath);
    return found.length === 1 ? found[0] : null;
  }
  async function owned(path: string, deck: Deck): Promise<SnapshotInfo[]> {
    const list = (await limited(deps.snapshots())).flatMap(each => { const info = readSnapshot(each.path, each.text); return info ? [info] : []; });
    return ownSnapshots(list, path, new Set(deck.targets.flatMap(t => t.id ?? [])), resolve);
  }

  /** 這一科點選填空的預設（D-210 第 3 點）：這台電腦上次的選擇，沒有記過照規則表。 */
  const pickFor = (key: string): boolean => deps.store.picks()[key] ?? RULE_SUBJECTS.find(each => each.key === key)?.pick ?? false;

  /**
   * 學習目的（§2-2、L2 R8）：這一篇或它的單元有今天以後的小考是準備小考；在生效的考試範圍裡是準備段考；其餘平常複習。
   * 兩個都有時寫小考：日期通常比較近、範圍比較窄。沿用小考與考試範圍的讀取結果，不另存日期。
   */
  function purposeOf(path: string, deck: Deck): Purpose {
    const state = deps.state();
    if (!state) return '平常複習';
    const at = deps.now();
    // 照清晨 4 點換日（syntax §4-1，L2 R15）：小考隔天凌晨還算考試當天。
    const today = scopeDate(dayOf(at.ms, at.offset));
    const { term, subject, unit } = deck.props;
    const key = term !== null && subject !== null && unit !== null ? unitKey(term, subject, unit.code) : null;
    if (state.quizzes().some(quiz => quiz.date !== null && quiz.date >= today && quiz.refs.some(ref => 'deck' in ref ? ref.deck === path : ref.unit === key))) return '準備小考';
    const exam = state.exam();
    return exam.path !== null && exam.usable && exam.file !== null && deckInScope(exam.file, deck) ? '準備段考' : '平常複習';
  }


  function formOf(deck: Deck, path: string, direction: string, material: string, pick: boolean | undefined): { form: CardForm; key: string } | null {
    const subject = RULE_SUBJECTS.find(each => each.subject === deck.props.subject && deps.rules[each.key]?.length);
    if (!subject) return null;
    const { term, unit } = deck.props;
    return {
      key: subject.key,
      form: { subject: subject.key, term: term ?? '', unit: unit ? `${unit.code} ${unit.name}`.trim() : fileName(path), purpose: purposeOf(path, deck), supplement: subject.supplement, pick: pick ?? pickFor(subject.key), adjust: direction.trim(), material: material.trim() },
    };
  }

  /** 恢復資料的 Outcome。 */
  const outcome = (job: DeepenJob, result: DeepenResult): DeepenOutcome => result.kind === 'done'
    ? { kind: 'done', wrote: result.wrote, path: job.deck }
    : { kind: 'stop', message: STOP[result.why] + (result.why === 'blocked' && result.detail ? `（${result.detail}）` : ''), unclear: result.why === 'unclear' || result.why === 'timeout' };

  async function run(job: DeepenJob): Promise<DeepenOutcome> {
    const state = deps.state();
    if (!state) return { kind: 'stop', message: STOP.loading, unclear: false };
    let latest = job;
    try {
      const result = await runDeepen(job, {
        store(next) { latest = next; put(next); },
        remove(done) { drop(done); },
        read: path => state.aiRead(path),
        displaced: path => state.aiDisplaced(path),
        async append(path, plan) {
          if (await deps.unsaved(path)) return { kind: 'not', why: 'unsaved' };
          return state.aiAppend(path, deps.editor(path), plan);
        },
        create: (path, text) => state.aiCreate(path, text),
        names: deps.names,
      });
      // 結果不明、逾時：寫過的 ID 不再配出（不管最後當作完成或放棄，卡組裡可能已經有它們）。
      if (result.kind === 'stop' && (result.why === 'unclear' || result.why === 'timeout')) deps.store.retire(latest.save?.ids ?? []);
      return outcome(latest, result);
    } catch (error) {
      deps.onError(error);
      return { kind: 'stop', message: '寫到一半出了問題，這次停在一半；按「繼續」會從停下的地方接著做', unclear: false };
    }
  }

  /** 提醒一區的列（§4）：背景算好放著，畫面同步拿；算好、和上一次不同才通知。 */
  let rows: DeepenRow[] = [];
  const listeners = new Set<() => void>();
  let computing: Promise<void> | null = null;
  let again = false;
  async function compute(): Promise<DeepenRow[]> {
    const state = deps.state();
    if (!state || state.writeBlock() === 'loading' || deps.store.remindOff()) return [];
    // 讀不到的時候只留這台電腦自己知道的「等你貼回」：記穩了的數字與卡組裡的框都不可靠（L2 R4）。
    if (partial(state)) return waitingRows(state);
    const now = deps.now().ms;
    const infos = (await limited(deps.snapshots())).flatMap(each => { const info = readSnapshot(each.path, each.text); return info ? [info] : []; });
    const skips = readSkips(deps.store.skips(), text => parseTime(text)?.at ?? null);
    const history = state.history();
    const found: DeepenRow[] = [];
    for (const entry of state.decks()) {
      const { props } = entry.deck;
      if (props.isTranscript || props.status !== 'active' || !isDeckPath(entry.path) || state.deckStatus(entry.path).needsUpdate) continue;
      const name = fileName(entry.path);
      const waiting = jobs.some(job => job.deck === entry.path);
      let pending = false;
      if (!waiting) {
        // 一篇讀不到只略過那一篇，不讓整次重算失敗、留著舊的列（L2 R4）。
        let text: string | null;
        try { text = await limited(deps.read(entry.path)); } catch { continue; /* 讀不到是同步中的正常狀態，下一次重算再看；不記錯誤 */ }
        if (text === null) continue;
        pending = deepenPending(text);
      }
      let remind = null;
      if (!waiting && !pending) {
        const active = state.deckTargets(entry.path);
        const deckIds = new Set(entry.deck.targets.flatMap(t => t.id ?? []));
        const base = baselineOf(ownSnapshots(infos, entry.path, deckIds, resolve), now);
        const skip = skipFor(skips.get(entry.path), deckIds);
        const mastery = masteryOf(active, history.reviews, id => history.incomplete || history.held.includes(id));
        remind = remindOf(active, mastery, chooseBase(base && base.at !== null ? { at: base.at, stable: base.stable ?? [], first: base.kind !== 'deepen' } : null, skip));
      }
      const row = deepenRow(entry.path, name, { waiting, writing: waiting && busyDeck(entry.path), pending, remind });
      if (row) found.push(row);
    }
    return found;
  }
  /** 只有這台電腦自己知道的列：等你貼回、正在寫。 */
  function waitingRows(state: State): DeepenRow[] {
    const known = new Set(state.decks().map(entry => entry.path));
    return jobs.filter(job => known.has(job.deck)).flatMap(job => deepenRow(job.deck, fileName(job.deck), { waiting: true, writing: busy.has(job.id), pending: false, remind: null }) ?? []);
  }
  /** 重算一次（同時只跑一份，中間又被叫就再跑一次）；回傳時已經算好。 */
  function refresh(): Promise<void> {
    if (computing) { again = true; return computing; }
    computing = (async () => {
      do {
        again = false;
        let next: DeepenRow[];
        // 算到一半出錯：不留舊的可以按的列，只留等你貼回（L2 R4）。
        try { next = await compute(); } catch (error) { if (!(error instanceof Late)) deps.onError(error); next = rows.filter(row => row.kind === 'waiting' || row.kind === 'writing'); }
        if (JSON.stringify(next) !== JSON.stringify(rows)) { rows = next; for (const listener of listeners) listener(); }
      } while (again);
    })().finally(() => { computing = null; });
    return computing;
  }

  const at = (): string => { const now = deps.now(); return stamp(now.ms, now.offset); };
  async function recopyParts(job: DeepenJob): Promise<boolean> {
    try { await deps.clipboard(job.parts.map(part => part.text).join('\n\n')); return true; } catch (error) { deps.onError(error); return false; }
  }
  /** 這一篇上一次直接送出、還沒處理完的（格式查核 F14 第 2 點）：再做一份新的會把它無聲地換掉，可能已經計費，先擋下。 */
  function heldDirect(path: string): string | null {
    const job = jobs.find(each => each.deck === path);
    return job && !job.save && directJob(job) ? '這一篇上一次直接送出的還沒處理完：先在「加深這一節」重送、改用複製貼上，或取消那一次' : null;
  }
  /**
   * 讀好這一篇（§1 第 2 點）：卡組、全文、以前的快照；組提示的其他東西（方向、教材說明、點選填空）由 build 帶進來。
   * build 每次用現在的時間與新的識別碼組一份還沒存的工作；複製與直接製作在按下的當下讀一次，送出前那一行用表單開著時讀的那一份。
   */
  async function context(path: string): Promise<DeepenContext | { error: string }> {
    const now = ready(path);
    if (!now.ok) return { error: now.why };
    const state = deps.state()!;
    if (!formOf(now.deck, path, '', '', undefined)) return { error: '這一科還沒有規則，不能加深' };
    let text: string | null;
    try { text = await state.aiRead(path); } catch (error) { deps.onError(error); return { error: '讀不到這一篇（可能還在從 iCloud 下載）；等一下再按' }; }
    if (text === null) return { error: '找不到這一篇' };
    let snapshots: SnapshotInfo[];
    try { snapshots = await owned(path, now.deck); } catch (error) { if (!(error instanceof Late)) deps.onError(error); return { error: '讀不到以前的快照；等一下再按' }; }
    const baseSha = sha256Hex(text);
    const ids = new Set(now.deck.targets.flatMap(t => t.id ?? []));
    const targets = deepenTargets(now.deck, now.mastery);
    const siblings = unitSiblings(state.decks(), path, now.deck);
    return {
      build(direction, material, pick) {
        const made = formOf(now.deck, path, direction, material, pick);
        if (!made) return { error: '這一科還沒有規則，不能加深' };
        const subject = RULE_SUBJECTS.find(each => each.key === made.key)!;
        const at = deps.now();
        const map = latestMap(snapshots, at.ms)?.map ?? null;
        const prompt = buildDeepenPrompt({ form: made.form, subject, targets, siblings, map, gone: goneTargets(snapshots, ids),
          words: subject.subject === '英文' ? state.aiWords(subject.subject, made.form.term) : null }, deps.rules[made.key]);
        const job: DeepenJob = {
          kind: 'deepen', id: newId(deps.random ?? Math.random, new Set(jobs.map(each => each.id)), { letterFirst: true }), copiedAt: stamp(at.ms, at.offset), copiedMs: at.ms,
          deck: path, ids: [...ids], baseSha, form: made.form, subject: { key: subject.key, label: subject.label, subject: subject.subject, r3: subject.r3 },
          parts: prompt.parts, promptSha: prompt.sha256, stable: targets.filter(t => t.mastery === 'stable').map(t => t.id).sort(), sent: targets.length, save: null,
        };
        return { job, prompt: prompt.text, key: made.key };
      },
    };
  }
  /** 重送與重送前的那一行共用的檢查（§6）：工作還在、教材在（上一次沒附的不用選）、設定與金鑰、上限；要到設定頁改的標 settings。 */
  function resendTarget(job: DeepenJob, picked?: readonly Material[]): { error: string; settings?: boolean } | { direct: DirectDeps; latest: DeepenJob; materials: Material[]; target: { connection: Connection; provider: ProviderSpec; model: string }; key: string; prompt: string } {
    const direct = deps.direct;
    if (!direct) return { error: '這台裝置不能直接製作，請用複製提示' };
    const latest = current(job);
    if (!latest || latest.save) return { error: '這次加深已經結束或開始寫了，不能重送' };
    const materials = picked ? [...picked] : sentMaterials.get(latest.id) ?? (directJob(latest)?.files.length === 0 ? [] : undefined);
    if (!materials) return { error: '上次選的教材檔已經不在了（重開過 Obsidian），請重新選一次，或改用複製貼上' };
    const problem = materials.length ? materialProblem(materials) : null;
    if (problem) return { error: problem };
    const target = endpoint(direct);
    if ('error' in target) return { error: target.error, settings: true };
    const key = direct.key();
    if (!key.ok) return { error: NO_KEY[key.why], settings: true };
    const prompt = latest.parts.map(part => part.text).join('\n\n');
    const limit = providerProblem(target.provider, target.model, materials, prompt.length);
    if (limit) return { error: limit };
    return { direct, latest, materials, target, key: key.key, prompt };
  }
  /** 直接製作的狀態存進這一份工作（§7 `api`）：存不進去交給錯誤紀錄、照樣往下（送出前的那一次由呼叫端擋），交回手上的那一份。 */
  function mark(job: DeepenJob, api: NonNullable<DeepenJob['api']>): DeepenJob {
    const next: DeepenJob = { ...job, api };
    try { put(next); } catch (error) { deps.onError(error); }
    return next;
  }
  /** 送出一次（同製卡）：成功交回整段與證據、存進工作；不成功交給錯誤紀錄（取消的不記，§8）。 */
  async function send(direct: DirectDeps, job: DeepenJob, prompt: string, materials: readonly Material[], target: { connection: Connection; provider: ProviderSpec }, apiKey: string, onProgress?: (event: ProgressEvent) => void): Promise<DeepenDirectOutcome> {
    const controller = new AbortController();
    const files: SentFile[] = sentFiles(materials);
    sending = controller;
    try {
      const request = directRequest({ ...target, apiKey, prompt, materials, signal: controller.signal, ...onProgress ? { onProgress } : {} });
      const sent = await sendDirect(direct.client, request);
      if (sent.ok) {
        const reasoning = target.connection.reasoning === 'default' ? null : target.connection.reasoning;
        const evidence = evidenceOf(sent.result, providerName(target.provider), files, reasoning, deps.now());
        const saved = mark(current(job) ?? job, { state: 'received', kind: null, at: at(), files, received: evidence });
        return { kind: 'received', job: saved, reply: evidence.text, evidence };
      }
      if (sent.failure.kind !== 'cancelled') {
        try { direct.onFailure?.(failureLog(sent.failure, sent.error, sent.result, request, providerName(target.provider)), sent.failure); } catch (error) { deps.onError(error); }
      }
      const latest = current(job) ?? job;
      const saved = mark(latest, { state: 'failed', kind: sent.failure.kind, at: at(), files, received: directJob(latest)?.received ?? null, ...sent.failure.afterResponse ? { charged: true } : {} });
      return { kind: 'failed', job: saved, failure: sent.failure, partial: sent.partial };
    } finally {
      if (sending === controller) sending = null;
    }
  }

  return {
    ready,
    rows: (): readonly DeepenRow[] => rows,
    refresh,
    /**
     * 按鈕按下去時的重算（L2 R18）：等到一次重算完，但最多等 within 毫秒（預設一次讀取的上限再加 5 秒）；等不到回 false，
     * 呼叫端請家長等一下再按，不照舊的列做。背景接著排的重算不延長這一次的等待。
     */
    async refreshForClick(within = readWait + 5_000): Promise<boolean> {
      let id: ReturnType<typeof setTimeout> | undefined;
      const late = new Promise<false>(resolve => { id = setTimeout(() => { resolve(false); }, within); });
      return Promise.race([refresh().then(() => true), late]).finally(() => { clearTimeout(id); });
    },
    onRows(listener: () => void): () => void { listeners.add(listener); return () => { listeners.delete(listener); }; },
    /** 「這次不用」（§5-1）：記下這一篇現在記穩了的目標與時間；之後的門檻從這裡算。 */
    async skip(path: string): Promise<void> {
      const now = ready(path);
      if (!now.ok) return;
      const state = deps.state()!;
      const active = new Set(state.deckTargets(path));
      const ids = [...now.mastery].filter(([id, each]) => each === 'stable' && active.has(id)).map(([id]) => id).sort();
      const raw = deps.store.skips();
      const kept = typeof raw === 'object' && raw !== null && !Array.isArray(raw) ? { ...raw as Record<string, { ids: string[]; at: string }> } : {};
      const at = deps.now();
      kept[path] = { ids, at: stamp(at.ms, at.offset) };
      deps.store.saveSkips(kept);
      await refresh();
    },
    /** 這一篇還沒完成的加深工作（防重，§1 第 3 點）。 */
    jobOf: (path: string): DeepenJob | null => jobs.find(each => each.deck === path) ?? null,
    jobs: (): readonly DeepenJob[] => jobs,
    /** 貼回後配好、還沒寫完的 ID：state 配號時避開（同製卡的預留）。 */
    reserved: (): string[] => jobs.flatMap(job => job.save?.ids ?? []),
    /** 複製提示（§1 第 2 點）：組提示、存成待貼回的工作（同一篇舊的那份換掉），再放進剪貼簿。 */
    /** 加深畫面的點選填空預設勾不勾（D-210 第 3 點）；這一科沒有規則時是 false。 */
    pick(path: string): boolean {
      const deck = deps.state()?.decks().find(each => each.path === path)?.deck;
      const subject = deck && RULE_SUBJECTS.find(each => each.subject === deck.props.subject && deps.rules[each.key]?.length);
      return subject ? pickFor(subject.key) : false;
    },
    /** pick：這次勾不勾點選填空；沒給照 pick(path)。 */
    async copy(path: string, direction: string, material: string, pick?: boolean): Promise<{ job: DeepenJob; chars: number } | { error: string }> {
      const held = heldDirect(path);
      if (held) return { error: held };
      const ctx = await context(path);
      if ('error' in ctx) return ctx;
      const made = ctx.build(direction, material, pick);
      if ('error' in made) return made;
      const { job, prompt } = made;
      try { put(job); } catch (error) { deps.onError(error); return { error: '存不進這台電腦，這次沒有複製；請再按一次' }; }
      deps.store.savePick(made.key, job.form.pick === true);
      try { await deps.clipboard(prompt); } catch (error) { deps.onError(error); return { error: '放不進剪貼簿；請再按一次' }; }
      return { job, chars: prompt.length };
    },
    /** 這台有沒有直接製作（電腦才有，§9）。 */
    canDirect: (): boolean => deps.direct !== undefined,
    /** 讀好這一篇（送出前那一行用，§9）：表單開著的期間用同一份重組提示；讀不到是原因。 */
    context,
    /**
     * 直接製作能不能按、按了會送出什麼（§9，同製卡的 directPreview）：不能按時是原因，要到設定頁改的標 settings。教材檔選填，選了照 §5 檢查。
     * 不存、不送；沒有直接製作的裝置是 null。
     */
    directPreview(ctx: DeepenContext, direction: string, material: string, pick: boolean | undefined, materials: readonly Material[]): { ok: true; line: string } | { ok: false; reason: string; settings?: boolean } | null {
      const direct = deps.direct;
      if (!direct) return null;
      const target = endpoint(direct);
      if ('error' in target) return { ok: false, reason: target.error, settings: true };
      const key = direct.key();
      if (!key.ok) return { ok: false, reason: NO_KEY[key.why], settings: true };
      const problem = materials.length ? materialProblem(materials) : null;
      if (problem) return { ok: false, reason: problem };
      const made = ctx.build(direction, material, pick);
      if ('error' in made) return { ok: false, reason: made.error };
      const limit = providerProblem(target.provider, target.model, materials, made.prompt.length);
      if (limit) return { ok: false, reason: limit };
      const request = directRequest({ connection: target.connection, provider: target.provider, apiKey: key.key, prompt: made.prompt, materials });
      return { ok: true, line: sendingLine(direct.client, target.provider, request, materials, made.prompt.length) };
    },
    /**
     * 直接製作（§9，同製卡的 §4 第 1～5 步）：組提示、建這一篇的加深工作（先存再送），送出、等回覆。送出前擋下的不建工作；
     * 送出之後不論成功與否都留著那一份（重送、改用複製貼上或取消）。這一篇上一次直接送出的還沒處理完時擋下（格式查核 F14 第 2 點）。
     */
    async direct(path: string, direction: string, material: string, pick: boolean | undefined, materials: readonly Material[], onProgress?: (event: ProgressEvent) => void): Promise<DeepenDirectOutcome> {
      const direct = deps.direct;
      if (!direct) return { kind: 'blocked', message: '這台裝置不能直接製作，請用複製提示' };
      if (sending) return { kind: 'blocked', message: '另一篇正在送出，等它好了再按' };
      const target = endpoint(direct);
      if ('error' in target) return { kind: 'blocked', message: target.error };
      const key = direct.key();
      if (!key.ok) return { kind: 'blocked', message: NO_KEY[key.why] };
      const problem = materials.length ? materialProblem(materials) : null;
      if (problem) return { kind: 'blocked', message: problem };
      const held = heldDirect(path);
      if (held) return { kind: 'blocked', message: held };
      const ctx = await context(path);
      if ('error' in ctx) return { kind: 'blocked', message: ctx.error };
      const made = ctx.build(direction, material, pick);
      if ('error' in made) return { kind: 'blocked', message: made.error };
      const limit = providerProblem(target.provider, target.model, materials, made.prompt.length);
      if (limit) return { kind: 'blocked', message: limit };
      if (sending) return { kind: 'blocked', message: '另一篇正在送出，等它好了再按' };
      // 先存再送：送到一半被關掉，重開看得到「上一次沒有收到回覆」（§6）。
      const job: DeepenJob = { ...made.job, api: { state: 'sending', kind: null, at: made.job.copiedAt, files: sentFiles(materials), received: null } };
      try { put(job); } catch (error) { deps.onError(error); return { kind: 'blocked', message: '存不進這台電腦，這次沒有送出；請再按一次' }; }
      deps.store.savePick(made.key, job.form.pick === true);
      sentMaterials.set(job.id, [...materials]);
      return send(direct, job, made.prompt, materials, target, key.key, onProgress);
    },
    /** 這次開著 Obsidian 的期間記得這一份的教材檔，或上一次沒附教材（重送不用重選，§6）。 */
    keeps: (job: DeepenJob): boolean => sentMaterials.has(job.id) || directJob(job)?.files.length === 0,
    /** 重送前的那一行（§6，同製卡）：照現在的設定會送到哪一家、哪個模型、約多少錢；不能送時是原因。 */
    resendPreview(job: DeepenJob, picked?: readonly Material[]): { ok: true; line: string } | { ok: false; reason: string; settings?: boolean } {
      const ready = resendTarget(job, picked);
      if ('error' in ready) return { ok: false, reason: ready.error, ...ready.settings ? { settings: true } : {} };
      const request = directRequest({ connection: ready.target.connection, provider: ready.target.provider, apiKey: ready.key, prompt: ready.prompt, materials: ready.materials });
      return { ok: true, line: sendingLine(ready.direct.client, ready.target.provider, request, ready.materials, ready.prompt.length) };
    },
    /** 重送（§6）：同一份提示，不重組；收到過的那一份留到重送成功才換（L2 第二輪 S2）。 */
    async resend(job: DeepenJob, onProgress?: (event: ProgressEvent) => void, picked?: readonly Material[]): Promise<DeepenDirectOutcome> {
      if (!deps.direct) return { kind: 'blocked', message: '這台裝置不能直接製作，請用複製提示' };
      if (sending) return { kind: 'blocked', message: '另一篇正在送出，等它好了再按' };
      const ready = resendTarget(job, picked);
      if ('error' in ready) return { kind: 'blocked', message: ready.error };
      const { latest, materials, target, key, prompt } = ready;
      const sendingNow: DeepenJob = { ...latest, api: { state: 'sending', kind: null, at: at(), files: sentFiles(materials), received: directJob(latest)?.received ?? null } };
      try { put(sendingNow); } catch (error) { deps.onError(error); return { kind: 'blocked', message: '存不進這台電腦，這次沒有送出；請再按一次' }; }
      sentMaterials.set(latest.id, materials);
      return send(ready.direct, sendingNow, prompt, materials, target, key, onProgress);
    },
    /** 取消送出中的那一個（§6）：關掉視窗之前問過、停用外掛時。 */
    abort(): void { sending?.abort(); },
    /** 現在有沒有一個正在送出。 */
    sending: (): boolean => sending !== null,
    /**
     * 改用複製貼上（§6，同製卡）：再放一次同一份提示；放進去了，這一份改回一般的待貼回（拿掉 `api`、忘掉記得的教材檔）。放不進剪貼簿時不改、交回 null。
     */
    async fallback(job: DeepenJob): Promise<DeepenJob | null> {
      if (!await recopyParts(job)) return null;
      const plain: DeepenJob = { ...current(job) ?? job };
      delete plain.api;
      sentMaterials.delete(plain.id);
      try { put(plain); } catch (error) { deps.onError(error); }
      return plain;
    },
    recopy: recopyParts,
    /** 檢查（§3-1），不寫檔。 */
    inspect(job: DeepenJob, reply: string): DeepenInspection | { error: string } {
      const now = ready(job.deck);
      if (!now.ok) return { error: now.why };
      const targets = new Map(now.deck.targets.flatMap(t => t.id !== null && t.ok && !t.implicit ? [[t.id, t.name] as const] : []));
      return inspectDeepen(reply, job.form, job.subject, { path: job.deck, targets });
    },
    /** 寫進那一篇（§3-2 第 2 步之後接著做）。已經用另一份回覆開始的停下；同一份從停下的地方接著做。 */
    /**
     * received：框裡的是直接製作收到的（家長可能改過字，§9）；那一次的證據在組快照之前凍結，快照寫 `接法: API`。改用複製貼上的不給。
     */
    save: (job: DeepenJob, reply: string, service: string | null, received = false): Promise<DeepenOutcome> => exclusive(job.id, async () => {
      const latest = current(job);
      if (!latest) return GONE;
      if (latest.save) return latest.save.replySha === sha256Hex(reply) ? run(latest) : { kind: 'stop', message: '這次的提示已經用另一份回覆開始寫了：要繼續上一次的，或取消它', unclear: false };
      const state = deps.state();
      if (!state) return { kind: 'stop', message: STOP.loading, unclear: false };
      const now = ready(latest.deck);
      if (!now.ok) return { kind: 'stop', message: now.why, unclear: false };
      const targets = new Map(now.deck.targets.flatMap(t => t.id !== null && t.ok && !t.implicit ? [[t.id, t.name] as const] : []));
      const inspection = inspectDeepen(reply, latest.form, latest.subject, { path: latest.deck, targets });
      if (inspection.errors.length) return { kind: 'stop', message: '還有擋住的地方，先改好再寫', unclear: false };
      const ids = state.aiIds(inspection.names.length, blockIds(inspection.normalized.lines.join('\n')));
      if (typeof ids === 'string') return { kind: 'stop', message: STOP[ids === 'phone' || ids === 'loading' ? ids : 'blocked'], unclear: false };
      let n = 0;
      const at = deps.now();
      const batch = composeBatch(inspection, fileName(latest.deck), () => ids[n++], stamp(at.ms, at.offset).slice(0, 10));
      // 證據只用存著的那一份，而且要和畫面拿的是同一次（同製卡的 L2 第三輪 T1）：對不上就當成複製貼上。
      const kept = received ? directJob(latest)?.received ?? undefined : undefined;
      const evidence = kept && JSON.stringify(kept) === JSON.stringify(directJob(job)?.received) ? kept : undefined;
      const begun = beginDeepen(latest, reply, evidence ? null : service, batch, stamp(at.ms, at.offset), deps.names(), evidence);
      try { put(begun); } catch (error) { deps.onError(error); return { kind: 'stop', message: '存不進這台電腦，這次沒有寫任何檔；請再按一次', unclear: false }; }
      return run(begun);
    }),
    resume: (job: DeepenJob): Promise<DeepenOutcome> => exclusive(job.id, () => { const latest = current(job); return latest?.save ? run(latest) : Promise.resolve(GONE); }),
    /** 結果不明時家長選「當作完成」：不再碰卡組，寫原文與快照。 */
    settle: (job: DeepenJob): Promise<DeepenOutcome> => exclusive(job.id, async () => {
      const latest = current(job);
      if (!latest?.save) return GONE;
      const next = settleUnclear(latest);
      try { put(next); } catch (error) { deps.onError(error); return { kind: 'stop', message: '存不進這台電腦；請再按一次', unclear: true }; }
      return run(next);
    }),
    /** 取消或放棄（§3-2）：卡組裡已經寫進去的框不拿掉、快照不寫，這次不算一次加深；開始寫過的 ID 不再配出。 */
    cancel: (job: DeepenJob): Promise<DeepenOutcome> => exclusive(job.id, () => {
      const latest = current(job);
      if (!latest) return Promise.resolve(GONE);
      if (latest.save?.writing || latest.save?.unclear) deps.store.retire(latest.save.ids);
      drop(latest);
      return Promise.resolve({ kind: 'done', wrote: false, path: latest.deck });
    }),
  };
}
export type Deepen = ReturnType<typeof createDeepen>;
