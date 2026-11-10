/**
 * Specs for the dev plugin's switches.
 *
 * `--dev` is the only way into a dev build, so what is worth pinning is that a build without it gives a
 * face nothing but `DEV_MODE` 0 whatever the unit's paf.dev.config.json holds, that a build with it
 * gives the clock and the walk the C reads, and that a setting the plugin would quietly misread stops
 * the dev build instead. The file is committed, so a `mode` in it has to stop every build, since it
 * would read as on in a file that cannot turn it on, while any other slip must not stop a release.
 * One file holds a whole family's harness, so each face's entry has to reach that face alone, and an
 * entry for a face the unit does not have has to stop a dev build.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import { tempDir } from '../../ts/testing/temp-dir.ts';
import { devDefines, isDevDefine, readDevHarness, switchesFor, unitDevDefines } from './dev-switches.ts';

const FILE = 'mosaic/paf.dev.config.json';

/** A unit folder holding the two files, each left out when it is undefined. */
function unitWith(config: unknown, devConfig: unknown): string {
  const unit = tempDir('dev-switches-');

  if (config !== undefined) {
    fs.writeFileSync(path.join(unit, 'paf.config.json'), JSON.stringify(config));
  }

  if (devConfig !== undefined) {
    fs.writeFileSync(path.join(unit, 'paf.dev.config.json'), JSON.stringify(devConfig));
  }

  return unit;
}

describe('readDevHarness', () => {
  const FACES = ['gridlock', 'sidereel'];

  /** An empty file is a harness with nothing picked yet, so a dev build gets no walk and the default clock. */
  test('reads an empty file as no walk on the default clock', () => {
    const result = readDevHarness({}, FILE, () => FACES);

    expect(result).toEqual({ unit: { walk: null, hour: 8, minute: 0 }, faces: {} });
  });

  /** A clock written with a leading zero reads as a broken octal number in C, so the build hands over the plain number. */
  test('reads the clock as the hour and minute', () => {
    const result = readDevHarness({ walk: 'themes', clock: '09:08' }, FILE, () => FACES);

    expect(result.unit).toEqual({ walk: 'themes', hour: 9, minute: 8 });
  });

  /** One committed file holds a family's harness, so a face with a walk and clock of its own needs an entry that keeps the rest. */
  test('reads a face entry over the unit\'s settings', () => {
    const result = readDevHarness({ walk: 'themes', faces: { gridlock: { walk: 'modules', clock: '20:42' }, sidereel: { clock: '10:10' } } }, FILE, () => FACES);

    expect(result.faces).toEqual({ gridlock: { walk: 'modules', hour: 20, minute: 42 }, sidereel: { walk: 'themes', hour: 10, minute: 10 } });
  });

  /** A face that takes screenshots without the unit's walk has to be able to turn it off in its own entry. */
  test('takes a face entry\'s null walk as no walk', () => {
    const result = readDevHarness({ walk: 'themes', faces: { gridlock: { walk: null } } }, FILE, () => FACES);

    expect(result.faces.gridlock).toEqual({ walk: null, hour: 8, minute: 0 });
  });

  /** The file is committed, so a mode in it would read as dev mode on in every build while each one builds with it off. */
  test.each([[true], [false]])('refuses a mode of %j and points at --dev', (mode) => {
    const call = () => readDevHarness({ mode, walk: 'themes' }, FILE, () => FACES);

    expect(call).toThrow("mosaic/paf.dev.config.json sets mode. Dev mode comes from the build's --dev flag, so a committed file never turns it on. Drop mode from the file and build with paf build <face> --dev");
  });

  /** A mode in one face's entry would read as that face's dev build being on, which only --dev turns on. */
  test('refuses a mode in a face entry', () => {
    const call = () => readDevHarness({ faces: { gridlock: { mode: true } } }, FILE, () => FACES);

    expect(call).toThrow("mosaic/paf.dev.config.json sets gridlock's mode. Dev mode comes from the build's --dev flag");
  });

  /** A misspelt walk would build without it and look like the harness had broken. */
  test('refuses a setting the plugin does not read, naming the unit\'s file', () => {
    const call = () => readDevHarness({ wlak: 'themes' }, FILE, () => FACES);

    expect(call).toThrow('mosaic/paf.dev.config.json sets wlak, which the dev plugin does not read. It reads walk, clock, faces');
  });

  /** A face entry takes no faces of its own, and a misspelt setting there would leave that face on the unit's walk. */
  test.each([['wlak'], ['faces']])('refuses %s in a face entry', (key) => {
    const call = () => readDevHarness({ faces: { gridlock: { [key]: 'modules' } } }, FILE, () => FACES);

    expect(call).toThrow(`mosaic/paf.dev.config.json sets gridlock's ${key}, which the dev plugin does not read. It reads walk, clock`);
  });

  /** A face renamed or mistyped in the file would quietly take the unit's settings, so the message lists what is there. */
  test('refuses an entry for a face the unit does not have, naming its faces', () => {
    const call = () => readDevHarness({ faces: { gridlok: { walk: 'modules' } } }, FILE, () => FACES);

    expect(call).toThrow('mosaic/paf.dev.config.json has an entry for gridlok, which is not a face in the unit. The unit\'s faces are gridlock, sidereel');
  });

  /** A name such as constructor is on every object, so it must not pass for a face. */
  test('refuses an entry for a name every object has', () => {
    const call = () => readDevHarness(JSON.parse('{ "faces": { "constructor": {} } }'), FILE, () => FACES);

    expect(call).toThrow('has an entry for constructor, which is not a face in the unit');
  });

  /** A faces block that is not an object would otherwise be skipped and every face would take the unit's settings. */
  test.each([[null], [[]], ['gridlock']])('refuses faces set to %j', (faces) => {
    const call = () => readDevHarness({ faces }, FILE, () => FACES);

    expect(call).toThrow(/^mosaic\/paf\.dev\.config\.json sets faces to .*It takes an object of settings by face name/);
  });

  /** An entry that is not an object has no walk or clock to read, and reading it would crash with a TypeError. */
  test('refuses a face entry that is not an object', () => {
    const call = () => readDevHarness({ faces: { gridlock: 'modules' } }, FILE, () => FACES);

    expect(call).toThrow('mosaic/paf.dev.config.json sets gridlock to "modules", which is not an object of dev settings');
  });

  /** The walk becomes part of a macro name, so anything but a lowercase name would not compile. */
  test.each([['Themes'], ['tap-walk'], [''], [1]])('refuses the walk %j', (walk) => {
    const call = () => readDevHarness({ walk }, FILE, () => FACES);

    expect(call).toThrow(/sets walk to .*It takes the walk's name in lowercase/);
  });

  /** An hour past 23 or a minute past 59 would pin a time the watch can never show, and the docs promise HH:MM. */
  test.each([['24:00'], ['8:00'], ['08:60'], ['8'], ['08:0'], [800], [null]])('refuses the clock %j', (clock) => {
    const call = () => readDevHarness({ clock }, FILE, () => FACES);

    expect(call).toThrow(/sets clock to .*It takes a 24-hour HH:MM/);
  });

  /** A face entry's walk and clock land in the same macros, so they are held to the same rules. */
  test('refuses a face entry\'s clock the same way, naming the face', () => {
    const call = () => readDevHarness({ faces: { sidereel: { clock: '8:00' } } }, FILE, () => FACES);

    expect(call).toThrow('mosaic/paf.dev.config.json sets sidereel\'s clock to "8:00". It takes a 24-hour HH:MM');
  });

  /** A file holding null would crash the reader with a TypeError that names no file. */
  test.each([[null], [[]], ['dev']])('refuses a file that holds %j', (settings) => {
    const call = () => readDevHarness(settings, FILE, () => FACES);

    expect(call).toThrow(/^mosaic\/paf\.dev\.config\.json holds .*, which is not an object of dev settings/);
  });
});

describe('switchesFor', () => {
  const HARNESS = { unit: { walk: 'themes', hour: 8, minute: 0 }, faces: { gridlock: { walk: 'modules', hour: 20, minute: 42 } } };

  /** The face's own entry is the whole point of the faces block. */
  test('gives a face its own entry', () => {
    const result = switchesFor(HARNESS, 'gridlock');

    expect(result).toEqual({ walk: 'modules', hour: 20, minute: 42 });
  });

  /** A face with no entry, such as every face of a unit with no faces block, runs on the unit's settings. */
  test('gives a face with no entry the unit\'s settings', () => {
    const result = switchesFor(HARNESS, 'sidereel');

    expect(result).toEqual({ walk: 'themes', hour: 8, minute: 0 });
  });
});

describe('devDefines', () => {
  /** Leaving DEV_MODE out of a release would let a face's own header turn the fixture on unseen. */
  test('gives only DEV_MODE 0 without switches', () => {
    const result = devDefines(null);

    expect(result).toEqual({ DEV_MODE: 0 });
  });

  /** The hooks pin the clock from these and start the walk named here. */
  test('gives the clock and the walk with switches', () => {
    const result = devDefines({ walk: 'themes', hour: 10, minute: 42 });

    expect(result).toEqual({ DEV_MODE: 1, DEV_TIME_HOUR: 10, DEV_TIME_MIN: 42, DEV_TAP_WALK_THEMES: 1 });
  });

  /** A face's own walk reads its own name, so the build must not keep to the walks the plugin knows. */
  test('names a face\'s own walk the same way', () => {
    const result = devDefines({ walk: 'layouts', hour: 8, minute: 0 });

    expect(result).toEqual({ DEV_MODE: 1, DEV_TIME_HOUR: 8, DEV_TIME_MIN: 0, DEV_TAP_WALK_LAYOUTS: 1 });
  });
});

describe('unitDevDefines', () => {
  /** The faces of a family whose one committed file holds every face's harness. */
  const MOSAIC = () => ['gridlock', 'sidereel'];

  /** The framework checked out on its own has neither file, and its fixtures still have to build. */
  test('gives DEV_MODE 0 for a folder with neither file', () => {
    const result = unitDevDefines(unitWith(undefined, undefined), 'probe', false);

    expect(result).toEqual({ DEV_MODE: 0 });
  });

  /** The harness is committed, so CI and a release build it too, and neither may come out in dev mode. */
  test('gives DEV_MODE 0 without --dev, whatever the harness picks', () => {
    const unit = unitWith({ plugins: { dev: {} } }, { walk: 'themes', clock: '20:42' });

    const result = unitDevDefines(unit, 'probe', false);

    expect(result).toEqual({ DEV_MODE: 0 });
  });

  /** The harness in the dev file is what a dev build runs with. */
  test('reads the harness from the unit\'s paf.dev.config.json with --dev', () => {
    const unit = unitWith({ plugins: { dev: {} } }, { walk: 'themes', clock: '20:42' });

    const result = unitDevDefines(unit, 'probe', true);

    expect(result).toEqual({ DEV_MODE: 1, DEV_TIME_HOUR: 20, DEV_TIME_MIN: 42, DEV_TAP_WALK_THEMES: 1 });
  });

  /** A unit that lists the plugin needs no dev file for a dev build on the default clock. */
  test('takes the defaults with --dev and no paf.dev.config.json', () => {
    const unit = unitWith({ plugins: { dev: {} } }, undefined);

    const result = unitDevDefines(unit, 'probe', true);

    expect(result).toEqual({ DEV_MODE: 1, DEV_TIME_HOUR: 8, DEV_TIME_MIN: 0 });
  });

  /** Without the plugin the harness is never staged, so a dev build would fail far from its cause on a missing header. */
  test.each([[undefined], [false], [null], [true]])('refuses --dev when the dev plugin is listed as %j', (dev) => {
    const unit = unitWith({ plugins: dev === undefined ? { icons: {} } : { dev } }, undefined);

    const call = () => unitDevDefines(unit, 'probe', true);

    expect(call).toThrow(`--dev builds with the dev plugin's harness, but ${path.basename(unit)}/paf.config.json does not list the dev plugin. Add "dev": {} to its plugins and run paf sync`);
  });

  /** A unit without the plugin is every face that never takes screenshots, and it has to keep building. */
  test('builds a unit that does not list the dev plugin without --dev', () => {
    const unit = unitWith({ plugins: {} }, undefined);

    const result = unitDevDefines(unit, 'probe', false);

    expect(result).toEqual({ DEV_MODE: 0 });
  });

  /** A mode in the committed file is a mistake about how dev mode turns on, so it stops every build, a release's included. */
  test.each([[{ mode: true }], [{ faces: { gridlock: { mode: true } } }]])('refuses a mode without --dev in %j', (devConfig) => {
    const unit = unitWith({ plugins: { dev: {} } }, devConfig);

    const call = () => unitDevDefines(unit, 'gridlock', false, MOSAIC);

    expect(call).toThrow(/paf\.dev\.config\.json sets (gridlock's )?mode\. Dev mode comes from the build's --dev flag/);
  });

  /** A slip in the harness only matters to a screenshot session, so it must not stop a release, and it must stop the dev build that would use it. */
  test('builds past a bad face entry without --dev and stops on it with --dev', () => {
    const unit = unitWith({ plugins: { dev: {} } }, { faces: { ridgeline: { walk: 'themes' } } });

    const result = unitDevDefines(unit, 'gridlock', false, MOSAIC);
    const call = () => unitDevDefines(unit, 'gridlock', true, MOSAIC);

    expect(result).toEqual({ DEV_MODE: 0 });
    expect(call).toThrow(`${path.basename(unit)}/paf.dev.config.json has an entry for ridgeline, which is not a face in the unit. The unit's faces are gridlock, sidereel`);
  });

  /** A file that does not parse has no mode to find, and a release has no use for the rest of it. */
  test('builds past a paf.dev.config.json that is not valid JSON without --dev', () => {
    const unit = unitWith({ plugins: { dev: {} } }, undefined);

    fs.writeFileSync(path.join(unit, 'paf.dev.config.json'), '{ "walk": "themes", }');

    const result = unitDevDefines(unit, 'probe', false);

    expect(result).toEqual({ DEV_MODE: 0 });
  });

  /** A broken file would otherwise surface on a dev build as a JSON stack trace that names no file. */
  test('names the unit\'s paf.dev.config.json when it is not valid JSON with --dev', () => {
    const unit = unitWith({ plugins: { dev: {} } }, undefined);

    fs.writeFileSync(path.join(unit, 'paf.dev.config.json'), '{ "walk": "themes", }');

    const call = () => unitDevDefines(unit, 'probe', true);

    expect(call).toThrow(`${path.basename(unit)}/paf.dev.config.json could not be read: `);
  });

  /** A mode left in paf.config.json's block is read nowhere, so it would look on and build off. */
  test('refuses switches left in the plugin\'s block in paf.config.json', () => {
    const unit = unitWith({ plugins: { dev: { mode: true } } }, undefined);

    const call = () => unitDevDefines(unit, 'probe', false);

    expect(call).toThrow(`${path.basename(unit)}/paf.config.json gives the dev plugin settings, which the build reads from paf.dev.config.json beside it`);
  });

  /** The family's one committed file has to give each face its own walk and clock on a dev build. */
  test('gives each face in a family its own entry or the unit\'s settings', () => {
    const unit = unitWith({ plugins: { dev: {} } }, { walk: 'themes', faces: { gridlock: { walk: 'modules', clock: '20:42' } } });

    const result = [unitDevDefines(unit, 'gridlock', true, MOSAIC), unitDevDefines(unit, 'sidereel', true, MOSAIC)];

    expect(result).toEqual([
      { DEV_MODE: 1, DEV_TIME_HOUR: 20, DEV_TIME_MIN: 42, DEV_TAP_WALK_MODULES: 1 },
      { DEV_MODE: 1, DEV_TIME_HOUR: 8, DEV_TIME_MIN: 0, DEV_TAP_WALK_THEMES: 1 },
    ]);
  });

  /** paf build all asks once per face, so the unit's files are read once and a later edit is not picked up mid-build. */
  test('reads the unit\'s files once per process', () => {
    const unit = unitWith({ plugins: { dev: {} } }, { walk: 'themes' });

    unitDevDefines(unit, 'probe', true);
    fs.writeFileSync(path.join(unit, 'paf.dev.config.json'), JSON.stringify({ walk: 'layouts' }));
    const result = unitDevDefines(unit, 'probe', true);

    expect(result).toEqual({ DEV_MODE: 1, DEV_TIME_HOUR: 8, DEV_TIME_MIN: 0, DEV_TAP_WALK_THEMES: 1 });
  });
});

describe('isDevDefine', () => {
  /** An appinfo define with one of these names would turn dev mode on in a build without --dev. */
  test.each([['DEV_MODE'], ['DEV_TIME_HOUR'], ['DEV_TIME_MIN'], ['DEV_TAP_WALK_THEMES']])('counts %s as the build\'s', (name) => {
    const result = isDevDefine(name);

    expect(result).toBe(true);
  });

  /** A face's own fixture choices, such as which theme a shot forces, stay the face's. */
  test('leaves a face\'s own DEV_ name alone', () => {
    const result = isDevDefine('DEV_FORCE_THEME');

    expect(result).toBe(false);
  });
});
