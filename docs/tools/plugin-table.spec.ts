/**
 * Specs for the Supported Plugins table in docs/how/plugin-sources.md.
 *
 * The table is written from src/known-plugins.json, the file the settings page's panel reads. What is
 * worth pinning is that the guide's table is the one the file gives, so a plugin added to the panel
 * cannot be missing from the docs, and that each cell reads as a wearer or face author expects.
 */
import fs from 'node:fs';
import { describe, expect, test } from 'vitest';
import { currentGuide, GUIDE_FILE, markerLines, pluginTable, TABLE_END, TABLE_START, withTable } from './plugin-table.ts';
import type { TableEntry } from './plugin-table.ts';

describe('the Supported Plugins table', () => {
  /** A guide that lost a marker, or the whole table, has nothing for the table to sit between, and the check beside this would pass on it. */
  test('holds each marker once, on a line of its own', () => {
    const lines = fs.readFileSync(GUIDE_FILE, 'utf8').split('\n');

    const result = [markerLines(lines, TABLE_START).length, markerLines(lines, TABLE_END).length];

    expect(result).toEqual([1, 1]);
  });

  /** An entry changed without writing the table again leaves the docs naming plugins the panel does not, or the other way round. */
  test('matches the data file', () => {
    const result = fs.readFileSync(GUIDE_FILE, 'utf8');

    expect(result).toBe(currentGuide());
  });

  /** A built-in with a store link, or a store plugin with none, sends the reader the wrong way, and an unchecked entry must say so. */
  test('links a store plugin, names where a built-in runs, and says when each was checked', () => {
    const entries: TableEntry[] = [
      { name: 'Music', uuid: 'a', storeId: null, storeSlug: null, serves: ['music/track'], maker: 'Pebble', where: 'Android Only', verifiedVersion: 'Built In', verifiedOn: '2026-11-10' },
      { name: 'Rain', uuid: 'b', storeId: '0123456789abcdef01234567', storeSlug: 'rain', serves: ['weather/location'], maker: 'Someone', verifiedVersion: null, verifiedOn: null, gives: { 'weather/location': 'Rain only' } },
    ];

    const result = pluginTable(entries).split('\n').slice(2);

    expect(result).toEqual([
      '| `music/track` | Music (Android Only) | Pebble | The standard fields | Built In, 10 Nov 2026 |',
      '| `weather/location` | [Rain](https://apps.repebble.com/rain_0123456789abcdef01234567) | Someone | Rain only | Not yet |',
    ]);
  });

  /** A marker missing, doubled, or only quoted in a sentence would have the table written over the text around it. */
  test.each([
    ['no markers', '# A Guide\n'],
    ['the start alone', `a\n${TABLE_START}\nold\n`],
    ['two ends', `a\n${TABLE_START}\nold\n${TABLE_END}\nkeep me\n${TABLE_END}\n`],
    ['the end first', `a\n${TABLE_END}\nold\n${TABLE_START}\n`],
    ['a marker quoted in a sentence', `the table sits after \`${TABLE_START}\` and\n${TABLE_END}\n`],
  ])('refuses a guide with %s', (_label, guide) => {
    const result = () => withTable(guide, '| a |');

    expect(result).toThrow('once each');
  });

  /** A guide saved with Windows line ends still has its markers found, and the lines around the table keep their ends. */
  test('writes the table into a guide with Windows line ends', () => {
    const result = withTable(`a\r\n${TABLE_START}\r\nold\r\n${TABLE_END}\r\nz\r\n`, '| a |');

    expect(result).toBe(`a\r\n${TABLE_START}\r\n\n| a |\n\n${TABLE_END}\r\nz\r\n`);
  });
});
