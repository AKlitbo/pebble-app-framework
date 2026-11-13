/**
 * Specs for the shared Clay config builder.
 *
 * The builder turns a per-section description into the Clay config array each
 * face ships. The messageKeys it emits are the wire contract with the C settings
 * table and package.json, and whether an optional section appears is driven by
 * the presence of its key. Both are easy to break silently in a refactor.
 */

import fs from 'node:fs';
import path from 'node:path';
import { describe, test, expect, vi } from 'vitest';
import buildConfig from './config-builder';
import type { ClayConfigItem } from '../clay/types';
import { STOCK_PROVIDERS } from '../stock/stock';

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

/** Every row on the page, sections and their rows included. */
function allRows(config: ClayConfigItem[]): ClayConfigItem[] {
  return config.flatMap((entry) => [entry, ...allRows(entry.items || [])]);
}

const minimalTheme = { options: [{ label: 'A', value: 0 }] };

describe('buildConfig wire contract', () => {
  /** A renamed or dropped core key silently breaks the settings round-trip with the watch. */
  test('always publishes the core settings keys', () => {
    const config = buildConfig({ theme: minimalTheme });

    const keys = collectMessageKeys(config);

    expect(keys).toEqual(expect.arrayContaining([
      'APPEARANCE_THEME', 'CONNECTION_BLUETOOTH_ICON', 'CONNECTION_VIBE_CONNECT', 'CONNECTION_VIBE_DISCONNECT',
      'CLOCK_DATE_FORMAT', 'CLOCK_TIME_FORMAT',
    ]));
  });
});

describe('buildConfig optional sections', () => {
  /** A face with no stats readout declares no health keys, so the page must not offer one it never reads. */
  test('leaves the health section out unless the face shows steps or battery', () => {
    const config = buildConfig({ theme: minimalTheme });

    const result = config.some((section) => (section.items || []).some((item) => item.defaultValue === 'Health'));

    expect(result).toBe(false);
  });

  /** A face with nothing for Appearance would get the heading alone, which reads as a control that failed to load. */
  test('leaves the Appearance section out when the face has nothing for it', () => {
    const config = buildConfig({});

    const result = config.some((section) => (section.items || []).some((item) => item.defaultValue === 'Appearance'));

    expect(result).toBe(false);
  });

  /** A face that builds its control list and ends up with none would otherwise get the heading alone. */
  test('leaves the Appearance section out for an empty list of appearance controls', () => {
    const config = buildConfig({ appearanceItems: [] });

    const result = config.some((section) => (section.items || []).some((item) => item.defaultValue === 'Appearance'));

    expect(result).toBe(false);
  });

  /** A face that colours itself from its own pickers, with no theme list, still gets its controls under Appearance. */
  test('keeps the Appearance section for a face with only its own controls', () => {
    const config = buildConfig({ appearanceItems: [{ type: 'toggle', messageKey: 'APPEARANCE_INVERT', label: 'Invert' }] });

    const result = config.find((section) => (section.items || []).some((item) => item.defaultValue === 'Appearance'));

    expect(result?.items?.map((item) => item.messageKey ?? item.defaultValue)).toEqual(['Appearance', 'APPEARANCE_INVERT']);
  });

  /** A face with a battery readout and no steps gets the battery control alone, under a heading that says so. */
  test('gives a battery-only face the battery control and no steps control', () => {
    const config = buildConfig({ theme: minimalTheme, battery: {} });

    const result = collectMessageKeys(config);

    expect(result).toContain('BATTERY_DISPLAY');
    expect(result).not.toContain('HEALTH_STEPS_MODE');
    expect(config.some((section) => (section.items || []).some((item) => item.defaultValue === 'Battery'))).toBe(true);
  });

  /** A face that shows steps has to get the control that picks what the readout shows. */
  test('includes the steps control when the face shows steps', () => {
    const config = buildConfig({ theme: minimalTheme, steps: {} });

    const result = collectMessageKeys(config);

    expect(result).toContain('HEALTH_STEPS_MODE');
  });

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
    expect(keys).not.toContain('WEATHER_WIND_UNIT');
    expect(keys).not.toContain('HEALTH_STEPS_MODE');
  });

  /** If presence inclusion breaks, a full-featured face silently loses its weather,
   *  location, or temperature settings. */
  test('includes the optional keys when their sections are present', () => {
    const config = buildConfig({
      theme: minimalTheme,
      location: {},
      weather: {},
      temperature: {},
      wind: {},
    });

    const keys = collectMessageKeys(config);

    expect(keys).toEqual(expect.arrayContaining([
      'LOCATION_USE_GPS', 'LOCATION_GPS_FALLBACK', 'LOCATION_NAME', 'WEATHER_PROVIDER', 'WEATHER_API_KEY', 'WEATHER_TEMPERATURE_UNIT', 'WEATHER_WIND_UNIT',
    ]));
  });

  /** A face with only the wind unit would lose the row with nothing said if the section needed weather too. */
  test('gives a face with only the wind unit the Weather section with the row in it', () => {
    const config = buildConfig({ wind: {} });

    const result = findItemByKey(config, 'WEATHER_WIND_UNIT');

    expect(result).toMatchObject({ type: 'select', defaultValue: 0 });
  });
});

describe('buildConfig intro', () => {
  const pageIntro = (config: ClayConfigItem[]) => config.find((item) => item.type === 'text')?.defaultValue;

  /** A face with weather has to read that the page sets the weather up, without writing the line itself. */
  test('mentions weather in the default intro for a face with weather', () => {
    const result = pageIntro(buildConfig({ weather: {} }));

    expect(result).toBe('Personalize your layout, dial in your weather preferences, and make this watchface your own.');
  });

  /** A Weather section from the unit rows alone is still weather to set up, so the intro has to say so. */
  test.each([
    ['temperature', { temperature: {} }],
    ['wind', { wind: {} }],
  ])('mentions weather in the default intro for a face with only the %s unit', (_name, options) => {
    const result = pageIntro(buildConfig(options));

    expect(result).toBe('Personalize your layout, dial in your weather preferences, and make this watchface your own.');
  });

  /** A face with no Weather section must not promise weather settings it never shows. */
  test('leaves weather out of the default intro for a face without a Weather section', () => {
    const result = buildConfig({ location: {} }).find((item) => item.type === 'text');

    expect(result).toEqual({ type: 'text', defaultValue: 'Personalize your layout and make this watchface your own.' });
  });

  /** A fold can take the Weather section off, so the weather wording has to carry the plain one for the page to fall back to. */
  test('carries the plain wording on the weather intro', () => {
    const result = buildConfig({ weather: {} }).find((item) => item.type === 'text')?.introWithoutWeather;

    expect(result).toBe('Personalize your layout and make this watchface your own.');
  });

  /** A face's own intro has to win, or the default would write over it. */
  test('keeps the face\'s own intro whatever it shows', () => {
    const result = pageIntro(buildConfig({ weather: {}, intro: 'Set up the scene.' }));

    expect(result).toBe('Set up the scene.');
  });
});

describe('buildConfig API key rows', () => {
  /**
   * The key row hides for the values its condition names. A condition on the wrong select, or on a
   * value the select never offers, leaves the key box showing for a keyless provider.
   */
  test.each([
    ['WEATHER_API_KEY', 'WEATHER_PROVIDER', buildConfig({ weather: {} })],
    ['STOCK_API_KEY', 'STOCK_PROVIDER', buildConfig({ stocks: {} })],
  ])('hides %s only for values its own %s offers', (keyRow, picker, config) => {
    const condition = findItemByKey(config, keyRow)?.visibleWhen as { key: string; notIn: string[] };
    const offered = (findItemByKey(config, picker)?.options as { value: string }[]).map((option) => option.value);

    const result = condition.notIn.filter((value) => !offered.includes(value));

    expect(condition.key).toBe(picker);
    expect(result).toEqual([]);
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

describe('buildConfig theme preview picker', () => {
  /** Without previews the picker stays Clay's stock select, so a face that added none is unaffected. */
  test('keeps the plain select when the theme has no previews', () => {
    const config = buildConfig({ theme: minimalTheme });

    const picker = findItemByKey(config, 'APPEARANCE_THEME');

    expect(picker.type).toBe('select');
  });

  /** With previews the picker becomes the image component, or the pictures never reach the page. */
  test('uses the themePreview component when the theme has previews', () => {
    const previews = { 0: ['data:image/png;base64,AAAA'] };

    const config = buildConfig({ theme: { options: [{ label: 'A', value: 0 }], previews } });
    const picker = findItemByKey(config, 'APPEARANCE_THEME');

    expect(picker.type).toBe('themePreview');
  });

  /** The picker still saves under the theme key with its options and default, pictures or not. */
  test('keeps the theme key, options, default, and previews on the picture picker', () => {
    const options = [{ label: 'A', value: 0 }];
    const previews = { 0: ['data:image/png;base64,AAAA'] };

    const config = buildConfig({ theme: { options, previews } });
    const picker = findItemByKey(config, 'APPEARANCE_THEME');

    expect(picker.messageKey).toBe('APPEARANCE_THEME');
    expect(picker.options).toEqual(options);
    expect(picker.defaultValue).toBe(0);
    expect(picker.previews).toEqual(previews);
  });

  /** A theme option with no picture is a gen or manifest slip, so the builder names the one it missed. */
  test('warns once for each option with no picture', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const options = [{ label: 'A', value: 0 }, { label: 'B', value: 1 }];
    const previews = { 0: ['data:image/png;base64,AAAA'] };

    buildConfig({ theme: { options, previews } });

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain('"B"');

    warn.mockRestore();
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

/**
 * Each choice enum in setting_values.h, by its name, as the values it names. Read as text, since the
 * watch's lists are C and the page's are TypeScript, and only a spec sees both.
 */
function watchEnums(): Record<string, number[]> {
  // the wind units live in the core's wind maths, which setting_values.h includes
  const headers = ['../../c/pebble/system/settings/setting_values.h', '../../c/core/units/wind.h'];
  const enums: Record<string, number[]> = {};

  for (const header of headers.map((file) => fs.readFileSync(path.join(import.meta.dirname, file), 'utf8'))) {
    for (const match of header.matchAll(/typedef enum\s*\{([^}]*)\}\s*(\w+);/g)) {
      enums[match[2]] = [...match[1].matchAll(/=\s*(\d+)/g)].map((value) => Number(value[1]));
    }
  }

  return enums;
}

describe('buildConfig agrees with the choices the watch names', () => {
  const config = buildConfig({ theme: minimalTheme, steps: {}, battery: {}, hourlyVibe: {}, wind: {} });

  /**
   * The framework's own choice fields take their counts from these enums rather than the page, so a
   * choice added to the page and not the enum would be clamped to the default on the watch, and one
   * added to the enum and not the page would never be offered.
   */
  test.each([
    ['CLOCK_TIME_FORMAT', 'TimeFormat'],
    ['HEALTH_STEPS_MODE', 'StepsMode'],
    ['CONNECTION_VIBE_CONNECT', 'VibeChoice'],
    ['CONNECTION_VIBE_DISCONNECT', 'VibeChoice'],
    ['CLOCK_HOURLY_VIBE', 'VibeChoice'],
    ['BATTERY_DISPLAY', 'BatteryDisplay'],
    ['WEATHER_WIND_UNIT', 'WindUnit'],
  ])('offers on %s the values %s names', (key, name) => {
    const values = findItemByKey(config, key).options.map((option) => option.value);

    const result = [...values].sort((a, b) => Number(a) - Number(b));

    expect(result).toEqual(watchEnums()[name]);
  });
});

describe('buildConfig stocks and calendar', () => {
  /** A face without stocks or a calendar must not offer settings its watch never reads. */
  test('leaves both sections out unless the face asks', () => {
    const config = buildConfig({});

    const result = collectMessageKeys(config);

    expect(result).not.toContain('STOCK_SYMBOLS');
    expect(result).not.toContain('CALENDAR_ICS_URL');
  });

  /** These are the keys the phone's stock and calendar features read, so a face asking for the sections has to get them. */
  test('publishes the keys the stock and calendar features read', () => {
    const config = buildConfig({ stocks: {}, calendar: {} });

    const result = collectMessageKeys(config);

    expect(result).toEqual(expect.arrayContaining(['STOCK_PROVIDER', 'STOCK_API_KEY', 'STOCK_SYMBOLS', 'CALENDAR_ICS_URL']));
  });

  /** A face's own controls, such as a refresh interval its watch reads, belong in the same section. */
  test('adds a face\'s own controls under the tickers', () => {
    const config = buildConfig({ stocks: { items: [{ type: 'select', messageKey: 'STOCK_POLL' }] } });

    const result = findItemByKey(config, 'STOCK_POLL');

    expect(result).toBeDefined();
  });

  /**
   * A data source the phone has no provider for fetches nothing, and the watchlist stays empty. A
   * provider with no option can never be picked.
   */
  test('offers the data sources the stock feature has a provider for', () => {
    const config = buildConfig({ stocks: {} });

    const result = (findItemByKey(config, 'STOCK_PROVIDER')?.options as { value: string }[]).map((option) => option.value).sort();

    expect(result).toEqual([...STOCK_PROVIDERS].sort());
  });
});

describe('buildConfig plugin source marks', () => {
  // a face with every section the marks reach
  const fullPage = () => buildConfig({ location: {}, weather: {}, temperature: {}, calendar: {} });

  /** The weather page hook only finds the select a plugin choice joins by this mark, so without it no face offers the plugin. */
  test('marks the weather provider select as the one the weather plugin joins', () => {
    const result = findItemByKey(fullPage(), 'WEATHER_PROVIDER');

    expect(result?.pluginSource).toEqual({ category: 'weather', item: 'location' });
  });

  /**
   * An unmarked row would stay on the page in plugin mode, asking for a city, a key, or a unit nothing
   * reads. A plugin's weather comes in the plugin's own units, so the unit rows only feed a fetch too.
   */
  test('marks every row that only feeds a weather fetch, the Location Settings heading included', () => {
    const result = allRows(fullPage()).filter((row) => row.pluginSourceHides === 'WEATHER_PROVIDER');

    expect(result.map((row) => row.messageKey ?? row.defaultValue)).toEqual(['Location Settings', 'LOCATION_USE_GPS', 'LOCATION_GPS_FALLBACK', 'LOCATION_NAME', 'WEATHER_TEMPERATURE_UNIT', 'WEATHER_API_KEY']);
  });

  /**
   * The lead line sits right above the select, so hiding it would move the select under the wearer's
   * finger. A page with no select still has to know to take it away, or it asks for a choice of
   * source over nothing.
   */
  test('marks the weather lead line as leading into the select, not as a row it hides', () => {
    const result = allRows(fullPage()).filter((row) => row.pluginSourceLead === 'WEATHER_PROVIDER');

    expect(result.map((row) => [row.defaultValue, row.pluginSourceHides])).toEqual([['Choose where your watch pulls its weather data. Open-Meteo works right out of the box with no setup required.', undefined]]);
  });

  /** The lead line and the link only mean something for an iCal link, so both have to hide with it. */
  test('marks the iCal lead line and the iCal link', () => {
    const result = allRows(fullPage()).filter((row) => row.pluginSourceHides === 'CALENDAR_SOURCE');

    expect(result.map((row) => row.messageKey ?? row.type)).toEqual(['text', 'CALENDAR_ICS_URL']);
  });

  /**
   * Every face's page carries the marks, built with plugin sources or not. Clay ignores both fields,
   * and without a page hook to turn them into a visibleWhen, the only row that hides is the key row,
   * which hides for a provider that needs no key.
   */
  test('adds no visibleWhen past the key row, so a page without a page hook hides nothing else', () => {
    const result = allRows(fullPage()).filter((row) => row.visibleWhen !== undefined).map((row) => row.messageKey);

    expect(result).toEqual(['WEATHER_API_KEY']);
  });
});

describe('the Paid Plan toggle', () => {
  /** A face that does not declare STOCK_PAID_PLAN would put a key the phone cannot map into every settings save. */
  test('stays off the page unless the face asks for it', () => {
    const result = [buildConfig({ stocks: {} }), buildConfig({ stocks: { paidPlan: true } })].map((config) => Boolean(findItemByKey(config, 'STOCK_PAID_PLAN')));

    expect(result).toEqual([false, true]);
  });
});
