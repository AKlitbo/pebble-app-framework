/**
 * The wearer's preferences, read from a plugin app out of the Pebble app's built-in Preferences plugin.
 *
 * The built-in serves `preferences/units` as one instance whose properties are each a `shortText`:
 * `locale`, `temperature`, `distance`, `wind_speed`, `pressure`, `precipitation`, and `clock`. This
 * file reads the ones the framework's plugin app helpers use, the units a weather reading is served
 * in, the clock, and the locale, so each plugin app reads them the same way. It asks for no
 * permission. The places in the Pebble app's weather list come from the same plugin, and
 * ts/plugin-app/weather.ts reads those.
 */

import { firstProperties, text } from '../plugin-shapes/shapes';
import { appFahrenheit } from '../plugin-shapes/units';
import { failureReason } from './runtime';
import type { PluginPebble, SourceRequest } from './runtime';
import type { SourceEnvelope } from '../plugin-sources/types';

/** The Pebble app's built-in Preferences plugin, which serves the wearer's places and units. */
export const BUILT_IN_PREFERENCES = '00000000-0000-0000-0001-000000000009';

/** The units a reading is served in, as the Pebble app's Preferences plugin names them. */
export interface WeatherUnits {
  temperature: '°C' | '°F';
  windSpeed: 'km/h' | 'mph' | 'm/s' | 'knots';
  pressure: 'hPa' | 'inHg';
}

/** A plugin's own choice for each unit, where `app` follows the Pebble app's. Left out is `app` too. */
export interface UnitOverrides {
  temperature?: 'app' | WeatherUnits['temperature'];
  windSpeed?: 'app' | WeatherUnits['windSpeed'];
  pressure?: 'app' | WeatherUnits['pressure'];
}

/** The units a plugin serves in when the Pebble app gives none. */
export const DEFAULT_UNITS: WeatherUnits = { temperature: '°C', windSpeed: 'km/h', pressure: 'hPa' };

/** Whether the wearer's watch shows a 12-hour or a 24-hour clock, as the Pebble app names it. */
export type ClockFormat = '12h' | '24h';

/** The wearer's preferences, as `preferencesFrom` reads them. */
export interface PebbleAppPreferences {
  /** The units, with the plugin's own choices over them, or null when the Pebble app names none. */
  units: WeatherUnits | null;
  /** The clock, or null when the Pebble app names neither. */
  clock: ClockFormat | null;
  /** The locale, such as `en-GB`, the watch's language or else the phone's, or null when the Pebble app gives none. */
  locale: string | null;
}

// each unit as the Pebble app's Preferences plugin names it
const TEMPERATURE_UNITS = ['°C', '°F'] as const;
const WIND_UNITS = ['km/h', 'mph', 'm/s', 'knots'] as const;
const PRESSURE_UNITS = ['hPa', 'inHg'] as const;
const CLOCK_FORMATS = ['12h', '24h'] as const;

/** A unit the Pebble app names, if it is one of the choices given. */
function oneOf<T extends string>(value: string | undefined, choices: readonly T[]): T | undefined {
  return choices.find((choice) => choice === value);
}

/**
 * The units to serve in, from a `preferences/units` update and the plugin's own choices.
 *
 * Each unit is the plugin's choice where it made one, and the Pebble app's where it is `app`, left
 * out, or not one of the Pebble app's own units. A unit the Pebble app does not give, or gives in a
 * form not known here, is the default, °C, km/h, and hPa.
 *
 * @param envelope One update from `preferences/units`, which may be missing or carry anything.
 * @param overrides The plugin's own choice for each unit.
 * @return The units.
 */
export function unitsFrom(envelope: SourceEnvelope | null | undefined, overrides: UnitOverrides = {}): WeatherUnits {
  const properties = firstProperties(envelope);
  const fahrenheit = appFahrenheit(envelope);
  const app: WeatherUnits = {
    temperature: fahrenheit === undefined ? DEFAULT_UNITS.temperature : fahrenheit ? '°F' : '°C',
    windSpeed: oneOf(text(properties?.wind_speed, 'short'), WIND_UNITS) || DEFAULT_UNITS.windSpeed,
    pressure: oneOf(text(properties?.pressure, 'short'), PRESSURE_UNITS) || DEFAULT_UNITS.pressure,
  };

  // a choice that is not one of the Pebble app's own units is served as the Pebble app's, since a unit
  // the Pebble app cannot read makes it drop that run's weather for every place
  return {
    temperature: oneOf(overrides.temperature, TEMPERATURE_UNITS) || app.temperature,
    windSpeed: oneOf(overrides.windSpeed, WIND_UNITS) || app.windSpeed,
    pressure: oneOf(overrides.pressure, PRESSURE_UNITS) || app.pressure,
  };
}

/** Whether a `preferences/units` update names any of the units a reading is served in. */
function namesUnits(envelope: SourceEnvelope | null | undefined): boolean {
  const properties = firstProperties(envelope);

  return appFahrenheit(envelope) !== undefined || Boolean(oneOf(text(properties?.wind_speed, 'short'), WIND_UNITS)) || Boolean(oneOf(text(properties?.pressure, 'short'), PRESSURE_UNITS));
}

/**
 * The wearer's preferences in a `preferences/units` update.
 *
 * The units are as `unitsFrom` reads them, or null for an update that names none of them, so a caller
 * can tell the Pebble app's own units from the defaults. The clock reads `12h` or `24h`, whatever the
 * case and with spaces at the ends taken off, and anything else is null. The locale is the text as
 * the Pebble app gives it, trimmed, or null when it is blank.
 *
 * @param envelope One update from `preferences/units`, which may be missing or carry anything.
 * @param overrides The plugin's own choice for each unit.
 * @return The preferences.
 */
export function preferencesFrom(envelope: SourceEnvelope | null | undefined, overrides: UnitOverrides = {}): PebbleAppPreferences {
  const properties = firstProperties(envelope);
  const clock = (text(properties?.clock, 'short') || '').trim().toLowerCase();
  const locale = (text(properties?.locale, 'short') || '').trim();

  return {
    units: namesUnits(envelope) ? unitsFrom(envelope, overrides) : null,
    clock: oneOf(clock, CLOCK_FORMATS) || null,
    locale: locale || null,
  };
}

/** The read of the wearer's units from the built-in Preferences plugin. */
const UNITS_REQUEST: SourceRequest = { category: 'preferences', item: 'units', plugin: BUILT_IN_PREFERENCES };

/**
 * Reads the wearer's preferences from the Pebble app's built-in Preferences plugin, by its uuid, so
 * it reaches the built-in whichever plugin the wearer prefers. It makes no subscription.
 *
 * A read the Pebble app refuses answers no preferences and the reason, such as `PERMISSION_DENIED`,
 * or `NO_REASON` when the refusal names none. Any other reply answers the preferences as
 * `preferencesFrom` reads them.
 *
 * @param pebble The plugin runtime's `Pebble`.
 * @param overrides The plugin's own choice for each unit.
 * @return The preferences, or null and the reason there are none.
 */
export async function readPebbleAppPreferences(pebble: PluginPebble, overrides: UnitOverrides = {}): Promise<{ preferences: PebbleAppPreferences | null; error?: string }> {
  let envelope: SourceEnvelope;

  try {
    envelope = await pebble.readSource(UNITS_REQUEST);
  } catch (error) {
    return { preferences: null, error: failureReason(error) };
  }

  return { preferences: preferencesFrom(envelope, overrides) };
}

/** The error `readPebbleAppUnits` gives for a reply that names none of the units. */
export const NO_UNITS = 'NO_UNITS';

/**
 * Reads the wearer's units from the Pebble app's built-in Preferences plugin, for a caller that has to
 * tell the Pebble app's own units from the defaults, such as a settings page showing them.
 *
 * A read the Pebble app refuses answers no units and the reason, such as `PERMISSION_DENIED`, or
 * `NO_REASON` when the refusal names none, and a reply that names none of the units answers no units
 * and `NO_UNITS`. Only a reply that names them answers units, with the plugin's own choices over them
 * and the defaults for any it leaves out.
 *
 * @param pebble The plugin runtime's `Pebble`.
 * @param overrides The plugin's own choice for each unit.
 * @return The units, or null and the reason there are none.
 */
export async function readPebbleAppUnits(pebble: PluginPebble, overrides: UnitOverrides = {}): Promise<{ units: WeatherUnits | null; error?: string }> {
  const { preferences, error } = await readPebbleAppPreferences(pebble, overrides);

  if (!preferences) {
    return { units: null, error };
  }

  return preferences.units ? { units: preferences.units } : { units: null, error: NO_UNITS };
}

/**
 * Reads the wearer's units from the Pebble app's built-in Preferences plugin and puts the plugin's own
 * choices over them, for serving, which has to send some unit. A read the Pebble app refuses, or a
 * reply that names none, leaves the defaults under the choices. A caller that has to tell those apart
 * reads `readPebbleAppUnits`.
 *
 * @param pebble The plugin runtime's `Pebble`.
 * @param overrides The plugin's own choice for each unit.
 * @return The units.
 */
export async function pebbleAppUnits(pebble: PluginPebble, overrides: UnitOverrides = {}): Promise<WeatherUnits> {
  const { units } = await readPebbleAppUnits(pebble, overrides);

  return units || unitsFrom(null, overrides);
}
