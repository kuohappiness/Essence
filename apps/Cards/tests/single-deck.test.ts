import test from 'node:test';
import assert from 'node:assert/strict';
import { assignIds, parseDeck } from '../src/core/deck/index.ts';
import type { Target } from '../src/core/deck/index.ts';
import { kindSingle } from './helpers/kinds.ts';
import { EDIT_CASES } from './helpers/source-edit-cases.ts';

// 單選的選項行（tasks/matching-single-choice.md §2、§3）：預期值照 §2 的邊界例子表手寫。

const COAST = [
  '- 能從景觀描述認出西部的海岸',
  '    - 出處：p.42',
  '    - 海岸平直，有沙灘和潟湖，是臺灣哪一部的海岸？ :: 西部',
  '    - 選項：北部;;東部;;西部;;南部',
  '- 能從景觀描述認出東部的海岸',
  '    - 出處：p.42',
  '    - 山緊靠著海，海岸陡直，是臺灣哪一部的海岸？ :: 東部',
  '    - 選項：北部;;東部;;西部;;南部',
  '',
  '- 能說出臺灣北部海岸的地形',
  '    - 臺灣北部的海岸主要是哪一種海岸？ :: 岩岸',
  '    - 選項：岩岸;;沙岸;;斷層海岸;;珊瑚礁海岸',
  '- 能說出臺灣西部海岸的地形',
  '    - 臺灣西部的海岸主要是哪一種海岸？ :: 沙岸',
  '    - 選項：岩岸;;沙岸;;斷層海岸;;珊瑚礁海岸',
  '',
].join('\n');
const QUESTION = '    - 海岸平直，有沙灘和潟湖，是臺灣哪一部的海岸？ :: 西部';
/** 一個目標：名稱、題目那一行，再接 rest 的每一行（各自寫好縮排）。 */
const one = (rest: readonly string[], name = '能從景觀描述認出西部的海岸', question = QUESTION): string => [`- ${name}`, question, ...rest, ''].join('\n');
const first = (text: string): Target => parseDeck(text).targets[0];
const hints = (text: string): { line: number; message: string }[] => parseDeck(text).problems.filter(p => p.code === 'options-invalid').map(({ line, message }) => ({ line, message }));
/** 認不成單選、照原本的題型出，提示一次 options-invalid，訊息含 reason。 */
function notSingle(text: string, reason: string, line?: number): void {
  assert.equal(kindSingle(first(text)), undefined, text);
  const found = hints(text);
  assert.equal(found.length, 1, text);
  assert.ok(found[0].message.includes(reason), `${found[0].message}｜${reason}`);
  if (line !== undefined) assert.equal(found[0].line, line, text);
}

void test('單選：任務說明的例子，兩組選項各自同一個 key，選項行是 shared 的那一項', () => {
  const deck = parseDeck(COAST);
  assert.deepEqual(deck.targets.map(kindSingle), [
    { options: ['北部', '東部', '西部', '南部'], optionKeys: ['北部', '東部', '西部', '南部'], key: '["北部","南部","東部","西部"]', answers: [2], at: 0 },
    { options: ['北部', '東部', '西部', '南部'], optionKeys: ['北部', '東部', '西部', '南部'], key: '["北部","南部","東部","西部"]', answers: [1], at: 0 },
    { options: ['岩岸', '沙岸', '斷層海岸', '珊瑚礁海岸'], optionKeys: ['岩岸', '沙岸', '斷層海岸', '珊瑚礁海岸'], key: '["岩岸","斷層海岸","沙岸","珊瑚礁海岸"]', answers: [0], at: 0 },
    { options: ['岩岸', '沙岸', '斷層海岸', '珊瑚礁海岸'], optionKeys: ['岩岸', '沙岸', '斷層海岸', '珊瑚礁海岸'], key: '["岩岸","斷層海岸","沙岸","珊瑚礁海岸"]', answers: [1], at: 0 },
  ]);
  assert.deepEqual(deck.targets[0].shared, ['選項：北部;;東部;;西部;;南部']);
  assert.deepEqual(deck.targets[0].fields.sources, ['p.42']);
  assert.ok(deck.targets.every(target => target.ok));
  assert.deepEqual(deck.problems, []);
});

void test('單選：選項行在題目前面也認（同一層不分先後），at 照 shared 的位置', () => {
  const text = ['- 能從景觀描述認出西部的海岸', '    - 記憶錨點：西部是沙岸', '    - 選項：北部;;東部;;西部', QUESTION, ''].join('\n');
  assert.deepEqual(kindSingle(first(text)), { options: ['北部', '東部', '西部'], optionKeys: ['北部', '東部', '西部'], key: '["北部","東部","西部"]', answers: [2], at: 1 });
  assert.deepEqual(hints(text), []);
});

void test('單選：沒有選項行照原本，不提示', () => {
  const text = one(['    - 記憶錨點：西部是沙岸']);
  assert.equal(first(text).kind, undefined);
  assert.deepEqual(hints(text), []);
});

void test('單選：選項行寫成填空或問答（M1）照讀成題目，只多提示', () => {
  const cloze = one(['    - 選項：==北部==;;東部;;西部']);
  assert.deepEqual(first(cloze).prompts.map(p => p.kind), ['qa', 'cloze']);
  notSingle(cloze, '選項裡不能有 ==、::', 2);
  const qa = one(['    - 選項：北部 :: 東部;;西部;;南部']);
  assert.deepEqual(first(qa).prompts.map(p => p.kind), ['qa', 'qa']);
  notSingle(qa, '選項裡不能有 ==、::', 2);
});

void test('單選：選項接在資料欄位那一行（M2 O1）：照原本的題型，unknown-field 之外多提示', () => {
  const text = one(['    - 出處：p.42｜類型：分類｜選項：北部;;東部;;西部']);
  const deck = parseDeck(text);
  assert.equal(deck.targets[0].kind, undefined);
  assert.deepEqual(deck.targets[0].fields.sources, ['p.42']);
  assert.equal(deck.targets[0].fields.type, '分類');
  assert.deepEqual(deck.problems.map(p => p.code), ['unknown-field', 'options-invalid']);
  assert.ok(deck.problems[1].message.includes('不接在資料欄位那一行'));
});

void test('單選：選項行接了資料欄位（M2 O2）：選項裡有 ｜', () => {
  notSingle(one(['    - 選項：北部;;東部;;西部｜出處：p.42']), '選項裡不能有', 2);
});

void test('單選：選項行縮在出處底下（M2 E）：出處照現在的讀法，多提示', () => {
  const text = ['- 能從景觀描述認出西部的海岸', '    - 出處：p.42', '        - 選項：北部;;東部;;西部', QUESTION, ''].join('\n');
  assert.deepEqual(first(text).fields.sources, ['p.42', '選項：北部;;東部;;西部']);
  notSingle(text, '寫在學習目標底下、和題目同一層', 2);
});

void test('單選：半形冒號、粗體、冒號前空白（M2 H、P）：照原本的題型，提示寫法', () => {
  notSingle(one(['    - 選項: 北部;;東部;;西部']), '全形冒號', 2);
  notSingle(one(['    - 選項 ：北部;;東部;;西部']), '全形冒號', 2);
  notSingle(one(['    - **選項**：北部;;東部;;西部']), '不要粗體', 2);
  notSingle(one(['    - **選項：**北部;;東部;;西部']), '不要粗體', 2);
  assert.deepEqual(first(one(['    - 選項: 北部;;東部;;西部'])).shared, ['選項: 北部;;東部;;西部']);
});

void test('單選：選項行寫在題目或隱式題底下（M2 J、K）：照題目的補充，提示位置', () => {
  const under = ['- 能從景觀描述認出西部的海岸', QUESTION, '        - 選項：北部;;東部;;西部', ''].join('\n');
  assert.deepEqual(first(under).prompts[0].extras, ['選項：北部;;東部;;西部']);
  notSingle(under, '和題目同一層', 2);
  const implicit = ['- 海岸平直，是臺灣哪一部的海岸？ :: 西部', '    - 選項：北部;;東部;;西部', ''].join('\n');
  assert.equal(first(implicit).implicit, true);
  notSingle(implicit, '和題目同一層', 1);
});

void test('單選：選項行寫在最上層（L2 第一輪 R7）：是目標的名稱或隱式題，照原本的讀法，提示', () => {
  assert.deepEqual(hints('- 選項：北部 :: 東部;;西部;;南部\n'), [{ line: 0, message: '選項行要自己一行，寫在學習目標底下、和題目同一層；寫在這裡照原本的讀法，不算選項' }]);
  assert.deepEqual(hints('- 選項：北部;;東部;;西部\n    - 海岸平直的是哪一部？ :: 西部\n').map(each => each.line), [0]);
  assert.equal(kindSingle(first('- 選項：北部;;東部;;西部\n    - 海岸平直的是哪一部？ :: 西部\n')), undefined);
  // 只有選項行、少縮一層寫到最上層的（L2 第二輪 7）：不是目標，也提示放錯位置；上面那個目標照原本的題型出。
  const pasted = '- 能認出西部的海岸 ^west00\n    - 海岸平直的是哪一部？ :: 西部\n- 選項：北部;;東部;;西部\n';
  assert.deepEqual(hints(pasted), [{ line: 2, message: '選項行要自己一行，寫在學習目標底下、和題目同一層；寫在這裡照原本的讀法，不算選項' }]);
  assert.equal(kindSingle(first(pasted)), undefined);
  assert.deepEqual(hints('- 選項：北部;;東部;;西部\n').map(each => each.line), [0]);
  // 不是選項行的一般筆記照舊不提示。
  assert.deepEqual(hints('- 北部;;東部;;西部\n'), []);
  // 整類（第 2 代）：像選項行的每種寫法（冒號全半形、粗體、空白）寫在最上層，是不是目標、底下有什麼，都提示在那一行。
  for (const label of ['選項：', '選項:', '**選項**：', '**選項：**', '選項 ：']) for (const below of ['', '    - 補充\n', '    - 海岸平直的是哪一部？ :: 西部\n']) {
    const text = `- 能認出西部的海岸\n    - 海岸平直的是哪一部？ :: 西部\n- ${label}北部;;東部;;西部\n${below}`;
    assert.deepEqual(hints(text).map(each => each.line), [2], JSON.stringify(text));
  }
  // 沒有 `;;` 的一般清單不是選項行（L2 第三輪 5）：不是目標的不提示，寫法、底下有沒有補充都一樣；頓號、一個分號、空白隔開的都算。
  for (const label of ['選項：', '選項:', '**選項**：', '**選項：**', '選項 ：']) for (const list of ['搭火車、搭公車', '搭火車；搭公車', '搭火車 搭公車']) for (const below of ['', '    - 補充\n']) {
    const text = `- 能認出西部的海岸\n    - 海岸平直的是哪一部？ :: 西部\n- ${label}${list}\n${below}`;
    assert.deepEqual(hints(text), [], JSON.stringify(text));
  }
});

void test('單選：多行答案的行、記憶錨點的子項目不看', () => {
  const answer = ['- 能說出臺灣的海岸', '    - 臺灣有哪幾部的海岸？ ::', '        - 選項：北部;;東部;;西部', ''].join('\n');
  assert.deepEqual(hints(answer), []);
  const anchor = one(['    - 記憶錨點：', '        - 選項：北部;;東部;;西部']);
  assert.deepEqual(hints(anchor), []);
});

void test('單選：有方向的目標（M6 L）照原本的題型（翻面、打字）', () => {
  notSingle(one(['    - 選項：look;;see;;watch'], 'look 英翻中', '    - look :: 看'), '有方向的目標');
  notSingle(one(['    - 選項：look;;see;;watch'], 'look 中翻英', '    - 看 :: look'), '有方向的目標');
});

void test('單選：選項行底下有子項目、換行接續（M5）', () => {
  notSingle(one(['    - 選項：', '        - 北部', '        - 東部', '        - 西部']), '一行寫完', 2);
  notSingle(one(['    - 選項：北部;;東部;;', '      西部、南部']), '一行寫完', 2);
});

void test('單選：成對的 %% 註解、行尾的區塊 ID 拿掉；沒有結尾的 %% 認不成（M5、N2）', () => {
  assert.deepEqual(kindSingle(first(one(['    - 選項：北部;;東部;;西部 %%AI 的備註%%'])))?.options, ['北部', '東部', '西部']);
  assert.deepEqual(kindSingle(first(one(['    - 選項：北部;;東部;;西部 ^abc234'])))?.options, ['北部', '東部', '西部']);
  assert.deepEqual(kindSingle(first(one(['    - 選項：北部;;%%註%%東部;;西部'])))?.options, ['北部', '東部', '西部']);
  notSingle(one(['    - 選項：北部;;東部;;西部 %%AI 的備註']), '%% 註解沒有結尾', 2);
});

void test('單選：選項之間只照 ;; 切（全半形、兩個以上），選項裡的頓號、逗號、一個分號留著（N2，D-250）', () => {
  const money = kindSingle(first(one(['    - 選項：2,300 萬;;1,000 萬;;500 萬'], '能說出臺灣的人口', '    - 臺灣的人口大約多少？ :: 2,300 萬')));
  assert.deepEqual(money?.options, ['2,300 萬', '1,000 萬', '500 萬']);
  const coast = kindSingle(first(one(['    - 選項：沙灘、沙洲;;岬角、海灣;;斷崖峭壁;;珊瑚礁'], '能說出西部海岸的景觀', '    - 海岸平直、有潟湖的西部，常見哪一種景觀？ :: 沙灘、沙洲')));
  assert.deepEqual(coast?.options, ['沙灘、沙洲', '岬角、海灣', '斷崖峭壁', '珊瑚礁']);
  assert.deepEqual(coast?.answers, [0]);
  // 中文描述裡的一個分號是選項的字：不是答案的那個選項也不會被切開。
  const climate = kindSingle(first(one(['    - 選項：四季如春;;夏季炎熱；冬季溫暖;;終年寒冷，降雪多'], '能說出南部的氣候', '    - 南部的氣候是？ :: 夏季炎熱；冬季溫暖')));
  assert.deepEqual(climate?.options, ['四季如春', '夏季炎熱；冬季溫暖', '終年寒冷，降雪多']);
  assert.deepEqual(climate?.answers, [1]);
  // 全形、半形混著打，打成三個也一樣。
  assert.deepEqual(kindSingle(first(one(['    - 選項：北部；；東部;；西部;;;南部'])))?.options, ['北部', '東部', '西部', '南部']);
  // 答案寫了 ;;：一題只有一個答案。
  notSingle(one(['    - 選項：北部;;東部;;西部'], undefined, '    - 海岸平直的是哪一部？ :: 西部;;北部'), '（;; 只用來隔開選項，一題只有一個答案）', 2);
});

void test('單選：比例尺的冒號不擋，＞＜ 折成半形擋（N6）', () => {
  const scale = kindSingle(first(one(['    - 選項：1：5000;;1：25000;;1：50000'], '能說出地圖的比例尺', '    - 這張地圖的比例尺是？ :: 1：25000')));
  assert.deepEqual(scale?.answers, [1]);
  notSingle(one(['    - 選項：＞;;＜;;＝'], '能比較大小', '    - 3 和 5 誰大？ :: ＜'), '選項裡不能有');
});

void test('單選：沒有 ;; 的切不開：一個分號、頓號、逗號、只用空白、考題轉錄的 (A)(B) 寫法（M5、M19，D-250）', () => {
  for (const options of ['北部；東部；西部', '北部; 東部;西部', '北部、東部、西部', '北部，東部,西部', '北部 東部 西部']) {
    notSingle(one([`    - 選項：${options}`]), '選項之間要用兩個分號（;;）隔開', 2);
  }
  notSingle(one(['    - 選項：(A)岩岸 (B)沙岸 (C)斷層海岸'], '能說出北部海岸的地形', '    - 北部的海岸是？ :: (A)岩岸'), '選項之間要用兩個分號（;;）隔開', 2);
});

void test('單選：兩行選項行', () => {
  notSingle(one(['    - 選項：北部;;東部;;西部', '    - 選項：北部;;東部;;西部;;南部']), '只能有一行', 3);
});

void test('單選：答案和選項的寫法不同（全半形、大小寫、粗體）照比對鍵對上', () => {
  assert.deepEqual(kindSingle(first(one(['    - 選項：Ａ型;;B 型;;AB 型'], '能說出血型', '    - 他是什麼血型？ :: **a型**')))?.answers, [0]);
  assert.deepEqual(kindSingle(first(one(['    - 選項：Ａ型;;B 型;;AB 型'], '能說出血型', '    - 他是什麼血型？ :: ab 型')))?.answers, [2]);
});

void test('單選：一個目標兩題、答案不同，每題自己的答案', () => {
  const text = ['- 能從景觀描述認出西部的海岸', QUESTION, '    - 臺灣哪一部的海岸山緊靠著海？ :: 東部', '    - 選項：北部;;東部;;西部', ''].join('\n');
  assert.deepEqual(kindSingle(first(text))?.answers, [2, 1]);
});

void test('單選：同一篇兩個目標的選項同樣幾個、順序或寫法不同，key 相同', () => {
  const text = [one(['    - 選項：北部;;東部;;西部']), one(['    - 選項：**西部**;;東部;;北部'], '能從景觀描述認出東部的海岸', '    - 山緊靠著海，是臺灣哪一部的海岸？ :: 東部')].join('');
  const [a, b] = parseDeck(text).targets.map(kindSingle);
  assert.equal(a?.key, b?.key);
  assert.deepEqual(b?.options, ['**西部**', '東部', '北部']);
  assert.deepEqual(b?.answers, [1]);
});

void test('單選：重複的選項只留第一個；剩不到 3 個認不成', () => {
  assert.deepEqual(kindSingle(first(one(['    - 選項：北部;;東部;;西部;;**北部**'])))?.options, ['北部', '東部', '西部']);
  notSingle(one(['    - 選項：北部;;西部;;**北部**']), '至少要 3 個', 2);
  notSingle(one(['    - 選項：東部;;西部']), '至少要 3 個', 2);
});

void test('單選：題幹有兩個 ＿＿、題目是填空、答案多行、答案不在選項裡（§3 第 4 條）', () => {
  notSingle(one(['    - 選項：北部;;東部;;西部'], undefined, '    - 海岸平直的是＿＿部，山靠海的是＿＿部 :: 西'), '最多一個空格');
  assert.deepEqual(kindSingle(first(one(['    - 選項：北部;;東部;;西部'], undefined, '    - 海岸平直的是臺灣＿＿的海岸 :: 西部')))?.answers, [2]);
  notSingle(one(['    - 選項：北部;;東部;;西部'], undefined, '    - 海岸平直的是==西部==的海岸'), '全部是問答題');
  notSingle(one(['    - 選項：北部;;東部;;西部'], undefined, '    - 海岸平直的是哪一部？ ::\n        - 西部\n        - 南部'), '全部是問答題');
  // L2 第一輪 R2：多行答案只寫一個子項目，答案沒有換行，照寫法仍是多行答案，不認。
  notSingle(one(['    - 選項：北部;;東部;;西部'], undefined, '    - 海岸平直的是哪一部？ ::\n        - 西部'), '全部是問答題');
  notSingle(one(['    - 選項：北部;;東部;;西部'], undefined, '    - 海岸平直的是哪一部？ :: 南部'), '答案「南部」不在選項裡');
});

void test('單選：選項以欄位或標籤的名稱加冒號開頭（§3 第 3 條）', () => {
  for (const label of ['出處', '類型', '重要性', '狀態', '備註', '錯題補強', '記憶錨點', '選項']) {
    notSingle(one([`    - 選項：北部;;東部;;${label}：p.42`]), '名稱加冒號開頭');
    notSingle(one([`    - 選項：北部;;東部;;${label}:p.42`]), '名稱加冒號開頭');
    // L2 第一輪 R7：粗體的名稱也算。
    notSingle(one([`    - 選項：北部;;東部;;**${label}**：p.42`]), '名稱加冒號開頭');
  }
});

void test('單選：選項裡有連結、程式碼、公式、HTML、底線（§3 第 3 條）', () => {
  for (const option of ['[[北部]]', '`北部`', '$x$', '<b>北部</b>', '北_部', '北＿部', '北：：部']) {
    notSingle(one([`    - 選項：${option};;東部;;西部`]), '選項裡不能有', 2);
  }
});

void test('單選：已經是別的卡型（比較卡、多音字）、名稱像比較卡沒寫好：照那一種，提示', () => {
  const group = '- 寨（寨、塞） 相似字\n    - 山＿＿ :: 寨\n    - 選項：寨;;塞;;賽\n';
  assert.equal(first(group).kind?.id, 'group');
  assert.ok(hints(group)[0].message.includes('已經是比較卡'));
  const polyphone = '- 長（ㄓㄤˇ、ㄔㄤˊ） 讀音\n    - 他長（＿＿）高了。 :: ㄓㄤˇ\n    - 路很長（＿＿）。 :: ㄔㄤˊ\n    - 選項：ㄓㄤˇ;;ㄔㄤˊ;;ㄓㄤ\n';
  assert.equal(first(polyphone).kind?.id, 'polyphone');
  assert.ok(hints(polyphone)[0].message.includes('已經是多音字'));
  const loose = '- 寨（寨、塞） 相似字\n    - 山＿＿ :: 賽\n    - 選項：寨;;塞;;賽\n';
  assert.equal(first(loose).kind, undefined);
  assert.ok(hints(loose)[0].message.includes('照比較卡或多音字的寫法讀'));
  assert.ok(parseDeck(loose).problems.some(p => p.code === 'pick-not-recognized'));
});

void test('單選：英文的文法或變化照打字出', () => {
  const text = '---\n科目: 英文\n---\n- go 過去式\n    - go 的過去式 :: went\n    - 選項：went;;gone;;goed\n';
  const deck = parseDeck(text);
  assert.equal(deck.targets[0].kind?.id, 'typing');
  const found = deck.problems.filter(p => p.code === 'options-invalid');
  assert.equal(found.length, 1);
  assert.ok(found[0].message.includes('已經是文法或變化'));
});

void test('單選：選項行只算補充，不算進題目的指紋', () => {
  const plain = first(one([]));
  const single = first(one(['    - 選項：北部;;東部;;西部']));
  assert.equal(single.prompts[0].fingerprint, plain.prompts[0].fingerprint);
});

void test('單選：出處寫回的例子是單選（寫錯位置的那一個除外）', () => {
  const cases = EDIT_CASES.filter(each => each.name.startsWith('單選：'));
  assert.equal(cases.length, 3);
  assert.deepEqual(cases.map(each => parseDeck(each.text).targets[0].kind?.id), ['single', 'single', undefined]);
  assert.deepEqual(cases.map(each => typeof each.want === 'string' ? parseDeck(each.want).targets[0].kind?.id : null), ['single', 'single', undefined]);
});

void test('單選：補 ID 與改縮排不動選項行，補完照樣是單選', () => {
  const { text } = assignIds(COAST, { taken: new Set(), random: () => 0.5 });
  assert.deepEqual(text.split('\n').filter(line => line.includes('選項：')), COAST.split('\n').filter(line => line.includes('選項：')));
  assert.deepEqual(parseDeck(text).targets.map(target => target.kind?.id), ['single', 'single', 'single', 'single']);
  const crooked = '- 能說出北部海岸的地形\n  - 北部的海岸是？ :: 岩岸\n  - 選項：岩岸;;沙岸;;斷層海岸\n';
  const fixed = assignIds(crooked, { taken: new Set(), random: () => 0.5 }).text;
  assert.equal(parseDeck(fixed).targets[0].kind?.id, 'single');
  assert.ok(fixed.includes('- 選項：岩岸;;沙岸;;斷層海岸\n'));
});
