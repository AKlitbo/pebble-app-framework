/**
 * WeatherAPI.com weather provider (requires an API key).
 *
 * Takes coordinates only, sent as a "lat,lon" query: the phone's GPS fix, or the saved place the
 * settings page looked up once (see ../../clay/location-component.ts). This module never geocodes.
 */

import util from '../util';
import { joinCalls } from '../../pkjs/providers';
import openMeteo from './openmeteo';
import type { RequestFn, DoneFn, WeatherOpts, WeatherResult, ForecastCols, WeatherCoords } from '../util';
import { fetchPairedReading } from './paired-reading';
import type { ProviderCurrent } from './paired-reading';
import { readingStatus, valueOrGap } from '../reading';
import type { ReadingCondition, ReadingResult, ReadingStatus } from '../reading';

const WEATHER_API_URL = 'https://api.weatherapi.com/v1/forecast.json';

// WeatherAPI's numeric condition.code is stable across locales unlike the text
// which is localized. map it to our tokens directly and an unlisted code falls back
// to text aliasing via shorten(). codes come from WeatherAPI's published list
const WEATHERAPI_CODE: Record<number, string> = {
  1000: 'CLEAR',
  1003: 'PCLDY',
  1006: 'CLDY', 1009: 'CLDY',
  1030: 'FOGGY', 1135: 'FOGGY', 1147: 'FOGGY',
  1063: 'RAIN', 1180: 'RAIN', 1183: 'RAIN', 1186: 'RAIN', 1189: 'RAIN', 1192: 'RAIN', 1195: 'RAIN',
  1240: 'SHWR', 1243: 'SHWR', 1246: 'SHWR',
  1150: 'DRZL', 1153: 'DRZL',
  1072: 'FZDZ', 1168: 'FZDZ', 1171: 'FZDZ',
  1066: 'SNOW', 1210: 'SNOW', 1213: 'SNOW', 1216: 'SNOW', 1219: 'SNOW', 1222: 'SNOW', 1225: 'SNOW',
  1114: 'SNOW', 1117: 'SNOW',
  1255: 'SNSH', 1258: 'SNSH',
  1069: 'FZRN', 1198: 'FZRN', 1201: 'FZRN', 1204: 'FZRN', 1207: 'FZRN', 1249: 'FZRN', 1252: 'FZRN',
  1237: 'FZRN', 1261: 'FZRN', 1264: 'FZRN',
  1087: 'STRM', 1273: 'STRM', 1276: 'STRM', 1279: 'STRM', 1282: 'STRM',
};

/**
 * The nearest WMO weather code for each condition code WeatherAPI publishes, from the codes
 * Open-Meteo uses.
 *
 * Each code keeps to the token `WEATHERAPI_CODE` gives, so sleet and ice pellets read as freezing rain
 * and snow with thunder as a thunderstorm. Haze, smoke, dust, sand, and smog take fog, the nearest sky
 * that hides the view. The face has no token for most of those, so a reading takes fog's token with
 * the code.
 */
export const WEATHERAPI_WMO: Record<number, number> = {
  1000: 0, 1003: 2, 1006: 3, 1009: 3,
  1012: 45, 1015: 45, 1018: 45, 1021: 45, 1024: 45, 1027: 45, 1030: 45, 1033: 45, 1036: 45, 1039: 45, 1042: 45, 1045: 45, 1048: 45,
  1135: 45, 1147: 48,
  1063: 61, 1180: 61, 1183: 61, 1186: 63, 1189: 63, 1192: 65, 1195: 65,
  1240: 80, 1243: 81, 1246: 82,
  1150: 51, 1153: 51,
  1072: 56, 1168: 56, 1171: 57,
  1066: 71, 1210: 71, 1213: 71, 1216: 73, 1219: 73, 1222: 75, 1225: 75, 1114: 73, 1117: 75,
  1255: 85, 1258: 86,
  1069: 66, 1198: 66, 1201: 67, 1204: 66, 1207: 67, 1249: 66, 1252: 67, 1237: 66, 1261: 66, 1264: 67,
  1087: 95, 1273: 95, 1276: 95, 1279: 95, 1282: 95,
};

export interface WeatherApiDay {
  maxtemp_f?: number; maxtemp_c?: number; mintemp_f?: number; mintemp_c?: number;
  daily_chance_of_rain?: number;
}

export interface WeatherApiForecastDay {
  date?: string;
  astro?: { sunrise?: string; sunset?: string };
  day?: WeatherApiDay;
}

/**
 * The forecast day that is the phone's today, or null when the response does not hold it.
 *
 * WeatherAPI dates each day on the location's own calendar, and the watch keeps the high, low, and
 * rain chance as the phone's today. For a city on another date the first day is the wrong one, so
 * the day is matched by date. A response with no moment or no dates to match on takes the first day.
 */
function phoneTodayOf(days: WeatherApiForecastDay[], epochSeconds: unknown): WeatherApiForecastDay | null {
  const epochMs = Number(epochSeconds) * 1000;

  if (!Number.isFinite(epochMs) || !days.some((forecast) => forecast.date)) {
    return days[0] || null;
  }

  const today = util.phoneDayOf(epochMs, util.phoneOffsetMinutes(epochMs));

  return days.find((forecast) => forecast.date === today) || null;
}

/** The subset of a WeatherAPI forecast.json response this provider reads. */
export interface WeatherApiResponse {
  error?: { message?: string; code?: number };
  location?: { name?: string; lat?: number; lon?: number; localtime?: string; localtime_epoch?: number };
  current?: {
    last_updated_epoch?: number;
    condition?: { code?: number; text?: string };
    temp_f?: number; temp_c?: number; is_day?: number;
    humidity?: number; wind_kph?: number; wind_degree?: number; wind_dir?: string; uv?: number;
    feelslike_f?: number; feelslike_c?: number; pressure_mb?: number;
    dewpoint_f?: number; dewpoint_c?: number;
  };
  forecast?: { forecastday?: WeatherApiForecastDay[] };
}

/**
 * Turns a WeatherAPI forecast.json response into a weather result.
 *
 * Kept separate from the network flow so the parsing is easy to exercise on its own.
 * Returns a status result for an error or missing-data response, or a full reading.
 *
 * @param json The WeatherAPI response to read.
 * @param opts The weather request options, read for the unit and the label to prefer.
 * @return A status result on error or missing data, or the parsed weather result.
 */
function parseWeather(json: WeatherApiResponse, opts: WeatherOpts): WeatherResult {
  // WeatherAPI signals failures with an error object carrying a numeric code
  if (json.error) {
    console.log('weatherapi error:', json.error.message);

    // 1006 is 'no matching location found'
    if (json.error.code === 1006) {
      return util.status('Loc Not Found');
    }

    // codes 1002 and 2006 and 2008 are forms of invalid or disabled API keys
    if ([1002, 2006, 2008].includes(Number(json.error.code))) {
      return util.status('Invalid Key');
    }

    // 2007 is the key's monthly quota used up, which another try seconds later only spends more of
    if (Number(json.error.code) === 2007) {
      return util.status('Rate Limit');
    }

    return util.status('API Error');
  }

  if (!json.current || !json.current.condition) {
    return util.status('No Wx Data');
  }

  // prefer the label resolved at geocode time then WeatherAPI's own resolved name
  const label = opts.label ||
      (json.location && json.location.name) ||
      'My Location';

  const temperature = opts.fahrenheit ? json.current.temp_f : json.current.temp_c;

  // is_day is 1 by day and 0 at night. a missing value counts as day so a
  // clear sky never wrongly shows a moon
  const isDay = json.current.is_day !== 0;

  // WeatherAPI echoes the resolved location's coordinates in json.location
  const loc: { name?: string; lat?: number; lon?: number; localtime?: string; localtime_epoch?: number } = json.location || {};

  const forecastDays: WeatherApiForecastDay[] = json.forecast?.forecastday || [];
  // the sun times come from the location's first day, which is a few minutes off at most on
  // another date. the high, low, and rain chance are left out rather than taken from the wrong day
  const astro: { sunrise?: string; sunset?: string } = (forecastDays[0] && forecastDays[0].astro) || {};
  const day: WeatherApiDay = (phoneTodayOf(forecastDays, loc.localtime_epoch) || {}).day || {};

  // prefer the stable numeric code and fall back to the localized text which
  // shorten() still resolves through CONDITION_ALIASES for any unlisted code
  const cond = WEATHERAPI_CODE[Number(json.current.condition.code)] || json.current.condition.text || '';

  return util.ok(
    temperature,
    util.applyNight(cond, isDay),
    label,
    loc.lat,
    loc.lon,
    {
      humidity: json.current.humidity,
      windKmh: json.current.wind_kph,
      windDir: json.current.wind_dir,
      uvIndex: json.current.uv,
      feelsLike: opts.fahrenheit ? json.current.feelslike_f : json.current.feelslike_c,
      pressure: json.current.pressure_mb,
      dewPoint: opts.fahrenheit ? json.current.dewpoint_f : json.current.dewpoint_c,
      tempMax: opts.fahrenheit ? day.maxtemp_f : day.maxtemp_c,
      tempMin: opts.fahrenheit ? day.mintemp_f : day.mintemp_c,
      precipChance: day.daily_chance_of_rain,
      // the astro times are the location's own clock, so they move onto the phone's, which the watch keeps
      sunrise: util.minutesAtPhone(util.minutesFrom12Hour(astro.sunrise), loc.localtime, loc.localtime_epoch),
      sunset: util.minutesAtPhone(util.minutesFrom12Hour(astro.sunset), loc.localtime, loc.localtime_epoch),
    }
  );
}

/**
 * Fetches current weather from WeatherAPI.com.
 *
 * @param opts The weather request options, read for the key, the coordinates, and whether a forecast is wanted.
 * @param request The function that performs the actual network request.
 * @param done Called with the weather result.
 */
function fetch(opts: WeatherOpts, request: RequestFn, done: DoneFn): void {
  if (!opts.key) {
    return done(util.status('No API Key'));
  }

  if (!opts.coords) {
    return done(util.status('No Location'));
  }

  const query = `${opts.coords.lat},${opts.coords.lon}`;

  const url = `${WEATHER_API_URL}?key=${encodeURIComponent(opts.key)}&q=${encodeURIComponent(query)}&days=2`;

  // WeatherAPI has no forecast strip of its own so when the face shows the forecast row we
  // borrow it from Open-Meteo the same way OWM does. firing it in parallel here keeps it from
  // becoming a fragile follow-up request
  let result: WeatherResult | null = null;
  let forecast: ForecastCols | null = null;

  const tryDone = joinCalls(opts.wantForecast ? 2 : 1, () => {
    if (result && result.ok && forecast) {
      util.attachForecast(result, forecast);
    }

    done(result as WeatherResult);
  });

  util.requestJson<WeatherApiResponse>(url, request, (status) => {
    result = status;
    tryDone();
  }, (json) => {
    result = parseWeather(json, opts);
    tryDone();
  });

  if (opts.wantForecast) {
    openMeteo.fetchForecast(opts, request, (fetched) => {
      forecast = fetched;
      tryDone();
    });
  }
}

/** What one place costs against WeatherAPI.com's limits in `fetchReading`, one call. */
export const READING_WEIGHT = 1;

/**
 * The place's offset from UTC in seconds, from its local time beside the UTC moment, or null. Every
 * zone sits on a quarter hour, so the gap is rounded to 15 minutes, which also covers a local time a
 * minute or so behind its moment.
 */
function offsetOf(localtime: unknown, epochSeconds: unknown): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2}) (\d{1,2}):(\d{2})$/.exec(String(localtime || ''));
  const epoch = valueOrGap(epochSeconds);

  if (!match || epoch === null) {
    return null;
  }

  const wall = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), Number(match[4]), Number(match[5]));

  return Math.round((wall / 1000 - epoch) / 900) * 900;
}

/**
 * The sky from WeatherAPI's current condition, read the way the face's fetch reads it. Where the face
 * has no token but the code has a WMO code, the token is the code's, so the two never name different
 * skies.
 */
function weatherApiCondition(condition: { code?: number; text?: string }, isDay: unknown): ReadingCondition {
  const code = Number(condition.code);
  const wmo = Object.prototype.hasOwnProperty.call(WEATHERAPI_WMO, code) ? WEATHERAPI_WMO[code] : null;

  const token = util.applyNight(WEATHERAPI_CODE[code] || condition.text || '', true);

  return {
    token: token === 'UNKNOWN' && wmo !== null ? util.wmoToCondition(wmo) : token,
    wmo,
    isDay: isDay === 1 ? true : isDay === 0 ? false : null,
  };
}

/**
 * Reads a WeatherAPI answer, or its error, into a place's current values.
 *
 * A 429 is `RATE LIMIT` whatever the body says. An error body is read the way the face reads it, so
 * an invalid or disabled key is `INVALID KEY` and a spent monthly quota is `RATE LIMIT` with its
 * `limit` set to `month`.
 */
function parseWeatherApiCurrent(err: string | null, json: WeatherApiResponse | null): ProviderCurrent | ReadingStatus {
  if (err === 'http 429') {
    return readingStatus('Rate Limit');
  }

  if (!json) {
    return readingStatus(err ? 'NET ERROR' : 'BAD WX DATA');
  }

  if (json.error) {
    const status = readingStatus(parseWeather(json, {}).condition);

    // 2007 is the month's calls spent, so the key answers nothing until the 1st
    if (Number(json.error.code) === 2007) {
      status.limit = 'month';
    }

    return status;
  }

  const current = json.current;
  const temperature = valueOrGap(current?.temp_c);

  if (!current || !current.condition || temperature === null) {
    return readingStatus('No Wx Data');
  }

  return {
    time: valueOrGap(current.last_updated_epoch) ?? valueOrGap(json.location?.localtime_epoch),
    utcOffset: offsetOf(json.location?.localtime, json.location?.localtime_epoch),
    temperature,
    feelsLike: valueOrGap(current.feelslike_c),
    condition: weatherApiCondition(current.condition, current.is_day),
    humidity: valueOrGap(current.humidity),
    windSpeed: valueOrGap(current.wind_kph),
    windDirection: valueOrGap(current.wind_degree),
    uvIndex: valueOrGap(current.uv),
    pressure: valueOrGap(current.pressure_mb),
    dewPoint: valueOrGap(current.dewpoint_c),
  };
}

/**
 * Fetches a reading for several places from WeatherAPI.com, with the series, the offset, and the
 * sun times from one batched Open-Meteo request.
 *
 * It asks for one day of forecast, the least the forecast endpoint takes, since only the current
 * values are read from it.
 *
 * @param places Each place's coordinates, in the order the readings come back.
 * @param key The wearer's WeatherAPI.com key.
 * @param request The function that performs the actual network request.
 * @param done Called once with a reading or a status for each place, in the order asked.
 */
export function fetchReading(places: Array<WeatherCoords | null | undefined>, key: string, request: RequestFn, done: (results: ReadingResult[]) => void): void {
  fetchPairedReading<WeatherApiResponse>({
    source: 'weatherapi',
    urlFor: (coords, apiKey) => `${WEATHER_API_URL}?key=${encodeURIComponent(apiKey)}&q=${encodeURIComponent(`${coords.lat},${coords.lon}`)}&days=1`,
    parse: parseWeatherApiCurrent,
  }, places, key, request, done);
}

export default { fetch, parseWeather, fetchReading };
