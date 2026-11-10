/**
 * Specs for the build's own decisions.
 *
 * The build hands most of its work to the manifest step, the pkjs build, and pebble, which are pinned
 * elsewhere or left to the device. What it decides itself is which faces to build, what goes on to
 * pebble build, and when to stop. A wrong answer there builds the wrong face, builds nothing, drops a
 * flag the developer asked for, or lets CI read a failed build as a pass.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { buildFaces, buildOne, buildSandboxes, facesToBuild, parseBuildArgs, type BuildOptions, type BuildSteps } from './build.ts';
import { forgetBuiltKeys, keysChanged, recordBuiltKeys, type CheckedAppinfo, type PreparedFace, type WrittenSandboxes } from './manifest/build-manifests.ts';
import type { PebbleRun, PebbleRunner } from './shared/pebble.ts';

// the phone build's log line looks the face up in a unit, which a spec does not have
vi.mock(import('./pkjs/build-pkjs.ts'), async (original) => ({ ...(await original()), describeBuild: () => 'built emit/' }));

/** A sandbox step's answer for one gridlock-face sandbox, with a checked appinfo holding the given defines. */
function written(textDefines: Record<string, string> = {}, rekeyed: string[] = []): WrittenSandboxes {
  const checked = { targets: ['gridlock-face'], defines: { PLUGIN_WEATHER: 1 }, providers: {}, permissions: [], textDefines, devDefines: { DEV_MODE: 0 }, warnings: [] } as CheckedAppinfo;

  return { paths: ['/unit/targets/gridlock-face'], checked, messageKeys: ['WEATHER_REQUEST'], pluginApp: false, rekeyed };
}

/** A build with no flags, the way CI and a release build every face. */
const PLAIN: BuildOptions = { clean: false, dev: false, forward: [] };

/** What the start step reads from a face whose phone code passes the weather feature. */
const START = { started: true, featureKeys: ['WEATHER_REQUEST', 'WEATHER_TEMPERATURE', 'WEATHER_CONDITIONS', 'WEATHER_OK'] };

/** What the prepare step reads of a face with one gridlock-face target. */
const PREPARED = {
  appinfo: { name: 'gridlock-face' },
  targets: [{ name: 'gridlock-face', watchface: true }],
  info: { targets: ['gridlock-face'], defines: {}, providers: {}, devDefines: { DEV_MODE: 0 } },
  baseKeys: ['SETTINGS_REQUEST'],
  pluginApp: false,
} as unknown as PreparedFace;

/** The phone step's answer for the one target. */
const BUILT = { targets: ['gridlock-face'], generated: [], icaljs: false, plugins: [], providers: [] };

/** Steps that do nothing and pass, with the given ones in their place. */
function stepsWith(given: Partial<BuildSteps> = {}): BuildSteps {
  return {
    prepare: () => PREPARED,
    phone: () => BUILT,
    start: () => START,
    sandboxes: () => written(),
    page: () => [],
    check: () => {},
    header: () => {},
    record: () => {},
    forget: () => {},
    run: () => ({ status: 0, signal: null }),
    ...given,
  };
}

/** A pebble that records each run and ends it the way the next run given says, then with 0. */
function recordingPebble(runs: PebbleRun[]): { calls: string[]; run: PebbleRunner } {
  const calls: string[] = [];
  const run: PebbleRunner = (args, sandbox) => {
    calls.push(`${path.basename(sandbox)}: pebble ${args.join(' ')}`);
    return runs.shift() ?? { status: 0, signal: null };
  };

  return { calls, run };
}

describe('parseBuildArgs', () => {
  /** A flag in the face's place would be taken for a face, and the build would stop on no such face. */
  test.each([[[]], [['--clean']]])('stops when no face comes first in %j', (args) => {
    const call = () => parseBuildArgs(args);

    expect(call).toThrow(/usage: paf build <face\|all>/);
  });

  /** --clean belongs to the build, not to pebble build, which would refuse it. */
  test('takes --clean out wherever it sits and hands the rest to pebble build in order', () => {
    const result = parseBuildArgs(['gridlock', '--debug', '--clean', '--verbose']);

    expect(result).toEqual({ target: 'gridlock', clean: true, dev: false, forward: ['--debug', '--verbose'] });
  });

  /** --dev is the only way into dev mode, and pebble build would refuse it as a flag it does not know. */
  test('takes --dev out wherever it sits and turns dev mode on', () => {
    const result = parseBuildArgs(['gridlock', '--debug', '--dev', '--clean']);

    expect(result).toEqual({ target: 'gridlock', clean: true, dev: true, forward: ['--debug'] });
  });

  /** A release builds with no flags, so a build without --dev has to leave dev mode off. */
  test('leaves dev mode off without --dev', () => {
    const result = parseBuildArgs(['gridlock']);

    expect(result.dev).toBe(false);
  });
});

describe('facesToBuild', () => {
  /** A mistyped face has to stop before any sandbox is written, naming the faces there are. */
  test('stops on a face the repo does not have, naming the ones it does', () => {
    const call = () => facesToBuild('gridlok', ['gridlock', 'sidereel']);

    expect(call).toThrow('no such face: gridlok. The faces in this repo are: gridlock sidereel');
  });

  /** all is every face, in the order the lookup gives them, so CI builds each one once. */
  test('builds every face for all', () => {
    const result = facesToBuild('all', ['gridlock', 'sidereel']);

    expect(result).toEqual(['gridlock', 'sidereel']);
  });
});

describe('buildFaces', () => {
  /** A unit that holds a plugin app beside its faces could never build them all in dev mode, since the plugin app stops on --dev. */
  test('asks each face of all to pass over a plugin app', async () => {
    const seen: Array<[string, boolean | undefined]> = [];

    await buildFaces('all', ['gridlock', 'calendar-ical'], { ...PLAIN, dev: true }, async (face, options) => { seen.push([face, options.passOverPluginApps]); });

    expect(seen).toEqual([['gridlock', true], ['calendar-ical', true]]);
  });

  /** A plugin app named on its own with --dev is a mistake the build has to report rather than pass over. */
  test('leaves a face named on its own to stop on a plugin app', async () => {
    const seen: Array<boolean | undefined> = [];

    await buildFaces('calendar-ical', ['calendar-ical'], { ...PLAIN, dev: true }, async (face, options) => { seen.push(options.passOverPluginApps); });

    expect(seen).toEqual([false]);
  });
});

describe('buildSandboxes', () => {
  const SANDBOXES = ['/unit/targets/gridlock-face', '/unit/targets/gridlock-app'];

  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /**
   * A build that carried on past a failed sandbox would end on the next one's success, so CI would
   * pass a face with no .pbw for one of its targets.
   */
  test('stops at the first failed pebble step with its exit code', () => {
    const { calls, run } = recordingPebble([{ status: 3, signal: null }]);

    const call = () => buildSandboxes('gridlock', SANDBOXES, false, [], run);

    expect(call).toThrow(expect.objectContaining({ code: 3, message: 'pebble build failed in gridlock-face' }));
    expect(calls).toEqual(['gridlock-face: pebble build']);
  });

  /** An out of memory kill that ended with a plain 1 would read in CI as an ordinary build failure. */
  test('ends a pebble step stopped by a signal with 128 plus its number', () => {
    const { run } = recordingPebble([{ status: null, signal: 'SIGKILL' }]);

    const call = () => buildSandboxes('gridlock', SANDBOXES, false, [], run);

    expect(call).toThrow(expect.objectContaining({ code: 137, message: 'pebble build was stopped by SIGKILL in gridlock-face' }));
  });

  /** A clean that ran after the build, or only once, would leave a sandbox on its old message keys. */
  test('cleans each sandbox before building it and hands every build the same arguments', () => {
    const { calls, run } = recordingPebble([]);

    buildSandboxes('gridlock', SANDBOXES, true, ['--debug'], run);

    expect(calls).toEqual([
      'gridlock-face: pebble clean',
      'gridlock-face: pebble build --debug',
      'gridlock-app: pebble clean',
      'gridlock-app: pebble build --debug',
    ]);
  });

  /**
   * A record left beside a sandbox whose build then failed would let the next build skip a clean it
   * still needs, so each sandbox is handed on before its first pebble step and again once its build passes.
   */
  test('hands on each sandbox before its pebble steps and once its build passes', () => {
    const { run } = recordingPebble([{ status: 0, signal: null }, { status: 2, signal: null }]);
    const seen: string[] = [];
    const hooks = { starting: (sandbox: string) => seen.push(`starting ${path.basename(sandbox)}`), built: (sandbox: string) => seen.push(`built ${path.basename(sandbox)}`) };

    const call = () => buildSandboxes('gridlock', SANDBOXES, false, [], run, hooks);

    expect(call).toThrow('pebble build failed in gridlock-app');
    expect(seen).toEqual(['starting gridlock-face', 'built gridlock-face', 'starting gridlock-app']);
  });

  /** A sandbox whose keys changed fails an incremental build, and cleaning every sandbox would rebuild the ones that did not change. */
  test('cleans only the sandboxes it is given', () => {
    const { calls, run } = recordingPebble([]);

    buildSandboxes('gridlock', SANDBOXES, ['/unit/targets/gridlock-app'], [], run);

    expect(calls).toEqual([
      'gridlock-face: pebble build',
      'gridlock-app: pebble clean',
      'gridlock-app: pebble build',
    ]);
  });
});

describe('buildOne', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /**
   * The appinfo checks that need no features come first, so their refusals write nothing. The features
   * the compiled phone code passes bring message keys, so the sandboxes are written after the phone
   * build and the start read. The header comes from the compiled phone code and the face's C includes
   * it, so it is written before pebble build, and the keys are recorded only once pebble build passes.
   */
  test('runs the steps in order and records the keys after pebble build', async () => {
    const order: string[] = [];
    const { calls, run } = recordingPebble([]);
    const steps = stepsWith({
      prepare: () => { order.push('prepare'); return PREPARED; },
      phone: () => { order.push('phone'); return BUILT; },
      start: () => { order.push('start'); return START; },
      sandboxes: () => { order.push('sandboxes'); return written(); },
      page: () => { order.push('page'); return []; },
      check: () => { order.push('check'); },
      header: (face, targets) => { order.push(`header ${targets.join(' ')}`); },
      record: (sandbox) => { order.push(`record ${path.basename(sandbox)}`); },
      run: (args, sandbox) => { order.push('pebble'); return run(args, sandbox); },
    });

    await buildOne('gridlock', PLAIN, steps);

    expect(order).toEqual(['prepare', 'phone', 'start', 'sandboxes', 'page', 'check', 'header gridlock-face', 'pebble', 'record gridlock-face']);
    expect(calls).toEqual(['gridlock-face: pebble build']);
  });

  /** A refusal of the appinfo before the phone build has to leave every sandbox as it was. */
  test('runs nothing after an appinfo the prepare step refuses', async () => {
    const order: string[] = [];
    const steps = stepsWith({
      prepare: () => { throw new Error('refused'); },
      phone: () => { order.push('phone'); return BUILT; },
      sandboxes: () => { order.push('sandboxes'); return written(); },
    });

    const call = buildOne('gridlock', PLAIN, steps);

    await expect(call).rejects.toThrow('refused');
    expect(order).toEqual([]);
  });

  /**
   * The phone build, the start read, and the sandboxes work from the appinfo read once. A sandbox
   * written without the start's keys would leave out the keys its features need, and a page loaded or
   * keys recorded on other keys than the manifest's would not match the watch.
   */
  test('hands each step what the steps before it read', async () => {
    const seen: Record<string, unknown> = {};
    const steps = stepsWith({
      phone: (face, prepared) => { seen.phone = prepared; return BUILT; },
      start: (face, prepared) => { seen.start = prepared; return START; },
      sandboxes: (face, prepared, start) => { seen.sandboxes = [prepared, start]; return written(); },
      page: (face, prepared, messageKeys) => { seen.page = [prepared, messageKeys]; return []; },
      record: (sandbox, messageKeys) => { seen.record = messageKeys; },
    });

    await buildOne('gridlock', PLAIN, steps);

    expect(seen).toEqual({ phone: PREPARED, start: PREPARED, sandboxes: [PREPARED, START], page: [PREPARED, ['WEATHER_REQUEST']], record: ['WEATHER_REQUEST'] });
  });

  /** The prepare step is where the dev defines are read, so --dev that never reached it would build a face with dev mode off. */
  test('asks the prepare step for dev mode when the build has --dev', async () => {
    const asked: boolean[] = [];

    await buildOne('gridlock', { ...PLAIN, dev: true }, stepsWith({ prepare: (face, dev) => { asked.push(dev); return PREPARED; } }));

    expect(asked).toEqual([true]);
  });

  /** paf cleans only when the appinfo's keys change, so a feature passed in code would fail the next build on an undeclared MESSAGE_KEY_. */
  test('cleans a sandbox whose message keys changed and says why', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const { calls, run } = recordingPebble([]);

    await buildOne('gridlock', PLAIN, stepsWith({ sandboxes: () => written({}, ['/unit/targets/gridlock-face']), run }));

    expect(calls).toEqual(['gridlock-face: pebble clean', 'gridlock-face: pebble build']);
    expect(log).toHaveBeenCalledWith("gridlock-face's message keys differ from the ones its last passing build recorded, so it builds clean");
  });

  /**
   * The bug the record is there for. A build that wrote the new manifest and then stopped would leave
   * the next build comparing against keys that never built, so it would skip the clean and fail on an
   * undeclared MESSAGE_KEY_.
   */
  test('still cleans the build after one that stopped once the manifest was written', async () => {
    const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'build-record-'));
    const keys = ['WEATHER_REQUEST'];
    const { calls, run } = recordingPebble([{ status: 0, signal: null }, { status: 1, signal: null }]);
    const steps = stepsWith({
      sandboxes: () => ({ ...written(), paths: [sandbox], rekeyed: keysChanged(sandbox, keys) ? [sandbox] : [], messageKeys: keys }),
      record: recordBuiltKeys,
      forget: forgetBuiltKeys,
      run,
    });

    try {
      await expect(buildOne('gridlock', PLAIN, steps)).rejects.toThrow('pebble build failed');

      await buildOne('gridlock', PLAIN, steps);
      await buildOne('gridlock', PLAIN, steps);

      const result = calls.map((line) => line.split(': ')[1]);

      expect(result).toEqual(['pebble clean', 'pebble build', 'pebble clean', 'pebble build', 'pebble build']);
    } finally {
      fs.rmSync(sandbox, { recursive: true, force: true });
    }
  });

  /**
   * The bug the record is taken away for. Keys K0 built and recorded, then K1 cleaned and failed, so
   * build/ holds a part of a K1 build. A revert to K0 that read the old record would skip the clean and
   * build on K1's leftovers.
   */
  test('cleans a revert to the recorded keys after a build on other keys failed', async () => {
    const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'build-record-'));
    let keys = ['K0'];
    const { calls, run } = recordingPebble([{ status: 0, signal: null }, { status: 0, signal: null }, { status: 0, signal: null }, { status: 1, signal: null }]);
    const steps = stepsWith({
      sandboxes: () => ({ ...written(), paths: [sandbox], rekeyed: keysChanged(sandbox, keys) ? [sandbox] : [], messageKeys: keys }),
      record: recordBuiltKeys,
      forget: forgetBuiltKeys,
      run,
    });

    try {
      await buildOne('gridlock', PLAIN, steps);
      keys = ['K1'];
      await expect(buildOne('gridlock', PLAIN, steps)).rejects.toThrow('pebble build failed');
      keys = ['K0'];
      calls.length = 0;

      await buildOne('gridlock', PLAIN, steps);

      const result = calls.map((line) => line.split(': ')[1]);

      expect(result).toEqual(['pebble clean', 'pebble build']);
    } finally {
      fs.rmSync(sandbox, { recursive: true, force: true });
    }
  });

  /**
   * The check has to judge the page against the appinfo the sandboxes were written from, and against
   * the very facts the header is written from, or it could pass a page whose header says something else.
   */
  test('checks the page against the sandbox step\'s appinfo and the facts the header gets', async () => {
    const seen: { appinfo?: unknown; checked?: unknown; header?: unknown } = {};
    const steps = stepsWith({
      sandboxes: () => written({ PLUGIN_SOURCE_WEATHER_DEFAULT: 'owm' }),
      check: (face, pages, facts, appinfo) => { seen.checked = facts; seen.appinfo = appinfo; },
      header: (face, targets, facts) => { seen.header = facts; },
    });

    await buildOne('gridlock', PLAIN, steps);

    expect(seen.appinfo).toEqual({ messageKeys: ['WEATHER_REQUEST'], textDefines: { PLUGIN_SOURCE_WEATHER_DEFAULT: 'owm' } });
    expect(seen.checked).toBe(seen.header);
  });

  /** A face field reading a default the header left out stops at compile, so the build log has to say which key and why. */
  test('logs each face key it leaves out of the header for opening differently by platform', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const page = { platform: 'emery', clay: { config: [{ type: 'select', messageKey: 'LAYOUT_NIGHT_MODE', defaultValue: 0, options: [{ value: 0 }, { value: 1 }] }] } };
    const round = { platform: 'gabbro', clay: { config: [{ type: 'select', messageKey: 'LAYOUT_NIGHT_MODE', defaultValue: 1, options: [{ value: 0 }, { value: 1 }] }] } };

    await buildOne('gridlock', PLAIN, stepsWith({ page: () => [page, round] as unknown as ReturnType<BuildSteps['page']> }));

    expect(log).toHaveBeenCalledWith("gridlock's settings page opens LAYOUT_NIGHT_MODE on different values on different platforms, so page/settings_page.h holds no SETTINGS_DEFAULT_LAYOUT_NIGHT_MODE");
  });

  /** A page the build refuses has to stop it before the header, or pebble build would take the counts and defaults of a page the face has to fix. */
  test('stops on a refused page before it writes the header, runs pebble, or records keys', async () => {
    const order: string[] = [];
    const steps = stepsWith({
      check: () => { throw new Error('refused'); },
      header: () => { order.push('header'); },
      record: () => { order.push('record'); },
      run: () => { order.push('pebble'); return { status: 0, signal: null }; },
    });

    const call = buildOne('gridlock', PLAIN, steps);

    await expect(call).rejects.toThrow('refused');
    expect(order).toEqual([]);
  });

  /**
   * A plugin app has no phone code, settings page, or header, so the phone build would compile a
   * src/pkjs it does not have. Its pebble build needs the bundled plugin.js in place first, or the SDK
   * stops at configure on a missing script, and it still has to clean when paf build asks. It has no
   * features to read and no keys to record.
   */
  test('builds a plugin app from its appinfo checks to its sandbox to its bundled script to pebble build', async () => {
    const order: string[] = [];
    const { calls, run } = recordingPebble([]);
    const steps = stepsWith({
      prepare: () => { order.push('prepare'); return { ...PREPARED, pluginApp: true }; },
      phone: () => { order.push('phone'); return BUILT; },
      start: () => { order.push('start'); return START; },
      sandboxes: (face, prepared, start) => { order.push(`sandboxes ${JSON.stringify(start)}`); return { ...written(), pluginApp: true }; },
      page: () => { order.push('page'); return []; },
      check: () => { order.push('check'); },
      header: () => { order.push('header'); },
      record: () => { order.push('record'); },
      forget: (sandbox) => { order.push(`forget ${path.basename(sandbox)}`); },
      plugin: async (face, sandboxes) => { order.push(`plugin ${sandboxes.map((sandbox) => path.basename(sandbox)).join(' ')}`); },
      run: (args, sandbox) => { order.push('pebble'); return run(args, sandbox); },
    });

    await buildOne('calendar-ical', { clean: true, dev: false, forward: ['--debug'] }, steps);

    expect(order).toEqual(['prepare', 'sandboxes {"started":false,"featureKeys":[]}', 'forget gridlock-face', 'plugin gridlock-face', 'pebble', 'pebble']);
    expect(calls).toEqual(['gridlock-face: pebble clean', 'gridlock-face: pebble build --debug']);
  });

  /** A dev build of a plugin app would look like dev mode and be a release build, so it stops before anything is written. */
  test('stops a dev build of a plugin app before anything is written', async () => {
    const order: string[] = [];
    const steps = stepsWith({
      prepare: () => ({ ...PREPARED, pluginApp: true }),
      sandboxes: () => { order.push('sandboxes'); return { ...written(), pluginApp: true }; },
    });

    const call = buildOne('calendar-ical', { ...PLAIN, dev: true }, steps);

    await expect(call).rejects.toThrow('calendar-ical is a plugin app, which has no watch code for dev mode to change. Build it without --dev');
    expect(order).toEqual([]);
  });

  /** all --dev in a unit holding a plugin app beside its faces stopped on the plugin app and built none of the faces after it. */
  test('passes over a plugin app with a line when asked to', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const order: string[] = [];
    const steps = stepsWith({
      prepare: () => ({ ...PREPARED, pluginApp: true }),
      sandboxes: () => { order.push('sandboxes'); return { ...written(), pluginApp: true }; },
    });

    await buildOne('calendar-ical', { ...PLAIN, dev: true, passOverPluginApps: true }, steps);

    expect(order).toEqual([]);
    expect(log).toHaveBeenCalledWith('calendar-ical is a plugin app, which has no watch code for dev mode to change, so the dev build skips it');
  });

  /**
   * A target that turns from a face into a plugin app and back. The plugin app's pebble build replaces
   * the face's build/, so a record the face left behind would let the next face build skip its clean,
   * and it would fail on an undeclared MESSAGE_KEY_.
   */
  test('cleans a face build that follows a plugin app build in the same sandbox', async () => {
    const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'build-plugin-record-'));
    const keys = ['WEATHER_REQUEST'];
    const { calls, run } = recordingPebble([]);
    const face = stepsWith({
      sandboxes: () => ({ ...written(), paths: [sandbox], rekeyed: keysChanged(sandbox, keys) ? [sandbox] : [], messageKeys: keys }),
      record: recordBuiltKeys,
      forget: forgetBuiltKeys,
      run,
    });
    const pluginApp = stepsWith({
      prepare: () => ({ ...PREPARED, pluginApp: true }),
      sandboxes: () => ({ ...written(), paths: [sandbox], pluginApp: true }),
      forget: forgetBuiltKeys,
      plugin: async () => {},
      run,
    });

    try {
      await buildOne('gridlock', PLAIN, face);
      await buildOne('gridlock', PLAIN, pluginApp);
      await buildOne('gridlock', PLAIN, face);

      const result = calls.map((line) => line.split(': ')[1]);

      expect(result).toEqual(['pebble clean', 'pebble build', 'pebble build', 'pebble clean', 'pebble build']);
    } finally {
      fs.rmSync(sandbox, { recursive: true, force: true });
    }
  });
});
