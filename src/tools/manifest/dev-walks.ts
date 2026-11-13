/**
 * Reads the walks a unit's paf.dev.config.json lays out as lists, and the panels block a panel walk
 * and the thumbnails tool read, and works out the steps the watch taps through.
 *
 * A walk in `walks` is one of two kinds. A panel walk names panels by size, or `"all"`, and the watch
 * shows one panel a step through the face's `dev_show_panel` hook:
 *
 *     { "panels": { "1x2": ["phone-battery", "battery-battery"], "2x2": ["phone-battery"] } }
 *
 * A step walk lists screens, each with the settings it applies through the settings catalogue and a
 * layout the face's `dev_show_layout` hook shows, either one optional:
 *
 *     { "steps": [{ "settings": { "APPEARANCE_THEME": 0 }, "layout": "2,0,0,2,2;12,0,2,2,1" }] }
 *
 * The panels block says what each panel and size is to the face's C, and where a size sits on the
 * screen for the thumbnails tool to crop it:
 *
 *     { "include": "engine/catalog.h", "sizes": { "1x2": { "id": "MSIZE_1x2", "crop": { "left": 4, "top": 94, "width": 94, "height": 40 } } },
 *       "ids": { "phone-battery": "MOD_SYSTEM_PHONE_BATTERY" } }
 *
 * An id is a whole number or a C name, and the header named by `include` is where the C names come from.
 * A panel's name is its thumbnail's, so `phone-battery` at `1x2` is `phone-battery-1x2.png`.
 */
import fs from 'node:fs';
import path from 'node:path';
import { faceDir } from '../shared/faces.ts';
import { ToolError } from '../shared/tool-error.ts';
import { isObject } from '../shared/values.ts';
import { onlyKnown, sets, type Where } from './dev-fields.ts';
import { readSettings, type DevValue } from './dev-settings.ts';

/** One screen of a step walk. */
export type DevStep = {
  /** The settings it applies, by message key. */
  settings: Record<string, DevValue>;
  /** The layout the face's dev_show_layout hook shows, or null to leave the layout as it is. */
  layout: string | null;
};

/**
 * The clock, date, settings, and stores a walk sets for itself, as the file writes them, with where
 * they sit for a message. dev-switches.ts reads them over the face's own once the walk is picked.
 */
export type WalkScene = { block: Record<string, unknown>; file: string; owner: string };

/** A walk the config lays out, with the scene it sets for itself, or null for none. */
export type DevWalk =
  | { kind: 'panels'; panels: 'all' | Record<string, string[]>; scene: WalkScene | null }
  | { kind: 'steps'; steps: DevStep[]; scene: WalkScene | null };

/** What a walk can set for itself beside its panels or steps, which stand in for the face's while it is picked. */
export const SCENE_KEYS = ['clock', 'date', 'settings', 'stores'];

/** Where one size sits on the screen when the face shows a panel of it on its own. */
export type CropRect = { left: number; top: number; width: number; height: number };

/** One panel size: what the face's C calls it, and where the thumbnails tool crops it. */
export type PanelSize = { id: string; crop: CropRect };

/** The panels block. */
export type DevPanels = {
  /** The headers the C names in the ids come from, included ahead of the walk's table. */
  include: string[];
  /** Each size, in the order a walk of all the panels steps through them. */
  sizes: Record<string, PanelSize>;
  /** Each panel's id, by its thumbnail name. */
  ids: Record<string, string>;
};

/** One step of a panel walk, resolved against the panels block. */
export type PanelStep = { panel: string; size: string; panelId: string; sizeId: string };

/** The names walks cannot take, since the dev plugin's own walk already has them. */
const RESERVED_WALKS = ['themes'];

/** A panel or size name a thumbnail can carry, which keeps the part after the last dash for the size. */
const PANEL_NAME = /^[a-z0-9][a-z0-9-]*$/;
const SIZE_NAME = /^[a-z0-9]+$/;

/** A C name or a whole number, which is what the generated table writes straight into the C. */
const C_ID = /^(?:[A-Za-z_][A-Za-z0-9_]*|-?\d+)$/;

/** A header path an include can name, with no quote or angle bracket to break out of the line. */
const HEADER = /^[A-Za-z0-9_./-]+\.h$/;

/** Refuses a field a walk or the panels block does not take. */
function walkFields(block: Record<string, unknown>, known: string[], where: Where, field: string): void {
  onlyKnown(block, known, where, field, 'the dev plugin');
}

/** A panel walk's list, `"all"` or panels by size. */
function readPanelList(value: unknown, where: Where, field: string): 'all' | Record<string, string[]> {
  if (value === 'all') {
    return 'all';
  }

  if (!isObject(value)) {
    throw new ToolError(`${sets(where, field, value)}. It takes "all" or panels by size, such as { "1x2": ["phone-battery"] }`);
  }

  const bySize: Record<string, string[]> = Object.create(null);

  for (const [size, panels] of Object.entries(value)) {
    if (!Array.isArray(panels) || panels.length === 0 || !panels.every((panel) => typeof panel === 'string' && PANEL_NAME.test(panel))) {
      throw new ToolError(`${sets(where, `${field}.${size}`, panels)}. It takes a list of panel names, such as ["phone-battery"]`);
    }

    bySize[size] = panels;
  }

  return bySize;
}

/** One walk out of `walks`. */
function readWalk(value: unknown, where: Where, field: string): DevWalk {
  if (!isObject(value) || ('panels' in value) === ('steps' in value)) {
    throw new ToolError(`${sets(where, field, value)}. A walk takes either panels, such as { "panels": "all" }, or steps, such as { "steps": [{ "settings": { "APPEARANCE_THEME": 1 } }] }`);
  }

  // a walk shot on another clock, such as the clock faces, carries its own clock with it
  const sceneKeys = SCENE_KEYS.filter((key) => key in value);
  const scene = sceneKeys.length > 0 ? { block: Object.fromEntries(sceneKeys.map((key) => [key, value[key]])), file: where.file, owner: `${where.owner}${field}.` } : null;

  if ('panels' in value) {
    walkFields(value, ['panels', ...SCENE_KEYS], where, field);
    return { kind: 'panels', panels: readPanelList(value.panels, where, `${field}.panels`), scene };
  }

  walkFields(value, ['steps', ...SCENE_KEYS], where, field);

  if (!Array.isArray(value.steps) || value.steps.length < 2) {
    throw new ToolError(`${sets(where, `${field}.steps`, value.steps)}. It takes a list of two or more screens, since a tap has to have somewhere to step to`);
  }

  const steps = value.steps.map((step, index) => {
    const at = `${field}.steps[${index}]`;

    if (!isObject(step)) {
      throw new ToolError(`${sets(where, at, step)}. A step takes settings, a layout, or both`);
    }

    walkFields(step, ['settings', 'layout'], where, at);

    if (step.layout !== undefined && (typeof step.layout !== 'string' || step.layout === '')) {
      throw new ToolError(`${sets(where, `${at}.layout`, step.layout)}. It takes the layout as the face's dev_show_layout reads it`);
    }

    return { settings: 'settings' in step ? readSettings(step.settings, where.file, where.owner, `${at}.settings`) : {}, layout: typeof step.layout === 'string' ? step.layout : null };
  });

  return { kind: 'steps', steps, scene };
}

/**
 * Reads a `walks` block.
 *
 * @param value The block as the file holds it.
 * @param file The file as a message names it.
 * @param owner `gridlock's ` for a face's entry, or empty for the top of the file.
 * @return Each walk by its name.
 */
export function readWalks(value: unknown, file: string, owner: string): Record<string, DevWalk> {
  const where = { file, owner };

  if (!isObject(value)) {
    throw new ToolError(`${sets(where, 'walks', value)}. It takes an object of walks by name, such as { "thumbnails": { "panels": "all" } }`);
  }

  const walks: Record<string, DevWalk> = Object.create(null);

  for (const [name, walk] of Object.entries(value)) {
    if (!/^[a-z][a-z0-9_]*$/.test(name) || RESERVED_WALKS.includes(name)) {
      throw new ToolError(`${file} sets ${owner}walks.${name}. A walk's name is lowercase, and ${RESERVED_WALKS.join(', ')} is the dev plugin's own`);
    }

    walks[name] = readWalk(walk, where, `walks.${name}`);
  }

  return walks;
}

/** A whole number of pixels, 0 or more. */
function pixels(value: unknown, where: Where, field: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new ToolError(`${sets(where, field, value)}. It takes a whole number of pixels`);
  }

  return value;
}

/** A C name or a whole number. */
function cId(value: unknown, where: Where, field: string): string {
  const id = typeof value === 'number' ? String(value) : value;

  if (typeof id !== 'string' || !C_ID.test(id)) {
    throw new ToolError(`${sets(where, field, value)}. It takes a whole number or a C name, such as "MSIZE_1x2"`);
  }

  return id;
}

/**
 * Reads a `panels` block.
 *
 * @param value The block as the file holds it.
 * @param file The file as a message names it.
 * @param owner `gridlock's ` for a face's entry, or empty for the top of the file.
 * @return The headers, the sizes, and the ids.
 */
export function readPanels(value: unknown, file: string, owner: string): DevPanels {
  const where = { file, owner };

  if (!isObject(value)) {
    throw new ToolError(`${sets(where, 'panels', value)}. It takes { "sizes": {...}, "ids": {...} }, and an include when the ids are C names`);
  }

  walkFields(value, ['include', 'sizes', 'ids'], where, 'panels');

  const include = value.include === undefined ? [] : Array.isArray(value.include) ? value.include : [value.include];

  include.forEach((header, index) => {
    if (typeof header !== 'string' || !HEADER.test(header)) {
      throw new ToolError(`${sets(where, `panels.include[${index}]`, header)}. It takes a header path as the face's C includes it, such as "engine/catalog.h"`);
    }
  });

  if (!isObject(value.sizes) || Object.keys(value.sizes).length === 0) {
    throw new ToolError(`${sets(where, 'panels.sizes', value.sizes)}. It takes each size, such as { "1x2": { "id": "MSIZE_1x2", "crop": { "left": 4, "top": 94, "width": 94, "height": 40 } } }`);
  }

  const sizes: Record<string, PanelSize> = Object.create(null);

  for (const [size, entry] of Object.entries(value.sizes)) {
    const at = `panels.sizes.${size}`;

    if (!SIZE_NAME.test(size)) {
      throw new ToolError(`${file} sets ${owner}${at}. A size's name is lowercase letters and digits with no dash, since a thumbnail's name ends on it after its last dash`);
    }

    if (!isObject(entry) || !isObject(entry.crop)) {
      throw new ToolError(`${sets(where, at, entry)}. A size takes { "id": "MSIZE_1x2", "crop": { "left": 4, "top": 94, "width": 94, "height": 40 } }`);
    }

    walkFields(entry, ['id', 'crop'], where, at);
    walkFields(entry.crop, ['left', 'top', 'width', 'height'], where, `${at}.crop`);

    const crop = {
      left: pixels(entry.crop.left, where, `${at}.crop.left`),
      top: pixels(entry.crop.top, where, `${at}.crop.top`),
      width: pixels(entry.crop.width, where, `${at}.crop.width`),
      height: pixels(entry.crop.height, where, `${at}.crop.height`),
    };

    if (crop.width === 0 || crop.height === 0) {
      throw new ToolError(`${file} sets ${owner}${at}.crop with no width or no height, which crops nothing`);
    }

    sizes[size] = { id: cId(entry.id, where, `${at}.id`), crop };
  }

  if (!isObject(value.ids)) {
    throw new ToolError(`${sets(where, 'panels.ids', value.ids)}. It takes each panel's id by its thumbnail name, such as { "phone-battery": "MOD_SYSTEM_PHONE_BATTERY" }`);
  }

  const ids: Record<string, string> = Object.create(null);

  for (const [panel, id] of Object.entries(value.ids)) {
    if (!PANEL_NAME.test(panel)) {
      throw new ToolError(`${file} sets ${owner}panels.ids.${panel}. A panel's name is its thumbnail's, in lowercase with dashes, such as phone-battery`);
    }

    ids[panel] = cId(id, where, `panels.ids.${panel}`);
  }

  return { include: include as string[], sizes, ids };
}

/**
 * The file names in a face's resources/thumbnails folder, sorted, which a walk of all its panels steps
 * through. The build and the thumbnails tool both read the folder through here, so the walk the watch
 * takes and the crops the tool names come out in the same order.
 *
 * @param face The face.
 * @return The file names, or none for a face without the folder.
 */
export function thumbnailFiles(face: string): string[] {
  const dir = path.join(faceDir(face), 'resources', 'thumbnails');

  return fs.existsSync(dir) ? fs.readdirSync(dir).sort() : [];
}

/**
 * The thumbnails a face commits, as panel and size, read from their file names.
 *
 * A name splits on its last dash, so `phone-battery-1x2.png` is `phone-battery` at `1x2`. A file whose
 * size is not one the panels block lists is left out, since the walk could not show it.
 *
 * @param files The file names in the face's resources/thumbnails folder.
 * @param sizes The sizes the panels block lists.
 * @return Each thumbnail's panel and size, in the order the files come.
 */
export function thumbnailPanels(files: string[], sizes: string[]): { panel: string; size: string }[] {
  return files.flatMap((file) => {
    const match = /^(.+)-([a-z0-9]+)\.png$/.exec(file);

    return match && sizes.includes(match[2]) ? [{ panel: match[1], size: match[2] }] : [];
  });
}

/**
 * The steps a panel walk taps through, one panel a step.
 *
 * The sizes go in the order the panels block lists them, so a walk of every panel shows every small
 * panel before any big one. Inside a size a named list keeps its own order, and `"all"` goes by the
 * panel's name. `"all"` is every thumbnail the face commits, so a panel with no thumbnail yet has to be
 * named, which is the walk for a new panel.
 *
 * A size the panels block does not list, or a panel with no id there, stops the build, since the
 * watch could not show it and the thumbnails tool could not crop it.
 *
 * @param walk The walk's list, `"all"` or panels by size.
 * @param panels The panels block.
 * @param thumbnails The face's thumbnail file names, which `"all"` walks.
 * @param face The face, which a refusal names.
 * @return The steps, in the order the watch shows them.
 */
export function panelSteps(walk: 'all' | Record<string, string[]>, panels: DevPanels, thumbnails: string[], face: string): PanelStep[] {
  const order = Object.keys(panels.sizes);
  const wanted = walk === 'all' ? thumbnailPanels(thumbnails, order) : Object.entries(walk).flatMap(([size, names]) => names.map((panel) => ({ panel, size })));

  for (const { size } of wanted) {
    if (!panels.sizes[size]) {
      throw new ToolError(`paf.dev.config.json walks ${face}'s panels at ${size}, which its panels block does not list. Its sizes are ${order.join(', ')}`);
    }
  }

  const missing = [...new Set(wanted.filter(({ panel }) => !panels.ids[panel]).map(({ panel }) => panel))];

  if (missing.length > 0) {
    throw new ToolError(`paf.dev.config.json walks ${face}'s ${missing.join(', ')}, which its panels block gives no id. Add each to panels.ids`);
  }

  const sorted = order.flatMap((size) => {
    const atSize = wanted.filter((step) => step.size === size);

    return walk === 'all' ? atSize.sort((a, b) => (a.panel < b.panel ? -1 : a.panel > b.panel ? 1 : 0)) : atSize;
  });

  return sorted.map(({ panel, size }) => ({ panel, size, panelId: panels.ids[panel], sizeId: panels.sizes[size].id }));
}
