// src/ 的可攜性規則（eslint-portability.ts，L2 R4）：照規則檔本身跑 ESLint 的 Linter，預期值是手寫的程式片段。
import assert from 'node:assert/strict';
import { builtinModules } from 'node:module';
import { test } from 'node:test';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Linter } from 'eslint';
import ts from 'typescript';
import tseslint from 'typescript-eslint';
import { portability } from '../eslint-portability.ts';

const linter = new Linter({ configType: 'flat' });
const config = [{ files: ['**/*.ts'], languageOptions: { parser: tseslint.parser, sourceType: 'module' as const }, ...portability }];
const problems = (code: string) => linter.verify(code, config, 'src/probe.ts').map(m => m.ruleId);

const SRC_CONFIG = join(dirname(fileURLToPath(import.meta.url)), '..', 'tsconfig.src.json');
/** 路徑一律用 `/` 比：TypeScript 傳給 compiler host 的是 `/`，Windows 上 `join` 組出來的是 `\`（L2 第四輪 第 4 項）。 */
const slash = (path: string) => path.replaceAll('\\', '/');

/** 用套件本體的編譯設定檢查一段程式（虛擬的 src/probe.ts），回傳型別錯誤的數目；虛擬檔沒被讀到就直接報錯。 */
function typeErrors(code: string, options: ts.CompilerOptions): number {
  const file = slash(join(dirname(SRC_CONFIG), 'src', 'probe.ts'));
  const isProbe = (path: string) => slash(path) === file;
  const host = ts.createCompilerHost(options);
  const read = host.readFile.bind(host);
  const getSourceFile = host.getSourceFile.bind(host);
  let loaded = false;
  host.readFile = path => (isProbe(path) ? code : read(path));
  host.fileExists = path => isProbe(path) || ts.sys.fileExists(path);
  host.getSourceFile = (path, version, onError) => {
    if (!isProbe(path)) return getSourceFile(path, version, onError);
    loaded = true;
    return ts.createSourceFile(path, code, version);
  };
  const program = ts.createProgram([file], options, host);
  const diagnostics = ts.getPreEmitDiagnostics(program);
  assert.ok(loaded, '虛擬的 src/probe.ts 沒有被編譯器讀到');
  assert.deepEqual(diagnostics.filter(d => !d.file).map(d => ts.flattenDiagnosticMessageText(d.messageText, '\n')), [], '沒有檔案位置的診斷（例如找不到檔案）');
  return diagnostics.filter(d => d.file && isProbe(d.file.fileName)).length;
}

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

void test('可攜性：不叫全域物件，取別名、解構、轉型都一樣擋；套件本體的型別裡沒有 Node 的全域（L2 第三輪 延續 R4）', () => {
  for (const name of NODE_GLOBALS) {
    const forms = [
      `const g = globalThis; void g.${name};`,
      `const s = self; const { ${name}: x } = s;`,
      `const w = window as unknown as Record<string, unknown>; void w['${name}'];`,
      `const pick = (o: typeof globalThis) => o; void pick(globalThis);`,
    ];
    for (const code of forms) assert.notDeepEqual(problems(code), [], code);
  }
  // 型別這一層：用 tsconfig.src.json 的設定編譯一段程式，每一個 Node 的全域都是型別錯誤。
  const options = ts.parseJsonConfigFileContent(ts.readConfigFile(SRC_CONFIG, path => ts.sys.readFile(path)).config, ts.sys, dirname(SRC_CONFIG)).options;
  for (const name of NODE_GLOBALS) {
    assert.ok(typeErrors(`void ${name};\nexport {};\n`, options) > 0, `${name} 在套件本體的型別裡應該不存在`);
  }
  assert.equal(typeErrors("void fetch;\nvoid new AbortController();\nvoid new TextDecoder();\nexport {};\n", options), 0, '標準的 API 照用');
});

void test('可攜性：型別那一層也不能從程式裡打開：/// <reference> 與 declare 一律擋（L2 第四輪 第 12 項）', () => {
  const blocked = [
    '/// <reference types="node" />\nexport {};',
    '/// <reference path="./node-globals.d.ts" />\nexport {};',
    '/// <reference lib="webworker" />\nexport {};',
    'declare const process: { env: Record<string, string> };',
    'declare function setImmediate(fn: () => void): void;',
    'declare let Buffer: unknown;',
    'declare global { var Buffer: unknown }\nexport {};',
    "declare module 'node:fs' { export const readFileSync: unknown; }",
    'declare class Buffer {}',
    'declare enum E { A }',
    'declare namespace NodeJS { interface Process { env: unknown } }',
  ];
  for (const code of blocked) assert.notDeepEqual(problems(code), [], code);
  // 一般的註解、型別與介面照寫。
  const allowed = ['// <reference types="node" /> 這是普通的註解\nexport {};', 'type A = { declare: string };', 'interface B { x: number }', 'const declare = 1; void declare;'];
  for (const code of allowed) assert.deepEqual(problems(code), [], code);
});
