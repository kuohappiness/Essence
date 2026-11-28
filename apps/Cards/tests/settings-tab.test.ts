import test from 'node:test';
import type { TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { createObsidianStub, type FakeEl, type FakeSetting, type StubOptions } from './helpers/obsidian.ts';
import { desktopOnly, embedRules } from '../tools/build.mjs';

// 設定分頁與 main 的接線（tasks/settings-page.md §5、§7 第 24～29 點）：正式建置的程式碼配 obsidian 替身，只測接線，真的畫面在 Windows 實機（§8）。

const root = fileURLToPath(new URL('../', import.meta.url));
const code = (await build({
  absWorkingDir: root, entryPoints: ['src/main.ts'], bundle: true, format: 'cjs', platform: 'browser', target: 'es2022', plugins: [desktopOnly(root)],
  external: ['obsidian', '@codemirror/state', '@codemirror/view'], write: false, define: { 'process.env.NODE_ENV': '"production"', DEV: 'false', BUILD: '"0.0.1+test"', CARD_RULES: JSON.stringify(JSON.stringify(await embedRules())) },
})).outputFiles[0].text;

const deck = { 'Essence Cards/a.md': '---\n年級學期: 國二上\n科目: 自然\n單元: "1"\n---\n- 目標 ^aaaaaa\n    - Q :: A\n' };
interface StateLike { ready(): Promise<unknown>; currentSettings(): { settings: { capMinutes: number }; known: boolean }; today(): object }
interface PluginLike { onload(): void; onunload(): void; onExternalSettingsChange(): void; state: StateLike | null }
interface TabLike { containerEl: FakeEl; display(): void }

function quiet(t: TestContext): void {
  const original = console.error;
  console.error = () => {};
  t.after(() => { console.error = original; });
}
const settle = async (): Promise<void> => { for (let i = 0; i < 12; i++) await new Promise<void>(resolve => { setImmediate(resolve); }); };

async function open(t: TestContext, options: Omit<StubOptions, 'texts'> = {}) {
  quiet(t);
  const stub = createObsidianStub({ ...options, texts: deck });
  const { default: Plugin } = stub.load<{ default: new (app: unknown, manifest: unknown) => PluginLike }>(code);
  const plugin = new Plugin(stub.app, { id: 'essence-cards', version: '0.0.1' });
  t.after(() => { plugin.onunload(); });
  plugin.onload();
  const beforeReady = stub.data.loads;
  stub.layoutReady();
  await plugin.state?.ready();
  await settle();
  const tab = stub.settingTabs[0] as TabLike;
  tab.containerEl.shown = true;
  tab.display();
  await settle();
  const row = (name: string): FakeSetting => {
    const found = tab.containerEl.rows.find(item => item.name === name);
    assert.ok(found, '找不到這一列：' + name);
    return found;
  };
  return { ...stub, plugin, tab, row, beforeReady };
}
const CAP = '每日時間上限', RETENTION = '目標保持率', COUNTDOWN = '考試倒數', SEMESTER = '目前學期';
/** 設定檔（tasks/settings-vault-file.md §1）：設定存在這裡，data.json 只讀不寫。 */
const SETTINGS = 'Essence Cards/設定.json';
const saved = (h: { text: (path: string) => string | undefined }): unknown => { const text = h.text(SETTINGS); return text === undefined ? undefined : JSON.parse(text); };

void test('選項與預設（D-104）', async t => {
  const { row } = await open(t);
  assert.deepEqual(row(CAP).dropdown?.options.map(option => option.label), ['5 分鐘', '10 分鐘', '15 分鐘', '20 分鐘', '30 分鐘', '45 分鐘', '60 分鐘', '75 分鐘', '90 分鐘']);
  assert.deepEqual(row(RETENTION).dropdown?.options.map(option => option.label), ['70%', '75%', '80%', '85%', '90%', '95%']);
  const semesters = row(SEMESTER).dropdown?.options.map(option => option.label) ?? [];
  assert.equal(semesters.length, 25);
  assert.equal(semesters[0], '未設定');
  assert.equal(semesters[1], '小一上');
  assert.equal(semesters[24], '高三下');
  assert.equal(row(CAP).dropdown?.value, '30');
  assert.equal(row(RETENTION).dropdown?.value, '0.8');
  assert.equal(row(SEMESTER).dropdown?.value, '');
  assert.equal(row(COUNTDOWN).toggle?.value, true);
});

void test('分區的順序：複習、學期、（手機的）AI 製卡或（電腦的）AI 連線、備份；文字不寫角色（D-156）', async t => {
  const { tab, row } = await open(t);
  assert.deepEqual(tab.containerEl.rows.filter(item => item.heading).map(item => item.name), ['複習', '學期', 'AI 製卡', '備份']);
  const desktop = await open(t, { desktop: true });
  assert.deepEqual(desktop.tab.containerEl.rows.filter(item => item.heading).map(item => item.name), ['複習', '學期', 'AI 連線', '備份']);
  const words = (el: FakeEl): string => el.text + el.children.map(words).join('');
  const all = tab.containerEl.rows.map(item => item.name + item.desc + words(item.nameEl) + words(item.descEl)).join('\n');
  assert.ok(!/給家長|學生/.test(all), all);
  assert.match(words(row(RETENTION).descEl), /預計還記得的比例/);
});

void test('手機的製卡開關（D-226 第 1 點、tasks/phone-cards.md §2-1）：預設關；打開先問，取消或關掉視窗維持關；打開後命令與圖示出現，關掉立刻不見、開著的視窗關掉', async t => {
  const h = await open(t);
  const visible = (): string[] => h.ribbons.filter(ribbon => ribbon.el.style.display !== 'none').map(ribbon => ribbon.title);
  const command = h.commands.get('ai-cards') as { checkCallback: (checking: boolean) => boolean };
  const toggle = h.row('在這台裝置製卡').toggle!;
  assert.equal(toggle.value, false);
  assert.equal(command.checkCallback(true), false);
  assert.ok(!visible().includes('Essence Cards：AI 製卡'));
  const answer = (text: string | null): void => {
    const modal = h.modals.at(-1)!;
    assert.equal(modal.titleEl.text, '在這台裝置打開製卡？');
    assert.match(modal.contentEl.children[0].text, /孩子複習用的手機或平板不要打開/);
    if (text === null) { modal.close(); return; }
    modal.contentEl.querySelectorAll('button').find(button => button.text === text)!.click();
    assert.equal(modal.isOpen, false);
  };
  // 取消、關掉視窗：不存，開關回到關。
  for (const how of ['取消', null]) {
    toggle.choose(true);
    answer(how);
    assert.equal(toggle.value, false);
    assert.equal(h.storage('essence-cards-phone-cards'), null);
    assert.equal(command.checkCallback(true), false);
  }
  toggle.choose(true);
  answer('打開');
  assert.equal(toggle.value, true);
  assert.equal(h.storage('essence-cards-phone-cards'), true);
  assert.equal(command.checkCallback(true), true);
  assert.ok(visible().includes('Essence Cards：AI 製卡'));
  // 打開 AI 製卡的視窗，再關掉開關：視窗關掉，命令與圖示不見；關掉不用問。
  const before = h.modals.length;
  command.checkCallback(false);
  const ai = h.modals[before];
  assert.equal(ai.titleEl.text, 'AI 製卡');
  assert.equal(ai.isOpen, true);
  toggle.choose(false);
  assert.equal(h.modals.length, before + 1, '關掉不跳確認');
  assert.equal(ai.isOpen, false);
  assert.equal(h.storage('essence-cards-phone-cards'), false);
  assert.equal(command.checkCallback(true), false);
  assert.ok(!visible().includes('Essence Cards：AI 製卡'));
});

void test('預覽時可以留回饋（tasks/card-feedback.md §3-4）：接在自動展開答案後面；預設關、壞值也是關；只存這台裝置，不寫設定檔', async t => {
  const h = await open(t);
  const names = h.tab.containerEl.rows.map(item => item.name);
  assert.equal(names.indexOf('預覽時可以留回饋'), names.indexOf('預覽時自動展開答案') + 1);
  const row = h.row('預覽時可以留回饋');
  assert.match(row.desc, /可以用、要改、不要這張/);
  assert.match(row.desc, /紀錄\/回饋\//);
  assert.match(row.desc, /只影響這台裝置/);
  assert.equal(row.toggle?.value, false);
  const before = saved(h);
  row.toggle?.choose(true);
  assert.equal(h.storage('essence-cards-preview-feedback'), true);
  row.toggle?.choose(false);
  assert.equal(h.storage('essence-cards-preview-feedback'), false);
  await settle();
  assert.deepEqual(saved(h), before, '設定檔不動');
  const broken = await open(t, { localStorage: { 'essence-cards-preview-feedback': 'yes' } });
  assert.equal(broken.row('預覽時可以留回饋').toggle?.value, false);
});

void test('改上限：存進設定檔、data.json 不動，排程馬上照新的值', async t => {
  const h = await open(t, { data: { foo: 1 } });
  assert.equal(saved(h), undefined, '載入時不建立');
  h.row(CAP).dropdown?.choose('5');
  await settle();
  assert.deepEqual(saved(h), { foo: 1, capMinutes: 5, legacy: {} });
  assert.deepEqual(h.data.content, { foo: 1 });
  assert.equal(h.data.saves, 0);
  assert.equal(h.plugin.state?.currentSettings().settings.capMinutes, 5);
  assert.equal(h.row(CAP).dropdown?.value, '5');
});

void test('存過才有恢復預設；按了欄位不見、選單回到預設', async t => {
  const none = await open(t);
  for (const name of [CAP, RETENTION, COUNTDOWN]) assert.equal(none.row(name).extras.length, 0, name);

  const h = await open(t, { data: { capMinutes: 45, examCountdown: false } });
  assert.equal(h.row(CAP).extras.length, 1);
  assert.equal(h.row(COUNTDOWN).extras.length, 1);
  assert.equal(h.row(RETENTION).extras.length, 0);
  assert.equal(h.row(COUNTDOWN).toggle?.value, false);
  h.row(COUNTDOWN).extras[0].click();
  await settle();
  assert.deepEqual(saved(h), { capMinutes: 45, legacy: { capMinutes: 45, examCountdown: false } });
  assert.equal(h.row(COUNTDOWN).toggle?.value, true);
  assert.equal(h.row(COUNTDOWN).extras.length, 0);
});

void test('選學期記下選的那一天；選未設定就刪掉', async t => {
  const h = await open(t);
  h.row(SEMESTER).dropdown?.choose('國二上');
  await settle();
  const picked = saved(h) as { semester: string; semesterSetOn: string };
  assert.equal(picked.semester, '國二上');
  assert.match(picked.semesterSetOn, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(h.row(SEMESTER).dropdown?.value, '國二上');
  h.row(SEMESTER).dropdown?.choose('');
  await settle();
  assert.deepEqual(saved(h), { legacy: null });
});

void test('寫不進去：有通知、選單回到實際的值', async t => {
  const h = await open(t, { data: { capMinutes: 45 }, failWrite: path => path === SETTINGS });
  const dropdown = h.row(CAP).dropdown;
  dropdown?.choose('60');
  await settle();
  assert.ok(h.notices.includes('Essence Cards：設定暫時寫不進去，這次沒有存下，請再試一次'), h.notices.join('、'));
  assert.equal(h.row(CAP).dropdown?.value, '45');
  assert.notEqual(h.row(CAP).dropdown, dropdown, '重畫過');
});

void test('寫前讀不到：不寫、有通知', async t => {
  const h = await open(t, { data: { capMinutes: 45 } });
  h.data.content = undefined;
  h.row(CAP).dropdown?.choose('60');
  await settle();
  assert.equal(h.data.saves, 0);
  assert.ok(h.notices.includes('Essence Cards：設定暫時讀不到，這次沒有存下，請再試一次'), h.notices.join('、'));
  assert.equal(h.row(CAP).dropdown?.value, '45');
});

void test('layout ready 之前沒有讀 data.json（T12）', async t => {
  const h = await open(t);
  assert.equal(h.beforeReady, 0);
  assert.ok(h.data.loads >= 1);
});

/** 只跑到 onload，還沒 layout ready。 */
function loadedOnly(t: TestContext, data: unknown) {
  quiet(t);
  const stub = createObsidianStub({ data, texts: deck });
  const { default: Plugin } = stub.load<{ default: new (app: unknown, manifest: unknown) => PluginLike }>(code);
  const plugin = new Plugin(stub.app, { id: 'essence-cards', version: '0.0.1' });
  t.after(() => { plugin.onunload(); });
  plugin.onload();
  return { ...stub, plugin, tab: stub.settingTabs[0] as TabLike };
}

void test('layout ready 之前在設定頁操作：不讀不寫，有通知（L2 F2）', async t => {
  const h = loadedOnly(t, { capMinutes: 45 });
  h.tab.containerEl.shown = true;
  h.tab.display();
  h.tab.containerEl.rows.find(item => item.name === CAP)?.dropdown?.choose('5');
  await settle();
  assert.deepEqual([h.data.loads, h.data.saves], [0, 0]);
  assert.deepEqual(h.data.content, { capMinutes: 45 });
  assert.ok(h.notices.includes('Essence Cards：設定暫時讀不到，這次沒有存下，請再試一次'), h.notices.join('、'));
});

void test('外掛停用之後：還沒開始的存檔不做，不跳通知（L2 F3）', async t => {
  const h = await open(t, { data: { capMinutes: 45 } });
  const dropdown = h.row(CAP).dropdown;
  dropdown?.choose('60');
  dropdown?.choose('75');
  h.plugin.onunload();
  const before = h.notices.length;
  await settle();
  assert.notEqual((saved(h) as { capMinutes: number } | undefined)?.capMinutes, 75, '最多是停用前已經開始的那一筆');
  assert.equal(h.data.saves, 0);
  assert.equal(h.notices.length, before);
});

void test('手機回到前景時重讀，電腦不多讀', async t => {
  const phone = await open(t, { data: { capMinutes: 45 } });
  phone.data.content = { capMinutes: 60 };
  phone.show();
  await settle();
  assert.equal(phone.plugin.state?.currentSettings().settings.capMinutes, 60);

  const desktop = await open(t, { desktop: true });
  const loads = desktop.data.loads;
  desktop.show();
  await settle();
  assert.equal(desktop.data.loads, loads);
});

void test('設定檔新增、修改、改名、刪除（vault 的事件）：重讀；別的檔不算（tasks/settings-vault-file.md §6-9）', async t => {
  const h = await open(t, { desktop: true });
  const cap = (): number | undefined => h.plugin.state?.currentSettings().settings.capMinutes;
  h.texts.set(SETTINGS, JSON.stringify({ capMinutes: 60, legacy: null }));
  h.vaultEvent('create', SETTINGS);
  await settle();
  assert.equal(cap(), 60);
  assert.equal(h.row(CAP).dropdown?.value, '60', '開著的設定頁跟著變');
  h.texts.set(SETTINGS, JSON.stringify({ capMinutes: 75, legacy: null }));
  h.vaultEvent('modify', 'Essence Cards/a.md');
  h.vaultEvent('rename', 'Essence Cards/設定 2.json', 'Essence Cards/b.json');
  await settle();
  assert.equal(cap(), 60, '別的檔不重讀設定');
  h.vaultEvent('modify', SETTINGS);
  await settle();
  assert.equal(cap(), 75);
  h.texts.set(SETTINGS, JSON.stringify({ capMinutes: 90, legacy: null }));
  h.vaultEvent('rename', 'Essence Cards/設定 2.json', SETTINGS);
  await settle();
  assert.equal(cap(), 90, '改名的舊路徑是設定檔');
  // 見過設定檔之後不見了：維持手上的值（store 的 usable，tasks/settings-page.md §2-2）。
  h.texts.delete(SETTINGS);
  h.vaultEvent('delete', SETTINGS);
  await settle();
  assert.equal(cap(), 90);
  assert.equal(h.data.saves, 0);
});

/** 這台上次確認的設定（tasks/settings-vault-file.md §3）：vault 專用的 localStorage。 */
const CONFIRMED = 'essence-cards-settings-confirmed';
const MISSING = '設定檔讀不到：先用這台上次確認的設定。';

void test('讀到設定檔就記下這台確認過；之後不見：最上面一列出現，值不變、不寫（tasks/settings-vault-file.md §3）', async t => {
  const h = await open(t, { data: { capMinutes: 15 } });
  assert.equal(h.storage(CONFIRMED), null, '沒有設定檔時不記');
  h.texts.set(SETTINGS, JSON.stringify({ capMinutes: 60, foo: 1, legacy: { capMinutes: 15 } }));
  h.vaultEvent('create', SETTINGS);
  await settle();
  assert.deepEqual(h.storage(CONFIRMED), { capMinutes: 60 });
  assert.ok(!h.tab.containerEl.rows.some(row => row.desc === MISSING));
  h.texts.delete(SETTINGS);
  h.vaultEvent('delete', SETTINGS);
  await settle();
  assert.equal(h.tab.containerEl.rows[0].desc, MISSING);
  assert.equal(h.plugin.state?.currentSettings().settings.capMinutes, 60);
  h.row(CAP).dropdown?.choose('5');
  await settle();
  assert.equal(h.text(SETTINGS), undefined);
  assert.ok(h.notices.includes('Essence Cards：設定暫時讀不到，這次沒有存下，請再試一次'), h.notices.join('、'));
});

void test('確認過、設定檔不見：用確認過的值；按「重新建立」寫出來，那一列消失（tasks/settings-vault-file.md §3）', async t => {
  const h = await open(t, { data: { capMinutes: 15 }, localStorage: { [CONFIRMED]: { capMinutes: 45 } } });
  const row = h.tab.containerEl.rows[0];
  assert.equal(row.desc, MISSING);
  assert.deepEqual(row.buttons.map(button => button.text), ['重新建立']);
  assert.equal(h.row(CAP).dropdown?.value, '45');
  assert.equal(h.plugin.state?.currentSettings().known, false);
  row.buttons[0].click();
  await settle();
  assert.deepEqual(saved(h), { capMinutes: 45, legacy: { capMinutes: 15 } });
  assert.equal(h.plugin.state?.currentSettings().known, true);
  assert.ok(!h.tab.containerEl.rows.some(item => item.desc === MISSING));
  assert.equal(h.data.saves, 0);
});

void test('重新建立時設定檔已經回來：不寫，改用回來的', async t => {
  const h = await open(t, { localStorage: { [CONFIRMED]: { capMinutes: 45 } } });
  const row = h.tab.containerEl.rows[0];
  h.texts.set(SETTINGS, JSON.stringify({ capMinutes: 75, legacy: null }));
  row.buttons[0].click();
  await settle();
  assert.deepEqual(saved(h), { capMinutes: 75, legacy: null });
  assert.equal(h.row(CAP).dropdown?.value, '75');
  assert.ok(!h.tab.containerEl.rows.some(item => item.desc === MISSING));
});

void test('外部改了 data.json：值變了才重排，內容相同不重排；打開設定頁也重讀', async t => {
  const h = await open(t, { data: { capMinutes: 45 } });
  const before = h.plugin.state?.today();
  h.plugin.onExternalSettingsChange();
  await settle();
  assert.equal(h.plugin.state?.today(), before);
  h.data.content = { capMinutes: 60 };
  h.plugin.onExternalSettingsChange();
  await settle();
  assert.equal(h.plugin.state?.currentSettings().settings.capMinutes, 60);
  assert.notEqual(h.plugin.state?.today(), before);
  assert.equal(h.row(CAP).dropdown?.value, '60', '開著的設定頁跟著變');
  h.data.content = { capMinutes: 75 };
  h.tab.display();
  await settle();
  assert.equal(h.plugin.state?.currentSettings().settings.capMinutes, 75);
  assert.equal(h.row(CAP).dropdown?.value, '75');
});

// 「AI 連線」（apps/Cards/docs/tasks/ai-direct.md §2）：只在電腦；Obsidian 舊版只寫一句；服務、模型、推理等級存在這台裝置，
// 金鑰只記 SecretStorage 的名稱；測試連線的結果寫在那一列；關掉設定頁、停用外掛時進行中的測試中止；金鑰的值不出現在任何寫入與 console。
const AI_HEAD = 'AI 連線', PROVIDER = '服務', KEY = '金鑰', MODEL = '模型', REASONING = '推理等級', TEST = '測試連線';
const AI_KEY = 'sk-cards-settings-tab-2222';
const AI_PREFS = 'essence-cards-ai-connection';
const lines = (el: FakeEl): string[] => el.children.map(child => child.text).filter(Boolean);
const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });

void test('AI 連線：舊版 Obsidian（沒有 SecretStorage）只寫一句要更新，沒有欄位', async t => {
  const { tab } = await open(t, { desktop: true, apiVersion: '1.11.3' });
  const at = tab.containerEl.rows.findIndex(item => item.heading && item.name === AI_HEAD);
  assert.ok(at >= 0);
  assert.equal(tab.containerEl.rows[at + 1].desc, '要直接製作，請先把 Obsidian 更新到 1.11.4 以上。');
  assert.ok(!tab.containerEl.rows.some(item => item.name === PROVIDER));
});

void test('AI 連線：選單與預設；換服務時模型跟著換、OpenRouter 自己填；每次改都存在這台裝置，換回來模型還在', async t => {
  const { row, storage } = await open(t, { desktop: true });
  assert.deepEqual(row(PROVIDER).dropdown?.options.map(option => option.label), ['ChatGPT（推薦）', 'Gemini（免費）', 'Claude', 'OpenRouter']);
  assert.equal(row(PROVIDER).dropdown?.value, 'openai');
  assert.equal(row(MODEL).dropdown?.value, 'gpt-5.6-terra');
  assert.equal(row(REASONING).dropdown?.value, 'default');
  assert.deepEqual(row(REASONING).dropdown?.options.map(option => option.label), ['照服務的預設', '低', '中', '高']);
  assert.equal(row(KEY).secret?.value, '');
  assert.match(row(KEY).desc, /金鑰只存在這台電腦，不會同步到手機；其他外掛也讀得到 Obsidian 存的金鑰/);
  // 金鑰到哪裡申請、和訂閱無關（D-244 第 5 點）。
  assert.ok(lines(row(KEY).descEl).includes('金鑰到 OpenAI 的 API 網站申請，另外計費，和 ChatGPT 的訂閱無關。'), lines(row(KEY).descEl).join('|'));
  assert.equal(storage(AI_PREFS), null);

  row(PROVIDER).dropdown?.choose('google');
  assert.deepEqual(row(MODEL).dropdown?.options.map(option => option.value), ['gemini-3.8-flash', 'gemini-3.5-flash-lite']);
  assert.ok(lines(row(KEY).descEl).includes('金鑰到 Google 的 AI Studio 網站申請，和 Gemini 的訂閱無關。'), lines(row(KEY).descEl).join('|'));
  row(MODEL).dropdown?.choose('gemini-3.5-flash-lite');
  row(REASONING).dropdown?.choose('low');
  row(PROVIDER).dropdown?.choose('anthropic');
  assert.ok(lines(row(KEY).descEl).includes('金鑰到 Anthropic 的 API 網站申請，另外計費，和 Claude 的訂閱無關。'), lines(row(KEY).descEl).join('|'));
  row(PROVIDER).dropdown?.choose('openrouter');
  assert.equal(row(MODEL).dropdown, null);
  assert.ok(!lines(row(KEY).descEl).some(line => line.startsWith('金鑰到')), 'OpenRouter 沒有訂閱，不寫');
  assert.equal(row(MODEL).text?.placeholder, 'google/gemini-3.8-flash');
  row(MODEL).text?.type(' google/gemini-3.8-flash ');
  row(PROVIDER).dropdown?.choose('google');
  assert.equal(row(MODEL).dropdown?.value, 'gemini-3.5-flash-lite');
  assert.equal(row(REASONING).dropdown?.value, 'low');
  assert.deepEqual(storage(AI_PREFS), { provider: 'google', models: { google: 'gemini-3.5-flash-lite', openrouter: 'google/gemini-3.8-flash' }, reasoning: 'low', secrets: {} });
});

void test('AI 連線：金鑰只記名稱，測試連線時才拿值；成功、金鑰錯、沒有金鑰各寫一句；金鑰的值不出現在任何寫入與 console', async t => {
  let status = 200;
  const sent: { url: string; auth: string }[] = [];
  const fetch = (url: string, init?: unknown) => {
    const headers = (init as { headers?: Record<string, string> } | undefined)?.headers ?? {};
    sent.push({ url, auth: headers.authorization ?? headers.Authorization ?? '' });
    return Promise.resolve(status === 200 ? json({ data: [{ id: 'gpt-5.6-terra' }] })
      : new Response(JSON.stringify({ error: { message: `Incorrect API key provided: ${AI_KEY}` } }), { status, headers: { 'content-type': 'application/json' } }));
  };
  const h = await open(t, { desktop: true, secrets: { 'family-openai': AI_KEY, cleared: '', 'pasted-wrong': 'sk-…2222' }, fetch });
  const { row, storage } = h;
  // open() 先把 console.error 換成不印；這裡再換成記下來，之後印的都看得到。
  const said: string[] = [];
  for (const level of ['log', 'warn', 'error', 'info', 'debug'] as const) {
    const original = Reflect.get(console, level) as unknown;
    console[level] = (...args: unknown[]) => { said.push(args.map(String).join(' ')); };
    t.after(() => { Reflect.set(console, level, original); });
  }
  // 沒選金鑰：不送出。
  row(TEST).buttons[0].click();
  await settle();
  assert.deepEqual(lines(row(TEST).descEl), ['先在上面選一把這個服務的金鑰，或建立一把新的。']);
  assert.equal(sent.length, 0);

  row(KEY).secret?.choose('family-openai');
  assert.deepEqual(storage(AI_PREFS), { provider: 'openai', models: {}, reasoning: 'default', secrets: { openai: 'family-openai' } });
  row(TEST).buttons[0].click();
  await settle();
  // 成功打勾、另跳一個提示（實機發現：結果半秒就出來、只有一行灰色小字，再按一次字也沒變，看起來像沒反應）。
  assert.deepEqual(lines(row(TEST).descEl), ['✓ 連得上，金鑰能用。']);
  assert.equal(h.notices.at(-1), 'Essence Cards：連得上，金鑰能用。');
  assert.equal(sent.length, 1);
  assert.match(sent[0].url, /^https:\/\/api\.openai\.com\//);
  assert.equal(sent[0].auth, `Bearer ${AI_KEY}`);
  const shown = h.notices.length;
  row(TEST).buttons[0].click();
  await settle();
  assert.equal(h.notices.length, shown + 1, '同樣的結果再按一次，也要再跳一次提示');

  status = 401;
  row(TEST).buttons[0].click();
  await settle();
  assert.deepEqual(lines(row(TEST).descEl), ['金鑰不對或已失效，請到設定頁重新貼上。']);
  assert.equal(h.notices.at(-1), 'Essence Cards：金鑰不對或已失效，請到設定頁重新貼上。');

  // 家長清掉金鑰（存空字串）：說這把是空的，不送出（L2 第一輪 R11 第 4 項）；樣子不像金鑰的也不送出、請家長重貼（R4）。
  row(KEY).secret?.choose('cleared');
  row(TEST).buttons[0].click();
  await settle();
  assert.deepEqual(lines(row(TEST).descEl), ['這把金鑰是空的或找不到，請重新貼上，或選另一把。']);
  row(KEY).secret?.choose('pasted-wrong');
  row(TEST).buttons[0].click();
  await settle();
  assert.deepEqual(lines(row(TEST).descEl), ['這把金鑰看起來不完整，或夾了空白、全形字，請到服務的網站重新複製再貼上。']);
  assert.equal(sent.length, 3);

  // localStorage 的每一筆都掃（§2 驗收「saveLocalStorage 的任何一筆」，L2 第一輪 R11 第 1 項），不只 AI 連線那一筆。
  const stored = h.storedKeys().map(key => [key, storage(key)]);
  assert.ok(stored.some(([key]) => key === AI_PREFS));
  const written = JSON.stringify([stored, h.data.content, h.notices, said, [...h.texts.entries()]]);
  assert.ok(!written.includes(AI_KEY), '金鑰的值出現在寫入或 console 裡');
});

void test('AI 連線：關掉設定頁、停用外掛時，進行中的測試連線中止，不畫結果；換服務也停', async t => {
  const aborted: string[] = [];
  const fetch = (url: string, init?: unknown) => new Promise((_resolve, reject) => {
    const signal = (init as { signal?: AbortSignal } | undefined)?.signal;
    signal?.addEventListener('abort', () => { aborted.push(new URL(url).hostname); reject(new DOMException('aborted', 'AbortError')); });
  });
  const h = await open(t, { desktop: true, secrets: { 'family-openai': AI_KEY }, localStorage: { [AI_PREFS]: { provider: 'openai', secrets: { openai: 'family-openai' } } }, fetch });
  const tab = h.tab as TabLike & { hide(): void };
  h.row(TEST).buttons[0].click();
  await settle();
  assert.deepEqual(lines(h.row(TEST).descEl), ['測試中…']);
  assert.equal(h.row(TEST).buttons[0].disabled, true);
  tab.hide();
  await settle();
  assert.deepEqual(aborted, ['api.openai.com']);
  tab.containerEl.shown = true;
  tab.display();
  await settle();
  assert.deepEqual(lines(h.row(TEST).descEl), []);
  assert.equal(h.row(TEST).buttons[0].disabled, false);

  h.row(TEST).buttons[0].click();
  await settle();
  h.row(PROVIDER).dropdown?.choose('google');
  await settle();
  assert.deepEqual(aborted, ['api.openai.com', 'api.openai.com']);
  h.row(PROVIDER).dropdown?.choose('openai');

  h.row(TEST).buttons[0].click();
  await settle();
  (h.plugin as unknown as { unload(): void }).unload();
  await settle();
  assert.deepEqual(aborted, ['api.openai.com', 'api.openai.com', 'api.openai.com']);
});

void test('AI 連線：拿金鑰時丟錯，按鈕回來、寫一句，錯誤進錯誤紀錄；不停在「測試中…」（L2 第一輪 R6）', async t => {
  const h = await open(t, { desktop: true, secrets: { 'family-openai': AI_KEY }, localStorage: { [AI_PREFS]: { provider: 'openai', secrets: { openai: 'family-openai' } } } });
  const storage = (h.app as unknown as { secretStorage: { getSecret: (id: string) => string | null } }).secretStorage;
  storage.getSecret = () => { throw new Error('keychain locked'); };
  h.row(TEST).buttons[0].click();
  await settle();
  assert.deepEqual(lines(h.row(TEST).descEl), ['測試連線沒有完成，請再按一次；一直這樣，請回報給開發者。']);
  assert.equal(h.row(TEST).buttons[0].disabled, false);
  const logged = [...h.texts.entries()].filter(([path]) => path.startsWith('Essence Cards/紀錄/錯誤/')).map(([, text]) => text).join('\n');
  assert.match(logged, /"where":"ai"/);
  assert.match(logged, /keychain locked/);
});

void test('AI 連線：同一個金鑰名稱設給了另一家，金鑰那一列寫是哪幾家；換成不同的名稱就不寫（L2 第一輪 R8）', async t => {
  const h = await open(t, { desktop: true, secrets: { 'family-openai': AI_KEY, 'family-gemini': 'AIza-cards-settings-tab-3333' } });
  const hint = /這把金鑰也設給了/;
  h.row(KEY).secret?.choose('family-openai');
  assert.ok(!lines(h.row(KEY).descEl).some(line => hint.test(line)));
  h.row(PROVIDER).dropdown?.choose('google');
  h.row(KEY).secret?.choose('family-openai');
  assert.ok(lines(h.row(KEY).descEl).includes('這把金鑰也設給了 ChatGPT；每一家的金鑰不能通用，請確認選對了。'));
  h.row(PROVIDER).dropdown?.choose('openai');
  assert.ok(lines(h.row(KEY).descEl).includes('這把金鑰也設給了 Gemini；每一家的金鑰不能通用，請確認選對了。'));
  h.row(PROVIDER).dropdown?.choose('google');
  h.row(KEY).secret?.choose('family-gemini');
  assert.ok(!lines(h.row(KEY).descEl).some(line => hint.test(line)));
});
