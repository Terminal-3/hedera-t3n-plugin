import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'node_modules', 'vitest.config.ts', 'vitest.e2e.config.ts', '.eslintrc.cjs'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.node,
      parserOptions: {
        project: './tsconfig.eslint.json',
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/require-await': 'warn',
      '@typescript-eslint/no-unsafe-assignment': 'warn',
      'prefer-const': 'error',
    },
  },
  {
    files: ['tests/e2e/**/*.ts'],
    ignores: ['tests/e2e/run-e2e.ts', 'tests/e2e/helpers/e2e-options.ts'],
    languageOptions: {
      parserOptions: {
        project: false,
      },
    },
    rules: {
      '@typescript-eslint/require-await': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
    },
  },
  {
    files: ['tests/e2e/run-e2e.ts', 'tests/e2e/helpers/e2e-options.ts'],
    languageOptions: {
      parserOptions: {
        project: './tests/e2e/tsconfig.json',
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
);
