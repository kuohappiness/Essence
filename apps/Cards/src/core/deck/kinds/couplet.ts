import type { Couplet, Target } from '../types.ts';
import { endingOf } from './shared.ts';

// ── 接句卡（D-185 第 6～8 點、tasks/couplet-cards.md §1、§2）：翻面卡的一種，用填空寫，從名稱最後的「接句」認。 ──

/** 句尾的標點，後面緊接的右引號、右括號算同一句。 */
const SENTENCE_END = /^[，。；！？：,;!?]+[」』）)】〕》〉"”’]*/;
/** 填空以外的行內 Markdown（粗體、連結、程式碼、公式、HTML、註解、跳脫、字元參照）：切開會把結構拆成兩半（L2 R4）。 */
const INLINE_MARKUP = /[*_~`[\]<>$%\\&^|]/;

/**
 * 題目照句尾標點切成每一句，連同自己的標點；==…== 裡面的標點不切，句子之間的空白拿掉。
 * 有填空以外的行內 Markdown 時不切，整句交給渲染器（照一般的方式換行）。
 */
function coupletLines(text: string): string[] {
  if (INLINE_MARKUP.test(text.replace(/==/g, ''))) return [text.trim()];
  const lines: string[] = [];
  let start = 0, inside = false;
  for (let i = 0; i < text.length; i++) {
    if (text.startsWith('==', i)) { inside = !inside; i++; continue; }
    const end = inside ? null : SENTENCE_END.exec(text.slice(i));
    if (!end) continue;
    lines.push(text.slice(start, i + end[0].length).trim());
    start = i + end[0].length;
    i = start - 1;
  }
  lines.push(text.slice(start).trim());
  return lines.filter(Boolean);
}

/**
 * 這個目標是不是接句卡：名稱最後一段是「接句」（前面要有空白或右括號），只有一題，是剛好一格的填空，沒有方向（比較組、全詩順序卡在認的先後裡排在前面，讀成了就不會走到這裡，question-types.ts）。
 * 詩名是目標所在的小標題；第幾句從「第 N 句 接句」讀。不是時照原題型（填空翻面），不另外提示。
 */
export function readCouplet(target: Target, notes: readonly string[], promptNotes: readonly string[]): Couplet | null {
  const { name, prompts } = target;
  if (target.implicit || target.direction !== null || endingOf(name) !== '接句') return null;
  const prompt = prompts.length === 1 ? prompts[0] : null;
  if (prompt?.kind !== 'cloze' || prompt.blanks.length !== 1) return null;
  const index = /第\s*(\d+)\s*句\s+接句$/.exec(name);
  return { title: target.section, index: index ? Number(index[1]) : null, lines: coupletLines(prompt.text), notes, promptNotes };
}
