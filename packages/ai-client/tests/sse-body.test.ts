// 串流解碼與請求本文編碼的單元測試。預期值來自規格（WHATWG SSE）與 Node 的 Buffer（獨立的 base64 實作）。
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { Binary, dataUrl, encodeBody } from '../src/body.ts';
import { SseDecoder } from '../src/sse.ts';

const decodeAll = (chunks: string[]) => {
  const decoder = new SseDecoder();
  const encoder = new TextEncoder();
  return [...chunks.flatMap(c => decoder.push(encoder.encode(c))), ...decoder.end()];
};

void test('SSE：LF、CRLF、CR 三種換行一樣', () => {
  const expected = [{ event: 'a', data: '1' }, { event: 'message', data: '2' }];
  assert.deepEqual(decodeAll(['event: a\ndata: 1\n\ndata: 2\n\n']), expected);
  assert.deepEqual(decodeAll(['event: a\r\ndata: 1\r\n\r\ndata: 2\r\n\r\n']), expected);
  assert.deepEqual(decodeAll(['event: a\rdata: 1\r\rdata: 2\r\r']), expected);
});

void test('SSE：CR 和 LF 被切在兩段之間，不會多出一個空行', () => {
  assert.deepEqual(decodeAll(['data: 1\r', '\ndata: 2\r\n\r\n']), [{ event: 'message', data: '1\n2' }]);
});

void test('SSE：註解行、BOM、多行 data、冒號後沒有空白、沒有冒號的欄位', () => {
  assert.deepEqual(decodeAll(['\ufeff: keepalive\n\ndata:a\ndata: b\nretry: 5\nid: 3\ndata\n\n']), [{ event: 'message', data: 'a\nb\n' }]);
});

void test('SSE：最後沒有空行也交出', () => {
  assert.deepEqual(decodeAll(['data: last']), [{ event: 'message', data: 'last' }]);
});

void test('SSE：沒有 data 的事件不交出，event 不會帶到下一個', () => {
  assert.deepEqual(decodeAll(['event: x\n\ndata: y\n\n']), [{ event: 'message', data: 'y' }]);
});

void test('本文：沒有檔案時和 JSON.stringify 一樣', () => {
  const body = { a: '中文', b: [1, null, { c: '\u0000' }] };
  assert.equal(new TextDecoder().decode(encodeBody(body)), JSON.stringify(body));
});

void test('本文：每種長度的檔案 base64 都和 Buffer 一樣，前綴照寫', () => {
  for (const length of [0, 1, 2, 3, 4, 5, 255, 1000, 65_537]) {
    const bytes = new Uint8Array(length).map((_, i) => (i * 37 + 11) % 256);
    const body = { text: '光合作用', file: dataUrl('application/pdf', bytes), raw: new Binary(bytes), after: 'ok' };
    const parsed = JSON.parse(new TextDecoder().decode(encodeBody(body))) as Record<string, string>;
    const expected = Buffer.from(bytes).toString('base64');
    assert.equal(parsed.file, `data:application/pdf;base64,${expected}`, `長度 ${length}`);
    assert.equal(parsed.raw, expected);
    assert.equal(parsed.text, '光合作用');
    assert.equal(parsed.after, 'ok');
  }
});

void test('本文：使用者的文字裡有 NUL 或像記號的字也不會被當成檔案', () => {
  const body = { text: '\u0000ai-client-x-0\u0000', file: new Binary(new Uint8Array([1, 2, 3])) };
  const parsed = JSON.parse(new TextDecoder().decode(encodeBody(body))) as Record<string, string>;
  assert.equal(parsed.text, '\u0000ai-client-x-0\u0000');
  assert.equal(parsed.file, 'AQID');
});

void test('範例回應的換行和 checkout 設定無關：fixtures 裡沒有 CR（L2 R15，Windows 的 core.autocrlf=true）', () => {
  const root = join(import.meta.dirname, '..', 'fixtures');
  const withCr = readdirSync(root, { recursive: true, withFileTypes: true })
    .filter(d => d.isFile())
    .map(d => join(d.parentPath, d.name))
    .filter(file => readFileSync(file).includes(13))
    .map(file => file.slice(root.length + 1));
  assert.deepEqual(withCr, []);
});
