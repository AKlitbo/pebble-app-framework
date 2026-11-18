/**
 * A place's coordinates: whether they are real ones, and how finely the framework keeps them.
 *
 * Every weather provider, the plugin app weather source, and a plugin app's own places read
 * coordinates the same way, so this sits apart from any one provider and pulls in nothing else.
 */

import type { WeatherCoords } from './util';

/**
 * The decimals the framework keeps a coordinate to. Four is about 11 m, as fine as a weather place
 * needs and no finer than the Pebble app's own places, and the most MET Norway takes for a place.
 */
export const COORD_DECIMALS = 4;

/**
 * Whether a place's coordinates are real ones. Open-Meteo refuses a whole request when one place's are
 * out of range, so a reading asks for no place that fails this.
 *
 * @param coords The place's coordinates, or nothing.
 * @return True for a latitude and longitude in range.
 */
export function validCoords(coords: WeatherCoords | null | undefined): coords is WeatherCoords {
  return Boolean(coords) && Number.isFinite(coords?.lat) && Number.isFinite(coords?.lon) &&
    Math.abs((coords as WeatherCoords).lat) <= 90 && Math.abs((coords as WeatherCoords).lon) <= 180;
}

/**
 * A coordinate cut to `COORD_DECIMALS` decimals, as `toFixed` rounds it, the way the weather source
 * serves a place's `latitude` and `longitude`.
 *
 * @param value The latitude or longitude, in degrees.
 * @return The same coordinate to four decimals.
 */
export function roundCoordinate(value: number): number {
  return Number(value.toFixed(COORD_DECIMALS));
}
