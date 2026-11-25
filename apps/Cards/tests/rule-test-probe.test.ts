// 比較測試工具的第 0 步（tasks/rule-test-tool.md §9、§11）：探針用到的子行程、CLI 事件與 PDF 頁數的小工具。
import test from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { shimTarget } from '../tools/rule-test/clis.ts';
import { countPdfPages, readPages, statedPages } from '../tools/rule-test/probe.ts';
import { runProcess } from '../tools/rule-test/proc.ts';
import { parseStream, userMessage } from '../tools/rule-test/stream.ts';
import { join, resolve } from 'node:path';

void test('runProcess：提示從 stdin 給、讀得到 stdout 的中文', async () => {
  const result = await runProcess(process.execPath, ['-e', 'process.stdin.pipe(process.stdout)'], { cwd: tmpdir(), input: '繁體中文：鬱龜龘\n', timeoutMs: 20_000 });
  assert.equal(result.code, 0);
  assert.equal(result.timedOut, false);
  assert.equal(result.stdout, '繁體中文：鬱龜龘\n');
});

void test('runProcess：到了上限就結束子行程、記成逾時，不等它自己結束', async () => {
  const started = Date.now();
  const result = await runProcess(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { cwd: tmpdir(), timeoutMs: 300 });
  assert.equal(result.timedOut, true);
  assert.equal(result.code, null);
  assert.ok(Date.now() - started < 10_000);
});

void test('runProcess：找不到程式時回錯誤訊息，不丟例外', async () => {
  const result = await runProcess(join(tmpdir(), 'no-such-program-rule-test'), [], { cwd: tmpdir(), timeoutMs: 5_000 });
  assert.equal(result.code, null);
  assert.ok(result.error);
});

void test('parseStream：init 的工具與 MCP、tool_use、額度事件、result 的回覆與結構化輸出；讀不懂的行另記', () => {
  const lines = [
    { type: 'system', subtype: 'init', model: 'claude-opus-5-5', tools: [], mcp_servers: [{ name: 'x', status: 'connected' }], cwd: '/tmp/a' },
    { type: 'assistant', message: { content: [{ type: 'text', text: '讀檔' }, { type: 'tool_use', name: 'Read', input: { file_path: '/tmp/a/教材.pdf', pages: '1-20' } }] } },
    { type: 'rate_limit_event', rate_limit_info: { status: 'allowed_warning', rateLimitType: 'seven_day', utilization: 0.53, resetsAt: 1795964400 } },
    { type: 'result', subtype: 'success', is_error: false, result: 'OK', session_id: 's1', structured_output: { rows: [] }, duration_ms: 2794, total_cost_usd: 0.02, usage: { output_tokens: 4 }, modelUsage: { 'claude-opus-5-5': {} } },
  ].map(each => JSON.stringify(each));
  const run = parseStream([...lines, 'not json', ''].join('\n'));
  assert.deepEqual(run.init && { model: run.init.model, tools: run.init.tools, mcp: run.init.mcpServers, cwd: run.init.cwd }, { model: 'claude-opus-5-5', tools: [], mcp: ['x'], cwd: '/tmp/a' });
  assert.deepEqual(run.toolUses, [{ name: 'Read', input: { file_path: '/tmp/a/教材.pdf', pages: '1-20' } }]);
  assert.deepEqual(run.rateLimit, { status: 'allowed_warning', type: 'seven_day', utilization: 0.53, resetsAt: 1795964400 });
  assert.equal(run.result?.text, 'OK');
  assert.equal(run.result?.sessionId, 's1');
  assert.deepEqual(run.result?.structured, { rows: [] });
  assert.deepEqual(run.result?.models, ['claude-opus-5-5']);
  assert.deepEqual(run.junk, ['not json']);
});

void test('userMessage：PDF 附件在文字前面，一行一則', () => {
  const line = userMessage('讀附件', 'QUJD');
  assert.ok(line.endsWith('\n'));
  assert.deepEqual(JSON.parse(line), { type: 'user', message: { role: 'user', content: [
    { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: 'QUJD' } },
    { type: 'text', text: '讀附件' },
  ] } });
  assert.deepEqual((JSON.parse(userMessage('只有字')) as { message: { content: unknown[] } }).message.content, [{ type: 'text', text: '只有字' }]);
});

void test('countPdfPages：數 /Type /Page，不算 /Pages；數不到回 null', () => {
  const pdf = Buffer.from('1 0 obj << /Type /Pages /Count 3 >>\n2 0 obj << /Type /Page >>\n3 0 obj <</Type/Page>>\n4 0 obj << /Type  /Page /Parent 1 0 R >>', 'latin1');
  assert.equal(countPdfPages(pdf), 3);
  assert.equal(countPdfPages(Buffer.from('%PDF-1.7 /ObjStm only', 'latin1')), null);
});

void test('statedPages：取最後一個「總頁數：N」', () => {
  assert.equal(statedPages('第 1 頁：甲\n總頁數：3\n更正：\n總頁數： 4'), 4);
  assert.equal(statedPages('沒有寫'), null);
});

void test('readPages：只算讀這個檔的 Read；沒有 pages 參數算整份', () => {
  const run = parseStream([
    { type: 'assistant', message: { content: [
      { type: 'tool_use', name: 'Read', input: { file_path: '/t/探針-P3b/教材.pdf', pages: '1-20' } },
      { type: 'tool_use', name: 'Read', input: { file_path: '/t/探針-P3b/教材.pdf' } },
      { type: 'tool_use', name: 'Read', input: { file_path: '/t/探針-P3b/別的.pdf', pages: '1' } },
      { type: 'tool_use', name: 'Bash', input: { command: 'ls' } },
    ] } },
  ].map(each => JSON.stringify(each)).join('\n'));
  assert.deepEqual(readPages(run, '教材.pdf'), ['1-20', 'all']);
});

void test('shimTarget：讀 npm 的 .cmd 包裝指到的 JS 檔', () => {
  const shim = resolve('/npm/claude.cmd');
  const text = '@ECHO off\r\nGOTO start\r\n:find_dp0\r\nSET dp0=%~dp0\r\nEXIT /b\r\n:start\r\n"%_prog%"  "%dp0%\\node_modules\\@anthropic-ai\\claude-code\\cli.js" %*\r\n';
  assert.equal(shimTarget(shim, text), resolve('/npm', 'node_modules\\@anthropic-ai\\claude-code\\cli.js'));
  assert.equal(shimTarget(shim, '@ECHO off\r\nclaude.exe %*'), null);
});
