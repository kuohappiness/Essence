// AI 連線模組自己的 ESLint 設定。src/ 的可攜性規則在 eslint-portability.ts（docs/tasks/ai-client.md〈3〉第 1 點）。
import tseslint from 'typescript-eslint';
import { portability } from './eslint-portability.ts';

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
  { files: ['src/**/*.ts'], ...portability },
);
