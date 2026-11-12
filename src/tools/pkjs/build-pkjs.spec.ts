/**
 * Specs for the emit builder.
 *
 * The copy step runs between tsc and the Pebble build to place any committed Clay *.g.js
 * components into emit/ beside the compiled output. These specs pin what findGenerated hands
 * the copy: only .g.js files under src/pkjs, and never a clay/builder piece. They run against a
 * small face under fixtures/, which is enough, since findGenerated only ever returns what it read
 * off the disk and so cannot go wrong on one real face and not another.
 *
 * The entries step writes plugin-sources/index.js again from PLUGIN_KINDS. The specs pin that the
 * table matches the real index.ts, since the features import the real one and run against the
 * written one, and that a kind that is off is never required, in every target a face builds. A face
 * whose own code reaches past the index is refused, since its build would break or carry a kind it
 * left off.
 *
 * It writes face-providers/index.js again from the face's providers list too. The specs pin that only
 * the lists that change something on the phone reach it, that a face without them carries only tsc's
 * null index, and that a face reaching past that index is refused the same way.
 *
 * A face no unit holds, such as the dev plugin's page check fixture, gives its own root, folder, and
 * sandbox. The specs pin that its emit tree and its tsconfig follow that place, and that a sandbox at
 * targets/<target> still climbs back with ../.. as every real face's does.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, test, expect } from 'vitest';
import { PKJS_BASE_TSCONFIG, bundledProviders, copyIcalJs, faceProvidersSource, facePaths, fillEmit, findGenerated, pluginIndexSource, refuseDirectPluginImports, requires, writeGeneratedEntries, writeTsconfig } from './build-pkjs';
import type { FacePaths } from './build-pkjs';
import { PLUGIN_KINDS, pluginKindsOn } from '../manifest/plugin-kinds';
import * as pluginEntry from '../../ts/plugin-sources/index';
import * as providersEntry from '../../ts/face-providers/index';
import { ENGINE } from '../shared/paths';

// a face-shaped folder with one component, one plain module, and a .g.js inside clay/builder
const FIXTURE = path.join(import.meta.dirname, 'fixtures');
const FIXTURE_SRC = path.join(FIXTURE, 'face', 'src', 'pkjs');

/** The fixture's paths, shaped the way facePaths builds them for a real face. */
const FIXTURE_PATHS: FacePaths = {
  faceSrc: FIXTURE_SRC,
  sandbox: path.join(FIXTURE, 'targets', 'face'),
  emit: path.join(FIXTURE, 'targets', 'face', 'emit'),
  emitPkjs: path.join(FIXTURE, 'targets', 'face', 'emit', 'face', 'src', 'pkjs'),
  icaljsTo: path.join(FIXTURE, 'targets', 'face', 'emit', 'ts', 'calendar', 'icaljs.js'),
  pluginSources: path.join(FIXTURE, 'targets', 'face', 'emit', 'ts', 'plugin-sources'),
  faceProviders: path.join(FIXTURE, 'targets', 'face', 'emit', 'ts', 'face-providers'),
  tsconfig: path.join(FIXTURE, 'targets', 'face', 'tsconfig.pkjs.json'),
  skipDir: path.join(FIXTURE_SRC, 'clay', 'builder'),
};

describe('PKJS_BASE_TSCONFIG', () => {
  /**
   * Every face's generated tsconfig extends this file by path, so a move that misses the constant
   * breaks every face's phone build with nothing in the framework to notice.
   */
  test('names a file the framework ships', () => {
    const result = fs.existsSync(PKJS_BASE_TSCONFIG);

    expect(result).toBe(true);
  });
});

describe('findGenerated', () => {
  /** Everything it returns is a committed .g.js component, and plain modules are left to tsc. */
  test('returns only the committed .g.js components', () => {
    const result = findGenerated(FIXTURE_PATHS);

    expect(result).toEqual([path.join('clay', 'sample-component.g.js')]);
  });

  /**
   * clay/builder holds the pieces components are stitched from. They are bundled into
   * the .g.js already, so copying them would ship the sources twice.
   */
  test('skips a generated file inside clay/builder', () => {
    const result = findGenerated(FIXTURE_PATHS).filter((name) => name.split(path.sep).join('/').startsWith('clay/builder/'));

    expect(result).toEqual([]);
  });
});

describe('copyIcalJs', () => {
  let emit: string;
  let paths: FacePaths;

  // writes one emitted CommonJS file under the temporary emit/
  function emitted(rel: string, source: string): void {
    const file = path.join(emit, rel);

    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, source);
  }

  beforeEach(() => {
    emit = fs.mkdtempSync(path.join(os.tmpdir(), 'build-pkjs-'));
    paths = {
      ...FIXTURE_PATHS,
      emit,
      emitPkjs: path.join(emit, 'src', 'pkjs'),
      icaljsTo: path.join(emit, 'paf', 'ts', 'calendar', 'icaljs.js'),
    };
    emitted('paf/ts/calendar/ical.js', '"use strict";\nconst icaljs = require("./icaljs");\n');
  });

  afterEach(() => {
    fs.rmSync(emit, { recursive: true, force: true });
  });

  /**
   * tsc emits the calendar reader for any face whose code borrows a type from it, so its file being
   * there says nothing. A face that never requires it would carry the library in every build for nothing.
   */
  test('skips ical.js when the calendar reader is only there for its types', () => {
    emitted('src/pkjs/index.js', '"use strict";\nconst app = require("../../paf/ts/pkjs/app");\n');
    emitted('paf/ts/pkjs/app.js', '"use strict";\nconst wire = require("./wire");\n');
    emitted('paf/ts/pkjs/wire.js', '"use strict";\n');

    const result = copyIcalJs(paths);

    expect(result).toBe(false);
    expect(fs.existsSync(paths.icaljsTo)).toBe(false);
  });

  /** A face that reads a calendar requires the library at runtime, and without the copy that require fails on the phone. */
  test('copies ical.js when the entry requires the calendar reader', () => {
    emitted('src/pkjs/index.js', '"use strict";\nconst calendar = require("../../paf/ts/calendar/feature");\n');
    emitted('paf/ts/calendar/feature.js', '"use strict";\nconst ical = require("./ical");\n');

    const result = copyIcalJs(paths);

    expect(result).toBe(true);
    expect(fs.existsSync(paths.icaljsTo)).toBe(true);
  });
});

describe('PLUGIN_KINDS', () => {
  /**
   * The features import the real index.ts, and the phone runs the one the build writes. An export
   * renamed on one side would read as undefined on the phone, with nothing in the build to say so.
   */
  test('names every export of the real plugin-sources index, and only those', () => {
    const result = Object.keys(pluginEntry).sort();

    expect(result).toEqual(PLUGIN_KINDS.map((kind) => kind.exportName).sort());
  });

  /** The written index carries the named exports alone, so a default export would read as undefined on the phone. */
  test('matches an index.ts with no default export', () => {
    const result = 'default' in pluginEntry;

    expect(result).toBe(false);
  });

  /**
   * Every face that opts into weather or the calendar bundles the feature, define or not. A feature
   * that reads only a driver from the index cannot hold any plugin code of its own, since the import
   * rule keeps it out of the rest of the folder, so all of that code goes when the stub writes null.
   * Anything handed over beside the driver would be a way back into the feature's file.
   */
  test.each(PLUGIN_KINDS.map((kind) => [kind.exportName]))('hands the feature %s as a driver alone', (exportName) => {
    const mode = (pluginEntry as Record<string, unknown>)[exportName] as Record<string, unknown>;

    const result = Object.keys(mode).map((name) => `${name}: ${typeof mode[name]}`);

    expect(result).toEqual(['driver: function']);
  });

  /** A kind that is on is required from its own file by its export name, so a file without that export hands the feature undefined. */
  test.each(PLUGIN_KINDS.map((kind) => [kind.file, kind.exportName]))('finds %s exporting %s', async (file, exportName) => {
    const module = await import(`../../ts/plugin-sources/${file}.ts`);

    const result = module[exportName];

    expect(result).toBeTruthy();
  });
});

describe('pluginIndexSource', () => {
  /** The written index is run as it stands on the phone, so it has to load and hand a feature null for a kind that is off. */
  test('loads with the kinds that are on required and the rest null', () => {
    const source = pluginIndexSource(pluginKindsOn({ PLUGIN_WEATHER: 1 }));
    const exports: Record<string, unknown> = {};
    const load = new Function('exports', 'require', source);

    load(exports, (id: string) => ({ weatherPlugins: `the mode from ${id}` }));

    expect(exports).toEqual({ weatherPlugins: 'the mode from ./weather', stockPlugins: null, calendarPlugins: null, musicPlugins: null, phonePlugins: null });
  });
});

// what tsc writes for the real face-providers/index.ts, which a face without providers keeps
const TSC_PROVIDERS_INDEX = '"use strict";\nObject.defineProperty(exports, "__esModule", { value: true });\nexports.faceProviders = void 0;\nexports.faceProviders = null;\n';

describe('the entries step', () => {
  let root: string;

  // one target's paths under the temporary root, shaped the way facePaths builds them
  function targetPaths(target: string): FacePaths {
    const emit = path.join(root, 'targets', target, 'emit');

    return {
      ...FIXTURE_PATHS,
      sandbox: path.join(root, 'targets', target),
      emit,
      emitPkjs: path.join(emit, 'face', 'src', 'pkjs'),
      icaljsTo: path.join(emit, 'paf', 'ts', 'calendar', 'icaljs.js'),
      pluginSources: path.join(emit, 'paf', 'ts', 'plugin-sources'),
      faceProviders: path.join(emit, 'paf', 'ts', 'face-providers'),
    };
  }

  // the target that compiled, holding what tsc emits into plugin-sources/ for every face, with the
  // real index requiring both kinds
  function compiledTarget(target: string): FacePaths {
    const paths = targetPaths(target);

    fs.mkdirSync(paths.pluginSources, { recursive: true });
    fs.writeFileSync(path.join(paths.pluginSources, 'index.js'), '"use strict";\nconst weather_1 = require("./weather");\nconst calendar_1 = require("./calendar");\n');
    fs.writeFileSync(path.join(paths.pluginSources, 'weather.js'), '"use strict";\nconst shapes = require("./shapes");\n');
    fs.writeFileSync(path.join(paths.pluginSources, 'calendar.js'), '"use strict";\nconst shapes = require("./shapes");\n');
    fs.writeFileSync(path.join(paths.pluginSources, 'shapes.js'), '"use strict";\n');
    fs.mkdirSync(paths.faceProviders, { recursive: true });
    fs.writeFileSync(path.join(paths.faceProviders, 'index.js'), TSC_PROVIDERS_INDEX);
    fs.writeFileSync(path.join(paths.faceProviders, 'narrow.js'), '"use strict";\nconst rows_1 = require("../clay/rows");\n');
    return paths;
  }

  // what is in face-providers/ after the step, each file by name with whether it is tsc's null index
  function providersFolder(paths: FacePaths): Record<string, string> {
    const folder: Record<string, string> = {};

    fs.readdirSync(paths.faceProviders).sort().forEach((name) => {
      const text = fs.readFileSync(path.join(paths.faceProviders, name), 'utf8');

      folder[name] = text === TSC_PROVIDERS_INDEX ? 'tsc' : text.includes('faceProvidersFor') ? 'written' : 'other';
    });

    return folder;
  }

  // whether the written index reaches each kind's file
  function kindsReached(paths: FacePaths): boolean[] {
    const index = path.join(paths.pluginSources, 'index.js');

    return [requires(index, path.join(paths.pluginSources, 'weather.js')), requires(index, path.join(paths.pluginSources, 'calendar.js'))];
  }

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'build-pkjs-plugins-'));
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  describe('writeGeneratedEntries', () => {
    /** A face that never set a plugin define has to carry no plugin code, and the emit tree has to show it. */
    test.each([
      ['no plugin defines', {}],
      ['every plugin define at 0', { PLUGIN_WEATHER: 0, PLUGIN_CALENDAR: 0 }],
    ])('leaves only the index in plugin-sources/ with %s', (_name, defines) => {
      const paths = compiledTarget('face');

      writeGeneratedEntries(paths, defines);

      const result = fs.readdirSync(paths.pluginSources);

      expect(result).toEqual(['index.js']);
    });

    /** A kind that is off must never be required, or its code ships in a face that turned it off. */
    test('requires only the kind that is on', () => {
      const paths = compiledTarget('face');

      writeGeneratedEntries(paths, { PLUGIN_WEATHER: 1 });

      const result = kindsReached(paths);

      expect(result).toEqual([true, false]);
    });

    /** With a kind on, the files it requires have to be there, or the require fails on the phone. */
    test('keeps the folder whole with a kind on', () => {
      const paths = compiledTarget('face');

      writeGeneratedEntries(paths, { PLUGIN_CALENDAR: 1 });

      const result = fs.readdirSync(paths.pluginSources).sort();

      expect(result).toEqual(['calendar.js', 'index.js', 'shapes.js', 'weather.js']);
    });

    /** The build log names the kinds a face built with, so a wrong answer here sends the reader after the wrong cause. */
    test('reports the kinds that are on, in table order', () => {
      const paths = compiledTarget('face');

      const result = writeGeneratedEntries(paths, { PLUGIN_CALENDAR: 1, PLUGIN_WEATHER: 1 });

      expect(result).toEqual({ plugins: ['weather', 'calendar'], providers: [] });
    });

    /**
     * A face whose list changes nothing on the phone has to carry the same stub as one that lists
     * nothing, so the opt-in costs it nothing on the phone.
     */
    test.each([
      ['no providers', {}],
      ['calendar hosts only', { calendarHosts: ['google.com'] }],
      ['now playing and phone battery', { music: ['plugin'], phone: ['plugin'] }],
      ['a calendar holding its iCal link', { calendar: ['plugin', 'ical'] }],
    ])('leaves only tsc\'s index in face-providers/ with %s', (_name, providers) => {
      const paths = compiledTarget('face');

      writeGeneratedEntries(paths, {}, providers);

      const result = providersFolder(paths);

      expect(result).toEqual({ 'index.js': 'tsc' });
    });

    /** A list that never reached the phone would leave the page offering every provider while the manifest lists a few. */
    test.each([
      ['weather', { weather: ['openmeteo'] }],
      ['stocks', { stocks: ['yahoo'] }],
      ['a plugin only calendar', { calendar: ['plugin'] }],
    ])('writes the index and keeps narrow.js for %s', (_name, providers) => {
      const paths = compiledTarget('face');

      writeGeneratedEntries(paths, { PLUGIN_CALENDAR: 1 }, providers);

      const result = providersFolder(paths);

      expect(result).toEqual({ 'index.js': 'written', 'narrow.js': 'other' });
    });

    /** The build log names the lists the phone carries, so a list the log leaves out is one the reader thinks the page narrows. */
    test('reports the lists the phone carries', () => {
      const paths = compiledTarget('face');

      const result = writeGeneratedEntries(paths, { PLUGIN_WEATHER: 1 }, { weather: ['plugin', 'openmeteo'], stocks: ['yahoo'], calendarHosts: ['google.com'] }).providers;

      expect(result).toEqual(['weather plugin and openmeteo', 'stocks yahoo']);
    });
  });

  describe('the providers entry', () => {
    // stands in for the two modules the written entry can require
    function loadEntry(id: string): unknown {
      if (id === '../stock/cache') {
        return 'the stock cache';
      }

      return { faceProvidersFor: (lists: unknown, stockCache?: unknown) => (stockCache === undefined ? { lists } : { lists, stockCache }) };
    }

    /** The written index is run as it stands on the phone, so it has to load and hand narrow.js the lists with their key flags. */
    test('loads and hands faceProvidersFor each list with whether it needs a key', () => {
      const source = faceProvidersSource(bundledProviders({ weather: ['plugin', 'owm'], stocks: ['yahoo'], calendar: ['plugin'] }));
      const exports: Record<string, unknown> = {};
      const load = new Function('exports', 'require', source);

      load(exports, loadEntry);

      expect(exports.faceProviders).toEqual({
        lists: {
          weather: { offered: ['plugin', 'owm'], needsKey: true },
          stocks: { offered: ['yahoo'], needsKey: false },
          calendar: { offered: ['plugin'], needsKey: false },
        },
        stockCache: 'the stock cache',
      });
    });

    /** A face without a stock list that required the stock cache anyway would carry the cache's code for nothing. */
    test('hands over no stock cache for a face without a stock list', () => {
      const source = faceProvidersSource(bundledProviders({ weather: ['openmeteo'] }));
      const exports: Record<string, unknown> = {};
      const load = new Function('exports', 'require', source);

      load(exports, loadEntry);

      expect(exports.faceProviders).toEqual({ lists: { weather: { offered: ['openmeteo'], needsKey: false } } });
      expect(source).not.toContain('stock/cache');
    });

    /** app.ts imports the real index.ts, and the phone runs the one the build writes, so a rename on one side reads as undefined on the phone. */
    test('matches a real index.ts that exports faceProviders alone, set to null', () => {
      const result = { ...providersEntry };

      expect(result).toEqual({ faceProviders: null });
    });
  });

  describe('refuseDirectPluginImports', () => {
    // the compiled target with the face's own emitted entry holding the source given
    function compiledFace(source: string): FacePaths {
      const paths = compiledTarget('face');

      fs.mkdirSync(paths.emitPkjs, { recursive: true });
      fs.writeFileSync(path.join(paths.emitPkjs, 'index.js'), source);
      return paths;
    }

    /**
     * A face reaching past the index for shapes.js would fail on the phone with "Cannot find module"
     * once the build takes the file out, so it has to be refused at build time, naming the file.
     */
    test('refuses a face file that requires a plugin-sources file other than the index', () => {
      const paths = compiledFace('"use strict";\nconst shapes_1 = require("../../../paf/ts/plugin-sources/shapes");\n');

      const call = () => refuseDirectPluginImports(paths);

      expect(call).toThrow('face/src/pkjs/index.js imports ../../../paf/ts/plugin-sources/shapes, which reaches past the plugin-sources index');
    });

    /** A face reaching for narrow.js directly would fail on the phone once a build without providers takes the file out. */
    test('refuses a face file that requires a face-providers file other than the index', () => {
      const paths = compiledFace('"use strict";\nconst narrow_1 = require("../../../paf/ts/face-providers/narrow");\n');

      const call = () => refuseDirectPluginImports(paths);

      expect(call).toThrow('face/src/pkjs/index.js imports ../../../paf/ts/face-providers/narrow, which reaches past the face-providers index');
    });

    /** The index is the one way in, by its folder or by name, and refusing it would stop every face that uses plugins. */
    test.each([
      ['its folder', '../../../paf/ts/plugin-sources'],
      ['its name', '../../../paf/ts/plugin-sources/index'],
    ])('passes a face file that requires the index by %s', (_name, spec) => {
      const paths = compiledFace(`"use strict";\nconst plugins = require("${spec}");\n`);

      const call = () => refuseDirectPluginImports(paths);

      expect(call).not.toThrow();
    });

    /** The framework's own plugin files require each other, and reading them as the face's would refuse every build. */
    test('leaves the framework\'s own files alone', () => {
      const paths = compiledTarget('face');

      const call = () => refuseDirectPluginImports(paths);

      expect(call).not.toThrow();
    });
  });

  describe('fillEmit', () => {
    /** The entries are written before the copy, or a face's other targets ship the plugin code the first one left out. */
    test('gives every target the written entries', () => {
      const first = compiledTarget('face');
      const second = targetPaths('face-app');

      fillEmit(first, [second], { PLUGIN_WEATHER: 1 }, { weather: ['plugin'] });

      const result = [first, second].map((paths) => [...kindsReached(paths), providersFolder(paths)]);

      expect(result).toEqual([[true, false, { 'index.js': 'written', 'narrow.js': 'other' }], [true, false, { 'index.js': 'written', 'narrow.js': 'other' }]]);
    });

    /** A face's watchapp target carrying narrow.js its watchface target left out would ship code the face never asked for. */
    test('gives every target of a face without providers only tsc\'s index', () => {
      const first = compiledTarget('face');
      const second = targetPaths('face-app');

      fillEmit(first, [second], {});

      const result = [first, second].map((paths) => providersFolder(paths));

      expect(result).toEqual([{ 'index.js': 'tsc' }, { 'index.js': 'tsc' }]);
    });
  });
});

describe('a face built from a place of its own', () => {
  let sandbox: string;

  beforeEach(() => {
    sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'build-pkjs-place-'));
  });

  afterEach(() => {
    fs.rmSync(sandbox, { recursive: true, force: true });
  });

  /** The tsconfig written for one place, read back as an object. */
  function writtenTsconfig(place: { root: string; rel: string; sandbox?: string }): { paths: FacePaths; tsconfig: { compilerOptions: { rootDir: string }; include: string[]; exclude: string[] } } {
    const paths = facePaths('fixture', 'fixture', place);

    writeTsconfig('fixture', paths, place);

    return { paths, tsconfig: JSON.parse(fs.readFileSync(paths.tsconfig, 'utf8')) };
  }

  /**
   * The emit tree keeps the source's shape from the root. A face whose index.js or plugin-sources
   * lands anywhere else is a face the preview cannot load or the entries step never rewrites.
   */
  test('lays the emit tree out from the root it is given', () => {
    const result = facePaths('fixture', 'fixture', { root: ENGINE, rel: 'plugins/dev/fixtures/face', sandbox });

    expect(result.emitPkjs).toBe(path.join(sandbox, 'emit', 'plugins', 'dev', 'fixtures', 'face', 'src', 'pkjs'));
    expect(result.pluginSources).toBe(path.join(sandbox, 'emit', 'ts', 'plugin-sources'));
    expect(result.faceSrc).toBe(path.join(ENGINE, 'plugins', 'dev', 'fixtures', 'face', 'src', 'pkjs'));
  });

  /** A sandbox outside the root has to climb back to it, or tsc compiles neither the face nor the framework. */
  test('roots a sandbox of its own at the place it is given', () => {
    const { tsconfig } = writtenTsconfig({ root: ENGINE, rel: 'plugins/dev/fixtures/face', sandbox });

    const result = [tsconfig.compilerOptions.rootDir, tsconfig.include[0], tsconfig.exclude[3]].map((entry) => path.resolve(sandbox, entry));

    expect(result).toEqual([ENGINE, path.join(ENGINE, 'plugins/dev/fixtures/face/src/pkjs/**/*.ts'), path.join(ENGINE, '**/*.spec.ts')]);
  });

  /** Every real face builds in targets/<target>, and its tsconfig has always climbed back with ../.. from there. */
  test('climbs back with ../.. from a sandbox at targets/<target>', () => {
    const { tsconfig } = writtenTsconfig({ root: sandbox, rel: 'face' });

    const result = [tsconfig.compilerOptions.rootDir, tsconfig.include[0], tsconfig.exclude[0], tsconfig.exclude[3]];

    expect(result).toEqual(['../..', '../../face/src/pkjs/**/*.ts', '../../face/src/pkjs/clay/builder/**', '../../**/*.spec.ts']);
  });
});
