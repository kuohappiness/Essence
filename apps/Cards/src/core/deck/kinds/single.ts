import type { ProblemCode, Single, Target } from '../types.ts';
import { countBlanks, foldWidth, pickKey, withoutComments } from './shared.ts';

// ── 單選與配對（D-249、tasks/matching-single-choice.md §2、§3）：目標底下一行 `選項：`，問答題的答案是其中一個。readKind 最後才認。 ──

/**
 * 目標底下、和題目同一層、以全形的 `選項：` 開頭的一項（parse.ts 收）：at 是它在 target.shared 的第幾項，solid 是沒有子項目、也沒有接續行。
 */
export interface OptionLine { at: number; line: number; text: string; solid: boolean }

export interface SingleReading {
  single: Single | null;
  problems: { line: number; level: 'hint'; code: ProblemCode; message: string }[];
}

const HOW = '選項行寫成「- 選項：北部、東部、西部、南部」，自己一行，寫在學習目標底下、和題目同一層';

/** 選項有問題時的提示（§3〈認不成〉）：照原本的題型出。 */
export const optionsInvalid = (line: number, reason: string): SingleReading['problems'][number] =>
  ({ line, level: 'hint', code: 'options-invalid', message: `${reason}，所以這個目標照原本的題型出。${HOW}` });

/** 行尾的區塊 ID（`^abc234`），和目標 ID 同一種寫法。 */
const BLOCK_ID = /[ \t]+\^[A-Za-z0-9-]+[ \t]*$/;
/**
 * 折成半形之後不能有的（§3 第 3 條）：連結、程式碼、公式、HTML（同比較卡），填空與問答的記號，資料欄位的分隔。
 * 比例尺 `1：5000`、時間 `8：00` 的冒號不擋，只擋接著欄位或標籤名稱的冒號（LABEL_START）。
 */
const FORBIDDEN = /[`$[\]<>_|]|==|::/;
/** 選項以欄位或標籤的名稱加冒號開頭：像是接上了別的欄位。六個欄位照 parse.ts 的 fieldStart，加上記憶錨點與選項。 */
const LABEL_START = /^(?:出處|類型|重要性|狀態|備註|錯題補強|記憶錨點|選項)\s*:/;

/** 切選項（§2〈切法與比對〉）：有頓號只照頓號切，沒有才照逗號（全半形）；只用空白隔開的切不開。空的丟掉，比對鍵重複的只留第一個。 */
function splitOptions(body: string): string[] | null {
  const separator = body.includes('、') ? /、/ : /[,，]/.test(body) ? /[,，]/ : null;
  if (!separator) return null;
  const first = new Map<string, string>();
  for (const item of body.split(separator).map(each => each.trim())) {
    const key = pickKey(item);
    if (key && !first.has(key)) first.set(key, item);
  }
  return [...first.values()];
}

/** 選項行讀成選項（§2、§3 第 3 條）；讀不成時回傳原因。 */
function readOptions(text: string): string[] | string {
  const body = withoutComments(text.slice('選項：'.length)).replace(BLOCK_ID, '');
  if (body.includes('%%')) return '選項行裡的 %% 註解沒有結尾';
  const options = splitOptions(body);
  if (!options) return '選項要用頓號隔開';
  if (options.some(option => FORBIDDEN.test(foldWidth(option)))) return '選項裡不能有連結、程式碼、公式、HTML、==、::、底線或｜';
  if (options.some(option => LABEL_START.test(foldWidth(option).trim()))) return '選項不能以「出處：」「記憶錨點：」這類名稱加冒號開頭';
  if (options.length < 3) return '選項至少要 3 個';
  return options;
}

/**
 * 這個目標是不是單選（§3〈認成單選的條件〉）：沒有方向、剛好一行選項行、選項讀得出 3 個以上、每一題都是答案在選項裡的問答題。
 * 沒有選項行時不提示；有選項行但讀不成時提示 options-invalid，照原本的題型出。呼叫的一方先認別的卡型，認成或有提示時不來這裡。
 */
export function readSingle(target: Target, lines: readonly OptionLine[]): SingleReading {
  if (!lines.length) return { single: null, problems: [] };
  const fail = (reason: string, line = lines[0].line): SingleReading => ({ single: null, problems: [optionsInvalid(line, reason)] });
  if (target.direction !== null) return fail('有方向的目標（英翻中、中翻英）不認選項行');
  if (lines.length > 1) return fail(`選項行只能有一行，這個目標有 ${lines.length} 行`, lines[1].line);
  const [line] = lines;
  if (!line.solid) return fail('選項行要一行寫完：不寫成子清單、不換行接續');
  const options = readOptions(line.text);
  if (typeof options === 'string') return fail(options);
  const optionKeys = options.map(pickKey);
  const answers: number[] = [];
  for (const prompt of target.prompts) {
    if (prompt.kind !== 'qa' || prompt.answer.includes('\n')) return fail('題目要全部是問答題（::），答案寫在同一行');
    if (countBlanks(prompt.question) > 1) return fail('題目最多一個空格（＿＿）');
    const answer = optionKeys.indexOf(pickKey(prompt.answer));
    if (answer < 0) return fail(`答案「${prompt.answer}」不在選項裡`);
    answers.push(answer);
  }
  return { single: { options, optionKeys, key: JSON.stringify([...optionKeys].sort()), answers, at: line.at }, problems: [] };
}
