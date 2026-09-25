/**
 * Specs for the shared weather helpers.
 *
 * These are pure functions that turn upstream data into what the watchface
 * renders. A wrong threshold, alias, or truncation shows the user the wrong
 * weather word or breaks the layout, so they are tested exhaustively.
 */

import { describe, test, expect, vi } from 'vitest';
import util from './util';
import type { RequestFn } from './util';
import conditions from './conditions';

describe('wmoToCondition', () => {
  /** A wrong code boundary shows the wrong sky word (e.g. snow reported as rain). */
  test.each([
    [0, 'CLEAR'],
    [1, 'PCLDY'],
    [2, 'PCLDY'],
    [3, 'CLDY'],
    [48, 'FOGGY'],
    [51, 'DRZL'],
    [55, 'DRZL'],
    [57, 'FZDZ'],
    [61, 'RAIN'],
    [65, 'RAIN'],
    [67, 'FZRN'],
    [71, 'SNOW'],
    [75, 'SNOW'],
    [77, 'SNOW'],
    [80, 'SHWR'],
    [82, 'SHWR'],
    [86, 'SNSH'],
    [95, 'STRM'],
    [99, 'STRM'],
  ])('maps WMO code %i to %s', (code, expected) => {
    const result = util.wmoToCondition(code);

    expect(result).toBe(expected);
  });

  /** An out-of-range code must fall back to a safe word, never render undefined. */
  test('maps a code above the known range to Unknown', () => {
    const result = util.wmoToCondition(100);

    expect(result).toBe('UNKNOWN');
  });

  /**
   * Open-Meteo sends null for an hour it has no code for. null reads as 0 in a comparison, so the
   * strip drew fog for it, and the current reading showed CLEAR.
   */
  test('maps a missing code to Unknown', () => {
    const result = util.wmoToCondition(null);

    expect(result).toBe('UNKNOWN');
  });
});

describe('condition vocabulary single source of truth', () => {
  /**
   * Every token the JS producer can emit must exist in conditions.ts, which
   * generates the C icon table. A token the C side lacks renders WI_NA silently,
   * so this guards the two sides from drifting (UNKNOWN is the deliberate fallback).
   */
  test('every producible token (day and night) is in conditions.ts (or the UNKNOWN fallback)', () => {
    // mirror the C table: every row contributes its day token plus its
    // "<token>_NIGHT" form when it has a night glyph
    const known = new Set();
    for (const entry of conditions.conditions) {
      known.add(entry.token);
      if (entry.nightResource) {
        known.add(`${entry.token}_NIGHT`);
      }
    }

    const emitted = new Set();
    for (let code = 0; code <= 99; code++) {
      const day = util.wmoToCondition(code);
      emitted.add(day);
      // the night promotion of every producible day code must also resolve
      emitted.add(util.applyNight(day, false));
    }

    const unmapped = [...emitted].filter((token) => token !== 'UNKNOWN' && !known.has(token));

    expect(unmapped).toEqual([]);
  });
});

describe('applyNight', () => {
  /** A clear sky at night must become its night variant so the watch shows a moon, not a sun. */
  test('promotes Clear to Clear Night when it is not day', () => {
    const result = util.applyNight('Clear', false);

    expect(result).toBe('CLEAR_NIGHT');
  });

  /** A clear sky by day must stay Clear so the watch shows the sun. */
  test('leaves Clear unchanged during the day', () => {
    const result = util.applyNight('Clear', true);

    expect(result).toBe('CLEAR');
  });

  /** Every condition ships a night glyph, so after dark each must promote. A
   *  rainy or cloudy night that kept the daytime icon was the bug this prevents. */
  test.each([
    ['Partly cloudy', 'PCLDY_NIGHT'],
    ['Cloudy', 'CLDY_NIGHT'],
    ['Rain', 'RAIN_NIGHT'],
    ['Snow', 'SNOW_NIGHT'],
    ['Thunderstorm', 'STRM_NIGHT'],
  ])('promotes %s to %s after dark', (condition, expected) => {
    const result = util.applyNight(condition, false);

    expect(result).toBe(expected);
  });

  /** By day the same conditions must resolve to their plain token (no night form). */
  test.each([
    ['Partly cloudy', 'PCLDY'],
    ['Cloudy', 'CLDY'],
    ['Rain', 'RAIN'],
    ['Snow', 'SNOW'],
  ])('leaves %s as its day token during the day', (condition, expected) => {
    const result = util.applyNight(condition, true);

    expect(result).toBe(expected);
  });

  /** An unrecognized phrase has no night glyph, so it must fall back to UNKNOWN.
   *  Never an X_NIGHT token the C table can't resolve. */
  test('returns UNKNOWN for an unrecognized condition even at night', () => {
    const result = util.applyNight('Sharknado', false);

    expect(result).toBe('UNKNOWN');
  });
});

describe('shorten', () => {
  /** A verbose, un-aliased phrase must map to UNKNOWN, never a truncated fragment.
   *  A partial word the C icon table can't match would render the wrong/NA icon. */
  test('maps an unrecognized phrase to Unknown instead of truncating', () => {
    const result = util.shorten('Moderate or heavy freezing rain');

    expect(result).toBe('UNKNOWN');
  });

  /** An 11-char string sits exactly at the limit and must pass through untouched. */
  test('leaves an 11-char string unchanged', () => {
    const result = util.shorten('CLEAR_NIGHT');

    expect(result).toBe('CLEAR_NIGHT');
  });

  /** Without aliasing, verbose provider phrases overflow the watch field. */
  test.each([
    ['Sunny', 'CLEAR'],
    ['Partly cloudy', 'PCLDY'],
    ['Overcast', 'CLDY'],
    ['Cloudy', 'CLDY'],
    ['Patchy rain nearby', 'RAIN'],
    ['Thunderstorm', 'STRM'],
    ['Light snow', 'SNOW'],
    ['Mist', 'FOGGY'],
    ['Drizzle', 'DRZL'],
  ])('aliases %s to %s', (input, expected) => {
    const result = util.shorten(input);

    expect(result).toBe(expected);
  });

  /** A night-promoted token must still be recognized as known, or the second
   *  shorten() pass in ok() would downgrade "RAIN_NIGHT" to UNKNOWN and drop the moon. */
  test('treats a night-promoted token as a known token', () => {
    const result = util.shorten('RAIN_NIGHT');

    expect(result).toBe('RAIN_NIGHT');
  });

  /** A null/empty condition must render a safe word, never blank or "undefined". */
  test.each([[''], [null], [undefined]])('returns Unknown for falsy input (%s)', (input) => {
    const result = util.shorten(input);

    expect(result).toBe('UNKNOWN');
  });
});

describe('degToCompass', () => {
  /** A wrong sector boundary labels the wind from the opposite quarter. */
  test.each([
    [0, 'N'],
    [22.5, 'NNE'],
    [45, 'NE'],
    [90, 'E'],
    [180, 'S'],
    [270, 'W'],
    [315, 'NW'],
    [360, 'N'],
  ])('maps %i degrees to %s', (degrees, expected) => {
    const result = util.degToCompass(degrees);

    expect(result).toBe(expected);
  });

  /** A bearing past 360 must wrap, never index past the compass table. */
  test('wraps a bearing above 360 degrees', () => {
    const result = util.degToCompass(450);

    expect(result).toBe('E');
  });

  /** A missing bearing must yield '' so the watch shows no direction, not "undefined". */
  test.each([[undefined], [null], ['']])('returns empty for a non-numeric bearing (%s)', (input) => {
    const result = util.degToCompass(input);

    expect(result).toBe('');
  });

  /** A garbage bearing that survives to Number() lands as NaN, which would index the table to "undefined". */
  test('returns empty for a bearing that parses to NaN', () => {
    const result = util.degToCompass('gusty');

    expect(result).toBe('');
  });
});

describe('minutesFromIso', () => {
  /** The clock portion of a local ISO timestamp is the time of day the watch shows, in minutes. */
  test('reads the minutes past midnight from an ISO timestamp', () => {
    const result = util.minutesFromIso('2026-06-26T06:30');

    expect(result).toBe(6 * 60 + 30);
  });

  /** A malformed or missing timestamp must yield null so the watch shows a placeholder. */
  test.each([['nope'], [''], [null], [undefined]])('returns null for an unusable timestamp (%s)', (input) => {
    const result = util.minutesFromIso(input);

    expect(result).toBe(null);
  });
});

describe('minutesFromUnix', () => {
  /**
   * A sun time read on the location's clock showed hours off for a place in another zone, since the
   * watch keeps the phone's clock. The answer is read the same way the phone does, so this holds in
   * any zone the spec runs in.
   */
  test('reads a unix time on the phone clock', () => {
    const unix = Date.UTC(2026, 5, 26, 11, 30) / 1000;
    const local = new Date(unix * 1000);

    const result = util.minutesFromUnix(unix);

    expect(result).toBe(local.getHours() * 60 + local.getMinutes());
  });

  /** A missing value must yield null rather than NaN or midnight. */
  test.each([[undefined], [null], ['x']])('returns null for a value that is not a time (%s)', (input) => {
    const result = util.minutesFromUnix(input);

    expect(result).toBe(null);
  });
});

describe('minutesFrom12Hour', () => {
  /** A botched 12-hour parse shows WeatherAPI's sunrise and sunset at the wrong time on the watch. */
  test.each([
    ['05:42 AM', 5 * 60 + 42],
    ['5:42 AM', 5 * 60 + 42],
    ['11:59 AM', 11 * 60 + 59],
    ['05:42 PM', 17 * 60 + 42],
    ['11:59 PM', 23 * 60 + 59],
  ])('converts %s to %i minutes', (input, expected) => {
    const result = util.minutesFrom12Hour(input);

    expect(result).toBe(expected);
  });

  /** The 12 o'clock hour is the off-by-twelve trap: 12 AM is midnight, 12 PM is noon. */
  test.each([
    ['12:00 AM', 0],
    ['12:30 AM', 30],
    ['12:00 PM', 12 * 60],
    ['12:30 PM', 12 * 60 + 30],
  ])('maps the 12 o\'clock boundary %s to %i minutes', (input, expected) => {
    const result = util.minutesFrom12Hour(input);

    expect(result).toBe(expected);
  });

  /** An unparseable time must yield null so the watch shows a placeholder. */
  test.each([['not a time'], [null], [undefined]])('returns null for invalid input (%s)', (input) => {
    const result = util.minutesFrom12Hour(input);

    expect(result).toBe(null);
  });
});

describe('shiftDayMinutes', () => {
  /** A time moved past midnight has to wrap round, or the watch gets a minute count past the day. */
  test.each([
    ['forward past midnight', 23 * 60 + 30, 60, 30],
    ['back past midnight', 30, -60, 23 * 60 + 30],
  ])('wraps %s', (label, minutes, shift, expected) => {
    const result = util.shiftDayMinutes(minutes, shift);

    expect(result).toBe(expected);
  });

  /** No time in stays no time out, so a missing sunrise still reads as none. */
  test('passes a missing time through', () => {
    const result = util.shiftDayMinutes(null, 60);

    expect(result).toBe(null);
  });
});

describe('minutesAtPhone', () => {
  /**
   * WeatherAPI's sun times are the location's own clock. For London while the phone is elsewhere,
   * a 06:00 sunrise has to move by the gap between the two zones, or the night schedule flips hours
   * off. The phone's offset is read the way the code reads it, so this holds in any zone.
   */
  test('moves a location time onto the phone clock', () => {
    const epoch = Date.UTC(2026, 5, 26, 13, 0) / 1000;
    const phoneOffset = -new Date(epoch * 1000).getTimezoneOffset();
    const londonNow = '2026-06-26 14:00'; // an hour ahead of UTC in the summer

    const result = util.minutesAtPhone(6 * 60, londonNow, epoch);

    expect(result).toBe((((6 * 60 + phoneOffset - 60) % 1440) + 1440) % 1440);
  });

  /** Without the location's time now the offset cannot be read, so the time is left as it came. */
  test('leaves a time alone when the location time is missing', () => {
    const result = util.minutesAtPhone(6 * 60, undefined, undefined);

    expect(result).toBe(6 * 60);
  });

  /** No time in stays no time out. */
  test('passes a missing time through', () => {
    const result = util.minutesAtPhone(null, '2026-06-26 14:00', 1782478800);

    expect(result).toBe(null);
  });
});

describe('requestJson', () => {
  /** A structured error body (e.g. a provider's 401 JSON) must still reach the provider so it can classify it, not be swallowed as a network error. */
  test('hands a parseable body to onJson even when the request reported an http error', () => {
    const request: RequestFn = (_url, callback) => callback('http 401', '{"cod":401}');
    const onJson = vi.fn();

    util.requestJson('https://example', request, () => {}, onJson);

    expect(onJson).toHaveBeenCalledWith({ cod: 401 });
  });

  /** A failed request whose body cannot be parsed must become a NET ERROR status, never a fake reading. */
  test('returns a NET ERROR status when the request failed and the body is unparseable', () => {
    const request: RequestFn = (_url, callback) => callback('http 503', '<html>service down</html>');
    let result;

    util.requestJson('https://example', request, (status) => { result = status; }, () => {});

    expect(result.ok).toBe(false);
    expect(result.condition).toBe('NET ERROR');
  });

  /** A 2xx whose body is not JSON must surface as BAD WX DATA rather than success. */
  test('returns a BAD WX DATA status when a successful body is unparseable', () => {
    const request: RequestFn = (_url, callback) => callback(null, 'not json');
    let result;

    util.requestJson('https://example', request, (status) => { result = status; }, () => {});

    expect(result.ok).toBe(false);
    expect(result.condition).toBe('BAD WX DATA');
  });

  /** A clean success must parse and route to the provider. */
  test('hands a parseable success body to onJson', () => {
    const request: RequestFn = (_url, callback) => callback(null, '{"temp":12}');
    const onJson = vi.fn();

    util.requestJson('https://example', request, () => {}, onJson);

    expect(onJson).toHaveBeenCalledWith({ temp: 12 });
  });
});

describe('ok', () => {
  /** The watch renders an integer, since an unrounded float would overflow the field. */
  test('rounds the temperature and marks the result ok', () => {
    const result = util.ok(13.6, 'Clear', 'Town');

    expect(result).toEqual({
      temperature: 14,
      condition: 'CLEAR',
      location: 'Town',
      ok: true,
    });
  });

  /** A provider response missing the temperature must not ship NaN as a real reading. */
  test('returns a No Wx Data status when the temperature is not finite', () => {
    const result = util.ok(undefined, 'Clear', 'Town');

    expect(result.ok).toBe(false);
    expect(result.condition).toBe('NO WX DATA');
  });

  /** The condition must be passed through shorten so long phrases never reach the watch. */
  test('shortens the condition text', () => {
    const result = util.ok(10, 'Light rain', 'Town');

    expect(result.condition).toBe('RAIN');
  });

  /** A null location must become '' so the watch never renders the word "null". */
  test('falls back to an empty location label', () => {
    const result = util.ok(10, 'Clear', null);

    expect(result.location).toBe('');
  });

  /** The resolved coordinates must ride along when both are real, so the watch can show lat/lon. */
  test('attaches lat/lon when both are numbers', () => {
    const result = util.ok(10, 'Clear', 'Town', 51.5, -0.12);

    expect(result.lat).toBe(51.5);
    expect(result.lon).toBe(-0.12);
  });

  /** Without both coordinates the watch must show no lat/lon, never a phantom 0,0. */
  test.each([
    [undefined, undefined],
    [51.5, undefined],
    [undefined, -0.12],
  ])('omits lat/lon unless both are numbers (lat=%s, lon=%s)', (lat, lon) => {
    const result = util.ok(10, 'Clear', 'Town', lat, lon);

    expect(result).not.toHaveProperty('lat');
    expect(result).not.toHaveProperty('lon');
  });

  /**
   * Only the current temperature was held to the watch's bounds. A provider glitch sent a high of
   * 40000, which reached the watch as it came and overflowed a three digit label.
   */
  test('holds the extra temperatures to the watch bounds', () => {
    const extra = { tempMax: 40000, tempMin: -32768, feelsLike: 250, dewPoint: -150, pressure: 1013 };

    const result = util.ok(10, 'Clear', 'Town', 51.5, -0.12, extra);

    expect(result).toMatchObject({ tempMax: 199, tempMin: -99, feelsLike: 199, dewPoint: -99, pressure: 1013 });
  });

  /** The extra readings must ride along, rounded, so the watch can show them. */
  test('attaches the weather extras when provided', () => {
    const extra = {
      humidity: 61.4, windKmh: 12.7, windDir: 'NW', sunrise: 390, sunset: 1290, uvIndex: 4.8,
      feelsLike: 9.6, pressure: 1013.4, dewPoint: -2.4, tempMax: 18.6, tempMin: 9.2, precipChance: 80.4,
    };

    const result = util.ok(10, 'Clear', 'Town', 51.5, -0.12, extra);

    expect(result.humidity).toBe(61);
    expect(result.windKmh).toBe(13);
    expect(result.windDir).toBe('NW');
    expect(result.sunrise).toBe(390);
    expect(result.sunset).toBe(1290);
    expect(result.uvIndex).toBe(5);
    expect(result.feelsLike).toBe(10);
    expect(result.pressure).toBe(1013);
    expect(result.dewPoint).toBe(-2);
    expect(result.tempMax).toBe(19);
    expect(result.tempMin).toBe(9);
    expect(result.precipChance).toBe(80);
  });

  /** A genuine zero reading (0% humidity, calm wind) must ship. A truthy check would wrongly drop it. */
  test('keeps zero-valued numeric extras instead of dropping them', () => {
    const result = util.ok(10, 'Clear', 'Town', undefined, undefined, { humidity: 0, windKmh: 0 });

    expect(result.humidity).toBe(0);
    expect(result.windKmh).toBe(0);
  });

  /** Open-Meteo sends null for a reading it has none for, and Number(null) is 0, so it went out as 0% rain. */
  test.each([[null], [''], [true]])('leaves out an extra that is %s rather than sending 0', (value) => {
    const result = util.ok(10, 'Clear', 'Town', undefined, undefined, { precipChance: value, uvIndex: value });

    expect(result).not.toHaveProperty('precipChance');
    expect(result).not.toHaveProperty('uvIndex');
  });

  /** A reading with no extras object must stay the bare shape, never carry undefined fields. */
  test('omits the extras when none are provided', () => {
    const result = util.ok(10, 'Clear', 'Town');

    expect(result).not.toHaveProperty('humidity');
    expect(result).not.toHaveProperty('windKmh');
    expect(result).not.toHaveProperty('sunrise');
  });

  /** A missing single extra must be dropped, not shipped as NaN or "". */
  test('skips individual extras that are missing or non-numeric', () => {
    const extra = { humidity: undefined, windKmh: 'x', windDir: '', sunrise: 390 };

    const result = util.ok(10, 'Clear', 'Town', undefined, undefined, extra);

    expect(result).not.toHaveProperty('humidity');
    expect(result).not.toHaveProperty('windKmh');
    expect(result).not.toHaveProperty('windDir');
    expect(result.sunrise).toBe(390);
  });
});
