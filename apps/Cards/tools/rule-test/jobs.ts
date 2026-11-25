// 比較測試工具：生成的工作與事件檔（任務說明 tasks/rule-test-tool.md §5-4）。工作＝組 × 課 × 生成器 × 第幾份；
// 事件.jsonl 只追加（開始、每一步、完成、無效、失敗、逾時、額度用完、中斷、停下），狀態都由事件推出，不另存一份會不同步的狀態。
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { lessonsOf, type AdapterKind } from './config.ts';
import type { Folder } from './folder.ts';
import type { FrozenStep } from './freeze.ts';

export interface Job {
  key: string;
  group: string;
  lesson: string;
  generator: string;
  kind: AdapterKind;
  copy: number;
  /** 補無效原稿的那一份（§4-2）。 */
  replacement: boolean;
  steps: FrozenStep[];
}

type EventType = 'start' | 'step' | 'done' | 'invalid' | 'fail' | 'timeout' | 'quota' | 'interrupted' | 'stop';
export interface JobEvent { t: string; type: EventType; job?: string; attempt?: number; step?: number; detail?: Record<string, unknown> }

/** 同一份工作最多試幾次（失敗、逾時、中斷都算一次）；之後停在 failed，由人決定。 */
const MAX_ATTEMPTS = 3;

/** 事件檔：生成的在 生成/事件.jsonl；評分等其他步驟傳自己的檔（測試資料夾裡的相對路徑）。 */
const GENERATE_LOG = join('生成', '事件.jsonl');

export function appendEvent(folder: Folder, event: Omit<JobEvent, 't'>, log = GENERATE_LOG, now = new Date()): void {
  const file = join(folder.root, log);
  mkdirSync(dirname(file), { recursive: true });
  appendFileSync(file, JSON.stringify({ t: now.toISOString(), ...event }) + '\n', 'utf8');
}

/** 讀事件；最後一行沒寫完（行程被中斷）就略過那一行。 */
export function readEvents(folder: Folder, log = GENERATE_LOG): JobEvent[] {
  const file = join(folder.root, log);
  if (!existsSync(file)) return [];
  return readFileSync(file, 'utf8').split('\n').filter(Boolean).flatMap(line => {
    try { return [JSON.parse(line) as JobEvent]; } catch { return []; }
  });
}

type JobStatus = 'pending' | 'running' | 'done' | 'invalid' | 'retry' | 'failed';
export interface JobState { status: JobStatus; attempts: number; last: JobEvent | null }

const TERMINAL: readonly EventType[] = ['done', 'invalid', 'fail', 'timeout', 'quota', 'interrupted'];

export function jobState(events: readonly JobEvent[], key: string): JobState {
  const mine = events.filter(event => event.job === key && (event.type === 'start' || TERMINAL.includes(event.type)));
  const attempts = mine.filter(event => event.type === 'start').length;
  const last = mine.at(-1) ?? null;
  if (!last) return { status: 'pending', attempts, last };
  if (last.type === 'done' || last.type === 'invalid') return { status: last.type, attempts, last };
  if (last.type === 'start') return { status: 'running', attempts, last };
  return { status: attempts >= MAX_ATTEMPTS ? 'failed' : 'retry', attempts, last };
}

const jobKey = (group: string, lesson: string, generator: string, copy: number): string => `${group}-${lesson}-${generator}-${String(copy)}`;

/**
 * 全部的工作：設定的份數，加上補無效原稿的（同一組、課、生成器，最多補到和份數一樣多份，免得規則本身就交不出有效原稿時一直補）。
 * 不同的工作算出同一個名字（名稱裡的 - 剛好湊成一樣）就停下。
 */
export function planJobs(folder: Folder, steps: readonly FrozenStep[], events: readonly JobEvent[]): Job[] {
  const jobs: Job[] = [];
  for (const generator of folder.config.generators) {
    for (const lesson of lessonsOf(folder.config, generator)) {
      for (const group of folder.config.groups) {
        const mine = steps.filter(step => step.group === group.name && step.lesson === lesson.code).sort((a, b) => a.step - b.step);
        if (!mine.length) throw Error(`凍結的提示裡沒有「${group.name}」在課「${lesson.code}」的提示（設定在凍結之後改過？）`);
        const make = (copy: number, replacement: boolean): Job => ({ key: jobKey(group.name, lesson.code, generator.name, copy), group: group.name, lesson: lesson.code, generator: generator.name, kind: generator.kind, copy, replacement, steps: mine });
        const base = Array.from({ length: generator.count }, (_, i) => make(i + 1, false));
        jobs.push(...base);
        let next = generator.count, invalid = base.filter(job => jobState(events, job.key).status === 'invalid').length;
        while (invalid > 0 && next < generator.count * 2) {
          const extra = make(++next, true);
          jobs.push(extra);
          invalid += (jobState(events, extra.key).status === 'invalid' ? 1 : 0) - 1;
        }
      }
    }
  }
  const keys = jobs.map(job => job.key);
  const clash = keys.find((key, i) => keys.indexOf(key) !== i);
  if (clash) throw Error(`兩份工作的名字一樣：${clash}（組、課或生成器的名稱裡的 - 湊成一樣，改一個名稱）`);
  return jobs;
}
