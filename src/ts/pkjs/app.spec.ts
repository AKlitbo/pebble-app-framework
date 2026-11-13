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
import app, { collectDefaults, createClay, faceStart, foldFeatures, hasVisibleWhen, payloadByKeyId, retimeSettings, seedConfigFromWatch, SETTINGS_REFETCH_DELAY_MS, usesComponent, wrapStoredConfig } from './app';
import { faceProvidersFor } from '../face-providers/narrow';
import { allItems, dropRows } from '../clay/rows';
import locationComponent from '../clay/location-component';
import themePreviewComponent from '../clay/theme-preview-component';
import hiddenStoreComponent from '../clay/hidden-store-component';
import pageStyleComponent from '../clay/page-style-component';
import dependentVisibility from '../clay/dependent-visibility';
import noteComponent from '../plugin-sources/note-component';
import { ASK_GAP_MS } from './asks';
import buildConfig from './config-builder';
import { select } from './config-rows';
import kindsComponent from '../plugin-sources/kinds-component';
import { pluginSourcePage } from '../plugin-sources/page';
import { WEATHER_STANDARD } from '../plugin-sources/standard';
import { SETTINGS_ASK_RETRIES, SETTINGS_ASK_RETRY_MS } from './settings-ask';
import { SEND_RETRIES, SEND_RETRY_MS } from './send-queue';
import { WIRE_CAPS } from './wire';
import stocks from '../stock/feature';
import { keyPrint } from '../stock/ledger';
import calendar from '../calendar/feature';
import weather, { GPS_WATCHDOG_MS } from '../weather/feature';
import type { Feature, FeatureHooks } from './feature';
import type { ClayConfigItem } from '../clay/types';
import { installFakeXhr } from '../testing/xhr';
import type { FakeXhr } from '../testing/xhr';
import { stubModuleLoad } from '../testing/module-load';
import { withFakePebble } from '../testing/pebble';
import type { FakePebble } from '../testing/pebble';

// the plugin code a face built with PLUGIN_CALENDAR finds, which a spec turns off to stand for a face
// built without it. the build writes null into the index then, which is what the getter hands back
const pluginCode = vi.hoisted(() => ({ off: false }));

vi.mock('../plugin-sources/index', async (importOriginal) => {
  const real = await importOriginal<typeof import('../plugin-sources/index')>();

  return {
    ...real,
    get calendarPlugins() {
      return pluginCode.off ? null : real.calendarPlugins;
    },
  };
});

// the providers the build writes into the bundle, which a spec sets to stand for a face that lists
// some. a face that lists none keeps tsc's own index, which is null
const providerCode = vi.hoisted(() => ({ current: null as unknown }));

vi.mock('../face-providers/index', () => ({
  get faceProviders() {
    return providerCode.current;
  },
}));

// stands in for the per-face generated message_keys: each key name maps to
// itself so payloads and stored config use readable string keys
const messageKeys = new Proxy({}, { get: (_target, prop) => prop });

/**
 * The source files one module reaches straight away at runtime, through its relative imports,
 * re-exports, and requires. Type-only imports are left out, since tsc drops them from the emitted JS.
 */
function runtimeImports(file: string): string[] {
  const source = fs.readFileSync(file, 'utf8');
  const specs = [
    ...[...source.matchAll(/^\s*(?:import|export)(?!\s+type\b)[^;]*?\bfrom\s+['"]([^'"]+)['"]/gm)].map((match) => match[1]),
    ...[...source.matchAll(/^\s*import\s+['"]([^'"]+)['"]/gm)].map((match) => match[1]),
    ...[...source.matchAll(/\brequire\(\s*['"]([^'"]+)['"]\s*\)/g)].map((match) => match[1]),
  ];

  return specs.filter((name) => name.startsWith('.')).map((spec) => {
    const base = path.resolve(path.dirname(file), spec);

    return [base, `${base}.ts`, path.join(base, 'index.ts')].find((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile());
  }).filter((target) => target !== undefined);
}

/** Every source file a module reaches at runtime, following its imports out as far as they go. */
function runtimeGraph(entry: string): string[] {
  const seen = new Set<string>();

  const visit = (file: string) => {
    if (seen.has(file)) {
      return;
    }

    seen.add(file);
    runtimeImports(file).forEach(visit);
  };

  visit(entry);
  return [...seen];
}

/** Every source file under ts/ that can reach a face's bundle, leaving out the specs, their helpers, and the builder pieces. */
function shippedSources(): string[] {
  const root = path.join(import.meta.dirname, '..');
  const files = fs.readdirSync(root, { recursive: true, encoding: 'utf8' }).map((file) => file.split(path.sep).join('/'));

  return files
    .filter((file) => file.endsWith('.ts') && !file.endsWith('.spec.ts') && !file.endsWith('.d.ts'))
    .filter((file) => !file.startsWith('testing/') && !file.startsWith('clay/builder/'))
    .map((file) => path.join(root, file));
}

/**
 * Where each part's source starts in the text Clay writes for a custom function, in the order given,
 * or -1 for a part the text does not hold. Rising numbers mean the parts run in that order.
 */
function partPlaces(customFn: unknown, parts: unknown[]): number[] {
  const source = String(customFn);

  return parts.map((part) => source.indexOf(String(part)));
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

  /**
   * The plugin code only reaches a face built with plugin sources, through the features. A runtime
   * import of it from app.ts would put it in every face's bundle, and break the build of a face
   * without the define once the build swaps the folder out.
   */
  test('reaches no plugin source code at runtime', () => {
    const pluginDir = path.join(import.meta.dirname, '..', 'plugin-sources') + path.sep;

    const result = runtimeGraph(path.join(import.meta.dirname, 'app.ts')).filter((file) => file.startsWith(pluginDir));

    expect(result).toEqual([]);
  });

  /**
   * The build writes plugin-sources/index.js again for each face, and leaves every other file in the
   * folder out of a face built without its plugin defines. A value import of types.ts or shapes.ts
   * from a feature would survive as a require for a file that face does not carry, and break it.
   */
  test('reaches plugin source code from outside its folder only through the index', () => {
    const pluginDir = path.join(import.meta.dirname, '..', 'plugin-sources') + path.sep;
    const index = path.join(pluginDir, 'index.ts');
    const outside = shippedSources().filter((file) => !file.startsWith(pluginDir));

    const result = outside.flatMap((file) => runtimeImports(file).filter((target) => target.startsWith(pluginDir) && target !== index).map((target) => `${path.basename(file)} -> ${path.basename(target)}`));

    expect(result).toEqual([]);
  });

  /**
   * A face that lists weather alone carries narrow.ts, so a runtime import of the stock or weather code
   * from it would put that feature's code in a face that never asked for it. The build hands the stock
   * cache over only for a face with a stock list.
   */
  test('reaches no stock or weather code from the face provider passes', () => {
    const narrowFile = path.join(import.meta.dirname, '..', 'face-providers', 'narrow.ts');
    const featureDirs = ['stock', 'weather'].map((dir) => path.join(import.meta.dirname, '..', dir) + path.sep);

    const result = runtimeGraph(narrowFile).filter((file) => featureDirs.some((dir) => file.startsWith(dir))).map((file) => path.basename(file));

    expect(result).toEqual([]);
  });

  /**
   * Every face's bundle holds app.ts, so a runtime import of narrow.ts from it would put the
   * narrowing in a face that lists no providers, and break that face once the build takes the file out.
   */
  test('reaches face provider code from app.ts only through the index', () => {
    const providersDir = path.join(import.meta.dirname, '..', 'face-providers') + path.sep;

    const result = runtimeGraph(path.join(import.meta.dirname, 'app.ts')).filter((file) => file.startsWith(providersDir)).map((file) => path.basename(file));

    expect(result).toEqual(['index.ts']);
  });

  /**
   * The build writes face-providers/index.js again for a face that lists providers, and leaves
   * narrow.js out of a face that lists none. A value import of narrow.ts from anywhere else would
   * survive as a require for a file that face does not carry, and break it.
   */
  test('reaches face provider code from outside its folder only through the index', () => {
    const providersDir = path.join(import.meta.dirname, '..', 'face-providers') + path.sep;
    const index = path.join(providersDir, 'index.ts');
    const outside = shippedSources().filter((file) => !file.startsWith(providersDir));

    const result = outside.flatMap((file) => runtimeImports(file).filter((target) => target.startsWith(providersDir) && target !== index).map((target) => `${path.basename(file)} -> ${path.basename(target)}`));

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
   * Writing the watch's offset string over a saved place loses its zone, so the second clock stops
   * following summer time and the page asks for the city again.
   */
  test('keeps a place the phone already saved for a timezone field', () => {
    const saved = JSON.stringify({ label: 'London', offset: 0, tz: 'Europe/London' });

    localStorage.setItem('clay-settings', JSON.stringify({ CLOCK_TIMEZONE_1: saved }));

    seedConfigFromWatch({ CLOCK_TIMEZONE_1: 'CLOCK_TIMEZONE_1' }, { CLOCK_TIMEZONE_1: '60,London' }, zonePage);

    const result = stored('CLOCK_TIMEZONE_1');

    expect(result).toBe(saved);
  });

  /**
   * The seed skips a key the page has no row for, so a feature restoring a choice its page hook
   * adds has to set it itself. A change made after the write would be lost, and the choice would
   * drop back to its default after every reset.
   */
  test('saves what a seeded hook sets from the echo', () => {
    const feature: FeatureHooks = {
      seeded: (config, echoed) => {
        config.CALENDAR_SOURCE = echoed('CALENDAR_SOURCE');
      },
    };

    seedConfigFromWatch(messageKeys, { CALENDAR_SOURCE: 'plugin' }, page, [feature]);

    const result = stored('CALENDAR_SOURCE');

    expect(result).toBe('plugin');
  });

  /**
   * A hook putting back a value that makes no sense on this phone has to see the watch's values
   * already in, or it checks the empty settings and lets the bad value through.
   */
  test('hands a seeded hook the settings with the watch values already in', () => {
    const providerPage = [{ type: 'select', messageKey: 'WEATHER_PROVIDER' }];
    const feature: FeatureHooks = {
      seeded: (config) => {
        if (config.WEATHER_PROVIDER === 'owm' && !config.WEATHER_API_KEY) {
          config.WEATHER_PROVIDER = 'openmeteo';
        }
      },
    };

    seedConfigFromWatch(messageKeys, { WEATHER_PROVIDER: 'owm' }, providerPage, [feature]);

    const result = stored('WEATHER_PROVIDER');

    expect(result).toBe('openmeteo');
  });

  /** A hook that breaks on this phone must not cost the wearer the rest of the restore. */
  test('skips a seeded hook that throws and still saves', () => {
    const broken: FeatureHooks = {
      seeded: () => {
        throw new Error('no plugins here');
      },
    };
    const fine: FeatureHooks = {
      seeded: (config) => {
        config.CALENDAR_SOURCE = 'plugin';
      },
    };

    seedConfigFromWatch(messageKeys, { CLOCK_DATE_FORMAT: '%Y.%m.%d' }, page, [broken, fine]);

    const result = JSON.parse(localStorage.getItem('clay-settings'));

    expect(result).toEqual({ CLOCK_DATE_FORMAT: '%Y.%m.%d', CALENDAR_SOURCE: 'plugin' });
  });
});

describe('usesComponent', () => {
  /** The theme picture component registers only when the page holds one, so a nested hit must count. */
  test('finds a component type nested inside a section', () => {
    const items = [
      { type: 'heading' },
      { type: 'section', items: [{ type: 'heading' }, { type: 'themePreview', messageKey: 'APPEARANCE_THEME' }] },
    ];

    const result = usesComponent(items, 'themePreview');

    expect(result).toBe(true);
  });

  /** A page without the type must report false, or every face would carry the component's code. */
  test('returns false when no item is of the type', () => {
    const items = [{ type: 'section', items: [{ type: 'select', messageKey: 'APPEARANCE_THEME' }] }];

    const result = usesComponent(items, 'themePreview');

    expect(result).toBe(false);
  });
});

describe('hasVisibleWhen', () => {
  /** The framework wires the show/hide only when a page declares it, so a nested rule has to count. */
  test('finds a visibleWhen nested inside a section', () => {
    const items = [
      { type: 'heading' },
      { type: 'section', items: [{ type: 'select', messageKey: 'MODE' }, { type: 'select', messageKey: 'SHUF', visibleWhen: { key: 'MODE', in: [1] } }] },
    ];

    const result = hasVisibleWhen(items);

    expect(result).toBe(true);
  });

  /** A page with none gets no custom function from this, so a plain page is left as it was. */
  test('returns false when no item declares one', () => {
    const items = [{ type: 'section', items: [{ type: 'select', messageKey: 'MODE' }] }];

    const result = hasVisibleWhen(items);

    expect(result).toBe(false);
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

describe('payloadByKeyId', () => {
  /**
   * The Pebble phone app hands a watch message over keyed by name alone. Everything reads it by
   * number, so without the number beside it the settings restore and every watch ask went unseen.
   */
  test('puts the number beside a name the phone app sent alone', () => {
    const result = payloadByKeyId({ SETTINGS_REQUEST: 10004, SETTINGS_FRESH: 10005 }, { SETTINGS_REQUEST: 2, SETTINGS_FRESH: 1 });

    expect(result).toEqual({ SETTINGS_REQUEST: 2, SETTINGS_FRESH: 1, 10004: 2, 10005: 1 });
  });

  /**
   * A message that already carries the number keeps the value it came with there, so what the watch
   * put under the number is what gets read.
   */
  test('leaves a message keyed both ways as it came', () => {
    const payload = { SETTINGS_REQUEST: 2, 10004: 3 };

    const result = payloadByKeyId({ SETTINGS_REQUEST: 10004 }, payload);

    expect(result).toEqual(payload);
  });

  /**
   * PebbleKit JS hands every listener the same message, so writing the numbers into it would change
   * what the rest see.
   */
  test('leaves the message it was handed untouched', () => {
    const payload = { SETTINGS_REQUEST: 2 };

    payloadByKeyId({ SETTINGS_REQUEST: 10004 }, payload);

    expect(payload).toEqual({ SETTINGS_REQUEST: 2 });
  });

  /**
   * An array key is numbered through its base name, the same as a setting, or a slot reads as
   * missing.
   */
  test('numbers a name in the array form from its base key', () => {
    const result = payloadByKeyId({ SLOT: 10020 }, { 'SLOT[1]': 7 });

    expect(result).toEqual({ 'SLOT[1]': 7, 10021: 7 });
  });

  /**
   * A name the face does not declare has no number, and guessing one would land a value under the
   * key `undefined`.
   */
  test('gives a name the face does not declare no number', () => {
    const result = payloadByKeyId({ SETTINGS_REQUEST: 10004 }, { SOMETHING_ELSE: 1 });

    expect(result).toEqual({ SOMETHING_ELSE: 1 });
  });
});

describe('createClay', () => {
  // Clay's own text box and select, as a Clay built from a page drawing one holds it
  const CLAY_INPUT = { name: 'input', manipulator: 'val' };
  const CLAY_SELECT = { name: 'select', manipulator: 'val' };

  // a theme picker with one theme and no pictures
  const PICKER: ClayConfigItem = { type: 'themePreview', messageKey: 'APPEARANCE_THEME', label: 'Theme', defaultValue: 'a', options: [{ label: 'A', value: 'a' }], previews: {} };

  /**
   * A Clay that records what the first one was built with, how many were built, and every component
   * registered on it, keyed by name like the real one. Like the real one, it holds Clay's own text box
   * and select when the page it was built with draws one, in a section or out of one.
   */
  class RecordingClay {
    static built: { config: unknown; customClay: unknown; options: unknown } | null = null;
    static made = 0;
    static failSpare = false;
    registered: unknown[] = [];
    components: Record<string, unknown> = {};

    constructor(config: unknown, customClay: unknown, options: unknown) {
      RecordingClay.built = RecordingClay.built || { config, customClay, options };
      RecordingClay.made += 1;

      if (RecordingClay.failSpare && RecordingClay.made > 1) {
        throw new Error('the spare failed');
      }

      const walk = (items: ClayConfigItem[]) => {
        items.forEach((item) => {
          if (item.type === 'section') {
            walk(item.items || []);
          } else if (item.type === 'input') {
            this.components.input = { ...CLAY_INPUT };
          } else if (item.type === 'select') {
            this.components.select = { ...CLAY_SELECT };
          }
        });
      };

      walk(config as ClayConfigItem[]);
    }

    registerComponent(component: { name: string }) {
      this.registered.push(component);
      this.components[component.name] = component;
    }
  }

  let restoreLoad: () => void;

  beforeEach(() => {
    RecordingClay.built = null;
    RecordingClay.made = 0;
    RecordingClay.failSpare = false;
    restoreLoad = stubModuleLoad((id) => (id === '@rebble/clay/src/js/index' ? RecordingClay : undefined));
  });

  afterEach(() => {
    restoreLoad();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  /**
   * A bridge whose listener is a getter with no setter, handing back a fresh wrapper on each read the
   * way some bindings do. Setting it throws, since the framework's code is strict.
   */
  function refusingBridge(): { addEventListener: unknown } {
    const bridge = {};

    Object.defineProperty(bridge, 'addEventListener', { get: () => function () {}, enumerable: true });
    return bridge as { addEventListener: unknown };
  }

  /** The settings page is built at launch, so a bridge that refuses the swap must not stop it there. */
  test('builds the page on a bridge that refuses the listener swap', () => {
    vi.stubGlobal('Pebble', refusingBridge());
    const clayConfig = [{ type: 'section', items: [{ type: 'locationsearch', messageKey: 'LOCATION_NAME' }] }];

    const result = createClay({ clayConfig }) as unknown as RecordingClay;

    expect(result.registered).toEqual([pageStyleComponent, CLAY_INPUT, locationComponent]);
  });

  /** A spare that throws mid build must not leave the bridge's listener swapped, or every later event the face listens for is lost. */
  test('puts the bridge\'s listener back when the spare Clay throws', () => {
    const listen = vi.fn();

    vi.stubGlobal('Pebble', { addEventListener: listen });
    RecordingClay.failSpare = true;

    const result = () => createClay({ clayConfig: [{ type: 'locationsearch', messageKey: 'LOCATION_NAME' }] });

    expect(result).toThrow('the spare failed');
    expect(Pebble.addEventListener).toBe(listen);
  });

  /** On a bridge that refused the swap, a spare that throws has to surface its own error rather than one from putting the listener back. */
  test('surfaces the spare Clay\'s own error on a bridge that refuses the listener swap', () => {
    vi.stubGlobal('Pebble', refusingBridge());
    RecordingClay.failSpare = true;

    const result = () => createClay({ clayConfig: [{ type: 'locationsearch', messageKey: 'LOCATION_NAME' }] });

    expect(result).toThrow('the spare failed');
  });

  /**
   * The phone and the dev plugin's preview both build their page here, so this is what decides the
   * preview registers what the phone does. A component missing from the phone's list makes Clay stop
   * with "is not registered" and the settings page never opens.
   */
  test('registers the rules for the whole page, the location component, and then the components the face passes, in order', () => {
    const layout = { name: 'layoutBuilder' };
    const store = { name: 'hiddenStore' };

    const result = createClay({ clayConfig: [], components: [layout, store] }) as unknown as RecordingClay;

    expect(result.registered).toEqual([pageStyleComponent, locationComponent, layout, store]);
  });

  /** A hidden store row with no component stops Clay building the page there, so every row below it never shows. */
  test('registers the hidden store for a page that holds one when the face leaves it out', () => {
    const clayConfig = [{ type: 'section', items: [{ type: 'hiddenStore', messageKey: 'GRID_LIBRARY' }] }];

    const result = createClay({ clayConfig }) as unknown as RecordingClay;

    expect(result.registered).toEqual([pageStyleComponent, locationComponent, hiddenStoreComponent]);
  });

  /** A face's own component under the name has to win, or its page would draw the framework's store instead. */
  test('leaves a face\'s own hiddenStore component in place of the framework\'s', () => {
    const ownStore = { name: 'hiddenStore', template: '<input type="hidden">' };

    const result = createClay({ clayConfig: [{ type: 'hiddenStore', messageKey: 'GRID_LIBRARY' }], components: [ownStore] }) as unknown as RecordingClay;

    expect(result.registered).toEqual([pageStyleComponent, locationComponent, ownStore]);
  });

  /**
   * The location search takes its look from Clay's text box, and Clay adds that style only to a page
   * that registers the text box. Without it the search is a plain white field beside its label.
   */
  test('registers Clay\'s text box ahead of the location component on a page with a location search and no text box', () => {
    const clayConfig = [{ type: 'section', items: [{ type: 'locationsearch', messageKey: 'LOCATION_NAME' }] }];

    const result = createClay({ clayConfig }) as unknown as RecordingClay;

    expect(result.registered).toEqual([pageStyleComponent, CLAY_INPUT, locationComponent]);
    expect(RecordingClay.made).toBe(2);
  });

  /**
   * Clay registers its own text box for a text row inside a section as well as one outside, and that
   * one already brings the style. A spare Clay built anyway would cost every settings page open a
   * second Clay for a component the page has.
   */
  test('builds no spare Clay for a page whose section draws one of Clay\'s own text boxes', () => {
    const clayConfig = [{ type: 'section', items: [{ type: 'input', messageKey: 'WEATHER_API_KEY' }, { type: 'locationsearch', messageKey: 'LOCATION_NAME' }] }];

    const result = createClay({ clayConfig }) as unknown as RecordingClay;

    expect(result.registered).toEqual([pageStyleComponent, locationComponent]);
    expect(RecordingClay.made).toBe(1);
  });

  /**
   * A face that passes its own text box draws the search with it. Clay's would be built for nothing,
   * and registered ahead of the face's it would move the face's ahead of the location search.
   */
  test('leaves a face\'s own text box in the place the face registers it', () => {
    const ownInput = { name: 'input', template: '<div class="component component-input"></div>', manipulator: 'val' };
    const clayConfig = [{ type: 'section', items: [{ type: 'locationsearch', messageKey: 'LOCATION_NAME' }] }];

    const result = createClay({ clayConfig, components: [ownInput] }) as unknown as RecordingClay;

    expect(result.registered).toEqual([pageStyleComponent, locationComponent, ownInput]);
    expect(RecordingClay.made).toBe(1);
  });

  /**
   * The theme picker takes its look from Clay's select, and Clay adds that style only to a page that
   * registers the select. Without it the picker shows the bare native dropdown over its own name.
   */
  test('registers Clay\'s select ahead of the theme picker on a page with a theme picker and no select', () => {
    const result = createClay({ clayConfig: [{ type: 'section', items: [PICKER] }] }) as unknown as RecordingClay;

    expect(result.registered).toEqual([pageStyleComponent, CLAY_SELECT, locationComponent, themePreviewComponent]);
    expect(RecordingClay.made).toBe(2);
  });

  /** A page holding both rows takes both looks from one spare Clay rather than one each. */
  test('takes the text box and the select from one spare Clay', () => {
    const clayConfig = [{ type: 'section', items: [{ type: 'locationsearch', messageKey: 'LOCATION_NAME' }, PICKER] }];

    const result = createClay({ clayConfig }) as unknown as RecordingClay;

    expect(result.registered).toEqual([pageStyleComponent, CLAY_INPUT, CLAY_SELECT, locationComponent, themePreviewComponent]);
    expect(RecordingClay.made).toBe(2);
  });

  /** A face that passes its own select draws the picker with it, and Clay's registered first would move the face's ahead of the picker. */
  test('leaves a face\'s own select in the place the face registers it', () => {
    const ownSelect = { name: 'select', template: '<div class="component component-select"></div>', manipulator: 'val' };

    const result = createClay({ clayConfig: [{ type: 'section', items: [PICKER] }], components: [ownSelect] }) as unknown as RecordingClay;

    expect(result.registered).toEqual([pageStyleComponent, locationComponent, themePreviewComponent, ownSelect]);
    expect(RecordingClay.made).toBe(1);
  });

  /** A page with no store must not carry the component's code. */
  test('leaves the hidden store off a page that holds none', () => {
    const result = createClay({ clayConfig: [{ type: 'heading', defaultValue: 'Page' }] }) as unknown as RecordingClay;

    expect(result.registered).toEqual([pageStyleComponent, locationComponent]);
  });

  /**
   * The page Clay is built with opens on its own when no feature has a page hook, so its intro is
   * settled there too. The face's own page keeps the mark, since every later open settles it again.
   */
  test('builds Clay from the page with the builder\'s intro settled and its mark gone', () => {
    const clayConfig: ClayConfigItem[] = [{ type: 'text', defaultValue: 'Personalize your layout, dial in your weather preferences, and make this watchface your own.', introWithoutWeather: 'Personalize your layout and make this watchface your own.' }];

    createClay({ clayConfig });

    expect(RecordingClay.built?.config).toEqual([{ type: 'text', defaultValue: 'Personalize your layout and make this watchface your own.' }]);
    expect(clayConfig[0].introWithoutWeather).toBe('Personalize your layout and make this watchface your own.');
  });

  /** A face's page code and its rows have to reach Clay, and Clay's own send path has to stay off. */
  test('builds Clay from the page and customClay the face passes, with its own event handling off', () => {
    const clayConfig = [{ type: 'heading', defaultValue: 'Page' }];
    const customClay = function () {};

    createClay({ clayConfig, customClay });

    expect(RecordingClay.built).toEqual({ config: clayConfig, customClay, options: { autoHandleEvents: false } });
  });

  /**
   * Clay refuses a custom function that is not a function only when it is handed one alone. Checked
   * at startup, the face gets Clay's own error whatever its page holds, rather than one only on pages
   * with no visibleWhen row.
   */
  test.each([
    { name: 'with no visibleWhen rows', clayConfig: [{ type: 'heading', defaultValue: 'Page' }] },
    { name: 'with visibleWhen rows', clayConfig: [{ type: 'toggle', messageKey: 'SHOWN', visibleWhen: { key: 'MODE', in: ['on'] } }] },
  ])('stops with the error Clay gives for a customClay that is not a function, $name', ({ clayConfig }) => {
    const result = () => createClay({ clayConfig, customClay: 'reset' });

    expect(result).toThrow('customFn must be a function or "null"');
  });

  /** Clay hands the custom function the page as this, which an arrow cannot take, so its code never reaches the page. */
  test('warns about a customClay written as an arrow', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    createClay({ clayConfig: [], customClay: () => {} });

    expect(warn).toHaveBeenCalledWith(expect.stringContaining('not an arrow'));
  });

  /** A warning on a plain function would send a face hunting for a mistake it never made. */
  test.each([
    { name: 'a plain function', customClay: function () {} },
    { name: 'a named function', customClay: function faceCode() {} },
    { name: 'an async function', customClay: async function () {} },
  ])('says nothing about $name', ({ customClay }) => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    createClay({ clayConfig: [], customClay });

    expect(warn).not.toHaveBeenCalled();
  });

  /** A page with no page code has to get none, so Clay writes its own do-nothing function and the page text stays as it is. */
  test('gives Clay no custom function for a page with no visibleWhen and no customClay', () => {
    createClay({ clayConfig: [{ type: 'heading', defaultValue: 'Page' }] });

    const result = RecordingClay.built?.customClay;

    expect(result).toBeUndefined();
  });

  /** A face that leaves customClay out has to get the show and hide itself, not a wrapper, so its page text stays as it is. */
  test('gives Clay the show and hide itself for a page with visibleWhen rows and no customClay', () => {
    createClay({ clayConfig: [{ type: 'toggle', messageKey: 'SHOWN', visibleWhen: { key: 'MODE', in: ['on'] } }] });

    const result = RecordingClay.built?.customClay;

    expect(result).toBe(dependentVisibility);
  });

  /**
   * A face's customClay standing in for the show and hide leaves its visibleWhen rows always showing.
   * Both have to run, the framework's first so the face's code can still change a row after it.
   */
  test('runs the show and hide and then the face\'s customClay for a page with visibleWhen rows', () => {
    const customClay = function () {
      document.title = 'face page code';
    };

    createClay({ clayConfig: [{ type: 'toggle', messageKey: 'SHOWN', visibleWhen: { key: 'MODE', in: ['on'] } }], customClay });

    const result = partPlaces(RecordingClay.built?.customClay, [dependentVisibility, customClay]);

    expect(result[0]).toBeGreaterThanOrEqual(0);
    expect(result[1]).toBeGreaterThan(result[0]);
  });
});

describe('startPebbleApp weather', () => {
  // only the keys the weather path reads. no stock or calendar key, so those fetches stay off
  const weatherKeys = {
    SETTINGS_REQUEST: 'SETTINGS_REQUEST',
    SETTINGS_FRESH: 'SETTINGS_FRESH',
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
  let keys: Record<string, string | number> = weatherKeys;

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

  /**
   * The label prefers a result's own words, and no provider sets them. A face showing the label has
   * to get the very message it got before, with the token's words in it.
   */
  test('sends the token words as the label for a provider reading', () => {
    keys = { ...weatherKeys, WEATHER_CONDITION_LABEL: 'WEATHER_CONDITION_LABEL' };
    start([weather]);
    fire('ready');

    sent[0].respond(200, JSON.stringify({ current: { temperature_2m: 21, weather_code: 3, is_day: 1 } }));

    const sends = weatherSends();

    expect(sends[0][0]).toEqual({ WEATHER_TEMPERATURE: 21, WEATHER_CONDITIONS: 'CLDY', WEATHER_OK: 1, WEATHER_CONDITION_LABEL: 'Cloudy' });
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
   * and the rebooted watch would sit on placeholders. An ask this soon after the fetch resends the
   * reading rather than fetching it again.
   */
  test('sends the same reading again when the watch asks for it', () => {
    start([weather]);
    fire('ready');
    sent[0].respond(200, currentBody(21));

    askForWeather();

    expect(weatherSends()).toHaveLength(2);
    expect(sent).toHaveLength(1);
  });

  /**
   * The Pebble phone app keys the watch's ask by name alone, while the feature reads it by number.
   * Unseen, the ask started no fetch, and a watch that rebooted sat on placeholders until the next
   * background refresh.
   */
  test('fetches for a watch ask the phone app keyed by name', () => {
    keys = { SETTINGS_REQUEST: 10004, SETTINGS_FRESH: 10005, WEATHER_REQUEST: 10003, WEATHER_TEMPERATURE: 10001, WEATHER_CONDITIONS: 10002, WEATHER_OK: 10000 };
    start([weather]);
    fire('ready');
    sent[0].respond(200, currentBody(21));

    // past the gap after a fetch, so the ask fetches rather than resends
    const now = vi.spyOn(Date, 'now').mockReturnValue(Date.now() + ASK_GAP_MS);

    askForWeather();
    now.mockRestore();

    expect(sent).toHaveLength(2);
  });

  /** The phone JS restarting is the other time the watch may hold nothing, so ready forgets the last dict too. */
  test('sends the same reading again after a fresh ready', () => {
    start([weather]);
    fire('ready');
    sent[0].respond(200, currentBody(21));

    fire('ready');

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
    SETTINGS_FRESH: 'SETTINGS_FRESH',
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
    pluginCode.off = false;
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

  /**
   * The cache records whose quotes it holds. A strip saved with no provider would read as belonging
   * to whatever provider loads it next, so a provider changed at launch would keep the old quotes.
   */
  test('saves the provider it fetched with beside the strip', () => {
    start({ STOCK_PROVIDER: 'Yahoo', STOCK_SYMBOLS: 'AAPL' }, null, [stocks]);
    pebble.fire('ready');

    sent.forEach((request) => request.respond(200, JSON.stringify({ chart: { result: [{ meta: { symbol: 'AAPL', regularMarketPrice: 261.74, chartPreviousClose: 260.5, regularMarketTime: 1719849600 } }], error: null } })));

    const result = JSON.parse(localStorage.getItem('stock-cache') as string).provider;

    expect(result).toBe('yahoo');
  });

  /**
   * A provider change on the page forgets the old strip. Saving that empty cache under the old
   * provider would let the next launch read the new provider's first quotes as the old one's.
   */
  test('saves the new provider when a provider change forgets the strip', () => {
    start({ STOCK_PROVIDER: 'yahoo', STOCK_SYMBOLS: 'AAPL' }, SAVED_STRIP, [stocks]);
    pebble.fire('ready');
    pebble.fire('showConfiguration');
    localStorage.setItem('clay-settings', JSON.stringify({ STOCK_PROVIDER: 'finnhub', STOCK_API_KEY: 'k', STOCK_SYMBOLS: 'AAPL' }));

    pebble.fire('webviewclosed', { response: '{}' });

    const result = JSON.parse(localStorage.getItem('stock-cache') as string);

    expect(result).toEqual({ lastAsOf: '', lastFetchMs: 0, strip: null, provider: 'finnhub', retryAtMs: 0, backoffMs: 0, quotes: [] });
  });

  /**
   * A provider that changed while nothing ran found the old provider's strip and pushed it to the
   * watch while its own gate was shut, as Alpha Vantage's is on a weekday morning.
   */
  test('pushes no strip saved under another provider while the gate is shut', () => {
    vi.setSystemTime(Date.UTC(2026, 6, 1, 15, 0));
    localStorage.setItem('clay-settings', JSON.stringify({ STOCK_PROVIDER: 'alphavantage', STOCK_API_KEY: 'k', STOCK_SYMBOLS: 'AAPL' }));
    localStorage.setItem('stock-cache', JSON.stringify({ lastAsOf: '2026-07-01', lastFetchMs: Date.now() - 60000, strip: SAVED_STRIP, provider: 'finnhub' }));
    app.startPebbleApp({ clayConfig: [], features: [stocks] });

    pebble.fire('ready');

    const result = sendsOf('STOCK_STRIP');

    expect(result).not.toContainEqual(SAVED_STRIP);
  });

  /**
   * A settings restore from the watch can move the provider after the cache was loaded, with no save
   * from the page to say so. The next round kept the old provider's stamps and pushed its strip.
   */
  test('drops a cache saved under another provider at the next round after a seed moves the provider', () => {
    vi.setSystemTime(Date.UTC(2026, 6, 1, 15, 0));
    localStorage.setItem('clay-settings', JSON.stringify({ STOCK_PROVIDER: 'yahoo', STOCK_SYMBOLS: 'AAPL' }));
    localStorage.setItem('stock-cache', JSON.stringify({ lastAsOf: '2026-07-01', lastFetchMs: Date.now() - 60000, strip: SAVED_STRIP, provider: 'yahoo' }));
    app.startPebbleApp({ clayConfig: [], features: [stocks] });
    pebble.fire('ready');
    localStorage.setItem('clay-settings', JSON.stringify({ STOCK_PROVIDER: 'alphavantage', STOCK_API_KEY: 'k', STOCK_SYMBOLS: 'AAPL' }));
    pebble.sendAppMessage.mockClear();

    pebble.fire('appmessage', { payload: { STOCK_REQUEST: 1 } });

    const result = JSON.parse(localStorage.getItem('stock-cache') as string);

    expect(result).toEqual({ lastAsOf: '', lastFetchMs: 0, strip: null, provider: 'alphavantage', retryAtMs: 0, backoffMs: 0, quotes: [] });
    expect(sendsOf('STOCK_STRIP')).not.toContainEqual(SAVED_STRIP);
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
   * The refresh is left to the watch's asks, with a download on a slow tick only once the watch has
   * gone quiet. A refresh tied only to the phone's own 5 minute tick would download the whole feed
   * however slowly the wearer set the watch to refresh.
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
  test('sends an empty agenda when no feed is set on a face built without PLUGIN_CALENDAR', () => {
    pluginCode.off = true;
    start({});

    pebble.fire('ready');

    expect(sendsOf('CALENDAR_STRIP')).toEqual([[0]]);
  });

  /** With the define, a wearer who saved an empty link still has to see the agenda clear, as on any other face. */
  test('sends an empty agenda when the saved feed is empty on a face built with PLUGIN_CALENDAR', () => {
    pebble.plugins = [{ uuid: 'calendar-uuid', name: 'Calendar', sources: [{ category: 'calendar', items: ['event'] }] }];
    start({ CALENDAR_SOURCE: 'ical', CALENDAR_ICS_URL: '' });

    pebble.fire('ready');

    expect(sendsOf('CALENDAR_STRIP')).toEqual([[0]]);
  });

  /**
   * With the define and a calendar plugin on the phone, a source never saved reads as the plugin. An
   * empty agenda from an iCal round with no link would clear what the plugin fills.
   */
  test('subscribes and sends no empty agenda with nothing saved on a face built with PLUGIN_CALENDAR while a plugin serves the events', () => {
    pebble.plugins = [{ uuid: 'calendar-uuid', name: 'Calendar', sources: [{ category: 'calendar', items: ['event'] }] }];
    start({});

    pebble.fire('ready');

    expect(sendsOf('CALENDAR_STRIP')).toEqual([]);
    expect(pebble.live()).toHaveLength(1);
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

  /** A Yahoo answer for the ticker in a request's URL, at a price. */
  function yahooReply(url: string, price: number): string {
    const symbol = decodeURIComponent(url.split('/chart/')[1].split('?')[0]);

    return JSON.stringify({ chart: { result: [{ meta: { symbol, regularMarketPrice: price, chartPreviousClose: price } }], error: null } });
  }

  /** A round with one ticker refused for a rate limit put RATE LIMIT in the kept strip, which every held ask then pushed again. */
  test('keeps the last good price in a slot refused for a rate limit', () => {
    start({ STOCK_PROVIDER: 'yahoo', STOCK_SYMBOLS: 'AAPL,MSFT' }, null, [stocks]);
    pebble.fire('ready');
    sent.forEach((request) => request.respond(200, yahooReply(request.url, 100)));
    const before = JSON.parse(localStorage.getItem('stock-cache') as string).strip;
    const firstRound = sent.length;

    vi.advanceTimersByTime(60 * 1000);
    pebble.fire('appmessage', { payload: { STOCK_REQUEST: 1 } });
    sent.slice(firstRound).forEach((request) => (request.url.includes('AAPL') ? request.respond(429, '') : request.respond(200, yahooReply(request.url, 100))));

    const result = JSON.parse(localStorage.getItem('stock-cache') as string).strip;

    expect(result).toEqual(before);
  });

  /** A routine round and two saves inside one clock minute sent 12 Twelve Data calls against the free key's 8. */
  test('holds a Twelve Data save that would pass 8 calls in a minute until the next minute', () => {
    const reply = (url: string) => JSON.stringify({ symbol: new URL(url).searchParams.get('symbol'), close: '150', change: '1', percent_change: '0.5', datetime: '2026-07-01' });
    const save = (symbols: string) => {
      pebble.fire('showConfiguration');
      localStorage.setItem('clay-settings', JSON.stringify({ STOCK_PROVIDER: 'twelvedata', STOCK_API_KEY: 'k', STOCK_SYMBOLS: symbols }));
      pebble.fire('webviewclosed', { response: '{}' });
      vi.advanceTimersByTime(1000);
      sent.forEach((request) => request.respond(200, reply(request.url)));
    };

    start({ STOCK_PROVIDER: 'twelvedata', STOCK_API_KEY: 'k', STOCK_SYMBOLS: 'A,B,C,D' }, null, [stocks]);
    pebble.fire('ready');
    sent.forEach((request) => request.respond(200, reply(request.url)));
    const counts = [sent.length];

    save('A,B,C,E');
    counts.push(sent.length);
    save('A,B,C,F');
    counts.push(sent.length);
    vi.advanceTimersByTime(60 * 1000);
    counts.push(sent.length);

    const result = counts;

    expect(result).toEqual([4, 8, 8, 12]);
  });

  /** A wearer paying for Twelve Data was held to the free key's 8 calls a minute, so a save went out a minute late. */
  test('lets a Twelve Data save past 8 calls a minute on a paid plan', () => {
    const reply = (url: string) => JSON.stringify({ symbol: new URL(url).searchParams.get('symbol'), close: '150', change: '1', percent_change: '0.5', datetime: '2026-07-01' });
    const settings = { STOCK_PROVIDER: 'twelvedata', STOCK_API_KEY: 'k', STOCK_PAID_PLAN: true };

    start({ ...settings, STOCK_SYMBOLS: 'A,B,C,D' }, null, [stocks]);
    pebble.fire('ready');
    sent.forEach((request) => request.respond(200, reply(request.url)));
    ['A,B,C,E', 'A,B,C,F'].forEach((symbols) => {
      pebble.fire('showConfiguration');
      localStorage.setItem('clay-settings', JSON.stringify({ ...settings, STOCK_SYMBOLS: symbols }));
      pebble.fire('webviewclosed', { response: '{}' });
      vi.advanceTimersByTime(1000);
      sent.forEach((request) => request.respond(200, reply(request.url)));
    });

    const result = sent.length;

    expect(result).toBe(12);
  });

  /** An Alpha Vantage answer for the ticker in a request's URL, from one trading day. */
  function avReply(url: string, day: string): string {
    const symbol = new URL(url).searchParams.get('symbol');

    return JSON.stringify({ 'Global Quote': { '01. symbol': symbol, '05. price': '100', '09. change': '1', '10. change percent': '1%', '07. latest trading day': day } });
  }

  /** A paid Alpha Vantage key reused the session's first quotes on every poll, so the prices froze until the close. */
  test('fetches every ticker on every Alpha Vantage poll on a paid plan', () => {
    start({ STOCK_PROVIDER: 'alphavantage', STOCK_API_KEY: 'k', STOCK_PAID_PLAN: true, STOCK_SYMBOLS: 'A,B' }, null, [stocks]);
    pebble.fire('ready');
    sent.forEach((request) => request.respond(200, avReply(request.url, '2026-07-01')));
    const first = sent.length;

    vi.advanceTimersByTime(60 * 1000);
    pebble.fire('appmessage', { payload: { STOCK_REQUEST: 1 } });

    const result = [first, sent.length];

    expect(result).toEqual([2, 4]);
  });

  /**
   * The key the held quotes came with started unknown on every launch, so the first save of a session
   * asked Alpha Vantage for every ticker, four calls where adding one ticker needed one.
   */
  test('asks Alpha Vantage only for the added ticker on the first save after a launch', () => {
    const held = ['A', 'B', 'C'].map((symbol) => ({ symbol, price: 1, change: 0, changePercent: 0, asOf: '2026-06-30', ok: true }));

    localStorage.setItem('clay-settings', JSON.stringify({ STOCK_PROVIDER: 'alphavantage', STOCK_API_KEY: 'k', STOCK_SYMBOLS: 'A,B,C' }));
    localStorage.setItem('stock-cache', JSON.stringify({ lastAsOf: '2026-06-30', lastFetchMs: Date.now() - 60000, strip: null, provider: 'alphavantage', quotes: held }));
    app.startPebbleApp({ clayConfig: [], features: [stocks] });
    pebble.fire('ready');

    pebble.fire('showConfiguration');
    localStorage.setItem('clay-settings', JSON.stringify({ STOCK_PROVIDER: 'alphavantage', STOCK_API_KEY: 'k', STOCK_SYMBOLS: 'A,B,C,D' }));
    pebble.fire('webviewclosed', { response: '{}' });
    vi.advanceTimersByTime(1000);

    const result = sent.map((request) => new URL(request.url).searchParams.get('symbol'));

    expect(result).toEqual(['D']);
  });

  /**
   * A burst refusal in the evening, before the close was out, retried every ticker, since yesterday's
   * quotes the round had just fetched were not current. Two retries spent 12 calls for one try.
   */
  test('retries only the ticker Alpha Vantage refused for its burst limit', () => {
    vi.setSystemTime(Date.UTC(2026, 6, 1, 22, 30));
    start({ STOCK_PROVIDER: 'alphavantage', STOCK_API_KEY: 'k', STOCK_SYMBOLS: 'A,B' }, null, [stocks]);
    pebble.fire('ready');
    sent[0].respond(200, avReply(sent[0].url, '2026-06-30'));
    vi.advanceTimersByTime(1100);
    sent[1].respond(200, JSON.stringify({ Information: 'Please consider spreading out your free API requests more sparingly (1 request per second).' }));

    vi.advanceTimersByTime(6000);

    const result = sent.map((request) => new URL(request.url).searchParams.get('symbol'));

    expect(result).toEqual(['A', 'B', 'B']);
  });

  /** Answers every Alpha Vantage request still out, one at a time as the spacing lets each go, all from one trading day. */
  function answerAlphaVantage(day: string) {
    const answered = new Set<unknown>();

    for (let step = 0; step < 40; step++) {
      sent.filter((request) => !answered.has(request)).forEach((request) => {
        answered.add(request);
        request.respond(200, avReply(request.url, day));
      });
      vi.advanceTimersByTime(1100);
    }
  }

  /**
   * Saves in an evening before the close was out each asked for every ticker, since none held today's
   * close, and six of them spent 28 of the free key's 25 calls. Spaced past the reuse window, each still
   * asks for all four, and the ledger stops them at 25, the last save asking for the one that fits.
   */
  test('holds a free Alpha Vantage key to 25 calls a day through many evening saves', () => {
    vi.setSystemTime(Date.UTC(2026, 6, 1, 20, 5));
    start({ STOCK_PROVIDER: 'alphavantage', STOCK_API_KEY: 'k', STOCK_SYMBOLS: 'A,B,C,D' }, null, [stocks]);
    pebble.fire('ready');
    answerAlphaVantage('2026-06-30');

    ['E', 'F', 'G', 'H', 'I', 'J'].forEach((fourth) => {
      vi.advanceTimersByTime(21 * 60 * 1000);
      pebble.fire('showConfiguration');
      localStorage.setItem('clay-settings', JSON.stringify({ STOCK_PROVIDER: 'alphavantage', STOCK_API_KEY: 'k', STOCK_SYMBOLS: `A,B,C,${fourth}` }));
      pebble.fire('webviewclosed', { response: '{}' });
      vi.advanceTimersByTime(300);
      answerAlphaVantage('2026-06-30');
    });

    const result = sent.length;

    expect(result).toBe(25);
  });

  /** A routine try is held at 20 calls in a day, so the wearer's saves still have calls left after a busy day of tries. */
  test('holds a routine Alpha Vantage try at 20 calls a day and lets a save through', () => {
    vi.setSystemTime(Date.UTC(2026, 6, 1, 22, 30));
    const earlier = Array.from({ length: 20 }, (_unused, index) => Date.now() - (index + 1) * 60 * 60 * 1000);

    localStorage.setItem('clay-settings', JSON.stringify({ STOCK_PROVIDER: 'alphavantage', STOCK_API_KEY: 'k', STOCK_SYMBOLS: 'A,B,C,D' }));
    localStorage.setItem('stock-cache', JSON.stringify({ lastAsOf: '2026-06-30', lastFetchMs: Date.now() - 3 * 60 * 60 * 1000, strip: null, provider: 'alphavantage' }));
    localStorage.setItem('stock-ledger', JSON.stringify({ alphavantage: { [keyPrint('k')]: earlier } }));
    app.startPebbleApp({ clayConfig: [], features: [stocks] });
    pebble.fire('ready');
    const routine = sent.length;

    pebble.fire('showConfiguration');
    localStorage.setItem('clay-settings', JSON.stringify({ STOCK_PROVIDER: 'alphavantage', STOCK_API_KEY: 'k', STOCK_SYMBOLS: 'A,B,C,E' }));
    pebble.fire('webviewclosed', { response: '{}' });
    vi.advanceTimersByTime(300);
    answerAlphaVantage('2026-07-01');

    const result = [routine, sent.length];

    expect(result).toEqual([0, 4]);
  });

  /** A call whose send threw never left the phone and spent nothing, so counting it took a call of the free key's day. */
  test('takes the stamp back off for a call that never left the phone', () => {
    sent = installFakeXhr(() => {
      throw new Error('blocked');
    });
    localStorage.setItem('clay-settings', JSON.stringify({ STOCK_PROVIDER: 'alphavantage', STOCK_API_KEY: 'k', STOCK_SYMBOLS: 'IBM' }));
    app.startPebbleApp({ clayConfig: [], features: [stocks] });

    pebble.fire('ready');

    const result = JSON.parse(localStorage.getItem('stock-ledger') as string).alphavantage[keyPrint('k')] ?? [];

    expect(result).toEqual([]);
  });

  /**
   * An XHR error also fires for an answer lost after Alpha Vantage counted the call, and a timeout can
   * land after it did too. Both took the stamp back, so lost answers let a free key past its 25 a day.
   */
  test.each([
    ['an XHR error', (request: FakeXhr) => request.fail()],
    ['a timeout', (request: FakeXhr) => request.timeOut()],
  ])('keeps the stamp for a call that ends in %s', (_label, end) => {
    localStorage.setItem('clay-settings', JSON.stringify({ STOCK_PROVIDER: 'alphavantage', STOCK_API_KEY: 'k', STOCK_SYMBOLS: 'IBM' }));
    app.startPebbleApp({ clayConfig: [], features: [stocks] });
    pebble.fire('ready');

    end(sent[0]);

    const result = JSON.parse(localStorage.getItem('stock-ledger') as string).alphavantage[keyPrint('k')];

    expect(result).toEqual([Date.now()]);
  });

  /**
   * A lost round moves the fetch time, and Twelve Data's floor with the market shut is three hours, so
   * a phone back online could read NET ERROR long after its backoff ended. The backoff's wait has to
   * decide the next try alone.
   */
  test('fetches Twelve Data again once the backoff ends after the phone comes back online', () => {
    // Saturday 2026-07-04 16:00 UTC, with the market shut
    vi.setSystemTime(Date.UTC(2026, 6, 4, 16, 0));
    localStorage.setItem('clay-settings', JSON.stringify({ STOCK_PROVIDER: 'twelvedata', STOCK_API_KEY: 'k', STOCK_SYMBOLS: 'IBM' }));
    app.startPebbleApp({ clayConfig: [], features: [stocks] });
    const startMs = Date.now();
    const seen = new Set<FakeXhr>();
    const answerNew = (answer: (request: FakeXhr) => void) => sent.filter((request) => !seen.has(request)).forEach((request) => {
      seen.add(request);
      answer(request);
    });
    const reply = JSON.stringify({ symbol: 'IBM', close: '150', change: '1', percent_change: '0.5', datetime: '2026-07-03' });

    // offline for the first 30 minutes, asked every 5, then back online
    pebble.fire('ready');
    answerNew((request) => request.fail());

    for (let ask = 1; ask <= 12; ask++) {
      vi.advanceTimersByTime(5 * 60 * 1000);
      pebble.fire('appmessage', { payload: { STOCK_REQUEST: 1 } });
      answerNew((request) => (ask <= 6 ? request.fail() : request.respond(200, reply)));
    }

    const result = JSON.parse(localStorage.getItem('stock-ledger') as string).twelvedata[keyPrint('k')].map((ms: number) => (ms - startMs) / 60000);

    // lost at 0 and 15, then fetched at 45 when the 30 minute wait ends, not three hours on
    expect(result).toEqual([0, 15, 45]);
  });

  /**
   * A call lost to the network keeps its stamp, and with no wait after it every ask spent another, so
   * a phone offline a few hours filled a free key's day. It backs off as a timed out call does, 15
   * minutes and then 30, while the wearer still reads NET ERROR.
   */
  test('spends one call a wait, not one an ask, on a phone that is offline', () => {
    vi.setSystemTime(Date.UTC(2026, 6, 1, 22, 0));
    localStorage.setItem('clay-settings', JSON.stringify({ STOCK_PROVIDER: 'alphavantage', STOCK_API_KEY: 'k', STOCK_SYMBOLS: 'IBM' }));
    app.startPebbleApp({ clayConfig: [], features: [stocks] });
    const startMs = Date.now();
    const failed = new Set<FakeXhr>();
    // every call fails as an offline phone's does
    const failNew = () => sent.filter((request) => !failed.has(request)).forEach((request) => {
      failed.add(request);
      request.fail();
    });

    pebble.fire('ready');
    failNew();

    // the watch asks every 5 minutes for an hour
    for (let ask = 1; ask < 12; ask++) {
      vi.advanceTimersByTime(5 * 60 * 1000);
      pebble.fire('appmessage', { payload: { STOCK_REQUEST: 1 } });
      failNew();
    }

    const result = JSON.parse(localStorage.getItem('stock-ledger') as string).alphavantage[keyPrint('k')].map((ms: number) => (ms - startMs) / 60000);

    expect(result).toEqual([0, 15, 45]);
  });

  /**
   * Each try after a lost round stamped one call a ticker, so a watchlist of four on a free Alpha
   * Vantage key spent its whole day in an eight hour outage and read a day late once the phone was
   * back. After a round that left a backoff, the first ticker goes alone, and its loss ends the try.
   */
  test('asks for one ticker a try while a phone with four tickers is offline', () => {
    // Saturday 2026-07-04 16:00 UTC, with the market shut
    vi.setSystemTime(Date.UTC(2026, 6, 4, 16, 0));
    localStorage.setItem('clay-settings', JSON.stringify({ STOCK_PROVIDER: 'twelvedata', STOCK_API_KEY: 'k', STOCK_SYMBOLS: 'IBM,AAPL,MSFT,TSLA' }));
    app.startPebbleApp({ clayConfig: [], features: [stocks] });
    const startMs = Date.now();
    const failed = new Set<FakeXhr>();
    const failNew = () => sent.filter((request) => !failed.has(request)).forEach((request) => {
      failed.add(request);
      request.fail();
    });

    pebble.fire('ready');
    failNew();

    for (let ask = 1; ask < 12; ask++) {
      vi.advanceTimersByTime(5 * 60 * 1000);
      pebble.fire('appmessage', { payload: { STOCK_REQUEST: 1 } });
      failNew();
    }

    const result = JSON.parse(localStorage.getItem('stock-ledger') as string).twelvedata[keyPrint('k')].map((ms: number) => (ms - startMs) / 60000);

    // the first round asks for all four, then each try asks for the first alone
    expect(result).toEqual([0, 0, 0, 0, 15, 45]);
  });

  /** A first ticker answered after an outage has to bring the rest in the same round, or they wait out a floor of up to three hours. */
  test('asks for the other tickers once the first is answered after an outage', () => {
    vi.setSystemTime(Date.UTC(2026, 6, 4, 16, 0));
    localStorage.setItem('clay-settings', JSON.stringify({ STOCK_PROVIDER: 'twelvedata', STOCK_API_KEY: 'k', STOCK_SYMBOLS: 'IBM,AAPL,MSFT,TSLA' }));
    app.startPebbleApp({ clayConfig: [], features: [stocks] });
    const startMs = Date.now();
    const seen = new Set<FakeXhr>();
    const reply = JSON.stringify({ symbol: 'IBM', close: '150', change: '1', percent_change: '0.5', datetime: '2026-07-03' });
    // an answer can send the next call, so keep answering until nothing new is out
    const answerAll = (answer: (request: FakeXhr) => void) => {
      let fresh = sent.filter((request) => !seen.has(request));

      while (fresh.length) {
        fresh.forEach((request) => {
          seen.add(request);
          answer(request);
        });
        fresh = sent.filter((request) => !seen.has(request));
      }
    };

    pebble.fire('ready');
    answerAll((request) => request.fail());

    // offline until the try at 15 minutes, then back online for the try at 45
    for (let ask = 1; ask <= 9; ask++) {
      vi.advanceTimersByTime(5 * 60 * 1000);
      pebble.fire('appmessage', { payload: { STOCK_REQUEST: 1 } });
      answerAll((request) => (ask <= 3 ? request.fail() : request.respond(200, reply)));
    }

    const result = JSON.parse(localStorage.getItem('stock-ledger') as string).twelvedata[keyPrint('k')].map((ms: number) => (ms - startMs) / 60000);

    expect(result).toEqual([0, 0, 0, 0, 15, 45, 45, 45, 45]);
  });

  /**
   * A first Alpha Vantage round that timed out counted as a fetch, and with no close held the gate then
   * waited for a weekday evening, so a Friday night install showed TIMEOUT until Monday.
   */
  test('waits 15 minutes after an Alpha Vantage round that timed out, not until the evening', () => {
    vi.setSystemTime(Date.UTC(2026, 6, 4, 2, 30));
    localStorage.setItem('clay-settings', JSON.stringify({ STOCK_PROVIDER: 'alphavantage', STOCK_API_KEY: 'k', STOCK_SYMBOLS: 'IBM' }));
    app.startPebbleApp({ clayConfig: [], features: [stocks] });
    pebble.fire('ready');
    sent[0].timeOut();

    const result = JSON.parse(localStorage.getItem('stock-cache') as string).retryAtMs;

    expect(result).toBe(Date.now() + 15 * 60 * 1000);
  });

  /**
   * A routine Twelve Data round with room for only some tickers armed a retry that the 15 minute floor
   * then held, so the ticker left out waited three hours on a Saturday.
   */
  test('keeps the retry the ledger sets as the wait the gate holds to, past the floor', () => {
    vi.setSystemTime(Date.UTC(2026, 6, 4, 16, 0, 10));
    const reply = (url: string) => JSON.stringify({ symbol: new URL(url).searchParams.get('symbol'), close: '150', change: '1', percent_change: '0.5', datetime: '2026-07-03' });

    localStorage.setItem('clay-settings', JSON.stringify({ STOCK_PROVIDER: 'twelvedata', STOCK_API_KEY: 'k', STOCK_SYMBOLS: 'A,B,C' }));
    localStorage.setItem('stock-ledger', JSON.stringify({ twelvedata: { [keyPrint('k')]: Array.from({ length: 6 }, () => Date.now() - 5000) } }));
    app.startPebbleApp({ clayConfig: [], features: [stocks] });
    pebble.fire('ready');
    sent.forEach((request) => request.respond(200, reply(request.url)));
    const first = sent.length;

    vi.advanceTimersByTime(60 * 1000);
    sent.slice(first).forEach((request) => request.respond(200, reply(request.url)));

    const result = sent.map((request) => new URL(request.url).searchParams.get('symbol'));

    expect(result).toEqual(['A', 'B', 'C']);
  });

  /**
   * Stamps from a clock that ran ahead were clamped in memory only, so each launch clamped them again to
   * its own later now, and a day's count lasted the skew plus a day.
   */
  test('saves the clamp on stamps from a clock that ran ahead', () => {
    const ahead = Array.from({ length: 3 }, () => Date.now() + 72 * 60 * 60 * 1000);

    localStorage.setItem('clay-settings', JSON.stringify({ STOCK_PROVIDER: 'alphavantage', STOCK_API_KEY: 'k', STOCK_SYMBOLS: 'IBM' }));
    localStorage.setItem('stock-cache', JSON.stringify({ lastAsOf: '2026-07-01', lastFetchMs: Date.now() - 60000, strip: null, provider: 'alphavantage' }));
    localStorage.setItem('stock-ledger', JSON.stringify({ alphavantage: { [keyPrint('k')]: ahead } }));
    app.startPebbleApp({ clayConfig: [], features: [stocks] });
    pebble.fire('ready');
    pebble.fire('showConfiguration');
    localStorage.setItem('clay-settings', JSON.stringify({ STOCK_PROVIDER: 'alphavantage', STOCK_API_KEY: 'k', STOCK_SYMBOLS: 'MSFT' }));
    pebble.fire('webviewclosed', { response: '{}' });
    vi.advanceTimersByTime(300);

    const result = JSON.parse(localStorage.getItem('stock-ledger') as string).alphavantage[keyPrint('k')].every((ms: number) => ms <= Date.now());

    expect(result).toBe(true);
  });

  /**
   * A wait the old key's ledger set stayed after the wearer pasted a fresh key, so with a blip on the
   * save's fetch the new key, with all 25 calls free, was not tried for 21 hours.
   */
  test('drops a wait from the old key when the wearer saves a new one', () => {
    localStorage.setItem('clay-settings', JSON.stringify({ STOCK_PROVIDER: 'alphavantage', STOCK_API_KEY: 'old', STOCK_SYMBOLS: 'IBM' }));
    localStorage.setItem('stock-cache', JSON.stringify({ lastAsOf: '', lastFetchMs: Date.now() - 60000, strip: null, provider: 'alphavantage', retryAtMs: Date.now() + 21 * 60 * 60 * 1000 }));
    app.startPebbleApp({ clayConfig: [], features: [stocks] });
    pebble.fire('showConfiguration');
    localStorage.setItem('clay-settings', JSON.stringify({ STOCK_PROVIDER: 'alphavantage', STOCK_API_KEY: 'new', STOCK_SYMBOLS: 'IBM' }));

    pebble.fire('webviewclosed', { response: '{}' });

    const result = JSON.parse(localStorage.getItem('stock-cache') as string).retryAtMs;

    expect(result).toBe(0);
  });

  /**
   * A part round whose calls never left the phone took their stamps back off, but the wait worked out
   * before the round stood, so the left out tickers waited 21 hours for room that was already free.
   */
  test('works the ledger wait out again after a part round that never left the phone', () => {
    vi.setSystemTime(Date.UTC(2026, 6, 1, 22, 0));
    const earlier = Array.from({ length: 18 }, (_unused, index) => Date.now() - (index + 1) * 10 * 60 * 1000);

    localStorage.setItem('clay-settings', JSON.stringify({ STOCK_PROVIDER: 'alphavantage', STOCK_API_KEY: 'k', STOCK_SYMBOLS: 'A,B,C,D' }));
    localStorage.setItem('stock-cache', JSON.stringify({ lastAsOf: '2026-06-30', lastFetchMs: Date.now() - 3 * 60 * 60 * 1000, strip: null, provider: 'alphavantage' }));
    localStorage.setItem('stock-ledger', JSON.stringify({ alphavantage: { [keyPrint('k')]: earlier } }));
    sent = installFakeXhr(() => {
      throw new Error('blocked');
    });
    app.startPebbleApp({ clayConfig: [], features: [stocks] });
    pebble.fire('ready');
    vi.advanceTimersByTime(1100);

    const result = JSON.parse(localStorage.getItem('stock-cache') as string).retryAtMs;

    expect(result).toBe(0);
  });

  /** An answer the provider code gives with no request, such as NO API KEY, sent nothing, and counting it took the day's room. */
  test('stamps nothing for a fetch that never sends a request', () => {
    localStorage.setItem('clay-settings', JSON.stringify({ STOCK_PROVIDER: 'alphavantage', STOCK_API_KEY: '', STOCK_SYMBOLS: 'IBM' }));
    app.startPebbleApp({ clayConfig: [], features: [stocks] });

    pebble.fire('ready');

    const result = localStorage.getItem('stock-ledger');

    expect(result).not.toContain(String(Date.now()));
  });

  /** A relaunch while an Alpha Vantage call was out forgot when it went, and the next call followed it 300 ms later and was refused. */
  test('keeps the Alpha Vantage gap from a call sent before a relaunch', () => {
    localStorage.setItem('clay-settings', JSON.stringify({ STOCK_PROVIDER: 'alphavantage', STOCK_API_KEY: 'k', STOCK_SYMBOLS: 'IBM' }));
    localStorage.setItem('stock-ledger', JSON.stringify({ alphavantage: { [keyPrint('k')]: [Date.now() - 300] } }));
    app.startPebbleApp({ clayConfig: [], features: [stocks] });
    pebble.fire('ready');
    const before = sent.length;

    vi.advanceTimersByTime(800);

    const result = [before, sent.length];

    expect(result).toEqual([0, 1]);
  });

  /**
   * A wait that had passed stayed saved, so a launch killed partway through a round left it for the
   * next launch, which spent Alpha Vantage's calls again with nothing counting them.
   */
  test('lets a passed wait go and stamps the call in the ledger as it goes out', () => {
    localStorage.setItem('clay-settings', JSON.stringify({ STOCK_PROVIDER: 'alphavantage', STOCK_API_KEY: 'k', STOCK_SYMBOLS: 'IBM' }));
    localStorage.setItem('stock-cache', JSON.stringify({ lastAsOf: '', lastFetchMs: Date.now() - 60000, strip: null, provider: 'alphavantage', retryAtMs: Date.now() - 1000 }));
    app.startPebbleApp({ clayConfig: [], features: [stocks] });

    pebble.fire('ready');

    const cache = JSON.parse(localStorage.getItem('stock-cache') as string);
    const ledger = JSON.parse(localStorage.getItem('stock-ledger') as string);

    const result = [cache.retryAtMs, ledger.alphavantage[keyPrint('k')]];

    expect(result).toEqual([0, [Date.now()]]);
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

  // the same keys numbered the way a real build numbers them. the phone app keys a watch message by
  // name alone, so these are the specs where reading it by number and by name come apart
  const numberedKeys = {
    SETTINGS_REQUEST: 10004,
    SETTINGS_FRESH: 10005,
    CLOCK_DATE_FORMAT: 10006,
    APPEARANCE_THEME: 10007,
    CLOCK_TIMEZONE_1: 10008,
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

  // the keys the face under test declares. a spec for a face with more keys swaps them
  let keys: Record<string, string | number> = restoreKeys;

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

  /** The asks the watch took, by their value. A refused try is not one of them. */
  function requestsTaken() {
    return pebble.delivered.filter((dict) => 'SETTINGS_REQUEST' in dict).map((dict) => dict.SETTINGS_REQUEST);
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

  /** A face with no settings keys has nothing on the watch to ask for, and an ask under an undefined key would tie up the outbox. */
  test('asks a face without the settings keys for nothing', () => {
    keys = { CLOCK_DATE_FORMAT: 'CLOCK_DATE_FORMAT', APPEARANCE_THEME: 'APPEARANCE_THEME' };
    app.startPebbleApp({ clayConfig: [] });

    pebble.fire('ready');
    const result = pebble.sendAppMessage.mock.calls;

    expect(result).toEqual([]);
  });

  /** A save on a face with no settings keys still reaches the watch, with no fresh flag under an undefined key beside it. */
  test('sends a save with no fresh flag on a face without the settings keys', () => {
    keys = { CLOCK_DATE_FORMAT: 'CLOCK_DATE_FORMAT', APPEARANCE_THEME: 'APPEARANCE_THEME' };
    app.startPebbleApp({ clayConfig: [] });
    pebble.fire('ready');

    pebble.fire('webviewclosed', { response: JSON.stringify({ CLOCK_DATE_FORMAT: { value: '%d.%m.%Y' } }) });
    const result = restoreSends();

    expect(result).toEqual([{ CLOCK_DATE_FORMAT: '%d.%m.%Y' }]);
  });

  /**
   * The page sends every provider's key back beside the settings. Clay would send that field to the
   * watch under a key the face never declared, which breaks the whole save, so it comes out first and
   * the watch gets the picked provider's key alone, under the key row's own message key.
   */
  test('keeps the key of every provider on the phone and sends the watch the picked one alone', () => {
    keys = { CLOCK_DATE_FORMAT: 'CLOCK_DATE_FORMAT', STOCK_PROVIDER: 'STOCK_PROVIDER', STOCK_API_KEY: 'STOCK_API_KEY' };
    const stockRows: ClayConfigItem[] = [
      { type: 'select', messageKey: 'STOCK_PROVIDER', defaultValue: 'finnhub', options: [{ label: 'Finnhub', value: 'finnhub' }, { label: 'Twelve Data', value: 'twelvedata' }] },
      { type: 'input', messageKey: 'STOCK_API_KEY' },
    ];

    app.startPebbleApp({ clayConfig: stockRows });
    pebble.fire('ready');
    const pageKeys = encodeURIComponent(JSON.stringify({ STOCK_PROVIDER: { keys: { finnhub: 'fh-key', twelvedata: 'td-key' }, spare: '' } }));
    const response = { CLOCK_DATE_FORMAT: { value: '%d.%m.%Y' }, STOCK_PROVIDER: { value: 'twelvedata' }, STOCK_API_KEY: { value: 'td-key' }, PF_PROVIDER_KEYS: { value: pageKeys } };

    pebble.fire('webviewclosed', { response: encodeURIComponent(JSON.stringify(response)) });
    const result = restoreSends();

    expect(result).toEqual([{ CLOCK_DATE_FORMAT: '%d.%m.%Y', STOCK_PROVIDER: 'twelvedata', STOCK_API_KEY: 'td-key' }]);
    expect(JSON.parse(localStorage.getItem('pf-provider-keys') as string).STOCK_PROVIDER.keys).toEqual({ finnhub: 'fh-key', twelvedata: 'td-key' });
  });

  /** A face with no API key row keeps no keys, so a save writes nothing for them. */
  test('writes no provider keys on a save from a face with no key row', () => {
    keys = { CLOCK_DATE_FORMAT: 'CLOCK_DATE_FORMAT', APPEARANCE_THEME: 'APPEARANCE_THEME' };
    app.startPebbleApp({ clayConfig: [] });
    pebble.fire('ready');

    pebble.fire('webviewclosed', { response: JSON.stringify({ CLOCK_DATE_FORMAT: { value: '%d.%m.%Y' } }) });

    const result = localStorage.getItem('pf-provider-keys');

    expect(result).toBe(null);
  });

  /**
   * A factory reset watch stayed on its default theme until the wearer pressed Save. The phone app
   * keys the watch's reply by name alone, and the restore looked the marker up by number, so it
   * never saw the reply and nothing went back to the watch.
   */
  test('restores a fresh watch from a reply the phone app keyed by name', () => {
    keys = numberedKeys;
    localStorage.setItem('clay-settings', JSON.stringify({ CLOCK_DATE_FORMAT: '%d.%m.%Y', APPEARANCE_THEME: '5' }));
    app.startPebbleApp({ clayConfig: [] });
    pebble.fire('ready');

    pebble.fire('appmessage', { payload: { SETTINGS_REQUEST: WIRE_CAPS.SETTINGS_REQUEST_FRESH, SETTINGS_FRESH: 1 } });
    const result = restoreSends();

    expect(result).toEqual([expect.objectContaining({ CLOCK_DATE_FORMAT: '%d.%m.%Y', APPEARANCE_THEME: '5', [numberedKeys.SETTINGS_FRESH]: 1 })]);
  });

  /**
   * A phone with nothing saved missed the same reply, so the settings page opened on the defaults
   * rather than on the watch.
   */
  test('seeds from a reply the phone app keyed by name', () => {
    keys = numberedKeys;
    app.startPebbleApp({ clayConfig: [{ type: 'select', messageKey: 'CLOCK_DATE_FORMAT' }] });
    pebble.fire('ready');

    pebble.fire('appmessage', { payload: { SETTINGS_REQUEST: WIRE_CAPS.SETTINGS_REQUEST_FULL, SETTINGS_FRESH: 0, CLOCK_DATE_FORMAT: '%Y-%m-%d' } });

    expect(stored('CLOCK_DATE_FORMAT')).toBe('%Y-%m-%d');
  });

  /**
   * A face that opens AppMessage late turns away the only ask the phone sent, and the restore never
   * ran that session.
   */
  test('asks again once the watch stops turning the ask away', () => {
    pebble.answer = 'nack';
    localStorage.setItem('clay-settings', JSON.stringify({ CLOCK_DATE_FORMAT: '%d.%m.%Y' }));
    app.startPebbleApp({ clayConfig: [] });
    pebble.fire('ready');
    // the third try is refused here, so the queue has dropped the ask and the next one is a gap away
    vi.advanceTimersByTime(SEND_RETRY_MS * (SEND_RETRIES - 1));
    pebble.answer = 'ack';

    vi.advanceTimersByTime(SETTINGS_ASK_RETRY_MS);
    const result = requestsTaken();

    expect(result).toEqual([WIRE_CAPS.SETTINGS_REQUEST_FRESH]);
  });

  /** A feature holding something back until the watch's settings land would otherwise wait for the rest of the session. */
  test('tells each feature once the watch has turned away every ask', () => {
    const unanswered = vi.fn();

    pebble.answer = 'nack';
    app.startPebbleApp({ clayConfig: [], features: [() => ({ settingsUnanswered: unanswered })] });
    pebble.fire('ready');

    vi.advanceTimersByTime((SETTINGS_ASK_RETRIES + 1) * (SETTINGS_ASK_RETRY_MS + SEND_RETRY_MS * SEND_RETRIES));

    expect(unanswered).toHaveBeenCalledTimes(1);
  });

  /**
   * The first reply from a fresh watch seeds an empty phone with the watch's defaults, and a second
   * would send those same defaults straight back to the watch, a message and a flash write that
   * change nothing.
   */
  test('sends no restore for a second reply after the seed', () => {
    const reply = { SETTINGS_REQUEST: WIRE_CAPS.SETTINGS_REQUEST_FULL, SETTINGS_FRESH: 1, CLOCK_DATE_FORMAT: '%Y-%m-%d', APPEARANCE_THEME: 2 };

    app.startPebbleApp({ clayConfig: [{ type: 'select', messageKey: 'CLOCK_DATE_FORMAT' }] });
    pebble.fire('ready');
    pebble.fire('appmessage', { payload: reply });

    pebble.fire('appmessage', { payload: reply });
    const result = restoreSends();

    expect(result).toEqual([]);
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
   * The started features have to reach the seed, or no seeded hook runs on a real phone. The phone
   * app keys the reply by name, so the echo has to find a numbered key under its name as well.
   */
  test('runs the started features\' seeded hooks on the watch\'s reply', () => {
    keys = { ...numberedKeys, CALENDAR_SOURCE: 10009 };
    const feature = () => ({
      seeded: (config: Record<string, unknown>, echoed: (name: string) => unknown) => {
        config.CALENDAR_SOURCE = echoed('CALENDAR_SOURCE');
      },
    });

    app.startPebbleApp({ clayConfig: [{ type: 'select', messageKey: 'CLOCK_DATE_FORMAT' }], features: [feature] });
    pebble.fire('ready');
    pebble.fire('appmessage', { payload: { SETTINGS_REQUEST: 1, SETTINGS_FRESH: 0, CLOCK_DATE_FORMAT: '%Y-%m-%d', CALENDAR_SOURCE: 'plugin' } });

    const result = stored('CALENDAR_SOURCE');

    expect(result).toBe('plugin');
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

  // a face with one second clock, saved on the phone as London
  const zonePage = [{ type: 'locationsearch', messageKey: 'CLOCK_TIMEZONE_1', timeZone: true }];
  const londonSettings = JSON.stringify({
    CLOCK_DATE_FORMAT: '%d.%m.%Y',
    CLOCK_TIMEZONE_1: JSON.stringify({ label: 'London', offset: 0, tz: 'Europe/London' }),
  });

  /**
   * A save already carries the zone the wearer picked, but the push on the next background tick did
   * not know that and sent the same zone again, one wasted wake of the watch per save.
   */
  test('does not push a zone again that a settings save already sent', () => {
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

  /** Every zones push the phone sent, refused or not. */
  function zoneSends() {
    return pebble.sendAppMessage.mock.calls.filter(([dict]) => 'CLOCK_TIMEZONE_1' in dict);
  }

  /** The zones pushes the watch took. A refused try is not one of them. */
  function zonesTaken() {
    return pebble.delivered.filter((dict) => 'CLOCK_TIMEZONE_1' in dict);
  }

  /**
   * Has the watch refuse the ask and the zones on ready, then take the next ask. The ask's last try
   * is at 500 ms and the zones' at 1000 ms, and the next ask goes at 1500 ms.
   */
  function refuseReadyThenTakeAsk() {
    pebble.answer = 'nack';
    pebble.fire('ready');
    vi.advanceTimersByTime(SEND_RETRY_MS * 2 * (SEND_RETRIES - 1));
    pebble.answer = 'ack';
    vi.advanceTimersByTime(SETTINGS_ASK_RETRY_MS);
  }

  /**
   * A face that opens AppMessage late refuses the zones sent on ready, and a zone whose clocks
   * changed while the face was closed stayed an hour out until the 5 minute tick.
   */
  test('pushes the second clocks again when the settings reply lands after the watch turned the ready push away', () => {
    localStorage.setItem('clay-settings', londonSettings);
    app.startPebbleApp({ clayConfig: zonePage });
    refuseReadyThenTakeAsk();

    watchReplies(false, '%d.%m.%Y');
    const result = zonesTaken();

    expect(result).toHaveLength(1);
  });

  /**
   * The watch replies before it acks the ask, so the reply can land with the ready zones still in the
   * queue. A second push then would send the watch the same zones twice on every launch.
   */
  test('does not push the second clocks twice when the reply lands while the ready push is still out', () => {
    localStorage.setItem('clay-settings', londonSettings);
    app.startPebbleApp({ clayConfig: zonePage });
    pebble.answer = 'hold';
    pebble.fire('ready');
    // the ask is taken, so the zones go out and wait
    pebble.held[0].ok();

    watchReplies(false, '%d.%m.%Y');
    pebble.held[1].ok();
    const result = zoneSends();

    expect(result).toHaveLength(1);
  });

  /**
   * With the page open, an empty phone seeds the watch's own zone string from the reply. Pushing it
   * straight back would wake the watch for a value it already holds.
   */
  test('does not push the second clocks back after seeding them into an empty phone', () => {
    app.startPebbleApp({ clayConfig: zonePage });
    pebble.fire('showConfiguration');
    pebble.fire('ready');

    pebble.fire('appmessage', { payload: { SETTINGS_REQUEST: 1, SETTINGS_FRESH: 1, CLOCK_TIMEZONE_1: '0,London' } });
    const result = zoneSends();

    expect(result).toEqual([]);
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

describe('foldFeatures', () => {
  /** Each hook builds on the page the hooks before it made, so a hook run out of order or on the wrong page loses its rows. */
  test('passes the page through each page hook in order', () => {
    const page: ClayConfigItem[] = [{ type: 'heading', defaultValue: 'Page' }];
    const second: FeatureHooks = { page: (config) => [...config, { type: 'text', defaultValue: 'second' }] };
    const first: FeatureHooks = { page: (config) => [...config, { type: 'text', defaultValue: 'first' }] };

    const result = foldFeatures(page, [first, {}, second]);

    expect(result.map((item) => item.defaultValue)).toEqual(['Page', 'first', 'second']);
  });

  /**
   * The defaults, the settings restore, and every later open read the face's page, so a hook that
   * changed what it got would change all of them. A function a custom component carries is not
   * data, so it is handed on as it is.
   */
  test('gives the first hook a copy of the face\'s page, with functions kept as they are', () => {
    const render = () => {};
    const page: ClayConfigItem[] = [{ type: 'section', items: [{ type: 'layoutBuilder', moduleOptions: { render } }] }];
    const seen: ClayConfigItem[][] = [];
    const pushing: FeatureHooks = {
      page: (config) => {
        seen.push(config);
        (config[0].items as ClayConfigItem[]).push({ type: 'text', defaultValue: 'pushed' });
        return config;
      },
    };

    foldFeatures(page, [pushing]);

    expect(page[0].items).toHaveLength(1);
    expect((seen[0][0].items as ClayConfigItem[])[0].moduleOptions).toEqual({ render });
    expect(((seen[0][0].items as ClayConfigItem[])[0].moduleOptions as { render: unknown }).render).toBe(render);
  });

  /**
   * A hook changes the page it is given in place. The page an earlier hook made is what the fold
   * opens when a later hook throws, so a later hook that reached it would leave that page half changed.
   */
  test('gives every hook its own copy, so a later hook never reaches the page an earlier one made', () => {
    const page: ClayConfigItem[] = [{ type: 'section', items: [{ type: 'text', defaultValue: 'face' }] }];
    const made: ClayConfigItem[][] = [];
    const adding = (word: string): FeatureHooks => ({
      page: (config) => {
        (config[0].items as ClayConfigItem[]).push({ type: 'text', defaultValue: word });
        made.push(config);
        return config;
      },
    });

    const result = foldFeatures(page, [adding('first'), adding('second')]);

    expect((page[0].items as ClayConfigItem[]).map((item) => item.defaultValue)).toEqual(['face']);
    expect((made[0][0].items as ClayConfigItem[]).map((item) => item.defaultValue)).toEqual(['face', 'first']);
    expect((result[0].items as ClayConfigItem[]).map((item) => item.defaultValue)).toEqual(['face', 'first', 'second']);
  });

  /** A hook that breaks on this phone must not cost the wearer the rows the other features added, or the page itself. */
  test.each([
    ['throws', (): ClayConfigItem[] => {
      throw new Error('no plugins here');
    }],
    ['hands back no page', () => undefined as unknown as ClayConfigItem[]],
  ])('skips a hook that %s and keeps the page the hooks before it made', (_label, broken) => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const page: ClayConfigItem[] = [{ type: 'heading', defaultValue: 'Page' }];
    const first: FeatureHooks = { page: (config) => [...config, { type: 'text', defaultValue: 'first' }] };
    const last: FeatureHooks = { page: (config) => [...config, { type: 'text', defaultValue: 'last' }] };

    const result = foldFeatures(page, [first, { page: broken }, last]);

    expect(result.map((item) => item.defaultValue)).toEqual(['Page', 'first', 'last']);
    log.mockRestore();
  });
});

describe('startPebbleApp settings page hooks', () => {
  // the components Clay carries itself, as its bundle lists them
  const CLAY_OWN = ['color', 'footer', 'heading', 'input', 'select', 'submit', 'text', 'toggle', 'radiogroup', 'checkboxgroup', 'button', 'slider'];

  /**
   * A Clay that keeps what it was built with and what each page it opened held. Like the real one,
   * it deep copies the page it is built with, keeps a do-nothing custom function when given none,
   * registers its own component for each of its types the page it was built with uses, and adds a
   * ready listener to the Pebble bridge, as Clay does with its own events left to the face.
   */
  class PageClay {
    static built: PageClay[] = [];
    static opened: Array<{ config: unknown; customFn: unknown }> = [];
    static heard: PageClay[] = [];
    config: unknown[];
    customFn: unknown;
    components: Record<string, unknown> = {};
    builtConfig: unknown[];
    builtCustomFn: unknown;

    constructor(config: ClayConfigItem[], customFn?: unknown) {
      this.config = JSON.parse(JSON.stringify(config));

      this.customFn = customFn || function () {};

      this.builtConfig = this.config;
      this.builtCustomFn = this.customFn;

      const register = (items: ClayConfigItem[]) => {
        items.forEach((item) => {
          if (CLAY_OWN.includes(item.type)) {
            this.components[item.type] = { name: item.type };
          }

          register(item.items || []);
        });
      };

      register(config);
      PageClay.built.push(this);
      Pebble.addEventListener('ready', () => PageClay.heard.push(this));
    }

    registerComponent(component: { name: string }) {
      this.components[component.name] = component;
    }

    getSettings() {
      return {};
    }

    generateUrl() {
      PageClay.opened.push({ config: this.config, customFn: this.customFn });
      return '';
    }
  }

  const pageKeys = { SETTINGS_REQUEST: 'SETTINGS_REQUEST', SETTINGS_FRESH: 'SETTINGS_FRESH', WEATHER_PROVIDER: 'WEATHER_PROVIDER' };

  let pebble: FakePebble;
  let restoreLoad: () => void;

  /** A feature with only a page hook. */
  function pageFeature(page: (config: ClayConfigItem[]) => ClayConfigItem[]): Feature {
    // a plugin page hook puts the plugin kinds row on the page, so the feature brings its component,
    // as the plugin drivers do
    return () => ({ page, components: [kindsComponent] });
  }

  /** Starts the app and opens the settings page, as the phone does when the wearer taps settings. */
  function openSettings(clayConfig: ClayConfigItem[], features: Feature[], customClay?: unknown) {
    app.startPebbleApp({ clayConfig, features, customClay });
    pebble.fire('ready');
    pebble.fire('showConfiguration');
  }

  beforeEach(() => {
    localStorage.clear();
    PageClay.built = [];
    PageClay.opened = [];
    PageClay.heard = [];
    pebble = withFakePebble();
    restoreLoad = stubModuleLoad((id) => {
      if (id === 'message_keys') {
        return pageKeys;
      }

      return id === '@rebble/clay/src/js/index' ? PageClay : undefined;
    });
  });

  afterEach(() => {
    restoreLoad();
    pebble.restore();
    vi.restoreAllMocks();
  });

  /**
   * The builder's marks sit on every face's page, and no feature brings a page hook yet. Opening a
   * page with no API key row has to hand Clay exactly what it was built with, or every face's page
   * would change.
   */
  test('leaves the page and the custom function Clay was built with when no feature has a page hook', () => {
    openSettings(buildConfig({ location: {}, calendar: {} }), [() => ({})]);

    const result = PageClay.built[0];

    expect(result.config).toBe(result.builtConfig);
    expect(result.customFn).toBe(result.builtCustomFn);
  });

  /**
   * One key row serves every provider of its select, so a page that opened without each provider's
   * key would hand the old provider's key to the new one on a switch, and the watch would show
   * INVALID KEY until the wearer pasted the right one.
   */
  test('opens a key row with the key held for each provider, even with no page hook', () => {
    localStorage.setItem('clay-settings', JSON.stringify({ WEATHER_PROVIDER: 'owm', WEATHER_API_KEY: 'owm-key' }));
    localStorage.setItem('pf-provider-keys', JSON.stringify({ WEATHER_PROVIDER: { keys: { weatherapi: 'wapi-key' }, spare: '' } }));
    openSettings(buildConfig({ weather: {} }), [() => ({})]);
    const opened = PageClay.opened[0];
    const row = (opened.config as ClayConfigItem[]).flatMap((item) => [item, ...(item.items || [])]).find((item) => item.messageKey === 'WEATHER_API_KEY');

    const result = JSON.parse(decodeURIComponent(String(row?.providerKeys?.keys)));

    expect(row?.providerKeys?.select).toBe('WEATHER_PROVIDER');
    expect(result).toEqual({ keys: { weatherapi: 'wapi-key', owm: 'owm-key' }, spare: '', owner: 'owm' });
    expect(String(opened.customFn)).toContain('PF_PROVIDER_KEYS');
  });

  /** A fold from the last open's page would add the same rows again on every open. */
  test('folds from the face\'s own page on every open', () => {
    const clayConfig: ClayConfigItem[] = [{ type: 'heading', defaultValue: 'Page' }, { type: 'text', defaultValue: 'Intro' }];
    const given: ClayConfigItem[][] = [];
    const feature = pageFeature((config) => {
      given.push(config);
      return [...config, { type: 'text', defaultValue: 'added' }];
    });

    openSettings(clayConfig, [feature]);

    pebble.fire('showConfiguration');

    expect(given[1]).toEqual(clayConfig);
    expect(PageClay.opened[1].config).toEqual([...clayConfig, { type: 'text', defaultValue: 'added' }]);
  });

  /** A hook that changed the face's page would change the defaults and the restore, and its rows would pile up on every open. */
  test('keeps the face\'s page whole when a hook pushes a row into what it gets', () => {
    const clayConfig: ClayConfigItem[] = [{ type: 'heading', defaultValue: 'Page' }, { type: 'text', defaultValue: 'Intro' }];
    const given: ClayConfigItem[][] = [];
    const feature = pageFeature((config) => {
      given.push(config.slice());
      config.push({ type: 'text', defaultValue: 'pushed' });
      return config;
    });

    openSettings(clayConfig, [feature]);

    pebble.fire('showConfiguration');

    expect(clayConfig).toHaveLength(2);
    expect(given[1]).toHaveLength(2);
  });

  /**
   * The builder's marks only become a visibleWhen once a page hook runs, so a page whose only other
   * visibleWhen is gone was built with no show and hide. Without it the location rows would stay on
   * the page while the plugin is picked. The key row carries a visibleWhen of its own, so it comes off.
   */
  test('wires the show and hide for a page whose only visibleWhen comes from the marks', () => {
    const plugin = { uuid: 'weather-uuid', name: 'Weather', sources: [{ category: 'weather', items: ['location'] }] };
    const state = { pluginUuid: null, lastError: null, lastEmpty: false };
    const inputs = { selectKey: 'WEATHER_PROVIDER', category: 'weather', item: 'location', plugins: [plugin], messageKeys: { WEATHER_PROVIDER: 1 }, state, standard: WEATHER_STANDARD, texts: {} };
    const page = buildConfig({ location: {}, weather: {} });

    dropRows(page, (item) => item.messageKey === 'WEATHER_API_KEY');

    openSettings(page, [pageFeature((config) => pluginSourcePage(config, inputs))]);

    expect(PageClay.opened[0].customFn).toBe(dependentVisibility);
    expect(hasVisibleWhen(PageClay.opened[0].config as ClayConfigItem[])).toBe(true);
  });

  /** A plugin page on a face with its own customClay has to hide its rows as well as run the face's code, or the location rows stay showing while the plugin is picked. */
  test('runs the show and hide and then the face\'s customClay when the plugin page adds a visibleWhen', () => {
    const customClay = function () {
      document.title = 'face page code';
    };
    const plugin = { uuid: 'weather-uuid', name: 'Weather', sources: [{ category: 'weather', items: ['location'] }] };
    const state = { pluginUuid: null, lastError: null, lastEmpty: false };
    const inputs = { selectKey: 'WEATHER_PROVIDER', category: 'weather', item: 'location', plugins: [plugin], messageKeys: { WEATHER_PROVIDER: 1 }, state, standard: WEATHER_STANDARD, texts: {} };

    openSettings(buildConfig({ location: {}, weather: {} }), [pageFeature((config) => pluginSourcePage(config, inputs))], customClay);

    const result = partPlaces(PageClay.opened[0].customFn, [dependentVisibility, customClay]);

    expect(result[0]).toBeGreaterThanOrEqual(0);
    expect(result[1]).toBeGreaterThan(result[0]);
  });

  /** A face's customClay alone has to reach Clay as it is when nothing on the page needs the show and hide, so its page text stays as it is. */
  test('hands Clay the face\'s customClay itself when the hooks add no visibleWhen', () => {
    const customClay = function () {};

    openSettings([{ type: 'text', defaultValue: 'Intro' }], [pageFeature((config) => [...config, { type: 'text', defaultValue: 'Added' }])], customClay);

    const result = PageClay.opened[0].customFn;

    expect(result).toBe(customClay);
  });

  /**
   * Each open puts its own custom function together. One that kept an earlier open's would run the
   * show and hide on a page with plugins turned off, or leave it off a page that turned them back on.
   */
  test.each([
    { name: 'with no customClay', customClay: undefined },
    { name: 'with a customClay', customClay: function () {
      document.title = 'face page code';
    } },
  ])('puts the custom function together from each open\'s own page, plugins on and then off, $name', ({ customClay }) => {
    const hidden: ClayConfigItem = { type: 'text', defaultValue: 'Plugin only', visibleWhen: { key: 'WEATHER_PROVIDER', in: ['plugin'] } };
    let pluginsOn = true;

    openSettings([{ type: 'text', defaultValue: 'Intro' }], [pageFeature((config) => (pluginsOn ? [...config, hidden] : config.slice()))], customClay);
    pluginsOn = false;
    pebble.fire('showConfiguration');

    const result = PageClay.opened.map((opened) => partPlaces(opened.customFn, [dependentVisibility]));

    expect(result[0][0]).toBeGreaterThanOrEqual(0);
    expect(result[1][0]).toBe(-1);
    expect(PageClay.opened[1].customFn).toBe(customClay || PageClay.built[0].builtCustomFn);
  });

  /**
   * Clay only registers its own components for the page it was built with, so a select added to a
   * page with none would stop the page with "is not registered" unless it is registered first.
   */
  test('registers Clay\'s own component for a type the folded page adds', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const added: ClayConfigItem = { type: 'select', messageKey: 'NEW', options: [{ label: 'A', value: 'a' }] };

    openSettings([{ type: 'text', defaultValue: 'Intro' }], [pageFeature((config) => [...config, added])]);

    expect(PageClay.opened[0].config).toEqual([{ type: 'text', defaultValue: 'Intro' }, added]);
    expect(PageClay.built[0].components.select).toEqual({ name: 'select' });
    expect(warn).not.toHaveBeenCalled();
  });

  /** The plugin sources' notes are drawn by a component their feature hands over, so a page holding one opens with it rather than falling back. */
  test('registers a component a feature brings for a folded page holding its rows', () => {
    const note: ClayConfigItem = { type: 'pluginNote', tone: 'info', defaultValue: 'From the Pebble app.' };

    openSettings([{ type: 'text', defaultValue: 'Intro' }], [() => ({ page: (config) => [...config, note], components: [noteComponent] })]);

    expect(PageClay.built[0].components.pluginNote).toBe(noteComponent);
    expect(PageClay.opened[0].config).toEqual([{ type: 'text', defaultValue: 'Intro' }, note]);
  });

  /** A page without a note never needs the component, and carrying it would put code on the page nothing draws with. */
  test('registers no component a feature brings for a folded page without its rows', () => {
    openSettings([{ type: 'text', defaultValue: 'Intro' }], [() => ({ page: (config) => [...config, { type: 'text', defaultValue: 'Added' }], components: [noteComponent] })]);

    expect(PageClay.built[0].components.pluginNote).toBeUndefined();
  });

  /** A note registered on one open would otherwise ride along on every later page, notes or not, since Clay writes every component it holds. */
  test('takes a component back off on an open whose page no longer holds its rows', () => {
    const note: ClayConfigItem = { type: 'pluginNote', defaultValue: 'Allow Location.' };
    let withNote = true;

    openSettings([{ type: 'text', defaultValue: 'Intro' }], [() => ({ page: (config) => (withNote ? [...config, note] : config.slice()), components: [noteComponent] })]);
    withNote = false;
    pebble.fire('showConfiguration');

    expect(PageClay.built[0].components.pluginNote).toBeUndefined();
  });

  /** A face's own component under the same name is the face's to keep, and taking it off would break the face's page. */
  test('leaves a face\'s own component of the same name in place', () => {
    const own = { name: 'pluginNote', template: '<div></div>' };

    openSettings([{ type: 'text', defaultValue: 'Intro' }], [() => ({ page: (config) => config.slice(), components: [noteComponent] })]);
    PageClay.built[0].registerComponent(own);
    pebble.fire('showConfiguration');

    expect(PageClay.built[0].components.pluginNote).toBe(own);
  });

  /** A location search a hook adds to a page with no text box would draw as a plain white field without Clay's text box style. */
  test('registers Clay\'s text box for a folded page that gains a location search', () => {
    const search: ClayConfigItem = { type: 'locationsearch', messageKey: 'LOCATION_NAME' };

    openSettings([{ type: 'text', defaultValue: 'Intro' }], [pageFeature((config) => [...config, search])]);

    expect(PageClay.built[0].components.input).toEqual({ name: 'input' });
    expect(PageClay.opened[0].config).toEqual([{ type: 'text', defaultValue: 'Intro' }, search]);
  });

  /**
   * A spare Clay's ready listener reads the watch info and both tokens into a Clay nothing reads.
   * Only the real page's listener may reach the bridge, and a fold needing both a Clay type and the
   * search's text box builds one spare for the two.
   */
  test('builds one spare Clay for a fold, with no ready listener of its own', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const search: ClayConfigItem = { type: 'locationsearch', messageKey: 'LOCATION_NAME' };
    const pick: ClayConfigItem = { type: 'select', messageKey: 'NEW', options: [{ label: 'A', value: 'a' }] };
    const listen = Pebble.addEventListener;

    openSettings([{ type: 'text', defaultValue: 'Intro' }], [pageFeature((config) => [...config, pick, search])]);
    PageClay.heard = [];
    pebble.fire('ready');

    expect(PageClay.built).toHaveLength(2);
    expect(PageClay.heard).toEqual([PageClay.built[0]]);
    expect(Object.keys(PageClay.built[0].components)).toEqual(expect.arrayContaining(['select', 'input']));
    expect(Pebble.addEventListener).toBe(listen);
  });

  /** The page's own spare for the search's text box must not leave a listener on the bridge either. */
  test('builds the spare for a page with a location search with no ready listener of its own', () => {
    openSettings([{ type: 'locationsearch', messageKey: 'LOCATION_NAME' }], []);
    PageClay.heard = [];
    pebble.fire('ready');

    expect(PageClay.built).toHaveLength(2);
    expect(PageClay.heard).toEqual([PageClay.built[0]]);
  });

  /** A face that passes its own text box draws the search with it, so a fold has nothing to take. */
  test('keeps a face\'s own text box for a location search a fold adds', () => {
    const ownInput = { name: 'input', template: '<div></div>', manipulator: 'val' };
    const search: ClayConfigItem = { type: 'locationsearch', messageKey: 'LOCATION_NAME' };

    app.startPebbleApp({ clayConfig: [{ type: 'text', defaultValue: 'Intro' }], features: [pageFeature((config) => [...config, search])], components: [ownInput] });
    pebble.fire('ready');
    pebble.fire('showConfiguration');

    expect(PageClay.built[0].components.input).toBe(ownInput);
    expect(PageClay.built).toHaveLength(1);
  });

  /** A text box left on after the search goes would carry its code and style on every later page that has no use for it. */
  test('takes the text box back off on an open whose fold drops the location search', () => {
    const search: ClayConfigItem = { type: 'locationsearch', messageKey: 'LOCATION_NAME' };
    let withSearch = true;

    openSettings([{ type: 'text', defaultValue: 'Intro' }], [pageFeature((config) => (withSearch ? [...config, search] : config.slice()))]);
    withSearch = false;
    pebble.fire('showConfiguration');

    expect(PageClay.built[0].components.input).toBeUndefined();
  });

  /**
   * A feature that brings its own text box draws the page's text rows with it, the way a face's own
   * does, so it takes the place of the one taken from Clay for the search's look. Once its rows go,
   * the search takes Clay's look again.
   */
  test('lets a feature\'s own text box take the place of the search\'s look from Clay', () => {
    const featureInput = { name: 'input', template: '<div></div>', manipulator: 'val' };
    const words: ClayConfigItem = { type: 'input', messageKey: 'WORDS' };
    let withWords = true;

    openSettings([{ type: 'locationsearch', messageKey: 'LOCATION_NAME' }], [() => ({ page: (config) => (withWords ? [...config, words] : config.slice()), components: [featureInput] })]);
    const first = PageClay.built[0].components.input;

    withWords = false;
    pebble.fire('showConfiguration');

    expect(first).toBe(featureInput);
    expect(PageClay.built[0].components.input).toEqual({ name: 'input' });
  });

  /** A theme picker a hook adds to a page with no select would show the bare native dropdown, and the select left on after it goes would ride along on every later page. */
  test('registers Clay\'s select for a folded page that gains a theme picker and takes it off once the picker goes', () => {
    const picker: ClayConfigItem = { type: 'themePreview', messageKey: 'APPEARANCE_THEME', label: 'Theme', defaultValue: 'a', options: [{ label: 'A', value: 'a' }], previews: {} };
    let withPicker = true;

    openSettings([{ type: 'text', defaultValue: 'Intro' }], [() => ({ page: (config) => (withPicker ? [...config, picker] : config.slice()), components: [themePreviewComponent] })]);
    const first = PageClay.built[0].components.select;

    withPicker = false;
    pebble.fire('showConfiguration');

    expect(first).toEqual({ name: 'select' });
    expect(PageClay.built[0].components.select).toBeUndefined();
  });

  /** A face that passes its own select draws the picker with it, so a fold has nothing to take or to take off. */
  test('keeps a face\'s own select for a theme picker a fold adds and drops', () => {
    const ownSelect = { name: 'select', template: '<div></div>', manipulator: 'val' };
    const picker: ClayConfigItem = { type: 'themePreview', messageKey: 'APPEARANCE_THEME', label: 'Theme', defaultValue: 'a', options: [{ label: 'A', value: 'a' }], previews: {} };
    let withPicker = true;

    app.startPebbleApp({ clayConfig: [{ type: 'text', defaultValue: 'Intro' }], features: [() => ({ page: (config) => (withPicker ? [...config, picker] : config.slice()), components: [themePreviewComponent] })], components: [ownSelect] });
    pebble.fire('ready');
    pebble.fire('showConfiguration');
    withPicker = false;
    pebble.fire('showConfiguration');

    expect(PageClay.built[0].components.select).toBe(ownSelect);
    expect(PageClay.built).toHaveLength(1);
  });

  /** A hidden store row a hook adds with no component would stop Clay there, and every row below it would never show. */
  test('registers the hidden store for a folded page that gains a hiddenStore row', () => {
    const store = { type: 'hiddenStore', messageKey: 'SCRATCH' };

    openSettings([{ type: 'text', defaultValue: 'Intro' }], [pageFeature((config) => [...config, store])]);

    expect(PageClay.built[0].components.hiddenStore).toBe(hiddenStoreComponent);
    expect(PageClay.opened[0].config).toEqual([{ type: 'text', defaultValue: 'Intro' }, store]);
  });

  /** An intro asking the wearer to dial in weather preferences over a page with no Weather section promises settings it does not have. */
  test('takes the builder\'s intro back to its plain wording when a fold leaves no Weather section', () => {
    const dropWeather = pageFeature((config) => {
      dropRows(config, (item) => item.messageKey === 'WEATHER_PROVIDER' || item.messageKey === 'WEATHER_API_KEY' || item.type === 'text' && item.pluginSourceLead !== undefined);
      return config;
    });

    openSettings(buildConfig({ weather: {} }), [dropWeather]);

    const result = (PageClay.opened[0].config as ClayConfigItem[])[1];

    expect(result).toEqual({ type: 'text', defaultValue: 'Personalize your layout and make this watchface your own.' });
  });

  /** The weather wording has to stay while the Weather section does, with the mark gone so it reaches the page as plain text. */
  test('keeps the builder\'s weather intro when the fold leaves the Weather section', () => {
    openSettings(buildConfig({ weather: {}, temperature: {} }), [pageFeature((config) => config.slice())]);

    const result = (PageClay.opened[0].config as ClayConfigItem[])[1];

    expect(result).toEqual({ type: 'text', defaultValue: 'Personalize your layout, dial in your weather preferences, and make this watchface your own.' });
  });

  /** A row no component can draw stops the page from opening at all, which is worse than a page without the features' rows. */
  test('opens the page Clay was built with when a hook adds a type no component draws', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    openSettings([{ type: 'text', defaultValue: 'Intro' }], [pageFeature((config) => [...config, { type: 'layoutBuilder', messageKey: 'NEW' }])]);

    expect(PageClay.opened[0].config).toEqual(PageClay.built[0].builtConfig);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('layoutBuilder'));
  });

  /**
   * The page a fold falls back to is one the wearer sees too. Left unsettled it would promise weather
   * settings over a page whose Weather section the start took off, and hand Clay the mark.
   */
  test('settles the builder\'s intro on the page it falls back to', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const intro: ClayConfigItem = { type: 'text', defaultValue: 'Personalize your layout, dial in your weather preferences, and make this watchface your own.', introWithoutWeather: 'Personalize your layout and make this watchface your own.' };

    openSettings([intro], [pageFeature((config) => [...config, { type: 'layoutBuilder', messageKey: 'NEW' }])]);

    expect(PageClay.opened[0].config).toEqual([{ type: 'text', defaultValue: 'Personalize your layout and make this watchface your own.' }]);
  });

  /** A wearer whose features' rows could not be added still sees the location search, and it has to look like a text box there too. */
  test('keeps Clay\'s text box for a location search on the page it falls back to', () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const search: ClayConfigItem = { type: 'locationsearch', messageKey: 'LOCATION_NAME' };

    openSettings([search], [pageFeature(() => {
      throw new Error('fold failed');
    })]);

    expect(PageClay.opened[0].config).toEqual([search]);
    expect(PageClay.built[0].components.input).toEqual({ name: 'input' });
  });
});

describe('faceStart', () => {
  // a page with the builder's weather section, whose Data Source offers every weather provider
  const weatherPage = (): ClayConfigItem[] => buildConfig({ weather: {}, location: {} });

  beforeEach(() => {
    localStorage.clear();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /**
   * The page half of the promise that a face without providers is untouched. Clay, the defaults, and
   * the features have to get exactly what they got before the providers code existed.
   */
  test('hands a face without providers its own options, its page\'s defaults, and no hooks', () => {
    const options = { clayConfig: weatherPage() };

    const result = faceStart(options, null);

    expect(result.options).toBe(options);
    expect(result.defaults).toEqual(collectDefaults(options.clayConfig));
    expect(result.providers).toBeNull();
    expect(result.hooks).toEqual([]);
  });

  /** A start that read the face's own page would offer every provider while the manifest lists only some. */
  test('narrows the page every reader takes, and fills the provider default', () => {
    const options = { clayConfig: weatherPage() };

    const result = faceStart(options, faceProvidersFor({ weather: { offered: ['plugin', 'weatherapi'], needsKey: true } }));

    expect(result.defaults.WEATHER_PROVIDER).toBe('weatherapi');
    expect(result.providers).toEqual({ weather: ['plugin', 'weatherapi'] });
    expect(options.clayConfig).toEqual(weatherPage());
    expect(allItems(result.options.clayConfig).find((item) => item.messageKey === 'WEATHER_PROVIDER')?.options).toEqual([{ label: 'WeatherAPI.com', value: 'weatherapi' }]);
  });

  /**
   * The app reads an empty phone as one to fill from the watch. A launch that wrote settings would
   * make the phone look like it had its own and skip that restore.
   */
  test('leaves clay-settings unset on an empty phone', () => {
    faceStart({ clayConfig: weatherPage() }, faceProvidersFor({ weather: { offered: ['openmeteo'], needsKey: false } }));

    const result = localStorage.getItem('clay-settings');

    expect(result).toBeNull();
  });

  /** A saved provider the face dropped shows a blank select and fetches from a site the phone now blocks. */
  test('saves a settle that changed the saved settings', () => {
    localStorage.setItem('clay-settings', JSON.stringify({ WEATHER_PROVIDER: 'owm', WEATHER_API_KEY: 'abc' }));

    faceStart({ clayConfig: weatherPage() }, faceProvidersFor({ weather: { offered: ['openmeteo'], needsKey: false } }));

    const result = JSON.parse(localStorage.getItem('clay-settings') as string);

    expect(result).toEqual({ WEATHER_PROVIDER: 'openmeteo' });
  });

  /** Settings that are already fine must not be written, or every launch costs a write for nothing. */
  test('writes nothing when the saved settings are already fine', () => {
    const saved = '{ "WEATHER_PROVIDER": "openmeteo" }';

    localStorage.setItem('clay-settings', saved);
    faceStart({ clayConfig: weatherPage() }, faceProvidersFor({ weather: { offered: ['openmeteo', 'owm'], needsKey: true } }));

    const result = localStorage.getItem('clay-settings');

    expect(result).toBe(saved);
  });
});

describe('startPebbleApp face providers', () => {
  /** A Clay that keeps the page it was built with and each page it opened. */
  class ProviderClay {
    static built: ProviderClay[] = [];
    static opened: unknown[] = [];
    config: unknown[];
    customFn: unknown;
    components: Record<string, unknown> = { heading: {}, text: {}, select: {}, input: {}, toggle: {}, submit: {} };
    madeFrom: ClayConfigItem[];

    constructor(config: ClayConfigItem[], customFn?: unknown) {
      this.madeFrom = config;
      this.config = JSON.parse(JSON.stringify(config));

      this.customFn = customFn || function () {};

      ProviderClay.built.push(this);
    }

    registerComponent(component: { name: string }) {
      this.components[component.name] = component;
    }

    // the real Clay reads the page's { value } wrapper off each setting, so a restore shows up as the
    // values reaching the watch
    getSettings(json: string) {
      const settings = JSON.parse(json);
      const dict: Record<string, unknown> = {};

      Object.keys(settings).forEach((key) => {
        dict[key] = settings[key] && typeof settings[key] === 'object' ? settings[key].value : settings[key];
      });
      return dict;
    }

    generateUrl() {
      ProviderClay.opened.push(this.config);
      return '';
    }
  }

  const providerKeys = { SETTINGS_REQUEST: 'SETTINGS_REQUEST', SETTINGS_FRESH: 'SETTINGS_FRESH', WEATHER_PROVIDER: 'WEATHER_PROVIDER', CLOCK_TIMEZONE_1: 'CLOCK_TIMEZONE_1' };

  // a page with one weather select of the face's own, which offers three providers
  const ownPage = (): ClayConfigItem[] => [
    select('WEATHER_PROVIDER', 'Data Source', [{ label: 'Open-Meteo', value: 'openmeteo' }, { label: 'OWM', value: 'owm' }, { label: 'WeatherAPI', value: 'weatherapi' }], 'openmeteo'),
  ];

  let pebble: FakePebble;
  let restoreLoad: () => void;

  beforeEach(() => {
    localStorage.clear();
    ProviderClay.built = [];
    ProviderClay.opened = [];
    pebble = withFakePebble();
    restoreLoad = stubModuleLoad((id) => {
      if (id === 'message_keys') {
        return providerKeys;
      }

      return id === '@rebble/clay/src/js/index' ? ProviderClay : undefined;
    });
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    providerCode.current = null;
    restoreLoad();
    pebble.restore();
    vi.restoreAllMocks();
  });

  /**
   * A face without providers has to build, start its features, and open its page exactly as it did
   * before the providers code existed, with no hook of the providers' own in the way.
   */
  test('builds Clay from the face\'s own page and hands the features no lists for a face without providers', () => {
    const clayConfig = ownPage();
    const contexts: Array<{ providers: unknown }> = [];

    app.startPebbleApp({ clayConfig, features: [(context) => { contexts.push(context); return {}; }] });
    pebble.fire('showConfiguration');

    expect(ProviderClay.built[0].madeFrom).toEqual(clayConfig);
    expect(contexts.map((context) => context.providers)).toEqual([null]);
    expect(ProviderClay.opened[0]).toBe(ProviderClay.built[0].config);
  });

  /** A feature reading its kind's list from anywhere but its context would have to require the generated entry itself. */
  test('hands every feature the lists the build wrote', () => {
    const contexts: Array<{ providers: unknown }> = [];

    providerCode.current = faceProvidersFor({ weather: { offered: ['plugin', 'openmeteo'], needsKey: false } });
    app.startPebbleApp({ clayConfig: ownPage(), features: [(context) => { contexts.push(context); return {}; }, (context) => { contexts.push(context); return {}; }] });

    const result = contexts.map((context) => context.providers);

    expect(result).toEqual([{ weather: ['plugin', 'openmeteo'] }, { weather: ['plugin', 'openmeteo'] }]);
  });

  /**
   * The weather page hook adds the plugin choice to a select the first pass left with one option, so
   * a pass that dropped that select before the hooks ran would take away the choice the hook adds.
   */
  test('runs the page pass after every feature\'s page hook', () => {
    providerCode.current = faceProvidersFor({ weather: { offered: ['plugin', 'openmeteo'], needsKey: false } });
    app.startPebbleApp({
      clayConfig: ownPage(),
      features: [() => ({
        page: (config) => {
          (config[0].options as Array<{ label: string; value: string }>).push({ label: 'Pebble App', value: 'plugin' });
          return config;
        },
      })],
    });

    pebble.fire('showConfiguration');

    const result = (ProviderClay.opened[0] as ClayConfigItem[])[0].options?.map((option) => option.value);

    expect(result).toEqual(['openmeteo', 'plugin']);
  });

  /** A dropdown with one provider on it is no choice, and the open pass is what takes it away. */
  test('opens without a picker left with one provider', () => {
    providerCode.current = faceProvidersFor({ weather: { offered: ['openmeteo'], needsKey: false } });
    app.startPebbleApp({ clayConfig: ownPage(), features: [] });

    pebble.fire('showConfiguration');

    expect(ProviderClay.opened[0]).toEqual([]);
  });

  /**
   * The seed runs once, into a phone with nothing saved. The watch echoes whatever it was last sent,
   * so a watch last saved before the face narrowed its list hands back a provider the face no longer
   * offers. A settle made after the seed's write would be lost, so the spec reads the store.
   */
  test('settles a provider the watch brings back before the seed saves it', () => {
    providerCode.current = faceProvidersFor({ weather: { offered: ['openmeteo', 'weatherapi'], needsKey: true } });
    app.startPebbleApp({ clayConfig: ownPage(), features: [] });
    pebble.fire('ready');

    pebble.fire('appmessage', { payload: { SETTINGS_REQUEST: 1, SETTINGS_FRESH: 0, WEATHER_PROVIDER: 'owm' } });

    const result = JSON.parse(localStorage.getItem('clay-settings') as string).WEATHER_PROVIDER;

    expect(result).toBe('openmeteo');
  });

  /**
   * The seed into an empty phone settles what the watch brought back. The watch keeps what it was
   * last sent, so a settle it never heard about left it on the dropped provider while the phone
   * showed another.
   */
  test('sends the watch the settings a seed into an empty phone settled', () => {
    providerCode.current = faceProvidersFor({ weather: { offered: ['openmeteo', 'weatherapi'], needsKey: true } });
    app.startPebbleApp({ clayConfig: ownPage(), features: [] });
    pebble.fire('ready');

    pebble.fire('appmessage', { payload: { SETTINGS_REQUEST: 1, SETTINGS_FRESH: 0, WEATHER_PROVIDER: 'owm' } });

    const result = pebble.sendAppMessage.mock.calls.map(([dict]) => dict).filter((dict) => 'WEATHER_PROVIDER' in dict);

    expect(result).toEqual([{ WEATHER_PROVIDER: 'openmeteo', SETTINGS_FRESH: 1 }]);
  });

  /**
   * A phone that already has settings is settled at launch and never seeded. The watch keeps what it
   * was last sent, so without this send it stayed on a provider the face dropped while the phone
   * showed another, until the wearer next saved the page.
   */
  test('sends the watch the settings a seed settled', () => {
    localStorage.setItem('clay-settings', JSON.stringify({ WEATHER_PROVIDER: 'owm' }));
    providerCode.current = faceProvidersFor({ weather: { offered: ['openmeteo', 'weatherapi'], needsKey: true } });
    app.startPebbleApp({ clayConfig: ownPage(), features: [] });
    pebble.fire('ready');

    pebble.fire('appmessage', { payload: { SETTINGS_REQUEST: WIRE_CAPS.SETTINGS_REQUEST_FRESH, SETTINGS_FRESH: 0 } });

    const result = pebble.sendAppMessage.mock.calls.map(([dict]) => dict).filter((dict) => 'WEATHER_PROVIDER' in dict);

    expect(result).toEqual([{ WEATHER_PROVIDER: 'openmeteo', SETTINGS_FRESH: 1 }]);
  });

  /** The watch heard the launch settle once, and sending it on every later reply would wake it and write flash for nothing. */
  test('sends the launch settle to the watch once', () => {
    localStorage.setItem('clay-settings', JSON.stringify({ WEATHER_PROVIDER: 'owm' }));
    providerCode.current = faceProvidersFor({ weather: { offered: ['openmeteo', 'weatherapi'], needsKey: true } });
    app.startPebbleApp({ clayConfig: ownPage(), features: [] });
    pebble.fire('ready');
    pebble.fire('appmessage', { payload: { SETTINGS_REQUEST: WIRE_CAPS.SETTINGS_REQUEST_FRESH, SETTINGS_FRESH: 0 } });
    pebble.fire('ready');

    pebble.fire('appmessage', { payload: { SETTINGS_REQUEST: WIRE_CAPS.SETTINGS_REQUEST_FRESH, SETTINGS_FRESH: 0 } });

    const result = pebble.sendAppMessage.mock.calls.map(([dict]) => dict).filter((dict) => 'WEATHER_PROVIDER' in dict);

    expect(result).toHaveLength(1);
  });

  /** A wiped watch's restore already carries the settled provider, and a second send of it would write flash for nothing. */
  test('sends a wiped watch the launch settle inside its restore alone', () => {
    localStorage.setItem('clay-settings', JSON.stringify({ WEATHER_PROVIDER: 'owm' }));
    providerCode.current = faceProvidersFor({ weather: { offered: ['openmeteo', 'weatherapi'], needsKey: true } });
    app.startPebbleApp({ clayConfig: ownPage(), features: [] });
    pebble.fire('ready');

    pebble.fire('appmessage', { payload: { SETTINGS_REQUEST: WIRE_CAPS.SETTINGS_REQUEST_FRESH, SETTINGS_FRESH: 1 } });

    const result = pebble.sendAppMessage.mock.calls.map(([dict]) => dict).filter((dict) => 'WEATHER_PROVIDER' in dict);

    expect(result).toEqual([{ WEATHER_PROVIDER: 'openmeteo', SETTINGS_FRESH: 1 }]);
  });

  describe('with a second clock', () => {
    const zoneRow = { type: 'locationsearch', messageKey: 'CLOCK_TIMEZONE_1', timeZone: true } as ClayConfigItem;
    const london = JSON.stringify({ label: 'London', offset: 0, tz: 'Europe/London' });

    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    /**
     * The watch turned the zones away on ready, so the reply would push them again. The settled
     * restore already carries every zone, and a push queued behind it, before its ack recorded the
     * zones, would wake the watch twice for the same zone.
     */
    test('sends the settled restore alone with the zones inside it', () => {
      localStorage.setItem('clay-settings', JSON.stringify({ WEATHER_PROVIDER: 'owm', CLOCK_TIMEZONE_1: london }));
      providerCode.current = faceProvidersFor({ weather: { offered: ['openmeteo', 'weatherapi'], needsKey: true } });
      app.startPebbleApp({ clayConfig: [...ownPage(), zoneRow], features: [] });
      pebble.answer = 'nack';
      pebble.fire('ready');
      vi.advanceTimersByTime(SEND_RETRY_MS * 2 * (SEND_RETRIES - 1));
      pebble.answer = 'hold';
      pebble.sendAppMessage.mockClear();

      pebble.fire('appmessage', { payload: { SETTINGS_REQUEST: WIRE_CAPS.SETTINGS_REQUEST_FRESH, SETTINGS_FRESH: 0 } });
      pebble.held[0].ok();
      const result = pebble.sendAppMessage.mock.calls.map(([dict]) => dict).filter((dict) => 'CLOCK_TIMEZONE_1' in dict);

      expect(result).toEqual([expect.objectContaining({ WEATHER_PROVIDER: 'openmeteo', SETTINGS_FRESH: 1 })]);
    });
  });

  /** A phone the settle left alone holds what the watch was last sent, and a send on every launch would wake the watch for nothing. */
  test('sends a watch with settings nothing when the launch settle left the phone alone', () => {
    localStorage.setItem('clay-settings', JSON.stringify({ WEATHER_PROVIDER: 'weatherapi' }));
    providerCode.current = faceProvidersFor({ weather: { offered: ['openmeteo', 'weatherapi'], needsKey: true } });
    app.startPebbleApp({ clayConfig: ownPage(), features: [] });
    pebble.fire('ready');

    pebble.fire('appmessage', { payload: { SETTINGS_REQUEST: WIRE_CAPS.SETTINGS_REQUEST_FRESH, SETTINGS_FRESH: 0 } });

    const result = pebble.sendAppMessage.mock.calls.map(([dict]) => dict).filter((dict) => 'WEATHER_PROVIDER' in dict);

    expect(result).toEqual([]);
  });

  /** A watch already in line has nothing to hear, and a send on every launch would wake it for nothing. */
  test('sends the watch nothing after a seed the settle left alone', () => {
    providerCode.current = faceProvidersFor({ weather: { offered: ['openmeteo', 'weatherapi'], needsKey: true } });
    app.startPebbleApp({ clayConfig: ownPage(), features: [] });
    pebble.fire('ready');

    pebble.fire('appmessage', { payload: { SETTINGS_REQUEST: 1, SETTINGS_FRESH: 0, WEATHER_PROVIDER: 'weatherapi' } });

    const result = pebble.sendAppMessage.mock.calls.map(([dict]) => dict).filter((dict) => 'WEATHER_PROVIDER' in dict);

    expect(result).toEqual([]);
  });

  /** A hook that throws is skipped, and the providers' own pass still takes away a picker left with one provider. */
  test('drops a one-provider picker when a feature\'s page hook throws', () => {
    providerCode.current = faceProvidersFor({ weather: { offered: ['openmeteo'], needsKey: false } });
    app.startPebbleApp({ clayConfig: ownPage(), features: [() => ({ page: () => { throw new Error('broken'); } })] });

    pebble.fire('showConfiguration');

    expect(ProviderClay.opened[0]).toEqual([]);
  });

  /**
   * An open that cannot add the features' rows falls back to the page Clay was built with. On a face
   * with providers that page still held a one-provider dropdown and the empty row the notes hang off.
   */
  test('falls back to a page with the providers\' pass run on it', () => {
    providerCode.current = faceProvidersFor({ weather: { offered: ['plugin'], needsKey: false }, stocks: { offered: ['yahoo'], needsKey: false } });
    const clayConfig: ClayConfigItem[] = [
      ...ownPage(),
      select('STOCK_PROVIDER', 'Stocks', [{ label: 'Finnhub', value: 'finnhub' }, { label: 'Yahoo', value: 'yahoo' }], 'finnhub'),
    ];

    app.startPebbleApp({ clayConfig, features: [() => ({ page: (config) => [...config, { type: 'layoutBuilder', messageKey: 'NEW' }] })] });
    pebble.fire('showConfiguration');

    expect(ProviderClay.opened[0]).toEqual([]);
  });
});
