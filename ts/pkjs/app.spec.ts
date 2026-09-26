// @vitest-environment jsdom
/**
 * Specs for the shared PebbleKit JS bootstrap.
 *
 * This module is the only copy of the settings glue every face runs, so the hardening
 * it carries (untrusted-payload guards, the settings restore, and the timezone push) is
 * tested here once, along with how each feature plugs into the
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
import app, { collectDefaults, retimeSettings, seedConfigFromWatch, SETTINGS_REFETCH_DELAY_MS, wrapStoredConfig } from './app';
import { WIRE_CAPS } from './wire';
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

describe('seedConfigFromWatch', () => {
  // a settings page with one of every kind of item the seed tells apart, one of them in a section
  const page = [
    { type: 'select', messageKey: 'CLOCK_DATE_FORMAT' },
    { type: 'select', messageKey: 'APPEARANCE_THEME' },
    { type: 'section', items: [{ type: 'select', messageKey: 'WEATHER_TEMPERATURE_UNIT' }] },
    { type: 'toggle', messageKey: 'APPEARANCE_FACE_COLORS' },
    { type: 'color', messageKey: 'APPEARANCE_REEL_COLOR' },
    { type: 'slider', messageKey: 'STOCK_POLL' },
    { type: 'layoutBuilder', messageKey: 'LAYOUT' },
    { type: 'locationsearch', messageKey: 'LOCATION_NAME' },
  ];

  // a settings page with one time zone picker on it
  const zonePage = [{ type: 'locationsearch', messageKey: 'CLOCK_TIMEZONE_1', timeZone: true }];

  beforeEach(() => {
    localStorage.clear();
  });

  /** Reads the value seedConfigFromWatch persisted under a given key. */
  function stored(key: string) {
    return JSON.parse(localStorage.getItem('clay-settings'))[key];
  }

  /** Whether anything was persisted under a key. */
  function seeded(key: string) {
    return key in JSON.parse(localStorage.getItem('clay-settings'));
  }

  /** A date format string from the watch must seed the config so it opens with the real value. */
  test('copies a select that arrived as a string', () => {
    seedConfigFromWatch(messageKeys, { CLOCK_DATE_FORMAT: '%Y.%m.%d' }, page);

    const result = stored('CLOCK_DATE_FORMAT');

    expect(result).toBe('%Y.%m.%d');
  });

  /** A select rides as its number, and Clay's options are strings, so it has to be stringified. */
  test('stringifies a select that arrived as a number', () => {
    seedConfigFromWatch(messageKeys, { APPEARANCE_THEME: 3 }, page);

    const result = stored('APPEARANCE_THEME');

    expect(result).toBe('3');
  });

  /** A value that is neither a string nor a number is malformed and must be skipped. */
  test('skips a value that is neither a string nor a number', () => {
    seedConfigFromWatch(messageKeys, { APPEARANCE_THEME: { nested: true } }, page);

    const result = seeded('APPEARANCE_THEME');

    expect(result).toBe(false);
  });

  /**
   * The temperature unit only seeded on a face that listed it by hand, so six faces opened their
   * settings on Celsius whatever the watch was set to. An item nested in a section has to seed too.
   */
  test.each([
    [1, '1'],
    [0, '0'],
  ])('seeds a select inside a section, %s as "%s"', (value, expected) => {
    seedConfigFromWatch(messageKeys, { WEATHER_TEMPERATURE_UNIT: value }, page);

    const result = stored('WEATHER_TEMPERATURE_UNIT');

    expect(result).toBe(expected);
  });

  /** Clay's colour picker reads a string as hex, so a colour has to stay the number the watch sent. */
  test('seeds a colour as a number', () => {
    seedConfigFromWatch(messageKeys, { APPEARANCE_REEL_COLOR: 0xFF0000 }, page);

    const result = stored('APPEARANCE_REEL_COLOR');

    expect(result).toBe(0xFF0000);
  });

  /** A colour that arrived as anything but a number is malformed and must be skipped. */
  test('skips a colour that is not a number', () => {
    seedConfigFromWatch(messageKeys, { APPEARANCE_REEL_COLOR: 'ff0000' }, page);

    const result = seeded('APPEARANCE_REEL_COLOR');

    expect(result).toBe(false);
  });

  /** A toggle rides as 0/1 but Clay sets it from a real boolean, so the seed has to convert. */
  test.each([
    [1, true],
    [0, false],
  ])('seeds a toggle %s as %s', (value, expected) => {
    seedConfigFromWatch(messageKeys, { APPEARANCE_FACE_COLORS: value }, page);

    const result = stored('APPEARANCE_FACE_COLORS');

    expect(result).toBe(expected);
  });

  /** A slider holds a number, and the watch may send it as its text, so it seeds as the number. */
  test('seeds a slider as a number', () => {
    seedConfigFromWatch(messageKeys, { STOCK_POLL: '30' }, page);

    const result = stored('STOCK_POLL');

    expect(result).toBe(30);
  });

  /** A face's own builder stores its string, so the layout comes back as the watch holds it. */
  test('seeds a custom builder as its string', () => {
    seedConfigFromWatch(messageKeys, { LAYOUT: '2,0,0,2,2' }, page);

    const result = stored('LAYOUT');

    expect(result).toBe('2,0,0,2,2');
  });

  /**
   * A saved place needs its coordinates, which the watch never keeps. Seeding the name alone would
   * leave the weather fetching for a place with no position.
   */
  test('skips a place field', () => {
    seedConfigFromWatch(messageKeys, { LOCATION_NAME: 'Phoenix' }, page);

    const result = seeded('LOCATION_NAME');

    expect(result).toBe(false);
  });

  /** The reply's marker and fresh flag have no item on the page, so they must not land in the store. */
  test('skips a key the settings page has no item for', () => {
    seedConfigFromWatch(messageKeys, { SETTINGS_REQUEST: 1, SETTINGS_FRESH: 0 }, page);

    const result = JSON.parse(localStorage.getItem('clay-settings'));

    expect(result).toEqual({});
  });

  /**
   * The watch holds a slider stepping in tenths as ten times its value. Seeding that as it came
   * made the next restore scale it again, so 1.5 reached the watch as 150 and fell back to the
   * default.
   */
  test('seeds a slider back at the scale the page keeps it', () => {
    const sliderPage = [{ type: 'slider', messageKey: 'RATE', step: 0.1 }];

    seedConfigFromWatch({ RATE: 'RATE' }, { RATE: 15 }, sliderPage);

    const result = stored('RATE');
    expect(result).toBe(1.5);
  });

  /**
   * A phone that lost its store, through a new phone or the app's data being cleared, opened the
   * settings page on an empty Alternate Time Zone while the watch carried on showing the old one.
   * Saving from there sent nothing back and the panel dropped to UTC.
   */
  test('seeds a timezone field from the watch', () => {
    seedConfigFromWatch({ CLOCK_TIMEZONE_1: 'CLOCK_TIMEZONE_1' }, { CLOCK_TIMEZONE_1: '-420,Phoenix' }, zonePage);

    const result = stored('CLOCK_TIMEZONE_1');

    expect(result).toBe('-420,Phoenix');
  });

  /** A number off the watch is not a saved place, and seeding it would leave the picker showing nothing. */
  test('skips a timezone value that did not arrive as a string', () => {
    seedConfigFromWatch({ CLOCK_TIMEZONE_1: 'CLOCK_TIMEZONE_1' }, { CLOCK_TIMEZONE_1: 1 }, zonePage);

    const result = seeded('CLOCK_TIMEZONE_1');

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

    seedConfigFromWatch({ CLOCK_TIMEZONE_1: 'CLOCK_TIMEZONE_1' }, { CLOCK_TIMEZONE_1: '60,London' }, zonePage);

    const result = stored('CLOCK_TIMEZONE_1');

    expect(result).toBe(saved);
  });
});

describe('wrapStoredConfig', () => {
  /**
   * Clay reads `.value` off any object it is handed. A checkboxgroup's bare array has none, so the
   * restore dropped the setting and Clay wrote the phone's copy back without it.
   */
  test('keeps an array whole inside the wrapper', () => {
    const config = { DAYS: ['mon', 'wed'] };

    const result = wrapStoredConfig(config, [], { DAYS: 1 });

    expect(result.DAYS).toEqual({ value: ['mon', 'wed'] });
  });

  /**
   * A face update can rename or drop a setting while the phone still holds the old name. With no key
   * for it Clay sent it as undefined0, and a restore the phone could not send left the watch on its
   * defaults.
   */
  test('leaves out a setting the face has no key for', () => {
    const result = wrapStoredConfig({ OLD_NAME: '1', CLOCK_DATE_FORMAT: '%d' }, [], { CLOCK_DATE_FORMAT: 3 });

    expect(Object.keys(result)).toEqual(['CLOCK_DATE_FORMAT']);
  });

  /**
   * An array key sits in message_keys under its base name alone. Looked up whole, SLOT[1] had no
   * key, so a restore left it out and Clay wrote the phone's copy back without it.
   */
  test('keeps a setting on an array key', () => {
    const result = wrapStoredConfig({ 'SLOT[1]': 'weather' }, [], { SLOT: 20 });

    expect(result['SLOT[1]']).toEqual({ value: 'weather' });
  });

  /** A slider stepping in tenths goes to the watch scaled by ten, so 1.5 left unscaled reached it as 1. */
  test('gives a slider the precision its step carries', () => {
    const page = [{ type: 'section', items: [{ type: 'slider', messageKey: 'RATE', step: 0.1 }] }];

    const result = wrapStoredConfig({ RATE: 1.5 }, page, { RATE: 2 });

    expect(result.RATE).toEqual({ value: 1.5, precision: 1 });
  });
});

describe('retimeSettings', () => {
  const timezoneKeys = { CLOCK_TIMEZONE_1: 11 };
  const zonePage = [{ type: 'locationsearch', messageKey: 'CLOCK_TIMEZONE_1', timeZone: true }];
  // a June evening, when London is an hour ahead of UTC and the saved offset of 0 is a winter one
  const nowMs = Date.UTC(2026, 5, 10, 22, 0);

  /** The watch reads the offset rather than the zone, so a saved place has to arrive rewritten. */
  test('rewrites a saved place into the offset it reads today', () => {
    const dict = { 11: JSON.stringify({ label: 'London', offset: 0, tz: 'Europe/London' }) };

    const result = retimeSettings(dict, timezoneKeys, zonePage, nowMs);

    expect(result[11]).toBe('60,London');
  });

  /**
   * A picker on an array key was not found, so the watch got the saved place's JSON, read its offset
   * as 0, and showed text from inside the JSON as the city name.
   */
  test('rewrites a picker on an array key', () => {
    const arrayPage = [{ type: 'locationsearch', messageKey: 'CLOCK_TZ[1]', timeZone: true }];
    const dict = { 21: JSON.stringify({ label: 'London', offset: 0, tz: 'Europe/London' }) };

    const result = retimeSettings(dict, { CLOCK_TZ: 20 }, arrayPage, nowMs);

    expect(result[21]).toBe('60,London');
  });

  /**
   * Clearing the picker saves nothing for the field. Dropping it from the save left the watch on the
   * old city while the phone showed none, so it goes out empty and the watch shows no zone.
   */
  test('sends a cleared timezone field as empty', () => {
    const dict = { 11: '' };

    const result = retimeSettings(dict, timezoneKeys, zonePage, nowMs);

    expect(result[11]).toBe('');
  });

  /** A value that is not a string is not a saved place, and blanking it would leave the setting stuck. */
  test('leaves a timezone field that is not a string alone', () => {
    const dict = { 11: 3 };

    const result = retimeSettings(dict, timezoneKeys, zonePage, nowMs);

    expect(result[11]).toBe(3);
  });

  /** The page marks a picker as a time zone, so a face can name its key anything and still get a working clock. */
  test('rewrites a marked picker whatever its key is called', () => {
    const dict = { 12: JSON.stringify({ label: 'London', offset: 0, tz: 'Europe/London' }) };
    const page = [{ type: 'section', items: [{ type: 'locationsearch', messageKey: 'SECOND_CLOCK', timeZone: true }] }];

    const result = retimeSettings(dict, { SECOND_CLOCK: 12 }, page, nowMs);

    expect(result[12]).toBe('60,London');
  });

  /** A key that only looks like a time zone is not one, and rewriting it would send the watch a place it never asked for. */
  test('leaves an unmarked key named like a time zone alone', () => {
    const saved = JSON.stringify({ label: 'London', offset: 0, tz: 'Europe/London' });
    const page = [{ type: 'locationsearch', messageKey: 'CLOCK_TIMEZONE_1' }];

    const result = retimeSettings({ 11: saved }, timezoneKeys, page, nowMs);

    expect(result[11]).toBe(saved);
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
    // Clay parses the page's response as JSON and throws on anything else
    getSettings(response: string) {
      JSON.parse(response);
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
    // a fixed Wednesday noon in New York, so the market gates and the calendar window give the
    // same answer whenever and wherever the suite runs
    vi.setSystemTime(Date.UTC(2026, 6, 1, 16, 0));
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
    vi.restoreAllMocks();
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
    vi.advanceTimersByTime(SETTINGS_REFETCH_DELAY_MS);

    sent[0].respond(200, currentBody(10));
    sent[1].respond(200, currentBody(30));

    const sends = weatherSends();
    expect(sent[1].url).toContain('latitude=32.2');
    expect(sends).toHaveLength(1);
    expect(sends[0][0]).toMatchObject({ WEATHER_TEMPERATURE: 30 });
  });

  /**
   * Some phones close the page with CANCELLED rather than the settings, and Clay throws on it. The
   * throw escaped the listener, and nothing was saved, so no feature should refetch either.
   */
  test('ignores a page that closes without settings', () => {
    start([weather]);
    fire('ready');
    fire('showConfiguration');
    vi.spyOn(console, 'error').mockImplementation(() => {});

    fire('webviewclosed', { response: 'CANCELLED' });
    vi.advanceTimersByTime(SETTINGS_REFETCH_DELAY_MS);

    expect(sent).toHaveLength(1);
  });

  /**
   * A fetch still out when the wearer switched units could answer in the moment before the refetch,
   * and its reading in the old unit reached the watch after the switch, as 20F for 20 degrees C.
   */
  test('drops a reading that lands after a save and before its refetch', () => {
    start([weather]);
    fire('ready');
    fire('showConfiguration');
    saveCity('Tucson', 32.2);
    fire('webviewclosed', { response: '{}' });

    sent[0].respond(200, currentBody(20));

    expect(weatherSends()).toHaveLength(0);
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
  const OTHER_FEED_URL = 'https://example.com/other.ics';

  // saves the settings and the stock cache the app reads when it starts, then starts it with the
  // features a face like Gridlock opts into. a saved strip came from a fetch, so it carries a stamp
  function start(settings: Record<string, unknown>, savedStrip: number[] | null = null, features = [stocks, calendar]) {
    const lastFetchMs = savedStrip ? Date.now() - 60000 : 0;
    localStorage.setItem('clay-settings', JSON.stringify(settings));
    localStorage.setItem('stock-cache', JSON.stringify({ lastAsOf: '', lastFetchMs, strip: savedStrip }));
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
    // a fixed Wednesday noon in New York, so the market gates and the calendar window give the
    // same answer whenever and wherever the suite runs
    vi.setSystemTime(Date.UTC(2026, 6, 1, 16, 0));
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

  /**
   * A symbol change whose forced fetch failed left the old strip kept. The next request the quota
   * gate held sent the removed tickers back over the error strip, where they stayed till the gate
   * opened, which for Alpha Vantage is tomorrow.
   */
  test('does not bring back the old tickers after a failed fetch for new ones', () => {
    // a Wednesday morning in New York, when Alpha Vantage's gate is shut on anything unforced
    vi.setSystemTime(Date.UTC(2026, 6, 1, 15, 0));
    start({ STOCK_PROVIDER: 'alphavantage', STOCK_SYMBOLS: 'AAPL' }, SAVED_STRIP, [stocks]);
    pebble.fire('ready');
    pebble.fire('showConfiguration');
    localStorage.setItem('clay-settings', JSON.stringify({ STOCK_PROVIDER: 'alphavantage', STOCK_SYMBOLS: 'TSLA' }));
    pebble.fire('webviewclosed', { response: '{}' });
    vi.advanceTimersByTime(SETTINGS_REFETCH_DELAY_MS);
    sent.forEach((request) => request.respond(500, ''));

    pebble.fire('appmessage', { payload: { STOCK_REQUEST: 1 } });

    const result = sendsOf('STOCK_STRIP');
    expect(result[0]).toEqual(SAVED_STRIP);
    expect(result[result.length - 1]).not.toEqual(SAVED_STRIP);
  });

  /**
   * A fetch the network ate says nothing about the quotes. Sending its strip put NET ERROR in every
   * slot over the last good quotes, and the watch kept it through a relaunch.
   */
  test('keeps the last good strip on the watch when the provider never answered', () => {
    // Yahoo needs no key, so the fetch really goes out. a provider missing its key answers at once
    start({ STOCK_PROVIDER: 'yahoo', STOCK_SYMBOLS: 'AAPL' }, SAVED_STRIP, [stocks]);
    pebble.fire('ready');

    sent.forEach((request) => request.fail());

    const result = sendsOf('STOCK_STRIP');
    expect(result[result.length - 1]).toEqual(SAVED_STRIP);
  });

  /** A face that lists stocks without the strip key has nowhere to put one, and a send under an undefined key tied up the outbox. */
  test('sends nothing for a face without the strip key', () => {
    stripKeys.STOCK_STRIP = undefined as unknown as string;
    start({ STOCK_SYMBOLS: 'AAPL' }, SAVED_STRIP, [stocks]);

    pebble.fire('ready');

    const result = pebble.sendAppMessage.mock.calls.filter(([dict]) => 'undefined' in dict);
    stripKeys.STOCK_STRIP = 'STOCK_STRIP';
    expect(result).toEqual([]);
  });

  /**
   * A mistyped ticker answers NO SYMBOL and still spends a call. The time of that call stayed in
   * memory only, so every restart of the phone's JS forgot it and let another call through.
   */
  test('keeps the time of a call spent on an answer with nothing good across a restart', () => {
    start({ STOCK_PROVIDER: 'twelvedata', STOCK_API_KEY: 'k', STOCK_SYMBOLS: 'APPL' }, null, [stocks]);
    pebble.fire('ready');

    sent.forEach((request) => request.respond(200, JSON.stringify({ status: 'error', code: 404, message: 'symbol not found' })));

    const result = JSON.parse(localStorage.getItem('stock-cache') as string).lastFetchMs;
    expect(result).toBeGreaterThan(0);
  });

  /**
   * The provider lookup ignores case but the quota gate compared the name exactly, so a select
   * saving TwelveData got the right provider with no gate on it at all.
   */
  test('gates a provider saved with capitals the same as one saved in lowercase', () => {
    start({ STOCK_PROVIDER: 'TwelveData', STOCK_API_KEY: 'k', STOCK_SYMBOLS: 'AAPL' }, null, [stocks]);
    pebble.fire('ready');
    sent.forEach((request) => request.respond(200, JSON.stringify({ symbol: 'AAPL', close: '150', change: '1', percent_change: '0.5', datetime: '2026-07-01' })));
    const before = sent.length;

    pebble.fire('appmessage', { payload: { STOCK_REQUEST: 1 } });

    expect(sent.length).toBe(before);
  });

  /**
   * A round still out for the old symbols when the wearer saved new ones answered in the moment
   * before the refetch, and put the old list back on the phone as the strip to keep.
   */
  test('drops a late answer for the symbols the wearer just replaced', () => {
    start({ STOCK_PROVIDER: 'yahoo', STOCK_SYMBOLS: 'AAPL' }, null, [stocks]);
    pebble.fire('ready');
    const oldRequest = sent[sent.length - 1];
    pebble.fire('showConfiguration');
    localStorage.setItem('clay-settings', JSON.stringify({ STOCK_PROVIDER: 'yahoo', STOCK_SYMBOLS: 'TSLA' }));
    pebble.fire('webviewclosed', { response: '{}' });

    oldRequest.respond(200, JSON.stringify({ chart: { result: [{ meta: { symbol: 'AAPL', regularMarketPrice: 261.74, chartPreviousClose: 260.5, regularMarketTime: 1719849600 } }], error: null } }));

    const result = JSON.parse(localStorage.getItem('stock-cache') as string).strip;
    expect(result).toBeNull();
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
   * A URL change starts a fetch while the old feed's download is still out, and the two can answer
   * in any order. Sending whichever answers last put the old feed's agenda over the new one until
   * the next refresh.
   */
  test('drops a feed answer that lands after a newer fetch started', () => {
    // a day out from the faked now, so the event sits inside the agenda's window
    const stamp = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z';
    const withEvent = 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nDTSTART:' + stamp +
      '\r\nSUMMARY:Dentist\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n';
    start({ CALENDAR_ICS_URL: FEED_URL });
    pebble.fire('ready');
    pebble.fire('showConfiguration');
    localStorage.setItem('clay-settings', JSON.stringify({ CALENDAR_ICS_URL: OTHER_FEED_URL }));
    pebble.fire('webviewclosed', { response: '{}' });
    vi.advanceTimersByTime(SETTINGS_REFETCH_DELAY_MS);
    const older = feedRequest();
    const newer = sent.find((request) => request.url.startsWith(OTHER_FEED_URL)) as (typeof sent)[number];

    newer.respond(200, withEvent);
    older.respond(200, 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nEND:VCALENDAR\r\n');

    const result = sendsOf('CALENDAR_STRIP');

    expect(result).toHaveLength(1);
    expect(result[0]).not.toEqual([0]);
  });

  /**
   * A download of the old feed still out when the wearer saved a new URL answered in the moment
   * before the refetch, and pushed the old agenda to the watch. When the new feed's download then
   * failed, it stayed there, on the watch and in its flash, until the next poll answered.
   */
  test('drops the old feed answering in the moment before the refetch for a new one', () => {
    // a day out from the faked now, so the event sits inside the agenda's window
    const stamp = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z';
    const withEvent = 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nDTSTART:' + stamp +
      '\r\nSUMMARY:Dentist\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n';
    start({ CALENDAR_ICS_URL: FEED_URL });
    pebble.fire('ready');
    pebble.fire('showConfiguration');
    localStorage.setItem('clay-settings', JSON.stringify({ CALENDAR_ICS_URL: OTHER_FEED_URL }));
    pebble.fire('webviewclosed', { response: '{}' });

    feedRequest().respond(200, withEvent);
    vi.advanceTimersByTime(SETTINGS_REFETCH_DELAY_MS);

    const result = sendsOf('CALENDAR_STRIP');

    expect(result).toEqual([]);
  });

  /**
   * The watch asks as the phone comes up, so every launch downloaded and parsed the whole feed twice.
   * The download already out answers the ask.
   */
  test('starts no second download for a watch ask while one is out', () => {
    start({ CALENDAR_ICS_URL: FEED_URL });
    pebble.fire('ready');
    pebble.fire('appmessage', { payload: { CALENDAR_REQUEST: 1 } });

    feedRequest().respond(200, 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nEND:VCALENDAR\r\n');

    const downloads = sent.filter((request) => request.url.startsWith(FEED_URL));
    expect(downloads).toHaveLength(1);
    expect(sendsOf('CALENDAR_STRIP')).toEqual([[0]]);
  });

  /**
   * The phone downloaded the whole feed on every 5 minute tick, whatever refresh interval the wearer
   * picked for the watch. It now leaves the refresh to the watch's asks, and fills in with a download
   * on a slow tick only once the watch has gone quiet.
   */
  test('leaves the refresh to the watch until it stops asking', () => {
    start({ CALENDAR_ICS_URL: FEED_URL });
    pebble.fire('ready');
    feedRequest().respond(200, 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nEND:VCALENDAR\r\n');

    // the phone's refresh ticks every 5 minutes and every sixth one is slow
    vi.advanceTimersByTime(30 * 60 * 1000);
    const afterHalfHour = sent.filter((request) => request.url.startsWith(FEED_URL)).length;
    vi.advanceTimersByTime(30 * 60 * 1000);
    const afterHour = sent.filter((request) => request.url.startsWith(FEED_URL)).length;

    expect(afterHalfHour).toBe(1);
    expect(afterHour).toBe(2);
  });

  /** Clearing the feed while a download is out must not leave every later refresh doing nothing. */
  test('keeps refreshing after the feed is cleared mid download', () => {
    start({ CALENDAR_ICS_URL: FEED_URL });
    pebble.fire('ready');
    pebble.fire('showConfiguration');
    localStorage.setItem('clay-settings', JSON.stringify({}));
    pebble.fire('webviewclosed', { response: '{}' });
    vi.advanceTimersByTime(SETTINGS_REFETCH_DELAY_MS);
    feedRequest().respond(200, 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nEND:VCALENDAR\r\n');
    localStorage.setItem('clay-settings', JSON.stringify({ CALENDAR_ICS_URL: OTHER_FEED_URL }));

    pebble.fire('appmessage', { payload: { CALENDAR_REQUEST: 1 } });

    const result = sent.filter((request) => request.url.startsWith(OTHER_FEED_URL));
    expect(result).toHaveLength(1);
  });

  /** An iCloud Subscribe link starts webcal://, which the phone cannot fetch, so the agenda never filled. */
  test('fetches a webcal link over https', () => {
    start({ CALENDAR_ICS_URL: 'webcal://example.com/calendar.ics' });

    pebble.fire('ready');

    const result = sent.map((request) => request.url);
    expect(result.some((url) => url.startsWith(FEED_URL))).toBe(true);
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
    CLOCK_TIMEZONE_1: 'CLOCK_TIMEZONE_1',
  };

  class FakeClay {
    registerComponent() {}
    // the real Clay reads the page's { value } wrapper off each setting and turns the result into
    // the dict a Save sends, so the fake unwraps the same way and a restore shows up as those
    // values reaching the watch
    getSettings(json: string) {
      const settings = JSON.parse(json);
      const dict: Record<string, unknown> = {};
      Object.keys(settings).forEach((key) => {
        const setting = settings[key];
        dict[key] = setting && typeof setting === 'object' ? setting.value : setting;
      });
      return dict;
    }
    generateUrl() {
      return '';
    }
  }

  // the keys the face under test declares. a spec for a face without SETTINGS_FRESH swaps them
  let keys: Record<string, string> = restoreKeys;

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

  /** The watch's reply to SETTINGS_REQUEST, marked by the request key, carrying its settings and whether it booted empty. */
  function watchReplies(fresh: boolean, dateFormat: string) {
    const payload = { SETTINGS_REQUEST: 1, SETTINGS_FRESH: fresh ? 1 : 0, CLOCK_DATE_FORMAT: dateFormat, APPEARANCE_THEME: 2 };
    pebble.fire('appmessage', { payload });
  }

  /** The request the phone sent on ready, by its value. */
  function requestSent() {
    const requests = pebble.sendAppMessage.mock.calls.filter(([dict]) => 'SETTINGS_REQUEST' in dict);
    return requests.map(([dict]) => dict.SETTINGS_REQUEST);
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
    // a fixed Wednesday noon in New York, so the market gates and the calendar window give the
    // same answer whenever and wherever the suite runs
    vi.setSystemTime(Date.UTC(2026, 6, 1, 16, 0));
    localStorage.clear();
    installFakeXhr();
    keys = restoreKeys;
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
   * A phone that already has settings only needs to know whether the watch booted empty. Asking for
   * the whole snapshot sent the watch's full table over Bluetooth on every phone start, only for the
   * phone to throw it away.
   */
  test('asks only for the fresh flag when the phone already has settings', () => {
    localStorage.setItem('clay-settings', JSON.stringify({ CLOCK_DATE_FORMAT: '%d.%m.%Y' }));
    app.startPebbleApp({ clayConfig: [] });

    pebble.fire('ready');

    expect(requestSent()).toEqual([WIRE_CAPS.SETTINGS_REQUEST_FRESH]);
  });

  /** A phone with nothing saved seeds from the watch, so it still asks for the whole snapshot. */
  test('asks for the whole snapshot when the phone has nothing saved', () => {
    app.startPebbleApp({ clayConfig: [] });

    pebble.fire('ready');

    expect(requestSent()).toEqual([WIRE_CAPS.SETTINGS_REQUEST_FULL]);
  });

  /**
   * The short reply carries only the marker and the fresh flag, and a fresh watch still has to be
   * restored from it. Spotting the reply by which settings it held would miss this one entirely.
   */
  test('restores a fresh watch from the short reply', () => {
    localStorage.setItem('clay-settings', JSON.stringify({ CLOCK_DATE_FORMAT: '%d.%m.%Y' }));
    app.startPebbleApp({ clayConfig: [] });
    pebble.fire('ready');

    pebble.fire('appmessage', { payload: { SETTINGS_REQUEST: WIRE_CAPS.SETTINGS_REQUEST_FRESH, SETTINGS_FRESH: 1 } });

    expect(restoreSends()).toHaveLength(1);
  });

  /**
   * The watch only ends fresh on a message marked as the settings page's. An unmarked restore would
   * sit in memory, never reach flash, and the watch would ask to be restored again on every launch.
   * A restore carries 1, so the watch does not convert a reading already in the unit it brings.
   */
  test('marks the restore as the settings page message', () => {
    localStorage.setItem('clay-settings', JSON.stringify({ CLOCK_DATE_FORMAT: '%d.%m.%Y' }));
    app.startPebbleApp({ clayConfig: [] });
    pebble.fire('ready');

    watchReplies(true, '%Y-%m-%d');

    expect(restoreSends()[0]).toMatchObject({ SETTINGS_FRESH: 1 });
  });

  /**
   * A save from the settings page is the other message that ends fresh. Unmarked, a watch that lost
   * its restore would keep the save only until the next relaunch. It carries 0, since a first save
   * on a fresh watch read as a restore and a unit switch there left 21 degrees C showing as 21F.
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
    app.startPebbleApp({ clayConfig: [{ type: 'select', messageKey: 'CLOCK_DATE_FORMAT' }] });
    pebble.fire('ready');

    watchReplies(false, '%Y-%m-%d');

    expect(stored('CLOCK_DATE_FORMAT')).toBe('%Y-%m-%d');
    expect(restoreSends()).toHaveLength(0);
  });

  /**
   * The features fetch on ready with the defaults, before the seed lands. Nothing refetched after
   * it, so a watch on Fahrenheit got a Celsius reading and showed 22F for a 72F day until the next
   * poll. Each feature sees the seed the way it sees a save, so one whose settings moved refetches.
   */
  test('lets each feature compare its settings around the seed', () => {
    const calls: string[] = [];
    const feature = () => ({
      configOpened: () => calls.push('opened:' + JSON.stringify(localStorage.getItem('clay-settings'))),
      configSaved: () => calls.push('saved:' + stored('CLOCK_DATE_FORMAT')),
    });
    app.startPebbleApp({ clayConfig: [{ type: 'select', messageKey: 'CLOCK_DATE_FORMAT' }], features: [feature] });
    pebble.fire('ready');

    watchReplies(false, '%Y-%m-%d');

    expect(calls).toEqual(['opened:null', 'saved:%Y-%m-%d']);
  });

  /**
   * A face without SETTINGS_FRESH seeds on every launch. Its first seed, into an empty phone, gets
   * the same refetch as the fresh path, and a later one leaves the features alone, since a refetch
   * forced on every launch would spend a stock provider's quota.
   */
  test('lets features compare around only the first seed on a face without SETTINGS_FRESH', () => {
    const { SETTINGS_FRESH: dropped, ...withoutFresh } = restoreKeys;
    keys = withoutFresh;
    const calls: string[] = [];
    const feature = () => ({
      configOpened: () => calls.push('opened'),
      configSaved: () => calls.push('saved'),
    });
    app.startPebbleApp({ clayConfig: [{ type: 'select', messageKey: 'CLOCK_DATE_FORMAT' }], features: [feature] });
    pebble.fire('ready');

    pebble.fire('appmessage', { payload: { SETTINGS_REQUEST: 1, CLOCK_DATE_FORMAT: '%Y-%m-%d' } });
    pebble.fire('appmessage', { payload: { SETTINGS_REQUEST: 1, CLOCK_DATE_FORMAT: '%Y-%m-%d' } });

    expect(dropped).toBe('SETTINGS_FRESH');
    expect(calls).toEqual(['opened', 'saved']);
  });

  /**
   * A seed landing while the page is open replaced the snapshot the page opened on and then cleared
   * it, so closing the page counted every setting as changed and stocks spent its quota on a forced
   * fetch. The page's own close is left to compare its settings.
   */
  test('leaves the hooks to a settings page that is open', () => {
    const calls: string[] = [];
    const feature = () => ({
      configOpened: () => calls.push('opened'),
      configSaved: () => calls.push('saved'),
    });
    app.startPebbleApp({ clayConfig: [{ type: 'select', messageKey: 'CLOCK_DATE_FORMAT' }], features: [feature] });
    pebble.fire('ready');
    pebble.fire('showConfiguration');

    watchReplies(false, '%Y-%m-%d');

    expect(calls).toEqual(['opened']);
    expect(stored('CLOCK_DATE_FORMAT')).toBe('%Y-%m-%d');
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
  /**
   * One feature that throws in its ready hook stopped every feature after it and the refresh timer,
   * so stocks and the calendar never loaded and nothing refreshed for the rest of the session.
   */
  test('runs the other features when one throws', () => {
    const later = vi.fn();
    const broken: Feature = () => ({ ready() { throw new Error('no geolocation'); } });
    const fine: Feature = () => ({ ready: later, refresh: later });
    app.startPebbleApp({ clayConfig: [], features: [broken, fine] });

    pebble.fire('ready');
    vi.advanceTimersByTime(5 * 60 * 1000);

    expect(later).toHaveBeenCalledTimes(2);
  });

  /**
   * A save already carries the zone the wearer picked, but the push on the next background tick did
   * not know that and sent the same zone again, one wasted wake of the watch per save.
   */
  test('does not push a zone again that a settings save already sent', () => {
    const zonePage = [{ type: 'locationsearch', messageKey: 'CLOCK_TIMEZONE_1', timeZone: true }];
    const london = JSON.stringify({ label: 'London', offset: 0, tz: 'Europe/London' });
    app.startPebbleApp({ clayConfig: zonePage });
    pebble.fire('ready');
    localStorage.setItem('clay-settings', JSON.stringify({ CLOCK_TIMEZONE_1: london }));
    pebble.fire('webviewclosed', { response: JSON.stringify({ CLOCK_TIMEZONE_1: { value: london } }) });
    const afterSave = pebble.sendAppMessage.mock.calls.filter(([dict]) => 'CLOCK_TIMEZONE_1' in dict).length;

    vi.advanceTimersByTime(5 * 60 * 1000);

    const result = pebble.sendAppMessage.mock.calls.filter(([dict]) => 'CLOCK_TIMEZONE_1' in dict).length;
    expect(afterSave).toBe(1);
    expect(result).toBe(1);
  });

});

describe('collectDefaults', () => {
  /** The defaults seed the store before the config page opens, so a dropped pair opens a setting on nothing. */
  test('collects every messageKey with a default, recursing into nested items', () => {
    const items = [
      { type: 'select', messageKey: 'WEATHER_PROVIDER', defaultValue: 'openmeteo' },
      { type: 'section', items: [{ type: 'slider', messageKey: 'STOCK_POLL', defaultValue: 5 }] },
    ];

    const result = collectDefaults(items);

    expect(result).toEqual({ WEATHER_PROVIDER: 'openmeteo', STOCK_POLL: 5 });
  });

  /** A heading (no messageKey) or a keyed item with no default must be skipped, not seeded as junk. */
  test('skips items with no messageKey or no default', () => {
    const items = [
      { type: 'heading', defaultValue: 'Some Heading' },
      { type: 'input', messageKey: 'STOCK_API_KEY' },
    ];

    const result = collectDefaults(items);

    expect(result).toEqual({});
  });
});
