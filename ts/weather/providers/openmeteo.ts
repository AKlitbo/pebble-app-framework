/**
 * Open-Meteo weather provider (free, no API key).
 *
 * Takes resolved coordinates only. Place-name geocoding happens once at
 * settings time (see clay/location-component.ts), so this module never geocodes.
 */

import util from '../util';
import conditions from '../conditions';
import type { RequestFn, DoneFn, WeatherOpts, WeatherCoords, HourlyStrip, DailyStrip, ForecastCols } from '../util';

const OPEN_METEO_FORECAST_API = 'https://api.open-meteo.com/v1/forecast';

// how many columns the forecast row shows and how far apart the hourly ones sit. eight fills
// the 2x4's two stacked rows (the hourly strip then spans the next 16 hours at a 2-hour step)
const FORECAST_COLS = 8;
const HOURLY_STEP_HOURS = 2;

/** The subset of an Open-Meteo forecast response this module reads. */
export interface OpenMeteoResponse {
  error?: boolean;
  reason?: string;
  utc_offset_seconds?: number;
  current?: {
    time?: string;
    temperature_2m?: number;
    weather_code?: number;
    is_day?: number;
    relative_humidity_2m?: number;
    wind_speed_10m?: number;
    wind_direction_10m?: number;
    uv_index?: number;
    apparent_temperature?: number;
    pressure_msl?: number;
    dew_point_2m?: number;
  };
  hourly?: {
    time?: string[];
    temperature_2m?: number[];
    weather_code?: number[];
    is_day?: number[];
  };
  daily?: {
    time?: string[];
    temperature_2m_max?: number[];
    temperature_2m_min?: number[];
    weather_code?: number[];
    sunrise?: string[];
    sunset?: string[];
    precipitation_probability_max?: number[];
  };
}

/**
 * Rounds a forecast column's temperature to a whole number held to -99 to 199, or null when it
 * isn't a real number.
 *
 * A forecast column with no temperature ships null so the packer can swap in the
 * no-reading marker instead of a bogus zero. The bounds are the watch's for the current
 * temperature, since a glitch value otherwise drew 32767 in a three digit column.
 */
function roundOrNull(value: unknown): number | null {
  // null/undefined/'' all coerce to 0 through Number() so reject them first
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const number = Number(value);
  return Number.isFinite(number) ? Math.min(199, Math.max(-99, Math.round(number))) : null;
}

/** The phone's clock against the one a response is written in, worked out once per response. */
interface PhoneClock {
  /** How many minutes the phone's clock is ahead of the response's. */
  shiftMinutes: number;
  /** The phone's day as YYYY-MM-DD, or null when the response gives no moment to read it at. */
  today: string | null;
}

const SAME_CLOCK: PhoneClock = { shiftMinutes: 0, today: null };

/**
 * The wall clock of an ISO time like "2026-07-05T09:15", or a date like "2026-07-05" at its
 * midnight, read as if it were UTC so the phone's own zone cannot nudge it. Null when it does not
 * read.
 */
function wallMsOfIso(iso: unknown): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/.exec(String(iso || ''));
  if (!match) {
    return null;
  }

  return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), Number(match[4] || 0), Number(match[5] || 0));
}

/**
 * Works out how the phone's clock sits against the response's.
 *
 * Open-Meteo writes every time in a response with one offset, the requested zone's at the moment
 * of the request, and names it in utc_offset_seconds. Asked in the phone's own zone the two clocks
 * agree and nothing moves. Asked in the location's zone for a city the phone is not in, every time
 * moves by the gap, or the watch reads it on the wrong clock. The phone's offset is read at the
 * response's own now, so both sides are measured at the same moment.
 */
function phoneClockFor(json: OpenMeteoResponse | null): PhoneClock {
  const offsetSeconds = json?.utc_offset_seconds;
  const wallMs = wallMsOfIso(json?.current?.time);
  if (typeof offsetSeconds !== 'number' || !Number.isFinite(offsetSeconds) || wallMs === null) {
    return SAME_CLOCK;
  }

  const nowMs = wallMs - offsetSeconds * 1000;
  const phoneOffset = util.phoneOffsetMinutes(nowMs);

  return {
    shiftMinutes: phoneOffset - offsetSeconds / 60,
    today: util.phoneDayOf(nowMs, phoneOffset),
  };
}

/**
 * Where the phone's today sits in the daily block, or -1 when the block does not hold it.
 *
 * A response on the phone's clock, or one with no moment to read the phone's day at, starts on
 * today, so the first day is taken.
 */
function todayIndex(json: OpenMeteoResponse | null, phone: PhoneClock): number {
  const times = json?.daily?.time;
  if (phone.today === null || !Array.isArray(times)) {
    return 0;
  }

  return times.indexOf(phone.today);
}

/**
 * Builds the hourly strip from an Open-Meteo response.
 *
 * Starts at the first slot at or after now so the row shows upcoming hours, then
 * strides by HOURLY_STEP_HOURS. Each column carries the condition as its wire
 * code and the temperature in the unit the request already asked for. A column
 * whose hour falls after dark (is_day 0) gets the night bit so the watch loads
 * the night glyph. A missing is_day is treated as day, same as the current icon. The base hour is
 * on the phone's clock.
 */
function parseHourly(json: OpenMeteoResponse | null, phone: PhoneClock): HourlyStrip | null {
  const hourly = json?.hourly;
  const current = json?.current;
  if (!hourly || !Array.isArray(hourly.time) || !Array.isArray(hourly.temperature_2m)) {
    return null;
  }

  const times = hourly.time;
  const temps = hourly.temperature_2m;
  const codes = hourly.weather_code || [];
  const isDay = hourly.is_day || [];

  const now = current?.time || '';
  let start = times.findIndex((time) => time >= now);
  if (start < 0) {
    start = 0;
  }

  const cols = [];
  for (let column = 0; column < FORECAST_COLS; column++) {
    const index = start + column * HOURLY_STEP_HOURS;
    if (index >= times.length) {
      break;
    }
    let code = conditions.codeFor(util.wmoToCondition(codes[index]));
    // mark the night hours. an unknown code has no night glyph so leave it alone
    if (code !== conditions.UNKNOWN_CODE && isDay[index] === 0) {
      code |= conditions.FORECAST_NIGHT_BIT;
    }
    cols.push({
      code: code,
      temp: roundOrNull(temps[index]),
    });
  }

  if (!cols.length) {
    return null;
  }

  // a base we can't read would ship a bogus hour the watch labels the whole strip
  // with so drop the strip instead of sending a wrong marker
  const baseMinutes = util.minutesFromIso(times[start]);
  if (baseMinutes === null) {
    return null;
  }
  const baseHour = Math.floor(baseMinutes / 60);

  // the columns sit on the location's whole hours. a phone half an hour off them rounds the label
  // down, so a column reads up to 45 minutes early and never behind the watch's own hour, which is
  // what keeps the strip aging from the right place
  const phoneMinutes = util.shiftDayMinutes(baseHour * 60, phone.shiftMinutes) as number;

  return { baseHour: Math.floor(phoneMinutes / 60), stepHours: HOURLY_STEP_HOURS, cols };
}

/**
 * Builds the 7-day strip from an Open-Meteo response.
 *
 * Takes the first FORECAST_COLS days starting the phone's today. Each column carries the
 * condition code plus the day's high and low in the user's unit.
 */
function parseDaily(json: OpenMeteoResponse | null, phone: PhoneClock): DailyStrip | null {
  const daily = json?.daily;
  if (!daily || !Array.isArray(daily.time)) {
    return null;
  }

  const times = daily.time;
  const maxes = daily.temperature_2m_max || [];
  const mins = daily.temperature_2m_min || [];
  const codes = daily.weather_code || [];

  // a city behind the phone is still on a day the phone has finished with, and the watch would read
  // that day as six days ahead and never age it, so days before the phone's today come off the
  // front. a city ahead starts on the phone's tomorrow, and the watch holds that whole until then
  const today = phone.today;
  const first = today === null ? 0 : times.findIndex((day) => String(day) >= today);
  if (first < 0) {
    return null;
  }

  const cols = [];
  for (let column = first; column < first + FORECAST_COLS && column < times.length; column++) {
    cols.push({
      code: conditions.codeFor(util.wmoToCondition(codes[column])),
      tempMax: roundOrNull(maxes[column]),
      tempMin: roundOrNull(mins[column]),
    });
  }

  if (!cols.length) {
    return null;
  }

  // same guard as the hourly strip: a base weekday we can't read would mislabel every day
  const firstDayMs = wallMsOfIso(times[first]);
  if (firstDayMs === null) {
    return null;
  }
  const baseWeekday = new Date(firstDayMs).getUTCDay();

  return { baseWeekday: baseWeekday, cols };
}

/**
 * Pulls the hourly and 7-day forecast strips out of an Open-Meteo response.
 *
 * Shared like parseExtras: the openmeteo provider parses it from its own
 * response, while owm/weatherapi feed a supplemental Open-Meteo response
 * through the same parser so every face gets the same forecast shape.
 *
 * @param json The Open-Meteo response to read the strips from, or null when there is none.
 * @return The hourly and daily forecast strips, each null on its own when the response has nothing usable.
 */
function parseForecast(json: OpenMeteoResponse | null): ForecastCols {
  const phone = phoneClockFor(json);
  return { hourly: parseHourly(json, phone), daily: parseDaily(json, phone) };
}


/**
 * The hourly block the forecast row is built from.
 *
 * `is_day` is what lets each column pick a day or a night glyph, so a builder that drops it
 * leaves the whole row on daytime icons after dark. `temperature_2m` also rides in `current`
 * on every query, because `current.time` is how parseHourly knows which column is now.
 */
const HOURLY_FORECAST = 'temperature_2m,weather_code,is_day';

/**
 * The hourly rows the strip reads, counted from the current hour. The columns span 15 rows, and the
 * first one is the next hour once now is past the hour, so it takes 16.
 */
const FORECAST_HOURS = FORECAST_COLS * HOURLY_STEP_HOURS;

/** Eight days so the daily strip fills a 2x4 panel. Open-Meteo gives seven without it. */
const FORECAST_DAYS = 8;

/**
 * Assembles an Open-Meteo query from the parts a caller wants.
 *
 * Every builder here needs the same coordinates, the same unit, and the same zone, so those live
 * here rather than in each one. The zone is the phone's when the options carry it, so the sun times
 * and the strips' base hour and weekday come back on the clock the watch keeps. Otherwise it is
 * the location's own, through `timezone=auto`, and the parse moves every time onto the phone's clock.
 *
 * @param opts The weather request options, read for the coordinates and the unit.
 * @param parts The query pieces this caller wants, each already comma-joined.
 * @return The Open-Meteo URL to fetch.
 */
function buildUrl(opts: WeatherOpts, parts: { current: string; daily: string; hourly?: string; windKmh?: boolean }): string {
  const coords = opts.coords as WeatherCoords;
  const unit = opts.fahrenheit ? 'fahrenheit' : 'celsius';

  let url = `${OPEN_METEO_FORECAST_API}?latitude=${coords.lat}&longitude=${coords.lon}` +
    `&current=${parts.current}`;

  if (parts.hourly) {
    // forecast_days sets the daily rows. forecast_hours trims the hourly block to the strip
    // or it would carry every hour of all eight days
    url += `&hourly=${parts.hourly}&forecast_hours=${FORECAST_HOURS}&forecast_days=${FORECAST_DAYS}`;
  }

  url += `&daily=${parts.daily}&temperature_unit=${unit}`;

  if (parts.windKmh) {
    url += '&wind_speed_unit=kmh';
  }

  return url + '&timezone=' + encodeURIComponent(opts.zone || 'auto');
}

/**
 * Builds a minimal Open-Meteo URL that carries only the forecast strips.
 * Used by the other providers to fill in a forecast they can't fetch natively.
 */
function forecastUrl(opts: WeatherOpts): string {
  return buildUrl(opts, {
    current: 'temperature_2m',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min',
    hourly: HOURLY_FORECAST,
  });
}

/**
 * Builds an Open-Meteo URL carrying the extras parseExtras reads (UV, dew point,
 * and the daily high, low, and rain chance), plus the forecast strips when the face
 * asks for them.
 *
 * Paired with parseExtras so the field list lives in one place. Used by OWM, whose
 * free endpoint lacks all of this, instead of OWM hand-maintaining its own copy.
 * When opts.wantForecast is set the same call also brings back the hourly and daily
 * strips, so OWM fills its forecast row from this one request instead of a second one.
 *
 * @param opts The weather request options, read for the coordinates, the unit, and whether a forecast is wanted.
 * @return The Open-Meteo URL to fetch.
 */
function extrasUrl(opts: WeatherOpts): string {
  let current = 'uv_index,dew_point_2m';
  let daily = 'temperature_2m_max,temperature_2m_min,precipitation_probability_max';

  if (opts.wantForecast) {
    // temperature_2m rides along only to bring back current.time so parseHourly knows
    // where now is. weather_code and the hourly block feed the forecast strips
    current += ',temperature_2m';
    daily += ',weather_code';
  }

  return buildUrl(opts, {
    current: current,
    daily: daily,
    hourly: opts.wantForecast ? HOURLY_FORECAST : undefined,
  });
}

/**
 * Fetches just the forecast strips from Open-Meteo, for a provider that can't
 * supply its own. Any failure yields null so the caller keeps its reading.
 *
 * @param opts The weather request options, read for the coordinates.
 * @param request The function that performs the actual network request.
 * @param done Called with the forecast strips, or null on any failure.
 */
function fetchForecast(opts: WeatherOpts, request: RequestFn, done: (forecast: ForecastCols | null) => void): void {
  if (!opts || !opts.coords) {
    return done(null);
  }

  requestZoned(opts, forecastUrl, request, () => done(null), (json) => {
    if (json.error) {
      return done(null);
    }
    done(parseForecast(json));
  });
}

/**
 * Fetches one Open-Meteo query, asking again in the location's own zone when Open-Meteo refuses
 * the phone's zone name.
 *
 * A zone name Open-Meteo does not know fails the whole request, so without the retry the reading,
 * the extras, or the forecast would go missing on every fetch. Every call to Open-Meteo goes
 * through here, including the ones OWM and WeatherAPI make for what their own APIs lack.
 *
 * @param opts The weather request options, read for the zone.
 * @param urlFor Builds the query from the options, so the retry can build it again without the zone.
 * @param request The function that performs the actual network request.
 * @param onFail Called with the status when no JSON came back.
 * @param onJson Called with the response, which can still carry an error of its own.
 */
function requestZoned(
  opts: WeatherOpts,
  urlFor: (opts: WeatherOpts) => string,
  request: RequestFn,
  onFail: DoneFn,
  onJson: (json: OpenMeteoResponse) => void
): void {
  util.requestJson<OpenMeteoResponse>(urlFor(opts), request, onFail, (json) => {
    if (json.error && opts.zone && /timezone/i.test(String(json.reason || ''))) {
      return requestZoned({ ...opts, zone: undefined }, urlFor, request, onFail, onJson);
    }
    onJson(json);
  });
}

/**
 * Pulls the UV, dew point, and daily-forecast extras out of an Open-Meteo
 * forecast response, raw and unrounded so the shared attachExtras can round and
 * scale them.
 *
 * Shared with the OWM provider: OWM's free endpoint lacks these, so it steals
 * them from a parallel Open-Meteo call. Keeping the field mapping here means the
 * Open-Meteo paths live in one place instead of drifting across two providers.
 *
 * The high, low, and rain chance are the phone's today, since the watch keeps them as today's.
 * A response in the location's zone for a city on another date may not hold that day, and then
 * they are left out rather than sent from the wrong one.
 *
 * @param json The Open-Meteo response to read the extras from, or null when there is none.
 * @return The raw extra fields, keyed to match what attachExtras expects.
 */
function parseExtras(json: OpenMeteoResponse | null): Record<string, unknown> {
  const cur = json?.current;
  const daily = json?.daily;
  const today = todayIndex(json, phoneClockFor(json));
  const onToday = (arr: unknown): unknown => (Array.isArray(arr) && today >= 0 ? arr[today] : undefined);

  return {
    uvIndex: cur?.uv_index,
    dewPoint: cur?.dew_point_2m,
    tempMax: onToday(daily?.temperature_2m_max),
    tempMin: onToday(daily?.temperature_2m_min),
    precipChance: onToday(daily?.precipitation_probability_max),
  };
}

/**
 * Fetches current weather from Open-Meteo for the supplied coordinates.
 *
 * @param opts The weather request options, read for the coordinates, the unit, and whether a forecast is wanted.
 * @param request The function that performs the actual network request.
 * @param done Called with the weather result.
 */
function fetch(opts: WeatherOpts, request: RequestFn, done: DoneFn): void {
  if (!opts.coords) {
    return done(util.status('No Location'));
  }

  const lat = opts.coords.lat;
  const lon = opts.coords.lon;
  // pressure_msl is sea level like the other providers send
  // surface_pressure is ground level and reads about 170 hPa low in Denver
  const current = 'temperature_2m,weather_code,is_day,relative_humidity_2m,wind_speed_10m,wind_direction_10m,' +
    'uv_index,apparent_temperature,pressure_msl,dew_point_2m';
  // the sunrise and sunset fields stay first so existing URL assertions still match daily=
  let dailyFields = 'sunrise,sunset,temperature_2m_max,temperature_2m_min,precipitation_probability_max';

  // only a face that shows the forecast row pays for the hourly block and the extra
  // days. everyone else gets just the current reading plus today's daily extras
  if (opts.wantForecast) {
    // weather_code rides last so the daily strip knows each day's sky
    dailyFields += ',weather_code';
  }

  // wind_speed_unit=kmh keeps wind in km/h whatever the temperature unit
  const urlFor = (zoned: WeatherOpts): string => buildUrl(zoned, {
    current: current,
    daily: dailyFields,
    hourly: zoned.wantForecast ? HOURLY_FORECAST : undefined,
    windKmh: true,
  });

  requestZoned(opts, urlFor, request, done, (json) => {
    if (json.error) {
      console.log('open-meteo api error:', json.reason);
      return done(util.status('API Error'));
    }

    if (!json.current) {
      return done(util.status('No Wx Data'));
    }

    const cur = json.current;
    const daily = json.daily;
    const phone = phoneClockFor(json);
    // a city a day ahead holds no phone today, and its first sunrise is a few minutes off at most
    const sunDay = Math.max(todayIndex(json, phone), 0);

    // is_day is 1 by day and 0 at night. treat a missing value as day so a
    // clear sky never wrongly shows a moon
    const isDay = cur.is_day !== 0;

    const result = util.ok(
      cur.temperature_2m,
      util.applyNight(util.wmoToCondition(cur.weather_code), isDay),
      opts.label || 'My Location',
      lat,
      lon,
      Object.assign({
        humidity: cur.relative_humidity_2m,
        windKmh: cur.wind_speed_10m,
        windDir: util.degToCompass(cur.wind_direction_10m),
        feelsLike: cur.apparent_temperature,
        pressure: cur.pressure_msl,
        sunrise: util.shiftDayMinutes(util.minutesFromIso(daily?.sunrise?.[sunDay]), phone.shiftMinutes),
        sunset: util.shiftDayMinutes(util.minutesFromIso(daily?.sunset?.[sunDay]), phone.shiftMinutes),
        // uv, dew point, and the daily high, low, and rain chance
      }, parseExtras(json))
    );

    // the response already carries the hourly and daily strips so read them
    // straight off it. no extra request needed for the openmeteo provider
    if (result.ok && opts.wantForecast) {
      util.attachForecast(result, parseForecast(json));
    }

    done(result);
  });
}

export default { fetch, parseExtras, extrasUrl, parseForecast, fetchForecast, requestZoned };
