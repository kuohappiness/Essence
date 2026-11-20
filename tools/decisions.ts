// 決策紀錄（docs/decisions.md）的解析、索引、查詢與「現行寫在哪」（D-141、D-214 第 5、8、9、10 點）。命令列在 decisions-index.ts。
// 不用 npm 套件：experiments/tools/decisions-index.mjs 轉呼叫這裡，沒在 tools/ 裝過相依也查得了。
//
// 新舊寫法用編號劃界（D-214 第 10 點）：
// - 舊的（編號小於 BOUNDARY）：主題在凍結的 LEGACY_TOPICS，一句話保留在現有索引；後續見從自己的狀態行往後找（狀態行提到、編號比自己大的）。
// - 新的：條目裡寫一行「主題：…｜一句話：…」；狀態行用「｜」分段，「來自」「修改」「補充」「取代」開頭的段裡的 D-ID 是它的上游。
//   舊決定的狀態行不再手改：工具從新決定反推它的後續見與已取代。

/** 新寫法的第一條決定。合併工作流程上線的 PR 前，改成 origin/main 當時的最大號加一。 */
const BOUNDARY = 218;

/** 舊決定的主題（凍結，不再新增；新決定的主題寫在條目裡）。分不出來時，看這條決定主要改的是哪一份現行規範。 */
const LEGACY_TOPICS: Record<string, string[]> = {
  '產品與範圍': [
    'D-001', 'D-002', 'D-003', 'D-004', 'D-005', 'D-006', 'D-007', 'D-009', 'D-013', 'D-017', 'D-018', 'D-019',
    'D-023', 'D-029', 'D-031', 'D-032', 'D-037', 'D-038', 'D-039', 'D-048', 'D-054', 'D-056', 'D-075', 'D-076',
    'D-090', 'D-114', 'D-124', 'D-128', 'D-129', 'D-137', 'D-172', 'D-177', 'D-196', 'D-198', 'D-206',
  ],
  '學習目標與製卡規則': [
    'D-010', 'D-020', 'D-021', 'D-022', 'D-027', 'D-028', 'D-061', 'D-067', 'D-077', 'D-083', 'D-086', 'D-087',
    'D-091', 'D-094', 'D-100', 'D-101', 'D-113', 'D-118', 'D-122', 'D-123', 'D-125', 'D-127', 'D-132', 'D-136',
    'D-139', 'D-151', 'D-152', 'D-165', 'D-166', 'D-167', 'D-175', 'D-183', 'D-185', 'D-187', 'D-190', 'D-193', 'D-194', 'D-204', 'D-205', 'D-209', 'D-210',
  ],
  '資料格式與語法': [
    'D-008', 'D-025', 'D-026', 'D-030', 'D-033', 'D-034', 'D-035', 'D-036', 'D-040', 'D-041', 'D-042', 'D-045',
    'D-046', 'D-049', 'D-050', 'D-063', 'D-064', 'D-079', 'D-080', 'D-164', 'D-169', 'D-170', 'D-081', 'D-082', 'D-088', 'D-089', 'D-092',
    'D-093', 'D-098', 'D-105', 'D-108', 'D-115', 'D-134', 'D-135', 'D-142', 'D-157',
  ],
  '複習與排程': [
    'D-011', 'D-012', 'D-043', 'D-062', 'D-066', 'D-068', 'D-069', 'D-071', 'D-074', 'D-078', 'D-102', 'D-107',
    'D-112', 'D-116', 'D-120', 'D-121', 'D-158', 'D-159', 'D-178', 'D-181', 'D-182', 'D-189', 'D-191', 'D-192',
  ],
  '畫面': [
    'D-024', 'D-044', 'D-047', 'D-057', 'D-058', 'D-060', 'D-070', 'D-073', 'D-084', 'D-095', 'D-096', 'D-097',
    'D-103', 'D-104', 'D-109', 'D-133', 'D-145', 'D-146', 'D-156', 'D-160', 'D-161', 'D-163', 'D-174', 'D-176', 'D-179', 'D-180', 'D-184', 'D-186', 'D-188', 'D-203',
  ],
  'AI 接法與模型': ['D-055', 'D-059', 'D-072', 'D-085', 'D-126'],
  '程式結構與品質': ['D-015', 'D-051', 'D-052', 'D-053', 'D-110', 'D-111', 'D-208', 'D-211', 'D-213', 'D-117', 'D-119', 'D-138', 'D-148', 'D-149', 'D-199', 'D-201', 'D-150', 'D-154', 'D-155', 'D-173', 'D-162'],
  '協作與文件': ['D-014', 'D-016', 'D-065', 'D-099', 'D-106', 'D-130', 'D-131', 'D-140', 'D-141', 'D-143', 'D-144', 'D-147', 'D-153', 'D-168', 'D-171', 'D-195', 'D-197', 'D-200', 'D-202', 'D-207', 'D-214', 'D-215', 'D-216', 'D-217', 'D-212'],
};

/** 索引的主題，照這個順序分組；新決定的「主題：」只能是其中之一。 */
const TOPICS = Object.keys(LEGACY_TOPICS);

export class DecisionsError extends Error {}

interface Decision {
  id: string;
  num: number;
  name: string;
  anchor: string;
  /** 從標題到下一條的標題之前的原文。 */
  body: string;
  /** 標題下第一個非空行。 */
  metadata: string;
  date?: string;
  symbol?: string;
  legacy: boolean;
  /** 新寫法：條目裡的主題與一句話。 */
  topic?: string;
  summary?: string;
  /** 新寫法：「來自」「修改」「補充」段裡比自己小的 D-ID。 */
  upstream: string[];
  /** 新寫法：「取代」段裡比自己小的 D-ID。 */
  replaces: string[];
  /** 新寫法：「來自」段裡不是 D-ID 錨點的連結目標（相對 docs/decisions.md）。 */
  sources: string[];
}

export interface Parsed {
  source: string;
  decisions: Decision[];
  byId: Map<string, Decision>;
  /** 第一條決定之前的部分（說明、索引、分隔線）。 */
  preface: string;
  /** 新寫法的第一條（測試可以換）。 */
  boundary: number;
}

const num = (id: string) => Number(id.slice(2));
const pad = (n: number | string) => `D-${String(n).padStart(3, '0')}`;

/** 和 Markdown 標題的錨點一致：保留中英文與數字，去標點、轉小寫、空格改連字號。 */
const anchorOf = (id: string, name: string) => `${id} ${name}`.toLowerCase()
  .replace(/[^\p{L}\p{M}\p{N}_\s-]/gu, '').replace(/\s/g, '-');

/** 程式碼區塊的內容換成空白，位置不變（區塊裡的「## D-」不算標題）。 */
const mask = (text: string) => text.replace(/^(`{3,}|~{3,})[^\n]*\n[\s\S]*?^\1[^\n]*$/gm, block => block.replace(/[^\r\n]/g, ' '));

const DATE = /\b\d{4}-\d{2}-\d{2}(?:～(?:\d{4}-\d{2}-\d{2}|\d{2}-\d{2}|\d{2}))?(?=｜|\s|$)/;
const LINK = /\[[^\]]*\]\((<[^>]*>|[^)\s]*)(?:\s+"[^"]*")?\)/g;
const TOPIC_LINE = /^主題：(.+?)｜一句話：(.+)$/m;

/** 狀態行的一段裡出現的 D-ID（文字或連結文字），補成三位數。 */
const idsIn = (text: string) => [...text.matchAll(/D-(\d+)/g)].map(m => pad(m[1]));

export function parseDecisions(source: string, boundary = BOUNDARY): Parsed {
  const headings = [...mask(source).matchAll(/^## (D-\d+) (.+?)\r?$/gm)];
  if (!headings.length) throw new DecisionsError('找不到決策標題，未修改檔案。');
  const ids = new Set<string>();
  for (const [, id] of headings) {
    if (ids.has(id)) throw new DecisionsError(`D-ID 重複：${id}，未修改檔案。`);
    ids.add(id);
  }
  const decisions = headings.map((heading, index): Decision => {
    const [, id, name] = heading;
    const body = source.slice(heading.index, headings[index + 1]?.index);
    // 標題與狀態行之間可以有空行；只讀第一個非空行，不往正文找。
    const metadata = body.slice(heading[0].length).split(/\r?\n/).find(line => line.trim())?.trim() ?? '';
    const legacy = num(id) < boundary;
    const decision: Decision = {
      id, num: num(id), name, anchor: anchorOf(id, name), body, metadata, legacy,
      date: DATE.exec(metadata)?.[0], symbol: /^(✅|🔁|💬|💡)(?:\s|$)/u.exec(metadata)?.[1],
      upstream: [], replaces: [], sources: [],
    };
    if (legacy) return decision;
    const topic = TOPIC_LINE.exec(mask(body).replace(/\r/g, ''));
    if (topic) {
      decision.topic = topic[1].trim();
      decision.summary = topic[2].trim();
    }
    for (const segment of metadata.split('｜').map(s => s.trim())) {
      const kind = /^(來自|修改|補充|取代)/.exec(segment)?.[1];
      if (!kind) continue;
      const older = idsIn(segment);
      const wrong = older.filter(other => !ids.has(other) || num(other) >= decision.num);
      if (wrong.length) {
        throw new DecisionsError(`${id} 的狀態行「${kind}」那一段提到 ${wrong.join('、')}：要是存在、而且編號比 ${id} 小的決定，未修改檔案。`);
      }
      if (kind === '取代') decision.replaces.push(...older);
      else decision.upstream.push(...older);
      if (kind === '來自') {
        for (const [, raw] of segment.matchAll(LINK)) {
          const href = raw.replace(/^<|>$/g, '');
          if (!href.startsWith('#') && !/^[a-z][a-z0-9+.-]*:/i.test(href)) decision.sources.push(href);
        }
      }
    }
    decision.upstream = [...new Set(decision.upstream)];
    decision.replaces = [...new Set(decision.replaces)];
    return decision;
  });
  return { source, decisions, byId: new Map(decisions.map(d => [d.id, d])), preface: source.slice(0, headings[0].index), boundary };
}

export interface Links { next: string[]; supersededBy?: string }

/** 每條決定的後續（後來修改、補充、取代它的）與取代它的那一條。 */
export function linksOf(parsed: Parsed): Map<string, Links> {
  const { decisions, byId } = parsed;
  const links = new Map<string, Links>(decisions.map(d => [d.id, { next: [] }]));
  const add = (from: string, to: string) => links.get(from)!.next.push(to);
  for (const d of decisions) {
    if (!d.legacy) continue;
    if (d.metadata.startsWith('已取代')) {
      const to = /D-\d+/.exec(d.metadata)?.[0];
      if (to && byId.has(to)) {
        links.get(d.id)!.supersededBy = to;
        add(d.id, to);
      }
      continue;
    }
    // 舊寫法：狀態行裡提到、編號比自己大的決定，就是後來修改或補充它的決定。
    for (const other of idsIn(d.metadata)) if (num(other) > d.num && byId.has(other)) add(d.id, other);
  }
  // 新寫法：從新決定的「來自／修改／補充／取代」反推。
  for (const d of decisions) {
    for (const up of [...d.upstream, ...d.replaces]) add(up, d.id);
    for (const old of d.replaces) {
      const entry = links.get(old)!;
      if (!entry.supersededBy) entry.supersededBy = d.id;
    }
  }
  for (const entry of links.values()) entry.next = [...new Set(entry.next)].sort((a, b) => num(a) - num(b));
  return links;
}

const splitRow = (row: string) => row.split(/(?<!\\)\|/).map(cell => cell.trim());
const cell = (value: string) => value.replace(/(?<!\\)\|/g, '\\|');

/** 現有索引裡舊決定的一句話（索引底下可能有好幾張表，只讀第一欄有 D-ID 的列）。 */
function existingSummaries(parsed: Parsed): Map<string, string> {
  const { preface } = parsed;
  const start = preface.search(/^## 索引\r?$/m);
  const divider = preface.search(/^---\r?$/m);
  const summaries = new Map<string, string>();
  if (start < 0) return summaries;
  const rows = preface.slice(start, divider > start ? divider : undefined).split(/\r?\n/).filter(line => line.startsWith('|'));
  const header = rows.find(row => splitRow(row).includes('一句話'));
  const column = header ? splitRow(header).indexOf('一句話') : -1;
  for (const row of column >= 0 ? rows : []) {
    const cells = splitRow(row);
    const id = /^\[(D-\d+) /.exec(cells[1] ?? '')?.[1];
    if (!id) continue;
    if (summaries.has(id)) throw new DecisionsError(`索引裡 ${id} 出現不只一次，未修改檔案。`);
    if (cells[column]) summaries.set(id, cells[column]);
  }
  return summaries;
}

/** 每條決定的一句話：新的讀條目，舊的讀現有索引。 */
function summariesOf(parsed: Parsed): Map<string, string> {
  const existing = existingSummaries(parsed);
  return new Map(parsed.decisions.flatMap(d => {
    const summary = d.legacy ? existing.get(d.id) : d.summary;
    return summary ? [[d.id, summary] as const] : [];
  }));
}

const indexIntro = (boundary: number) => '依主題分組，組內照編號排；正文照寫入的順序。「後續見」是後來修改或補充這一條的決定，要一起看。'
  + '這張表由工具產生，不手改：已知 D-ID 用 `node tools/decisions-index.ts D-xxx` 查（預設只印一層，`--deep` 全印）；'
  + `寫了新決定後執行 \`node tools/decisions-index.ts\` 重產。D-${boundary} 起的決定在條目裡寫「主題：…｜一句話：…」，`
  + '狀態行寫「來自」「修改 D-xxx」，不改舊決定的狀態行（寫法見 [工作流程規範](agents/workflow.md#決定)）。';

/** 重產開頭的索引，回傳新的全文與還沒寫一句話的舊決定。格式擷取不到或主題有問題時丟 DecisionsError，不寫檔。 */
export function buildIndex(parsed: Parsed, legacyTopics: Record<string, string[]> = LEGACY_TOPICS): { updated: string; empty: string[] } {
  const { source, decisions, byId, preface, boundary } = parsed;
  const newline = source.includes('\r\n') ? '\r\n' : '\n';
  const links = linksOf(parsed);
  const link = (id: string) => `[${id}](#${byId.get(id)!.anchor})`;
  const statusOf = (d: Decision) => {
    const { next, supersededBy } = links.get(d.id)!;
    if (supersededBy) return `已取代 → ${link(supersededBy)}`;
    if (!d.symbol) return undefined;
    return next.length ? `${d.symbol} 後續見 ${next.map(link).join('、')}` : d.symbol;
  };
  const missed = decisions.filter(d => !d.date || !statusOf(d)).map(d => `${d.id}：${d.metadata || '（空白）'}`);
  if (missed.length) throw new DecisionsError(`標題下第一行格式無法擷取，未修改檔案：\n${missed.join('\n')}`);

  const topicOf = new Map<string, string>();
  const problems: string[] = [];
  for (const [topic, ids] of Object.entries(legacyTopics)) {
    for (const id of ids) {
      if (topicOf.has(id)) problems.push(`${id} 重複：${topicOf.get(id)}、${topic}`);
      else topicOf.set(id, topic);
      if (!byId.has(id)) problems.push(`${id} 不存在（在「${topic}」）`);
      else if (!byId.get(id)!.legacy) problems.push(`${id} 是 D-${boundary} 起的決定，主題寫在條目裡，不放凍結的對照表（在「${topic}」）`);
    }
  }
  for (const d of decisions) {
    if (d.legacy) {
      if (!topicOf.has(d.id)) problems.push(`${d.id} 沒有分到主題（D-${boundary} 之前的決定，主題在凍結的對照表）`);
    } else if (!d.topic || !d.summary) {
      problems.push(`${d.id} 少了「主題：…｜一句話：…」一行（D-${boundary} 起寫在條目裡，狀態行下面）`);
    } else if (!TOPICS.includes(d.topic)) {
      problems.push(`${d.id} 的主題「${d.topic}」不是索引的主題之一：${TOPICS.join('、')}`);
    } else topicOf.set(d.id, d.topic);
  }
  if (problems.length) throw new DecisionsError(`主題有問題，未修改檔案：\n${problems.join('\n')}`);

  const summaries = summariesOf(parsed);
  const index = [
    '## 索引',
    '',
    indexIntro(boundary),
    '',
    ...TOPICS.flatMap(topic => [
      `### ${topic}`,
      '',
      '| 決定 | 一句話 | 日期 | 狀態 |',
      '|---|---|---|---|',
      ...decisions.filter(d => topicOf.get(d.id) === topic).sort((a, b) => a.num - b.num)
        .map(d => `| [${d.id} ${cell(d.name)}](#${d.anchor}) | ${cell(summaries.get(d.id) ?? '')} | ${d.date} | ${statusOf(d)} |`),
      '',
    ]),
    '',
  ].join(newline);
  // 只新增或替換開頭的索引，保留原說明、分隔線與所有決策正文。
  const existingIndex = preface.search(/^## 索引\r?$/m);
  const divider = preface.search(/^---\r?$/m);
  const start = existingIndex >= 0 ? existingIndex : divider >= 0 ? divider : preface.length;
  const end = existingIndex >= 0 ? (divider > start ? divider : preface.length) : start;
  const updated = source.slice(0, start) + index + source.slice(end);
  return { updated, empty: decisions.filter(d => d.legacy && !summaries.get(d.id)).map(d => d.id) };
}

/** 〈決定〉那一段：從「**決定**」那一行到下一個行首的粗體小標（理由、曾考慮的做法……）之前；沒有就是 undefined。 */
export function decisionPart(body: string): string | undefined {
  const lines = body.replace(/\r\n/g, '\n').split('\n');
  const start = lines.findIndex(line => /^\*\*決定\*\*/.test(line));
  if (start < 0) return undefined;
  const end = lines.findIndex((line, i) => i > start && /^\*\*[^*]+\*\*/.test(line));
  return lines.slice(start, end < 0 ? undefined : end).join('\n').trim();
}

/** 規範文件：「現行寫在哪」從這些檔反推（D-214 第 9 點）。路徑是 repo 根目錄算的。 */
export function isNormative(path: string): boolean {
  if (path === 'AGENTS.md' || /^plugins\/[^/]+\/AGENTS\.md$/.test(path)) return true;
  if (/^(?:plugins\/[^/]+\/)?docs\/(?:product|architecture)\.md$/.test(path)) return true;
  if (path === 'docs/transcript.md' || path === 'docs/ai-models.md') return true;
  if (/^plugins\/[^/]+\/docs\/(?:syntax|question-types)\.md$/.test(path)) return true;
  if (/^plugins\/[^/]+\/docs\/card-rules\/[^/]+\.md$/.test(path)) return !path.endsWith('/trials.md');
  if (/^docs\/agents\/[^/]+\.md$/.test(path)) return path !== 'docs/agents/token-usage.md';
  return /^\.claude\/skills\/.+\.md$/.test(path);
}

/** 標題的純文字（和 section.ts 相同的取法，這裡不 import，保持沒有相依的轉呼叫也能跑）。 */
const titleOf = (raw: string) => raw.replace(/\s+#+\s*$/, '').replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/[`*_]/g, '').trim();

/** 每條 D-ID 在規範文件裡被提到的地方：「檔案〈最近的標題〉〈…〉」，同一份檔的標題接在一起，照檔名排。 */
export function currentRefs(files: readonly { path: string; text: string }[]): Map<string, string[]> {
  const found = new Map<string, Map<string, string[]>>();
  for (const { path, text } of [...files].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))) {
    let heading = '';
    let fence: string | null = null;
    for (const line of text.split(/\r?\n/)) {
      const open = /^ {0,3}(`{3,}|~{3,})/.exec(line);
      if (fence) {
        if (open && open[1][0] === fence[0] && open[1].length >= fence.length) fence = null;
        continue;
      }
      if (open) {
        fence = open[1];
        continue;
      }
      const match = /^ {0,3}#{1,6}(?:[ \t]+(.*))?$/.exec(line);
      if (match) heading = titleOf(match[1] ?? '');
      // 程式碼區塊裡的 D-ID 是範例，不算引用。
      for (const id of new Set(idsIn(line))) {
        const perFile = found.get(id) ?? new Map<string, string[]>();
        found.set(id, perFile);
        const headingsHere = perFile.get(path) ?? [];
        perFile.set(path, headingsHere);
        if (heading && !headingsHere.includes(heading)) headingsHere.push(heading);
      }
    }
  }
  return new Map([...found].map(([id, perFile]) => [id, [...perFile].map(([path, titles]) => path + titles.map(t => `〈${t}〉`).join(''))]));
}

const clean = (text: string) => text.replace(/\r\n/g, '\n').trim();

/**
 * 查詢：預設只印一層（D-214 第 8 點）：查的那幾條全文與「現行寫在」；直接修改或取代它們的只印標題與〈決定〉；
 * 更深的一行「D-xxx 名稱：一句話」。deep 是改之前的行為：查的與所有後續條目全文。ids 要先確認都存在。
 */
export function query(parsed: Parsed, ids: readonly string[], { deep = false, refs }: { deep?: boolean; refs?: Map<string, string[]> } = {}): string {
  const { byId } = parsed;
  const links = linksOf(parsed);
  const asked = [...new Set(ids)];
  if (deep) {
    const order = [...asked];
    for (let i = 0; i < order.length; i++) for (const id of links.get(order[i])!.next) if (!order.includes(id)) order.push(id);
    return ['以下是原文與明示的後續條目（--deep），不等於完整的現行規則；實作以 product、architecture、syntax 與任務說明為準。', '',
      order.map(id => clean(byId.get(id)!.body)).join('\n\n')].join('\n');
  }
  const seen = new Set(asked);
  const direct = [...new Set(asked.flatMap(id => links.get(id)!.next))].filter(id => !seen.has(id)).sort((a, b) => num(a) - num(b));
  direct.forEach(id => seen.add(id));
  const deeper: string[] = [];
  for (let frontier = direct; frontier.length;) {
    const next = [...new Set(frontier.flatMap(id => links.get(id)!.next))].filter(id => !seen.has(id));
    next.forEach(id => seen.add(id));
    deeper.push(...next);
    frontier = next;
  }
  deeper.sort((a, b) => num(a) - num(b));
  const summaries = summariesOf(parsed);
  const out = ['以下是查的決定全文、直接修改它的決定的〈決定〉、更深的後續一句話（全文用 --deep）。現行規則以「現行寫在」列的規範文件為準。', ''];
  for (const id of asked) {
    out.push(clean(byId.get(id)!.body), '');
    if (refs) {
      const where = refs.get(id);
      out.push(`現行寫在：${where?.length ? where.join('、') : '沒有規範文件引用'}`, '');
    }
  }
  if (direct.length) {
    out.push('---', '', '直接修改或取代它的決定（只印〈決定〉；要全文就查那一條）：', '');
    for (const id of direct) {
      const d = byId.get(id)!;
      const part = decisionPart(d.body);
      // 沒有〈決定〉小標的舊條目印標題以下的全文（含狀態行）。
      out.push(`## ${d.id} ${d.name}`, '', part ?? `（這條沒有〈決定〉小標，印全文）\n\n${clean(d.body.slice(d.body.indexOf('\n') + 1))}`, '');
    }
  }
  if (deeper.length) {
    out.push('---', '', '更深的後續：', '');
    for (const id of deeper) out.push(`- ${id} ${byId.get(id)!.name}：${summaries.get(id) ?? '（還沒有一句話）'}`);
    out.push('');
  }
  return out.join('\n').trimEnd();
}

/** 查詢用的 D-ID：大小寫與位數都接受（d-4 → D-004）；不像 D-ID 的照原樣回傳，由呼叫的人報錯。 */
export const normalizeId = (arg: string) => /^D-\d+$/i.test(arg) ? pad(arg.slice(2)) : arg;
