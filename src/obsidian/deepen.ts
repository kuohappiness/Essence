import {
  baselineOf, beginDeepen, buildDeepenPrompt, chooseBase, composeBatch, deepenPending, deepenRow, deepenTargets, goneTargets, inspectDeepen, latestMap, ownSnapshots, readDeepenJobs, readSkips, readSnapshot, remindOf, RULE_SUBJECTS, skipFor, runDeepen, settleUnclear, sha256Hex, stamp, unitSiblings,
} from '../core/ai/index.ts';
import type { CardForm, DeepenInspection, DeepenJob, DeepenResult, DeepenRow, DeepenStop, EmbeddedRules, SnapshotInfo } from '../core/ai/index.ts';
import { blockIds, isDeckPath, newId } from '../core/deck/index.ts';
import type { Deck } from '../core/deck/index.ts';
import { masteryOf, parseTime } from '../core/study/index.ts';
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
}

/** 這一篇能不能加深（§1 第 1、4 點）：能的話附上卡組與三個數字。 */
export type Readiness =
  | { ok: true; path: string; name: string; deck: Deck; mastery: Map<string, Mastery>; counts: { stable: number; weak: number; unstable: number } }
  | { ok: false; why: string };

export type DeepenOutcome = { kind: 'done'; wrote: boolean; path: string } | { kind: 'stop'; message: string; unclear: boolean };

const fileName = (path: string): string => path.slice(path.lastIndexOf('/') + 1).replace(/\.md$/, '');

const STOP: Record<DeepenStop['why'], string> = {
  changed: '這一篇在複製提示之後換了或刪了目標（或改了名、搬了位置、改成草稿），這次沒有寫；請重新複製提示',
  fence: '這一篇有沒關好的程式碼區塊（``` 或 ~~~），接在後面的東西會被當成程式碼；請先修好再按「繼續」',
  verify: '組好的內容讀回來和預期不同，這次沒有寫；請回報這個問題',
  unsaved: '這篇筆記有還沒存進去的修改，先不寫；等一下再按「繼續」',
  unclear: '上一次寫到一半中斷了，認不出這一批寫進去沒有。看過卡組最後面的加深框再選：已經寫進去就選「當作完成」，沒有就選「放棄」',
  blocked: '先不寫；等一下再按「繼續」',
  failed: '寫不進去，這次停在一半；按「繼續」會從停下的地方接著做',
  unreadable: '讀不到檔（可能還在從 iCloud 下載）；等一下再按「繼續」',
  conflict: '原文的檔對不上：那個位置已經有不同的內容，沒有覆蓋',
  name: '快照的檔名一直被占用（可能正在同步）；等一下再按「繼續」',
  timeout: '寫進去花太久，不知道寫成沒有。看過卡組最後面的加深框再選：已經寫進去就選「當作完成」，沒有就選「放棄」',
  phone: '加深只在電腦上做',
  loading: '正在讀取卡組，先不寫；讀完再按「繼續」',
  'needs-update': '這一篇需要新版的外掛才讀得懂，先不寫',
  displaced: '外掛用的資料夾不在原位，先不寫；照提醒把它放回原位，再按「繼續」',
};

export function createDeepen(deps: DeepenDeps) {
  let jobs = readDeepenJobs(deps.store.jobs(), deps.now().ms).jobs;
  function persist(next: DeepenJob[]): void {
    const kept = readDeepenJobs(next, deps.now().ms).jobs;
    deps.store.saveJobs(kept);
    jobs = kept;
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
    try { return await work(); } finally { busy.delete(id); }
  }

  /** 這一篇現在的樣子（§1）：卡組筆記、啟用或暫停、讀得懂、不需要新版、至少一個有 ID 的目標。 */
  function ready(path: string): Readiness {
    const state = deps.state();
    if (!state || state.writeBlock() === 'loading') return { ok: false, why: '正在讀取卡組；等一下再按' };
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
    const mastery = masteryOf(ids, history.reviews, id => history.incomplete || history.held.includes(id));
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
    const list = (await deps.snapshots()).flatMap(each => { const info = readSnapshot(each.path, each.text); return info ? [info] : []; });
    return ownSnapshots(list, path, new Set(deck.targets.flatMap(t => t.id ?? [])), resolve);
  }

  /** 這一科點選填空的預設（D-210 第 3 點）：這台電腦上次的選擇，沒有記過照規則表。 */
  const pickFor = (key: string): boolean => deps.store.picks()[key] ?? RULE_SUBJECTS.find(each => each.key === key)?.pick ?? false;

  function formOf(deck: Deck, path: string, direction: string, material: string, pick: boolean | undefined): { form: CardForm; key: string } | null {
    const subject = RULE_SUBJECTS.find(each => each.subject === deck.props.subject && deps.rules[each.key]?.length);
    if (!subject) return null;
    const { term, unit } = deck.props;
    return {
      key: subject.key,
      form: { subject: subject.key, term: term ?? '', unit: unit ? `${unit.code} ${unit.name}`.trim() : fileName(path), purpose: '平常複習', supplement: subject.supplement, pick: pick ?? pickFor(subject.key), adjust: direction.trim(), material: material.trim() },
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
    const now = deps.now().ms;
    const infos = (await deps.snapshots()).flatMap(each => { const info = readSnapshot(each.path, each.text); return info ? [info] : []; });
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
        const text = await deps.read(entry.path);
        pending = text !== null && deepenPending(text);
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
      const row = deepenRow(entry.path, name, { waiting, pending, remind });
      if (row) found.push(row);
    }
    return found;
  }
  /** 重算一次（同時只跑一份，中間又被叫就再跑一次）；回傳時已經算好。 */
  function refresh(): Promise<void> {
    if (computing) { again = true; return computing; }
    computing = (async () => {
      do {
        again = false;
        let next: DeepenRow[];
        try { next = await compute(); } catch (error) { deps.onError(error); next = rows; }
        if (JSON.stringify(next) !== JSON.stringify(rows)) { rows = next; for (const listener of listeners) listener(); }
      } while (again);
    })().finally(() => { computing = null; });
    return computing;
  }

  return {
    ready,
    rows: (): readonly DeepenRow[] => rows,
    refresh,
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
      const now = ready(path);
      if (!now.ok) return { error: now.why };
      const state = deps.state()!;
      const made = formOf(now.deck, path, direction, material, pick);
      if (!made) return { error: '這一科還沒有規則，不能加深' };
      const subject = RULE_SUBJECTS.find(each => each.key === made.key)!;
      let text: string | null;
      try { text = await state.aiRead(path); } catch (error) { deps.onError(error); return { error: '讀不到這一篇（可能還在從 iCloud 下載）；等一下再按' }; }
      if (text === null) return { error: '找不到這一篇' };
      const at = deps.now();
      let snapshots: SnapshotInfo[];
      try { snapshots = await owned(path, now.deck); } catch (error) { deps.onError(error); return { error: '讀不到以前的快照；等一下再按' }; }
      const ids = new Set(now.deck.targets.flatMap(t => t.id ?? []));
      const map = latestMap(snapshots, at.ms)?.map ?? null;
      const targets = deepenTargets(now.deck, now.mastery);
      const prompt = buildDeepenPrompt({ form: made.form, subject, targets, siblings: unitSiblings(state.decks(), path, now.deck), map, gone: goneTargets(snapshots, ids),
        words: subject.subject === '英文' ? state.aiWords(subject.subject, made.form.term) : null }, deps.rules[made.key]);
      const job: DeepenJob = {
        kind: 'deepen', id: newId(deps.random ?? Math.random, new Set(jobs.map(each => each.id)), { letterFirst: true }), copiedAt: stamp(at.ms, at.offset), copiedMs: at.ms,
        deck: path, ids: [...ids], baseSha: sha256Hex(text), form: made.form, subject: { key: subject.key, label: subject.label, subject: subject.subject, r3: subject.r3 },
        parts: prompt.parts, promptSha: prompt.sha256, stable: targets.filter(t => t.mastery === 'stable').map(t => t.id).sort(), sent: targets.length, save: null,
      };
      try { put(job); } catch (error) { deps.onError(error); return { error: '存不進這台電腦，這次沒有複製；請再按一次' }; }
      deps.store.savePick(subject.key, made.form.pick === true);
      try { await deps.clipboard(prompt.text); } catch (error) { deps.onError(error); return { error: '放不進剪貼簿；請再按一次' }; }
      return { job, chars: prompt.text.length };
    },
    async recopy(job: DeepenJob): Promise<boolean> {
      try { await deps.clipboard(job.parts.map(part => part.text).join('\n\n')); return true; } catch (error) { deps.onError(error); return false; }
    },
    /** 檢查（§3-1），不寫檔。 */
    inspect(job: DeepenJob, reply: string): DeepenInspection | { error: string } {
      const now = ready(job.deck);
      if (!now.ok) return { error: now.why };
      const targets = new Map(now.deck.targets.flatMap(t => t.id !== null && t.ok && !t.implicit ? [[t.id, t.name] as const] : []));
      return inspectDeepen(reply, job.form, job.subject, { path: job.deck, targets });
    },
    /** 寫進那一篇（§3-2 第 2 步之後接著做）。已經用另一份回覆開始的停下；同一份從停下的地方接著做。 */
    save: (job: DeepenJob, reply: string, service: string | null): Promise<DeepenOutcome> => exclusive(job.id, async () => {
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
      const begun = beginDeepen(latest, reply, service, batch, stamp(at.ms, at.offset), deps.names());
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
