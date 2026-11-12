/**
 * Specs for the known plugins in src/known-plugins.json.
 *
 * The file is copied by hand from the Pebble appstore and the Pebble app, so a typo in it ships to every
 * face's settings page. What is worth pinning is each field the panel and the docs read from it: a
 * uuid the panel marks a plugin installed by, a kind the panel lists it under, a store id and slug its
 * listing link is made from, no plugin twice, and when each entry was last checked.
 */

import { describe, test, expect } from 'vitest';
import knownPlugins from '../../known-plugins.json';
import { KNOWN_PLUGINS, PANEL_KINDS, UNPANELLED_KINDS } from './directory';
import type { KnownPluginEntry } from './directory';

const ENTRIES = knownPlugins as KnownPluginEntry[];

describe('known-plugins.json', () => {
  /** A uuid with a typo never matches the phone's list, so the panel never marks that plugin installed. */
  test('gives every plugin a well formed uuid', () => {
    const result = ENTRIES.filter((entry) => !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(entry.uuid)).map((entry) => entry.name);

    expect(result).toEqual([]);
  });

  /** A plugin listed twice shows twice under its heading, and the second copy's fields go unchecked. */
  test('lists no uuid twice', () => {
    const uuids = ENTRIES.map((entry) => entry.uuid.toLowerCase());

    const result = uuids.filter((uuid, index) => uuids.indexOf(uuid) !== index);

    expect(result).toEqual([]);
  });

  /** A kind spelled wrong, such as weather/locations, leaves the plugin off the panel with nothing to say why. */
  test('serves only kinds the panel lists or leaves off on purpose', () => {
    const known = [...PANEL_KINDS.map((kind) => `${kind.category}/${kind.item}`), ...UNPANELLED_KINDS];

    const result = ENTRIES.flatMap((entry) => entry.serves.filter((kind) => !known.includes(kind)).map((kind) => `${entry.name}: ${kind}`));

    expect(result).toEqual([]);
  });

  /** A store id or slug off by a character sends the wearer to a store page that does not exist. */
  test('gives every store plugin a 24 character hex id and a slug of lower case words, and a built-in neither', () => {
    const result = ENTRIES.filter((entry) => {
      if (entry.storeId === null) {
        return entry.storeSlug !== null;
      }

      return !/^[0-9a-f]{24}$/.test(entry.storeId) || entry.storeSlug === null || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(entry.storeSlug);
    }).map((entry) => entry.name);

    expect(result).toEqual([]);
  });

  /** An entry that says it was checked on a date that cannot be, or against no version, gives the next release nothing to go on. */
  test('says when each entry was last checked, on a real day', () => {
    const result = ENTRIES.filter((entry) => {
      if (entry.verifiedOn === null) {
        return entry.verifiedVersion !== null;
      }

      const day = new Date(`${entry.verifiedOn}T00:00:00Z`);

      return !/^\d{4}-\d{2}-\d{2}$/.test(entry.verifiedOn) || Number.isNaN(day.getTime()) || day.toISOString().slice(0, 10) !== entry.verifiedOn;
    }).map((entry) => entry.name);

    expect(result).toEqual([]);
  });

  /**
   * A built-in plugin has no version of its own, so it reads Built In, and a store plugin is checked
   * against the version its listing shows. A store plugin marked Built In would never be checked again.
   */
  test('says which version each entry was checked against, Built In only for a built-in', () => {
    const result = ENTRIES.filter((entry) => {
      if (entry.verifiedVersion === null) {
        return entry.verifiedOn !== null;
      }

      return entry.verifiedVersion.trim() === '' || (entry.verifiedVersion === 'Built In') !== (entry.storeId === null);
    }).map((entry) => entry.name);

    expect(result).toEqual([]);
  });

  /** The panel reads the file through KNOWN_PLUGINS, so an entry has to reach it with its kinds split as the panel matches them. */
  test('hands the panel each entry with its kinds split into category and item', () => {
    const result = KNOWN_PLUGINS.find((plugin) => plugin.name === 'Stocks + Crypto')?.serves;

    expect(result).toEqual([
      { category: 'finance', item: 'stock' },
      { category: 'finance', item: 'crypto' },
    ]);
  });
});
