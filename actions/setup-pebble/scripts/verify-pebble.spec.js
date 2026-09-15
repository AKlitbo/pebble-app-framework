/**
 * Specs for the step that checks the Pebble toolchain.
 *
 * This step runs before every face build and release. What is worth pinning is that a toolchain that did
 * not install fails here with a plain reason, that a pinned SDK really is the active one, and that the
 * versions in use always reach the summary, since with latest that is the only record of what built a face.
 */
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { fakeCore, fakeExec } from '../../../shared/fakes.js';
import verifyPebble from './verify-pebble.js';

const VERSION = 'Pebble Tool v5.0.39 (active SDK: v4.17)\n';
const SDK_LIST = 'Installed SDKs:\n4.17 (active)\n\nAvailable SDKs:\n4.33.1\n';
const NEWER_SDK = '\x1b[1m\x1b[33mA new SDK is available: v4.33.1 (current: v4.17)\x1b[0m\n';

// answers pebble --version and pebble sdk list, each from its own override when a spec gives one
function pebble({ version = { stdout: VERSION }, list = { stdout: SDK_LIST } } = {}) {
  return ({ args }) => (args[0] === '--version' ? version : list);
}

async function verify(answer) {
  const core = fakeCore();
  const exec = fakeExec(answer);
  await verifyPebble({ core, exec });
  return { core, exec };
}

beforeEach(() => {
  vi.stubEnv('SDK_VERSION', 'latest');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('verify-pebble', () => {
  /** With the SDK left at latest, the summary is the only place a later reader finds which SDK built the face. */
  test('passes a working toolchain and puts its versions on the summary', async () => {
    const { core } = await verify(pebble());

    expect(core.setFailed).not.toHaveBeenCalled();
    expect(core.summary.addRaw.mock.calls[0][0]).toContain('| 5.0.39 | 4.17 | 4.17 | latest |');
  });

  /** exec throws when the command is missing, and without catching it the step would crash with a stack trace. */
  test('fails with the reason when pebble cannot run', async () => {
    const { core } = await verify(() => {
      throw new Error('Unable to locate executable file: pebble');
    });

    expect(core.setFailed).toHaveBeenCalledWith('pebble could not run, so pebble-tool did not install cleanly. Unable to locate executable file: pebble');
  });

  /** A tool with no SDK would get as far as pebble build and fail there with an error that never mentions the SDK. */
  test('fails when no SDK is active', async () => {
    const { core } = await verify(pebble({ version: { stdout: 'Pebble Tool v5.0.39\n' } }));

    expect(core.setFailed).toHaveBeenCalledWith('pebble-tool installed, but no SDK is active, so pebble build has nothing to build with.');
  });

  /** A cache or an install that left another SDK active would build a release with a toolchain nobody asked for. */
  test('fails when a pinned SDK is not the active one', async () => {
    vi.stubEnv('SDK_VERSION', '4.33.1');

    const { core } = await verify(pebble());

    expect(core.setFailed).toHaveBeenCalledWith('SDK 4.33.1 was asked for, but SDK 4.17 is active.');
  });

  /** A crash prints no version line, and treating that as a pass would leave the build to fail later with no clue why. */
  test('fails when pebble --version names no version', async () => {
    const { core } = await verify(pebble({ version: { exitCode: 1, stderr: 'ModuleNotFoundError: No module named pebble_tool' } }));

    expect(core.setFailed).toHaveBeenCalledWith('pebble --version exited 1 without naming its version.');
    expect(core.summary.addRaw.mock.calls[0][0]).toContain('No module named pebble_tool');
  });

  /** A newer SDK is the first thing to rule in or out when a pinned face stops building the same way. */
  test('notes a newer SDK without failing', async () => {
    const { core } = await verify(pebble({ version: { stdout: VERSION, stderr: NEWER_SDK } }));

    expect(core.notice).toHaveBeenCalledWith('SDK 4.33.1 is out. This build uses 4.17.', { title: 'Newer SDK' });
    expect(core.setFailed).not.toHaveBeenCalled();
  });
});
