/**
 * The temperature unit a plugin names, read the same way by a face reading a weather plugin and by a
 * plugin app reading the Pebble app's own units.
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
