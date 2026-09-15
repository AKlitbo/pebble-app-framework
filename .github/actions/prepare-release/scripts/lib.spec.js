/**
 * Specs for reading a release tag and its changelog entry.
 *
 * The entry is published as the release notes word for word, and a release cannot be edited quietly once
 * people have seen it. What is worth pinning is where the tag splits, where an entry starts and stops, and
 * that an entry nobody dated is not read as dated.
 */
import { describe, expect, test } from 'vitest';
import { isDated, readChangelogEntry, splitTag } from './lib.js';

const CHANGELOG = [
  '# Changelog - LCARS Stardate',
  '',
  '## [1.12.0] - Unreleased',
  '',
  '### Added',
  '',
  '- Added a thing nobody has dated yet.',
  '',
  '## [1.11.0] - 2026-09-07',
  '',
  '### Added',
  '',
  '- Added a Next Alarm readout for the ops slots.',
  '',
  '### Fixed',
  '',
  '- Fixed the frame not loading.',
  '',
  '## [1.10.0] - 2026-08-26',
  '',
  '- Added two date formats.',
  '',
  '[1.11.0]: https://github.com/AKlitbo/pebble-watchface-lcars/compare/lcars-stardate-v1.10.0...lcars-stardate-v1.11.0',
  '[1.10.0]: https://github.com/AKlitbo/pebble-watchface-lcars/releases/tag/lcars-stardate-v1.10.0',
].join('\n');

describe('splitTag', () => {
  /** Splitting at the first -v would release a face called retro and look for version apor-v1.0.0. */
  test('splits at the last -v, so a face name can hold one', () => {
    const result = splitTag('retro-vapor-v1.0.0');

    expect(result).toEqual({ face: 'retro-vapor', version: '1.0.0' });
  });

  /** A tag the trigger let through but with no -v in it has no version to check against. */
  test('refuses a tag with no -v', () => {
    const result = splitTag('lcars-stardate-1.11.0');

    expect(result).toBeNull();
  });
});

describe('readChangelogEntry', () => {
  /** Notes that ran on into the next entry would publish the previous release's changes as this one's. */
  test('reads the entry from its heading up to the next one', () => {
    const result = readChangelogEntry(CHANGELOG, '1.11.0');

    expect(result).toEqual({
      date: '2026-09-07',
      body: '### Added\n\n- Added a Next Alarm readout for the ops slots.\n\n### Fixed\n\n- Fixed the frame not loading.',
    });
  });

  /** The oldest entry has no heading after it, and the link references below it would land in its notes. */
  test('stops the oldest entry before the link references', () => {
    const result = readChangelogEntry(CHANGELOG, '1.10.0');

    expect(result.body).toBe('- Added two date formats.');
  });

  /** A file written on Windows keeps a carriage return on every line, which would stop any heading matching. */
  test('reads a changelog with Windows line endings', () => {
    const result = readChangelogEntry(CHANGELOG.replace(/\n/g, '\r\n'), '1.11.0');

    expect(result.date).toBe('2026-09-07');
  });

  /** A version with no entry has to be told apart from an empty one, so the message can say which. */
  test('gives null when no heading names the version', () => {
    const result = readChangelogEntry(CHANGELOG, '2.0.0');

    expect(result).toBeNull();
  });
});

describe('isDated', () => {
  /** An entry still marked Unreleased means the changelog was never finished, and it must not ship as the notes. */
  test.each([['Unreleased', false], ['', false], ['2026-09-07', true]])("reads '%s' as dated: %s", (date, dated) => {
    const result = isDated(date);

    expect(result).toBe(dated);
  });
});
