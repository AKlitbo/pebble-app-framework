/**
 * A reading for several places from a keyed provider, with its series from Open-Meteo.
 *
 * OpenWeatherMap's free call and WeatherAPI.com's free forecast carry no series in the shape a reading
 * keeps, so each place's current values come from the provider and everything else from one batched
 * Open-Meteo `fetchReading`. A run makes one Open-Meteo request for every place, plus one provider call
 * a place.
 */

import { guardRequest, requestJson } from '../../pkjs/request';
import { joinCalls } from '../../pkjs/providers';
import { fetchReading as fetchOpenMeteoReading, validCoords } from './openmeteo';
import { emptyDaily, emptyHourly, readingStatus } from '../reading';
import type { ReadingCondition, ReadingResult, ReadingStatus, WeatherReading } from '../reading';
import type { RequestFn, WeatherCoords } from '../util';

/** The current values a provider gives for one place. A value it does not give is null. */
export interface ProviderCurrent {
  /** When the reading is from, in epoch seconds, or null when the provider does not say. */
  time: number | null;
  /** The place's offset from UTC in seconds, for when Open-Meteo cannot give it, or null. */
  utcOffset: number | null;
  /** The temperature, in °C. */
  temperature: number;
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
  /** The UV index, or null to take Open-Meteo's. */
  uvIndex: number | null;
  /** The air pressure at sea level, in hPa. */
  pressure: number | null;
  /** The dew point, in °C, or null to take Open-Meteo's. */
  dewPoint: number | null;
}

/** How one keyed provider is asked and read. */
export interface PairedProvider<T> {
  /** The provider's id, which the reading carries as its `source`. */
  source: string;
  /** The provider's URL for one place. */
  urlFor: (coords: WeatherCoords, key: string) => string;
  /** Reads the provider's answer, or its error, into the current values or a status. */
  parse: (err: string | null, json: T | null) => ProviderCurrent | ReadingStatus;
}

/** Puts a provider's current values and Open-Meteo's answer for the same place together. */
function pair(source: string, current: ProviderCurrent, series: ReadingResult): ReadingResult {
  const openMeteo = series.ok ? (series as WeatherReading) : null;
  const time = current.time ?? openMeteo?.time ?? null;
  const utcOffset = openMeteo ? openMeteo.utcOffset : current.utcOffset;

  // a reading has to say when it is from and on what clock, or none of its times can be read
  if (time === null || utcOffset === null) {
    return readingStatus('No Wx Data');
  }

  const reading: WeatherReading = {
    ok: true,
    source,
    time,
    utcOffset,
    temperature: current.temperature,
    feelsLike: current.feelsLike,
    condition: current.condition,
    humidity: current.humidity,
    windSpeed: current.windSpeed,
    windDirection: current.windDirection,
    uvIndex: current.uvIndex ?? openMeteo?.uvIndex ?? null,
    pressure: current.pressure,
    dewPoint: current.dewPoint ?? openMeteo?.dewPoint ?? null,
    hourly: openMeteo ? openMeteo.hourly : emptyHourly(),
    daily: openMeteo ? openMeteo.daily : emptyDaily(),
  };

  if (!openMeteo) {
    reading.seriesStatus = (series as ReadingStatus).status;
  }

  return reading;
}

/**
 * Fetches a reading for several places from a keyed provider, with the series from Open-Meteo.
 *
 * With no key no request goes out and every place gets `NO API KEY`. A place with bad coordinates gets
 * `NO LOCATION` and is asked of neither. Every other place costs one provider call and one place in
 * the Open-Meteo batch, a place listed twice included. A place whose provider call fails gets the
 * provider's status, with Open-Meteo's answer for it beside it as `openMeteo`, since falling back to
 * Open-Meteo is the plugin's choice. A place whose Open-Meteo half fails keeps its current reading,
 * `ok` with empty series and `seriesStatus` saying why. A request that throws answers as `NET ERROR`.
 *
 * @param provider How the provider is asked and read.
 * @param places Each place's coordinates, in the order the readings come back.
 * @param key The wearer's API key for the provider.
 * @param request The function that performs the actual network request.
 * @param done Called once with a reading or a status for each place, in the order asked.
 */
export function fetchPairedReading<T>(provider: PairedProvider<T>, places: Array<WeatherCoords | null | undefined>, key: string, request: RequestFn, done: (results: ReadingResult[]) => void): void {
  if (!key) {
    return done(places.map(() => readingStatus('No API Key')));
  }

  const results: ReadingResult[] = places.map(() => readingStatus('No Location'));
  const asked = places.map((place, index) => index).filter((index) => validCoords(places[index]));

  if (!asked.length) {
    return done(results);
  }

  const get = guardRequest(request);
  const currents: Array<ProviderCurrent | ReadingStatus> = [];
  let series: ReadingResult[] = [];

  const finish = joinCalls(asked.length + 1, () => {
    asked.forEach((index, position) => {
      const current = currents[position];

      results[index] = 'ok' in current ? { ...current, openMeteo: series[position] } : pair(provider.source, current, series[position]);
    });
    done(results);
  });

  fetchOpenMeteoReading(asked.map((index) => places[index]), get, (answered) => {
    series = answered;
    finish();
  });

  asked.forEach((index, position) => {
    requestJson<T>(provider.urlFor(places[index] as WeatherCoords, key), get, (err, json) => {
      currents[position] = provider.parse(err, json);
      finish();
    });
  });
}
