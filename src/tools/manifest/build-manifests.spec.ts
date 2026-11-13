/**
 * Specs for the manifest builder's pure steps.
 *
 * buildMedia owns the per-target media list: which entry gets the menuIcon flag, and the
 * deep-clone that keeps one target's flag from bleeding onto the other. buildManifest is the
 * package.json wire shape pebble build reads. fillWscript is the only place a sandbox learns where
 * its framework and face sit. readDefines guards what a face hands the compiler, since each define
 * lands on its command line. checkPluginKeys refuses the keys only a plugin fills without its define.
 * checkAppinfo is what every target's manifest is built from, so a face without providers is pinned
 * against a literal copy of the manifest it builds today, and it is where the checks against the
 * message keys run, on the keys the build adds as well as the face's own. A plugin app's manifest is
 * pinned the same way, since the Pebble app reads its permissions and plugin block exactly as written,
 * and checkPluginApp is what keeps a plugin app from building as a broken watchface. main()'s file I/O
 * is glue, left to the build.
 */

import fs from 'node:fs';
import path from 'node:path';
import { describe, test, expect } from 'vitest';
import { buildMedia, buildManifest, buildPluginManifest, checkAppinfo, checkPluginApp, checkPluginKeys, faceBuildInfo, fillWscript, findTargetClash, isPluginApp, keysChanged, prepareAppinfo, readDefines, recordBuiltKeys, resolveTargets } from './build-manifests';
import { fillAppinfo } from './feature-keys';
import type { SharedAppinfo } from './build-manifests';
import { tempDir } from '../../ts/testing/temp-dir.ts';

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

  /** A dev switch in the appinfo would turn the fixture on in a build without --dev, a release's included. */
  test('refuses a dev switch, which the build sets from --dev', () => {
    const config = { ...makeConfig(), defines: { DEV_MODE: 1 } };

    const call = () => readDefines(config, 'gridlock');

    expect(call).toThrow("gridlock's appinfo defines DEV_MODE, which the build sets itself from the dev switches. Take it out of the appinfo, and build with paf build gridlock --dev for dev mode");
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

describe('checkAppinfo', () => {
  // the four keys weather needs, which the key group check refuses in part
  const WEATHER_KEYS = ['WEATHER_REQUEST', 'WEATHER_TEMPERATURE', 'WEATHER_CONDITIONS', 'WEATHER_OK'];

  // a face with weather, stocks, and the time zone picker, which every kind's narrowing touches
  function faceConfig(extra: Partial<SharedAppinfo> = {}): SharedAppinfo & { name: string } {
    return { ...makeConfig(), name: 'gridlock', messageKeys: [...WEATHER_KEYS, 'WEATHER_PROVIDER', 'STOCK_STRIP', 'CLOCK_TIMEZONE_1'], ...extra };
  }

  /**
   * A face without providers has to build the manifest it builds today, byte for byte. This is the
   * manifest such a face wrote before the list existed, written out whole.
   */
  test('builds a face without providers the manifest it builds today', () => {
    const config = faceConfig({ messageKeys: [...WEATHER_KEYS, 'WEATHER_PROVIDER', 'STOCK_STRIP'] });
    const checked = checkAppinfo(config, 'gridlock');

    const result = JSON.stringify(buildManifest(config, { author: 'x', version: '1.0.0' }, { name: 'gridlock', watchface: true }, checked.defines, checked.permissions, checked.textDefines));

    expect(result).toBe('{"name":"gridlock","author":"x","version":"1.0.0","private":true,"pebble":{"displayName":"Test","uuid":"uuid-1","sdkVersion":"3","enableMultiJS":true,"targetPlatforms":["emery"],"watchapp":{"watchface":true},"capabilities":["health"],"messageKeys":["WEATHER_REQUEST","WEATHER_TEMPERATURE","WEATHER_CONDITIONS","WEATHER_OK","WEATHER_PROVIDER","STOCK_STRIP"],"resources":{"media":[{"type":"bitmap","name":"ICON_ONE","file":"one.png"},{"type":"bitmap","name":"ICON_TWO","file":"two.png"}]},"usesPermissions":["Location",{"name":"Internet","parameters":{"domains":["open-meteo.com","openweathermap.org","weatherapi.com","alphavantage.co","finnhub.io","twelvedata.com","yahoo.com"]}}]}}');
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

  /** writeSandboxes runs this before any target, so a key group check that dropped out of it would let a partial group reach pebble build. */
  test('refuses a weather group declared in part', () => {
    const config = faceConfig({ messageKeys: [...WEATHER_KEYS, 'WEATHER_SUNRISE', 'WEATHER_SUNSET'] });

    const call = () => checkAppinfo(config, 'gridlock');

    expect(call).toThrow("gridlock's appinfo declares only part of the weather extras. Add WEATHER_HUMIDITY, WEATHER_WIND_SPEED, and WEATHER_WIND_DIR to messageKeys");
  });

  /** writeTarget hands these to every target's manifest, so a dev switch read here is one every target gets. */
  test('reads the dev switches from the unit\'s paf.dev.config.json on a dev build', () => {
    const unit = tempDir('check-appinfo-');

    fs.writeFileSync(path.join(unit, 'paf.config.json'), JSON.stringify({ plugins: { dev: {} } }));
    fs.writeFileSync(path.join(unit, 'paf.dev.config.json'), JSON.stringify({ walk: 'themes' }));

    const result = checkAppinfo(faceConfig(), 'gridlock', unit, true).devDefines;

    expect(result).toEqual({ DEV_MODE: 1, DEV_TIME_HOUR: 8, DEV_TIME_MIN: 0, DEV_TAP_WALK_THEMES: 1 });
  });

  /** The harness file is committed, so a build that does not ask for dev mode has to build each target with it off. */
  test('leaves dev mode off when the build does not ask for it', () => {
    const unit = tempDir('check-appinfo-');

    fs.writeFileSync(path.join(unit, 'paf.config.json'), JSON.stringify({ plugins: { dev: {} } }));
    fs.writeFileSync(path.join(unit, 'paf.dev.config.json'), JSON.stringify({ walk: 'themes' }));

    const result = checkAppinfo(faceConfig(), 'gridlock', unit).devDefines;

    expect(result).toEqual({ DEV_MODE: 0 });
  });

  /** writeSandboxes runs this before any target, so a dev setting the build cannot read stops it before anything is written. */
  test('refuses dev settings it cannot read on a dev build', () => {
    const unit = tempDir('check-appinfo-');

    fs.writeFileSync(path.join(unit, 'paf.config.json'), JSON.stringify({ plugins: { dev: {} } }));
    fs.writeFileSync(path.join(unit, 'paf.dev.config.json'), JSON.stringify({ clock: '8:00' }));

    const call = () => checkAppinfo(faceConfig(), 'gridlock', unit, true);

    expect(call).toThrow(`${path.basename(unit)}/paf.dev.config.json sets clock to "8:00"`);
  });

  /** The phone build no longer checks the settings pair, so a pair checked nowhere else would reach pebble build in part. */
  test('refuses SETTINGS_REQUEST without SETTINGS_FRESH', () => {
    const config = faceConfig({ messageKeys: ['SETTINGS_REQUEST'] });

    const call = () => checkAppinfo(config, 'gridlock');

    expect(call).toThrow("gridlock's appinfo declares only part of the settings reply. Add SETTINGS_FRESH to messageKeys");
  });

  /**
   * A face that leaves the weather keys to the feature lists only the extras. Checked on its own list
   * the extras would be refused as weather groups with no weather, so the checks have to see the keys
   * the build adds.
   */
  test('passes the weather extras once the feature has brought the weather keys', () => {
    const extras = ['WEATHER_HUMIDITY', 'WEATHER_WIND_SPEED', 'WEATHER_WIND_DIR', 'WEATHER_SUNRISE', 'WEATHER_SUNSET'];
    const config = fillAppinfo(faceConfig({ messageKeys: extras }), 'gridlock', { started: true, featureKeys: WEATHER_KEYS }, {}, {});

    const call = () => checkAppinfo(config, 'gridlock');

    expect(call).not.toThrow();
  });

  /**
   * writeTarget hands these to every target's manifest. A face with a mixed list keeps its weather
   * choice on the watch, so without the default the waf build has no string to give the C.
   */
  test('works out the source default the watch keeps from a mixed weather list', () => {
    const config = faceConfig({ messageKeys: ['WEATHER_REQUEST', 'WEATHER_TEMPERATURE', 'WEATHER_CONDITIONS', 'WEATHER_OK', 'WEATHER_PROVIDER'], defines: { PLUGIN_WEATHER: 1 }, providers: { weather: ['plugin', 'weatherapi', 'openmeteo'] } });

    const result = checkAppinfo(config, 'gridlock').textDefines;

    expect(result).toEqual({ PLUGIN_SOURCE_WEATHER_DEFAULT: 'weatherapi' });
  });
});

describe('checkAppinfo for PLUGIN_STOCKS', () => {
  // a face whose quotes come from a plugin alone, which declares neither the select nor a provider key
  function stockFace(providers: unknown, messageKeys: string[] = ['STOCK_STRIP', 'STOCK_REQUEST']): SharedAppinfo & { name: string } {
    return { ...makeConfig(), name: 'gridlock', messageKeys, defines: { PLUGIN_STOCKS: 1 }, providers };
  }

  /**
   * A plugin only list is the define's whole point for a face that wants no provider at all. It has
   * to build with no stock site on the install prompt and no choice kept on the watch.
   */
  test('builds a plugin only stock list with no site and no kept choice', () => {
    const checked = checkAppinfo(stockFace({ stocks: ['plugin'] }), 'gridlock');

    const result = { permissions: checked.permissions, textDefines: checked.textDefines };

    expect(result).toEqual({ permissions: [], textDefines: {} });
  });

  /** A mixed list keeps the pick on the watch, so without the default the waf build has no string to give the C. */
  test('works out the stock source default the watch keeps from a mixed list', () => {
    const checked = checkAppinfo(stockFace({ stocks: ['plugin', 'yahoo'] }, ['STOCK_STRIP', 'STOCK_REQUEST', 'STOCK_PROVIDER']), 'gridlock');

    const result = { permissions: checked.permissions, textDefines: checked.textDefines };

    expect(result).toEqual({ permissions: [{ name: 'Internet', parameters: { domains: ['yahoo.com'] } }], textDefines: { PLUGIN_SOURCE_STOCK_DEFAULT: 'yahoo' } });
  });

  /** A plugin only list keeps no choice on the watch, so the select key a face lists itself would ride every save for nothing. */
  test('refuses a plugin only stock list beside STOCK_PROVIDER', () => {
    const call = () => checkAppinfo(stockFace({ stocks: ['plugin'] }, ['STOCK_STRIP', 'STOCK_REQUEST', 'STOCK_PROVIDER']), 'gridlock');

    expect(call).toThrow("gridlock's appinfo lists providers.stocks as [\"plugin\"] and still declares STOCK_PROVIDER");
  });

  /** A define with no plugin in the list would ship the plugin code with nothing on the page to pick it. */
  test('refuses PLUGIN_STOCKS beside a stock list without plugin', () => {
    const call = () => checkAppinfo(stockFace({ stocks: ['yahoo'] }), 'gridlock');

    expect(call).toThrow("gridlock's appinfo defines PLUGIN_STOCKS, but providers.stocks does not list plugin");
  });
});

describe('prepareAppinfo', () => {
  /**
   * The build runs this before the phone build. A face that leaves the weather keys to the feature
   * lists only the extras, so a key group check here would refuse it before its features were read.
   */
  test.each([
    ['the weather extras without weather', ['WEATHER_HUMIDITY', 'WEATHER_WIND_SPEED', 'WEATHER_WIND_DIR', 'WEATHER_SUNRISE', 'WEATHER_SUNSET']],
    ['a part of the weather keys', ['WEATHER_OK']],
  ])('passes %s, which the features can still complete', (_name, messageKeys) => {
    const config = { ...makeConfig(), name: 'gridlock', messageKeys };

    const call = () => prepareAppinfo(config, 'gridlock');

    expect(call).not.toThrow();
  });

  /**
   * None of these needs the keys the features bring, so each is refused before the phone build compiles
   * anything, and a refusal leaves every sandbox as it was.
   */
  test.each([
    ['a usesPermissions that is not a list', { usesPermissions: 'Internet' }, "gridlock's appinfo usesPermissions has to be a list"],
    ['calendar hosts beside a bare Internet', { providers: { calendar: ['ical'], calendarHosts: ['google.com'] }, usesPermissions: ['Internet'] }, "gridlock's appinfo lists providers.calendarHosts while its own usesPermissions opens Internet to any site"],
    ['a part of the settings pair', { messageKeys: ['SETTINGS_REQUEST'] }, "gridlock's appinfo declares only part of the settings reply"],
    ['a part of the coordinates', { messageKeys: ['LOCATION_LATITUDE'] }, "gridlock's appinfo declares only part of coordinates"],
    ['a part of the weather extras', { messageKeys: ['WEATHER_SUNRISE'] }, "gridlock's appinfo declares only part of the weather extras"],
    ['a plugin only list beside its select key', { messageKeys: ['WEATHER_PROVIDER'], defines: { PLUGIN_WEATHER: 1 }, providers: { weather: ['plugin'] } }, "gridlock's appinfo lists providers.weather as [\"plugin\"] and still declares WEATHER_PROVIDER"],
  ])('refuses %s before the features are read', (_name, extra, message) => {
    const config = { ...makeConfig(), name: 'gridlock', ...extra };

    const call = () => prepareAppinfo(config, 'gridlock');

    expect(call).toThrow(message);
  });

  /** A plugin's keys are its define's alone, so a stray one is refused before the phone build compiles anything. */
  test('refuses the music keys without PLUGIN_MUSIC', () => {
    const config = { ...makeConfig(), name: 'gridlock', messageKeys: ['MUSIC_TITLE'] };

    const call = () => prepareAppinfo(config, 'gridlock');

    expect(call).toThrow(/declares MUSIC_TITLE without PLUGIN_MUSIC/);
  });

  /** A dev setting the build cannot read has to stop it before the phone build writes into the sandboxes. */
  test('refuses dev settings it cannot read on a dev build', () => {
    const unit = tempDir('prepare-appinfo-');

    fs.writeFileSync(path.join(unit, 'paf.config.json'), JSON.stringify({ plugins: { dev: {} } }));
    fs.writeFileSync(path.join(unit, 'paf.dev.config.json'), JSON.stringify({ clock: '8:00' }));

    const call = () => prepareAppinfo({ ...makeConfig(), name: 'gridlock' }, 'gridlock', unit, true);

    expect(call).toThrow(`${path.basename(unit)}/paf.dev.config.json sets clock to "8:00"`);
  });

  /** checkAppinfo works from what this read, so the dev switches and the providers reach every target from one read. */
  test('hands checkAppinfo the dev defines it read', () => {
    const unit = tempDir('prepare-appinfo-');
    const config = { ...makeConfig(), name: 'gridlock' };

    fs.writeFileSync(path.join(unit, 'paf.config.json'), JSON.stringify({ plugins: { dev: {} } }));
    fs.writeFileSync(path.join(unit, 'paf.dev.config.json'), JSON.stringify({}));

    const result = checkAppinfo(config, 'gridlock', '/no/such/unit', false, prepareAppinfo(config, 'gridlock', unit, true)).devDefines;

    expect(result).toEqual({ DEV_MODE: 1, DEV_TIME_HOUR: 8, DEV_TIME_MIN: 0 });
  });
});

describe('the built keys record', () => {
  /** A sandbox that never passed a build here may hold build output from other keys, so it has to start clean. */
  test('counts a sandbox with no record as changed', () => {
    const sandbox = tempDir('built-keys-');

    const result = keysChanged(sandbox, ['WEATHER_REQUEST']);

    expect(result).toBe(true);
  });

  /** An unchanged list after a passing build has to build on, or every build would start clean. */
  test('counts the keys a passing build recorded as unchanged', () => {
    const sandbox = tempDir('built-keys-');

    recordBuiltKeys(sandbox, ['WEATHER_REQUEST', 'WEATHER_OK']);

    const result = keysChanged(sandbox, ['WEATHER_REQUEST', 'WEATHER_OK']);

    expect(result).toBe(false);
  });

  /** The same keys in another order are other numbers on the watch, so they need a clean as much as a new key does. */
  test('counts the same keys in another order as changed', () => {
    const sandbox = tempDir('built-keys-');

    recordBuiltKeys(sandbox, ['WEATHER_REQUEST', 'WEATHER_OK']);

    const result = keysChanged(sandbox, ['WEATHER_OK', 'WEATHER_REQUEST']);

    expect(result).toBe(true);
  });
});

describe('faceBuildInfo', () => {
  /** The phone build reads the providers from here, so a list it skipped checking could reach the bundle unchecked. */
  test('carries the checked providers beside the targets and defines', () => {
    const config = { ...makeConfig(), name: 'gridlock', messageKeys: ['WEATHER_REQUEST', 'WEATHER_TEMPERATURE', 'WEATHER_CONDITIONS', 'WEATHER_OK'], defines: { PLUGIN_WEATHER: 1 }, providers: { weather: ['plugin'] } };

    const result = faceBuildInfo(config, 'gridlock');

    expect(result).toEqual({ targets: ['gridlock'], defines: { PLUGIN_WEATHER: 1 }, providers: { weather: ['plugin'] } });
  });

  /** The phone build stops on the same refusals as the manifest build, so neither can run ahead of the other. */
  test('refuses a list the manifest build would refuse', () => {
    const config = { ...makeConfig(), name: 'gridlock', messageKeys: ['WEATHER_REQUEST', 'WEATHER_TEMPERATURE', 'WEATHER_CONDITIONS', 'WEATHER_OK'], providers: { weather: ['plugin'] } };

    const call = () => faceBuildInfo(config, 'gridlock');

    expect(call).toThrow("gridlock's appinfo lists plugin in providers.weather without PLUGIN_WEATHER turned on");
  });

  /**
   * The phone build reads this before the build knows the keys the features bring, so a face that
   * lists the extras and leaves the weather keys to the feature would be refused before it compiled.
   */
  test('reads no message key, so the extras pass without the weather keys', () => {
    const config = { ...makeConfig(), name: 'gridlock', messageKeys: ['WEATHER_SUNRISE'], providers: { stocks: ['yahoo'] } };

    const call = () => faceBuildInfo(config, 'gridlock');

    expect(call).not.toThrow();
  });
});

describe('checkPluginKeys for the kinds only a plugin fills', () => {
  const musicKeys = ['MUSIC_TITLE', 'MUSIC_ARTIST', 'MUSIC_PLAYING', 'MUSIC_REQUEST'];
  const phoneKeys = ['PHONE_BATTERY', 'PHONE_REQUEST'];

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

  /** Album art only comes from a music plugin, so the art key on its own would leave the watch waiting on a bitmap that never comes. */
  test('refuses the album art key without PLUGIN_MUSIC', () => {
    const call = () => checkPluginKeys({}, ['MUSIC_ARTWORK'], 'gridlock');

    expect(call).toThrow(/declares MUSIC_ARTWORK without PLUGIN_MUSIC/);
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

describe('plugin apps', () => {
  type AnyAppinfo = Parameters<typeof checkAppinfo>[0];

  // a plugin app as Calendar + iCal declares it, with a permission reason and a source asking Calendar of its callers
  function pluginConfig(extra: Record<string, unknown> = {}): AnyAppinfo {
    return {
      name: 'calendar-ical',
      displayName: 'Calendar + iCal',
      uuid: 'uuid-2',
      sdkVersion: '3',
      projectType: 'plugin',
      configPage: 'config.html',
      usesPermissions: [{ name: 'Calendar', reason: 'To merge your phone calendars', required: true }],
      plugin: {
        description: 'Phone calendars and iCal links.',
        sources: [{ category: 'calendar', items: ['event'], properties: { name: ['longText'] }, supportsMultiple: true, callerPermissions: ['Calendar'] }],
      },
      ...extra,
    } as unknown as AnyAppinfo;
  }

  /** A plugin app has no keys, defines, or watch code, so the prepare step reads none of them and gives it no dev defines. */
  test('prepares a plugin app with no dev defines and no key checks', () => {
    const result = prepareAppinfo(pluginConfig(), 'calendar-ical');

    expect(result).toEqual({ targets: ['calendar-ical'], defines: {}, providers: {}, devDefines: {}, devSwitches: null });
  });

  /** A plugin app has no paf.dev.config.json entry to read, so a dev build reads none, and buildOne decides what --dev does with it. */
  test('prepares a plugin app on a dev build with no dev defines', () => {
    const result = prepareAppinfo(pluginConfig(), 'calendar-ical', '/no/such/unit', true);

    expect(result.devDefines).toEqual({});
  });

  /** A plugin app built as a watchface stops partway in the SDK build, so only projectType plugin may count as one. */
  test.each([
    ['plugin', true],
    ['native', false],
    [undefined, false],
  ])('reads projectType %s as a plugin app: %s', (projectType, expected) => {
    const result = isPluginApp({ projectType });

    expect(result).toBe(expected);
  });

  /**
   * The Pebble app reads the reason and required flag on each permission and the callerPermissions on
   * each source, and refuses a plugin's read of the phone calendar without them. The framework's own
   * permission type has neither, so the manifest is pinned whole.
   */
  test('builds the manifest with the permissions and plugin block as written', () => {
    const config = pluginConfig();

    const result = JSON.stringify(buildPluginManifest(config, { author: 'x', version: '1.0.0' }, checkAppinfo(config, 'calendar-ical').permissions));

    expect(result).toBe('{"name":"calendar-ical","author":"x","version":"1.0.0","private":true,"pebble":{"displayName":"Calendar + iCal","uuid":"uuid-2","sdkVersion":"3","projectType":"plugin","configPage":"config.html","usesPermissions":[{"name":"Calendar","reason":"To merge your phone calendars","required":true}],"plugin":{"description":"Phone calendars and iCal links.","sources":[{"category":"calendar","items":["event"],"properties":{"name":["longText"]},"supportsMultiple":true,"callerPermissions":["Calendar"]}],"script":"plugin.js"}}}');
  });

  /** The SDK takes an empty list as a plugin that reaches nothing, so no permissions leaves the key out rather than writing one. */
  test('leaves usesPermissions out when the plugin app lists none', () => {
    const config = pluginConfig({ usesPermissions: [] });

    const result = buildPluginManifest(config, { author: 'x', version: '1.0.0' }, checkAppinfo(config, 'calendar-ical').permissions);

    expect(result.pebble).not.toHaveProperty('usesPermissions');
  });

  /** The SDK builds a plugin with no platforms and its own resources, so a field only watch code reads would sit in the pbw meaning nothing. */
  test.each(['messageKeys', 'resources', 'defines', 'providers', 'targets', 'targetPlatforms'])('refuses %s on a plugin app, naming it', (field) => {
    const config = pluginConfig({ [field]: [] });

    const result = () => checkPluginApp(config, 'calendar-ical');

    expect(result).toThrow(`calendar-ical is a plugin app, which has no watch code, so its appinfo cannot set ${field}. Take it out`);
  });

  /** The SDK refuses to configure a plugin project with no plugin block, far from the appinfo that caused it. */
  test('refuses a plugin app with no plugin block', () => {
    const config = pluginConfig({ plugin: undefined });

    const result = () => checkPluginApp(config, 'calendar-ical');

    expect(result).toThrow(/calendar-ical is a plugin app whose appinfo has no plugin block/);
  });

  /** The build writes the script as plugin.js, so a plugin block naming another would build a pbw without its script. */
  test('refuses a plugin block naming another script', () => {
    const config = pluginConfig({ plugin: { script: 'main.js', sources: [{ category: 'calendar', items: ['event'] }] } });

    const result = () => checkPluginApp(config, 'calendar-ical');

    expect(result).toThrow(/names its script "main\.js", but the build writes it as plugin\.js/);
  });

  /** The build writes the settings page as config.html, so another local name would point the Pebble app at a missing page. */
  test('refuses a local settings page by another name', () => {
    const config = pluginConfig({ configPage: 'settings.html' });

    const result = () => checkPluginApp(config, 'calendar-ical');

    expect(result).toThrow(/names its settings page "settings\.html", but the build writes it as config\.html/);
  });

  /** A plugin app declares no message keys, so the key group and plugin key checks a face runs would refuse it for nothing. */
  test('checks a plugin app by its own rules rather than a face\'s', () => {
    const config = pluginConfig();

    const result = checkAppinfo(config, 'calendar-ical');

    expect(result).toEqual({
      targets: ['calendar-ical'],
      defines: {},
      providers: {},
      permissions: [{ name: 'Calendar', reason: 'To merge your phone calendars', required: true }],
      textDefines: {},
      devDefines: {},
      devSwitches: null,
      warnings: [],
    });
  });

  /** The phone build reads faceBuildInfo too, so a plugin app with no name has to hear what a plugin app needs there as well. */
  test('tells a plugin app with no name what a plugin app needs', () => {
    const config = pluginConfig({ name: undefined });

    const result = () => faceBuildInfo(config, 'calendar-ical');

    expect(result).toThrow('calendar-ical is a plugin app whose appinfo has no name');
  });

  /**
   * A misspelled projectType built the plugin as a watchface, which then failed on resources it never had.
   * The clash check and --targets read targets before anything else, so the refusal has to come from there.
   */
  test('refuses a projectType it does not know wherever its targets are read', () => {
    const config = pluginConfig({ projectType: 'Plugin' });

    const result = () => resolveTargets(config, 'calendar-ical');

    expect(result).toThrow(/sets projectType "Plugin", which the build does not know/);
  });

  /** `pebble new-project` writes projectType native for a watchface, and refusing it stopped faces started that way from building. */
  test('builds a face that sets projectType native as a face', () => {
    const config = { ...makeConfig(), name: 'gridlock', projectType: 'native' } as unknown as AnyAppinfo;

    const result = faceBuildInfo(config, 'gridlock');

    expect(result.targets).toEqual(['gridlock']);
  });

  /** The clash check and --targets read targets through resolveTargets, so a plugin app's targets map is refused there rather than clash checked. */
  test('refuses a targets map on a plugin app wherever its targets are read', () => {
    const config = pluginConfig({ targets: { one: { name: 'one', watchface: false } } });

    const result = () => resolveTargets(config, 'calendar-ical');

    expect(result).toThrow('calendar-ical is a plugin app, which has no watch code, so its appinfo cannot set targets. Take it out');
  });

});
