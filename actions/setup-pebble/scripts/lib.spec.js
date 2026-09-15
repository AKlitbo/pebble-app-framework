/**
 * Specs for reading what pebble-tool prints about itself.
 *
 * The output below is shaped from a real pebble-tool 5.0.39 run in WSL, colour codes included. What is
 * worth pinning is the active SDK, since that is the version the summary reports and a pinned build is
 * checked against, and the update notices, which arrive wrapped in colour codes.
 */
import { describe, expect, test } from 'vitest';
import { readNotices, readSdkList, readVersion } from './lib.js';

const SDK_LIST = ['Installed SDKs:', '4.17 (active)', '4.4', '', 'Available SDKs:', '4.5', '4.9.127', '4.33.1'].join('\n');

const NOTICES = [
  '',
  '\x1b[1m\x1b[33mA new SDK is available: v4.33.1 (current: v4.17)\x1b[0m',
  '\x1b[33m  Update with: pebble sdk install latest\x1b[0m',
  '',
  '\x1b[1m\x1b[33mA new pebble-tool is available: v5.0.40 (current: v5.0.39)\x1b[0m',
  '\x1b[33m  Update with: uv tool upgrade pebble-tool\x1b[0m',
].join('\n');

describe('readVersion', () => {
  /** The active SDK is what a pinned build is checked against, so reading it wrong fails a good build or passes a bad one. */
  test('reads the tool version and the active SDK', () => {
    const result = readVersion('Pebble Tool v5.0.39 (active SDK: v4.17)\n');

    expect(result).toEqual({ tool: '5.0.39', activeSdk: '4.17' });
  });

  /** With no SDK the tool drops the bracket, and missing that would report a missing SDK as a broken install. */
  test('reads no active SDK as an empty string', () => {
    const result = readVersion('Pebble Tool v5.0.39\n');

    expect(result).toEqual({ tool: '5.0.39', activeSdk: '' });
  });

  /** Output of another shape, such as a crash, must not pass for a version. */
  test('returns null when the version line is not there', () => {
    const result = readVersion('Traceback (most recent call last):');

    expect(result).toBeNull();
  });
});

describe('readSdkList', () => {
  /** The available block lists SDKs that are not on the runner, and counting them would make the summary lie. */
  test('reads only the installed SDKs and the one marked active', () => {
    const result = readSdkList(SDK_LIST);

    expect(result).toEqual({ installed: ['4.17', '4.4'], active: '4.17' });
  });
});

describe('readNotices', () => {
  /** The notices come wrapped in colour codes, and left in they would stop the match and hide a newer SDK. */
  test('reads each update notice through its colour codes', () => {
    const result = readNotices(NOTICES);

    expect(result).toEqual([
      { what: 'SDK', latest: '4.33.1', current: '4.17' },
      { what: 'pebble-tool', latest: '5.0.40', current: '5.0.39' },
    ]);
  });
});
