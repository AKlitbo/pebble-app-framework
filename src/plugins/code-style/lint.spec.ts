/**
 * Specs for which config paf lint hands ESLint.
 *
 * The lint itself is ESLint's. What this decides is which config it runs with, and a wrong answer is
 * silent: the lint still passes, on rules the unit never chose or on none at all. Those are worth
 * pinning, since nothing in a face repo fails when they go wrong.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import { tempDir } from '../../ts/testing/temp-dir.ts';
import { configFile, configFrom } from './lint.ts';

/** A unit folder holding the files given, each empty. */
function unitWith(files: string[]): string {
  const unit = tempDir('code-style-');
  for (const file of files) {
    fs.mkdirSync(path.dirname(path.join(unit, file)), { recursive: true });
    fs.writeFileSync(path.join(unit, file), '');
  }
  return unit;
}

describe('configFile', () => {
  /** A unit that added rules of its own and was linted with the house style alone would pass code its own rules refuse. */
  test('takes the unit\'s own config when it keeps one in config/', () => {
    const unit = unitWith(['config/eslint.config.ts']);

    const result = configFile(unit);

    expect(result).toBe(path.join(unit, 'config', 'eslint.config.ts'));
  });

  /** A root config is where an editor's ESLint looks, so a unit that keeps its rules there has to be linted with them too. */
  test.each(['eslint.config.ts', 'eslint.config.js', 'eslint.config.mjs'])('takes a %s at the unit\'s root', (name) => {
    const unit = unitWith([name]);

    const result = configFile(unit);

    expect(result).toBe(path.join(unit, name));
  });

  /** A root file is usually a pointer for the editor, so the one in config/ is the one that holds the rules. */
  test('takes the one in config/ over one at the root', () => {
    const unit = unitWith(['eslint.config.ts', 'config/eslint.config.ts']);

    const result = configFile(unit);

    expect(result).toBe(path.join(unit, 'config', 'eslint.config.ts'));
  });

  /** A unit with no config of its own that was handed none would be linted on ESLint's defaults, which check no TypeScript. */
  test('takes the house style when the unit keeps no config', () => {
    const unit = unitWith(['config/vitest.config.ts']);

    const result = path.basename(path.dirname(configFile(unit)));

    expect(result).toBe('code-style');
  });
});

describe('configFrom', () => {
  /** ESLint handed nothing lints no TypeScript, so a config with no default export passed every unit with nothing checked. */
  test.each([[undefined], [null], [[]], ['recommended'], [[undefined]]])('refuses %j as a default export', (exported) => {
    const call = () => configFrom(exported, 'config/eslint.config.ts');

    expect(call).toThrow('config/eslint.config.ts has no config as its default export');
  });

  /** A unit's list of blocks goes to ESLint as it is, the house style's blocks and its own. */
  test('hands back the list a config file exports', () => {
    const blocks = [{ rules: { curly: 'error' } }, { rules: { 'no-console': 'error' } }];

    const result = configFrom(blocks, 'config/eslint.config.ts');

    expect(result).toBe(blocks);
  });

  /** ESLint takes a single block as a config too, so refusing one would stop a unit whose config is valid. */
  test('puts a single block in a list of its own', () => {
    const block = { rules: { curly: 'error' } };

    const result = configFrom(block, 'config/eslint.config.ts');

    expect(result).toEqual([block]);
  });
});
