import test from 'node:test';
import assert from 'node:assert/strict';
import { questionType } from '../src/core/study/index.ts';
import type { QuestionType } from '../src/core/study/index.ts';
import { DECK, setup, view } from './helpers/pick-session.ts';

// 題型接點（tasks/question-type-seam.md §1、L2 的 R3）：作答與畫面是 Record<QuestionType, …> 的表，解析與組卡是專屬函式。
// 新增題型時這張表少一列，編譯不過；有列但解析或組卡沒接上，下面的測試不過：出來的題型不對，或根本沒有卡。
const SAMPLES: Record<QuestionType, string> = {
  flip: '- 能說明 A ^aaa111\n    - Q :: A\n',
  typed: '- borrow 中翻英 ^aaa111\n    - 借入 :: borrow\n',
  pick: '- 寨（寨、塞） 相似字 ^aaa111\n    - 山＿＿ :: 寨\n- 塞（寨、塞） 相似字 ^bbb222\n    - 大＿＿車 :: 塞\n',
  order: '## 鳥鳴澗\n\n- 鳥鳴澗 全詩 排序 ^aaa111\n    - ==人閒桂花落==，==夜靜春山空==。\n',
};

for (const [type, text] of Object.entries(SAMPLES)) {
  void test(`${type}：從筆記的文字經過解析、組卡、作答流程，出來就是這個題型`, async t => {
    const h = await setup(t, { [DECK]: `---\n科目: 國語\n---\n${text}` });
    const s = await h.open({ subject: '國語' });
    assert.equal(questionType(view(s).card), type);
  });
}

// 多音字（tasks/polyphone-pick.md）也是點選填空，只是選項寫在目標自己的名稱：同一個 pick，另走一條組卡的路，所以另外測一次。
void test('pick（多音字）：從筆記的文字經過解析、組卡、作答流程，出來就是點選填空', async t => {
  const h = await setup(t, { [DECK]: '---\n科目: 國語\n---\n- 長（ㄓㄤˇ、ㄔㄤˊ） 讀音 ^aaa111\n    - 他長（＿＿）高了。 :: ㄓㄤˇ\n    - 路很長（＿＿）。 :: ㄔㄤˊ\n' });
  const s = await h.open({ subject: '國語' });
  assert.equal(questionType(view(s).card), 'pick');
  assert.equal(view(s).card.blanks.length, 2);
});

// 單選與配對（tasks/matching-single-choice.md §4）也是點選填空，選項寫在目標底下的一行：同一組的目標併成一張，另走一條組卡的路，所以另外測一次。
void test('pick（單選與配對）：從筆記的文字經過解析、組卡、作答流程，出來就是點選填空，同一組併成一張', async t => {
  const options = '    - 選項：北部;;東部;;西部\n';
  const h = await setup(t, { [DECK]: `---\n科目: 國語\n---\n- 能認出西部的海岸 ^aaa111\n    - 海岸平直的是哪一部？ :: 西部\n${options}- 能認出東部的海岸 ^bbb222\n    - 山靠海的是哪一部？ :: 東部\n${options}` });
  const s = await h.open({ subject: '國語' });
  assert.equal(questionType(view(s).card), 'pick');
  assert.equal(view(s).card.blanks.length, 2);
});
