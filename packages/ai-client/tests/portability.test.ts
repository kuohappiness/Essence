// src/ 的可攜性規則（eslint-portability.ts，L2 R4）：照規則檔本身跑 ESLint 的 Linter，預期值是手寫的程式片段。
import assert from 'node:assert/strict';
import { builtinModules } from 'node:module';
import { test } from 'node:test';
import { Linter } from 'eslint';
import tseslint from 'typescript-eslint';
import { portability } from '../eslint-portability.ts';

const linter = new Linter({ configType: 'flat' });
const config = [{ files: ['**/*.ts'], languageOptions: { parser: tseslint.parser, sourceType: 'module' as const }, ...portability }];
const problems = (code: string) => linter.verify(code, config, 'src/probe.ts').map(m => m.ruleId);

void test('可攜性：Node 內建模組（裸名稱、node:、子路徑、型別）、obsidian、動態 import、require、Node 的全域都擋', () => {
  const blocked = [
    "import { inspect } from 'util';",
    "import { readFile } from 'fs/promises';",
    "import { join } from 'path/posix';",
    "import { Buffer as B } from 'node:buffer';",
    "import type { Agent } from 'https';",
    "export { createHash } from 'crypto';",
    "import 'obsidian';",
    "const m = await import('node:util');",
    "const m = await import('./other.ts');",
    "const fs = require('fs');",
    "const b = Buffer.from('a');",
    'const env = process.env.KEY;',
    'const here = __dirname;',
    'setImmediate(() => undefined);',
  ];
  for (const code of blocked) assert.notDeepEqual(problems(code), [], code);
});

void test('可攜性：相對路徑與標準的 fetch、AbortController、TextDecoder、計時器照用', () => {
  const allowed = [
    "import { encodeBody } from './body.ts';",
    "import type { Usage } from '../types.ts';",
    "const r = await fetch('https://example.com', { signal: new AbortController().signal });",
    'const t = new TextDecoder().decode(new TextEncoder().encode("a"));',
    'const h = setTimeout(() => undefined, 1); clearTimeout(h);',
    "const u = new URL('https://example.com');",
  ];
  for (const code of allowed) assert.deepEqual(problems(code), [], code);
});

// Node 才有、瀏覽器與 Workers 沒有的全域（Node 文件〈Global objects〉裡不是 Web 標準的那些）。
const NODE_GLOBALS = ['Buffer', 'process', 'require', 'module', 'exports', '__dirname', '__filename', 'global', 'setImmediate', 'clearImmediate'];

void test('可攜性：每一個 Node 內建模組（含 _ 開頭的）、每一個 Node 才有的全域，用哪種寫法都擋（L2 第二輪 延續 R4）', () => {
  for (const name of builtinModules) {
    for (const code of [`import x from '${name}';`, `export * from '${name}';`, `import type { X } from '${name}';`, `const m = await import('${name}');`]) {
      assert.notDeepEqual(problems(code), [], code);
    }
  }
  for (const name of NODE_GLOBALS) {
    const forms = [`void ${name};`, `void globalThis.${name};`, `void globalThis['${name}'];`, `void self.${name};`, `void window.${name};`, `const { ${name}: x } = globalThis;`];
    for (const code of forms) assert.notDeepEqual(problems(code), [], code);
  }
});
