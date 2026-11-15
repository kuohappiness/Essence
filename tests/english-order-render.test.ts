import test from 'node:test';
import assert from 'node:assert/strict';
import { installDom } from './helpers/dom.ts';

// 英文句子排序的格放在哪（tasks/english-typed-order.md §6-1、L2 R1、R5）：每一格用自己的記號，渲染器的輸出用手寫的 HTML。
// 正常的三格在 Windows 版 Obsidian 驗過（任務說明〈結果〉）；這裡擋相鄰的格、題目本來的底線、只有部分記號渲染出來、全部挖空時的換行。
const window = installDom();
Object.assign(globalThis, { Text: window.Text });
const { postProcess, slotMark } = await import('../src/ui/rendered.ts');

const m = (i: number): string => slotMark(i);
function place(html: string, count: number, breakFirst = false): { text: string; breaks: number; missing: boolean; slots: number } {
  const container = document.createElement('div');
  container.innerHTML = html;
  const { slots, slotMissing } = postProcess(container, { mode: 'pick', lines: 1, english: true, markers: Array.from({ length: count }, (_, i) => m(i)), breakFirst });
  slots.forEach((slot, i) => { slot.textContent = `[${String(i)}]`; });
  const breaks = container.querySelectorAll('.ec-break').length;
  container.querySelectorAll('.ec-break').forEach(br => { br.replaceWith('/'); });
  return { text: (container.textContent ?? '').replaceAll(' ', ' '), breaks, missing: slotMissing, slots: slots.length };
}

void test('相鄰的兩格各一格，照順序', () => {
  assert.deepEqual(place(`<p>挖空：${m(0)}${m(1)} off.</p>`, 2), { text: '挖空：/[0][1] off.', breaks: 1, missing: false, slots: 2 });
});

void test('題目本來的 ＿＿ 不會被當成格', () => {
  assert.deepEqual(place(`<p>用「＿＿」表示挖空。I know ${m(0)} ${m(1)} ${m(2)}.</p>`, 3),
    { text: '用「＿＿」表示挖空。/I know [0] [1] [2].', breaks: 1, missing: false, slots: 3 });
});

void test('英文全挖空：第一格就是英文句子的開頭，中文後面換行（R5）', () => {
  assert.deepEqual(place(`<p>我累了。${m(0)} ${m(1)} ${m(2)}.</p>`, 3, true), { text: '我累了。/[0] [1] [2].', breaks: 1, missing: false, slots: 3 });
  assert.deepEqual(place(`<p>${m(0)} ${m(1)} ${m(2)}.</p>`, 3, true), { text: '[0] [1] [2].', breaks: 0, missing: false, slots: 3 }, '前面沒有中文不換行');
});

void test('格在粗體或連結文字裡也照位置放', () => {
  assert.deepEqual(place(`<p>他去哪裡？<strong>${m(0)}</strong> ${m(1)} <a href="https://example.com">${m(2)}</a> go?</p>`, 3, true).text, '他去哪裡？/[0] [1] [2] go?');
});

void test('只有部分記號渲染出來（在程式碼裡）：找不到的格放在句尾，回報少了格', () => {
  const result = place(`<p>I know ${m(0)} <code>${m(1)}</code> ${m(2)}.</p>`, 3);
  assert.equal(result.missing, true);
  assert.equal(result.slots, 3);
  assert.match(result.text, /^I know \[0\] .* \[2\]\.\[1\]$/u);
});
