/**
 * ESLint flat config.
 *
 * Lints all hand-authored TypeScript in the framework: everything under src/, the
 * framework-only tools/, and the configs.
 *
 * The house style comes from the code-style plugin, which is what a unit is linted with, so the
 * framework and every face share one copy: 2-space indentation, single quotes, semicolons, K&R braces,
 * mandatory braces for control statements, trailing commas on multiline literals, and a blank line around
 * every block and after a run of declarations.
 *
 * The JavaScript in .github/actions/ and .github/shared/ is the CI action scripts, which actions/github-script can only
 * load as plain .js, so it is linted with the same house style. Every other JavaScript file is generated
 * and skipped.
 *
 * The ignore patterns live in here as well.
 */
import js from '@eslint/js';
import globals from 'globals';
import stylistic from '@stylistic/eslint-plugin';
import { defineConfig, globalIgnores } from 'eslint/config';
import { houseStyleRules, typescript } from './src/plugins/code-style/eslint.config.ts';

export default defineConfig([
  // ignore generated output and staged build artifacts
  globalIgnores([
    'node_modules/',
    '**/build/',
    'vendor/',
    '**/*.js',
    '!.github/actions/**/*.js',
    '!.github/shared/**/*.js',
    'targets/',
  ]),
  // the action scripts are CommonJS, since github-script loads them with require
  {
    files: ['.github/actions/**/*.js', '.github/shared/**/*.js'],
    extends: [js.configs.recommended],
    plugins: {
      '@stylistic': stylistic,
    },
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'commonjs',
      globals: globals.node,
    },
    rules: houseStyleRules,
  },
  // their specs and fakes are ES modules, which Vitest runs and which import the scripts
  {
    files: ['.github/actions/**/*.spec.js', '.github/shared/**/*.spec.js', '.github/shared/fakes.js'],
    languageOptions: {
      sourceType: 'module',
    },
  },
  // every TypeScript source except declaration files, as the plugin lints a unit's
  ...typescript,
]);
