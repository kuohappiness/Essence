// AI 連線模組自己的 ESLint 設定。套件不 import 呼叫它的軟體（docs/tasks/ai-client.md〈3〉第 1 點）：
// src/ 不能用 Node 專用的模組，也不能 import obsidian（瀏覽器、Workers、Obsidian 手機都要能跑）。
import tseslint from 'typescript-eslint';

const portable = {
  patterns: [
    { group: ['node:*', 'obsidian', 'fs', 'path', 'http', 'https', 'child_process'], message: '套件要能在瀏覽器、Workers 與 Obsidian 手機跑，src/ 不用 Node 專用的模組（docs/tasks/ai-client.md〈3〉第 1 點）。' },
  ],
};

export default tseslint.config(
  { ignores: ['node_modules/**'] },
  {
    files: ['**/*.ts'],
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
    files: ['src/**/*.ts'],
    rules: { 'no-restricted-imports': ['error', portable] },
  },
);
