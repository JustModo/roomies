import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@roomies/server': path.resolve(__dirname, '../../apps/api'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    globalSetup: path.resolve(__dirname, 'src/setup/global.ts'),
    setupFiles: [path.resolve(__dirname, 'src/setup/env.ts')],
    testTimeout: 10000,
    hookTimeout: 8000,
    include: ['src/suites/**/*.test.ts'],
    fileParallelism: true,
    pool: 'forks',

    poolOptions: {
      forks: {
        isolate: true,
      },
    },
    server: {
      deps: {
        fallbackCjs: true,
      },
    },
  },
});

