// 入口的狀態行（D-217 第 2 點）：`狀態：<狀態值>｜下一步：<一句>｜等誰：<值>`，結束時第二欄寫「完成：」。
// 文件檢查（check-docs.ts）與產生狀態板的工具（roadmap-sync.ts）共用這裡的解析。寫法見 docs/agents/workflow.md〈入口的狀態行〉。

/** 不帶參數的狀態值；另外還有 `已結案 → <D-ID 或連結>` 與 `暫停（<原因>）`。 */
const STATES = ['規劃中', '討論中', '實作中', '待審', '待實機', '等觸發點', '已合併', '已結案'];
const WHO = ['使用者', 'Claude', 'Codex', '實機'];
const NONE = '—';
/** 「已結案 →」後面的下一站：一個以上的 D-ID 或行內連結，用「、」接（L2 R9）。 */
const STATION = String.raw`(?:D-\d+|\[[^\]]+\]\((?:<[^>]+>|[^)\s]+)\))`;
const NEXT = new RegExp(String.raw`^${STATION}(?:\s*、\s*${STATION})*$`);

export interface Status {
  /** 狀態那一欄的原文（例如「已結案 → [D-218](…)」「暫停（等發布）」）。 */
  label: string;
  /** 狀態值本身：STATES 之一或「暫停」。 */
  state: string;
  /** 已合併、已結案：工作結束。 */
  done: boolean;
  /** 第二欄的內容：沒結束是下一步，結束是完成那一句。 */
  text: string;
  /** 等誰；「—」是空陣列。 */
  who: string[];
}

/** 看起來是想寫新格式的狀態行：以「狀態：」開頭，又有「｜下一步：」「｜完成：」「｜等誰：」其中之一。 */
export const looksNew = (line: string) => line.startsWith('狀態：') && /｜\s*(?:下一步|完成|等誰)：/.test(line);

const HINT = '寫法：狀態：<狀態值>｜下一步：<一句>｜等誰：<值>；結束時「狀態：已合併｜完成：<一句>｜等誰：—」';

/** 解析一行狀態行；格式不對時回傳 error（一句話，說哪裡不對、怎麼改）。 */
export function parseStatus(line: string): { status: Status } | { error: string } {
  const text = line.trim();
  if (!text.startsWith('狀態：')) return { error: `要以「狀態：」開頭。${HINT}` };
  const fields = text.split('｜').map(field => field.trim());
  if (fields.length !== 3) return { error: `要剛好三欄、用全形「｜」分，現在是 ${fields.length} 欄（欄裡的「｜」改用「，」）。${HINT}` };
  const [first, second, third] = fields;

  const label = first.slice('狀態：'.length).trim();
  let state: string;
  const paused = /^暫停（(.*)）$/.exec(label);
  const arrow = /^(.*?)\s*→\s*(.*)$/.exec(label);
  if (paused) {
    if (!paused[1].trim()) return { error: '暫停要寫原因：暫停（<原因>）' };
    state = '暫停';
  } else if (arrow) {
    if (arrow[1] !== '已結案') return { error: `箭頭只能接在「已結案」後面，現在是「${arrow[1]}」` };
    if (!NEXT.test(arrow[2])) return { error: '「已結案 →」後面接下一站：D-ID 或連結，好幾站用「、」接，備註寫在「完成：」' };
    state = '已結案';
  } else if (STATES.includes(label)) {
    state = label;
  } else if (label.startsWith('暫停')) {
    return { error: '暫停要寫原因：暫停（<原因>）' };
  } else {
    return { error: `「${label}」不是狀態值；可用：${STATES.join('、')}、已結案 → <下一站>、暫停（<原因>）` };
  }
  const done = state === '已合併' || state === '已結案';

  const key = done ? '完成：' : '下一步：';
  if (!second.startsWith(key)) {
    return { error: done ? `${state}是結束：第二欄寫「完成：<一句>」` : `沒結束的第二欄寫「下一步：<一句>」（結束才寫「完成：」）` };
  }
  const content = second.slice(key.length).trim();
  if (!content) return { error: `「${key}」後面不能空` };

  if (!third.startsWith('等誰：')) return { error: `第三欄寫「等誰：<值>」。${HINT}` };
  const whoText = third.slice('等誰：'.length).trim();
  const who = whoText.split('、').map(name => name.trim());
  if (whoText === NONE) {
    return { status: { label, state, done, text: content, who: [] } };
  }
  if (done || state === '等觸發點') return { error: `${state}的等誰寫「—」` };
  if (who.includes(NONE)) return { error: '「—」只能單獨用' };
  const unknown = who.filter(name => !WHO.includes(name));
  if (unknown.length) return { error: `等誰只收${WHO.join('、')}、—（好幾個用「、」接）；「${unknown.join('、')}」不是` };
  if (new Set(who).size !== who.length) return { error: '等誰重複了' };
  return { status: { label, state, done, text: content, who } };
}
