/**
 * OpenWeatherMap weather provider (requires an API key).
 *
 * Takes resolved coordinates only. Place-name geocoding happens once at
 * settings time (see clay/location-component.ts), so this module never geocodes.
 */

import util from '../util';
import openMeteo from './openmeteo';
import type { RequestFn, DoneFn, WeatherOpts, WeatherResult } from '../util';
import type { OpenMeteoResponse } from './openmeteo';

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
  main?: OwmMain;
  weather?: Array<{ icon?: string; main?: string }>;
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
  // at the same time rather than after. request() holds a watchdog that settles every call, so
  // both arms always report and the join always closes. weatherapi borrows its strip the same way
  // a face showing none of those skips the Open-Meteo call entirely
  const borrowed = Object.keys(openMeteo.parseExtras(null));
  const needOpenMeteo = opts.wantForecast || !opts.fields || opts.fields.some((field) => borrowed.includes(field));
  let pending = needOpenMeteo ? 2 : 1;
  let result: WeatherResult | null = null;
  let extras: OpenMeteoResponse | null = null;

  const tryDone = () => {
    if (--pending > 0) {
      return;
    }

    if (result && result.ok && extras) {
      util.attachExtras(result, openMeteo.parseExtras(extras));
      if (opts.wantForecast) {
        util.attachForecast(result, openMeteo.parseForecast(extras));
      }
    }

    done(result as WeatherResult);
  };

  if (needOpenMeteo) {
    util.requestJson<OpenMeteoResponse>(openMeteo.extrasUrl(opts), request, () => tryDone(), (om) => {
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
      result = util.status(cod === 401 ? 'Invalid Key' : 'API Error');
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
        sunrise: util.hmFromUnix(sys.sunrise, json.timezone),
        sunset: util.hmFromUnix(sys.sunset, json.timezone),
      }
    );

    tryDone();
  });
}

export default { fetch };
