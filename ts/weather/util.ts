/**
 * Shared helpers for the weather provider modules.
 *
 * Provides the parsing, formatting, and result builders used by openmeteo,
 * owm, and weatherapi so every provider returns the same normalized shape.
 */

import conditions from './conditions';
import { requestJson as sharedRequestJson } from '../pkjs/request';
import type { RequestFn } from '../pkjs/request';

/** A resolved latitude/longitude pair. */
export interface WeatherCoords {
  lat: number;
  lon: number;
}

/** The hourly forecast strip the packer turns into wire bytes. */
export interface HourlyStrip {
  baseHour: number;
  stepHours: number;
  cols: Array<{ code: number; temp: number | null }>;
}

/** The 7-day forecast strip the packer turns into wire bytes. */
export interface DailyStrip {
  baseWeekday: number;
  cols: Array<{ code: number; tempMax: number | null; tempMin: number | null }>;
}

/** The two forecast strips a provider can attach to a result. */
export interface ForecastCols {
  hourly: HourlyStrip | null;
  daily: DailyStrip | null;
}

/** The normalized result every provider returns, extras attached when present. */
export interface WeatherResult {
  temperature: number;
  condition: string;
  location: string;
  ok: boolean;
  lat?: number;
  lon?: number;
  humidity?: number;
  windKmh?: number;
  windDir?: string;
  /** Sunrise as minutes past the phone's midnight, the clock the watch keeps. */
  sunrise?: number;
  /** Sunset as minutes past the phone's midnight. */
  sunset?: number;
  uvIndex?: number;
  feelsLike?: number;
  pressure?: number;
  dewPoint?: number;
  tempMax?: number;
  tempMin?: number;
  precipChance?: number;
  forecastHourly?: HourlyStrip | null;
  forecastDaily?: DailyStrip | null;
}

/** The lookup options a face hands the dispatcher and each provider. */
export interface WeatherOpts {
  provider?: string;
  key?: string;
  fahrenheit?: boolean;
  coords?: WeatherCoords | null;
  label?: string;
  place?: string;
  wantForecast?: boolean;
  /** The reading fields the face shows, such as `humidity` or `uvIndex`. Left out, a provider fetches all of them. */
  fields?: string[];
  /**
   * The phone's time zone name, such as `America/Toronto`, for a provider that can answer in it.
   * The watch keeps the phone's clock, so times sent in the location's own zone read hours off for
   * a place in another one. Left out, a provider answers in the location's zone.
   */
  zone?: string;
}

export type { RequestFn } from '../pkjs/request';

/** Called once with the finished weather result. */
export type DoneFn = (result: WeatherResult) => void;

// the tokens the C icon table knows about (the single source of truth in conditions.ts)
// a night-capable row adds both its day token and the "<token>_NIGHT" form the wire
// carries after dark so shorten() still knows a token once it is night-promoted
const KNOWN_TOKENS = new Set<string>();
for (const entry of conditions.conditions) {
  KNOWN_TOKENS.add(entry.token);
  if (entry.nightResource) {
    KNOWN_TOKENS.add(`${entry.token}_NIGHT`);
  }
}

// rows that ship a distinct night glyph. applyNight only promotes these
const NIGHT_TOKENS = new Set<string>(
  conditions.conditions.filter((entry) => entry.nightResource).map((entry) => entry.token)
);

/**
 * Maps an Open-Meteo WMO weather code to a short condition string.
 *
 * @param code The WMO weather code Open-Meteo reports.
 * @return The matching short condition string.
 */
function wmoToCondition(code: unknown): string {
  // Open-Meteo sends null for an hour or day it has no code for. null reads as 0 in a comparison,
  // so without this it lands on FOGGY, and Number(null) would read as CLEAR
  if (typeof code !== 'number' || !Number.isFinite(code)) { return 'UNKNOWN'; }
  if (code === 0) { return 'CLEAR'; }
  if (code === 1 || code === 2) { return 'PCLDY'; }
  if (code === 3) { return 'CLDY'; }
  if (code <= 48) { return 'FOGGY'; }
  if (code <= 55) { return 'DRZL'; }
  if (code <= 57) { return 'FZDZ'; }
  if (code <= 65) { return 'RAIN'; }
  if (code <= 67) { return 'FZRN'; }
  if (code <= 77) { return 'SNOW'; }
  if (code <= 82) { return 'SHWR'; }
  if (code <= 86) { return 'SNSH'; }
  if (code <= 99) { return 'STRM'; }

  return 'UNKNOWN';
}

/**
 * Resolves a condition to its known token, promoting to the night form
 * after dark when the condition has a distinct night glyph.
 *
 * Resolving through shorten() first (rather than a bare uppercase) is what makes
 * night work for every provider: Open-Meteo already passes a token, while OWM and
 * WeatherAPI pass phrases/aliases that must be resolved to a token before the night
 * check. Conditions without a night glyph (and unrecognized ones) are returned
 * as their resolved token, unchanged by day or night.
 *
 * @param condition A condition token or phrase from the provider.
 * @param isDay Whether it is currently daytime.
 * @return The resolved token, promoted to its night form when it is night and one exists.
 */
function applyNight(condition: string, isDay: boolean): string {
  const token = shorten(condition);

  if (!isDay && NIGHT_TOKENS.has(token)) {
    return `${token}_NIGHT`;
  }

  return token;
}

// provider phrases that aren't our tokens mapped to the closest one
// the cloud band splits "partly" phrases -> PCLDY and "overcast" or plain cloud -> CLDY
const CONDITION_ALIASES: Record<string, string> = {
  'SUNNY': 'CLEAR',
  'PARTLY CLOUDY': 'PCLDY',
  'PATCHY RAIN POSSIBLE': 'RAIN',
  'PATCHY RAIN NEARBY': 'RAIN',
  'THUNDERSTORM': 'STRM',
  'THUNDERSTORMS': 'STRM',
  'DRIZZLE': 'DRZL',
  'LIGHT RAIN': 'RAIN',
  'HEAVY RAIN': 'RAIN',
  'LIGHT SNOW': 'SNOW',
  'HEAVY SNOW': 'SNOW',
  'CLOUDS': 'CLDY',
  'CLOUDY': 'CLDY',
  'OVERCAST': 'CLDY',
  'FOG': 'FOGGY',
  'MIST': 'FOGGY',
  'HAZE': 'FOGGY',
  'SMOKE': 'FOGGY',
};

/**
 * Shortens a condition string so it fits beside the temperature.
 *
 * @param text A condition phrase or token from a provider.
 * @return The shortened token, or 'UNKNOWN' when nothing matches.
 */
function shorten(text: string): string {
  if (!text) {
    return 'UNKNOWN';
  }

  const upper = text.toUpperCase();
  if (CONDITION_ALIASES[upper]) {
    return CONDITION_ALIASES[upper];
  }
  if (KNOWN_TOKENS.has(upper)) {
    return upper;
  }

  // an unknown phrase (like a verbose WeatherAPI string) would truncate to a
  // partial word the C icon table can't match and show the wrong icon so emit
  // UNKNOWN (-> WI_NA) instead of a fragment
  return 'UNKNOWN';
}

// 16-point compass indexed by the rounded sector (each spans 22.5 degrees)
const COMPASS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE',
  'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];

/**
 * Turns a wind bearing in degrees into a short compass label, or '' when not a number.
 *
 * @param degrees The wind bearing in degrees, from whatever the provider sent.
 * @return The compass label, such as 'NNE', or '' when degrees is not a usable number.
 */
function degToCompass(degrees: unknown): string {
  // null/undefined/'' all coerce to 0 ("N") so reject them before Number()
  if (degrees === null || degrees === undefined || degrees === '') {
    return '';
  }

  const value = Number(degrees);
  if (!Number.isFinite(value)) {
    return '';
  }

  const sector = Math.round((value % 360) / 22.5) % 16;
  return COMPASS[(sector + 16) % 16];
}

/**
 * Minutes past midnight from an ISO timestamp like "2026-06-26T06:30".
 *
 * The clock portion is read as written, on whatever clock the response keeps. A caller whose
 * response can be on another clock moves it with shiftDayMinutes.
 *
 * @param iso An ISO timestamp such as "2026-06-26T06:30".
 * @return Minutes past midnight, or null when no clock portion is found.
 */
function minutesFromIso(iso: unknown): number | null {
  const match = /T(\d{2}):(\d{2})/.exec(String(iso || ''));
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

/**
 * How far ahead of UTC the phone's clock is at a moment, in minutes.
 *
 * Read through here rather than straight off Date so a spec can pin the phone's zone whatever
 * machine it runs on.
 *
 * @param epochMs The moment to read the phone's offset at.
 * @return The offset in minutes, negative west of UTC.
 */
function phoneOffsetMinutes(epochMs: number): number {
  return -new Date(epochMs).getTimezoneOffset();
}

/**
 * The phone's calendar day at a moment, as YYYY-MM-DD.
 *
 * It is the one rule for which of a provider's days counts as today, so every provider that
 * matches its days against the phone's reads it from here. The offset is passed in, read through
 * phoneOffsetMinutes, so a spec that pins the phone's zone pins this too.
 *
 * @param epochMs The moment to read the day at.
 * @param offsetMinutes The phone's offset from UTC at that moment.
 * @return The phone's day, such as "2026-07-05".
 */
function phoneDayOf(epochMs: number, offsetMinutes: number): string {
  return new Date(epochMs + offsetMinutes * 60000).toISOString().slice(0, 10);
}

/**
 * Moves a time of day by some minutes, wrapping round midnight.
 *
 * @param minutes Minutes past midnight, or null for no time.
 * @param shift How far to move it, negative to move it earlier.
 * @return The moved time as minutes past midnight, or null when there was no time.
 */
function shiftDayMinutes(minutes: number | null, shift: number): number | null {
  if (minutes === null) {
    return null;
  }

  return (((minutes + shift) % 1440) + 1440) % 1440;
}

/**
 * Minutes past the phone's midnight for a UTC unix time.
 *
 * OpenWeatherMap reports sunrise and sunset as UTC unix seconds, so reading them on the phone's own
 * clock gives the time the watch shows, whatever zone the weather location is in.
 *
 * @param unixSeconds A UTC unix time in seconds.
 * @return Minutes past the phone's midnight, or null when the value is not a usable number.
 */
function minutesFromUnix(unixSeconds: unknown): number | null {
  const unix = Number(unixSeconds);
  if (unixSeconds === null || unixSeconds === undefined || !Number.isFinite(unix)) {
    return null;
  }

  const local = new Date(unix * 1000);
  return local.getHours() * 60 + local.getMinutes();
}

/**
 * Minutes past midnight for a 12-hour time string like "05:42 AM".
 *
 * @param timeStr A 12-hour time string, such as "05:42 AM".
 * @return Minutes past midnight, or null when it cannot be parsed.
 */
function minutesFrom12Hour(timeStr: unknown): number | null {
  const match = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec(String(timeStr || '').trim());
  if (!match) {
    return null;
  }

  let hours = parseInt(match[1], 10);
  const isPM = match[3].toUpperCase() === 'PM';
  if (hours === 12) {
    hours = isPM ? 12 : 0;
  } else if (isPM) {
    hours += 12;
  }

  return hours * 60 + Number(match[2]);
}

/**
 * Moves a time of day from a location's own clock onto the phone's.
 *
 * WeatherAPI gives its sunrise and sunset in the location's local time with no zone on them, but it
 * also gives the location's local time now beside the matching epoch, and the gap between those two
 * is the location's offset. A location in the phone's zone comes out unchanged.
 *
 * @param minutes The time of day on the location's clock, or null for none.
 * @param localtime The location's local time now, such as "2026-06-26 14:05".
 * @param epochSeconds The same moment as a unix time.
 * @return Minutes past the phone's midnight, or the time unchanged when the offset cannot be read.
 */
function minutesAtPhone(minutes: number | null, localtime: unknown, epochSeconds: unknown): number | null {
  if (minutes === null) {
    return null;
  }

  const match = /^(\d{4})-(\d{2})-(\d{2}) (\d{1,2}):(\d{2})$/.exec(String(localtime || ''));
  const epoch = Number(epochSeconds);
  if (!match || !Number.isFinite(epoch)) {
    return minutes;
  }

  const wall = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), Number(match[4]), Number(match[5]));
  const locationOffset = Math.round((wall - Math.floor(epoch / 60) * 60000) / 60000);
  return shiftDayMinutes(minutes, phoneOffsetMinutes(epoch * 1000) - locationOffset);
}

/** Extras that ride as a whole number, the sun times included as minutes past midnight. */
const ROUNDED_EXTRAS = [
  'humidity', 'windKmh', 'uvIndex', 'feelsLike', 'pressure', 'dewPoint', 'tempMax', 'tempMin',
  'precipChance', 'sunrise', 'sunset',
];

/**
 * The extras that are temperatures, held to the bounds the watch holds the current one to. A
 * provider glitch otherwise reached the watch as 40000 and overflowed a three digit label.
 */
const TEMPERATURE_EXTRAS = ['feelsLike', 'dewPoint', 'tempMax', 'tempMin'];

/** Extras that ride as text, such as a compass point. */
const TEXT_EXTRAS = ['windDir'];

/**
 * Copies the optional weather extras onto a result, skipping missing values so
 * the watch keeps showing a placeholder rather than a phantom reading.
 *
 * @param result The weather result to add the extras onto.
 * @param extra The provider's extra fields, in whatever loose shape it sent them.
 */
function attachExtras(result: WeatherResult, extra: Record<string, unknown> | null | undefined): void {
  if (!extra) {
    return;
  }

  const target = result as unknown as Record<string, unknown>;

  ROUNDED_EXTRAS.forEach((name) => {
    // a provider says "no reading" with null, and Number(null) is 0, so only a real number or a
    // numeric string counts. otherwise the watch shows 0% rain or UV 0 where it should show a dash
    const raw = extra[name];
    if (typeof raw !== 'number' && !(typeof raw === 'string' && raw.trim() !== '')) {
      return;
    }

    const value = Number(raw);
    if (Number.isFinite(value)) {
      const rounded = Math.round(value);
      target[name] = TEMPERATURE_EXTRAS.includes(name) ? Math.min(199, Math.max(-99, rounded)) : rounded;
    }
  });

  TEXT_EXTRAS.forEach((name) => {
    if (extra[name]) {
      target[name] = String(extra[name]);
    }
  });
}

/**
 * Copies the parsed forecast strips onto a result, skipping missing ones so a
 * provider that can't supply a forecast just leaves the row blank.
 *
 * @param result The weather result to add the forecast strips onto.
 * @param forecast The parsed hourly and daily strips, either of which may be missing.
 */
function attachForecast(result: WeatherResult, forecast: ForecastCols | null | undefined): void {
  if (!forecast) {
    return;
  }

  if (forecast.hourly) {
    result.forecastHourly = forecast.hourly;
  }

  if (forecast.daily) {
    result.forecastDaily = forecast.daily;
  }
}

/**
 * Performs an HTTP GET and shared response handling.
 *
 * A parseable body always goes to onJson, so a provider can read its own error
 * JSON (e.g. an 'Invalid Key' on a 4xx). If the body does not parse, finish with
 * 'NET ERROR' when the request failed, else 'BAD WX DATA'. The provider declares
 * the response shape it expects via the type parameter.
 *
 * @param url The URL to fetch.
 * @param request The GET function to call, usually PebbleKit JS's xhrRequest wrapper.
 * @param done Called with a status result when the request or the parse fails.
 * @param onJson Called with the parsed body when it parses.
 */
function requestJson<T = unknown>(url: string, request: RequestFn, done: DoneFn, onJson: (json: T) => void): void {
  sharedRequestJson<T>(url, request, (err, json) => {
    if (json) {
      return onJson(json);
    }

    done(status(err ? 'NET ERROR' : 'BAD WX DATA'));
  });
}

/**
 * Builds a successful weather result.
 *
 * The temperature is already in the unit the user selected, so the watch
 * displays it without converting.
 *
 * @param temperature The current temperature, in the user's chosen unit.
 * @param condition The provider's condition phrase or token.
 * @param location The resolved place name to show.
 * @param lat The resolved latitude, when known.
 * @param lon The resolved longitude, when known.
 * @param extra The provider's extra fields, passed through to attachExtras.
 * @return The finished weather result, or a status result if temperature is not a usable number.
 */
function ok(
  temperature: unknown,
  condition: string,
  location: string | null | undefined,
  lat?: number,
  lon?: number,
  extra?: Record<string, unknown>
): WeatherResult {
  const value = Number(temperature);
  if (!Number.isFinite(value)) {
    // a missing or non-numeric provider field would otherwise round to NaN and ship as a real reading
    return status('No Wx Data');
  }

  const result: WeatherResult = {
    temperature: Math.round(value),
    condition: shorten(condition),
    location: location || '',
    ok: true,
  };

  // carry the resolved coordinates so the watch can show lat/lon for whatever
  // location the weather actually used (manual place name included) not just
  // the phone GPS path. only attached when both are real numbers
  if (typeof lat === 'number' && typeof lon === 'number') {
    result.lat = lat;
    result.lon = lon;
  }

  attachExtras(result, extra);

  return result;
}

/**
 * Builds a status/error result that carries no live reading.
 *
 * @param text The status or error text to show in place of a reading.
 * @return A weather result with ok set to false.
 */
function status(text: string): WeatherResult {
  return {
    temperature: 0,
    condition: (text || '').toUpperCase(),
    location: '',
    ok: false,
  };
}

export default {
  wmoToCondition,
  applyNight,
  shorten,
  degToCompass,
  minutesFromIso,
  minutesFromUnix,
  minutesFrom12Hour,
  minutesAtPhone,
  phoneOffsetMinutes,
  phoneDayOf,
  shiftDayMinutes,
  attachExtras,
  attachForecast,
  requestJson,
  ok,
  status,
};
