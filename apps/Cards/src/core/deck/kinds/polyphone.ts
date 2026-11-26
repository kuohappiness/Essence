import type { Choice, Prompt, Target } from '../types.ts';
import { readPick } from './group.ts';
import type { PickReading } from './group.ts';
import { countBlanks, endingOf, foldWidth, LIST_SHAPE, membersOf, pickKey, splitName, unbold, withoutComments } from './shared.ts';

// ── 多音字（D-230 第 4 點、tasks/polyphone-pick.md §1）：選項是這個目標自己的，寫在名稱最後一個括號，名稱最後是「讀音」。比較卡先認。 ──

/**
 * 多音字句只收純文字（tasks/polyphone-pick.md §1-2，L2 第三輪換的前提）：拿掉 `%%` 註解與成對的粗體、螢光筆之後，
 * 不能有其他 Markdown 或 HTML 的符號（連結、程式碼、公式、HTML 與註解、斜體、刪除線、跳脫、字元參照、沒結束的 `%%`、標籤、區塊 ID）和看不見的格式字元，
 * 也不能分成兩行、用清單或標題的記號開頭。
 * 這樣畫面上的句子就是原文去掉粗體與螢光筆，同一句、空格的位置都直接從原文看，不必猜渲染的結果；全形的符號是一般的字。
 */
const NOT_PLAIN = /[*_`$<>[\]&~\\%#^]|\p{Cf}/u;
/** 開頭是清單的記號（L2 第四輪 2、3）：`1.` 後面空四格以上是程式碼區塊，`-`、`+`、`1.` 起頭是清單，指紋也會把清單記號拿掉（標題的 `#` 由 NOT_PLAIN 擋）。 */
const BLOCK_START = /^(?:[-+]|\d+[.)])(?:\s|$)/;
const plainSentence = (text: string): boolean => !text.includes('\n') && !BLOCK_START.test(text.trim())
  && !NOT_PLAIN.test(text.replace(/\*\*(.+?)\*\*/g, '$1').replace(/==(.+?)==/g, '$1'));

/**
 * 多音字的兩句是不是同一句（§5、L2 R2）：多音字句是純文字，畫面上的句子就是原文；拿掉註解、照 NFKC 把編碼不同但畫面一樣的字併成一個
 * （組合字元、康熙部首，L2 第四輪 1），再照 pickKey（粗體、螢光筆、全半形、大小寫、空白），連續的底線當一個（畫面上空格都一樣長）。
 */
export const choiceStem = (question: string): string => pickKey(withoutComments(question).normalize('NFKC')).replace(/_+/g, '_');

const CHOICE_ENDING = '讀音';
const escapeRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * 多音字句（§1-2）：問答題、答案單行，題幹是純文字（plainSentence）、剛好一個空格，而且是緊接名稱的字（可以有粗體或螢光筆）的 `（＿…）`：
 * 左右括號全半形都算，裡面只有全形底線。註解裡的不算（L2 R3）。
 */
function isChoiceSentence(prompt: Prompt, word: string): boolean {
  if (prompt.kind !== 'qa' || prompt.answer.includes('\n')) return false;
  const text = withoutComments(prompt.question);
  if (!plainSentence(text) || (text.match(/＿+/g)?.length ?? 0) !== 1) return false;
  return new RegExp(escapeRegExp(word) + '(?:\\*\\*|==)?[（(]＿+[）)]').test(text);
}

export interface ChoiceReading {
  choice: Choice | null;
  problems: PickReading['problems'];
}

/**
 * 這個目標是不是多音字的點選填空（§1-2、§1-3）：名稱照 unbold 之後，最後一個括號之後剛好是「讀音」，那個括號是選項。選項讀不出、一題都不是
 * 多音字句、括號裡有讀音沒有句子時提示 pick-not-recognized，有的是有的不是時提示 pick-mixed；名稱沒有括號（現在的讀音卡、沒勾點選填空）或結尾不是單獨的讀音時不提示。
 * notes 是記憶錨點的每一行。呼叫的一方先認比較卡，認不成又沒有提示才來這裡。
 */
export function readChoice(target: Target, notes: readonly string[]): ChoiceReading {
  const none: ChoiceReading = { choice: null, problems: [] };
  if (target.implicit || target.direction !== null || countBlanks(target.name) > 0) return none;
  const name = unbold(target.name).trim();
  if (endingOf(name) !== CHOICE_ENDING || !/[（(]/.test(name)) return none;
  const fail = (lines: readonly number[], code: 'pick-not-recognized' | 'pick-mixed', message: string): ChoiceReading => ({ choice: null, problems: lines.map(line => ({ line, level: 'hint', code, message })) });
  const how = '多音字的名稱寫成「長（ㄓㄤˇ、ㄔㄤˊ） 讀音」，題目寫成「他長（＿＿）得比哥哥高。 :: ㄓㄤˇ」';
  const split = splitName(name);
  if (!split || split.rest !== CHOICE_ENDING) return fail([target.line], 'pick-not-recognized', `括號後面要剛好是「讀音」。${how}`);
  const last = split.brackets[split.brackets.length - 1];
  const options = LIST_SHAPE.test(last) ? membersOf(last).filter(option => pickKey(option) !== '') : [];
  const optionKeys = options.map(pickKey);
  if (options.length < 2 || options.some(option => /[`$[\]<>]/.test(foldWidth(option)))) return fail([target.line], 'pick-not-recognized', `最後一個括號讀不出選項：至少兩個，用頓號隔開，不能有連結、程式碼或公式。${how}`);
  if (optionKeys.includes(pickKey(split.word))) return fail([target.line], 'pick-not-recognized', `名稱的字在括號裡是相似字的寫法，不是多音字。${how}`);
  const valid = (prompt: Prompt): boolean => isChoiceSentence(prompt, split.word) && prompt.kind === 'qa' && optionKeys.includes(pickKey(prompt.answer));
  const good = target.prompts.filter(valid);
  if (!good.length) return fail([target.line], 'pick-not-recognized', `沒有一題是多音字句：字後面緊接（＿＿），答案是括號裡的一個讀音。${how}`);
  const bad = target.prompts.filter(prompt => !valid(prompt));
  if (bad.length) return fail(bad.map(prompt => prompt.line), 'pick-mixed', `這一題不是多音字句（純文字、字後面緊接（＿＿），答案是括號裡的一個讀音），所以這個目標照原題型出`);
  // 畫面上同一句只寫一次（L2 第三輪 2、3）：配了不同讀音的孩子分不出該念哪一個；讀音相同的，出題歷史分在兩個指紋，選句會插隊。
  const stems = target.prompts.map(prompt => prompt.kind === 'qa' ? choiceStem(prompt.question) : '');
  const repeated = target.prompts.filter((_, i) => stems.indexOf(stems[i]) !== stems.lastIndexOf(stems[i]));
  if (repeated.length) return fail(repeated.map(prompt => prompt.line), 'pick-mixed', '這一句和別句在畫面上是同一句（只差粗體、螢光筆、底線數或註解也算）：同一句只寫一次，配了不同讀音的孩子也分不出該念哪一個，所以這個目標照原題型出');
  const answers = target.prompts.map(prompt => prompt.kind === 'qa' ? optionKeys.indexOf(pickKey(prompt.answer)) : -1);
  // 每個讀音至少一句（§3、L2 R4）：不然一張卡的答案都是同一個讀音，一直點同一個鍵就全對。
  const unused = options.filter((_, i) => !answers.includes(i));
  if (unused.length) return fail([target.line], 'pick-not-recognized', `括號裡的「${unused.join('、')}」沒有句子：每個讀音至少要有一句，所以這個目標照原題型出。罕用的讀音不放進括號，括號裡也不放錯的念法`);
  return { choice: { word: split.word, options, optionKeys, title: CHOICE_ENDING, answers, ...anchorsOf(notes, optionKeys) }, problems: [] };
}

/** AI 草稿的檢查用（tasks/polyphone-pick.md §5）：這個目標照多音字讀、讀不成時的診斷；比較卡先讀，讀成或有診斷時是空的。 */
export function choiceProblems(target: Target): ChoiceReading['problems'] {
  const pick = readPick(target);
  return pick.group || pick.problems.length ? [] : readChoice(target, []).problems;
}

/**
 * 記憶錨點對到讀音（§4-2）：每一行照第一個全形冒號切開，前面對到讀音的（同一個讀音只用第一行）是那個讀音的說明與常用詞；
 * 對不到的（同一行的錨點、同一讀音的第二行、未知的讀音、半形冒號）照原本的順序留在 rest，不丟字。
 */
function anchorsOf(notes: readonly string[], optionKeys: readonly string[]): Pick<Choice, 'anchors' | 'rest'> {
  const found = new Map<string, string>();
  const rest: string[] = [];
  for (const note of notes) {
    const at = note.indexOf('：');
    const key = at < 0 ? '' : pickKey(note.slice(0, at));
    if (key && optionKeys.includes(key) && !found.has(key)) found.set(key, note.slice(at + 1).trim());
    else rest.push(note);
  }
  return { anchors: optionKeys.map(key => found.get(key) || null), rest };
}
