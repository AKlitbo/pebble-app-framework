/**
 * Checks that every face's committed theme-preview assets match its manifest and pictures.
 *
 * A re-shot screenshot or an edited manifest without a `paf gen <face> theme-previews` run ships a
 * picker showing old pictures. That holds for the main theme-previews.g.js and for each named map's
 * theme-previews-<name>.g.js alike. A path that is missing or is not a PNG means the manifest and the
 * files on disk disagree. A face that commits an asset no map in its manifest builds is reported too,
 * whether the manifest is gone or only the map, since the face would still ship it.
 *
 * paf check runs this from the unit when it lists the thumbnails plugin.
 */
import fs from 'node:fs';
import { checkFace, runCheck } from '../../tools/shared/checks.ts';
import { committedOutNames, encodePreviews, manifestFile, outFile, outName } from './embed-theme-previews.ts';
import { readText } from '../../tools/shared/files.ts';
import { listFaceNames } from '../../tools/shared/faces.ts';
import { isMainScript } from '../../tools/shared/entry.ts';

/**
 * Every face whose theme-preview assets are stale or disagree with its manifest.
 *
 * @return One line per problem, empty when every face is current.
 */
export async function checkThemePreviews(): Promise<string[]> {
  const problems: string[] = [];

  for (const face of listFaceNames()) {
    await checkFace(face, problems, () => {
      const committed = committedOutNames(face);

      if (!fs.existsSync(manifestFile(face))) {
        for (const name of committed) {
          problems.push(`${face}: commits ${name}, but has no resources/theme-previews.json to build it from`);
        }

        return;
      }

      const built = encodePreviews(face);
      const builtNames = built.files.map((one) => outName(one.name));

      // a map taken out of the manifest leaves its asset shipping with the face, so name it whatever
      // else the run finds
      for (const name of committed.filter((one) => builtNames.indexOf(one) === -1)) {
        problems.push(`${face}: commits ${name}, but resources/theme-previews.json has no map that builds it, so delete it or put its map back`);
      }

      // a missing or non-PNG path also makes a committed file differ from what would be written, so
      // report those on their own rather than adding a stale line for the same root cause
      if (built.problems.length) {
        for (const problem of built.problems) {
          problems.push(`${face}: ${problem}`);
        }

        return;
      }

      for (const one of built.files) {
        const out = outFile(face, one.name);
        const current = fs.existsSync(out) ? readText(out) : null;

        if (current !== one.source) {
          problems.push(`${face}: ${outName(one.name)} is stale, run paf gen ${face} theme-previews`);
        }
      }
    });
  }

  return problems;
}

if (isMainScript(import.meta)) {
  runCheck('theme previews', checkThemePreviews);
}
