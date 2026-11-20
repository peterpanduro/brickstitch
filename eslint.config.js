import js from '@eslint/js';
import ts from 'typescript-eslint';
import svelte from 'eslint-plugin-svelte';
import globals from 'globals';

export default ts.config(
  {
    ignores: ['dist', 'node_modules', 'coverage', 'tests/fixtures', '.claude'],
  },
  js.configs.recommended,
  ts.configs.recommended,
  { rules: { '@typescript-eslint/no-unused-vars': ['error', { varsIgnorePattern: '^_' }] } },
  svelte.configs['flat/recommended'],
  { languageOptions: { globals: { ...globals.browser, ...globals.node } } },
  {
    files: ['**/*.svelte', '**/*.svelte.ts'],
    languageOptions: { parserOptions: { parser: ts.parser } },
  },
  ...['src/core/*.ts', 'src/core/*/*.ts', 'src/core/*/*/**/*.ts'].map((glob, depth) => ({
    files: [glob],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex: `^(?!\\.{1,2}/)|^(\\.\\./){${depth + 1},}`,
              message: 'src/core must not import packages or anything outside src/core.',
            },
          ],
        },
      ],
    },
  })),
  {
    files: ['src/export-pdf/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['**/ui', '**/ui/**'], message: 'export-pdf must not import src/ui.' },
          ],
        },
      ],
    },
  },
);
