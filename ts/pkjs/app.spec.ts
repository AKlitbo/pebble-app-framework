// @vitest-environment jsdom
/**
 * Specs for the shared PebbleKit JS bootstrap.
 *
 * This module is the only copy of the settings glue every face runs, so the hardening
 * it carries (HTTP-status handling, untrusted-payload guards, the settings restore, and
 * the timezone push) is tested here once, along with how each feature plugs into the
 * app's lifecycle. The weather feature's own helpers have specs beside it.
 *
 * The webview globals (localStorage) come from jsdom. XMLHttpRequest is stubbed
 * so nothing touches the network. Clay and the per-face `message_keys` alias are
 * only loaded inside startPebbleApp, so the exported helpers test without them.
 * seedConfigFromWatch takes its message-key map as an argument. The startPebbleApp
 * specs stub both through the module loader and drive the app with a fake Pebble.
 */

import fs from 'node:fs';
import path from 'node:path';
import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import app from './app';
import stocks from '../stock/feature';
import calendar from '../calendar/feature';
import weather, { GPS_WATCHDOG_MS } from '../weather/feature';
import type { Feature } from './feature';
import { installFakeXhr } from '../testing/xhr';
import { stubModuleLoad } from '../testing/module-load';
import { withFakePebble } from '../testing/pebble';
import type { FakePebble } from '../testing/pebble';

// stands in for the per-face generated message_keys: each key name maps to
// itself so payloads and stored config use readable string keys
const messageKeys = new Proxy({}, { get: (_target, prop) => prop });

/**
 * Every source file a module reaches at runtime, following relative imports, re-exports, and
 * requires out from it. Type-only imports are left out, since tsc drops them from the emitted JS.
 */
function runtimeGraph(entry: string): string[] {
  const seen = new Set<string>();

  const visit = (file: string) => {
    if (seen.has(file)) {
      return;
    }

    seen.add(file);
    const source = fs.readFileSync(file, 'utf8');
    const specs = [
      ...[...source.matchAll(/^\s*(?:import|export)(?!\s+type\b)[^;]*?\bfrom\s+['"]([^'"]+)['"]/gm)].map((match) => match[1]),
      ...[...source.matchAll(/^\s*import\s+['"]([^'"]+)['"]/gm)].map((match) => match[1]),
      ...[...source.matchAll(/\brequire\(\s*['"]([^'"]+)['"]\s*\)/g)].map((match) => match[1]),
    ];

    for (const spec of specs.filter((name) => name.startsWith('.'))) {
      const base = path.resolve(path.dirname(file), spec);
      const target = [base, `${base}.ts`, path.join(base, 'index.ts')].find((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile());

      if (target) {
        visit(target);
      }
    }
  };

  visit(entry);
  return [...seen];
}

describe('app imports', () => {
  /**
   * The Pebble bundler follows requires from a face's entry, so a runtime import of the weather code
   * anywhere below app.ts would put every provider in every face's bundle, including a face that
   * never opts in.
   */
  test('reaches no weather code at runtime', () => {
    const weatherDir = path.join(import.meta.dirname, '..', 'weather') + path.sep;

    const result = runtimeGraph(path.join(import.meta.dirname, 'app.ts')).filter((file) => file.startsWith(weatherDir));

    expect(result).toEqual([]);
  });
});

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

describe('startPebbleApp weather', () => {
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

  // the keys the face under test declares. a spec that drops one sets this before it starts the app
  let keys: Record<string, string> = weatherKeys;

  // stands in for the two modules startPebbleApp requires lazily
  function fakeModule(id: string): unknown {
    if (id === 'message_keys') {
      return keys;
    }
    if (id === '@rebble/clay/src/js/index') {
      return FakeClay;
    }
    return undefined;
  }

  let pebble: FakePebble;
  let restoreLoad: () => void;
  let sent: ReturnType<typeof installFakeXhr>;

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
    return pebble.sendAppMessage.mock.calls.filter(([dict]) => 'WEATHER_OK' in dict);
  }

  function fire(type: string, event?: unknown) {
    pebble.fire(type, event);
  }

  function askForWeather() {
    fire('appmessage', { payload: { WEATHER_REQUEST: 1 } });
  }

  /** Starts one app for the spec, with the features the face under test opts into. */
  function start(features: Feature[]) {
    app.startPebbleApp({ clayConfig: [], features });
  }

  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    saveCity('Phoenix', 33.4);
    sent = installFakeXhr();
    keys = weatherKeys;
    pebble = withFakePebble();
    restoreLoad = stubModuleLoad(fakeModule);
  });

  afterEach(() => {
    restoreLoad();
    pebble.restore();
    // the location specs stub this, and a stub left behind would steer a later spec's gps path
    Reflect.deleteProperty(navigator, 'geolocation');
    vi.useRealTimers();
  });

  /** The watch re-asks every 3s until its first reading lands, and those asks must not each start a provider fetch. */
  test('starts no second fetch when the watch asks during a running one', () => {
    start([weather]);
    fire('ready');

    askForWeather();
    askForWeather();
    askForWeather();

    expect(sent).toHaveLength(1);
  });

  /** Dropping the watch's ask is only safe if the fetch already running still answers it. */
  test('sends the running fetch result to the watch that asked', () => {
    start([weather]);
    fire('ready');
    askForWeather();

    sent[0].respond(200, currentBody(21));

    const sends = weatherSends();
    expect(sends).toHaveLength(1);
    expect(sends[0][0]).toMatchObject({ WEATHER_OK: 1, WEATHER_TEMPERATURE: 21 });
  });

  /** A new city must be fetched straight away, and the old city's late reading must never reach the watch. */
  test('lets a weather settings change replace a running fetch', () => {
    start([weather]);
    fire('ready');
    fire('showConfiguration');
    saveCity('Tucson', 32.2);
    fire('webviewclosed', { response: '{}' });
    vi.advanceTimersByTime(app.SETTINGS_REFETCH_DELAY_MS);

    sent[0].respond(200, currentBody(10));
    sent[1].respond(200, currentBody(30));

    const sends = weatherSends();
    expect(sent[1].url).toContain('latitude=32.2');
    expect(sends).toHaveLength(1);
    expect(sends[0][0]).toMatchObject({ WEATHER_TEMPERATURE: 30 });
  });

  /**
   * A face shows its own text when there is no fix, such as Radar Array's NO LOCK. The formatter
   * has to run on a failed result too, or the watch would keep showing the last good fix.
   */
  test('runs the coordinate formatter on a failed fetch', () => {
    const formatCoords = vi.fn((_keys: Record<string, number>, result: { lat?: number }) => ({ LAT: result.lat === undefined ? 'NO LOCK' : String(result.lat) }));
    start([weather.withCoords(formatCoords)]);
    fire('ready');

    sent[0].respond(500, '{}');

    const sends = weatherSends();
    expect(sends[0][0]).toMatchObject({ WEATHER_OK: 0, LAT: 'NO LOCK' });
  });

  /** A good reading carries its coordinates, and a face that shows them must get them. */
  test('adds the formatted coordinates to a good reading', () => {
    start([weather.withCoords((_keys, result) => ({ LAT: String(result.lat) }))]);
    fire('ready');

    sent[0].respond(200, currentBody(21));

    const sends = weatherSends();
    expect(sends[0][0]).toMatchObject({ WEATHER_OK: 1, LAT: '33.4' });
  });

  /** Weather is opt-in, so a face that lists no features must never fetch it or send a reading. */
  test('fetches and sends no weather for a face that lists no features', () => {
    start([]);
    fire('ready');
    askForWeather();

    expect(sent).toHaveLength(0);
    expect(weatherSends()).toHaveLength(0);
  });

  /**
   * The watch only asks for and reads weather with every one of WEATHER_MESSAGE_KEYS declared. A face
   * that opted in but is missing one would otherwise spend provider quota on readings nothing shows.
   */
  test('fetches nothing and says why when an opted-in face is missing a weather key', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const rest: Record<string, string> = { ...weatherKeys };
    delete rest.WEATHER_CONDITIONS;
    keys = rest;
    start([weather]);

    fire('ready');

    expect(sent).toHaveLength(0);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('WEATHER_CONDITIONS'));
    warn.mockRestore();
  });

  /**
   * A watch that rebooted has empty stores and asks again while the phone still holds the dict it
   * last sent. Without the dedupe cache forgotten on that ask, the same reading would be skipped
   * and the rebooted watch would sit on placeholders.
   */
  test('sends the same reading again when the watch asks for it', () => {
    start([weather]);
    fire('ready');
    sent[0].respond(200, currentBody(21));

    askForWeather();
    sent[1].respond(200, currentBody(21));

    expect(weatherSends()).toHaveLength(2);
  });

  /** The phone JS restarting is the other time the watch may hold nothing, so ready forgets the last dict too. */
  test('sends the same reading again after a fresh ready', () => {
    start([weather]);
    fire('ready');
    sent[0].respond(200, currentBody(21));

    fire('ready');
    sent[1].respond(200, currentBody(21));

    expect(weatherSends()).toHaveLength(2);
  });

  /** With GPS off and no city saved there is nothing to fetch for, and the panel has to say so rather than stay blank. */
  test('sends a No Location status when GPS is off and no city is saved', () => {
    localStorage.setItem('clay-settings', JSON.stringify({ WEATHER_PROVIDER: 'openmeteo', LOCATION_USE_GPS: false }));
    start([weather]);

    fire('ready');

    expect(sent).toHaveLength(0);
    expect(weatherSends()[0][0]).toMatchObject({ WEATHER_OK: 0, WEATHER_CONDITIONS: 'NO LOCATION' });
  });

  /** A phone with no location service and the fallback off must get a status, not a silent wait. */
  test('sends a No GPS status when GPS is unavailable and the fallback is off', () => {
    localStorage.setItem('clay-settings', JSON.stringify({ WEATHER_PROVIDER: 'openmeteo', LOCATION_USE_GPS: true, LOCATION_GPS_FALLBACK: false }));
    Object.defineProperty(navigator, 'geolocation', { value: undefined, configurable: true });
    start([weather]);

    fire('ready');

    expect(weatherSends()[0][0]).toMatchObject({ WEATHER_OK: 0, WEATHER_CONDITIONS: 'NO GPS' });
  });

  /**
   * The Pebble app's geolocation can hang and never call back. Without the watchdog a user with the
   * fallback on would get nothing, so once it fires the saved city is fetched instead.
   */
  test('falls back to the saved city when a GPS lookup never answers', () => {
    localStorage.setItem('clay-settings', JSON.stringify({
      WEATHER_PROVIDER: 'openmeteo',
      LOCATION_USE_GPS: true,
      LOCATION_GPS_FALLBACK: true,
      LOCATION_NAME: JSON.stringify({ lat: 33.4, lon: -112, label: 'Phoenix' }),
    }));
    Object.defineProperty(navigator, 'geolocation', { value: { getCurrentPosition: () => {} }, configurable: true });
    start([weather]);
    fire('ready');

    vi.advanceTimersByTime(GPS_WATCHDOG_MS);

    expect(sent).toHaveLength(1);
    expect(sent[0].url).toContain('latitude=33.4');
  });

  /**
   * A face that updated the framework and forgot to list weather keeps its watch asking, and the phone
   * would ignore every ask. One warning in the log points at the missing opt-in.
   */
  test('warns once when the watch asks for weather that no listed feature answers', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    start([]);

    askForWeather();
    askForWeather();

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('WEATHER_REQUEST'));
    warn.mockRestore();
  });
});

describe('startPebbleApp stock and calendar', () => {
  // the keys Gridlock declares for the two strips, and its weather keys. these specs start no weather
  // feature, so no weather goes out whatever the face declares
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

  let pebble: FakePebble;
  let restoreLoad: () => void;
  let sent: ReturnType<typeof installFakeXhr>;

  const FEED_URL = 'https://example.com/calendar.ics';

  // saves the settings and the stock cache the app reads when it starts, then starts it with the
  // features a face like Gridlock opts into
  function start(settings: Record<string, unknown>, savedStrip: number[] | null = null, features = [stocks, calendar]) {
    localStorage.setItem('clay-settings', JSON.stringify(settings));
    localStorage.setItem('stock-cache', JSON.stringify({ lastAsOf: '', lastFetchMs: 0, strip: savedStrip }));
    app.startPebbleApp({ clayConfig: [], features });
  }

  // every value sent to the watch under one key, in the order it went
  function sendsOf(key: string) {
    return pebble.sendAppMessage.mock.calls.filter(([dict]) => key in dict).map(([dict]) => dict[key]);
  }

  // the request the calendar fetch opened for the feed
  function feedRequest() {
    return sent.find((request) => request.url.startsWith(FEED_URL)) as (typeof sent)[number];
  }

  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    sent = installFakeXhr();
    pebble = withFakePebble();
    restoreLoad = stubModuleLoad(fakeModule);
  });

  afterEach(() => {
    restoreLoad();
    pebble.restore();
    vi.useRealTimers();
  });

  /**
   * Clearing every symbol has to clear the watch. Pushing the strip kept for a shut quota gate
   * instead brings the removed watchlist back on every launch.
   */
  test('sends an empty watchlist rather than the saved one when no symbols are set', () => {
    start({}, SAVED_STRIP);

    pebble.fire('ready');

    expect(sendsOf('STOCK_STRIP')).toEqual([[0]]);
    expect(JSON.parse(localStorage.getItem('stock-cache') as string).strip).toBeNull();
  });

  /** Deleting every upcoming event has to clear the watch, or the deleted events stay on the agenda for good. */
  test('sends an empty agenda when the feed has nothing coming up', () => {
    start({ CALENDAR_ICS_URL: FEED_URL });
    pebble.fire('ready');

    feedRequest().respond(200, 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nEND:VCALENDAR\r\n');

    expect(sendsOf('CALENDAR_STRIP')).toEqual([[0]]);
  });

  /** An error page says nothing about the calendar, and reading it as empty would wipe a real agenda off the watch. */
  test('keeps the agenda when the feed does not read as iCal', () => {
    start({ CALENDAR_ICS_URL: FEED_URL });
    pebble.fire('ready');

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
    pebble.fire('ready');
    pebble.fire('appmessage', { payload: { CALENDAR_REQUEST: 1 } });
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

    pebble.fire('ready');

    expect(sendsOf('CALENDAR_STRIP')).toEqual([[0]]);
  });

  /**
   * A face that opts into no features must not fetch or send stocks or the calendar, even when it
   * declares their keys. Otherwise opting in means nothing, and every face goes back to paying for both.
   */
  test('sends no stock or calendar strip for a face that lists no features', () => {
    start({ CALENDAR_ICS_URL: FEED_URL, STOCK_SYMBOLS: 'AAPL' }, SAVED_STRIP, []);

    pebble.fire('ready');
    pebble.fire('appmessage', { payload: { STOCK_REQUEST: 1, CALENDAR_REQUEST: 1 } });

    expect(sendsOf('STOCK_STRIP')).toEqual([]);
    expect(sendsOf('CALENDAR_STRIP')).toEqual([]);
    expect(sent).toEqual([]);
  });
});

describe('startPebbleApp settings restore', () => {
  // a face that declares SETTINGS_FRESH, which is what turns the seed into the two-way restore.
  // no weather or strip key, so a ready starts no fetch and the only sends are the restore's
  const restoreKeys = {
    SETTINGS_REQUEST: 'SETTINGS_REQUEST',
    SETTINGS_FRESH: 'SETTINGS_FRESH',
    CLOCK_DATE_FORMAT: 'CLOCK_DATE_FORMAT',
    APPEARANCE_THEME: 'APPEARANCE_THEME',
  };

  class FakeClay {
    registerComponent() {}
    // the real Clay turns the saved config into the dict a Save sends, so the fake hands the
    // config straight back and a restore shows up as those values reaching the watch
    getSettings(json: string) {
      return JSON.parse(json);
    }
    generateUrl() {
      return '';
    }
  }

  function fakeModule(id: string): unknown {
    if (id === 'message_keys') {
      return restoreKeys;
    }
    if (id === '@rebble/clay/src/js/index') {
      return FakeClay;
    }
    return undefined;
  }

  let pebble: FakePebble;
  let restoreLoad: () => void;

  /** The watch's reply to SETTINGS_REQUEST, carrying its own settings and whether it booted empty. */
  function watchReplies(fresh: boolean, dateFormat: string) {
    pebble.fire('appmessage', { payload: { SETTINGS_FRESH: fresh ? 1 : 0, CLOCK_DATE_FORMAT: dateFormat, APPEARANCE_THEME: 2 } });
  }

  /** What the phone has saved now. */
  function stored(key: string) {
    return JSON.parse(localStorage.getItem('clay-settings') as string)[key];
  }

  /** Every dict sent to the watch that carries settings rather than a request. */
  function restoreSends() {
    return pebble.sendAppMessage.mock.calls.filter(([dict]) => 'CLOCK_DATE_FORMAT' in dict).map(([dict]) => dict);
  }

  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    installFakeXhr();
    pebble = withFakePebble();
    restoreLoad = stubModuleLoad(fakeModule);
  });

  afterEach(() => {
    restoreLoad();
    pebble.restore();
    vi.useRealTimers();
  });

  /**
   * An install or an update can wipe the watch's own settings. The phone still holds them, so they
   * go back to the watch. Seeding the other way instead would take the watch's defaults as the
   * truth and throw away everything the wearer had set.
   */
  test('pushes the phone config back to a watch that booted with no settings', () => {
    localStorage.setItem('clay-settings', JSON.stringify({ CLOCK_DATE_FORMAT: '%d.%m.%Y', APPEARANCE_THEME: '5' }));
    app.startPebbleApp({ clayConfig: [] });
    pebble.fire('ready');

    watchReplies(true, '%Y-%m-%d');

    const result = restoreSends();
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ CLOCK_DATE_FORMAT: '%d.%m.%Y', APPEARANCE_THEME: '5' });
    expect(stored('CLOCK_DATE_FORMAT')).toBe('%d.%m.%Y');
  });

  /**
   * The watch only ends fresh on a message marked as the settings page's. An unmarked restore would
   * sit in memory, never reach flash, and the watch would ask to be restored again on every launch.
   */
  test('marks the restore as the settings page message', () => {
    localStorage.setItem('clay-settings', JSON.stringify({ CLOCK_DATE_FORMAT: '%d.%m.%Y' }));
    app.startPebbleApp({ clayConfig: [] });
    pebble.fire('ready');

    watchReplies(true, '%Y-%m-%d');

    expect(restoreSends()[0]).toMatchObject({ SETTINGS_FRESH: 0 });
  });

  /**
   * A save from the settings page is the other message that ends fresh. Unmarked, a watch that lost
   * its restore would keep the save only until the next relaunch.
   */
  test('marks a save from the settings page', () => {
    app.startPebbleApp({ clayConfig: [] });

    pebble.fire('webviewclosed', { response: JSON.stringify({ CLOCK_DATE_FORMAT: '%d.%m.%Y' }) });

    expect(restoreSends()[0]).toMatchObject({ CLOCK_DATE_FORMAT: '%d.%m.%Y', SETTINGS_FRESH: 0 });
  });

  /**
   * A phone that lost its store, through a new phone or the app's data being cleared, has nothing
   * to push. The watch is the only copy left, so the config page has to open on what the watch is
   * showing rather than on the face's defaults.
   */
  test('seeds from the watch when the phone has nothing saved', () => {
    app.startPebbleApp({ clayConfig: [] });
    pebble.fire('ready');

    watchReplies(false, '%Y-%m-%d');

    expect(stored('CLOCK_DATE_FORMAT')).toBe('%Y-%m-%d');
    expect(restoreSends()).toHaveLength(0);
  });

  /**
   * With settings on both sides the phone is the truth and the watch already agrees, so a launch
   * must change neither. Seeding here would overwrite the phone from a watch that is a save behind.
   */
  test('leaves both sides alone when each already has settings', () => {
    localStorage.setItem('clay-settings', JSON.stringify({ CLOCK_DATE_FORMAT: '%d.%m.%Y' }));
    app.startPebbleApp({ clayConfig: [] });
    pebble.fire('ready');

    watchReplies(false, '%Y-%m-%d');

    expect(stored('CLOCK_DATE_FORMAT')).toBe('%d.%m.%Y');
    expect(restoreSends()).toHaveLength(0);
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
