/**
 * The dev plugin's switches, turned on by `paf build <face> --dev` and handed to the C build as defines.
 *
 * A unit lists the dev plugin in its paf.config.json as `"dev": {}`. The harness a dev build runs with
 * sits in a file of its own beside it, paf.dev.config.json, which the face repo commits so anyone can
 * take the same screenshots. The walk and the clock at the top are the unit's, and an entry under
 * `faces` sets them for one face, by the name `paf build` takes:
 *
 *     { "walk": "themes", "faces": { "gridlock": { "walk": "modules", "clock": "20:42" } } }
 *
 * Every face builds with `DEV_MODE`, 1 on a build with `--dev` and 0 otherwise, including a face in a
 * unit that does not list the plugin, so C that reads `DEV_MODE` as a value always compiles. A face's
 * own header with a plain `#define DEV_MODE` of a different value stops the build on the redefinition.
 * With `--dev`, each face also gets its pinned clock as `DEV_TIME_HOUR` and `DEV_TIME_MIN`, and its
 * walk as `DEV_TAP_WALK_<NAME>` set to 1. With no paf.dev.config.json a dev build takes the defaults.
 *
 * A build with `--dev` checks the whole file. A build without it only refuses a `mode` anywhere in the
 * file, since that is a mistake about how dev mode turns on, and skips the rest. A slip in the harness
 * then costs the next screenshot session rather than a release. Nothing in the file turns the mode
 * on, so a release build, which never passes `--dev`, always builds with `DEV_MODE` 0.
 */
import fs from 'node:fs';
import path from 'node:path';
import { listFaceNames } from '../shared/faces.ts';
import { ToolError } from '../shared/tool-error.ts';
import { isObject } from '../shared/values.ts';

/** The file beside a unit's paf.config.json that holds the dev harness. */
export const DEV_CONFIG_FILE = 'paf.dev.config.json';


/** The settings a face's entry takes, which the top of the file takes too. */
const FACE_SETTINGS = ['walk', 'clock'];

/** The settings the top of the file takes. */
const UNIT_SETTINGS = [...FACE_SETTINGS, 'faces'];

/** What a dev build of one face runs with. */
export interface DevSwitches {
  /** The walk a tap steps through, such as `themes`, or null for none. */
  walk: string | null;
  /** The pinned clock's hour, 0 to 23. */
  hour: number;
  /** The pinned clock's minute, 0 to 59. */
  minute: number;
}

/** What a dev build runs with when the file leaves a setting out. The clock is 08:00, a wide clock string. */
const DEFAULTS: DevSwitches = { walk: null, hour: 8, minute: 0 };

/** The whole harness in a unit's paf.dev.config.json. */
export interface DevHarness {
  /** What a face with no entry of its own runs with. */
  unit: DevSwitches;
  /** Each face with an entry, by its name, with the unit's settings under what the entry leaves out. */
  faces: Record<string, DevSwitches>;
}

/**
 * Whether the build sets a define from the dev plugin's settings, so a face cannot set it in its appinfo.
 *
 * @param name The define's name.
 * @return True for `DEV_MODE`, `DEV_TIME_HOUR`, `DEV_TIME_MIN`, and every `DEV_TAP_WALK_` name.
 */
export function isDevDefine(name: string): boolean {
  return name === 'DEV_MODE' || name === 'DEV_TIME_HOUR' || name === 'DEV_TIME_MIN' || name.startsWith('DEV_TAP_WALK_');
}

/** The refusal for a `mode` in the file, at the top or in the owner's entry. */
function modeRefused(file: string, owner: string): ToolError {
  return new ToolError(`${file} sets ${owner}mode. Dev mode comes from the build's --dev flag, so a committed file never turns it on. Drop mode from the file and build with paf build <face> --dev`);
}

/**
 * Reads one block of settings, the top of the file or a face's entry, taking what it leaves out from
 * the fallback. The owner goes in front of each setting a message names, so a face's entry reads as
 * `gridlock's walk`.
 *
 * A `mode` stops the build, since the file is committed and a mode in it would read as on in every
 * build, CI's and a release's included, while `--dev` is what turns it on. A setting the block does not
 * take stops it too, since a misspelt `walk` would quietly build without it.
 */
function readBlock(block: Record<string, unknown>, file: string, owner: string, known: string[], fallback: DevSwitches): DevSwitches {
  if ('mode' in block) {
    throw modeRefused(file, owner);
  }

  const unknown = Object.keys(block).filter((key) => !known.includes(key));

  if (unknown.length > 0) {
    throw new ToolError(`${file} sets ${owner}${unknown.join(', ')}, which the dev plugin does not read. It reads ${known.join(', ')}`);
  }

  // a walk set to null turns the unit's walk off for one face, so the key being there is what counts
  const walk = 'walk' in block ? block.walk : fallback.walk;
  const walkName = typeof walk === 'string' && /^[a-z][a-z0-9_]*$/.test(walk) ? walk : null;

  if (walk !== null && walkName === null) {
    throw new ToolError(`${file} sets ${owner}walk to ${JSON.stringify(walk)}. It takes the walk's name in lowercase, such as "themes"`);
  }

  if (!('clock' in block)) {
    return { walk: walkName, hour: fallback.hour, minute: fallback.minute };
  }

  const time = typeof block.clock === 'string' ? /^([01]\d|2[0-3]):([0-5]\d)$/.exec(block.clock) : null;

  if (!time) {
    throw new ToolError(`${file} sets ${owner}clock to ${JSON.stringify(block.clock)}. It takes a 24-hour HH:MM, such as "08:00"`);
  }

  return { walk: walkName, hour: Number(time[1]), minute: Number(time[2]) };
}

/**
 * Reads the dev harness out of a unit's paf.dev.config.json.
 *
 * Every face entry is checked, not just the one a build is for, so a mistake in any of them stops
 * every dev build of the unit. An entry for a name the unit has no face by stops it too, since a face
 * renamed or mistyped would quietly take the unit's settings. So does a file that is not an object, a
 * walk that is not a lowercase name, and a clock that is not a 24-hour `HH:MM`, at the top or in an entry.
 *
 * @param settings The unit's paf.dev.config.json, parsed.
 * @param file The file as a message names it, such as `mosaic/paf.dev.config.json`.
 * @param faces Gives the names of the unit's faces, as `paf build` takes them. It is only asked when the file has an entry.
 * @return The unit's settings and each face entry's, with the defaults for anything the file leaves out.
 */
export function readDevHarness(settings: unknown, file: string, faces: () => string[]): DevHarness {
  if (!isObject(settings)) {
    throw new ToolError(`${file} holds ${JSON.stringify(settings)}, which is not an object of dev settings such as { "walk": "themes" }`);
  }

  const unit = readBlock(settings, file, '', UNIT_SETTINGS, DEFAULTS);
  const entries = 'faces' in settings ? settings.faces : {};

  if (!isObject(entries)) {
    throw new ToolError(`${file} sets faces to ${JSON.stringify(entries)}. It takes an object of settings by face name, such as { "gridlock": { "walk": "modules" } }`);
  }

  // no prototype, so an entry called __proto__ is a plain key like any other
  const byFace: Record<string, DevSwitches> = Object.create(null);

  for (const [name, entry] of Object.entries(entries)) {
    const names = faces();

    if (!names.includes(name)) {
      const have = names.length > 0 ? `The unit's faces are ${names.join(', ')}` : 'The unit has no faces';

      throw new ToolError(`${file} has an entry for ${name}, which is not a face in the unit. ${have}`);
    }

    if (!isObject(entry)) {
      throw new ToolError(`${file} sets ${name} to ${JSON.stringify(entry)}, which is not an object of dev settings such as { "walk": "modules" }`);
    }

    byFace[name] = readBlock(entry, file, `${name}'s `, FACE_SETTINGS, unit);
  }

  return { unit, faces: byFace };
}

/**
 * What a dev build of one face runs with.
 *
 * @param harness The unit's harness, from readDevHarness.
 * @param face The face's name.
 * @return The face's own entry, or the unit's settings for a face with none.
 */
export function switchesFor(harness: DevHarness, face: string): DevSwitches {
  return Object.prototype.hasOwnProperty.call(harness.faces, face) ? harness.faces[face] : harness.unit;
}

/**
 * The C defines a build gives one face.
 *
 * @param switches The face's switches for a dev build, from switchesFor, or null for a build without `--dev`.
 * @return `DEV_MODE` 0 without switches, and with them `DEV_MODE` 1, the clock, and the walk.
 */
export function devDefines(switches: DevSwitches | null): Record<string, number> {
  if (!switches) {
    return { DEV_MODE: 0 };
  }

  return {
    DEV_MODE: 1,
    DEV_TIME_HOUR: switches.hour,
    DEV_TIME_MIN: switches.minute,
    ...(switches.walk ? { [`DEV_TAP_WALK_${switches.walk.toUpperCase()}`]: 1 } : {}),
  };
}

/**
 * Refuses a `mode` at the top of the file or in any face's entry, and lets everything else through.
 * A build without `--dev` runs only this, so a file that does not parse, or that the dev build would
 * refuse for another reason, still builds.
 */
function refuseMode(text: string | undefined, file: string): void {
  let settings: unknown;

  try {
    settings = text === undefined ? undefined : JSON.parse(text);
  } catch {
    return;
  }

  if (!isObject(settings)) {
    return;
  }

  if ('mode' in settings) {
    throw modeRefused(file, '');
  }

  if (!isObject(settings.faces)) {
    return;
  }

  for (const [name, entry] of Object.entries(settings.faces)) {
    if (isObject(entry) && 'mode' in entry) {
      throw modeRefused(file, `${name}'s `);
    }
  }
}

/** What one unit's two files hold, read once per process however many faces the build covers. */
type UnitFiles = {
  plugins: Record<string, unknown>;
  devText: string | undefined;
  harness?: DevHarness;
};

// the files do not change while a build runs, and paf build all asks once for every face
const unitFiles = new Map<string, UnitFiles>();

/** A unit's paf.config.json plugins and its paf.dev.config.json text, from the cache once read. */
function readUnitFiles(unit: string, configLabel: string): UnitFiles {
  const key = path.resolve(unit);
  const cached = unitFiles.get(key);

  if (cached) {
    return cached;
  }

  const configText = readText(path.join(unit, 'paf.config.json'));
  let config: unknown;

  try {
    config = configText === undefined ? undefined : JSON.parse(configText);
  } catch (error) {
    throw new ToolError(`${configLabel} could not be read: ${(error as Error).message}`);
  }

  const files = { plugins: isObject(config) && isObject(config.plugins) ? config.plugins : {}, devText: readText(path.join(unit, DEV_CONFIG_FILE)) };

  unitFiles.set(key, files);
  return files;
}

/**
 * The C defines for a build of one face, from `--dev` and the unit's paf.dev.config.json.
 *
 * Settings left in the plugin's block in paf.config.json stop every build, since the build reads none
 * of them there. Without `--dev` the dev file is only searched for a `mode`. With it the whole file
 * is checked, and the build stops when paf.config.json does not list the dev plugin as an object,
 * since the harness only comes with it.
 *
 * @param unit The unit's folder.
 * @param face The face being built, by the name `paf build` takes.
 * @param dev Whether the build was asked for with `--dev`.
 * @param faces Gives the names of the unit's faces, the repo's own by default. Only asked when the file has an entry.
 * @return Only `DEV_MODE` 0 without `--dev`, and with it the dev mode and the face's clock and walk.
 */
export function unitDevDefines(unit: string, face: string, dev: boolean, faces: () => string[] = listFaceNames): Record<string, number> {
  const name = path.basename(path.resolve(unit));
  const configLabel = `${name}/paf.config.json`;
  const devLabel = `${name}/${DEV_CONFIG_FILE}`;
  const files = readUnitFiles(unit, configLabel);
  const { plugins } = files;

  if (isObject(plugins.dev) && Object.keys(plugins.dev).length > 0) {
    throw new ToolError(`${configLabel} gives the dev plugin settings, which the build reads from ${DEV_CONFIG_FILE} beside it. Move them there and leave "dev": {}`);
  }

  if (!dev) {
    refuseMode(files.devText, devLabel);
    return devDefines(null);
  }

  if (!isObject(plugins.dev)) {
    throw new ToolError(`--dev builds with the dev plugin's harness, but ${configLabel} does not list the dev plugin. Add "dev": {} to its plugins and run paf sync`);
  }

  if (!files.harness) {
    let settings: unknown;

    try {
      settings = files.devText === undefined ? {} : JSON.parse(files.devText);
    } catch (error) {
      throw new ToolError(`${devLabel} could not be read: ${(error as Error).message}`);
    }

    files.harness = readDevHarness(settings, devLabel, faces);
  }

  return devDefines(switchesFor(files.harness, face));
}

/** A file's text, or undefined when there is none. */
function readText(file: string): string | undefined {
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : undefined;
}
