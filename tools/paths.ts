/**
 * Where the engine sits, and where the repo mounting it sits.
 *
 * A repo of faces mounts the engine as a submodule one folder down, most often at lib/, so its
 * faces, build sandboxes, vendor/ and node_modules/ live one level above the engine. The folder can
 * have any name. Checked out on its own, the engine is its own workspace and holds no faces.
 */
import fs from 'node:fs';
import path from 'node:path';

/** Whether a folder's package.json lists a workspace by name, in the plain list form or under packages. */
function listsWorkspace(dir: string, name: string): boolean {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
    const workspaces = Array.isArray(pkg.workspaces) ? pkg.workspaces : pkg.workspaces && pkg.workspaces.packages;
    return Array.isArray(workspaces)
      && workspaces.some((entry: unknown) => typeof entry === 'string' && entry.replace(/^\.\//, '').replace(/\/+$/, '') === name);
  } catch (error) {
    return false;
  }
}

/**
 * The workspace an engine folder belongs to: the repo of faces above it, or the engine itself.
 *
 * The folder above counts as a repo of faces when its package.json lists the engine's folder in
 * workspaces and it holds faces, in a watchfaces/ folder or at its own root. The name the engine's
 * folder was given plays no part. The workspaces listing is what stops an engine cloned on its own
 * from mistaking whatever folder it sits in for a repo of faces.
 *
 * @param engine The engine's folder.
 * @return The repo of faces mounting it, or the engine's own folder when nothing mounts it.
 */
export function workspaceFor(engine: string): string {
  const parent = path.dirname(engine);
  const holdsFaces = fs.existsSync(path.join(parent, 'watchfaces'))
    || fs.existsSync(path.join(parent, 'config', 'pebble.appinfo.json'));
  return holdsFaces && listsWorkspace(parent, path.basename(engine)) ? parent : engine;
}

/** The engine root. */
export const ENGINE = path.resolve(import.meta.dirname, '..');

/** The repo mounting the engine, or the engine itself when it is checked out on its own. */
export const WORKSPACE = workspaceFor(ENGINE);

/** Whether a repo of faces mounts the engine. */
export const MOUNTED = WORKSPACE !== ENGINE;

/**
 * The engine's folder relative to the workspace, with forward slashes: lib in a repo that mounts it
 * there, or . when the engine is checked out on its own. Anything that writes the engine's path into
 * a build uses this rather than assuming a name.
 */
export const ENGINE_REL = path.relative(WORKSPACE, ENGINE).split(path.sep).join('/') || '.';
