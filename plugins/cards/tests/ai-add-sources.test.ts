import test from 'node:test';
import assert from 'node:assert/strict';
import { planSources, SOURCE_WHY } from '../src/core/ai/index.ts';
import type { SourceProps as SourceOwner } from '../src/core/ai/index.ts';
import { parseDeck, readSourceParts } from '../src/core/deck/index.ts';

// tasks/ai-cards-add.md §3-3：出處只轉寫認得的寫法，照讀出的歸屬寫，寫後重讀核對；其他整項留著。只用自編的內容。

const owner = (term: string | null, code: string | null, subject: string | null = '自然', materials: string[] = []): SourceOwner =>
  ({ term, subject, unit: code === null ? null : { code, name: '' }, materials });
/** 目的地：國二上自然 2-1 的一篇，一個目標，sources 是它現有的出處（null 是沒有出處那一行）。 */
const destText = (sources: string | null, head = '---\n年級學期: 國二上\n科目: 自然\n單元: "2-1 密度"\n---\n'): string =>
  `${head}- 能說出密度 ^k3m9qa\n${sources === null ? '' : `    - 出處：${sources}\n`}    - 密度？ :: 質量除以體積\n`;
const TARGET_LINE = 5;
const plan = (sources: string[], source: SourceOwner, dest: string | null | { text: string }, extra: Partial<Parameters<typeof planSources>[0]> = {}) => {
  const text = typeof dest === 'object' && dest !== null ? dest.text : destText(dest);
  return planSources({ sources, source, text, target: text.split('\n').findIndex(line => line.startsWith('- 能說出密度')), version: '0.5.0', ...extra });
};
/** 加完之後目的地這個目標的出處欄。 */
const sourcesAfter = (result: ReturnType<typeof plan>): string[] => {
  assert.equal(result.kind, 'ok', JSON.stringify(result));
  return result.kind === 'ok' ? parseDeck(result.text).targets[0].fields.sources : [];
};
/** 讀出的歸屬：單元（含年級學期）與位置。 */
const readAs = (sources: string[], term = '國二上', code = '2-1') => readSourceParts(sources, owner(term, code)).flatMap(part => part.items.map(item => ({ scope: part.scope, text: item.text, link: item.link })));
const LEAVE = { kind: 'leave', why: SOURCE_WHY };

void test('§3-3 同一個單元：這一篇的位置照原文；去重只加缺的', () => {
  assert.equal(TARGET_LINE, destText('p.1').split('\n').indexOf('- 能說出密度 ^k3m9qa'));
  assert.deepEqual(sourcesAfter(plan(['p.15'], owner('國二上', '2-1'), 'p.44')), ['p.44', 'p.15']);
  // 已有 p.44、來源 p.44、46 → 只加 p.46。
  const once = plan(['p.44', '46'], owner('國二上', '2-1'), 'p.44');
  assert.deepEqual(sourcesAfter(once), ['p.44', 'p.46']);
  // 全部本來就在：不改字。
  const same = plan(['p.44'], owner('國二上', '2-1'), 'p.44');
  assert.deepEqual(same, { kind: 'ok', text: destText('p.44'), adds: [] });
  // 同單元別名（`２－１`、`2–1`、`2之1`）也算同一個單元。
  for (const alias of ['２－１', '2–1']) assert.deepEqual(sourcesAfter(plan(['p.15'], owner('八上', alias), 'p.44')), ['p.44', 'p.15'], alias);
});

void test('§3-3 不同單元：這一篇的位置寫成 <年級學期> <單元編號> <位置>、<位置>；範圍與說明保留；已有的不再寫', () => {
  const after = sourcesAfter(plan(['pp.44-46', '課本 p.47', 'p.45 知識快遞'], owner('國二上', '2-2'), 'p.10'));
  assert.deepEqual(after, ['p.10', '國二上 2-2 pp.44-46', '課本 p.47', 'p.45 知識快遞']);
  const read = readAs(after);
  assert.deepEqual(read.slice(1).map(each => each.scope), [{ term: '國二上', unit: '2-2' }, { term: '國二上', unit: '2-2' }, { term: '國二上', unit: '2-2' }]);
  // 部分去重：已有 國二上 2-2 p.44，來源 p.44、46 → 只加 p.46。
  assert.deepEqual(sourcesAfter(plan(['p.44', '46'], owner('國二上', '2-2'), '國二上 2-2 p.44')), ['國二上 2-2 p.44', '國二上 2-2 p.46']);
  // 寫這一篇自己的單元編號、`本單元`：不硬加前綴（不會變成 國二上 2-2 2-2 p.15）。
  assert.deepEqual(sourcesAfter(plan(['2-2 p.15', '本單元 p.16'], owner('國二上', '2-2'), 'p.10')), ['p.10', '國二上 2-2 p.15', 'p.16']);
  // `課本 p.44` 與 `習作 p.44`、`pp.44-46` 與 `pp.44-48` 不同；`p.45 知識快遞` 與同頁不同說明不同。
  assert.deepEqual(sourcesAfter(plan(['習作 p.44'], owner('國二上', '2-2'), '國二上 2-2 課本 p.44')), ['國二上 2-2 課本 p.44', '國二上 2-2 習作 p.44']);
  assert.deepEqual(sourcesAfter(plan(['pp.44-48'], owner('國二上', '2-2'), '國二上 2-2 pp.44-46')), ['國二上 2-2 pp.44-46', '國二上 2-2 pp.44-48']);
  assert.deepEqual(sourcesAfter(plan(['p.45 實驗'], owner('國二上', '2-2'), '國二上 2-2 p.45 知識快遞')), ['國二上 2-2 p.45 知識快遞', '國二上 2-2 p.45 實驗']);
});

void test('§3-3 寫明的別的單元：整串照原文；每一項都已經有才不寫', () => {
  assert.deepEqual(sourcesAfter(plan(['國二上 1-3 p.20', 'p.21'], owner('國二上', '2-2'), 'p.10')).slice(1, 3), ['國二上 1-3 p.20', 'p.21']);
  const carried = sourcesAfter(plan(['國二上 L1', 'L2 p.20'], owner('國二上', '2-2'), 'p.10'));
  assert.deepEqual(carried.slice(1, 3), ['國二上 L1', 'L2 p.20']);
  // 都已經有：只補課（來源 2-2 在目的地沒有歸屬）。
  const present = plan(['國二上 1-3 p.20'], owner('國二上', '2-2'), '國二上 1-3 p.20、國二上 2-2');
  assert.deepEqual(present, { kind: 'ok', text: destText('國二上 1-3 p.20、國二上 2-2'), adds: [] });
});

void test('§3-3 補課：同科不同單元，目的地讀不到來源單元的歸屬就加 <年級學期> <單元編號>；同單元不加；沒有出處那一行也加', () => {
  assert.deepEqual(sourcesAfter(plan([], owner('國二上', '2-2'), null)), ['國二上 2-2']);
  assert.deepEqual(sourcesAfter(plan([], owner('國二上', '2-2'), 'p.10')), ['p.10', '國二上 2-2']);
  assert.deepEqual(plan([], owner('國二上', '2-1'), 'p.10'), { kind: 'ok', text: destText('p.10'), adds: [] });
  // 這次加的位置已經帶來源單元：不再補課。
  assert.deepEqual(sourcesAfter(plan(['p.30'], owner('國二上', '2-2'), null)), ['國二上 2-2 p.30']);
  // 來源沒有年級學期：寫不出來，留項。
  assert.deepEqual(plan([], owner(null, '2-2'), 'p.10'), LEAVE);
});

void test('§3-3 不收的寫法整項留著：連結、標題、只有本單元、讀法有問題、承接不只是記號、一段兩個位置、來源屬性不足', () => {
  const src = owner('國二上', '2-2');
  for (const sources of [
    ['[[補充#甲|附錄]]'], ['國二上 1-3 [附錄](補充.md#附錄)'], ['p.44 https://x.test 45'],
    ['材料標題'], ['國二上 1-3 水溶液'], ['本單元'], ['不是 2-1'], ['國二上 p.15'], ['第2章第1節 p.15'],
    ['圖2-13a', 'b'], ['圖2-14 表2-1'],
  ]) assert.deepEqual(plan(sources, src, 'p.10'), LEAVE, sources.join('、'));
  // 來源沒有單元卻有本地位置。
  assert.deepEqual(plan(['p.15'], owner('國二上', null), 'p.10'), LEAVE);
  // 跨科：整項留著，含沒有出處時的補課。
  assert.deepEqual(plan(['p.15'], owner('國二上', '2-2', '社會'), 'p.10'), LEAVE);
  assert.deepEqual(plan([], owner('國二上', '2-2', '社會'), null), LEAVE);
});

void test('§3-3 小表單拒寫（兩處出處、接續行）就留項；材料：沒給端點留項、端點不同留項、相同照常', () => {
  const two = { text: '---\n年級學期: 國二上\n科目: 自然\n單元: "2-1 密度"\n---\n- 能說出密度 ^k3m9qa\n    - 出處：p.1\n    - 出處：p.2\n    - 密度？ :: 質量除以體積\n' };
  assert.deepEqual(plan(['p.15'], owner('國二上', '2-1'), two), LEAVE);
  const withMaterial = owner('國二上', '2-2', '自然', ['[[課本]]']);
  assert.deepEqual(plan(['p.15'], withMaterial, 'p.10'), LEAVE);
  assert.deepEqual(plan(['p.15'], withMaterial, 'p.10', { endpoint: (_link, side) => side === 'source' ? '課本.md#^p15' : '別本.md#^p15' }), LEAVE);
  const ok = plan(['p.15'], withMaterial, 'p.10', { endpoint: link => link.kind === 'block' || (link.kind === 'unit' && link.rest?.kind === 'block') ? '課本.md#^p15' : null });
  assert.deepEqual(sourcesAfter(ok), ['p.10', '國二上 2-2 p.15']);
});
