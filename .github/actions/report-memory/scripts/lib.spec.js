/**
 * Specs for reading a face build's memory figures.
 *
 * The log is the SDK's plain output and nothing else turns it into numbers, so a block read against the wrong
 * target puts one face's heap on another's row. What is worth pinning is the two ways a sandbox prints more
 * than one block, several platforms in one sandbox and several targets from one face, and where virtual_size
 * sits in the binary. The log lines below are cut from real CI runs of Ridgeline and Gridlock.
 */
import { describe, expect, test } from 'vitest';
import { readBuildLog, readVirtualSize } from './lib.js';

// ridgeline builds gabbro and emery in one sandbox, so two blocks come before its one leaving line
const RIDGELINE = [
  "Waf: Entering directory `/home/runner/work/pebble-watchfaces/pebble-watchfaces/targets/ridgeline/build'",
  'GABBRO APP MEMORY USAGE',
  'Total size of resources:        24344 bytes / 256.0KB',
  'Total footprint in RAM:         24886 bytes / 128.0KB',
  'Free RAM available (heap):      106186 bytes',
  '------------------------------------------------------- ',
  '[ 88/102] Linking build/emery/pebble-app.elf',
  'EMERY APP MEMORY USAGE',
  'Total size of resources:        20872 bytes / 256.0KB',
  'Total footprint in RAM:         25592 bytes / 128.0KB',
  'Free RAM available (heap):      105480 bytes',
  '------------------------------------------------------- ',
  "Waf: Leaving directory `/home/runner/work/pebble-watchfaces/pebble-watchfaces/targets/ridgeline/build'",
].join('\n');

// gridlock builds a watchface and a watchapp from one face, each in its own sandbox
const GRIDLOCK = [
  'EMERY APP MEMORY USAGE',
  'Total size of resources:        109266 bytes / 256.0KB',
  'Total footprint in RAM:         59394 bytes / 128.0KB',
  'Free RAM available (heap):      71678 bytes',
  "Waf: Leaving directory `/home/runner/work/pebble-watchfaces/pebble-watchfaces/targets/gridlock-face/build'",
  "'build' finished successfully (6.505s)",
  'EMERY APP MEMORY USAGE',
  'Total size of resources:        109266 bytes / 256.0KB',
  'Total footprint in RAM:         59390 bytes / 128.0KB',
  'Free RAM available (heap):      71682 bytes',
  "Waf: Leaving directory `/home/runner/work/pebble-watchfaces/pebble-watchfaces/targets/gridlock-app/build'",
].join('\n');

describe('readBuildLog', () => {
  /** The platform name only comes on the header, and losing track of it would report emery's heap as gabbro's. */
  test('reads each platform in a sandbox that builds several', () => {
    const result = readBuildLog(RIDGELINE);

    expect(result).toEqual([
      { target: 'ridgeline', platform: 'gabbro', resources: 24344, footprint: 24886, free: 106186 },
      { target: 'ridgeline', platform: 'emery', resources: 20872, footprint: 25592, free: 105480 },
    ]);
  });

  /** Each target's figures are only named by the line after them, so a block held too long lands on the next target. */
  test('matches each block to its own target when a face builds several', () => {
    const result = readBuildLog(GRIDLOCK);

    expect(result.map((row) => [row.target, row.free])).toEqual([['gridlock-face', 71678], ['gridlock-app', 71682]]);
  });

  /** A log cut off partway through a block would otherwise report a heap of undefined, which renders as NaN KB. */
  test('leaves out a block missing one of its figures', () => {
    const cut = RIDGELINE.split('\n').filter((line) => !line.includes('106186')).join('\n');

    const result = readBuildLog(cut);

    expect(result.map((row) => row.platform)).toEqual(['emery']);
  });
});

describe('readVirtualSize', () => {
  /** The static size is the limit a face usually hits first, and reading the wrong offset or byte order reports nonsense for it. */
  test('reads virtual_size as a little endian uint16 at 0x80', () => {
    const binary = Buffer.alloc(0x100);
    binary.writeUInt16LE(59394, 0x80);

    const result = readVirtualSize(binary);

    expect(result).toBe(59394);
  });
});
