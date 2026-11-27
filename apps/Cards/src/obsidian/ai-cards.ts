import { abandonJob, beginSave, buildPrompt, directJob, inspectReply, NEWER_SAVE, planDraft, publish, publishedElsewhere, readJobs, rebuildDeck, reservedIds, RULE_SUBJECTS, sha256Hex, skipDeck, stamp, unitCode, withCode } from '../core/ai/index.ts';
import type { CardForm, CardJob, DeckStop, DirectEvidence, DirectJob, EmbeddedRules, Inspection, PublishIo, PublishResult, RuleSubject, SavedDeck, SentFile } from '../core/ai/index.ts';
import { blockIds, codeKey, newId, parseDeck, termKey } from '../core/deck/index.ts';
import { directRequest, evidenceOf, failureLog, materialProblem, modelOf, providerName, providerProblem, sendDirect, sendingLine, sentFiles } from '../core/connect/index.ts';
import type { AiClient, Connection, DirectFailure, DirectLog, KeyLookup, Material, ProgressEvent, ProviderSpec } from '../core/connect/index.ts';
import type { State, WriteBlock } from '../state/index.ts';

// AI 製卡的流程（tasks/ai-cards-mvp.md §2、§3、§5）：複製提示、貼回檢查、存草稿與繼續。畫面在 ai-cards-modal.ts；這裡不碰 Obsidian，測試直接用。
// 直接製作（tasks/ai-direct.md §4～§6）：同一份提示加上家長選的教材檔，用設定頁「AI 連線」的服務送出；收回的整段和貼回的走同一條路（檢查、存成草稿）。

/** 目錄認得的年級學期（syntax §2-1）：小一上～高三下。 */
const TERMS: readonly string[] = ['小', '國', '高'].flatMap((stage, s) => (s === 0 ? '一二三四五六' : '一二三').split('').flatMap(grade => [`${stage}${grade}上`, `${stage}${grade}下`]));
/** 點選填空勾選旁邊的一句說明（D-182 第 1 點）：製卡與加深的畫面共用。 */
export const PICK_NOTE = '容易混淆的字或觀念，出成看整組、點一個填進句子的比較題';
export const SERVICES = ['ChatGPT', 'Claude', 'Gemini', '其他'] as const;

export interface AiCardsDeps {
  /** 建置嵌進外掛的規則組（CARD_RULES）；表上有、這裡沒有的科目不列。 */
  rules: EmbeddedRules;
  state: () => State | null;
  /** 整個 vault 現在的 Markdown 檔名（小寫、不含 .md）：D-081 檔名整個 vault 不重複。 */
  names: () => Set<string>;
  /** 整個 vault 裡叫這個檔名（小寫、不含 .md）的 Markdown 路徑。 */
  named: (name: string) => string[];
  /** 這台電腦的存放（ui/prefs.ts 的 aiPrefs）。saveJobs 存不進去時丟錯。 */
  store: { jobs(): unknown; saveJobs(jobs: CardJob[]): void; retired(): string[]; retire(ids: readonly string[]): void; last(): { subject?: string; term?: string }; saveLast(last: { subject: string; term: string }): void;
    /** 點選填空每一科上次的選擇（D-210 第 2 點）。 */
    picks(): Record<string, boolean>; savePick(key: string, pick: boolean): void };
  clipboard: (text: string) => Promise<void>;
  /** 這台是手機（tasks/phone-cards.md §2-3）：建的卡組與快照，檔名後面加這次製卡的識別碼。 */
  phone?: boolean;
  now: () => { ms: number; offset: number };
  random?: () => number;
  onError: (error: unknown) => void;
  /**
   * 直接製作（tasks/ai-direct.md §4）：只在電腦，沒有這一欄就只有複製提示。connection 是設定頁「AI 連線」存的設定，
   * key 每次送出前才向 SecretStorage 拿（用完不留）；onFailure 是送不成時給錯誤紀錄的一行（§8，家長取消的不記；金鑰已經遮過）。
   */
  direct?: { client: AiClient; connection: () => Connection; key: () => KeyLookup; onFailure?: (log: DirectLog, failure: DirectFailure) => void };
}

/** 直接製作送出之前就擋下（沒有建工作、沒有送出）的原因，或送出之後的結果（§4、§6）。 */
export type DirectOutcome =
  | { kind: 'blocked'; message: string }
  | { kind: 'received'; job: CardJob; reply: string; evidence: DirectEvidence }
  | { kind: 'failed'; job: CardJob; failure: DirectFailure; partial: string | null };
/** 沒有可用的金鑰時「直接製作」不能按（§2，tasks/ai-direct.md）：照 keyOf 的原因說。 */
const NO_KEY: Record<Exclude<KeyLookup, { ok: true }>['why'], string> = {
  unset: '先到設定頁的「AI 連線」選好這個服務的金鑰，才能直接製作。',
  empty: '設定頁「AI 連線」選的金鑰是空的或找不到；重新貼上之後才能直接製作。',
  malformed: '設定頁「AI 連線」選的金鑰看起來不完整；重新貼上之後才能直接製作。',
};

/** 存草稿或繼續之後：done 是快照寫成（製卡成功）；stop 寫原因，deck 是要家長選的那一篇。 */
export type Outcome =
  | { kind: 'done'; decks: string[]; targets: number }
  | { kind: 'stop'; message: string; deck?: DeckStop & { name: string; stage: SavedDeck['stage'] } };

const BLOCKED: Record<WriteBlock | 'displaced' | 'changing', string> = {
  phone: '這台裝置的製卡沒有打開（設定頁的「在這台裝置製卡」），這次沒有存；打開之後再按「繼續」',
  loading: '正在讀取卡組，先不存；讀完再按「繼續」',
  closed: '外掛關閉了，這次沒有存完；重開之後按「繼續」',
  restore: '正在還原，先不存；還原完再按「繼續」',
  restoreStuck: '還原有一步卡住，先不存；重新開啟 Obsidian 之後再按「繼續」',
  backup: '備份還沒成功，先不存；到設定頁看原因，成功後再按「繼續」',
  unread: '還有卡組或紀錄沒讀到（可能還在從 iCloud 下載），先不存；等一下再按「繼續」',
  displaced: '外掛用的資料夾不在原位，先不存；照提醒把它放回原位，再按「繼續」',
  changing: '這幾篇卡組一直在變動（可能正在同步），先不存；等一下再按「繼續」',
};
const fileName = (path: string): string => path.slice(path.lastIndexOf('/') + 1).replace(/\.md$/, '');
/** 還沒開始存的工作停下時，畫面只有「回上一步」（第二輪 P3）：照畫面上真的有的按鈕說。 */
const firstSave = (message: string): string => message.replace(/再?按「繼續」$/, '回上一步，再按一次「存成草稿」');

/**
 * 家長在檢查結果看到的那一版（D-226 第 5 點，tasks/phone-cards.md §2-3）：每一篇的名稱與數字、擋住與提示的字。
 * 存草稿時照現況重新檢查，和這一份不同就不存，請家長再按一次「檢查」（例如檢查之後才同步來的卡組，讓加進已有的學習目標改成照原文留著）。
 */
export function inspectionKey(inspection: Inspection): string {
  return JSON.stringify({
    pieces: inspection.pieces.map(piece => [piece.name, piece.targets, piece.prompts, piece.candidates, piece.adds.length]),
    errors: inspection.errors.map(issue => [issue.line, issue.message]),
    hints: inspection.hints.map(issue => [issue.line, issue.message]),
  });
}

export function createAiCards(deps: AiCardsDeps) {
  const subjects = RULE_SUBJECTS.filter(subject => deps.rules[subject.key]?.length);
  const loaded = readJobs(deps.store.jobs(), deps.now().ms);
  let jobs = loaded.jobs;
  /** 這次開著 Obsidian 的期間，每一份直接製作的工作送了哪些教材（重送用；教材的內容不存，§5〈只送不存〉）。 */
  const sentMaterials = new Map<string, Material[]>();
  /**
   * 存回這台裝置：沒開始存草稿的最多 5 個、14 天（readJobs 照規則拿掉）。存不進去丟錯。
   * 存完讀回來核對，一字不差才算存好（tasks/phone-cards.md §2-5：手機的存放可能被系統清掉或存不下）；不同也丟錯，呼叫的一方照「存不進去」處理。
   */
  function persist(next: CardJob[]): void {
    const kept = readJobs(next, deps.now().ms).jobs;
    deps.store.saveJobs(kept);
    if (JSON.stringify(readJobs(deps.store.jobs(), deps.now().ms).jobs) !== JSON.stringify(kept)) throw Error('存進這台裝置之後讀回來不同');
    jobs = kept;
    // 工作清掉了（存完、放棄、過期、被擠掉）或開始存了，就不會再重送：記得的教材檔一起忘掉（L2 第一輪 R8）。
    for (const id of sentMaterials.keys()) if (!kept.some(job => job.id === id && !job.save)) sentMaterials.delete(id);
  }
  const put = (job: CardJob): void => { persist([job, ...jobs.filter(each => each.id !== job.id)]); };
  const drop = (job: CardJob): void => { persist(jobs.filter(each => each.id !== job.id)); };
  const subjectOf = (job: CardJob): Pick<RuleSubject, 'subject' | 'r3'> => job.subject;
  const GONE: Outcome = { kind: 'stop', message: '這次製卡已經結束或放棄了；要再做一份請重新複製提示' };
  const SAVING: Outcome = { kind: 'stop', message: '這一課還在存，沒有停下來；等一下再打開「AI 製卡」看結果' };
  /** 正在存、選擇或放棄的工作（L2-1）。視窗可以關掉重開，所以記在這裡、不記在視窗：同一個工作同時只有一個操作，放棄不會和還在跑的存檔交錯。 */
  const busy = new Set<string>();
  async function exclusive<T>(id: string, work: () => Promise<T>): Promise<T | Outcome> {
    if (busy.has(id)) return SAVING;
    busy.add(id);
    try { return await work(); } finally { busy.delete(id); }
  }
  /** 這個工作現在的樣子；視窗留著的那一份可能已經完成或放棄，不拿它當數（否則存回去就復活了）。 */
  const current = (job: CardJob): CardJob | undefined => jobs.find(each => each.id === job.id);

  /** PublishResult 換成給家長看的字（§5）；寫不進去的錯誤交給錯誤紀錄。 */
  function outcome(job: CardJob, result: PublishResult): Outcome {
    switch (result.kind) {
      case 'done': return result;
      case 'blocked': return { kind: 'stop', message: BLOCKED[result.reason as keyof typeof BLOCKED] ?? (result.reason === NEWER_SAVE ? NEWER_SAVE : '先不存；等一下再按「繼續」') };
      case 'name': return { kind: 'stop', message: `「${fileName(result.path)}」這個檔名一直被占用（可能正在同步），這次沒有建；等一下再按「繼續」` };
      case 'failed':
        deps.onError(result.error);
        return { kind: 'stop', message: '寫不進去，這次停在一半；按「繼續」會從停下的地方接著做' };
      case 'unreadable': return { kind: 'stop', message: `讀不到 ${result.path}（可能還在從 iCloud 下載）；等一下再按「繼續」` };
      case 'conflict': return { kind: 'stop', message: result.what === 'raw' ? `原文的檔對不上：${result.path} 已經有不同的內容，沒有覆蓋` : `快照的位置已經有不同的內容：${result.path}，沒有覆蓋` };
      case 'deck': {
        const deck = job.save!.decks[result.index];
        const name = fileName(deck.path);
        const message = result.situation === 'taken' ? `「${name}」要用的學習目標 ID 已經被別的卡組或複習紀錄用了，這一篇沒有建`
          : result.situation === 'unclear' ? `「${fileName(result.path)}」和這次要存的內容不同，認不出是不是這次寫的（可能是上次中斷後改過，或是別台裝置的檔）；沒有覆蓋，也不會自動重建`
          : result.situation === 'split' ? `「${name}」的學習目標現在分在好幾篇，或只剩一部分；不會自動補回`
          : deck.stage === 'written' ? `「${name}」寫成之後找不到了（可能被刪掉）；不會自動補回` : `上一次建「${name}」時中斷，現在找不到它；不會自動補回`;
        return { kind: 'stop', message, deck: { ...result, name, stage: deck.stage } };
      }
    }
  }
  /** 寫入的當下問：整個 vault 還沒有這個檔名（D-081）；只在這個路徑沒有檔時問。 */
  const nameFree = (path: string) => (): boolean => !deps.names().has(fileName(path).toLowerCase());
  /** 製卡成功的回報：通知寫學習目標數，寫成的篇裡的學習目標，候選卡片不算（§7）。 */
  function finished(job: CardJob): Outcome {
    const decks = job.save!.decks.filter(deck => !deck.skipped);
    return { kind: 'done', decks: decks.map(deck => deck.path), targets: decks.reduce((sum, deck) => sum + parseDeck(deck.text).targets.length, 0) };
  }
  /** 照恢復資料做第 3～7 步；每一步改了恢復資料都先存。 */
  async function run(job: CardJob): Promise<Outcome> {
    const state = deps.state();
    if (!state) return { kind: 'stop', message: BLOCKED.loading };
    let latest = job;
    const io: PublishIo = {
      store(next) { latest = next; put(next); },
      remove(done) { drop(done); },
      read: path => state.aiRead(path),
      displaced: path => state.aiDisplaced(path),
      // cards：AI 製卡的窄入口（D-226 第 2 點），手機打開了製卡也放。
      create: (path, text) => state.aiCreate(path, text, true),
      createDeck: (path, text, ids) => state.aiCreateDeck(path, text, ids, nameFree(path), true),
      createSnapshot: (path, text, decks) => state.aiCreateSnapshot(path, text, decks, nameFree(path), true),
      where: ids => state.aiWhere(ids),
      names: deps.names,
      named: deps.named,
      now: deps.now,
    };
    try {
      const result = await publish(job, io);
      return result.kind === 'done' ? finished(latest) : outcome(latest, result);
    } catch (error) {
      deps.onError(error);
      return { kind: 'stop', message: '存到一半出了問題，這次停在一半；按「繼續」會從停下的地方接著做' };
    }
  }

  /**
   * 複製提示與直接製作共用的第二步（§3）：照現況組提示與一份待貼回的工作，還沒存。讀不完、還原中、這一科沒有規則時是原因。
   * 同步做完，不等 I/O：剪貼簿要在按下的當下寫（L2 第四輪）。
   */
  function compose(form: CardForm): { job: CardJob; prompt: ReturnType<typeof buildPrompt> } | { error: string } {
    const state = deps.state();
    const subject = subjects.find(each => each.key === form.subject);
    const block = state?.writeBlock(true);
    if (!state || block === 'loading') return { error: '正在讀取卡組，讀完才知道學生已有哪些學習目標；等一下再按' };
    if (block === 'phone') return { error: '這台裝置的製卡沒有打開（設定頁的「在這台裝置製卡」）' };
    if (block === 'restore' || block === 'restoreStuck') return { error: '正在還原，還原完才知道學生已有哪些學習目標；等一下再按' };
    if (block === 'unread' || state.unread().length > 0) return { error: '還有卡組或紀錄沒讀到（可能還在從 iCloud 下載），讀到才知道學生已有哪些學習目標；等一下再按' };
    // 送來通知、還在讀的卡組：不等，請家長等一下再按（L2 第四輪：剪貼簿要在按下的當下寫，iPhone 等過 I/O 可能被拒；等的期間開關、還原也可能變）。
    if (!state.aiSettled()) return { error: '正在讀取剛同步來的卡組，讀完才知道學生已有哪些學習目標；等一下再按' };
    if (!subject) return { error: '這一科還沒有規則' };
    const existing = state.aiExisting(subject.subject, form.term);
    const words = subject.subject === '英文' ? state.aiWords(subject.subject, form.term) : null;
    const prompt = buildPrompt(form, subject, deps.rules[subject.key], existing, words);
    const at = deps.now();
    const job: CardJob = {
      id: newId(deps.random ?? Math.random, new Set(jobs.map(each => each.id)), { letterFirst: true }),
      copiedAt: stamp(at.ms, at.offset), copiedMs: at.ms, form, subject: { key: subject.key, label: subject.label, subject: subject.subject, r3: subject.r3 },
      parts: prompt.parts, promptSha: prompt.sha256, existing: existing.map(each => ({ ...each })), save: null,
    };
    return { job, prompt };
  }
  /** 這台電腦記下這次選的科目、年級學期與點選填空（下次的預設）。 */
  function remember(job: CardJob): void {
    deps.store.saveLast({ subject: job.subject.key, term: job.form.term });
    deps.store.savePick(job.subject.key, job.form.pick === true);
  }
  /** 正在送出的那一個的中止開關（一次只送一個）。 */
  let sending: AbortController | null = null;
  /** 設定頁選的服務與模型（§2）；選的服務不在目錄、沒有模型（OpenRouter 沒填）時是原因。 */
  function endpoint(direct: NonNullable<AiCardsDeps['direct']>): { connection: Connection; provider: ProviderSpec; model: string } | { error: string } {
    const connection = direct.connection();
    const provider = direct.client.providers().find(each => each.id === connection.provider);
    if (!provider) return { error: '設定頁「AI 連線」還沒選服務。' };
    const model = modelOf(connection, provider);
    if (!model) return { error: '設定頁「AI 連線」還沒填模型。' };
    return { connection, provider, model };
  }
  /**
   * 直接製作的狀態存進這一份工作（§7 `api`）：送出前、收到、失敗各存一次。存不進去交給錯誤紀錄、照樣往下（送出前的那一次除外，由呼叫端擋），
   * 交回存好（或存不進去時在手上）的那一份。
   */
  function mark(job: CardJob, api: DirectJob): CardJob {
    const next: CardJob = { ...job, api };
    try { put(next); } catch (error) { deps.onError(error); }
    return next;
  }
  const at = (): string => { const now = deps.now(); return stamp(now.ms, now.offset); };
  async function recopy(job: CardJob): Promise<boolean> {
    try { await deps.clipboard(job.parts.map(part => part.text).join('\n\n')); return true; } catch (error) { deps.onError(error); return false; }
  }
  /** 送出一次（§4 第 2～5 步）：成功交回整段與證據、存進工作（F2）；不成功交給錯誤紀錄（取消的不記，§8）。 */
  async function send(job: CardJob, prompt: string, materials: readonly Material[], target: { connection: Connection; provider: ProviderSpec }, apiKey: string, onProgress?: (event: ProgressEvent) => void): Promise<DirectOutcome> {
    const direct = deps.direct!;
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
      // 拿到回應之後才失敗的記下來：重開 Obsidian 之後的清單也寫重送會再計費（Windows 實機第 2 批第 1 點）。
      const saved = mark(current(job) ?? job, { state: 'failed', kind: sent.failure.kind, at: at(), files, received: null, ...sent.failure.afterResponse ? { charged: true } : {} });
      return { kind: 'failed', job: saved, failure: sent.failure, partial: sent.partial };
    } finally {
      if (sending === controller) sending = null;
    }
  }

  return {
    /** 讀不懂、沒辦法用的工作數（請家長重新複製一次）。 */
    broken: loaded.broken,
    subjects,
    /** 這一科用哪些規則與版號（唯讀的一行）。 */
    rulesLine: (key: string): string => (deps.rules[key] ?? []).map(rule => `${rule.name} ${rule.version}`).join('、'),
    /** 這一篇在這台會用的檔名基底（檢查結果的畫面用；手機加識別碼，tasks/phone-cards.md §2-3）。 */
    nameOf: (job: CardJob, name: string): string => withCode(name, deps.phone === true ? job.id : null),
    /** 沒完成的工作：最新的在前。 */
    jobs: (): readonly CardJob[] => [...jobs].sort((a, b) => b.copiedMs - a.copiedMs),
    /** 這台電腦預留、不能配出的 ID（§5〈ID 的預留〉）：state 每次配號時問。 */
    reserved: (): string[] => [...reservedIds(jobs), ...deps.store.retired()],
    last: () => deps.store.last(),
    /** 這一科點選填空的預設：這台電腦上次複製時的選擇，沒有記過照規則表（D-210 第 2 點）。 */
    pick: (key: string): boolean => deps.store.picks()[key] ?? RULE_SUBJECTS.find(each => each.key === key)?.pick ?? false,
    /** 年級學期的選項：這一科已有卡組的排前面（§2）。 */
    terms(key: string): string[] {
      const subject = subjects.find(each => each.key === key)?.subject;
      const used = new Set((deps.state()?.decks() ?? []).filter(entry => subject !== undefined && entry.deck.props.subject === subject && entry.deck.props.term !== null).map(entry => termKey(entry.deck.props.term!)));
      return [...TERMS.filter(term => used.has(term)), ...TERMS.filter(term => !used.has(term))];
    },
    /** 同一個年級學期、科目、單元編號已經有的卡組：檔名與狀態（§2，不擋）。 */
    sameUnit(form: CardForm): { name: string; status: string }[] {
      const subject = subjects.find(each => each.key === form.subject)?.subject;
      if (subject === undefined || subject === null || !form.unit.trim()) return [];
      const code = codeKey(unitCode(form.unit));
      const label = { draft: '草稿', active: '啟用', paused: '暫停' } as const;
      return (deps.state()?.decks() ?? []).filter(({ deck: { props } }) => props.subject === subject && props.term !== null && termKey(props.term) === termKey(form.term) && props.unit !== null && codeKey(props.unit.code) === code)
        .map(entry => ({ name: fileName(entry.path), status: label[entry.deck.props.status] }));
    },
    /** 會一起送出的已有學習目標；還沒讀完是 loading，有卡組或紀錄讀不到是 unread（數字不完整）。 */
    existing(form: CardForm): number | 'loading' | 'unread' {
      const state = deps.state();
      const subject = subjects.find(each => each.key === form.subject);
      // 看 AI 製卡自己的門檻（cards）：手機的一般門檻一律先回 phone，會蓋掉還沒讀完（L2 R6）。讀不到的卡組也不能當成沒有（第二輪延續 R6）。
      const block = state?.writeBlock(true);
      if (!state || !subject || block === 'loading') return 'loading';
      if (block === 'unread' || state.unread().length > 0) return 'unread';
      if (!state.aiSettled()) return 'loading';
      return state.aiExisting(subject.subject, form.term).length;
    },
    /** 第二步：組提示、存成待貼回的工作（按下的當下就存，F1），再放進剪貼簿。 */
    async copy(form: CardForm): Promise<{ job: CardJob; chars: number } | { error: string }> {
      const made = compose(form);
      if ('error' in made) return made;
      const { job, prompt } = made;
      try { put(job); } catch (error) { deps.onError(error); return { error: '存不進這台電腦，這次沒有複製；請再按一次' }; }
      remember(job);
      try { await deps.clipboard(prompt.text); } catch (error) { deps.onError(error); return { error: '放不進剪貼簿；請再按一次' }; }
      return { job, chars: prompt.text.length };
    },
    /** 這台有沒有直接製作（電腦才有，§4 入口）。 */
    canDirect: (): boolean => deps.direct !== undefined,
    /**
     * 直接製作能不能按、按了會送出什麼（§2、§4〈送出前〉）：不能按時是原因。組一次提示算字數與費用，不存、不送。
     * 每次表單或教材改了就問一次；沒有直接製作的裝置是 null。
     */
    directPreview(form: CardForm, materials: readonly Material[]): { ok: true; line: string } | { ok: false; reason: string; settings?: boolean } | null {
      const direct = deps.direct;
      if (!direct) return null;
      if (!form.unit.trim()) return { ok: false, reason: '先填單元。' };
      const target = endpoint(direct);
      // 要到設定頁改的（沒選服務、模型或金鑰）標 settings：畫面多一個「打開設定頁」（§2 驗收，L2 第一輪 R10）。
      if ('error' in target) return { ok: false, reason: target.error, settings: true };
      const key = direct.key();
      if (!key.ok) return { ok: false, reason: NO_KEY[key.why], settings: true };
      const problem = materialProblem(materials);
      if (problem) return { ok: false, reason: problem };
      const made = compose(form);
      if ('error' in made) return { ok: false, reason: made.error };
      const chars = made.prompt.text.length;
      const limit = providerProblem(target.provider, target.model, materials, chars);
      if (limit) return { ok: false, reason: limit };
      const request = directRequest({ connection: target.connection, provider: target.provider, apiKey: key.key, prompt: made.prompt.text, materials });
      return { ok: true, line: sendingLine(direct.client, target.provider, request, materials, chars) };
    },
    /**
     * 直接製作（§4 第 1～5 步）：組提示、建一份待貼回的工作（先存再送：送到一半 Obsidian 被關掉，下次打開還找得到），送出、等回覆。
     * 送出前擋下的不建工作；送出之後不論成功與否都留著那一份工作（§6：重送、改用複製貼上或放棄）。一次只送一個（§6 最後一點）。
     */
    async direct(form: CardForm, materials: readonly Material[], onProgress?: (event: ProgressEvent) => void): Promise<DirectOutcome> {
      const direct = deps.direct;
      if (!direct) return { kind: 'blocked', message: '這台裝置不能直接製作，請用複製提示' };
      if (sending) return { kind: 'blocked', message: '另一課正在送出，等它好了再按' };
      const target = endpoint(direct);
      if ('error' in target) return { kind: 'blocked', message: target.error };
      const key = direct.key();
      if (!key.ok) return { kind: 'blocked', message: NO_KEY[key.why] };
      const problem = materialProblem(materials);
      if (problem) return { kind: 'blocked', message: problem };
      const made = compose(form);
      if ('error' in made) return { kind: 'blocked', message: made.error };
      const limit = providerProblem(target.provider, target.model, materials, made.prompt.text.length);
      if (limit) return { kind: 'blocked', message: limit };
      // 先存再送（§4 第 1 步）：送到一半被關掉，重開看得到「上一次沒有收到回覆」（§6）。
      const job: CardJob = { ...made.job, api: { state: 'sending', kind: null, at: made.job.copiedAt, files: sentFiles(materials), received: null } };
      try { put(job); } catch (error) { deps.onError(error); return { kind: 'blocked', message: '存不進這台電腦，這次沒有送出；請再按一次' }; }
      remember(job);
      sentMaterials.set(job.id, [...materials]);
      return send(job, made.prompt.text, materials, target, key.key, onProgress);
    },
    /** 這次開著 Obsidian 的期間記得這一份的教材檔（重送不用重選，§6）。 */
    keeps: (job: CardJob): boolean => sentMaterials.has(job.id),
    /**
     * 重送（§6）：同一份提示，不重組；教材用這次記得的，重開過 Obsidian 的由家長重選後交進來（picked，格式查核 F15）。
     * 工作已經結束、開始存了，或教材不在了是 blocked。
     */
    async resend(job: CardJob, onProgress?: (event: ProgressEvent) => void, picked?: readonly Material[]): Promise<DirectOutcome> {
      const direct = deps.direct;
      if (!direct) return { kind: 'blocked', message: '這台裝置不能直接製作，請用複製提示' };
      if (sending) return { kind: 'blocked', message: '另一課正在送出，等它好了再按' };
      const latest = current(job);
      if (!latest || latest.save) return { kind: 'blocked', message: '這次製卡已經結束或開始存了，不能重送' };
      const materials = picked ? [...picked] : sentMaterials.get(latest.id);
      if (!materials) return { kind: 'blocked', message: '上次選的教材檔已經不在了（重開過 Obsidian），請重新選一次，或改用複製貼上' };
      const problem = materialProblem(materials);
      if (problem) return { kind: 'blocked', message: problem };
      const target = endpoint(direct);
      if ('error' in target) return { kind: 'blocked', message: target.error };
      const key = direct.key();
      if (!key.ok) return { kind: 'blocked', message: NO_KEY[key.why] };
      const limit = providerProblem(target.provider, target.model, materials, latest.parts.reduce((sum, part) => sum + part.text.length, 0));
      if (limit) return { kind: 'blocked', message: limit };
      const sendingNow: CardJob = { ...latest, api: { state: 'sending', kind: null, at: at(), files: sentFiles(materials), received: null } };
      try { put(sendingNow); } catch (error) { deps.onError(error); return { kind: 'blocked', message: '存不進這台電腦，這次沒有送出；請再按一次' }; }
      sentMaterials.set(latest.id, materials);
      return send(sendingNow, latest.parts.map(part => part.text).join('\n\n'), materials, target, key.key, onProgress);
    },
    /** 取消送出中的那一個（§6）：關掉製卡視窗之前問過、停用外掛時。 */
    cancel(): void { sending?.abort(); },
    /** 現在有沒有一個正在送出。 */
    sending: (): boolean => sending !== null,
    /** 再放一次剪貼簿：照存下的每一部分，不重組（§3）。 */
    recopy,
    /**
     * 改用複製貼上（§6）：再放一次同一份提示；放進去了，這一份工作改回一般的待貼回（拿掉 `api`、忘掉記得的教材檔），
     * 重開製卡之後也照複製貼上走，貼回別處的回覆不會配上這一次的證據（PR #83 的 GitHub 審查）。放不進剪貼簿時不改、交回 null。
     */
    async fallback(job: CardJob): Promise<CardJob | null> {
      if (!await recopy(job)) return null;
      const plain: CardJob = { ...current(job) ?? job };
      delete plain.api;
      sentMaterials.delete(plain.id);
      try { put(plain); } catch (error) { deps.onError(error); }
      return plain;
    },
    /** 第三步：檢查（§4），不寫檔。 */
    inspect(job: CardJob, reply: string): Inspection | { error: string } {
      const state = deps.state();
      if (!state) return { error: BLOCKED.loading };
      return inspectReply(reply, job.form, subjectOf(job), job.existing, id => state.aiTarget(id));
    },
    /**
     * 存成草稿（§5 第 1、2 步之後接著做）。同一個工作已經用另一份回覆存過一部分就停下；用同一份就從停下的地方接著做。
     * shown：家長看到的檢查結果（inspectionKey）；還沒開始存、重新檢查的結果和它不同就不存（D-226 第 5 點）。畫面一定給；沒給（測試）時不比。
     * received：框裡的是直接製作收到的（家長可能改過字）；那一次的證據凍結進恢復資料，快照寫 `接法: API`（tasks/ai-direct.md §7，F1）。改用複製貼上的不給。
     */
    save: (job: CardJob, reply: string, service: string | null, shown?: string, received = false): Promise<Outcome> => exclusive(job.id, async () => {
      const latest = current(job);
      if (!latest) return { kind: 'stop', message: '找不到這次複製的提示，可能已經結束了或放太久被清掉了；請重新複製一次' } satisfies Outcome;
      if (latest.save) return latest.save.replySha === sha256Hex(reply) ? run(latest) : { kind: 'stop', message: '這次的提示已經用另一份回覆存過一部分：要繼續上一次的，或放棄它' } satisfies Outcome;
      const state = deps.state();
      if (!state) return { kind: 'stop', message: BLOCKED.loading } satisfies Outcome;
      // 等之前先看門檻（第二輪 R2 修正引入）：還原、備份、手機沒打開時，不等到它們結束才接著存。
      const block = state.writeBlock(true);
      if (block) return { kind: 'stop', message: firstSave(BLOCKED[block]) } satisfies Outcome;
      // 先讀完已知的變動，再照現況重新檢查（L2 R2）：送來通知、還沒讀進索引的卡組也要算進去；讀不完就不存（一直有新的通知是 changing）。
      if (await state.aiWhere([]) === null) return { kind: 'stop', message: firstSave(BLOCKED[state.writeBlock(true) ?? 'changing']) } satisfies Outcome;
      const inspection = inspectReply(reply, latest.form, subjectOf(latest), latest.existing, id => state.aiTarget(id));
      if (inspection.errors.length) return { kind: 'stop', message: '還有擋住的地方，先改好再存' } satisfies Outcome;
      if (shown !== undefined && inspectionKey(inspection) !== shown) return { kind: 'stop', message: '存之前再檢查一次，結果和剛才看到的不同（可能剛同步來新的卡組）；這次沒有存。回上一步再按「檢查」，看過新的結果再存' } satisfies Outcome;
      const count = inspection.pieces.reduce((sum, piece) => sum + piece.names.length, 0);
      // 題目、答案與其他行的區塊 ID 會原樣存進卡組（§4）：配號要避開，新目標的連結才不會指到別行（L2-12）。
      const ids = state.aiIds(count, blockIds(inspection.normalized.lines.join('\n')), true);
      if (typeof ids === 'string') return { kind: 'stop', message: firstSave(BLOCKED[ids]) } satisfies Outcome;
      const at = deps.now(), started = stamp(at.ms, at.offset);
      let n = 0;
      const planned = planDraft(inspection, latest.form, subjectOf(latest), latest.existing, id => state.aiTarget(id), () => ids[n++], deps.names(), started.slice(0, 10), deps.phone === true ? latest.id : null);
      const evidence = received ? directJob(latest)?.received ?? undefined : undefined;
      const saved = beginSave(latest, reply, evidence ? null : service, planned, started, evidence);
      // 第 2 步：恢復資料先存進這台電腦，存不進去就不碰 vault。
      try { put(saved); } catch (error) { deps.onError(error); return { kind: 'stop', message: '存不進這台電腦，這次沒有寫任何檔；請再按一次' } satisfies Outcome; }
      return run(saved);
    }),
    /** 繼續存上一次的結果（§5〈中斷與重試〉）：不用再貼一次。 */
    resume: (job: CardJob): Promise<Outcome> => exclusive(job.id, () => {
      const latest = current(job);
      return latest ? run(latest) : Promise.resolve(GONE);
    }),
    /** 家長選了：跳過這一篇（其他篇照常發布）或重建這一篇（只在 ID 一個都找不到時）。 */
    choose: (job: CardJob, index: number, choice: 'skip' | 'rebuild'): Promise<Outcome> => exclusive(job.id, async () => {
      if (!current(job)) return GONE;
      // 畫面上的提示可能已經過時（R2-7，家長讀提示的時間足夠同步送回來）：先照現況走一次，還是停在同一篇、選擇仍然適用才套用。
      const now = await run(current(job)!);
      if (now.kind !== 'stop' || now.deck?.index !== index || (choice === 'rebuild' && now.deck.situation !== 'missing')) return now;
      const latest = current(job);
      if (!latest) return GONE;
      let next: CardJob;
      if (choice === 'skip') {
        const released = skipDeck(latest, index);
        deps.store.retire(released.retire);
        next = released.job!;
      } else next = rebuildDeck(latest, index);
      try { put(next); } catch (error) { deps.onError(error); return { kind: 'stop', message: '存不進這台電腦；請再按一次' } satisfies Outcome; }
      return run(next);
    }),
    /**
     * 放棄（§5）：只有還沒發布的能放棄。已寫成的卡組照樣是草稿、不刪；開始建了或寫出過的篇，ID 進不再配出的清單。回傳留下的篇。
     * 快照其實已經寫成（清理前中斷）時不放棄，只清理、回報成功，不再走一次發布（R6-3）。
     */
    abandon: (job: CardJob): Promise<{ left: string[] } | Outcome> => exclusive<{ left: string[] } | Outcome>(job.id, async () => {
      const latest = current(job);
      if (!latest) return GONE;
      let found = false;
      if (latest.save?.published) {
        const state = deps.state();
        if (!state) return { kind: 'stop', message: BLOCKED.loading };
        try {
          const text = await state.aiRead(latest.save.snapshotPath);
          if (text === null && state.aiDisplaced(latest.save.snapshotPath)) return { kind: 'stop', message: '外掛用的資料夾不在原位，不知道是不是已經存好了；照提醒把它放回原位，再試一次' };
          found = text !== null && sha256Hex(text) === latest.save.published.sha256;
          if (!found && latest.save.published.attempted) {
            const copy = await publishedElsewhere(latest.save, { read: path => state.aiRead(path), named: deps.named });
            if (typeof copy === 'object') return { kind: 'stop', message: `讀不到 ${copy.path}，不知道是不是已經存好了；等一下再試` };
            found = copy;
          }
        } catch (error) {
          deps.onError(error);
          return { kind: 'stop', message: `讀不到 ${latest.save.snapshotPath}，不知道是不是已經存好了；等一下再試` };
        }
      }
      if (found) {
        try { drop(latest); } catch (error) { deps.onError(error); return { kind: 'stop', message: '存不進這台電腦；請再按一次' }; }
        return finished(latest);
      }
      const { retire, left } = abandonJob(latest);
      deps.store.retire(retire);
      drop(latest);
      return { left };
    }),
  };
}
export type AiCards = ReturnType<typeof createAiCards>;
