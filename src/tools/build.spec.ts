/**
 * Specs for the build's own decisions.
 *
 * The build hands most of its work to the manifest step, the pkjs build, and pebble, which are pinned
 * elsewhere or left to the device. What it decides itself is which faces to build, what goes on to
 * pebble build, and when to stop. A wrong answer there builds the wrong face, builds nothing, drops a
 * flag the developer asked for, or lets CI read a failed build as a pass.
 */
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { buildOne, buildSandboxes, facesToBuild, parseBuildArgs, type BuildSteps } from './build.ts';
import type { CheckedAppinfo, WrittenSandboxes } from './manifest/build-manifests.ts';
import type { PebbleRun, PebbleRunner } from './shared/pebble.ts';

// the phone build's log line looks the face up in a unit, which a spec does not have
vi.mock(import('./pkjs/build-pkjs.ts'), async (original) => ({ ...(await original()), describeBuild: () => 'built emit/' }));

/** A sandbox step's answer for one gridlock-face sandbox, with a checked appinfo holding the given defines. */
function written(textDefines: Record<string, string> = {}): WrittenSandboxes {
  const checked = { targets: ['gridlock-face'], defines: { PLUGIN_WEATHER: 1 }, providers: {}, permissions: [], textDefines, warnings: [] } as CheckedAppinfo;

  return { paths: ['/unit/targets/gridlock-face'], checked, messageKeys: ['WEATHER_REQUEST'] };
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

    expect(result).toEqual({ target: 'gridlock', clean: true, forward: ['--debug', '--verbose'] });
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
});

describe('buildOne', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /**
   * The header comes from the compiled phone code and the face's C includes it. Written before the
   * phone build it would count the last build's page, and after pebble build it would be missing on a
   * fresh sandbox, which stops the build at configure.
   */
  test('checks the page and writes its header after the phone build and before pebble build', () => {
    const order: string[] = [];
    const { calls, run } = recordingPebble([]);
    const steps: BuildSteps = {
      sandboxes: () => { order.push('sandboxes'); return written(); },
      phone: () => { order.push('phone'); return { targets: ['gridlock-face'], generated: [], icaljs: false, plugins: [], providers: [] }; },
      page: () => { order.push('page'); return []; },
      check: () => { order.push('check'); },
      header: (face, targets) => { order.push(`header ${targets.join(' ')}`); },
      run: (args, sandbox) => { order.push('pebble'); return run(args, sandbox); },
    };

    buildOne('gridlock', false, [], steps);

    expect(order).toEqual(['sandboxes', 'phone', 'page', 'check', 'header gridlock-face', 'pebble']);
    expect(calls).toEqual(['gridlock-face: pebble build']);
  });

  /**
   * The check has to judge the page against the appinfo the sandboxes were written from, and against
   * the very facts the header is written from, or it could pass a page whose header says something else.
   */
  test('checks the page against the sandbox step\'s appinfo and the facts the header gets', () => {
    const seen: { appinfo?: unknown; checked?: unknown; header?: unknown } = {};
    const steps: BuildSteps = {
      sandboxes: () => written({ PLUGIN_SOURCE_WEATHER_DEFAULT: 'owm' }),
      phone: () => ({ targets: ['gridlock-face'], generated: [], icaljs: false, plugins: [], providers: [] }),
      page: () => [],
      check: (face, pages, facts, appinfo) => { seen.checked = facts; seen.appinfo = appinfo; },
      header: (face, targets, facts) => { seen.header = facts; },
      run: () => ({ status: 0, signal: null }),
    };

    buildOne('gridlock', false, [], steps);

    expect(seen.appinfo).toEqual({ messageKeys: ['WEATHER_REQUEST'], textDefines: { PLUGIN_SOURCE_WEATHER_DEFAULT: 'owm' } });
    expect(seen.checked).toBe(seen.header);
  });

  /** A face field reading a default the header left out stops at compile, so the build log has to say which key and why. */
  test('logs each face key it leaves out of the header for opening differently by platform', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const page = { platform: 'emery', clay: { config: [{ type: 'select', messageKey: 'LAYOUT_NIGHT_MODE', defaultValue: 0, options: [{ value: 0 }, { value: 1 }] }] } };
    const round = { platform: 'gabbro', clay: { config: [{ type: 'select', messageKey: 'LAYOUT_NIGHT_MODE', defaultValue: 1, options: [{ value: 0 }, { value: 1 }] }] } };
    const steps: BuildSteps = {
      sandboxes: () => written(),
      phone: () => ({ targets: ['gridlock-face'], generated: [], icaljs: false, plugins: [], providers: [] }),
      page: () => [page, round] as unknown as ReturnType<BuildSteps['page']>,
      check: () => {},
      header: () => {},
      run: () => ({ status: 0, signal: null }),
    };

    buildOne('gridlock', false, [], steps);

    expect(log).toHaveBeenCalledWith("gridlock's settings page opens LAYOUT_NIGHT_MODE on different values on different platforms, so page/settings_page.h holds no SETTINGS_DEFAULT_LAYOUT_NIGHT_MODE");
  });

  /** A page the build refuses has to stop it before the header, or pebble build would take the counts and defaults of a page the face has to fix. */
  test('stops on a refused page before it writes the header or runs pebble', () => {
    const order: string[] = [];
    const steps: BuildSteps = {
      sandboxes: () => written(),
      phone: () => ({ targets: ['gridlock-face'], generated: [], icaljs: false, plugins: [], providers: [] }),
      page: () => [],
      check: () => { throw new Error('refused'); },
      header: () => { order.push('header'); },
      run: () => { order.push('pebble'); return { status: 0, signal: null }; },
    };

    const call = () => buildOne('gridlock', false, [], steps);

    expect(call).toThrow('refused');
    expect(order).toEqual([]);
  });
});
