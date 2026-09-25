/**
 * Specs for the shared Clay config builder.
 *
 * The builder turns a per-section description into the Clay config array each
 * face ships. The messageKeys it emits are the wire contract with the C settings
 * table and package.json, and whether an optional section appears is driven by
 * the presence of its key. Both are easy to break silently in a refactor.
 */

import { describe, test, expect, vi } from 'vitest';
import buildConfig from './config-builder';
import type { ClayConfigItem } from '../clay/types';

/** Collects every messageKey the config publishes, at any depth, so a nested item is not missed. */
function collectMessageKeys(config: ClayConfigItem[]): string[] {
  return config.flatMap((entry) => [
    ...(entry.messageKey ? [entry.messageKey] : []),
    ...collectMessageKeys(entry.items || []),
  ]);
}

/** Finds a config item by its messageKey, at any depth. */
function findItemByKey(config: ClayConfigItem[], messageKey: string): ClayConfigItem | undefined {
  for (const entry of config) {
    const found = entry.messageKey === messageKey ? entry : findItemByKey(entry.items || [], messageKey);
    if (found) {
      return found;
    }
  }

  return undefined;
}

const minimalTheme = { options: [{ label: 'A', value: 0 }] };

describe('buildConfig wire contract', () => {
  /** A renamed or dropped core key silently breaks the settings round-trip with the watch. */
  test('always publishes the core settings keys', () => {
    const config = buildConfig({ theme: minimalTheme });

    const keys = collectMessageKeys(config);

    expect(keys).toEqual(expect.arrayContaining([
      'APPEARANCE_THEME', 'CONNECTION_BLUETOOTH_ICON', 'CONNECTION_VIBE_CONNECT', 'CONNECTION_VIBE_DISCONNECT',
      'CLOCK_DATE_FORMAT', 'CLOCK_TIME_FORMAT', 'HEALTH_STEPS_MODE',
    ]));
  });
});

describe('buildConfig optional sections', () => {
  /** A face that opts out of weather/location/temperature must not publish those keys,
   *  or the phone offers settings the watch never reads. */
  test('omits the optional keys when their sections are absent', () => {
    const config = buildConfig({ theme: minimalTheme });

    const keys = collectMessageKeys(config);

    expect(keys).not.toContain('LOCATION_USE_GPS');
    expect(keys).not.toContain('LOCATION_GPS_FALLBACK');
    expect(keys).not.toContain('LOCATION_NAME');
    expect(keys).not.toContain('WEATHER_PROVIDER');
    expect(keys).not.toContain('WEATHER_API_KEY');
    expect(keys).not.toContain('WEATHER_TEMPERATURE_UNIT');
  });

  /** If presence inclusion breaks, a full-featured face silently loses its weather,
   *  location, or temperature settings. */
  test('includes the optional keys when their sections are present', () => {
    const config = buildConfig({
      theme: minimalTheme,
      location: {},
      weather: {},
      temperature: {},
    });

    const keys = collectMessageKeys(config);

    expect(keys).toEqual(expect.arrayContaining([
      'LOCATION_USE_GPS', 'LOCATION_GPS_FALLBACK', 'LOCATION_NAME', 'WEATHER_PROVIDER', 'WEATHER_API_KEY', 'WEATHER_TEMPERATURE_UNIT',
    ]));
  });
});

describe('buildConfig per-section values', () => {
  /** If the builder dropped the face's theme list, the user could not pick their watch's themes. */
  test('passes the face theme options through to the THEME select', () => {
    const themeOptions = [
      { label: 'Classic', value: 0 },
      { label: 'Nemesis Blue', value: 3 },
    ];

    const config = buildConfig({ theme: { options: themeOptions } });
    const themeSelect = findItemByKey(config, 'APPEARANCE_THEME');

    expect(themeSelect.options).toEqual(themeOptions);
  });

  /** A wrong default date format shows the user the wrong date layout on first install. */
  test('applies the face date default to the DATE_FORMAT select', () => {
    const config = buildConfig({ theme: minimalTheme, date: { default: '%a %d %b' } });

    const dateSelect = findItemByKey(config, 'CLOCK_DATE_FORMAT');

    expect(dateSelect.defaultValue).toBe('%a %d %b');
  });

  /** Only readout_date fills the token in, so a face that never asked would show a raw brace. */
  test('leaves the .beats date formats out unless the face opts in', () => {
    const config = buildConfig({ theme: minimalTheme });

    const dateSelect = findItemByKey(config, 'CLOCK_DATE_FORMAT');
    const result = dateSelect.options.filter((option) => String(option.value).includes('{B}'));

    expect(result).toEqual([]);
  });

  /** The {B} token is what the C side swaps for a reading, so a typo here shows a raw brace. */
  test('appends the .beats date formats when the face opts in', () => {
    const config = buildConfig({ theme: minimalTheme, date: { beats: true } });

    const dateSelect = findItemByKey(config, 'CLOCK_DATE_FORMAT');
    const result = dateSelect.options.slice(-2);

    expect(result.map((option) => option.value)).toEqual(['%m%d.{B}', '%Y.%m%d.{B}']);
  });

  /** date_format is a 16 byte field on the watch, so a longer value arrives truncated. */
  test('keeps every stock date format inside the watch buffer', () => {
    const config = buildConfig({ theme: minimalTheme, date: { beats: true } });

    const dateSelect = findItemByKey(config, 'CLOCK_DATE_FORMAT');
    const result = dateSelect.options.filter((option) => String(option.value).length > 15);

    expect(result).toEqual([]);
  });

  /** A face that wants GPS on by default would silently ship with it off if the default leaked. */
  test('defaults GPS off when the location section omits gpsDefault', () => {
    const config = buildConfig({ theme: minimalTheme, location: {} });

    const gpsToggle = findItemByKey(config, 'LOCATION_USE_GPS');

    expect(gpsToggle.defaultValue).toBe(false);
  });

  /** A face that opts GPS on must carry that through, or first-run users get no automatic weather. */
  test('honors gpsDefault when the location section sets it', () => {
    const config = buildConfig({ theme: minimalTheme, location: { gpsDefault: true } });

    const gpsToggle = findItemByKey(config, 'LOCATION_USE_GPS');

    expect(gpsToggle.defaultValue).toBe(true);
  });
});

describe('buildConfig time zone picker', () => {
  /**
   * A second clock does not need weather, so the picker has to come from the Clock section. A face
   * with no location section would otherwise have no way to set it.
   */
  test('adds the picker to the Clock section when the clock asks for it', () => {
    const config = buildConfig({ theme: minimalTheme, clock: { timeZone: true } });

    const clockSection = config.find((item) => item.type === 'section' && item.items?.[0]?.defaultValue === 'Clock');

    expect(findItemByKey(clockSection?.items ?? [], 'CLOCK_TIMEZONE_1')?.type).toBe('locationsearch');
  });

  /** The picker needs the CLOCK_TIMEZONE_1 key, so a face that does not ask must not get an item it cannot save. */
  test.each([
    ['no clock option', { location: {} }],
    ['an empty clock option', { clock: {} }],
    ['timeZone set to false', { clock: { timeZone: false } }],
  ])('leaves the picker out with %s', (_label, options) => {
    const config = buildConfig({ theme: minimalTheme, ...options });

    const result = collectMessageKeys(config);

    expect(result).not.toContain('CLOCK_TIMEZONE_1');
  });

  /**
   * An options object built in a variable gets past the type check, so a face still passing
   * location.timeZone would lose its picker with nothing said. The warning names the new option.
   */
  test('warns when a face still passes location.timeZone', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const options = { theme: minimalTheme, location: { gpsDefault: false, timeZone: true } };

    buildConfig(options);

    expect(warn).toHaveBeenCalledWith(expect.stringContaining('clock: { timeZone: true }'));
    warn.mockRestore();
  });
});

describe('buildConfig time format choices', () => {
  /** A reordered or dropped choice silently stores a different format than the label promises,
   *  so picking 24-hour could hand the watch .beats. */
  test('publishes the stock time format choices in their wire order', () => {
    const config = buildConfig({ theme: minimalTheme });

    const timeSelect = findItemByKey(config, 'CLOCK_TIME_FORMAT');

    expect(timeSelect.options.map((option) => option.value)).toEqual([0, 1, 4, 2, 3]);
  });
});
