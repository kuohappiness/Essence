import test from 'node:test';
import assert from 'node:assert/strict';
import { parseDeck } from '../src/core/deck/index.ts';

// 全詩順序卡的認法（D-187 第 3、10 點、D-204）：名稱最後是「排序」、題目是一題好幾格的填空。預期值照卡組的寫法手寫，不用同樣的算法再算一次。

const POEM = `### 鳥鳴澗
- 鳥鳴澗 全詩 排序 ^b3pmae
    - ==人閒桂花落==，==夜靜春山空==。==月出驚山鳥==，==時鳴春澗中==。
    - 記憶錨點：
        - 人心清閒，桂花悄悄飄落；
        - 夜晚寂靜，春山顯得空曠。
`;
const orderOf = (text: string) => parseDeck(text).targets[0]?.order;

void test('全詩順序卡：詩名、每一句、每一句後面接的標點', () => {
  assert.deepEqual(orderOf(POEM), { title: '鳥鳴澗', head: '', lines: ['人閒桂花落', '夜靜春山空', '月出驚山鳥', '時鳴春澗中'], tails: ['，', '。', '，', '。'] });
  assert.equal(parseDeck(POEM).targets[0].group, undefined, '不是比較組');
  assert.deepEqual(parseDeck(POEM).problems, []);
});

void test('全詩順序卡：名稱沒有「全詩」也認；只拿掉最後的「排序」與「全詩」', () => {
  assert.equal(orderOf('- 登鸛雀樓 排序\n    - ==白日依山盡==，==黃河入海流==。\n')?.title, '登鸛雀樓');
  assert.equal(orderOf('- 全詩 排序\n    - ==白日依山盡==，==黃河入海流==。\n')?.title, '');
});

void test('全詩順序卡：兩句文字相同時兩格都留；第一格前面的字放 head', () => {
  assert.deepEqual(orderOf('- 歌 全詩 排序\n    - 〈==江南好==〉，==江南好==。\n'), { title: '歌', head: '〈', lines: ['江南好', '江南好'], tails: ['〉，', '。'] });
});

void test('不是全詩順序卡：結尾不是排序、問答題、只有一格、好幾題、排序沒有空白隔開', () => {
  const cases = [
    '- 鳥鳴澗 第 1 句 接句\n    - ==人閒桂花落==，夜靜春山空。\n',
    '- 間接問句 排序\n    - 請問他住哪裡？ :: Where does he live?\n',
    '- 鳥鳴澗 全詩 排序\n    - ==人閒桂花落==，夜靜春山空。\n',
    '- 鳥鳴澗 全詩 排序\n    - ==人閒桂花落==，==夜靜春山空==。\n    - ==月出驚山鳥==，==時鳴春澗中==。\n',
    '- 鳥鳴澗 全詩排序\n    - ==人閒桂花落==，==夜靜春山空==。\n',
  ];
  for (const text of cases) assert.equal(orderOf(text), undefined, text);
});
