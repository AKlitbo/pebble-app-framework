/**
 * Specs for the manifest builder's pure steps.
 *
 * buildMedia owns the per-target media list: which entry gets the menuIcon flag, and the
 * deep-clone that keeps one target's flag from bleeding onto the other. buildManifest is the
 * package.json wire shape pebble build reads. fillWscript is the only place a sandbox learns where
 * its framework and face sit. main()'s file I/O is glue, left to the build.
 */

import fs from 'node:fs';
import path from 'node:path';
import { describe, test, expect } from 'vitest';
import { buildMedia, buildManifest, fillWscript, resolveTargets } from './build-manifests';
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
    const template = fs.readFileSync(path.join(import.meta.dirname, '..', 'waf', 'wscript.template'), 'utf8');

    const result = fillWscript(template, { engine: 'engine', face: 'watchfaces/mosaic/gridlock', familyCore: 'watchfaces/mosaic/core', watchface: true });

    expect(result).not.toContain('{{');
    expect(result).toContain("'engine': 'engine'");
    expect(result).toContain("'face': 'watchfaces/mosaic/gridlock'");
    expect(result).toContain("'family_core': 'watchfaces/mosaic/core'");
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
    const template = fs.readFileSync(path.join(import.meta.dirname, '..', 'waf', 'wscript.template'), 'utf8');

    const result = fillWscript(template, { engine: 'engine', face: '.', familyCore: '', watchface });

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
});

describe('resolveTargets', () => {
  /** The common face inlines one target, so a missing targets map still builds exactly that one .pbw. */
  test('returns the inline single target when there is no targets map', () => {
    const config = { ...makeConfig(), name: 'radar-array', watchface: true };

    const result = resolveTargets(config);

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

    const result = resolveTargets(config);

    expect(result).toEqual([
      { name: 'gridlock-face', watchface: true },
      { name: 'gridlock-app', watchface: false, menuIcon: 'ICON_ONE' },
    ]);
  });

  /** An appinfo with no identity at all is a build-input mistake, so it must fail loudly not silently. */
  test('throws when there is neither a targets map nor a name', () => {
    const config = makeConfig();

    const call = () => resolveTargets(config);

    expect(call).toThrow(/neither a targets map nor a top-level name/);
  });
});
