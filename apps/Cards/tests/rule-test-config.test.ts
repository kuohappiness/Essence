// 比較測試工具的設定（tasks/rule-test-tool.md §4-2）：範例照任務說明，錯誤要一次列完。
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { lessonsOf, PLUGIN_TASK, readConfig } from '../tools/rule-test/config.ts';
import { copyDir, insideRepo, openFolder } from '../tools/rule-test/folder.ts';
import { APP_ROOT, REPO_ROOT } from '../tools/rule-test/prompts.ts';

const EXAMPLE = `
名稱: 英文第二輪
課庫: D:\\測試\\課
課:
  - 代號: 英文U7
    表單: { 科目: english, 年級學期: 國二下, 單元: "U7 Going Places", 目的: 準備段考, 補充: 否, 點選填空: 要, 家長調整: 無, 教材說明: 課本 p.80～95 }
    已有目標: { vault: D:\\測試\\vault }
  - 代號: 社會1-2
    表單: { 科目: social, 年級學期: 五上, 單元: "1-2 地形" }
    已有目標: { 快照: 凍結/第一輪.json }
組:
  - 名稱: 現行
    規則: { 外掛: english }
  - 名稱: 候選
    規則:
      commit: 288ba1ef
      檔案: [apps/Cards/docs/card-rules/next/core.md, apps/Cards/docs/card-rules/next/english.md]
      任務段: { 點選填空說明: 不送, 已有目標說明: 一行, 三段: 要, 已有目標清單: 精簡 }
  - 名稱: 分段送出
    步驟:
      - { 對話: A, 規則: { 同: 候選, 檔案: [core.md, english-grammar.md] }, 卡組: 是 }
      - { 對話: B, 規則: { 同: 候選, 檔案: [core.md, english-words.md] }, 卡組: 是 }
  - 名稱: 自己寫
    規則: { 自備: { 英文U7: 英文.md, 社會1-2: 社會.md } }
生成:
  - { 生成器: claude, 模型: claude-opus-5-5, 推理: high, 份數: 3 }
  - { 生成器: 手貼, 服務: ChatGPT, 模型: GPT-6.2 Thinking, 推理: high, 份數: 1, 課: [英文U7] }
評審:
  - { 評審: codex, 模型: gpt-6.2-sol, 推理: high }
  - { 評審: claude, 模型: claude-fable-5-2, 推理: high }
評審重評: 1
裁定: { 裁定者: claude, 模型: claude-opus-5-5, 推理: high }
門檻:
  基準: 現行
  候選: [候選]
  生成器: [claude, ChatGPT]
  重大錯誤: 不比基準多
  收益: [{ 指標: 傷到學習, 至少: 20% }, { 指標: 每個必備平均幾題, 至少: 10% }]
  不能變差: [{ 指標: 每個必備平均幾題, 容許: "15", 下限: 0.3 }]
  傷到學習容許: { 百分比: 10%, 下限: 0.5 }
  次要: [{ 指標: token, 至少: 10%, 容許: 10% }]
  打平較省: 只報告
  時間預算: 算門檻
錯誤分級: { 一題多事: 小問題 }
`;

void test('readConfig：任務說明的範例讀得出來，同 沿用被指的那一組、只換寫到的部分', () => {
  const config = readConfig(EXAMPLE);
  assert.equal(config.name, '英文第二輪');
  assert.deepEqual(config.lessons.map(each => each.code), ['英文U7', '社會1-2']);
  assert.deepEqual(config.lessons[0].existing, { vault: 'D:\\測試\\vault' });
  assert.deepEqual(config.lessons[1].existing, { snapshot: '凍結/第一輪.json' });
  assert.deepEqual(config.lessons[0].form, { subject: 'english', term: '國二下', unit: 'U7 Going Places', purpose: '準備段考', supplement: false, pick: true, adjust: '', material: '課本 p.80～95' });

  const [current, candidate, split, own] = config.groups;
  assert.deepEqual(current.steps, [{ conversation: 'A', rules: { kind: 'plugin', subject: 'english' }, deck: true }]);
  const lean = { pickRules: false, existingRules: 'line', threeSections: true, existingList: 'lean' };
  assert.deepEqual(candidate.steps[0].rules, { kind: 'files', commit: '288ba1ef', files: ['apps/Cards/docs/card-rules/next/core.md', 'apps/Cards/docs/card-rules/next/english.md'], task: lean });
  assert.deepEqual(split.steps, [
    { conversation: 'A', rules: { kind: 'files', commit: '288ba1ef', files: ['core.md', 'english-grammar.md'], task: lean }, deck: true },
    { conversation: 'B', rules: { kind: 'files', commit: '288ba1ef', files: ['core.md', 'english-words.md'], task: lean }, deck: true },
  ]);
  assert.deepEqual(own.steps[0].rules, { kind: 'own', files: { 英文U7: '英文.md', '社會1-2': '社會.md' } });

  assert.deepEqual(config.generators.map(each => [each.name, each.kind, each.count, each.lessons]), [['claude', 'claude', 3, null], ['ChatGPT', 'manual', 1, ['英文U7']]]);
  assert.deepEqual(lessonsOf(config, config.generators[1]).map(each => each.code), ['英文U7']);
  assert.equal(lessonsOf(config, config.generators[0]).length, 2);
  assert.deepEqual(config.judges.map(each => [each.name, each.model]), [['codex', 'gpt-6.2-sol'], ['claude', 'claude-fable-5-2']]);
  assert.equal(config.rejudge, 1);
  assert.deepEqual(config.gates, {
    baseline: '現行', candidates: ['候選'], generators: ['claude', 'ChatGPT'], majorErrors: 'notMore',
    rowMissGap: 0.5, missedRows: 1, extraPrompts: 0, harm: { percent: 0.1, floor: 0.5 },
    benefits: [{ metric: '傷到學習', atLeast: 0.2 }, { metric: '每個必備平均幾題', atLeast: 0.1 }], correction: true,
    noWorse: {
      判錯: { percent: 0, floor: 0.5 }, 每個必備平均幾題: { percent: 0.15, floor: 0.3 }, 多餘的題: { percent: 0, floor: 0.5 },
      地圖漏的必備: { percent: 0, floor: 0.5 }, 地圖問題: { percent: 0, floor: 0.5 }, 加深機會漏掉: { percent: 0, floor: 0.5 }, 確定接錯: { percent: 0, floor: 0.5 },
    },
    secondary: [{ metric: 'token', atLeast: 0.1, tolerance: 0.1 }], tieMinCopies: 3, tieCheaper: 'report', timeBudget: 'gate',
  });
  assert.deepEqual(config.levels, { 一題多事: '小問題', 池裡判準不同: '傷到學習', 跨單元去向: '小問題' });
});

void test('readConfig：沒寫的照外掛的預設（任務段、補充與點選填空跟著科目、裁定用 Opus）', () => {
  const config = readConfig(EXAMPLE.replace(/\n +任務段: \{[^}]*\}/, '').replace(/\n裁定:.*\n/, '\n'));
  assert.deepEqual(config.groups[1].steps[0].rules, { kind: 'files', commit: '288ba1ef', files: ['apps/Cards/docs/card-rules/next/core.md', 'apps/Cards/docs/card-rules/next/english.md'], task: PLUGIN_TASK });
  // 社會：外掛預設允許補充、不做點選填空；目的沒寫是準備段考。
  assert.deepEqual(config.lessons[1].form, { subject: 'social', term: '五上', unit: '1-2 地形', purpose: '準備段考', supplement: true, pick: false, adjust: '', material: '' });
  assert.deepEqual(config.adjudicator, { name: 'claude', kind: 'claude', model: 'claude-opus-5-5', effort: 'high' });
  assert.equal(config.timeoutMinutes, 40);
  // 重大錯誤的門檻沒寫時是「不比基準多」（D-234）。
  assert.equal(readConfig(EXAMPLE.replace(/\n {2}重大錯誤: .*/, '')).gates.majorErrors, 'notMore');
});

void test('readConfig：錯誤一次列完，每一條說是哪一項', () => {
  const broken = `
名稱: 壞的
課庫: x
課:
  - { 代號: U1, 表單: { 科目: french, 年級學期: 國二上, 單元: U1 } }
  - { 代號: U1, 表單: { 科目: english, 年級學期: 國二上, 單元: U1, 目的: 期末考 } }
組:
  - { 名稱: 甲, 規則: { 同: 乙 } }
  - { 名稱: 乙, 規則: { 同: 甲 } }
  - { 名稱: 丙, 規則: { 同: 丁 } }
  - { 名稱: 戊, 規則: { 自備: { U2: a.md } } }
  - { 名稱: 己, 步驟: [{ 對話: A, 規則: { 外掛: english } }] }
生成:
  - { 生成器: gemini, 模型: x }
評審:
  - { 評審: claude, 模型: claude-fable-5-2 }
`;
  assert.throws(() => readConfig(broken), (error: Error) => {
    const lines = error.message.split('\n').slice(1);
    const expected = [
      '外掛沒有「french」這一科',
      '目的要是 準備段考、準備小考、平常複習 之一',
      '代號「U1」重複',
      '「同: 乙」繞回自己',
      '沒有叫「丁」的組',
      '自備少了課「U1」的檔',
      '至少要有一步「卡組: 是」',
      '生成器要是 claude、codex 或 手貼',
      '要剛好兩位',
      '少了門檻',
    ];
    for (const part of expected) assert.ok(lines.some(line => line.includes(part)), `少了「${part}」：\n${error.message}`);
    assert.match(error.message, /^測試\.yaml 有 \d+ 個問題：/);
    return true;
  });
});

void test('readConfig：門檻引用的組與生成器要有定義；同一種生成器有兩項要寫名稱', () => {
  const config = EXAMPLE
    .replace('生成器: [claude, ChatGPT]', '生成器: [claude, Gemini]')
    .replace('候選: [候選]', '候選: [候選二]')
    .replace('  - { 生成器: 手貼', '  - { 生成器: claude, 模型: claude-sonnet-5-5, 份數: 2 }\n  - { 生成器: 手貼');
  assert.throws(() => readConfig(config), (error: Error) => {
    assert.match(error.message, /沒有叫「候選二」的組/);
    assert.match(error.message, /沒有叫「Gemini」的生成器/);
    assert.match(error.message, /名稱「claude」重複/);
    return true;
  });
});

void test('readConfig：收益與不能變差只收學習面的指標（D-236 第 4 點）；錯誤分級只能調沒點名的種類', () => {
  const config = EXAMPLE
    .replace('收益: [{ 指標: 傷到學習, 至少: 20% }, { 指標: 每個必備平均幾題, 至少: 10% }]', '收益: [{ 指標: 規則字數, 至少: 20% }, { 指標: token, 至少: 10% }]\n  近義重複多出: 1')
    .replace('不能變差: [{ 指標: 每個必備平均幾題, 容許: "15", 下限: 0.3 }]', '不能變差: [{ 指標: 生成時間, 容許: 10% }, { 指標: 傷到學習, 容許: 10% }]')
    .replace('打平較省: 只報告', '打平較省: 看情況\n  收益校正: 也許').replace('時間預算: 算門檻', '時間預算: 看看')
    .replace('錯誤分級: { 一題多事: 小問題 }', '錯誤分級: { 重大錯誤: 小問題, 存不了: 小問題, 池裡判準不同: 重大 }');
  assert.throws(() => readConfig(config), (error: Error) => {
    const lines = error.message.split('\n').slice(1);
    const at = (where: string): string[] => lines.filter(line => line.includes(where));
    assert.equal(at('門檻 收益 第 1 項').length, 1);
    assert.match(at('門檻 收益 第 1 項')[0], /D-236/);
    assert.match(at('門檻 收益 第 2 項')[0], /D-236/);
    assert.match(at('門檻 不能變差 第 1 項')[0], /D-236/);
    assert.match(at('門檻 不能變差 第 2 項')[0], /傷到學習容許/);
    assert.match(at('門檻 近義重複多出')[0], /多餘的題多出/);
    assert.match(at('門檻 打平較省')[0], /「過」或「只報告」/);
    assert.match(at('門檻 收益校正')[0], /「要」或「不要」/);
    assert.match(at('門檻 時間預算')[0], /「只報告」或「算門檻」/);
    assert.match(at('錯誤分級 重大錯誤')[0], /只能調 一題多事、池裡判準不同、跨單元去向/);
    assert.match(at('錯誤分級 存不了')[0], /只能調/);
    assert.match(at('錯誤分級 池裡判準不同')[0], /「傷到學習」或「小問題」/);
    return true;
  });
});

void test('readConfig：門檻寫錯不會默默變成別的值（L2 第 1 輪 I）：容許量要寫成物件、不認得的鍵、收益重複、份數要整數、差距要是數', () => {
  const config = EXAMPLE
    .replace('傷到學習容許: { 百分比: 10%, 下限: 0.5 }', '傷到學習容許: 0.5\n  傷到學習容許量: 1\n  打平最少份數: 2.5\n  多漏差距: abc')
    .replace('收益: [{ 指標: 傷到學習, 至少: 20% }, { 指標: 每個必備平均幾題, 至少: 10% }]', '收益: [{ 指標: 傷到學習, 至少: 20% }, { 指標: 傷到學習, 至少: 10% }]')
    + '逾時: 30\n';
  assert.throws(() => readConfig(config), (error: Error) => {
    const lines = error.message.split('\n').slice(1);
    const at = (where: string): string => lines.find(line => line.includes(where)) ?? '';
    assert.match(at('門檻 傷到學習容許：'), /要寫成 \{ 百分比, 下限 \}/);
    assert.match(at('不認得「傷到學習容許量」'), /門檻/);
    assert.match(at('不認得「逾時」'), /逾時分鐘/);
    assert.match(at('門檻 收益'), /傷到學習.*重複/);
    assert.match(at('門檻 打平最少份數'), /整數/);
    assert.match(at('門檻 多漏差距'), /0 以上的數/);
    return true;
  });
});

void test('readConfig：門檻底下每一層寫錯都擋下（L2 第 2 輪）：每個物件多一個不認得的鍵、每個單值寫成空白／是非／清單、次要與不能變差重複', () => {
  const errorsOf = (yaml: string): string[] => {
    try { readConfig(yaml); } catch (error) { return (error as Error).message.split('\n').slice(1); }
    return [];
  };
  const objects: [string, string, string][] = [
    ['傷到學習容許: { 百分比: 10%, 下限: 0.5 }', '傷到學習容許: { 百分比: 10%, 下線: 0.5 }', '門檻 傷到學習容許'],
    ['不能變差: [{ 指標: 每個必備平均幾題, 容許: "15", 下限: 0.3 }]', '不能變差: [{ 指標: 每個必備平均幾題, 容忍: "15", 下限: 0.3 }]', '門檻 不能變差 第 1 項'],
    ['{ 指標: 每個必備平均幾題, 至少: 10% }', '{ 指標: 每個必備平均幾題, 至少: 10%, 多的: 1 }', '門檻 收益 第 2 項'],
    ['次要: [{ 指標: token, 至少: 10%, 容許: 10% }]', '次要: [{ 指標: token, 至少: 10%, 容忍: 10% }]', '門檻 次要 第 1 項'],
  ];
  for (const [from, to, where] of objects) {
    assert.ok(EXAMPLE.includes(from), from);
    assert.ok(errorsOf(EXAMPLE.replace(from, to)).some(line => line.includes(where) && line.includes('不認得')), to);
  }
  const gate = (key: string, value: string): string => {
    const line = new RegExp(`^  ${key}: .*$`, 'm');
    return line.test(EXAMPLE) ? EXAMPLE.replace(line, `  ${key}: ${value}`) : EXAMPLE.replace('  時間預算: 算門檻\n', `  時間預算: 算門檻\n  ${key}: ${value}\n`);
  };
  for (const key of ['重大錯誤', '收益校正', '多餘的題多出', '多漏差距', '多漏列數', '打平最少份數', '打平較省', '時間預算']) {
    for (const value of ['', 'true', 'false', '[1]']) assert.ok(errorsOf(gate(key, value)).some(line => line.includes(`門檻 ${key}`)), `${key}: ${value}`);
  }
  // 物件裡的單值（L2 第 3 輪 3）：空白、是非、清單、負數、不是數都擋下，不默默變成 0 或預設。
  const inner: [string, (value: string) => string, string][] = [
    ['傷到學習容許: { 百分比: 10%, 下限: 0.5 }', value => `傷到學習容許: { 百分比: ${value}, 下限: 0.5 }`, '門檻 傷到學習容許 百分比'],
    ['傷到學習容許: { 百分比: 10%, 下限: 0.5 }', value => `傷到學習容許: { 百分比: 10%, 下限: ${value} }`, '門檻 傷到學習容許 下限'],
    ['不能變差: [{ 指標: 每個必備平均幾題, 容許: "15", 下限: 0.3 }]', value => `不能變差: [{ 指標: ${value}, 容許: "15", 下限: 0.3 }]`, '門檻 不能變差 第 1 項'],
    ['不能變差: [{ 指標: 每個必備平均幾題, 容許: "15", 下限: 0.3 }]', value => `不能變差: [{ 指標: 每個必備平均幾題, 容許: ${value}, 下限: 0.3 }]`, '門檻 不能變差 第 1 項 容許'],
    ['不能變差: [{ 指標: 每個必備平均幾題, 容許: "15", 下限: 0.3 }]', value => `不能變差: [{ 指標: 每個必備平均幾題, 容許: "15", 下限: ${value} }]`, '門檻 不能變差 第 1 項 下限'],
    ['{ 指標: 每個必備平均幾題, 至少: 10% }', value => `{ 指標: ${value}, 至少: 10% }`, '門檻 收益 第 2 項'],
    ['{ 指標: 每個必備平均幾題, 至少: 10% }', value => `{ 指標: 每個必備平均幾題, 至少: ${value} }`, '門檻 收益 第 2 項 至少'],
    ['次要: [{ 指標: token, 至少: 10%, 容許: 10% }]', value => `次要: [{ 指標: ${value}, 至少: 10%, 容許: 10% }]`, '門檻 次要 第 1 項'],
    ['次要: [{ 指標: token, 至少: 10%, 容許: 10% }]', value => `次要: [{ 指標: token, 至少: ${value}, 容許: 10% }]`, '門檻 次要 第 1 項 至少'],
    ['次要: [{ 指標: token, 至少: 10%, 容許: 10% }]', value => `次要: [{ 指標: token, 至少: 10%, 容許: ${value} }]`, '門檻 次要 第 1 項 容許'],
  ];
  for (const [from, to, where] of inner) {
    for (const value of ['~', 'true', '[1]', '-1', '.nan']) assert.ok(errorsOf(EXAMPLE.replace(from, to(value))).some(line => line.includes(`${where}：`)), `${where}: ${value}`);
  }
  for (const [from, to, where] of [
    ['次要: [{ 指標: token, 至少: 10%, 容許: 10% }]', '次要: [{ 指標: token, 至少: 10%, 容許: 10% }, { 指標: token, 至少: 5% }]', '門檻 次要'],
    ['不能變差: [{ 指標: 每個必備平均幾題, 容許: "15", 下限: 0.3 }]', '不能變差: [{ 指標: 每個必備平均幾題, 容許: "15" }, { 指標: 每個必備平均幾題, 下限: 0.3 }]', '門檻 不能變差'],
  ]) assert.ok(errorsOf(EXAMPLE.replace(from, to)).some(line => line.includes(where) && line.includes('重複')), to);
  assert.deepEqual(errorsOf(EXAMPLE), []);
});

void test('readConfig：加深、加深規則與對照（rule-test-d236.md §2、§6-1、§8）', () => {
  const withDeepen = EXAMPLE
    .replace('      任務段: { 點選填空說明: 不送, 已有目標說明: 一行, 三段: 要, 已有目標清單: 精簡 }', '      任務段: { 點選填空說明: 不送, 已有目標說明: 一行, 三段: 要, 已有目標清單: 精簡 }\n    加深規則: { commit: 288ba1ef, 檔案: [apps/Cards/docs/card-rules/next/core.md] }')
    + '加深: { 生成器: [claude] }\n對照: [{ 名稱: 換規則的效果, 甲: 候選, 乙: 現行 }]\n';
  const config = readConfig(withDeepen);
  assert.deepEqual(config.deepen, { generators: ['claude'] });
  assert.deepEqual(config.contrasts, [{ name: '換規則的效果', a: '候選', b: '現行' }]);
  assert.deepEqual(config.groups.map(group => group.deepenRules), [null, { commit: '288ba1ef', files: ['apps/Cards/docs/card-rules/next/core.md'] }, null, null]);
  assert.equal(readConfig(EXAMPLE).deepen, null);
  // 檔案來源的組跑加深卻沒寫加深規則；手貼的生成器；對照的組不在、甲乙同一組。
  const broken = EXAMPLE + '加深: { 生成器: [claude, ChatGPT, gemini] }\n對照: [{ 名稱: 甲乙, 甲: 分段送出, 乙: 分段送出 }, { 名稱: 不在, 甲: 丙, 乙: 現行 }]\n';
  assert.throws(() => readConfig(broken), (error: Error) => {
    assert.match(error.message, /組「候選」：跑加深的組，規則不是同一科的「外掛」來源時，要寫「加深規則: \{ commit, 檔案 \}」/);
    assert.match(error.message, /組「分段送出」：跑加深的組/);
    assert.doesNotMatch(error.message, /組「現行」：/);
    assert.match(error.message, /加深：「ChatGPT」是手貼的生成器，不跑加深/);
    assert.match(error.message, /加深：沒有叫「gemini」的生成器/);
    assert.match(error.message, /對照 第 1 項：甲和乙是同一組/);
    assert.match(error.message, /對照 第 2 項：沒有叫「丙」的組/);
    return true;
  });
});

void test('readConfig：YAML 本身讀不懂時說是 YAML 的問題', () => {
  assert.throws(() => readConfig('名稱: [沒關'), /測試\.yaml 讀不懂/);
  assert.throws(() => readConfig('- 一個清單'), /要是一個物件/);
});

void test('測試資料夾或課庫在 repo 裡就停下（repo 是公開的，§8 第 6 條）', () => {
  assert.equal(insideRepo(join(APP_ROOT, '比較測試')), true);
  assert.equal(insideRepo(REPO_ROOT), true);
  assert.equal(insideRepo(tmpdir()), false);
  assert.equal(insideRepo(`${REPO_ROOT}-rule-test`), false);
  assert.throws(() => openFolder(join(REPO_ROOT, '比較測試')), /測試資料夾在 repo 裡/);
  const root = mkdtempSync(join(tmpdir(), 'rule-test-repo-'));
  writeFileSync(join(root, '測試.yaml'), `
名稱: 課庫在 repo 裡
課庫: ${JSON.stringify(join(REPO_ROOT, '課'))}
課: [{ 代號: L3, 表單: { 科目: english, 年級學期: 國二上, 單元: L3 } }]
組: [{ 名稱: 甲, 規則: { 外掛: english } }]
生成: [{ 生成器: claude, 模型: claude-opus-5-5, 份數: 1 }]
評審: [{ 評審: codex, 模型: gpt-6.2-sol }, { 評審: claude, 模型: claude-fable-5-2 }]
門檻: { 基準: 甲, 候選: [甲], 生成器: [claude], 收益: [{ 指標: 判錯, 至少: 1% }] }
`);
  assert.throws(() => openFolder(root), /課庫在 repo 裡/);
});

void test('copyDir：一層層複製整個資料夾（中文檔名）；已經有、內容一樣的檔跳過，內容不同就停下不覆蓋', () => {
  const from = mkdtempSync(join(tmpdir(), '評分 區組-'));
  mkdirSync(join(from, '卡組', '社會1-2'), { recursive: true });
  writeFileSync(join(from, '評分表.md'), '| 列 |');
  writeFileSync(join(from, '卡組', '社會1-2', 'S1.md'), '1\t大航海時代');
  const to = join(mkdtempSync(join(tmpdir(), '評審-')), '工作');
  copyDir(from, to);
  assert.equal(readFileSync(join(to, '評分表.md'), 'utf8'), '| 列 |');
  assert.equal(readFileSync(join(to, '卡組', '社會1-2', 'S1.md'), 'utf8'), '1\t大航海時代');
  copyDir(from, to);
  assert.equal(readFileSync(join(to, '卡組', '社會1-2', 'S1.md'), 'utf8'), '1\t大航海時代');
  writeFileSync(join(to, '評分表.md'), '| 改過 |');
  assert.throws(() => { copyDir(from, to); }, /評分表\.md 已經有了、和 .* 內容不同/);
  assert.equal(readFileSync(join(to, '評分表.md'), 'utf8'), '| 改過 |');
});
