import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    setupFiles: ['./tests/setup.ts'],
    hookTimeout: 30000,
    testTimeout: 30000,
    fileParallelism: false,
  },
});
