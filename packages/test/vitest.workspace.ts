import { defineWorkspace } from 'vitest/config';
import path from 'path';

export default defineWorkspace([
  {
    extends: './vitest.config.ts',
    test: { name: 'server' },
  },
  {
    resolve: {
      alias: {
        '@roomies/web': path.resolve(__dirname, '../../apps/web'),
        '@roomies/voice': path.resolve(__dirname, '../voice'),
      },
    },
    test: {
      name: 'web',
      environment: 'node',
      include: ['src/vitest/web/**/*.test.ts'],
    },
  },
]);
