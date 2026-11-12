/**
 * Specs for Open-Meteo's `fetchReading`, the reading a weather plugin serves.
 *
 * The fixtures are real answers, trimmed of their unit blocks and of the hours past the two days a
 * reading keeps. The main one is New Delhi and Honolulu in one request, taken at 15:47 UTC on
 * 12 November 2026, which is 21:17 in Delhi, 05:47 in Honolulu, and already 13 November in Tokyo.
 * Eucla was taken at 00:30 its time, once with the ranges the reading asks for and once with a day and
 * an hour less, and Longyearbyen in its polar night.
 *
 * Open-Meteo works out each place's today and current hour on its offset cut down to whole hours, and
 * stamps every day on the offset of now. `openMeteoAt` follows that rule for the moments no fixture
 * holds, reading the ranges from the URL the way Open-Meteo does.
 *
 * What is worth pinning is where each series starts on the place's own clock at any minute of its
 * day, that a gap stays a gap, that one answer splits into the right places, what a 429 says, and
 * what a request costs against Open-Meteo's limits.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, test, expect } from 'vitest';
import { fetchReading, readingUrl, requestWeight, READING_WEIGHT } from './openmeteo';
import { fetchRequest } from '../../testing/fetch-request';
import { replying, routing } from '../../testing/routing';
import type { ReadingResult, ReadingStatus, WeatherReading } from '../reading';
import type { RequestFn, WeatherCoords } from '../util';

/** A fixture's text. */
function fixture(name: string): string {
  return readFileSync(path.join(import.meta.dirname, 'fixtures', name), 'utf8');
}

const FIXTURE = fixture('openmeteo-reading.json');

const DELHI = { lat: 28.6139, lon: 77.209 };
const HONOLULU = { lat: 21.3069, lon: -157.8583 };
const SOMEWHERE = { lat: 10, lon: 10 };

// the ranges the reading asks for, as they sit in the URL
const READING_RANGES = 'past_days=1&past_hours=25&forecast_hours=49&forecast_days=9';

/** Runs `fetchReading` against a stub and hands back what it answered. */
function run(places: Array<WeatherCoords | null>, request: RequestFn): ReadingResult[] {
  let results: ReadingResult[] = [];

  fetchReading(places, request, (received) => {
    results = received;
  });
  return results;
}

/** The first answer as a reading, for a spec that expects one. */
function first(places: Array<WeatherCoords | null>, request: RequestFn): WeatherReading {
  return run(places, request)[0] as WeatherReading;
}

/** The fixture's answer with one change made to it first. */
function edited(change: (answer: Array<Record<string, Record<string, unknown[]>>>) => void): string {
  const answer = JSON.parse(FIXTURE);

  change(answer);
  return JSON.stringify(answer);
}

/** A zone's offset from UTC at a moment, in seconds, from the zone rules Node carries. */
function offsetAt(zone: string, epoch: number): number {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: zone, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' }).formatToParts(new Date(epoch * 1000));
  const part = (type: string) => Number(parts.find((entry) => entry.type === type)?.value);

  return Date.UTC(part('year'), part('month') - 1, part('day'), part('hour'), part('minute'), part('second')) / 1000 - epoch;
}

/**
 * A stand-in for Open-Meteo answering one place in a zone at a moment. It reads the day and hour
 * ranges from the URL, picks today and the current hour on the offset cut down to whole hours, and
 * stamps every day on the offset of now, as Open-Meteo does.
 */
function openMeteoAt(zone: string, now: number): RequestFn {
  return (url, callback) => {
    const query = new URL(url).searchParams;
    const ask = (name: string) => Number(query.get(name) || 0);
    const offset = offsetAt(zone, now);
    const whole = Math.trunc(offset / 3600) * 3600;
    const firstDay = Math.floor((now + whole) / 86400) * 86400 - offset - ask('past_days') * 86400;
    const firstHour = Math.floor((now + whole) / 3600) * 3600 - offset - ask('past_hours') * 3600;
    const days = Array.from({ length: ask('past_days') + ask('forecast_days') }, (_unused, index) => firstDay + index * 86400);
    const hours = Array.from({ length: ask('past_hours') + ask('forecast_hours') }, (_unused, index) => firstHour + index * 3600);

    callback(null, JSON.stringify({
      utc_offset_seconds: offset,
      current: { time: Math.floor(now / 900) * 900, temperature_2m: 20 },
      hourly: { time: hours, temperature_2m: hours.map(() => 20) },
      daily: { time: days, temperature_2m_max: days.map(() => 25) },
    }));
  };
}

/** Where a reading's series start and how long they run, the shape the specs below pin. */
function shape(reading: ReadingResult): Array<number | string> {
  if (!reading.ok) {
    return [(reading as ReadingStatus).status];
  }

  return [reading.daily.time[0], reading.hourly.time[0], reading.hourly.time.length, reading.daily.time.length];
}

describe('readingUrl', () => {
  /** Without both, the times come back as text on one zone's clock and every series lands hours off. */
  test('asks for each place in its own zone with epoch times', () => {
    const result = readingUrl([DELHI, HONOLULU]);

    expect(result).toMatch(/latitude=28\.6139,21\.3069&longitude=77\.209,-157\.8583&.*&timezone=auto&timeformat=unixtime$/);
  });
});

describe('fetchReading on the place clock', () => {
  /** India sits half an hour off the hour, and a series counted from a UTC hour started at 23:30 or 00:30 there. */
  test('starts the hourly series at the place midnight in a half-hour zone', () => {
    const result = shape(first([DELHI, HONOLULU], replying(FIXTURE, [])));

    expect(result).toEqual([Date.UTC(2026, 10, 11, 18, 30) / 1000, Date.UTC(2026, 10, 11, 18, 30) / 1000, 48, 8]);
  });

  /** A place's today comes from its own answer, so a Tokyo phone already on the 13th must not take Honolulu's 12th away. */
  test('keeps the place today for a place a day behind the phone', () => {
    const [, honolulu] = run([DELHI, HONOLULU], replying(FIXTURE, []));

    const result = shape(honolulu);

    expect(result).toEqual([Date.UTC(2026, 10, 12, 10) / 1000, Date.UTC(2026, 10, 12, 10) / 1000, 48, 8]);
  });

  /**
   * At 23:45 in St. John's, Open-Meteo's today, worked out on a whole-hour offset, is already
   * tomorrow, and the reading came back with empty series.
   */
  test('holds the whole of today in the last half hour of the day behind UTC', () => {
    const result = shape(first([SOMEWHERE], openMeteoAt('America/St_Johns', Date.UTC(2026, 10, 13, 3, 15) / 1000)));

    expect(result).toEqual([Date.UTC(2026, 10, 12, 3, 30) / 1000, Date.UTC(2026, 10, 12, 3, 30) / 1000, 48, 8]);
  });

  /** At 00:30 in Eucla, Open-Meteo's day had not turned yet, and the reading ran 47 hours and 7 days. */
  test('holds two whole days just after midnight ahead of UTC', () => {
    const request = routing({ [READING_RANGES]: { body: fixture('openmeteo-eucla.json') }, '/v1/forecast': { body: fixture('openmeteo-eucla-old-range.json') } }, []);

    const result = shape(first([{ lat: -31.677, lon: 128.889 }], request));

    expect(result).toEqual([Date.UTC(2026, 10, 12, 15, 15) / 1000, Date.UTC(2026, 10, 12, 15, 15) / 1000, 48, 8]);
  });

  /**
   * An answer carries one offset, the one of now, and Open-Meteo stamps every day on it. On the day
   * New York's clocks go back, today's stamp is midnight on the new clock, an hour after the true one.
   * The reading keeps the stamps as they are, so this pins that shape and a change to it is noticed.
   */
  test('keeps the stamps on the offset of now through a change of clocks', () => {
    const reading = first([SOMEWHERE], openMeteoAt('America/New_York', Date.UTC(2026, 10, 1, 17) / 1000));

    const result = [reading.utcOffset, ...shape(reading), reading.daily.time[1]];

    expect(result).toEqual([-18000, Date.UTC(2026, 10, 1, 5) / 1000, Date.UTC(2026, 10, 1, 5) / 1000, 48, 8, Date.UTC(2026, 10, 2, 5) / 1000]);
  });

  /** A reading with empty series read as fine and blanked every forecast, where a status would have said why. */
  test('gives NO WX DATA when the answer holds no today', () => {
    const body = edited((answer) => {
      answer[0].daily.time = answer[0].daily.time.map((day) => (day as number) + 30 * 86400);
    });

    const [delhi] = run([DELHI, HONOLULU], replying(body, []));

    const result = shape(delhi);

    expect(result).toEqual(['NO WX DATA']);
  });
});

describe('fetchReading values', () => {
  /** A missing hour read as 0 would show a hot day dropping to freezing for one hour. */
  test('keeps an hour with no value as a gap', () => {
    const body = edited((answer) => {
      answer[0].hourly.temperature_2m[6] = null;
    });

    const result = first([DELHI, HONOLULU], replying(body, [])).hourly.temperature.slice(0, 2);

    expect(result).toEqual([20.9, null]);
  });

  /** A null or text stamp landed in a list of times, and a face placing that hour put it at 1970. */
  test('stops a series at a stamp that is not a time, keeping every list the same length', () => {
    const body = edited((answer) => {
      answer[0].hourly.time[10] = null;
      answer[0].daily.time[3] = 'x';
    });

    const reading = first([DELHI, HONOLULU], replying(body, []));

    const result = [reading.hourly.time.length, reading.hourly.temperature.length, reading.daily.time.length, reading.daily.high.length];

    expect(result).toEqual([5, 5, 2, 2]);
  });

  /** Through a polar night Open-Meteo gives the day's midnight as sunrise and sunset, which showed as a sunrise at 00:00. */
  test('gives no sunrise or sunset through a polar night', () => {
    const reading = first([{ lat: 78.2232, lon: 15.6267 }], replying(fixture('openmeteo-polar.json'), []));

    const result = [reading.daily.sunrise[0], reading.daily.sunset[0]];

    expect(result).toEqual([null, null]);
  });
});

describe('fetchReading answers', () => {
  /** Open-Meteo answers several places as a list in the order asked, and a mix-up showed one city's weather for another. */
  test('splits one answer into each place in order', () => {
    const results = run([DELHI, HONOLULU], replying(FIXTURE, []));

    const result = results.map((reading) => [(reading as WeatherReading).utcOffset, (reading as WeatherReading).temperature]);

    expect(result).toEqual([
      [19800, 23.6],
      [-36000, 22.6],
    ]);
  });

  /** Open-Meteo answers one place with an object rather than a list of one. */
  test('reads the answer for a single place', () => {
    const body = JSON.stringify(JSON.parse(FIXTURE)[1]);

    const result = first([HONOLULU], replying(body, [])).utcOffset;

    expect(result).toBe(-36000);
  });

  /**
   * Open-Meteo refuses the whole request when one latitude is out of range, so a place with bad
   * coordinates blanked every other place's weather.
   */
  test('leaves a place with bad coordinates out of the request so the others still get readings', () => {
    const calls: string[] = [];

    const results = run([DELHI, { lat: 95, lon: 0 }, HONOLULU], replying(FIXTURE, calls));

    const result = [calls[0].includes('latitude=28.6139,21.3069&'), ...results.map((reading) => (reading.ok ? (reading as WeatherReading).utcOffset : (reading as ReadingStatus).status))];

    expect(result).toEqual([true, 19800, 'NO LOCATION', -36000]);
  });

  /** A rate limit read as API ERROR or NET ERROR gave the ledger no reason to hold off until the window opens. */
  test.each([
    ['a JSON body', '{"error":true,"reason":"Minutely API request limit exceeded. Please try again in one minute."}'],
    ['an empty body', ''],
    ['an HTML body', '<html><body>Too Many Requests</body></html>'],
  ])('gives RATE LIMIT for a 429 with %s', (_label, body) => {
    const result = shape(run([DELHI], replying({ err: 'http 429', body }, []))[0]);

    expect(result).toEqual(['RATE LIMIT']);
  });
});

describe('the weight of a request', () => {
  /** A weight off by a factor lets the ledger spend Open-Meteo's day several times over, or never use it. */
  test.each([
    [10, 8, 1],
    [15, 14, 1.5],
    [15, 28, 3],
    [39, 10, 3.9],
  ])('counts %s variables over %s days as %s calls', (variables, days, calls) => {
    const result = requestWeight(variables, days);

    expect(result).toBeCloseTo(calls, 9);
  });

  /** The weight the ledger stamps has to follow the variables and days the reading really asks for. */
  test('counts a reading at 3.9 calls a place', () => {
    const result = READING_WEIGHT;

    expect(result).toBeCloseTo(3.9, 9);
  });
});

/**
 * Runs only with RUN_LIVE_WEATHER=1, against the real Open-Meteo API.
 *
 * Open-Meteo changing how it answers several places, or what `timezone=auto` does with them, would
 * still parse here into the wrong places. This is the only check that would catch it.
 */
describe.skipIf(process.env.RUN_LIVE_WEATHER !== '1')('live', () => {
  /** Each place in a batch comes back on its own zone, with its series from its own midnight. */
  test('answers two places in their own zones', async () => {
    const results = await new Promise<ReadingResult[]>((resolve) => fetchReading([DELHI, HONOLULU], fetchRequest, resolve));

    const result = results.map((reading) => (reading.ok ? [reading.utcOffset, (reading.hourly.time[0] + reading.utcOffset) % 86400, reading.hourly.time.length, reading.daily.time.length] : (reading as ReadingStatus).status));

    expect(result).toEqual([
      [19800, 0, 48, 8],
      [-36000, 0, 48, 8],
    ]);
  });
});
