/**
 * The temperature and wind speed units a plugin names, read the same way by a face reading a weather
 * plugin and by a plugin app reading the Pebble app's own units.
 */

import { firstProperties, text } from './shapes';
import type { SourceEnvelope } from '../plugin-sources/types';

/**
 * Whether a temperature unit is °C, °F, or neither.
 *
 * @param unit The unit as a plugin wrote it, such as `°C`, `F`, or `celsius`.
 * @return `C`, `F`, or undefined for a unit that is neither.
 */
export function temperatureScale(unit: string | undefined): 'C' | 'F' | undefined {
  const plain = String(unit || '').replace(/[°º\s]/g, '').toUpperCase();

  if (plain === 'C' || plain === '℃' || plain === 'CELSIUS') {
    return 'C';
  }

  if (plain === 'F' || plain === '℉' || plain === 'FAHRENHEIT') {
    return 'F';
  }

  return undefined;
}

// each wind speed unit a plugin can name, lowercased with the spaces taken out, against the number
// the watch's wind unit setting saves it as: km/h 0, mph 1, knots 2, and m/s 3
const WIND_UNITS: Record<string, number> = {
  'km/h': 0,
  kmh: 0,
  kph: 0,
  mph: 1,
  knots: 2,
  kn: 2,
  kt: 2,
  kts: 2,
  'm/s': 3,
  mps: 3,
};

/**
 * The watch's wind unit for a wind speed unit a plugin names.
 *
 * @param unit The unit as a plugin wrote it, such as `mph`, `km/h`, or `knots`.
 * @return The number the watch's wind unit setting saves it as, or undefined for a unit it has none for.
 */
export function windUnit(unit: string | undefined): number | undefined {
  const plain = String(unit || '').replace(/\s/g, '').toLowerCase();

  return Object.prototype.hasOwnProperty.call(WIND_UNITS, plain) ? WIND_UNITS[plain] : undefined;
}

/**
 * The watch's wind unit for the Pebble app's `preferences/units` update, which names it as text in
 * `wind_speed`, such as `km/h` or `knots`.
 *
 * @param envelope One update from `preferences/units`, which may be missing or carry anything.
 * @return The number the watch's wind unit setting saves it as, or undefined when the update gives none.
 */
export function appWindUnit(envelope: SourceEnvelope | null | undefined): number | undefined {
  const properties = firstProperties(envelope);

  return properties ? windUnit(text(properties.wind_speed, 'short')) : undefined;
}

/**
 * Whether the Pebble app's `preferences/units` update says °F.
 *
 * The Pebble app's built-in Preferences plugin serves the wearer's units as text, one instance
 * with `temperature` reading `°C` or `°F`. It asks for no permission. An update the unit cannot be
 * read from says nothing, so the weather keeps the unit it had.
 *
 * @param envelope One update from `preferences/units`, which may be missing or carry anything.
 * @return True for °F, false for °C, or undefined when the update gives neither.
 */
export function appFahrenheit(envelope: SourceEnvelope | null | undefined): boolean | undefined {
  const properties = firstProperties(envelope);
  const scale = properties ? temperatureScale(text(properties.temperature, 'short')) : undefined;

  return scale === undefined ? undefined : scale === 'F';
}
