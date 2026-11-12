/**
 * Open-Meteo weather provider (free, no API key).
 *
 * Takes resolved coordinates only. Place-name geocoding happens once at
 * settings time (see clay/location-component.ts), so this module never geocodes.
 */

import util from '../util';
import conditions from '../conditions';
import type { RequestFn, DoneFn, WeatherOpts, WeatherCoords, HourlyStrip, DailyStrip, ForecastCols } from '../util';
import { guardRequest, heardRequest, requestJson as requestWithError } from '../../pkjs/request';
import type { SendHook } from '../../pkjs/request';
import { READING_DAYS, READING_HOURS, readingStatus, valueOrGap } from '../reading';
import type { DailySeries, HourlySeries, ReadingCondition, ReadingResult, WeatherReading } from '../reading';

const OPEN_METEO_FORECAST_API = 'https://api.open-meteo.com/v1/forecast';

// how many columns the forecast row shows and how far apart the hourly ones sit. eight fills
// a 2x4 panel's two stacked rows, and at a 2-hour step the last column sits 14 hours after
// the first
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
  // the parser reads each daily field by name, so their order here changes nothing on the watch
  let dailyFields = 'sunrise,sunset,temperature_2m_max,temperature_2m_min,precipitation_probability_max';

  // only a face that shows the forecast row pays for the hourly block and the extra
  // days. everyone else gets just the current reading plus today's daily extras
  if (opts.wantForecast) {
    // weather_code gives the daily strip each day's sky
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

// the reading's fields, in Open-Meteo's names. pressure_msl is sea level like the other providers
// send, since surface_pressure reads about 170 hPa low in Denver
const READING_CURRENT = 'temperature_2m,apparent_temperature,weather_code,is_day,relative_humidity_2m,wind_speed_10m,' +
  'wind_direction_10m,uv_index,pressure_msl,dew_point_2m';
const READING_HOURLY = 'temperature_2m,apparent_temperature,weather_code,is_day,relative_humidity_2m,wind_speed_10m,' +
  'wind_direction_10m,wind_gusts_10m,cloud_cover,visibility,shortwave_radiation,cape,uv_index,precipitation_probability,' +
  'precipitation,rain,snowfall,pressure_msl,dew_point_2m';
const READING_DAILY = 'temperature_2m_max,temperature_2m_min,weather_code,precipitation_probability_max,precipitation_sum,' +
  'rain_sum,snowfall_sum,uv_index_max,sunrise,sunset';

/**
 * What one place's request costs against Open-Meteo's limits, in calls.
 *
 * Open-Meteo counts a request with more than 10 variables as variables / 10 calls, and one over more
 * than 14 days as days / 14, so 15 variables over two weeks is 1.5 calls and over four weeks is 3.
 * A request for several places counts each place at the full weight, as the rate limit headers on
 * Open-Meteo's answers show.
 *
 * @param variables How many variables the request asks for, across current, hourly, and daily.
 * @param days How many days the request covers, the past days and the forecast days together.
 * @return The calls it counts as, 1 or more.
 */
export function requestWeight(variables: number, days: number): number {
  return Math.max(1, variables / 10) * Math.max(1, days / 14);
}

/** How many variables a comma-joined list names. */
function countVariables(list: string): number {
  return list.split(',').length;
}

// Open-Meteo works out a place's today and current hour on its offset cut down to whole hours. a
// place a part hour behind UTC has its today start on tomorrow in the last half hour of the day, and
// one a part hour ahead still has yesterday for up to 45 minutes past midnight. a day more of daily
// either side, and an hour more of hourly, keeps the place's whole today and the 47 hours after it
// inside whichever day and hour Open-Meteo picked
const ASK_PAST_DAYS = 1;
const ASK_FORECAST_DAYS = READING_DAYS + 1;
const ASK_PAST_HOURS = 25;
const ASK_FORECAST_HOURS = READING_HOURS + 1;

/** What one place costs in `fetchReading`, for the ledger to stamp each call with. */
export const READING_WEIGHT = requestWeight(
  countVariables(READING_CURRENT) + countVariables(READING_HOURLY) + countVariables(READING_DAILY),
  ASK_PAST_DAYS + ASK_FORECAST_DAYS
);

/** One place's answer, the parts `fetchReading` reads. Open-Meteo answers a list of these for several places. */
export interface OpenMeteoReadingResponse {
  error?: boolean;
  reason?: string;
  utc_offset_seconds?: number;
  current?: Record<string, unknown>;
  hourly?: Record<string, unknown>;
  daily?: Record<string, unknown>;
}

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
 * Builds the reading query for several places at once.
 *
 * `timezone=auto` gives each place its own zone and offset, and `timeformat=unixtime` writes every
 * time in epoch seconds. Places in different zones cannot share a start hour, so the query asks for
 * a day before and after the 8 days a reading keeps, and 25 hours back to 49 ahead of the current
 * hour. That holds the place's today and the 47 hours after it, whichever day and hour Open-Meteo
 * takes as now.
 *
 * @param places The places, with coordinates Open-Meteo takes.
 * @return The Open-Meteo URL to fetch.
 */
export function readingUrl(places: WeatherCoords[]): string {
  const latitudes = places.map((place) => place.lat).join(',');
  const longitudes = places.map((place) => place.lon).join(',');

  return `${OPEN_METEO_FORECAST_API}?latitude=${latitudes}&longitude=${longitudes}` +
    `&current=${READING_CURRENT}&hourly=${READING_HOURLY}&daily=${READING_DAILY}` +
    `&past_days=${ASK_PAST_DAYS}&past_hours=${ASK_PAST_HOURS}&forecast_hours=${ASK_FORECAST_HOURS}` +
    `&forecast_days=${ASK_FORECAST_DAYS}&timezone=auto&timeformat=unixtime`;
}

/** Whether a stamp in a time list is a real time. */
function isStamp(time: unknown): time is number {
  return typeof time === 'number' && Number.isFinite(time);
}

/** A sky from a WMO code and an Open-Meteo day flag, which is 1 by day and 0 by night. */
function readingCondition(code: unknown, isDay: unknown): ReadingCondition {
  return {
    token: util.wmoToCondition(code),
    wmo: valueOrGap(code),
    isDay: isDay === 1 ? true : isDay === 0 ? false : null,
  };
}

/** One of Open-Meteo's series as a list, empty when it is missing. */
function listOf(block: Record<string, unknown> | undefined, name: string): unknown[] {
  const list = block?.[name];

  return Array.isArray(list) ? list : [];
}

/**
 * The rows to take from a time list, from a first row for up to some rows. The rows stop at the first
 * stamp that is not a real time, so every list the series makes stays the same length.
 */
function rowsFrom(times: unknown[], first: number, most: number): number[] {
  const rows: number[] = [];

  for (let index = first; first !== -1 && index < times.length && rows.length < most && isStamp(times[index]); index++) {
    rows.push(index);
  }

  return rows;
}

/** Takes the hours from today's stamp out of Open-Meteo's hourly block, none when no hour carries that stamp. */
function hourlySeries(hourly: Record<string, unknown> | undefined, todayStamp: number): HourlySeries {
  const times = listOf(hourly, 'time');
  const rows = rowsFrom(times, times.indexOf(todayStamp), READING_HOURS);
  const series = (name: string) => rows.map((index) => valueOrGap(listOf(hourly, name)[index]));

  return {
    time: rows.map((index) => times[index] as number),
    temperature: series('temperature_2m'),
    feelsLike: series('apparent_temperature'),
    condition: rows.map((index) => readingCondition(listOf(hourly, 'weather_code')[index], listOf(hourly, 'is_day')[index])),
    humidity: series('relative_humidity_2m'),
    windSpeed: series('wind_speed_10m'),
    windDirection: series('wind_direction_10m'),
    windGust: series('wind_gusts_10m'),
    cloudCover: series('cloud_cover'),
    visibility: series('visibility'),
    solarRadiation: series('shortwave_radiation'),
    cape: series('cape'),
    uvIndex: series('uv_index'),
    precipitationChance: series('precipitation_probability'),
    precipitationAmount: series('precipitation'),
    rain: series('rain'),
    snowfall: series('snowfall'),
    pressure: series('pressure_msl'),
    dewPoint: series('dew_point_2m'),
  };
}

/**
 * Takes the days from the place's today out of Open-Meteo's daily block.
 *
 * Through a polar night or a midnight sun Open-Meteo gives the day's own midnight as its sunrise and
 * sunset. That would show as a sunrise at 00:00, so it reads as no sunrise or sunset instead.
 */
function dailySeries(daily: Record<string, unknown> | undefined, today: number): DailySeries {
  const times = listOf(daily, 'time');
  const rows = rowsFrom(times, today, READING_DAYS);
  const series = (name: string) => rows.map((index) => valueOrGap(listOf(daily, name)[index]));
  const sunTimes = (name: string) => rows.map((index) => {
    const time = valueOrGap(listOf(daily, name)[index]);

    return time === times[index] ? null : time;
  });

  return {
    time: rows.map((index) => times[index] as number),
    high: series('temperature_2m_max'),
    low: series('temperature_2m_min'),
    condition: rows.map((index) => readingCondition(listOf(daily, 'weather_code')[index], undefined)),
    precipitationChance: series('precipitation_probability_max'),
    precipitationAmount: series('precipitation_sum'),
    rain: series('rain_sum'),
    snowfall: series('snowfall_sum'),
    uvIndex: series('uv_index_max'),
    sunrise: sunTimes('sunrise'),
    sunset: sunTimes('sunset'),
  };
}

/**
 * Reads one place's answer into a reading on the place's own clock.
 *
 * The place's today is the last day in the daily block that started by the current time, so a place
 * on another date from the phone keeps its own today. Open-Meteo stamps each day as midnight on the
 * one offset the answer carries, and the hourly series starts at today's stamp. Away from a change of
 * clocks that is the place's own midnight, in a half-hour zone such as India's too. An answer with no
 * today or no hours from it gives `NO WX DATA` rather than a reading with empty series.
 */
function parseReading(json: OpenMeteoReadingResponse | null | undefined): ReadingResult {
  const now = json?.current?.time;
  const offset = json?.utc_offset_seconds;

  if (!json || !isStamp(now) || typeof offset !== 'number' || !Number.isFinite(offset)) {
    return readingStatus('No Wx Data');
  }

  const current = json.current;
  const days = listOf(json.daily, 'time');
  let today = -1;

  days.forEach((day, index) => {
    if (isStamp(day) && day <= now) {
      today = index;
    }
  });

  if (today === -1) {
    return readingStatus('No Wx Data');
  }

  const hourly = hourlySeries(json.hourly, days[today] as number);
  const daily = dailySeries(json.daily, today);

  if (!hourly.time.length || !daily.time.length) {
    return readingStatus('No Wx Data');
  }

  const reading: WeatherReading = {
    ok: true,
    source: 'openmeteo',
    time: now,
    utcOffset: offset,
    temperature: valueOrGap(current?.temperature_2m),
    feelsLike: valueOrGap(current?.apparent_temperature),
    condition: readingCondition(current?.weather_code, current?.is_day),
    humidity: valueOrGap(current?.relative_humidity_2m),
    windSpeed: valueOrGap(current?.wind_speed_10m),
    windDirection: valueOrGap(current?.wind_direction_10m),
    uvIndex: valueOrGap(current?.uv_index),
    pressure: valueOrGap(current?.pressure_msl),
    dewPoint: valueOrGap(current?.dew_point_2m),
    hourly,
    daily,
  };

  return reading;
}

/**
 * Fetches a reading for several places in one request, each on its own clock.
 *
 * Open-Meteo answers one place with an object and several with a list in the order asked. It refuses
 * the whole request when any place's coordinates are out of range, so a place it would refuse gets
 * `NO LOCATION` and is left out of the request, and the others still get their readings. A 429 gives
 * every place asked `RATE LIMIT`, whatever the body says. Any other failed request or error answer
 * gives every place asked the same status, and a request that throws gives `NET ERROR`.
 *
 * @param places Each place's coordinates, in the order the readings come back.
 * @param request The function that performs the actual network request.
 * @param done Called once with a reading or a status for each place, in the order asked.
 * @param onSend Hears the batch go out as `openmeteo`, its places as its calls, at `READING_WEIGHT` each.
 */
export function fetchReading(places: Array<WeatherCoords | null | undefined>, request: RequestFn, done: (results: ReadingResult[]) => void, onSend?: SendHook): void {
  const results: ReadingResult[] = places.map(() => readingStatus('No Location'));
  const asked = places.map((place, index) => index).filter((index) => validCoords(places[index]));

  if (!asked.length) {
    return done(results);
  }

  const fill = (pick: (position: number) => ReadingResult) => {
    asked.forEach((index, position) => {
      results[index] = pick(position);
    });
    done(results);
  };

  const url = readingUrl(asked.map((index) => places[index] as WeatherCoords));

  const get = heardRequest(guardRequest(request), onSend, { source: 'openmeteo', calls: asked.length, weight: READING_WEIGHT });

  requestWithError<OpenMeteoReadingResponse | OpenMeteoReadingResponse[]>(url, get, (err, json) => {
    // the rate limit answer can carry a JSON body of its own, so the status is read first
    if (err === 'http 429') {
      return fill(() => readingStatus('Rate Limit'));
    }

    if (!json) {
      return fill(() => readingStatus(err ? 'NET ERROR' : 'BAD WX DATA'));
    }

    if (!Array.isArray(json) && json.error) {
      console.log('open-meteo api error:', json.reason);
      return fill(() => readingStatus('API Error'));
    }

    const answers = Array.isArray(json) ? json : [json];

    fill((position) => parseReading(answers[position]));
  });
}

export default { fetch, parseExtras, extrasUrl, parseForecast, fetchForecast, requestZoned, fetchReading, readingUrl, requestWeight, READING_WEIGHT };
