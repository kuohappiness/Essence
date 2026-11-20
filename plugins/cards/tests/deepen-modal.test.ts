import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { createObsidianStub, type FakeEl } from './helpers/obsidian.ts';

// 加深視窗打開時的第一筆讀取（AI 製卡第 2 批 L2 R17）：共用的 obsidian 替身，不是 Obsidian 實機。

const root = fileURLToPath(new URL('../', import.meta.url));
const code = (await build({
  absWorkingDir: root, stdin: { contents: "export { wireDeepen } from './src/obsidian/deepen-modal.ts';", resolveDir: root, loader: 'ts' },
  bundle: true, format: 'cjs', platform: 'browser', target: 'es2022', write: false, external: ['obsidian'],
})).outputFiles[0].text;

const PATH = 'Essence Cards/學業/國二上/自然/國二上自然 2-1 溫度.md';
const PENDING = '- 目標 ^abc234\n    - 問 :: 答\n\n> [!note] 加深的學習目標\n> - 新的目標 ^def234\n>     - 問 :: 答\n';
const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));
const texts = (el: FakeEl): string[] => [el.text, ...el.children.flatMap(texts)].filter(Boolean);
const button = (el: FakeEl, label: string): FakeEl | undefined => el.querySelectorAll('button').find(each => each.text === label);

function setup(read: () => Promise<string | null>) {
  const stub = createObsidianStub();
  const plugin = { app: stub.app, addCommand() {}, registerEvent() {}, register() {} };
  const deepen = { jobOf: () => null, ready: () => ({ ok: false, why: '還不能加深' }) };
  const { wireDeepen } = stub.load<{ wireDeepen: (plugin: unknown, host: unknown) => { open(path: string): void } }>(code);
  const wired = wireDeepen(plugin, { deepen: () => deepen, read, openNote() {}, notify() {}, readWait: 20 });
  wired.open(PATH);
  const modal = stub.modals.at(-1) as unknown as { contentEl: FakeEl; close(): void; isOpen: boolean };
  return { modal };
}

void test('L2 R17 打開時讀不到、等不到：停在可以重試的訊息；重試讀得到就往下走', async () => {
  let attempt = 0;
  const { modal } = setup(() => ++attempt === 1 ? new Promise(() => {}) : Promise.resolve(PENDING));
  await sleep(60);
  assert.ok(texts(modal.contentEl).some(each => each.includes('讀不到這一篇')), texts(modal.contentEl).join('|'));
  button(modal.contentEl, '重試')!.click();
  await sleep(10);
  assert.ok(texts(modal.contentEl).some(each => each.includes('上一次加深的結果還沒審完')), texts(modal.contentEl).join('|'));
});

void test('L2 R19 讀到空（剛被移走或同步中看不到）：同一個可以重試的訊息；檔回來後重試往下走', async () => {
  let attempt = 0;
  const { modal } = setup(() => Promise.resolve(++attempt === 1 ? null : PENDING));
  await sleep(10);
  assert.ok(texts(modal.contentEl).some(each => each.includes('讀不到這一篇')), texts(modal.contentEl).join('|'));
  button(modal.contentEl, '重試')!.click();
  await sleep(10);
  assert.ok(texts(modal.contentEl).some(each => each.includes('上一次加深的結果還沒審完')), texts(modal.contentEl).join('|'));
});

void test('L2 R17 讀取丟錯：同一個訊息；等不到之後才回來的結果不改視窗', async () => {
  const failed = setup(() => Promise.reject(Error('EBUSY')));
  await sleep(10);
  assert.ok(texts(failed.modal.contentEl).some(each => each.includes('讀不到這一篇')));
  let late: (text: string) => void = () => {};
  const slow = setup(() => new Promise(resolve => { late = resolve; }));
  await sleep(60);
  late(PENDING);
  await sleep(10);
  assert.ok(texts(slow.modal.contentEl).some(each => each.includes('讀不到這一篇')));
  assert.ok(!texts(slow.modal.contentEl).some(each => each.includes('還沒審完')));
});
