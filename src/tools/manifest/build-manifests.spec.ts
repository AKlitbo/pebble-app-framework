/**
 * Specs for the manifest builder's pure steps.
 *
 * buildMedia owns the per-target media list: which entry gets the menuIcon flag, and the
 * deep-clone that keeps one target's flag from bleeding onto the other. buildManifest is the
 * package.json wire shape pebble build reads. fillWscript is the only place a sandbox learns where
 * its framework and face sit. readDefines guards what a face hands the compiler, since each define
 * lands on its command line. checkPluginKeys refuses a plugin define the face has not declared the
 * keys for, which follow the mode the face's providers list puts the kind in. checkAppinfo is what
 * every target's manifest is built from, so a face without providers is pinned against a literal copy
 * of the manifest it builds today. main()'s file I/O is glue, left to the build.
 */

import fs from 'node:fs';
import path from 'node:path';
import { describe, test, expect } from 'vitest';
import { buildMedia, buildManifest, checkAppinfo, checkPluginKeys, faceBuildInfo, fillWscript, findTargetClash, readDefines, resolveTargets } from './build-manifests';
import type { SharedAppinfo } from './build-manifests';

// a fresh config per test so the mutation check can't be masked by an earlier test
function makeConfig(): SharedAppinfo {
  return {
    displayName: 'Test',
    uuid: 'uuid-1',
    sdkVersion: '3',
    enableMultiJS: true,
    targetPlatforms: ['emery'],
    capabilities: ['health'],
    messageKeys: ['ALPHA', 'BETA'],
    resources: {
      media: [
        { type: 'bitmap', name: 'ICON_ONE', file: 'one.png' },
        { type: 'bitmap', name: 'ICON_TWO', file: 'two.png' },
      ],
    },
  };
}

describe('fillWscript', () => {
  /** A placeholder left unfilled sends waf looking for a folder named after it, and every build in that sandbox fails. */
  test('fills every folder the real template asks for', () => {
    const template = fs.readFileSync(path.join(import.meta.dirname, '..', '..', 'waf', 'wscript.template'), 'utf8');

    const result = fillWscript(template, { engine: 'engine', face: 'gridlock', familyCore: 'core', family: 'mosaic', watchface: true });

    expect(result).not.toContain('{{');
    expect(result).toContain("'engine': 'engine'");
    expect(result).toContain("'face': 'gridlock'");
    expect(result).toContain("'family_core': 'core'");
    expect(result).toContain("'family': 'mosaic'");
  });

  /** A quote in a folder name ended the Python string it was written into, and waf failed on a syntax error far from the cause. */
  test('writes a folder name with a quote or a backslash as a working Python string', () => {
    const template = fs.readFileSync(path.join(import.meta.dirname, '..', '..', 'waf', 'wscript.template'), 'utf8');

    const result = fillWscript(template, { engine: "andrew's lib", face: "andrew's face", familyCore: 'core', family: 'andrews', watchface: true });

    expect(result).toContain("'engine': 'andrew\\'s lib'");
    expect(result).toContain("'face': 'andrew\\'s face'");
  });

  /**
   * An app target that builds without -DBUILD_WATCHAPP compiles a face's launcher-only code out of
   * it, which for Gridlock is the weather request it makes as it opens. The app then shows
   * placeholders until the next half-hourly poll.
   */
  test.each([
    [true, 'WATCHFACE = True'],
    [false, 'WATCHFACE = False'],
  ])('writes the watchface flag as %s the way python reads it', (watchface, expected) => {
    const template = fs.readFileSync(path.join(import.meta.dirname, '..', '..', 'waf', 'wscript.template'), 'utf8');

    const result = fillWscript(template, { engine: 'engine', face: '.', familyCore: '', family: '', watchface });

    expect(result).toContain(expected);
  });
});

describe('buildMedia', () => {
  /** The app's launcher icon is chosen by this flag, so a missed mark ships an app with no menu icon. */
  test('marks the target menu icon entry and leaves the rest alone', () => {
    const config = makeConfig();
    const target = { name: 'app', watchface: false, menuIcon: 'ICON_TWO' };

    const result = buildMedia(config, target);

    expect(result.find((item) => item.name === 'ICON_TWO').menuIcon).toBe(true);
    expect(result.find((item) => item.name === 'ICON_ONE').menuIcon).toBeUndefined();
  });

  /** A menu icon naming a missing resource must fail the build, not ship an app pointing at nothing. */
  test('throws when the menu icon is not in the media list', () => {
    const config = makeConfig();
    const target = { name: 'app', watchface: false, menuIcon: 'ICON_MISSING' };

    const call = () => buildMedia(config, target);

    expect(call).toThrow(/ICON_MISSING is not in the media list/);
  });

  /** main() reuses one config across both targets, so a mutation would leak the app's menu icon onto the watchface. */
  test('does not mutate the input media list', () => {
    const config = makeConfig();
    const target = { name: 'app', watchface: false, menuIcon: 'ICON_TWO' };

    buildMedia(config, target);

    expect(config.resources.media.find((item) => item.name === 'ICON_TWO').menuIcon).toBeUndefined();
  });

  /** The watchface target declares no menu icon, so nothing in its media list should be flagged. */
  test('leaves media unmarked when the target has no menu icon', () => {
    const config = makeConfig();
    const target = { name: 'face', watchface: true };

    const result = buildMedia(config, target);

    expect(result.some((item) => item.menuIcon)).toBe(false);
  });
});

describe('buildManifest', () => {
  /** The SDK copies only the pebble block into appinfo.json, so a list written beside it never reaches the phone. */
  test('puts usesPermissions inside the pebble block', () => {
    const config = makeConfig();
    const target = { name: 'face', watchface: true };

    const result = buildManifest(config, { author: 'x', version: '0' }, target, {}, ['Location']);

    expect(result.pebble.usesPermissions).toEqual(['Location']);
  });

  /** author and version come from the root package, not the build config, so a wrong source ships a mislabeled release. */
  test('takes name from the target and author/version from the root package', () => {
    const config = makeConfig();
    const rootPkg = { author: 'Null Syntax', version: '1.2.3' };
    const target = { name: 'stardate-app', watchface: false };

    const result = buildManifest(config, rootPkg, target);

    expect(result.name).toBe('stardate-app');
    expect(result.author).toBe('Null Syntax');
    expect(result.version).toBe('1.2.3');
  });

  /** A target with its own uuid is how a face and its app install side by side, so the override has to reach the manifest. */
  test('takes a uuid the target names over the shared one', () => {
    const config = makeConfig();
    const rootPkg = { author: 'x', version: '0' };
    const target = { name: 'app', watchface: false, uuid: '11111111-2222-3333-4444-555555555555' };

    const result = buildManifest(config, rootPkg, target);

    expect(result.pebble.uuid).toBe('11111111-2222-3333-4444-555555555555');
  });

  /** The watchface flag lives at pebble.watchapp.watchface, and wrong nesting installs an app as a face or vice versa. */
  test('nests the watchface flag under pebble.watchapp', () => {
    const config = makeConfig();
    const rootPkg = { author: 'x', version: '0' };
    const target = { name: 'face', watchface: true };

    const result = buildManifest(config, rootPkg, target);

    expect(result.pebble.watchapp.watchface).toBe(true);
  });

  /** The media must route through buildMedia so the menu icon is marked in the manifest pebble reads. */
  test('routes media through buildMedia so the menu icon is marked', () => {
    const config = makeConfig();
    const rootPkg = { author: 'x', version: '0' };
    const target = { name: 'app', watchface: false, menuIcon: 'ICON_ONE' };

    const result = buildManifest(config, rootPkg, target);

    expect(result.pebble.resources.media.find((item) => item.name === 'ICON_ONE').menuIcon).toBe(true);
  });

  /** The waf build reads a face's defines off the manifest, so one left behind leaves a raised cap at its default. */
  test('carries the defines into the manifest', () => {
    const config = makeConfig();
    const rootPkg = { author: 'x', version: '0' };
    const target = { name: 'face', watchface: true };

    const result = buildManifest(config, rootPkg, target, { ENGINE_SLOTS_MAX: 12 });

    expect(result).toMatchObject({ defines: { ENGINE_SLOTS_MAX: 12 } });
  });

  /**
   * A manifest that gained an empty defines key would differ from the one already in every sandbox,
   * so a face that sets none would see its package.json rewritten for nothing.
   */
  test('leaves defines out when the face sets none', () => {
    const config = makeConfig();
    const rootPkg = { author: 'x', version: '0' };
    const target = { name: 'face', watchface: true };

    const result = buildManifest(config, rootPkg, target, {});

    expect(result).not.toHaveProperty('defines');
  });

  /** The waf build reads the source defaults from here, so a manifest without them stops the C build of a face that keeps a choice. */
  test('carries the text defines into the manifest beside the defines', () => {
    const config = makeConfig();
    const rootPkg = { author: 'x', version: '0' };
    const target = { name: 'face', watchface: true };

    const result = buildManifest(config, rootPkg, target, { PLUGIN_WEATHER: 1 }, [], { PLUGIN_SOURCE_WEATHER_DEFAULT: 'openmeteo' });

    expect(result).toMatchObject({ defines: { PLUGIN_WEATHER: 1 }, textDefines: { PLUGIN_SOURCE_WEATHER_DEFAULT: 'openmeteo' } });
  });

  /** A face that keeps no source choice would otherwise see its package.json rewritten for nothing. */
  test('leaves textDefines out when there are none', () => {
    const config = makeConfig();
    const rootPkg = { author: 'x', version: '0' };
    const target = { name: 'face', watchface: true };

    const result = buildManifest(config, rootPkg, target, {}, [], {});

    expect(result).not.toHaveProperty('textDefines');
  });
});

describe('readDefines', () => {
  /** A face with nothing to raise has no defines key, and that has to read as none rather than fail. */
  test('reads no defines as empty', () => {
    const config = makeConfig();

    const result = readDefines(config, 'gridlock');

    expect(result).toEqual({});
  });

  /** An empty map is a face that cleared its last define, and it has to build as one that never set any. */
  test('reads an empty defines map as empty', () => {
    const config = { ...makeConfig(), defines: {} };

    const result = readDefines(config, 'gridlock');

    expect(result).toEqual({});
  });

  /**
   * Each name lands on the compiler's command line, so anything but a macro name could pass the
   * compiler another flag, or break the build with an error that never names the appinfo.
   */
  test('refuses a name that is not a macro name, naming the face', () => {
    const config = { ...makeConfig(), defines: { 'ENGINE_SLOTS_MAX -DOTHER': 12 } };

    const call = () => readDefines(config, 'gridlock');

    expect(call).toThrow("gridlock's appinfo defines ENGINE_SLOTS_MAX -DOTHER, which is not a macro name");
  });

  /** A quoted number reads fine in JSON and then sizes the slot arrays with a string the C cannot take. */
  test('refuses a value that is not a whole number', () => {
    const config = { ...makeConfig(), defines: { ENGINE_SLOTS_MAX: '12' } };

    const call = () => readDefines(config, 'gridlock');

    expect(call).toThrow(/ENGINE_SLOTS_MAX as "12", which is not a whole number/);
  });

  /** A HAS_ switch follows from the face's message keys, so setting one by hand would build code for a feature the face lacks. */
  test('refuses a name the build sets itself', () => {
    const config = { ...makeConfig(), defines: { HAS_MESSAGE_KEY_WEATHER_OK: 1 } };

    const call = () => readDefines(config, 'gridlock');

    expect(call).toThrow(/HAS_MESSAGE_KEY_WEATHER_OK, which the build sets itself/);
  });

  /**
   * The build writes the source default from the providers list as text. A number of the face's own
   * under the same name would land on the command line beside it, and the watch would keep a
   * default the page never shows.
   */
  test('refuses a plugin source default, which the build sets itself', () => {
    const config = { ...makeConfig(), defines: { PLUGIN_SOURCE_WEATHER_DEFAULT: 1 } };

    const call = () => readDefines(config, 'gridlock');

    expect(call).toThrow(/PLUGIN_SOURCE_WEATHER_DEFAULT, which the build sets itself/);
  });

  /**
   * The manifest's textDefines come from the providers list alone. A block of the face's own would
   * look like it sets the watch's default and do nothing, so the build says so rather than ignore it.
   */
  test('refuses a textDefines block in the appinfo', () => {
    const config = { ...makeConfig(), textDefines: { PLUGIN_SOURCE_WEATHER_DEFAULT: 'owm' } };

    const call = () => readDefines(config, 'gridlock');

    expect(call).toThrow("gridlock's appinfo sets textDefines, which the build writes itself from the providers list");
  });
});

describe('findTargetClash', () => {
  /** A copied face that kept its name built into the same sandbox, and its .pbw replaced the other's. */
  test('names a target two faces share', () => {
    const result = findTargetClash({ alpha: ['clock'], beta: ['clock'] });

    expect(result).toMatch(/target "clock" is declared by both alpha and beta/);
  });

  /** Two entries in one face's targets map with one name built into one sandbox, and the watchface never came out. */
  test('names a target one face declares twice', () => {
    const result = findTargetClash({ alpha: ['clock', 'clock'] });

    expect(result).toMatch(/target "clock" is declared twice by alpha/);
  });

  /** Unique names build side by side. */
  test('passes unique names', () => {
    const result = findTargetClash({ alpha: ['alpha-face', 'alpha-app'], beta: ['beta'] });

    expect(result).toBeNull();
  });
});

describe('resolveTargets', () => {
  /** The common face inlines one target, so a missing targets map still builds exactly that one .pbw. */
  test('returns the inline single target when there is no targets map', () => {
    const config = { ...makeConfig(), name: 'radar-array', watchface: true };

    const result = resolveTargets(config, 'radar-array');

    expect(result).toEqual([{ name: 'radar-array', watchface: true, menuIcon: undefined }]);
  });

  /** Gridlock ships a watchface and a watchapp from one source, so both sandboxes must come back. */
  test('returns every target from a targets map', () => {
    const config = {
      ...makeConfig(),
      targets: {
        watchface: { name: 'gridlock-face', watchface: true },
        watchapp: { name: 'gridlock-app', watchface: false, menuIcon: 'ICON_ONE' },
      },
    };

    const result = resolveTargets(config, 'gridlock');

    expect(result).toEqual([
      { name: 'gridlock-face', watchface: true },
      { name: 'gridlock-app', watchface: false, menuIcon: 'ICON_ONE' },
    ]);
  });

  /** An empty map built nothing and failed later with a TypeError that named nothing. */
  test('throws on an empty targets map', () => {
    const config = { ...makeConfig(), targets: {} };

    const call = () => resolveTargets(config, 'gridlock');

    expect(call).toThrow(/empty targets map/);
  });

  /** A target with no name built into targets/undefined and shipped undefined.pbw. */
  test('throws on a target with no name', () => {
    const config = { ...makeConfig(), targets: { watchface: { watchface: true } as never } };

    const call = () => resolveTargets(config, 'gridlock');

    expect(call).toThrow(/target "watchface" has no name/);
  });

  /**
   * An appinfo with no identity at all is a build-input mistake, so it must fail loudly not silently,
   * and name the face, since a build of every face otherwise leaves the reader to guess which appinfo.
   */
  test('throws when there is neither a targets map nor a name, naming the face', () => {
    const config = makeConfig();

    const call = () => resolveTargets(config, 'gridlock');

    expect(call).toThrow("gridlock's appinfo declares neither a targets map nor a top-level name");
  });
});

describe('checkPluginKeys', () => {
  // every key both kinds need, so a spec takes one away to see it refused
  const allKeys = ['SETTINGS_REQUEST', 'SETTINGS_FRESH', 'WEATHER_REQUEST', 'WEATHER_TEMPERATURE', 'WEATHER_CONDITIONS', 'WEATHER_OK', 'WEATHER_PROVIDER', 'CALENDAR_STRIP', 'CALENDAR_SOURCE'];

  /**
   * The weather feature runs only with all of its keys declared. A face with the define and a key
   * missing would build fine and then never show plugin weather, so the build has to say so.
   */
  test('refuses PLUGIN_WEATHER without the weather keys', () => {
    const keys = allKeys.filter((key) => key !== 'WEATHER_OK');

    const call = () => checkPluginKeys({ PLUGIN_WEATHER: 1 }, keys, 'gridlock');

    expect(call).toThrow("gridlock's appinfo defines PLUGIN_WEATHER without the message keys it needs: WEATHER_OK");
  });

  /** The plugin choice joins the provider select, so a face without WEATHER_PROVIDER has nowhere to offer it. */
  test('refuses PLUGIN_WEATHER without WEATHER_PROVIDER', () => {
    const keys = allKeys.filter((key) => key !== 'WEATHER_PROVIDER');

    const call = () => checkPluginKeys({ PLUGIN_WEATHER: 1 }, keys, 'gridlock');

    expect(call).toThrow(/PLUGIN_WEATHER without the message keys it needs: WEATHER_PROVIDER/);
  });

  /**
   * Clay saves the calendar source to the watch under its key's number. A face with the define and no
   * CALENDAR_SOURCE key would put a key the phone cannot map into every settings save.
   */
  test('refuses PLUGIN_CALENDAR without CALENDAR_SOURCE', () => {
    const keys = allKeys.filter((key) => key !== 'CALENDAR_SOURCE');

    const call = () => checkPluginKeys({ PLUGIN_CALENDAR: 1 }, keys, 'gridlock');

    expect(call).toThrow(/PLUGIN_CALENDAR without the message keys it needs: CALENDAR_SOURCE/);
  });

  /**
   * The watch keeps the wearer's pick, and only the settings reply hands it back to the phone. A face
   * with no settings of its own and neither settings key would build, and lose the pick on a reinstall.
   */
  test.each(['SETTINGS_REQUEST', 'SETTINGS_FRESH'])('refuses a kept weather choice without %s', (key) => {
    const keys = allKeys.filter((name) => name !== key);

    const call = () => checkPluginKeys({ PLUGIN_WEATHER: 1 }, keys, 'gridlock');

    expect(call).toThrow("gridlock's appinfo defines PLUGIN_WEATHER with WEATHER_PROVIDER, so the watch keeps the wearer's pick, and only the settings reply hands it back to the phone. Declare both SETTINGS_REQUEST and SETTINGS_FRESH in messageKeys and build with --clean");
  });

  /** A face that turned the calendar off with a 0 still builds without the calendar keys. */
  test('passes a plugin define at 0 without its keys', () => {
    const call = () => checkPluginKeys({ PLUGIN_CALENDAR: 0 }, ['SETTINGS_REQUEST'], 'gridlock');

    expect(call).not.toThrow();
  });

  /** An array key such as CALENDAR_STRIP[2] is still the key, and refusing it would stop a face that declares it that way. */
  test('passes a face with every key, one of them in its array form', () => {
    const keys = allKeys.map((key) => (key === 'CALENDAR_STRIP' ? 'CALENDAR_STRIP[2]' : key));

    const call = () => checkPluginKeys({ PLUGIN_WEATHER: 1, PLUGIN_CALENDAR: 1 }, keys, 'gridlock');

    expect(call).not.toThrow();
  });
});

describe('checkPluginKeys in each providers mode', () => {
  const weatherKeys = ['WEATHER_REQUEST', 'WEATHER_TEMPERATURE', 'WEATHER_CONDITIONS', 'WEATHER_OK'];

  /** A plugin only face has no select, so asking it for the select key would refuse the shape the build tells it to take. */
  test('passes plugin only weather without WEATHER_PROVIDER or WEATHER_API_KEY', () => {
    const call = () => checkPluginKeys({ PLUGIN_WEATHER: 1 }, weatherKeys, 'gridlock', { weather: ['plugin'] });

    expect(call).not.toThrow();
  });

  /** A mixed list offers the plugin on the provider select, so a face without that key has nowhere to offer it. */
  test('refuses mixed weather without WEATHER_PROVIDER', () => {
    const call = () => checkPluginKeys({ PLUGIN_WEATHER: 1 }, weatherKeys, 'gridlock', { weather: ['plugin', 'openmeteo'] });

    expect(call).toThrow("gridlock's appinfo defines PLUGIN_WEATHER without the message keys it needs: WEATHER_PROVIDER");
  });

  /** Plugin only still runs the weather feature, which needs its own keys whatever the mode. */
  test('refuses plugin only weather without the weather keys', () => {
    const call = () => checkPluginKeys({ PLUGIN_WEATHER: 1 }, weatherKeys.filter((key) => key !== 'WEATHER_OK'), 'gridlock', { weather: ['plugin'] });

    expect(call).toThrow(/PLUGIN_WEATHER without the message keys it needs: WEATHER_OK/);
  });

  /** A plugin only calendar needs its strip alone, with no select and no iCal link. */
  test('passes a plugin only calendar with CALENDAR_STRIP alone', () => {
    const call = () => checkPluginKeys({ PLUGIN_CALENDAR: 1 }, ['CALENDAR_STRIP'], 'gridlock', { calendar: ['plugin'] });

    expect(call).not.toThrow();
  });

  /** A calendar offering the plugin beside iCal saves the choice under CALENDAR_SOURCE, so the key has to be declared. */
  test('refuses a mixed calendar without CALENDAR_SOURCE', () => {
    const call = () => checkPluginKeys({ PLUGIN_CALENDAR: 1 }, ['CALENDAR_STRIP'], 'gridlock', { calendar: ['plugin', 'ical'] });

    expect(call).toThrow("gridlock's appinfo defines PLUGIN_CALENDAR without the message keys it needs: CALENDAR_SOURCE");
  });

  /** A custom only face with no define carries no plugin code, so it needs nothing beyond today's keys. */
  test('passes custom only weather and an iCal only calendar without a define', () => {
    const call = () => checkPluginKeys({}, [...weatherKeys, 'CALENDAR_STRIP'], 'gridlock', { weather: ['openmeteo'], calendar: ['ical'] });

    expect(call).not.toThrow();
  });
});

describe('checkAppinfo', () => {
  // a face with weather, stocks, and the time zone picker, which every kind's narrowing touches
  function faceConfig(extra: Partial<SharedAppinfo> = {}): SharedAppinfo & { name: string } {
    return { ...makeConfig(), name: 'gridlock', messageKeys: ['WEATHER_REQUEST', 'WEATHER_PROVIDER', 'STOCK_STRIP', 'CLOCK_TIMEZONE_1'], ...extra };
  }

  /**
   * A face without providers has to build the manifest it builds today, byte for byte. This is the
   * manifest such a face wrote before the list existed, written out whole.
   */
  test('builds a face without providers the manifest it builds today', () => {
    const config = faceConfig({ messageKeys: ['WEATHER_REQUEST', 'WEATHER_PROVIDER', 'STOCK_STRIP'] });
    const checked = checkAppinfo(config, 'gridlock');

    const result = JSON.stringify(buildManifest(config, { author: 'x', version: '1.0.0' }, { name: 'gridlock', watchface: true }, checked.defines, checked.permissions, checked.textDefines));

    expect(result).toBe('{"name":"gridlock","author":"x","version":"1.0.0","private":true,"pebble":{"displayName":"Test","uuid":"uuid-1","sdkVersion":"3","enableMultiJS":true,"targetPlatforms":["emery"],"watchapp":{"watchface":true},"capabilities":["health"],"messageKeys":["WEATHER_REQUEST","WEATHER_PROVIDER","STOCK_STRIP"],"resources":{"media":[{"type":"bitmap","name":"ICON_ONE","file":"one.png"},{"type":"bitmap","name":"ICON_TWO","file":"two.png"}]},"usesPermissions":["Location",{"name":"Internet","parameters":{"domains":["open-meteo.com","openweathermap.org","weatherapi.com","alphavantage.co","finnhub.io","twelvedata.com","yahoo.com"]}}]}}');
  });

  /** The SDK copies only the pebble block, so providers has to stay out of the manifest the way defines does. */
  test('narrows the permissions to a face\'s providers and keeps the list out of the manifest', () => {
    const config = faceConfig({ providers: { weather: ['openmeteo'], stocks: ['yahoo'] } });
    const checked = checkAppinfo(config, 'gridlock');

    const result = buildManifest(config, { author: 'x', version: '1.0.0' }, { name: 'gridlock', watchface: true }, checked.defines, checked.permissions);

    expect(result.pebble.usesPermissions).toEqual(['Location', { name: 'Internet', parameters: { domains: ['open-meteo.com', 'yahoo.com'] } }]);
    expect(JSON.stringify(result)).not.toContain('providers');
  });

  /** writeSandboxes runs this before any target, so a refusal here is what stops the build before anything is written. */
  test('refuses a providers list it cannot build with', () => {
    const config = faceConfig({ providers: { stock: ['yahoo'] } });

    const call = () => checkAppinfo(config, 'gridlock');

    expect(call).toThrow("gridlock's appinfo providers names stock, which is not a kind it knows");
  });

  /** A keyed first provider builds, and the face developer hears about the No API Key it starts on. */
  test('carries the warnings for a keyed first provider', () => {
    const config = faceConfig({ providers: { stocks: ['finnhub', 'yahoo'] } });

    const result = checkAppinfo(config, 'gridlock').warnings;

    expect(result).toEqual([expect.stringContaining("gridlock's appinfo providers.stocks lists finnhub as its first custom provider")]);
  });

  /** The permissions warning reaches the build log through the same list as the providers ones. */
  test('carries the warning for a plugin only weather face with a location search key', () => {
    const config = faceConfig({ messageKeys: ['WEATHER_REQUEST', 'WEATHER_TEMPERATURE', 'WEATHER_CONDITIONS', 'WEATHER_OK', 'LOCATION_NAME'], defines: { PLUGIN_WEATHER: 1 }, providers: { weather: ['plugin'] } });

    const result = checkAppinfo(config, 'gridlock').warnings;

    expect(result).toEqual([expect.stringContaining("gridlock's appinfo lists providers.weather as [\"plugin\"] and declares LOCATION_NAME")]);
  });

  /**
   * writeTarget hands these to every target's manifest. A face with a mixed list keeps its weather
   * choice on the watch, so without the default the waf build has no string to give the C.
   */
  test('works out the source default the watch keeps from a mixed weather list', () => {
    const config = faceConfig({ messageKeys: ['SETTINGS_REQUEST', 'SETTINGS_FRESH', 'WEATHER_REQUEST', 'WEATHER_TEMPERATURE', 'WEATHER_CONDITIONS', 'WEATHER_OK', 'WEATHER_PROVIDER'], defines: { PLUGIN_WEATHER: 1 }, providers: { weather: ['plugin', 'weatherapi', 'openmeteo'] } });

    const result = checkAppinfo(config, 'gridlock').textDefines;

    expect(result).toEqual({ PLUGIN_SOURCE_WEATHER_DEFAULT: 'weatherapi' });
  });
});

describe('faceBuildInfo', () => {
  /** The phone build reads the providers from here, so a list it skipped checking could reach the bundle unchecked. */
  test('carries the checked providers beside the targets and defines', () => {
    const config = { ...makeConfig(), name: 'gridlock', messageKeys: ['WEATHER_REQUEST'], defines: { PLUGIN_WEATHER: 1 }, providers: { weather: ['plugin'] } };

    const result = faceBuildInfo(config, 'gridlock');

    expect(result).toEqual({ targets: ['gridlock'], defines: { PLUGIN_WEATHER: 1 }, providers: { weather: ['plugin'] } });
  });

  /** The phone build stops on the same refusals as the manifest build, so neither can run ahead of the other. */
  test('refuses a list the manifest build would refuse', () => {
    const config = { ...makeConfig(), name: 'gridlock', messageKeys: ['WEATHER_REQUEST'], providers: { weather: ['plugin'] } };

    const call = () => faceBuildInfo(config, 'gridlock');

    expect(call).toThrow("gridlock's appinfo lists plugin in providers.weather without PLUGIN_WEATHER turned on");
  });
});

describe('checkPluginKeys for the kinds only a plugin fills', () => {
  const musicKeys = ['MUSIC_TITLE', 'MUSIC_ARTIST', 'MUSIC_PLAYING', 'MUSIC_REQUEST'];
  const phoneKeys = ['PHONE_BATTERY', 'PHONE_REQUEST'];

  /** The music store asks and reads with all four keys, so a define missing one would build and never show a track. */
  test('refuses PLUGIN_MUSIC without all four music keys', () => {
    const keys = musicKeys.filter((key) => key !== 'MUSIC_PLAYING');

    const call = () => checkPluginKeys({ PLUGIN_MUSIC: 1 }, keys, 'gridlock');

    expect(call).toThrow("gridlock's appinfo defines PLUGIN_MUSIC without the message keys it needs: MUSIC_PLAYING");
  });

  /** The phone store asks with PHONE_REQUEST, so a battery key alone would build and never show a level. */
  test('refuses PLUGIN_PHONE with PHONE_BATTERY alone', () => {
    const call = () => checkPluginKeys({ PLUGIN_PHONE: 1 }, ['PHONE_BATTERY'], 'gridlock');

    expect(call).toThrow(/PLUGIN_PHONE without the message keys it needs: PHONE_REQUEST/);
  });

  /** With no plugin code behind them the watch would ask and wait forever, and its panel would stay empty. */
  test('refuses the music keys without PLUGIN_MUSIC', () => {
    const call = () => checkPluginKeys({}, musicKeys, 'gridlock');

    expect(call).toThrow("gridlock's appinfo declares MUSIC_TITLE, MUSIC_ARTIST, MUSIC_PLAYING, MUSIC_REQUEST without PLUGIN_MUSIC, and only that plugin fills them. Add \"PLUGIN_MUSIC\": 1 to its defines, or take the keys out of messageKeys");
  });

  /** A define switched off with a 0 is off, so its keys left behind are refused the same way. */
  test('refuses the phone keys with PLUGIN_PHONE at 0', () => {
    const call = () => checkPluginKeys({ PLUGIN_PHONE: 0 }, phoneKeys, 'gridlock');

    expect(call).toThrow(/declares PHONE_BATTERY, PHONE_REQUEST without PLUGIN_PHONE/);
  });

  /** One stray key is as dead as the whole set, so a partial set without the define is refused too. */
  test('refuses a part of the music keys without PLUGIN_MUSIC', () => {
    const call = () => checkPluginKeys({}, ['MUSIC_TITLE'], 'gridlock');

    expect(call).toThrow(/declares MUSIC_TITLE without PLUGIN_MUSIC/);
  });

  /** The weather keys work without plugins, so they are never refused for a missing PLUGIN_WEATHER. */
  test('passes the weather keys without PLUGIN_WEATHER', () => {
    const call = () => checkPluginKeys({}, ['WEATHER_REQUEST', 'WEATHER_TEMPERATURE', 'WEATHER_CONDITIONS', 'WEATHER_OK', 'CALENDAR_STRIP'], 'gridlock');

    expect(call).not.toThrow();
  });

  /** A face with both defines and every key builds. */
  test('passes both defines with every key', () => {
    const call = () => checkPluginKeys({ PLUGIN_MUSIC: 1, PLUGIN_PHONE: 1 }, [...musicKeys, ...phoneKeys], 'gridlock');

    expect(call).not.toThrow();
  });
});
