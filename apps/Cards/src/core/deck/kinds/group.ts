import type { PickGroup, ProblemCode, Prompt, Target } from '../types.ts';
import { countBlanks, endingOf, foldWidth, LIST_SHAPE, membersOf, pickKey, splitName } from './shared.ts';

// ── 點選填空（D-182、tasks/question-type-seam.md §3）：程式認括號，不認結尾的詞；結尾只決定提示。 ──

/** 最後一個清單形狀、又含括號前面的字或詞的括號（§3〈組怎麼讀〉）；它讀不成有效的組就是沒有組，不再往前找。 */
export function readGroup(name: string): PickGroup | null {
  const split = splitName(name);
  if (!split) return null;
  for (const inner of [...split.brackets].reverse()) {
    if (!LIST_SHAPE.test(inner)) continue;
    const members = membersOf(inner);
    const keys = members.map(pickKey);
    if (!keys.includes(pickKey(split.word))) continue;
    if (members.length < 2 || members.some(member => /[`$[\]<>]/.test(foldWidth(member)))) return null;
    return { word: split.word, members, key: JSON.stringify([...keys].sort()), title: split.rest, wordKey: pickKey(split.word), memberKeys: keys };
  }
  return null;
}

/** 名稱讀得出組時，比較句的答案該寫的字或詞（AI 製卡的錯誤訊息用）；讀不出是 null。 */
export const pickWord = (name: string): string | null => readGroup(name)?.word ?? null;

/** 讀不出組的原因（pick-not-recognized 的文字，check-syntax 也用它）。 */
function groupFailure(name: string): string {
  const how = '比較卡的名稱寫成「寨（寨、塞） 相似字」';
  const split = splitName(name);
  if (!split || !split.brackets.some(inner => LIST_SHAPE.test(inner))) return `括號讀不出組：括號裡要用頓號隔開。${how}`;
  if (!split.brackets.some(inner => membersOf(inner).some(member => pickKey(member) === pickKey(split.word)))) return `名稱的字或詞不在括號裡。${how}`;
  return `括號讀不出組：至少要兩個不同的字或詞，不能有連結、程式碼或公式。${how}`;
}

export interface PickReading {
  group: PickGroup | null;
  problems: { line: number; level: 'error' | 'hint'; code: ProblemCode; message: string }[];
}

const NOT_PICK: PickReading = { group: null, problems: [] };

/** 比較句：問答題，題幹剛好一個空格，答案單行。 */
const isSentence = (prompt: Prompt): boolean => prompt.kind === 'qa' && countBlanks(prompt.question) === 1 && !prompt.answer.includes('\n');
const answerOf = (prompt: Prompt): string => prompt.kind === 'qa' ? pickKey(prompt.answer) : '';

/**
 * 這個目標是不是比較卡（§3〈判斷的順序〉）：先看目標與題目的形狀，再看組，最後才分類錯誤；每個目標只有一種結果，比較卡的診斷最多一種代碼，
 * 那個代碼可以對到好幾行。括號本來就有別的用途（D-125），所以多半的情況是照原題型，不算寫錯。
 */
export function readPick(target: Target): PickReading {
  const { name, prompts } = target;
  if (target.implicit || name.includes('==') || countBlanks(name) > 0 || target.direction !== null) return NOT_PICK;
  const group = readGroup(name);
  // 結尾照名稱最後單獨的一段（前面有空白或右括號）：有組時看組之後的標題的最後一段（L2 R6，`反映（…） 字義 相似詞` 也提示）。
  const ending = group ? endingOf(' ' + group.title) : endingOf(name);
  const hinted = ending === '相似字' || ending === '相似詞' || ending === '比較'; // 相似詞：D-230 第 3 點、tasks/polyphone-pick.md §2
  const notRecognized = (lines: readonly number[], message: string): PickReading => hinted ? { group: null, problems: lines.map(line => ({ line, level: 'hint', code: 'pick-not-recognized', message })) } : NOT_PICK;
  if (prompts.every(prompt => prompt.kind === 'cloze')) return notRecognized([target.line], '填空題不會變成比較卡；比較卡的題目寫成「題幹有一個 ＿＿ :: 答案」');
  if (!group) return notRecognized([target.line], groupFailure(name));
  if (prompts.some(prompt => prompt.kind === 'qa' && (!prompt.question || !prompt.answer.trim()))) return NOT_PICK;
  const word = pickKey(group.word), members = group.members.map(pickKey);
  const other = prompts.filter(prompt => isSentence(prompt) && answerOf(prompt) !== word && members.includes(answerOf(prompt)));
  if (other.length) return { group: null, problems: other.map(prompt => ({ line: prompt.line, level: 'error', code: 'pick-answer-invalid', message: `答案是組裡別的字或詞；一格只對一個目標，這一句要放到「${prompt.kind === 'qa' ? prompt.answer : ''}」那個目標底下` })) };
  const matches = (prompt: Prompt): boolean => isSentence(prompt) && answerOf(prompt) === word;
  if (prompts.every(matches)) return { group, problems: [] };
  if (prompts.some(matches)) {
    return { group: null, problems: prompts.filter(prompt => !matches(prompt)).map(prompt => ({ line: prompt.line, level: 'hint', code: 'pick-mixed', message: `這一題不是比較句（題幹一個 ＿＿，答案是「${group.word}」），所以這個目標照原題型出；不同能力請拆成不同目標` })) };
  }
  const outside = prompts.filter(prompt => isSentence(prompt) && !members.includes(answerOf(prompt)));
  if (outside.length) return notRecognized(outside.map(prompt => prompt.line), '答案不在組裡，所以這個目標不是比較卡');
  return notRecognized([target.line], '題目沒有剛好一個空格（＿＿），所以這個目標不是比較卡');
}
