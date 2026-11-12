/**
 * Specs for serving the weather from a plugin app as `weather/location`.
 *
 * A face reads a weather plugin through the framework's reader, and the Pebble app builds the watch's
 * own Weather app from the same instance, so an instance that drifts from the built-in's shapes shows
 * wrong numbers on both with nothing to say why. What is worth pinning is that a reading served and
 * read back shows what a face's own fetch shows, that every instance carries the days the Pebble app
 * insists on, that only what is asked goes out, the condition and unit tables, the naming rule the
 * declaration keeps, and the read of the wearer's places and units.
 *
 * The readings come from the providers' real recorded answers. Vitest runs on a Toronto phone, and
 * the fixed moment is 16:00 UTC on 12 November 2026, 11:00 in Toronto, 21:30 in Delhi, and 06:00 in
 * Honolulu.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, test, expect } from 'vitest';
import { conditionCode, DEFAULT_UNITS, locationInstance, NO_UNITS, pebbleAppUnits, readPebbleAppUnits, unitsFrom, WEATHER_LOCATION_SOURCE, weatherLocations } from './weather';
import conditions from '../weather/conditions';
import type { WeatherUnits } from './weather';
import { fetchReading as fetchOpenMeteoReading } from '../weather/providers/openmeteo';
import owm from '../weather/providers/owm';
import weatherApi from '../weather/providers/weatherapi';
import { weatherFromUpdate } from '../plugin-sources/weather';
import type { PluginPebble, SourceRequest } from './runtime';
import type { ReadingResult, WeatherReading } from '../weather/reading';
import type { RequestFn, WeatherResult } from '../weather/util';
import type { SourceEnvelope, SourceInstance, SourceProperty } from '../plugin-sources/types';

/** A provider fixture's text. */
function fixture(name: string): string {
  return readFileSync(path.join(import.meta.dirname, '..', 'weather', 'providers', 'fixtures', name), 'utf8');
}

const OPEN_METEO = fixture('openmeteo-reading.json');
const [OWM_DELHI, OWM_HONOLULU] = JSON.parse(fixture('owm-reading.json')).map((answer: unknown) => JSON.stringify(answer));
const [WEATHERAPI_DELHI, WEATHERAPI_HONOLULU] = JSON.parse(fixture('weatherapi-reading.json')).map((answer: unknown) => JSON.stringify(answer));

const DELHI = { lat: 28.6139, lon: 77.209 };
const HONOLULU = { lat: 21.3069, lon: -157.8583 };

// Thursday 12 November 2026, 16:00 UTC
const NOW = Date.UTC(2026, 10, 12, 16) / 1000;

const PLACE = { key: '6a1c4d20-0000-4000-8000-000000000001', name: 'Home', lat: 28.6139, lon: 77.209 };

const FACE_FIELDS = ['humidity', 'windKmh', 'windDir', 'feelsLike'];
const ALL_FIELDS = [...FACE_FIELDS, 'uvIndex', 'sunrise', 'sunset', 'tempMax', 'tempMin', 'precipChance'];

/** Answers every request from the recorded answers, by host and place. */
const recorded: RequestFn = (url, callback) => {
  if (url.includes('open-meteo')) {
    return callback(null, OPEN_METEO);
  }

  const delhi = url.includes('28.6139');

  callback(null, url.includes('openweathermap') ? (delhi ? OWM_DELHI : OWM_HONOLULU) : delhi ? WEATHERAPI_DELHI : WEATHERAPI_HONOLULU);
};

/** The readings a provider's `fetchReading` gives for Delhi and Honolulu from the recorded answers. */
function readings(provider: 'openmeteo' | 'owm' | 'weatherapi'): WeatherReading[] {
  let results: ReadingResult[] = [];
  const done = (received: ReadingResult[]) => {
    results = received;
  };

  if (provider === 'openmeteo') {
    fetchOpenMeteoReading([DELHI, HONOLULU], recorded, done);
  } else {
    (provider === 'owm' ? owm : weatherApi).fetchReading([DELHI, HONOLULU], 'k', recorded, done);
  }

  return results as WeatherReading[];
}

/** A reading served as an instance and read back the way a face reads a weather plugin. */
function servedAndRead(reading: WeatherReading): WeatherResult {
  const instance = locationInstance(reading, PLACE, DEFAULT_UNITS, undefined, NOW * 1000) as SourceInstance;

  return weatherFromUpdate({ instances: [instance] }, { fahrenheit: false, nowSeconds: NOW, fields: ALL_FIELDS, wantForecast: false });
}

/** A face's own fetch from the same recorded answer, asking only what the provider gives itself. */
function faceFetch(provider: typeof owm | typeof weatherApi, coords: typeof DELHI): WeatherResult {
  let face!: WeatherResult;

  provider.fetch({ key: 'k', coords, fields: FACE_FIELDS }, recorded, (received) => {
    face = received;
  });
  return face;
}

/**
 * The current values a face shows, with the sky put through the standard's nine codes. A weather
 * plugin's sky reaches a face as one of the nine, so that is the detail a round trip can keep.
 */
function currentView(result: WeatherResult): Array<string | number | boolean | undefined> {
  return [result.temperature, conditionCode(result.condition), result.condition.endsWith('_NIGHT'), result.humidity, result.windKmh, result.windDir, result.feelsLike];
}

/** The parts of a reading that come from Open-Meteo's daily series for the phone's today. */
function dailyView(result: WeatherResult): Array<number | undefined> {
  return [result.tempMax, result.tempMin, result.precipChance, result.sunrise, result.sunset];
}

/**
 * The round trip holds for the places below. Two differences come from the readings themselves rather
 * than the serving: a wind at 146 degrees reads SE through a plugin, which serves degrees, and SSE on
 * a face whose WeatherAPI fetch takes WeatherAPI's own compass point, and WeatherAPI's code 1042 for
 * smog reads as fog through a plugin but `UNKNOWN` on a face, since a reading gives every code a sky.
 * So WeatherAPI is checked at Honolulu, where neither comes up.
 */
describe('a reading served and read back', () => {
  /** A served reading that read back differently from a face's own fetch put two temperatures on two faces for one place. */
  test('shows what a face fetch shows from Open-Meteo', () => {
    const result = servedAndRead(readings('openmeteo')[0]);

    expect([...currentView(result), result.uvIndex, ...dailyView(result)]).toEqual([24, 'sun', true, 64, 3, 'W', 25, 0, 28, 18, 0, 1211, 419]);
  });

  /** OpenWeatherMap's current values have to come back as the face's own OpenWeatherMap fetch shows them. */
  test('shows what a face fetch shows from OpenWeatherMap', () => {
    const result = servedAndRead(readings('owm')[0]);

    expect([currentView(result), dailyView(result)]).toEqual([currentView(faceFetch(owm, DELHI)), [28, 18, 0, 1211, 419]]);
  });

  /** WeatherAPI's current values have to come back as the face's own WeatherAPI fetch shows them. */
  test('shows what a face fetch shows from WeatherAPI.com', () => {
    const result = servedAndRead(readings('weatherapi')[1]);

    expect([...currentView(result), result.uvIndex]).toEqual([...currentView(faceFetch(weatherApi, HONOLULU)), faceFetch(weatherApi, HONOLULU).uvIndex]);
  });
});

/**
 * The days a place's instance holds from its today, read the way the Pebble app reads them: today
 * is found from the served offset and now, and each series is read by day from its start.
 */
function pebbleAppDays(instance: SourceInstance, nowSeconds: number): number {
  const properties = instance.properties as Record<string, SourceProperty>;
  const offset = Math.round(properties.utc_offset?.numericValue?.value as number) * 60;
  const local = nowSeconds + offset;
  const midnight = local - (((local % 86400) + 86400) % 86400) - offset;
  const daily = (name: string, shape: 'numericValue' | 'longText' | 'timestamp') => {
    const series = properties[name]?.series;
    const today = Math.round((midnight - (series?.start as number)) / 86400);

    return series?.stepSec === 86400 && today >= 0 ? ((series[shape]?.values as unknown[]) || []).slice(today) : [];
  };
  const lists = [daily('daily_high', 'numericValue'), daily('daily_low', 'numericValue'), daily('daily_condition_code', 'longText'), daily('daily_sunrise', 'timestamp'), daily('daily_sunset', 'timestamp')];
  let days = 0;

  while (lists.every((list) => list[days] !== undefined && list[days] !== null)) {
    days++;
  }

  return days;
}

describe('the days the Pebble app needs', () => {
  /** The Pebble app turns away an instance without today and tomorrow, and takes that place from its own backend. */
  test.each(['openmeteo', 'owm', 'weatherapi'] as const)('holds today and tomorrow for every place from %s', (provider) => {
    const result = readings(provider).map((reading) => pebbleAppDays(locationInstance(reading, PLACE, DEFAULT_UNITS, undefined, NOW * 1000) as SourceInstance, NOW) >= 2);

    expect(result).toEqual([true, true]);
  });

  /** An instance with one day was turned away by the Pebble app, so the plugin has to leave the place out instead. */
  test('answers no instance for a reading with only today', () => {
    const reading = readings('openmeteo')[0];
    const short = { ...reading, daily: { ...reading.daily, time: reading.daily.time.slice(0, 1), high: reading.daily.high.slice(0, 1), low: reading.daily.low.slice(0, 1) } };

    const result = locationInstance(short, PLACE, DEFAULT_UNITS, undefined, NOW * 1000);

    expect(result).toBeNull();
  });

  /** A reading whose Open-Meteo half failed has no days at all, which the Pebble app would turn away. */
  test('answers no instance for a reading with empty series', () => {
    let reading!: WeatherReading;

    owm.fetchReading([DELHI], 'k', (url, callback) => (url.includes('open-meteo') ? callback('network error') : recorded(url, callback)), (results) => {
      reading = results[0] as WeatherReading;
    });

    const result = locationInstance(reading, PLACE, DEFAULT_UNITS, undefined, NOW * 1000);

    expect(result).toBeNull();
  });
});

describe('the offset', () => {
  /** The Pebble app reads utc_offset as minutes, so seconds put every place's midnight days out and its forecast went unread. */
  test('serves each place offset in minutes east of UTC, as the built-in does', () => {
    const result = readings('openmeteo').map((reading) => (locationInstance(reading, PLACE, DEFAULT_UNITS, ['utc_offset'], NOW * 1000) as SourceInstance).properties?.utc_offset?.numericValue);

    expect(result).toEqual([
      { value: 330, unit: 'min' },
      { value: -600, unit: 'min' },
    ]);
  });
});

describe('the coordinates', () => {
  /** A coordinate face reads the place's coordinates from the plugin, and a fix finer than a weather place needs gives away more of the wearer's home than it adds. */
  test('serves the place coordinates to four decimals', () => {
    const properties = locationInstance(readings('openmeteo')[0], { ...PLACE, lat: 28.613949, lon: -77.20901 }, DEFAULT_UNITS, ['latitude', 'longitude'], NOW * 1000)?.properties;

    const result = [properties?.latitude, properties?.longitude];

    expect(result).toEqual([
      { numericValue: { value: 28.6139, unit: '°' }, shortText: { text: '28.6139' } },
      { numericValue: { value: -77.209, unit: '°' }, shortText: { text: '-77.2090' } },
    ]);
  });

  /** A place with no coordinates of its own must not go out as 0, 0, which a coordinate face would show as a real fix. */
  test('serves no coordinates for a place given none', () => {
    const properties = locationInstance(readings('openmeteo')[0], { key: PLACE.key, name: PLACE.name }, DEFAULT_UNITS, ['latitude', 'longitude'], NOW * 1000)?.properties;

    const result = [properties?.latitude, properties?.longitude];

    expect(result).toEqual([undefined, undefined]);
  });

  /** The wearer's place went to every face that read the plugin, where only one that asked for it should get it. */
  test.each([
    ['names no properties', undefined],
    ['names other properties', ['temperature', 'hourly_temperature']],
  ])('serves no coordinates to a request that %s', (_label, asked) => {
    const properties = locationInstance(readings('openmeteo')[0], PLACE, DEFAULT_UNITS, asked, NOW * 1000)?.properties;

    const result = [properties?.latitude, properties?.longitude];

    expect(result).toEqual([undefined, undefined]);
  });

  /** Half a place, or one out of range, read on a coordinate face as a real fix somewhere it is not. */
  test.each([
    ['a missing longitude', { lat: 33.4 }],
    ['a longitude out of range', { lat: 33.4, lon: 456 }],
  ])('serves neither coordinate for %s', (_label, coords) => {
    const properties = locationInstance(readings('openmeteo')[0], { key: PLACE.key, name: PLACE.name, ...coords }, DEFAULT_UNITS, ['latitude', 'longitude'], NOW * 1000)?.properties;

    const result = [properties?.latitude, properties?.longitude];

    expect(result).toEqual([undefined, undefined]);
  });
});

describe('what is asked', () => {
  /** Sending every series to a face that asked for one spent the run's time and the phone's memory on nothing. */
  test('sends only the series a request names', () => {
    const instance = locationInstance(readings('openmeteo')[0], PLACE, DEFAULT_UNITS, ['temperature', 'condition_code', 'hourly_temperature'], NOW * 1000) as SourceInstance;

    const result = Object.keys(instance.properties as object).filter((name) => /^(hourly|daily)_/.test(name));

    expect(result).toEqual(['hourly_temperature']);
  });

  /** An instance answered with nothing for an empty list was turned away by the Pebble app for having no temperature. */
  test('sends every single value whatever the request names, as the built-in does', () => {
    const instance = locationInstance(readings('openmeteo')[0], PLACE, DEFAULT_UNITS, [], NOW * 1000) as SourceInstance;

    const result = Object.keys(instance.properties as object).filter((name) => !/^(hourly|daily)_/.test(name)).length;

    // the coordinates go only to a request that names them
    expect(result).toBe(Object.keys(WEATHER_LOCATION_SOURCE.properties).filter((name) => !/^(hourly|daily)_/.test(name) && name !== 'latitude' && name !== 'longitude').length);
  });
});

describe('uv_index', () => {
  /** Served as the UV right now, the watch's own Weather app read 0 after dark and low all morning, where the built-in gives the day's peak. */
  test('serves the day peak, as the built-in does', () => {
    const result = locationInstance(readings('openmeteo')[0], PLACE, DEFAULT_UNITS, [], NOW * 1000)?.properties?.uv_index?.numericValue?.value;

    expect(result).toBe(4.45);
  });
});

describe('the tables', () => {
  /** The Pebble app cuts a condition's short text to 12 characters for its timeline pins, which made Partly Cloud of Partly Cloudy. */
  test('keeps every short label to 12 characters', () => {
    const tokens = [...conditions.conditions.map((entry) => entry.token), 'UNKNOWN'];
    const reading = readings('openmeteo')[0];

    const result = tokens.filter((token) => {
      const served = locationInstance({ ...reading, condition: { token, wmo: null, isDay: true } }, PLACE, DEFAULT_UNITS, [], NOW * 1000)?.properties?.condition?.shortText?.text as string;

      return served.length > 12;
    });

    expect(result).toEqual([]);
  });

  /** A sky with the wrong standard code drew the wrong picture on every face that draws its own from the code. */
  test.each([
    ['CLEAR', 'sun'], ['CLEAR_NIGHT', 'sun'], ['PCLDY', 'partly_cloudy'], ['CLDY', 'cloudy'], ['FOGGY', 'cloudy'],
    ['DRZL', 'light_rain'], ['SHWR', 'light_rain'], ['RAIN', 'heavy_rain'], ['STRM', 'heavy_rain'],
    ['FZDZ', 'rain_and_snow'], ['FZRN', 'rain_and_snow'], ['SNOW', 'heavy_snow'], ['SNSH', 'light_snow'], ['UNKNOWN', 'unknown'],
  ])('gives %s the standard code %s', (token, code) => {
    const result = conditionCode(token);

    expect(result).toBe(code);
  });

  /** A unit served as one thing and labelled as another showed a Fahrenheit number under a Celsius letter. */
  test.each([
    [{ temperature: '°C' }, 'temperature', { value: 20, unit: '°C' }, '20°C'],
    [{ temperature: '°F' }, 'temperature', { value: 68, unit: '°F' }, '68°F'],
    [{ windSpeed: 'km/h' }, 'wind_speed', { value: 36, unit: 'km/h' }, '36 km/h'],
    [{ windSpeed: 'mph' }, 'wind_speed', { value: 36 / 1.609344, unit: 'mph' }, '22 mph'],
    [{ windSpeed: 'm/s' }, 'wind_speed', { value: 10, unit: 'm/s' }, '10 m/s'],
    [{ windSpeed: 'knots' }, 'wind_speed', { value: 36 / 1.852, unit: 'knots' }, '19 knots'],
    [{ pressure: 'hPa' }, 'pressure', { value: 1016, unit: 'hPa' }, '1016 hPa'],
    [{ pressure: 'inHg' }, 'pressure', { value: 1016 * 0.0295299830714, unit: 'inHg' }, '30.00 inHg'],
  ] as const)('serves %o as its number and its label', (units, name, number, label) => {
    const reading = { ...readings('openmeteo')[0], temperature: 20, windSpeed: 36, pressure: 1016 };
    const served = locationInstance(reading, PLACE, { ...DEFAULT_UNITS, ...units } as WeatherUnits, [name], NOW * 1000)?.properties?.[name];

    const result = [served?.numericValue?.unit, served?.numericValue?.value, served?.shortText?.text];

    expect(result[0]).toBe(number.unit);
    expect(result[1]).toBeCloseTo(number.value, 9);
    expect(result[2]).toBe(label);
  });
});

describe('the declaration', () => {
  /** A series under a name without its prefix, or a single value under one with, broke every face that reads the names by their prefix. */
  test('names every series hourly_ or daily_, and nothing else', () => {
    const result = Object.entries(WEATHER_LOCATION_SOURCE.properties).filter(([name, shapes]) => /^(hourly|daily)_/.test(name) !== shapes.every((shape) => shape.startsWith('series.')));

    expect(result).toEqual([]);
  });

  /** A property declared but never sent, or sent in a shape the declaration leaves out, is one a face asks for and never gets. */
  test('sends every declared property in the declared shapes', () => {
    const instance = locationInstance(readings('openmeteo')[0], PLACE, DEFAULT_UNITS, Object.keys(WEATHER_LOCATION_SOURCE.properties), NOW * 1000) as SourceInstance;
    const sent = Object.fromEntries(Object.entries(instance.properties as Record<string, SourceProperty>).map(([name, property]) => {
      const shapes = property.series ? Object.keys(property.series).filter((key) => key !== 'start' && key !== 'stepSec').map((key) => `series.${key}`) : Object.keys(property);

      return [name, shapes.sort()];
    }));

    const result = Object.fromEntries(Object.entries(WEATHER_LOCATION_SOURCE.properties).map(([name, shapes]) => [name, [...shapes].sort()]));

    expect(sent).toEqual(result);
  });
});

describe('weatherLocations', () => {
  /** A runtime whose Preferences plugin answers with one update or refuses. */
  function fakePebble(answer: SourceEnvelope | Error): PluginPebble {
    return {
      subscribeSource: (_request: SourceRequest) => {},
      readSource: async () => {
        if (answer instanceof Error) {
          throw answer;
        }

        return answer;
      },
    } as unknown as PluginPebble;
  }

  /** A place as the Preferences plugin serves it, with coordinates or without. */
  function place(key: string, name: string, coords: typeof DELHI | null, current = false): SourceInstance {
    return {
      instanceId: key,
      properties: {
        name: { shortText: { text: name } },
        ...(coords ? { latitude: { numericValue: { value: coords.lat } }, longitude: { numericValue: { value: coords.lon } } } : {}),
        current: { boolean: { value: current } },
      },
    };
  }

  /**
   * The Pebble app shows the first place on the watch, so the order has to stay the wearer's. A current
   * location with no fix yet has no coordinates and cannot be fetched this run.
   */
  test('keeps the wearer order and leaves out a place with no coordinates', async () => {
    const update = { instances: [place('b', 'Here', null, true), place('a', 'Delhi', DELHI), place('c', 'Honolulu', HONOLULU)] };

    const result = (await weatherLocations(fakePebble(update))).places.map((entry) => [entry.key, entry.name, entry.current]);

    expect(result).toEqual([
      ['a', 'Delhi', false],
      ['c', 'Honolulu', false],
    ]);
  });

  /** A refused read has to say why, or a plugin cannot tell a wearer who has not allowed Location from one with no places. */
  test('hands back no places and the reason for a refused read', async () => {
    const refusal = Object.assign(new Error('refused'), { code: 'PERMISSION_DENIED' });

    const result = await weatherLocations(fakePebble(refusal));

    expect(result).toEqual({ places: [], error: 'PERMISSION_DENIED' });
  });
});

describe('unitsFrom', () => {
  /** The Pebble app's preferences as its Preferences plugin serves them. */
  const PREFERENCES = { instances: [{ instanceId: 'units', properties: { temperature: { shortText: { text: '°F' } }, wind_speed: { shortText: { text: 'm/s' } }, pressure: { shortText: { text: 'inHg' } } } }] };

  /** A plugin's own unit setting has to win where it made one, and the Pebble app's where it follows. */
  test('follows the Pebble app where the plugin says app, and takes the plugin choice otherwise', () => {
    const result = unitsFrom(PREFERENCES, { temperature: 'app', windSpeed: 'knots' });

    expect(result).toEqual({ temperature: '°F', windSpeed: 'knots', pressure: 'inHg' });
  });

  /** A unit the Pebble app cannot read, such as kph, made it drop the run's weather for every place, and F served Celsius under a Fahrenheit name. */
  test('follows the Pebble app for a choice that is not one of its units', () => {
    const result = unitsFrom(PREFERENCES, { temperature: 'F', windSpeed: 'kph', pressure: 'mb' } as never);

    expect(result).toEqual({ temperature: '°F', windSpeed: 'm/s', pressure: 'inHg' });
  });

  /** A Pebble app that gives no units, or a read it refused, must not leave the plugin with no unit to serve in. */
  test('falls back to °C, km/h, and hPa when the Pebble app gives nothing', () => {
    const result = unitsFrom(null);

    expect(result).toEqual(DEFAULT_UNITS);
  });
});

describe('readPebbleAppUnits', () => {
  /** A runtime whose Preferences plugin answers the units with one update or refuses. */
  function unitsPebble(answer: SourceEnvelope | Error): PluginPebble {
    return {
      readSource: async () => {
        if (answer instanceof Error) {
          throw answer;
        }

        return answer;
      },
    } as unknown as PluginPebble;
  }

  /** The Pebble app's units as its Preferences plugin serves them, in °C. */
  const CELSIUS = { instances: [{ instanceId: 'units', properties: { temperature: { shortText: { text: '°C' } }, wind_speed: { shortText: { text: 'km/h' } }, pressure: { shortText: { text: 'hPa' } } } }] };

  /** A refused read answered as °C showed a wearer on °F the wrong unit as the Pebble app's own. */
  test('reports a refused read rather than answering the defaults', async () => {
    const result = await readPebbleAppUnits(unitsPebble(Object.assign(new Error('refused'), { code: 'PERMISSION_DENIED' })));

    expect(result).toEqual({ units: null, error: 'PERMISSION_DENIED' });
  });

  /** A reply with no units in it says nothing about the wearer's, so it must not read as °C either. */
  test.each([
    ['no instances', { instances: [] }],
    ['an instance with no units', { instances: [{ instanceId: 'units', properties: { locale: { shortText: { text: 'en-CA' } } } }] }],
  ])('reports a reply with %s', async (_label, envelope) => {
    const result = await readPebbleAppUnits(unitsPebble(envelope));

    expect(result).toEqual({ units: null, error: NO_UNITS });
  });

  /** A wearer really on °C has to read as the Pebble app's own units, told apart from a refusal. */
  test('answers a real °C as units', async () => {
    const result = await readPebbleAppUnits(unitsPebble(CELSIUS));

    expect(result).toEqual({ units: { temperature: '°C', windSpeed: 'km/h', pressure: 'hPa' } });
  });

  /** Serving has to send some unit, so a refusal there still serves the defaults under the plugin's own choices. */
  test('keeps pebbleAppUnits serving the defaults on a refusal', async () => {
    const result = await pebbleAppUnits(unitsPebble(new Error('refused')), { windSpeed: 'knots' });

    expect(result).toEqual({ ...DEFAULT_UNITS, windSpeed: 'knots' });
  });
});
