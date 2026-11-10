/**
 * Specs for the standard readings check.
 *
 * The phone holds a plugin's data only to that plugin's own manifest, so this check is the one thing
 * that tells the wearer a plugin the face cannot read was picked. Wrong one way, the built-in plugins
 * get a warning they do not deserve. Wrong the other way, a plugin with its own names passes and the
 * face sits on dashes with no word why. The manifests below are the built-in plugins' as the mobile
 * app declares them.
 */

import { describe, test, expect } from 'vitest';
import { CALENDAR_STANDARD, declaresStandard, servesItem, WEATHER_STANDARD } from './standard';
import type { PluginSummary } from './types';

// the built-in weather plugin's manifest block, in full
const builtInWeather: PluginSummary = {
  uuid: '00000000-0000-0000-0001-000000000002',
  name: 'Weather',
  sources: [
    {
      category: 'weather',
      items: ['location'],
      properties: {
        name: ['shortText'],
        temperature: ['shortText', 'longText', 'numericValue'],
        feels_like: ['shortText', 'longText', 'numericValue'],
        high: ['shortText', 'longText', 'numericValue'],
        low: ['shortText', 'longText', 'numericValue'],
        condition: ['shortText', 'longText', 'icon', 'image'],
        condition_code: ['longText'],
        uv_index: ['numericValue', 'shortText'],
        precipitation: ['numericValue', 'shortText'],
        hourly_temperature: ['series.numericValue', 'series.shortText'],
        hourly_condition_code: ['series.longText'],
        daily_sunrise: ['series.timestamp'],
        daily_sunset: ['series.timestamp'],
        wind_speed: ['numericValue', 'shortText'],
        sunrise: ['timestamp'],
        sunset: ['timestamp'],
      },
    },
  ],
  actions: [],
};

// the built-in calendar plugin's manifest block, in full
const builtInCalendar: PluginSummary = {
  uuid: '00000000-0000-0000-0001-000000000004',
  name: 'Calendar',
  sources: [
    {
      category: 'calendar',
      items: ['event'],
      properties: {
        name: ['shortText', 'longText'],
        location: ['shortText', 'longText'],
        starts_at: ['shortText', 'longText', 'timestamp'],
        ends_at: ['shortText', 'timestamp'],
        all_day: ['boolean'],
        calendar: ['shortText'],
      },
    },
  ],
  actions: [],
};

/** A third-party weather plugin declaring only the properties given. */
function weatherWith(properties: Record<string, string[]>): PluginSummary {
  return {
    uuid: 'third-party',
    name: 'Someone Else Weather',
    sources: [{ category: 'weather', items: ['location'], properties }],
  };
}

describe('declaresStandard', () => {
  /** The built-in weather plugin is the one most wearers have, and it must never get the warning. */
  test('passes the built-in weather manifest', () => {
    const result = declaresStandard(builtInWeather, 'weather', 'location', WEATHER_STANDARD);

    expect(result).toBe(true);
  });

  /** The built-in calendar plugin must pass too, since its names are the only calendar standard there is. */
  test('passes the built-in calendar manifest', () => {
    const result = declaresStandard(builtInCalendar, 'calendar', 'event', CALENDAR_STANDARD);

    expect(result).toBe(true);
  });

  /** A plugin with its own name for the temperature reaches the face, which then reads nothing. */
  test('fails a plugin that says temp in place of temperature', () => {
    const plugin = weatherWith({ temp: ['numericValue'], condition_code: ['longText'] });

    const result = declaresStandard(plugin, 'weather', 'location', WEATHER_STANDARD);

    expect(result).toBe(false);
  });

  /** A temperature only offered as text cannot be converted to the face's own unit. */
  test('fails a plugin whose temperature offers only text', () => {
    const plugin = weatherWith({ temperature: ['shortText', 'longText'], condition_code: ['longText'] });

    const result = declaresStandard(plugin, 'weather', 'location', WEATHER_STANDARD);

    expect(result).toBe(false);
  });

  /** An event with no end still lands on the agenda with an hour, so a working plugin that sends none must not get the warning. */
  test('passes a calendar plugin that declares no end', () => {
    const plugin: PluginSummary = {
      sources: [{ category: 'calendar', items: ['event'], properties: { name: ['longText'], starts_at: ['timestamp'] } }],
    };

    const result = declaresStandard(plugin, 'calendar', 'event', CALENDAR_STANDARD);

    expect(result).toBe(true);
  });

  /** A calendar plugin with its own names leaves every event off the agenda. */
  test('fails a calendar plugin that says title and start', () => {
    const plugin: PluginSummary = {
      sources: [{ category: 'calendar', items: ['event'], properties: { title: ['longText'], start: ['timestamp'], end: ['timestamp'] } }],
    };

    const result = declaresStandard(plugin, 'calendar', 'event', CALENDAR_STANDARD);

    expect(result).toBe(false);
  });

  /** A plugin serving only the hours ahead has the right names but no place to read them from. */
  test('fails a plugin that declares the names under another item', () => {
    const plugin: PluginSummary = {
      sources: [{ category: 'weather', items: ['hour'], properties: { temperature: ['numericValue'], condition_code: ['longText'] } }],
    };

    const result = declaresStandard(plugin, 'weather', 'location', WEATHER_STANDARD);

    expect(result).toBe(false);
  });

  /** A list entry the phone mangled must read as not standard rather than throw on the settings page. */
  test.each([
    ['nothing at all', undefined],
    ['no sources', { uuid: 'x' }],
    ['a source with no properties', { sources: [{ category: 'weather', items: ['location'] }] }],
    ['a property that is not a list', { sources: [{ category: 'weather', items: ['location'], properties: { temperature: 'numericValue' } }] }],
  ])('fails a plugin with %s', (_label, plugin) => {
    const result = declaresStandard(plugin as PluginSummary, 'weather', 'location', WEATHER_STANDARD);

    expect(result).toBe(false);
  });
});

describe('servesItem', () => {
  /** The Preferred Source choice only appears when something can answer it. */
  test('finds the item among the installed plugins', () => {
    const result = servesItem([builtInCalendar, builtInWeather], 'weather', 'location');

    expect(result).toBe(true);
  });

  /** A plugin serving another item in the same category cannot answer the face's subscription. */
  test('does not count a plugin serving another item in the category', () => {
    const plugins: PluginSummary[] = [{ sources: [{ category: 'weather', items: ['hour'] }] }];

    const result = servesItem(plugins, 'weather', 'location');

    expect(result).toBe(false);
  });

  /** A list holding a null entry must not throw, so the rest of the list is still read. */
  test('reads past an entry that is not a plugin', () => {
    const plugins = [null, builtInCalendar] as unknown as PluginSummary[];

    const result = servesItem(plugins, 'calendar', 'event');

    expect(result).toBe(true);
  });
});
