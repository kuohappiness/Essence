// 給新專案的模板（D-247，docs/tasks/project-starter-template.md〈7〉）：驗收第 1、7 項，與〈9〉第 1 件查證的結果。
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const REPO = fileURLToPath(new URL('../../', import.meta.url));
const TEMPLATE = join(REPO, 'templates/project-starter');
/** 起步包與成長包；成長包在第 3 批才建，還沒有時只查起步包。 */
const PACKS = ['files', 'growth'].map(dir => join(TEMPLATE, dir)).filter(dir => existsSync(dir));
/** 唯一可以提到 Essence 的一行（任務說明〈2〉）。 */
const SOURCE_LINE = { file: 'files/docs/workflow.md', prefix: '模板來源：' };

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}
const rel = (path: string) => relative(TEMPLATE, path).split(sep).join('/');

void test('模板：起步包與成長包不帶 Essence 的產品、名稱與決定編號（驗收第 1 項）', () => {
  const words = /essence|cards|capture|mindboard|portal|obsidian|vault/i;
  const problems: string[] = [];
  let sourceLines = 0;
  for (const path of PACKS.flatMap(walk)) {
    const file = rel(path);
    if (words.test(file)) problems.push(`${file}：檔名`);
    readFileSync(path, 'utf8').split('\n').forEach((line, index) => {
      if (file === SOURCE_LINE.file && line.startsWith(SOURCE_LINE.prefix)) {
        sourceLines++;
        return;
      }
      const word = words.exec(line)?.[0];
      if (word) problems.push(`${file}:${index + 1}：${word}`);
      for (const [id, number] of line.matchAll(/\bD-(\d+)\b/g)) {
        if (!['001', '002', '003'].includes(number)) problems.push(`${file}:${index + 1}：${id}（範例只用 D-001～D-003 與 D-xxx）`);
      }
    });
  }
  assert.deepEqual(problems, []);
  assert.equal(sourceLines, 1, `${SOURCE_LINE.file} 要剛好有一行出處（開頭「${SOURCE_LINE.prefix}」）`);
});

void test('模板：code-quality 的上游授權全文和 Essence 那份一樣（驗收第 7 項）', () => {
  const license = (path: string) => {
    const text = readFileSync(path, 'utf8');
    const block = /```\n(MIT License[\s\S]*?)```/.exec(text)?.[1];
    assert.ok(block, `${path} 找不到授權全文`);
    return block;
  };
  assert.equal(
    license(join(TEMPLATE, 'files/dot-claude/skills/code-quality/UPSTREAM.md')),
    license(join(REPO, '.claude/skills/code-quality/UPSTREAM.md')),
  );
});

void test('模板：起步包的 Claude 設定放在 dot-claude/，Essence 的 session 才不會載入模板的 skill（〈9〉第 1 件）', () => {
  assert.equal(existsSync(join(TEMPLATE, 'files/.claude')), false, 'files/.claude 會被 Essence 的 session 當成巢狀設定載入；改放 files/dot-claude');
  const skills = readdirSync(join(TEMPLATE, 'files/dot-claude/skills')).sort();
  assert.deepEqual(skills, ['code-quality', 'decision', 'discuss']);
  for (const skill of skills) {
    const text = readFileSync(join(TEMPLATE, 'files/dot-claude/skills', skill, 'SKILL.md'), 'utf8');
    assert.match(text, new RegExp(`^---\\nname: ${skill}\\n`), `${skill} 的 SKILL.md 開頭要是 name: ${skill}`);
  }
});
