/**
 * Specs for the readings from OpenWeatherMap and WeatherAPI.com, each with its series from Open-Meteo.
 *
 * The fixtures are real answers for New Delhi and Honolulu, taken at 15:59 UTC on 12 November 2026,
 * with WeatherAPI's unused hourly block trimmed. They pair with the Open-Meteo fixture taken twelve
 * minutes earlier. The bad key answers are the real ones each provider gave a key that does not exist.
 *
 * What is worth pinning is which half each value comes from, that the current values are the ones a
 * face's own fetch reads from the same answer, each status a ledger acts on, the Open-Meteo answer
 * kept beside a provider failure, the Open-Meteo half failing on its own, a request that throws, and
 * that every condition code the providers publish gets a token and a WMO code that agree.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, test, expect } from 'vitest';
import owm, { OWM_WMO } from './owm';
import weatherApi, { WEATHERAPI_WMO } from './weatherapi';
import { fetchReading as fetchOpenMeteoReading } from './openmeteo';
import util from '../util';
import { fetchRequest } from '../../testing/fetch-request';
import { routing } from '../../testing/routing';
import type { ReadingResult, ReadingStatus, WeatherReading } from '../reading';
import type { RequestFn, WeatherCoords, WeatherResult } from '../util';

/** A fixture's text. */
function fixture(name: string): string {
  return readFileSync(path.join(import.meta.dirname, 'fixtures', name), 'utf8');
}

const OPEN_METEO = fixture('openmeteo-reading.json');
const [OWM_DELHI, OWM_HONOLULU] = JSON.parse(fixture('owm-reading.json')).map((answer: unknown) => JSON.stringify(answer));
const [WEATHERAPI_DELHI, WEATHERAPI_HONOLULU] = JSON.parse(fixture('weatherapi-reading.json')).map((answer: unknown) => JSON.stringify(answer));

const OWM_BAD_KEY = '{"cod":401, "message": "Invalid API key. Please see https://openweathermap.org/faq#error401 for more info."}';
const WEATHERAPI_BAD_KEY = '{"error":{"code":2006,"message":"API key is invalid."}}';

const DELHI = { lat: 28.6139, lon: 77.209 };
const HONOLULU = { lat: 21.3069, lon: -157.8583 };
const PLACES = [DELHI, HONOLULU];

type Answer = { err?: string | null; body?: string };
type FetchReading = (places: Array<WeatherCoords | null>, key: string, request: RequestFn, done: (results: ReadingResult[]) => void) => void;

/** A stub that answers Open-Meteo and each place's provider call from a table. */
function stub(openMeteo: Answer, delhi: Answer, honolulu: Answer, calls: string[] = []): RequestFn {
  return routing({ 'api.open-meteo.com': openMeteo, '28.6139': delhi, '21.3069': honolulu }, calls);
}

/** Runs a provider's `fetchReading` and hands back what it answered. */
function run(fetchReading: FetchReading, places: Array<WeatherCoords | null>, key: string, request: RequestFn): ReadingResult[] {
  let results: ReadingResult[] = [];

  fetchReading(places, key, request, (received) => {
    results = received;
  });
  return results;
}

/** A reading's status, or its `ok`, for specs that only care which. */
function statuses(results: ReadingResult[]): Array<string | boolean> {
  return results.map((reading) => (reading.ok ? true : (reading as ReadingStatus).status));
}

describe('OpenWeatherMap fetchReading', () => {
  /** The current values are OpenWeatherMap's, and what its free call lacks comes from Open-Meteo for the same place. */
  test('takes the current values from OpenWeatherMap and the rest from Open-Meteo', () => {
    const [delhi, honolulu] = run(owm.fetchReading, PLACES, 'k', stub({ body: OPEN_METEO }, { body: OWM_DELHI }, { body: OWM_HONOLULU })) as WeatherReading[];

    const result = [delhi.source, delhi.temperature, delhi.pressure, delhi.condition, delhi.dewPoint, delhi.utcOffset, delhi.hourly.time.length, honolulu.windSpeed, honolulu.windDirection];

    expect(result).toEqual(['owm', 21.99, 1016, { token: 'FOGGY', wmo: 45, isDay: false }, 16.3, 19800, 48, 6.69 * 3.6, 80]);
  });

  /** A reading that disagreed with the face's own fetch for the same answer would show two skies for one place. */
  test('reads the values a face fetch reads from the same answer', () => {
    let face!: WeatherResult;

    owm.fetch({ key: 'k', coords: HONOLULU, fields: [] }, stub({ body: OPEN_METEO }, { body: OWM_DELHI }, { body: OWM_HONOLULU }), (received) => {
      face = received;
    });

    const reading = run(owm.fetchReading, [HONOLULU], 'k', stub({ body: OPEN_METEO }, { body: OWM_DELHI }, { body: OWM_HONOLULU }))[0] as WeatherReading;

    const result = [Math.round(reading.temperature as number), Math.round(reading.windSpeed as number), Math.round(reading.pressure as number), util.applyNight(reading.condition.token, reading.condition.isDay !== false)];

    expect(result).toEqual([face.temperature, face.windKmh, face.pressure, face.condition]);
  });

  /** A wearer with no key must cost no call at all, to OpenWeatherMap or to Open-Meteo. */
  test('gives NO API KEY with no request', () => {
    const calls: string[] = [];

    const result = [statuses(run(owm.fetchReading, PLACES, '', stub({ body: OPEN_METEO }, { body: OWM_DELHI }, { body: OWM_HONOLULU }, calls))), calls.length];

    expect(result).toEqual([['NO API KEY', 'NO API KEY'], 0]);
  });

  /** A rate limit read as anything else gave the ledger no reason to hold off, and every retry spent more. */
  test.each([
    ['a JSON body', '{"cod":429,"message":"Your account is temporary blocked due to exceeding of requests limitation of your subscription type."}'],
    ['no body', ''],
  ])('gives RATE LIMIT for a 429 with %s', (_label, body) => {
    const result = statuses(run(owm.fetchReading, [DELHI], 'k', stub({ body: OPEN_METEO }, { err: 'http 429', body }, {})));

    expect(result).toEqual(['RATE LIMIT']);
  });

  /** A bad key has to say so, or the wearer never learns to paste a new one. */
  test('gives INVALID KEY for the answer OpenWeatherMap gives a bad key', () => {
    const result = statuses(run(owm.fetchReading, [DELHI], 'k', stub({ body: OPEN_METEO }, { err: 'http 401', body: OWM_BAD_KEY }, {})));

    expect(result).toEqual(['INVALID KEY']);
  });

  /** A provider failure threw the Open-Meteo answer away, so a failover paid for the same batch twice. */
  test('hands back the Open-Meteo reading beside a provider failure', () => {
    const [delhi] = run(owm.fetchReading, [DELHI], 'k', stub({ body: OPEN_METEO }, { err: 'http 401', body: OWM_BAD_KEY }, {})) as ReadingStatus[];

    const result = [delhi.status, delhi.openMeteo?.ok, (delhi.openMeteo as WeatherReading).source, (delhi.openMeteo as WeatherReading).utcOffset];

    expect(result).toEqual(['INVALID KEY', true, 'openmeteo', 19800]);
  });

  /** Open-Meteo's own rate limit hid behind the provider's status, so the ledger kept spending Open-Meteo calls. */
  test('hands back an Open-Meteo rate limit beside a provider failure', () => {
    const [delhi] = run(owm.fetchReading, [DELHI], 'k', stub({ err: 'http 429', body: '' }, { err: 'http 401', body: OWM_BAD_KEY }, {})) as ReadingStatus[];

    const result = [delhi.status, (delhi.openMeteo as ReadingStatus).status];

    expect(result).toEqual(['INVALID KEY', 'RATE LIMIT']);
  });

  /** A server error page in JSON with no cod read as an empty reading, where the request had failed. */
  test('gives NET ERROR for a failed request whose JSON body has no cod', () => {
    const result = statuses(run(owm.fetchReading, [DELHI], 'k', stub({ body: OPEN_METEO }, { err: 'http 500', body: '{"message":"Internal error"}' }, {})));

    expect(result).toEqual(['NET ERROR']);
  });

  /** Losing Open-Meteo blanked a reading OpenWeatherMap had just given, though the current values were real. */
  test('keeps the current reading with empty series when the Open-Meteo half fails', () => {
    const delhi = run(owm.fetchReading, [DELHI], 'k', stub({ err: 'network error' }, { body: OWM_DELHI }, {}))[0] as WeatherReading;

    const result = [delhi.ok, delhi.temperature, delhi.utcOffset, delhi.dewPoint, delhi.hourly.time.length, delhi.daily.time.length, delhi.seriesStatus];

    expect(result).toEqual([true, 21.99, 19800, null, 0, 0, 'NET ERROR']);
  });
});

describe('WeatherAPI.com fetchReading', () => {
  /** WeatherAPI gives its own UV and dew point, so those are its, and the series and offset come from Open-Meteo. */
  test('takes the current values from WeatherAPI and the series from Open-Meteo', () => {
    const honolulu = run(weatherApi.fetchReading, PLACES, 'k', stub({ body: OPEN_METEO }, { body: WEATHERAPI_DELHI }, { body: WEATHERAPI_HONOLULU }))[1] as WeatherReading;

    const result = [honolulu.source, honolulu.temperature, honolulu.windSpeed, honolulu.windDirection, honolulu.pressure, honolulu.dewPoint, honolulu.condition, honolulu.utcOffset, honolulu.daily.time.length];

    expect(result).toEqual(['weatherapi', 21.9, 19.8, 58, 1021, 20.7, { token: 'SHWR', wmo: 80, isDay: false }, -36000, 8]);
  });

  /** A reading that disagreed with the face's own fetch for the same answer would show two skies for one place. */
  test('reads the values a face fetch reads from the same answer', () => {
    const face = weatherApi.parseWeather(JSON.parse(WEATHERAPI_HONOLULU), {});

    const reading = run(weatherApi.fetchReading, [HONOLULU], 'k', stub({ body: OPEN_METEO }, {}, { body: WEATHERAPI_HONOLULU }))[0] as WeatherReading;

    const result = [Math.round(reading.temperature as number), Math.round(reading.windSpeed as number), Math.round(reading.dewPoint as number), util.applyNight(reading.condition.token, reading.condition.isDay !== false)];

    expect(result).toEqual([face.temperature, face.windKmh, face.dewPoint, face.condition]);
  });

  /** A wearer with no key must cost no call at all, to WeatherAPI or to Open-Meteo. */
  test('gives NO API KEY with no request', () => {
    const calls: string[] = [];

    const result = [statuses(run(weatherApi.fetchReading, PLACES, '', stub({ body: OPEN_METEO }, {}, {}, calls))), calls.length];

    expect(result).toEqual([['NO API KEY', 'NO API KEY'], 0]);
  });

  /**
   * WeatherAPI stops answering until the 1st once the month's calls are spent. Read as anything but a
   * rate limit, the ledger would keep spending tries on a key that cannot answer.
   */
  test.each([
    ['a 429', { err: 'http 429', body: '' }, 'RATE LIMIT'],
    ['the monthly quota spent', { err: 'http 403', body: '{"error":{"code":2007,"message":"API key has exceeded calls per month quota."}}' }, 'RATE LIMIT'],
    ['a bad key', { err: 'http 401', body: WEATHERAPI_BAD_KEY }, 'INVALID KEY'],
    ['a disabled key', { err: 'http 403', body: '{"error":{"code":2008,"message":"API key has been disabled."}}' }, 'INVALID KEY'],
  ])('gives the status for %s', (_label, answer, status) => {
    const result = statuses(run(weatherApi.fetchReading, [DELHI], 'k', stub({ body: OPEN_METEO }, answer, {})));

    expect(result).toEqual([status]);
  });

  /** A plugin that read a spent month as a bare 429 would try the key again within minutes, and every try until the 1st is refused. */
  test.each([
    ['the monthly quota spent', { err: 'http 403', body: '{"error":{"code":2007,"message":"API key has exceeded calls per month quota."}}' }, 'month'],
    ['a bare 429', { err: 'http 429', body: '' }, undefined],
  ])('names the limit for %s', (_label, answer, limit) => {
    const result = (run(weatherApi.fetchReading, [DELHI], 'k', stub({ body: OPEN_METEO }, answer, {}))[0] as ReadingStatus).limit;

    expect(result).toBe(limit);
  });

  /** A local time a minute behind its moment, as a cached answer gives, put Kathmandu at UTC+5:44 and every time a minute off. */
  test('rounds the offset from WeatherAPI local time to the quarter hour', () => {
    const answer = JSON.parse(WEATHERAPI_DELHI);
    const epoch = answer.location.localtime_epoch;
    const wall = new Date((epoch + 20700 - 60) * 1000).toISOString();

    answer.location.localtime = `${wall.slice(0, 10)} ${wall.slice(11, 16)}`;

    const result = (run(weatherApi.fetchReading, [DELHI], 'k', stub({ err: 'network error' }, { body: JSON.stringify(answer) }, {}))[0] as WeatherReading).utcOffset;

    expect(result).toBe(20700);
  });

  /** With Open-Meteo gone, the offset comes from WeatherAPI's own local time, or the reading's times could not be read. */
  test('keeps the current reading on WeatherAPI clock when the Open-Meteo half fails', () => {
    const delhi = run(weatherApi.fetchReading, [DELHI], 'k', stub({ err: 'http 500', body: '' }, { body: WEATHERAPI_DELHI }, {}))[0] as WeatherReading;

    const result = [delhi.ok, delhi.temperature, delhi.utcOffset, delhi.hourly.time.length, delhi.seriesStatus];

    expect(result).toEqual([true, 23.7, 19800, 0, 'NET ERROR']);
  });
});

describe('a request that throws', () => {
  /** A request function that threw took the whole run down with it, where a status would have kept the other providers going. */
  test.each([
    ['Open-Meteo', (places: Array<WeatherCoords | null>, _key: string, request: RequestFn, done: (results: ReadingResult[]) => void) => fetchOpenMeteoReading(places, request, done)],
    ['OpenWeatherMap', owm.fetchReading],
    ['WeatherAPI.com', weatherApi.fetchReading],
  ])('answers NET ERROR from %s', (_label, fetchReading) => {
    const throwing: RequestFn = () => {
      throw new Error('no network stack');
    };

    const result = statuses(run(fetchReading, PLACES, 'k', throwing));

    expect(result).toEqual(['NET ERROR', 'NET ERROR']);
  });
});

/**
 * Every condition OpenWeatherMap publishes, as its condition page lists them: the id, the group name
 * the face reads, and the day icon.
 */
const OWM_DOCUMENTED: Array<[number, string, string]> = [
  [200, 'Thunderstorm', '11d'], [201, 'Thunderstorm', '11d'], [202, 'Thunderstorm', '11d'], [210, 'Thunderstorm', '11d'], [211, 'Thunderstorm', '11d'],
  [212, 'Thunderstorm', '11d'], [221, 'Thunderstorm', '11d'], [230, 'Thunderstorm', '11d'], [231, 'Thunderstorm', '11d'], [232, 'Thunderstorm', '11d'],
  [300, 'Drizzle', '09d'], [301, 'Drizzle', '09d'], [302, 'Drizzle', '09d'], [310, 'Drizzle', '09d'], [311, 'Drizzle', '09d'],
  [312, 'Drizzle', '09d'], [313, 'Drizzle', '09d'], [314, 'Drizzle', '09d'], [321, 'Drizzle', '09d'],
  [500, 'Rain', '10d'], [501, 'Rain', '10d'], [502, 'Rain', '10d'], [503, 'Rain', '10d'], [504, 'Rain', '10d'],
  [511, 'Rain', '13d'], [520, 'Rain', '09d'], [521, 'Rain', '09d'], [522, 'Rain', '09d'], [531, 'Rain', '09d'],
  [600, 'Snow', '13d'], [601, 'Snow', '13d'], [602, 'Snow', '13d'], [611, 'Snow', '13d'], [612, 'Snow', '13d'], [613, 'Snow', '13d'],
  [615, 'Snow', '13d'], [616, 'Snow', '13d'], [620, 'Snow', '13d'], [621, 'Snow', '13d'], [622, 'Snow', '13d'],
  [701, 'Mist', '50d'], [711, 'Smoke', '50d'], [721, 'Haze', '50d'], [731, 'Dust', '50d'], [741, 'Fog', '50d'],
  [751, 'Sand', '50d'], [761, 'Dust', '50d'], [762, 'Ash', '50d'], [771, 'Squall', '50d'], [781, 'Tornado', '50d'],
  [800, 'Clear', '01d'], [801, 'Clouds', '02d'], [802, 'Clouds', '03d'], [803, 'Clouds', '04d'], [804, 'Clouds', '04d'],
];

/** Every condition WeatherAPI publishes in its weather_conditions.json, with its English day text. */
const WEATHERAPI_DOCUMENTED: Array<[number, string]> = [
  [1000, 'Sunny'], [1003, 'Partly cloudy'], [1006, 'Cloudy'], [1009, 'Overcast'], [1012, 'Haze'], [1015, 'Dust haze'], [1018, 'Blowing dust'],
  [1021, 'Dust storm'], [1024, 'Sandstorm'], [1027, 'Severe sandstorm'], [1030, 'Mist'], [1033, 'Smoke'], [1036, 'Smoky haze'], [1039, 'Smog'],
  [1042, 'Severe smog'], [1045, 'Saharan dust'], [1048, 'Dust'], [1063, 'Patchy rain possible'], [1066, 'Patchy snow possible'],
  [1069, 'Patchy sleet possible'], [1072, 'Patchy freezing drizzle possible'], [1087, 'Thundery outbreaks possible'], [1114, 'Blowing snow'],
  [1117, 'Blizzard'], [1135, 'Fog'], [1147, 'Freezing fog'], [1150, 'Patchy light drizzle'], [1153, 'Light drizzle'], [1168, 'Freezing drizzle'],
  [1171, 'Heavy freezing drizzle'], [1180, 'Patchy light rain'], [1183, 'Light rain'], [1186, 'Moderate rain at times'], [1189, 'Moderate rain'],
  [1192, 'Heavy rain at times'], [1195, 'Heavy rain'], [1198, 'Light freezing rain'], [1201, 'Moderate or heavy freezing rain'], [1204, 'Light sleet'],
  [1207, 'Moderate or heavy sleet'], [1210, 'Patchy light snow'], [1213, 'Light snow'], [1216, 'Patchy moderate snow'], [1219, 'Moderate snow'],
  [1222, 'Patchy heavy snow'], [1225, 'Heavy snow'], [1237, 'Ice pellets'], [1240, 'Light rain shower'], [1243, 'Moderate or heavy rain shower'],
  [1246, 'Torrential rain shower'], [1249, 'Light sleet showers'], [1252, 'Moderate or heavy sleet showers'], [1255, 'Light snow showers'],
  [1258, 'Moderate or heavy snow showers'], [1261, 'Light showers of ice pellets'], [1264, 'Moderate or heavy showers of ice pellets'],
  [1273, 'Patchy light rain with thunder'], [1276, 'Moderate or heavy rain with thunder'], [1279, 'Patchy light snow with thunder'],
  [1282, 'Moderate or heavy snow with thunder'],
];

/** The sky a reading gives for an OpenWeatherMap condition. */
function owmReadingCondition(id: number, main: string, icon: string) {
  const answer = JSON.stringify({ ...JSON.parse(OWM_DELHI), weather: [{ id, main, icon }] });

  return (run(owm.fetchReading, [DELHI], 'k', stub({ body: OPEN_METEO }, { body: answer }, {}))[0] as WeatherReading).condition;
}

/** The sky a reading gives for a WeatherAPI condition. */
function weatherApiReadingCondition(code: number, text: string) {
  const parsed = JSON.parse(WEATHERAPI_DELHI);
  const answer = JSON.stringify({ ...parsed, current: { ...parsed.current, is_day: 1, condition: { code, text } } });

  return (run(weatherApi.fetchReading, [DELHI], 'k', stub({ body: OPEN_METEO }, { body: answer }, {}))[0] as WeatherReading).condition;
}

/** The day token a face's OpenWeatherMap fetch gives for a condition. */
function owmFaceToken(id: number, main: string, icon: string): string {
  let face!: WeatherResult;
  const answer = JSON.stringify({ cod: 200, main: { temp: 10 }, weather: [{ id, main, icon }] });

  owm.fetch({ key: 'k', coords: DELHI, fields: [] }, (_url, callback) => callback(null, answer), (received) => {
    face = received;
  });
  return face.condition;
}

/** The day token a face's WeatherAPI fetch gives for a condition. */
function weatherApiFaceToken(code: number, text: string): string {
  return weatherApi.parseWeather({ current: { temp_c: 10, is_day: 1, condition: { code, text } } }, {}).condition;
}

describe('the WMO codes', () => {
  /** An id with no code served no weather_code, so a face reading the code showed nothing for a sky it knew. */
  test('gives every OpenWeatherMap condition a code but squalls and tornadoes', () => {
    const result = OWM_DOCUMENTED.filter(([id]) => !Object.prototype.hasOwnProperty.call(OWM_WMO, id)).map(([id]) => id);

    expect(result).toEqual([771, 781]);
  });

  /**
   * A token and a code that named two skies served dust as N/A to one face and as fog to another, and
   * the reading's token has to be the face's wherever the face has one.
   */
  test('gives every OpenWeatherMap condition a token and a code that agree, and the face token where it has one', () => {
    const result = OWM_DOCUMENTED.filter(([id, main, icon]) => {
      const reading = owmReadingCondition(id, main, icon);
      const face = owmFaceToken(id, main, icon);

      return util.wmoToCondition(reading.wmo) !== reading.token || (face !== 'UNKNOWN' && face !== reading.token);
    });

    expect(result).toEqual([]);
  });

  /** A code with no WMO code served no weather_code, so a face reading the code showed nothing for a sky it knew. */
  test('gives every WeatherAPI condition a code', () => {
    const result = WEATHERAPI_DOCUMENTED.filter(([code]) => !Object.prototype.hasOwnProperty.call(WEATHERAPI_WMO, code)).map(([code]) => code);

    expect(result).toEqual([]);
  });

  /**
   * A token and a code that named two skies served smog as N/A to one face and as fog to another, and
   * the reading's token has to be the face's wherever the face has one.
   */
  test('gives every WeatherAPI condition a token and a code that agree, and the face token where it has one', () => {
    const result = WEATHERAPI_DOCUMENTED.filter(([code, text]) => {
      const reading = weatherApiReadingCondition(code, text);
      const face = weatherApiFaceToken(code, text);

      return util.wmoToCondition(reading.wmo) !== reading.token || (face !== 'UNKNOWN' && face !== reading.token);
    });

    expect(result).toEqual([]);
  });
});

/**
 * Runs only with RUN_LIVE_WEATHER=1 and each provider's key, against the real APIs.
 *
 * A provider renaming a field would still parse here into a gap. This is the only check that would
 * catch it.
 */
describe('live', () => {
  /** OpenWeatherMap's current values and Open-Meteo's series come back together for each place. */
  test.skipIf(process.env.RUN_LIVE_WEATHER !== '1' || !process.env.OWM_KEY)('reads two places from OpenWeatherMap', async () => {
    const results = await new Promise<ReadingResult[]>((resolve) => owm.fetchReading(PLACES, process.env.OWM_KEY as string, fetchRequest, resolve));

    const result = results.map((reading) => (reading.ok ? [reading.source, typeof reading.temperature, reading.hourly.time.length, reading.daily.time.length] : (reading as ReadingStatus).status));

    expect(result).toEqual([
      ['owm', 'number', 48, 8],
      ['owm', 'number', 48, 8],
    ]);
  });

  /** WeatherAPI's current values and Open-Meteo's series come back together for each place. */
  test.skipIf(process.env.RUN_LIVE_WEATHER !== '1' || !process.env.WEATHERAPI_KEY)('reads two places from WeatherAPI.com', async () => {
    const results = await new Promise<ReadingResult[]>((resolve) => weatherApi.fetchReading(PLACES, process.env.WEATHERAPI_KEY as string, fetchRequest, resolve));

    const result = results.map((reading) => (reading.ok ? [reading.source, typeof reading.temperature, typeof reading.dewPoint, reading.hourly.time.length] : (reading as ReadingStatus).status));

    expect(result).toEqual([
      ['weatherapi', 'number', 'number', 48],
      ['weatherapi', 'number', 'number', 48],
    ]);
  });
});
