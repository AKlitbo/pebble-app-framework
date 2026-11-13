/**
 * The dev plugin's switches, turned on by `paf build <face> --dev` and handed to the C build as defines
 * and a header.
 *
 * A unit lists the dev plugin in its paf.config.json as `"dev": {}`. The harness a dev build runs with
 * sits in a file of its own beside it, paf.dev.config.json, which the face repo commits so anyone can
 * take the same screenshots. The settings at the top are the unit's, and an entry under `faces` sets
 * them for one face, by the name `paf build` takes:
 *
 *     { "walk": "themes", "faces": { "gridlock": { "walk": "modules", "clock": "20:42" } } }
 *
 * The walk and the clock become defines. The date, the settings, the store readings, and the walks the
 * file lays out as lists go into a header the build writes for a dev build, which dev-header.ts writes.
 * dev-settings.ts, dev-seeds.ts, and dev-walks.ts read those blocks. A face's entry takes each setting,
 * each store, and each walk it leaves out from the top of the file, one by one, and the panels block
 * whole.
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
import { clockMinutes } from './dev-fields.ts';
import { NO_STORES, STORE_NAMES, readStores, type DevStores } from './dev-seeds.ts';
import { readSettings, type DevValue } from './dev-settings.ts';
import { SCENE_KEYS, readPanels, readWalks, type DevPanels, type DevWalk } from './dev-walks.ts';

/** The file beside a unit's paf.config.json that holds the dev harness. */
export const DEV_CONFIG_FILE = 'paf.dev.config.json';


/** The settings a face's entry takes, which the top of the file takes too. */
const FACE_SETTINGS = ['walk', 'clock', 'date', 'settings', 'stores', 'walks', 'panels'];

/** The settings the top of the file takes. */
const UNIT_SETTINGS = [...FACE_SETTINGS, 'faces'];

/** A pinned date, with the month from 1 and the weekday and day of the year worked out from it. */
export interface DevDate {
  /** The year, such as 2026. */
  year: number;
  /** The month, 1 for January. */
  month: number;
  /** The day of the month. */
  day: number;
  /** The weekday, 0 for Sunday, as a struct tm counts it. */
  weekday: number;
  /** The day of the year, 0 for the first of January, as a struct tm counts it. */
  yearDay: number;
}

/** What a dev build of one face runs with. */
export interface DevSwitches {
  /** The walk a tap steps through, such as `themes`, or null for none. */
  walk: string | null;
  /** The pinned clock's hour, 0 to 23. */
  hour: number;
  /** The pinned clock's minute, 0 to 59. */
  minute: number;
  /** The pinned date, or null to take the watch's own. */
  date: DevDate | null;
  /** The settings it applies at launch, by message key. */
  settings: Record<string, DevValue>;
  /** The readings it seeds in place of the fixture, store by store. */
  stores: DevStores;
  /** The walks the file lays out as lists, by name. */
  walks: Record<string, DevWalk>;
  /** What each panel and size is to the face's C, for a panel walk and the thumbnails tool, or null for none. */
  panels: DevPanels | null;
}

/** What a dev build runs with when the file leaves a setting out. The clock is 08:00, a wide clock string. */
export const DEFAULTS: DevSwitches = { walk: null, hour: 8, minute: 0, date: null, settings: {}, stores: NO_STORES, walks: {}, panels: null };

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
  return name === 'DEV_MODE' || name === 'DEV_TIME_HOUR' || name === 'DEV_TIME_MIN' || name === DEV_WALK_FROM_CONFIG || name.startsWith('DEV_TAP_WALK_');
}

/** The define a dev build sets when its walk is one the file lays out as a list, which the dev plugin runs. */
export const DEV_WALK_FROM_CONFIG = 'DEV_WALK_FROM_CONFIG';

/** The days in each month of a year that is not a leap year. */
const MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/**
 * Reads a pinned date, and works out its weekday and day of the year.
 *
 * The watch's struct tm carries both, and a date panel draws them, so the build works them out here
 * once rather than the watch doing calendar maths on every launch.
 *
 * @param value The date as written, `YYYY-MM-DD`.
 * @param file The file as a message names it.
 * @param owner `gridlock's ` for a face's entry, or empty for the top of the file.
 * @return The date with its weekday and day of the year.
 */
export function readDate(value: unknown, file: string, owner: string): DevDate {
  const parts = typeof value === 'string' ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(value) : null;
  const year = parts ? Number(parts[1]) : 0;
  const month = parts ? Number(parts[2]) : 0;
  const day = parts ? Number(parts[3]) : 0;
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  const days = month >= 1 && month <= 12 ? MONTH_DAYS[month - 1] + (month === 2 && leap ? 1 : 0) : 0;

  // the watch's clock runs from 1970 and a 32-bit time_t stops in 2038, so a date outside them cannot be shown
  if (!parts || year < 1970 || year > 2037 || day < 1 || day > days) {
    throw new ToolError(`${file} sets ${owner}date to ${JSON.stringify(value)}. It takes a real date as YYYY-MM-DD, from 1970 to 2037, such as "2026-07-13"`);
  }

  const stamp = Date.UTC(year, month - 1, day);

  return { year, month, day, weekday: new Date(stamp).getUTCDay(), yearDay: Math.round((stamp - Date.UTC(year, 0, 1)) / 86_400_000) };
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

  let hour = fallback.hour;
  let minute = fallback.minute;

  if ('clock' in block) {
    const minutes = clockMinutes(block.clock);

    if (minutes === null) {
      throw new ToolError(`${file} sets ${owner}clock to ${JSON.stringify(block.clock)}. It takes a 24-hour HH:MM, such as "08:00"`);
    }

    hour = Math.floor(minutes / 60);
    minute = minutes % 60;
  }

  // the HRV log has to end by the clock, so the stores are read against the clock this block ends up with
  const stores = 'stores' in block ? readStores(block.stores, hour * 60 + minute, file, owner) : NO_STORES;

  return {
    walk: walkName,
    hour,
    minute,
    date: 'date' in block ? readDate(block.date, file, owner) : fallback.date,
    settings: { ...fallback.settings, ...('settings' in block ? readSettings(block.settings, file, owner) : {}) },
    stores: Object.fromEntries(STORE_NAMES.map((name) => [name, stores[name] ?? fallback.stores[name]])) as DevStores,
    walks: { ...fallback.walks, ...('walks' in block ? readWalks(block.walks, file, owner) : {}) },
    panels: 'panels' in block ? readPanels(block.panels, file, owner) : fallback.panels,
  };
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

  // a walk's own clock, settings, and stores go over a face's only once the walk is picked, but a
  // slip in any of them stops the build now, against every face that takes the walk
  for (const switches of [unit, ...Object.values(byFace)]) {
    for (const walk of Object.values(switches.walks)) {
      if (walk.scene) {
        readBlock(walk.scene.block, walk.scene.file, walk.scene.owner, SCENE_KEYS, switches);
      }
    }
  }

  return { unit, faces: byFace };
}

/**
 * The switches with the picked walk's own clock, date, settings, and stores over them.
 *
 * A walk shot on a clock or a day of its own, such as one through the clock faces, carries them, so
 * picking it is the one edit. Its settings and stores go on top of the face's one by one, the way a
 * face's entry goes on top of the file's.
 *
 * @param switches A face's switches.
 * @return The switches the dev build runs with.
 */
function withWalkScene(switches: DevSwitches): DevSwitches {
  const walk = switches.walk !== null && Object.prototype.hasOwnProperty.call(switches.walks, switches.walk) ? switches.walks[switches.walk] : null;

  if (!walk?.scene) {
    return switches;
  }

  return readBlock(walk.scene.block, walk.scene.file, walk.scene.owner, SCENE_KEYS, switches);
}

/**
 * What a dev build of one face runs with.
 *
 * @param harness The unit's harness, from readDevHarness.
 * @param face The face's name.
 * @return The face's own entry, or the unit's settings for a face with none, with the picked walk's own over them.
 */
export function switchesFor(harness: DevHarness, face: string): DevSwitches {
  return withWalkScene(Object.prototype.hasOwnProperty.call(harness.faces, face) ? harness.faces[face] : harness.unit);
}

/**
 * The C defines a build gives one face.
 *
 * A walk the file lays out as a list sets `DEV_WALK_FROM_CONFIG` in place of its own
 * `DEV_TAP_WALK_<NAME>`, which is how the dev plugin's `dev_start` knows to run it. A face's own C
 * walk that reads the same name stays off, so only one tap handler ever runs.
 *
 * @param switches The face's switches for a dev build, from switchesFor, or null for a build without `--dev`.
 * @return `DEV_MODE` 0 without switches, and with them `DEV_MODE` 1, the clock, and the walk.
 */
export function devDefines(switches: DevSwitches | null): Record<string, number> {
  if (!switches) {
    return { DEV_MODE: 0 };
  }

  const listed = switches.walk !== null && Object.prototype.hasOwnProperty.call(switches.walks, switches.walk);

  return {
    DEV_MODE: 1,
    DEV_TIME_HOUR: switches.hour,
    DEV_TIME_MIN: switches.minute,
    ...(switches.walk && !listed ? { [`DEV_TAP_WALK_${switches.walk.toUpperCase()}`]: 1 } : {}),
    ...(listed ? { [DEV_WALK_FROM_CONFIG]: 1 } : {}),
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
 * @param unit The unit's folder.
 * @param face The face being built, by the name `paf build` takes.
 * @param dev Whether the build was asked for with `--dev`.
 * @param faces Gives the names of the unit's faces, the repo's own by default. Only asked when the file has an entry.
 * @return Only `DEV_MODE` 0 without `--dev`, and with it the dev mode and the face's clock and walk.
 */
export function unitDevDefines(unit: string, face: string, dev: boolean, faces: () => string[] = listFaceNames): Record<string, number> {
  return devDefines(unitDevSwitches(unit, face, dev, faces));
}

/**
 * What a build of one face runs with, from `--dev` and the unit's paf.dev.config.json.
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
 * @return Null without `--dev`, and with it the face's switches.
 */
export function unitDevSwitches(unit: string, face: string, dev: boolean, faces: () => string[] = listFaceNames): DevSwitches | null {
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
    return null;
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

  return switchesFor(files.harness, face);
}

/** A file's text, or undefined when there is none. */
function readText(file: string): string | undefined {
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : undefined;
}
