// 比較測試工具：開一個新對話、照 JSON schema 交一份結果（評分 §5-7、裁定 §5-8 共用）。工具驗結果，不合格就在同一個對話補正，
// 最多 FIX_ROUNDS 輪；每一輪記事件與對話紀錄。合格的先由呼叫的一方存檔，再記完成（中途被砍不會留下「完成卻沒有檔」）。
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseJsonReply, type Adapter } from './adapters.ts';
import type { Judge } from './config.ts';
import type { Folder } from './folder.ts';
import { appendEvent, jobState, readEvents } from './jobs.ts';

/** 補正最多幾輪（同一個對話）；還不合格就記失敗，由操作的 Claude 決定（§5-7）。 */
const FIX_ROUNDS = 2;

export interface AskOptions {
  folder: Folder;
  /** 事件檔（測試資料夾裡的相對路徑）與工作的名字。 */
  log: string;
  key: string;
  who: Judge;
  adapter: Adapter;
  text: string;
  /** 只有 claude 附 PDF（Codex 讀資料夾裡的那一份）；接著同一個對話時不再附。 */
  pdf: Buffer | null;
  cwd: string;
  schema: Record<string, unknown>;
  validate: (value: unknown) => string[];
  save: (value: unknown) => void;
  /** 對話紀錄存在哪個資料夾。 */
  records: string;
}

export type AskOutcome = 'done' | 'fail' | 'timeout' | 'quota' | 'fatal';

export async function askJson(options: AskOptions): Promise<AskOutcome> {
  const { folder, log, key, who } = options;
  const attempt = jobState(readEvents(folder, log), key).attempts + 1;
  appendEvent(folder, { type: 'start', job: key, attempt }, log);
  mkdirSync(options.records, { recursive: true });
  const schema = JSON.stringify(options.schema);
  let text = options.text, session: string | null = null, problems: string[] = [];
  for (let round = 0; round <= FIX_ROUNDS; round++) {
    const result = await options.adapter({
      text, pdf: who.kind === 'claude' && session === null ? options.pdf : null, resume: session, model: who.model, effort: who.effort, systemPrompt: null, cwd: options.cwd,
      tools: 'Read', jsonSchema: schema, timeoutMs: folder.config.timeoutMinutes * 60_000,
      record: (stdout, stderr) => { writeFileSync(join(options.records, `${key}-${String(attempt)}-${String(round)}.jsonl`), stdout + (stderr ? `\n--- stderr ---\n${stderr}` : ''), 'utf8'); },
    });
    if (result.kind !== 'ok') {
      appendEvent(folder, { type: result.kind === 'fatal' ? 'fail' : result.kind, job: key, attempt, detail: { message: result.message, ...result.kind === 'fatal' ? { fatal: true } : {} } }, log);
      return result.kind;
    }
    session = result.session;
    const value = result.structured ?? parseJsonReply(result.reply);
    problems = options.validate(value);
    appendEvent(folder, { type: 'step', job: key, attempt, step: round + 1, detail: { ms: result.ms, costUsd: result.costUsd, usage: result.usage, problems: problems.length } }, log);
    if (!problems.length) {
      options.save(value);
      appendEvent(folder, { type: 'done', job: key, attempt }, log);
      return 'done';
    }
    if (!session) break;
    text = `你交的 JSON 有這些問題：\n${problems.map(each => `- ${each}`).join('\n')}\n\n其他判定不要改，只修正這些地方，照同一個 schema 整份重交。`;
  }
  appendEvent(folder, { type: 'fail', job: key, attempt, detail: { message: '補正後格式仍不合', problems } }, log);
  return 'fail';
}
