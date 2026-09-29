/**
 * Deterministic specs for the Open-Meteo provider.
 *
 * The provider takes resolved coordinates only, so this is a single forecast
 * call whose parsing depends on util.wmoToCondition. The injected `request` is
 * stubbed and calls are recorded so the URL and sequencing can be asserted.
 */

import { describe, test, expect, vi, afterEach } from 'vitest';
import openmeteo from './openmeteo';
import util from '../util';
import conditions from '../conditions';
import { fetchRequest } from '../../testing/fetch-request';
import { routing } from '../../testing/routing';
import type { ForecastCols, RequestFn, WeatherOpts, WeatherResult } from '../util';

const FC = '/v1/forecast';

/** Runs the provider synchronously and returns the result object. */
function run(opts: WeatherOpts, request: RequestFn): WeatherResult {
  let result!: WeatherResult;
  openmeteo.fetch(opts, request, (received) => { result = received; });
  return result;
}

const COORDS = { key: '', coords: { lat: 40, lon: -73 }, fahrenheit: false, wantForecast: true };
const FC_OK = JSON.stringify({ current: { temperature_2m: 13.4, weather_code: 61 } });

// the phone's offset from UTC in minutes, pinned so a spec gives the same answer on any machine
const TORONTO_SUMMER = -240;
const TOKYO = 540;

/** Pins the phone's zone for one spec, whatever zone the machine running it is in. */
function onPhoneAt(offsetMinutes: number) {
  return vi.spyOn(util, 'phoneOffsetMinutes').mockReturnValue(offsetMinutes);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('parseExtras', () => {
  /**
   * Asked in New York's zone for a Tokyo phone past its midnight, the first day is New York's
   * Saturday, and the watch showed its high and low as the phone's Sunday.
   */
  test('reads the high and low from the phone today in the location zone', () => {
    onPhoneAt(TOKYO);
    const json = {
      utc_offset_seconds: -14400,
      current: { time: '2026-07-04T20:15' },
      daily: {
        time: ['2026-07-04', '2026-07-05'],
        temperature_2m_max: [30, 25], temperature_2m_min: [20, 15],
        precipitation_probability_max: [10, 60],
      },
    };

    const result = openmeteo.parseExtras(json);

    expect(result).toMatchObject({ tempMax: 25, tempMin: 15, precipChance: 60 });
  });

  /** A city already on the phone's tomorrow holds no reading for today, and tomorrow's is not today's. */
  test('leaves the high and low out when the location zone holds no phone today', () => {
    onPhoneAt(TORONTO_SUMMER);
    const json = {
      utc_offset_seconds: 32400,
      current: { time: '2026-07-05T09:15' },
      daily: { time: ['2026-07-05'], temperature_2m_max: [30], temperature_2m_min: [20], precipitation_probability_max: [10] },
    };

    const result = openmeteo.parseExtras(json);

    expect(result).toMatchObject({ tempMax: undefined, tempMin: undefined, precipChance: undefined });
  });

  /** The shared Open-Meteo extras map (also used by the OWM hybrid) must read each documented path, raw. */
  test('pulls uv, dew point and the daily forecast from a response', () => {
    const json = {
      current: { uv_index: 4.8, dew_point_2m: -2.4 },
      daily: {
        temperature_2m_max: [18.6], temperature_2m_min: [9.2],
        precipitation_probability_max: [80],
      },
    };

    const result = openmeteo.parseExtras(json);

    expect(result).toEqual({
      uvIndex: 4.8, dewPoint: -2.4, tempMax: 18.6, tempMin: 9.2,
      precipChance: 80,
    });
  });

  /** A missing or failed response must yield all-undefined extras, never throw on a null/empty body. */
  test.each([[{}], [null]])('returns undefined extras for an empty response (%s)', (json) => {
    const result = openmeteo.parseExtras(json);

    expect(result).toEqual({
      uvIndex: undefined, dewPoint: undefined, tempMax: undefined, tempMin: undefined,
      precipChance: undefined,
    });
  });
});

describe('extrasUrl', () => {
  /** OWM steals these extras from Open-Meteo, so the URL must request exactly the fields parseExtras reads, or a field goes fetched-but-unparsed or wanted-but-unfetched. */
  test('requests the current and daily fields parseExtras consumes', () => {
    const url = openmeteo.extrasUrl({ fahrenheit: false, coords: { lat: 40, lon: -73 } });

    expect(url).toContain('current=uv_index,dew_point_2m');
    expect(url).toContain('temperature_2m_max');
    expect(url).toContain('temperature_2m_min');
    expect(url).toContain('precipitation_probability_max');
    expect(url).toContain('latitude=40');
    expect(url).toContain('longitude=-73');
  });

  /** A wrong temperature_unit would return dew point and the daily high/low in the scale the user did not pick. */
  test.each([
    [false, 'temperature_unit=celsius'],
    [true, 'temperature_unit=fahrenheit'],
  ])('selects the temperature unit (fahrenheit=%s)', (fahrenheit, expected) => {
    const url = openmeteo.extrasUrl({ fahrenheit, coords: { lat: 40, lon: -73 } });

    expect(url).toContain(expected);
  });

  /** A forecast face fills its row from this one call, so the strip fields must ride along or OWM's row goes blank. */
  test('carries the forecast strip fields when the face wants a forecast', () => {
    const url = openmeteo.extrasUrl({ fahrenheit: false, coords: { lat: 40, lon: -73 }, wantForecast: true });

    expect(url).toContain('current=uv_index,dew_point_2m,temperature_2m');
    expect(url).toContain('hourly=temperature_2m,weather_code,is_day');
    expect(url).toContain('weather_code');
    expect(url).toContain('forecast_days=8');
  });

  /** Without forecast_hours the hourly block carries every hour of all eight days, 192 rows for a 16 hour strip. */
  test('trims the hourly block to the hours the strip reads', () => {
    const url = openmeteo.extrasUrl({ fahrenheit: false, coords: { lat: 40, lon: -73 }, wantForecast: true });

    expect(url).toContain('forecast_hours=16');
  });

  /** A plain reading face must not pay for the hourly block or the extra days it never shows. */
  test.each(['hourly=', 'forecast_days=', 'forecast_hours='])('omits %s when the face shows no forecast', (param) => {
    const url = openmeteo.extrasUrl({ fahrenheit: false, coords: { lat: 40, lon: -73 } });

    expect(url).not.toContain(param);
  });
});

describe('parseForecast', () => {
  /** The hourly row must start at the next slot from now, not midnight, or it shows stale past hours. */
  test('starts the hourly strip at the first slot at or after now', () => {
    const json = {
      current: { time: '2026-07-05T09:00' },
      hourly: {
        time: ['2026-07-05T07:00', '2026-07-05T08:00', '2026-07-05T09:00', '2026-07-05T10:00', '2026-07-05T11:00'],
        temperature_2m: [10, 11, 12, 13, 14],
        weather_code: [0, 0, 61, 0, 2],
      },
    };

    const result = openmeteo.parseForecast(json);

    expect(result.hourly.baseHour).toBe(9);
    expect(result.hourly.stepHours).toBe(2);
    // 09:00 then a 2-hour stride lands on 11:00
    expect(result.hourly.cols[0]).toEqual({ code: conditions.codeFor('RAIN'), temp: 12 });
    expect(result.hourly.cols[1]).toEqual({ code: conditions.codeFor('PCLDY'), temp: 14 });
  });

  /**
   * The trimmed block starts at the current hour, so half past the hour puts the first column one row
   * in. Sixteen rows must still reach the eighth column or the strip comes up short.
   */
  test('fills all eight columns from a trimmed block when now is past the hour', () => {
    const hours = Array.from({ length: 16 }, (unused, index) => index + 8);
    const json = {
      current: { time: '2026-07-05T08:30' },
      hourly: {
        time: hours.map((hour) => `2026-07-05T${String(hour).padStart(2, '0')}:00`),
        temperature_2m: hours,
        weather_code: hours.map(() => 0),
      },
    };

    const result = openmeteo.parseForecast(json);

    expect(result.hourly.baseHour).toBe(9);
    expect(result.hourly.cols).toHaveLength(8);
    expect(result.hourly.cols[7].temp).toBe(23);
  });

  /** An hour after dark must carry the night bit or the watch draws a sun at midnight. */
  test('sets the night bit on an hourly column whose is_day is 0', () => {
    const json = {
      current: { time: '2026-07-05T22:00' },
      hourly: {
        time: ['2026-07-05T22:00', '2026-07-05T23:00', '2026-07-06T00:00'],
        temperature_2m: [12, 11, 10],
        weather_code: [0, 0, 0],
        is_day: [0, 0, 0],
      },
    };

    const result = openmeteo.parseForecast(json);

    expect(result.hourly.cols[0].code).toBe(conditions.codeFor('CLEAR') | conditions.FORECAST_NIGHT_BIT);
  });

  /** A daytime column must stay a plain day code so it never shows a moon at noon. */
  test('leaves the night bit off an hourly column whose is_day is 1', () => {
    const json = {
      current: { time: '2026-07-05T12:00' },
      hourly: {
        time: ['2026-07-05T12:00'],
        temperature_2m: [20],
        weather_code: [0],
        is_day: [1],
      },
    };

    const result = openmeteo.parseForecast(json);

    expect(result.hourly.cols[0].code).toBe(conditions.codeFor('CLEAR'));
  });

  /** An unknown sky has no night glyph, so a night hour must leave conditions.UNKNOWN_CODE untouched. */
  test('never sets the night bit on an unknown-condition column', () => {
    const json = {
      current: { time: '2026-07-05T22:00' },
      hourly: {
        time: ['2026-07-05T22:00'],
        temperature_2m: [12],
        weather_code: [999],
        is_day: [0],
      },
    };

    const result = openmeteo.parseForecast(json);

    expect(result.hourly.cols[0].code).toBe(conditions.UNKNOWN_CODE);
  });

  /** A column with no temperature must ship null, not NaN, so the packer can flag it as no-reading. */
  test('yields a null temp for a missing hourly value', () => {
    const json = {
      current: { time: '2026-07-05T00:00' },
      hourly: { time: ['2026-07-05T00:00'], temperature_2m: [null], weather_code: [0] },
    };

    const result = openmeteo.parseForecast(json);

    expect(result.hourly.cols[0].temp).toBeNull();
  });

  /** The daily strip's base weekday drives every day label, so a wrong one mislabels the whole row. */
  test('reads the daily strip with its base weekday and highs/lows', () => {
    const json = {
      daily: {
        // 2026-07-04 is a Saturday (getUTCDay 6)
        time: ['2026-07-04', '2026-07-05'],
        temperature_2m_max: [25.4, 22.1],
        temperature_2m_min: [14.6, 13.2],
        weather_code: [0, 61],
      },
    };

    const result = openmeteo.parseForecast(json);

    expect(result.daily.baseWeekday).toBe(6);
    expect(result.daily.cols[0]).toEqual({ code: conditions.codeFor('CLEAR'), tempMax: 25, tempMin: 15 });
    expect(result.daily.cols[1]).toEqual({ code: conditions.codeFor('RAIN'), tempMax: 22, tempMin: 13 });
  });

  /** The 2x4 layout stacks two rows of four, so the daily strip must fill all eight columns, or the second row on the watch stays blank. */
  test('fills up to eight daily columns', () => {
    const days = Array.from({ length: 10 }, (unused, day) => `2026-07-${String(4 + day).padStart(2, '0')}`);
    const json = {
      daily: {
        time: days,
        temperature_2m_max: days.map(() => 20),
        temperature_2m_min: days.map(() => 10),
        weather_code: days.map(() => 0),
      },
    };

    const result = openmeteo.parseForecast(json);

    expect(result.daily.cols).toHaveLength(8);
  });

  /** The hourly strip feeds the same eight-column stack, striding two hours per column. */
  test('fills up to eight hourly columns at the two-hour step', () => {
    const hours = Array.from({ length: 24 }, (unused, hour) => `2026-07-05T${String(hour).padStart(2, '0')}:00`);
    const json = {
      current: { time: '2026-07-05T00:00' },
      hourly: {
        time: hours,
        temperature_2m: hours.map(() => 15),
        weather_code: hours.map(() => 0),
      },
    };

    const result = openmeteo.parseForecast(json);

    expect(result.hourly.cols).toHaveLength(8);
    // eighth column is seven two-hour strides on from midnight
    expect(result.hourly.baseHour).toBe(0);
  });

  /** A response with no hourly/daily blocks must yield null strips, never throw. */
  test('returns null strips when the forecast blocks are absent', () => {
    const result = openmeteo.parseForecast({ current: { temperature_2m: 5 } });

    expect(result.hourly).toBeNull();
    expect(result.daily).toBeNull();
  });

  /** An unreadable base timestamp would mislabel the whole strip, so it must drop rather than ship a bogus base. */
  test('drops the hourly strip when the base hour is unreadable', () => {
    const json = {
      current: { time: '' },
      hourly: { time: ['not-a-time'], temperature_2m: [12], weather_code: [0] },
    };

    const result = openmeteo.parseForecast(json);

    expect(result.hourly).toBeNull();
  });

  /** Same for the daily strip: an unreadable base weekday must drop the strip. */
  test('drops the daily strip when the base weekday is unreadable', () => {
    const json = {
      daily: { time: ['not-a-date'], temperature_2m_max: [20], temperature_2m_min: [10], weather_code: [0] },
    };

    const result = openmeteo.parseForecast(json);

    expect(result.daily).toBeNull();
  });
});

describe('parseForecast in the location zone', () => {
  /**
   * The bug this pins. Asked in Tokyo's zone for a phone in Toronto, the strip came back on Tokyo's
   * clock, so the watch placed its first column most of a day ahead and never aged it.
   */
  test('moves the hourly base hour onto the phone clock', () => {
    const spy = onPhoneAt(TORONTO_SUMMER);
    const json = {
      utc_offset_seconds: 32400,
      current: { time: '2026-07-05T09:15' },
      hourly: {
        time: ['2026-07-05T09:00', '2026-07-05T10:00', '2026-07-05T11:00'],
        temperature_2m: [20, 21, 22],
        weather_code: [0, 61, 0],
      },
    };

    const result = openmeteo.parseForecast(json);

    expect(result.hourly.baseHour).toBe(21);
    expect(result.hourly.cols[0]).toEqual({ code: conditions.codeFor('RAIN'), temp: 21 });
    expect(spy).toHaveBeenCalledWith(Date.UTC(2026, 6, 5, 0, 15));
  });

  /** A Saturday the Tokyo phone has finished with sat on the watch as six days ahead and never aged. */
  test('drops the daily days the phone has already finished with', () => {
    onPhoneAt(TOKYO);
    const json = {
      utc_offset_seconds: -14400,
      current: { time: '2026-07-04T20:15' },
      daily: { time: ['2026-07-04', '2026-07-05', '2026-07-06'], weather_code: [0, 61, 0] },
    };

    const result = openmeteo.parseForecast(json);

    expect(result.daily.baseWeekday).toBe(0);
    expect(result.daily.cols).toHaveLength(2);
    expect(result.daily.cols[0].code).toBe(conditions.codeFor('RAIN'));
  });

  /** A city a day ahead starts on the phone's tomorrow, and the watch holds that whole until then. */
  test('keeps a strip that starts on the phone tomorrow', () => {
    onPhoneAt(TORONTO_SUMMER);
    const json = {
      utc_offset_seconds: 32400,
      current: { time: '2026-07-05T09:15' },
      daily: { time: ['2026-07-05', '2026-07-06'], weather_code: [0, 0] },
    };

    const result = openmeteo.parseForecast(json);

    expect(result.daily.baseWeekday).toBe(0);
    expect(result.daily.cols).toHaveLength(2);
  });

  /**
   * India's columns land at half past on a Toronto phone. Rounding up would label the first column
   * an hour after the watch's own hour, and the strip would age a column early.
   */
  test('rounds a half hour zone down to the hour', () => {
    onPhoneAt(TORONTO_SUMMER);
    const json = {
      utc_offset_seconds: 19800,
      current: { time: '2026-07-05T09:15' },
      hourly: { time: ['2026-07-05T10:00', '2026-07-05T11:00'], temperature_2m: [30, 31], weather_code: [0, 0] },
    };

    const result = openmeteo.parseForecast(json);

    expect(result.hourly.baseHour).toBe(0);
  });

  /** Asked in the phone's own zone, which is the usual case, the strip must come through untouched. */
  test('leaves a response in the phone zone alone', () => {
    onPhoneAt(TORONTO_SUMMER);
    const json = {
      utc_offset_seconds: -14400,
      current: { time: '2026-07-04T09:15' },
      hourly: { time: ['2026-07-04T10:00'], temperature_2m: [20], weather_code: [0] },
      daily: { time: ['2026-07-04', '2026-07-05'], weather_code: [0, 0] },
    };

    const result = openmeteo.parseForecast(json);

    expect(result.hourly.baseHour).toBe(10);
    expect(result.daily.baseWeekday).toBe(6);
    expect(result.daily.cols).toHaveLength(2);
  });
});

describe('openmeteo provider', () => {
  describe('guard clauses', () => {
    /** With no coordinates there is nothing to look up. */
    test('reports No Location when coords are missing', () => {
      const calls: string[] = [];

      const result = run({ key: '', coords: null, fahrenheit: false }, routing({}, calls));

      expect(result.condition).toBe('NO LOCATION');
      expect(calls).toHaveLength(0);
    });
  });

  describe('forecast request', () => {
    /** The forecast must query the supplied coords. A wrong URL reads the wrong place. */
    test('queries the forecast at the supplied coordinates', () => {
      const calls: string[] = [];

      run(COORDS, routing({ [FC]: { body: FC_OK } }, calls));

      expect(calls).toHaveLength(1);
      expect(calls[0]).toContain(FC);
      expect(calls[0]).toMatch(/latitude=40&longitude=-73/);
    });

    /** The forecast request must ask for is_day, else night can never be detected. */
    test('requests is_day in the forecast URL', () => {
      const calls: string[] = [];

      run(COORDS, routing({ [FC]: { body: FC_OK } }, calls));

      expect(calls[0]).toContain('is_day');
    });

    /** A face with no forecast row must not pay for the hourly block or the extra days. */
    test.each(['hourly=', 'forecast_days='])('omits %s when the face shows no forecast', (param) => {
      const calls: string[] = [];

      run({ ...COORDS, wantForecast: false }, routing({ [FC]: { body: FC_OK } }, calls));

      expect(calls[0]).not.toContain(param);
    });

    /**
     * Asked in the location's own zone, a manual city in another zone sent sunrise and the forecast's
     * first hour on its clock, and the watch read them hours off on its own.
     */
    test('asks in the phone zone when the options carry one', () => {
      const calls: string[] = [];

      run({ ...COORDS, zone: 'America/Toronto' }, routing({ [FC]: { body: FC_OK } }, calls));

      expect(calls[0]).toContain('timezone=America%2FToronto');
    });

    /** A zone name Open-Meteo does not know failed the whole request, so it asks again in the location's zone. */
    test('asks again in the location zone when the phone zone is refused', () => {
      const calls: string[] = [];
      const refused = JSON.stringify({ error: true, reason: 'Invalid timezone' });

      const result = run({ ...COORDS, zone: 'Mars/Base' }, routing({
        'timezone=Mars%2FBase': { body: refused },
        'timezone=auto': { body: FC_OK },
      }, calls));

      expect(calls).toHaveLength(2);
      expect(result.ok).toBe(true);
    });

    /** The extras (humidity, wind, sunrise/sunset) must be asked for, else they never arrive. */
    test.each([
      'relative_humidity_2m',
      'wind_speed_10m',
      'wind_direction_10m',
      'apparent_temperature',
      'pressure_msl',
      'dew_point_2m',
      'daily=sunrise,sunset',
      'temperature_2m_max',
      'temperature_2m_min',
      'precipitation_probability_max',
      'forecast_days=8',
      'wind_speed_unit=kmh',
      'timezone=auto',
    ])('requests %s in the forecast URL', (param) => {
      const calls: string[] = [];

      run(COORDS, routing({ [FC]: { body: FC_OK } }, calls));

      expect(calls[0]).toContain(param);
    });

    /** A wrong unit param shows Fahrenheit numbers labelled as Celsius (or vice-versa). */
    test.each([
      [false, 'temperature_unit=celsius'],
      [true, 'temperature_unit=fahrenheit'],
    ])('selects the temperature unit (fahrenheit=%s)', (fahrenheit, expected) => {
      const calls: string[] = [];

      run({ ...COORDS, fahrenheit }, routing({ [FC]: { body: FC_OK } }, calls));

      expect(calls[0]).toContain(expected);
    });
  });

  describe('successful reads', () => {
    /** The temperature must be read from the documented field and rounded. */
    test('returns the rounded forecast temperature', () => {
      const result = run(COORDS, routing({ [FC]: { body: FC_OK } }, []));

      expect(result.temperature).toBe(13);
    });

    /** Proves the provider reads `weather_code` and routes it through wmoToCondition.
     * The full code->word table is exercised exhaustively in util.spec.ts. */
    test('works out the condition from the forecast weather_code', () => {
      const body = JSON.stringify({ current: { temperature_2m: 5, weather_code: 61 } });

      const result = run(COORDS, routing({ [FC]: { body } }, []));

      expect(result.condition).toBe('RAIN');
    });

    /** WMO 1/2 are partly cloudy and must split to PCLDY (not lump into CLDY), so
     *  the watch can distinguish a few clouds from full overcast. */
    test('works out PCLDY from a partly-cloudy weather_code', () => {
      const body = JSON.stringify({ current: { temperature_2m: 5, weather_code: 2 } });

      const result = run(COORDS, routing({ [FC]: { body } }, []));

      expect(result.condition).toBe('PCLDY');
    });

    /** Every condition ships a night glyph, so a rainy night (is_day=0) must
     *  promote to RAIN_NIGHT, not keep the daytime rain icon. */
    test('promotes a non-clear condition to its night form when is_day is 0', () => {
      const body = JSON.stringify({ current: { temperature_2m: 5, weather_code: 61, is_day: 0 } });

      const result = run(COORDS, routing({ [FC]: { body } }, []));

      expect(result.condition).toBe('RAIN_NIGHT');
    });

    /** A clear sky at night (is_day=0) must report Clear Night so the watch shows a moon. */
    test('promotes a clear sky to Clear Night when is_day is 0', () => {
      const body = JSON.stringify({ current: { temperature_2m: 5, weather_code: 0, is_day: 0 } });

      const result = run(COORDS, routing({ [FC]: { body } }, []));

      expect(result.condition).toBe('CLEAR_NIGHT');
    });

    /** A clear sky by day (is_day=1) must stay Clear so the watch shows the sun. */
    test('keeps a clear sky as Clear when is_day is 1', () => {
      const body = JSON.stringify({ current: { temperature_2m: 5, weather_code: 0, is_day: 1 } });

      const result = run(COORDS, routing({ [FC]: { body } }, []));

      expect(result.condition).toBe('CLEAR');
    });

    /** A clear sky with no is_day field must default to day and stay Clear, never showing a moon. */
    test('keeps a clear sky as Clear when is_day is absent', () => {
      const body = JSON.stringify({ current: { temperature_2m: 5, weather_code: 0 } });

      const result = run(COORDS, routing({ [FC]: { body } }, []));

      expect(result.condition).toBe('CLEAR');
    });

    /** A coords reading with no label falls back to "My Location". */
    test('labels a reading My Location when no label is given', () => {
      const result = run(COORDS, routing({ [FC]: { body: FC_OK } }, []));

      expect(result.location).toBe('My Location');
    });

    /** A label (the geocoded place name) must be carried through to the watch. */
    test('uses the supplied label for the reading location', () => {
      const result = run({ ...COORDS, label: 'Phoenix' }, routing({ [FC]: { body: FC_OK } }, []));

      expect(result.location).toBe('Phoenix');
    });

    /** The resolved coordinates must ride along so the watch can show lat/lon. */
    test('carries the coordinates into the result', () => {
      const result = run(COORDS, routing({ [FC]: { body: FC_OK } }, []));

      expect(result.lat).toBe(40);
      expect(result.lon).toBe(-73);
    });

    /** The extras must be parsed from their documented fields so the watch can show them. */
    test('parses humidity, wind, uv and sunrise/sunset from the forecast', () => {
      const body = JSON.stringify({
        current: {
          temperature_2m: 13, weather_code: 0,
          relative_humidity_2m: 61, wind_speed_10m: 12, wind_direction_10m: 315,
          uv_index: 5,
        },
        daily: { sunrise: ['2026-06-26T06:30'], sunset: ['2026-06-26T21:30'] },
      });

      const result = run(COORDS, routing({ [FC]: { body } }, []));

      expect(result.humidity).toBe(61);
      expect(result.windKmh).toBe(12);
      expect(result.windDir).toBe('NW');
      expect(result.uvIndex).toBe(5);
      expect(result.sunrise).toBe(6 * 60 + 30);
      expect(result.sunset).toBe(21 * 60 + 30);
    });

    /**
     * Every other provider sends sun times on the phone's clock. Asked in Tokyo's zone for a Toronto
     * phone, sunrise came through on Tokyo's clock and the night schedule flipped the face hours off.
     */
    test('moves sunrise and sunset onto the phone clock in the location zone', () => {
      onPhoneAt(TORONTO_SUMMER);
      const body = JSON.stringify({
        utc_offset_seconds: 32400,
        current: { time: '2026-07-05T09:15', temperature_2m: 25, weather_code: 0 },
        daily: { sunrise: ['2026-07-05T04:30'], sunset: ['2026-07-05T19:00'] },
      });

      const result = run(COORDS, routing({ [FC]: { body } }, []));

      expect(result.sunrise).toBe(15 * 60 + 30);
      expect(result.sunset).toBe(6 * 60);
    });

    /** Feels-like and pressure must be read from their documented current fields and rounded. */
    test('parses feels-like and pressure from the forecast', () => {
      const body = JSON.stringify({
        current: {
          temperature_2m: 13, weather_code: 0,
          apparent_temperature: 9.6, pressure_msl: 1013.4,
        },
      });

      const result = run(COORDS, routing({ [FC]: { body } }, []));

      expect(result.feelsLike).toBe(10);
      expect(result.pressure).toBe(1013);
    });

    /**
     * Open-Meteo sends ground level pressure as surface_pressure, which reads about 840 in Denver
     * where every other provider says about 1013. Reading it put the Pressure panel far too low.
     */
    test('reads the sea level pressure, not the ground level one', () => {
      const body = JSON.stringify({
        current: { temperature_2m: 20, weather_code: 0, surface_pressure: 839.6, pressure_msl: 1013.2 },
      });

      const result = run(COORDS, routing({ [FC]: { body } }, []));

      expect(result.pressure).toBe(1013);
    });

    /** Dew point comes from the current block and is read in the user's unit. */
    test('parses dew point from the forecast', () => {
      const body = JSON.stringify({
        current: { temperature_2m: 1, weather_code: 71, dew_point_2m: -2.4 },
      });

      const result = run(COORDS, routing({ [FC]: { body } }, []));

      expect(result.dewPoint).toBe(-2);
    });

    /** The daily block carries today's high, low, and rain chance. */
    test('parses the daily high, low, and rain chance', () => {
      const body = JSON.stringify({
        current: { temperature_2m: 13, weather_code: 0 },
        daily: {
          temperature_2m_max: [18.6], temperature_2m_min: [9.2],
          precipitation_probability_max: [80],
        },
      });

      const result = run(COORDS, routing({ [FC]: { body } }, []));

      expect(result.tempMax).toBe(19);
      expect(result.tempMin).toBe(9);
      expect(result.precipChance).toBe(80);
    });
  });

  describe('forecast-step errors', () => {
    /** A forecast network failure must surface, not be mistaken for a reading. */
    test('maps a forecast network error to Net Error', () => {
      const result = run(COORDS, routing({ [FC]: { err: 'x' } }, []));

      expect(result.condition).toBe('NET ERROR');
    });

    /** A malformed forecast body must show a data error, not crash on undefined. */
    test('maps unparseable forecast data to Bad Wx Data', () => {
      const result = run(COORDS, routing({ [FC]: { body: 'nope' } }, []));

      expect(result.condition).toBe('BAD WX DATA');
    });

    /** Open-Meteo signals failures with an error object. Must read as API Error. */
    test('maps a forecast API error object to API Error', () => {
      const body = JSON.stringify({ error: true, reason: 'bad' });

      const result = run(COORDS, routing({ [FC]: { body } }, []));

      expect(result.condition).toBe('API ERROR');
    });

    /** A forecast missing the current block must report No Wx Data, not crash. */
    test('maps a forecast missing current to No Wx Data', () => {
      const body = JSON.stringify({});

      const result = run(COORDS, routing({ [FC]: { body } }, []));

      expect(result.condition).toBe('NO WX DATA');
    });
  });

  /**
   * Runs only with RUN_LIVE_WEATHER=1, against the real Open-Meteo API.
   *
   * Open-Meteo renaming or dropping a field would still parse without error here,
   * just into the wrong value, and this live check is the only thing that would
   * catch it before a wearer sees a blank or wrong reading on the watch.
   */
  describe.skipIf(process.env.RUN_LIVE_WEATHER !== '1')('live', () => {
    const live = (opts: WeatherOpts) => new Promise<WeatherResult>((resolve) => openmeteo.fetch(opts, fetchRequest, resolve));

    /** The real coords path must still parse into a usable reading. */
    test('returns a usable reading for coordinates', async () => {
      const result = await live({ key: '', coords: { lat: 51.5074, lon: -0.1278 }, fahrenheit: false });

      expect(result.ok).toBe(true);
      expect(typeof result.temperature).toBe('number');
      expect(result.condition).toBeTruthy();
    });
  });
});

describe('fetchForecast', () => {
  // the forecast-only helper OWM and WeatherAPI call to fill a strip they can't fetch natively
  const FORECAST_BODY = JSON.stringify({
    current: { time: '2026-07-05T09:00' },
    hourly: {
      time: ['2026-07-05T09:00', '2026-07-05T10:00', '2026-07-05T11:00'],
      temperature_2m: [12, 13, 14],
      weather_code: [0, 0, 61],
    },
    // 2026-07-04 is a Saturday (getUTCDay 6)
    daily: {
      time: ['2026-07-04', '2026-07-05'],
      temperature_2m_max: [25, 22], temperature_2m_min: [15, 13], weather_code: [0, 61],
    },
  });

  /** Runs the forecast helper synchronously and returns whatever it hands back. */
  function runForecast(opts: WeatherOpts, request: RequestFn): ForecastCols | null {
    let result: ForecastCols | null = null;
    openmeteo.fetchForecast(opts, request, (received) => { result = received; });
    return result;
  }

  /** With no coordinates there is nothing to fetch, so it must yield null without hitting the network. */
  test('yields null and makes no request when coords are missing', () => {
    const calls: string[] = [];

    const result = runForecast({ fahrenheit: false }, routing({}, calls));

    expect(result).toBeNull();
    expect(calls).toHaveLength(0);
  });

  /** A network failure must yield null so the borrowing provider keeps its own reading instead of a broken strip. */
  test('yields null on a network error', () => {
    const result = runForecast({ coords: { lat: 40, lon: -73 }, fahrenheit: false }, routing({ [FC]: { err: 'x' } }, []));

    expect(result).toBeNull();
  });

  /** Open-Meteo signals failure with an error object, which must map to null not a half-parsed strip. */
  test('yields null on an API error object', () => {
    const body = JSON.stringify({ error: true, reason: 'bad' });

    const result = runForecast({ coords: { lat: 40, lon: -73 }, fahrenheit: false }, routing({ [FC]: { body } }, []));

    expect(result).toBeNull();
  });

  /**
   * The forecast OWM and WeatherAPI borrow sends the phone's zone too. With no retry, a zone name
   * Open-Meteo refused left their forecast strips empty on every fetch.
   */
  test('asks again in the location zone when the phone zone is refused', () => {
    const calls: string[] = [];
    const refused = JSON.stringify({ error: true, reason: 'Invalid timezone' });

    const result = runForecast({ coords: { lat: 40, lon: -73 }, fahrenheit: false, zone: 'Mars/Base' }, routing({
      'timezone=Mars%2FBase': { body: refused },
      'timezone=auto': { body: FORECAST_BODY },
    }, calls));

    expect(calls).toHaveLength(2);
    expect(result.hourly.cols).toHaveLength(2);
  });

  /** A glitch column value reached the watch as it came and drew 32767 in a three digit column. */
  test('holds the strip temperatures to the watch bounds', () => {
    const body = JSON.stringify({
      current: { time: '2026-07-05T09:00' },
      hourly: { time: ['2026-07-05T09:00'], temperature_2m: [40000], weather_code: [0] },
      daily: { time: ['2026-07-05'], temperature_2m_max: [250], temperature_2m_min: [-150], weather_code: [0] },
    });

    const result = runForecast({ coords: { lat: 40, lon: -73 }, fahrenheit: false }, routing({ [FC]: { body } }, []));

    expect(result.hourly.cols[0].temp).toBe(199);
    expect(result.daily.cols[0]).toMatchObject({ tempMax: 199, tempMin: -99 });
  });

  /** A good response must parse into the hourly and daily strips or the borrowing provider's forecast row stays blank. */
  test('returns the parsed hourly and daily strips on success', () => {
    const result = runForecast({ coords: { lat: 40, lon: -73 }, fahrenheit: false }, routing({ [FC]: { body: FORECAST_BODY } }, []));

    expect(result.hourly.baseHour).toBe(9);
    expect(result.daily.baseWeekday).toBe(6);
  });
});
