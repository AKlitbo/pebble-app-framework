/**
 * Specs for the house style config a unit is linted with.
 *
 * ESLint reads the config's patterns from the unit's root, so the same file serves every unit. What is
 * worth pinning is what it leaves out. An ignore that goes missing lints the framework copy in every
 * unit, and nothing but a lint run in a face repo would notice.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import { ESLint } from 'eslint';
import config from './eslint.config.ts';

// the folder stands in for a unit's root, and no file has to exist for ESLint to say what it would skip
const eslint = new ESLint({ cwd: import.meta.dirname, overrideConfigFile: true, overrideConfig: config });

describe('the house style config', () => {
  /** A unit's paf/ is the framework's code, so linting it reports errors the unit cannot fix. */
  test.each([
    'paf/ts/pkjs/app.ts',
    'paf.paf-old/ts/pkjs/app.ts',
    'targets/gridlock/src/pkjs/index.ts',
    'vendor/weather-icons/build.ts',
    'src/pkjs/clay/layout-component.g.js',
    'coverage/lcov-report/sorter.ts',
    'gridlock/node_modules/thing/index.ts',
  ])('skips %s', async (file) => {
    const result = await eslint.isPathIgnored(file);

    expect(result).toBe(true);
  });

  /**
   * A dot folder holds an editor's or a tool's own files, such as a second checkout of the repo under
   * .claude/worktrees/, whose paf/ is not filled. Linting it fails a unit on code that is not its own, and
   * the format already leaves the same folders alone.
   */
  test.each([
    '.claude/worktrees/one/src/pkjs/index.ts',
    '.tmp/scratch.ts',
    'gridlock/.cache/table.ts',
  ])('skips %s', async (file) => {
    const result = await eslint.isPathIgnored(file);

    expect(result).toBe(true);
  });

  /** A pattern that swallowed the unit's own code would pass a lint that checked nothing. */
  test.each([
    'src/pkjs/index.ts',
    '.github/scripts/release.ts',
    'gridlock/src/pkjs/config.ts',
    'core/tools/vibrant/generate-vibrant.ts',
    'config/vitest.config.ts',
  ])('lints %s', async (file) => {
    const result = await eslint.isPathIgnored(file);

    expect(result).toBe(false);
  });
});

describe('the packages the plugin lists', () => {
  /**
   * typescript-eslint needs typescript as a peer. When the plugin does not list it, npm puts
   * typescript-eslint in the plugin's own folder in a unit with no lock yet and never writes it there, so
   * paf lint cannot load this config in any new unit.
   */
  test('lists typescript beside typescript-eslint', () => {
    const listed = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, 'package.json'), 'utf8')).dependencies;

    const result = Object.keys(listed).filter((name) => name === 'typescript' || name === 'typescript-eslint');

    expect(result).toEqual(['typescript', 'typescript-eslint']);
  });
});
