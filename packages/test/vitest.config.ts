import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@roomies/web': path.resolve(__dirname, '../../apps/web'),
      '@roomies/server': path.resolve(__dirname, '../../apps/api'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    testTimeout: 20000,
    hookTimeout: 20000,
    include: ['src/suites/**/*.test.ts'],
    fileParallelism: false,
    server: {
      deps: {
        fallbackCjs: true,
      },
    },
  },
});
