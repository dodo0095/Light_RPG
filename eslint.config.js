import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  { ignores: ['dist/', 'coverage/', 'node_modules/', 'dev-dist/', 'src/**/*.js'] },
  js.configs.recommended,
  ...tseslint.configs.strict,
  {
    languageOptions: {
      globals: { ...globals.browser },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
  {
    // 依賴方向：core 不得依賴 UI 框架、IndexedDB 或其他層（architecture.md 第 5 節）
    files: ['src/core/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            { name: 'preact', message: 'src/core 是純邏輯層，不得 import preact。' },
            { name: 'idb', message: 'src/core 不得直接存取 IndexedDB（idb）。' },
            {
              name: 'zod',
              message:
                'src/core 只依賴純 TS 型別，不得 import zod；驗證放在 src/config 或 src/content。',
            },
          ],
          patterns: [
            {
              group: ['zod/*'],
              message: 'src/core 不得 import zod 相關模組。',
            },
            {
              group: ['preact/*', '@preact/*'],
              message: 'src/core 是純邏輯層，不得 import preact 相關套件。',
            },
            {
              regex: '(^|/)(storage|services|ui)(/|$)',
              message:
                'src/core 不得依賴 storage／services／ui（依賴方向：ui → services → core）。',
            },
          ],
        },
      ],
    },
  },
  prettier,
);
