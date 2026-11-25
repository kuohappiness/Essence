import { maskInline } from './markdown.ts';
import type { Choice, Couplet, PickGroup, PoemOrder, ProblemCode, Prompt, SentenceCells, SentenceOrder, Target, Typing } from './types.ts';

// 題型接點的第一個（D-181）：一種題型的名稱與題目怎麼認、哪些算寫錯。其他三個在 core/study/compose.ts、review/flow.ts、ui/screens.tsx。

interface TypedAnswer {
  /** 比對用的答案；不能當打字答案、不拆開時是 null。 */
  typed: readonly string[] | null;
  problem: { code: ProblemCode; message: string; level?: 'error' } | null;
}

/**
 * 中翻英的答案格（打字）：好幾個正確答案用 | 分開（D-122），每一段各自去掉格式與前後空白；`a|b` 也認得。指紋仍用整個答案格。
 * 先看整格（W6 §0-1、syntax.md §2-3）：換行、跳脫的管線、行內程式碼、公式；ASCII 的 [ ] < >（Obsidian 與 Markdown
 * 的連結或嵌入、角括號與參照式連結，字面的括號也一起不收）；任何位置不分大小寫的 http(s)://；全形的｜。
 * 都不能當打字答案，不拆開、typed 是 null（換行要在 trim 之前看；Codex 格式查核 F1、F2，L2 的 S1 與它的格式查核）。
 */
export function typedAnswer(answer: string, label = '中翻英'): TypedAnswer {
  const invalid = { code: 'typed-answer-invalid', message: label + '的答案只能是單行英文單字或片語，好幾個答案用 | 分開；不能有換行、連結、程式碼或公式', level: 'error' } as const;
  if (/[\r\n`$[\]<>｜]|\\\||https?:\/\//i.test(answer)) return { typed: null, problem: invalid };
  const typed = answer.split('|').map(part => part.replace(/\*\*|\*|_|==/g, '').trim());
  if (typed.some(part => !part || /\p{Script=Han}/u.test(part))) return { typed, problem: invalid };
  if (new Set(typed.map(part => part.split(/\s+/).length)).size > 1) return { typed, problem: { code: 'typed-answer-words', message: '好幾個答案的字數不一樣，畫線照第一個' } };
  return { typed, problem: null };
}

// ── 點選填空（D-182、tasks/question-type-seam.md §3）：程式認括號，不認結尾的詞；結尾只決定提示。 ──

/** 只折全半形（U+FF01～FF5E），不做整串 NFKC：`①` 和 `1` 不同。 */
const foldWidth = (text: string): string => text.replace(/[！-～]/g, char => String.fromCharCode(char.charCodeAt(0) - 0xFEE0));

/** 比對答案、組員與組的身分用的寫法：去掉成對的 `**`、`==` 與前後空白，連續空白（含全形）當一個，英文不分大小寫。字鍵照括號裡寫的顯示。 */
export function pickKey(text: string): string {
  const bare = text.replace(/\*\*(.+?)\*\*/g, '$1').replace(/==(.+?)==/g, '$1');
  return foldWidth(bare).replace(/\s+/g, ' ').trim().toLowerCase();
}

/**
 * 多音字的兩句是不是同一句（tasks/polyphone-pick.md §5、L2 R2、第二輪 2）：看畫面上的字（visibleOf，`%%` 註解、標籤不算），
 * 再照 pickKey，連續的底線當一個（畫面上空格都一樣長）。
 */
export const choiceStem = (question: string): string => pickKey(visibleOf(question).replaceAll('\0', '')).replace(/_+/g, '_');

/**
 * 畫面上看得到的文字（§3〈空格怎麼數〉）：不看行內程式碼、公式、整個圖片與嵌入、連結目的地、HTML 標籤與 `%%` 註解；連結文字算。
 * 隔開的內容換成 \0，渲染後它們也是不同的文字節點；註解渲染後不見了，直接拿掉。字元參照照原樣（數空格時才當成 `＿`）。
 */
function visibleOf(text: string): string {
  return maskInline(text)
    .replace(/%%[^]*?%%/g, '')
    .replace(/!\[\[[^\]\n]*\]\]/g, '\0')
    .replace(/!\[[^\]\n]*\]\([^)\n]*\)/g, '\0')
    .replace(/\[\[[^\]\n|]*\|([^\]\n]*)\]\]/g, '\0$1\0')
    .replace(/\[([^\]\n]*)\]\([^)\n]*\)/g, '\0$1\0')
    .replace(/<\/?[a-zA-Z][^<>\n]*>/g, '\0');
}

/** 一段文字有幾個空格：畫面上連續的 `＿` 算一格，半形 `__` 不算；字元參照當一個 `＿`（渲染後就是）。 */
function countBlanks(text: string): number {
  return visibleOf(text).replace(/&#(?:65343|[xX]0*[fF][fF]3[fF]);/g, '＿').match(/＿+/g)?.length ?? 0;
}

/** 名稱拆成字或詞、連續的括號與其後的文字；這一段有不成對、巢狀的括號，或沒有括號就是 null。 */
function splitName(name: string): { word: string; brackets: string[]; rest: string } | null {
  const head = /^[^（(）)]+/.exec(name);
  if (!head) return null;
  const word = head[0].trim().replace(/^\*\*(.+)\*\*$/, '$1').trim();
  let rest = name.slice(head[0].length);
  const brackets: string[] = [];
  for (let match = /^\s*[（(]([^（）()]*)[）)]/.exec(rest); match; match = /^\s*[（(]([^（）()]*)[）)]/.exec(rest)) {
    brackets.push(match[1]);
    rest = rest.slice(match[0].length);
  }
  if (/^\s*[（(）)]/.test(rest) || !word || !brackets.length) return null;
  return { word, brackets, rest: rest.trim() };
}

/** 切項目：有頓號或逗號時只照它們切，空白留在項目裡；完全沒有時空白都切。空的項目丟掉，重複的只留第一個。 */
function membersOf(inner: string): string[] {
  const items = (/[、,，]/.test(inner) ? inner.split(/[、,，]/) : inner.split(/\s+/)).map(item => item.trim()).filter(Boolean);
  const first = new Map<string, string>();
  for (const item of items) if (!first.has(pickKey(item))) first.set(pickKey(item), item);
  return [...first.values()];
}

const LIST_SHAPE = /[、,，\s]/;

/** 最後一個清單形狀、又含括號前面的字或詞的括號（§3〈組怎麼讀〉）；它讀不成有效的組就是沒有組，不再往前找。 */
function readGroup(name: string): PickGroup | null {
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

/** 沒有組時的結尾：名稱最後一段，前面要有空白或右括號。 */
const endingOf = (name: string): string | null => /[\s）)]([^\s）)]+)$/.exec(name)?.[1] ?? null;

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

// ── 多音字（D-230 第 4 點、tasks/polyphone-pick.md §1）：選項是這個目標自己的，寫在名稱最後一個括號，名稱最後是「讀音」。比較卡先認。 ──

const CHOICE_ENDING = '讀音';
const escapeRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * 多音字句（§1-2）：問答題、答案單行，題幹剛好一個空格，而且是緊接名稱的字（可以有粗體或螢光筆）的 `（＿…）`：左右括號全半形都算，
 * 裡面只有全形底線。數空格和找位置都看畫面上的文字（visibleOf），註解、HTML 標籤裡的不算（L2 R3）。
 */
function isChoiceSentence(prompt: Prompt, word: string): boolean {
  if (prompt.kind !== 'qa' || prompt.answer.includes('\n') || countBlanks(prompt.question) !== 1) return false;
  return new RegExp(escapeRegExp(word) + '(?:\\*\\*|==)?[（(]＿+[）)]').test(visibleOf(prompt.question));
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
  if (bad.length) return fail(bad.map(prompt => prompt.line), 'pick-mixed', `這一題不是多音字句（字後面緊接（＿＿），答案是括號裡的一個讀音），所以這個目標照原題型出`);
  const answers = target.prompts.map(prompt => prompt.kind === 'qa' ? optionKeys.indexOf(pickKey(prompt.answer)) : -1);
  // 每個讀音至少一句（§3、L2 R4）：不然一張卡的答案都是同一個讀音，一直點同一個鍵就全對。
  const unused = options.filter((_, i) => !answers.includes(i));
  if (unused.length) return fail([target.line], 'pick-not-recognized', `括號裡的「${unused.join('、')}」沒有句子：每個讀音至少要有一句，所以這個目標照原題型出。罕用的讀音不放進括號，括號裡也不放錯的念法`);
  const stems = target.prompts.map(prompt => prompt.kind === 'qa' ? choiceStem(prompt.question) : '');
  return { choice: { word: split.word, options, optionKeys, title: CHOICE_ENDING, answers, stems, ...anchorsOf(notes, optionKeys) }, problems: [] };
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

// ── 全詩順序卡（D-187 第 3、10 點、D-204）：點選填空的一種，用填空寫，從名稱最後的「排序」認；和比較卡不互搶（比較卡的題目都是問答）。 ──

/**
 * 這個目標是不是全詩順序卡：名稱最後一段是「排序」（前面要有空白或右括號），只有一題，是兩格以上的填空。
 * 不是時照原題型（填空翻面），不另外提示。英文卡組裡沒寫「全詩」的是句子排序（readSentence），不在這裡認。
 */
export function readOrder(target: Target, notes: readonly string[], english = false): PoemOrder | null {
  const { name, prompts } = target;
  if (english && !/(^|\s)全詩\s*排序$/.test(name)) return null;
  if (target.implicit || target.direction !== null || target.group || endingOf(name) !== '排序') return null;
  const prompt = prompts.length === 1 ? prompts[0] : null;
  if (prompt?.kind !== 'cloze' || prompt.blanks.length < 2) return null;
  const { text, blanks } = prompt;
  const lines = blanks.map(blank => text.slice(blank.start + 2, blank.end - 2).trim());
  if (lines.some(line => !line)) return null;
  const tails = blanks.map((blank, i) => text.slice(blank.end, blanks.at(i + 1)?.start ?? text.length));
  const title = name.replace(/\s*排序$/, '').replace(/(^|\s)全詩$/, '').trim();
  return { title, head: text.slice(0, blanks[0].start), lines, tails, notes };
}

// ── 英文的文法與變化（D-193 第 5、6 點、tasks/english-typed-order.md §1）：只在英文的卡組，從名稱的結尾認，問答題打字。 ──

const INFLECTIONS: ReadonlySet<string> = new Set(['過去式', '過去分詞', '複數', '比較級', '最高級']);

/**
 * 去掉成對的 `**` 與 `==`（名稱的粗體、螢光筆，§1-1：只為了認結尾與拆字義，名稱本身不改）。變化與英翻中都先做這一步再拆括號（L2 R7）。
 */
export const unbold = (text: string): string => text.replace(/\*\*(.+?)\*\*/g, '$1').replace(/==(.+?)==/g, '$1');

/** 最後一組成對的括號（全半形都算，左右可以不同）與它前面的字；沒有是 null。 */
function lastBracket(text: string): { before: string; inner: string } | null {
  const match = /^(.*?)\s*[（(]([^（）()]*)[）)]\s*$/.exec(text);
  return match ? { before: match[1].trim(), inner: match[2].trim() } : null;
}
const BRACKETS = /[（）()]/;

/** 配對用的鍵（§1-5）：字和意思各自照 pickKey 正規化，再接成 `字(意思)`；括號前的空白不算。 */
const wordKey = (word: string, meaning: string | null): string => pickKey(word) + (meaning === null ? '' : '(' + pickKey(meaning) + ')');

/** 拆成字與最後一組括號的意思（§1-4、§1-5）；前面還有括號、括號不成對時是 null。 */
function splitMeaning(text: string): { word: string; meaning: string | null } | null {
  const bracket = lastBracket(text);
  const word = bracket ? bracket.before : text.trim();
  if (!word || BRACKETS.test(word)) return null;
  return { word, meaning: bracket ? bracket.inner : null };
}

/**
 * 名稱結尾是「文法」或變化種類的目標（§1-1）：只在英文的卡組；最上層直接寫題目、有方向、名稱讀得出點選填空的組都不是。
 * 變化的字（去掉意思的括號）不能有中文：`能說出 go 的 過去式` 照原題型。文法點是名稱去掉結尾與最後一組括號（用法）。
 */
export function readTyping(target: Pick<Target, 'name' | 'implicit' | 'direction'>): Typing | null {
  if (target.implicit || target.direction !== null || target.name.includes('==') || readGroup(target.name)) return null;
  const name = unbold(target.name).trim();
  const ending = endingOf(name);
  if (ending === null || (ending !== '文法' && !INFLECTIONS.has(ending))) return null;
  const rest = name.slice(0, name.length - ending.length).trim();
  if (!rest) return null;
  if (ending === '文法') {
    const bracket = lastBracket(rest);
    const point = bracket ? bracket.before : rest;
    return { kind: 'grammar', hint: point && !BRACKETS.test(point) ? point : null, pair: null };
  }
  const split = splitMeaning(rest);
  if (!split || /\p{Script=Han}/u.test(split.word)) return null;
  return { kind: 'inflection', hint: split.word, pair: { key: wordKey(split.word, split.meaning), exact: split.meaning !== null } };
}

/** 英翻中的 pairKey 配對用的寫法（§3-1）：exact 含意思，base 只有字；拆不開時兩個都是整段。 */
export function pairWordOf(pairKey: string): { exact: string; base: string } {
  const split = splitMeaning(unbold(pairKey));
  if (!split) return { exact: pickKey(pairKey), base: pickKey(pairKey) };
  return { exact: wordKey(split.word, split.meaning), base: wordKey(split.word, null) };
}

/**
 * 題目一開頭就寫了這個文法點（§2-2）：去掉 `**`、`==` 與開頭的空白後，第一段是括號包住的文法點（全半形、大小寫不分）。
 * 題目其他地方出現同樣的字不算（「不要用比較級」）。
 */
export function mentions(question: string, point: string): boolean {
  const label = /^\s*[（(]([^（）()]*)[）)]/.exec(question.replace(/\*\*|==/g, ''));
  return label !== null && pickKey(label[1]) === pickKey(point);
}

/** 文法與變化的題目：題幹有幾個空格（AI 草稿的檢查用，§5）。 */
export const blanksIn = (question: string): number => countBlanks(question);

// ── 英文的句子排序（D-193 第 8 點、§4）：英文卡組裡結尾是「排序」、沒寫「全詩」的。 ──

/** 句末的標點（§4-5）：只拿掉最後一格的，而且後面只剩空白與結束的引號。 */
const FINAL = /[.?!]+$/;
/** 英文句子的開頭（§4-6）：前面沒有字，或最後一個字是中文、全形標點。 */
const OPENS = /(?:^|[\p{Script=Han}\u3000-\u303f\uff00-\uffef])$/u;

/** 一題的格（§4-5、§4-6）；不到兩格、有一格沒有字（空的或只有標點）時是 null。 */
function sentenceCells(prompt: Prompt): SentenceCells | null {
  if (prompt.kind !== 'cloze' || prompt.blanks.length < 2) return null;
  const { text, blanks } = prompt;
  // 詞塊是純文字（L2 R6 與第二輪）：成對的粗體、斜體拿掉，鍵、句首大寫與比對都照看得到的字；題目的指紋照原文。
  const read = blanks.map(blank => plainBlock(text.slice(blank.start + 2, blank.end - 2)));
  if (read.some(word => word === null)) return null;
  const words = read as string[];
  const tails = blanks.map((blank, i) => text.slice(blank.end, blanks.at(i + 1)?.start ?? text.length));
  const last = words.length - 1;
  const mark = FINAL.exec(words[last])?.[0] ?? '';
  const bare = words[last].slice(0, words[last].length - mark.length).trim();
  // 句末才拿：後面只剩空白與結束的引號、括號；拿掉後還有點的是縮寫（U.S.），不拿。
  if (mark && /^[\s\p{Pe}\p{Pf}"'*_]*$/u.test(tails[last]) && bare && !bare.includes('.')) {
    words[last] = bare;
    tails[last] = mark + tails[last];
  }
  // 只有標點的格不是詞塊（`==?==`）：照原題型。
  if (words.some(word => !/[\p{L}\p{N}]/u.test(word))) return null;
  const head = visibleText(text.slice(0, blanks[0].start)).replace(/[\s\p{Ps}\p{Pi}"'*_]+$/u, '');
  const starts = words.map((_, i) => i === 0 && OPENS.test(head));
  return { head: text.slice(0, blanks[0].start), words, tails, starts };
}

/**
 * 一格的詞塊（§4-3）：成對的 `**`、`*`、`__`、`_` 拿掉後剩下純文字；還有 Markdown 的記號（未成對的 `*`、`_`，連結、程式碼、公式、
 * 跳脫、字元參照）就是 null，這一題不是句子排序（L2 第二輪：不默默改字，`A_B` 和 `AB` 不會變成同一個鍵）。
 */
function plainBlock(raw: string): string | null {
  const text = raw.replace(/\*\*(.+?)\*\*/g, '$1').replace(/__(.+?)__/g, '$1').replace(/\*(.+?)\*/g, '$1')
    .replace(/(?<![\p{L}\p{N}])_(.+?)_(?![\p{L}\p{N}])/gu, '$1').trim();
  return /[*_[\]<>`$\\|~]|&#?\w+;/.test(text) ? null : text;
}

/** 題目文字看得到的樣子（判斷句首用，L2 第二輪）：連結換成顯示的字，格式記號拿掉。 */
function visibleText(text: string): string {
  return text
    .replace(/!?\[\[([^\]|]*)(?:\|([^\]]*))?\]\]/g, (_m, target: string, alias?: string) => alias ?? target)
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\*\*|==|__|`/g, '');
}

/**
 * 英文的句子排序卡（§4-1）：英文卡組裡名稱最後一段是「排序」、沒有「全詩」、沒有方向，名稱也讀不出點選填空的組；每一題都是兩格以上的填空。
 * 不是時照原題型（填空翻面），不提示；AI 的草稿另外擋（§5）。
 */
export function readSentence(target: Target): SentenceOrder | null {
  const { name, prompts } = target;
  if (target.implicit || target.direction !== null || target.group || readGroup(name) || endingOf(name) !== '排序' || /(^|\s)全詩\s*排序$/.test(name) || !prompts.length) return null;
  const cells = prompts.map(sentenceCells);
  if (cells.some(each => each === null)) return null;
  return { title: name.replace(/\s*排序$/, '').trim(), prompts: cells as SentenceCells[] };
}

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
 * 這個目標是不是接句卡：名稱最後一段是「接句」（前面要有空白或右括號），只有一題，是剛好一格的填空，不是比較組、全詩順序卡也沒有方向。
 * 詩名是目標所在的小標題；第幾句從「第 N 句 接句」讀。不是時照原題型（填空翻面），不另外提示。
 */
export function readCouplet(target: Target, notes: readonly string[], promptNotes: readonly string[]): Couplet | null {
  const { name, prompts } = target;
  if (target.implicit || target.direction !== null || target.group || target.order || endingOf(name) !== '接句') return null;
  const prompt = prompts.length === 1 ? prompts[0] : null;
  if (prompt?.kind !== 'cloze' || prompt.blanks.length !== 1) return null;
  const index = /第\s*(\d+)\s*句\s+接句$/.exec(name);
  return { title: target.section, index: index ? Number(index[1]) : null, lines: coupletLines(prompt.text), notes, promptNotes };
}
