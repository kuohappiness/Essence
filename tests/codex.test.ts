import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPrompt, execArgs, PRESETS, sessionIdFromLog, usageFromRollout, usageLine } from '../tools/codex.ts';

// D-212：Claude 直接呼叫本機 Codex 的腳本。實際執行 Codex 不在測試裡（要使用者的登入與額度），這裡測組參數與讀紀錄。

const tokenCount = (input: number, cached: number, output: number, rateLimits: unknown): string => JSON.stringify({
  timestamp: '2026-11-18T09:12:10.986Z',
  type: 'event_msg',
  payload: {
    type: 'token_count',
    info: { total_token_usage: { input_tokens: input, cached_input_tokens: cached, output_tokens: output } },
    rate_limits: rateLimits,
  },
});

// 2026-11-18 實測那次的數字：CLI 印的 tokens used 是 6,395。
const limits = {
  primary: { used_percent: 33.0, window_minutes: 300, resets_at: 1794998332 },
  secondary: { used_percent: 60.0, window_minutes: 10080, resets_at: 1795394278 },
};

void test('預設：bug 從頭查用 xhigh，卡關的最後一步用 Astra，其餘 Sol high（D-212 第 2 點）', () => {
  assert.equal(PRESETS.bug.effort, 'xhigh');
  assert.equal(PRESETS.escalate.model, 'gpt-6.2-astra');
  for (const kind of ['l2', 'format', 'discuss', 'milestone'] as const) {
    assert.deepEqual([PRESETS[kind].model, PRESETS[kind].effort], ['gpt-6.2-sol', 'high'], kind);
  }
  assert.equal(PRESETS.format.sandbox, 'read-only');
  assert.equal(PRESETS.l2.sandbox, 'workspace-write');
});

void test('指示寫明請求檔、這一輪的說明，並要完整回報放在最後一則訊息', () => {
  const prompt = buildPrompt('l2', 'Claude Codex Discussion/x-l2.md', '第 2 輪');
  assert.match(prompt, /`Claude Codex Discussion\/x-l2\.md`/);
  assert.match(prompt, /這一輪：第 2 輪/);
  assert.match(prompt, /最後一則訊息/);
  assert.match(prompt, /不修改 repo 裡追蹤的檔案/);
  assert.match(buildPrompt('format', 'tasks/x.md'), /唯讀沙箱/);
  assert.doesNotMatch(buildPrompt('format', 'tasks/x.md'), /這一輪：/);
});

void test('參數：每次新的 exec、指定模型與等級、不等核准、prompt 從 stdin', () => {
  const args = execArgs(PRESETS.bug, 'out.md');
  assert.equal(args[0], 'exec');
  assert.deepEqual(args.slice(args.indexOf('--sandbox'), args.indexOf('--sandbox') + 2), ['--sandbox', 'workspace-write']);
  assert.deepEqual(args.slice(args.indexOf('-m'), args.indexOf('-m') + 2), ['-m', 'gpt-6.2-sol']);
  assert.ok(args.includes('model_reasoning_effort="xhigh"'));
  assert.ok(args.includes('approval_policy="never"'));
  assert.deepEqual(args.slice(-3), ['-o', 'out.md', '-']);
});

void test('從執行紀錄找 session id', () => {
  assert.equal(sessionIdFromLog('model: gpt-6.2-sol\nsession id: 01a1eded-60c6-7161-90c9-7504a09236cf\n--------'), '01a1eded-60c6-7161-90c9-7504a09236cf');
  assert.equal(sessionIdFromLog('ERROR: model_not_found'), undefined);
});

void test('token 與額度取最後一筆 token_count；壞掉的行與沒有 info 的略過', () => {
  const text = [
    tokenCount(18622, 12416, 45, limits),
    '{"type":"event_msg","payload":{"type":"token_count","info":null,"rate_limits":null}}',
    tokenCount(37317, 30976, 54, limits),
    '{"type":"event_msg","payload":{"type":"token_cou',
  ].join('\n');
  const usage = usageFromRollout(text);
  assert.deepEqual(usage, {
    tokens: 6395,
    fiveHour: { usedPercent: 33, resetsAt: 1794998332 },
    weekly: { usedPercent: 60, resetsAt: 1795394278 },
  });
  assert.equal(usageFromRollout('{"type":"session_meta"}'), undefined);
});

void test('附在回覆末端的一行：剩下的百分比與週額度重置時間', () => {
  const usage = usageFromRollout(tokenCount(37317, 30976, 54, limits));
  assert.ok(usage);
  assert.equal(usageLine(usage, 'Asia/Taipei'), 'Codex 本輪：6,395 token｜5 小時額度剩 67%｜週額度剩 40%（11/23 週一 08:37 重置）');
  assert.equal(usageLine({ tokens: 120 }), 'Codex 本輪：120 token');
});
