// 測試共用：讀 fixtures/、假的金鑰與時鐘。
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { AiErrorKind, Clock, EndpointRef, StopReason, Usage } from '../src/index.ts';

const FIXTURES = join(import.meta.dirname, '..', 'fixtures');
/** 假金鑰：避開 secretlint 認得的樣式。 */
export const KEY = 'test-key-not-real-0123456789';

interface StreamCase {
  file: string;
  headers?: Record<string, string>;
  text?: string;
  stopReason: StopReason;
  rawStopReason?: string;
  usage?: Usage;
  resolvedModel?: string;
  requestId?: string | null;
  responseId?: string;
  reportedCost?: number;
}

export interface Case {
  dir: string;
  dialect: string;
  source: string;
  endpoint: EndpointRef;
  model: string;
  request: {
    url: string;
    authHeader: string;
    authValue: string;
    headers: Record<string, string>;
    textBody: Record<string, unknown>;
    imagePart: unknown;
    pdfPart: unknown;
    maxOutputTokens: Record<string, unknown>;
    reasoningHigh: Record<string, unknown>;
  };
  stream: StreamCase;
  json: { body: unknown; text: string; stopReason: StopReason };
  length: StreamCase;
  filter: StreamCase;
  streamError: { file: string; kind: AiErrorKind; providerCode: string };
  errors: { status: number; headers?: Record<string, string>; body: unknown; kind: AiErrorKind; retryAfterMs?: number }[];
  check: { status: number; body: unknown; models: string[] | null };
}

export function loadCases(): Case[] {
  return readdirSync(FIXTURES, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => ({ dir: join(FIXTURES, d.name), ...(JSON.parse(readFileSync(join(FIXTURES, d.name, 'case.json'), 'utf8')) as Omit<Case, 'dir'>) }));
}

export const readSse = (c: Case, file: string): string => readFileSync(join(c.dir, file), 'utf8');

/** 不真的等的時鐘：記下每次要等多久。 */
export function instantClock(start = Date.parse('2026-11-25T00:00:00Z')): Partial<Clock> & { sleeps: number[] } {
  const sleeps: number[] = [];
  return {
    sleeps,
    now: () => start,
    sleep: (ms: number) => { sleeps.push(ms); return Promise.resolve(); },
    random: () => 0.5,
  };
}

/** a 是否包含 b 的每一個欄位（陣列要一樣長、逐項包含）。 */
export function contains(a: unknown, b: unknown): boolean {
  if (Array.isArray(b)) return Array.isArray(a) && a.length === b.length && b.every((item, i) => contains(a[i], item));
  if (typeof b === 'object' && b !== null) {
    if (typeof a !== 'object' || a === null) return false;
    return Object.entries(b).every(([k, v]) => contains((a as Record<string, unknown>)[k], v));
  }
  return a === b;
}

/** 在 tree 裡找一個包含 part 的節點。 */
export function findPart(tree: unknown, part: unknown): boolean {
  if (contains(tree, part)) return true;
  if (Array.isArray(tree)) return tree.some(t => findPart(t, part));
  if (typeof tree === 'object' && tree !== null) return Object.values(tree).some(t => findPart(t, part));
  return false;
}
