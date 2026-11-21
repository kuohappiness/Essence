// 共用工具自己的 ESLint 設定（D-208 第二步 §A2）：照 Cards 的設定對 tools/ 生效的那些規則搬一份。
// Cards 專用的邊界規則（src/ 的模組邊界、D-148）不搬：共用工具不能 import plugins/，由 check-app-imports 擋。
import tseslint from 'typescript-eslint';

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
  { ignores: ['node_modules/**'] },
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
