/**
 * Weather, as a feature a face opts into.
 *
 * Picks the location (GPS or the city saved in settings), fetches the weather through the chosen
 * provider, and sends it to the watch. A face that shows coordinates opts in with
 * `weather.withCoords(formatCoords)`, and its formatter adds them to every weather message. A face
 * missing any of the WEATHER_MESSAGE_KEYS gets nothing from it, even when it opts in, and the log
 * names the missing key.
 */

// the `any`s that remain in this file sit at two genuinely-dynamic boundaries: the provider result
// and the Clay settings the user saved to localStorage, which validCoord and getManualLocation read
/* eslint-disable @typescript-eslint/no-explicit-any */
import weather from './weather';
import weatherUtil from './util';
import type { WeatherResult } from './util';
import wire from '../pkjs/wire';
import { createDedupedSender } from '../pkjs/send-queue';
import { request } from '../pkjs/request';
import { getConfig, readBool, readValue, settingsChanged, settingsSnapshot } from '../pkjs/settings-store';
import type { Feature, FeatureContext, FeatureHooks } from '../pkjs/feature';

/** The weather round state runWeatherRound carries between calls. */
export interface WeatherState {
  inFlight: boolean;
  round: number;
}

/** Who has asked for weather lately, read and updated in place by the feature's hooks. */
export interface WeatherAsks {
  /** The watch asked, or the phone came up, since the last slow tick. */
  sinceSlowTick: boolean;
  /** A weather setting was saved and its forced refetch has not run yet. */
  savePending: boolean;
}

/** The helpers runWeatherRound needs, passed in so the specs can swap them. */
export interface WeatherDeps {
  fetchWeather: (onResult: (result: any) => void) => void;
  sendWeather: (result: any) => void;
  timeoutMs: number;
}

/**
 * Turns a weather result into the coordinate keys a face shows. It runs on every result, a failed
 * one included, so a face can show its own "no fix" text when the result carries no coordinates.
 */
export type CoordsFormatter = (messageKeys: Record<string, number>, result: WeatherResult) => AppMessageDict;

/** The weather feature, plus the form of it that also sends coordinates. */
export interface WeatherFeature extends Feature {
  /**
   * The weather feature for a face that shows coordinates.
   *
   * @param formatCoords Builds the face's coordinate keys from each weather result.
   * @return A feature to pass to startPebbleApp in place of the plain one.
   */
  withCoords(formatCoords: CoordsFormatter): Feature;
}

/**
 * The message keys a face with weather declares. The watch asks with the first and reads a reading
 * off the other three, so a face missing any of them gets no weather on either side. The ok flag is
 * what tells a failed fetch's status text from a real reading.
 */
export const WEATHER_MESSAGE_KEYS = ['WEATHER_REQUEST', 'WEATHER_TEMPERATURE', 'WEATHER_CONDITIONS', 'WEATHER_OK'];

/** The weather settings that mean a refetch is worth it after the config closes. */
export const WEATHER_KEYS = ['WEATHER_PROVIDER', 'WEATHER_API_KEY', 'WEATHER_TEMPERATURE_UNIT', 'LOCATION_USE_GPS', 'LOCATION_GPS_FALLBACK', 'LOCATION_NAME'];

// extra weather readings that map a message key to its field on the provider result
const EXTRA_WEATHER_FIELDS = [
  { key: 'WEATHER_HUMIDITY', field: 'humidity' },
  { key: 'WEATHER_WIND_SPEED', field: 'windKmh' },
  { key: 'WEATHER_WIND_DIR', field: 'windDir' },
  { key: 'WEATHER_SUNRISE', field: 'sunrise' },
  { key: 'WEATHER_SUNSET', field: 'sunset' },
  { key: 'WEATHER_UV_INDEX', field: 'uvIndex' },
  { key: 'WEATHER_FEELS_LIKE', field: 'feelsLike' },
  { key: 'WEATHER_PRESSURE', field: 'pressure' },
  { key: 'WEATHER_DEW_POINT', field: 'dewPoint' },
  { key: 'WEATHER_TEMP_MAX', field: 'tempMax' },
  { key: 'WEATHER_TEMP_MIN', field: 'tempMin' },
  { key: 'WEATHER_PRECIP_CHANCE', field: 'precipChance' },
];

// how long each failed weather fetch waits before the next try. a cold launch (gps still warming
// and network not up yet) misses the first fetch so a couple of spaced retries let it recover instead
// of sitting blank until the 30-min poll
export const WEATHER_RETRY_DELAYS_MS = [5000, 15000];

// how long to wait on a geolocation lookup before giving up and using the fallback. shorter than
// the 15s native timeout since that timeout isn't reliably honoured on the pebble app
export const GPS_WATCHDOG_MS = 10000;

// how long one weather attempt gets before its round is given up on. covers the gps watchdog plus
// a provider that chains a few requests at the 15s request timeout each
const WEATHER_ROUND_TIMEOUT_MS = 60 * 1000;

/**
 * Reports whether a coordinate pair is within the valid geographic range.
 *
 * @param lat The latitude to check.
 * @param lon The longitude to check.
 * @return True when both values are numbers within range.
 */
export function validCoord(lat: any, lon: any): boolean {
  return typeof lat === 'number' && lat >= -90 && lat <= 90 &&
    typeof lon === 'number' && lon >= -180 && lon <= 180;
}

/**
 * Reads the manual location the user picked in settings.
 *
 * @param config The parsed Clay settings.
 * @return The saved coordinates and label, or null when nothing is saved or the
 *   saved value does not hold a valid coordinate pair.
 */
export function getManualLocation(config: any): { coords: { lat: number; lon: number }; label: string } | null {
  const raw = readValue(config.LOCATION_NAME, '');

  if (!raw) {
    return null;
  }

  try {
    let parsed = raw;

    if (typeof raw === 'string') {
      parsed = JSON.parse(raw);
    }

    // skip a corrupt or out-of-range blob instead of sending bad coords on
    if (parsed && validCoord(parsed.lat, parsed.lon)) {
      return {
        coords: { lat: parsed.lat, lon: parsed.lon },
        label: parsed.label || '',
      };
    }
  } catch (error) {
    // fall through on parsing error
  }

  return null;
}

/**
 * Snapshots the weather-relevant settings.
 *
 * @return The current weather settings, JSON-encoded so they compare by content.
 */
export function weatherSettingsSnapshot(): string[] {
  return settingsSnapshot(WEATHER_KEYS);
}

/**
 * Reports whether any weather-relevant setting changed between two snapshots.
 *
 * @param before The snapshot taken before the config page opened, or null when none was taken.
 * @param after The snapshot taken after the config page closed.
 * @return True when a weather setting changed, or when there was no before snapshot to compare.
 */
export function weatherSettingsChanged(before: string[] | null, after: string[]): boolean {
  return settingsChanged(WEATHER_KEYS, before, after);
}

/**
 * Decides how long to wait before retrying a weather fetch, or null when no retry
 * should run. A successful fetch never retries, and the attempts are capped.
 *
 * @param resultOk Whether the fetch that just finished succeeded.
 * @param attempt How many retries have already run.
 * @return The delay in milliseconds before the next retry, or null when no retry should run.
 */
export function weatherRetryDelayMs(resultOk: boolean, attempt: number): number | null {
  if (resultOk || attempt >= WEATHER_RETRY_DELAYS_MS.length) {
    return null;
  }

  return WEATHER_RETRY_DELAYS_MS[attempt];
}

/**
 * Runs one weather round: fetches, sends the result on, and retries a failed fetch a few times.
 *
 * The watch re-asks every few seconds until its first reading lands, so without a gate every ask
 * would start its own gps fix and provider fetch with its own retries and burn the provider quota.
 * A round stays in flight while it fetches or waits on a retry, and an unforced call in that time
 * is dropped. A forced round (a weather setting changed) replaces a running one, and the old
 * round's late result or pending retry is ignored. A watchdog closes a round whose fetch never
 * calls back.
 *
 * @param state The round state to read and update in place.
 * @param force Whether to start a new round even when one is already in flight.
 * @param deps The fetch, send, and timeout helpers to use.
 */
export function runWeatherRound(state: WeatherState, force: boolean, deps: WeatherDeps): void {
  if (state.inFlight && !force) {
    return;
  }

  const round = ++state.round; // a new round number tells any round still running to stop

  state.inFlight = true;

  // bumping the round number again shuts out anything this round still has pending
  function finishRound() {
    state.round++;
    state.inFlight = false;
  }

  function attempt(retry: number) {
    // a fetch that never calls back would hold off every later ask, so give up on it after a cap
    const watchdog = setTimeout(() => {
      if (round === state.round) {
        finishRound();
      }
    }, deps.timeoutMs);

    deps.fetchWeather((result) => {
      clearTimeout(watchdog);

      if (round !== state.round) {
        return; // a forced round replaced this one, or the watchdog already closed it
      }

      // the round closes or retries even when the send throws
      // a round left in flight would drop every later ask until the JS restarts
      try {
        deps.sendWeather(result);
      } catch (error) {
        console.error('Error sending weather info to Pebble: ' + error);
      }

      const retryMs = weatherRetryDelayMs(result.ok, retry);

      if (retryMs === null) {
        finishRound();
        return;
      }

      setTimeout(() => {
        if (round === state.round) {
          attempt(retry + 1);
        }
      }, retryMs);
    });
  }

  attempt(0);
}

/**
 * Decides whether a watch ask, or the phone coming up, should start a fetch.
 *
 * Saving a weather setting schedules a forced refetch, and the watch asks as well once it takes
 * the new settings. An ask that lands before the refetch runs is folded into it, or the two would
 * race and fetch twice. Either way the ask counts towards skipping the next slow tick.
 *
 * @param asks The ask state to read and update in place.
 * @return True when the ask should start a fetch.
 */
export function askShouldFetch(asks: WeatherAsks): boolean {
  asks.sinceSlowTick = true;

  return !asks.savePending;
}

/**
 * Decides whether a slow tick should start a fetch.
 *
 * The watch polls on its own clock at the same 30 minutes, so a tick that follows one of its asks
 * would only fetch the same weather again. The tick fetches when nothing asked since the last one,
 * such as a watch out of range.
 *
 * @param asks The ask state to read and update in place.
 * @return True when the tick should start a fetch.
 */
export function slowTickShouldFetch(asks: WeatherAsks): boolean {
  const due = !asks.sinceSlowTick;

  asks.sinceSlowTick = false;

  return due;
}

/**
 * Starts the weather feature for a face, with or without the coordinate keys.
 *
 * @param context What the app shares: the face's message keys, its config defaults, the send queue,
 *   and the refetch delay after a settings save.
 * @param formatCoords The face's coordinate formatter, or null for a face that shows none.
 * @return The hooks the app calls on ready, on a watch message, on each refresh tick, and around the
 *   settings page.
 */
function startWeather({ messageKeys, defaults, queueSend, refetchDelayMs }: FeatureContext, formatCoords: CoordsFormatter | null): FeatureHooks {
  // the watch only asks for and reads weather when every one of WEATHER_MESSAGE_KEYS is declared,
  // so the phone goes by the same list. without them a fetch would spend provider quota on a
  // reading nothing shows, so the feature does nothing and says why
  const missing = WEATHER_MESSAGE_KEYS.filter((key) => messageKeys[key] === undefined);

  if (missing.length) {
    console.warn(`Weather is on, but this face does not declare ${missing.join(', ')}, so no weather is fetched`);

    // it still counts as answering the request, since the line above already says why nothing comes back
    return { requests: ['WEATHER_REQUEST'] };
  }

  let settingsBeforeConfig: string[] | null = null;

  // weather round state mutated in place by runWeatherRound
  const state: WeatherState = { inFlight: false, round: 0 };

  // who asked lately, so a slow tick or a watch ask does not fetch what another just did
  const asks: WeatherAsks = { sinceSlowTick: false, savePending: false };

  // the weather dict the watch holds, so an unchanged refresh skips the redundant BLE wake.
  // forgotten on ready and on a watch-initiated request so the watch always gets a fresh answer
  const sender = createDedupedSender<AppMessageDict>(
    queueSend,
    (dict) => dict,
    (dict) => JSON.stringify(dict),
    'Weather'
  );

  /** Sends a weather result to the watch. */
  function sendWeather(result: any) {
    const dict: Record<string, any> = {
      [messageKeys.WEATHER_TEMPERATURE]: result.temperature,
      [messageKeys.WEATHER_CONDITIONS]: result.condition,
      [messageKeys.WEATHER_OK]: result.ok ? 1 : 0,
    };

    // extra readings only sent for faces that declare the keys
    // a missing value is left out so the watch keeps its placeholder
    EXTRA_WEATHER_FIELDS.forEach(({ key, field }) => {
      const value = result[field];

      if (messageKeys[key] !== undefined && value !== undefined && value !== '') {
        dict[messageKeys[key]] = value;
      }
    });

    // the forecast strips ride as packed byte arrays. only for faces that
    // declare the keys and only when the provider actually supplied a strip
    if (messageKeys.WEATHER_FORECAST_HOURLY !== undefined) {
      const bytes = wire.packForecastHourly(result.forecastHourly);

      if (bytes) {
        dict[messageKeys.WEATHER_FORECAST_HOURLY] = bytes;
      }
    }

    if (messageKeys.WEATHER_FORECAST_DAILY !== undefined) {
      const bytes = wire.packForecastDaily(result.forecastDaily);

      if (bytes) {
        dict[messageKeys.WEATHER_FORECAST_DAILY] = bytes;
      }
    }

    // a failed result carries no coordinates, and the formatter still runs on it so the face can
    // show its own "no fix" text rather than keep the last one
    if (formatCoords) {
      Object.assign(dict, formatCoords(messageKeys, result));
    }

    // a compound dict rather than one strip, so what is compared is a serialized signature of the
    // whole thing rather than a byte run
    sender.push(dict);
  }

  /**
   * Fetches the weather once using GPS or the stored manual coordinates, and hands the
   * result to onResult. The config is read on every call so a retry sees the latest settings.
   */
  function fetchWeatherOnce(onResult: (result: any) => void) {
    const config = getConfig();

    const opts: any = {
      provider: String(readValue(config.WEATHER_PROVIDER, defaults.WEATHER_PROVIDER)),
      key: String(readValue(config.WEATHER_API_KEY, defaults.WEATHER_API_KEY || '')).trim().slice(0, 64),
      fahrenheit: readBool(config.WEATHER_TEMPERATURE_UNIT, defaults.WEATHER_TEMPERATURE_UNIT as boolean),
      coords: null,
      label: undefined,
      // only faces that declare a forecast key pay to fetch the strips. everyone
      // else skips the extra hourly block and the supplemental provider call
      wantForecast: messageKeys.WEATHER_FORECAST_HOURLY !== undefined || messageKeys.WEATHER_FORECAST_DAILY !== undefined,
      // the readings this face has keys for, so a provider can skip a request that only brings others
      fields: EXTRA_WEATHER_FIELDS.filter(({ key }) => messageKeys[key] !== undefined).map(({ field }) => field),
    };

    const useGps = readBool(config.LOCATION_USE_GPS, defaults.LOCATION_USE_GPS as boolean);
    const gpsFallback = readBool(config.LOCATION_GPS_FALLBACK, defaults.LOCATION_GPS_FALLBACK as boolean);
    const manual = getManualLocation(config);

    const fetchFor = (coords: any, label: any) => {
      opts.coords = coords;
      opts.label = label;
      console.log(`Fetching Weather: ${opts.provider} @ ${coords.lat},${coords.lon} (${label})`);

      weather.fetchWeather(opts, request, (result: any) => {
        console.log(`Weather: ${result.condition} ${result.temperature} (ok=${result.ok})`);
        onResult(result);
      });
    };

    const useManual = () => {
      if (manual) {
        return fetchFor(manual.coords, manual.label);
      }

      onResult(weatherUtil.status('No Location'));
    };

    // what to do when gps can't place us: the manual city if the user allowed the fallback
    // otherwise a status the panel can show
    const gpsFail = () => {
      if (gpsFallback) {
        useManual();
      } else {
        onResult(weatherUtil.status('No GPS'));
      }
    };

    // skip gps entirely when the user disabled it
    if (!useGps) {
      return useManual();
    }

    // fall back to the manual location if the phone has no geolocation API
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      return gpsFail();
    }

    // getCurrentPosition on the pebble app can hang and never call back (the timeout option isn't
    // reliably honoured) which would strand a fallback user with nothing sent. the watchdog runs
    // the fallback if neither callback lands and the located flag keeps whichever fires first
    let located = false;
    const watchdog = setTimeout(() => {
      if (located) {
        return;
      }

      located = true;
      gpsFail();
    }, GPS_WATCHDOG_MS);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (located) {
          return;
        }

        located = true;
        clearTimeout(watchdog);
        fetchFor({ lat: pos.coords.latitude, lon: pos.coords.longitude }, 'My Location');
      },
      () => {
        if (located) {
          return;
        }

        located = true;
        clearTimeout(watchdog);
        gpsFail();
      },
      // a cold wake has no fresh fix so accept a position up to 10 min old rather than block on a
      // slow new acquisition that can time out. weather barely moves over that window anyway
      { timeout: 15000, maximumAge: 600000 }
    );
  }

  /**
   * Fetches the weather and forwards the result to the watch, retrying a failed fetch a few
   * times. A round already in flight drops an unforced call, and a forced one replaces it.
   */
  function getWeather(force?: boolean) {
    runWeatherRound(state, Boolean(force), {
      fetchWeather: fetchWeatherOnce,
      sendWeather: sendWeather,
      timeoutMs: WEATHER_ROUND_TIMEOUT_MS,
    });
  }

  return {
    requests: ['WEATHER_REQUEST'],

    ready() {
      // clear the dedupe cache so a watch that just rebooted with empty stores gets a fresh send
      sender.forget();

      if (askShouldFetch(asks)) {
        getWeather();
      }
    },

    message(payload) {
      // the watch only asks when it needs data so clear the dedupe cache to force a fresh send. a
      // round already in flight starts no second fetch, but its own result still goes out once it lands
      if (payload[messageKeys.WEATHER_REQUEST]) {
        sender.forget();

        if (askShouldFetch(asks)) {
          getWeather();
        }
      }
    },

    // weather changes slowly, so it only refreshes on the slow ticks nothing else has covered
    refresh(slow) {
      if (slow && slowTickShouldFetch(asks)) {
        getWeather();
      }
    },

    // Clay saves the new settings before the app's webviewclosed handler runs, so the old values
    // are captured here while the page is still open
    configOpened() {
      settingsBeforeConfig = weatherSettingsSnapshot();
    },

    // only refetch when a weather setting actually changed, since refetching on every save (theme
    // or vibe) is wasted. the watch asks too once it takes a changed weather setting, and that ask
    // is folded into this refetch
    configSaved() {
      const before = settingsBeforeConfig;

      settingsBeforeConfig = null;

      if (weatherSettingsChanged(before, weatherSettingsSnapshot())) {
        asks.savePending = true;

        // forced so it replaces a round still fetching with the old location or provider
        setTimeout(() => {
          asks.savePending = false;
          asks.sinceSlowTick = true;
          getWeather(true);
        }, refetchDelayMs);
      }
    },
  };
}

const weatherFeature = ((context: FeatureContext) => startWeather(context, null)) as WeatherFeature;

weatherFeature.withCoords = (formatCoords) => (context) => startWeather(context, formatCoords);

export default weatherFeature;
