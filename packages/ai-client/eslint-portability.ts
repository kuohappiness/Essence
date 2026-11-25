// 套件的可攜性規則（docs/tasks/ai-client.md〈3〉第 1 點，L2 R4）：src/ 要能在瀏覽器、Workers 與 Obsidian 手機跑，
// 所以不 import 任何 Node 內建模組（node: 開頭或裸名稱，例如 util、fs/promises）與 obsidian，不用動態 import 與 require，
// 也不用 Node 才有的全域（Buffer、process 等）。全域物件 globalThis、self、window 一律不叫：取別名、解構、轉型之後
// 規則追不到，所以連名字都不准出現（L2 第三輪 延續 R4）；型別那一層另由 tsconfig.src.json（沒有 Node 的型別）擋。
// 模組清單照執行 ESLint 的 Node 的 builtinModules（含 _ 開頭的），不手寫。
import { builtinModules } from 'node:module';
import type { Linter } from 'eslint';

const NODE_GLOBALS = ['Buffer', 'process', 'require', 'module', 'exports', '__dirname', '__filename', 'global', 'setImmediate', 'clearImmediate'];
const GLOBAL_OBJECTS = ['globalThis', 'self', 'window'];
const message = '套件要能在瀏覽器、Workers 與 Obsidian 手機跑，src/ 只用標準的 fetch、AbortController、TextDecoder、TextEncoder（docs/tasks/ai-client.md〈3〉第 1 點）。';

export const portability: Linter.Config = {
  rules: {
    'no-restricted-imports': ['error', {
      paths: [...builtinModules.map(name => ({ name, message })), { name: 'obsidian', message }],
      patterns: [{ group: ['node:*'], message }],
    }],
    'no-restricted-syntax': ['error',
      { selector: 'ImportExpression', message: `動態 import：${message}` },
      { selector: "CallExpression[callee.name='require']", message: `require：${message}` },
    ],
    'no-restricted-globals': ['error',
      ...NODE_GLOBALS.map(name => ({ name, message: `${name} 是 Node 才有的全域：${message}` })),
      ...GLOBAL_OBJECTS.map(name => ({ name, message: `不叫全域物件 ${name}（取了別名就查不到用了什麼）；標準的 API 直接寫名字：${message}` })),
    ],
  },
};
