/**
 * Shared PebbleKit JS bootstrap for the weather watchfaces.
 *
 * Reads Clay settings, picks the location (GPS or saved city), fetches weather
 * through the chosen provider, and sends it to the watch. The faces only differ
 * in how they format coordinates, so each passes its own formatCoords hook.
 */

// the `any`s that remain in this file sit at two genuinely-dynamic boundaries: the
// Clay-settings readers (validCoord/isString/isEnum/asBool/getManualLocation) that read whatever
// the user saved to localStorage and the face-generated message_keys map plus the AppMessage dict
// it keys
/* eslint-disable @typescript-eslint/no-explicit-any */
import weather from '../weather/weather';
import weatherUtil from '../weather/util';
import locationComponent from '../clay/location-component';
import wire from './wire';
import timezone from './timezone';
import { createSendQueue, createDedupedSender } from './send-queue';
import { request } from './request';
import { getConfig, readBool, readValue, settingsChanged, settingsSnapshot } from './settings-store';
import type { Feature, FeatureHooks } from './feature';
import type { WeatherResult } from '../weather/util';
import type { ClayConfigItem } from '../clay/types';

/** The weather round state runWeatherRound carries between calls. */
export interface WeatherState {
  inFlight: boolean;
  round: number;
}

/** The helpers runWeatherRound needs, passed in so the specs can swap them. */
export interface WeatherDeps {
  fetchWeather: (onResult: (result: any) => void) => void;
  sendWeather: (result: any) => void;
  timeoutMs: number;
}

/** The options a face hands startPebbleApp. */
export interface StartOptions {
  clayConfig: ClayConfigItem[];
  formatCoords: (messageKeys: Record<string, number>, result: WeatherResult) => AppMessageDict;
  components?: unknown[];
  seedKeys?: string[];
  seedColorKeys?: string[];
  seedBoolKeys?: string[];
  customClay?: unknown;
  // the parts of the runtime only some faces use, such as stocks and the calendar
  features?: Feature[];
}

// the weather settings that mean a refetch is worth it after the config closes
const WEATHER_KEYS = ['WEATHER_PROVIDER', 'WEATHER_API_KEY', 'WEATHER_TEMPERATURE_UNIT', 'LOCATION_USE_GPS', 'LOCATION_GPS_FALLBACK', 'LOCATION_NAME'];

// how long after the config page closes a changed setting waits to refetch
const SETTINGS_REFETCH_DELAY_MS = 250;

// extra weather readings that map a message key to its field on the provider result
const EXTRA_WEATHER_FIELDS = [
  { key: 'WEATHER_HUMIDITY', field: 'humidity' },
  { key: 'WEATHER_WIND_SPEED', field: 'windKmh' },
  { key: 'WEATHER_WIND_DIR', field: 'windDir' },
  { key: 'WEATHER_SUNRISE', field: 'sunrise' },
  { key: 'WEATHER_SUNSET', field: 'sunset' },
  { key: 'WEATHER_UV_INDEX', field: 'uvIndex' },
  { key: 'WEATHER_PRECIPITATION', field: 'precip' },
  { key: 'WEATHER_FEELS_LIKE', field: 'feelsLike' },
  { key: 'WEATHER_PRESSURE', field: 'pressure' },
  { key: 'WEATHER_CLOUD', field: 'cloud' },
  { key: 'WEATHER_WIND_GUST', field: 'windGustKmh' },
  { key: 'WEATHER_DEW_POINT', field: 'dewPoint' },
  { key: 'WEATHER_TEMP_MAX', field: 'tempMax' },
  { key: 'WEATHER_TEMP_MIN', field: 'tempMin' },
  { key: 'WEATHER_PRECIP_CHANCE', field: 'precipChance' },
  { key: 'WEATHER_PRECIP_TOTAL', field: 'precipTotal' },
  { key: 'WEATHER_UV_MAX', field: 'uvMax' },
];

/**
 * Walks the Clay config items and builds a map from each item's message key to its
 * declared default value, so the same defaults apply whether or not the user has
 * opened the settings page yet.
 *
 * @param items The Clay config items to walk, including any nested items.
 * @return A map from message key to default value.
 */
function collectDefaults(items: ClayConfigItem[]): Record<string, any> {
  return items.reduce((defaults: Record<string, any>, item) => {
    if (item.messageKey && item.defaultValue !== undefined) {
      defaults[item.messageKey] = item.defaultValue;
    }
    if (item.items) {
      Object.assign(defaults, collectDefaults(item.items));
    }
    return defaults;
  }, {});
}

/**
 * Reports whether a coordinate pair is within the valid geographic range.
 *
 * @param lat The latitude to check.
 * @param lon The longitude to check.
 * @return True when both values are numbers within range.
 */
function validCoord(lat: any, lon: any): boolean {
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
function getManualLocation(config: any): { coords: { lat: number; lon: number }; label: string } | null {
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

// the watch payload is already sanitized C-side but guard each copy anyway so
// a malformed round-trip can't seed junk into the Clay store
const isString = (value: any) => typeof value === 'string';
const isEnum = (value: any) => typeof value === 'string' || typeof value === 'number';
const asBool = (value: any) => value === 1;

/**
 * The face's timezone settings, by the name to read them under and the key they ride on.
 *
 * The Clay store keys on the name and an AppMessage dict keys on the number, so anything handling
 * a timezone field needs both halves. A face with no timezone key gets an empty list.
 *
 * @param messageKeys The face's message_keys map.
 * @return Every timezone field the face declares.
 */
function timezoneFieldsIn(messageKeys: any): Array<{ name: string; key: number }> {
  return Object.keys(messageKeys)
    .filter((name) => /TIME_?ZONE/i.test(name))
    .map((name) => ({ name: name, key: messageKeys[name] as number }));
}

/**
 * Rewrites every timezone field in a settings dict into the "offset,label" the watch reads.
 *
 * Clay hands back the place the config page saved. The offset in it is the one that zone kept on
 * the day the place was picked, so it is read off the zone again here.
 *
 * A face is free to name a key TIMEZONE without it holding a saved place, so only a string is
 * rewritten. A number is a toggle or a colour, and blanking one would leave that setting stuck.
 *
 * A field with nothing saved in it is dropped rather than sent. The watch reads an empty value as
 * zero minutes under no name, so sending one turns a working panel into UTC labelled TZ.
 *
 * @param dict The settings dict Clay built from a save.
 * @param messageKeys The face's message_keys map.
 * @param nowMs The time to read each zone's offset at.
 * @return The same dict, with each timezone field rewritten or dropped.
 */
function retimeSettings(dict: AppMessageDict, messageKeys: any, nowMs: number): AppMessageDict {
  timezoneFieldsIn(messageKeys).forEach((field) => {
    if (typeof dict[field.key] !== 'string') {
      return;
    }

    const wired = timezone.toWire(dict[field.key], nowMs);
    if (wired) {
      dict[field.key] = wired;
    } else {
      delete dict[field.key];
    }
  });

  return dict;
}

// settings we copy from the watch payload into the Clay store
// accept is an optional type guard and coerce an optional transform (default is copy as-is)
const SEED_FIELDS: Array<{ key: string; accept?: (value: any) => boolean; coerce?: (value: any) => any }> = [
  // temperature unit is a select so it seeds through seedKeys as a "0"/"1" string not here
  { key: 'CLOCK_DATE_FORMAT', accept: isString },
  { key: 'APPEARANCE_THEME', accept: isEnum, coerce: String },
  { key: 'HEALTH_STEPS_MODE', accept: isEnum, coerce: String },
  { key: 'CLOCK_TIME_FORMAT', accept: isEnum, coerce: String },
  { key: 'CONNECTION_BLUETOOTH_ICON', coerce: asBool },
  { key: 'CONNECTION_VIBE_CONNECT', accept: isEnum, coerce: String },
  { key: 'CONNECTION_VIBE_DISCONNECT', accept: isEnum, coerce: String },
];

/**
 * Seeds the Clay store from the watch's current settings so the config opens
 * with the real values instead of defaults. The watch persist is the source of
 * truth, since the phone's clay-settings can be empty or stale after an update.
 * A timezone field is the one exception. It only seeds when the phone has nothing
 * saved for it, since the watch's copy has lost the zone the phone's still holds.
 *
 * @param messageKeys The face's message_keys map.
 * @param payload The watch's AppMessage payload to seed from.
 * @param seedKeys Extra select-type face keys to seed as their string form.
 * @param seedColorKeys Extra colour-type face keys to seed as numbers.
 * @param seedBoolKeys Extra toggle-type face keys to seed as booleans.
 */
function seedConfigFromWatch(messageKeys: any, payload: any, seedKeys?: string[], seedColorKeys?: string[], seedBoolKeys?: string[]): void {
  const config = getConfig();

  SEED_FIELDS.forEach((field) => {
    const messageKey = messageKeys[field.key];
    if (!(messageKey in payload)) {
      return;
    }

    const value = payload[messageKey];
    if (field.accept && !field.accept(value)) {
      return;
    }

    config[field.key] = field.coerce ? field.coerce(value) : value;
  });

  // extra face keys (like layout rows and goals) are all selects so they
  // seed as the string form Clay expects
  (seedKeys || []).forEach((key) => {
    const messageKey = messageKeys[key];
    if (messageKey in payload && isEnum(payload[messageKey])) {
      config[key] = String(payload[messageKey]);
    }
  });

  // the other two wire shapes a face key can take. a colour has to stay a number because Clay's
  // picker reads a string as hex, and a toggle rides as 0/1 but sets from a real boolean
  (seedColorKeys || []).forEach((key) => {
    const messageKey = messageKeys[key];
    if (messageKey in payload && typeof payload[messageKey] === 'number') {
      config[key] = payload[messageKey];
    }
  });

  (seedBoolKeys || []).forEach((key) => {
    const messageKey = messageKeys[key];
    if (messageKey in payload) {
      config[key] = asBool(payload[messageKey]);
    }
  });

  // the watch keeps a timezone as the "offset,label" string it was sent, so seeding it back puts
  // the place name in front of the user. the zone itself does not survive that trip, so the picker
  // shows its prompt to choose the city again, which is the only way the zone comes back.
  // a place the phone already saved is kept, since it still has its zone. a face without
  // SETTINGS_FRESH seeds on every launch, so writing over it would lose the zone each time
  timezoneFieldsIn(messageKeys).forEach((field) => {
    if (config[field.name]) {
      return;
    }

    if (field.key in payload && isString(payload[field.key])) {
      config[field.name] = payload[field.key];
    }
  });

  localStorage.setItem('clay-settings', JSON.stringify(config));
}

/**
 * Snapshots the weather-relevant settings.
 *
 * @return The current weather settings, JSON-encoded so they compare by content.
 */
function weatherSettingsSnapshot(): string[] {
  return settingsSnapshot(WEATHER_KEYS);
}

/**
 * Reports whether any weather-relevant setting changed between two snapshots.
 *
 * @param before The snapshot taken before the config page opened, or null when none was taken.
 * @param after The snapshot taken after the config page closed.
 * @return True when a weather setting changed, or when there was no before snapshot to compare.
 */
function weatherSettingsChanged(before: string[] | null, after: string[]): boolean {
  return settingsChanged(WEATHER_KEYS, before, after);
}

// how long each failed weather fetch waits before the next try. a cold launch (gps still warming
// and network not up yet) misses the first fetch so a couple of spaced retries let it recover instead
// of sitting blank until the 30-min poll
const WEATHER_RETRY_DELAYS_MS = [5000, 15000];

// how long to wait on a geolocation lookup before giving up and using the fallback. shorter than
// the 15s native timeout since that timeout isn't reliably honored on the pebble app
const GPS_WATCHDOG_MS = 10000;

// how long one weather attempt gets before its round is given up on. covers the gps watchdog plus
// a provider that chains a few requests at the 15s request timeout each
const WEATHER_ROUND_TIMEOUT_MS = 60 * 1000;

/**
 * Decides how long to wait before retrying a weather fetch, or null when no retry
 * should run. A successful fetch never retries, and the attempts are capped.
 *
 * @param resultOk Whether the fetch that just finished succeeded.
 * @param attempt How many retries have already run.
 * @return The delay in milliseconds before the next retry, or null when no retry should run.
 */
function weatherRetryDelayMs(resultOk: boolean, attempt: number): number | null {
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
function runWeatherRound(state: WeatherState, force: boolean, deps: WeatherDeps): void {
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
 * Starts the app: builds the Clay settings page, wires the lifecycle listeners,
 * and fetches weather on demand.
 *
 * @param options The face's Clay config, coordinate formatter, and any extra
 *   components or seed keys it needs.
 */
function startPebbleApp(options: StartOptions): void {
  const clayConfig = options.clayConfig;
  const formatCoords = options.formatCoords;

  // required here (not at module load) so the unit specs can use the shared
  // helpers without loading Clay or the per-face message_keys alias
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Clay = require('@rebble/clay/src/js/index') as ClayConstructor;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const messageKeys = require('message_keys');
  // auto-handling off so we own the send path: Clay's own webviewclosed handler sends the settings
  // through Pebble.sendAppMessage directly, which bypasses queueSend and collides with any other
  // in-flight send (the losing message drops with no retry). we open the config and send the saved
  // settings ourselves below so every send goes through the one queue
  const clay = new Clay(clayConfig, options.customClay, { autoHandleEvents: false });

  // register the location autocomplete (referenced as type "locationsearch" in
  // config.ts) before the settings page is built
  clay.registerComponent(locationComponent);

  // any face-specific custom components (e.g. a layout builder)
  (options.components || []).forEach((component) => clay.registerComponent(component));

  // the defaults declared in config.ts
  const DEFAULTS = collectDefaults(clayConfig);

  // the face's timezone fields, empty for a face that declares none
  const timezoneFields = timezoneFieldsIn(messageKeys);

  // the last string pushed for each timezone field, so a refresh only sends one whose offset moved
  let lastTimezoneValues: Record<string, string> = {};

  /**
   * Sends any timezone field whose zone has moved its clock since the last push.
   *
   * This is how a daylight saving switch reaches the watch. Nothing about the saved settings
   * changes, only what the zone reads, so no save is involved and nothing goes out until the
   * offset is genuinely different.
   *
   * A field is only recorded once the watch acks it, so a send that is dropped after its retries
   * is picked up again on the next tick rather than counted as delivered.
   */
  function pushTimezones() {
    if (!timezoneFields.length) {
      return;
    }

    const config = getConfig();
    const dict: AppMessageDict = {};
    const sent: Record<string, string> = {};
    let moved = false;

    timezoneFields.forEach((field) => {
      const saved = readValue(config[field.name], '');
      if (typeof saved !== 'string') {
        return;
      }

      const value = timezone.toWire(saved, Date.now());
      if (!value || lastTimezoneValues[field.name] === value) {
        return;
      }

      sent[field.name] = value;
      dict[field.key] = value;
      moved = true;
    });

    if (moved) {
      queueSend(dict, () => {
        Object.keys(sent).forEach((name) => { lastTimezoneValues[name] = sent[name]; });
      });
    }
  }

  let weatherSettingsBeforeConfig: string[] | null = null;

  // weather round state mutated in place by runWeatherRound
  const weatherState: WeatherState = { inFlight: false, round: 0 };

  // one AppMessage may be in flight at a time, so every send is serialized through this queue
  const queueSend = createSendQueue((dict, onOk, onFail) => Pebble.sendAppMessage(dict, onOk, onFail));

  // the weather dict the watch holds, so an unchanged refresh skips the redundant BLE wake.
  // forgotten on ready and on a watch-initiated request so the watch always gets a fresh answer
  const weatherSender = createDedupedSender<AppMessageDict>(
    queueSend,
    (dict) => dict,
    (left, right) => JSON.stringify(left) === JSON.stringify(right),
    'Weather'
  );

  // the features this face opted into, each started once with what the app shares. a face that
  // lists none never imports their code, so it stays out of that face's bundle
  const features: FeatureHooks[] = (options.features || []).map((feature) => feature({
    messageKeys,
    defaults: DEFAULTS,
    queueSend,
    refetchDelayMs: SETTINGS_REFETCH_DELAY_MS,
  }));

  /** Sends a weather result to the watch. */
  function sendWeather(result: any) {
    const dict: Record<string, any> = {
      [messageKeys.WEATHER_TEMPERATURE]: result.temperature,
      [messageKeys.WEATHER_CONDITIONS]: result.condition,
      [messageKeys.WEATHER_OK]: result.ok ? 1 : 0,
    };

    if (result.location && messageKeys.LOCATION_NAME !== undefined) {
      dict[messageKeys.LOCATION_NAME] = result.location;
    }

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

    Object.assign(dict, formatCoords(messageKeys, result));

    // a compound dict rather than one strip, so what is compared is a serialized signature of the
    // whole thing rather than a byte run
    weatherSender.push(dict);
  }

  /**
   * Fetches the weather once using GPS or the stored manual coordinates, and hands the
   * result to onResult. The config is read on every call so a retry sees the latest settings.
   */
  function fetchWeatherOnce(onResult: (result: any) => void) {
    const config = getConfig();

    const opts: any = {
      provider: String(readValue(config.WEATHER_PROVIDER, DEFAULTS.WEATHER_PROVIDER)),
      key: String(readValue(config.WEATHER_API_KEY, DEFAULTS.WEATHER_API_KEY || '')).trim().slice(0, 64),
      fahrenheit: readBool(config.WEATHER_TEMPERATURE_UNIT, DEFAULTS.WEATHER_TEMPERATURE_UNIT),
      coords: null,
      label: undefined,
      // only faces that declare a forecast key pay to fetch the strips. everyone
      // else skips the extra hourly block and the supplemental provider call
      wantForecast: messageKeys.WEATHER_FORECAST_HOURLY !== undefined || messageKeys.WEATHER_FORECAST_DAILY !== undefined,
    };

    const useGps = readBool(config.LOCATION_USE_GPS, DEFAULTS.LOCATION_USE_GPS);
    const gpsFallback = readBool(config.LOCATION_GPS_FALLBACK, DEFAULTS.LOCATION_GPS_FALLBACK);
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
    // reliably honored) which would strand a fallback user with nothing sent. the watchdog runs
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
    runWeatherRound(weatherState, Boolean(force), {
      fetchWeather: fetchWeatherOnce,
      sendWeather: sendWeather,
      timeoutMs: WEATHER_ROUND_TIMEOUT_MS,
    });
  }

  // while the JS is alive the phone drives its own refresh since a suspended JS never answers the
  // watch's poll. weather refreshes on the slow ticks since it changes slowly, and each feature
  // picks which ticks it wants
  const REFRESH_MS = 5 * 60 * 1000;
  const SLOW_REFRESH_EVERY = 6; // every ~30 min
  let refreshTimer: ReturnType<typeof setInterval> | null = null;
  let refreshTick = 0;

  /** Runs on the refresh timer. Refetches weather on the slow ticks, and lets each feature refresh too. */
  function backgroundRefresh() {
    refreshTick++;
    const slow = refreshTick % SLOW_REFRESH_EVERY === 0;
    if (slow) {
      getWeather();
    }
    pushTimezones();
    features.forEach((feature) => feature.refresh?.(slow));
  }

  // app lifecycle listeners
  Pebble.addEventListener('ready', () => {
    console.log('PebbleKit JS Ready!');
    queueSend({ [messageKeys.SETTINGS_REQUEST]: 1 });

    // clear the dedupe cache so a watch that just rebooted with empty stores gets a fresh send
    weatherSender.forget();
    lastTimezoneValues = {};

    getWeather();
    pushTimezones();
    features.forEach((feature) => feature.ready?.());

    // the timer dies when the JS is suspended so re-arm it fresh on every ready
    if (refreshTimer) {
      clearInterval(refreshTimer);
    }
    refreshTick = 0;
    refreshTimer = setInterval(backgroundRefresh, REFRESH_MS);
  });

  Pebble.addEventListener('appmessage', (event) => {
    const payload: Record<string, number | string> = event.payload || {};

    // the watch only asks when it needs data so clear the dedupe cache to force a fresh send. a
    // round already in flight starts no second fetch, but its own result still goes out once it lands
    if (payload[messageKeys.WEATHER_REQUEST]) {
      weatherSender.forget();
      getWeather();
    }

    features.forEach((feature) => feature.message?.(payload));

    // both restore paths seed the same way, so the face's key lists are named once here rather
    // than repeated at each call
    const seedFromWatch = (from: any) => {
      seedConfigFromWatch(messageKeys, from, options.seedKeys, options.seedColorKeys, options.seedBoolKeys);
    };

    // the watch's reply to our SETTINGS_REQUEST carries its current settings
    if (messageKeys.CLOCK_DATE_FORMAT in payload || messageKeys.APPEARANCE_THEME in payload) {
      // faces that declare SETTINGS_FRESH get the two-way restore: the watch flags when it booted
      // with no saved settings (wiped by an install or update) so we push our own config back
      // instead of letting its defaults seed over ours. faces without the key keep the old seed
      if (messageKeys.SETTINGS_FRESH !== undefined) {
        const config = getConfig();
        const phoneHasConfig = Object.keys(config).length > 0;
        const watchFresh = payload[messageKeys.SETTINGS_FRESH] === 1;

        if (watchFresh && phoneHasConfig) {
          // restore the watch from our saved config using the same dict a Save would send
          queueSend(retimeSettings(clay.getSettings(JSON.stringify(config)), messageKeys, Date.now()));
        } else if (!phoneHasConfig) {
          // nothing saved on the phone yet so recover it from the watch instead
          seedFromWatch(payload);
        }
        // both sides have settings: the phone is the source of truth and already correct
      } else {
        seedFromWatch(payload);
      }
    }
  });

  // Clay saves the new settings in its own webviewclosed handler which runs
  // before ours so capture the previous values while the page is still open
  Pebble.addEventListener('showConfiguration', () => {
    weatherSettingsBeforeConfig = weatherSettingsSnapshot();
    features.forEach((feature) => feature.configOpened?.());

    // Clay's auto-handling is off, so open the config page ourselves
    Pebble.openURL(clay.generateUrl());
  });

  Pebble.addEventListener('webviewclosed', (event) => {
    if (!event || !event.response) {
      return;
    }

    // send the saved settings to the watch through the queue. Clay's auto-handling would send this
    // directly and let it collide with an in-flight send (dropping the whole save with no retry)
    queueSend(retimeSettings(clay.getSettings(event.response), messageKeys, Date.now()));

    // only refetch when a weather setting actually changed. the C side already
    // re-requests for those so refetching on every save (theme or vibe) is wasted
    const weatherBefore = weatherSettingsBeforeConfig;
    weatherSettingsBeforeConfig = null;

    if (weatherSettingsChanged(weatherBefore, weatherSettingsSnapshot())) {
      // forced so it replaces a round still fetching with the old location or provider
      setTimeout(() => getWeather(true), SETTINGS_REFETCH_DELAY_MS);
    }

    // each feature refetches on its own settings change the same way
    features.forEach((feature) => feature.configSaved?.());
  });
}

export default {
  startPebbleApp,
  runWeatherRound,
  collectDefaults,
  request,
  getConfig,
  readValue,
  readBool,
  validCoord,
  getManualLocation,
  seedConfigFromWatch,
  retimeSettings,
  weatherSettingsSnapshot,
  weatherSettingsChanged,
  weatherRetryDelayMs,
  WEATHER_RETRY_DELAYS_MS,
  SETTINGS_REFETCH_DELAY_MS,
  WEATHER_KEYS,
};
