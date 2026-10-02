/**
 * The house style, as an ESLint flat config a unit is linted with as it stands.
 *
 * 2-space indentation, single quotes, semicolons, K&R braces, braces on every control statement,
 * trailing commas on multiline literals, and a blank line around every block and after a run of
 * declarations. The framework's own code in paf/ is linted where it is written,
 * so a unit's copy is ignored here, along with its swap folders and generated or built output.
 *
 * lint.ts hands this to ESLint, which reads every pattern below from the unit's root. A unit that adds
 * rules of its own keeps a config/eslint.config.ts that spreads the default export and adds to it, and
 * the framework's own config builds on the rules and the TypeScript block.
 */
import js from '@eslint/js';
import globals from 'globals';
import stylistic from '@stylistic/eslint-plugin';
import tseslint from 'typescript-eslint';
import { defineConfig, globalIgnores } from 'eslint/config';
import type { Linter } from 'eslint';
import { SKIPPED_FOLDER_GLOBS } from './unit-folders.ts';

/** The house formatting and style rules, for any language ESLint reads. */
export const houseStyleRules = {
  '@stylistic/semi': ['error', 'always'],
  '@stylistic/quotes': ['error', 'single', { avoidEscape: true, allowTemplateLiterals: 'always' }],
  '@stylistic/indent': ['error', 2, { SwitchCase: 1 }],

  // K&R braces. compact single-line lookup tables are also allowed
  '@stylistic/brace-style': ['error', '1tbs', { allowSingleLine: true }],

  '@stylistic/eol-last': ['error', 'always'],
  '@stylistic/no-trailing-spaces': 'error',

  // trailing commas on multiline literals
  // never in function parameters or arguments
  '@stylistic/comma-dangle': ['error', {
    arrays: 'always-multiline',
    objects: 'always-multiline',
    imports: 'always-multiline',
    exports: 'always-multiline',
    functions: 'never',
  }],

  '@stylistic/object-curly-spacing': ['error', 'always'],
  '@stylistic/keyword-spacing': 'error',
  '@stylistic/space-infix-ops': 'error',
  '@stylistic/comma-spacing': 'error',
  '@stylistic/space-before-blocks': 'error',
  '@stylistic/arrow-parens': ['error', 'always'],

  // a blank line either side of every block, and after a run of declarations, so a function reads in
  // steps rather than as one wall
  '@stylistic/padding-line-between-statements': ['error',
    { blankLine: 'always', prev: '*', next: 'block-like' },
    { blankLine: 'always', prev: 'block-like', next: '*' },
    { blankLine: 'always', prev: ['const', 'let'], next: '*' },
    { blankLine: 'any', prev: ['const', 'let'], next: ['const', 'let'] },
  ],

  // always require braces around control statements
  'curly': ['error', 'all'],

  // allow the == null / != null idiom
  'eqeqeq': ['error', 'always', { null: 'ignore' }],

  'no-throw-literal': 'error',
  'no-implicit-coercion': 'error',
  'dot-notation': 'error',

  // empty catch blocks are permitted
  'no-empty': ['error', { allowEmptyCatch: true }],
} satisfies Linter.RulesRecord;

/**
 * What a unit never lints: the folders that are not its own code, which the format leaves alone too, and
 * generated or built JavaScript.
 */
export const unitIgnores = [...SKIPPED_FOLDER_GLOBS, '**/*.js'];

/** Lints every TypeScript source except declaration files, with the house style. */
export const typescript = defineConfig([
  {
    files: ['**/*.ts'],
    ignores: ['**/*.d.ts'],
    // typescript-eslint disables the core rules it replaces
    extends: [js.configs.recommended, tseslint.configs.recommended],
    plugins: {
      '@stylistic': stylistic,
    },
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.node,
        ...globals.browser,
        Pebble: 'readonly',
      },
    },
    rules: {
      ...houseStyleRules,
      // prefer the TypeScript-aware implementations
      'no-shadow': 'off',
      '@typescript-eslint/no-shadow': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          caughtErrors: 'none',
          argsIgnorePattern: '^_',
        },
      ],
    },
  },
]);

export default defineConfig([globalIgnores(unitIgnores), ...typescript]);
