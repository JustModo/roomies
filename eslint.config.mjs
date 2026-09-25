import js from '@eslint/js';
import tseslint from 'typescript-eslint';

const SERVER_SOURCES = ['apps/api/src/**/*.ts', 'packages/{config,contracts,library,transcoding}/src/**/*.ts'];

export default tseslint.config(
  { ignores: ['**/dist', '**/node_modules', 'apps/web', 'apps/api/prisma', '**/*.js', '**/*.mjs'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      // Best-effort cleanup deliberately swallows errors.
      'no-empty': ['error', { allowEmptyCatch: true }],
    },
  },
  {
    files: SERVER_SOURCES,
    rules: {
      // Server code logs through an injected logger.
      'no-console': 'error',
      // NOTE: Everything is wired in a composition root; module-level instances and statics would bypass it.
      'no-restricted-syntax': [
        'error',
        { selector: 'Program > VariableDeclaration > VariableDeclarator > NewExpression', message: 'No module-level instances; construct it in a composition root.' },
        { selector: 'Program > ExportNamedDeclaration > VariableDeclaration > VariableDeclarator > NewExpression', message: 'No module-level instances; construct it in a composition root.' },
        { selector: 'PropertyDefinition[static=true], MethodDefinition[static=true]', message: 'No static state or methods; inject an instance.' },
      ],
    },
  },
  {
    files: ['apps/api/src/**/*.ts'],
    ignores: ['apps/api/src/app.ts', 'apps/api/src/index.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: [{ group: ['**/database/sqlite'], message: 'The Prisma client is injected; only app.ts creates it.' }] },
      ],
    },
  },
  {
    // Tests reach into internals and build throwaway fixtures.
    files: ['packages/test/src/**/*.ts'],
    rules: { '@typescript-eslint/no-explicit-any': 'off' },
  },
);
