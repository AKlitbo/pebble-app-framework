/**
 * Specs for the manifest builder's pure steps.
 *
 * buildMedia owns the per-target media list: which entry gets the menuIcon flag, and the
 * deep-clone that keeps one target's flag from bleeding onto the other. buildManifest is the
 * package.json wire shape pebble build reads. fillWscript is the only place a sandbox learns where
 * its framework and face sit. readDefines guards what a face hands the compiler, since each define
 * lands on its command line. main()'s file I/O is glue, left to the build.
 */

import fs from 'node:fs';
import path from 'node:path';
import { describe, test, expect } from 'vitest';
import { buildMedia, buildManifest, fillWscript, findTargetClash, readDefines, resolveTargets } from './build-manifests';
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
