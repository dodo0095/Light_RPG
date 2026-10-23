import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // 只撿 TypeScript 測試檔，避免誤跑 .js 編譯殘留
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'tests/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/*.js'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      include: ['src/core/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/core/types.ts'],
      reporter: ['text', 'html'],
    },
  },
});
