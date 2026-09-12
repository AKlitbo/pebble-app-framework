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
import { WORKSPACE } from './paths.ts';

const APPINFO = path.join('config', 'pebble.appinfo.json');

/** Whether a directory is a face rather than, say, a family's shared core. */
function isFace(dir: string): boolean {
  return fs.existsSync(path.join(dir, APPINFO));
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
 * repo mounting the engine.
 */
export function findFaces(root: string): Face[] {
  const found: Face[] = [];

  if (isFace(root)) {
    const appinfo = JSON.parse(fs.readFileSync(path.join(root, APPINFO), 'utf8'));
    if (!appinfo.name) {
      throw new Error(`the face at the repo root needs a name in its ${APPINFO}`);
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

  return found.sort(byName);
}

/**
 * The family core beside a face, or null for a face in no family.
 *
 * Nothing declares it: a face nested beside a core/ is in that family, the same positional rule
 * the C build follows. The core mirrors a face's own src/, so core/pkjs sits where the face has
 * src/pkjs, which is what lets a lookup fall back from one to the other by swapping the root.
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

/** Every face in the repo mounting the engine. An engine checked out on its own holds none. */
export function listFaces(): Face[] {
  return findFaces(WORKSPACE);
}

/** Every face's name, the handle the build, the CI matrix and release tags use. */
export function listFaceNames(): string[] {
  return listFaces().map((face) => face.name);
}

/** A face's directory relative to the repo root, by name. Throws when there is no such face. */
export function faceRelative(face: string): string {
  const match = listFaces().find((entry) => entry.name === face);
  if (!match) {
    throw new Error(`no such face: ${face} (no ${APPINFO} at the repo root or under watchfaces/ names it)`);
  }
  return match.rel;
}

/** A face's absolute source directory, by name. */
export function faceDir(face: string): string {
  return path.join(WORKSPACE, faceRelative(face));
}

/** A face's family core directory, or null for a face that belongs to no family. */
export function familyCoreDir(face: string): string | null {
  return familyCoreFor(WORKSPACE, faceRelative(face));
}
