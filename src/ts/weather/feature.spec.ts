// @vitest-environment jsdom
/**
 * Specs for the weather feature's own helpers, and for its plugin mode.
 *
 * The coordinate checks, the saved-city reader, the retry delays, and the one-at-a-time weather
 * round are the parts a reader cannot check by eye. How the fetch rounds plug into the app's
 * lifecycle is covered with the app's own specs.
 *
 * Plugin mode is pinned here, driving the feature's hooks straight against the fake Pebble. What is
 * worth pinning is which save does what, since a unit change reconverts and a location change does
 * nothing, when a status goes to the watch and when a reading stays, what the seed keeps after a
 * reset, and that a face built without the define runs exactly as it always has. A face with no unit
 * key of its own shows its weather, from the plugin or a fetch, in the Pebble app's unit, and its
 * watch shows the number as sent, so the phone is the only side that can get the unit right. localStorage comes
 * from jsdom, and the plugin code is swapped for null where a spec needs a face without the define.
 */

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import weather, {
  validCoord,
  getManualLocation,
  weatherRetryDelayMs,
  runWeatherRound,
  WEATHER_RETRY_DELAYS_MS,
  WEATHER_KEYS,
  conditionLabel,
  weatherLabel,
} from './feature';
import buildConfig from '../pkjs/config-builder';
import { APP_UNIT_STORE, fetchKeys, PROVIDER_KEYS, UNIT_KEYS } from '../plugin-sources/weather-driver';
import { QUICK_RETRY_MS, QUICK_RETRY_WINDOW_MS } from '../plugin-sources/subscription';
import { withFakePebble } from '../testing/pebble';
import type { FakePebble } from '../testing/pebble';
import { installFakeXhr } from '../testing/xhr';
import type { FakeXhr } from '../testing/xhr';
import type { Feature, FeatureContext, FeatureHooks, ProviderLists } from '../pkjs/feature';
import type { ClayConfigItem } from '../clay/types';
import { PLUGIN_KINDS_TYPE, PLUGINS_OFF_TEXT } from '../plugin-sources/page';
import { escapeHtml } from '../plugin-sources/escape';
import { COORDS_TEXT, WEATHER_TEXTS } from '../plugin-sources/weather';

// a plugin serving neither the weather nor the calendar, so the phone's list is readable and not empty
const OTHER_PLUGIN = { uuid: 'other-uuid', name: 'Other', sources: [{ category: 'music', items: ['track'] }] };

// the plugin code a face built with PLUGIN_WEATHER finds, which a spec turns off to stand for a face
// built without it. the build writes null into the index then, which is what the getter hands back
const pluginCode = vi.hoisted(() => ({ off: false }));

vi.mock('../plugin-sources/index', async (importOriginal) => {
  const real = await importOriginal<typeof import('../plugin-sources/index')>();

  return {
    ...real,
    get weatherPlugins() {
      return pluginCode.off ? null : real.weatherPlugins;
    },
  };
});

/** The page without the plugin kinds store every kind's page hook puts first, so a spec reads the face's own rows. */
function faceRows(page: ClayConfigItem[]): ClayConfigItem[] {
  return page.filter((item) => item.type !== PLUGIN_KINDS_TYPE);
}

/** Every row on a page, sections and their rows included. */
function allRowsOf(page: ClayConfigItem[]): ClayConfigItem[] {
  return page.flatMap((item) => [item, ...allRowsOf(item.items || [])]);
}

describe('the plugin mode setting watches', () => {
  /** A weather setting in none of the three would change nothing in plugin mode and never refetch once the face goes back to fetching. */
  test('split the weather settings three ways with nothing left out', () => {
    const result = [...PROVIDER_KEYS, ...UNIT_KEYS, ...fetchKeys(WEATHER_KEYS)].sort();

    expect(result).toEqual([...WEATHER_KEYS].sort());
  });

  /** A fetch setting added to the feature's list has to refetch in plugin mode as well, with nothing else to update. */
  test('count a weather setting they have never heard of as one only a fetch reads', () => {
    const result = fetchKeys([...WEATHER_KEYS, 'WEATHER_NEW_SETTING']);

    expect(result).toEqual(['WEATHER_API_KEY', 'LOCATION_USE_GPS', 'LOCATION_GPS_FALLBACK', 'LOCATION_NAME', 'WEATHER_NEW_SETTING']);
  });
});

describe('validCoord', () => {
  /** An in-range pair is the only thing that should be forwarded to a provider. */
  test('accepts an in-range coordinate pair', () => {
    const result = validCoord(33.4, -112);

    expect(result).toBe(true);
  });

  /** Out-of-range or non-numeric coordinates must be rejected before they reach the network. */
  test.each([
    ['latitude too high', 91, 0],
    ['latitude too low', -91, 0],
    ['longitude too high', 0, 181],
    ['longitude too low', 0, -181],
    ['non-numeric latitude', '33', -112],
    ['missing longitude', 33, undefined],
  ])('rejects %s', (label, lat, lon) => {
    const result = validCoord(lat, lon);

    expect(result).toBe(false);
  });
});

describe('getManualLocation', () => {
  /** A valid saved place must yield its coordinates and label so the watch fetches the right city. */
  test('returns coordinates and label for an in-range saved location', () => {
    const config = { LOCATION_NAME: JSON.stringify({ lat: 33.4, lon: -112, label: 'Phoenix' }) };

    const result = getManualLocation(config);

    expect(result).toEqual({ coords: { lat: 33.4, lon: -112 }, label: 'Phoenix' });
  });

  /** An out-of-range blob must be treated as no manual location, never forwarded verbatim. */
  test('rejects an out-of-range saved coordinate', () => {
    const config = { LOCATION_NAME: JSON.stringify({ lat: 999, lon: -112, label: 'Bad' }) };

    const result = getManualLocation(config);

    expect(result).toBeNull();
  });

  /** Malformed JSON must not throw and must fall back to no location. */
  test('returns null for a malformed saved value', () => {
    const config = { LOCATION_NAME: 'not json' };

    const result = getManualLocation(config);

    expect(result).toBeNull();
  });

  /** An unset location must be null so the caller falls back to GPS or a no-location status. */
  test('returns null when no location is saved', () => {
    const result = getManualLocation({});

    expect(result).toBeNull();
  });
});

describe('conditionLabel', () => {
  /** The watch has no word table of its own, so a wrong or missing word here is what the panel shows. */
  test.each([
    ['PCLDY', 'Partly Cloudy'],
    ['PCLDY_NIGHT', 'Partly Cloudy'],
    ['NOPE', 'Unknown'],
    [undefined, 'Unknown'],
  ])('reads %s as %s', (token, expected) => {
    const result = conditionLabel(token);

    expect(result).toBe(expected);
  });
});

describe('weatherLabel', () => {
  /** Every provider today leaves conditionLabel unset, and its faces must keep the label they show now. */
  test('sends the words for the token when the result has none of its own', () => {
    const result = weatherLabel({ condition: 'FZRN_NIGHT' });

    expect(result).toBe('Freezing Rain');
  });

  /** The plugin's FZRN covers rain and snow, which the token's own words would call freezing rain. */
  test('sends the words a result carries of its own', () => {
    const result = weatherLabel({ condition: 'FZRN', conditionLabel: 'Rain and snow' });

    expect(result).toBe('Rain and snow');
  });

  /** A blank label would leave the panel empty where the token's words belong. */
  test('sends the words for the token when the result carries blank ones', () => {
    const result = weatherLabel({ condition: 'CLDY', conditionLabel: '' });

    expect(result).toBe('Cloudy');
  });
});

describe('weatherRetryDelayMs', () => {
  /** A successful fetch that still scheduled a retry would re-poll the provider for no reason. */
  test('returns null when the fetch succeeded', () => {
    const result = weatherRetryDelayMs(true, 0);

    expect(result).toBe(null);
  });

  /** Without the first retry a cold-launch miss sits blank until the 30-min poll. */
  test('returns the first delay when the first attempt failed', () => {
    const result = weatherRetryDelayMs(false, 0);

    expect(result).toBe(5000);
  });

  /** The second attempt must back off further so a still-warming gps gets more time. */
  test('returns the longer delay for the second attempt', () => {
    const result = weatherRetryDelayMs(false, 1);

    expect(result).toBe(15000);
  });

  /**
   * A bad key fails the same way seconds later, so each retry spent another call on the provider's
   * quota, plus the paired Open-Meteo call, for an answer that could not change.
   */
  test('returns null for a failure that waits on the settings', () => {
    const result = weatherRetryDelayMs(false, 0, 'INVALID KEY');

    expect(result).toBe(null);
  });

  /** A provider's call cap does not lift seconds later, so each retry only spent more of it. */
  test('returns null for a rate limit', () => {
    const result = weatherRetryDelayMs(false, 0, 'RATE LIMIT');

    expect(result).toBe(null);
  });

  /** A network failure can clear by the next try, so it still retries. */
  test('still retries a network failure', () => {
    const result = weatherRetryDelayMs(false, 0, 'NET ERROR');

    expect(result).toBe(5000);
  });

  /** Uncapped retries would loop forever on a genuinely bad key or a dead feed. */
  test('returns null once the attempts are used up', () => {
    const result = weatherRetryDelayMs(false, 2);

    expect(result).toBe(null);
  });
});

describe('runWeatherRound', () => {
  // a fresh round state for each test. it is the object getWeather carries in the closure
  function freshState() {
    return { inFlight: false, round: 0 };
  }

  type FakeResult = { ok: boolean; temperature?: number };

  // a fetch that holds each result callback open so a spec decides when and how it lands
  function heldFetches() {
    const callbacks: Array<(result: FakeResult) => void> = [];
    const deps = {
      fetchWeather: (onResult: (result: FakeResult) => void) => callbacks.push(onResult),
      sendWeather: vi.fn(),
      timeoutMs: 60000,
    };

    return { callbacks, deps };
  }

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  /** The watch re-asks every 3s until its first reading lands, and each ask must not start another gps fix and provider fetch. */
  test('ignores an unforced round while a fetch is running', () => {
    const state = freshState();
    const { callbacks, deps } = heldFetches();

    runWeatherRound(state, false, deps);
    runWeatherRound(state, false, deps);

    expect(callbacks).toHaveLength(1);
  });

  /** An ask landing between a failed fetch and its retry must not start a second retry chain. */
  test('ignores an unforced round while a retry is waiting', () => {
    const state = freshState();
    const { callbacks, deps } = heldFetches();

    runWeatherRound(state, false, deps);
    callbacks[0]({ ok: false });

    runWeatherRound(state, false, deps);

    expect(callbacks).toHaveLength(1);

    vi.advanceTimersByTime(WEATHER_RETRY_DELAYS_MS[0]);

    expect(callbacks).toHaveLength(2);
  });

  /** A weather setting change must replace a running round, and the old round's late result must not reach the watch. */
  test('lets a forced round replace a running one and ignores the old result', () => {
    const state = freshState();
    const { callbacks, deps } = heldFetches();

    runWeatherRound(state, false, deps);

    runWeatherRound(state, true, deps);
    callbacks[0]({ ok: true, temperature: 1 });
    callbacks[1]({ ok: true, temperature: 2 });

    expect(deps.sendWeather).toHaveBeenCalledTimes(1);
    expect(deps.sendWeather).toHaveBeenCalledWith({ ok: true, temperature: 2 });
    expect(state.inFlight).toBe(false);
  });

  /** A round replaced while it waits on a retry must not fire that retry later. */
  test('drops the pending retry when a forced round replaces it', () => {
    const state = freshState();
    const { callbacks, deps } = heldFetches();

    runWeatherRound(state, false, deps);
    callbacks[0]({ ok: false });

    runWeatherRound(state, true, deps);
    vi.advanceTimersByTime(WEATHER_RETRY_DELAYS_MS[0]);

    expect(callbacks).toHaveLength(2);
  });

  /** A fetch that never calls back must not hold off every later ask for the rest of the JS session. */
  test('frees the round via the watchdog when a fetch never calls back', () => {
    const state = freshState();
    const { callbacks, deps } = heldFetches();

    runWeatherRound(state, false, deps);

    vi.advanceTimersByTime(deps.timeoutMs);
    runWeatherRound(state, false, deps);

    expect(callbacks).toHaveLength(2);
  });

  /** Once the retries are used up the next ask has to be free to try again. */
  test('frees the round once the retries are used up', () => {
    const state = freshState();
    const { callbacks, deps } = heldFetches();

    runWeatherRound(state, false, deps);

    callbacks[0]({ ok: false });
    vi.advanceTimersByTime(WEATHER_RETRY_DELAYS_MS[0]);
    callbacks[1]({ ok: false });
    vi.advanceTimersByTime(WEATHER_RETRY_DELAYS_MS[1]);
    callbacks[2]({ ok: false });

    expect(deps.sendWeather).toHaveBeenCalledTimes(3);
    expect(state.inFlight).toBe(false);
  });

  /** A send that throws, say on a dict the bridge refuses, must not leave the round in flight or every later ask is dropped until the JS restarts. */
  test('frees the round when sending the result throws', () => {
    const state = freshState();
    const { callbacks, deps } = heldFetches();

    deps.sendWeather.mockImplementation(() => {
      throw new Error('bad dict');
    });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    runWeatherRound(state, false, deps);

    callbacks[0]({ ok: true });

    expect(state.inFlight).toBe(false);
  });
});

// every key the plugin mode specs read, each standing for its own name so a sent dict reads plainly
const PLUGIN_FACE_KEYS = {
  WEATHER_REQUEST: 'WEATHER_REQUEST',
  WEATHER_TEMPERATURE: 'WEATHER_TEMPERATURE',
  WEATHER_CONDITIONS: 'WEATHER_CONDITIONS',
  WEATHER_OK: 'WEATHER_OK',
  WEATHER_PROVIDER: 'WEATHER_PROVIDER',
  WEATHER_CONDITION_LABEL: 'WEATHER_CONDITION_LABEL',
} as unknown as Record<string, number>;

// the built-in weather plugin, trimmed to the readings the standard check reads
const BUILT_IN_WEATHER = {
  uuid: '00000000-0000-0000-0001-000000000002',
  name: 'Weather',
  sources: [{ category: 'weather', items: ['location'], properties: { temperature: ['numericValue'], condition_code: ['longText'] } }],
};

/** One update from the built-in plugin for one place, at a temperature in °C. */
function update(celsius: number | null, extra: Record<string, unknown> = {}) {
  const temperature = celsius === null ? {} : { temperature: { numericValue: { value: celsius, unit: '°C' } } };

  return {
    pluginUuid: BUILT_IN_WEATHER.uuid,
    instances: [{ instanceId: 'home', properties: { ...temperature, condition_code: { longText: { text: 'cloudy' } }, name: { shortText: { text: 'Home' } }, ...extra } }],
  };
}

/** Saves the wearer's settings the way Clay leaves them in localStorage. */
function saveSettings(settings: Record<string, unknown>): void {
  localStorage.setItem('clay-settings', JSON.stringify(settings));
}

/** Puts what the subscription saved last session where it reads it back. */
function saveSourceState(state: Record<string, unknown>): void {
  localStorage.setItem('pluginSource:weather/location', JSON.stringify(state));
}

/**
 * A face with the weather keys and its sends recorded, each acked straight away, and with ready
 * already run when asked. Fetches go to the fake XMLHttpRequest, so a spec counts them without
 * touching the network.
 */
function startFace(options: { providers?: ProviderLists | null; feature?: Feature; ready?: boolean; unit?: 'own' | 'default' | 'none' } = {}) {
  const sends: Record<string, unknown>[] = [];
  const queueSend = vi.fn((dict: Record<string, unknown>, onOk?: () => void) => {
    sends.push(dict);
    onOk?.();
  });
  const feature = options.feature || weather;
  // the face has a temperature unit of its own, its key and its page default, unless the spec says
  // otherwise. a face can have the page default with no key, or neither
  const unit = options.unit || 'own';
  const messageKeys = unit === 'own' ? { ...PLUGIN_FACE_KEYS, WEATHER_TEMPERATURE_UNIT: 'WEATHER_TEMPERATURE_UNIT' as unknown as number } : PLUGIN_FACE_KEYS;
  const defaults: Record<string, unknown> = { WEATHER_PROVIDER: 'openmeteo', LOCATION_USE_GPS: false };

  if (unit !== 'none') {
    defaults.WEATHER_TEMPERATURE_UNIT = 0;
  }

  const hooks = feature({
    messageKeys,
    defaults,
    queueSend: queueSend as unknown as FeatureContext['queueSend'],
    refetchDelayMs: 250,
    providers: options.providers === undefined ? null : options.providers,
  });

  if (options.ready) {
    hooks.ready?.();
  }

  return { hooks, sends };
}

/** Saves a page visit's new settings between the open and the close, as the phone does. */
function saveFromPage(hooks: FeatureHooks, settings: Record<string, unknown>): void {
  hooks.configOpened?.();
  saveSettings(settings);
  hooks.configSaved?.();
}

describe('weather plugin mode', () => {
  let pebble: FakePebble;
  let fetches: FakeXhr[];

  // a saved city with gps off, so a fetch round is one Open-Meteo request
  const CITY = { LOCATION_USE_GPS: false, LOCATION_NAME: JSON.stringify({ lat: 43.7, lon: -79.4, label: 'Toronto' }) };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(Date.UTC(2026, 6, 1, 16, 20));
    localStorage.clear();
    pebble = withFakePebble();
    pebble.plugins = [BUILT_IN_WEATHER];
    fetches = installFakeXhr();
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    pebble.restore();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  /** A second ready in one session that left the first subscription running would send every update twice. */
  test('leaves one subscription running after a second ready', () => {
    saveSettings({ WEATHER_PROVIDER: 'plugin' });
    const { hooks } = startFace();

    hooks.ready?.();
    hooks.ready?.();

    expect(pebble.subscriptions).toHaveLength(2);
    expect(pebble.live()).toHaveLength(1);
  });

  /** A wearer who picked the plugin and still got an Open-Meteo fetch would spend the network on weather nothing shows. */
  test('subscribes rather than fetching on ready while the plugin is picked', () => {
    saveSettings({ ...CITY, WEATHER_PROVIDER: 'plugin' });
    const { hooks } = startFace();

    hooks.ready?.();

    expect(pebble.live()).toHaveLength(1);
    expect(fetches).toHaveLength(0);
  });

  /** The watch takes plugin weather through the keys a fetch fills, so a reading that went anywhere else would never show. */
  test('sends an update to the watch as a reading in the face\'s unit', () => {
    saveSettings({ WEATHER_PROVIDER: 'plugin' });
    const { sends } = startFace({ ready: true });

    pebble.live()[0].push(update(21));

    expect(sends).toEqual([{ WEATHER_TEMPERATURE: 21, WEATHER_CONDITIONS: 'CLDY', WEATHER_OK: 1, WEATHER_CONDITION_LABEL: 'Cloudy' }]);
  });

  /** The plugin's own words carry what a coarse token loses, so rain and snow must not read as freezing rain. */
  test('labels the sky with the plugin\'s own words when it sends them', () => {
    saveSettings({ WEATHER_PROVIDER: 'plugin' });
    const { sends } = startFace({ ready: true });

    pebble.live()[0].push(update(1, { condition_code: { longText: { text: 'rain_and_snow' } }, condition: { shortText: { text: 'Rain and snow' } } }));

    expect(sends[0]).toMatchObject({ WEATHER_CONDITIONS: 'FZRN', WEATHER_CONDITION_LABEL: 'Rain and snow' });
  });

  /** The plugin refreshes every 15 minutes with the same reading, and each identical send would wake the watch for nothing. */
  test('skips an update that would send the watch what it already holds', () => {
    saveSettings({ WEATHER_PROVIDER: 'plugin' });
    const { sends } = startFace({ ready: true });

    pebble.live()[0].push(update(21));
    pebble.live()[0].push(update(21));

    expect(sends).toHaveLength(1);
  });

  /** A watch that rebooted asks with empty stores, and the plugin may not send again for 15 minutes. */
  test('resends the last update on a watch ask without starting a new subscription', () => {
    saveSettings({ WEATHER_PROVIDER: 'plugin' });
    const { hooks, sends } = startFace();

    hooks.ready?.();
    pebble.live()[0].push(update(21));

    hooks.message?.({ WEATHER_REQUEST: 1 });

    expect(sends).toHaveLength(2);
    expect(sends[1]).toEqual(sends[0]);
    expect(pebble.subscriptions).toHaveLength(1);
  });

  /** A rebooted watch with no reading and no reason shown leaves the wearer guessing why the panel is blank. */
  test('answers a watch ask before the first update with the status the saved error calls for', () => {
    saveSettings({ WEATHER_PROVIDER: 'plugin' });
    saveSourceState({ pluginUuid: null, lastError: 'PERMISSION_DENIED', lastEmpty: false });
    const { hooks, sends } = startFace({ ready: true });

    hooks.message?.({ WEATHER_REQUEST: 1 });

    expect(sends).toEqual([{ WEATHER_TEMPERATURE: 0, WEATHER_CONDITIONS: 'NO PERMISSION', WEATHER_OK: 0, WEATHER_CONDITION_LABEL: 'Unknown' }]);
    expect(pebble.subscriptions).toHaveLength(1);
  });

  /** Location not yet allowed is something the wearer can fix, but only if the watch says so. */
  test('sends No Permission for a denied permission before any reading', () => {
    saveSettings({ WEATHER_PROVIDER: 'plugin' });
    const { sends } = startFace({ ready: true });

    pebble.live()[0].fail({ code: 'PERMISSION_DENIED', message: 'Location' });

    expect(sends.map((dict) => dict.WEATHER_CONDITIONS)).toEqual(['NO PERMISSION']);
  });

  /** A passing error would cover a good reading with a status, and the panel would go blank for no reason. */
  test('keeps the reading on the watch for an error after it', () => {
    saveSettings({ WEATHER_PROVIDER: 'plugin' });
    const { hooks, sends } = startFace();

    hooks.ready?.();
    pebble.live()[0].push(update(21));

    pebble.live()[0].fail({ code: 'PERMISSION_DENIED', message: 'Location' });

    expect(sends).toHaveLength(1);
  });

  /**
   * The phone ends the subscription on PLUGIN_UNAVAILABLE and the kept update goes with it, so the
   * reading on the watch is out of date. Leaving it there would show old weather as current.
   */
  test('sends No Plugin for an ending error after a reading', () => {
    saveSettings({ WEATHER_PROVIDER: 'plugin' });
    const { sends } = startFace({ ready: true });

    pebble.live()[0].push(update(21));

    pebble.live()[0].fail({ code: 'PLUGIN_UNAVAILABLE', message: 'gone' });

    expect(sends.map((dict) => dict.WEATHER_CONDITIONS)).toEqual(['CLDY', 'NO PLUGIN']);
  });

  /** Plugins switched off after a reading leave nothing serving the item, and the old reading must not stand as current. */
  test('sends No Plugin on a ready with plugins off after a reading', () => {
    saveSettings({ WEATHER_PROVIDER: 'plugin' });
    const { hooks, sends } = startFace({ ready: true });

    pebble.live()[0].push(update(21));
    pebble.plugins = [];

    hooks.ready?.();

    expect(sends.map((dict) => dict.WEATHER_CONDITIONS)).toEqual(['CLDY', 'NO PLUGIN']);
  });

  /**
   * A seed can save the plugin with no ready or save after it, such as a seed while the settings
   * page is open. A unit never started is one retryIfIdle cannot bring back, so the slow
   * tick has to start it, or the face fetches nothing and subscribes to nothing until the next ready.
   */
  test('starts the subscription on a slow tick when the plugin was picked with nothing started', () => {
    saveSettings({ ...CITY, WEATHER_PROVIDER: 'openmeteo' });
    const { hooks } = startFace({ ready: true });

    saveSettings({ ...CITY, WEATHER_PROVIDER: 'plugin' });

    hooks.refresh?.(true);

    expect(pebble.live()).toHaveLength(1);
  });

  /** The watch asks again until it has a reading, so its ask is the soonest chance to start a plugin nothing started. */
  test('starts the subscription on a watch ask when the plugin was picked with nothing started', () => {
    saveSettings({ ...CITY, WEATHER_PROVIDER: 'openmeteo' });
    const { hooks } = startFace({ ready: true });

    saveSettings({ ...CITY, WEATHER_PROVIDER: 'plugin' });

    hooks.message?.({ WEATHER_REQUEST: 1 });

    expect(pebble.live()).toHaveLength(1);
    expect(fetches).toHaveLength(1);
  });

  /**
   * A seed while the page is open, with the page then cancelled, brings the plugin back with no save
   * after it. The seed is the last thing to touch the choice, so it has to start the subscription.
   */
  test('starts the subscription once the seed brings back the plugin', () => {
    saveSettings({ ...CITY, WEATHER_PROVIDER: 'openmeteo' });
    const { hooks } = startFace({ ready: true });
    const restored = { ...CITY, WEATHER_PROVIDER: 'plugin' };

    hooks.seeded?.(restored, (name) => restored[name as keyof typeof restored]);

    expect(pebble.live()).toHaveLength(1);
  });

  /**
   * The subscription reports no plugin while the seed's hook runs, before the seed saves. Reading the
   * choice from the settings already saved would stop it there and send nothing, so the watch never
   * learns why it has no reading.
   */
  test('sends No Plugin for a seed bringing back the plugin while none serves it', () => {
    saveSettings({ ...CITY, WEATHER_PROVIDER: 'openmeteo' });
    pebble.plugins = [];
    const { hooks, sends } = startFace();
    const restored = { ...CITY, WEATHER_PROVIDER: 'plugin' };

    hooks.seeded?.(restored, (name) => restored[name as keyof typeof restored]);

    expect(sends.map((dict) => dict.WEATHER_CONDITIONS)).toEqual(['NO PLUGIN']);
  });

  /** A seed with the page closed starts the plugin, and the save straight after it must not subscribe a second time. */
  test('subscribes once for a seed followed by a save onto the plugin', () => {
    const { hooks } = startFace({ ready: true });
    const restored = { WEATHER_PROVIDER: 'plugin' };

    hooks.configOpened?.();
    hooks.seeded?.(restored, (name) => restored[name as keyof typeof restored]);
    saveSettings(restored);
    hooks.configSaved?.();

    expect(pebble.subscriptions).toHaveLength(1);
  });

  /** A save that leaves the plugin has to end the subscription, or its readings keep covering the fetched ones. */
  test('stops a started subscription for a save that leaves the plugin', () => {
    saveSettings({ ...CITY, WEATHER_PROVIDER: 'plugin' });
    const { hooks } = startFace({ ready: true });

    saveFromPage(hooks, { ...CITY, WEATHER_PROVIDER: 'owm', WEATHER_API_KEY: 'abc' });

    expect(pebble.live()).toHaveLength(0);
  });

  /** A choice that moved off the plugin with no save after it would keep the plugin's readings covering the fetched ones. */
  test('stops a subscription left running once the choice moved off the plugin', () => {
    saveSettings({ ...CITY, WEATHER_PROVIDER: 'plugin' });
    const { hooks } = startFace({ ready: true });

    saveSettings({ ...CITY, WEATHER_PROVIDER: 'openmeteo' });

    hooks.refresh?.(true);

    expect(pebble.live()).toHaveLength(0);
    expect(fetches).toHaveLength(1);
  });

  /** An empty list means the Pebble app has no weather place yet, which the wearer fixes there. */
  test('sends No Location for an update with no places', () => {
    saveSettings({ WEATHER_PROVIDER: 'plugin' });
    const { sends } = startFace({ ready: true });

    pebble.live()[0].push({ pluginUuid: BUILT_IN_WEATHER.uuid, instances: [] });

    expect(sends.map((dict) => dict.WEATHER_CONDITIONS)).toEqual(['NO LOCATION']);
  });

  /** A plugin with its own names for the readings would otherwise leave the watch on an empty reading, and the page needs the uuid to warn about it. */
  test('sends No Wx Data for an update with no usable temperature and keeps who sent it', () => {
    saveSettings({ WEATHER_PROVIDER: 'plugin' });
    const { sends } = startFace({ ready: true });

    pebble.live()[0].push({ ...update(null), pluginUuid: 'odd-uuid' });

    expect(sends.map((dict) => dict.WEATHER_CONDITIONS)).toEqual(['NO WX DATA']);
    expect(JSON.parse(localStorage.getItem('pluginSource:weather/location') as string).pluginUuid).toBe('odd-uuid');
  });

  /**
   * Plugins switched off after the pick. A fetch would most likely end on No Location, since the
   * location rows were hidden, so the face says No Plugin and keeps the choice for when they come back.
   */
  test('sends No Plugin with no plugin on the phone, starts no fetch, and subscribes on a later slow tick once one is back', () => {
    saveSettings({ ...CITY, WEATHER_PROVIDER: 'plugin' });
    pebble.plugins = [];
    const { hooks, sends } = startFace();

    hooks.ready?.();
    pebble.plugins = [BUILT_IN_WEATHER];
    hooks.refresh?.(true);

    expect(sends.map((dict) => dict.WEATHER_CONDITIONS)).toEqual(['NO PLUGIN']);
    expect(fetches).toHaveLength(0);
    expect(pebble.live()).toHaveLength(1);
  });

  /** A wearer who turns plugins on while the face runs would otherwise wait for the slow tick, about half an hour, to see weather. */
  test('sends the reading of a plugin turned on while the face runs within the quick retry', () => {
    saveSettings({ ...CITY, WEATHER_PROVIDER: 'plugin' });
    pebble.plugins = [];
    const { hooks, sends } = startFace();

    hooks.ready?.();
    pebble.plugins = [BUILT_IN_WEATHER];
    vi.advanceTimersByTime(QUICK_RETRY_MS);
    pebble.live()[0].push(update(21));

    const result = sends.map((dict) => dict.WEATHER_CONDITIONS === 'NO PLUGIN' ? 'NO PLUGIN' : dict.WEATHER_TEMPERATURE);

    expect(result).toEqual(['NO PLUGIN', 21]);
    expect(fetches).toHaveLength(0);
  });

  /** A status sent on every retry would wake the watch every two minutes to show the No Plugin it already shows. */
  test('sends No Plugin once across quick retries the phone keeps ending', () => {
    saveSettings({ WEATHER_PROVIDER: 'plugin' });
    const { sends } = startFace({ ready: true });

    pebble.subscriptions[0].fail({ code: 'PLUGIN_UNAVAILABLE', message: 'gone' });

    for (let retry = 0; retry < 3; retry++) {
      vi.advanceTimersByTime(QUICK_RETRY_MS);
      pebble.subscriptions[pebble.subscriptions.length - 1].fail({ code: 'PLUGIN_UNAVAILABLE', message: 'gone' });
    }

    const result = sends.map((dict) => dict.WEATHER_CONDITIONS);

    expect(result).toEqual(['NO PLUGIN']);
    expect(pebble.subscriptions).toHaveLength(4);
  });

  /** A wearer opening the settings to turn plugins on, after the quick retry has given up, would otherwise wait for the slow tick. */
  test('retries quickly again once the settings page opens', () => {
    saveSettings({ WEATHER_PROVIDER: 'plugin' });
    pebble.plugins = [];
    const { hooks } = startFace({ ready: true });

    vi.advanceTimersByTime(QUICK_RETRY_WINDOW_MS);
    hooks.configOpened?.();
    pebble.plugins = [BUILT_IN_WEATHER];
    vi.advanceTimersByTime(QUICK_RETRY_MS);

    const result = pebble.live();

    expect(result).toHaveLength(1);
  });

  /** A wearer who moved to a fetching provider must not have a plugin subscribed behind the fetch two minutes later. */
  test('stops the quick retry for a switch away from the plugin', () => {
    saveSettings({ ...CITY, WEATHER_PROVIDER: 'plugin' });
    pebble.plugins = [];
    const { hooks } = startFace();

    hooks.ready?.();
    saveFromPage(hooks, { ...CITY, WEATHER_PROVIDER: 'openmeteo' });
    pebble.plugins = [BUILT_IN_WEATHER];
    vi.advanceTimersByTime(QUICK_RETRY_MS * 2);

    const result = pebble.subscriptions;

    expect(result).toHaveLength(0);
  });

  /** The plugin refreshes itself, so a quick tick that subscribed again would only churn the phone's bridge. */
  test('does nothing on a tick that is not a slow one', () => {
    saveSettings({ WEATHER_PROVIDER: 'plugin' });
    pebble.plugins = [];
    const { hooks } = startFace();

    hooks.ready?.();
    pebble.plugins = [BUILT_IN_WEATHER];

    hooks.refresh?.(false);

    expect(pebble.subscriptions).toHaveLength(0);
  });

  /** The watch converts what it holds when the unit flips, so the phone has to send the kept update again in the new unit, and a fetch would be for nothing. */
  test('converts the kept update again for a unit-only save, with no fetch', () => {
    saveSettings({ ...CITY, WEATHER_PROVIDER: 'plugin' });
    const { hooks, sends } = startFace();

    hooks.ready?.();
    pebble.live()[0].push(update(21));

    saveFromPage(hooks, { ...CITY, WEATHER_PROVIDER: 'plugin', WEATHER_TEMPERATURE_UNIT: 1 });
    vi.advanceTimersByTime(1000);

    expect(sends.map((dict) => dict.WEATHER_TEMPERATURE)).toEqual([21, 70]);
    expect(fetches).toHaveLength(0);
  });

  /** A wearer who saves the plugin again after the phone ended it would otherwise wait for the slow tick, half an hour away. */
  test('starts a subscription the phone ended again for a save onto the plugin', () => {
    saveSettings({ ...CITY, WEATHER_PROVIDER: 'plugin' });
    const { hooks } = startFace({ ready: true });

    pebble.live()[0].fail({ code: 'PLUGIN_UNAVAILABLE', message: 'gone' });
    saveFromPage(hooks, { ...CITY, WEATHER_PROVIDER: 'plugin' });

    expect(pebble.live()).toHaveLength(1);
    expect(pebble.subscriptions).toHaveLength(2);
  });

  /** The location rows are hidden in plugin mode, and a save that touched one must not start anything. */
  test('does nothing for a location-only save in plugin mode', () => {
    saveSettings({ ...CITY, WEATHER_PROVIDER: 'plugin' });
    const { hooks, sends } = startFace();

    hooks.ready?.();
    pebble.live()[0].push(update(21));

    saveFromPage(hooks, { ...CITY, WEATHER_PROVIDER: 'plugin', LOCATION_NAME: JSON.stringify({ lat: 51.5, lon: -0.1, label: 'London' }) });
    vi.advanceTimersByTime(1000);

    expect(sends).toHaveLength(1);
    expect(fetches).toHaveLength(0);
    expect(pebble.subscriptions).toHaveLength(1);
  });

  /** A subscription left running after the switch would keep overwriting the fetched reading with the plugin's. */
  test('ends the subscription and fetches once for a switch away from the plugin', () => {
    saveSettings({ ...CITY, WEATHER_PROVIDER: 'plugin' });
    const { hooks } = startFace({ ready: true });

    saveFromPage(hooks, { ...CITY, WEATHER_PROVIDER: 'openmeteo' });
    vi.advanceTimersByTime(250);

    expect(pebble.live()).toHaveLength(0);
    expect(fetches).toHaveLength(1);
  });

  /** A fetch still out for the old provider would land after the switch and put its reading over the plugin's. */
  test('subscribes for a switch to the plugin and drops the round still out', () => {
    saveSettings({ ...CITY, WEATHER_PROVIDER: 'openmeteo' });
    const { hooks, sends } = startFace({ ready: true });

    saveFromPage(hooks, { ...CITY, WEATHER_PROVIDER: 'plugin' });
    fetches[0].respond(200, JSON.stringify({ current: { temperature_2m: 30, weather_code: 0, is_day: 1 } }));
    vi.advanceTimersByTime(1000);

    expect(pebble.live()).toHaveLength(1);
    expect(fetches).toHaveLength(1);
    expect(sends).toHaveLength(0);
  });

  /** Every launch fetched twice, once as the phone came up and again for the watch's ask a moment after. */
  test('answers the ask that follows a launch with the reading it just fetched', () => {
    saveSettings({ ...CITY, WEATHER_PROVIDER: 'openmeteo' });
    const { hooks, sends } = startFace({ ready: true });

    fetches[0].respond(200, JSON.stringify({ current: { temperature_2m: 30, weather_code: 0, is_day: 1 } }));
    vi.advanceTimersByTime(2000);
    hooks.message?.({ WEATHER_REQUEST: 1 });

    expect(fetches).toHaveLength(1);
    expect(sends).toHaveLength(2);
    expect(sends[1]).toEqual(sends[0]);
  });

  /** The watch's own poll after the gap has to fetch, or the reading never moves on. */
  test('fetches for an ask a minute after the last fetch', () => {
    saveSettings({ ...CITY, WEATHER_PROVIDER: 'openmeteo' });
    const { hooks } = startFace({ ready: true });

    fetches[0].respond(200, JSON.stringify({ current: { temperature_2m: 30, weather_code: 0, is_day: 1 } }));
    vi.advanceTimersByTime(60 * 1000);
    hooks.message?.({ WEATHER_REQUEST: 1 });

    expect(fetches).toHaveLength(2);
  });

  /** A save that changes the place has to fetch the new one, however soon after the last fetch it lands. */
  test('fetches for a save just after a fetch', () => {
    saveSettings({ ...CITY, WEATHER_PROVIDER: 'openmeteo' });
    const { hooks } = startFace({ ready: true });

    fetches[0].respond(200, JSON.stringify({ current: { temperature_2m: 30, weather_code: 0, is_day: 1 } }));
    saveFromPage(hooks, { WEATHER_PROVIDER: 'openmeteo', LOCATION_USE_GPS: false, LOCATION_NAME: JSON.stringify({ lat: 51.05, lon: -114.07, label: 'Calgary' }) });
    vi.advanceTimersByTime(250);

    expect(fetches).toHaveLength(2);
  });

  /** A failed fetch has nothing worth resending, so the watch's ask tries again. */
  test('fetches for an ask just after a failed fetch', () => {
    saveSettings({ ...CITY, WEATHER_PROVIDER: 'openmeteo' });
    const { hooks } = startFace({ ready: true });

    // the first try and both retries fail, which ends the round about 20 seconds in
    for (const waitMs of [...WEATHER_RETRY_DELAYS_MS, 0]) {
      fetches[fetches.length - 1].respond(500, 'down');
      vi.advanceTimersByTime(waitMs);
    }

    hooks.message?.({ WEATHER_REQUEST: 1 });

    expect(fetches).toHaveLength(WEATHER_RETRY_DELAYS_MS.length + 2);
  });

  /** A face with the define and Open-Meteo picked has to fetch exactly as one without it does. */
  test('fetches with the provider picked while it is a fetching one', () => {
    saveSettings({ ...CITY, WEATHER_PROVIDER: 'openmeteo' });
    const { hooks } = startFace();

    hooks.ready?.();

    expect(fetches).toHaveLength(1);
    expect(pebble.subscriptions).toHaveLength(0);
  });
});

describe('weather plugin mode with the provider never saved', () => {
  let pebble: FakePebble;
  let fetches: FakeXhr[];

  // a saved city with gps off and no provider, as a first launch with only the location set leaves it
  const CITY = { LOCATION_USE_GPS: false, LOCATION_NAME: JSON.stringify({ lat: 43.7, lon: -79.4, label: 'Toronto' }) };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(Date.UTC(2026, 6, 1, 16, 20));
    localStorage.clear();
    pebble = withFakePebble();
    pebble.plugins = [BUILT_IN_WEATHER];
    fetches = installFakeXhr();
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    pebble.restore();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  /** A fresh install on a phone that already has a weather plugin would otherwise fetch a provider the wearer never chose. */
  test('subscribes rather than fetching while a plugin serves the weather', () => {
    saveSettings(CITY);

    startFace({ ready: true });

    expect(pebble.live()).toHaveLength(1);
    expect(fetches).toHaveLength(0);
  });

  /** A list the phone will not give says nothing about what is installed, so a fresh install keeps the face's default. */
  test('fetches the face\'s default while the plugin list cannot be read', () => {
    pebble.enumeratePlugins.mockImplementation(() => {
      throw new Error('bridge broke');
    });
    saveSettings(CITY);

    startFace({ ready: true });

    expect(pebble.subscriptions).toHaveLength(0);
    expect(fetches).toHaveLength(1);
  });

  /** A wearer who never chose the plugin would otherwise sit on old weather once plugins go off. */
  test('ends the subscription and fetches the face\'s default on a slow tick once plugins go off', () => {
    saveSettings(CITY);
    const { hooks } = startFace({ ready: true });

    pebble.plugins = [];
    vi.advanceTimersByTime(60 * 1000);
    hooks.refresh?.(true);

    expect(pebble.subscriptions).toHaveLength(1);
    expect(pebble.live()).toHaveLength(0);
    expect(fetches).toHaveLength(1);
  });

  /**
   * A page that opened on the plugin for a provider never saved, then saved the face's default, leaves
   * the saved provider reading the same as before. Without counting the move the watch would keep the
   * plugin's weather until the slow tick.
   */
  test('fetches for a first save onto the face\'s default from a page that opened on the plugin', () => {
    saveSettings(CITY);
    const { hooks } = startFace({ ready: true });

    saveFromPage(hooks, { ...CITY, WEATHER_PROVIDER: 'openmeteo' });
    vi.advanceTimersByTime(250);

    expect(pebble.subscriptions).toHaveLength(1);
    expect(pebble.live()).toHaveLength(0);
    expect(fetches).toHaveLength(1);
  });

  /**
   * A wearer who never chose the plugin would otherwise be left on the plugin's last reading, with
   * no status and no fetch, until the slow tick half an hour later.
   */
  test('fetches the face\'s default at once when the phone stops serving the weather', () => {
    saveSettings(CITY);
    const { sends } = startFace({ ready: true });

    pebble.plugins = [];
    pebble.live()[0].fail({ code: 'PLUGIN_UNAVAILABLE', message: 'plugins turned off' });

    expect(pebble.live()).toHaveLength(0);
    expect(fetches).toHaveLength(1);
    expect(sends.map((dict) => dict.WEATHER_CONDITIONS)).not.toContain('NO PLUGIN');
  });

  /** A plugin list the phone cannot give once says nothing about the plugin, so the weather it is sending has to keep coming. */
  test('keeps following its plugin through a list the phone will not give', () => {
    saveSettings(CITY);
    const { hooks, sends } = startFace({ ready: true });

    pebble.enumeratePlugins.mockImplementation(() => {
      throw new Error('bridge broke');
    });
    pebble.live()[0].push(update(21));
    vi.advanceTimersByTime(60 * 1000);
    hooks.refresh?.(true);

    expect(sends.map((dict) => dict.WEATHER_TEMPERATURE)).toEqual([21]);
    expect(pebble.live()).toHaveLength(1);
    expect(fetches).toHaveLength(0);
  });

  /** A plugin can send many updates, and reading the phone's plugin list for each would be a call into the phone every time. */
  test('reads the plugin list no more for each update', () => {
    saveSettings(CITY);
    startFace({ ready: true });
    const before = pebble.enumeratePlugins.mock.calls.length;

    pebble.live()[0].push(update(21));
    pebble.live()[0].push(update(22));
    pebble.live()[0].push(update(23));

    expect(pebble.enumeratePlugins.mock.calls.length).toBe(before);
  });

  /** A first save of the plugin the face already reads is no switch, so a unit change in it has to convert the kept update. */
  test('converts the kept update again for a first save onto the plugin that changes the unit', () => {
    saveSettings(CITY);
    const { hooks, sends } = startFace({ ready: true });

    pebble.live()[0].push(update(21));
    saveFromPage(hooks, { ...CITY, WEATHER_PROVIDER: 'plugin', WEATHER_TEMPERATURE_UNIT: 1 });
    vi.advanceTimersByTime(1000);

    expect(sends.map((dict) => dict.WEATHER_TEMPERATURE)).toEqual([21, 70]);
    expect(pebble.subscriptions).toHaveLength(1);
    expect(fetches).toHaveLength(0);
  });
});

describe('weather plugin mode for a plugin only face', () => {
  let pebble: FakePebble;
  let fetches: FakeXhr[];

  beforeEach(() => {
    localStorage.clear();
    pebble = withFakePebble();
    pebble.plugins = [BUILT_IN_WEATHER];
    fetches = installFakeXhr();
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    pebble.restore();
    vi.restoreAllMocks();
  });

  /** The face offers nothing else, so a saved fetching provider left over from before must not start a fetch. */
  test('subscribes on ready whatever provider is saved', () => {
    saveSettings({ WEATHER_PROVIDER: 'owm', LOCATION_USE_GPS: false });
    const { hooks } = startFace({ providers: { weather: ['plugin'] } });

    hooks.ready?.();

    expect(pebble.live()).toHaveLength(1);
    expect(fetches).toHaveLength(0);
  });

  /** With plugins off the panel shows No Plugin from the first start, since a plugin only face has nothing else to show. */
  test('sends No Plugin on the first ready with no plugin serving the item', () => {
    pebble.plugins = [];
    const { hooks, sends } = startFace({ providers: { weather: ['plugin'] } });

    hooks.ready?.();

    expect(sends.map((dict) => dict.WEATHER_CONDITIONS)).toEqual(['NO PLUGIN']);
  });

  /** There is no provider choice to switch, so a save holding one must leave the subscription be. */
  test('switches nothing for a save that changes the saved provider', () => {
    const { hooks } = startFace({ providers: { weather: ['plugin'] }, ready: true });

    saveFromPage(hooks, { WEATHER_PROVIDER: 'openmeteo' });

    expect(pebble.live()).toHaveLength(1);
    expect(pebble.subscriptions).toHaveLength(1);
  });

  /** A plugin only face keeps no choice on the watch, so a seed has nothing to bring back. */
  test('brings no seeded hook', () => {
    const { hooks } = startFace({ providers: { weather: ['plugin'] } });

    const result = hooks.seeded;

    expect(result).toBeUndefined();
  });

  /**
   * With no select on the page, the note under the face's marked line is the only thing saying that
   * plugins have to be on. A page opened before the feature ever ran has no saved error, so the note has
   * to come from the plugin list. The watch shows nothing then, so no note says where its data comes from.
   */
  test('puts only the note to turn plugins on under its marked line while nothing serves the weather', () => {
    pebble.plugins = [OTHER_PLUGIN];
    const { hooks } = startFace({ providers: { weather: ['plugin'] } });
    const line: ClayConfigItem = { type: 'heading', defaultValue: 'Plugin Only', pluginSourceRows: 'weather' };

    const result = faceRows(hooks.page?.([{ type: 'section', items: [line] }]) || [])[0].items;

    expect(result).toEqual([line, { type: 'pluginNote', tone: 'warning', defaultValue: escapeHtml(PLUGINS_OFF_TEXT) }]);
  });

  /** With plugins off the panel at the foot already says to turn them on, so the note is not said twice. */
  test('leaves the note to turn plugins on to the panel with plugins off', () => {
    pebble.plugins = [];
    const { hooks } = startFace({ providers: { weather: ['plugin'] } });
    const line: ClayConfigItem = { type: 'heading', defaultValue: 'Plugin Only', pluginSourceRows: 'weather' };

    const result = faceRows(hooks.page?.([{ type: 'section', items: [line] }]) || [])[0].items;

    expect(result).toEqual([line]);
  });

  /** A plugin serving the weather needs nothing from the wearer, so the page only says where the data comes from. */
  test('adds only the source note while a plugin serves the weather', () => {
    pebble.plugins = [BUILT_IN_WEATHER];
    const { hooks } = startFace({ providers: { weather: ['plugin'] } });
    const line: ClayConfigItem = { type: 'heading', defaultValue: 'Plugin Only', pluginSourceRows: 'weather' };

    const result = faceRows(hooks.page?.([{ type: 'section', items: [line] }]) || [])[0].items;

    expect(result).toEqual([line, { type: 'pluginNote', tone: 'info', defaultValue: escapeHtml(WEATHER_TEXTS.source as string) }]);
  });
});

// the Pebble app's built-in Preferences plugin, trimmed to the units the weather reads
const BUILT_IN_PREFERENCES = {
  uuid: '00000000-0000-0000-0001-000000000009',
  name: 'Preferences',
  sources: [{ category: 'preferences', items: ['units'], properties: { temperature: ['shortText'], wind_speed: ['shortText'] } }],
};

/** One update from `preferences/units`, with the temperature unit as the Preferences plugin writes it. */
function unitsUpdate(temperature: string) {
  return {
    pluginUuid: BUILT_IN_PREFERENCES.uuid,
    instances: [{ instanceId: 'units', properties: { temperature: { shortText: { text: temperature } }, wind_speed: { shortText: { text: 'mph' } } } }],
  };
}

describe('weather plugin mode on a face with no unit setting', () => {
  let pebble: FakePebble;
  let fetches: FakeXhr[];

  // a saved city with gps off, so a fetch round is one Open-Meteo request
  const CITY = { LOCATION_USE_GPS: false, LOCATION_NAME: JSON.stringify({ lat: 43.7, lon: -79.4, label: 'Toronto' }) };

  beforeEach(() => {
    localStorage.clear();
    pebble = withFakePebble();
    pebble.plugins = [BUILT_IN_WEATHER, BUILT_IN_PREFERENCES];
    fetches = installFakeXhr();
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    pebble.restore();
    vi.restoreAllMocks();
    // the quick retry spec runs on fake timers, so they go back here even when it fails
    vi.useRealTimers();
  });

  /** The live subscription for one category, which a spec pushes that plugin's updates through. */
  function liveFor(category: string) {
    return pebble.live().filter((subscription) => subscription.request.category === category)[0];
  }

  /** Every temperature the watch was sent, in order. */
  function temperatures(sends: Record<string, unknown>[]): unknown[] {
    return sends.map((dict) => dict.WEATHER_TEMPERATURE);
  }

  /**
   * The face this is for has no settings page, so the Pebble app is the only place the wearer says
   * °F. Its watch shows the number as sent, so a Celsius number here is a Celsius reading on the wrist.
   */
  test('sends the reading in °F when the Pebble app says °F', () => {
    const { sends } = startFace({ providers: { weather: ['plugin'] }, unit: 'none', ready: true });

    liveFor('preferences').push(unitsUpdate('°F'));
    liveFor('weather').push(update(21));

    expect(temperatures(sends)).toEqual([70]);
  });

  /** A wearer who switches unit in the Pebble app would otherwise wait up to 15 minutes for the plugin's next update. */
  test('sends the kept reading again in the new unit when the Pebble app changes unit while the face runs', () => {
    const { sends } = startFace({ providers: { weather: ['plugin'] }, unit: 'none', ready: true });

    liveFor('weather').push(update(21));
    liveFor('preferences').push(unitsUpdate('°F'));
    liveFor('preferences').push(unitsUpdate('°C'));

    expect(temperatures(sends)).toEqual([21, 70, 21]);
  });

  /** A Pebble app that has not answered, or has no Preferences plugin, leaves Celsius, as a face without plugins shows. */
  test.each([
    ['before the Pebble app gives a unit', [BUILT_IN_WEATHER, BUILT_IN_PREFERENCES]],
    ['with no Preferences plugin on the phone', [BUILT_IN_WEATHER]],
  ])('sends the reading in Celsius %s', (_label, plugins) => {
    pebble.plugins = plugins;
    const { sends } = startFace({ providers: { weather: ['plugin'] }, unit: 'none', ready: true });

    liveFor('weather').push(update(21));

    expect(temperatures(sends)).toEqual([21]);
  });

  /** The weather update can land before the units one, and each launch would send a Celsius reading first and wake the watch twice. */
  test('starts a new session in the unit the Pebble app last gave', () => {
    startFace({ providers: { weather: ['plugin'] }, unit: 'none', ready: true });
    liveFor('preferences').push(unitsUpdate('°F'));
    pebble.restore();
    pebble = withFakePebble();
    pebble.plugins = [BUILT_IN_WEATHER, BUILT_IN_PREFERENCES];
    const { sends } = startFace({ providers: { weather: ['plugin'] }, unit: 'none', ready: true });

    liveFor('weather').push(update(21));

    expect(temperatures(sends)).toEqual([70]);
  });

  /** The Pebble app sends its units again whenever any of them moves, and a resend for the same unit would wake the watch for nothing. */
  test('sends nothing for a units update that keeps the unit', () => {
    const { sends } = startFace({ providers: { weather: ['plugin'] }, unit: 'none', ready: true });

    liveFor('weather').push(update(21));
    liveFor('preferences').push(unitsUpdate('°C'));

    expect(sends).toHaveLength(1);
  });

  /** A unit the update does not name says nothing, so it must not move the face off the one it has. */
  test('keeps the unit for a units update it cannot read', () => {
    localStorage.setItem(APP_UNIT_STORE, 'true');
    const { sends } = startFace({ providers: { weather: ['plugin'] }, unit: 'none', ready: true });

    liveFor('preferences').push(unitsUpdate('K'));
    liveFor('weather').push(update(21));

    expect(temperatures(sends)).toEqual([70]);
  });

  /** A face with its own unit shows that one, and must not wake the phone for a plugin it never reads. */
  test('reads no Pebble app units on a face that declares the unit key', () => {
    localStorage.setItem(APP_UNIT_STORE, 'true');
    const { sends } = startFace({ providers: { weather: ['plugin'] }, unit: 'own', ready: true });

    pebble.live()[0].push(update(21));

    expect(pebble.subscriptions.map((subscription) => subscription.request.category)).toEqual(['weather']);
    expect(temperatures(sends)).toEqual([21]);
  });

  /** The watch goes by the key alone, so a face with only a page default writes the number bare and has to get the Pebble app's unit. */
  test('follows the Pebble app\'s unit on a face with a page default and no key', () => {
    const { sends } = startFace({ providers: { weather: ['plugin'] }, unit: 'default', ready: true });

    liveFor('preferences').push(unitsUpdate('°F'));
    liveFor('weather').push(update(21));

    expect(temperatures(sends)).toEqual([70]);
  });

  /** The watch writes the number bare in either mode, so a fetch in Celsius beside a plugin in °F would show two units under one face. */
  test('fetches in °F when the Pebble app last said °F, with a fetch provider picked', () => {
    localStorage.setItem(APP_UNIT_STORE, 'true');
    saveSettings({ ...CITY, WEATHER_PROVIDER: 'openmeteo' });

    startFace({ providers: { weather: ['openmeteo', 'plugin'] }, unit: 'none', ready: true });

    expect(pebble.live().map((subscription) => subscription.request.category)).toEqual(['preferences']);
    expect(fetches).toHaveLength(1);
    expect(fetches[0].url).toContain('temperature_unit=fahrenheit');
  });

  /** A fetched reading has nothing kept to convert, so a unit change has to fetch again or the watch keeps the old unit until the next round. */
  test('fetches once more in the new unit when the Pebble app changes unit in fetch mode', () => {
    saveSettings({ ...CITY, WEATHER_PROVIDER: 'openmeteo' });
    startFace({ providers: { weather: ['openmeteo', 'plugin'] }, unit: 'none', ready: true });

    liveFor('preferences').push(unitsUpdate('°F'));

    expect(fetches.map((request) => request.url.includes('temperature_unit=fahrenheit'))).toEqual([false, true]);
  });

  /** A save's refetch reads the unit when it runs, so a second fetch for the unit change would spend another provider call on the same reading. */
  test('folds a unit change into a save\'s refetch still waiting, which fetches once in the new unit', () => {
    vi.useFakeTimers();
    saveSettings({ ...CITY, WEATHER_PROVIDER: 'openmeteo' });
    const { hooks } = startFace({ providers: { weather: ['openmeteo', 'plugin'] }, unit: 'none', ready: true });

    saveFromPage(hooks, { ...CITY, WEATHER_PROVIDER: 'openmeteo', LOCATION_NAME: JSON.stringify({ lat: 45.4, lon: -75.7, label: 'Ottawa' }) });
    liveFor('preferences').push(unitsUpdate('°F'));
    vi.advanceTimersByTime(250);

    const result = fetches.slice(1).map((request) => request.url.includes('temperature_unit=fahrenheit'));

    expect(result).toEqual([true]);
  });

  /** With no reading kept the watch shows the plugin's status, which has no unit, so a send or a fetch would be for nothing. */
  test('sends and fetches nothing for a unit change in plugin mode before the first reading', () => {
    const { sends } = startFace({ providers: { weather: ['plugin'] }, unit: 'none', ready: true });

    liveFor('preferences').push(unitsUpdate('°F'));

    expect(sends).toHaveLength(0);
    expect(fetches).toHaveLength(0);
  });

  /** A switch to a fetch still needs the Pebble app's unit for the fetch, so the units keep running while the weather stops. */
  test('keeps reading the Pebble app\'s units for a switch away from the plugin', () => {
    saveSettings({ ...CITY, WEATHER_PROVIDER: 'plugin' });
    const { hooks } = startFace({ providers: { weather: ['openmeteo', 'plugin'] }, unit: 'none', ready: true });

    saveFromPage(hooks, { ...CITY, WEATHER_PROVIDER: 'openmeteo' });

    expect(pebble.live().map((subscription) => subscription.request.category)).toEqual(['preferences']);
  });

  /** Nothing on the watch waits on the units, so an error from them must not cover the weather with a status. */
  test('sends the watch nothing for an error from the Pebble app\'s units', () => {
    const { sends } = startFace({ providers: { weather: ['plugin'] }, unit: 'none', ready: true });

    liveFor('preferences').fail({ code: 'PLUGIN_UNAVAILABLE', message: 'gone' });

    expect(sends).toHaveLength(0);
  });

  /** With plugins off the units would otherwise wake the phone every two minutes for half an hour beside the weather's own retry. */
  test('runs no quick retry for the Pebble app\'s units', () => {
    vi.useFakeTimers();
    pebble.plugins = [BUILT_IN_WEATHER];
    startFace({ providers: { weather: ['plugin'] }, unit: 'none', ready: true });
    const before = pebble.enumeratePlugins.mock.calls.length;

    vi.advanceTimersByTime(QUICK_RETRY_WINDOW_MS);

    const result = pebble.enumeratePlugins.mock.calls.length;

    expect(result).toBe(before);
  });

  /** A wearer opening the settings may have just turned plugins on, and the units have no quick retry to find that. */
  test('tries the Pebble app\'s units again when the settings page opens', () => {
    pebble.plugins = [BUILT_IN_WEATHER];
    const { hooks } = startFace({ providers: { weather: ['plugin'] }, unit: 'none', ready: true });

    pebble.plugins = [BUILT_IN_WEATHER, BUILT_IN_PREFERENCES];
    hooks.configOpened?.();

    const result = liveFor('preferences');

    expect(result).toBeDefined();
  });

  /** A watch that rebooted asks with empty stores, and the reading it gets has to be in the Pebble app's unit too. */
  test('answers a watch ask in the Pebble app\'s unit', () => {
    const { hooks, sends } = startFace({ providers: { weather: ['plugin'] }, unit: 'none', ready: true });

    liveFor('weather').push(update(21));
    liveFor('preferences').push(unitsUpdate('°F'));
    hooks.message?.({ WEATHER_REQUEST: 1 });

    expect(temperatures(sends)).toEqual([21, 70, 70]);
  });
});

describe('weather plugin mode for a face showing coordinates', () => {
  let pebble: FakePebble;
  let fetches: FakeXhr[];
  let latitudes: Array<number | undefined>;
  const coords = weather.withCoords((_keys, result) => {
    latitudes.push(result.lat);

    return {};
  });

  /** The live subscription for one category. */
  function liveFor(category: string) {
    return pebble.live().filter((subscription) => subscription.request.category === category)[0];
  }

  beforeEach(() => {
    localStorage.clear();
    saveSettings({ WEATHER_PROVIDER: 'plugin', LOCATION_USE_GPS: false, LOCATION_NAME: JSON.stringify({ lat: 43.7, lon: -79.4, label: 'Toronto' }) });
    pebble = withFakePebble();
    pebble.plugins = [BUILT_IN_WEATHER];
    fetches = installFakeXhr();
    latitudes = [];
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    pebble.restore();
    vi.restoreAllMocks();
  });

  /** A face that shows coordinates was offered no plugin at all, so its wearer could never pick the Pebble app's weather. */
  test.each([
    ['no list', null],
    ['a mixed list', { weather: ['plugin', 'openmeteo'] }],
  ])('offers the plugin and reads it with %s', (_label, providers) => {
    const { hooks } = startFace({ feature: coords, providers });

    hooks.ready?.();

    expect(hooks.page).toBeDefined();
    expect(fetches).toHaveLength(0);
    expect(pebble.live().map((subscription) => subscription.request.category)).toContain('weather');
  });

  /** A plugin that serves the place's coordinates has to fill the face's coordinate readout, as a fetch's coordinates do. */
  test('hands the face the coordinates a plugin serves', () => {
    startFace({ feature: coords, providers: { weather: ['plugin', 'openmeteo'] }, ready: true });

    liveFor('weather').push(update(21, { latitude: { numericValue: { value: 28.6139, unit: '°' } }, longitude: { numericValue: { value: 77.209, unit: '°' } } }));

    expect(latitudes).toEqual([28.6139]);
  });

  /** A plugin that serves no coordinates, such as the built-in, must leave the readout on its no fix state rather than an old fix. */
  test('hands the face no coordinates from a plugin that serves none', () => {
    startFace({ feature: coords, providers: { weather: ['plugin', 'openmeteo'] }, ready: true });

    liveFor('weather').push(update(21));

    expect(latitudes).toEqual([undefined]);
  });

  /** The plugin has to be asked for the coordinates, or one that serves them only when asked would send none. */
  test('asks the plugin for the coordinates', () => {
    startFace({ feature: coords, providers: { weather: ['plugin', 'openmeteo'] }, ready: true });

    const result = liveFor('weather').request.properties;

    expect(result).toEqual(expect.arrayContaining(['latitude', 'longitude']));
  });

  /** A wearer who picks a plugin that serves no coordinates would see the readout go to no fix with nothing to say why. */
  test('adds a line on coordinates to the source note', () => {
    const { hooks } = startFace({ feature: coords, providers: { weather: ['plugin'] } });
    const line: ClayConfigItem = { type: 'heading', defaultValue: 'Plugin Only', pluginSourceRows: 'weather' };

    const result = faceRows(hooks.page?.([{ type: 'section', items: [line] }]) || [])[0].items;

    expect(result).toEqual([line, { type: 'pluginNote', tone: 'info', defaultValue: escapeHtml(`${WEATHER_TEXTS.source} ${COORDS_TEXT}`) }]);
  });
});

describe('weather plugin mode on the settings page', () => {
  let pebble: FakePebble;

  beforeEach(() => {
    localStorage.clear();
    pebble = withFakePebble();
    pebble.plugins = [BUILT_IN_WEATHER];
  });

  afterEach(() => {
    pebble.restore();
    vi.restoreAllMocks();
  });

  /** The page hook is the only way a wearer can pick the plugin at all. */
  test('adds Preferred Source to the Data Source select', () => {
    const { hooks } = startFace();

    const result = hooks.page?.(buildConfig({ location: {}, weather: {} })) || [];

    expect(allRowsOf(result).find((row) => row.messageKey === 'WEATHER_PROVIDER')?.options?.map((option) => option.value)).toEqual(['openmeteo', 'owm', 'weatherapi', 'plugin']);
  });

  /** The face reads a provider never saved as a plugin that serves the weather, so a page opening on Open-Meteo would show a source the watch is not getting. */
  test('opens the Data Source select on the plugin with nothing saved while a plugin serves the weather', () => {
    const { hooks } = startFace();

    const result = hooks.page?.(buildConfig({ location: {}, weather: {} })) || [];

    expect(allRowsOf(result).find((row) => row.messageKey === 'WEATHER_PROVIDER')?.defaultValue).toBe('plugin');
  });

  /** A saved choice always stands, and the page has to keep the face's default under it. */
  test('keeps the face\'s default on the Data Source select for a saved provider', () => {
    saveSettings({ WEATHER_PROVIDER: 'owm' });
    const { hooks } = startFace();

    const result = hooks.page?.(buildConfig({ location: {}, weather: {} })) || [];

    expect(allRowsOf(result).find((row) => row.messageKey === 'WEATHER_PROVIDER')?.defaultValue).toBe('openmeteo');
  });

  /** With plugins off a fresh page has to open on the face's default, which is what the watch fetches. */
  test('keeps the face\'s default on the Data Source select with nothing saved and plugins off', () => {
    pebble.plugins = [];
    const { hooks } = startFace();

    const result = hooks.page?.(buildConfig({ location: {}, weather: {} })) || [];

    expect(allRowsOf(result).find((row) => row.messageKey === 'WEATHER_PROVIDER')?.defaultValue).toBe('openmeteo');
  });

  /** The note on where the weather comes from and the supported plugins panel are drawn by components the app has to register, and a face without the define must never be handed them. */
  test('hands the app the note and panel components along with the page hook', () => {
    const { hooks } = startFace();

    const result = (hooks.components || []).map((component) => (component as { name: string }).name);

    expect(result).toEqual(['pluginNote', 'pluginPanel', 'pluginKinds']);
  });

  /** Plugins off is when the wearer most needs to hear what to turn on, so the panel must not go with the plugin option. */
  test('lists the weather plugins in the panel with plugins off', () => {
    pebble.plugins = [];
    const { hooks } = startFace();

    const result = allRowsOf(hooks.page?.(buildConfig({ location: {}, weather: {} })) || []).filter((row) => row.type === 'pluginPanel');

    expect(result.map((row) => row.panel?.kinds.map((kind) => kind.label))).toEqual([['Weather']]);
    expect(result[0].panel?.off).not.toBe('');
  });

  /** With plugins off, a save from a page with no option for the saved plugin would drop the wearer onto a fetch. */
  test('keeps a saved plugin on offer with plugins off', () => {
    pebble.plugins = [];
    saveSettings({ WEATHER_PROVIDER: 'plugin' });
    const { hooks } = startFace();

    const result = hooks.page?.(buildConfig({ location: {}, weather: {} })) || [];

    expect(allRowsOf(result).find((row) => row.messageKey === 'WEATHER_PROVIDER')?.options?.map((option) => option.value)).toEqual(['openmeteo', 'owm', 'weatherapi', 'plugin']);
  });
});

describe('weather plugin mode after a reset', () => {
  let pebble: FakePebble;

  beforeEach(() => {
    localStorage.clear();
    pebble = withFakePebble();
    pebble.plugins = [BUILT_IN_WEATHER];
  });

  afterEach(() => {
    pebble.restore();
    vi.restoreAllMocks();
  });

  /** Runs the face's seeded hook on the settings a seed took back from the watch, as the seed does before it saves. */
  function seed(restored: Record<string, unknown>): Record<string, unknown> {
    const { hooks } = startFace();
    const config = { ...restored };

    hooks.seeded?.(config, (name) => restored[name]);
    return config;
  }

  /**
   * The watch keeps the face's default for a choice nobody ever made. Writing it back would pin a
   * wearer who never chose to the default after every reset, even with a weather plugin on the phone.
   */
  test('leaves out a restored default, so the choice reads as never saved', () => {
    const result = seed({ WEATHER_PROVIDER: 'openmeteo' });

    expect(result).toEqual({});
  });

  /** A provider other than the default was a real choice, and one that needs no key works as it stands. */
  test('keeps a restored provider other than the default', () => {
    const result = seed({ WEATHER_PROVIDER: 'owm', WEATHER_API_KEY: 'abc' });

    expect(result).toEqual({ WEATHER_PROVIDER: 'owm', WEATHER_API_KEY: 'abc' });
  });

  /** A wearer who picked the Pebble app has to keep it through a reset while a plugin can answer. */
  test('keeps a restored plugin while a plugin serves the weather', () => {
    const result = seed({ WEATHER_PROVIDER: 'plugin' });

    expect(result).toEqual({ WEATHER_PROVIDER: 'plugin' });
  });

  /**
   * Plugins switched off list nothing, which reads the same as a plugin removed. The page keeps a
   * saved plugin with plugins off, so the reset keeps it too and the face shows No Plugin, as the page says.
   */
  test('keeps a restored plugin with plugins off', () => {
    pebble.plugins = [];

    const result = seed({ WEATHER_PROVIDER: 'plugin' });

    expect(result).toEqual({ WEATHER_PROVIDER: 'plugin' });
  });

  /** A Pebble app from before plugins can never answer, and the face would sit on No Plugin where it could fetch. */
  test('takes out a restored plugin on a phone with no plugin calls, so the default reads', () => {
    pebble.restore();
    pebble = withFakePebble({ plugins: false });

    const result = seed({ WEATHER_PROVIDER: 'plugin' });

    expect(result).toEqual({});
  });

  /** A list the phone will not give says nothing about what is installed, and dropping the choice would lose a plugin that still answers. */
  test('keeps a restored plugin when the plugin list cannot be read', () => {
    pebble.enumeratePlugins.mockImplementation(() => {
      throw new Error('bridge broke');
    });
    vi.spyOn(console, 'log').mockImplementation(() => {});

    const result = seed({ WEATHER_PROVIDER: 'plugin' });

    expect(result).toEqual({ WEATHER_PROVIDER: 'plugin' });
  });

  /**
   * The 64 character key is never on the watch, so a reset that left an OpenWeatherMap face showing
   * No API Key where it showed Open-Meteo weather before is the bug this catches.
   */
  test('takes out a restored owm with no API key saved', () => {
    const result = seed({ WEATHER_PROVIDER: 'owm' });

    expect(result).toEqual({});
  });

  /** A wearer whose key is still saved on the phone keeps the provider they pay for. */
  test('keeps a restored owm with its API key saved', () => {
    const result = seed({ WEATHER_PROVIDER: 'owm', WEATHER_API_KEY: 'abc123' });

    expect(result).toEqual({ WEATHER_PROVIDER: 'owm', WEATHER_API_KEY: 'abc123' });
  });

  /**
   * The phone's own saved choice wins over the watch's echo. Putting back the default over the
   * phone's saved plugin would undo the choice the face keeps while plugins are off.
   */
  test('leaves the provider alone when the phone already held one of its own', () => {
    pebble.plugins = [];
    saveSettings({ WEATHER_PROVIDER: 'plugin' });

    const result = seed({ WEATHER_PROVIDER: 'plugin' });

    expect(result).toEqual({ WEATHER_PROVIDER: 'plugin' });
  });
});

describe('weather on a face built without PLUGIN_WEATHER', () => {
  let pebble: FakePebble;
  let fetches: FakeXhr[];

  beforeEach(() => {
    pluginCode.off = true;
    localStorage.clear();
    pebble = withFakePebble();
    pebble.plugins = [BUILT_IN_WEATHER];
    fetches = installFakeXhr();
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    pluginCode.off = false;
    pebble.restore();
    vi.restoreAllMocks();
  });

  /** Plugins are opt in, so a face that never asked gets only the plain hooks, with no page or seeded hook to change its page or its reset. */
  test('gives the plain hooks when the plugin code is off', () => {
    const { hooks } = startFace();

    const result = Object.keys(hooks);

    expect(result).toEqual(['requests', 'ready', 'message', 'refresh', 'configOpened', 'configSaved']);
  });

  /** A saved plugin from a build that had the define has to fall back to a fetch, never to a subscription the face has no code for. */
  test('fetches and never subscribes even with the plugin saved', () => {
    saveSettings({ WEATHER_PROVIDER: 'plugin', LOCATION_USE_GPS: false, LOCATION_NAME: JSON.stringify({ lat: 43.7, lon: -79.4, label: 'Toronto' }) });
    const { hooks } = startFace({ providers: { weather: ['plugin'] } });

    hooks.ready?.();

    expect(fetches).toHaveLength(1);
    expect(pebble.subscriptions).toHaveLength(0);
  });
});
