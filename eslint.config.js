/**
 * @file ESLint configuration for the project.
 * @author Alan Chen
 */
import globals from 'globals';
import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import prettierConfig from 'eslint-config-prettier';

export default [
  // Configuration for files in the src directory
  {
    files: ['src/**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 2021,
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.jest,
      },
    },
    // ESLint's recommended rules
    ...js.configs.recommended,
    plugins: {
      'react-hooks': reactHooks,
    },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      'no-unused-vars': ['warn', {argsIgnorePattern: '^_'}],
    },
  },

  // Configuration for Prettier
  prettierConfig,

  // Global ignores for files and folders.
  // This is where you can ignore everything except src if you want to be more explicit.
  {
    ignores: [
      '**/*.test.js', // Example: ignore test files from being linted with the main config
      'node_modules/**',
      'coverage/**',
      'build/**',
      'dist/**',
    ],
  },
];
