/**
 * OpenWeatherMap weather provider (requires an API key).
 *
 * Takes resolved coordinates only. Place-name geocoding happens once at
 * settings time (see clay/location-component.ts), so this module never geocodes.
 */

import util from '../util';
import { joinCalls } from '../../pkjs/providers';
import openMeteo from './openmeteo';
import type { RequestFn, DoneFn, WeatherOpts, WeatherResult, WeatherCoords } from '../util';
import type { OpenMeteoResponse } from './openmeteo';
import { fetchPairedReading } from './paired-reading';
import type { ProviderCurrent } from './paired-reading';
import { readingStatus, valueOrGap } from '../reading';
import type { ReadingCondition, ReadingResult, ReadingStatus } from '../reading';

const OWM_WEATHER_API = 'https://api.openweathermap.org/data/2.5/weather';

interface OwmMain { temp?: number; humidity?: number; feels_like?: number; pressure?: number }
interface OwmWind { speed?: number | null; deg?: number }
interface OwmSys { sunrise?: number; sunset?: number }

/** The subset of an OpenWeatherMap current-weather response this provider reads. */
interface OwmResponse {
  cod?: number | string;
  message?: string;
  name?: string;
  timezone?: number;
  dt?: number;
  main?: OwmMain;
  weather?: Array<{ id?: number; icon?: string; main?: string }>;
  wind?: OwmWind;
  sys?: OwmSys;
}

/**
 * Fetches current weather from OpenWeatherMap for the supplied coordinates.
 *
 * @param opts The weather request options, read for the key, the coordinates, and the unit.
 * @param request The function that performs the actual network request.
 * @param done Called with the weather result.
 */
function fetch(opts: WeatherOpts, request: RequestFn, done: DoneFn): void {
  if (!opts.key) {
    return done(util.status('No API Key'));
  }

  if (!opts.coords) {
    return done(util.status('No Location'));
  }

  const units = opts.fahrenheit ? 'imperial' : 'metric';
  const encodedKey = encodeURIComponent(opts.key);
  const lat = opts.coords.lat;
  const lon = opts.coords.lon;
  const url = `${OWM_WEATHER_API}?lat=${lat}&lon=${lon}&units=${units}&appid=${encodedKey}`;

  // OWM's free endpoint carries no UV, dew point or forecast, so Open-Meteo is asked for those
  // at the same time rather than after. weatherapi borrows its strip the same way
  // a face showing none of those skips the Open-Meteo call entirely
  const borrowed = Object.keys(openMeteo.parseExtras(null));
  const needOpenMeteo = opts.wantForecast || !opts.fields || opts.fields.some((field) => borrowed.includes(field));
  let result: WeatherResult | null = null;
  let extras: OpenMeteoResponse | null = null;

  const tryDone = joinCalls(needOpenMeteo ? 2 : 1, () => {
    if (result && result.ok && extras) {
      util.attachExtras(result, openMeteo.parseExtras(extras));

      if (opts.wantForecast) {
        util.attachForecast(result, openMeteo.parseForecast(extras));
      }
    }

    done(result as WeatherResult);
  });

  if (needOpenMeteo) {
    openMeteo.requestZoned(opts, openMeteo.extrasUrl, request, () => tryDone(), (om) => {
      extras = om;
      tryDone();
    });
  }

  util.requestJson<OwmResponse>(url, request, (status) => {
    result = status;
    tryDone();
  }, (json) => {
    // OWM returns a 'cod' field with the HTTP status. 401 is usually a bad key
    // it comes as a number on success but often a string on errors so normalize first
    const cod = Number(json.cod);

    if (Number.isFinite(cod) && cod !== 200) {
      console.log('owm api error:', json.message);
      // a 429 is the key's call cap, which another try seconds later only spends more of
      result = util.status(cod === 401 ? 'Invalid Key' : cod === 429 ? 'Rate Limit' : 'API Error');
      return tryDone();
    }

    if (!json.main || !json.weather || !json.weather.length) {
      result = util.status('No Wx Data');
      return tryDone();
    }

    // OWM icon codes end in 'd' for day or 'n' for night. a missing icon counts
    // as day so a clear sky never wrongly shows a moon
    const icon = json.weather[0].icon || '';
    const isDay = !icon.endsWith('n');

    // OWM wind speed is m/s for metric or mph for imperial so normalize to km/h
    const toKmh = (value: unknown) => Number(value) * (opts.fahrenheit ? 1.609344 : 3.6);
    const wind: OwmWind = json.wind || {};
    // Number(null) is 0, so a null speed is ruled out first or it would read as dead calm
    const windKmh = wind.speed !== null && Number.isFinite(Number(wind.speed)) ? toKmh(wind.speed) : undefined;

    const sys: OwmSys = json.sys || {};

    // OWM lumps every cloud level under main "Clouds". split partly (icon code
    // 02) from overcast (03/04) using the icon code before night promotion
    let cond = json.weather[0].main || '';

    if (String(cond).toLowerCase() === 'clouds') {
      cond = icon.slice(0, 2) === '02' ? 'PCLDY' : 'CLDY';
    }

    result = util.ok(
      json.main.temp,
      util.applyNight(cond, isDay),
      opts.label || json.name,
      lat,
      lon,
      {
        humidity: json.main.humidity,
        windKmh: windKmh,
        windDir: util.degToCompass(wind.deg),
        feelsLike: json.main.feels_like,
        pressure: json.main.pressure,
        // read on the phone's clock, which the watch keeps, rather than the location's
        sunrise: util.minutesFromUnix(sys.sunrise),
        sunset: util.minutesFromUnix(sys.sunset),
      }
    );

    tryDone();
  });
}

/**
 * The nearest WMO weather code for each condition id OpenWeatherMap publishes, from the codes
 * Open-Meteo uses.
 *
 * The face reads OpenWeatherMap's sky from its group name, so every rain id reads as `RAIN` and every
 * snow id as `SNOW`. Each code here keeps to the token the face gives, so a shower reads as rain of the
 * same strength, freezing rain as light rain, sleet as snow grains, and scattered cloud as overcast.
 * The face has no token for dust, sand, or ash, so they take fog, the nearest sky that hides the view,
 * and a reading takes fog's token with it. Squalls and tornadoes have no code near them, so they have
 * none and stay `UNKNOWN`.
 */
export const OWM_WMO: Record<number, number> = {
  200: 95, 201: 95, 202: 95, 210: 95, 211: 95, 212: 95, 221: 95, 230: 95, 231: 95, 232: 95,
  300: 51, 301: 53, 302: 55, 310: 51, 311: 53, 312: 55, 313: 53, 314: 55, 321: 53,
  500: 61, 501: 63, 502: 65, 503: 65, 504: 65, 511: 61, 520: 61, 521: 63, 522: 65, 531: 63,
  600: 71, 601: 73, 602: 75, 611: 77, 612: 77, 613: 77, 615: 71, 616: 73, 620: 71, 621: 73, 622: 75,
  701: 45, 711: 45, 721: 45, 731: 45, 741: 45, 751: 45, 761: 45, 762: 45,
  800: 0, 801: 1, 802: 3, 803: 3, 804: 3,
};

/** What one place costs against OpenWeatherMap's limits in `fetchReading`, one call. */
export const READING_WEIGHT = 1;

/**
 * The sky from OpenWeatherMap's first weather entry, read the way the face's fetch reads it. Where the
 * face has no token but the id has a WMO code, the token is the code's, so the two never name
 * different skies.
 */
function owmCondition(weather: { id?: number; icon?: string; main?: string }): ReadingCondition {
  const icon = weather.icon || '';
  let cond = weather.main || '';

  // the same split the face makes, partly cloudy for icon 02 and cloudy for 03 and 04
  if (String(cond).toLowerCase() === 'clouds') {
    cond = icon.slice(0, 2) === '02' ? 'PCLDY' : 'CLDY';
  }

  const wmo = typeof weather.id === 'number' && Object.prototype.hasOwnProperty.call(OWM_WMO, weather.id) ? OWM_WMO[weather.id] : null;

  const token = util.applyNight(cond, true);

  return { token: token === 'UNKNOWN' && wmo !== null ? util.wmoToCondition(wmo) : token, wmo, isDay: icon ? !icon.endsWith('n') : null };
}

/**
 * Reads an OpenWeatherMap answer, or its error, into a place's current values.
 *
 * A 429 is `RATE LIMIT` whatever the body says, and a 401 is `INVALID KEY`, with a body or without.
 * Otherwise the answer's own `cod` decides, as it does for the face, and a failed request whose body
 * carries no `cod` is `NET ERROR`. Wind comes in m/s and leaves in km/h, and OpenWeatherMap's free call
 * has no UV or dew point, so both come from Open-Meteo.
 */
function parseOwmCurrent(err: string | null, json: OwmResponse | null): ProviderCurrent | ReadingStatus {
  if (err === 'http 429') {
    return readingStatus('Rate Limit');
  }

  if (!json) {
    return readingStatus(err === 'http 401' ? 'Invalid Key' : err ? 'NET ERROR' : 'BAD WX DATA');
  }

  const cod = Number(json.cod);

  if (Number.isFinite(cod) && cod !== 200) {
    console.log('owm api error:', json.message);
    return readingStatus(cod === 401 ? 'Invalid Key' : cod === 429 ? 'Rate Limit' : 'API Error');
  }

  // a server error page in JSON with no cod of its own is a failed request, not an empty reading
  if (err && !Number.isFinite(cod)) {
    return readingStatus('NET ERROR');
  }

  const temperature = valueOrGap(json.main?.temp);

  if (!json.main || !json.weather || !json.weather.length || temperature === null) {
    return readingStatus('No Wx Data');
  }

  const speed = valueOrGap(json.wind?.speed);

  return {
    time: valueOrGap(json.dt),
    utcOffset: valueOrGap(json.timezone),
    temperature,
    feelsLike: valueOrGap(json.main.feels_like),
    condition: owmCondition(json.weather[0]),
    humidity: valueOrGap(json.main.humidity),
    windSpeed: speed === null ? null : speed * 3.6,
    windDirection: valueOrGap(json.wind?.deg),
    uvIndex: null,
    pressure: valueOrGap(json.main.pressure),
    dewPoint: null,
  };
}

/**
 * Fetches a reading for several places from OpenWeatherMap, with the series, the offset, the sun
 * times, the UV, and the dew point from one batched Open-Meteo request.
 *
 * It asks in metric units whatever the wearer's, since a reading keeps °C and km/h.
 *
 * @param places Each place's coordinates, in the order the readings come back.
 * @param key The wearer's OpenWeatherMap key.
 * @param request The function that performs the actual network request.
 * @param done Called once with a reading or a status for each place, in the order asked.
 */
export function fetchReading(places: Array<WeatherCoords | null | undefined>, key: string, request: RequestFn, done: (results: ReadingResult[]) => void): void {
  fetchPairedReading<OwmResponse>({
    source: 'owm',
    urlFor: (coords, apiKey) => `${OWM_WEATHER_API}?lat=${coords.lat}&lon=${coords.lon}&units=metric&appid=${encodeURIComponent(apiKey)}`,
    parse: parseOwmCurrent,
  }, places, key, request, done);
}

export default { fetch, fetchReading };
