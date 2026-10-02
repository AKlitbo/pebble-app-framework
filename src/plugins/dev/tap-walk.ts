/**
 * Screenshots every state of a face's dev tap walk, from WSL with the Pebble SDK installed.
 *
 * With `DEV_MODE` and one of the face's walk switches, such as `DEV_TAP_WALK_THEMES`, on in its
 * src/c/dev/dev.h, each accel tap steps the face to its next state. This taps, waits for the redraw,
 * and takes a screenshot, over and over, and stops once a shot matches the first one, since the walk
 * has come back round to the start.
 *
 * Some taps draw the same as a state already saved, so a shot is kept only when its sha256 is new.
 * The walk pins the clock, so one state always draws the same bytes, and the sha256 tells states
 * apart and spots the return to the start.
 *
 * The face comes first. The walk uses whatever is running on the emulator, and --install puts the
 * face's latest build there first. A face that ships several targets builds each in a sandbox of its
 * own, such as gridlock-face and gridlock-app, so --target picks the one --install installs.
 * Building is left to paf build, which knows when a clean build is needed, so a face is built with
 * paf build before --install puts it on the emulator.
 *
 * Usage, from the unit that holds the face: paf tool <face> tap-walk [options], which runs it as
 * node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON paf/plugins/dev/tap-walk.ts <face> [options].
 * USAGE below lists the options.
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { faceTargetNames } from '../../tools/manifest/build-manifests.ts';
import { WORKSPACE } from '../../tools/shared/paths.ts';
import { runPebble, type PebbleRunner } from '../../tools/shared/pebble.ts';
import { ToolError, reportFailure } from '../../tools/shared/tool-error.ts';
import { isMainScript } from '../../tools/shared/entry.ts';

/** The most taps a walk takes before it gives up on ever getting back to the start. */
const MAX_TAPS = 200;

/** How long the firmware gets to redraw after a tap, in ms. */
const SETTLE_MS = 900;

/**
 * How long one screenshot or tap may take before the walk gives up on the emulator, in ms. Both
 * finish in well under a second, so one still going after this has a stuck emulator behind it.
 */
const STEP_TIMEOUT_MS = 30_000;

/**
 * How long a step that may boot the emulator gets, in ms. The install boots it for --install, and
 * the first shot does when it is not running yet, which on WSL can take a minute or more.
 */
const BOOT_TIMEOUT_MS = 180_000;

/** How long a freshly installed face gets to start up before the first shot, in ms. */
const INSTALL_SETTLE_MS = 2000;

/** Where the shots go, relative to the unit. .tmp is gitignored, so they never get committed. */
export const DEFAULT_OUT = '.tmp/tap-walk-shots';

/** What a walk that never moves has to check, since its taps change nothing on the watch. */
const SWITCH_HINT = "Check DEV_MODE and one of the face's walk switches, such as DEV_TAP_WALK_THEMES, are on in its src/c/dev/dev.h";

/** Files an OS drops in a folder someone opened to look at the shots. */
const OS_FILES = new Set(['desktop.ini', 'Thumbs.db', '.DS_Store']);

/** What -h prints. */
const USAGE = `usage: paf tool <face> tap-walk [options]
   or: node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON paf/plugins/dev/tap-walk.ts <face> [options]

Screenshots every state of the face's dev tap walk, from WSL with the Pebble SDK installed, run from
the unit that holds the face. Turn on DEV_MODE and one of the face's walk switches, such as
DEV_TAP_WALK_THEMES, in its src/c/dev/dev.h first. Each new state is saved as shot_000.png,
shot_001.png, and so on.

  --install           install the face's latest build on the emulator first.
                      Build it with paf build <face> beforehand
  --emulator=<name>   the emulator to walk, emery by default
  --out=<folder>      where the shots go, relative to the unit, ${DEFAULT_OUT} by default.
                      It is emptied first, so it has to hold only earlier shots
  --target=<target>   the build --install installs, for a face that ships several
  -h, --help          print this`;

/** What a tap walk was asked for. */
export type TapWalkArgs = {
  /** The face to walk, or empty when only the usage was asked for. */
  face: string;
  /** Whether to install the face's latest build first. */
  install: boolean;
  /** The emulator to walk. */
  emulator: string;
  /** Where the shots go, relative to the unit unless it is absolute. */
  out: string;
  /** The target asked for with --target, or null to take the face's only one. */
  target: string | null;
  /** Whether -h or --help asked for the usage. */
  help: boolean;
};

/** What the walk does to the emulator and the out folder, which a spec swaps for a recorder. */
export type WalkIo = {
  /** Takes a screenshot and hands back its PNG bytes. */
  screenshot(): Buffer;
  /** Sends one accel tap. */
  tap(): void;
  /** Waits for the redraw after a tap. */
  settle(): void;
  /** Saves a new state's PNG as the shot numbered index. */
  save(index: number, png: Buffer): void;
  /** Where save puts the shots, as the log names them. */
  folder: string;
};

/** How a walk that got back to the start went. */
export type WalkResult = {
  /** The taps it took to get back to the start. */
  taps: number;
  /** The different states saved, the start included. */
  states: number;
};

/**
 * Reads what a tap walk was asked for.
 *
 * The face comes first, and the flags can follow in any order. -h or --help anywhere asks for the
 * usage and nothing else. A second face or a flag this does not know stops it, since either one is
 * most likely a typo that would otherwise walk something other than what was meant. So does a
 * --target with no --install, since only the install reads a target.
 *
 * @param args The command line after the script.
 * @return The face, the flags, and whether only the usage was asked for.
 */
export function parseTapWalkArgs(args: string[]): TapWalkArgs {
  const parsed: TapWalkArgs = { face: '', install: false, emulator: 'emery', out: DEFAULT_OUT, target: null, help: false };

  if (args.includes('-h') || args.includes('--help')) {
    return { ...parsed, help: true };
  }

  const [face, ...rest] = args;

  if (!face || face.startsWith('-')) {
    throw new ToolError('no face given. Pass it first, as in paf tool ridgeline tap-walk, or paf tool gridlock tap-walk --install --target=gridlock-face');
  }

  parsed.face = face;

  for (const arg of rest) {
    const equals = arg.indexOf('=');
    const flag = equals === -1 ? arg : arg.slice(0, equals);
    const value = equals === -1 ? '' : arg.slice(equals + 1);

    if (arg === '--install') {
      parsed.install = true;
    } else if (value && flag === '--emulator') {
      parsed.emulator = value;
    } else if (value && flag === '--out') {
      parsed.out = value;
    } else if (value && flag === '--target') {
      parsed.target = value;
    } else {
      throw new ToolError(`unknown argument: ${arg}. Run with --help for the options`);
    }
  }

  // a target only names a build to install, so one given without --install would be dropped unsaid
  if (parsed.target !== null && !parsed.install) {
    throw new ToolError('--target picks the build --install puts on the emulator, so it needs --install');
  }

  return parsed;
}

/**
 * The target --install installs, out of the ones the face declares.
 *
 * A face with one target needs no --target. A face with several stops until one is picked, and a
 * --target the face does not declare stops too, since either way the install would look for a .pbw
 * that is not there, or is not the one meant.
 *
 * @param face The face being walked, which a refusal names.
 * @param declared The target names the face declares.
 * @param wanted The target asked for with --target, or null when none was.
 * @return The target to install.
 */
export function pickTarget(face: string, declared: string[], wanted: string | null): string {
  if (wanted !== null) {
    if (!declared.includes(wanted)) {
      throw new ToolError(`${face} has no target ${wanted}. Its targets are: ${declared.join(' ')}`);
    }

    return wanted;
  }

  if (declared.length > 1) {
    throw new ToolError(`${face} ships several targets. Pick one with --target, from: ${declared.join(' ')}`);
  }

  return declared[0];
}

/**
 * Where the out folder sits, refusing one outside the unit.
 *
 * The folder is emptied before the walk, so an --out of . or .. would take the face's source with it,
 * and one outside the unit could empty a folder that belongs to something else.
 *
 * @param out The folder asked for, relative to the unit unless it is absolute.
 * @param unit The unit's folder, which a spec passes in.
 * @return The out folder's absolute path.
 */
export function outFolder(out: string, unit: string = WORKSPACE): string {
  const dir = path.resolve(unit, out);
  const down = path.relative(unit, dir);
  // a folder name can start with two dots, so only a whole .. step counts as leaving the unit
  const inside = down !== '' && down !== '..' && !down.startsWith(`..${path.sep}`) && !path.isAbsolute(down);

  if (!inside) {
    throw new ToolError(`--out=${out} is not a folder inside the unit, and the out folder is emptied first. Pick one inside it, such as ${DEFAULT_OUT}`);
  }

  return dir;
}

/**
 * Whether a file is one the walk may clear: a numbered shot, a .candidate.png a walk stopped partway can
 * leave in the out folder, or a file the OS left beside them.
 */
function isWalkFile(name: string): boolean {
  return /^shot_\d+\.png$/.test(name) || name === '.candidate.png' || OS_FILES.has(name);
}

/**
 * Empties the out folder for a fresh walk, or makes it.
 *
 * A folder holding anything the walk did not write is refused and left alone, since an --out that
 * points at the face's source, the build sandboxes, or a home folder would otherwise be wiped.
 *
 * @param dir The out folder's absolute path.
 */
export function clearOut(dir: string): void {
  if (fs.existsSync(dir)) {
    if (!fs.statSync(dir).isDirectory()) {
      throw new ToolError(`${dir} is a file, and the shots need a folder. Pick one such as ${DEFAULT_OUT}`);
    }

    const stray = fs.readdirSync(dir).filter((name) => !isWalkFile(name));

    if (stray.length > 0) {
      throw new ToolError(`${dir} holds files the walk did not write, such as ${stray[0]}. The out folder is emptied first, so pick one that holds only earlier shots, such as ${DEFAULT_OUT}`);
    }

    fs.rmSync(dir, { recursive: true });
  }

  fs.mkdirSync(dir, { recursive: true });
}

/** Where a target's .pbw is built. A target's name is also its sandbox's. */
function pbwPath(target: string): string {
  return path.join(WORKSPACE, 'targets', target, 'build', `${target}.pbw`);
}

/** A shot's sha256, which is what tells one state from another. */
function sha256(png: Buffer): string {
  return createHash('sha256').update(png).digest('hex');
}

/** A shot's label in the log, which is its file name without the .png. */
function shotLabel(index: number): string {
  return `shot_${String(index).padStart(3, '0')}`;
}

/** The file a state's shot is saved as, such as shot_000.png for the start. */
function shotName(index: number): string {
  return `${shotLabel(index)}.png`;
}

/**
 * Walks the face round its states and saves each new one.
 *
 * The start is saved before the first tap. Then each round taps, waits for the redraw, and takes a
 * shot. A shot matching the start ends the walk. A shot matching a saved state is skipped without
 * using up a number, so the saved shots run on with no gaps. Anything else is a new state, and is
 * saved under the next number.
 *
 * @param io What taps, waits, shoots, and saves.
 * @param maxTaps The most taps to take before giving up.
 * @return The taps it took to get back to the start, and the states it saved.
 */
export function walk(io: WalkIo, maxTaps: number = MAX_TAPS): WalkResult {
  console.log('>> capturing starting state');
  const first = io.screenshot();
  const start = sha256(first);

  io.save(0, first);
  const seen = new Set([start]);

  console.log(`   ${shotLabel(0)}  ${start}  (start)`);

  for (let tap = 1; tap <= maxTaps; tap++) {
    io.tap();
    io.settle();
    const png = io.screenshot();
    const shot = sha256(png);

    if (shot === start) {
      // a walk has at least two states to step between, so a first tap that draws the start again
      // means the taps change nothing rather than that the walk came round
      if (tap === 1) {
        throw new ToolError(`the first tap drew the same screen as the start, so the taps change nothing on the watch. ${SWITCH_HINT}`);
      }

      console.log(`>> wrapped back to start after ${tap} taps`);
      return { taps: tap, states: seen.size };
    }

    if (seen.has(shot)) {
      console.log(`   tap ${String(tap).padEnd(3)}   ${shot}  (dup, skipped)`);
      continue;
    }

    const index = seen.size;

    seen.add(shot);
    io.save(index, png);
    console.log(`   ${shotLabel(index)}  ${shot}`);
  }

  throw new ToolError(`hit MAX_TAPS (${maxTaps}) without wrapping, after saving ${seen.size} unique states in ${io.folder}/. ${SWITCH_HINT}`);
}

/**
 * Installs a target's latest build on the emulator and gives it time to start.
 *
 * It installs rather than builds, since paf build is what knows when a message key or framework
 * change needs a clean build, and an incremental build here would miss that.
 */
function installFace(face: string, target: string, emulator: string): void {
  const pbw = pbwPath(target);

  if (!fs.existsSync(pbw)) {
    throw new ToolError(`no build at ${path.relative(WORKSPACE, pbw)}. Build it with paf build ${face} first`);
  }

  console.log(`>> installing ${target} on ${emulator}`);
  runPebble(['install', '--emulator', emulator, pbw], WORKSPACE, pebbleRunner(BOOT_TIMEOUT_MS), onEmulator(emulator));
  sleepSync(INSTALL_SETTLE_MS);
}

/**
 * The real pebble, stopped by a timeout when it never finishes, since the walk is built to run
 * unattended and a stuck emulator would otherwise hang it on one step.
 */
function pebbleRunner(timeout: number): PebbleRunner {
  return (args, cwd) => {
    const run = spawnSync('pebble', args, { cwd, stdio: ['ignore', 'pipe', 'pipe'], timeout });

    // pebble draws progress bars on stderr, which would land between the walk's own lines, so what
    // it prints is held back and shown only when the step fails, where it says why
    if (run.status !== 0) {
      process.stderr.write(run.stdout ?? '');
      process.stderr.write(run.stderr ?? '');
    }

    return run;
  };
}

/** What a failed pebble step on the emulator names, in place of the folder it ran in. */
function onEmulator(emulator: string): string {
  return `the ${emulator} emulator`;
}

/** Waits without giving up the thread, since every step of the walk runs in order. */
function sleepSync(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/**
 * The pebble screenshot, tap, and file steps the real walk runs. Each screenshot lands in the
 * candidate file first and only reaches the out folder once the walk keeps it.
 */
function emulatorIo(emulator: string, dir: string, candidate: string): WalkIo {
  const where = onEmulator(emulator);
  const step = pebbleRunner(STEP_TIMEOUT_MS);
  // the first shot boots the emulator when it is not running yet, so it gets the longer timeout
  const boot = pebbleRunner(BOOT_TIMEOUT_MS);
  let booted = false;

  return {
    folder: path.relative(process.cwd(), dir) || '.',
    screenshot() {
      const run = booted ? step : boot;

      booted = true;
      runPebble(['screenshot', '--no-open', '--emulator', emulator, candidate], WORKSPACE, run, where);

      if (!fs.existsSync(candidate)) {
        throw new ToolError(`pebble screenshot left no file. Check the ${emulator} emulator is running with the face on it`);
      }

      const png = fs.readFileSync(candidate);

      fs.rmSync(candidate);
      return png;
    },
    tap() {
      runPebble(['emu-tap', '--emulator', emulator], WORKSPACE, step, where);
    },
    settle() {
      sleepSync(SETTLE_MS);
    },
    save(index, png) {
      fs.writeFileSync(path.join(dir, shotName(index)), png);
    },
  };
}

function main(): void {
  try {
    const args = parseTapWalkArgs(process.argv.slice(2));

    if (args.help) {
      console.log(USAGE);
      return;
    }

    // a face the unit does not hold stops here, whether or not anything is installed
    const declared = faceTargetNames(args.face);
    const dir = outFolder(args.out);

    // only the install reads a build, so a walk of what is already on the emulator needs no target
    if (args.install) {
      installFace(args.face, pickTarget(args.face, declared, args.target), args.emulator);
    }

    // the last walk's shots are only cleared once this one is sure to start
    clearOut(dir);
    // the screenshot waiting to be checked sits outside the out folder, so a failed step never
    // leaves it among the shots
    const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'tap-walk-'));

    try {
      const io = emulatorIo(args.emulator, dir, path.join(scratch, 'candidate.png'));
      const { states } = walk(io);

      console.log(`>> ${states} unique states captured in ${io.folder}/`);
    } finally {
      fs.rmSync(scratch, { recursive: true, force: true });
    }
  } catch (error) {
    reportFailure(error);
  }
}

if (isMainScript(import.meta)) {
  main();
}
