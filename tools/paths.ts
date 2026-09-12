/**
 * Where the engine sits, and where the repo mounting it sits.
 *
 * A repo of faces mounts the engine as a submodule at <workspace>/lib/, so its faces, build
 * sandboxes, vendor/ and node_modules/ live one level above the engine. Checked out on its own,
 * the engine is its own workspace and holds no faces.
 */
import fs from 'node:fs';
import path from 'node:path';

/** The engine root. */
export const ENGINE = path.resolve(import.meta.dirname, '..');

/**
 * Whether the engine is mounted at <workspace>/lib/ in a repo of faces, meaning one with a
 * watchfaces/ folder or a face of its own at the root. Both have to hold, so a standalone checkout
 * never mistakes whatever folder it sits in for a repo of faces.
 */
export const MOUNTED = path.basename(ENGINE) === 'lib' && (
  fs.existsSync(path.join(ENGINE, '..', 'watchfaces'))
  || fs.existsSync(path.join(ENGINE, '..', 'config', 'pebble.appinfo.json'))
);

/** The repo mounting the engine, or the engine itself when it is checked out on its own. */
export const WORKSPACE = MOUNTED ? path.resolve(ENGINE, '..') : ENGINE;
