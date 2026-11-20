/**
 * Specs for reading the wearer's preferences from the Pebble app's built-in Preferences plugin.
 *
 * A plugin app serves the weather in these units and labels its events on this clock, so a unit read
 * wrong shows a wearer on °F the weather in °C, and a refused read taken for a real °C tells a
 * settings page the wrong thing. What is worth pinning is the plugin's own choices against the
 * Pebble app's, the defaults, telling a refusal and a reply with no units apart from a real answer,
 * and the clock and locale read beside them.
 */

import { describe, test, expect } from 'vitest';
import { DEFAULT_UNITS, NO_UNITS, pebbleAppUnits, preferencesFrom, readPebbleAppPreferences, readPebbleAppUnits, unitsFrom } from './preferences';
import { NO_REASON } from './runtime';
import type { PluginPebble } from './runtime';
import type { SourceEnvelope } from '../plugin-sources/types';

/** A `preferences/units` update with one instance whose properties are each the text given. */
function unitsUpdate(texts: Record<string, string>): SourceEnvelope {
  const properties = Object.fromEntries(Object.entries(texts).map(([name, value]) => [name, { shortText: { text: value } }]));

  return { pluginUuid: '00000000-0000-0000-0001-000000000009', validUntilMs: null, instances: [{ instanceId: 'units', properties }] };
}

describe('unitsFrom', () => {
  /** The Pebble app's preferences as its Preferences plugin serves them. */
  const PREFERENCES = { instances: [{ instanceId: 'units', properties: { temperature: { shortText: { text: '°F' } }, wind_speed: { shortText: { text: 'm/s' } }, pressure: { shortText: { text: 'inHg' } } } }] };

  /** A plugin's own unit setting has to win where it made one, and the Pebble app's where it follows. */
  test('follows the Pebble app where the plugin says app, and takes the plugin choice otherwise', () => {
    const result = unitsFrom(PREFERENCES, { temperature: 'app', windSpeed: 'knots' });

    expect(result).toEqual({ temperature: '°F', windSpeed: 'knots', pressure: 'inHg' });
  });

  /** A unit the Pebble app cannot read, such as kph, made it drop the run's weather for every place, and F served Celsius under a Fahrenheit name. */
  test('follows the Pebble app for a choice that is not one of its units', () => {
    const result = unitsFrom(PREFERENCES, { temperature: 'F', windSpeed: 'kph', pressure: 'mb' } as never);

    expect(result).toEqual({ temperature: '°F', windSpeed: 'm/s', pressure: 'inHg' });
  });

  /** A Pebble app that gives no units, or a read it refused, must not leave the plugin with no unit to serve in. */
  test('falls back to °C, km/h, and hPa when the Pebble app gives nothing', () => {
    const result = unitsFrom(null);

    expect(result).toEqual(DEFAULT_UNITS);
  });
});

describe('readPebbleAppUnits', () => {
  /** A runtime whose Preferences plugin answers the units with one update or refuses with what it is given. */
  function unitsPebble(answer: SourceEnvelope | Error | object): PluginPebble {
    return {
      readSource: async () => {
        if (answer instanceof Error || !('instances' in answer)) {
          throw answer;
        }

        return answer;
      },
    } as unknown as PluginPebble;
  }

  /** The Pebble app's units as its Preferences plugin serves them, in °C. */
  const CELSIUS = { instances: [{ instanceId: 'units', properties: { temperature: { shortText: { text: '°C' } }, wind_speed: { shortText: { text: 'km/h' } }, pressure: { shortText: { text: 'hPa' } } } }] };

  /** A refused read answered as °C showed a wearer on °F the wrong unit as the Pebble app's own. */
  test('reports a refused read rather than answering the defaults', async () => {
    const result = await readPebbleAppUnits(unitsPebble(Object.assign(new Error('refused'), { code: 'PERMISSION_DENIED' })));

    expect(result).toEqual({ units: null, error: 'PERMISSION_DENIED' });
  });

  /** An Error with an empty code and message read as `Error`, its own name, which tells the wearer nothing. */
  test('gives NO_REASON for an Error that names nothing', async () => {
    const result = await readPebbleAppUnits(unitsPebble(Object.assign(new Error(''), { code: '' })));

    expect(result).toEqual({ units: null, error: NO_REASON });
  });

  /** A plain refusal with an empty code and message showed the wearer `[object Object]` beside Pebble App. */
  test('gives NO_REASON for a plain refusal that names nothing', async () => {
    const result = await readPebbleAppUnits(unitsPebble({ code: '', message: '' }));

    expect(result).toEqual({ units: null, error: NO_REASON });
  });

  /** A reply with no units in it says nothing about the wearer's, so it must not read as °C either. */
  test.each([
    ['no instances', { instances: [] }],
    ['an instance with no units', { instances: [{ instanceId: 'units', properties: { locale: { shortText: { text: 'en-CA' } } } }] }],
  ])('reports a reply with %s', async (_label, envelope) => {
    const result = await readPebbleAppUnits(unitsPebble(envelope));

    expect(result).toEqual({ units: null, error: NO_UNITS });
  });

  /** A wearer really on °C has to read as the Pebble app's own units, told apart from a refusal. */
  test('answers a real °C as units', async () => {
    const result = await readPebbleAppUnits(unitsPebble(CELSIUS));

    expect(result).toEqual({ units: { temperature: '°C', windSpeed: 'km/h', pressure: 'hPa' } });
  });

  /** Serving has to send some unit, so a refusal there still serves the defaults under the plugin's own choices. */
  test('keeps pebbleAppUnits serving the defaults on a refusal', async () => {
    const result = await pebbleAppUnits(unitsPebble(new Error('refused')), { windSpeed: 'knots' });

    expect(result).toEqual({ ...DEFAULT_UNITS, windSpeed: 'knots' });
  });
});

describe('preferencesFrom', () => {
  /** A calendar plugin labelling events on the wrong clock shows a 12-hour wearer 14:30. */
  test('reads the clock, the locale, and the units the Pebble app gives', () => {
    const update = unitsUpdate({ locale: 'en-GB', temperature: '°C', distance: 'km', wind_speed: 'mph', pressure: 'hPa', precipitation: 'mm', clock: '12h' });

    const result = preferencesFrom(update);

    expect(result).toEqual({ units: { temperature: '°C', windSpeed: 'mph', pressure: 'hPa' }, clock: '12h', locale: 'en-GB' });
  });

  /** A clock with odd case or spaces is still the wearer's choice, and one that is neither has to read as unknown rather than as 24-hour. */
  test.each([
    [' 24H ', '24h'],
    ['12h', '12h'],
    ['12-hour', null],
  ])('reads a clock of %j as %j', (clock, expected) => {
    const result = preferencesFrom(unitsUpdate({ clock })).clock;

    expect(result).toBe(expected);
  });

  /** An update that names no units, a clock, or a locale must say so, so a caller can tell the Pebble app's own from a default. */
  test('gives null for what the update leaves out', () => {
    const result = preferencesFrom(unitsUpdate({ locale: '  ' }));

    expect(result).toEqual({ units: null, clock: null, locale: null });
  });
});

describe('readPebbleAppPreferences', () => {
  /** A refused read taken for an empty reply would read as a wearer with no preferences rather than as a refusal. */
  test('gives no preferences and the reason for a refused read', async () => {
    const pebble = { readSource: async () => Promise.reject(Object.assign(new Error('refused'), { code: 'PERMISSION_DENIED' })) } as unknown as PluginPebble;

    const result = await readPebbleAppPreferences(pebble);

    expect(result).toEqual({ preferences: null, error: 'PERMISSION_DENIED' });
  });

  /** A calendar plugin needs the clock and locale even from a reply that names no units. */
  test('reads the clock and locale from a reply with no units', async () => {
    const pebble = { readSource: async () => unitsUpdate({ locale: 'de-DE', clock: '24h' }) } as unknown as PluginPebble;

    const result = await readPebbleAppPreferences(pebble);

    expect(result).toEqual({ preferences: { units: null, clock: '24h', locale: 'de-DE' } });
  });

  /** It has to read the built-in by its uuid, or a wearer preferring another plugin gets that plugin's answer. */
  test('reads the built-in Preferences plugin by its uuid', async () => {
    const asked: unknown[] = [];
    const pebble = {
      readSource: async (request: unknown) => {
        asked.push(request);
        return unitsUpdate({});
      },
    } as unknown as PluginPebble;

    await readPebbleAppPreferences(pebble);

    expect(asked).toEqual([{ category: 'preferences', item: 'units', plugin: '00000000-0000-0000-0001-000000000009' }]);
  });
});
