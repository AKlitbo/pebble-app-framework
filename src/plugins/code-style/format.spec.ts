/**
 * Specs for which files paf format hands to Prettier.
 *
 * Prettier rewrites whatever it is given, so the choice of files is the whole decision. What is worth
 * pinning is the files a tool writes in a layout of its own. Formatting one of those leaves the tool and
 * the formatter rewriting each other's output, and paf check failing after every paf format.
 */
import { describe, expect, test } from 'vitest';
import { formats, prettierIsOn } from './format.ts';
import type { CodeStyleConfig } from './format.ts';

describe('formats', () => {
  /**
   * The icons generator writes each appinfo media entry on one line, which Prettier would wrap, so the icon
   * check would fail after every format. npm and paf write the other files, and icons.json is a table kept
   * in columns by hand.
   */
  test.each([
    'pebble.appinfo.json',
    'gridlock/pebble.appinfo.json',
    'package.json',
    'package-lock.json',
    'paf.config.json',
    'resources/icons.json',
    'gridlock/resources/icons.json',
  ])('leaves %s to the tool that writes it', (file) => {
    const result = formats(file);

    expect(result).toBe(false);
  });

  /** A generated file reformatted by hand reads as stale to the check that regenerates it. */
  test.each(['frame/css/antonio.g.css', 'src/pkjs/clay/vibrant.g.json'])('leaves the generated %s alone', (file) => {
    const result = formats(file);

    expect(result).toBe(false);
  });

  /**
   * The framework copy and third-party files are not the unit's to rewrite, and a build sandbox is thrown
   * away. An editor's settings folder is gitignored, so formatting it failed a check on a laptop that CI
   * passed.
   */
  test.each([
    'paf/plugins/frame/css/pebble-colors.css',
    'paf.paf-new/tsconfig.json',
    'targets/gridlock-face/package.json',
    'node_modules/sharp/package.json',
    'vendor/weather-icons/css/weather-icons.css',
    'coverage/coverage-final.json',
    '.vscode/settings.json',
    '.claude/settings.local.json',
    '.tmp/shots/notes.json',
  ])('skips %s', (file) => {
    const result = formats(file);

    expect(result).toBe(false);
  });

  /** A frame page is baked into pixels and a Clay template is flattened line by line, so a re-wrap changes what ships. */
  test.each(['frame/classic~emery.html', 'core/pkjs/clay/builder/html/theme.html', 'src/pkjs/index.ts', 'README.md'])('leaves %s to other tools', (file) => {
    const result = formats(file);

    expect(result).toBe(false);
  });

  /** A unit that turned Prettier on and got nothing formatted would think its files were clean. */
  test.each([
    'frame/css/theme_classic.css',
    'core/pkjs/clay/builder/css/chrome.css',
    'config/tsconfig.json',
    'src/data/slot-presets.json',
    '.github/workflows/ci.yml',
  ])('formats %s', (file) => {
    const result = formats(file);

    expect(result).toBe(true);
  });
});

describe('prettierIsOn', () => {
  /**
   * Listing the plugin for its lint must not rewrite a unit's CSS and JSON on the next paf format. The
   * setting comes from JSON, so it can hold anything, and only true itself turns Prettier on.
   */
  test.each([[{}], [{ plugins: {} }], [{ plugins: { 'code-style': {} } }], [{ plugins: { 'code-style': { prettier: false } } }], [{ plugins: { 'code-style': { prettier: 'false' } } }], [{ plugins: { 'code-style': { prettier: 1 } } }]])('is off for %j', (config) => {
    const result = prettierIsOn(config as CodeStyleConfig);

    expect(result).toBe(false);
  });

  /** A unit that set it and still got the skip line would think its files were formatted. */
  test('is on when the code-style plugin sets prettier', () => {
    const result = prettierIsOn({ plugins: { 'code-style': { prettier: true } } });

    expect(result).toBe(true);
  });
});
