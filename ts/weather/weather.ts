/**
 * Weather lookup dispatcher.
 *
 * Routes a request to the configured provider module. Each provider returns
 * its result through `done` as {temperature, condition, location, ok}, already
 * formatted to the user's unit preference.
 */

import openMeteo from './providers/openmeteo';
import owm from './providers/owm';
import weatherApi from './providers/weatherapi';
import { pickProvider } from '../pkjs/providers';
import type { RequestFn, DoneFn, WeatherOpts } from './util';

/** A provider module: the one fetch entry the dispatcher calls. */
interface WeatherProvider {
  fetch: (opts: WeatherOpts, request: RequestFn, done: DoneFn) => void;
}

// provider name -> module
const PROVIDERS: Record<string, WeatherProvider> = {
  openmeteo: openMeteo,
  owm: owm,
  weatherapi: weatherApi,
};

/**
 * Looks up current weather using the configured provider and location.
 *
 * @param opts The weather request options, read for the provider name and passed through to it.
 * @param request The function that performs the actual network request.
 * @param done Called with the weather result.
 */
function fetchWeather(opts: WeatherOpts, request: RequestFn, done: DoneFn): void {
  // each provider attaches its own forecast strip when the face asks for one so the
  // dispatcher just routes and hands the result straight back
  pickProvider(PROVIDERS, opts.provider, 'openmeteo', 'weather').fetch(opts, request, done);
}

export default { fetchWeather };
