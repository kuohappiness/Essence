// 比較測試工具的探針（任務說明 tasks/rule-test-tool.md §9、§11 第 0 步）：在使用者電腦上跑一次，
// 確認轉接器要用的 CLI 行為，結果寫進輸出資料夾的 probe.md 與 probe.json，再由 Claude 填進 §9 的表。
// 用法：npm run rule-test -- probe <教材.pdf> <輸出資料夾> [--pages <頁數>] [--skip-long] [--opus <模型>] [--fable <模型>] [--codex-model <模型>]
// 會開十幾個很短的 AI 對話（兩個讀整份 PDF、兩個長輸出）；--skip-long 跳過長輸出那兩個。
import { randomBytes } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { cliPath } from '../cli-path.ts';
import { findClaude, findCodex, type Cli } from './clis.ts';
import { runProcess, type RunResult } from './proc.ts';
import { parseStream, userMessage, type ClaudeRun } from './stream.ts';

interface Finding { id: string; ok: boolean | null; summary: string; details: Record<string, unknown> }

const MINUTE = 60_000;
const CHINESE = '繁體中文測試：鬱龜龘';

/** PDF 的頁數：數 `/Type /Page` 物件（不是 /Pages）；物件流壓縮的 PDF 數不到，回 null。 */
export function countPdfPages(bytes: Buffer): number | null {
  const text = bytes.toString('latin1');
  const found = text.match(/\/Type\s*\/Page(?![a-zA-Z])/g)?.length ?? 0;
  return found > 0 ? found : null;
}

/** 回覆裡最後一個「總頁數：N」。 */
export function statedPages(text: string): number | null {
  const all = [...text.matchAll(/總頁數\s*[:：]\s*(\d+)/g)];
  return all.length ? Number(all[all.length - 1][1]) : null;
}

/** Read 工具讀過的頁：沒有 pages 參數算整份（'all'）。 */
export function readPages(run: ClaudeRun, file: string): string[] {
  return run.toolUses.filter(use => use.name === 'Read' && typeof use.input.file_path === 'string' && use.input.file_path.endsWith(file))
    .map(use => typeof use.input.pages === 'string' ? use.input.pages : 'all');
}

function args(): { pdf: string; out: string; pages: number | null; skipLong: boolean; opus: string; fable: string; codexModel: string } {
  const list = process.argv.slice(3);
  const flag = (name: string, fallback: string): string => {
    const at = list.indexOf(name);
    if (at < 0) return fallback;
    const [value] = list.splice(at, 2).slice(1);
    return value ?? fallback;
  };
  const skipAt = list.indexOf('--skip-long');
  if (skipAt >= 0) list.splice(skipAt, 1);
  const opus = flag('--opus', 'claude-opus-5-5'), fable = flag('--fable', 'claude-fable-5-2'), codexModel = flag('--codex-model', 'gpt-6.2-sol');
  const pagesText = flag('--pages', '');
  const [pdf, out] = list;
  if (!pdf || !out) throw Error('用法：npm run rule-test -- probe <教材.pdf> <輸出資料夾> [--pages <頁數>] [--skip-long] [--opus <模型>] [--fable <模型>] [--codex-model <模型>]');
  return { pdf: cliPath(pdf, 'rule-test'), out: cliPath(out, 'rule-test'), pages: pagesText ? Number(pagesText) : null, skipLong: skipAt >= 0, opus, fable, codexModel };
}

export async function probe(): Promise<void> {
  const options = args();
  mkdirSync(join(options.out, 'raw'), { recursive: true });
  const pdfBytes = readFileSync(options.pdf);
  const expectedPages = options.pages ?? countPdfPages(pdfBytes);
  const root = mkdtempSync(join(tmpdir(), 'rule-test-probe-'));
  const findings: Finding[] = [];
  let step = 0;
  const save = (name: string, result: RunResult): void => {
    writeFileSync(join(options.out, 'raw', `${String(++step).padStart(2, '0')}-${name}.txt`),
      `exit ${String(result.code)}${result.timedOut ? '（逾時）' : ''}${result.error ? `\n開不起來：${result.error}` : ''}｜${String(result.ms)} ms\n--- stdout ---\n${result.stdout}\n--- stderr ---\n${result.stderr}\n`);
  };
  /** 每個對話一個新的暫存資料夾（中文名字，順便驗 P9 的中文路徑）；pdf 為 true 時放一份 教材.pdf。 */
  const fresh = (name: string, pdf = false): string => {
    const dir = join(root, `探針-${name}`);
    mkdirSync(dir, { recursive: true });
    if (pdf) copyFileSync(options.pdf, join(dir, '教材.pdf'));
    return dir;
  };
  const record = (finding: Finding): void => { findings.push(finding); console.log(`${finding.id}：${finding.ok === null ? '待驗' : finding.ok ? '通過' : '沒過'}｜${finding.summary}`); };
  const attempt = async (id: string, body: () => Promise<void>): Promise<void> => {
    try { await body(); } catch (error) { record({ id, ok: false, summary: `探針本身出錯：${error instanceof Error ? error.message : String(error)}`, details: {} }); }
  };

  let claude: Cli | null = null, codex: Cli | null = null;
  try { claude = findClaude(); } catch (error) { record({ id: 'P0', ok: false, summary: String(error), details: {} }); }
  try { codex = findCodex(); } catch (error) { record({ id: 'P0', ok: false, summary: String(error), details: {} }); }

  const claudeRun = async (name: string, flags: string[], input: string, cwd: string, timeoutMs = 10 * MINUTE): Promise<{ result: RunResult; run: ClaudeRun }> => {
    if (!claude) throw Error('沒有 claude');
    const result = await runProcess(claude.command, [...claude.prefix, ...flags], { cwd, input, timeoutMs });
    save(name, result);
    return { result, run: parseStream(result.stdout) };
  };
  const base = (model: string, effort: string, tools: string): string[] =>
    ['-p', '--safe-mode', '--strict-mcp-config', '--output-format', 'stream-json', '--verbose', '--model', model, '--effort', effort, '--tools', tools];

  // P0：版本與使用者層的設定檔（只記有沒有，不讀內容）。
  await attempt('P0', async () => {
    const versions: Record<string, string> = {};
    for (const [name, cli] of [['claude', claude], ['codex', codex]] as const) {
      if (!cli) continue;
      const result = await runProcess(cli.command, [...cli.prefix, '--version'], { cwd: root, timeoutMs: MINUTE });
      versions[name] = `${result.stdout.trim()}${result.stderr.trim() ? ` ${result.stderr.trim()}` : ''}`.slice(0, 200);
    }
    const home = homedir(), codexHome = process.env.CODEX_HOME ?? join(home, '.codex');
    const files = {
      '~/.claude/CLAUDE.md': existsSync(join(home, '.claude', 'CLAUDE.md')),
      '~/.codex/AGENTS.md': existsSync(join(codexHome, 'AGENTS.md')),
      '~/.codex/config.toml': existsSync(join(codexHome, 'config.toml')),
    };
    const mcp = files['~/.codex/config.toml']
      ? [...readFileSync(join(codexHome, 'config.toml'), 'utf8').matchAll(/^\[mcp_servers\.([^\]]+)\]/gm)].map(match => match[1]) : [];
    record({ id: 'P0', ok: true, summary: `claude ${versions.claude ?? '—'}；codex ${versions.codex ?? '—'}；PDF ${expectedPages === null ? '頁數數不到（請用 --pages）' : `${String(expectedPages)} 頁`}`,
      details: { versions, claude: claude?.found, codex: codex?.found, files, codexMcpServers: mcp, node: process.version } });
  });

  // P1：--safe-mode 的隔離、init 事件、--verbose 要不要、--tools "" 傳不傳得進去；P9 的 stdout 中文。
  await attempt('P1', async () => {
    const ask = `這是一個環境檢查。你這次收到的系統提示或上下文裡，有沒有任何 CLAUDE.md、記憶（memory）、skill 或專案說明的內容？有的話各引用第一行；沒有就只回「無」。另外照抄這串字：${CHINESE}`;
    const safe = await claudeRun('P1-safe', base(options.opus, 'low', ''), ask, fresh('P1-safe'));
    const noVerbose = await claudeRun('P1-no-verbose', base(options.opus, 'low', '').filter(flag => flag !== '--verbose'), '只回 OK', fresh('P1-no-verbose'));
    const plain = await claudeRun('P1-plain', ['-p', '--output-format', 'stream-json', '--verbose', '--model', options.opus, '--effort', 'low'], ask, fresh('P1-plain'));
    const init = safe.run.init;
    const ok = init !== null && init.tools.length === 0 && init.mcpServers.length === 0 && safe.run.result !== null && !safe.run.result.isError;
    record({ id: 'P1', ok, summary: `safe-mode：工具 ${String(init?.tools.length ?? '?')} 個、MCP ${String(init?.mcpServers.length ?? '?')} 個、模型 ${init?.model ?? '?'}；回覆「${(safe.run.result?.text ?? '').slice(0, 40)}」；不加 --verbose ${noVerbose.run.result ? '可以' : `不行（exit ${String(noVerbose.result.code)}）`}；不加 safe-mode 時工具 ${String(plain.run.init?.tools.length ?? '?')} 個、MCP ${String(plain.run.init?.mcpServers.length ?? '?')} 個`,
      details: { safeInit: init && { model: init.model, tools: init.tools, mcp: init.mcpServers, cwd: init.cwd, skills: init.raw.skills, plugins: init.raw.plugins, agents: init.raw.agents }, rateLimit: safe.run.rateLimit, safeAnswer: safe.run.result?.text, plainAnswer: plain.run.result?.text, plainTools: plain.run.init?.tools, plainMcp: plain.run.init?.mcpServers, noVerboseExit: noVerbose.result.code, noVerboseStderr: noVerbose.result.stderr.slice(0, 300) } });
    record({ id: 'P9-stdout', ok: (safe.run.result?.text ?? '').includes('鬱龜龘'), summary: '中文路徑的暫存資料夾、stdin 與 stdout 的中文', details: {} });
  });

  // P2：兩個模型配 --effort high 用訂閱跑得動，事件裡有實際的模型與用量。
  await attempt('P2', async () => {
    const rows: Record<string, unknown>[] = [];
    for (const model of [options.opus, options.fable]) {
      const { result, run } = await claudeRun(`P2-${model}`, base(model, 'high', ''), '只回 OK', fresh(`P2-${model}`));
      rows.push({ model, exit: result.code, initModel: run.init?.model, usedModels: run.result?.models, usage: run.result?.usage, cost: run.result?.costUsd, isError: run.result?.isError, text: run.result?.text.slice(0, 80), stderr: result.stderr.slice(0, 300) });
    }
    record({ id: 'P2', ok: rows.every(row => row.exit === 0 && row.isError === false), summary: rows.map(row => `${String(row.model)} → ${JSON.stringify(row.usedModels)}`).join('；'), details: { rows } });
  });

  const pageAsk = '它總共有幾頁？逐頁寫一行：頁序（第 1 頁、第 2 頁…）和那一頁上看得到的第一個詞。最後一行寫「總頁數：N」。';
  // P3a：PDF 當文件附件送、不開工具。
  await attempt('P3a', async () => {
    const flags = [...base(options.opus, 'low', ''), '--input-format', 'stream-json'];
    const { result, run } = await claudeRun('P3a', flags, userMessage(`附件是一份 PDF。${pageAsk}`, pdfBytes.toString('base64')), fresh('P3a'), 20 * MINUTE);
    const stated = statedPages(run.result?.text ?? '');
    record({ id: 'P3a', ok: run.result !== null && !run.result.isError && stated !== null && (expectedPages === null || stated === expectedPages),
      summary: `exit ${String(result.code)}；回答 ${String(stated)} 頁（PDF ${String(expectedPages)} 頁）；用量 ${JSON.stringify(run.result?.usage ?? {}).slice(0, 120)}`,
      details: { lines: (run.result?.text ?? '').split('\n').length, stderr: result.stderr.slice(0, 500), isError: run.result?.isError, subtype: run.result?.subtype } });
  });

  // P3b：用 Read 讀暫存資料夾裡的 PDF，從事件看讀了哪些頁。
  await attempt('P3b', async () => {
    const flags = [...base(options.opus, 'low', 'Read'), '--allowedTools', 'Read'];
    const { result, run } = await claudeRun('P3b', flags, `這個資料夾裡有一份 教材.pdf。用 Read 讀它（每次最多 20 頁，要讀完全部頁），然後回答：${pageAsk}`, fresh('P3b', true), 20 * MINUTE);
    const stated = statedPages(run.result?.text ?? '');
    const pages = readPages(run, '教材.pdf');
    record({ id: 'P3b', ok: pages.length > 0 && stated !== null && (expectedPages === null || stated === expectedPages),
      summary: `Read 了 ${String(pages.length)} 次（${pages.join('、')}）；回答 ${String(stated)} 頁（PDF ${String(expectedPages)} 頁）`,
      details: { toolUses: run.toolUses.map(use => ({ name: use.name, input: use.input })), exit: result.code, stderr: result.stderr.slice(0, 500) } });
  });

  // P4：--json-schema 驗一百多列的輸出；格式要補正時 --resume 接同一個對話。
  await attempt('P4', async () => {
    const schema = JSON.stringify({ type: 'object', properties: { rows: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, verdict: { type: 'string', enum: ['有', '部分', '沒有'] } }, required: ['id', 'verdict'] } } }, required: ['rows'] });
    const dir = fresh('P4');
    const first = await claudeRun('P4-first', [...base(options.opus, 'low', ''), '--json-schema', schema], '請產生 120 列：id 依序是 R001 到 R120，verdict 依序輪流「有」「部分」「沒有」。', dir);
    const rows = (value: unknown): { id: string; verdict: string }[] => (value as { rows?: { id: string; verdict: string }[] } | undefined)?.rows ?? [];
    const firstRows = rows(first.run.result?.structured);
    const session = first.run.result?.sessionId;
    let secondRows: { id: string; verdict: string }[] = [], resumeExit: number | null = null;
    if (session) {
      const second = await claudeRun('P4-resume', [...base(options.opus, 'low', ''), '--json-schema', schema, '--resume', session], '把 R001 的 verdict 改成「沒有」，其他列不變，整份重交。', dir);
      secondRows = rows(second.run.result?.structured);
      resumeExit = second.result.code;
    }
    record({ id: 'P4', ok: firstRows.length === 120 && secondRows.length === 120 && secondRows[0]?.verdict === '沒有',
      summary: `第一次 ${String(firstRows.length)} 列；--resume 後 ${String(secondRows.length)} 列、R001＝${secondRows[0]?.verdict ?? '?'}（exit ${String(resumeExit)}）`,
      details: { resultKeys: first.run.result ? Object.keys(first.run.result.raw) : [], session } });
  });

  // P5：訂閱登入時可以換系統提示。
  await attempt('P5', async () => {
    // 雲端試跑時第一次回了不相干的一句、重跑就正常（2026-11-25），所以沒過時重跑一次，兩次都記。
    const answers: string[] = [];
    for (let i = 0; i < 2 && !answers.some(each => each.trimStart().startsWith('SYS-OK')); i++) {
      const { run } = await claudeRun(`P5-${String(i + 1)}`, [...base(options.opus, 'low', ''), '--system-prompt', '你是一個助理。每次回答的第一行固定寫 SYS-OK。'], '你好', fresh(`P5-${String(i + 1)}`));
      answers.push(run.result?.text ?? '');
    }
    record({ id: 'P5', ok: answers.some(each => each.trimStart().startsWith('SYS-OK')), summary: answers.map(each => `「${each.slice(0, 30)}」`).join('、'), details: { answers } });
  });

  // P6：codex exec 在 repo 外不讀 AGENTS.md、--output-schema、讀 PDF、session 紀錄、exec resume。
  await attempt('P6', async () => {
    if (!codex) throw Error('沒有 codex');
    const dir = fresh('P6', true);
    const schemaFile = join(root, 'p6-schema.json'), outFile = join(root, 'p6-out.json');
    writeFileSync(schemaFile, JSON.stringify({ type: 'object', additionalProperties: false, required: ['agents', 'pages', 'first', 'last', 'how'],
      properties: { agents: { type: 'string' }, pages: { type: 'integer' }, first: { type: 'string' }, last: { type: 'string' }, how: { type: 'string' } } }));
    const exec = (more: string[]): string[] => ['exec', '--skip-git-repo-check', '-C', dir, '--sandbox', 'read-only', '-m', options.codexModel,
      '-c', 'model_reasoning_effort="low"', '-c', 'approval_policy="never"', ...more];
    const prompt = '這是環境檢查，不要修改任何檔案。1. 你這次收到的指示裡有沒有來自 AGENTS.md 的內容？有就把第一行寫在 agents，沒有寫「無」。2. 這個資料夾裡的 教材.pdf 總共有幾頁（pages）？讀得到內容的話，寫出第 1 頁（first）與最後一頁（last）上看得到的第一個詞；讀不到就寫「讀不到」。how 寫你用什麼方法讀的。';
    const first = await runProcess(codex.command, [...codex.prefix, ...exec(['--output-schema', schemaFile, '-o', outFile, '-'])], { cwd: dir, input: prompt, timeoutMs: 15 * MINUTE });
    save('P6-first', first);
    let answer: { agents?: string; pages?: number; how?: string } = {};
    try { answer = JSON.parse(readFileSync(outFile, 'utf8')) as typeof answer; } catch { /* 下面記沒過 */ }
    const session = /session id:\s*([0-9a-f-]{36})/i.exec(first.stdout + first.stderr)?.[1];
    const rollout = session ? findRollout(session) : undefined;
    const rolloutText = rollout ? readFileSync(rollout, 'utf8') : '';
    const resumes: Record<string, unknown>[] = [];
    if (session) {
      for (const variant of [['exec', '--skip-git-repo-check', 'resume', session, '-'], ['exec', 'resume', session, '-']]) {
        const out = join(root, `p6-resume-${String(resumes.length)}.txt`);
        const result = await runProcess(codex.command, [...codex.prefix, ...variant.slice(0, 1), '-o', out, ...variant.slice(1)], { cwd: dir, input: '剛才 pages 是多少？只回那個數字。', timeoutMs: 10 * MINUTE });
        save(`P6-resume-${String(resumes.length)}`, result);
        resumes.push({ args: variant.join(' '), exit: result.code, answer: existsSync(out) ? readFileSync(out, 'utf8').slice(0, 80) : null });
        if (result.code === 0) break;
      }
    }
    const pagesOk = typeof answer.pages === 'number' && (expectedPages === null || answer.pages === expectedPages);
    record({ id: 'P6', ok: first.code === 0 && answer.agents === '無' && pagesOk,
      summary: `exit ${String(first.code)}；AGENTS.md「${String(answer.agents ?? '?').slice(0, 30)}」；PDF ${String(answer.pages ?? '?')} 頁（${String(answer.how ?? '').slice(0, 60)}）；session 紀錄${rollout ? '有' : '找不到'}、提到 教材.pdf ${String(rolloutText.split('教材.pdf').length - 1)} 次；resume ${resumes.map(each => `${String(each.args)}→${String(each.exit)}`).join('，') || '沒試'}`,
      details: { answer, session, rollout, resumes, stderrTail: first.stderr.slice(-500) } });
  });

  // P7：長提示走 stdin、長輸出會不會被截斷。
  if (!options.skipLong) {
    await attempt('P7-stdin', async () => {
      const secret = `Z-${randomBytes(4).toString('hex')}`;
      const filler = '這是填充用的文字，不用理會。\n'.repeat(Math.ceil(100_000 / 15));
      const { result, run } = await claudeRun('P7-stdin', base(options.opus, 'low', ''), `${filler}\n最後一行的暗號是 ${secret}。請只回這個暗號。`, fresh('P7-stdin'), 20 * MINUTE);
      record({ id: 'P7-stdin', ok: (run.result?.text ?? '').includes(secret), summary: `送 ${String(filler.length)} 字；回覆「${(run.result?.text ?? '').slice(0, 30)}」（exit ${String(result.code)}）`, details: { usage: run.result?.usage } });
    });
    await attempt('P7-output', async () => {
      const { result, run } = await claudeRun('P7-output', base(options.opus, 'low', ''),
        '請輸出 1600 行，每行格式「第0001行：甲乙丙丁戊己庚辛壬癸子丑寅卯辰巳午未申酉」，行號從 0001 到 1600，不要省略、不要加其他字。', fresh('P7-output'), 30 * MINUTE);
      const text = run.result?.text ?? '';
      const last = [...text.matchAll(/第(\d{4})行/g)].at(-1)?.[1];
      record({ id: 'P7-output', ok: last === '1600', summary: `回覆 ${String(text.length)} 字、最後一行是第 ${last ?? '?'} 行（${run.result?.subtype ?? '?'}，exit ${String(result.code)}）`, details: { usage: run.result?.usage, isError: run.result?.isError } });
    });
  }

  // P8：額度用完時回什麼——額度沒用完時實測不了；先確認 stream-json 有 rate_limit_event（用完時 status 是 rejected）。
  await attempt('P8', async () => {
    const { run } = await claudeRun('P8', base(options.opus, 'low', ''), '只回 OK', fresh('P8'));
    record({ id: 'P8', ok: null, summary: run.rateLimit ? `有 rate_limit_event：${run.rateLimit.status}、${run.rateLimit.type ?? '?'} 用了 ${String(run.rateLimit.utilization ?? '?')}；用完時的樣子實測不了` : '沒有 rate_limit_event；用完時的樣子實測不了',
      details: { rateLimit: run.rateLimit } });
  });

  // P9：剪貼簿的中文（只有 Windows）：先存下使用者原本的剪貼簿，測完放回去。
  if (process.platform === 'win32') {
    await attempt('P9-clipboard', async () => {
      const ps = (command: string): Promise<RunResult> => runProcess('powershell.exe', ['-NoProfile', '-Command', `[Console]::OutputEncoding=[Text.Encoding]::UTF8; ${command}`], { cwd: root, timeoutMs: MINUTE });
      const b64 = (text: string): string => Buffer.from(text, 'utf8').toString('base64');
      const setFrom = (base64: string): string => `Set-Clipboard -Value ([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${base64}')))`;
      const original = (await ps('$t = Get-Clipboard -Raw; if ($null -eq $t) { "" } else { [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($t)) }')).stdout.trim();
      const sample = `${CHINESE}\n第二行 ABC`;
      await ps(setFrom(b64(sample)));
      const back = (await ps('Get-Clipboard -Raw')).stdout.replace(/\r\n/g, '\n').replace(/\n$/, '');
      await ps(original ? setFrom(original) : "Set-Clipboard -Value ' '");
      record({ id: 'P9-clipboard', ok: back === sample, summary: back === sample ? '讀回來一字不差' : `讀回來是「${back.slice(0, 40)}」`, details: {} });
    });
  }

  const lines = ['# 比較測試工具的探針結果', '', `時間：${new Date().toISOString()}｜PDF：${String(expectedPages)} 頁`, '', '| # | 結果 | 摘要 |', '|---|---|---|',
    ...findings.map(each => `| ${each.id} | ${each.ok === null ? '待驗' : each.ok ? '通過' : '沒過'} | ${each.summary.replace(/\|/g, '｜').replace(/\n/g, ' ')} |`), ''];
  writeFileSync(join(options.out, 'probe.md'), lines.join('\n'));
  writeFileSync(join(options.out, 'probe.json'), JSON.stringify(findings, null, 1));
  rmSync(root, { recursive: true, force: true });
  console.log(`結果：${join(options.out, 'probe.md')}`);
}

/** Codex 的 session 紀錄（同 tools/codex.ts：sessions/YYYY/MM/DD，跨午夜找前一天）。 */
function findRollout(sessionId: string): string | undefined {
  const base = join(process.env.CODEX_HOME ?? join(homedir(), '.codex'), 'sessions');
  const now = new Date();
  for (const day of [now, new Date(now.getTime() - 86_400_000)]) {
    const dir = join(base, String(day.getFullYear()), String(day.getMonth() + 1).padStart(2, '0'), String(day.getDate()).padStart(2, '0'));
    if (!existsSync(dir)) continue;
    const name = readdirSync(dir).find(file => file.endsWith(`${sessionId}.jsonl`));
    if (name) return join(dir, name);
  }
  return undefined;
}
