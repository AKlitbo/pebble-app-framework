/**
 * Checks that every face's committed Clay components match what the Clay generator would write now.
 *
 * A piece edit without a `paf gen <face> clay` run ships a settings page that ignores the change. Faces are found
 * by their builder manifests, and a face that commits a component the manifests do not account for
 * is reported too, whether it has no manifests or one was renamed, so a lookup that quietly misses a
 * face cannot pass and a dead component cannot ship.
 *
 * paf check runs this from the unit.
 */
import fs from 'node:fs';
import path from 'node:path';
import { faceDir, listFaceNames } from '../shared/faces.ts';
import { checkFace, runCheck } from '../shared/checks.ts';
import { buildComponentSource, findManifests, rootsFor } from './generate-components.ts';
import { readText } from '../shared/files.ts';
import { isMainScript } from '../shared/entry.ts';

/** Every bundled component a face commits, by its full path, found by its output rather than its manifests. */
function committedComponents(face: string): string[] {
  const clayDir = path.join(faceDir(face), 'src', 'pkjs', 'clay');
  if (!fs.existsSync(clayDir)) {
    return [];
  }
  return fs.readdirSync(clayDir).filter((name) => name.endsWith('-component.g.js')).map((name) => path.resolve(clayDir, name));
}

/** A path inside a face, from the face's folder and with forward slashes, for a problem line. */
function faceRel(face: string, file: string): string {
  return path.relative(faceDir(face), file).split(path.sep).join('/');
}

/**
 * Every stale or unaccounted-for Clay component across the unit's faces.
 *
 * @return One line per problem, empty when every face is current.
 */
export async function checkComponents(): Promise<string[]> {
  const problems: string[] = [];

  for (const face of listFaceNames()) {
    await checkFace(face, problems, async () => {
      const roots = rootsFor(face);
      const written = new Set<string>();

      for (const manifestPath of findManifests(roots)) {
        const built = await buildComponentSource(manifestPath, roots);
        written.add(path.resolve(built.output));
        const committed = fs.existsSync(built.output) ? readText(built.output) : null;
        if (committed !== built.source) {
          problems.push(`${face}: ${faceRel(face, built.output)} is stale, run paf gen ${face} clay`);
        }
      }

      // the pkjs build copies every *.g.js under src/pkjs, so a component no manifest writes any
      // more still ships. a renamed or dropped manifest leaves one behind
      for (const file of committedComponents(face)) {
        if (!written.has(file)) {
          problems.push(`${face}: ${faceRel(face, file)} is written by no builder manifest, so delete it or bring its manifest back`);
        }
      }
    });
  }

  return problems;
}

if (isMainScript(import.meta)) {
  runCheck('Clay components', checkComponents);
}
