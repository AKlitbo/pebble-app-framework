/**
 * Pebble app plugin weather, turned into the reading the weather providers return.
 *
 * A weather plugin serves one instance per place in the Pebble app's weather list, and the face
 * shows the first. Its update becomes the same `WeatherResult` an Open-Meteo fetch gives, so the
 * watch reads it through the keys it already has. The mapping is plain logic that takes "now" as
 * an argument and never reads the clock.
 *
 * Times come off the plugin as epoch seconds. Every moment the watch shows is read on the phone's
 * clock, since that is the clock the watch keeps, and every day or night call is made on epoch
 * seconds, since minutes past the phone's midnight turn a far-off place's day around.
 */

import util from '../weather/util';
import conditions from '../weather/conditions';
import type { DailyStrip, HourlyStrip, WeatherResult } from '../weather/util';
import wire from '../pkjs/wire';
import { phoneDayOf, phoneOffsetMinutes } from '../pkjs/phone-clock';
import { firstProperties, instancesOf, numeric, seriesIndex, seriesValue, text, timestamp } from '../plugin-shapes/shapes';
import { appFahrenheit, appWindUnit, temperatureScale, windUnit } from '../plugin-shapes/units';
import type { NumericReading } from '../plugin-shapes/shapes';
import { NO_PLUGIN } from './subscription';
import { PLUGINS_OFF_TEXT } from './page';
import { KNOWN_PLUGINS } from './directory';
import { uuidKey } from './escape';
import type { PluginSourceTexts } from './page';
import { createWeatherDriver } from './weather-driver';
import type { SeriesShape, SourceEnvelope, SourceProperty, WeatherPlugins } from './types';

/** What the weather feature hands the mapping with each update. */
export interface WeatherMappingOptions {
  /** Whether the reading goes out in °F, which every temperature is converted to. */
  fahrenheit: boolean;
  /** The moment to treat as now, as epoch seconds. */
  nowSeconds: number;
  /** The reading fields the face shows, such as `humidity` or `windKmh`, named as on `WeatherResult`. */
  fields: string[];
  /** Whether the face shows the forecast strips. */
  wantForecast: boolean;
}

const HOUR_SECONDS = 60 * 60;
const DAY_SECONDS = 24 * HOUR_SECONDS;

// the strips match the Open-Meteo ones. eight columns fill a 2x4 panel's two rows, and the hourly
// columns sit two hours apart
const FORECAST_COLS = 8;
const HOURLY_STEP_HOURS = 2;

// the bounds the watch holds a temperature to. anything outside is a plugin's "no value", such as
// the built-in's 32767, and clamping it would show 199 rather than a dash
const TEMPERATURE_MIN = -99;
const TEMPERATURE_MAX = 199;

// the watch keeps the label in 20 bytes, its last one the end of the string
const LABEL_CHARS = 19;

// the bounds each extra can really reach. a reading outside is a plugin's "no value" or bad data,
// and is left out so the watch keeps its dash. UV tops out in the low 20s on high mountains, and
// no wind on the ground reaches 400 km/h
const PERCENT_MAX = 100;
const UV_MAX = 20;
const DEGREES_MAX = 360;
const WIND_KMH_MAX = 400;

// the pressures the ground really sees at sea level, in hPa. the records are about 870 and 1084
const PRESSURE_MIN = 850;
const PRESSURE_MAX = 1100;

// a pressure's unit, lowercased with the spaces taken out, against how many hPa one of it is
const HPA_PER_UNIT: Record<string, number> = {
  hpa: 1,
  mb: 1,
  mbar: 1,
  inhg: 33.8638866667,
  mmhg: 1.333224,
  kpa: 10,
};

// a utc offset further out than any real zone is bad data
const OFFSET_LIMIT_MINUTES = 18 * 60;

// the built-in's condition codes, which come from the watch's own eight kinds of weather. light
// rain takes the drizzle glyph, and rain and snow takes sleet
const CONDITION_TOKENS: Record<string, string> = {
  sun: 'CLEAR',
  partly_cloudy: 'PCLDY',
  cloudy: 'CLDY',
  light_rain: 'DRZL',
  heavy_rain: 'RAIN',
  light_snow: 'SNOW',
  heavy_snow: 'SNOW',
  rain_and_snow: 'FZRN',
};

// a wind speed's unit, lowercased with the spaces taken out, against how many km/h one of it is
const KMH_PER_UNIT: Record<string, number> = {
  'km/h': 1,
  kmh: 1,
  kph: 1,
  mph: 1.609344,
  'm/s': 3.6,
  mps: 3.6,
  kn: 1.852,
  kt: 1.852,
  kts: 1.852,
  knots: 1.852,
};

// each reading field a face can show, against the plugin properties it comes from. dew point and UV
// can come as a single value or as an hourly series read at the current hour, since some plugins
// serve only the series. pressure comes from the single value alone, since a plugin's hourly_pressure
// can be the pressure at the ground, which reads about 120 hPa low in Calgary, where a face shows the
// pressure at sea level
const FIELD_PROPERTIES: Record<string, string[]> = {
  humidity: ['humidity'],
  windKmh: ['wind_speed'],
  windDir: ['wind_direction'],
  sunrise: ['sunrise'],
  sunset: ['sunset'],
  uvIndex: ['uv_index', 'hourly_uv_index'],
  feelsLike: ['feels_like'],
  pressure: ['pressure'],
  dewPoint: ['dew_point', 'hourly_dew_point'],
  tempMax: ['high'],
  tempMin: ['low'],
  precipChance: ['precipitation'],
};

// asked for on every subscription. the sun series are what the night check reads, and the utc
// offset is what puts the daily columns on the right dates. the WMO code gives the finer sky, and the
// hourly day flag is the night check where the sun times give nothing, as through a polar night
const ALWAYS_PROPERTIES = ['name', 'temperature', 'condition', 'condition_code', 'sunrise', 'sunset', 'daily_sunrise', 'daily_sunset', 'utc_offset', 'weather_code', 'hourly_weather_code', 'hourly_is_day'];

// asked for only by a face that shows the strips
const FORECAST_PROPERTIES = ['hourly_temperature', 'hourly_condition_code', 'daily_high', 'daily_low', 'daily_condition_code'];

// the daily series that can tell where the place's days fall, in the order they are tried
const DAILY_AXES = ['daily_condition_code', 'daily_high', 'daily_low', 'daily_sunrise', 'daily_sunset'];

type Properties = Record<string, SourceProperty | undefined>;

/** The series a property carries, or undefined when it has none. */
function seriesOf(property: SourceProperty | undefined): SeriesShape | undefined {
  return property && typeof property === 'object' && property.series && typeof property.series === 'object' ? property.series : undefined;
}

/**
 * A property's number, or undefined when it has none or the plugin's own bounds rule it out.
 *
 * A plugin can send a `min` and `max` beside the value, and a value outside them is bad data. The
 * bounds are skipped where a plugin uses them as the top of a gauge rather than a limit, as the
 * built-in does for UV, whose scale tops out at 11 while a real reading can run past it. The
 * temperatures never read through here, since gauge bounds on the current temperature would turn
 * a real reading outside them into `No Wx Data` for the whole face.
 */
function boundedReading(property: SourceProperty | undefined, ownBounds = true): NumericReading | undefined {
  const value = numeric(property);
  const shape = property && typeof property === 'object' ? property.numericValue : undefined;

  if (!value || !ownBounds || !shape || typeof shape !== 'object') {
    return value;
  }

  const { min, max } = shape;

  if (typeof min === 'number' && Number.isFinite(min) && value.value < min) {
    return undefined;
  }

  if (typeof max === 'number' && Number.isFinite(max) && value.value > max) {
    return undefined;
  }

  return value;
}

/** A number inside the bounds a field can hold, or undefined. */
function within(value: number | undefined, low: number, high: number): number | undefined {
  return value !== undefined && value >= low && value <= high ? value : undefined;
}

/** A temperature in kelvin or degrees Rankine as °C, or undefined for one in any other unit. */
function absoluteCelsius(reading: NumericReading): number | undefined {
  const plain = String(reading.unit || '').replace(/[°º\s]/g, '').toUpperCase();

  if (plain === 'K' || plain === 'KELVIN') {
    return reading.value - 273.15;
  }

  if (plain === 'R' || plain === 'RANKINE') {
    return ((reading.value - 491.67) * 5) / 9;
  }

  return undefined;
}

/**
 * A temperature in the unit the reading goes out in, rounded, or undefined when it cannot be used.
 *
 * The number is converted from the unit it says it is in, never read off the text: °C, °F, kelvin, or
 * degrees Rankine. One with no unit the scale can be read from is dropped rather than guessed at, and
 * so is one outside the bounds the watch holds a temperature to.
 */
function faceTemperature(reading: NumericReading | undefined, fahrenheit: boolean): number | undefined {
  const absolute = reading ? absoluteCelsius(reading) : undefined;
  const scale = absolute !== undefined ? 'C' : reading ? temperatureScale(reading.unit) : undefined;

  if (!reading || !scale) {
    return undefined;
  }

  let value = absolute !== undefined ? absolute : reading.value;

  if (scale === 'F' && !fahrenheit) {
    value = ((value - 32) * 5) / 9;
  } else if (scale === 'C' && fahrenheit) {
    value = (value * 9) / 5 + 32;
  }

  // adding 0 turns a rounded -0 into 0
  const rounded = Math.round(value) + 0;

  return rounded >= TEMPERATURE_MIN && rounded <= TEMPERATURE_MAX ? rounded : undefined;
}

/** A wind speed in km/h, or undefined when its unit is not one the table knows. */
function windKmh(reading: NumericReading | undefined): number | undefined {
  const unit = reading ? String(reading.unit || '').replace(/\s/g, '').toLowerCase() : '';
  const factor = KMH_PER_UNIT[unit];

  return reading && factor !== undefined ? reading.value * factor : undefined;
}

/** Our condition token for a plugin's condition code. A code the table does not know reads UNKNOWN. */
function conditionToken(code: string | undefined): string {
  return CONDITION_TOKENS[String(code || '').trim().toLowerCase()] || 'UNKNOWN';
}

/**
 * An hourly series' number for the hour holding a moment, the point whose stamp is at or before it.
 * The point is found by its stamp, never by counting hours from the series' start, so a day the clocks
 * change still reads the hour it says.
 */
function hourAt(properties: Properties, name: string, atSeconds: number): NumericReading | undefined {
  const series = seriesOf(properties[name]);

  return seriesValue(series, 'numericValue', seriesIndex(series, atSeconds));
}

/**
 * Whether a moment falls in daylight, on the place's own sunrise and sunset.
 *
 * It takes the day of the sun series that holds the moment and compares epoch seconds, so a place
 * whose sunrise falls before the phone's midnight still has its day the right way round. With no sun
 * times for that day, as through a polar night, it takes the plugin's `hourly_is_day` for that hour.
 * With neither, it counts as day, so a clear sky never shows a moon by mistake.
 */
function isDayAt(properties: Properties, atSeconds: number): boolean {
  const sunrise = seriesOf(properties.daily_sunrise);
  const sunset = seriesOf(properties.daily_sunset);
  const rise = seriesValue(sunrise, 'timestamp', seriesIndex(sunrise, atSeconds));
  const set = seriesValue(sunset, 'timestamp', seriesIndex(sunset, atSeconds));

  if (rise === undefined || set === undefined) {
    const flag = hourAt(properties, 'hourly_is_day', atSeconds)?.value;

    return flag !== 0;
  }

  return atSeconds >= rise && atSeconds < set;
}

/** A pressure in hPa, or undefined when its unit is not one the table knows or it is out of reach. */
function pressureHpa(reading: NumericReading | undefined): number | undefined {
  const unit = reading ? String(reading.unit || '').replace(/\s/g, '').toLowerCase() : '';
  const factor = Object.prototype.hasOwnProperty.call(HPA_PER_UNIT, unit) ? HPA_PER_UNIT[unit] : undefined;

  return within(reading && factor !== undefined ? reading.value * factor : undefined, PRESSURE_MIN, PRESSURE_MAX);
}

// the WMO codes Open-Meteo sends, the ones a plugin's weather_code is read as. any other number is
// another scheme's code, such as an OpenWeatherMap id, and the standard's condition code stands
const WMO_CODES = [0, 1, 2, 3, 45, 48, 51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 71, 73, 75, 77, 80, 81, 82, 85, 86, 95, 96, 99];

/** A WMO code a plugin served, if it is one of Open-Meteo's. */
function wmoCode(reading: NumericReading | undefined): number | undefined {
  return reading && WMO_CODES.includes(reading.value) ? reading.value : undefined;
}

/**
 * The sky now as a condition token, from the WMO code when the plugin serves one and else from the
 * standard's condition code. The WMO code keeps the fog, drizzle, showers, and thunder the nine codes
 * fold away. It is the single `weather_code`, or `hourly_weather_code` at the current hour, each taken
 * only when it is one of Open-Meteo's codes.
 */
function skyToken(properties: Properties, nowSeconds: number): { token: string; fromWmo: boolean } {
  const wmo = wmoCode(numeric(properties.weather_code)) ?? wmoCode(hourAt(properties, 'hourly_weather_code', nowSeconds));

  if (wmo !== undefined) {
    return { token: util.wmoToCondition(wmo), fromWmo: true };
  }

  return { token: conditionToken(text(properties.condition_code, 'long')), fromWmo: false };
}

/**
 * The place's offset from UTC in seconds.
 *
 * It is the `utc_offset` the plugin serves, in minutes, when it serves one. Otherwise it is worked
 * out from the daily series, which starts on the place's midnight and so fixes the offset to within
 * a whole day. Of the two offsets that fit, the one nearer the phone's is taken, which is right for
 * any place within 12 hours of the phone.
 */
function placeOffsetSeconds(properties: Properties, dayStart: number, nowSeconds: number): number {
  const served = numeric(properties.utc_offset);
  const unit = served ? String(served.unit || '').toLowerCase() : '';

  if (served && (unit === 'min' || unit === 'minutes') && Math.abs(served.value) <= OFFSET_LIMIT_MINUTES) {
    return served.value * 60;
  }

  const phone = phoneOffsetMinutes(nowSeconds * 1000) * 60;
  const east = (((-dayStart) % DAY_SECONDS) + DAY_SECONDS) % DAY_SECONDS;
  const west = east - DAY_SECONDS;

  return Math.abs(east - phone) <= Math.abs(west - phone) ? east : west;
}

/** Where the place's days sit, read off the first daily series that has an axis. */
interface PlaceDays {
  /** The middle of the first day the strip shows, as epoch seconds. Day `column` is this plus `column` days. */
  firstNoon: number;
  /** The place's offset from UTC in seconds. */
  offset: number;
}

/**
 * Finds the place's day that is the phone's today.
 *
 * It is the first day whose date on the place's own calendar is the phone's date or later, the rule
 * the Open-Meteo strip keeps. A place behind the phone is still on a day the phone has finished
 * with, and the watch would read that day as six days ahead, so those days come off the front. A
 * place across the date line starts on the phone's tomorrow, and the watch holds that day until it
 * comes. Each day is read at its middle, so a day an hour short or long across a clock change still
 * reads its own date.
 */
function placeDays(properties: Properties, nowSeconds: number): PlaceDays | null {
  // seriesIndex only answers for a series whose start is a moment a plugin can send, so every
  // Date built from the days below holds a real time
  const axis = DAILY_AXES.map((name) => seriesOf(properties[name])).find((series) => {
    return series !== undefined && seriesIndex(series, Number(series.start) + DAY_SECONDS / 2) !== undefined;
  });

  if (!axis) {
    return null;
  }

  const start = Number(axis.start);
  const offset = placeOffsetSeconds(properties, start, nowSeconds);
  const today = phoneDayOf(nowSeconds * 1000, phoneOffsetMinutes(nowSeconds * 1000));

  for (let day = 0; ; day++) {
    const noon = start + day * DAY_SECONDS + DAY_SECONDS / 2;

    if (seriesIndex(axis, noon) === undefined) {
      return null;
    }

    if (phoneDayOf(noon * 1000, offset / 60) >= today) {
      return { firstNoon: noon, offset };
    }
  }
}

/**
 * Builds the hourly strip, starting at the phone's current hour.
 *
 * The columns sit on the phone's hours two hours apart, and each series is read at each column's
 * moment, so a place on a half hour zone such as India still has its columns labelled on the
 * phone's hours. A series starts at the place's midnight, so its first point is rarely now, and
 * reading it would show hours already gone.
 *
 * A column past the end of the series, as after a night without a fresh fetch, or one on a missing
 * point, keeps its place with no temperature and an unknown sky. A series that has run out
 * altogether still sends its eight blank columns, so the watch blanks the strip rather than keep
 * showing the old one. Each column after dark gets the night bit.
 */
function hourlyStrip(properties: Properties, fahrenheit: boolean, nowSeconds: number): HourlyStrip | null {
  const temperatures = seriesOf(properties.hourly_temperature);
  const codes = seriesOf(properties.hourly_condition_code);

  if (!temperatures && !codes) {
    return null;
  }

  // the hour is floored on the phone's own clock, so a half hour zone such as India's starts on its
  // half hours. it is worked out in seconds rather than with setMinutes, which in the hour repeated
  // when the clocks go back resolves 01:30 to the first 01:00 and starts the strip an hour early
  const offsetSeconds = phoneOffsetMinutes(nowSeconds * 1000) * 60;
  const localSeconds = nowSeconds + offsetSeconds;
  const firstMoment = localSeconds - (((localSeconds % HOUR_SECONDS) + HOUR_SECONDS) % HOUR_SECONDS) - offsetSeconds;
  const baseHour = new Date(firstMoment * 1000).getHours();

  // a now that is not a real time would label the whole strip with a bogus hour
  if (!Number.isFinite(firstMoment) || !Number.isFinite(baseHour)) {
    return null;
  }

  const cols = [];

  for (let column = 0; column < FORECAST_COLS; column++) {
    const moment = firstMoment + column * HOURLY_STEP_HOURS * HOUR_SECONDS;
    let code = conditions.codeFor(conditionToken(seriesValue(codes, 'longText', seriesIndex(codes, moment))));

    // an unknown sky has no night glyph, so it is left alone
    if (code !== conditions.UNKNOWN_CODE && !isDayAt(properties, moment)) {
      code |= conditions.FORECAST_NIGHT_BIT;
    }

    const temp = faceTemperature(seriesValue(temperatures, 'numericValue', seriesIndex(temperatures, moment)), fahrenheit);

    cols.push({ code, temp: temp === undefined ? null : temp });
  }

  return { baseHour, stepHours: HOURLY_STEP_HOURS, cols };
}

/**
 * Builds the daily strip, starting on the place's day that is the phone's today.
 *
 * It runs up to eight days and stops where the series do. A day on whole-day glyphs carries no night
 * bit. The base weekday is the first day's own, on the place's calendar.
 */
function dailyStrip(properties: Properties, fahrenheit: boolean, days: PlaceDays | null): DailyStrip | null {
  if (!days) {
    return null;
  }

  const highs = seriesOf(properties.daily_high);
  const lows = seriesOf(properties.daily_low);
  const codes = seriesOf(properties.daily_condition_code);
  const cols = [];

  for (let column = 0; column < FORECAST_COLS; column++) {
    const noon = days.firstNoon + column * DAY_SECONDS;
    const indexes = [highs, lows, codes].map((series) => seriesIndex(series, noon));

    if (indexes.every((index) => index === undefined)) {
      break;
    }

    const tempMax = faceTemperature(seriesValue(highs, 'numericValue', indexes[0]), fahrenheit);
    const tempMin = faceTemperature(seriesValue(lows, 'numericValue', indexes[1]), fahrenheit);

    cols.push({
      code: conditions.codeFor(conditionToken(seriesValue(codes, 'longText', indexes[2]))),
      tempMax: tempMax === undefined ? null : tempMax,
      tempMin: tempMin === undefined ? null : tempMin,
    });
  }

  const baseWeekday = new Date((days.firstNoon + days.offset) * 1000).getUTCDay();

  // a weekday that is not a real day would label every column wrong
  if (!cols.length || !Number.isFinite(baseWeekday)) {
    return null;
  }

  return { baseWeekday, cols };
}

/**
 * A sun time on the phone's clock, from the sun series for the place's today, or else the single
 * reading the plugin serves for the first forecast day.
 */
function sunMinutes(properties: Properties, seriesName: string, singleName: string, days: PlaceDays | null): number | null {
  const series = seriesOf(properties[seriesName]);
  const fromSeries = days ? seriesValue(series, 'timestamp', seriesIndex(series, days.firstNoon)) : undefined;

  return util.minutesFromUnix(fromSeries !== undefined ? fromSeries : timestamp(properties[singleName]));
}

/**
 * The plugin's own words for the sky, or undefined when it has none to give.
 *
 * Only the `shortText` is read. The built-in's `longText` is a forecast phrase of up to 32
 * characters, which would be cut mid word on the watch. After dark a label naming the sun, such as
 * the built-in's "Sunny" for a clear sky, gives way to the token's own words, so a clear night does
 * not read sunny under a moon.
 */
function plainLabel(property: SourceProperty | undefined, isDay: boolean): string | undefined {
  const label = property && typeof property === 'object' ? text({ shortText: property.shortText }, 'short') : undefined;

  // a label that is one of the standard's codes, such as partly_cloudy, is a code rather than words
  if (label === undefined || (!isDay && /sun/i.test(label)) || Object.prototype.hasOwnProperty.call(CONDITION_TOKENS, label.trim().toLowerCase()) || label.trim().toLowerCase() === 'unknown') {
    return undefined;
  }

  // the watch fonts only carry ASCII, so an accent comes off and anything else becomes a ?
  const flat = wire.toAscii(label.trim());

  if (flat.length <= LABEL_CHARS) {
    return flat;
  }

  // a long label is cut at the last space that leaves whole words, and only a single word too long
  // for the label is cut through
  const space = flat.slice(0, LABEL_CHARS + 1).lastIndexOf(' ');

  return space > 0 ? flat.slice(0, space).trimEnd() : flat.slice(0, LABEL_CHARS);
}

/**
 * Turns one weather plugin update into the reading the watch takes.
 *
 * It reads the first place in the update. An update with no places means the Pebble app has no
 * weather location or no weather yet, and gives `No Location`. A first place with no temperature
 * the face can use gives `No Wx Data`, and the log names the plugin and the properties it sent.
 * Everything else that is missing is left off the result, so the watch keeps its dash.
 *
 * @param envelope The update, which may be missing or carry anything.
 * @param options The unit to send in, the moment to treat as now, the fields it shows, and whether it
 *   shows the strips.
 * @return The weather result, or a status result when there is nothing to show.
 */
export function weatherFromUpdate(envelope: SourceEnvelope | null | undefined, options: WeatherMappingOptions): WeatherResult {
  const { fahrenheit, nowSeconds, fields, wantForecast } = options;

  if (!instancesOf(envelope).length) {
    return util.status('No Location');
  }

  const properties: Properties = firstProperties(envelope) || {};
  const temperature = faceTemperature(numeric(properties.temperature), fahrenheit);

  if (temperature === undefined) {
    console.log(`Plugin weather: ${envelope?.pluginUuid || 'an unnamed plugin'} sent no usable temperature, only ${Object.keys(properties).join(', ') || 'no properties'}`);
    return util.status('No Wx Data');
  }

  const shown = new Set(Array.isArray(fields) ? fields : []);
  const days = placeDays(properties, nowSeconds);
  const isDay = isDayAt(properties, nowSeconds);
  const extra: Record<string, unknown> = {};

  if (shown.has('humidity')) {
    extra.humidity = within(boundedReading(properties.humidity)?.value, 0, PERCENT_MAX);
  }

  if (shown.has('windKmh')) {
    extra.windKmh = within(windKmh(boundedReading(properties.wind_speed)), 0, WIND_KMH_MAX);
  }

  if (shown.has('windDir')) {
    extra.windDir = util.degToCompass(within(boundedReading(properties.wind_direction)?.value, 0, DEGREES_MAX));
  }

  if (shown.has('sunrise')) {
    extra.sunrise = sunMinutes(properties, 'daily_sunrise', 'sunrise', days);
  }

  if (shown.has('sunset')) {
    extra.sunset = sunMinutes(properties, 'daily_sunset', 'sunset', days);
  }

  // a face's own fetch shows the UV now, and the standard's uv_index is the day's peak, so the hour
  // now comes first and the peak only stands in for a plugin with no usable hourly UV.
  //
  // the hourly readings are read at the hour now, while the temperature is the one the update came
  // with. an update held for hours would let the two drift apart, but the Pebble app runs a plugin
  // again every 15 minutes, so that takes a phone offline or a plugin that keeps failing, and the hour
  // now is still the better guess at the readings than the hour the update was made
  if (shown.has('uvIndex')) {
    extra.uvIndex = within(hourAt(properties, 'hourly_uv_index', nowSeconds)?.value, 0, UV_MAX) ?? within(boundedReading(properties.uv_index, false)?.value, 0, UV_MAX);
  }

  if (shown.has('pressure')) {
    extra.pressure = pressureHpa(numeric(properties.pressure));
  }

  // each candidate is put through its unit and range before the next is tried, so an unusable single
  // value gives way to the hourly series as a missing one does
  if (shown.has('dewPoint')) {
    extra.dewPoint = faceTemperature(numeric(properties.dew_point), fahrenheit) ?? faceTemperature(hourAt(properties, 'hourly_dew_point', nowSeconds), fahrenheit);
  }

  if (shown.has('feelsLike')) {
    extra.feelsLike = faceTemperature(numeric(properties.feels_like), fahrenheit);
  }

  if (shown.has('tempMax')) {
    extra.tempMax = faceTemperature(numeric(properties.high), fahrenheit);
  }

  if (shown.has('tempMin')) {
    extra.tempMin = faceTemperature(numeric(properties.low), fahrenheit);
  }

  if (shown.has('precipChance')) {
    extra.precipChance = within(boundedReading(properties.precipitation)?.value, 0, PERCENT_MAX);
  }

  const sky = skyToken(properties, nowSeconds);
  const condition = util.applyNight(sky.token, isDay);
  // a plugin that serves the place's coordinates fills a coordinate face's readout the way a fetch's
  // coordinates do, and one that serves none leaves it on its no fix state
  const lat = within(numeric(properties.latitude)?.value, -90, 90);
  const lon = within(numeric(properties.longitude)?.value, -180, 180);
  const result = util.ok(temperature, condition, text(properties.name, 'short'), lat, lon, extra);
  // a sky the WMO code decided is finer than the plugin's own words for it, so the token's words show
  const label = sky.fromWmo ? undefined : plainLabel(properties.condition, isDay);

  if (label !== undefined) {
    result.conditionLabel = label;
  }

  if (wantForecast) {
    util.attachForecast(result, { hourly: hourlyStrip(properties, fahrenheit, nowSeconds), daily: dailyStrip(properties, fahrenheit, days) });
  }

  return result;
}

export { appFahrenheit, appWindUnit };

/** The units a plugin reading shows in, as the watch's unit settings save them. */
export interface ReadingUnits {
  /** Whether the temperatures are in °F. */
  fahrenheit: boolean;
  /** The wind speed unit as the watch's wind unit setting saves it, or undefined when nothing names one. */
  wind?: number;
}

/** The units the wearer picked in the Pebble app, from its `preferences/units`. Each is undefined until it names one. */
export interface AppUnits {
  fahrenheit?: boolean;
  wind?: number;
}

/**
 * The units a plugin's reading shows in on the watch.
 *
 * They are the units the plugin serves the reading in, read off each value's own unit, so the watch
 * shows what the plugin's own settings picked. A plugin the directory marks with `fixedUnits` sends
 * fixed units whatever the wearer picked, as the Pebble app's built-in weather does with °C and mph,
 * so the units the wearer picked in the Pebble app are used in their place. Either way, a unit one side
 * leaves out is taken from the other, and °C stands in when neither names a temperature scale. A
 * temperature in kelvin or degrees Rankine shows in °C.
 *
 * @param envelope The update, which may be missing or carry anything.
 * @param app The units the wearer picked in the Pebble app, as far as it has said.
 * @return The units the reading goes out in.
 */
export function readingUnits(envelope: SourceEnvelope | null | undefined, app: AppUnits): ReadingUnits {
  const properties: Properties = firstProperties(envelope) || {};
  const temperature = numeric(properties.temperature);
  const scale = temperature && absoluteCelsius(temperature) !== undefined ? 'C' : temperatureScale(temperature?.unit);
  const own: AppUnits = { fahrenheit: scale === undefined ? undefined : scale === 'F', wind: windUnit(numeric(properties.wind_speed)?.unit) };
  const sender = uuidKey(envelope?.pluginUuid);
  const fromApp = KNOWN_PLUGINS.some((plugin) => plugin.fixedUnits && uuidKey(plugin.uuid) === sender);
  const [first, second] = fromApp ? [app, own] : [own, app];

  return { fahrenheit: first.fahrenheit ?? second.fahrenheit ?? false, wind: first.wind ?? second.wind };
}

/**
 * The properties the weather subscription asks for.
 *
 * The phone takes the list as a hint and the built-in plugin only uses it to skip series nobody
 * asked for, so asking for a little more than the face shows is cheap and asking for less loses
 * data. The name, temperature, sky, and sun are always asked for, since the night check reads the
 * sun series even for a face that shows no sun times. So are the WMO codes and the hourly day flag,
 * which a plugin that serves them uses for a finer sky and a night check with no sun.
 *
 * @param fields The reading fields the face shows, named as on `WeatherResult`.
 * @param wantForecast Whether the face shows the forecast strips.
 * @return The property names, each once.
 */
export function weatherProperties(fields: string[], wantForecast: boolean): string[] {
  const wanted = (Array.isArray(fields) ? fields : []).flatMap((field) => (Object.prototype.hasOwnProperty.call(FIELD_PROPERTIES, field) ? FIELD_PROPERTIES[field] : []));
  const names = [...ALWAYS_PROPERTIES, ...wanted, ...(wantForecast ? FORECAST_PROPERTIES : [])];

  return names.filter((name, index) => names.indexOf(name) === index);
}

// the status the watch shows for each subscription error that leaves it with no reading. the phone
// ends the subscription on PLUGIN_UNAVAILABLE, and the unit reports no plugin itself
const ERROR_STATUSES: Record<string, string> = {
  [NO_PLUGIN]: 'No Plugin',
  PLUGIN_UNAVAILABLE: 'No Plugin',
  PERMISSION_DENIED: 'No Permission',
};

/**
 * The status the watch shows for a subscription error, such as `No Permission` before the wearer
 * allows Location.
 *
 * @param code The error code, as an error hands it over or the saved state keeps it.
 * @return The status words, or undefined for a code that has none, which leaves the watch as it is.
 */
export function weatherErrorStatus(code: string | null | undefined): string | undefined {
  return typeof code === 'string' && Object.prototype.hasOwnProperty.call(ERROR_STATUSES, code) ? ERROR_STATUSES[code] : undefined;
}

/**
 * The weather page hook's rows, which show only while the plugin is picked. On a face whose providers
 * list is the plugin alone they always show, and the one for no plugin joins them.
 */
export const WEATHER_TEXTS: PluginSourceTexts = {
  notStandard: (pluginName) => `${pluginName} sends weather this watchface cannot read. Pick another weather plugin under Preferred Sources in the Pebble app, or another data source here.`,
  notStandardNoSelect: (pluginName) => `${pluginName} sends weather this watchface cannot read. Pick another weather plugin under Preferred Sources in the Pebble app.`,
  permissionDenied: 'This watchface needs Location to read the Pebble app\'s weather. Allow it for this watchface in the Pebble app.',
  source: 'Your watch shows the weather for the first location in the Pebble app\'s weather settings.',
  noPlugin: PLUGINS_OFF_TEXT,
};

/**
 * Everything the weather feature reads plugin weather with, which plugin-sources/index hands it on a
 * face built with `PLUGIN_WEATHER`. The weather plugins serve one instance per place under
 * `weather/location`.
 */
/** The line added to the source note on a face that shows coordinates. */
export const COORDS_TEXT = 'The coordinates show only from a weather plugin that serves them.';

export const weatherPlugins: WeatherPlugins = {
  driver: createWeatherDriver({ fromUpdate: weatherFromUpdate, units: readingUnits, appFahrenheit, appWindUnit, properties: weatherProperties, errorStatus: weatherErrorStatus, texts: WEATHER_TEXTS, coordsText: COORDS_TEXT }),
};

export default { weatherFromUpdate, readingUnits, appFahrenheit, appWindUnit, weatherProperties, weatherErrorStatus, WEATHER_TEXTS };
