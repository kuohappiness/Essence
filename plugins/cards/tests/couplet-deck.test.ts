import test from 'node:test';
import assert from 'node:assert/strict';
import { parseDeck } from '../src/core/deck/index.ts';

// 接句卡的認法（D-185 第 6、8 點、tasks/couplet-cards.md §1、§2）：名稱最後是「接句」、題目是一題剛好一格的填空。預期值照卡組的寫法手寫。

const POEM = `### 鳥鳴澗
- 鳥鳴澗 第 1 句 接句 ^b3pmaa
    - 出處：p.84
    - ==人閒桂花落==，夜靜春山空。
    - 記憶錨點：
        - 人心清閒，桂花悄悄飄落；
        - 夜晚寂靜，春山顯得空曠。
        - 兩句都在寫靜。
`;
const coupletOf = (text: string) => parseDeck(text).targets[0]?.couplet;

void test('接句卡：詩名是小標題、第幾句、照句尾標點分成兩句、記憶錨點一項一行', () => {
  assert.deepEqual(coupletOf(POEM), {
    title: '鳥鳴澗', index: 1, lines: ['==人閒桂花落==，', '夜靜春山空。'],
    notes: ['人心清閒，桂花悄悄飄落；', '夜晚寂靜，春山顯得空曠。', '兩句都在寫靜。'], promptNotes: [],
  });
  assert.equal(parseDeck(POEM).targets[0].order, undefined, '不是全詩順序卡');
  assert.deepEqual(parseDeck(POEM).problems, []);
});

void test('接句卡：沒有小標題時詩名是 null；名稱讀不到第幾句時是 null', () => {
  assert.deepEqual(coupletOf('- 鳥鳴澗 第 2 句 接句\n    - 人閒桂花落，==夜靜春山空==。\n'), { title: null, index: 2, lines: ['人閒桂花落，', '==夜靜春山空==。'], notes: [], promptNotes: [] });
  assert.equal(coupletOf('### 春曉\n- 春曉 接句\n    - ==春眠不覺曉==，處處聞啼鳥。\n')?.index, null);
  assert.equal(coupletOf('### 春曉\n- 春曉 第12句 接句\n    - ==春眠不覺曉==，處處聞啼鳥。\n')?.index, 12);
});

void test('分句：標點後面的右引號算同一句；空格裡的標點不切；只有一句時就是一句', () => {
  assert.deepEqual(coupletOf('- 試 第 1 句 接句\n    - 「==一二三==！」他說：四五六。\n')?.lines, ['「==一二三==！」', '他說：', '四五六。']);
  assert.deepEqual(coupletOf('- 試 第 1 句 接句\n    - ==一二，三==四五。\n')?.lines, ['==一二，三==四五。']);
  assert.deepEqual(coupletOf('- 試 第 1 句 接句\n    - ==春眠不覺曉==\n')?.lines, ['==春眠不覺曉=='], '沒有標點');
  assert.deepEqual(coupletOf('- 試 第 1 句 接句\n    - ==Hello==, world!\n')?.lines, ['==Hello==,', 'world!'], '半形標點後面的空白不留');
});

void test('分句：有粗體、連結這類格式時不拆，整句交給渲染器；句尾標點後面的各種右括號跟著同一句（L2 R4）', () => {
  assert.deepEqual(coupletOf('- 試 第 1 句 接句\n    - **==清風穿竹徑==，淺水映山光。**\n')?.lines, ['**==清風穿竹徑==，淺水映山光。**']);
  assert.deepEqual(coupletOf('- 試 第 1 句 接句\n    - ==清風穿竹徑==，[[淺水]]映山光。\n')?.lines, ['==清風穿竹徑==，[[淺水]]映山光。']);
  assert.deepEqual(coupletOf('- 試 第 1 句 接句\n    - 【==清風穿竹徑==！】淺水映山光。\n')?.lines, ['【==清風穿竹徑==！】', '淺水映山光。']);
  assert.deepEqual(coupletOf('- 試 第 1 句 接句\n    - 《==清風穿竹徑==，》〈淺水映山光。〉\n')?.lines, ['《==清風穿竹徑==，》', '〈淺水映山光。〉']);
});

void test('題目底下的記憶錨點另外分好，和目標底下的各是一份（L2 R2）', () => {
  const couplet = coupletOf('- 試 第 1 句 接句\n    - ==一二三==，四五六。\n        - 記憶錨點：\n            - 題甲\n            - 題乙\n    - 記憶錨點：共甲\n');
  assert.deepEqual([couplet?.promptNotes, couplet?.notes], [['題甲', '題乙'], ['共甲']]);
});

void test('不是接句卡：結尾不是接句、問答題、兩格、好幾題、接句沒有空白隔開、比較組', () => {
  const cases = [
    '- 鳥鳴澗 全詩 排序\n    - ==人閒桂花落==，==夜靜春山空==。\n',
    '- 鳥鳴澗 第 1 句 接句\n    - 人閒桂花落 :: 夜靜春山空\n',
    '- 鳥鳴澗 第 1 句 接句\n    - ==人閒桂花落==，==夜靜春山空==。\n',
    '- 鳥鳴澗 第 1 句 接句\n    - ==人閒桂花落==，夜靜春山空。\n    - 人閒桂花落，==夜靜春山空==。\n',
    '- 鳥鳴澗 第 1 句接句\n    - ==人閒桂花落==，夜靜春山空。\n',
    '- 一般 填空\n    - ==人閒桂花落==，夜靜春山空。\n',
  ];
  for (const text of cases) assert.equal(coupletOf(text), undefined, text);
});
