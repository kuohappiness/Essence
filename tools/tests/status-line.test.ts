import test from 'node:test';
import assert from 'node:assert/strict';
import { looksNew, parseStatus } from '../status-line.ts';

const ok = (line: string) => {
  const result = parseStatus(line);
  assert.ok('status' in result, `${line} → ${'error' in result ? result.error : ''}`);
  return result.status;
};
const bad = (line: string, reason: RegExp) => {
  const result = parseStatus(line);
  assert.ok('error' in result, `${line} 應該報錯`);
  assert.match(result.error, reason);
};

void test('L2 R9「已結案 →」後面要是下一站：D-ID 或連結，好幾站用「、」接', () => {
  assert.equal(ok('狀態：已結案 → D-218｜完成：談定｜等誰：—').state, '已結案');
  assert.equal(ok('狀態：已結案 → [D-214](../decisions.md#d-214-x)、[D-215](../decisions.md#d-215-y)｜完成：談定｜等誰：—').state, '已結案');
  assert.equal(ok('狀態：已結案 → [任務](<../tasks/a b.md>)｜完成：交出去｜等誰：—').state, '已結案');
  bad('狀態：已結案 → 先別做｜完成：已停｜等誰：—', /「已結案 →」後面接下一站/);
  bad('狀態：已結案 → [D-218](x.md) 另外的備註｜完成：已停｜等誰：—', /「已結案 →」後面接下一站/);
});

void test('L2 N8「已結案 →」的下一站在 repo 裡：外部連結報錯', () => {
  bad('狀態：已結案 → [外連](https://example.invalid/x)｜完成：交出去｜等誰：—', /「已結案 →」的下一站要在 repo 裡/);
  bad('狀態：已結案 → D-218、[外連](<//example.invalid/x y>)｜完成：交出去｜等誰：—', /「已結案 →」的下一站要在 repo 裡/);
});

void test('正例：一般、好幾個等誰、暫停帶原因、已結案帶箭頭、結束', () => {
  assert.deepEqual(ok('狀態：實作中｜下一步：照規格實作，合併前 Codex L2｜等誰：Claude'),
    { label: '實作中', state: '實作中', done: false, text: '照規格實作，合併前 Codex L2', who: ['Claude'] });
  assert.deepEqual(ok('狀態：待審｜下一步：L2｜等誰：Claude、Codex').who, ['Claude', 'Codex']);
  assert.deepEqual(ok('狀態：暫停（等 0.7.0 發布）｜下一步：發布後接著做｜等誰：—'),
    { label: '暫停（等 0.7.0 發布）', state: '暫停', done: false, text: '發布後接著做', who: [] });
  const closed = ok('狀態：已結案 → [D-218](../decisions.md#d-218-x)｜完成：談定｜等誰：—');
  assert.equal(closed.state, '已結案');
  assert.equal(closed.done, true);
  assert.equal(closed.label, '已結案 → [D-218](../decisions.md#d-218-x)');
  assert.deepEqual(ok('狀態：已合併｜完成：一句話｜等誰：—'), { label: '已合併', state: '已合併', done: true, text: '一句話', who: [] });
  assert.equal(ok('狀態：等觸發點｜下一步：說明書開工時｜等誰：—').state, '等觸發點');
  // 欄與欄之間多一格空白不影響。
  assert.equal(ok('狀態：規劃中 ｜ 下一步：寫規格 ｜ 等誰：使用者').text, '寫規格');
});

void test('反例：結束要寫完成、不是狀態值、暫停沒原因、等誰重複或混用「—」、空的下一步、欄數不對、箭頭接錯', () => {
  bad('狀態：已合併｜下一步：無｜等誰：—', /已合併是結束：第二欄寫「完成：/);
  bad('狀態：實作中｜完成：做完了｜等誰：Claude', /沒結束的第二欄寫「下一步：/);
  bad('狀態：做完了｜下一步：無｜等誰：—', /「做完了」不是狀態值/);
  bad('狀態：進行中｜下一步：無｜等誰：—', /「進行中」不是狀態值/);
  bad('狀態：暫停｜下一步：x｜等誰：—', /暫停要寫原因/);
  bad('狀態：暫停（）｜下一步：x｜等誰：—', /暫停要寫原因/);
  bad('狀態：實作中｜下一步：x｜等誰：使用者、使用者', /等誰重複了/);
  bad('狀態：實作中｜下一步：x｜等誰：—、Claude', /「—」只能單獨用/);
  bad('狀態：實作中｜下一步：x｜等誰：新教材', /「新教材」不是/);
  bad('狀態：實作中｜下一步：｜等誰：Claude', /「下一步：」後面不能空/);
  bad('狀態：實作中｜下一步：a｜b｜等誰：Claude', /剛好三欄.*現在是 4 欄/);
  bad('狀態：實作中｜下一步：a', /剛好三欄.*現在是 2 欄/);
  bad('狀態：實作中 → D-1｜下一步：a｜等誰：Claude', /箭頭只能接在「已結案」後面/);
  bad('狀態：已結案 →｜完成：a｜等誰：—', /後面接下一站/);
  bad('狀態：已合併｜完成：a｜等誰：Claude', /已合併的等誰寫「—」/);
  bad('狀態：等觸發點｜下一步：a｜等誰：使用者', /等觸發點的等誰寫「—」/);
  bad('狀態：實作中｜下一步：a｜誰：Claude', /第三欄寫「等誰：<值>」/);
  bad('> 狀態：實作中｜下一步：a｜等誰：Claude', /要以「狀態：」開頭/);
});

void test('看起來是新格式：以「狀態：」開頭又有新欄名；舊的自由寫法不算', () => {
  assert.ok(looksNew('狀態：已合併｜完成：a｜等誰：—'));
  assert.ok(looksNew('狀態：做完了｜等誰：Claude'));
  assert.ok(!looksNew('狀態：已合併進 `main`（PR #16）'));
  assert.ok(!looksNew('日期：2026-10-27｜狀態：討論中｜下一步：x'));
  assert.ok(!looksNew('> 狀態：實作中｜下一步：a｜等誰：Claude'));
});
