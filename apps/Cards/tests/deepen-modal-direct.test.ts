// 加深視窗的直接製作（tasks/ai-direct.md §9、src/obsidian/deepen-modal.ts）：用共用的 obsidian 替身開真的視窗，接真的加深流程與假的 fetch。
// 替身不是 Obsidian 實機；畫面的樣子在 Windows 實機看。
import test from 'node:test';
import type { TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import type { MockReply } from '../../../packages/ai-client/src/testing.ts';
import { directJob } from '../src/core/ai/index.ts';
import { createObsidianStub } from './helpers/obsidian.ts';
import { all, button, sleep, textarea, texts } from './helpers/modal-dom.ts';
import type { El } from './helpers/modal-dom.ts';
import { ok, unauthorized } from './helpers/ai-direct.ts';
import { DECK, lesson, load, propsOf, REPLY } from './helpers/deepen-direct.ts';

const root = fileURLToPath(new URL('../', import.meta.url));
const code = (await build({
  absWorkingDir: root, stdin: { contents: "export { wireDeepen } from './src/obsidian/deepen-modal.ts';", resolveDir: root, loader: 'ts' },
  bundle: true, format: 'cjs', platform: 'browser', target: 'es2022', write: false, external: ['obsidian'],
})).outputFiles[0].text;

interface Modal { contentEl: El; close(): void; isOpen: boolean }
const pdf = (name = '自然 2-1 補充.pdf'): File => new File([new Uint8Array(lesson.data)], name);
const line = (modal: Modal): string | undefined => texts(modal.contentEl).find(each => each.startsWith('會送出：'));

/** 開一個加深視窗：每次重新載入視窗的程式（貼到一半的回覆記在模組裡，測試之間不共用）。 */
async function open(t: TestContext, replies: MockReply[], options: Parameters<typeof load>[2] = {}) {
  const made = await load(t, replies, options);
  const stub = createObsidianStub({ desktop: true });
  const unload: (() => void)[] = [];
  const settings = { opened: 0 };
  const notes: string[] = [];
  const plugin = { app: stub.app, addCommand() {}, registerEvent() {}, register(callback: () => void) { unload.push(callback); } };
  const { wireDeepen } = stub.load<{ wireDeepen: (plugin: unknown, host: unknown) => { open(path: string): void } }>(code);
  const wired = wireDeepen(plugin, {
    deepen: () => made.deepen, read: () => Promise.resolve(made.memory.texts.get(DECK) ?? null), openNote() {}, notify: (text: string) => { notes.push(text); },
    now: () => Date.now(), pdfPages: () => Promise.resolve(4), openSettings: () => { settings.opened++; },
  });
  const openModal = async (): Promise<Modal> => { wired.open(DECK); await sleep(20); return stub.modals.at(-1) as unknown as Modal; };
  return { made, openModal, settings, notes, unload: () => { for (const each of unload) each(); } };
}
/** 第一步選教材檔（選填）、按直接製作，等收完。 */
async function sendFromForm(modal: Modal, files: File[] = [pdf()]): Promise<void> {
  if (files.length) {
    const file = all(modal.contentEl).find(each => each.tag === 'input' && each.type === 'file');
    assert.ok(file);
    file.files = files;
    file.fire('change');
    await sleep(20);
  }
  const send = button(modal.contentEl, '直接製作');
  assert.ok(send && !send.disabled, texts(modal.contentEl).join('|'));
  send.click();
  await sleep(80);
}
const isReceivedScreen = (modal: Modal): boolean => texts(modal.contentEl).some(each => each.startsWith('這次用了')) && !texts(modal.contentEl).includes('用的是（選填）');

void test('§9 加深視窗：教材檔選填，不選也能直接製作；選了，送出前那一行列出檔；收到的放進框、自動檢查，寫進卡組是 API 的快照', async t => {
  const { made, openModal, notes } = await open(t, [ok(REPLY)]);
  const modal = await openModal();
  // 不選教材檔：送出前那一行只有規則與任務段，可以按。
  assert.match(line(modal) ?? '', /^會送出：規則與任務段約 [\d,]+ 字；送到 Gemini/, texts(modal.contentEl).join('|'));
  assert.ok(texts(modal.contentEl).some(each => each.includes('加深通常不用附課本')));
  // 改方向：那一行照新的提示重算（字數變多）。
  const before = line(modal);
  const direction = all(modal.contentEl).find(each => each.tag === 'input' && (each.placeholder ?? '').includes('這次不要課外'));
  assert.ok(direction);
  direction.value = '這次多一點比較題，特別是溫標之間的換算與日常例子';
  direction.fire('input');
  assert.notEqual(line(modal), before);
  await sendFromForm(modal);
  assert.ok(isReceivedScreen(modal), texts(modal.contentEl).join('|'));
  assert.ok(!button(modal.contentEl, '再複製一次提示'), '收到的不再複製');
  assert.equal(textarea(modal.contentEl)?.value, REPLY);
  assert.ok(texts(modal.contentEl).some(each => each.startsWith('新的學習目標 1')), '自動檢查過');
  button(modal.contentEl, '寫進卡組')?.click();
  await sleep(150);
  assert.equal(modal.isOpen, false);
  assert.ok(notes.some(each => each.startsWith('已寫進卡組')));
  const { props } = propsOf(made.memory);
  assert.equal(props['接法'], 'API');
  assert.deepEqual(props['教材檔'], [`${lesson.sha256} 4頁 自然 2-1 補充.pdf`]);
  assert.equal(props['教材說明'], undefined);
});

void test('§9 收到的回覆沒有 <<<完>>>：提示寫直接製作的說法，有「重送（會再計費一次）」與「改用複製貼上」；勾了確定照樣寫成 API 的快照', async t => {
  const cut = REPLY.replace(/\n<<<完>>>$/, '');
  const { made, openModal } = await open(t, [ok(cut)]);
  const modal = await openModal();
  await sendFromForm(modal, []);
  assert.ok(isReceivedScreen(modal), texts(modal.contentEl).join('|'));
  assert.ok(texts(modal.contentEl).some(each => each.includes('AI 可能沒寫完（例如回答太長被截斷）')), texts(modal.contentEl).join('|'));
  assert.ok(button(modal.contentEl, '重送（會再計費一次）'));
  assert.ok(button(modal.contentEl, '改用複製貼上'));
  assert.ok(button(modal.contentEl, '寫進卡組')?.disabled);
  // 勾選框在「我確定這一段是完整的」那一行（第一步的點選填空已經不在畫面上）。
  assert.ok(texts(modal.contentEl).includes('我確定這一段是完整的'));
  const sure = all(modal.contentEl).find(each => each.tag === 'input' && each.type === 'checkbox');
  assert.ok(sure);
  sure.checked = true;
  sure.fire('change');
  button(modal.contentEl, '寫進卡組')?.click();
  await sleep(150);
  assert.equal(propsOf(made.memory).props['接法'], 'API');
});

void test('§9 送不成：失敗畫面有「打開設定頁」（金鑰不對）；按「重送」先到重送的畫面，再按一次才送；收到之後照樣寫進卡組', async t => {
  const { made, openModal, settings } = await open(t, [unauthorized, ok(REPLY)]);
  const modal = await openModal();
  await sendFromForm(modal);
  assert.ok(texts(modal.contentEl).some(each => each.startsWith('國二上自然 2-1 溫度：')), texts(modal.contentEl).join('|'));
  assert.ok(button(modal.contentEl, '取消這次加深'));
  button(modal.contentEl, '打開設定頁')?.click();
  assert.equal(settings.opened, 1);
  assert.equal(modal.isOpen, false);
  // 關掉再開：同一篇是「上一次直接製作沒有成功」，工作還在。
  const again = await openModal();
  assert.ok(texts(again.contentEl).some(each => each.includes('上一次直接製作沒有成功')), texts(again.contentEl).join('|'));
  button(again.contentEl, '重送')?.click();
  await sleep(10);
  assert.equal(made.fetch.requests.length, 1, '還沒送');
  assert.match(line(again) ?? '', /^會送出：自然 2-1 補充\.pdf（4 頁）、規則與任務段約/, texts(again.contentEl).join('|'));
  button(again.contentEl, '重送')?.click();
  await sleep(100);
  assert.equal(made.fetch.requests.length, 2);
  assert.ok(isReceivedScreen(again), texts(again.contentEl).join('|'));
});

void test('§9 重開 Obsidian 之後：上一次有附教材的要重選才能重送；送出後沒收到回覆的寫可能已經計費、重送寫會再計費', async t => {
  const first = await load(t, [unauthorized]);
  assert.equal((await first.deepen.direct(DECK, '', '', undefined, [lesson])).kind, 'failed');
  const { made, openModal } = await open(t, [ok(REPLY)], { box: first.box, memory: first.memory });
  const modal = await openModal();
  button(modal.contentEl, '重送')?.click();
  await sleep(10);
  assert.ok(button(modal.contentEl, '重送')?.disabled, '還沒選教材不能送');
  assert.ok(texts(modal.contentEl).some(each => each.includes('要重新選一次')));
  const file = all(modal.contentEl).find(each => each.tag === 'input' && each.type === 'file');
  assert.ok(file);
  file.files = [pdf()];
  file.fire('change');
  await sleep(20);
  assert.ok(texts(modal.contentEl).includes('和上一次送的檔相同。'), texts(modal.contentEl).join('|'));
  button(modal.contentEl, '重送')?.click();
  await sleep(100);
  assert.equal(made.fetch.requests.length, 1);
  assert.ok(isReceivedScreen(modal), texts(modal.contentEl).join('|'));

  // 送出中被關掉（工作停在 sending）：重開寫「可能已經送出並計費」。
  const box = first.box;
  const job = made.deepen.jobOf(DECK)!;
  box.saved.jobs = [{ ...job, api: { ...directJob(job)!, state: 'sending', received: null } }];
  const reopened = await open(t, [], { box, memory: first.memory });
  const held = await reopened.openModal();
  assert.ok(texts(held.contentEl).some(each => each.includes('沒有收到回覆，可能已經送出並計費')), texts(held.contentEl).join('|'));
  assert.ok(button(held.contentEl, '重送（會再計費一次）'));
});

void test('§9 送出中按關閉：先問；按「取消這一次」視窗關掉、工作留著（重開可以重送）；停用外掛直接取消、不問', async t => {
  const { made, openModal, unload } = await open(t, [{ ...ok(REPLY), headersDelayMs: 5_000 }, { ...ok(REPLY), headersDelayMs: 5_000 }]);
  const modal = await openModal();
  await sendFromForm(modal, []);
  assert.ok(made.deepen.sending());
  modal.close();
  assert.ok(modal.isOpen, '送出中先問，不直接關');
  assert.ok(texts(modal.contentEl).some(each => each.startsWith('要取消這一次嗎')), texts(modal.contentEl).join('|'));
  button(modal.contentEl, '取消這一次')?.click();
  await sleep(60);
  assert.equal(modal.isOpen, false);
  assert.equal(made.deepen.sending(), false);
  assert.equal(directJob(made.deepen.jobOf(DECK)!)?.kind, 'cancelled');

  const again = await openModal();
  button(again.contentEl, '重送')?.click();
  await sleep(10);
  button(again.contentEl, '重送')?.click();
  await sleep(30);
  assert.ok(made.deepen.sending());
  unload();
  await sleep(60);
  assert.equal(again.isOpen, false);
  assert.equal(made.deepen.sending(), false);
});

void test('§9 沒設金鑰：直接製作按不了、寫原因，有「打開設定頁」；複製提示照常是主按鈕', async t => {
  const { openModal, settings } = await open(t, [], { key: { ok: false, why: 'unset' } });
  const modal = await openModal();
  assert.ok(button(modal.contentEl, '直接製作')?.disabled);
  assert.ok(!line(modal));
  button(modal.contentEl, '打開設定頁')?.click();
  assert.equal(settings.opened, 1);
  assert.equal(modal.isOpen, false);
});

void test('§9 送不成按「改用複製貼上」：同一份提示進剪貼簿，框是空的、說明換成自己附教材；貼回存成複製貼上的快照', async t => {
  const { made, openModal } = await open(t, [unauthorized]);
  const modal = await openModal();
  await sendFromForm(modal, []);
  button(modal.contentEl, '改用複製貼上')?.click();
  await sleep(20);
  assert.equal(made.clipboard.length, 1);
  assert.ok(texts(modal.contentEl).some(each => each.startsWith('已複製同一份提示')), texts(modal.contentEl).join('|'));
  const box = textarea(modal.contentEl);
  assert.ok(box && box.value === '');
  box.value = REPLY;
  box.fire('input');
  button(modal.contentEl, '檢查')?.click();
  button(modal.contentEl, '寫進卡組')?.click();
  await sleep(150);
  assert.equal(propsOf(made.memory).props['接法'], '複製貼上');
});

void test('§9 手機或沒有直接製作的裝置：沒有教材檔、沒有直接製作，只有複製提示', async t => {
  const { openModal } = await open(t, [], { direct: false });
  const modal = await openModal();
  assert.ok(!button(modal.contentEl, '直接製作'));
  assert.ok(!all(modal.contentEl).some(each => each.tag === 'input' && each.type === 'file'));
  assert.ok(button(modal.contentEl, '複製提示'));
});
