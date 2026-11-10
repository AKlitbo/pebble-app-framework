/**
 * Specs for the message keys and the appinfo fields the build fills in.
 *
 * The SDK numbers the keys from the list, so the order is part of the wire between the phone and the
 * watch. Worth pinning are that a face listing every key gets its own list back, so its numbers do not
 * move, that an added key goes after the face's own and only once, and which keys each feature and each
 * plugin define bring, since a key left out builds a face that never shows the reading. The defaults
 * are pinned for the one the SDK reads the wrong way when it is missing, multi JS.
 */
import { describe, expect, test } from 'vitest';
import { featureKeys, fillAppinfo, pluginDefineKeys, withAddedKeys } from './feature-keys';
import weather from '../../ts/weather/feature';
import stocks from '../../ts/stock/feature';
import calendar from '../../ts/calendar/feature';
import music from '../../ts/music/feature';

const WEATHER_KEYS = ['WEATHER_REQUEST', 'WEATHER_TEMPERATURE', 'WEATHER_CONDITIONS', 'WEATHER_OK'];

describe('featureKeys', () => {
  /** A feature that lost its keys would build a face with the feature passed and nothing for the watch to ask with or read. */
  test('reads the keys the framework features carry, in the order the face passes them', () => {
    const result = featureKeys([calendar, weather, stocks, music]);

    expect(result).toEqual(['CALENDAR_REQUEST', 'CALENDAR_STRIP', ...WEATHER_KEYS, 'STOCK_REQUEST', 'STOCK_STRIP']);
  });

  /** A face that shows coordinates passes the withCoords form, which has to bring the same keys as the plain one. */
  test('reads the weather keys off the coordinates form', () => {
    const result = featureKeys([weather.withCoords(() => ({}))]);

    expect(result).toEqual(WEATHER_KEYS);
  });

  /** Two features that need one key would put it in the list twice, which the SDK refuses. */
  test('gives each key once, and nothing for a feature that carries no list', () => {
    const own = Object.assign(() => ({}), { messageKeys: ['WEATHER_OK', 'MY_KEY'] });

    const result = featureKeys([weather, own, () => ({}), { messageKeys: ['NOT_A_FEATURE'] }]);

    expect(result).toEqual([...WEATHER_KEYS, 'MY_KEY']);
  });
});

describe('pluginDefineKeys', () => {
  /**
   * A mixed list offers the plugin on the provider select, so without the select key there is nowhere
   * to offer it. The watch keeps the pick, and only the settings reply hands it back to the phone, so
   * a face with no settings of its own and no settings pair would lose it on a reinstall.
   */
  test('brings the weather keys, the select key, and the settings pair for a mixed weather list', () => {
    const result = pluginDefineKeys({ PLUGIN_WEATHER: 1 }, { weather: ['plugin', 'openmeteo'] });

    expect(result).toEqual([...WEATHER_KEYS, 'WEATHER_PROVIDER', 'SETTINGS_REQUEST', 'SETTINGS_FRESH']);
  });

  /** A plugin only kind keeps no choice on the watch, and the build refuses the select key beside one. */
  test('leaves the select key out for a plugin only list', () => {
    const result = pluginDefineKeys({ PLUGIN_WEATHER: 1, PLUGIN_CALENDAR: 1 }, { weather: ['plugin'], calendar: ['plugin'] });

    expect(result).toEqual([...WEATHER_KEYS, 'CALENDAR_STRIP']);
  });

  /** With no list the page has the select, so the choice is kept under its key and sent back in the settings reply. */
  test('brings the calendar strip, its select key, and the settings pair with no list', () => {
    const result = pluginDefineKeys({ PLUGIN_CALENDAR: 1 }, {});

    expect(result).toEqual(['CALENDAR_STRIP', 'CALENDAR_SOURCE', 'SETTINGS_REQUEST', 'SETTINGS_FRESH']);
  });

  /** The music and phone stores ask and read with every one of their keys. */
  test('brings every music and phone key', () => {
    const result = pluginDefineKeys({ PLUGIN_MUSIC: 1, PLUGIN_PHONE: 1 }, {});

    expect(result).toEqual(['MUSIC_TITLE', 'MUSIC_ARTIST', 'MUSIC_PLAYING', 'MUSIC_REQUEST', 'PHONE_BATTERY', 'PHONE_REQUEST']);
  });

  /** A define set to 0 is off, so it brings nothing that would turn its watch code on. */
  test('brings nothing for a define at 0', () => {
    const result = pluginDefineKeys({ PLUGIN_WEATHER: 0 }, {});

    expect(result).toEqual([]);
  });
});

describe('withAddedKeys', () => {
  /** A face that still lists every key has to keep its key numbers, since the SDK numbers them from the list. */
  test('gives back the face\'s own list when it already holds every added key', () => {
    const listed = ['SETTINGS_REQUEST', 'WEATHER_OK', 'LAYOUT_SLOTS[4]', 'WEATHER_REQUEST', 'WEATHER_TEMPERATURE', 'WEATHER_CONDITIONS'];

    const result = withAddedKeys(listed, WEATHER_KEYS, 'gridlock');

    expect(result).toBe(listed);
  });

  /** An added key put ahead of the face's own would move every one of the face's numbers. */
  test('puts the keys the face leaves out after its own, in the order given', () => {
    const result = withAddedKeys(['SETTINGS_REQUEST', 'WEATHER_OK'], [...WEATHER_KEYS, 'STOCK_STRIP'], 'gridlock');

    expect(result).toEqual(['SETTINGS_REQUEST', 'WEATHER_OK', 'WEATHER_REQUEST', 'WEATHER_TEMPERATURE', 'WEATHER_CONDITIONS', 'STOCK_STRIP']);
  });

  /** The SDK refuses a key listed twice, so an array key the face lists has to count as the key. */
  test('counts a listed array key as the key', () => {
    const result = withAddedKeys(['CALENDAR_STRIP[2]'], ['CALENDAR_REQUEST', 'CALENDAR_STRIP'], 'gridlock');

    expect(result).toEqual(['CALENDAR_STRIP[2]', 'CALENDAR_REQUEST']);
  });

  /** A feature that carries an array key the face lists by its bare name would put the key in twice, which the SDK refuses. */
  test('counts a listed key as an added array key of the same name', () => {
    const listed = ['SETTINGS_REQUEST', 'SLOT'];

    const result = withAddedKeys(listed, ['SLOT[2]'], 'gridlock');

    expect(result).toBe(listed);
  });

  /** Two features that bring one key, one as an array, would put it in twice. The first form wins. */
  test('adds a key brought in two forms once', () => {
    const result = withAddedKeys(['SETTINGS_REQUEST'], ['SLOT[2]', 'SLOT'], 'gridlock');

    expect(result).toEqual(['SETTINGS_REQUEST', 'SLOT[2]']);
  });

  /** A face with no list of its own still needs the keys its features bring. */
  test('gives the added keys alone for a face that lists none', () => {
    const result = withAddedKeys(undefined, WEATHER_KEYS, 'gridlock');

    expect(result).toEqual(WEATHER_KEYS);
  });

  /** A map numbers each key by hand, so a number the build picked could clash with one the face picks later. */
  test('refuses a map that leaves out a key it would add', () => {
    const call = () => withAddedKeys({ WEATHER_REQUEST: 1, WEATHER_OK: 2 }, WEATHER_KEYS, 'gridlock');

    expect(call).toThrow("gridlock's appinfo gives messageKeys as a map, which numbers each key by hand, so the build cannot add WEATHER_TEMPERATURE and WEATHER_CONDITIONS");
  });

  /** A map that holds every key needs nothing added, so it builds as it always has. */
  test('keeps a map that holds every key', () => {
    const listed = { WEATHER_REQUEST: 1, WEATHER_TEMPERATURE: 2, WEATHER_CONDITIONS: 3, WEATHER_OK: 4 };

    const result = withAddedKeys(listed, WEATHER_KEYS, 'gridlock');

    expect(result).toBe(listed);
  });
});

describe('fillAppinfo', () => {
  const STARTED = { started: true, featureKeys: WEATHER_KEYS };

  /** A face that leaves out the repeated fields has to build the manifest it built with them written out. */
  test('fills the SDK version, multi JS, the feature keys, and the capabilities', () => {
    const result = fillAppinfo({ messageKeys: ['SETTINGS_REQUEST'], capabilities: ['health'] }, 'gridlock', STARTED, {}, {});

    expect(result).toEqual({ messageKeys: ['SETTINGS_REQUEST', ...WEATHER_KEYS], sdkVersion: '3', enableMultiJS: true, capabilities: ['health', 'location', 'configurable'] });
  });

  /** A face that still lists every field and key has to get the same appinfo, or its key numbers and manifest would move. */
  test('keeps what a face lists in full as it is', () => {
    const config = { messageKeys: [...WEATHER_KEYS], sdkVersion: '3', enableMultiJS: true, capabilities: ['location', 'configurable', 'health'] };

    const result = fillAppinfo(config, 'gridlock', STARTED, {}, {});

    expect(result).toEqual(config);
  });

  /** The SDK reads multi JS off as no phone bundle at all, so a face with it off would ship a pbw with no phone side. */
  test('refuses multi JS turned off', () => {
    const call = () => fillAppinfo({ messageKeys: [], enableMultiJS: false }, 'gridlock', STARTED, {}, {});

    expect(call).toThrow("gridlock's appinfo sets enableMultiJS to false, which leaves the framework's phone code out of the pbw");
  });

  /** Location on a face with no weather asks the wearer for a permission nothing uses, and configurable with no page shows a settings gear that opens nothing. */
  test('adds no capability a face without weather or a start does not need', () => {
    const result = fillAppinfo({ messageKeys: ['CLOCK_DATE_FORMAT'] }, 'gridlock', { started: false, featureKeys: [] }, {}, {});

    expect(result.capabilities).toBeUndefined();
  });

  /** A face with the weather define and no weather feature still reads the weather, so it still needs location. */
  test('adds location for weather the plugin define brings', () => {
    const result = fillAppinfo({ messageKeys: [] }, 'gridlock', { started: true, featureKeys: [] }, { PLUGIN_WEATHER: 1 }, { weather: ['plugin'] });

    expect(result.capabilities).toEqual(['location', 'configurable']);
  });
});
