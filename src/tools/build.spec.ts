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
import { buildSandboxes, facesToBuild, parseBuildArgs } from './build.ts';
import type { PebbleRun, PebbleRunner } from './shared/pebble.ts';

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
