/**
 * Specs for the plugin weather mapping.
 *
 * A plugin update has to reach the watch as exactly the reading an Open-Meteo fetch gives, or a face
 * shows the wrong numbers with nothing to say why. The parts worth pinning are the ones a reader
 * cannot check by eye: the unit and wind conversions, the drop of a "no value" temperature, which
 * hour and which day the strips start on for a place in another zone, and the night check on epoch
 * seconds. The Pebble app's own unit, which a face with no unit setting shows, is read here too.
 *
 * Vitest runs every spec on a Toronto phone, so each fixture keeps the phone there and puts the
 * place somewhere else when a case needs two zones. Every moment is fixed. The usual now is
 * Wednesday 1 July 2026 at 12:20 in Toronto, which is on daylight time at UTC-4. The fixtures
 * follow the built-in weather plugin's shapes, with its °C temperatures, its mph wind, and series
 * starting on the place's midnight.
 */

import { describe, test, expect, vi, afterEach } from 'vitest';
import { appFahrenheit, weatherFromUpdate, weatherProperties } from './weather';
import type { WeatherMappingOptions } from './weather';
import type { SourceEnvelope, SourceProperty } from './types';

const BUILT_IN = '00000000-0000-0000-0001-000000000002';
const HOUR = 60 * 60;
const DAY = 24 * HOUR;

/** Epoch seconds for a moment given in UTC. */
function utc(month: number, day: number, hour: number, minute = 0): number {
  return Date.UTC(2026, month - 1, day, hour, minute) / 1000;
}

// Wednesday 1 July 2026, 12:20 in Toronto
const NOW = utc(7, 1, 16, 20);

// midnight starting 1 July in each place the fixtures use
const TORONTO_MIDNIGHT = utc(7, 1, 4);
const VANCOUVER_MIDNIGHT = utc(7, 1, 7);

const ALL_FIELDS = ['humidity', 'windKmh', 'windDir', 'sunrise', 'sunset', 'uvIndex', 'feelsLike', 'pressure', 'dewPoint', 'tempMax', 'tempMin', 'precipChance'];

/** The options a °C face showing every reading and no strips hands the mapping, at now. */
function options(overrides: Partial<WeatherMappingOptions> = {}): WeatherMappingOptions {
  return { fahrenheit: false, nowSeconds: NOW, fields: ALL_FIELDS, wantForecast: false, ...overrides };
}

/** A temperature as the built-in serves it, in all three shapes. */
function temperature(value: number, unit = '°C'): SourceProperty {
  return { shortText: { text: `${value}${unit}` }, longText: { text: `${value}${unit}` }, numericValue: { value, unit } };
}

/** A property carrying only a series. */
function series(start: number, stepSec: number, shapes: Record<string, unknown>): SourceProperty {
  return { series: { start, stepSec, ...shapes } };
}

/** The sun series for eight days from a place's midnight, at the given seconds after each midnight. */
function sunSeries(start: number, afterMidnight: number): SourceProperty {
  return series(start, DAY, { timestamp: { values: Array.from({ length: 8 }, (_, day) => start + day * DAY + afterMidnight) } });
}

interface PlaceSetup {
  name: string;
  /** The place's midnight the series start on. */
  start: number;
  /** The place's utc offset in minutes, or null to leave it off. */
  offsetMinutes: number | null;
  /** Sunrise and sunset as seconds after the place's midnight. */
  sunrise: number;
  sunset: number;
}

const TORONTO: PlaceSetup = { name: 'Toronto', start: TORONTO_MIDNIGHT, offsetMinutes: -240, sunrise: 5 * HOUR + 41 * 60, sunset: 20 * HOUR + 55 * 60 };

/**
 * One place in the built-in's shape: the current reading, today's extras, the sun, and the strips.
 * The hourly temperature at each point is its index, so a column's reading says which hour it read.
 */
function place(setup: PlaceSetup = TORONTO): Record<string, SourceProperty> {
  const properties: Record<string, SourceProperty> = {
    name: { shortText: { text: setup.name } },
    temperature: temperature(21.4),
    feels_like: temperature(23.6),
    high: temperature(26),
    low: temperature(15),
    condition: { shortText: { text: 'Partly cloudy' }, longText: { text: 'Mostly cloudy w/ showers' } },
    condition_code: { longText: { text: 'partly_cloudy' } },
    uv_index: { numericValue: { value: 5.3, min: 0, max: 11 }, shortText: { text: '5' } },
    precipitation: { numericValue: { value: 40, unit: '%', min: 0, max: 100 }, shortText: { text: '40%' } },
    wind_speed: { numericValue: { value: 10, unit: 'mph' }, shortText: { text: '16 km/h' } },
    wind_direction: { numericValue: { value: 225, unit: '°', min: 0, max: 360 } },
    humidity: { numericValue: { value: 64.6, unit: '%', min: 0, max: 100 }, shortText: { text: '65%' } },
    sunrise: { timestamp: { value: setup.start + setup.sunrise } },
    sunset: { timestamp: { value: setup.start + setup.sunset } },
    hourly_temperature: series(setup.start, HOUR, { numericValue: { values: Array.from({ length: 48 }, (_, hour) => hour), unit: '°C' } }),
    hourly_condition_code: series(setup.start, HOUR, { longText: { values: Array.from({ length: 48 }, () => 'cloudy') } }),
    daily_high: series(setup.start, DAY, { numericValue: { values: [26, 27, 28, 29, 30, 31, 32, 33], unit: '°C' } }),
    daily_low: series(setup.start, DAY, { numericValue: { values: [15, 16, 17, 18, 19, 20, 21, 22], unit: '°C' } }),
    daily_condition_code: series(setup.start, DAY, {
      longText: { values: ['sun', 'partly_cloudy', 'cloudy', 'light_rain', 'heavy_rain', 'light_snow', 'heavy_snow', 'rain_and_snow'] },
    }),
    daily_sunrise: sunSeries(setup.start, setup.sunrise),
    daily_sunset: sunSeries(setup.start, setup.sunset),
  };

  if (setup.offsetMinutes !== null) {
    properties.utc_offset = { numericValue: { value: setup.offsetMinutes, unit: 'min' } };
  }

  return properties;
}

/** An update from the built-in plugin carrying the given places, first one first. */
function update(...places: Record<string, SourceProperty | undefined>[]): SourceEnvelope {
  return {
    pluginUuid: BUILT_IN,
    validUntilMs: null,
    instances: places.map((properties, index) => ({ instanceId: String(index), properties })),
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('weatherFromUpdate', () => {
  /** The first place is the one the face shows, so every reading it carries has to land on its field. */
  test('reads the current reading and the extras off the first place', () => {
    const second = { ...place(), name: { shortText: { text: 'Montreal' } }, temperature: temperature(5) };

    const result = weatherFromUpdate(update(place(), second), options());

    expect(result).toEqual({
      temperature: 21,
      condition: 'PCLDY',
      location: 'Toronto',
      ok: true,
      conditionLabel: 'Partly cloudy',
      humidity: 65,
      windKmh: 16,
      windDir: 'SW',
      sunrise: 341,
      sunset: 1255,
      uvIndex: 5,
      feelsLike: 24,
      tempMax: 26,
      tempMin: 15,
      precipChance: 40,
    });
  });

  /** Each of the plugin's condition codes has to pick the glyph nearest its sky, and a code we do not know has to fall back. */
  test.each([
    ['sun', 'CLEAR'],
    ['partly_cloudy', 'PCLDY'],
    ['cloudy', 'CLDY'],
    ['light_rain', 'DRZL'],
    ['heavy_rain', 'RAIN'],
    ['light_snow', 'SNOW'],
    ['heavy_snow', 'SNOW'],
    ['rain_and_snow', 'FZRN'],
    ['unknown', 'UNKNOWN'],
    ['tornado', 'UNKNOWN'],
  ])('maps the condition code %s to %s', (code, token) => {
    const properties = { ...place(), condition_code: { longText: { text: code } } };

    const result = weatherFromUpdate(update(properties), options());

    expect(result.condition).toBe(token);
  });

  /** The face's own unit wins, so a °F plugin reading has to be converted for a °C face rather than shown as 70°C. */
  test('converts a °F reading for a °C face', () => {
    const properties = { ...place(), temperature: temperature(70, '°F') };

    const result = weatherFromUpdate(update(properties), options());

    expect(result.temperature).toBe(21);
  });

  /** The same the other way, since the watch holds the face's unit and converts nothing it is sent. */
  test('converts a °C reading for a °F face', () => {
    const properties = { ...place(), temperature: temperature(21, '°C') };

    const result = weatherFromUpdate(update(properties), options({ fahrenheit: true }));

    expect(result.temperature).toBe(70);
  });

  /** The built-in says "no value" with 32767, and clamping that would show a high of 199 where a dash belongs. */
  test('leaves out a temperature outside -99 to 199', () => {
    const properties = { ...place(), high: temperature(32767) };

    const result = weatherFromUpdate(update(properties), options());

    expect(result).not.toHaveProperty('tempMax');
  });

  /** The built-in always sends wind in mph whatever the wearer picked, and the watch takes km/h. */
  test.each([
    ['mph', 10, 16],
    ['km/h', 20, 20],
    ['m/s', 5, 18],
    ['kn', 10, 19],
  ])('converts wind in %s to km/h', (unit, value, kmh) => {
    const properties = { ...place(), wind_speed: { numericValue: { value, unit } } };

    const result = weatherFromUpdate(update(properties), options());

    expect(result.windKmh).toBe(kmh);
  });

  /** A wind speed in a unit we cannot convert is left out rather than sent as if it were km/h. */
  test('leaves out wind in a unit it does not know', () => {
    const properties = { ...place(), wind_speed: { numericValue: { value: 10, unit: 'beaufort' } } };

    const result = weatherFromUpdate(update(properties), options());

    expect(result).not.toHaveProperty('windKmh');
  });

  /** A plugin's "no value" in any extra has to leave that readout on its dash, not show 32767. */
  test.each([
    ['humidity', 'humidity', '%'],
    ['precipitation', 'precipChance', '%'],
    ['uv_index', 'uvIndex', undefined],
    ['wind_direction', 'windDir', '°'],
    ['wind_speed', 'windKmh', 'mph'],
  ])('leaves out a %s of 32767', (name, field, unit) => {
    const properties = { ...place(), [name]: { numericValue: { value: 32767, unit } } };

    const result = weatherFromUpdate(update(properties), options());

    expect(result).not.toHaveProperty(field);
  });

  /** A reading outside the min and max its plugin sends with it is bad data, even inside the bounds the field can hold. */
  test('leaves out a reading outside the bounds its plugin sends', () => {
    const properties = { ...place(), precipitation: { numericValue: { value: 80, unit: '%', min: 0, max: 50 } } };

    const result = weatherFromUpdate(update(properties), options());

    expect(result).not.toHaveProperty('precipChance');
  });

  /**
   * Bounds on the current temperature may only be the ends of a gauge, and a reading past them
   * would otherwise turn the whole face to No Wx Data on a hot day.
   */
  test('keeps a temperature past the bounds its plugin sends', () => {
    const properties = { ...place(), temperature: { numericValue: { value: 35, unit: '°C', min: -10, max: 30 } } };

    const result = weatherFromUpdate(update(properties), options());

    expect(result.temperature).toBe(35);
  });

  /** The built-in's UV max of 11 is the top of its gauge, and a real UV of 12 on a summer day has to still show. */
  test('keeps a UV past the top of the built-in gauge', () => {
    const properties = { ...place(), uv_index: { numericValue: { value: 12, min: 0, max: 11 } } };

    const result = weatherFromUpdate(update(properties), options());

    expect(result.uvIndex).toBe(12);
  });

  /**
   * A series start no Date can hold would throw partway through the mapping, and the watch would
   * get nothing. The series reads as missing instead, so the daily strip is left off and the hourly
   * one goes blank.
   */
  test.each([
    ['1e13', 1e13],
    ['NaN', NaN],
  ])('treats a series starting at %s as missing', (label, start) => {
    const broken = place({ ...TORONTO, start });

    const result = weatherFromUpdate(update(broken), options({ wantForecast: true }));

    expect(result).toMatchObject({ temperature: 21, ok: true });
    expect(result).not.toHaveProperty('forecastDaily');
    expect(result.forecastHourly?.cols.every((col) => col.code === 255 && col.temp === null)).toBe(true);
  });

  /** A sunrise no Date can hold is bad data, and the readout has to stay on its dash. */
  test('leaves out a sunrise no Date can hold', () => {
    const properties: Record<string, SourceProperty | undefined> = { ...place(), daily_sunrise: undefined, sunrise: { timestamp: { value: 1e13 } } };

    const result = weatherFromUpdate(update(properties), options());

    expect(result).not.toHaveProperty('sunrise');
  });

  /**
   * The watch keeps the phone's clock. Vancouver's sunrise at 05:15 its own time is 08:15 on a
   * Toronto phone, and reading it on the place's clock would put it three hours early.
   */
  test('reads a sunrise in another zone on the phone clock', () => {
    const vancouver = place({ name: 'Vancouver', start: VANCOUVER_MIDNIGHT, offsetMinutes: -420, sunrise: 5 * HOUR + 15 * 60, sunset: 21 * HOUR + 10 * 60 });

    const result = weatherFromUpdate(update(vancouver), options());

    expect(result.sunrise).toBe(495);
  });

  /** A plugin without the sun series still has its single sunrise read, rather than the readout going blank. */
  test('falls back to the single sunrise without the sun series', () => {
    const properties: Record<string, SourceProperty | undefined> = { ...place(), daily_sunrise: undefined };

    const result = weatherFromUpdate(update(properties), options());

    expect(result.sunrise).toBe(341);
  });

  /** A reading the face has no key for is left off, so the result only carries what was asked for. */
  test('leaves out the readings the face does not show', () => {
    const result = weatherFromUpdate(update(place()), options({ fields: ['humidity'] }));

    expect(result).toEqual({ temperature: 21, condition: 'PCLDY', location: 'Toronto', ok: true, conditionLabel: 'Partly cloudy', humidity: 65 });
  });

  /** A plugin that leaves a reading out leaves that readout on its dash, not on a zero. */
  test('leaves out every reading the plugin does not send', () => {
    const properties = { temperature: temperature(21.4), condition_code: { longText: { text: 'cloudy' } } };

    const result = weatherFromUpdate(update(properties), options({ wantForecast: true }));

    expect(result).toEqual({ temperature: 21, condition: 'CLDY', location: '', ok: true });
  });

  /** Nothing to show has to read as a status the watch can draw, never as a 0° reading. */
  test.each([
    ['an update with no places', { pluginUuid: BUILT_IN, instances: [] }],
    ['an update with no list', { pluginUuid: BUILT_IN }],
    ['no update at all', null],
  ])('gives No Location for %s', (label, envelope) => {
    const result = weatherFromUpdate(envelope as SourceEnvelope | null, options());

    expect(result).toEqual({ temperature: 0, condition: 'NO LOCATION', location: '', ok: false });
  });

  /** A plugin with its own names, or one sending only text, would otherwise show a reading of nothing. */
  test.each([
    ['no temperature', undefined],
    ['a text only temperature', { shortText: { text: '21°C' } }],
    ['a temperature with no unit', { numericValue: { value: 21 } }],
    ['a "no value" temperature', temperature(32767)],
  ])('gives No Wx Data for %s', (label, reading) => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const properties = { ...place(), temperature: reading };

    const result = weatherFromUpdate(update(properties), options());

    expect(result).toEqual({ temperature: 0, condition: 'NO WX DATA', location: '', ok: false });
  });

  /** The log is the only place the wearer's helper learns which plugin sent what. */
  test('logs the plugin and its properties when no temperature can be used', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const envelope = { pluginUuid: 'met-norway', instances: [{ properties: { temp: temperature(21), condition_code: { longText: { text: 'sun' } } } }] };

    weatherFromUpdate(envelope, options());

    expect(log).toHaveBeenCalledWith(expect.stringContaining('met-norway'));
    expect(log).toHaveBeenCalledWith(expect.stringContaining('temp, condition_code'));
  });

  /** A face that shows no strips must not pay for packing them. */
  test('leaves the strips off a face that does not show them', () => {
    const result = weatherFromUpdate(update(place()), options());

    expect(result).not.toHaveProperty('forecastHourly');
    expect(result).not.toHaveProperty('forecastDaily');
  });
});

describe('weatherFromUpdate night check', () => {
  // Tokyo is 13 hours ahead of Toronto. its 1 July starts at 15:00 UTC on 30 June, the sun comes up
  // at 04:30 its time and goes down at 19:00. on the phone's clock that is a sunrise at 15:30 and a
  // sunset at 06:00, so minutes past the phone's midnight put the sunrise after the sunset
  const tokyo = place({ name: 'Tokyo', start: utc(6, 30, 15), offsetMinutes: 540, sunrise: 4 * HOUR + 30 * 60, sunset: 19 * HOUR });
  const clear = { ...tokyo, condition_code: { longText: { text: 'sun' } }, condition: { shortText: { text: 'Sunny' } } };

  /**
   * Tokyo noon is 23:00 the night before in Toronto. A check on the phone's minutes would call the
   * sunny noon night and draw a moon.
   */
  test('calls Tokyo noon day on a Toronto phone at 23:00', () => {
    const result = weatherFromUpdate(update(clear), options({ nowSeconds: utc(7, 1, 3) }));

    expect(result.condition).toBe('CLEAR');
  });

  /** Tokyo at 22:00 is 09:00 in Toronto, which a check on the phone's minutes would call day. */
  test('calls Tokyo at 22:00 night on a Toronto phone at 09:00', () => {
    const result = weatherFromUpdate(update(clear), options({ nowSeconds: utc(7, 1, 13) }));

    expect(result.condition).toBe('CLEAR_NIGHT');
  });

  /** A plugin without the sun series counts as day, so a clear sky never shows a moon by mistake. */
  test('counts as day without the sun series', () => {
    const properties: Record<string, SourceProperty | undefined> = { ...clear, daily_sunrise: undefined, daily_sunset: undefined };

    const result = weatherFromUpdate(update(properties), options({ nowSeconds: utc(7, 1, 13) }));

    expect(result.condition).toBe('CLEAR');
  });
});

describe('weatherFromUpdate label', () => {
  /** The token for rain and snow is FZRN, which on its own would read "Freezing Rain". */
  test('takes the condition shortText', () => {
    const properties = { ...place(), condition_code: { longText: { text: 'rain_and_snow' } }, condition: { shortText: { text: 'Rain and snow' } } };

    const result = weatherFromUpdate(update(properties), options());

    expect(result.conditionLabel).toBe('Rain and snow');
  });

  /** The longText is a forecast phrase of up to 32 characters, which the watch's 20 byte label would cut mid word. */
  test('never takes the condition longText', () => {
    const properties = { ...place(), condition: { longText: { text: 'Mostly cloudy w/ showers' } } };

    const result = weatherFromUpdate(update(properties), options());

    expect(result).not.toHaveProperty('conditionLabel');
  });

  /** The built-in calls a clear sky Sunny by night too, and the watch would show Sunny under a moon. */
  test('leaves out a label naming the sun after dark', () => {
    const properties = { ...place(), condition_code: { longText: { text: 'sun' } }, condition: { shortText: { text: 'Sunny' } } };

    const result = weatherFromUpdate(update(properties), options({ nowSeconds: utc(7, 2, 2) }));

    expect(result).not.toHaveProperty('conditionLabel');
  });

  /** The watch keeps 19 characters, and a label cut mid word reads as a typo. */
  test('cuts a long label at the last whole word', () => {
    const properties = { ...place(), condition: { shortText: { text: 'Thunderstorms nearby' } } };

    const result = weatherFromUpdate(update(properties), options());

    expect(result.conditionLabel).toBe('Thunderstorms');
  });

  /** A single word longer than the label has nowhere to break, so it is cut at 19 characters. */
  test('cuts a single long word at the label length', () => {
    const properties = { ...place(), condition: { shortText: { text: 'Superextraordinarystorm' } } };

    const result = weatherFromUpdate(update(properties), options());

    expect(result.conditionLabel).toBe('Superextraordinarys');
  });

  /** The watch fonts only carry ASCII, so an accented label would draw boxes. */
  test('flattens the label to ASCII', () => {
    const properties = { ...place(), condition: { shortText: { text: 'Pluie légère' } } };

    const result = weatherFromUpdate(update(properties), options());

    expect(result.conditionLabel).toBe('Pluie legere');
  });
});

describe('weatherFromUpdate hourly strip', () => {
  /**
   * Vancouver's series starts at its midnight, 03:00 in Toronto. At 12:20 in Toronto it is 09:20
   * there, so the strip starts on point 9. Reading values[0] would show the place's midnight.
   */
  test('starts on the hour that holds now for a place in another zone', () => {
    const vancouver = place({ name: 'Vancouver', start: VANCOUVER_MIDNIGHT, offsetMinutes: -420, sunrise: 5 * HOUR + 15 * 60, sunset: 21 * HOUR + 10 * 60 });

    const result = weatherFromUpdate(update(vancouver), options({ wantForecast: true }));

    expect(result.forecastHourly?.baseHour).toBe(12);
    expect(result.forecastHourly?.stepHours).toBe(2);
    expect(result.forecastHourly?.cols.map((col) => col.temp)).toEqual([9, 11, 13, 15, 17, 19, 21, 23]);
  });

  /** Each column after dark needs the night bit, or the evening columns draw a sun. Toronto sets at 20:55. */
  test('marks the columns after dark', () => {
    const result = weatherFromUpdate(update(place()), options({ wantForecast: true }));

    expect(result.forecastHourly?.cols.map((col) => col.code)).toEqual([2, 2, 2, 2, 2, 0x82, 0x82, 0x82]);
  });

  /**
   * The Pebble app fetched yesterday, so the 48 hours started at yesterday's midnight. At 20:30 the
   * strip starts on point 44, and the columns past the end keep their place with no reading.
   */
  test('leaves the columns past the end of a stale series blank', () => {
    const stale = place({ ...TORONTO, start: TORONTO_MIDNIGHT - DAY });

    const result = weatherFromUpdate(update(stale), options({ nowSeconds: utc(7, 2, 0, 30), wantForecast: true }));

    expect(result.forecastHourly?.cols).toEqual([
      { code: 2, temp: 44 },
      { code: 0x82, temp: 46 },
      { code: 255, temp: null },
      { code: 255, temp: null },
      { code: 255, temp: null },
      { code: 255, temp: null },
      { code: 255, temp: null },
      { code: 255, temp: null },
    ]);
  });

  /** A missing point is a reading the plugin did not have, so its column shows a dash rather than 0°. */
  test('leaves a null point blank', () => {
    const temps = Array.from({ length: 48 }, (_, hour): number | null => (hour === 14 ? null : hour));
    const codes = Array.from({ length: 48 }, (_, hour): string | null => (hour === 14 ? null : 'cloudy'));
    const properties = {
      ...place(),
      hourly_temperature: series(TORONTO_MIDNIGHT, HOUR, { numericValue: { values: temps, unit: '°C' } }),
      hourly_condition_code: series(TORONTO_MIDNIGHT, HOUR, { longText: { values: codes } }),
    };

    const result = weatherFromUpdate(update(properties), options({ wantForecast: true }));

    expect(result.forecastHourly?.cols[1]).toEqual({ code: 255, temp: null });
  });

  /**
   * A series that ended before now still sends a strip, every column blank from the phone's hour.
   * The watch replaces its strip with whatever reads clean, so leaving the strip off would keep
   * yesterday's hours on the panel.
   */
  test('sends a blank strip when the whole series is past', () => {
    const stale = place({ ...TORONTO, start: TORONTO_MIDNIGHT - 3 * DAY });

    const result = weatherFromUpdate(update(stale), options({ wantForecast: true }));

    expect(result.forecastHourly).toEqual({ baseHour: 12, stepHours: 2, cols: Array.from({ length: 8 }, () => ({ code: 255, temp: null })) });
  });

  /**
   * Toronto's clocks went back at 02:00 on 1 November, so 01:00 to 02:00 ran twice. At 01:30 in the
   * second of them, 06:30 UTC, the strip has to start at 06:00 UTC, two hours after the 04:00 UTC
   * midnight the series starts on. Starting at 05:00 UTC, the first 01:00, would show an hour gone.
   */
  test('starts on the current hour in the hour repeated when the clocks go back', () => {
    const autumn = place({ ...TORONTO, start: Date.UTC(2026, 10, 1, 4) / 1000 });

    const result = weatherFromUpdate(update(autumn), options({ nowSeconds: Date.UTC(2026, 10, 1, 6, 30) / 1000, wantForecast: true }));

    expect(result.forecastHourly?.baseHour).toBe(1);
    expect(result.forecastHourly?.cols[0].temp).toBe(2);
  });

  /**
   * Kolkata is on UTC+5:30, so its series points sit on Toronto's half hours. The columns have to
   * sit on the phone's hours, labelled 12, 14, and on, with each reading the Kolkata hour it falls
   * in. At 12:00 in Toronto it is 21:30 there, so the first column reads point 21. A strip on the
   * place's hours would label its first column 11 for 11:30.
   */
  test('puts the columns on the phone hours for a place on a half hour zone', () => {
    const kolkata = place({ name: 'Kolkata', start: utc(6, 30, 18, 30), offsetMinutes: 330, sunrise: 5 * HOUR + 25 * 60, sunset: 18 * HOUR + 50 * 60 });

    const result = weatherFromUpdate(update(kolkata), options({ wantForecast: true }));

    expect(result.forecastHourly?.baseHour).toBe(12);
    expect(result.forecastHourly?.cols.map((col) => col.temp)).toEqual([21, 23, 25, 27, 29, 31, 33, 35]);
  });
});

describe('weatherFromUpdate daily strip', () => {
  /** A place on the phone's own clock starts on today, with every column's high, low, and sky. */
  test('starts on today for a place in the phone zone', () => {
    const result = weatherFromUpdate(update(place()), options({ wantForecast: true }));

    expect(result.forecastDaily).toEqual({
      baseWeekday: 3,
      cols: [
        { code: 0, tempMax: 26, tempMin: 15 },
        { code: 1, tempMax: 27, tempMin: 16 },
        { code: 2, tempMax: 28, tempMin: 17 },
        { code: 4, tempMax: 29, tempMin: 18 },
        { code: 6, tempMax: 30, tempMin: 19 },
        { code: 8, tempMax: 31, tempMin: 20 },
        { code: 8, tempMax: 32, tempMin: 21 },
        { code: 7, tempMax: 33, tempMin: 22 },
      ],
    });
  });

  /**
   * Vancouver's series started on its Tuesday, which takes in Toronto's Wednesday midnight. The
   * strip still starts on Vancouver's Wednesday, the column after it, or every day would show the
   * day before's forecast. The fixture leaves the utc offset out, so the place's offset is worked
   * out from the series.
   */
  test('starts on the place date matching today for a place behind the phone', () => {
    const vancouver = place({ name: 'Vancouver', start: VANCOUVER_MIDNIGHT - DAY, offsetMinutes: null, sunrise: 5 * HOUR + 15 * 60, sunset: 21 * HOUR + 10 * 60 });

    const result = weatherFromUpdate(update(vancouver), options({ wantForecast: true }));

    expect(result.forecastDaily?.baseWeekday).toBe(3);
    expect(result.forecastDaily?.cols[0]).toEqual({ code: 1, tempMax: 27, tempMin: 16 });
    expect(result.forecastDaily?.cols).toHaveLength(7);
  });

  /**
   * Auckland is 16 hours ahead of Toronto, across the date line. At 12:20 on Wednesday in Toronto
   * it is already Thursday there, so the strip starts on Thursday and the watch holds it until then.
   * That far out the series alone cannot tell the offset, so the plugin's utc offset decides.
   */
  test('starts on the next day for a place across the date line', () => {
    const auckland = place({ name: 'Auckland', start: utc(7, 1, 12), offsetMinutes: 720, sunrise: 7 * HOUR + 30 * 60, sunset: 17 * HOUR });

    const result = weatherFromUpdate(update(auckland), options({ wantForecast: true }));

    expect(result.forecastDaily?.baseWeekday).toBe(4);
    expect(result.forecastDaily?.cols[0]).toEqual({ code: 0, tempMax: 26, tempMin: 15 });
  });

  /** A plugin sending fewer days gives a shorter strip, not columns of nothing. */
  test('stops where the series stop', () => {
    const properties = {
      ...place(),
      daily_high: series(TORONTO_MIDNIGHT, DAY, { numericValue: { values: [26, 27, 28], unit: '°C' } }),
      daily_low: series(TORONTO_MIDNIGHT, DAY, { numericValue: { values: [15, 16, 17], unit: '°C' } }),
      daily_condition_code: series(TORONTO_MIDNIGHT, DAY, { longText: { values: ['sun', 'sun', 'sun'] } }),
    };

    const result = weatherFromUpdate(update(properties), options({ wantForecast: true }));

    expect(result.forecastDaily?.cols).toHaveLength(3);
  });

  /** The built-in nulls a day's "no value" high, and that day has to show a dash, not 199. */
  test('leaves a missing high blank', () => {
    const properties = { ...place(), daily_high: series(TORONTO_MIDNIGHT, DAY, { numericValue: { values: [null, 27], unit: '°C' } }) };

    const result = weatherFromUpdate(update(properties), options({ wantForecast: true }));

    expect(result.forecastDaily?.cols[0]).toEqual({ code: 0, tempMax: null, tempMin: 15 });
  });
});

describe('weatherProperties', () => {
  /** The night check reads the sun series even for a face with no sun readout, so they are always asked for. */
  test('always asks for the reading, the sky, and the sun', () => {
    const result = weatherProperties([], false);

    expect(result).toEqual(['name', 'temperature', 'condition', 'condition_code', 'sunrise', 'sunset', 'daily_sunrise', 'daily_sunset', 'utc_offset']);
  });

  /** Asking for less than the face shows loses data, since the plugin may skip what it was not asked for. */
  test('adds the property behind each reading the face shows', () => {
    const result = weatherProperties(['humidity', 'windKmh', 'windDir', 'uvIndex', 'feelsLike', 'tempMax', 'tempMin', 'precipChance', 'pressure', 'dewPoint'], false);

    expect(result.slice(9)).toEqual(['humidity', 'wind_speed', 'wind_direction', 'uv_index', 'feels_like', 'high', 'low', 'precipitation']);
  });

  /** The built-in builds its series only when asked, so a face with the strips must name them. */
  test('adds the forecast series for a face with the strips', () => {
    const result = weatherProperties(['sunrise'], true);

    expect(result).toEqual([
      'name',
      'temperature',
      'condition',
      'condition_code',
      'sunrise',
      'sunset',
      'daily_sunrise',
      'daily_sunset',
      'utc_offset',
      'hourly_temperature',
      'hourly_condition_code',
      'daily_high',
      'daily_low',
      'daily_condition_code',
    ]);
  });
});

/** One update from the Pebble app's `preferences/units`, the way its Preferences plugin sends it. */
function unitsUpdate(unit: unknown): SourceEnvelope {
  return {
    pluginUuid: '00000000-0000-0000-0001-000000000009',
    instances: [{ instanceId: 'units', properties: { temperature: { shortText: { text: unit } } as SourceProperty, wind_speed: { shortText: { text: 'km/h' } } } }],
  };
}

describe('appFahrenheit', () => {
  /** A face with no unit setting showing Celsius while the Pebble app says °F is the bug this reader stops. */
  test.each([
    ['°F', true],
    ['°C', false],
    [' ℉ ', true],
  ])('reads %s', (unit, expected) => {
    const result = appFahrenheit(unitsUpdate(unit));

    expect(result).toBe(expected);
  });

  /** An update that names no unit says nothing, so it must not flip the face to Celsius. */
  test.each([
    ['a unit it does not know', unitsUpdate('K')],
    ['no temperature text', unitsUpdate(42)],
    ['no instances', { instances: [] }],
    ['nothing at all', null],
  ])('says nothing for %s', (_label, envelope) => {
    const result = appFahrenheit(envelope as SourceEnvelope | null);

    expect(result).toBeUndefined();
  });
});
