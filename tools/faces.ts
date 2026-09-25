/**
 * Finding a face's source directory.
 *
 * A face is a directory holding config/pebble.appinfo.json, and it sits in one of three places:
 *
 *   - the repo root itself, in a repo that holds a single face
 *   - straight under watchfaces/, in a repo of several
 *   - one level deeper inside a family folder that also holds the code those faces share
 *     (watchfaces/sketchbook/{core,ridgeline,...})
 *
 * A family's core/ carries no appinfo, which is what keeps it from being mistaken for a face, and
 * nothing has to be registered anywhere.
 *
 * A face's name is unique across the repo, and everything downstream (targets/<face>/, the CI
 * matrix, release tags) keys off it. Under watchfaces/ the name is the folder's. At the repo root
 * it is the appinfo's, because the root folder is named after wherever the repo was cloned.
 */
import fs from 'fs';
import path from 'path';
import { APPINFO_REL, WORKSPACE } from './paths.ts';

/** Whether a directory is a face rather than, say, a family's shared core. */
function isFace(dir: string): boolean {
  return fs.existsSync(path.join(dir, APPINFO_REL));
}

/** One face: its name, and its directory relative to the repo root (`.` for a face at the root). */
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
 * A face's name is its build target, its sandbox under targets/, and its release tag, so two faces
 * with the same name are refused rather than left for the lookup to pick one of them.
 *
 * @param root The repo root to search from.
 * @return Every face found, ordered by name.
 */
export function findFaces(root: string): Face[] {
  const found: Face[] = [];

  if (isFace(root)) {
    const appinfo = JSON.parse(fs.readFileSync(path.join(root, APPINFO_REL), 'utf8'));
    if (!appinfo.name) {
      throw new Error(`the face at the repo root needs a name in its ${APPINFO_REL}`);
    }
    found.push({ name: appinfo.name, rel: '.' });
  }

  const watchfaces = path.join(root, 'watchfaces');
  if (!fs.existsSync(watchfaces)) {
    return found.sort(byName);
  }

  for (const entry of fs.readdirSync(watchfaces, { withFileTypes: true })) {
    if (!entry.isDirectory()) {
      continue;
    }

    if (isFace(path.join(watchfaces, entry.name))) {
      found.push({ name: entry.name, rel: `watchfaces/${entry.name}` });
      continue;
    }

    // a family folder: its faces are the children that carry an appinfo
    for (const child of fs.readdirSync(path.join(watchfaces, entry.name), { withFileTypes: true })) {
      if (child.isDirectory() && isFace(path.join(watchfaces, entry.name, child.name))) {
        found.push({ name: child.name, rel: `watchfaces/${entry.name}/${child.name}` });
      }
    }
  }

  const seen = new Map<string, string>();
  for (const face of found) {
    const first = seen.get(face.name);
    if (first !== undefined) {
      throw new Error(`two faces are named "${face.name}", at ${first} and ${face.rel}. A face's name has to be unique in the repo`);
    }
    seen.set(face.name, face.rel);
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
  const parts = rel.split('/');

  // only watchfaces/<family>/<face> sits in a family
  if (parts.length !== 3) {
    return null;
  }

  const core = path.join(root, parts[0], parts[1], 'core');
  return fs.existsSync(core) ? core : null;
}

// the faces do not move while a tool runs, and one build asks for them several times over
let workspaceFaces: Face[] | null = null;

/**
 * Every face in the repo mounting the framework. A framework checked out on its own holds none.
 *
 * The lookup runs once per process and the answer is kept, so a tool that asks for a face by name
 * again and again walks watchfaces/ only once.
 *
 * @return Every face found, ordered by name.
 */
export function listFaces(): Face[] {
  if (!workspaceFaces) {
    workspaceFaces = findFaces(WORKSPACE);
  }
  return workspaceFaces;
}

/**
 * Every face's name, the handle the build, the CI matrix and release tags use.
 *
 * @return Every face's name, ordered the same way as listFaces.
 */
export function listFaceNames(): string[] {
  return listFaces().map((face) => face.name);
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
    throw new Error(`no such face: ${face} (no ${APPINFO_REL} at the repo root or under watchfaces/ names it)`);
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
