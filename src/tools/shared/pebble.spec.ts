/**
 * Specs for running pebble from a tool.
 *
 * The build and the tap walk both read a failed pebble run through runPebble, so what it says for
 * each way a run can end is what either tool shows. The exit codes are pinned through the build's
 * own specs, and what is left here is telling a timeout apart from a pebble that never started.
 */
import { describe, expect, test } from 'vitest';
import { runPebble, type PebbleRunner } from './pebble.ts';

describe('runPebble', () => {
  /**
   * spawnSync reports a timeout as an error, the same way it reports a pebble it could not start.
   * Read as a missing SDK, a stuck emulator would send the developer off to reinstall the SDK.
   */
  test('says a step ran out of time rather than that the SDK is missing', () => {
    const timedOut = Object.assign(new Error('spawnSync pebble ETIMEDOUT'), { code: 'ETIMEDOUT' });
    const run: PebbleRunner = () => ({ status: null, signal: 'SIGTERM', error: timedOut });

    const call = () => runPebble(['emu-tap'], '/unit', run, 'the emery emulator');

    expect(call).toThrow('pebble emu-tap did not finish in time in the emery emulator, so it was stopped');
  });

  /** A pebble whose output ran past the buffer was blamed on a missing SDK, sending the developer to reinstall it. */
  test('gives the error itself for a run that failed another way', () => {
    const overflow = Object.assign(new Error('spawnSync pebble ENOBUFS'), { code: 'ENOBUFS' });
    const run: PebbleRunner = () => ({ status: null, signal: 'SIGTERM', error: overflow });

    const call = () => runPebble(['install'], '/unit', run, 'the emery emulator');

    expect(call).toThrow('pebble install could not run in the emery emulator: spawnSync pebble ENOBUFS');
  });

  /** spawnSync says ENOENT for a build sandbox that is not there, and it was blamed on a missing SDK. */
  test('names a folder that is not there rather than the SDK', () => {
    const missing = Object.assign(new Error('spawnSync pebble ENOENT'), { code: 'ENOENT' });
    const run: PebbleRunner = () => ({ status: null, signal: null, error: missing });

    const call = () => runPebble(['build'], '/no/such/sandbox', run, 'gridlock-face');

    expect(call).toThrow('pebble build could not run in gridlock-face, since /no/such/sandbox is not there');
  });
});
