// @vitest-environment jsdom
/**
 * Specs for the shared PebbleKit JS bootstrap.
 *
 * This module is the only copy of the weather/settings glue both faces run, so
 * the hardening it carries (HTTP-status handling, untrusted-payload guards,
 * coordinate range checks, the change-gated refetch, and the one-at-a-time weather round) is tested here once.
 *
 * The webview globals (localStorage) come from jsdom. XMLHttpRequest is stubbed
 * so nothing touches the network. Clay and the per-face `message_keys` alias are
 * only loaded inside startPebbleApp, so the exported helpers test without them.
 * seedConfigFromWatch takes its message-key map as an argument. The startPebbleApp
 * specs stub both through the module loader and drive the app with a fake Pebble.
 */

import Module from 'node:module';
import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import app from './app';
import stocks from '../stock/feature';
import calendar from '../calendar/feature';

// stands in for the per-face generated message_keys: each key name maps to
// itself so payloads and stored config use readable string keys
const messageKeys = new Proxy({}, { get: (_target, prop) => prop });

/**
 * Captures every XMLHttpRequest the code opens and lets a spec drive the
 * response, an error, or a timeout. Returns the list of requests sent so
 * far, in the order they were opened.
 */
function installFakeXhr() {
  const sent: FakeXhr[] = [];

  class FakeXhr {
    method = '';
    url = '';
    status = 0;
    responseText = '';
    // app.ts hangs these on the request, so the fake has to model them
    onload?: () => void;
    onerror?: () => void;
    ontimeout?: () => void;

    open(method: string, url: string) {
      this.method = method;
      this.url = url;
    }

    send() {
      sent.push(this);
    }

    respond(httpStatus: number, body: string) {
      this.status = httpStatus;
      this.responseText = body;
      this.onload?.();
    }

    fail() {
      this.onerror?.();
    }

    timeOut() {
      this.ontimeout?.();
    }
  }

  global.XMLHttpRequest = FakeXhr as unknown as typeof XMLHttpRequest;
  return sent;
}

describe('request', () => {
  /** A successful response must reach the callback as data with no error. */
  test('reports a 2xx response as success with the body', () => {
    const sent = installFakeXhr();
    const callback = vi.fn();

    app.request('https://example', callback);
    sent[0].respond(200, '{"ok":1}');

    expect(callback).toHaveBeenCalledWith(null, '{"ok":1}');
  });

  /** A non-2xx must be flagged as an error while still forwarding the body so a provider can read a structured error. */
  test('reports a non-2xx as an http error but still forwards the body', () => {
    const sent = installFakeXhr();
    const callback = vi.fn();

    app.request('https://example', callback);
    sent[0].respond(404, '{"cod":404}');

    expect(callback).toHaveBeenCalledWith('http 404', '{"cod":404}');
  });

  /** A transport failure must surface as a network error, never a silent success. */
  test('reports a transport failure as a network error', () => {
    const sent = installFakeXhr();
    const callback = vi.fn();

    app.request('https://example', callback);
    sent[0].fail();

    expect(callback).toHaveBeenCalledWith('network error');
  });

  /** A timeout must surface distinctly so the caller can show a clear status. */
  test('reports a timeout', () => {
    const sent = installFakeXhr();
    const callback = vi.fn();

    app.request('https://example', callback);
    sent[0].timeOut();

    expect(callback).toHaveBeenCalledWith('timeout');
  });
});

describe('validCoord', () => {
  /** An in-range pair is the only thing that should be forwarded to a provider. */
  test('accepts an in-range coordinate pair', () => {
    const result = app.validCoord(33.4, -112);

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
    const result = app.validCoord(lat, lon);

    expect(result).toBe(false);
  });
});

describe('getManualLocation', () => {
  /** A valid saved place must yield its coordinates and label so the watch fetches the right city. */
  test('returns coordinates and label for an in-range saved location', () => {
    const config = { LOCATION_NAME: JSON.stringify({ lat: 33.4, lon: -112, label: 'Phoenix' }) };

    const result = app.getManualLocation(config);

    expect(result).toEqual({ coords: { lat: 33.4, lon: -112 }, label: 'Phoenix' });
  });

  /** An out-of-range blob must be treated as no manual location, never forwarded verbatim. */
  test('rejects an out-of-range saved coordinate', () => {
    const config = { LOCATION_NAME: JSON.stringify({ lat: 999, lon: -112, label: 'Bad' }) };

    const result = app.getManualLocation(config);

    expect(result).toBeNull();
  });

  /** Malformed JSON must not throw and must fall back to no location. */
  test('returns null for a malformed saved value', () => {
    const config = { LOCATION_NAME: 'not json' };

    const result = app.getManualLocation(config);

    expect(result).toBeNull();
  });

  /** An unset location must be null so the caller falls back to GPS or a no-location status. */
  test('returns null when no location is saved', () => {
    const result = app.getManualLocation({});

    expect(result).toBeNull();
  });
});

describe('seedConfigFromWatch', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  /** Reads the value seedConfigFromWatch persisted under a given key. */
  function stored(key: string) {
    return JSON.parse(localStorage.getItem('clay-settings'))[key];
  }

  /** A valid date format string from the watch must seed the config so it opens with the real value. */
  test('copies a valid string CLOCK_DATE_FORMAT into the store', () => {
    app.seedConfigFromWatch(messageKeys, { CLOCK_DATE_FORMAT: '%Y.%m.%d' });

    const result = stored('CLOCK_DATE_FORMAT');

    expect(result).toBe('%Y.%m.%d');
  });

  /** A non-string CLOCK_DATE_FORMAT is corrupt and must be skipped, not seeded as junk. */
  test('skips a non-string CLOCK_DATE_FORMAT', () => {
    app.seedConfigFromWatch(messageKeys, { CLOCK_DATE_FORMAT: 42 });

    const result = 'CLOCK_DATE_FORMAT' in JSON.parse(localStorage.getItem('clay-settings'));

    expect(result).toBe(false);
  });

  /** A numeric enum (the on-wire form) must be stringified to match Clay's option values. */
  test('stringifies a numeric enum value', () => {
    app.seedConfigFromWatch(messageKeys, { APPEARANCE_THEME: 3 });

    const result = stored('APPEARANCE_THEME');

    expect(result).toBe('3');
  });

  /** A non-primitive enum is malformed and must be skipped. */
  test('skips an enum value that is neither string nor number', () => {
    app.seedConfigFromWatch(messageKeys, { APPEARANCE_THEME: { nested: true } });

    const result = 'APPEARANCE_THEME' in JSON.parse(localStorage.getItem('clay-settings'));

    expect(result).toBe(false);
  });

  /** Temperature unit is a select, so it seeds through seedKeys as the "0"/"1" string Clay expects. */
  test.each([
    [1, '1'],
    [0, '0'],
  ])('seeds WEATHER_TEMPERATURE_UNIT %s as the string "%s" via seedKeys', (value, expected) => {
    app.seedConfigFromWatch(messageKeys, { WEATHER_TEMPERATURE_UNIT: value }, ['WEATHER_TEMPERATURE_UNIT']);

    const result = stored('WEATHER_TEMPERATURE_UNIT');

    expect(result).toBe(expected);
  });

  /** Clay's colour picker reads a string as hex, so a colour has to stay the number the watch sent. */
  test('seeds a colour key as a number via seedColorKeys', () => {
    app.seedConfigFromWatch(messageKeys, { APPEARANCE_REEL_COLOR: 0xFF0000 }, [], ['APPEARANCE_REEL_COLOR']);

    const result = stored('APPEARANCE_REEL_COLOR');

    expect(result).toBe(0xFF0000);
  });

  /** A colour that arrived as anything but a number is malformed and must be skipped. */
  test('skips a colour key that is not a number', () => {
    app.seedConfigFromWatch(messageKeys, { APPEARANCE_REEL_COLOR: 'ff0000' }, [], ['APPEARANCE_REEL_COLOR']);

    const result = 'APPEARANCE_REEL_COLOR' in JSON.parse(localStorage.getItem('clay-settings'));

    expect(result).toBe(false);
  });

  /** A toggle rides as 0/1 but Clay sets it from a real boolean, so the seed has to convert. */
  test.each([
    [1, true],
    [0, false],
  ])('seeds a bool key %s as %s via seedBoolKeys', (value, expected) => {
    app.seedConfigFromWatch(messageKeys, { APPEARANCE_FACE_COLORS: value }, [], [], ['APPEARANCE_FACE_COLORS']);

    const result = stored('APPEARANCE_FACE_COLORS');

    expect(result).toBe(expected);
  });

  /** A dropped field (or wrong coercion) in the seed table silently stops seeding that setting, so its config page opens on the default. */
  test('seeds every supported field from a full payload', () => {
    app.seedConfigFromWatch(messageKeys, {
      WEATHER_TEMPERATURE_UNIT: 1,
      CLOCK_DATE_FORMAT: '%a %d %b',
      APPEARANCE_THEME: 2,
      HEALTH_STEPS_MODE: 1,
      CLOCK_TIME_FORMAT: 0,
      CONNECTION_BLUETOOTH_ICON: 0,
      CONNECTION_VIBE_CONNECT: 3,
      CONNECTION_VIBE_DISCONNECT: 1,
    }, ['WEATHER_TEMPERATURE_UNIT']);

    const result = JSON.parse(localStorage.getItem('clay-settings'));

    expect(result).toEqual({
      WEATHER_TEMPERATURE_UNIT: '1',
      CLOCK_DATE_FORMAT: '%a %d %b',
      APPEARANCE_THEME: '2',
      HEALTH_STEPS_MODE: '1',
      CLOCK_TIME_FORMAT: '0',
      CONNECTION_BLUETOOTH_ICON: false,
      CONNECTION_VIBE_CONNECT: '3',
      CONNECTION_VIBE_DISCONNECT: '1',
    });
  });

  /**
   * A phone that lost its store, through a new phone or the app's data being cleared, opened the
   * settings page on an empty Alternate Time Zone while the watch carried on showing the old one.
   * Saving from there sent nothing back and the panel dropped to UTC.
   */
  test('seeds a timezone field from the watch', () => {
    app.seedConfigFromWatch({ CLOCK_TIMEZONE_1: 'CLOCK_TIMEZONE_1' }, { CLOCK_TIMEZONE_1: '-420,Phoenix' });

    const result = stored('CLOCK_TIMEZONE_1');

    expect(result).toBe('-420,Phoenix');
  });

  /** A face may name a key TIMEZONE for something that holds no place, so only a string seeds. */
  test('skips a timezone key that did not arrive as a string', () => {
    app.seedConfigFromWatch({ CLOCK_TIMEZONE_1: 'CLOCK_TIMEZONE_1' }, { CLOCK_TIMEZONE_1: 1 });

    const result = 'CLOCK_TIMEZONE_1' in JSON.parse(localStorage.getItem('clay-settings'));

    expect(result).toBe(false);
  });

  /**
   * A face without SETTINGS_FRESH seeds on every launch. Writing the watch's offset string over a
   * saved place loses its zone, so the second clock stops following summer time and the page asks
   * for the city again after every launch.
   */
  test('keeps a place the phone already saved for a timezone field', () => {
    const saved = JSON.stringify({ label: 'London', offset: 0, tz: 'Europe/London' });
    localStorage.setItem('clay-settings', JSON.stringify({ CLOCK_TIMEZONE_1: saved }));

    app.seedConfigFromWatch({ CLOCK_TIMEZONE_1: 'CLOCK_TIMEZONE_1' }, { CLOCK_TIMEZONE_1: '60,London' });

    const result = stored('CLOCK_TIMEZONE_1');

    expect(result).toBe(saved);
  });
});

describe('retimeSettings', () => {
  const timezoneKeys = { CLOCK_TIMEZONE_1: 11 };
  // a June evening, when London is an hour ahead of UTC and the saved offset of 0 is a winter one
  const nowMs = Date.UTC(2026, 5, 10, 22, 0);

  /** The watch reads the offset rather than the zone, so a saved place has to arrive rewritten. */
  test('rewrites a saved place into the offset it reads today', () => {
    const dict = { 11: JSON.stringify({ label: 'London', offset: 0, tz: 'Europe/London' }) };

    const result = app.retimeSettings(dict, timezoneKeys, nowMs);

    expect(result[11]).toBe('60,London');
  });

  /**
   * A field with nothing saved in it must not go out as an empty string. The watch reads that as
   * zero minutes under no name, so a working Time Zone panel falls to UTC labelled TZ.
   */
  test('drops a timezone field with nothing saved in it', () => {
    const dict = { 11: '' };

    const result = app.retimeSettings(dict, timezoneKeys, nowMs);

    expect(11 in result).toBe(false);
  });

  /** A face may name a key TIMEZONE for a toggle, and blanking one would leave it stuck. */
  test('leaves a timezone key that is not a string alone', () => {
    const dict = { 11: 3 };

    const result = app.retimeSettings(dict, timezoneKeys, nowMs);

    expect(result[11]).toBe(3);
  });
});

describe('weatherSettingsSnapshot', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  /** The snapshot must JSON-encode the stored weather keys so a later save can be diffed by content. */
  test('json-encodes the weather keys read from the store', () => {
    localStorage.setItem('clay-settings', JSON.stringify({ WEATHER_PROVIDER: 'owm' }));

    const result = app.weatherSettingsSnapshot();

    expect(result[app.WEATHER_KEYS.indexOf('WEATHER_PROVIDER')]).toBe('"owm"');
  });
});

describe('weatherSettingsChanged', () => {
  /** With no snapshot (the page never reported opening) the safe default is to refetch. */
  test('returns true when there is no prior snapshot', () => {
    const result = app.weatherSettingsChanged(null, ['"metric"']);

    expect(result).toBe(true);
  });

  /** Identical snapshots mean only non-weather settings changed, so no refetch. */
  test('returns false when every weather key is unchanged', () => {
    const before = app.WEATHER_KEYS.map(() => '"same"');

    const result = app.weatherSettingsChanged(before, before.slice());

    expect(result).toBe(false);
  });

  /** A single differing weather key must trigger a refetch. */
  test('returns true when a weather key differs', () => {
    const before = app.WEATHER_KEYS.map(() => '"a"');
    const after = before.slice();
    after[0] = '"b"';

    const result = app.weatherSettingsChanged(before, after);

    expect(result).toBe(true);
  });
});

describe('weatherRetryDelayMs', () => {
  /** A successful fetch that still scheduled a retry would re-poll the provider for no reason. */
  test('returns null when the fetch succeeded', () => {
    const result = app.weatherRetryDelayMs(true, 0);

    expect(result).toBe(null);
  });

  /** Without the first retry a cold-launch miss sits blank until the 30-min poll. */
  test('returns the first delay when the first attempt failed', () => {
    const result = app.weatherRetryDelayMs(false, 0);

    expect(result).toBe(5000);
  });

  /** The second attempt must back off further so a still-warming gps gets more time. */
  test('returns the longer delay for the second attempt', () => {
    const result = app.weatherRetryDelayMs(false, 1);

    expect(result).toBe(15000);
  });

  /** Uncapped retries would loop forever on a genuinely bad key or a dead feed. */
  test('returns null once the attempts are used up', () => {
    const result = app.weatherRetryDelayMs(false, 2);

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

    app.runWeatherRound(state, false, deps);
    app.runWeatherRound(state, false, deps);

    expect(callbacks).toHaveLength(1);
  });

  /** An ask landing between a failed fetch and its retry must not start a second retry chain. */
  test('ignores an unforced round while a retry is waiting', () => {
    const state = freshState();
    const { callbacks, deps } = heldFetches();
    app.runWeatherRound(state, false, deps);
    callbacks[0]({ ok: false });

    app.runWeatherRound(state, false, deps);

    expect(callbacks).toHaveLength(1);

    vi.advanceTimersByTime(app.WEATHER_RETRY_DELAYS_MS[0]);

    expect(callbacks).toHaveLength(2);
  });

  /** A weather setting change must replace a running round, and the old round's late result must not reach the watch. */
  test('lets a forced round replace a running one and ignores the old result', () => {
    const state = freshState();
    const { callbacks, deps } = heldFetches();
    app.runWeatherRound(state, false, deps);

    app.runWeatherRound(state, true, deps);
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
    app.runWeatherRound(state, false, deps);
    callbacks[0]({ ok: false });

    app.runWeatherRound(state, true, deps);
    vi.advanceTimersByTime(app.WEATHER_RETRY_DELAYS_MS[0]);

    expect(callbacks).toHaveLength(2);
  });

  /** A fetch that never calls back must not hold off every later ask for the rest of the JS session. */
  test('frees the round via the watchdog when a fetch never calls back', () => {
    const state = freshState();
    const { callbacks, deps } = heldFetches();
    app.runWeatherRound(state, false, deps);

    vi.advanceTimersByTime(deps.timeoutMs);
    app.runWeatherRound(state, false, deps);

    expect(callbacks).toHaveLength(2);
  });

  /** Once the retries are used up the next ask has to be free to try again. */
  test('frees the round once the retries are used up', () => {
    const state = freshState();
    const { callbacks, deps } = heldFetches();
    app.runWeatherRound(state, false, deps);

    callbacks[0]({ ok: false });
    vi.advanceTimersByTime(app.WEATHER_RETRY_DELAYS_MS[0]);
    callbacks[1]({ ok: false });
    vi.advanceTimersByTime(app.WEATHER_RETRY_DELAYS_MS[1]);
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
    app.runWeatherRound(state, false, deps);

    callbacks[0]({ ok: true });

    expect(state.inFlight).toBe(false);
  });
});

describe('startPebbleApp weather', () => {
  type Listener = (event?: unknown) => void;
  type LoadFn = (request: string, ...args: unknown[]) => unknown;

  // only the keys the weather path reads. no stock or calendar key, so those fetches stay off
  const weatherKeys = {
    SETTINGS_REQUEST: 'SETTINGS_REQUEST',
    WEATHER_REQUEST: 'WEATHER_REQUEST',
    WEATHER_TEMPERATURE: 'WEATHER_TEMPERATURE',
    WEATHER_CONDITIONS: 'WEATHER_CONDITIONS',
    WEATHER_OK: 'WEATHER_OK',
  };

  class FakeClay {
    registerComponent() {}
    getSettings() {
      return {};
    }
    generateUrl() {
      return '';
    }
  }

  // stands in for the two modules startPebbleApp requires lazily
  function fakeModule(id: string): unknown {
    if (id === 'message_keys') {
      return weatherKeys;
    }
    if (id === '@rebble/clay/src/js/index') {
      return FakeClay;
    }
    return undefined;
  }

  const moduleInternal = Module as unknown as { _load: LoadFn };
  const host = globalThis as unknown as Record<string, unknown>;
  let originalLoad: LoadFn;
  let listeners: Record<string, Listener>;
  let sent: ReturnType<typeof installFakeXhr>;
  const sendAppMessage = vi.fn((dict: Record<string, unknown>, onOk?: () => void) => onOk?.());

  // a saved manual city with gps off, so every fetch is exactly one open-meteo request
  function saveCity(label: string, lat: number) {
    localStorage.setItem('clay-settings', JSON.stringify({
      WEATHER_PROVIDER: 'openmeteo',
      LOCATION_USE_GPS: false,
      LOCATION_NAME: JSON.stringify({ lat, lon: -112, label }),
    }));
  }

  function currentBody(temperature: number) {
    return JSON.stringify({ current: { temperature_2m: temperature, weather_code: 0, is_day: 1 } });
  }

  function weatherSends() {
    return sendAppMessage.mock.calls.filter(([dict]) => 'WEATHER_OK' in dict);
  }

  function askForWeather() {
    listeners.appmessage({ payload: { WEATHER_REQUEST: 1 } });
  }

  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    saveCity('Phoenix', 33.4);
    sent = installFakeXhr();
    sendAppMessage.mockClear();
    listeners = {};

    host.Pebble = {
      addEventListener: (type: string, handler: Listener) => {
        listeners[type] = handler;
      },
      sendAppMessage,
      openURL: () => {},
    };

    originalLoad = moduleInternal._load;
    moduleInternal._load = function (this: unknown, request: string, ...args: unknown[]) {
      return fakeModule(request) ?? originalLoad.apply(this, [request, ...args]);
    };

    app.startPebbleApp({ clayConfig: [], formatCoords: () => ({}) });
  });

  afterEach(() => {
    moduleInternal._load = originalLoad;
    delete host.Pebble;
    vi.useRealTimers();
  });

  /** The watch re-asks every 3s until its first reading lands, and those asks must not each start a provider fetch. */
  test('starts no second fetch when the watch asks during a running one', () => {
    listeners.ready();

    askForWeather();
    askForWeather();
    askForWeather();

    expect(sent).toHaveLength(1);
  });

  /** Dropping the watch's ask is only safe if the fetch already running still answers it. */
  test('sends the running fetch result to the watch that asked', () => {
    listeners.ready();
    askForWeather();

    sent[0].respond(200, currentBody(21));

    const sends = weatherSends();
    expect(sends).toHaveLength(1);
    expect(sends[0][0]).toMatchObject({ WEATHER_OK: 1, WEATHER_TEMPERATURE: 21 });
  });

  /** A new city must be fetched straight away, and the old city's late reading must never reach the watch. */
  test('lets a weather settings change replace a running fetch', () => {
    listeners.ready();
    listeners.showConfiguration();
    saveCity('Tucson', 32.2);
    listeners.webviewclosed({ response: '{}' });
    vi.advanceTimersByTime(app.SETTINGS_REFETCH_DELAY_MS);

    sent[0].respond(200, currentBody(10));
    sent[1].respond(200, currentBody(30));

    const sends = weatherSends();
    expect(sent[1].url).toContain('latitude=32.2');
    expect(sends).toHaveLength(1);
    expect(sends[0][0]).toMatchObject({ WEATHER_TEMPERATURE: 30 });
  });
});

describe('startPebbleApp stock and calendar', () => {
  type Listener = (event?: unknown) => void;
  type LoadFn = (request: string, ...args: unknown[]) => unknown;

  // the keys Gridlock declares for the two strips, plus the weather ones every ready sends through
  const stripKeys = {
    SETTINGS_REQUEST: 'SETTINGS_REQUEST',
    WEATHER_REQUEST: 'WEATHER_REQUEST',
    WEATHER_TEMPERATURE: 'WEATHER_TEMPERATURE',
    WEATHER_CONDITIONS: 'WEATHER_CONDITIONS',
    WEATHER_OK: 'WEATHER_OK',
    STOCK_STRIP: 'STOCK_STRIP',
    STOCK_REQUEST: 'STOCK_REQUEST',
    CALENDAR_STRIP: 'CALENDAR_STRIP',
    CALENDAR_REQUEST: 'CALENDAR_REQUEST',
  };

  // a strip the phone kept from an earlier round, holding one good AAPL quote
  const SAVED_STRIP = [1, 1, 16, 39, 0, 0, 0, 0, 4, 65, 65, 80, 76];

  class FakeClay {
    registerComponent() {}
    getSettings() {
      return {};
    }
    generateUrl() {
      return '';
    }
  }

  // stands in for the two modules startPebbleApp requires lazily
  function fakeModule(id: string): unknown {
    if (id === 'message_keys') {
      return stripKeys;
    }
    if (id === '@rebble/clay/src/js/index') {
      return FakeClay;
    }
    return undefined;
  }

  const moduleInternal = Module as unknown as { _load: LoadFn };
  const host = globalThis as unknown as Record<string, unknown>;
  let originalLoad: LoadFn;
  let listeners: Record<string, Listener>;
  let sent: ReturnType<typeof installFakeXhr>;
  const sendAppMessage = vi.fn((dict: Record<string, unknown>, onOk?: () => void) => onOk?.());

  const FEED_URL = 'https://example.com/calendar.ics';

  // saves the settings and the stock cache the app reads when it starts, then starts it with the
  // features a face like Gridlock opts into
  function start(settings: Record<string, unknown>, savedStrip: number[] | null = null, features = [stocks, calendar]) {
    localStorage.setItem('clay-settings', JSON.stringify(settings));
    localStorage.setItem('stock-cache', JSON.stringify({ lastAsOf: '', lastFetchMs: 0, strip: savedStrip }));
    app.startPebbleApp({ clayConfig: [], formatCoords: () => ({}), features });
  }

  // every value sent to the watch under one key, in the order it went
  function sendsOf(key: string) {
    return sendAppMessage.mock.calls.filter(([dict]) => key in dict).map(([dict]) => dict[key]);
  }

  // the request the calendar fetch opened for the feed
  function feedRequest() {
    return sent.find((request) => request.url.startsWith(FEED_URL)) as (typeof sent)[number];
  }

  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    sent = installFakeXhr();
    sendAppMessage.mockClear();
    listeners = {};

    host.Pebble = {
      addEventListener: (type: string, handler: Listener) => {
        listeners[type] = handler;
      },
      sendAppMessage,
      openURL: () => {},
    };

    originalLoad = moduleInternal._load;
    moduleInternal._load = function (this: unknown, request: string, ...args: unknown[]) {
      return fakeModule(request) ?? originalLoad.apply(this, [request, ...args]);
    };
  });

  afterEach(() => {
    moduleInternal._load = originalLoad;
    delete host.Pebble;
    vi.useRealTimers();
  });

  /**
   * Clearing every symbol has to clear the watch. Pushing the strip kept for a shut quota gate
   * instead brings the removed watchlist back on every launch.
   */
  test('sends an empty watchlist rather than the saved one when no symbols are set', () => {
    start({}, SAVED_STRIP);

    listeners.ready();

    expect(sendsOf('STOCK_STRIP')).toEqual([[0]]);
    expect(JSON.parse(localStorage.getItem('stock-cache') as string).strip).toBeNull();
  });

  /** Deleting every upcoming event has to clear the watch, or the deleted events stay on the agenda for good. */
  test('sends an empty agenda when the feed has nothing coming up', () => {
    start({ CALENDAR_ICS_URL: FEED_URL });
    listeners.ready();

    feedRequest().respond(200, 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nEND:VCALENDAR\r\n');

    expect(sendsOf('CALENDAR_STRIP')).toEqual([[0]]);
  });

  /** An error page says nothing about the calendar, and reading it as empty would wipe a real agenda off the watch. */
  test('keeps the agenda when the feed does not read as iCal', () => {
    start({ CALENDAR_ICS_URL: FEED_URL });
    listeners.ready();

    feedRequest().respond(200, '<html>sign in</html>');

    expect(sendsOf('CALENDAR_STRIP')).toEqual([]);
  });

  /**
   * A tick, a watch request, and a URL change can each start a fetch while another is still out.
   * Sending whichever answers last put an older copy of the agenda over a newer one until the next
   * tick, such as the old feed showing after the URL was changed.
   */
  test('drops a feed answer that lands after a newer fetch started', () => {
    // a day out from the faked now, so the event sits inside the agenda's window
    const stamp = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z';
    const withEvent = 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nDTSTART:' + stamp +
      '\r\nSUMMARY:Dentist\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n';
    start({ CALENDAR_ICS_URL: FEED_URL });
    listeners.ready();
    listeners.appmessage({ payload: { CALENDAR_REQUEST: 1 } });
    const [older, newer] = sent.filter((request) => request.url.startsWith(FEED_URL));

    newer.respond(200, withEvent);
    older.respond(200, 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nEND:VCALENDAR\r\n');

    const result = sendsOf('CALENDAR_STRIP');

    expect(result).toHaveLength(1);
    expect(result[0]).not.toEqual([0]);
  });

  /** Removing the feed has to clear the watch too, or the old agenda outlives the setting that made it. */
  test('sends an empty agenda when no feed is set', () => {
    start({});

    listeners.ready();

    expect(sendsOf('CALENDAR_STRIP')).toEqual([[0]]);
  });

  /**
   * A face that opts into no features must not fetch or send stocks or the calendar, even when it
   * declares their keys. Otherwise opting in means nothing, and every face goes back to paying for both.
   */
  test('sends no stock or calendar strip for a face that lists no features', () => {
    start({ CALENDAR_ICS_URL: FEED_URL, STOCK_SYMBOLS: 'AAPL' }, SAVED_STRIP, []);

    listeners.ready();
    listeners.appmessage({ payload: { STOCK_REQUEST: 1, CALENDAR_REQUEST: 1 } });

    expect(sendsOf('STOCK_STRIP')).toEqual([]);
    expect(sendsOf('CALENDAR_STRIP')).toEqual([]);
    expect(sent).toEqual([]);
  });
});

describe('collectDefaults', () => {
  /** The defaults seed the store before the config page opens, so a dropped pair opens a setting on nothing. */
  test('collects every messageKey with a default, recursing into nested items', () => {
    const items = [
      { type: 'select', messageKey: 'WEATHER_PROVIDER', defaultValue: 'openmeteo' },
      { type: 'section', items: [{ type: 'slider', messageKey: 'STOCK_POLL', defaultValue: 5 }] },
    ];

    const result = app.collectDefaults(items);

    expect(result).toEqual({ WEATHER_PROVIDER: 'openmeteo', STOCK_POLL: 5 });
  });

  /** A heading (no messageKey) or a keyed item with no default must be skipped, not seeded as junk. */
  test('skips items with no messageKey or no default', () => {
    const items = [
      { type: 'heading', defaultValue: 'Some Heading' },
      { type: 'input', messageKey: 'STOCK_API_KEY' },
    ];

    const result = app.collectDefaults(items);

    expect(result).toEqual({});
  });
});

describe('getConfig', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  /** The persisted settings must parse back out or every read falls through to defaults. */
  test('returns the parsed clay settings', () => {
    localStorage.setItem('clay-settings', JSON.stringify({ WEATHER_PROVIDER: 'owm' }));

    const result = app.getConfig();

    expect(result).toEqual({ WEATHER_PROVIDER: 'owm' });
  });

  /** With nothing saved the store must read as an empty object, never null that a caller dots into. */
  test('returns an empty object when nothing is saved', () => {
    const result = app.getConfig();

    expect(result).toEqual({});
  });

  /** A corrupt blob must not throw: it falls back to empty so the app still starts. */
  test('returns an empty object on corrupt json', () => {
    localStorage.setItem('clay-settings', '{ not valid');

    const result = app.getConfig();

    expect(result).toEqual({});
  });
});

describe('readValue', () => {
  /** A plain stored value must pass straight through. */
  test('returns a primitive value unchanged', () => {
    const result = app.readValue('finnhub', 'fallback');

    expect(result).toBe('finnhub');
  });

  /** Clay wraps some values as {value}, so the wrapper must be unwrapped or the setting reads as an object. */
  test('unwraps a Clay value wrapper', () => {
    const result = app.readValue({ value: '3' }, 'fallback');

    expect(result).toBe('3');
  });

  /** An empty string, null, or undefined must take the fallback so a blank setting uses its default. */
  test.each([
    ['empty string', ''],
    ['null', null],
    ['undefined', undefined],
  ])('falls back on an empty value (%s)', (label, value) => {
    const result = app.readValue(value, 'fallback');

    expect(result).toBe('fallback');
  });

  /** Zero is a real reading, not an empty value, so it must not be swallowed by the fallback. */
  test('keeps a zero value rather than taking the fallback', () => {
    const result = app.readValue(0, 5);

    expect(result).toBe(0);
  });
});

describe('readBool', () => {
  /** The truthy wire forms (true, "true", 1, "1") must all read as true or a toggle silently stays off. */
  test.each([true, 'true', 1, '1'])('reads %s as true', (value) => {
    const result = app.readBool(value, false);

    expect(result).toBe(true);
  });

  /** Anything else, including the string "0", must read as false so an off toggle stays off. */
  test.each([false, 'false', 0, '0'])('reads %s as false', (value) => {
    const result = app.readBool(value, true);

    expect(result).toBe(false);
  });

  /** An unset setting must take the fallback so a defaulted-on toggle starts on. */
  test('applies the fallback when the value is unset', () => {
    const result = app.readBool(undefined, true);

    expect(result).toBe(true);
  });
});
