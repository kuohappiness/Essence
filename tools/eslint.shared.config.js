// 共用工具自己的 ESLint 設定（D-208 第二步 §A2）：照 Cards 的設定對 tools/ 生效的那些規則搬一份。
// Cards 專用的邊界規則（src/ 的模組邊界、D-148）不搬：共用工具不能 import plugins/，由 check-plugin-imports 擋。
// 檔名不叫 eslint.config.js：ESLint 依檔案所在的資料夾找設定，搬家前 Cards 從根目錄 lint tools/ 裡的 Cards 工具時會改用這份；
// lint 用 -c 指定。§A6 搬走 Cards 的工具後改回 eslint.config.js。
import tseslint from 'typescript-eslint';

// 搬家前 tools/ 裡還有 Cards 的工具（tools/dispatch.ts 的 CARDS_TOOL），由 Cards 的檢查管；§A6 搬走後刪這一段。
const cardsTools = [
  'backup.ts', 'bench-study.ts', 'build.mjs', 'build.d.mts', 'compare-versions.ts', 'compare/**', 'exam-reminder.ts',
  'export-compare.ts', 'git.ts', 'install.ts', 'install-vault.mjs', 'knip.mjs', 'locate.ts', 'node-files.ts', 'restore.ts',
  'update-vault.ts', 'vault-io.ts',
];

// 測試不改全域的 Node 內建模組（第一個里程碑回顧的 R1）：Node 自己的實作也呼叫它們，換掉的結果隨 Node 版本改變。
const builtinPatch = {
  group: ['node:module', 'module'], importNames: ['syncBuiltinESMExports'],
  message: '測試不改全域的 Node 內建模組：把替身直接交給要測的函式（docs/agents/quality.md〈本專案的做法〉）。',
};
const builtinAssign = {
  selector: "AssignmentExpression > MemberExpression.left[object.name=/^(fs|fsPromises|path|os|childProcess|child_process)$/]",
  message: builtinPatch.message,
};

export default tseslint.config(
  { ignores: ['node_modules/**', ...cardsTools] },
  {
    files: ['*.ts', 'tests/**/*.ts'],
    extends: [tseslint.configs.recommendedTypeChecked],
    languageOptions: { parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname } },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { ignoreRestSiblings: true }],
    },
  },
  {
    files: ['tests/**/*.{ts,mjs}'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [builtinPatch] }],
      'no-restricted-syntax': ['error', builtinAssign],
    },
  },
);
