/**
 * Shoots a face's panel walk on the emulator and crops each panel into the picture the settings page's
 * layout builder shows for it, from WSL with the Pebble SDK installed.
 *
 * The face's walk in the unit's paf.dev.config.json has to be a panel walk, which shows one panel a
 * step through the face's dev_show_panel hook. This takes a screenshot of each step, crops each one at
 * where the panels block says its size sits, and writes it to the face's resources/thumbnails/ as
 * `<panel>-<size>.png`. It writes a picture only when its pixels differ from the one already there, so
 * a re-shoot that matches leaves the committed file alone. Then it runs the thumbnails plugin's
 * generator, which `paf gen <face> thumbnails` runs, so the settings page carries the new pictures.
 *
 * Every step of the walk is shot whether or not it draws the same as another, since the shots are
 * matched to the walk by their place in it. So the build on the emulator has to walk the very steps the
 * file lays out. The build writes a fingerprint of what it shows into the sandbox's header, and this
 * works it out again from the file and refuses a build whose fingerprint differs, or whose .pbw is older
 * than its header. Then it installs that .pbw itself, so the emulator runs the build it checked.
 *
 * The crop runs on its own with --shots, against a folder of screenshots already taken, so it can be
 * checked without the emulator. --out writes the pictures to another folder and skips the generator.
 *
 * Usage, from the unit that holds the face: paf tool <face> thumbnails [options]. USAGE below lists the
 * options.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import sharp, { type Sharp } from 'sharp';
import { faceTargetNames } from '../../tools/manifest/build-manifests.ts';
import { DEV_HEADER, harnessFingerprint, headerFingerprint, resolveWalk } from '../../tools/manifest/dev-header.ts';
import { unitDevSwitches } from '../../tools/manifest/dev-switches.ts';
import { thumbnailFiles, type CropRect, type PanelStep } from '../../tools/manifest/dev-walks.ts';
import { faceDir } from '../../tools/shared/faces.ts';
import { WORKSPACE } from '../../tools/shared/paths.ts';
import { ToolError, exitCodeOf, reportFailure } from '../../tools/shared/tool-error.ts';
import { isMainScript } from '../../tools/shared/entry.ts';
import { clearOut, emulatorIo, installFace, outFolder, pickTarget, shotName, type WalkIo } from './tap-walk.ts';

/** Where the walk's screenshots go, relative to the unit. .tmp is gitignored, so they never get committed. */
export const DEFAULT_SHOTS = '.tmp/thumbnail-shots';

/** What -h prints. */
const USAGE = `usage: paf tool <face> thumbnails [options]

Installs the face's dev build on the emulator, shoots its panel walk, crops each panel into
resources/thumbnails/, and runs the thumbnails generator, from WSL with the Pebble SDK installed.
Pick a panel walk for the face in the unit's paf.dev.config.json and build it with
paf build <face> --dev first.

  --emulator=<name>   the emulator to walk, emery by default
  --target=<target>   the build to install, for a face that ships several
  --shots=<folder>    crop the screenshots already in a folder rather than walking the emulator.
                      They are named shot_000.png, shot_001.png, and on, one a step of the walk
  --out=<folder>      write the pictures to a folder of their own rather than resources/thumbnails,
                      and leave the generator alone
  -h, --help          print this`;

/** What a thumbnails run was asked for. */
export type ThumbnailArgs = {
  /** The face, or empty when only the usage was asked for. */
  face: string;
  /** The emulator to walk. */
  emulator: string;
  /** The target asked for with --target, or null to take the face's only one. */
  target: string | null;
  /** A folder of screenshots to crop rather than walking the emulator, or null to walk it. */
  shots: string | null;
  /** A folder to write the pictures to rather than the face's thumbnails, or null for the face's. */
  out: string | null;
  /** Whether -h or --help asked for the usage. */
  help: boolean;
};

/** One picture the crop cuts: which screenshot, where in it, and the file it goes to. */
export type Crop = { shot: string; rect: CropRect; file: string };

/** What happened to one picture. */
export type CropResult = { file: string; status: 'new' | 'changed' | 'unchanged' };

/** A picture's pixels as RGBA bytes, with its width and height. */
export type Pixels = { data: Buffer; width: number; height: number };

/**
 * Reads what a thumbnails run was asked for.
 *
 * The face comes first, and the flags can follow in any order. A flag this does not know stops it, and
 * so does a --target with --shots, since cropping shots already taken never installs a build.
 *
 * @param args The command line after the script.
 * @return The face and the flags.
 */
export function parseThumbnailArgs(args: string[]): ThumbnailArgs {
  const parsed: ThumbnailArgs = { face: '', emulator: 'emery', target: null, shots: null, out: null, help: false };

  if (args.includes('-h') || args.includes('--help')) {
    return { ...parsed, help: true };
  }

  const [face, ...rest] = args;

  if (!face || face.startsWith('-')) {
    throw new ToolError('no face given. Pass it first, as in paf tool gridlock thumbnails --target=gridlock-face');
  }

  parsed.face = face;

  for (const arg of rest) {
    const equals = arg.indexOf('=');
    const flag = equals === -1 ? arg : arg.slice(0, equals);
    const value = equals === -1 ? '' : arg.slice(equals + 1);

    if (value && flag === '--emulator') {
      parsed.emulator = value;
    } else if (value && flag === '--target') {
      parsed.target = value;
    } else if (value && flag === '--shots') {
      parsed.shots = value;
    } else if (value && flag === '--out') {
      parsed.out = value;
    } else {
      throw new ToolError(`unknown argument: ${arg}. Run with --help for the options`);
    }
  }

  if (parsed.target !== null && parsed.shots !== null) {
    throw new ToolError('--shots crops screenshots already taken, so it installs no build for --target to pick. Leave out --target, or --shots to walk the emulator');
  }

  return parsed;
}

/**
 * Refuses a build that does not show what the file lays out now.
 *
 * The header's fingerprint covers the clock, the date, the settings, the readings, and the walk's
 * steps, so one that differs means the file changed after the build, and a shorter or reordered walk
 * would put pictures under the wrong names. A .pbw older than its header means the last build stopped
 * after it wrote the header, so the .pbw is an earlier one.
 *
 * @param header The sandbox's header text, or null when it has none.
 * @param headerTime When the header was last written, in ms.
 * @param pbwTime When the .pbw was last written, in ms, or null when there is none.
 * @param expected The fingerprint worked out from the file.
 * @param face The face, which a refusal names.
 */
export function checkBuild(header: string | null, headerTime: number, pbwTime: number | null, expected: string, face: string): void {
  const rebuild = `Build it again with paf build ${face} --dev`;

  if (header === null || pbwTime === null) {
    throw new ToolError(`${face} has no dev build to install. ${rebuild}`);
  }

  if (headerFingerprint(header) !== expected) {
    throw new ToolError(`${face}'s dev build shows something other than paf.dev.config.json lays out now, so its pictures would land under the wrong names or on the wrong clock. ${rebuild}`);
  }

  if (pbwTime < headerTime) {
    throw new ToolError(`${face}'s .pbw is older than the dev build's header, so the last build stopped partway. ${rebuild}`);
  }
}

/**
 * The pictures a panel walk's screenshots are cut into, one a step.
 *
 * Step n is shot n, so the first step's panel comes out of shot_000.png. Each is cut where its size
 * sits on the screen, which the panels block says.
 *
 * @param steps The walk's steps, from resolveWalk.
 * @param sizes Where each size sits, from the panels block.
 * @return The crops, in the walk's order.
 */
export function cropPlan(steps: PanelStep[], sizes: Record<string, { crop: CropRect }>): Crop[] {
  return steps.map((step, index) => ({ shot: shotName(index), rect: sizes[step.size].crop, file: `${step.panel}-${step.size}.png` }));
}

/**
 * Whether two pictures hold the same pixels.
 *
 * PNG encoders pack the same picture into different bytes, so the pictures are compared by their pixels.
 * A re-shoot that draws what is committed then leaves the file alone rather than showing a change.
 *
 * @param a One picture's pixels.
 * @param b The other's.
 * @return True when they are the same size and every pixel matches.
 */
export function samePixels(a: Pixels, b: Pixels): boolean {
  return a.width === b.width && a.height === b.height && a.data.equals(b.data);
}

/**
 * A picture's pixels as RGBA bytes.
 *
 * @param image A PNG's bytes, its file, or a sharp pipeline to finish.
 * @return Its pixels.
 */
export async function pixelsOf(image: Buffer | string | Sharp): Promise<Pixels> {
  const pipeline = typeof image === 'string' || Buffer.isBuffer(image) ? sharp(image) : image;
  const { data, info } = await pipeline.ensureAlpha().raw().toBuffer({ resolveWithObject: true });

  return { data, width: info.width, height: info.height };
}

/**
 * Cuts each picture out of its screenshot and writes the ones whose pixels changed.
 *
 * A screenshot's size comes from its header alone, and the crop is decoded once and compared as raw
 * pixels, so it is only encoded to PNG when it is written. A crop that runs past its screenshot's edge
 * stops the run, naming the size, since the panels block holds a crop that does not fit the watch.
 *
 * @param crops The pictures to cut, from cropPlan.
 * @param shotsDir The folder holding the screenshots.
 * @param outDir The folder the pictures go to, made when it is missing.
 * @return What happened to each picture, in the order of the crops.
 */
export async function cropShots(crops: Crop[], shotsDir: string, outDir: string): Promise<CropResult[]> {
  fs.mkdirSync(outDir, { recursive: true });

  const results: CropResult[] = [];

  for (const crop of crops) {
    const shot = path.join(shotsDir, crop.shot);

    if (!fs.existsSync(shot)) {
      throw new ToolError(`the walk has a step for ${crop.file}, but there is no ${crop.shot} in ${shotsDir}. Each step of the walk needs its own screenshot`);
    }

    const { width = 0, height = 0 } = await sharp(shot).metadata();
    const { left, top } = crop.rect;

    if (left + crop.rect.width > width || top + crop.rect.height > height) {
      throw new ToolError(`the crop for ${crop.file} runs past the ${width} by ${height} screenshot. Check its size's crop in the panels block`);
    }

    const cut = await pixelsOf(sharp(shot).extract(crop.rect));
    const file = path.join(outDir, crop.file);
    const before = fs.existsSync(file);

    if (before && samePixels(await pixelsOf(file), cut)) {
      results.push({ file: crop.file, status: 'unchanged' });
      continue;
    }

    await sharp(cut.data, { raw: { width: cut.width, height: cut.height, channels: 4 } }).png().toFile(file);
    results.push({ file: crop.file, status: before ? 'changed' : 'new' });
  }

  return results;
}

/**
 * Takes one screenshot a step of the walk.
 *
 * Every step is saved, the same as another or not, since the crop matches shots to steps by their
 * place. The build was checked against the file before it was installed, so the steps are the file's.
 *
 * @param io What taps, waits, shoots, and saves.
 * @param count The walk's steps.
 */
export function shootSteps(io: WalkIo, count: number): void {
  for (let step = 0; step < count; step++) {
    if (step > 0) {
      io.tap();
      io.settle();
    }

    io.save(step, io.screenshot());
    console.log(`   ${shotName(step)}`);
  }
}

/** The thumbnails plugin's generator, beside this plugin in the unit's paf/plugins/. */
function thumbnailsGenerator(): string {
  return path.join(import.meta.dirname, '..', 'thumbnails', 'embed-thumbnails.ts');
}

/** Runs the thumbnails generator for the face, the way paf gen <face> thumbnails runs it. */
function runGenerator(face: string): void {
  const script = thumbnailsGenerator();

  if (!fs.existsSync(script)) {
    console.log(`>> the unit does not list the thumbnails plugin, so the settings page's copy was not rebuilt. List it and run paf gen ${face} thumbnails`);
    return;
  }

  console.log(`>> paf gen ${face} thumbnails`);

  const run = spawnSync(process.execPath, ['--disable-warning=MODULE_TYPELESS_PACKAGE_JSON', script, face], { cwd: WORKSPACE, stdio: 'inherit' });

  if (run.status !== 0) {
    throw new ToolError(`the thumbnails generator stopped. Fix what it names and run paf gen ${face} thumbnails`, exitCodeOf(run));
  }
}

/** The face's panel walk steps, its sizes, and the fingerprint of what it shows, refusing a walk that is not a panel walk. */
function panelWalk(face: string): { steps: PanelStep[]; sizes: Record<string, { crop: CropRect }>; fingerprint: string } {
  const switches = unitDevSwitches(WORKSPACE, face, true);

  if (!switches) {
    throw new ToolError(`${face} has no dev switches`);
  }

  const walk = resolveWalk(switches, { face, keys: [], defines: {}, thumbnails: thumbnailFiles(face) });

  if (walk === null || walk.kind !== 'panels' || !switches.panels) {
    throw new ToolError(`the thumbnails come from a panel walk, but ${face}'s walk in paf.dev.config.json is ${switches.walk === null ? 'none' : switches.walk}. Pick a walk that lists panels, such as { "panels": "all" }, and build with paf build ${face} --dev`);
  }

  return { steps: walk.steps, sizes: switches.panels.sizes, fingerprint: harnessFingerprint(switches, walk) };
}

/** A file's last write in ms, or null when there is no file. */
function writtenAt(file: string): number | null {
  return fs.existsSync(file) ? fs.statSync(file).mtimeMs : null;
}

/** Checks the target's dev build against the file and installs it. */
function installChecked(face: string, target: string, emulator: string, fingerprint: string): void {
  const sandbox = path.join(WORKSPACE, 'targets', target);
  const header = path.join(sandbox, DEV_HEADER);

  checkBuild(fs.existsSync(header) ? fs.readFileSync(header, 'utf8') : null, writtenAt(header) ?? 0, writtenAt(path.join(sandbox, 'build', `${target}.pbw`)), fingerprint, face);
  installFace(face, target, emulator);
}

async function main(): Promise<void> {
  try {
    const args = parseThumbnailArgs(process.argv.slice(2));

    if (args.help) {
      console.log(USAGE);
      return;
    }

    const declared = faceTargetNames(args.face);
    const { steps, sizes, fingerprint } = panelWalk(args.face);
    const crops = cropPlan(steps, sizes);
    let shots: string;

    if (args.shots !== null) {
      shots = path.resolve(WORKSPACE, args.shots);
    } else {
      shots = outFolder(DEFAULT_SHOTS);
      installChecked(args.face, pickTarget(args.face, declared, args.target), args.emulator, fingerprint);
      clearOut(shots);
      console.log(`>> shooting ${steps.length} steps`);

      // the screenshot waiting to be kept sits outside the shots folder, so a failed step never leaves it there
      const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'thumbnails-'));

      try {
        shootSteps(emulatorIo(args.emulator, shots, path.join(scratch, 'candidate.png')), steps.length);
      } finally {
        fs.rmSync(scratch, { recursive: true, force: true });
      }
    }

    const out = args.out === null ? path.join(faceDir(args.face), 'resources', 'thumbnails') : path.resolve(WORKSPACE, args.out);
    const results = await cropShots(crops, shots, out);

    for (const result of results) {
      console.log(`   ${result.status.padEnd(9)} ${result.file}`);
    }

    const moved = results.filter((result) => result.status !== 'unchanged').length;
    const below = path.relative(process.cwd(), out);
    // a folder outside the one the tool runs in reads more plainly as its full path than as a run of ../
    const shown = below === '' ? '.' : below.startsWith('..') ? out : below;

    console.log(`>> ${results.length} pictures in ${shown}/, ${moved} new or changed`);

    if (args.out === null) {
      runGenerator(args.face);
    }
  } catch (error) {
    reportFailure(error);
  }
}

if (isMainScript(import.meta)) {
  void main();
}
