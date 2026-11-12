/**
 * A weather reading on the place's own clock, with every field a weather plugin serves.
 *
 * The face path reads weather into a `WeatherResult` on the phone's clock, rounded and ready for the
 * watch. A plugin serves the reading to whatever face asks, so this one keeps it as the provider gave
 * it: times in epoch seconds beside the place's offset from UTC, values in °C, km/h, hPa, and compass
 * degrees, and every series starting on the place's today. A value the provider did not give is null,
 * a gap, and never 0.
 *
 * A reading carries one offset, `utcOffset`, the place's offset now. Each day's stamp is midnight on
 * that offset's clock, which is the place's own midnight unless its clocks change between that day
 * and now. Read every time with `utcOffset`, and place an hour by its `time`, never by its index.
 *
 * Today's high, low, chance of rain, sunrise, and sunset are the first day of `daily`, since the
 * daily series starts on the place's today.
 *
 * A reading from OpenWeatherMap or WeatherAPI.com takes its current values from that provider and its
 * series from Open-Meteo. When only the Open-Meteo half fails, the reading is still `ok` with empty
 * series, and `seriesStatus` says why. Every other `ok` reading has both series filled.
 */

import type { QuotaWindow } from '../quota/ledger';

/** A sky, as the framework's condition and as the provider gave it. */
export interface ReadingCondition {
  /** The framework's condition token, such as `RAIN`, on its day form. `UNKNOWN` for no code. */
  token: string;
  /** The WMO weather code, as Open-Meteo gives it or mapped from the provider's own code, or null when none is near. */
  wmo: number | null;
  /** True by day and false by night, or null where the provider does not say. */
  isDay: boolean | null;
}

/**
 * The hourly series, one entry an hour from today's stamp in `daily.time`, every list the same length.
 * Place each hour by its `time`, since a change of clocks moves an hour off where its index puts it.
 */
export interface HourlySeries {
  /** When each hour starts, in epoch seconds. */
  time: number[];
  /** The temperature, in °C. */
  temperature: Array<number | null>;
  /** The feels-like temperature, in °C. */
  feelsLike: Array<number | null>;
  /** The sky. */
  condition: ReadingCondition[];
  /** The relative humidity, in percent. */
  humidity: Array<number | null>;
  /** The wind speed, in km/h. */
  windSpeed: Array<number | null>;
  /** Where the wind comes from, in compass degrees. */
  windDirection: Array<number | null>;
  /** The strongest gust, in km/h. */
  windGust: Array<number | null>;
  /** The cloud cover, in percent. */
  cloudCover: Array<number | null>;
  /** How far one can see, in metres. */
  visibility: Array<number | null>;
  /** The sunlight reaching the ground, in W/m². */
  solarRadiation: Array<number | null>;
  /** The convective available potential energy, in J/kg, a measure of how likely storms are. */
  cape: Array<number | null>;
  /** The UV index. */
  uvIndex: Array<number | null>;
  /** The chance of rain or snow, in percent. */
  precipitationChance: Array<number | null>;
  /** The rain, showers, and snow together, in mm. */
  precipitationAmount: Array<number | null>;
  /** The rain and showers, in mm. */
  rain: Array<number | null>;
  /** The snowfall, in cm. */
  snowfall: Array<number | null>;
  /** The air pressure at sea level, in hPa. */
  pressure: Array<number | null>;
  /** The dew point, in °C. */
  dewPoint: Array<number | null>;
}

/** The daily series, one entry a day from the place's today, every list the same length. */
export interface DailySeries {
  /** Each day's midnight on the clock `utcOffset` names, in epoch seconds. */
  time: number[];
  /** The high, in °C. */
  high: Array<number | null>;
  /** The low, in °C. */
  low: Array<number | null>;
  /** The sky over the day. Its day flag is null, since a whole day is neither. */
  condition: ReadingCondition[];
  /** The highest chance of rain or snow through the day, in percent. */
  precipitationChance: Array<number | null>;
  /** The day's rain, showers, and snow together, in mm. */
  precipitationAmount: Array<number | null>;
  /** The day's rain and showers, in mm. */
  rain: Array<number | null>;
  /** The day's snowfall, in cm. */
  snowfall: Array<number | null>;
  /** The day's highest UV index. */
  uvIndex: Array<number | null>;
  /** Sunrise, in epoch seconds, or null where the sun does not rise or does not set that day. */
  sunrise: Array<number | null>;
  /** Sunset, in epoch seconds, or null where the sun does not rise or does not set that day. */
  sunset: Array<number | null>;
}

/** A reading for one place. */
export interface WeatherReading {
  ok: true;
  /** The provider the reading came from, such as `openmeteo`. */
  source: string;
  /**
   * When the provider measured the reading, in epoch seconds. It can be up to about 15 minutes old,
   * so just after the place's midnight it can sit before `daily.time[0]`. A plugin places now by its
   * own clock against `hourly.time`, not by this.
   */
  time: number;
  /** The place's offset from UTC at that time, in seconds. */
  utcOffset: number;
  /** The temperature, in °C. */
  temperature: number | null;
  /** The feels-like temperature, in °C. */
  feelsLike: number | null;
  /** The sky now. */
  condition: ReadingCondition;
  /** The relative humidity, in percent. */
  humidity: number | null;
  /** The wind speed, in km/h. */
  windSpeed: number | null;
  /** Where the wind comes from, in compass degrees. */
  windDirection: number | null;
  /** The UV index. */
  uvIndex: number | null;
  /** The air pressure at sea level, in hPa. */
  pressure: number | null;
  /** The dew point, in °C. */
  dewPoint: number | null;
  /** 48 hours from today's stamp in `daily.time`, or fewer when the provider gave fewer. */
  hourly: HourlySeries;
  /** 8 days from the place's today, or fewer when the provider gave fewer. */
  daily: DailySeries;
  /**
   * Why the series are empty, such as `NET ERROR`, when the current reading came from one provider
   * and Open-Meteo could not give its series. Left out when the series are there.
   */
  seriesStatus?: string;
}

/** A place with no reading, and the status word to show in its place, such as `NET ERROR`. */
export interface ReadingStatus {
  ok: false;
  status: string;
  /**
   * On a `RATE LIMIT`, the provider's limit the answer says was hit, when it says, so a plugin can
   * hold off until that limit opens again. WeatherAPI's quota code 2007 is its `month`. A bare 429
   * names none.
   */
  limit?: QuotaWindow;
  /**
   * Open-Meteo's answer for the same place, when the status is a keyed provider's own failure. It is
   * a reading the plugin can serve as its failover with no second request, or Open-Meteo's own status,
   * such as `RATE LIMIT`, for the ledger. Left out when nothing went to Open-Meteo.
   */
  openMeteo?: ReadingResult;
}

/** What a provider hands back for one place. */
export type ReadingResult = WeatherReading | ReadingStatus;

/** The hours the hourly series runs for, two days from today's stamp. */
export const READING_HOURS = 48;

/** The days the daily series runs for, a week from the place's today and one more. */
export const READING_DAYS = 8;

/**
 * A value as the reading keeps it, a real number or null for a gap.
 *
 * @param value The value the provider gave.
 * @return The value when it is a finite number, or null.
 */
export function valueOrGap(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/**
 * An hourly series with no hours in it, for a reading whose series could not be fetched.
 *
 * @return The empty series.
 */
export function emptyHourly(): HourlySeries {
  return {
    time: [], temperature: [], feelsLike: [], condition: [], humidity: [], windSpeed: [], windDirection: [], windGust: [], cloudCover: [],
    visibility: [], solarRadiation: [], cape: [], uvIndex: [], precipitationChance: [], precipitationAmount: [], rain: [], snowfall: [],
    pressure: [], dewPoint: [],
  };
}

/**
 * A daily series with no days in it, for a reading whose series could not be fetched.
 *
 * @return The empty series.
 */
export function emptyDaily(): DailySeries {
  return {
    time: [], high: [], low: [], condition: [], precipitationChance: [], precipitationAmount: [], rain: [], snowfall: [], uvIndex: [],
    sunrise: [], sunset: [],
  };
}

/**
 * A place with no reading.
 *
 * @param text The status word, which is upper-cased as the face path's are.
 * @return The status.
 */
export function readingStatus(text: string): ReadingStatus {
  return { ok: false, status: text.toUpperCase() };
}
