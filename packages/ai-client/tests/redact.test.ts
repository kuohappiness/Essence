// 金鑰的遮蔽（src/redact.ts，L2 R1）：串流文字不管怎麼切，交出的每一段接起來都等於整段遮蔽後的結果。
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { StreamRedactor } from '../src/redact.ts';
import { KEY } from './helpers.ts';

const run = (secrets: string[], parts: string[]) => {
  const r = new StreamRedactor(secrets);
  const out = [...parts.map(p => r.push(p)), r.end()].join('');
  assert.equal(r.length, out.length);
  return out;
};

void test('串流遮蔽：金鑰在每一個位置被切成兩段、三段，結果都一樣', () => {
  const text = `前${KEY}中${KEY}${KEY}後`;
  const expected = '前***中******後';
  for (let i = 0; i <= text.length; i++) {
    assert.equal(run([KEY], [text.slice(0, i), text.slice(i)]), expected, `切在 ${i}`);
    for (let j = i; j <= text.length; j += 7) assert.equal(run([KEY], [text.slice(0, i), text.slice(i, j), text.slice(j)]), expected, `切在 ${i}、${j}`);
  }
  // 逐字送。
  assert.equal(run([KEY], [...text]), expected);
});

void test('串流遮蔽：結尾不像金鑰的開頭就不扣字；沒有金鑰、太短的字串不算金鑰', () => {
  const r = new StreamRedactor([KEY]);
  assert.equal(r.push('光合作用'), '光合作用');
  assert.equal(r.push(`把${KEY.slice(0, 5)}`), '把');
  assert.equal(r.push('x'), `${KEY.slice(0, 5)}x`);
  assert.equal(new StreamRedactor([]).push('abc'), 'abc');
  assert.equal(run(['abc'], ['xabcx']), 'xabcx');
});
