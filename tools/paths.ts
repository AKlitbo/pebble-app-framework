/**
 * Where the framework sits, and where the repo mounting it sits.
 *
 * A repo of faces mounts the framework as a submodule one folder down, most often at lib/, so its
 * faces, build sandboxes, vendor/ and node_modules/ live one level above the framework. The folder can
 * have any name. Checked out on its own, the framework is its own workspace and holds no faces.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

/** Where a face keeps its appinfo, relative to the face's own folder. */
export const APPINFO_REL = path.join('config', 'pebble.appinfo.json');

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
 * The workspace a framework folder belongs to: the repo of faces above it, or the framework itself.
 *
 * The folder above counts as a repo of faces when its package.json lists the framework's folder in
 * workspaces and it holds faces, in a watchfaces/ folder or at its own root. The name the framework's
 * folder was given plays no part. The workspaces listing is what stops a framework cloned on its own
 * from mistaking whatever folder it sits in for a repo of faces.
 *
 * @param engine The framework's folder.
 * @return The repo of faces mounting it, or the framework's own folder when nothing mounts it.
 */
export function workspaceFor(engine: string): string {
  const parent = path.dirname(engine);
  const holdsFaces = fs.existsSync(path.join(parent, 'watchfaces'))
    || fs.existsSync(path.join(parent, APPINFO_REL));
  return holdsFaces && listsWorkspace(parent, path.basename(engine)) ? parent : engine;
}

/** The framework root. */
export const ENGINE = path.resolve(import.meta.dirname, '..');

/** The repo mounting the framework, or the framework itself when it is checked out on its own. */
export const WORKSPACE = workspaceFor(ENGINE);

/** Whether a repo of faces mounts the framework. */
export const MOUNTED = WORKSPACE !== ENGINE;

/**
 * The framework's folder relative to the workspace, with forward slashes: lib in a repo that mounts it
 * there, or . when the framework is checked out on its own. Anything that writes the framework's path into
 * a build uses this rather than assuming a name.
 */
export const ENGINE_REL = path.relative(WORKSPACE, ENGINE).split(path.sep).join('/') || '.';

/**
 * Where ical.js's prebuilt ES5 CommonJS file sits, found the way node finds the package from the
 * framework: its own node_modules first, then the mounting repo's once npm workspaces hoist it.
 *
 * The package's `exports` map blocks asking for the file by its subpath, so this resolves the
 * package's `require` entry, which sits in the same dist/ folder.
 *
 * @return The file's absolute path, or null when ical.js is not installed.
 */
export function icaljsBundle(): string | null {
  try {
    const entry = createRequire(path.join(ENGINE, 'package.json')).resolve('ical.js');
    return path.join(path.dirname(entry), 'ical.es5.min.cjs');
  } catch {
    return null;
  }
}
