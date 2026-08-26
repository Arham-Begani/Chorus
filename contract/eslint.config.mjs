// Lint config for the Chorus contract package.
//
// Deliberately minimal and self-contained: the contract package has no React,
// no browser bundling and no framework. Compiler-generated output under
// src/managed/ is excluded — it is machine-written and not ours to style.

import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['dist/**', 'src/managed/**', '*.cjs', '*.mjs'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.ts'],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // Unused args are fine when prefixed with _ — the simulator destructures
      // tuple entries it does not need (e.g. `for (const [c, _count] of ...)`).
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
);
