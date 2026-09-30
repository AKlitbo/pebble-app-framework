/**
 * Finding a face's source directory.
 *
 * A face is a directory holding config/pebble.appinfo.json. The folder mounting the framework is either
 * one face, or a family with its faces beside the code they share ({core,ridgeline,...}).
 *
 * A family's core/ carries no appinfo, which is what keeps it from being mistaken for a face, and
 * nothing has to be registered anywhere.
 *
 * Everything downstream (targets/<face>/, the CI matrix, release tags) keys off a face's name. In a
 * family the name is the face's folder. A face on its own goes by its appinfo's, because its folder is
 * named after wherever the repo was cloned.
 */
import fs from 'fs';
import path from 'path';
import { APPINFO_REL, MOUNTED, WORKSPACE, isFamilyRoot } from './paths.ts';
import { ToolError } from './tool-error.ts';

/** Whether a directory is a face rather than, say, a family's shared core. */
function isFace(dir: string): boolean {
  return fs.existsSync(path.join(dir, APPINFO_REL));
}

/** One face: its name, and its directory relative to the repo root (`.` for a face on its own). */
export type Face = { name: string; rel: string };

/** Orders faces by name, so build order is stable. */
function byName(first: Face, second: Face): number {
  if (first.name === second.name) {
    return 0;
  }
  return first.name < second.name ? -1 : 1;
}

/**
 * Every face in a repo. Takes the repo root, so the lookup works on a fixture as well as on the
 * repo mounting the framework.
 *
 * @param root The repo root to search from.
 * @return Every face found, ordered by name.
 */
export function findFaces(root: string): Face[] {
  const found: Face[] = [];

  if (isFace(root)) {
    const appinfo = JSON.parse(fs.readFileSync(path.join(root, APPINFO_REL), 'utf8'));
    if (!appinfo.name) {
      throw new ToolError(`the face at the repo root needs a name in its ${APPINFO_REL}`);
    }
    found.push({ name: appinfo.name, rel: '.' });
  }

  // a family: its faces are the root's children that carry an appinfo
  if (isFamilyRoot(root)) {
    for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
      if (entry.isDirectory() && isFace(path.join(root, entry.name))) {
        found.push({ name: entry.name, rel: entry.name });
      }
    }
  }

  return found.sort(byName);
}

/**
 * The family core beside a face, or null for a face in no family.
 *
 * Nothing declares it: a face nested beside a core/ is in that family, the same positional rule
 * the C build follows. The core mirrors a face's own src/, so core/pkjs sits where the face has
 * src/pkjs, which is what lets a lookup fall back from one to the other by swapping the root.
 *
 * @param root The repo root.
 * @param rel The face's directory relative to the repo root, as returned by findFaces.
 * @return The family core's absolute directory, or null when the face is not in a family.
 */
export function familyCoreFor(root: string, rel: string): string | null {
  const family = familyFolder(root, rel);
  return family ? path.join(family, 'core') : null;
}

/**
 * The name of the family a face belongs to, or null for a face in no family.
 *
 * The C build puts the name in front of the family's headers. It is the folder's name, unless the
 * family's package.json sets `"framework": { "family": "<name>" }`. A family that is a repo of its own is
 * checked out under the repo's name, in CI especially, so a repo named anything but the family sets it,
 * or every include of a core header fails.
 *
 * @param root The repo root.
 * @param rel The face's directory relative to the repo root, as returned by findFaces.
 * @return The family's name, or null when the face is not in a family.
 */
export function familyNameFor(root: string, rel: string): string | null {
  const family = familyFolder(root, rel);
  if (!family) {
    return null;
  }
  const name = familySetting(family) || path.basename(path.resolve(family));
  // the name goes into the generated wscript as a string and into the sandbox as a folder, so a quote,
  // a backslash, or a control character would break the one, and a slash or .. would stage the family's
  // C outside the other. any leading dot is refused, which takes in .. along with it. anything else a
  // folder can be named builds
  // eslint-disable-next-line no-control-regex
  if (!name || name.startsWith('.') || /["'\\/\x00-\x1f]/.test(name)) {
    throw new ToolError(`the family name "${name}" cannot start with a dot or hold a quote, a slash, or a backslash. Set "framework": { "family": "<name>" } in ${path.join(family, 'package.json')}`);
  }
  return name;
}

/** The name a family's package.json gives it, or null when it gives none or has no package.json. */
function familySetting(family: string): string | null {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(family, 'package.json'), 'utf8'));
    return typeof pkg.framework?.family === 'string' && pkg.framework.family ? pkg.framework.family : null;
  } catch {
    return null;
  }
}

/** The folder holding a face's family core, which is the root for a face beside a core/ there. */
function familyFolder(root: string, rel: string): string | null {
  return rel !== '.' && !rel.includes('/') && fs.existsSync(path.join(root, 'core')) ? root : null;
}

// the faces do not move while a tool runs, and one build asks for them several times over
let workspaceFaces: Face[] | null = null;

/**
 * Every face in the repo mounting the framework. A framework checked out on its own holds none.
 *
 * The lookup runs once per process and the answer is kept, so a tool that asks for a face by name
 * again and again reads the folders only once.
 */
function listFaces(): Face[] {
  requireMounted();
  if (!workspaceFaces) {
    workspaceFaces = findFaces(WORKSPACE);
  }
  return workspaceFaces;
}

/**
 * Every face's name, the handle the build, the CI matrix and release tags use.
 *
 * @return Every face's name, ordered by name.
 */
export function listFaceNames(): string[] {
  return listFaces().map((face) => face.name);
}

/**
 * Stops a tool that works on a unit's faces when no unit mounts the framework.
 *
 * The framework on its own holds no faces, so without this a unit that does not list paf in its
 * workspaces would be told it has no faces, or no such face, when its faces are right there.
 *
 * @param mounted Whether a unit mounts the framework, which a spec passes in.
 */
export function requireMounted(mounted: boolean = MOUNTED): void {
  if (!mounted) {
    throw new ToolError("No unit with faces mounts this framework. List paf and paf/plugins/* in the unit's package.json workspaces, and check each face is a folder holding config/pebble.appinfo.json, at the unit's root or beside the core/ of a family there.");
  }
}

/**
 * A face's directory relative to the repo root, by name. Throws when there is no such face.
 *
 * @param face The face's name.
 * @return Its directory relative to the repo root.
 */
export function faceRelative(face: string): string {
  const match = listFaces().find((entry) => entry.name === face);
  if (!match) {
    throw new ToolError(`no such face: ${face} (no ${APPINFO_REL} at the repo root or beside a family core names it)`);
  }
  return match.rel;
}

/**
 * A face's absolute source directory, by name.
 *
 * @param face The face's name.
 * @return Its absolute source directory.
 */
export function faceDir(face: string): string {
  return path.join(WORKSPACE, faceRelative(face));
}

/**
 * A face's config/pebble.appinfo.json, by name.
 *
 * @param face The face's name.
 * @return The appinfo's absolute path.
 */
export function appinfoPath(face: string): string {
  return path.join(faceDir(face), APPINFO_REL);
}

/**
 * A face's family core directory, or null for a face that belongs to no family.
 *
 * @param face The face's name.
 * @return Its family core's absolute directory, or null when it belongs to no family.
 */
export function familyCoreDir(face: string): string | null {
  return familyCoreFor(WORKSPACE, faceRelative(face));
}
