/**
 * Specs for the key group check.
 *
 * The watch reads each group only when the face declares every key in it, and reads a weather group
 * only beside a reading, so a face missing a key builds cleanly and its panels never fill. Worth
 * pinning is every refusal, that each one names the key to add, and that a face declaring its groups
 * whole, or none of them, still builds.
 */
import { describe, test, expect } from 'vitest';
import { KEY_GROUPS, checkKeyGroups } from './key-groups';

/** The four weather keys every weather group is read beside. */
const WEATHER = ['WEATHER_REQUEST', 'WEATHER_TEMPERATURE', 'WEATHER_CONDITIONS', 'WEATHER_OK'];

/** The settings pair every face declares. */
const SETTINGS = ['SETTINGS_REQUEST', 'SETTINGS_FRESH'];

/** Every group read beside weather, by name, with its keys. */
const BESIDE_WEATHER = KEY_GROUPS.filter((group) => group.needs).map((group) => [group.name, group.keys] as const);

/** Every group of more than one key, by name, with its keys and what it is read beside. */
const SPLITTABLE = KEY_GROUPS.filter((group) => group.keys.length > 1).map((group) => [group.name, group.keys, group.needs?.keys ?? []] as const);

describe('checkKeyGroups', () => {
  /**
   * A face with sunrise and sunset but not the other three extras would build with neither arriving,
   * so the refusal has to name the key the face forgot rather than leave it to work out which.
   */
  test.each(SPLITTABLE)('refuses %s with its last key missing, and names that key', (_name, keys, needs) => {
    const missing = keys[keys.length - 1];
    const declared = [...needs, ...keys.slice(0, -1)];

    const call = () => checkKeyGroups(declared, 'gridlock');

    expect(call).toThrow(`Add ${missing} to messageKeys`);
  });

  /** The watch reads every weather group inside the weather block, so these keys would build and never arrive. The weather feature brings the four, so the line says to pass it. */
  test.each(BESIDE_WEATHER)('refuses %s without the four weather keys', (name, keys) => {
    const declared = [...SETTINGS, ...keys];

    const call = () => checkKeyGroups(declared, 'gridlock');

    expect(call).toThrow(`gridlock's appinfo declares ${name} without weather, and the watch only reads ${name} beside it. Pass weather from ts/weather/feature in startPebbleApp's features, which brings WEATHER_REQUEST, WEATHER_TEMPERATURE, WEATHER_CONDITIONS, and WEATHER_OK`);
  });

  /**
   * Without SETTINGS_FRESH the watch cannot tell the phone it lost its settings, so after a wipe the
   * phone copies the watch's defaults over the wearer's. Two faces whose saves were dropped on an
   * update had no SETTINGS_FRESH, and nothing put their wearers' settings back.
   */
  test('refuses SETTINGS_REQUEST without SETTINGS_FRESH', () => {
    const declared = ['SETTINGS_REQUEST', 'APPEARANCE_THEME'];

    const call = () => checkKeyGroups(declared, 'gridlock');

    expect(call).toThrow("gridlock's appinfo declares only part of the settings reply. Add SETTINGS_FRESH to messageKeys, or take SETTINGS_REQUEST out of it, and build with --clean");
  });

  /** The phone only asks for the watch's settings with SETTINGS_REQUEST, so the flag alone is never sent. */
  test('refuses SETTINGS_FRESH without SETTINGS_REQUEST', () => {
    const declared = ['SETTINGS_FRESH'];

    const call = () => checkKeyGroups(declared, 'gridlock');

    expect(call).toThrow("gridlock's appinfo declares only part of the settings reply. Add SETTINGS_REQUEST to messageKeys, or take SETTINGS_FRESH out of it, and build with --clean");
  });

  /** Two missing extras are both named, so a face fixes the gap in one go rather than one build at a time. */
  test('names every missing key of a group and offers to take out the ones declared', () => {
    const declared = [...SETTINGS, ...WEATHER, 'WEATHER_HUMIDITY', 'WEATHER_WIND_SPEED', 'WEATHER_SUNRISE'];

    const call = () => checkKeyGroups(declared, 'gridlock');

    expect(call).toThrow("gridlock's appinfo declares only part of the weather extras. Add WEATHER_WIND_DIR and WEATHER_SUNSET to messageKeys, or take WEATHER_HUMIDITY, WEATHER_WIND_SPEED, and WEATHER_SUNRISE out of it, and build with --clean");
  });

  /** A partial weather four is named as weather, not as each group read beside it. */
  test('refuses part of the weather keys as weather', () => {
    const declared = [...SETTINGS, 'WEATHER_REQUEST', 'WEATHER_TEMPERATURE', 'WEATHER_CONDITIONS', 'WEATHER_SUNRISE', 'WEATHER_SUNSET', 'WEATHER_HUMIDITY', 'WEATHER_WIND_SPEED', 'WEATHER_WIND_DIR'];

    const call = () => checkKeyGroups(declared, 'gridlock');

    expect(call).toThrow("gridlock's appinfo declares only part of weather. Add WEATHER_OK to messageKeys");
  });

  /** The richest face declares every group, and refusing any of it would stop a face that is right. */
  test('takes a face declaring every group whole beside weather', () => {
    const declared = KEY_GROUPS.flatMap((group) => group.keys);

    const call = () => checkKeyGroups(declared, 'gridlock');

    expect(call).not.toThrow();
  });

  /** A face with no weather and no coordinates opted out of them, which is no mistake. */
  test('takes a face declaring only the settings pair', () => {
    const declared = [...SETTINGS, 'APPEARANCE_THEME'];

    const call = () => checkKeyGroups(declared, 'gridlock');

    expect(call).not.toThrow();
  });

  /** A face with no settings of its own leaves the pair out, and the watch and the phone both build and run without it. */
  test('takes a face declaring neither settings key', () => {
    const declared = [...WEATHER];

    const call = () => checkKeyGroups(declared, 'gridlock');

    expect(call).not.toThrow();
  });

  /** The appinfo can list a key with an array suffix, and the check has to read it as the key or a whole group reads as part. */
  test('reads a key with an array suffix as the key', () => {
    const declared = [...SETTINGS, ...WEATHER, 'WEATHER_HUMIDITY', 'WEATHER_WIND_SPEED', 'WEATHER_WIND_DIR', 'WEATHER_SUNRISE[1]', 'WEATHER_SUNSET'];

    const call = () => checkKeyGroups(declared, 'gridlock');

    expect(call).not.toThrow();
  });

  /** A face can declare its keys as a map with numbers, and the check reads its names the same as a list. */
  test('reads the keys of a map', () => {
    const declared = { SETTINGS_REQUEST: 0, SETTINGS_FRESH: 1, LOCATION_LATITUDE: 2 };

    const call = () => checkKeyGroups(declared, 'gridlock');

    expect(call).toThrow("gridlock's appinfo declares only part of coordinates. Add LOCATION_LONGITUDE to messageKeys, or take LOCATION_LATITUDE out of it");
  });
});
