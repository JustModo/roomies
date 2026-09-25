import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/main.ts'],
  format: ['cjs'],
  noExternal: [/@roomies\/.*/],
  clean: true,
  sourcemap: true,
});
