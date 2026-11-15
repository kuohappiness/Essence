// Essence TTS Probe：只測系統語音（speechSynthesis）在 Obsidian 裡能不能念、好不好聽。可丟棄。
const { Plugin, ItemView, Platform } = require('obsidian');
const VIEW = 'essence-tts-probe';
const SPEAKER = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 5.5a9 9 0 0 1 0 13"/></svg>';
const CSS = `
:host { display:block; height:100%; color:var(--text-normal); background:var(--background-primary); font:16px/1.65 var(--font-interface, system-ui, sans-serif); }
* { box-sizing:border-box; }
.page { height:100%; overflow:auto; padding:28px 20px 60px; }
.wrap { max-width:560px; margin:auto; }
h1 { font-size:20px; font-weight:600; margin:0 0 4px; letter-spacing:.02em; }
.meta { color:var(--text-faint); font-size:13px; margin:0 0 20px; }
.bar { display:flex; gap:10px; align-items:center; flex-wrap:wrap; margin:0 0 28px; font-size:14px; color:var(--text-muted); }
select { font:inherit; font-size:14px; padding:6px 10px; border-radius:8px; border:1px solid var(--background-modifier-border); background:var(--background-primary); color:var(--text-normal); max-width:100%; }
.seg { display:inline-flex; border:1px solid var(--background-modifier-border); border-radius:8px; overflow:hidden; }
.seg button { border:0; background:none; padding:6px 12px; font:inherit; font-size:14px; color:var(--text-muted); min-height:36px; cursor:pointer; }
.seg button[aria-pressed=true] { background:color-mix(in srgb, #7c6bc4 14%, transparent); color:var(--text-normal); }
.card { padding:26px 4px 30px; border-top:1px solid var(--background-modifier-border); }
.path { font-size:12px; color:var(--text-faint); letter-spacing:.06em; margin-bottom:18px; }
.front { font-size:30px; font-weight:500; display:flex; align-items:center; gap:6px; flex-wrap:wrap; }
.front.sentence { font-size:21px; }
.say { display:inline-flex; align-items:center; justify-content:center; width:44px; height:44px; margin:-6px 0; border:0; border-radius:50%; background:none; color:var(--text-faint); cursor:pointer; transition:color .2s, background .2s; }
.say:hover, .say:focus-visible { color:#7c6bc4; background:color-mix(in srgb, #7c6bc4 10%, transparent); outline:none; }
.say.on { color:#7c6bc4; }
.reveal { margin-top:22px; width:100%; min-height:44px; border:1px dashed var(--background-modifier-border); border-radius:10px; background:none; color:var(--text-muted); font:inherit; cursor:pointer; }
.back { margin-top:20px; }
.back[hidden] { display:none; }
.ans { font-size:19px; display:flex; align-items:center; gap:2px; flex-wrap:wrap; }
.ans b { font-weight:600; box-shadow:inset 0 -2px 0 color-mix(in srgb, #7c6bc4 55%, transparent); }
.ex { margin-top:12px; color:var(--text-muted); }
.ex .en { color:var(--text-normal); display:flex; align-items:center; gap:2px; flex-wrap:wrap; }
.typing { display:flex; gap:8px; margin-top:18px; }
input { flex:1; min-width:0; font:inherit; font-size:18px; padding:8px 12px; border-radius:10px; border:1px solid var(--background-modifier-border); background:var(--background-primary); color:var(--text-normal); }
.ok { padding:0 16px; border-radius:10px; border:1px solid var(--background-modifier-border); background:none; color:var(--text-normal); font:inherit; font-size:15px; min-height:44px; cursor:pointer; }
.result { margin-bottom:10px; font-size:15px; color:var(--text-muted); }
.free .typing { margin-top:8px; }
.diag { margin-top:28px; font-size:12px; color:var(--text-faint); white-space:pre-wrap; }
`;

class ProbeView extends ItemView {
  getViewType() { return VIEW; }
  getDisplayText() { return '朗讀測試'; }
  getIcon() { return 'volume-2'; }

  async onOpen() {
    this.contentEl.empty();
    this.contentEl.style.padding = '0';
    const host = this.contentEl.createDiv();
    host.style.height = '100%';
    const root = this.root = host.attachShadow({ mode: 'open' });
    root.innerHTML = `<style>${CSS}</style><main class="page"><div class="wrap">
      <h1>朗讀測試</h1>
      <p class="meta" id="platform"></p>
      <div class="bar"><span>語音</span><select id="voice"></select>
        <span class="seg" role="group" aria-label="速度"><button data-rate="0.8" aria-pressed="false">慢</button><button data-rate="1" aria-pressed="true">正常</button></span></div>

      <section class="card">
        <div class="path">英文 › 國二上 › L1　英翻中</div>
        <div class="front">borrow<button class="say" data-say="borrow" aria-label="念單字">${SPEAKER}</button></div>
        <button class="reveal" data-for="b1">顯示答案</button>
        <div class="back" id="b1" hidden>
          <div class="ans">v.&nbsp;<b>借入、向別人借</b></div>
          <div class="ex"><div class="en">Can I borrow your pen?<button class="say" data-say="Can I borrow your pen?" aria-label="念例句">${SPEAKER}</button></div>我可以借你的筆嗎？</div>
        </div>
      </section>

      <section class="card">
        <div class="path">英文 › 國二上 › L1　中翻英</div>
        <div class="front sentence">Can I ＿＿ your pen?（借）</div>
        <div class="typing"><input id="typed" placeholder="輸入英文單字" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false"><button class="ok" id="check">確認</button></div>
        <div class="back" id="b2" hidden>
          <div class="result" id="result"></div>
          <div class="ans"><b>borrow</b><button class="say" data-say="borrow" aria-label="念單字">${SPEAKER}</button></div>
          <div class="ex"><div class="en">Can I borrow your pen?<button class="say" data-say="Can I borrow your pen?" aria-label="念例句">${SPEAKER}</button></div>我可以借你的筆嗎？</div>
        </div>
      </section>

      <section class="card free">
        <div class="path">自己輸入一個字或一句話試念</div>
        <div class="typing"><input id="free" placeholder="例如 comfortable、vegetable" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false"><button class="ok" id="freeSay">念</button></div>
      </section>
      <p class="diag" id="diag"></p>
    </div></main>`;

    this.rate = 1;
    const $ = s => root.querySelector(s);
    $('#platform').textContent = `${Platform.isIosApp ? 'iPhone／iPad' : Platform.isAndroidApp ? 'Android' : '電腦'}・系統語音・可丟棄的測試`;
    root.querySelectorAll('.reveal').forEach(b => { b.onclick = () => { root.getElementById(b.dataset.for).hidden = false; b.remove(); }; });
    root.querySelectorAll('.seg button').forEach(b => {
      b.onclick = () => {
        this.rate = Number(b.dataset.rate);
        root.querySelectorAll('.seg button').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
      };
    });
    root.addEventListener('click', e => { const b = e.target.closest('.say'); if (b) this.say(b.dataset.say, b); });
    $('#check').onclick = () => {
      const typed = $('#typed').value.trim();
      $('#result').textContent = typed.toLowerCase() === 'borrow' ? '✓ 拼對了' : `你打的：${typed || '（空白）'}`;
      $('#b2').hidden = false;
    };
    $('#freeSay').onclick = () => this.say($('#free').value.trim(), null);
    this.loadVoices();
  }

  loadVoices() {
    const diag = this.root.querySelector('#diag');
    if (!('speechSynthesis' in window)) { diag.textContent = '這個環境沒有 speechSynthesis，系統語音不能用。'; return; }
    const fill = () => {
      const all = speechSynthesis.getVoices();
      const en = all.filter(v => /^en/i.test(v.lang));
      en.sort((a, b) => (b.lang === 'en-US') - (a.lang === 'en-US'));
      const sel = this.root.querySelector('#voice');
      const keep = sel.value;
      sel.replaceChildren();
      for (const v of en) {
        const o = document.createElement('option');
        o.value = v.voiceURI;
        const q = /premium/i.test(v.voiceURI) ? '・高品質' : /enhanced/i.test(v.voiceURI) ? '・加強版' : /compact/i.test(v.voiceURI) ? '・標準' : '';
        o.textContent = `${v.name}（${v.lang}${q}）`;
        sel.appendChild(o);
      }
      const d = document.createElement('option'); d.value = ''; d.textContent = '系統預設（不指定語音）'; sel.prepend(d);
      sel.value = keep && en.some(v => v.voiceURI === keep) ? keep : (en.length ? en[0].voiceURI : '');
      this.voices = en;
      diag.textContent = `語音共 ${all.length} 個，英文 ${en.length} 個。` + (en.length ? '' : '\n這台裝置沒有英文語音：會由系統自己挑，可能用中文口音念。');
    };
    fill();
    speechSynthesis.addEventListener('voiceschanged', fill);
    this.register(() => speechSynthesis.removeEventListener('voiceschanged', fill));
  }

  say(text, btn) {
    if (!text || !('speechSynthesis' in window)) return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'en-US';
    u.rate = this.rate;
    const uri = this.root.querySelector('#voice').value;
    const v = (this.voices || []).find(x => x.voiceURI === uri);
    if (v) { u.voice = v; u.lang = v.lang; }
    this.root.querySelector('#diag').textContent = this.root.querySelector('#diag').textContent.split('\n正在用：')[0] + `\n正在用：${v ? v.voiceURI : '系統預設'}`;
    if (btn) btn.classList.add('on');
    u.onend = () => { if (btn) btn.classList.remove('on'); };
    u.onerror = e => {
      if (btn) btn.classList.remove('on');
      this.root.querySelector('#diag').textContent += `\n朗讀失敗：${e.error}`;
    };
    speechSynthesis.speak(u);
  }

  async onClose() { if ('speechSynthesis' in window) speechSynthesis.cancel(); }
}

// ── 中文朗讀試聽（D-175 第 8 點，2026-11-16）：系統語音念國語卡會念的句子，聽多音字念錯幾個。
// 句子是 Claude 照國語預設的卡片樣子自編的，不是課本原文；[字] 是要聽的字，後面的注音是台灣（教育部）的讀音。
const ZH_VIEW = 'essence-tts-probe-zh';
const ZH_RESULT = 'Essence Cards/iPhone 測試/中文朗讀試聽結果.md';
const ZH_GROUPS = [
  { title: '古典詩（接句卡、全詩順序卡翻面念整首）', items: [
    ['人閒桂花落，夜靜春山[空]。月出驚山鳥，時鳴春澗[中]。', 'ㄎㄨㄥ', 'ㄓㄨㄥ'],
    ['鹿[柴]', 'ㄓㄞˋ'],
    ['[空]山不見人，但聞人語響。返[景]入深林，復照青苔上。', 'ㄎㄨㄥ', 'ㄧㄥˇ'],
  ] },
  { title: '整句（字形卡、字義卡翻面念整句）', items: [
    ['他[長]得很高。', 'ㄓㄤˇ'],
    ['這條河很[長]。', 'ㄔㄤˊ'],
    ['銀[行]就在學校旁邊。', 'ㄏㄤˊ'],
    ['這件事很[重]要。', 'ㄓㄨㄥˋ'],
    ['寫錯了就[重]新寫一次。', 'ㄔㄨㄥˊ'],
    ['記得把書[還]給圖書館。', 'ㄏㄨㄢˊ'],
    ['我[還]沒寫完功課。', 'ㄏㄞˊ'],
    ['音[樂]課要帶直笛。', 'ㄩㄝˋ'],
    ['雨太大了，你[得]早點出門。', 'ㄉㄟˇ'],
    ['弟弟睡[著]了。', 'ㄓㄠˊ'],
    ['這座山很[著]名。', 'ㄓㄨˋ'],
    ['遇到問題要冷靜[處]理。', 'ㄔㄨˇ'],
    ['公園裡到[處]都是人。', 'ㄔㄨˋ'],
    ['這枝筆很[便]宜。', 'ㄆㄧㄢˊ'],
    ['爸爸明天要出[差]。', 'ㄔㄞ'],
    ['他很[調]皮，常常捉弄同學。', 'ㄊㄧㄠˊ'],
    ['請你[數]一數有幾顆蘋果。', 'ㄕㄨˇ'],
    ['他長大想成[為]醫生。', 'ㄨㄟˊ'],
    ['我們在校園裡[種]樹。', 'ㄓㄨㄥˋ'],
    ['護士幫我[量]身高。', 'ㄌㄧㄤˊ'],
    ['媽媽答[應]帶我去動物園。', 'ㄧㄥˋ'],
    ['他對什麼都很[好]奇。', 'ㄏㄠˋ'],
    ['中午要睡午[覺]。', 'ㄐㄧㄠˋ'],
    ['巴黎是法國的首[都]。', 'ㄉㄨ'],
    ['明天要去旅行，他[興]奮得睡不[著]。', 'ㄒㄧㄥ', 'ㄓㄠˊ'],
    ['我[曾]經去過那裡。', 'ㄘㄥˊ'],
    ['[朝]陽從海面升起。', 'ㄓㄠ'],
    ['唐[朝]有很多詩人。', 'ㄔㄠˊ'],
    ['他[背]著書包上學。', 'ㄅㄟ'],
    ['門[縫]透出一點光。', 'ㄈㄥˋ'],
    ['書上記[載]了這件事。', 'ㄗㄞˇ'],
    ['這輛公車[載]滿了乘客。', 'ㄗㄞˋ'],
    ['他好像生氣[似]的。', 'ㄕˋ'],
    ['敵人終於投[降]了。', 'ㄒㄧㄤˊ'],
    ['他用小刀[削]鉛筆。', 'ㄒㄧㄠ'],
  ] },
  { title: '台灣的讀音（和大陸念法不同）', items: [
    ['下星[期]要考試。', 'ㄑㄧˊ'],
    ['[垃][圾]要分類。', 'ㄌㄜˋ', 'ㄙㄜˋ'],
    ['在河邊玩很[危]險。', 'ㄨㄟˊ'],
    ['動物園裡有[企]鵝。', 'ㄑㄧˋ'],
    ['科學家在[研]究星星。', 'ㄧㄢˊ'],
    ['水是一種[液]體。', 'ㄧˋ'],
    ['[薄]荷糖涼涼的。', 'ㄅㄛˋ'],
  ] },
  { title: '補充說明（讀音卡翻面：舉一個同讀音的詞）', items: [
    ['長大的[長]', 'ㄓㄤˇ'],
    ['長短的[長]', 'ㄔㄤˊ'],
    ['銀行的[行]', 'ㄏㄤˊ'],
    ['重新的[重]', 'ㄔㄨㄥˊ'],
    ['還書的[還]', 'ㄏㄨㄢˊ'],
    ['睡著的[著]', 'ㄓㄠˊ'],
    ['便宜的[便]', 'ㄆㄧㄢˊ'],
    ['調皮的[調]', 'ㄊㄧㄠˊ'],
    ['投降的[降]', 'ㄒㄧㄤˊ'],
    ['唐朝的[朝]', 'ㄔㄠˊ'],
    ['念[ㄓㄤˇ]，長大的長', '略過或念出 zhǎng 都算對'],
  ] },
];
// 每個要聽的字一個編號（1 起算），結果檔照編號記。
const ZH_ITEMS = [];
for (const g of ZH_GROUPS) for (const [text, ...readings] of g.items) {
  const marks = [...text.matchAll(/\[([^\]]+)\]/g)].map((m, i) => ({ char: m[1], reading: readings[i], no: 0 }));
  const item = { group: g.title, text, spoken: text.replace(/[[\]]/g, ''), marks };
  ZH_ITEMS.push(item);
}
let zhNo = 0;
for (const item of ZH_ITEMS) for (const m of item.marks) m.no = ++zhNo;

const ZH_CSS = CSS + `
h2 { font-size:15px; font-weight:600; color:var(--text-muted); margin:30px 0 4px; }
.how { font-size:14px; color:var(--text-muted); margin:0 0 16px; }
.row { padding:14px 0; border-top:1px solid var(--background-modifier-border); }
.row.heard .line { color:var(--text-normal); }
.line { font-size:20px; display:flex; align-items:center; gap:4px; flex-wrap:wrap; color:var(--text-muted); }
.line mark { background:none; color:inherit; font-weight:600; box-shadow:inset 0 -2px 0 color-mix(in srgb, #7c6bc4 55%, transparent); }
.marks { display:flex; gap:8px; flex-wrap:wrap; margin-top:6px; }
.mk { font:inherit; font-size:14px; min-height:36px; padding:4px 12px; border-radius:18px; border:1px solid var(--background-modifier-border); background:none; color:var(--text-muted); cursor:pointer; }
.mk[aria-pressed=true] { border-color:#d9534f; color:#d9534f; background:color-mix(in srgb, #d9534f 10%, transparent); }
.sum { position:sticky; top:0; z-index:1; background:var(--background-primary); padding:8px 0; font-size:14px; color:var(--text-muted); border-bottom:1px solid var(--background-modifier-border); }
`;

class ZhProbeView extends ItemView {
  getViewType() { return ZH_VIEW; }
  getDisplayText() { return '中文朗讀試聽'; }
  getIcon() { return 'languages'; }

  async onOpen() {
    this.contentEl.empty();
    this.contentEl.style.padding = '0';
    const host = this.contentEl.createDiv();
    host.style.height = '100%';
    const root = this.root = host.attachShadow({ mode: 'open' });
    this.rate = 1;
    this.heard = new Set();
    this.wrong = new Set();
    await this.loadSaved();
    const rows = [];
    let lastGroup = '';
    ZH_ITEMS.forEach((item, i) => {
      if (item.group !== lastGroup) { rows.push(`<h2>${item.group}</h2>`); lastGroup = item.group; }
      const line = item.text.replace(/\[([^\]]+)\]/g, '<mark>$1</mark>');
      const marks = item.marks.map(m => `<button class="mk" data-no="${m.no}" aria-pressed="${this.wrong.has(m.no)}">${m.no}．${m.char}　應念 ${m.reading}</button>`).join('');
      rows.push(`<div class="row${this.heard.has(i) ? ' heard' : ''}" data-i="${i}"><div class="line">${line}<button class="say" data-i="${i}" aria-label="念這句">${SPEAKER}</button></div><div class="marks">${marks}</div></div>`);
    });
    root.innerHTML = `<style>${ZH_CSS}</style><main class="page"><div class="wrap">
      <h1>中文朗讀試聽</h1>
      <p class="meta" id="platform"></p>
      <p class="how">按喇叭聽一句；底線的字念錯了，就按它下面的按鈕（變紅）。再按一次取消。結果自動存到「${ZH_RESULT}」。句子是自編的，不是課本原文。</p>
      <div class="bar"><span>語音</span><select id="voice"></select>
        <span class="seg" role="group" aria-label="速度"><button data-rate="0.8" aria-pressed="false">慢</button><button data-rate="1" aria-pressed="true">正常</button></span></div>
      <div class="sum" id="sum"></div>
      ${rows.join('')}
      <p class="diag" id="diag"></p>
    </div></main>`;
    const $ = s => root.querySelector(s);
    $('#platform').textContent = `${Platform.isIosApp ? 'iPhone／iPad' : Platform.isAndroidApp ? 'Android' : '電腦'}・系統語音・可丟棄的測試`;
    root.querySelectorAll('.seg button').forEach(b => {
      b.onclick = () => {
        this.rate = Number(b.dataset.rate);
        root.querySelectorAll('.seg button').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
      };
    });
    root.addEventListener('click', e => {
      const say = e.target.closest('.say');
      if (say) {
        const i = Number(say.dataset.i);
        this.say(ZH_ITEMS[i].spoken, say);
        this.heard.add(i);
        say.closest('.row').classList.add('heard');
        this.update();
        return;
      }
      const mk = e.target.closest('.mk');
      if (mk) {
        const no = Number(mk.dataset.no);
        if (this.wrong.has(no)) this.wrong.delete(no); else this.wrong.add(no);
        mk.setAttribute('aria-pressed', String(this.wrong.has(no)));
        const row = mk.closest('.row');
        this.heard.add(Number(row.dataset.i));
        row.classList.add('heard');
        this.update();
      }
    });
    this.loadVoices();
    this.update(false);
  }

  update(save = true) {
    const heardMarks = ZH_ITEMS.filter((_, i) => this.heard.has(i)).reduce((n, it) => n + it.marks.length, 0);
    this.root.querySelector('#sum').textContent = `聽過 ${this.heard.size}／${ZH_ITEMS.length} 句・要聽的字 ${heardMarks}／${zhNo} 個・念錯 ${this.wrong.size} 個`;
    if (!save) return;
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.save(), 800);
  }

  async loadSaved() {
    const file = this.app.vault.getAbstractFileByPath(ZH_RESULT);
    if (!file) return;
    const text = await this.app.vault.read(file);
    const m = text.match(/```json\n([\s\S]*?)\n```/);
    if (!m) return;
    try {
      const data = JSON.parse(m[1]);
      for (const i of data.heard || []) this.heard.add(i);
      for (const no of data.wrong || []) this.wrong.add(no);
    } catch { /* 壞掉就從頭 */ }
  }

  async save() {
    const sel = this.root.querySelector('#voice');
    const voice = sel.value ? (this.voices.find(v => v.voiceURI === sel.value) || {}).voiceURI : '系統預設（zh-TW，不指定語音）';
    const lines = ['# 中文朗讀試聽結果', '', `- 存檔：${new Date().toLocaleString('zh-TW')}`, `- 裝置：${Platform.isIosApp ? 'iPhone／iPad' : '電腦'}`, `- 語音：${voice}`, `- 中文語音：${this.voiceSummary || '（沒有讀到）'}`, '', '| 編號 | 字 | 應念 | 句子 | 結果 |', '|---|---|---|---|---|'];
    ZH_ITEMS.forEach((item, i) => {
      for (const mk of item.marks) lines.push(`| ${mk.no} | ${mk.char} | ${mk.reading} | ${item.spoken} | ${!this.heard.has(i) ? '沒聽' : this.wrong.has(mk.no) ? '❌ 念錯' : '✓'} |`);
    });
    lines.push('', '```json', JSON.stringify({ heard: [...this.heard].sort((a, b) => a - b), wrong: [...this.wrong].sort((a, b) => a - b) }), '```', '');
    const body = lines.join('\n');
    const file = this.app.vault.getAbstractFileByPath(ZH_RESULT);
    if (file) await this.app.vault.modify(file, body); else await this.app.vault.create(ZH_RESULT, body);
  }

  loadVoices() {
    const diag = this.root.querySelector('#diag');
    if (!('speechSynthesis' in window)) { diag.textContent = '這個環境沒有 speechSynthesis，系統語音不能用。'; return; }
    const fill = () => {
      const all = speechSynthesis.getVoices();
      const zh = all.filter(v => /^(zh|cmn|yue)/i.test(v.lang));
      zh.sort((a, b) => (/tw|hant/i.test(b.lang)) - (/tw|hant/i.test(a.lang)));
      const sel = this.root.querySelector('#voice');
      const keep = sel.value;
      sel.replaceChildren();
      const d = document.createElement('option'); d.value = ''; d.textContent = '系統預設（zh-TW，不指定語音）'; sel.appendChild(d);
      for (const v of zh) {
        const o = document.createElement('option');
        o.value = v.voiceURI;
        o.textContent = `${v.name}（${v.lang}）`;
        sel.appendChild(o);
      }
      sel.value = keep && zh.some(v => v.voiceURI === keep) ? keep : '';
      this.voices = zh;
      this.voiceSummary = zh.map(v => `${v.name}（${v.lang}）`).join('、');
      diag.textContent = `語音共 ${all.length} 個，中文 ${zh.length} 個：${this.voiceSummary || '沒有'}`;
    };
    fill();
    speechSynthesis.addEventListener('voiceschanged', fill);
    this.register(() => speechSynthesis.removeEventListener('voiceschanged', fill));
  }

  say(text, btn) {
    if (!('speechSynthesis' in window)) return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'zh-TW';
    u.rate = this.rate;
    const uri = this.root.querySelector('#voice').value;
    const v = (this.voices || []).find(x => x.voiceURI === uri);
    if (v) { u.voice = v; u.lang = v.lang; }
    if (btn) btn.classList.add('on');
    u.onend = () => { if (btn) btn.classList.remove('on'); };
    u.onerror = e => { if (btn) btn.classList.remove('on'); this.root.querySelector('#diag').textContent += `\n朗讀失敗：${e.error}`; };
    speechSynthesis.speak(u);
  }

  async onClose() { if ('speechSynthesis' in window) speechSynthesis.cancel(); clearTimeout(this.saveTimer); }
}

module.exports = class EssenceTtsProbe extends Plugin {
  async onload() {
    this.registerView(VIEW, leaf => new ProbeView(leaf));
    this.registerView(ZH_VIEW, leaf => new ZhProbeView(leaf));
    this.addRibbonIcon('volume-2', '朗讀測試', () => this.open());
    this.addRibbonIcon('languages', '中文朗讀試聽', () => this.open(ZH_VIEW));
    this.addCommand({ id: 'open', name: '開啟朗讀測試', callback: () => this.open() });
    this.addCommand({ id: 'open-zh', name: '開啟中文朗讀試聽', callback: () => this.open(ZH_VIEW) });
  }
  async open(type = VIEW) {
    const leaf = this.app.workspace.getLeaf(true);
    await leaf.setViewState({ type, active: true });
    this.app.workspace.revealLeaf(leaf);
  }
  onunload() { if ('speechSynthesis' in window) speechSynthesis.cancel(); }
};
