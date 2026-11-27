// 製卡視窗的直接製作（tasks/ai-direct.md §4～§6、src/obsidian/ai-cards-modal.ts）：用共用的 obsidian 替身開真的視窗，接真的製卡流程與假的 fetch。
// 替身不是 Obsidian 實機：FakeEl 在這個檔補上視窗用到的 DOM 方法（每個測試檔是自己的 Node 程序，補的只活在這裡）。畫面的樣子在 Windows 實機看。
import test from 'node:test';
import type { TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import type { MockReply } from '../../../packages/ai-client/src/testing.ts';
import { directJob } from '../src/core/ai/index.ts';
import { createObsidianStub, FakeEl } from './helpers/obsidian.ts';
import { form, lesson, load, ok, propsOf, reply } from './helpers/ai-direct.ts';

const root = fileURLToPath(new URL('../', import.meta.url));
const code = (await build({
  absWorkingDir: root, stdin: { contents: "export { wireAiCards } from './src/obsidian/ai-cards-modal.ts';", resolveDir: root, loader: 'ts' },
  bundle: true, format: 'cjs', platform: 'browser', target: 'es2022', write: false, external: ['obsidian'],
})).outputFiles[0].text;

interface El extends FakeEl {
  cls: string; type?: string; placeholder?: string; value: string; checked?: boolean; files?: File[];
  listeners?: Map<string, ((event: unknown) => void)[]>;
  fire(type: string, event?: unknown): void;
}
const proto = FakeEl.prototype as unknown as Record<string, unknown>;
proto.createEl = function (this: El, tag: string, options?: { text?: string; cls?: string; type?: string; placeholder?: string; attr?: Record<string, string> }): El {
  const el = new FakeEl(tag, options) as El;
  el.cls = options?.cls ?? '';
  el.type = options?.type;
  el.placeholder = options?.placeholder ?? options?.attr?.placeholder;
  el.value = '';
  this.children.push(el);
  return el;
};
proto.addEventListener = function (this: El, type: string, callback: (event: unknown) => void) { (this.listeners ??= new Map()).set(type, [...this.listeners.get(type) ?? [], callback]); };
proto.fire = function (this: El, type: string, event: unknown = {}) { for (const callback of this.listeners?.get(type) ?? []) callback(event); };
proto.click = function (this: El) { if (!this.disabled) this.fire('click'); };
proto.hide = function (this: El) { this.hidden = true; };
proto.show = function (this: El) { this.hidden = false; };
proto.toggleClass = function () {};
proto.querySelector = function (this: El, selector: string): El | null {
  const want = selector.replace(/^\./, '');
  for (const child of this.children as El[]) {
    if (child.cls.split(' ').includes(want)) return child;
    const found = (child as unknown as { querySelector(selector: string): El | null }).querySelector(selector);
    if (found) return found;
  }
  return null;
};

const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));
const all = (el: FakeEl): El[] => [el as El, ...el.children.flatMap(all)];
const texts = (el: FakeEl): string[] => all(el).map(each => each.text).filter(Boolean);
const button = (el: FakeEl, label: string): El | undefined => all(el).find(each => each.tag === 'button' && !each.hidden && each.text === label);
const textarea = (el: FakeEl): El | undefined => all(el).find(each => each.tag === 'textarea');
const pdf = (name = '英文 L3.pdf'): File => new File([new Uint8Array(lesson.data)], name);

interface Modal { contentEl: El; close(): void; isOpen: boolean }
/** 開一個製卡視窗：每次重新載入視窗的程式（貼到一半的回覆記在模組裡，測試之間不共用）。 */
async function open(t: TestContext, replies: MockReply[], options: Parameters<typeof load>[2] = {}) {
  const made = await load(t, replies, options);
  const stub = createObsidianStub({ desktop: true });
  let ribbon: () => void = () => {};
  const plugin = { app: stub.app, addCommand() {}, registerEvent() {}, register() {}, addRibbonIcon(_icon: string, _title: string, callback: () => void) { ribbon = callback; return { toggle() {} }; } };
  const { wireAiCards } = stub.load<{ wireAiCards: (plugin: unknown, host: unknown) => unknown }>(code);
  wireAiCards(plugin, { cards: () => made.cards, openNote() {}, notify() {}, now: () => Date.now(), pdfPages: () => Promise.resolve(12) });
  const openModal = (): Modal => { ribbon(); return stub.modals.at(-1) as unknown as Modal; };
  return { made, openModal };
}
/** 第一步填單元、選教材檔、按直接製作，等收完。 */
async function sendFromForm(modal: Modal): Promise<void> {
  const unit = all(modal.contentEl).find(each => each.tag === 'input' && (each.placeholder ?? '').includes('編號 名稱'));
  assert.ok(unit);
  unit.value = form.unit;
  unit.fire('input');
  const file = all(modal.contentEl).find(each => each.tag === 'input' && each.type === 'file');
  assert.ok(file);
  file.files = [pdf()];
  file.fire('change');
  await sleep(20);
  const send = button(modal.contentEl, '直接製作');
  assert.ok(send && !send.disabled, texts(modal.contentEl).join('|'));
  send.click();
  await sleep(60);
}
const isReceivedScreen = (modal: Modal): boolean => texts(modal.contentEl).some(each => each.startsWith('這次用了')) && !texts(modal.contentEl).includes('用的是（選填）');

void test('L2 R1 收到之後存成草稿在開始存之前被擋下，按「回上一步」：仍是收到的畫面，再存是 API 的快照', async t => {
  const { made, openModal } = await open(t, [ok(reply)]);
  const modal = openModal();
  await sendFromForm(modal);
  assert.ok(isReceivedScreen(modal), texts(modal.contentEl).join('|'));
  made.box.saved.failNext = 1;
  button(modal.contentEl, '存成草稿')?.click();
  await sleep(60);
  button(modal.contentEl, '回上一步')?.click();
  await sleep(10);
  assert.ok(isReceivedScreen(modal), texts(modal.contentEl).join('|'));
  assert.equal(textarea(modal.contentEl)?.value, reply);
  button(modal.contentEl, '存成草稿')?.click();
  await sleep(150);
  const { props } = propsOf(made.memory);
  assert.equal(props['接法'], 'API');
  assert.ok('教材檔' in props && '送出時間' in props);
});

void test('L2 R1 重開之後「接著看」，第一次存被擋下再「回上一步」：框裡還是收到的回覆', async t => {
  const first = await load(t, [ok(reply)]);
  assert.equal((await first.cards.direct(form, [lesson])).kind, 'received');
  const { made, openModal } = await open(t, [], { box: first.box, memory: first.memory });
  const modal = openModal();
  button(modal.contentEl, '接著看')?.click();
  await sleep(10);
  made.box.saved.failNext = 1;
  button(modal.contentEl, '存成草稿')?.click();
  await sleep(60);
  button(modal.contentEl, '回上一步')?.click();
  await sleep(10);
  assert.ok(isReceivedScreen(modal), texts(modal.contentEl).join('|'));
  assert.equal(textarea(modal.contentEl)?.value, reply);
  assert.equal(directJob(made.cards.jobs()[0])?.state, 'received');
});

void test('L2 R2、R4 收到的回覆檢查擋住，按「改用複製貼上」：框是空的；關掉重開是「接著貼回」，貼別處的回覆存成複製貼上的快照', async t => {
  const bad = `${reply}\n多出來的一行`;
  const { made, openModal } = await open(t, [ok(bad)]);
  const modal = openModal();
  await sendFromForm(modal);
  button(modal.contentEl, '改用複製貼上')?.click();
  await sleep(20);
  assert.equal(made.clipboard.length, 1);
  assert.equal(textarea(modal.contentEl)?.value, '', '框裡不留直接製作收到的那一份');
  modal.close();
  const again = openModal();
  assert.ok(button(again.contentEl, '接著貼回'), texts(again.contentEl).join('|'));
  assert.equal(button(again.contentEl, '接著看'), undefined);
  button(again.contentEl, '接著貼回')?.click();
  await sleep(10);
  const box = textarea(again.contentEl);
  assert.ok(box);
  box.value = reply;
  box.fire('input');
  button(again.contentEl, '檢查')?.click();
  button(again.contentEl, '存成草稿')?.click();
  await sleep(150);
  const { props } = propsOf(made.memory);
  assert.equal(props['接法'], '複製貼上');
  assert.equal('收到的回覆' in props, false);
});

void test('L2 R3 收到的回覆沒有 <<<完>>>：有「重送（會再計費一次）」與「改用複製貼上」，提示寫直接製作的做法；勾了確定照樣存成 API 的快照', async t => {
  const { made, openModal } = await open(t, [ok(reply.replace('\n<<<完>>>', ''))]);
  const modal = openModal();
  await sendFromForm(modal);
  assert.ok(button(modal.contentEl, '重送（會再計費一次）'), texts(modal.contentEl).join('|'));
  assert.ok(button(modal.contentEl, '改用複製貼上'));
  assert.ok(texts(modal.contentEl).some(each => each.includes('最後一行不是 <<<完>>>：AI 可能沒寫完')));
  assert.ok(!texts(modal.contentEl).some(each => each.includes('回 AI 那邊看它寫完了沒')));
  const confirm = all(modal.contentEl).find(each => each.tag === 'input' && each.type === 'checkbox');
  assert.ok(confirm && texts(modal.contentEl).includes('我確定這一段是完整的'));
  confirm.checked = true;
  confirm.fire('change');
  button(modal.contentEl, '存成草稿')?.click();
  await sleep(150);
  assert.equal(propsOf(made.memory).props['接法'], 'API');
});

void test('實機第 3 點 送出中按關閉、在「要取消這一次嗎？」按「取消這一次」：視窗關掉，工作留在清單（可以重送）', async t => {
  const { made, openModal } = await open(t, [{ ...ok(reply), headersDelayMs: 5_000 }]);
  const modal = openModal();
  await sendFromForm(modal);
  modal.close();
  assert.ok(modal.isOpen, '送出中先問，不直接關');
  assert.ok(texts(modal.contentEl).some(each => each.startsWith('要取消這一次嗎')), texts(modal.contentEl).join('|'));
  button(modal.contentEl, '取消這一次')?.click();
  await sleep(60);
  assert.equal(modal.isOpen, false, '家長本來就是要關視窗');
  assert.equal(made.cards.sending(), false);
  assert.equal(directJob(made.cards.jobs()[0])?.kind, 'cancelled');
});
