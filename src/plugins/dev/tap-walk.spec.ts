/**
 * Specs for the tap walk's own decisions.
 *
 * The walk hands the emulator work to pebble, which is left to the device. What it decides itself is
 * what it was asked for, which target it walks, where the shots go, and which shots it keeps and when
 * it stops. A wrong answer there walks the wrong build, wipes the unit, leaves a gap or a repeat in the
 * numbered shots, or runs to the tap limit on a walk that already came back round.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { DEFAULT_OUT, clearOut, outFolder, parseTapWalkArgs, pickTarget, walk, type WalkIo } from './tap-walk.ts';

/**
 * A walk whose screenshots are the given states in order, recording each step it takes. Running out of
 * states fails loudly, so a walk that goes on past where it should have stopped cannot pass.
 */
function recordingWalk(states: string[]): { calls: string[]; io: WalkIo } {
  const calls: string[] = [];
  const shots = [...states];
  const io: WalkIo = {
    screenshot() {
      calls.push('shoot');
      const state = shots.shift();

      if (state === undefined) {
        throw new Error('the walk took more screenshots than the spec has states');
      }

      return Buffer.from(state);
    },
    tap() {
      calls.push('tap');
    },
    settle() {
      calls.push('settle');
    },
    save(index) {
      calls.push(`save ${index}`);
    },
    folder: '.tmp/tap-walk-shots',
  };

  return { calls, io };
}

/** The shots a recorded walk saved, by number. */
function saved(calls: string[]): number[] {
  return calls.filter((call) => call.startsWith('save ')).map((call) => Number(call.slice('save '.length)));
}

describe('parseTapWalkArgs', () => {
  /** A flag in the face's place would be taken for a face, and the walk would stop on no such face. */
  test.each([[[]], [['--install']]])('stops when no face comes first in %j', (args) => {
    const call = () => parseTapWalkArgs(args);

    expect(call).toThrow(/no face given/);
  });

  /** A second face is most likely a typo, and walking only the first would hide that. */
  test('refuses a second face', () => {
    const call = () => parseTapWalkArgs(['ridgeline', 'shoreline']);

    expect(call).toThrow('unknown argument: shoreline');
  });

  /** A misspelt flag that was dropped would walk without the install or the target that was asked for. */
  test('refuses an unknown flag', () => {
    const call = () => parseTapWalkArgs(['ridgeline', '--instal']);

    expect(call).toThrow('unknown argument: --instal');
  });

  /** A flag read only in one spot would be dropped from any other order someone types. */
  test('reads every flag wherever it sits after the face', () => {
    const result = parseTapWalkArgs(['gridlock', '--target=gridlock-face', '--out=shots', '--install', '--emulator=gabbro']);

    expect(result).toEqual({ face: 'gridlock', install: true, emulator: 'gabbro', out: 'shots', target: 'gridlock-face', help: false });
  });

  /** A target given with no install was dropped, and the walk shot whatever was on the emulator as if it were that target. */
  test('refuses --target without --install', () => {
    const call = () => parseTapWalkArgs(['gridlock', '--target=gridlock-face']);

    expect(call).toThrow('--target picks the build --install puts on the emulator, so it needs --install');
  });
});

describe('pickTarget', () => {
  /** A face with one target would otherwise have to name it twice to walk at all. */
  test('takes the only target without --target', () => {
    const result = pickTarget('ridgeline', ['ridgeline'], null);

    expect(result).toBe('ridgeline');
  });

  /** Walking one of several targets unasked could screenshot the watchapp when the watchface was meant. */
  test('stops on several targets without --target, naming them', () => {
    const call = () => pickTarget('gridlock', ['gridlock-face', 'gridlock-app'], null);

    expect(call).toThrow('gridlock ships several targets. Pick one with --target, from: gridlock-face gridlock-app');
  });

  /** A --target the face does not declare would walk a stale .pbw another face built. */
  test('refuses a --target the face does not declare, naming the ones it does', () => {
    const call = () => pickTarget('ridgeline', ['ridgeline'], 'gridlock-face');

    expect(call).toThrow('ridgeline has no target gridlock-face. Its targets are: ridgeline');
  });
});

describe('outFolder', () => {
  const UNIT = path.resolve('/work/watchfaces/mosaic');

  /** The out folder is emptied before the walk, so one at the unit or above it would take the face's source with it. */
  test.each(['.', '..', '../..', path.parse(UNIT).root])('refuses %j, which is the unit or above it', (out) => {
    const call = () => outFolder(out, UNIT);

    expect(call).toThrow(/is not a folder inside the unit/);
  });

  /** A unit whose folder name starts with two dots is still inside the folder above it, which would be wiped. */
  test('refuses the folder above a unit whose name starts with two dots', () => {
    const call = () => outFolder('..', path.resolve('/work/..mosaic'));

    expect(call).toThrow(/is not a folder inside the unit/);
  });

  /** A folder outside the unit may belong to something else, and the walk empties it first. */
  test.each(['../gridlock-shots', path.resolve('/home/me/shots')])('refuses %j, which is outside the unit', (out) => {
    const call = () => outFolder(out, UNIT);

    expect(call).toThrow(/is not a folder inside the unit/);
  });

  /** A folder of the unit's own whose name starts with two dots is inside it, not a step up. */
  test('keeps a folder inside the unit whose name starts with two dots', () => {
    const result = outFolder('..shots', UNIT);

    expect(result).toBe(path.join(UNIT, '..shots'));
  });

  /** A guard that also caught the default would stop every walk before it started. */
  test('puts the default inside the unit', () => {
    const result = outFolder(DEFAULT_OUT, UNIT);

    expect(result).toBe(path.join(UNIT, '.tmp', 'tap-walk-shots'));
  });
});

describe('clearOut', () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tap-walk-'));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  /** An --out pointing at the face's source or a home folder would have it wiped along with the shots. */
  test('refuses a folder holding a file the walk did not write, and leaves it alone', () => {
    fs.writeFileSync(path.join(dir, 'shot_000.png'), 'old shot');
    fs.writeFileSync(path.join(dir, 'main.c'), 'the face');

    const call = () => clearOut(dir);

    expect(call).toThrow(/holds files the walk did not write, such as main.c/);
    expect(fs.readdirSync(dir).sort()).toEqual(['main.c', 'shot_000.png']);
  });

  /** An --out naming a file would otherwise end the walk on a raw error from reading it as a folder. */
  test('refuses an out that is a file, and leaves it alone', () => {
    const file = path.join(dir, 'README.md');

    fs.writeFileSync(file, 'notes');

    const call = () => clearOut(file);

    expect(call).toThrow(/is a file, and the shots need a folder/);
    expect(fs.readFileSync(file, 'utf8')).toBe('notes');
  });

  /**
   * Shots kept from the last walk would mix with this one's, so a state that is gone would still look
   * current. Opening the folder to look at them leaves a Thumbs.db or .DS_Store behind, and refusing
   * those would stop every walk after the first look.
   */
  test('empties a folder holding only earlier shots and the files an OS leaves beside them', () => {
    fs.writeFileSync(path.join(dir, 'shot_000.png'), 'old shot');
    fs.writeFileSync(path.join(dir, 'Thumbs.db'), 'thumbnails');
    fs.writeFileSync(path.join(dir, '.DS_Store'), 'finder');

    clearOut(dir);

    expect(fs.readdirSync(dir)).toEqual([]);
  });

  /** The framework 3 tap walk left a .candidate.png in the out folder when it stopped partway, and the next walk refused the folder. */
  test('empties a folder holding the candidate shot a stopped walk left', () => {
    fs.writeFileSync(path.join(dir, 'shot_000.png'), 'old shot');
    fs.writeFileSync(path.join(dir, '.candidate.png'), 'half a walk');

    clearOut(dir);

    expect(fs.readdirSync(dir)).toEqual([]);
  });
});

describe('walk', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /** A shot taken before the settle catches the face mid redraw, and a start saved late is not the start. */
  test('saves the start before any tap, then taps, settles, and shoots in that order', () => {
    const { calls, io } = recordingWalk(['S', 'A', 'S']);

    walk(io);

    expect(calls).toEqual(['shoot', 'save 0', 'tap', 'settle', 'shoot', 'save 1', 'tap', 'settle', 'shoot']);
  });

  /** A walk that missed the start coming round would keep tapping and save the whole loop again. */
  test('stops when a shot matches the start', () => {
    const { calls, io } = recordingWalk(['S', 'A', 'B', 'S']);

    const result = walk(io);

    expect(result).toEqual({ taps: 3, states: 3 });
    expect(saved(calls)).toEqual([0, 1, 2]);
  });

  /** A repeat that used up a number would leave a gap in the shots, or saved again, a duplicate. */
  test('skips a repeated state without using up a number', () => {
    const { calls, io } = recordingWalk(['S', 'A', 'A', 'B', 'S']);

    walk(io);

    expect(saved(calls)).toEqual([0, 1, 2]);
  });

  /** A walk whose switch is off never moves, and reporting its one screen as a finished walk would pass it. */
  test('stops when the first tap draws the start again, naming the dev switch', () => {
    const { io } = recordingWalk(['S', 'S']);

    const call = () => walk(io);

    expect(call).toThrow(/the first tap drew the same screen as the start.*DEV_TAP_WALK_THEMES/);
  });

  /**
   * A face whose shots never repeat, such as one showing the live clock, never comes back round, so
   * without a limit the walk runs forever. The shots it did save are named, since there can be up to
   * the limit of them in a folder the developer picked.
   */
  test('gives up after exactly maxTaps taps, naming the dev switch and where the shots went', () => {
    const { calls, io } = recordingWalk(['S', 'A', 'B', 'C']);

    const call = () => walk(io, 3);

    expect(call).toThrow(/after saving 4 unique states in \.tmp\/tap-walk-shots\/\. Check DEV_MODE.*DEV_TAP_WALK_THEMES/);
    expect(calls.filter((step) => step === 'tap')).toHaveLength(3);
  });
});
