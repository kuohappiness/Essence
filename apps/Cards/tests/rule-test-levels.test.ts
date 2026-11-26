// 比較測試工具的錯誤分級（tasks/rule-test-d236.md §3）：D-236 沒點名的種類能調，預設照 §12 第 1 題。
import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_LEVELS, ISSUE_KINDS, levelOf } from '../tools/rule-test/levels.ts';

void test('levelOf：重大錯誤是重大；判錯、洩漏、其他傷到學習是傷到學習；一題多事、池裡判準不同預設也是（§12 第 1 題）；近義重複、沒講為什麼（§17，自己的指標）、值得學不進三級', () => {
  assert.deepEqual(ISSUE_KINDS.map(kind => [kind, levelOf(kind, DEFAULT_LEVELS)]), [
    ['重大錯誤', '重大'], ['判錯', '傷到學習'], ['洩漏', '傷到學習'], ['其他傷到學習', '傷到學習'],
    ['一題多事', '傷到學習'], ['池裡判準不同', '傷到學習'], ['小問題', '小問題'], ['近義重複', null], ['跨單元去向', '小問題'], ['沒講為什麼', null], ['值得學', null],
  ]);
});

void test('levelOf：把一題多事調成小問題，只有它變', () => {
  const levels = { ...DEFAULT_LEVELS, 一題多事: '小問題' as const };
  assert.equal(levelOf('一題多事', levels), '小問題');
  assert.equal(levelOf('池裡判準不同', levels), '傷到學習');
  assert.equal(levelOf('重大錯誤', levels), '重大');
});
