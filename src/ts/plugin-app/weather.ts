/**
 * Weather, served from a plugin app as the standard `weather/location` source.
 *
 * This is the reverse of ts/plugin-sources/weather.ts, which reads a weather plugin's update. Here a
 * plugin app turns each place's `WeatherReading` into an instance in the shapes the Pebble app's
 * built-in Weather plugin serves, so every face that reads the built-in reads a plugin app the same
 * way, and the Pebble app builds the watch's own Weather app from it. The extras take the names and
 * shapes Weather+ serves where it has them.
 *
 * The places come from the Pebble app's built-in Preferences plugin, read by its uuid, and the
 * wearer's units from the same plugin through ts/plugin-app/preferences.ts.
 */

import conditions from '../weather/conditions';
import { COORD_DECIMALS, roundCoordinate, validCoords } from '../weather/coords';
import { flag, instancesOf, numeric, propertiesOf, text } from '../plugin-shapes/shapes';
import { SHORT_TEXT_MAX, shortName } from './short-text';
import { phoneOffsetMinutes } from '../pkjs/phone-clock';
import type { PhoneOffset } from '../pkjs/phone-clock';
import type { ReadingCondition, WeatherReading } from '../weather/reading';
import { BUILT_IN_PREFERENCES } from './preferences';
import type { WeatherUnits } from './preferences';
import { failureReason } from './runtime';
import type { PluginPebble, SourceRequest } from './runtime';
import type { SeriesShape, SourceDeclaration, SourceEnvelope, SourceInstance, SourceProperty } from '../plugin-sources/types';

/** The Pebble app's built-in Weather plugin. */
export const BUILT_IN_WEATHER = '00000000-0000-0000-0001-000000000002';

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
    latitude: ['numericValue', 'shortText', 'longText'],
    longitude: ['numericValue', 'shortText', 'longText'],
    hourly_temperature: ['series.numericValue', 'series.shortText'],
    hourly_condition: ['series.shortText', 'series.longText'],
    hourly_condition_code: ['series.longText'],
    daily_high: ['series.numericValue', 'series.shortText'],
    daily_low: ['series.numericValue', 'series.shortText'],
    daily_condition: ['series.shortText', 'series.longText'],
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
    pressure: ['numericValue', 'shortText', 'longText'],
    dew_point: ['numericValue', 'shortText'],
    weather_code: ['numericValue'],
    source: ['shortText', 'longText'],
    updated: ['timestamp', 'shortText'],
  },
  supportsMultiple: true,
  callerPermissions: ['Location'],
  suggestedRefreshIntervalSec: 900,
} satisfies SourceDeclaration & { supportsMultiple: boolean; callerPermissions: string[]; suggestedRefreshIntervalSec: number };

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

/** Each provider's short name for a `shortText`, by its id. */
const SOURCE_SHORT_NAMES: Record<string, string> = { openmeteo: 'OpenMet', owm: 'OWM', weatherapi: 'WxAPI' };

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
 * The short words for every sky the framework names, each `SHORT_TEXT_MAX` or fewer, for a sky's
 * `shortText`. Each is a plain word that is still true, or an abbreviation a wearer reads at a glance,
 * such as `Pt Cldy`. The freezing skies keep `Fz` so the ice still shows, and snow showers read Snow,
 * while the `longText` keeps the showers. A sky the table does not name reads `Unknown`.
 */
export const SHORT_LABELS: Record<string, string> = {
  CLEAR: 'Clear',
  PCLDY: 'Pt Cldy',
  CLDY: 'Cloudy',
  FOGGY: 'Fog',
  DRZL: 'Drizzle',
  FZDZ: 'Fz Drzl',
  RAIN: 'Rain',
  FZRN: 'Fz Rain',
  SNOW: 'Snow',
  SHWR: 'Showers',
  SNSH: 'Snow',
  STRM: 'T-Storm',
};

/** The framework's words for a sky. */
function conditionLabel(condition: ReadingCondition): string {
  const entry = conditions.conditions.find((row) => row.token === condition.token);

  return entry ? entry.labelLong : conditions.fallback.labelLong;
}

/**
 * The words of 12 characters or fewer for the skies whose framework words run longer, for a sky
 * series' `longText`. Every other sky goes out in the framework's own words. The Pebble app takes
 * each day's phrase from `daily_condition`'s `longText` and cuts it at 12.
 */
export const PHRASE_LABELS: Record<string, string> = {
  PCLDY: 'Partly Cldy',
  FZDZ: 'Frz Drizzle',
  FZRN: 'Frz Rain',
};

/** The short words for a sky, for a `shortText`. */
function shortLabel(condition: ReadingCondition): string {
  return Object.prototype.hasOwnProperty.call(SHORT_LABELS, condition.token) ? SHORT_LABELS[condition.token] : conditions.fallback.labelLong;
}

/** The words for a sky in 12 characters or fewer, for a sky series' `longText`. */
function phraseLabel(condition: ReadingCondition): string {
  if (Object.prototype.hasOwnProperty.call(PHRASE_LABELS, condition.token)) {
    return PHRASE_LABELS[condition.token];
  }

  return conditionLabel(condition);
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

/** The short text the built-in writes for a temperature, such as `24°C`. */
function temperatureText(value: number, units: WeatherUnits): string {
  return `${Math.round(value)}${units.temperature}`;
}

/**
 * The short text for a wind, such as `12 km/h` as the built-in writes it. Knots read as `kn`, and a
 * wind of 100 or more drops the space, so it fits a `shortText` in every unit.
 */
function windText(value: number, units: WeatherUnits): string {
  const words = `${Math.round(value)} ${units.windSpeed === 'knots' ? 'kn' : units.windSpeed}`;

  return words.length > SHORT_TEXT_MAX ? words.replace(' ', '') : words;
}

/** A pressure's number alone, such as `1016` or `30.01`, since its unit rides beside it. */
function pressureNumber(value: number, units: WeatherUnits): string {
  return units.pressure === 'inHg' ? value.toFixed(2) : String(Math.round(value));
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

/** A series of skies, in short words and in words of 12 characters or fewer. */
function skySeries(times: number[], stepSec: number, skies: ReadingCondition[]): SourceProperty | undefined {
  return times.length ? { series: { start: times[0], stepSec, shortText: { values: skies.map(shortLabel) }, longText: { values: skies.map(phraseLabel) } } } : undefined;
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

    const rounded = roundCoordinate(value);

    // two decimals is about 1 km, which fits a shortText. the number and the long text keep all four
    return { numericValue: { value: rounded, unit: '°' }, shortText: { text: rounded.toFixed(2) }, longText: { text: rounded.toFixed(COORD_DECIMALS) } };
  };

  const builders: Record<string, () => SourceProperty | undefined> = {
    // a place's name is as long as it is, as the built-in sends it, so it is left uncut
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
    hourly_condition: () => skySeries(hourly.time, HOUR_SECONDS, hourly.condition),
    hourly_condition_code: () => textSeries(hourly.time, HOUR_SECONDS, 'longText', hourly.condition.map((sky) => conditionCode(sky.token))),
    daily_high: () => numberSeries(daily.time, DAY_SECONDS, dailyTemperatures(daily.high), units.temperature, temperature),
    daily_low: () => numberSeries(daily.time, DAY_SECONDS, dailyTemperatures(daily.low), units.temperature, temperature),
    daily_condition: () => skySeries(daily.time, DAY_SECONDS, daily.condition),
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
    pressure: () => {
      const property = numberProperty(pressureIn(reading.pressure, units), units.pressure, (value) => pressureNumber(value, units));

      return property && { ...property, longText: { text: `${property.shortText?.text} ${units.pressure}` } };
    },
    dew_point: () => {
      const value = temperatureIn(reading.dewPoint, units);

      return value === null ? undefined : { numericValue: { value, unit: units.temperature }, shortText: { text: temperature(value) } };
    },
    weather_code: () => code(reading.condition.wmo),
    source: () => ({ shortText: { text: shortName(reading.source, SOURCE_SHORT_NAMES) }, longText: { text: Object.prototype.hasOwnProperty.call(SOURCE_NAMES, reading.source) ? SOURCE_NAMES[reading.source] : reading.source } }),
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

/**
 * One place in the Pebble app's weather list as `listWeatherPlaces` reads it. A place with
 * coordinates carries them and has `located` true. One without, such as a current location the phone
 * has no fix for yet, has `located` false and no coordinates.
 */
export type ListedWeatherPlace = (WeatherPlace & { located: true }) | (Omit<WeatherPlace, 'lat' | 'lon'> & { located: false });

/**
 * Every place in a `preferences/weather_location` update, in the wearer's order, with or without
 * coordinates, as `listWeatherPlaces` reads them. A plugin app handling an update the Pebble app
 * pushes reads the whole list here.
 *
 * An instance with no key is left out, since nothing could find it again. One with a key and no
 * properties yet, such as a current location the Pebble app is still setting up, is listed with an
 * empty name and `located` false.
 *
 * @param envelope The update, which may be missing or carry anything.
 * @return Every place with a key.
 */
export function listedPlacesFrom(envelope: SourceEnvelope | null | undefined): ListedWeatherPlace[] {
  const places: ListedWeatherPlace[] = [];

  instancesOf(envelope).forEach((instance) => {
    const properties = propertiesOf(instance);
    const key = instance && typeof instance.instanceId === 'string' ? instance.instanceId : '';

    if (!key) {
      return;
    }

    const place = { key, name: text(properties?.name, 'short') || '', current: flag(properties?.current) === true };
    const coords = { lat: numeric(properties?.latitude)?.value as number, lon: numeric(properties?.longitude)?.value as number };

    places.push(validCoords(coords) ? { ...place, lat: coords.lat, lon: coords.lon, located: true } : { ...place, located: false });
  });

  return places;
}

/**
 * The places of a listing that can be fetched, in its order, without the `located` mark, as
 * `weatherLocations` hands them back.
 *
 * @param listed Places as `listWeatherPlaces` reads them.
 * @return The places that have coordinates.
 */
export function fetchablePlaces(listed: ListedWeatherPlace[]): WeatherPlace[] {
  return listed.flatMap(({ located, ...place }) => (located ? [place as WeatherPlace] : []));
}

/**
 * The places in a `preferences/weather_location` update, in the wearer's order. A place with no
 * coordinates, such as a current location the phone has no fix for yet, is left out.
 *
 * @param envelope The update, which may be missing or carry anything.
 * @return The places that can be fetched.
 */
export function placesFrom(envelope: SourceEnvelope | null | undefined): WeatherPlace[] {
  return fetchablePlaces(listedPlacesFrom(envelope));
}

/**
 * Reads every place in the Pebble app's weather list from its built-in Preferences plugin, the ones
 * with no coordinates included, for a caller that has to show or keep the whole list, such as a
 * settings page.
 *
 * Each place comes back in the wearer's order with its key, its name, whether it is the current
 * location, and `located`, which says whether it has coordinates and so can be fetched. A place with
 * coordinates carries them. An instance with no key is left out, since nothing could find it again,
 * and one with no properties yet is listed with an empty name and `located` false.
 * It makes no subscription unless `subscribe` is set, so a settings page reading the list does not ask
 * the Pebble app to run the plugin again. A read the Pebble app refuses hands back no places and the
 * reason, or `NO_REASON` when the refusal names none.
 *
 * @param pebble The plugin runtime's `Pebble`.
 * @param options Set `subscribe` to also subscribe to the list, as `weatherLocations` does, so the Pebble app runs the plugin again when the wearer changes it.
 * @return Every place in the wearer's order, and the reason when the read failed.
 */
export async function listWeatherPlaces(pebble: PluginPebble, options: { subscribe?: boolean } = {}): Promise<{ places: ListedWeatherPlace[]; error?: string }> {
  try {
    if (options.subscribe) {
      pebble.subscribeSource(PLACES_REQUEST);
    }

    return { places: listedPlacesFrom(await pebble.readSource(PLACES_REQUEST)) };
  } catch (error) {
    return { places: [], error: failureReason(error) };
  }
}

/**
 * Reads the wearer's places from the Pebble app's built-in Preferences plugin.
 *
 * It subscribes to them as well, so the Pebble app runs the plugin again when the wearer changes the
 * list. Naming the built-in by its uuid reaches it whichever plugin the wearer prefers. A place with
 * no coordinates is left out, as `placesFrom` leaves it. A read the Pebble app refuses, such as one
 * before the wearer allows Location, hands back no places and the reason, or `NO_REASON` when the
 * refusal names none.
 *
 * @param pebble The plugin runtime's `Pebble`.
 * @return The places in the wearer's order, and the reason when the read failed.
 */
export async function weatherLocations(pebble: PluginPebble): Promise<{ places: WeatherPlace[]; error?: string }> {
  const listed = await listWeatherPlaces(pebble, { subscribe: true });

  return { ...listed, places: fetchablePlaces(listed.places) };
}
