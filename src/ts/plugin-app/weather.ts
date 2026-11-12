/**
 * Weather, served from a plugin app as the standard `weather/location` source.
 *
 * This is the reverse of ts/plugin-sources/weather.ts, which reads a weather plugin's update. Here a
 * plugin app turns each place's `WeatherReading` into an instance in the shapes the Pebble app's
 * built-in Weather plugin serves, so every face that reads the built-in reads a plugin app the same
 * way, and the Pebble app builds the watch's own Weather app from it. The extras take the names and
 * shapes Weather+ serves where it has them.
 *
 * The places and the wearer's units come from the Pebble app's built-in Preferences plugin, read by
 * its uuid.
 */

import conditions from '../weather/conditions';
import { validCoords } from '../weather/providers/openmeteo';
import { firstProperties, flag, instancesOf, numeric, propertiesOf, text } from '../plugin-shapes/shapes';
import { appFahrenheit } from '../plugin-shapes/units';
import { phoneOffsetMinutes } from '../pkjs/phone-clock';
import type { PhoneOffset } from '../pkjs/phone-clock';
import type { ReadingCondition, WeatherReading } from '../weather/reading';
import type { PluginPebble, SourceRequest } from './runtime';
import type { SeriesShape, SourceDeclaration, SourceEnvelope, SourceInstance, SourceProperty } from '../plugin-sources/types';

/** The Pebble app's built-in Weather plugin. */
export const BUILT_IN_WEATHER = '00000000-0000-0000-0001-000000000002';

/** The Pebble app's built-in Preferences plugin, which serves the wearer's places and units. */
export const BUILT_IN_PREFERENCES = '00000000-0000-0000-0001-000000000009';

/**
 * The `weather/location` source as a plugin app declares it in its appinfo's plugin block.
 *
 * The standard properties are the built-in's, in its shapes, without its `icon` and `image`. The
 * extras are Weather+'s, in its shapes, and `pressure`, `dew_point`, `weather_code`, `latitude`,
 * `longitude`, `source`, and `updated` are the framework's. Every series is named `hourly_` or `daily_`, and nothing else is. It
 * asks `Location` of its callers and refreshes every 15 minutes, as the built-in does.
 */
export const WEATHER_LOCATION_SOURCE = {
  category: 'weather',
  items: ['location'],
  properties: {
    name: ['shortText'],
    temperature: ['shortText', 'longText', 'numericValue'],
    feels_like: ['shortText', 'longText', 'numericValue'],
    high: ['shortText', 'longText', 'numericValue'],
    low: ['shortText', 'longText', 'numericValue'],
    condition: ['shortText', 'longText'],
    condition_code: ['longText'],
    uv_index: ['numericValue', 'shortText'],
    precipitation: ['numericValue', 'shortText'],
    humidity: ['numericValue', 'shortText'],
    wind_speed: ['numericValue', 'shortText'],
    wind_direction: ['numericValue'],
    utc_offset: ['numericValue'],
    sunrise: ['timestamp'],
    sunset: ['timestamp'],
    latitude: ['numericValue', 'shortText'],
    longitude: ['numericValue', 'shortText'],
    hourly_temperature: ['series.numericValue', 'series.shortText'],
    hourly_condition: ['series.shortText'],
    hourly_condition_code: ['series.longText'],
    daily_high: ['series.numericValue', 'series.shortText'],
    daily_low: ['series.numericValue', 'series.shortText'],
    daily_condition: ['series.shortText'],
    daily_condition_code: ['series.longText'],
    daily_precipitation: ['series.numericValue', 'series.shortText'],
    daily_sunrise: ['series.timestamp'],
    daily_sunset: ['series.timestamp'],
    hourly_pressure: ['series.numericValue'],
    hourly_dew_point: ['series.numericValue'],
    hourly_weather_code: ['series.numericValue'],
    daily_weather_code: ['series.numericValue'],
    hourly_is_day: ['series.numericValue'],
    hourly_humidity: ['series.numericValue'],
    hourly_wind_speed: ['series.numericValue'],
    hourly_wind_direction: ['series.numericValue'],
    hourly_wind_gust: ['series.numericValue'],
    hourly_cloud_cover: ['series.numericValue'],
    hourly_visibility: ['series.numericValue'],
    hourly_solar_radiation: ['series.numericValue'],
    hourly_cape: ['series.numericValue'],
    hourly_feels_like: ['series.numericValue'],
    hourly_uv_index: ['series.numericValue'],
    hourly_precipitation: ['series.numericValue'],
    hourly_precipitation_amount: ['series.numericValue'],
    hourly_rain: ['series.numericValue'],
    hourly_snowfall: ['series.numericValue'],
    daily_rain: ['series.numericValue'],
    daily_snowfall: ['series.numericValue'],
    daily_uv_index: ['series.numericValue'],
    daily_precipitation_amount: ['series.numericValue'],
    pressure: ['numericValue', 'shortText'],
    dew_point: ['numericValue', 'shortText'],
    weather_code: ['numericValue'],
    source: ['shortText'],
    updated: ['timestamp', 'shortText'],
  },
  supportsMultiple: true,
  callerPermissions: ['Location'],
  suggestedRefreshIntervalSec: 900,
} satisfies SourceDeclaration & { supportsMultiple: boolean; callerPermissions: string[]; suggestedRefreshIntervalSec: number };

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

/** One place in the Pebble app's weather list. */
export interface WeatherPlace {
  /** The Pebble app's key for the place, which its instance goes out under. */
  key: string;
  /** The place's name in the Pebble app. */
  name: string;
  lat: number;
  lon: number;
  /** True for the phone's current location. */
  current: boolean;
}

/** The provider ids a reading carries, against the name a wearer knows them by. */
const SOURCE_NAMES: Record<string, string> = { openmeteo: 'Open-Meteo', owm: 'OpenWeatherMap', weatherapi: 'WeatherAPI.com' };

/**
 * The standard's nine condition codes, from the framework's condition tokens. Fog has no code of its
 * own, so it reads as cloudy, and freezing drizzle and freezing rain read as rain and snow.
 */
export const CONDITION_CODES: Record<string, string> = {
  CLEAR: 'sun',
  PCLDY: 'partly_cloudy',
  CLDY: 'cloudy',
  FOGGY: 'cloudy',
  DRZL: 'light_rain',
  SHWR: 'light_rain',
  RAIN: 'heavy_rain',
  STRM: 'heavy_rain',
  FZDZ: 'rain_and_snow',
  FZRN: 'rain_and_snow',
  SNOW: 'heavy_snow',
  SNSH: 'light_snow',
};

/** How many of each wind unit make a km/h. */
const WIND_PER_KMH: Record<WeatherUnits['windSpeed'], number> = { 'km/h': 1, mph: 1 / 1.609344, 'm/s': 1 / 3.6, knots: 1 / 1.852 };

/** How many inHg make a hPa. */
const INHG_PER_HPA = 0.0295299830714;

// four decimals is about 11 m, as fine as a weather place needs and no finer than the Pebble app's
// own places, and the most MET Norway takes for a place
const COORD_DECIMALS = 4;

// the properties sent only to a request that names them
const ASKED_FOR_ONLY = ['latitude', 'longitude'];

const HOUR_SECONDS = 60 * 60;
const DAY_SECONDS = 24 * HOUR_SECONDS;

/**
 * The standard condition code for a framework token.
 *
 * @param token The framework's condition token, with or without its night ending.
 * @return One of the standard's nine codes, `unknown` for a token it has none for.
 */
export function conditionCode(token: string): string {
  const base = token.endsWith(conditions.NIGHT_SUFFIX) ? token.slice(0, -conditions.NIGHT_SUFFIX.length) : token;

  return Object.prototype.hasOwnProperty.call(CONDITION_CODES, base) ? CONDITION_CODES[base] : 'unknown';
}

/**
 * The short words for a sky where the framework's own run past 12 characters. The Pebble app cuts a
 * condition's `shortText` to 12 for the timeline pins, which made `Partly Cloud` of the full words.
 */
export const SHORT_LABELS: Record<string, string> = {
  PCLDY: 'Partly Cldy',
  FZDZ: 'Frz Drizzle',
  FZRN: 'Frz Rain',
};

/** The framework's words for a sky. */
function conditionLabel(condition: ReadingCondition): string {
  const entry = conditions.conditions.find((row) => row.token === condition.token);

  return entry ? entry.labelLong : conditions.fallback.labelLong;
}

/** The framework's words for a sky in 12 characters or fewer, for a `shortText`. */
function shortLabel(condition: ReadingCondition): string {
  return Object.prototype.hasOwnProperty.call(SHORT_LABELS, condition.token) ? SHORT_LABELS[condition.token] : conditionLabel(condition);
}

/** A temperature in °C in the unit served. */
function temperatureIn(celsius: number | null, units: WeatherUnits): number | null {
  if (celsius === null) {
    return null;
  }

  return units.temperature === '°F' ? (celsius * 9) / 5 + 32 : celsius;
}

/** A wind speed in km/h in the unit served. */
function windIn(kmh: number | null, units: WeatherUnits): number | null {
  return kmh === null ? null : kmh * WIND_PER_KMH[units.windSpeed];
}

/** A pressure in hPa in the unit served. */
function pressureIn(hpa: number | null, units: WeatherUnits): number | null {
  if (hpa === null) {
    return null;
  }

  return units.pressure === 'inHg' ? hpa * INHG_PER_HPA : hpa;
}

/**
 * The short text the built-in writes for a temperature, such as `24°C`, a wind, such as `12 km/h`,
 * or a pressure, such as `1016 hPa` or `30.01 inHg`.
 */
function temperatureText(value: number, units: WeatherUnits): string {
  return `${Math.round(value)}${units.temperature}`;
}

function windText(value: number, units: WeatherUnits): string {
  return `${Math.round(value)} ${units.windSpeed}`;
}

function pressureText(value: number, units: WeatherUnits): string {
  return units.pressure === 'inHg' ? `${value.toFixed(2)} inHg` : `${Math.round(value)} hPa`;
}

/** A moment's time on the phone's clock, as HH:MM. */
function clockLabel(epochSeconds: number, offsetAt: PhoneOffset): string {
  return new Date((epochSeconds + offsetAt(epochSeconds * 1000) * 60) * 1000).toISOString().slice(11, 16);
}

/** A temperature as the built-in serves it, in all three shapes, or nothing for a gap. */
function temperatureProperty(celsius: number | null, units: WeatherUnits): SourceProperty | undefined {
  const value = temperatureIn(celsius, units);

  if (value === null) {
    return undefined;
  }

  const words = temperatureText(value, units);

  return { shortText: { text: words }, longText: { text: words }, numericValue: { value, unit: units.temperature } };
}

/** A number with a short text, or nothing for a gap. */
function numberProperty(value: number | null, unit: string | undefined, words: (value: number) => string, bounds?: { min: number; max: number }): SourceProperty | undefined {
  if (value === null) {
    return undefined;
  }

  return { numericValue: { value, ...(unit ? { unit } : {}), ...(bounds || {}) }, shortText: { text: words(value) } };
}

/** A series of numbers, with a short text beside each when one is given. */
function numberSeries(times: number[], stepSec: number, values: Array<number | null>, unit?: string, words?: (value: number) => string): SourceProperty | undefined {
  if (!times.length) {
    return undefined;
  }

  const series: SeriesShape = { start: times[0], stepSec, numericValue: { values, ...(unit ? { unit } : {}) } };

  if (words) {
    series.shortText = { values: values.map((value) => (value === null ? null : words(value))) };
  }

  return { series };
}

/** A series of texts in one shape. */
function textSeries(times: number[], stepSec: number, shape: 'shortText' | 'longText', values: string[]): SourceProperty | undefined {
  return times.length ? { series: { start: times[0], stepSec, [shape]: { values } } } : undefined;
}

/** A series of moments. */
function timestampSeries(times: number[], values: Array<number | null>): SourceProperty | undefined {
  return times.length ? { series: { start: times[0], stepSec: DAY_SECONDS, timestamp: { values } } } : undefined;
}

/** The place's today in the daily series at a moment, the last day that started by then, or -1. */
function todayAt(reading: WeatherReading, nowSeconds: number): number {
  let today = -1;

  reading.daily.time.forEach((day, index) => {
    if (day <= nowSeconds) {
      today = index;
    }
  });

  return today;
}

/**
 * Whether a reading holds today and tomorrow, which the Pebble app needs before it takes an
 * instance for the watch's own Weather app.
 */
function holdsTwoDays(reading: WeatherReading, today: number): boolean {
  if (today === -1 || today + 1 >= reading.daily.time.length) {
    return false;
  }

  return [today, today + 1].every((day) => reading.daily.high[day] !== null && reading.daily.low[day] !== null);
}

/**
 * One place's reading as a `weather/location` instance.
 *
 * It sends every single value, and each series only when the request asks for it, or every series
 * when the request names none, as the built-in does. The place's `latitude` and `longitude` go out only
 * to a request that names them, and only as a pair of real coordinates, since only a face that wants
 * the wearer's place should get it. Temperatures, wind, and pressure go out in the units given, each with its unit and a
 * short text in the built-in's style. `utc_offset` is in minutes east of UTC, as the built-in sends
 * it. The series are the reading's own, so their stamps keep the reading's clock, and a reader places
 * each point by its stamp.
 *
 * The Pebble app takes an instance only when it holds today's and tomorrow's high, low, condition
 * code, sunrise, and sunset. A reading without two days from the place's today, which covers one
 * whose series Open-Meteo could not give, answers no instance. The caller leaves the place out, so
 * the Pebble app takes it from its own backend, or serves a failover reading for it instead. Through
 * a polar night or a midnight sun the sunrise and sunset are gaps, so the instance goes out and the
 * Pebble app fills the watch's Weather app from its backend for that place, as it would for the
 * built-in.
 *
 * @param reading The place's reading.
 * @param place The place, whose key the instance goes out under and whose name and coordinates it carries. Coordinates left out are not served.
 * @param units The units to serve in.
 * @param asked The property names the request asks for, which picks the series, or undefined for every series.
 * @param nowMs Now, in epoch milliseconds, for which day is the place's today.
 * @param offsetAt Reads the phone's offset, for the `updated` label. A spec stands the phone in another zone with it.
 * @return The instance, or null when the reading does not hold today and tomorrow.
 */
export function locationInstance(reading: WeatherReading, place: Pick<WeatherPlace, 'key' | 'name'> & Partial<Pick<WeatherPlace, 'lat' | 'lon'>>, units: WeatherUnits, asked: readonly string[] | undefined, nowMs: number, offsetAt: PhoneOffset = phoneOffsetMinutes): SourceInstance | null {
  const today = todayAt(reading, nowMs / 1000);

  if (!holdsTwoDays(reading, today)) {
    return null;
  }

  const { hourly, daily } = reading;
  const temperature = (value: number) => temperatureText(value, units);
  const wind = (value: number) => windText(value, units);
  const percent = (value: number) => `${Math.round(value)}%`;
  const hourlyTemperatures = (values: Array<number | null>) => values.map((value) => temperatureIn(value, units));
  const dailyTemperatures = (values: Array<number | null>) => values.map((value) => temperatureIn(value, units));
  const sun = (value: number | null) => (value === null ? undefined : { timestamp: { value } });
  const code = (wmo: number | null) => (wmo === null ? undefined : { numericValue: { value: wmo } });
  // the coordinates go out as a pair, and only when both are real ones, so a face never shows half a place
  const placed = validCoords({ lat: place.lat as number, lon: place.lon as number });
  const coordinate = (value: number | undefined) => {
    if (!placed || value === undefined) {
      return undefined;
    }

    const rounded = Number(value.toFixed(COORD_DECIMALS));

    return { numericValue: { value: rounded, unit: '°' }, shortText: { text: rounded.toFixed(COORD_DECIMALS) } };
  };

  const builders: Record<string, () => SourceProperty | undefined> = {
    name: () => (place.name ? { shortText: { text: place.name } } : undefined),
    temperature: () => temperatureProperty(reading.temperature, units),
    feels_like: () => temperatureProperty(reading.feelsLike, units),
    high: () => temperatureProperty(daily.high[today], units),
    low: () => temperatureProperty(daily.low[today], units),
    condition: () => ({ shortText: { text: shortLabel(reading.condition) }, longText: { text: conditionLabel(reading.condition) } }),
    condition_code: () => ({ longText: { text: conditionCode(reading.condition.token) } }),
    // the day's peak, as the built-in serves it and the Pebble app files it, so the watch's own
    // Weather app does not read 0 after dark. the reading now is only for a day with no peak
    uv_index: () => numberProperty(daily.uvIndex[today] ?? reading.uvIndex, undefined, (value) => String(Math.round(value)), { min: 0, max: 11 }),
    precipitation: () => numberProperty(daily.precipitationChance[today], '%', percent, { min: 0, max: 100 }),
    humidity: () => numberProperty(reading.humidity, '%', percent, { min: 0, max: 100 }),
    wind_speed: () => numberProperty(windIn(reading.windSpeed, units), units.windSpeed, wind),
    wind_direction: () => (reading.windDirection === null ? undefined : { numericValue: { value: reading.windDirection, unit: '°', min: 0, max: 360 } }),
    utc_offset: () => ({ numericValue: { value: reading.utcOffset / 60, unit: 'min' } }),
    sunrise: () => sun(daily.sunrise[today]),
    sunset: () => sun(daily.sunset[today]),
    latitude: () => coordinate(place.lat),
    longitude: () => coordinate(place.lon),
    hourly_temperature: () => numberSeries(hourly.time, HOUR_SECONDS, hourlyTemperatures(hourly.temperature), units.temperature, temperature),
    hourly_condition: () => textSeries(hourly.time, HOUR_SECONDS, 'shortText', hourly.condition.map(shortLabel)),
    hourly_condition_code: () => textSeries(hourly.time, HOUR_SECONDS, 'longText', hourly.condition.map((sky) => conditionCode(sky.token))),
    daily_high: () => numberSeries(daily.time, DAY_SECONDS, dailyTemperatures(daily.high), units.temperature, temperature),
    daily_low: () => numberSeries(daily.time, DAY_SECONDS, dailyTemperatures(daily.low), units.temperature, temperature),
    daily_condition: () => textSeries(daily.time, DAY_SECONDS, 'shortText', daily.condition.map(shortLabel)),
    daily_condition_code: () => textSeries(daily.time, DAY_SECONDS, 'longText', daily.condition.map((sky) => conditionCode(sky.token))),
    daily_precipitation: () => numberSeries(daily.time, DAY_SECONDS, daily.precipitationChance, '%', percent),
    daily_sunrise: () => timestampSeries(daily.time, daily.sunrise),
    daily_sunset: () => timestampSeries(daily.time, daily.sunset),
    hourly_pressure: () => numberSeries(hourly.time, HOUR_SECONDS, hourly.pressure.map((value) => pressureIn(value, units)), units.pressure),
    hourly_dew_point: () => numberSeries(hourly.time, HOUR_SECONDS, hourlyTemperatures(hourly.dewPoint), units.temperature),
    hourly_weather_code: () => numberSeries(hourly.time, HOUR_SECONDS, hourly.condition.map((sky) => sky.wmo)),
    daily_weather_code: () => numberSeries(daily.time, DAY_SECONDS, daily.condition.map((sky) => sky.wmo)),
    hourly_is_day: () => numberSeries(hourly.time, HOUR_SECONDS, hourly.condition.map((sky) => (sky.isDay === null ? null : Number(sky.isDay)))),
    hourly_humidity: () => numberSeries(hourly.time, HOUR_SECONDS, hourly.humidity, '%'),
    hourly_wind_speed: () => numberSeries(hourly.time, HOUR_SECONDS, hourly.windSpeed.map((value) => windIn(value, units)), units.windSpeed),
    hourly_wind_direction: () => numberSeries(hourly.time, HOUR_SECONDS, hourly.windDirection, '°'),
    hourly_wind_gust: () => numberSeries(hourly.time, HOUR_SECONDS, hourly.windGust.map((value) => windIn(value, units)), units.windSpeed),
    hourly_cloud_cover: () => numberSeries(hourly.time, HOUR_SECONDS, hourly.cloudCover, '%'),
    hourly_visibility: () => numberSeries(hourly.time, HOUR_SECONDS, hourly.visibility, 'm'),
    hourly_solar_radiation: () => numberSeries(hourly.time, HOUR_SECONDS, hourly.solarRadiation, 'W/m²'),
    hourly_cape: () => numberSeries(hourly.time, HOUR_SECONDS, hourly.cape, 'J/kg'),
    hourly_feels_like: () => numberSeries(hourly.time, HOUR_SECONDS, hourlyTemperatures(hourly.feelsLike), units.temperature),
    hourly_uv_index: () => numberSeries(hourly.time, HOUR_SECONDS, hourly.uvIndex),
    hourly_precipitation: () => numberSeries(hourly.time, HOUR_SECONDS, hourly.precipitationChance, '%'),
    hourly_precipitation_amount: () => numberSeries(hourly.time, HOUR_SECONDS, hourly.precipitationAmount, 'mm'),
    hourly_rain: () => numberSeries(hourly.time, HOUR_SECONDS, hourly.rain, 'mm'),
    hourly_snowfall: () => numberSeries(hourly.time, HOUR_SECONDS, hourly.snowfall, 'cm'),
    daily_rain: () => numberSeries(daily.time, DAY_SECONDS, daily.rain, 'mm'),
    daily_snowfall: () => numberSeries(daily.time, DAY_SECONDS, daily.snowfall, 'cm'),
    daily_uv_index: () => numberSeries(daily.time, DAY_SECONDS, daily.uvIndex),
    daily_precipitation_amount: () => numberSeries(daily.time, DAY_SECONDS, daily.precipitationAmount, 'mm'),
    pressure: () => numberProperty(pressureIn(reading.pressure, units), units.pressure, (value) => pressureText(value, units)),
    dew_point: () => {
      const value = temperatureIn(reading.dewPoint, units);

      return value === null ? undefined : { numericValue: { value, unit: units.temperature }, shortText: { text: temperature(value) } };
    },
    weather_code: () => code(reading.condition.wmo),
    source: () => ({ shortText: { text: SOURCE_NAMES[reading.source] || reading.source } }),
    updated: () => ({ timestamp: { value: reading.time }, shortText: { text: clockLabel(reading.time, offsetAt) } }),
  };

  // every single value always goes out, and a series only when asked for, as the built-in does. the
  // coordinates are the one exception and go out only when asked for by name, since only a face that
  // wants the wearer's place should get it
  const names = Object.keys(builders).filter((name) => {
    if (ASKED_FOR_ONLY.includes(name)) {
      return Boolean(asked && asked.includes(name));
    }

    return !/^(hourly|daily)_/.test(name) || !asked || asked.includes(name);
  });
  const properties: Record<string, SourceProperty> = {};

  names.forEach((name) => {
    const property = builders[name]();

    if (property) {
      properties[name] = property;
    }
  });

  return { instanceId: place.key, properties };
}

/** The read of the wearer's places from the built-in Preferences plugin. */
const PLACES_REQUEST: SourceRequest = { category: 'preferences', item: 'weather_location', plugin: BUILT_IN_PREFERENCES };

/** The read of the wearer's units from the built-in Preferences plugin. */
const UNITS_REQUEST: SourceRequest = { category: 'preferences', item: 'units', plugin: BUILT_IN_PREFERENCES };

/** What the runtime gave as the reason a read failed, such as `PERMISSION_DENIED`. */
function reason(error: unknown): string {
  const failure = error as { code?: unknown; message?: unknown } | null;

  return String((failure && (failure.code || failure.message)) || error);
}

/**
 * The places in a `preferences/weather_location` update, in the wearer's order. A place with no
 * coordinates, such as a current location the phone has no fix for yet, is left out.
 *
 * @param envelope The update, which may be missing or carry anything.
 * @return The places that can be fetched.
 */
export function placesFrom(envelope: SourceEnvelope | null | undefined): WeatherPlace[] {
  const places: WeatherPlace[] = [];

  instancesOf(envelope).forEach((instance) => {
    const properties = propertiesOf(instance);
    const key = instance && typeof instance.instanceId === 'string' ? instance.instanceId : '';
    const coords = { lat: numeric(properties?.latitude)?.value as number, lon: numeric(properties?.longitude)?.value as number };

    if (!properties || !key || !validCoords(coords)) {
      return;
    }

    places.push({ key, name: text(properties.name, 'short') || '', lat: coords.lat, lon: coords.lon, current: flag(properties.current) === true });
  });

  return places;
}

/**
 * Reads the wearer's places from the Pebble app's built-in Preferences plugin.
 *
 * It subscribes to them as well, so the Pebble app runs the plugin again when the wearer changes the
 * list. Naming the built-in by its uuid reaches it whichever plugin the wearer prefers. A read the
 * Pebble app refuses, such as one before the wearer allows Location, hands back no places and the
 * reason.
 *
 * @param pebble The plugin runtime's `Pebble`.
 * @return The places in the wearer's order, and the reason when the read failed.
 */
export async function weatherLocations(pebble: PluginPebble): Promise<{ places: WeatherPlace[]; error?: string }> {
  try {
    pebble.subscribeSource(PLACES_REQUEST);

    return { places: placesFrom(await pebble.readSource(PLACES_REQUEST)) };
  } catch (error) {
    return { places: [], error: reason(error) };
  }
}

// each unit as the Pebble app's Preferences plugin names it
const TEMPERATURE_UNITS = ['°C', '°F'] as const;
const WIND_UNITS = ['km/h', 'mph', 'm/s', 'knots'] as const;
const PRESSURE_UNITS = ['hPa', 'inHg'] as const;

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

/** The error `readPebbleAppUnits` gives for a reply that names none of the units. */
export const NO_UNITS = 'NO_UNITS';

/** Whether a `preferences/units` update names any of the units a reading is served in. */
function namesUnits(envelope: SourceEnvelope | null | undefined): boolean {
  const properties = firstProperties(envelope);

  return appFahrenheit(envelope) !== undefined || Boolean(oneOf(text(properties?.wind_speed, 'short'), WIND_UNITS)) || Boolean(oneOf(text(properties?.pressure, 'short'), PRESSURE_UNITS));
}

/**
 * Reads the wearer's units from the Pebble app's built-in Preferences plugin, for a caller that has to
 * tell the Pebble app's own units from the defaults, such as a settings page showing them.
 *
 * A read the Pebble app refuses answers no units and the reason, such as `PERMISSION_DENIED`, and a
 * reply that names none of the units answers no units and `NO_UNITS`. Only a reply that names them
 * answers units, with the plugin's own choices over them and the defaults for any it leaves out.
 *
 * @param pebble The plugin runtime's `Pebble`.
 * @param overrides The plugin's own choice for each unit.
 * @return The units, or null and the reason there are none.
 */
export async function readPebbleAppUnits(pebble: PluginPebble, overrides: UnitOverrides = {}): Promise<{ units: WeatherUnits | null; error?: string }> {
  let envelope: SourceEnvelope;

  try {
    envelope = await pebble.readSource(UNITS_REQUEST);
  } catch (error) {
    return { units: null, error: reason(error) };
  }

  return namesUnits(envelope) ? { units: unitsFrom(envelope, overrides) } : { units: null, error: NO_UNITS };
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
