/**
 * ESLint flat config for the docs site's browser script.
 *
 * The framework's own config ignores plain JavaScript apart from the action scripts, so nothing checked
 * site/theme.js. This config covers it on its own, through npm --prefix docs run lint and the framework CI's
 * lint job, and leaves the framework's run as it is.
 *
 * Prettier formats the same file, so there are no style rules here. Only the correctness ones.
 *
 * The patterns are relative to this folder, since the script runs with docs/ as the working directory.
 */
import js from '@eslint/js';
import globals from 'globals';
import { defineConfig, globalIgnores } from 'eslint/config';

export default defineConfig([
  globalIgnores(['**/node_modules/', 'site/dist/']),
  {
    files: ['site/**/*.js'],
    extends: [js.configs.recommended],
    languageOptions: {
      // the script runs in the browser as a plain script, not as a module
      ecmaVersion: 'latest',
      sourceType: 'script',
      globals: globals.browser,
    },
    rules: {
      // empty catch blocks are permitted, and an unused catch binding is too, the same as the framework's own config
      'no-empty': ['error', { allowEmptyCatch: true }],
      'no-unused-vars': [
        'error',
        {
          caughtErrors: 'none',
          argsIgnorePattern: '^_',
        },
      ],
    },
  },
]);
